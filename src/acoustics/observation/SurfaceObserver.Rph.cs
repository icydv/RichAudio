// Separate opt-in nine-query experiment. No renderer, audio, telemetry or entity mutation.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.GeometryResearch;
[assembly:Plugin("RichAudio Surface Observation",Author="RichAudio",Description="ACOUSTICS-03 bounded world-only observation",EntryPoint="RichAudio.SurfaceRph.Observer.Main",ExitPoint="RichAudio.SurfaceRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.SurfaceRph
{
    [DataContract] public sealed class Config
    {
        [DataMember] public int SchemaVersion;
        [DataMember] public bool StoryModeOnly;
        [DataMember] public string OutputFile;
    }
    public static class Observer
    {
        private static readonly Stopwatch clock=Stopwatch.StartNew();
        private static readonly AcquisitionLifecycle lifecycle=new AcquisitionLifecycle();
        private static Config config;
        private static volatile bool ready;
        private static string gameVersion,frameworkVersion;
        private static Point3 P(Vector3 v){return new Point3(v.X,v.Y,v.Z);}
        private static Vector3 V(Point3 p){return new Vector3((float)p.X,(float)p.Y,(float)p.Z);}
        private static void Parents(string p){for(var d=new DirectoryInfo(p);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked evidence path");}
        public static void Main()
        {
            try{
                string exe=Process.GetCurrentProcess().MainModule.FileName;gameVersion=FileVersionInfo.GetVersionInfo(exe).FileVersion;frameworkVersion=FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion;
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||gameVersion!="1.0.1158.16"||frameworkVersion!="1.132.1428.17748")throw new NotSupportedException("Exact-build host guard");
                string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Surface.Rph.json");
                if(new FileInfo(file).Length>4096)throw new IOException("Config bound");
                using(var stream=File.OpenRead(file))config=(Config)new DataContractJsonSerializer(typeof(Config)).ReadObject(stream);
                if(config.SchemaVersion!=1||!config.StoryModeOnly||!Path.IsPathRooted(config.OutputFile))throw new InvalidDataException("Explicit private config required");
                string output=Path.GetFullPath(config.OutputFile),game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(!output.Equals(config.OutputFile,StringComparison.OrdinalIgnoreCase)||output.StartsWith(game,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(output)!="surface-batch.json"||!Directory.Exists(Path.GetDirectoryName(output)))throw new IOException("Private output scope");
                Parents(Path.GetDirectoryName(output));foreach(string suffix in new[]{"",".attempt",".partial"})if(File.Exists(output+suffix))throw new IOException("Acquisition already exists");
                ready=true;Game.Console.Print("RichAudio surface READY: no queries yet. One RichAudioSurfaceObserve; fixed nine parallel world-only rays. Ten-minute readiness expiry.");
                // No scanner: this predicate reads lifecycle flags only. It ends immediately
                // after the result has been closed, instead of lingering after FINISHED.
                GameFiber.SleepUntil(delegate{return lifecycle.IsTerminal;},600000);
            }
            catch(ThreadAbortException){throw;} // Respect host cancellation; never ResetAbort.
            catch(Exception e){Game.Console.Print("RichAudio surface setup failed: "+e.GetType().Name);}
            finally{ready=false;lifecycle.RequestStop();Game.Console.Print("RichAudio surface lifecycle ended; no further queries.");}
        }
        [ConsoleCommand(Name="RichAudioSurfaceObserve",Description="One fixed nine-ray wall acquisition; no retry after claim")]
        public static void Observe()
        {
            if(!ready||lifecycle.StopRequested||!lifecycle.Begin()){Game.Console.Print("RichAudio surface: not ready or consumed; no queries.");return;}
            ready=false;
            try{GameFiber.StartNew(delegate{Capture();},"RichAudio bounded surface acquisition");}
            catch(ThreadAbortException){lifecycle.Complete();throw;}
            catch(Exception e){lifecycle.Complete();Game.Console.Print("RichAudio surface scheduling failed: "+e.GetType().Name);}
        }
        private static Ped Guard(uint? expected,Point3? initial)
        {
            if(lifecycle.StopRequested||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode or lifecycle guard");
            Ped ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid()||expected.HasValue&&ped.Handle.Value!=expected.Value)throw new InvalidOperationException("Player identity changed");
            Vehicle car=ped.CurrentVehicle;if(car!=null&&car.IsValid())throw new InvalidOperationException("On-foot setup required");
            Point3 velocity=P(ped.Velocity),position=P(ped.Position);
            if(!position.Finite||!velocity.Finite||velocity.Length>.25||initial.HasValue&&Point3.Sub(position,initial.Value).Length>.05)throw new InvalidOperationException("Stationary pose guard");return ped;
        }
        private static void Capture()
        {
            var batch=new SurfaceBatch{SessionId=Guid.NewGuid().ToString("N"),StartedAtMs=clock.Elapsed.TotalMilliseconds};
            var acquisition=Stopwatch.StartNew();
            try{
                DurableAttempt.Reserve(config.OutputFile+".attempt",batch.SessionId);
                Ped ped=Guard(null,null);uint player=ped.Handle.Value;batch.PlayerPosition=P(ped.Position);batch.Forward=P(ped.ForwardVector);
                PlannedRay[] rays=SurfacePlan.Create(batch.PlayerPosition,batch.Forward);
                foreach(PlannedRay ray in rays){
                    if(acquisition.ElapsedMilliseconds>=SurfacePlan.AcquisitionTimeoutMs)throw new TimeoutException("Bounded acquisition timeout");
                    ped=Guard(player,batch.PlayerPosition);
                    var o=new GeometryObservation{SessionId=batch.SessionId,GameVersion=gameVersion,FrameworkVersion=frameworkVersion,StartedUtc=DateTime.UtcNow.ToString("o"),ObservedAtMs=clock.Elapsed.TotalMilliseconds,Origin=P(V(ray.Origin)),End=P(V(ray.End)),IgnoredPlayerHandle=player,PlayerSpeed=P(ped.Velocity).Length,SetupStatus="on_foot_stationary_by_SDK_getters",QueryProvenance="ACOUSTICS-03 fixed parallel-wall-grid-3x3-v1; one world-only ray at declared order; unknown extent/material"};
                    batch.Samples.Add(new SurfaceSample{Id="ray-"+ray.Order,Ray=ray,Observation=o});
                    if(!lifecycle.NextCall())throw new InvalidOperationException("Query budget or cancellation");
                    o.TraceCalls=1;batch.TraceCalls++;
                    var watch=Stopwatch.StartNew();HitResult hit;
                    try{hit=World.TraceLine(V(ray.Origin),V(ray.End),TraceFlags.IntersectWorld,new Entity[]{ped});}
                    finally{o.TraceDurationMs=watch.Elapsed.TotalMilliseconds;}
                    watch.Restart();o.Completion=hit.Hit?"hit":"miss";
                    if(hit.Hit){
                        try{Point3 p=P(hit.HitPosition);o.HitPosition=p.Finite?(Point3?)p:null;o.PositionStatus=p.Finite?"observed":"invalid_nonfinite";}catch{o.PositionStatus="getter_failed";}
                        try{Point3 n=P(hit.HitNormal);o.HitNormal=n.Finite?(Point3?)n:null;o.NormalStatus=n.Finite?"observed":"invalid_nonfinite";}catch{o.NormalStatus="getter_failed";}
                        try{Entity e=hit.HitEntity;if(e==null)o.EntityStatus="none_returned_static_unproven";else if(e.IsValid()){o.HitEntityHandle=e.Handle.Value;o.EntityStatus="returned_identity_unclassified";}else o.EntityStatus="returned_invalid_identity";}catch{o.EntityStatus="unavailable";}
                    }else{o.PositionStatus="not_returned_miss";o.NormalStatus="not_returned_miss";o.EntityStatus="not_returned_miss";}
                    o.ConversionDurationMs=watch.Elapsed.TotalMilliseconds;watch.Restart();o.Validation=ObservationRules.Validate(o);o.ValidationDurationMs=watch.Elapsed.TotalMilliseconds;
                    batch.ValidationDurationMs+=o.ValidationDurationMs.Value;
                    // Misses/contradictions are evidence, not a reason to add rays. Invalid
                    // numerical/API output stops the batch; a valid miss preserves the plan.
                    if(!o.Validation.RecordValid||o.Completion=="hit"&&!o.Validation.SurfaceValid)throw new InvalidDataException("Invalid observation; no retries");
                    if(ray.Order<SurfacePlan.Count-1)GameFiber.Yield();
                }
                batch.Completion="complete";
            }
            catch(ThreadAbortException){batch.Completion="interrupted";batch.ErrorClass="System.Threading.ThreadAbortException";throw;}
            catch(Exception e){batch.Completion="stopped";batch.ErrorClass=e.GetType().FullName;}
            finally{
                batch.FinishedAtMs=clock.Elapsed.TotalMilliseconds;batch.ManagedMemoryBytes=GC.GetTotalMemory(false);
                try{BatchPersistence.SaveNew(config.OutputFile,batch);Game.Console.Print("RichAudio surface FINISHED: "+batch.Completion+"; calls="+batch.TraceCalls+"; no more queries.");}
                catch(ThreadAbortException){throw;}
                catch(Exception e){Game.Console.Print("RichAudio surface evidence incomplete: "+e.GetType().Name+"; attempt remains consumed.");}
                finally{lifecycle.Complete();}
            }
        }
        public static void OnUnload(){ready=false;lifecycle.RequestStop();}
    }
}
