using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace RichAudio.Beacon.Transport {
 public enum OwnedProcessState { Running, Exited, Unavailable }
 public sealed class OwnedProcessCloseStatus {
  public readonly bool Attempted, Succeeded;
  public readonly int NativeError;
  internal OwnedProcessCloseStatus(bool attempted,bool succeeded,int nativeError){Attempted=attempted;Succeeded=succeeded;NativeError=nativeError;}
 }
 public sealed class OwnedProcessExitStatus {
  public readonly OwnedProcessState State;
  public readonly uint? ExitCode;
  public readonly uint WaitResult;
  public readonly int NativeError, Id;
  public readonly long StartUtcTicks;
  internal OwnedProcessExitStatus(OwnedProcessState state,uint? code,uint wait,int error,int id,long creation){State=state;ExitCode=code;WaitResult=wait;NativeError=error;Id=id;StartUtcTicks=creation;}
 }
 public sealed class OwnedProcessStartException : InvalidOperationException {
  public readonly int Id;public readonly long StartUtcTicks;
  public readonly bool TerminationRequested,ExitVerified;
  public readonly int TerminationNativeError,WaitNativeError;
  public readonly OwnedProcessCloseStatus PrimaryThreadCloseStatus,ProcessCloseStatus;
  internal OwnedProcessStartException(Exception original,int id,long creation,bool terminated,int terminateError,bool exitVerified,int waitError,OwnedProcessCloseStatus threadClose,OwnedProcessCloseStatus processClose)
   :base("Owned child start failed; originalPid="+id+", originalStartUtcTicks="+creation+", terminationRequested="+terminated+", terminationError="+terminateError+", exitVerified="+exitVerified+", waitError="+waitError+", primaryThreadCloseSucceeded="+threadClose.Succeeded+", primaryThreadCloseError="+threadClose.NativeError+", processHandleCloseSucceeded="+processClose.Succeeded+", processHandleCloseError="+processClose.NativeError+". Incomplete cleanup must not be reported as success.",original){Id=id;StartUtcTicks=creation;TerminationRequested=terminated;TerminationNativeError=terminateError;ExitVerified=exitVerified;WaitNativeError=waitError;PrimaryThreadCloseStatus=threadClose;ProcessCloseStatus=processClose;}
 }
 // Original CreateProcess handles are authoritative until explicitly closed.
 // These control-thread APIs never run in an audio callback or reopen by PID.
 public sealed class OwnedProcessLifetime : IDisposable {
  readonly object gate=new object();readonly OwnedProcessKernelHandle process;
  public readonly int Id;public readonly long StartUtcTicks;
  public OwnedProcessCloseStatus PrimaryThreadCloseStatus {get;internal set;}
  internal OwnedProcessKernelHandle Handle {get{return process;}}
  internal OwnedProcessLifetime(OwnedProcessKernelHandle handle,uint expectedPid){
   process=handle;uint actual=OwnedProcessNative.GetProcessId(process);
   if(actual==0)throw new Win32Exception(Marshal.GetLastWin32Error(),"Original process identity unavailable");
   if(actual!=expectedPid||actual>Int32.MaxValue)throw new InvalidOperationException("Original process handle identity mismatch");
   long created,exited,kernel,user;
   if(!OwnedProcessNative.GetProcessTimes(process,out created,out exited,out kernel,out user))throw new Win32Exception(Marshal.GetLastWin32Error(),"Original process creation time unavailable");
   Id=(int)actual;StartUtcTicks=DateTime.FromFileTimeUtc(created).Ticks;
   if(StartUtcTicks<=0)throw new InvalidOperationException("Original process creation time invalid");
  }
  public bool WaitForExit(int milliseconds){
   if(milliseconds<0||milliseconds>60000)throw new ArgumentOutOfRangeException("milliseconds","A bounded wait from zero through sixty seconds is required");
   lock(gate){if(process.IsClosed||process.IsInvalid)throw new ObjectDisposedException("OwnedProcessLifetime");int error;uint result=OwnedProcessNative.Wait(process,(uint)milliseconds,out error);if(result==OwnedProcessNative.WaitObject0)return true;if(result==OwnedProcessNative.WaitTimeout)return false;throw new Win32Exception(error==0?6:error,"Original process wait status unavailable");}
  }
  public OwnedProcessExitStatus CaptureExitStatus(){
   lock(gate){
    if(process.IsClosed||process.IsInvalid)return new OwnedProcessExitStatus(OwnedProcessState.Unavailable,null,OwnedProcessNative.WaitFailed,6,Id,StartUtcTicks);
    int error;uint result=OwnedProcessNative.Wait(process,0,out error);
    if(result==OwnedProcessNative.WaitTimeout)return new OwnedProcessExitStatus(OwnedProcessState.Running,null,result,0,Id,StartUtcTicks);
    if(result!=OwnedProcessNative.WaitObject0)return new OwnedProcessExitStatus(OwnedProcessState.Unavailable,null,result,error==0?6:error,Id,StartUtcTicks);
    uint code;if(!OwnedProcessNative.ExitCode(process,out code,out error))return new OwnedProcessExitStatus(OwnedProcessState.Unavailable,null,result,error,Id,StartUtcTicks);
    // Signaling distinguishes a genuine application exit value259 from an
    // unsignaled process's STILL_ACTIVE result.
    return new OwnedProcessExitStatus(OwnedProcessState.Exited,code,result,0,Id,StartUtcTicks);
   }
  }
  public bool TryTerminate(uint exitCode,out int nativeError){lock(gate){if(process.IsClosed||process.IsInvalid){nativeError=6;return false;}bool ok=OwnedProcessNative.TerminateProcess(process,exitCode);nativeError=ok?0:Marshal.GetLastWin32Error();return ok;}}
  public OwnedProcessCloseStatus CloseLifetime(){lock(gate){process.Dispose();return process.CloseStatus;}}
  public void Dispose(){CloseLifetime();}
 }
 internal sealed class OwnedProcessKernelHandle : SafeHandleZeroOrMinusOneIsInvalid {
  bool closeAttempted,closeSucceeded;int closeError;
  internal OwnedProcessCloseStatus CloseStatus {get{return new OwnedProcessCloseStatus(closeAttempted,closeSucceeded,closeError);}}
  internal OwnedProcessKernelHandle(IntPtr raw):base(true){SetHandle(raw);}
  protected override bool ReleaseHandle(){int error;bool ok=OwnedProcessNative.Close(handle,out error);closeError=error;closeSucceeded=ok;closeAttempted=true;return ok;}
 }
 internal static class OwnedProcessNative {
  internal const uint WaitObject0=0,WaitTimeout=258,WaitFailed=0xffffffff;
  [DllImport("kernel32.dll",SetLastError=true)]internal static extern uint GetProcessId(OwnedProcessKernelHandle process);
  [DllImport("kernel32.dll",SetLastError=true)]internal static extern bool GetProcessTimes(OwnedProcessKernelHandle process,out long creation,out long exit,out long kernel,out long user);
  [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(OwnedProcessKernelHandle process,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(OwnedProcessKernelHandle process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)]internal static extern bool TerminateProcess(OwnedProcessKernelHandle process,uint code);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
  internal static uint Wait(OwnedProcessKernelHandle process,uint milliseconds,out int error){
#if OWNED_PROCESS_FIXTURES
   if(FaultWaitResult.HasValue){error=FaultWaitError;return FaultWaitResult.Value;}
#endif
   uint result=WaitForSingleObject(process,milliseconds);error=result==WaitFailed?Marshal.GetLastWin32Error():0;return result;
  }
  internal static bool ExitCode(OwnedProcessKernelHandle process,out uint code,out int error){
#if OWNED_PROCESS_FIXTURES
   if(FaultExitCode){code=0;error=5;return false;}
#endif
   bool ok=GetExitCodeProcess(process,out code);error=ok?0:Marshal.GetLastWin32Error();return ok;
  }
  internal static bool Close(IntPtr handle,out int error){
#if OWNED_PROCESS_FIXTURES
   if(FaultClose){LastFailedCloseHandle=handle;error=5;return false;}
#endif
   bool ok=CloseHandle(handle);error=ok?0:Marshal.GetLastWin32Error();return ok;
  }
#if OWNED_PROCESS_FIXTURES
  // These authored faults compile only into the fixture assembly. No runtime
  // fault switches are present in the production candidate.
  internal static uint? FaultWaitResult;internal static int FaultWaitError;
  internal static bool FaultExitCode,FaultClose,FaultAfterJobAssignment,FaultAfterResume;internal static IntPtr LastFailedCloseHandle;
#endif
 }
 public sealed class OwnedProcessJob : IDisposable {
  [StructLayout(LayoutKind.Sequential)]struct Basic{public long ProcessTime,JobTime;public uint Flags;public UIntPtr Min,Max;public uint Count;public UIntPtr Affinity;public uint Priority,Scheduling;}
  [StructLayout(LayoutKind.Sequential)]struct Io{public ulong R,W,O,RB,WB,OB;}
  [StructLayout(LayoutKind.Sequential)]struct Extended{public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
  [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(OwnedProcessKernelHandle job,int kind,IntPtr value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(OwnedProcessKernelHandle job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(OwnedProcessKernelHandle job,OwnedProcessKernelHandle process);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup{public uint Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,CharsX,CharsY,Fill,Flags;public ushort Show,ReservedBytes;public IntPtr ReservedData,Input,Output,Error;}
  [StructLayout(LayoutKind.Sequential)]struct Created{public IntPtr Process,Thread;public uint Pid,Tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,System.Text.StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Created created);
  [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr process,uint code);
  readonly object gate=new object();readonly OwnedProcessKernelHandle job;
  public OwnedProcessJob(int memoryMiB=1024){
   if(memoryMiB<1||memoryMiB>65536)throw new ArgumentOutOfRangeException("memoryMiB");
   job=new OwnedProcessKernelHandle(CreateJobObject(IntPtr.Zero,null));if(job.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error(),"Owned job creation failed");
   var info=new Extended();info.Basic.Flags=0x2000|0x8|0x200;info.Basic.Count=12;info.JobMemory=new UIntPtr((ulong)memoryMiB*1024*1024);int size=Marshal.SizeOf(typeof(Extended));IntPtr data=Marshal.AllocHGlobal(size);
   try{Marshal.StructureToPtr(info,data,false);if(!SetInformationJobObject(job,9,data,(uint)size)){int error=Marshal.GetLastWin32Error();job.Dispose();throw new Win32Exception(error,"Owned job limits failed");}}finally{Marshal.FreeHGlobal(data);}
  }
  public void Assign(Process p){if(!AssignProcessToJobObject(job,p.Handle))throw new Win32Exception();}
  // Compatibility route retained for existing callers. The experimental
  // supervisor uses StartOwned for authoritative native exit evidence.
  public Process Start(string executable,string arguments,string directory,bool visible=false){
   if(executable.IndexOf('"')>=0)throw new ArgumentException("executable quotes");var startup=new Startup();startup.Size=(uint)Marshal.SizeOf(typeof(Startup));startup.Flags=1;startup.Show=(ushort)(visible?1:0);Created child;
   if(!CreateProcess(executable,new System.Text.StringBuilder("\""+executable+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,directory,ref startup,out child))throw new Win32Exception();
   try{if(!AssignProcessToJobObject(job,child.Process)||ResumeThread(child.Thread)==UInt32.MaxValue){int error=Marshal.GetLastWin32Error();TerminateProcess(child.Process,1);throw new Win32Exception(error);}return Process.GetProcessById((int)child.Pid);}
   finally{CloseHandle(child.Thread);CloseHandle(child.Process);}
  }
  public OwnedProcessLifetime StartOwned(string executable,string arguments,string directory,bool visible=false){
   if(String.IsNullOrWhiteSpace(executable)||executable.IndexOf('"')>=0||executable.IndexOf('\r')>=0||executable.IndexOf('\n')>=0)throw new ArgumentException("Literal executable required");
   lock(gate){
    if(job.IsClosed||job.IsInvalid)throw new ObjectDisposedException("OwnedProcessJob");
    var startup=new Startup();startup.Size=(uint)Marshal.SizeOf(typeof(Startup));startup.Flags=1;startup.Show=(ushort)(visible?1:0);Created child;
    if(!CreateProcess(executable,new System.Text.StringBuilder("\""+executable+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,directory,ref startup,out child))throw new Win32Exception(Marshal.GetLastWin32Error(),"Owned suspended child creation failed");
    var processHandle=new OwnedProcessKernelHandle(child.Process);OwnedProcessLifetime lifetime=null;bool returned=false;
    try{
     lifetime=new OwnedProcessLifetime(processHandle,child.Pid);
     if(!AssignProcessToJobObject(job,processHandle))throw new Win32Exception(Marshal.GetLastWin32Error(),"Owned child job assignment failed");
#if OWNED_PROCESS_FIXTURES
     if(OwnedProcessNative.FaultAfterJobAssignment)throw new InvalidOperationException("Authored fixture failure after suspended job assignment");
#endif
     if(ResumeThread(child.Thread)==UInt32.MaxValue)throw new Win32Exception(Marshal.GetLastWin32Error(),"Owned child resume failed");
#if OWNED_PROCESS_FIXTURES
     if(OwnedProcessNative.FaultAfterResume)throw new InvalidOperationException("Authored fixture failure after resume");
#endif
     int closeError;bool threadClosed=OwnedProcessNative.Close(child.Thread,out closeError);child.Thread=IntPtr.Zero;lifetime.PrimaryThreadCloseStatus=new OwnedProcessCloseStatus(true,threadClosed,closeError);
     if(!threadClosed)throw new Win32Exception(closeError,"Owned primary thread handle close failed");
     returned=true;return lifetime;
    }
    catch(Exception original){
     int terminateError;bool terminated=lifetime!=null?lifetime.TryTerminate(1,out terminateError):TerminateRaw(processHandle,out terminateError);bool exitVerified=false;int waitError=0;
     // Even TerminateProcess can race with an already completed child. Only
     // the retained handle's signaled state establishes completed exit.
     try{int error;uint wait=OwnedProcessNative.Wait(processHandle,3000,out error);exitVerified=wait==OwnedProcessNative.WaitObject0;waitError=error;}catch(Exception e){waitError=e is Win32Exception?((Win32Exception)e).NativeErrorCode:6;}
     OwnedProcessCloseStatus threadClose=lifetime==null?null:lifetime.PrimaryThreadCloseStatus;
     if(child.Thread!=IntPtr.Zero){int error;bool closed=OwnedProcessNative.Close(child.Thread,out error);child.Thread=IntPtr.Zero;threadClose=new OwnedProcessCloseStatus(true,closed,error);}
     if(threadClose==null)threadClose=new OwnedProcessCloseStatus(false,false,0);
     processHandle.Dispose();
     throw new OwnedProcessStartException(original,(int)child.Pid,lifetime==null?0:lifetime.StartUtcTicks,terminated,terminateError,exitVerified,waitError,threadClose,processHandle.CloseStatus);
    }
    finally{if(child.Thread!=IntPtr.Zero)CloseHandle(child.Thread);if(!returned)processHandle.Dispose();}
   }
  }
  static bool TerminateRaw(OwnedProcessKernelHandle process,out int error){bool ok=OwnedProcessNative.TerminateProcess(process,1);error=ok?0:Marshal.GetLastWin32Error();return ok;}
  public OwnedProcessCloseStatus CloseContainment(){lock(gate){job.Dispose();return job.CloseStatus;}}
  public void Dispose(){CloseContainment();}
 }
}
