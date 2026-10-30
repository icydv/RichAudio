using System;using System.Diagnostics;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
namespace RichAudio.Beacon.Transport {
 public sealed class OwnedProcessJob:IDisposable {
  sealed class JobHandle:SafeHandleZeroOrMinusOneIsInvalid {public JobHandle(IntPtr p):base(true){SetHandle(p);}protected override bool ReleaseHandle(){return CloseHandle(handle);}}
  [StructLayout(LayoutKind.Sequential)]struct Basic{public long ProcessTime,JobTime;public uint Flags;public UIntPtr Min,Max;public uint Count;public UIntPtr Affinity;public uint Priority,Scheduling;}
  [StructLayout(LayoutKind.Sequential)]struct Io{public ulong R,W,O,RB,WB,OB;}
  [StructLayout(LayoutKind.Sequential)]struct Extended{public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
  [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(JobHandle job,int kind,IntPtr value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(JobHandle job,IntPtr process);
  [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup {public uint Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,CharsX,CharsY,Fill,Flags;public ushort Show,ReservedBytes;public IntPtr ReservedData,Input,Output,Error;}
  [StructLayout(LayoutKind.Sequential)]struct Created {public IntPtr Process,Thread;public uint Pid,Tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,System.Text.StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Created created);
  [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr process,uint code);
  readonly JobHandle job;
  public OwnedProcessJob(int memoryMiB=1024){job=new JobHandle(CreateJobObject(IntPtr.Zero,null));if(job.IsInvalid)throw new System.ComponentModel.Win32Exception();var info=new Extended();info.Basic.Flags=0x2000|0x8|0x200;info.Basic.Count=12;info.JobMemory=new UIntPtr((ulong)memoryMiB*1024*1024);int size=Marshal.SizeOf(typeof(Extended));IntPtr data=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(info,data,false);if(!SetInformationJobObject(job,9,data,(uint)size)){int error=Marshal.GetLastWin32Error();job.Dispose();throw new System.ComponentModel.Win32Exception(error);}}finally{Marshal.FreeHGlobal(data);}}
  public void Assign(Process p){if(!AssignProcessToJobObject(job,p.Handle))throw new System.ComponentModel.Win32Exception();}
  // The child cannot spawn descendants before entering our kill-on-close job.
  public Process Start(string executable,string arguments,string directory,bool visible=false){
   if(executable.IndexOf('"')>=0)throw new ArgumentException("executable quotes");var startup=new Startup();startup.Size=(uint)Marshal.SizeOf(typeof(Startup));startup.Flags=1;startup.Show=(ushort)(visible?1:0);Created child;
   if(!CreateProcess(executable,new System.Text.StringBuilder("\""+executable+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,directory,ref startup,out child))throw new System.ComponentModel.Win32Exception();
   try{if(!AssignProcessToJobObject(job,child.Process)||ResumeThread(child.Thread)==UInt32.MaxValue){int error=Marshal.GetLastWin32Error();TerminateProcess(child.Process,1);throw new System.ComponentModel.Win32Exception(error);}return Process.GetProcessById((int)child.Pid);}
   finally{CloseHandle(child.Thread);CloseHandle(child.Process);}
  }
  public void Dispose(){job.Dispose();}
 }
}
