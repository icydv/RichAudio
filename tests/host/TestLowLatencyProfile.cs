// Device-free execution of the production SPSC ring. Simulation clocks/work
// costs are explicitly authored; PCM passes through the actual native Fill.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
internal static class TestLowLatencyProfile {
 static int checks,candidateSafeFaults,rejectedFourHeavy,overloadFailures;static void Need(bool yes,string why){checks++;if(!yes)throw new Exception(why);}
 static float Marker(long f){return (float)((f%251-125)*.0005);}
 static unsafe void OriginalBaselineCases(){
  foreach(string load in new[]{"steady","jitter","heavy-35ms","overload-75ms"})foreach(int phase in new[]{0,1,5,9}){
   var a=new PcmRing();var b=new OriginalRichAudio.Beacon.Windows.PcmRing();var input=new float[1024];var x=new float[2112];var y=new float[2112];long generated=0,callbacks=0;double now=0,nextProduce=Double.PositiveInfinity;int pending=0;
   Func<long,double> cost=n=>load=="heavy-35ms"&&n%97==48?35.7461:load=="overload-75ms"&&n%97==48?75:load=="jitter"?new[]{2.1,2.8,5.1,7.9,1.8}[(int)(n%5)]:2.8436;
   Action produce=delegate{for(int i=0;i<512;i++){input[2*i]=Marker(generated+i);input[2*i+1]=-input[2*i];}Need(a.TryWrite(input,512)==b.TryWrite(input,512),"original/current admission identity");generated+=512;};
   for(int i=0;i<8;i++){now+=cost(generated/512);produce();}double start=now,nextCallback=now+phase;
   while(now-start<6000){if(nextProduce<nextCallback){now=nextProduce;produce();pending--;nextProduce=pending>0?now+cost(generated/512):Double.PositiveInfinity;continue;}
    now=nextCallback;int frames=callbacks++==0?1056:480;fixed(float* p=x)fixed(float* q=y)Need(a.FillCalibrated(p,frames,1)==b.FillCalibrated(q,frames,1),"original/current supplied frame identity");
    bool exact=true;for(int i=0;i<frames*2;i++)if(x[i]!=y[i])exact=false;Need(exact,"original d9fdc90 ring/current baseline PCM byte identity at every callback");
    int credits=a.TakeCredits();Need(credits==b.TakeCredits()&&a.BufferedFrames==b.BufferedFrames&&a.Count==b.Count&&a.UnderflowFrames==b.UnderflowFrames&&a.FirstUnderflowFrame==b.FirstUnderflowFrame,"original/current queue, credit and fault identity");if(credits>0){pending+=credits;if(Double.IsPositiveInfinity(nextProduce))nextProduce=now+2+cost(generated/512);}
    bool af=false,bf=false;try{a.RequireContinuousProducer();}catch(InvalidOperationException){af=true;}try{b.RequireContinuousProducer();}catch(InvalidOperationException){bf=true;}Need(af==bf,"original/current fatal-starvation identity");if(af)break;nextCallback=start+phase+callbacks*10;
   }
  }
 }
 static object Stats(List<double>a){if(a.Count==0)return null;a.Sort();Func<double,double> q=p=>{double n=(a.Count-1)*p;int i=(int)n,j=(int)Math.Ceiling(n);return a[i]+(a[j]-a[i])*(n-i);};return new{count=a.Count,median=q(.5),p95=q(.95),p99=q(.99),maximum=a[a.Count-1],minimum=a[0]};}
 static unsafe object Run(int blocks,string load,int phase){
  var ring=new PcmRing(blocks);var input=new float[1024];var output=new float[2112];long generated=0,consumed=0;var admitted=new Dictionary<long,double>();var residency=new List<double>();var depth=new List<double>();var costs=new List<double>();int pending=0,misses=0;double now=0,nextProduce=Double.PositiveInfinity;long callbacks=0;bool exact=true;
  Func<long,double> cost=n=>load=="heavy-35ms"&&n%97==48?35.7461:load=="overload-75ms"&&n%97==48?75:load=="jitter"?new[]{2.1,2.8,5.1,7.9,1.8}[(int)(n%5)]:2.8436;
  Action produce=delegate{long index=generated/512;for(int i=0;i<512;i++){input[i*2]=Marker(generated+i);input[i*2+1]=-input[i*2];}Need(ring.TryWrite(input,512),"credit-limited producer never overfills physical ring");admitted.Add(generated,now);double c=cost(index);costs.Add(c);if(c>512d/48)misses++;generated+=512;};
  // Cold production is included in the start delay, not counted as underflow.
  for(int i=0;i<blocks;i++){now+=cost(generated/512);produce();}
  double started=now,nextCallback=now+phase;bool starved=false;long firstUnderflow=-1;
  while(now-started<6000){
   if(nextProduce<nextCallback){now=nextProduce;produce();pending--;nextProduce=pending>0?now+cost(generated/512):Double.PositiveInfinity;continue;}
   now=nextCallback;int frames=callbacks==0?1056:480;depth.Add(ring.BufferedFrames/48d);
   long begin=consumed;fixed(float* ptr=output)ring.FillCalibrated(ptr,frames,1);
   for(int i=0;i<frames;i++){float expected=Marker(consumed+i);if(output[2*i]!=expected||output[2*i+1]!=-expected)exact=false;}
   consumed+=frames;callbacks++;int credits=ring.TakeCredits();if(credits>0){pending+=credits;if(Double.IsPositiveInfinity(nextProduce))nextProduce=now+2+cost(generated/512);}
   // First overlap of a producer block with a submitted callback. This is an
   // authored submission clock, never a speaker/presentation timestamp.
   for(long f=begin/512*512;f<consumed;f+=512)if(admitted.ContainsKey(f)){residency.Add(now-admitted[f]);admitted.Remove(f);}
   try{ring.RequireContinuousProducer();}catch(InvalidOperationException){starved=true;firstUnderflow=ring.FirstUnderflowFrame;break;}
   nextCallback=started+phase+callbacks*10;
  }
  Need(starved||exact,"every successfully submitted sample remains bit-exact");Need(!starved||ring.UnderflowFrames>0&&firstUnderflow>=0,"starvation remains fatal and visible; no resume");
  if(blocks==6&&load!="overload-75ms"&&starved)candidateSafeFaults++;if(blocks==4&&load=="heavy-35ms"&&starved)rejectedFourHeavy++;if(load=="overload-75ms"&&starved)overloadFailures++;
  return new{blocks,load,callbackPhaseMs=phase,startupReserveMs=blocks*512d/48,authoredColdPrefillMs=started,authoredControlDispatchMs=2,authoredDurationMs=now-started,callbacks,generatedFrames=generated,submittedFrames=ring.ConsumedFrames,underflowFrames=ring.UnderflowFrames,starved,firstUnderflowFrame=firstUnderflow,bitExactBeforeFault=!starved&&exact,authoredDeadlineMisses=misses,authoredProcessingMs=Stats(costs),authoredRingFirstOverlapResidenceMs=Stats(residency),authoredRingDepthMs=Stats(depth),physicalRingBytes=PcmRing.Slots*512*8,clockDomain="authored-discrete-event-ms; actual production ring PCM",physicalLatencyMeasured=false};
 }
 public static unsafe int Main(){try{
  var baseline=GameplayLatencyProfile.Resolve(null);var candidate=GameplayLatencyProfile.Resolve("low-latency-01");Need(baseline.Id=="baseline"&&baseline.ProducerBlocks==8&&baseline.ControlDelayMilliseconds==100,"default profile preserves original settings");Need(candidate.StartupBlocks==8&&candidate.ProducerBlocks==6&&candidate.ControlDelayMilliseconds==75,"candidate preserves eight-block reserve after actual cold-start six-block failure");bool bad=false;try{GameplayLatencyProfile.Resolve("unknown");}catch(ArgumentException){bad=true;}Need(bad,"unknown profile rejected");
  var window=new GameplayCreditWindow(candidate);Need(window.Return(2)==2&&window.Retired==0,"cold startup credits are preserved");window.SourcePrepared=true;Need(window.Return(1)==0&&window.Return(2)==1&&window.Retired==2,"exactly two credits retired after genuine prepared-source gate");Need(window.Return(8)==8,"fixed one-way steady window never retires more credits");var baselineWindow=new GameplayCreditWindow(baseline);baselineWindow.SourcePrepared=true;Need(baselineWindow.Return(8)==8&&baselineWindow.Retired==0,"baseline credit path unchanged");
  var a=new PcmRing();var b=new PcmRing(8);var pcm=new float[1024];for(int i=0;i<1024;i++)pcm[i]=(float)Math.Sin(i*.01)*.1f;Need(a.TryWrite(pcm,512)&&b.TryWrite(pcm,512),"both legacy default routes admit same block");var x=new float[1024];var y=new float[1024];fixed(float* p=x)fixed(float* q=y){a.FillCalibrated(p,512,1);b.FillCalibrated(q,512,1);}for(int i=0;i<x.Length;i++)Need(x[i]==y[i],"default constructor PCM bit identity");
  OriginalBaselineCases();var results=new List<object>();foreach(int count in new[]{4,5,6,8})foreach(string load in new[]{"steady","jitter","heavy-35ms","overload-75ms"})foreach(int phase in new[]{0,1,5,9})results.Add(Run(count,load,phase));
  Need(candidateSafeFaults==0,"six-block candidate sustains every declared supported authored case");Need(rejectedFourHeavy==4,"four-block failure is reproduced at every tested callback phase");Need(overloadFailures==16,"all four profiles expose unsupported75ms stalls rather than concealing them");
  Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=4194304}.Serialize(new{passed=true,checks,originalBaselineScenarios=16,originalRingCommit="d9fdc90",originalBaselineExactPcmCreditsFaults=true,scenarios=results,endpointOpened=false,gameStarted=false,scope="Authored scheduler/cost scenarios through actual C# ring; no device, source synthesis or live performance claim"}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
