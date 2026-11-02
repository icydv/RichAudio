using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace RichAudio.Beacon.Windows {
 public enum Latency03Failure {None,Clock,Capacity,BufferAcquire,BufferRelease,ContinuousUnderflow,EventMix,ForbiddenRecording,Deadline,Padding}
 public struct Latency03SubmissionSample {
  public long FrameStart,Frames,AcquireBeforeQpc,AcquireAfterQpc,FillBeforeQpc,FillAfterQpc,ReleaseBeforeQpc,ReleaseAfterQpc,UnderflowBefore,UnderflowAfter;
  public int AcquireHResult,ReleaseHResult;public uint PaddingFrames;public float Gain;
 }
 public struct Latency03CallbackSample {public long BeforeQpc,AfterQpc,AllocatedBytes;public uint PaddingFrames;}
 public struct Latency03PresentationEvidence {public bool Observed;public long FirstOutputFrame,LowerRawQpc100ns,UpperRawQpc100ns;public ulong LowerPosition,UpperPosition,DeviceFrequency;}
 // Construction/prewarming is offline and cannot open a device. Only the
 // explicit WasapiOutput factory's Start enters the existing CoreAudio route.
 public sealed class Latency03OutputSession {
  public const int RecordCapacity=30000;
  readonly Latency03ClockSample[] clockRows=new Latency03ClockSample[RecordCapacity];readonly Latency03SubmissionSample[] submissions=new Latency03SubmissionSample[RecordCapacity];readonly Latency03CallbackSample[] callbacks=new Latency03CallbackSample[RecordCapacity];
  int clockCount,submissionCount,callbackCount,failure,finished,joined,cleanup,startRequested,outputClaimed;long streamStartAfter;ulong deviceFrequency;
  static readonly Func<long> allocationCounter=FindAllocationCounter();
  static Func<long> FindAllocationCounter(){var method=typeof(GC).GetMethod("GetAllocatedBytesForCurrentThread",Type.EmptyTypes);return method==null?null:(Func<long>)Delegate.CreateDelegate(typeof(Func<long>),method);}
  internal static long AllocatedBytes(){return allocationCounter==null?-1:allocationCounter();}
  public readonly string EndpointId;public readonly uint RequestedPeriodFrames;public readonly int MaximumSeconds;public readonly float Gain;
  public readonly PreparedTransientBus Events;public Latency03PresentationClock Clock {get;private set;}
  public bool AudioClient3Available,PeriodCapabilitiesQueried;public uint DefaultPeriodFrames,FundamentalPeriodFrames,MinimumPeriodFrames,MaximumPeriodFrames,CurrentPeriodFrames,EndpointBufferFrames;
  public ushort CurrentFormatTag,CurrentFormatChannels;public uint CurrentFormatSampleRate;public ulong LastDevicePosition;public long LastRawQpc100ns;
  public int PeriodQueryHResult=unchecked((int)0x80004002),CurrentPeriodQueryHResult=unchecked((int)0x80004002),InitializeHResult,StopHResult,ResetHResult;public bool StopResetAttempted;
  public long StreamStartBeforeQpc,StreamStartAfterQpc,StreamStopBeforeQpc,StreamStopAfterQpc;public bool Initialized,EverStarted;
  public Latency03OutputSession(PreparedTransientBus bus,string endpointId,uint requestedPeriodFrames,int maximumSeconds,float gain){
   if(bus==null||bus.ClockReady||String.IsNullOrWhiteSpace(endpointId)||endpointId.Length>1024||requestedPeriodFrames>48000||maximumSeconds<5||maximumSeconds>45||Single.IsNaN(gain)||Single.IsInfinity(gain)||gain<=0||gain>1)throw new ArgumentException("Fresh original-synthetic bus, explicit endpoint, period, duration and gain required");
   Events=bus;EndpointId=endpointId;RequestedPeriodFrames=requestedPeriodFrames;MaximumSeconds=maximumSeconds;Gain=gain;
  }
  public Latency03Failure Failure {get{return (Latency03Failure)Thread.VolatileRead(ref failure);}}public bool IsClockReady {get{return Clock!=null&&Clock.IsReady&&failure==0;}}
  public bool OutputFinished {get{return Thread.VolatileRead(ref finished)==1;}}public bool OutputThreadJoined {get{return Thread.VolatileRead(ref joined)==1;}}public bool CleanupComplete {get{return Thread.VolatileRead(ref cleanup)==1;}}
  public bool StartRequested {get{return Thread.VolatileRead(ref startRequested)==1;}}
  public int ClockSampleCount {get{return Thread.VolatileRead(ref clockCount);}}public int SubmissionSampleCount {get{return Thread.VolatileRead(ref submissionCount);}}
  internal bool LastSubmissionCommitted {get;private set;}
  internal void Fail(Latency03Failure value){Interlocked.CompareExchange(ref failure,(int)value,0);Events.Cancel();}
  internal bool ClaimOutput(){return !Events.ClockReady&&Events.KernelsPrepared&&Interlocked.CompareExchange(ref outputClaimed,1,0)==0;}
  internal void MarkStarting(){Thread.VolatileWrite(ref startRequested,1);}
  internal void Initialize(IAudioClient client,IntPtr format){
   var extended=client as IAudioClient3Latency03;AudioClient3Available=extended!=null;
   if(extended!=null){PeriodCapabilitiesQueried=true;PeriodQueryHResult=extended.GetSharedModeEnginePeriod(format,out DefaultPeriodFrames,out FundamentalPeriodFrames,out MinimumPeriodFrames,out MaximumPeriodFrames);
    if(PeriodQueryHResult!=0||!SharedPeriodPlan.IsLegal(DefaultPeriodFrames,MinimumPeriodFrames,MaximumPeriodFrames,FundamentalPeriodFrames,DefaultPeriodFrames))throw new NotSupportedException("Shared-period capability query did not return a valid supported range; no retry");
    IntPtr current=IntPtr.Zero;try{CurrentPeriodQueryHResult=extended.GetCurrentSharedModeEnginePeriod(out current,out CurrentPeriodFrames);if(CurrentPeriodQueryHResult!=0||current==IntPtr.Zero)throw new NotSupportedException("Current shared-period query failed; no retry");var snapshot=(WaveFormat)Marshal.PtrToStructure(current,typeof(WaveFormat));CurrentFormatTag=snapshot.Tag;CurrentFormatChannels=snapshot.Channels;CurrentFormatSampleRate=snapshot.SamplesPerSecond;}finally{if(current!=IntPtr.Zero)Marshal.FreeCoTaskMem(current);}
   }
   if(RequestedPeriodFrames==0)InitializeHResult=client.Initialize(0,0x40000,200000,0,format,IntPtr.Zero);
   else {if(extended==null||!SharedPeriodPlan.IsLegal(RequestedPeriodFrames,MinimumPeriodFrames,MaximumPeriodFrames,FundamentalPeriodFrames,DefaultPeriodFrames))throw new NotSupportedException("Requested shared period is unavailable; no rounding/fallback");InitializeHResult=extended.InitializeSharedAudioStream(0x40000,RequestedPeriodFrames,format,IntPtr.Zero);}
   if(InitializeHResult!=0){Native.Check(InitializeHResult);throw new InvalidOperationException("Unexpected non-S_OK shared initialization");}Initialized=true;
  }
  internal void BindClock(ulong frequency,uint bufferFrames){if(Clock!=null||bufferFrames<1||bufferFrames>2048)throw new InvalidOperationException("One bounded endpoint clock only");deviceFrequency=frequency;EndpointBufferFrames=bufferFrames;Clock=new Latency03PresentationClock(frequency,Stopwatch.Frequency,Stopwatch.GetTimestamp());Events.SealClock(Clock);}
  internal void Started(long before,long after){StreamStartBeforeQpc=before;StreamStartAfterQpc=after;Interlocked.Exchange(ref streamStartAfter,after);EverStarted=true;}
  internal bool WithinDeadline(long now){long start=Interlocked.Read(ref streamStartAfter);if(start>0&&now-start>MaximumSeconds*Stopwatch.Frequency){Fail(Latency03Failure.Deadline);return false;}return failure==0;}
  internal bool ObserveClock(IAudioClock deviceClock,long submittedFrames,uint padding,long paddingBefore,long paddingAfter){
   if(clockCount>=clockRows.Length){Fail(Latency03Failure.Capacity);return false;}var row=new Latency03ClockSample{BeforeQpc=Stopwatch.GetTimestamp(),SubmittedFrames=submittedFrames,PaddingFrames=padding,PaddingBeforeQpc=paddingBefore,PaddingAfterQpc=paddingAfter};ulong raw;
   row.HResult=deviceClock.GetPosition(out row.DevicePosition,out raw);row.AfterQpc=Stopwatch.GetTimestamp();if(raw>Int64.MaxValue){Fail(Latency03Failure.Clock);return false;}row.RawQpc100ns=(long)raw;
   LastDevicePosition=row.DevicePosition;LastRawQpc100ns=row.RawQpc100ns;int result=Clock.Observe(ref row);clockRows[clockCount]=row;Thread.VolatileWrite(ref clockCount,clockCount+1);if(result<0){Fail(Latency03Failure.Clock);return false;}return true;
  }
  internal unsafe bool Submit(PcmRing ring,IAudioRenderClient renderer,uint frames,long outputFrame,uint padding,float gain){
   LastSubmissionCommitted=false;
   if(frames==0)return true;if(frames>2048||submissionCount>=submissions.Length||padding>EndpointBufferFrames||Single.IsNaN(gain)||gain<0||gain>1){Fail(Latency03Failure.Capacity);return false;}
   var row=new Latency03SubmissionSample{FrameStart=outputFrame,Frames=frames,PaddingFrames=padding,Gain=gain,AcquireBeforeQpc=Stopwatch.GetTimestamp()};IntPtr data;
   row.AcquireHResult=renderer.GetBuffer(frames,out data);row.AcquireAfterQpc=Stopwatch.GetTimestamp();if(row.AcquireHResult!=0||data==IntPtr.Zero){Fail(Latency03Failure.BufferAcquire);submissions[submissionCount]=row;Thread.VolatileWrite(ref submissionCount,submissionCount+1);return false;}
   row.UnderflowBefore=ring.UnderflowFrames;long faults=Events.CallbackFaults;row.FillBeforeQpc=Stopwatch.GetTimestamp();
   OwnedPcmSubmission.Fill(ring,(float*)data,(int)frames,gain,true,outputFrame,Events);row.FillAfterQpc=Stopwatch.GetTimestamp();row.UnderflowAfter=ring.UnderflowFrames;
   row.ReleaseBeforeQpc=Stopwatch.GetTimestamp();row.ReleaseHResult=renderer.ReleaseBuffer(frames,0);row.ReleaseAfterQpc=Stopwatch.GetTimestamp();
   submissions[submissionCount]=row;Thread.VolatileWrite(ref submissionCount,submissionCount+1);
   if(row.ReleaseHResult!=0){Fail(Latency03Failure.BufferRelease);return false;}LastSubmissionCommitted=true;Events.CommitSubmission(row.ReleaseBeforeQpc,row.ReleaseAfterQpc);
   if(row.UnderflowAfter!=row.UnderflowBefore){Fail(Latency03Failure.ContinuousUnderflow);return false;}if(Events.CallbackFaults!=faults||Events.Stopped){Fail(Latency03Failure.EventMix);return false;}return true;
  }
  internal void FinishOutput(int stopResult,int resetResult,long before,long after){StopHResult=stopResult;ResetHResult=resetResult;StreamStopBeforeQpc=before;StreamStopAfterQpc=after;Events.Cancel();Thread.VolatileWrite(ref finished,1);}
  internal void RecordCallback(long before,long after,long allocatedBefore,long allocatedAfter,uint padding){if(callbackCount>=callbacks.Length){Fail(Latency03Failure.Capacity);return;}callbacks[callbackCount]=new Latency03CallbackSample{BeforeQpc=before,AfterQpc=after,AllocatedBytes=allocatedBefore<0||allocatedAfter<0?-1:allocatedAfter-allocatedBefore,PaddingFrames=padding};Thread.VolatileWrite(ref callbackCount,callbackCount+1);}
  internal void MarkJoined(){Thread.VolatileWrite(ref joined,1);}
  // The control owner first closes/joins ingress and output; this is never an
  // audio callback. Admission withdrawal is distinct from completed retirement.
  public bool CompleteAfterIngressAndOutputJoin(){if(!OutputThreadJoined)return false;bool nativeComplete=!StartRequested||OutputFinished&&(!Initialized||StopResetAttempted&&StopHResult==0&&ResetHResult==0);bool complete=Events.FinishCancellation(3000)&&nativeComplete;if(complete)Thread.VolatileWrite(ref cleanup,1);return complete;}
  public Latency03ClockSample[] CopyClockSamples(){if(!OutputThreadJoined)throw new InvalidOperationException("Join output before copying diagnostics");var copy=new Latency03ClockSample[clockCount];Array.Copy(clockRows,copy,copy.Length);return copy;}
  public Latency03SubmissionSample[] CopySubmissionSamples(){if(!OutputThreadJoined)throw new InvalidOperationException("Join output before copying diagnostics");var copy=new Latency03SubmissionSample[submissionCount];Array.Copy(submissions,copy,copy.Length);return copy;}
  public Latency03CallbackSample[] CopyCallbackSamples(){if(!OutputThreadJoined)throw new InvalidOperationException("Join output before copying diagnostics");var copy=new Latency03CallbackSample[callbackCount];Array.Copy(callbacks,copy,copy.Length);return copy;}
  public Latency03PresentationEvidence PresentationEvidence(int eventId){if(!OutputThreadJoined)throw new InvalidOperationException("Join output before analysis");long frame=Events.Receipt(eventId).FirstOutputFrame;var evidence=new Latency03PresentationEvidence{FirstOutputFrame=frame,DeviceFrequency=deviceFrequency};if(frame<0)return evidence;Latency03ClockSample previous=default(Latency03ClockSample);bool have=false;for(int i=0;i<clockCount;i++){var row=clockRows[i];if(row.Accepted!=1)continue;double position=row.DevicePosition*48000d/deviceFrequency;if(have&&previous.DevicePosition*48000d/deviceFrequency<=frame&&position>=frame){evidence.Observed=true;evidence.LowerRawQpc100ns=previous.RawQpc100ns;evidence.UpperRawQpc100ns=row.RawQpc100ns;evidence.LowerPosition=previous.DevicePosition;evidence.UpperPosition=row.DevicePosition;return evidence;}previous=row;have=true;}return evidence;}
 }
}
