#if SHV_HANDOFF_09
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Xml;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    internal static class ShvHandoffBootstrap
    {
        const int MaximumLeaseBytes=16384;
        static readonly HashSet<string> Fields=new HashSet<string>(new[]{"schema","profile","sessionId","gameProcessId","gameProcessCreationFileTime",
            "gamePath","gameSha256","gameVersion","shvPath","shvSha256","loaderPath","loaderSha256","rphPath","rphSha256","rphVersion",
            "producerPath","producerSha256","callerAssemblySha256","passiveOnly","audioPlaybackAllowed","fixtureOnly","identityMode","counterWrapAddressAbaExcluded"},StringComparer.Ordinal);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
        internal sealed class Configuration
        {
            internal readonly string SessionId,EvidenceRoot,CallerAssemblySha256;
            internal readonly H.Scope Scope;
            internal Configuration(string session,string caller)
            {
                SessionId=session;CallerAssemblySha256=caller;
                EvidenceRoot=Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,".local","playable-09","live-session",session);
                Scope=new H.Scope(ShvHandoffBuildPolicy.GameVersion,ShvHandoffBuildPolicy.GameSha256,ShvHandoffBuildPolicy.ShvSha256,
                    ShvHandoffBuildPolicy.LoaderSha256,ShvHandoffBuildPolicy.ProducerSha256,H.BatiModel,
                    ShvHandoffBuildPolicy.RphVersion,ShvHandoffBuildPolicy.RphSha256);
            }
            internal ShvModuleReview CreateReview(string callerAssemblySha)
            {
                Need(callerAssemblySha==CallerAssemblySha256,"caller-assembly-lease-mismatch");
                return new ShvModuleReview(Scope,ShvHandoffBuildPolicy.GamePath,ShvHandoffBuildPolicy.ShvPath,
                    ShvHandoffBuildPolicy.LoaderPath,ShvHandoffBuildPolicy.ProducerPath,ShvHandoffBuildPolicy.RphPath,callerAssemblySha,false);
            }
        }
        static void Need(bool value,string reason){if(!value)throw new InvalidDataException(reason);}
        internal static void CheckUnlinked(string path)
        {
            for(string at=Path.GetFullPath(path);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){
                if(File.Exists(at)||Directory.Exists(at))Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"linked-session-path");
                if(Path.GetDirectoryName(at)==at)break;
            }
        }
        internal static string HashAssembly(Assembly caller)
        {
            Need(caller!=null&&!caller.IsDynamic&&!String.IsNullOrEmpty(caller.Location),"actual-caller-assembly-required");
            CheckUnlinked(caller.Location);
            using(var file=new FileStream(caller.Location,FileMode.Open,FileAccess.Read,FileShare.Read))using(var sha=SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();
        }
        static IDictionary<string,object> Parse(byte[] bytes)
        {
            new UTF8Encoding(false,true).GetString(bytes);var names=new HashSet<string>(StringComparer.Ordinal);
            var quotas=new XmlDictionaryReaderQuotas{MaxDepth=3,MaxArrayLength=1,MaxBytesPerRead=MaximumLeaseBytes,MaxNameTableCharCount=4096,MaxStringContentLength=1024};
            using(var reader=JsonReaderWriterFactory.CreateJsonReader(bytes,0,bytes.Length,new UTF8Encoding(false,true),quotas,null)){
                while(reader.Read())if(reader.NodeType==XmlNodeType.Element){
                    Need(reader.Depth<=1,"nested-session-field");
                    if(reader.Depth==0){Need(reader.GetAttribute("type")=="object","session-object-required");continue;}
                    string name=reader.LocalName;Need(Fields.Contains(name)&&names.Add(name),"unknown-or-duplicate-session-field");
                    string expected=name=="schema"||name=="gameProcessId"?"number":name=="passiveOnly"||name=="audioPlaybackAllowed"||name=="fixtureOnly"||name=="counterWrapAddressAbaExcluded"?"boolean":"string";
                    Need(reader.GetAttribute("type")==expected,"session-field-type");
                }
            }
            Need(names.Count==Fields.Count,"missing-session-field");
            var result=new JavaScriptSerializer{MaxJsonLength=MaximumLeaseBytes,RecursionLimit=3}.DeserializeObject(new UTF8Encoding(false,true).GetString(bytes)) as IDictionary<string,object>;
            Need(result!=null&&result.Count==Fields.Count,"session-object-required");return result;
        }
        static string Text(IDictionary<string,object> data,string key){var value=data[key] as string;Need(value!=null&&value.Length<=1024,"session-string-bound");return value;}
        static void Exact(IDictionary<string,object> data,string key,string expected){Need(Text(data,key)==expected,"session-compiled-policy-mismatch:"+key);}
        static void Flag(IDictionary<string,object> data,string key,bool expected){Need(data[key] is bool&&(bool)data[key]==expected,"session-passive-policy-mismatch");}
        internal static bool TryLoad(out Configuration config,out string reason)
        {
            config=null;reason="reviewed-session-absent";
            try{
                string path=ShvHandoffBuildPolicy.LeasePath;CheckUnlinked(path);
                if(!File.Exists(path))return false;
                byte[] bytes;
                using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){
                    Need(file.Length>0&&file.Length<=MaximumLeaseBytes,"session-byte-budget");bytes=new byte[(int)file.Length];
                    int at=0;while(at<bytes.Length){int got=file.Read(bytes,at,bytes.Length-at);Need(got>0,"session-short-read");at+=got;}
                }
                var data=Parse(bytes);Need(data["schema"] is int&&(int)data["schema"]==1,"session-schema");Exact(data,"profile","PLAYABLE-09");
                string session=Text(data,"sessionId");Need(Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z"),"session-id");
                Need(data["gameProcessId"] is int&&(int)data["gameProcessId"]>0,"session-process-id");
                string made=Text(data,"gameProcessCreationFileTime");ulong creation=0;
                Need(Regex.IsMatch(made,"\\A[1-9][0-9]{0,19}\\z")&&UInt64.TryParse(made,out creation),"session-process-creation");
                using(var process=Process.GetCurrentProcess()){
                    long actual,exit,kernel,user;Need(process.Id==(int)data["gameProcessId"]&&process.MainModule.FileName==ShvHandoffBuildPolicy.GamePath,"session-current-process");
                    Need(GetProcessTimes(process.Handle,out actual,out exit,out kernel,out user)&&actual>0&&(ulong)actual==creation,"session-process-instance");
                }
                Exact(data,"gamePath",ShvHandoffBuildPolicy.GamePath);Exact(data,"gameSha256",ShvHandoffBuildPolicy.GameSha256);Exact(data,"gameVersion",ShvHandoffBuildPolicy.GameVersion);
                Exact(data,"shvPath",ShvHandoffBuildPolicy.ShvPath);Exact(data,"shvSha256",ShvHandoffBuildPolicy.ShvSha256);
                Exact(data,"loaderPath",ShvHandoffBuildPolicy.LoaderPath);Exact(data,"loaderSha256",ShvHandoffBuildPolicy.LoaderSha256);
                Exact(data,"rphPath",ShvHandoffBuildPolicy.RphPath);Exact(data,"rphSha256",ShvHandoffBuildPolicy.RphSha256);Exact(data,"rphVersion",ShvHandoffBuildPolicy.RphVersion);
                Exact(data,"producerPath",ShvHandoffBuildPolicy.ProducerPath);Exact(data,"producerSha256",ShvHandoffBuildPolicy.ProducerSha256);
                Exact(data,"identityMode","read-only-sdk-ordinary-reuse");Flag(data,"counterWrapAddressAbaExcluded",true);
                Flag(data,"passiveOnly",true);Flag(data,"audioPlaybackAllowed",false);Flag(data,"fixtureOnly",false);
                string caller=Text(data,"callerAssemblySha256");Need(Regex.IsMatch(caller,"\\A[a-f0-9]{64}\\z")&&caller==HashAssembly(typeof(ShvHandoffBootstrap).Assembly),"session-actual-caller-hash");
                var value=new Configuration(session,caller);CheckUnlinked(value.EvidenceRoot);
                Need(!Directory.Exists(value.EvidenceRoot)&&!File.Exists(value.EvidenceRoot),"session-evidence-already-exists");
                config=value;reason="reviewed-process-bound-session";return true;
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){reason=error is InvalidDataException?error.Message:"reviewed-session-invalid:"+error.GetType().Name;return false;}
        }
    }
}
#endif
