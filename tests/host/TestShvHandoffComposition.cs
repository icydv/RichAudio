using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;
using RichAudio.Beacon.Handoff;

internal static class TestShvHandoffComposition
{
    static int cases,checks;
    static readonly List<string> names=new List<string>();
    static void Check(bool yes,string why){checks++;if(!yes)throw new Exception(why);}
    static void Test(string name,Action action){action();cases++;names.Add(name);}
    static uint Bits(float value){return BitConverter.ToUInt32(BitConverter.GetBytes(value),0);}
    sealed class ManualClock:IHandoffHostClock{internal long Value;public long Frequency{get{return Stopwatch.Frequency;}}public long Now{get{return Interlocked.Read(ref Value);}}}
    sealed class ConsumerFixture:IDisposable
    {
        internal readonly IHandoffHostClock Clock;
        internal readonly H.OfflineComposition Composition=new H.OfflineComposition();
        internal readonly H.SourceCapability Source;internal readonly H Validator;
        internal readonly H.BindingCapability Binding;internal readonly H.ClockCapability Mapping;
        internal readonly ShvHandoffConsumer Consumer;internal readonly long HostAnchor,SourceAnchor=1000000,Frequency=Stopwatch.Frequency;
        internal ConsumerFixture(IHandoffHostClock clock=null){
            Clock=clock??StopwatchHandoffClock.Instance;HostAnchor=Clock.Now-Frequency/20;
            Source=Composition.Source(H.QualifiedDiagnosticScope(),"0123456789abcdef0123456789abcdef",1,Frequency,Frequency);
            var frame=Frame(1);Binding=Composition.BindForFixture(Source,frame.Pre,frame.HostPre,HostAnchor,HostAnchor+Frequency*5);
            Mapping=Composition.ClockForFixture(Source,SourceAnchor,HostAnchor,HostAnchor+1,HostAnchor+Frequency*5,0);
            Validator=Composition.Validator(Source);Consumer=new ShvHandoffConsumer(Validator,Clock);Consumer.StartExpecting();
        }
        internal H.Observation Frame(long seq,uint bits=0x3E4CCCCD){
            long delta=(seq-1)*Frequency/10,s=SourceAnchor+delta,h=HostAnchor+delta;
            var pre=new H.ShvContext(0,3,7,3,H.BatiModel,1,Bits(0),true,s,s+10);
            var post=new H.ShvContext(0,3,7,3,H.BatiModel,1,Bits(0),true,s+30,s+40);
            var a=new H.HostContext("player","ped","vehicle","vehicle","ped",1,H.BatiModel,true,true,h,h+10);
            var b=new H.HostContext("player","ped","vehicle","vehicle","ped",1,H.BatiModel,true,true,h+30,h+40);
            return new H.Observation(Source.SessionId,1,seq,Source.Scope,pre,post,a,b,s+15,s+20,bits,H.Decode(bits),true,"good");
        }
        internal bool Submit(H.Observation frame){return Consumer.Submit(frame,Binding,Mapping);}
        public void Dispose(){Consumer.Dispose();}
    }
    static ShvClockWitness Anchor(object owner,long sf,long hf,long source,long host,long width=1){return new ShvClockWitness(owner,sf,hf,123,source,host,host+width);}
    static void ClockTriple(ShvClockCalibration c,object owner,long sourceFrequency,long hostFrequency,int ratePpm=0,long width=1){
        for(int i=0;i<3;i++){
            long source=1000000+sourceFrequency*150*i/1000;
            long host=20000000+hostFrequency*150*i/1000+hostFrequency*150*i/1000*ratePpm/1000000;
            Check(c.Add(Anchor(owner,sourceFrequency,hostFrequency,source,host,width)),"measured anchor admitted");
        }
    }
    static int Main(){try{
        Test("exact x64 native ABI sizes and raw float offsets",delegate{ShvAbi.CheckLayout();Check(true,"native header mirror");});
        Test("same frequencies alone cannot create correspondence",delegate{
            var c=new ShvClockCalibration(new object(),10000000,10000000,123);ShvMeasuredClockMap map;string reason;
            Check(!c.TryMap(20000000,out map,out reason)&&map==null,"no authored same-clock shortcut");
        });
        Test("measured unequal frequencies and nonzero origins map with retained uncertainty",delegate{
            object owner=new object();var c=new ShvClockCalibration(owner,5000000,10000000,123);ClockTriple(c,owner,5000000,10000000);
            ShvMeasuredClockMap map;string why;Check(c.TryMap(23000001,out map,out why),"bounded actual bracket map");
            Check(map.SourceAnchor==2500000&&map.HostBefore==23000000&&map.HostAfter==23000001,"different domains retained");
            Check(map.DriftPpm<=100&&map.AnchorsUsed==3&&map.IssuedBy(owner),"measured rate uncertainty owned");
        });
        Test("foreign clock owner cannot mint a map",delegate{
            var c=new ShvClockCalibration(new object(),10000000,10000000,123);
            Check(!c.Add(Anchor(new object(),10000000,10000000,1,2)),"foreign witness denied");
            Check(c.Failure!=null,"failure retained");
        });
        Test("wide clock bracket and backwards correspondence fail closed",delegate{
            object owner=new object();var c=new ShvClockCalibration(owner,10000000,10000000,123);
            Check(!c.Add(Anchor(owner,10000000,10000000,1,2,40001)),"over4ms denied");
            c=new ShvClockCalibration(owner,10000000,10000000,123);Check(c.Add(Anchor(owner,10000000,10000000,2,2)),"first");
            Check(!c.Add(Anchor(owner,10000000,10000000,1,4)),"backwards source denied");
        });
        Test("measured drift is bounded rather than clipped to policy",delegate{
            object owner=new object();var c=new ShvClockCalibration(owner,10000000,10000000,123);ClockTriple(c,owner,10000000,10000000,50);
            ShvMeasuredClockMap map;string why;Check(c.TryMap(23000151,out map,out why)&&map.DriftPpm>=50&&map.DriftPpm<=100,"50ppm measured with uncertainty");
            c=new ShvClockCalibration(owner,10000000,10000000,123);ClockTriple(c,owner,10000000,10000000,500);
            Check(!c.TryMap(23001501,out map,out why)&&map==null,"500ppm not clipped");
        });
        Test("anchor uncertainty and insufficient baseline cannot masquerade as precision",delegate{
            object owner=new object();var c=new ShvClockCalibration(owner,10000000,10000000,123);ClockTriple(c,owner,10000000,10000000,0,40000);
            ShvMeasuredClockMap map;string why;Check(!c.TryMap(23040000,out map,out why),"4ms brackets cannot imply100ppm over300ms");
        });
        Test("changing exact float observations pass unchanged08 validation",delegate{
            var clock=new ManualClock{Value=Stopwatch.GetTimestamp()};using(var f=new ConsumerFixture(clock)){
                Check(f.Submit(f.Frame(1)),"first actual validator acceptance");H.Candidate value;
                Check(f.Consumer.TryGetCurrent(out value)&&value.RawBits==0x3E4CCCCD&&value.OperatingPoint==H.Decode(0x3E4CCCCD),"exact promoted float");
                Interlocked.Add(ref clock.Value,f.Frequency/10);Check(f.Submit(f.Frame(2,0x3F400000)),"changing frame");
                Check(f.Consumer.TryGetCurrent(out value)&&value.RawBits==0x3F400000&&!value.LiveHandoffReady&&!value.MeasuredRpm,"no live/RPM promotion");
            }
        });
        Test("complete stream silence autonomously retires without another arrival or read",delegate{
            using(var f=new ConsumerFixture()){
                Check(f.Submit(f.Frame(1)),"previously active candidate");var elapsed=Stopwatch.StartNew();
                Check(f.Consumer.WaitRetired(1200),"independent worker signaled retirement");
                Check(f.Consumer.Retired&&f.Validator.Retired&&elapsed.ElapsedMilliseconds<1200,"same validator retired autonomously");
                H.Candidate value;Check(!f.Consumer.TryGetCurrent(out value)&&value==null,"no last-good tone indefinitely");
            }
        });
        Test("every use enforces expiry even before a worker dispatch",delegate{
            var clock=new ManualClock{Value=Stopwatch.GetTimestamp()};using(var f=new ConsumerFixture(clock)){
                Check(f.Submit(f.Frame(1)),"active");Interlocked.Add(ref clock.Value,f.Frequency);
                H.Candidate value;Check(!f.Consumer.TryGetCurrent(out value)&&value==null&&f.Validator.Retired,"synchronous read expiry");
                Check(!f.Submit(f.Frame(2)),"fresh-looking later data cannot revive");
            }
        });
        Test("producer shutdown clears a previously accepted state immediately",delegate{
            using(var f=new ConsumerFixture()){
                Check(f.Submit(f.Frame(1)),"active");f.Consumer.Invalidate("producer-stopped");H.Candidate value;
                Check(!f.Consumer.TryGetCurrent(out value)&&value==null&&f.Consumer.RetirementReason=="producer-stopped","explicit shutdown");
            }
        });
        Test("replay invalidates previous state and cannot reconnect the lease",delegate{
            using(var f=new ConsumerFixture()){
                Check(f.Submit(f.Frame(1)),"first");Check(!f.Submit(f.Frame(1)),"duplicate denied");H.Candidate value;
                Check(f.Validator.Retired&&!f.Consumer.TryGetCurrent(out value)&&value==null,"old candidate removed");
                Check(!f.Submit(f.Frame(2)),"same source cannot reset");
            }
        });
        Test("consumer cleanup stops its sole owned worker",delegate{
            var f=new ConsumerFixture();f.Dispose();Check(!f.Consumer.WorkerAlive&&f.Consumer.Retired,"joined worker, no child process");
        });
        Console.WriteLine("{\"schema\":1,\"suite\":\"ShvHandoffCompositionCore\",\"passed\":true,\"cases\":"+cases+",\"assertions\":"+checks+
            ",\"liveHandoffReady\":false,\"actualProducerExecuted\":false,\"endpointOpened\":false,\"gameLaunched\":false,\"casesPassed\":[\""+String.Join("\",\"",names.ToArray())+"\"]}");return 0;
    }catch(Exception error){Console.Error.WriteLine(error.GetType().Name+": "+error.Message);return 1;}}
}
