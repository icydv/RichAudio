using System;
using System.Diagnostics;
using System.Reflection;
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
  static bool used,unloaded,registered;
  public static void Main(){
   Report("entry reached");
   try{
    Report("registration attempted");
    Game.AddConsoleCommands(new MethodInfo[]{
     ((Action<string,int>)Start).Method,
     ((Action)Stop).Method,
     ((Action)Status).Method,
     ((Action)ReadVehicleHornCommand.ReadVehicleHorn).Method
    });
    registered=true;
    Report("registration call completed; awaiting manual arm");
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception e){Report("registration failed: "+e.GetType().Name);throw;}
  }

  static void Report(string stage){
   string line="RichAudio observation "+stage;
   Game.LogTrivial(line);
   Game.Console.Print(line);
  }

  [ConsoleCommand(Name="RichAudioObserveStatus",Description="Confirm the observation command path without starting sampling.")]
  public static void Status(){
   Report("status handler entered; "+(registered&&!unloaded?"registration call completed":"unavailable"));
  }

  [ConsoleCommand(Name="RichAudioObserveStart",Description="Arm one four-minute Story Mode observation against the supplied receiver PID.")]
  public static void Start(string session,int receiverPid){
   Report("start handler entered; session="+session+"; receiverPid="+receiverPid);
   Guid parsed;
   if(!registered||unloaded||used||receiverPid<=0||!Guid.TryParseExact(session,"N",out parsed)||parsed==Guid.Empty||session!=parsed.ToString("N")||!CameraSampler.StoryReady()){
    Game.Console.Print("RichAudio observation arm rejected.");return;
   }
   used=true;
   var p=new GameplayPublisher(session);
   try{
    p.Configure("RichAudio.Observation."+session,receiverPid);
    p.Start();publisher=p;
    ReadVehicleHornCommand.Session=session;
    GameFiber.StartNew(()=>Run(p,session,receiverPid),"RichAudio observation");
    Report("armed "+session+".");
   }catch(System.Threading.ThreadAbortException){Stop();throw;}
   catch(Exception e){Stop();Game.Console.Print("RichAudio observation arm failed: "+e.GetType().Name);}
  }

  static void Run(GameplayPublisher p,string session,int receiverPid){
   var tracker=new CameraListenerTracker();
   var empty=new GameplayVehicle[0];
   var limit=Stopwatch.StartNew();
   bool lost=false;
   try{
    using(var receiver=Process.GetProcessById(receiverPid)){
     GC.KeepAlive(receiver.Handle);
     while(publisher==p&&limit.Elapsed.TotalMinutes<4&&!receiver.HasExited){
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
   registered=false;
   if(!isTerminating)Report("unload entered");
   if(!isTerminating){Stop();return;}
   ReadVehicleHornCommand.Session=null;
   var p=publisher;publisher=null;
   if(p!=null)p.RequestStop();
  }
 }
}
