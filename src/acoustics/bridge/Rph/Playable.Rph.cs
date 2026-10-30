using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using Rage;using Rage.Attributes;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
#if PLAYABLE_PRODUCT
[assembly:Plugin("RichAudio",Author="RichAudio",Description="Automatic offline Story Mode stock-source acoustics. Experimental additive; native GTA sounds retained.",EntryPoint="RichAudio.Beacon.Rph.PlayableEntry.Main",ExitPoint="RichAudio.Beacon.Rph.PlayableEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#endif
namespace RichAudio.Beacon.Rph {
 public static class PlayableEntry {
  static GameplayRuntime runtime;static volatile bool stopping;static long sequence,generation=1,lastGame=-1;static CameraObservation previous;static bool? paused;
  sealed class Tracked {public Vehicle Vehicle;public string Identity,Context;public uint Model;public int Generation=1;public double Distance;public double[] Position;public long Ticks;}
  static readonly List<Tracked> tracked=new List<Tracked>(4);static Entity[] discovered=new Entity[0];static int cursor;static long nextDiscovery;static int instance;
  public static void Main(){
   try{
    string executable=Process.GetCurrentProcess().MainModule.FileName;runtime=new GameplayRuntime();
    runtime.Start(Path.Combine(Path.GetDirectoryName(executable),"Plugins","RichAudio.Playable.json"),executable,typeof(Game).Assembly.Location);
    InGameMenu.Start();PassiveListener.Start();
    Game.Console.Print("RichAudio automatic Story Mode lifecycle. F10 settings. Experimental additive only; GTA engine audio remains. Unsupported vehicles retain stock audio.");
    while(!stopping){
     bool ready=false;try{ready=CameraSampler.StoryReady();}catch(ThreadAbortException){throw;}catch{}
     var r=runtime;if(r==null)break;r.SetStoryReady(ready);
     if(!ready){tracked.Clear();previous=null;generation++;}
     else if(r.Configuration!=null&&r.Settings!=null){try{Capture(r);}catch(ThreadAbortException){throw;}catch{tracked.Clear();previous=null;generation++;}}
     GameFiber.Sleep(50);
    }
   }catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio stock fallback: "+e.GetType().Name);}
   finally{OnUnload();}
  }
  static double[] V(Vector3 v){return new[]{(double)v.X,v.Y,v.Z};}
  static double Distance(double[] a,double[] b){double s=0;for(int i=0;i<3;i++)s+=(a[i]-b[i])*(a[i]-b[i]);return Math.Sqrt(s);}
  static string Context(Vehicle v,Ped player){var car=player.CurrentVehicle;var driver=v.Driver;return car!=null&&car.IsValid()&&car.Handle.Value==v.Handle.Value&&driver!=null&&driver.IsValid()&&driver.Handle.Value==player.Handle.Value?"player":"npc";}
  static void Offer(Vehicle v,Ped player,GameplayRuntime r,double[] camera){
   if(v==null||!v.IsValid()||v.IsDead)return;uint model=v.Model.Hash;string context=Context(v,player);if(!r.Configuration.Allows(model,context))return;
   string identity=v.Handle.Value.ToString("X8")+":"+v.MemoryAddress.ToString();var old=tracked.Find(t=>t.Identity.StartsWith(identity+":",StringComparison.Ordinal));
   if(old!=null){old.Vehicle=v;return;}
   double dist=Distance(V(v.Position),camera);if(tracked.Count>=4){tracked.Sort((a,b)=>a.Distance.CompareTo(b.Distance));if(dist>=tracked[3].Distance/1.3)return;tracked.RemoveAt(3);}
   tracked.Add(new Tracked{Vehicle=v,Identity=identity+":"+(++instance),Model=model,Context=context,Distance=dist});
  }
  static void Capture(GameplayRuntime r){
   long began=Stopwatch.GetTimestamp();var camera=CameraSampler.Read();var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid())return;
   double[] velocity={0,0,0};if(previous!=null){double dt=(camera.Observed-previous.Observed)/(double)Stopwatch.Frequency;
    if(dt>0&&dt<=.25){double speed=Distance(camera.Position,previous.Position)/dt;if(speed<=100)for(int i=0;i<3;i++)velocity[i]=(camera.Position[i]-previous.Position[i])/dt;else generation++;}
    else generation++;
    double dot=0;for(int i=0;i<3;i++)dot+=camera.Forward[i]*previous.Forward[i];if(dot<-.99)generation++;
   }
   if(camera.GameTime<lastGame||paused.HasValue&&paused.Value!=camera.Paused)generation++;lastGame=camera.GameTime;paused=camera.Paused;previous=camera;
   tracked.RemoveAll(t=>t.Vehicle==null||!t.Vehicle.IsValid());
   Offer(player.CurrentVehicle,player,r,camera.Position);
   if(Stopwatch.GetTimestamp()>=nextDiscovery){discovered=World.GetEntities(new Vector3((float)camera.Position[0],(float)camera.Position[1],(float)camera.Position[2]),600,GetEntitiesFlags.ConsiderCars|GetEntitiesFlags.ConsiderBikes);cursor=0;nextDiscovery=Stopwatch.GetTimestamp()+Stopwatch.Frequency;}
   for(int n=0;n<8&&cursor<discovered.Length&&Stopwatch.GetTimestamp()-began<Stopwatch.Frequency*.004;n++)Offer(discovered[cursor++] as Vehicle,player,r,camera.Position);
   var observations=new List<GameplayVehicle>(4);
   foreach(var t in tracked.ToArray()){
    if(Stopwatch.GetTimestamp()-began>Stopwatch.Frequency*.01)break;
    try{
     var v=t.Vehicle;if(!v.IsValid()||v.IsDead){tracked.Remove(t);continue;}string actual=v.Handle.Value.ToString("X8")+":"+v.MemoryAddress.ToString()+":";
     uint model=v.Model.Hash;string context=Context(v,player);if(!t.Identity.StartsWith(actual,StringComparison.Ordinal)||model!=t.Model||!r.Configuration.Allows(model,context)){tracked.Remove(t);continue;}
     long before=Stopwatch.GetTimestamp();var position=V(v.Position);var vel=V(v.Velocity);var forward=V(v.ForwardVector);var up=V(v.UpVector);bool running=v.IsEngineOn;double ratio=v.EngineRevolutionsRatio;long after=Stopwatch.GetTimestamp(),at=before+(after-before)/2;
     if(!Protocol.Finite(ratio)||ratio<0||ratio>1){tracked.Remove(t);continue;}
     if(t.Context!=context||t.Position!=null&&(at-t.Ticks>Stopwatch.Frequency/4||Distance(t.Position,position)>100*(at-t.Ticks)/(double)Stopwatch.Frequency+.5))t.Generation++;
     t.Context=context;t.Position=position;t.Ticks=at;t.Distance=Distance(position,camera.Position);
     observations.Add(new GameplayVehicle{Id="vehicle-"+t.Identity,Generation=t.Generation,Model=model,Context=context,ObservationTicks=at,Position=position,Velocity=vel,Forward=forward,Up=up,Running=running,OperatingPoint=ratio,Valid=true});
    }catch(ThreadAbortException){throw;}catch{tracked.Remove(t);}
   }
   double elapsed=(Stopwatch.GetTimestamp()-began)*1000d/Stopwatch.Frequency;r.MaximumObservationMs=Math.Max(r.MaximumObservationMs,elapsed);bool valid=elapsed<=10;
   var listener=new ListenerState{Version=1,Session=r.Session,Generation=generation,Sequence=sequence++,ObservationTicks=camera.Observed,ClockFrequency=Stopwatch.Frequency,GameTimeMs=camera.GameTime,
    Position=camera.Position,Velocity=velocity,Forward=camera.Forward,Up=camera.Up,ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=camera.Paused,Valid=valid,Reason=valid?"valid":"slow-observation",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};
   r.Publish(new GameplayFrame{Session=r.Session,Listener=listener,Vehicles=valid?observations.ToArray():new GameplayVehicle[0]});
  }
  [ConsoleCommand(Name="RichAudioStatus",Description="Automatic Story Mode integration status. Native GTA audio is not suppressed.")]
  public static void Status(){var r=runtime;Game.Console.Print(r==null?"RichAudio stopped; GTA stock audio retained":"RichAudio "+r.State+"; host="+r.HostPid+"; launches="+r.Attempts+"; maximum getter batch="+r.MaximumObservationMs.ToString("F2")+"ms; no native sound ownership.");}
  public static void OnUnload(){stopping=true;var r=runtime;runtime=null;if(r!=null){r.RequestStop();ThreadPool.QueueUserWorkItem(delegate{r.Join(5000);});}PassiveListener.Stop();InGameMenu.Stop();tracked.Clear();}
 }
}
