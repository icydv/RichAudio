using System;
using System.Collections.Generic;
using System.Reflection;

namespace Rage {
 public struct Vector3 {public Vector3(float x,float y,float z){}}
 public sealed class Model {public uint Hash=0xF9300CC5u;public Model(string name){}}
 public struct PoolHandle {public int Value,Index,Counter;}
 public sealed class Vehicle {
  public static readonly List<Vehicle> Created=new List<Vehicle>();
  public PoolHandle Handle;public IntPtr MemoryAddress;public Model Model;
  public bool IsDead,IsEngineOn,Exists=true;public uint Horn=7;
  public Vehicle(Model model,Vector3 position){
   Model=model;Handle=new PoolHandle{Value=Created.Count+1,Index=Created.Count+1,Counter=1};
   MemoryAddress=(IntPtr)(Created.Count+10);Created.Add(this);
  }
  public bool IsValid(){return Exists;}
  public void Delete(){Exists=false;}
 }
 public sealed class Ped {public Vehicle CurrentVehicle;public bool IsValid(){return true;}}
 public sealed class Player {public Ped Character;}
 public static class Game {
  public static readonly Player LocalPlayer=new Player();
  public static bool IsLoading,IsPaused;
  public static class Console {public static string Last;public static void Print(string line){Last=line;}}
 }
 public static class GameFiber {
  public static Action OnSleep;
  public static void Sleep(int ms){if(OnSleep!=null)OnSleep();}
 }
}
namespace Rage.Attributes {
 public sealed class PluginAttribute:Attribute {
  public PluginAttribute(string name){}
  public string Author,Description,EntryPoint,ExitPoint;public bool PrefersSingleInstance;
 }
 public sealed class ConsoleCommandAttribute:Attribute {public string Name,Description;}
}
namespace Rage.Native {
 public static class NativeFunction {
  public static dynamic Natives=new Calls();
  public static bool ApplyMarker=true;
  public static readonly List<Rage.Vehicle> Targets=new List<Rage.Vehicle>();
  public static readonly List<string> Profiles=new List<string>();
  public sealed class Calls {
   public void x4F0C413926060B38(Rage.Vehicle target,string name){
    Targets.Add(target);Profiles.Add(name);if(ApplyMarker)target.Horn=name.EndsWith("_a")?11u:12u;
   }
  }
  public static T CallByName<T>(string name,params object[] args){
   if(name=="NETWORK_IS_SESSION_ACTIVE")return (T)(object)false;
   if(name=="GET_PED_IN_VEHICLE_SEAT")return (T)(object)0;
   if(name=="GET_VEHICLE_DEFAULT_HORN")return (T)(object)((Rage.Vehicle)args[0]).Horn;
   throw new Exception("Unexpected native");
  }
 }
}
public static class TestPrivateProfileProbe01 {
 static void Check(bool value,string reason){if(!value)throw new Exception(reason);}
 static void Reset(){
  Rage.Vehicle.Created.Clear();Rage.Native.NativeFunction.Targets.Clear();Rage.Native.NativeFunction.Profiles.Clear();
  Rage.Native.NativeFunction.ApplyMarker=true;Rage.GameFiber.OnSleep=null;
  typeof(RichAudio.ProfileProbe).GetField("used",BindingFlags.NonPublic|BindingFlags.Static).SetValue(null,false);
 }
 static void Run(){RichAudio.ProfileProbe.Run("ra_probe_fixture_a","0000000b","ra_probe_fixture_b","0000000c",1,2,3);}
 public static int Main(){
  var donor=new Rage.Vehicle(new Rage.Model("bati"),new Rage.Vector3());
  Rage.Game.LocalPlayer.Character=new Rage.Ped{CurrentVehicle=donor};
  RichAudio.ProfileProbe.ReadVehicleHorn();
  Check(Rage.Game.Console.Last.Contains("horn=00000007")&&Rage.Native.NativeFunction.Targets.Count==0,"Read-only discriminator");
  Reset();
  Run();
  var profiles=Rage.Native.NativeFunction.Profiles;
  Check(profiles.Count==3&&profiles[0]==profiles[2]&&profiles[0]!=profiles[1],"A/B/A sequence");
  Check(Rage.Native.NativeFunction.Targets.TrueForAll(v=>v==Rage.Vehicle.Created[0]),"Assignments only reach the newly spawned target");
  Check(Rage.Vehicle.Created.Count==2&&Rage.Vehicle.Created.TrueForAll(v=>!v.Exists)&&Rage.Vehicle.Created[1].Horn==7,"Target and untouched neighbour retire");
  Run();Check(profiles.Count==3,"No second experiment from the same load");
  Reset();Rage.Native.NativeFunction.ApplyMarker=false;Run();
  Check(profiles.Count==1&&Rage.Vehicle.Created.TrueForAll(v=>!v.Exists),"Failed first marker stops and cleans up");
  Reset();Rage.GameFiber.OnSleep=delegate{Rage.Vehicle.Created[0].Handle.Counter++;};Run();
  Check(profiles.Count==1&&Rage.Vehicle.Created[0].Exists&&!Rage.Vehicle.Created[1].Exists,"Recycled handle is not assigned again or deleted");
  Check(donor.Exists&&donor.Horn==7,"Existing selected vehicle was never assigned or deleted");
  System.Console.WriteLine("PASS standalone marker capability adapter with authored RPH calls");
  return 0;
 }
}
