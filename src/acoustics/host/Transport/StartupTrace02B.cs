using System;using System.Diagnostics;using System.Runtime.InteropServices;using System.Runtime.CompilerServices;using System.Reflection;using System.Threading;
namespace RichAudio.Beacon.Transport {
 public enum ObservationStage02B {Other,Readiness,CameraPrelude,CameraCoordinate,CameraRotation,GameTime,PauseState,CameraNativeTail,CameraManaged,ListenerValidation,Interior,PlayerTrackedHandles,Discovery,HandleCandidates,VehicleGetters,SourceBookkeeping,SortingAdmission,FrameConstruction,WireValidation,EarlyReturn,Instrumentation,Count}
 public interface IObservationTraceSource02B {StartupTrace02B StartupTrace {get;set;}}
 public sealed class ObservationRecord02B {
  public long Ordinal,BeginQpc,EndQpc,PublishQpc,ClockFrequency,TraceTailTicks,ProbeWallTicks,MaximumProbeTicks,ReconciliationTicks,StageMask;
  public int ManagedThreadId;public uint NativeThreadId;public long? CpuStart100ns,CpuEnd100ns;public long CpuStartProbeBeforeQpc,CpuStartProbeAfterQpc,CpuEndProbeBeforeQpc,CpuEndProbeAfterQpc;
  public long? CameraBeforeQpc,CameraAfterQpc,CameraMidpointQpc;public int CameraCallsReturned;public bool FrameReturned;public string Outcome,Exception;
  public readonly long[] WallTicks=new long[(int)ObservationStage02B.Count],Cpu100ns=new long[(int)ObservationStage02B.Count];
  public readonly int[] GcBefore=new int[3],GcAfter=new int[3];
 }
 // One callback producer, one journal consumer. Published slots are immutable,
 // never reused. Capacity is lifetime-bounded, not an unbounded event stream.
 public sealed class StartupTrace02B {
  public const int FirstBatches=32,MaximumRecords=96,DrainLimit=8;
  readonly ObservationRecord02B work=new ObservationRecord02B();readonly ObservationRecord02B[] records=new ObservationRecord02B[MaximumRecords];
  readonly long[,] phaseTotals=new long[2,(int)ObservationStage02B.Count],phaseHistogram=new long[2,1002];readonly long[] phaseMaximum=new long[2];readonly Func<long> clock,cpu;readonly Func<uint> nativeId;
  readonly string[] names=new string[(int)ObservationStage02B.Count];long ordinal,last,cpuLast=-1,overflow,faults,coldCount,laterCount,minimumCpuIncrement;
  int published,drained,ownerThread;bool active,disabled,cpuDisabled;public long BootstrapReadyQpc,SamplerSetupBeforeQpc,SamplerSetupAfterQpc;public readonly double ManagedPreparationMs;
  [DllImport("kernel32.dll")]static extern IntPtr GetCurrentThread();
  [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]static extern bool GetThreadTimes(IntPtr thread,out long creation,out long exit,out long kernel,out long user);
  static long ReadCpu(){long c,e,k,u;return GetThreadTimes(GetCurrentThread(),out c,out e,out k,out u)?k+u:-1;}
  public StartupTrace02B(Func<long> monotonic=null,Func<long> threadCpu=null,Func<uint> threadIdentity=null){
   clock=monotonic??Stopwatch.GetTimestamp;cpu=threadCpu??ReadCpu;nativeId=threadIdentity??GetCurrentThreadId;
   Array.Copy(Enum.GetNames(typeof(ObservationStage02B)),names,names.Length);
   for(int i=0;i<records.Length;i++)records[i]=new ObservationRecord02B();
   // Only this recorder's own non-generic managed callback methods. Preparation
   // compiles bodies without invoking them or fabricating a game observation.
   long preparation=Stopwatch.GetTimestamp();foreach(string name in new[]{"Begin","Mark","Complete","Copy","CpuDelta","Cpu","Fault"})RuntimeHelpers.PrepareMethod(typeof(StartupTrace02B).GetMethod(name,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static).MethodHandle);ManagedPreparationMs=(Stopwatch.GetTimestamp()-preparation)*1000d/Stopwatch.Frequency;
   // Prepare self-thread clock interop on the bootstrap worker, not with game
   // calls or fabricated observations. Actual callback samples start at Begin.
   try{cpu();nativeId();}catch(Exception){cpu=null;nativeId=null;}
  }
  void Fault(){Interlocked.Increment(ref faults);disabled=true;active=false;}
  long Cpu(){try{if(cpu==null||cpuDisabled)return -1;long value=cpu();if(value<0)cpuDisabled=true;return value;}catch(ThreadAbortException){throw;}catch(Exception){Interlocked.Increment(ref faults);cpuDisabled=true;return -1;}}
  void CpuDelta(int stage,long value){if(value>=0&&cpuLast>=0){long d=value-cpuLast;if(d<0){work.Cpu100ns[stage]=-1;cpuLast=value;return;}if(work.Cpu100ns[stage]>=0)work.Cpu100ns[stage]+=d;if(d>0&&(minimumCpuIncrement==0||d<minimumCpuIncrement))minimumCpuIncrement=d;}else work.Cpu100ns[stage]=-1;cpuLast=value;}
  public void Begin(long began){if(disabled)return;try{
   int id=Thread.CurrentThread.ManagedThreadId;if(ownerThread!=0&&ownerThread!=id){Fault();return;}ownerThread=id;
   Array.Clear(work.WallTicks,0,work.WallTicks.Length);Array.Clear(work.Cpu100ns,0,work.Cpu100ns.Length);
   work.Ordinal=++ordinal;work.BeginQpc=began;work.ClockFrequency=Stopwatch.Frequency;work.ManagedThreadId=id;work.NativeThreadId=nativeId==null?0:nativeId();
   work.CameraBeforeQpc=work.CameraAfterQpc=work.CameraMidpointQpc=null;work.CameraCallsReturned=0;work.ProbeWallTicks=work.MaximumProbeTicks=work.StageMask=0;
   for(int i=0;i<3;i++)work.GcBefore[i]=GC.CollectionCount(i);
   work.CpuStartProbeBeforeQpc=clock();cpuLast=Cpu();work.CpuStart100ns=cpuLast<0?(long?)null:cpuLast;work.CpuStartProbeAfterQpc=clock();
   last=work.CpuStartProbeAfterQpc;work.WallTicks[(int)ObservationStage02B.Instrumentation]=last-began;active=true;
  }catch(ThreadAbortException){throw;}catch(Exception){Fault();}}
  public void Mark(ObservationStage02B stage){if(!active)return;try{
   long before=clock();work.StageMask|=1L<<(int)stage;work.WallTicks[(int)stage]+=before-last;long value=Cpu();long after=clock();
   CpuDelta((int)stage,value);long probe=after-before;work.ProbeWallTicks+=probe;work.MaximumProbeTicks=Math.Max(work.MaximumProbeTicks,probe);work.WallTicks[(int)ObservationStage02B.Instrumentation]+=probe;last=after;
  }catch(ThreadAbortException){throw;}catch(Exception){Fault();}}
  public void CameraStarted(long before){if(active)work.CameraBeforeQpc=before;}
  public void CameraReturned(int bit){if(active)work.CameraCallsReturned|=bit;}
  public void CameraAcquired(long after,long midpoint){if(active){work.CameraAfterQpc=after;work.CameraMidpointQpc=midpoint;}}
  public void Complete(long ended,string outcome,bool returned,string exception){if(!active)return;try{
   work.EndQpc=ended;work.Outcome=outcome;work.FrameReturned=returned;work.Exception=exception;
   work.WallTicks[(int)ObservationStage02B.Instrumentation]+=ended-last;
   for(int i=0;i<3;i++)work.GcAfter[i]=GC.CollectionCount(i);
   work.CpuEndProbeBeforeQpc=clock();long value=Cpu();work.CpuEndProbeAfterQpc=clock();CpuDelta((int)ObservationStage02B.Instrumentation,value);work.CpuEnd100ns=value<0?(long?)null:value;
   long sum=0;int phase=work.Ordinal<=FirstBatches?0:1;for(int i=0;i<work.WallTicks.Length;i++){sum+=work.WallTicks[i];Interlocked.Add(ref phaseTotals[phase,i],work.WallTicks[i]);}
   work.ReconciliationTicks=ended-work.BeginQpc-sum;work.StageMask|=1L<<(int)ObservationStage02B.Instrumentation;long duration=ended-work.BeginQpc;Interlocked.Increment(ref phaseHistogram[phase,(int)Math.Min(1001,Math.Ceiling(duration*10000d/Stopwatch.Frequency))]);Interlocked.Exchange(ref phaseMaximum[phase],Math.Max(Interlocked.Read(ref phaseMaximum[phase]),duration));if(phase==0)Interlocked.Increment(ref coldCount);else Interlocked.Increment(ref laterCount);
   bool retain=work.Ordinal<=FirstBatches||ended-work.BeginQpc>Stopwatch.Frequency/100||exception!=null;
   int slot=published;if(retain&&slot<MaximumRecords){var target=records[slot];Copy(work,target);target.PublishQpc=clock();target.TraceTailTicks=target.PublishQpc-ended;Volatile.Write(ref published,slot+1);}else if(retain)Interlocked.Increment(ref overflow);
   active=false;
  }catch(ThreadAbortException){throw;}catch(Exception){Fault();}}
  static void Copy(ObservationRecord02B a,ObservationRecord02B b){
   b.Ordinal=a.Ordinal;b.BeginQpc=a.BeginQpc;b.EndQpc=a.EndQpc;b.ClockFrequency=a.ClockFrequency;b.ManagedThreadId=a.ManagedThreadId;b.NativeThreadId=a.NativeThreadId;b.Outcome=a.Outcome;b.Exception=a.Exception;b.FrameReturned=a.FrameReturned;
   b.ProbeWallTicks=a.ProbeWallTicks;b.MaximumProbeTicks=a.MaximumProbeTicks;b.ReconciliationTicks=a.ReconciliationTicks;b.StageMask=a.StageMask;b.CpuStart100ns=a.CpuStart100ns;b.CpuEnd100ns=a.CpuEnd100ns;b.CpuStartProbeBeforeQpc=a.CpuStartProbeBeforeQpc;b.CpuStartProbeAfterQpc=a.CpuStartProbeAfterQpc;b.CpuEndProbeBeforeQpc=a.CpuEndProbeBeforeQpc;b.CpuEndProbeAfterQpc=a.CpuEndProbeAfterQpc;
   b.CameraBeforeQpc=a.CameraBeforeQpc;b.CameraAfterQpc=a.CameraAfterQpc;b.CameraMidpointQpc=a.CameraMidpointQpc;b.CameraCallsReturned=a.CameraCallsReturned;
   Array.Copy(a.WallTicks,b.WallTicks,a.WallTicks.Length);Array.Copy(a.Cpu100ns,b.Cpu100ns,a.Cpu100ns.Length);Array.Copy(a.GcBefore,b.GcBefore,3);Array.Copy(a.GcAfter,b.GcAfter,3);
  }
  // Only the existing journal worker calls Drain. Allocation/serialization is
  // deliberately here. Slot publication uses release/acquire, never a lock.
  public object Drain(){int available=Volatile.Read(ref published),n=Math.Min(DrainLimit,available-drained);var batch=new ObservationRecord02B[n];Array.Copy(records,drained,batch,0,n);drained+=n;
   var totals=new long[2][];for(int p=0;p<2;p++){totals[p]=new long[(int)ObservationStage02B.Count];for(int s=0;s<totals[p].Length;s++)totals[p][s]=Interlocked.Read(ref phaseTotals[p,s]);}
   return new{schema=1,stageNames=names,records=batch,published=available,drained,pending=available-drained,dropped=Interlocked.Read(ref overflow),diagnosticFaults=Interlocked.Read(ref faults),disabled,first32Batches=Interlocked.Read(ref coldCount),laterBatches=Interlocked.Read(ref laterCount),phaseBatchTiming=new[]{Phase(0),Phase(1)},stageTotalsTicks=totals,minimumObservedPositiveCpuIncrement100ns=Interlocked.Read(ref minimumCpuIncrement),cpuScope="Current callback thread; 100ns units, effective precision unknown; stage samples include probe offset. -1/null unavailable; StageMask identifies measured stages. GC counts process-wide; correlation is not causality.",conversionScope="SDK native call and managed return conversion combined; SDK internals not instrumented",BootstrapReadyQpc,SamplerSetupBeforeQpc,SamplerSetupAfterQpc,ManagedPreparationMs};
  }
  object Phase(int phase){var bins=new long[1002];long count=0,over=0;for(int i=0;i<bins.Length;i++){bins[i]=Interlocked.Read(ref phaseHistogram[phase,i]);count+=bins[i];if(i>100)over+=bins[i];}double max=Interlocked.Read(ref phaseMaximum[phase])*1000d/Stopwatch.Frequency;return new{scope=phase==0?"first32":"after32",count,over10ms=over,maxMs=max,p50Ms=Percentile(bins,count,.5,max),p95Ms=Percentile(bins,count,.95,max),p99Ms=Percentile(bins,count,.99,max),quantileUpperBoundResolutionMs=.1,snapshot="asynchronous counters; use immutable records for event attribution"};}
  static double Percentile(long[] bins,long count,double q,double max){long n=0,target=(long)Math.Ceiling(count*q);if(count==0)return 0;for(int i=0;i<bins.Length;i++){n+=bins[i];if(n>=target)return i==1001?max:Math.Min(max,i/10d);}return max;}
 }
}
