// Actual owned runtime/pipe/Node/stock-source/renderer/RA07/ring fixture.
// Only authored observations and the final device-free sink are substituted.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

internal static class TestBatiPlaybackSession
{
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=32};
 static BatiPlaybackSession current;
 static string root,pointer,game;
 static long sequence;
 static int checks;
 static readonly List<object> observations=new List<object>();
 static void Check(bool value,string label){checks++;if(!value)throw new Exception(label);}
 static Dictionary<string,object> Read(string path){try{return Json.DeserializeObject(File.ReadAllText(path))as Dictionary<string,object>;}catch(IOException){return null;}}
 static Dictionary<string,object> Evidence(){return current==null?null:Read(Path.Combine(root,".local","gameplay",current.Session,"host.json"));}
 static Dictionary<string,object> Part(Dictionary<string,object> value,string key){object result;return value!=null&&value.TryGetValue(key,out result)?result as Dictionary<string,object>:null;}
 static double Number(Dictionary<string,object> value,string key){object result;return value!=null&&value.TryGetValue(key,out result)&&result!=null?Convert.ToDouble(result):0;}
 static bool Nonzero(){
  var host=Evidence();var stages=Part(Part(host,"worker"),"stageCounters");
  return current.HostPid>0&&Number(host,"hostPid")==current.HostPid&&host!=null&&Convert.ToString(host["hostState"])=="running"
   &&Number(Part(stages,"engine"),"nonzeroBlocks")>0&&Number(Part(stages,"exhaust"),"nonzeroBlocks")>0&&Number(Part(stages,"stereo"),"nonzeroBlocks")>0&&Number(host,"sumSquares")>0;
 }
 static GameplayFrame Frame(uint model=0xf9300cc5u){
  long now=Stopwatch.GetTimestamp(),n=sequence++;
  float ratio=(float)(.2+.6*(.5+.5*Math.Sin(n*.035)));
  return new GameplayFrame{Session=current.Session,ValidThroughTicks=now+Stopwatch.Frequency/5,
   Listener=new ListenerState{Version=1,Session=current.Session,Generation=1,Sequence=n,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,
    GameTimeMs=n*25,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{Math.Sin(n*.002),Math.Cos(n*.002),0d},Up=new[]{0d,0d,1d},
    ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=false,Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"},
   Vehicles=new[]{new GameplayVehicle{Id="accepted-Bati-fixture",Generation=1,ObservationTicks=now,Model=model,Context="player",
    Position=new[]{2d,4d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=(double)ratio,Running=true,Valid=true}}};
 }
 static void Feed(){var f=Frame();if(!current.PublishAccepted(f,f.ValidThroughTicks))throw new Exception("fixture observation rejected: "+current.State);}
 static void Until(Func<bool> condition,int milliseconds,bool feed){
  var clock=Stopwatch.StartNew();
  while(!condition()){
   if(clock.ElapsedMilliseconds>milliseconds)throw new TimeoutException(current.State+"; "+(Evidence()==null?"no host evidence":Json.Serialize(Evidence())));
   if(feed)Feed();Thread.Sleep(25);
  }
 }
 static void For(int milliseconds,bool feed){var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<milliseconds){if(feed)Feed();Thread.Sleep(25);}}
 static void Start(){
  current=new BatiPlaybackSession(Guid.NewGuid().ToString("N"),true,false,false);sequence=0;current.Start(pointer,game);
  Until(()=>current.Configuration!=null,10000,false);Check(current.HostPid==0&&current.Attempts==0,"configuration alone opens no host");
 }
 static void Stop(){if(current!=null){current.Stop();Check(current.Join(10000),"owned session and expiry worker join");Check(current.HostPid==0,"owned host lifetime ended");current=null;}}
 static void Record(string name){
  var evidence=Evidence();Check(evidence!=null&&evidence.ContainsKey("endpointOpened")&&!(bool)evidence["endpointOpened"],"final sink is device-free");
  Check(Number(evidence,"underflowFrames")==0,"actual ring has no hidden starvation");
  observations.Add(new{name=name,session=current.Session,attempts=current.Attempts,evidence=evidence});
 }
 public static int Main(string[]args){
  try{
   if(args.Length!=2)throw new ArgumentException("new Bati candidate and private fixture report required");
   root=Path.GetFullPath(args[0]);var config=PlayableConfiguration.Load(Path.Combine(root,"playable.json"));
   if(config.DemoProfile!="PLAYABLE-13")throw new InvalidDataException("new13 package required");
   game=config.GameExecutable;string settingsPath=AcousticSettingsStore.DefaultPath(root),settingsBefore=PlayableConfiguration.Digest(settingsPath);
   var settings=AcousticSettingsStore.Load(root,settingsPath);
   Check(settings.RichAudioEnabled&&settings.IntegrationMode=="experimental-additive"&&!settings.SoundMapVisible,"isolated prepared Bati settings");
   pointer=Path.Combine(root,".local","bati-fixture-pointer-"+Guid.NewGuid().ToString("N")+".json");
   File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=root,manifestSha256=PlayableConfiguration.Digest(config.Manifest)}));
   bool denied=false;try{new BatiPlaybackSession("invalid-session",true);}catch(ArgumentException){denied=true;}Check(denied,"malformed shared session denied");
   denied=false;try{new BatiPlaybackSession(Guid.NewGuid().ToString("N"),true,false,true);}catch(ArgumentException){denied=true;}Check(denied,"loopback needs explicit recording permission");
   current=new BatiPlaybackSession(Guid.NewGuid().ToString("N"),true);current.Start(Path.Combine(root,".local","absent-pointer-"+Guid.NewGuid().ToString("N")+".json"),game);current.Enable();
   Until(()=>current.Retired,2500,false);Check(current.Attempts==0&&current.HostPid==0&&!current.Enable(),"invalid pointer retires without host or waiting forever");
   string initialReason=current.RetirementReason;current.Disable();Check(current.RetirementReason==initialReason,"disable preserves first initialization failure");Stop();
   Start();Check(current.Enable(),"explicit enable arms");
   For(250,false);Check(current.HostPid==0&&current.Attempts==0,"enable without fresh accepted state opens no host");
   current.Disable();For(300,true);Check(current.HostPid==0&&current.Attempts==0,"fresh evidence without user enable opens no host");
   Check(current.Enable(),"explicit enable while provider fresh");
   Until(()=>Nonzero(),15000,true);Check(current.Attempts==1,"one actual owned host start");Record("first-enabled-engine-exhaust-stereo");
   int first=current.HostPid;using(var old=Process.GetProcessById(first)){current.Disable();Until(()=>current.HostPid==0,10000,true);Check(old.HasExited,"explicit disable observes old host exit");}
   var faded=Evidence();Check(faded!=null&&Convert.ToString(faded["hostState"])=="stopped"&&Number(faded,"sumSquares")>0,"controlled stop retains actual nonzero playback evidence");
   Check(Number(faded,"fixtureTrailingSilentFrames")>=960&&Number(faded,"fixtureLastPeak")==0,"actual post-gain ring PCM reaches exact zero before controlled host exit");
   Check(faded.ContainsKey("fadeReserveConsumed")&&(bool)faded["fadeReserveConsumed"],"controlled shutdown consumes queued PCM and renderer fade");
   observations.Add(new{name="controlled-disable-final-sink-silence",session=current.Session,evidence=faded});
   Check(!current.Retired,"explicit disable preserves fresh provider eligibility");
   Check(current.Enable(),"explicit re-enable while provider fresh");Until(()=>current.HostPid!=0&&current.HostPid!=first&&Nonzero(),15000,true);
   Check(current.Attempts==2,"only explicit re-enable restarts playback");Record("explicit-reenable");
   int failed=current.HostPid;using(var owned=Process.GetProcessById(failed))owned.Kill();
   Until(()=>current.Retired,5000,false);Until(()=>current.HostPid==0,10000,false);
   int attempts=current.Attempts;For(500,false);Check(current.Attempts==attempts&&!current.Enable(),"host fault has no automatic restart or revival");
   Stop();
   Start();Check(current.Enable(),"second independent fixture session enabled");Until(()=>Nonzero(),15000,true);Record("before-complete-feed-loss");
   var last=Frame();Check(current.PublishAccepted(last,last.ValidThroughTicks),"last original expiry admitted");
   long expiry=last.ValidThroughTicks;Until(()=>current.Retired,1500,false);double delay=(Stopwatch.GetTimestamp()-expiry)*1000d/Stopwatch.Frequency;
   Check(delay>=0&&delay<250,"independent expiry watchdog retires without game-fiber publication");
   Check(!current.Enable()&&!current.PublishAccepted(Frame(),Stopwatch.GetTimestamp()+Stopwatch.Frequency/5),"expired provider cannot revive");
   Until(()=>current.HostPid==0,10000,false);Stop();
   Start();Check(current.Enable(),"driver-loss fixture enabled");Until(()=>Nonzero(),15000,true);Record("before-driver-loss-retirement");
   int driverLossAttempts=current.Attempts;current.Retire("rph-current-driver-changed");
   Check(current.Retired&&current.RetirementReason=="rph-current-driver-changed","driver loss preserves concrete terminal reason");
   Check(!current.Enable(),"driver-loss session cannot be re-enabled");
   var remount=Frame();Check(!current.PublishAccepted(remount,remount.ValidThroughTicks),"remount cannot republish a retired source");
   Until(()=>current.HostPid==0,10000,false);
   var driverStop=Evidence();Check(driverStop!=null&&Convert.ToString(driverStop["hostState"])=="stopped","driver loss observes clean host shutdown");
   Check(Number(driverStop,"fixtureTrailingSilentFrames")>=960&&Number(driverStop,"fixtureLastPeak")==0,"driver-loss retirement fades actual output ring to exact zero");
   Check(driverStop.ContainsKey("fadeReserveConsumed")&&(bool)driverStop["fadeReserveConsumed"],"driver-loss retirement consumes queued PCM and fade");
   For(300,false);Check(current.Attempts==driverLossAttempts,"retired driver-loss source cannot restart playback");
   observations.Add(new{name="driver-loss-terminal-fade-and-no-replay",session=current.Session,evidence=driverStop});Stop();
   Start();Check(current.Enable(),"scope-denial fixture armed");var wrong=Frame(0xa774b5a6u);
   Check(!current.PublishAccepted(wrong,wrong.ValidThroughTicks)&&current.Retired&&current.Attempts==0,"non-Bati scope rejected before host start");Stop();
   Check(PlayableConfiguration.Digest(settingsPath)==settingsBefore,"all isolated saved preferences unchanged");
   var result=new{schema=1,profile="PLAYABLE-13",kind="gated-Bati-actual-production-components-fixture",passed=true,checks=checks,
    fixtureOnly=true,observations="authored contract-valid player-Bati frames, not live GTA",sourceMaterial="existing genuine Rockstar Bati player bank",
    actualOwnedRuntime=true,actualSecuredPipe=true,actualSourceRendererRa07Ring=true,observationsAndMeasurements=observations,
    gameStarted=false,gameFilesWritten=false,endpointOpened=false,audioPlayed=false,recordingAllowed=false,loopbackAllowed=false,
    savedPreferencesUnchanged=true,automaticHostFaultRestart=false,independentExpiryDelayMs=delay};
   if(File.Exists(args[1]))throw new IOException("fresh fixture report only");File.WriteAllText(args[1],Json.Serialize(result));
   Console.WriteLine("PASS "+checks+" gated Bati actual-component checks; no audio endpoint; "+args[1]);return 0;
  }catch(Exception error){Console.Error.WriteLine(error.ToString());return 1;}
  finally{if(current!=null){current.Stop();current.Join(10000);}}
 }
}
