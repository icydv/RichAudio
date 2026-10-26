// Optional research adapter: no references to source synthesis, telemetry or audio.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.GeometryResearch;
[assembly:Plugin("RichAudio Geometry Observation",Author="RichAudio",Description="ACOUSTICS-02 one read-only world trace",EntryPoint="RichAudio.GeometryRph.Observer.Main",ExitPoint="RichAudio.GeometryRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.GeometryRph
{
    [DataContract] public sealed class ObserverConfig
    {
        [DataMember] public int SchemaVersion;
        [DataMember] public bool StoryModeOnly;
        [DataMember] public string OutputFile;
    }
    public static class Observer
    {
        private static readonly OneObservationGate gate=new OneObservationGate();
        private static readonly Stopwatch clock=Stopwatch.StartNew();
        private static ObserverConfig config;
        private static string gameVersion,frameworkVersion;
        private static volatile bool ready,shutdown;
        private static void Parents(string p){for(var d=new DirectoryInfo(p);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked evidence path");}
        public static void Main()
        {
            try {
                string exe=Process.GetCurrentProcess().MainModule.FileName;gameVersion=FileVersionInfo.GetVersionInfo(exe).FileVersion;frameworkVersion=FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion;
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||gameVersion!="1.0.1158.16"||frameworkVersion!="1.132.1428.17748")throw new NotSupportedException("Exact-build host guard");
                string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Geometry.Rph.json");
                if(new FileInfo(file).Length>4096)throw new IOException("Config bound");using(var stream=File.OpenRead(file))config=(ObserverConfig)new DataContractJsonSerializer(typeof(ObserverConfig)).ReadObject(stream);
                if(config.SchemaVersion!=1||!config.StoryModeOnly||string.IsNullOrEmpty(config.OutputFile)||!Path.IsPathRooted(config.OutputFile))throw new InvalidDataException("Explicit private config required");
                string output=Path.GetFullPath(config.OutputFile),game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(!output.Equals(config.OutputFile,StringComparison.OrdinalIgnoreCase)||output.StartsWith(game,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(output)!="geometry-observation.json"||!Directory.Exists(Path.GetDirectoryName(output)))throw new IOException("Private output scope");
                Parents(Path.GetDirectoryName(output));if(File.Exists(output)||File.Exists(output+".attempt"))throw new IOException("Attempt already exists");
                ready=true;Game.Console.Print("RichAudio geometry READY: no trace yet. One RichAudioGeometryObserve command; world only, 8 units. Automatic expiry after 10 minutes.");
                GameFiber.Sleep(600000); // One lifetime wait, not a scanner/poll loop.
            }catch(Exception e){Game.Console.Print("RichAudio geometry NOT READY: "+e.GetType().Name);}finally{ready=false;gate.Finish();}
        }
        [ConsoleCommand(Name="RichAudioGeometryObserve",Description="One approved world-only trace; consumes this experiment even on failure")]
        public static void Observe()
        {
            if(!ready||shutdown||!gate.TryClaim()){Game.Console.Print("RichAudio geometry: not ready or attempt already consumed; no trace.");return;}
            try{GameFiber.StartNew(delegate {Capture();},"RichAudio one geometry observation");}catch(Exception e){ready=false;gate.Finish();Game.Console.Print("RichAudio geometry scheduling failed: "+e.GetType().Name+"; no retry.");}
        }
        private static Point3 P(Vector3 v){return new Point3(v.X,v.Y,v.Z);}
        private static void Capture()
        {
            var result=new GeometryObservation{SessionId=Guid.NewGuid().ToString("N"),GameVersion=gameVersion,FrameworkVersion=frameworkVersion,StartedUtc=DateTime.UtcNow.ToString("o"),ObservedAtMs=clock.Elapsed.TotalMilliseconds};
            try {
                // Durable claim before any trace. Reload cannot issue a second one.
                DurableAttempt.Reserve(config.OutputFile+".attempt",result.SessionId);
                if(shutdown||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode guard unavailable or not satisfied");
                Ped ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid())throw new InvalidOperationException("No valid player");
                Vehicle vehicle=ped.CurrentVehicle;if(vehicle!=null&&vehicle.IsValid())throw new InvalidOperationException("Setup requires on-foot player");
                Point3 velocity=P(ped.Velocity);if(!velocity.Finite||velocity.Length>.25)throw new InvalidOperationException("Setup requires stationary player");result.PlayerSpeed=velocity.Length;result.SetupStatus="on_foot_stationary_by_SDK_getters";
                Vector3 position=ped.Position,forward=ped.ForwardVector;double horizontal=Math.Sqrt((double)forward.X*forward.X+(double)forward.Y*forward.Y);
                if(horizontal<.5||!P(position).Finite||!P(forward).Finite)throw new InvalidDataException("Unusable player pose");
                Vector3 start=new Vector3(position.X,position.Y,position.Z+1.0f),end=new Vector3(start.X+(float)(8*forward.X/horizontal),start.Y+(float)(8*forward.Y/horizontal),start.Z);
                result.Origin=P(start);result.End=P(end);result.IgnoredPlayerHandle=ped.Handle.Value;result.ObservedAtMs=clock.Elapsed.TotalMilliseconds;
                if(shutdown)throw new InvalidOperationException("Unloading");
                var watch=Stopwatch.StartNew();result.TraceCalls=1;
                HitResult hit;try{hit=World.TraceLine(start,end,TraceFlags.IntersectWorld,new Entity[]{ped});}finally{result.TraceDurationMs=watch.Elapsed.TotalMilliseconds;}watch.Restart();
                result.Completion=hit.Hit?"hit":"miss";
                if(hit.Hit){
                    try{Point3 value=P(hit.HitPosition);if(value.Finite){result.HitPosition=value;result.PositionStatus="observed";}else result.PositionStatus="invalid_nonfinite";}catch{result.PositionStatus="getter_failed";}
                    try{Point3 value=P(hit.HitNormal);if(value.Finite){result.HitNormal=value;result.NormalStatus="observed";}else result.NormalStatus="invalid_nonfinite";}catch{result.NormalStatus="getter_failed";}
                    try{Entity entity=hit.HitEntity;if(entity==null)result.EntityStatus="none_returned_static_unproven";else if(entity.IsValid()){result.HitEntityHandle=entity.Handle.Value;result.EntityStatus="returned_identity_unclassified";}else result.EntityStatus="returned_invalid_identity";}catch{result.EntityStatus="unavailable";}
                }else{result.PositionStatus="not_returned_miss";result.NormalStatus="not_returned_miss";result.EntityStatus="not_returned_miss";}
                result.ConversionDurationMs=watch.Elapsed.TotalMilliseconds;
            }catch(Exception e){result.Completion="error";result.ErrorClass=e.GetType().FullName;}
            finally {
                var watch=Stopwatch.StartNew();result.Validation=ObservationRules.Validate(result);if(result.Validation.SurfaceValid)result.RetainedPoint=ObservationRules.Retain(result);result.ValidationDurationMs=watch.Elapsed.TotalMilliseconds;result.ManagedMemoryBytes=GC.GetTotalMemory(false);
                try{using(var stream=new FileStream(config.OutputFile,FileMode.CreateNew,FileAccess.Write,FileShare.Read))new DataContractJsonSerializer(typeof(GeometryObservation)).WriteObject(stream,result);Game.Console.Print("RichAudio geometry FINISHED: "+result.Completion+"; geometry valid="+result.Validation.SurfaceValid+"; no more traces.");}catch(Exception e){Game.Console.Print("RichAudio geometry evidence write failed: "+e.GetType().Name+"; attempt stays consumed.");}
                ready=false;gate.Finish();
            }
        }
        public static void OnUnload(){shutdown=true;ready=false;gate.Finish();}
    }
}
