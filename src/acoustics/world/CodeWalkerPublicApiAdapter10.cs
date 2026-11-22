// RichAudio-owned public-API integration. No CodeWalker implementation is copied.
// This explicit-memory preparation path neither opens archives nor initializes keys.
using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;

namespace RichAudio.World {
 public static class CodeWalkerPublicApiAdapter10 {
  public const int MaximumOutputBytes=1048576;
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=33554432,RecursionLimit=96};

  // The caller must supply independently authorized, immutable resource bytes.
  // This method intentionally reuses RichAudio's existing page/Meta validation and
  // public YmapFile/YtypFile/YbnFile.Load API rather than creating a second parser.
  // Binary qualification is a separate audit; a successful decode cannot grant it.
  public static string Decode(byte[] bytes,string kind,string expectedSHA256,string authority,string expectedParserSHA256,bool gen9) {
   string normalized=CodeWalkerResourceBoundary03.Normalize(bytes,kind,expectedSHA256,authority,expectedParserSHA256,gen9);
   if(Encoding.UTF8.GetByteCount(normalized)>MaximumOutputBytes)throw new InvalidOperationException("Public API adapter output budget");
   var result=Json.Deserialize<Dictionary<string,object>>(normalized);
   result["kind"]="CodeWalkerPublicApiResource10";
   // WORLD03's profile label described its original build, not a new DLL's
   // provenance. Retain it as a profile identity and make that distinction explicit.
   result["admissionProfileSourceCommit"]=result["parserSourceCommit"];
   result.Remove("parserSourceCommit");
   result["parserSHA256IsCallerBinding"]=true;
   result["apiPath"]="public-explicit-memory-resource-only";
   result["binaryProvenance"]="requires-independent-audit";
   result["standardBinaryQualified"]=false;
   result["distributionQualified"]=false;
   result["bootstrapInitialized"]=false;
   result["archiveDirectoryDecoded"]=false;
   result["genuineEnhancedGeometryQualified"]=false;
   // Avoid carrying the older normalizer's build-origin label into a new binary
   // envelope. The geometry, transforms and their uncertainty are unchanged.
   if(kind=="ybn") {
    var decoded=Json.Deserialize<Dictionary<string,object>>((string)result["decodedJson"]);
    var collision=(Dictionary<string,object>)decoded["data"];
    var source=(Dictionary<string,object>)collision["source"];
    source["parser"]="CodeWalker.Core-public-api-binary-provenance-requires-audit";
    string decodedJson=Json.Serialize(decoded);
    result["decodedJson"]=decodedJson;
    using(var hash=System.Security.Cryptography.SHA256.Create())
     result["decodedSHA256"]=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(decodedJson))).Replace("-","").ToLowerInvariant();
   }
   string output=Json.Serialize(result);
   if(Encoding.UTF8.GetByteCount(output)>MaximumOutputBytes)throw new InvalidOperationException("Public API adapter output budget");
   return output;
  }
 }
}
