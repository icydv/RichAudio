using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using Rage;using Rage.Attributes;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
#if PLAYABLE_PRODUCT
#if SHV_HANDOFF_09
#if SHV_HANDOFF_14
[assembly:Plugin("RichAudio",Author="RichAudio",Description="PLAYABLE-14 passive SHV/RPH handoff with bounded fresh-context readiness. No audio host or recording.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#elif SHV_PLAYABLE_13
[assembly:Plugin("RichAudio",Author="RichAudio",Description="PLAYABLE-13 explicitly gated player-Bati additive audio demonstration; stock GTA sounds retained.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#elif SHV_HANDOFF_13
[assembly:Plugin("RichAudio",Author="RichAudio",Description="PLAYABLE-13 passive SHV/RPH handoff. No audio host or recording.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#else
[assembly:Plugin("RichAudio",Author="RichAudio",Description="PLAYABLE-12 passive SHV/RPH handoff qualification. GTA stock audio; no audio host.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#endif
#else
[assembly:Plugin("RichAudio",Author="RichAudio",Description="Automatic offline Story Mode stock-source acoustics. Experimental additive; native GTA sounds retained.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#endif
#endif
namespace RichAudio.Beacon.Rph {
 public static class PlayableEntry {
#if !SHV_HANDOFF_09
  static GameplayRuntime runtime;static volatile bool stopping;static CameraListenerTracker listenerTracker=new CameraListenerTracker();
  sealed class Tracked {public Vehicle Vehicle;public string Identity,Context;public uint Model;public int Generation=1;public double Distance;public double[] Position;public long Ticks;}
  static readonly List<Tracked> tracked=new List<Tracked>(4);static Entity[] discovered=new Entity[0];static int cursor;static long nextDiscovery;static int instance;
  static long captures,offers,eligibleOffers,unsupportedOffers,deadOffers,sourceGetterFailures,ratioRejections,identityRetirements,publishedVehicles,slowBatches,lastDiagnosticAt;
  static string stage="startup",lastReason="not-sampled",lastPlayerContext="unknown",lastPrintedReason;static uint lastPlayerModel;static double lastRatio=Double.NaN;static bool lastRunning;static int diagnosticChanges;
  static void Diagnostic(string reason){lastReason=reason;if(reason==lastPrintedReason||diagnosticChanges>=8||Stopwatch.GetTimestamp()-lastDiagnosticAt<Stopwatch.Frequency*2)return;lastPrintedReason=reason;lastDiagnosticAt=Stopwatch.GetTimestamp();diagnosticChanges++;Game.Console.Print("RichAudio vehicle evidence "+VehicleDiagnostic());}
  static string VehicleDiagnostic(){return "reason="+lastReason+" stage="+stage+" playerModel="+lastPlayerModel.ToString("X8")+" context="+lastPlayerContext+" rawRatio="+lastRatio.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+" running="+lastRunning+" tracked="+tracked.Count+" discovery="+discovered.Length+" captures="+captures+" offers="+offers+" eligible="+eligibleOffers+" unsupported="+unsupportedOffers+" dead="+deadOffers+" getterFailures="+sourceGetterFailures+" ratioRejects="+ratioRejections+" identityRetired="+identityRetirements+" publishedTotal="+publishedVehicles+" slowBatches="+slowBatches;}
#endif
#if SHV_HANDOFF_09
  [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
  static void RunPassive(){ShvPassiveHandoffEntry.Run();}
#endif
  public static void Main(){
#if SHV_HANDOFF_09
   // Catch compatibility/JIT failures before Run's own try can be entered.
   try{RunPassive();}catch(ThreadAbortException){throw;}catch(Exception e){
    try{System.Console.Error.WriteLine("RichAudio passive compatibility/lifecycle failure: "+e.GetType().Name+". Stock fallback retained; no retry.");}catch(ThreadAbortException){throw;}catch{}
   }
#else
   try{
    string executable=Process.GetCurrentProcess().MainModule.FileName;runtime=new GameplayRuntime();
    runtime.Start(Path.Combine(Path.GetDirectoryName(executable),"Plugins","RichAudio.Playable.json"),executable,typeof(Game).Assembly.Location);
    // The existing supervisor validates its sidecar and queues bounded work
    // outside the game fibre. Missing/disabled configuration remains explicit.
    InstalledWorldWarmup.Start();InGameMenu.Start();PassiveListener.Start();
    Game.Console.Print("RichAudio STREET-01 main Story Mode lifecycle. Saved menu shortcut (F10 default). Experimental additive only; GTA engine audio remains. Installed coverage and native takeover are not fully qualified.");
    while(!stopping){
     bool ready=false;try{ready=CameraSampler.StoryReady();}catch(ThreadAbortException){throw;}catch{}
     var r=runtime;if(r==null)break;r.SetStoryReady(ready);
     if(!ready){tracked.Clear();listenerTracker.Invalidate();}
     else if(r.Configuration!=null&&r.Settings!=null){try{Capture(r);}catch(ThreadAbortException){throw;}catch(Exception e){sourceGetterFailures++;Diagnostic("capture-failed:"+stage+":"+e.GetType().Name);tracked.Clear();listenerTracker.Invalidate();}}
     GameFiber.Sleep(50);
    }
   }catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio stock fallback: "+e.GetType().Name);}
   finally{OnUnload();}
#endif
  }
#if !SHV_HANDOFF_09
  static double[] V(Vector3 v){return new[]{(double)v.X,v.Y,v.Z};}
  static double Distance(double[] a,double[] b){double s=0;for(int i=0;i<3;i++)s+=(a[i]-b[i])*(a[i]-b[i]);return Math.Sqrt(s);}
  static bool Same(Entity a,Entity b){return a!=null&&b!=null&&a.IsValid()&&b.IsValid()&&a.Handle.Value==b.Handle.Value&&a.Handle.Index==b.Handle.Index&&a.Handle.Counter==b.Handle.Counter&&a.MemoryAddress==b.MemoryAddress;}
  static string Context(Vehicle v,Ped player){stage="context.current-vehicle";var car=player.CurrentVehicle;stage="context.driver";var driver=v.Driver;stage="context.identity";return Same(car,v)&&Same(driver,player)?"player":"npc";}
  static string VehicleIdentity(Vehicle v){var h=v.Handle;return h.Value.ToString("X8")+":"+h.Index.ToString("X")+":"+h.Counter.ToString("X2")+":"+v.MemoryAddress.ToInt64().ToString("X");}
  static void Offer(Vehicle v,Ped player,GameplayRuntime r,double[] camera,bool currentPlayer=false){
   offers++;stage="offer.validity";if(v==null||!v.IsValid()){if(currentPlayer)lastReason="no-valid-player-vehicle";return;}stage="offer.dead";if(v.IsDead){deadOffers++;if(currentPlayer)lastReason="player-vehicle-dead";return;}stage="offer.model";uint model=v.Model.Hash;string context=Context(v,player);if(currentPlayer){lastPlayerModel=model;lastPlayerContext=context;}stage="offer.registry";if(!r.Configuration.Allows(model,context)){unsupportedOffers++;if(currentPlayer)lastReason="player-model-context-not-eligible";return;}eligibleOffers++;
   stage="offer.identity";
   string identity=VehicleIdentity(v);var old=tracked.Find(t=>t.Identity.StartsWith(identity+":",StringComparison.Ordinal));
   if(old!=null){old.Vehicle=v;return;}
   double dist=Distance(V(v.Position),camera);if(tracked.Count>=4){tracked.Sort((a,b)=>a.Distance.CompareTo(b.Distance));if(dist>=tracked[3].Distance/1.3)return;tracked.RemoveAt(3);}
   tracked.Add(new Tracked{Vehicle=v,Identity=identity+":"+(++instance),Model=model,Context=context,Distance=dist});
  }
  static void Capture(GameplayRuntime r){
   captures++;lastReason="no-eligible-observations";stage="capture.camera";long began=Stopwatch.GetTimestamp();var camera=CameraSampler.Read();stage="capture.player";var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid()){Diagnostic("player-unavailable");return;}
   var decision=listenerTracker.Observe(r.Session,camera);
   if(decision.Terminal){listenerTracker.Invalidate();Diagnostic(decision.Classification);return;}
   // A measured camera cut is consumed privately, never interpolated through.
   // Existing vehicle observations can continue on the next independent pose.
   if(!decision.Publish){Diagnostic(decision.Classification);return;}
   bool vehicleView=false;
   try{vehicleView=Rage.Native.NativeFunction.CallByName<bool>("IS_GAMEPLAY_CAM_RENDERING")&&Rage.Native.NativeFunction.CallByName<bool>("IS_FOLLOW_VEHICLE_CAM_ACTIVE");}
   catch(ThreadAbortException){throw;}catch{vehicleView=false;}
   tracked.RemoveAll(t=>t.Vehicle==null||!t.Vehicle.IsValid());
   stage="capture.player-current-vehicle";Offer(player.CurrentVehicle,player,r,camera.Position,true);
   if(Stopwatch.GetTimestamp()>=nextDiscovery){discovered=World.GetEntities(new Vector3((float)camera.Position[0],(float)camera.Position[1],(float)camera.Position[2]),600,GetEntitiesFlags.ConsiderCars|GetEntitiesFlags.ConsiderBikes);cursor=0;nextDiscovery=Stopwatch.GetTimestamp()+Stopwatch.Frequency;}
   for(int n=0;n<8&&cursor<discovered.Length&&Stopwatch.GetTimestamp()-began<Stopwatch.Frequency*.004;n++)Offer(discovered[cursor++] as Vehicle,player,r,camera.Position);
   var observations=new List<GameplayVehicle>(4);
   foreach(var t in tracked.ToArray()){
    if(Stopwatch.GetTimestamp()-began>Stopwatch.Frequency*.01)break;
    try{
     stage="source.validity";var v=t.Vehicle;if(!v.IsValid()||v.IsDead){deadOffers++;lastReason="tracked-source-invalid-or-dead";tracked.Remove(t);continue;}stage="source.identity";string actual=VehicleIdentity(v)+":";
     uint model=v.Model.Hash;bool riderAttached=Context(v,player)=="player";
     // Context selects the prepared bank for this source lifetime. Dismounting
     // changes rider attachment, not the existence/running state or grain owner.
     string context=t.Context;stage="source.registry";if(!t.Identity.StartsWith(actual,StringComparison.Ordinal)||model!=t.Model||!r.Configuration.Allows(model,context)){identityRetirements++;lastReason="source-identity-model-context-changed";tracked.Remove(t);continue;}
     long before=Stopwatch.GetTimestamp();stage="source.position";var position=V(v.Position);stage="source.velocity";var vel=V(v.Velocity);stage="source.forward";var forward=V(v.ForwardVector);stage="source.up";var up=V(v.UpVector);stage="source.engine-on";bool running=v.IsEngineOn;stage="source.revolutions-ratio";double ratio=v.EngineRevolutionsRatio;lastRatio=ratio;lastRunning=running;long after=Stopwatch.GetTimestamp(),at=before+(after-before)/2;
     // A rejected quantity withholds this observation, not the independently
     // retained pool lifetime/bank context. Do not refresh position or time;
     // later valid evidence still crosses the existing 250 ms gap boundary.
     if(!Protocol.Finite(ratio)||ratio<0||ratio>1){ratioRejections++;lastReason="source-ratio-out-of-contract";continue;}
     // Recheck identity/relationship after getters; a recycled instance must
     // never inherit the original source, and an interrupted dismount supplies
     // no guessed attachment evidence for rider-local synthesis.
     if(!v.IsValid()||v.IsDead||!t.Identity.StartsWith(VehicleIdentity(v)+":",StringComparison.Ordinal)||v.Model.Hash!=model){identityRetirements++;tracked.Remove(t);continue;}
     riderAttached=riderAttached&&Context(v,player)=="player";
     if(t.Position!=null&&(at<=t.Ticks||at-t.Ticks>Stopwatch.Frequency/4||Distance(t.Position,position)>100*(at-t.Ticks)/(double)Stopwatch.Frequency+.5))t.Generation++;
     t.Context=context;t.Position=position;t.Ticks=at;t.Distance=Distance(position,camera.Position);
     observations.Add(new GameplayVehicle{Id="vehicle-"+t.Identity,Generation=t.Generation,Model=model,Context=context,ObservationTicks=at,Position=position,Velocity=vel,Forward=forward,Up=up,Running=running,OperatingPoint=ratio,Valid=true,RiderAttached=riderAttached,RiderViewAttached=riderAttached&&vehicleView});
    }catch(ThreadAbortException){throw;}catch(Exception e){sourceGetterFailures++;lastReason="source-getter-failed:"+stage+":"+e.GetType().Name;tracked.Remove(t);}
   }
   double elapsed=(Stopwatch.GetTimestamp()-began)*1000d/Stopwatch.Frequency;r.MaximumObservationMs=Math.Max(r.MaximumObservationMs,elapsed);bool valid=elapsed<=10;
   if(!valid){slowBatches++;lastReason="slow-observation-batch";}else if(observations.Count>0)lastReason="observed-vehicles:"+observations.Count;publishedVehicles+=valid?observations.Count:0;
   var listener=decision.Listener;listener.Valid=valid;listener.Reason=valid?"valid":"slow-observation";
   r.Publish(new GameplayFrame{Session=r.Session,Listener=listener,Vehicles=valid?observations.ToArray():new GameplayVehicle[0],WorldPreparationStartedUtc=InstalledWorldWarmup.StartedUtc});
   Diagnostic(lastReason);
  }
#endif
  [ConsoleCommand(Name="RichAudioStatus",Description="Automatic Story Mode integration status. Native GTA audio is not suppressed.")]
  public static void Status(){
#if SHV_HANDOFF_09
   ShvPassiveHandoffEntry.PrintStatus();
#else
   var r=runtime;Game.Console.Print(r==null?"RichAudio stopped; GTA stock audio retained":"RichAudio "+r.State+"; host="+r.HostPid+"; launches="+r.Attempts+"; maximum getter batch="+r.MaximumObservationMs.ToString("F2")+"ms; no native sound ownership.");Game.Console.Print("RichAudio vehicle evidence "+VehicleDiagnostic());
#endif
  }
  public static void OnUnload(){
#if SHV_HANDOFF_09
   ShvPassiveHandoffEntry.Stop();
#else
   stopping=true;var r=runtime;runtime=null;if(r!=null){r.RequestStop();ThreadPool.QueueUserWorkItem(delegate{r.Join(5000);});}InstalledWorldWarmup.Stop();PassiveListener.Stop();InGameMenu.Stop();tracked.Clear();
#endif
  }
 }
}
