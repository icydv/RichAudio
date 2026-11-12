using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
namespace RichAudio.Beacon.Transport {
 // Receiver-only diagnostic metadata: never converted into synthesis sources.
 public sealed class TransportObservationState02 {
  readonly StateValidator listener=new StateValidator();Dictionary<string,GameplayVehicleObservation02> active=new Dictionary<string,GameplayVehicleObservation02>();
  readonly HashSet<string> retiredIds=new HashSet<string>();
  public long Accepted,Expired,Appeared,Retired,MissingOperatingPoints;public GameplayFrame LastFrame;long lastReceived;
  public bool Accept(GameplayFrame frame,string session,long now){
   GameplayWire.Validate(frame,session);
   Protocol.Check(frame.Vehicles.Length==0&&frame.VehicleObservations02!=null,"transport-only observation extension required; synthesis vehicles forbidden");
   double age=(now-frame.Listener.ObservationTicks)*1000d/Stopwatch.Frequency;
   if(age>250||age< -2||frame.ValidThroughTicks>0&&now>=frame.ValidThroughTicks){Expired++;Expire(now);return false;}
   var next=new Dictionary<string,GameplayVehicleObservation02>();long appeared=0;
   foreach(var v in frame.VehicleObservations02){GameplayVehicleObservation02 old;if(active.TryGetValue(v.Id,out old)){
     Protocol.Check(v.Model==old.Model&&v.Context==old.Context&&v.Generation>=old.Generation&&v.ObservationTicks>old.ObservationTicks,"diagnostic vehicle chronology/identity");
    }else {Protocol.Check(!retiredIds.Contains(v.Id),"retired diagnostic identity cannot reappear");appeared++;}next.Add(v.Id,v);}
   listener.Accept(frame.Listener,now);
   foreach(string id in active.Keys)if(!next.ContainsKey(id)){Retired++;Retire(id);}
   Appeared+=appeared;active=next;MissingOperatingPoints+=next.Count;Accepted++;LastFrame=frame;lastReceived=now;return true;
  }
  void Retire(string id){Protocol.Check(retiredIds.Count<4096,"bounded diagnostic identity history exhausted");retiredIds.Add(id);}
  public void Expire(long now){if(LastFrame!=null&&(now-LastFrame.Listener.ObservationTicks>Stopwatch.Frequency/4||LastFrame.ValidThroughTicks>0&&now>=LastFrame.ValidThroughTicks)){Retired+=active.Count;foreach(string id in active.Keys)Retire(id);active.Clear();LastFrame=null;}}
  public object Snapshot(long now){Expire(now);return new{accepted=Accepted,expired=Expired,appeared=Appeared,retired=Retired,missingOperatingPoints=MissingOperatingPoints,activeVehicles=active.Count,lastAcceptedAgeMs=lastReceived==0?(double?)null:(now-lastReceived)*1000d/Stopwatch.Frequency,lastFrame=LastFrame};}
 }
}
