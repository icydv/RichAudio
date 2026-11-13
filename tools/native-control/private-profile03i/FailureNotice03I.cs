using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.GateA.Private01.Supervision {
 public static class FailureNotice {
  // Stop-only path: never creates protocol events, guard or activation lease.
  // Remains visible after admission rejection, and reports rather than kills.
  public static int Run(SupervisorConfiguration c,string reason,long failureQpc,string configurationPath=null){
   var json=new JavaScriptSerializer();string root=Path.Combine(c.EvidenceRoot,"failures");Directory.CreateDirectory(root);
   string run=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(run);
   var delivery=new NoticeDelivery(c,run,"stop-only",configurationPath);var commands=SupervisorMonitor.InputCommands();var console=new ConsoleNotice();
   OperatorNotice notice=c.ShowUi?new OperatorNotice(commands,delivery):null;
   long now=Stopwatch.GetTimestamp();
   if(failureQpc<=0||failureQpc>now)failureQpc=now;
   double ageMs=(DateTime.UtcNow.Ticks-c.ProcessStartUtcTicks)/10000d;
   long hard=c.FixedHardDeadlineQpc>0?c.FixedHardDeadlineQpc:now+(long)Math.Floor(Math.Max(0,900000-Math.Max(0,ageMs))*Stopwatch.Frequency/1000d);
   long exitDue=Math.Min(hard,failureQpc+60*Stopwatch.Frequency),ackDue=failureQpc+5*Stopwatch.Frequency;
   bool ack=false,late=false,overdue=false,exitViolation=false,unresponsive=false;
   string message="STOP: "+reason+". No experiment is admitted. Acknowledge within five seconds and exit GTA normally now. No forced termination is authorized.";
   bool prestarted=false;
#if SUPERVISION_FIXTURES
   if(c.FixtureArmPath!=null){
    if(c.Mode!="offline-fixture"||notice==null)throw new InvalidDataException("staged UI requires explicit offline fixture");
    if(!notice.Start())throw new IOException("fixture UI unavailable");prestarted=true;
    long waitEnd=Stopwatch.GetTimestamp()+120*Stopwatch.Frequency;
    while(!File.Exists(c.FixtureArmPath)){if(Stopwatch.GetTimestamp()>=waitEnd)throw new TimeoutException("fixture arm unavailable");Thread.Sleep(10);}
    // A new induced failure begins now. This never resets an existing failure.
    failureQpc=Stopwatch.GetTimestamp();exitDue=Math.Min(hard,failureQpc+60*Stopwatch.Frequency);ackDue=failureQpc+5*Stopwatch.Frequency;
   }
#endif
   delivery.BeginStop(failureQpc,exitDue,hard);if(notice!=null){notice.ShowStop(message);if(!prestarted&&!notice.Start())throw new IOException("STOP window unavailable; direct user normal exit required");}
   console.Publish(message);

   using(var file=new FileStream(Path.Combine(run,"events.jsonl"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
   using(var writer=new StreamWriter(file)) {
    Action<string,object> record=delegate(string kind,object detail){writer.WriteLine(json.Serialize(new{kind=kind,qpc=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),detail=detail}));writer.Flush();file.Flush(true);};
    record("stop-only-notified",new{reason=reason,stopAtQpc=failureQpc,exitDueQpc=exitDue,ackDueQpc=ackDue,admitted=false,forcedTerminationIssued=false});
    try {while(true){
     now=Stopwatch.GetTimestamp();string command;
     for(int n=0;n<8&&commands.TryDequeue(out command);n++) {
#if SUPERVISION_FIXTURES
      if(c.Mode=="offline-fixture"&&command=="fixture-button"){delivery.SubmitFixture();continue;}
      if(c.Mode=="offline-fixture"&&command=="fixture-button-twice"){delivery.SubmitFixture();delivery.SubmitFixture();continue;}
      if(c.Mode=="offline-fixture"&&command=="fixture-exit"){delivery.Record("fixture-unexpected-process-exit",new{code=23});delivery.Flush(500);Environment.Exit(23);}
#endif
      if(command=="normal-exit-requested"||command=="ack-stop") {if(c.Mode=="offline-fixture"&&!c.ShowUi){if(now>=ackDue)late=true;ack=true;record("fixture-stdin-ack",new{late=late,human=false});}else delivery.Record("ack-rejected",new{reason="untrusted-stdin-ack",source="stdin"});}
      else if(command=="quit-unresponsive"){unresponsive=true;record("quit-unresponsive",command);}
      else record("refused-no-restoration-authority",new{reason="stop-only-control-not-authorized",length=command.Length});
     }
     if(delivery.Poll(true)){ack=true;late=delivery.AcceptedAt>=ackDue;record("direct-ack",new{late=late,acceptedAtQpc=delivery.AcceptedAt});}
     bool present=true;
     try {
      if(c.ProcessId==0){present=false;foreach(string name in new[]{"GTA5_Enhanced","GTA5_Enhanced_BE","RAGEPluginHook"})foreach(var target in Process.GetProcessesByName(name))using(target)present=true;}
      else using(var target=Process.GetProcessById(c.ProcessId))present=!target.HasExited;
     }
     catch(ArgumentException){present=false;}
     if(!present)delivery.TargetAbsent(now);
     // A reused PID is conservatively still present. No new lifetime is admitted.
     if(!present){if(!delivery.CanRetire(now)){Thread.Sleep(20);continue;}exitViolation|=delivery.FirstTargetAbsence==0?now>exitDue:delivery.FirstTargetAbsence>exitDue;record("process-absence",new{notificationAcknowledged=ack,acknowledgmentLate=late||delivery.LateAcknowledgmentReceived,notificationOverdue=overdue||!ack&&now>=ackDue,exitDeadlineViolated=exitViolation,installationRestored=false,noticeDelivery=delivery.Summary()});delivery.Record("notice-retired",new{processAbsent=true});delivery.Flush(1000);return 3;}
     if(!ack&&now>=ackDue&&!overdue){overdue=true;delivery.Record("deadline-expired",new{deadlineQpc=ackDue});record("notification-deadline-violation",false);}
     if(now>=exitDue&&!exitViolation){exitViolation=true;record("normal-exit-deadline-violation",false);}
     if(overdue||exitViolation||unresponsive){string escalation="ESCALATION: "+(exitViolation?"normal exit deadline exceeded":unresponsive?"normal quit unresponsive":"STOP acknowledgment overdue")+". Exit normally; no forced termination. Preserve installation and evidence.";if(notice!=null)notice.ShowStop(escalation);}
     Thread.Sleep(20);
    }} finally {if(notice!=null)notice.Close();delivery.Dispose();}
   }
  }
 }
}
