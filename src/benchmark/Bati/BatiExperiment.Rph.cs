// One explicitly approved, bounded research run. Loading this code alone cannot spawn.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.IO;using System.Linq;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Threading;
using Rage;using Rage.Native;using RichAudio.BatiResearch;using RichAudio.MarkerResearch;
namespace RichAudio.BatiRph
{
 [DataContract]public sealed class ExperimentFooter
 {
  [DataMember]public string Outcome,Reason;[DataMember]public bool WriterClosed,WriterFailed,DrawingDetached,AttemptConsumed;[DataMember]public int CopiedReadings;[DataMember]public RunRecord Run;
  [DataMember(EmitDefaultValue=false)]public StopBoundarySummary StopBoundary;
 }
 public static class AirportExperiment
 {
  private static volatile bool stop,armed,drawFailed;public static volatile bool Visible=true;private static int action;private static Controller controller;private static volatile string[] hud={"RICHAUDIO BATI | experiment not initialised"};private static string reason="observer deadline",runSession;
  private static readonly Stopwatch clock=Stopwatch.StartNew();
  public static void Request(int value){Interlocked.CompareExchange(ref action,value,0);}public static void Abort(){stop=true;}public static void Status(){foreach(var text in hud)Game.Console.Print(text);}
  private static T Read<T>(string file,int cap){PrivateFiles.RequireLocal(file);using(var f=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)){Check.That(f.Length>0&&f.Length<=cap,"private input cap");return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(f);}}
  private static void Guard(MarkerSet markers,bool atListener)
  {
   Check.That(!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"),"Story Mode only");Check.That(!Game.IsPaused,"paused gameplay");var p=Game.LocalPlayer.Character;Check.That(p!=null&&p.IsValid(),"player unavailable");if(atListener)Check.That(Check.Distance(Point(p.Position),markers.Listener)<=.25&&Length(p.Velocity)<=.25,"return to original listener before arming");
  }
  private static MarkerPoint Point(Vector3 v){return new MarkerPoint(v.X,v.Y,v.Z);}private static double Length(Vector3 v){return Math.Sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z);}
  private static ExperimentApproval Approval(ReadinessConfig c)
  {
   var a=Read<ExperimentApproval>(c.ApprovalFile,8192);a.Validate(c.ScopeNonce,c.BinaryFingerprint,c.CandidateFingerprint,DateTime.UtcNow);return a;
  }
  // Potential-interference detector only. No empty-city, hidden-mesh or future-clearance claim.
  private static string Scope(MarkerPoint start,MarkerPoint target,WorldOperations world,MarkerPoint support)
  {
   var timer=Stopwatch.StartNew();double dx=target.X-start.X,dy=target.Y-start.Y,len=Math.Sqrt(dx*dx+dy*dy);if(len<1e-5)return "UNKNOWN";double distance=Math.Min(100,len);dx=dx/len*distance;dy=dy/len*distance;
   for(int kind=0;kind<3;kind++){
    Entity[] pool=kind==0?(Entity[])World.GetAllVehicles():kind==1?(Entity[])World.GetAllPeds():(Entity[])World.GetAllObjects();if(pool.Length>2048)return "UNKNOWN";
    foreach(var e in pool){if(timer.Elapsed.TotalMilliseconds>25)return "UNKNOWN";if(e==null||!e.IsValid())return "UNKNOWN";if(world!=null&&world.OwnsExact(e))continue;var p=Point(e.Position);if(!p.Valid)return "UNKNOWN";double t=Math.Max(0,Math.Min(1,((p.X-start.X)*dx+(p.Y-start.Y)*dy)/(distance*distance)));double away=Math.Sqrt(Math.Pow(p.X-start.X-t*dx,2)+Math.Pow(p.Y-start.Y-t*dy,2));if(away>15||Math.Abs(p.Z-start.Z)>8)continue;
     Vector3 min,max;e.Model.GetDimensions(out min,out max);if(!Point(min).Valid||!Point(max).Valid)return "UNKNOWN";double radius=Math.Max(Math.Abs(min.X),Math.Abs(max.X))+Math.Max(Math.Abs(min.Y),Math.Abs(max.Y));if(radius<=0||radius>20)return "UNKNOWN";
     // Low fixtures are explicitly excluded from this dynamic/body-height screen, not certified harmless.
     if(kind==2&&p.Z+max.Z<=support.Z+.2)continue;
     if(away<=2+radius&&p.Z+max.Z>=start.Z-.5&&p.Z+min.Z<=start.Z+3)return "DETECTED";
    }
   }return "NONE_OBSERVED_IN_MONITORED_SCOPE";
  }
  public static void Run(ReadinessConfig config)
  {
   WorldOperations world=null;ExperimentWriter writer=null;StopBoundaryProbe diagnostics=null;bool attached=false,attempt=false;int readings=0;MarkerSet markers=null;
   try{
    Check.That(config.Revision==3&&config.ScopeNonce!=null&&System.Text.RegularExpressions.Regex.IsMatch(config.ScopeNonce,"^[A-Fa-f0-9]{32}$"),"sealed attempt scope");PrivateFiles.RequireLocal(config.OutputDirectory);Check.That(Directory.Exists(config.OutputDirectory)&&Directory.GetFileSystemEntries(config.OutputDirectory).Length==0,"fresh output required");string game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;Check.That(!config.OutputDirectory.StartsWith(game,StringComparison.OrdinalIgnoreCase),"private output outside game");
    string actualBinary=Check.Hash(File.ReadAllBytes(typeof(Entry).Assembly.Location));Check.That(actualBinary.Equals(config.BinaryFingerprint,StringComparison.OrdinalIgnoreCase),"reviewed binary fingerprint");markers=MarkerSet.Load(config.MarkerFile,config.Fingerprint,3,config.MarkerSession,"runtime-observation");var candidate=FiveStopRoute.Load(config.SurveyDirectory,markers,config.SurveyFingerprints);PrivateFiles.RequireLocal(config.CandidateFile);Check.That(Check.Hash(File.ReadAllBytes(config.CandidateFile)).Equals(config.CandidateFingerprint,StringComparison.OrdinalIgnoreCase),"candidate fingerprint");var saved=Read<AirportRouteCandidate>(config.CandidateFile,65536);saved.Validate(markers);Check.That(saved.Revision==candidate.Revision&&saved.Points.Zip(candidate.Points,(a,b)=>Check.Distance(a,b)==0).All(x=>x),"derived route changed");
    Check.That(saved.SurveySession==candidate.SurveySession&&saved.RecordFingerprints.SequenceEqual(candidate.RecordFingerprints)&&Check.Distance(saved.StartSupport,candidate.StartSupport)==0,"candidate support/provenance changed");
    runSession=Guid.NewGuid().ToString("N");PrivateFiles.WriteNew(Path.Combine(config.OutputDirectory,"session.json"),candidate);Game.FrameRender+=Draw;attached=true;
    var policy=new Policy{DrivingStyle=63|16777216};double nextSample=0,nextHud=0,nextScope=0,settleStarted=0;Reading previous=null;string interference="UNKNOWN";bool settled=false,gameplayReady=false;var gameplay=new GameplayReadiness();double? stationarySince=null;
    hud=new[]{"RICHAUDIO BATI | five measured stops; RUNOUT not required","No entities created | separately approved experiment only","Return to saved listener; Arm confirms visual scope, Start remains separate","No traffic suppression | unseen route/geometry remains UNKNOWN"};Game.Console.Print("Five-stop Bati READY FOR PREFLIGHT. No spawning. Status / Arm / Start / Abort. Fresh bound approval required; one attempt only.");
    while(!stop&&clock.Elapsed.TotalSeconds<600){
     Guard(markers,false);Check.That(!drawFailed,"drawing unavailable");int command=Interlocked.Exchange(ref action,0);double now=clock.Elapsed.TotalSeconds;
     if(command==1)Status();
     if(command==2&&!attempt){try{Guard(markers,true);Approval(config);Check.That(Scope(candidate.Points[0],candidate.Points[1],null,candidate.StartSupport)=="NONE_OBSERVED_IN_MONITORED_SCOPE","potential interference or incomplete local scope");armed=true;Game.Console.Print("ARMED for one scoped airport experiment. Historical coverage remains partial. Start is still a separate command.");}catch(Exception e){armed=false;Game.Console.Print("PREFLIGHT NOT READY (no attempt consumed): "+e.Message);}}
     if(command==3&&!attempt){
      // All non-consuming setup checks precede the one-shot intent and every mutation.
      try{Check.That(armed,"Arm first after supervised scope review");Guard(markers,true);var approval=Approval(config);Check.That(Scope(candidate.Points[0],candidate.Points[1],null,candidate.StartSupport)=="NONE_OBSERVED_IN_MONITORED_SCOPE","current scope unresolved");Vector3 min,max;new Model("bati").GetDimensions(out min,out max);Check.That(Point(min).Valid&&Point(max).Valid&&min.Z<0&&max.Z>min.Z&&max.Y>min.Y,"Bati model bounds unavailable");
       var spawn=new MarkerPoint(candidate.StartSupport.X,candidate.StartSupport.Y,candidate.StartSupport.Z-min.Z+.05);float heading=(float)((Math.Atan2(-(candidate.Points[1].X-candidate.Points[0].X),candidate.Points[1].Y-candidate.Points[0].Y)*180/Math.PI+360)%360);if(config.StopBoundaryDiagnostics)diagnostics=new StopBoundaryProbe(true,()=>clock.Elapsed.TotalSeconds,candidate.Points,candidate.StopNames);world=new WorldOperations(spawn,heading,policy.DrivingStyle,diagnostics);controller=new Controller(markers,policy,world,runSession);controller.Prepare(new RouteEvidence{Domain=markers.Domain,Session=runSession,MarkerFingerprint=markers.Fingerprint,Revision=candidate.Revision,Points=candidate.Points,Candidate=candidate,BoundedResearch=true,SpawnPlacementReviewed=true,CurrentScopeReviewed=true,BrakingReviewed=true,CleanupReviewed=true});
       using(var f=new FileStream(Path.Combine(config.OutputDirectory,"attempt.used"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){var b=System.Text.Encoding.ASCII.GetBytes(config.ScopeNonce);f.Write(b,0,b.Length);f.Flush(true);}attempt=true;LiveGate.Authorize(approval,config.ScopeNonce,actualBinary,config.CandidateFingerprint);writer=new ExperimentWriter(Path.Combine(config.OutputDirectory,"samples.jsonl"));controller.Arm(true);Check.That(controller.Start(now),"creation/tuning failed; inspect final receipt");settleStarted=now;nextSample=now;Game.Console.Print("One bike/rider creation requested and read back. Close F4 now. Waiting at most ten seconds for closed console and advancing game time, then stationary settling.");
      }catch(Exception e){Game.Console.Print("START refused/stopped: "+e.Message);if(attempt){reason=e.Message;stop=true;}}
     }
     if(command==4){Game.Console.Print("Cleanup is performed once by completion/abort. No retry or new creation.");}
     if(attempt&&controller!=null&&controller.State!=Stage.Cleaned&&controller.State!=Stage.CleanupPending&&now>=nextSample){
      nextSample=now+.05;Guard(markers,true);var r=world.CopyObservation(controller.BikeIdentity,controller.RiderIdentity,markers,now);
      if(now>=nextScope){int target=controller.CurrentCheckpointIndex;var end=candidate.Points[Math.Min(target,4)];if(controller.State==Stage.Stopping){var d=Check.Sub(candidate.Points[4],candidate.Points[3]);double n=Check.Length(d);end=new MarkerPoint(r.Position.X+d.X/n*100,r.Position.Y+d.Y/n*100,r.Position.Z+d.Z/n*100);}interference=Scope(r.Position,end,world,new MarkerPoint(r.Position.X,r.Position.Y,r.Position.Z));nextScope=now+.25;}r.Interference=interference;
      bool continuous=previous!=null&&r.At>previous.At&&r.At-previous.At<=policy.MaxGapSeconds&&Check.Distance(r.Position,previous.Position)<=(Math.Max(r.Speed,previous.Speed)+2)*(r.At-previous.At)+1;r.Simulation=continuous?"OBSERVED_CONTIGUOUS":"UNDETERMINED";
      Check.That(writer.Add(r)&&!writer.Failed,"evidence queue/writer failed");readings++;
      bool eligible=gameplay.Observe(r.ConsoleOpen,r.GamePaused,r.GameTimeMs);controller.Tick(now);
      if(!gameplayReady){Check.That(now-settleStarted<=10,"gameplay readiness timeout; no task issued");if(eligible){gameplayReady=true;settleStarted=now;}}
      if(gameplayReady&&!settled&&eligible){Check.That(now-settleStarted<=5,"spawn did not settle within five seconds");Check.That(r.Interference=="NONE_OBSERVED_IN_MONITORED_SCOPE","setup interference");if(r.Speed<=policy.StartSpeed&&continuous){if(!stationarySince.HasValue)stationarySince=now;if(now-stationarySince.Value>=.3)settled=true;}else stationarySince=null;}
      if(gameplayReady&&!settled)Check.That(now-settleStarted<=5,"stationary settling timeout");
      if(!eligible)stationarySince=null;
      if(settled&&controller.State!=Stage.Cleaned&&controller.State!=Stage.CleanupPending){Check.That(eligible,"gameplay stopped advancing after activation");controller.Observe(r);controller.Tick(now);}previous=r;
      if(controller.State==Stage.Cleaned||controller.State==Stage.CleanupPending){reason="controller terminal; inspect run and cleanup separately";stop=true;}
     }
     if(now>=nextHud){nextHud=now+.25;var p=Game.LocalPlayer.Character;double listenerDistance=p!=null&&p.IsValid()?Check.Distance(Point(p.Position),markers.Listener):double.NaN;hud=controller==null?new[]{"RICHAUDIO BATI | preflight "+(armed?"ARMED":"NOT ARMED"),"Listener distance: "+listenerDistance.ToString("F2")+" (must <=0.25)","Five observed stops | no RUNOUT requirement","Current scope: "+interference+" | distant coverage UNKNOWN","Status / Arm / Start / Abort | no automatic start"}:controller.Display().Concat(new[]{"Current monitored scope: "+interference,"Copied readings "+readings+" | RUNOUT not required","Natural stop must be measured; no velocity/physics manipulation"}).ToArray();}
     GameFiber.Yield();
    }
   }catch(ThreadAbortException){reason="host cancellation";throw;}catch(Exception e){reason=e.GetType().Name+": "+e.Message;Game.Console.Print("Bati experiment stopped: "+reason);}
   finally{
    stop=true;if(attached)Game.FrameRender-=Draw;try{if(controller!=null&&controller.State!=Stage.Cleaned&&controller.State!=Stage.CleanupPending)controller.Abort();}catch(Exception e){reason+="; cleanup "+e.GetType().Name;}finally{LiveGate.Close();if(writer!=null)writer.Dispose();}
    try{var run=controller==null?null:controller.Snapshot();PrivateFiles.WriteNew(Path.Combine(config.OutputDirectory,"final.json"),new ExperimentFooter{Outcome=run==null?"NOT RUN":run.Outcome,Reason=reason,Run=run,AttemptConsumed=attempt,CopiedReadings=readings,WriterClosed=writer!=null&&writer.Closed,WriterFailed=writer!=null&&writer.Failed,DrawingDetached=true,StopBoundary=diagnostics==null?null:diagnostics.Snapshot()});Game.Console.Print("Bati experiment CLOSED; display detached. Verify writer and native cleanup evidence before normal game exit.");}catch{Game.Console.Print("Final evidence write incomplete; preserve private stream and logs.");}
   }
  }
  private static void Draw(object sender,GraphicsEventArgs e){if(!Visible)return;var lines=hud;try{for(int i=0;i<lines.Length;i++)e.Graphics.DrawText(lines[i],"Arial",15,new PointF(24,30+i*23),Color.White);}catch(ThreadAbortException){throw;}catch{drawFailed=true;}}
 }
}
