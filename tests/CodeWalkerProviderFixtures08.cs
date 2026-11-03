// Original native resources and archive writer; no installed assets or keys.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using SharpDX;
using RichAudio.World;

public static class CodeWalkerProviderFixtures08 {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16777216};
 static string Sha(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static void Put24(byte[] b,int at,uint n){b[at]=(byte)n;b[at+1]=(byte)(n>>8);b[at+2]=(byte)(n>>16);}
 static void Put32(byte[] b,int at,uint n){Buffer.BlockCopy(BitConverter.GetBytes(n),0,b,at,4);}
 sealed class Member {public string Name;public byte[] Data;public bool Resource;public uint System,Graphics;public Member(string name,byte[] bytes,bool resource=false){Name=name;Data=bytes;Resource=resource;if(resource){System=BitConverter.ToUInt32(bytes,8);Graphics=BitConverter.ToUInt32(bytes,12);}}}
 static byte[] Archive(Member[] members,bool scrambled=false){
  var names=new MemoryStream();names.WriteByte(0);var offsets=new List<ushort>();foreach(var m in members){offsets.Add((ushort)names.Position);var n=Encoding.ASCII.GetBytes(m.Name+"\0");names.Write(n,0,n.Length);}var nameBytes=names.ToArray();int count=members.Length+1,prefix=16+count*16+nameBytes.Length,at=(prefix+511)&~511;var locations=new List<int>();foreach(var m in members){locations.Add(at);at=(at+m.Data.Length+511)&~511;}var all=new byte[at];Put32(all,0,0x52504637);Put32(all,4,(uint)count);Put32(all,8,(uint)nameBytes.Length);Put32(all,12,0x4e45504f);Put32(all,16+4,0x7fffff00);Put32(all,16+8,1);Put32(all,16+12,(uint)members.Length);
  for(int i=0;i<members.Length;i++){var m=members[i];int p=16+(i+1)*16;Buffer.BlockCopy(BitConverter.GetBytes(offsets[i]),0,all,p,2);Put24(all,p+2,m.Resource?(uint)m.Data.Length:0);Put24(all,p+5,(uint)(locations[i]/512)|(m.Resource?0x800000u:0));Put32(all,p+8,m.Resource?m.System:(uint)m.Data.Length);Put32(all,p+12,m.Resource?m.Graphics:0);Buffer.BlockCopy(m.Data,0,all,locations[i],m.Data.Length);if(scrambled&&m.Resource)for(int n=0;n<16;n++)all[locations[i]+n]=(byte)(0xa0+n);}
  Buffer.BlockCopy(nameBytes,0,all,16+count*16,nameBytes.Length);return all;
 }
 static byte[] Types(uint collision){var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapTypes);var def=new CBaseArchetypeDef{name=new MetaHash(123456789),physicsDictionary=new MetaHash(collision),assetName=new MetaHash(33333333),bbMin=new Vector3(-4,-.04f,-1),bbMax=new Vector3(4,.04f,4),bsRadius=8,lodDist=100};var item=b.AddItemPtr(MetaName.CBaseArchetypeDef,def);var root=new CMapTypes{name=new MetaHash(22222222),archetypes=b.AddPointerArray(new[]{item})};b.AddStructureInfo(MetaName.CMapTypes);b.AddStructureInfo(MetaName.CBaseArchetypeDef);b.AddEnumInfo(MetaName.rage__fwArchetypeDef__eAssetType);b.AddItem(MetaName.CMapTypes,root);return ResourceBuilder.Build(b.GetMeta(),2,true,true);}
 static byte[] LinkedYmf(uint collision){
  var p=new PsoBuilder();p.EnsureBlock(MetaName.CPackFileMetaData);uint map=JenkHash.GenHash("original_building08"),types=JenkHash.GenHash("original_types08");
  var hash=p.AddHashArrayPtr(new[]{new MetaHash(MetaTypes.SwapBytes(collision))});var group=new CMapDataGroup{Name=new MetaHash(map),Bounds=hash,Flags=0,HoursOnOff=0};group.SwapEnd();
  var interior=new CInteriorBoundsFiles{Name=new MetaHash(11223344),Bounds=hash};interior.SwapEnd();var dependency=new CImapDependency{imapName=new MetaHash(map),itypName=new MetaHash(types),packFileName=new MetaHash(JenkHash.GenHash("base"))};dependency.SwapEnd();
  var root=new CPackFileMetaData{MapDataGroups=p.AddItemArrayPtr((MetaName)3260758307,new[]{group}),Interiors=p.AddItemArrayPtr((MetaName)741495440,new[]{interior}),imapDependencies=p.AddItemArrayPtr((MetaName)3501026914,new[]{dependency})};root.SwapEnd();p.RootPointer=p.AddItem(MetaName.CPackFileMetaData,root);return p.GetPso().Save();
 }
 static void New(string root,string name,byte[] data){using(var f=new FileStream(Path.Combine(root,name),FileMode.CreateNew,FileAccess.Write,FileShare.None))f.Write(data,0,data.Length);}
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,uint inputBytes,IntPtr output,uint outputBytes,out uint returned,IntPtr overlapped);
 static void Sparse(string root,byte[] prefix){using(var f=new FileStream(Path.Combine(root,"sparse-original.rpf"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){uint returned;if(!DeviceIoControl(f.SafeFileHandle,0x900c4,IntPtr.Zero,0,IntPtr.Zero,0,out returned,IntPtr.Zero))throw new IOException("Original sparse fixture requires supported filesystem");f.Write(prefix,0,prefix.Length);f.SetLength(3000000073L);}}
 public static int Main(string[] args){try{
  if(args.Length!=2)throw new ArgumentException("fresh output directory and parser SHA required");var root=Path.GetFullPath(args[0]);if(Directory.Exists(root)||File.Exists(root))throw new ArgumentException("fresh output required");Directory.CreateDirectory(root);var corpus=(Dictionary<string,object>)Json.DeserializeObject(CodeWalkerResourceBoundary03.OriginalBuildingResources(args[1]));var group=((object[])corpus["groups"]).Cast<Dictionary<string,object>>().Single(g=>(string)g["profile"]=="gen9-building");var values=((object[])group["resources"]).Cast<Dictionary<string,object>>().ToDictionary(r=>(string)r["kind"],r=>Convert.FromBase64String((string)r["base64"]));uint collision=JenkHash.GenHash("original_collision08");values["ytyp"]=Types(collision);
  var cache=new CacheDatFile{Version="RichAudioOriginal08",FileDates=new CacheFileDate[0],AllMapNodes=new MapDataStoreNode[0],AllCInteriorProxies=new CInteriorProxy[0],AllBoundsStoreItems=new[]{new BoundsStoreItem{Name=new MetaHash(collision),Min=new Vector3(-4,3.96f,-1),Max=new Vector3(4,4.04f,4),Layer=0}}};
  var pso=new PsoBuilder();pso.RootPointer=pso.AddItem(MetaName.CPackFileMetaData,new CPackFileMetaData());
  var members=new[]{new Member("original_building08.ymap",values["ymap"],true),new Member("original_types08.ytyp",values["ytyp"],true),new Member("original_collision08.ybn",values["ybn"],true),new Member("gta5_cache_y.dat",cache.Save()),new Member("_manifest.ymf",pso.GetPso().Save()),new Member("setup2.xml",Encoding.UTF8.GetBytes("<SSetupData><deviceName>dlc_original08</deviceName><datFile>content.xml</datFile><nameHash>original08</nameHash><order value=\"1\"/><minorOrder value=\"0\"/><subPackCount value=\"0\"/></SSetupData>")),new Member("content.xml",Encoding.UTF8.GetBytes("<CDataFileMgr__ContentsOfDataFileXml><dataFiles/><contentChangeSets/></CDataFileMgr__ContentsOfDataFileXml>")),new Member("dlclist.xml",Encoding.UTF8.GetBytes("<SMandatoryPacksData><Paths><Item>dlcpacks:/original08/</Item></Paths></SMandatoryPacksData>"))};
  var archive=Archive(members);New(root,"original.rpf",archive);New(root,"scrambled.rpf",Archive(members,true));New(root,"nested.rpf",Archive(new[]{new Member("child.rpf",archive)}));New(root,"metadata-links.rpf",Archive(new[]{new Member("_manifest.ymf",LinkedYmf(collision))}));Sparse(root,archive);foreach(var pair in values)New(root,"original."+pair.Key,pair.Value);
  var bad=(byte[])archive.Clone();Put32(bad,12,0x12345678);New(root,"unknown-tag.rpf",bad);bad=(byte[])archive.Clone();Put32(bad,12,0x0fefffff);New(root,"missing-ng.rpf",bad);bad=(byte[])archive.Clone();Put32(bad,16+12,99999);New(root,"bad-tree.rpf",bad);bad=(byte[])archive.Clone();Put24(bad,16+16+5,0xffffff);New(root,"bad-range.rpf",bad);
  New(root,"proof.json",Encoding.UTF8.GetBytes(Json.Serialize(new{schema=1,kind="RichAudioOriginalProviderFixture08",sourceAuthority="original-authored-fixture",parserSHA256=args[1],archiveSHA256=Sha(archive),archiveBytes=archive.Length,headerSHA256=Sha(archive.Take(16).ToArray()),collisionHash=collision,collisionFrame="archetype-local",authoredFrameDeclaration=true,expectedResources=3,expectedMetadata=5,expectedRootVertices=new[]{new[]{-4d,0d,-1d},new[]{4d,0d,-1d},new[]{4d,0d,4d},new[]{-4d,0d,4d}},expectedWorldVertices=new[]{new[]{-4d,4d,-1d},new[]{4d,4d,-1d},new[]{4d,4d,4d},new[]{-4d,4d,4d}},gameFilesRead=false,keysAcquired=false,installedEnhancedVerified=false})));Console.WriteLine("PASS original native RSC7/RPF7 fixture generation");return 0;
 }catch(Exception e){Console.Error.WriteLine(e.ToString());return 2;}}
}
