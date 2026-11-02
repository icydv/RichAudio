using System;using System.IO;using System.Text;using System.Web.Script.Serialization;
namespace RichAudio.Experiments {
 // Control-thread receipt persistence only. Serialization precedes creation;
 // write/flush failures escape and preserve any partial file without retry.
 internal static class Latency031SupervisionReceipt {
  internal static void WriteNew(string file,object report){WriteNew(file,report,delegate(string path){return new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read,1);});}
  internal static void WriteNew(string file,object report,Func<string,Stream> createNew){
   if(String.IsNullOrWhiteSpace(file)||createNew==null)throw new ArgumentException("Explicit new receipt and bounded sink required");
   string json=new JavaScriptSerializer{MaxJsonLength=4000000,RecursionLimit=64}.Serialize(report);
   byte[] bytes=new UTF8Encoding(false).GetBytes(json+"\n");
   if(bytes.Length>4000000)throw new InvalidDataException("Bounded supervision receipt required");
   using(var stream=createNew(file)){stream.Write(bytes,0,bytes.Length);stream.Flush();}
  }
 }
}
