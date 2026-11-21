// ORIGINAL XML fixtures only. An independent pinned public CodeWalker assembly
// parses the supplied XML and rebuilds resource objects for the existing adapter.
// No archive, key, installation, executable, audio or file-discovery API.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Xml;
using CodeWalker.GameFiles;
using RichAudio.World;
using SharpDX;
namespace RichAudio.Tests {
 public static class CodeWalkerXmlReference05 {
  static XmlDocument Document(byte[] xml) {
   if(xml==null||xml.Length==0||xml.Length>8388608)throw new ArgumentException("Original XML byte cap");
   var settings=new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=8388608,MaxCharactersFromEntities=0};
   var doc=new XmlDocument{XmlResolver=null};using(var stream=new MemoryStream(xml))using(var reader=XmlReader.Create(stream,settings))doc.Load(reader);return doc;
  }
  public static string Normalize(byte[] xml,string kind,string parser) {
   var doc=Document(xml);
   bool previous=RpfManager.IsGen9;try {
    RpfManager.IsGen9=true;
    byte[] resource=kind=="ybn"?ResourceBuilder.Build(XmlYbn.GetYbn(doc).Bounds,43,true,true):ResourceBuilder.Build(XmlMeta.GetMeta(doc),2,true,true);
    using(var sha=System.Security.Cryptography.SHA256.Create()){
     string digest=BitConverter.ToString(sha.ComputeHash(resource)).Replace("-","").ToLowerInvariant();
     return CodeWalkerResourceBoundary03.Normalize(resource,kind,digest,"original-authored-fixture",parser,true);
    }
   } finally {RpfManager.IsGen9=previous;}
  }
  public static string NameHashes() {
   var rows=new List<object>();foreach(string text in new[]{"Original_MixedCase05","original_mixedcase05","hash_075BCD15","hash_1",""})rows.Add(new{text,hash=XmlMeta.GetHash(text).Hash});
   return new JavaScriptSerializer().Serialize(rows);
  }
  static void Vertices(Bounds bound,Matrix entity,List<object> samples,ref int index,int depth) {
   if(bound==null||depth>32||index>=1024)throw new ArgumentException("Original bounded collision tree required");int ni=index++;
   var geometry=bound as BoundGeometry;if(geometry!=null&&geometry.Vertices!=null)for(int vi=0;vi<geometry.Vertices.Length;vi++){
    if(samples.Count>=65536)throw new ArgumentException("Original vertex sample cap");
    var point=geometry.GetVertexPos(vi);for(var parent=geometry.Parent;parent!=null;parent=parent.Parent)point=Vector3.TransformCoordinate(point,parent.Transform);
    var world=Vector3.TransformCoordinate(point,entity);samples.Add(new{node=ni,vertex=vi,positionInWorld=new[]{(double)world.X,world.Y,world.Z}});
   }
   var composite=bound as BoundComposite;if(composite!=null&&composite.Children!=null&&composite.Children.data_items!=null)foreach(var child in composite.Children.data_items)Vertices(child,entity,samples,ref index,depth+1);
  }
  public static string World(byte[] mapXml,byte[] collisionXml,int entityIndex) {
   bool previous=RpfManager.IsGen9;try {
    RpfManager.IsGen9=true;var map=new YmapFile();map.Load(ResourceBuilder.Build(XmlMeta.GetMeta(Document(mapXml)),2,true,true));
    if(map.AllEntities==null||map.AllEntities.Length==0)return "{\"entityMissing\":true,\"samples\":[]}";
    if(entityIndex<0||entityIndex>=map.AllEntities.Length)throw new ArgumentException("Original selected entity required");
    var entity=map.AllEntities[entityIndex];var matrix=Matrix.Transformation(Vector3.Zero,Quaternion.Identity,entity.Scale,Vector3.Zero,entity.Orientation,entity.Position);
    var collision=new YbnFile();collision.Load(ResourceBuilder.Build(XmlYbn.GetYbn(Document(collisionXml)).Bounds,43,true,true));
    var samples=new List<object>();int index=0;Vertices(collision.Bounds,matrix,samples,ref index,0);
    return new JavaScriptSerializer{MaxJsonLength=16777216}.Serialize(new{entityMissing=false,entityIndex,entityMatrix=Array.ConvertAll(matrix.ToArray(),x=>(double)x),samples,method="Actual YmapEntityDef Orientation/Scale/Position + BoundGeometry.GetVertexPos + ancestor Transform + SharpDX.TransformCoordinate"});
   }finally{RpfManager.IsGen9=previous;}
  }
 }
}
