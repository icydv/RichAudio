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
            using(var session=Session(root,"byte-cap",new RecordingOptions(120,1048576))){var tap=session.CreateOwnedTap();var block=new float[1024];long frame=0;while(session.Accepting&&frame<512*600){Submit(tap,block,frame);frame+=512;Thread.Sleep(2);}tap.Dispose();Need(session.WaitForCompletion(4000),"Byte cap bounded finalization");Need(!session.Snapshot.Complete,"Byte cap does not silently omit samples");Need(Directory.GetFiles(session.DirectoryPath).Sum(file=>new FileInfo(file).Length)<=1048576,"Actual all-file size cap includes final metadata");}
            using(var session=Session(root,"duration",new RecordingOptions(1))){var tap=session.CreateOwnedTap();Submit(tap,new float[64],0);Wait(()=>!session.Accepting,"Real bounded duration expires without a test clock shortcut");tap.Dispose();Need(session.WaitForCompletion(4000),"Duration stop finalizes");Need(session.Snapshot.Reason=="duration-limit","Duration cutoff remains explicit");}
            var sink=new BlockingSink();using(var tap=OwnedOutputTap.ForLocalSink(sink)){var data=new float[64];Submit(tap,data,0);Need(sink.Entered.WaitOne(1000),"Fixture consumer held off render thread");for(int i=0;i<OwnedOutputTap.Capacity+1;i++)Submit(tap,data,32L*(i+1));Need(tap.DroppedChunks>0,"Bounded queue cannot grow");sink.Release.Set();Need(sink.Stopped.WaitOne(4000),"Overflow stops recording consumer");Need(sink.Failure!=null&&sink.Failure.Contains("queue-overflow"),"Overflow disclosed as capture failure");}
            using(var memory=new FailingStream()){var wave=new LosslessWaveWriter(memory,LosslessWaveWriter.FloatStereo());memory.Fail=true;Throws(delegate{wave.Write(new byte[8],8);},"Actual writer storage failure propagated");memory.Fail=false;wave.Dispose();}
            var pcm24=new byte[]{1,0,1,0,128,187,0,0,128,50,2,0,3,0,24,0,0,0};using(var memory=new MemoryStream()){var wave=new LosslessWaveWriter(memory,pcm24);wave.Write(new byte[]{1,2,3},3);wave.FlushHeader();Need(memory.Length%2==0,"RIFF odd PCM24 payload padded without changing data size");wave.Dispose();}
            Console.WriteLine("PASS "+checks+" production tap/WAV/clock/cap/fault assertions; no host process, game or audio endpoint started.");return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
