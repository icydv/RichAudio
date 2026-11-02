using System;using System.Collections.Generic;using System.ComponentModel;using System.Diagnostics;using System.IO;using System.Runtime.InteropServices;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using LegacyJob=RichAudio.Legacy031.OwnedProcessJob;
internal static class TestLatency031Process {
 static int checks;static readonly List<object> rows=new List<object>();static string helper,output;
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr h);
 static void Need(bool b,string message){checks++;if(!b)throw new Exception(message);}
 static void Reject<T>(Action action) where T:Exception{bool rejected=false;try{action();}catch(T){rejected=true;}Need(rejected,"Expected "+typeof(T).Name);}
 static bool OriginalAbsent(int pid,long creation){try{using(var p=Process.GetProcessById(pid))return p.HasExited||p.StartTime.ToUniversalTime().Ticks!=creation;}catch(ArgumentException){return true;}}
 static void AbsentEventually(int pid,long creation){var w=Stopwatch.StartNew();while(!OriginalAbsent(pid,creation)&&w.ElapsedMilliseconds<3000)Thread.Sleep(1);Need(OriginalAbsent(pid,creation),"Original fixture lifetime absent");}
 static void GoodClose(OwnedProcessCloseStatus close,string label){Need(close!=null&&close.Attempted&&close.Succeeded&&close.NativeError==0,label+" CloseHandle succeeded");}
 static object Status(OwnedProcessExitStatus s){return new{state=s.State.ToString(),s.ExitCode,s.WaitResult,s.NativeError,s.Id,s.StartUtcTicks};}
 static void Normal(uint expected,int delay){
  OwnedProcessLifetime p=null;using(var job=new OwnedProcessJob(128)){
   p=job.StartOwned(helper,"exit "+expected+" "+delay,output);try{
    Need(p.Id>0&&p.StartUtcTicks>0,"Original immutable native identity");GoodClose(p.PrimaryThreadCloseStatus,"Primary thread");Reject<InvalidOperationException>(()=>new OwnedProcessLifetime(p.Handle,(uint)p.Id+1));
    Need(p.WaitForExit(3000),"Bounded normal exit wait");var status=p.CaptureExitStatus();Need(status.State==OwnedProcessState.Exited&&status.ExitCode==expected&&status.NativeError==0&&status.WaitResult==0,"Native original exit value");
    Need(status.Id==p.Id&&status.StartUtcTicks==p.StartUtcTicks,"Snapshot retains exact lifetime");
    rows.Add(new{scenario="native-exit",requestedExitCode=expected,delayMilliseconds=delay,status=Status(status)});
   }finally{GoodClose(job.CloseContainment(),"Containment");GoodClose(p.CloseLifetime(),"Process");}
   AbsentEventually(p.Id,p.StartUtcTicks);
   var closed=p.CaptureExitStatus();Need(closed.State==OwnedProcessState.Unavailable&&!closed.ExitCode.HasValue&&closed.NativeError==6,"Disposed lifetime is unavailable, not successful exit");
   GoodClose(p.CloseLifetime(),"Idempotent process close");Reject<ObjectDisposedException>(()=>p.WaitForExit(0));int error;Need(!p.TryTerminate(1,out error)&&error==6,"Closed process cannot be targeted by PID");
  }
 }
 static void TimeoutAndForce(bool closeJob){
  var job=new OwnedProcessJob(128);OwnedProcessLifetime p=null;
  try{
   p=job.StartOwned(helper,"exit 0 5000",output);var before=p.CaptureExitStatus();Need(before.State==OwnedProcessState.Running&&!before.ExitCode.HasValue&&before.WaitResult==258,"Live handle reports Running, no invented exit value");
   Need(!p.WaitForExit(5),"Timeout is not completed exit");
   if(closeJob)GoodClose(job.CloseContainment(),"Forced containment");else{int error;Need(p.TryTerminate(73,out error)&&error==0,"Terminate exact original handle");}
   Need(p.WaitForExit(3000),"Forced termination eventually signaled");var status=p.CaptureExitStatus();Need(status.State==OwnedProcessState.Exited&&status.ExitCode.HasValue,"Forced exit has actual native status");if(!closeJob)Need(status.ExitCode==73,"Explicit termination exit code retained");
   rows.Add(new{scenario=closeJob?"kill-on-job-close":"terminate-owned-handle",timeoutCompletedExit=false,status=Status(status)});
  }finally{GoodClose(job.CloseContainment(),"Containment");if(p!=null){GoodClose(p.CloseLifetime(),"Process");AbsentEventually(p.Id,p.StartUtcTicks);}}
 }
 static void Descendant(){
  string identity=Path.Combine(output,"descendant-identity.txt");var job=new OwnedProcessJob(128);OwnedProcessLifetime p=null;int descendant=0;long creation=0;
  try{
   p=job.StartOwned(helper,"descendant \""+identity+"\"",output);var w=Stopwatch.StartNew();while(!File.Exists(identity)&&w.ElapsedMilliseconds<3000)Thread.Sleep(1);Need(File.Exists(identity),"Original fixture descendant identity observed");string[] parts=File.ReadAllLines(identity);descendant=Int32.Parse(parts[0]);creation=Int64.Parse(parts[1]);Need(!OriginalAbsent(descendant,creation),"Descendant alive before containment close");
   GoodClose(job.CloseContainment(),"Descendant containment");Need(p.WaitForExit(3000),"Parent fixture exited after containment close");AbsentEventually(descendant,creation);rows.Add(new{scenario="inherited-descendant-containment",descendantOriginallyObserved=true,descendantLifetimeAbsent=true,status=Status(p.CaptureExitStatus())});
  }finally{job.Dispose();if(p!=null){p.CloseLifetime();AbsentEventually(p.Id,p.StartUtcTicks);}if(descendant>0)AbsentEventually(descendant,creation);}
 }
 static void LegacyFailure(){
  bool reproduced=false;string error=null;int pid=0;long creation=0;
  using(var job=new LegacyJob(128))using(var p=job.Start(helper,"exit 7 40",output)){
   pid=p.Id;creation=p.StartTime.ToUniversalTime().Ticks;Need(p.WaitForExit(3000),"Legacy original fixture exits");
   try{int ignored=p.ExitCode;GC.KeepAlive(ignored);}catch(InvalidOperationException e){reproduced=true;error=e.Message;}
  }
  Need(reproduced,"Exact original ID-wrapper ExitCode failure reproduced");AbsentEventually(pid,creation);rows.Add(new{scenario="exact-original-57178c5",exitCodeReadFailed=reproduced,error});
 }
 static void UnavailableAndFailures(){
  var job=new OwnedProcessJob(128);OwnedProcessLifetime p=null;
  try{
   p=job.StartOwned(helper,"exit 0 0",output);Need(p.WaitForExit(3000),"Fault fixture original child completed");
   try{
    OwnedProcessNative.FaultWaitResult=0xffffffff;OwnedProcessNative.FaultWaitError=6;var failed=p.CaptureExitStatus();Need(failed.State==OwnedProcessState.Unavailable&&!failed.ExitCode.HasValue&&failed.NativeError==6,"WAIT_FAILED cannot become successful cleanup");Reject<Win32Exception>(()=>p.WaitForExit(0));
    rows.Add(new{scenario="authored-native-wait-failure",status=Status(failed)});
    OwnedProcessNative.FaultWaitResult=null;OwnedProcessNative.FaultWaitError=0;OwnedProcessNative.FaultExitCode=true;failed=p.CaptureExitStatus();Need(failed.State==OwnedProcessState.Unavailable&&!failed.ExitCode.HasValue&&failed.NativeError==5&&failed.WaitResult==0,"Failed exit query remains unavailable despite signaling");rows.Add(new{scenario="authored-native-exit-query-failure",status=Status(failed)});
   }finally{OwnedProcessNative.FaultWaitResult=null;OwnedProcessNative.FaultWaitError=0;OwnedProcessNative.FaultExitCode=false;}
   Need(p.CaptureExitStatus().State==OwnedProcessState.Exited,"Fixture-only query fault removed without changing original lifetime");
   Reject<ArgumentOutOfRangeException>(()=>p.WaitForExit(-1));Reject<ArgumentOutOfRangeException>(()=>p.WaitForExit(60001));
  }finally{job.Dispose();if(p!=null){p.CloseLifetime();AbsentEventually(p.Id,p.StartUtcTicks);}}
  Reject<ArgumentOutOfRangeException>(()=>new OwnedProcessJob(0));
  using(var invalid=new OwnedProcessKernelHandle(IntPtr.Zero))Reject<Win32Exception>(()=>new OwnedProcessLifetime(invalid,1));
  using(var empty=new OwnedProcessJob(128)){Reject<Win32Exception>(()=>empty.StartOwned(Path.Combine(output,"missing-original-fixture.exe"),"",output));GoodClose(empty.CloseContainment(),"Failed-create containment");Reject<ObjectDisposedException>(()=>empty.StartOwned(helper,"exit 0 0",output));}
  var closedJob=new OwnedProcessJob(128);OwnedProcessCloseStatus close=null;IntPtr retained=IntPtr.Zero;
  try{OwnedProcessNative.FaultClose=true;close=closedJob.CloseContainment();retained=OwnedProcessNative.LastFailedCloseHandle;Need(close.Attempted&&!close.Succeeded&&close.NativeError==5,"Authored failed CloseHandle cannot report successful containment cleanup");rows.Add(new{scenario="authored-native-containment-close-failure",close.Attempted,close.Succeeded,close.NativeError});}
  finally{OwnedProcessNative.FaultClose=false;OwnedProcessNative.LastFailedCloseHandle=IntPtr.Zero;if(retained!=IntPtr.Zero)Need(CloseHandle(retained),"Fixture releases its deliberately retained empty job handle");closedJob.Dispose();}
  var processCloseJob=new OwnedProcessJob(128);var processClose=processCloseJob.StartOwned(helper,"exit 0 0",output);retained=IntPtr.Zero;
  try{Need(processClose.WaitForExit(3000),"Process close fault child already stopped");OwnedProcessNative.FaultClose=true;close=processClose.CloseLifetime();retained=OwnedProcessNative.LastFailedCloseHandle;Need(close.Attempted&&!close.Succeeded&&close.NativeError==5,"Authored process-handle close failure retained");Need(processClose.CaptureExitStatus().State==OwnedProcessState.Unavailable,"Closed wrapper after failed close cannot manufacture fresh exit evidence");rows.Add(new{scenario="authored-native-process-close-failure",close.Attempted,close.Succeeded,close.NativeError});}
  finally{OwnedProcessNative.FaultClose=false;OwnedProcessNative.LastFailedCloseHandle=IntPtr.Zero;if(retained!=IntPtr.Zero)Need(CloseHandle(retained),"Fixture releases deliberately retained exited process handle");processCloseJob.Dispose();processClose.Dispose();AbsentEventually(processClose.Id,processClose.StartUtcTicks);}
 }
 static void AuthoredStartFailure(bool afterResume){
  var job=new OwnedProcessJob(128);OwnedProcessStartException failure=null;
  try{
   if(afterResume)OwnedProcessNative.FaultAfterResume=true;else OwnedProcessNative.FaultAfterJobAssignment=true;
   try{job.StartOwned(helper,"exit 0 5000",output);}catch(OwnedProcessStartException e){failure=e;}
  }finally{OwnedProcessNative.FaultAfterResume=false;OwnedProcessNative.FaultAfterJobAssignment=false;GoodClose(job.CloseContainment(),"Start-failure containment");}
  Need(failure!=null,"Authored post-create failure retains typed original lifetime");Need(failure.Id>0&&failure.StartUtcTicks>0,"Post-create failure identifies original native child");Need(failure.ExitVerified&&failure.WaitNativeError==0,"Post-create failure verifies exact-handle exit");GoodClose(failure.PrimaryThreadCloseStatus,"Start-failure primary thread");GoodClose(failure.ProcessCloseStatus,"Start-failure process");AbsentEventually(failure.Id,failure.StartUtcTicks);
  rows.Add(new{scenario=afterResume?"authored-failure-after-resume":"authored-failure-before-resume",failure.TerminationRequested,failure.TerminationNativeError,failure.ExitVerified,failure.WaitNativeError,primaryThreadClose=failure.PrimaryThreadCloseStatus,processClose=failure.ProcessCloseStatus});
 }
 public static int Main(string[] args){try{
  if(args.Length!=2)throw new ArgumentException("Original helper and fresh fixture directory required");helper=Path.GetFullPath(args[0]);output=Path.GetFullPath(args[1]);if(!File.Exists(helper)||Directory.Exists(output))throw new ArgumentException("Fresh bounded original process fixtures required");Directory.CreateDirectory(output);
  LegacyFailure();Normal(0,0);Normal(7,15);Normal(37,0);Normal(259,0);Normal(UInt32.MaxValue,0);TimeoutAndForce(false);TimeoutAndForce(true);Descendant();UnavailableAndFailures();AuthoredStartFailure(false);AuthoredStartFailure(true);
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{schema=1,passed=true,checks,scenarios=rows,scope="Original short-lived device-free process fixtures only. Native failure injections are explicitly authored and compile out of production. No endpoint, game, recording or deployment.",allOriginalFixtureLifetimesAbsent=true}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
