using System;
using System.Diagnostics;
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
  sealed class Recovery {
   internal Owned Target, Control;
   internal string Baseline;
   internal uint MarkerA, MarkerB, Neighbour;
   internal long Deadline;
  }
  static volatile Recovery recovery;

  public static void Main(){
   try{
    var request=ProfileProbeInput.Open();
    var session=ObservationSession.Open();
    WaitForOperator(request,session);
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception error){Game.LogTrivial("RichAudio profile probe refused: "+error.Message);}
  }
  internal static void WaitForOperator(ProfileProbeRequest request,ObservationSession session){
   var keys=new ObservationKeys();
   Game.LogTrivial("RichAudio profile probe controls ready. Ctrl+Shift+Backslash starts the sealed test once.");
   while(session.Before(session.ArmBy)&&session.Before(session.StopBy-5000)){
    var action=keys.Poll(ObservationKeys.Foreground()&&!Game.IsLoading&&!Game.IsPaused&&!Game.Console.IsOpen);
    if(action==ObservationAction.Stop)return;
    if(action==ObservationAction.Start){
     Game.LogTrivial("RichAudio profile probe manual Start received.");
     Run(request.ProfileA,request.MarkerA,request.ProfileB,request.MarkerB,request.X,request.Y,request.Z,request.Mode);
     // Keep the entry fiber alive until the separately scheduled guard has
     // finished. Ending Main cannot be the mechanism that kills the guard.
     while(running&&session.Before(session.StopBy))GameFiber.Sleep(20);
     return;
    }
    GameFiber.Sleep(20);
   }
  }
  public static void OnUnload(){recovery=null;if(!Cleanup())Game.Console.Print("RichAudio probe retirement unresolved.");}

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
  static void Assign(Owned item,string profile){
   NativeFunction.Natives.x4F0C413926060B38(Parked(item),profile);
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
    Vehicle v=Parked(item);
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

  // The known baseline is the probe's own explicitly assigned marker A.
  // Horn readback discriminates the markers. It cannot name an arbitrary
  // existing effective profile or grant authority to change one.
  static void Restore(Recovery lease) {
   uint current=Horn(lease.Target);
   if(Horn(lease.Control)!=lease.Neighbour||(current!=lease.MarkerA&&current!=lease.MarkerB))
    throw new InvalidOperationException("Known probe state or neighbour lost");
   if(current==lease.MarkerB){Assign(lease.Target,lease.Baseline);GameFiber.Sleep(250);}
   if(Horn(lease.Target)!=lease.MarkerA||Horn(lease.Control)!=lease.Neighbour)
    throw new InvalidOperationException("Known marker A did not return");
  }
  static void Watch(Recovery lease) {
   while(recovery==lease&&Stopwatch.GetTimestamp()<lease.Deadline)GameFiber.Sleep(20);
   if(recovery!=lease)return;
   bool restored=false;
   try{Restore(lease);restored=true;}
   catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception error){Game.Console.Print("RichAudio probe recovery inconclusive: "+error.Message);}
   finally{
    bool retired=Cleanup();recovery=null;running=false;
    Game.Console.Print("RichAudio probe watchdog: marker A restored="+restored+"; both probe lifetimes retired="+retired);
   }
  }

  internal static void Run(string profileA,string markerA,string profileB,string markerB,float x,float y,float z,string mode){
   uint a,b=0;bool resolveOnly=mode=="resolve-a";
#if PRIVATE_MARKER_A_ONLY
   if(!resolveOnly||profileB!=null||markerB!=null)throw new InvalidOperationException("marker-A-only build");
#endif
   if(used||running||Game.IsLoading||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_ACTIVE")||
    (!resolveOnly&&mode!="normal"&&mode!="controller-exit")||
    !Regex.IsMatch(profileA??"",@"\Ara_probe_[a-z0-9_]{8,48}\z")||
    !uint.TryParse(markerA,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out a)||a==0||
    (!resolveOnly&&(!Regex.IsMatch(profileB??"",@"\Ara_probe_[a-z0-9_]{8,48}\z")||profileA==profileB||
     !uint.TryParse(markerB,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out b)||b==0||a==b))||
    !(Math.Abs(x)<10000&&Math.Abs(y)<10000&&Math.Abs(z)<10000)){
    Game.Console.Print("RichAudio profile probe refused.");return;
   }
   running=true;used=true;bool matched=false,handedOff=false;
   try{
    target=Spawn(new Vector3(x,y,z));
    control=Spawn(new Vector3(x+5,y,z));
    if(target.Identity==control.Identity)throw new InvalidOperationException("Probe lifetimes overlap");
    uint original=Horn(target), neighbour=Horn(control);
    if(resolveOnly)Game.LogTrivial(String.Format(CultureInfo.InvariantCulture,
     "RichAudio marker A before: target={0}, model=F9300CC5, horn={1:X8}; neighbour={2}, model=F9300CC5, horn={3:X8}",
     target.Identity,original,control.Identity,neighbour));
    if(original==0||neighbour==0||original==a||original==b||neighbour==a||neighbour==b)
     throw new InvalidOperationException("Marker collides with unmodified readback");
    Assign(target,profileA);
    if(resolveOnly){
     GameFiber.Sleep(250);
     uint actual=Horn(target),neighbourAfter=Horn(control);
     Game.LogTrivial(String.Format(CultureInfo.InvariantCulture,
      "RichAudio marker A after: target={0}, horn={1:X8}; neighbour={2}, horn={3:X8}; expected={4:X8}",
      target.Identity,actual,control.Identity,neighbourAfter,a));
     if(actual!=a||neighbourAfter!=neighbour)throw new InvalidOperationException("Marker getter did not discriminate target and neighbour");
     matched=true;return;
    }
    Expect(a,neighbour);
    var lease=new Recovery{Target=target,Control=control,Baseline=profileA,MarkerA=a,MarkerB=b,Neighbour=neighbour,
     Deadline=Stopwatch.GetTimestamp()+2*Stopwatch.Frequency};
    recovery=lease;
    GameFiber.StartNew(delegate{Watch(lease);},"RichAudio private marker recovery");
    if(recovery!=lease||Stopwatch.GetTimestamp()>=lease.Deadline)throw new InvalidOperationException("Controller lease expired before B");
    handedOff=true;
    Assign(target,profileB);Expect(b,neighbour);
    if(mode=="controller-exit")return;
    if(recovery!=lease||Stopwatch.GetTimestamp()+Stopwatch.Frequency/2>=lease.Deadline)throw new InvalidOperationException("Controller restoration reserve expired");
    Restore(lease);
    matched=true;handedOff=false;
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception error){Game.Console.Print("RichAudio profile probe inconclusive: "+error.Message);}
   finally{
    if(!handedOff){
     recovery=null;
     bool retired=Cleanup();running=false;
     Game.LogTrivial("RichAudio marker "+mode+" matched="+matched+"; both probe lifetimes retired="+retired);
    }
   }
  }
 }
}
