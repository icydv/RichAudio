// Authored deterministic contracts only. No game, native adapter, device or PCM scheduler.
using System;
using System.Threading;
using RichAudio.Ownership.Boundary01;

internal static class TestOwnershipBoundary01
{
    static int checks, cases;
    const long Start = 1000;
    const string Domain = "ownership-fixture-qpc";
    sealed class Fixture
    {
        public FixtureOwnershipAuthority Authority;
        public SourceKey Source;
        public OwnershipBoundary Boundary;
        public ReadinessDecision Ready;
        public PreviousStateToken Prior;
    }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); checks++; }
    static void Throws<T>(Action action, string message) where T : Exception
    {
        bool caught = false; try { action(); } catch (T) { caught = true; } Check(caught, message);
    }
    static void Run(string name, Action test) { test(); cases++; Console.WriteLine("PASS " + name); }
    static SourceKey Key(int handle = 7, long generation = 1, string category = "engine-exhaust", string session = "fixture-session", uint model = 0xf9300cc5)
    { return new SourceKey(session, handle, generation, model, category); }
    static OwnershipLimits Limits(long lease = 200, long restore = 50)
    { return new OwnershipLimits(Domain, 1000, lease, restore); }
    static ReadinessDecision Ready(SourceKey source, long now = Start)
    {
        var result = ReplacementReadiness.Evaluate(ReplacementReadiness.AuthoredFixture(source, now), now, ReadinessLimits.AuthoredFixture(Domain, 1000));
        Check(result.Ready, "authored readiness prerequisites: " + String.Join(",", result.Reasons)); return result;
    }
    static Fixture Make(SourceKey source = null, FixtureOwnershipAuthority authority = null, string priorProfile = "custom-prior-engine-and-auxiliaries")
    {
        source = source ?? Key(); authority = authority ?? new FixtureOwnershipAuthority(); var ready = Ready(source);
        var fixture = new Fixture { Source = source, Authority = authority, Ready = ready,
            Boundary = authority.CreateBoundary(source, Limits(), ready.Evidence.Assets.ProfileIdentity),
            Prior = authority.CapturePrevious(source, priorProfile, "custom-mod-owner:" + source.Handle, "prior-revision:" + source.Handle) };
        Check(authority.AuthorizeMapping(fixture.Prior, ready), "explicit authored prior-to-replacement mapping"); return fixture;
    }
    static void Prepare(Fixture f) { Check(f.Boundary.Prepare(f.Ready, f.Prior, Start), "fixture prepared"); }
    static OwnershipCommand DispatchClaim(Fixture f)
    {
        Prepare(f); var command = f.Boundary.RequestClaim(Start + 1); Check(command != null, "claim data created");
        Check(f.Boundary.TryAdmitDispatch(command, f.Source, Start + 2), "claim dispatch admitted before activation"); return command;
    }
    static OwnershipCommand Own(Fixture f)
    {
        var command = DispatchClaim(f); long completed = command.ActivationAtTicks + command.TransitionTicks;
        Check(f.Boundary.Acknowledge(f.Authority.Receipt(command, "owned-revision:" + f.Source.Handle), completed), "conditional handoff acknowledged after completion");
        Check(f.Boundary.Snapshot(completed).State == OwnershipState.CLAIMED, "claimed only with independent fixture proof"); return command;
    }
    static OwnershipCommand StopAndRestore(Fixture f, long now = Start + 13)
    {
        var command = f.Boundary.Stop(now, "normal-stop"); Check(command != null && command.Kind == OwnershipCommandKind.Restore, "restoration requested");
        Check(f.Boundary.TryAdmitDispatch(command, f.Source, now), "restoration dispatch admitted");
        Check(f.Boundary.Acknowledge(f.Authority.Receipt(command, "restored-revision:" + f.Source.Handle), now + 1), "restoration independently verified"); return command;
    }
    static OwnershipHealth Health(Fixture f, bool renderer = true, bool controller = true, bool recovery = true, bool competing = false, bool eligible = true)
    { return new OwnershipHealth(f.Source, eligible, renderer, controller, recovery, competing); }

    static void Tests()
    {
        Run("immutable exact identity and whole-vehicle resource scope", delegate {
            var key = Key(); Check(key.Equals(Key()), "same exact identity"); Check(key.GetHashCode() == Key().GetHashCode(), "equal hash contract");
            foreach (var other in new[] { Key(handle: 8), Key(generation: 2), Key(category: "horn"), Key(session: "other-session"), Key(model: 1) })
                Check(!key.Equals(other), "every identity field participates");
            Check(Key(category: "horn").ResourceConflictKey == key.ResourceConflictKey, "category cannot split native audio-object control");
            Check(Key(session: "A").ResourceConflictKey != Key(session: "a").ResourceConflictKey, "session ordinal comparison");
            Throws<ArgumentException>(() => Key(handle: 0), "zero handle rejected");
            Throws<ArgumentException>(() => Key(generation: 0), "zero generation rejected");
            Throws<ArgumentException>(() => Key(session: "bad\nidentity"), "control characters rejected");
        });
        Run("limits are finite monotonic-clock declarations", delegate {
            Throws<ArgumentException>(() => new OwnershipLimits(Domain, 0, 1, 1), "zero clock rejected");
            Throws<ArgumentException>(() => Limits(30001), "lease above thirty seconds rejected");
            Throws<ArgumentException>(() => Limits(restore: 10001), "restore above ten seconds rejected");
            Throws<ArgumentException>(() => Limits(lease: 0), "zero lease rejected");
        });
        Run("production construction always denies authored evidence", delegate {
            var f = Make(); var production = new OwnershipBoundary(f.Source, Limits());
            Check(!production.Prepare(f.Ready, f.Prior, Start), "production rejects positive fixture tokens");
            Check(production.RequestClaim(Start) == null, "production has no command");
            Check(production.Snapshot().EvidenceScope == "unqualified-production", "production not labelled fixture qualified");
            Check(!OwnershipBoundary.ProductionClaimsEnabled && OwnershipBoundary.RegisteredNativeAdapterCount == 0, "no production native capability");
        });
        Run("readiness source clock and selected profile are bound", delegate {
            var f = Make(); Check(!f.Boundary.Prepare(Ready(Key(handle: 8)), f.Prior, Start), "foreign source rejected");
            var wrongClock = f.Authority.CreateBoundary(f.Source, new OwnershipLimits("another-clock", 1000, 200, 50), f.Ready.Evidence.Assets.ProfileIdentity);
            Check(!wrongClock.Prepare(f.Ready, f.Prior, Start), "clock domain rejected");
            var wrongFrequency = f.Authority.CreateBoundary(f.Source, new OwnershipLimits(Domain, 2000, 200, 50), f.Ready.Evidence.Assets.ProfileIdentity);
            Check(!wrongFrequency.Prepare(f.Ready, f.Prior, Start), "clock frequency rejected");
            var wrongProfile = f.Authority.CreateBoundary(f.Source, Limits(), "other-render-profile");
            Check(!wrongProfile.Prepare(f.Ready, f.Prior, Start), "different profile cannot use qualified graph");
            Check(!f.Boundary.Prepare(null, f.Prior, Start), "missing readiness rejected");
            Prepare(f); var c = f.Boundary.RequestClaim(Start + 1);
            Check(Object.ReferenceEquals(c.Readiness, f.Ready), "immutable graph, asset and generation evidence retained with command");
        });
        Run("prior state requires exact source and issuing authority", delegate {
            var f = Make(); var other = new FixtureOwnershipAuthority();
            Check(!f.Boundary.Prepare(f.Ready, new PreviousStateToken(f.Source, "model-default", "unknown", "asserted"), Start), "declared baseline cannot masquerade as readback");
            Check(!f.Boundary.Prepare(f.Ready, other.CapturePrevious(f.Source, "custom", "owner", "revision"), Start), "foreign authority readback rejected");
            Check(!f.Boundary.Prepare(f.Ready, f.Authority.CapturePrevious(Key(generation: 2), "custom", "owner", "revision"), Start), "foreign generation readback rejected");
            Prepare(f);
        });
        Run("prior custom state and replacement graph need an explicit authored mapping", delegate {
            var f = Make(); var anotherPrior = f.Authority.CapturePrevious(f.Source, "different-custom-prior", "custom-owner", "new-prior-revision");
            Check(!f.Boundary.Prepare(f.Ready, anotherPrior, Start), "another custom prior cannot reuse mapped graph evidence");
            var sameShapeNewEvidence = Ready(f.Source);
            Check(!f.Boundary.Prepare(sameShapeNewEvidence, f.Prior, Start), "fresh graph receipt needs its own exact mapping");
            Check(f.Authority.AuthorizeMapping(anotherPrior, sameShapeNewEvidence), "fixture explicitly supplies compatibility assumption");
            Check(f.Boundary.Prepare(sameShapeNewEvidence, anotherPrior, Start), "only expressly mapped pair prepared");
        });
        Run("preparation expiry never becomes native claim", delegate {
            var f = Make(); Prepare(f); var c = f.Boundary.RequestClaim(Start + 1);
            Check(!f.Boundary.TryAdmitDispatch(c, f.Source, f.Ready.ValidUntilTicks), "dispatch at preparation expiry rejected");
            var s = f.Boundary.Snapshot(); Check(s.State == OwnershipState.NATIVE && s.NativeEvidence == "untouched" && s.Terminal, "not-dispatched expiration remains untouched");
            Check(!f.Boundary.Prepare(Ready(f.Source, Start + 100), f.Prior, Start + 100), "same boundary cannot renew");
        });
        Run("scheduled handoff cannot acknowledge before activation or completion", delegate {
            var f = Make(); var c = DispatchClaim(f); var receipt = f.Authority.Receipt(c, "owned-revision");
            Check(!f.Boundary.Acknowledge(receipt, c.ActivationAtTicks - 1), "future handoff cannot be credited early");
            Check(!f.Boundary.Acknowledge(receipt, c.ActivationAtTicks), "activation alone not completion");
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(c, "owned-revision", transitionCompletedAtTicks: c.ActivationAtTicks), c.ActivationAtTicks + c.TransitionTicks), "receipt cannot invent completed transition");
            Check(f.Boundary.Acknowledge(receipt, c.ActivationAtTicks + c.TransitionTicks), "completion at scheduled boundary accepted");
            Check(f.Boundary.Snapshot().LeaseExpiresAtTicks > c.ActivationAtTicks, "ownership lease survives preparation window");
        });
        Run("activation deadline strictly rejects late acknowledgement", delegate {
            var f = Make(); var c = DispatchClaim(f);
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(c, "owned-revision"), c.DeadlineTicks), "ack at deadline rejected");
            Check(f.Boundary.Snapshot().State == OwnershipState.UNKNOWN, "possible native write remains unknown");
        });
        Run("concurrent dispatch admission is exactly once", delegate {
            var f = Make(); Prepare(f); var c = f.Boundary.RequestClaim(Start + 1);
            int accepted = 0; Exception failure = null; var begin = new ManualResetEvent(false); var threads = new Thread[8];
            for (int i = 0; i < threads.Length; i++)
            {
                threads[i] = new Thread(delegate() { try { begin.WaitOne(); if (f.Boundary.TryAdmitDispatch(c, f.Source, Start + 2)) Interlocked.Increment(ref accepted); } catch (Exception ex) { Interlocked.CompareExchange(ref failure, ex, null); } });
                threads[i].IsBackground = true; threads[i].Start();
            }
            begin.Set(); foreach (var thread in threads) Check(thread.Join(5000), "dispatch racer completed"); begin.Dispose();
            Check(failure == null && accepted == 1, "one of eight concurrent dispatchers admitted");
            Check(!f.Boundary.Snapshot().ReplacementPermitted, "admission is not claim proof");
        });
        Run("concurrent same-vehicle category preparation is serialized", delegate {
            var authority = new FixtureOwnershipAuthority(); var a = Make(Key(category: "engine"), authority); var b = Make(Key(category: "exhaust"), authority);
            int accepted = 0; var begin = new ManualResetEvent(false); Exception failure = null;
            ThreadStart first = delegate { try { begin.WaitOne(); if (a.Boundary.Prepare(a.Ready, a.Prior, Start)) Interlocked.Increment(ref accepted); } catch (Exception e) { Interlocked.CompareExchange(ref failure, e, null); } };
            ThreadStart second = delegate { try { begin.WaitOne(); if (b.Boundary.Prepare(b.Ready, b.Prior, Start)) Interlocked.Increment(ref accepted); } catch (Exception e) { Interlocked.CompareExchange(ref failure, e, null); } };
            var ta = new Thread(first); var tb = new Thread(second); ta.IsBackground = tb.IsBackground = true; ta.Start(); tb.Start(); begin.Set();
            Check(ta.Join(5000) && tb.Join(5000), "category racers completed"); begin.Dispose();
            Check(failure == null && accepted == 1, "one whole-vehicle audio scope reserved");
        });
        Run("invocation returns and incomplete receipts never prove ownership", delegate {
            var f = Make(); var c = DispatchClaim(f); long now = c.ActivationAtTicks + c.TransitionTicks;
            Check(!f.Boundary.Acknowledge(new OwnershipReceipt(c), now), "void native return is unverified");
            foreach (var receipt in new[] {
                f.Authority.Receipt(c, "new", conditional: false), f.Authority.Receipt(c, "new", effective: false),
                f.Authority.Receipt(c, "new", preserved: false), f.Authority.Receipt(c, "new", handoff: false),
                f.Authority.Receipt(c, "new", expectedOwner: "other-owner"), f.Authority.Receipt(c, "new", expectedRevision: "other-revision"),
                f.Authority.Receipt(c, "new", resultOwner: "other-owner"), f.Authority.Receipt(c, "new", resultProfile: "other-profile"),
                f.Authority.Receipt(c, c.ExpectedRevisionToken) }) Check(!f.Boundary.Acknowledge(receipt, now), "incomplete or mismatched conditional proof rejected");
            Check(!f.Boundary.Snapshot().ReplacementPermitted, "invalid proof keeps replacement disabled");
            Check(f.Boundary.Acknowledge(f.Authority.Receipt(c, "new"), now), "only complete matching proof claims");
        });
        Run("foreign authority and cross-boundary acknowledgements rejected", delegate {
            var a = Make(); var ca = DispatchClaim(a); var b = Make(); var cb = DispatchClaim(b); long now = ca.ActivationAtTicks + ca.TransitionTicks;
            Check(!a.Boundary.Acknowledge(b.Authority.Receipt(ca, "new"), now), "foreign issuer cannot certify local command");
            Check(!a.Boundary.Acknowledge(a.Authority.Receipt(cb, "new"), now), "foreign boundary command cannot certify local claim");
            Check(ca.BoundaryId != cb.BoundaryId && ca.TargetOwnerToken != cb.TargetOwnerToken, "epochs prevent cross-controller token collision");
            Check(!a.Boundary.TryAdmitDispatch(cb, a.Source, now), "foreign pending command rejected");
            Check(a.Boundary.Acknowledge(a.Authority.Receipt(ca, "new"), now), "correct acknowledgement accepted");
            Check(!a.Boundary.Acknowledge(a.Authority.Receipt(ca, "new2"), now), "duplicate acknowledgement rejected");
        });
        Run("no-dispatch stop is distinct from possibly-dispatched stop", delegate {
            var before = Make(); Prepare(before); before.Boundary.RequestClaim(Start + 1); before.Boundary.Shutdown(Start + 2);
            Check(before.Boundary.Snapshot().State == OwnershipState.NATIVE && before.Boundary.Snapshot().NativeEvidence == "untouched", "unexecuted request cancels safely");
            Check(!before.Boundary.Snapshot().NativeRecoveryVerified, "untouched is not restored");
            var after = Make(); var command = DispatchClaim(after); after.Boundary.Abort(Start + 3);
            Check(after.Boundary.Snapshot().State == OwnershipState.UNKNOWN && after.Boundary.Snapshot().PendingCommand == null, "admitted request ambiguity is terminal unknown");
            Check(!after.Boundary.Acknowledge(after.Authority.Receipt(command, "late"), Start + 12), "late receipt cannot revive unknown");
        });
        Run("exact custom prior state restored with conditional owner and revision", delegate {
            var f = Make(priorProfile: "custom-mod-profile-unique"); var claim = Own(f); var restore = StopAndRestore(f);
            Check(restore.ExpectedOwnerToken == claim.TargetOwnerToken && restore.ExpectedRevisionToken == "owned-revision:" + f.Source.Handle, "restore compares current claim owner and revision");
            Check(restore.TargetProfileToken == "custom-mod-profile-unique" && restore.TargetOwnerToken == f.Prior.OwnerToken, "custom prior profile and owner restored exactly");
            var state = f.Boundary.Snapshot(); Check(state.FixtureRecoveryVerified && !state.NativeRecoveryVerified && state.State == OwnershipState.NATIVE && state.Terminal, "only fixture proof returns fixture-restored state; GTA remains unverified");
            Check(state.EvidenceScope == "authored-fixture", "restoration evidence remains fixture-scoped");
            Check(f.Boundary.RequestClaim(Start + 15) == null, "restoration cannot silently reacquire");
        });
        Run("multiple vehicles keep independent baselines and transactions", delegate {
            var authority = new FixtureOwnershipAuthority(); var a = Make(Key(handle: 11, generation: 3), authority, "custom-alpha"); var b = Make(Key(handle: 12, generation: 9), authority, "custom-beta");
            var ca = Own(a); var cb = Own(b); var ra = a.Boundary.Stop(Start + 13, "vehicle-switch"); var rb = b.Boundary.Stop(Start + 13, "shutdown");
            Check(ra.TargetProfileToken == "custom-alpha" && rb.TargetProfileToken == "custom-beta", "no shared global baseline");
            Check(ca.Source.Generation == 3 && cb.Source.Generation == 9 && ca.ResourceConflictKey != cb.ResourceConflictKey, "independent vehicle generations");
            Check(a.Boundary.TryAdmitDispatch(ra, a.Source, Start + 13) && b.Boundary.TryAdmitDispatch(rb, b.Source, Start + 13), "independent restoration admissions");
            Check(!a.Boundary.Acknowledge(authority.Receipt(rb, "wrong"), Start + 14), "sibling receipt rejected");
            Check(a.Boundary.Acknowledge(authority.Receipt(ra, "restored-a"), Start + 14) && b.Boundary.Acknowledge(authority.Receipt(rb, "restored-b"), Start + 14), "both baselines independently restored");
        });
        Run("handle reuse cannot redirect pending restoration", delegate {
            var f = Make(); Own(f); var restore = f.Boundary.Stop(Start + 13, "switch");
            Check(!f.Boundary.TryAdmitDispatch(restore, Key(generation: 2), Start + 13), "new generation cannot receive old restore");
            Check(f.Boundary.Snapshot().State == OwnershipState.UNKNOWN, "old generation recovery remains unknown");
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(restore, "late"), Start + 14), "stale old generation receipt rejected");
        });
        Run("identity loss before dispatch fails without a native mutation", delegate {
            var f = Make(); Prepare(f); var c = f.Boundary.RequestClaim(Start + 1);
            Check(!f.Boundary.TryAdmitDispatch(c, Key(generation: 2), Start + 2), "claim identity revalidated at dispatch");
            Check(f.Boundary.Snapshot().State == OwnershipState.FAILED && f.Boundary.Snapshot().NativeEvidence == "untouched", "known failure distinct from uncertain native state");
        });
        Run("competing owner forbids blind baseline reset and retains reservation", delegate {
            var f = Make(); Own(f); f.Boundary.ObserveHealth(Health(f, competing: true), Start + 13);
            Check(f.Boundary.Snapshot().State == OwnershipState.UNKNOWN && f.Boundary.Snapshot().PendingCommand == null, "no unconditional restore after competitor");
            var siblingCategory = Make(Key(category: "horn"), f.Authority);
            Check(!siblingCategory.Boundary.Prepare(siblingCategory.Ready, siblingCategory.Prior, Start), "unknown ownership retains whole-vehicle reservation");
        });
        Run("renderer and IPC loss withdraw replacement and request conditional recovery", delegate {
            var f = Make(); Own(f); var restore = f.Boundary.ObserveHealth(Health(f, renderer: false), Start + 13);
            Check(restore != null && restore.Kind == OwnershipCommandKind.Restore, "renderer loss requests exact recovery");
            Check(!f.Boundary.Snapshot().ReplacementPermitted && !f.Boundary.Snapshot().NativeRecoveryVerified, "request is not successful recovery");
        });
        Run("controller loss needs independently progressing recovery executor", delegate {
            var working = Make(); Own(working); Check(working.Boundary.ObserveHealth(Health(working, controller: false), Start + 13) != null, "fixture independent executor receives recovery intent");
            var stuck = Make(); Own(stuck); Check(stuck.Boundary.ObserveHealth(Health(stuck, controller: false, recovery: false), Start + 13) == null, "stalled scheduler cannot dispatch recovery");
            Check(stuck.Boundary.Snapshot().State == OwnershipState.UNKNOWN, "shared scheduler failure does not count as restored");
        });
        Run("pause and resume never renew or reactivate a claim", delegate {
            var prepared = Make(); Prepare(prepared); prepared.Boundary.Pause(Start + 1);
            Check(prepared.Boundary.Snapshot().State == OwnershipState.NATIVE && prepared.Boundary.Snapshot().Paused, "pause before write cancels");
            Check(!prepared.Boundary.Resume(Start + 2) && prepared.Boundary.RequestClaim(Start + 2) == null, "resume never rearms prepared boundary");
            var owned = Make(); Own(owned); Check(owned.Boundary.Pause(Start + 13) != null, "pause of owned source requests restoration");
            Check(!owned.Boundary.Resume(Start + 14) && !owned.Boundary.Snapshot().ReplacementPermitted, "resume cannot bypass restoring state");
        });
        Run("fresh booleans cannot extend immutable source and output health horizon", delegate {
            var f = Make(); Own(f); long expiry = f.Boundary.Snapshot().LeaseExpiresAtTicks;
            Check(expiry <= f.Ready.SafetyValidUntilTicks && expiry < f.Ready.LeaseExpiresAtTicks, "lease capped by last qualified health evidence");
            f.Boundary.ObserveHealth(Health(f), expiry - 1); Check(f.Boundary.Snapshot().LeaseExpiresAtTicks == expiry, "health flags cannot renew lease");
            var s = f.Boundary.Snapshot(expiry); Check(s.State == OwnershipState.RESTORING && !s.ReplacementPermitted, "timestamped snapshot expires permission exactly on bound");
            Check(!s.NativeRecoveryVerified, "policy expiry is not native expiry");
            s = f.Boundary.Snapshot(s.PendingCommand.DeadlineTicks); Check(s.State == OwnershipState.UNKNOWN && !s.NativeRecoveryVerified, "no restoration proof remains unknown");
        });
        Run("monotonic timestamps reject rewinds and future acknowledgement proof", delegate {
            var f = Make(); var c = DispatchClaim(f);
            Check(!f.Boundary.TryAdmitDispatch(c, f.Source, Start + 1), "rewound dispatch rejected");
            Throws<ArgumentOutOfRangeException>(() => f.Boundary.Snapshot(Start + 1), "rewound permission query rejected");
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(c, "new", transitionCompletedAtTicks: Start + 19), Start + 12), "future completion proof rejected");
            Check(f.Boundary.Acknowledge(f.Authority.Receipt(c, "new"), Start + 12), "current complete proof accepted");
        });
        Run("late observation cannot restart the restoration deadline", delegate {
            var f = Make(); Own(f); long expiry = f.Boundary.Snapshot().LeaseExpiresAtTicks;
            var observedLate = f.Boundary.Snapshot(expiry + 49);
            Check(observedLate.State == OwnershipState.RESTORING && observedLate.PendingCommand.DeadlineTicks == expiry + 50, "late detection retains original recovery deadline");
            Check(f.Boundary.Snapshot(expiry + 50).State == OwnershipState.UNKNOWN, "absolute restoration deadline enforced");
            var veryLate = Make(); Own(veryLate); long oldExpiry = veryLate.Boundary.Snapshot().LeaseExpiresAtTicks;
            var s = veryLate.Boundary.Snapshot(oldExpiry + 500);
            Check(s.State == OwnershipState.UNKNOWN && s.PendingCommand == null, "missed lease and restore interval cannot grant new recovery time");
        });
        Run("restoration dispatch and acknowledgement are once-only", delegate {
            var f = Make(); Own(f); var restore = f.Boundary.Shutdown(Start + 13);
            Check(Object.ReferenceEquals(restore, f.Boundary.Shutdown(Start + 13)), "repeated stop does not create new restoration transaction");
            Check(f.Boundary.TryAdmitDispatch(restore, f.Source, Start + 13), "restore admitted once");
            Check(!f.Boundary.TryAdmitDispatch(restore, f.Source, Start + 13), "duplicate restore dispatch rejected");
            var receipt = f.Authority.Receipt(restore, "restored"); Check(f.Boundary.Acknowledge(receipt, Start + 14), "restore receipt accepted once");
            Check(!f.Boundary.Acknowledge(receipt, Start + 14), "duplicate restore receipt rejected");
        });
        Run("restoration proof cannot predate delayed dispatch", delegate {
            var f = Make(); Own(f); var restore = f.Boundary.Stop(Start + 13, "normal-stop");
            Check(f.Boundary.TryAdmitDispatch(restore, f.Source, Start + 18), "delayed restore dispatch admitted");
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(restore, "restored", transitionCompletedAtTicks: Start + 13), Start + 19), "pre-dispatch completion rejected");
            Check(f.Boundary.Acknowledge(f.Authority.Receipt(restore, "restored", transitionCompletedAtTicks: Start + 18), Start + 19), "completion after dispatch accepted");
        });
        Run("restoration reservation releases only with proof or untouched cancellation", delegate {
            var f = Make(); Own(f); StopAndRestore(f);
            var next = Make(Key(category: "horn"), f.Authority); var fresh = Ready(next.Source, Start + 20);
            Check(f.Authority.AuthorizeMapping(next.Prior, fresh), "fresh preparation explicitly remapped");
            Check(next.Boundary.Prepare(fresh, next.Prior, Start + 20), "verified restored vehicle can be reserved by new boundary");
            var a = Make(); Prepare(a); a.Boundary.Stop(Start + 1, "cancel-before-write");
            var b = Make(Key(category: "horn"), a.Authority); Prepare(b);
        });
        Run("entity deletion and terminal unknown cannot be repaired by fresh flags", delegate {
            var f = Make(); var c = Own(f); f.Boundary.ObserveHealth(new OwnershipHealth(null, false, false, false, false, false), Start + 13);
            string reason = f.Boundary.Snapshot().Reason;
            Check(f.Boundary.Snapshot().State == OwnershipState.UNKNOWN, "deleted target produces no restore write");
            f.Boundary.ObserveHealth(Health(f), Start + 14); f.Boundary.Resume(Start + 14); f.Boundary.Stop(Start + 14, "cleanup-finished");
            Check(!f.Boundary.Acknowledge(f.Authority.Receipt(c, "late"), Start + 14), "late claim proof cannot restore terminal state");
            Check(f.Boundary.Snapshot().State == OwnershipState.UNKNOWN && f.Boundary.Snapshot().Reason == reason, "cleanup or fresh flags cannot relabel uncertain recovery");
        });
    }
    public static int Main()
    {
        try { Tests(); Console.WriteLine("PASS ownership boundary: " + cases + " cases, " + checks + " assertions; authored offline fixtures only"); return 0; }
        catch (Exception ex) { Console.Error.WriteLine("FAIL ownership boundary after " + cases + " cases, " + checks + " assertions: " + ex); return 1; }
    }
}
