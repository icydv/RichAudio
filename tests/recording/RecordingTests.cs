using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
using RichAudio.Beacon.Windows.Recording;

public static class RecordingTests
{
    static int checks;static readonly JavaScriptSerializer json=new JavaScriptSerializer();
    static void Need(bool value,string why){checks++;if(!value)throw new Exception(why);}
    static void Throws(Action action,string why){bool threw=false;try{action();}catch{threw=true;}Need(threw,why);}
    static void Wait(Func<bool> predicate,string why){var clock=Stopwatch.StartNew();while(!predicate()&&clock.ElapsedMilliseconds<4000)Thread.Sleep(2);Need(predicate(),why);}
    sealed class Renderer:IAudioRenderClient,IDisposable
    {
        internal readonly List<byte> Submitted=new List<byte>();IntPtr memory;internal bool Fail;internal Action OnRelease;int frames;
        public int GetBuffer(uint n,out IntPtr data){frames=(int)n;memory=Marshal.AllocHGlobal(frames*8);data=memory;return 0;}
        public int ReleaseBuffer(uint n,uint flags){var bytes=new byte[frames*8];Marshal.Copy(memory,bytes,0,bytes.Length);Marshal.FreeHGlobal(memory);memory=IntPtr.Zero;if(OnRelease!=null)OnRelease();if(Fail)return unchecked((int)0x80004005);Submitted.AddRange(bytes);return 0;}
        public void Dispose(){if(memory!=IntPtr.Zero)Marshal.FreeHGlobal(memory);}
    }
    static void Fill(WasapiOutput output,Renderer renderer,int frames){typeof(WasapiOutput).GetMethod("Fill",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(output,new object[]{renderer,(uint)frames});}
    static RecordingSession Session(string root,string name,RecordingOptions options=null){RecordingSession session;string reason;Need(RecordingSession.TryCreate(Path.Combine(root,name),options??new RecordingOptions(120),RecordingReadiness.Fixture(),out session,out reason),"Fixture session starts: "+reason);return session;}
    static byte[] Data(string path){using(var input=new BinaryReader(File.OpenRead(path))){Need(Encoding.ASCII.GetString(input.ReadBytes(4))=="RIFF","RIFF");uint size=input.ReadUInt32();Need(size+8==input.BaseStream.Length,"Final RIFF size");Need(Encoding.ASCII.GetString(input.ReadBytes(4))=="WAVE","WAVE");while(input.BaseStream.Position+8<=input.BaseStream.Length){string chunk=Encoding.ASCII.GetString(input.ReadBytes(4));uint length=input.ReadUInt32();byte[] bytes=input.ReadBytes((int)length);if(chunk=="data")return bytes;if((length&1)!=0)input.ReadByte();}throw new Exception("Missing data");}}
    static Dictionary<string,object> Manifest(RecordingSession session){return json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(session.DirectoryPath,"session.json")));}
    static Dictionary<string,object>[] Packets(RecordingSession session){return File.ReadAllLines(Path.Combine(session.DirectoryPath,"loopback-index.ndjson")).Select(line=>json.Deserialize<Dictionary<string,object>>(line)).ToArray();}
    static unsafe int Packet(RecordingSession session,byte[] bytes,uint flags,ulong deviceFrame,ulong qpc){fixed(byte* p=bytes){long t=Stopwatch.GetTimestamp();int slot=session.PrepareLoopback((IntPtr)p,bytes.Length/8,bytes.Length,flags,deviceFrame,qpc,t,t);session.CommitLoopback(slot);return slot;}}
    static unsafe void Submit(OwnedOutputTap tap,float[] values,long frame){fixed(float* p=values){tap.Commit(tap.Prepare(p,values.Length/2,frame,frame+values.Length/2));}}
    sealed class BlockingSink:ILocalOwnedPcmSink
    {
        internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false),Stopped=new ManualResetEvent(false);internal string Failure;public string RecordingId{get{return "fixture-blocked";}}public bool Accepting{get{return true;}}
        public void WriteOwned(float[] a,int b,long c,long d,long e,int f,long g,long h,long i,long j,long k){Entered.Set();if(!Release.WaitOne(2000))throw new TimeoutException("Fixture block bound");}
        public void OwnedStopped(long dropped,long tail,bool quiet,string failure){Failure=failure;Stopped.Set();}
    }
    sealed class FailingStream:MemoryStream {internal bool Fail;public override void Write(byte[] b,int o,int n){if(Fail)throw new IOException("Fixture disk fault");base.Write(b,o,n);}}
    sealed class FakeDriver:ILoopbackDriver
    {
        internal readonly ManualResetEvent AtBarrier=new ManualResetEvent(false),Release=new ManualResetEvent(false);internal bool BlockBeforeStart;internal int Opens,Starts;
        public bool DeviceFree{get{return true;}}
        void Barrier(){AtBarrier.Set();if(!Release.WaitOne(2000))throw new TimeoutException("Fixture activation barrier");}
        public void BeforeActivation(){if(!BlockBeforeStart)Barrier();}
        public byte[] Open(string endpoint){Opens++;return LosslessWaveWriter.FloatStereo();}
        public void BeforeStart(){if(BlockBeforeStart)Barrier();}
        public void Start(){Starts++;}
        public bool ReadPacket(){return false;}
        public void Dispose(){}
    }
    public static unsafe int Main(string[] args)
    {
        try{
            string root=Path.GetFullPath(args[0]);if(Directory.Exists(root))throw new IOException("Fresh fixture workspace required");
            RecordingSession disabled;string blocked;Need(!RecordingSession.TryCreate(root,new RecordingOptions(),new RecordingReadiness(),out disabled,out blocked),"Default gates reject recording");Need(!Directory.Exists(root)&&disabled==null,"Disabled constructor creates no output and opens no endpoint");
            Throws(delegate{new RecordingOptions(121);},"Duration hard cap");Throws(delegate{new RecordingOptions(1,268435457);},"Disk hard cap");
            var alignment=new ClockAlignment("fixture-independent-clock",5000,2000,1000,1200);Need(Math.Abs(alignment.HostTicks(6000)-(1100+.5*Stopwatch.Frequency))<1e-6,"Explicit clock offset and frequency mapping");Need(alignment.MinimumUncertaintyMs==100000d/Stopwatch.Frequency,"Anchor interval uncertainty retained");Throws(delegate{new ClockAlignment("x",1,0,0,1);},"Unspecified clock frequency rejected");
            using(var unopened=new WasapiOutput(new PcmRing(),-1)){Need(unopened.SelectedEndpointId==null&&!unopened.DeviceOpened,"Identity getter/constructor cannot activate endpoint");}Need(WasapiOutput.ReadSelectedIdentity(delegate{return "exact-fixture-id";})=="exact-fixture-id","Exact selected ID retained without translation");Need(WasapiOutput.ReadSelectedIdentity(delegate{throw new IOException("fixture query failure");})==null,"Unavailable ID does not change playback or fabricate a device");
            Directory.CreateDirectory(root);
            using(var session=Session(root,"exact"))using(var renderer=new Renderer())using(var output=new WasapiOutput(new PcmRing(),-1,true)){
                var ring=(PcmRing)typeof(WasapiOutput).GetField("ring",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(output);
                var samples=new float[1024];for(int i=0;i<samples.Length;i++)samples[i]=(float)(Math.Sin(i*.13)*.4);for(int i=0;i<8;i++)Need(ring.TryWrite(samples,512),"Production ring prefill");
                var tap=session.CreateOwnedTap();output.OwnedRecorder=tap;output.Muted=false;output.Volume=.5f;
                for(int i=0;i<4;i++)Fill(output,renderer,960);
                Wait(()=>session.Snapshot.OwnedFrames==3840,"Actual production Fill commits exact submissions");
                Need(session.TryDiagnostic("vehicle-state","fixture-game-relative",9000,1000,"{\"vehicle\":\"fixture-only\",\"camera\":[1,2,3]}"),"Bounded independent-clock telemetry queued");
                Need(!session.StartLoopback("not-a-real-endpoint",out blocked),"Fixture capability cannot activate endpoint");
                session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Safe off-thread finalization");
                byte[] recorded=Data(Path.Combine(session.DirectoryPath,"richaudio.wav"));Need(recorded.SequenceEqual(renderer.Submitted),"WAV bytes equal actual post-gain production renderer buffer bytes");Need(recorded.Length==3840*8,"No regenerated or padded samples");
                var manifest=Manifest(session);Need((bool)manifest["complete"]&&!(bool)manifest["endpointOpened"]&&manifest["origin"].ToString()=="offline-fixture","Truthful fixture provenance");
                var index=File.ReadAllLines(Path.Combine(session.DirectoryPath,"owned-index.ndjson")).Select(line=>json.Deserialize<Dictionary<string,object>>(line)).ToArray();Need(index.Length==4,"Every actual callback indexed");foreach(var row in index){Need(Convert.ToInt64(row["preparedBeforeQpc"])<=Convert.ToInt64(row["copiedAfterQpc"])&&Convert.ToInt64(row["copiedAfterQpc"])<=Convert.ToInt64(row["committedAfterQpc"]),"Copy/ReleaseBuffer/commit clock order");Need(Convert.ToInt64(row["underflowFrames"])==0,"No invented underflow");}
                Need(File.ReadAllText(Path.Combine(session.DirectoryPath,"diagnostics.ndjson")).Contains("\"clockMapping\":null"),"Unrelated source clock not silently aligned");Need(!output.DeviceOpened,"Actual production Fill tested without endpoint activation");
                string directory=session.DirectoryPath;session.Dispose();Need(File.Exists(Path.Combine(directory,"richaudio.wav")),"Original recordings preserved on cleanup");
            }
            using(var session=Session(root,"release-fault"))using(var renderer=new Renderer{Fail=true})using(var output=new WasapiOutput(new PcmRing(),-1,true)){
                var ring=(PcmRing)typeof(WasapiOutput).GetField("ring",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(output);ring.TryWrite(new float[1024],512);var tap=session.CreateOwnedTap();output.OwnedRecorder=tap;
                Throws(delegate{Fill(output,renderer,128);},"ReleaseBuffer failure propagates from real Fill");tap.Dispose();Need(session.WaitForCompletion(4000),"Cancelled callback terminates capture");Need(!session.Snapshot.Complete&&session.Snapshot.OwnedFrames==0,"Failed submissions never published into WAV");
            }
            foreach(bool releaseFails in new[]{false,true})using(var session=Session(root,"tap-swap-"+releaseFails))using(var renderer=new Renderer{Fail=releaseFails})using(var output=new WasapiOutput(new PcmRing(),-1,true))using(var replacement=new OwnedOutputTap()){
                var ring=(PcmRing)typeof(WasapiOutput).GetField("ring",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(output);ring.TryWrite(new float[1024],512);var original=session.CreateOwnedTap();replacement.CaptureForTest("replacement-fixture");output.OwnedRecorder=original;renderer.OnRelease=delegate{output.OwnedRecorder=replacement;};
                if(releaseFails)Throws(delegate{Fill(output,renderer,128);},"Swap plus failed release propagates");else{Fill(output,renderer,128);Wait(()=>session.Snapshot.OwnedFrames==128,"Original callback-local tap committed after swap");}
                Need(original.Quiescent&&replacement.Quiescent&&replacement.Peek()==null,"Tap swap cannot orphan or misroute a reservation");session.RequestStop();original.Dispose();Need(session.WaitForCompletion(4000),"Swapped tap finalizes safely");Need(session.Snapshot.Complete!=releaseFails,"Swap cancellation and successful commit remain distinct");
            }
            foreach(bool beforeStart in new[]{false,true})using(var session=Session(root,"activation-race-"+beforeStart)){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);var driver=new FakeDriver{BlockBeforeStart=beforeStart};Need(session.StartFixtureLoopback(driver,out blocked),"Device-free lifecycle starts");Need(driver.AtBarrier.WaitOne(1000),"Pre-activation/start barrier reached");session.RequestStop();driver.Release.Set();tap.Dispose();Need(session.WaitForCompletion(4000),"Cancelled queued initialization completes");Need(driver.Starts==0&&driver.Opens==(beforeStart?1:0),"No endpoint Open/Start after queued cancellation");Need(!session.Snapshot.EndpointOpened,"Lifecycle fixture cannot activate COM");
            }
            using(var session=Session(root,"diagnostic-race")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);var at=new ManualResetEvent(false);var release=new ManualResetEvent(false);bool accepted=true;
                var producer=new Thread(delegate(){accepted=session.TryDiagnosticCore("late-diagnostic","fixture-clock",0,1000,"{}",delegate{at.Set();release.WaitOne(2000);});});producer.Start();Need(at.WaitOne(1000),"Diagnostic paused after preparation");session.RequestStop();tap.Dispose();release.Set();Need(producer.Join(2000),"Delayed diagnostic admission returns");Need(!accepted,"Stopped session rejects a late prepared diagnostic instead of losing accepted data");Need(session.WaitForCompletion(4000),"Diagnostic-stop race completes");Need(File.ReadAllLines(Path.Combine(session.DirectoryPath,"diagnostics.ndjson")).Length==0,"No post-finalization diagnostic append");at.Dispose();release.Dispose();
            }
            using(var session=Session(root,"natural-deadline-admission",new RecordingOptions(1))){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);var at=new ManualResetEvent(false);var release=new ManualResetEvent(false);bool accepted=false;
                var producer=new Thread(delegate(){accepted=session.TryDiagnosticCore("natural-deadline-admission","fixture-clock",0,1000,"{}",null,delegate{at.Set();release.WaitOne(2500);});});producer.Start();Need(at.WaitOne(1000),"Diagnostic admitted before natural deadline");while(Stopwatch.GetTimestamp()<session.DeadlineTicks+Stopwatch.Frequency/10)Thread.Sleep(2);Need(!session.WaitForCompletion(0),"Natural expiry cannot finalize across unsealed admission");release.Set();Need(producer.Join(2000)&&accepted,"Admitted row remains accepted across deadline");tap.Dispose();Need(session.WaitForCompletion(4000),"Natural deadline drains admitted diagnostic");Need(File.ReadAllText(Path.Combine(session.DirectoryPath,"diagnostics.ndjson")).Contains("natural-deadline-admission"),"Accepted diagnostic persisted before finalization");at.Dispose();release.Dispose();
            }
            using(var session=Session(root,"loopback-packets")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);
                session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture-endpoint-not-opened");var bytes=Enumerable.Range(0,128).Select(i=>(byte)i).ToArray();
                fixed(byte* p=bytes){long t=Stopwatch.GetTimestamp();int slot=session.PrepareLoopback((IntPtr)p,16,128,0,123,456,t,t);session.CommitLoopback(slot);slot=session.PrepareLoopback(IntPtr.Zero,16,128,2,139,478,t,t);session.CommitLoopback(slot);}
                Wait(()=>session.Snapshot.LoopbackFrames==32,"Separate loopback packet queue drains off native capture thread");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Dual stream safe stop");var raw=Data(Path.Combine(session.DirectoryPath,"loopback.wav"));Need(raw.Take(128).SequenceEqual(bytes)&&raw.Skip(128).All(b=>b==0),"Endpoint bytes retained; explicit SILENT flag alone generates zeros");Need(!session.Snapshot.EndpointOpened,"Fake packets never open endpoint");Need(File.ReadAllText(Path.Combine(session.DirectoryPath,"loopback-index.ndjson")).Contains("WASAPI-QPC-100ns"),"Loopback100ns domain explicit");
            }
            using(var session=Session(root,"loopback-fault")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture-only");long t=Stopwatch.GetTimestamp();int slot=session.PrepareLoopback(IntPtr.Zero,16,128,6,0,0,t,t);session.CommitLoopback(slot);tap.Dispose();Need(session.WaitForCompletion(4000),"Timestamp fault stops safely");Need(!session.Snapshot.Complete,"Loopback timestamp error never accepted complete");
            }
            foreach(uint firstFlags in new uint[]{0,1,3})using(var session=Session(root,"sustained-startup-"+firstFlags))using(var renderer=new Renderer())using(var output=new WasapiOutput(new PcmRing(),-1,true)){
                var ring=(PcmRing)typeof(WasapiOutput).GetField("ring",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(output);var tap=session.CreateOwnedTap();output.OwnedRecorder=tap;output.Muted=false;output.Volume=.5f;
                session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture-selected-render-endpoint");var loopExpected=new List<byte>();
                for(int block=0;block<240;block++){
                    var pcm=new float[1024];for(int i=0;i<pcm.Length;i++)pcm[i]=(float)(Math.Sin((block*1024+i)*.013)*.2);Need(ring.TryWrite(pcm,512),"Sustained fixture fills existing production ring");Fill(output,renderer,512);
                    var bytes=new byte[512*8];Buffer.BlockCopy(pcm,0,bytes,0,bytes.Length);uint flags=block==0?firstFlags:0;
                    Need(Packet(session,bytes,flags,1234+(ulong)block*512,10000000+(ulong)block*106667)>=0,"Startup and subsequent bounded packets admitted");
                    loopExpected.AddRange((flags&2)!=0?new byte[bytes.Length]:bytes);long expected=(block+1)*512L;Wait(()=>session.Snapshot.OwnedFrames==expected&&session.Snapshot.LoopbackFrames==expected,"Both independent capture streams retain sustained PCM");
                }
                Need(session.Accepting&&session.LoopbackAccepting,"Valid startup discontinuity cannot stop healthy capture");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Sustained startup case finalizes");
                Need(Data(Path.Combine(session.DirectoryPath,"richaudio.wav")).SequenceEqual(renderer.Submitted),"Sustained final PCM remains bit-exact to actual post-gain host submissions");Need(Data(Path.Combine(session.DirectoryPath,"loopback.wav")).SequenceEqual(loopExpected),"Sustained endpoint bytes retain packet association including SILENT");
                var rows=Packets(session);Need(rows.Length==240&&rows.All(row=>row["integrityFault"]==null),"All sustained loopback packets indexed without fabricated faults");Need(rows[0]["missingDeviceFrames"]==null,"First packet has no invented missing-sample count");
                Need((bool)rows[0]["startupDiscontinuity"]==(firstFlags!=0)&&Convert.ToInt64(rows[239]["wavFrameStart"])==239*512,"Startup flag retained and WAV offsets associate every packet");
                var m=Manifest(session);Need((bool)m["complete"]&&(bool)m["ownedCaptureComplete"]&&(bool)m["loopbackCaptureComplete"],"Healthy retained streams finalize complete");Need((bool)m["startupDiscontinuity"]==(firstFlags!=0)&&(bool)m["initialSamplesMissingUnknown"]==(firstFlags!=0),"Unknown initial coverage explicitly retained");Need(!(bool)m["fullSessionCoverageGuaranteed"]&&!(bool)m["synchronizationEstablished"],"Finalization does not claim synchronization or original prefix coverage");
            }
            string[] faultNames={"loopback-data-discontinuity","loopback-timestamp-error","loopback-device-frame-gap","loopback-device-frame-regression","loopback-qpc-regression","loopback-timestamp-unavailable","loopback-unknown-packet-flags"};
            for(int fault=0;fault<faultNames.Length;fault++)using(var session=Session(root,"isolated-"+faultNames[fault])){
                var tap=session.CreateOwnedTap();var pcm=new float[64];for(int i=0;i<pcm.Length;i++)pcm[i]=i*.001f;Submit(tap,pcm,0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture-isolation-only");var bytes=Enumerable.Range(0,128).Select(i=>(byte)i).ToArray();
                Packet(session,bytes,0,100,10000);Wait(()=>session.Snapshot.LoopbackFrames==16,"First valid packet is retained before fault");uint flags=fault==0?1u:fault==1?4u:fault==6?8u:0u;ulong frame=fault==2?119u:fault==3?111u:116u,qpc=fault==4?9999u:fault==5?0u:20000u;
                Packet(session,bytes,flags,frame,qpc);Wait(()=>!session.LoopbackAccepting,"Loopback integrity fault closes only its own admission");Need(session.Accepting,"Loopback failure preserves independent owned admission");
                Submit(tap,pcm,32);Wait(()=>session.Snapshot.OwnedFrames==64,"Final PCM continues after loopback fault");Need(Packet(session,bytes,0,132,30000)<0,"Faulted loopback cannot resume or silently bridge a gap");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Isolated loopback fault finalizes");
                var m=Manifest(session);Need(!(bool)m["complete"]&&(bool)m["ownedCaptureComplete"]&&!(bool)m["loopbackCaptureComplete"]&&m["loopbackFailure"].ToString()==faultNames[fault],"Fault classification and independent stream completeness survive manifest");var rows=Packets(session);Need(rows.Length==2&&rows[1]["integrityFault"].ToString()==faultNames[fault],"Fault packet bytes and metadata retained together");Need(Data(Path.Combine(session.DirectoryPath,"loopback.wav")).Length==256,"Retained fault evidence has exact packet bytes without padding");
            }
            using(var session=Session(root,"first-timestamp-error")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture");Packet(session,new byte[128],5,10,10000);Wait(()=>!session.LoopbackAccepting,"First discontinuity plus timestamp error remains a fault");Need(session.Accepting,"First timestamp failure does not stop owned PCM");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"First timestamp fault drains");var rows=Packets(session);Need(!(bool)rows[0]["startupDiscontinuity"]&&!(bool)rows[0]["timestampValid"]&&rows[0]["integrityFault"].ToString()=="loopback-timestamp-error","First timestamp error never reclassified as harmless startup");
                Need((bool)rows[0]["initialSamplesMissingUnknown"]&&(bool)Manifest(session)["initialSamplesMissingUnknown"],"Faulted initial discontinuity still reports unknown initial loss");
            }
            using(var session=Session(root,"loopback-unavailable")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);var driver=new FakeDriver();object[] start={null,driver,null};Need(!(bool)typeof(RecordingSession).GetMethod("StartLoopbackCore",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(session,start)&&Object.Equals(start[2],"loopback-endpoint-identity-unavailable"),"Unavailable approved endpoint identity rejected before activation");Need(driver.Opens==0&&driver.Starts==0,"Unavailable identity cannot activate even the fake endpoint");Need(session.Accepting&&!session.LoopbackAccepting,"Unavailable approved endpoint identity preserves owned capture");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Unavailable endpoint attempt finalizes without activation");var m=Manifest(session);Need((bool)m["loopbackRequested"]&&!(bool)m["complete"]&&(bool)m["ownedCaptureComplete"]&&!(bool)m["endpointOpened"],"Requested unavailable loopback is never a complete synchronized session");
            }
            foreach(string reason in new[]{"fixture-device-invalidated",null})using(var session=Session(root,"early-loopback-stop-"+(reason??"without-error"))){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture");Packet(session,new byte[128],1,10,10000);Wait(()=>session.Snapshot.LoopbackFrames==16,"Early termination fixture retains first packet");session.LoopbackStopped(reason);Need(session.Accepting&&!session.LoopbackAccepting,"Error and unexplained early completion isolate capture failure");Submit(tap,new float[64],32);Wait(()=>session.Snapshot.OwnedFrames==64,"Owned capture survives early loopback termination");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Early termination finalizes both files");Need(Manifest(session)["loopbackFailure"].ToString()==(reason??"loopback-ended-early"),"Early termination classification preserved");
            }
            using(var session=Session(root,"loopback-queue-isolation")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture");var gate=typeof(RecordingSession).GetField("jsonLock",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(session);
                lock(gate){for(int i=0;i<RecordingSession.PacketCapacity;i++)Need(Packet(session,new byte[128],0,(ulong)i*16,10000+(ulong)i*3333)>=0,"Bounded loopback queue reservation");Need(Packet(session,new byte[128],0,10000,10000)<0,"Loopback queue overflow detected deterministically");}
                Need(session.Accepting&&!session.LoopbackAccepting,"Overflow cannot terminate independent owned PCM");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Bounded packet queue drains after overflow");Need(Manifest(session)["loopbackFailure"].ToString()=="loopback-queue-overflow","Overflow remains visible");Need(Packets(session).Length==RecordingSession.PacketCapacity,"All previously admitted packets retained before finalization");
            }
            using(var session=Session(root,"loopback-release-isolation")){
                var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);session.SetLoopbackFormat(LosslessWaveWriter.FloatStereo(),"fixture");var bytes=new byte[128];fixed(byte* p=bytes){long now=Stopwatch.GetTimestamp();int slot=session.PrepareLoopback((IntPtr)p,16,128,0,1,10000,now,now);session.CancelLoopback(slot);}Need(session.Accepting&&!session.LoopbackAccepting,"Native release cancellation isolates loopback failure");session.RequestStop();tap.Dispose();Need(session.WaitForCompletion(4000),"Cancelled packet reservation cannot block finalization");Need(Data(Path.Combine(session.DirectoryPath,"loopback.wav")).Length==0&&Manifest(session)["loopbackFailure"].ToString()=="loopback-release-failed","Failed release never commits endpoint PCM");
            }
            using(var session=Session(root,"byte-cap",new RecordingOptions(120,1048576))){var tap=session.CreateOwnedTap();var block=new float[1024];long frame=0;while(session.Accepting&&frame<512*600){Submit(tap,block,frame);frame+=512;Thread.Sleep(2);}tap.Dispose();Need(session.WaitForCompletion(4000),"Byte cap bounded finalization");Need(!session.Snapshot.Complete,"Byte cap does not silently omit samples");Need(Directory.GetFiles(session.DirectoryPath).Sum(file=>new FileInfo(file).Length)<=1048576,"Actual all-file size cap includes final metadata");}
            using(var session=Session(root,"duration",new RecordingOptions(1))){var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);Wait(()=>!session.Accepting,"Real bounded duration expires without a test clock shortcut");tap.Dispose();Need(session.WaitForCompletion(4000),"Duration stop finalizes");Need(session.Snapshot.Reason=="duration-limit","Duration cutoff remains explicit");}
            var sink=new BlockingSink();using(var tap=OwnedOutputTap.ForLocalSink(sink)){var data=new float[64];Submit(tap,data,0);Need(sink.Entered.WaitOne(1000),"Fixture consumer held off render thread");for(int i=0;i<OwnedOutputTap.Capacity+1;i++)Submit(tap,data,32L*(i+1));Need(tap.DroppedChunks>0,"Bounded queue cannot grow");sink.Release.Set();Need(sink.Stopped.WaitOne(4000),"Overflow stops recording consumer");Need(sink.Failure!=null&&sink.Failure.Contains("queue-overflow"),"Overflow disclosed as capture failure");}
            using(var memory=new FailingStream()){var wave=new LosslessWaveWriter(memory,LosslessWaveWriter.FloatStereo());memory.Fail=true;Throws(delegate{wave.Write(new byte[8],8);},"Actual writer storage failure propagated");memory.Fail=false;wave.Dispose();}
            var pcm24=new byte[]{1,0,1,0,128,187,0,0,128,50,2,0,3,0,24,0,0,0};using(var memory=new MemoryStream()){var wave=new LosslessWaveWriter(memory,pcm24);wave.Write(new byte[]{1,2,3},3);wave.FlushHeader();Need(memory.Length%2==0,"RIFF odd PCM24 payload padded without changing data size");wave.Dispose();}
            Console.WriteLine("PASS "+checks+" production tap/WAV/clock/cap/fault assertions; no host process, game or audio endpoint started.");return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
