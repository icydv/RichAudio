using System;
using System.Diagnostics;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Transport;

[assembly:Plugin("RichAudio combined observation", Author="RichAudio",
 Description="Manual read-only camera interior and vehicle horn observation.",
 EntryPoint="RichAudio.CombinedObservation.Main", ExitPoint="RichAudio.CombinedObservation.OnUnload", PrefersSingleInstance=true,
 ShouldTickInPauseMenu=true)]

namespace RichAudio {
 public static class CombinedObservation {
  static volatile bool unloaded;
  static GameplayPublisher publisher;

  public static void Main(){
   try{
    var session=ObservationSession.Open();
    Report("input loop running; awaiting process-bound receiver");
    Run(session);
   }catch(System.Threading.ThreadAbortException){throw;}
   catch(Exception error){Report("closed: "+error.Message);}
   finally{Stop();}
  }

  static void Report(string stage){
   string line="RichAudio observation "+stage;
   Game.LogTrivial(line);
   Game.Console.Print(line);
  }

  static void Run(ObservationSession session){
   var tracker=new CameraListenerTracker();
   var input=new ObservationKeys();
   ObservationBinding binding=null;
   Process receiver=null;
   var empty=new GameplayVehicle[0];
   bool active=false, lost=true;
   long nextBindingPoll=0,nextFrame=0;
   try{
    while(!unloaded&&session.Before(active?session.StopBy:session.ArmBy)){
     long now=Stopwatch.GetTimestamp();
     if(binding==null&&now>=nextBindingPoll){
      nextBindingPoll=now+Stopwatch.Frequency/4;
      binding=session.TryBind(out receiver);
      if(binding!=null)Report("manual controls ready; Ctrl+Shift+Backslash starts, Ctrl+Backslash reads donor, Shift+Backslash stops");
     }
     if(receiver!=null&&receiver.HasExited){Report("receiver exited");return;}
     bool eligible=binding!=null&&ObservationKeys.Foreground()&&!Game.IsLoading&&!Game.IsPaused&&!Game.Console.IsOpen;
     var action=input.Poll(eligible);
     if(action==ObservationAction.Stop){Report("manual stop received");return;}
     if(action==ObservationAction.Start&&!active&&session.Before(session.ArmBy)){
      Report("manual start received; session="+session.Token+"; receiverPid="+binding.ReceiverPid);
      if(!CameraSampler.StoryReady()){Report("manual start rejected: Story Mode unavailable");return;}
      var p=new GameplayPublisher(session.Token);
      publisher=p;
      p.Configure("RichAudio.Observation."+session.Token,binding.ReceiverPid);
      p.Start();
      ReadVehicleHornCommand.Session=session.Token;
      active=true;
     }
     if(active&&eligible&&session.Before(session.StopBy)){
      if(action==ObservationAction.Donor)ReadVehicleHornCommand.ReadVehicleHorn();
      if(now>=nextFrame){
       nextFrame=now+Stopwatch.Frequency/20;
       if(CameraSampler.StoryReady()){
        lost=false;
        var decision=tracker.Observe(session.Token,CameraSampler.Read());
        if(decision.Terminal)tracker.Invalidate();
        else if(decision.Publish){
         CameraInteriorReadback raw;
         CameraSampler.ObserveInterior(decision.Listener,out raw);
         var p=publisher;
         if(p!=null)p.Publish(new GameplayFrame{Session=session.Token,Listener=decision.Listener,Vehicles=empty,CameraInteriorReadback=raw});
        }
       }else if(!lost){tracker.Invalidate();lost=true;}
      }
     }else if(!lost){tracker.Invalidate();lost=true;}
     GameFiber.Sleep(20);
    }
    if(!unloaded)Report(active?"shared observation cutoff":"shared arm cutoff");
   }finally{if(receiver!=null)receiver.Dispose();}
  }

  static void Stop(){
   ReadVehicleHornCommand.Session=null;
   var p=System.Threading.Interlocked.Exchange(ref publisher,null);
   if(p!=null){
    p.Dispose();
    Report("stopped; sent="+p.Sent+"; expired="+p.Expired+"; failures="+p.Failures);
   }
  }

  public static void OnUnload(bool isTerminating){
   unloaded=true;
   if(!isTerminating){Report("unload entered");Stop();return;}
   ReadVehicleHornCommand.Session=null;
   var p=System.Threading.Interlocked.Exchange(ref publisher,null);
   if(p!=null)p.RequestStop();
  }
 }
}
