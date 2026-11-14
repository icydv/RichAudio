using System;
using System.Threading;

namespace RichAudio.NativeSuppression01
{
    // Only the disposable native-only experiment. No production ownership claim.
    internal sealed class Lifetime
    {
        internal int Handle, Token;
        internal string Role;
        internal bool Lost, Deleted;
    }
    internal interface IIdleApi
    {
        bool StoryReady { get; }
        void Prepare();
        bool ModelReady { get; }
        Lifetime Spawn(string role, int token);
        bool Matches(Lifetime item);
        bool CanStartControl(Lifetime target, Lifetime control);
        void StartControl(Lifetime target, Lifetime control, Func<bool> stillAdmitted);
        bool CanSwitch(Lifetime target, Lifetime control);
        bool CanRestore(Lifetime target);
        void Assign(Lifetime item, string profile, Func<bool> stillAdmitted);
        bool Delete(Lifetime item);
        void ReleaseModel();
        string Snapshot(Lifetime item);
    }
    internal enum SelectionEvidence { None, StockBatiNormal, SelfAssignmentStable, StockAlternateDistinct, BatiReturned, PrivatePredictedSignature, GenericAudibleChange, StockLikeOnly }
    internal sealed class IdleExperiment
    {
        internal static readonly string[] Profiles = {
            "BATI", "ADDER", "BATI", "ra_ns06_adder_select", "BATI"
        };
        readonly IIdleApi api;
        readonly Action<string> log;
        readonly Func<long> clock;
        readonly long frequency;
        readonly Func<int> newToken;
        readonly Func<bool> healthy;
        Lifetime a, b;
        long end, loadEnd, armEnd, releaseBy, observationStart, hornCue;
        int applied = -1;
        bool baselineAccepted, observationPending, stockPositiveAccepted, releaseOutcomeRecorded;
        internal SelectionEvidence ExpectedEvidence {
            get {
                if (stopped && RestoreReturned) return SelectionEvidence.BatiReturned;
                if (!baselineAccepted) return SelectionEvidence.StockBatiNormal;
                switch (applied) {
                    case 0: return SelectionEvidence.SelfAssignmentStable;
                    case 1: return SelectionEvidence.StockAlternateDistinct;
                    case 2: case 4: return SelectionEvidence.BatiReturned;
                    case 3: return SelectionEvidence.PrivatePredictedSignature;
                    default: return SelectionEvidence.None;
                }
            }
        }
        bool used, loading, changed, restoreAttempted, stopped, aborted, controlStartAttempted;
        int next;
        internal string Status { get; private set; }
        internal bool RestoreReturned { get; private set; }
        internal bool CleanupComplete { get; private set; }
        internal bool Active { get { return a != null && b != null && !loading && !stopped && !aborted; } }
        internal string Next { get { return next < Profiles.Length ? Profiles[next] : "finished"; } }
        internal IdleExperiment(IIdleApi api, Action<string> log, Func<long> clock, long frequency, Func<int> token, Func<bool> healthy)
        {
            if (api == null || log == null || clock == null || token == null || healthy == null || frequency <= 0) throw new ArgumentException("dependencies");
            this.api = api; this.log = log; this.clock = clock; this.frequency = frequency; newToken = token;
            this.healthy = healthy;
            Status = "DORMANT - F5 creates two disposable Batis";
        }
        bool Own(Lifetime item)
        {
            if (item == null || item.Lost || item.Deleted) return false;
            if (api.Matches(item)) return true;
            item.Lost = true;
            log("identity-lost role=" + item.Role + " handle=" + item.Handle);
            return false;
        }
        void RequirePair()
        {
            if (!api.StoryReady || !Own(a) || !Own(b) || a.Handle == b.Handle || a.Token == b.Token)
                throw new InvalidOperationException("Story scope or exact pair lost");
        }
        internal void Spawn()
        {
            if (used || stopped || aborted || !healthy() || !api.StoryReady) throw new InvalidOperationException("one pair per load, unstopped controller, healthy journal and Story Mode required");
            used = true; end = clock() + 600 * frequency; releaseBy = clock() + 525 * frequency; loadEnd = clock() + 5 * frequency;
            log("spawn-request; known stock experiment baseline; no arbitrary prior override recovery");
            loading = true;
            try { api.Prepare(); Status = "Loading BATI"; }
            catch (ThreadAbortException) { throw; }
            catch { Stop("spawn preparation failed"); throw; }
        }
        internal void Tick()
        {
            if (aborted || !used || stopped) return;
            if (!healthy()) { Stop("journal unavailable"); return; }
            if (!api.StoryReady) { Stop("Story scope unavailable"); return; }
            if (clock() >= end) { Stop("10 minute limit"); return; }
            if (clock() >= releaseBy) { Stop("525 second release reserve"); return; }
            if (loading)
            {
                if (clock() >= loadEnd) { Stop("model load timeout"); return; }
                if (!api.ModelReady) return;
                try
                {
                    int x = newToken(), y = newToken();
                    if (x <= 0 || y <= 0 || x == y) throw new InvalidOperationException("distinct nonzero tokens required");
                    a = api.Spawn("A", x); b = api.Spawn("B", y);
                    RequirePair(); loading = false; api.ReleaseModel();
                    Status = "STOCK - record baseline; F3 horn cue, F8 idle anchor, F12 reviewed evidence";
                    Snapshot();
                }
                catch (ThreadAbortException) { throw; }
                catch { Stop("spawn failed"); throw; }
            }
            if (Active)
            {
                if (!Own(a) || !Own(b)) { Stop("pair lifetime lost"); return; }
                if (armEnd != 0 && clock() >= armEnd) { armEnd = 0; Status = "Arm expired; no assignment - next " + Next; }
            }
        }
        internal void Arm()
        {
            if (!Active || !healthy() || next >= Profiles.Length || clock() >= end) throw new InvalidOperationException("no next phase");
            if (!baselineAccepted || observationPending || (next >= 2 && !stockPositiveAccepted))
            { Stop("required independently reviewed observation missing"); throw new InvalidOperationException("observation required before progression"); }
            if (clock() >= releaseBy || (next != 2 && next != 4 && end - clock() < 100 * frequency))
            { Stop("insufficient diagnostic/release time"); throw new InvalidOperationException("timing reserve"); }
            try { RequirePair(); if (!api.CanSwitch(a, b)) throw new InvalidOperationException("A must idle with my ped driving, B idling, empty and stopped"); }
            catch (ThreadAbortException) { throw; }
            catch { Stop("arm operating context failed"); throw; }
            armEnd = clock() + 10 * frequency;
            Status = "ARMED " + Next + " - F7 within 10 seconds; F9 restore";
            log("armed phase=" + next + " requested=" + Next);
        }
        internal void StartControl()
        {
            try
            {
                if (!Active || !healthy() || next != 0 || baselineAccepted || hornCue != 0 || observationStart != 0 || changed || armEnd != 0 || controlStartAttempted || clock() >= end)
                    throw new InvalidOperationException("one manual control start before arming the first phase only");
                controlStartAttempted = true;
                RequirePair();
                if (!api.CanStartControl(a, b))
                    throw new InvalidOperationException("A must idle with my ped driving; B must be empty, stopped and engine off");
                log("control-start-intent handle=" + b.Handle + " token=" + b.Token + "; engine on only; no profile assignment");
                api.StartControl(a, b, delegate {
                    return !aborted && !stopped && healthy() && next == 0 && !changed && armEnd == 0 && clock() < end;
                });
                Status = "B engine start REQUEST RETURNED - F8 checks state; F6 still requires both engines running";
                log(Status); Snapshot();
            }
            catch (ThreadAbortException) { throw; }
            catch { Stop("control engine setup failed; no retry"); throw; }
        }
        internal void Apply()
        {
            long expiry = armEnd; armEnd = 0;
            if (!Active || !healthy() || next >= Profiles.Length || expiry == 0 || clock() >= expiry || clock() >= end)
                throw new InvalidOperationException("not armed or expired");
            try { RequirePair(); if (!api.CanSwitch(a, b)) throw new InvalidOperationException("operating context changed"); }
            catch (ThreadAbortException) { throw; }
            catch { Stop("apply operating context failed"); throw; }
            if (!baselineAccepted || observationPending || (next >= 2 && !stockPositiveAccepted))
                throw new InvalidOperationException("required observation missing");
            if (clock() >= releaseBy || (next != 2 && next != 4 && end - clock() < 100 * frequency))
            { Stop("final phase timing reserve"); throw new InvalidOperationException("timing reserve"); }
            applied = next;
            string profile = Profiles[next++]; // Consume before dispatch, including a throwing void native.
            changed = true;
            log("assignment-intent phase=" + (next - 1) + " handle=" + a.Handle + " token=" + a.Token + " profile=" + profile);
            try
            {
                api.Assign(a, profile, delegate {
                    bool admitted = !aborted && !stopped && healthy() && clock() < expiry && clock() < releaseBy &&
                        (applied == 2 || applied == 4 || end - clock() >= 100 * frequency);
                    // A refused final guard has not dispatched BATI; the stop
                    // path may still perform its separately admitted release.
                    if (admitted && (applied == 2 || applied == 4)) restoreAttempted = true;
                    return admitted;
                });
                observationStart = clock(); hornCue = 0; observationPending = true; releaseOutcomeRecorded = false;
                if (applied == 2 || applied == 4) { changed = false; RestoreReturned = true; }
                if (applied == 4) stopped = true;
                Status = "REQUEST RETURNED " + profile + " - hold 15s, F8; F3 cue physical horn; review then F12";
                log(Status); Snapshot();
            }
            catch (ThreadAbortException) { throw; }
            catch
            {
                Stop("assignment exception; no phase retry");
                throw;
            }
        }
        internal void Snapshot()
        {
            if (aborted || !api.StoryReady) return;
            if (Own(a)) log("snapshot A " + api.Snapshot(a));
            if (Own(b)) log("snapshot B " + api.Snapshot(b));
            if (applied == -1 && hornCue != 0 && observationStart == 0 && clock() - hornCue >= 10 * frequency && api.CanSwitch(a, b))
            { observationStart = clock(); log("baseline-idle-anchor; first designated F8 after baseline horn; fixed +5s / 10s window"); }
        }
        internal void MarkHorn()
        {
            if (aborted || !healthy() || !used || (stopped && !RestoreReturned) || hornCue != 0 || clock() >= end)
                throw new InvalidOperationException("one horn cue per admitted observation");
            RequirePair();
            if (!api.CanSwitch(a, b)) { Stop("horn observation context lost"); throw new InvalidOperationException("idle pair required"); }
            if (applied != -1 && clock() - observationStart < 15 * frequency)
                throw new InvalidOperationException("finish fixed idle window before horn");
            hornCue = clock();
            log("physical-horn-cue intended=" + (applied == -1 ? "stock baseline BATI" : Profiles[applied]) +
                " role=A handle=" + a.Handle + " token=" + a.Token + "; sound horn once at cue+2 to +5s; event window cue+0 / 10s; activation and audible identity require video/listening; getter auxiliary only");
        }
        internal void ConfirmObservation(SelectionEvidence evidence)
        {
            if (aborted || !used || !healthy() || clock() >= end || (!observationPending && baselineAccepted))
                throw new InvalidOperationException("no pending observation");
            RequirePair();
            if (!api.CanSwitch(a, b)) { Stop("observation context lost"); throw new InvalidOperationException("idle pair required"); }
            if (observationStart == 0 || clock() - observationStart < 15 * frequency || hornCue == 0 || clock() - hornCue < 10 * frequency)
                throw new InvalidOperationException("fixed idle and physical horn observations incomplete");
            if (evidence != ExpectedEvidence || evidence == SelectionEvidence.None)
            { Stop("missing or ambiguous independent audible evidence"); throw new InvalidOperationException("wrong evidence for intended phase"); }
            // A manual attestation, not automatic acoustic analysis or an effective-profile getter.
            // Generic quietness and stock similarity cannot attest a private donor reference.
            log("manual-observation-accepted intended=" + (applied == -1 ? "stock baseline BATI" : Profiles[applied]) +
                " evidence=" + evidence + "; independently reviewed fixed capture/context asserted manually; getter not gated; controller does not measure audio");
            baselineAccepted = true; observationPending = false;
            if (applied == 1) stockPositiveAccepted = true;
            if (evidence == SelectionEvidence.BatiReturned) {
                releaseOutcomeRecorded = true;
                if (!stopped) { restoreAttempted = false; RestoreReturned = false; }
            }
            Status = stopped ? "RELEASE OBSERVED - dismount, compare B, F10 retire" : "OBSERVATION ACCEPTED - next " + Next;
        }
        internal void RecordUncertainRelease()
        {
            if (aborted || !RestoreReturned || !stopped || observationStart == 0 || clock() - observationStart < 15 * frequency)
                throw new InvalidOperationException("record the returned release interval first");
            releaseOutcomeRecorded = true; observationPending = false;
            log("manual-release-outcome uncertain/wrong/absent; no retry; retirement is containment, not audible restoration");
        }
        internal void Stop(string reason)
        {
            if (aborted) return;
            stopped = true; armEnd = 0;
            Status = "STOP: " + reason;
            log(Status);
            // A known experimental baseline, not a previous-effective-profile getter.
            // If unsafe now, a later explicit F9 may request this once in a safe callback.
            if (changed && !restoreAttempted && api.StoryReady && Own(a) && api.CanRestore(a))
            {
                restoreAttempted = true;
                log("restore-intent same surviving A; requested=BATI; audible restoration UNVERIFIED");
                try
                {
                    api.Assign(a, "BATI", delegate { return !aborted; }); changed = false; RestoreReturned = true;
                    applied = 4; observationStart = clock(); hornCue = 0; observationPending = true; releaseOutcomeRecorded = false;
                    Status = "BATI restore returned - record same surviving A before F10 cleanup";
                }
                catch (ThreadAbortException) { throw; }
                catch { Status = "RESTORE UNKNOWN - do not retry assignment; end session normally"; }
                log(Status);
            }
            else if (changed)
            {
                Status = restoreAttempted ? "RESTORE UNKNOWN - no retry; end session normally" :
                    "RESTORE UNRESOLVED - stop A safely, F9; no independent recovery";
                log(Status);
            }
            if (loading && api.StoryReady) { api.ReleaseModel(); loading = false; }
        }
        internal void Cleanup()
        {
            if (aborted || !used) return;
            if (changed) { Stop("release before cleanup; record audible outcome separately"); return; }
            if (RestoreReturned && !releaseOutcomeRecorded) throw new InvalidOperationException("record release outcome before retirement");
            Stop("manual cleanup");
            if (changed) throw new InvalidOperationException("restore unresolved; deletion is not restoration");
            if (!api.StoryReady) throw new InvalidOperationException("cleanup requires Story Mode");
            bool da = Delete(a), db = Delete(b);
            CleanupComplete = da && db;
            Status = CleanupComplete ? "ENDED - disposable vehicles removed; audible verdict still independent" : "Cleanup deferred - exit vehicles, stop safely, F10";
            log(Status);
        }
        bool Delete(Lifetime item)
        {
            if (item == null || item.Deleted) return true;
            if (!Own(item)) return false;
            item.Deleted = api.Delete(item); return item.Deleted;
        }
        internal void Abort()
        {
            aborted = stopped = true; armEnd = 0;
            Status = "ABORTED - no native calls on domain thread; recovery UNQUALIFIED";
            log(Status);
        }
    }
}
