using System;
using System.Threading;

namespace RichAudio.Beacon.Windows {
 // Offline synthetic prototype only. Nothing constructs this on the live route.
 // One ingress producer, one submission consumer. Kernels are sealed before use.
 public struct PreparedTransientEvent {
  public long EventId, SourceSequence, OccurrenceLowerQpc, OccurrenceUpperQpc, AcquisitionBeforeQpc, ObservationAfterQpc, Frequency;
  public int SourceId, SourceGeneration, KernelSlot, KernelGeneration, SceneGeneration, ListenerGeneration, Priority;
  public int UncertaintyFrames, MaximumLatenessFrames;
  public ulong SessionLow,SessionHigh;
 }
 public struct TransientReceipt {
  public long EventId,ObservationAfterQpc,IngressQpc,IdealEmissionFrame,ScheduledEmissionFrame,FirstOutputFrame,SubmissionBeforeQpc,SubmissionAfterQpc;
  public long AcknowledgedFrontierAtIngress,ReservedThroughFrameAtIngress,FirstWritableFrameAtConsumer,ClockQualifiedQpc;
  public int MappingUncertaintyFrames;
  public int LatenessFrames,Status;
 }
 sealed class TransientReceiptState {
  public long EventId,ObservationAfterQpc,IngressQpc,IdealEmissionFrame,ScheduledEmissionFrame,FirstOutputFrame=-1;
  public long SubmissionBeforeQpc,SubmissionAfterQpc;
  public long AcknowledgedFrontierAtIngress,ReservedThroughFrameAtIngress,FirstWritableFrameAtConsumer,ClockQualifiedQpc;public int MappingUncertaintyFrames;
  public int LatenessFrames;public volatile int Status; //1queued,2mixed,3submitted,negative rejection/cancellation
 }
 public sealed class PreparedTransientKernel {
  internal readonly float[] Pcm;
  public readonly int Frames,FirstNonzero,LastNonzero,SourceId,SourceGeneration,SceneGeneration,ListenerGeneration,Generation;
  public readonly double DirectDelayFrames,Peak;
  public PreparedTransientKernel(float[] pcm,int frames,int first,int last,int source,int sourceGeneration,int scene,int listener,int generation,double directDelayFrames) {
   if(pcm==null||frames<1||frames>24000||pcm.Length!=frames*2||source<1||source>8||sourceGeneration<1||scene<1||listener<1||generation<1||
      Double.IsNaN(directDelayFrames)||Double.IsInfinity(directDelayFrames)||directDelayFrames<0||directDelayFrames>=frames)throw new ArgumentException("Prepared synthetic kernel bounds");
   int actualFirst=-1,actualLast=-1;double peak=0;
   for(int i=0;i<pcm.Length;i++){float x=pcm[i];if(Single.IsNaN(x)||Single.IsInfinity(x)||Math.Abs(x)>.00100001)throw new ArgumentException("Prepared synthetic kernel sample budget");peak=Math.Max(peak,Math.Abs(x));if(x!=0){if(actualFirst<0)actualFirst=i/2;actualLast=i/2;}}
   if(actualFirst!=first||actualLast!=last||first<0||last<first||first<Math.Floor(directDelayFrames)-2)throw new ArgumentException("Exact prepared onset/tail and physical sampling guard required");
   // The existing fractional interpolator can begin within one sample of its
   // analytic delay. Registration records a conservative integer sample guard.
   Pcm=(float[])pcm.Clone();Frames=frames;FirstNonzero=first;LastNonzero=last;SourceId=source;SourceGeneration=sourceGeneration;
   SceneGeneration=scene;ListenerGeneration=listener;Generation=generation;DirectDelayFrames=directDelayFrames;Peak=peak;
  }
 }
 public interface ITransientFrameClock {
  long Frequency {get;}bool MapOnConsumer {get;}long QualifiedQpc {get;}int MappingUncertaintyFrames {get;}
  //1=mapped,0=wait for a genuinely arrived device-clock bracket,-1=unavailable.
  int MapLatest(long ticks,int extraUncertainty,out long frame);
 }
 public sealed class SyntheticPresentationClock : ITransientFrameClock {
  public readonly long EpochQpc;public long Frequency {get;private set;}public readonly int UncertaintyFrames;
  public bool MapOnConsumer {get{return false;}}public long QualifiedQpc {get{return 0;}}public int MappingUncertaintyFrames {get{return UncertaintyFrames;}}
  public SyntheticPresentationClock(long epochQpc,long frequency,int uncertaintyFrames) {
   if(epochQpc<0||frequency<1||frequency>1000000000||uncertaintyFrames<0||uncertaintyFrames>4800)throw new ArgumentException("Authored presentation clock bounds");
   EpochQpc=epochQpc;Frequency=frequency;UncertaintyFrames=uncertaintyFrames;
  }
  public bool TryMapLatest(long ticks,int extraUncertainty,out long frame) {
   frame=0;long delta=ticks-EpochQpc;if(delta< -Frequency||delta>Frequency*60||extraUncertainty<0||extraUncertainty>4800)return false;
   double value=delta*48000d/Frequency+UncertaintyFrames+extraUncertainty;
   if(value<0||value>48000*61)return false;frame=(long)Math.Ceiling(value);return true;
  }
  public int MapLatest(long ticks,int extraUncertainty,out long frame){return TryMapLatest(ticks,extraUncertainty,out frame)?1:-1;}
 }
 public enum TransientBurstPolicy { LegacyPrioritySteal02=0,ProtectActiveTails03=1 }
 public sealed class PreparedTransientBus {
  public const int MaximumKernels=8,MaximumVoices=32,QueueCapacity=128,MaximumEvents=8192,MaximumCallbackFrames=2048;
  const int LaneCapacity=64;
  sealed class Lane {
   internal readonly PreparedTransientEvent[] Data=new PreparedTransientEvent[LaneCapacity];int write,read;
   internal bool Push(PreparedTransientEvent e){int w=Thread.VolatileRead(ref write);if(w-Thread.VolatileRead(ref read)>=LaneCapacity)return false;Data[w%LaneCapacity]=e;Thread.VolatileWrite(ref write,w+1);return true;}
   internal bool Pop(out PreparedTransientEvent e){int r=read;if(r>=Thread.VolatileRead(ref write)){e=default(PreparedTransientEvent);return false;}e=Data[r%LaneCapacity];Thread.VolatileWrite(ref read,r+1);return true;}
   internal int Count {get{return Thread.VolatileRead(ref write)-Thread.VolatileRead(ref read);}}
  }
  struct Voice {internal bool Active;internal PreparedTransientKernel Kernel;internal long Start,EventId;internal int Priority;}
  readonly PreparedTransientKernel[] kernels=new PreparedTransientKernel[MaximumKernels];readonly Voice[] voices=new Voice[MaximumVoices];
  readonly Lane high=new Lane(),normal=new Lane();readonly bool[] seen=new bool[MaximumEvents+1];readonly long[] lastSequence=new long[9];
  readonly TransientReceiptState[] receipts=new TransientReceiptState[MaximumEvents+1];readonly long[] firstInCallback=new long[MaximumVoices];readonly long[] lastOccurrence=new long[9];
  readonly ulong sessionLow,sessionHigh;readonly double continuousBudget;readonly TransientBurstPolicy burstPolicy;ITransientFrameClock clock;
  PreparedTransientEvent[] clockPending;int clockPendingCount,unmappedOutstanding;
  public long ClockDeferred,ClockMappingRejected;public int PeakClockPending;
  int sealedState,stopState,firstCount,admissionClosed,inFlight,callbackGate;long writeFence,lastCallbackEnd,committedFence;public long Accepted,Rejected,QueueFull,VoiceCapacityRejected,EvictedLowPriority,Expired,Invalidated,MixedCallbacks,PeakActive;
  public long CallbackFaults,Completed,MaximumCallbackWork,CallbackIterations,ProtectedTailRejections;public double MaximumMixedPeak;
  public PreparedTransientBus(ulong low,ulong high,double continuousAbsolutePeakBudget):this(low,high,continuousAbsolutePeakBudget,TransientBurstPolicy.LegacyPrioritySteal02){}
  public PreparedTransientBus(ulong low,ulong high,double continuousAbsolutePeakBudget,TransientBurstPolicy policy) {
   if((low==0&&high==0)||continuousAbsolutePeakBudget<0||continuousAbsolutePeakBudget>.95||Double.IsNaN(continuousAbsolutePeakBudget))throw new ArgumentException("Synthetic bus identity/headroom");
   if(policy!=TransientBurstPolicy.LegacyPrioritySteal02&&policy!=TransientBurstPolicy.ProtectActiveTails03)throw new ArgumentException("Explicit bounded burst policy required");
   burstPolicy=policy;sessionLow=low;sessionHigh=high;continuousBudget=continuousAbsolutePeakBudget;for(int i=0;i<receipts.Length;i++)receipts[i]=new TransientReceiptState();for(int i=0;i<lastSequence.Length;i++)lastSequence[i]=-1;
  }
  public void Register(int slot,PreparedTransientKernel kernel){if(sealedState!=0||slot<0||slot>=MaximumKernels||kernel==null||kernel.SourceId!=slot+1||kernels[slot]!=null)throw new InvalidOperationException("Prewarm each synthetic kernel once before sealing");kernels[slot]=kernel;}
  public void Seal(SyntheticPresentationClock presentationClock){SealClock(presentationClock);}
  public void SealClock(ITransientFrameClock presentationClock){if(presentationClock==null||sealedState!=0)throw new InvalidOperationException("Synthetic preparation already sealed");for(int i=0;i<kernels.Length;i++)if(kernels[i]==null)throw new InvalidOperationException("All bounded kernels must be prepared");clock=presentationClock;if(clock.MapOnConsumer)clockPending=new PreparedTransientEvent[QueueCapacity];Thread.VolatileWrite(ref sealedState,1);}
  public bool IsSyntheticFixtureOnly {get{return true;}}
  public bool KernelsPrepared {get{for(int i=0;i<kernels.Length;i++)if(kernels[i]==null)return false;return true;}}
  public bool ClockReady {get{return Thread.VolatileRead(ref sealedState)==1;}}
  public long NextUncommittedFrame {get{return Interlocked.Read(ref writeFence);}}
  public int Queued {get{return clock!=null&&clock.MapOnConsumer?Thread.VolatileRead(ref unmappedOutstanding):high.Count+normal.Count;}}
  public TransientReceipt Receipt(int eventId){if(eventId<1||eventId>MaximumEvents)throw new ArgumentOutOfRangeException("eventId");var r=receipts[eventId];return new TransientReceipt{Status=r.Status,EventId=r.EventId,ObservationAfterQpc=r.ObservationAfterQpc,IngressQpc=r.IngressQpc,IdealEmissionFrame=r.IdealEmissionFrame,ScheduledEmissionFrame=r.ScheduledEmissionFrame,FirstOutputFrame=r.FirstOutputFrame,SubmissionBeforeQpc=r.SubmissionBeforeQpc,SubmissionAfterQpc=r.SubmissionAfterQpc,LatenessFrames=r.LatenessFrames,AcknowledgedFrontierAtIngress=r.AcknowledgedFrontierAtIngress,ReservedThroughFrameAtIngress=r.ReservedThroughFrameAtIngress,FirstWritableFrameAtConsumer=r.FirstWritableFrameAtConsumer,ClockQualifiedQpc=r.ClockQualifiedQpc,MappingUncertaintyFrames=r.MappingUncertaintyFrames};}
  public bool TryAdmit(PreparedTransientEvent e,long ingressQpc) {
   if(Thread.VolatileRead(ref admissionClosed)!=0){Rejected++;return false;}Interlocked.Increment(ref inFlight);
   try{if(Thread.VolatileRead(ref admissionClosed)!=0){Rejected++;return false;}return AdmitCore(e,ingressQpc);}finally{Interlocked.Decrement(ref inFlight);}
  }
  bool AdmitCore(PreparedTransientEvent e,long ingressQpc) {
   long ideal;PreparedTransientKernel k=null;
   bool valid=Thread.VolatileRead(ref sealedState)==1&&Thread.VolatileRead(ref stopState)==0&&e.EventId>0&&e.EventId<=MaximumEvents&&e.SourceId>=1&&e.SourceId<=8&&
    e.KernelSlot==e.SourceId-1&&e.KernelSlot>=0&&e.KernelSlot<MaximumKernels&&(e.Priority==0||e.Priority==1)&&e.SessionLow==sessionLow&&e.SessionHigh==sessionHigh&&
    e.Frequency==clock.Frequency&&e.OccurrenceLowerQpc>=0&&e.OccurrenceUpperQpc>=e.OccurrenceLowerQpc&&e.ObservationAfterQpc>=e.OccurrenceUpperQpc&&
    (e.AcquisitionBeforeQpc==-1||e.AcquisitionBeforeQpc>=0&&e.AcquisitionBeforeQpc<=e.ObservationAfterQpc)&&ingressQpc>=e.ObservationAfterQpc&&
    ingressQpc-e.ObservationAfterQpc<=e.Frequency/4&&ingressQpc-e.OccurrenceUpperQpc<=e.Frequency/4&&e.OccurrenceUpperQpc-e.OccurrenceLowerQpc<=e.Frequency*2/1000&&e.MaximumLatenessFrames>=0&&e.MaximumLatenessFrames<=2400&&
    e.SourceSequence>=0&&e.SourceSequence>lastSequence[e.SourceId]&&e.OccurrenceLowerQpc>=lastOccurrence[e.SourceId]&&!seen[(int)e.EventId];
   if(valid){k=kernels[e.KernelSlot];valid=e.KernelGeneration==k.Generation&&e.SourceGeneration==k.SourceGeneration&&e.SceneGeneration==k.SceneGeneration&&e.ListenerGeneration==k.ListenerGeneration;}
   ideal=-1;if(!valid||!clock.MapOnConsumer&&clock.MapLatest(e.OccurrenceUpperQpc,e.UncertaintyFrames,out ideal)!=1){Rejected++;return false;}
   // All validation and publication occur on one priority ingress worker.
   // Late delivery never rewrites an event timestamp or truncates its onset.
   var receipt=receipts[(int)e.EventId];receipt.EventId=e.EventId;receipt.ObservationAfterQpc=e.ObservationAfterQpc;receipt.IngressQpc=ingressQpc;receipt.IdealEmissionFrame=ideal;receipt.AcknowledgedFrontierAtIngress=Interlocked.Read(ref committedFence);receipt.ReservedThroughFrameAtIngress=NextUncommittedFrame;
   seen[(int)e.EventId]=true;lastSequence[e.SourceId]=e.SourceSequence;lastOccurrence[e.SourceId]=e.OccurrenceLowerQpc;receipt.Status=1;
   if(clock.MapOnConsumer&&Interlocked.Increment(ref unmappedOutstanding)>QueueCapacity){Interlocked.Decrement(ref unmappedOutstanding);receipt.Status=-2;Rejected++;QueueFull++;return false;}
   if(!(e.Priority==0?high:normal).Push(e)){if(clock.MapOnConsumer)Interlocked.Decrement(ref unmappedOutstanding);receipt.Status=-2;Rejected++;QueueFull++;return false;}
   Accepted++;return true;
  }
  int FreeVoice(int priority) {
   int free=-1,low=-1,normalCount=0;
   for(int i=0;i<voices.Length;i++){if(!voices[i].Active){if(free<0)free=i;}else if(voices[i].Priority==1){normalCount++;if(low<0)low=i;}}
   if(priority==1&&normalCount>=MaximumVoices-8)return -1;
   if(free>=0)return free;
   if(priority==0&&low>=0){if(burstPolicy==TransientBurstPolicy.ProtectActiveTails03){ProtectedTailRejections++;return -1;}receipts[(int)voices[low].EventId].Status=-6;voices[low].Active=false;EvictedLowPriority++;return low;}
   return -1;
  }
  void AdmitOnConsumer(PreparedTransientEvent e,long frame) {
   PreparedTransientKernel k=kernels[e.KernelSlot];TransientReceiptState r=receipts[(int)e.EventId];
   if(r.IdealEmissionFrame<0){long mapped=0;int outcome=clock.QualifiedQpc-e.ObservationAfterQpc>e.Frequency/4?-1:clock.MapLatest(e.OccurrenceUpperQpc,e.UncertaintyFrames,out mapped);if(outcome==0){if(clockPendingCount<clockPending.Length){clockPending[clockPendingCount++]=e;ClockDeferred++;PeakClockPending=Math.Max(PeakClockPending,clockPendingCount);}else{r.Status=-8;ClockMappingRejected++;Interlocked.Decrement(ref unmappedOutstanding);}return;}Interlocked.Decrement(ref unmappedOutstanding);if(outcome<0){r.Status=-8;ClockMappingRejected++;return;}r.IdealEmissionFrame=mapped;r.ClockQualifiedQpc=clock.QualifiedQpc;r.MappingUncertaintyFrames=clock.MappingUncertaintyFrames;}
   r.FirstWritableFrameAtConsumer=frame;
   long conservativeGuard=Math.Max(0,(long)Math.Ceiling(k.DirectDelayFrames)-k.FirstNonzero);
   long original=r.IdealEmissionFrame+conservativeGuard,start=Math.Max(original,frame-k.FirstNonzero),late=start-original;
   if(late>e.MaximumLatenessFrames){r.Status=-3;Expired++;return;}
   int slot=FreeVoice(e.Priority);if(slot<0){r.Status=-4;VoiceCapacityRejected++;return;}
   r.ScheduledEmissionFrame=start;r.LatenessFrames=(int)late;r.Status=1;
   voices[slot].Active=true;voices[slot].Kernel=k;voices[slot].Start=start;voices[slot].EventId=e.EventId;voices[slot].Priority=e.Priority;
  }
  public unsafe bool Mix(float* output,int frames,long frameStart,float gain) {
   if(Interlocked.CompareExchange(ref callbackGate,1,0)!=0){CallbackFaults++;return false;}
   try{return MixCore(output,frames,frameStart,gain);}finally{Thread.VolatileWrite(ref callbackGate,0);}
  }
  void DiscardDescriptor(PreparedTransientEvent e,int status){receipts[(int)e.EventId].Status=status;if(clock.MapOnConsumer)Interlocked.Decrement(ref unmappedOutstanding);}
  void ClearClockPending(int status){for(int i=0;i<clockPendingCount;i++)DiscardDescriptor(clockPending[i],status);clockPendingCount=0;}
  void RetryClockPending(long frame){int count=clockPendingCount;clockPendingCount=0;for(int i=0;i<count;i++)AdmitOnConsumer(clockPending[i],frame);}
  unsafe bool MixCore(float* output,int frames,long frameStart,float gain) {
   firstCount=0;
   if(sealedState!=1||output==null||frames<0||frames>MaximumCallbackFrames||frameStart<0||frameStart!=lastCallbackEnd||Single.IsNaN(gain)||gain<0||gain>1){CallbackFaults++;return false;}
   Interlocked.Exchange(ref writeFence,frameStart+frames);lastCallbackEnd=frameStart+frames;
   if(gain==0&&Thread.VolatileRead(ref stopState)==0){for(int i=0;i<voices.Length;i++)if(voices[i].Active){receipts[(int)voices[i].EventId].Status=-7;voices[i].Active=false;}ClearClockPending(-7);PreparedTransientEvent muted;for(int i=0;i<LaneCapacity;i++)if(high.Pop(out muted))DiscardDescriptor(muted,-7);for(int i=0;i<LaneCapacity;i++)if(normal.Pop(out muted))DiscardDescriptor(muted,-7);return true;}
   if(Thread.VolatileRead(ref stopState)!=0){for(int i=0;i<voices.Length;i++)if(voices[i].Active){receipts[(int)voices[i].EventId].Status=-5;voices[i].Active=false;Invalidated++;}Invalidated+=clockPendingCount;ClearClockPending(-5);PreparedTransientEvent discard;for(int i=0;i<LaneCapacity;i++)if(high.Pop(out discard)){DiscardDescriptor(discard,-5);Invalidated++;}for(int i=0;i<LaneCapacity;i++)if(normal.Pop(out discard)){DiscardDescriptor(discard,-5);Invalidated++;}return true;}
   // Fail closed for event output, preserving the already-filled continuous PCM.
   for(int i=0;i<frames*2;i++)if(Single.IsNaN(output[i])||Single.IsInfinity(output[i])||Math.Abs(output[i])>continuousBudget+1e-6){CallbackFaults++;Thread.VolatileWrite(ref stopState,1);return false;}
   if(clock.MapOnConsumer)RetryClockPending(frameStart);
   PreparedTransientEvent e;for(int i=0;i<LaneCapacity;i++)if(high.Pop(out e))AdmitOnConsumer(e,frameStart);else break;
   for(int i=0;i<LaneCapacity;i++)if(normal.Pop(out e))AdmitOnConsumer(e,frameStart);else break;
   int active=0;
   for(int v=0;v<voices.Length;v++)if(voices[v].Active){active++;Voice voice=voices[v];PreparedTransientKernel k=voice.Kernel;
    int begin=(int)Math.Max(0,voice.Start-frameStart),end=(int)Math.Min(frames,voice.Start+k.Frames-frameStart);
    for(int f=begin;f<end;f++){int at=(int)(frameStart+f-voice.Start)*2;float l=k.Pcm[at]*gain,r=k.Pcm[at+1]*gain;output[f*2]+=l;output[f*2+1]+=r;CallbackIterations++;
     if((l!=0||r!=0)&&receipts[(int)voice.EventId].FirstOutputFrame<0){receipts[(int)voice.EventId].FirstOutputFrame=frameStart+f;receipts[(int)voice.EventId].Status=2;firstInCallback[firstCount++]=voice.EventId;}
    }
    if(frameStart+frames>=voice.Start+k.Frames){voices[v].Active=false;Completed++;}
   }
   PeakActive=Math.Max(PeakActive,active);MaximumCallbackWork=Math.Max(MaximumCallbackWork,(long)frames*active);MixedCallbacks++;
   for(int i=0;i<frames*2;i++)MaximumMixedPeak=Math.Max(MaximumMixedPeak,Math.Abs(output[i]));
   return true;
  }
  // Caller acknowledges its actual commit boundary. Tests use a fake release;
  // this method never asserts that fake acknowledgement is WASAPI or speaker proof.
  public void CommitSubmission(long beforeQpc,long afterQpc){Interlocked.Exchange(ref committedFence,lastCallbackEnd);for(int i=0;i<firstCount;i++){var r=receipts[(int)firstInCallback[i]];r.SubmissionBeforeQpc=beforeQpc;r.SubmissionAfterQpc=afterQpc;r.Status=3;}firstCount=0;}
  // Cancel is admission withdrawal/request, not completion. The control owner
  // joins ingress and consumer, then calls FinishCancellation outside callbacks.
  public void Cancel(){Thread.VolatileWrite(ref admissionClosed,1);Thread.VolatileWrite(ref stopState,1);}
  public bool FinishCancellation(int timeoutMilliseconds){if(timeoutMilliseconds<0||timeoutMilliseconds>3000)throw new ArgumentOutOfRangeException("timeoutMilliseconds");Cancel();var wait=System.Diagnostics.Stopwatch.StartNew();while(Thread.VolatileRead(ref inFlight)!=0){if(wait.ElapsedMilliseconds>=timeoutMilliseconds)return false;Thread.Sleep(1);}if(Interlocked.CompareExchange(ref callbackGate,2,0)!=0)return false;for(int i=0;i<voices.Length;i++)if(voices[i].Active){receipts[(int)voices[i].EventId].Status=-5;voices[i].Active=false;Invalidated++;}Invalidated+=clockPendingCount;ClearClockPending(-5);PreparedTransientEvent e;while(high.Pop(out e)){DiscardDescriptor(e,-5);Invalidated++;}while(normal.Pop(out e)){DiscardDescriptor(e,-5);Invalidated++;}firstCount=0;return true;}
  public bool Stopped {get{return Thread.VolatileRead(ref stopState)!=0;}}
 }
 public static class OwnedPcmSubmission {
  public static unsafe int Fill(PcmRing ring,float* output,int frames,float gain,bool calibrated,long outputFrame,PreparedTransientBus syntheticEvents) {
   long oldUnderflow=ring.UnderflowFrames;int supplied=calibrated?ring.FillCalibrated(output,frames,gain):ring.Fill(output,frames,gain);
   if(syntheticEvents!=null){if(ring.UnderflowFrames!=oldUnderflow)syntheticEvents.Cancel();syntheticEvents.Mix(output,frames,outputFrame,gain);}return supplied;
  }
 }
}
