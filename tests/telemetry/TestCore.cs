using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using RichAudio.Telemetry;
using RichAudio.Analysis;

namespace RichAudio.Tests
{
    // Hand-authored simulation. No game measurements or SDK stubs are used as gameplay evidence.
    public sealed class MockSource : ITelemetrySource
    {
        public int Count=32;
        public ObservationFrame Read(double time) {
            var f=new ObservationFrame{Time=time,AvailableCount=Count,CensusExamined=Count,CensusAgeSeconds=0,Listener=new ListenerState{Position=Field<Vec3>.Observed(new Vec3(0,0,0),"m","authored mock"),Rotation=Field<Vec3>.Observed(new Vec3(0,0,0),"degrees","authored mock"),Orientation=Field<Quat>.Estimated(new Quat(0,0,0,1),"unit quaternion","authored mock")}};
            for(int i=0;i<Count;i++) f.Vehicles.Add(new VehicleObservation{Token="mock-"+i+"-"+(time<0.3?1:2),IsPlayer=i==0,DriverPresent=Field<bool>.Observed(true,"boolean","authored mock"),PlayerVehicle=Field<bool>.Observed(i==0,"boolean","authored mock"),PoolHandle=Field<uint>.Observed((uint)(i+1000+(time<0.3?0:10000)),"synthetic handle, not RPH bit layout","authored mock"),PoolIndex=Field<uint>.Observed((uint)i,"pool index","authored mock"),PoolCounter=Field<int>.Observed(time<0.3?1:2,"counter","authored mock"),Model=Field<uint>.Observed((uint)(100+i),"model hash","authored mock"),Position=Field<Vec3>.Observed(new Vec3(i*20+time*3,0,0),"m","authored mock"),Velocity=Field<Vec3>.Observed(new Vec3(time,0,0),"m/s","authored mock"),Orientation=Field<Quat>.Observed(new Quat(0,0,0,1),"unit quaternion","authored mock"),Rotation=Field<Vec3>.Observed(new Vec3(0,0,0),"degrees","authored mock"),EngineRunning=Field<bool>.Observed(true,"boolean","authored mock"),RpmRatio=Field<double>.Observed(0.2+0.1*Math.Sin(time),"ratio","authored mock"),Gear=Field<int>.Observed(1,"index","authored mock")});
            return f;
        }
    }
    [DataContract] public sealed class Bench
    {
        [DataMember] public string Workload;
        [DataMember] public int Frames,Sources;
        [DataMember] public double WallMs,CpuMs,MicrosecondsPerFrame,P50Microseconds,P95Microseconds,P99Microseconds,MachineCpuPercent,GcHeapDeltaBytes,PrivateBytesAfter;
        [DataMember] public long SerializedBytes;
    }
    [DataContract] public sealed class TestReport
    {
        [DataMember] public string Scope="Offline authored mocks on .NET Framework; not RPH/game performance",ExecutedUtc;
        [DataMember] public int Assertions,LogicalProcessors;
        [DataMember] public bool Passed;
        [DataMember] public int PacedFrames;
        [DataMember] public long PacedMissedDeadlines,PacedQueueDrops;
        [DataMember] public double PacedWallMs;
        [DataMember] public List<Bench> Benchmarks=new List<Bench>();
        [DataMember] public List<string> Tests=new List<string>();
    }
    public static class TestCore
    {
        private static int assertions;
        private static List<string> names=new List<string>();
        private static int pacedFrames;
        private static long pacedMissed,pacedDropped;
        private static double pacedWallMs;
        private static void Check(bool value,string label) {assertions++;if(!value)throw new Exception("FAILED: "+label);names.Add(label);}
        private static void Throws(Action a,string name) {bool threw=false;try{a();}catch(ArgumentException){threw=true;}Check(threw,name);}
        private static ObservationFrame Frame(double time,int count) {return new MockSource{Count=count}.Read(time);}
        private static void Save<T>(string path,T o) {using(var fs=File.Create(path))new DataContractJsonSerializer(typeof(T)).WriteObject(fs,o);}
        private static void RunTests(string dir) {
            Throws(()=>new DeadlineScheduler(double.NaN,0),"NaN scheduler frequency rejected");
            Throws(()=>new DeadlineScheduler(double.PositiveInfinity,0),"Positive infinite scheduler frequency rejected");
            Throws(()=>new DeadlineScheduler(double.NegativeInfinity,0),"Negative infinite scheduler frequency rejected");
            var schedule=new DeadlineScheduler(20,0);int count=0;
            for(int i=0;i<=1000;i++)if(schedule.TryTake(i/1000.0))count++;
            Check(count==21,"20 Hz deadlines include t=0 and t=1; not frame-count based");Check(schedule.Missed==0,"No deadline losses at 1 ms polling");
            schedule=new DeadlineScheduler(20,0);Check(schedule.TryTake(0),"First deadline due");Check(schedule.TryTake(0.26)&&schedule.Missed==4,"Stall skips four deadlines");Check(!schedule.TryTake(0.26),"Stall never produces catch-up burst");
            Throws(()=>schedule.TryTake(0.25),"Backward scheduler clock rejected");Throws(()=>schedule.TryTake(double.NaN),"NaN scheduler clock rejected");
            var slow=new DeadlineScheduler(20,0);int slowCount=0;for(int i=0;i<=15;i++)if(slow.TryTake(i/15.0))slowCount++;Check(slowCount==16&&slow.Missed==5,"15 Hz polling honestly records five missed 20 Hz deadlines");
            var tracker=new Tracker("unit");var f=Frame(0,1);f.Vehicles.Add(f.Vehicles[0]);var first=tracker.Process(f);
            Check(first.Vehicles.Count==1&&tracker.ActiveCount==1,"Duplicate handle does not allocate duplicate identity");string id=first.Vehicles[0].TrackingId;
            var second=tracker.Process(Frame(0.05,1));Check(second.Vehicles[0].TrackingId==id&&second.Vehicles[0].Lifecycle=="continued_tracking","Identity persists while observed");
            Check(Math.Abs(second.Vehicles[0].Acceleration.Value.Value.X-1)<1e-9&&second.Vehicles[0].Acceleration.Status=="estimated","Acceleration derives from velocity, with units and estimated status");
            Check(second.Vehicles[0].InferredLoad.Status=="unavailable"&&!second.Vehicles[0].InferredLoad.Value.HasValue,"No fabricated engine load");
            Check(Field<double>.Observed(0,"ratio","mock").Value.Value==0,"Observed zero RPM is retained as a reading, not invented physical RPM");
            Check(!Field<Quat>.Observed(new Quat(0,0,0,0),"quaternion","mock").Value.HasValue,"Invalid zero quaternion becomes unavailable");
            var missingModel=Frame(0.1,1);missingModel.Vehicles[0].Model=Field<uint>.Missing("hash","getter failed");Check(tracker.Process(missingModel).Vehicles[0].TrackingId==id,"Missing model does not falsely assert handle reuse");
            var changed=Frame(0.15,1);changed.Vehicles[0].Model=Field<uint>.Observed(999,"hash","mock");var changedRecord=tracker.Process(changed);Check(changedRecord.Vehicles[0].TrackingId!=id&&changedRecord.Events.Exists(e=>e.Kind=="tracking_termination"),"Observed model change retires identity");
            var invalidEntity=Frame(0.2,1);invalidEntity.Vehicles[0].Valid=false;var invalidRecord=tracker.Process(invalidEntity);Check(tracker.ActiveCount==0&&invalidRecord.Events.Exists(e=>e.Kind=="invalid_entity"),"Invalid entity retires without reading fake fields");
            var reappeared=tracker.Process(Frame(0.25,1));Check(reappeared.Vehicles[0].TrackingId!=changedRecord.Vehicles[0].TrackingId,"Reappearance gets new session identity");
            var absent=Frame(0.3,0);absent.CompleteCensusTokens=new HashSet<string>();Check(tracker.Process(absent).Events.Exists(e=>e.Kind=="despawn_or_stream_out"),"Complete census absence classified without asserting destruction");
            tracker.Process(Frame(0.35,1));var censored=Frame(0.4,0);censored.CensusTruncated=true;Check(!tracker.Process(censored).Events.Exists(e=>e.Kind=="despawn_or_stream_out"),"Truncated census never proves despawn");
            Check(tracker.Process(Frame(1.2,0)).Events.Exists(e=>e.Reason.StartsWith("observation_timeout")),"Missing observations expire explicitly");
            Throws(()=>tracker.Process(Frame(1.2,0)),"Duplicate sample timestamp rejected");Throws(()=>tracker.Process(Frame(-1,0)),"Negative sample timestamp rejected");
            var bad=Frame(1.3,1);bad.Vehicles[0].Velocity=Field<Vec3>.Observed(new Vec3(double.NaN,0,0),"m/s","mock");var badRecord=tracker.Process(bad);Check(!badRecord.Vehicles[0].Velocity.Value.HasValue&&badRecord.InvalidValues==1,"Nonfinite input removed and counted");
            string json=JsonLines.Serialize(badRecord);Check(json.Contains("\"value\":null")&&!json.Contains("NaN"),"Unavailable is null; JSON has no numeric sentinel");Check(JsonLines.Parse(json).Vehicles[0].Velocity.Status=="unavailable","Versioned JSONL roundtrip retains validity");
            Check(JsonLines.Parse(JsonLines.Serialize(new CaptureRecord{Detail="quote\"\\\nline"})).Detail=="quote\"\\\nline","JSON string escaping roundtrips");
            var stopped=tracker.Stop(1.4,"test stop");Check(tracker.ActiveCount==0&&stopped.Events.Exists(e=>e.Kind=="tracking_termination"),"Graceful stop retires all tracks");
            var gapTracker=new Tracker("gap");gapTracker.Process(Frame(0,1));Check(!gapTracker.Process(Frame(0.3,1)).Vehicles[0].Acceleration.Value.HasValue,"Stale velocity pair is not differentiated across long sample gap");
            tracker=new Tracker("camera");var raw=Frame(0,0);var snap=tracker.Process(raw);raw.Listener.Position=Field<Vec3>.Observed(new Vec3(999,0,0),"m","mutated mock");Check(snap.Listener.Position.Value.Value.X==0,"Listener snapshot independent of mutable input DTO");
            var cut=Frame(0.05,0);cut.Listener.Position=Field<Vec3>.Observed(new Vec3(100,0,0),"m","cut");Check(!tracker.Process(cut).Listener.Velocity.Value.HasValue,"Large camera cut suppresses velocity estimate");
            var q=new SpscQueue<CaptureRecord>(2);Check(q.TryWrite(first)&&q.TryWrite(second)&&!q.TryWrite(second),"Bounded queue rejects full without overwriting");CaptureRecord read;Check(q.TryRead(out read)&&object.ReferenceEquals(read,first),"Queue FIFO first");Check(q.TryRead(out read)&&object.ReferenceEquals(read,second)&&!q.TryRead(out read),"Queue FIFO second then empty");
            var stress=new SpscQueue<CaptureRecord>(8);int received=0;bool ordered=true;
            var consumer=new Thread(()=>{while(received<10000){CaptureRecord r;if(stress.TryRead(out r)){if(r.Sequence!=received)ordered=false;received++;}else Thread.Yield();}});consumer.Start();
            for(int i=0;i<10000;i++){var r=new CaptureRecord{Sequence=i};while(!stress.TryWrite(r))Thread.Yield();}
            Check(consumer.Join(5000)&&ordered&&received==10000,"Concurrent SPSC publication preserves 10,000 ordered records");
            string writerPath=Path.Combine(dir,"writer.jsonl");var recorder=new AsyncRecorder(writerPath,2);long accepted=0;
            if(recorder.TryRecord(new CaptureRecord{Kind="session_start",SessionId="writer"}))accepted++;
            for(int i=1;i<=1000;i++)if(recorder.TryRecord(new CaptureRecord{SessionId="writer",Sequence=i}))accepted++;
            recorder.Complete(new CaptureRecord{Kind="session_end",SessionId="writer",Sequence=1001});Check(recorder.Wait(10000)&&recorder.Error==null,"Writer gracefully drains accepted records on background thread");
            var lines=File.ReadAllLines(writerPath);Check(lines.Length==accepted+1,"Footer bypasses saturated queue after drain");Check(JsonLines.Parse(lines[lines.Length-1]).QueueDropped==1001-accepted,"Footer accounts for final queue drops");
            string existing=Path.Combine(dir,"existing.jsonl");File.WriteAllText(existing,"sentinel");var fail=new AsyncRecorder(existing,2);fail.Complete(new CaptureRecord());Check(fail.Wait(5000)&&fail.Error!=null&&File.ReadAllText(existing)=="sentinel","Writer refuses overwrite and reports IO failure");
            // Recorded mock fixture: synthetic trajectory, invalid telemetry, stream-out and reappearance.
            var fixtureTracker=new Tracker("synthetic-fixture-v1");var records=new List<CaptureRecord>{new CaptureRecord{Kind="session_start",SessionId="synthetic-fixture-v1",Sequence=0,Source="AUTHORED MOCK; NOT GTA",Metadata=new SessionMetadata{TargetHz=20},Detail="Synthetic recorded fixture, no live gameplay data"}};
            for(int i=0;i<12;i++){var frame=Frame(i*0.05,i==6?0:4);if(i==6)frame.CompleteCensusTokens=new HashSet<string>();if(i==4)frame.Vehicles[1].RpmRatio=Field<double>.Missing("ratio","mock unsupported");var r=fixtureTracker.Process(frame);r.Context="mock_urban_TestC";records.Add(r);}
            var footer=fixtureTracker.Stop(0.6,"fixture end");footer.Kind="session_end";records.Add(footer);
            string fixture=Path.Combine(dir,"mock-session.jsonl");using(var writer=new StreamWriter(fixture,false,new UTF8Encoding(false)))foreach(var r in records)writer.WriteLine(JsonLines.Serialize(r));
            var report=Program.Analyze(fixture);Check(report.Complete&&report.Samples==12&&Math.Abs(report.ObservedSampleHz-20)<1e-9,"Offline analyzer checks complete mock capture and cadence");Check(report.MaximumSampledNpcDistanceM>60&&report.DistanceBands[0].Observations>0,"Analyzer derives sampled NPC distances and bands");
            Check(report.IndexesWithMultipleCounters==4,"Analyzer distinguishes observed pool index counter changes");
            Check(!report.AcquisitionBudgetKnown&&report.AcquisitionBudgetEvaluatedSamples==0,"Missing capture budget is unknown, not a passing measurement");
            // The first live recordings will use the configured soft acquisition budget.
            // All numbers in this fixture are authored, not gameplay measurements.
            string budgetPath=Path.Combine(dir,"budget-fixture.jsonl");
            var budgetRecords=new[]{
                new CaptureRecord{Kind="session_start",SessionId="budget-fixture",Sequence=0,Metadata=new SessionMetadata{AcquisitionBudgetMs=2}},
                new CaptureRecord{Kind="sample",SessionId="budget-fixture",Sequence=1,TimestampSeconds=0,AcquisitionMs=2},
                new CaptureRecord{Kind="sample",SessionId="budget-fixture",Sequence=2,TimestampSeconds=0.05,AcquisitionMs=3.2,BudgetOmitted=4},
                new CaptureRecord{Kind="sample",SessionId="budget-fixture",Sequence=3,TimestampSeconds=0.1,AcquisitionMs=1.1},
                new CaptureRecord{Kind="session_end",SessionId="budget-fixture",Sequence=4,TimestampSeconds=0.15}
            };
            File.WriteAllLines(budgetPath,Array.ConvertAll(budgetRecords,x=>JsonLines.Serialize(x)));
            var budgetReport=Program.Analyze(budgetPath);
            Check(budgetReport.Complete&&budgetReport.AcquisitionBudgetKnown&&budgetReport.AcquisitionBudgetMs==2,"Analyzer reads positive declared acquisition budget from session metadata");
            Check(budgetReport.AcquisitionBudgetEvaluatedSamples==3&&budgetReport.AcquisitionOverBudgetSamples==1,"Acquisition equals budget is not an overrun; larger sample is");
            Check(budgetReport.BudgetPressureSamples==1&&budgetReport.BudgetOmitted==4,"Budget-driven source omissions remain separately visible");
            Check(Math.Abs(budgetReport.AcquisitionOverBudgetPercentage-100.0/3)<1e-9&&Math.Abs(budgetReport.PeakAcquisitionMs-3.2)<1e-9,"Analyzer reports accurate overrun percentage and peak acquisition duration");

            var rolesTracker=new Tracker("role-mock");var roles=Frame(0,3);roles.Vehicles[1].DriverPresent=Field<bool>.Observed(false,"boolean","parked mock");roles.Vehicles[2].PlayerVehicle=Field<bool>.Missing("boolean","mock player query failed");var rolesRecord=rolesTracker.Process(roles);var rolesEnd=rolesTracker.Stop(0.05,"end");rolesEnd.Kind="session_end";
            string rolesPath=Path.Combine(dir,"roles.jsonl");File.WriteAllLines(rolesPath,new[]{JsonLines.Serialize(new CaptureRecord{Kind="session_start",SessionId="role-mock",Sequence=0}),JsonLines.Serialize(rolesRecord),JsonLines.Serialize(rolesEnd)});var rolesReport=Program.Analyze(rolesPath);Check(rolesReport.MaximumSampledNpcDistanceM==0&&rolesReport.MaximumSampledNonPlayerVehicleDistanceM==20,"Parked and unknown-player-role vehicles are not silently counted as driven NPC traffic");
            File.WriteAllText(Path.Combine(dir,"truncated.jsonl"),JsonLines.Serialize(records[0])+"\n{invalid\n");var corrupt=Program.Analyze(Path.Combine(dir,"truncated.jsonl"));Check(!corrupt.Complete&&corrupt.InvalidLines==1,"Truncation/corruption reported as incomplete, not a passing capture");
            File.WriteAllText(Path.Combine(dir,"unknown.jsonl"),JsonLines.Serialize(new CaptureRecord{SchemaVersion=99}));Check(Program.Analyze(Path.Combine(dir,"unknown.jsonl")).UnknownSchemas==1,"Unknown schema rejected explicitly");
            File.WriteAllText(Path.Combine(dir,"duplicate.jsonl"),JsonLines.Serialize(records[0])+"\n"+JsonLines.Serialize(records[0])+"\n"+JsonLines.Serialize(footer));Check(!Program.Analyze(Path.Combine(dir,"duplicate.jsonl")).Complete,"Duplicate sequence does not yield a complete valid capture");
            string pacedPath=Path.Combine(dir,"paced.jsonl");var paced=new AsyncRecorder(pacedPath,64);var clock=Stopwatch.StartNew();var cadence=new DeadlineScheduler(20,0);int pacedSamples=0;
            var pacedTracker=new Tracker("paced-mock");var pacedSource=new MockSource{Count=32};paced.TryRecord(new CaptureRecord{Kind="session_start",SessionId="paced-mock",Source="AUTHORED MOCK; NOT GTA"});
            while(clock.Elapsed.TotalSeconds<2){double now=clock.Elapsed.TotalSeconds;if(cadence.TryTake(now)){var record=pacedTracker.Process(pacedSource.Read(now));record.ScheduleDelayMs=cadence.DelayMs;record.MissedDeadlines=cadence.Missed;paced.TryRecord(record);pacedSamples++;}Thread.Sleep(1);}
            var pacedFooter=pacedTracker.Stop(clock.Elapsed.TotalSeconds,"paced mock end");pacedFooter.Kind="session_end";paced.Complete(pacedFooter);Check(paced.Wait(5000)&&paced.Error==null&&pacedSamples>=38&&pacedSamples<=40,"Two-second 32-source wall-clock paced mock logger shuts down cleanly");
            Check(paced.Dropped==0&&Program.Analyze(pacedPath).Complete,"Paced 32-source JSONL drains without queue loss");pacedFrames=pacedSamples;pacedMissed=cadence.Missed;pacedDropped=paced.Dropped;pacedWallMs=clock.Elapsed.TotalMilliseconds;
        }
        private static Bench Benchmark(int sources,int frames,bool serialize) {
            var mock=new MockSource{Count=sources};var tracker=new Tracker("benchmark");for(int i=0;i<100;i++)tracker.Process(mock.Read(i*0.05));
            GC.Collect();GC.WaitForPendingFinalizers();long heap=GC.GetTotalMemory(true);var proc=Process.GetCurrentProcess();TimeSpan before=proc.TotalProcessorTime;var clock=Stopwatch.StartNew();long bytes=0;
            var durations=new List<double>();int completed=0;
            do {for(int i=0;i<frames;i++){long start=Stopwatch.GetTimestamp();var r=tracker.Process(mock.Read((100+completed)*0.05));if(serialize)bytes+=Encoding.UTF8.GetByteCount(JsonLines.Serialize(r));durations.Add((Stopwatch.GetTimestamp()-start)*1000000.0/Stopwatch.Frequency);completed++;}}while(clock.Elapsed.TotalMilliseconds<500);
            clock.Stop();proc.Refresh();double cpu=(proc.TotalProcessorTime-before).TotalMilliseconds;
            durations.Sort();return new Bench{Workload=serialize?"mock acquisition + tracking + JSON serialization":"mock acquisition + tracking",Frames=completed,Sources=sources,WallMs=clock.Elapsed.TotalMilliseconds,CpuMs=cpu,MicrosecondsPerFrame=clock.Elapsed.TotalMilliseconds*1000/completed,P50Microseconds=durations[(int)(durations.Count*0.5)],P95Microseconds=durations[(int)(durations.Count*0.95)],P99Microseconds=durations[(int)(durations.Count*0.99)],MachineCpuPercent=cpu/clock.Elapsed.TotalMilliseconds/Environment.ProcessorCount*100,GcHeapDeltaBytes=GC.GetTotalMemory(false)-heap,PrivateBytesAfter=proc.PrivateMemorySize64,SerializedBytes=bytes};
        }
        public static int Main(string[] args) {
            try{string dir=args[0];Directory.CreateDirectory(dir);RunTests(dir);var report=new TestReport{Assertions=assertions,Tests=names,LogicalProcessors=Environment.ProcessorCount,ExecutedUtc=DateTime.UtcNow.ToString("o"),Passed=true,PacedFrames=pacedFrames,PacedMissedDeadlines=pacedMissed,PacedQueueDrops=pacedDropped,PacedWallMs=pacedWallMs};report.Benchmarks.Add(Benchmark(1,5000,false));report.Benchmarks.Add(Benchmark(32,5000,false));report.Benchmarks.Add(Benchmark(128,1000,false));report.Benchmarks.Add(Benchmark(32,300,true));Save(Path.Combine(dir,"test-results.json"),report);Console.WriteLine("PASS: "+assertions+" offline assertions. No game runtime used.");return 0;}catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
        }
    }
}
