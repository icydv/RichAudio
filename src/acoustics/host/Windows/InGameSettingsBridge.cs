// Shared by the RPH adapter and device-free fixtures. All filesystem and mutex
// work is confined to one bounded background worker, never a game/audio fiber.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.Beacon.Windows
{
    public sealed class InGameSettingsLink
    {
        public readonly string WorkspaceRoot,SettingsPath,ToggleKey;
        public readonly bool ControllerEnabled;
        public readonly PassiveSoundMapOptions SoundMap;
        private InGameSettingsLink(string root,string path,string key,bool controller,PassiveSoundMapOptions soundMap){WorkspaceRoot=root;SettingsPath=path;ToggleKey=key;ControllerEnabled=controller;SoundMap=soundMap;}
        internal static void LocalFile(string path)
        {
            if(!System.Text.RegularExpressions.Regex.IsMatch(path,"\\A[A-Za-z]:[\\\\/]"))throw new InvalidDataException("Local drive path required");
            if(new DriveInfo(Path.GetPathRoot(path)).DriveType!=DriveType.Fixed)throw new InvalidDataException("Fixed local storage required");
            for(var d=new DirectoryInfo(Path.GetDirectoryName(path));d!=null;d=d.Parent)
                if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked menu connection rejected");
            if(File.Exists(path)&&(File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked menu file rejected");
        }
        public static InGameSettingsLink Load(string pointerPath)
        {MenuDiagnostic ignored;return Load(pointerPath,out ignored);}
        public static string SidecarForGameExecutable(string executablePath)
        {
            if(!Path.IsPathRooted(executablePath)||!String.Equals(Path.GetFileName(executablePath),"GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Reviewed game executable path required");
            string pointer=Path.Combine(Path.GetDirectoryName(Path.GetFullPath(executablePath)),"Plugins","RichAudio.Menu.json");
            // String resolution only on startup; Load performs every filesystem,
            // fixed-drive and reparse check on the background worker.
            return pointer;
        }
        internal static InGameSettingsLink Load(string pointerPath,out MenuDiagnostic diagnostic)
        {
            diagnostic=null;string stage="sidecar-path";try{
            pointerPath=Path.GetFullPath(pointerPath);LocalFile(pointerPath);
            stage="sidecar-read";
            string text=AcousticSettingsStore.ReadBounded(pointerPath,4096);
            stage="sidecar-schema";
            var d=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=6}.DeserializeObject(text) as Dictionary<string,object>;
            var fields=new[]{"schemaVersion","workspaceRoot","settingsPath","toggleKey","controllerEnabled"};
            if(d==null||(d.Count!=fields.Length&&d.Count!=fields.Length+1)||d.Count==fields.Length+1&&!d.ContainsKey("soundMap"))throw new InvalidDataException("Menu connection schema");
            foreach(string field in fields)if(!d.ContainsKey(field)||System.Text.RegularExpressions.Regex.Matches(text,"\""+field+"\"\\s*:").Count!=1)
                throw new InvalidDataException("Unique menu connection fields required");
            if(!(d["schemaVersion"] is int)||(int)d["schemaVersion"]!=1||!(d["workspaceRoot"] is string)||!(d["settingsPath"] is string)||
                !(d["toggleKey"] is string)||!(d["controllerEnabled"] is bool))throw new InvalidDataException("Menu connection values");
            string rawRoot=(string)d["workspaceRoot"],relative=(string)d["settingsPath"],key=(string)d["toggleKey"];
            if(!Path.IsPathRooted(rawRoot)||Path.IsPathRooted(relative)||rawRoot.Length>1024||relative.Length>240||
                !System.Text.RegularExpressions.Regex.IsMatch(key,"\\AF(?:[1-9]|1[0-2])\\z")||key=="F4")throw new InvalidDataException("Menu connection scope or shortcut");
            stage="workspace-path";
            string root=Path.GetFullPath(rawRoot),path=AcousticSettingsStore.PrivatePath(root,relative);
            LocalFile(path);if(!Directory.Exists(root))throw new InvalidDataException("Workspace unavailable");
            var options=PassiveSoundMapOptions.Disabled;
            if(d.ContainsKey("soundMap")){
                if(System.Text.RegularExpressions.Regex.Matches(text,"\"soundMap\"\\s*:").Count!=1)throw new InvalidDataException("Unique SoundMap configuration required");
                foreach(string f in new[]{"enabled","autoStartService","openWindow","sampleHz","port","nodeExecutable"})if(System.Text.RegularExpressions.Regex.Matches(text,"\""+f+"\"\\s*:").Count!=1)throw new InvalidDataException("Unique SoundMap options required");
                options=PassiveSoundMapOptions.Parse(d["soundMap"]);
                if(options.AutoStartService){LocalFile(options.NodeExecutable);if(!File.Exists(options.NodeExecutable)||!String.Equals(Path.GetFileName(options.NodeExecutable),"node.exe",StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Explicit local Node runtime required");}
            }
            return new InGameSettingsLink(root,path,key,(bool)d["controllerEnabled"],options);
            }catch(Exception e){diagnostic=MenuDiagnostic.Failure(stage,e);throw;}
        }
    }

    public sealed class PassiveSoundMapOptions
    {
        public readonly bool Enabled,AutoStartService,OpenWindow;
        public readonly int SampleHz,Port;
        public readonly string NodeExecutable;
        public static readonly PassiveSoundMapOptions Disabled=new PassiveSoundMapOptions(false,false,false,20,17833,"");
        private PassiveSoundMapOptions(bool enabled,bool autoStart,bool window,int hz,int port,string node)
        {Enabled=enabled;AutoStartService=autoStart;OpenWindow=window;SampleHz=hz;Port=port;NodeExecutable=node;}
        internal static PassiveSoundMapOptions Parse(object value)
        {
            var d=value as Dictionary<string,object>;
            var fields=new[]{"enabled","autoStartService","openWindow","sampleHz","port","nodeExecutable"};
            if(d==null||d.Count!=fields.Length)throw new InvalidDataException("SoundMap options schema");
            foreach(string f in fields)if(!d.ContainsKey(f))throw new InvalidDataException("SoundMap options fields");
            if(!(d["enabled"] is bool)||!(d["autoStartService"] is bool)||!(d["openWindow"] is bool)||!(d["sampleHz"] is int)||!(d["port"] is int)||!(d["nodeExecutable"] is string))throw new InvalidDataException("SoundMap options types");
            int hz=(int)d["sampleHz"],port=(int)d["port"];string node=(string)d["nodeExecutable"];
            if(hz<1||hz>20||port<1024||port>65535||node.Length>1024||(bool)d["autoStartService"]&&!Path.IsPathRooted(node)||!(bool)d["enabled"]&&((bool)d["autoStartService"]||(bool)d["openWindow"]))throw new InvalidDataException("SoundMap options bounds");
            return new PassiveSoundMapOptions((bool)d["enabled"],(bool)d["autoStartService"],(bool)d["openWindow"],hz,port,node);
        }
    }

    public sealed class InGameSettingsSnapshot
    {
        public readonly AcousticSettings Settings;
        public readonly string StatusJson,Error,ToggleKey;
        public readonly bool Available,ControllerEnabled,Pending,ResetAvailable;
        public readonly long SavedRevision;
        public readonly MenuDiagnostic Diagnostic;
        internal readonly string RecoveryDigest;
        internal InGameSettingsSnapshot(AcousticSettings settings,string status,string error,bool available,string key,bool controller,long revision,bool pending,bool resetAvailable=false,string recoveryDigest=null,MenuDiagnostic diagnostic=null)
        {Settings=settings;StatusJson=status;Error=error;Available=available;ToggleKey=key;ControllerEnabled=controller;SavedRevision=revision;Pending=pending;ResetAvailable=available||resetAvailable;RecoveryDigest=recoveryDigest;Diagnostic=diagnostic??new MenuDiagnostic("preferences","loading");}
        internal InGameSettingsSnapshot WithPending(bool value,string error)
        {return new InGameSettingsSnapshot(Settings,StatusJson,error,Available,ToggleKey,ControllerEnabled,SavedRevision,value,ResetAvailable,RecoveryDigest,Diagnostic);}
    }

    public sealed class InGameSettingsBridge:IDisposable
    {
        private sealed class Change {public AcousticSettings Desired;public long Expected;public string RecoveryDigest;}
        private readonly string pointerPath;
        private readonly AutoResetEvent wake=new AutoResetEvent(false);
        private InGameSettingsSnapshot snapshot=new InGameSettingsSnapshot(AcousticSettings.Defaults(1),null,"Menu connection is loading.",false,"F10",true,0,false);
        private InGameSettingsLink link;
        private Change pending;
        private Thread thread;
        private int started,stopped,processing,operationInFlight;
        public InGameSettingsBridge(string pointerPath)
        {if(!Path.IsPathRooted(pointerPath))throw new ArgumentException("Explicit menu connection path required");this.pointerPath=Path.GetFullPath(pointerPath);}
        public InGameSettingsSnapshot Snapshot{get{bool active=Volatile.Read(ref operationInFlight)!=0||Volatile.Read(ref processing)!=0||Volatile.Read(ref pending)!=null;var current=Volatile.Read(ref snapshot);
            return current.Pending==active?current:current.WithPending(active,current.Error);}}
        public void Start()
        {if(Interlocked.CompareExchange(ref started,1,0)!=0||Volatile.Read(ref stopped)!=0)throw new InvalidOperationException("Menu settings worker cannot restart");
            thread=new Thread(Run){IsBackground=true,Name="RichAudio in-game preferences"};thread.Start();}
        public bool TryApply(AcousticSettings desired,long expectedRevision)
        {
            var current=Snapshot;
            if(desired==null||!current.Available||current.Pending||expectedRevision!=current.SavedRevision||Volatile.Read(ref stopped)!=0||Volatile.Read(ref processing)!=0)return false;
            return Queue(current,new Change{Desired=desired,Expected=expectedRevision});
        }
        private bool Queue(InGameSettingsSnapshot current,Change change)
        {
            if(Interlocked.CompareExchange(ref operationInFlight,1,0)!=0)return false;
            if(Interlocked.CompareExchange(ref pending,change,null)!=null){Interlocked.Exchange(ref operationInFlight,0);return false;}
            Interlocked.CompareExchange(ref snapshot,current.WithPending(true,null),current);Signal();return true;
        }
        public bool TryResetDefaults(long expectedRevision)
        {
            var current=Snapshot;
            if(!current.ResetAvailable||current.Pending||expectedRevision!=current.SavedRevision||Volatile.Read(ref stopped)!=0||Volatile.Read(ref processing)!=0)return false;
            return Queue(current,new Change{Desired=AcousticSettings.Defaults(1),Expected=expectedRevision,RecoveryDigest=current.RecoveryDigest});
        }
        public void RequestStop(){Interlocked.Exchange(ref stopped,1);Signal();}
        private void Signal(){try{wake.Set();}catch(ObjectDisposedException){}}
        private void Run()
        {
            try
            {
                while(Volatile.Read(ref stopped)==0)
                {
                    var cadence=Stopwatch.StartNew();
                    string failure=null;
                    string stage="connection-load";MenuDiagnostic diagnostic=null;
                    bool validatedPointer=false;
                    try
                    {
                        var read=InGameSettingsLink.Load(pointerPath,out diagnostic);
                        stage="connection-binding";
                        if(link!=null&&(!String.Equals(link.WorkspaceRoot,read.WorkspaceRoot,StringComparison.OrdinalIgnoreCase)||!String.Equals(link.SettingsPath,read.SettingsPath,StringComparison.OrdinalIgnoreCase)))
                            throw new InvalidDataException("Menu connection changed during this plugin lifetime");
                        link=read;
                        validatedPointer=true;
                        var command=Volatile.Read(ref pending);
                        if(command!=null)
                        {
                            Interlocked.Exchange(ref processing,1);command=Interlocked.Exchange(ref pending,null);
                            try
                            {
                                long clock=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
                                long revision=Math.Max(clock,command.Expected+1);
                                if(command.RecoveryDigest!=null)AcousticSettingsStore.RecoverDefaults(link.WorkspaceRoot,link.SettingsPath,command.RecoveryDigest,command.Expected);
                                else AcousticSettingsStore.SaveExpected(link.WorkspaceRoot,link.SettingsPath,command.Desired.WithRevision(revision),command.Expected);
                            }
                            catch(InvalidDataException){failure="Preferences changed or are invalid. Current saved values were retained; review and apply again.";}
                            catch(IOException){failure="Preferences are unavailable or busy. Existing files were preserved.";}
                            catch(UnauthorizedAccessException){failure="Preferences could not be saved. Existing files were preserved.";}
                            finally{Interlocked.Exchange(ref processing,0);}
                        }
                        stage="preferences-path";string validatedPath=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,link.SettingsPath);
                        bool existed=File.Exists(validatedPath);string preferenceText=null;
                        if(existed){stage="preferences-read";preferenceText=AcousticSettingsStore.ReadBounded(validatedPath,4096);}
                        stage="preferences-schema";
                        AcousticSettings settings=existed?AcousticSettings.Parse(preferenceText):AcousticSettings.Defaults(1);
                        long saved=existed?settings.Revision:0;
                        stage="host-status";string status=null,target=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,AcousticSettingsStore.StatusPath(link.SettingsPath));
                        if(File.Exists(target))try{status=AcousticSettingsStore.ReadBounded(target,16384);}catch(IOException){}catch(ArgumentException){}
                        Interlocked.Exchange(ref snapshot,new InGameSettingsSnapshot(settings,status,failure,true,link.ToggleKey,link.ControllerEnabled,saved,Volatile.Read(ref pending)!=null,false,null,new MenuDiagnostic("preferences",existed?"loaded":"defaults-unsaved")));
                        if(command!=null)Interlocked.Exchange(ref operationInFlight,0);
                    }
                    catch(Exception e)
                    {
                        Interlocked.Exchange(ref pending,null);Interlocked.Exchange(ref processing,0);
                        var old=Snapshot;
                        string digest=null;bool recovery=false;
                        if(validatedPointer)try{recovery=AcousticSettingsStore.TryMalformedRecovery(link.WorkspaceRoot,link.SettingsPath,out digest);}catch{}
                        string message=recovery?"Saved preferences are invalid. Reset Defaults can preserve a backup and recover this file.":
                            "RichAudio menu preferences are unavailable or use an unsupported format. Existing files were preserved.";
                        diagnostic=diagnostic??MenuDiagnostic.Failure(stage,e);
                        message="Preferences unavailable: "+diagnostic.Summary+(recovery?". Reset preserves backup.":". Files preserved.");
                        Interlocked.Exchange(ref snapshot,new InGameSettingsSnapshot(old.Settings,null,message,false,
                            link==null?"F10":link.ToggleKey,link==null||link.ControllerEnabled,old.SavedRevision,false,recovery,digest,diagnostic));
                        Interlocked.Exchange(ref operationInFlight,0);
                    }
                    while(Volatile.Read(ref stopped)==0&&cadence.ElapsedMilliseconds<250)wake.WaitOne(Math.Max(1,250-(int)cadence.ElapsedMilliseconds));
                }
            }
            finally{Interlocked.Exchange(ref pending,null);Interlocked.Exchange(ref processing,0);Interlocked.Exchange(ref operationInFlight,0);wake.Dispose();}
        }
        // The RPH unload callback uses RequestStop immediately and schedules this
        // bounded join off the game fiber after detaching input/drawing handlers.
        public void Dispose(){RequestStop();var worker=thread;if(worker!=null&&worker!=Thread.CurrentThread)worker.Join(1000);}
    }
}
