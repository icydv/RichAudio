// Observation-only opt-in experiment. This assembly excludes the Bati controller/adapter.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.IO;using System.Linq;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Threading;
using Rage;using Rage.Attributes;using Rage.Native;using RichAudio.AirportResearch;using RichAudio.BatiResearch;using RichAudio.MarkerResearch;using RichAudio.GeometryResearch;
[assembly:Plugin("RichAudio Airport Survey",Author="RichAudio",Description="Six explicit observation stops; no benchmark mutations",EntryPoint="RichAudio.SurveyRph.Observer.Main",ExitPoint="RichAudio.SurveyRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.SurveyRph
{
 [DataContract]public sealed class Config
 {
  [DataMember]public int Version,MarkerRevision;[DataMember]public bool StoryModeOnly,SurveyApproved;
  [DataMember]public string MarkerFile,MarkerHash,MarkerSession,OutputDirectory;
 }
 public sealed class Line{public Point3 A,B;public Color Colour;}
 public sealed class View{public Line[] Lines=new Line[0];public string[] Hud=new[]{"RICHAUDIO SURVEY INITIALISING"};public int Omitted;}
 public static class Observer
 {
  static readonly Stopwatch clock=Stopwatch.StartNew();static volatile bool ready,stopping,capturing,visible,drawingFailed;
  static volatile View view=new View();static Survey survey;static MarkerSet markers;static Config config;static string session,reason="20-minute observer limit";static uint playerHandle,playerModel;static Ped originalPlayer;
  static Point3 P(Vector3 v){return new Point3(v.X,v.Y,v.Z);}static MarkerPoint M(Vector3 v){return new MarkerPoint(v.X,v.Y,v.Z);}static Vector3 V(Point3 p){return new Vector3((float)p.X,(float)p.Y,(float)p.Z);}
  static void Story(){if(stopping||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode/lifecycle guard");}
  public static void Main()
  {
   bool attached=false;
   try{
    string exe=Process.GetCurrentProcess().MainModule.FileName;Check.That(Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)&&FileVersionInfo.GetVersionInfo(exe).FileVersion=="1.0.1158.16"&&FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion=="1.132.1428.17748","exact-build guard");
    string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Survey.Rph.json");Check.That(new FileInfo(file).Length<=8192,"configuration size");using(var f=File.OpenRead(file))config=(Config)new DataContractJsonSerializer(typeof(Config)).ReadObject(f);
    Check.That(config.Version==1&&config.StoryModeOnly&&config.SurveyApproved&&config.MarkerRevision==3,"explicit sealed survey config");PrivateFiles.RequireLocal(config.OutputDirectory);Check.That(Directory.Exists(config.OutputDirectory)&&Directory.GetFileSystemEntries(config.OutputDirectory).Length==0&&Path.GetFileName(config.OutputDirectory)=="survey-evidence"&&!Path.GetFullPath(config.OutputDirectory).StartsWith(Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory),StringComparison.OrdinalIgnoreCase),"fresh private output outside game");
    markers=MarkerSet.Load(config.MarkerFile,config.MarkerHash,config.MarkerRevision,config.MarkerSession,"runtime-observation");session=Guid.NewGuid().ToString("N");DurableAttempt.Reserve(Path.Combine(config.OutputDirectory,"session.attempt"),session);survey=new Survey(markers,session);Story();
    var dims=new Dimensions();try{Vector3 min,max;new Model("bati").GetDimensions(out min,out max);dims.Minimum=M(min);dims.Maximum=M(max);dims.Status="OBSERVED_MODEL_BOUNDS";survey.SetDimensions(dims);}catch(ThreadAbortException){throw;}catch{survey.SetDimensions(new Dimensions());}
    Refresh();Game.FrameRender+=Hud;attached=true;ready=true;Game.Console.Print("RichAudio SURVEY READY: no collision queries. Start / Mid1 / Mid2 / Mid3 / Finish / Runout are separate RichAudioSurvey commands. Show/Replay/Hide are cached only. Stop ends observer.");
    double nextGuard=0;while(capturing||!stopping&&clock.ElapsedMilliseconds<1200000){
     if(!capturing&&clock.Elapsed.TotalMilliseconds>=nextGuard){nextGuard=clock.Elapsed.TotalMilliseconds+250;if(NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("multiplayer guard");if(originalPlayer!=null&&(!originalPlayer.IsValid()||Game.LocalPlayer.Character.Handle.Value!=playerHandle||originalPlayer.Model.Hash!=playerModel))throw new InvalidOperationException("player identity changed");}
     if(drawingFailed){visible=false;drawingFailed=false;Game.Console.Print("Survey drawing unavailable; capture stopped without fallback");Stop();}
     if(visible&&!Game.IsPaused){var cache=view;try{foreach(var l in cache.Lines)NativeFunction.CallByName<uint>("DRAW_LINE",(float)l.A.X,(float)l.A.Y,(float)l.A.Z,(float)l.B.X,(float)l.B.Y,(float)l.B.Z,(int)l.Colour.R,(int)l.Colour.G,(int)l.Colour.B,200);}catch(ThreadAbortException){throw;}catch{drawingFailed=true;}}
     GameFiber.Yield();
    }
   }catch(ThreadAbortException){reason="host cancellation";throw;}catch(Exception e){reason=e.GetType().Name;Game.Console.Print("Survey stopped: "+reason);}
   finally{ready=false;stopping=true;visible=false;if(attached)Game.FrameRender-=Hud;if(survey!=null){survey.Stop(reason);try{SurveyPersistence.Save(Path.Combine(config.OutputDirectory,"closed.json"),survey.Snapshot());Game.Console.Print("Survey CLOSED; evidence flushed, display detached; collision calls="+survey.Calls);}catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("Survey final evidence incomplete: "+e.GetType().Name);}}}
  }
  static Pose ReadPose()
  {
   Story();var p=Game.LocalPlayer.Character;Check.That(p!=null&&p.IsValid(),"valid player");if(originalPlayer==null){originalPlayer=p;playerHandle=p.Handle.Value;playerModel=p.Model.Hash;}Check.That(originalPlayer.IsValid()&&p.Handle.Value==playerHandle&&p.Model.Hash==playerModel,"player identity continuity, no reuse inference");var car=p.CurrentVehicle;var pose=new Pose{Position=M(p.Position),Forward=M(p.ForwardVector),Speed=P(p.Velocity).Length,Player=p.Handle.Value,Generation=1,Interior=NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",p),OnFoot=car==null||!car.IsValid(),AtMs=clock.Elapsed.TotalMilliseconds};SurveyPlan.ValidatePose(pose);return pose;
  }
  static GeometryObservation Trace(Ray ray,Pose pose)
  {
   var a=P(V(ray.Origin));var b=P(V(ray.End));var o=new GeometryObservation{SessionId=session,GameVersion="1.0.1158.16",FrameworkVersion="1.132.1428.17748",StartedUtc=DateTime.UtcNow.ToString("o"),ObservedAtMs=clock.Elapsed.TotalMilliseconds,Origin=a,End=b,MaximumDistance=Point3.Sub(b,a).Length,TraceCalls=1,IgnoredPlayerHandle=pose.Player,PlayerSpeed=pose.Speed,SetupStatus="on_foot_stationary_by_SDK_getters",QueryProvenance=ray.Role=="ground-probe"?"airport-ground-probe-v1":"airport-body-line-v1"};
   var w=Stopwatch.StartNew();HitResult hit;try{hit=World.TraceLine(V(ray.Origin),V(ray.End),TraceFlags.IntersectWorld,new Entity[]{originalPlayer});}finally{o.TraceDurationMs=w.Elapsed.TotalMilliseconds;}w.Restart();o.Completion=hit.Hit?"hit":"miss";
   if(hit.Hit){o.HitPosition=P(hit.HitPosition);o.HitNormal=P(hit.HitNormal);o.PositionStatus=o.NormalStatus="observed";var entity=hit.HitEntity;if(entity==null)o.EntityStatus="none_returned_static_unproven";else{Check.That(entity.IsValid(),"invalid hit entity");o.HitEntityHandle=entity.Handle.Value;o.EntityStatus="returned_identity_unclassified";}}else o.PositionStatus=o.NormalStatus=o.EntityStatus="not_returned_miss";
   o.ConversionDurationMs=w.Elapsed.TotalMilliseconds;return o;
  }
  static Navigation Nav(MarkerPoint p)
  {
   var n=new Navigation();try{n.Calls++;n.NodesLoaded=NativeFunction.CallByName<bool>("ARE_NODES_LOADED_FOR_AREA",(float)(p.X-12),(float)(p.Y-12),(float)(p.X+12),(float)(p.Y+12));n.Calls++;n.TravelEstimate=NativeFunction.CallByName<float>("CALCULATE_TRAVEL_DISTANCE_BETWEEN_POINTS",(float)p.X,(float)p.Y,(float)p.Z,(float)markers.Finish.X,(float)markers.Finish.Y,(float)markers.Finish.Z);}catch(ThreadAbortException){throw;}catch(Exception e){n.Error=e.GetType().Name;}return n;
  }
  static Interference Nearby(MarkerPoint p)
  {
   var r=new Interference();var items=new List<Occupant>();var watch=Stopwatch.StartNew();int serial=0;
   for(int kind=0;kind<3;kind++){
    if(watch.Elapsed.TotalMilliseconds>=8){r.Error="enumeration time budget; partial";break;}
    Entity[] entities;try{r.Enumerations++;entities=kind==0?(Entity[])World.GetAllVehicles():kind==1?(Entity[])World.GetAllPeds():(Entity[])World.GetAllObjects();}catch(ThreadAbortException){throw;}catch{r.Error="enumeration unavailable";continue;}
    r.Enumerated+=entities.Length;int cap=Math.Min(entities.Length,4096);r.Omitted+=entities.Length-cap;
    for(int i=0;i<cap;i++){if(watch.Elapsed.TotalMilliseconds>=8){r.Omitted+=cap-i;r.Error="enumeration time budget; partial";break;}var e=entities[i];r.Examined++;try{if(e==null||!e.IsValid()){r.ReadErrors++;continue;}uint handle=e.Handle.Value,model=e.Model.Hash;if(handle==playerHandle)continue;var position=M(e.Position);var velocity=M(e.Velocity);Check.That(position.Valid&&velocity.Valid,"finite entity state");if(Check.Distance(p,position)>12)continue;if(items.Count==64){r.Omitted++;continue;}Check.That(e.IsValid()&&e.Handle.Value==handle&&e.Model.Hash==model,"identity changed during read");items.Add(new Occupant{Handle=handle,Model=model,ObservationSerial=++serial,Kind=kind==0?"vehicle":kind==1?"ped":"object",Position=position,Velocity=velocity});}catch(ThreadAbortException){throw;}catch{r.ReadErrors++;}}
   }r.Nearby=items.ToArray();r.AtMs=clock.Elapsed.TotalMilliseconds;return r;
  }
  static void Capture(StopKind kind)
  {
   if(!ready||stopping||capturing){Game.Console.Print("Survey command refused; no acquisition.");return;}capturing=true;
   try{
    // Claim the durable stop before the first query; no reload/retry can reuse this directory.
    DurableAttempt.Reserve(Path.Combine(config.OutputDirectory,kind+".attempt"),session);var pose=ReadPose();var record=survey.Begin(kind,pose);
    while(record.ActualCalls<record.Plan.Count){var current=ReadPose();var ray=survey.ClaimRay(current);survey.Accept(Trace(ray,current));record=survey.Snapshot().Stops.Last();}
    Check.That(Check.Distance(ReadPose().Position,pose.Position)<=.05,"movement after probes");var navigation=Nav(record.Anchor);var interference=Nearby(record.Anchor);Check.That(Check.Distance(ReadPose().Position,pose.Position)<=.05,"movement during auxiliary observations");var complete=survey.Complete(navigation,interference,clock.Elapsed.TotalMilliseconds);SurveyPersistence.Save(Path.Combine(config.OutputDirectory,"stop-"+complete.Revision+".json"),survey.Snapshot());Refresh();Game.Console.Print("Survey "+kind+" saved; calls="+survey.Calls+"/36; coverage PARTIAL; benchmark BLOCKED.");
   }catch(ThreadAbortException){reason="host cancellation during stop";if(survey!=null)survey.Stop(reason);stopping=true;throw;}catch(Exception e){reason="stop failure: "+e.GetType().Name;if(survey!=null)survey.Stop(reason);stopping=true;Game.Console.Print(reason+"; no retry");}finally{capturing=false;}
  }
  static void Add(List<Line> lines,Point3 a,Point3 b,Color c){lines.Add(new Line{A=a,B=b,Colour=c});}
  static void Cross(List<Line> lines,MarkerPoint p,Color c){Add(lines,new Point3(p.X-.5,p.Y,p.Z),new Point3(p.X+.5,p.Y,p.Z),c);Add(lines,new Point3(p.X,p.Y-.5,p.Z),new Point3(p.X,p.Y+.5,p.Z),c);Add(lines,new Point3(p.X,p.Y,p.Z-.5),new Point3(p.X,p.Y,p.Z+.5),c);}
  static void Refresh()
  {
   var r=survey.Snapshot();var lines=new List<Line>();Cross(lines,r.OriginalStart,Color.Lime);Cross(lines,r.OriginalFinish,Color.Red);Cross(lines,r.OriginalListener,Color.Cyan);
   foreach(var stop in r.Stops){if(stop.Kind.StartsWith("Mid")||stop.Kind=="Runout")Cross(lines,stop.Player.Position,Color.Magenta);foreach(var o in stop.Observations.Where(o=>o.Completion=="hit"&&o.HitPosition.HasValue&&o.HitNormal.HasValue)){var p=o.HitPosition.Value;Add(lines,p,new Point3(p.X+o.HitNormal.Value.X*.5,p.Y+o.HitNormal.Value.Y*.5,p.Z+o.HitNormal.Value.Z*.5),Color.White);Cross(lines,SurveyPlan.M(p),Color.DodgerBlue);}foreach(var e in stop.Interference.Nearby)Cross(lines,e.Position,Color.Orange);}
   var route=new List<MarkerPoint>{r.OriginalStart};route.AddRange(r.Stops.Where(s=>s.Kind.StartsWith("Mid")).Select(s=>s.Player.Position));route.Add(r.OriginalFinish);
   for(int j=1;j<route.Count;j++){var a=SurveyPlan.P(route[j-1]);var d=Point3.Sub(SurveyPlan.P(route[j]),a);for(int i=0;i<8;i++)Add(lines,new Point3(a.X+d.X*i/8,a.Y+d.Y*i/8,a.Z+d.Z*i/8),new Point3(a.X+d.X*(i+.4)/8,a.Y+d.Y*(i+.4)/8,a.Z+d.Z*(i+.4)/8),Color.Yellow);}
   int omitted=Math.Max(0,lines.Count-128);view=new View{Lines=lines.Take(128).ToArray(),Omitted=omitted,Hud=survey.Hud().Concat(new[]{"GREEN start RED finish CYAN listener (historical)","BLUE hit WHITE normal ORANGE possible obstruction (historical)","MAGENTA manual stop | YELLOW dashed links: UNKNOWN gaps", "Draw limit 128; omitted "+omitted+" | observations are snapshots, not current clearance"}).ToArray()};
  }
  static void Hud(object sender,GraphicsEventArgs e){if(!ready||!visible||Game.IsPaused)return;var cache=view;try{for(int i=0;i<cache.Hud.Length;i++)e.Graphics.DrawText(cache.Hud[i],"Arial",14,new PointF(20,22+i*21),Color.White);}catch(ThreadAbortException){throw;}catch{drawingFailed=true;}}
  [ConsoleCommand(Name="RichAudioSurveyStart")]public static void Start(){Capture(StopKind.Start);}
  [ConsoleCommand(Name="RichAudioSurveyMid1")]public static void Mid1(){Capture(StopKind.Mid1);}
  [ConsoleCommand(Name="RichAudioSurveyMid2")]public static void Mid2(){Capture(StopKind.Mid2);}
  [ConsoleCommand(Name="RichAudioSurveyMid3")]public static void Mid3(){Capture(StopKind.Mid3);}
  [ConsoleCommand(Name="RichAudioSurveyFinish")]public static void Finish(){Capture(StopKind.Finish);}
  [ConsoleCommand(Name="RichAudioSurveyRunout")]public static void Runout(){Capture(StopKind.Runout);}
  [ConsoleCommand(Name="RichAudioSurveyShow")]public static void Show(){if(ready&&!stopping)visible=true;}
  [ConsoleCommand(Name="RichAudioSurveyReplay")]public static void Replay(){Show();}
  [ConsoleCommand(Name="RichAudioSurveyHide")]public static void Hide(){visible=false;}
  [ConsoleCommand(Name="RichAudioSurveyStatus")]public static void Status(){foreach(var line in view.Hud)Game.Console.Print(line);}
  [ConsoleCommand(Name="RichAudioSurveyStop")]public static void Stop(){reason="manual stop/unload";stopping=true;visible=false;ready=false;}
  public static void OnUnload(){Stop();Game.FrameRender-=Hud;}
 }
}
