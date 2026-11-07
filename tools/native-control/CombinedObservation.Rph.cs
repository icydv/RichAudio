using System;
using System.Diagnostics;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Transport;

[assembly:Plugin("RichAudio combined observation", Author="RichAudio",
 Description="Manual read-only camera interior and vehicle horn observation.",
 EntryPoint="RichAudio.CombinedObservation.Main", ExitPoint="RichAudio.CombinedObservation.OnUnload", PrefersSingleInstance=true)]

namespace RichAudio {
 public static class CombinedObservation {
  static volatile GameplayPublisher publisher;
  static bool used,unloaded;
  public static void Main(){
   Game.AddConsoleCommands();
   Game.Console.Print("RichAudio observation idle. No workers or native calls until manually armed.");
  }

  [ConsoleCommand(Name="RichAudioObserveStart",Description="Arm one four-minute Story Mode observation against the supplied receiver PID.")]
  public static void Start(string session,int receiverPid){
   Guid parsed;
   if(unloaded||used||receiverPid<=0||!Guid.TryParseExact(session,"N",out parsed)||parsed==Guid.Empty||session!=parsed.ToString("N")||!CameraSampler.StoryReady()){
    Game.Console.Print("RichAudio observation arm rejected.");return;
   }
   used=true;
   var p=new GameplayPublisher(session);
   try{
    p.Configure("RichAudio.Observation."+session,receiverPid);
    p.Start();publisher=p;
    ReadVehicleHornCommand.Session=session;
    GameFiber.StartNew(()=>Run(p,session),"RichAudio observation");
    Game.Console.Print("RichAudio observation armed "+session+".");
   }catch(System.Threading.ThreadAbortException){Stop();throw;}
   catch(Exception e){Stop();Game.Console.Print("RichAudio observation arm failed: "+e.GetType().Name);}
  }

  static void Run(GameplayPublisher p,string session){
   var tracker=new CameraListenerTracker();
   var empty=new GameplayVehicle[0];
   var limit=Stopwatch.StartNew();
   bool lost=false;
   try{
    while(publisher==p&&limit.Elapsed.TotalMinutes<4){
     if(!CameraSampler.StoryReady()){if(!lost){lost=true;tracker.Invalidate();}}
     else{
      lost=false;
      var d=tracker.Observe(session,CameraSampler.Read());
      if(d.Terminal)tracker.Invalidate();
      else if(d.Publish){
       CameraInteriorReadback raw;
       CameraSampler.ObserveInterior(d.Listener,out raw);
       // No epoch or activation authority is attached by this recorder.
       p.Publish(new GameplayFrame{Session=session,Listener=d.Listener,Vehicles=empty,CameraInteriorReadback=raw});
      }
     }
     GameFiber.Sleep(50);
    }
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception e){Game.Console.Print("RichAudio observation stopped: "+e.GetType().Name);}
   finally{if(publisher==p)Stop();}
  }

  [ConsoleCommand(Name="RichAudioObserveStop",Description="Stop observation and close the publisher.")]
  public static void Stop(){
   ReadVehicleHornCommand.Session=null;
   var p=publisher;publisher=null;
   if(p!=null){
    p.Dispose();
    Game.Console.Print("RichAudio observation stopped; sent="+p.Sent+"; expired="+p.Expired+"; failures="+p.Failures);
   }
  }
  public static void OnUnload(bool isTerminating){
   unloaded=true;
   if(!isTerminating){Stop();return;}
   ReadVehicleHornCommand.Session=null;
   var p=publisher;publisher=null;
   if(p!=null)p.RequestStop();
  }
 }
}
