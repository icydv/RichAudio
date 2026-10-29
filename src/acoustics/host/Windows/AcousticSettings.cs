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
        public static readonly string[] Qualities = {"auto", "performance", "balanced", "quality", "max"};
        public static readonly string[] Accelerations = {"auto", "cpu", "gpu"};

        public AcousticSettings(string quality, string acceleration, long revision)
        {
            if(Array.IndexOf(Qualities, quality)<0 || Array.IndexOf(Accelerations, acceleration)<0 || revision<1 || revision>9007199254740991L)
                throw new ArgumentException("Validated acoustic quality, acceleration and revision required");
            Quality=quality; Acceleration=acceleration; Revision=revision;
        }
        public static AcousticSettings Parse(string text)
        {
            if(text==null || text.Length>4096)throw new InvalidDataException("Bounded acoustic settings required");
            foreach(string key in new[]{"schemaVersion","revision","acousticQuality","acousticAcceleration"})
                if(System.Text.RegularExpressions.Regex.Matches(text,"\""+key+"\"\\s*:").Count!=1)
                    throw new InvalidDataException("Canonical unique acoustic settings fields required");
            var d=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=4}.DeserializeObject(text) as Dictionary<string,object>;
            if(d==null || d.Count!=4 || !d.ContainsKey("schemaVersion") || !(d["schemaVersion"] is int) || (int)d["schemaVersion"]!=1 ||
               !d.ContainsKey("revision") || !(d["revision"] is int || d["revision"] is long) ||
               !d.ContainsKey("acousticQuality") || !d.ContainsKey("acousticAcceleration"))
                throw new InvalidDataException("Acoustic settings schema/version");
            return new AcousticSettings(d["acousticQuality"] as string,d["acousticAcceleration"] as string,
                Convert.ToInt64(d["revision"],CultureInfo.InvariantCulture));
        }
        public string Serialize()
        {
            return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"revision",Revision},
                {"acousticQuality",Quality},{"acousticAcceleration",Acceleration}});
        }
        public string ProducerArguments(){return " --acoustic-quality "+Quality+" --acoustic-acceleration "+Acceleration;}
        public string ControlMessage(){return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"type","acoustic-settings"},
            {"revision",Revision},{"quality",Quality},{"acceleration",Acceleration}});}
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
            if(maximumBytes<1 || maximumBytes>16384)throw new ArgumentException("Acoustic file read bound");
            var bytes=new byte[maximumBytes+1];int count=0;
            using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
            {while(count<bytes.Length){int read=file.Read(bytes,count,bytes.Length-count);if(read==0)break;count+=read;}}
            if(count>maximumBytes)throw new InvalidDataException("Acoustic control file exceeds bound");
            int skip=count>=3&&bytes[0]==239&&bytes[1]==187&&bytes[2]==191?3:0;
            return new UTF8Encoding(false,true).GetString(bytes,skip,count-skip);
        }
        public static void Save(string root,string path,AcousticSettings settings)
        {
            path=PrivatePath(root,path);
            if(File.Exists(path) && settings.Revision<=Load(root,path).Revision)throw new InvalidDataException("Saved acoustic settings revision must increase");
            WriteAtomic(root,path,settings.Serialize(),4096);
        }
        public static void WriteAtomic(string root,string path,string text,int bound)
        {
            path=PrivatePath(root,path);if(text==null || Encoding.UTF8.GetByteCount(text)>bound)throw new InvalidDataException("Acoustic control file bound");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string temporary=path+"."+Guid.NewGuid().ToString("N")+".tmp";
            try
            {
                byte[] bytes=new UTF8Encoding(false,true).GetBytes(text);
                using(var file=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}
                PrivatePath(root,path); // Recheck destination before an atomic replace.
                if(File.Exists(path))File.Replace(temporary,path,null);else File.Move(temporary,path);
            }
            finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
        public static AcousticSettings Resolve(string root,string selectedPath,string quality,string acceleration,out string path)
        {
            path=PrivatePath(root,selectedPath??DefaultPath(root));
            AcousticSettings loaded=File.Exists(path)?Load(root,path):null;
            if(selectedPath!=null && loaded==null)throw new FileNotFoundException("Selected acoustic settings file does not exist");
            if(loaded==null && quality==null && acceleration==null)return null; // Existing launch defaults remain unchanged.
            return new AcousticSettings(quality??(loaded==null?"auto":loaded.Quality),acceleration??(loaded==null?"auto":loaded.Acceleration),
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
                    else if(next.Serialize()!=observedFile && (next.Revision<accepted.Revision || next.Quality!=accepted.Quality || next.Acceleration!=accepted.Acceleration))
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
            {"statusWrites",StatusWrites},{"statusWriteErrors",StatusWriteErrors},{"lastError",LastError}};}
        public void Dispose(){stopped=true;if(thread!=null && Thread.CurrentThread!=thread)thread.Join(1000);PersistStatus("stopped");}
    }
}
