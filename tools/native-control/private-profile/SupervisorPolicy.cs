using System;

namespace RichAudio.GateA.Private01.Supervision {
 public static class SupervisorClock {
  public static long MapProcessCreationQpc(long creationUtc,long beforeQpc,long beforeUtc,long mappedQpc,long mappedUtc,long frequency,out double ageMs){
   if(frequency<=0||mappedQpc<beforeQpc)throw new ArgumentException("monotonic mapping span");ageMs=(mappedUtc-creationUtc)/10000d;
   double wallMs=(mappedUtc-beforeUtc)/10000d,monotonicMs=(mappedQpc-beforeQpc)*1000d/frequency;
   if(ageMs<0||ageMs>10000||Math.Abs(wallMs-monotonicMs)>250)throw new InvalidOperationException("late monitor attachment or ambiguous clock mapping; no activation admitted");
   long origin=mappedQpc-(long)Math.Ceiling(ageMs*frequency/1000d);if(origin<0)throw new InvalidOperationException("process clock origin invalid");return origin;
  }
 }
 // Deterministic state machine; all deadlines are monotonic and immutable.
 public sealed class SupervisorPolicy {
  public readonly long Started,HardDeadline,PlannedStop,Frequency;
  readonly long heartbeatLimit,startupLimit,exitGrace,acknowledgeLimit;
  long lastHeartbeat,lastNow;
  public bool StopRequested,NotificationAcknowledged,NormalExitRequested,VehiclesRetired,ProcessExited,ExitDeadlineViolated,NotificationOverdue,QuitUnresponsive,ProbeStopAcknowledged,ProbeStopUnacknowledged;
  public long StopAt=-1,ExitDue=-1,ExitObservedAt=-1;
  public string StopReason,Escalation;
  public SupervisorPolicy(long now,long frequency,int lifetimeMs,int exitLeadMs,int exitGraceMs,int heartbeatMs,int startupMs,int acknowledgeMs){
   if(now<0||frequency<=0||lifetimeMs<100||lifetimeMs>900000||exitLeadMs<20||exitLeadMs>=lifetimeMs||exitGraceMs<20||exitGraceMs>lifetimeMs||heartbeatMs<20||startupMs<20||startupMs>=lifetimeMs||acknowledgeMs<20)throw new ArgumentException("bounded supervision timing");
   Started=now;Frequency=frequency;HardDeadline=now+Ticks(lifetimeMs);PlannedStop=HardDeadline-Ticks(exitLeadMs);
   heartbeatLimit=Ticks(heartbeatMs);startupLimit=Ticks(startupMs);exitGrace=Ticks(exitGraceMs);acknowledgeLimit=Ticks(acknowledgeMs);lastHeartbeat=-1;lastNow=now;
  }
  long Ticks(int milliseconds){return checked((long)Math.Ceiling(milliseconds*Frequency/1000d));}
  public void RequestStop(long now,string reason){if(StopRequested)return;StopRequested=true;StopAt=now;StopReason=reason;ExitDue=Math.Min(HardDeadline,now+exitGrace);}
  public void Acknowledge(){if(StopRequested)NotificationAcknowledged=true;}
  public void UserNormalExit(){if(StopRequested){NotificationAcknowledged=true;NormalExitRequested=true;}}
  public void ReportUnresponsive(long now){QuitUnresponsive=true;RequestStop(now,"normal-quit-unresponsive");Escalation="NORMAL_QUIT_UNRESPONSIVE_NO_FORCE_PERMISSION";}
  public void Step(long now,bool processAlive,bool heartbeat,bool failure,bool vehiclesRetired){
   if(now<lastNow)throw new InvalidOperationException("monotonic clock moved backwards");lastNow=now;
   if(vehiclesRetired){VehiclesRetired=true;RequestStop(now,"probe-vehicles-retired");}
   if(heartbeat&&!StopRequested)lastHeartbeat=now;
   if(!processAlive){if(!ProcessExited){if(StopRequested&&now>ExitDue||now>HardDeadline){ExitDeadlineViolated=true;Escalation="EXIT_NOT_OBSERVED_WITHIN_DEADLINE";}ProcessExited=true;ExitObservedAt=now;}RequestStop(now,"process-exit");return;}
   if(failure)RequestStop(now,"probe-reported-failure");
   if(!StopRequested&&now>=PlannedStop)RequestStop(now,"fixed-lifetime-exit-lead");
   if(!StopRequested&&(lastHeartbeat<0?now-Started>=startupLimit:now-lastHeartbeat>=heartbeatLimit))RequestStop(now,lastHeartbeat<0?"probe-not-ready-before-startup-limit":"probe-heartbeat-lost");
   if(StopRequested){
    if(!ProbeStopAcknowledged&&now-StopAt>=heartbeatLimit){ProbeStopUnacknowledged=true;if(Escalation==null)Escalation="PROBE_STOP_NOT_ACKNOWLEDGED";}
    if(!NotificationAcknowledged&&now-StopAt>=acknowledgeLimit){NotificationOverdue=true;if(Escalation==null)Escalation="STOP_NOTIFICATION_UNACKNOWLEDGED";}
    if(now>=ExitDue){ExitDeadlineViolated=true;Escalation="EXIT_DEADLINE_EXCEEDED_PROCESS_STILL_RUNNING";}
   }
  }
 }
}
