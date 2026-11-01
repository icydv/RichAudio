using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using Rage;using Rage.Attributes;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
#if PLAYABLE_PRODUCT
#if SHV_HANDOFF_09
#if SHV_PLAYABLE_13
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
  static GameplayRuntime runtime;static volatile bool stopping;static long sequence,generation=1,lastGame=-1;static CameraObservation previous;static bool? paused;
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
    InGameMenu.Start();PassiveListener.Start();
    Game.Console.Print("RichAudio automatic Story Mode lifecycle. Saved menu shortcut (F10 default). Experimental additive only; GTA engine audio remains. Unsupported vehicles retain stock audio.");
    while(!stopping){
     bool ready=false;try{ready=CameraSampler.StoryReady();}catch(ThreadAbortException){throw;}catch{}
     var r=runtime;if(r==null)break;r.SetStoryReady(ready);
     if(!ready){tracked.Clear();previous=null;generation++;}
     else if(r.Configuration!=null&&r.Settings!=null){try{Capture(r);}catch(ThreadAbortException){throw;}catch(Exception e){sourceGetterFailures++;Diagnostic("capture-failed:"+stage+":"+e.GetType().Name);tracked.Clear();previous=null;generation++;}}
     GameFiber.Sleep(50);
    }
   }catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio stock fallback: "+e.GetType().Name);}
   finally{OnUnload();}
#endif
  }
#if !SHV_HANDOFF_09
  static double[] V(Vector3 v){return new[]{(double)v.X,v.Y,v.Z};}
  static double Distance(double[] a,double[] b){double s=0;for(int i=0;i<3;i++)s+=(a[i]-b[i])*(a[i]-b[i]);return Math.Sqrt(s);}
  static string Context(Vehicle v,Ped player){stage="context.current-vehicle";var car=player.CurrentVehicle;stage="context.driver";var driver=v.Driver;stage="context.identity";return car!=null&&car.IsValid()&&car.Handle.Value==v.Handle.Value&&driver!=null&&driver.IsValid()&&driver.Handle.Value==player.Handle.Value?"player":"npc";}
  static void Offer(Vehicle v,Ped player,GameplayRuntime r,double[] camera,bool currentPlayer=false){
   offers++;stage="offer.validity";if(v==null||!v.IsValid()){if(currentPlayer)lastReason="no-valid-player-vehicle";return;}stage="offer.dead";if(v.IsDead){deadOffers++;if(currentPlayer)lastReason="player-vehicle-dead";return;}stage="offer.model";uint model=v.Model.Hash;string context=Context(v,player);if(currentPlayer){lastPlayerModel=model;lastPlayerContext=context;}stage="offer.registry";if(!r.Configuration.Allows(model,context)){unsupportedOffers++;if(currentPlayer)lastReason="player-model-context-not-eligible";return;}eligibleOffers++;
   stage="offer.identity";
   string identity=v.Handle.Value.ToString("X8")+":"+v.MemoryAddress.ToString();var old=tracked.Find(t=>t.Identity.StartsWith(identity+":",StringComparison.Ordinal));
   if(old!=null){old.Vehicle=v;return;}
   double dist=Distance(V(v.Position),camera);if(tracked.Count>=4){tracked.Sort((a,b)=>a.Distance.CompareTo(b.Distance));if(dist>=tracked[3].Distance/1.3)return;tracked.RemoveAt(3);}
   tracked.Add(new Tracked{Vehicle=v,Identity=identity+":"+(++instance),Model=model,Context=context,Distance=dist});
  }
  static void Capture(GameplayRuntime r){
   captures++;lastReason="no-eligible-observations";stage="capture.camera";long began=Stopwatch.GetTimestamp();var camera=CameraSampler.Read();stage="capture.player";var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid()){Diagnostic("player-unavailable");return;}
   double[] velocity={0,0,0};if(previous!=null){double dt=(camera.Observed-previous.Observed)/(double)Stopwatch.Frequency;
    if(dt>0&&dt<=.25){double speed=Distance(camera.Position,previous.Position)/dt;if(speed<=100)for(int i=0;i<3;i++)velocity[i]=(camera.Position[i]-previous.Position[i])/dt;else generation++;}
    else generation++;
    double dot=0;for(int i=0;i<3;i++)dot+=camera.Forward[i]*previous.Forward[i];if(dot<-.99)generation++;
   }
   if(camera.GameTime<lastGame||paused.HasValue&&paused.Value!=camera.Paused)generation++;lastGame=camera.GameTime;paused=camera.Paused;previous=camera;
   tracked.RemoveAll(t=>t.Vehicle==null||!t.Vehicle.IsValid());
   stage="capture.player-current-vehicle";Offer(player.CurrentVehicle,player,r,camera.Position,true);
   if(Stopwatch.GetTimestamp()>=nextDiscovery){discovered=World.GetEntities(new Vector3((float)camera.Position[0],(float)camera.Position[1],(float)camera.Position[2]),600,GetEntitiesFlags.ConsiderCars|GetEntitiesFlags.ConsiderBikes);cursor=0;nextDiscovery=Stopwatch.GetTimestamp()+Stopwatch.Frequency;}
   for(int n=0;n<8&&cursor<discovered.Length&&Stopwatch.GetTimestamp()-began<Stopwatch.Frequency*.004;n++)Offer(discovered[cursor++] as Vehicle,player,r,camera.Position);
   var observations=new List<GameplayVehicle>(4);
   foreach(var t in tracked.ToArray()){
    if(Stopwatch.GetTimestamp()-began>Stopwatch.Frequency*.01)break;
    try{
     stage="source.validity";var v=t.Vehicle;if(!v.IsValid()||v.IsDead){deadOffers++;lastReason="tracked-source-invalid-or-dead";tracked.Remove(t);continue;}stage="source.identity";string actual=v.Handle.Value.ToString("X8")+":"+v.MemoryAddress.ToString()+":";
     uint model=v.Model.Hash;string context=Context(v,player);stage="source.registry";if(!t.Identity.StartsWith(actual,StringComparison.Ordinal)||model!=t.Model||!r.Configuration.Allows(model,context)){identityRetirements++;lastReason="source-identity-model-context-changed";tracked.Remove(t);continue;}
     long before=Stopwatch.GetTimestamp();stage="source.position";var position=V(v.Position);stage="source.velocity";var vel=V(v.Velocity);stage="source.forward";var forward=V(v.ForwardVector);stage="source.up";var up=V(v.UpVector);stage="source.engine-on";bool running=v.IsEngineOn;stage="source.revolutions-ratio";double ratio=v.EngineRevolutionsRatio;lastRatio=ratio;lastRunning=running;long after=Stopwatch.GetTimestamp(),at=before+(after-before)/2;
     if(!Protocol.Finite(ratio)||ratio<0||ratio>1){ratioRejections++;lastReason="source-ratio-out-of-contract";tracked.Remove(t);continue;}
     if(t.Context!=context||t.Position!=null&&(at-t.Ticks>Stopwatch.Frequency/4||Distance(t.Position,position)>100*(at-t.Ticks)/(double)Stopwatch.Frequency+.5))t.Generation++;
     t.Context=context;t.Position=position;t.Ticks=at;t.Distance=Distance(position,camera.Position);
     observations.Add(new GameplayVehicle{Id="vehicle-"+t.Identity,Generation=t.Generation,Model=model,Context=context,ObservationTicks=at,Position=position,Velocity=vel,Forward=forward,Up=up,Running=running,OperatingPoint=ratio,Valid=true});
    }catch(ThreadAbortException){throw;}catch(Exception e){sourceGetterFailures++;lastReason="source-getter-failed:"+stage+":"+e.GetType().Name;tracked.Remove(t);}
   }
   double elapsed=(Stopwatch.GetTimestamp()-began)*1000d/Stopwatch.Frequency;r.MaximumObservationMs=Math.Max(r.MaximumObservationMs,elapsed);bool valid=elapsed<=10;
   if(!valid){slowBatches++;lastReason="slow-observation-batch";}else if(observations.Count>0)lastReason="observed-vehicles:"+observations.Count;publishedVehicles+=valid?observations.Count:0;
   var listener=new ListenerState{Version=1,Session=r.Session,Generation=generation,Sequence=sequence++,ObservationTicks=camera.Observed,ClockFrequency=Stopwatch.Frequency,GameTimeMs=camera.GameTime,
    Position=camera.Position,Velocity=velocity,Forward=camera.Forward,Up=camera.Up,ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=camera.Paused,Valid=valid,Reason=valid?"valid":"slow-observation",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};
   r.Publish(new GameplayFrame{Session=r.Session,Listener=listener,Vehicles=valid?observations.ToArray():new GameplayVehicle[0]});
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
   stopping=true;var r=runtime;runtime=null;if(r!=null){r.RequestStop();ThreadPool.QueueUserWorkItem(delegate{r.Join(5000);});}PassiveListener.Stop();InGameMenu.Stop();tracked.Clear();
#endif
  }
 }
}
