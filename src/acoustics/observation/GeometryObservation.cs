// Framework-neutral, original one-observation contract. No audio/game dependency.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
namespace RichAudio.GeometryResearch
{
    [DataContract] public struct Point3
    {
        [DataMember] public double X; [DataMember] public double Y; [DataMember] public double Z;
        public Point3(double x,double y,double z){X=x;Y=y;Z=z;}
        public bool Finite {get{return Valid(X)&&Valid(Y)&&Valid(Z);}}
        private static bool Valid(double v){return !double.IsNaN(v)&&!double.IsInfinity(v)&&Math.Abs(v)<=100000;}
        public static Point3 Sub(Point3 a,Point3 b){return new Point3(a.X-b.X,a.Y-b.Y,a.Z-b.Z);}
        public static double Dot(Point3 a,Point3 b){return a.X*b.X+a.Y*b.Y+a.Z*b.Z;}
        public double Length {get{return Math.Sqrt(Dot(this,this));}}
    }
    [DataContract] public sealed class GeometryObservation
    {
        [DataMember] public int SchemaVersion=1;
        [DataMember] public string SessionId,GameVersion,FrameworkVersion;
        [DataMember] public string CoordinateSpace="gta-native-units-unverified",TimeUnit="monotonic-ms";
        [DataMember] public string Completion="not_executed",ErrorClass;
        [DataMember] public Point3? Origin,End;
        [DataMember] public double MaximumDistance=8,ObservedAtMs;
        [DataMember] public double? TraceDurationMs,ConversionDurationMs,ValidationDurationMs;
        [DataMember] public long ManagedMemoryBytes;
        [DataMember] public double? PlayerSpeed;
        [DataMember] public string SetupStatus="not_acquired";
        [DataMember] public int TraceCalls;
        [DataMember] public string FlagsName="IntersectWorld";
        [DataMember] public int FlagsValue=1;
        [DataMember] public uint? IgnoredPlayerHandle,HitEntityHandle;
        [DataMember] public Point3? HitPosition,HitNormal;
        [DataMember] public string PositionStatus="unavailable",NormalStatus="unavailable",EntityStatus="unavailable";
        [DataMember] public string MaterialStatus="unavailable_RPH_HitResult",ExtentStatus="unavailable_single_hit";
        [DataMember] public string QueryProvenance="RPH World.TraceLine; one world-only query; no extent/material inference";
        [DataMember] public string StartedUtc;
        [DataMember] public GeometryValidation Validation;
        [DataMember] public PointNormalObservation RetainedPoint;
    }
    [DataContract] public sealed class PointNormalObservation
    {
        [DataMember] public string Kind="point-normal-only",CoordinateSpace="gta-native-units-unverified";
        [DataMember] public string SessionId,GameVersion,Provenance;
        [DataMember] public double ObservedAtMs;
        [DataMember] public Point3 Position,Normal;
        [DataMember] public double? Width,Height,AcousticEnergyReflectance;
        [DataMember] public string StaticClassification="unverified",Material="unknown",TargetIdentity="requires_supervised_confirmation";
    }
    [DataContract] public sealed class GeometryValidation
    {
        [DataMember] public bool RecordValid,SurfaceValid;
        [DataMember] public List<string> Reasons=new List<string>();
        [DataMember] public double? SegmentParameter,OffSegmentDistance,PositionTolerance,NormalLength,NormalRayDot;
        [DataMember] public bool? WallLike,NonGrazing;
        [DataMember] public string NormalOrientation="unavailable",TargetIdentity="requires_supervised_confirmation";
    }
    public static class ObservationRules
    {
        public const double FloatEpsilon=1.0/8388608.0;
        public static bool Finite(double x){return !double.IsNaN(x)&&!double.IsInfinity(x);}
        public static GeometryValidation Validate(GeometryObservation o)
        {
            var r=new GeometryValidation();if(o==null){r.Reasons.Add("missing_record");return r;}
            if(o.SchemaVersion!=1)r.Reasons.Add("schema");
            if(o.SessionId==null||!Regex.IsMatch(o.SessionId,"^[A-Za-z0-9_-]{1,64}$"))r.Reasons.Add("session");
            if(o.GameVersion!="1.0.1158.16"||o.FrameworkVersion!="1.132.1428.17748")r.Reasons.Add("build");
            if(o.CoordinateSpace!="gta-native-units-unverified"||o.TimeUnit!="monotonic-ms")r.Reasons.Add("coordinate_or_time_contract");
            if(!Finite(o.ObservedAtMs)||o.ObservedAtMs<0||!o.TraceDurationMs.HasValue||!Finite(o.TraceDurationMs.Value)||o.TraceDurationMs.Value<0||!o.ConversionDurationMs.HasValue||!Finite(o.ConversionDurationMs.Value)||o.ConversionDurationMs.Value<0)r.Reasons.Add("timing");
            if(o.TraceCalls!=1||o.FlagsName!="IntersectWorld"||o.FlagsValue!=1||!o.IgnoredPlayerHandle.HasValue||o.IgnoredPlayerHandle.Value==0)r.Reasons.Add("query_scope");
            if(o.SetupStatus!="on_foot_stationary_by_SDK_getters"||!o.PlayerSpeed.HasValue||!Finite(o.PlayerSpeed.Value)||o.PlayerSpeed.Value<0||o.PlayerSpeed.Value>.25)r.Reasons.Add("setup_gate");
            if(o.MaterialStatus!="unavailable_RPH_HitResult"||o.ExtentStatus!="unavailable_single_hit")r.Reasons.Add("fabricated_material_or_extent");
            if(!o.Origin.HasValue||!o.End.HasValue||!o.Origin.Value.Finite||!o.End.Value.Finite||!Finite(o.MaximumDistance)||o.MaximumDistance<=0||o.MaximumDistance>10)r.Reasons.Add("query_geometry");
            if(o.Completion!="hit"&&o.Completion!="miss")r.Reasons.Add("incomplete_or_error");
            if(r.Reasons.Count!=0)return r;
            Point3 origin=o.Origin.Value,end=o.End.Value,d=Point3.Sub(end,origin);double n=d.Length;
            double magnitude=Math.Max(1,Math.Max(Math.Max(Math.Abs(origin.X),Math.Abs(origin.Y)),Math.Max(Math.Abs(origin.Z),Math.Max(Math.Abs(end.X),Math.Max(Math.Abs(end.Y),Math.Abs(end.Z))))));
            double tolerance=16*FloatEpsilon*magnitude;r.PositionTolerance=tolerance;
            if(n<=tolerance||Math.Abs(n-o.MaximumDistance)>tolerance){r.Reasons.Add("trace_length");return r;}
            if(o.Completion=="miss") {r.RecordValid=!o.HitPosition.HasValue&&!o.HitNormal.HasValue&&!o.HitEntityHandle.HasValue;if(!r.RecordValid)r.Reasons.Add("fields_defined_on_miss");else r.Reasons.Add("no_hit");return r;}
            r.RecordValid=true;
            if(!o.HitPosition.HasValue||!o.HitPosition.Value.Finite||o.PositionStatus!="observed"){r.Reasons.Add("invalid_or_missing_position");return r;}
            if(!o.HitNormal.HasValue||!o.HitNormal.Value.Finite||o.NormalStatus!="observed"){r.Reasons.Add("invalid_or_missing_normal");return r;}
            Point3 delta=Point3.Sub(o.HitPosition.Value,origin);double t=Point3.Dot(delta,d)/(n*n);var closest=new Point3(origin.X+t*d.X,origin.Y+t*d.Y,origin.Z+t*d.Z);double off=Point3.Sub(o.HitPosition.Value,closest).Length;
            r.SegmentParameter=t;r.OffSegmentDistance=off;
            if(t< -tolerance/n||t>1+tolerance/n||off>tolerance){r.Reasons.Add("position_off_segment");return r;}
            Point3 normal=o.HitNormal.Value;double norm=normal.Length;r.NormalLength=norm;
            // Fixed plausibility screen, not a documented vendor error bound.
            if(norm==0||Math.Abs(norm-1)>.01){r.Reasons.Add("nonunit_normal");return r;}
            double incidence=Point3.Dot(normal,d)/(norm*n);r.NormalRayDot=incidence;r.NormalOrientation=incidence<0?"against_ray":incidence>0?"with_ray":"tangent";
            r.WallLike=Math.Abs(normal.Z/norm)<=.2;r.NonGrazing=Math.Abs(incidence)>=.5;
            if(o.HitEntityHandle.HasValue&&(o.HitEntityHandle.Value==0||o.EntityStatus!="returned_identity_unclassified")||!o.HitEntityHandle.HasValue&&o.EntityStatus!="none_returned_static_unproven"&&o.EntityStatus!="unavailable")r.Reasons.Add("entity_identity_ambiguity");
            r.SurfaceValid=r.Reasons.Count==0;return r;
        }
        public static bool Fresh(GeometryObservation o,string session,string build,double nowMs,double ttlMs)
        {return o!=null&&session==o.SessionId&&build==o.GameVersion&&Finite(nowMs)&&Finite(ttlMs)&&ttlMs>0&&ttlMs<=1000&&nowMs>=o.ObservedAtMs&&nowMs-o.ObservedAtMs<=ttlMs&&Validate(o).SurfaceValid;}
        public static PointNormalObservation Retain(GeometryObservation o)
        {if(!Validate(o).SurfaceValid)throw new InvalidDataException("No validated surface observation");return new PointNormalObservation{SessionId=o.SessionId,GameVersion=o.GameVersion,ObservedAtMs=o.ObservedAtMs,Position=o.HitPosition.Value,Normal=o.HitNormal.Value,Provenance=o.QueryProvenance};}
    }
    public sealed class OneObservationGate
    {
        private int state,claims;
        public bool TryClaim(){if(Interlocked.CompareExchange(ref state,1,0)!=0)return false;Interlocked.Increment(ref claims);return true;}
        public void Finish(){Interlocked.Exchange(ref state,2);}
        public int Claims {get{return Interlocked.CompareExchange(ref claims,0,0);}}
        public bool IsFinished {get{return Interlocked.CompareExchange(ref state,0,0)==2;}}
    }
    public static class DurableAttempt
    {
        public static void Reserve(string marker,string token)
        {using(var file=new FileStream(marker,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(file))writer.Write("ACOUSTICS-02 reserved "+token);}
    }
}
