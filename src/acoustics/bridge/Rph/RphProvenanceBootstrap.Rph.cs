#if SHV_PROVENANCE_10
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Xml;

namespace RichAudio.Beacon.Provenance
{
    // Lease parsing binds the reviewed diagnostic purpose and compiled scope.
    // It is not a signature of human approval or a sandbox against equal-user
    // code. Actual process/caller and launcher/runtime comparisons are retained
    // by CaptureAndWrite before its rejection decision.
    internal static class RphProvenanceBootstrap
    {
        const int MaximumBytes=8192;
        static readonly HashSet<string> Fields=new HashSet<string>(new[]{"schema","profile","purpose","sessionId","gameProcessId","gameProcessCreationFileTime",
            "callerAssemblySha256","gamePath","gameSha256","gameVersion","launcherPath","launcherSha256","launcherVersion",
            "shvPath","shvSha256","loaderPath","loaderSha256","preservedProducerSha256","diagnosticOnly","sourceAttachmentAllowed",
            "audioPlaybackAllowed","asiDeploymentAllowed","runtimeExpectationState"},StringComparer.Ordinal);
        internal sealed class Configuration
        {
            internal readonly string SessionId,CallerSha256;
            internal readonly int ProcessId;internal readonly ulong CreationFileTime;
            internal Configuration(string session,int pid,ulong creation,string caller)
            {SessionId=session;ProcessId=pid;CreationFileTime=creation;CallerSha256=caller;}
        }
        static void Need(bool value,string why){if(!value)throw new InvalidDataException(why);}
        static void Unlinked(string path)
        {
            for(string at=Path.GetFullPath(path);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){
                if(File.Exists(at)||Directory.Exists(at))Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"linked-bootstrap-path");
                if(Path.GetDirectoryName(at)==at)break;
            }
        }
        static IDictionary<string,object> Parse(byte[] bytes)
        {
            new UTF8Encoding(false,true).GetString(bytes);var names=new HashSet<string>(StringComparer.Ordinal);
            var q=new XmlDictionaryReaderQuotas{MaxDepth=3,MaxArrayLength=1,MaxBytesPerRead=MaximumBytes,MaxNameTableCharCount=4096,MaxStringContentLength=1024};
            using(var reader=JsonReaderWriterFactory.CreateJsonReader(bytes,0,bytes.Length,new UTF8Encoding(false,true),q,null)){
                while(reader.Read())if(reader.NodeType==XmlNodeType.Element){
                    Need(reader.Depth<=1,"nested-bootstrap-field");
                    if(reader.Depth==0){Need(reader.GetAttribute("type")=="object","bootstrap-object-required");continue;}
                    string name=reader.LocalName;Need(Fields.Contains(name)&&names.Add(name),"unknown-or-duplicate-bootstrap-field");
                    string type=name=="schema"||name=="gameProcessId"?"number":name=="diagnosticOnly"||name=="sourceAttachmentAllowed"||name=="audioPlaybackAllowed"||name=="asiDeploymentAllowed"?"boolean":"string";
                    Need(reader.GetAttribute("type")==type,"bootstrap-field-type");
                }
            }
            Need(names.Count==Fields.Count,"missing-bootstrap-field");
            var result=new JavaScriptSerializer{MaxJsonLength=MaximumBytes,RecursionLimit=3}.DeserializeObject(new UTF8Encoding(false,true).GetString(bytes)) as IDictionary<string,object>;
            Need(result!=null&&result.Count==Fields.Count,"bootstrap-object-required");return result;
        }
        static string Text(IDictionary<string,object> data,string key){string value=data[key] as string;Need(value!=null&&value.Length<=1024,"bootstrap-string-bound");return value;}
        static void Exact(IDictionary<string,object> d,string key,string expected){Need(Text(d,key)==expected,"bootstrap-policy-mismatch:"+key);}
        static void Flag(IDictionary<string,object> d,string key,bool expected){Need(d[key] is bool&&(bool)d[key]==expected,"bootstrap-purpose-mismatch:"+key);}
        internal static bool TryLoad(out Configuration config,out string reason)
        {
            config=null;reason="diagnostic-lease-absent";
            try{
                string path=RphProvenanceBuildPolicy.LeasePath;Unlinked(path);if(!File.Exists(path))return false;
                byte[] bytes;using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){
                    Need(f.Length>0&&f.Length<=MaximumBytes,"bootstrap-byte-bound");bytes=new byte[(int)f.Length];
                    int at=0;while(at<bytes.Length){int n=f.Read(bytes,at,bytes.Length-at);Need(n>0,"bootstrap-short-read");at+=n;}
                }
                var d=Parse(bytes);Need(d["schema"] is int&&(int)d["schema"]==1,"bootstrap-schema");
                Exact(d,"profile","PLAYABLE-10");Exact(d,"purpose","rph-runtime-provenance-only");
                string session=Text(d,"sessionId"),caller=Text(d,"callerAssemblySha256"),made=Text(d,"gameProcessCreationFileTime");ulong creation=0;
                Need(Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z"),"bootstrap-session-format");Need(Regex.IsMatch(caller,"\\A[a-f0-9]{64}\\z"),"bootstrap-caller-format");
                Need(d["gameProcessId"] is int&&(int)d["gameProcessId"]>0,"bootstrap-process-format");
                Need(Regex.IsMatch(made,"\\A[1-9][0-9]{0,19}\\z")&&UInt64.TryParse(made,out creation),"bootstrap-process-creation-format");
                Exact(d,"gamePath",RphProvenanceBuildPolicy.GamePath);Exact(d,"gameSha256",RphProvenanceBuildPolicy.GameSha256);Exact(d,"gameVersion",RphProvenanceBuildPolicy.GameVersion);
                Exact(d,"launcherPath",RphProvenanceBuildPolicy.LauncherPath);Exact(d,"launcherSha256",RphProvenanceBuildPolicy.LauncherSha256);Exact(d,"launcherVersion",RphProvenanceBuildPolicy.LauncherVersion);
                Exact(d,"shvPath",RphProvenanceBuildPolicy.ShvPath);Exact(d,"shvSha256",RphProvenanceBuildPolicy.ShvSha256);
                Exact(d,"loaderPath",RphProvenanceBuildPolicy.LoaderPath);Exact(d,"loaderSha256",RphProvenanceBuildPolicy.LoaderSha256);
                Exact(d,"preservedProducerSha256",RphProvenanceBuildPolicy.PreservedProducerSha256);Exact(d,"runtimeExpectationState","UNREVIEWED");
                Flag(d,"diagnosticOnly",true);Flag(d,"sourceAttachmentAllowed",false);Flag(d,"audioPlaybackAllowed",false);Flag(d,"asiDeploymentAllowed",false);
                config=new Configuration(session,(int)d["gameProcessId"],creation,caller);reason="diagnostic-lease-parsed";return true;
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception e){reason=e is InvalidDataException?e.Message:"diagnostic-bootstrap-failed:"+e.GetType().Name;return false;}
        }
        // Preserve the original game/SHV/loader scope before any measurement.
        // Launcher and API witnesses are deliberately left to the reporter, so
        // mismatching operands survive the launcher/runtime gate itself.
        internal static void VerifyInstalledScope()
        {
            Verify(RphProvenanceBuildPolicy.GamePath,RphProvenanceBuildPolicy.GameSha256,RphProvenanceBuildPolicy.GameBytes,RphProvenanceBuildPolicy.GameVersion);
            Verify(RphProvenanceBuildPolicy.ShvPath,RphProvenanceBuildPolicy.ShvSha256,-1,null);
            Verify(RphProvenanceBuildPolicy.LoaderPath,RphProvenanceBuildPolicy.LoaderSha256,-1,null);
        }
        static void Verify(string path,string expected,long bytes,string version)
        {
            Unlinked(path);using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))using(var sha=SHA256.Create()){
                string actual=BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();
                Need(actual==expected&&(bytes<0||f.Length==bytes),"diagnostic-installed-scope-mismatch");
                if(version!=null)Need(FileVersionInfo.GetVersionInfo(path).FileVersion==version,"diagnostic-game-version-mismatch");
            }
        }
    }
}
#endif
