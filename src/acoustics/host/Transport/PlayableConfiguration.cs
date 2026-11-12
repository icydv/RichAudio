using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Security.Cryptography;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;
namespace RichAudio.Beacon.Transport {
 [DataContract]public sealed class PlayableBinding {[DataMember(Name="file",IsRequired=true)]public string File;[DataMember(Name="sha256",IsRequired=true)]public string Sha256;}
 [DataContract]public sealed class PlayableModel {[DataMember(Name="model",IsRequired=true)]public uint Model;[DataMember(Name="context",IsRequired=true)]public string Context;}
 [DataContract]public sealed class PlayableConfiguration {
  [DataMember(Name="schema",IsRequired=true)]public int Schema;
  [DataMember(Name="gameExecutable",IsRequired=true)]public string GameExecutable;
  [DataMember(Name="gameSha256",IsRequired=true)]public string GameSha256;
  [DataMember(Name="gameVersion",IsRequired=true)]public string GameVersion;
  [DataMember(Name="rphVersion",EmitDefaultValue=false)]public string RphVersion;
  // Additive schema-1 adapter binding. Omitted fields retain the existing RPH
  // contract; an SHVDNE manifest cannot silently fall through to that path.
  [DataMember(Name="integrationFramework",EmitDefaultValue=false)]public string IntegrationFramework;
  [DataMember(Name="integrationVersion",EmitDefaultValue=false)]public string IntegrationVersion;
  [DataMember(Name="integrationAssemblySha256",EmitDefaultValue=false)]public string IntegrationAssemblySha256;
  [DataMember(Name="transportValidationOnly",EmitDefaultValue=false)]public bool TransportValidationOnly;
  public bool Shvdne {get{return IntegrationFramework=="shvdne";}}
  public const string ShvdneApi3Sha256="1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48";
  [DataMember(Name="demoProfile",EmitDefaultValue=false)]public string DemoProfile;
  [DataMember(Name="latencyProfile",EmitDefaultValue=false)]public string LatencyProfile;
  [DataMember(Name="continuityPolicy",EmitDefaultValue=false)]public string ContinuityPolicy;
  [DataMember(Name="vehicleSourcePolicy",EmitDefaultValue=false)]public string VehicleSourcePolicy;
  public bool CatalogueFleet {get{return VehicleSourcePolicy=="catalogue-fleet-01";}}
  // Match the fleet wire ceiling while keeping manifest validation usable
  // by the standalone configuration and credit-window tooling.
  public int MaximumVehicleObservations {get{return CatalogueFleet?32:8;}}
  [DataMember(Name="outputSink",EmitDefaultValue=false)]public string OutputSink;
  internal bool DiscardEnvironmentalOutput {get{return OutputSink=="environment-observation";}}
  [DataMember(Name="bindings",IsRequired=true)]public PlayableBinding[] Bindings;
  [DataMember(Name="eligible",IsRequired=true)]public PlayableModel[] Eligible;
  [DataMember(Name="playerManifest",IsRequired=true)]public string PlayerManifest;
  [DataMember(Name="npcManifest",IsRequired=true)]public string NpcManifest;
  [DataMember(Name="atlas",IsRequired=true)]public string Atlas;
  [DataMember(Name="profiles",IsRequired=true)]public string Profiles;
  [DataMember(Name="catalog",IsRequired=true)]public string Catalog;
  [DataMember(Name="catalogSha256",IsRequired=true)]public string CatalogSha256;
  public string Root,Manifest;
  public static void ValidateIntegration(PlayableConfiguration c){
   if(c.TransportValidationOnly&&(!c.Shvdne||c.OutputSink!=null||c.DemoProfile!=null||c.LatencyProfile!=null||c.ContinuityPolicy!=null||c.VehicleSourcePolicy!=null))throw new InvalidDataException("Isolated SHVDNE transport validation required");
   if(c.Shvdne){
    if(c.IntegrationVersion!="1.1.0.6"||c.DemoProfile!=null||c.RphVersion!=null||
     !String.Equals(c.IntegrationAssemblySha256,ShvdneApi3Sha256,StringComparison.OrdinalIgnoreCase))
     throw new InvalidDataException("Explicit SHVDNE 1.1.0.6 API assembly binding required");
   }else{
    if(c.IntegrationFramework!=null&&c.IntegrationFramework!="rph"||c.IntegrationVersion!=null||c.IntegrationAssemblySha256!=null||
     c.DemoProfile!="PLAYABLE-13"&&c.RphVersion!="1.132.1428.17748")throw new InvalidDataException("Existing RPH runtime binding required");
   }
  }
  public void ValidateRuntimeAssembly(string assembly,string expectedFramework){
   ValidateIntegration(this);
   if((expectedFramework??"rph")!=(Shvdne?"shvdne":"rph"))throw new InvalidDataException("Game adapter/package framework mismatch");
   if(Shvdne){
    NoLinks(assembly);
    if(!String.Equals(Path.GetFileName(assembly),"ScriptHookVDotNet3.dll",StringComparison.OrdinalIgnoreCase)||
     !String.Equals(Digest(assembly),IntegrationAssemblySha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("SHVDNE API3 assembly differs from bound dependency");
   }else if(DemoProfile!="PLAYABLE-13"&&FileVersionInfo.GetVersionInfo(assembly).FileVersion!=RphVersion)
    throw new InvalidDataException("reviewed game/RPH runtime binding");
  }
  internal static void ValidateStreetLatencySelection01(PlayableConfiguration c){
   if(c.OutputSink!=null&&(!c.DiscardEnvironmentalOutput||c.LatencyProfile!="street-01"||c.DemoProfile!=null))
    throw new InvalidDataException("Environmental observation sink requires the normal STREET-01 package");
   if(c.VehicleSourcePolicy!=null){
    if(!c.CatalogueFleet||c.LatencyProfile!="street-01"||c.DemoProfile!=null||c.ContinuityPolicy!="camera-source-01"||c.Eligible==null||c.Eligible.Length!=0)
     throw new InvalidDataException("Catalogue fleet requires normal STREET-01 continuity and no model allowlist");
    return;
   }
   if(c.LatencyProfile!="street-01")return;
   if(c.DemoProfile!=null||c.ContinuityPolicy!=null&&c.ContinuityPolicy!="camera-source-01"||c.Eligible==null||c.Eligible.Length<1||c.Eligible.Length>2)throw new InvalidDataException("STREET-01 latency requires a normal Bati-only package and camera-source-01 continuity");
   int player=0;var contexts=new HashSet<string>();foreach(var model in c.Eligible){if(model==null||model.Model!=0xF9300CC5||(model.Context!="player"&&model.Context!="npc")||!contexts.Add(model.Context))throw new InvalidDataException("STREET-01 Bati context binding");if(model.Context=="player")player++;}if(player!=1)throw new InvalidDataException("STREET-01 requires the exact Bati player bank");
  }
  public static string Digest(string file){using(var s=System.IO.File.OpenRead(file))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  public static string Inside(string root,string relative){if(String.IsNullOrWhiteSpace(relative)||Path.IsPathRooted(relative))throw new InvalidDataException("relative package path required");string p=Path.GetFullPath(Path.Combine(root,relative));if(!p.StartsWith(Path.GetFullPath(root)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("package path escaped");NoLinks(p);return p;}
  public static void NoLinks(string p){for(string s=p;!String.IsNullOrEmpty(s);s=Path.GetDirectoryName(s))if((Directory.Exists(s)||System.IO.File.Exists(s))&&(System.IO.File.GetAttributes(s)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("linked package path");}
  public static PlayableConfiguration Load(string file,bool verify=true){
   file=Path.GetFullPath(file);NoLinks(file);if(new FileInfo(file).Length>131072)throw new InvalidDataException("package manifest size");PlayableConfiguration c;
   using(var s=System.IO.File.OpenRead(file))c=(PlayableConfiguration)new DataContractJsonSerializer(typeof(PlayableConfiguration)).ReadObject(s);
   c.Root=Path.GetDirectoryName(file);c.Manifest=file;
   if(c.LatencyProfile!=null&&c.LatencyProfile!="baseline"&&c.LatencyProfile!="low-latency-01"&&c.LatencyProfile!="street-01")throw new InvalidDataException("Unknown immutable gameplay latency profile");
   if(c.ContinuityPolicy!=null&&c.ContinuityPolicy!="baseline"&&c.ContinuityPolicy!="camera-source-01")throw new InvalidDataException("Unknown immutable gameplay continuity policy");
   ValidateIntegration(c);
   if(c.TransportValidationOnly&&(c.Eligible==null||c.Eligible.Length!=0||c.Bindings==null||c.Bindings.Length!=1||c.Bindings[0].File!="runtime/RichAudio.Acoustics.Host.exe"))throw new InvalidDataException("Transport validation binds only its host, with no synthesis eligibility");
   if(c.Schema!=1||c.GameVersion!="1.0.1158.16"||c.DemoProfile!=null&&c.DemoProfile!="PLAYABLE-13"||c.Bindings==null||c.Bindings.Length<(c.TransportValidationOnly?1:8)||c.Bindings.Length>512||c.Eligible==null||(!c.TransportValidationOnly&&!c.CatalogueFleet&&c.Eligible.Length<1)||c.Eligible.Length>64)throw new InvalidDataException("supported playable manifest required");
   if(c.DemoProfile=="PLAYABLE-13"&&(c.Eligible.Length!=1||c.Eligible[0].Model!=0xF9300CC5||c.Eligible[0].Context!="player"))throw new InvalidDataException("Bati-player-only demonstration package required");
   if(c.LatencyProfile=="low-latency-01"&&c.DemoProfile!="PLAYABLE-13")throw new InvalidDataException("LOW-LATENCY-01 is limited to the Bati-player demonstration package");
   ValidateStreetLatencySelection01(c);
   var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var b in c.Bindings){string p=Inside(c.Root,b.File);if(!names.Add(b.File)||b.Sha256==null||b.Sha256.Length!=64||verify&&!String.Equals(Digest(p),b.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("immutable playable payload differs");}
   foreach(string p in c.TransportValidationOnly?new[]{"runtime/RichAudio.Acoustics.Host.exe"}:new[]{"runtime/node.exe","runtime/RichAudio.Acoustics.Host.exe","tools/Run-Gameplay.mjs",c.PlayerManifest,c.NpcManifest,c.Atlas,c.Profiles,c.Catalog})if(!names.Contains(p))throw new InvalidDataException("required bound package file missing");
   var models=new HashSet<string>();foreach(var e in c.Eligible)if((e.Context!="npc"&&e.Context!="player")||!models.Add(e.Model+":"+e.Context))throw new InvalidDataException("eligible model context");
   if(!Path.IsPathRooted(c.GameExecutable)||!String.Equals(Path.GetFileName(c.GameExecutable),"GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(c.GameExecutable).FileVersion!=c.GameVersion||!String.Equals(Digest(c.GameExecutable),c.GameSha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("installed game differs from prepared sources");
   return c;
  }
  public bool Allows(uint model,string context){
   if(TransportValidationOnly)return model!=0&&(context=="player"||context=="npc");
   if(CatalogueFleet)return model!=0&&(context=="player"||context=="npc");
   foreach(var e in Eligible)if(e.Model==model&&e.Context==context)return true;return false;
  }
 }
}
