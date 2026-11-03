// Original assertions over authored fixtures and public Core APIs only.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using RichAudio.World;
namespace RichAudio.Tests {
 public static class CodeWalkerPublicApi10 {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=33554432,RecursionLimit=96};
  static readonly List<string> Checks=new List<string>();
  static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static void Need(bool value,string name){if(!value)throw new Exception(name);Checks.Add(name);}
  static void Reject(Action operation,string name){try{operation();}catch(ArgumentException){Checks.Add(name);return;}throw new Exception("Expected rejection: "+name);}
  public static string Run(byte[][] resources,string parserSHA256) {
   Checks.Clear();Need(resources.Length==3,"exact authored YMAP/YTYP/YBN closure");
   bool initial=RpfManager.IsGen9;
   try {
    for(int i=0;i<3;i++) {
     string kind=new[]{"ymap","ytyp","ybn"}[i];byte[] data=resources[i];string sha=Hash(data);
     foreach(bool original in new[]{false,true}) {
      RpfManager.IsGen9=original;
      string one=CodeWalkerPublicApiAdapter10.Decode(data,kind,sha,"original-authored-fixture",parserSHA256,true);
      string two=CodeWalkerPublicApiAdapter10.Decode(data,kind,sha,"original-authored-fixture",parserSHA256,true);
      Need(one==two,kind+" repeated normalized decode deterministic; selector initially "+original);
      Need(RpfManager.IsGen9==original,kind+" restores public Gen9 selector; initially "+original);
      var value=Json.Deserialize<Dictionary<string,object>>(one);
      Need((bool)value["gen9ReaderSelected"]&&!(bool)value["standardBinaryQualified"]&&!(bool)value["distributionQualified"]&&!(bool)value["genuineEnhancedGeometryQualified"],kind+" keeps evidence boundaries");
      string decoded=(string)value["decodedJson"];
      Need(Hash(Encoding.UTF8.GetBytes(decoded))==(string)value["decodedSHA256"],kind+" decoded digest binds actual output");
      var body=Json.Deserialize<Dictionary<string,object>>(decoded);
      var geometry=(Dictionary<string,object>)body["data"];
      Need(geometry.ContainsKey(kind=="ymap"?"entities":kind=="ytyp"?"archetypes":"nodes"),kind+" uses existing geometry DTO contract");
      var established=Json.Deserialize<Dictionary<string,object>>(CodeWalkerResourceBoundary03.Normalize(data,kind,sha,"original-authored-fixture",parserSHA256,true));
      var prior=Json.Deserialize<Dictionary<string,object>>((string)established["decodedJson"]);
      if(kind=="ybn") {
       var priorData=(Dictionary<string,object>)prior["data"];
       var priorSource=(Dictionary<string,object>)priorData["source"];
       priorSource["parser"]="CodeWalker.Core-public-api-binary-provenance-requires-audit";
      }
      Need(Json.Serialize(prior)==decoded,kind+" preserves every established geometry and transform field");
     }
     Reject(()=>CodeWalkerPublicApiAdapter10.Decode(data,kind,new string('0',64),"original-authored-fixture",parserSHA256,true),kind+" rejects changed digest");
     Reject(()=>CodeWalkerPublicApiAdapter10.Decode(data,kind,sha,"unreviewed-installed-world",parserSHA256,true),kind+" rejects unqualified authority");
     var wrong=(byte[])data.Clone();wrong[4]=99;
     Reject(()=>CodeWalkerPublicApiAdapter10.Decode(wrong,kind,Hash(wrong),"original-authored-fixture",parserSHA256,true),kind+" rejects unsupported version");
     var truncated=new byte[data.Length-1];Buffer.BlockCopy(data,0,truncated,0,truncated.Length);
     bool rejected=false;try{CodeWalkerPublicApiAdapter10.Decode(truncated,kind,Hash(truncated),"original-authored-fixture",parserSHA256,true);}catch(ArgumentException){rejected=true;}catch(System.IO.InvalidDataException){rejected=true;}
     Need(rejected,kind+" rejects truncated compressed pages");
    }
    Reject(()=>CodeWalkerPublicApiAdapter10.Decode(resources[0],"unknown",Hash(resources[0]),"original-authored-fixture",parserSHA256,true),"unsupported resource remains unknown");
    Reject(()=>CodeWalkerPublicApiAdapter10.Decode(resources[0],"ymap",Hash(resources[0]),"original-authored-fixture","not-a-parser-hash",true),"requires parser identity binding");
    Reject(()=>CodeWalkerPublicApiAdapter10.Decode(null,"ymap",new string('0',64),"original-authored-fixture",parserSHA256,true),"null bytes rejected before parser");
    // Corrupt a Meta root inside otherwise valid compressed pages, so rejection
    // occurs after the public process-global Gen9 selector has been changed.
    byte[] broken;using(var payload=new MemoryStream()) {
     using(var input=new MemoryStream(resources[0],16,resources[0].Length-16,false))using(var inflater=new DeflateStream(input,CompressionMode.Decompress)){inflater.CopyTo(payload);}
     byte[] pages=payload.ToArray();Array.Clear(pages,28,4);
     using(var output=new MemoryStream()) {
      output.Write(resources[0],0,16);using(var compressor=new DeflateStream(output,CompressionMode.Compress,true)){compressor.Write(pages,0,pages.Length);}broken=output.ToArray();
     }
    }
    foreach(bool original in new[]{false,true}) {
     RpfManager.IsGen9=original;
     Reject(()=>CodeWalkerPublicApiAdapter10.Decode(broken,"ymap",Hash(broken),"original-authored-fixture",parserSHA256,!original),"invalid Meta root rejected inside selector guard; initially "+original);
     Need(RpfManager.IsGen9==original,"selector restored after inner Meta failure; initially "+original);
    }
   } finally {RpfManager.IsGen9=initial;}
   Need(RpfManager.IsGen9==initial,"probe restores caller selector");
   return Json.Serialize(new{schema=1,kind="RichAudioCodeWalkerPublicApi10Controls",passed=true,checks=Checks.Count,controls=Checks.ToArray(),binaryRole="research-api-probe-only",standardBinaryQualified=false,distributionQualified=false,originalFixturesOnly=true,gameFilesRead=false,endpointOpened=false});
  }
 }
}
