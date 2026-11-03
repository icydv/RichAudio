// This helper is deliberately header-only: no RPF directory/resource parser,
// game executable, cryptography/key loader, endpoint or network API is called.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

public static class World04HeaderCandidate {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=12};
 static void Need(bool ok,string why){if(!ok)throw new Exception(why);}
 static string Sha(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static string HashFile(string p){return Sha(File.ReadAllBytes(p));}
 static string Text(Dictionary<string,object> d,string k){Need(d.ContainsKey(k)&&d[k] is string,"missing manifest string: "+k);return (string)d[k];}
 static string Full(string p){return Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar);}
 static void WriteNew(string file,string text){byte[] bytes=new UTF8Encoding(false).GetBytes(text);Need(bytes.Length<=4096,"fixed receipt output cap");using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}}
 static void CleanEnvironment(){foreach(System.Collections.DictionaryEntry pair in Environment.GetEnvironmentVariables()){string key=((string)pair.Key).ToUpperInvariant();if(key=="DOTNET_CLI_TELEMETRY_OPTOUT"||key=="DOTNET_NOLOGO")continue;Need(!key.StartsWith("COR_")&&!key.StartsWith("CORECLR_")&&!key.StartsWith("COMPLUS_")&&!key.StartsWith("DOTNET_")&&key!="APPDOMAIN_MANAGER_ASM"&&key!="APPDOMAIN_MANAGER_TYPE"&&key!="DEVPATH","CLR injection/override environment refused: "+key);}}
 static object[] RuntimePins(){
  // Trusted Windows/.NET remain the platform. Record and bind the actual CLR,
  // native modules and managed assembly files loaded by this exact program.
  var files=new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(var assembly in AppDomain.CurrentDomain.GetAssemblies())if(!assembly.IsDynamic&&!string.IsNullOrEmpty(assembly.Location))files.Add(assembly.Location);
  foreach(ProcessModule module in Process.GetCurrentProcess().Modules)files.Add(module.FileName);
  files.Add(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(),@"Config\machine.config"));
  var result=new List<object>();foreach(string file in files)result.Add(new {file,sha256=HashFile(file)});return result.ToArray();
 }
 static void CheckRuntime(Dictionary<string,object> manifest){
  Need(!File.Exists(Process.GetCurrentProcess().MainModule.FileName+".config"),"unreviewed executable config refused");
  var expected=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(object item in (System.Collections.IEnumerable)manifest["runtimePins"]){var pin=(Dictionary<string,object>)item;expected.Add(Text(pin,"file"),Text(pin,"sha256"));}
  foreach(object item in RuntimePins()){var map=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(item));string file=Text(map,"file");Need(expected.ContainsKey(file)&&expected[file]==Text(map,"sha256"),"loaded runtime closure drift: "+Path.GetFileName(file));}
  foreach(var pin in expected)Need(HashFile(pin.Key)==pin.Value,"pinned runtime file drift");
 }
 const uint Read=0x80000000,ShareRead=1,OpenExisting=3,NoFollow=0x00200000,DirectoryFlag=0x02000000,Reparse=0x400;
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string p,uint a,uint s,IntPtr sa,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out NativeFileInfo i);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadFile(SafeFileHandle h,[Out]byte[] bytes,uint count,out uint read,IntPtr overlapped);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(SafeFileHandle h,StringBuilder p,uint n,uint flags);
 [StructLayout(LayoutKind.Sequential)]struct NativeFileInfo {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr j,int c,ref JobInfo i,uint n);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")]static extern bool TerminateJobObject(IntPtr j,uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [StructLayout(LayoutKind.Sequential)]struct BasicLimits {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IoCounters {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)]struct JobInfo {public BasicLimits Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}

 static List<SafeFileHandle> PinParents(string full){
  var handles=new List<SafeFileHandle>();try{
   for(string p=Path.GetDirectoryName(full);p!=null;p=Path.GetDirectoryName(p)){
    var h=CreateFile(p,0,ShareRead,IntPtr.Zero,OpenExisting,NoFollow|DirectoryFlag,IntPtr.Zero);Need(!h.IsInvalid,"no-follow parent open failed");handles.Add(h);NativeFileInfo f;Need(GetFileInformationByHandle(h,out f)&&(f.Attributes&Reparse)==0,"reparse parent refused");
   }return handles;
  }catch{foreach(var h in handles)h.Dispose();throw;}
 }
 static byte[] ReadManifest(string full){
  var parents=PinParents(full);try{
   using(var handle=CreateFile(full,Read,ShareRead,IntPtr.Zero,OpenExisting,NoFollow,IntPtr.Zero)){
    Need(!handle.IsInvalid,"bounded manifest open failed");NativeFileInfo before;Need(GetFileInformationByHandle(handle,out before)&&(before.Attributes&(Reparse|0x10))==0&&before.SizeHigh==0&&before.SizeLow>0&&before.SizeLow<=16384,"bounded regular manifest required");
    // Fixed allocation and one bounded syscall: a changing file can never make
    // ReadAllBytes allocate an unbounded buffer before digest validation.
    var buffer=new byte[16384];uint actual;Need(ReadFile(handle,buffer,before.SizeLow,out actual,IntPtr.Zero)&&actual==before.SizeLow,"single bounded manifest read failed");
    NativeFileInfo after;Need(GetFileInformationByHandle(handle,out after)&&before.Volume==after.Volume&&before.IndexHigh==after.IndexHigh&&before.IndexLow==after.IndexLow&&before.SizeHigh==after.SizeHigh&&before.SizeLow==after.SizeLow&&before.Write.dwHighDateTime==after.Write.dwHighDateTime&&before.Write.dwLowDateTime==after.Write.dwLowDateTime,"manifest changed during bounded read");
    var bytes=new byte[actual];Array.Copy(buffer,bytes,actual);return bytes;
   }
  }finally{foreach(var handle in parents)handle.Dispose();}
 }
 static object ReadHeader(string full){
  var parents=PinParents(full);try{
   using(var handle=CreateFile(full,Read,ShareRead,IntPtr.Zero,OpenExisting,NoFollow,IntPtr.Zero)){
    Need(!handle.IsInvalid,"read-only exact archive open failed");NativeFileInfo before;Need(GetFileInformationByHandle(handle,out before)&&(before.Attributes&(Reparse|0x10))==0,"regular no-follow archive required");
    var final=new StringBuilder(32768);uint length=GetFinalPathNameByHandle(handle,final,(uint)final.Capacity,0);Need(length>0&&length<final.Capacity,"final handle path unavailable");
    string resolved=final.ToString();if(resolved.StartsWith(@"\\?\"))resolved=resolved.Substring(4);Need(string.Equals(Full(resolved),Full(full),StringComparison.OrdinalIgnoreCase),"final handle path mismatch");
    long size=((long)before.SizeHigh<<32)|before.SizeLow;Need(size>=16,"archive shorter than fixed header");var bytes=new byte[16];
    uint actual;Need(ReadFile(handle,bytes,16,out actual,IntPtr.Zero)&&actual==16,"single exact ReadFile header failed; no retry");
    NativeFileInfo after;Need(GetFileInformationByHandle(handle,out after)&&before.Volume==after.Volume&&before.IndexHigh==after.IndexHigh&&before.IndexLow==after.IndexLow&&before.SizeHigh==after.SizeHigh&&before.SizeLow==after.SizeLow&&before.Write.dwHighDateTime==after.Write.dwHighDateTime&&before.Write.dwLowDateTime==after.Write.dwLowDateTime,"archive identity changed during fixed read");
    return new {kind="world04-exact-header-result",bytesRead=16,headerHex=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant(),headerSHA256=Sha(bytes),archiveBytes=size,
     volume=before.Volume,fileIndexHigh=before.IndexHigh,fileIndexLow=before.IndexLow,lastWriteHigh=before.Write.dwHighDateTime,lastWriteLow=before.Write.dwLowDateTime,
     rpf7=BitConverter.ToUInt32(bytes,0)==0x52504637,declaredEntryCount=BitConverter.ToUInt32(bytes,4),declaredNamesBytes=BitConverter.ToUInt32(bytes,8),encryptionTag=BitConverter.ToUInt32(bytes,12),
     memberPayloadsRead=0,tableBytesRead=0,keysRead=0,installationQualified=false};
   }
  }finally{foreach(var h in parents)h.Dispose();}
 }
 public static int Main(string[] args){
  try{
   CleanEnvironment();
   if(args.Length==1&&args[0]=="--runtime-pins"){Json.Serialize(new {warmup=true});Console.WriteLine(Json.Serialize(RuntimePins()));return 0;}
   if(args.Length==4&&args[0]=="--header"){
    string manifestPath=Encoding.UTF8.GetString(Convert.FromBase64String(args[1]));byte[] bytes=ReadManifest(manifestPath);Need(Sha(bytes)==args[3],"child manifest binding");
    var childManifest=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes));CheckRuntime(childManifest);
    // Trusted fixed helper waits before any private-file operation. Before job
    // assignment or after supervisor loss it times out without opening a file.
    using(var gate=EventWaitHandle.OpenExisting(args[2]))Need(gate.WaitOne(5000),"supervision gate timeout");
    if(Text(childManifest,"mode")=="synthetic-offline-test"&&childManifest.ContainsKey("syntheticDelayMs")){int delay=Convert.ToInt32(childManifest["syntheticDelayMs"]);Need(delay==6000,"bounded synthetic timeout control");Thread.Sleep(delay);}
    string full=Text(childManifest,"sourceFile");Console.WriteLine(Json.Serialize(ReadHeader(full)));return 0;
   }
   Need(args.Length==3&&args[0]=="--supervise","exact --supervise manifest-path manifest-sha256 command required");
   string manifest=Full(args[1]);Need(string.Equals(manifest,Full(Path.Combine(Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName),"manifest.json")),StringComparison.OrdinalIgnoreCase),"manifest stays beside exact helper");byte[] manifestBytes=ReadManifest(manifest);Need(Sha(manifestBytes)==args[2],"manifest digest mismatch");
   var d=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(manifestBytes));
   Need(Text(d,"kind")=="world04-one-shot-header-candidate-v1","manifest kind");string mode=Text(d,"mode");Need(mode=="installed-header-proposed"||mode=="synthetic-offline-test","manifest mode");
   string candidate=Path.GetDirectoryName(manifest),source=Full(Text(d,"sourceFile")),output=Full(Text(d,"outputDirectory")),exe=Process.GetCurrentProcess().MainModule.FileName;
   Need(Full(output)==Full(Path.Combine(candidate,"result")),"fixed private output directory");Need(!Directory.Exists(output),"fresh output directory required");
   Need(Text(d,"exeSHA256")==HashFile(exe),"candidate executable drift");
   CheckRuntime(d);var candidateParents=PinParents(manifest);
   if(mode=="installed-header-proposed")Need(source.EndsWith(@"\update\update.rpf",StringComparison.OrdinalIgnoreCase)&&Full(Text(d,"gameRoot"))+@"\update\update.rpf"==source,"exact proposed installed archive");
   else Need(source.StartsWith(Full(candidate)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"synthetic input stays in fresh private candidate");
   // A consumed marker is written before process creation or any installed open.
   using(var marker=new FileStream(Path.Combine(candidate,"consumed"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] b=Encoding.UTF8.GetBytes(args[2]);marker.Write(b,0,b.Length);marker.Flush(true);}
   string eventName="Local\\RichAudioWorld04-"+Guid.NewGuid().ToString("N");IntPtr job=IntPtr.Zero;
   Process child=null;bool joined=false,succeeded=false,assigned=false;List<SafeFileHandle> outputParents=null;var clock=Stopwatch.StartNew();
   try{
    Directory.CreateDirectory(output);outputParents=PinParents(Path.Combine(output,"header.json"));
    if(mode=="synthetic-offline-test"&&d.ContainsKey("syntheticPrecreateHeader"))WriteNew(Path.Combine(output,"header.json"),"synthetic create-new rejection control");
    job=CreateJobObject(IntPtr.Zero,null);Need(job!=IntPtr.Zero,"independent job creation");
    var info=new JobInfo();info.Basic.Flags=0x2000|0x100|0x8;info.Basic.ActiveProcesses=1;info.ProcessMemory=(UIntPtr)(128*1024*1024);
    Need(SetInformationJobObject(job,9,ref info,(uint)Marshal.SizeOf(typeof(JobInfo))),"job memory/process/kill-on-close limits");
    using(var gate=new EventWaitHandle(false,EventResetMode.ManualReset,eventName)){
     var start=new ProcessStartInfo(exe,"--header "+Convert.ToBase64String(Encoding.UTF8.GetBytes(manifest))+" "+eventName+" "+args[2]){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=candidate};
     start.EnvironmentVariables.Clear();start.EnvironmentVariables["SystemRoot"]=Environment.GetEnvironmentVariable("SystemRoot");start.EnvironmentVariables["WINDIR"]=Environment.GetEnvironmentVariable("WINDIR");
     child=Process.Start(start);Need(child!=null,"fixed helper creation");assigned=AssignProcessToJobObject(job,child.Handle);Need(assigned,"job assignment before private read");gate.Set();
     if(!child.WaitForExit(5000)){TerminateJobObject(job,124);Need(child.WaitForExit(5000),"timed-out helper did not join");joined=true;throw new Exception("five-second header deadline exceeded");}
     joined=true;string stdout=child.StandardOutput.ReadToEnd(),stderr=child.StandardError.ReadToEnd();Need(stdout.Length<=4096&&stderr.Length<=4096,"bounded helper output");Need(child.ExitCode==0,"header helper failed: "+stderr);
     var result=Json.Deserialize<Dictionary<string,object>>(stdout);Need(Convert.ToInt32(result["bytesRead"])==16,"fixed header evidence");
     WriteNew(Path.Combine(output,"header.json"),stdout);
     WriteNew(Path.Combine(output,"supervision.json"),Json.Serialize(new {kind="world04-header-supervision",attemptId=Text(d,"attemptId"),manifestSHA256=args[2],exeSHA256=Text(d,"exeSHA256"),mode,childPid=child.Id,joined=true,exitCode=child.ExitCode,elapsedMs=clock.Elapsed.TotalMilliseconds,maximumReadBytes=16,jobMemoryBytes=128*1024*1024,processLimit=1,gameFilesRead=mode=="installed-header-proposed",endpointOpened=false,installationQualified=false}));
     CheckRuntime(d);succeeded=true;Console.WriteLine("PASS one-shot fixed header helper exited and joined");return 0;
    }
   }finally{
    try{
     if(child!=null&&!joined){if(assigned)TerminateJobObject(job,125);else if(!child.HasExited)child.Kill();joined=child.WaitForExit(5000);}
     if(!succeeded)WriteNew(Path.Combine(outputParents==null?candidate:output,"failure-supervision.json"),Json.Serialize(new {kind="world04-header-failure-supervision",attemptId=Text(d,"attemptId"),manifestSHA256=args[2],joined,childCreated=child!=null,assigned,elapsedMs=clock.Elapsed.TotalMilliseconds,maximumReadBytes=16,consumed=true,installationQualified=false}));
     Need(child==null||joined,"cancelled helper did not join; result unqualified");
    }finally{if(job!=IntPtr.Zero)CloseHandle(job);if(child!=null)child.Dispose();if(outputParents!=null)foreach(var handle in outputParents)handle.Dispose();foreach(var handle in candidateParents)handle.Dispose();}
   }
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 }
}
