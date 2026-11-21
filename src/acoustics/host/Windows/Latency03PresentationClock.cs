using System;
using System.Threading;

namespace RichAudio.Beacon.Windows {
 // A stream-position model, not a microphone/speaker measurement. Only the
 // output thread publishes/maps. No event reads a future device-clock sample.
 public struct Latency03ClockSample {
  public long BeforeQpc,AfterQpc,RawQpc100ns,SubmittedFrames,PaddingBeforeQpc,PaddingAfterQpc;public ulong DevicePosition;
  public uint PaddingFrames;public int HResult,UncertaintyFrames,Accepted;
 }
 public sealed class Latency03PresentationClock : ITransientFrameClock {
  const int Capacity=128;readonly Latency03ClockSample[] samples=new Latency03ClockSample[Capacity];
  readonly ulong deviceFrequency;readonly long startQpc;int count,next,ready,failure,lastUncertainty;long qualified;
  public long Frequency {get;private set;}public bool MapOnConsumer {get{return true;}}
  public long QualifiedQpc {get{return Interlocked.Read(ref qualified);}}public int MappingUncertaintyFrames {get{return lastUncertainty;}}
  public bool IsReady {get{return Thread.VolatileRead(ref ready)==1&&Thread.VolatileRead(ref failure)==0;}}
  public int Failure {get{return Thread.VolatileRead(ref failure);}}public long SamplesAccepted,SamplesRepeated,SamplesRejected,Mappings,AwaitingBracket,Unavailable;
  public Latency03PresentationClock(ulong frequency,long qpcFrequency,long streamStartQpc){
   if(frequency<1||frequency>1000000000000UL||qpcFrequency<1||qpcFrequency>1000000000||streamStartQpc<0||streamStartQpc>Int64.MaxValue-qpcFrequency*61||streamStartQpc/qpcFrequency>Int64.MaxValue/10000000L-61)throw new ArgumentException("Explicit device/QPC frequencies and stream start required");
   deviceFrequency=frequency;Frequency=qpcFrequency;startQpc=streamStartQpc;
  }
  static long To100ns(long ticks,long frequency){return checked(ticks/frequency*10000000L+(ticks%frequency)*10000000L/frequency);}
  int Reject(int reason){Thread.VolatileWrite(ref failure,reason);Thread.VolatileWrite(ref ready,0);SamplesRejected++;return -1;}
  // S_FALSE is retained as a warning/failure, never retried to fit a result.
  // The 2ms call and100ms age limits are experiment gates, not endpoint facts.
  // Pair consistency is bounded by the actual query/quantization brackets.
  public int Observe(ref Latency03ClockSample sample){
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
    if(Math.Abs(deviceElapsed-elapsed)>observedBracket)return Reject(4);
   }
   if(sample.DevicePosition==0){sample.Accepted=0;return 0;} // startup can legitimately have an initially frozen zero clock
   sample.Accepted=1;samples[next]=sample;next=(next+1)%Capacity;if(count<Capacity)count++;SamplesAccepted++;
   if(count>=2){Interlocked.Exchange(ref qualified,sample.AfterQpc);Thread.VolatileWrite(ref ready,1);}return ready;
  }
  public int MapLatest(long ticks,int extraUncertainty,out long frame){
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
 }
}
