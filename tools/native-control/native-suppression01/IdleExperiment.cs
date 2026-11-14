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
        bool CanSwitch(Lifetime target, Lifetime control);
        bool CanRestore(Lifetime target);
        void Assign(Lifetime item, string profile, Func<bool> stillAdmitted);
        bool Delete(Lifetime item);
        void ReleaseModel();
        string Snapshot(Lifetime item);
    }
    internal sealed class IdleExperiment
    {
        internal static readonly string[] Profiles = {
            "ra_ns01_bati_a", "ra_ns01_bati_b", "ra_ns01_bati_c",
            "ra_ns01_bati_b", "ra_ns01_bati_a", "BATI"
        };
        readonly IIdleApi api;
        readonly Action<string> log;
        readonly Func<long> clock;
        readonly long frequency;
        readonly Func<int> newToken;
        readonly Func<bool> healthy;
        Lifetime a, b;
        long end, loadEnd, armEnd;
        bool used, loading, changed, restoreAttempted, stopped, aborted;
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
            if (used || aborted || !healthy() || !api.StoryReady) throw new InvalidOperationException("one pair per load, healthy journal and Story Mode required");
            used = true; end = clock() + 600 * frequency; loadEnd = clock() + 5 * frequency;
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
                    Status = "STOCK baseline - A left, B right; enter A, idle; F6 arm / F7 apply";
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
            RequirePair();
            if (!api.CanSwitch(a, b)) throw new InvalidOperationException("A must idle with my ped driving, B idling, empty and stopped");
            armEnd = clock() + 10 * frequency;
            Status = "ARMED " + Next + " - F7 within 10 seconds; F9 restore";
            log("armed phase=" + next + " requested=" + Next);
        }
        internal void Apply()
        {
            long expiry = armEnd; armEnd = 0;
            if (!Active || !healthy() || next >= Profiles.Length || expiry == 0 || clock() >= expiry || clock() >= end)
                throw new InvalidOperationException("not armed or expired");
            RequirePair();
            if (!api.CanSwitch(a, b)) throw new InvalidOperationException("operating context changed");
            string profile = Profiles[next++]; // Consume before dispatch, including a throwing void native.
            changed = true;
            log("assignment-intent phase=" + (next - 1) + " handle=" + a.Handle + " token=" + a.Token + " profile=" + profile);
            try
            {
                api.Assign(a, profile, delegate {
                    bool admitted = !aborted && !stopped && healthy() && clock() < expiry && clock() < end;
                    // A refused final guard has not dispatched BATI; the stop
                    // path may still perform its separately admitted release.
                    if (admitted && profile == "BATI") restoreAttempted = true;
                    return admitted;
                });
                if (profile == "BATI") { changed = false; RestoreReturned = true; stopped = true; }
                Status = "REQUEST RETURNED " + profile + " - audible result UNOBSERVED; next " + Next;
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
