using System;
using System.Threading;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

namespace RichAudio.Integration {
 // No framework object, game native or renderer is retained by this owner.
 // Start merely creates the supervisor thread. Hashing, settings, IPC, child
 // creation and graceful waits all run outside the SHVDNE callback.
 public sealed class ShvdneHostController : IDisposable {
  readonly GameplayRuntime runtime;int started,stopping;long lastSequence=-1;
  public ShvdneHostController(bool deviceFreeFixture=false){
   runtime=new GameplayRuntime(deviceFreeFixture);
   AppDomain.CurrentDomain.DomainUnload+=OnDomainEnd;
   AppDomain.CurrentDomain.ProcessExit+=OnDomainEnd;
  }
  public string Session {get{return runtime.Session;}}
  public string State {get{return runtime.State;}}
  public PlayableConfiguration Configuration {get{return runtime.Configuration;}}
  public AcousticSettings Settings {get{return runtime.Settings;}}
  public int HostPid {get{return runtime.HostPid;}}
  public int Attempts {get{return runtime.Attempts;}}
  public static bool PassiveTimingGate02(long elapsedQpc,long batches,long batchOver10,long tickOver10,long getterFailures,bool listenerReady,long missedIntervals=0){return missedIntervals==0&&elapsedQpc>=System.Diagnostics.Stopwatch.Frequency*30&&batches>=300&&batchOver10==0&&tickOver10==0&&getterFailures==0&&listenerReady;}
  public static string CommandDecision02(string expected,object actual,object action,bool timingReady,bool armed,bool retired){
   if(!Equals(expected,actual))return "rejected-session-command";
   if(Equals(action,"retire"))return "retire";
   if(!Equals(action,"arm"))return "rejected-action";
   return timingReady&&!armed&&!retired?"arm":"rejected-arm-gate";
  }
  public void Start(string pointer,string gameExecutable,string apiAssembly){
   if(Volatile.Read(ref stopping)!=0||Interlocked.CompareExchange(ref started,1,0)!=0)throw new InvalidOperationException("one controller session per script lifetime");
   runtime.Start(pointer,gameExecutable,apiAssembly,"shvdne");
  }
  public object PublisherMetrics {get{return runtime.PublisherMetrics;}}
  public void SetTransportArmed(bool value){runtime.SetTransportArmed(value);}
  public void SetStoryReady(bool ready){if(Volatile.Read(ref stopping)==0)runtime.SetStoryReady(ready);}
  public bool Publish(GameplayFrame frame){
   if(Volatile.Read(ref started)==0||Volatile.Read(ref stopping)!=0||frame==null||frame.Listener==null||
    frame.Session!=Session||frame.Listener.Session!=Session||frame.Listener.Sequence<=Interlocked.Read(ref lastSequence))return false;
   Interlocked.Exchange(ref lastSequence,frame.Listener.Sequence);runtime.Publish(frame);return true;
  }
  public void RequestStop(string reason){Interlocked.Exchange(ref stopping,1);runtime.RequestStop(reason);}
  public void AbortAndCloseContainment(string reason){Interlocked.Exchange(ref stopping,1);runtime.AbortAndCloseContainment(reason);}
  // Only offline harnesses or ordinary worker threads may wait for completion.
  public bool Join(int milliseconds){if(milliseconds<0||milliseconds>15000)throw new ArgumentOutOfRangeException("milliseconds");return runtime.Join(milliseconds);}
  void OnDomainEnd(object sender,EventArgs args){AbortAndCloseContainment("shvdne-domain-ending");}
  public void Dispose(){
   AbortAndCloseContainment("shvdne-controller-disposed");
   AppDomain.CurrentDomain.DomainUnload-=OnDomainEnd;AppDomain.CurrentDomain.ProcessExit-=OnDomainEnd;
  }
 }
}
