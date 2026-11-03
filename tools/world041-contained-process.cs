// Offline synthetic containment only. This program contains no installed
// archive reader, real key provider, game launcher or audio endpoint operation.
// Windows reference: UpdateProcThreadAttribute, SECURITY_CAPABILITIES,
// CreateAppContainerProfile, GetTokenInformation and Job Objects (Microsoft).
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

public static class World041ContainedProcess {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=16};
 static void Need(bool ok,string reason){if(!ok)throw new Exception(reason);}
 static void Win(bool ok,string operation){if(!ok)throw new Exception(operation+" failed with Win32 "+Marshal.GetLastWin32Error());}
 static string Full(string p){return Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar);}
 static string Str(Dictionary<string,object> d,string k){Need(d.ContainsKey(k)&&d[k] is string,"required string: "+k);return (string)d[k];}
 static long Num(Dictionary<string,object> d,string k){Need(d.ContainsKey(k),"required integer: "+k);return Convert.ToInt64(d[k]);}
 static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
 static string Sha(byte[] b){using(var hash=SHA256.Create())return Hex(hash.ComputeHash(b));}
 static void CheckCancellation(string root){Need(!File.Exists(Path.Combine(root,"cancel.request")),"cancelled by owned control request");}
 const uint Read=0x80000000,ShareRead=1,Existing=3,NoFollow=0x00200000,DirectoryFlag=0x02000000,Reparse=0x400,Inherit=1;
 [StructLayout(LayoutKind.Sequential)]struct SecurityAttributes {public int Length;public IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]public bool Inherit;}
 [StructLayout(LayoutKind.Sequential)]struct NativeInfo {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct StartupInfo {public int cb;public string Reserved,Desktop,Title;public uint X,Y,XSize,YSize,XChars,YChars,Fill,Flags;public ushort Show,Reserved2;public IntPtr ReservedPtr,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)]struct StartupInfoEx {public StartupInfo Start;public IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr Process,Thread;public uint ProcessId,ThreadId;}
 [StructLayout(LayoutKind.Sequential)]struct SecurityCaps {public IntPtr AppContainerSid,Capabilities;public uint CapabilityCount,Reserved;}
 [StructLayout(LayoutKind.Sequential)]struct BasicLimits {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinimumWorking,MaximumWorking;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IoCounters {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)]struct JobLimits {public BasicLimits Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential)]struct UnicodeString {public ushort Length,MaximumLength;public IntPtr Buffer;}
 [StructLayout(LayoutKind.Sequential)]struct SecurityAttributeV1 {public UnicodeString Name;public ushort ValueType,Reserved;public uint Flags,Count;public IntPtr Values;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string p,uint a,uint s,ref SecurityAttributes sa,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadFile(IntPtr h,[Out]byte[] b,uint n,out uint read,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out NativeInfo info);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SecurityAttributes sa,uint bytes);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr bytes);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,UIntPtr attr,IntPtr value,IntPtr bytes,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttrs,IntPtr threadAttrs,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfoEx startup,out ProcessInfo process);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int infoClass,ref JobLimits limits,uint bytes);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool QueryInformationJobObject(IntPtr job,int infoClass,ref JobLimits limits,uint bytes,out uint returned);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool answer);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int infoClass,IntPtr output,uint bytes,out uint returned);
 [DllImport("advapi32.dll")]static extern IntPtr FreeSid(IntPtr sid);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr capabilities,uint count,out IntPtr sid);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int DeleteAppContainerProfile(string name);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
 [DllImport("ole32.dll")]static extern void CoTaskMemFree(IntPtr memory);
 sealed class AclRecord {public string Path,Sddl;public bool Directory;}
 static void DenyProfileWrites(string root,SecurityIdentifier identity,List<AclRecord> records){
  var queue=new Queue<string>();queue.Enqueue(root);while(queue.Count>0){Need(records.Count<64,"fresh profile ACL object budget");string path=queue.Dequeue();var attr=File.GetAttributes(path);Need((attr&FileAttributes.ReparsePoint)==0,"linked fresh profile object refused");bool directory=(attr&FileAttributes.Directory)!=0;FileSystemSecurity acl=directory?(FileSystemSecurity)new DirectoryInfo(path).GetAccessControl():new System.IO.FileInfo(path).GetAccessControl();records.Add(new AclRecord{Path=path,Directory=directory,Sddl=acl.GetSecurityDescriptorSddlForm(AccessControlSections.Access)});
   acl.AddAccessRule(new FileSystemAccessRule(identity,FileSystemRights.Write|FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership,AccessControlType.Deny));if(directory)new DirectoryInfo(path).SetAccessControl((DirectorySecurity)acl);else new System.IO.FileInfo(path).SetAccessControl((FileSecurity)acl);
   if(directory)foreach(string child in System.IO.Directory.GetFileSystemEntries(path))queue.Enqueue(child);
  }
 }
 static void RestoreProfileAcls(List<AclRecord> records){for(int i=records.Count-1;i>=0;i--){var record=records[i];if(record.Directory){var acl=new DirectorySecurity();acl.SetSecurityDescriptorSddlForm(record.Sddl,AccessControlSections.Access);new DirectoryInfo(record.Path).SetAccessControl(acl);}else{var acl=new FileSecurity();acl.SetSecurityDescriptorSddlForm(record.Sddl,AccessControlSections.Access);new System.IO.FileInfo(record.Path).SetAccessControl(acl);}}}

 static SecurityAttributes Attributes(bool inherited){return new SecurityAttributes{Length=Marshal.SizeOf(typeof(SecurityAttributes)),Inherit=inherited};}
 static List<SafeFileHandle> PinParents(string file){var held=new List<SafeFileHandle>();try{for(string at=Path.GetDirectoryName(file);at!=null;at=Path.GetDirectoryName(at)){var attrs=Attributes(false);var h=CreateFile(at,0,ShareRead,ref attrs,Existing,NoFollow|DirectoryFlag,IntPtr.Zero);Need(!h.IsInvalid,"no-follow parent open");held.Add(h);NativeInfo info;Win(GetFileInformationByHandle(h,out info),"parent information");Need((info.Attributes&Reparse)==0,"linked parent refused");}return held;}catch{foreach(var h in held)h.Dispose();throw;}}
 static SafeFileHandle OpenRegular(string file,bool inherited,out NativeInfo info){var attrs=Attributes(inherited);var h=CreateFile(file,Read,ShareRead,ref attrs,Existing,NoFollow,IntPtr.Zero);Need(!h.IsInvalid,"read-only regular file open");try{Win(GetFileInformationByHandle(h,out info),"file identity");Need((info.Attributes&(Reparse|0x10))==0&&info.Links==1,"linked or non-regular file refused");return h;}catch{h.Dispose();throw;}}
 static long Size(NativeInfo info){return ((long)info.SizeHigh<<32)|info.SizeLow;}
 static bool Same(NativeInfo a,NativeInfo b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow&&a.SizeHigh==b.SizeHigh&&a.SizeLow==b.SizeLow&&a.Written.dwHighDateTime==b.Written.dwHighDateTime&&a.Written.dwLowDateTime==b.Written.dwLowDateTime;}
 static string HashHandle(SafeFileHandle handle,NativeInfo before){using(var sha=SHA256.Create()){var buffer=new byte[65536];long left=Size(before);while(left>0){uint n;Win(ReadFile(handle.DangerousGetHandle(),buffer,(uint)Math.Min(left,buffer.Length),out n,IntPtr.Zero),"bounded closure read");Need(n>0,"short closure read");sha.TransformBlock(buffer,0,(int)n,null,0);left-=n;}sha.TransformFinalBlock(new byte[0],0,0);NativeInfo after;Win(GetFileInformationByHandle(handle,out after),"closure after identity");Need(Same(before,after),"closure changed during hash");return Hex(sha.Hash);}}
 static byte[] ReadManifest(string file){var parents=PinParents(file);try{NativeInfo info;using(var h=OpenRegular(file,false,out info)){long size=Size(info);Need(size>0&&size<=65536,"manifest byte cap");var bytes=new byte[(int)size];uint read;Win(ReadFile(h.DangerousGetHandle(),bytes,(uint)bytes.Length,out read,IntPtr.Zero),"one manifest read");Need(read==bytes.Length,"short manifest");NativeInfo after;Win(GetFileInformationByHandle(h,out after),"manifest after identity");Need(Same(info,after),"manifest identity drift");return bytes;}}finally{foreach(var h in parents)h.Dispose();}}
 static string Relative(string relative){Need(!string.IsNullOrEmpty(relative)&&relative.Length<=160&&!relative.Contains(":")&&!relative.Contains("\\")&&!relative.StartsWith("/"),"explicit relative closure path");foreach(string part in relative.Split('/'))Need(part.Length>0&&part!="."&&part!="..","closure traversal refused");return relative;}
 static string Quote(string value){var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);slashes=0;continue;}b.Append('\\',slashes);slashes=0;b.Append(c);}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 static IntPtr Block<T>(T value,List<IntPtr> allocations){IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(T)));allocations.Add(p);Marshal.StructureToPtr(value,p,false);return p;}
 static void Attr(IntPtr list,uint attribute,IntPtr value,int bytes){Win(UpdateProcThreadAttribute(list,0,(UIntPtr)attribute,value,(IntPtr)bytes,IntPtr.Zero,IntPtr.Zero),"process attribute "+attribute);}
 static uint TokenDword(IntPtr token,int infoClass){IntPtr output=Marshal.AllocHGlobal(4);try{uint bytes;Win(GetTokenInformation(token,infoClass,output,4,out bytes),"token class "+infoClass);Need(bytes==4,"token DWORD size");return (uint)Marshal.ReadInt32(output);}finally{Marshal.FreeHGlobal(output);}}
 static byte[] TokenBytes(IntPtr token,int infoClass){uint length;GetTokenInformation(token,infoClass,IntPtr.Zero,0,out length);Need(length>0&&length<=65536,"bounded token information");IntPtr data=Marshal.AllocHGlobal((int)length);try{Win(GetTokenInformation(token,infoClass,data,length,out length),"token buffer "+infoClass);var result=new byte[length];Marshal.Copy(data,result,0,(int)length);return result;}finally{Marshal.FreeHGlobal(data);}}
 static string TokenSid(IntPtr token){uint length;GetTokenInformation(token,31,IntPtr.Zero,0,out length);Need(length>=IntPtr.Size&&length<=65536,"token SID buffer");IntPtr data=Marshal.AllocHGlobal((int)length);try{Win(GetTokenInformation(token,31,data,length,out length),"AppContainer SID");IntPtr sid=Marshal.ReadIntPtr(data);Need(sid!=IntPtr.Zero,"AppContainer SID missing");return new SecurityIdentifier(sid).Value;}finally{Marshal.FreeHGlobal(data);}}
 static bool LowPrivilegeClaim(IntPtr token){
  // The class-46 LPAC query lacks a complete documented Win32 contract. Inspect
  // the explicit security attribute instead; fail closed if it is unavailable.
  uint length;GetTokenInformation(token,39,IntPtr.Zero,0,out length);Need(length>=16&&length<=65536,"security attribute buffer");IntPtr data=Marshal.AllocHGlobal((int)length);
  try{Win(GetTokenInformation(token,39,data,length,out length),"token security attributes");Need(Marshal.ReadInt16(data)==1,"security attribute version");uint count=(uint)Marshal.ReadInt32(data,4);Need(count<=64,"security attribute count");IntPtr list=Marshal.ReadIntPtr(data,8);int stride=Marshal.SizeOf(typeof(SecurityAttributeV1));long lower=data.ToInt64(),upper=lower+length;Need(list.ToInt64()>=lower&&list.ToInt64()+(long)count*stride<=upper,"security attribute array bounds");
   for(int i=0;i<count;i++){var attribute=(SecurityAttributeV1)Marshal.PtrToStructure(new IntPtr(list.ToInt64()+i*stride),typeof(SecurityAttributeV1));Need(attribute.Name.Length<=512&&(attribute.Name.Length&1)==0&&attribute.Name.Buffer.ToInt64()>=lower&&attribute.Name.Buffer.ToInt64()+attribute.Name.Length<=upper,"security attribute name bounds");string name=Marshal.PtrToStringUni(attribute.Name.Buffer,attribute.Name.Length/2);if(name!="WIN://NOALLAPPPKG")continue;Need(attribute.ValueType==2&&attribute.Count==1&&attribute.Values.ToInt64()>=lower&&attribute.Values.ToInt64()+8<=upper,"LPAC security attribute shape");return Marshal.ReadInt64(attribute.Values)==1;}
   return false;
  }finally{Marshal.FreeHGlobal(data);}
 }
 sealed class PipePump {public readonly IntPtr Handle;public readonly int Limit;public readonly MemoryStream Bytes=new MemoryStream();public volatile bool Overflow;public string Failure;public Thread Thread;public PipePump(IntPtr h,int cap){Handle=h;Limit=cap;}public void Start(){Thread=new Thread(Run){IsBackground=true};Thread.Start();}void Run(){try{var block=new byte[4096];while(true){uint read;if(!ReadFile(Handle,block,(uint)block.Length,out read,IntPtr.Zero)){int error=Marshal.GetLastWin32Error();if(error==109)return;throw new Exception("pipe error "+error);}if(read==0)return;if(Bytes.Length+read>Limit){Overflow=true;return;}Bytes.Write(block,0,(int)read);}}catch(Exception e){Failure=e.Message;}}}
 static void WriteNew(string file,byte[] bytes,int cap){Need(bytes.Length<=cap,"receipt/output byte cap");using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}}

 public static int Main(string[] args){
  IntPtr job=IntPtr.Zero,sid=IntPtr.Zero,attributes=IntPtr.Zero,environment=IntPtr.Zero,stdoutRead=IntPtr.Zero,stdoutWrite=IntPtr.Zero,stderrRead=IntPtr.Zero,stderrWrite=IntPtr.Zero;
  var allocations=new List<IntPtr>();var filesHeld=new List<SafeFileHandle>();var parentsHeld=new List<SafeFileHandle>();var profileAcls=new List<AclRecord>();ProcessInfo process=new ProcessInfo();PipePump stdout=null,stderr=null;bool profileCreated=false,joined=false,resumed=false,appContainer=false,jobVerified=false,lpacVerified=false,zeroCapabilities=false,lpacRequired=false,jobRuntime=false,nodePermissionsRequested=false,passed=false;int profileDeletion=unchecked((int)0x80004005);string profile=null,profileKind=null,stage=null,originalAcl=null,result=null,manifestDigest=null,errorText=null;uint exit=uint.MaxValue;ulong peakCommitted=0;var elapsed=Stopwatch.StartNew();
  try{
   Need(Environment.Is64BitProcess&&args.Length==2,"x64 supervisor requires manifest path and SHA-256");string manifest=Full(args[0]),root=Path.GetDirectoryName(manifest);Need(root.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)>=0,"synthetic private .local root required");
   byte[] manifestBytes=ReadManifest(manifest);manifestDigest=Sha(manifestBytes);Need(manifestDigest==args[1],"manifest digest mismatch");var m=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(manifestBytes));Need(Str(m,"kind")=="World041SyntheticContainedProcess","synthetic-only manifest kind");
   profileKind=Str(m,"profile");Need(profileKind=="node26-permission-job-only-synthetic-v1"||profileKind=="appcontainer-zero-capabilities-node-permission-scratch-v1"||profileKind=="lpac-zero-capabilities-v1","explicit supported synthetic containment profile required");lpacRequired=profileKind=="lpac-zero-capabilities-v1";jobRuntime=profileKind=="node26-permission-job-only-synthetic-v1";if(jobRuntime)Need(Num(m,"nodeMajor")==26,"explicit pinned Node 26 runtime required");
   stage=Full(Str(m,"stage"));result=Full(Str(m,"outputDirectory"));Need(stage==Full(Path.Combine(root,"stage"))&&result==Full(Path.Combine(root,"result")),"literal stage/result children required");Need(!System.IO.Directory.Exists(result),"fresh result directory required");parentsHeld.AddRange(PinParents(Path.Combine(root,"placeholder")));parentsHeld.AddRange(PinParents(Path.Combine(stage,"placeholder")));
   string executable=Full(Path.Combine(stage,Relative(Str(m,"executable"))));Need(executable==Full(Path.Combine(stage,"node.exe")),"copied node.exe only");string input=Full(Str(m,"stdinFile"));Need(input==Full(Path.Combine(root,"input.bin")),"owned synthetic input.bin only");long inputLength=Num(m,"stdinBytes"),memory=Num(m,"memoryBytes"),timeout=Num(m,"timeoutMs"),outputLimit=Num(m,"maximumOutputBytes");Need(inputLength>=0&&inputLength<=8388608&&memory==268435456&&timeout>0&&timeout<=5000&&outputLimit>=1&&outputLimit<=1048576,"synthetic resource bounds");
   var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;int count=0;foreach(object item in (IEnumerable)m["files"]){Need(++count<=32,"closure file count");var pin=(Dictionary<string,object>)item;string relative=Relative(Str(pin,"path"));Need(names.Add(relative),"duplicate closure path");string path=Full(Path.Combine(stage,relative));Need(path.StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"closure stays in stage");parentsHeld.AddRange(PinParents(path));NativeInfo info;var file=OpenRegular(path,false,out info);filesHeld.Add(file);Need(Size(info)>0&&Size(info)<=134217728&&(total+=Size(info))<=268435456,"closure byte cap");Need(HashHandle(file,info)==Str(pin,"sha256"),"closure digest mismatch");}
   Need(names.Contains("node.exe")&&count>1,"explicit executable and worker closure");NativeInfo inputInfo;var inputHandle=OpenRegular(input,true,out inputInfo);filesHeld.Add(inputHandle);Need(Size(inputInfo)==inputLength,"stdin exact byte length");Need(HashHandle(inputHandle,inputInfo)==Str(m,"stdinSHA256"),"stdin digest mismatch");
   // Hashing advanced stdin's position. Reopen only the same pinned owned file
   // as the single inherited read-only input handle before any child exists.
   var inheritedInput=OpenRegular(input,true,out inputInfo);filesHeld.Add(inheritedInput);Need(Size(inputInfo)==inputLength,"stdin reopened exact length");
   var argv=new List<string>();foreach(object argument in (IEnumerable)m["arguments"]){Need(argument is string&&((string)argument).Length<=2048,"bounded fixed child argument");argv.Add((string)argument);}Need(argv.Count>0&&argv.Count<=16,"bounded child argument count");
   string mode=Str(m,"mode");nodePermissionsRequested=mode!="synthetic-os-probe";string worker=mode=="synthetic-parser"?"ng-worker041.mjs":mode=="synthetic-os-probe"||mode=="synthetic-runtime-probe"?"ng-probe041.mjs":null;Need(worker!=null&&names.Contains(worker)&&!(jobRuntime&&mode=="synthetic-os-probe"),"explicit synthetic worker mode");var expectedArgs=new List<string>{"--max-old-space-size=64","--preserve-symlinks","--preserve-symlinks-main"};if(mode!="synthetic-os-probe"){expectedArgs.Add("--permission");expectedArgs.Add("--allow-fs-read="+stage);}expectedArgs.Add("--no-addons");expectedArgs.Add("--disable-proto=throw");expectedArgs.Add(Path.Combine(stage,worker));Need(argv.Count==expectedArgs.Count,"fixed child argument closure");for(int i=0;i<argv.Count;i++)Need(argv[i]==expectedArgs[i],"child argument mismatch");
   WriteNew(Path.Combine(root,"consumed"),Encoding.ASCII.GetBytes(manifestDigest),64);System.IO.Directory.CreateDirectory(result);parentsHeld.AddRange(PinParents(Path.Combine(result,"receipt.json")));CheckCancellation(root);
   string sidText=null;if(!jobRuntime){
    profile="RichAudio.World041."+Guid.NewGuid().ToString("N");int creation=CreateAppContainerProfile(profile,profile,"RichAudio synthetic parser containment",IntPtr.Zero,0,out sid);Need(creation==0&&sid!=IntPtr.Zero,"fresh AppContainer profile creation HRESULT "+creation);profileCreated=true;sidText=new SecurityIdentifier(sid).Value;
    IntPtr folder;Need(GetAppContainerFolderPath(sidText,out folder)==0&&folder!=IntPtr.Zero,"fresh profile folder path");string profileFolder;try{profileFolder=Marshal.PtrToStringUni(folder);}finally{CoTaskMemFree(folder);}Need(!string.IsNullOrEmpty(profileFolder)&&Full(profileFolder).EndsWith("\\AC",StringComparison.OrdinalIgnoreCase),"expected fresh AppContainer AC folder");if(lpacRequired)DenyProfileWrites(Path.GetDirectoryName(profileFolder),new SecurityIdentifier(sid),profileAcls);
    var directory=new DirectoryInfo(stage);var acl=directory.GetAccessControl();originalAcl=acl.GetSecurityDescriptorSddlForm(AccessControlSections.Access);acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.ReadAndExecute|FileSystemRights.Synchronize,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));directory.SetAccessControl(acl);
   }
   job=CreateJobObject(IntPtr.Zero,null);Need(job!=IntPtr.Zero,"Job creation");var limits=new JobLimits();limits.Basic.Flags=0x2000|0x100|0x8;limits.Basic.ActiveProcesses=1;limits.ProcessMemory=(UIntPtr)memory;Win(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(JobLimits))),"Job limits");
   var sa=Attributes(true);Win(CreatePipe(out stdoutRead,out stdoutWrite,ref sa,4096),"stdout pipe");Win(CreatePipe(out stderrRead,out stderrWrite,ref sa,4096),"stderr pipe");Win(SetHandleInformation(stdoutRead,Inherit,0),"stdout noninherit");Win(SetHandleInformation(stderrRead,Inherit,0),"stderr noninherit");
   int attributeCount=jobRuntime?2:lpacRequired?4:3;IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,attributeCount,0,ref size);Need(size.ToInt64()>0&&size.ToInt64()<=65536,"attribute list size");attributes=Marshal.AllocHGlobal(size);Win(InitializeProcThreadAttributeList(attributes,attributeCount,0,ref size),"attribute initialization");
   // The additional child-policy attribute caused DLL initialization failure
   // in the retained differential. The atomic one-process Job (no breakaway)
   // and Node permission policy independently prohibit child process creation.
   if(!jobRuntime){IntPtr caps=Block(new SecurityCaps{AppContainerSid=sid},allocations);Attr(attributes,0x20009,caps,Marshal.SizeOf(typeof(SecurityCaps)));}if(lpacRequired){IntPtr optout=Block((uint)1,allocations);Attr(attributes,0x2000f,optout,4);}IntPtr jobs=Block(job,allocations);Attr(attributes,0x2000d,jobs,IntPtr.Size);
   IntPtr handles=Marshal.AllocHGlobal(IntPtr.Size*3);allocations.Add(handles);Marshal.WriteIntPtr(handles,0,inheritedInput.DangerousGetHandle());Marshal.WriteIntPtr(handles,IntPtr.Size,stdoutWrite);Marshal.WriteIntPtr(handles,IntPtr.Size*2,stderrWrite);Attr(attributes,0x20002,handles,IntPtr.Size*3);
   var startup=new StartupInfoEx();startup.Start.cb=Marshal.SizeOf(typeof(StartupInfoEx));startup.Start.Flags=0x100;startup.Start.Input=inheritedInput.DangerousGetHandle();startup.Start.Output=stdoutWrite;startup.Start.Error=stderrWrite;startup.Attributes=attributes;
   var command=new StringBuilder(Quote(executable));foreach(string argument in argv)command.Append(" ").Append(Quote(argument));string env="SystemRoot="+Environment.GetEnvironmentVariable("SystemRoot")+"\0WINDIR="+Environment.GetEnvironmentVariable("WINDIR")+"\0\0";if(!jobRuntime){string local=Environment.GetEnvironmentVariable("LOCALAPPDATA");Need(!string.IsNullOrEmpty(local),"Windows profile LOCALAPPDATA required");env="LOCALAPPDATA="+local+"\0"+env;}environment=Marshal.StringToHGlobalUni(env);
   CheckCancellation(root);Win(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x4|0x400|0x80000|0x08000000,environment,stage,ref startup,out process),"suspended explicit AppContainer process creation");
   CloseHandle(stdoutWrite);stdoutWrite=IntPtr.Zero;CloseHandle(stderrWrite);stderrWrite=IntPtr.Zero;
   IntPtr token;Win(OpenProcessToken(process.Process,8,out token),"child token");try{appContainer=TokenDword(token,29)!=0;if(jobRuntime)Need(!appContainer,"runtime-only profile must report ordinary token");else{Need(appContainer&&TokenSid(token)==sidText,"AppContainer identity mismatch");var capabilities=TokenBytes(token,30);zeroCapabilities=capabilities.Length>=4&&BitConverter.ToUInt32(capabilities,0)==0;Need(zeroCapabilities,"child capability count must be zero");if(lpacRequired){lpacVerified=LowPrivilegeClaim(token);Need(lpacVerified,"LPAC opt-out claim unavailable; no fallback");}}}finally{CloseHandle(token);}Win(IsProcessInJob(process.Process,job,out jobVerified),"pre-resume Job identity");Need(jobVerified,"child missing atomic Job assignment");
   WriteNew(Path.Combine(result,"launch.json"),Encoding.UTF8.GetBytes(Json.Serialize(new{processId=process.ProcessId,atomicJobVerified=jobVerified,profile=profileKind})),4096);
   stdout=new PipePump(stdoutRead,(int)outputLimit);stderr=new PipePump(stderrRead,16384);stdout.Start();stderr.Start();CheckCancellation(root);Need(ResumeThread(process.Thread)==1,"single suspended thread resume");resumed=true;var work=Stopwatch.StartNew();
   uint wait;while((wait=WaitForSingleObject(process.Process,10))==0x102){CheckCancellation(root);Need(!stdout.Overflow&&!stderr.Overflow&&stdout.Failure==null&&stderr.Failure==null,"bounded child pipe failure");Need(work.ElapsedMilliseconds<timeout,"independent worker deadline exceeded");}Need(wait==0,"process wait failed");
   joined=true;Win(GetExitCodeProcess(process.Process,out exit),"child exit code");Need(stdout.Thread.Join(5000)&&stderr.Thread.Join(5000),"pipe readers did not join");Need(!stdout.Overflow&&!stderr.Overflow&&stdout.Failure==null&&stderr.Failure==null,"child output limit/read failure");WriteNew(Path.Combine(result,"stdout.bin"),stdout.Bytes.ToArray(),(int)outputLimit);WriteNew(Path.Combine(result,"stderr.bin"),stderr.Bytes.ToArray(),16384);Need(exit==0,"contained worker exited nonzero");passed=true;
  }catch(Exception e){errorText=e.Message;}
  finally{
   if(process.Process!=IntPtr.Zero&&!joined){if(job!=IntPtr.Zero)TerminateJobObject(job,125);joined=WaitForSingleObject(process.Process,5000)==0;GetExitCodeProcess(process.Process,out exit);}
   if(stdoutWrite!=IntPtr.Zero)CloseHandle(stdoutWrite);if(stderrWrite!=IntPtr.Zero)CloseHandle(stderrWrite);
   if(stdout!=null&&!stdout.Thread.Join(5000)){passed=false;errorText="stdout reader failed to join";}if(stderr!=null&&!stderr.Thread.Join(5000)){passed=false;errorText="stderr reader failed to join";}
   // Preserve bounded partial output after a deadline, cancellation or overflow.
   // Only joined pumps may be read; failed attempts remain reviewable.
   if(result!=null&&System.IO.Directory.Exists(result))try{
    if(stdout!=null&&!stdout.Thread.IsAlive&&!File.Exists(Path.Combine(result,"stdout.bin")))WriteNew(Path.Combine(result,"stdout.bin"),stdout.Bytes.ToArray(),1048576);
    if(stderr!=null&&!stderr.Thread.IsAlive&&!File.Exists(Path.Combine(result,"stderr.bin")))WriteNew(Path.Combine(result,"stderr.bin"),stderr.Bytes.ToArray(),16384);
   }catch{passed=false;errorText="bounded partial output preservation failed";}
   if(job!=IntPtr.Zero){var observed=new JobLimits();uint returned;if(QueryInformationJobObject(job,9,ref observed,(uint)Marshal.SizeOf(typeof(JobLimits)),out returned))peakCommitted=observed.PeakProcess.ToUInt64();}
   if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);if(job!=IntPtr.Zero)CloseHandle(job);if(stdoutRead!=IntPtr.Zero)CloseHandle(stdoutRead);if(stderrRead!=IntPtr.Zero)CloseHandle(stderrRead);
   if(attributes!=IntPtr.Zero){DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}foreach(IntPtr p in allocations)Marshal.FreeHGlobal(p);if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);
   try{if(originalAcl!=null){var acl=new DirectorySecurity();acl.SetSecurityDescriptorSddlForm(originalAcl,AccessControlSections.Access);new DirectoryInfo(stage).SetAccessControl(acl);}}catch{passed=false;errorText="stage ACL restoration failed";}
   try{RestoreProfileAcls(profileAcls);}catch{passed=false;errorText="fresh profile ACL restoration failed";}
   if(profileCreated){profileDeletion=DeleteAppContainerProfile(profile);if(profileDeletion!=0){passed=false;errorText="AppContainer profile deletion did not return success";}}if(sid!=IntPtr.Zero)FreeSid(sid);
   foreach(var file in filesHeld)file.Dispose();foreach(var parent in parentsHeld)parent.Dispose();
   if(result!=null&&System.IO.Directory.Exists(result)){try{var receipt=new {kind="World041SyntheticContainedProcessResult",passed,manifestSHA256=manifestDigest,profile=profileKind,processId=process.ProcessId,resumed,appContainerRequested=!jobRuntime,appContainerVerified=appContainer,lpacRequested=lpacRequired,lpacOptOutClaimVerified=lpacVerified,zeroCapabilitiesVerified=zeroCapabilities,runtimeOnlyProfileRequested=jobRuntime,nodePermissionRequested=nodePermissionsRequested,supervisorProcessId=Process.GetCurrentProcess().Id,osFilesystemNetworkSandboxQualified=false,profileCreated,profileScratchWritable=profileCreated&&!lpacRequired,atomicJobVerified=jobVerified,joined,exitCode=exit,peakCommittedBytes=peakCommitted,elapsedMs=elapsed.Elapsed.TotalMilliseconds,cancelled=errorText!=null&&errorText.StartsWith("cancelled"),profileDeletionApplicable=profileCreated,profileDeletionHRESULT=profileDeletion,profileStorageAbsenceProven=false,error=errorText,installedArchiveRead=false,realKeyMaterialRead=false,audioEndpointOpened=false};WriteNew(Path.Combine(result,"supervision.json"),Encoding.UTF8.GetBytes(Json.Serialize(receipt)),65536);}catch(Exception e){passed=false;errorText="receipt failed: "+e.Message;}}
  }
  if(!passed){Console.Error.WriteLine(errorText??"contained synthetic worker failed");return 1;}Console.WriteLine("PASS synthetic worker exited under explicitly selected profile and atomic Job");return 0;
 }
}
