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
    private static int tests;private static readonly string Session=new string('a',32);
    private static void Require(bool value,string message){if(!value)throw new Exception(message);}
    private static void Test(string name,Action action){action();tests++;Console.WriteLine("PASS "+name);}
    private static void Reject(Action action){bool rejected=false;try{action();}catch{rejected=true;}Require(rejected,"invalid input accepted");}
    private static ListenerState State(long n=0){return Protocol.Synthetic(Session,n,0);}
    private static ListenerState Decode(string json){var bytes=Encoding.UTF8.GetBytes(json);return Protocol.Decode(bytes,bytes.Length);}
    private static void Until(Func<bool> condition,int ms=2500){var w=Stopwatch.StartNew();while(!condition()&&w.ElapsedMilliseconds<ms)Thread.Sleep(10);Require(condition(),"bounded wait failed");}
    private static string Pipe(){return "RichAudio.Test."+Guid.NewGuid().ToString("N");}
    private static NamedPipeClientStream Client(string name){var c=new NamedPipeClientStream(".",name,PipeDirection.Out,PipeOptions.Asynchronous);c.Connect(1500);return c;}
    private static void Send(NamedPipeClientStream c,ListenerState state){var b=Protocol.Frame(state);c.Write(b,0,b.Length);c.Flush();}
    private static void Mutate(Action<ListenerState> change){var s=State();change(s);Reject(delegate{Protocol.Encode(s);});}
    private static void Pace(long start,int sample){double due=start+sample*Stopwatch.Frequency/20.0;while(Stopwatch.GetTimestamp()<due)Thread.Sleep(1);}
    private static int MeasureTransport()
    {
        const int count=100;var ages=new double[count];int received=0;string pipe=Pipe();long memoryBefore=GC.GetTotalMemory(true);int collections=GC.CollectionCount(0);var watch=Stopwatch.StartNew();
        using(var server=new StatePipeServer(pipe,delegate(ListenerState s,double age){int index=received;if(index<count){ages[index]=age;Interlocked.Increment(ref received);}}))
        using(var writer=new StatePublisher(pipe))
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
    public static int Main(string[] args)
    {
        try
        {
            if(args.Length>0&&(args[0]=="--send"||args[0]=="--send-step"))return SyntheticSender(args);
            if(args.Length==1&&args[0]=="--measure")return MeasureTransport();
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
                string pipe=Pipe();long observed=-1;using(var server=new StatePipeServer(pipe,delegate(ListenerState s,double age){Require(age>=0&&age<=250,"receipt age");Interlocked.Exchange(ref observed,s.Sequence);}))
                {
                    server.Start();using(var c=Client(pipe)){var bytes=Protocol.Frame(State(7));for(int i=0;i<bytes.Length;i++)c.Write(bytes,i,1);Until(()=>server.Accepted==1);Require(Interlocked.Read(ref observed)==7&&server.Connections==1,"received value");}
                    Require(server.LastAgeMs>=0&&server.LastAgeMs<1000,"dynamic freshness");
                }
            });
            Test("oversized frame rejected before payload",delegate{string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){var size=BitConverter.GetBytes(4097);c.Write(size,0,4);Until(()=>server.Rejected==1);}Require(server.Accepted==0,"invalid frame accepted");}});
            Test("truncated payload rejected",delegate{string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){var size=BitConverter.GetBytes(100);c.Write(size,0,4);c.WriteByte(1);}Until(()=>server.Rejected==1);Require(server.Accepted==0,"truncated frame accepted");}});
            Test("truncated header rejected",delegate{string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){c.WriteByte(100);}Until(()=>server.Rejected==1);Require(server.Accepted==0,"truncated header accepted");}});
            Test("idle connection times out",delegate{string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){Until(()=>server.Rejected==1,2000);}Require(server.Accepted==0,"idle accepted");}});
            Test("stale frame rejected by actual receiver",delegate{string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){var s=State();s.ObservationTicks-=Stopwatch.Frequency;Send(c,s);Until(()=>server.Rejected==1);}Require(server.Accepted==0,"stale accepted");}});
            Test("actual producer restart and consumer reconnect",delegate
            {
                string pipe=Pipe();using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){Send(c,State(5));Until(()=>server.Accepted==1);}using(var c=Client(pipe)){var s=State();s.Session=new string('b',32);Send(c,s);Until(()=>server.Accepted==2);}Require(server.Connections==2,"reconnect missing");}
            });
            Test("publisher sends latest state and survives consumer disappearance",delegate
            {
                string pipe=Pipe();var server=new StatePipeServer(pipe,null);server.Start();using(var writer=new StatePublisher(pipe,2))
                {
                    writer.Start();long seq=0;Until(delegate{writer.Publish(State(seq++));return server.Accepted>0;});server.Dispose();
                    for(int i=0;i<15;i++){writer.Publish(State(seq++));Thread.Sleep(20);}writer.RequestStop();Until(()=>writer.Finished);Require(writer.Sent>0&&writer.Attempts<=2,"publisher bounds");
                }
            });
            Test("absent host has finite reconnect budget",delegate{using(var writer=new StatePublisher(Pipe(),2)){writer.Start();Until(()=>writer.Finished,3000);Require(writer.Attempts==2&&writer.Sent==0,"unbounded reconnect");}});
            Test("receiver stop while waiting is bounded",delegate{var server=new StatePipeServer(Pipe(),null);server.Start();Thread.Sleep(30);var w=Stopwatch.StartNew();server.Dispose();Require(w.ElapsedMilliseconds<1200,"shutdown blocked");});
            Test("same pipe can restart after shutdown",delegate{string pipe=Pipe();for(int i=0;i<3;i++)using(var server=new StatePipeServer(pipe,null)){server.Start();using(var c=Client(pipe)){Send(c,State());Until(()=>server.Accepted==1);}}});
            Test("lifecycle misuse fails on calling thread",delegate{var p=new StatePublisher(Pipe());p.Dispose();p.Dispose();Reject(()=>p.Start());var s=new StatePipeServer(Pipe(),null);s.Dispose();Reject(()=>s.Start());Reject(()=>new StatePublisher("../remote"));});
            Console.WriteLine("{\"suite\":\"listener-transport\",\"passed\":"+tests+",\"failed\":0,\"liveGta\":false}");return 0;
        }
        catch(Exception e){Console.Error.WriteLine("FAIL "+e);return 1;}
    }
}
