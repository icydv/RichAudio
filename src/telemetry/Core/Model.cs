using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace RichAudio.Telemetry
{
    [DataContract] public struct Vec3
    {
        [DataMember(Name="x")] public double X;
        [DataMember(Name="y")] public double Y;
        [DataMember(Name="z")] public double Z;
        public Vec3(double x,double y,double z) { X=x;Y=y;Z=z; }
        public double Length { get { return Math.Sqrt(X*X+Y*Y+Z*Z); } }
        public static Vec3 operator -(Vec3 a,Vec3 b) { return new Vec3(a.X-b.X,a.Y-b.Y,a.Z-b.Z); }
        public static Vec3 operator /(Vec3 a,double b) { return new Vec3(a.X/b,a.Y/b,a.Z/b); }
    }
    [DataContract] public struct Quat
    {
        [DataMember(Name="x")] public double X;
        [DataMember(Name="y")] public double Y;
        [DataMember(Name="z")] public double Z;
        [DataMember(Name="w")] public double W;
        public Quat(double x,double y,double z,double w) { X=x;Y=y;Z=z;W=w; }
        public static Quat Multiply(Quat a,Quat b) { return new Quat(a.W*b.X+a.X*b.W+a.Y*b.Z-a.Z*b.Y,a.W*b.Y-a.X*b.Z+a.Y*b.W+a.Z*b.X,a.W*b.Z+a.X*b.Y-a.Y*b.X+a.Z*b.W,a.W*b.W-a.X*b.X-a.Y*b.Y-a.Z*b.Z); }
        public static Quat FromZxyDegrees(Vec3 r) {
            double x=r.X*Math.PI/360,y=r.Y*Math.PI/360,z=r.Z*Math.PI/360;
            return Multiply(Multiply(new Quat(0,0,Math.Sin(z),Math.Cos(z)),new Quat(Math.Sin(x),0,0,Math.Cos(x))),new Quat(0,Math.Sin(y),0,Math.Cos(y)));
        }
    }
    public static class Validity
    {
        public static bool Finite(double n) { return !double.IsNaN(n)&&!double.IsInfinity(n); }
        public static bool Check<T>(T v) where T:struct {
            object o=v;
            if(o is double) return Finite((double)o);
            if(o is float) return Finite((float)o);
            if(o is Vec3) { var p=(Vec3)o;return Finite(p.X)&&Finite(p.Y)&&Finite(p.Z); }
            if(o is Quat) { var q=(Quat)o;double n=q.X*q.X+q.Y*q.Y+q.Z*q.Z+q.W*q.W;return Finite(n)&&n>0.5&&n<1.5; }
            return true;
        }
    }
    // Immutable after construction. Unavailable values serialize as JSON null, never a numeric sentinel.
    [DataContract] public sealed class Field<T> where T:struct
    {
        [DataMember(Name="status",Order=0)] public string Status {get;private set;}
        [DataMember(Name="value",Order=1)] public T? Value {get;private set;}
        [DataMember(Name="units",Order=2)] public string Units {get;private set;}
        [DataMember(Name="origin",Order=3)] public string Origin {get;private set;}
        [DataMember(Name="reason",Order=4)] public string Reason {get;private set;}
        private Field() {}
        public static Field<T> Missing(string units,string reason) { return new Field<T>{Status="unavailable",Value=null,Units=units,Origin="none",Reason=reason}; }
        public static Field<T> Create(T v,string units,string origin,bool estimated) {
            if(!Validity.Check(v)) return Missing(units,"invalid_nonfinite_or_orientation");
            return new Field<T>{Status=estimated?"estimated":"observed",Value=v,Units=units,Origin=origin,Reason=null};
        }
        public static Field<T> Observed(T v,string units,string origin) {return Create(v,units,origin,false);}
        public static Field<T> Estimated(T v,string units,string origin) {return Create(v,units,origin,true);}
    }
    [DataContract] public sealed class ListenerState
    {
        [DataMember] public Field<Vec3> Position=Field<Vec3>.Missing("m","not_sampled");
        [DataMember] public Field<Vec3> Rotation=Field<Vec3>.Missing("degrees; x=pitch,y=roll,z=yaw; ZXY","not_sampled");
        [DataMember] public Field<Quat> Orientation=Field<Quat>.Missing("unit quaternion; GTA Z-up","not_sampled");
        [DataMember] public Field<Vec3> Velocity=Field<Vec3>.Missing("m/s","not_sampled");
        [DataMember] public Field<double> SampleTimestamp=Field<double>.Missing("monotonic seconds since session start","not_sampled");
        [DataMember] public string Policy="final_rendered_camera_proxy_not_native_audio_listener";
    }
    // Adapter input contains copied values only. No engine objects or pointers cross this boundary.
    public sealed class VehicleObservation
    {
        public string Token;
        public bool Valid=true;
        public bool IsPlayer;
        public Field<bool> PlayerVehicle=Field<bool>.Missing("boolean","player_vehicle_state_unavailable");
        public Field<bool> DriverPresent=Field<bool>.Missing("boolean","driver_state_unavailable");
        public Field<uint> Model=Field<uint>.Missing("model hash","not_sampled");
        public Field<uint> PoolHandle=Field<uint>.Missing("framework handle","not_available_from_adapter"),PoolIndex=Field<uint>.Missing("pool index","not_available_from_adapter");
        public Field<int> PoolCounter=Field<int>.Missing("pool counter","not_available_from_adapter");
        public Field<Vec3> Position=Field<Vec3>.Missing("m","not_sampled");
        public Field<Vec3> Rotation=Field<Vec3>.Missing("degrees; x=pitch,y=roll,z=yaw","not_sampled");
        public Field<Quat> Orientation=Field<Quat>.Missing("unit quaternion; GTA Z-up","not_sampled");
        public Field<Vec3> Velocity=Field<Vec3>.Missing("m/s","not_sampled");
        public Field<bool> EngineRunning=Field<bool>.Missing("boolean","not_sampled");
        public Field<double> RpmRatio=Field<double>.Missing("ratio, not physical RPM","unsupported");
        public Field<int> Gear=Field<int>.Missing("framework gear index","unsupported");
        // Adapter input only; never added to production CaptureRecord/VehicleState schema.
        public RawRpmDiagnostic RawRpm;
        public Field<bool> DiagnosticOccupants=Field<bool>.Missing("boolean","diagnostics_disabled");
    }
    public sealed class ObservationFrame
    {
        public double Time;
        public ListenerState Listener=new ListenerState();
        public List<VehicleObservation> Vehicles=new List<VehicleObservation>();
        public HashSet<string> CompleteCensusTokens; // null = no complete census; absence cannot imply despawn
        public int AvailableCount=-1, CensusExamined, CensusInvalid, SourceLimitOmitted, BudgetOmitted;
        public double CensusAgeSeconds=-1, AcquisitionMs, DiscoveryMs;
        public bool CensusTruncated;
    }
    [DataContract] public sealed class VehicleState
    {
        [DataMember] public string TrackingId,Token,IdentityScope="session-local; observed gaps/model changes retire identity; undetected same-token reuse possible";
        public bool IsPlayer; // internal convenience only; serialized classification carries validity below
        [DataMember] public Field<bool> PlayerVehicle;
        [DataMember] public Field<bool> DriverPresent;
        [DataMember] public string Lifecycle;
        [DataMember] public Field<uint> Model;
        [DataMember] public Field<uint> PoolHandle,PoolIndex;
        [DataMember] public Field<int> PoolCounter;
        [DataMember] public Field<Vec3> Position,Rotation,Velocity,Acceleration;
        [DataMember] public Field<Quat> Orientation;
        [DataMember] public Field<bool> EngineRunning;
        [DataMember] public Field<double> RpmRatio,InferredLoad,DistanceFromListener,SampleTimestamp;
        [DataMember] public Field<int> Gear;
    }
    [DataContract] public sealed class LifecycleEvent
    {
        [DataMember] public string TrackingId,Token,Kind,Reason;
        [DataMember] public double Time;
    }
    [DataContract] public sealed class CaptureRecord
    {
        [DataMember(Order=0)] public int SchemaVersion=1;
        [DataMember(Order=1)] public string Kind="sample",SessionId,Source;
        [DataMember] public long Sequence;
        [DataMember] public double TimestampSeconds,ScheduleDelayMs,AcquisitionMs,DiscoveryMs,ProcessingMs;
        [DataMember] public long MissedDeadlines,QueueDropped,InvalidValues;
        [DataMember] public int AvailableCount,CensusExamined,CensusInvalid,SourceLimitOmitted,BudgetOmitted;
        [DataMember] public double CensusAgeSeconds;
        [DataMember] public bool CensusTruncated;
        [DataMember] public ListenerState Listener;
        [DataMember] public List<VehicleState> Vehicles=new List<VehicleState>();
        [DataMember] public List<LifecycleEvent> Events=new List<LifecycleEvent>();
        [DataMember] public string Detail;
        [DataMember] public string Context;
        [DataMember] public SessionMetadata Metadata;
    }
    [DataContract] public sealed class SessionMetadata
    {
        [DataMember] public int TargetHz,SourceLimit,QueueCapacity,CensusLimit;
        [DataMember] public long ClockFrequencyHz;
        [DataMember] public double AcquisitionBudgetMs;
        [DataMember] public string GameVersion,FrameworkVersion,CoordinateConvention,RuntimeValidation;
    }
    public interface ITelemetrySource { ObservationFrame Read(double monotonicSeconds); }
}
