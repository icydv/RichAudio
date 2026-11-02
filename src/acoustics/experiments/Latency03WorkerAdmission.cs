using System;using System.Collections.Generic;using System.IO;using System.Text;using System.Web.Script.Serialization;
namespace RichAudio.Experiments {
 // Control-thread file gate only. No audio/COM/native dependency. The parent
 // admits the exact suspended-job child lifetime, and each worker claims once.
 internal static class Latency03WorkerAdmission {
  static string PathIn(string root,string name){root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);string p=Path.GetFullPath(Path.Combine(root,name));if(!p.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Admission path escape");for(string at=p;at!=null;at=Path.GetDirectoryName(at))if(File.Exists(at)||Directory.Exists(at))if((File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked admission path");return p;}
  internal static void Claim(string root,string token,string parentIdentity,string manifestSha,int workerPid,long workerStartUtcTicks){
   string admission=PathIn(root,"results/worker-admission.json");if(new FileInfo(admission).Length>65536)throw new InvalidDataException("Admission bound");var json=new JavaScriptSerializer();var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(admission));
   if(Convert.ToString(data["token"])!=token||Convert.ToString(data["parentIdentity"])!=parentIdentity||Convert.ToString(data["manifestSha256"])!=manifestSha||Convert.ToInt32(data["workerPid"])!=workerPid||Convert.ToInt64(data["workerStartUtcTicks"])!=workerStartUtcTicks)throw new InvalidDataException("Exact parent-admitted worker lifetime required");
   using(var file=new FileStream(PathIn(root,"results/worker-claimed.json"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))using(var writer=new StreamWriter(file,new UTF8Encoding(false)))writer.WriteLine(json.Serialize(new{schema=1,token,parentIdentity,manifestSha256=manifestSha,workerPid,workerStartUtcTicks}));
  }
 }
}
