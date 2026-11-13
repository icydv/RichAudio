using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace RichAudio.GateA.Private01.Supervision {
 public sealed class RestorationCheck {
  public string Path {get;set;}public string Sha256 {get;set;}public long Bytes {get;set;}public bool Absent {get;set;}
 }
 public sealed class SupervisorConfiguration {
  public long FixedHardDeadlineQpc {get;set;}public string ExecutionManifestPath {get;set;}public string ExecutionManifestSha256 {get;set;}
  public ExactIdentity ExpectedIdentity {get;set;}public long FailureQpc {get;set;}public string FailureReason {get;set;}
  public int Schema {get;set;}public string Session {get;set;}public string Mode {get;set;}
  public int ProcessId {get;set;}public long ProcessStartUtcTicks {get;set;}public string Executable {get;set;}public string ExecutableSha256 {get;set;}
  public string EvidenceRoot {get;set;}public bool ShowUi {get;set;}
  public int MaximumLifetimeMs {get;set;}public int ExitLeadMs {get;set;}public int ExitGraceMs {get;set;}public int HeartbeatTimeoutMs {get;set;}public int StartupTimeoutMs {get;set;}public int AcknowledgeTimeoutMs {get;set;}
  public RestorationCheck[] Restoration {get;set;}
 }
 public static class SupervisorFiles {
  public static string Hash(string path){using(var s=File.OpenRead(path))using(var h=SHA256.Create())return Hex(h.ComputeHash(s));}
  public static string Hex(byte[] bytes){return BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();}
  public static void NoLinks(string path){for(string p=Path.GetFullPath(path);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p))if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("linked supervision path");}
  public static bool RestorationVerified(RestorationCheck[] checks){
   if(checks==null||checks.Length==0)return false;
   foreach(var check in checks){NoLinks(check.Path);if(check.Absent){if(File.Exists(check.Path)||Directory.Exists(check.Path))return false;}
    else if(!File.Exists(check.Path)||new FileInfo(check.Path).Length!=check.Bytes||!String.Equals(Hash(check.Path),check.Sha256,StringComparison.OrdinalIgnoreCase))return false;}
   return true;
  }
 }
 sealed class EvidenceJournal:IDisposable {
  readonly FileStream file;readonly string statusPath;readonly JavaScriptSerializer json=new JavaScriptSerializer();readonly ConcurrentQueue<object> queue=new ConcurrentQueue<object>();readonly AutoResetEvent wake=new AutoResetEvent(false);readonly Thread worker;object latestStatus;long ordinal;int pending;volatile bool closing;internal volatile string Error;string previous=new string('0',64);
  internal EvidenceJournal(string path){file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read);statusPath=Path.Combine(Path.GetDirectoryName(path),"status.json");worker=new Thread(Run){IsBackground=true,Name="RichAudio independent evidence writer"};worker.Start();}
  internal void Append(string kind,object detail){
   if(Error!=null||closing)throw new IOException("evidence writer unavailable");if(Interlocked.Increment(ref pending)>256){Interlocked.Decrement(ref pending);throw new IOException("evidence queue full");}
   queue.Enqueue(new{ordinal=Interlocked.Increment(ref ordinal),qpc=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),kind=kind,detail=detail});wake.Set();
  }
  internal void PublishStatus(object value){Interlocked.Exchange(ref latestStatus,value);wake.Set();}
  void Run(){try{while(!closing||Volatile.Read(ref pending)>0||Volatile.Read(ref latestStatus)!=null){object value;if(queue.TryDequeue(out value)){string payload=json.Serialize(value);string digest;using(var hash=SHA256.Create())digest=SupervisorFiles.Hex(hash.ComputeHash(Encoding.UTF8.GetBytes(previous+"\n"+payload)));byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(new{previous=previous,sha256=digest,payload=payload})+"\n");file.Write(bytes,0,bytes.Length);file.Flush(true);previous=digest;Interlocked.Decrement(ref pending);}else{value=Interlocked.Exchange(ref latestStatus,null);if(value==null){wake.WaitOne(50);continue;}string next=statusPath+".next";File.WriteAllText(next,json.Serialize(value));if(File.Exists(statusPath))File.Replace(next,statusPath,null);else File.Move(next,statusPath);}}}catch(Exception e){Error=e.GetType().Name;}finally{file.Dispose();}}
  internal bool FlushBounded(int ms){var watch=Stopwatch.StartNew();while(Volatile.Read(ref pending)>0&&Error==null&&watch.ElapsedMilliseconds<ms)Thread.Sleep(10);return Error==null&&Volatile.Read(ref pending)==0;}
  public void Dispose(){closing=true;wake.Set();if(worker.Join(1500))wake.Dispose();}
 }
 sealed class CommandMailbox {
  readonly ConcurrentQueue<string> values=new ConcurrentQueue<string>();int count,urgent;internal long Dropped;
  internal void Enqueue(string value){if(value=="stop"){Interlocked.Exchange(ref urgent,1);return;}if(value==null||value.Length>80||Interlocked.Increment(ref count)>64){if(value!=null&&value.Length<=80)Interlocked.Decrement(ref count);Interlocked.Increment(ref Dropped);return;}values.Enqueue(value);}
  internal bool TryDequeue(out string value){if(Interlocked.Exchange(ref urgent,0)!=0){value="stop";return true;}if(!values.TryDequeue(out value))return false;Interlocked.Decrement(ref count);return true;}
 }
 sealed class ConsoleNotice {
  readonly AutoResetEvent wake=new AutoResetEvent(false);string latest;
  internal ConsoleNotice(){new Thread(delegate(){while(true){wake.WaitOne();string text=Interlocked.Exchange(ref latest,null);if(text!=null)try{Console.WriteLine(text);}catch(IOException){}}}){IsBackground=true,Name="RichAudio nonblocking console notice"}.Start();}
  internal void Publish(string text){Interlocked.Exchange(ref latest,text);wake.Set();}
 }
 sealed class OperatorNotice {
  readonly CommandMailbox commands;readonly ManualResetEvent ready=new ManualResetEvent(false);volatile string text="Independent monitor starting. Use only normal game exit.";volatile bool stop,closed;
  internal OperatorNotice(CommandMailbox commands){this.commands=commands;}
  internal bool Start(){var thread=new Thread(Run){IsBackground=true,Name="RichAudio independent stop notice"};thread.SetApartmentState(ApartmentState.STA);thread.Start();return ready.WaitOne(3000);}
  internal void ShowStop(string value){text=value;stop=true;}
  internal void Close(){closed=true;}
  void Run(){
   using(var form=new Form{Text="RichAudio private experiment — independent monitor",Width=650,Height=280,TopMost=true,StartPosition=FormStartPosition.CenterScreen}){
    var label=new Label{Left=15,Top=15,Width=610,Height=130,Text=text};form.Controls.Add(label);
    var ack=new Button{Left=15,Top=155,Width=180,Text="I am exiting normally"};ack.Click+=delegate{commands.Enqueue("normal-exit-requested");};form.Controls.Add(ack);
    var hung=new Button{Left=210,Top=155,Width=180,Text="Normal quit is unresponsive"};hung.Click+=delegate{commands.Enqueue("quit-unresponsive");};form.Controls.Add(hung);
    var finish=new Button{Left=405,Top=155,Width=205,Text="Verify installation restoration"};finish.Click+=delegate{commands.Enqueue("verify-restoration");};form.Controls.Add(finish);
    var timer=new System.Windows.Forms.Timer{Interval=50};timer.Tick+=delegate{label.Text=text;if(stop){form.BackColor=System.Drawing.Color.MistyRose;form.Show();}if(closed){timer.Stop();form.Close();}};
    form.FormClosing+=delegate(object sender,FormClosingEventArgs e){if(!closed){e.Cancel=true;commands.Enqueue("stop");}};
    form.Shown+=delegate{ready.Set();};timer.Start();Application.Run(form);timer.Dispose();
   }
  }
 }
 public static class SupervisorMonitor {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static readonly CommandMailbox Input=new CommandMailbox();static int inputStarted;
  internal static CommandMailbox InputCommands(){if(Interlocked.Exchange(ref inputStarted,1)==0)new Thread(delegate(){try{string line;while((line=Console.ReadLine())!=null)Input.Enqueue(line.Trim());}catch(IOException){}}){IsBackground=true,Name="RichAudio single command reader"}.Start();return Input;}

  static void WriteNew(string path,object value){using(var f=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){var b=Encoding.UTF8.GetBytes(Json.Serialize(value));f.Write(b,0,b.Length);f.Flush(true);}}
  static void Validate(SupervisorConfiguration c){
   if(c==null||c.Schema!=1||c.ProcessId<=0||c.ProcessStartUtcTicks<=0||!Path.IsPathRooted(c.Executable)||!Path.IsPathRooted(c.EvidenceRoot)||(c.Mode!="offline-fixture"&&c.Mode!="candidate")||c.Mode=="candidate"&&!c.ShowUi)throw new InvalidDataException("explicit monitor configuration required");
   if(c.Mode=="candidate"){
    if(c.FixedHardDeadlineQpc<=0||!Path.IsPathRooted(c.ExecutionManifestPath)||!System.Text.RegularExpressions.Regex.IsMatch(c.ExecutionManifestSha256??"",@"\A[a-f0-9]{64}\z")||SupervisorFiles.Hash(c.ExecutionManifestPath)!=c.ExecutionManifestSha256)throw new InvalidDataException("candidate manifest binding required");
    var manifest=Json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(c.ExecutionManifestPath));
    if((string)manifest["session"]!=c.Session||(string)manifest["experiment"]!="GATE-A-SHVDNE-PRIVATE-03D")throw new InvalidDataException("candidate manifest session differs");
   }
   SupervisorNames.Name(c.Session,"guard");SupervisorFiles.NoLinks(c.Executable);SupervisorFiles.NoLinks(c.EvidenceRoot);
   if(c.Restoration==null||c.Restoration.Length<1||c.Restoration.Length>256)throw new InvalidDataException("bounded explicit restoration checks required");
   foreach(var check in c.Restoration)if(check==null||!Path.IsPathRooted(check.Path)||!check.Absent&&(check.Bytes<0||check.Sha256==null||!System.Text.RegularExpressions.Regex.IsMatch(check.Sha256,"\\A[a-fA-F0-9]{64}\\z")))throw new InvalidDataException("restoration check identity");
  }
  static object Snapshot(SupervisorPolicy p,bool restored,string journalError){return new{schema=1,sessionStartedQpc=p.Started,hardDeadlineQpc=p.HardDeadline,plannedStopQpc=p.PlannedStop,stopRequested=p.StopRequested,stopAtQpc=p.StopAt,stopReason=p.StopReason,exitDueQpc=p.ExitDue,notificationAcknowledged=p.NotificationAcknowledged,userNormalExitRequested=p.NormalExitRequested,probeStopAcknowledged=p.ProbeStopAcknowledged,probeStopUnacknowledged=p.ProbeStopUnacknowledged,vehiclesRetiredReported=p.VehiclesRetired,processExited=p.ProcessExited,processExitObservedQpc=p.ExitObservedAt,resourceUnload=p.ProcessExited?"process-ended; no separate resource-unload observation":"pending",installationRestored=restored,priorEffectiveProfileRestored="NOT_CLAIMED",exitDeadlineViolated=p.ExitDeadlineViolated,notificationOverdue=p.NotificationOverdue,quitUnresponsive=p.QuitUnresponsive,escalation=p.Escalation,journalError=journalError,forcedTerminationIssued=false,performance10ms="FAILED_UNCHANGED"};}
  static int RunAdmitted(string configurationPath){
   SupervisorFiles.NoLinks(configurationPath);if(new FileInfo(configurationPath).Length>131072)throw new InvalidDataException("bounded monitor config");
   var c=Json.Deserialize<SupervisorConfiguration>(File.ReadAllText(configurationPath));Validate(c);
   string directory=Path.Combine(c.EvidenceRoot,"runs",c.Session);Directory.CreateDirectory(Path.GetDirectoryName(directory));if(Directory.Exists(directory))throw new InvalidDataException("session evidence already exists; no reset/reuse");Directory.CreateDirectory(directory);
   File.Copy(configurationPath,Path.Combine(directory,"configuration.json"));WriteNew(Path.Combine(directory,"identity.json"),new{schema=1,configurationSha256=SupervisorFiles.Hash(configurationPath),monitorSha256=SupervisorFiles.Hash(System.Reflection.Assembly.GetExecutingAssembly().Location),session=c.Session,monitoredPid=c.ProcessId,monitoredStartUtcTicks=c.ProcessStartUtcTicks,monitoredExecutableSha256=c.ExecutableSha256,startedUtc=DateTime.UtcNow.ToString("o"),scope=c.Mode});
   var commands=InputCommands();var console=new ConsoleNotice();OperatorNotice notice=c.ShowUi?new OperatorNotice(commands):null;


   Console.CancelKeyPress+=delegate(object sender,ConsoleCancelEventArgs args){args.Cancel=true;commands.Enqueue("stop");};
   using(var process=Process.GetProcessById(c.ProcessId)){
    long validationQpc=Stopwatch.GetTimestamp(),validationUtc=DateTime.UtcNow.Ticks;
    var observed=ExactIdentity.Capture(c.ProcessId);
    var differences=new System.Collections.Generic.List<string>(ExactIdentity.Differences(c.ExpectedIdentity,observed));
    if(c.ExpectedIdentity!=null){
     if(c.ExpectedIdentity.ProcessId!=c.ProcessId)differences.Add("Configuration.ProcessId");
     if(c.ExpectedIdentity.CreationUtcTicks!=c.ProcessStartUtcTicks)differences.Add("Configuration.ProcessStartUtcTicks");
     if(!String.Equals(c.ExpectedIdentity.Executable,c.Executable,StringComparison.OrdinalIgnoreCase))differences.Add("Configuration.Executable");
     if(c.ExpectedIdentity.Sha256!=c.ExecutableSha256)differences.Add("Configuration.ExecutableSha256");
    }
    WriteNew(Path.Combine(directory,"identity-comparison.json"),new{schema=1,expected=c.ExpectedIdentity,observed=observed,configurationIdentity=new{pid=c.ProcessId,creationUtcTicks=c.ProcessStartUtcTicks,executable=c.Executable,sha256=c.ExecutableSha256},failedFields=differences,session=c.Session,configurationSha256=SupervisorFiles.Hash(configurationPath)});
    if(differences.Count!=0)throw new InvalidDataException("exact monitored process differs: "+String.Join(",",differences));

    long mappedQpc=Stopwatch.GetTimestamp(),mappedUtc=DateTime.UtcNow.Ticks;double ageMs;
    long processCreationQpc=SupervisorClock.MapProcessCreationQpc(c.ProcessStartUtcTicks,validationQpc,validationUtc,mappedQpc,mappedUtc,Stopwatch.Frequency,out ageMs);
    using(var stop=SupervisorNames.CreateEvent(c.Session,"stop",true))using(var pulse=SupervisorNames.CreateEvent(c.Session,"heartbeat",false))using(var failure=SupervisorNames.CreateEvent(c.Session,"failure",true))using(var retired=SupervisorNames.CreateEvent(c.Session,"retired",true))using(var stopped=SupervisorNames.CreateEvent(c.Session,"stopped",true))using(var binding=SupervisorNames.CreateEvent(c.Session,SupervisorNames.IdentityKind(c.ProcessId,c.ProcessStartUtcTicks),true))using(var activation=SupervisorNames.CreateActivation(c.Session))using(var guard=SupervisorNames.CreateGuard(c.Session))using(var journal=new EvidenceJournal(Path.Combine(directory,"events.jsonl"))){
     var policy=new SupervisorPolicy(processCreationQpc,Stopwatch.Frequency,c.MaximumLifetimeMs,c.ExitLeadMs,c.ExitGraceMs,c.HeartbeatTimeoutMs,c.StartupTimeoutMs,c.AcknowledgeTimeoutMs,c.FixedHardDeadlineQpc>0?c.FixedHardDeadlineQpc:long.MaxValue);
     bool notified=false,reportedExit=false,restored=false,verify=false;string lastEscalation=null,journalError=null;long nextStatus=0;
     Action<string,object> record=delegate(string kind,object detail){try{journal.Append(kind,detail);}catch(Exception e){journalError=e.GetType().Name;policy.RequestStop(Stopwatch.GetTimestamp(),"supervisor-evidence-failed");stop.Set();if(notice!=null)notice.ShowStop("STOP: supervision evidence failed. Exit GTA normally now. No forced termination is authorized.");}};
     try{
     if(notice!=null&&!notice.Start())throw new InvalidOperationException("independent visible notification window unavailable");
     if((Stopwatch.GetTimestamp()-processCreationQpc)*1000d/Stopwatch.Frequency>10000)throw new InvalidOperationException("late readiness after notice startup; no activation admitted");
     record("clock-origin",new{processCreationUtcTicks=c.ProcessStartUtcTicks,ageAtMappingMs=ageMs,mappedQpc=mappedQpc,mappedUtcTicks=mappedUtc,originQpc=processCreationQpc,maximumAttachAgeMs=10000,method="UTC age mapped once; QPC deadlines thereafter"});
     record("monitor-ready",Snapshot(policy,false,null));WriteNew(Path.Combine(directory,"ready.json"),new{schema=1,session=c.Session,monitor=ExactIdentity.Capture(Process.GetCurrentProcess().Id),monitored=observed,configurationSha256=SupervisorFiles.Hash(configurationPath)});binding.Set();console.Publish("MONITOR_READY session="+c.Session+"; fixed lifetime anchored to process creation; no attach/reload reset");
     while(true){
      long now=Stopwatch.GetTimestamp();bool alive;try{alive=!process.HasExited;}catch(Exception){alive=true;policy.RequestStop(now,"process-state-unavailable");}if(journal.Error!=null){journalError=journal.Error;policy.RequestStop(now,"supervisor-evidence-failed");}
      string command;for(int commandCount=0;commandCount<8&&commands.TryDequeue(out command);commandCount++){
       if(command=="ack-stop")policy.Acknowledge(now);else if(command=="normal-exit-requested"){policy.RequestStop(now,"user-normal-exit");policy.UserNormalExit(now);}else if(command=="quit-unresponsive")policy.ReportUnresponsive(now);else if(command=="stop")policy.RequestStop(now,"manual-stop");else if(command=="verify-restoration")verify=true;
       else{record("command-refused",command);continue;}record("user-command",command);
      }
      if(stopped.WaitOne(0))policy.ProbeStopAcknowledged=true;policy.Step(now,alive,pulse.WaitOne(0),failure.WaitOne(0),retired.WaitOne(0));
      if(policy.StopRequested&&!notified){
       // Revoke permission FIRST. Notification and persistence cannot postpone
       // the probe's stop signal, even when their own threads stall.
       stop.Set();notified=true;string message="STOP NOW: "+policy.StopReason+". Retire disposable vehicles only if normal callbacks remain usable. Exit GTA normally now. If quit is unresponsive, report it; no forced termination is authorized.";
       if(notice!=null)notice.ShowStop(message);console.Publish(message);record("stop-notified",Snapshot(policy,false,journalError));
      }
      if(policy.Escalation!=lastEscalation){lastEscalation=policy.Escalation;if(lastEscalation!=null){string message="ESCALATION: "+lastEscalation+". Stop all experiment actions. Use normal game exit; any forced termination needs specific separate authorization. Cleanup remains pending.";if(notice!=null)notice.ShowStop(message);console.Publish(message);record("escalation",Snapshot(policy,false,journalError));}}
      if(policy.ProcessExited&&!reportedExit){reportedExit=true;record("process-exit-observed",Snapshot(policy,false,journalError));console.Publish("PROCESS_EXIT_OBSERVED; installation restoration remains pending; use verify-restoration after restoring exact files.");}
      if(verify){verify=false;if(!policy.ProcessExited)record("restoration-check-refused","process still present");else{try{restored=SupervisorFiles.RestorationVerified(c.Restoration);}catch(Exception e){record("restoration-check-error",e.GetType().Name);}record("restoration-check",new{verified=restored});}}
      if(now>=nextStatus){nextStatus=now+Stopwatch.Frequency/10;journal.PublishStatus(Snapshot(policy,restored,journalError));}
      if(policy.ProcessExited&&restored){record("supervision-finished",Snapshot(policy,true,journalError));if(!journal.FlushBounded(1000))journalError=journal.Error??"evidence-drain-timeout";var result=Snapshot(policy,true,journalError);WriteNew(Path.Combine(directory,"result.json"),result);return policy.ExitDeadlineViolated||policy.NotificationOverdue||journalError!=null?2:0;}
      Thread.Sleep(20);
     }}finally{stop.Set();guard.ReleaseMutex();if(notice!=null)notice.Close();}
    }
   }
  }
  public static int Run(string path){
   try{return RunAdmitted(path);}catch(Exception error){
    long failed=Stopwatch.GetTimestamp();Console.Error.WriteLine("SUPERVISION_NOT_READY "+error);Console.Error.Flush();
    var c=Json.Deserialize<SupervisorConfiguration>(File.ReadAllText(path));SupervisorNames.Name(c.Session,"guard");SupervisorFiles.NoLinks(c.EvidenceRoot);if(c.ProcessId<=0||!Path.IsPathRooted(c.EvidenceRoot))throw new InvalidDataException("failure scope unavailable");
    string rejection=Path.Combine(c.EvidenceRoot,"rejection-"+Guid.NewGuid().ToString("N")+".json");Directory.CreateDirectory(c.EvidenceRoot);
    WriteNew(rejection,new{schema=1,error=error.ToString(),qpc=failed,frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),session=c.Session,admitted=false});
    return FailureNotice.Run(c,error.Message,failed);
   }
  }
  [STAThread]static int Main(string[] args){try{
   if(args.Length==2&&args[0]=="--identity"){Console.WriteLine(Json.Serialize(ExactIdentity.Capture(Int32.Parse(args[1]))));return 0;}
   if(args.Length==1&&args[0]=="--discover"){
    var rows=new System.Collections.Generic.List<object>();foreach(string name in new[]{"GTA5_Enhanced","RAGEPluginHook"})foreach(var p in Process.GetProcessesByName(name))using(p)rows.Add(new{ProcessId=p.Id,Name=name+".exe"});Console.WriteLine(Json.Serialize(rows));return 0;
   }
   if(args.Length==2&&args[0]=="--failure-notice"){var c=Json.Deserialize<SupervisorConfiguration>(File.ReadAllText(args[1]));SupervisorNames.Name(c.Session,"guard");if(c.ProcessId<0||!Path.IsPathRooted(c.EvidenceRoot))throw new InvalidDataException("explicit stop-only configuration required");SupervisorFiles.NoLinks(c.EvidenceRoot);return FailureNotice.Run(c,c.FailureReason,c.FailureQpc);}
   if(args.Length!=2||args[0]!="--monitor")throw new ArgumentException("explicit metadata/monitor/stop-only command required; never launches target");return Run(Path.GetFullPath(args[1]));
  }catch(Exception e){Console.Error.WriteLine("SUPERVISION_NOT_READY "+e);return 3;}}
 }
}
