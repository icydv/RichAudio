using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using P=RichAudio.Beacon.Provenance.RphRuntimeProvenance;

internal static class ProvenanceUnitTests
{
    static string root,launcherPath,runtimePath,runtimeBPath,executable,evidence;
    static Assembly runtime,caller;
    static int pid,assertions;
    static ulong creation;
    static readonly List<object> results=new List<object>();
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateHardLinkW(string name,string existing,IntPtr reserved);
    static void Assert(bool value,string reason){assertions++;if(!value)throw new InvalidOperationException(reason);}
    static string Sha(string path){using(var f=File.OpenRead(path))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
    static Dictionary<string,object> Dict(object value){return (Dictionary<string,object>)value;}
    static object At(Dictionary<string,object> value,params string[] path){object current=value;foreach(string name in path)current=Dict(current)[name];return current;}
    static string Str(object value){return value==null?null:Convert.ToString(value,System.Globalization.CultureInfo.InvariantCulture);}
    static P.LauncherPolicy Launcher(string path=null,string sha=null,long? size=null,string version=null)
    {path=path??launcherPath;return new P.LauncherPolicy(path,sha??Sha(launcherPath),size??new FileInfo(launcherPath).Length,version??FileVersionInfo.GetVersionInfo(launcherPath).FileVersion);}
    static P.ApiRuntimePolicy Reviewed(string path=null,string sha=null,long? size=null,string version=null,string name=null,string mvid=null,string[] refs=null)
    {return P.ApiRuntimePolicy.Reviewed(path??runtimePath,sha??Sha(runtimePath),size??new FileInfo(runtimePath).Length,
        version??FileVersionInfo.GetVersionInfo(runtimePath).FileVersion,name??runtime.FullName,mvid??runtime.ManifestModule.ModuleVersionId.ToString("D"),refs??new[]{evidence});}
    static P.SessionContext Context(string session=null,string expected=null,int? processId=null,ulong? created=null,string processPath=null,
        Assembly actualCaller=null,string callerSha=null,string workspace=null)
    {session=session??Guid.NewGuid().ToString("N");return new P.SessionContext(workspace??root,session,expected??session,processId??pid,created??creation,
        processPath??executable,actualCaller??caller,callerSha??Sha(caller.Location),true);}
    static Dictionary<string,object> Check(Dictionary<string,object> report,string name)
    {foreach(var item in (IEnumerable)report["checks"]){var row=Dict(item);if(Str(row["name"])==name)return row;}throw new Exception("missing-check:"+name);}
    static Dictionary<string,object> Capture(string label,P.ApiRuntimePolicy policy=null,P.LauncherPolicy installed=null,P.SessionContext context=null,Assembly actual=null,bool missingActual=false,string expectedReason=null)
    {
        var result=P.CaptureAndWrite(missingActual?null:(actual??runtime),installed??Launcher(),policy??Reviewed(),context??Context());
        Assert(result.ReportWritten,label+":report-not-written:"+result.TerminalReason);
        Assert(!result.SourceAllowed&&!result.HandoffAllowed&&!result.AudioAllowed,label+":activation");
        Assert(result.ReportBytes>0&&result.ReportBytes<=P.MaximumReportBytes,label+":report-bound");
        Assert(Sha(result.ReportPath)==result.ReportSha256,label+":report-digest");
        var report=Dict(new JavaScriptSerializer().DeserializeObject(File.ReadAllText(result.ReportPath)));
        Assert((bool)report["fixtureOnly"],label+":fixture-label");
        Assert(!(bool)report["sourceAttachmentAllowed"]&&!(bool)report["sourceOpenAllowed"]&&!(bool)report["sourceBeginAllowed"]
            &&!(bool)report["gameplayPublicationAllowed"]&&!(bool)report["audioAllowed"],label+":report-activation");
        Assert(!(bool)report["firstSeenHashMayBePromoted"]&&(bool)report["reportDoesNotEstablishTrust"],label+":trust-boundary");
        Assert(!(bool)report["authenticodeNetworkOrRevocationPerformed"]&&!(bool)report["equalPrivilegeSecurityGuarantee"],label+":trust-overclaim");
        if(expectedReason!=null){Assert(!result.ProvenanceMatched,label+":unexpected-match");Assert(result.TerminalReason==expectedReason,label+":reason="+result.TerminalReason);}
        results.Add(new{test=label,passed=true,terminalReason=result.TerminalReason,reportSha256=result.ReportSha256,reportBytes=result.ReportBytes});return report;
    }
    static void FailedOutput(string label,P.SessionContext context,string reason)
    {var result=P.CaptureAndWrite(runtime,Launcher(),Reviewed(),context);Assert(!result.ReportWritten&&!result.ProvenanceMatched&&!result.SourceAllowed&&!result.HandoffAllowed&&!result.AudioAllowed,label+":failed-open");
        Assert(result.TerminalReason==reason,label+":reason="+result.TerminalReason);Assert(result.ReportPath==null&&result.ReportSha256==null&&result.ReportBytes==0,label+":fabricated-completion");
        results.Add(new{test=label,passed=true,terminalReason=result.TerminalReason,reportWritten=false});}
    static void Main(string[] args)
    {
        try{Run(args);}catch(Exception error){Console.Error.WriteLine(error);Environment.ExitCode=1;}
    }
    static void Run(string[] args)
    {
        if(args.Length!=1)throw new ArgumentException("one-owned-fixture-root-required");
        root=Path.GetFullPath(args[0]);launcherPath=Path.Combine(root,"LauncherFixture.dll");runtimePath=Path.Combine(root,"RuntimeA.dll");runtimeBPath=Path.Combine(root,"RuntimeB.dll");
        caller=typeof(ProvenanceUnitTests).Assembly;runtime=Assembly.LoadFile(runtimePath);evidence=Sha(Path.Combine(root,"RuntimeA.source.cs"));
        using(var process=Process.GetCurrentProcess()){pid=process.Id;executable=process.MainModule.FileName;long c,e,k,u;if(!GetProcessTimes(process.Handle,out c,out e,out k,out u))throw new Exception("process-times");creation=(ulong)c;}
        var positive=Capture("different-reviewed-runtime-and-launcher");Assert((bool)positive["provenanceMatched"],"positive-not-matched");
        Assert(Str(At(positive,"actualLauncher","sha256"))!=Str(At(positive,"actualApiRuntime","file","sha256")),"independent-artifacts-not-distinct");
        Assert(Str(At(positive,"actualApiRuntime","file","fileVersion"))==Str(At(positive,"actualLauncher","fileVersion")),"same-version-fixture-premise");
        Assert((bool)At(positive,"actualApiRuntime","loadedAndFileMetadataConsistent"),"metadata-inconsistent");
        Assert(!(bool)At(positive,"actualApiRuntime","file","authenticodeSignatureVerified"),"signature-overclaim");
        Assert(Str(At(positive,"historical09Comparison","sha256","outcome"))=="fail"&&Str(At(positive,"historical09Comparison","fileVersion","outcome"))=="pass","historical-independent-operands");
        Assert((bool)At(positive,"historical09Comparison","obsoleteExpectation")&&!(bool)At(positive,"historical09Comparison","authoritativeForCurrentPolicy")
            &&!(bool)At(positive,"historical09Comparison","trustGranted"),"historical-comparison-authority");

        var unreviewed=Capture("unreviewed-does-not-adopt-observation",P.ApiRuntimePolicy.Unreviewed("No authenticated runtime source"),expectedReason:"api-runtime-policy-unreviewed");
        foreach(string name in new[]{"path","sha256","bytes","fileVersion","assemblyFullName","moduleMvid"})Assert(At(unreviewed,"expectedApiRuntime",name)==null,"unreviewed-expected-filled:"+name);
        foreach(string name in new[]{"path","sha256","bytes","file-version","assembly-name","module-mvid"}){var row=Check(unreviewed,"api-runtime-"+name);Assert(Str(row["outcome"])=="unreviewed"&&row["expected"]==null,"missing-unreviewed-operand:"+name);Assert(row["actual"]!=null,"actual-operand-lost:"+name);}
        Assert(Str(At(unreviewed,"actualApiRuntime","file","sha256"))==Sha(runtimePath),"unreviewed-lost-actual-hash");
        Capture("right-version-wrong-runtime-bytes",Reviewed(sha:Sha(runtimeBPath)),expectedReason:"api-runtime-digest-mismatch");
        Capture("right-bytes-wrong-runtime-version",Reviewed(version:"1.132.0.0"),expectedReason:"api-runtime-version-mismatch");
        Capture("unexpected-runtime-cache-path",Reviewed(path:runtimeBPath),expectedReason:"api-runtime-path-mismatch");
        Capture("runtime-size-mismatch",Reviewed(size:new FileInfo(runtimePath).Length+1),expectedReason:"api-runtime-size-mismatch");
        Capture("runtime-assembly-name-mismatch",Reviewed(name:"Unreviewed, Version=1.0.0.0"),expectedReason:"api-runtime-assembly-name-mismatch");
        Capture("runtime-mvid-mismatch",Reviewed(mvid:Guid.NewGuid().ToString("D")),expectedReason:"api-runtime-module-mvid-mismatch");
        Capture("runtime-evidence-missing",Reviewed(refs:new string[0]),expectedReason:"api-runtime-policy-evidence-missing");
        Capture("runtime-evidence-invalid",Reviewed(refs:new[]{"not-a-digest"}),expectedReason:"api-runtime-policy-evidence-missing");
        Capture("runtime-evidence-count-bound",Reviewed(refs:new[]{evidence,evidence,evidence,evidence,evidence,evidence,evidence,evidence,evidence}),expectedReason:"api-runtime-policy-evidence-missing");
        Capture("launcher-wrong-hash",installed:Launcher(sha:new string('0',64)),expectedReason:"launcher-digest-mismatch");
        Capture("launcher-wrong-version",installed:Launcher(version:"1.0.0.0"),expectedReason:"launcher-version-mismatch");
        Capture("launcher-wrong-size",installed:Launcher(size:1),expectedReason:"launcher-size-mismatch");
        Capture("launcher-missing",installed:Launcher(path:Path.Combine(root,"missing.dll")),expectedReason:"launcher-unavailable-or-inconsistent");
        Capture("process-id-mismatch",context:Context(processId:pid+1),expectedReason:"process-id-mismatch");
        Capture("process-creation-mismatch",context:Context(created:creation+1),expectedReason:"process-creation-mismatch");
        Capture("process-path-mismatch",context:Context(processPath:Path.Combine(root,"other.exe")),expectedReason:"game-process-path-mismatch");
        Capture("session-context-mismatch",context:Context(expected:Guid.NewGuid().ToString("N")),expectedReason:"session-context-mismatch");
        Capture("caller-hash-mismatch",context:Context(callerSha:new string('0',64)),expectedReason:"caller-assembly-digest-mismatch");
        Capture("caller-is-not-reviewed-entry",context:Context(actualCaller:runtime),expectedReason:"caller-assembly-digest-mismatch");
        var missing=Capture("missing-actual-runtime",missingActual:true,expectedReason:"api-runtime-unavailable-or-inconsistent");
        Assert(At(missing,"actualApiRuntime","file","sha256")==null&&At(missing,"actualApiRuntime","file","fileStableDuringRead")==null,"missing-runtime-invented-file-values");
        var dynamicAssembly=AppDomain.CurrentDomain.DefineDynamicAssembly(new AssemblyName("ExplicitDynamicFixture"),AssemblyBuilderAccess.Run);
        Capture("dynamic-runtime-no-location",actual:dynamicAssembly,expectedReason:"api-runtime-unavailable-or-inconsistent");
        var lockedPolicy=Launcher();
        using(var locked=new FileStream(launcherPath,FileMode.Open,FileAccess.Write,FileShare.Read)){
            var denied=Capture("artifact-write-open-denied",installed:lockedPolicy,expectedReason:"launcher-unavailable-or-inconsistent");Assert(At(denied,"actualLauncher","sha256")==null,"locked-file-invented-hash");}

        string mutable=Path.Combine(root,"changed-launcher.dll");File.Copy(launcherPath,mutable);byte[] changed=File.ReadAllBytes(mutable);changed[changed.Length-1]^=0x01;File.WriteAllBytes(mutable,changed);
        Capture("changed-file-before-capture",installed:Launcher(path:mutable),expectedReason:"launcher-digest-mismatch");
        string hardlink=Path.Combine(root,"hardlink-launcher.dll");Assert(CreateHardLinkW(hardlink,launcherPath,IntPtr.Zero),"hardlink-fixture-unavailable");
        var linked=Capture("hardlink-retains-safe-values-but-rejects",expectedReason:"launcher-unavailable-or-inconsistent");
        Assert(Str(At(linked,"actualLauncher","sha256"))==Sha(launcherPath)&&Str(At(linked,"actualLauncher","fileVersion"))!=null,"hardlink-actual-values-lost");
        Assert((bool)At(linked,"actualLauncher","hardLinkRejected")&&(bool)At(linked,"actualLauncher","fileStableDuringRead"),"hardlink-state-wrong");File.Delete(hardlink);

        var observe=typeof(P).GetMethod("ObserveFile",BindingFlags.Static|BindingFlags.NonPublic);bool writeDenied=false,renameDenied=false,callback=false;
        object pinned=observe.Invoke(null,new object[]{launcherPath,(Action<string>)delegate(string path){callback=true;
            try{using(var f=new FileStream(path,FileMode.Open,FileAccess.Write,FileShare.Read)){} }catch(IOException){writeDenied=true;}
            try{File.Move(path,path+".renamed");}catch(IOException){renameDenied=true;}}});
        var pinnedType=pinned.GetType();Assert(callback&&writeDenied&&renameDenied,"pinned-observation-did-not-deny-write-and-replacement");
        Assert(pinnedType.GetField("Error",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(pinned)==null,"pinned-observation-failed");
        Assert((bool)pinnedType.GetField("Stable",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(pinned),"pinned-observation-not-stable");
        results.Add(new{test="single-file-pin-spans-metadata-write-and-replace-attempts",passed=true});

        string junction=Path.Combine(root,"junction");Assert(Directory.Exists(junction),"junction-fixture-missing");
        var reparse=Capture("reparse-ancestor-refused",installed:Launcher(path:Path.Combine(junction,"LauncherFixture.dll")),expectedReason:"launcher-unavailable-or-inconsistent");
        Assert(At(reparse,"actualLauncher","sha256")==null,"reparse-followed");
        string huge=Path.Combine(root,"oversized.dll");using(var f=new FileStream(huge,FileMode.CreateNew)){f.SetLength(P.MaximumArtifactBytes+1);}
        var oversized=Capture("artifact-size-rejected-before-hash",installed:Launcher(path:huge),expectedReason:"launcher-unavailable-or-inconsistent");
        Assert(Convert.ToInt64(At(oversized,"actualLauncher","bytes"))==P.MaximumArtifactBytes+1&&At(oversized,"actualLauncher","sha256")==null,"oversized-actual-or-bound");
        File.Delete(huge);

        var same=Context();var once=Capture("output-first-create",context:same);string original=Sha(Path.Combine(root,".local","playable-10","runtime-provenance",same.SessionId,"runtime-provenance.json"));
        FailedOutput("output-reuse-no-overwrite",same,"provenance-session-output-already-exists");
        Assert(original==Sha(Path.Combine(root,".local","playable-10","runtime-provenance",same.SessionId,"runtime-provenance.json")),"report-overwritten");
        FailedOutput("invalid-output-session",Context(session:"not-a-session"),"report-session-invalid");
        FailedOutput("missing-workspace",Context(workspace:Path.Combine(root,"absent-workspace")),"owned-workspace-required");
        FailedOutput("reparse-output-workspace",Context(workspace:junction),"reparse-or-nondirectory-ancestor");
        string obstructed=Path.Combine(root,"obstructed-workspace");Directory.CreateDirectory(obstructed);File.WriteAllText(Path.Combine(obstructed,".local"),"owned output blocker");
        var blocked=P.CaptureAndWrite(runtime,Launcher(),Reviewed(),Context(workspace:obstructed));Assert(!blocked.ReportWritten&&!blocked.SourceAllowed,"blocked-output-opened");
        results.Add(new{test="output-write-failure-is-fail-closed",passed=true,terminalReason=blocked.TerminalReason});

        Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=1048576}.Serialize(new{schema=1,profile="PLAYABLE-10",passed=true,cases=results.Count,assertions=assertions,casesPassed=results,
            fixtureOnly=true,actualRphRuntimeExecuted=false,actualRphApiUsed=false,gameLaunched=false,gameFilesWritten=false,sourceAttached=false,sourceOpened=false,sourceBegan=false,
            gameplayPublished=false,endpointOpened=false,audioPlayed=false,reviewedApiPositiveIsFixtureOnly=true,observedRuntimeAuthenticated=false}));
    }
}
