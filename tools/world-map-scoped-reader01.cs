using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Xml;
using CodeWalker.GameFiles;

static class ScopedMapReader01 {
 const int MaxMetadata=64*1024*1024;
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=32*1024*1024,RecursionLimit=20};
 static readonly MethodInfo Header=typeof(RpfFile).GetMethod("ReadHeader",BindingFlags.Instance|BindingFlags.NonPublic,null,new[]{typeof(BinaryReader)},null);
 static readonly HashSet<string> Physical=new HashSet<string>(StringComparer.Ordinal);
 static string Root, Output;
 static StreamWriter Log;
 static string ActiveArchive;
 static long PayloadBytes, RetainedMetadataBytes;
 static int Nested;
 const int EntryBytes=16, DirectoryMarker=0x7fffff00;
 const uint Open=0x4e45504f, Aes=0x0ffffff9, Ng=0x0fefffff, ExtendedSize=0xffffff;
 static int Blocked;
 static int ManifestProjectionRows;
 [StructLayout(LayoutKind.Sequential)]
 struct FileIdentity {
  public uint Attributes,CreatedLow,CreatedHigh,AccessedLow,AccessedHigh,WrittenLow,WrittenHigh;
  public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
 }
 [DllImport("kernel32.dll",SetLastError=true)]
 static extern bool GetFileInformationByHandle(Microsoft.Win32.SafeHandles.SafeFileHandle file,out FileIdentity identity);
 static FileIdentity Identity(FileStream file){
  FileIdentity value;
  Need(GetFileInformationByHandle(file.SafeFileHandle,out value)&&value.Links==1&&
   (value.Attributes&(uint)FileAttributes.ReparsePoint)==0,"unqualified archive handle identity");
  return value;
 }
 static bool Same(FileIdentity a,FileIdentity b){
  return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow&&a.SizeHigh==b.SizeHigh&&a.SizeLow==b.SizeLow&&
   a.CreatedHigh==b.CreatedHigh&&a.CreatedLow==b.CreatedLow&&a.WrittenHigh==b.WrittenHigh&&a.WrittenLow==b.WrittenLow&&a.Attributes==b.Attributes;
 }
 static string Hash(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static void Need(bool ok,string message){if(!ok)throw new InvalidDataException(message);}
 static void Emit(object row){Log.WriteLine(Json.Serialize(row));}
 static void Block(string path,string reason){
  Blocked++;
  Emit(new{kind="blocked",archive=ActiveArchive,path,reason});
 }
 static string Normalize(string value){return value.Replace('\\','/').ToLowerInvariant();}
 static bool Audio(string value){return Regex.IsMatch(value,@"(^|/)(audio|sfx)(/|$)")||value.EndsWith(".awc")||value.EndsWith(".rel");}
 static string PhysicalPath(string rel){
  Need(rel=="GTA5_Enhanced.exe"||Physical.Contains(rel),"unapproved physical path: "+rel);
  var path=Path.GetFullPath(Path.Combine(Root,rel.Replace('/',Path.DirectorySeparatorChar)));
  Need(path.StartsWith(Root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"path escaped approved root");
  for(string at=path;at!=null;at=Path.GetDirectoryName(at)){
   Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"linked input refused: "+rel);
   if(at==Path.GetPathRoot(at))break;
  }
  return path;
 }
 static byte[] Read(FileStream file,long offset,int bytes,long end){
  Need(bytes>=0&&offset>=0&&offset<=end&&bytes<=end-offset&&end<=file.Length,"bounded read exceeds supplied archive/member");
  file.Position=offset;var b=new byte[bytes];
  for(int n=0;n<bytes;){int got=file.Read(b,n,bytes-n);Need(got>0,"incomplete read");n+=got;}
  return b;
 }
 static RpfFile Table(FileStream file,string logical,string name,long offset,long size,out HashSet<RpfFileEntry> extended,out long tableEnd){
  Need(Header!=null&&offset>=0&&size>=16&&size<=uint.MaxValue&&offset<=file.Length-size,"pinned reader header ABI or bounded 32-bit RPF length");
  long end=checked(offset+size);
  var h=Read(file,offset,16,end);
  uint count=BitConverter.ToUInt32(h,4),names=BitConverter.ToUInt32(h,8),tag=BitConverter.ToUInt32(h,12);
  long length=16L+16L*count+names;
  Need(BitConverter.ToUInt32(h,0)==0x52504637&&count>0&&count<=262144&&names>0&&length<=16*1024*1024&&length<=size,"unsupported RPF header/table bounds");
  Need(tag==0||tag==Open||tag==Aes||tag==Ng,"unsupported RPF encryption marker");
  tableEnd=checked(offset+length);
  var prefix=Read(file,offset,(int)length,end);
  var records=new byte[(int)count*EntryBytes];
  var nameTable=new byte[(int)names];
  Buffer.BlockCopy(prefix,16,records,0,records.Length);
  Buffer.BlockCopy(prefix,16+records.Length,nameTable,0,nameTable.Length);
  if(tag==Aes){records=GTACrypto.DecryptAES(records);nameTable=GTACrypto.DecryptAES(nameTable);}
  if(tag==Ng){records=GTACrypto.DecryptNG(records,name,(uint)size);nameTable=GTACrypto.DecryptNG(nameTable,name,(uint)size);}
  ValidateDirectory(records,nameTable,(int)count);
  var extendedSlots=new List<int>();
  for(int n=0;n<count;n++){
   int at=n*EntryBytes;
   if((records[at+7]&128)==0||records[at+2]!=255||records[at+3]!=255||records[at+4]!=255)continue;
   extendedSlots.Add(n);
   // CodeWalker otherwise seeks into the member from ReadHeader. Supply a
   // table-only view and track these slots before any size or extent use.
   records[at+2]=254;
  }
  var view=(byte[])prefix.Clone();
  Buffer.BlockCopy(BitConverter.GetBytes(Open),0,view,12,4);
  Buffer.BlockCopy(records,0,view,16,records.Length);
  Buffer.BlockCopy(nameTable,0,view,16+records.Length,nameTable.Length);
  var rpf=new RpfFile(name,logical.Replace('/','\\'),size);
  using(var mem=new MemoryStream(view,false))using(var reader=new BinaryReader(mem))Header.Invoke(rpf,new object[]{reader});
  Need(rpf.AllEntries!=null&&rpf.AllEntries.Count==count,"incomplete CodeWalker table");
  rpf.IsAESEncrypted=tag==Aes;rpf.IsNGEncrypted=tag==Ng;rpf.Encryption=(RpfEncryption)tag;
  extended=new HashSet<RpfFileEntry>(extendedSlots.Select(n=>(RpfResourceFileEntry)rpf.AllEntries[n]));
  Emit(new{kind="table",archive=ActiveArchive,path=logical,entries=count,tag,offset,containerBytes=size,tableSHA256=Hash(prefix),extendedEntries=extended.Count});
  return rpf;
 }
 static void ValidateDirectory(byte[] records,byte[] names,int count){
  var seen=new bool[count];
  var todo=new Stack<int>();
  Need(BitConverter.ToUInt32(records,4)==DirectoryMarker,"RPF root is not a directory");
  seen[0]=true;todo.Push(0);
  while(todo.Count>0){
   int index=todo.Pop(),at=index*EntryBytes;
   bool directory=BitConverter.ToUInt32(records,at+4)==DirectoryMarker;
   uint name=directory?BitConverter.ToUInt32(records,at):BitConverter.ToUInt16(records,at);
   Need(name<names.Length&&Array.IndexOf(names,(byte)0,(int)name,Math.Min(257,names.Length-(int)name))>=0,"invalid or truncated RPF name");
   if(!directory)continue;
   uint first=BitConverter.ToUInt32(records,at+8),length=BitConverter.ToUInt32(records,at+12);
   Need(first<=count&&length<=count-first,"RPF directory entries outside table");
   for(int n=(int)first;n<first+length;n++){
    Need(!seen[n],"RPF directory cycle or overlapping child ranges");
    seen[n]=true;todo.Push(n);
   }
  }
  Need(seen.All(x=>x),"unreachable RPF table entry");
 }
 static long Start(RpfFileEntry entry,long origin,long tableEnd,long end){
  long start=checked(origin+(long)entry.FileOffset*512);
  Need(start>=tableEnd&&start<end,"member offset outside archive data area");
  return start;
 }
 static long Extent(FileStream file,RpfFileEntry entry,bool extended,long start,long end){
  Need(!(entry is RpfResourceFileEntry)||entry.FileSize!=0,"resource stored extent unavailable");
  long length=entry.GetFileSize();
  if(extended){
   var header=Read(file,start,16,end);
   length=(uint)header[7]|(uint)header[14]<<8|(uint)header[5]<<16|(uint)header[2]<<24;
   Need(length>=ExtendedSize,"invalid extended resource extent");
  }
  Need(length>0&&length<=end-start&&(!(entry is RpfResourceFileEntry)||length>16),"member extent outside enclosing archive");
  return length;
 }
 static byte[] Payload(FileStream file,RpfFile rpf,RpfFileEntry entry,long offset,long size,long end){
  Need(size>0&&size<=MaxMetadata,"selected member exceeds bounded stored length");
  var binary=entry as RpfBinaryFileEntry;
  if(binary!=null)Need(binary.FileUncompressedSize<=MaxMetadata,"selected binary member exceeds bounded decoded length");
  int prefix=binary==null?16:0;
  var stored=Read(file,offset+prefix,(int)size-prefix,end);PayloadBytes+=size-prefix;
  if(entry.IsEncrypted)stored=rpf.IsAESEncrypted?GTACrypto.DecryptAES(stored):
   GTACrypto.DecryptNG(stored,entry.Name,binary==null?(uint)size:binary.FileUncompressedSize);
  if(binary!=null&&binary.FileSize==0)return stored;
  using(var compressed=new MemoryStream(stored,false))
  using(var inflate=new DeflateStream(compressed,CompressionMode.Decompress))
  using(var decoded=new MemoryStream()){
   var block=new byte[65536];
   for(int count;(count=inflate.Read(block,0,block.Length))>0;){
    Need(count<=MaxMetadata-decoded.Length,"selected member exceeds bounded decoded length");
    decoded.Write(block,0,count);
   }
   Need(decoded.Length>0&&(binary==null||decoded.Length==binary.FileUncompressedSize),"selected member decoded length differs");
   return decoded.ToArray();
  }
 }
 static void XmlRecord(string logical,byte[] payload,string sha){
  var doc=new XmlDocument{XmlResolver=null};
  var settings=new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=MaxMetadata};
  using(var mem=new MemoryStream(payload,false))using(var rd=XmlReader.Create(mem,settings))doc.Load(rd);
  var order=doc.SelectSingleNode("/*/order");
  var minor=doc.SelectSingleNode("/*/minorOrder");
  var device=doc.SelectSingleNode("/*/deviceName");
  var items=logical.EndsWith("/dlclist.xml")?doc.SelectNodes("//Item").Cast<XmlNode>().Take(512).Select(n=>n.InnerText).ToArray():new string[0];
  Emit(new{kind="configuration",archive=ActiveArchive,path=logical,sha256=sha,bytes=payload.Length,root=doc.DocumentElement.Name,
   deviceName=device==null?null:device.InnerText,
   order=order==null?null:(order.Attributes["value"]==null?order.InnerText:order.Attributes["value"].Value),
   minorOrder=minor==null?null:(minor.Attributes["value"]==null?minor.InnerText:minor.Attributes["value"].Value),items});
 }
 static void MetadataRecord(string key,RpfFileEntry item,byte[] payload,string sha,long offset,long length){
  const long outputLimit=128L*1024*1024;
  Need(payload.Length<=outputLimit-RetainedMetadataBytes,"aggregate private metadata output limit");
  var leaf=Hash(Encoding.UTF8.GetBytes(key))+".bin";
  var relative="metadata-payloads/"+leaf;
  using(var result=new FileStream(Path.Combine(Output,"metadata-payloads",leaf),FileMode.CreateNew,FileAccess.Write,FileShare.None))
   result.Write(payload,0,payload.Length);
  RetainedMetadataBytes+=payload.Length;
  var resource=item as RpfResourceFileEntry;
  Emit(new{kind="metadata",archive=ActiveArchive,path=key,sha256=sha,bytes=payload.Length,offset,storedBytes=length,
   payloadFile=relative,systemFlags=resource==null?(uint?)null:resource.SystemFlags.Value,
   graphicsFlags=resource==null?(uint?)null:resource.GraphicsFlags.Value});
 }
 static string NativeHash(MetaHash hash){return "0x"+hash.Hash.ToString("x8");}
 static void ProjectManifest(string key,RpfFileEntry entry,byte[] payload,string sha){
  var manifest=new YmfFile();
  manifest.Load(payload,entry);
  Need(manifest.FileEntry==entry&&(manifest.Pso!=null||manifest.Rbf!=null||manifest.Meta!=null),"unsupported selected YMF representation");
  var groups=manifest.MapDataGroups??new YmfMapDataGroup[0];
  var interiors=manifest.Interiors??new YmfInterior[0];
  Need(groups.Length<=32768&&interiors.Length<=32768,"manifest projection exceeds bounded record population");
  foreach(var group in groups){
   var bounds=group.Bounds??new MetaHash[0];
   var weather=group.WeatherTypes??new MetaHash[0];
   Need(bounds.Length<=4096&&weather.Length<=256&&++ManifestProjectionRows<=262144,"manifest group projection bound");
   Emit(new{kind="ymf-mapgroup",archive=ActiveArchive,path=key,sha256=sha,groupHash=NativeHash(group.Name),hours=group.HoursOnOff,
    flags=group.Flags,bounds=bounds.Select(NativeHash).ToArray(),weather=weather.Select(NativeHash).ToArray()});
  }
  foreach(var interior in interiors){
   var bounds=interior.Bounds??new MetaHash[0];
   Need(bounds.Length<=4096&&++ManifestProjectionRows<=262144,"manifest interior projection bound");
   Emit(new{kind="ymf-interior",archive=ActiveArchive,path=key,sha256=sha,archetypeHash=NativeHash(interior.Interior.Name),
    bounds=bounds.Select(NativeHash).ToArray()});
  }
  Emit(new{kind="ymf-projection",archive=ActiveArchive,path=key,sha256=sha,groups=groups.Length,interiors=interiors.Length,
   representation=manifest.Pso!=null?"pso-membership-projection":manifest.Rbf!=null?"rbf-memberships-unavailable":"resource-memberships-unavailable"});
 }
 static void Walk(FileStream f,string logical,string name,long origin,long size,
                  HashSet<string> selection,HashSet<string> branches,int depth){
  Need(depth<=8&&++Nested<=8192,"nested map traversal limit");
  HashSet<RpfFileEntry> extended;
  long tableEnd;
  RpfFile rpf=Table(f,logical,name,origin,size,out extended,out tableEnd);
  long end=checked(origin+size);
  var entries=new Dictionary<string,RpfFileEntry>(StringComparer.Ordinal);
  foreach(RpfFileEntry item in rpf.AllEntries.OfType<RpfFileEntry>()){
   var key=Normalize(item.Path);
   Need(key.StartsWith(logical+"/",StringComparison.Ordinal)&&!key.Split('/').Any(p=>p==".."||p=="."||p.Length==0),"unsafe archive member identity");
   Need(!entries.ContainsKey(key),"duplicate archive member identity");entries[key]=item;
  }
  var offsetCounts=entries.Values.GroupBy(e=>e.FileOffset).ToDictionary(g=>g.Key,g=>g.Count());
  var offsets=offsetCounts.Keys.OrderBy(o=>o).ToArray();
  foreach(string expected in selection.Concat(branches).Where(p=>ParentTable(p)==logical).Distinct()){
   if(!entries.ContainsKey(expected))Block(expected,"entry absent from verified table");
  }
  foreach(var pair in entries.OrderBy(p=>p.Key,StringComparer.Ordinal)){
   string key=pair.Key;
   var item=pair.Value;
   if(Audio(key))continue;
   bool branch=branches.Contains(key),selected=selection.Contains(key),extendedSize=extended.Contains(item);
   bool config=key.EndsWith("/setup2.xml")||key.EndsWith("/content.xml")||key.EndsWith("/dlclist.xml");
   try{
    if(!branch&&!selected){
     if(MapMember(key))Emit(new{kind="unplanned-map-member",archive=ActiveArchive,path=key,extendedSize,
      shortNameHash="0x"+JenkHash.GenHash(item.GetShortNameLower()).ToString("x8")});
     else if(extendedSize)Emit(new{kind="unselected-extended-resource",archive=ActiveArchive,path=key});
     continue;
    }
    var binary=item as RpfBinaryFileEntry;
    if(branch)Need(binary!=null&&!binary.IsEncrypted&&binary.FileSize==0,"compressed, encrypted or invalid nested archive");
    long start=Start(item,origin,tableEnd,end);
    int slot=Array.BinarySearch(offsets,item.FileOffset);
    Need(offsetCounts[item.FileOffset]==1,"ambiguous member offset shared by multiple table entries");
    long memberEnd=slot+1<offsets.Length?Math.Min(end,checked(origin+(long)offsets[slot+1]*512)):end;
    var length=Extent(f,item,extendedSize,start,memberEnd);
    if(branch){
     Need(length>=16,"truncated nested archive");
     Walk(f,key,item.Name,start,length,selection,branches,depth+1);
     continue;
    }
    if(key.EndsWith(".ybn")){
     Need(item is RpfResourceFileEntry,"selected collision is not a resource");
     Emit(new{kind="selected-ybn-entry",archive=ActiveArchive,path=key,offset=start,storedBytes=length});
     continue;
    }
    Need(config||key.EndsWith(".ymf")||key.EndsWith(".ymap")||key.EndsWith(".ytyp")||key.EndsWith("cache_y.dat"),"unsupported selected map member type");
    var payload=Payload(f,rpf,item,start,length,memberEnd);var sha=Hash(payload);
    if(config)XmlRecord(key,payload,sha);
    else{
     MetadataRecord(key,item,payload,sha,start,length);
     if(key.EndsWith(".ymf"))ProjectManifest(key,item,payload,sha);
    }
   }catch(Exception ex){Block(key,ex.GetBaseException().Message);}
  }
 }
 static string ParentTable(string member){
  int index=member.LastIndexOf(".rpf/",StringComparison.Ordinal);
  return index<0?"":member.Substring(0,index+4);
 }
 static bool MapMember(string key){
  return key.EndsWith(".rpf")||key.EndsWith(".ymf")||key.EndsWith(".ybn")||key.EndsWith(".ymap")||
   key.EndsWith(".ytyp")||key.EndsWith("cache_y.dat")||key.EndsWith("/setup2.xml")||
   key.EndsWith("/content.xml")||key.EndsWith("/dlclist.xml");
 }
 static void Bootstrap(string expected){
  byte[] exe=null;
  try{
   using(var f=new FileStream(PhysicalPath("GTA5_Enhanced.exe"),FileMode.Open,FileAccess.Read,FileShare.Read)){
    var before=Identity(f);
    Need(f.Length>=1024*1024&&f.Length<=512*1024*1024,"approved executable size outside bound");
    exe=Read(f,0,(int)f.Length,f.Length);var hash=Hash(exe);
    Emit(new{kind="executable",sha256=hash,bytes=exe.Length,matched=hash==expected});
    Need(hash==expected,"game executable identity differs");
    Need(Same(before,Identity(f)),"executable identity changed during exact read");
    var generate=typeof(GTA5Keys).GetMethod("GenerateV2",BindingFlags.Public|BindingFlags.Static);
    var load=typeof(GTA5Keys).GetMethod("LoadFromPath",BindingFlags.Public|BindingFlags.Static,null,new[]{typeof(string),typeof(string)},null);
    Need(generate!=null&&load!=null,"pinned CodeWalker dev46 initializer ABI differs");
    generate.Invoke(null,new object[]{exe,null});
    Need(GTA5Keys.PC_AES_KEY!=null&&GTA5Keys.PC_AES_KEY.Length==32,"CodeWalker initialization failed");
    // The explicit-key overload uses embedded bootstrap bytes. It never
    // receives an installation path or a filename to discover.
    load.Invoke(null,new object[]{Output,Convert.ToBase64String(GTA5Keys.PC_AES_KEY)});
    Emit(new{kind="initializer",state="ready",installationPathPassedToCodeWalker=false});
   }
  }finally{if(exe!=null)Array.Clear(exe,0,exe.Length);}
 }
 static string[] Strings(object value){return ((IEnumerable)value).Cast<object>().Select(v=>(string)v).ToArray();}
 static int Main(string[] args){
  try{
   Need(args.Length==5&&(args[0]=="--installed"||args[0]=="--fixture"),"exact runner inputs");
   Root=Path.GetFullPath(args[1]).TrimEnd('\\');Output=Path.GetFullPath(args[2]);
   bool fixture=args[0]=="--fixture";
   Need(!fixture||Root.IndexOf("\\.local\\",StringComparison.OrdinalIgnoreCase)>=0,"fixture root must be private");
   Need(Output.IndexOf("\\.local\\",StringComparison.OrdinalIgnoreCase)>=0,"private results directory required");
   if(!fixture)Need(File.Exists(Path.Combine(Output,"claim.json"))&&File.Exists(Path.Combine(Output,"protected-read-started.json")),
    "owned one-use source requalification claim required");
   var planBytes=File.ReadAllBytes(args[3]);Need(planBytes.Length<=16*1024*1024&&Hash(planBytes)==args[4],"exact read plan pin");
   var plan=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(planBytes));
   var physical=Strings(plan["archives"]);
   Need(physical.Length==(fixture?1:123),"exact physical population");
   foreach(string a in physical)Need(Regex.IsMatch(a,@"^[a-z0-9_.-]+(?:/[a-z0-9_.-]+)*\.rpf$")&&!Audio(a)&&!a.Split('/').Any(p=>p=="."||p==".."||p.EndsWith("."))&&Physical.Add(a),"invalid physical scope");
   Need(Hash(File.ReadAllBytes(typeof(RpfFile).Assembly.Location))==(string)plan["parserSHA256"],"loaded parser pin differs");
   var selected=Strings(plan["selected"]);var nested=Strings(plan["branches"]);
   var branchSet=new HashSet<string>(nested,StringComparer.Ordinal);
   Need(branchSet.Count==nested.Length&&selected.Distinct(StringComparer.Ordinal).Count()==selected.Length,"duplicate selected map paths");
   foreach(string member in selected.Concat(nested)){
    string parent=ParentTable(member);
    Need(parent!=""&&(Physical.Contains(parent)||branchSet.Contains(parent))&&member==Normalize(member)&&
     !Audio(member)&&!member.Split('/').Any(p=>p.Length==0||p=="."||p==".."||p.Contains(":")),"unapproved or unbound selected map path");
   }
   using(Log=new StreamWriter(new FileStream(Path.Combine(Output,"metadata.jsonl"),FileMode.CreateNew,FileAccess.Write,FileShare.Read),new UTF8Encoding(false))){
    Log.AutoFlush=true;
    var staged=Path.Combine(Output,"metadata-payloads");
    Need(!Directory.Exists(staged)&&!File.Exists(staged),"fresh private metadata output required");
    Directory.CreateDirectory(staged);
    if(!fixture)Bootstrap((string)plan["executableSHA256"]);
    foreach(string rel in physical){
     ActiveArchive=rel;PayloadBytes=0;int priorBlocked=Blocked;
     string prefix=rel+"/";
     var selection=new HashSet<string>(selected.Where(a=>a.StartsWith(prefix,StringComparison.Ordinal)),StringComparer.Ordinal);
     var branches=new HashSet<string>(nested.Where(a=>a.StartsWith(prefix,StringComparison.Ordinal)),StringComparer.Ordinal);
     if(selection.Count==0&&branches.Count==0)continue;
     try{
      using(var f=new FileStream(PhysicalPath(rel),FileMode.Open,FileAccess.Read,FileShare.Read)){
       var before=Identity(f);
       Walk(f,rel,Path.GetFileName(rel),0,f.Length,selection,branches,0);
       Need(Same(before,Identity(f)),"archive identity changed during metadata read");
      }
      Emit(new{kind="archive-result",archive=rel,selected=selection.Count,payloadBytes=PayloadBytes,selectedTraversalComplete=Blocked==priorBlocked,effectiveSelectionVerified=false});
     }catch(Exception ex){Block(rel,ex.GetBaseException().Message);}
    }
   }
   return Blocked==0?0:2;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetBaseException().Message);return 1;}
 }
}
