#if STREET_TRACKED_DIAGNOSTIC_01
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Reflection;using System.Security.Cryptography;using System.Threading;using System.Web.Script.Serialization;using Rage;using Rage.Native;
#if !STREET_TRACKED_FIXTURE_01
[assembly:Rage.Attributes.Plugin("RichAudio STREET tracked telemetry diagnostic",Author="RichAudio",Description="Explicitly disabled passive diagnostic; no audio host or sound mutation.",EntryPoint="RichAudio.StreetTracked01.DiagnosticEntry01.Main",ExitPoint="RichAudio.StreetTracked01.DiagnosticEntry01.OnUnload",PrefersSingleInstance=true)]
#endif
namespace RichAudio.StreetTracked01 {
 internal sealed class RetainedRphPeer01 {
  readonly Vehicle vehicle;readonly Peer01 original;
  internal RetainedRphPeer01(){
   var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid())throw new InvalidDataException("diagnostic-player-unavailable");
   vehicle=player.CurrentVehicle;if(vehicle==null||!vehicle.IsValid()||vehicle.IsDead||vehicle.Model.Hash!=0xF9300CC5)throw new InvalidDataException("diagnostic-current-Bati-required");
   original=Capture();if(!original.RiderAttached)throw new InvalidDataException("diagnostic-current-driver-required-at-acquisition");
  }
  static bool Same(Entity a,Entity b){return a!=null&&b!=null&&a.IsValid()&&b.IsValid()&&a.Handle.Value==b.Handle.Value&&a.Handle.Index==b.Handle.Index&&a.Handle.Counter==b.Handle.Counter&&a.MemoryAddress==b.MemoryAddress;}
  Peer01 Identity(){if(!vehicle.IsValid()||vehicle.IsDead)throw new InvalidDataException("diagnostic-retained-entity-invalid");var h=vehicle.Handle;return new Peer01{Value=h.Value,Index=h.Index,Counter=h.Counter,Address=unchecked((ulong)vehicle.MemoryAddress.ToInt64()),Model=vehicle.Model.Hash};}
  internal Peer01 Capture(){
   long before=Stopwatch.GetTimestamp();var value=Identity();if(value.Address==0||value.Model!=0xF9300CC5||original!=null&&!original.Same(value))throw new InvalidDataException("diagnostic-RPH-pool-lifetime-changed");
   value.Running=vehicle.IsEngineOn;value.RawRatio=vehicle.EngineRevolutionsRatio;
   var player=Game.LocalPlayer.Character;value.RiderAttached=player!=null&&player.IsValid()&&Same(player.CurrentVehicle,vehicle)&&Same(vehicle.Driver,player);
   if(!value.Same(Identity()))throw new InvalidDataException("diagnostic-RPH-post-getter-lifetime-changed");
   value.Before=before;value.After=Stopwatch.GetTimestamp();return value;
  }
 }
 public static class DiagnosticEntry01 {
  static volatile bool stopping;static NativeModule01 module;
  public sealed class Configuration {public bool enabled,passiveOnly,audioAllowed,nativeMutationAllowed;public string session,modulePath,moduleSHA256,gameSHA256,rphSHA256,outputDirectory;public uint maximumRecords,maximumSeconds;}
  internal static string ConfigurationPath {get{return Path.Combine(Path.GetDirectoryName(typeof(DiagnosticEntry01).Assembly.Location),"RichAudio.StreetTrackedDiagnostic01.json");}}
  static string Hash(string file){using(var f=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
  static void Need(bool yes,string why){if(!yes)throw new InvalidDataException(why);}
  static bool Story(){return !Game.IsLoading&&!Game.IsPaused&&!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS");}
  public static void Main(){
   // No module is attached, armed or read without the explicit new sidecar.
   if(!File.Exists(ConfigurationPath)){Game.Console.Print("RichAudio tracked diagnostic disabled: no explicit configuration");return;}
   string output=null;var rows=new List<object>(2400);string terminal="not-started";Configuration c=null;
   try{
    Need(new FileInfo(ConfigurationPath).Length<=8192,"diagnostic-config-size");var json=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=4};var text=File.ReadAllText(ConfigurationPath);c=json.Deserialize<Configuration>(text);
    Need(c!=null,"diagnostic-config");if(!c.enabled){Game.Console.Print("RichAudio tracked diagnostic disabled");return;}
    Need(c.passiveOnly&&!c.audioAllowed&&!c.nativeMutationAllowed&&c.maximumRecords>=1&&c.maximumRecords<=2400&&c.maximumSeconds>=1&&c.maximumSeconds<=120,"diagnostic-passive-bounds");
    Need(c.session!=null&&System.Text.RegularExpressions.Regex.IsMatch(c.session,"\\A[a-f0-9]{32}\\z"),"diagnostic-session");
    Need(Hash(Process.GetCurrentProcess().MainModule.FileName)==c.gameSHA256&&Hash(typeof(Game).Assembly.Location)==c.rphSHA256,"diagnostic-executable/API-binding");
    Need(Path.IsPathRooted(c.outputDirectory)&&!Directory.Exists(c.outputDirectory)&&!File.Exists(c.outputDirectory),"diagnostic-new-private-output");
    for(string at=Path.GetFullPath(c.outputDirectory);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))if(Directory.Exists(at)||File.Exists(at))Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"diagnostic-linked-output");
    output=c.outputDirectory;Need(Story(),"diagnostic-offline-story-required");var peer=new RetainedRphPeer01();var initial=peer.Capture();
    module=new NativeModule01(c.modulePath,c.moduleSHA256,
#if STREET_TRACKED_FIXTURE_01
     true
#else
     false
#endif
    );
    Need(!stopping,"diagnostic-unloaded-before-begin");byte[] session=Hex(c.session);ulong a=BitConverter.ToUInt64(session,0),b=BitConverter.ToUInt64(session,8);var comparer=new Comparer01(initial,a,b,Stopwatch.Frequency);module.Begin(a,b,initial,c.maximumRecords,c.maximumSeconds);
    long start=Stopwatch.GetTimestamp();terminal="bounded-window-complete";
    while(!stopping&&rows.Count<c.maximumRecords&&Stopwatch.GetTimestamp()-start<=Stopwatch.Frequency*c.maximumSeconds){
     Need(Story(),"diagnostic-story-left");var before=peer.Capture();Record01 record;uint code=module.Read(out record);var after=peer.Capture();
     if(code==0){try{rows.Add(comparer.Compare(before,after,record,Stopwatch.GetTimestamp()));}catch(Exception error){rows.Add(new{comparisonAccepted=false,reason=error.Message,rawNative=NativeEvidence(record),rawPeerBefore=PeerEvidence(before),rawPeerAfter=PeerEvidence(after)});terminal="diagnostic-comparison-rejected";break;}}
     else Need(code==1||code==2,"diagnostic-read-error");
     if(record.Phase==4){terminal="diagnostic-native-retired-"+record.Reason;break;}GameFiber.Sleep(10);
    }
    if(stopping)terminal="diagnostic-unload-requested";
   }catch(ThreadAbortException){terminal="diagnostic-thread-aborted";throw;}
   catch(Exception error){terminal=error is InvalidDataException?error.Message:"diagnostic-failed-"+error.GetType().Name;}
   finally{
    var m=module;module=null;if(m!=null)m.Stop();
    // A new background writer owns the immutable bounded diagnostic value.
    // It cannot start playback, refresh observations, or make native calls.
    if(output!=null){var values=rows.ToArray();string folder=output,session=c.session,ending=terminal;
     ThreadPool.QueueUserWorkItem(delegate{try{var closure=m==null?null:m.ObserveClosureAndRelease(1000);var result=new{schema=1,kind="RichAudioTrackedShvPassiveDiagnostic01",session,terminal=ending,rows=values,closure,audioStarted=false,nativeSoundsMutated=false,acceptedForNormalTelemetry=false};Directory.CreateDirectory(folder);string serialized=new JavaScriptSerializer{MaxJsonLength=4*1024*1024,RecursionLimit=20}.Serialize(result);File.WriteAllText(Path.Combine(folder,"diagnostic.json"),serialized);}catch(Exception){}});}
   }
  }
  static object PeerEvidence(Peer01 p){return new{p.Before,p.After,p.Value,p.Index,p.Counter,p.Address,p.Model,p.Running,p.RiderAttached,rawRatio=p.RawRatio.ToString("R",System.Globalization.CultureInfo.InvariantCulture)};}
  static object NativeEvidence(Record01 r){return new{r.Size,r.Version,r.Session0,r.Session1,r.Sequence,r.TargetBefore,r.TargetAfter,r.ReadNow,r.RawBits,r.Status,r.Reason,r.Phase,pre=IdentityEvidence(r.Pre),post=IdentityEvidence(r.Post)};}
  static object IdentityEvidence(Identity01 i){return new{i.Before,i.After,i.Address,i.Handle,i.Driver,i.Model,i.Running};}
  static byte[] Hex(string value){var bytes=new byte[16];for(int i=0;i<16;i++)bytes[i]=Convert.ToByte(value.Substring(i*2,2),16);return bytes;}
  public static void OnUnload(){stopping=true;var m=module;if(m!=null)m.Stop();}
 }
}
#endif
