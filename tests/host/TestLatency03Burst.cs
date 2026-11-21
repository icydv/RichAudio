using System;using System.Collections.Generic;using System.IO;using System.Security.Cryptography;using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
internal static class TestLatency03Burst {
 const long Epoch=100000000,Frequency=10000000;
 static void Need(bool b,string s){if(!b)throw new Exception(s);}
 static PreparedTransientBus Make(bool protect){
#if ORIGINAL02
  Need(!protect,"Original snapshot has legacy policy only");var bus=new PreparedTransientBus(1,2,.95);
#else
  var bus=new PreparedTransientBus(1,2,.95,protect?TransientBurstPolicy.ProtectActiveTails03:TransientBurstPolicy.LegacyPrioritySteal02);
#endif
  for(int slot=0;slot<8;slot++){var pcm=new float[16384];for(int i=480;i<8192;i++){float x=(float)(.0007*Math.Cos((i-480)*.031)*Math.Exp(-(i-480)/2800d));pcm[i*2]=x;pcm[i*2+1]=x;}bus.Register(slot,new PreparedTransientKernel(pcm,8192,480,8191,slot+1,1,1,1,1,480));}
  bus.Seal(new SyntheticPresentationClock(Epoch,Frequency,0));return bus;
 }
 static PreparedTransientEvent Event(int id,int slot,double milliseconds,int priority){long q=Epoch+(long)(milliseconds*Frequency/1000);return new PreparedTransientEvent{EventId=id,SourceSequence=id-1,SourceId=slot+1,SourceGeneration=1,KernelSlot=slot,KernelGeneration=1,SceneGeneration=1,ListenerGeneration=1,Priority=priority,OccurrenceLowerQpc=q,OccurrenceUpperQpc=q,AcquisitionBeforeQpc=q,ObservationAfterQpc=q,Frequency=Frequency,MaximumLatenessFrames=2400,SessionLow=1,SessionHigh=2};}
 static unsafe object Run(bool protect,bool flood){
  var bus=Make(protect);var ring=new PcmRing();var input=new float[1024];var output=new float[4096];long sourceFrame=0,frame=0;int id=0;double next=13.7;var bytes=new byte[4096*4];
  Action refill=()=>{while(ring.Count<8){for(int i=0;i<512;i++){float x=(float)(.04*Math.Sin(2*Math.PI*110*sourceFrame++/48000));input[i*2]=x;input[i*2+1]=x;}Need(ring.TryWrite(input,512),"Continuous ring ownership");}};
  using(var hash=SHA256.Create())using(var pcm=new MemoryStream()){
   refill();for(int tick=0;tick<=300;tick++){
    double now=tick*10;while(next<=now&&next<2700){int group=flood?64:((int)(next/61.7)%3==0?4:1);for(int n=0;n<group;n++)Need(bus.TryAdmit(Event(++id,n%8,next,n%4==0?0:1),Epoch+(long)(now*Frequency/1000)),"Bounded descriptor admitted");next+=61.7;}
    int frames=tick==0?1056:480;fixed(float* p=output)OwnedPcmSubmission.Fill(ring,p,frames,1,true,frame,bus);bus.CommitSubmission(Epoch+(long)(now*Frequency/1000),Epoch+(long)(now*Frequency/1000));frame+=frames;ring.RequireContinuousProducer();refill();
    Buffer.BlockCopy(output,0,bytes,0,frames*8);pcm.Write(bytes,0,frames*8);
   }
   int ack=0,post=0,pending=0;for(int n=1;n<=id;n++){var r=bus.Receipt(n);if(r.SubmissionAfterQpc>0){ack++;if(r.Status<0)post++;}else if(r.Status>=0)pending++;}
   Need(ring.UnderflowFrames==0&&bus.CallbackFaults==0&&bus.MaximumMixedPeak<=.982001,"Continuous integrity and finite headroom");
#if ORIGINAL02
   long protectedRejections=0;
#else
   long protectedRejections=bus.ProtectedTailRejections;
   if(protect)Need(bus.EvictedLowPriority==0&&post==0,"Protected tails never truncated for capacity");
#endif
   Need(bus.FinishCancellation(1000)&&bus.Queued==0,"Terminal cleanup complete");return new{policy=protect?"protect-active-tails-03":"legacy-priority-steal-02",flood,events=id,acknowledged=ack,pending,postSubmissionRetirements=post,bus.EvictedLowPriority,bus.VoiceCapacityRejected,protectedRejections,bus.PeakActive,bus.MaximumMixedPeak,underflow=ring.UnderflowFrames,pcmSha256=BitConverter.ToString(hash.ComputeHash(pcm.ToArray())).Replace("-","").ToLowerInvariant(),endpointOpened=false};
  }
 }
 public static int Main(){try{var results=new List<object>{Run(false,false),Run(false,true)};
#if !ORIGINAL02
  results.Add(Run(true,false));results.Add(Run(true,true));
#endif
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,scope="Deterministic original analytic PCM; no endpoint, game or recording",results}));return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
