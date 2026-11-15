using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;

namespace RichAudio.NativeSuppression01
{
    internal sealed class Pose
    {
        internal double X, Y, Z, RX, RY, RZ, PlayerX, PlayerY, PlayerZ;
        internal bool Gameplay;
        internal bool Near(Pose p) {
            return p != null && Gameplay && p.Gameplay && Finite() && p.Finite() &&
                Distance(X,Y,Z,p.X,p.Y,p.Z) <= .10 && Distance(PlayerX,PlayerY,PlayerZ,p.PlayerX,p.PlayerY,p.PlayerZ) <= .10 &&
                Angle(RX,p.RX) <= .5 && Angle(RY,p.RY) <= .5 && Angle(RZ,p.RZ) <= .5;
        }
        bool Finite() { foreach(double v in new[]{X,Y,Z,RX,RY,RZ,PlayerX,PlayerY,PlayerZ}) if(Double.IsNaN(v)||Double.IsInfinity(v)) return false; return true; }
        static double Angle(double a,double b) { double d=Math.Abs(a-b)%360; return Math.Min(d,360-d); }
        static double Distance(double x,double y,double z,double a,double b,double c) { return Math.Sqrt((x-a)*(x-a)+(y-b)*(y-b)+(z-c)*(z-c)); }
        public override string ToString() { return String.Format(CultureInfo.InvariantCulture,"gameplay={0} camera={1:R},{2:R},{3:R} rot={4:R},{5:R},{6:R} player={7:R},{8:R},{9:R}",Gameplay,X,Y,Z,RX,RY,RZ,PlayerX,PlayerY,PlayerZ); }
    }
    internal interface IAutomaticIdleApi : IIdleApi
    {
        void SaveView(); bool PrepareSite(); void RestoreView(); void HoldInputs();
        void SeatA(Lifetime a); bool SeatedA(Lifetime a); bool PlayerOnFoot { get; }
        void StartA(Lifetime a); bool EngineOn(Lifetime item);
        void LeaveA(Lifetime a); void StandBehindB(Lifetime a,Lifetime b); void StopAForComparison(Lifetime a);
        void SetView(bool seated); Pose ReadPose();
        bool PairState(Lifetime a,Lifetime b,bool seated,bool aEngine);
        void HornA(Lifetime a); bool HornActive(Lifetime a);
    }
    internal interface IRunJournal
    {
        bool Healthy { get; }
        long Write(string text);
        bool Durable(long sequence);
    }
    internal sealed class CaptureLease
    {
        public string Session, Recording;
        public long ObservedTicks, Sequence;
        public bool RecordingActive, Foreground, TimelineReady;
        internal bool Ready(long now,long frequency,bool focus) { return RecordingActive && TimelineReady && (!focus||Foreground) && !String.IsNullOrEmpty(Recording) && now>=ObservedTicks && now-ObservedTicks<=2*frequency; }
    }
    internal sealed class RunCommand
    {
        public string Session, Id, Phase, Generation, Operation, Profile, Decision, Text, Observation, EvidenceSha256;
        public long ExpiresTicks;
        public bool CaptureReviewed, ContextReviewed;
    }
    internal sealed class RunState
    {
        public string Session, Phase, Generation, Profile, Observation, Stage, Status, Recording;
        public long Ticks, ActiveStart, Deadline, RequiredDurableSequence;
        public bool AwaitingReview, Finished, Retired, ArmPending, DurableBarrierSatisfied;
    }
    // A finite operator around the same checked controller used by the manual
    // emergency path. All methods here are called only on SHVDNE callbacks.
    internal sealed class AutomaticRun
    {
        internal const int ReleaseAt=450, ReviewReleaseBy=490, RetireBy=540, SessionSeconds=600;
        readonly IAutomaticIdleApi api; readonly IRunJournal journal;
        readonly Func<long> clock; readonly long frequency; readonly string session;
        readonly IdleExperiment core;
        readonly Dictionary<string,string> commands=new Dictionary<string,string>();
        string stage="Dormant",phase="start",observation="",status="Awaiting local operator",recording;
        long entered,activeStart,windowStart,hornStart,lastTick,stableSince,durableBarrier;
        Pose pose,lastPose,bPose,aPose;
        bool terminal,finished,retired,saved,uncertain,heardHorn,hornIssued,bReviewed,phaseWindowComplete,forcedRetirement;
        int setupStage;
        internal AutomaticRun(IAutomaticIdleApi api,IRunJournal journal,Func<long> clock,long frequency,Func<int> token,string session) {
            if(api==null||journal==null||clock==null||frequency<=0||String.IsNullOrEmpty(session))throw new ArgumentException("run dependencies");
            this.api=api;this.journal=journal;this.clock=clock;this.frequency=frequency;this.session=session;
            core=new IdleExperiment(api,delegate(string s){journal.Write(s);},clock,frequency,token,delegate{return journal.Healthy;});
        }
        double Elapsed(long t) { return (clock()-t)/(double)frequency; }
        double ActiveSeconds { get { return Elapsed(activeStart); } }
        string Profile { get { return phase=="baseline"||phase=="release"?"BATI": phase=="B-pre"||phase=="B-post"||phase=="start"?"NONE":IdleExperiment.Profiles[Int32.Parse(phase,CultureInfo.InvariantCulture)]; } }
        internal RunState State { get { return new RunState { Session=session,Phase=phase,Generation=core.Generation,Profile=Profile,Observation=observation,Stage=stage,Status=status,Recording=recording,Ticks=clock(),ActiveStart=activeStart,Deadline=activeStart==0?0:activeStart+SessionSeconds*frequency,AwaitingReview=stage=="Review"&&phaseWindowComplete,Finished=finished,Retired=retired,ArmPending=stage=="Dispatch",RequiredDurableSequence=durableBarrier,DurableBarrierSatisfied=journal.Durable(durableBarrier) }; } }
        void Enter(string next) { stage=next;entered=clock();stableSince=0;lastPose=null;status=next+" "+phase;journal.Write("runner-state stage="+stage+" phase="+phase+" generation="+core.Generation); }
        void Window(string kind,int offset,int duration) { journal.Write("window-declared observation="+observation+" phase="+phase+" kind="+kind+" anchorQpc="+(kind=="horn"?hornStart:windowStart)+" offsetSeconds="+offset+" durationSeconds="+duration+" recording="+recording+"; fixed first anchor, no replacement"); }
        void NewObservation(string p) { phase=p;observation=Guid.NewGuid().ToString("N");phaseWindowComplete=false;hornIssued=heardHorn=false; }
        internal string Command(RunCommand c,CaptureLease capture) {
            if(c==null||String.IsNullOrEmpty(c.Id))return "rejected malformed";
            string prior;
            if(commands.TryGetValue(c.Id,out prior)) { journal.Write("command-duplicate id="+c.Id+" reconciled="+prior);return prior; }
            if(commands.Count>=128) { Stop("command capacity",capture);return "rejected capacity"; }
            journal.Write("command-request id="+c.Id+" operation="+c.Operation+" phase="+c.Phase);
            commands.Add(c.Id,"rejected");
            if(c.Session!=session||c.Phase!=phase||c.Generation!=core.Generation||c.Profile!=Profile||c.ExpiresTicks<clock()||c.ExpiresTicks-clock()>5*frequency||finished||
                String.IsNullOrEmpty(c.Text)||c.Text.Length>1024) return "rejected stale binding";
            if(c.Operation=="Stop") { commands[c.Id]="accepted stop";Stop("operator "+c.Text,capture);return commands[c.Id]; }
            if(c.Operation=="Begin"&&stage=="Dormant") {
                if(capture==null||!capture.Ready(clock(),frequency,true)||!api.StoryReady) return "rejected start prerequisites";
                recording=capture.Recording;durableBarrier=journal.Write("command-accepted id="+c.Id+" Begin; consume once before spawn");
                commands[c.Id]="accepted start";Enter("BeginDurable");return commands[c.Id];
            }
            if(c.Operation!="Review"||stage!="Review"||c.Observation!=observation) return "rejected phase/observation";
            journal.Write("listening-feedback id="+c.Id+" observation="+observation+" phase="+phase+" decision="+c.Decision+" text="+c.Text);
            if(!c.CaptureReviewed||!c.ContextReviewed||String.IsNullOrEmpty(c.EvidenceSha256)||c.EvidenceSha256.Length!=64||!Expected(c.Decision)) {
                commands[c.Id]="accepted negative/ambiguous";
                if(phase=="release") { uncertain=true;FinishRelease(); } else if(phase=="B-post") { Enter("Retire"); } else Stop("listening/evidence gate failed",capture);
                return commands[c.Id];
            }
            // The user supplied ordinary words to Codex. Codex attaches the exact
            // observation and reviewed media receipt; no keyboard attestation.
            durableBarrier=journal.Write("command-accepted id="+c.Id+" Review observation="+observation+" evidenceSha256="+c.EvidenceSha256+"; no next phase armed");
            commands[c.Id]="accepted reviewed decision";Enter("ReviewDurable");return commands[c.Id];
        }
        bool Expected(string decision) {
            if(phase=="B-pre"||phase=="B-post")return decision=="ControlNormal";
            if(phase=="baseline"||phase=="0"||phase=="2"||phase=="4"||phase=="release")return decision=="Normal";
            if(phase=="1")return decision=="DistinctEngine";
            return phase=="3"&&(decision=="MatchedEngine"||decision=="DonorHorn");
        }
        bool CaptureOK(CaptureLease c,bool focus) { return c!=null&&c.Recording==recording&&c.Ready(clock(),frequency,focus); }
        bool MeasureState(bool seated,bool aEngine) { return api.PairState(core.A,core.B,seated,aEngine)&&pose!=null&&pose.Near(api.ReadPose()); }
        bool Settled(bool seated,bool aEngine,Pose expected) {
            if(!api.PairState(core.A,core.B,seated,aEngine))throw new InvalidOperationException("operating state failed");
            Pose p=api.ReadPose();if(!p.Gameplay)throw new InvalidOperationException("gameplay listener path unavailable");
            if(expected!=null&&!expected.Near(p)) { stableSince=0;lastPose=p;return false; }
            if(lastPose==null||!lastPose.Near(p)){stableSince=clock();lastPose=p;return false;}
            if(Elapsed(stableSince)<2)return false;
            pose=p;journal.Write("geometry phase="+phase+" "+pose);return true;
        }
        internal void Tick(CaptureLease capture) {
            if(finished)return;
            long now=clock();
            try {
                if(stage=="Dormant")return;
                if(stage=="BeginDurable") {
                    if(!journal.Durable(durableBarrier))return;
                    if(capture==null||!capture.Ready(now,frequency,true)||capture.Recording!=recording)throw new InvalidOperationException("capture not ready before spawn");
                    api.SaveView();saved=true;Enter("PrepareSite");return;
                }
                if(stage=="PrepareSite") {
                    if(Elapsed(entered)>12) { EndUnresolved("bounded exterior placement unavailable; pair not created");return; }
                    if(!CaptureOK(capture,true))return;
                    if(!api.PrepareSite())return;
                    activeStart=now;core.Spawn();Enter("Spawn");return;
                }
                if(activeStart!=0&&now-activeStart>=SessionSeconds*frequency) { EndUnresolved("absolute session limit");return; }
                if(lastTick!=0&&now-lastTick>2*frequency) { Stop("script callback gap; observation invalid",capture); }
                lastTick=now;
                if(!terminal&&ActiveSeconds>=ReleaseAt)Stop("local cleanup reserve",capture);
                if(terminal&&ActiveSeconds>=RetireBy&&!forcedRetirement) {
                    forcedRetirement=true;
                    if(core.RestoreReturned&&!core.ReleaseOutcomeRecorded){uncertain=true;core.RecordUncertainRelease();}
                    Enter("Retire");
                }
                if(!journal.Healthy&&!terminal)Stop("journal unavailable",capture);
                if(!CaptureOK(capture,false)&&!terminal)Stop("capture stopped or lease expired",capture);
                if(!core.Stopped)core.Tick();
                if(core.Stopped&&!terminal) { terminal=true;NewObservation("release");Enter(core.RestoreReturned?"ReleaseObserve":"Exit"); }
                if(core.A!=null&&core.B!=null)api.HoldInputs();
                if(stage=="Spawn") { if(!core.Active)return;api.SeatA(core.A);setupStage=0;Enter("Seat");return; }
                if(stage=="Seat") {
                    if(Elapsed(entered)>5)throw new InvalidOperationException("seating timeout");
                    if(!api.SeatedA(core.A))return;
                    if(!api.EngineOn(core.A)) { if(setupStage==0){api.StartA(core.A);setupStage=1;}return; }
                    if(!api.EngineOn(core.B))core.StartControl();
                    api.SetView(true);NewObservation("B-pre");Enter("StabilitySettle");return;
                }
                if(stage=="StabilitySettle") {
                    if(Elapsed(entered)>7)throw new InvalidOperationException("camera/setup timeout");
                    if(!CaptureOK(capture,true))return;
                    if(!Settled(true,true,null))return;
                    core.Snapshot();windowStart=clock();Window("B-stability",0,10);Enter("Stability");return;
                }
                if(stage=="Stability") {
                    if(!CaptureOK(capture,true)||!MeasureState(true,true))throw new InvalidOperationException("B stability lost");
                    if(Elapsed(windowStart)<10)return;
                    core.Snapshot();api.LeaveA(core.A);Enter("LeaveBPre");return;
                }
                if(stage=="LeaveBPre"||stage=="LeaveBPost") {
                    if(Elapsed(entered)>6)throw new InvalidOperationException("dismount timeout");
                    if(!api.PlayerOnFoot)return;
                    api.StopAForComparison(core.A);api.StandBehindB(core.A,core.B);api.SetView(false);Enter(phase=="B-pre"?"BPreSettle":"BPostSettle");return;
                }
                if(stage=="BPreSettle"||stage=="BPostSettle") {
                    if(Elapsed(entered)>7)throw new InvalidOperationException("B listener pose timeout");
                    if(!CaptureOK(capture,true))return;
                    if(!Settled(false,false,phase=="B-post"?bPose:null))return;
                    if(phase=="B-pre")bPose=pose;
                    core.Snapshot();windowStart=clock();Window(phase,5,10);Enter("BWindow");return;
                }
                if(stage=="BWindow") {
                    if(!CaptureOK(capture,true)||!MeasureState(false,false))throw new InvalidOperationException("B comparison context lost");
                    if(Elapsed(windowStart)<15)return;
                    core.Snapshot();phaseWindowComplete=true;Enter("Review");return;
                }
                if(stage=="Review") {
                    // Focus may leave GTA to answer chat, outside selected windows.
                    // Engine loss still fails closed; feedback never starts an arm.
                    bool seated=phase!="B-pre"&&phase!="B-post";
                    if(!api.PairState(core.A,core.B,seated,seated)&&!terminal)Stop("operating state lost awaiting feedback",capture);
                    if(terminal&&ActiveSeconds>=ReviewReleaseBy) { uncertain=true;if(phase=="release"||phase=="4")FinishRelease();else Enter("Retire"); }
                    return;
                }
                if(stage=="ReviewDurable") {
                    if(!journal.Durable(durableBarrier))return;
                    if(phase=="B-pre") { bReviewed=true;api.SeatA(core.A);setupStage=0;Enter("SeatBaseline");return; }
                    if(phase=="B-post") { Enter("Retire");return; }
                    if(phase=="release") { core.ConfirmObservation(SelectionEvidence.BatiReturned);FinishRelease();return; }
                    core.ConfirmObservation(core.ExpectedEvidence);
                    if(phase=="4") { FinishRelease();return; }
                    Enter("DispatchReady");return;
                }
                if(stage=="SeatBaseline") {
                    if(!bReviewed||Elapsed(entered)>5)throw new InvalidOperationException("baseline seating failed");
                    if(!api.SeatedA(core.A))return;
                    if(!api.EngineOn(core.A)){if(setupStage==0){api.StartA(core.A);setupStage=1;}return;}
                    api.SetView(true);NewObservation("baseline");Enter("ASettle");return;
                }
                if(stage=="ASettle") {
                    if(Elapsed(entered)>7)throw new InvalidOperationException("A listener pose timeout");
                    if(!CaptureOK(capture,true)||!Settled(true,true,null))return;
                    aPose=pose;StartHorn();return;
                }
                if(stage=="DispatchReady") {
                    if(!CaptureOK(capture,true)) { if(Elapsed(entered)>7)Stop("foreground/capture did not resume",capture);return; }
                    if(!api.PairState(core.A,core.B,true,true)||!aPose.Near(api.ReadPose()))throw new InvalidOperationException("pre-dispatch context changed");
                    if(ActiveSeconds+30>ReleaseAt||SessionSeconds-ActiveSeconds<100){Stop("insufficient full phase and cleanup reserve",capture);return;}
                    // Reserve the one setter in durable evidence BEFORE arming.
                    NewObservation(core.NextIndex.ToString(CultureInfo.InvariantCulture));
                    durableBarrier=journal.Write("dispatch-reserved observation="+observation+" phase="+phase+" generation="+core.Generation+" profile="+Profile+"; lost outcome is uncertain, never resend");
                    Enter("Dispatch");return;
                }
                if(stage=="Dispatch") {
                    if(!journal.Durable(durableBarrier))return;
                    if(!CaptureOK(capture,true)||!aPose.Near(api.ReadPose()))throw new InvalidOperationException("final capture/pose admission failed");
                    // No chat, IO, wait or second model response between these calls.
                    core.Arm();core.Apply();windowStart=core.ObservationTicks;pose=aPose;
                    if(phase=="4")terminal=true;
                    Window("transition",0,10);Window("steady",5,10);Enter("Idle");return;
                }
                if(stage=="Idle") {
                    if(!CaptureOK(capture,true)||!MeasureState(true,true))throw new InvalidOperationException("fixed idle context lost");
                    if(Elapsed(windowStart)<15)return;
                    core.Snapshot();StartHorn();return;
                }
                if(stage=="Horn") {
                    if(!CaptureOK(capture,true)||!MeasureState(true,true))throw new InvalidOperationException("fixed horn context lost");
                    if(!hornIssued&&Elapsed(hornStart)>=2) { if(Elapsed(hornStart)>2.25)throw new InvalidOperationException("horn callback missed bounded cue");api.HornA(core.A);hornIssued=true;journal.Write("horn-native-returned observation="+observation+" role=A; not proof of sound identity"); }
                    if(hornIssued&&api.HornActive(core.A))heardHorn=true;
                    if(Elapsed(hornStart)<10)return;
                    if(!heardHorn)throw new InvalidOperationException("vehicle horn-active witness absent");
                    journal.Write("horn-route-observed observation="+observation+" native-vehicle-horn-active=true; audible identity still requires listening");
                    if(phase=="baseline") { core.Snapshot();windowStart=clock();Window("steady",5,10);Enter("BaselineIdle"); }
                    else {phaseWindowComplete=true;Enter("Review");}
                    return;
                }
                if(stage=="BaselineIdle") {
                    if(!CaptureOK(capture,true)||!MeasureState(true,true))throw new InvalidOperationException("baseline idle context lost");
                    if(Elapsed(windowStart)<15)return;
                    core.Snapshot();phaseWindowComplete=true;Enter("Review");return;
                }
                if(stage=="ReleaseObserve") {
                    if(!core.RestoreReturned){Enter("Exit");return;}
                    if(CaptureOK(capture,true)&&api.CanSwitch(core.A,core.B)&&aPose!=null&&aPose.Near(api.ReadPose())) {
                        pose=aPose;windowStart=core.ObservationTicks;Window("transition",0,10);Window("steady",5,10);Enter("Idle");
                    } else {uncertain=true;Enter("ReleaseUncertain");}
                    return;
                }
                if(stage=="ReleaseUncertain") {if(Elapsed(entered)>=15)FinishRelease();return;}
                if(stage=="Retire") {
                    if(!api.PlayerOnFoot){api.LeaveA(core.A);Enter("RetireLeave");return;}
                    core.Cleanup();retired=core.CleanupComplete;
                    if(!retired){EndUnresolved("verified retirement failed; no alternative deletion");return;}
                    journal.Write("retirement-verified exact-owned-pair=true; audible recovery remains separate");Complete();return;
                }
                if(stage=="RetireLeave") { if(api.PlayerOnFoot){Enter("Retire");return;}if(Elapsed(entered)>6)EndUnresolved("retirement dismount failed");return; }
                if(stage=="Exit") { EndUnresolved("release not returned or identity/context unavailable; normal exit required");return; }
            } catch(ThreadAbortException) { throw; }
            catch(Exception e) {
                journal.Write("runner-fault phase="+phase+" stage="+stage+" "+e.GetType().Name+":"+e.Message);
                if(terminal) {
                    if(core.RestoreReturned&&!core.Changed) {uncertain=true;if(stage=="Retire"||stage=="RetireLeave")EndUnresolved("cleanup failed");else if(stage=="BWindow"||stage=="BPostSettle"||stage=="LeaveBPost")Enter("Retire");else Enter("ReleaseUncertain");}
                    else EndUnresolved("terminal operation failed; no retry");
                } else Stop("automatic operation failed",capture);
            }
        }
        void StartHorn() { core.MarkHorn();hornStart=core.HornTicks;heardHorn=hornIssued=false;Window("horn",0,10);Enter("Horn"); }
        internal void Stop(string reason,CaptureLease capture) {
            if(finished||terminal)return;
            terminal=true;journal.Write("automatic-stop "+reason);core.Stop(reason);
            if(core.RestoreReturned) {NewObservation("release");windowStart=clock();Enter("ReleaseObserve");}
            else if(!core.Changed) {uncertain=true;NewObservation("B-post");Enter("Retire");}
            else Enter("Exit");
        }
        internal void Abort() { core.Abort();finished=true;stage="Aborted";status="Runtime aborted; native recovery unqualified"; }
        void FinishRelease() {
            if(uncertain)core.RecordUncertainRelease();
            if(core.A==null||core.B==null){EndUnresolved("pair never completed");return;}
            NewObservation("B-post");api.LeaveA(core.A);Enter("LeaveBPost");
        }
        void Complete() { if(saved){api.RestoreView();saved=false;}finished=true;stage="Finished";status="ENDED; normal game exit and recorder finalization pending";journal.Write(status); }
        void EndUnresolved(string why) {journal.Write("UNRESOLVED "+why);if(saved){try{api.RestoreView();}catch(Exception e){journal.Write("view restore failed "+e.Message);}saved=false;}finished=true;stage="Unresolved";status=why; }
    }
}
