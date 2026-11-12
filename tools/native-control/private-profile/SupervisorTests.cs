using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.GateA.Private01.Supervision;

internal static class SupervisorTests {
 static int checks;static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static void Check(bool test,string why){if(!test)throw new Exception(why);checks++;Console.WriteLine("PASS "+why);}
 static void Until(Func<bool> test,int ms,string why){var clock=Stopwatch.StartNew();while(!test()){if(clock.ElapsedMilliseconds>ms)throw new TimeoutException(why);Thread.Sleep(10);}}
 static SupervisorPolicy Policy(){return new SupervisorPolicy(1000,1000,1000,200,200,100,150,50);}
 sealed class BlockedConsole:TextWriter {
  internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false);
  public override Encoding Encoding{get{return Encoding.UTF8;}}
  public override void WriteLine(string value){Entered.Set();Release.WaitOne();}
 }
 static void PolicyTests(){
  double age;Check(SupervisorClock.MapProcessCreationQpc(100000000,100000,100100000,100010,100200000,1000,out age)==99990&&age==20,"process age deducted once before immutable QPC deadlines");
  bool invalidAge=false;try{SupervisorClock.MapProcessCreationQpc(100000000,100000,100100000,100010,99000000,1000,out age);}catch(InvalidOperationException){invalidAge=true;}Check(invalidAge,"negative process age fails closed");
  invalidAge=false;try{SupervisorClock.MapProcessCreationQpc(100000000,100000,220000000,100010,220100000,1000,out age);}catch(InvalidOperationException){invalidAge=true;}Check(invalidAge,"attachment later than10 seconds fails closed");
  invalidAge=false;try{SupervisorClock.MapProcessCreationQpc(100000000,100000,100100000,100010,110200000,1000,out age);}catch(InvalidOperationException){invalidAge=true;}Check(invalidAge,"UTC/QPC disagreement fails closed");
  var p=Policy();p.Step(1000,true,true,false,false);p.Step(1050,true,true,false,false);Check(!p.StopRequested,"fresh heartbeat preserves active state");p.Step(1150,true,false,false,false);Check(p.StopReason=="probe-heartbeat-lost","stale heartbeat stops independently");
  p=Policy();p.Step(1150,true,false,false,false);Check(p.StopReason=="probe-not-ready-before-startup-limit","missing startup never grants indefinite activity");
  p=Policy();for(long n=1000;n<=1800;n+=50)p.Step(n,true,true,false,false);Check(p.StopRequested&&p.StopAt==1800&&p.HardDeadline==2000,"heartbeats and reconnects cannot renew fixed lifetime");
  p.Step(1850,true,true,false,true);Check(p.VehiclesRetired&&!p.ProcessExited,"vehicle retirement report does not imply process exit");Check(p.NotificationOverdue,"missing stop acknowledgment escalates promptly");
  p.UserNormalExit();p.Step(2000,true,false,false,false);Check(p.ExitDeadlineViolated&&!p.ProcessExited,"normal-exit acknowledgment never proves actual exit");p.Step(2010,false,false,false,false);Check(p.ExitDeadlineViolated,"late eventual exit cannot repair deadline violation");
  p=Policy();p.Step(1010,true,true,true,false);Check(p.StopReason=="probe-reported-failure"&&p.ExitDue==1210,"failure starts immediate bounded exit response");p.ReportUnresponsive(1020);Check(p.Escalation=="NORMAL_QUIT_UNRESPONSIVE_NO_FORCE_PERMISSION","unresponsive normal quit requests escalation only");
  p.Step(1200,false,false,false,false);Check(p.ProcessExited&&!p.ExitDeadlineViolated,"timely observed exit can complete process boundary");p.Step(5000,false,false,false,false);Check(!p.ExitDeadlineViolated,"later disk restoration cannot turn timely process exit into an overrun");
  p=Policy();p.RequestStop(1010,"failure");p.Step(1211,false,false,false,false);Check(p.ExitDeadlineViolated,"late first absence observation fails conservative exit deadline");
  bool rejected=false;try{p.Step(1100,false,false,false,false);}catch(InvalidOperationException){rejected=true;}Check(rejected,"backwards monotonic observations rejected");
  Check(SupervisorProbeClient.TryOpen(Guid.NewGuid().ToString("N"))==null,"missing monitor fails closed");
  p=Policy();p.Acknowledge();p.Step(1010,true,true,true,false);p.Step(1060,true,true,false,false);Check(!p.NotificationAcknowledged&&p.NotificationOverdue,"pre-stop acknowledgment cannot suppress later stop-notice escalation");
  var mailbox=new CommandMailbox();for(int n=0;n<10000;n++)mailbox.Enqueue("status");mailbox.Enqueue("stop");string command;Check(mailbox.TryDequeue(out command)&&command=="stop","urgent stop bypasses a flooded command queue");int count=0;while(mailbox.TryDequeue(out command))count++;Check(count<=64&&mailbox.Dropped>0,"command flood remains bounded");
  var blocked=new BlockedConsole();var original=Console.Out;bool entered=false;double elapsed=0;
  try{Console.SetOut(blocked);var notice=new ConsoleNotice();notice.Publish("authored blocked stdout");entered=blocked.Entered.WaitOne(1000);var watch=Stopwatch.StartNew();notice.Publish("stop while stdout blocked");p=Policy();p.Step(1010,true,true,true,false);watch.Stop();elapsed=watch.Elapsed.TotalMilliseconds;}
  finally{blocked.Release.Set();Thread.Sleep(30);Console.SetOut(original);}
  Check(entered&&elapsed<100&&p.StopRequested,"blocked stdout cannot block control revocation");
 }
 static Dictionary<string,object> Read(string path){try{return Json.DeserializeObject(File.ReadAllText(path)) as Dictionary<string,object>;}catch(IOException){return null;}}
 static void CheckJournal(string path){string previous=new string('0',64);long ordinal=0;foreach(string line in File.ReadAllLines(path)){var row=(Dictionary<string,object>)Json.DeserializeObject(line);string payload=(string)row["payload"],digest;using(var hash=SHA256.Create())digest=SupervisorFiles.Hex(hash.ComputeHash(Encoding.UTF8.GetBytes(previous+"\n"+payload)));Check((string)row["previous"]==previous&&(string)row["sha256"]==digest,"journal hash chain row "+(++ordinal));previous=digest;}Check(ordinal>=4,"complete supervision transitions retained");}
 static void ProcessScenario(string root,string monitor,string mode){
  string scope=Path.Combine(root,mode),release=Path.Combine(scope,"child-normal-exit"),original=Path.Combine(scope,"original.txt"),temporary=Path.Combine(scope,"temporary.txt");Directory.CreateDirectory(scope);File.WriteAllText(original,"original fixture content");string originalHash=SupervisorFiles.Hash(original);long originalBytes=new FileInfo(original).Length;File.WriteAllText(original,"temporary changed fixture content");File.WriteAllText(temporary,"fixture installation only");
  Process child=null,watcher=null;SupervisorProbeClient client=null;bool heartbeatEnd=false;Thread heartbeat=null;string output="";
  try{
   child=Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location,"--fixture-child \""+release+"\""){UseShellExecute=false,CreateNoWindow=true});long creation=child.StartTime.ToUniversalTime().Ticks;int childId=child.Id;
   string session=Guid.NewGuid().ToString("N");var c=new SupervisorConfiguration{Schema=1,Mode="offline-fixture",Session=session,ProcessId=childId,ProcessStartUtcTicks=creation,Executable=Assembly.GetExecutingAssembly().Location,ExecutableSha256=SupervisorFiles.Hash(Assembly.GetExecutingAssembly().Location),EvidenceRoot=scope,ShowUi=false,MaximumLifetimeMs=1600,ExitLeadMs=700,ExitGraceMs=700,HeartbeatTimeoutMs=250,StartupTimeoutMs=600,AcknowledgeTimeoutMs=100,Restoration=new[]{new RestorationCheck{Path=original,Sha256=originalHash,Bytes=originalBytes},new RestorationCheck{Path=temporary,Absent=true}}};
   if(mode=="wrong-identity")c.ProcessStartUtcTicks++;
   string config=Path.Combine(scope,"configuration-input.json");File.WriteAllText(config,Json.Serialize(c));string run=Path.Combine(scope,"runs",session),status=Path.Combine(run,"status.json");
   watcher=new Process{StartInfo=new ProcessStartInfo(monitor,"--monitor \""+config+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};
   watcher.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)lock(scope)output+=e.Data+"\n";};watcher.ErrorDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)lock(scope)output+=e.Data+"\n";};watcher.Start();watcher.BeginOutputReadLine();watcher.BeginErrorReadLine();
   if(mode=="wrong-identity"){Check(watcher.WaitForExit(3000)&&watcher.ExitCode==3,"wrong process creation identity refuses admission");Check(!child.HasExited,"identity rejection does not terminate target");return;}
   Until(()=>{client=SupervisorProbeClient.OpenBoundForFixture(session,childId,creation);return client!=null;},3000,"monitor channel: "+output);
   Check(SupervisorProbeClient.TryOpen(session)==null,"different process cannot connect using session alone");Check(client.TryClaimActivation(),"first manual activation claim granted");
   using(var second=SupervisorProbeClient.OpenBoundForFixture(session,childId,creation))Check(second!=null&&!second.TryClaimActivation(),"second client/reloaded script cannot claim another activation");
   client.Dispose();client=SupervisorProbeClient.OpenBoundForFixture(session,childId,creation);Check(client!=null&&!client.TryClaimActivation(),"disposal and reconnection cannot renew consumed activation");
   if(mode=="monitor-loss"){
    watcher.Kill();Check(watcher.WaitForExit(2000),"fixture-only supervisor crash simulated independently");Until(()=>client.StopRequested,1000,"lost monitor guard");Check(!child.HasExited&&client.StopRequested,"monitor loss revokes probe permission without terminating target");return;
   }
   heartbeat=new Thread(delegate(){while(!Volatile.Read(ref heartbeatEnd)){try{client.Heartbeat();}catch(ObjectDisposedException){return;}Thread.Sleep(30);}}){IsBackground=true};heartbeat.Start();
   if(mode=="failure"){Thread.Sleep(100);long at=Stopwatch.GetTimestamp();client.ReportFailure();Until(()=>client.StopRequested,1000,"failure revocation");Check((Stopwatch.GetTimestamp()-at)*1000d/Stopwatch.Frequency<250,"external failure revocation observed within 250 ms fixture bound");}
   else Until(()=>client.StopRequested,3000,"fixed stop: "+output);
   Until(()=>{var s=Read(status);return s!=null&&(bool)s["stopRequested"];},2000,"persisted stop status");
   var stopState=Read(status);long stopped=Convert.ToInt64(stopState["stopAtQpc"]),planned=Convert.ToInt64(stopState["plannedStopQpc"]);
   if(mode=="normal")Check((stopped-planned)*1000d/Stopwatch.Frequency>=0&&(stopped-planned)*1000d/Stopwatch.Frequency<250,"fixed deadline stop notification meets 250 ms fixture bound");
   client.ReportStopAcknowledged();client.ReportVehiclesRetired();watcher.StandardInput.WriteLine("normal-exit-requested");watcher.StandardInput.Flush();
   if(mode=="hung"){
    watcher.StandardInput.WriteLine("quit-unresponsive");watcher.StandardInput.Flush();
    Until(()=>{var s=Read(status);return s!=null&&(bool)s["exitDeadlineViolated"];},3000,"hung normal quit escalation");
    Check(!child.HasExited&&!watcher.HasExited,"hung target remains alive; monitor never forces process termination");
    Check(!(bool)Read(status)["installationRestored"],"deadline escalation leaves restoration explicitly pending");
   }
   File.WriteAllText(release,"authored operator normal exit");Check(child.WaitForExit(2000)&&child.ExitCode==0,"disposable target exits normally on explicit user-equivalent command");
   Until(()=>{var s=Read(status);return s!=null&&(bool)s["processExited"];},2000,"process absence independently observed");
   Check(!(bool)Read(status)["installationRestored"],"process exit does not imply installation restoration");
   if(mode=="normal"){Thread.Sleep(900);Check(!(bool)Read(status)["exitDeadlineViolated"],"independent restoration wait does not extend or invalidate game lifetime");}
   watcher.StandardInput.WriteLine("verify-restoration");watcher.StandardInput.Flush();Thread.Sleep(150);Check(!watcher.HasExited,"incorrect installation bytes do not pass restoration");
   File.WriteAllText(original,"original fixture content");File.Delete(temporary);watcher.StandardInput.WriteLine("verify-restoration");watcher.StandardInput.Flush();
   Check(watcher.WaitForExit(3000),"monitor completes only after real restoration verification");Check(watcher.ExitCode==(mode=="hung"?2:0),"deadline violation remains failed after complete cleanup");
   var result=Read(Path.Combine(run,"result.json"));Check((bool)result["installationRestored"]&&(bool)result["vehiclesRetiredReported"]&&(bool)result["processExited"],"three distinct cleanup states retained");Check((string)result["performance10ms"]=="FAILED_UNCHANGED"&&!(bool)result["forcedTerminationIssued"],"performance failure and no-force boundary preserved");CheckJournal(Path.Combine(run,"events.jsonl"));
   Check(client.StopRequested,"monitor exit leaves connected probe stopped");
  }finally{
   heartbeatEnd=true;if(heartbeat!=null)heartbeat.Join(1000);if(client!=null)client.Dispose();
   // The harness owns only these authored fixture processes. This fallback is
   // never compiled into the monitor and cannot target a game process.
   if(child!=null){if(!child.HasExited){File.WriteAllText(release,"fixture cleanup");if(!child.WaitForExit(2000))child.Kill();}child.Dispose();}
   if(watcher!=null){if(!watcher.HasExited){watcher.Kill();watcher.WaitForExit(2000);}watcher.Dispose();}
   File.WriteAllText(Path.Combine(scope,"monitor-output.txt"),output);
  }
 }
 static int Main(string[] args){try{
  if(args.Length==2&&args[0]=="--fixture-child"){while(!File.Exists(args[1]))Thread.Sleep(20);return 0;}
  if(args.Length!=2)throw new ArgumentException("fresh output and monitor executable");PolicyTests();foreach(string mode in new[]{"normal","failure","hung","wrong-identity","monitor-loss"})ProcessScenario(args[0],args[1],mode);
  File.WriteAllText(Path.Combine(args[0],"qualification.json"),Json.Serialize(new{schema=1,passed=true,checks=checks,scope="authored policies and real independent disposable processes; no game/native/audio",performance10ms="FAILED_UNCHANGED"}));Console.WriteLine("PASS "+checks+" independent supervision checks");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
