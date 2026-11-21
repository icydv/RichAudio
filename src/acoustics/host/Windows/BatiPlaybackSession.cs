// Explicit PLAYABLE-13 gate around the existing owned gameplay runtime.
// This class reads no RPH API, opens no device and changes no saved preference.
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Windows
{
 public sealed class BatiPlaybackSession
 {
  const uint Bati=0xf9300cc5u;
  readonly object gate=new object();
  readonly GameplayRuntime runtime;
  readonly string session;
  readonly AutoResetEvent wake=new AutoResetEvent(false);
  Thread watchdog;
  GameplayFrame latest;
  long validThrough,lastSequence=-1;
  bool enabled,retired,stopping,started;
  string reason="not-enabled";
  public BatiPlaybackSession(string session,bool fixture=false,bool recording=false,bool loopback=false)
  {
   if(session==null||!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z")||loopback&&!recording)throw new ArgumentException("owned Bati session and explicit recording permission");
   this.session=session;runtime=new GameplayRuntime(fixture,session,true,recording,loopback);
  }
  public string Session{get{return session;}}
  public string State{get{lock(gate)return retired?"retired: "+reason+"; "+runtime.State:enabled?runtime.State:"disabled: "+runtime.State;}}
  public bool Retired{get{lock(gate)return retired;}}
  public string RetirementReason{get{lock(gate)return retired?reason:null;}}
  public int HostPid{get{return runtime.HostPid;}}
  public int Attempts{get{return runtime.Attempts;}}
  public PlayableConfiguration Configuration{get{return runtime.Configuration;}}
  public AcousticSettings Settings{get{return runtime.Settings;}}
  public void Start(string pointer,string gamePath)
  {
   lock(gate){if(started||retired)throw new InvalidOperationException("one Bati playback session");started=true;}
   runtime.Start(pointer,gamePath,null);runtime.SetStoryReady(true);
   watchdog=new Thread(Watch){IsBackground=true,Name="RichAudio Bati accepted-state expiry"};watchdog.Start();
  }
  public bool Enable(){lock(gate){if(!started||retired||stopping)return false;enabled=true;reason="enabled-waiting-fresh-state";Update();}wake.Set();return true;}
  public void Disable(){lock(gate){if(retired||stopping)return;enabled=false;reason="user-disabled";Update();}wake.Set();}
  public bool PublishAccepted(GameplayFrame frame,long validThroughHostTicks)
  {
   try{
    GameplayWire.Validate(frame,session);long now=Stopwatch.GetTimestamp();
    if(frame.ValidThroughTicks!=validThroughHostTicks||validThroughHostTicks<=now||validThroughHostTicks>now+Stopwatch.Frequency/4
     ||frame.Listener.Paused||!frame.Listener.Valid||frame.Listener.ClockFrequency!=Stopwatch.Frequency
     ||now-frame.Listener.ObservationTicks>Stopwatch.Frequency/4||frame.Listener.ObservationTicks-now>Stopwatch.Frequency/500
     ||frame.Vehicles.Length!=1)throw new InvalidDataException("fresh accepted Bati lease required");
    var vehicle=frame.Vehicles[0];
    if(vehicle.Model!=Bati||vehicle.Context!="player"||!vehicle.Valid||!vehicle.Running||vehicle.OperatingPoint<=0)throw new InvalidDataException("running player Bati required");
    lock(gate){
     if(!started||retired||stopping)return false;
     long admittedAt=Stopwatch.GetTimestamp();
     if(admittedAt>=validThroughHostTicks||latest!=null&&admittedAt>validThrough)throw new InvalidDataException("accepted-source-expired");
     if(frame.Listener.Sequence<=lastSequence)throw new InvalidDataException("accepted Bati sequence must advance");
     lastSequence=frame.Listener.Sequence;latest=frame;validThrough=validThroughHostTicks;reason="fresh-accepted-state";Update();
    }
    wake.Set();return true;
   }catch(ThreadAbortException){throw;}catch(Exception error){Retire(error is InvalidDataException?error.Message:"invalid-accepted-Bati-frame");return false;}
  }
  void Update(){runtime.SetBatiGate(enabled,retired,latest,validThrough);}
  void Watch()
  {
   while(true){
    lock(gate){
     if(stopping)break;
     if(!retired&&(runtime.DemoFaulted||latest!=null&&Stopwatch.GetTimestamp()>validThrough)){
      retired=true;enabled=false;reason=runtime.DemoFaulted?"playback-runtime-fault":"accepted-source-expired";latest=null;validThrough=0;Update();stopping=true;runtime.RequestStop();
     }
    }
    wake.WaitOne(20);
   }
  }
  public void Retire(string why){lock(gate){if(retired)return;retired=true;enabled=false;latest=null;validThrough=0;reason=why??"provider-retired";Update();stopping=true;runtime.RequestStop();}wake.Set();}
  public void Stop(){Retire("user-stopped");lock(gate)stopping=true;wake.Set();runtime.RequestStop();}
  public bool Join(int milliseconds)
  {
   if(milliseconds<0)throw new ArgumentOutOfRangeException("milliseconds");
   var clock=Stopwatch.StartNew();var thread=watchdog;
   if(thread!=null&&!thread.Join(milliseconds))return false;
   return runtime.Join(Math.Max(0,milliseconds-(int)Math.Min(Int32.MaxValue,clock.ElapsedMilliseconds)));
  }
 }
}
