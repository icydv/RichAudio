// RPH-independent lifecycle shared by the product adapter and device-free proof.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Text;using System.Threading;using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Windows {
 [DataContract]public sealed class PlayablePointer {
  [DataMember(Name="schema",IsRequired=true)]public int Schema;
  [DataMember(Name="packageRoot",IsRequired=true)]public string PackageRoot;
  [DataMember(Name="manifestSha256",IsRequired=true)]public string ManifestSha256;
 }
 // Windows metadata queries can return the 1601 sentinel during File.Replace.
 // Reuse only the existing publication's remaining lifetime, never query time.
 internal sealed class BatiHostStatusWatch01 {
  long expires;DateTime lastPublication;
  internal void Observe(bool exists,DateTime modifiedUtc,DateTime observedUtc,long observedQpc,long frequency){
   if(!exists||modifiedUtc<=DateTime.FromFileTimeUtc(0)||modifiedUtc>observedUtc||modifiedUtc<=lastPublication)return;
   lastPublication=modifiedUtc;
   double remaining=5-(observedUtc-modifiedUtc).TotalSeconds;
   expires=remaining<=0?observedQpc:observedQpc+(long)(remaining*frequency);
  }
  internal bool Expired(long now,long started,long frequency){return now-started>frequency*10&&(expires==0||now>=expires);}
 }

 public sealed class GameplayRuntime {
  readonly ManualResetEvent wake=new ManualResetEvent(false);readonly bool fixture,batiDemo,recordingAuthorized,loopbackAuthorized;volatile bool stopping,story,demoFaulted;Thread thread;Process host;OwnedProcessJob job;GameplayPublisher publisher;PlayableConfiguration configuration;AcousticSettings settings;
  readonly object batiGate=new object();bool batiEnabled,batiRetired;GameplayFrame batiFrame;long batiValidThrough;
  BatiHostStatusWatch01 batiStatusWatch=new BatiHostStatusWatch01();
  readonly string session;readonly Queue<long> faults=new Queue<long>();volatile string state="not-started";int attempts,livePid;long nextAttempt,hostStarted;Mutex lease;bool leaseOwned;
  public GameplayRuntime(bool deviceFreeFixture=false,string sessionId=null,bool batiDemoProfile=false,bool recordingAllowed=false,bool loopbackAllowed=false){
   if(sessionId!=null&&!System.Text.RegularExpressions.Regex.IsMatch(sessionId,"\\A[a-f0-9]{32}\\z"))throw new ArgumentException("owned gameplay session");
   if(batiDemoProfile&&sessionId==null||loopbackAllowed&&!recordingAllowed||!batiDemoProfile&&(recordingAllowed||loopbackAllowed))throw new ArgumentException("explicit Bati playback/recording scope");
   fixture=deviceFreeFixture;session=sessionId??Guid.NewGuid().ToString("N");batiDemo=batiDemoProfile;recordingAuthorized=recordingAllowed;loopbackAuthorized=loopbackAllowed;
  }
  public string State{get{return state;}}public string Session{get{return session;}}public PlayableConfiguration Configuration{get{return Volatile.Read(ref configuration);}}public AcousticSettings Settings{get{return Volatile.Read(ref settings);}}public int HostPid{get{return Thread.VolatileRead(ref livePid);}}public int Attempts{get{return Thread.VolatileRead(ref attempts);}}
  public double MaximumObservationMs;
  public void Start(string pointer,string gameExecutable,string runtimeAssembly){if(thread!=null)throw new InvalidOperationException("one gameplay supervisor per plugin");thread=new Thread(delegate(){Run(pointer,gameExecutable,runtimeAssembly);}){IsBackground=true,Name="RichAudio Story lifecycle"};thread.Start();}
  public void SetStoryReady(bool value){if(story!=value){story=value;wake.Set();}}
  public void Publish(GameplayFrame frame){var p=publisher;if(p!=null&&!stopping)p.Publish(frame);}
  internal bool DemoFaulted{get{return demoFaulted;}}
  internal void SetBatiGate(bool enabled,bool retired,GameplayFrame frame,long validThrough){
   if(!batiDemo)throw new InvalidOperationException("Bati-only runtime required");
   lock(batiGate){if(batiRetired)return;batiRetired=retired;batiEnabled=enabled&&!retired;batiFrame=retired?null:frame;batiValidThrough=retired?0:validThrough;}wake.Set();
  }
  bool BatiGateCurrent(out GameplayFrame frame){
   lock(batiGate){frame=batiFrame;return !stopping&&!batiRetired&&batiEnabled&&frame!=null&&Stopwatch.GetTimestamp()<=batiValidThrough;}
  }
  public void RequestStop(){stopping=true;story=false;wake.Set();}
  public bool Join(int milliseconds){return thread==null||thread.Join(milliseconds);}
  static string Q(string s){if(s.IndexOf('"')>=0)throw new InvalidDataException("path quotes");return "\""+s+"\"";}
  void Run(string pointer,string gameExecutable,string runtimeAssembly){
   try{
    state="validating";PlayableConfiguration.NoLinks(pointer);if(new FileInfo(pointer).Length>4096)throw new InvalidDataException("playable pointer size");PlayablePointer p;
    using(var stream=File.OpenRead(pointer))p=(PlayablePointer)new DataContractJsonSerializer(typeof(PlayablePointer)).ReadObject(stream);
    if(p.Schema!=1||!Path.IsPathRooted(p.PackageRoot)||p.ManifestSha256==null||p.ManifestSha256.Length!=64)throw new InvalidDataException("playable pointer");
    string manifest=PlayableConfiguration.Inside(Path.GetFullPath(p.PackageRoot),"playable.json");if(!String.Equals(PlayableConfiguration.Digest(manifest),p.ManifestSha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("playable manifest binding");
    var c=PlayableConfiguration.Load(manifest);if(!String.Equals(c.GameExecutable,Path.GetFullPath(gameExecutable),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("reviewed game binding");
    if(batiDemo){if(c.DemoProfile!="PLAYABLE-13"||c.Eligible.Length!=1||c.Eligible[0].Model!=0xf9300cc5u||c.Eligible[0].Context!="player")throw new InvalidDataException("isolated player Bati demo package required");}
    else if(FileVersionInfo.GetVersionInfo(runtimeAssembly).FileVersion!=c.RphVersion)throw new InvalidDataException("reviewed game/RPH runtime binding");
    int pid=Process.GetCurrentProcess().Id;lease=new Mutex(false,"Local\\RichAudio.Playable01."+pid);try{leaseOwned=lease.WaitOne(0);}catch(AbandonedMutexException){leaseOwned=true;}if(!leaseOwned)throw new InvalidOperationException("another owned gameplay runtime already exists");
    Volatile.Write(ref configuration,c);publisher=new GameplayPublisher(session);publisher.Start();
    if(batiDemo){RunBati(c,p.ManifestSha256);return;}
    while(!stopping){
     try{
      var s=AcousticSettingsStore.Load(c.Root,AcousticSettingsStore.DefaultPath(c.Root));Volatile.Write(ref settings,s);
      bool requested=story&&s.RichAudioEnabled&&s.IntegrationMode=="experimental-additive";
      if(!requested){StopHost();state=story?"GTA stock fallback":"waiting for offline Story Mode";PublishFallback(c,s,state);}
      else if(host==null){long now=Stopwatch.GetTimestamp();while(faults.Count>0&&now-faults.Peek()>Stopwatch.Frequency*600)faults.Dequeue();
       if(faults.Count>=3){state="GTA stock fallback: recovery budget exhausted";PublishFallback(c,s,state);}
       else if(now>=nextAttempt)StartHost(c,p.ManifestSha256);
      }else if(host.HasExited){StopHost();Fault();state="GTA stock fallback: host exited";}
      else{state="experimental additive: GTA engine remains";string statusFile=Path.Combine(c.Root,".local","gameplay",session,"host.json");if(Stopwatch.GetTimestamp()-hostStarted>Stopwatch.Frequency*10&&(!File.Exists(statusFile)||DateTime.UtcNow-File.GetLastWriteTimeUtc(statusFile)>TimeSpan.FromSeconds(5)))throw new TimeoutException("host status stopped");}
     }catch(ThreadAbortException){throw;}catch(Exception e){StopHost();Fault();state="GTA stock fallback: "+e.GetType().Name;var s=Settings;if(s!=null)PublishFallback(c,s,state);}
     wake.WaitOne(200);wake.Reset();
    }
   }catch(ThreadAbortException){throw;}catch(Exception e){if(batiDemo)demoFaulted=true;state="GTA stock fallback: blocked-"+e.GetType().Name;}
   finally{StopHost();var p=publisher;publisher=null;if(p!=null)try{p.Dispose();}catch(Exception){}if(configuration!=null&&settings!=null)try{PublishFallback(configuration,settings,"GTA stock fallback: RichAudio stopped");}catch(Exception){}if(leaseOwned)lease.ReleaseMutex();if(lease!=null)lease.Dispose();}
  }
  void RunBati(PlayableConfiguration c,string manifestSha){
   long nextSettings=0,publishedSequence=-1;string reported=null;
   while(!stopping){
    try{
     long now=Stopwatch.GetTimestamp();
     if(Settings==null||now>=nextSettings){Volatile.Write(ref settings,AcousticSettingsStore.Load(c.Root,AcousticSettingsStore.DefaultPath(c.Root)));nextSettings=now+Stopwatch.Frequency/5;}
     var s=Settings;GameplayFrame frame;bool requested=story&&s.RichAudioEnabled&&s.IntegrationMode=="experimental-additive"&&BatiGateCurrent(out frame);
     if(!requested){StopHost();state=demoFaulted?"GTA stock fallback: Bati playback fault; no automatic retry":"Bati playback disabled or waiting for fresh accepted state";if(reported!=state){PublishFallback(c,s,state);reported=state;}}
     else if(demoFaulted){StopHost();state="GTA stock fallback: Bati playback fault; no automatic retry";}
     else{
      if(host==null){StartHost(c,manifestSha);publishedSequence=-1;}
      if(host.HasExited)throw new IOException("Bati gameplay host exited");
      state="Bati experimental additive; GTA stock audio retained";
      string statusFile=Path.Combine(c.Root,".local","gameplay",session,"host.json");
      bool exists=File.Exists(statusFile);DateTime modified=exists?File.GetLastWriteTimeUtc(statusFile):DateTime.MinValue,observed=DateTime.UtcNow;long observedQpc=Stopwatch.GetTimestamp();
      batiStatusWatch.Observe(exists,modified,observed,observedQpc,Stopwatch.Frequency);
      if(batiStatusWatch.Expired(observedQpc,hostStarted,Stopwatch.Frequency)){var error=new TimeoutException("Bati host status stopped");error.Data["probeExists"]=exists;error.Data["probeUtc"]=observed.ToString("o");error.Data["probeLastWriteUtc"]=modified.ToString("o");throw error;}
      if(BatiGateCurrent(out frame)&&frame.Listener.Sequence>publishedSequence){publisher.Publish(frame);publishedSequence=frame.Listener.Sequence;}
     }
    }catch(ThreadAbortException){throw;}catch(Exception e){RetainBatiFault(c,e);demoFaulted=true;StopHost();state="GTA stock fallback: Bati playback "+e.GetType().Name+"; no automatic retry";var s=Settings;if(s!=null)PublishFallback(c,s,state);}
    wake.WaitOne(20);wake.Reset();
   }
  }
  // Preserve the first fault before StopHost replaces the running status.
  // One private bounded receipt; no endpoint, retries or progress authority.
  bool batiFaultRetained;
  static string BoundedFaultText(string text,int maximum){return text==null?null:text.Substring(0,Math.Min(text.Length,maximum));}
  void RetainBatiFault(PlayableConfiguration c,Exception error){
   if(batiFaultRetained)return;batiFaultRetained=true;
   try{
    string directory=Path.Combine(c.Root,".local","gameplay",session);Directory.CreateDirectory(directory);
    string statusFile=Path.Combine(directory,"host.json");bool exists=File.Exists(statusFile);DateTime now=DateTime.UtcNow;
    var row=new Dictionary<string,object>{{"schema",1},{"session",session},{"observedUtc",now.ToString("o")},{"observedQpc",Stopwatch.GetTimestamp()},
     {"exceptionType",error.GetType().FullName},{"message",BoundedFaultText(error.Message,1024)},{"stack",BoundedFaultText(error.StackTrace,4096)},
     {"hostPid",HostPid},{"hostAgeMs",(Stopwatch.GetTimestamp()-hostStarted)*1000d/Stopwatch.Frequency},{"statusExists",exists},
     {"statusLastWriteUtc",exists?File.GetLastWriteTimeUtc(statusFile).ToString("o"):null},{"statusAgeMs",exists?(object)(now-File.GetLastWriteTimeUtc(statusFile)).TotalMilliseconds:null}};
    foreach(string key in new[]{"probeExists","probeUtc","probeLastWriteUtc"})if(error.Data.Contains(key))row[key]=error.Data[key];
    try{if(exists&&new FileInfo(statusFile).Length<=32768){var status=new System.Web.Script.Serialization.JavaScriptSerializer{MaxJsonLength=32768}.DeserializeObject(File.ReadAllText(statusFile))as Dictionary<string,object>;if(status!=null){var progress=new Dictionary<string,object>();foreach(string key in new[]{"hostState","ownerPid","hostPid","nodePid","receivedBlocks","receivedSnapshots","consumedFrames","underflowFrames","failure","failureDetail","audioError"}){object value;if(status.TryGetValue(key,out value))progress[key]=value is string?BoundedFaultText((string)value,1024):value;}row["statusBeforeStop"]=progress;}}}catch(Exception statusError){row["statusReadError"]=statusError.GetType().Name;}
    string text=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(row);if(Encoding.UTF8.GetByteCount(text)>16384)return;
    using(var file=new FileStream(Path.Combine(directory,"runtime-first-fault.json"),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){byte[] bytes=new UTF8Encoding(false).GetBytes(text);file.Write(bytes,0,bytes.Length);file.Flush(true);}
   }catch(Exception){} // Diagnostics cannot replace the original fault.
  }
  void Fault(){faults.Enqueue(Stopwatch.GetTimestamp());nextAttempt=Stopwatch.GetTimestamp()+Stopwatch.Frequency*(1L<<Math.Min(4,faults.Count));}
  void StartHost(PlayableConfiguration c,string manifestSha){
   string folder=Path.Combine(c.Root,".local","owned");Directory.CreateDirectory(folder);string permit=Path.Combine(folder,"start-"+Guid.NewGuid().ToString("N"));
   int pid=Process.GetCurrentProcess().Id;long start=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks;string pipe="RichAudio.Playable01."+pid+"."+session;
   job=new OwnedProcessJob(1536);host=new Process{StartInfo=new ProcessStartInfo{FileName=PlayableConfiguration.Inside(c.Root,"runtime/RichAudio.Acoustics.Host.exe"),Arguments=(fixture?"--gameplay-fixture ":"--gameplay ")+Q(c.Manifest)+" "+manifestSha+" "+pid+" "+start+" "+session+" "+pipe+" "+Q(permit),WorkingDirectory=c.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true}};
   host.Start();job.Assign(host);hostStarted=Stopwatch.GetTimestamp();batiStatusWatch=new BatiHostStatusWatch01();Interlocked.Increment(ref attempts);Interlocked.Exchange(ref livePid,host.Id);
   if(batiDemo){
    GameplayFrame fresh;if(!BatiGateCurrent(out fresh))throw new InvalidDataException("accepted Bati expired before host permit");
    string text=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new{schema=1,profile="PLAYABLE-13",session=session,playbackAllowed=true,recordingAllowed=recordingAuthorized,loopbackAllowed=loopbackAuthorized,fixtureOnly=fixture});
    string pendingPermit=permit+".pending";byte[] bytes=new UTF8Encoding(false).GetBytes(text);
    using(var f=new FileStream(pendingPermit,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(bytes,0,bytes.Length);f.Flush(true);}
    File.Move(pendingPermit,permit);
   }else File.WriteAllText(permit,"owned gameplay job");
   publisher.Configure(pipe,host.Id);state="automatic host starting";
  }
  void StopHost(){var p=host;host=null;if(publisher!=null)publisher.Configure(null,0);if(p!=null){try{if(!p.HasExited){byte[] b=Encoding.UTF8.GetBytes("stop\n");try{PipeDeadline.Write(p.StandardInput.BaseStream,b,200,"host stop write deadline");}catch(TimeoutException){}p.WaitForExit(batiDemo?6000:1500);}}catch(Exception){}finally{if(job!=null){job.Dispose();job=null;}try{if(!p.HasExited)p.Kill();p.WaitForExit(1000);}catch(Exception){}p.Dispose();}}else if(job!=null){job.Dispose();job=null;}Interlocked.Exchange(ref livePid,0);}
  static void PublishFallback(PlayableConfiguration c,AcousticSettings s,string reason){
   var j=new System.Web.Script.Serialization.JavaScriptSerializer();string text=j.Serialize(new{schemaVersion=1,hostState="stopped",recordedAtUtc=DateTime.UtcNow.ToString("o"),status=new{integrationMode="stock-fallback",nativeReplacement=false,reason}});
   AcousticSettingsStore.WriteAtomic(c.Root,AcousticSettingsStore.StatusPath(AcousticSettingsStore.DefaultPath(c.Root)),text,16384);
  }
 }
}
