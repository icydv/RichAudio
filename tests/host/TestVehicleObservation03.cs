using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Web.Script.Serialization;
using RichAudio.Acoustics.Observation;
using RichAudio.Acoustics.Rph;

internal static class TestVehicleObservation03
{
    static int checks;
    static void Need(bool value,string message){checks++;if(!value)throw new InvalidOperationException(message);}
    sealed class Clock:IVehicleObservationClock03
    {
        public long At=100000,Step=10,Hz=1000000;
        public long Frequency {get{return Hz;}}
        public long Timestamp(){long value=At;At+=Step;return value;}
    }
    sealed class Api:IVehicleObservationApi03,IVehicleContactApi03
    {
        public VehicleIdentity03 Identity=IdentityValue();public Clock Clock;public int IdentityReads,ValueReads;
        public bool Horn,Engine=true,Starting=false,FailHorn,SlowHorn,ChangeAfterRead;
        public double Ratio=50,Speed=0;public int Gear=1;
        public bool ContactFound=true,ContactThrows=false;
        public double[] ContactPosition=new[]{10d,2d,1d},ContactNormal=new[]{0d,1d,0d};
        public string ContactMaterial="METAL";
        public VehicleIdentity03 ReadIdentity(){IdentityReads++;if(ChangeAfterRead&&IdentityReads%2==0){var id=Identity;id.poolCounter++;return id;}return Identity;}
        public bool ReadHornPlaying(){ValueReads++;if(SlowHorn)Clock.At+=20000;if(FailHorn)throw new InvalidOperationException("DO-NOT-EXPORT-private-path");return Horn;}
        public bool ReadEngineOn(){ValueReads++;return Engine;}
        public bool ReadEngineStarting(){ValueReads++;return Starting;}
        public double ReadRawRevolutionsRatio(){ValueReads++;return Ratio;}
        public int ReadCurrentGear(){ValueReads++;return Gear;}
        public double ReadRawSpeed(){ValueReads++;return Speed;}
        public bool ReadLastCollision(out double[] position,out double[] normal,out string materialName){ValueReads++;if(ContactThrows)throw new NotSupportedException("DO-NOT-EXPORT-contact-private-detail");position=ContactPosition;normal=ContactNormal;materialName=ContactMaterial;return ContactFound;}
    }
    static VehicleIdentity03 IdentityValue(){return new VehicleIdentity03{poolValue=4097,poolIndex=1,poolCounter=1,model=0xf9300cc5,exists=true,inPlayerDriverScope=true};}
    static VehicleObservationSampler03 Sampler(Api api,Clock clock){api.Clock=clock;return new VehicleObservationSampler03(api,clock,new string('a',32),"retained-vehicle",1,IdentityValue(),"authored-device-free-api-fixture");}
    static void Terminal(Action operation){bool rejected=false;try{operation();}catch(InvalidOperationException){rejected=true;}Need(rejected,"Terminal sampler must reject subsequent use");}
    static double Quantile(List<double> values,double q){values.Sort();return values[(int)Math.Ceiling((values.Count-1)*q)];}
    static int Main(string[] arguments)
    {
        if(arguments.Length!=1||!Directory.Exists(arguments[0]))return 2;
        var trace=new List<VehicleObservation03>();var clock=new Clock();var api=new Api();var sampler=Sampler(api,clock);
        Need(api.ValueReads==0&&api.IdentityReads==0,"Constructor must not call game APIs");
        var first=sampler.Capture();trace.Add(first);
        Need(first.status=="observed"&&first.fields.Length==6&&api.ValueReads==6&&api.IdentityReads==2,"Bounded separately timed six-getter acquisition");
        Need((double)first.fields[3].value==50,"Raw ratio must not be relabelled or normalized to fabricated RPM");
        long previous=first.captureBeforeQpc;
        foreach(var field in first.fields){Need(field.beforeQpc>=previous&&field.afterQpc>=field.beforeQpc&&field.afterQpc<=first.captureAfterQpc,"Original per-field query bracket ordered");previous=field.afterQpc.Value;}
        clock.At+=49000;api.Horn=true;api.Gear=3;api.Engine=false;
        var second=sampler.Capture();trace.Add(second);
        Need(second.status=="observed"&&!sampler.Retired&&(bool)second.fields[1].value==false,"Observed engine-off flag is valid, not driver-scope retirement");
        clock.At+=49000;api.Identity.inPlayerDriverScope=false;
        int beforeValues=api.ValueReads;var scope=sampler.Capture();trace.Add(scope);
        Need(scope.status=="retired"&&scope.retirementReason=="player-driver-scope-lost"&&api.ValueReads==beforeValues,"Dismount never fabricates an engine-off query/event");
        Need(scope.fields[1].status=="unavailable"&&scope.fields[1].value==null,"No fabricated shutdown value on dismount");
        Terminal(()=>sampler.Capture());

        var failedClock=new Clock();var failedApi=new Api{FailHorn=true};var failedSampler=Sampler(failedApi,failedClock);var failed=failedSampler.Capture();
        Need(failed.fields[0].status=="error"&&failed.fields[0].value==null&&failed.fields[0].exceptionType=="InvalidOperationException"&&failed.fields[0].exceptionHResult.HasValue,"Getter failure remains unavailable with safe original exception category");
        Need(failed.fields[1].status=="value"&&failed.status=="observed","Independent valid engine getter survives failed horn getter");
        var invalidClock=new Clock();var invalidApi=new Api{Ratio=Double.NaN,Gear=1000};var invalid=Sampler(invalidApi,invalidClock).Capture();
        Need(invalid.fields[3].status=="invalid"&&invalid.fields[3].value==null&&invalid.fields[4].status=="invalid","Non-finite or out-of-declaration raw values stay invalid");

        var slowClock=new Clock();var slowApi=new Api{SlowHorn=true};var slow=Sampler(slowApi,slowClock).Capture();
        Need(slow.status=="acquisition-rejected"&&slow.retirementReason=="acquisition-over-budget"&&slowApi.ValueReads==1&&slowApi.IdentityReads==1,"Stop further native getters after a slow call without moving the acquisition budget");
        var changedClock=new Clock();var changedApi=new Api{ChangeAfterRead=true};var changedSampler=Sampler(changedApi,changedClock);var changed=changedSampler.Capture();
        Need(changed.status=="retired"&&changed.retirementReason=="vehicle-lifetime-changed","Post-query pool recycle invalidates the whole transaction");Terminal(()=>changedSampler.Capture());
        var goneClock=new Clock();var goneApi=new Api();var goneSampler=Sampler(goneApi,goneClock);goneApi.Identity.exists=false;var gone=goneSampler.Capture();
        Need(gone.retirementReason=="vehicle-disappeared"&&goneApi.ValueReads==0,"Disappearance is not an observed shutdown");
        var gapClock=new Clock();var gapApi=new Api();var gapSampler=Sampler(gapApi,gapClock);gapSampler.Capture();gapClock.At+=250001;
        Need(gapSampler.Capture().retirementReason=="observation-gap-expired","Missing observations cannot silently renew an expired source lease");
        var frequencyClock=new Clock();var frequencyApi=new Api();var frequencySampler=Sampler(frequencyApi,frequencyClock);frequencySampler.Capture();frequencyClock.Hz=999999;Terminal(()=>frequencySampler.Capture());
        var regressionClock=new Clock();var regressionApi=new Api();var regressionSampler=Sampler(regressionApi,regressionClock);regressionSampler.Capture();regressionClock.At=0;Terminal(()=>regressionSampler.Capture());

        var vehicle=new Rage.Vehicle{Handle=new Rage.PoolHandle{Value=4097,Index=1,Counter=1},Model=new Rage.Model{Hash=0xf9300cc5},HornValue=true};
        var ped=new Rage.Ped{Handle=new Rage.PoolHandle{Value=99,Index=3,Counter=2},CurrentVehicle=vehicle};vehicle.Driver=ped;Rage.Game.LocalPlayer.Character=ped;
        var binding=new RphVehicleObservationApi03(vehicle,()=>true);
        Need(binding.ReadIdentity().SameLifetime(IdentityValue())&&binding.ReadIdentity().inPlayerDriverScope,"Read-only binding retains exact declared pool identity and player-driver relationship");
        Need(binding.ReadHornPlaying()&&Rage.Native.NativeFunction.Calls==1&&Rage.Native.NativeFunction.LastHash==RphVehicleObservationApi03.IsHornActiveHash,"Only declared read-only horn native was called on the authored fake");
        Need(binding.ReadEngineOn()&&binding.ReadCurrentGear()==1&&binding.ReadRawRevolutionsRatio()==50,"Reference-compatible raw RPH getters");
        Need(Rage.Vehicle.Writes==0,"No native/property mutation in candidate binding");
        var blockedBinding=new RphVehicleObservationApi03(vehicle,()=>false);bool scopeRejected=false;try{blockedBinding.ReadIdentity();}catch(InvalidOperationException){scopeRejected=true;}Need(scopeRejected,"Unqualified Story Mode scope does not pretend the vehicle disappeared");

        var contactClock=new Clock();var contactApi=new Api{Clock=contactClock};
        var contacts=new VehicleContactSampler03(contactApi,contactClock,new string('a',32),"retained-vehicle",1,IdentityValue(),"authored-device-free-api-fixture");
        var contactTrace=new List<VehicleContactObservation03>();
        var contact=contacts.Capture();contactTrace.Add(contact);
        Need(contact.status=="observed"&&contact.found==true&&contact.rawPosition[0]==10&&contact.materialName=="METAL","Last-contact query preserves bounded raw data");
        Need(contact.coordinatesQualified==false&&contact.materialQualified==false&&contact.physicalIntensityAvailable==false&&contact.mayGenerateAudio==false,"Contact position/material are not qualified event/acoustic intensity data");
        contactClock.At+=49000;var repeatedContact=contacts.Capture();contactTrace.Add(repeatedContact);
        Need(repeatedContact.sequence==1&&repeatedContact.rawPosition[0]==contact.rawPosition[0]&&repeatedContact.lastContactOnly,"Repeated last-contact reports are not new collision identities");
        contactApi.ContactPosition[0]=999;Need(contact.rawPosition[0]==10,"Captured contact data is copied, not aliased to mutable getter buffers");
        contactClock.At+=49000;contactApi.ContactFound=false;var none=contacts.Capture();contactTrace.Add(none);
        Need(none.found==false&&none.rawPosition==null&&none.rawNormal==null&&none.materialName==null,"No reported contact creates no fabricated location/normal/material");
        var badContactClock=new Clock();var badContactApi=new Api{Clock=badContactClock,ContactPosition=new[]{Double.NaN,0d,0d}};
        var badContact=new VehicleContactSampler03(badContactApi,badContactClock,new string('a',32),"retained-vehicle",1,IdentityValue(),"authored-device-free-api-fixture").Capture();
        Need(badContact.status=="invalid"&&badContact.found==null&&badContact.rawPosition==null,"Non-finite contact data cannot reach a scene");
        var failContactClock=new Clock();var failContactApi=new Api{Clock=failContactClock,ContactThrows=true};
        var failContact=new VehicleContactSampler03(failContactApi,failContactClock,new string('a',32),"retained-vehicle",1,IdentityValue(),"authored-device-free-api-fixture").Capture();
        Need(failContact.status=="error"&&failContact.found==null&&failContact.exceptionType=="NotSupportedException","Unsupported contact query remains unavailable");
        var unsafeMaterialClock=new Clock();var unsafeMaterialApi=new Api{Clock=unsafeMaterialClock,ContactMaterial="DO-NOT-EXPORT/unsafe/path"};
        var unsafeMaterial=new VehicleContactSampler03(unsafeMaterialApi,unsafeMaterialClock,new string('a',32),"retained-vehicle",1,IdentityValue(),"authored-device-free-api-fixture").Capture();
        Need(unsafeMaterial.status=="observed"&&unsafeMaterial.materialName==null&&unsafeMaterial.materialNameStatus=="invalid","Unbounded/path-like material data is not exported as a qualified name");
        vehicle.LastCollisionFound=true;vehicle.LastCollisionPosition=new Rage.Vector3{X=3,Y=4,Z=5};vehicle.LastCollisionNormal=new Rage.Vector3{X=0,Y=1,Z=0};vehicle.LastCollisionMaterial="CONCRETE";
        double[] declaredPosition,declaredNormal;string declaredMaterial;
        Need(new RphVehicleContactApi03(vehicle,()=>true).ReadLastCollision(out declaredPosition,out declaredNormal,out declaredMaterial)&&declaredPosition[0]==3&&declaredMaterial=="CONCRETE","Exact documented out-parameter contact binding compiles and preserves authored fake returns");
        Need(Rage.Vehicle.Writes==0,"Contact candidate performs no setter/native mute");

        var performanceApi=new Api();var performanceClock=new Clock();var performanceSampler=Sampler(performanceApi,performanceClock);var costs=new List<double>();
        for(int i=0;i<1000;i++){long at=Stopwatch.GetTimestamp();var result=performanceSampler.Capture();costs.Add((Stopwatch.GetTimestamp()-at)*1000.0/Stopwatch.Frequency);Need(result.status=="observed","Nominal fake acquisition remains bounded");}
        var json=new JavaScriptSerializer();string traceJson=json.Serialize(trace);
        Need(!json.Serialize(failed).Contains("DO-NOT-EXPORT"),"Exception messages and paths never enter source packets");
        File.WriteAllText(Path.Combine(arguments[0],"authored-csharp-observations.json"),traceJson);
        File.WriteAllText(Path.Combine(arguments[0],"authored-csharp-contacts.json"),json.Serialize(contactTrace));
        File.WriteAllText(Path.Combine(arguments[0],"validation.json"),json.Serialize(new{schema=1,passed=true,checks,scope="Authored device-free API fixture; no native runtime/endpoint/game invocation",traceRecords=trace.Count,
            samplerCostMs=new{count=costs.Count,median=Quantile(costs,.5),p95=Quantile(costs,.95),p99=Quantile(costs,.99),maximum=costs[costs.Count-1]},
            managedBytesAfterRun=GC.GetTotalMemory(false),runtimeVerified=false,endpointOpened=false,gameLaunched=false,nativeWrites=Rage.Vehicle.Writes,productionEventBusEnabled=false}));
        Console.WriteLine("Vehicle observation03 authored API checks passed: "+checks+"; no game or endpoint");
        return 0;
    }
}
