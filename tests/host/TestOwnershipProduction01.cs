using System;
using System.Reflection;
using System.Runtime.InteropServices;
using RichAudio.Ownership.Boundary01;

// Compiled separately against the production DLL, without OWNERSHIP_FIXTURES.
// This prevents a fixture-enabled test build from standing in for surface proof.
public static class TestOwnershipProduction01
{
    static int checks;
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception(message);
        checks++;
    }
    static ReplacementReadinessEvidence Evidence(SourceKey source, ReadinessScope scope)
    {
        var observed = new EvidenceStamp("production-surface-test", 1000, 990);
        var prepared = new EvidenceStamp("production-surface-test", 1000, 995);
        var handoff = new EvidenceStamp("production-surface-test", 1000, 999);
        string graph = new string('a', 64), assets = new string('b', 64);
        return new ReplacementReadinessEvidence(source, scope,
            new MechanicalObservationEvidence(source, observed, 7, 989, 991,
                MechanicalEvidenceKind.Observed, "authored-provider", .5, .4, .3, 10, true),
            new ReplacementAssetEvidence(source, observed, "authored-profile", graph, assets, new string('c', 64), true),
            new PreparedRenderEvidence(source, prepared, 7, graph, assets, new string('d', 64),
                1, 2, 3, 48000, 96000, 1010, 2010, 48000, 2, 512, 10, 4, 2, 128, 1000, 0, true, true),
            new ReplacementOutputEvidence(source, prepared, 1, 2, 3, 11, 980, 47488, 48000, 1010, 48000, 2, true, true),
            new ReplacementHandoffEvidence(source, handoff, 1010, 1020, 2, 480, 10, 1200));
    }
    public static int Main()
    {
        try
        {
            var assembly = typeof(OwnershipBoundary).Assembly;
            Check(assembly.GetName().Name == "RichAudio.Ownership.Boundary01", "Test must load the separate production library");
            Check(!OwnershipBoundary.ProductionClaimsEnabled && OwnershipBoundary.RegisteredNativeAdapterCount == 0, "Production claims must remain closed");
            Check(assembly.GetType("RichAudio.Ownership.Boundary01.FixtureOwnershipAuthority") == null, "Fixture authority leaked into production");
            Check(typeof(ReplacementReadiness).GetMethod("AuthoredFixture") == null, "Fixture builder leaked into production");
            Check(typeof(ReadinessLimits).GetMethod("AuthoredFixture") == null, "Fixture limits leaked into production");
            Check(typeof(OwnershipBoundary).GetConstructors().Length == 1, "A second public authority path appeared");
            Check(typeof(OwnershipCommand).GetConstructors().Length == 0, "Callers must not manufacture admitted commands");
            Check(typeof(ReadinessDecision).GetConstructors().Length == 0, "Callers must not manufacture readiness decisions");
            bool noPInvoke = true;
            foreach (var type in assembly.GetTypes())
                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                    noPInvoke &= method.GetCustomAttributes(typeof(DllImportAttribute), false).Length == 0;
            Check(noPInvoke, "Boundary must not contain native imports");
            foreach (var reference in assembly.GetReferencedAssemblies())
                Check(reference.Name == "mscorlib" || reference.Name == "System" || reference.Name == "System.Core", "Unexpected runtime dependency: " + reference.Name);

            var source = new SourceKey("production-fixture", 17, 5, 0xf9300cc5, "engine-idle-wave");
            var limits = new ReadinessLimits("production-surface-test", 1000, 100, 2000, 100, 50, 100, 250, 10, 20, 64, 1000);
            var declared = ReplacementReadiness.Evaluate(Evidence(source, ReadinessScope.AuthoredFixture), 1000, limits);
            Check(declared.Ready && !declared.RuntimeQualified, "Fixture declarations must stay labelled, even when consistent");
            var forgedRuntime = ReplacementReadiness.Evaluate(Evidence(source, ReadinessScope.RuntimeQualified), 1000, limits);
            Check(!forgedRuntime.Ready && !forgedRuntime.RuntimeQualified, "Caller must not self-qualify runtime evidence");
            var boundary = new OwnershipBoundary(source, new OwnershipLimits("production-surface-test", 1000, 200, 100));
            var prior = new PreviousStateToken(source, "actual-custom-profile-declaration", "declared-owner", "declared-revision");
            Check(!boundary.Prepare(declared, prior, 1000), "Consistent fixture declarations cannot enable a production claim");
            Check(boundary.RequestClaim(1001) == null, "Production boundary emitted a claim");
            Check(!boundary.TryAdmitDispatch(null, source, 1001), "Production boundary admitted an absent command");
            Check(!boundary.Acknowledge(null, 1001), "Production boundary accepted an absent receipt");
            Check(boundary.Shutdown(1002) == null, "No-dispatch shutdown emitted native work");
            var state = boundary.Snapshot();
            Check(state.State == OwnershipState.NATIVE && state.NativeEvidence == "untouched", "No-dispatch shutdown changed the native-state claim");
            Check(!state.NativeRecoveryVerified && !state.ReplacementPermitted, "No-dispatch shutdown fabricated recovery or output permission");
            Console.WriteLine("PASS production assembly checks=" + checks + "; zero adapters, zero native calls, no runtime qualification");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
