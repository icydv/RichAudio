using System;
using System.Threading;

namespace RichAudio.Beacon.Windows {
 // A stream-position model, not a microphone/speaker measurement. Only the
 // output thread publishes/maps. No event reads a future device-clock sample.
 public struct Latency03ClockSample {
  public long BeforeQpc,AfterQpc,RawQpc100ns,SubmittedFrames,PaddingBeforeQpc,PaddingAfterQpc;public ulong DevicePosition,RawQpcReturned100ns;
  public uint PaddingFrames;public int HResult,UncertaintyFrames,Accepted;
  // Numeric bounded diagnostics. Values describe the selected admission model;
  // they are not a calibrated driver/speaker error bound.
  public int ClockModel,RejectionReason,Advancing,MaximumBracketFrames,MaximumAnchorGapMilliseconds,MinimumAdvancingSamples;
  public long PairGapQpc,LastPositionAdvanceAgeQpc,PreviousBeforeQpc,PreviousAfterQpc,PreviousRawQpc100ns;
  public double PairDeviceSeconds,PairQpcSeconds,PairResidualSeconds,LegacyPairBudgetSeconds,FrameLowerBound,FrameUpperBound,FrameSpan;
  public double RateWindowDeviceSeconds,RateWindowQpcSeconds,RateResidualFrames,RateBudgetFrames;
 }
 public struct Latency031ClockBounds {
  public readonly int MaximumBracketFrames,MaximumAnchorGapMilliseconds,MaximumRateResidualFrames,MinimumAdvancingSamples;
  public Latency031ClockBounds(int bracketFrames,int anchorGapMilliseconds,int rateResidualFrames,int advancingSamples){MaximumBracketFrames=bracketFrames;MaximumAnchorGapMilliseconds=anchorGapMilliseconds;MaximumRateResidualFrames=rateResidualFrames;MinimumAdvancingSamples=advancingSamples;}
 }
 public sealed class Latency03PresentationClock : ITransientFrameClock,ITransientFrameIntervalDiagnostics {
  const int Capacity=128;readonly Latency03ClockSample[] samples=new Latency03ClockSample[Capacity];
  readonly ulong deviceFrequency;readonly long startQpc;int count,next,ready,failure,lastUncertainty;long qualified;
  readonly bool conservativeIntervals031;readonly Latency031ClockBounds bounds;int advancingCount;long lastAdvanceQpc;
  bool observationSeen031;long lastObservationBefore031,lastObservationAfter031,lastObservationRaw031;ulong lastObservationPosition031;
  long mappingLower=-1,mappingUpper=-1,mappingLeftRaw=-1,mappingRightRaw=-1;int mappingExtra,mappingReason;
  public long Frequency {get;private set;}public bool MapOnConsumer {get{return true;}}
  public ulong DeviceFrequency {get{return deviceFrequency;}}public long StartQpc {get{return startQpc;}}
  public bool ConservativeIntervals031 {get{return conservativeIntervals031;}}public Latency031ClockBounds Bounds031 {get{return bounds;}}
  public long LastMappingLowerFrame {get{return mappingLower;}}public long LastMappingUpperFrame {get{return mappingUpper;}}
  public long LastMappingLeftRawQpc100ns {get{return mappingLeftRaw;}}public long LastMappingRightRawQpc100ns {get{return mappingRightRaw;}}
  public int LastMappingExtraUncertaintyFrames {get{return mappingExtra;}}public int LastMappingReason {get{return mappingReason;}}
  public long QualifiedQpc {get{return Interlocked.Read(ref qualified);}}public int MappingUncertaintyFrames {get{return lastUncertainty;}}
  public bool IsReady {get{return Thread.VolatileRead(ref ready)==1&&Thread.VolatileRead(ref failure)==0;}}
  public int Failure {get{return Thread.VolatileRead(ref failure);}}public long SamplesAccepted,SamplesRepeated,SamplesRejected,Mappings,AwaitingBracket,Unavailable;
  public Latency03PresentationClock(ulong frequency,long qpcFrequency,long streamStartQpc){
   if(frequency<1||frequency>1000000000000UL||qpcFrequency<1||qpcFrequency>1000000000||streamStartQpc<0||streamStartQpc>Int64.MaxValue-qpcFrequency*61||streamStartQpc/qpcFrequency>Int64.MaxValue/10000000L-61)throw new ArgumentException("Explicit device/QPC frequencies and stream start required");
   deviceFrequency=frequency;Frequency=qpcFrequency;startQpc=streamStartQpc;
  }
  // Explicit opt-in only. The legacy three-argument constructor and its exact
  // original point-interpolation behavior remain the reproducible baseline.
  public Latency03PresentationClock(ulong frequency,long qpcFrequency,long streamStartQpc,Latency031ClockBounds admission):this(frequency,qpcFrequency,streamStartQpc){
   if(admission.MaximumBracketFrames<1||admission.MaximumBracketFrames>4800||admission.MaximumAnchorGapMilliseconds<1||admission.MaximumAnchorGapMilliseconds>100||admission.MaximumRateResidualFrames<1||admission.MaximumRateResidualFrames>4800||admission.MinimumAdvancingSamples<3||admission.MinimumAdvancingSamples>16)throw new ArgumentException("Explicit bounded observed-interval admission policy required");
   conservativeIntervals031=true;bounds=admission;
  }
  static long To100ns(long ticks,long frequency){return checked(ticks/frequency*10000000L+(ticks%frequency)*10000000L/frequency);}
  static long To100nsCeiling(long ticks,long frequency){long floor=To100ns(ticks,frequency);return floor+((ticks%frequency)*10000000L%frequency==0?0:1);}
  int Reject(int reason){Thread.VolatileWrite(ref failure,reason);Thread.VolatileWrite(ref ready,0);SamplesRejected++;return -1;}
  // S_FALSE is retained as a warning/failure, never retried to fit a result.
  // The 2ms call and100ms age limits are experiment gates, not endpoint facts.
  // Pair consistency is bounded by the actual query/quantization brackets.
  public int Observe(ref Latency03ClockSample sample){
   sample.ClockModel=conservativeIntervals031?31:30;sample.RejectionReason=0;sample.Accepted=0;sample.Advancing=0;
   int result=conservativeIntervals031?ObserveIntervals031(ref sample):ObserveLegacy(ref sample);
   if(result<0){sample.Accepted=0;sample.RejectionReason=failure;}return result;
  }
  int ObserveLegacy(ref Latency03ClockSample sample){
   if(failure!=0)return -1;
   if(sample.HResult!=0||sample.BeforeQpc<startQpc||sample.AfterQpc<sample.BeforeQpc||sample.AfterQpc-startQpc>Frequency*60||sample.AfterQpc-sample.BeforeQpc>Frequency/500||sample.RawQpc100ns<0||
      sample.RawQpc100ns>To100ns(sample.AfterQpc,Frequency)+1||To100ns(sample.AfterQpc,Frequency)-sample.RawQpc100ns>1000000L||sample.SubmittedFrames<0||sample.DevicePosition/(double)deviceFrequency>60)return Reject(1);
   double frame=sample.DevicePosition*48000d/deviceFrequency;
   if(frame>sample.SubmittedFrames+1.000001)return Reject(2); // stream advanced beyond all successfully committed PCM
   sample.UncertaintyFrames=(int)Math.Ceiling((sample.AfterQpc-sample.BeforeQpc)*48000d/Frequency+2*48000d/deviceFrequency+2*48000d/Frequency);
   if(count>0){var previous=samples[(next+Capacity-1)%Capacity];
    if(sample.DevicePosition<previous.DevicePosition||sample.RawQpc100ns<previous.RawQpc100ns)return Reject(3);
    if(ready!=0&&sample.AfterQpc-previous.AfterQpc>Frequency/10)return Reject(5);
    if(sample.RawQpc100ns==previous.RawQpc100ns||sample.DevicePosition==previous.DevicePosition){SamplesRepeated++;sample.Accepted=0;return ready;}
    double elapsed=(sample.RawQpc100ns-previous.RawQpc100ns)/10000000d,deviceElapsed=(sample.DevicePosition-previous.DevicePosition)/(double)deviceFrequency;
    double observedBracket=(previous.UncertaintyFrames+sample.UncertaintyFrames)/48000d+2d/Frequency;
    sample.PairDeviceSeconds=deviceElapsed;sample.PairQpcSeconds=elapsed;sample.PairResidualSeconds=Math.Abs(deviceElapsed-elapsed);sample.LegacyPairBudgetSeconds=observedBracket;
    if(Math.Abs(deviceElapsed-elapsed)>observedBracket)return Reject(4);
   }
   if(sample.DevicePosition==0){sample.Accepted=0;return 0;} // startup can legitimately have an initially frozen zero clock
   sample.Accepted=1;samples[next]=sample;next=(next+1)%Capacity;if(count<Capacity)count++;SamplesAccepted++;
   if(count>=2){Interlocked.Exchange(ref qualified,sample.AfterQpc);Thread.VolatileWrite(ref ready,1);}return ready;
  }
  // GetFrequency is nominal and does not promise equality to QPC at query-call
  // precision. Model31 therefore does NOT interpolate a point between anchors.
  // Its correctness uses only arrived correlated timestamps and monotonic
  // observed positions. Width/gap/rate checks are explicit service-admission
  // limits, not claims about hardware resolution or clock accuracy.
  int ObserveIntervals031(ref Latency03ClockSample sample){
   if(failure!=0)return -1;
   sample.MaximumBracketFrames=bounds.MaximumBracketFrames;sample.MaximumAnchorGapMilliseconds=bounds.MaximumAnchorGapMilliseconds;sample.MinimumAdvancingSamples=bounds.MinimumAdvancingSamples;
   long quantum=10000000L%Frequency==0?0:1;
   if(sample.HResult!=0||sample.BeforeQpc<startQpc||sample.AfterQpc<sample.BeforeQpc||sample.AfterQpc-startQpc>Frequency*60||sample.AfterQpc-sample.BeforeQpc>Frequency/500||sample.RawQpc100ns<0||sample.SubmittedFrames<0||sample.DevicePosition/(double)deviceFrequency>60||
      sample.RawQpc100ns<To100ns(sample.BeforeQpc,Frequency)-quantum||sample.RawQpc100ns>To100nsCeiling(sample.AfterQpc,Frequency)+quantum)return Reject(1);
   double position=sample.DevicePosition*48000d/deviceFrequency;
   if(position>sample.SubmittedFrames+1.000001)return Reject(2);
   sample.PreviousBeforeQpc=lastObservationBefore031;sample.PreviousAfterQpc=lastObservationAfter031;sample.PreviousRawQpc100ns=lastObservationRaw031;
   // Chronology covers every valid query, including startup zero positions and
   // duplicate observations that do not become advancing interpolation anchors.
   // This clock has one output-thread owner, so sequential calls cannot overlap.
   if(observationSeen031&&(sample.BeforeQpc<lastObservationAfter031||sample.AfterQpc<lastObservationAfter031||sample.RawQpc100ns<lastObservationRaw031||sample.DevicePosition<lastObservationPosition031||sample.RawQpc100ns==lastObservationRaw031&&sample.DevicePosition!=lastObservationPosition031))return Reject(3);
   observationSeen031=true;lastObservationBefore031=sample.BeforeQpc;lastObservationAfter031=sample.AfterQpc;lastObservationRaw031=sample.RawQpc100ns;lastObservationPosition031=sample.DevicePosition;
   sample.UncertaintyFrames=(int)Math.Ceiling((sample.AfterQpc-sample.BeforeQpc)*48000d/Frequency+2*48000d/deviceFrequency+2*48000d/Frequency);
   if(sample.UncertaintyFrames>bounds.MaximumBracketFrames)return Reject(8);
   if(count==0){
    if(sample.DevicePosition==0){sample.Accepted=0;if(sample.AfterQpc-startQpc>Frequency/10)return Reject(9);return 0;}
    advancingCount=1;lastAdvanceQpc=sample.AfterQpc;sample.Advancing=1;
   }else{
    var previous=samples[(next+Capacity-1)%Capacity];
    if(sample.DevicePosition<previous.DevicePosition||sample.RawQpc100ns<previous.RawQpc100ns||sample.RawQpc100ns==previous.RawQpc100ns&&sample.DevicePosition!=previous.DevicePosition)return Reject(3);
    sample.PairGapQpc=sample.AfterQpc-previous.AfterQpc;sample.LastPositionAdvanceAgeQpc=sample.AfterQpc-lastAdvanceQpc;
    if(sample.PairGapQpc>Frequency*bounds.MaximumAnchorGapMilliseconds/1000||sample.RawQpc100ns-previous.RawQpc100ns>bounds.MaximumAnchorGapMilliseconds*10000L)return Reject(5);
    if(sample.DevicePosition==previous.DevicePosition){SamplesRepeated++;if(sample.LastPositionAdvanceAgeQpc>Frequency*bounds.MaximumAnchorGapMilliseconds/1000)return Reject(9);}
    else{lastAdvanceQpc=sample.AfterQpc;advancingCount++;sample.Advancing=1;}
    if(sample.RawQpc100ns==previous.RawQpc100ns){sample.Accepted=0;return ready;}
    sample.PairDeviceSeconds=(sample.DevicePosition-previous.DevicePosition)/(double)deviceFrequency;sample.PairQpcSeconds=(sample.RawQpc100ns-previous.RawQpc100ns)/10000000d;sample.PairResidualSeconds=Math.Abs(sample.PairDeviceSeconds-sample.PairQpcSeconds);sample.LegacyPairBudgetSeconds=(previous.UncertaintyFrames+sample.UncertaintyFrames)/48000d+2d/Frequency;
    sample.FrameLowerBound=Math.Max(0,Math.Floor(previous.DevicePosition*48000d/deviceFrequency)-previous.UncertaintyFrames);sample.FrameUpperBound=Math.Ceiling(position)+sample.UncertaintyFrames;sample.FrameSpan=sample.FrameUpperBound-sample.FrameLowerBound;
    if(sample.FrameSpan>bounds.MaximumBracketFrames)return Reject(8);
    var oldest=samples[(next+Capacity-count)%Capacity];sample.RateWindowDeviceSeconds=(sample.DevicePosition-oldest.DevicePosition)/(double)deviceFrequency;sample.RateWindowQpcSeconds=(sample.RawQpc100ns-oldest.RawQpc100ns)/10000000d;sample.RateResidualFrames=Math.Abs(sample.RateWindowDeviceSeconds-sample.RateWindowQpcSeconds)*48000d;sample.RateBudgetFrames=bounds.MaximumRateResidualFrames+oldest.UncertaintyFrames+sample.UncertaintyFrames;
    if(sample.RateResidualFrames>sample.RateBudgetFrames)return Reject(10);
   }
   sample.Accepted=1;samples[next]=sample;next=(next+1)%Capacity;if(count<Capacity)count++;SamplesAccepted++;
   if(advancingCount>=bounds.MinimumAdvancingSamples){Interlocked.Exchange(ref qualified,sample.AfterQpc);Thread.VolatileWrite(ref ready,1);}return ready;
  }
  public int MapLatest(long ticks,int extraUncertainty,out long frame){
   return conservativeIntervals031?MapIntervals031(ticks,extraUncertainty,out frame):MapLegacy(ticks,extraUncertainty,out frame);
  }
  int MapLegacy(long ticks,int extraUncertainty,out long frame){
   frame=0;lastUncertainty=0;if(failure!=0||ticks<startQpc||ticks-startQpc>Frequency*60||extraUncertainty<0||extraUncertainty>4800){Unavailable++;return -1;}
   if(!IsReady){AwaitingBracket++;return 0;}
   long q=To100ns(ticks,Frequency);var newest=samples[(next+Capacity-1)%Capacity];
   if(q>newest.RawQpc100ns){AwaitingBracket++;return 0;}
   int first=(next+Capacity-count)%Capacity;var left=samples[first];
   if(q<left.RawQpc100ns){Unavailable++;return -1;}
   for(int i=1;i<count;i++){var right=samples[(first+i)%Capacity];if(q>right.RawQpc100ns){left=right;continue;}
    double u=(q-left.RawQpc100ns)/(double)(right.RawQpc100ns-left.RawQpc100ns),position=left.DevicePosition+(right.DevicePosition-left.DevicePosition)*u;
    lastUncertainty=Math.Max(left.UncertaintyFrames,right.UncertaintyFrames)+extraUncertainty;
    double mapped=position*48000d/deviceFrequency+lastUncertainty;
    if(mapped<0||mapped>48000*61){Unavailable++;return -1;}frame=(long)Math.Ceiling(mapped);Mappings++;return 1;
   }
   Unavailable++;return -1;
  }
  int MapIntervals031(long ticks,int extraUncertainty,out long frame){
   frame=0;lastUncertainty=0;mappingLower=mappingUpper=mappingLeftRaw=mappingRightRaw=-1;mappingExtra=extraUncertainty;mappingReason=0;
   if(failure!=0||ticks<startQpc||ticks-startQpc>Frequency*60||extraUncertainty<0||extraUncertainty>4800){mappingReason=1;Unavailable++;return -1;}
   if(!IsReady){mappingReason=2;AwaitingBracket++;return 0;}
   long lowerTime=To100ns(ticks,Frequency),upperTime=To100nsCeiling(ticks,Frequency),quantum=10000000L%Frequency==0?0:1;
   int first=(next+Capacity-count)%Capacity,rightIndex=-1;
   for(int i=0;i<count;i++)if(samples[(first+i)%Capacity].RawQpc100ns-quantum>=upperTime){rightIndex=i;break;}
   if(rightIndex<0){var latest=samples[(next+Capacity-1)%Capacity];if(ticks-latest.AfterQpc>Frequency*bounds.MaximumAnchorGapMilliseconds/1000){mappingReason=3;Unavailable++;return -1;}mappingReason=4;AwaitingBracket++;return 0;}
   int leftIndex=-1;for(int i=rightIndex-1;i>=0;i--)if(samples[(first+i)%Capacity].RawQpc100ns+quantum<=lowerTime){leftIndex=i;break;}
   if(leftIndex<0){mappingReason=5;Unavailable++;return -1;}
   var left=samples[(first+leftIndex)%Capacity];var right=samples[(first+rightIndex)%Capacity];
   mappingLeftRaw=left.RawQpc100ns;mappingRightRaw=right.RawQpc100ns;
   long lower=(long)Math.Max(0,Math.Floor(left.DevicePosition*48000d/deviceFrequency)-left.UncertaintyFrames),upper=(long)Math.Ceiling(right.DevicePosition*48000d/deviceFrequency)+right.UncertaintyFrames+extraUncertainty;
   if(right.AfterQpc-left.AfterQpc>Frequency*bounds.MaximumAnchorGapMilliseconds/1000||upper-lower>bounds.MaximumBracketFrames||upper<0||upper>48000*61){mappingReason=6;Unavailable++;return -1;}
   mappingLower=lower;mappingUpper=upper;lastUncertainty=(int)(upper-lower);frame=upper;Mappings++;return 1;
  }
 }
}
