// Original fixture-only oracle for one separately prepared public CodeWalker profile.
// Supplied buffers only: no file/archive/key/tool-loading or runtime/audio access.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml;
using CodeWalker.GameFiles;
using RichAudio.World;
using SharpDX;

namespace RichAudio.Tests {
 public static class CodeWalkerXml042 {
  const int MaximumXmlCharacters=1048576, MaximumXmlNodes=4096, MaximumDepth=64;
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=33554432,RecursionLimit=96};
  static readonly object Gate=new object();
  static void Need(bool value,string reason){if(!value)throw new InvalidOperationException(reason);}
  static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static XmlReader Reader(string xml){return XmlReader.Create(new StringReader(xml),new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=MaximumXmlCharacters,MaxCharactersFromEntities=0,CloseInput=true});}
  public static XmlDocument SecureDocument(string xml){
   Need(xml!=null&&xml.Length<=MaximumXmlCharacters,"Fixture XML character bound");
   using(var reader=Reader(xml)){int count=0;while(reader.Read()){Need(reader.Depth<=MaximumDepth&&++count<=MaximumXmlNodes,"Fixture XML depth/node bound");}}
   var doc=new XmlDocument{XmlResolver=null};using(var reader=Reader(xml))doc.Load(reader);
   Need(doc.DocumentType==null&&doc.DocumentElement!=null,"Fixture XML root and no DTD required");return doc;
  }
  static Dictionary<string,object> Data(byte[] bytes,string kind,string parser,bool gen9){
   var envelope=Json.Deserialize<Dictionary<string,object>>(CodeWalkerResourceBoundary03.Normalize(bytes,kind,Hash(bytes),"original-authored-fixture",parser,gen9));
   var decoded=Json.Deserialize<Dictionary<string,object>>((string)envelope["decodedJson"]);
   var data=(Dictionary<string,object>)decoded["data"];
   // Byte identity belongs in the receipt. Semantic collision invariants exclude
   // the source envelope, whose resource SHA/size necessarily changes on rebuild.
   if(kind=="ybn")data.Remove("source");return data;
  }
  static bool Numeric(object value){return value is byte||value is short||value is ushort||value is int||value is uint||value is long||value is ulong||value is float||value is double||value is decimal;}
  static void Same(object a,object b,string at){
   if(a==null||b==null){Need(a==b,"XML semantic null mismatch: "+at);return;}
   if(Numeric(a)&&Numeric(b)){Need(Math.Abs(Convert.ToDouble(a)-Convert.ToDouble(b))<=0.0002,"XML semantic numeric mismatch: "+at);return;}
   var ad=a as Dictionary<string,object>;var bd=b as Dictionary<string,object>;
   if(ad!=null||bd!=null){Need(ad!=null&&bd!=null&&ad.Count==bd.Count,"XML semantic object mismatch: "+at);foreach(var pair in ad){Need(bd.ContainsKey(pair.Key),"XML semantic member missing: "+at);Same(pair.Value,bd[pair.Key],at+"."+pair.Key);}return;}
   var aa=a as IList;var ba=b as IList;
   if(aa!=null||ba!=null){Need(aa!=null&&ba!=null&&aa.Count==ba.Count,"XML semantic array mismatch: "+at);for(int i=0;i<aa.Count;i++)Same(aa[i],ba[i],at+"["+i+"]");return;}
   Need(a.Equals(b),"XML semantic scalar mismatch: "+at);
  }
  static object Round(byte[] bytes,string kind,string parser,bool readerGen9,bool writerGen9,string method,Dictionary<string,object> before){
   Need(bytes!=null&&bytes.Length>=18&&bytes.Length<=16777216,"Original roundtrip resource bound");
   Same(before,Data(bytes,kind,parser,readerGen9),kind);
   return new{method,writerGen9,readerGen9,bytes=bytes.Length,sha256=Hash(bytes),boundedStaticDtoPreserved=true,comparisonScope="Existing static DTO fields, including raw placement, archetype binding, collision hierarchy/center/transform/vertices/triangles/materials; excludes source byte envelope and unrepresented format fields",base64=Convert.ToBase64String(bytes)};
  }
  static object Resource(byte[] original,string kind,bool gen9,string parser){
   var before=Data(original,kind,parser,gen9);string xml,exportName;
   if(kind=="ymap"){var map=new YmapFile();map.Load(original);xml=MetaXml.GetXml(map,out exportName);}
   else if(kind=="ytyp"){var types=new YtypFile();types.Load(original);xml=MetaXml.GetXml(types,out exportName);}
   else {var collision=new YbnFile();collision.Load(original);xml=MetaXml.GetXml(collision,out exportName);}
   Need(!string.IsNullOrWhiteSpace(xml),"Actual CodeWalker XML export required");var doc=SecureDocument(xml);
   byte[] defaultBytes=kind=="ybn"?XmlMeta.GetYbnData(doc):XmlMeta.GetRSCData(doc);
   var defaultRound=Round(defaultBytes,kind,parser,gen9,false,kind=="ybn"?"XmlMeta.GetYbnData -> YbnFile.Save":"XmlMeta.GetRSCData",before);
   // The public convenience APIs above do not take a Gen9 writer argument.
   // Exercise the actual XML parser, then explicitly select the builder mode.
   byte[] selected=kind=="ybn"?ResourceBuilder.Build(XmlYbn.GetYbn(doc).Bounds,43,true,gen9):ResourceBuilder.Build(XmlMeta.GetMeta(doc),2,true,gen9);
   var selectedRound=Round(selected,kind,parser,gen9,gen9,kind=="ybn"?"XmlYbn.GetYbn -> ResourceBuilder.Build43(explicit gen9)":"XmlMeta.GetMeta -> ResourceBuilder.Build2(explicit gen9)",before);
   byte[] utf8=new UTF8Encoding(false,true).GetBytes(xml);
   return new{kind,originalBytes=original.Length,originalSHA256=Hash(original),xmlBytes=utf8.Length,xmlSHA256=Hash(utf8),xmlRoot=doc.DocumentElement.Name,
    xmlParser="XmlReader DTD prohibited, resolver null, 1Mi character/4096 node/64 depth caps",exportName,
    defaultRoundTrip=defaultRound,explicitWriterRoundTrip=selectedRound,xmlBase64=Convert.ToBase64String(utf8),
    sourceAuthority="original-authored-fixture",actualEnhancedCompatibilityVerified=false};
  }
  public static string RunGroup(byte[] map,byte[] types,byte[] collision,bool gen9,string parser){
   lock(Gate){bool initial=RpfManager.IsGen9;try{RpfManager.IsGen9=gen9;var rows=new List<object>();
    rows.Add(Resource(map,"ymap",gen9,parser));rows.Add(Resource(types,"ytyp",gen9,parser));rows.Add(Resource(collision,"ybn",gen9,parser));
    return Json.Serialize(new{schema=1,kind="original-CodeWalker-XML042-roundtrip",passed=true,gen9ReaderRequested=gen9,resources=rows,
     semanticRoundTrips=6,defaultWriterGen9=false,explicitWriterGen9=gen9,sourceAuthority="original-authored-fixture",gameFilesRead=false,keysRead=false,installedEnhancedCompatibilityVerified=false});
   }finally{RpfManager.IsGen9=initial;}}
  }
  static byte[] ChallengeMap(bool gen9){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapData);
   var q=Quaternion.RotationAxis(Vector3.Normalize(new Vector3(1,2,3)),0.7f);
   var entity=new CEntityDef{archetypeName=new MetaHash(123456789),position=new Vector3(123,-87,31),rotation=new Vector4(q.X,q.Y,q.Z,q.W),scaleXY=2,scaleZ=3,parentIndex=-1,lodDist=100};
   var item=b.AddItemPtr(MetaName.CEntityDef,entity);
   var map=new CMapData{name=new MetaHash(11111111),streamingExtentsMin=new Vector3(-256),streamingExtentsMax=new Vector3(256),entitiesExtentsMin=new Vector3(-256),entitiesExtentsMax=new Vector3(256),
    entities=b.AddPointerArray(new[]{item}),block=new CBlockDesc{name=b.AddStringPtr("original-XML042-transform"),exportedBy=b.AddStringPtr("RichAudio-original-fixture"),time=b.AddStringPtr("01 January 2000 00:00")}};
   b.AddStructureInfo(MetaName.CMapData);b.AddStructureInfo(MetaName.CEntityDef);b.AddStructureInfo(MetaName.CBlockDesc);b.AddEnumInfo(MetaName.rage__eLodType);b.AddEnumInfo(MetaName.rage__ePriorityLevel);b.AddItem(MetaName.CMapData,map);
   return ResourceBuilder.Build(b.GetMeta(),2,true,gen9);
  }
  static byte[] ChallengeCollision(bool gen9){
   // Vertices are relative to GeometryCenter and must fit the quantum derived
   // from the authored bound extents. Inconsistent extents would saturate them.
   var geometry=new BoundGeometry{Type=BoundsType.Geometry,Vertices=new[]{new Vector3(-1,-2,-2.5f),new Vector3(0,1,2.5f),new Vector3(1,2,-1.5f)},CenterGeom=new Vector3(10,2,-3),
    BoxMin=new Vector3(9,0,-5.5f),BoxMax=new Vector3(11,4,-0.5f),Transform=Matrix.RotationZ(0.5f)*Matrix.Translation(100,20,30),
    Materials=new[]{new BoundMaterial_s{Data1=0x80000007u,Data2=65536u}},PolygonMaterialIndices=new byte[]{0}};
   geometry.Polygons=new BoundPolygon[]{new BoundPolygonTriangle{triIndex1=0,triIndex2=1,triIndex3=2,triArea=7,Owner=geometry,edgeIndex1=65535,edgeIndex2=65535,edgeIndex3=65535}};
   geometry.CalculateQuantum();var composite=new BoundComposite{Type=BoundsType.Composite,Children=new ResourcePointerArray64<Bounds>{data_items=new Bounds[]{geometry}}};geometry.Parent=composite;
   return ResourceBuilder.Build(composite,43,true,gen9);
  }
  public static string RunTransformChallenge(byte[] types,bool gen9,string parser){
   byte[] map=ChallengeMap(gen9),collision=ChallengeCollision(gen9);
   var mapData=Data(map,"ymap",parser,gen9);var entities=(IList)mapData["entities"];Need(entities.Count==1,"One authored transform challenge entity required");var entity=(Dictionary<string,object>)entities[0];
   Same(new[]{123d,-87d,31d},entity["position"],"challenge position");Same(2d,entity["scaleXY"],"challenge XY scale");Same(3d,entity["scaleZ"],"challenge Z scale");
   var q=Quaternion.RotationAxis(Vector3.Normalize(new Vector3(1,2,3)),0.7f);Same(new[]{(double)q.X,q.Y,q.Z,q.W},entity["rotation"],"challenge stored quaternion");
   var collisionData=Data(collision,"ybn",parser,gen9);var nodes=(IList)collisionData["nodes"];Need(nodes.Count==2,"Composite and geometry challenge nodes required");var child=(Dictionary<string,object>)nodes[1];
   Need((string)((Dictionary<string,object>)nodes[0])["type"]=="BoundComposite"&&(string)child["type"]=="BoundGeometry","Actual composite hierarchy required");
   Same(new[]{10d,2d,-3d},child["center"],"challenge geometry center");var transform=Matrix.RotationZ(0.5f)*Matrix.Translation(100,20,30);Same(Array.ConvertAll(transform.ToArray(),v=>(double)v),child["transform"],"challenge child transform");
   var materials=(IList)child["materials"];Need(materials.Count==1,"One challenge material required");var material=(Dictionary<string,object>)materials[0];Same(0x80000007u,material["data1"],"challenge packed material1");Same(65536u,material["data2"],"challenge packed material2");
   var polygons=(IList)child["polygons"];Need(polygons.Count==1,"One challenge triangle required");var polygon=(Dictionary<string,object>)polygons[0];Need((string)polygon["family"]=="Triangle","Challenge triangle family required");Same(new[]{0,1,2},polygon["indices"],"challenge triangle indices");Same(0,polygon["materialSlot"],"challenge triangle material slot");
   var vertices=(IList)child["vertices"];Same(new[]{-1d,-2d,-2.5d},vertices[0],"challenge first binary vertex");var sample=(Dictionary<string,object>)((IList)child["oracleSamples"])[0];var expected=Vector3.TransformCoordinate(new Vector3(-1,-2,-2.5f)+new Vector3(10,2,-3),transform);Same(new[]{(double)expected.X,expected.Y,expected.Z},sample["positionInParent"],"challenge center-before-child-transform oracle");
   var result=Json.Deserialize<Dictionary<string,object>>(RunGroup(map,types,collision,gen9,parser));
   result["challenge"]=new{ordinaryEntityQuaternionAxis=new[]{1,2,3},quaternionAngleRadians=0.7,position=new[]{123,-87,31},scaleXY=2,scaleZ=3,
    compositeChildRotationZRadians=0.5,compositeChildTranslation=new[]{100,20,30},geometryCenter=new[]{10,2,-3},nativeMaterialData1=0x80000007u,nativeMaterialData2=65536u,triangleCount=1};
   result["declaredChallengeFieldsVerifiedAfterBinaryRead"]=true;
   result["authoredInputBase64"]=new{ymap=Convert.ToBase64String(map),ytyp=Convert.ToBase64String(types),ybn=Convert.ToBase64String(collision)};
   return Json.Serialize(result);
  }
  public static string SecurityControls(){
   string[] cases={"<!DOCTYPE root [<!ENTITY a 'expanded'>]><root>&a;</root>","<!DOCTYPE root SYSTEM 'file:///unopened-original-fixture.dtd'><root/>",
    new string(' ',MaximumXmlCharacters+1),"<root>"+Repeat("<n>",65)+Repeat("</n>",65)+"</root>","<root>"+Repeat("<n/>",MaximumXmlNodes)+"</root>"};
   int rejected=0;foreach(string item in cases){try{SecureDocument(item);}catch(XmlException){rejected++;}catch(InvalidOperationException){rejected++;}}
   Need(rejected==cases.Length,"DTD/external-DTD/size/depth/node rejection controls required");
   var valid=SecureDocument("<root><value>original &amp; bounded</value></root>");Need(valid.DocumentElement.InnerText=="original & bounded","Ordinary XML must remain supported");
   return Json.Serialize(new{passed=true,negativeControlsPassed=rejected,ordinaryXmlAccepted=true,externalResourceOpened=false,originalStringsOnly=true});
  }
  static string Repeat(string text,int count){var b=new StringBuilder();for(int i=0;i<count;i++)b.Append(text);return b.ToString();}
 }
}
