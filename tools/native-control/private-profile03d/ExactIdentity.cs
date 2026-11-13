using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace RichAudio.GateA.Private01.Supervision {
 public sealed class ExactIdentity {
  public int ProcessId {get;set;}
  public long CreationFileTime {get;set;}
  public long CreationUtcTicks {get;set;}
  public string Executable {get;set;}
  public string CanonicalPath {get;set;}
  public string FileIdentity {get;set;}
  public string Sha256 {get;set;}
  [StructLayout(LayoutKind.Sequential)] struct Times { public uint Low,High; }
  [StructLayout(LayoutKind.Sequential)] struct Info {
   public uint Attributes;public Times Creation,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out Times creation,out Times exit,out Times kernel,out Times user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref int length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint length,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  static void Require(bool ok){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error());}
  public static ExactIdentity Capture(int pid){
   // Query metadata and synchronize only. No VM_READ, memory inspection or injection.
   IntPtr handle=OpenProcess(0x1000|0x100000,false,pid);Require(handle!=IntPtr.Zero);
   try {
    Require(WaitForSingleObject(handle,0)==258);
    Times creation,exit,kernel,user;Require(GetProcessTimes(handle,out creation,out exit,out kernel,out user));
    long ft=((long)creation.High<<32)|creation.Low;
    var path=new StringBuilder(32768);int length=path.Capacity;
    Require(QueryFullProcessImageName(handle,0,path,ref length));string executable=Path.GetFullPath(path.ToString());
    SupervisorFiles.NoLinks(executable);
    using(var file=new FileStream(executable,FileMode.Open,FileAccess.Read,FileShare.Read)) {
     Info info;Require(GetFileInformationByHandle(file.SafeFileHandle,out info));
     if(info.Links!=1)throw new InvalidDataException("multiple executable hard links refused");
     var canonical=new StringBuilder(32768);uint count=GetFinalPathNameByHandle(file.SafeFileHandle,canonical,(uint)canonical.Capacity,0);
     Require(count>0&&count<canonical.Capacity);string final=canonical.ToString();
     if(final.StartsWith(@"\\?\UNC\",StringComparison.OrdinalIgnoreCase))final=@"\\"+final.Substring(8);
     else if(final.StartsWith(@"\\?\",StringComparison.Ordinal))final=final.Substring(4);
     string digest;using(var hash=SHA256.Create())digest=SupervisorFiles.Hex(hash.ComputeHash(file));
     Require(WaitForSingleObject(handle,0)==258);
     using(var managed=Process.GetProcessById(pid)) {
      if(managed.StartTime.ToUniversalTime().Ticks!=DateTime.FromFileTimeUtc(ft).Ticks)
       throw new InvalidDataException("native FILETIME and managed probe binding disagree");
     }
     return new ExactIdentity{ProcessId=pid,CreationFileTime=ft,CreationUtcTicks=DateTime.FromFileTimeUtc(ft).Ticks,
      Executable=executable,CanonicalPath=final,FileIdentity=info.Volume.ToString("x8")+":"+info.IndexHigh.ToString("x8")+info.IndexLow.ToString("x8"),Sha256=digest};
    }
   } finally {CloseHandle(handle);}
  }
  public static string[] Differences(ExactIdentity expected,ExactIdentity observed){
   if(expected==null||observed==null)return new[]{"identity-unavailable"};
   var fields=new System.Collections.Generic.List<string>();
   if(expected.ProcessId!=observed.ProcessId)fields.Add("ProcessId");
   if(expected.CreationFileTime!=observed.CreationFileTime)fields.Add("CreationFileTime");
   if(expected.CreationUtcTicks!=observed.CreationUtcTicks)fields.Add("CreationUtcTicks");
   if(!String.Equals(expected.Executable,observed.Executable,StringComparison.OrdinalIgnoreCase))fields.Add("Executable");
   if(!String.Equals(expected.CanonicalPath,observed.CanonicalPath,StringComparison.OrdinalIgnoreCase))fields.Add("CanonicalPath");
   if(expected.FileIdentity!=observed.FileIdentity)fields.Add("FileIdentity");
   if(expected.Sha256!=observed.Sha256)fields.Add("Sha256");
   return fields.ToArray();
  }
 }
}
