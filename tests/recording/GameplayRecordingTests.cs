using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
using RichAudio.Beacon.Windows.Recording;

public static class GameplayRecordingTests
{
    static int checks;static readonly JavaScriptSerializer json=new JavaScriptSerializer();
    static void Need(bool value,string why){checks++;if(!value)throw new Exception(why);}
    static void Wait(Func<bool> condition,string why){var watch=Stopwatch.StartNew();while(!condition()&&watch.ElapsedMilliseconds<4000)Thread.Sleep(2);Need(condition(),why);}
    static void Throws(Action action,string why){bool rejected=false;try{action();}catch{rejected=true;}Need(rejected,why);}
    static string Permit(string root,bool record,bool loopback,bool fixture=true,string session="11111111111111111111111111111111")
    {string p=Path.Combine(root,"permit-"+Guid.NewGuid().ToString("N")+".json");File.WriteAllText(p,json.Serialize(new{schema=1,profile="PLAYABLE-13",session=session,playbackAllowed=true,recordingAllowed=record,loopbackAllowed=loopback,fixtureOnly=fixture}));return p;}
    sealed class Render:IAudioRenderClient,IDisposable
    {
        internal readonly List<byte> Bytes=new List<byte>();internal Action<byte[]> OnSubmission;IntPtr data;int count;
        public int GetBuffer(uint frames,out IntPtr result){count=(int)frames*8;data=Marshal.AllocHGlobal(count);result=data;return 0;}
        public int ReleaseBuffer(uint frames,uint flags){var b=new byte[count];Marshal.Copy(data,b,0,count);Marshal.FreeHGlobal(data);data=IntPtr.Zero;Bytes.AddRange(b);if(OnSubmission!=null)OnSubmission(b);return 0;}
        public void Dispose(){if(data!=IntPtr.Zero)Marshal.FreeHGlobal(data);}
    }
    sealed class Loop:ILoopbackDriver
    {
        readonly RecordingSession owner;readonly ConcurrentQueue<byte[]> queue=new ConcurrentQueue<byte[]>();ulong position;
        internal int Opens,Starts;internal Loop(RecordingSession session){owner=session;}
        public bool DeviceFree{get{return true;}}
        public void BeforeActivation(){}public void BeforeStart(){}
        public byte[] Open(string endpoint){Opens++;return LosslessWaveWriter.FloatStereo();}
        public void Start(){Starts++;}
        internal void Enqueue(byte[] b){queue.Enqueue(b);}
        public bool ReadPacket(){byte[] b;if(!queue.TryDequeue(out b))return false;IntPtr p=Marshal.AllocHGlobal(b.Length);try{Marshal.Copy(b,0,p,b.Length);long now=Stopwatch.GetTimestamp();int slot=owner.PrepareLoopback(p,b.Length/8,b.Length,0,position,(ulong)((decimal)now*10000000/Stopwatch.Frequency),now,now);owner.CommitLoopback(slot);position+=(ulong)(b.Length/8);return true;}finally{Marshal.FreeHGlobal(p);}}
        public void Dispose(){}
    }
    static byte[] WaveData(string file){using(var r=new BinaryReader(File.OpenRead(file))){r.ReadBytes(12);while(r.BaseStream.Position<r.BaseStream.Length){string kind=System.Text.Encoding.ASCII.GetString(r.ReadBytes(4));int length=r.ReadInt32();byte[] b=r.ReadBytes(length);if(kind=="data")return b;if((length&1)!=0)r.ReadByte();}}throw new Exception("WAV data absent");}
    public static int Main(string[] args)
    {
        try{
            string root=Path.GetFullPath(args[0]);if(Directory.Exists(root))throw new Exception("New fixture root required");Directory.CreateDirectory(root);
            Need(!new RecordingReadiness().CoreAllowed,"Legacy recording defaults remain disabled");
            var measurement=RecordingReadiness.FirstDemo(true,true,true);Need(measurement.CoreAllowed&&measurement.FirstDemoMeasurement&&!measurement.FeatureEnabled&&!measurement.HumanListeningApproved&&!measurement.LivePcmVerified,"First-demo measurement is not fabricated prior listening acceptance");
            Throws(()=>RecordingReadiness.FirstDemo(false,false,true),"Explicit capture permission required");
            string disabled=Permit(root,false,false);var p=GameplayDemoPermit.Load(disabled,new string('1',32),true);string reason;Need(GameplayRecording.TryStart(root,p,out reason)==null&&reason=="recording-not-requested"&&!Directory.Exists(Path.Combine(root,".local","recordings")),"No record opt-in creates no recording tree");
            Throws(()=>GameplayDemoPermit.Load(Permit(root,false,true),new string('1',32),true),"Loopback cannot bypass recording permission");
            Throws(()=>GameplayDemoPermit.Load(Permit(root,true,true,false),new string('1',32),true),"Fixture cannot acquire real endpoint capability");
            Throws(()=>GameplayDemoPermit.Load(Permit(root,true,true),new string('2',32),true),"Wrong session refused");
            string duplicate=Permit(root,true,false);File.WriteAllText(duplicate,File.ReadAllText(duplicate).Replace("\"schema\":1","\"schema\":1,\"schema\":1"));Throws(()=>GameplayDemoPermit.Load(duplicate,new string('1',32),true),"Duplicate permit field refused");
            string extra=Permit(root,true,false);File.WriteAllText(extra,File.ReadAllText(extra).Replace("\"schema\":1","\"schema\":1,\"unknown\":true"));Throws(()=>GameplayDemoPermit.Load(extra,new string('1',32),true),"Unknown permission field refused");
            var permit=GameplayDemoPermit.Load(Permit(root,true,true),new string('1',32),true);
            string capture;
            using(var recording=GameplayRecording.TryStart(root,permit,out reason)){
                Need(recording!=null,"Approved measurement recording starts: "+reason);capture=recording.DirectoryPath;
                var session=(RecordingSession)typeof(GameplayRecording).GetField("session",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(recording);
                var loop=new Loop(session);recording.StartLoopback("fixture-never-an-endpoint",loop);Wait(()=>loop.Starts==1,"Existing streaming loopback exercised with fake driver only");
                using(var output=new WasapiOutput(new PcmRing(),-1,true))using(var renderer=new Render()){
                    var ring=(PcmRing)typeof(WasapiOutput).GetField("ring",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(output);output.OwnedRecorder=recording.Tap;output.Muted=false;output.Volume=1;renderer.OnSubmission=loop.Enqueue;
                    var fill=typeof(WasapiOutput).GetMethod("Fill",BindingFlags.Instance|BindingFlags.NonPublic);
                    for(int block=0;block<40;block++){var pcm=new float[1024];for(int i=0;i<512;i++){double t=(block*512+i)/48000d;float x=(float)(Math.Sin(2*Math.PI*(120+50*t)*t)*(.12+.08*Math.Sin(2*Math.PI*3*t)));pcm[i*2]=x;pcm[i*2+1]=x*.8f;}Need(ring.TryWrite(pcm,512),"Existing PCM ring accepts bounded fixture block");fill.Invoke(output,new object[]{renderer,(uint)512});Thread.Sleep(1);}
                    Wait(()=>recording.Snapshot.OwnedFrames==20480&&recording.Snapshot.LoopbackFrames==20480,"Owned and fake selected-output packets recorded losslessly");
                    Need(recording.Event("host-buffer-state",Stopwatch.GetTimestamp(),new{sourceCounters=new{engine=new{sumSquares=4.0},exhaust=new{sumSquares=16.0}},underflowFrames=0}),"Existing diagnostic writer records source/buffer facts");
                    Need(!output.DeviceOpened,"Real production Fill executed with fake render client, never WASAPI Start");
                    output.OwnedRecorder=null;recording.Dispose();Need(session.Snapshot.Complete,"Both existing writers finalize");
                    Need(WaveData(Path.Combine(capture,"richaudio.wav")).SequenceEqual(renderer.Bytes),"Owned WAV equals actual post-gain submitted bytes");
                    Need(WaveData(Path.Combine(capture,"loopback.wav")).SequenceEqual(renderer.Bytes),"Fake loopback WAV preserves packet bytes");
                    Need(File.ReadAllText(Path.Combine(capture,"diagnostics.ndjson")).Contains("\"humanListeningApproved\":false"),"No fabricated human-listening approval in evidence");
                }
            }
            using(var unavailable=GameplayRecording.TryStart(root,permit,out reason)){
                unavailable.StartLoopback(null);string unavailablePath=unavailable.DirectoryPath;unavailable.Dispose();var failed=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(unavailablePath,"session.json")));
                Need((bool)failed["loopbackRequested"]&&!(bool)failed["complete"]&&failed["loopbackFailure"].ToString()=="fixture-loopback-not-supplied"&&!(bool)failed["endpointOpened"],"Approved missing loopback driver remains incomplete in final session manifest without endpoint activation");
            }
            var fade=new GameplayShutdownFade();Need(fade.Begin(0,0,4096)&&!fade.Begin(1,1,0),"Fade request is one-way");Need(!fade.Complete(120,5760),"Old120ms shutdown cannot cut queued output");Need(!fade.Complete(649,31200),"Minimum sink grace preserved");Need(!fade.Complete(650,4096),"Queued reserve alone is insufficient");Need(fade.Complete(650,31200)&&fade.FullyConsumed(31200),"Queued reserve and500ms processing/control allowance consumed");Need(fade.Complete(1500,0)&&!fade.FullyConsumed(0),"Stalled sink has bounded honest incomplete fade");
            Console.WriteLine(json.Serialize(new{passed=true,assertions=checks,captureDirectory=capture,actualProductionFillExecuted=true,existingOwnedTapAndLoopbackExecuted=true,fixtureOnly=true,gameLaunched=false,endpointOpened=false,microphoneOpened=false,humanListeningApproved=false}));return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
