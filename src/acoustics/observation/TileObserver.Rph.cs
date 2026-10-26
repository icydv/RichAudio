// ACOUSTICS-04 only. Acquisition is one-shot; presentation cannot call Capture.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.GeometryResearch;
[assembly:Plugin("RichAudio Diagnostic Tile",Author="RichAudio",Description="ACOUSTICS-04 bounded wall/ground research and optional recorded-data display",EntryPoint="RichAudio.TileRph.Observer.Main",ExitPoint="RichAudio.TileRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.TileRph
{
    [DataContract] public sealed class Config
    {
        [DataMember] public int SchemaVersion;
        [DataMember] public bool StoryModeOnly;
        [DataMember] public string OutputDirectory;
    }
    [DataContract] public sealed class Metrics
    {
        [DataMember] public long WorldDrawTicks,HudFrames,WorldPrimitives,ManagedMemoryBytes;
        [DataMember] public double WorldSubmissionTotalMs,WorldSubmissionMaxMs,HudSubmissionTotalMs,HudSubmissionMaxMs;
        [DataMember] public int ActualCalls;
        [DataMember] public bool Stopped,DrawingUnavailable;
        [DataMember] public string EndReason;
    }
    public static class Observer
    {
        private static readonly Stopwatch clock=Stopwatch.StartNew();
        private static readonly TileBudget budget=new TileBudget();
        private static readonly PresentationControl presentation=new PresentationControl();
        private static readonly List<TileGroup> groups=new List<TileGroup>();
        private static readonly Metrics metrics=new Metrics();
        private static volatile VisualSnapshot snapshot=new VisualSnapshot(new VisualLine[0],new string[0],0,0,0,"READY / no queries");
        private static volatile bool ready,stopping,capturing,hudFailed;
        private static DiagnosticTile tile;private static Config config;private static int? interior;
        private static string session,gameVersion,frameworkVersion,endReason="readiness timeout";
        private static readonly object performanceSync=new object();
        private static Point3 P(Vector3 v){return new Point3(v.X,v.Y,v.Z);}
        private static Vector3 V(Point3 p){return new Vector3((float)p.X,(float)p.Y,(float)p.Z);}
        private static void Parents(string path){for(var p=new DirectoryInfo(path);p!=null;p=p.Parent)if(p.Exists&&(p.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked evidence path");}
        private static void Save<T>(string name,T value){Parents(config.OutputDirectory);DiagnosticPersistence.SaveNew(Path.Combine(config.OutputDirectory,name),value);}
        public static void Main()
        {
            bool subscribed=false;
            try{
                string exe=Process.GetCurrentProcess().MainModule.FileName;gameVersion=FileVersionInfo.GetVersionInfo(exe).FileVersion;frameworkVersion=FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion;
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||gameVersion!="1.0.1158.16"||frameworkVersion!="1.132.1428.17748")throw new NotSupportedException("Exact-build guard");
                string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Tile.Rph.json");if(new FileInfo(file).Length>4096)throw new IOException("Config bound");
                using(var s=File.OpenRead(file))config=(Config)new DataContractJsonSerializer(typeof(Config)).ReadObject(s);
                if(config.SchemaVersion!=1||!config.StoryModeOnly||!Path.IsPathRooted(config.OutputDirectory))throw new InvalidDataException("Private config required");
                string output=Path.GetFullPath(config.OutputDirectory),game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(!output.Equals(config.OutputDirectory,StringComparison.OrdinalIgnoreCase)||output.StartsWith(game,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(output)!="tile-evidence"||!Directory.Exists(output)||Directory.GetFileSystemEntries(output).Length!=0||output.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)<0)throw new IOException("Fresh private output scope");
                Parents(output);session=Guid.NewGuid().ToString("N");DurableAttempt.Reserve(Path.Combine(output,"session.attempt"),session);
                Game.FrameRender+=DrawHud;subscribed=true;ready=true;double nextContextCheck=0;
                Game.Console.Print("RichAudio TILE READY. No queries. RichAudioTileShow / Wall / Ground / Hide / Clear / Status / Stop. 18 calls maximum; two independent one-shot groups. Display OFF.");
                // This loop presents immutable lines only. Context getters below never query collisions.
                while(capturing||!stopping&&clock.ElapsedMilliseconds<900000){
                    double now=clock.Elapsed.TotalMilliseconds;
                    if(now>=nextContextCheck&&!capturing){nextContextCheck=now+250;
                        if(NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode guard");
                        if(tile!=null&&!tile.Invalid){Ped p=Game.LocalPlayer.Character;if(p==null||!p.IsValid()||!tile.ContextMatches(NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",p),P(p.Position))){tile.Invalidate("context changed; no rescan");Refresh("INVALIDATED / recorded observations only");}}
                    }
                    if(hudFailed){presentation.DrawingFailed();hudFailed=false;Game.Console.Print("RichAudio tile drawing unavailable; capture budget unchanged. Private offline replay remains available.");}
                    if(presentation.Visible(now,Game.IsPaused)){
                        var view=snapshot;var watch=Stopwatch.StartNew();
                        try{for(int i=0;i<view.Count;i++){var l=view.At(i);Color c=Colour(l.Kind);NativeFunction.CallByName<uint>("DRAW_LINE",(float)l.A.X,(float)l.A.Y,(float)l.A.Z,(float)l.B.X,(float)l.B.Y,(float)l.B.Z,(int)c.R,(int)c.G,(int)c.B,220);}
                            metrics.WorldDrawTicks++;metrics.WorldPrimitives+=view.Count;metrics.WorldSubmissionTotalMs+=watch.Elapsed.TotalMilliseconds;metrics.WorldSubmissionMaxMs=Math.Max(metrics.WorldSubmissionMaxMs,watch.Elapsed.TotalMilliseconds);
                        }catch(ThreadAbortException){throw;}catch{presentation.DrawingFailed();Game.Console.Print("RichAudio world drawing failed; no fallback native or new query.");}
                    }
                    GameFiber.Yield();
                }
                if(stopping)endReason="manual stop or unload";
            }
            catch(ThreadAbortException){endReason="host cancellation";throw;}
            catch(Exception e){endReason=e.GetType().Name;Game.Console.Print("RichAudio tile stopped: "+endReason);}
            finally{
                ready=false;stopping=true;budget.Stop();presentation.Stop();if(subscribed)Game.FrameRender-=DrawHud;
                metrics.ActualCalls=budget.Calls;metrics.Stopped=true;metrics.DrawingUnavailable=presentation.Unsupported;metrics.EndReason=endReason;metrics.ManagedMemoryBytes=GC.GetTotalMemory(false);
                if(config!=null&&session!=null)try{lock(performanceSync){Save("metrics.json",metrics);}Save("final-snapshot.json",snapshot);Game.Console.Print("RichAudio TILE CLOSED: writers flushed; calls="+budget.Calls+"; drawing detached.");}catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio tile final evidence incomplete: "+e.GetType().Name);}
            }
        }
        private static Color Colour(string kind){switch(kind){case "ray":return Color.DodgerBlue;case "hit":return Color.Lime;case "inferred-outline":return Color.Yellow;default:return Color.White;}}
        private static void DrawHud(object sender,GraphicsEventArgs args)
        {
            if(!ready||!presentation.Visible(clock.Elapsed.TotalMilliseconds,Game.IsPaused))return;
            var watch=Stopwatch.StartNew();var s=snapshot;
            try{
                var lines=new[]{"RICHAUDIO ACOUSTIC DEBUG | "+s.Status,"RECORDED observations "+s.ObservationCount+"/18 | valid hits "+s.ValidHitCount+" | inferred patches "+s.SurfaceCount,
                    "BLUE ray | GREEN cross hit | YELLOW outline INFERRED", "WHITE solid measured normal | dashed fitted normal", "GREY: support gaps / edges / materials / permanence UNKNOWN", "Current <=1s candidates: "+s.CurrentCount(clock.Elapsed.TotalMilliseconds)+" | older outlines are HISTORICAL. No audio.","Show: 60s | Hide / Clear: display only | Stop: end experiment"};
                for(int i=0;i<lines.Length;i++)args.Graphics.DrawText(lines[i],"Arial",16,new PointF(24,32+i*23),i==4?Color.LightGray:Color.White);
                for(int i=0;i<Math.Min(2,s.RejectionCount);i++)args.Graphics.DrawText("REJECTED: "+s.RejectionAt(i),"Arial",15,new PointF(24,200+i*22),Color.Red);
                lock(performanceSync){metrics.HudFrames++;metrics.HudSubmissionTotalMs+=watch.Elapsed.TotalMilliseconds;metrics.HudSubmissionMaxMs=Math.Max(metrics.HudSubmissionMaxMs,watch.Elapsed.TotalMilliseconds);}
            }catch(ThreadAbortException){throw;}catch{hudFailed=true;}
        }
        private static void Refresh(string status){snapshot=VisualSnapshot.Build(groups,tile,status);}
        [ConsoleCommand(Name="RichAudioTileShow",Description="Show recorded evidence for 60 seconds; zero collision queries")]
        public static void Show(){if(ready)presentation.Show(clock.Elapsed.TotalMilliseconds);}
        [ConsoleCommand(Name="RichAudioTileHide",Description="Hide only; never resets queries")]
        public static void Hide(){presentation.Hide();}
        [ConsoleCommand(Name="RichAudioTileClear",Description="Clear display only; Show replays saved data without scanning")]
        public static void Clear(){presentation.Clear();}
        [ConsoleCommand(Name="RichAudioTileStatus",Description="Print counters only; never scans")]
        public static void Status(){Game.Console.Print("RichAudio tile calls="+budget.Calls+"/18; records="+snapshot.ObservationCount+"; inferred="+snapshot.SurfaceCount+"; drawing unavailable="+presentation.Unsupported);}
        [ConsoleCommand(Name="RichAudioTileStop",Description="End observer and drawing; no restart")]
        public static void Stop(){stopping=true;ready=false;budget.Stop();presentation.Stop();}
        [ConsoleCommand(Name="RichAudioTileWall",Description="Consume the single fixed nine-ray wall group")]
        public static void Wall(){StartGroup("wall");}
        [ConsoleCommand(Name="RichAudioTileGround",Description="Consume the single fixed nine-ray ground group")]
        public static void Ground(){StartGroup("ground");}
        private static void StartGroup(string name)
        {
            if(!ready||stopping||capturing||tile!=null&&tile.Invalid||!budget.Claim(name)){Game.Console.Print("RichAudio group refused; no queries.");return;}
            capturing=true;
            try{GameFiber.StartNew(delegate{Capture(name);},"RichAudio one bounded group");}
            catch(ThreadAbortException){budget.Finish();capturing=false;throw;}catch{budget.Finish();capturing=false;stopping=true;}
        }
        private static Ped Guard(uint? expected,Point3? initial)
        {
            if(stopping||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode/lifecycle guard");
            Ped ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid()||expected.HasValue&&ped.Handle.Value!=expected.Value)throw new InvalidOperationException("Player identity");
            Vehicle car=ped.CurrentVehicle;if(car!=null&&car.IsValid())throw new InvalidOperationException("On foot required");
            if(!P(ped.Position).Finite||!P(ped.Velocity).Finite||P(ped.Velocity).Length>.25||initial.HasValue&&Point3.Sub(P(ped.Position),initial.Value).Length>.05)throw new InvalidOperationException("Stationary pose");
            int value=NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",ped);if(value<0||interior.HasValue&&value!=interior.Value)throw new InvalidOperationException("Interior context changed");if(!interior.HasValue)interior=value;return ped;
        }
        private static void Capture(string name)
        {
            var g=new TileGroup{Name=name,Kind=name,Session=session,StartedMs=clock.Elapsed.TotalMilliseconds};groups.Add(g);var acquisition=Stopwatch.StartNew();
            try{
                Parents(config.OutputDirectory);DurableAttempt.Reserve(Path.Combine(config.OutputDirectory,name+".attempt"),session);
                Ped ped=Guard(null,null);uint player=ped.Handle.Value;g.Player=P(ped.Position);g.Forward=P(ped.ForwardVector);g.Interior=interior.Value;
                if(tile==null)tile=new DiagnosticTile(session,g.Interior,g.Player);if(!tile.ContextMatches(g.Interior,g.Player))throw new InvalidOperationException("Outside bounded tile");
                foreach(var ray in TilePlan.Create(name,g.Player,g.Forward)){
                    if(acquisition.ElapsedMilliseconds>=1000)throw new TimeoutException("One-second group cap");ped=Guard(player,g.Player);
                    var o=new GeometryObservation{SessionId=session,GameVersion=gameVersion,FrameworkVersion=frameworkVersion,StartedUtc=DateTime.UtcNow.ToString("o"),ObservedAtMs=clock.Elapsed.TotalMilliseconds,Origin=P(V(ray.Origin)),End=P(V(ray.End)),IgnoredPlayerHandle=player,PlayerSpeed=P(ped.Velocity).Length,SetupStatus="on_foot_stationary_by_SDK_getters",QueryProvenance="ACOUSTICS-04 "+name+" fixed 3x3-v1; world-only; no material/extent certification"};
                    g.Samples.Add(new SurfaceSample{Id=name+"-ray-"+ray.Order,Ray=ray,Observation=o});if(!budget.Next())throw new InvalidOperationException("Consumed budget");o.TraceCalls=1;g.TraceCalls++;
                    HitResult hit;var watch=Stopwatch.StartNew();try{hit=World.TraceLine(V(ray.Origin),V(ray.End),TraceFlags.IntersectWorld,new Entity[]{ped});}finally{o.TraceDurationMs=watch.Elapsed.TotalMilliseconds;}
                    watch.Restart();o.Completion=hit.Hit?"hit":"miss";
                    if(hit.Hit){try{Point3 p=P(hit.HitPosition);o.HitPosition=p.Finite?(Point3?)p:null;o.PositionStatus=p.Finite?"observed":"invalid_nonfinite";}catch{o.PositionStatus="getter_failed";}
                        try{Point3 n=P(hit.HitNormal);o.HitNormal=n.Finite?(Point3?)n:null;o.NormalStatus=n.Finite?"observed":"invalid_nonfinite";}catch{o.NormalStatus="getter_failed";}
                        try{Entity e=hit.HitEntity;if(e==null)o.EntityStatus="none_returned_static_unproven";else if(e.IsValid()){o.HitEntityHandle=e.Handle.Value;o.EntityStatus="returned_identity_unclassified";}else o.EntityStatus="returned_invalid_identity";}catch{o.EntityStatus="unavailable";}}
                    else{o.PositionStatus="not_returned_miss";o.NormalStatus="not_returned_miss";o.EntityStatus="not_returned_miss";}
                    o.ConversionDurationMs=watch.Elapsed.TotalMilliseconds;watch.Restart();o.Validation=ObservationRules.Validate(o);o.ValidationDurationMs=watch.Elapsed.TotalMilliseconds;
                    Refresh("ACQUIRING "+name+" / actual calls only");
                    if(!o.Validation.RecordValid||o.Completion=="hit"&&!o.Validation.SurfaceValid)throw new InvalidDataException("Invalid observation; stop, no retry");if(ray.Order<8)GameFiber.Yield();
                }
                g.Completion="complete";
            }
            catch(ThreadAbortException){g.Completion="interrupted";g.Error="host_cancellation";throw;}
            catch(Exception e){g.Completion="stopped";g.Error=e.GetType().Name;}
            finally{
                g.FinishedMs=clock.Elapsed.TotalMilliseconds;var watch=Stopwatch.StartNew();
                if(g.Completion=="complete")try{var p=PatchReconstruction.Fit(g);g.ReconstructionMs=watch.Elapsed.TotalMilliseconds;watch.Restart();tile.Insert(g);g.TileUpdateMs=watch.Elapsed.TotalMilliseconds;GC.KeepAlive(p);}catch(Exception e){g.Error=e.Message;Game.Console.Print("RichAudio candidate rejected; observations retained. "+e.Message);}
                try{watch.Restart();Refresh("RESULTS / recorded INFERRED support");g.SnapshotMs=watch.Elapsed.TotalMilliseconds;Save(name+"-group.json",g);Save(name+"-snapshot.json",snapshot);Game.Console.Print("RichAudio "+name+" FINISHED: calls="+g.TraceCalls+"; tile candidates="+snapshot.SurfaceCount+". No retry.");}
                catch(ThreadAbortException){throw;}catch(Exception e){stopping=true;Game.Console.Print("RichAudio evidence incomplete: "+e.GetType().Name);}
                finally{budget.Finish();capturing=false;}
            }
        }
        public static void OnUnload(){Stop();Game.FrameRender-=DrawHud;}
    }
}
