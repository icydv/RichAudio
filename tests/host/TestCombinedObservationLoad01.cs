using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

internal static class TestCombinedObservationLoad01 {
 static void Check(bool ok,string label){if(!ok)throw new Exception(label);}
 static Assembly Discover(string dll,string sdk){
  var reference=AssemblyName.GetAssemblyName(sdk).FullName;
  ResolveEventHandler resolve=(s,e)=>e.Name==reference?Assembly.ReflectionOnlyLoadFrom(sdk):Assembly.ReflectionOnlyLoad(e.Name);
  AppDomain.CurrentDomain.ReflectionOnlyAssemblyResolve+=resolve;
  var a=Assembly.ReflectionOnlyLoadFrom(dll);
  foreach(var n in a.GetReferencedAssemblies()){
   if(n.FullName==reference)Assembly.ReflectionOnlyLoadFrom(sdk);
   else Assembly.ReflectionOnlyLoad(n.FullName);
  }
  var types=a.GetTypes();Check(types.Length>10,"full type enumeration");
  var attributes=a.GetCustomAttributesData().Select(x=>x.AttributeType.FullName).ToArray();
  Check(attributes.Contains("Rage.Attributes.PluginAttribute"),"plugin attribute present");
  Console.WriteLine("PASS SDK binding and full reflection-only GetTypes: "+types.Length+" types; before initialization.");
  return a;
 }
 static void DiscoverMembers(Assembly a){
  foreach(var t in a.GetTypes()){
   var flags=BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static|BindingFlags.DeclaredOnly;
   foreach(var m in t.GetMethods(flags)){GC.KeepAlive(m.ReturnType);foreach(var p in m.GetParameters())GC.KeepAlive(p.ParameterType);GC.KeepAlive(m.GetCustomAttributesData());}
   foreach(var f in t.GetFields(flags))GC.KeepAlive(f.FieldType);
   foreach(var c in t.GetConstructors(flags))foreach(var p in c.GetParameters())GC.KeepAlive(p.ParameterType);
  }

 }
 static void Invoke(Assembly a,string target,params object[] args){
  int last=target.LastIndexOf('.');
  a.GetType(target.Substring(0,last),true).GetMethod(target.Substring(last+1)).Invoke(null,args);
 }
 static void WaitFor(Func<bool> done,string reason){
  var clock=Stopwatch.StartNew();while(!done()&&clock.ElapsedMilliseconds<6000)Thread.Sleep(15);Check(done(),reason);
 }
 static string Read(string p){if(!File.Exists(p))return "";using(var f=new FileStream(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))using(var r=new StreamReader(f))return r.ReadToEnd();}
 static void ExpectUnknown(string command){
  try{Rage.Game.Dispatch(command);}
  catch(InvalidOperationException e){if(e.Message=="Unknown command")return;throw;}
  throw new Exception("Expected unknown command: "+command);
 }
 static int Main(string[] args){
  try{
   var dll=Path.GetFullPath(args[1]);
   if(args[0]=="discover"){Discover(dll,Path.GetFullPath(args[2]));return 0;}
   return Exercise(dll,Path.GetFullPath(args[2]),Path.GetFullPath(args[3]),args[0]=="cutoff");
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
 [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
 static int Exercise(string dll,string receiver,string capture,bool verifyCutoff){
  var a=Assembly.LoadFrom(dll);
  DiscoverMembers(a);
  var attr=(Rage.Attributes.PluginAttribute)a.GetCustomAttributes(typeof(Rage.Attributes.PluginAttribute),false).Single();
  ExpectUnknown("RichAudioObserveStatus");
  Invoke(a,attr.EntryPoint);
  Check(Rage.Game.CommandCount==4,"exact explicit command set");
  Rage.Game.Dispatch("richaudioobservestatus");
  Check(Rage.Game.LastLog.Contains("status handler entered"),"read-only command exposure acknowledgement");
  Check(Rage.Native.NativeFunction.Calls==0&&Rage.GameFiber.Last==null,"idle entry point must do no native work or start a fiber");
  var v=new Rage.Vehicle{Model=new Rage.Model{Hash=0xf9300cc5},Handle=new Rage.PoolHandle{Value=4,Index=5,Counter=6},MemoryAddress=(IntPtr)7};
  Rage.Game.LocalPlayer=new Rage.Player{Character=new Rage.Ped{CurrentVehicle=v}};
  Rage.Game.Dispatch("RichAudioReadVehicleHorn");
  Check(Rage.Native.NativeFunction.HornCalls==0,"unarmed horn command");
  string session=Guid.NewGuid().ToString("N");
  long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  long armByUtcMs=now+(verifyCutoff?5000:120000);
  long stopByUtcMs=armByUtcMs+(verifyCutoff?1000:240000);
  using(var child=Process.Start(new ProcessStartInfo(receiver,session+" "+Process.GetCurrentProcess().Id+" \""+capture+"\" "+armByUtcMs+" "+stopByUtcMs){
   UseShellExecute=false,RedirectStandardOutput=true,CreateNoWindow=true})){
   try{
    var line=child.StandardOutput.ReadLineAsync();
    Check(line.Wait(6000)&&line.Result=="Ready: RichAudioObserveStart "+session+" "+child.Id,"exact full operator command");
    if(!verifyCutoff){
     Thread.Sleep(32000);
     Check(!child.HasExited&&Read(capture).Length==0,"receiver remains available past the former arm window");
    }
    Rage.Game.Dispatch(line.Result.Substring("Ready: ".Length));
    Check(Rage.Game.Console.Lines.Exists(s=>s.Contains("start handler entered; session="+session+"; receiverPid="+child.Id)),"manual start handler acknowledgement");
    WaitFor(()=>Read(capture).Contains("\"outcome\":\"no-proxy\""),"exterior packet");
    var connected=child.StandardOutput.ReadLineAsync();
    Check(connected.Wait(2000)&&connected.Result.Contains("Receiver connected:"),"authenticated receiver connection evidence");
    var firstFrame=child.StandardOutput.ReadLineAsync();
    Check(firstFrame.Wait(2000)&&firstFrame.Result.Contains("First valid camera frame received:"),"first fresh camera frame evidence");
    if(verifyCutoff){
     Check(child.WaitForExit(8000)&&child.ExitCode==0&&File.Exists(capture+".closed"),"connected receiver closed at shared observation cutoff");
     Check(Rage.GameFiber.Last.Join(3000),"sampling fiber retired when receiver closed at cutoff");
     Rage.Game.UnloadPlugin(a,()=>Invoke(a,attr.ExitPoint,false));
     ExpectUnknown(line.Result.Substring("Ready: ".Length));
     Console.WriteLine("PASS connected receiver closed at shared observation cutoff.");
     return 0;
    }
    Rage.Game.IsPaused=true;
    Thread.Sleep(1350);
    Check(!child.HasExited,"pipe remains available during a paused console interval");
    Rage.Game.IsPaused=false;
    Rage.Native.NativeFunction.Proxy=37;
    WaitFor(()=>Read(capture).Contains("\"outcome\":\"not-ready\""),"not-ready packet");
    Rage.Native.NativeFunction.Ready=true;
    WaitFor(()=>Read(capture).Contains("\"archetype\":43794"),"interior native and wire readback");
    Rage.Native.NativeFunction.Proxy=0;
    WaitFor(()=>Read(capture).Split('\n').Count(l=>l.Contains("\"outcome\":\"no-proxy\""))>=2,"return to exterior");
    Rage.Game.Dispatch("RichAudioReadVehicleHorn");
    Check(Rage.Game.Console.Last.Contains("vehicle=00000004:5:06:7")&&Rage.Game.Console.Last.Contains("raw=00000007,00000007,00000007"),"repeated reads tied to vehicle");
    Rage.Native.NativeFunction.AlternateHorn=true;
    Rage.Game.Dispatch("RichAudioReadVehicleHorn");
    Check(Rage.Game.Console.Last.Contains("result=inconsistent")&&Rage.Game.LastLog==Rage.Game.Console.Last,"differing hashes retained in the RPH log");
    Rage.Game.Dispatch("RichAudioObserveStop");
    Check(Rage.GameFiber.Last.Join(3000),"sampling fiber retired");
    Check(child.WaitForExit(3500)&&child.ExitCode==0&&File.Exists(capture+".closed"),"receiver closed after publisher stop");
    Rage.Game.UnloadPlugin(a,()=>Invoke(a,attr.ExitPoint,false));
    ExpectUnknown(line.Result.Substring("Ready: ".Length));
    ExpectUnknown("RichAudioObserveStatus");
    Check(Rage.Game.CommandCount==0,"unload removed the complete registered command set");
   }finally{if(!child.HasExited){child.Kill();child.WaitForExit(3500);}}
  }
  Console.WriteLine("PASS exact candidate startup, commands, real named pipe, shutdown, and exit with authored native calls.");
  return 0;
 }
}
