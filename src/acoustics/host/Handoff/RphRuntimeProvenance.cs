using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace RichAudio.Beacon.Provenance
{
    // Standalone diagnostic boundary. No RPH/game API, handoff source, transport,
    // renderer, menu, device or process-launch dependency is referenced here.
    internal static class RphRuntimeProvenance
    {
        internal const long MaximumArtifactBytes=64L*1024*1024;
        internal const int MaximumReportBytes=32768,MaximumStringCharacters=1024;
        internal sealed class LauncherPolicy
        {
            internal readonly string Path,Sha256,FileVersion;
            internal readonly long Bytes;
            internal LauncherPolicy(string exactPath,string sha256,long bytes,string fileVersion)
            {Path=exactPath;Sha256=sha256;Bytes=bytes;FileVersion=fileVersion;}
            internal object Data(){return new{path=Bound(Path),sha256=Bound(Sha256),bytes=Bytes,fileVersion=Bound(FileVersion)};}
        }
        internal sealed class ApiRuntimePolicy
        {
            internal readonly bool IsReviewed;
            internal readonly string Reason,Path,Sha256,FileVersion,AssemblyFullName,ModuleMvid;
            internal readonly long? Bytes;
            internal readonly string[] ReviewedEvidenceDigests;
            private ApiRuntimePolicy(bool reviewed,string reason,string path,string hash,long? bytes,string version,string name,string mvid,string[] evidence)
            {IsReviewed=reviewed;Reason=reason;Path=path;Sha256=hash;Bytes=bytes;FileVersion=version;AssemblyFullName=name;ModuleMvid=mvid;
             ReviewedEvidenceDigests=evidence==null?new string[0]:(string[])evidence.Clone();}
            internal static ApiRuntimePolicy Unreviewed(string reason)
            {return new ApiRuntimePolicy(false,reason,null,null,null,null,null,null,null);}
            internal static ApiRuntimePolicy Reviewed(string exactPath,string sha256,long bytes,string fileVersion,string assemblyFullName,
                string moduleMvid,string[] reviewedEvidenceDigests)
            {return new ApiRuntimePolicy(true,null,exactPath,sha256,bytes,fileVersion,assemblyFullName,moduleMvid,reviewedEvidenceDigests);}
            internal object Data(){return new{state=IsReviewed?"reviewed-expectation":"unreviewed",reason=Bound(Reason),path=Bound(Path),sha256=Bound(Sha256),
                bytes=Bytes,fileVersion=Bound(FileVersion),assemblyFullName=Bound(AssemblyFullName),moduleMvid=Bound(ModuleMvid),
                reviewedEvidenceDigests=EvidenceData(),reviewedEvidenceTotalCount=ReviewedEvidenceDigests.Length,observedReportMayCreateAcceptance=false};}
            string[] EvidenceData(){int count=Math.Min(8,ReviewedEvidenceDigests.Length);var values=new string[count];for(int i=0;i<count;i++)values[i]=Bound(ReviewedEvidenceDigests[i]);return values;}
        }
        internal sealed class SessionContext
        {
            internal readonly string WorkspaceRoot,SessionId,ExpectedSessionId,ExpectedGamePath,ExpectedCallerSha256;
            internal readonly int ExpectedProcessId;
            internal readonly ulong ExpectedProcessCreationFileTime;
            internal readonly Assembly ActualCaller;
            internal readonly bool FixtureOnly;
            internal SessionContext(string workspaceRoot,string sessionId,string expectedSessionId,int expectedPid,ulong expectedCreation,
                string expectedGamePath,Assembly actualCaller,string expectedCallerSha,bool fixtureOnly=false)
            {WorkspaceRoot=workspaceRoot;SessionId=sessionId;ExpectedSessionId=expectedSessionId;ExpectedProcessId=expectedPid;
             ExpectedProcessCreationFileTime=expectedCreation;ExpectedGamePath=expectedGamePath;ActualCaller=actualCaller;
             ExpectedCallerSha256=expectedCallerSha;FixtureOnly=fixtureOnly;}
        }
        internal sealed class CaptureOutcome
        {
            internal readonly string TerminalReason,ReportPath,ReportSha256;
            internal readonly bool ReportWritten,ProvenanceMatched;
            internal readonly int ReportBytes;
            internal bool SourceAllowed{get{return false;}}
            internal bool HandoffAllowed{get{return false;}}
            internal bool AudioAllowed{get{return false;}}
            internal CaptureOutcome(string reason,bool written,string path,string hash,int bytes,bool matched)
            {TerminalReason=reason;ReportWritten=written;ReportPath=path;ReportSha256=hash;ReportBytes=bytes;ProvenanceMatched=matched;}
        }
        sealed class Check
        {
            public string name,expected,actual,outcome,reason;
        }
        sealed class Artifact
        {
            internal string Path,Sha256,FileVersion,Error,SignatureAvailability;
            internal long? Bytes;
            internal bool? Stable,HardLinkRejected;
            internal uint? Links;
            internal ulong? FileId;
            internal uint? Volume;
            internal object Data(){return new{path=Path,sha256=Sha256,bytes=Bytes,fileVersion=FileVersion,error=Error,
                fileStableDuringRead=Stable,hardLinkRejected=HardLinkRejected,linkCount=Links,fileId=FileId,volumeSerial=Volume,
                signatureAvailability=SignatureAvailability,authenticodeSignatureVerified=false,certificateChainVerified=false,
                signatureTrustGranted=false,metadataOrFilenameIsNotAuthentication=true};}
        }
        sealed class AssemblyWitness
        {
            internal Artifact File=new Artifact();
            internal string FullName,ManifestModuleName,ModuleMvid,PublicKeyToken,Error,FileAssemblyName,FileModuleMvid;
            internal bool LoadedReference,Dynamic,MetadataComplete,FileMetadataMatches;
            internal object Data(){return new{file=File.Data(),assemblyFullName=FullName,manifestModuleName=ManifestModuleName,
                moduleMvid=ModuleMvid,strongNamePublicKeyToken=PublicKeyToken,strongNameCryptographicallyVerified=false,
                source="actual-Assembly-object-from-typed-entry",referencePresentInCurrentAppDomain=LoadedReference,isDynamic=Dynamic,
                metadataComplete=MetadataComplete,error=Error,fileAssemblyFullName=FileAssemblyName,fileModuleMvid=FileModuleMvid,
                loadedAndFileMetadataConsistent=FileMetadataMatches,metadataInspectionDoesNotExecuteAssemblyCode=true};}
        }
        [StructLayout(LayoutKind.Sequential)]struct FileTime{internal uint Low,High;internal ulong Value{get{return ((ulong)High<<32)|Low;}}}
        [StructLayout(LayoutKind.Sequential)]struct FileInfo
        {
            internal uint Attributes;internal FileTime Created,Accessed,Written;
            internal uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
            internal ulong Size{get{return ((ulong)SizeHigh<<32)|SizeLow;}}
            internal ulong Id{get{return ((ulong)IndexHigh<<32)|IndexLow;}}
        }
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle file,out FileInfo info);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandleW(SafeFileHandle file,StringBuilder path,uint chars,uint flags);
        [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);

        static void Need(bool condition,string reason){if(!condition)throw new InvalidDataException(reason);}
        static string Bound(string value){return value==null?null:value.Substring(0,Math.Min(MaximumStringCharacters,value.Length));}
        static bool Complete(string value){return value!=null&&value.Length<=MaximumStringCharacters;}
        static bool Digest(string value){if(value==null||value.Length!=64)return false;foreach(char c in value)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))return false;return true;}
        static bool Session(string value){if(value==null||value.Length!=32)return false;foreach(char c in value)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))return false;return true;}
        static bool Equal(string a,string b){return String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
        static string Canonical(string path){Need(Complete(path)&&Path.IsPathRooted(path)&&!path.StartsWith("\\\\",StringComparison.Ordinal),"local-absolute-path-required");return Path.GetFullPath(path);}
        static string Hash(Stream stream){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
        static string HandlePath(SafeFileHandle file)
        {
            var text=new StringBuilder(MaximumStringCharacters+1);uint n=GetFinalPathNameByHandleW(file,text,(uint)text.Capacity,0);
            Need(n>0&&n<text.Capacity,"final-file-path-unavailable");string value=text.ToString();
            if(value.StartsWith("\\\\?\\",StringComparison.Ordinal))value=value.Substring(4);return Canonical(value);
        }
        static FileInfo Info(SafeFileHandle file){FileInfo info;Need(GetFileInformationByHandle(file,out info),"file-identity-unavailable");return info;}
        static SafeFileHandle PinDirectory(string path)
        {
            var file=CreateFileW(path,0x80,1,IntPtr.Zero,3,0x02000000|0x00200000,IntPtr.Zero);
            if(file.IsInvalid){file.Dispose();throw new IOException("directory-pin-failed");}
            try{var info=Info(file);Need((info.Attributes&0x400)==0&&(info.Attributes&0x10)!=0,"reparse-or-nondirectory-ancestor");
                Need(Equal(HandlePath(file),Canonical(path)),"directory-final-path-changed");return file;}catch{file.Dispose();throw;}
        }
        static void PinAncestors(string parent,List<SafeFileHandle> holds)
        {
            var paths=new Stack<string>();for(string at=Canonical(parent);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){
                paths.Push(at);if(Path.GetDirectoryName(at)==at)break;}
            while(paths.Count>0)holds.Add(PinDirectory(paths.Pop()));
        }
        static bool SameFile(FileInfo a,FileInfo b){return a.Volume==b.Volume&&a.Id==b.Id&&a.Size==b.Size&&a.Written.Value==b.Written.Value&&a.Links==b.Links&&a.Attributes==b.Attributes;}
        static string SignatureAvailability(FileStream file)
        {
            // PE certificate-table presence only. No WinVerifyTrust, certificate
            // validation, revocation/network access or trust decision occurs.
            if(file.Length<64)return "not-a-recognized-pe-file";
            using(var reader=new BinaryReader(file,Encoding.UTF8,true)){
                file.Position=0;if(reader.ReadUInt16()!=0x5A4D)return "not-a-recognized-pe-file";
                file.Position=0x3c;int nt=reader.ReadInt32();Need(nt>=64&&nt<=1048576&&(long)nt+24<file.Length,"pe-header-bound");
                file.Position=nt;if(reader.ReadUInt32()!=0x4550)return "not-a-recognized-pe-file";
                file.Position=nt+20;ushort optionalBytes=reader.ReadUInt16();long optional=nt+24;
                file.Position=optional;ushort kind=reader.ReadUInt16();int directories=kind==0x20b?112:kind==0x10b?96:0;
                if(directories==0)return "not-a-recognized-pe-file";
                Need(optionalBytes>=directories+40&&optional+optionalBytes<=file.Length,"pe-directory-bound");
                file.Position=optional+directories+32;uint offset=reader.ReadUInt32(),bytes=reader.ReadUInt32();
                if(offset==0&&bytes==0)return "pe-certificate-table-absent";
                Need(offset>0&&bytes>=8&&(ulong)offset+bytes<=(ulong)file.Length,"pe-certificate-table-inconsistent");
                return "pe-certificate-table-present-not-verified";
            }
        }
        static Artifact ObserveFile(string path,Action<string> inspectPinnedMetadata=null)
        {
            var value=new Artifact{Path=Bound(path)};var holds=new List<SafeFileHandle>();
            try{
                string full=Canonical(path);value.Path=full;PinAncestors(Path.GetDirectoryName(full),holds);
                var handle=CreateFileW(full,0x80000000,1,IntPtr.Zero,3,0x00200000,IntPtr.Zero);
                if(handle.IsInvalid){handle.Dispose();throw new IOException("artifact-open-denied-or-missing");}
                using(handle){
                    var before=Info(handle);value.Links=before.Links;value.FileId=before.Id;value.Volume=before.Volume;
                    Need((before.Attributes&0x400)==0&&(before.Attributes&0x10)==0,"artifact-reparse-or-directory");
                    value.HardLinkRejected=before.Links!=1;
                    value.Bytes=before.Size<=Int64.MaxValue?(long?)before.Size:null;
                    Need(before.Size>0&&before.Size<=(ulong)MaximumArtifactBytes,"artifact-size-bound");
                    Need(Equal(HandlePath(handle),full),"artifact-final-path-changed");
                    using(var stream=new FileStream(handle,FileAccess.Read)){
                        value.Sha256=Hash(stream);value.SignatureAvailability=SignatureAvailability(stream);
                        string version=FileVersionInfo.GetVersionInfo(full).FileVersion;value.FileVersion=Bound(version);
                        Need(Complete(version),"file-version-unavailable-or-over-bound");
                        if(inspectPinnedMetadata!=null)inspectPinnedMetadata(full);
                        var after=Info(handle);value.Stable=SameFile(before,after);Need(value.Stable==true,"artifact-changed-during-capture");
                        Need(value.HardLinkRejected==false,"artifact-hardlink-not-reviewed");
                    }
                }
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){value.Error=Bound(error is InvalidDataException?error.Message:"file-observation-failed:"+error.GetType().Name);}
            finally{foreach(var hold in holds)hold.Dispose();}
            return value;
        }
        static AssemblyWitness ObserveAssembly(Assembly actual)
        {
            var value=new AssemblyWitness();
            try{
                Need(actual!=null,"actual-assembly-missing");
                foreach(var loaded in AppDomain.CurrentDomain.GetAssemblies())if(Object.ReferenceEquals(loaded,actual))value.LoadedReference=true;
                value.Dynamic=actual.IsDynamic;string name=actual.FullName;value.FullName=Bound(name);
                Need(Complete(name),"assembly-name-over-bound-or-unavailable");Need(value.LoadedReference&&!value.Dynamic,"assembly-not-loaded-or-dynamic");
                var module=actual.ManifestModule;string moduleName=module.ScopeName;value.ManifestModuleName=Bound(moduleName);
                value.ModuleMvid=module.ModuleVersionId.ToString("D");Need(Complete(moduleName),"module-name-over-bound");
                byte[] token=actual.GetName().GetPublicKeyToken();value.PublicKeyToken=token==null?null:BitConverter.ToString(token).Replace("-","").ToLowerInvariant();
                string location=actual.Location;Need(Complete(location)&&!String.IsNullOrEmpty(location),"assembly-location-unavailable");
                value.File=ObserveFile(location,delegate(string pinnedPath){
                    var metadata=Assembly.ReflectionOnlyLoadFrom(pinnedPath);
                    Need(Equal(Canonical(metadata.Location),pinnedPath),"reflection-metadata-path-alias");
                    value.FileAssemblyName=Bound(metadata.FullName);value.FileModuleMvid=metadata.ManifestModule.ModuleVersionId.ToString("D");
                    value.FileMetadataMatches=value.FullName==value.FileAssemblyName&&value.ModuleMvid==value.FileModuleMvid;
                    Need(value.FileMetadataMatches,"loaded-file-metadata-inconsistent");
                    value.MetadataComplete=true;
                });
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){value.Error=Bound(error is InvalidDataException?error.Message:"assembly-observation-failed:"+error.GetType().Name);}
            return value;
        }
        static void Compare(List<Check> checks,string name,object expected,object actual,bool pass,string why)
        {checks.Add(new Check{name=name,expected=Bound(expected==null?null:Convert.ToString(expected,CultureInfo.InvariantCulture)),
            actual=Bound(actual==null?null:Convert.ToString(actual,CultureInfo.InvariantCulture)),outcome=pass?"pass":"fail",reason=pass?null:why});}
        static void CompareFile(List<Check> checks,string role,LauncherPolicy expected,Artifact actual)
        {
            Compare(checks,role+"-capture",true,actual.Error??"complete",actual.Error==null&&actual.Stable==true,role+"-unavailable-or-inconsistent");
            Compare(checks,role+"-path",expected.Path,actual.Path,expected.Path!=null&&actual.Path!=null&&Equal(expected.Path,actual.Path),role+"-path-mismatch");
            Compare(checks,role+"-sha256",expected.Sha256,actual.Sha256,Digest(expected.Sha256)&&expected.Sha256==actual.Sha256,role+"-digest-mismatch");
            Compare(checks,role+"-bytes",expected.Bytes,actual.Bytes,expected.Bytes>0&&actual.Bytes==expected.Bytes,role+"-size-mismatch");
            Compare(checks,role+"-file-version",expected.FileVersion,actual.FileVersion,Complete(expected.FileVersion)&&expected.FileVersion==actual.FileVersion,role+"-version-mismatch");
        }
        static object Historical09Comparison(LauncherPolicy obsolete,AssemblyWitness actual)
        {
            bool shaObserved=obsolete.Sha256!=null&&actual.File.Sha256!=null;
            bool versionObserved=obsolete.FileVersion!=null&&actual.File.FileVersion!=null;
            bool shaEqual=shaObserved&&obsolete.Sha256==actual.File.Sha256;
            bool versionEqual=versionObserved&&obsolete.FileVersion==actual.File.FileVersion;
            return new{obsoleteExpectation=true,authoritativeForCurrentPolicy=false,trustGranted=false,
                purpose="diagnostic-reconstruction-of-the-obsolete-launcher-as-api-runtime-comparison-only",
                sha256=new{expectedInstalledLauncherSha256=Bound(obsolete.Sha256),actualApiSha256=actual.File.Sha256,
                    outcome=!shaObserved?"unobserved":shaEqual?"pass":"fail"},
                fileVersion=new{expectedInstalledLauncherFileVersion=Bound(obsolete.FileVersion),actualApiFileVersion=actual.File.FileVersion,
                    outcome=!versionObserved?"unobserved":versionEqual?"pass":"fail"},
                combinedOldEqualityResult=shaObserved&&versionObserved?(bool?)(shaEqual&&versionEqual):null};
        }
        static string WriteReport(SessionContext context,byte[] bytes)
        {
            Need(context!=null&&Session(context.SessionId),"report-session-invalid");Need(bytes.Length>0&&bytes.Length<=MaximumReportBytes,"provenance-report-byte-bound");
            string workspace=Canonical(context.WorkspaceRoot);Need(Directory.Exists(workspace)&&workspace!=Path.GetPathRoot(workspace),"owned-workspace-required");
            var holds=new List<SafeFileHandle>();string root=workspace;
            try{
                PinAncestors(workspace,holds);
                string[] children={".local","playable-10","runtime-provenance",context.SessionId};
                for(int i=0;i<children.Length;i++){
                    root=Path.Combine(root,children[i]);
                    if(i==children.Length-1)Need(!File.Exists(root)&&!Directory.Exists(root),"provenance-session-output-already-exists");
                    if(!Directory.Exists(root))Directory.CreateDirectory(root);holds.Add(PinDirectory(root));
                }
                string pending=Path.Combine(root,"runtime-provenance.pending"),final=Path.Combine(root,"runtime-provenance.json");
                using(var output=new FileStream(pending,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){output.Write(bytes,0,bytes.Length);output.Flush(true);}
                File.Move(pending,final);
                using(var read=new FileStream(final,FileMode.Open,FileAccess.Read,FileShare.Read)){
                    Need(read.Length==bytes.Length,"provenance-report-length-changed");string actual=Hash(read);
                    using(var data=new MemoryStream(bytes))Need(actual==Hash(data),"provenance-report-bytes-changed");
                }
                return final;
            }finally{foreach(var hold in holds)hold.Dispose();}
        }
        internal static CaptureOutcome CaptureAndWrite(Assembly actualApiAssembly,LauncherPolicy launcher,ApiRuntimePolicy runtime,SessionContext context)
        {
            var checks=new List<Check>();string terminal=null;bool matched=false;
            try{
                Need(launcher!=null&&runtime!=null&&context!=null,"provenance-policy-or-context-missing");
                long before=Stopwatch.GetTimestamp();int actualPid=0;ulong actualCreation=0;string actualGamePath=null,processError=null;
                try{using(var process=Process.GetCurrentProcess()){
                    actualPid=process.Id;actualGamePath=Bound(process.MainModule.FileName);long creation,exit,kernel,user;
                    Need(GetProcessTimes(process.Handle,out creation,out exit,out kernel,out user)&&creation>0,"process-creation-unavailable");actualCreation=(ulong)creation;
                }}catch(System.Threading.ThreadAbortException){throw;}catch(Exception error){processError=Bound(error.GetType().Name);}
                Compare(checks,"session-shape",true,Session(context.SessionId),Session(context.SessionId),"session-shape-invalid");
                Compare(checks,"session-context",context.ExpectedSessionId,context.SessionId,Session(context.ExpectedSessionId)&&context.SessionId==context.ExpectedSessionId,"session-context-mismatch");
                Compare(checks,"process-observation",true,processError??"complete",processError==null,"process-observation-unavailable");
                Compare(checks,"process-id",context.ExpectedProcessId,actualPid==0?(int?)null:actualPid,actualPid>0&&actualPid==context.ExpectedProcessId,"process-id-mismatch");
                Compare(checks,"process-creation",context.ExpectedProcessCreationFileTime,actualCreation==0?(ulong?)null:actualCreation,actualCreation>0&&actualCreation==context.ExpectedProcessCreationFileTime,"process-creation-mismatch");
                Compare(checks,"game-process-path",context.ExpectedGamePath,actualGamePath,actualGamePath!=null&&Equal(context.ExpectedGamePath,actualGamePath),"game-process-path-mismatch");
                var actualLauncher=ObserveFile(launcher.Path);var caller=ObserveAssembly(context.ActualCaller);var api=ObserveAssembly(actualApiAssembly);
                CompareFile(checks,"launcher",launcher,actualLauncher);
                Compare(checks,"caller-assembly-capture",true,caller.Error??caller.File.Error??"complete",caller.Error==null&&caller.File.Error==null&&caller.FileMetadataMatches,"caller-assembly-unavailable-or-inconsistent");
                Compare(checks,"caller-sha256",context.ExpectedCallerSha256,caller.File.Sha256,Digest(context.ExpectedCallerSha256)&&context.ExpectedCallerSha256==caller.File.Sha256,"caller-assembly-digest-mismatch");
                Compare(checks,"api-assembly-capture",true,api.Error??api.File.Error??"complete",api.Error==null&&api.File.Error==null&&api.FileMetadataMatches,"api-runtime-unavailable-or-inconsistent");
                if(!runtime.IsReviewed){
                    checks.Add(new Check{name="api-runtime-reviewed-policy",expected=null,actual=api.File.Sha256,outcome="unreviewed",reason="api-runtime-policy-unreviewed"});
                    string[] names={"path","sha256","bytes","file-version","assembly-name","module-mvid"};
                    object[] actuals={api.File.Path,api.File.Sha256,api.File.Bytes,api.File.FileVersion,api.FullName,api.ModuleMvid};
                    for(int i=0;i<names.Length;i++)checks.Add(new Check{name="api-runtime-"+names[i],expected=null,
                        actual=Bound(actuals[i]==null?null:Convert.ToString(actuals[i],CultureInfo.InvariantCulture)),outcome="unreviewed",reason="api-runtime-operand-unreviewed"});
                }
                else{
                    bool evidence=runtime.ReviewedEvidenceDigests.Length>0&&runtime.ReviewedEvidenceDigests.Length<=8;
                    for(int i=0;i<Math.Min(runtime.ReviewedEvidenceDigests.Length,8);i++)evidence&=Digest(runtime.ReviewedEvidenceDigests[i]);
                    Compare(checks,"api-runtime-source-evidence",true,evidence,evidence,"api-runtime-policy-evidence-missing");
                    CompareFile(checks,"api-runtime",new LauncherPolicy(runtime.Path,runtime.Sha256,runtime.Bytes??0,runtime.FileVersion),api.File);
                    Compare(checks,"api-runtime-assembly-name",runtime.AssemblyFullName,api.FullName,Complete(runtime.AssemblyFullName)&&runtime.AssemblyFullName==api.FullName,"api-runtime-assembly-name-mismatch");
                    Guid parsed;Compare(checks,"api-runtime-module-mvid",runtime.ModuleMvid,api.ModuleMvid,Guid.TryParse(runtime.ModuleMvid,out parsed)&&parsed!=Guid.Empty
                        &&Equal(runtime.ModuleMvid,api.ModuleMvid),"api-runtime-module-mvid-mismatch");
                }
                foreach(var check in checks)if(check.outcome!="pass"){terminal=check.reason;break;}
                matched=terminal==null;terminal=terminal??"diagnostic-only-provenance-matched-no-activation";
                var report=new{schema=1,profile="PLAYABLE-10",purpose="private-pre-gate-runtime-provenance",fixtureOnly=context.FixtureOnly,
                    session=context.SessionId,expectedSession=context.ExpectedSessionId,contextSource="reviewed-coordinator-lease-context-not-independent-session-authentication",
                    expectedProcessId=context.ExpectedProcessId,actualProcessId=actualPid==0?(int?)null:actualPid,expectedProcessCreationFileTime=context.ExpectedProcessCreationFileTime.ToString(CultureInfo.InvariantCulture),
                    actualProcessCreationFileTime=actualCreation==0?null:actualCreation.ToString(CultureInfo.InvariantCulture),expectedGamePath=Bound(context.ExpectedGamePath),actualGamePath=actualGamePath,
                    captureBeforeQpc=before,captureAfterQpc=Stopwatch.GetTimestamp(),qpcFrequency=Stopwatch.Frequency,
                    expectedLauncher=launcher.Data(),expectedApiRuntime=runtime.Data(),actualLauncher=actualLauncher.Data(),actualCaller=caller.Data(),actualApiRuntime=api.Data(),
                    historical09Comparison=Historical09Comparison(launcher,api),
                    checks=checks,terminalReason=terminal,provenanceMatched=matched,reportDoesNotEstablishTrust=true,firstSeenHashMayBePromoted=false,
                    sourceAttachmentAllowed=false,sourceOpenAllowed=false,sourceBeginAllowed=false,gameplayPublicationAllowed=false,audioAllowed=false,
                    authenticodeNetworkOrRevocationPerformed=false,equalPrivilegeSecurityGuarantee=false,
                    outputCompletionMustBeObservedByCaller=true,osCallsAndFlushMayBlock=true,fatalProcessOrFiberAbortCanLeaveOutcomeUnobserved=true};
                var json=new JavaScriptSerializer{MaxJsonLength=MaximumReportBytes,RecursionLimit=12};byte[] bytes=new UTF8Encoding(false).GetBytes(json.Serialize(report));
                string path=WriteReport(context,bytes);string digest;using(var stream=new MemoryStream(bytes))digest=Hash(stream);
                return new CaptureOutcome(terminal,true,path,digest,bytes.Length,matched);
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){return new CaptureOutcome(error is InvalidDataException?error.Message:"provenance-capture-or-output-failed:"+error.GetType().Name,
                false,null,null,0,false);}
        }
    }
}
