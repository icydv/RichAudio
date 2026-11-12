// Authored observations and a verbatim pure API factory; never load GTA or SHVDNE's native runtime.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;using RichAudio.Integration;
public struct StartupVector02A {public float X,Y,Z;public StartupVector02A(float x,float y,float z){X=x;Y=y;Z=z;}}
class TestShvdneStartup02A {
 const string Session="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";static int checks;static readonly long F=Stopwatch.Frequency;
 static void Check(bool v,string why){if(!v)throw new Exception(why);checks++;Console.WriteLine("PASS "+why);}
 sealed class Source:IGameObservationSource {
  public long Clock=F*10,CameraCost,AfterCameraCost,InteriorCost,ReadyCost;public int CameraReads,InteriorReads,Enumerations,VehicleReads;public bool Ready=true,Driver=true,Alive=true;public uint Model=0xf9300cc5;
  public bool StoryReady{get{Clock+=ReadyCost;return Ready;}}public int PlayerVehicleHandle{get{return Driver?257:0;}}
  public CameraObservation ReadCamera(){CameraReads++;long before=Clock;Clock+=CameraCost;long after=Clock;Clock+=AfterCameraCost;return new CameraObservation{Before=before,After=after,Observed=before+(after-before)/2,GameTime=(uint)(Clock*1000/F),Position=new[]{0d,0d,1d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}};}
  public GameplayInterior ReadCameraInterior(ListenerState listener,out CameraInteriorReadback raw){InteriorReads++;Clock+=InteriorCost;raw=new CameraInteriorReadback{Outcome="no-proxy",Proxy=0,SampleTicks=Clock};return null;}
  public int[] DiscoverVehicles(double[] p,float radius){Enumerations++;return new[]{257,513};}
  public VehicleObservation ReadVehicle(int h){VehicleReads++;return new VehicleObservation{Handle=h,Model=Model,Before=Clock,After=Clock,Observed=Clock,Exists=Alive,PlayerDriver=Driver&&h==257,VehicleView=Driver&&h==257,Running=true,Position=new[]{(double)(h==257?1:2),0d,0d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPointEvidence="unavailable"};}
  public SharedFrameSampler Sampler(){var s=new SharedFrameSampler(Session,this,(m,c)=>true,4,()=>Clock);s.IncludeTransportObservations=true;return s;}
  public void Next(){Clock+=F/20;}
 }
 static double Max(SharedFrameSampler s,string series){return series=="camera"?s.Timing.CameraListener.Maximum:s.Timing.Conversion.Maximum;}
 static void Paths(){
  var cold=new Source{CameraCost=F*46/1000};var sampler=cold.Sampler();Check(sampler.Capture()==null&&sampler.LastStatus=="listener-acquisition-invalid","native-bracket delay rejects first camera without publication");
  Check(cold.InteriorReads==0&&cold.Enumerations==0&&cold.VehicleReads==0,"invalid listener returns before interior, enumeration, vehicles and wire validation");
  Check(sampler.Timing.Batch.Count==1&&sampler.Timing.Batch.Over10==1&&Max(sampler,"camera")==46&&sampler.MaximumObservationMs==0,"full timing retains invalid early return while completed-path legacy counter stays zero");
  cold.CameraCost=0;cold.Next();var recovered=sampler.Capture();Check(recovered.Listener.Generation==2&&recovered.Listener.VelocityKind=="unavailable"&&recovered.VehicleObservations02.Length==2,"invalid startup resets listener continuity and recovers with real next authored sample");
  for(int i=0;i<200;i++){cold.Next();sampler.Capture();}Check(sampler.Timing.Batch.Count==202&&sampler.Timing.Batch.Over10==1&&sampler.Timing.Batch.Maximum==46,"200 repeated clean observations do not erase startup overrun");
  Check(!ShvdneTimingGate(sampler),"lifetime overrun cannot become clean admission after repeated samples");
  var post=new Source{AfterCameraCost=F*46/1000};var postSampler=post.Sampler();var postFrame=postSampler.Capture();Check(postFrame!=null&&postFrame.Listener.Valid&&postSampler.OverBudget==1&&postFrame.VehicleObservations02.Length==0,"equally long work after native acquisition differs from invalid acquisition and is still withheld");
  var interior=new Source{InteriorCost=F*17/1000};var a=interior.Sampler();var fa=a.Capture();
  var readiness=new Source{ReadyCost=F*17/1000};var b=readiness.Sampler();var fb=b.Capture();
  Check(Max(a,"camera")==0&&Max(b,"camera")==0&&Max(a,"residual")==17&&Max(b,"residual")==17,"same 17ms residual can originate in interior or readiness; existing counter does not identify operation");
  Check(fa.VehicleObservations02.Length==0&&fb.VehicleObservations02.Length==0&&a.OverBudget==1&&b.OverBudget==1,"both residual causes retain fixed budget withholding");
  var source=new Source();var first=source.Sampler();var one=first.Capture();source.Next();source.Driver=false;var two=first.Capture();Check(two.VehicleObservations02[0].Id==one.VehicleObservations02[0].Id&&two.VehicleObservations02[0].Context=="player"&&two.VehicleObservations02[0].RiderAttached==false,"player dismount preserves bank and identity while attachment changes");
  source.Next();source.Alive=false;first.Capture();source.Next();source.Alive=true;source.Driver=true;var three=first.Capture();Check(three.VehicleObservations02[0].Id!=one.VehicleObservations02[0].Id,"retirement does not inherit old identity");
  var reloadSource=new Source();var reload=new SharedFrameSampler(new string('b',32),reloadSource,(m,c)=>true,4,()=>reloadSource.Clock);reload.IncludeTransportObservations=true;Check(reload.Capture().Session!=one.Session,"fresh script session has independent protocol identity");
  var none=new Source{Ready=false};var notReady=none.Sampler();Check(notReady.Capture()==null&&none.CameraReads==0&&notReady.Timing.Batch.Count==1,"not-ready early return performs no camera or publication and remains counted");
  var pairA=new Source();var pairB=new Source();var left=pairA.Sampler();var right=pairB.Sampler();for(int i=0;i<20;i++){Check(Encoding(left.Capture())==Encoding(right.Capture()),"exact repeated frame bytes with identical authored inputs "+i);pairA.Next();pairB.Next();}
 }
 static bool ShvdneTimingGate(SharedFrameSampler s){return s.Timing.Batch.Over10==0;}
 static string Encoding(GameplayFrame f){return Convert.ToBase64String(GameplayWire.Encode(f,f.Session));}
 static object Measure(Action action){var p=Process.GetCurrentProcess();double cpu=p.TotalProcessorTime.TotalMilliseconds;long begin=Stopwatch.GetTimestamp();int gc=GC.CollectionCount(0);action();return new{elapsedMs=(Stopwatch.GetTimestamp()-begin)*1000d/F,processCpuMs=p.TotalProcessorTime.TotalMilliseconds-cpu,gen0Collections=GC.CollectionCount(0)-gc,cpuResolution="OS quantized; process-wide, not exact callback CPU"};}
 [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
 static StartupVector02A FactoryValue(){return GTA.Native.InstanceCreator<float,float,float,StartupVector02A>.Create(1.25f,-2.5f,3.75f);}
 static int Main(string[] args){try{if(args.Length>0&&args[0]=="factory"){
   var first=Measure(()=>System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(GTA.Native.InstanceCreator<float,float,float,StartupVector02A>).TypeHandle));
   var second=Measure(()=>System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(GTA.Native.InstanceCreator<float,float,float,StartupVector02A>).TypeHandle));
   var value=FactoryValue();if(value.X!=1.25f||value.Y!=-2.5f||value.Z!=3.75f)throw new Exception("constructor changed values");
   var wait=Measure(()=>Thread.Sleep(25));var busy=Measure(()=>{long until=Stopwatch.GetTimestamp()+F/40;while(Stopwatch.GetTimestamp()<until){};});
   Console.WriteLine(new JavaScriptSerializer().Serialize(new{scope="Verbatim retained API3 factory body with authored vector; actual .NET Framework CLR; no native SDK or game, not live attribution or performance admission",first,second,wait,busy}));return 0;}
  Paths();Console.WriteLine("RESULT checks="+checks+" gameLaunched=false endpointOpened=false candidateExecuted=false");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
