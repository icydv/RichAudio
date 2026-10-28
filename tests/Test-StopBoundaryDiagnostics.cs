// Original synthetic observations only. No RPH assembly or game is executed.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;
using RichAudio.BatiResearch;
using RichAudio.MarkerResearch;

public static class StopBoundaryTests
{
    static int checks;static double time;
    static void Yes(bool ok,string why){checks++;if(!ok)throw new Exception(why);}
    static double Clock(){time+=.00001;return time;}
    static Identity Id(uint h){return new Identity{Handle=h,Model=123,Generation=1,Session="synthetic",Creation="owned"};}
    static Reading Row(double at,double x,double speed){return new Reading{At=at,Speed=speed,Position=new MarkerPoint(x,0,0),Velocity=new MarkerPoint(speed,0,0),Bike=Id(10),Rider=Id(11),TaskState="InProgress",Domain="original-synthetic-fixture"};}
    static StopBoundaryProbe Probe(){return new StopBoundaryProbe(true,Clock,new[]{new MarkerPoint(0,0,0),new MarkerPoint(300,0,0)},new[]{"Start","Mid1"});}
    static StopBoundaryReading Observe(StopBoundaryProbe p,Reading r,Func<int> task,Func<double> speed,Func<bool> identity=null){time=r.At+.00002;return p.Observe(r,r.At,r.At+.00001,task,speed,identity??(()=>true));}
    static string Json<T>(T value){using(var m=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(m,value);return Encoding.UTF8.GetString(m.ToArray());}}
    static T Parse<T>(string json){using(var m=new MemoryStream(Encoding.UTF8.GetBytes(json)))return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(m);}
    public static int Main(string[] args)
    {
        int calls=0;var off=new StopBoundaryProbe(false,()=>{calls++;throw new Exception();},null,null);
        bool allDisabled=true;for(int i=0;i<10000;i++)allDisabled&=off.Observe(null,0,0,()=>{calls++;return 1;},()=>{calls++;return 1;},()=>{calls++;return false;})==null;
        Yes(allDisabled,"10000 disabled observations produce no diagnostic object");
        off.BeginDrive(Id(11),Id(10),new MarkerPoint(),60,63);off.EndDrive(true,null);
        Yes(calls==0&&off.Now()==null&&off.Snapshot()==null,"disabled no getter/clock/receipt calls");

        var p=Probe();var r=Row(1,0,0);var d=Observe(p,r,()=>1,()=>0);
        Yes(d.TaskStatus.Availability=="AVAILABLE"&&d.TaskStatus.Raw==1,"raw specific status");
        Yes(d.NativeSpeed.Raw==0&&d.NativeMinusWrapperSpeed==0,"scalar agreement and valid zero");
        Yes(d.NativePosition.Contains("UNVERIFIED")&&d.NativeVelocity.Contains("UNVERIFIED"),"no invented vector readings");
        Yes(d.WrapperEndedAt<=d.StartedAt&&d.StartedAt<=d.TaskStatus.StartedAt&&d.TaskStatus.EndedAt<=d.NativeSpeed.StartedAt&&d.NativeSpeed.EndedAt<=d.EndedAt,"sequential bounded intervals");
        Yes(d.IdentityStatus=="MATCHED_BEFORE_AND_AFTER"&&d.Bike.Same(r.Bike)&&d.Rider.Same(r.Rider),"source identity attached");
        p.BeginDrive(r.Rider,r.Bike,new MarkerPoint(300,0,0),60,63|16777216);p.EndDrive(true,null);
        var receipt=p.Snapshot().Requests[0];
        Yes(receipt.DestinationIndex==1&&receipt.DestinationName=="Mid1"&&receipt.DistanceFromLastWrapperPosition==300&&receipt.DistanceObservedAt==1,"destination and historical scalar distance");
        Yes(receipt.RequestedSpeed==60&&receipt.DrivingStyle==(63|16777216)&&receipt.ReturnedNormally&&receipt.ReturnedAt>=receipt.RequestedAt,"actual invocation bracket");
        r=Row(1.05,1,20);d=Observe(p,r,()=>1,()=>19.5);r.StopBoundary=d;
        Yes(d.TaskRequestSequence==1&&d.NativeMinusWrapperSpeed==-.5&&d.Boundary.MovementBegan,"movement start and sequential speed difference");
        Yes(d.Boundary.SpecificStatusChanged==null,"do not compare status across task request identity");
        var copied=r.Copy();d.TaskStatus.Raw=99;d.Boundary.WrapperDisplacement=99;
        Yes(copied.StopBoundary.TaskStatus.Raw==1&&copied.StopBoundary.Boundary.WrapperDisplacement==1,"deep copy for asynchronous evidence");
        d=Observe(p,Row(1.10,1,0),()=>7,()=>0);
        Yes(d.Boundary.MovementEnded&&d.Boundary.SamePosition&&d.Boundary.SameRotation&&d.Boundary.WrapperSpeedDelta==-20,"abrupt collapse without position change");
        Yes(d.Boundary.SpecificStatusChanged==true&&!d.Boundary.GenericStatusChanged&&d.Boundary.NativeSpeedDelta==-19.5,"specific change independent of generic InProgress");
        d=Observe(p,Row(1.15,1,0),()=>3,()=>0);
        Yes(d.Boundary.SpecificStatusChanged==true&&!d.Boundary.MovementEnded,"specific transition while stationary");
        var snap=p.Snapshot();snap.Requests[0].RequestedSpeed=0;snap.LastObservation.TaskStatus.Raw=0;
        Yes(p.Snapshot().Requests[0].RequestedSpeed==60&&p.Snapshot().LastObservation.TaskStatus.Raw==3,"footer immutable copies");

        p=Probe();int failures=0,speeds=0;
        d=Observe(p,Row(2,0,1),()=>{failures++;throw new NotSupportedException("private detail must never be copied");},()=>{speeds++;return 1;});
        Yes(d.TaskStatus.Availability=="UNKNOWN_EXCEPTION"&&d.TaskStatus.ExceptionType=="NotSupportedException"&&d.TaskStatus.Raw==null,"safe exception and missing result");
        d=Observe(p,Row(2.05,.05,1),()=>{failures++;return 1;},()=>{speeds++;return 1;});
        Yes(failures==1&&speeds==2&&d.TaskStatus.Availability=="DISABLED_AFTER_FAILURE"&&d.NativeSpeed.Availability=="AVAILABLE","no retry; other getter continues");
        Yes(!Json(p.Snapshot()).Contains("private detail"),"no exception messages");
        p=Probe();d=Observe(p,Row(3,0,1),()=>8,()=>double.NaN);
        Yes(d.TaskStatus.Raw==8&&d.TaskStatus.Availability=="UNKNOWN_INVALID_VALUE"&&d.NativeSpeed.Raw==null,"unexpected finite raw preserved; nonfinite unavailable");
        d=Observe(p,Row(3.05,.05,1),()=>{throw new Exception();},()=>{throw new Exception();});
        Yes(d.TaskStatus.Availability=="DISABLED_AFTER_FAILURE"&&d.NativeSpeed.Availability=="DISABLED_AFTER_FAILURE","invalid getters not retried");
        p=Probe();d=Observe(p,Row(4,0,1),()=>1,()=>{throw new InvalidOperationException();});
        Yes(d.TaskStatus.Availability=="AVAILABLE"&&d.NativeSpeed.Availability=="UNKNOWN_EXCEPTION"&&d.NativeMinusWrapperSpeed==null,"scalar exception does not remove task evidence");

        p=Probe();int identityCalls=0;calls=0;
        d=Observe(p,Row(5,0,1),()=>{calls++;return 1;},()=>{calls++;return 1;},()=>{identityCalls++;return identityCalls==1;});
        Yes(d.IdentityStatus=="UNKNOWN"&&d.TaskStatus.Availability=="UNKNOWN_IDENTITY"&&d.NativeMinusWrapperSpeed==null,"identity changed during acquisition");
        Observe(p,Row(5.05,.05,1),()=>{calls++;return 1;},()=>{calls++;return 1;},()=>{identityCalls++;return true;});
        Yes(calls==2&&identityCalls==2,"identity failure latches all optional native reads");
        p=Probe();d=Observe(p,Row(6,0,1),()=>{calls++;return 1;},()=>1,()=>{throw new NotSupportedException();});
        Yes(d.DisabledReason=="IDENTITY_EXCEPTION_NotSupportedException"&&d.TaskStatus.Raw==null,"identity exception yields unknown");
        p=Probe();calls=0;d=Observe(p,Row(7,0,1),()=>{time+=.003;return 1;},()=>{calls++;return 1;});
        Yes(d.DisabledReason=="OBSERVATION_BUDGET"&&calls==0&&d.OverheadMilliseconds>2,"overrun stops subsequent extras, not original observation");
        Observe(p,Row(7.05,.05,1),()=>{calls++;return 1;},()=>{calls++;return 1;});Yes(calls==0,"overrun remains latched");
        p=Probe();d=Observe(p,Row(8,0,1),()=>1,()=>1);time=8;
        d=p.Observe(Row(8.05,0,1),9,9,()=>1,()=>1,()=>true);
        Yes(d.TaskStatus.Availability=="UNKNOWN_TIMING"&&d.NativeMinusWrapperSpeed==null,"bad timing cannot masquerade as valid comparison");

        // Independent finite differences: three positive decrements, then threshold crossing.
        Reading a=Row(10,0,3),b=Row(10.1,.25,2),c=Row(10.2,.4,1),e=Row(10.3,.45,0);
        foreach(var pair in new[]{new[]{a,b},new[]{b,c},new[]{c,e}}){var f=StopBoundaryProbe.Compare(pair[0],pair[1],null,null);Yes(f.WrapperSpeedDelta==-1&&f.WrapperDisplacement>0&&!f.SamePosition,"progressive deceleration remains distinct from fixed-position collapse");}
        b.Bike.Generation++;Yes(StopBoundaryProbe.Compare(a,b,null,null)==null,"handle reuse not compared");b=Row(10.5,1,1);Yes(StopBoundaryProbe.Compare(a,b,null,null)==null,"gap not interpreted as a stop boundary");
        var legacy=Parse<Reading>("{\"At\":1,\"Speed\":2}");Yes(legacy.StopBoundary==null&&legacy.Copy().Speed==2,"old records remain loadable");
        p=Probe();for(int i=0;i<2500;i++)Observe(p,Row(20+i*.05,i,1),()=>1,()=>1);
        Yes(Observe(p,Row(200,1,1),()=>{throw new Exception();},()=>{throw new Exception();})==null&&p.Snapshot().TaskCalls==2500&&p.Snapshot().SpeedCalls==2500,"bounded observation count");
        p=Probe();for(int i=0;i<6;i++){p.BeginDrive(Id(11),Id(10),new MarkerPoint(300,0,0),60,63);p.EndDrive(true,null);}Yes(p.Snapshot().Requests.Length==5&&p.Snapshot().DisabledReason=="REQUEST_RECEIPT_CAP","bounded requests without changing task control");
        p=Probe();p.BeginDrive(Id(11),Id(10),new MarkerPoint(300,0,0),60,63);p.EndDrive(false,"InvalidOperationException");Yes(!p.Snapshot().Requests[0].ReturnedNormally&&p.Snapshot().Requests[0].ExceptionType=="InvalidOperationException","failed invocation retained");

        // The real pure controller ignores failed optional readings and still owns cleanup.
        var world=new FakeWorld();var controller=TestBatiController.Ready(world);controller.Start(0);p=Probe();
        for(int i=0;i<27;i++){r=TestBatiController.R(controller,i*.2,0,0);r.StopBoundary=Observe(p,r,()=>{throw new NotSupportedException();},()=>{throw new NotSupportedException();});controller.Observe(r);}
        Yes(world.Drives==1&&world.Brakes==0&&world.Spawns==2&&world.Deleted.Count==2&&controller.Snapshot().Reason=="stalled progression","no extra tasks/mutations; original stall cleanup survives observer failure");
        world=new FakeWorld();controller=TestBatiController.Ready(world);controller.Start(0);r=TestBatiController.R(controller,0,0,0);r.StopBoundary=d;controller.Observe(r);controller.Abort();Yes(world.Deleted.Count==2&&world.Drives==1,"normal abort retained");

        // Deterministic fixture output independent of wall-clock performance measurements.
        Func<string> fixture=()=>{var probe=Probe();var row=Row(1,0,0);row.StopBoundary=Observe(probe,row,()=>1,()=>0);return Json(row);};
        Yes(fixture()==fixture(),"deterministic diagnostic JSON");
        if(args.Length>0){
            PrivateFiles.WriteNew(Path.Combine(args[0],"diagnostic-fixture.json"),Parse<Reading>(fixture()));
            string file=Path.Combine(args[0],"writer.jsonl");var saved=Parse<Reading>(fixture());
            using(var writer=new ExperimentWriter(file)){Yes(writer.Add(saved),"optional diagnostic queued");saved.StopBoundary.TaskStatus.Raw=99;}
            var written=Parse<Reading>(File.ReadAllText(file));Yes(written.StopBoundary.TaskStatus.Raw==1,"background writer receives deep copied diagnostic");
        }
        var timer=Stopwatch.StartNew();for(int batch=0;batch<4;batch++){p=Probe();for(int i=0;i<2500;i++)Observe(p,Row(1+i*.05,i,1),()=>1,()=>1);}timer.Stop();
        Console.WriteLine("PASS: "+checks+" original stop-boundary assertions, including 10000 disabled-path repetitions. Synthetic 10000 observations: "+timer.Elapsed.TotalMilliseconds.ToString("F3")+" ms; managed bytes "+GC.GetTotalMemory(false)+". No native performance claim.");return 0;
    }
}
