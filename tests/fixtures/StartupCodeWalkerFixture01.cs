// Entirely original public-API fixture. This is not CodeWalker/vendor code.
// It substitutes only protected initialization/archive/metadata decoding.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
namespace CodeWalker.GameFiles {
 public static class OriginalFixture01 {
  public const string Marker="RichAudioOriginalStartupFixture01";
  public static string Root;
  public static void Check(string root){root=Path.GetFullPath(root);if(root.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)<0||!File.Exists(Path.Combine(root,"fixture-original.marker"))||File.ReadAllText(Path.Combine(root,"fixture-original.marker"))!=Marker)throw new InvalidOperationException("Original private fixture marker required");Root=root;}
  public static uint NameHash(string s){uint h=0;unchecked{foreach(byte b in Encoding.UTF8.GetBytes(s.ToLowerInvariant())){h+=b;h+=h<<10;h^=h>>6;}h+=h<<3;h^=h>>11;h+=h<<15;}return h;}
 }
 public static class GTA5Keys {
  public static void LoadFromPath(string root,bool enhanced,string unused){OriginalFixture01.Check(root);if(!enhanced)throw new InvalidOperationException("Fixture Enhanced selector required");File.AppendAllText(Path.Combine(root,"initializer-events.log"),"original-API-initializer\n");if(File.Exists(Path.Combine(root,"controlled-initializer-failure.marker")))throw new InvalidOperationException("Original controlled initializer failure");}
 }
 public struct MetaHash { public uint Hash; public MetaHash(uint h){Hash=h;} public string Hex{get{return "0x"+Hash.ToString("x8");}} }
 public sealed class RpfEntry { public string Name,Path;public RpfFile File;public byte[] Data; }
 public sealed class RpfFile {
  public string Path,Name,LastError;public RpfEntry[] AllEntries;public RpfFile[] Children=new RpfFile[0];
  public RpfFile(string path,string relative){Path=path;Name=System.IO.Path.GetFileName(path);LastError=null;var rows=new List<RpfEntry>();string p=relative.Replace('\\','/');if(p=="update/update.rpf"){
   rows.Add(Entry(p+"/common/data/dlclist.xml","<SMandatoryPacksData><Paths><Item>dlcpacks:/original/</Item></Paths></SMandatoryPacksData>"));
   rows.Add(Entry(p+"/original_wall.ybn","original collision source bytes"));
   rows.Add(Entry(p+"/cache.dat","original bounds metadata"));
  }AllEntries=rows.ToArray();}
  RpfEntry Entry(string path,string data){return new RpfEntry{Name=System.IO.Path.GetFileName(path),Path=path,File=this,Data=Encoding.UTF8.GetBytes(data)};}
  public void ScanStructure(object unused,Action<string> error){if(OriginalFixture01.Root==null)throw new InvalidOperationException("Fixture initializer required");if(!File.Exists(Path))throw new FileNotFoundException("Original inert archive missing");}
  public byte[] ExtractFile(RpfEntry entry){return entry.Data;}
 }
 public sealed class Vector {public double X,Y,Z;public Vector(double x,double y,double z){X=x;Y=y;Z=z;}}
 public sealed class BoundsItem {public MetaHash Name;public Vector Min=new Vector(-4.2,-.2,-.2),Max=new Vector(4.2,.2,4.2);public int Layer=0;}
 public sealed class Manifest {public object[] Interiors=new object[0],MapDataGroups=new object[0];public RpfEntry RpfFileEntry;}
 public sealed class CacheFile {public BoundsItem[] AllBoundsStoreItems;public RpfEntry FileEntry;}
 public class MloArchetype {}
 public sealed class GameFileCache {
  public bool LoadPeds,LoadVehicles,LoadAudio,LoadArchetypes,EnableDlc,DoFullStringIndex,BuildExtendedJenkIndex,IsInited;
  public string SelectedDlc="original";public List<string> DlcNameList=new List<string>{"original"};
  public RpfFile[] AllRpfs;public Manifest[] AllManifests;public CacheFile[] AllCacheFiles;
  public Dictionary<uint,RpfEntry> YbnDict=new Dictionary<uint,RpfEntry>(),YmapDict=new Dictionary<uint,RpfEntry>();
  public Dictionary<uint,object> YtypDict=new Dictionary<uint,object>();
  public Dictionary<MetaHash,object> VehiclesInitDict=new Dictionary<MetaHash,object>(),AudioGameDict=new Dictionary<MetaHash,object>(),AudioSoundsDict=new Dictionary<MetaHash,object>();
  public Dictionary<string,RpfFile> ActiveMapRpfFiles=new Dictionary<string,RpfFile>();public Dictionary<string,string> DlcPatchedPaths=new Dictionary<string,string>();
  string root;
  public GameFileCache(long bytes,double seconds,string game,bool enhanced,string empty,bool mods,string unused){OriginalFixture01.Check(game);root=game;if(!enhanced||mods)throw new InvalidOperationException("Original fixture mode required");}
  public void Init(Action<string> status,Action<string> error){
   var archive=new RpfFile(System.IO.Path.Combine(root,"update/update.rpf"),"update/update.rpf");archive.ScanStructure(null,error);AllRpfs=new[]{archive};uint hash=OriginalFixture01.NameHash("original_wall");YbnDict.Add(hash,archive.AllEntries[1]);
   AllManifests=new[]{new Manifest{RpfFileEntry=archive.AllEntries[2]}};AllCacheFiles=new[]{new CacheFile{FileEntry=archive.AllEntries[2],AllBoundsStoreItems=new[]{new BoundsItem{Name=new MetaHash(hash)}}}};IsInited=true;if(status!=null)status("Original authored metadata initialized");
  }
  public bool SetDlcLevel(string level,bool enable){SelectedDlc=level;EnableDlc=enable;return true;}
 }
}
