// New one-shot opaque ciphertext acquisition, separate from consumed world04.
// No NG/AES parser, key provider, member extraction, network or audio API.
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

public static class World041CiphertextCandidate {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=12};
 const int MaximumCiphertextBytes=46128;
 static void Need(bool ok,string why){if(!ok)throw new Exception(why);}
 static string Sha(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static string HashFile(string file){return Sha(File.ReadAllBytes(file));}
 static string Text(Dictionary<string,object> map,string key){Need(map.ContainsKey(key)&&map[key] is string,"missing manifest string: "+key);return (string)map[key];}
 static long Number(Dictionary<string,object> map,string key){Need(map.ContainsKey(key)&&(map[key] is int||map[key] is long),"missing exact manifest integer: "+key);return Convert.ToInt64(map[key]);}
 static bool Hex(string value){if(value.Length!=64)return false;foreach(char c in value)if(!(c>='0'&&c<='9')&&!(c>='a'&&c<='f'))return false;return true;}
 static string Full(string file){return Path.GetFullPath(file).TrimEnd(Path.DirectorySeparatorChar);}
 static void WriteNew(string file,string text){var bytes=new UTF8Encoding(false).GetBytes(text);Need(bytes.Length<=4096,"fixed receipt output cap");WriteBytesNew(file,bytes,4096);}
 static void WriteBytesNew(string file,byte[] bytes,int cap){Need(bytes.Length<=cap,"fixed private output cap");using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)){output.Write(bytes,0,bytes.Length);output.Flush(true);}}
 static void CleanEnvironment(){foreach(System.Collections.DictionaryEntry item in Environment.GetEnvironmentVariables()){string key=((string)item.Key).ToUpperInvariant();if(key=="DOTNET_CLI_TELEMETRY_OPTOUT"||key=="DOTNET_NOLOGO")continue;Need(!key.StartsWith("COR_")&&!key.StartsWith("CORECLR_")&&!key.StartsWith("COMPLUS_")&&!key.StartsWith("DOTNET_")&&key!="APPDOMAIN_MANAGER_ASM"&&key!="APPDOMAIN_MANAGER_TYPE"&&key!="DEVPATH","CLR injection/override environment refused: "+key);}}
 static object[] RuntimePins(){
  var files=new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(var assembly in AppDomain.CurrentDomain.GetAssemblies())if(!assembly.IsDynamic&&!string.IsNullOrEmpty(assembly.Location))files.Add(assembly.Location);
  foreach(ProcessModule module in Process.GetCurrentProcess().Modules)files.Add(module.FileName);
  files.Add(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(),@"Config\machine.config"));
  var pins=new List<object>();foreach(string file in files)pins.Add(new {file,sha256=HashFile(file)});return pins.ToArray();
 }
 static void CheckRuntime(Dictionary<string,object> manifest){
  Need(!File.Exists(Process.GetCurrentProcess().MainModule.FileName+".config"),"unreviewed executable config refused");
  var expected=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(object item in (System.Collections.IEnumerable)manifest["runtimePins"]){var pin=(Dictionary<string,object>)item;expected.Add(Text(pin,"file"),Text(pin,"sha256"));}
  foreach(object item in RuntimePins()){var pin=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(item));string file=Text(pin,"file");Need(expected.ContainsKey(file)&&expected[file]==Text(pin,"sha256"),"loaded runtime closure drift: "+Path.GetFileName(file));}
  foreach(var pin in expected)Need(HashFile(pin.Key)==pin.Value,"pinned runtime file drift");
 }
 const uint Read=0x80000000,ShareRead=1,OpenExisting=3,NoFollow=0x00200000,DirectoryFlag=0x02000000,Reparse=0x400;
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle handle,out NativeFileInfo info);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadFile(SafeFileHandle handle,[Out]byte[] bytes,uint count,out uint read,IntPtr overlapped);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint length,uint flags);
 [StructLayout(LayoutKind.Sequential)]struct NativeFileInfo {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref JobInfo info,uint length);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")]static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [StructLayout(LayoutKind.Sequential)]struct BasicLimits {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IoCounters {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)]struct JobInfo {public BasicLimits Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 static List<SafeFileHandle> PinParents(string full){
  var handles=new List<SafeFileHandle>();try{for(string path=Path.GetDirectoryName(full);path!=null;path=Path.GetDirectoryName(path)){
   var handle=CreateFile(path,0,ShareRead,IntPtr.Zero,OpenExisting,NoFollow|DirectoryFlag,IntPtr.Zero);Need(!handle.IsInvalid,"no-follow parent open failed");handles.Add(handle);NativeFileInfo info;Need(GetFileInformationByHandle(handle,out info)&&(info.Attributes&Reparse)==0,"reparse parent refused");
  }return handles;}catch{foreach(var handle in handles)handle.Dispose();throw;}
 }
 static bool Same(NativeFileInfo a,NativeFileInfo b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow&&a.SizeHigh==b.SizeHigh&&a.SizeLow==b.SizeLow&&a.Write.dwHighDateTime==b.Write.dwHighDateTime&&a.Write.dwLowDateTime==b.Write.dwLowDateTime;}
 static long Size(NativeFileInfo info){return ((long)info.SizeHigh<<32)|info.SizeLow;}
 static string FinalPath(SafeFileHandle handle,string expected){var path=new StringBuilder(32768);uint size=GetFinalPathNameByHandle(handle,path,(uint)path.Capacity,0);Need(size>0&&size<path.Capacity,"final handle path unavailable");string value=path.ToString();if(value.StartsWith(@"\\?\"))value=value.Substring(4);Need(string.Equals(Full(value),Full(expected),StringComparison.OrdinalIgnoreCase),"final handle path mismatch");return value;}
 static byte[] ReadPrivateBounded(string full,int maximum,int exact){
  var parents=PinParents(full);try{using(var handle=CreateFile(full,Read,ShareRead,IntPtr.Zero,OpenExisting,NoFollow,IntPtr.Zero)){
   Need(!handle.IsInvalid,"bounded private-file open failed");NativeFileInfo before;Need(GetFileInformationByHandle(handle,out before)&&(before.Attributes&(Reparse|0x10))==0&&before.Links==1&&Size(before)>0&&Size(before)<=maximum&&(exact<0||Size(before)==exact),"bounded regular single-link private file required");FinalPath(handle,full);
   var buffer=new byte[maximum];uint read;Need(ReadFile(handle,buffer,(uint)Size(before),out read,IntPtr.Zero)&&read==Size(before),"single bounded private read failed");NativeFileInfo after;Need(GetFileInformationByHandle(handle,out after)&&Same(before,after),"private file changed during fixed read");var result=new byte[read];Array.Copy(buffer,result,read);return result;
  }}finally{foreach(var handle in parents)handle.Dispose();}
 }
 static object Capture(Dictionary<string,object> manifest){
  string source=Full(Text(manifest,"sourceFile")),output=Full(Text(manifest,"outputDirectory"));long expectedSize=Number(manifest,"expectedArchiveBytes"),entries=Number(manifest,"expectedEntryCount"),names=Number(manifest,"expectedNamesBytes"),metadata=Number(manifest,"ciphertextBytes");
  Need(metadata>0&&metadata<=MaximumCiphertextBytes&&metadata==entries*16+names&&Number(manifest,"ciphertextOffset")==16,"fixed ciphertext metadata range");
  var sourceParents=PinParents(source);var outputParents=PinParents(Path.Combine(output,"ciphertext.bin"));try{
   using(var handle=CreateFile(source,Read,ShareRead,IntPtr.Zero,OpenExisting,NoFollow,IntPtr.Zero)){
    Need(!handle.IsInvalid,"read-only exact archive open failed");NativeFileInfo before;Need(GetFileInformationByHandle(handle,out before)&&(before.Attributes&(Reparse|0x10))==0&&Size(before)==expectedSize&&Size(before)>=16+metadata,"archive size/regular handle identity mismatch");string resolvedSourcePath=FinalPath(handle,source);
    var header=new byte[16];uint actual;Need(ReadFile(handle,header,16,out actual,IntPtr.Zero)&&actual==16,"single exact header read failed; no retry");
    Need(Sha(header)==Text(manifest,"expectedHeaderSHA256")&&BitConverter.ToUInt32(header,0)==0x52504637&&BitConverter.ToUInt32(header,4)==entries&&BitConverter.ToUInt32(header,8)==names&&BitConverter.ToUInt32(header,12)==0x0fefffff,"retained NG header identity mismatch; no ciphertext read");
    NativeFileInfo afterHeader;Need(GetFileInformationByHandle(handle,out afterHeader)&&Same(before,afterHeader),"archive changed after header");
    // The same synchronous handle is now at offset16. One exact request only;
    // no seek, short-read retry, parser, decryption or member offset is used.
    var ciphertext=new byte[(int)metadata];Need(ReadFile(handle,ciphertext,(uint)metadata,out actual,IntPtr.Zero)&&actual==metadata,"single exact ciphertext read failed; no retry");
    NativeFileInfo after;Need(GetFileInformationByHandle(handle,out after)&&Same(before,after),"archive changed during ciphertext read");
    WriteBytesNew(Path.Combine(output,"ciphertext.bin"),ciphertext,MaximumCiphertextBytes);
    return new {kind="world041-opaque-ciphertext-acquisition",headerBytesRead=16,ciphertextOffset=16,ciphertextBytesRead=metadata,totalSourceBytesRead=16+metadata,headerSHA256=Sha(header),ciphertextSHA256=Sha(ciphertext),archiveBytes=Size(before),resolvedSourcePath,archiveFileName=Path.GetFileName(resolvedSourcePath),declaredEntryCount=entries,declaredNamesBytes=names,encryptionTag=BitConverter.ToUInt32(header,12),volume=before.Volume,fileIndexHigh=before.IndexHigh,fileIndexLow=before.IndexLow,lastWriteHigh=before.Write.dwHighDateTime,lastWriteLow=before.Write.dwLowDateTime,handleIdentityUnchanged=true,sourceReadCalls=2,memberPayloadsRead=0,nestedArchivesOpened=0,keysRead=0,tableParsed=false,decryptionAttempted=false,installationQualified=false};
   }
  }finally{foreach(var handle in outputParents)handle.Dispose();foreach(var handle in sourceParents)handle.Dispose();}
 }
 public static int Main(string[] args){
  try{
   CleanEnvironment();if(args.Length==1&&args[0]=="--runtime-pins"){Json.Serialize(new {warmup=true});Console.WriteLine(Json.Serialize(RuntimePins()));return 0;}
   if(args.Length==3&&args[0]=="--retained-header-evidence"){
    string path=Full(args[1]);Need(path.IndexOf(@"\.local\",StringComparison.OrdinalIgnoreCase)>=0&&Hex(args[2]),"explicit private retained evidence path and digest required");var bytes=ReadPrivateBounded(path,4096,-1);Need(Sha(bytes)==args[2],"retained header evidence digest mismatch");var evidence=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes));
    Need(Text(evidence,"kind")=="world04-exact-header-result"&&Number(evidence,"bytesRead")==16&&Number(evidence,"tableBytesRead")==0&&Number(evidence,"memberPayloadsRead")==0&&Number(evidence,"keysRead")==0,"exact header-only retained receipt required");
    string raw=Text(evidence,"headerHex");Need(raw.Length==32&&Hex(Text(evidence,"headerSHA256")),"fixed retained header encoding");var header=new byte[16];for(int i=0;i<16;i++)header[i]=Convert.ToByte(raw.Substring(i*2,2),16);
    Need(Sha(header)==Text(evidence,"headerSHA256")&&BitConverter.ToUInt32(header,0)==0x52504637&&BitConverter.ToUInt32(header,4)==Number(evidence,"declaredEntryCount")&&BitConverter.ToUInt32(header,8)==Number(evidence,"declaredNamesBytes")&&BitConverter.ToUInt32(header,12)==0x0fefffff&&Number(evidence,"encryptionTag")==0x0fefffff,"retained raw NG header identity mismatch");
    Console.WriteLine(Json.Serialize(new {archiveBytes=Number(evidence,"archiveBytes"),headerSHA256=Sha(header),declaredEntryCount=BitConverter.ToUInt32(header,4),declaredNamesBytes=BitConverter.ToUInt32(header,8),retainedEvidenceSHA256=Sha(bytes),gameFilesRead=false}));return 0;
   }
   if(args.Length==4&&args[0]=="--capture"){
    string path=Encoding.UTF8.GetString(Convert.FromBase64String(args[1]));var bytes=ReadPrivateBounded(path,16384,-1);Need(Sha(bytes)==args[3],"child manifest binding");var manifest=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes));CheckRuntime(manifest);
    using(var gate=EventWaitHandle.OpenExisting(args[2]))Need(gate.WaitOne(5000),"supervision gate timeout");
    if(Text(manifest,"mode")=="synthetic-offline-test"&&manifest.ContainsKey("syntheticDelayMs")){Need(Number(manifest,"syntheticDelayMs")==6000,"bounded synthetic timeout control");Thread.Sleep(6000);}
    Console.WriteLine(Json.Serialize(Capture(manifest)));return 0;
   }
   Need(args.Length==3&&args[0]=="--supervise","exact --supervise manifest-path manifest-sha256 command required");string manifestPath=Full(args[1]),exe=Process.GetCurrentProcess().MainModule.FileName;
   Need(manifestPath==Full(Path.Combine(Path.GetDirectoryName(exe),"manifest.json")),"manifest stays beside exact helper");var manifestBytes=ReadPrivateBounded(manifestPath,16384,-1);Need(Sha(manifestBytes)==args[2],"manifest digest mismatch");var d=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(manifestBytes));
   Need(Text(d,"kind")=="world041-one-shot-ciphertext-candidate-v1","manifest kind");string mode=Text(d,"mode"),candidate=Path.GetDirectoryName(manifestPath),source=Full(Text(d,"sourceFile")),output=Full(Text(d,"outputDirectory"));
   Need(mode=="installed-ciphertext-proposed"||mode=="synthetic-offline-test","manifest mode");Need(output==Full(Path.Combine(candidate,"result"))&&!Directory.Exists(output),"fresh exact private result directory required");Need(Text(d,"exeSHA256")==HashFile(exe),"candidate executable drift");
   long metadata=Number(d,"ciphertextBytes"),entries=Number(d,"expectedEntryCount"),names=Number(d,"expectedNamesBytes");Need(entries>0&&entries<=32768&&names>0&&names<=1048576&&metadata>0&&metadata<=MaximumCiphertextBytes&&metadata==entries*16+names&&Number(d,"ciphertextOffset")==16&&Number(d,"expectedArchiveBytes")>=16+metadata&&Hex(Text(d,"expectedHeaderSHA256")),"bounded fixed ciphertext range and private identity");
   if(mode=="installed-ciphertext-proposed")Need(source==Full(Text(d,"gameRoot"))+@"\update\update.rpf"&&metadata==MaximumCiphertextBytes,"exact proposed installed archive and ciphertext cap");
   else Need(source.StartsWith(Full(candidate)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"synthetic input stays in fresh private candidate");
   CheckRuntime(d);var candidateParents=PinParents(manifestPath);using(var marker=new FileStream(Path.Combine(candidate,"consumed"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){var bytes=Encoding.UTF8.GetBytes(args[2]);marker.Write(bytes,0,bytes.Length);marker.Flush(true);}
   string eventName="Local\\RichAudioWorld041-"+Guid.NewGuid().ToString("N");IntPtr job=IntPtr.Zero;Process child=null;bool joined=false,succeeded=false,assigned=false;List<SafeFileHandle> outputParents=null;var clock=Stopwatch.StartNew();
   try{
    Directory.CreateDirectory(output);outputParents=PinParents(Path.Combine(output,"ciphertext.bin"));if(mode=="synthetic-offline-test"&&d.ContainsKey("syntheticPrecreateCiphertext"))WriteNew(Path.Combine(output,"ciphertext.bin"),"original synthetic create-new rejection control");
    job=CreateJobObject(IntPtr.Zero,null);Need(job!=IntPtr.Zero,"independent job creation");var info=new JobInfo();info.Basic.Flags=0x2000|0x100|0x8;info.Basic.ActiveProcesses=1;info.ProcessMemory=(UIntPtr)(128*1024*1024);Need(SetInformationJobObject(job,9,ref info,(uint)Marshal.SizeOf(typeof(JobInfo))),"job memory/process/kill-on-close limits");
    using(var gate=new EventWaitHandle(false,EventResetMode.ManualReset,eventName)){
     var start=new ProcessStartInfo(exe,"--capture "+Convert.ToBase64String(Encoding.UTF8.GetBytes(manifestPath))+" "+eventName+" "+args[2]){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=candidate};start.EnvironmentVariables.Clear();start.EnvironmentVariables["SystemRoot"]=Environment.GetEnvironmentVariable("SystemRoot");start.EnvironmentVariables["WINDIR"]=Environment.GetEnvironmentVariable("WINDIR");
     child=Process.Start(start);Need(child!=null,"fixed helper creation");assigned=AssignProcessToJobObject(job,child.Handle);Need(assigned,"job assignment before source-read gate");gate.Set();
     if(!child.WaitForExit(5000)){TerminateJobObject(job,124);Need(child.WaitForExit(5000),"timed-out helper did not join");joined=true;throw new Exception("five-second ciphertext deadline exceeded");}
     joined=true;string stdout=child.StandardOutput.ReadToEnd(),stderr=child.StandardError.ReadToEnd();Need(stdout.Length<=4096&&stderr.Length<=4096,"bounded helper receipt output");Need(child.ExitCode==0,"ciphertext helper failed: "+stderr);var acquired=Json.Deserialize<Dictionary<string,object>>(stdout);
     Need(Number(acquired,"headerBytesRead")==16&&Number(acquired,"ciphertextBytesRead")==metadata&&Number(acquired,"totalSourceBytesRead")==16+metadata&&Text(acquired,"headerSHA256")==Text(d,"expectedHeaderSHA256"),"exact opaque acquisition receipt scope");
     var captured=ReadPrivateBounded(Path.Combine(output,"ciphertext.bin"),MaximumCiphertextBytes,(int)metadata);Need(Sha(captured)==Text(acquired,"ciphertextSHA256"),"private captured ciphertext integrity mismatch");CheckRuntime(d);
     WriteNew(Path.Combine(output,"acquisition.json"),stdout);WriteNew(Path.Combine(output,"supervision.json"),Json.Serialize(new {kind="world041-ciphertext-supervision",attemptId=Text(d,"attemptId"),manifestSHA256=args[2],exeSHA256=Text(d,"exeSHA256"),mode,childPid=child.Id,joined=true,exitCode=child.ExitCode,elapsedMs=clock.Elapsed.TotalMilliseconds,maximumInstalledReadBytes=16+metadata,maximumCiphertextOutputBytes=metadata,jobMemoryBytes=128*1024*1024,processLimit=1,gameFilesRead=mode=="installed-ciphertext-proposed",endpointOpened=false,tableParsed=false,decryptionAttempted=false,keysRead=0,installationQualified=false}));
     succeeded=true;Console.WriteLine("PASS one-shot opaque ciphertext helper exited and joined");return 0;
    }
   }finally{
    try{if(child!=null&&!joined){if(assigned)TerminateJobObject(job,125);else if(!child.HasExited)child.Kill();joined=child.WaitForExit(5000);}if(!succeeded)WriteNew(Path.Combine(outputParents==null?candidate:output,"failure-supervision.json"),Json.Serialize(new {kind="world041-ciphertext-failure-supervision",attemptId=Text(d,"attemptId"),manifestSHA256=args[2],joined,childCreated=child!=null,assigned,elapsedMs=clock.Elapsed.TotalMilliseconds,maximumInstalledReadBytes=16+metadata,consumed=true,tableParsed=false,decryptionAttempted=false,keysRead=0,installationQualified=false}));Need(child==null||joined,"cancelled helper did not join; result unqualified");}
    finally{if(job!=IntPtr.Zero)CloseHandle(job);if(child!=null)child.Dispose();if(outputParents!=null)foreach(var handle in outputParents)handle.Dispose();foreach(var handle in candidateParents)handle.Dispose();}
   }
  }catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}
 }
}
