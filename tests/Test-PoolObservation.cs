// Original synthetic pool observations. No SDK, GTA or native execution.
using System;using System.Collections.Generic;using System.IO;using System.Runtime.Serialization.Json;using RichAudio.TrafficResearch;
public static class TestPoolObservation
{
    static int assertions;static void Check(bool value,string reason){assertions++;if(!value)throw new Exception(reason);}
    static void Reject(Action f,string reason){bool rejected=false;try{f();}catch{rejected=true;}Check(rejected,reason);}
    sealed class Requests:IFrameTrafficControl {public int Calls;public void Request(int i,float v){if(i!=Calls%3||v!=0)throw new Exception("unexpected request");Calls++;}}
    static Area Anchor(){return new Area{Anchor=new V3(0,0,0),Forward=new V3(0,1,0),Right=new V3(1,0,0),Provenance="measured-player-pose-streamed-pool-v2"};}
    static VehicleReading Car(int id){return new VehicleReading{Handle=(uint)id,Model=123,PoolCounter=1,Identity=PoolSelection.Identity((uint)id,123,1),Position=new V3(id,0,0),Velocity=new V3(2,0,0),VehicleClass=0,PopulationType=5};}
    static List<VehicleReading> Cars(int count,int offset=0){var result=new List<VehicleReading>();for(int i=count;i>=1;i--)result.Add(Car(offset+i));return result;}
    static Calibration Core(){return new Calibration(Anchor(),"original-synthetic-fixture","synthetic-pool");}
    static void Save(string p,Evidence e){using(var f=new FileStream(p,FileMode.CreateNew))new DataContractJsonSerializer(typeof(Evidence)).WriteObject(f,e);}
    public static int Main(string[] args)
    {
        var a=Anchor();a.Validate();Check(a.StreamedPool,"explicit opt-in");Check(!new Area().StreamedPool,"old default unchanged");Check(a.Contains(new V3(-100,80,20)),"not a corridor or road projection");Check(!a.Contains(new V3(200001,0,0)),"source position bounds retained");Check(!a.Contains(new V3(double.NaN,0,0)),"nonfinite position rejected");
        var input=Cars(80);var s=PoolSelection.Select(a,input,82,2);Check(s.Vehicles.Length==32,"bounded detailed cohort");Check(s.PoolEligible==80&&s.PoolOmitted==48&&s.ReadErrors==2,"all omissions/errors counted");Check(s.Coverage=="PARTIAL","never complete coverage");for(int i=0;i<32;i++)Check(s.Vehicles[i].Handle==(uint)(i+1),"independent nearest oracle");
        input[79].Position=new V3(500,0,0);Check(s.Vehicles[0].Position.X==1,"copied observations");input=Cars(80);input.Reverse();var second=PoolSelection.Select(a,input,80,0);for(int i=0;i<32;i++)Check(second.Vehicles[i].Handle==s.Vehicles[i].Handle,"enumeration order independent");
        var ties=new List<VehicleReading>{Car(2),Car(1)};ties[0].Position=ties[1].Position;Check(PoolSelection.Select(a,ties,2,0).Vehicles[0].Handle==1,"tie breaks by handle");
        Check(PoolSelection.Select(a,Cars(0),0,0).Vehicles.Length==0,"empty pool valid but no effect proof");Check(PoolSelection.Select(a,Cars(1),1,0).PoolOmitted==0,"small pool retained");
        Reject(()=>PoolSelection.Select(a,Cars(1),2,0),"missing accounting");Reject(()=>PoolSelection.Select(a,Cars(0),4097,4097),"enumeration bound");Reject(()=>PoolSelection.Select(a,Cars(1),1,-1),"negative errors");Reject(()=>PoolSelection.Select(null,Cars(0),0,0),"missing anchor");
        var corridor=new Area{Forward=new V3(0,1,0),Right=new V3(1,0,0)};Reject(()=>PoolSelection.Select(corridor,Cars(1),1,0),"no silent corridor conversion");
        var bad=Cars(1);bad.Add(Car(1));Reject(()=>PoolSelection.Select(a,bad,2,0),"duplicate handle");bad=Cars(1);bad[0].Identity="old-identity";Reject(()=>PoolSelection.Select(a,bad,1,0),"canonical generation required");bad=Cars(1);bad[0].PoolCounter=2;Reject(()=>PoolSelection.Select(a,bad,1,0),"stale generation label");bad=Cars(1);bad[0].Velocity=new V3(double.PositiveInfinity,0,0);Reject(()=>PoolSelection.Select(a,bad,1,0),"nonfinite read");bad=Cars(1);bad[0].Position=new V3(200001,0,0);Reject(()=>PoolSelection.Select(a,bad,1,0),"coordinate bound");
        foreach(string kind in new[]{"omission","count","coverage","identity","selection-limit","domain"}){var c=Core();c.Begin(0);c.Tick(0,0,new Requests());s=PoolSelection.Select(a,Cars(40),40,0);if(kind=="omission")s.PoolOmitted++;if(kind=="count")s.Enumerated--;if(kind=="coverage")s.Coverage="VALID";if(kind=="identity")s.Vehicles[0].Identity="different";if(kind=="selection-limit")Array.Resize(ref s.Vehicles,31);if(kind=="domain"){s.PoolEligible=0;s.PoolOmitted=0;}Reject(()=>c.Observe(0,s),kind);}
        var core=Core();var requests=new Requests();core.Begin(0);
        for(int t=0;t<=135000;t+=50){core.Tick(t,t/50,requests);if(core.Due(t)){int count=t<45000?80:t<90000?10:80,offset=t>=90000?100:0;core.Observe(t,PoolSelection.Select(a,Cars(count,offset),count,0));}}
        var e=core.Snapshot();Check(e.Version==2&&e.State=="COMPLETE","full fixed trajectory versioned");Check(e.Samples.Length==675,"same 5 Hz clock");Check(requests.Calls==2700&&e.ControlFrames==900,"unchanged three per-frame requests");Check(e.Samples[0].Vehicles[0].Position.X==1,"outside old road box retained");Check(e.Samples[225].PoolEligible==10&&e.Samples[225].PoolOmitted==0,"raw pool count independent of cap");Check(e.Samples[450].PoolOmitted==48,"restoration omissions remain visible");
        var untouched=core.Snapshot();e.Samples[0].PoolOmitted=0;e.Samples[0].Vehicles[0].Position=new V3(999,0,0);Check(core.Snapshot().Samples[0].PoolOmitted==48&&core.Snapshot().Samples[0].Vehicles[0].Position.X==1,"snapshot copy retained");
        Save(Path.Combine(args[0],"pool-complete.json"),untouched);Save(Path.Combine(args[0],"pool-repeat.json"),core.Snapshot());
        var stopped=Core();stopped.Begin(0);stopped.Tick(0,0,new Requests());stopped.Observe(0,PoolSelection.Select(a,Cars(0),0,0));stopped.Stop(1,"manual stop",false);Save(Path.Combine(args[0],"pool-stopped.json"),stopped.Snapshot());
        Console.WriteLine("PASS: "+assertions+" original pool selection/accounting/clock assertions; no game or SDK execution.");return 0;
    }
}
