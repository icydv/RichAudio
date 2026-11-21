// Original observation-only survey contracts. No game, audio or entity-mutating dependency.
using System;using System.Collections.Generic;using System.IO;using System.Linq;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;
using RichAudio.BatiResearch;using RichAudio.MarkerResearch;using RichAudio.GeometryResearch;
namespace RichAudio.AirportResearch
{
    public enum StopKind {Start,Mid1,Mid2,Mid3,Finish,Runout}
    [DataContract]public sealed class Pose
    {
        [DataMember]public MarkerPoint Position,Forward;
        [DataMember]public double AtMs,Speed;
        [DataMember]public uint Player;
        [DataMember]public int Generation,Interior;
        [DataMember]public bool OnFoot;
        public Pose Copy(){return (Pose)MemberwiseClone();}
    }
    [DataContract]public sealed class Ray
    {
        [DataMember]public int Order;[DataMember]public string Role;[DataMember]public Point3 Origin,End;
    }
    [DataContract]public sealed class Navigation
    {
        [DataMember]public bool? NodesLoaded;
        [DataMember]public double? TravelEstimate;
        [DataMember]public string Error,Classification="UNKNOWN",NearestNode="not queried; no pointer/layout assumptions";
        [DataMember]public int Calls;
    }
    [DataContract]public sealed class Occupant
    {
        [DataMember]public uint Handle,Model;[DataMember]public int ObservationSerial;
        [DataMember]public string Kind,FirstObservation="observed in survey, creation time unknown",IdentityEvidence="same sampled wrapper/handle/model; lifetime generation unavailable";
        [DataMember]public MarkerPoint Position,Velocity;
    }
    [DataContract]public sealed class Interference
    {
        [DataMember]public string Coverage="PARTIAL_STREAMED_POOL",Classification="UNKNOWN",Error;
        [DataMember]public int Enumerations,Enumerated,Examined,Omitted,ReadErrors;
        [DataMember]public double Radius=12,AtMs;
        [DataMember]public Occupant[] Nearby=new Occupant[0];
        [DataMember]public bool FutureClearance=false;
    }
    [DataContract]public sealed class Dimensions
    {
        [DataMember]public string Status="UNKNOWN",Source="RPH Model.GetDimensions; model bounds, not measured collision body";
        [DataMember]public MarkerPoint? Minimum,Maximum;
        [DataMember]public uint Model=0xF9300CC5;
    }
    [DataContract]public sealed class StopRecord
    {
        [DataMember]public int Revision,PlannedCalls,ActualCalls,SkippedCalls;
        [DataMember]public string Kind,Completion="CLAIMED",Reason,Surface="UNKNOWN",BodyClearance="UNKNOWN",Coverage="UNKNOWN",Continuity="UNKNOWN";
        [DataMember]public Pose Player;
        [DataMember]public MarkerPoint Anchor;
        [DataMember]public MarkerPoint? ProposedSupportPoint;
        [DataMember]public bool CandidateOnly=true,ReplacesOriginalMarker=false;
        [DataMember]public double? MaximumSlopeDegrees,HeightSpread;[DataMember]public double FinishedMs;
        [DataMember]public List<Ray> Plan=new List<Ray>();
        [DataMember]public List<GeometryObservation> Observations=new List<GeometryObservation>();
        [DataMember]public Navigation Navigation=new Navigation();
        [DataMember]public Interference Interference=new Interference();
    }
    [DataContract]public sealed class SurveyRecord
    {
        [DataMember]public int Version=1,MarkerRevision,QueryLimit=36,ActualCalls,IntermediatePoints;
        [DataMember]public string Plan="airport-six-stops-v1",Session,Domain,GameVersion="1.0.1158.16",RphVersion="1.132.1428.17748",MarkerFingerprint,HistoricalMarkerSession,Units="uncalibrated-native-game-units",State="READY",Reason,RouteCoverage="UNKNOWN",Navigation="UNKNOWN",RouteContinuity="UNKNOWN",StoppingDistance="UNKNOWN";
        [DataMember]public MarkerPoint OriginalStart,OriginalFinish,OriginalListener;
        [DataMember]public StopRecord[] Stops;
        [DataMember]public bool OriginalMarkersUnchanged=true,BenchmarkStartSupported=false,RouteClear=false;
        [DataMember]public Dimensions Dimensions=new Dimensions();
    }
    public static class SurveyPlan
    {
        private static readonly int[] allocation={12,3,3,3,9,6};
        public static int Allocation(StopKind kind){Check.That(Enum.IsDefined(typeof(StopKind),kind),"stop kind");return allocation[(int)kind];}
        public static Point3 P(MarkerPoint p){return new Point3(p.X,p.Y,p.Z);}
        public static MarkerPoint M(Point3 p){return new MarkerPoint(p.X,p.Y,p.Z);}
        public static void ValidatePose(Pose p){Check.That(p!=null&&p.Position.Valid&&p.Forward.Valid&&Check.Finite(p.AtMs)&&p.AtMs>=0&&p.AtMs<=1200000&&p.OnFoot&&p.Interior==0&&p.Player!=0&&p.Generation>=0&&Check.Finite(p.Speed)&&p.Speed>=0&&p.Speed<=.25,"stationary exterior on-foot pose required");Check.That(Math.Sqrt(p.Forward.X*p.Forward.X+p.Forward.Y*p.Forward.Y)>=.5,"horizontal orientation unavailable");}
        private static Point3 Offset(MarkerPoint c,MarkerPoint forward,double side,double along,double z){double n=Math.Sqrt(forward.X*forward.X+forward.Y*forward.Y),fx=forward.X/n,fy=forward.Y/n;return new Point3(c.X+side*fy+along*fx,c.Y-side*fx+along*fy,c.Z+z);}
        public static Ray[] Ground(StopKind kind,MarkerPoint anchor,MarkerPoint forward)
        {
            Check.That(Enum.IsDefined(typeof(StopKind),kind),"stop kind");var rays=new List<Ray>();int rows=kind==StopKind.Start||kind==StopKind.Finish?3:kind==StopKind.Runout?2:1;
            for(int row=0;row<rows;row++)for(int col=0;col<3;col++){
                double along=rows==3?(row-1)*.75:rows==2?(row-.5)*1.5:0;
                var a=Offset(anchor,forward,(col-1)*.75,along,2);var b=Offset(anchor,forward,(col-1)*.75,along,-4);Check.That(a.Finite&&b.Finite,"ray bounds");
                rays.Add(new Ray{Order=rays.Count,Role="ground-probe",Origin=a,End=b});
            }return rays.ToArray();
        }
        public static Ray[] Body(MarkerPoint support,MarkerPoint forward)
        {
            var rays=new List<Ray>();for(int i=0;i<3;i++){double side=i<2?1.5:0,along=i==2?2:0,z=i==0?.5:i==1?1:1.5;var a=Offset(support,forward,-side,-along,z);var b=Offset(support,forward,side,along,z);Check.That(a.Finite&&b.Finite,"body probe bounds");rays.Add(new Ray{Order=9+i,Role="limited-body-line-probe",Origin=a,End=b});}return rays.ToArray();
        }
        public static void Assess(StopRecord r)
        {
            var ground=r.Observations.TakeWhile(o=>o.QueryProvenance=="airport-ground-probe-v1").ToArray();
            if(ground.Length==0){r.Surface="UNKNOWN";return;}
            var hits=ground.Where(o=>o.Completion=="hit"&&ObservationRules.Validate(o).SurfaceValid).ToArray();
            if(hits.Length!=ground.Length){r.Surface="UNKNOWN_MISSING_SUPPORT";r.Coverage="PARTIAL";return;}
            double slope=hits.Max(o=>Math.Acos(Math.Max(-1,Math.Min(1,o.HitNormal.Value.Z/o.HitNormal.Value.Length)))*180/Math.PI),spread=hits.Max(o=>o.HitPosition.Value.Z)-hits.Min(o=>o.HitPosition.Value.Z);r.MaximumSlopeDegrees=slope;r.HeightSpread=spread;
            r.Surface=slope>10||spread>.15?"UNSUITABLE_FOR_DECLARED_FLAT_SCREEN":"PARTIAL_SAMPLED_SUPPORT";
            int center=r.Kind=="Start"||r.Kind=="Finish"?4:1;if(center<ground.Length&&ground[center].Completion=="hit")r.ProposedSupportPoint=SurveyPlan.M(ground[center].HitPosition.Value);
            r.BodyClearance=r.Observations.Count==ground.Length?"UNKNOWN_NOT_PROBED":r.Observations.Skip(ground.Length).Any(o=>o.Completion=="hit")?"OBSTRUCTION_ON_PROBED_LINE":"PARTIAL_LINES_ONLY_NOT_BODY_VOLUME";r.Coverage="PARTIAL";
        }
        public static string ClassifyNavigation(Navigation n){if(n==null||n.Error!=null||n.NodesLoaded!=true||!n.TravelEstimate.HasValue||!Check.Finite(n.TravelEstimate.Value)||n.TravelEstimate.Value<0||n.TravelEstimate.Value>=100000)return "UNKNOWN";return "NAVIGATION_ESTIMATE_CANDIDATE_ONLY";}
        public static string ClassifyInterference(Interference i,double now)
        {
            if(i==null||!Check.Finite(i.AtMs)||now<i.AtMs||now-i.AtMs>1000||i.Error!=null)return "UNKNOWN";
            return i.Nearby!=null&&i.Nearby.Length>0?"POTENTIAL_OBSTRUCTION_IN_LOCAL_SCOPE":"PARTIALLY_OBSERVED_NO_OCCUPANCY_RETURNED";
        }
    }
    public sealed class Survey
    {
        private readonly MarkerSet markers;private readonly SurveyRecord record;private readonly List<StopRecord> stops=new List<StopRecord>();private StopRecord active;private double last=-1;private uint player;private int generation;private bool terminal,dimensionsSet;private Ray claimed;
        public Survey(MarkerSet m,string session){Check.That(m!=null&&!string.IsNullOrEmpty(session)&&session.Length<=64,"survey provenance");markers=m;record=new SurveyRecord{Session=session,Domain=m.Domain,MarkerFingerprint=m.Fingerprint,HistoricalMarkerSession=m.Session,MarkerRevision=m.Revision,OriginalStart=m.Start,OriginalFinish=m.Finish,OriginalListener=m.Listener};}
        public int Calls {get{return record.ActualCalls;}}
        public bool Terminal {get{return terminal;}}
        public void SetDimensions(Dimensions d){Check.That(!dimensionsSet&&stops.Count==0&&d!=null,"one initial dimension record");if(d.Status=="OBSERVED_MODEL_BOUNDS"){Check.That(d.Model==0xF9300CC5&&d.Minimum.HasValue&&d.Maximum.HasValue&&d.Minimum.Value.Valid&&d.Maximum.Value.Valid,"invalid dimensions");var v=Check.Sub(d.Maximum.Value,d.Minimum.Value);Check.That(v.X>0&&v.Y>0&&v.Z>0&&Check.Length(v)<=20,"dimension screen");}record.Dimensions=Clone(d);dimensionsSet=true;}
        public StopRecord Begin(StopKind kind,Pose pose)
        {
            Check.That(!terminal&&active==null&&stops.Count<6&&(int)kind==stops.Count,"fixed order; no repeated stops");
            try{SurveyPlan.ValidatePose(pose);Check.That(pose.AtMs>last,"observation time order");if(player!=0)Check.That(player==pose.Player&&generation==pose.Generation,"player generation changed");
                MarkerPoint anchor=kind==StopKind.Start?markers.Start:kind==StopKind.Finish?markers.Finish:pose.Position;
                if(kind==StopKind.Start||kind==StopKind.Finish)Check.That(Math.Sqrt(Math.Pow(anchor.X-pose.Position.X,2)+Math.Pow(anchor.Y-pose.Position.Y,2))<=3,"visit original endpoint on foot");
                Check.That(Check.Distance(anchor,markers.Start)<=2000&&Check.Distance(anchor,markers.Finish)<=2000,"bounded manual survey area");
                active=new StopRecord{Kind=kind.ToString(),Revision=stops.Count+1,PlannedCalls=SurveyPlan.Allocation(kind),Player=pose.Copy(),Anchor=anchor};active.Plan.AddRange(SurveyPlan.Ground(kind,anchor,pose.Forward));stops.Add(active);last=pose.AtMs;player=pose.Player;generation=pose.Generation;record.State="ACQUIRING";return Clone(active);
            }catch{Stop("invalid initial stop setup; no retry");throw;}
        }
        public Ray ClaimRay(Pose current)
        {
            try{Check.That(!terminal&&active!=null&&claimed==null&&record.ActualCalls<36,"query permission closed");SurveyPlan.ValidatePose(current);Check.That(current.Player==player&&current.Generation==generation&&Check.Distance(current.Position,active.Player.Position)<=.05&&current.AtMs>=active.Player.AtMs&&current.AtMs-active.Player.AtMs<=2500,"stationary timed acquisition guard");
            Check.That(active.ActualCalls<active.Plan.Count,"no planned read");claimed=Clone(active.Plan[active.ActualCalls]);active.ActualCalls++;record.ActualCalls++;return Clone(claimed);}catch{Stop("query permission/setup failure; no retry");throw;}
        }
        public void Accept(GeometryObservation observation)
        {
            try{Check.That(!terminal&&active!=null&&claimed!=null&&observation!=null,"no claimed query/observation");var o=Clone(observation);active.Observations.Add(o);var expected=claimed;claimed=null;
            var valid=ObservationRules.Validate(o);Check.That(o.SessionId==record.Session&&o.QueryProvenance==(expected.Role=="ground-probe"?"airport-ground-probe-v1":"airport-body-line-v1")&&o.Origin.HasValue&&o.End.HasValue&&Point3.Sub(o.Origin.Value,expected.Origin).Length<=1e-3&&Point3.Sub(o.End.Value,expected.End).Length<=1e-3&&o.IgnoredPlayerHandle==player&&o.ObservedAtMs>=active.Player.AtMs&&o.ObservedAtMs-active.Player.AtMs<=2500&&valid.RecordValid&&(o.Completion!="hit"||valid.SurfaceValid),"invalid trace evidence; no retry");
            if(active.Kind=="Start"&&active.Observations.Count==9){var center=active.Observations[4];if(center.Completion=="hit")active.Plan.AddRange(SurveyPlan.Body(SurveyPlan.M(center.HitPosition.Value),active.Player.Forward));else active.SkippedCalls=3;}}catch{Stop("invalid trace evidence; no retry");throw;}
        }
        public StopRecord Complete(Navigation navigation,Interference interference,double now)
        {
            try{Check.That(!terminal&&active!=null&&claimed==null&&active.ActualCalls==active.Plan.Count,"incomplete stop");Check.That(Check.Finite(now)&&now>=active.Player.AtMs&&now-active.Player.AtMs<=5000&&navigation!=null&&navigation.Calls>=0&&navigation.Calls<=2&&interference!=null&&interference.Enumerations>=0&&interference.Enumerations<=3&&interference.Nearby!=null&&interference.Nearby.Length<=64,"bounded auxiliary observation");
            Check.That(!interference.FutureClearance&&interference.Coverage=="PARTIAL_STREAMED_POOL"&&interference.Radius==12&&interference.Nearby.All(e=>e!=null&&e.Handle!=0&&e.Model!=0&&e.Position.Valid&&e.Velocity.Valid),"unsupported interference evidence");
            active.Navigation=Clone(navigation);active.Navigation.Classification=SurveyPlan.ClassifyNavigation(navigation);active.Interference=Clone(interference);active.Interference.Classification=SurveyPlan.ClassifyInterference(interference,now);active.FinishedMs=now;active.Completion="COMPLETE_WITH_UNKNOWNS";SurveyPlan.Assess(active);var result=Clone(active);active=null;record.State=stops.Count==6?"SURVEY_RECORDED_NOT_CERTIFIED":"READY_FOR_NEXT_STOP";return result;}catch{Stop("auxiliary/stop completion failure; no retry");throw;}
        }
        public void Stop(string reason){if(terminal)return;terminal=true;record.State="STOPPED";record.Reason=reason;if(active!=null){active.Completion="STOPPED";active.Reason=reason;SurveyPlan.Assess(active);active=null;}claimed=null;}
        public SurveyRecord Snapshot(){record.ActualCalls=Calls;record.Stops=stops.Select(Clone).ToArray();record.IntermediatePoints=stops.Count(s=>s.Kind.StartsWith("Mid")&&s.Completion=="COMPLETE_WITH_UNKNOWNS");return Clone(record);}
        public string[] Hud(){var r=Snapshot();var start=r.Stops.FirstOrDefault(s=>s.Kind=="Start");var finish=r.Stops.FirstOrDefault(s=>s.Kind=="Finish");return new[]{"RICHAUDIO AIRPORT SURVEY | "+r.State,"Historical START / FINISH / LISTENER: recorded, unchanged","Intermediate points: "+r.IntermediatePoints+" / 3 | queries "+r.ActualCalls+" / 36","Start: "+(start==null?"UNKNOWN":start.Surface)+" | finish: "+(finish==null?"UNKNOWN":finish.Surface),"Navigation candidates only | continuity UNKNOWN | stopping UNKNOWN","Obstacle coverage PARTIAL / UNKNOWN | no traffic suppression","Benchmark launch: BLOCKED | Show/Hide/Replay do not acquire"};}
        public static T Clone<T>(T value){using(var b=new MemoryStream()){var s=new DataContractJsonSerializer(typeof(T));s.WriteObject(b,value);Check.That(b.Length<=2097152,"survey record size bound");b.Position=0;return (T)s.ReadObject(b);}}
    }
    public static class SurveyPersistence
    {
        public static void Save<T>(string file,T value){PrivateFiles.RequireLocal(file);string partial=file+".partial";using(var b=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(b,value);Check.That(b.Length<=2097152,"survey bytes bound");using(var f=new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None)){b.Position=0;b.CopyTo(f);f.Flush(true);}}File.Move(partial,file);}
    }
    public static class CleanupReview
    {
        public static string Assess(Identity created,Identity? current,bool? nativeExists,bool wrapperValid,bool poolOmitted,bool authoritativeSyntheticAbsence)
        {
            if(!created.Valid||current.HasValue&&!created.Same(current.Value))return "AMBIGUOUS_IDENTITY_NO_MUTATION";
            if(nativeExists==false&&wrapperValid)return "CONTRADICTORY_NO_MUTATION";
            if(current.HasValue||nativeExists==true||wrapperValid)return "PRESENT_OR_POSSIBLY_REUSED_NO_DELETE_PROOF";
            if(poolOmitted)return "UNKNOWN_INCOMPLETE_POOL";
            return authoritativeSyntheticAbsence?"ABSENT_IN_ORIGINAL_SYNTHETIC_REGISTRY_ONLY":"UNKNOWN_RUNTIME_ABSENCE_NOT_PROVEN";
        }
    }
}
