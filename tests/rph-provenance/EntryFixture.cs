// Executes source-identical diagnostic code with a separately generated fixture
// policy and a test-only runtime facade. This is not production/RPH execution.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

[assembly: AssemblyFileVersion("10.0.0.0")]

internal static class EntryFixture
{
    static int assertions;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 16 };
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    static void Need(bool value, string reason) { assertions++; if (!value) throw new InvalidDataException(reason); }
    static string Hash(string path)
    {
        using (var file = File.OpenRead(path)) using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
    }
    static object Field(Type policy, string name)
    { return policy.GetField(name, BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public).GetRawConstantValue(); }
    static string Text(Type policy, string name) { return (string)Field(policy, name); }
    static IDictionary<string, object> Object(object value) { return (IDictionary<string, object>)value; }
    static void Denied(IDictionary<string, object> report)
    {
        foreach (string key in new[] { "sourceAttachmentAllowed", "sourceOpenAllowed", "sourceBeginAllowed", "gameplayPublicationAllowed", "audioAllowed", "firstSeenHashMayBePromoted" })
            Need(report[key] is bool && !(bool)report[key], "entry-activation-must-remain-denied:" + key);
        Need((bool)report["reportDoesNotEstablishTrust"], "observation-is-not-trust");
        Need((bool)report["fixtureOnly"], "fixture-policy-label");
        Need((string)Object(report["expectedApiRuntime"])["state"] == "unreviewed", "entry-never-mints-reviewed-runtime");
    }
    static void Run(string[] args)
    {
        Need(args.Length == 2, "fixture-arguments");
        string image = Path.GetFullPath(args[0]), caseName = args[1];
        string own = Assembly.GetExecutingAssembly().Location, root = Path.GetDirectoryName(own);
        Need(image.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "fixture-image-owned-directory");
        var facade = Assembly.LoadFrom(Path.Combine(root, "RagePluginHook.dll"));
        Need(facade.GetName().Name == "RagePluginHook", "test-facade-identity");
        var imageAssembly = Assembly.LoadFrom(image);
        var policy = imageAssembly.GetType("RichAudio.Beacon.Provenance.RphProvenanceBuildPolicy", true);
        Need((bool)Field(policy, "FixturePolicy"), "never-execute-production-policy");
        Need(String.Equals(Text(policy, "GamePath"), own, StringComparison.OrdinalIgnoreCase), "fixture-policy-current-owned-host");
        Need(Text(policy, "WorkspaceRoot").StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "fixture-owned-workspace");
        var entry = imageAssembly.GetType("RichAudio.Beacon.Rph.RphProvenanceEntry", true);
        Need(!imageAssembly.GetTypes().Any(t => t.FullName.Contains("ShvProducer") || t.FullName.Contains("Gameplay") || t.FullName.Contains("AudioHost")), "fixture-profile-no-source-or-audio-types");
        long made, exit, kernel, user; int pid;
        using (var process = Process.GetCurrentProcess()) { pid = process.Id; Need(GetProcessTimes(process.Handle, out made, out exit, out kernel, out user), "actual-process-creation"); }
        string session = Guid.NewGuid().ToString("N");
        var lease = new Dictionary<string, object>(StringComparer.Ordinal) {
            {"schema",1},{"profile","PLAYABLE-10"},{"purpose","rph-runtime-provenance-only"},{"sessionId",session},
            {"gameProcessId",pid},{"gameProcessCreationFileTime",made.ToString(CultureInfo.InvariantCulture)},
            {"callerAssemblySha256",Hash(image)},{"gamePath",Text(policy,"GamePath")},{"gameSha256",Text(policy,"GameSha256")},
            {"gameVersion",Text(policy,"GameVersion")},{"launcherPath",Text(policy,"LauncherPath")},{"launcherSha256",Text(policy,"LauncherSha256")},
            {"launcherVersion",Text(policy,"LauncherVersion")},{"shvPath",Text(policy,"ShvPath")},{"shvSha256",Text(policy,"ShvSha256")},
            {"loaderPath",Text(policy,"LoaderPath")},{"loaderSha256",Text(policy,"LoaderSha256")},{"preservedProducerSha256",Text(policy,"PreservedProducerSha256")},
            {"diagnosticOnly",true},{"sourceAttachmentAllowed",false},{"audioPlaybackAllowed",false},{"asiDeploymentAllowed",false},{"runtimeExpectationState","UNREVIEWED"}
        };
        string expected = "api-runtime-policy-unreviewed"; bool reportExpected = true;
        switch (caseName) {
            case "valid-unreviewed": break;
            case "wrong-process": lease["gameProcessId"] = pid + 1; expected = "process-id-mismatch"; break;
            case "wrong-creation": lease["gameProcessCreationFileTime"] = (made + 1).ToString(CultureInfo.InvariantCulture); expected = "process-creation-mismatch"; break;
            case "wrong-caller": lease["callerAssemblySha256"] = new string('0',64); expected = "caller-assembly-digest-mismatch"; break;
            case "wrong-session": lease["sessionId"] = new string('x',32); reportExpected = false; expected = "bootstrap-session-format"; break;
            case "wrong-profile": lease["profile"] = "PLAYABLE-09"; reportExpected = false; expected = "bootstrap-policy-mismatch:profile"; break;
            case "source-opt-in": lease["sourceAttachmentAllowed"] = true; reportExpected = false; expected = "bootstrap-purpose-mismatch:sourceAttachmentAllowed"; break;
            case "audio-opt-in": lease["audioPlaybackAllowed"] = true; reportExpected = false; expected = "bootstrap-purpose-mismatch:audioPlaybackAllowed"; break;
            case "asi-opt-in": lease["asiDeploymentAllowed"] = true; reportExpected = false; expected = "bootstrap-purpose-mismatch:asiDeploymentAllowed"; break;
            case "runtime-self-review": lease["runtimeExpectationState"] = "REVIEWED"; reportExpected = false; expected = "bootstrap-policy-mismatch:runtimeExpectationState"; break;
            case "unknown-lease-field": lease["trustMe"] = true; reportExpected = false; expected = "unknown-or-duplicate-bootstrap-field"; break;
            case "duplicate-lease-field": reportExpected = false; expected = "unknown-or-duplicate-bootstrap-field"; break;
            case "changed-installed-scope": File.AppendAllText(Text(policy,"ShvPath"),"changed"); reportExpected = false; expected = "diagnostic-installed-scope-mismatch"; break;
            case "changed-launcher": File.AppendAllText(Text(policy,"LauncherPath"),"changed"); expected = "launcher-digest-mismatch"; break;
            case "occupied-report-output": reportExpected = false; expected = "provenance-session-output-already-exists"; break;
            case "unload-before-entry": reportExpected = false; expected = "diagnostic-lease-not-acquired"; entry.GetMethod("OnUnload").Invoke(null,null); break;
            default: throw new InvalidDataException("unknown-fixture-case");
        }
        string reportDirectory = Path.Combine(Text(policy,"WorkspaceRoot"),".local","playable-10","runtime-provenance",session);
        string reportPath = Path.Combine(reportDirectory,"runtime-provenance.json");
        string marker = Path.Combine(reportDirectory,"preserve.txt");
        if(caseName=="occupied-report-output") { Directory.CreateDirectory(reportDirectory); File.WriteAllText(marker,"owned prior output"); }
        string leasePath=Text(policy,"LeasePath"); Directory.CreateDirectory(Path.GetDirectoryName(leasePath));
        string json=Json.Serialize(lease);
        if(caseName=="duplicate-lease-field")json="{\"profile\":\"PLAYABLE-10\","+json.Substring(1);
        File.WriteAllText(leasePath,json,new System.Text.UTF8Encoding(false));
        entry.GetMethod("Main").Invoke(null,null);
        var game=facade.GetType("Rage.Game",true);
        var logs=(string[])game.GetMethod("FixtureLogs").Invoke(null,null);
        Need(logs.Length>=2&&logs.Any(s=>s.Contains(expected)),"precise-entry-terminal:"+expected);
        Need(File.Exists(reportPath)==reportExpected,"actual-report-presence");
        string digest=null;
        if(reportExpected) {
            Need(new System.IO.FileInfo(reportPath).Length>0&&new System.IO.FileInfo(reportPath).Length<=32768,"actual-private-report-budget");
            var report=Object(Json.DeserializeObject(File.ReadAllText(reportPath)));Denied(report);
            Need((string)report["terminalReason"]==expected,"report-terminal");
            Need(!(bool)report["provenanceMatched"],"unreviewed-or-mismatch-never-matches");
            var runtime=Object(report["actualApiRuntime"]);var runtimeFile=Object(runtime["file"]);
            Need((string)runtimeFile["sha256"]==Hash(facade.Location),"actual-facade-bytes-retained");
            Need((string)runtime["assemblyFullName"]==facade.FullName,"actual-facade-name-retained");
            Need((string)runtime["moduleMvid"]==facade.ManifestModule.ModuleVersionId.ToString("D"),"actual-facade-mvid-retained");
            if(caseName=="valid-unreviewed") {
                Need((string)Object(report["actualLauncher"])["sha256"]==Text(policy,"LauncherSha256"),"independent-launcher-bytes-retained");
                Need(Text(policy,"LauncherSha256")!=(string)runtimeFile["sha256"],"launcher-is-not-api-bytes");
                Need((bool)runtime["loadedAndFileMetadataConsistent"],"actual-loaded-file-metadata-consistency");
            }
            digest=Hash(reportPath);
        }
        if(caseName=="occupied-report-output")Need(File.ReadAllText(marker)=="owned prior output","existing-output-preserved");
        int before=logs.Length; entry.GetMethod("Main").Invoke(null,null); entry.GetMethod("OnUnload").Invoke(null,null);
        Need(((string[])game.GetMethod("FixtureLogs").Invoke(null,null)).Length==before,"one-run-only-no-retry");
        if(reportExpected)Need(Hash(reportPath)==digest,"second-entry-no-report-overwrite");
        Console.WriteLine(Json.Serialize(new {schema=1,passed=true,caseName=caseName,assertions=assertions,terminalReason=expected,reportWritten=reportExpected,
            reportSha256=digest,fixturePolicyOnly=true,actualProcessIdentityObserved=true,sourceAttached=false,sourceOpened=false,sourceBegin=false,
            gameplayFramesPublished=0,actualRphExecuted=false,actualShvExecuted=false,gameExecuted=false,endpointOpened=false,audioPlayback=false}));
    }
    public static int Main(string[] args)
    {
        try { Run(args); return 0; }
        catch(Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
    }
}
