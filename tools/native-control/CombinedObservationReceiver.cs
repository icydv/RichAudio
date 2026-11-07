using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Text;
using RichAudio.Beacon.Transport;

internal static class CombinedObservationReceiver {
 static int Main(string[] args){
  Guid session;
  int peer;
  if(args.Length!=3||!Guid.TryParseExact(args[0],"N",out session)||session==Guid.Empty||args[0]!=session.ToString("N")||!Int32.TryParse(args[1],out peer)||peer<=0){
   Console.Error.WriteLine("Usage: RichAudio.ObservationReceiver.exe <session N-format> <GTA PID> <fresh capture.jsonl>");return 2;
  }
  int count=0;bool ownedCapture=false;
  try {
   using(var process=Process.GetProcessById(peer))
   using(var log=new StreamWriter(new FileStream(args[2],FileMode.CreateNew,FileAccess.Write,FileShare.Read),new UTF8Encoding(false)))
   using(var pipe=GameplayWire.Server("RichAudio.Observation."+args[0])){
    // Pin the process lifetime while the PID is in use; no external process is owned or terminated here.
    ownedCapture=true;
    GC.KeepAlive(process.Handle);
    if(process.HasExited)return 2;
    var start=Stopwatch.StartNew();
    var connect=pipe.BeginWaitForConnection(null,null);
    Console.WriteLine("Ready: RichAudioObserveStart "+args[0]+" "+Process.GetCurrentProcess().Id);
    if(!connect.AsyncWaitHandle.WaitOne(30000))throw new TimeoutException("arm deadline");
    pipe.EndWaitForConnection(connect);
    GameplayWire.Peer(pipe,peer,true);
    long lastSequence=-1,lastTicks=-1,lastGeneration=0;
    while(start.Elapsed.TotalMinutes<4.5&&count<5500&&!process.HasExited){
     byte[] bytes;
     try{bytes=GameplayWire.Read(pipe,15000);}catch(EndOfStreamException){break;}
     var frame=GameplayWire.Decode(bytes,args[0]);
     long received=Stopwatch.GetTimestamp();
     double age=((decimal)received-frame.Listener.ObservationTicks)>0?
      (double)((decimal)received-frame.Listener.ObservationTicks)*1000/Stopwatch.Frequency:0;
     bool fresh=frame.Listener.ClockFrequency==Stopwatch.Frequency&&frame.Listener.ObservationTicks<=received&&age<=250;
     Protocol.Check(frame.Listener.Sequence>lastSequence&&frame.Listener.ObservationTicks>lastTicks&&frame.Listener.Generation>=lastGeneration&&
      frame.CameraInteriorReadback!=null&&frame.Vehicles.Length==0&&frame.CameraInterior01==null&&frame.WorldPreparationStartedUtc==null,"ordered observation-only payload");
     lastSequence=frame.Listener.Sequence;lastTicks=frame.Listener.ObservationTicks;lastGeneration=frame.Listener.Generation;
     log.WriteLine("{\"receivedTicks\":"+received.ToString(CultureInfo.InvariantCulture)+",\"sourceAgeMs\":"+age.ToString("R",CultureInfo.InvariantCulture)+
      ",\"fresh\":"+(fresh?"true":"false")+",\"frame\":"+Encoding.UTF8.GetString(bytes)+"}");
     log.Flush();count++;
     TransportStop.Write(pipe,new[]{TransportStop.Accepted});
    }
   }
   Console.WriteLine("Closed; frames="+count);
   return count>0?0:3;
  }catch(Exception e){Console.Error.WriteLine("Capture ended: "+e.GetType().Name+"; frames="+count);return 1;}
  finally{if(ownedCapture)using(var done=new FileStream(args[2]+".closed",FileMode.CreateNew,FileAccess.Write,FileShare.Read)){}}
 }
}
