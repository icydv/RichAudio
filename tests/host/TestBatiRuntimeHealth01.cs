// Actual owned runtime/host/Node chain; authored PCM package and device-free sink.
using System;using System.IO;using System.Diagnostics;using System.Threading;using System.Collections.Generic;using System.Web.Script.Serialization;using RichAudio.Beacon.Windows;using RichAudio.Beacon.Transport;
internal static class TestBatiRuntimeHealth01 {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=32};
 static BatiPlaybackSession current;static long seq;static string root;static readonly List<object> samples=new List<object>();
 static GameplayFrame Frame(){long now=Stopwatch.GetTimestamp(),n=seq++;return new GameplayFrame{Session=current.Session,ValidThroughTicks=now+Stopwatch.Frequency/5,
  Listener=new ListenerState{Version=1,Session=current.Session,Generation=1,Sequence=n,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,GameTimeMs=n*25,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{Math.Sin(n*.002),Math.Cos(n*.002),0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=false,Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"},
  Vehicles=new[]{new GameplayVehicle{Id="original-procedural-Bati",Generation=1,ObservationTicks=now,Model=0xf9300cc5,Context="player",Position=new[]{2d,4d,1d},Velocity=new[]{0d,12d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=.5+.2*Math.Sin(n*.035),Running=true,Valid=true,RiderAttached=true,RiderViewAttached=true}}};}
 static string DirectoryPath{get{return Path.Combine(root,".local","gameplay",current.Session);}}
 static Dictionary<string,object> Read(){try{return Json.DeserializeObject(File.ReadAllText(Path.Combine(DirectoryPath,"host.json")))as Dictionary<string,object>;}catch(IOException){return null;}}
 static double N(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToDouble(v):0;}
 static Dictionary<string,object> P(Dictionary<string,object>d,string k){object v;return d!=null&&d.TryGetValue(k,out v)?v as Dictionary<string,object>:null;}
 static void Need(bool v,string s){if(!v)throw new Exception(s);}
 public static int Main(string[]args){bool passed=false,joined=false;string error=null;var total=Stopwatch.StartNew();try{
  root=Path.GetFullPath(args[0]);int seconds=int.Parse(args[2]);var config=PlayableConfiguration.Load(Path.Combine(root,"playable.json"));
  string pointer=Path.Combine(root,".local","fixture-pointer.json");File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=root,manifestSha256=PlayableConfiguration.Digest(config.Manifest)}));
  current=new BatiPlaybackSession(Guid.NewGuid().ToString("N"),true);current.Start(pointer,config.GameExecutable);current.Enable();
  string control=args.Length>3?args[3]:"none";var active=Stopwatch.StartNew();bool started=false,injected=false;long lastSample=-1000;double priorBlocks=0;
  while(!started||active.Elapsed.TotalSeconds<seconds){Need(total.Elapsed.TotalSeconds<seconds+20,"bounded fixture duration");
   if(current.Retired){Need(control!="none"&&injected,"unexpected retirement: "+current.State);break;}
   if(started&&active.Elapsed.TotalSeconds>=3&&!injected&&control!="none"){injected=true;if(control=="withhold-status")File.WriteAllText(Path.Combine(DirectoryPath,"fixture-withhold-status"),"test-only publication withdrawal");else if(control=="kill-producer"){var state=Read();using(var child=Process.GetProcessById((int)N(state,"nodePid")))child.Kill();}else throw new Exception("Unknown failure control");}
   var f=Frame();bool accepted=current.PublishAccepted(f,f.ValidThroughTicks);if(!accepted&&control!="none"&&injected&&current.Retired)break;Need(accepted,"fresh authored frame rejected: "+current.State);
   if(total.ElapsedMilliseconds-lastSample>=600){lastSample=total.ElapsedMilliseconds;var s=Read();if(s!=null){var worker=P(s,"worker");var stages=P(worker,"stageCounters");double blocks=N(s,"receivedBlocks");
    if(!started&&N(P(stages,"engine"),"nonzeroBlocks")>0&&N(P(stages,"exhaust"),"nonzeroBlocks")>0){started=true;active.Restart();}
    if(started){if(!injected){Need(blocks>priorBlocks,"PCM progress stopped");priorBlocks=blocks;Need((DateTime.UtcNow-File.GetLastWriteTimeUtc(Path.Combine(DirectoryPath,"host.json"))).TotalSeconds<2,"status publication stale");}samples.Add(new{elapsed=active.Elapsed.TotalSeconds,status=s});}
   }}Thread.Sleep(25);
  }
  Need(started,"nonzero engine/exhaust never activated");if(control!="none"){Need(current.Retired,"failed component did not retire");string faultPath=Path.Combine(DirectoryPath,"runtime-first-fault.json");Need(File.Exists(faultPath),"first fault missing");var fault=Json.DeserializeObject(File.ReadAllText(faultPath))as Dictionary<string,object>;Need(Convert.ToString(fault["stack"]).Contains("RunBati"),"first fault stack missing");if(control=="withhold-status")Need(Convert.ToString(fault["message"])=="Bati host status stopped"&&N(fault,"statusAgeMs")>=5000,"wrong status fault");if(control=="kill-producer")Need(Convert.ToString(fault["message"])=="Bati gameplay host exited"&&Convert.ToString(Read()["failureDetail"])=="producer ended","wrong producer fault");}
  current.Stop();joined=current.Join(10000);Need(joined&&current.HostPid==0,"bounded stop/join failed");Need(!current.Enable(),"retired session revived");passed=true;
 }catch(Exception e){error=e.ToString();Console.Error.WriteLine(error);}finally{if(current!=null){current.Stop();joined=current.Join(10000);}}
 var report=new{passed=passed,error=error,joined=joined,session=current==null?null:current.Session,fixtureOnly=true,source="original authored procedural PCM",endpointOpened=false,seconds=total.Elapsed.TotalSeconds,samples=samples,terminal=Read()};File.WriteAllText(args[1],Json.Serialize(report));Console.WriteLine("Bati health passed="+passed+" joined="+joined+" samples="+samples.Count);return passed?0:1;
 }
}
