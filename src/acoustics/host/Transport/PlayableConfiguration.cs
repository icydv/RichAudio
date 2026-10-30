using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Security.Cryptography;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;
namespace RichAudio.Beacon.Transport {
 [DataContract]public sealed class PlayableBinding {[DataMember(Name="file",IsRequired=true)]public string File;[DataMember(Name="sha256",IsRequired=true)]public string Sha256;}
 [DataContract]public sealed class PlayableModel {[DataMember(Name="model",IsRequired=true)]public uint Model;[DataMember(Name="context",IsRequired=true)]public string Context;}
 [DataContract]public sealed class PlayableConfiguration {
  [DataMember(Name="schema",IsRequired=true)]public int Schema;
  [DataMember(Name="gameExecutable",IsRequired=true)]public string GameExecutable;
  [DataMember(Name="gameSha256",IsRequired=true)]public string GameSha256;
  [DataMember(Name="gameVersion",IsRequired=true)]public string GameVersion;
  [DataMember(Name="rphVersion",IsRequired=true)]public string RphVersion;
  [DataMember(Name="bindings",IsRequired=true)]public PlayableBinding[] Bindings;
  [DataMember(Name="eligible",IsRequired=true)]public PlayableModel[] Eligible;
  [DataMember(Name="playerManifest",IsRequired=true)]public string PlayerManifest;
  [DataMember(Name="npcManifest",IsRequired=true)]public string NpcManifest;
  [DataMember(Name="atlas",IsRequired=true)]public string Atlas;
  [DataMember(Name="profiles",IsRequired=true)]public string Profiles;
  [DataMember(Name="catalog",IsRequired=true)]public string Catalog;
  [DataMember(Name="catalogSha256",IsRequired=true)]public string CatalogSha256;
  public string Root,Manifest;
  public static string Digest(string file){using(var s=System.IO.File.OpenRead(file))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  public static string Inside(string root,string relative){if(String.IsNullOrWhiteSpace(relative)||Path.IsPathRooted(relative))throw new InvalidDataException("relative package path required");string p=Path.GetFullPath(Path.Combine(root,relative));if(!p.StartsWith(Path.GetFullPath(root)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("package path escaped");NoLinks(p);return p;}
  public static void NoLinks(string p){for(string s=p;!String.IsNullOrEmpty(s);s=Path.GetDirectoryName(s))if((Directory.Exists(s)||System.IO.File.Exists(s))&&(System.IO.File.GetAttributes(s)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("linked package path");}
  public static PlayableConfiguration Load(string file,bool verify=true){
   file=Path.GetFullPath(file);NoLinks(file);if(new FileInfo(file).Length>131072)throw new InvalidDataException("package manifest size");PlayableConfiguration c;
   using(var s=System.IO.File.OpenRead(file))c=(PlayableConfiguration)new DataContractJsonSerializer(typeof(PlayableConfiguration)).ReadObject(s);
   c.Root=Path.GetDirectoryName(file);c.Manifest=file;
   if(c.Schema!=1||c.GameVersion!="1.0.1158.16"||c.RphVersion!="1.132.1428.17748"||c.Bindings==null||c.Bindings.Length<8||c.Bindings.Length>512||c.Eligible==null||c.Eligible.Length<1||c.Eligible.Length>64)throw new InvalidDataException("supported playable manifest required");
   var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var b in c.Bindings){string p=Inside(c.Root,b.File);if(!names.Add(b.File)||b.Sha256==null||b.Sha256.Length!=64||verify&&!String.Equals(Digest(p),b.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("immutable playable payload differs");}
   foreach(string p in new[]{"runtime/node.exe","runtime/RichAudio.Acoustics.Host.exe","tools/Run-Gameplay.mjs",c.PlayerManifest,c.NpcManifest,c.Atlas,c.Profiles,c.Catalog})if(!names.Contains(p))throw new InvalidDataException("required bound package file missing");
   var models=new HashSet<string>();foreach(var e in c.Eligible)if((e.Context!="npc"&&e.Context!="player")||!models.Add(e.Model+":"+e.Context))throw new InvalidDataException("eligible model context");
   if(!Path.IsPathRooted(c.GameExecutable)||!String.Equals(Path.GetFileName(c.GameExecutable),"GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(c.GameExecutable).FileVersion!=c.GameVersion||!String.Equals(Digest(c.GameExecutable),c.GameSha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("installed game differs from prepared sources");
   return c;
  }
  public bool Allows(uint model,string context){foreach(var e in Eligible)if(e.Model==model&&e.Context==context)return true;return false;}
 }
}
