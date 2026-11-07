using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

public sealed class ObservationHostContext:MarshalByRefObject {
 Thread entry;
 Assembly plugin;
 Rage.Attributes.PluginAttribute attr;
 public void Start(string dll){
  plugin=Assembly.LoadFrom(dll);
  attr=(Rage.Attributes.PluginAttribute)plugin.GetCustomAttributes(typeof(Rage.Attributes.PluginAttribute),false).Single();
  entry=new Thread(()=>Invoke(attr.EntryPoint)){IsBackground=true};
  entry.Start();
 }
 void Invoke(string name,params object[] args){
  int dot=name.LastIndexOf('.');
  plugin.GetType(name.Substring(0,dot),true).GetMethod(name.Substring(dot+1)).Invoke(null,args);
 }
 public bool Join(int ms){return entry.Join(ms);}
 public void Unload(){Invoke(attr.ExitPoint,false);}
 public bool Logged(string text){return Rage.Game.ContainsLog(text);}
 public int NativeCalls(){return Rage.Native.NativeFunction.Calls;}
 public override object InitializeLifetimeService(){return null;}
}

internal static class TestCombinedObservationLoad01 {
 static void Check(bool ok,string label){if(!ok)throw new Exception(label);}
 static void Discover(string dll,string sdk){
  var reference=AssemblyName.GetAssemblyName(sdk).FullName;
  AppDomain.CurrentDomain.ReflectionOnlyAssemblyResolve+=(s,e)=>e.Name==reference?Assembly.ReflectionOnlyLoadFrom(sdk):Assembly.ReflectionOnlyLoad(e.Name);
  var a=Assembly.ReflectionOnlyLoadFrom(dll);
  foreach(var n in a.GetReferencedAssemblies()){
   if(n.FullName==reference)Assembly.ReflectionOnlyLoadFrom(sdk);
   else Assembly.ReflectionOnlyLoad(n.FullName);
  }
  var types=a.GetTypes();
  Check(types.Length>10,"full type enumeration");
  Check(a.GetCustomAttributesData().Any(x=>x.AttributeType.FullName=="Rage.Attributes.PluginAttribute"),"plugin attribute present");
  Console.WriteLine("PASS production candidate SDK binding and full type discovery: "+types.Length+" types.");
 }
 static void WaitFor(Func<bool> done,string reason){
  var clock=Stopwatch.StartNew();
  while(!done()&&clock.ElapsedMilliseconds<6000)Thread.Sleep(15);
  Check(done(),reason);
 }
 static string Read(string p){
  if(!File.Exists(p))return "";
  using(var f=new FileStream(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
  using(var r=new StreamReader(f))return r.ReadToEnd();
 }
 static void Put(string dir,string name,string json){
  var path=Path.Combine(dir,name);
  File.WriteAllText(path+".pending",json);
  File.Move(path+".pending",path);
 }
 static string Creation(Process p){return p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();}
 const int Slash=1, Ctrl=2, Shift=4, StartKeys=Slash|Ctrl|Shift;
 static void KeysDown(int keys){Rage.Game.AuthoredKeys=keys;Thread.Sleep(120);}
 static void Tap(int keys){KeysDown(0);KeysDown(keys);KeysDown(0);}
 static void Focus(bool value){AppDomain.CurrentDomain.SetData("RichAudio.AuthoredForeground",value);}

 static int Main(string[] args){
  try{
   if(args[0]=="discover")Discover(Path.GetFullPath(args[1]),Path.GetFullPath(args[2]));
   else Exercise(args[0],args[1],args[2],args[3],args[4]);
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
 [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
 static void Exercise(string mode,string dll,string receiverExe,string capture,string dir){
  bool delayed=mode=="exercise";
  string session=Guid.NewGuid().ToString("N");
  long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  long arm=now+(mode=="arm-cutoff"?4000:delayed?120000:20000);
  long stop=mode=="cutoff"?arm+1000:arm+240000;
  if(mode=="cutoff"){arm=now+4000;stop=now+6000;}
  Put(dir,"observation-schedule.json","{\"Session\":\""+session+"\",\"ArmByUtcMs\":"+arm+",\"StopByUtcMs\":"+stop+"}");
  var game=Process.GetCurrentProcess();
  var donor=new Rage.Vehicle{Model=new Rage.Model{Hash=0xc3ddfdce},Handle=new Rage.PoolHandle{Value=4,Index=5,Counter=6},MemoryAddress=(IntPtr)7};
  Rage.Game.LocalPlayer=new Rage.Player{Character=new Rage.Ped{CurrentVehicle=donor}};
  Focus(true);
  KeysDown(StartKeys);
  var host=new ObservationHostContext();
  host.Start(dll);
  WaitFor(()=>host.Logged("input loop running"),"lifecycle entry is yielding while it awaits a binding");
  Check(host.NativeCalls()==0,"idle lifecycle made no native calls");

  if(mode=="arm-cutoff"){
   Check(host.Join(6500)&&host.Logged("shared arm cutoff")&&host.NativeCalls()==0,"unarmed lifecycle ends at the shared arm cutoff");
   return;
  }
  using(var child=Process.Start(new ProcessStartInfo(receiverExe,session+" "+game.Id+" \""+capture+"\" "+arm+" "+stop+" "+Creation(game)){
   UseShellExecute=false,RedirectStandardOutput=true,CreateNoWindow=true})){
   try{
    var ready=child.StandardOutput.ReadLineAsync();
    Check(ready.Wait(6000)&&ready.Result=="Receiver ready: session="+session+"; receiverPid="+child.Id,"exact receiver readiness");
    Put(dir,"observation-binding.json","{\"Session\":\""+session+"\",\"GamePid\":"+game.Id+",\"GameCreation\":\""+Creation(game)+
      "\",\"ReceiverPid\":"+child.Id+",\"ReceiverCreation\":\""+Creation(child)+"\"}");
    WaitFor(()=>host.Logged("manual controls ready"),"process-bound input readiness");
    KeysDown(StartKeys);
    Check(host.NativeCalls()==0,"held start keys must not start at readiness");
    if(delayed){
     Focus(false);KeysDown(0);KeysDown(StartKeys);
     Focus(true);KeysDown(StartKeys);
     Check(host.NativeCalls()==0,"focus recovery does not arm held input");
     Rage.Game.Console.Open=true;KeysDown(0);KeysDown(StartKeys);
     Rage.Game.Console.Open=false;KeysDown(StartKeys);
     Check(host.NativeCalls()==0,"console activity does not arm held input");
     Rage.Game.IsPaused=true;KeysDown(0);KeysDown(StartKeys);
     Rage.Game.IsPaused=false;KeysDown(StartKeys);
     Check(host.NativeCalls()==0,"resume does not arm held input");

     var domain=AppDomain.CreateDomain("duplicate observation context");
     try{
      var duplicate=(ObservationHostContext)domain.CreateInstanceAndUnwrap(typeof(ObservationHostContext).Assembly.FullName,typeof(ObservationHostContext).FullName);
      duplicate.Start(dll);
      Check(duplicate.Join(4000)&&!duplicate.Logged("input loop running")&&duplicate.NativeCalls()==0,"second AppDomain cannot acquire the approval");
     }finally{AppDomain.Unload(domain);}
     Thread.Sleep(32000);
     Check(!child.HasExited&&Read(capture).Length==0&&host.NativeCalls()==0,"delayed operator receives no short arm timer or auto-sampling");
    }
    Tap(StartKeys);
    Check(host.Logged("manual start received; session="+session+"; receiverPid="+child.Id),"manual start acknowledgement bound to receiver");
    WaitFor(()=>Read(capture).Contains("\"outcome\":\"no-proxy\""),"first exterior frame from the actual adapter");
    var connected=child.StandardOutput.ReadLineAsync();
    Check(connected.Wait(2000)&&connected.Result.Contains("Receiver connected:"),"authenticated receiver connection");
    var fresh=child.StandardOutput.ReadLineAsync();
    Check(fresh.Wait(2000)&&fresh.Result.Contains("First valid camera frame received:"),"fresh camera frame");
    if(mode=="cutoff"){
     Check(child.WaitForExit(8000)&&child.ExitCode==0&&host.Join(3000),"shared observation cutoff closes both sides");
    }else if(mode=="receiver-loss"){
     child.Kill();Check(child.WaitForExit(3000)&&host.Join(3000)&&host.Logged("receiver exited"),"receiver loss retires sampling");
    }else if(mode=="unload"){
     host.Unload();
     Check(host.Join(3000)&&child.WaitForExit(3500)&&child.ExitCode==0,"unload closes input loop and pipe");
    }else{
     Tap(StartKeys);
     Check(Rage.Game.LogCount("manual start received")==1,"start is single-use");
     Rage.Native.NativeFunction.Proxy=37;
     WaitFor(()=>Read(capture).Contains("\"outcome\":\"not-ready\""),"not-ready interior");
     Rage.Native.NativeFunction.Ready=true;
     WaitFor(()=>Read(capture).Contains("\"archetype\":43794"),"interior frame");
     Rage.Native.NativeFunction.Proxy=0;
     WaitFor(()=>Read(capture).Split('\n').Count(l=>l.Contains("\"outcome\":\"no-proxy\""))>=2,"return to exterior");
     KeysDown(Ctrl|Slash);
     KeysDown(Ctrl|Slash);
     Check(Rage.Native.NativeFunction.HornCalls==3&&host.Logged("model=C3DDFDCE; raw=00000007,00000007,00000007"),"one held donor chord yields three reads");
     donor.Model=new Rage.Model{Hash=0xeb70965f};
     Rage.Native.NativeFunction.AlternateHorn=true;
     Tap(Ctrl|Slash);
     Check(Rage.Native.NativeFunction.HornCalls==6&&host.Logged("model=EB70965F")&&host.Logged("result=inconsistent"),"second approved donor retains disagreement");
     donor.Model=new Rage.Model{Hash=0x12345678};
     Tap(Ctrl|Slash);
     Check(Rage.Native.NativeFunction.HornCalls==6&&host.Logged("result=not-approved-donor"),"unapproved model cannot reach the getter");
     Tap(Shift|Slash);
     Check(host.Join(3000)&&host.Logged("manual stop received")&&child.WaitForExit(3500)&&child.ExitCode==0,"manual stop closes the pipe");
     var after=new ObservationHostContext();
     after.Start(dll);
     Check(after.Join(3000)&&Rage.Game.LogCount("input loop running")==1,"completed approval cannot be reused");
    }
   }finally{
    host.Unload();
    if(!child.HasExited){child.Kill();child.WaitForExit(3500);}
   }
  }
  Console.WriteLine("PASS authored input lifecycle and real pipe: "+mode);
 }
}
