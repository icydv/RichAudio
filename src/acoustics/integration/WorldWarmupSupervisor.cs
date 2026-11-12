// Preparation worker and advisory initial-pose writer. No native call, audio,
// game mutation or endpoint; Capture offers only copied in-memory values.
using System;
using System.Diagnostics;
using System.IO;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
namespace RichAudio.Preparation {
 [DataContract] sealed class InitialObservation01 {
  [DataMember(IsRequired=true)] public int Schema=1;
  [DataMember(IsRequired=true)] public string Kind="RichAudioInitialWorldObservation01";
  [DataMember(IsRequired=true)] public string GameExecutableSHA256,session,origin="normal-gameplay-observation",receivedUtc;
  [DataMember(IsRequired=true)] public long sequence,generation;
  [DataMember(IsRequired=true)] public double geometryTimeMs,sourceAgeMs;
  [DataMember(IsRequired=true)] public double[] listener;
  [DataMember(IsRequired=true)] public double[][] sources=new double[0][];
 }
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
  [DataMember(EmitDefaultValue=false)] public string NodeExecutable;
  [DataMember(EmitDefaultValue=false)] public string NodeSHA256;
  [DataMember(EmitDefaultValue=false)] public WarmupBinding[] CodeWalkerDependencies;
  [DataMember(EmitDefaultValue=false)] public int MaximumBatches;
  [DataMember(EmitDefaultValue=false)] public int MaximumTotalSeconds;
 }
 [DataContract] sealed class SupervisorStatus01 {
  [DataMember] public int Schema=1;
  [DataMember] public string RecordedUtc,State,Stage,InitialObservationState;
  [DataMember] public int Batch,MaximumBatches;
  [DataMember] public bool Running,WorkerJoined;
 }
 [DataContract] sealed class ContinuationCheckpoint01 {
  [DataMember] public int Schema {get;set;}
  [DataMember] public string Kind {get;set;}
  [DataMember] public string SupervisorBatchId {get;set;}
  [DataMember] public string RunId {get;set;}
  [DataMember] public string Reason {get;set;}
  [DataMember] public string InputFingerprint {get;set;}
  [DataMember] public string GameExecutableSHA256 {get;set;}
  [DataMember] public string CodeWalkerCoreSHA256 {get;set;}
  [DataMember] public string CatalogSHA256 {get;set;}
  [DataMember] public string ManifestSHA256 {get;set;}
  [DataMember] public string GeneratedUtc {get;set;}
  [DataMember] public bool Resumable {get;set;}
  [DataMember] public bool WorkerClosureVerified {get;set;}
  [DataMember] public bool UnknownClosure {get;set;}
  [DataMember] public int PendingResources {get;set;}
  [DataMember] public int FailedResources {get;set;}
  [DataMember] public int EligibleResources {get;set;}
 }
 [DataContract] sealed class ContinuationBinding01 {[DataMember] public string Fingerprint {get;set;}}
 public sealed class WorldWarmupSupervisor {
  readonly ManualResetEvent stop=new ManualResetEvent(false);
  volatile string state="not-started";
  string workflowStartedUtc;
  sealed class PriorityPose01 {internal string Session;internal long Sequence,Generation,Ticks;internal double[] Position;}
  sealed class PriorityBinding01 {internal string Output,GameSHA256;}
  readonly object priorityGate=new object();PriorityPose01 priorityPending;PriorityBinding01 priorityBinding;
  string prioritySession;bool priorityAccepted;int priorityWriter,priorityAttempts;long priorityNextAttempt;
  volatile string priorityState="waiting-valid-configuration";
  int used;
  OwnedJob activeJob;
  public string State { get { return state; } }
  public string StartedUtc { get { return workflowStartedUtc; } }
  public string InitialObservationState {get{return priorityState;}}
  // Capture offers memory only. No file operation, wait or host is involved.
  // A contended metadata lock simply withholds this advisory offer.
  public bool OfferInitialObservation01(string session,long sequence,long generation,long observedTicks,long clockFrequency,double[] position){
   if(stop.WaitOne(0)||clockFrequency!=Stopwatch.Frequency||sequence<0||sequence>9007199254740991L||generation<1||generation>9007199254740991L||session==null||!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z")||position==null||position.Length!=3)return false;
   foreach(double x in position)if(Double.IsNaN(x)||Double.IsInfinity(x)||Math.Abs(x)>100000)return false;
   long now=Stopwatch.GetTimestamp();if(observedTicks<0||(decimal)now-observedTicks>Stopwatch.Frequency/2m||(decimal)observedTicks-now>Stopwatch.Frequency/500m)return false;
   if(!Monitor.TryEnter(priorityGate))return false;
   try{
    if(stop.WaitOne(0)||priorityAccepted||priorityAttempts>=8||prioritySession!=null&&prioritySession!=session)return false;
    if(prioritySession==null)prioritySession=session;
    if(priorityPending==null||(decimal)now-priorityPending.Ticks>Stopwatch.Frequency/2m)priorityPending=new PriorityPose01{Session=session,Sequence=sequence,Generation=generation,Ticks=observedTicks,Position=(double[])position.Clone()};
   }finally{Monitor.Exit(priorityGate);}
   QueuePriority01();return true;
  }
  void QueuePriority01(){
   if(stop.WaitOne(0)||Volatile.Read(ref priorityBinding)==null||Stopwatch.GetTimestamp()<Interlocked.Read(ref priorityNextAttempt))return;
   if(Interlocked.CompareExchange(ref priorityWriter,1,0)==0)ThreadPool.QueueUserWorkItem(delegate{WritePriority01();});
  }
  static bool ExistingPriority01(string target,PriorityPose01 pose,string gameSHA,string epoch){
   if(!File.Exists(target))return false;NoLinks(target);if(new FileInfo(target).Length>8192)return false;InitialObservation01 value;
   using(var stream=File.OpenRead(target))value=(InitialObservation01)new DataContractJsonSerializer(typeof(InitialObservation01)).ReadObject(stream);
   DateTimeOffset received,start;if(value==null||value.Schema!=1||value.Kind!="RichAudioInitialWorldObservation01"||value.GameExecutableSHA256!=gameSHA||value.session!=pose.Session||value.origin!="normal-gameplay-observation"||value.sequence<0||value.sequence>9007199254740991L||value.generation<1||value.generation>9007199254740991L||Double.IsNaN(value.geometryTimeMs)||Double.IsInfinity(value.geometryTimeMs)||value.geometryTimeMs<0||value.listener==null||value.listener.Length!=3||value.sources==null||value.sources.Length>2||Double.IsNaN(value.sourceAgeMs)||Double.IsInfinity(value.sourceAgeMs)||value.sourceAgeMs<0||value.sourceAgeMs>500||value.receivedUtc==null||!System.Text.RegularExpressions.Regex.IsMatch(value.receivedUtc,"\\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,7})?Z\\z")||!DateTimeOffset.TryParse(value.receivedUtc,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out received)||!DateTimeOffset.TryParse(epoch,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out start)||received<start.AddSeconds(-2)||received>DateTimeOffset.UtcNow.AddMilliseconds(250))return false;
   foreach(double x in value.listener)if(Double.IsNaN(x)||Double.IsInfinity(x)||Math.Abs(x)>100000)return false;
   foreach(var p in value.sources){if(p==null||p.Length!=3)return false;foreach(double x in p)if(Double.IsNaN(x)||Double.IsInfinity(x)||Math.Abs(x)>100000)return false;}return true;
  }
  void WritePriority01(){
   string pendingFile=null,lockPath=null;FileStream writerLock=null;PriorityPose01 pose=null;
   try{
    var binding=Volatile.Read(ref priorityBinding);if(binding==null||stop.WaitOne(0))return;
    lock(priorityGate){if(priorityAccepted||priorityAttempts>=8)return;pose=priorityPending;priorityPending=null;}
    if(pose==null)return;long now=Stopwatch.GetTimestamp();double age=(now-pose.Ticks)*1000d/Stopwatch.Frequency;
    if(age< -2||age>500){priorityState="stale-offer-withheld";return;}
    Interlocked.Increment(ref priorityAttempts);string target=Path.Combine(binding.Output,"geometry","initial-observation01.json");NoLinks(target);Directory.CreateDirectory(Path.GetDirectoryName(target));lockPath=target+".lock";
    writerLock=new FileStream(lockPath,FileMode.CreateNew,FileAccess.Write,FileShare.None);
    if(ExistingPriority01(target,pose,binding.GameSHA256,workflowStartedUtc)){lock(priorityGate){priorityAccepted=true;priorityPending=null;}priorityState=stop.WaitOne(0)?"cancelled":"existing-first-position-preserved";return;}
    pendingFile=target+".pending-"+Guid.NewGuid().ToString("N");
    age=(Stopwatch.GetTimestamp()-pose.Ticks)*1000d/Stopwatch.Frequency;
    var value=new InitialObservation01{GameExecutableSHA256=binding.GameSHA256,session=pose.Session,sequence=pose.Sequence,generation=pose.Generation,geometryTimeMs=pose.Ticks*1000d/Stopwatch.Frequency,sourceAgeMs=Math.Max(0,age),listener=pose.Position,receivedUtc=DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture)};
    using(var stream=new FileStream(pendingFile,FileMode.CreateNew,FileAccess.Write,FileShare.None))new DataContractJsonSerializer(typeof(InitialObservation01)).WriteObject(stream,value);
    // Recheck original acquisition after directory/lock/serialization work.
    // Stop cannot preempt an OS rename already executing; it prevents any
    // queued offer from entering this commit after cancellation is observed.
    now=Stopwatch.GetTimestamp();age=(now-pose.Ticks)*1000d/Stopwatch.Frequency;
    if(stop.WaitOne(0)||age< -2||age>500){priorityState=stop.WaitOne(0)?"cancelled":"stale-offer-withheld";return;}
    if(File.Exists(target))File.Replace(pendingFile,target,null);else File.Move(pendingFile,target);pendingFile=null;
    lock(priorityGate){priorityAccepted=true;priorityPending=null;}priorityState=stop.WaitOne(0)?"cancelled":"initial-position-retained";
   }catch(Exception){priorityState=stop.WaitOne(0)?"cancelled":priorityAttempts>=8?"bounded-priority-write-failed":"priority-write-deferred";Interlocked.Exchange(ref priorityNextAttempt,Stopwatch.GetTimestamp()+Stopwatch.Frequency);}
   finally{if(pendingFile!=null)try{File.Delete(pendingFile);}catch(Exception){}if(writerLock!=null){writerLock.Dispose();try{File.Delete(lockPath);}catch(Exception){}}Interlocked.Exchange(ref priorityWriter,0);}
  }
  // RPH can load the DLL from its cache. Configuration remains beside the
  // installed plugin in the game's Plugins directory, not beside that copy.
  public static string ConfigurationForGameExecutable(string executable){return Path.Combine(Path.GetDirectoryName(Path.GetFullPath(executable)),"Plugins","RichAudio.WorldWarmup.json");}
  public void Start(string configurationPath,string currentGameExecutable) {
   if(Interlocked.Exchange(ref used,1)!=0)return;
   workflowStartedUtc=DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture);
   state="queued";
   ThreadPool.QueueUserWorkItem(delegate { Run(configurationPath,currentGameExecutable); });
  }
  // No file IO or join on the game fiber. The worker cooperatively cancels,
  // then closes its owned Windows job after a bounded cleanup grace period.
  public void Stop(){stop.Set();priorityState="cancelled";}
  // A framework unload can abort managed workers before cooperative cleanup.
  // Closing the safe job handle needs no worker join or filesystem operation.
  public void AbortAndCloseContainment(){Stop();var owned=Volatile.Read(ref activeJob);if(owned!=null)owned.Dispose();}
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
   if(c.CodeWalkerDependencies!=null){if(c.CodeWalkerDependencies.Length!=3)throw new InvalidDataException("parser-dependency-count");var names=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var b in c.CodeWalkerDependencies){if(b==null||b.RelativePath==null||(b.RelativePath!="CodeWalker.Core.dll"&&b.RelativePath!="SharpDX.dll"&&b.RelativePath!="SharpDX.Mathematics.dll")||!names.Add(b.RelativePath))throw new InvalidDataException("parser-dependency-binding");Bound(Inside(cw,b.RelativePath),b.SHA256);}}
   if(c.NodeExecutable!=null||c.NodeSHA256!=null){string node=Full(c.NodeExecutable);if(!Same(node,Inside(root,"runtime/node.exe")))throw new InvalidDataException("bundled-node-path");Bound(node,c.NodeSHA256);}
   if(!Same(Path.GetFileName(c.PowerShellPath),"pwsh.exe"))throw new InvalidDataException("powershell-host");Bound(Full(c.PowerShellPath),c.PowerShellSHA256);
   string output=Full(c.OutputRoot),local=Path.Combine(root,".local");
   if(!output.StartsWith(local+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||output.StartsWith(game+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Same(output,game))throw new InvalidDataException("private-output");
   NoLinks(output);
   if(c.MaximumSeconds<20||c.MaximumSeconds>3600||c.MaximumStageSeconds<5||c.MaximumStageSeconds>1800||c.MaximumMemoryMiB<256||c.MaximumMemoryMiB>4096||c.MaximumGeometryResources<1||c.MaximumGeometryResources>262144)throw new InvalidDataException("worker-budgets");
   if(c.MaximumBatches!=0||c.MaximumTotalSeconds!=0){if(c.MaximumBatches<1||c.MaximumBatches>4||c.MaximumTotalSeconds<20||c.MaximumTotalSeconds>7200||c.MaximumSeconds>1800||c.MaximumTotalSeconds<c.MaximumSeconds)throw new InvalidDataException("continuation-budgets");}
   if(c.Sources==null||c.Sources.Length<1||c.Sources.Length>256)throw new InvalidDataException("source-bindings");
   bool coordinator=false;var seen=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
   foreach(var binding in c.Sources){string source=Inside(root,binding.RelativePath);if(!seen.Add(source))throw new InvalidDataException("duplicate-source");Bound(source,binding.SHA256);if(Same(binding.RelativePath.Replace('/','\\'),"tools\\Prepare-InstalledAudioWorld.ps1"))coordinator=true;}
   if(!coordinator)throw new InvalidDataException("missing-coordinator-binding");return c;
  }
  static string Literal(string text){return "'"+text.Replace("'","''")+"'";}
  void PublishStatus(string output,int batch,int batches,bool running,bool joined) {
   try{var value=new SupervisorStatus01{RecordedUtc=DateTime.UtcNow.ToString("o"),State=state,InitialObservationState=priorityState,Stage=running?(File.Exists(Path.Combine(output,"geometry","summary.json"))?"building":"preparing/indexing"):state,Batch=batch,MaximumBatches=batches,Running=running,WorkerJoined=joined};
    string target=Path.Combine(output,"supervisor-status.json"),temporary=target+".next";
    using(var stream=File.Create(temporary))new DataContractJsonSerializer(typeof(SupervisorStatus01)).WriteObject(stream,value);
    if(File.Exists(target))File.Replace(temporary,target,null);else File.Move(temporary,target);
   }catch(Exception){}
  }
  static bool CanContinue(WarmupConfiguration c,string output,string batchId,DateTime began) {
   try{
    string filename=Path.Combine(output,"continuation-checkpoint.json");NoLinks(filename);if(!File.Exists(filename)||new FileInfo(filename).Length>16384)return false;
    ContinuationCheckpoint01 p;using(var stream=File.OpenRead(filename))p=(ContinuationCheckpoint01)new DataContractJsonSerializer(typeof(ContinuationCheckpoint01)).ReadObject(stream);
    Guid run;DateTime generated;
    if(p.Schema!=1||p.Kind!="RichAudioWorldContinuation01"||p.SupervisorBatchId!=batchId||!Guid.TryParseExact(p.RunId,"N",out run)||p.Reason!="budget-deadline"||!p.Resumable||!p.WorkerClosureVerified||p.UnknownClosure||p.PendingResources<=p.FailedResources||p.FailedResources<0||p.EligibleResources<p.PendingResources||p.EligibleResources>262144||!Same(p.GameExecutableSHA256,c.GameExecutableSHA256)||!Same(p.CodeWalkerCoreSHA256,c.CodeWalkerCoreSHA256)||!DateTime.TryParse(p.GeneratedUtc,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out generated)||generated.ToUniversalTime()<began||generated.ToUniversalTime()>DateTime.UtcNow.AddSeconds(1)||File.Exists(Path.Combine(output,"cancel.request")))return false;
    string bindingPath=Path.Combine(output,"input-binding.json");NoLinks(bindingPath);if(new FileInfo(bindingPath).Length>67108864)return false;
    ContinuationBinding01 binding;using(var stream=File.OpenRead(bindingPath))binding=(ContinuationBinding01)new DataContractJsonSerializer(typeof(ContinuationBinding01)).ReadObject(stream);
    if(p.InputFingerprint==null||p.InputFingerprint.Length!=64||!Same(binding.Fingerprint,p.InputFingerprint))return false;
    Bound(Path.Combine(output,"resolved","resolved-catalog.json"),p.CatalogSHA256);Bound(Path.Combine(output,"geometry","manifest.json"),p.ManifestSHA256);return true;
   }catch(Exception){return false;}
  }
  void Run(string filename,string gameExecutable) {
   OwnedJob job=null;Process worker=null;string output=null;int batch=0,batches=1;bool joined=false;
   try {
    if(stop.WaitOne(0)){state="cancelled";return;}
    if(!File.Exists(filename)){state="not-configured";priorityState="configuration-not-found";return;}
    state="validating";var c=ReadConfiguration(filename,gameExecutable);string configurationSHA256=Hash(filename);if(!c.Enabled){state="disabled";priorityState="configuration-disabled";return;}
    if(stop.WaitOne(0)){state="cancelled";return;}
    output=Full(c.OutputRoot);Directory.CreateDirectory(output);
    Volatile.Write(ref priorityBinding,new PriorityBinding01{Output=output,GameSHA256=c.GameExecutableSHA256});QueuePriority01();
    string cancel=Path.Combine(output,"cancel.request");
    if(File.Exists(cancel)){
     string marker=File.ReadAllText(cancel);Guid id;
     if(marker.StartsWith("plugin-startup:",StringComparison.Ordinal)&&Guid.TryParseExact(marker.Substring(15),"N",out id))
      File.Move(cancel,cancel+".acknowledged-"+Guid.NewGuid().ToString("N"));
     else {state="cancel-request-pending";return;}
    }
    batches=c.MaximumBatches==0?1:c.MaximumBatches;int totalSeconds=c.MaximumTotalSeconds==0?c.MaximumSeconds+3:c.MaximumTotalSeconds;var total=Stopwatch.StartNew();double lastPublication=-1000;
    while(batch<batches){
     if(stop.WaitOne(0)){state="cancelled";break;}if(File.Exists(cancel)){state="cancel-request-pending";break;}
     // Every resumed worker is validated again, after the preceding job is
     // observed empty. No source or executable pin can drift between batches.
     if(batch>0){state="validating-continuation";Bound(filename,configurationSHA256);c=ReadConfiguration(filename,gameExecutable);}
     if(stop.WaitOne(0)){state="cancelled";break;}if(File.Exists(cancel)){state="cancel-request-pending";break;}
     int budget=Math.Min(c.MaximumSeconds,(int)Math.Ceiling(totalSeconds-total.Elapsed.TotalSeconds));if(budget<20){state="total-budget-exhausted";break;}
     batch++;joined=false;string batchId=Guid.NewGuid().ToString("N"),permit=Path.Combine(output,"hook-start-permit-"+batchId);DateTime began=DateTime.UtcNow;
     string command="$permit="+Literal(permit)+";$gate=[Diagnostics.Stopwatch]::StartNew();while(![IO.File]::Exists($permit)){if($gate.Elapsed.TotalSeconds -gt 10){throw 'Startup permit expired'};Start-Sleep -Milliseconds 10};& "+Literal(Path.Combine(c.WorkspaceRoot,"tools","Prepare-InstalledAudioWorld.ps1"))+" -GameRoot "+Literal(c.GameRoot)+" -CodeWalkerRoot "+Literal(c.CodeWalkerRoot)+" -OutputRoot "+Literal(output)+" -MaximumSeconds "+budget+" -MaximumStageSeconds "+Math.Min(c.MaximumStageSeconds,budget)+" -MaximumMemoryMiB "+c.MaximumMemoryMiB+" -MaximumGeometryResources "+c.MaximumGeometryResources+(c.ImportQualifiedGeometry?" -ImportQualifiedGeometry":"");
     var start=new ProcessStartInfo(c.PowerShellPath,"-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(command))){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=c.WorkspaceRoot};
     if(c.NodeExecutable!=null)start.EnvironmentVariables["PATH"]=Path.GetDirectoryName(c.NodeExecutable)+Path.PathSeparator+(start.EnvironmentVariables["PATH"]??"");
     start.EnvironmentVariables["RICHAUDIO_WORLD_BATCH_ID"]=batchId;
     start.EnvironmentVariables["RICHAUDIO_WORLD_START_UTC"]=workflowStartedUtc??DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture);
     job=new OwnedJob((ulong)c.MaximumMemoryMiB*1024*1024);Volatile.Write(ref activeJob,job);
     if(stop.WaitOne(0)){job.Dispose();state="cancelled";break;}
     worker=job.StartContained(start);
     if(stop.WaitOne(0)){state="cancelled";break;}
     File.WriteAllText(permit,"owned-startup-job");
     state="preparing";var clock=Stopwatch.StartNew();bool stopping=false;double stopAt=0;
     while(!worker.HasExited) {
      if(total.Elapsed.TotalMilliseconds-lastPublication>=1000){PublishStatus(output,batch,batches,true,false);lastPublication=total.Elapsed.TotalMilliseconds;}
      if(!stopping&&(stop.WaitOne(100)||clock.Elapsed.TotalSeconds>=budget+3||total.Elapsed.TotalSeconds>=totalSeconds)){stopping=true;stopAt=clock.Elapsed.TotalSeconds;state=stop.WaitOne(0)?"cancelling":"deadline";File.WriteAllText(cancel,"plugin-startup:"+Guid.NewGuid().ToString("N"));}
      if(stopping&&clock.Elapsed.TotalSeconds-stopAt>=2)break;
      if(stopping)Thread.Sleep(50);worker.Refresh();
     }
     bool exited=worker.HasExited;int exitCode=-1;if(exited){worker.WaitForExit();exitCode=worker.ExitCode;}
     joined=job.TerminateAndJoin(2000);job.Dispose();job=null;Volatile.Write(ref activeJob,null);
     if(!exited)worker.WaitForExit(2000);worker.Dispose();worker=null;
     if(!joined){state="worker-closure-unverified";break;}
     if(stopping){if(state=="cancelling")state="cancelled";break;}
     if(batch<batches&&!stop.WaitOne(0)&&total.Elapsed.TotalSeconds<totalSeconds&&CanContinue(c,output,batchId,began)){state="continuing-pending-geometry";continue;}
     state=exitCode==0?"preparation-finished-read-summary":"preparation-incomplete";break;
    }
   }catch(ThreadAbortException){state="unloaded";throw;}
   catch(Exception e){state=stop.WaitOne(0)?"cancelled":"blocked-"+e.GetType().Name;}
   finally {
    if(job!=null){try{joined=job.TerminateAndJoin(2000);}catch(Exception){}job.Dispose();}
    Volatile.Write(ref activeJob,null);
    if(worker!=null){try{if(!worker.HasExited)worker.Kill();worker.Dispose();}catch(Exception){}}
    if(state=="cancelling")state="cancelled";
    // Private evidence contains state only; detailed coordinator readiness lives
    // in preparation.json. Successful indexing never authorizes replacement.
    if(output!=null){PublishStatus(output,batch,batches,false,joined);try{File.WriteAllText(Path.Combine(output,"startup-hook-state.txt"),state);}catch(Exception){}}
   }
  }
  sealed class OwnedJob : IDisposable {
   [StructLayout(LayoutKind.Sequential)] struct Basic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr Min,Max;public uint Processes;public UIntPtr Affinity;public uint Priority,Scheduling;}
   [StructLayout(LayoutKind.Sequential)] struct Io {public ulong R,W,O,RB,WB,OB;}
   [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
   [StructLayout(LayoutKind.Sequential)] struct Accounting {public long User,Kernel,PeriodUser,PeriodKernel;public uint PageFaults,TotalProcesses,ActiveProcesses,TerminatedProcesses;}
   [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(JobHandle job,int type,IntPtr value,uint length);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(JobHandle job,IntPtr process);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateJobObject(JobHandle job,uint exitCode);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool QueryInformationJobObject(JobHandle job,int kind,IntPtr value,uint length,IntPtr returned);
   [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
   sealed class JobHandle:Microsoft.Win32.SafeHandles.SafeHandleZeroOrMinusOneIsInvalid {
    internal JobHandle(IntPtr value):base(true){SetHandle(value);}protected override bool ReleaseHandle(){return CloseHandle(handle);}
   }
   readonly JobHandle handle;
   [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup{public uint Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,CharsX,CharsY,Fill,Flags;public ushort Show,ReservedBytes;public IntPtr ReservedData,Input,Output,Error;}
   [StructLayout(LayoutKind.Sequential)]struct Created{public IntPtr Process,Thread;public uint Pid,Tid;}
   [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Created created);
   [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
   [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateProcess(IntPtr process,uint code);
   [DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr value,uint milliseconds);
   public OwnedJob(ulong memory){handle=new JobHandle(CreateJobObject(IntPtr.Zero,null));if(handle.IsInvalid)throw new System.ComponentModel.Win32Exception();var data=new Extended();data.Basic.Flags=0x2000|0x8|0x200;data.Basic.Processes=16;data.JobMemory=new UIntPtr(memory);int size=Marshal.SizeOf(typeof(Extended));IntPtr p=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(data,p,false);if(!SetInformationJobObject(handle,9,p,(uint)size)){int error=Marshal.GetLastWin32Error();Dispose();throw new System.ComponentModel.Win32Exception(error);}}finally{Marshal.FreeHGlobal(p);}}
   public Process StartContained(ProcessStartInfo info){
    if(handle.IsClosed||info.UseShellExecute||info.RedirectStandardInput||info.RedirectStandardOutput||info.RedirectStandardError)throw new InvalidOperationException("contained preparation startup");
    if(String.IsNullOrWhiteSpace(info.FileName)||info.FileName.IndexOf('"')>=0)throw new ArgumentException("literal preparation executable");
    var environment=new System.Collections.Generic.SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    foreach(string key in info.EnvironmentVariables.Keys)environment[key]=info.EnvironmentVariables[key];
    var block=new StringBuilder();foreach(var pair in environment)block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');block.Append('\0');
    IntPtr environmentBlock=Marshal.StringToHGlobalUni(block.ToString());Created child=new Created();Process observed=null;bool returned=false;
    try{
     var startup=new Startup{Size=(uint)Marshal.SizeOf(typeof(Startup)),Flags=1,Show=0};
     if(!CreateProcess(info.FileName,new StringBuilder("\""+info.FileName+"\" "+info.Arguments),IntPtr.Zero,IntPtr.Zero,false,0x4|0x400|0x08000000,environmentBlock,info.WorkingDirectory,ref startup,out child))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
     if(!AssignProcessToJobObject(handle,child.Process))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
     observed=Process.GetProcessById((int)child.Pid);if(observed.Handle==IntPtr.Zero)throw new InvalidOperationException("preparation process handle unavailable");
     if(ResumeThread(child.Thread)==UInt32.MaxValue)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
     returned=true;return observed;
    }finally{
     if(!returned&&child.Process!=IntPtr.Zero){TerminateProcess(child.Process,1);WaitForSingleObject(child.Process,1000);if(observed!=null)observed.Dispose();}
     if(child.Thread!=IntPtr.Zero)CloseHandle(child.Thread);if(child.Process!=IntPtr.Zero)CloseHandle(child.Process);Marshal.FreeHGlobal(environmentBlock);
    }
   }
   public void Assign(Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new System.ComponentModel.Win32Exception();}
   public bool TerminateAndJoin(int milliseconds){if(!TerminateJobObject(handle,1))return false;int size=Marshal.SizeOf(typeof(Accounting));IntPtr data=Marshal.AllocHGlobal(size);var clock=Stopwatch.StartNew();try{do{if(!QueryInformationJobObject(handle,1,data,(uint)size,IntPtr.Zero))return false;if(((Accounting)Marshal.PtrToStructure(data,typeof(Accounting))).ActiveProcesses==0)return true;Thread.Sleep(10);}while(clock.ElapsedMilliseconds<milliseconds);return false;}finally{Marshal.FreeHGlobal(data);}}
   public void Dispose(){handle.Dispose();}
  }
 }
}
