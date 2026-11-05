using System;using System.Diagnostics;using System.IO;using System.Reflection;using System.Runtime.InteropServices;using System.Security.Cryptography;using System.Threading;using System.Web.Script.Serialization;using RichAudio.StreetTracked01;
namespace Rage {
 public struct PoolHandle{public uint Value,Index;public byte Counter;}
 public class Entity {public PoolHandle Handle;public IntPtr MemoryAddress;public bool Exists=true,IsDead;public bool IsValid(){return Exists;}}
 public sealed class Model {public uint Hash=0xF9300CC5;}
 public sealed class Ped:Entity{public Vehicle CurrentVehicle;}
 public sealed class Vehicle:Entity{public Model Model=new Model();public Ped Driver;public bool IsEngineOn=true;public float EngineRevolutionsRatio=50.000003814697266f;}
 public sealed class Player{public Ped Character;}
 public static class Game {public static bool IsLoading,IsPaused;public static Player LocalPlayer=new Player();public static class Console{public static void Print(string text){}}}
 public static class GameFiber{public static Action Step;public static void Sleep(int ms){Thread.Sleep(ms);if(Step!=null)Step();}}
}
namespace Rage.Native{public static class NativeFunction{public static T CallByName<T>(string name,params object[] args){if(name!="NETWORK_IS_SESSION_STARTED"&&name!="NETWORK_IS_GAME_IN_PROGRESS")throw new Exception("unexpected fixture native");return (T)(object)false;}}}
internal static class TestStreetTrackedDiagnostic01 {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr LoadLibrary(string path);
 [DllImport("kernel32.dll")]static extern bool FreeLibrary(IntPtr module);
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetFixtureRun01();
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetFixtureSet01(int a,int r,int e,int rev,uint bits);
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetFixtureCounts01(out uint n,out uint r,out uint u);
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetFixtureClose01();
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetFixturePause01(uint stage);
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern uint StreetFixtureReached01();
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern uint StreetFixtureTargets01();
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern uint StreetRead01(out Record01 row,uint size);
 [DllImport("RichAudio.StreetTracked01.asi",CallingConvention=CallingConvention.Cdecl)]static extern void StreetStop01();
 static int checks;static void Check(bool yes,string why){checks++;if(!yes)throw new Exception(why);}
 static string Hash(string path){using(var f=File.OpenRead(path))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
 static int Main(string[] args){try{
  string scenario=args[0],folder=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),native=Path.Combine(folder,"RichAudio.StreetTracked01.asi"),outdir=Path.Combine(folder,"result-"+scenario);var handle=LoadLibrary(native);Check(handle!=IntPtr.Zero,"authored native module loads");
  uint calls,registers,unregisters;StreetFixtureCounts01(out calls,out registers,out unregisters);Check(registers==1&&calls==0,"actual DllMain registers exactly one dormant script without native calls");
  var nativeThread=new Thread(StreetFixtureRun01);nativeThread.IsBackground=true;nativeThread.Start();Thread.Sleep(80);StreetFixtureCounts01(out calls,out registers,out unregisters);Check(calls==0,"registered script startup remains native-call-free until explicit passive arm");
  var player=new Rage.Ped{Handle=new Rage.PoolHandle{Value=258,Index=1,Counter=2},MemoryAddress=new IntPtr(100)};var vehicle=new Rage.Vehicle{Handle=new Rage.PoolHandle{Value=772,Index=3,Counter=4},MemoryAddress=new IntPtr(512),Driver=player};player.CurrentVehicle=vehicle;Rage.Game.LocalPlayer.Character=player;
  if(scenario=="stop-begin-race"||scenario=="stop-acquire-race"){
   var peer=new RetainedRphPeer01().Capture();var bound=new NativeModule01(native,Hash(native),true);uint stage=scenario=="stop-begin-race"?1u:2u;StreetFixturePause01(stage);Exception beginFailure=null;
   var beginThread=new Thread(new ThreadStart(delegate{try{bound.Begin(1,2,peer,32,2);}catch(Exception e){beginFailure=e;}}));beginThread.Start();var wait=Stopwatch.StartNew();while(StreetFixtureReached01()!=stage&&wait.ElapsedMilliseconds<1000)Thread.Sleep(1);Check(StreetFixtureReached01()==stage,"actual transition is parked before its state publication");
   // The managed adapter serializes its own calls. Inject Stop at the actual
   // native export boundary to exercise concurrent module/fiber retirement.
   StreetStop01();NativeModule01.Closure closure=null;if(stage==2){closure=bound.ObserveClosureAndRelease(0);Check(!closure.scriptLoopExitObserved&&!closure.moduleReferenceReleased&&closure.processLifetimePinned,"non-quiescent script retains references at zero observation bound");}
   StreetFixturePause01(0);Check(beginThread.Join(1000),"begin call returns after controlled stop race");Check(nativeThread.Join(1000),"actual registered script exits after stopped transition");
   Record01 row;StreetRead01(out row,152);Check(row.Phase==4&&row.Reason==1&&StreetFixtureTargets01()==0,"Stop cannot revive arming/active phase or execute a ratio target");
   if(stage==1){Check(beginFailure is InvalidDataException,"stopped Begin remains rejected");closure=bound.ObserveClosureAndRelease(1000);Check(closure.scriptLoopExitObserved&&closure.moduleReferenceReleased&&closure.processLifetimePinned,"loop exit permits own reference release while code remains process-pinned");}
   StreetFixtureClose01();StreetFixtureCounts01(out calls,out registers,out unregisters);Check(unregisters==1,"raced module unregisters exactly once");Check(FreeLibrary(handle),"fixture owner releases after script joins");System.Console.WriteLine("{\"passed\":true,\"scenario\":\""+scenario+"\",\"assertions\":"+checks+",\"registered\":1,\"scriptJoined\":true,\"gameAccessed\":false,\"endpointOpened\":false}");return 0;
  }
  var config=new DiagnosticEntry01.Configuration{enabled=scenario!="disabled",passiveOnly=true,audioAllowed=false,nativeMutationAllowed=false,session="0123456789abcdef0123456789abcdef",modulePath=native,moduleSHA256=scenario=="wrong-binding"?new string('0',64):Hash(native),gameSHA256=Hash(Process.GetCurrentProcess().MainModule.FileName),rphSHA256=Hash(typeof(Rage.Game).Assembly.Location),outputDirectory=outdir,maximumRecords=32,maximumSeconds=2};
  File.WriteAllText(DiagnosticEntry01.ConfigurationPath,new JavaScriptSerializer().Serialize(config));int sleeps=0;
  Rage.GameFiber.Step=delegate{if(++sleeps==7){player.CurrentVehicle=null;vehicle.Driver=null;StreetFixtureSet01(0,1,1,0,0x3f400000);}if(sleeps==14){vehicle.IsEngineOn=false;vehicle.EngineRevolutionsRatio=0;StreetFixtureSet01(0,0,1,0,0);}if(sleeps==20&&scenario=="recycle"){var h=vehicle.Handle;h.Counter++;vehicle.Handle=h;}if(sleeps==20&&scenario=="native-identity"){StreetFixtureSet01(0,0,1,1,0);}if(sleeps==28)DiagnosticEntry01.OnUnload();};
  DiagnosticEntry01.Main();DiagnosticEntry01.OnUnload();StreetFixtureClose01();Check(nativeThread.Join(1000),"actual registered ScriptMain returns after module closure (including dormant case)");
  StreetFixtureCounts01(out calls,out registers,out unregisters);
  if(scenario=="disabled"){Check(calls==0&&!Directory.Exists(outdir),"disabled actual RPH entry never arms native module or writes capture");}
  else{
   string result=Path.Combine(outdir,"diagnostic.json");var until=Stopwatch.StartNew();while(!File.Exists(result)&&until.ElapsedMilliseconds<2000)Thread.Sleep(10);Check(File.Exists(result),"bounded passive result writer finishes");var row=new JavaScriptSerializer().DeserializeObject(File.ReadAllText(result))as System.Collections.Generic.Dictionary<string,object>;
   var observations=(object[])row["rows"];Check((bool)row["audioStarted"]==false&&(bool)row["nativeSoundsMutated"]==false&&(bool)row["acceptedForNormalTelemetry"]==false,"actual entry cannot promote diagnostics to audio");
   if(scenario!="wrong-binding"){var closure=row["closure"]as System.Collections.Generic.Dictionary<string,object>;Check(closure!=null&&(bool)closure["scriptLoopExitObserved"]&&(bool)closure["moduleReferenceReleased"]&&(bool)closure["processLifetimePinned"],"actual entry observes loop exit, releases own reference and retains process-lifetime code pin");}
   if(scenario=="wrong-binding"){Check(calls==0&&observations.Length==0&&row["terminal"].ToString()=="diagnostic-module-sha","wrong exact module binding prevents native arm");}
   else{Check(observations.Length>=3,"actual native/RPH path yields multiple original observations");bool mounted=false,dismounted=false,off=false,raw50=false;foreach(var value in observations){var o=value as System.Collections.Generic.Dictionary<string,object>;if(o.ContainsKey("acceptedForAudio")){Check(!(bool)o["acceptedForAudio"],"each comparison remains diagnostic");bool rider=(bool)o["riderAttachedBefore"];mounted|=rider;dismounted|=!rider&&Convert.ToInt32(o["nativeRunningBefore"])==1;off|=Convert.ToInt32(o["nativeRunningBefore"])==0&&Convert.ToDouble(o["rawValue"])==0;raw50|=Convert.ToDouble(o["rphRawBefore"])>1;}}
    Check(mounted&&dismounted&&off&&raw50,"same tracked source retains mounted, dismounted, observed engine-off and unscaled invalid RPH evidence");
    if(scenario=="recycle")Check(row["terminal"].ToString()=="diagnostic-RPH-pool-lifetime-changed","RPH counter recycling terminates association");
    if(scenario=="native-identity")Check(row["terminal"].ToString()=="diagnostic-native-retired-3","native address change terminates same-handle lifetime");
   }
  }
  StreetFixtureClose01();StreetFixtureClose01();StreetFixtureCounts01(out calls,out registers,out unregisters);Check(unregisters==1,"actual module closure hook unregisters exactly once and is idempotent");
  var peerEvidence=new Peer01{Value=772,Index=3,Counter=4,Model=0xF9300CC5,Address=512,Before=10,After=11};var afterEvidence=new Peer01{Value=772,Index=3,Counter=4,Model=0xF9300CC5,Address=512,Before=12,After=13};
  var originalRow=new Record01{Size=152,Version=1,Session0=1,Session1=2,Sequence=1,Pre=new Identity01{Before=1,After=2,Address=512,Handle=123,Model=0xF9300CC5,Running=1},Post=new Identity01{Before=5,After=6,Address=512,Handle=123,Model=0xF9300CC5,Running=1},TargetBefore=3,TargetAfter=4,ReadNow=14,RawBits=0x3F000000,Status=1,Phase=3};
  var comparison=new Comparer01(peerEvidence,1,2,Stopwatch.Frequency);comparison.Compare(peerEvidence,afterEvidence,originalRow,15);
  bool rejected=false;try{comparison.Compare(peerEvidence,afterEvidence,originalRow,16);}catch(InvalidDataException){rejected=true;}Check(rejected,"actual comparer rejects replay instead of refreshing native time");
  rejected=false;try{new Comparer01(peerEvidence,1,2,Stopwatch.Frequency).Compare(peerEvidence,afterEvidence,originalRow,Stopwatch.Frequency);}catch(InvalidDataException){rejected=true;}Check(rejected,"actual comparer rejects stale original source interval");
  var future=originalRow;future.ReadNow=100;rejected=false;try{new Comparer01(peerEvidence,1,2,Stopwatch.Frequency).Compare(peerEvidence,afterEvidence,future,99);}catch(InvalidDataException){rejected=true;}Check(rejected,"actual comparer rejects a future clock without restamping");
  var wrong=originalRow;wrong.Session1=3;rejected=false;try{new Comparer01(peerEvidence,1,2,Stopwatch.Frequency).Compare(peerEvidence,afterEvidence,wrong,15);}catch(InvalidDataException){rejected=true;}Check(rejected,"actual comparer rejects foreign session");
  Check(FreeLibrary(handle),"fixture owner releases loaded module after script join");System.Console.WriteLine("{\"passed\":true,\"scenario\":\""+scenario+"\",\"assertions\":"+checks+",\"registered\":1,\"scriptJoined\":true,\"gameAccessed\":false,\"endpointOpened\":false}");return 0;
 }catch(Exception error){System.Console.Error.WriteLine(error);return 1;}}
}
