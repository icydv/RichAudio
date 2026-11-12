using System;
using System.Globalization;

namespace RichAudio.GateA.Private03
{
    // This experiment is independent of the production controller and audio renderer.
    internal sealed class ProbeLifetime
    {
        internal int Handle, Token;
        internal string Role;
        internal bool Lost, Retired;
    }
    internal interface IProfileProbeApi
    {
        bool StoryReady { get; }
        void PreparePair();
        bool ModelReady { get; }
        ProbeLifetime Spawn(string role, int token);
        bool Exists(ProbeLifetime lifetime);
        bool Matches(ProbeLifetime lifetime);
        bool EmptyStoppedAndDriveable(ProbeLifetime lifetime);
        string ReadSnapshot(ProbeLifetime lifetime);
        void AssignPrivateProfile(ProbeLifetime lifetime);
        bool Retire(ProbeLifetime lifetime);
        void ReleaseModel();
    }
    internal interface IProbeJournal
    {
        bool Healthy { get; }
        long Append(string message);
        bool Persisted(long ticket);
    }
    internal interface IPrivateProbeGuard
    {
        bool Ready { get; }
        bool ClaimActivation();
        void RequestStop();
        void StopAcknowledged();
        void VehiclesRetired();
    }
    internal sealed class ProfileAssignmentController
    {
        readonly IProfileProbeApi api;
        readonly IProbeJournal journal;
        readonly IPrivateProbeGuard guard;
        readonly Func<long> clock;
        readonly long frequency;
        readonly Func<int> token;
        ProbeLifetime target, control;
        long pending, deadline, modelDeadline, assignmentDeadline;
        long activeStarted, baselineCutoff, assignmentCutoff, retirementCutoff;
        bool used, attempted, loading, spawnPending, assignmentPending, baselinePending;
        long baselineTicket, baselineDeadline;
        internal bool BaselineAccepted { get; private set; }
        volatile bool stopping;
        internal bool Active { get; private set; }
        internal bool Finished { get; private set; }
        internal bool CleanupComplete { get; private set; }
        internal bool AssignmentAttempted { get { return attempted; } }
        internal ProfileAssignmentController(IProfileProbeApi api, IProbeJournal journal,
            Func<long> clock, long frequency, Func<int> token, IPrivateProbeGuard guard)
        {
            if (api == null || journal == null || clock == null || token == null || guard == null || frequency <= 0)
                throw new ArgumentException("probe dependencies");
            this.api = api; this.journal = journal; this.clock = clock; this.frequency = frequency; this.token = token;
            this.guard = guard;
        }
        void RequireReady()
        {
            if (stopping) throw new InvalidOperationException("probe stopping");
            if (!guard.Ready) throw new InvalidOperationException("resource admission or independent supervisor unavailable");
            if (!api.StoryReady) throw new InvalidOperationException("Story Mode unavailable, paused, loading or switching");
            if (!journal.Healthy) throw new InvalidOperationException("evidence sink unavailable");
        }
        long Record(string message)
        {
            long result = journal.Append(message);
            if (result <= 0) throw new InvalidOperationException("evidence queue unavailable");
            return result;
        }
        void BestEffort(string message) { try { journal.Append(message); } catch { } }
        bool Owns(ProbeLifetime item)
        {
            if (item == null || item.Lost || item.Retired) return false;
            if (api.Matches(item)) return true;
            item.Lost = true;
            BestEffort("identity-lost role=" + item.Role + " handle=" + item.Handle + " token=" + item.Token);
            return false;
        }
        void RequirePair()
        {
            if (!Owns(target) || !Owns(control) || target.Handle == control.Handle || target.Token == control.Token)
                throw new InvalidOperationException("test lifetimes invalid, stale or overlapping");
        }
        internal void RequestSpawn()
        {
            if (used || stopping || Finished) throw new InvalidOperationException("one pair attempt per script load");
            RequireReady();
            if (!guard.ClaimActivation()) throw new InvalidOperationException("supervision activation already consumed or stopped");
            used = true; // A failed intent write also consumes this external one-shot lease.
            activeStarted = clock();
            baselineCutoff = activeStarted + 80 * frequency;
            assignmentCutoff = activeStarted + 100 * frequency;
            retirementCutoff = activeStarted + 140 * frequency;
            pending = Record("spawn-request model=bati count=2 profile=ra_gapriv01_bati; no assignment");
            spawnPending = true;
            deadline = activeStarted + 3 * 60 * frequency;
            modelDeadline = activeStarted + 5 * frequency;
        }
        internal void ConfirmBaseline(string confirmation)
        {
            if (!Active || attempted || baselinePending || BaselineAccepted || stopping || Finished || clock() >= baselineCutoff || confirmation != "BASELINES_A_B_MARKER_FREE")
                throw new InvalidOperationException("baseline confirmation refused");
            RequireReady(); RequirePair();
            if (!api.EmptyStoppedAndDriveable(target) || !api.EmptyStoppedAndDriveable(control)) throw new InvalidOperationException("baseline pair must be empty and stopped");
            baselineTicket = Record("manual-baseline-review-confirmed A-and-B-usable-marker-free; external-detector-and-capture-provenance-required; not a registration claim");
            baselinePending = true; baselineDeadline = clock() + 2 * frequency;
        }
        internal void RequestAssignment(string confirmation)
        {
            if (!BaselineAccepted || !Active || attempted || assignmentPending || stopping || Finished || clock() >= assignmentCutoff || confirmation != "ASSIGN_PRIVATE_TO_A")
                throw new InvalidOperationException("assignment phase, deadline or confirmation refused");
            RequireReady(); RequirePair();
            if (!api.EmptyStoppedAndDriveable(target) || !api.EmptyStoppedAndDriveable(control))
                throw new InvalidOperationException("both test vehicles must be alive, driveable, empty and stopped");
            Snapshot("pre-assignment");
            pending = Record("assignment-intent role=A handle=" + target.Handle + " token=" + target.Token +
                " profile=ra_gapriv01_bati profileHash=dd89929d native=4F0C413926060B38; dispatch awaits durable journal acknowledgement");
            assignmentPending = true;
            assignmentDeadline = clock() + 2 * frequency;
        }
        internal void Snapshot(string label)
        {
            if (!Active || stopping || Finished) throw new InvalidOperationException("no active test pair");
            RequireReady(); RequirePair();
            Record("sample label=" + label + " role=A " + api.ReadSnapshot(target));
            Record("sample label=" + label + " role=B " + api.ReadSnapshot(control));
        }
        internal void Tick()
        {
            if (Finished || stopping || !used) return;
            try
            {
                RequireReady();
                if (clock() >= deadline) { Stop("3-minute-active-limit"); return; }
                if (!BaselineAccepted && clock() >= baselineCutoff) { Stop("baseline-decision-80-second-limit"); return; }
                if (!attempted && clock() >= assignmentCutoff) { Stop("assignment-100-second-limit"); return; }
                if (clock() >= retirementCutoff) { Stop("retirement-140-second-limit"); return; }
                if (spawnPending)
                {
                    if (clock() >= modelDeadline) { Stop("model-or-evidence-5-second-limit"); return; }
                    if (!journal.Persisted(pending)) return;
                    if (!loading) { api.PreparePair(); loading = true; }
                    if (!api.ModelReady) return;
                    int a = token(), b = token();
                    if (a == 0 || b == 0 || a == b) throw new InvalidOperationException("nonunique ownership tokens");
                    target = api.Spawn("A", a);
                    RequireReady();
                    if (!Owns(target)) throw new InvalidOperationException("A lifetime not established");
                    control = api.Spawn("B", b);
                    RequireReady(); RequirePair();
                    spawnPending = false; Active = true; api.ReleaseModel(); loading = false;
                    Snapshot("baseline-ready");
                    Record("awaiting-explicit-manual-assignment effective-profile=UNKNOWN");
                }
                if (!Active) return;
                RequirePair();
                if (baselinePending) {
                    if (clock() >= baselineDeadline) { Stop("baseline-acknowledgement-2-second-limit"); return; }
                    if (journal.Persisted(baselineTicket)) {
                        if (clock() >= baselineCutoff) { Stop("baseline-decision-80-second-limit"); return; }
                        baselinePending = false; BaselineAccepted = true; Record("baseline-gate-accepted; explicit F6/F7 still required");
                    }
                }
                if (assignmentPending && clock() >= assignmentDeadline) { Stop("assignment-intent-2-second-limit"); return; }
                if (!assignmentPending || !journal.Persisted(pending)) return;
                if (!api.EmptyStoppedAndDriveable(target) || !api.EmptyStoppedAndDriveable(control))
                    throw new InvalidOperationException("pair changed before assignment dispatch");
                RequireReady(); RequirePair();
                attempted = true; assignmentPending = false; // Consume before dispatch: exceptions never retry.
                Record("native-dispatch-attempt role=A handle=" + target.Handle + " token=" + target.Token + " profile=ra_gapriv01_bati profileHash=dd89929d native=4F0C413926060B38; durable intent already acknowledged; no retry");
                if (clock() >= assignmentCutoff) { Stop("assignment-100-second-limit"); return; }
                api.AssignPrivateProfile(target);
                Record("invocation-returned profile-resolution=UNVERIFIED audible-behaviour=UNOBSERVED; not a pass");
                Snapshot("post-assignment");
            }
            catch (System.Threading.ThreadAbortException) { throw; }
            catch (Exception e) { BestEffort("probe-fault " + e.GetType().Name + ":" + e.Message); Stop("probe-fault"); }
        }
        bool RetireOne(ProbeLifetime item)
        {
            if (item == null || item.Retired) return true;
            if (!api.Exists(item)) { item.Retired = true; BestEffort("already-absent role=" + item.Role); return true; }
            if (!Owns(item)) { BestEffort("retirement-refused stale identity role=" + item.Role); return false; }
            // Retire independently checks emptiness/stationarity, not driveability.
            item.Retired = api.Retire(item);
            BestEffort("retirement role=" + item.Role + " handle=" + item.Handle + " deleted=" + item.Retired);
            return item.Retired;
        }
        internal void Stop(string reason)
        {
            stopping = true; Active = false; spawnPending = assignmentPending = baselinePending = false;
            try { guard.RequestStop(); } catch { }
            try { guard.StopAcknowledged(); } catch { }
            BestEffort("stop reason=" + reason + "; no restore assignment; retire only validated test lifetimes");
            bool a = false, b = false;
            try
            {
                if (api.StoryReady)
                {
                    try { a = RetireOne(target); } catch (System.Threading.ThreadAbortException) { throw; } catch (Exception e) { BestEffort("cleanup-A " + e.Message); }
                    try { b = RetireOne(control); } catch (System.Threading.ThreadAbortException) { throw; } catch (Exception e) { BestEffort("cleanup-B " + e.Message); }
                    if (loading) { api.ReleaseModel(); loading = false; }
                }
            }
            catch (System.Threading.ThreadAbortException) { throw; }
            catch (Exception e) { BestEffort("cleanup-unavailable " + e.Message); }
            CleanupComplete = a && b; Finished = true;
            if (CleanupComplete) try { guard.VehiclesRetired(); } catch { }
            BestEffort("session-ended cleanup-complete=" + CleanupComplete + " verdict=INCONCLUSIVE_PENDING_INDEPENDENT_REVIEW");
        }
        internal void Aborted()
        {
            // SHVDNE can raise Aborted on its domain thread. Never call game APIs here.
            stopping = true; Active = false; Finished = true;
            try { guard.RequestStop(); } catch { }
            try { guard.StopAcknowledged(); } catch { }
            BestEffort("aborted native-cleanup-skipped cleanup-complete=" + CleanupComplete + "; independent recovery UNQUALIFIED");
        }
    }
}
