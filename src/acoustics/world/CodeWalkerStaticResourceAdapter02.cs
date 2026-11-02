// Original explicit-byte adapter. No game discovery, keys, archives or file IO.
// The existing locally trusted CodeWalker parser supplies the actual RSC7 API.
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using SharpDX;
namespace RichAudio.World {
 public static class CodeWalkerStaticResourceAdapter02 {
  const int MaximumBytes=16777216,MaximumEntities=4096;
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16777216,RecursionLimit=64};
  static string Hash(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
  static double[] V(Vector3 v){return new[]{(double)v.X,(double)v.Y,(double)v.Z};}
  static void Check(bool value,string reason){if(!value)throw new ArgumentException(reason);}
  static void Header(byte[] bytes,string expected,string kind){
   Check(bytes!=null&&bytes.Length>=17&&bytes.Length<=MaximumBytes&&Hash(bytes)==expected,"Explicit resource byte digest/bounds required");
   Check(BitConverter.ToUInt32(bytes,0)==0x37435352,"Only explicit RSC7 resources; no RPF/archive discovery");
   int version=BitConverter.ToInt32(bytes,4);Check(version==(kind=="ybn"?43:2),"Unsupported explicit resource version");
   long system=RpfResourceFileEntry.GetSizeFromFlags(BitConverter.ToUInt32(bytes,8));
   long graphics=RpfResourceFileEntry.GetSizeFromFlags(BitConverter.ToUInt32(bytes,12));
   Check(system>0&&graphics>=0&&system+graphics<=MaximumBytes,"Decoded resource page budget");
  }
  public static string Normalize(byte[] bytes,string kind,string sourceSHA256,string authority){
   Check(kind=="ymap"||kind=="ytyp"||kind=="ybn","Explicit supported resource kind");
   Check(authority=="original-authored-fixture"||authority=="separately-authorized-explicit-resource","Explicit resource provenance required");Header(bytes,sourceSHA256,kind);
   object data;
   if(kind=="ymap"){
    var map=new YmapFile();map.Load(bytes);var entities=new List<object>();var input=map.AllEntities??new YmapEntityDef[0];Check(input.Length<=MaximumEntities,"YMAP entity budget");int unsupported=0;
    for(int i=0;i<input.Length;i++){
     var entity=input[i];if(entity==null||entity.MloInstance!=null||entity.MloParent!=null){unsupported++;continue;}var d=entity.CEntityDef;
     entities.Add(new{id="entity-"+i,kind="CEntityDef",archetypeName=d.archetypeName.Hash,position=V(d.position),rotation=new[]{(double)d.rotation.X,d.rotation.Y,d.rotation.Z,d.rotation.W},
      scaleXY=(double)d.scaleXY,scaleZ=(double)d.scaleZ,isMlo=false,hasMloParent=false,parentIndex=d.parentIndex,flags=d.flags});
    }
    data=new{entities,unsupportedEntities=unsupported,scripted=map.IsScripted,parentHash=map.CMapData.parent.Hash,
     activation="unverified: scripted/time/weather/entity-set/runtime mount state not observed",lodParentComposition="parentIndex is not a spatial transform"};
   }else if(kind=="ytyp"){
    var type=new YtypFile();type.Load(bytes);var archetypes=new List<object>();var input=type.AllArchetypes??new Archetype[0];Check(input.Length<=MaximumEntities,"YTYP archetype budget");int unsupported=0;
    foreach(var archetype in input){if(archetype==null||archetype.GetType()!=typeof(Archetype)){unsupported++;continue;}var d=archetype.BaseArchetypeDef;
     archetypes.Add(new{nameHash=d.name.Hash,physicsDictionary=d.physicsDictionary.Hash,assetName=d.assetName.Hash,assetType=d.assetType.ToString(),
      bounds=new{min=V(d.bbMin),max=V(d.bbMax)},flags=d.flags,kind="CBaseArchetypeDef"});}
    data=new{archetypes,unsupportedArchetypes=unsupported,collisionBinding="physicsDictionary is not itself an independently verified YBN mapping"};
   }else{
    var collision=new YbnFile();collision.Load(bytes);Check(collision.Bounds!=null,"YBN bounds missing");
    data=Json.DeserializeObject(CodeWalkerCollisionAdapter.Normalize(collision.Bounds,"original-or-explicit-resource","resource.ybn",sourceSHA256,bytes.Length));
   }
   return Json.Serialize(new{schema=1,kind="CodeWalkerExplicitStaticResource02",resourceKind=kind,sourceSHA256,bytes=bytes.Length,sourceAuthority=authority,
    parserMvid=typeof(YmapFile).Assembly.ManifestModule.ModuleVersionId.ToString(),data,worldPlacementVerified=false,installedWorldComplete=false,runtimeActivation="unverified",gameFilesRead=false});
  }
  // Fixed CBlockDesc avoids YmapFile.Save's UTC editor-export string. This
  // constructs wholly original data through public MetaBuilder APIs, not a map.
  static byte[] AuthoredYmap(){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapData);
   var d=new CEntityDef{archetypeName=new MetaHash(123456789),position=new Vector3(2,4,1),rotation=new Vector4(0,0,0,1),scaleXY=1,scaleZ=1,parentIndex=-1,lodDist=100};
   var pointer=b.AddItemPtr(MetaName.CEntityDef,d);
   var map=new CMapData{name=new MetaHash(11111111),streamingExtentsMin=new Vector3(-16),streamingExtentsMax=new Vector3(16),entitiesExtentsMin=new Vector3(-16),entitiesExtentsMax=new Vector3(16),
    entities=b.AddPointerArray(new[]{pointer}),block=new CBlockDesc{name=b.AddStringPtr("original-world02"),exportedBy=b.AddStringPtr("RichAudio-original-fixture"),time=b.AddStringPtr("01 January 2000 00:00")}};
   b.AddStructureInfo(MetaName.CMapData);b.AddStructureInfo(MetaName.CEntityDef);b.AddStructureInfo(MetaName.CBlockDesc);
   b.AddEnumInfo(MetaName.rage__eLodType);b.AddEnumInfo(MetaName.rage__ePriorityLevel);b.AddItem(MetaName.CMapData,map);return ResourceBuilder.Build(b.GetMeta(),2);
  }
  static byte[] AuthoredYtyp(){
   var file=new YtypFile{NameHash=22222222};var d=new CBaseArchetypeDef{name=new MetaHash(123456789),physicsDictionary=new MetaHash(987654321),assetName=new MetaHash(33333333),
    bbMin=new Vector3(-1,-.1f,-1),bbMax=new Vector3(1,.1f,1),bsRadius=2,lodDist=100};var archetype=new Archetype();archetype.Init(file,ref d);file.AddArchetype(archetype);return file.Save();
  }
  static byte[] AuthoredYbn(){
   var geometry=new BoundGeometry{Type=BoundsType.Geometry,Vertices=new[]{new Vector3(-1,0,-1),new Vector3(1,0,-1),new Vector3(0,0,1)},CenterGeom=Vector3.Zero,
    BoxMin=new Vector3(-1,-.04f,-1),BoxMax=new Vector3(1,.04f,1),Materials=new[]{new BoundMaterial_s{Data1=7,Data2=0}},PolygonMaterialIndices=new byte[]{0}};
   var triangle=new BoundPolygonTriangle{triIndex1=0,triIndex2=1,triIndex3=2,triArea=2,Owner=geometry};
   // dev46 exposes signed-short edge indices; the separately selected public
   // Gen9-capable profile exposes unsigned-short indices. Preserve the exact
   // 0xffff missing-edge representation without changing default fixture bytes.
   foreach(string name in new[]{"edgeIndex1","edgeIndex2","edgeIndex3"}){
    var property=typeof(BoundPolygonTriangle).GetProperty(name);
    Check(property!=null&&(property.PropertyType==typeof(short)||property.PropertyType==typeof(ushort)),"Known triangle edge sentinel type required");
    property.SetValue(triangle,property.PropertyType==typeof(short)?(object)(short)-1:(object)ushort.MaxValue,null);
   }
   geometry.Polygons=new BoundPolygon[]{triangle};
   geometry.CalculateQuantum();return new YbnFile{Bounds=geometry}.Save();
  }
  public static string OriginalRoundTrips(){
   var resources=new List<object>();int rejected=0;foreach(string kind in new[]{"ymap","ytyp","ybn"}){
    byte[] first=kind=="ymap"?AuthoredYmap():kind=="ytyp"?AuthoredYtyp():AuthoredYbn();byte[] second=kind=="ymap"?AuthoredYmap():kind=="ytyp"?AuthoredYtyp():AuthoredYbn();
    Check(Hash(first)==Hash(second),"Original resource construction must be byte-deterministic");
    resources.Add(new{kind,sha256=Hash(first),bytes=first.Length,base64=Convert.ToBase64String(first),normalized=Json.DeserializeObject(Normalize(first,kind,Hash(first),"original-authored-fixture"))});
    try{Normalize(first,kind,new string('0',64),"original-authored-fixture");}catch(ArgumentException){rejected++;}
    var wrongVersion=(byte[])first.Clone();wrongVersion[4]=99;
    try{Normalize(wrongVersion,kind,Hash(wrongVersion),"original-authored-fixture");}catch(ArgumentException){rejected++;}
    var oversizedPages=(byte[])first.Clone();for(int p=8;p<12;p++)oversizedPages[p]=255;
    try{Normalize(oversizedPages,kind,Hash(oversizedPages),"original-authored-fixture");}catch(ArgumentException){rejected++;}
   }
   Check(rejected==9,"All original resource digest/version/page-budget controls required");
   return Json.Serialize(new{schema=1,kind="original-CodeWalker-ymap-ytyp-ybn-roundtrip-fixtures",resources,negativeControlsPassed=rejected,gameFilesRead=false,endpointOpened=false,installedWorldComplete=false});
  }
 }
}
