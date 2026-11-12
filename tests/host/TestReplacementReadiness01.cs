using System;
using System.Linq;
using System.Reflection;
using RichAudio.Ownership.Boundary01;

internal static class TestReplacementReadiness01
{
    const long Now = 10000;
    const string Domain = "ownership-fixture-qpc";
    static int cases, assertions;
    static readonly SourceKey Key = new SourceKey("fixture-session-01", 12345, 17, 0xF9300CC5, "vehicle-continuous");
    static readonly ReadinessLimits Limits = ReadinessLimits.AuthoredFixture(Domain, 1000);
    static void Check(bool value, string text) { assertions++; if (!value) throw new Exception(text); }
    static void Test(string name, Action body) { body(); cases++; Console.WriteLine("PASS " + name); }
    static ReplacementReadinessEvidence Good() { return ReplacementReadiness.AuthoredFixture(Key, Now); }
    static ReplacementReadinessEvidence With(ReplacementReadinessEvidence e, MechanicalObservationEvidence o = null,
        ReplacementAssetEvidence a = null, PreparedRenderEvidence r = null, ReplacementOutputEvidence d = null,
        ReplacementHandoffEvidence h = null, ReadinessScope? scope = null)
    { return new ReplacementReadinessEvidence(e.Source, scope ?? e.Scope, o ?? e.Observation, a ?? e.Assets, r ?? e.Render, d ?? e.Output, h ?? e.Handoff); }
    static MechanicalObservationEvidence O(ReplacementReadinessEvidence e, double? rpm = .5, double? load = .4,
        double? throttle = .3, double? speed = 10, MechanicalEvidenceKind kind = MechanicalEvidenceKind.Observed,
        bool valid = true, SourceKey source = null, EvidenceStamp stamp = null, long? sequence = null, long? start = null, long? end = null,
        string provider = "authored-mechanical-provider")
    {
        var o = e.Observation; return new MechanicalObservationEvidence(source ?? o.Source, stamp ?? o.Stamp,
            sequence ?? o.Sequence, start ?? o.AcquisitionStartTicks, end ?? o.AcquisitionEndTicks, kind, provider, rpm, load, throttle, speed, valid);
    }
    static ReplacementAssetEvidence A(ReplacementReadinessEvidence e, SourceKey source = null, EvidenceStamp stamp = null,
        string profile = null, string graph = null, string assets = null, string provenance = null, bool? closure = null)
    {
        var a = e.Assets; return new ReplacementAssetEvidence(source ?? a.Source, stamp ?? a.Stamp, profile ?? a.ProfileIdentity,
            graph ?? a.ProfileGraphSha256, assets ?? a.AssetSetSha256, provenance ?? a.ProvenanceReceiptSha256, closure ?? a.DependencyClosureVerified);
    }
    static PreparedRenderEvidence R(ReplacementReadinessEvidence e, SourceKey source = null, EvidenceStamp stamp = null,
        long? sequence = null, string graph = null, string assets = null, string pcm = null,
        long? host = null, long? device = null, long? renderer = null, long? startFrame = null, long? endFrame = null,
        long? startTick = null, long? endTick = null, int? rate = null, int? channels = null, int? block = null,
        long? budget = null, long? cost = null, long? margin = null, long? periods = null, long? window = null,
        long? misses = null, bool? measured = null, bool? prepared = null)
    {
        var r = e.Render; return new PreparedRenderEvidence(source ?? r.Source, stamp ?? r.Stamp, sequence ?? r.ObservationSequence,
            graph ?? r.ProfileGraphSha256, assets ?? r.AssetSetSha256, pcm ?? r.PreparedPcmSha256,
            host ?? r.HostGeneration, device ?? r.DeviceGeneration, renderer ?? r.RendererGeneration,
            startFrame ?? r.PcmStartFrame, endFrame ?? r.PcmEndFrameExclusive, startTick ?? r.PlaybackStartTicks, endTick ?? r.PlaybackEndTicks,
            rate ?? r.SampleRate, channels ?? r.Channels, block ?? r.BlockFrames, budget ?? r.DeadlineBudgetTicks,
            cost ?? r.WorstCompleteRenderTicks, margin ?? r.SchedulingMarginTicks, periods ?? r.QualifiedPeriods,
            window ?? r.QualificationWindowTicks, misses ?? r.DeadlineMisses, measured ?? r.CompleteCostMeasured, prepared ?? r.PcmPrepared);
    }
    static ReplacementOutputEvidence D(ReplacementReadinessEvidence e, SourceKey source = null, EvidenceStamp stamp = null,
        long? host = null, long? device = null, long? renderer = null, long? sequence = null, long? progressStart = null,
        long? from = null, long? to = null, long? next = null, int? rate = null, int? channels = null, bool? hostHealthy = null, bool? deviceHealthy = null)
    {
        var d = e.Output; return new ReplacementOutputEvidence(source ?? d.Source, stamp ?? d.Stamp, host ?? d.HostGeneration,
            device ?? d.DeviceGeneration, renderer ?? d.RendererGeneration, sequence ?? d.ProgressSequence, progressStart ?? d.ProgressStartTicks,
            from ?? d.PresentedFromFrame, to ?? d.PresentedToFrameExclusive, next ?? d.NextPlaybackTicks,
            rate ?? d.SampleRate, channels ?? d.Channels, hostHealthy ?? d.HostHealthy, deviceHealthy ?? d.DeviceHealthy);
    }
    static ReplacementHandoffEvidence H(ReplacementReadinessEvidence e, SourceKey source = null, EvidenceStamp stamp = null,
        long? activation = null, long? deadline = null, long? transition = null, long? tailFrames = null, long? tail = null, long? expiry = null)
    {
        var h = e.Handoff; return new ReplacementHandoffEvidence(source ?? h.Source, stamp ?? h.Stamp, activation ?? h.ActivationAtTicks,
            deadline ?? h.ActivationDeadlineTicks, transition ?? h.TransitionTicks, tailFrames ?? h.TailFrames,
            tail ?? h.TailBoundTicks, expiry ?? h.LeaseExpiresAtTicks);
    }
    static void Rejected(string name, ReplacementReadinessEvidence evidence, string reason, long now = Now)
    {
        Test(name, delegate {
            var result = ReplacementReadiness.Evaluate(evidence, now, Limits);
            Check(!result.Ready && !result.RuntimeQualified, "rejection must not qualify runtime");
            Check(result.Reasons.Contains(reason), "expected reason " + reason + "; got " + String.Join(",", result.Reasons));
            Check(result.ValidUntilTicks <= now && result.SafetyValidUntilTicks <= now, "rejection cannot create a usable receipt window");
        });
    }
    public static int Main()
    {
        try
        {
            var e = Good();
            Test("authored continuous vehicle evidence is explicit and bounded", delegate {
                var result = ReplacementReadiness.Evaluate(e, Now, Limits);
                Check(result.Ready, String.Join(",", result.Reasons)); Check(result.Scope == ReadinessScope.AuthoredFixture && !result.RuntimeQualified, "authored origin only");
                Check(result.Source.Equals(Key) && result.ClockDomain == Domain && result.ClockFrequency == 1000, "identity and one monotonic clock");
                Check(result.EvaluatedAtTicks == Now && result.ValidUntilTicks == Now + 10, "scheduled preparation window");
                Check(result.SafetyValidUntilTicks == Now + 80 && result.LeaseExpiresAtTicks == Now + 200, "health freshness differs from dispatch and declared lease");
            });
            Rejected("unqualified origin is refused", With(e, scope: ReadinessScope.Unqualified), "runtime-qualification-unavailable");
            Rejected("caller cannot assert runtime qualification", With(e, scope: ReadinessScope.RuntimeQualified), "runtime-qualification-unavailable");
            Rejected("unknown scope is refused", With(e, scope: (ReadinessScope)99), "runtime-qualification-unavailable");
            Rejected("missing aggregate evidence", null, "evidence-missing");
            Rejected("missing mechanical snapshot", new ReplacementReadinessEvidence(Key, ReadinessScope.AuthoredFixture, null, e.Assets, e.Render, e.Output, e.Handoff), "observation-missing");
            Rejected("missing prepared render", new ReplacementReadinessEvidence(Key, ReadinessScope.AuthoredFixture, e.Observation, e.Assets, null, e.Output, e.Handoff), "render-missing");
            Rejected("missing output snapshot", new ReplacementReadinessEvidence(Key, ReadinessScope.AuthoredFixture, e.Observation, e.Assets, e.Render, null, e.Handoff), "output-missing");
            Rejected("unavailable RPM is not invented idle", With(e, o: O(e, rpm: null)), "mechanical-input-invalid-or-unavailable");
            Rejected("unavailable load is not inferred from throttle", With(e, o: O(e, load: null)), "mechanical-input-invalid-or-unavailable");
            Rejected("unavailable throttle is not defaulted", With(e, o: O(e, throttle: null)), "mechanical-input-invalid-or-unavailable");
            Rejected("unavailable speed is not defaulted", With(e, o: O(e, speed: null)), "mechanical-input-invalid-or-unavailable");
            Rejected("NaN mechanics", With(e, o: O(e, rpm: Double.NaN)), "mechanical-input-invalid-or-unavailable");
            Rejected("infinite mechanics", With(e, o: O(e, load: Double.PositiveInfinity)), "mechanical-input-invalid-or-unavailable");
            Rejected("out of range RPM", With(e, o: O(e, rpm: 1.001)), "mechanical-input-invalid-or-unavailable");
            Rejected("negative load", With(e, o: O(e, load: -.001)), "mechanical-input-invalid-or-unavailable");
            Rejected("excess speed", With(e, o: O(e, speed: 100.001)), "mechanical-input-invalid-or-unavailable");
            Rejected("estimated inputs cannot impersonate actual measurements", With(e, o: O(e, kind: MechanicalEvidenceKind.Estimated)), "mechanical-provenance-invalid");
            Rejected("missing provider provenance", With(e, o: O(e, provider: "")), "mechanical-provenance-invalid");
            Rejected("invalid observation is refused", With(e, o: O(e, valid: false)), "mechanical-provenance-invalid");
            foreach (var other in new[] {
                new SourceKey("other-session",12345,17,0xF9300CC5,"vehicle-continuous"),
                new SourceKey("fixture-session-01",12346,17,0xF9300CC5,"vehicle-continuous"),
                new SourceKey("fixture-session-01",12345,18,0xF9300CC5,"vehicle-continuous"),
                new SourceKey("fixture-session-01",12345,17,1,"vehicle-continuous"),
                new SourceKey("fixture-session-01",12345,17,0xF9300CC5,"vehicle-other") })
                Rejected("source component binding " + other.Session + "/" + other.Handle + "/" + other.Generation + "/" + other.Model + "/" + other.Category,
                    With(e, a: A(e, source: other)), "source-binding-mismatch");
            Test("equivalent immutable source values bind", delegate {
                var same = new SourceKey(Key.Session,Key.Handle,Key.Generation,Key.Model,Key.Category);
                Check(ReplacementReadiness.Evaluate(With(e, a: A(e, source: same)), Now, Limits).Ready, "value identity, not object identity");
            });
            Rejected("mixed monotonic domain", With(e, d: D(e, stamp: new EvidenceStamp("other-clock",1000,Now-5))), "output-clock-mismatch");
            Rejected("mixed tick frequency", With(e, r: R(e, stamp: new EvidenceStamp(Domain,10000000,Now-5))), "render-clock-mismatch");
            Rejected("future observation", With(e, o: O(e, stamp: new EvidenceStamp(Domain,1000,Now+1))), "observation-stale-or-future");
            Rejected("inclusive observation expiry", With(e, o: O(e, stamp: new EvidenceStamp(Domain,1000,Now-100), start: Now-101, end: Now-99)), "observation-stale-or-future");
            Rejected("reversed acquisition bracket", With(e, o: O(e, start: Now-5, end: Now-20)), "observation-acquisition-invalid");
            Rejected("old acquisition cannot be refreshed by recent stamp", With(e, o: O(e, start: Now-100)), "observation-acquisition-invalid");
            Rejected("zero source sequence", With(e, o: O(e, sequence: 0)), "mechanical-provenance-invalid");
            Rejected("asset closure absent", With(e, a: A(e, closure: false)), "asset-identity-provenance-or-closure-invalid");
            Rejected("asset provenance absent", With(e, a: A(e, provenance: "")), "asset-identity-provenance-or-closure-invalid");
            Rejected("asset graph malformed", With(e, a: A(e, graph: "not-a-digest")), "asset-identity-provenance-or-closure-invalid");
            Rejected("profile identity absent", With(e, a: A(e, profile: "")), "asset-identity-provenance-or-closure-invalid");
            Rejected("render belongs to different observation sequence", With(e, r: R(e, sequence: 8)), "render-input-binding-mismatch");
            Rejected("render belongs to different graph", With(e, r: R(e, graph: new String('e',64))), "render-input-binding-mismatch");
            Rejected("render belongs to different asset set", With(e, r: R(e, assets: new String('f',64))), "render-input-binding-mismatch");
            Rejected("render predates consumed mechanical input", With(e, r: R(e, stamp: new EvidenceStamp(Domain,1000,Now-20))), "render-preparation-chronology-invalid");
            Rejected("PCM not actually prepared", With(e, r: R(e, prepared: false)), "prepared-pcm-invalid");
            Rejected("PCM identity missing", With(e, r: R(e, pcm: "")), "prepared-pcm-invalid");
            Rejected("empty PCM frame interval", With(e, r: R(e, endFrame: 48000)), "prepared-pcm-invalid");
            Rejected("PCM timeline does not match frame count", With(e, r: R(e, endTick: e.Render.PlaybackEndTicks+1)), "pcm-interval-timeline-mismatch");
            Rejected("unsupported sample rate", With(e, r: R(e, rate: 44100)), "prepared-pcm-invalid");
            Rejected("unsupported channel shape", With(e, r: R(e, channels: 1)), "prepared-pcm-invalid");
            Rejected("unsupported block shape", With(e, r: R(e, block: 1024)), "prepared-pcm-invalid");
            Rejected("partial cost measurement", With(e, r: R(e, measured: false)), "render-performance-unqualified");
            Rejected("render deadline miss", With(e, r: R(e, misses: 1)), "render-performance-unqualified");
            Rejected("insufficient measured periods", With(e, r: R(e, periods: 63)), "render-performance-unqualified");
            Rejected("insufficient measured duration", With(e, r: R(e, window: 999)), "render-performance-unqualified");
            Rejected("full render cost exceeds budget", With(e, r: R(e, cost: 11)), "render-deadline-budget-exceeded");
            Rejected("scheduling margin consumes remaining budget", With(e, r: R(e, margin: 7)), "render-deadline-budget-exceeded");
            Rejected("budget cannot exceed actual block duration", With(e, r: R(e, budget: 12)), "render-deadline-budget-exceeded");
            Rejected("fractional block duration is rounded conservatively for deadline budget", With(e, r: R(e, budget: 11)), "render-deadline-budget-exceeded");
            Rejected("zero or unmeasured complete cost", With(e, r: R(e, cost: 0)), "render-deadline-budget-exceeded");
            Rejected("host generation changed", With(e, d: D(e, host: 2)), "output-generation-mismatch");
            Rejected("device generation changed", With(e, d: D(e, device: 3)), "output-generation-mismatch");
            Rejected("renderer generation changed", With(e, d: D(e, renderer: 4)), "output-generation-mismatch");
            Rejected("host disappeared", With(e, d: D(e, hostHealthy: false)), "host-or-device-unhealthy");
            Rejected("device failed", With(e, d: D(e, deviceHealthy: false)), "host-or-device-unhealthy");
            Rejected("healthy booleans cannot replace actual output progress", With(e, d: D(e, from: 48000, to: 48000)), "output-progress-unproven");
            Rejected("one frame cannot establish healthy fifteen millisecond output progress", With(e, d: D(e, from: 47999, to: 48000)), "output-progress-cadence-invalid");
            Rejected("implausibly fast presented frame count", With(e, d: D(e, from: 40000, to: 48000)), "output-progress-cadence-invalid");
            Rejected("tiny heartbeat interval is not a presentation window", With(e, d: D(e, progressStart: Now-6)), "output-progress-cadence-invalid");
            Rejected("output progress sequence absent", With(e, d: D(e, sequence: 0)), "output-progress-unproven");
            Rejected("stale output heartbeat", With(e, d: D(e, stamp: new EvidenceStamp(Domain,1000,Now-100))), "output-stale-or-future");
            Rejected("old output progress cannot be refreshed with a timestamp", With(e, d: D(e, progressStart: Now-100)), "output-progress-unproven");
            Rejected("output frame gap before prepared PCM", With(e, d: D(e, from: 46000, to: 47000)), "output-pcm-continuity-mismatch");
            Rejected("output playback clock does not match PCM", With(e, d: D(e, next: e.Output.NextPlaybackTicks+1)), "output-pcm-continuity-mismatch");
            Rejected("handoff predates output and preparation", With(e, h: H(e, stamp: new EvidenceStamp(Domain,1000,Now-20))), "handoff-chronology-invalid");
            Rejected("activation deadline is before requested activation", With(e, h: H(e, deadline: Now+9)), "handoff-timing-invalid");
            Rejected("unbounded transition", With(e, h: H(e, transition: 11)), "handoff-timing-invalid");
            Rejected("tail frames exceed declared bound", With(e, h: H(e, tailFrames: 481, tail: 10)), "handoff-tail-unbounded");
            Rejected("tail exceeds limit", With(e, h: H(e, tail: 21)), "handoff-tail-unbounded");
            Rejected("negative tail frames", With(e, h: H(e, tailFrames: -1)), "handoff-tail-unbounded");
            Rejected("expired lease", With(e, h: H(e, expiry: Now)), "lease-invalid-or-no-recovery-reserve");
            Rejected("lease exceeds bound", With(e, h: H(e, expiry: Now+251)), "lease-invalid-or-no-recovery-reserve");
            Rejected("lease leaves no transition and tail reserve", With(e, h: H(e, expiry: Now+22)), "lease-invalid-or-no-recovery-reserve");
            Rejected("prepared frames do not span the lease and tail", With(e, r: R(e, endFrame: 52800, endTick: Now+110)), "prepared-horizon-insufficient");
            Rejected("preparation admission is half open at planned activation", e, "readiness-window-empty", Now+10);
            Rejected("negative evaluation clock", e, "evaluation-time-invalid", -1);
            Rejected("near-overflow stamp cannot wrap freshness", With(e, d: D(e, stamp: new EvidenceStamp(Domain,1000,Int64.MaxValue-1))), "output-clock-overflow", Int64.MaxValue-1);
            Test("clock scaling preserves wall-duration policy", delegate {
                long frequency=10000000, now=frequency*10;
                var evidence=ReplacementReadiness.AuthoredFixture(Key,now,frequency);
                var result=ReplacementReadiness.Evaluate(evidence,now,ReadinessLimits.AuthoredFixture(Domain,frequency));
                Check(result.Ready, String.Join(",",result.Reasons)); Check(result.ValidUntilTicks-now==frequency/100,"10ms dispatch window");
                Check(result.SafetyValidUntilTicks-now==frequency*8/100,"80ms consumed-evidence freshness");
            });
            Test("accepted result and snapshots expose no mutable public state", delegate {
                Type[] types={typeof(EvidenceStamp),typeof(MechanicalObservationEvidence),typeof(ReplacementAssetEvidence),typeof(PreparedRenderEvidence),
                    typeof(ReplacementOutputEvidence),typeof(ReplacementHandoffEvidence),typeof(ReplacementReadinessEvidence),typeof(ReadinessLimits),typeof(ReadinessDecision)};
                foreach(var type in types){Check(type.IsSealed,"sealed "+type.Name);foreach(var property in type.GetProperties())Check(property.GetSetMethod()==null,"no public setter "+type.Name+"."+property.Name);}
                Check(typeof(ReadinessDecision).GetConstructors().Length==0,"caller cannot construct positive decision");
                var rejected=ReplacementReadiness.Evaluate(With(e,o:O(e,rpm:null)),Now,Limits);
                string original=rejected.Reasons[0];var copy=rejected.Reasons;copy[0]="changed";
                Check(rejected.Reasons[0]==original,"reason array defensively cloned");
                var accepted=ReplacementReadiness.Evaluate(e,Now,Limits);
                Check(accepted.Evidence.Observation.RpmRatio==.5&&accepted.Evidence.Render.HostGeneration==1,"accepted immutable evidence retained");
                Check(!accepted.RuntimeQualified,"accepted fixture never becomes runtime authority");
            });
            Test("invalid limits are rejected before evaluation",delegate{
                bool rejected=false;try{ReadinessLimits.AuthoredFixture("",1000);}catch(ArgumentException){rejected=true;}Check(rejected,"missing clock identity");
                var missing=ReplacementReadiness.Evaluate(e,Now,null);Check(!missing.Ready&&missing.Reasons.Contains("limits-missing"),"missing limits fail closed");
            });
            Console.WriteLine("RESULT cases="+cases+" assertions="+assertions+" scope=authored-offline gameLaunched=false endpointOpened=false runtimeQualified=false");
            return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
