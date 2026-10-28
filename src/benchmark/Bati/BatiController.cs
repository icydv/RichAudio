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
        void InstallKit(Identity bike,int selection);
        int? ReadKit(Identity bike);
        int? AvailableKits(Identity bike);
        int ModCount(Identity bike,int category);
        void SetMod(Identity bike,int category,int index);
        int ReadMod(Identity bike,int category);
        Capability TurboSupport(Identity bike);
        void EnableTurbo(Identity bike);
        bool ReadTurbo(Identity bike);
        bool Mounted(Identity rider,Identity bike);
        void Drive(Identity rider,Identity bike,MarkerPoint destination,double requestedSpeed);
        void Brake(Identity rider,Identity bike,int durationMs);
        void StopOwnedTask(Identity rider);
        void DeleteOwned(Identity entity);
    }
    public sealed class StockTuning
    {
        private readonly List<Upgrade> receipt=new List<Upgrade>();
        private readonly ModKitDiagnostic kit=new ModKitDiagnostic();private bool attempted;
        public ModKitDiagnostic KitSnapshot(){return kit.Copy();}
        public Upgrade[] Snapshot(){return receipt.Select(u=>new Upgrade{Category=u.Category,Count=u.Count,Requested=u.Requested,Observed=u.Observed,Status=u.Status,RequestReturnedNormally=u.RequestReturnedNormally}).ToArray();}
        public bool Apply(IBenchmarkWorld world,Identity bike,bool reviewedToggleAttempt=false)
        {
            Check.That(!attempted,"no tuning retry");attempted=true;kit.VehicleModel=bike.Valid?(uint?)bike.Model:null;
            try{Owned(world,bike);kit.Ownership="OWNED_BATI_VERIFIED";}catch{kit.Ownership="NOT_VERIFIED";return Fail("ownership before kit request");}
            if(!Read(world,bike,()=>world.ReadKit(bike),kit.Before))return Fail("kit getter before request "+kit.Before.Status);
            try{Owned(world,bike);kit.RequestIssued=true;world.InstallKit(bike,kit.RequestedSelection);kit.InstallerReturnedNormally=true;Owned(world,bike);}catch(Exception e){if(kit.RequestIssued&&!kit.InstallerReturnedNormally.HasValue)kit.InstallerReturnedNormally=false;kit.InstallerExceptionType=e.GetType().Name;return Fail("installer or ownership failure");}
            if(!Read(world,bike,()=>world.ReadKit(bike),kit.After))return Fail("kit getter after request "+kit.After.Status);
            kit.Indication=ModKitDiagnostic.Classify(kit.After.Raw.Value);
            if(kit.Indication!="RAW_INDEX_SEMANTICS_UNKNOWN")return Fail("kit indication "+kit.Indication);
            if(!Read(world,bike,()=>world.AvailableKits(bike),kit.AvailableKitCount))return Fail("available kit count "+kit.AvailableKitCount.Status);
            if(kit.AvailableKitCount.Raw.Value<=0)return Fail("no positive available kit count");
            // A raw index is still UNKNOWN. Only functional indexed readback can confirm tuning.
            try{
            foreach(int category in new[]{11,13,12,15}){
                Owned(world,bike);int count=world.ModCount(bike,category);Owned(world,bike);Check.That(count>=0&&count<=128,"mod count invalid");
                var u=new Upgrade{Category=category,Count=count,Status=count==0?"UNSUPPORTED":"REQUESTED"};receipt.Add(u);
                if(count==0)continue;u.Requested=count-1;Owned(world,bike);world.SetMod(bike,category,count-1);u.RequestReturnedNormally=true;Owned(world,bike);u.Observed=world.ReadMod(bike,category);Owned(world,bike);u.Status=u.Observed==u.Requested?"VERIFIED":"READBACK_MISMATCH";if(u.Status!="VERIFIED")return Fail("indexed readback mismatch category "+category);kit.VerifiedIndexedCategories++;
            }
            if(kit.VerifiedIndexedCategories==0)return Fail("all indexed categories unsupported; setup unproven");
            Owned(world,bike);var support=world.TurboSupport(bike);var turbo=new Upgrade{Category=18,Count=0,Status=support==Capability.Unsupported?"UNSUPPORTED":"UNVERIFIED_SUPPORT"};receipt.Add(turbo);
            if(support==Capability.Unknown&&!reviewedToggleAttempt)return Fail("turbo support unknown");if(support==Capability.Unsupported)return Verified();
            turbo.Requested=1;Owned(world,bike);world.EnableTurbo(bike);turbo.RequestReturnedNormally=true;Owned(world,bike);turbo.Observed=world.ReadTurbo(bike)?1:0;Owned(world,bike);turbo.Status=turbo.Observed==1?(support==Capability.Unknown?"ENABLED_READBACK_SUPPORT_EFFECT_UNVERIFIED":"VERIFIED"):"READBACK_MISMATCH";return turbo.Observed==1?Verified():Fail("turbo readback mismatch");
            }catch(Exception e){foreach(var u in receipt)if(u.Status=="REQUESTED")u.Status="INCOMPLETE_EXCEPTION";return Fail("category/toggle exception: "+e.GetType().Name);}
        }
        private bool Fail(string reason){kit.Verification="FAILED";kit.Reason=reason;return false;}
        private bool Verified(){kit.Verification="VERIFIED_BY_INDEXED_READBACK";kit.Reason="all available indexed categories match; global kit identity remains UNKNOWN";return true;}
        private bool Read(IBenchmarkWorld w,Identity id,Func<int?> get,NativeIntegerObservation result)
        {
            try{Owned(w,id);result.Raw=get();if(result.Raw.HasValue)result.Hex="0x"+unchecked((uint)result.Raw.Value).ToString("X8",System.Globalization.CultureInfo.InvariantCulture);Owned(w,id);result.Status=result.Raw.HasValue?"RETURNED":"UNAVAILABLE";return result.Raw.HasValue;}
            catch(Exception e){result.Status="EXCEPTION_OR_OWNERSHIP_FAILURE";result.ExceptionType=e.GetType().Name;return false;}
        }
        private void Owned(IBenchmarkWorld w,Identity id){try{Check.That(id.Valid&&id.Model==Controller.BatiModel&&w.Inspect(id)==Presence.Present,"Bati ownership uncertain before tuning");kit.Ownership="OWNED_BATI_VERIFIED";}catch{kit.Ownership="UNKNOWN_OR_LOST";throw;}}
    }
    public sealed class Controller
    {
        public const uint BatiModel=0xF9300CC5;
        private readonly MarkerSet markers;private readonly Policy p;private readonly IBenchmarkWorld world;private readonly string session;
        private RouteEvidence route;private Identity bike,rider;private readonly StockTuning tuning=new StockTuning();private readonly List<string> events=new List<string>();private readonly SpeedAnalysis analysis;
        private bool attempted,armed;private int checkpoint=1,taskCheckpoint=1;private double began,lastProgressAt,lastProgress;private double? failureAt;private string outcome="NOT RUN",reason="",cleanup="not required";
        private readonly StoppingSummary stopping=new StoppingSummary();private Reading lastStopping;
        public Stage State {get;private set;}
        public Identity BikeIdentity {get{return bike;}}public Identity RiderIdentity {get{return rider;}}
        public int CurrentCheckpointIndex {get{return route==null?1:Math.Min(checkpoint,route.Points.Length-1);}}
        public Controller(MarkerSet m,Policy settings,IBenchmarkWorld operations,string runSession){Check.That(m!=null&&operations!=null&&!string.IsNullOrEmpty(runSession)&&runSession.Length<=64,"controller inputs");settings.Validate();markers=m;p=settings.Copy();world=operations;session=runSession;analysis=new SpeedAnalysis(p,markers.Listener);State=Stage.MarkersLoaded;events.Add("historical markers loaded; route remains UNKNOWN");}
        public void Prepare(RouteEvidence evidence){Check.That(State==Stage.MarkersLoaded&&!attempted,"prepare state");Check.That(evidence!=null,"route evidence missing");evidence.Validate(markers,session);route=evidence.Copy();State=Stage.Ready;events.Add(route.BoundedResearch?"five-stop candidate plus current scoped preflight; continuous clearance remains UNKNOWN; no RUNOUT required":"synthetic route readiness only; no launch approval");}
        public void Arm(bool explicitApproval){Check.That(State==Stage.Ready&&explicitApproval&&!attempted,"explicit separate approval required");armed=true;events.Add("separately approved attempt armed");}
        public bool Start(double at)
        {
            Check.That(State==Stage.Ready&&armed&&!attempted&&Check.Finite(at)&&at>=0&&at<=86280,"one approved attempt only");attempted=true;began=at;lastProgressAt=at;
            try{
                State=Stage.SpawnRequested;events.Add("vehicle creation requested");bike=world.CreateBike(markers.Start,session,"bike-v1");Check.That(bike.Valid&&bike.Model==BatiModel&&bike.Session==session&&bike.Creation=="bike-v1"&&world.Inspect(bike)==Presence.Present&&world.Persistent(bike),"vehicle creation/persistence not verified");State=Stage.VehicleVerified;
                Check.That(tuning.Apply(world,bike,route.BoundedResearch),"stock tuning failed: "+tuning.KitSnapshot().Reason);State=Stage.TuningApplied;events.Add("stock upgrades read back; unsupported categories and unverified turbo effect explicit");
                rider=world.CreateRider(bike,session,"rider-v1");Check.That(rider.Valid&&rider.Session==session&&rider.Creation=="rider-v1"&&rider.Handle!=bike.Handle&&world.Inspect(rider)==Presence.Present&&world.Persistent(rider)&&world.Mounted(rider,bike),"rider creation/mount/persistence not verified");State=Stage.RiderVerified;State=Stage.Armed;events.Add("awaiting measured stationary starting sample");return true;
            }catch(Exception e){failureAt=at;Fail(e.Message);return false;}
        }
        public void Observe(Reading input)
        {
            if(State!=Stage.Armed&&State!=Stage.Accelerating&&State!=Stage.Traversing&&State!=Stage.Stopping)return;
            try{
                Check.That(input!=null,"missing observation; disappearance not established");var r=input.Copy();
                Check.That(Check.Finite(r.At)&&r.At>=began&&r.At-began<=p.MaxRunSeconds,"run timeout/clock");
                Check.That(r.Domain==markers.Domain&&r.Bike.Same(bike)&&r.Rider.Same(rider)&&world.Inspect(bike)==Presence.Present&&world.Inspect(rider)==Presence.Present,"identity lost/ambiguous");
                Check.That(r.Mounted,"rider detached");Check.That(!r.Collision,"collision observed");Check.That(!r.TaskFailed,"AI task failed");Check.That(!r.Interrupted,"world/game interruption");Check.That(r.EngineOn,"engine not running");
                Check.That(r.Simulation=="OBSERVED_CONTIGUOUS"&&(r.Interference=="NONE_OBSERVED_COMPLETE_COVERAGE"||route.BoundedResearch&&r.Interference=="NONE_OBSERVED_IN_MONITORED_SCOPE"),"simulation/interference unresolved");
                Check.That(Check.Distance(r.PlayerPosition,markers.Listener)<=p.ListenerTolerance&&Check.Length(r.PlayerVelocity)<=.25,"fixed listener moved");
                double progress,deviation;Project(r.Position,out progress,out deviation);Check.That(deviation<=p.DeviationTolerance,"route deviation");Check.That(progress>=lastProgress-1,"reverse progress");
                if(State==Stage.Armed)Check.That(Check.Distance(r.Position,markers.Start)<=p.StartTolerance&&r.Speed<=p.StartSpeed,"starting condition not stationary at marker");
                var sample=analysis.Add(r,progress,deviation);Check.That(!sample.Gap,"telemetry stale; no despawn inference");
                if(State==Stage.Stopping){ObserveStopping(r);return;}
                if(State==Stage.Armed){world.Drive(rider,bike,route.Points[taskCheckpoint],p.RequestedTaskSpeed);State=Stage.Accelerating;events.Add("AI checkpoint task requested; full throttle NOT PROVEN");}
                if(taskCheckpoint==checkpoint&&checkpoint<route.Points.Length-1&&Check.Distance(r.Position,route.Points[checkpoint])<=p.WaypointLookahead){taskCheckpoint++;world.Drive(rider,bike,route.Points[taskCheckpoint],p.RequestedTaskSpeed);events.Add("lookahead task to checkpoint "+taskCheckpoint+"; observation order unchanged");}
                if(progress>lastProgress+.25){lastProgress=progress;lastProgressAt=r.At;}
                Check.That(r.At-lastProgressAt<=p.StallSeconds,"stalled progression");
                if(Check.Distance(r.Position,route.Points[checkpoint])<=p.FinishRadius||PassedCurrentCheckpoint(r.Position)){checkpoint++;events.Add("observed checkpoint "+(checkpoint-1));}
                if(checkpoint==route.Points.Length){State=Stage.FinishReached;analysis.Finish();stopping.FinishObserved=true;stopping.FinishObservedAt=r.At;stopping.FinishSpeed=r.Speed;stopping.FinishObservationPosition=r.Position;lastStopping=r.Copy();world.Brake(rider,bike,(int)(p.MaximumStoppingSeconds*1000));stopping.BrakeRequested=true;State=Stage.Stopping;outcome="FINISH_REACHED; STOPPING_NOT_YET_VERIFIED";reason="supported braking requested; awaiting measured stationary hold";events.Add("FINISH observed; braking requested; completion withheld");if(r.Speed<=p.StationarySpeed)stopping.StationarySince=r.At;}
                else if(analysis.Summary().SteadyCandidate)State=Stage.Traversing;
            }catch(Exception e){failureAt=input!=null&&Check.Finite(input.At)?(double?)input.At:null;Fail(e.Message);}
        }
        // Only the current explicitly surveyed segment is eligible; no nearest-road invention.
        private void Project(MarkerPoint point,out double progress,out double deviation)
        {
            int target=Math.Min(checkpoint,route.Points.Length-1);Check.Point(point);var a=route.Points[target-1];var b=route.Points[target];var delta=Check.Sub(b,a);double length=Check.Length(delta),t=Check.Dot(Check.Sub(point,a),delta)/(length*length);double bounded=Math.Max(0,t);var closest=new MarkerPoint(a.X+delta.X*bounded,a.Y+delta.Y*bounded,a.Z+delta.Z*bounded);deviation=Check.Distance(point,closest);progress=0;for(int i=1;i<target;i++)progress+=Check.Distance(route.Points[i-1],route.Points[i]);progress+=bounded*length;
        }
        private bool PassedCurrentCheckpoint(MarkerPoint position){var a=route.Points[checkpoint-1];var b=route.Points[checkpoint];return Check.Dot(Check.Sub(position,b),Check.Sub(b,a))>=0;}
        private void ObserveStopping(Reading r)
        {
            double dt=r.At-lastStopping.At;Check.That(dt>0&&dt<=p.MaxGapSeconds,"stopping telemetry gap");stopping.SampledDistanceAfterFinishDetection+=Check.Distance(r.Position,lastStopping.Position);stopping.IntegratedDistanceAfterFinishDetection+=(r.Speed+lastStopping.Speed)*.5*dt;stopping.DistanceFromFinishMarker=Check.Distance(r.Position,route.Points[route.Points.Length-1]);lastStopping=r.Copy();
            Check.That(r.At-stopping.FinishObservedAt.Value<=p.MaximumStoppingSeconds,"natural stopping timeout");Check.That(stopping.SampledDistanceAfterFinishDetection<=p.MaximumStoppingDistance,"observed stopping-distance abort bound");
            if(r.Speed<=p.StationarySpeed){if(!stopping.StationarySince.HasValue)stopping.StationarySince=r.At;stopping.StationaryObservedSeconds=r.At-stopping.StationarySince.Value;}else{stopping.StationarySince=null;stopping.StationaryObservedSeconds=0;}
            if(stopping.StationaryObservedSeconds>=p.StationaryHoldSeconds){stopping.StationaryConfirmed=true;stopping.StopObservedAt=r.At;stopping.StopPosition=r.Position;stopping.StoppingSeconds=r.At-stopping.FinishObservedAt.Value;State=Stage.Complete;outcome="FINISH_REACHED_AND_STATIONARY_CONFIRMED; maximum speed not proven";reason="measured stationary hold after supported braking";events.Add("stationary hold measured; run completion before independent cleanup");BeginCleanup();}
        }
        private bool Running {get{return State==Stage.Armed||State==Stage.Accelerating||State==Stage.Traversing||State==Stage.Stopping;}}
        public void Missing(double at){if(Running){failureAt=Check.Finite(at)?(double?)at:null;Fail("missing sample at "+at.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+"; simulation unknown, not confirmed despawn");}}
        public void Tick(double at){if(Running&&(!Check.Finite(at)||at-began>p.MaxRunSeconds||State==Stage.Stopping&&at-stopping.FinishObservedAt.Value>p.MaximumStoppingSeconds)){failureAt=Check.Finite(at)?(double?)at:null;Fail(State==Stage.Stopping?"natural stopping timeout":"run timeout");}}
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
        public RunRecord Snapshot(){return new RunRecord{Domain=markers.Domain,Session=session,MarkerRevision=markers.Revision,MarkerFingerprint=markers.Fingerprint,RouteRevision=route==null?null:route.Revision,Listener=markers.Listener,Settings=p.Copy(),Bike=bike,Rider=rider,Stage=State.ToString(),Outcome=outcome,Reason=reason,Cleanup=cleanup,Upgrades=tuning.Snapshot(),ModKit=tuning.KitSnapshot(),Samples=analysis.Snapshot(),Summary=analysis.Summary(),Lifecycle=events.ToArray(),FailureAt=failureAt,Stopping=stopping.Copy(),Coverage=route!=null&&route.BoundedResearch?"scoped research only; continuous route/traffic UNKNOWN":"original synthetic fixture"};}
        public string[] Display(){var s=analysis.Summary();var samples=analysis.Snapshot();var last=samples.Length==0?null:samples[samples.Length-1];return new[]{"RICHAUDIO BATI | "+State+" | "+outcome,"Bike/rider identity: "+(State==Stage.Cleaned?"CLEANED":reason.Contains("identity")?"UNKNOWN":bike.Valid&&rider.Valid?"last verified creation/observation":"NOT VERIFIED"),"Stock tuning: "+(tuning.Snapshot().Any(u=>u.Status!="VERIFIED"&&u.Status!="UNSUPPORTED")?"PARTIAL":tuning.Snapshot().Length==5?"VERIFIED / unsupported categories explicit":"NOT TESTED"),"Mod-kit: "+tuning.KitSnapshot().Verification+" | "+tuning.KitSnapshot().Reason,"Measured speed: "+(s.FinalSpeed.HasValue?s.FinalSpeed.Value.ToString("F2"):"unavailable")+" native units/s | highest: "+(s.HighestObservedSpeed.HasValue?s.HighestObservedSpeed.Value.ToString("F2"):"unavailable"),"Acceleration estimate: "+(s.LastAcceleration.HasValue?s.LastAcceleration.Value.ToString("F2"):"unavailable"),"Listener distance / route progress: "+(last==null?"unavailable":last.DistanceToMarker.ToString("F2")+" / "+last.RouteProgress.ToString("F2")),"Traffic interference: "+(last==null?"UNKNOWN":last.Observation.Interference),"Tracking: "+(s.Gaps>0?"STALE":last==null?"UNKNOWN":"last copied observation; not physics certification"),"Steady-speed candidate: "+(s.SteadyCandidate?"MET (not maximum proof)":"NOT MET"),route!=null&&route.BoundedResearch?"Scoped experiment | RUNOUT not required; stop confirmation mandatory":"Live start: BLOCKED | no runtime route producer"};}
    }
}
