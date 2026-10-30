// Real owned supervisor -> secured pipe -> host -> Node -> source -> causal
// renderer -> RA07 -> native ring. Only the device sink and GTA observations
// are replaced; no audio device is enumerated or opened.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using System.Web.Script.Serialization;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
internal static class TestGameplay {
 static GameplayRuntime runtime;static long sequence,generation=1;static bool wasPaused;static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static string root;static int checks;static readonly List<int> owned=new List<int>();
 static void Check(bool x,string why){checks++;if(!x)throw new Exception(why);}
 static Dictionary<string,object> Read(string f){try{return Json.DeserializeObject(File.ReadAllText(f)) as Dictionary<string,object>;}catch(IOException){return null;}}
 static Dictionary<string,object> Evidence(){return Read(Path.Combine(root,".local","gameplay",runtime.Session,"host.json"));}
 static double Number(Dictionary<string,object>d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToDouble(v):0;}
 static Dictionary<string,object> Worker(){var d=Evidence();return d!=null&&d.ContainsKey("worker")?d["worker"]as Dictionary<string,object>:null;}
 static void Feed(int count,bool pause=false,bool valid=true){if(pause!=wasPaused){generation++;wasPaused=pause;}long now=Stopwatch.GetTimestamp();var vehicles=new List<GameplayVehicle>();for(int i=0;i<count;i++)vehicles.Add(new GameplayVehicle{Id="actual-component-fixture-"+i,Generation=(int)(sequence/160)+1,ObservationTicks=now,Model=i==0?0xf9300cc5u:0xa774b5a6u,Context=i==0?"npc":"player",Position=new[]{2d+i*4,3d,0d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=.1+.7*(.5+.5*Math.Sin(sequence*.02)),Running=true,Valid=true});
  runtime.Publish(new GameplayFrame{Session=runtime.Session,Listener=new ListenerState{Version=1,Session=runtime.Session,Generation=generation,Sequence=sequence++,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(sequence*50),Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=pause,Valid=valid,Reason=valid?"valid":"not-ready",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null},Vehicles=vehicles.ToArray()});
 }
 static void Until(Func<bool> condition,int milliseconds,int count=1,bool pause=false){var clock=Stopwatch.StartNew();while(!condition()){if(clock.ElapsedMilliseconds>milliseconds)throw new TimeoutException(runtime.State+"; "+(Evidence()==null?"no host status":Json.Serialize(Evidence())));Feed(count,pause);Thread.Sleep(50);}}
 static void For(int milliseconds,int count=1,bool pause=false,bool valid=true){var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<milliseconds){Feed(count,pause,valid);Thread.Sleep(50);}}
 static void Settings(long revision,bool enabled=true,double volume=1){AcousticSettingsStore.Save(root,AcousticSettingsStore.DefaultPath(root),new AcousticSettings("performance","cpu",Math.Max(revision,File.Exists(AcousticSettingsStore.DefaultPath(root))?AcousticSettingsStore.Load(root,AcousticSettingsStore.DefaultPath(root)).Revision+1:1),enabled,volume,true,false,"experimental-additive",false));}
 public static int Main(string[]args){
  try{root=Path.GetFullPath(args[0]);var c=PlayableConfiguration.Load(Path.Combine(root,"playable.json"));Settings(1);string pointer=Path.Combine(root,".local","fixture-pointer.json");Directory.CreateDirectory(Path.GetDirectoryName(pointer));File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=root,manifestSha256=PlayableConfiguration.Digest(c.Manifest)}));
   runtime=new GameplayRuntime(true);runtime.Start(pointer,c.GameExecutable,args[1]);Until(()=>runtime.Configuration!=null,5000,0);Thread.Sleep(250);Check(runtime.Attempts==0,"no host before Story readiness");runtime.SetStoryReady(true);
   Until(()=>runtime.HostPid>0,5000);owned.Add(runtime.HostPid);Until(()=>Number(Worker(),"activeSources")>=1&&Number(Evidence(),"peak")>0,15000);owned.Add((int)Number(Evidence(),"nodePid"));Check(!(bool)Evidence()["endpointOpened"],"device-free route");Check(Number(Evidence(),"receivedSnapshots")>0,"real secured pipe snapshots");
   Until(()=>Number(Worker(),"activeSources")==2,4000,2);Check(Number(Worker(),"activeSources")==2,"two independent stock sources");Until(()=>Number(Worker(),"retired")>=1,3000,1);Check(Number(Worker(),"retired")>=1,"missing identity retires");
   Settings(2,true,.4);Until(()=>Number(Worker(),"outputLevel")==.4,3000);Check(Number(Worker(),"outputLevel")==.4,"settings applied through real producer");
   // Pause/resume both change listener generation, matching the RPH adapter.
   For(700,1,true);For(700);Until(()=>Number(Worker(),"activeSources")==0,3000,0);Check(Number(Worker(),"activeSources")==0,"no indefinite unknown source");For(700,1);
   var before=Evidence();Check(Number(Worker(),"missingHistory")==0,"no source history violations");Check(Number(Worker(),"limitedSamples")==0,"no hidden limiter");Check(Number(before,"peak")<1,"digital headroom");
   int first=runtime.HostPid;Settings(3,false);Until(()=>runtime.HostPid==0,5000,0);Check(!Alive(first),"disabled host cleaned");Settings(4);Until(()=>runtime.HostPid>0,5000);owned.Add(runtime.HostPid);Until(()=>Number(Evidence(),"peak")>0,10000);
   // Kill actual host; job disposal must retire its real Node descendants.
   int crash=runtime.HostPid;using(var p=Process.GetProcessById(crash))p.Kill();Until(()=>runtime.HostPid!=0&&runtime.HostPid!=crash,10000);owned.Add(runtime.HostPid);Until(()=>Number(Evidence(),"peak")>0,10000);
   owned.Add((int)Number(Evidence(),"nodePid"));int last=runtime.HostPid;runtime.RequestStop();Check(runtime.Join(6000),"supervisor stopped");Check(!Alive(last),"no owned host after unload");foreach(int id in owned)if(id>0)Check(!Alive(id),"old hosts and Node children remain dead");
   string report=Json.Serialize(new{schema=1,checks=checks,actualComponents=true,gameGetters="injected; live unverified",endpointOpened=false,automaticStart=true,independentSources=2,recoveryAttempts=runtime.Attempts,cleanup=true,measurement=before});File.WriteAllText(Path.Combine(root,".local","gameplay-fixture-result.json"),report);Console.WriteLine(report);return 0;
  }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}finally{if(runtime!=null){runtime.RequestStop();runtime.Join(6000);}}
 }
 static bool Alive(int id){try{using(var p=Process.GetProcessById(id))return !p.HasExited;}catch(ArgumentException){return false;}}
}
