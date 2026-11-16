using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.NativeSuppression01
{
    // File IO and fsync live on this worker. It NEVER holds an adapter/controller
    // reference. The bounded queue is drained by the SHVDNE script callback.
    internal sealed class LocalBridge : IRunJournal
    {
        readonly BlockingCollection<string> logs=new BlockingCollection<string>(128);
        readonly BlockingCollection<RunCommand> inbox=new BlockingCollection<RunCommand>(8);
        readonly ConcurrentQueue<KeyValuePair<string,string>> replies=new ConcurrentQueue<KeyValuePair<string,string>>();
        readonly string scriptDirectory,root;
        readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=16384,RecursionLimit=12 };
        long issued,durable,captureSequence;int lines;
        volatile bool enabled,healthy,closing;
        volatile RunState state;
        volatile CaptureLease capture;
        internal readonly string Session=Guid.NewGuid().ToString("N");
        internal IdleDecoratorLock DecoratorLock {get;private set;}
        internal bool Enabled {get{return enabled;}}
        public bool Healthy {get{return healthy&&!closing;}}
        internal CaptureLease Capture {get{return capture;}}
        internal LocalBridge(string scriptDirectory,string root) {this.scriptDirectory=scriptDirectory;this.root=root;new Thread(Work){IsBackground=true,Name="Native suppression08 local evidence IO"}.Start();}
        public long Write(string text) {
            if(!Healthy)return Int64.MaxValue;
            if(text==null||text.Length>4096||Interlocked.Increment(ref lines)>8192){healthy=false;return Int64.MaxValue;}
            long seq=Interlocked.Increment(ref issued);
            string line=seq.ToString(CultureInfo.InvariantCulture)+"|"+DateTime.UtcNow.ToString("O",CultureInfo.InvariantCulture)+" qpc="+Stopwatch.GetTimestamp()+" "+text.Replace('\r',' ').Replace('\n',' ');
            if(!logs.TryAdd(line))healthy=false;return seq;
        }
        public bool Durable(long seq) {return Healthy&&seq>0&&Interlocked.Read(ref durable)>=seq;}
        internal bool TryCommand(out RunCommand c) {return inbox.TryTake(out c);}
        internal void Reply(string id,string result) {replies.Enqueue(new KeyValuePair<string,string>(id,result));}
        internal void Publish(RunState next) {state=next;}
        internal static string Digest(string p) {using(var f=File.OpenRead(p))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
        internal static void NoLinks(string p) {
            for(string at=Path.GetFullPath(p);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))
                if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new IOException("linked operator path refused");
        }
        static void PrivateDirectory(string p) {
            NoLinks(p);Directory.CreateDirectory(p);var sid=WindowsIdentity.GetCurrent().User;
            var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(sid);
            acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            Directory.SetAccessControl(p,acl);
        }
        static void NewText(string p,string value) {
            NoLinks(p);using(var f=new FileStream(p,FileMode.CreateNew,FileAccess.Write,FileShare.Read)) {
                byte[] bytes=new UTF8Encoding(false,true).GetBytes(value);f.Write(bytes,0,bytes.Length);f.Flush(true);
            }
        }
        void PublishFile(string p,object value) {
            string temp=p+".new";NewText(temp,json.Serialize(value));NoLinks(p);
            for(int attempt=0;;attempt++) {
                if(MoveFileEx(temp,p,9))return; // REPLACE_EXISTING | WRITE_THROUGH
                int code=Marshal.GetLastWin32Error();
                if(attempt>=20||(code!=5&&code!=32&&code!=33)||(File.Exists(p)&&(File.GetAttributes(p)&FileAttributes.ReadOnly)!=0))throw new IOException("atomic status publication refused: "+code);
                Thread.Sleep(5); // bounded IO worker only, never a script callback
            }
        }
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
        static extern bool MoveFileEx(string from,string to,uint flags);
        string ReadSmall(string p) {
            for(int attempt=0;;attempt++) {
                try {NoLinks(p);using(var f=new FileStream(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){
                    if(f.Length>16384)throw new IOException("oversized operator message");using(var reader=new StreamReader(f,new UTF8Encoding(false,true)))return reader.ReadToEnd();}}
                catch(IOException e) {int code=e.HResult&65535;if(attempt>=10||(code!=2&&code!=3&&code!=32&&code!=33))throw;Thread.Sleep(5);}
            }
        }
        internal static RunCommand ParseCommand(string text) {
            var j=new JavaScriptSerializer {MaxJsonLength=16384,RecursionLimit=4};
            var d=j.Deserialize<Dictionary<string,object>>(text);
            var allowed=new HashSet<string>(new[]{"Session","Id","Phase","Generation","Operation","Profile","Decision","Text","Observation","EvidenceSha256","ExpiresTicks","CaptureReviewed","ContextReviewed"});
            if(d==null||d.Count>allowed.Count)throw new IOException("command shape");foreach(string k in d.Keys)if(!allowed.Contains(k))throw new IOException("unknown command field");
            var c=j.Deserialize<RunCommand>(text);Guid id;
            if(!Guid.TryParseExact(c.Id,"N",out id)||c.Id!=id.ToString("N")||c.Text==null||c.Text.Length>1024||
                (c.Operation!="Begin"&&c.Operation!="Review"&&c.Operation!="Stop"))throw new IOException("finite command required");
            return c;
        }
        void Work() {
            try {
                string config=Path.Combine(scriptDirectory,"RichAudio.NativeSuppression11.ini");
                if(!File.Exists(config)||new FileInfo(config).Length>1024||File.ReadAllText(config).Trim()!="Enabled=true")return;
                using(var proc=Process.GetCurrentProcess()) {
#if !AUTOMATION_FIXTURES
                    var m=proc.MainModule;
                    if(m.FileVersionInfo.FileVersion!="1.0.1158.16"||!String.Equals(Path.GetFullPath(m.FileName),Candidate.GamePath,StringComparison.OrdinalIgnoreCase)||
                        Digest(m.FileName)!=Candidate.GameSha256||typeof(GTA.Script).Assembly.FullName!="ScriptHookVDotNet3, Version=3.9.0.0, Culture=neutral, PublicKeyToken=null"||
                        !String.Equals(Path.GetFullPath(typeof(GTA.Script).Assembly.Location),Path.Combine(Path.GetDirectoryName(m.FileName),"ScriptHookVDotNet3.dll"),StringComparison.OrdinalIgnoreCase)||
                        Digest(typeof(GTA.Script).Assembly.Location)!=Candidate.ApiSha256||Digest(Path.Combine(Path.GetDirectoryName(m.FileName),@"mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf"))!=Candidate.DlcSha256)
                        throw new IOException("exact runtime identity refused");
                    string framework=Path.Combine(Path.GetDirectoryName(m.FileName),"ScriptHookVDotNet.log");NoLinks(framework);
                    string startup=File.ReadAllText(framework);int init=startup.LastIndexOf("NativeMemory took ",StringComparison.Ordinal);
                    if(File.GetLastWriteTimeUtc(framework)<proc.StartTime.ToUniversalTime()||init<0||startup.IndexOf("[ERROR]",init,StringComparison.Ordinal)>=0||startup.IndexOf("Initializing NativeMemory",init,StringComparison.Ordinal)>=0)
                        throw new IOException("fresh successful NativeMemory initialization required");
                    DecoratorLock=IdleDecoratorLock.Capture(m);
#endif
                    NoLinks(root);if(!Directory.Exists(root))throw new IOException("approved installation ledger directory required");
                    string io=Path.Combine(root,"operator");PrivateDirectory(io);PrivateDirectory(Path.Combine(io,"commands"));PrivateDirectory(Path.Combine(io,"replies"));
                    // Exclusive durable claim prevents a script reload or second load
                    // from reusing this installation's single experiment authority.
                    NewText(Path.Combine(io,"activation.lock"),Session+" "+proc.Id+" "+proc.StartTime.ToUniversalTime().Ticks);
                    using(var f=new FileStream(Path.Combine(io,"journal.log"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
                    using(var w=new StreamWriter(f)) {
                        w.WriteLine("NativeSuppression11 source="+Candidate.SourceCommit+" session="+Session+" pid="+proc.Id+" processCreationTicks="+proc.StartTime.ToUniversalTime().Ticks+" qpcFrequency="+Stopwatch.Frequency+"; acoustic qualification and crash recovery UNPROVEN");w.Flush();f.Flush(true);
                        healthy=enabled=true;var seen=new HashSet<string>();
                        while(!closing||logs.Count>0) {
                            string line;while(logs.TryTake(out line)) {w.WriteLine(line);w.Flush();f.Flush(true);Interlocked.Exchange(ref durable,Int64.Parse(line.Substring(0,line.IndexOf('|')),CultureInfo.InvariantCulture));}
                            string pulse=Path.Combine(io,"capture.json");
                            if(File.Exists(pulse)) {
                                var c=json.Deserialize<CaptureLease>(ReadSmall(pulse));
                                if(c.Session!=Session||c.Sequence<captureSequence||c.ObservedTicks>Stopwatch.GetTimestamp()+Stopwatch.Frequency/10)throw new IOException("stale or foreign recorder lease");
                                captureSequence=c.Sequence;capture=c;
                            }
                            string[] paths=Directory.GetFiles(Path.Combine(io,"commands"));
                            if(paths.Length>128)throw new IOException("bounded command directory exceeded");
                            Array.Sort(paths,StringComparer.Ordinal);
                            foreach(string p in paths)if(seen.Add(p)) {
                                var c=ParseCommand(ReadSmall(p));
                                if(Path.GetFileName(p)!="cmd-"+c.Id+".json")throw new IOException("command filename binding");
                                if(c.Operation=="Review"&&c.CaptureReviewed) {
                                    if(c.Observation==null||!System.Text.RegularExpressions.Regex.IsMatch(c.Observation,"\\A[a-f0-9]{32}\\z"))throw new IOException("observation identity");
                                    string receipt=Path.Combine(io,"evidence",c.Observation+".json");
                                    NoLinks(receipt);
                                    if(Digest(receipt)!=c.EvidenceSha256)throw new IOException("reviewed evidence receipt identity");
                                    var d=json.Deserialize<Dictionary<string,object>>(ReadSmall(receipt));
                                    if((string)d["Session"]!=Session||(string)d["Observation"]!=c.Observation||(string)d["Phase"]!=c.Phase||(string)d["Generation"]!=c.Generation||(string)d["Profile"]!=c.Profile||!(bool)d["Passed"])
                                        throw new IOException("reviewed evidence binding");
                                }
                                if(!inbox.TryAdd(c))throw new IOException("bounded command queue full");
                            }
                            KeyValuePair<string,string> reply;
                            while(replies.TryDequeue(out reply))NewText(Path.Combine(io,"replies",reply.Key+".json"),json.Serialize(new{Id=reply.Key,Session=Session,Result=reply.Value,Durable=Interlocked.Read(ref durable)}));
                            RunState s=state;if(s!=null)PublishFile(Path.Combine(io,"state.json"),s);
                            Thread.Sleep(50);
                        }
                    }
                }
            } catch(ThreadAbortException) {throw;}
            catch(Exception e) {healthy=false;try{File.AppendAllText(Path.Combine(root,"bridge-failure.txt"),e.GetType().Name+":"+e.Message);}catch(IOException){} }
            finally {healthy=false;enabled=false;}
        }
        internal void Close() {closing=true;}
    }
}
