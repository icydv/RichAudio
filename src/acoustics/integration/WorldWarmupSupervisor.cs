// Preparation worker only. No native audio, telemetry, game mutation or endpoint.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
namespace RichAudio.Preparation {
 [DataContract] public sealed class WarmupBinding {
  [DataMember] public string RelativePath;
  [DataMember] public string SHA256;
 }
 [DataContract] public sealed class WarmupConfiguration {
  [DataMember] public int Schema;
  [DataMember] public bool Enabled;
  [DataMember] public string WorkspaceRoot;
  [DataMember] public string GameRoot;
  [DataMember] public string GameExecutableSHA256;
  [DataMember] public string CodeWalkerRoot;
  [DataMember] public string CodeWalkerCoreSHA256;
  [DataMember] public string PowerShellPath;
  [DataMember] public string PowerShellSHA256;
  [DataMember] public string OutputRoot;
  [DataMember] public WarmupBinding[] Sources;
  [DataMember] public int MaximumSeconds;
  [DataMember] public int MaximumStageSeconds;
  [DataMember] public int MaximumMemoryMiB;
  [DataMember] public int MaximumGeometryResources;
  [DataMember] public bool ImportQualifiedGeometry;
 }
 public sealed class WorldWarmupSupervisor {
  readonly ManualResetEvent stop=new ManualResetEvent(false);
  volatile string state="not-started";
  int used;
  public string State { get { return state; } }
  // RPH can load the DLL from its cache. Configuration remains beside the
  // installed plugin in the game's Plugins directory, not beside that copy.
  public static string ConfigurationForGameExecutable(string executable){return Path.Combine(Path.GetDirectoryName(Path.GetFullPath(executable)),"Plugins","RichAudio.WorldWarmup.json");}
  public void Start(string configurationPath,string currentGameExecutable) {
   if(Interlocked.Exchange(ref used,1)!=0)return;
   state="queued";
   ThreadPool.QueueUserWorkItem(delegate { Run(configurationPath,currentGameExecutable); });
  }
  // No file IO or join on the game fiber. The worker cooperatively cancels,
  // then closes its owned Windows job after a bounded cleanup grace period.
  public void Stop(){stop.Set();}
  public static string Hash(string filename) {
   using(var stream=File.OpenRead(filename))using(var sha=SHA256.Create())
    return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
  }
  static bool Same(string a,string b){return String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
  static string Full(string value){if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value))throw new InvalidDataException("absolute-path");return Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);}
  static string Inside(string root,string relative) {
   if(String.IsNullOrWhiteSpace(relative)||Path.IsPathRooted(relative))throw new InvalidDataException("relative-path");
   string value=Path.GetFullPath(Path.Combine(root,relative));
   if(!value.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("path-boundary");
   return value;
  }
  static void NoLinks(string filename) {
   for(string p=filename;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p))
    if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("linked-path");
  }
  static void Bound(string filename,string expected){NoLinks(filename);if(expected==null||expected.Length!=64||!Same(Hash(filename),expected))throw new InvalidDataException("input-binding");}
  public static WarmupConfiguration ReadConfiguration(string filename,string currentGameExecutable) {
   NoLinks(filename);var info=new FileInfo(filename);if(info.Length>65536)throw new InvalidDataException("config-size");
   WarmupConfiguration c;using(var stream=File.OpenRead(filename))c=(WarmupConfiguration)new DataContractJsonSerializer(typeof(WarmupConfiguration)).ReadObject(stream);
   if(c.Schema!=1)throw new InvalidDataException("config-schema");if(!c.Enabled)return c;
   string root=Full(c.WorkspaceRoot),game=Full(c.GameRoot),current=Full(currentGameExecutable),cw=Full(c.CodeWalkerRoot);
   if(!Same(Path.GetFileName(current),"GTA5_Enhanced.exe")||!Same(Path.GetDirectoryName(current),game))throw new InvalidDataException("game-binding");
   Bound(current,c.GameExecutableSHA256);Bound(Path.Combine(cw,"CodeWalker.Core.dll"),c.CodeWalkerCoreSHA256);
   if(!Same(Path.GetFileName(c.PowerShellPath),"pwsh.exe"))throw new InvalidDataException("powershell-host");Bound(Full(c.PowerShellPath),c.PowerShellSHA256);
   string output=Full(c.OutputRoot),local=Path.Combine(root,".local");
   if(!output.StartsWith(local+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||output.StartsWith(game+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Same(output,game))throw new InvalidDataException("private-output");
   NoLinks(output);
   if(c.MaximumSeconds<20||c.MaximumSeconds>3600||c.MaximumStageSeconds<5||c.MaximumStageSeconds>900||c.MaximumMemoryMiB<256||c.MaximumMemoryMiB>4096||c.MaximumGeometryResources<1||c.MaximumGeometryResources>128)throw new InvalidDataException("worker-budgets");
   if(c.Sources==null||c.Sources.Length<1||c.Sources.Length>256)throw new InvalidDataException("source-bindings");
   bool coordinator=false;var seen=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
   foreach(var binding in c.Sources){string source=Inside(root,binding.RelativePath);if(!seen.Add(source))throw new InvalidDataException("duplicate-source");Bound(source,binding.SHA256);if(Same(binding.RelativePath.Replace('/','\\'),"tools\\Prepare-InstalledAudioWorld.ps1"))coordinator=true;}
   if(!coordinator)throw new InvalidDataException("missing-coordinator-binding");return c;
  }
  static string Literal(string text){return "'"+text.Replace("'","''")+"'";}
  void Run(string filename,string gameExecutable) {
   OwnedJob job=null;Process worker=null;string output=null;
   try {
    if(stop.WaitOne(0)){state="cancelled";return;}
    if(!File.Exists(filename)){state="not-configured";return;}
    state="validating";var c=ReadConfiguration(filename,gameExecutable);if(!c.Enabled){state="disabled";return;}
    if(stop.WaitOne(0)){state="cancelled";return;}
    output=Full(c.OutputRoot);Directory.CreateDirectory(output);
    string cancel=Path.Combine(output,"cancel.request");
    if(File.Exists(cancel)){
     string marker=File.ReadAllText(cancel);Guid id;
     if(marker.StartsWith("plugin-startup:",StringComparison.Ordinal)&&Guid.TryParseExact(marker.Substring(15),"N",out id))
      File.Move(cancel,cancel+".acknowledged-"+Guid.NewGuid().ToString("N"));
     else {state="cancel-request-pending";return;}
    }
    string permit=Path.Combine(output,"hook-start-permit-"+Guid.NewGuid().ToString("N"));
    string command="$permit="+Literal(permit)+";$gate=[Diagnostics.Stopwatch]::StartNew();while(![IO.File]::Exists($permit)){if($gate.Elapsed.TotalSeconds -gt 10){throw 'Startup permit expired'};Start-Sleep -Milliseconds 10};& "+Literal(Path.Combine(c.WorkspaceRoot,"tools","Prepare-InstalledAudioWorld.ps1"))+" -GameRoot "+Literal(c.GameRoot)+" -CodeWalkerRoot "+Literal(c.CodeWalkerRoot)+" -OutputRoot "+Literal(output)+" -MaximumSeconds "+c.MaximumSeconds+" -MaximumStageSeconds "+c.MaximumStageSeconds+" -MaximumMemoryMiB "+c.MaximumMemoryMiB+" -MaximumGeometryResources "+c.MaximumGeometryResources+(c.ImportQualifiedGeometry?" -ImportQualifiedGeometry":"");
    var start=new ProcessStartInfo(c.PowerShellPath,"-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(command))){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=c.WorkspaceRoot};
    job=new OwnedJob((ulong)c.MaximumMemoryMiB*1024*1024);worker=Process.Start(start);job.Assign(worker);File.WriteAllText(permit,"owned-startup-job");
    state="preparing";var clock=Stopwatch.StartNew();bool stopping=false;double stopAt=0;
    while(!worker.HasExited) {
     if(!stopping&&(stop.WaitOne(100)||clock.Elapsed.TotalSeconds>=c.MaximumSeconds+3)){stopping=true;stopAt=clock.Elapsed.TotalSeconds;state=stop.WaitOne(0)?"cancelling":"deadline";File.WriteAllText(cancel,"plugin-startup:"+Guid.NewGuid().ToString("N"));}
     if(stopping&&clock.Elapsed.TotalSeconds-stopAt>=2)break;
     if(stopping)Thread.Sleep(50);worker.Refresh();
    }
    if(worker.HasExited){worker.WaitForExit();if(!stopping)state=worker.ExitCode==0?"preparation-finished-read-summary":"preparation-incomplete";}
   }catch(ThreadAbortException){state="unloaded";throw;}
   catch(Exception e){state="blocked-"+e.GetType().Name;}
   finally {
    if(job!=null)job.Dispose();
    if(worker!=null){try{if(!worker.HasExited)worker.Kill();worker.Dispose();}catch(Exception){}}
    if(state=="cancelling")state="cancelled";
    // Private evidence contains state only; detailed coordinator readiness lives
    // in preparation.json. Successful indexing never authorizes replacement.
    if(output!=null)try{File.WriteAllText(Path.Combine(output,"startup-hook-state.txt"),state);}catch(Exception){}
   }
  }
  sealed class OwnedJob : IDisposable {
   [StructLayout(LayoutKind.Sequential)] struct Basic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr Min,Max;public uint Processes;public UIntPtr Affinity;public uint Priority,Scheduling;}
   [StructLayout(LayoutKind.Sequential)] struct Io {public ulong R,W,O,RB,WB,OB;}
   [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
   [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int type,IntPtr value,uint length);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
   [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
   IntPtr handle;
   public OwnedJob(ulong memory){handle=CreateJobObject(IntPtr.Zero,null);if(handle==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();var data=new Extended();data.Basic.Flags=0x2000|0x8|0x200;data.Basic.Processes=16;data.JobMemory=new UIntPtr(memory);int size=Marshal.SizeOf(typeof(Extended));IntPtr p=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(data,p,false);if(!SetInformationJobObject(handle,9,p,(uint)size)){int error=Marshal.GetLastWin32Error();Dispose();throw new System.ComponentModel.Win32Exception(error);}}finally{Marshal.FreeHGlobal(p);}}
   public void Assign(Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new System.ComponentModel.Win32Exception();}
   public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
  }
 }
}
