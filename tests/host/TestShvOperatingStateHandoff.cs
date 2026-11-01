using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

internal static class TestShvOperatingStateHandoff
{
    const long Frequency=10000000,SourceAnchor=1000000,HostAnchor=20000000;
    const string Session="0123456789abcdef0123456789abcdef";
    static int assertions,cases;
    static readonly List<string> names=new List<string>();
    static void Check(bool x,string why){assertions++;if(!x)throw new Exception(why);}
    static void Test(string name,Action body){body();cases++;names.Add(name);}
    static void Throws(Action body){try{body();}catch(InvalidDataException){assertions++;return;}throw new Exception("expected configuration rejection");}
    static uint Bits(float x){return BitConverter.ToUInt32(BitConverter.GetBytes(x),0);}
    static H.ShvContext Shv(H.ShvContext x,int? player=null,int? ped=null,int? vehicle=null,int? driver=null,
        uint? model=null,uint? running=null,uint? speed=null,bool? eligible=null,long? start=null,long? end=null)
    {
        return new H.ShvContext(player??x.Player,ped??x.Ped,vehicle??x.Vehicle,driver??x.Driver,model??x.Model,
            running??x.EngineRunningRaw,speed??x.SpeedBits,eligible??x.Eligible,start??x.StartTicks,end??x.EndTicks);
    }
    static H.HostContext Host(H.HostContext x,string player=null,string ped=null,string vehicle=null,string current=null,
        string driver=null,int? generation=null,uint? model=null,bool? eligible=null,bool? running=null,long? start=null,long? end=null)
    {
        return new H.HostContext(player??x.PlayerId,ped??x.PedId,vehicle??x.VehicleId,current??x.CurrentVehicleId,
            driver??x.DriverId,generation??x.Generation,model??x.Model,eligible??x.Eligible,running??x.Running,
            start??x.StartTicks,end??x.EndTicks);
    }
    static H.Observation Change(H.Observation x,long? sequence=null,H.ShvContext pre=null,H.ShvContext post=null,
        H.HostContext hostPre=null,H.HostContext hostPost=null,long? before=null,long? after=null,uint? bits=null,
        double? value=null,bool? pointer=null,string status=null,H.Scope scope=null,string session=null,long? generation=null,
        bool missingPost=false,bool missingHostPost=false)
    {
        return new H.Observation(session??x.SessionId,generation??x.Generation,sequence??x.Sequence,scope??x.SourceScope,
            pre??x.Pre,missingPost?null:post??x.Post,hostPre??x.HostPre,missingHostPost?null:hostPost??x.HostPost,
            before??x.TargetBeforeTicks,after??x.TargetAfterTicks,bits??x.RawBits,value??x.RawValue,
            pointer??x.PointerPresent,status??x.ReadStatus);
    }
    static H.Scope Scope(string version=null,string game=null,string shv=null,string loader=null,string producer=null,
        uint? model=null,string rphVersion=null,string rph=null)
    {
        var x=H.QualifiedDiagnosticScope();return new H.Scope(version??x.GameVersion,game??x.GameSha256,shv??x.ShvSha256,
            loader??x.LoaderSha256,producer??x.ProducerSha256,model??x.Model,rphVersion??x.RphVersion,rph??x.RphSha256);
    }
    sealed class Fixture
    {
        internal readonly H.OfflineComposition Composition=new H.OfflineComposition();
        internal readonly H.SourceCapability Source;
        internal readonly H.BindingCapability Binding;
        internal readonly H.ClockCapability Clock;
        internal readonly H Validator;
        internal Fixture()
        {
            Source=Composition.Source(H.QualifiedDiagnosticScope(),Session,1,Frequency,Frequency);
            var o=Frame();Binding=Composition.BindForFixture(Source,o.Pre,o.HostPre,HostAnchor,HostAnchor+Frequency*5);
            Clock=Composition.ClockForFixture(Source,SourceAnchor,HostAnchor,HostAnchor+1000,HostAnchor+Frequency*5,0);
            Validator=Composition.Validator(Source);
        }
        internal static H.Observation Frame(long sequence=1)
        {
            long s=SourceAnchor+sequence*1000000,h=HostAnchor+sequence*1000000;
            var pre=new H.ShvContext(0,1234,5678,1234,H.BatiModel,1,Bits(0),true,s,s+1000);
            var post=Shv(pre,start:s+4000,end:s+5000);
            // Deliberately unrelated host identities: never compare SHV handles.
            var hp=new H.HostContext("rph-local-player","rph-ped-A","host-vehicle-A","host-vehicle-A","rph-ped-A",
                7,H.BatiModel,true,true,h,h+1000);
            var ha=Host(hp,start:h+4000,end:h+5000);
            return new H.Observation(Session,1,sequence,H.QualifiedDiagnosticScope(),pre,post,hp,ha,
                s+2000,s+3000,0x3E4CCCCD,H.Decode(0x3E4CCCCD),true,"good");
        }
        internal static long Now(long sequence=1){return HostAnchor+sequence*1000000+20000;}
        internal H.Decision Accept(H.Observation o,long? now=null,H.BindingCapability binding=null,H.ClockCapability clock=null)
        { return Validator.Accept(o,binding??Binding,clock??Clock,now??Now(o==null?1:o.Sequence)); }
    }
    static void Reject(string name,Func<H.Observation,H.Observation> mutate,string reason,long? now=null)
    {
        Test(name,delegate{
            var f=new Fixture();var o=mutate(Fixture.Frame());var d=f.Accept(o,now);
            Check(!d.Accepted&&d.Value==null&&d.Reason==reason,name+" exact rejection");
            Check(f.Validator.Retired,name+" retires session");
            if(o!=null)Check(d.RawBits==o.RawBits&&d.RawReturnPresent==(o.PointerPresent&&o.ReadStatus=="good"),name+" preserves raw evidence");
            var next=f.Accept(Fixture.Frame());Check(!next.Accepted&&next.Value==null&&next.Reason=="session-retired",name+" no automatic retry/last good");
        });
    }
    static int Main()
    {
        try{
            Test("candidate-only and independent local identities",delegate{
                var f=new Fixture();var d=f.Accept(Fixture.Frame());
                Check(d.Accepted&&d.Reason=="offline-candidate"&&!f.Validator.Retired,"candidate accepted");
                Check(!f.Composition.LiveHandoffReady&&!d.Value.LiveHandoffReady&&!d.Value.MeasuredRpm,"no live or physical RPM claim");
                Check(d.Value.OperatingPoint==H.Decode(0x3E4CCCCD)&&d.Value.RawBits==0x3E4CCCCD,"exact float promotion");
                Check(d.Value.HostVehicleId=="host-vehicle-A"&&d.Value.HostVehicleGeneration==7,"host local identity retained");
                Check(d.Value.MinimumHostTicks==21000000&&d.Value.MaximumHostTicks==21006000,"explicit nonzero clock offset and complete interval");
                Check(d.Value.ValidThroughHostTicks==23500000&&d.Value.HostClockFrequency==Frequency,"bounded candidate lifetime for future consumers");
            });
            Test("ordered changing engine-running scalar sequence",delegate{
                var f=new Fixture();uint[] bits={0x3E4CCCCD,0x3F000000,0x3F800000,0x3E800000};
                for(int i=0;i<bits.Length;i++){
                    var o=Change(Fixture.Frame(i+1),bits:bits[i],value:H.Decode(bits[i]));var d=f.Accept(o);
                    Check(d.Accepted&&d.Value.SourceSequence==i+1&&d.Value.RawBits==bits[i],"no ratio smoothing/clamping/conversion");
                }
            });
            Test("different clock frequencies and bounded drift",delegate{
                var c=new H.OfflineComposition();var source=c.Source(H.QualifiedDiagnosticScope(),Session,1,Frequency/2,Frequency);
                var o=Fixture.Frame();var pre=Shv(o.Pre,start:1000000,end:1000500);var post=Shv(o.Post,start:1002000,end:1002500);
                o=Change(o,pre:pre,post:post,before:1001000,after:1001500);
                var binding=c.BindForFixture(source,pre,o.HostPre,HostAnchor,HostAnchor+Frequency*5);
                var clock=c.ClockForFixture(source,500000,HostAnchor,HostAnchor+1000,HostAnchor+Frequency*5,100);
                var d=c.Validator(source).Accept(o,binding,clock,Fixture.Now());
                Check(d.Accepted,"clock frequency ratio mapped explicitly");
                Check(d.Value.MinimumHostTicks==20999899&&d.Value.MaximumHostTicks==21006101,"drift expands both endpoints outward");
            });
            Test("clock capability renewal preserves sequence",delegate{
                var f=new Fixture();Check(f.Accept(Fixture.Frame()).Accepted,"first accepted");
                var clock=f.Composition.ClockForFixture(f.Source,SourceAnchor+1000000,HostAnchor+1000000,
                    HostAnchor+1001000,HostAnchor+Frequency*5,0);
                Check(f.Accept(Fixture.Frame(2),clock:clock).Accepted,"renewed clock no source reset");
                Check(!f.Accept(Fixture.Frame(2),clock:clock).Accepted&&f.Validator.Retired,"renewal cannot reopen replay");
            });
            Reject("missing observation",o=>null,"missing-observation");
            Reject("new session denied",o=>Change(o,session:new string('f',32)),"scope-session-generation");
            Reject("source generation changes require new binding",o=>Change(o,generation:2),"scope-session-generation");
            Reject("first sequence gap",o=>Change(o,sequence:2),"sequence-or-receive-order");
            Reject("negative sequence",o=>Change(o,sequence:-1),"sequence-or-receive-order");
            Reject("sequence exceeds exact integer limit",o=>Change(o,sequence:H.ExactIntegerLimit+1),"sequence-or-receive-order");
            Reject("null native return",o=>Change(o,pointer:false,status:"null"),"target-not-good");
            Reject("native fault status",o=>Change(o,status:"seh"),"target-not-good");
            Reject("NaN raw payload",o=>Change(o,bits:0x7FC12345,value:Double.NaN),"nonfinite-return");
            Reject("infinite raw payload",o=>Change(o,bits:0x7F800000,value:Double.PositiveInfinity),"nonfinite-return");
            Reject("rounded decimal loses float evidence",o=>Change(o,value:.2),"raw-bits-value-mismatch");
            Reject("diagnostic float decimal is not typed double wire",o=>Change(o,value:.200000003),"raw-bits-value-mismatch");
            Reject("value changed while bits retained",o=>Change(o,value:.5),"raw-bits-value-mismatch");
            Reject("negative ratio",o=>Change(o,bits:Bits(-.01f),value:(double)-.01f),"outside-qualified-envelope");
            Reject("just above one",o=>Change(o,bits:0x3F800001,value:H.Decode(0x3F800001)),"outside-qualified-envelope");
            Reject("running positive zero retains evidence",o=>Change(o,bits:0,value:0),"unexplained-running-zero");
            Reject("running negative zero bits retained",o=>Change(o,bits:0x80000000,value:0),"unexplained-running-zero");
            Reject("engine off is outside qualified scope",o=>Change(o,pre:Shv(o.Pre,running:0),post:Shv(o.Post,running:0),bits:0,value:0),"invalid-driver-or-running-context");
            Reject("engine changed across target",o=>Change(o,post:Shv(o.Post,running:0)),"invalid-driver-or-running-context");
            Reject("unqualified raw engine BOOL",o=>Change(o,pre:Shv(o.Pre,running:2)),"invalid-driver-or-running-context");
            Reject("source passenger",o=>Change(o,pre:Shv(o.Pre,driver:9999)),"invalid-driver-or-running-context");
            Reject("source model zero",o=>Change(o,pre:Shv(o.Pre,model:0)),"invalid-driver-or-running-context");
            Reject("source ped absent",o=>Change(o,pre:Shv(o.Pre,ped:0)),"invalid-driver-or-running-context");
            Reject("source no current vehicle",o=>Change(o,pre:Shv(o.Pre,vehicle:0)),"invalid-driver-or-running-context");
            Reject("source not eligible offline foreground unpaused",o=>Change(o,pre:Shv(o.Pre,eligible:false)),"invalid-driver-or-running-context");
            Reject("negative source speed",o=>Change(o,pre:Shv(o.Pre,speed:Bits(-.01f))),"invalid-driver-or-running-context");
            Reject("nonfinite source speed",o=>Change(o,post:Shv(o.Post,speed:0x7F800000)),"invalid-driver-or-running-context");
            Reject("host no longer current driver",o=>Change(o,hostPost:Host(o.HostPost,driver:"another-ped")),"invalid-driver-or-running-context");
            Reject("host changed current vehicle",o=>Change(o,hostPost:Host(o.HostPost,current:"another-vehicle")),"invalid-driver-or-running-context");
            Reject("host invalid context",o=>Change(o,hostPost:Host(o.HostPost,eligible:false)),"invalid-driver-or-running-context");
            Reject("host engine off",o=>Change(o,hostPost:Host(o.HostPost,running:false)),"invalid-driver-or-running-context");
            Reject("missing post context",o=>Change(o,missingPost:true),"invalid-driver-or-running-context");
            Reject("missing host post context",o=>Change(o,missingHostPost:true),"invalid-driver-or-running-context");
            Reject("source identity changes after read",o=>Change(o,post:Shv(o.Post,vehicle:7777)),"identity-binding-changed");
            Reject("source stable but disagrees with binding",o=>Change(o,pre:Shv(o.Pre,vehicle:7777),post:Shv(o.Post,vehicle:7777)),"identity-binding-changed");
            Reject("host generation changed",o=>Change(o,hostPost:Host(o.HostPost,generation:8)),"identity-binding-changed");
            Reject("host stable replacement cannot reuse binding",o=>Change(o,hostPre:Host(o.HostPre,vehicle:"replacement",current:"replacement"),
                hostPost:Host(o.HostPost,vehicle:"replacement",current:"replacement")),"identity-binding-changed");
            Reject("target before source pre-context end",o=>Change(o,before:o.Pre.EndTicks-1),"incomplete-or-invalid-time-bracket");
            Reject("target interval reversed",o=>Change(o,after:o.TargetBeforeTicks-1),"incomplete-or-invalid-time-bracket");
            Reject("post context overlaps native return",o=>Change(o,post:Shv(o.Post,start:o.TargetAfterTicks-1)),"incomplete-or-invalid-time-bracket");
            Reject("source pre interval reversed",o=>Change(o,pre:Shv(o.Pre,end:o.Pre.StartTicks-1)),"incomplete-or-invalid-time-bracket");
            Reject("host brackets overlap",o=>Change(o,hostPost:Host(o.HostPost,start:o.HostPre.EndTicks-1)),"incomplete-or-invalid-time-bracket");
            Reject("source bracket too long",o=>Change(o,post:Shv(o.Post,end:o.Pre.StartTicks+Frequency)),"incomplete-or-invalid-time-bracket");
            Reject("stale complete source interval",o=>o,"stale-or-future-interval",HostAnchor+1000000+Frequency/4+1);
            Reject("future complete source interval",o=>o,"stale-or-future-interval",HostAnchor+1000000-20000);
            Reject("peer skew rather than matching model speed",o=>Change(o,hostPre:Host(o.HostPre,start:o.HostPre.StartTicks+510000,end:o.HostPre.EndTicks+510000),
                hostPost:Host(o.HostPost,start:o.HostPost.StartTicks+510000,end:o.HostPost.EndTicks+510000)),"peer-observation-skew");
            Test("midpoint freshness cannot hide old uncertainty endpoint",delegate{
                var f=new Fixture();var clock=f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+40000,HostAnchor+Frequency*5,0);
                long now=HostAnchor+1000000+22500+Frequency/4;
                var d=f.Accept(Fixture.Frame(),now,clock:clock);Check(!d.Accepted&&d.Reason=="stale-or-future-interval","midpoint age250ms but oldest endpoint older");
            });
            Test("midpoint freshness cannot hide future uncertainty endpoint",delegate{
                var f=new Fixture();var clock=f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+40000,HostAnchor+Frequency*5,0);
                var d=f.Accept(Fixture.Frame(),HostAnchor+1000000+20000,clock:clock);
                Check(!d.Accepted&&d.Reason=="stale-or-future-interval","newest uncertainty endpoint is future despite acceptable midpoint");
            });
            Test("full peer interval not just midpoint",delegate{
                var f=new Fixture();var o=Fixture.Frame();o=Change(o,hostPre:Host(o.HostPre,start:o.HostPre.StartTicks-500000),
                    hostPost:Host(o.HostPost,end:o.HostPost.EndTicks+500000));
                var d=f.Accept(o);Check(!d.Accepted&&d.Reason=="peer-observation-skew","matching midpoints with incompatible endpoint span rejected");
            });
            Test("foreign capabilities cannot self assert authentication",delegate{
                var a=new Fixture();var b=new Fixture();var d=a.Accept(Fixture.Frame(),binding:b.Binding);
                Check(!d.Accepted&&d.Reason=="untrusted-capability"&&d.Value==null,"foreign binding rejected");
                a=new Fixture();d=a.Accept(Fixture.Frame(),clock:b.Clock);Check(!d.Accepted&&d.Reason=="untrusted-capability","foreign clock rejected");
                Throws(()=>a.Composition.Validator(b.Source));
            });
            Test("same issuer different source lease cannot cross bind",delegate{
                var f=new Fixture();var source=f.Composition.Source(H.QualifiedDiagnosticScope(),Session,1,Frequency,Frequency);
                var binding=f.Composition.BindForFixture(source,Fixture.Frame().Pre,Fixture.Frame().HostPre,HostAnchor,HostAnchor+Frequency*5);
                var d=f.Accept(Fixture.Frame(),binding:binding);Check(!d.Accepted&&d.Reason=="untrusted-capability","reference-owned lease required");
            });
            Test("missing capabilities retire instead of accepting DTO facts",delegate{
                var f=new Fixture();var d=f.Validator.Accept(Fixture.Frame(),null,f.Clock,Fixture.Now());
                Check(!d.Accepted&&d.Reason=="untrusted-capability"&&d.Value==null,"DTO cannot mint binding");
            });
            Test("expired clock or binding cannot be reused",delegate{
                var f=new Fixture();var clock=f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+1000,HostAnchor+500000,0);
                Check(f.Accept(Fixture.Frame(),clock:clock).Reason=="expired-or-future-capability","expired map");
                f=new Fixture();var binding=f.Composition.BindForFixture(f.Source,Fixture.Frame().Pre,Fixture.Frame().HostPre,HostAnchor,HostAnchor+500000);
                Check(f.Accept(Fixture.Frame(),binding:binding).Reason=="expired-or-future-capability","expired binding");
            });
            Test("binding covers all mapped uncertainty endpoints",delegate{
                var f=new Fixture();var binding=f.Composition.BindForFixture(f.Source,Fixture.Frame().Pre,Fixture.Frame().HostPre,
                    HostAnchor+1000001,HostAnchor+Frequency*5);
                Check(f.Accept(Fixture.Frame(),binding:binding).Reason=="binding-does-not-cover-interval","not only receipt time covered");
            });
            Test("binding also covers independent host acquisition",delegate{
                var f=new Fixture();var o=Fixture.Frame();o=Change(o,hostPre:Host(o.HostPre,start:o.HostPre.StartTicks-1));
                var binding=f.Composition.BindForFixture(f.Source,o.Pre,o.HostPre,HostAnchor+1000000,HostAnchor+Frequency*5);
                Check(f.Accept(o,binding:binding).Reason=="binding-does-not-cover-interval","host interval cannot predate identity binding");
            });
            Test("map expiry covers full returned interval",delegate{
                var f=new Fixture();var clock=f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+1000,HostAnchor+1005000,0);
                Check(f.Accept(Fixture.Frame(),HostAnchor+1004000,clock:clock).Reason=="clock-map-does-not-cover-interval","receipt before expiry does not cover future uncertainty endpoint");
            });
            Test("contiguous sequence cannot bridge missing source interval",delegate{
                var f=new Fixture();Check(f.Accept(Fixture.Frame()).Accepted,"first accepted");var o=Fixture.Frame(2);const long shift=3000000;
                o=Change(o,pre:Shv(o.Pre,start:o.Pre.StartTicks+shift,end:o.Pre.EndTicks+shift),post:Shv(o.Post,start:o.Post.StartTicks+shift,end:o.Post.EndTicks+shift),
                    before:o.TargetBeforeTicks+shift,after:o.TargetAfterTicks+shift,
                    hostPre:Host(o.HostPre,start:o.HostPre.StartTicks+shift,end:o.HostPre.EndTicks+shift),
                    hostPost:Host(o.HostPost,start:o.HostPost.StartTicks+shift,end:o.HostPost.EndTicks+shift));
                Check(f.Accept(o,Fixture.Now(2)+shift).Reason=="source-continuity-gap","next fresh packet cannot hide unobserved continuity loss");
            });
            Test("inclusive continuity boundary remains bounded",delegate{
                var f=new Fixture();Check(f.Accept(Fixture.Frame()).Accepted,"first accepted");var o=Fixture.Frame(2);
                long shift=Fixture.Frame().TargetAfterTicks+Frequency/4-o.Pre.StartTicks;
                o=Change(o,pre:Shv(o.Pre,start:o.Pre.StartTicks+shift,end:o.Pre.EndTicks+shift),post:Shv(o.Post,start:o.Post.StartTicks+shift,end:o.Post.EndTicks+shift),
                    before:o.TargetBeforeTicks+shift,after:o.TargetAfterTicks+shift,
                    hostPre:Host(o.HostPre,start:o.HostPre.StartTicks+shift,end:o.HostPre.EndTicks+shift),
                    hostPost:Host(o.HostPost,start:o.HostPost.StartTicks+shift,end:o.HostPost.EndTicks+shift));
                Check(f.Accept(o,Fixture.Now(2)+shift).Accepted,"250ms gap boundary is explicit");
            });
            Test("minimum interval uses previous returned timestamp",delegate{
                var f=new Fixture();Check(f.Accept(Fixture.Frame()).Accepted,"first accepted");var o=Fixture.Frame(2);
                // 49.9999ms after previous return, though target starts are >50ms apart.
                o=Change(o,before:Fixture.Frame().TargetAfterTicks+499999,after:Fixture.Frame().TargetAfterTicks+500000,
                    pre:Shv(o.Pre,start:Fixture.Frame().TargetAfterTicks+490000,end:Fixture.Frame().TargetAfterTicks+499998));
                Check(f.Accept(o).Reason=="rate-or-source-clock-discontinuity","no catch-up burst");
            });
            Test("replay after prior candidate exposes no last-good output",delegate{
                var f=new Fixture();Check(f.Accept(Fixture.Frame()).Accepted,"first accepted");var d=f.Accept(Fixture.Frame());
                Check(!d.Accepted&&d.Value==null&&f.Validator.Retired,"replay retires immediately");
                d=f.Accept(Fixture.Frame(2));Check(!d.Accepted&&d.Value==null&&d.Reason=="session-retired","later good data cannot revive");
            });
            Test("concurrent duplicate arrivals cannot both pass",delegate{
                var f=new Fixture();H.Decision a=null,b=null;
                using(var go=new ManualResetEvent(false)){
                    var one=new Thread(delegate(){go.WaitOne();a=f.Accept(Fixture.Frame());});
                    var two=new Thread(delegate(){go.WaitOne();b=f.Accept(Fixture.Frame());});one.IsBackground=true;two.IsBackground=true;
                    one.Start();two.Start();go.Set();bool oneDone=one.Join(1000),twoDone=two.Join(1000);
                    Check(oneDone&&twoDone,"bounded device-free validation threads complete");
                }
                Check(a!=null&&b!=null&&a.Accepted!=b.Accepted&&f.Validator.Retired,"serialized source order rejects duplicate");
                Check((a.Accepted?b:a).Value==null,"rejected arrival never receives prior candidate");
            });
            Test("clock mapping far outside anchor cannot overflow",delegate{
                var f=new Fixture();var o=Fixture.Frame();long shift=Int64.MaxValue-o.Post.EndTicks;
                o=Change(o,pre:Shv(o.Pre,start:o.Pre.StartTicks+shift,end:o.Pre.EndTicks+shift),
                    post:Shv(o.Post,start:o.Post.StartTicks+shift,end:o.Post.EndTicks+shift),before:o.TargetBeforeTicks+shift,after:o.TargetAfterTicks+shift);
                Check(f.Accept(o).Reason=="clock-map-overflow","bounded decimal mapping refuses unanchored ticks");
            });
            Test("scope changes cannot inherit diagnostic qualification",delegate{
                var scopes=new[]{Scope(version:"1.0.1158.13"),Scope(game:new string('a',64)),Scope(shv:new string('a',64)),
                    Scope(loader:new string('a',64)),Scope(producer:new string('a',64)),Scope(model:0),
                    Scope(rphVersion:"1.124.0.0"),Scope(rph:new string('a',64))};
                foreach(var scope in scopes){
                    var f=new Fixture();Throws(()=>f.Composition.Source(scope,Session,1,Frequency,Frequency));
                    Check(f.Accept(Change(Fixture.Frame(),scope:scope)).Reason=="scope-session-generation","packet scope mutation rejected");
                }
            });
            Test("invalid trust policy construction denied",delegate{
                var f=new Fixture();Throws(()=>f.Composition.Source(H.QualifiedDiagnosticScope(),Session,0,Frequency,Frequency));
                Throws(()=>f.Composition.Source(H.QualifiedDiagnosticScope(),Session,H.ExactIntegerLimit+1,Frequency,Frequency));
                Throws(()=>f.Composition.Source(H.QualifiedDiagnosticScope(),"not-a-session",1,Frequency,Frequency));
                Throws(()=>f.Composition.Source(H.QualifiedDiagnosticScope(),Session,1,0,Frequency));
                Throws(()=>f.Composition.Source(H.QualifiedDiagnosticScope(),Session,1,Frequency,1000000001));
                Throws(()=>f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+40001,HostAnchor+Frequency,0));
                Throws(()=>f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+1000,HostAnchor+1001+Frequency*5,0));
                Throws(()=>f.Composition.ClockForFixture(f.Source,SourceAnchor,HostAnchor,HostAnchor+1000,HostAnchor+Frequency,101));
                Throws(()=>f.Composition.BindForFixture(f.Source,Fixture.Frame().Pre,Fixture.Frame().HostPre,HostAnchor,HostAnchor+Frequency*5+1));
                Throws(()=>f.Composition.BindForFixture(f.Source,Shv(Fixture.Frame().Pre,eligible:false),Fixture.Frame().HostPre,HostAnchor,HostAnchor+Frequency));
            });
            Console.WriteLine("{\"schema\":1,\"suite\":\"ShvOperatingStateHandoff\",\"passed\":true,\"cases\":"+cases+
                ",\"assertions\":"+assertions+",\"liveHandoffReady\":false,\"gameLaunched\":false,\"endpointOpened\":false,\"casesPassed\":[\""+
                String.Join("\",\"",names.ToArray())+"\"]}");return 0;
        }catch(Exception e){Console.Error.WriteLine(e.GetType().Name+": "+e.Message);return 1;}
    }
}
