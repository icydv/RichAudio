using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using RichAudio.Beacon.Transport;

internal static class CombinedObservationReceiver {
 static int Main(string[] args){
  Guid session;
  int peer;
  long armByUtcMs,stopByUtcMs;
  if(args.Length!=5||!Guid.TryParseExact(args[0],"N",out session)||session==Guid.Empty||args[0]!=session.ToString("N")||!Int32.TryParse(args[1],out peer)||peer<=0||
   !Int64.TryParse(args[3],NumberStyles.None,CultureInfo.InvariantCulture,out armByUtcMs)||
   !Int64.TryParse(args[4],NumberStyles.None,CultureInfo.InvariantCulture,out stopByUtcMs)){
   Console.Error.WriteLine("Usage: RichAudio.ObservationReceiver.exe <session N-format> <GTA PID> <fresh capture.jsonl> <arm cutoff UTC epoch ms> <observation cutoff UTC epoch ms>");return 2;
  }
  long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  long remaining=armByUtcMs-now,stopAfter=stopByUtcMs-now;
  if(remaining<=0||stopAfter<=remaining||stopAfter>25*60*1000){Console.Error.WriteLine("Invalid session cutoffs");return 2;}
  var awaitingArm=Stopwatch.StartNew();
  int count=0;bool ownedCapture=false;
  try {
   using(var process=Process.GetProcessById(peer))
   using(var log=new StreamWriter(new FileStream(args[2],FileMode.CreateNew,FileAccess.Write,FileShare.Read),new UTF8Encoding(false)))
   using(var pipe=GameplayWire.Server("RichAudio.Observation."+args[0])){
    // Pin the process lifetime while the PID is in use; no external process is owned or terminated here.
    ownedCapture=true;
    GC.KeepAlive(process.Handle);
    if(process.HasExited)return 2;
    var connect=pipe.BeginWaitForConnection(null,null);
    Console.WriteLine("Ready: RichAudioObserveStart "+args[0]+" "+Process.GetCurrentProcess().Id);
    while(true){
     long waitMs=remaining-awaitingArm.ElapsedMilliseconds;
     if(process.HasExited)throw new EndOfStreamException("GTA exited before observation");
     if(waitMs<=0)throw new TimeoutException("session arm cutoff");
     if(connect.AsyncWaitHandle.WaitOne((int)Math.Min(250,waitMs)))break;
    }
    pipe.EndWaitForConnection(connect);
    GameplayWire.Peer(pipe,peer,true);
    Console.WriteLine("Receiver connected: session="+session.ToString("N")+"; gamePid="+peer);
    long budget=Math.Min(4*60*1000,stopAfter-awaitingArm.ElapsedMilliseconds);
    if(budget<=0)throw new TimeoutException("session observation cutoff");
    var start=Stopwatch.StartNew();
    bool firstFresh=false;
    long lastSequence=-1,lastTicks=-1,lastGeneration=0;
    // Closing the pipe at the deadline also interrupts a partial read.
    using(var cutoff=new Timer(_=>pipe.Dispose(),null,(int)budget,Timeout.Infinite))
    while(start.ElapsedMilliseconds<budget&&count<5500&&!process.HasExited){
     byte[] bytes;
     try{bytes=GameplayWire.Read(pipe,15000);}
     catch(EndOfStreamException){break;}
     catch(TimeoutException){if(start.ElapsedMilliseconds<budget)throw;break;}
     catch(ObjectDisposedException){if(start.ElapsedMilliseconds<budget)throw;break;}
     catch(IOException){if(start.ElapsedMilliseconds<budget)throw;break;}
     if(start.ElapsedMilliseconds>=budget)break;
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
     if(fresh&&!firstFresh){
      firstFresh=true;
      Console.WriteLine("First valid camera frame received: session="+session.ToString("N")+"; sequence="+lastSequence);
     }
     try{TransportStop.Write(pipe,new[]{TransportStop.Accepted});}
     catch(ObjectDisposedException){if(start.ElapsedMilliseconds<budget)throw;break;}
     catch(IOException){if(start.ElapsedMilliseconds<budget)throw;break;}
    }
   }
   Console.WriteLine("Closed; frames="+count);
   return count>0?0:3;
  }catch(Exception e){Console.Error.WriteLine("Capture ended: "+e.GetType().Name+"; frames="+count);return 1;}
  finally{if(ownedCapture)using(var done=new FileStream(args[2]+".closed",FileMode.CreateNew,FileAccess.Write,FileShare.Read)){}}
 }
}
