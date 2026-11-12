using System;
using System.Collections.Generic;

namespace RichAudio.Ownership.Boundary01
{
    // Consumes evidence only. This file contains no renderer, scheduler, device,
    // native call, profile assignment, or runtime suppression admission.
    public enum ReadinessScope { Unqualified = 0, AuthoredFixture = 1, RuntimeQualified = 2 }
    public enum MechanicalEvidenceKind { Unavailable = 0, Observed = 1, Estimated = 2 }

    public sealed class EvidenceStamp
    {
        public string ClockDomain { get; private set; }
        public long ClockFrequency { get; private set; }
        public long ObservedAtTicks { get; private set; }
        public EvidenceStamp(string clockDomain, long clockFrequency, long observedAtTicks)
        { ClockDomain = clockDomain; ClockFrequency = clockFrequency; ObservedAtTicks = observedAtTicks; }
    }
    public sealed class MechanicalObservationEvidence
    {
        public SourceKey Source { get; private set; }
        public EvidenceStamp Stamp { get; private set; }
        public long Sequence { get; private set; }
        public long AcquisitionStartTicks { get; private set; }
        public long AcquisitionEndTicks { get; private set; }
        public MechanicalEvidenceKind Kind { get; private set; }
        public string ProviderIdentity { get; private set; }
        public double? RpmRatio { get; private set; }
        public double? LoadRatio { get; private set; }
        public double? Throttle { get; private set; }
        public double? SpeedMetresPerSecond { get; private set; }
        public bool Valid { get; private set; }
        public MechanicalObservationEvidence(SourceKey source, EvidenceStamp stamp, long sequence,
            long acquisitionStartTicks, long acquisitionEndTicks, MechanicalEvidenceKind kind, string providerIdentity,
            double? rpmRatio, double? loadRatio, double? throttle, double? speedMetresPerSecond, bool valid)
        {
            Source = source; Stamp = stamp; Sequence = sequence; AcquisitionStartTicks = acquisitionStartTicks;
            AcquisitionEndTicks = acquisitionEndTicks; Kind = kind; ProviderIdentity = providerIdentity;
            RpmRatio = rpmRatio; LoadRatio = loadRatio; Throttle = throttle; SpeedMetresPerSecond = speedMetresPerSecond; Valid = valid;
        }
    }
    public sealed class ReplacementAssetEvidence
    {
        public SourceKey Source { get; private set; }
        public EvidenceStamp Stamp { get; private set; }
        public string ProfileIdentity { get; private set; }
        public string ProfileGraphSha256 { get; private set; }
        public string AssetSetSha256 { get; private set; }
        public string ProvenanceReceiptSha256 { get; private set; }
        public bool DependencyClosureVerified { get; private set; }
        public ReplacementAssetEvidence(SourceKey source, EvidenceStamp stamp, string profileIdentity,
            string profileGraphSha256, string assetSetSha256, string provenanceReceiptSha256, bool dependencyClosureVerified)
        {
            Source = source; Stamp = stamp; ProfileIdentity = profileIdentity; ProfileGraphSha256 = profileGraphSha256;
            AssetSetSha256 = assetSetSha256; ProvenanceReceiptSha256 = provenanceReceiptSha256; DependencyClosureVerified = dependencyClosureVerified;
        }
    }
    public sealed class PreparedRenderEvidence
    {
        public SourceKey Source { get; private set; }
        public EvidenceStamp Stamp { get; private set; }
        public long ObservationSequence { get; private set; }
        public string ProfileGraphSha256 { get; private set; }
        public string AssetSetSha256 { get; private set; }
        public string PreparedPcmSha256 { get; private set; }
        public long HostGeneration { get; private set; }
        public long DeviceGeneration { get; private set; }
        public long RendererGeneration { get; private set; }
        public long PcmStartFrame { get; private set; }
        public long PcmEndFrameExclusive { get; private set; }
        public long PlaybackStartTicks { get; private set; }
        public long PlaybackEndTicks { get; private set; }
        public int SampleRate { get; private set; }
        public int Channels { get; private set; }
        public int BlockFrames { get; private set; }
        public long DeadlineBudgetTicks { get; private set; }
        public long WorstCompleteRenderTicks { get; private set; }
        public long SchedulingMarginTicks { get; private set; }
        public long QualifiedPeriods { get; private set; }
        public long QualificationWindowTicks { get; private set; }
        public long DeadlineMisses { get; private set; }
        public bool CompleteCostMeasured { get; private set; }
        public bool PcmPrepared { get; private set; }
        public PreparedRenderEvidence(SourceKey source, EvidenceStamp stamp, long observationSequence,
            string profileGraphSha256, string assetSetSha256, string preparedPcmSha256,
            long hostGeneration, long deviceGeneration, long rendererGeneration, long pcmStartFrame, long pcmEndFrameExclusive,
            long playbackStartTicks, long playbackEndTicks, int sampleRate, int channels, int blockFrames,
            long deadlineBudgetTicks, long worstCompleteRenderTicks, long schedulingMarginTicks,
            long qualifiedPeriods, long qualificationWindowTicks, long deadlineMisses, bool completeCostMeasured, bool pcmPrepared)
        {
            Source = source; Stamp = stamp; ObservationSequence = observationSequence; ProfileGraphSha256 = profileGraphSha256;
            AssetSetSha256 = assetSetSha256; PreparedPcmSha256 = preparedPcmSha256; HostGeneration = hostGeneration;
            DeviceGeneration = deviceGeneration; RendererGeneration = rendererGeneration; PcmStartFrame = pcmStartFrame;
            PcmEndFrameExclusive = pcmEndFrameExclusive; PlaybackStartTicks = playbackStartTicks; PlaybackEndTicks = playbackEndTicks;
            SampleRate = sampleRate; Channels = channels; BlockFrames = blockFrames; DeadlineBudgetTicks = deadlineBudgetTicks;
            WorstCompleteRenderTicks = worstCompleteRenderTicks; SchedulingMarginTicks = schedulingMarginTicks;
            QualifiedPeriods = qualifiedPeriods; QualificationWindowTicks = qualificationWindowTicks; DeadlineMisses = deadlineMisses;
            CompleteCostMeasured = completeCostMeasured; PcmPrepared = pcmPrepared;
        }
    }
    public sealed class ReplacementOutputEvidence
    {
        public SourceKey Source { get; private set; }
        public EvidenceStamp Stamp { get; private set; }
        public long HostGeneration { get; private set; }
        public long DeviceGeneration { get; private set; }
        public long RendererGeneration { get; private set; }
        public long ProgressSequence { get; private set; }
        public long ProgressStartTicks { get; private set; }
        public long PresentedFromFrame { get; private set; }
        public long PresentedToFrameExclusive { get; private set; }
        public long NextPlaybackTicks { get; private set; }
        public int SampleRate { get; private set; }
        public int Channels { get; private set; }
        public bool HostHealthy { get; private set; }
        public bool DeviceHealthy { get; private set; }
        public ReplacementOutputEvidence(SourceKey source, EvidenceStamp stamp, long hostGeneration, long deviceGeneration,
            long rendererGeneration, long progressSequence, long progressStartTicks, long presentedFromFrame,
            long presentedToFrameExclusive, long nextPlaybackTicks, int sampleRate, int channels, bool hostHealthy, bool deviceHealthy)
        {
            Source = source; Stamp = stamp; HostGeneration = hostGeneration; DeviceGeneration = deviceGeneration;
            RendererGeneration = rendererGeneration; ProgressSequence = progressSequence; ProgressStartTicks = progressStartTicks;
            PresentedFromFrame = presentedFromFrame; PresentedToFrameExclusive = presentedToFrameExclusive; NextPlaybackTicks = nextPlaybackTicks;
            SampleRate = sampleRate; Channels = channels; HostHealthy = hostHealthy; DeviceHealthy = deviceHealthy;
        }
    }
    public sealed class ReplacementHandoffEvidence
    {
        public SourceKey Source { get; private set; }
        public EvidenceStamp Stamp { get; private set; }
        public long ActivationAtTicks { get; private set; }
        public long ActivationDeadlineTicks { get; private set; }
        public long TransitionTicks { get; private set; }
        public long TailFrames { get; private set; }
        public long TailBoundTicks { get; private set; }
        public long LeaseExpiresAtTicks { get; private set; }
        public ReplacementHandoffEvidence(SourceKey source, EvidenceStamp stamp, long activationAtTicks,
            long activationDeadlineTicks, long transitionTicks, long tailFrames, long tailBoundTicks, long leaseExpiresAtTicks)
        {
            Source = source; Stamp = stamp; ActivationAtTicks = activationAtTicks; ActivationDeadlineTicks = activationDeadlineTicks;
            TransitionTicks = transitionTicks; TailFrames = tailFrames; TailBoundTicks = tailBoundTicks; LeaseExpiresAtTicks = leaseExpiresAtTicks;
        }
    }
    public sealed class ReplacementReadinessEvidence
    {
        public SourceKey Source { get; private set; }
        public ReadinessScope Scope { get; private set; }
        public MechanicalObservationEvidence Observation { get; private set; }
        public ReplacementAssetEvidence Assets { get; private set; }
        public PreparedRenderEvidence Render { get; private set; }
        public ReplacementOutputEvidence Output { get; private set; }
        public ReplacementHandoffEvidence Handoff { get; private set; }
        public ReplacementReadinessEvidence(SourceKey source, ReadinessScope scope, MechanicalObservationEvidence observation,
            ReplacementAssetEvidence assets, PreparedRenderEvidence render, ReplacementOutputEvidence output, ReplacementHandoffEvidence handoff)
        { Source = source; Scope = scope; Observation = observation; Assets = assets; Render = render; Output = output; Handoff = handoff; }
    }
    public sealed class ReadinessLimits
    {
        public string ClockDomain { get; private set; }
        public long ClockFrequency { get; private set; }
        public long ObservationMaximumAgeTicks { get; private set; }
        public long AssetsMaximumAgeTicks { get; private set; }
        public long RenderMaximumAgeTicks { get; private set; }
        public long OutputMaximumAgeTicks { get; private set; }
        public long MinimumRenderHorizonTicks { get; private set; }
        public long MaximumLeaseTicks { get; private set; }
        public long MaximumTransitionTicks { get; private set; }
        public long MaximumTailTicks { get; private set; }
        public long MinimumQualifiedPeriods { get; private set; }
        public long MinimumQualificationWindowTicks { get; private set; }
        public ReadinessLimits(string clockDomain, long clockFrequency, long observationMaximumAgeTicks, long assetsMaximumAgeTicks,
            long renderMaximumAgeTicks, long outputMaximumAgeTicks, long minimumRenderHorizonTicks, long maximumLeaseTicks,
            long maximumTransitionTicks, long maximumTailTicks, long minimumQualifiedPeriods, long minimumQualificationWindowTicks)
        {
            if (String.IsNullOrWhiteSpace(clockDomain) || clockDomain.Length > 128 || clockFrequency < 1000 || clockFrequency > 1000000000)
                throw new ArgumentException("Bounded monotonic clock identity/frequency required");
            foreach (long value in new[] { observationMaximumAgeTicks, assetsMaximumAgeTicks, renderMaximumAgeTicks, outputMaximumAgeTicks,
                minimumRenderHorizonTicks, maximumLeaseTicks, maximumTransitionTicks, maximumTailTicks, minimumQualificationWindowTicks })
                if (value <= 0 || value > clockFrequency * 3600) throw new ArgumentOutOfRangeException("limits", "Positive bounded tick durations required");
            if (minimumQualifiedPeriods <= 0 || minimumQualifiedPeriods > 1000000) throw new ArgumentOutOfRangeException("minimumQualifiedPeriods");
            ClockDomain = clockDomain; ClockFrequency = clockFrequency; ObservationMaximumAgeTicks = observationMaximumAgeTicks;
            AssetsMaximumAgeTicks = assetsMaximumAgeTicks; RenderMaximumAgeTicks = renderMaximumAgeTicks; OutputMaximumAgeTicks = outputMaximumAgeTicks;
            MinimumRenderHorizonTicks = minimumRenderHorizonTicks; MaximumLeaseTicks = maximumLeaseTicks; MaximumTransitionTicks = maximumTransitionTicks;
            MaximumTailTicks = maximumTailTicks; MinimumQualifiedPeriods = minimumQualifiedPeriods; MinimumQualificationWindowTicks = minimumQualificationWindowTicks;
        }
#if OWNERSHIP_FIXTURES
        public static ReadinessLimits AuthoredFixture(string clockDomain, long frequency)
        { return new ReadinessLimits(clockDomain, frequency, frequency / 10, frequency * 2, frequency / 10, frequency / 10,
            frequency / 10, frequency / 4, frequency / 100, frequency / 50, 64, frequency); }
#endif
    }
    public sealed class ReadinessDecision
    {
        readonly string[] reasons;
        public SourceKey Source { get; private set; }
        public bool Ready { get; private set; }
        public ReadinessScope Scope { get; private set; }
        public string ClockDomain { get; private set; }
        public long ClockFrequency { get; private set; }
        public long EvaluatedAtTicks { get; private set; }
        public long ValidUntilTicks { get; private set; }
        public long SafetyValidUntilTicks { get; private set; }
        public long LeaseExpiresAtTicks { get; private set; }
        public bool RuntimeQualified { get { return false; } }
        public string[] Reasons { get { return (string[])reasons.Clone(); } }
        public ReplacementReadinessEvidence Evidence { get; private set; }
        internal ReadinessDecision(ReplacementReadinessEvidence evidence, ReadinessLimits limits, long now, long validUntil, List<string> failures, long safetyValidUntil = 0)
        {
            Evidence = evidence; Source = evidence == null ? null : evidence.Source; Scope = evidence == null ? ReadinessScope.Unqualified : evidence.Scope;
            ClockDomain = limits == null ? null : limits.ClockDomain; ClockFrequency = limits == null ? 0 : limits.ClockFrequency;
            EvaluatedAtTicks = now; reasons = failures.ToArray(); Ready = reasons.Length == 0;
            ValidUntilTicks = Ready ? validUntil : now;
            SafetyValidUntilTicks = Ready ? safetyValidUntil : now;
            LeaseExpiresAtTicks = evidence == null || evidence.Handoff == null ? 0 : evidence.Handoff.LeaseExpiresAtTicks;
        }
    }
    public static class ReplacementReadiness
    {
        static bool Text(string value, int maximum) { return !String.IsNullOrWhiteSpace(value) && value.Length <= maximum; }
        static bool Digest(string value)
        { if (value == null || value.Length != 64) return false; foreach (char c in value) if (!(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')) return false; return true; }
        static bool Number(double? value, double minimum, double maximum)
        { return value.HasValue && !Double.IsNaN(value.Value) && !Double.IsInfinity(value.Value) && value.Value >= minimum && value.Value <= maximum; }
        static void Require(bool condition, string reason, List<string> failures) { if (!condition && !failures.Contains(reason)) failures.Add(reason); }
        static bool Stamp(EvidenceStamp stamp, ReadinessLimits limits, long now, long maximumAge, string label, List<string> failures, ref long until)
        {
            if (stamp == null) { failures.Add(label + "-stamp-missing"); return false; }
            bool clock = stamp.ClockDomain == limits.ClockDomain && stamp.ClockFrequency == limits.ClockFrequency;
            Require(clock, label + "-clock-mismatch", failures);
            bool time = stamp.ObservedAtTicks >= 0 && stamp.ObservedAtTicks <= now && (decimal)now - stamp.ObservedAtTicks < maximumAge;
            Require(time, label + "-stale-or-future", failures);
            decimal expiry = (decimal)stamp.ObservedAtTicks + maximumAge;
            Require(expiry <= Int64.MaxValue, label + "-clock-overflow", failures);
            if (clock && time && expiry <= Int64.MaxValue) until = Math.Min(until, (long)expiry);
            return clock && time;
        }
        static decimal FrameTicks(long frames, int rate, long frequency)
        { return rate <= 0 || frames < 0 ? -1 : Decimal.Ceiling((decimal)frames * frequency / rate); }

        public static ReadinessDecision Evaluate(ReplacementReadinessEvidence evidence, long nowTicks, ReadinessLimits limits)
        {
            var failures = new List<string>(); long until = Int64.MaxValue;
            Require(nowTicks >= 0, "evaluation-time-invalid", failures); Require(limits != null, "limits-missing", failures);
            Require(evidence != null, "evidence-missing", failures);
            if (evidence == null || limits == null) return new ReadinessDecision(evidence, limits, nowTicks, nowTicks, failures);
            Require(evidence.Source != null, "source-missing", failures);
            // A caller-authored positive runtime qualification flag is never authority.
            Require(evidence.Scope == ReadinessScope.AuthoredFixture, "runtime-qualification-unavailable", failures);
            var o = evidence.Observation; var a = evidence.Assets; var r = evidence.Render; var d = evidence.Output; var h = evidence.Handoff;
            Require(o != null, "observation-missing", failures); Require(a != null, "assets-missing", failures);
            Require(r != null, "render-missing", failures); Require(d != null, "output-missing", failures); Require(h != null, "handoff-missing", failures);
            if (o == null || a == null || r == null || d == null || h == null) return new ReadinessDecision(evidence, limits, nowTicks, nowTicks, failures);
            Require(Object.Equals(evidence.Source, o.Source) && Object.Equals(evidence.Source, a.Source) && Object.Equals(evidence.Source, r.Source) &&
                Object.Equals(evidence.Source, d.Source) && Object.Equals(evidence.Source, h.Source), "source-binding-mismatch", failures);
            Stamp(o.Stamp, limits, nowTicks, limits.ObservationMaximumAgeTicks, "observation", failures, ref until);
            Stamp(a.Stamp, limits, nowTicks, limits.AssetsMaximumAgeTicks, "assets", failures, ref until);
            Stamp(r.Stamp, limits, nowTicks, limits.RenderMaximumAgeTicks, "render", failures, ref until);
            Stamp(d.Stamp, limits, nowTicks, limits.OutputMaximumAgeTicks, "output", failures, ref until);
            Stamp(h.Stamp, limits, nowTicks, limits.RenderMaximumAgeTicks, "handoff", failures, ref until);
            Require(o.Valid && o.Sequence > 0 && o.Kind == MechanicalEvidenceKind.Observed && Text(o.ProviderIdentity, 128), "mechanical-provenance-invalid", failures);
            Require(Number(o.RpmRatio, 0, 1) && Number(o.LoadRatio, 0, 1) && Number(o.Throttle, 0, 1) && Number(o.SpeedMetresPerSecond, 0, 100), "mechanical-input-invalid-or-unavailable", failures);
            Require(o.Stamp != null && o.AcquisitionStartTicks >= 0 && o.AcquisitionStartTicks <= o.Stamp.ObservedAtTicks &&
                o.Stamp.ObservedAtTicks <= o.AcquisitionEndTicks && o.AcquisitionEndTicks <= nowTicks &&
                (decimal)nowTicks - o.AcquisitionStartTicks < limits.ObservationMaximumAgeTicks, "observation-acquisition-invalid", failures);
            // The whole observation acquisition must remain fresh when the receipt is consumed.
            decimal acquisitionExpiry = (decimal)o.AcquisitionStartTicks + limits.ObservationMaximumAgeTicks;
            Require(acquisitionExpiry <= Int64.MaxValue, "observation-clock-overflow", failures);
            if (acquisitionExpiry <= Int64.MaxValue) until = Math.Min(until, (long)acquisitionExpiry);
            Require(Text(a.ProfileIdentity, 128) && Digest(a.ProfileGraphSha256) && Digest(a.AssetSetSha256) && Digest(a.ProvenanceReceiptSha256) &&
                a.DependencyClosureVerified, "asset-identity-provenance-or-closure-invalid", failures);
            Require(r.ObservationSequence == o.Sequence && r.ProfileGraphSha256 == a.ProfileGraphSha256 && r.AssetSetSha256 == a.AssetSetSha256,
                "render-input-binding-mismatch", failures);
            Require(r.Stamp != null && o.Stamp != null && a.Stamp != null && r.Stamp.ObservedAtTicks >= o.AcquisitionEndTicks &&
                r.Stamp.ObservedAtTicks >= a.Stamp.ObservedAtTicks, "render-preparation-chronology-invalid", failures);
            Require(r.HostGeneration > 0 && r.DeviceGeneration > 0 && r.RendererGeneration > 0 && r.HostGeneration == d.HostGeneration &&
                r.DeviceGeneration == d.DeviceGeneration && r.RendererGeneration == d.RendererGeneration, "output-generation-mismatch", failures);
            Require(r.PcmPrepared && Digest(r.PreparedPcmSha256) && r.SampleRate == 48000 && r.Channels == 2 && r.BlockFrames == 512 &&
                r.PcmStartFrame >= 0 && r.PcmEndFrameExclusive > r.PcmStartFrame, "prepared-pcm-invalid", failures);
            decimal frames = (decimal)r.PcmEndFrameExclusive - r.PcmStartFrame;
            decimal intervalTicks = frames > 0 && r.SampleRate > 0 ? Decimal.Ceiling(frames * limits.ClockFrequency / r.SampleRate) : -1;
            Require(r.PlaybackStartTicks >= 0 && r.PlaybackEndTicks > r.PlaybackStartTicks &&
                (decimal)r.PlaybackEndTicks - r.PlaybackStartTicks == intervalTicks, "pcm-interval-timeline-mismatch", failures);
            Require(r.CompleteCostMeasured && r.QualifiedPeriods >= limits.MinimumQualifiedPeriods &&
                r.QualificationWindowTicks >= limits.MinimumQualificationWindowTicks && r.DeadlineMisses == 0, "render-performance-unqualified", failures);
            Require(r.DeadlineBudgetTicks > 0 && r.SampleRate > 0 && r.DeadlineBudgetTicks <= Decimal.Floor((decimal)r.BlockFrames * limits.ClockFrequency / r.SampleRate) &&
                r.WorstCompleteRenderTicks > 0 && r.SchedulingMarginTicks >= 0 &&
                (decimal)r.WorstCompleteRenderTicks + r.SchedulingMarginTicks <= r.DeadlineBudgetTicks, "render-deadline-budget-exceeded", failures);
            Require(d.HostHealthy && d.DeviceHealthy, "host-or-device-unhealthy", failures);
            Require(d.Stamp != null && d.ProgressSequence > 0 && d.ProgressStartTicks >= 0 && d.ProgressStartTicks < d.Stamp.ObservedAtTicks &&
                d.PresentedFromFrame >= 0 && d.PresentedToFrameExclusive > d.PresentedFromFrame &&
                (decimal)nowTicks - d.ProgressStartTicks < limits.OutputMaximumAgeTicks, "output-progress-unproven", failures);
            // Progress must describe presentation at the declared sample rate,
            // not merely an advancing heartbeat. One block is the explicit
            // maximum frame-count uncertainty for batched endpoint observations.
            decimal progressTicks = d.Stamp == null ? -1 : (decimal)d.Stamp.ObservedAtTicks - d.ProgressStartTicks;
            decimal progressFrames = (decimal)d.PresentedToFrameExclusive - d.PresentedFromFrame;
            Require(progressTicks >= FrameTicks(r.BlockFrames, r.SampleRate, limits.ClockFrequency) &&
                Math.Abs(progressFrames - progressTicks * r.SampleRate / limits.ClockFrequency) <= r.BlockFrames,
                "output-progress-cadence-invalid", failures);
            decimal progressExpiry = (decimal)d.ProgressStartTicks + limits.OutputMaximumAgeTicks;
            Require(progressExpiry <= Int64.MaxValue, "output-clock-overflow", failures);
            if (progressExpiry <= Int64.MaxValue) until = Math.Min(until, (long)progressExpiry);
            Require(d.SampleRate == r.SampleRate && d.Channels == r.Channels && d.PresentedToFrameExclusive >= r.PcmStartFrame &&
                d.PresentedToFrameExclusive < r.PcmEndFrameExclusive && d.NextPlaybackTicks >= nowTicks &&
                (decimal)d.NextPlaybackTicks - r.PlaybackStartTicks == FrameTicks(d.PresentedToFrameExclusive - r.PcmStartFrame, r.SampleRate, limits.ClockFrequency),
                "output-pcm-continuity-mismatch", failures);
            Require(h.Stamp != null && r.Stamp != null && d.Stamp != null && h.Stamp.ObservedAtTicks >= r.Stamp.ObservedAtTicks &&
                h.Stamp.ObservedAtTicks >= d.Stamp.ObservedAtTicks, "handoff-chronology-invalid", failures);
            Require(h.ActivationAtTicks >= nowTicks && h.ActivationDeadlineTicks >= h.ActivationAtTicks && h.ActivationDeadlineTicks > nowTicks &&
                h.ActivationAtTicks >= d.NextPlaybackTicks && h.TransitionTicks > 0 && h.TransitionTicks <= limits.MaximumTransitionTicks,
                "handoff-timing-invalid", failures);
            Require(h.TailFrames >= 0 && h.TailBoundTicks >= FrameTicks(h.TailFrames, r.SampleRate, limits.ClockFrequency) &&
                h.TailBoundTicks >= 0 && h.TailBoundTicks <= limits.MaximumTailTicks, "handoff-tail-unbounded", failures);
            Require(h.LeaseExpiresAtTicks > nowTicks && (decimal)h.LeaseExpiresAtTicks - nowTicks <= limits.MaximumLeaseTicks &&
                (decimal)h.ActivationAtTicks + h.TransitionTicks + h.TailBoundTicks < h.LeaseExpiresAtTicks, "lease-invalid-or-no-recovery-reserve", failures);
            Require(r.PlaybackStartTicks <= h.ActivationAtTicks && (decimal)r.PlaybackEndTicks - h.ActivationAtTicks >= limits.MinimumRenderHorizonTicks &&
                (decimal)r.PlaybackEndTicks >= (decimal)h.LeaseExpiresAtTicks + h.TailBoundTicks, "prepared-horizon-insufficient", failures);
            // Preparation is consumed before the planned activation, not any time
            // later in the lease. The ownership boundary separately owns lease time.
            until = Math.Min(until, h.LeaseExpiresAtTicks);
            long safetyUntil = until;
            until = Math.Min(until, h.ActivationAtTicks); until = Math.Min(until, h.ActivationDeadlineTicks);
            Require(until > nowTicks, "readiness-window-empty", failures);
            return new ReadinessDecision(evidence, limits, nowTicks, until, failures, safetyUntil);
        }

#if OWNERSHIP_FIXTURES
        public static ReplacementReadinessEvidence AuthoredFixture(SourceKey source, long nowTicks, long frequency = 1000)
        {
            if (frequency < 1000 || frequency > 1000000000 || nowTicks < frequency) throw new ArgumentOutOfRangeException("fixture clock");
            const string domain = "ownership-fixture-qpc"; string graph = new String('a', 64), assets = new String('b', 64);
            var observationStamp = new EvidenceStamp(domain, frequency, nowTicks - frequency / 100);
            var preparedStamp = new EvidenceStamp(domain, frequency, nowTicks - frequency / 200);
            var handoffStamp = new EvidenceStamp(domain, frequency, nowTicks - 1);
            long start = nowTicks + frequency / 100, end = start + frequency;
            return new ReplacementReadinessEvidence(source, ReadinessScope.AuthoredFixture,
                new MechanicalObservationEvidence(source, observationStamp, 7, observationStamp.ObservedAtTicks - 1,
                    observationStamp.ObservedAtTicks + 1, MechanicalEvidenceKind.Observed, "authored-mechanical-provider", .5, .4, .3, 10, true),
                new ReplacementAssetEvidence(source, observationStamp, "authored-private-continuous-profile", graph, assets, new String('c', 64), true),
                new PreparedRenderEvidence(source, preparedStamp, 7, graph, assets, new String('d', 64), 1, 2, 3, 48000, 96000, start, end,
                    48000, 2, 512, frequency / 100, frequency / 250, frequency / 500, 128, frequency, 0, true, true),
                new ReplacementOutputEvidence(source, preparedStamp, 1, 2, 3, 11, nowTicks - frequency / 50, 47488, 48000, start, 48000, 2, true, true),
                new ReplacementHandoffEvidence(source, handoffStamp, start, nowTicks + frequency / 50, frequency / 500, 480, frequency / 100, nowTicks + frequency / 5));
        }
#endif
    }
}
