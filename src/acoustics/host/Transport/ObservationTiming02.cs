using System;
using System.Diagnostics;
using System.Threading;
namespace RichAudio.Beacon.Transport {
 // Fixed 0.1ms histogram; lifetime counts/max, conservative upper-bound
 // percentiles (values above 100ms use the observed maximum). No sample logs.
 public sealed class TimingSeries02 {
  readonly object gate=new object();readonly long[] bins=new long[1002];long count,over;double maximum,total;
  public void Add(double milliseconds){if(!Protocol.Finite(milliseconds)||milliseconds<0)return;lock(gate){count++;if(milliseconds>10)over++;maximum=Math.Max(maximum,milliseconds);total+=milliseconds;bins[(int)Math.Min(1001,Math.Ceiling(milliseconds*10))]++;}}
  public long Count {get{lock(gate)return count;}}public long Over10 {get{lock(gate)return over;}}
  public double Maximum {get{lock(gate)return maximum;}}
  static double Percentile(long[] b,long n,double p,double max){long target=(long)Math.Ceiling(n*p),sum=0;if(n==0)return 0;for(int i=0;i<b.Length;i++){sum+=b[i];if(sum>=target)return i==1001?max:Math.Min(max,i/10d);}return max;}
  public object Snapshot(){long[] b;long n,o;double max,t;lock(gate){b=(long[])bins.Clone();n=count;o=over;max=maximum;t=total;}return new{count=n,over10ms=o,percentOver10ms=n==0?0:o*100d/n,meanMs=n==0?0:t/n,p50Ms=Percentile(b,n,.5,max),p95Ms=Percentile(b,n,.95,max),p99Ms=Percentile(b,n,.99,max),maxMs=max,quantileUpperBoundResolutionMs=.1,scope="lifetime"};}
 }
 public sealed class ObservationTiming02 {
  public readonly TimingSeries02 Batch=new TimingSeries02(),Enumeration=new TimingSeries02(),CameraListener=new TimingSeries02(),VehicleGetters=new TimingSeries02(),Conversion=new TimingSeries02(),Tick=new TimingSeries02(),ScheduleDelay=new TimingSeries02();
  readonly Func<long> clock;long missed,batches,observations,maximumCount,allocationBatches,allocationBytes,maximumAllocation,lastCount,lastAllocation;readonly long[] countHistogram=new long[65];
  static readonly Func<long> allocated=AllocationReader();
  public ObservationTiming02(Func<long> clock=null){this.clock=clock??Stopwatch.GetTimestamp;}
  static Func<long> AllocationReader(){var method=typeof(GC).GetMethod("GetAllocatedBytesForCurrentThread",Type.EmptyTypes);return method==null?null:(Func<long>)Delegate.CreateDelegate(typeof(Func<long>),method);}
  public static long AllocationStart(){return allocated==null?-1:allocated();}
  public long Now(){return clock();}public static double Ms(long ticks){return ticks*1000d/Stopwatch.Frequency;}
  public long MissedIntervals {get{return Interlocked.Read(ref missed);}}
  public long Due(long now,long previous,long period){if(previous>0){long delay=Math.Max(0,now-previous);ScheduleDelay.Add(Ms(delay));Interlocked.Add(ref missed,delay/period);}return now+period;}
  public long FinishBatch(long began,int count,long allocationStart){long ended=clock();Batch.Add(Ms(ended-began));Interlocked.Increment(ref batches);Interlocked.Add(ref observations,count);Interlocked.Exchange(ref lastCount,count);Interlocked.Increment(ref countHistogram[Math.Min(64,count)]);maximumCount=Math.Max(maximumCount,count);if(allocationStart>=0){long bytes=allocated()-allocationStart;Interlocked.Exchange(ref lastAllocation,bytes);Interlocked.Increment(ref allocationBatches);Interlocked.Add(ref allocationBytes,bytes);maximumAllocation=Math.Max(maximumAllocation,bytes);}return ended;}
  public object Snapshot(){var counts=new long[65];for(int i=0;i<counts.Length;i++)counts[i]=Interlocked.Read(ref countHistogram[i]);return new{clock="Stopwatch-QPC elapsed time; includes descheduling inside measured spans",frequency=Stopwatch.Frequency,batch=Batch.Snapshot(),enumeration=Enumeration.Snapshot(),cameraListener=CameraListener.Snapshot(),vehicleGetters=VehicleGetters.Snapshot(),conversionValidation=Conversion.Snapshot(),tick=Tick.Snapshot(),scheduleDelay=ScheduleDelay.Snapshot(),missedPublicationIntervals=Interlocked.Read(ref missed),batches=Interlocked.Read(ref batches),vehicleObservations=Interlocked.Read(ref observations),maximumObservationCount=Interlocked.Read(ref maximumCount),lastBatchObservationCount=Interlocked.Read(ref lastCount),observationCountHistogram=counts,allocationMeasurement=allocated==null?"unavailable on this CLR":"current callback thread only",allocationBatches=Interlocked.Read(ref allocationBatches),allocationBytes=allocated==null?(long?)null:Interlocked.Read(ref allocationBytes),maximumBatchAllocationBytes=allocated==null?(long?)null:Interlocked.Read(ref maximumAllocation),lastBatchAllocationBytes=allocated==null?(long?)null:Interlocked.Read(ref lastAllocation)};}
 }
}
