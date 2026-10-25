using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace RichAudio.Telemetry
{
    public sealed class DeadlineScheduler
    {
        private readonly double period;
        private double next,last=-1;
        public long Missed {get;private set;}
        public double DelayMs {get;private set;}
        public DeadlineScheduler(double hz,double start) {if(!Validity.Finite(hz)||hz<1||hz>100||!Validity.Finite(start)||start<0)throw new ArgumentOutOfRangeException();period=1/hz;next=start;}
        public bool TryTake(double now) {
            if(!Validity.Finite(now)||now<0||now<last)throw new ArgumentException("Clock must be finite and monotonic");
            last=now;if(now+1e-9<next)return false;
            DelayMs=Math.Max(0,(now-next)*1000);
            long skipped=(long)Math.Floor(Math.Max(0,now-next)/period+1e-8);
            Missed+=skipped;next+=(skipped+1)*period;return true; // skip backlog; never catch up in a burst
        }
        public double Remaining(double now) {return Math.Max(0,next-now);}
    }
    public sealed class Tracker
    {
        private sealed class Track {public string Id;public uint? Model;public double Last;public Field<Vec3> Position,Velocity;}
        private readonly Dictionary<string,Track> tracks=new Dictionary<string,Track>();
        private long nextId,sequence,invalid;
        private double lastTime=-1;
        private Field<Vec3> previousListenerPosition;
        private double previousListenerTime=-1;
        public readonly string SessionId;
        public int ActiveCount {get {return tracks.Count;}}
        public double ExpirySeconds=0.75;
        public Tracker(string sessionId) {SessionId=sessionId;}
        private static void Event(CaptureRecord r,string token,Track t,string kind,string reason) {r.Events.Add(new LifecycleEvent{Token=token,TrackingId=t.Id,Kind=kind,Reason=reason,Time=r.TimestampSeconds});}
        private void Retire(CaptureRecord r,string key,string kind,string reason) {var t=tracks[key];Event(r,key,t,kind,reason);if(kind!="tracking_termination")Event(r,key,t,"tracking_termination",reason);tracks.Remove(key);}
        private void Count<T>(Field<T> f) where T:struct {if(f==null||f.Status=="unavailable"&&f.Reason!=null&&f.Reason.StartsWith("invalid"))invalid++;}
        private CaptureRecord NewRecord(double time) {return new CaptureRecord{SessionId=SessionId,Sequence=++sequence,TimestampSeconds=time};}
        public CaptureRecord Process(ObservationFrame f) {
            if(!Validity.Finite(f.Time)||f.Time<0||f.Time<=lastTime)throw new ArgumentException("Samples require strictly increasing monotonic seconds");
            var watch=Stopwatch.StartNew();var r=NewRecord(f.Time);lastTime=f.Time;
            r.Listener=new ListenerState{Position=f.Listener.Position,Rotation=f.Listener.Rotation,Orientation=f.Listener.Orientation,Velocity=f.Listener.Velocity,Policy=f.Listener.Policy};r.AcquisitionMs=f.AcquisitionMs;r.DiscoveryMs=f.DiscoveryMs;r.AvailableCount=f.AvailableCount;r.CensusExamined=f.CensusExamined;r.CensusInvalid=f.CensusInvalid;r.CensusAgeSeconds=f.CensusAgeSeconds;r.CensusTruncated=f.CensusTruncated;r.SourceLimitOmitted=f.SourceLimitOmitted;r.BudgetOmitted=f.BudgetOmitted;
            r.Listener.SampleTimestamp=Field<double>.Observed(f.Time,"monotonic seconds since session start","capture clock");
            double ldt=f.Time-previousListenerTime;
            if((r.Listener.Velocity==null||!r.Listener.Velocity.Value.HasValue)&&previousListenerPosition!=null&&previousListenerPosition.Value.HasValue&&f.Listener.Position.Value.HasValue&&ldt>0&&ldt<=0.25&&(f.Listener.Position.Value.Value-previousListenerPosition.Value.Value).Length<25)
                r.Listener.Velocity=Field<Vec3>.Estimated((f.Listener.Position.Value.Value-previousListenerPosition.Value.Value)/ldt,"m/s","camera position finite difference; cuts below threshold may remain undetected");
            previousListenerPosition=f.Listener.Position;previousListenerTime=f.Time;
            Count(r.Listener.Position);Count(r.Listener.Rotation);Count(r.Listener.Orientation);
            var seen=new HashSet<string>();
            foreach(var v in f.Vehicles) {
                if(string.IsNullOrEmpty(v.Token)||!seen.Add(v.Token))continue;
                if(!v.Valid) {if(tracks.ContainsKey(v.Token))Retire(r,v.Token,"invalid_entity","framework invalid entity; destruction versus stream-out unknown");continue;}
                Track t;
                if(tracks.TryGetValue(v.Token,out t)&&((t.Model.HasValue&&v.Model.Value.HasValue&&t.Model!=v.Model.Value)||f.Time-t.Last>ExpirySeconds)) {Retire(r,v.Token,"tracking_termination","observed model changed or observation gap");t=null;}
                bool first=t==null;
                if(first) {t=new Track{Id=SessionId+":"+(++nextId),Model=v.Model.Value};tracks[v.Token]=t;Event(r,v.Token,t,"first_observation","new session-local identity");}
                if(v.Model.Value.HasValue)t.Model=v.Model.Value;
                var acceleration=Field<Vec3>.Missing("m/s^2","no_continuous_velocity_pair");double dt=f.Time-t.Last;
                if(!first&&dt>0&&dt<=0.25&&v.Velocity.Value.HasValue&&t.Velocity!=null&&t.Velocity.Value.HasValue&&v.Position.Value.HasValue&&t.Position!=null&&t.Position.Value.HasValue&&(v.Position.Value.Value-t.Position.Value.Value).Length<Math.Max(25,v.Velocity.Value.Value.Length*dt+10))
                    acceleration=Field<Vec3>.Estimated((v.Velocity.Value.Value-t.Velocity.Value.Value)/dt,"m/s^2","velocity finite difference; no engine-load calibration");
                var distance=Field<double>.Missing("m","listener_or_source_position_unavailable");
                if(v.Position.Value.HasValue&&f.Listener.Position.Value.HasValue)distance=Field<double>.Estimated((v.Position.Value.Value-f.Listener.Position.Value.Value).Length,"m","Euclidean distance in assumed-metre GTA world coordinates");
                var state=new VehicleState{TrackingId=t.Id,Token=v.Token,PoolHandle=v.PoolHandle,PoolIndex=v.PoolIndex,PoolCounter=v.PoolCounter,IsPlayer=v.IsPlayer,Lifecycle=first?"first_observation":"continued_tracking",Model=v.Model,Position=v.Position,Rotation=v.Rotation,Orientation=v.Orientation,Velocity=v.Velocity,Acceleration=acceleration,EngineRunning=v.EngineRunning,RpmRatio=v.RpmRatio,Gear=v.Gear,InferredLoad=Field<double>.Missing("dimensionless load","no_calibrated_load_estimator; acceleration alone is not engine load"),DistanceFromListener=distance,SampleTimestamp=Field<double>.Observed(f.Time,"monotonic seconds since session start","capture clock")};
                r.Vehicles.Add(state);
                state.PlayerVehicle=v.PlayerVehicle;
                state.DriverPresent=v.DriverPresent;
                if(v.Position.Status=="unavailable"||v.Velocity.Status=="unavailable"||v.RpmRatio.Status=="unavailable"||v.Gear.Status=="unavailable")Event(r,v.Token,t,"unavailable_telemetry","see field status and reason");
                Count(v.Model);Count(v.Position);Count(v.Rotation);Count(v.Orientation);Count(v.Velocity);Count(v.EngineRunning);Count(v.RpmRatio);Count(v.Gear);
                t.Last=f.Time;t.Position=v.Position;t.Velocity=v.Velocity;
            }
            foreach(var key in new List<string>(tracks.Keys)) {
                if(f.CompleteCensusTokens!=null&&!f.CompleteCensusTokens.Contains(key)&&!seen.Contains(key))Retire(r,key,"despawn_or_stream_out","absent from complete framework census; cannot distinguish destruction");
                else if(f.Time-tracks[key].Last>ExpirySeconds)Retire(r,key,"tracking_termination","observation_timeout; not proof of despawn");
            }
            r.InvalidValues=invalid;watch.Stop();r.ProcessingMs=watch.Elapsed.TotalMilliseconds;return r;
        }
        public CaptureRecord Stop(double time,string reason) {
            var r=NewRecord(Math.Max(time,lastTime));r.Kind="capture_stopped";
            foreach(var key in new List<string>(tracks.Keys))Retire(r,key,"tracking_termination",reason);
            previousListenerPosition=null;previousListenerTime=-1;r.InvalidValues=invalid;return r;
        }
    }
}
