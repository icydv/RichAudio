using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

// Stable .NET Framework bootstrap: verifies tools before starting an interpreter.
// Never launches GTA, OBS, an installer, a repair tool or an update operation.
public static class Launcher03F {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=32*1024*1024};
 static string Repo=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),"..",".."));
 static string Package=Path.Combine(Repo,".local","gate-a-shvdne-private-03f");
 [StructLayout(LayoutKind.Sequential,Pack=4)]struct FileInfoNative{public uint Attributes;public long Creation,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(IntPtr handle,out FileInfoNative info);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(IntPtr handle,StringBuilder path,uint length,uint flags);
 static void ProgramIdentity(Dictionary<string,object> p){string path=(string)p["path"];using(var file=File.OpenRead(path)){var name=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(file.SafeFileHandle.DangerousGetHandle(),name,(uint)name.Capacity,0);FileInfoNative info;if(n==0||n>=name.Capacity||!GetFileInformationByHandle(file.SafeFileHandle.DangerousGetHandle(),out info))throw new InvalidDataException("TOOL_IDENTITY_UNAVAILABLE "+path);string canonical=name.ToString();if(canonical.StartsWith(@"\\?\"))canonical=canonical.Substring(4);string id=info.Volume.ToString("x8")+":"+info.IndexHigh.ToString("x8")+info.IndexLow.ToString("x8");if(!String.Equals(canonical,(string)p["canonicalPath"],StringComparison.OrdinalIgnoreCase)||id!=(string)p["fileIdentity"])throw new InvalidDataException("TOOL_IDENTITY_CHANGED "+path);}}
 static string Hash(string path){using(var f=File.OpenRead(path))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
 static Dictionary<string,object> Read(string path){return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(path));}
 static void NoLinks(string path){for(string p=Path.GetFullPath(path);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p))if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("TOOLCHAIN_LINK "+p);}
 static void Check(Dictionary<string,object> pin){string path=(string)pin["path"];NoLinks(path);if(!File.Exists(path))throw new FileNotFoundException("TOOLCHAIN_MISSING "+path,path);if(new FileInfo(path).Length!=Convert.ToInt64(pin["bytes"])||Hash(path)!=(string)pin["sha256"])throw new InvalidDataException("TOOLCHAIN_CHANGED "+path);}
 static string Quote(string value){var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 static ushort Machine(string path){using(var r=new BinaryReader(File.OpenRead(path))){if(r.ReadUInt16()!=0x5a4d)throw new InvalidDataException("not PE");r.BaseStream.Position=0x3c;int p=r.ReadInt32();r.BaseStream.Position=p;if(r.ReadUInt32()!=0x4550)throw new InvalidDataException("not PE");return r.ReadUInt16();}}
 static HashSet<string> OwnModules(){var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);using(var self=Process.GetCurrentProcess())foreach(ProcessModule m in self.Modules)paths.Add(m.FileName);foreach(var assembly in AppDomain.CurrentDomain.GetAssemblies())if(!assembly.IsDynamic&&!String.IsNullOrEmpty(assembly.Location))paths.Add(assembly.Location);return paths;}
 public static int Main(string[] args){try{
  if(args.Length<3)throw new ArgumentException("operation --manifest-sha256 digest; qualification uses chain-check --toolchain-sha256 digest");
  string operation=args[0],flag=args[1],digest=args[2],contract=Path.Combine(Package,"toolchain-manifest.json");
  bool qualify=flag=="--toolchain-sha256";
  if(qualify&&operation!="chain-check"&&operation!="inspect-bootstrap")throw new InvalidDataException("qualification permits chain-check or bootstrap inspection only");
  if(!qualify){
   if(flag!="--manifest-sha256"&&flag!="--approved-manifest-sha256")throw new ArgumentException("exact manifest required");
   if((operation=="install"||operation=="restore"||operation=="watch")&&flag!="--approved-manifest-sha256")throw new InvalidDataException("fresh explicit approval required");
   string master=Path.Combine(Package,"execution-manifest.json");if(Hash(master)!=digest)throw new InvalidDataException("MANIFEST_DIGEST");var m=Read(master);
   if((string)m["preparation"]!="GATE-A-SHVDNE-PRIVATE-03F")throw new InvalidDataException("wrong preparation");
   foreach(object item in (System.Collections.IEnumerable)m["bindings"])Check((Dictionary<string,object>)item);
   digest=(string)m["toolchainSha256"];
  }
  if(Hash(contract)!=digest)throw new InvalidDataException("TOOLCHAIN_CONTRACT_DIGEST");var tc=Read(contract);
  if((string)tc["schema"]!="Private03FStableToolchain01"||(string)tc["repository"]!=Repo)throw new InvalidDataException("TOOLCHAIN_SCOPE");
  foreach(object item in (System.Collections.IEnumerable)tc["files"])Check((Dictionary<string,object>)item);
  var programs=(Dictionary<string,object>)tc["programs"];var py=(Dictionary<string,object>)programs["python"];var ps=(Dictionary<string,object>)programs["powershell"];
  foreach(string role in new[]{"python","powershell"}){var p=(Dictionary<string,object>)programs[role];Check(p);string expected=Path.Combine(Repo,".local","toolchains","private03f-01",role,role=="python"?"python.exe":"pwsh.exe");if(!String.Equals((string)p["path"],expected,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("TOOL_PATH_SUBSTITUTION "+role);if((string)p["architecture"]!="x64")throw new InvalidDataException("TOOLCHAIN_ARCHITECTURE_DECLARATION");ProgramIdentity(p);}
  if(Machine((string)py["path"])!=0x8664||Machine((string)ps["path"])!=0x8664)throw new InvalidDataException("TOOLCHAIN_ARCHITECTURE");
  var modules=OwnModules();if(operation=="inspect-bootstrap"){Console.WriteLine(Json.Serialize(new{modules=modules,clr=Environment.Version.ToString(),bits=IntPtr.Size*8}));return 0;}
  foreach(string module in modules){bool bound=false;foreach(object item in (System.Collections.IEnumerable)tc["files"]){var row=(Dictionary<string,object>)item;if(String.Equals(module,(string)row["path"],StringComparison.OrdinalIgnoreCase)){Check(row);bound=true;break;}}if(!bound)throw new InvalidDataException("UNBOUND_BOOTSTRAP_DEPENDENCY "+module);}
  var allowed=new HashSet<string>{"chain-check","preflight","install","restore","verify","watch","extract","marker"};if(!allowed.Contains(operation))throw new ArgumentException("unsupported operation");
  var values=new List<string>{"-I","-S","-B",Path.Combine(Repo,"tools","native-control","private-profile03f","Entry03F.py"),operation,"--toolchain-sha256",digest};
  if(!qualify){values.Add("--manifest-sha256");values.Add(args[2]);}for(int i=3;i<args.Length;i++)values.Add(args[i]);
  var start=new ProcessStartInfo((string)py["path"],String.Join(" ",values.ConvertAll(Quote).ToArray())){UseShellExecute=false,WorkingDirectory=Repo};
  var remove=new List<string>();foreach(string key in start.EnvironmentVariables.Keys){string k=key.ToUpperInvariant();if(k.StartsWith("GIT_")||k.StartsWith("DOTNET_")||k.StartsWith("COMPLUS_")||k.StartsWith("CORECLR_")||k.StartsWith("COR_PROFILER")||k.StartsWith("COR_ENABLE_PROFILING")||k=="PYTHONPATH"||k=="PYTHONHOME"||k=="NODE_OPTIONS"||k=="NODE_PATH")remove.Add(key);}foreach(string key in remove)start.EnvironmentVariables.Remove(key);
  string cache=Path.Combine(Package,"runtime-cache");Directory.CreateDirectory(cache);
  start.EnvironmentVariables["TEMP"]=cache;start.EnvironmentVariables["TMP"]=cache;start.EnvironmentVariables["PYTHONDONTWRITEBYTECODE"]="1";
  start.EnvironmentVariables["PSModulePath"]=Path.Combine(Path.GetDirectoryName((string)ps["path"]),"Modules");start.EnvironmentVariables["PSModuleAnalysisCachePath"]=Path.Combine(cache,"PSAnalysisCache");
  start.EnvironmentVariables["DOTNET_ROOT"]=Path.GetDirectoryName((string)ps["path"]);start.EnvironmentVariables["DOTNET_MULTILEVEL_LOOKUP"]="0";
  start.EnvironmentVariables["PATH"]=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32");
  using(var child=Process.Start(start)){child.WaitForExit();return child.ExitCode;}
 }catch(Exception e){Console.Error.WriteLine("PRIVATE03F_ADMISSION_FAILED "+e);return 3;}}
}
