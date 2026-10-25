// Original narrow bridge to a user-installed, fingerprinted CodeWalker parser.
// No parser code/keys are included. Only read/scan/extract calls; never Save.
using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
class ExtractBati {
 static string toolRoot;
 static string Hash(string file) { using(var s=File.OpenRead(file)) using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(s)).Replace("-",""); }
 static string Digest(byte[] b) {using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","");}
 static object Get(object o,string name) { if(o==null)return null; var t=o.GetType();var p=t.GetProperty(name);return p!=null?p.GetValue(o,null):t.GetField(name).GetValue(o); }
 static object Describe(object o,int depth) {
  if(o==null)return null; var t=o.GetType();
  if(t.IsEnum)return Convert.ToInt32(o);
  if(o is string||t.IsPrimitive||o is decimal)return o;
  if(t.Name=="MetaHash")return Get(o,"Hex");
  if(depth<=0)return t.Name;
  if(o is IEnumerable){var a=new List<object>();foreach(var v in (IEnumerable)o){if(a.Count>=10000)throw new Exception("Metadata count bound");a.Add(Describe(v,depth-1));}return a;}
  var d=new Dictionary<string,object>();
  foreach(var p in t.GetProperties(BindingFlags.Public|BindingFlags.Instance)) {
   if(p.GetIndexParameters().Length==0 && p.Name!="ChunkInfo")d[p.Name]=Describe(p.GetValue(o,null),depth-1);
  }
  foreach(var f in t.GetFields(BindingFlags.Public|BindingFlags.Instance))d[f.Name]=Describe(f.GetValue(o),depth-1);
  return d;
 }
 static void NoReparse(string p) {for(var d=new DirectoryInfo(p);d!=null;d=d.Parent)if(d.Exists && (d.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Reparse path rejected");}
 static bool Under(string p,string root){return p.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase)||p.Equals(root,StringComparison.OrdinalIgnoreCase);}
 static void Write(string path,byte[] bytes) {using(var s=new FileStream(path,FileMode.CreateNew,FileAccess.Write))s.Write(bytes,0,bytes.Length);}
 static void Json(string path,object value) {var j=new JavaScriptSerializer();j.MaxJsonLength=16*1024*1024;Write(path,System.Text.Encoding.UTF8.GetBytes(j.Serialize(value)));}
 static int Main(string[] args) {
  if(args.Length!=3){Console.Error.WriteLine("Usage: ExtractBati GAME_ROOT CODEWALKER_ROOT NEW_PRIVATE_OUTPUT");return 2;}
  string game=Path.GetFullPath(args[0]), output=Path.GetFullPath(args[2]);toolRoot=Path.GetFullPath(args[1]);
  var journal=new List<object>(); bool failed=false, created=false;
  try {
   NoReparse(game);NoReparse(toolRoot);NoReparse(output);
   if(Under(output,game)||Under(output,toolRoot)||Directory.Exists(output)||File.Exists(output))throw new Exception("Unsafe/existing output");
   if(!output.Split(Path.DirectorySeparatorChar).Contains(".local"))throw new Exception("Output must be private .local storage");
   if(Hash(Path.Combine(toolRoot,"CodeWalker.Core.dll"))!="3D2BB91B35CF0D1888C12772A9AF25441ADEA3CCC8510A149FCF0D47C8E71CA8")throw new Exception("Unreviewed parser fingerprint");
   Directory.CreateDirectory(output);created=true;
   Environment.CurrentDirectory=output;
   AppDomain.CurrentDomain.AssemblyResolve+=(s,e)=>{
    var n=new AssemblyName(e.Name).Name;
    if(n!="CodeWalker.Core" && n!="SharpDX" && n!="SharpDX.Mathematics")return null;
    return Assembly.Load(File.ReadAllBytes(Path.Combine(toolRoot,n+".dll")));
   };
   var asm=Assembly.Load(File.ReadAllBytes(Path.Combine(toolRoot,"CodeWalker.Core.dll")));
   var keys=asm.GetType("CodeWalker.GameFiles.GTA5Keys");
   var km=keys.GetMethods().Single(m=>m.Name=="LoadFromPath" && m.GetParameters().Length==2);
   km.Invoke(null,new object[]{game,null}); // Existing dev46 read-only loader.
   var relatives=new[]{"x64\\audio\\sfx\\STREAMED_VEHICLES_GRANULAR.rpf","x64\\audio\\sfx\\STREAMED_VEHICLES_GRANULAR_NPC.rpf"};
   var pins=new[]{"F31CC031E06D1CFE5E863E8307857AB3C59B0736739E824277368EBEE5DF7EEF","9EE025DAA5839720AB24914BCB79BBD2DB17E6FD26DF963B82FC90E43E7EF3E7"};
   var names=new Dictionary<string,string>{{"1D18B9A1","engine_idle"},{"1F7402AA","engine_accel"},{"18648298","engine_decel"},{"179DDCAA","exhaust_idle"},{"03AB9171","exhaust_accel"},{"0E804842","exhaust_decel"}};
   for(int a=0;a<2;a++) {
    var file=Path.Combine(game,relatives[a]);var before=Hash(file);if(before!=pins[a])throw new Exception("Archive baseline mismatch");
    var row=new Dictionary<string,object>{{"archive",relatives[a]},{"beforeSha256",before},{"bytes",new FileInfo(file).Length}};journal.Add(row);
    try {
     object rpf=Activator.CreateInstance(asm.GetType("CodeWalker.GameFiles.RpfFile"),new object[]{file,relatives[a]});
     var errors=new List<string>();rpf.GetType().GetMethod("ScanStructure").Invoke(rpf,new object[]{null,new Action<string>(s=>errors.Add(s))});
     if(errors.Count!=0||!String.IsNullOrEmpty((string)Get(rpf,"LastError")))throw new Exception("Archive scan error");
     string target=a==0?"v_twin_2.awc":"v_twin_2_npc.awc";
     object entry=((IEnumerable)Get(rpf,"AllEntries")).Cast<object>().Single(e=>String.Equals((string)Get(e,"Name"),target,StringComparison.OrdinalIgnoreCase));
     long size=Convert.ToInt64(entry.GetType().GetMethod("GetFileSize").Invoke(entry,null));
     long expanded=Convert.ToInt64(Get(entry,"FileUncompressedSize"));
     if(size<1||size>12*1024*1024||expanded<1||expanded>12*1024*1024)throw new Exception("Entry size bound");
     var data=(byte[])rpf.GetType().GetMethod("ExtractFile").Invoke(rpf,new[]{entry});
     if(data.Length!=(a==0?3270560:656638))throw new Exception("Unexpected container length");
     object awc=Activator.CreateInstance(asm.GetType("CodeWalker.GameFiles.AwcFile"));awc.GetType().GetMethod("Load").Invoke(awc,new object[]{data,entry});
     if(!String.IsNullOrEmpty((string)Get(awc,"ErrorMessage")))throw new Exception("AWC decode error");
     string dir=Path.Combine(output,a==0?"player":"npc");Directory.CreateDirectory(dir);Write(Path.Combine(dir,target),data);
     var streams=new List<object>();
     foreach(object stream in (IEnumerable)Get(awc,"Streams")) {
      string hash=(string)Get(Get(stream,"Hash"),"Hex");string name=names.ContainsKey(hash)?names[hash]:"unresolved_"+hash;
      var format=Get(stream,"FormatChunk");int codec=Convert.ToInt32(Get(format,"Codec"));
      int count=Convert.ToInt32(Get(stream,"SampleCount")),rate=Convert.ToInt32(Get(stream,"SamplesPerSecond"));
      if(count<=0||count>48000*30||rate!=48000||codec!=0)throw new Exception("Unsupported Bati format/count");
      var raw=(byte[])((byte[])stream.GetType().GetMethod("GetRawData").Invoke(stream,null)).Clone();
      var pcm=(byte[])stream.GetType().GetMethod("GetPcmData").Invoke(stream,null);
      var wav=(byte[])stream.GetType().GetMethod("GetWavFile").Invoke(stream,null);
      if(raw.Length>12*1024*1024||pcm.Length>12*1024*1024)throw new Exception("Stream size bound");
      if(raw.Length!=count*2 || !raw.SequenceEqual(pcm) || wav.Length!=44+raw.Length || !raw.SequenceEqual(wav.Skip(44)))throw new Exception("PCM fidelity/extent mismatch");
      Write(Path.Combine(dir,name+".wav"),wav);
      streams.Add(new Dictionary<string,object>{{"id",hash},{"name",name},{"codec",codec},{"sampleRate",rate},{"sampleCount",count},{"encodedBytes",raw.Length},{"pcmBytes",pcm.Length},{"pcmSha256",Digest(raw)},{"wavSha256",Digest(wav)},{"channels",1},{"wav",name+".wav"},{"format",Describe(format,3)},{"grains",Describe(Get(stream,"GranularGrainsChunk"),5)},{"loops",Describe(Get(stream,"GranularLoopsChunk"),5)}});
     }
     row["container"]=target;row["containerBytes"]=data.Length;row["streams"]=streams;
    } finally {row["afterSha256"]=Hash(file);row["unchanged"]=before==(string)row["afterSha256"];if(!(bool)row["unchanged"])throw new Exception("Archive changed");}
   }
   Console.WriteLine("Read-only Bati extraction complete; private stream metadata and WAVs written.");
  } catch(Exception e){failed=true;Console.Error.WriteLine(e.GetBaseException().GetType().Name+": "+e.GetBaseException().Message);}
  finally {if(created)Json(Path.Combine(output,"extraction.json"),new{schemaVersion=1,failed=failed,archives=journal});}
  return failed?1:0;
 }
}
