using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.Beacon.Windows.Recording
{
    // Explicitly started local session. The existing OwnedOutputTap is the only
    // render callback queue; its consumer performs owned WAV writes. This worker
    // owns diagnostics, loopback writes and finalization after both producers stop.
    public sealed class RecordingSession:ILocalOwnedPcmSink,IDisposable
    {
        internal const int PacketCapacity=16,MaximumPacketFrames=8192,MaximumPacketBytes=262144;
        sealed class Packet {internal readonly byte[] Data=new byte[MaximumPacketBytes];internal int Bytes,Frames;internal uint Flags;internal ulong DeviceFrame,Qpc100ns;internal long Before,After;}
        readonly RecordingReadiness readiness;readonly RecordingOptions options;readonly string directory;
        readonly Thread worker;readonly ManualResetEvent ready=new ManualResetEvent(false),completed=new ManualResetEvent(false);
        readonly ConcurrentQueue<string> diagnostics=new ConcurrentQueue<string>();int diagnosticCount;
        readonly long startTicks=Stopwatch.GetTimestamp();readonly long deadline;
        readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=16};
        readonly object jsonLock=new object();readonly FileStream lease;
        readonly object loopbackLifecycle=new object();
        readonly object diagnosticAdmission=new object();
        LosslessWaveWriter owned,loopback;FileStream ownedIndex,loopbackIndex,eventFile;
        OwnedOutputTap tap;StreamingLoopback backend;
        Packet[] packets;int packetWrite,packetRead,packetInFlight;byte[] loopbackFormat;string endpointId;
        int accepting=1,attached,ownedDone=1,loopbackDone=1,abandoned,finalizing,disposed;long reserved=65536,ownedFrames,loopbackFrames,expectedOwned=-1,cutoffFrames;
        string stopReason,failure;bool endpointOpened;RecordingSnapshot snapshot;
        public string RecordingId {get;private set;}
        public bool Accepting {get{return Volatile.Read(ref accepting)!=0&&Stopwatch.GetTimestamp()<deadline;}}
        public RecordingSnapshot Snapshot {get{return Volatile.Read(ref snapshot);}}
        internal string DirectoryPath {get{return directory;}}
        internal long DeadlineTicks {get{return deadline;}}
        internal bool FixtureOnly {get{return readiness.FixtureOnly;}}
        private RecordingSession(string dir,FileStream owner,RecordingOptions limits,RecordingReadiness capability)
        {directory=dir;lease=owner;options=limits;readiness=capability;RecordingId=Path.GetFileName(dir);deadline=startTicks+checked(Stopwatch.Frequency*limits.Seconds);snapshot=new RecordingSnapshot("starting",null,RecordingId,0,0,0,false,false);worker=new Thread(Run){IsBackground=true,Name="RichAudio recording session writer"};worker.Start();}
        static void CheckParents(string target){for(string at=target;!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))if(Directory.Exists(at)&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked recording parent");}
        public static bool TryCreate(string workspace,RecordingOptions options,RecordingReadiness readiness,out RecordingSession session,out string reason)
        {
            session=null;reason=null;
            if(readiness==null||!readiness.CoreAllowed){reason="recording-acceptance-gates-incomplete";return false;}
            if(options==null){reason="recording-options-required";return false;}
            FileStream lease=null;
            try{
                string workspaceRoot=Path.GetFullPath(workspace),root=Path.Combine(workspaceRoot,".local","recordings","audio-tests");CheckParents(root);Directory.CreateDirectory(root);CheckParents(root);
                string lockPath=Path.Combine(root,"capture.lock");if(File.Exists(lockPath)&&(File.GetAttributes(lockPath)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked recording lease");
                lease=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
                string[] sessions=Directory.GetDirectories(root);if(sessions.Length>=128)throw new IOException("Recording count cap; explicit archival required");
                long usage=0;foreach(string item in sessions){if((File.GetAttributes(item)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked recording session");string[] files=Directory.GetFiles(item);if(files.Length>8)throw new IOException("Recording directory bound");foreach(string file in files){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked recording file");usage=checked(usage+new FileInfo(file).Length);}}
                if(usage+options.MaximumBytes>1073741824L)throw new IOException("Private recording storage cap");
                var drive=new DriveInfo(Path.GetPathRoot(root));if(drive.AvailableFreeSpace<options.MaximumBytes+16777216)throw new IOException("Insufficient recording disk reserve");
                string directory=Path.Combine(root,"capture-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);CheckParents(directory);
                var created=new RecordingSession(directory,lease,options,readiness);lease=null;
                if(!created.ready.WaitOne(3000)||created.failure!=null){created.RequestStop();reason=created.failure??"recording-start-timeout";created.Dispose();return false;}
                session=created;return true;
            }catch(Exception error){if(lease!=null)lease.Dispose();reason=error.GetType().Name+": "+error.Message;return false;}
        }
        public OwnedOutputTap CreateOwnedTap()
        {if(!Accepting||Interlocked.CompareExchange(ref attached,1,0)!=0)throw new InvalidOperationException("One explicitly started owned tap per session");Volatile.Write(ref ownedDone,0);try{tap=OwnedOutputTap.ForLocalSink(this);return tap;}catch{Volatile.Write(ref ownedDone,1);Fault("owned-tap-start-failed");throw;}}
        string Json(object value){lock(jsonLock)return json.Serialize(value);}
        bool Reserve(int bytes){for(;;){long at=Interlocked.Read(ref reserved);if(bytes<0||at+bytes>options.MaximumBytes){Fault("recording-byte-limit");return false;}if(Interlocked.CompareExchange(ref reserved,at+bytes,at)==at)return true;}}
        void Text(FileStream output,string line){byte[] bytes=Encoding.UTF8.GetBytes(line+"\n");if(bytes.Length>4096)throw new InvalidDataException("Diagnostic row bound");if(!Reserve(bytes.Length))throw new IOException("Recording byte limit");output.Write(bytes,0,bytes.Length);}
        public void WriteOwned(float[] samples,int frames,long submitted,long consumed,long producer,int supplied,long preparedBefore,long copiedAfter,long committedAfter,long underflow,long endSilence)
        {
            if(frames<1||frames>2048||preparedBefore>copiedAfter||copiedAfter>committedAfter)throw new InvalidDataException("Owned submission contract");
            if(preparedBefore>=deadline){Interlocked.Add(ref cutoffFrames,frames);RequestStop("duration-limit");return;}
            if(expectedOwned>=0&&submitted!=expectedOwned)throw new InvalidDataException("Missing owned submission; no gap padding");
            int retained=(int)Math.Min(frames,options.Seconds*48000L-ownedFrames);if(retained<=0){RequestStop("frame-limit");return;}
            var bytes=new byte[retained*8];Buffer.BlockCopy(samples,0,bytes,0,bytes.Length);
            if(!Reserve(bytes.Length))return;
            owned.Write(bytes,bytes.Length);
            Text(ownedIndex,Json(new{type="owned-submission",submittedFrame=submitted,consumedFrame=consumed,producerFrameStart=producer,suppliedFrames=supplied,frames=retained,originalFrames=frames,cutoffFrames=frames-retained,preparedBeforeQpc=preparedBefore,copiedAfterQpc=copiedAfter,committedAfterQpc=committedAfter,underflowFrames=underflow,endSilenceFrames=endSilence,clockDomain="host-Stopwatch-QPC",qpcFrequency=Stopwatch.Frequency}));
            ownedFrames+=retained;expectedOwned=submitted+frames;
            if(underflow!=0)Fault("playback-underflow-recorded");
            if(retained!=frames){Interlocked.Add(ref cutoffFrames,frames-retained);RequestStop("frame-limit");}
        }
        public void OwnedStopped(long droppedFrames,long queuedTail,bool quiescent,string error)
        {if(error!=null||droppedFrames!=0||queuedTail!=0||!quiescent)Fault(error??"owned-capture-incomplete");Volatile.Write(ref ownedDone,1);RequestStop(stopReason??"owned-tap-stopped");ScheduleFinalization();}
        public bool TryDiagnostic(string kind,string sourceClockDomain,long sourceTicks,long sourceFrequency,string payloadJson)
        {return TryDiagnosticCore(kind,sourceClockDomain,sourceTicks,sourceFrequency,payloadJson,null);}
        internal bool TryDiagnosticCore(string kind,string sourceClockDomain,long sourceTicks,long sourceFrequency,string payloadJson,Action beforeAdmission,Action whileAdmitted=null)
        {
            if(!Accepting||String.IsNullOrEmpty(kind)||kind.Length>64||String.IsNullOrEmpty(sourceClockDomain)||sourceClockDomain.Length>96||payloadJson==null||payloadJson.Length>2048||sourceFrequency<=0)return false;
            // Called on an existing host/IPC control worker, never on a game or
            // audio callback. Parsing and allocation are deliberately outside it.
            object payload;try{lock(jsonLock)payload=json.DeserializeObject(payloadJson);}catch{return false;}
            string row=Json(new{type=kind,receivedHostQpc=Stopwatch.GetTimestamp(),hostQpcFrequency=Stopwatch.Frequency,sourceClockDomain=sourceClockDomain,sourceTicks=sourceTicks,sourceFrequency=sourceFrequency,clockMapping=(object)null,payload=payload});
            if(beforeAdmission!=null)beforeAdmission();
            lock(diagnosticAdmission){if(!Accepting)return false;if(whileAdmitted!=null)whileAdmitted();if(Interlocked.Increment(ref diagnosticCount)>128){Interlocked.Decrement(ref diagnosticCount);Fault("diagnostic-queue-overflow");return false;}diagnostics.Enqueue(row);return true;}
        }
        public bool StartLoopback(string selectedOutputEndpointId,out string reason)
        {
            reason=null;if(!Accepting||readiness.FixtureOnly||!readiness.LoopbackExplicitlyApproved){reason="loopback-activation-not-approved";return false;}
            return StartLoopbackCore(selectedOutputEndpointId,null,out reason);
        }
        internal bool StartFixtureLoopback(ILoopbackDriver driver,out string reason){if(!readiness.FixtureOnly||driver==null||!driver.DeviceFree)throw new InvalidOperationException("Device-free driver required");return StartLoopbackCore("fixture-not-a-device",driver,out reason);}
        bool StartLoopbackCore(string selectedOutputEndpointId,ILoopbackDriver driver,out string reason)
        {lock(loopbackLifecycle){reason=null;if(!Accepting||Volatile.Read(ref disposed)!=0||String.IsNullOrEmpty(selectedOutputEndpointId)||selectedOutputEndpointId.Length>1024||backend!=null){reason="recording-stopped-or-endpoint-unavailable";return false;}try{Volatile.Write(ref loopbackDone,0);backend=new StreamingLoopback(this,selectedOutputEndpointId,driver);backend.Start();return true;}catch(Exception error){Volatile.Write(ref loopbackDone,1);reason=error.GetType().Name;Fault("loopback-start-failed");return false;}}}
        internal void SetLoopbackFormat(byte[] format,string selectedEndpoint)
        {if(loopbackFormat!=null)throw new InvalidOperationException("Loopback cannot rebind");packets=new Packet[PacketCapacity];for(int i=0;i<packets.Length;i++)packets[i]=new Packet();endpointId=selectedEndpoint;Volatile.Write(ref loopbackFormat,(byte[])format.Clone());}
        internal unsafe int PrepareLoopback(IntPtr data,int frames,int bytes,uint flags,ulong deviceFrame,ulong qpc100ns,long before,long after)
        {
            if(!Accepting)return -1;
            if(frames<1||frames>MaximumPacketFrames||bytes<1||bytes>MaximumPacketBytes||before>after||data==IntPtr.Zero&&(flags&2)==0||loopbackFormat==null||bytes!=frames*BitConverter.ToUInt16(loopbackFormat,12)){Fault("loopback-packet-bound");return -1;}
            int w=packetWrite;if(w-Volatile.Read(ref packetRead)>=PacketCapacity){Fault("loopback-queue-overflow");return -1;}
            Interlocked.Increment(ref packetInFlight);var packet=packets[w%PacketCapacity];
            byte* source=(byte*)data;for(int i=0;i<bytes;i++)packet.Data[i]=(flags&2)!=0?(byte)0:source[i];
            packet.Frames=frames;packet.Bytes=bytes;packet.Flags=flags;packet.DeviceFrame=deviceFrame;packet.Qpc100ns=qpc100ns;packet.Before=before;packet.After=after;return w;
        }
        internal void CommitLoopback(int slot){if(slot<0)return;Volatile.Write(ref packetWrite,slot+1);Interlocked.Decrement(ref packetInFlight);}
        internal void CancelLoopback(int slot){if(slot>=0)Interlocked.Decrement(ref packetInFlight);Fault("loopback-release-failed");}
        internal void LoopbackStopped(string error){if(error!=null)Fault(error);Volatile.Write(ref loopbackDone,1);RequestStop(stopReason??"loopback-stopped");ScheduleFinalization();}
        internal void MarkEndpointOpened(){endpointOpened=true;}
        internal void Fault(string error){Interlocked.CompareExchange(ref failure,error,null);RequestStop("capture-fault");}
        public void RequestStop(){RequestStop("user-stop");}
        void RequestStop(string reason){lock(diagnosticAdmission){if(reason!="capture-fault"&&Stopwatch.GetTimestamp()>=deadline)reason="duration-limit";Interlocked.CompareExchange(ref stopReason,reason,null);Volatile.Write(ref accepting,0);}}
        FileStream New(string name){return new FileStream(Path.Combine(directory,name),FileMode.CreateNew,FileAccess.Write,FileShare.Read,65536,FileOptions.SequentialScan);}
        void Publish(string state,bool complete=false){Volatile.Write(ref snapshot,new RecordingSnapshot(state,failure??stopReason,RecordingId,Interlocked.Read(ref ownedFrames),Interlocked.Read(ref loopbackFrames),Interlocked.Read(ref reserved),complete,endpointOpened));}
        void Run()
        {
            try{
                if(!Reserve(256))throw new IOException("Header budget");
                owned=new LosslessWaveWriter(New("richaudio.wav"),LosslessWaveWriter.FloatStereo());ownedIndex=New("owned-index.ndjson");eventFile=New("diagnostics.ndjson");
                ready.Set();Publish("recording");ulong nextDeviceFrame=0;bool haveDevice=false;long stoppingAt=0;
                while(true){
                    if(Stopwatch.GetTimestamp()>=deadline)RequestStop("duration-limit");
                    var format=Volatile.Read(ref loopbackFormat);if(format!=null&&loopback==null){loopback=new LosslessWaveWriter(New("loopback.wav"),format);loopbackIndex=New("loopback-index.ndjson");if(!Reserve(256))break;}
                    string diagnostic;while(diagnostics.TryDequeue(out diagnostic)){Interlocked.Decrement(ref diagnosticCount);Text(eventFile,diagnostic);}
                    int r=packetRead;while(r<Volatile.Read(ref packetWrite)){
                        var packet=packets[r%PacketCapacity];if(!Reserve(packet.Bytes)){Volatile.Write(ref packetRead,Volatile.Read(ref packetWrite));break;}
                        loopback.Write(packet.Data,packet.Bytes);
                        Text(loopbackIndex,Json(new{type="loopback-packet",frames=packet.Frames,deviceFrame=packet.DeviceFrame,deviceQpc100ns=packet.Qpc100ns,flags=packet.Flags,hostGetBufferBeforeQpc=packet.Before,hostGetBufferAfterQpc=packet.After,hostQpcFrequency=Stopwatch.Frequency,missingDeviceFrames=haveDevice&&packet.DeviceFrame>nextDeviceFrame?packet.DeviceFrame-nextDeviceFrame:0,clockDomain="WASAPI-QPC-100ns",timestampValid=(packet.Flags&4)==0}));
                        if((packet.Flags&5)!=0||haveDevice&&packet.DeviceFrame!=nextDeviceFrame)Fault("loopback-discontinuity-or-timestamp-error");
                        nextDeviceFrame=packet.DeviceFrame+(ulong)packet.Frames;haveDevice=true;loopbackFrames+=packet.Frames;Volatile.Write(ref packetRead,++r);
                    }
                    // Only the sealed flag (set under diagnosticAdmission) can
                    // authorize final drain. A clock-only expiry can race a
                    // caller admitted immediately before the deadline.
                    if(Volatile.Read(ref accepting)==0&&Volatile.Read(ref ownedDone)!=0&&Volatile.Read(ref loopbackDone)!=0&&packetRead==Volatile.Read(ref packetWrite)&&Volatile.Read(ref packetInFlight)==0&&diagnostics.IsEmpty)break;
                    if(!Accepting){if(stoppingAt==0)stoppingAt=Stopwatch.GetTimestamp();if(Stopwatch.GetTimestamp()-stoppingAt>3*Stopwatch.Frequency){Fault("producer-stop-timeout; handles retained until producer completion");break;}}
                    Publish(Accepting?"recording":"stopping");Thread.Sleep(2);
                }
            }catch(Exception error){Fault(error.GetType().Name+": "+error.Message);}
            finally{ready.Set();Volatile.Write(ref abandoned,1);Publish("stopping");ScheduleFinalization();}
        }
        void ScheduleFinalization()
        {
            if(Volatile.Read(ref abandoned)==0||Volatile.Read(ref ownedDone)==0||Volatile.Read(ref loopbackDone)==0||Interlocked.CompareExchange(ref finalizing,1,0)!=0)return;
            ThreadPool.QueueUserWorkItem(delegate{FinalizeSession();});
        }
        void FinalizeSession()
        {
                foreach(var wave in new[]{owned,loopback})try{if(wave!=null)wave.Dispose();}catch(Exception error){Interlocked.CompareExchange(ref failure,"WAV-finalization: "+error.GetType().Name,null);}
                foreach(var file in new[]{ownedIndex,loopbackIndex,eventFile})try{if(file!=null)try{file.Flush(true);}finally{file.Dispose();}}catch(Exception error){Interlocked.CompareExchange(ref failure,"index-finalization: "+error.GetType().Name,null);}
                bool complete=failure==null&&ownedFrames>0&&(backend==null||loopbackFrames>0)&&Volatile.Read(ref ownedDone)!=0&&Volatile.Read(ref loopbackDone)!=0;
                try{
                    var files=new List<object>();long actual=0;foreach(string file in Directory.GetFiles(directory)){long length=new FileInfo(file).Length;actual+=length;using(var digest=SHA256.Create())using(var input=File.OpenRead(file))files.Add(new{file=Path.GetFileName(file),bytes=length,sha256=BitConverter.ToString(digest.ComputeHash(input)).Replace("-","").ToLowerInvariant()});}
                    string manifest=Json(new{schema=1,recordingId=RecordingId,origin=readiness.FixtureOnly?"offline-fixture":"explicit-approved-production",state=complete?"stopped":"failed",complete=complete,reason=failure??stopReason,maximumSeconds=options.Seconds,maximumBytes=options.MaximumBytes,ownedFrames=ownedFrames,loopbackFrames=loopbackFrames,cutoffFrames=cutoffFrames,endpointOpened=endpointOpened,selectedEndpointId=endpointId,hostClockDomain="host-Stopwatch-QPC",hostQpcFrequency=Stopwatch.Frequency,hostStartQpc=startTicks,hostEndQpc=Stopwatch.GetTimestamp(),sampleFormat="owned Float32 stereo 48000; loopback exact endpoint mix format",clockAlignment="Submission QPC is not speaker time. WASAPI packet QPC uses 100 ns units. Source clocks need explicit measured anchors; no common origin assumed.",gameOrVehicleAudioVerified=false,physicalAcousticsCaptured=false,files=files});
                    byte[] bytes=Encoding.UTF8.GetBytes(manifest);if(bytes.Length>65536||actual+bytes.Length>options.MaximumBytes)throw new IOException("Final manifest budget");using(var output=New("session.json")){output.Write(bytes,0,bytes.Length);output.Flush(true);}
                }catch(Exception error){complete=false;Interlocked.CompareExchange(ref failure,"manifest: "+error.GetType().Name,null);}
                Publish(complete?"stopped":"failed",complete);try{lease.Dispose();}finally{completed.Set();}
        }
        public bool WaitForCompletion(int milliseconds){if(milliseconds<0||milliseconds>5000)throw new ArgumentOutOfRangeException("milliseconds");return completed.WaitOne(milliseconds);}
        public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;RequestStop();if(tap!=null)tap.Dispose();StreamingLoopback ownedBackend;lock(loopbackLifecycle)ownedBackend=backend;if(ownedBackend!=null)ownedBackend.Dispose();if(!completed.WaitOne(3000)){Interlocked.CompareExchange(ref failure,"writer-stop-timeout; background writer retains resources",null);Publish("stopping");}else{ready.Dispose();completed.Dispose();}}
    }
}
