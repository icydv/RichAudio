using System;
using System.Diagnostics;

namespace RichAudio.Experiments {
 // Control-thread policy. Native process handles are supplied by the owned
 // job adapter; no audio, device, renderer or event acquisition dependency.
 internal struct Latency031ExitObservation {
  internal bool Exited,Available;internal uint? ExitCode;internal int NativeError;internal uint WaitResult;
 }
 internal struct Latency031CloseObservation {internal bool Attempted,Succeeded;internal int NativeError;}
 internal interface ILatency031OwnedChild {
  int Id {get;}long StartUtcTicks {get;}
  bool WaitForExit(int milliseconds);
  Latency031ExitObservation CaptureExit();
  Latency031CloseObservation CloseLifetime();
 }
 internal sealed class Latency031SupervisionReport {
  public bool WorkerCreated,AdmissionCompleted,WorkerExited,ExitCodeAvailable,StopRequested,HardContainmentRequested;
  public bool JobCloseAttempted,JobCloseSucceeded,ProcessHandleCloseAttempted,ProcessHandleCloseSucceeded;
  public bool WorkerExitEvidenceComplete,CleanupVerified,Passed;
  public bool ExitObservedAfterStopBound,ExitObservedAfterHardBound,FinalTimerValid;
  public int WorkerPid,ExitNativeError,JobCloseNativeError,ProcessHandleCloseNativeError;
  public uint? WorkerExitCode;public uint ExitWaitResult;
  public long WorkerStartUtcTicks,TimerStartQpc,StopRequestBeforeQpc,StopRequestAfterQpc,ContainmentBeforeQpc,ContainmentAfterQpc,ExitObservedQpc,LastWaitBeforeQpc,LastWaitAfterQpc;
  public long Frequency;public double? ElapsedMilliseconds;public string Error;
  public string TimerBasis="Monotonic timer starts before the one native child creation; it is not acoustic-silence evidence";
 }
 internal static class Latency031Supervision {
  static void Failure(Latency031SupervisionReport r,string stage,Exception e){r.Error=(r.Error==null?"":r.Error+"\n")+stage+": "+e;}
  internal static Latency031SupervisionReport Run(Func<ILatency031OwnedChild> start,Action<ILatency031OwnedChild> admit,Action requestStop,Func<Latency031CloseObservation> closeContainment,Func<long> timestamp,long frequency,int stopMilliseconds,int hardMilliseconds,int verificationMilliseconds){
   if(start==null||admit==null||requestStop==null||closeContainment==null||timestamp==null||frequency<=0||frequency>1000000000||stopMilliseconds<1||hardMilliseconds<=stopMilliseconds||hardMilliseconds>60000||verificationMilliseconds<0||verificationMilliseconds>3000)throw new ArgumentException("Explicit bounded supervision dependencies required");
   long initial=timestamp(),last=initial;
   Func<long> observed=delegate{long current=timestamp();if(current<last)throw new InvalidOperationException("Monotonic supervision clock regressed");last=current;return current;};
   var report=new Latency031SupervisionReport{TimerStartQpc=initial,Frequency=frequency};ILatency031OwnedChild child=null;
   try {
    child=start();if(child==null||child.Id<=0||child.StartUtcTicks<=0)throw new InvalidOperationException("Exact native child lifetime required");
    report.WorkerCreated=true;report.WorkerPid=child.Id;report.WorkerStartUtcTicks=child.StartUtcTicks;
    admit(child);report.AdmissionCompleted=true;
    for(;;){
     long now=observed();double elapsed=(now-report.TimerStartQpc)*1000d/frequency;
     if(elapsed>=stopMilliseconds&&!report.StopRequested){report.StopRequestBeforeQpc=now;requestStop();report.StopRequested=true;report.StopRequestAfterQpc=observed();}
     if(elapsed>=hardMilliseconds){report.HardContainmentRequested=true;break;}
     int next=report.StopRequested?hardMilliseconds:stopMilliseconds;int wait=Math.Max(1,Math.Min(100,(int)Math.Ceiling(next-elapsed)));
     report.LastWaitBeforeQpc=observed();bool exited=child.WaitForExit(wait);report.LastWaitAfterQpc=observed();
     if(exited){report.WorkerExited=true;report.ExitObservedQpc=report.LastWaitAfterQpc;break;}
    }
   }catch(Exception e){Failure(report,"supervision",e);}
   finally {
    // Job close is attempted even when creation, admission, waiting or exit
    // capture fails. An error never erases the original failure.
    try{try{report.ContainmentBeforeQpc=observed();}catch(Exception e){Failure(report,"containment timer",e);}var closed=closeContainment();report.JobCloseAttempted=closed.Attempted;report.JobCloseSucceeded=closed.Succeeded;report.JobCloseNativeError=closed.NativeError;try{report.ContainmentAfterQpc=observed();}catch(Exception e){Failure(report,"containment timer",e);}}
    catch(Exception e){Failure(report,"containment close",e);}
    if(child!=null){
     try{if(!report.WorkerExited)report.WorkerExited=child.WaitForExit(verificationMilliseconds);var exit=child.CaptureExit();report.WorkerExited=exit.Exited;report.ExitCodeAvailable=exit.Available;report.WorkerExitCode=exit.ExitCode;report.ExitNativeError=exit.NativeError;report.ExitWaitResult=exit.WaitResult;if(exit.Exited&&report.ExitObservedQpc==0)report.ExitObservedQpc=observed();}
     catch(Exception e){Failure(report,"native worker exit capture",e);}
     finally{try{var closed=child.CloseLifetime();report.ProcessHandleCloseAttempted=closed.Attempted;report.ProcessHandleCloseSucceeded=closed.Succeeded;report.ProcessHandleCloseNativeError=closed.NativeError;}catch(Exception e){Failure(report,"process handle close",e);}}
    }
    try{report.ElapsedMilliseconds=(observed()-report.TimerStartQpc)*1000d/frequency;report.FinalTimerValid=true;}catch(Exception e){Failure(report,"final timer",e);}
   }
   report.WorkerExitEvidenceComplete=report.WorkerCreated&&report.WorkerExited&&report.ExitCodeAvailable&&report.WorkerExitCode.HasValue;
   report.CleanupVerified=report.WorkerExitEvidenceComplete&&report.JobCloseAttempted&&report.JobCloseSucceeded&&report.ProcessHandleCloseAttempted&&report.ProcessHandleCloseSucceeded;
   if(report.ExitObservedQpc>0){double exitObservedMilliseconds=(report.ExitObservedQpc-report.TimerStartQpc)*1000d/frequency;report.ExitObservedAfterStopBound=exitObservedMilliseconds>=stopMilliseconds;report.ExitObservedAfterHardBound=exitObservedMilliseconds>=hardMilliseconds;}
   report.Passed=report.Error==null&&report.FinalTimerValid&&report.AdmissionCompleted&&report.CleanupVerified&&!report.StopRequested&&!report.HardContainmentRequested&&!report.ExitObservedAfterStopBound&&report.WorkerExitCode.Value==0;
   return report;
  }
 }
}
