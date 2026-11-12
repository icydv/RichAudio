// Authored executable/host peers. Real Windows job/process and v1 named-pipe
// code run, but no GTA, SHVDNE runtime, audio device or renderer is loaded.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.Serialization.Json;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;
using RichAudio.Integration;
[assembly:AssemblyFileVersion("1.0.1158.16")]

public sealed class ShvdneDomainFixture : MarshalByRefObject {
 ShvdneHostController controller;
 public int Start(string pointer,string game,string api){
  controller=new ShvdneHostController(true);controller.Start(pointer,game,api);controller.SetStoryReady(true);
  var timer=Stopwatch.StartNew();while(controller.HostPid==0){if(timer.ElapsedMilliseconds>8000)throw new TimeoutException(controller.State);Thread.Sleep(20);}return controller.HostPid;
 }
 public override object InitializeLifetimeService(){return null;}
}

internal static class TestShvdneHost {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static int checks;static long sequence;static string package,pointer,game,api;
 static void Check(bool value,string why){if(!value)throw new Exception(why);checks++;Console.WriteLine("PASS "+why);}
 static void Reject(Action action,string why){bool rejected=false;try{action();}catch(InvalidDataException){rejected=true;}Check(rejected,why);}
 static void Until(Func<bool> predicate,int milliseconds,string why,Action tick=null){var timer=Stopwatch.StartNew();while(!predicate()){if(timer.ElapsedMilliseconds>milliseconds)throw new TimeoutException(why);if(tick!=null)tick();Thread.Sleep(30);}}
 static Dictionary<string,object> Status(ShvdneHostController controller){try{string path=Path.Combine(package,".local","gameplay",controller.Session,"host.json");return Json.DeserializeObject(File.ReadAllText(path)) as Dictionary<string,object>;}catch(IOException){return null;}}
 static long Received(ShvdneHostController controller){var s=Status(controller);return s==null?0:Convert.ToInt64(s["receivedSnapshots"]);}
 static GameplayFrame Frame(string session,long ticks=-1){
  if(ticks<0)ticks=Stopwatch.GetTimestamp();
  return new GameplayFrame{Session=session,Vehicles=new[]{new GameplayVehicle{Id="vehicle-authored-1",Generation=2,ObservationTicks=ticks,Model=0xf9300cc5,Context="player",Position=new[]{1d,2d,3d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=.4,Running=true,Valid=true,RiderAttached=true}},Listener=new ListenerState{Version=1,Session=session,Generation=1,Sequence=sequence++,ObservationTicks=ticks,ClockFrequency=Stopwatch.Frequency,GameTimeMs=100,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="unavailable",Coordinates="gta-native-unscaled",Units="native-unverified",Valid=true,Reason="valid"}};
 }
 static PlayableConfiguration Configuration(){return new PlayableConfiguration{Schema=1,GameExecutable=game,GameVersion="1.0.1158.16",GameSha256=PlayableConfiguration.Digest(game),IntegrationFramework="shvdne",IntegrationVersion="1.1.0.6",IntegrationAssemblySha256=PlayableConfiguration.ShvdneApi3Sha256,Eligible=new[]{new PlayableModel{Model=0xf9300cc5,Context="player"}},PlayerManifest="player.json",NpcManifest="npc.json",Atlas="atlas.json",Profiles="profiles.json",Catalog="catalog.json",CatalogSha256=new string('a',64)};}
 static void Prepare(string output){
  package=Path.Combine(output,"package");Directory.CreateDirectory(package);Directory.CreateDirectory(Path.Combine(package,"runtime"));Directory.CreateDirectory(Path.Combine(package,"tools"));
  game=Assembly.GetExecutingAssembly().Location;File.Copy(game,Path.Combine(package,"runtime","RichAudio.Acoustics.Host.exe"));
  var files=new[]{"runtime/node.exe","tools/Run-Gameplay.mjs","player.json","npc.json","atlas.json","profiles.json","catalog.json"};
  foreach(string file in files)File.WriteAllText(Path.Combine(package,file),"authored lifecycle fixture; never executed");
  var bindings=new List<PlayableBinding>();foreach(string file in files)bindings.Add(new PlayableBinding{File=file,Sha256=PlayableConfiguration.Digest(Path.Combine(package,file))});
  bindings.Add(new PlayableBinding{File="runtime/RichAudio.Acoustics.Host.exe",Sha256=PlayableConfiguration.Digest(Path.Combine(package,"runtime","RichAudio.Acoustics.Host.exe"))});
  var c=Configuration();c.Bindings=bindings.ToArray();string manifest=Path.Combine(package,"playable.json");using(var file=File.Create(manifest))new DataContractJsonSerializer(typeof(PlayableConfiguration)).WriteObject(file,c);
  pointer=Path.Combine(output,"pointer.json");File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=package,manifestSha256=PlayableConfiguration.Digest(manifest)}));
  AcousticSettingsStore.Save(package,AcousticSettingsStore.DefaultPath(package),new AcousticSettings("performance","cpu",1,true,1,true,false,"experimental-additive"));
 }
 static void ConfigChecks(){
  var c=Configuration();PlayableConfiguration.ValidateIntegration(c);Check(c.Shvdne,"explicit SHVDNE package admitted");
  c.ValidateRuntimeAssembly(api,"shvdne");Check(true,"authentic pinned API3 bytes validated without loading assembly");
  Reject(()=>c.ValidateRuntimeAssembly(api,"rph"),"RPH adapter cannot load SHVDNE package");
  c.RphVersion="1.132.1428.17748";Reject(()=>PlayableConfiguration.ValidateIntegration(c),"SHVDNE manifest rejects hidden RPH version binding");c.RphVersion=null;
  c.IntegrationVersion="1.1.0.7";Reject(()=>PlayableConfiguration.ValidateIntegration(c),"unreviewed distribution version rejected");c.IntegrationVersion="1.1.0.6";
  c.IntegrationAssemblySha256=new string('a',64);Reject(()=>PlayableConfiguration.ValidateIntegration(c),"unreviewed API binary rejected");
  var legacy=new PlayableConfiguration{RphVersion="1.132.1428.17748"};PlayableConfiguration.ValidateIntegration(legacy);Check(!legacy.Shvdne,"omitted adapter fields retain existing RPH validation");
  Reject(()=>legacy.ValidateRuntimeAssembly(api,"shvdne"),"SHVDNE cannot load legacy RPH manifest");
  legacy.RphVersion=null;Reject(()=>PlayableConfiguration.ValidateIntegration(legacy),"missing legacy RPH identity fails closed");
  legacy.DemoProfile="PLAYABLE-13";PlayableConfiguration.ValidateIntegration(legacy);Check(true,"existing isolated Bati demo contract retained");
 }
 static int Host(string[] args){
  string root=Path.GetDirectoryName(args[1]),session=args[5],directory=Path.Combine(root,".local","gameplay",session);int owner=int.Parse(args[3]);Directory.CreateDirectory(directory);
  var started=Stopwatch.StartNew();while(!File.Exists(args[7])){if(started.ElapsedMilliseconds>5000)return 10;Thread.Sleep(10);}
  string modeFile=Path.Combine(root,"host-mode.txt"),mode=File.Exists(modeFile)?File.ReadAllText(modeFile):"normal";
  if(mode=="exit")return 7;
  using(var signal=GameplayStopSignal.Open(owner,session)){
   if(mode=="stall"){while(true)Thread.Sleep(1000);}
   long received=0;bool forcedReconnect=false;
   Action status=()=>File.WriteAllText(Path.Combine(directory,"host.json"),Json.Serialize(new{hostState="authored-peer",receivedSnapshots=received,session=session}));status();
   while(!signal.WaitOne(0)){
    using(var pipe=GameplayWire.Server(args[6])){
     var pending=pipe.BeginWaitForConnection(null,null);while(!pending.AsyncWaitHandle.WaitOne(25)){status();if(signal.WaitOne(0))return 0;}pipe.EndWaitForConnection(pending);pending.AsyncWaitHandle.Close();GameplayWire.Peer(pipe,owner,true);
     try{while(!signal.WaitOne(0)){
      var frame=GameplayWire.Decode(GameplayWire.Read(pipe),session);if(frame.Listener.ObservationTicks>Stopwatch.GetTimestamp())return 11;
      received++;TransportStop.Write(pipe,new[]{TransportStop.Accepted});status();
      File.WriteAllBytes(Path.Combine(directory,"last-frame.json"),GameplayWire.Encode(frame,session));
      if(!forcedReconnect){forcedReconnect=true;break;}
     }}catch(IOException){}catch(TimeoutException){}
    }
   }
  }return 0;
 }
 static void LifecycleChecks(){
  string firstSession;int firstPid;
  using(var controller=new ShvdneHostController(true)){
   firstSession=controller.Session;Check(controller.Attempts==0&&controller.HostPid==0,"constructed controller starts no process");
   var timer=Stopwatch.StartNew();controller.Start(pointer,game,api);timer.Stop();Check(timer.ElapsedMilliseconds<250,"Start returns before worker validation and launch");
   Until(()=>controller.Configuration!=null,5000,"configuration: "+controller.State);Thread.Sleep(250);Check(controller.Attempts==0,"Story readiness gates automatic launch");
   controller.SetStoryReady(true);Until(()=>controller.HostPid>0,5000,"automatic owned host launch");firstPid=controller.HostPid;Check(controller.Attempts==1,"automatic launch needs no manually started host");
   var frame=Frame(controller.Session);Check(controller.Publish(frame),"fresh session frame accepted");Check(!controller.Publish(frame),"repeated source sequence rejected");Check(!controller.Publish(Frame(Guid.NewGuid().ToString("N"))),"foreign reload session rejected");
   Until(()=>Received(controller)>=3,6000,"actual pipe transport/reconnection",()=>controller.Publish(Frame(controller.Session)));Check(Received(controller)>=3,"v1 transport reconnects to exact owned peer");
   string path=Path.Combine(package,".local","gameplay",controller.Session,"last-frame.json");var decoded=GameplayWire.Decode(File.ReadAllBytes(path),controller.Session);Check(decoded.Version==1&&decoded.Vehicles[0].Generation==2&&decoded.Vehicles[0].OperatingPoint==.4&&decoded.Vehicles[0].RiderAttached==true,"existing schema and source chronology cross the IPC boundary unchanged");
   Thread.Sleep(300);long before=Received(controller);controller.Publish(Frame(controller.Session,Stopwatch.GetTimestamp()-Stopwatch.Frequency));Thread.Sleep(350);Check(Received(controller)==before,"stale mailbox frame is not renewed or delivered");
   timer.Restart();controller.RequestStop("fixture-normal-stop");timer.Stop();Check(timer.ElapsedMilliseconds<250,"normal stop callback does not join processes");Check(controller.Join(7000),"worker completes bounded graceful shutdown");Check(controller.HostPid==0,"graceful shutdown clears owned host");
   bool exited;try{using(var p=Process.GetProcessById(firstPid))exited=p.HasExited;}catch(ArgumentException){exited=true;}Check(exited,"normal shutdown leaves no fixture host");
   Check(!controller.Publish(Frame(controller.Session)),"stopped producer cannot republish");
  }
  File.WriteAllText(Path.Combine(package,"host-mode.txt"),"stall");
  using(var controller=new ShvdneHostController(true)){
   Check(controller.Session!=firstSession,"script reload gets a new independent session");controller.Start(pointer,game,api);controller.SetStoryReady(true);Until(()=>controller.HostPid>0,5000,"reload host");
   using(var p=Process.GetProcessById(controller.HostPid)){
    var timer=Stopwatch.StartNew();controller.AbortAndCloseContainment("authored-aborted-callback");timer.Stop();Check(timer.ElapsedMilliseconds<250,"aborted callback closes containment without worker wait");Check(p.WaitForExit(2000),"hung child terminated by kill-on-close containment");
   }Check(controller.Join(7000),"aborted controller worker retires");
  }
  File.WriteAllText(Path.Combine(package,"host-mode.txt"),"normal");
  var domain=AppDomain.CreateDomain("authored-shvdne-reload",null,new AppDomainSetup{ApplicationBase=Path.GetDirectoryName(game)});
  try{
   var proxy=(ShvdneDomainFixture)domain.CreateInstanceFromAndUnwrap(game,typeof(ShvdneDomainFixture).FullName);int pid=proxy.Start(pointer,game,api);
   using(var p=Process.GetProcessById(pid)){AppDomain.Unload(domain);domain=null;Check(p.WaitForExit(2000),"actual managed AppDomain unload closes host containment");}
  }finally{if(domain!=null)AppDomain.Unload(domain);}
  File.WriteAllText(Path.Combine(package,"host-mode.txt"),"exit");
  using(var controller=new ShvdneHostController(true)){
   controller.Start(pointer,game,api);controller.SetStoryReady(true);
   Until(()=>controller.State.IndexOf("recovery budget exhausted",StringComparison.Ordinal)>=0,12000,"bounded failed-host recovery");
   Check(controller.Attempts==3,"host failure retries stop at existing three-fault budget");
   Check(controller.HostPid==0,"failed hosts leave no active process identity");
   controller.RequestStop("fixture-failure-stop");Check(controller.Join(3000),"failed supervisor stops normally");
  }
  File.WriteAllText(Path.Combine(package,"host-mode.txt"),"normal");
  using(var controller=new ShvdneHostController(true)){
   controller.Start(Path.Combine(package,"missing-pointer.json"),game,api);Check(controller.Join(3000),"missing package reaches terminal failure");Check(controller.HostPid==0&&controller.Attempts==0,"invalid package never launches host");
  }
  using(var signal=GameplayStopSignal.Create(Process.GetCurrentProcess().Id,Guid.Empty.ToString("N"))){bool duplicate=false;try{using(var ignored=GameplayStopSignal.Create(Process.GetCurrentProcess().Id,Guid.Empty.ToString("N"))) {}}catch(InvalidOperationException){duplicate=true;}Check(duplicate,"preexisting shutdown channel is rejected");}
 }
 static int Main(string[] args){
  try{
   if(args.Length==8&&args[0]=="--gameplay-fixture")return Host(args);
   if(args.Length!=2)throw new ArgumentException("fresh fixture directory and authentic API3 path required");api=Path.GetFullPath(args[1]);Prepare(Path.GetFullPath(args[0]));ConfigChecks();LifecycleChecks();
   File.WriteAllText(Path.Combine(args[0],"result.json"),Json.Serialize(new{passed=true,checks=checks,scope="authored offline host peer, real Windows ownership and IPC; no GTA or endpoint"}));Console.WriteLine("PASS SHVDNE host boundary: "+checks+" checks; no GTA or audio endpoint");return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
}
