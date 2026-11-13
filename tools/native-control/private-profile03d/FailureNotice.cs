using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.GateA.Private01.Supervision {
 public static class FailureNotice {
  // Stop-only path: never creates protocol events, guard or activation lease.
  // Remains visible after admission rejection, and reports rather than kills.
  public static int Run(SupervisorConfiguration c,string reason,long failureQpc){
   var json=new JavaScriptSerializer();string root=Path.Combine(c.EvidenceRoot,"failures");Directory.CreateDirectory(root);
   string run=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(run);
   var commands=SupervisorMonitor.InputCommands();var console=new ConsoleNotice();
   OperatorNotice notice=c.ShowUi?new OperatorNotice(commands):null;
   long now=Stopwatch.GetTimestamp();
   if(failureQpc<=0||failureQpc>now)failureQpc=now;
   double ageMs=(DateTime.UtcNow.Ticks-c.ProcessStartUtcTicks)/10000d;
   long hard=c.FixedHardDeadlineQpc>0?c.FixedHardDeadlineQpc:now+(long)Math.Floor(Math.Max(0,900000-Math.Max(0,ageMs))*Stopwatch.Frequency/1000d);
   long exitDue=Math.Min(hard,failureQpc+60*Stopwatch.Frequency),ackDue=failureQpc+5*Stopwatch.Frequency;
   bool ack=false,late=false,overdue=false,exitViolation=false,unresponsive=false;
   string message="STOP: "+reason+". No experiment is admitted. Acknowledge within five seconds and exit GTA normally now. No forced termination is authorized.";
   if(notice!=null){notice.ShowStop(message);if(!notice.Start())throw new IOException("STOP window unavailable; direct user normal exit required");}
   console.Publish(message);

   using(var file=new FileStream(Path.Combine(run,"events.jsonl"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
   using(var writer=new StreamWriter(file)) {
    Action<string,object> record=delegate(string kind,object detail){writer.WriteLine(json.Serialize(new{kind=kind,qpc=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),detail=detail}));writer.Flush();file.Flush(true);};
    record("stop-only-notified",new{reason=reason,stopAtQpc=failureQpc,exitDueQpc=exitDue,ackDueQpc=ackDue,admitted=false,forcedTerminationIssued=false});
    try {while(true){
     now=Stopwatch.GetTimestamp();string command;
     for(int n=0;n<8&&commands.TryDequeue(out command);n++) {
      if(command=="normal-exit-requested"||command=="ack-stop") {if(now>=ackDue)late=true;ack=true;record("direct-ack",new{late=late,command=command});}
      else if(command=="quit-unresponsive"){unresponsive=true;record("quit-unresponsive",command);}
      else record("refused-no-restoration-authority",command);
     }
     bool present=true;
     try {
      if(c.ProcessId==0){present=false;foreach(string name in new[]{"GTA5_Enhanced","GTA5_Enhanced_BE","RAGEPluginHook"})foreach(var target in Process.GetProcessesByName(name))using(target)present=true;}
      else using(var target=Process.GetProcessById(c.ProcessId))present=!target.HasExited;
     }
     catch(ArgumentException){present=false;}
     // A reused PID is conservatively still present. No new lifetime is admitted.
     if(!present){exitViolation|=now>exitDue;record("process-absence",new{notificationAcknowledged=ack,acknowledgmentLate=late,notificationOverdue=overdue||!ack&&now>=ackDue,exitDeadlineViolated=exitViolation,installationRestored=false});return 3;}
     if(!ack&&now>=ackDue&&!overdue){overdue=true;record("notification-deadline-violation",false);}
     if(now>=exitDue&&!exitViolation){exitViolation=true;record("normal-exit-deadline-violation",false);}
     if(overdue||exitViolation||unresponsive){string escalation="ESCALATION: "+(exitViolation?"normal exit deadline exceeded":unresponsive?"normal quit unresponsive":"STOP acknowledgment overdue")+". Exit normally; no forced termination. Preserve installation and evidence.";if(notice!=null)notice.ShowStop(escalation);}
     Thread.Sleep(20);
    }} finally {if(notice!=null)notice.Close();}
   }
  }
 }
}
