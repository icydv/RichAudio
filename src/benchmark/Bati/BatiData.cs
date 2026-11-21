// Original research contracts. Native units remain uncalibrated; no runtime dependency.
using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using RichAudio.MarkerResearch;

namespace RichAudio.BatiResearch
{
    public static class Check
    {
        public static void That(bool ok,string reason){if(!ok)throw new InvalidOperationException(reason);}
        public static bool Finite(double x){return !double.IsNaN(x)&&!double.IsInfinity(x);}
        public static void Point(MarkerPoint p){That(p.Valid,"invalid point");}
        public static MarkerPoint Sub(MarkerPoint a,MarkerPoint b){return new MarkerPoint(a.X-b.X,a.Y-b.Y,a.Z-b.Z);}
        public static double Length(MarkerPoint p){return Math.Sqrt(p.X*p.X+p.Y*p.Y+p.Z*p.Z);}
        public static double Distance(MarkerPoint a,MarkerPoint b){return Length(Sub(a,b));}
        public static double Dot(MarkerPoint a,MarkerPoint b){return a.X*b.X+a.Y*b.Y+a.Z*b.Z;}
        public static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    }

    // This value is copied from a sealed, validated historical marker record.
    public sealed class MarkerSet
    {
        public readonly MarkerPoint Start,Finish,Listener;
        public readonly string Fingerprint,Session,Domain;
        public readonly int Revision;
        public readonly double Chord;
        private MarkerSet(MarkerSnapshot m,string hash){Start=m.Start.Position;Finish=m.Finish.Position;Listener=m.Listener.Position;Revision=m.Revision;Session=m.Session;Domain=m.Domain;Fingerprint=hash;Chord=Math.Sqrt(Math.Pow(Finish.X-Start.X,2)+Math.Pow(Finish.Y-Start.Y,2));}
        public static MarkerSet Parse(byte[] data,string expectedHash,int expectedRevision,string expectedSession,string expectedDomain)
        {
            Check.That(data!=null&&data.Length>0&&data.Length<=65536,"marker byte bound");
            Check.That(expectedHash!=null&&expectedHash.Length==64&&Check.Hash(data).Equals(expectedHash,StringComparison.OrdinalIgnoreCase),"marker fingerprint changed");
            MarkerSnapshot m;
            using(var b=new MemoryStream(data)){m=(MarkerSnapshot)new DataContractJsonSerializer(typeof(MarkerSnapshot),new DataContractJsonSerializerSettings{MaxItemsInObjectGraph=4096}).ReadObject(b);Check.That(b.Position==b.Length,"trailing marker data");}
            Check.That(m!=null&&m.Version==1&&m.GameVersion=="1.0.1158.16"&&m.Units=="uncalibrated-native-game-units","marker schema/build/units");
            Check.That(m.Domain==expectedDomain&&(m.Domain=="runtime-observation"||m.Domain=="original-synthetic-fixture")&&m.Session==expectedSession&&!string.IsNullOrEmpty(m.Session)&&m.Session.Length<=64,"marker provenance");
            Check.That(m.Revision==expectedRevision&&m.Revision>=3&&m.Revision<=32&&m.MarkersComplete&&m.Start!=null&&m.Finish!=null&&m.Listener!=null,"marker revision/completeness");
            Check.That(m.RouteCoverage=="UNKNOWN"&&!m.RouteClear&&!m.BenchmarkStartSupported,"marker must not certify route");
            foreach(var p in new[]{m.Start,m.Finish,m.Listener}){Check.Point(p.Position);Check.That(Check.Finite(p.Speed)&&p.Speed>=0&&p.Speed<=.25&&Check.Finite(p.AtMs)&&p.AtMs>0&&p.AtMs<900000,"marker pose/time");}
            Check.That(m.Start.AtMs<m.Finish.AtMs&&m.Finish.AtMs<m.Listener.AtMs&&m.Listener.OnFoot,"marker order/listener");
            var result=new MarkerSet(m,Check.Hash(data));Check.That(result.Chord>=5&&result.Chord<=5000&&Math.Abs(result.Chord-m.HorizontalSeparation)<1e-7,"marker chord");
            Check.That(m.Lines!=null&&m.Lines.Length==5,"marker drawing shape");
            // Recompute all geometry using the original marker contract; never trust supplied lines.
            var plan=new MarkerPlan(m.Domain,m.Session);plan.Set(MarkerKind.Start,m.Start);plan.Set(MarkerKind.Finish,m.Finish);var shape=plan.Set(MarkerKind.Listener,m.Listener);
            for(int i=0;i<5;i++)Check.That(m.Lines[i].Kind==shape.Lines[i].Kind&&Check.Distance(m.Lines[i].A,shape.Lines[i].A)<1e-8&&Check.Distance(m.Lines[i].B,shape.Lines[i].B)<1e-8,"marker derived geometry changed");
            return result;
        }
        public static MarkerSet Load(string file,string hash,int revision,string session,string domain)
        {
            PrivateFiles.RequireLocal(file);Check.That(new FileInfo(file).Length<=65536,"marker file bound");
            using(var f=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)){Check.That(f.Length<=65536,"marker changed during open");var b=new byte[(int)f.Length];int n=0;while(n<b.Length){int r=f.Read(b,n,b.Length-n);Check.That(r>0,"incomplete marker");n+=r;}return Parse(b,hash,revision,session,domain);}
        }
    }

    public static class PrivateFiles
    {
        public static void RequireLocal(string file)
        {
            Check.That(!string.IsNullOrEmpty(file)&&Path.IsPathRooted(file)&&!file.StartsWith(@"\\"),"absolute local private path required");
            string p=Path.GetFullPath(file);Check.That(p==file&&p.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)>=0,"ignored private storage required");
            for(string x=p;!string.IsNullOrEmpty(x);x=Path.GetDirectoryName(x))if(File.Exists(x)||Directory.Exists(x))Check.That((File.GetAttributes(x)&FileAttributes.ReparsePoint)==0,"linked private storage");
        }
        public static void WriteNew<T>(string file,T value)
        {
            RequireLocal(file);using(var b=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(b,value);Check.That(b.Length<=8388608,"record bound");using(var f=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)){b.Position=0;b.CopyTo(f);f.Flush(true);}}
        }
    }

    [DataContract] public struct Identity
    {
        [DataMember]public uint Handle,Model;
        [DataMember]public int Generation;
        [DataMember]public string Session,Creation;
        public bool Valid {get{return Handle!=0&&Model!=0&&Generation>=0&&!string.IsNullOrEmpty(Session)&&Session.Length<=64&&!string.IsNullOrEmpty(Creation)&&Creation.Length<=64;}}
        public bool Same(Identity x){return Valid&&x.Valid&&Handle==x.Handle&&Model==x.Model&&Generation==x.Generation&&Session==x.Session&&Creation==x.Creation;}
    }
    public enum Presence {Unknown,Present,Absent,Reused}
    public enum Stage {MarkersLoaded,Ready,SpawnRequested,VehicleVerified,TuningApplied,RiderVerified,Armed,Accelerating,Traversing,FinishReached,Complete,Failed,Stopped,CleanupPending,Cleaned}
    [DataContract] public sealed class Policy
    {
        [DataMember]public double MaxRunSeconds=120,MaxGapSeconds=.25,ListenerTolerance=.25,StartTolerance=1,StartSpeed=.25,DeviationTolerance=3,FinishRadius=2,StallSeconds=5;
        [DataMember]public double RequestedTaskSpeed=60,SteadySeconds=3,SteadySpanAbsolute=.5,SteadySpanFraction=.02,SteadySlope=.15;
        [DataMember]public double[] Thresholds={10,20,30,40,50};
        [DataMember]public int MaxSamples=2500,DrivingStyle=63;
        public Policy Copy(){var c=(Policy)MemberwiseClone();c.Thresholds=(double[])Thresholds.Clone();return c;}
        public void Validate(){foreach(double d in new[]{MaxRunSeconds,MaxGapSeconds,ListenerTolerance,StartTolerance,StartSpeed,DeviationTolerance,FinishRadius,StallSeconds,RequestedTaskSpeed,SteadySeconds,SteadySpanAbsolute,SteadySpanFraction,SteadySlope})Check.That(Check.Finite(d)&&d>0,"positive policy required");Check.That(MaxRunSeconds<=120&&MaxGapSeconds<=.25&&MaxSamples>=2&&MaxSamples<=2500&&RequestedTaskSpeed<=100&&SteadySeconds>=2&&SteadySeconds<MaxRunSeconds&&Thresholds!=null&&Thresholds.Length<=16&&DrivingStyle==63,"policy bound");double last=0;foreach(var t in Thresholds){Check.That(Check.Finite(t)&&t>last&&t<=200,"ordered speed thresholds");last=t;}}
    }
    public sealed class RouteEvidence
    {
        public string Domain,Session,MarkerFingerprint,Revision;
        public MarkerPoint[] Points;
        public bool SurfaceSpawnVerified,TrafficIsolationVerified,CoverageComplete,CleanupReviewed;
        public void Validate(MarkerSet markers,string session)
        {
            Check.That(Domain=="original-synthetic-fixture"&&markers.Domain==Domain,"no runtime route-readiness producer exists");
            Check.That(Session==session&&MarkerFingerprint==markers.Fingerprint&&!string.IsNullOrEmpty(Revision),"route provenance");
            Check.That(SurfaceSpawnVerified&&TrafficIsolationVerified&&CoverageComplete&&CleanupReviewed,"route readiness incomplete");
            Check.That(Points!=null&&Points.Length>=2&&Points.Length<=32,"surveyed path required");
            foreach(var p in Points)Check.Point(p);Check.That(Check.Distance(Points[0],markers.Start)<1e-8&&Check.Distance(Points[Points.Length-1],markers.Finish)<1e-8,"route cannot relocate markers");
            for(int i=1;i<Points.Length;i++)Check.That(Check.Distance(Points[i-1],Points[i])>=1,"distinct checkpoints required");
        }
        public RouteEvidence Copy(){var c=(RouteEvidence)MemberwiseClone();if(Points!=null)c.Points=(MarkerPoint[])Points.Clone();return c;}
    }
    [DataContract] public sealed class Reading
    {
        [DataMember]public double At,Speed;
        [DataMember]public MarkerPoint Position,Velocity,Rotation,PlayerPosition,PlayerVelocity;
        [DataMember]public Identity Bike,Rider;
        [DataMember]public bool Mounted,EngineOn,Collision,TaskFailed,Interrupted;
        [DataMember]public string Simulation="UNDETERMINED",Interference="UNKNOWN",TaskState="unavailable",Domain;
        [DataMember]public int? Gear;
        [DataMember]public double? RawRpm;
        public Reading Copy(){return (Reading)MemberwiseClone();}
    }
    [DataContract] public sealed class SpeedPoint
    {
        [DataMember]public Reading Observation;
        [DataMember]public double DistanceToMarker,SampledPathLength,RouteProgress,Deviation;
        [DataMember]public double? Acceleration,RadialVelocity;
        [DataMember]public MarkerPoint ListenerOffset,RelativeVelocity;
        [DataMember]public string RpmStatus="unavailable",RpmReason="RPH getter dynamic validity not established";
        [DataMember]public bool Gap;
    }
    [DataContract]public sealed class Upgrade
    {
        [DataMember]public int Category,Count;
        [DataMember]public int? Requested,Observed;
        [DataMember]public string Status;
    }
    [DataContract]public sealed class RunRecord
    {
        [DataMember]public int Version=1,MarkerRevision;
        [DataMember]public string Domain,Session,GameVersion="1.0.1158.16",RphVersion="1.132.1428.17748",Units="uncalibrated-native-units-per-second",MarkerFingerprint,RouteRevision,Outcome,Stage,Reason,Cleanup;
        [DataMember]public MarkerPoint Listener;
        [DataMember]public Identity Bike,Rider;
        [DataMember]public Policy Settings;
        [DataMember]public Upgrade[] Upgrades;
        [DataMember]public SpeedPoint[] Samples;
        [DataMember]public string[] Lifecycle;
        [DataMember]public SpeedSummary Summary;
        [DataMember]public double? FailureAt;
        [DataMember]public bool FullThrottleProven=false,MechanicalTopSpeedProven=false,LiveStartSupported=false;
    }
}
