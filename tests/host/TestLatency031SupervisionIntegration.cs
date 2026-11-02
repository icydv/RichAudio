using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
namespace RichAudio.Experiments {
 internal static class TestLatency031SupervisionIntegration {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static readonly List<object> rows=new List<object>();static readonly List<Tuple<int,long>> lifetimes=new List<Tuple<int,long>>();static int checks;static string helper,output;
  static void Need(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
  static bool OriginalAbsent(int pid,long creation){try{using(var p=Process.GetProcessById(pid))return p.HasExited||p.StartTime.ToUniversalTime().Ticks!=creation;}catch(ArgumentException){return true;}}
  static void VerifyAbsent(){foreach(var id in lifetimes){var w=Stopwatch.StartNew();while(!OriginalAbsent(id.Item1,id.Item2)&&w.ElapsedMilliseconds<3000)Thread.Sleep(1);Need(OriginalAbsent(id.Item1,id.Item2),"All original native fixture lifetimes absent");}}
  // An explicitly authored managed scheduling pause after an actual native
  // exit wait exercises late OBSERVATION. It is not an invented exit time.
  sealed class DelayedObservation:ILatency031OwnedChild {
   readonly ILatency031OwnedChild original;readonly int delay;
   internal DelayedObservation(ILatency031OwnedChild value,int milliseconds){original=value;delay=milliseconds;}
   public int Id{get{return original.Id;}}public long StartUtcTicks{get{return original.StartUtcTicks;}}
   public bool WaitForExit(int milliseconds){bool exited=original.WaitForExit(milliseconds);if(exited&&delay>0)Thread.Sleep(delay);return exited;}
   public Latency031ExitObservation CaptureExit(){return original.CaptureExit();}
   public Latency031CloseObservation CloseLifetime(){return original.CloseLifetime();}
  }
  static Latency031SupervisionReport RunCase(string name,uint code,int childDelay,int stop,int hard,bool admissionFailure,bool stopFailure,int observationPause,bool regressClock=false){
   string root=Path.Combine(output,name);Directory.CreateDirectory(root);var job=new OwnedProcessJob(128);OwnedProcessLifetime child=null;int stopCalls=0,clockCalls=0;long lastTimestamp=0;Latency031SupervisionReport report=null;
   Func<long> clock=delegate{long now=Stopwatch.GetTimestamp();clockCalls++;if(regressClock&&clockCalls==3)return lastTimestamp-1;lastTimestamp=now;return now;};
   try{
    report=Latency031Supervision.Run(
     delegate{child=job.StartOwned(helper,"exit "+code+" "+childDelay,root);lifetimes.Add(Tuple.Create(child.Id,child.StartUtcTicks));ILatency031OwnedChild adapter=new Latency031NativeChild(child);return observationPause>0?new DelayedObservation(adapter,observationPause):adapter;},
     delegate(ILatency031OwnedChild owned){string target=admissionFailure?Path.Combine(root,"missing-parent/admission.json"):Path.Combine(root,"admission.json");File.WriteAllText(target,Json.Serialize(new{kind="original-offline-process-fixture-admission",owned.Id,owned.StartUtcTicks}));},
     delegate{stopCalls++;if(stopFailure)File.WriteAllText(root,"cannot write over a directory");else File.WriteAllText(Path.Combine(root,"stop.request"),"original authored process fixture stop\n");},
     delegate{return Latency031NativeChild.Convert(job.CloseContainment());},clock,Stopwatch.Frequency,stop,hard,1000);
    rows.Add(new{scenario=name,authoredObservationPauseMilliseconds=observationPause,stopCalls,report});return report;
   }finally{job.Dispose();if(child!=null){child.Dispose();var w=Stopwatch.StartNew();while(!OriginalAbsent(child.Id,child.StartUtcTicks)&&w.ElapsedMilliseconds<3000)Thread.Sleep(1);Need(OriginalAbsent(child.Id,child.StartUtcTicks),"Scenario native child lifetime absent");}}
  }
  static void TestCases(){
   var r=RunCase("normal-native-exit",0,0,1500,2500,false,false,0);Need(r.Passed&&r.WorkerExitCode==0&&r.CleanupVerified,"Actual native success has complete policy evidence");Need(r.JobCloseSucceeded&&r.ProcessHandleCloseSucceeded&&r.ExitNativeError==0,"Native handle closes and exit proof recorded");
   r=RunCase("nonzero-native-exit",37,0,1500,2500,false,false,0);Need(!r.Passed&&r.CleanupVerified&&r.WorkerExitCode==37,"Nonzero worker is not an experiment success despite cleanup");
   r=RunCase("native-exit-259",259,0,1500,2500,false,false,0);Need(!r.Passed&&r.CleanupVerified&&r.WorkerExitCode==259&&r.ExitCodeAvailable,"Actual exit259 remains an available nonzero code");
   r=RunCase("native-timeout-job-close",0,5000,60,120,false,false,0);Need(!r.Passed&&r.StopRequested&&r.HardContainmentRequested&&r.CleanupVerified,"Forced containment cannot pass even when its actual code is zero");Need(r.WorkerExitCode.HasValue,"Native forced exit status remains captured");
   r=RunCase("native-admission-io-failure",0,5000,1500,2500,true,false,0);Need(!r.Passed&&!r.AdmissionCompleted&&r.Error!=null&&r.CleanupVerified,"Actual admission IO failure preserves failed execution and native cleanup");
   r=RunCase("native-stop-io-failure",0,5000,60,120,false,true,0);Need(!r.Passed&&r.Error!=null&&r.CleanupVerified&&r.StopRequestBeforeQpc>0,"Actual stop IO failure preserves attempted request and failed result");
   r=RunCase("native-exit-observed-after-stop-bound",0,0,100,2000,false,false,350);Need(!r.Passed&&r.ElapsedMilliseconds>=100&&r.CleanupVerified,"Late observed successful exit cannot bypass supervision stop deadline");
   Need(r.ExitObservedAfterStopBound&&!r.StopRequested&&!r.HardContainmentRequested,"Late observation is distinct from actual stop and hard-containment requests");
   r=RunCase("authored-supervisor-clock-regression",0,5000,1500,2500,false,false,0,true);Need(!r.Passed&&r.Error!=null&&r.Error.Contains("regressed")&&r.CleanupVerified,"Regression relative to prior observation fails while original child cleanup proceeds");
  }
  sealed class BadReport {public string Value{get{throw new InvalidOperationException("Authored serializer getter failure");}}}
  sealed class FaultStream:Stream {
   readonly Stream inner;readonly string mode;internal int Writes,Flushes,Disposals;
   internal FaultStream(string file,string fault){inner=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.Read,1);mode=fault;}
   public override bool CanRead{get{return false;}}public override bool CanSeek{get{return false;}}public override bool CanWrite{get{return true;}}
   public override long Length{get{return inner.Length;}}public override long Position{get{return inner.Position;}set{throw new NotSupportedException();}}
   public override int Read(byte[] b,int o,int n){throw new NotSupportedException();}public override long Seek(long o,SeekOrigin s){throw new NotSupportedException();}public override void SetLength(long n){throw new NotSupportedException();}
   public override void Write(byte[] b,int o,int n){Writes++;if(mode=="write"&&Writes==1){inner.Write(b,o,Math.Min(8,n));throw new IOException("Authored transient mid-write failure");}inner.Write(b,o,n);}
   public override void Flush(){Flushes++;inner.Flush();if(mode=="flush")throw new IOException("Authored flush failure");}
   protected override void Dispose(bool disposing){if(disposing){Disposals++;inner.Dispose();if(mode=="dispose"&&Disposals==1)throw new IOException("Authored close failure after underlying file close");}base.Dispose(disposing);}
  }
  static void ReceiptCases(){
   string root=Path.Combine(output,"receipts");Directory.CreateDirectory(root);string good=Path.Combine(root,"complete.json");
   Latency031SupervisionReceipt.WriteNew(good,new{kind="authored-offline-supervision-report",passed=false,reason="worker rejected"});var decoded=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(good));Need(!(bool)decoded["passed"],"A complete failed-worker receipt remains failed");string original=File.ReadAllText(good);bool failed=false;
   try{Latency031SupervisionReceipt.WriteNew(good,new{passed=true});}catch(IOException){failed=true;}Need(failed&&File.ReadAllText(good)==original,"Existing receipt is never overwritten");
   string bad=Path.Combine(root,"serializer-failure.json");int creates=0;failed=false;try{Latency031SupervisionReceipt.WriteNew(bad,new BadReport(),p=>{creates++;return new FileStream(p,FileMode.CreateNew,FileAccess.Write);});}catch(Exception){failed=true;}Need(failed&&creates==0&&!File.Exists(bad),"Serialization failure occurs before receipt creation");
   bad=Path.Combine(root,"oversize-failure.json");creates=0;failed=false;try{Latency031SupervisionReceipt.WriteNew(bad,new{value=new string('x',4000001)},p=>{creates++;return new FileStream(p,FileMode.CreateNew,FileAccess.Write);});}catch(Exception){failed=true;}Need(failed&&creates==0&&!File.Exists(bad),"Oversized report cannot create or partially replace a receipt");
   bad=Path.Combine(root,"missing-parent/receipt.json");failed=false;try{Latency031SupervisionReceipt.WriteNew(bad,new{passed=true});}catch(DirectoryNotFoundException){failed=true;}Need(failed&&!File.Exists(bad),"Receipt directory IO failure propagates truthfully");
   foreach(string mode in new[]{"write","flush","dispose"}){
    string file=Path.Combine(root,mode+"-failure.json");FaultStream stream=null;bool returned=false;failed=false;
    try{Latency031SupervisionReceipt.WriteNew(file,new{kind="authored-receipt-IO-fault",passed=true,payload=new string('x',8000)},p=>{stream=new FaultStream(p,mode);return stream;});returned=true;}catch(IOException){failed=true;}
    Need(failed&&!returned&&stream!=null,"Receipt IO failure prevents successful persistence return");Need(stream.Writes==1,"Failed persistence does not repeat writes during cleanup");Need(stream.Disposals>=1,"Failed receipt stream cleanup attempted");
    bool parseable=false;try{Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));parseable=true;}catch(ArgumentException){}catch(InvalidOperationException){}
    if(mode=="write")Need(!parseable&&new FileInfo(file).Length==8,"Partial receipt remains retained, incomplete and unrepaired");
    rows.Add(new{scenario="authored-receipt-"+mode+"-failure",writeCalls=stream.Writes,flushCalls=stream.Flushes,disposalCalls=stream.Disposals,persistenceReturned=returned,parseableFile=parseable,acceptance="Caller failure is authoritative even if flush/close failure left parseable bytes; receipt alone cannot establish completion"});
   }
  }
  public static int Main(string[] args){bool passed=false,allAbsent=false;string error=null;try{if(args.Length!=2)throw new ArgumentException("Original process helper and fresh output directory required");helper=Path.GetFullPath(args[0]);output=Path.GetFullPath(args[1]);if(!File.Exists(helper)||Directory.Exists(output))throw new ArgumentException("Fresh original native fixtures required");Directory.CreateDirectory(output);TestCases();ReceiptCases();passed=true;}catch(Exception e){error=e.ToString();}finally{try{VerifyAbsent();allAbsent=true;}catch(Exception e){passed=false;error=(error??"")+" Cleanup: "+e;}}
   Console.WriteLine(Json.Serialize(new{schema=1,passed,checks,error,scenarios=rows,originalFixtureLifetimes=lifetimes.Count,allOriginalFixtureLifetimesAbsent=allAbsent,endpointOpened=false,recordingStarted=false,gameLaunched=false,scope="Actual Win32 owned-child handles with the production supervisor policy/adapter; an explicit scheduling pause is authored. No experiment mode, endpoint or game is invoked."}));return passed?0:1;
  }
 }
}
