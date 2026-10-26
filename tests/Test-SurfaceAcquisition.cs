using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.Serialization.Json;
using RichAudio.GeometryResearch;
public static class TestSurfaceAcquisition
{
    private static int checks;
    private static void Check(bool p,string message){checks++;if(!p)throw new Exception(message);}
    private static void Reject(Action action,string message){bool rejected=false;try{action();}catch{rejected=true;}Check(rejected,message);}
    public static int Main(string[] args)
    {
        try{
            var rays=SurfacePlan.Create(new Point3(0,0,0),new Point3(1,0,0));
            Check(rays.Length==9&&SurfacePlan.MaximumCalls==16,"fixed budget");
            Check(rays[4].Origin.X==0&&rays[4].Origin.Y==0&&rays[4].Origin.Z==1,"analytic central origin");
            Check(rays[0].Origin.Y==.75&&rays[0].Origin.Z==.5,"analytic lower left");
            Check(rays[8].Origin.Y==-.75&&rays[8].Origin.Z==1.5,"analytic upper right");
            for(int i=0;i<rays.Length;i++){Check(rays[i].Order==i,"row-major order");Check(Point3.Sub(rays[i].End,rays[i].Origin).Length==8,"eight-unit rays");}
            Reject(delegate{SurfacePlan.Create(new Point3(double.NaN,0,0),new Point3(1,0,0));},"invalid player");
            Reject(delegate{SurfacePlan.Create(new Point3(0,0,0),new Point3(0,0,1));},"vertical direction rejected");
            var gate=new AcquisitionLifecycle();Check(!gate.NextCall(),"no calls before claim");Check(gate.Begin(),"first claim");Check(!gate.Begin(),"no second claim");
            int authorised=0;Parallel.For(0,64,i=>{if(gate.NextCall())Interlocked.Increment(ref authorised);});
            Check(authorised==9&&gate.Calls==9,"concurrent cap independent of task scheduling");Check(!gate.NextCall(),"budget consumed");gate.Complete();Check(gate.IsTerminal&&!gate.IsRunning&&!gate.Begin()&&!gate.NextCall(),"completion ends wait and prohibits retry");
            var waiting=new AcquisitionLifecycle();waiting.RequestStop();Check(waiting.IsTerminal&&!waiting.NextCall()&&!waiting.Begin(),"shutdown ends pending readiness wait and prevents claim");
            var cancelled=new AcquisitionLifecycle();cancelled.Begin();for(int i=0;i<3;i++)Check(cancelled.NextCall(),"partial acquisition");cancelled.RequestStop();Check(cancelled.IsTerminal&&!cancelled.NextCall()&&cancelled.Calls==3,"cancel cannot schedule further reads");
            string dir=Path.GetFullPath(args[0]);Directory.CreateDirectory(dir);string path=Path.Combine(dir,"synthetic-batch.json");
            var b=new SurfaceBatch{SessionId="original-synthetic-csharp",StartedAtMs=0,FinishedAtMs=10,PlayerPosition=new Point3(0,0,0),Forward=new Point3(1,0,0),TraceCalls=9,Completion="complete"};
            foreach(var ray in rays){var o=new GeometryObservation{SessionId=b.SessionId,GameVersion=b.GameVersion,FrameworkVersion=b.FrameworkVersion,Origin=ray.Origin,End=ray.End,HitPosition=new Point3(4,ray.Origin.Y,ray.Origin.Z),HitNormal=new Point3(-1,0,0),ObservedAtMs=ray.Order+1,Completion="hit",TraceCalls=1,IgnoredPlayerHandle=123,PlayerSpeed=0,SetupStatus="on_foot_stationary_by_SDK_getters",PositionStatus="observed",NormalStatus="observed",EntityStatus="none_returned_static_unproven",TraceDurationMs=.1,ConversionDurationMs=.01,QueryProvenance="original synthetic ray-plane intersection"};Check(ObservationRules.Validate(o).SurfaceValid,"independent observation validator");b.Samples.Add(new SurfaceSample{Id="ray-"+ray.Order,Ray=ray,Observation=o});}
            DurableAttempt.Reserve(path+".attempt","synthetic");Reject(delegate{DurableAttempt.Reserve(path+".attempt","retry");},"durable claim cannot reset");
            BatchPersistence.SaveNew(path,b);Check(File.Exists(path)&&!File.Exists(path+".partial"),"closed final file only");
            var bytes=File.ReadAllBytes(path);Reject(delegate{BatchPersistence.SaveNew(path,b);},"no final overwrite");Check(bytes.SequenceEqual(File.ReadAllBytes(path)),"previous result preserved");Check(File.Exists(path+".partial"),"collision preserves incomplete evidence");
            SurfaceBatch read;using(var stream=File.OpenRead(path))read=(SurfaceBatch)new DataContractJsonSerializer(typeof(SurfaceBatch)).ReadObject(stream);
            Check(read.Samples.Count==9&&read.TraceCalls==9&&read.Completion=="complete","bounded schema roundtrip");Check(read.Samples[4].Observation.SessionId==b.SessionId,"provenance roundtrip");
            // Own .NET thread only: reproduce abort/finally semantics without RPH.
            bool enteredFinally=false,abortClass=false;var entered=new ManualResetEvent(false);
            var thread=new Thread(delegate(){try{entered.Set();Thread.Sleep(10000);}catch(ThreadAbortException){abortClass=true;throw;}finally{enteredFinally=true;}});
            thread.Start();Check(entered.WaitOne(2000),"own test thread entered");thread.Abort();Check(thread.Join(2000)&&enteredFinally&&abortClass,"host-style abort reaches cleanup; not swallowed");entered.Dispose();
            Console.WriteLine("PASS: "+checks+" original bounded-acquisition/lifecycle assertions; no RPH execution.");return 0;
        }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
}
