using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.IO.Pipes;using System.Reflection;using System.Runtime.Serialization.Json;using System.Text;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;using RichAudio.Integration;
[assembly:AssemblyFileVersion("1.0.1158.16")]
internal static class TestShvdneSmoke02 {
 static int checks;static long sequence;static string package,pointer,game,api;static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=65536};
 static void Check(bool v,string why){if(!v)throw new Exception(why);checks++;Console.WriteLine("PASS "+why);}
 static void Reject(Action a,string why){bool rejected=false;try{a();}catch(Exception){rejected=true;}Check(rejected,why);}
 static void Until(Func<bool> condition,int ms,string why,Action progress=null){var t=Stopwatch.StartNew();while(!condition()){if(t.ElapsedMilliseconds>ms)throw new TimeoutException(why);if(progress!=null)progress();Thread.Sleep(25);}}
 static Dictionary<string,object> Map(object value){return Json.Deserialize<Dictionary<string,object>>(Json.Serialize(value));}
 static GameplayFrame Frame(string session,long time=0,string id="shvdne-1"){long t=time==0?Stopwatch.GetTimestamp():time;return new GameplayFrame{Session=session,Vehicles=new GameplayVehicle[0],VehicleObservations02=new[]{new GameplayVehicleObservation02{Id=id,Generation=1,ObservationTicks=t,Model=0xf9300cc5,Context="player",Position=new[]{2d,3d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},Running=true,Valid=true,RiderAttached=true,RiderViewAttached=true,OperatingPoint=null,OperatingPointEvidence="unavailable"}},Listener=new ListenerState{Version=1,Session=session,Sequence=sequence++,Generation=1,ObservationTicks=t,ClockFrequency=Stopwatch.Frequency,GameTimeMs=100+(int)sequence,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="unavailable",Coordinates="gta-native-unscaled",Units="native-unverified",Valid=true,Reason="valid"}};}
 static void Timing(){
  var h=new TimingSeries02();for(int i=1;i<=100;i++)h.Add(i/10d);h.Add(17);var d=Map(h.Snapshot());Check((int)d["count"]==101&&(int)d["over10ms"]==1,"histogram preserves all batches and over-budget count");Check(Convert.ToDouble(d["p50Ms"])==5.1&&Convert.ToDouble(d["p95Ms"])==9.6&&Convert.ToDouble(d["p99Ms"])==10&&Convert.ToDouble(d["maxMs"])==17,"deterministic percentile upper bounds and exact maximum");
  long now=Stopwatch.Frequency;var timing=new ObservationTiming02(()=>now);long period=Stopwatch.Frequency/20;Check(timing.Due(now,0,period)==now+period,"first publication has no invented scheduling debt");now+=period*4;timing.Due(now,now-period*3,period);Check(Convert.ToInt64(Map(timing.Snapshot())["missedPublicationIntervals"])==3,"scheduling debt counts missed intervals separately");long began=now;now+=Stopwatch.Frequency/50;timing.FinishBatch(began,7,-1);Check(timing.Batch.Over10==1&&timing.Batch.Maximum==20,"deterministic 20ms workload is retained without raising budget");Check(Convert.ToInt64(Map(timing.Snapshot())["lastBatchObservationCount"])==7,"per-batch observation count retained");
  var source=new Source();var sampler=new SharedFrameSampler(new string('a',32),source,(m,c)=>true,4,()=>source.Time);sampler.IncludeTransportObservations=true;var f=sampler.Capture();Check(f.Vehicles.Length==0&&f.VehicleObservations02.Length==1&&!f.VehicleObservations02[0].OperatingPoint.HasValue,"actual sampler publishes missing-RPM diagnostic metadata without synthesis vehicles");
  Check(sampler.Timing.Batch.Count==1&&sampler.Timing.Enumeration.Maximum==2&&sampler.Timing.CameraListener.Maximum==1&&sampler.Timing.VehicleGetters.Maximum==3,"actual sampler attributes deterministic camera, enumeration and getter spans");
  source.Time+=Stopwatch.Frequency/20;source.EnumerationCost=Stopwatch.Frequency/50;source.DiscoverEvery=true;var slow=new SharedFrameSampler(new string('b',32),source,(m,c)=>true,4,()=>source.Time);slow.IncludeTransportObservations=true;Check(slow.Capture().VehicleObservations02.Length==0&&slow.OverBudget==1&&slow.Timing.Batch.Over10==1,"over-budget diagnostic batch is counted and withheld");
  source.Ready=false;slow.Capture();Check(slow.Timing.Batch.Count==2,"early not-ready return remains in timing denominator");
 }
 sealed class Source:IGameObservationSource {
  public long Time=Stopwatch.Frequency*10,EnumerationCost=Stopwatch.Frequency/500;public bool Ready=true,DiscoverEvery;
  public bool StoryReady{get{return Ready;}}public int PlayerVehicleHandle{get{return 10;}}
  public CameraObservation ReadCamera(){long before=Time;Time+=Stopwatch.Frequency/1000;return new CameraObservation{Before=before,After=Time,Observed=before+(Time-before)/2,GameTime=1000,Position=new[]{0d,0d,1d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}};}
  public int[] DiscoverVehicles(double[] p,float radius){Time+=EnumerationCost;return DiscoverEvery?new[]{10}:new int[0];}
  public VehicleObservation ReadVehicle(int h){long before=Time;Time+=Stopwatch.Frequency*3/1000;return new VehicleObservation{Handle=h,Model=0xf9300cc5,Exists=true,Running=true,PlayerDriver=true,Before=before,After=Time,Observed=before+(Time-before)/2,Position=new[]{2d,3d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}};}
  public GameplayInterior ReadCameraInterior(ListenerState l,out CameraInteriorReadback raw){raw=null;return null;}
 }
 static void Signals(){
  string s=new string('a',32);var f=Frame(s);var bytes=GameplayWire.Encode(f,s);var round=GameplayWire.Decode(bytes,s);Check(round.Version==1&&round.Vehicles.Length==0&&round.VehicleObservations02[0].OperatingPoint==null,"additive metadata roundtrips in preserved v1 envelope");
  var legacy=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes));legacy.Remove("vehicleObservations02");Check(GameplayWire.Decode(Encoding.UTF8.GetBytes(Json.Serialize(legacy)),s).VehicleObservations02==null,"unextended v1 remains valid for production consumers");
  Reject(()=>GameplayWire.Decode(Encoding.UTF8.GetBytes("{garbage}"),s),"malformed JSON rejected");Reject(()=>GameplayWire.Decode(bytes,new string('b',32)),"foreign session rejected");
  f.VehicleObservations02[0].OperatingPoint=0;Reject(()=>GameplayWire.Encode(f,s),"invented idle RPM rejected in diagnostic extension");f.VehicleObservations02[0].OperatingPoint=null;f.VehicleObservations02[0].Position[0]=Double.NaN;Reject(()=>GameplayWire.Encode(f,s),"invalid pose rejected");
  var state=new TransportObservationState02();f=Frame(s);Check(state.Accept(f,s,Stopwatch.GetTimestamp()),"receiver accepts fresh listener and copied vehicle");Reject(()=>state.Accept(f,s,Stopwatch.GetTimestamp()),"duplicate sequence and vehicle timestamp rejected");
  var reversed=Frame(s);reversed.VehicleObservations02[0].ObservationTicks=f.VehicleObservations02[0].ObservationTicks-1;Reject(()=>state.Accept(reversed,s,Stopwatch.GetTimestamp()),"reversed vehicle chronology rejected");
  var changed=Frame(s);changed.VehicleObservations02[0].Model=1;Reject(()=>state.Accept(changed,s,Stopwatch.GetTimestamp()),"same identity cannot inherit changed model");
  var stale=Frame(s,Stopwatch.GetTimestamp()-Stopwatch.Frequency);Check(!state.Accept(stale,s,Stopwatch.GetTimestamp()),"stale telemetry is not accepted or renewed");
  var empty=Frame(s);empty.VehicleObservations02=new GameplayVehicleObservation02[0];Check(state.Accept(empty,s,Stopwatch.GetTimestamp())&&state.Retired==1,"source disappearance retires identity");Reject(()=>state.Accept(Frame(s),s,Stopwatch.GetTimestamp()),"retired identity cannot reappear in session");
  var fresh=Frame(s,0,"shvdne-2");Check(state.Accept(fresh,s,Stopwatch.GetTimestamp()),"new source identity appears independently");state.Expire(Stopwatch.GetTimestamp()+Stopwatch.Frequency);Check(state.LastFrame==null&&state.Retired==2,"250ms freshness expiry retires active metadata");
  var invalid=new ShvdneConfiguration{TransportValidationOnly=true,HostEnabled=true,MenuEnabled=false,AllowMemoryTelemetry=true};Reject(invalid.Validate,"transport mode rejects optional mechanical provider");
  Check(ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,300,0,0,0,true),"passive entry requires 30 seconds and 300 clean batches");
  Check(!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*29,300,0,0,0,true)&&!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,299,0,0,0,true),"short or undersampled passive window cannot arm");
  Check(!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,300,1,0,0,true)&&!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,300,0,1,0,true)&&!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,300,0,0,1,true)&&!ShvdneHostController.PassiveTimingGate02(Stopwatch.Frequency*30,300,0,0,0,false),"batch/tick overruns, getter failure or invalid listener close entry gate");
  Check(ShvdneHostController.CommandDecision02(s,s,"arm",true,false,false)=="arm"&&ShvdneHostController.CommandDecision02(s,new string('b',32),"arm",true,false,false)=="rejected-session-command","explicit arm command is bound to current transport session");
  Check(ShvdneHostController.CommandDecision02(s,s,"arm",false,false,false)=="rejected-arm-gate"&&ShvdneHostController.CommandDecision02(s,s,"arm",true,false,true)=="rejected-arm-gate"&&ShvdneHostController.CommandDecision02(s,s,"arm",true,true,false)=="rejected-arm-gate","failed gate, retired or already armed session cannot arm");
  Check(ShvdneHostController.CommandDecision02(s,s,"retire",false,true,false)=="retire"&&ShvdneHostController.CommandDecision02(s,s,"play",true,false,false)=="rejected-action","retirement remains available and playback command does not exist");
 }
 static void Prepare(string root,string hostBinary){
  package=Path.Combine(root,"package");Directory.CreateDirectory(Path.Combine(package,"runtime"));game=Assembly.GetExecutingAssembly().Location;File.Copy(hostBinary,Path.Combine(package,"runtime","RichAudio.Acoustics.Host.exe"));
  var c=new PlayableConfiguration{Schema=1,GameExecutable=game,GameVersion="1.0.1158.16",GameSha256=PlayableConfiguration.Digest(game),IntegrationFramework="shvdne",IntegrationVersion="1.1.0.6",IntegrationAssemblySha256=PlayableConfiguration.ShvdneApi3Sha256,TransportValidationOnly=true,Eligible=new PlayableModel[0],Bindings=new[]{new PlayableBinding{File="runtime/RichAudio.Acoustics.Host.exe",Sha256=PlayableConfiguration.Digest(hostBinary)}}};
  string manifest=Path.Combine(package,"playable.json");using(var file=File.Create(manifest))new DataContractJsonSerializer(typeof(PlayableConfiguration)).WriteObject(file,c);
  pointer=Path.Combine(root,"pointer.json");File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=package,manifestSha256=PlayableConfiguration.Digest(manifest)}));AcousticSettingsStore.Save(package,AcousticSettingsStore.DefaultPath(package),AcousticSettings.Defaults(1));
  Check(PlayableConfiguration.Load(manifest).TransportValidationOnly,"minimal host-only manifest binds actual host and fixture owner");Check(!Directory.Exists(Path.Combine(package,"tools"))&&!File.Exists(Path.Combine(package,"runtime","node.exe")),"transport fixture has no producer, Node or audio assets to fall through to");
 }
 static Dictionary<string,object> Status(string session){try{return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(package,".local","gameplay",session,"host.json")));}catch(IOException){return null;}}
 static long Number(string session,string key){var s=Status(session);return s==null?0:Convert.ToInt64(s[key]);}
 static void Direct(string name,int pid,byte[] payload){using(var pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){pipe.Connect(1500);GameplayWire.Peer(pipe,pid,false);GameplayWire.Write(pipe,payload);try{TransportStop.Ack(pipe,TransportStop.Accepted);}catch(IOException){}catch(InvalidDataException){}catch(TimeoutException){}}}
 static void Lifecycle(){
  string oldSession=null;int oldPid=0;
  for(int lifetime=0;lifetime<2;lifetime++)using(var c=new ShvdneHostController(true)){
   c.Start(pointer,game,api);c.SetStoryReady(true);Until(()=>c.Configuration!=null,5000,"manifest validation");Thread.Sleep(300);Check(c.HostPid==0&&c.Attempts==0,"passive phase never starts host before explicit arm");
   c.SetTransportArmed(true);Until(()=>c.HostPid>0&&Status(c.Session)!=null,7000,"transport-only host ready");int pid=c.HostPid;
   Check(c.Session!=oldSession&&pid!=oldPid,"reload gets independent session and process identity");
   Until(()=>Number(c.Session,"receivedSnapshots")>=3,4000,"real host receives v1 observations",()=>c.Publish(Frame(c.Session)));var status=Status(c.Session);
   Check((bool)status["transportValidationOnly"]&&!(bool)status["endpointOpened"]&&!(bool)status["rendererStarted"]&&Convert.ToInt32(status["nodePid"])==0,"actual compiled host opens no endpoint and starts no renderer or producer");
   string pipeName="RichAudio.Playable01."+Process.GetCurrentProcess().Id+"."+c.Session;
   // Disconnect the current publisher, then exercise malformed and stale peers.
   c.SetTransportArmed(false);Until(()=>c.HostPid==0,6500,"normal retirement");Check(c.Attempts==1,"one host attempt per session");Reject(()=>c.SetTransportArmed(true),"retired session cannot rearm or silently restart");
   string terminal=Path.Combine(package,".local","gameplay",c.Session,"last-stop.json");Check(File.Exists(terminal),"host publishes graceful terminal receipt");
   string events=File.ReadAllText(Path.Combine(package,".local","gameplay",c.Session,"runtime-lifecycle.jsonl"));Check(!events.Contains("forced-containment-close")&&events.Contains("host-exit-observed"),"normal retirement confirms host exit before containment closes");
   using(var p=Process.GetProcessById(Process.GetCurrentProcess().Id)){Check(p.Id!=pid,"host has separate contained process identity");}
   bool absent;try{using(var p=Process.GetProcessById(pid))absent=p.HasExited;}catch(ArgumentException){absent=true;}Check(absent,"normal stop leaves no host process");
   c.RequestStop("normal-script-reload-preflight");Check(c.Join(7000),"old supervisor and publisher retire before next script lifetime");Check(!c.Publish(Frame(c.Session)),"retired script cannot republish");oldSession=c.Session;oldPid=pid;
  }
 }
 static void BoundedQueue(){
  string session=Guid.NewGuid().ToString("N"),name="RichAudio.Smoke02.fixture."+session;GameplayFrame received=null;Exception error=null;
  using(var ready=new ManualResetEvent(false))using(var publisher=new GameplayPublisher(session)){
   var server=new Thread(()=>{try{using(var pipe=GameplayWire.Server(name)){ready.Set();pipe.WaitForConnection();GameplayWire.Peer(pipe,Process.GetCurrentProcess().Id,true);received=GameplayWire.Decode(GameplayWire.Read(pipe),session);TransportStop.Write(pipe,new[]{TransportStop.Accepted});}}catch(Exception e){error=e;}});server.IsBackground=true;server.Start();ready.WaitOne(3000);
   for(int i=0;i<1000;i++)publisher.Publish(Frame(session,0,"shvdne-"+i));publisher.Configure(name,Process.GetCurrentProcess().Id);publisher.Start();Until(()=>Interlocked.Read(ref publisher.Sent)==1,3000,"bounded publisher delivery");Check(server.Join(3000)&&error==null&&received.VehicleObservations02[0].Id=="shvdne-999","burst of 1000 pending frames delivers only newest snapshot");Check(publisher.Superseded==999,"superseded mailbox snapshots are counted with capacity one");
  }
 }
 static void PipeCases(string root,string hostBinary){
  // Actual host process with the same permit and current-user stop mechanism,
  // isolated from the supervisor so adversarial packets are deterministic.
  string manifest=Path.Combine(package,"playable.json"),session=Guid.NewGuid().ToString("N"),directory=Path.Combine(package,".local","gameplay",session),name="RichAudio.Playable01."+Process.GetCurrentProcess().Id+"."+session;
  string permit=Path.Combine(package,".local","permit");File.WriteAllText(permit,"authored offline permit");
  using(var signal=GameplayStopSignal.Create(Process.GetCurrentProcess().Id,session))using(var job=new OwnedProcessJob(1536)){
   var start=new ProcessStartInfo{FileName=hostBinary,Arguments="--gameplay-fixture \""+manifest+"\" "+PlayableConfiguration.Digest(manifest)+" "+Process.GetCurrentProcess().Id+" "+Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks+" "+session+" "+name+" \""+permit+"\"",UseShellExecute=false,CreateNoWindow=true};
   using(var p=Process.Start(start)){job.Assign(p);try{
    Until(()=>Status(session)!=null,5000,"adversarial peer host ready");
    Direct(name,p.Id,Encoding.UTF8.GetBytes("{bad}"));Until(()=>Number(session,"rejectedConnections")>=1,3000,"malformed pipe rejection");
    Direct(name,p.Id,GameplayWire.Encode(Frame(session,Stopwatch.GetTimestamp()-Stopwatch.Frequency),session));Until(()=>Number(session,"expiredSnapshots")>=1,3000,"stale pipe rejection");
    Direct(name,p.Id,GameplayWire.Encode(Frame(session,0,"shvdne-fresh"),session));Until(()=>Number(session,"receivedSnapshots")>=1,3000,"reconnect after malformed peer");
    Direct(name,p.Id,GameplayWire.Encode(Frame(session,0,"shvdne-fresh"),session));Until(()=>Number(session,"receivedSnapshots")>=2,3000,"second disconnect/reconnect");
    Check(Number(session,"connections")>=4,"actual host accepts reconnects without creating another host");
    signal.Set();Check(p.WaitForExit(5000)&&p.ExitCode==0,"actual host exits normally after disconnect/reconnect tests");
   }finally{signal.Set();p.WaitForExit(5000);}}
  }
 }
 static int Main(string[] args){try{api=args[1];Timing();Signals();BoundedQueue();Prepare(args[0],args[2]);Lifecycle();PipeCases(args[0],args[2]);File.WriteAllText(Path.Combine(args[0],"result.json"),Json.Serialize(new{passed=true,assertions=checks,gameLaunched=false,endpointOpened=false,actualHost=true,normalReloadScope="retire, normal stop, fresh controller lifetime; not a live SHVDNE reload"}));Console.WriteLine("RESULT assertions="+checks+" gameLaunched=false endpointOpened=false");return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
