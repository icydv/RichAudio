using System;
using System.Globalization;
using System.Text.RegularExpressions;
using Rage;
using Rage.Attributes;
using Rage.Native;

// Standalone capability experiment. This source is outside the product build.
[assembly:Plugin("RichAudio private audio profile probe", Author="RichAudio",
 Description="Manual disposable-vehicle profile resolution probe.", EntryPoint="RichAudio.ProfileProbe.Main",
 ExitPoint="RichAudio.ProfileProbe.OnUnload", PrefersSingleInstance=true)]
namespace RichAudio {
 public static class ProfileProbe {
  const uint Bati=0xF9300CC5u;
  sealed class Owned {
   internal Vehicle Vehicle;
   internal string Identity;
  }
  static Owned target, control;
  static bool running, used;

  public static void Main(){ Game.Console.Print("RichAudio profile probe idle. Manual Story Mode experiment only."); }
  public static void OnUnload(){if(!Cleanup())Game.Console.Print("RichAudio probe retirement unresolved.");}

  static string Identity(Vehicle v) {
   var h=v.Handle;
   return h.Value.ToString("X8")+":"+h.Index.ToString("X")+":"+h.Counter.ToString("X2")+":"+v.MemoryAddress.ToInt64().ToString("X");
  }
  static bool Owns(Owned item){
   return item!=null&&item.Vehicle!=null&&item.Vehicle.IsValid()&&item.Vehicle.Model.Hash==Bati&&
    item.Vehicle.MemoryAddress!=IntPtr.Zero&&Identity(item.Vehicle)==item.Identity;
  }
  static Vehicle Empty(Owned item) {
   if(!Owns(item)||item.Vehicle.IsDead||NativeFunction.CallByName<int>("GET_PED_IN_VEHICLE_SEAT",item.Vehicle,-1,false)!=0||
    NativeFunction.CallByName<int>("GET_PED_IN_VEHICLE_SEAT",item.Vehicle,0,false)!=0)
    throw new InvalidOperationException("Probe vehicle lost, recycled or occupied");
   return item.Vehicle;
  }
  static Owned Spawn(Vector3 position){
   var v=new Vehicle(new Model("bati"),position);
   if(v==null||!v.IsValid())throw new InvalidOperationException("Could not create probe vehicle");
   return new Owned{Vehicle=v,Identity=Identity(v)};
  }
  static Vehicle Parked(Owned item){
   var v=Empty(item);
   if(Game.IsLoading||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_ACTIVE")||v.IsEngineOn)
    throw new InvalidOperationException("Probe left the parked Story Mode scope");
   return v;
  }
  static uint Horn(Owned item){return NativeFunction.CallByName<uint>("GET_VEHICLE_DEFAULT_HORN",Parked(item));}
  static void Assign(string profile){
   NativeFunction.Natives.x4F0C413926060B38(Parked(target),profile);
  }
  static void Expect(uint horn, uint neighbour){
   GameFiber.Sleep(250);
   if(Horn(target)!=horn||Horn(control)!=neighbour)
    throw new InvalidOperationException("Marker getter did not discriminate target and neighbour");
  }
  static bool Remove(ref Owned item) {
   if(item==null)return true;
   if(!Owns(item)){
    bool retired=item.Vehicle==null||!item.Vehicle.IsValid()||Identity(item.Vehicle)!=item.Identity;
    item=null;
    return retired;
   }
   try{
    Vehicle v=Empty(item);
    v.Delete();
    bool retired=!Owns(item);
    if(retired)item=null;
    return retired;
   }catch(System.Threading.ThreadAbortException){throw;}catch{return false;}
  }
  static bool Cleanup() {
   bool a=Remove(ref target), b=Remove(ref control);
   return a&&b;
  }

  [ConsoleCommand(Name="RichAudioProbeProfiles",Description="Run the separately approved private A/B profile test on two disposable Batis.")]
  public static void Run(string profileA,string markerA,string profileB,string markerB,float x,float y,float z){
   uint a,b;
   if(used||running||Game.IsLoading||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_ACTIVE")||
    !Regex.IsMatch(profileA??"",@"\Ara_probe_[a-z0-9_]{8,48}\z")||!Regex.IsMatch(profileB??"",@"\Ara_probe_[a-z0-9_]{8,48}\z")||
    profileA==profileB||!uint.TryParse(markerA,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out a)||
    !uint.TryParse(markerB,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out b)||a==0||b==0||a==b||
    !(Math.Abs(x)<10000&&Math.Abs(y)<10000&&Math.Abs(z)<10000)){
    Game.Console.Print("RichAudio profile probe refused.");return;
   }
   running=true;used=true;bool matched=false;
   try{
    target=Spawn(new Vector3(x,y,z));
    control=Spawn(new Vector3(x+5,y,z));
    if(target.Identity==control.Identity)throw new InvalidOperationException("Probe lifetimes overlap");
    uint original=Horn(target), neighbour=Horn(control);
    if(original==0||neighbour==0||original==a||original==b||neighbour==a||neighbour==b)
     throw new InvalidOperationException("Marker collides with unmodified readback");
    Assign(profileA);Expect(a,neighbour);
    Assign(profileB);Expect(b,neighbour);
    Assign(profileA);Expect(a,neighbour);
    matched=true;
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception error){Game.Console.Print("RichAudio profile probe inconclusive: "+error.Message);}
   finally{
    bool retired=Cleanup();running=false;
    Game.Console.Print("RichAudio marker A/B/A matched="+matched+"; both probe lifetimes retired="+retired);
   }
  }
 }
}
