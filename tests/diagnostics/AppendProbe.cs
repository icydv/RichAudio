using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
[DataContract] public class ProbeResult {
 [DataMember] public string Case;
 [DataMember] public bool Success;
 [DataMember] public string ExceptionType;
 [DataMember] public string HResult;
 [DataMember] public string Message;
}
public static class AppendProbe {
 static string root;
 static List<ProbeResult> results=new List<ProbeResult>();
 static void Check(string name,Action work) {
  try {work();results.Add(new ProbeResult{Case=name,Success=true});}
  catch(Exception ex) {results.Add(new ProbeResult{Case=name,Success=false,ExceptionType=ex.GetType().FullName,HResult="0x"+ex.HResult.ToString("X8"),Message=ex.Message.Replace(root,"<PROBE_ROOT>")});}
 }
 public static int Main(string[] args) {
  root=Path.GetFullPath(args[0]);if(Directory.Exists(root))throw new IOException("Fresh probe directory required");Directory.CreateDirectory(root);
  string file=Path.Combine(root,"append.txt");File.WriteAllText(file,"authored fixture");
  Check("normal-existing-file",delegate{File.AppendAllText(file,"append");});
  Check("missing-file-created",delegate{File.AppendAllText(Path.Combine(root,"new.txt"),"created");});
  using(FileStream hold=File.Open(file,FileMode.Open,FileAccess.Read,FileShare.Read))Check("reader-denies-writers",delegate{File.AppendAllText(file,"append");});
  using(FileStream hold=File.Open(file,FileMode.Open,FileAccess.Write,FileShare.Read))Check("writer-denies-writers",delegate{File.AppendAllText(file,"append");});
  using(FileStream hold=File.Open(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))Check("reader-allows-writers",delegate{File.AppendAllText(file,"append");});
  Check("directory-as-file",delegate{File.AppendAllText(root,"append");});
  File.SetAttributes(file,FileAttributes.ReadOnly);
  try {Check("read-only-file",delegate{File.AppendAllText(file,"append");});}finally{File.SetAttributes(file,FileAttributes.Normal);}
  Check("missing-parent-directory",delegate{File.AppendAllText(Path.Combine(root,"absent","file.txt"),"append");});
  using(FileStream output=File.Create(args[1]))new DataContractJsonSerializer(typeof(List<ProbeResult>)).WriteObject(output,results);
  int passed=0;foreach(ProbeResult r in results){bool ok;
   if(r.Case.Contains("denies-writers"))ok=!r.Success&&r.ExceptionType=="System.IO.IOException"&&r.HResult=="0x80070020";
   else if(r.Case=="directory-as-file"||r.Case=="read-only-file")ok=!r.Success&&r.ExceptionType=="System.UnauthorizedAccessException"&&r.HResult=="0x80070005";
   else if(r.Case=="missing-parent-directory")ok=!r.Success&&r.ExceptionType=="System.IO.DirectoryNotFoundException"&&r.HResult=="0x80070003";
   else ok=r.Success;
   if(ok)passed++;Console.WriteLine(r.Case+": "+(r.Success?"success":r.ExceptionType+" "+r.HResult));
  }Console.WriteLine("PASS "+passed+"/8 isolated append expectations; not an RPH reproduction.");return passed==8?0:1;
 }
}
