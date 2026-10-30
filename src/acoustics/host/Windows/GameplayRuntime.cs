// RPH-independent lifecycle shared by the product adapter and device-free proof.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Text;using System.Threading;using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Windows {
 [DataContract]public sealed class PlayablePointer {
  [DataMember(Name="schema",IsRequired=true)]public int Schema;
  [DataMember(Name="packageRoot",IsRequired=true)]public string PackageRoot;
  [DataMember(Name="manifestSha256",IsRequired=true)]public string ManifestSha256;
 }
 public sealed class GameplayRuntime {
  readonly ManualResetEvent wake=new ManualResetEvent(false);readonly bool fixture;volatile bool stopping,story;Thread thread;Process host;OwnedProcessJob job;GameplayPublisher publisher;PlayableConfiguration configuration;AcousticSettings settings;
  readonly string session=Guid.NewGuid().ToString("N");readonly Queue<long> faults=new Queue<long>();volatile string state="not-started";int attempts,livePid;long nextAttempt,hostStarted;Mutex lease;bool leaseOwned;
  public GameplayRuntime(bool deviceFreeFixture=false){fixture=deviceFreeFixture;}
  public string State{get{return state;}}public string Session{get{return session;}}public PlayableConfiguration Configuration{get{return Volatile.Read(ref configuration);}}public AcousticSettings Settings{get{return Volatile.Read(ref settings);}}public int HostPid{get{return Thread.VolatileRead(ref livePid);}}public int Attempts{get{return Thread.VolatileRead(ref attempts);}}
  public double MaximumObservationMs;
  public void Start(string pointer,string gameExecutable,string runtimeAssembly){if(thread!=null)throw new InvalidOperationException("one gameplay supervisor per plugin");thread=new Thread(delegate(){Run(pointer,gameExecutable,runtimeAssembly);}){IsBackground=true,Name="RichAudio Story lifecycle"};thread.Start();}
  public void SetStoryReady(bool value){if(story!=value){story=value;wake.Set();}}
  public void Publish(GameplayFrame frame){var p=publisher;if(p!=null&&!stopping)p.Publish(frame);}
  public void RequestStop(){stopping=true;story=false;wake.Set();}
  public bool Join(int milliseconds){return thread==null||thread.Join(milliseconds);}
  static string Q(string s){if(s.IndexOf('"')>=0)throw new InvalidDataException("path quotes");return "\""+s+"\"";}
  void Run(string pointer,string gameExecutable,string runtimeAssembly){
   try{
    state="validating";PlayableConfiguration.NoLinks(pointer);if(new FileInfo(pointer).Length>4096)throw new InvalidDataException("playable pointer size");PlayablePointer p;
    using(var stream=File.OpenRead(pointer))p=(PlayablePointer)new DataContractJsonSerializer(typeof(PlayablePointer)).ReadObject(stream);
    if(p.Schema!=1||!Path.IsPathRooted(p.PackageRoot)||p.ManifestSha256==null||p.ManifestSha256.Length!=64)throw new InvalidDataException("playable pointer");
    string manifest=PlayableConfiguration.Inside(Path.GetFullPath(p.PackageRoot),"playable.json");if(!String.Equals(PlayableConfiguration.Digest(manifest),p.ManifestSha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("playable manifest binding");
    var c=PlayableConfiguration.Load(manifest);if(!String.Equals(c.GameExecutable,Path.GetFullPath(gameExecutable),StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(runtimeAssembly).FileVersion!=c.RphVersion)throw new InvalidDataException("reviewed game/RPH runtime binding");
    int pid=Process.GetCurrentProcess().Id;lease=new Mutex(false,"Local\\RichAudio.Playable01."+pid);try{leaseOwned=lease.WaitOne(0);}catch(AbandonedMutexException){leaseOwned=true;}if(!leaseOwned)throw new InvalidOperationException("another owned gameplay runtime already exists");
    Volatile.Write(ref configuration,c);publisher=new GameplayPublisher(session);publisher.Start();
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
   }catch(ThreadAbortException){throw;}catch(Exception e){state="GTA stock fallback: blocked-"+e.GetType().Name;}
   finally{StopHost();var p=publisher;publisher=null;if(p!=null)try{p.Dispose();}catch(Exception){}if(configuration!=null&&settings!=null)try{PublishFallback(configuration,settings,"GTA stock fallback: RichAudio stopped");}catch(Exception){}if(leaseOwned)lease.ReleaseMutex();if(lease!=null)lease.Dispose();}
  }
  void Fault(){faults.Enqueue(Stopwatch.GetTimestamp());nextAttempt=Stopwatch.GetTimestamp()+Stopwatch.Frequency*(1L<<Math.Min(4,faults.Count));}
  void StartHost(PlayableConfiguration c,string manifestSha){
   string folder=Path.Combine(c.Root,".local","owned");Directory.CreateDirectory(folder);string permit=Path.Combine(folder,"start-"+Guid.NewGuid().ToString("N"));
   int pid=Process.GetCurrentProcess().Id;long start=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks;string pipe="RichAudio.Playable01."+pid+"."+session;
   job=new OwnedProcessJob(1536);host=new Process{StartInfo=new ProcessStartInfo{FileName=PlayableConfiguration.Inside(c.Root,"runtime/RichAudio.Acoustics.Host.exe"),Arguments=(fixture?"--gameplay-fixture ":"--gameplay ")+Q(c.Manifest)+" "+manifestSha+" "+pid+" "+start+" "+session+" "+pipe+" "+Q(permit),WorkingDirectory=c.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true}};
   host.Start();job.Assign(host);hostStarted=Stopwatch.GetTimestamp();File.WriteAllText(permit,"owned gameplay job");Interlocked.Increment(ref attempts);Interlocked.Exchange(ref livePid,host.Id);publisher.Configure(pipe,host.Id);state="automatic host starting";
  }
  void StopHost(){var p=host;host=null;if(publisher!=null)publisher.Configure(null,0);if(p!=null){try{if(!p.HasExited){byte[] b=Encoding.UTF8.GetBytes("stop\n");var op=p.StandardInput.BaseStream.BeginWrite(b,0,b.Length,null,null);using(var wait=op.AsyncWaitHandle)if(wait.WaitOne(200))p.StandardInput.BaseStream.EndWrite(op);p.WaitForExit(1500);}}catch(Exception){}finally{if(job!=null){job.Dispose();job=null;}try{if(!p.HasExited)p.Kill();p.WaitForExit(1000);}catch(Exception){}p.Dispose();}}else if(job!=null){job.Dispose();job=null;}Interlocked.Exchange(ref livePid,0);}
  static void PublishFallback(PlayableConfiguration c,AcousticSettings s,string reason){
   var j=new System.Web.Script.Serialization.JavaScriptSerializer();string text=j.Serialize(new{schemaVersion=1,hostState="stopped",recordedAtUtc=DateTime.UtcNow.ToString("o"),status=new{integrationMode="stock-fallback",nativeReplacement=false,reason}});
   AcousticSettingsStore.WriteAtomic(c.Root,AcousticSettingsStore.StatusPath(AcousticSettingsStore.DefaultPath(c.Root)),text,16384);
  }
 }
}
