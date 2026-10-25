using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.Telemetry;

[assembly: Plugin("RichAudio Telemetry",Author="RichAudio",Description="P2-01 read-only telemetry; no LSPDFR dependency",EntryPoint="RichAudio.Rph.EntryPoint.Main",ExitPoint="RichAudio.Rph.EntryPoint.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
namespace RichAudio.Rph
{
    internal sealed class RphSource : ITelemetrySource
    {
        private readonly CaptureConfig config;
        private List<Vehicle> selected=new List<Vehicle>();
        private double nextCensus,lastCensus=-1;
        private int available=-1,examined,censusInvalid,omitted;
        private bool truncated;
        public RphSource(CaptureConfig c) {config=c;}
        private static Field<T> Read<T>(Func<T> getter,string units,string name) where T:struct {try{return Field<T>.Observed(getter(),units,"RPH "+name+"; live validation pending");}catch(Exception ex){return Field<T>.Missing(units,"getter_failed:"+ex.GetType().Name);}}
        private static Vec3 V(Vector3 v) {return new Vec3(v.X,v.Y,v.Z);}
        private static Quat Q(Quaternion q) {return new Quat(q.X,q.Y,q.Z,q.W);}
        private static Vec3 R(Rotator r) {return new Vec3(r.Pitch,r.Roll,r.Yaw);}
        private static string Token(Vehicle v) {return v.Handle.Value.ToString("X8");}
        private static bool Valid(Vehicle v) {try{return v!=null&&v.IsValid();}catch{return false;}}
        public ObservationFrame Read(double now) {
            var watch=Stopwatch.StartNew();var frame=new ObservationFrame{Time=now};
            frame.Listener.Position=Read(()=>V(NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_COORD")),"m","GET_FINAL_RENDERED_CAM_COORD");
            frame.Listener.Rotation=Read(()=>V(NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_ROT",2)),"degrees; ZXY order 2","GET_FINAL_RENDERED_CAM_ROT");
            if(frame.Listener.Rotation.Value.HasValue)frame.Listener.Orientation=Field<Quat>.Estimated(Quat.FromZxyDegrees(frame.Listener.Rotation.Value.Value),"unit quaternion; GTA Z-up","Euler ZXY conversion; basis validation pending");
            Vehicle player=null;bool playerKnown=false;try {var ped=Game.LocalPlayer.Character;if(ped!=null&&ped.IsValid()){player=ped.CurrentVehicle;playerKnown=true;}}catch{}
            string playerToken=null;try{if(Valid(player))playerToken=Token(player);}catch{playerKnown=false;}
            if(now>=nextCensus) {
                var dw=Stopwatch.StartNew();nextCensus=now+0.5;lastCensus=now;examined=0;censusInvalid=0;omitted=0;truncated=false;
                Vehicle[] vehicles=World.GetAllVehicles();available=vehicles.Length;
                var unique=new HashSet<string>();var candidates=new List<Vehicle>();
                if(playerToken!=null){unique.Add(playerToken);candidates.Add(player);}
                // Framework enumeration cannot be preempted; budgets bound only our subsequent reads.
                var censusTokens=new HashSet<string>();
                foreach(var vehicle in vehicles) {
                    if(examined>=config.CensusLimit||watch.Elapsed.TotalMilliseconds>=config.AcquisitionBudgetMs){truncated=true;break;}
                    examined++;if(!Valid(vehicle)){censusInvalid++;continue;}
                    string token;try{token=Token(vehicle);}catch{censusInvalid++;truncated=true;continue;}censusTokens.Add(token);
                    if(unique.Add(token)){if(candidates.Count<config.SourceLimit)candidates.Add(vehicle);else omitted++;}
                }
                if(playerToken!=null)censusTokens.Add(playerToken);
                selected=candidates;
                if(!truncated)frame.CompleteCensusTokens=censusTokens;
                dw.Stop();frame.DiscoveryMs=dw.Elapsed.TotalMilliseconds;
            }
            // Player priority is independent of the 2 Hz discovery cadence.
            var readList=new List<Vehicle>();var readTokens=new HashSet<string>();
            if(playerToken!=null){readList.Add(player);readTokens.Add(playerToken);}
            foreach(var v in selected){try{if(readTokens.Add(Token(v)))readList.Add(v);}catch{}}
            foreach(var v in readList) {
                if(frame.Vehicles.Count>=config.SourceLimit){frame.SourceLimitOmitted++;continue;}
                if(watch.Elapsed.TotalMilliseconds>=config.AcquisitionBudgetMs){frame.BudgetOmitted++;continue;}
                string token;try{token=Token(v);}catch{frame.CensusInvalid++;continue;}
                var o=new VehicleObservation{Token=token,Valid=Valid(v),IsPlayer=token==playerToken};
                o.PlayerVehicle=playerKnown?Field<bool>.Observed(token==playerToken,"boolean","RPH player CurrentVehicle comparison"):Field<bool>.Missing("boolean","player_vehicle_state_unavailable");
                if(o.Valid) {
                    o.PoolHandle=Read(()=>v.Handle.Value,"framework handle","Entity.Handle.Value");
                    o.PoolIndex=Read(()=>v.Handle.Index,"pool index","PoolHandle.Index");
                    o.PoolCounter=Read(()=>(int)v.Handle.Counter,"pool counter","PoolHandle.Counter");
                    o.Model=Read(()=>v.Model.Hash,"model hash","Vehicle.Model.Hash");
                    o.Position=Read(()=>V(v.Position),"m","Entity.Position");
                    o.Rotation=Read(()=>R(v.Rotation),"degrees; x=pitch,y=roll,z=yaw","Entity.Rotation");
                    o.Orientation=Read(()=>Q(v.Orientation),"unit quaternion; GTA Z-up","Entity.Orientation");
                    o.Velocity=Read(()=>V(v.Velocity),"m/s","Entity.Velocity");
                    o.EngineRunning=Read(()=>v.IsEngineOn,"boolean","Vehicle.IsEngineOn");
                    o.DriverPresent=Read(()=>v.HasDriver,"boolean","Vehicle.HasDriver");
                    if(config.ReadDrivetrain) {
                        o.RpmRatio=Read(()=>(double)v.EngineRevolutionsRatio,"ratio, not crankshaft RPM","Vehicle.EngineRevolutionsRatio");
                        if(o.RpmRatio.Value.HasValue&&(o.RpmRatio.Value.Value<0||o.RpmRatio.Value.Value>1))o.RpmRatio=Field<double>.Missing("ratio","invalid_out_of_range_RPM_ratio");
                        o.Gear=Read(()=>(int)v.CurrentGear,"framework gear index","Vehicle.CurrentGear");
                    } else {
                        o.RpmRatio=Field<double>.Missing("ratio","disabled_by_configuration");o.Gear=Field<int>.Missing("gear index","disabled_by_configuration");
                    }
                }
                frame.Vehicles.Add(o);
            }
            frame.AvailableCount=available;frame.CensusExamined=examined;frame.CensusInvalid+=censusInvalid;frame.CensusAgeSeconds=now-lastCensus;frame.CensusTruncated=truncated;frame.SourceLimitOmitted+=omitted;
            watch.Stop();frame.AcquisitionMs=watch.Elapsed.TotalMilliseconds;return frame;
        }
    }
    public static class EntryPoint
    {
        private static volatile bool requested,shutdown;
        private static AsyncRecorder recorder;
        private static Tracker tracker;
        private static Stopwatch clock;
        private static int finishing;
        private static long missedTotal;
        private static DeadlineScheduler currentScheduler;
        private static volatile string context="unlabelled";
        [ConsoleCommand(Name="RichAudioMark",Description="Label subsequent records, e.g. urban_TestC or rural_TestD")]
        public static void Mark(string label) {context=(label??"unlabelled").Substring(0,Math.Min(128,(label??"unlabelled").Length));}
        [ConsoleCommand(Name="RichAudioStart",Description="Enable telemetry only in acknowledged Story Mode")]
        public static void StartCapture() {requested=true;}
        [ConsoleCommand(Name="RichAudioStop",Description="Stop telemetry capture without changing the game")]
        public static void StopCapture() {requested=false;}
        [ConsoleCommand(Name="RichAudioStatus",Description="Show telemetry writer status")]
        public static void Status() {Game.Console.Print("RichAudio: requested="+requested+" dropped="+(recorder==null?0:recorder.Dropped)+" writerError="+(recorder==null?"not started":recorder.Error??"none"));}
        public static void Main() {
            clock=Stopwatch.StartNew();string session=Guid.NewGuid().ToString("N");tracker=new Tracker(session);
            try {
                string configPath=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Telemetry.Rph.json");
                CaptureConfig config;using(var input=File.OpenRead(configPath)){config=(CaptureConfig)new DataContractJsonSerializer(typeof(CaptureConfig)).ReadObject(input);}config.Validate();
                string exe=Process.GetCurrentProcess().MainModule.FileName;var version=FileVersionInfo.GetVersionInfo(exe);
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||version.FileMajorPart!=1||version.FileMinorPart!=0||version.FileBuildPart!=1158||version.FilePrivatePart!=16)throw new NotSupportedException("Only the researched GTA5_Enhanced 1.0.1158.16 is allowed; revalidate other builds");
                recorder=new AsyncRecorder(Path.Combine(config.OutputDirectory,"richaudio-"+session+".jsonl"),config.QueueCapacity);
                recorder.TryRecord(new CaptureRecord{Kind="session_start",SessionId=session,Source="RPH public SDK getters; built but unverified in game",Metadata=new SessionMetadata{TargetHz=config.SampleHz,SourceLimit=config.SourceLimit,QueueCapacity=config.QueueCapacity,CensusLimit=config.CensusLimit,AcquisitionBudgetMs=config.AcquisitionBudgetMs,ClockFrequencyHz=Stopwatch.Frequency,GameVersion=version.FileVersion,FrameworkVersion=FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion,CoordinateConvention="GTA world Z-up; assumed 1 unit/metre; camera listener proxy",RuntimeValidation="not established by this build"},Detail="No LSPDFR reference; no audio/vehicle setters; source prefix selection, not a full-distance census"});
                requested=config.CaptureEnabled;bool active=false;DeadlineScheduler scheduler=null;ITelemetrySource source=null;
                while(!shutdown) {
                    if(recorder.Error!=null)throw new IOException("Writer failed: "+recorder.Error);
                    bool permitted=false;
                    if(requested&&config.StoryModeAcknowledged&&!Game.IsPaused) {
                        try{permitted=!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS");}catch{permitted=false;}
                    }
                    double now=clock.Elapsed.TotalSeconds;
                    if(!permitted) {
                        if(active){var stopped=tracker.Stop(now,"disabled, paused, network or session state unavailable");missedTotal+=scheduler.Missed;currentScheduler=null;stopped.MissedDeadlines=missedTotal;stopped.Context=context;recorder.TryRecord(stopped);active=false;}
                        GameFiber.Sleep(25);continue;
                    }
                    if(!active){scheduler=new DeadlineScheduler(config.SampleHz,now);currentScheduler=scheduler;source=new RphSource(config);active=true;}
                    if(scheduler.TryTake(now)) {
                        var record=tracker.Process(source.Read(now));record.Source="RPH documented getters";record.Context=context;record.ScheduleDelayMs=scheduler.DelayMs;record.MissedDeadlines=missedTotal+scheduler.Missed;recorder.TryRecord(record);
                    }
                    GameFiber.Sleep(Math.Max(1,Math.Min(10,(int)(scheduler.Remaining(clock.Elapsed.TotalSeconds)*1000))));
                }
            } catch(Exception ex) {Game.Console.Print("RichAudio stopped: "+ex.GetType().Name+": "+ex.Message);}
            finally{Finish(false,false);}
        }
        public static void OnUnload(bool isTerminating) {shutdown=true;Finish(isTerminating,!isTerminating);}
        private static void Finish(bool terminating,bool mayWait) {
            if(recorder==null)return;
            if(Interlocked.Exchange(ref finishing,1)==0) {
                var end=tracker.Stop(clock.Elapsed.TotalSeconds,"plugin shutdown");end.Kind="session_end";end.MissedDeadlines=missedTotal+(currentScheduler==null?0:currentScheduler.Missed);end.Context=context;end.Detail=terminating?"forced unload: footer/drain not guaranteed":"main exit or graceful unload; inspect footer and writer status";recorder.Complete(end);
            }
            // Never sleep in an aborted entry fiber or forceful exit callback.
            if(mayWait) {double until=clock.Elapsed.TotalSeconds+2;while(!recorder.Finished&&clock.Elapsed.TotalSeconds<until)GameFiber.Sleep(10);}
        }
    }
}
