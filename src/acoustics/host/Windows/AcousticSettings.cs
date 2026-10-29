// Persistent acoustic controls. No device, game, graphics or callback access.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.Beacon.Windows
{
    public sealed class AcousticSettings
    {
        public readonly string Quality, Acceleration;
        public readonly long Revision;
        public readonly bool RichAudioEnabled,EarlyReflections,DiagnosticsOverlay;
        public readonly double OutputLevel;
        public static readonly string[] Qualities = {"auto", "performance", "balanced", "quality", "max"};
        public static readonly string[] Accelerations = {"auto", "cpu", "gpu"};

        public AcousticSettings(string quality, string acceleration, long revision,bool richAudioEnabled=true,double outputLevel=1,bool earlyReflections=true,bool diagnosticsOverlay=false)
        {
            if(Array.IndexOf(Qualities, quality)<0 || Array.IndexOf(Accelerations, acceleration)<0 || revision<1 || revision>9007199254740991L)
                throw new ArgumentException("Validated acoustic quality, acceleration and revision required");
            if(Double.IsNaN(outputLevel)||Double.IsInfinity(outputLevel)||outputLevel<0||outputLevel>1)throw new ArgumentException("Owned output level must be finite and within 0..1");
            Quality=quality; Acceleration=acceleration; Revision=revision;RichAudioEnabled=richAudioEnabled;OutputLevel=outputLevel;EarlyReflections=earlyReflections;DiagnosticsOverlay=diagnosticsOverlay;
        }
        public static AcousticSettings Defaults(long revision){return new AcousticSettings("auto","auto",revision);}
        public AcousticSettings WithRevision(long revision){return new AcousticSettings(Quality,Acceleration,revision,RichAudioEnabled,OutputLevel,EarlyReflections,DiagnosticsOverlay);}
        public AcousticSettings WithSelections(string quality,string acceleration,long revision){return new AcousticSettings(quality,acceleration,revision,RichAudioEnabled,OutputLevel,EarlyReflections,DiagnosticsOverlay);}
        public AcousticSettings WithAudio(bool? enabled,double? outputLevel,bool? earlyReflections,bool? diagnosticsOverlay){return new AcousticSettings(Quality,Acceleration,Revision,enabled??RichAudioEnabled,outputLevel??OutputLevel,earlyReflections??EarlyReflections,diagnosticsOverlay??DiagnosticsOverlay);}
        public bool SamePreferences(AcousticSettings other){return other!=null&&Quality==other.Quality&&Acceleration==other.Acceleration&&RichAudioEnabled==other.RichAudioEnabled&&OutputLevel==other.OutputLevel&&EarlyReflections==other.EarlyReflections&&DiagnosticsOverlay==other.DiagnosticsOverlay;}
        public static AcousticSettings Parse(string text)
        {
            if(text==null || text.Length>4096)throw new InvalidDataException("Bounded acoustic settings required");
            foreach(string key in new[]{"schemaVersion","revision","acousticQuality","acousticAcceleration"})
                if(System.Text.RegularExpressions.Regex.Matches(text,"\""+key+"\"\\s*:").Count!=1)
                    throw new InvalidDataException("Canonical unique acoustic settings fields required");
            var d=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=4}.DeserializeObject(text) as Dictionary<string,object>;
            if(d==null || d.Count<4 || d.Count>8 || !d.ContainsKey("schemaVersion") || !(d["schemaVersion"] is int) || (int)d["schemaVersion"]!=1 ||
               !d.ContainsKey("revision") || !(d["revision"] is int || d["revision"] is long) ||
               !d.ContainsKey("acousticQuality") || !d.ContainsKey("acousticAcceleration"))
                throw new InvalidDataException("Acoustic settings schema/version");
            foreach(string key in d.Keys){
                if(Array.IndexOf(new[]{"schemaVersion","revision","acousticQuality","acousticAcceleration","richAudioEnabled","outputLevel","earlyReflections","diagnosticsOverlay"},key)<0 ||
                    System.Text.RegularExpressions.Regex.Matches(text,"\""+key+"\"\\s*:").Count!=1)throw new InvalidDataException("Unknown or duplicate acoustic preference");}
            foreach(string key in new[]{"richAudioEnabled","earlyReflections","diagnosticsOverlay"})
                if(d.ContainsKey(key)&&!(d[key] is bool))throw new InvalidDataException("Boolean acoustic preference required");
            object level;double output=1;
            if(d.TryGetValue("outputLevel",out level)){
                if(!(level is int||level is long||level is double||level is decimal))throw new InvalidDataException("Numeric output level required");
                output=Convert.ToDouble(level,CultureInfo.InvariantCulture);}
            return new AcousticSettings(d["acousticQuality"] as string,d["acousticAcceleration"] as string,
                Convert.ToInt64(d["revision"],CultureInfo.InvariantCulture),!d.ContainsKey("richAudioEnabled")||(bool)d["richAudioEnabled"],output,
                !d.ContainsKey("earlyReflections")||(bool)d["earlyReflections"],d.ContainsKey("diagnosticsOverlay")&&(bool)d["diagnosticsOverlay"]);
        }
        public string Serialize()
        {
            return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"revision",Revision},
                {"acousticQuality",Quality},{"acousticAcceleration",Acceleration},{"richAudioEnabled",RichAudioEnabled},{"outputLevel",OutputLevel},
                {"earlyReflections",EarlyReflections},{"diagnosticsOverlay",DiagnosticsOverlay}});
        }
        public string ProducerArguments(){return " --acoustic-quality "+Quality+" --acoustic-acceleration "+Acceleration+
            (RichAudioEnabled?"":" --rich-audio-enabled false")+(OutputLevel==1?"":" --rich-audio-output-level "+OutputLevel.ToString("R",CultureInfo.InvariantCulture))+
            (EarlyReflections?"":" --early-reflections false")+(DiagnosticsOverlay?" --acoustic-diagnostics-overlay true":"");}
        public string ControlMessage(){return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"type","acoustic-settings"},
            {"revision",Revision},{"quality",Quality},{"acceleration",Acceleration},{"richAudioEnabled",RichAudioEnabled},{"outputLevel",OutputLevel},
            {"earlyReflections",EarlyReflections},{"diagnosticsOverlay",DiagnosticsOverlay}});}
    }

    public static class AcousticSettingsStore
    {
        public static string DefaultPath(string root){return Path.Combine(root,".local","acoustic-settings.json");}
        public static string StatusPath(string path){return Path.ChangeExtension(path,"status.json");}
        public static string PrivatePath(string root,string path)
        {
            string full=Path.GetFullPath(Path.IsPathRooted(path)?path:Path.Combine(root,path));
            string prefix=Path.GetFullPath(Path.Combine(root,".local"))+Path.DirectorySeparatorChar;
            if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Acoustic controls require private repository .local storage");
            for(var d=new DirectoryInfo(Path.GetDirectoryName(full));d!=null;d=d.Parent)
                if(d.Exists && (d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked acoustic settings path rejected");
            if(File.Exists(full) && (File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked acoustic settings file rejected");
            if(Directory.Exists(full))throw new IOException("Settings path is a directory");
            return full;
        }
        public static AcousticSettings Load(string root,string path)
        {
            path=PrivatePath(root,path);
            return AcousticSettings.Parse(ReadBounded(path,4096));
        }
        public static string ReadBounded(string path,int maximumBytes)
        {
            byte[] bytes=ReadBoundedBytes(path,maximumBytes);int skip=bytes.Length>=3&&bytes[0]==239&&bytes[1]==187&&bytes[2]==191?3:0;
            return new UTF8Encoding(false,true).GetString(bytes,skip,bytes.Length-skip);
        }
        private static byte[] ReadBoundedBytes(string path,int maximumBytes)
        {
            if(maximumBytes<1 || maximumBytes>16384)throw new ArgumentException("Acoustic file read bound");
            var bytes=new byte[maximumBytes+1];int count=0;
            using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
            {while(count<bytes.Length){int read=file.Read(bytes,count,bytes.Length-count);if(read==0)break;count+=read;}}
            if(count>maximumBytes)throw new InvalidDataException("Acoustic control file exceeds bound");
            if(count==bytes.Length)return bytes;var exact=new byte[count];Buffer.BlockCopy(bytes,0,exact,0,count);return exact;
        }
        public static void Save(string root,string path,AcousticSettings settings){SaveExpected(root,path,settings,null);}
        public static void SaveExpected(string root,string path,AcousticSettings settings,long? expectedRevision)
        {
            path=PrivatePath(root,path);
            WithWriteLock(path,delegate(){
                long current=File.Exists(path)?Load(root,path).Revision:0;
                if(expectedRevision.HasValue&&current!=expectedRevision.Value)throw new InvalidDataException("Acoustic settings changed elsewhere");
                if(settings.Revision<=current)throw new InvalidDataException("Saved acoustic settings revision must increase");
                WriteAtomic(root,path,settings.Serialize(),4096);
            });
        }
        private static void WithWriteLock(string path,Action action)
        {
            var sid=System.Security.Principal.WindowsIdentity.GetCurrent().User;
            string hash;using(var sha=System.Security.Cryptography.SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sid.Value+"\n"+path.ToUpperInvariant()))).Replace("-","");
            var access=new System.Security.AccessControl.MutexSecurity();access.SetOwner(sid);access.SetAccessRuleProtection(true,false);
            access.AddAccessRule(new System.Security.AccessControl.MutexAccessRule(sid,System.Security.AccessControl.MutexRights.FullControl,System.Security.AccessControl.AccessControlType.Allow));
            bool created;using(var gate=new Mutex(false,"Local\\RichAudio.AcousticSettings."+hash,out created,access)){
                bool entered=false;try{
                    try{entered=gate.WaitOne(100);}catch(AbandonedMutexException){entered=true;}
                    if(!entered)throw new IOException("Acoustic settings are busy");
                    action();
                }finally{if(entered)gate.ReleaseMutex();}}
        }
        private static string Digest(byte[] bytes){using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","");}
        private static bool Recoverable(byte[] bytes,out long revision)
        {
            revision=0;string text;
            try{int skip=bytes.Length>=3&&bytes[0]==239&&bytes[1]==187&&bytes[2]==191?3:0;text=new UTF8Encoding(false,true).GetString(bytes,skip,bytes.Length-skip);}
            catch(ArgumentException){return false;}
            try{AcousticSettings.Parse(text);return false;}catch(ArgumentException){}catch(InvalidDataException){}
            // Recognize only this application's unique, top-level schema-v1
            // fields. Truncation after an identifiable own prefix is recoverable;
            // arbitrary JSON/text, nested lookalikes and binary data are not.
            var fields=new Dictionary<string,List<int>>(StringComparer.Ordinal);int depth=0;bool keyExpected=true,rootSeen=false;
            for(int i=0;i<text.Length;i++){
                char c=text[i];if(!rootSeen){if(Char.IsWhiteSpace(c))continue;if(c!='{')return false;rootSeen=true;depth=1;continue;}
                if(c=='"'){
                    int start=i+1;bool escaped=false,ended=false;
                    while(++i<text.Length){if(text[i]=='\\'){escaped=true;i++;continue;}if(text[i]=='"'){ended=true;break;}}
                    if(!ended)break;
                    if(depth==1&&keyExpected){int colon=i+1;while(colon<text.Length&&Char.IsWhiteSpace(text[colon]))colon++;
                        if(colon>=text.Length||text[colon]!=':')return false;if(escaped)return false;
                        string key=text.Substring(start,i-start);List<int> positions;if(!fields.TryGetValue(key,out positions)){positions=new List<int>();fields.Add(key,positions);}
                        int value=colon+1;while(value<text.Length&&Char.IsWhiteSpace(text[value]))value++;positions.Add(value);keyExpected=false;}
                    continue;
                }
                if(c=='{'||c=='[')depth++;else if(c=='}'||c==']'){depth--;if(depth==0)break;}else if(c==','&&depth==1)keyExpected=true;
                if(depth<0)return false;
            }
            foreach(string key in new[]{"schemaVersion","acousticQuality","acousticAcceleration"}){List<int> values;if(!fields.TryGetValue(key,out values)||values.Count!=1)return false;}
            int schemaAt=fields["schemaVersion"][0];if(schemaAt>=text.Length||text[schemaAt]!='1')return false;
            int end=schemaAt+1;while(end<text.Length&&Char.IsWhiteSpace(text[end]))end++;
            if(end<text.Length&&text[end]!=','&&text[end]!='}')return false;
            List<int> revisions;if(fields.TryGetValue("revision",out revisions)&&revisions.Count==1){int at=revisions[0],finish=at;
                while(finish<text.Length&&text[finish]>='0'&&text[finish]<='9')finish++;long n;
                if(finish>at&&Int64.TryParse(text.Substring(at,finish-at),NumberStyles.None,CultureInfo.InvariantCulture,out n)&&n>0&&n<9007199254740991L)revision=n;}
            return true;
        }
        public static bool TryMalformedRecovery(string root,string path,out string digest)
        {
            path=PrivatePath(root,path);digest=null;if(!File.Exists(path))return false;
            byte[] bytes=ReadBoundedBytes(path,4096);long ignored;if(!Recoverable(bytes,out ignored))return false;digest=Digest(bytes);return true;
        }
        public static AcousticSettings RecoverDefaults(string root,string path,string expectedDigest,long lastKnownRevision)
        {
            path=PrivatePath(root,path);AcousticSettings restored=null;
            if(expectedDigest==null||expectedDigest.Length!=64)throw new InvalidDataException("Malformed-preference reset requires observed bytes");
            WithWriteLock(path,delegate(){
                byte[] bytes=ReadBoundedBytes(path,4096);long hinted;
                if(Digest(bytes)!=expectedDigest||!Recoverable(bytes,out hinted))throw new InvalidDataException("Saved preferences changed before reset");
                long clock=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
                restored=AcousticSettings.Defaults(Math.Max(clock,Math.Max(lastKnownRevision,hinted)+1));
                string backup=PrivatePath(root,path+".invalid-"+Guid.NewGuid().ToString("N")+".json");
                File.Move(path,backup); // Fresh sibling; a collision cannot overwrite a backup.
                try{WriteAtomic(root,path,restored.Serialize(),4096,true);}
                catch{if(!File.Exists(path)&&!Directory.Exists(path)){PrivatePath(root,path);File.Move(backup,path);}throw;}
            });return restored;
        }
        public static void WriteAtomic(string root,string path,string text,int bound,bool requireAbsent=false)
        {
            path=PrivatePath(root,path);if(text==null || Encoding.UTF8.GetByteCount(text)>bound)throw new InvalidDataException("Acoustic control file bound");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string temporary=path+"."+Guid.NewGuid().ToString("N")+".tmp";
            try
            {
                byte[] bytes=new UTF8Encoding(false,true).GetBytes(text);
                using(var file=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}
                PrivatePath(root,path); // Recheck destination before an atomic replace.
                if(!requireAbsent&&File.Exists(path))File.Replace(temporary,path,null);else File.Move(temporary,path);
            }
            finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
        public static AcousticSettings Resolve(string root,string selectedPath,string quality,string acceleration,out string path)
        {
            path=PrivatePath(root,selectedPath??DefaultPath(root));
            AcousticSettings loaded=File.Exists(path)?Load(root,path):null;
            if(selectedPath!=null && loaded==null)throw new FileNotFoundException("Selected acoustic settings file does not exist");
            if(loaded==null && quality==null && acceleration==null)return null; // Existing launch defaults remain unchanged.
            return (loaded??AcousticSettings.Defaults(1)).WithSelections(quality??(loaded==null?"auto":loaded.Quality),acceleration??(loaded==null?"auto":loaded.Acceleration),
                loaded==null?1:loaded.Revision);
        }
        public static AcousticSettings ResolveForLaunch(string root,string selectedPath,string quality,string acceleration,bool knownWav,out string path)
        {
            if(knownWav)
            {
                path=null;
                if(selectedPath!=null || quality!=null || acceleration!=null)throw new ArgumentException("Acoustic settings require incremental rendering");
                return null; // A saved incremental preference must not disable known-WAV playback.
            }
            return Resolve(root,selectedPath,quality,acceleration,out path);
        }
    }

    // The host calls this only from its background supervisor/diagnostic threads.
    // Diagnostic receipt is a nonblocking latest-value mailbox; persistence is off reader/callback.
    public sealed class AcousticSettingsMonitor:IDisposable
    {
        private readonly string root,path,session=Guid.NewGuid().ToString("N");
        private readonly Action<AcousticSettings> apply;
        private readonly object sync=new object();
        private AcousticSettings accepted;
        private string latestStatus,lastPersistedStatus,observedFile;
        private volatile bool stopped;
        private Thread thread;
        public long Applied,Rejected,StatusWrites,StatusWriteErrors;
        public string LastError;
        public AcousticSettingsMonitor(string root,string path,AcousticSettings initial,Action<AcousticSettings> apply)
        {this.root=root;this.path=AcousticSettingsStore.PrivatePath(root,path);accepted=initial;this.apply=apply;
            observedFile=File.Exists(this.path)?AcousticSettingsStore.Load(root,this.path).Serialize():null;}
        public void Start(){thread=new Thread(Run){IsBackground=true,Name="RichAudio acoustic settings"};thread.Start();}
        private void Run(){while(!stopped){PollOnce();Thread.Sleep(250);}}
        public void PublishStatus(string line)
        {
            if(line!=null && line.Length<=8192 && line.StartsWith("{\"type\":\"acoustic-settings-status\",",StringComparison.Ordinal))
                Interlocked.Exchange(ref latestStatus,line);
        }
        public void PollOnce()
        {
            try
            {
                if(File.Exists(path))
                {
                    var next=AcousticSettingsStore.Load(root,path);
                    if(next.Revision>accepted.Revision){apply(next);lock(sync)accepted=next;observedFile=next.Serialize();Applied++;LastError=null;}
                    else if(next.Serialize()!=observedFile && (next.Revision<accepted.Revision || !next.SamePreferences(accepted)))
                        throw new InvalidDataException("Acoustic settings revision did not increase");
                    else LastError=null;
                }
            }
            catch(Exception e){Rejected++;LastError=e.GetType().Name+": "+e.Message;}
            string nextStatus=Interlocked.Exchange(ref latestStatus,null);
            if(nextStatus!=null){lastPersistedStatus=nextStatus;PersistStatus("running");}
        }
        private void PersistStatus(string hostState)
        {
            try
            {
                object node=lastPersistedStatus==null?null:new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=16}.DeserializeObject(lastPersistedStatus);
                string text=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20}.Serialize(new Dictionary<string,object>{{"schemaVersion",1},
                    {"hostSession",session},{"hostState",hostState},{"recordedAtUtc",DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture)},
                    {"settingsError",LastError},{"status",node}});
                string target=AcousticSettingsStore.PrivatePath(root,AcousticSettingsStore.StatusPath(path));
                if(File.Exists(target)){
                    var old=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20}.DeserializeObject(AcousticSettingsStore.ReadBounded(target,16384)) as Dictionary<string,object>;
                    if(old==null || !old.ContainsKey("schemaVersion") || !Equals(old["schemaVersion"],1) || !old.ContainsKey("hostSession") ||
                        !System.Text.RegularExpressions.Regex.IsMatch(old["hostSession"] as string??"","\\A[a-f0-9]{32}\\z") ||
                        !old.ContainsKey("hostState") || !old.ContainsKey("recordedAtUtc") || !old.ContainsKey("status"))
                        throw new InvalidDataException("Unexpected existing acoustic status preserved");
                }
                AcousticSettingsStore.WriteAtomic(root,target,text,16384);StatusWrites++;
            }
            catch(Exception e){StatusWriteErrors++;LastError="Status persistence: "+e.GetType().Name;}
        }
        public Dictionary<string,object> Metrics(){lock(sync)return new Dictionary<string,object>{{"requestedQuality",accepted.Quality},
            {"requestedAcceleration",accepted.Acceleration},{"revision",accepted.Revision},{"applied",Applied},{"rejected",Rejected},
            {"richAudioEnabled",accepted.RichAudioEnabled},{"outputLevel",accepted.OutputLevel},{"earlyReflections",accepted.EarlyReflections},{"diagnosticsOverlay",accepted.DiagnosticsOverlay},
            {"statusWrites",StatusWrites},{"statusWriteErrors",StatusWriteErrors},{"lastError",LastError}};}
        public void Dispose(){stopped=true;if(thread!=null && Thread.CurrentThread!=thread)thread.Join(1000);PersistStatus("stopped");}
    }
}
