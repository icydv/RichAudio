using System;
using System.Diagnostics;
using Rage;
using Rage.Attributes;
using Rage.Native;

namespace RichAudio {
 public static class ReadVehicleHornCommand {
  // The observation build binds commands to its owned session. The standalone
  // profile probe uses the same command and getter without that binding.
  #if COMBINED_OBSERVATION
  internal static string Session;
#endif
#if !COMBINED_OBSERVATION
  [ConsoleCommand(Name="RichAudioReadVehicleHorn",Description="Read the current Story Mode vehicle horn discriminator three times without sounding it.")]
#endif
  public static void ReadVehicleHorn(){
#if COMBINED_OBSERVATION
   string session=Session??"standalone";
#else
   const string session="standalone";
#endif
   string prefix="RichAudio horn session="+session+"; ticks="+Stopwatch.GetTimestamp()+"; ";
#if COMBINED_OBSERVATION
   if(Session==null){Report(prefix+"result=not-armed");return;}
#endif
   try{
    if(Game.IsLoading||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS")){
     Report(prefix+"result=not-story-ready");return;
    }
    var player=Game.LocalPlayer.Character;
    var vehicle=!object.ReferenceEquals(player,null)&&player.IsValid()?player.CurrentVehicle:null;
    if(object.ReferenceEquals(vehicle,null)||!vehicle.IsValid()){Report(prefix+"result=no-selected-vehicle");return;}
    string lifetime=Identity(vehicle);uint model=vehicle.Model.Hash;
#if COMBINED_OBSERVATION
    if(model!=0xc3ddfdceu&&model!=0xeb70965fu){
     Report(prefix+"vehicle="+lifetime+"; model="+model.ToString("X8")+"; result=not-approved-donor");return;
    }
#endif
    var hashes=new string[3];
    var raw=new uint[hashes.Length];
    for(int i=0;i<raw.Length;i++){
     raw[i]=NativeFunction.CallByName<uint>("GET_VEHICLE_DEFAULT_HORN",unchecked((int)vehicle.Handle.Value));
     hashes[i]=raw[i].ToString("X8");
     var current=player.IsValid()?player.CurrentVehicle:null;
     if(object.ReferenceEquals(current,null)||!current.IsValid()||Identity(current)!=lifetime||current.Model.Hash!=model){
      Report(prefix+"vehicle="+lifetime+"; model="+model.ToString("X8")+"; result=identity-changed; raw="+String.Join(",",hashes));return;
     }
    }
    Report(prefix+"vehicle="+lifetime+"; model="+model.ToString("X8")+"; raw="+String.Join(",",hashes)+
     "; result="+(raw[0]!=raw[1]||raw[1]!=raw[2]?"inconsistent":raw[0]==0?"unavailable-zero":"consistent")+
     "; RPH="+typeof(Vehicle).Assembly.GetName().Version);
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception e){Report(prefix+"result=getter-error:"+e.GetType().Name);}
  }
  static void Report(string line){
   Game.LogTrivial(line);
   Game.Console.Print(line);
  }
  static string Identity(Vehicle v){
   var h=v.Handle;
   return h.Value.ToString("X8")+":"+h.Index.ToString("X")+":"+h.Counter.ToString("X2")+":"+v.MemoryAddress.ToInt64().ToString("X");
  }
 }
}
