using System;using System.Web.Script.Serialization;
namespace RichAudio.Experiments {
 static class TestLatency031Supervision {
  static int checks;static void Need(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
  sealed class Fixture:ILatency031OwnedChild {
   internal long Ticks;internal int ExitAt=40;internal uint Code;internal bool Exited,ThrowWait,ThrowExit,Unavailable,ThrowClose,CloseFails,JobCloseFails,StopFails,AdmissionFails,StartFails;internal int Closes,JobCloses,StopCalls;
   public int Id{get{return 123;}}public long StartUtcTicks{get{return 123456;}}
   public bool WaitForExit(int milliseconds){if(ThrowWait)throw new InvalidOperationException("authored wait failure");if(Exited)return true;Ticks=Math.Min(Ticks+milliseconds,ExitAt);if(Ticks>=ExitAt)Exited=true;return Exited;}
   public Latency031ExitObservation CaptureExit(){if(ThrowExit)throw new InvalidOperationException("authored exit failure");return new Latency031ExitObservation{Exited=Exited,Available=Exited&&!Unavailable,ExitCode=Exited&&!Unavailable?(uint?)Code:null,NativeError=Unavailable?6:0,WaitResult=Exited?0u:258u};}
   public Latency031CloseObservation CloseLifetime(){Closes++;if(ThrowClose)throw new InvalidOperationException("authored process close failure");return new Latency031CloseObservation{Attempted=true,Succeeded=!CloseFails,NativeError=CloseFails?6:0};}
   internal Latency031SupervisionReport Run(){return Latency031Supervision.Run(()=>{if(StartFails)throw new InvalidOperationException("authored start failure");return this;},c=>{if(AdmissionFails)throw new InvalidOperationException("authored admission failure");},()=>{StopCalls++;if(StopFails)throw new InvalidOperationException("authored stop write failure");},()=>{JobCloses++;if(!JobCloseFails){Exited=true;Code=Ticks<ExitAt?1u:Code;}return new Latency031CloseObservation{Attempted=true,Succeeded=!JobCloseFails,NativeError=JobCloseFails?6:0};},()=>Ticks,1000,100,200,30);}
  }
  public static int Main(){try{
   var f=new Fixture();var r=f.Run();Need(r.Passed&&r.CleanupVerified&&r.WorkerExitCode==0&&r.AdmissionCompleted,"normal exit exact evidence");Need(f.Closes==1&&f.JobCloses==1,"each owned handle close attempted once");
   f=new Fixture{Code=7};r=f.Run();Need(!r.Passed&&r.CleanupVerified&&r.WorkerExitCode==7,"nonzero execution is separate from successful cleanup");
   f=new Fixture{Code=259};r=f.Run();Need(!r.Passed&&r.WorkerExitCode==259&&r.ExitCodeAvailable,"real exit code259 remains actual status");
   f=new Fixture{ExitAt=1000};r=f.Run();Need(!r.Passed&&r.StopRequested&&r.HardContainmentRequested&&r.CleanupVerified,"timeout requests stop then bounded containment, no success");Need(f.StopCalls==1&&r.StopRequestBeforeQpc==100&&r.ContainmentBeforeQpc==200,"independent stop and containment monotonic bounds");
   f=new Fixture{StartFails=true};r=f.Run();Need(!r.Passed&&!r.CleanupVerified&&!r.WorkerCreated&&r.Error!=null&&f.JobCloses==1,"early start failure retained and containment close still attempted");
   f=new Fixture{AdmissionFails=true};r=f.Run();Need(!r.Passed&&r.Error!=null&&!r.AdmissionCompleted&&r.CleanupVerified,"admission IO failure fails execution while preserving cleanup evidence");
   f=new Fixture{ThrowWait=true};r=f.Run();Need(!r.Passed&&!r.CleanupVerified&&r.Error!=null&&f.Closes==1&&f.JobCloses==1,"wait failure remains incomplete, closes still attempted");
   f=new Fixture{ThrowExit=true};r=f.Run();Need(!r.Passed&&!r.WorkerExitEvidenceComplete&&r.Error!=null&&f.Closes==1,"exit capture exception preserves incomplete report");
   f=new Fixture{Unavailable=true};r=f.Run();Need(!r.Passed&&!r.ExitCodeAvailable&&r.WorkerExitCode==null&&r.ExitNativeError==6,"invalid handle/unavailable status never becomes zero exit");
   f=new Fixture{CloseFails=true};r=f.Run();Need(!r.Passed&&!r.CleanupVerified&&r.ProcessHandleCloseNativeError==6,"kernel handle close failure reported truthfully");
   f=new Fixture{ThrowClose=true};r=f.Run();Need(!r.Passed&&!r.CleanupVerified&&r.Error!=null,"process close exception preserved");
   f=new Fixture{JobCloseFails=true};r=f.Run();Need(!r.Passed&&!r.CleanupVerified&&r.JobCloseNativeError==6,"job close failure is not cleanup success");
   f=new Fixture{ExitAt=1000,JobCloseFails=true};r=f.Run();Need(!r.Passed&&!r.WorkerExitEvidenceComplete&&!r.CleanupVerified&&r.WorkerExitCode==null,"failed hard job close plus surviving child retains incomplete cleanup");
   f=new Fixture{ExitAt=1000,StopFails=true};r=f.Run();Need(!r.Passed&&r.Error!=null&&r.CleanupVerified&&f.JobCloses==1,"stop-request IO failure closes containment and fails execution");
   Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,checks,kind="deterministic-supervisor-policy-fault-fixtures",endpointOpened=false,recordingStarted=false,gameLaunched=false}));return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
 }
}
