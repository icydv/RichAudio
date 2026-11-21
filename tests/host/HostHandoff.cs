using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Windows {
 public static partial class HostProgram {
  internal static unsafe int SilentHandoff(string root,string name,string directory,string mode){
   var ring=new PcmRing();Thread reader=null,stderr=null;StatePipeServer pipe=null;var cpuStart=Process.GetCurrentProcess().TotalProcessorTime;var wall=Stopwatch.StartNew();bool started=false,killed=false;long missed=0;int high=0;double next=0,leftA=0,rightA=0,leftB=0,rightB=0;var pcm=new float[1024];
   try{
    child=new Process{StartInfo=new ProcessStartInfo{FileName="node.exe",Arguments=Quote(Path.Combine(root,"tools","Run-Acoustics07.mjs"))+" --scene open-road --sources 1 --beacon harmonic --listener-input required",WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};child.Start();
    inputWriter=new Thread(WriteControls){IsBackground=true};inputWriter.Start();stderr=new Thread(ReadDiagnostics){IsBackground=true};stderr.Start();reader=new Thread(()=>ReadBlocks(child.StandardOutput.BaseStream,ring)){IsBackground=true};reader.Start();Send("{\"type\":\"credit\",\"blocks\":4}");
    pipe=new StatePipeServer(name,ListenerReceived,true,ListenerEnded);pipe.Start();File.WriteAllText(Path.Combine(directory,"ready"),"ready");
    while(!stop&&wall.ElapsedMilliseconds<6500){
     if(producerError!=null||producerEnded){if(producerError==null)producerError="Unexpected producer EOF";stop=true;break;}
     if(!started&&listenerMessagesWritten>5&&latestRendererStatus!=null&&latestRendererStatus.Contains("\"listenerPlayoutMode\":\"") ){SendControl("start");started=true;}
     if(mode=="exit"&&!killed&&wall.ElapsedMilliseconds>2500){child.Kill();killed=true;}
     high=Math.Max(high,ring.Count);
     if(next==0&&ring.Count>=4)next=wall.Elapsed.TotalMilliseconds;
     if(next>0&&wall.Elapsed.TotalMilliseconds>=next){if(wall.Elapsed.TotalMilliseconds-next>512.0/48)missed++;fixed(float* target=pcm){ring.Fill(target,512,.08f);}next+=512.0/48;
      for(int i=0;i<512;i++){if(wall.ElapsedMilliseconds>1500&&wall.ElapsedMilliseconds<2100){leftA+=pcm[i*2]*pcm[i*2];rightA+=pcm[i*2+1]*pcm[i*2+1];}if(wall.ElapsedMilliseconds>3000&&wall.ElapsedMilliseconds<3600){leftB+=pcm[i*2]*pcm[i*2];rightB+=pcm[i*2+1]*pcm[i*2+1];}}
     }
     int credits=ring.TakeCredits();if(credits>0&&!producerEnded)Send("{\"type\":\"credit\",\"blocks\":"+credits+"}");Thread.Sleep(0);
    }
   }catch(Exception e){producerError=e.GetType().Name;}
   finally{
    stop=true;if(pipe!=null&&!pipe.StopAndWait(1000))RecordFailure("listener-shutdown","Listener worker did not stop");SendControl("stop");if(child!=null&&!child.WaitForExit(2500)){child.Kill();child.WaitForExit(2000);RecordFailure("producer-shutdown","Bounded child shutdown required termination");}
    lock(inputLock)inputStop=true;inputSignal.Set();
    bool writerStopped=inputWriter==null||inputWriter.Join(1000);
    if(!writerStopped)RecordFailure("control-writer-shutdown","Control writer did not stop");
    // The custom UTF-8 writer leaves Process.StandardInput open. Its final
    // flush must finish before the process-owned stream is closed.
    if(child!=null&&writerStopped)try{child.StandardInput.Close();}catch(Exception e){RecordFailure("producer-stdin-close",e.Message,e);}
    if(reader!=null)reader.Join(1000);if(stderr!=null)stderr.Join(1000);
   }
   double a=(rightA-leftA)/Math.Max(1e-30,rightA+leftA),b=(rightB-leftB)/Math.Max(1e-30,rightB+leftB);
   var result=new {mode=mode,deviceConstructed=false,started=started,error=producerError,accepted=pipe.Accepted,connections=pipe.Connections,terminal=pipe.Diagnostic,forwarded=listenerMessagesWritten,receipts=listenerReceipts,receivedBlocks=receivedBlocks,rejectedBlocks=rejectedBlocks,underflowFrames=ring.UnderflowFrames,peak=ring.Peak,energy=ring.SumSquares,ringHigh=high,controlQueueHigh=controlQueueHigh,maxWriteMs=maximumControlWriteMs,cpuSeconds=(Process.GetCurrentProcess().TotalProcessorTime-cpuStart).TotalSeconds,missedSinkBudgets=missed,initialCredits=4,ringSlots=PcmRing.Slots,finalOwnedFrame=ring.ConsumedFrames,balanceBefore=a,balanceAfter=b,energyBefore=leftA+rightA,energyAfter=leftB+rightB,wallMs=wall.Elapsed.TotalMilliseconds,producerExited=child.HasExited,writerExited=!inputWriter.IsAlive,readerExited=!reader.IsAlive,diagnosticExited=!stderr.IsAlive};
   WriteNew(Path.Combine(directory,"result.json"),json.Serialize(result));WriteNew(Path.Combine(directory,"node.txt"),string.Join(Environment.NewLine,rendererLog.ToArray()));
   if(mode=="normal")return producerError==null&&pipe.Diagnostic.Outcome=="deliberate-stop"&&started&&ring.Peak>0&&leftA+rightA>1e-8&&leftB+rightB>1e-8&&Math.Abs(a-b)>.1?0:1;
   return producerError!=null&&child.HasExited&&!inputWriter.IsAlive&&!reader.IsAlive?0:1;
  }
 }
 internal static class HostHandoff {
  public static int Main(string[] a){
   if(a[0]=="host")return HostProgram.SilentHandoff(a[1],a[2],a[3],a[4]);
   string mode=a[3];using(var p=new StatePublisher(a[1],1,true)){
    p.Start();var clock=Stopwatch.StartNew();long n=0;while(clock.ElapsedMilliseconds<4200&&!p.Finished){var s=Protocol.Synthetic(new string('a',32),n++,clock.ElapsedMilliseconds<2300?0:Math.PI/2);if(mode=="reject"&&clock.ElapsedMilliseconds>2500)s.ObservationTicks+=Stopwatch.Frequency;p.Publish(s);while(clock.Elapsed.TotalMilliseconds<n*50&&!p.Finished)Thread.Sleep(0);}p.RequestStop();var wait=Stopwatch.StartNew();while(!p.Finished&&wait.ElapsedMilliseconds<1500)Thread.Sleep(5);
    File.WriteAllText(a[2],new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new{attempts=p.Attempts,sent=p.Sent,terminal=p.Diagnostic,firstPublished=p.FirstPublishedSequence,firstTransmitted=p.FirstTransmittedSequence}));return p.Finished?0:1;
   }
  }
 }
}
