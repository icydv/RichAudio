#if STREET_TRACKED_DIAGNOSTIC_01
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Reflection;using System.Security.Cryptography;using System.Threading;using System.Web.Script.Serialization;using Rage;using Rage.Native;
#if !STREET_TRACKED_FIXTURE_01
[assembly:Rage.Attributes.Plugin("RichAudio STREET tracked telemetry diagnostic",Author="RichAudio",Description="Explicitly disabled passive diagnostic; no audio host or sound mutation.",EntryPoint="RichAudio.StreetTracked01.DiagnosticEntry01.Main",ExitPoint="RichAudio.StreetTracked01.DiagnosticEntry01.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#endif
namespace RichAudio.StreetTracked01 {
 internal sealed class PeerCaptureFailure01:Exception {
  internal readonly string Stage;internal readonly Peer01 Witness;internal readonly string GetterExceptionType;
  internal PeerCaptureFailure01(string stage,Peer01 witness,Exception cause):base(cause is InvalidDataException?cause.Message:"diagnostic-RPH-getter-failed",cause){Stage=stage;Witness=witness;GetterExceptionType=cause.GetType().Name;}
 }
 internal sealed class RetainedRphPeer01 {
  readonly Vehicle vehicle;readonly Peer01 original;
  internal int CaptureAttempts,RunningGetterAttempts,RatioGetterAttempts;
  internal RetainedRphPeer01(){
   string stage="acquire-player";try{var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid())throw new InvalidDataException("diagnostic-player-unavailable");
   stage="acquire-current-vehicle";vehicle=player.CurrentVehicle;if(vehicle==null)throw new InvalidDataException("diagnostic-current-Bati-required");
   stage="acquire-vehicle-valid";if(!vehicle.IsValid())throw new InvalidDataException("diagnostic-current-Bati-required");
   stage="acquire-vehicle-dead";if(vehicle.IsDead)throw new InvalidDataException("diagnostic-current-Bati-required");
   stage="acquire-vehicle-model";if(vehicle.Model.Hash!=0xF9300CC5)throw new InvalidDataException("diagnostic-current-Bati-required");
   original=Capture();if(!original.RiderAttached)throw new InvalidDataException("diagnostic-current-driver-required-at-acquisition");
   }catch(PeerCaptureFailure01){throw;}catch(Exception error){throw new PeerCaptureFailure01(stage,new Peer01{After=Stopwatch.GetTimestamp()},error);}
  }
  static bool Same(Entity a,Entity b){return a!=null&&b!=null&&a.IsValid()&&b.IsValid()&&a.Handle.Value==b.Handle.Value&&a.Handle.Index==b.Handle.Index&&a.Handle.Counter==b.Handle.Counter&&a.MemoryAddress==b.MemoryAddress;}
  void Identity(Peer01 value,ref string stage){stage="retained-valid";if(!vehicle.IsValid())throw new InvalidDataException("diagnostic-retained-entity-invalid");stage="retained-dead";if(vehicle.IsDead)throw new InvalidDataException("diagnostic-retained-entity-invalid");
   stage="pool-handle";var h=vehicle.Handle;value.Value=h.Value;value.Index=h.Index;value.Counter=h.Counter;
   stage="entity-address";value.Address=unchecked((ulong)vehicle.MemoryAddress.ToInt64());stage="entity-model";value.Model=vehicle.Model.Hash;value.IdentityComplete=true;}
  internal Peer01 Capture(){
   CaptureAttempts++;var value=new Peer01{Before=Stopwatch.GetTimestamp()};string stage="identity";try{Identity(value,ref stage);stage="retained-pool-comparison";if(value.Address==0||value.Model!=0xF9300CC5||original!=null&&!original.Same(value))throw new InvalidDataException("diagnostic-RPH-pool-lifetime-changed");
   stage="IsEngineOn";RunningGetterAttempts++;value.Running=vehicle.IsEngineOn;value.RunningObserved=true;stage="EngineRevolutionsRatio";RatioGetterAttempts++;float raw=vehicle.EngineRevolutionsRatio;value.RawRatio=raw;value.RawRatioBits=BitConverter.ToUInt32(BitConverter.GetBytes(raw),0);value.RatioObserved=true;
   stage="rider-attachment";
   var player=Game.LocalPlayer.Character;value.RiderAttached=player!=null&&player.IsValid()&&Same(player.CurrentVehicle,vehicle)&&Same(vehicle.Driver,player);value.RiderObserved=true;
   var post=new Peer01();Identity(post,ref stage);stage="post-getter-pool-comparison";if(!value.Same(post))throw new InvalidDataException("diagnostic-RPH-post-getter-lifetime-changed");
   value.After=Stopwatch.GetTimestamp();return value;
   }catch(Exception error){value.After=Stopwatch.GetTimestamp();throw new PeerCaptureFailure01(stage,value,error);}
  }
 }
 public static class DiagnosticEntry01 {
  static volatile bool stopping;static NativeModule01 module;static int entered;
  public sealed class Configuration {public bool enabled,passiveOnly,audioAllowed,nativeMutationAllowed;public string session,modulePath,moduleSHA256,gameSHA256,rphSHA256,outputDirectory;public uint maximumRecords,maximumSeconds;}
  internal static string ConfigurationPathForGameExecutable01(string executable){return Path.Combine(Path.GetDirectoryName(Path.GetFullPath(executable)),"Plugins","RichAudio.StreetTrackedDiagnostic01.json");}
  internal static string ConfigurationPath {get{return ConfigurationPathForGameExecutable01(Process.GetCurrentProcess().MainModule.FileName);}}
  internal static volatile string WriterState01="not-queued";
  internal static volatile string MainWriterState01="not-queued";static long writerStarted01;static int writerOutcome01;
  static void WriterBudget01(){Need(Interlocked.CompareExchange(ref writerOutcome01,0,0)==0&&Stopwatch.GetTimestamp()-writerStarted01<=Stopwatch.Frequency*3,"diagnostic-writer-deadline");}
  static string Hash(string file){using(var f=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
  static void Need(bool yes,string why){if(!yes)throw new InvalidDataException(why);}
  static bool OfflineStory(){return !Game.IsLoading&&!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS");}
  static bool Story(){return OfflineStory()&&!Game.IsPaused;}
  public static void Main(){
   if(Interlocked.CompareExchange(ref entered,1,0)!=0){Game.Console.Print("RichAudio tracked diagnostic cannot restart in this process");return;}
   // No module is attached, armed or read without the explicit new sidecar.
   if(!File.Exists(ConfigurationPath)){Game.Console.Print("RichAudio tracked diagnostic disabled: no explicit configuration");return;}
   string output=null;var rows=new List<object>(2400);string terminal="not-started";Configuration c=null;object firstFailure=null,initialEvidence=null,nativeDescription=null,preArm=null,bindings=null;string stage="configuration";RetainedRphPeer01 retainedPeer=null;int readinessChecks=0,managedPolls=0;
   try{
    Need(new FileInfo(ConfigurationPath).Length<=8192,"diagnostic-config-size");var json=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=4};var text=File.ReadAllText(ConfigurationPath);c=json.Deserialize<Configuration>(text);
    Need(c!=null,"diagnostic-config");if(!c.enabled){Game.Console.Print("RichAudio tracked diagnostic disabled");return;}
    Need(c.passiveOnly&&!c.audioAllowed&&!c.nativeMutationAllowed&&c.maximumRecords>=1&&c.maximumRecords<=2400&&c.maximumSeconds>=1&&c.maximumSeconds<=120,"diagnostic-passive-bounds");
    Need(c.session!=null&&System.Text.RegularExpressions.Regex.IsMatch(c.session,"\\A[a-f0-9]{32}\\z"),"diagnostic-session");
    Need(Path.IsPathRooted(c.outputDirectory)&&!Directory.Exists(c.outputDirectory)&&!File.Exists(c.outputDirectory),"diagnostic-new-private-output");
    for(string at=Path.GetFullPath(c.outputDirectory);!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))if(Directory.Exists(at)||File.Exists(at))Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"diagnostic-linked-output");
    output=c.outputDirectory;stage="executable-binding";string executable=Process.GetCurrentProcess().MainModule.FileName,actualGameSHA256=Hash(executable);bindings=new{gamePath=executable,actualGameSHA256,expectedGameSHA256=c.gameSHA256};Need(actualGameSHA256==c.gameSHA256,"diagnostic-executable-binding");
    stage="API-binding";var api=typeof(Game).Assembly;string apiPath=api.Location,actualApiSHA256=Hash(apiPath);bindings=new{gamePath=executable,actualGameSHA256,expectedGameSHA256=c.gameSHA256,apiPath,actualApiSHA256,expectedApiSHA256=c.rphSHA256,apiAssemblyName=api.FullName,apiMvid=api.ManifestModule.ModuleVersionId.ToString("D"),apiOriginIndependentlyAuthenticated=false,modulePath=c.modulePath,expectedModuleSHA256=c.moduleSHA256};Need(actualApiSHA256==c.rphSHA256,"diagnostic-API-binding");
    stage="story";Need(OfflineStory(),"diagnostic-offline-story-required");stage="RPH-acquisition";var peer=new RetainedRphPeer01();retainedPeer=peer;var initial=peer.Capture();initialEvidence=PeerEvidence(initial);
    stage="pre-arm-console-readiness";long readinessBefore=Stopwatch.GetTimestamp();
    while(true){Need(!stopping,"diagnostic-unloaded-before-arm");Need(readinessChecks<1001,"diagnostic-pre-arm-poll-limit");Need(OfflineStory(),"diagnostic-story-left-before-arm");var readinessPeer=peer.Capture();Need(readinessPeer.RiderAttached,"diagnostic-current-driver-lost-before-arm");readinessChecks++;
     bool paused=Game.IsPaused,pauseMenu=NativeFunction.CallByName<bool>("IS_PAUSE_MENU_ACTIVE");long readinessNow=Stopwatch.GetTimestamp();preArm=new{before=readinessBefore,observedAt=readinessNow,checks=readinessChecks,maximumMs=10000,paused,pauseMenu,rawPeer=PeerEvidence(readinessPeer)};Need(readinessNow-readinessBefore<=Stopwatch.Frequency*10,"diagnostic-console-readiness-deadline");if(!paused&&!pauseMenu)break;
     GameFiber.Sleep(10);
    }
    initial=peer.Capture();
    stage="native-module-binding";
    module=new NativeModule01(c.modulePath,c.moduleSHA256,
#if STREET_TRACKED_FIXTURE_01
     true
#else
     false
#endif
    );
    var description=module.Description;nativeDescription=new{description.Size,description.Version,description.Pid,description.Fixture,description.Frequency,description.Now,description.Instance};
    stage="native-begin";Need(!stopping,"diagnostic-unloaded-before-begin");Need(Stopwatch.GetTimestamp()-readinessBefore<=Stopwatch.Frequency*10,"diagnostic-console-readiness-deadline");byte[] session=Hex(c.session);ulong a=BitConverter.ToUInt64(session,0),b=BitConverter.ToUInt64(session,8);var comparer=new Comparer01(initial,a,b,Stopwatch.Frequency);module.Begin(a,b,initial,c.maximumRecords,c.maximumSeconds);
    long start=Stopwatch.GetTimestamp();terminal="bounded-window-complete";
    while(!stopping&&rows.Count<c.maximumRecords&&Stopwatch.GetTimestamp()-start<=Stopwatch.Frequency*c.maximumSeconds){
     stage="managed-poll-limit";Need(managedPolls<(int)c.maximumSeconds*100+1,"diagnostic-managed-poll-limit");managedPolls++;stage="story";Need(Story(),"diagnostic-story-left");stage="RPH-before";var before=peer.Capture();stage="native-read";Record01 record;uint code=module.Read(out record);stage="RPH-after";var after=peer.Capture();
     if((code==0||code==1)&&record.Phase==4){firstFailure=new{stage="native-retirement",code,rawNative=NativeEvidence(record),rawPeerBefore=PeerEvidence(before),rawPeerAfter=PeerEvidence(after)};rows.Add(new{comparisonAccepted=false,reason="native-retirement",evidence=firstFailure});terminal="diagnostic-native-retired-"+record.Reason;break;}
     if(code==0){try{stage="comparison";var comparison=comparer.Compare(before,after,record,Stopwatch.GetTimestamp());rows.Add(new{comparisonAccepted=true,comparison,rawNative=NativeEvidence(record),rawPeerBefore=PeerEvidence(before),rawPeerAfter=PeerEvidence(after)});}catch(Exception error){firstFailure=new{stage="comparison",reason=error.Message,rawNative=NativeEvidence(record),rawPeerBefore=PeerEvidence(before),rawPeerAfter=PeerEvidence(after)};rows.Add(new{comparisonAccepted=false,evidence=firstFailure});terminal="diagnostic-comparison-rejected";break;}}
     else Need(code==1||code==2,"diagnostic-read-error");
     GameFiber.Sleep(10);
    }
    if(stopping)terminal="diagnostic-unload-requested";
   }catch(ThreadAbortException){terminal="diagnostic-thread-aborted";throw;}
   catch(Exception error){terminal=error is InvalidDataException||error is PeerCaptureFailure01?error.Message:"diagnostic-failed-"+error.GetType().Name;var peerError=error as PeerCaptureFailure01;if(firstFailure==null)firstFailure=new{stage=peerError==null?stage:peerError.Stage,errorType=error.GetType().Name,getterExceptionType=peerError==null?null:peerError.GetterExceptionType,reason=terminal,rawPeer=peerError==null?null:PeerEvidence(peerError.Witness)};}
   finally{
    var m=module;module=null;if(m!=null)m.Stop();
    // A new background writer owns the immutable bounded diagnostic value.
    // It cannot start playback, refresh observations, or call GTA natives.
    if(output!=null){var values=rows.ToArray();string folder=output,session=c.session,ending=terminal;var failure=firstFailure;var initial=initialEvidence;var description=nativeDescription;var readiness=preArm;var boundInputs=bindings;var activity=new{nativeMaximumHz=20,preArmPolls=readinessChecks,preArmPollLimit=1001,managedPolls,managedPollLimit=(int)c.maximumSeconds*100+1,managedSleepMs=10,rphCaptureAttempts=retainedPeer==null?0:retainedPeer.CaptureAttempts,rphRunningGetterAttempts=retainedPeer==null?0:retainedPeer.RunningGetterAttempts,rphRatioGetterAttempts=retainedPeer==null?0:retainedPeer.RatioGetterAttempts,acquisitionCaptureCountsAvailable=retainedPeer!=null};WriterState01="queued";MainWriterState01="waiting";writerStarted01=Stopwatch.GetTimestamp();
     ThreadPool.QueueUserWorkItem(delegate{
      NativeModule01.Closure closure=null;
      try{
       WriterState01="writing";closure=m==null?null:m.ObserveClosureAndRelease(1000);WriterBudget01();
       var result=new{schema=2,kind="RichAudioTrackedShvPassiveDiagnostic01",session,terminal=ending,bindings=boundInputs,initialPeer=initial,nativeDescription=description,preArm=readiness,activity,rows=values,firstFailure=failure,closure,terminalNative=closure==null||closure.terminalReadCode==2?null:NativeEvidence(closure.Terminal),audioStarted=false,nativeSoundsMutated=false,acceptedForNormalTelemetry=false,payloadPrepared=true,writerCompletionMarkerRequired=true,writerMaximumMs=3000};
       Directory.CreateDirectory(folder);string serialized=SerializeBounded01(result);WriterBudget01();PublishNew01(Path.Combine(folder,"diagnostic.json"),serialized);WriterBudget01();
       PublishNew01(Path.Combine(folder,"writer-completion.json"),new JavaScriptSerializer().Serialize(new{schema=1,session,state="complete",rows=values.Length,bytes=System.Text.Encoding.UTF8.GetByteCount(serialized),sha256=Hash(Path.Combine(folder,"diagnostic.json"))}));WriterBudget01();
       Need(Interlocked.CompareExchange(ref writerOutcome01,1,0)==0,"diagnostic-writer-deadline");WriterState01="complete";
      }catch(Exception error){WriterState01="publishing-failure";try{Directory.CreateDirectory(folder);PublishNew01(Path.Combine(folder,"writer-failure.json"),new JavaScriptSerializer().Serialize(new{schema=1,session,state="failed",errorType=error.GetType().Name,reason=error is InvalidDataException?error.Message:"diagnostic-writer-failed",rows=values.Length,terminal=ending,closure,firstFailureRetained=failure!=null,mainDeadlineExpired=Interlocked.CompareExchange(ref writerOutcome01,0,0)==3,diagnosticAcceptance=false}));}catch(Exception){}finally{Interlocked.CompareExchange(ref writerOutcome01,2,0);WriterState01="failed";}}
     });
     // Keep the RPH main fiber alive until useful writer work has ended. Yield
     // to RPH; no blocking wait or game-fiber file IO is introduced here.
     while(Interlocked.CompareExchange(ref writerOutcome01,0,0)==0&&Stopwatch.GetTimestamp()-writerStarted01<Stopwatch.Frequency*3)GameFiber.Sleep(10);
     Interlocked.CompareExchange(ref writerOutcome01,3,0);int outcome=Interlocked.CompareExchange(ref writerOutcome01,0,0);MainWriterState01=outcome==1?"complete":outcome==2?"failed":"unknown";
     Game.Console.Print("RichAudio tracked diagnostic "+session+": writer-completion "+MainWriterState01);
    }
   }
  }
  internal static string SerializeBounded01(object value){string text=new JavaScriptSerializer{MaxJsonLength=8*1024*1024,RecursionLimit=24}.Serialize(value);Need(System.Text.Encoding.UTF8.GetByteCount(text)<=8*1024*1024,"diagnostic-log-byte-bound");return text;}
  static void PublishNew01(string path,string text){string pending=path+".pending";using(var file=new FileStream(pending,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(file,new System.Text.UTF8Encoding(false))){writer.Write(text);writer.Flush();}File.Move(pending,path);}
  static object PeerEvidence(Peer01 p){return new{p.Before,p.After,p.Value,p.Index,p.Counter,p.Address,AddressHex=p.Address.ToString("x16"),p.Model,p.IdentityComplete,p.RunningObserved,p.RatioObserved,p.RiderObserved,p.Running,p.RiderAttached,p.RawRatioBits,rawRatio=p.RawRatio.ToString("R",System.Globalization.CultureInfo.InvariantCulture)};}
  static object NativeEvidence(Record01 r){return new{r.Size,r.Version,r.Session0,r.Session1,Session0Hex=r.Session0.ToString("x16"),Session1Hex=r.Session1.ToString("x16"),r.Sequence,sessionBindingPresent=(r.Session0|r.Session1)!=0,r.TargetBefore,r.TargetAfter,r.ReadNow,r.RawBits,r.Status,r.Reason,r.Phase,pre=IdentityEvidence(r.Pre),post=IdentityEvidence(r.Post),failure=new{r.Failure.Before,r.Failure.After,r.Failure.Native,NativeHex=r.Failure.Native.ToString("x16"),r.Failure.Address,AddressHex=r.Failure.Address.ToString("x16"),r.Failure.Stage,stageName=Enum.GetName(typeof(FailureStage01),r.Failure.Stage),r.Failure.RawBits,r.Failure.Handle,r.Failure.Returned}};}
  static object IdentityEvidence(Identity01 i){return new{i.Before,i.After,i.Address,AddressHex=i.Address.ToString("x16"),i.Handle,i.Driver,i.Model,i.Running,identityCompleted=i.Before>0&&i.After>=i.Before};}
  static byte[] Hex(string value){var bytes=new byte[16];for(int i=0;i<16;i++)bytes[i]=Convert.ToByte(value.Substring(i*2,2),16);return bytes;}
  public static void OnUnload(){stopping=true;var m=module;if(m!=null)m.Stop();}
 }
}
#endif
