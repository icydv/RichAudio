// Original in-memory RPF controls, not game assets or installed compatibility.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
namespace RichAudio.Tests {
 public static class CodeWalkerProviderBuild08 {
  static readonly List<string> Passed=new List<string>();
  static void Need(bool ok,string name){if(!ok)throw new Exception(name);Passed.Add(name);}
  static byte[] Header(int count,byte[] names,bool chain=false){using(var s=new MemoryStream())using(var w=new BinaryWriter(s)){
   w.Write(0x52504637u);w.Write((uint)count);w.Write((uint)names.Length);w.Write(0x4e45504fu);
   for(int i=0;i<count;i++){w.Write(i==0?0u:1u);w.Write(0x7fffff00u);w.Write((uint)(i+1));w.Write(chain&&i<count-1?1u:0u);}w.Write(names);return s.ToArray();
  }}
  static void Put(byte[] b,int at,uint value){Array.Copy(BitConverter.GetBytes(value),0,b,at,4);}
  static RpfFile Parse(byte[] b){var r=new RpfFile("original.rpf","original.rpf",b.Length);using(var s=new MemoryStream(b,false))using(var br=new BinaryReader(s)){r.ReadHeaderForRichAudio08(br);}return r;}
  static void Reject(string name,byte[] b){try{Parse(b);}catch(InvalidDataException){Passed.Add(name);return;}throw new Exception("Expected bounded rejection: "+name);}
  public static string Run(){Passed.Clear();
   var a=typeof(RpfFile).Assembly;
   foreach(string n in new[]{"CodeWalker.GameFiles.RpfFile","CodeWalker.GameFiles.RpfManager","CodeWalker.GameFiles.GameFileCache","CodeWalker.World.Space","CodeWalker.GameFiles.YmapFile","CodeWalker.GameFiles.YtypFile","CodeWalker.GameFiles.YbnFile","CodeWalker.GameFiles.CacheDatFile","CodeWalker.GameFiles.YmfFile"})Need(a.GetType(n)!=null,"real Core API "+n);
   Need(a.GetManifestResourceNames().Length==0,"no embedded resource payload");
   bool blocked=false;try{GTA5Keys.LoadFromPath("original-nonexistent-input-must-not-be-opened",true);}catch(NotSupportedException e){blocked=e.Message.StartsWith("RichAudio-CodeWalker-protected-bootstrap-unavailable",StringComparison.Ordinal);}Need(blocked,"bootstrap unavailable before file IO");
   var valid=Header(1,new byte[]{0});Need(Parse(valid).AllEntries.Count==1,"actual Core empty OPEN directory reader");
   var x=(byte[])valid.Clone();Put(x,4,65537);Reject("entry count before allocation",x);
   x=(byte[])valid.Clone();Put(x,8,4194305);Reject("name bytes before allocation",x);
   x=(byte[])valid.Clone();Put(x,12,0x12345678);Reject("unknown encryption rejected",x);
   x=new byte[valid.Length-1];Array.Copy(valid,x,x.Length);Reject("truncated table rejected",x);
   x=(byte[])valid.Clone();Put(x,16,2);Reject("name offset rejected",x);
   var longName=new byte[258];for(int i=0;i<257;i++)longName[i]=(byte)'x';Reject("unbounded name rejected",Header(1,longName));
   x=(byte[])valid.Clone();Put(x,24,0);Put(x,28,1);Reject("root cycle rejected",x);
   Reject("orphan entry rejected",Header(2,new byte[]{0,(byte)'d',0}));
   Reject("directory depth bounded",Header(65,new byte[]{0,(byte)'d',0},true));
   x=(byte[])valid.Clone();Put(x,24,1);Put(x,28,uint.MaxValue);Reject("overflowing directory span rejected",x);
   x=(byte[])valid.Clone();Put(x,20,0);Reject("non-directory root rejected",x);
   return new JavaScriptSerializer().Serialize(new{schema=1,kind="CodeWalkerProviderBuild08OriginalControls",passed=true,checks=Passed.Count,controls=Passed.ToArray(),installedResourcesRead=false,keysRead=false,endpointOpened=false,realEnhancedCompatibilityVerified=false});
  }
 }
}
