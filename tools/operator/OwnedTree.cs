using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
// Independent, device-free Windows containment broker. No PID/name-based kills.
class OwnedTree {
 [StructLayout(LayoutKind.Sequential)] struct SI { public uint cb; public IntPtr reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC { public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct IO { public ulong r,w,o,rb,wb,ob; }
 [StructLayout(LayoutKind.Sequential)] struct EXT { public BASIC basic; public IO io; public UIntPtr pm,jm,peakp,peakj; }
 [StructLayout(LayoutKind.Sequential)] struct ACCOUNT { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j,int c,ref EXT e,uint l);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr j,int c,out ACCOUNT a,uint l,IntPtr ret);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr j,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr p,uint code);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref SI si,out PI pi);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr t);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static void Check(bool ok) { if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
 static string Quote(string s) { return "\""+System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)\""", "$1$1\\\"")+new string('\\',s.Length-s.TrimEnd('\\').Length)+"\""; }
 static int Main(string[] args) {
  IntPtr job=IntPtr.Zero; PI pi=new PI(); bool assigned=false,forced=false,verified=false; uint exit=99; var clock=new Stopwatch();
  try {
   if(args.Length<4)throw new ArgumentException("kill-ms end-ms executable arguments required");
   int kill=int.Parse(args[0]),end=int.Parse(args[1]); if(kill<=0||kill>65000||end<=kill||end>70000)throw new ArgumentException("bounded budget");
   job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero); var ext=new EXT();ext.basic.flags=0x2000; // KILL_ON_JOB_CLOSE; no breakaway flags, handle not inheritable
   Check(SetInformationJobObject(job,9,ref ext,(uint)Marshal.SizeOf(ext)));
   var si=new SI();si.cb=(uint)Marshal.SizeOf(si);si.flags=0x100;si.input=GetStdHandle(-10);si.output=GetStdHandle(-11);si.error=GetStdHandle(-12);
   var cmd=new StringBuilder();for(int i=2;i<args.Length;i++){if(i>2)cmd.Append(' ');cmd.Append(Quote(args[i]));}
   Check(CreateProcess(args[2],cmd,IntPtr.Zero,IntPtr.Zero,true,0x4|0x08000000,IntPtr.Zero,Environment.CurrentDirectory,ref si,out pi));
   Check(AssignProcessToJobObject(job,pi.process));assigned=true;clock.Start();Check(ResumeThread(pi.thread)!=0xffffffff);CloseHandle(pi.thread);pi.thread=IntPtr.Zero;
   long parentExit=-1; ACCOUNT a; uint total=0,peakActive=0;
   while(clock.ElapsedMilliseconds<end) {
    Check(QueryInformationJobObject(job,1,out a,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero));
    total=a.total;peakActive=Math.Max(peakActive,a.active);if(a.active==0){verified=true;break;}
    if(WaitForSingleObject(pi.process,0)==0&&parentExit<0)parentExit=clock.ElapsedMilliseconds;
    if(!forced&&(clock.ElapsedMilliseconds>=kill||(parentExit>=0&&clock.ElapsedMilliseconds-parentExit>=Math.Min(3000,end-kill)))){Check(TerminateJobObject(job,91));forced=true;}
    Thread.Sleep(10);
   }
   Check(GetExitCodeProcess(pi.process,out exit));
   // All potentially blocking reporting occurs AFTER deadline execution/verification.
   Console.WriteLine("OWNER_RESULT "+"{\"verifiedTreeExit\":"+verified.ToString().ToLowerInvariant()+",\"forcedTreeCleanup\":"+forced.ToString().ToLowerInvariant()+",\"elapsedMs\":"+clock.ElapsedMilliseconds+",\"supervisorExit\":"+exit+",\"totalOwnedProcesses\":"+total+",\"peakActiveProcesses\":"+peakActive+"}");
   return verified&&exit==0?0:92;
  } catch(Exception e) { if(pi.process!=IntPtr.Zero&&!assigned) {TerminateProcess(pi.process,93);WaitForSingleObject(pi.process,5000);} Console.Error.WriteLine("Containment failure: "+e.GetType().Name);return 93; }
  finally {if(job!=IntPtr.Zero)CloseHandle(job);if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);}
 }
}
