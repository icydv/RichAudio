// GATE-A-OWNERSHIP-01: an offline integration contract, not a native adapter.
// Commands are inert data. No native, renderer, process, IPC or output API is used.
using System;
#if OWNERSHIP_FIXTURES
using System.Collections.Generic;
#endif

namespace RichAudio.Ownership.Boundary01
{
    public sealed class SourceKey : IEquatable<SourceKey>
    {
        readonly string session, category;
        readonly int handle;
        readonly long generation;
        readonly uint model;
        public SourceKey(string session, int handle, long generation, uint model, string category)
        {
            if (!ValidText(session, 128) || !ValidText(category, 64) || handle <= 0 || generation <= 0 || model == 0)
                throw new ArgumentException("An exact session/entity/generation/model/category key is required.");
            this.session = session; this.handle = handle; this.generation = generation; this.model = model; this.category = category;
        }
        internal static bool ValidText(string value, int maximum)
        {
            if (String.IsNullOrWhiteSpace(value) || value.Length > maximum) return false;
            foreach (char c in value) if (Char.IsControl(c)) return false;
            return true;
        }
        public string Session { get { return session; } }
        public int Handle { get { return handle; } }
        public long Generation { get { return generation; } }
        public uint Model { get { return model; } }
        public string Category { get { return category; } }
        public bool Equals(SourceKey other)
        {
            return other != null && handle == other.handle && generation == other.generation && model == other.model &&
                String.Equals(session, other.session, StringComparison.Ordinal) && String.Equals(category, other.category, StringComparison.Ordinal);
        }
        public override bool Equals(object other) { return Equals(other as SourceKey); }
        public override int GetHashCode()
        {
            unchecked { return (((StringComparer.Ordinal.GetHashCode(session) * 397 ^ handle) * 397 ^ generation.GetHashCode()) * 397 ^ (int)model) * 397 ^ StringComparer.Ordinal.GetHashCode(category); }
        }
        // The current candidate primitive changes a vehicle audio object. A category
        // label is NOT evidence that two categories have independent native controls.
        public string ResourceConflictKey
        {
            get { return "vehicle-audio-object:" + session.Length + ":" + session + ":" + handle.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":" + generation.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":" + model.ToString(System.Globalization.CultureInfo.InvariantCulture); }
        }
    }

    public enum OwnershipState { NATIVE, PREPARED, CLAIMED, RESTORING, FAILED, UNKNOWN }
    public enum OwnershipCommandKind { Claim, Restore }

    public sealed class OwnershipLimits
    {
        readonly string clockDomain;
        readonly long frequency, lease, restore;
        public OwnershipLimits(string clockDomain, long clockFrequency, long leaseTicks, long restoreTicks)
        {
            if (!SourceKey.ValidText(clockDomain, 128) || clockFrequency <= 0 || clockFrequency > 1000000000000L ||
                leaseTicks <= 0 || leaseTicks > clockFrequency * 30 || restoreTicks <= 0 || restoreTicks > clockFrequency * 10)
                throw new ArgumentException("A shared monotonic clock, lease <=30 seconds and restoration <=10 seconds are required.");
            this.clockDomain = clockDomain; frequency = clockFrequency; lease = leaseTicks; restore = restoreTicks;
        }
        public string ClockDomain { get { return clockDomain; } }
        public long ClockFrequency { get { return frequency; } }
        public long LeaseTicks { get { return lease; } }
        public long RestoreTicks { get { return restore; } }
    }

    public sealed class PreviousStateToken
    {
        readonly SourceKey source;
        readonly string profile, owner, revision;
#if OWNERSHIP_FIXTURES
        readonly FixtureOwnershipAuthority issuingAuthority;
        internal bool AuthoredBy(FixtureOwnershipAuthority authority) { return Object.ReferenceEquals(issuingAuthority, authority); }
        internal PreviousStateToken(SourceKey source, string profile, string owner, string revision, FixtureOwnershipAuthority authority)
            : this(source, profile, owner, revision) { issuingAuthority = authority; }
#endif
        // Public declarations are unverified. A string supplied by a caller is not
        // effective-state readback or proof that a model default was in effect.
        public PreviousStateToken(SourceKey source, string profile, string owner, string revision)
        {
            if (source == null || !SourceKey.ValidText(profile, 256) || !SourceKey.ValidText(owner, 256) || !SourceKey.ValidText(revision, 256))
                throw new ArgumentException("Exact prior profile, owner and revision tokens are required.");
            this.source = source; this.profile = profile; this.owner = owner; this.revision = revision;
        }
        public SourceKey Source { get { return source; } }
        public string ProfileToken { get { return profile; } }
        public string OwnerToken { get { return owner; } }
        public string RevisionToken { get { return revision; } }
    }

    public sealed class OwnershipCommand
    {
        readonly string boundaryId, expectedOwner, expectedRevision, targetOwner, targetProfile;
        readonly long id, deadline, activation, transition;
        readonly SourceKey source;
        readonly OwnershipCommandKind kind;
        readonly ReadinessDecision readiness;
        internal OwnershipCommand(string boundaryId, long id, SourceKey source, OwnershipCommandKind kind, long deadline,
            string expectedOwner, string expectedRevision, string targetOwner, string targetProfile,
            long activation, long transition, ReadinessDecision readiness)
        {
            this.boundaryId = boundaryId; this.id = id; this.source = source; this.kind = kind; this.deadline = deadline;
            this.expectedOwner = expectedOwner; this.expectedRevision = expectedRevision; this.targetOwner = targetOwner; this.targetProfile = targetProfile;
            this.activation = activation; this.transition = transition; this.readiness = readiness;
        }
        public string BoundaryId { get { return boundaryId; } }
        public long Id { get { return id; } }
        public SourceKey Source { get { return source; } }
        public OwnershipCommandKind Kind { get { return kind; } }
        public long DeadlineTicks { get { return deadline; } }
        public long ActivationAtTicks { get { return activation; } }
        public long TransitionTicks { get { return transition; } }
        public ReadinessDecision Readiness { get { return readiness; } }
        public string ExpectedOwnerToken { get { return expectedOwner; } }
        public string ExpectedRevisionToken { get { return expectedRevision; } }
        public string TargetOwnerToken { get { return targetOwner; } }
        public string TargetProfileToken { get { return targetProfile; } }
        public string ResourceConflictKey { get { return source.ResourceConflictKey; } }
    }

    public sealed class OwnershipReceipt
    {
        readonly OwnershipCommand command;
        readonly string expectedOwner, expectedRevision, resultOwner, resultRevision, resultProfile;
        readonly bool conditional, effective, preserved, handoff;
        readonly long transitionCompleted;
#if OWNERSHIP_FIXTURES
        readonly FixtureOwnershipAuthority issuingAuthority;
        internal bool AuthoredBy(FixtureOwnershipAuthority authority) { return Object.ReferenceEquals(issuingAuthority, authority); }
        internal OwnershipReceipt(OwnershipCommand command, string expectedOwner, string expectedRevision, string resultOwner,
            string resultRevision, string resultProfile, bool conditional, bool effective, bool preserved, bool handoff,
            long transitionCompletedAtTicks, FixtureOwnershipAuthority authority)
            : this(command)
        {
            this.expectedOwner = expectedOwner; this.expectedRevision = expectedRevision; this.resultOwner = resultOwner;
            this.resultRevision = resultRevision; this.resultProfile = resultProfile; this.conditional = conditional;
            this.effective = effective; this.preserved = preserved; this.handoff = handoff; issuingAuthority = authority;
            transitionCompleted = transitionCompletedAtTicks;
        }
#endif
        // An invocation return alone contains none of the required independent proof.
        public OwnershipReceipt(OwnershipCommand invocationReturned)
        {
            if (invocationReturned == null) throw new ArgumentNullException("invocationReturned");
            command = invocationReturned; expectedOwner = expectedRevision = resultOwner = resultRevision = resultProfile = null;
            conditional = effective = preserved = handoff = false;
            transitionCompleted = -1;
        }
        public OwnershipCommand Command { get { return command; } }
        public string ExpectedOwnerToken { get { return expectedOwner; } }
        public string ExpectedRevisionToken { get { return expectedRevision; } }
        public string ResultOwnerToken { get { return resultOwner; } }
        public string ResultRevisionToken { get { return resultRevision; } }
        public string ResultProfileToken { get { return resultProfile; } }
        public bool ConditionalTransitionVerified { get { return conditional; } }
        public bool EffectiveStateVerified { get { return effective; } }
        public bool UnrelatedComponentsPreserved { get { return preserved; } }
        public bool ExclusiveHandoffVerified { get { return handoff; } }
        public long TransitionCompletedAtTicks { get { return transitionCompleted; } }
    }

    public sealed class OwnershipHealth
    {
        readonly SourceKey source;
        readonly bool eligible, renderer, controller, recovery, competing;
        public OwnershipHealth(SourceKey currentSource, bool sourceEligible, bool rendererHealthy, bool controllerHealthy, bool recoveryExecutorHealthy, bool competingWriter)
        {
            source = currentSource; eligible = sourceEligible; renderer = rendererHealthy; controller = controllerHealthy; recovery = recoveryExecutorHealthy; competing = competingWriter;
        }
        public SourceKey CurrentSource { get { return source; } }
        public bool SourceEligible { get { return eligible; } }
        public bool RendererHealthy { get { return renderer; } }
        public bool ControllerHealthy { get { return controller; } }
        public bool RecoveryExecutorHealthy { get { return recovery; } }
        public bool CompetingWriter { get { return competing; } }
    }

    public sealed class OwnershipSnapshot
    {
        public SourceKey Source { get; private set; }
        public OwnershipState State { get; private set; }
        public string Reason { get; private set; }
        public string NativeEvidence { get; private set; }
        public OwnershipCommand PendingCommand { get; private set; }
        public bool DispatchAdmitted { get; private set; }
        public bool ReplacementPermitted { get; private set; }
        public bool NativeRecoveryVerified { get; private set; }
        public bool FixtureRecoveryVerified { get; private set; }
        public bool Paused { get; private set; }
        public bool Terminal { get; private set; }
        public long LeaseExpiresAtTicks { get; private set; }
        public string EvidenceScope { get; private set; }
        internal OwnershipSnapshot(SourceKey source, OwnershipState state, string reason, string nativeEvidence, OwnershipCommand pending,
            bool dispatched, bool paused, bool terminal, long expiry, bool fixture)
        {
            Source = source; State = state; Reason = reason; NativeEvidence = nativeEvidence; PendingCommand = pending;
            DispatchAdmitted = dispatched; Paused = paused; Terminal = terminal; LeaseExpiresAtTicks = expiry;
            ReplacementPermitted = state == OwnershipState.CLAIMED && !paused && !terminal;
            NativeRecoveryVerified = false; // No real native adapter or effective-state getter exists here.
            FixtureRecoveryVerified = fixture && nativeEvidence == "fixture-verified-restored";
            EvidenceScope = fixture ? "authored-fixture" : "unqualified-production";
        }
    }

    public sealed class OwnershipBoundary
    {
        public const bool ProductionClaimsEnabled = false;
        public const int RegisteredNativeAdapterCount = 0;
        readonly object gate = new object();
        readonly SourceKey source;
        readonly OwnershipLimits limits;
        readonly string boundaryId = Guid.NewGuid().ToString("N");
        readonly string claimProfile;
#if OWNERSHIP_FIXTURES
        readonly FixtureOwnershipAuthority authority;
        internal OwnershipBoundary(SourceKey source, OwnershipLimits limits, string claimProfile, FixtureOwnershipAuthority authority)
            : this(source, limits)
        {
            if (!SourceKey.ValidText(claimProfile, 256) || authority == null) throw new ArgumentException("Fixture authority and profile required.");
            this.claimProfile = claimProfile; this.authority = authority;
            boundaryId = authority.Epoch + ":" + boundaryId;
        }
#endif
        OwnershipState state = OwnershipState.NATIVE;
        string reason = "production-claims-disabled", nativeEvidence = "untouched", claimedRevision, claimedOwner;
        long time = -1, sequence, expires = -1, prepareUntil = -1, dispatchedAt = -1;
        bool preparedOnce, dispatched, terminal, paused, reserved, recoveryHealthy = true;
        PreviousStateToken prior;
        ReadinessDecision admittedReadiness;
        OwnershipCommand pending;
        public OwnershipBoundary(SourceKey source, OwnershipLimits limits)
        {
            if (source == null || limits == null) throw new ArgumentNullException(source == null ? "source" : "limits");
            this.source = source; this.limits = limits; claimProfile = null;
        }
        public SourceKey Source { get { return source; } }
        public string BoundaryId { get { return boundaryId; } }
        bool HasFixtureAuthority
        {
            get {
#if OWNERSHIP_FIXTURES
                return authority != null;
#else
                return false;
#endif
            }
        }
        bool Reserve()
        {
#if OWNERSHIP_FIXTURES
            return authority != null && authority.Reserve(source.ResourceConflictKey, boundaryId);
#else
            return false;
#endif
        }
        void Release()
        {
            if (!reserved) return;
#if OWNERSHIP_FIXTURES
            authority.Release(source.ResourceConflictKey, boundaryId);
#endif
            reserved = false;
        }
        bool Clock(long now)
        {
            if (now < 0 || now < time) return false;
            time = now; return true;
        }
        static bool Same(string a, string b) { return String.Equals(a, b, StringComparison.Ordinal); }
        bool AuthoredPrior(PreviousStateToken value)
        {
#if OWNERSHIP_FIXTURES
            return value != null && value.AuthoredBy(authority);
#else
            return false;
#endif
        }
        bool AuthoredReceipt(OwnershipReceipt value)
        {
#if OWNERSHIP_FIXTURES
            return value != null && value.AuthoredBy(authority);
#else
            return false;
#endif
        }
        bool AuthorizedMapping(PreviousStateToken previous, ReadinessDecision readiness)
        {
#if OWNERSHIP_FIXTURES
            return authority != null && authority.HasMapping(previous, readiness);
#else
            return false;
#endif
        }
        public bool Prepare(ReadinessDecision readiness, PreviousStateToken previous, long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks) || terminal || preparedOnce || state != OwnershipState.NATIVE || paused) return false;
                if (!HasFixtureAuthority) { reason = "production-claims-disabled"; return false; }
                if (readiness == null || !readiness.Ready || readiness.Scope != ReadinessScope.AuthoredFixture || !source.Equals(readiness.Source) ||
                    readiness.ClockFrequency != limits.ClockFrequency || !Same(readiness.ClockDomain, limits.ClockDomain) ||
                    readiness.EvaluatedAtTicks > nowTicks || readiness.ValidUntilTicks <= nowTicks || readiness.LeaseExpiresAtTicks <= nowTicks)
                { reason = "replacement-readiness-unqualified"; return false; }
                if (!AuthoredPrior(previous) || !source.Equals(previous.Source)) { reason = "previous-effective-state-unverified"; return false; }
                if (!Same(claimProfile, readiness.Evidence.Assets.ProfileIdentity)) { reason = "replacement-profile-mismatch"; return false; }
                if (!AuthorizedMapping(previous, readiness)) { reason = "prior-to-replacement-mapping-unverified"; return false; }
                if (nowTicks > Int64.MaxValue - limits.LeaseTicks) { reason = "lease-overflow"; return false; }
                long leaseEnd = Math.Min(nowTicks + limits.LeaseTicks, Math.Min(readiness.LeaseExpiresAtTicks, readiness.SafetyValidUntilTicks));
                if (readiness.Evidence.Handoff.ActivationAtTicks > Int64.MaxValue - readiness.Evidence.Handoff.TransitionTicks ||
                    readiness.Evidence.Handoff.ActivationAtTicks + readiness.Evidence.Handoff.TransitionTicks >= leaseEnd)
                { reason = "readiness-health-no-handoff-reserve"; return false; }
                if (!Reserve()) { reason = "vehicle-audio-object-already-reserved"; return false; }
                reserved = true; preparedOnce = true; prior = previous; admittedReadiness = readiness;
                expires = leaseEnd; prepareUntil = Math.Min(readiness.ValidUntilTicks, expires);
                state = OwnershipState.PREPARED; reason = "authored-fixture-prepared"; return true;
            }
        }
        public OwnershipCommand RequestClaim(long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks)) return null; Expire(nowTicks);
                if (!HasFixtureAuthority || terminal || paused || state != OwnershipState.PREPARED || pending != null) return null;
                pending = new OwnershipCommand(boundaryId, ++sequence, source, OwnershipCommandKind.Claim,
                    Math.Min(expires, admittedReadiness.Evidence.Handoff.ActivationDeadlineTicks),
                    prior.OwnerToken, prior.RevisionToken, boundaryId + ":claim:" + sequence, claimProfile,
                    admittedReadiness.Evidence.Handoff.ActivationAtTicks, admittedReadiness.Evidence.Handoff.TransitionTicks, admittedReadiness);
                reason = "claim-not-dispatched"; return pending;
            }
        }
        // Call before an external dispatcher could execute. Admission itself records
        // uncertainty, because a controller may die immediately after this return.
        public bool TryAdmitDispatch(OwnershipCommand command, SourceKey currentSource, long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks)) return false; Expire(nowTicks);
                if (terminal || !Object.ReferenceEquals(command, pending) || command == null || dispatched) return false;
                if (!source.Equals(currentSource)) { Fail("identity-lost-before-dispatch", MayHaveWritten); return false; }
                if (!recoveryHealthy) { Fail("recovery-executor-unavailable", MayHaveWritten); return false; }
                dispatched = true; dispatchedAt = nowTicks; nativeEvidence = command.Kind == OwnershipCommandKind.Claim ? "possible-claim-write" : "possible-restore-write";
                reason = "dispatch-admitted-outcome-unverified"; return true;
            }
        }
        public bool Acknowledge(OwnershipReceipt receipt, long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks)) return false; Expire(nowTicks);
                if (terminal || pending == null || !dispatched || receipt == null || !Object.ReferenceEquals(receipt.Command, pending) ||
                    !AuthoredReceipt(receipt) || !receipt.ConditionalTransitionVerified || !receipt.EffectiveStateVerified ||
                    !receipt.UnrelatedComponentsPreserved || !receipt.ExclusiveHandoffVerified ||
                    !Same(receipt.ExpectedOwnerToken, pending.ExpectedOwnerToken) || !Same(receipt.ExpectedRevisionToken, pending.ExpectedRevisionToken) ||
                    !Same(receipt.ResultOwnerToken, pending.TargetOwnerToken) || !Same(receipt.ResultProfileToken, pending.TargetProfileToken) ||
                    !SourceKey.ValidText(receipt.ResultRevisionToken, 256) || Same(receipt.ResultRevisionToken, pending.ExpectedRevisionToken) ||
                    receipt.TransitionCompletedAtTicks < pending.ActivationAtTicks + pending.TransitionTicks ||
                    receipt.TransitionCompletedAtTicks < dispatchedAt ||
                    receipt.TransitionCompletedAtTicks > nowTicks || receipt.TransitionCompletedAtTicks >= pending.DeadlineTicks) return false;
                if (pending.Kind == OwnershipCommandKind.Claim)
                {
                    claimedRevision = receipt.ResultRevisionToken; claimedOwner = receipt.ResultOwnerToken; pending = null; dispatched = false;
                    state = OwnershipState.CLAIMED; nativeEvidence = "fixture-verified-claimed"; reason = "authored-conditional-claim-verified";
                }
                else
                {
                    pending = null; dispatched = false; state = OwnershipState.NATIVE; terminal = true;
                    nativeEvidence = "fixture-verified-restored"; reason = "authored-conditional-restoration-verified"; Release();
                }
                return true;
            }
        }
        bool MayHaveWritten { get { return state == OwnershipState.CLAIMED || state == OwnershipState.RESTORING || dispatched; } }
        void Fail(string why, bool uncertain)
        {
            state = uncertain ? OwnershipState.UNKNOWN : OwnershipState.FAILED; reason = why; terminal = true;
            pending = null; dispatched = false; nativeEvidence = uncertain ? "unknown" : "untouched";
            // UNKNOWN retains its reservation: elapsed time cannot prove rollback.
            if (!uncertain) Release();
        }
        void StopCore(long now, string why)
        {
            if (terminal || state == OwnershipState.RESTORING) return;
            if (state == OwnershipState.PREPARED && dispatched) { Fail(why + ":claim-outcome-unknown", true); return; }
            if (state == OwnershipState.CLAIMED)
            {
                if (!recoveryHealthy || now > Int64.MaxValue - limits.RestoreTicks) { Fail(why + ":recovery-unavailable", true); return; }
                state = OwnershipState.RESTORING; nativeEvidence = "restoration-unverified"; reason = why;
                pending = new OwnershipCommand(boundaryId, ++sequence, source, OwnershipCommandKind.Restore, now + limits.RestoreTicks,
                    claimedOwner, claimedRevision, prior.OwnerToken, prior.ProfileToken, now, 0, admittedReadiness);
                dispatched = false; return;
            }
            terminal = true; state = OwnershipState.NATIVE; reason = why + ":no-dispatch"; pending = null; dispatched = false; Release();
        }
        void Expire(long now)
        {
            if (terminal) return;
            if (state == OwnershipState.RESTORING && now >= pending.DeadlineTicks) { Fail("restoration-deadline-no-proof", true); return; }
            if (state == OwnershipState.PREPARED)
            {
                if (dispatched && now >= pending.DeadlineTicks) { Fail("claim-deadline-no-proof", true); return; }
                if (!dispatched && now >= prepareUntil) StopCore(now, "preparation-expired");
            }
            if (state == OwnershipState.CLAIMED && now >= expires)
            {
                // A delayed poll must not restart the recovery budget. Its deadline
                // is anchored to the immutable lease/health expiry, not detection.
                StopCore(expires, "lease-or-health-expired");
                if (state == OwnershipState.RESTORING && now >= pending.DeadlineTicks) Fail("restoration-deadline-no-proof", true);
            }
        }
        public OwnershipCommand Stop(long nowTicks, string why)
        {
            lock (gate)
            {
                if (!Clock(nowTicks)) return null; Expire(nowTicks);
                StopCore(nowTicks, SourceKey.ValidText(why, 128) ? why : "stop"); return pending;
            }
        }
        public OwnershipCommand Abort(long nowTicks) { return Stop(nowTicks, "controller-abort"); }
        public OwnershipCommand Shutdown(long nowTicks) { return Stop(nowTicks, "shutdown"); }
        public OwnershipCommand Pause(long nowTicks)
        {
            lock (gate) { if (!Clock(nowTicks)) return null; paused = true; Expire(nowTicks); StopCore(nowTicks, "paused"); return pending; }
        }
        public bool Resume(long nowTicks)
        {
            lock (gate) { if (!Clock(nowTicks)) return false; Expire(nowTicks); paused = false; return false; }
            // A resumed controller never rearms or extends this one-shot boundary.
        }
        public OwnershipCommand ObserveHealth(OwnershipHealth health, long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks) || terminal) return null;
                if (health == null || !source.Equals(health.CurrentSource)) { Fail("entity-generation-unavailable", MayHaveWritten); return null; }
                recoveryHealthy = recoveryHealthy && health.RecoveryExecutorHealthy;
                if (health.CompetingWriter) { Fail("competing-owner-no-restore-write", MayHaveWritten); return null; }
                if (!recoveryHealthy) { Fail("recovery-executor-unavailable", MayHaveWritten); return null; }
                Expire(nowTicks);
                if (!terminal && (!health.SourceEligible || !health.RendererHealthy || !health.ControllerHealthy))
                    StopCore(nowTicks, !health.SourceEligible ? "source-ineligible" : !health.RendererHealthy ? "renderer-or-ipc-lost" : "controller-lost");
                return pending;
            }
        }
        // Diagnostic only: no external clock is read and a cached snapshot never
        // grants authority. Use the timestamped overload to apply expiry first.
        public OwnershipSnapshot Snapshot()
        {
            lock (gate) return SnapshotCore();
        }
        public OwnershipSnapshot Snapshot(long nowTicks)
        {
            lock (gate)
            {
                if (!Clock(nowTicks)) throw new ArgumentOutOfRangeException("nowTicks", "The boundary clock cannot move backwards.");
                Expire(nowTicks); return SnapshotCore();
            }
        }
        OwnershipSnapshot SnapshotCore() { return new OwnershipSnapshot(source, state, reason, nativeEvidence, pending, dispatched, paused, terminal, expires, HasFixtureAuthority); }
    }

#if OWNERSHIP_FIXTURES
    // This type and every positive authority factory are absent from the production
    // assembly. It is an authored backend assumption, not a real native capability.
    // One instance is one simulated authority domain; no multi-adapter dispatch is supported.
    public sealed class FixtureOwnershipAuthority
    {
        readonly object gate = new object();
        readonly Dictionary<string, string> reservations = new Dictionary<string, string>(StringComparer.Ordinal);
        readonly Dictionary<PreviousStateToken, ReadinessDecision> mappings = new Dictionary<PreviousStateToken, ReadinessDecision>();
        readonly string epoch = Guid.NewGuid().ToString("N");
        internal string Epoch { get { return epoch; } }
        internal bool Reserve(string resource, string boundary)
        {
            lock (gate) { if (reservations.ContainsKey(resource)) return false; reservations.Add(resource, boundary); return true; }
        }
        internal void Release(string resource, string boundary)
        {
            lock (gate) { string owner; if (reservations.TryGetValue(resource, out owner) && owner == boundary) reservations.Remove(resource); }
        }
        public OwnershipBoundary CreateBoundary(SourceKey source, OwnershipLimits limits, string fixtureClaimProfile)
        { return new OwnershipBoundary(source, limits, fixtureClaimProfile, this); }
        public PreviousStateToken CapturePrevious(SourceKey source, string profile, string owner, string revision)
        { return new PreviousStateToken(source, profile, owner, revision, this); }
        // This explicitly authors the missing prior-to-replacement compatibility
        // assumption. It binds exact prior owner/revision/profile to the complete
        // immutable replacement graph/provenance; it does not discover that mapping.
        public bool AuthorizeMapping(PreviousStateToken previous, ReadinessDecision readiness)
        {
            if (previous == null || !previous.AuthoredBy(this) || readiness == null || !readiness.Ready ||
                readiness.Scope != ReadinessScope.AuthoredFixture || !previous.Source.Equals(readiness.Source)) return false;
            lock (gate) { mappings[previous] = readiness; return true; }
        }
        internal bool HasMapping(PreviousStateToken previous, ReadinessDecision readiness)
        {
            lock (gate) { ReadinessDecision mapped; return mappings.TryGetValue(previous, out mapped) && Object.ReferenceEquals(mapped, readiness); }
        }
        public OwnershipReceipt Receipt(OwnershipCommand command, string resultRevision,
            string expectedOwner = null, string expectedRevision = null, string resultOwner = null, string resultProfile = null,
            bool conditional = true, bool effective = true, bool preserved = true, bool handoff = true, long transitionCompletedAtTicks = -1)
        {
            if (command == null) throw new ArgumentNullException("command");
            return new OwnershipReceipt(command, expectedOwner ?? command.ExpectedOwnerToken, expectedRevision ?? command.ExpectedRevisionToken,
                resultOwner ?? command.TargetOwnerToken, resultRevision, resultProfile ?? command.TargetProfileToken,
                conditional, effective, preserved, handoff,
                transitionCompletedAtTicks < 0 ? command.ActivationAtTicks + command.TransitionTicks : transitionCompletedAtTicks, this);
        }
    }
#endif
}
