// Explicit byte boundary for one reviewed public-source parser profile. No archive,
// installation discovery, key loading, runtime activation or audio access occurs.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using SharpDX;
namespace RichAudio.World {
 public static class CodeWalkerResourceBoundary03 {
  public const string ParserSourceCommit="485d56bec00262ed7fa472261cce7bbc6202b96e";
  const int Limit=16777216;
  static readonly object Gate=new object();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=33554432,RecursionLimit=64};
  static void Need(bool ok,string reason){if(!ok)throw new ArgumentException(reason);}
  static string Sha(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static long Pages(uint flags){
   long units=((flags>>27)&1)+(((flags>>26)&1)<<1)+(((flags>>25)&1)<<2)+(((flags>>24)&1)<<3)+(((flags>>17)&127)<<4)+(((flags>>11)&63)<<5)+(((flags>>7)&15)<<6)+(((flags>>5)&3)<<7)+(((flags>>4)&1)<<8);
   return (0x200L<<(int)(flags&15))*units;
  }
  static object Boundary(byte[] bytes,string kind,string expected,out byte[] payload,out int systemSize){
   Need(bytes!=null&&bytes.Length>=18&&bytes.Length<=Limit&&Sha(bytes)==expected,"Explicit byte length/digest required");
   Need(BitConverter.ToUInt32(bytes,0)==0x37435352,"Only compressed RSC7 resources; archive and PSO inputs unsupported");
   int version=BitConverter.ToInt32(bytes,4);uint sf=BitConverter.ToUInt32(bytes,8),gf=BitConverter.ToUInt32(bytes,12);
   Need(version==(kind=="ybn"?43:2),"Unsupported explicit resource version");
   Need((((sf>>28)<<4)|(gf>>28))==(uint)version,"Header/version page-flag nibbles disagree");
   long system=Pages(sf),graphics=Pages(gf),total=system+graphics;
   Need(system>0&&graphics>=0&&total<=Limit,"Bounded decoded resource pages required");
   // Check actual decompressed length before CodeWalker allocates its page arrays.
   // This deliberately supports compressed resources only, not every RSC variant.
   long inflated=0;var buffer=new byte[8192];systemSize=(int)system;
   using(var output=new MemoryStream((int)total)){
   using(var input=new MemoryStream(bytes,16,bytes.Length-16,false))using(var stream=new DeflateStream(input,CompressionMode.Decompress)){
    for(int n;(n=stream.Read(buffer,0,buffer.Length))!=0;){inflated+=n;Need(inflated<=total,"Compressed payload exceeds declared page budget");output.Write(buffer,0,n);}
   }
   Need(inflated==total,"Compressed payload/page byte length mismatch");
   payload=output.ToArray();}
   return new{version,systemBytes=system,graphicsBytes=graphics,inflatedBytes=inflated,maximumDecodedBytes=Limit,versionNibblesAgree=true,compressedPayload=true};
  }
  static int SystemRange(long pointer,long count,int systemSize){
   Need(count>=0&&pointer>=0x50000000L&&pointer<=0x50000000L+systemSize&&count<=0x50000000L+systemSize-pointer,"Meta block must remain in declared system pages");return (int)(pointer-0x50000000L);
  }
  static void QualifyPointers(Meta meta,Array_StructurePointer array,MetaName itemName,int itemSize){
   Need(array.Count1==array.Count2&&array.Count1<=4096,"Meta declared pointer counts must agree and stay bounded");if(array.Count1==0)return;
   var pointers=meta.GetBlock((int)array.PointerDataId);long end=(long)array.PointerDataOffset+(long)array.Count1*8;
   Need(pointers!=null&&pointers.StructureNameHash==(MetaName)MetaTypeName.POINTER&&pointers.Data!=null&&end<=pointers.Data.Length,"Meta pointer array must be wholly present");
   var seen=new HashSet<ulong>();foreach(var pointer in MetaTypes.GetPointerArray(meta,array)){
    var block=meta.GetBlock(pointer.BlockID);Need(seen.Add(pointer.Pointer)&&block!=null&&block.StructureNameHash==itemName&&block.Data!=null&&(long)pointer.Offset+itemSize<=block.Data.Length,"Only unique wholly present supported static Meta items qualify");
   }
  }
  static void QualifyMeta(byte[] payload,int systemSize,string kind){
   // The generic public parser permits fallback lookup of a named data block.
   // This narrower profile requires that named block to be the actual root and
   // forbids truncated pointer arrays being interpreted as an empty world.
   Need(systemSize>=112,"Meta header wholly present");int count=BitConverter.ToInt16(payload,76),rootIndex=BitConverter.ToInt32(payload,28);
   Need(count>0&&count<=4096&&rootIndex>0&&rootIndex<=count,"Bounded explicit Meta root index required");int table=SystemRange(BitConverter.ToInt64(payload,48),(long)count*16,systemSize);
   for(int i=0;i<count;i++){int offset=table+i*16,length=BitConverter.ToInt32(payload,offset+4);Need(length>=0&&length<=Limit,"Bounded Meta block bytes required");if(length>0)SystemRange(BitConverter.ToInt64(payload,offset+8),length,systemSize);}
   using(var system=new MemoryStream(payload,0,systemSize,false))using(var graphics=new MemoryStream(payload,systemSize,payload.Length-systemSize,false)){
    var reader=new ResourceDataReader(system,graphics){Position=0x50000000};
    var meta=reader.ReadBlock<Meta>();var expected=kind=="ymap"?MetaName.CMapData:MetaName.CMapTypes;var root=meta.GetRootBlock();int named=0;
    foreach(var block in meta.DataBlocks)if(block.StructureNameHash==expected)named++;
    Need(root!=null&&root.StructureNameHash==expected&&named==1&&root.Data!=null&&root.Data.Length>=(kind=="ymap"?512:80),"Exact unique supported Meta root required");
    if(kind=="ymap")QualifyPointers(meta,MetaTypes.ConvertData<CMapData>(root.Data).entities,MetaName.CEntityDef,Marshal.SizeOf(typeof(CEntityDef)));
    else QualifyPointers(meta,MetaTypes.ConvertData<CMapTypes>(root.Data).archetypes,MetaName.CBaseArchetypeDef,Marshal.SizeOf(typeof(CBaseArchetypeDef)));
   }
  }
  public static string Normalize(byte[] bytes,string kind,string expectedSHA256,string authority,string parserSHA256,bool gen9){
   Need(kind=="ymap"||kind=="ytyp"||kind=="ybn","Supported explicit resource kind required");
   Need(authority=="original-authored-fixture"||authority=="separately-authorized-explicit-resource","Explicit provenance required");
   Need(System.Text.RegularExpressions.Regex.IsMatch(parserSHA256??"","^[a-f0-9]{64}$"),"Bound parser binary identity required");
   byte[] payload;int systemSize;object boundary=Boundary(bytes,kind,expectedSHA256,out payload,out systemSize);string decoded;
   // CodeWalker's selector is process-global. Keep its mutation serialized and
   // restore the original value on success or parser failure; this is an offline
   // preparation API, never a render callback or a GTA critical-fiber operation.
   lock(Gate){bool original=RpfManager.IsGen9;try{RpfManager.IsGen9=gen9;if(kind!="ybn")QualifyMeta(payload,systemSize,kind);decoded=CodeWalkerStaticResourceAdapter02.Normalize(bytes,kind,expectedSHA256,authority);}finally{RpfManager.IsGen9=original;}}
   if(kind=="ybn"){
    // The compatibility normalizer predates this separate parser profile and
    // carries an old dev46 label. Correct that label in this new envelope only;
    // never change the established adapter/default parser's historical output.
    var body=Json.Deserialize<Dictionary<string,object>>(decoded);
    var collision=(Dictionary<string,object>)body["data"];
    var source=(Dictionary<string,object>)collision["source"];
    source["parser"]="pinned-public-source-CodeWalker-"+ParserSourceCommit;
    decoded=Json.Serialize(body);
   }
   return Json.Serialize(new{schema=1,kind="CodeWalkerBoundedResource03",resourceKind=kind,sourceSHA256=expectedSHA256,bytes=bytes.Length,sourceAuthority=authority,
    parserSourceCommit=ParserSourceCommit,parserSHA256,parserMvid=typeof(YmapFile).Assembly.ManifestModule.ModuleVersionId.ToString(),gen9ReaderSelected=gen9,
    boundary,decodedJson=decoded,decodedSHA256=Sha(Encoding.UTF8.GetBytes(decoded)),installedResourceVerified=false,runtimeActivationVerified=false,gameFilesRead=false});
  }
  static byte[] Map(bool gen9,bool passage,bool open,bool invalidCount=false){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapData);var pointers=new List<MetaPOINTER>();
   for(int i=0;i<(open?0:passage?2:1);i++){
    var d=new CEntityDef{archetypeName=new MetaHash(123456789),position=new Vector3(0,i==0?4:-4,0),rotation=new Vector4(0,0,0,1),scaleXY=1,scaleZ=1,parentIndex=-1,lodDist=100};
    pointers.Add(b.AddItemPtr(MetaName.CEntityDef,d));
   }
   var array=b.AddPointerArray(pointers.ToArray());if(invalidCount)array.Count2++;
   var map=new CMapData{name=new MetaHash(11111111),streamingExtentsMin=new Vector3(-16),streamingExtentsMax=new Vector3(16),entitiesExtentsMin=new Vector3(-16),entitiesExtentsMax=new Vector3(16),
    entities=array,block=new CBlockDesc{name=b.AddStringPtr("original-world03"),exportedBy=b.AddStringPtr("RichAudio-original-fixture"),time=b.AddStringPtr("01 January 2000 00:00")}};
   b.AddStructureInfo(MetaName.CMapData);b.AddStructureInfo(MetaName.CEntityDef);b.AddStructureInfo(MetaName.CBlockDesc);b.AddEnumInfo(MetaName.rage__eLodType);b.AddEnumInfo(MetaName.rage__ePriorityLevel);b.AddItem(MetaName.CMapData,map);
   return ResourceBuilder.Build(b.GetMeta(),2,true,gen9);
  }
  static byte[] Types(bool gen9){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapTypes);
   var def=new CBaseArchetypeDef{name=new MetaHash(123456789),physicsDictionary=new MetaHash(987654321),assetName=new MetaHash(33333333),bbMin=new Vector3(-4,-.04f,-1),bbMax=new Vector3(4,.04f,4),bsRadius=8,lodDist=100};
   var item=b.AddItemPtr(MetaName.CBaseArchetypeDef,def);var types=new CMapTypes{name=new MetaHash(22222222),archetypes=b.AddPointerArray(new[]{item})};
   b.AddStructureInfo(MetaName.CMapTypes);b.AddStructureInfo(MetaName.CBaseArchetypeDef);b.AddEnumInfo(MetaName.rage__fwArchetypeDef__eAssetType);b.AddItem(MetaName.CMapTypes,types);
   return ResourceBuilder.Build(b.GetMeta(),2,true,gen9);
  }
  static byte[] Collision(bool gen9){
   var g=new BoundGeometry{Type=BoundsType.Geometry,Vertices=new[]{new Vector3(-4,0,-2.5f),new Vector3(4,0,-2.5f),new Vector3(4,0,2.5f),new Vector3(-4,0,2.5f)},CenterGeom=new Vector3(0,0,1.5f),
    BoxMin=new Vector3(-4,-.04f,-1),BoxMax=new Vector3(4,.04f,4),Materials=new[]{new BoundMaterial_s{Data1=7,Data2=0}},PolygonMaterialIndices=new byte[]{0,0}};
   g.Polygons=new BoundPolygon[]{new BoundPolygonTriangle{triIndex1=0,triIndex2=1,triIndex3=2,triArea=20,Owner=g,edgeIndex1=65535,edgeIndex2=65535,edgeIndex3=65535},new BoundPolygonTriangle{triIndex1=0,triIndex2=2,triIndex3=3,triArea=20,Owner=g,edgeIndex1=65535,edgeIndex2=65535,edgeIndex3=65535}};
   g.CalculateQuantum();return ResourceBuilder.Build(g,43,true,gen9);
  }
  public static string OriginalBuildingResources(string parserSHA256){
   var groups=new List<object>();int rejected=0;bool initial=RpfManager.IsGen9;
   foreach(string profile in new[]{"legacy-building","gen9-building","gen9-passage","gen9-open"}){
    bool gen9=profile!="legacy-building",passage=profile=="gen9-passage",open=profile=="gen9-open";var resources=new List<object>();
    foreach(string kind in new[]{"ymap","ytyp","ybn"}){
     byte[] first=kind=="ymap"?Map(gen9,passage,open):kind=="ytyp"?Types(gen9):Collision(gen9);
     byte[] second=kind=="ymap"?Map(gen9,passage,open):kind=="ytyp"?Types(gen9):Collision(gen9);Need(Sha(first)==Sha(second),"Actual-format authored bytes must be deterministic");
     string hash=Sha(first),normalized=Normalize(first,kind,hash,"original-authored-fixture",parserSHA256,gen9);
     resources.Add(new{kind,sha256=hash,bytes=first.Length,base64=Convert.ToBase64String(first),normalized=Json.DeserializeObject(normalized)});
     try{Normalize(first,kind,new string('0',64),"original-authored-fixture",parserSHA256,gen9);}catch(ArgumentException){rejected++;}
     var wrong=(byte[])first.Clone();wrong[15]^=0x10;try{Normalize(wrong,kind,Sha(wrong),"original-authored-fixture",parserSHA256,gen9);}catch(ArgumentException){rejected++;}
     var pageMismatch=(byte[])first.Clone();pageMismatch[8]^=0x10;try{Normalize(pageMismatch,kind,Sha(pageMismatch),"original-authored-fixture",parserSHA256,gen9);}catch(ArgumentException){rejected++;}
    }
    groups.Add(new{profile,gen9,resources,expectedRootVertices=new[]{new[]{-4d,0d,-1d},new[]{4d,0d,-1d},new[]{4d,0d,4d},new[]{-4d,0d,4d}}});
   }
   int strictMetaControls=0;foreach(bool gen9 in new[]{false,true}){
    // Both bytes pass the RSC7/decompression boundary, then fail inside the
    // selector gate. This independently exercises restoration on parser failure.
    foreach(byte[] invalid in new[]{Types(gen9),Map(gen9,false,false,true)}){
     try{Normalize(invalid,"ymap",Sha(invalid),"original-authored-fixture",parserSHA256,gen9);}catch(ArgumentException){strictMetaControls++;}
     Need(RpfManager.IsGen9==initial,"Parser selector must restore after rejected Meta root/count");
    }
   }
   Need(rejected==36&&strictMetaControls==4,"Header and strict Meta rejection controls required");Need(RpfManager.IsGen9==initial,"Parser selector must be restored");
   return Json.Serialize(new{schema=1,kind="original-resource-building03-roundtrips",parserSourceCommit=ParserSourceCommit,parserSHA256,groups,negativeControlsPassed=rejected,strictMetaControlsPassed=strictMetaControls,parserSelectorRestored=true,
    sourceAuthority="original-authored-fixture",gameFilesRead=false,installedEnhancedVerified=false,endpointOpened=false});
  }
 }
}
