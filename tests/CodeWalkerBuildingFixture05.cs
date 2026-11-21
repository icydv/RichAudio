// Original closed exterior fixture through actual public CodeWalker APIs.
// No file, archive, key, discovery, GUI, endpoint or arbitrary-input interface.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using SharpDX;

namespace RichAudio.Tests {
 public static class CodeWalkerBuildingFixture05 {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4194304,RecursionLimit=80};
  static readonly object Gate=new object();
  static void Need(bool ok,string reason){if(!ok)throw new InvalidOperationException(reason);}
  static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static double[] V(Vector3 v){return new[]{(double)v.X,v.Y,v.Z};}
  static byte[] Map(float positionX){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapData);
   var d=new CEntityDef{archetypeName=new MetaHash(123456789),position=new Vector3(positionX,0,0),rotation=new Vector4(0,0,0,1),scaleXY=1,scaleZ=1,parentIndex=-1,lodDist=100};
   var item=b.AddItemPtr(MetaName.CEntityDef,d);
   var data=new CMapData{name=new MetaHash(11111111),streamingExtentsMin=new Vector3(positionX-8,-8,-2),streamingExtentsMax=new Vector3(positionX+8,8,8),entitiesExtentsMin=new Vector3(positionX-8,-8,-2),entitiesExtentsMax=new Vector3(positionX+8,8,8),
    entities=b.AddPointerArray(new[]{item}),block=new CBlockDesc{name=b.AddStringPtr("original-world05-closed-exterior"),exportedBy=b.AddStringPtr("RichAudio-original-fixture"),time=b.AddStringPtr("01 January 2000 00:00")}};
   b.AddStructureInfo(MetaName.CMapData);b.AddStructureInfo(MetaName.CEntityDef);b.AddStructureInfo(MetaName.CBlockDesc);b.AddEnumInfo(MetaName.rage__eLodType);b.AddEnumInfo(MetaName.rage__ePriorityLevel);b.AddItem(MetaName.CMapData,data);
   return ResourceBuilder.Build(b.GetMeta(),2,true,true);
  }
  static byte[] Types(){
   var b=new MetaBuilder();b.EnsureBlock(MetaName.CMapTypes);
   var d=new CBaseArchetypeDef{name=new MetaHash(123456789),physicsDictionary=new MetaHash(987654321),assetName=new MetaHash(33333333),bbMin=new Vector3(-2,-2,0),bbMax=new Vector3(2,2,4),bsCentre=new Vector3(0,0,2),bsRadius=(float)Math.Sqrt(12),lodDist=100};
   var item=b.AddItemPtr(MetaName.CBaseArchetypeDef,d);var data=new CMapTypes{name=new MetaHash(22222222),archetypes=b.AddPointerArray(new[]{item})};
   b.AddStructureInfo(MetaName.CMapTypes);b.AddStructureInfo(MetaName.CBaseArchetypeDef);b.AddEnumInfo(MetaName.rage__fwArchetypeDef__eAssetType);b.AddItem(MetaName.CMapTypes,data);
   return ResourceBuilder.Build(b.GetMeta(),2,true,true);
  }
  static Vector3[] RelativeVertices(float halfWidth){return new[]{new Vector3(-halfWidth,-2,-2),new Vector3(halfWidth,-2,-2),new Vector3(halfWidth,2,-2),new Vector3(-halfWidth,2,-2),new Vector3(-halfWidth,-2,2),new Vector3(halfWidth,-2,2),new Vector3(halfWidth,2,2),new Vector3(-halfWidth,2,2)};}
  static readonly int[][] Triangles={new[]{0,1,5},new[]{0,5,4},new[]{1,2,6},new[]{1,6,5},new[]{2,3,7},new[]{2,7,6},new[]{3,0,4},new[]{3,4,7},new[]{0,2,1},new[]{0,3,2},new[]{4,5,6},new[]{4,6,7}};
  static byte[] Collision(float halfWidth){
   var vv=RelativeVertices(halfWidth);var g=new BoundGeometry{Type=BoundsType.Geometry,Vertices=vv,CenterGeom=new Vector3(0,0,2),Transform=Matrix.Identity,
    BoxMin=new Vector3(-halfWidth,-2,0),BoxMax=new Vector3(halfWidth,2,4),BoxCenter=new Vector3(0,0,2),SphereCenter=new Vector3(0,0,2),SphereRadius=(float)Math.Sqrt(halfWidth*halfWidth+8),
    Materials=new[]{new BoundMaterial_s{Data1=7,Data2=0}},PolygonMaterialIndices=new byte[12]};
   var pp=new List<BoundPolygon>();foreach(var indices in Triangles)pp.Add(new BoundPolygonTriangle{triIndex1=(ushort)indices[0],triIndex2=(ushort)indices[1],triIndex3=(ushort)indices[2],triArea=Vector3.Cross(vv[indices[1]]-vv[indices[0]],vv[indices[2]]-vv[indices[0]]).Length()/2,Owner=g,edgeIndex1=65535,edgeIndex2=65535,edgeIndex3=65535});g.Polygons=pp.ToArray();g.CalculateQuantum();
   return ResourceBuilder.Build(g,43,true,true);
  }
  public static string Run(string parserSHA256,float positionX=0,float halfWidth=2){
   Need(System.Text.RegularExpressions.Regex.IsMatch(parserSHA256??"","^[a-f0-9]{64}$"),"Exact explicit parser identity required");
   Need(positionX==0||positionX==40,"Only the two explicit original authored building positions are supported");
   Need(halfWidth==2||halfWidth==3,"Only the original base/collision-override widths are supported");
   lock(Gate){bool initial=RpfManager.IsGen9;try{RpfManager.IsGen9=true;
    byte[] mapBytes=Map(positionX),typeBytes=Types(),collisionBytes=Collision(halfWidth);
    Need(Hash(mapBytes)==Hash(Map(positionX))&&Hash(typeBytes)==Hash(Types())&&Hash(collisionBytes)==Hash(Collision(halfWidth)),"Original binary resources must be deterministic");
    var map=new YmapFile();map.Load(mapBytes);var types=new YtypFile();types.Load(typeBytes);var collision=new YbnFile();collision.Load(collisionBytes);
    Need(map.AllEntities.Length==1&&types.AllArchetypes.Length==1,"One ordinary entity/base archetype required");var entity=map.AllEntities[0];Need(!entity.IsMlo&&entity.MloParent==null,"Original exterior must be ordinary CEntityDef");
    Need(entity.CEntityDef.archetypeName.Hash==123456789&&types.AllArchetypes[0].BaseArchetypeDef.name.Hash==123456789&&types.AllArchetypes[0].BaseArchetypeDef.physicsDictionary.Hash==987654321,"Actual binary association readback required");
    var g=collision.Bounds as BoundGeometry;Need(g!=null&&g.Vertices.Length==8&&g.Polygons.Length==12&&g.Materials.Length==1,"Actual binary closed-box mesh required");
    Need((g.Materials[0].Data1&255u)==7&&g.Materials[0].Data2==0,"Original native material7 required");
    var worldTransform=Matrix.Transformation(Vector3.Zero,Quaternion.Identity,entity.Scale,Vector3.Zero,entity.Orientation,entity.Position);
    var controls=new List<object>();var points=new Vector3[8];
    var authoredVertices=RelativeVertices(halfWidth);for(int i=0;i<8;i++){var root=g.GetVertexPos(i);points[i]=Vector3.TransformCoordinate(root,worldTransform);var expected=authoredVertices[i]+new Vector3(positionX,0,2);Need(Vector3.Distance(points[i],expected)<0.0002f,"Original declared box vertex survives actual binary readback");controls.Add(new{nodeId="n0",vertexIndex=i,storedRelativeVertex=V(g.Vertices[i]),geometryCenter=V(g.CenterGeom),resourceRoot=V(root),world=V(points[i]),tolerance=0.0002,oracle="actual-CodeWalker-binary-readback-GetVertexPos-and-YmapEntityDef"});}
    var edges=new Dictionary<string,int>();double volume=0;
    for(int i=0;i<12;i++){var p=g.Polygons[i] as BoundPolygonTriangle;Need(p!=null&&g.PolygonMaterialIndices[i]==0,"Original triangle/material slot required");var ids=p.VertexIndices;Need(ids.Length==3,"Triangle vertex count");for(int k=0;k<3;k++){Need(ids[k]==Triangles[i][k],"Original triangle index readback");int a=ids[k],b=ids[(k+1)%3];string key=Math.Min(a,b)+":"+Math.Max(a,b);edges[key]=edges.ContainsKey(key)?edges[key]+1:1;}
     var a0=points[ids[0]];var a1=points[ids[1]];var a2=points[ids[2]];var normal=Vector3.Cross(a1-a0,a2-a0);Need(Vector3.Dot(normal,(a0+a1+a2)/3-new Vector3(positionX,0,2))>0,"Every original face must point outward");volume+=Vector3.Dot(a0,Vector3.Cross(a1,a2))/6.0;
    }
    double expectedVolume=32*halfWidth;Need(edges.Count==18,"Closed box topological edge count");foreach(var edge in edges)Need(edge.Value==2,"Every original edge must have two adjacent triangles");Need(Math.Abs(volume-expectedVolume)<0.001,"Closed box signed volume");
    double determinant=Vector3.Dot(points[1]-points[0],Vector3.Cross(points[3]-points[0],points[4]-points[0]));Need(Math.Abs(determinant-expectedVolume)<0.001,"Selected controls must be noncoplanar");
    // Reuse the actual pinned exporter/parser/builder oracle; no XML string is
    // authored by this fixture generator and no carrier impersonates a resource.
    var roundtrip=Json.Deserialize<Dictionary<string,object>>(CodeWalkerXml042.RunGroup(mapBytes,typeBytes,collisionBytes,true,parserSHA256));
    return Json.Serialize(new{schema=1,kind="RichAudioOriginalCodeWalkerBuildingFixture05",passed=true,sourceAuthority="original-authored-CodeWalker-binary-fixture",parserSourceCommit="485d56bec00262ed7fa472261cce7bbc6202b96e",parserSHA256,authoredParameters=new{positionX,halfWidth},fixturePurpose=halfWidth==3?"original-collision-only-override-with-unchanged-archetype-metadata":"original-closed-exterior-box",
     binaryResources=new[]{new{kind="ymap",bytes=mapBytes.Length,sha256=Hash(mapBytes),base64=Convert.ToBase64String(mapBytes)},new{kind="ytyp",bytes=typeBytes.Length,sha256=Hash(typeBytes),base64=Convert.ToBase64String(typeBytes)},new{kind="ybn",bytes=collisionBytes.Length,sha256=Hash(collisionBytes),base64=Convert.ToBase64String(collisionBytes)}},
     roundtrip,entity=new{index=0,guid=entity.CEntityDef.guid,archetypeHash=123456789,physicsDictionary=987654321,position=V(entity.Position),orientation=new[]{(double)entity.Orientation.X,entity.Orientation.Y,entity.Orientation.Z,entity.Orientation.W},scale=V(entity.Scale)},
     geometry=new{vertices=8,triangles=12,minimum=new[]{-halfWidth,-2f,0f},maximum=new[]{halfWidth,2f,4f},center=new[]{0,0,2},worldMinimum=new[]{positionX-halfWidth,-2f,0f},worldMaximum=new[]{positionX+halfWidth,2f,4f},nativeMaterialId=7,nativeMaterialAcousticResponseMeasured=false,closedManifold=true,uniqueUndirectedEdges=18,signedVolume=volume,expectedVolume},controls,nonCoplanarControlIndices=new[]{0,1,3,4},nonCoplanarDeterminant=determinant,
     gameFilesRead=false,keysRead=false,toolUiLaunched=false,installedEnhancedVerified=false,nativeContainmentEstablished=false,physicalMetreCalibrationVerified=false});
   }finally{RpfManager.IsGen9=initial;}}
  }
 }
}
