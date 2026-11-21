using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using RichAudio.Beacon.Transport;

internal static class TestListenerTransport
{
    // Legacy development fixtures explicitly opt into reconnect; strict cases pass true.
    private static StatePipeServer Server(string name,Action<ListenerState,double> consumer,bool strict=false,Action<TransportResult> terminal=null){return new StatePipeServer(name,consumer,strict,terminal);}
    private static int tests;private static readonly string Session=new string('a',32);
    private static void Require(bool value,string message){if(!value)throw new Exception(message);}
    private static void Test(string name,Action action){action();tests++;Console.WriteLine("PASS "+name);}
    private static void Reject(Action action){bool rejected=false;try{action();}catch{rejected=true;}Require(rejected,"invalid input accepted");}
    private static ListenerState State(long n=0){return Protocol.Synthetic(Session,n,0);}
    private static ListenerState Decode(string json){var bytes=Encoding.UTF8.GetBytes(json);return Protocol.Decode(bytes,bytes.Length);}
    private static void Until(Func<bool> condition,int ms=2500){var w=Stopwatch.StartNew();while(!condition()&&w.ElapsedMilliseconds<ms)Thread.Sleep(10);Require(condition(),"bounded wait failed");}
    private static string Pipe(){return "RichAudio.Test."+Guid.NewGuid().ToString("N");}
    private static NamedPipeClientStream Client(string name){var c=new NamedPipeClientStream(".",name,PipeDirection.Out,PipeOptions.Asynchronous);c.Connect(1500);return c;}
    private static NamedPipeClientStream DuplexClient(string name){var c=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous);c.Connect(1500);return c;}
    private static void Send(NamedPipeClientStream c,ListenerState state){var b=Protocol.Frame(state);c.Write(b,0,b.Length);c.Flush();}
    private static void Mutate(Action<ListenerState> change){var s=State();change(s);Reject(delegate{Protocol.Encode(s);});}
    private static void Pace(long start,int sample){double due=start+sample*Stopwatch.Frequency/20.0;while(Stopwatch.GetTimestamp()<due)Thread.Sleep(1);}
    private static int MeasureTransport()
    {
        const int count=100;var ages=new double[count];int received=0;string pipe=Pipe();long memoryBefore=GC.GetTotalMemory(true);int collections=GC.CollectionCount(0);var watch=Stopwatch.StartNew();
        using(var server=Server(pipe,delegate(ListenerState s,double age){int index=received;if(index<count){ages[index]=age;Interlocked.Increment(ref received);}}))
        using(var writer=new StatePublisher(pipe,8,false))
        {
            server.Start();writer.Start();Until(()=>server.Connections==1);
            long pacingStart=Stopwatch.GetTimestamp();for(int i=0;i<count;i++){Pace(pacingStart,i);writer.Publish(State(i));}
            Until(()=>server.Accepted==count);writer.RequestStop();Until(()=>writer.Finished);Array.Sort(ages);
            string values="{\"suite\":\"listener-transport-measurement\",\"samples\":"+received+",\"accepted\":"+server.Accepted+",\"rejected\":"+server.Rejected+",\"sequenceGaps\":"+server.SequenceGaps+",\"replaced\":"+writer.Replaced+",\"receiptAgeMs\":{\"minimum\":"+ages[0].ToString("R",System.Globalization.CultureInfo.InvariantCulture)+",\"median\":"+ages[49].ToString("R",System.Globalization.CultureInfo.InvariantCulture)+",\"p95\":"+ages[94].ToString("R",System.Globalization.CultureInfo.InvariantCulture)+",\"maximum\":"+ages[99].ToString("R",System.Globalization.CultureInfo.InvariantCulture)+"},\"elapsedMs\":"+watch.ElapsedMilliseconds+",\"gen0Collections\":"+(GC.CollectionCount(0)-collections)+",\"managedHeapDeltaBytes\":"+(GC.GetTotalMemory(false)-memoryBefore)+",\"processWorkingSetBytes\":"+Process.GetCurrentProcess().WorkingSet64+",\"audioDeviceTest\":false,\"liveGta\":false}";
            Console.WriteLine(values);return 0;
        }
    }
    private static int SyntheticSender(string[] args)
    {
        string pipe=Protocol.DefaultPipe;double seconds=5;bool step=args[0]=="--send-step";long stepTicks=0;double stepAtMs=0;
        for(int i=1;i<args.Length;i++){if(args[i]=="--pipe"&&i+1<args.Length)pipe=args[++i];else if(args[i]=="--seconds"&&i+1<args.Length)seconds=Double.Parse(args[++i],System.Globalization.CultureInfo.InvariantCulture);else throw new ArgumentException("sender arguments");}
        Require(seconds>0&&seconds<=120,"sender duration must be in (0,120]");string session=Guid.NewGuid().ToString("N");
        using(var publisher=new StatePublisher(pipe))
        {
            publisher.Start();var watch=Stopwatch.StartNew();long pacingStart=Stopwatch.GetTimestamp();int sequence=0;
            while(watch.Elapsed.TotalSeconds<seconds)
            {
                Pace(pacingStart,sequence);double elapsed=watch.Elapsed.TotalSeconds,yaw=step?(elapsed<2?0:Math.PI/2):elapsed*0.5;
                var state=Protocol.Synthetic(session,sequence++,yaw);
                if(step&&elapsed>=2&&stepTicks==0){stepTicks=state.ObservationTicks;stepAtMs=elapsed*1000;}
                publisher.Publish(state);
            }
            Thread.Sleep(100);publisher.RequestStop();
            Console.WriteLine("{\"mode\":\"synthetic-listener-sender\",\"sent\":"+publisher.Sent+",\"replaced\":"+publisher.Replaced+",\"attempts\":"+publisher.Attempts+",\"step\":"+(step?"true":"false")+",\"stepQpcTicks\":"+stepTicks+",\"clockFrequency\":"+Stopwatch.Frequency+",\"stepAtSenderMs\":"+stepAtMs.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+"}");return publisher.Sent>0?0:2;
        }
    }
    private static void StrictFailure(string expected,Action<NamedPipeClientStream> action)
    {
        string pipe=Pipe();int endings=0;
        using(var server=Server(pipe,null,true,delegate{Interlocked.Increment(ref endings);})){
            server.Start();using(var c=new NamedPipeClientStream(".",pipe,PipeDirection.InOut,PipeOptions.Asynchronous)){c.Connect(1000);action(c);}
            Until(()=>server.Finished);Require(server.Diagnostic.Stage==expected,"wrong attribution: "+server.Diagnostic.Stage);
            Require(server.Connections==1&&endings==1&&server.Diagnostic.Terminal,"strict receiver rearmed");
            Require(!server.Diagnostic.AnotherAttempt,"retry diagnostic");
            using(var next=new NamedPipeClientStream(".",pipe,PipeDirection.Out)){Reject(()=>next.Connect(40));}
        }
    }
    public static int Main(string[] args)
    {
        try
        {
            if(args.Length>0&&(args[0]=="--send"||args[0]=="--send-step"))return SyntheticSender(args);
            if(args.Length==1&&args[0]=="--measure")return MeasureTransport();
            Test("signed freshness exact boundaries and rejected bookkeeping",delegate{
                long f=Stopwatch.Frequency,origin=f*100;
                foreach(long delta in new long[]{-f/500,f/4}){var v=new StateValidator();var x=State();x.ObservationTicks=origin;v.Accept(x,origin+delta);Require(v.AgeClass=="within-bounds","inclusive boundary");}
                foreach(long delta in new long[]{-f/500-1,f/4+1}){var v=new StateValidator();var x=State();x.ObservationTicks=origin;Reject(()=>v.Accept(x,origin+delta));Require(v.LastAgeMs==0&&v.DecisionAgeMs!=0,"rejection bookkeeping");Require(v.AgeClass==(delta<0?"future-dated":"too-old"),"signed classification");}
            });
            Test("timestamp exact codec and decision clock after synthetic work",delegate{
                var x=State();x.ObservationTicks=9007199254740000;var b=Protocol.Encode(x);var y=Protocol.Decode(b,b.Length);Require(x.ObservationTicks==y.ObservationTicks&&x.ClockFrequency==y.ClockFrequency,"timestamp preservation");
                foreach(int ms in new int[]{251,300}){var v=new StateValidator();Reject(()=>v.Accept(y,y.ObservationTicks+Stopwatch.Frequency*ms/1000));Require(v.AgeClass=="too-old","post encode/decode delay must count");}
            });
            Test("expired unsent observation counted before encoding",delegate{string name=Pipe();using(var server=Server(name,null,true))using(var p=new StatePublisher(name)){var old=State(0);old.ObservationTicks-=Stopwatch.Frequency;p.Publish(old);server.Start();p.Start();Until(()=>p.ExpiredBeforeEncoding==1);p.Publish(State(1));Until(()=>p.Sent==1);p.RequestStop();Until(()=>p.Finished&&server.Finished);Require(p.ExpiredAfterEncoding==0&&p.Diagnostic.ExpiredBeforeEncoding==1&&p.FirstTransmittedSequence==1&&server.Rejected==0&&p.Attempts==1,"unsent drop misclassified");}});
            Test("unsent expiry remains inclusive and does not discard future-dated frames",delegate{long f=Stopwatch.Frequency;Require(!StatePublisher.ExpiredUnsent(f,f+f/4),"250 boundary");Require(StatePublisher.ExpiredUnsent(f,f+f/4+1),"next tick expired");Require(!StatePublisher.ExpiredUnsent(f,f-f/100),"future data must still reach rejection");});
            Test("roundtrip explicit units and empty source identity",delegate{var s=State();var d=Decode(Protocol.EncodeJson(s));Require(d.Sequence==0&&d.SourceId==null&&d.Position[2]==1&&d.Units=="metres","roundtrip");});
            Test("all fields mandatory",delegate
            {
                string json=Protocol.EncodeJson(State());
                foreach(var field in typeof(ListenerState).GetFields())
                {
                    string name=((DataMemberAttribute)field.GetCustomAttributes(typeof(DataMemberAttribute),false)[0]).Name;
                    string changed=System.Text.RegularExpressions.Regex.Replace(json,"\""+name+"\":(\\[[^\\]]*\\]|\"[^\"]*\"|[^,}]+),?","").Replace(",}","}");Reject(delegate{Decode(changed);});
                }
                Reject(delegate{Decode("{}");});
            });
            Test("duplicate field",delegate{Reject(delegate{Decode(Protocol.EncodeJson(State()).Insert(1,"\"version\":1,"));});});
            Test("unknown field",delegate{Reject(delegate{Decode(Protocol.EncodeJson(State()).Insert(1,"\"extra\":0,"));});});
            Test("wrong JSON scalar type",delegate{Reject(delegate{Decode(Protocol.EncodeJson(State()).Replace("\"version\":1","\"version\":\"1\""));});});
            Test("wrong JSON array element type",delegate{Reject(delegate{Decode(Protocol.EncodeJson(State()).Replace("\"position\":[0,0,1]","\"position\":[\"0\",0,1]"));});});
            Test("malformed JSON",delegate{Reject(delegate{Decode("{broken");});});
            Test("malformed UTF8",delegate{Reject(delegate{Protocol.Decode(new byte[]{0xFF},1);});});
            Test("oversized bytes",delegate{Reject(delegate{Protocol.Decode(new byte[4097],4097);});});
            Test("unsupported protocol version",delegate{Mutate(s=>s.Version=2);});
            Test("no personal session identity",delegate{Mutate(s=>s.Session="account-name");});
            Test("nonfinite position",delegate{Mutate(s=>s.Position[0]=Double.NaN);});
            Test("infinite velocity",delegate{Mutate(s=>s.Velocity[1]=Double.PositiveInfinity);});
            Test("wrong vector length",delegate{Mutate(s=>s.Position=new double[4]);});
            Test("orientation normalization",delegate{Mutate(s=>s.Forward[1]=2);});
            Test("orientation orthogonality",delegate{Mutate(s=>s.Up=new double[]{0,1,0});});
            Test("camera ZXY cardinal basis",delegate
            {
                double[] f,u;CameraBasis.FromZxyDegrees(0,0,90,out f,out u);Require(Math.Abs(f[0]+1)<1e-12&&Math.Abs(f[1])<1e-12&&u[2]==1,"yaw basis");
                CameraBasis.FromZxyDegrees(90,0,0,out f,out u);Require(Math.Abs(f[2]-1)<1e-12&&Math.Abs(u[1]+1)<1e-12,"pitch basis");
                CameraBasis.FromZxyDegrees(0,90,0,out f,out u);Require(f[1]==1&&Math.Abs(u[0]-1)<1e-12,"roll basis");
            });
            Test("camera composed basis is orthonormal",delegate{for(int yaw=-180;yaw<=180;yaw+=30){double[] f,u;CameraBasis.FromZxyDegrees(32,-17,yaw,out f,out u);var s=State();s.Forward=f;s.Up=u;Protocol.Validate(s);}Reject(delegate{double[] f,u;CameraBasis.FromZxyDegrees(Double.NaN,0,0,out f,out u);});});
            Test("native units cannot silently become metres",delegate{Mutate(s=>s.Coordinates="gta-native-unscaled");});
            Test("source injection forbidden",delegate{Mutate(s=>s.SourceId="other-source");});
            Test("unknown monotonic frequency",delegate{Mutate(s=>s.ClockFrequency++);});
            Test("bounded generation and sequence",delegate{Mutate(s=>s.Generation=0);Mutate(s=>s.Sequence=9007199254740992);});
            Test("invalid state explicit",delegate{var s=State();s.Valid=false;s.Reason="getter-unavailable";Require(!Decode(Protocol.EncodeJson(s)).Valid,"validity upgraded");});
            Test("publisher snapshots are copied",delegate{var s=State();var copy=Protocol.Copy(s);s.Position[0]=99;Require(copy.Position[0]==0,"mutable alias");});
            Test("frame is little endian bounded UTF8",delegate{var f=Protocol.Frame(State());Require(BitConverter.ToInt32(f,0)==f.Length-4&&f.Length<=4100,"framing");});
            Test("duplicate and reorder rejection",delegate{var s=State(2);var v=new StateValidator();v.Accept(s,s.ObservationTicks);Reject(()=>v.Accept(s,s.ObservationTicks));var earlier=State(1);Reject(()=>v.Accept(earlier,earlier.ObservationTicks));});
            Test("duplicate observation timestamp rejected despite new sequence",delegate{var s=State();var v=new StateValidator();v.Accept(s,s.ObservationTicks);s.Sequence++;s.GameTimeMs++;Reject(()=>v.Accept(s,s.ObservationTicks));});
            Test("sequence gaps counted",delegate{var s=State();var v=new StateValidator();v.Accept(s,s.ObservationTicks);s=State(3);v.Accept(s,s.ObservationTicks);Require(v.SequenceGaps==2,"gap count");});
            Test("stale data rejected",delegate{var s=State();Reject(()=>new StateValidator().Accept(s,s.ObservationTicks+Stopwatch.Frequency));});
            Test("future timestamp rejected",delegate{var s=State();Reject(()=>new StateValidator().Accept(s,s.ObservationTicks-Stopwatch.Frequency));});
            Test("game clock reset requires generation",delegate{var s=State(2);var v=new StateValidator();v.Accept(s,s.ObservationTicks);s=State(3);s.GameTimeMs=0;Reject(()=>v.Accept(s,s.ObservationTicks));s.Generation++;v.Accept(s,s.ObservationTicks);Require(v.GenerationChanges==1,"generation count");});
            Test("generation rollback rejected",delegate{var s=State();s.Generation=2;var v=new StateValidator();v.Accept(s,s.ObservationTicks);s=State(1);Reject(()=>v.Accept(s,s.ObservationTicks));});
            Test("new session needs reconnect",delegate{var s=State();var v=new StateValidator();v.Accept(s,s.ObservationTicks);s=State(1);s.Session=new string('b',32);Reject(()=>v.Accept(s,s.ObservationTicks));new StateValidator().Accept(s,s.ObservationTicks);});
            Test("pause accepted without clock progression",delegate{var s=State();s.Paused=true;var v=new StateValidator();v.Accept(s,s.ObservationTicks);s=State(1);s.Paused=true;s.GameTimeMs=0;v.Accept(s,s.ObservationTicks);});
            Test("current-user ACL denies network identity",delegate
            {
                var security=StatePipeServer.CurrentUserSecurity();var rules=security.GetAccessRules(true,false,typeof(SecurityIdentifier)).Cast<PipeAccessRule>().ToArray();
                Require(security.AreAccessRulesProtected&&rules.Length==2,"unexpected ACL");
                Require(rules.Any(r=>r.AccessControlType==AccessControlType.Deny&&r.IdentityReference.Equals(new SecurityIdentifier(WellKnownSidType.NetworkSid,null))),"missing network deny");
                Require(rules.Any(r=>r.AccessControlType==AccessControlType.Allow&&r.IdentityReference.Equals(WindowsIdentity.GetCurrent().User)),"missing current-user allow");
            });
            Test("actual pipe fragmented framing and clean producer shutdown",delegate
            {
                string pipe=Pipe();long observed=-1;using(var server=Server(pipe,delegate(ListenerState s,double age){Require(age>=0&&age<=250,"receipt age");Interlocked.Exchange(ref observed,s.Sequence);}))
                {
                    server.Start();using(var c=Client(pipe)){var bytes=Protocol.Frame(State(7));for(int i=0;i<bytes.Length;i++)c.Write(bytes,i,1);Until(()=>server.Accepted==1);Require(Interlocked.Read(ref observed)==7&&server.Connections==1,"received value");}
                    Require(server.LastAgeMs>=0&&server.LastAgeMs<1000,"dynamic freshness");
                }
            });
            Test("oversized frame rejected before payload",delegate{string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){var size=BitConverter.GetBytes(4097);c.Write(size,0,4);Until(()=>server.Rejected==1);}Require(server.Accepted==0,"invalid frame accepted");}});
            Test("truncated payload rejected",delegate{string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){var size=BitConverter.GetBytes(100);c.Write(size,0,4);c.WriteByte(1);}Until(()=>server.Rejected==1);Require(server.Accepted==0,"truncated frame accepted");}});
            Test("truncated header rejected",delegate{string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){c.WriteByte(100);}Until(()=>server.Rejected==1);Require(server.Accepted==0,"truncated header accepted");}});
            Test("idle connection times out",delegate{string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){Until(()=>server.Rejected==1,2000);}Require(server.Accepted==0,"idle accepted");}});
            Test("stale frame rejected by actual receiver",delegate{string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){var s=State();s.ObservationTicks-=Stopwatch.Frequency;Send(c,s);Until(()=>server.Rejected==1);}Require(server.Accepted==0,"stale accepted");}});
            Test("actual producer restart and consumer reconnect",delegate
            {
                string pipe=Pipe();using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){Send(c,State(5));Until(()=>server.Accepted==1);}using(var c=Client(pipe)){var s=State();s.Session=new string('b',32);Send(c,s);Until(()=>server.Accepted==2);}Require(server.Connections==2,"reconnect missing");}
            });
            Test("publisher sends latest state and survives consumer disappearance",delegate
            {
                string pipe=Pipe();var server=Server(pipe,null);server.Start();using(var writer=new StatePublisher(pipe,2,false))
                {
                    writer.Start();long seq=0;Until(delegate{writer.Publish(State(seq++));return server.Accepted>0;});server.Dispose();
                    for(int i=0;i<15;i++){writer.Publish(State(seq++));Thread.Sleep(20);}writer.RequestStop();Until(()=>writer.Finished);Require(writer.Sent>0&&writer.Attempts<=2,"publisher bounds");
                }
            });
            Test("absent host has finite reconnect budget",delegate{using(var writer=new StatePublisher(Pipe(),2,false)){writer.Start();Until(()=>writer.Finished,3000);Require(writer.Attempts==2&&writer.Sent==0,"unbounded reconnect");}});
            Test("receiver stop while waiting is bounded",delegate{var server=Server(Pipe(),null);server.Start();Thread.Sleep(30);var w=Stopwatch.StartNew();server.Dispose();Require(w.ElapsedMilliseconds<1200,"shutdown blocked");});
            Test("same pipe can restart after shutdown",delegate{string pipe=Pipe();for(int i=0;i<3;i++)using(var server=Server(pipe,null)){server.Start();using(var c=Client(pipe)){Send(c,State());Until(()=>server.Accepted==1);}}});
            Test("lifecycle misuse fails on calling thread",delegate{var p=new StatePublisher(Pipe());p.Dispose();p.Dispose();Reject(()=>p.Start());var s=Server(Pipe(),null);s.Dispose();Reject(()=>s.Start());Reject(()=>new StatePublisher("../remote"));});
            Test("strict absent host consumes one attempt and cannot restart",delegate{using(var writer=new StatePublisher(Pipe())){writer.Start();Until(()=>writer.Finished);Require(writer.Attempts==1&&writer.Diagnostic.Stage=="connection"&&writer.Diagnostic.Terminal,"initial budget");Reject(()=>writer.Start());}});
            Test("strict acknowledged clean sender Stop agrees at both ends",delegate{string p=Pipe();using(var server=Server(p,null,true))using(var writer=new StatePublisher(p)){server.Start();writer.Start();long n=0;Until(delegate{writer.Publish(State(n++));return server.Accepted>0;});var watch=Stopwatch.StartNew();writer.RequestStop();Require(watch.ElapsedMilliseconds<50,"Stop blocks calling game thread");Until(()=>writer.Finished&&server.Finished);Require(server.Rejected==0&&writer.Error==null&&writer.Diagnostic.Outcome=="deliberate-stop"&&server.Diagnostic.Outcome=="deliberate-stop","clean stop mismatch");Require(writer.Attempts==1&&server.Connections==1,"retry");}});
            Test("strict invalid length attribution",delegate{StrictFailure("length",c=>c.Write(BitConverter.GetBytes(4097),0,4));});
            Test("strict truncated header attribution",delegate{StrictFailure("header",c=>c.WriteByte(1));});
            Test("strict truncated payload attribution",delegate{StrictFailure("payload",delegate(NamedPipeClientStream c){c.Write(BitConverter.GetBytes(100),0,4);c.WriteByte(1);});});
            Test("strict invalid UTF8 attribution",delegate{StrictFailure("decoding",delegate(NamedPipeClientStream c){c.Write(BitConverter.GetBytes(1),0,4);c.WriteByte(255);});});
            Test("strict first schema rejection attribution",delegate{StrictFailure("schema",delegate(NamedPipeClientStream c){var b=Encoding.UTF8.GetBytes("{}");c.Write(BitConverter.GetBytes(b.Length),0,4);c.Write(b,0,b.Length);});});
            Test("strict signed future rejection diagnostics and peer termination",delegate{string p=Pipe();using(var server=Server(p,null,true))using(var writer=new StatePublisher(p)){server.Start();writer.Start();var x=State();x.ObservationTicks+=Stopwatch.Frequency;writer.Publish(x);Until(()=>writer.Finished&&server.Finished);Require(server.Accepted==0&&server.Diagnostic.Stage=="freshness"&&server.Diagnostic.FirstFrame.DecisionAgeMs < -2&&server.Diagnostic.FirstFrame.AgeClass=="future-dated","future signed evidence");Require(writer.Sent==0&&writer.Attempts==1&&!server.Diagnostic.AnotherAttempt,"strict peer terminal");}});
            Test("startup stale discard retains actual decision age before terminal idle deadline",delegate{string p=Pipe();using(var server=Server(p,null,true)){server.Start();using(var c=DuplexClient(p)){var x=State();x.ObservationTicks-=Stopwatch.Frequency;Send(c,x);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);Until(()=>server.Finished);}Require(server.Diagnostic.FirstFrame.DecisionAgeMs>250&&server.Diagnostic.FirstFrame.AgeClass=="too-old"&&!server.Diagnostic.HadAcceptedFrame&&server.StartupDiscarded==1&&server.FirstAcceptedFrame==null&&server.Diagnostic.Code=="deadline","stale signed evidence");}});
            Test("later rejection preserves first-frame timing",delegate{string p=Pipe();using(var server=Server(p,null,true))using(var writer=new StatePublisher(p)){server.Start();writer.Start();writer.Publish(State(0));Until(()=>writer.Sent==1);double? age=server.FirstFrame.DecisionAgeMs;var x=State(1);x.ObservationTicks+=Stopwatch.Frequency;writer.Publish(x);Until(()=>server.Finished&&writer.Finished);Require(server.FirstFrame.DecisionAgeMs==age&&server.FirstFrame.AgeClass=="within-bounds","first timing overwritten");Require(server.Diagnostic.OffendingFrame.FrameOrdinal==2&&server.Diagnostic.OffendingFrame.AgeClass=="future-dated"&&server.Diagnostic.OffendingFrame.DecisionAgeMs < -2,"offending timing missing");}});
            Test("first publication and first transmitted state remain distinct",delegate{string p=Pipe();using(var server=Server(p,null,true))using(var writer=new StatePublisher(p)){writer.Publish(State(0));writer.Publish(State(1));server.Start();writer.Start();Until(()=>writer.Sent==1);writer.RequestStop();Until(()=>writer.Finished&&server.Finished);Require(writer.FirstPublishedSequence==0&&writer.FirstTransmittedSequence==1&&writer.FirstFrame.CopyMs.HasValue,"publication attribution");}});
            Test("startup stale then fresh uses one connection and never forwards old",delegate{
                string p=Pipe();long callbackSequence=-1;int callbacks=0;
                using(var server=Server(p,delegate(ListenerState s,double age){Require(age<=250,"old callback");callbackSequence=s.Sequence;Interlocked.Increment(ref callbacks);},true)){
                    server.Start();using(var c=DuplexClient(p)){
                        var stale=State(0);stale.ObservationTicks-=Stopwatch.Frequency;Send(c,stale);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);
                        Require(server.Accepted==0&&callbacks==0&&Double.IsPositiveInfinity(server.LastAgeMs),"discard forwarded");
                        Send(c,State(1));TransportStop.Ack(c,TransportStop.Accepted);
                        Require(server.Accepted==1&&callbacks==1&&callbackSequence==1&&server.StartupDiscarded==1,"fresh not accepted");
                        Require(server.FirstFrame.FrameSequence==0&&server.FirstFrame.AgeClass=="too-old"&&server.FirstAcceptedFrame.FrameSequence==1&&server.FirstAcceptedFrame.AgeClass=="within-bounds","first wire evidence overwritten");
                        TransportStop.Write(c,TransportStop.Frame());TransportStop.Ack(c,TransportStop.Stopped);
                    }Until(()=>server.Finished);Require(server.Connections==1&&!server.Diagnostic.AnotherAttempt&&server.Rejected==0,"startup retry/rejection");
                }
            });
            Test("startup discard budget is exactly four and fifth stale is terminal",delegate{string p=Pipe();using(var server=Server(p,null,true)){server.Start();using(var c=DuplexClient(p)){
                for(int i=0;i<4;i++){var x=State(i);x.ObservationTicks-=Stopwatch.Frequency;Send(c,x);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);}
                var fifth=State(4);fifth.ObservationTicks-=Stopwatch.Frequency;Send(c,fifth);Until(()=>server.Finished);
            }Require(server.StartupDiscarded==4&&server.Accepted==0&&server.Connections==1&&server.Diagnostic.Stage=="freshness"&&server.Diagnostic.OffendingFrame.FrameOrdinal==5,"startup count not bounded");}});
            Test("startup absolute deadline cannot be renewed by more stale frames",delegate{string p=Pipe();using(var server=Server(p,null,true)){server.Start();using(var c=DuplexClient(p)){
                var x=State(0);x.ObservationTicks-=Stopwatch.Frequency;Send(c,x);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);Thread.Sleep(550);
                x=State(1);x.ObservationTicks-=Stopwatch.Frequency;Send(c,x);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);var wait=Stopwatch.StartNew();Until(()=>server.Finished,800);
                Require(wait.ElapsedMilliseconds<700,"startup budget renewed");
            }Require(server.Accepted==0&&server.StartupDiscarded==2&&server.Diagnostic.Code=="deadline"&&server.Connections==1,"startup deadline not terminal");}});
            Test("post-accept stale frame remains terminal",delegate{StrictFailure("freshness",delegate(NamedPipeClientStream c){var x=State();x.ObservationTicks-=Stopwatch.Frequency*200/1000;Send(c,x);TransportStop.Ack(c,TransportStop.Accepted);Thread.Sleep(100);x.Sequence++;x.ObservationTicks++;x.GameTimeMs++;Send(c,x);});});
            Test("startup discard retains identity ordering clocks and generation",delegate{
                Action<ListenerState>[] mutations={s=>s.Session=new string('b',32),s=>s.Sequence=0,s=>s.Generation=1,s=>s.GameTimeMs=0,s=>s.ObservationTicks=1,s=>s.ObservationTicks+=Stopwatch.Frequency,s=>s.ClockFrequency++};
                foreach(var mutation in mutations){var validator=new StateValidator();var first=State();first.Generation=2;first.GameTimeMs=50;first.ObservationTicks-=Stopwatch.Frequency;
                    Require(!validator.AcceptOrDiscardStartup(first,Stopwatch.GetTimestamp(),true)&&validator.LastAgeMs==0,"old validator accepted");
                    var next=State(1);next.Generation=2;next.GameTimeMs=100;mutation(next);Reject(()=>validator.AcceptOrDiscardStartup(next,Stopwatch.GetTimestamp(),true));
                }
            });
            Test("stale duplicate still faults before freshness discard",delegate{StrictFailure("sequence",delegate(NamedPipeClientStream c){var x=State();x.ObservationTicks-=Stopwatch.Frequency;Send(c,x);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);Send(c,x);});});
            Test("validator cannot reopen startup after a fresh observation",delegate{var validator=new StateValidator();var first=State();validator.Accept(first,first.ObservationTicks);var next=State(1);next.ObservationTicks=first.ObservationTicks+1;Reject(()=>validator.AcceptOrDiscardStartup(next,next.ObservationTicks+Stopwatch.Frequency,true));});
            Test("actual receiver preserves terminal faults following a discarded startup frame",delegate{
                foreach(string fault in new[]{"session","generation","game-clock","future","schema"}){
                    StrictFailure(fault=="future"?"freshness":fault=="schema"?"schema":"sequence",delegate(NamedPipeClientStream c){
                        var first=State();first.Generation=2;first.GameTimeMs=100;first.ObservationTicks-=Stopwatch.Frequency;Send(c,first);TransportStop.Ack(c,TransportStop.StartupStaleDiscarded);
                        var next=State(1);next.Generation=2;next.GameTimeMs=150;
                        if(fault=="session")next.Session=new string('b',32);else if(fault=="generation")next.Generation=1;else if(fault=="game-clock")next.GameTimeMs=0;else if(fault=="future")next.ObservationTicks+=Stopwatch.Frequency;
                        if(fault=="schema"){var bytes=Encoding.UTF8.GetBytes("{}");c.Write(BitConverter.GetBytes(bytes.Length),0,4);c.Write(bytes,0,bytes.Length);}else Send(c,next);
                    });
                }
            });
#if TRANSPORT_STARTUP_TEST
            Test("actual publisher survives receive scheduling delay with explicit discard acknowledgement",delegate{
                string p=Pipe();int held=0,callbacks=0;using(var server=Server(p,delegate{Interlocked.Increment(ref callbacks);},true))using(var writer=new StatePublisher(p)){
                    server.BeforeDecodeTest=delegate{if(Interlocked.Increment(ref held)==1)Thread.Sleep(195);};
                    server.Start();writer.Start();var first=State();first.ObservationTicks-=Stopwatch.Frequency*90/1000;writer.Publish(first);
                    Until(()=>writer.StartupDiscarded==1);Require(writer.Sent==0&&callbacks==0&&server.Accepted==0,"discard counted accepted");
                    var fresh=State(1);writer.Publish(fresh);Until(()=>writer.Sent==1);writer.RequestStop();Until(()=>writer.Finished&&server.Finished);
                    Require(writer.Attempts==1&&server.Connections==1&&writer.Transmitted==2&&writer.FirstTransmittedSequence==0&&writer.FirstFrame.FrameSequence==0&&writer.FirstAcceptedFrame.FrameSequence==1,"same-connection sender bookkeeping");
                    Require(writer.FirstFrame.ObservationTicks==first.ObservationTicks&&server.FirstFrame.ObservationTicks==first.ObservationTicks&&writer.FirstFrame.ClockFrequency==first.ClockFrequency&&server.FirstFrame.ClockFrequency==first.ClockFrequency,"first wire timestamp changed");
                    Require(writer.FirstAcceptedFrame.ObservationTicks==fresh.ObservationTicks&&server.FirstAcceptedFrame.ObservationTicks==fresh.ObservationTicks&&writer.FirstAcceptedFrame.ClockFrequency==fresh.ClockFrequency&&server.FirstAcceptedFrame.ClockFrequency==fresh.ClockFrequency,"first accepted timestamp changed");
                    Require(server.FirstFrame.PayloadReceivedAgeMs<=250&&server.FirstFrame.DecisionAgeMs>250&&server.FirstFrame.DecodeMs>=190&&server.FirstAcceptedFrame.DecisionAgeMs<=250,"stage timing omitted");
                    Require(server.Diagnostic.Outcome=="deliberate-stop"&&writer.Diagnostic.Outcome=="deliberate-stop"&&server.Rejected==0,"startup recovery failed");
                }
            });
#endif
            Test("server shutdown completion exposes in-flight callback and prevents later callbacks",delegate{
                string p=Pipe();int calls=0;using(var entered=new ManualResetEvent(false))using(var release=new ManualResetEvent(false))using(var server=Server(p,delegate{Interlocked.Increment(ref calls);entered.Set();release.WaitOne(1000);},true)){
                    server.Start();using(var c=DuplexClient(p)){Send(c,State());Require(entered.WaitOne(1000),"callback not entered");Require(!server.StopAndWait(10)&&!server.ShutdownCompleted,"in-flight callback falsely joined");release.Set();Require(server.StopAndWait(1000)&&server.ShutdownCompleted&&calls==1,"callback outlived join");}
                }
            });
            Test("concurrent publisher Stop and Dispose cannot signal a disposed event",delegate{
                for(int i=0;i<40;i++)using(var go=new ManualResetEvent(false)){
                    var writer=new StatePublisher(Pipe());Exception failure=null;
                    var stopper=new Thread(delegate(){go.WaitOne();try{writer.RequestStop();}catch(Exception e){failure=e;}});
                    var disposer=new Thread(delegate(){go.WaitOne();try{writer.Dispose();}catch(Exception e){failure=e;}});
                    stopper.Start();disposer.Start();go.Set();Require(stopper.Join(1000)&&disposer.Join(1000),"shutdown deadlock");Require(failure==null,"shutdown event lifetime race");writer.Dispose();Reject(()=>writer.Start());
                }
            });
            Test("strict duplicate after accepted frame attribution",delegate{StrictFailure("sequence",delegate(NamedPipeClientStream c){var s=State();Send(c,s);TransportStop.Ack(c,1);Send(c,s);});});
            Test("strict clean EOF is terminal but not an invalid frame",delegate{string p=Pipe();using(var server=Server(p,null,true)){server.Start();using(var c=Client(p)){Until(()=>server.Connections==1);}Until(()=>server.Finished);Require(server.Rejected==0&&server.Diagnostic.Code=="clean-eof"&&server.Diagnostic.Outcome=="unexpected-eof","EOF classification");}});
            Test("strict midstream EOF is terminal without reconnect",delegate{StrictFailure("connection",delegate(NamedPipeClientStream c){Send(c,State());TransportStop.Ack(c,1);});});
            Test("strict timeout attribution",delegate{StrictFailure("header",c=>Thread.Sleep(850));});
            Test("strict callback failure attribution and sanitisation",delegate{string p=Pipe();using(var server=Server(p,delegate{throw new Exception("PRIVATE-PAYLOAD-DO-NOT-LOG");},true)){server.Start();using(var c=Client(p)){Send(c,State());Until(()=>server.Finished);}Require(server.Diagnostic.Stage=="callback"&&server.Diagnostic.Code=="consumer-failed"&&!server.Diagnostic.HadAcceptedFrame,"callback attribution");using(var ms=new MemoryStream()){new System.Runtime.Serialization.Json.DataContractJsonSerializer(typeof(TransportResult)).WriteObject(ms,server.Diagnostic);string json=Encoding.UTF8.GetString(ms.ToArray());Require(!json.Contains("PRIVATE")&&!json.Contains(Session)&&!json.Contains("position")&&!json.Contains("velocity"),"private diagnostics leaked");}}});
            Test("strict host disappears before sender and worker terminates",delegate{string p=Pipe();var server=Server(p,null,true);using(var writer=new StatePublisher(p)){server.Start();writer.Start();long n=0;Until(delegate{writer.Publish(State(n++));return server.Accepted>0;});server.Dispose();writer.Publish(State(n++));Until(()=>writer.Finished);Require(writer.Attempts==1&&writer.Diagnostic.Outcome=="failed","unexpected consumer exit hidden");}});
            Test("strict rejection terminates both ends without new attempt",delegate{string p=Pipe();using(var server=Server(p,null,true))using(var writer=new StatePublisher(p)){server.Start();writer.Start();writer.Publish(State(0));Until(()=>server.Accepted==1);writer.Publish(State(0));Until(()=>writer.Finished&&server.Finished);Require(server.Diagnostic.Stage=="sequence"&&writer.Diagnostic.Outcome=="failed"&&writer.Attempts==1,"peer rejection recovered");}});
            Test("activation permit cannot rearm after failure or stop",delegate{var permit=new SessionPermit();Require(permit.TryConsume(),"initial activation");for(int i=0;i<20;i++)Require(!permit.TryConsume(),"second activation reused approval");});
            Console.WriteLine("{\"suite\":\"listener-transport\",\"passed\":"+tests+",\"failed\":0,\"liveGta\":false}");return 0;
        }
        catch(Exception e){Console.Error.WriteLine("FAIL "+e);return 1;}
    }
}
