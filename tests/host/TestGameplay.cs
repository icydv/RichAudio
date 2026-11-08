// Real owned supervisor -> secured pipe -> host -> Node -> source -> causal
// renderer -> RA07 -> native ring. Only the device sink and GTA observations
// are replaced; no audio device is enumerated or opened.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.IO.Pipes;using System.Threading;using System.Web.Script.Serialization;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
internal static class TestGameplay {
 static GameplayRuntime runtime;static long sequence,generation=1;static bool wasPaused;static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static string root;static int checks;static readonly List<int> owned=new List<int>();
 static bool environmentFixture,deliveryFixture,deliveryViewerFixture;
 static void Check(bool x,string why){checks++;if(!x)throw new Exception(why);}
 static Dictionary<string,object> Read(string f){try{return Json.DeserializeObject(File.ReadAllText(f)) as Dictionary<string,object>;}catch(IOException){return null;}}
 static Dictionary<string,object> Evidence(){return Read(Path.Combine(root,".local","gameplay",runtime.Session,"host.json"));}
 static bool Lifecycle(string owner,string stage,string reason){
  string file=Path.Combine(root,".local","gameplay",runtime.Session,owner+"-lifecycle.jsonl");
  using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
  using(var input=new StreamReader(stream)){
   string line;while((line=input.ReadLine())!=null){
    var row=(Dictionary<string,object>)Json.DeserializeObject(line);
    if((string)row["stage"]==stage&&(reason==null||(string)row["reason"]==reason))return true;
   }
  }
  return false;
 }
 static double Number(Dictionary<string,object>d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToDouble(v):0;}
 static Dictionary<string,object> Worker(){var d=Evidence();return d!=null&&d.ContainsKey("worker")?d["worker"]as Dictionary<string,object>:null;}
 static void Feed(int count,bool pause=false,bool valid=true){if(pause!=wasPaused){generation++;wasPaused=pause;}long now=Stopwatch.GetTimestamp();var vehicles=new List<GameplayVehicle>();for(int i=0;i<count;i++)vehicles.Add(new GameplayVehicle{Id="actual-component-fixture-"+i,Generation=deliveryFixture?1:(int)(sequence/160)+1,ObservationTicks=now,Model=i==0?0xf9300cc5u:0xa774b5a6u,Context=i==0&&!environmentFixture?"npc":"player",Position=deliveryFixture?new[]{1d,-3d,1.3}:new[]{2d+i*4,3d,0d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=.1+.7*(.5+.5*Math.Sin(sequence*.02)),Running=true,Valid=true,RiderAttached=deliveryFixture});
  runtime.Publish(new GameplayFrame{Session=runtime.Session,WorldPreparationStartedUtc=deliveryViewerFixture?Environment.GetEnvironmentVariable("RICHAUDIO_AUTHORED_WORLD_EPOCH01"):null,Listener=new ListenerState{Version=1,Session=runtime.Session,Generation=generation,Sequence=sequence++,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(sequence*50),Position=deliveryFixture?new[]{0d,-3d,1.6}:new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=pause,Valid=valid,Reason=valid?"valid":"not-ready",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null},Vehicles=vehicles.ToArray()});
 }
 static void Until(Func<bool> condition,int milliseconds,int count=1,bool pause=false){var clock=Stopwatch.StartNew();while(!condition()){if(clock.ElapsedMilliseconds>milliseconds)throw new TimeoutException(runtime.State+"; "+(Evidence()==null?"no host status":Json.Serialize(Evidence())));Feed(count,pause);Thread.Sleep(50);}}
 static void For(int milliseconds,int count=1,bool pause=false,bool valid=true){var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<milliseconds){Feed(count,pause,valid);Thread.Sleep(50);}}
 static void Settings(long revision,bool enabled=true,double volume=1){AcousticSettingsStore.Save(root,AcousticSettingsStore.DefaultPath(root),new AcousticSettings("performance","cpu",Math.Max(revision,File.Exists(AcousticSettingsStore.DefaultPath(root))?AcousticSettingsStore.Load(root,AcousticSettingsStore.DefaultPath(root)).Revision+1:1),enabled,volume,true,false,"experimental-additive",deliveryViewerFixture));}
 static float Marker(int frame){return .1f*(frame%251)/251;}
 static unsafe bool Reserve(int blocks,int callbackFrames){
  var ring=new PcmRing();var input=new float[1024];var output=new float[callbackFrames*2];int sourceFrame=0,consumedFrame=0;
  Action fill=delegate{for(int i=0;i<512;i++){input[2*i]=Marker(sourceFrame+i);input[2*i+1]=-input[2*i];}if(!ring.TryWrite(input,512))throw new Exception("test reserve overflow");sourceFrame+=512;};
  for(int i=0;i<blocks;i++)fill();
  // Reproduce the 27.24 ms measured spike plus worst-case 20 ms callback /
  // IPC scheduling phase. A blocked producer must not alter original PCM.
  for(int callback=0;callback<8;callback++){
   double timeMs=callback*callbackFrames/48d;if(timeMs>=47)while(ring.Count<blocks)fill();
   fixed(float* p=output)ring.FillCalibrated(p,callbackFrames,1);
   try{ring.RequireContinuousProducer();}catch(InvalidOperationException){Check(blocks==4,"only the rejected four-block baseline starves");Check(ring.FirstUnderflowFrame==2048,"baseline fails at its exact exhausted original frame");return false;}
   bool identical=true;for(int i=0;i<callbackFrames;i++){float expected=Marker(consumedFrame+i);if(output[2*i]!=expected||output[2*i+1]!=-expected)identical=false;}
   Check(identical,"continuous PCM identity through fractional block callbacks and producer stall");consumedFrame+=callbackFrames;
  }
  Check(ring.UnderflowFrames==0,"full reserve retains zero hidden underflow");Check(ring.ConsumedFrames==consumedFrame,"original sample clock remains exact");return true;
 }
 static void RingTests(){Check(!Reserve(4,960),"old four-block reserve reproduces starvation");Check(Reserve(PcmRing.GameplayStartupBlocks,960),"eight-block reserve covers the measured stall with20ms callbacks");Check(Reserve(PcmRing.GameplayStartupBlocks,480),"native10ms partial-block callbacks remain continuous");Check(Math.Abs(PcmRing.GameplayReserveMilliseconds-85.3333333333333)<1e-9,"explicit fixed reserve latency");}
 static void PipeTimeoutTests(){
  for(int partial=0;partial<2;partial++){string name="RichAudio.Gameplay.TimeoutTest."+Guid.NewGuid().ToString("N");using(var server=GameplayWire.Server(name))using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
   var connection=server.BeginWaitForConnection(null,null);client.Connect(1000);server.EndWaitForConnection(connection);if(partial!=0){client.Write(new byte[]{3,0},0,2);client.Flush();}
   var time=Stopwatch.StartNew();bool expired=false;try{GameplayWire.Read(server);}catch(TimeoutException){expired=true;}
   Check(expired&&time.ElapsedMilliseconds>=900&&time.ElapsedMilliseconds<2500,"real stalled pipe retains bounded one-second read deadline");
   // Cancelling the pending kernel read used to deliver an unhandled closed
   // event exception here, even after the caller caught TimeoutException.
   Thread.Sleep(100);Check(!server.IsConnected,"timed-out pipe is closed before accepting another peer");
  }}
  for(int write=0;write<2;write++){string name="RichAudio.Gameplay.AckWriteTimeoutTest."+Guid.NewGuid().ToString("N");using(var server=GameplayWire.Server(name))using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
   var connection=server.BeginWaitForConnection(null,null);client.Connect(1000);server.EndWaitForConnection(connection);var time=Stopwatch.StartNew();bool expired=false;
   try{if(write==0)TransportStop.ReadAck(server);else TransportStop.Write(server,new byte[1048576]);}catch(TimeoutException){expired=true;}
   Check(expired&&time.ElapsedMilliseconds>=200&&time.ElapsedMilliseconds<2500,"real stalled ack/write retains bounded250ms deadline");Thread.Sleep(100);Check(!server.IsConnected,"ack/write cancellation safely retires its pending kernel operation");
  }}
  string next="RichAudio.Gameplay.CompletionTest."+Guid.NewGuid().ToString("N");using(var server=GameplayWire.Server(next))using(var client=new NamedPipeClientStream(".",next,PipeDirection.InOut,PipeOptions.Asynchronous)){
   var connection=server.BeginWaitForConnection(null,null);client.Connect(1000);server.EndWaitForConnection(connection);GameplayWire.Write(client,new byte[]{7,8,9});var b=GameplayWire.Read(server);Check(b.Length==3&&b[0]==7&&b[1]==8&&b[2]==9,"a new genuine pipe preserves exact framing after timeout cancellation");
  }
 }
 static int DeliveryCase(string mode){
  Check(environmentFixture,"delivery fixture requires the actual discard-only profile");
  Until(()=>Number(Evidence(),"consumedFrames")>0,12000,0);
  owned.Add((int)Number(Evidence(),"nodePid"));For(2500,0);
  Check(Number(Worker(),"activeSources")==0&&Number(Evidence(),"underflowFrames")==0,"source-free delivery remains continuous");
  Until(()=>Number(Evidence(),"startupCreditsRetired")==2&&Number(Worker(),"activeSources")>0,4000);
  Check(Number(Evidence(),"steadyProducerCreditBlocks")==6,"steady credits use the existing six-block window");
  bool fault=mode=="--delivery-fault";
  if(fault)Until(()=>runtime.HostPid==0,12000);
  else{
   For(6500);var live=Evidence();
   Check(runtime.HostPid==owned[0]&&Number(live,"underflowFrames")==0,"sustained authored Bati playback has zero underflow");
   var world=Worker()["acousticWorld"] as Dictionary<string,object>;
   var readiness=world["environmentalReadiness01"] as Dictionary<string,object>;
   var counters=readiness["counters"] as Dictionary<string,object>;
   Check(Number(counters,"firstActivations")>0&&Number(counters,"replacements")>0,"actual worker produced nonempty consumer updates under load");
   Check(Number(Worker(),"arrivals")==1&&Number(Worker(),"retired")==0,"single source lifetime survives scene updates");
  }
  runtime.RequestStop("authored-delivery-test-complete");Check(runtime.Join(6000),"delivery fixture owner closed");
  foreach(int pid in owned)Check(!Alive(pid),"owned delivery process closed");
  var final=Evidence();
  Check(!(bool)final["endpointOpened"]&&runtime.Attempts==1,"device-free sink and one launch");
  if(mode=="--delivery-baseline"){
   Check(Number(final,"underflowFrames")==0,"uninstrumented comparator preserves continuous delivery");
   Console.WriteLine("PASS "+checks+" device-free comparator assertions");
   return 0;
  }
  string directory=Path.Combine(root,".local","gameplay",runtime.Session);
  string receipt=Path.Combine(directory,fault?"first-underflow.json":"delivery-timing.json");
  var trace=new JavaScriptSerializer{MaxJsonLength=1048576}.DeserializeObject(File.ReadAllText(receipt)) as Dictionary<string,object>;
  Check(Number(trace,"schema")==2&&Number(trace,"retiredCredits")==2,"independent receipt binds the measured steady credit window");
  Check((Number(final,"underflowFrames")>0)==fault,"a real underflow faults and never resumes");
  if(fault){
   Check(Number(trace,"firstUnderflowQpc")>0&&Number(trace,"firstUnderflowFrame")==Number(final,"firstUnderflowFrame"),"exact first underflow matches host ring");
   var sink=(object[])trace["sink"];var last=(Dictionary<string,object>)sink[sink.Length-1];
   Check((string)last["Phase"]=="sink-delivery"&&Number(last,"Amount")==Number(final,"underflowFrames"),"frozen missing frames agree with fatal callback");
   Check(Lifecycle("host","host-closed","host-fault"),"underflow exits as a host fault");
  }
  Console.WriteLine("PASS "+checks+" device-free delivery assertions "+receipt);
  return 0;
 }
 public static int Main(string[]args){
  try{RingTests();PipeTimeoutTests();if(args.Length==1&&args[0]=="--ring-only"){Console.WriteLine("PASS "+checks+" exact PCM reserve / native callback / retained starvation guard / real pipe timeout checks; no endpoint");return 0;}root=Path.GetFullPath(args[0]);var c=PlayableConfiguration.Load(Path.Combine(root,"playable.json"));environmentFixture=c.DiscardEnvironmentalOutput;deliveryFixture=args.Length==3&&args[2].StartsWith("--delivery-",StringComparison.Ordinal);deliveryViewerFixture=deliveryFixture&&args[2]=="--delivery-world-viewer";Settings(1);string pointer=Path.Combine(root,".local","fixture-pointer.json");Directory.CreateDirectory(Path.GetDirectoryName(pointer));File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=root,manifestSha256=PlayableConfiguration.Digest(c.Manifest)}));
   runtime=new GameplayRuntime(!environmentFixture);runtime.Start(pointer,c.GameExecutable,args[1]);Until(()=>runtime.Configuration!=null,5000,0);Thread.Sleep(250);Check(runtime.Attempts==0,"no host before Story readiness");runtime.SetStoryReady(true);
   Until(()=>runtime.HostPid>0,5000);owned.Add(runtime.HostPid);
   if(deliveryFixture)return DeliveryCase(args[2]);
   if(environmentFixture){
    Until(()=>Number(Evidence(),"consumedFrames")>0,12000,0);double consumed=Number(Evidence(),"consumedFrames");
    string status=Path.Combine(root,".local","gameplay",runtime.Session,"host.json");
    // A reader without FILE_SHARE_DELETE can overlap atomic replacement.
    using(var read=new FileStream(status,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))For(900,0);
    For(5500,0);
    Check(runtime.HostPid==owned[0]&&runtime.Attempts==1&&Number(Worker(),"activeSources")==0&&Number(Evidence(),"consumedFrames")>consumed,"normal discard host progresses with no source and survives temporary status contention");
   }
   Until(()=>Number(Worker(),"activeSources")>=1&&Number(Evidence(),"peak")>0,15000);owned.Add((int)Number(Evidence(),"nodePid"));Check(!(bool)Evidence()["endpointOpened"],"device-free route");Check(Number(Evidence(),"receivedSnapshots")>0,"real secured pipe snapshots");
   if(environmentFixture){
    var beforeObservation=Evidence();
    Check(!(bool)beforeObservation["fixture"]&&(string)beforeObservation["outputSink"]=="environment-observation"&&beforeObservation["outputMetrics"]==null,"normal owner and immutable observation sink have no endpoint");
    Check(Number(beforeObservation,"underflowFrames")==0,"device-free observation ring reports underflows");
    Settings(2,true,.4);Until(()=>Number(Worker(),"outputLevel")==.4,3000);
    Check(!(bool)Evidence()["endpointOpened"]&&Evidence()["outputMetrics"]==null,"settings cannot open the endpoint");
    string mode=args.Length==3?args[2]:"--kill-host";
    bool disable=mode=="--disable",graceful=mode=="--graceful";
    int failedHost=runtime.HostPid;
    if(disable)Settings(3,false);
    else if(graceful)runtime.RequestStop("fixture-coordinator-stop");
    else using(var process=Process.GetProcessById(mode=="--kill-producer"?owned[1]:failedHost))process.Kill();
    Until(()=>runtime.HostPid==0,5000,0);For(1000);
    if(disable){Settings(4);For(1000);}
    Check(runtime.Attempts==1,"disabled or failed observation host never relaunches");
    runtime.RequestStop();Check(runtime.Join(6000),"observation supervisor joined");
    foreach(int pid in owned)Check(!Alive(pid),"observation host and producer exited");
    Check(Lifecycle("runtime","host-exit-observed",null),"supervisor retained independently observed host exit");
    if(disable||graceful){
     Check(Lifecycle("host","producer-stop-requested","host-stop"),"host requested graceful Node closure before Job disposal");
     Check(Lifecycle("host","producer-exit-observed","owned-child")&&!Lifecycle("host","forced-containment-close",null),"host confirmed producer exited without force");
     Check(Lifecycle("runtime","host-stop-observed",disable?"settings-stock-fallback":"fixture-coordinator-stop"),"supervisor preserved distinct stop reason");
    }else if(mode=="--kill-producer")Check(Lifecycle("host","producer-exit-observed","owned-child"),"host preserved abrupt producer exit");
    else Check(Lifecycle("runtime","host-stop-observed","host-exited")&&!Lifecycle("host","host-closed",null),"abrupt host exit remains distinguishable from graceful closure");
    string result=Json.Serialize(new{passed=true,checks=checks,endpointOpened=false,attempts=runtime.Attempts,disabled=disable,observation=beforeObservation});
    File.WriteAllText(Path.Combine(root,".local",disable?"observation-disable-fixture-result.json":"observation-fixture-result.json"),result);
    Console.WriteLine("PASS "+checks+" device-free normal observation-chain assertions");
    return 0;
   }
   Until(()=>Number(Worker(),"activeSources")==2,4000,2);Check(Number(Worker(),"activeSources")==2,"two independent stock sources");Until(()=>Number(Worker(),"retired")>=1,3000,1);Check(Number(Worker(),"retired")>=1,"missing identity retires");
   Settings(2,true,.4);Until(()=>Number(Worker(),"outputLevel")==.4,3000);Check(Number(Worker(),"outputLevel")==.4,"settings applied through real producer");
   // Pause/resume both change listener generation, matching the RPH adapter.
   For(700,1,true);For(700);Until(()=>Number(Worker(),"activeSources")==0,3000,0);Check(Number(Worker(),"activeSources")==0,"no indefinite unknown source");For(700,1);
   Until(()=>Number(Worker(),"activeSources")>=1&&Number(Worker(),"selectedPaths")>0,5000);
   int gapHost=runtime.HostPid,gapAttempts=runtime.Attempts;double preGapArrivals=Number(Worker(),"arrivals");
   // Stop publishing entirely, as GTA can do while backgrounded or paused.
   // This exceeds the rejected five-second watchdog and two-second acoustic
   // tail bound; no mock listener or artificial valid observation fills it.
   Thread.Sleep(6200);var quiet=Evidence();var quietWorker=Worker();
   Check(runtime.HostPid==gapHost&&Alive(gapHost),"healthy owned host survives a greater-than-five-second observation gap");
   Check(runtime.Attempts==gapAttempts,"observation loss does not spend the recovery budget");
   Check(Number(quietWorker,"activeSources")==0&&Number(quietWorker,"selectedPaths")==0,"expired listener/source evidence retires every active emitter and path");
   Check(quiet!=null&&quiet.ContainsKey("sumSquares"),"actual native consumer reports cumulative output energy");double quietEnergy=Number(quiet,"sumSquares"),quietFrames=Number(quiet,"consumedFrames");
   Thread.Sleep(1000);var quietLater=Evidence();Check(Number(quietLater,"consumedFrames")>quietFrames+24000,"native PCM consumption continues during absent observations");
   Check(Number(quietLater,"sumSquares")==quietEnergy,"expired-source output is sample-exact silence after genuine acoustic tails");
   Check(Number(quietLater,"underflowFrames")==0,"observation loss does not cause PCM starvation");
   Until(()=>Number(Worker(),"activeSources")>=1&&Number(Worker(),"selectedPaths")>0&&Number(Worker(),"arrivals")>preGapArrivals&&Number(Evidence(),"sumSquares")>quietEnergy+1e-8,5000);
   Check(runtime.HostPid==gapHost&&runtime.Attempts==gapAttempts,"new genuine observations resume audible PCM without a replacement host");
   var before=Evidence();Check(Number(Worker(),"missingHistory")==0,"no source history violations");Check(Number(Worker(),"limitedSamples")==0,"no hidden limiter");Check(Number(before,"peak")<1,"digital headroom");
   var stages=Worker()["stageCounters"] as Dictionary<string,object>;Check(Number(stages,"validVehicleObservations")>0&&Number(stages,"eligibleVehicleBlocks")>0&&Number(stages,"sourceCreations")>0,"valid injected observations resolve genuine supported source banks");
   foreach(string role in new[]{"engine","exhaust","stereo"}){var pcm=stages[role] as Dictionary<string,object>;Check(Number(pcm,"nonzeroBlocks")>0&&Number(pcm,"sumSquares")>0&&Number(pcm,"peak")>0&&Number(pcm,"peak")<1,"actual "+role+" PCM is nonzero and bounded");}
   Check(Number(stages,"acousticPathBlocks")>0&&Number(before,"sumSquares")>0,"post-propagation PCM reaches the actual host native ring");
   Check(Number(before,"underflowFrames")==0,"actual native-ring fixture applies fatal WASAPI underflow guard");Check(Number(before,"fixtureCallbackFrames")==960,"actual fixture uses native20ms callbacks across512-frame source boundaries");Check(Number(before,"producerStartupBlocks")==8,"real owned chain uses declared bounded reserve");
   int first=runtime.HostPid;Settings(3,false);Until(()=>runtime.HostPid==0,5000,0);Check(!Alive(first),"disabled host cleaned");Settings(4);Until(()=>runtime.HostPid>0,5000);owned.Add(runtime.HostPid);Until(()=>Number(Evidence(),"peak")>0,10000);
   // Kill actual host; job disposal must retire its real Node descendants.
   int crash=runtime.HostPid;using(var p=Process.GetProcessById(crash))p.Kill();Until(()=>runtime.HostPid!=0&&runtime.HostPid!=crash,10000);owned.Add(runtime.HostPid);Until(()=>Number(Evidence(),"peak")>0,10000);
   owned.Add((int)Number(Evidence(),"nodePid"));int last=runtime.HostPid;runtime.RequestStop();Check(runtime.Join(6000),"supervisor stopped");Check(!Alive(last),"no owned host after unload");foreach(int id in owned)if(id>0)Check(!Alive(id),"old hosts and Node children remain dead");
   string report=Json.Serialize(new{schema=1,checks=checks,actualComponents=true,gameGetters="injected; live unverified",endpointOpened=false,automaticStart=true,independentSources=2,recoveryAttempts=runtime.Attempts,cleanup=true,snapshotGap=new{milliseconds=7200,hostRestarted=false,expiredSources=Number(quietWorker,"activeSources"),expiredPaths=Number(quietWorker,"selectedPaths"),silentNativeFrames=Number(quietLater,"consumedFrames")-quietFrames,outputEnergyDelta=Number(quietLater,"sumSquares")-quietEnergy,resumedActualPcm=true},measurement=before});File.WriteAllText(Path.Combine(root,".local","gameplay-fixture-result.json"),report);Console.WriteLine(report);return 0;
  }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}finally{if(runtime!=null){runtime.RequestStop();runtime.Join(6000);}}
 }
 static bool Alive(int id){try{using(var p=Process.GetProcessById(id))return !p.HasExited;}catch(ArgumentException){return false;}}
}
