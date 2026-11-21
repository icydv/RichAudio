using System;
using System.Collections.Generic;
using System.Linq;
using RichAudio.MarkerResearch;

namespace RichAudio.BatiResearch
{
    public enum Capability {Unknown,Unsupported,Supported}
    // All operations consume the original copied creation identity, never a bare handle.
    public interface IBenchmarkWorld
    {
        Identity CreateBike(MarkerPoint start,string session,string creation);
        Identity CreateRider(Identity bike,string session,string creation);
        bool UnresolvedCreation {get;}
        Presence Inspect(Identity entity);
        bool Persistent(Identity entity);
        void InstallKit(Identity bike);
        bool KitVerified(Identity bike);
        int ModCount(Identity bike,int category);
        void SetMod(Identity bike,int category,int index);
        int ReadMod(Identity bike,int category);
        Capability TurboSupport(Identity bike);
        void EnableTurbo(Identity bike);
        bool ReadTurbo(Identity bike);
        bool Mounted(Identity rider,Identity bike);
        void Drive(Identity rider,Identity bike,MarkerPoint destination,double requestedSpeed);
        void StopOwnedTask(Identity rider);
        void DeleteOwned(Identity entity);
    }
    public sealed class StockTuning
    {
        private readonly List<Upgrade> receipt=new List<Upgrade>();
        public Upgrade[] Snapshot(){return receipt.Select(u=>new Upgrade{Category=u.Category,Count=u.Count,Requested=u.Requested,Observed=u.Observed,Status=u.Status}).ToArray();}
        public bool Apply(IBenchmarkWorld world,Identity bike)
        {
            Check.That(receipt.Count==0,"no tuning retry");Owned(world,bike);world.InstallKit(bike);Check.That(world.KitVerified(bike),"mod kit readback failed");
            foreach(int category in new[]{11,13,12,15}){
                Owned(world,bike);int count=world.ModCount(bike,category);Check.That(count>=0&&count<=128,"mod count invalid");
                var u=new Upgrade{Category=category,Count=count,Status=count==0?"UNSUPPORTED":"REQUESTED"};receipt.Add(u);
                if(count==0)continue;u.Requested=count-1;Owned(world,bike);world.SetMod(bike,category,count-1);Owned(world,bike);u.Observed=world.ReadMod(bike,category);u.Status=u.Observed==u.Requested?"VERIFIED":"READBACK_MISMATCH";if(u.Status!="VERIFIED")return false;
            }
            Owned(world,bike);var support=world.TurboSupport(bike);var turbo=new Upgrade{Category=18,Count=0,Status=support==Capability.Unsupported?"UNSUPPORTED":"UNVERIFIED_SUPPORT"};receipt.Add(turbo);
            if(support==Capability.Unknown)return false;if(support==Capability.Unsupported)return true;
            turbo.Requested=1;Owned(world,bike);world.EnableTurbo(bike);Owned(world,bike);turbo.Observed=world.ReadTurbo(bike)?1:0;turbo.Status=turbo.Observed==1?"VERIFIED":"READBACK_MISMATCH";return turbo.Status=="VERIFIED";
        }
        private static void Owned(IBenchmarkWorld w,Identity id){Check.That(id.Valid&&id.Model==Controller.BatiModel&&w.Inspect(id)==Presence.Present,"Bati ownership uncertain before tuning");}
    }
    public sealed class Controller
    {
        public const uint BatiModel=0xF9300CC5;
        private readonly MarkerSet markers;private readonly Policy p;private readonly IBenchmarkWorld world;private readonly string session;
        private RouteEvidence route;private Identity bike,rider;private readonly StockTuning tuning=new StockTuning();private readonly List<string> events=new List<string>();private readonly SpeedAnalysis analysis;
        private bool attempted,armed;private int checkpoint=1;private double began,lastProgressAt,lastProgress;private double? failureAt;private string outcome="NOT RUN",reason="",cleanup="not required";
        public Stage State {get;private set;}
        public Controller(MarkerSet m,Policy settings,IBenchmarkWorld operations,string runSession){Check.That(m!=null&&operations!=null&&!string.IsNullOrEmpty(runSession)&&runSession.Length<=64,"controller inputs");settings.Validate();markers=m;p=settings.Copy();world=operations;session=runSession;analysis=new SpeedAnalysis(p,markers.Listener);State=Stage.MarkersLoaded;events.Add("historical markers loaded; route remains UNKNOWN");}
        public void Prepare(RouteEvidence evidence){Check.That(State==Stage.MarkersLoaded&&!attempted,"prepare state");Check.That(evidence!=null,"route evidence missing");evidence.Validate(markers,session);route=evidence.Copy();State=Stage.Ready;events.Add("synthetic route readiness only; no launch approval");}
        public void Arm(bool explicitApproval){Check.That(State==Stage.Ready&&explicitApproval&&!attempted,"explicit separate approval required");armed=true;events.Add("synthetic attempt armed");}
        public bool Start(double at)
        {
            Check.That(State==Stage.Ready&&armed&&!attempted&&Check.Finite(at)&&at>=0&&at<=86280,"one approved attempt only");attempted=true;began=at;lastProgressAt=at;
            try{
                State=Stage.SpawnRequested;events.Add("vehicle creation requested");bike=world.CreateBike(markers.Start,session,"bike-v1");Check.That(bike.Valid&&bike.Model==BatiModel&&bike.Session==session&&bike.Creation=="bike-v1"&&world.Inspect(bike)==Presence.Present&&world.Persistent(bike),"vehicle creation/persistence not verified");State=Stage.VehicleVerified;
                Check.That(tuning.Apply(world,bike),"stock tuning partial or unverified");State=Stage.TuningApplied;events.Add("stock upgrades read back; unsupported categories explicit");
                rider=world.CreateRider(bike,session,"rider-v1");Check.That(rider.Valid&&rider.Session==session&&rider.Creation=="rider-v1"&&rider.Handle!=bike.Handle&&world.Inspect(rider)==Presence.Present&&world.Persistent(rider)&&world.Mounted(rider,bike),"rider creation/mount/persistence not verified");State=Stage.RiderVerified;State=Stage.Armed;events.Add("awaiting measured stationary starting sample");return true;
            }catch(Exception e){failureAt=at;Fail(e.Message);return false;}
        }
        public void Observe(Reading input)
        {
            if(State!=Stage.Armed&&State!=Stage.Accelerating&&State!=Stage.Traversing)return;
            try{
                Check.That(input!=null,"missing observation; disappearance not established");var r=input.Copy();
                Check.That(Check.Finite(r.At)&&r.At>=began&&r.At-began<=p.MaxRunSeconds,"run timeout/clock");
                Check.That(r.Domain==markers.Domain&&r.Bike.Same(bike)&&r.Rider.Same(rider)&&world.Inspect(bike)==Presence.Present&&world.Inspect(rider)==Presence.Present,"identity lost/ambiguous");
                Check.That(r.Mounted,"rider detached");Check.That(!r.Collision,"collision observed");Check.That(!r.TaskFailed,"AI task failed");Check.That(!r.Interrupted,"world/game interruption");Check.That(r.EngineOn,"engine not running");
                Check.That(r.Simulation=="OBSERVED_CONTIGUOUS"&&r.Interference=="NONE_OBSERVED_COMPLETE_COVERAGE","simulation/interference unresolved");
                Check.That(Check.Distance(r.PlayerPosition,markers.Listener)<=p.ListenerTolerance&&Check.Length(r.PlayerVelocity)<=.25,"fixed listener moved");
                double progress,deviation;Project(r.Position,out progress,out deviation);Check.That(deviation<=p.DeviationTolerance,"route deviation");Check.That(progress>=lastProgress-1,"reverse progress");
                if(State==Stage.Armed)Check.That(Check.Distance(r.Position,markers.Start)<=p.StartTolerance&&r.Speed<=p.StartSpeed,"starting condition not stationary at marker");
                var sample=analysis.Add(r,progress,deviation);Check.That(!sample.Gap,"telemetry stale; no despawn inference");
                if(State==Stage.Armed){world.Drive(rider,bike,route.Points[route.Points.Length-1],p.RequestedTaskSpeed);State=Stage.Accelerating;events.Add("high-speed AI task requested; full throttle NOT PROVEN");}
                if(progress>lastProgress+.25){lastProgress=progress;lastProgressAt=r.At;}
                Check.That(r.At-lastProgressAt<=p.StallSeconds,"stalled progression");
                if(Check.Distance(r.Position,route.Points[checkpoint])<=p.FinishRadius){checkpoint++;events.Add("observed checkpoint "+(checkpoint-1));}
                if(checkpoint==route.Points.Length){State=Stage.FinishReached;analysis.Finish();outcome="FINISH_REACHED; maximum speed not proven";State=Stage.Complete;reason="finish observed";BeginCleanup();}
                else if(analysis.Summary().SteadyCandidate)State=Stage.Traversing;
            }catch(Exception e){failureAt=input!=null&&Check.Finite(input.At)?(double?)input.At:null;Fail(e.Message);}
        }
        // Only the current explicitly surveyed segment is eligible; no nearest-road invention.
        private void Project(MarkerPoint point,out double progress,out double deviation)
        {
            Check.Point(point);var a=route.Points[checkpoint-1];var b=route.Points[checkpoint];var delta=Check.Sub(b,a);double length=Check.Length(delta),t=Check.Dot(Check.Sub(point,a),delta)/(length*length);double bounded=Math.Max(0,Math.Min(1,t));var closest=new MarkerPoint(a.X+delta.X*bounded,a.Y+delta.Y*bounded,a.Z+delta.Z*bounded);deviation=Check.Distance(point,closest);progress=0;for(int i=1;i<checkpoint;i++)progress+=Check.Distance(route.Points[i-1],route.Points[i]);progress+=bounded*length;
        }
        public void Missing(double at){if(State==Stage.Armed||State==Stage.Accelerating||State==Stage.Traversing){failureAt=Check.Finite(at)?(double?)at:null;Fail("missing sample at "+at.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+"; simulation unknown, not confirmed despawn");}}
        public void Tick(double at){if((State==Stage.Armed||State==Stage.Accelerating||State==Stage.Traversing)&&(!Check.Finite(at)||at-began>p.MaxRunSeconds)){failureAt=Check.Finite(at)?(double?)at:null;Fail("run timeout");}}
        private void Fail(string why){outcome="FAILED";reason=why;State=Stage.Failed;events.Add("failure: "+why);BeginCleanup();}
        public void Abort(){if(State==Stage.Cleaned||State==Stage.CleanupPending)return;outcome="STOPPED";reason="manual abort";State=Stage.Stopped;BeginCleanup();}
        private void BeginCleanup(){State=Stage.CleanupPending;cleanup="PENDING";Cleanup();}
        public void Cleanup()
        {
            Check.That(State==Stage.CleanupPending,"cleanup state");bool uncertain=world.UnresolvedCreation;
            // An ambiguous rider may still be attached to the bike. Stop all mutations,
            // rather than deleting the other apparently-owned entity underneath it.
            foreach(var id in new[]{rider,bike})if(id.Valid){try{Check.That(id.Session==session&&(id.Same(bike)&&id.Creation=="bike-v1"||id.Same(rider)&&id.Creation=="rider-v1"),"creation provenance ambiguous");var present=world.Inspect(id);if(present!=Presence.Present&&present!=Presence.Absent)uncertain=true;}catch{uncertain=true;}}
            if(uncertain){cleanup="UNRESOLVED; mutation withheld pending ownership review";events.Add("cleanup ownership/creation uncertainty; all mutation withheld");return;}
            foreach(var id in new[]{rider,bike}){if(!id.Valid)continue;try{
                Check.That(id.Session==session&&(id.Same(bike)&&id.Creation=="bike-v1"||id.Same(rider)&&id.Creation=="rider-v1"),"creation provenance ambiguous");
                var before=world.Inspect(id);if(before==Presence.Absent){events.Add("owned entity already absent");continue;}
                if(before!=Presence.Present){uncertain=true;events.Add("ownership uncertain; mutation withheld");break;}
                if(rider.Valid&&id.Same(rider)){world.StopOwnedTask(id);Check.That(world.Inspect(id)==Presence.Present,"identity changed after stopping task");}
                world.DeleteOwned(id);Check.That(world.Inspect(id)==Presence.Absent,"owned cleanup not independently absent");events.Add("owned entity deletion observed absent");
            }catch{uncertain=true;events.Add("cleanup exception; all remaining mutation withheld");break;}}
            cleanup=uncertain?"UNRESOLVED; manual review required":"VERIFIED_ABSENT";if(!uncertain)State=Stage.Cleaned;
        }
        public RunRecord Snapshot(){return new RunRecord{Domain=markers.Domain,Session=session,MarkerRevision=markers.Revision,MarkerFingerprint=markers.Fingerprint,RouteRevision=route==null?null:route.Revision,Listener=markers.Listener,Settings=p.Copy(),Bike=bike,Rider=rider,Stage=State.ToString(),Outcome=outcome,Reason=reason,Cleanup=cleanup,Upgrades=tuning.Snapshot(),Samples=analysis.Snapshot(),Summary=analysis.Summary(),Lifecycle=events.ToArray(),FailureAt=failureAt};}
        public string[] Display(){var s=analysis.Summary();var samples=analysis.Snapshot();var last=samples.Length==0?null:samples[samples.Length-1];return new[]{"RICHAUDIO BATI | "+State+" | "+outcome,"Bike/rider identity: "+(State==Stage.Cleaned?"CLEANED":reason.Contains("identity")?"UNKNOWN":bike.Valid&&rider.Valid?"last verified creation/observation":"NOT VERIFIED"),"Stock tuning: "+(tuning.Snapshot().Any(u=>u.Status!="VERIFIED"&&u.Status!="UNSUPPORTED")?"PARTIAL":tuning.Snapshot().Length==5?"VERIFIED / unsupported categories explicit":"NOT TESTED"),"Measured speed: "+(s.FinalSpeed.HasValue?s.FinalSpeed.Value.ToString("F2"):"unavailable")+" native units/s | highest: "+(s.HighestObservedSpeed.HasValue?s.HighestObservedSpeed.Value.ToString("F2"):"unavailable"),"Acceleration estimate: "+(s.LastAcceleration.HasValue?s.LastAcceleration.Value.ToString("F2"):"unavailable"),"Listener distance / route progress: "+(last==null?"unavailable":last.DistanceToMarker.ToString("F2")+" / "+last.RouteProgress.ToString("F2")),"Traffic interference: "+(last==null?"UNKNOWN":last.Observation.Interference),"Tracking: "+(s.Gaps>0?"STALE":last==null?"UNKNOWN":"last copied observation; not physics certification"),"Steady-speed candidate: "+(s.SteadyCandidate?"MET (not maximum proof)":"NOT MET"),"Live start: BLOCKED | no runtime route producer"};}
    }
}
