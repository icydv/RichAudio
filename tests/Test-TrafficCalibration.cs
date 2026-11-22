// Original synthetic fixtures only. The real adapter/SDK is not loaded or executed.
using System;using System.IO;using System.Runtime.Serialization.Json;using RichAudio.TrafficResearch;
public static class TestTraffic
{
 static int count,requestChecks;static void Check(bool v,string why){count++;if(!v)throw new Exception(why);}static void Reject(Action f,string why){bool rejected=false;try{f();}catch{rejected=true;}Check(rejected,why);}
 sealed class Fake:IFrameTrafficControl {public int Calls,FailAt=-1;public void Request(int i,float v){requestChecks++;if(v!=0||i<0||i>2)throw new Exception("approved request");if(Calls==FailAt)throw new Exception("synthetic failure");Calls++;}}
 static Area Area(){return new Area{Anchor=new V3(0,0,0),Forward=new V3(0,1,0),Right=new V3(1,0,0)};}
 static Calibration Core(string domain="original-synthetic-fixture"){return new Calibration(Area(),domain,"synthetic-session");}
 static VehicleReading Car(int id,int vehicleClass=0){return new VehicleReading{Identity="synthetic-"+id,Handle=(uint)id,Model=1,PoolCounter=1,VehicleClass=vehicleClass,PopulationType=5,Position=new V3(6,25,0),Velocity=new V3(0,2,0)};}
 static Sample Sample(params VehicleReading[] v){return new Sample{Coverage="VALID",Enumerated=v.Length,ReadErrors=0,Listener=new V3(0,0,0),CameraRotation=new V3(0,0,0),Vehicles=v,ObservationCostMs=.1};}
 static void Save(string path,Evidence e){using(var f=new FileStream(path,FileMode.CreateNew))new DataContractJsonSerializer(typeof(Evidence)).WriteObject(f,e);}
 static Evidence Fixture(bool partialCoverage,bool unexpected,bool noReturn,bool empty)
 {
  var c=Core();var f=new Fake();c.Begin(0);for(int t=0;t<=135000;t+=50){c.Tick(t,t/50,f);if(c.Due(t)){int id=t<45000?1+t/2000:t<90000?23:noReturn?23:100+(t-90000)/2000;var s=empty?Sample():Sample(Car(id));if(unexpected&&t>=45000&&t<90000)s=Sample(Car(999,18));if(partialCoverage)s.Coverage="PARTIAL";c.Observe(t,s);}}
  Check(c.State=="COMPLETE","fixed windows complete");Check(f.Calls==2700,"900 frame requests, three each");Check(c.Snapshot().Samples.Length==675,"5 Hz exact synthetic samples");return c.Snapshot();
 }
 public static int Main(string[] args)
 {
  Directory.CreateDirectory(args[0]);var c=Core();var f=new Fake();Check(c.State=="IDLE","initial state");c.Begin(0);Reject(()=>c.Begin(0),"one attempt");
  for(int t=0;t<=45000;t+=50)c.Tick(t,t/50,f);Check(f.Calls==3,"first suppression frame");c.Tick(45000,900,f);Check(f.Calls==3,"duplicate frame no extra request");c.Tick(45050,901,f);Check(f.Calls==6,"next frame requests");c.Stop(45060,"manual stop",false);c.Tick(45100,902,f);Check(f.Calls==6,"manual stop ceases");Reject(()=>c.Begin(45200),"no retry");
  foreach(float x in new[]{-1f,1f,.5f,float.NaN,float.PositiveInfinity})Reject(()=>Rules.Value(x),"invalid value");
  c=Core();c.Stop(0,"unload",false);Reject(()=>c.Begin(0),"stop before start terminal");
  c=Core();c.Begin(0);c.Tick(2000,1,new Fake());Check(c.State=="FAILED","scheduling gap stops");
  c=Core();c.Begin(0);c.Tick(150001,1,new Fake());Check(c.State=="FAILED","overall timeout");
  c=Core();c.Begin(0);c.Tick(10,2,new Fake());c.Tick(9,3,new Fake());Check(c.State=="FAILED","clock reversal");
  c=Core();c.Begin(0);c.Tick(10,2,new Fake());c.Tick(11,1,new Fake());Check(c.State=="FAILED","frame reversal");
  c=Core();c.Begin(0);for(int t=0;t<45000;t+=50)c.Tick(t,t/50,new Fake());f=new Fake{FailAt=1};Reject(()=>c.Tick(45000,900,f),"partial native failure propagates");Check(c.State=="FAILED"&&c.Snapshot().PartialControlFrames==1,"partial effects stop");c.Tick(45050,901,f);Check(f.Calls==1,"no calls after exception");
  c=Core();c.Begin(0);c.Tick(0,1,new Fake());var sample=Sample(Car(1));c.Observe(0,sample);sample.Vehicles[0].Identity="changed";Check(c.Snapshot().Samples[0].Vehicles[0].Identity=="synthetic-1","input copied");var snapshot=c.Snapshot();snapshot.Samples[0].Vehicles[0].Identity="changed";Check(c.Snapshot().Samples[0].Vehicles[0].Identity=="synthetic-1","output copied");Reject(()=>c.Observe(0,Sample()),"duplicate observation");
  c=Core("runtime-observation");c.Begin(0);c.Tick(0,1,new Fake());Reject(()=>c.Observe(0,Sample()),"runtime cannot upgrade coverage");sample=Sample(Car(1));sample.Coverage="PARTIAL";c.Observe(0,sample);Check(c.Snapshot().Samples[0].Coverage=="PARTIAL","partial stays partial");
  foreach(string label in new[]{"duplicate","bounds","nonfinite","listener","missing"}){c=Core();c.Begin(0);c.Tick(0,1,new Fake());sample=Sample(Car(1));if(label=="duplicate")sample.Vehicles=new[]{Car(1),Car(1)};if(label=="bounds")sample.Vehicles[0].Position=new V3(0,0,0);if(label=="nonfinite")sample.Vehicles[0].Velocity=new V3(double.NaN,0,0);if(label=="listener")sample.Listener=new V3(1,0,0);if(label=="missing")sample.Vehicles=null;Reject(()=>c.Observe(0,sample),label);}
  c=Core();c.Begin(0);c.Tick(0,0,new Fake());c.Observe(0,Sample());c.Tick(500,1,new Fake());c.Observe(500,Sample());Check(c.Snapshot().ObservationGaps==1,"missing interval recorded");
  c=Core();c.Begin(0);Reject(()=>c.Observe(45000,Sample()),"phase cannot advance through observation");
  c=Core();c.Begin(0);c.Tick(0,0,new Fake());sample=Sample(Car(1),Car(2));sample.Vehicles[1].Handle=1;Reject(()=>c.Observe(0,sample),"duplicate handle under different label");
  c=Core();c.Begin(0);for(int t=0;t<45000;t+=50)c.Tick(t,t/50,new Fake());f=new Fake();c.Tick(45000,902,f);Check(c.Snapshot().MissedControlFrames==2,"missing control frames recorded");c.Stop(45001,"unload",false);c.Tick(45050,903,f);Check(f.Calls==3,"unload ceases without persistent reset");
  Save(Path.Combine(args[0],"complete.json"),Fixture(false,false,false,false));Save(Path.Combine(args[0],"partial.json"),Fixture(true,false,false,false));Save(Path.Combine(args[0],"unexpected.json"),Fixture(false,true,false,false));Save(Path.Combine(args[0],"no-return.json"),Fixture(false,false,true,false));Save(Path.Combine(args[0],"empty.json"),Fixture(false,false,false,true));
  Console.WriteLine("PASS: "+count+" synthetic traffic assertions plus "+requestChecks+" repeated request-argument checks; no game or SDK execution.");return 0;
 }
}
