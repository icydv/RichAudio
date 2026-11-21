using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Rage;
using RichAudio.Beacon.Rph;

public static class CompatibilityFixtureHarness
{
    static int assertions,cases;
    static readonly List<string> passed=new List<string>();
    static void Need(bool value,string reason){assertions++;if(!value)throw new InvalidOperationException(reason);}
    static void Case(string name,Action run){run();cases++;passed.Add(name);}
    public static string Run(string scenario)
    {
        Fixture.Reset();Fixture.ThrowOnRead=true;
        var result=RphHandoffCompatibility.Inspect();
        bool expected=!scenario.StartsWith("reject-",StringComparison.Ordinal);
        Case("shape-"+scenario,delegate{Need(result.Compatible==expected,"compatibility-outcome");
            Need(Fixture.GetterCalls==0,"shape-inspection-must-not-call-api");
            Need(expected?result.Reason=="rph-required-api-shapes-present":result.Reason.StartsWith("rph-required-api-incompatible:",StringComparison.Ordinal),"observable-reason");});
        if(scenario=="memory")Case("missing-location-hash-version-diagnostics-not-gates",delegate{
            Need(result.ApiLocation=="","memory-location-empty");Need(result.ApiSha256==null,"no-diagnostic-hash");
            Need(result.ApiFileVersion==null,"no-diagnostic-version");Need(result.DiagnosticStatus=="best-effort-metadata-incomplete","incomplete-diagnostic");Need(result.Compatible,"missing-diagnostic-stays-compatible");});
        else Case("diagnostics-separated-from-compatibility",delegate{
            Need(result.ApiSha256!=null&&result.ApiSha256.Length==64,"diagnostic-hash-recorded");
            Need(result.ApiMvid!=null&&result.ApiAssemblyName!=null,"metadata-recorded");
            Need(result.DiagnosticStatus=="best-effort-metadata-captured","diagnostics-captured");});
        if(scenario=="unknown-version")Case("unknown-version-is-not-incompatibility",delegate{
            Need(result.ApiFileVersion=="9.9.9.9","unknown-version-fixture");Need(result.Compatible,"unknown-version-accepted");});
        if(scenario=="normal"||scenario=="extra-bytes")Case("identical-version-distinct-launcher-api-bytes",delegate{
            string launcher=Path.Combine(Path.GetDirectoryName(typeof(CompatibilityFixtureHarness).Assembly.Location),"LauncherFixture.dll");
            string digest;using(var stream=File.OpenRead(launcher))using(var sha=SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
            Need(System.Diagnostics.FileVersionInfo.GetVersionInfo(launcher).FileVersion==result.ApiFileVersion,"same-file-version");
            Need(digest!=result.ApiSha256,"different-bytes-and-hashes");Need(result.Compatible,"different-hash-compatible");});
#if SAMPLER_TESTS
        if(expected&&scenario=="normal")RunSampler();
#endif
        return new JavaScriptSerializer().Serialize(new{passed=true,cases=cases,assertions=assertions,casesPassed=passed,
            fixtureOnly=true,actualRphRuntimeExecuted=false,actualShvRuntimeExecuted=false,gameLaunched=false,
            endpointOpened=false,audioPlayed=false,apiSha256=result.ApiSha256,apiFileVersion=result.ApiFileVersion});
    }
#if SAMPLER_TESTS
    static Rage.Ped ped;static Rage.Vehicle vehicle;
    static RichAudio.Beacon.Handoff.RphHandoffSampler Sampler()
    {
        Fixture.Reset();Fixture.Read(0);CameraSampler.Ready=true;
        ped=new Ped{Address=new IntPtr(0x12340),Pool=new PoolHandle{IndexValue=2,CounterValue=4,RawValue=516}};
        vehicle=new Vehicle{Address=new IntPtr(0x45670),Pool=new PoolHandle{IndexValue=3,CounterValue=5,RawValue=773},EntityModel=new Model{Value=0xf9300cc5}};
        ped.Vehicle=vehicle;vehicle.Owner=ped;Fixture.Player=new Player{Ped=ped};
        RichAudio.Beacon.Handoff.RphHandoffSampler sampler;string reason;
        Need(RichAudio.Beacon.Handoff.RphHandoffSampler.TryAcquire(out sampler,out reason),"valid-bati-acquired:"+reason);
        Need(sampler!=null&&!sampler.Retired,"retained-instance-live");return sampler;
    }
    static void Retirement(string name,Action change)
    {
        Case(name,delegate{var sampler=Sampler();change();string reason;Need(sampler.Capture(out reason)==null,"invalid-observation-rejected");
            Need(sampler.Retired,"invalid-context-retires");int calls=Fixture.GetterCalls;
            Fixture.ThrowOnRead=false;vehicle.Valid=true;vehicle.Running=true;ped.Valid=true;ped.Vehicle=vehicle;vehicle.Owner=ped;
            Need(sampler.Capture(out reason)==null&&reason=="rph-instance-retired","no-reacquisition");Need(Fixture.GetterCalls==calls,"retired-no-getters");});
    }
    static void RunSampler()
    {
        Case("actual-sampler-valid-independent-bati-context",delegate{var sampler=Sampler();string reason;var peer=sampler.Capture(out reason);
            Need(peer!=null&&reason=="independent-rph-observation","valid-context-captured");Need(peer.VehicleAddress==0x45670&&peer.PedAddress==0x12340,"opaque-address-identity");
            Need(peer.Context.Model==0xf9300cc5,"bati-scope");});
        Retirement("actual-sampler-getter-exception-safe-retirement",delegate{Fixture.ThrowOnRead=true;});
        Retirement("actual-sampler-nan-pose-safe-retirement",delegate{vehicle.Location=new Vector3(float.NaN,0,0);});
        Retirement("actual-sampler-infinite-pose-safe-retirement",delegate{vehicle.Motion=new Vector3(float.PositiveInfinity,0,0);});
        Retirement("actual-sampler-invalid-basis-safe-retirement",delegate{vehicle.Forward=new Vector3(0,0,0);});
        Retirement("actual-sampler-excess-speed-safe-retirement",delegate{vehicle.Motion=new Vector3(101,0,0);});
        Retirement("actual-sampler-driver-mismatch-safe-retirement",delegate{vehicle.Owner=new Ped{Address=new IntPtr(0x99990),Pool=ped.Pool};});
        Retirement("actual-sampler-vehicle-mismatch-safe-retirement",delegate{ped.Vehicle=new Vehicle{Address=new IntPtr(0x88880),Pool=vehicle.Pool};});
        Retirement("actual-sampler-generation-change-safe-retirement",delegate{var pool=vehicle.Pool;pool.CounterValue++;vehicle.Pool=pool;});
        Retirement("actual-sampler-model-change-safe-retirement",delegate{vehicle.EntityModel=new Model{Value=1};});
        Retirement("actual-sampler-engine-off-safe-retirement",delegate{vehicle.Running=false;});
        Retirement("actual-sampler-dead-ped-safe-retirement",delegate{ped.Dead=true;});
        Retirement("actual-sampler-invalid-wrapper-safe-retirement",delegate{vehicle.Valid=false;});
        Retirement("actual-sampler-story-lost-safe-retirement",delegate{CameraSampler.Ready=false;});
        Retirement("actual-sampler-paused-safe-retirement",delegate{Fixture.Paused=true;});
        Case("actual-sampler-explicit-stop-permanent",delegate{var sampler=Sampler();sampler.Retire();int calls=Fixture.GetterCalls;string reason;
            Need(sampler.Capture(out reason)==null&&reason=="rph-instance-retired","explicit-stop");Need(calls==Fixture.GetterCalls,"stop-no-getters");});
    }
#endif
}
