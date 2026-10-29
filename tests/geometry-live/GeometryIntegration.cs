// Actual C# capture/pipe/host queue/relay + Node worker/producer, no WASAPI entry.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.GeometryResearch;
using RichAudio.GeometryLive;
namespace RichAudio.Beacon.Windows
{
    public sealed class AnalyticWorld:IGeometryWorld
    {
        public int Queries,Interior;public bool Invalid,OnFoot=true;public double Speed;
        public WorldPose ReadPose(){return new WorldPose{Position=new Point3(0,0,0),Forward=new Point3(0,1,0),Player=1,
            Interior=Interior,Speed=Speed,Story=true,OnFoot=OnFoot};}
        public Collision Query(PlannedRay r,uint player){Queries++;if(Invalid)return new Collision{Hit=false};
            Point3 d=Point3.Sub(r.End,r.Origin);bool ground=d.Z< -7;double t=ground?(.5-r.Origin.Z)/d.Z:(.5-r.Origin.Y)/d.Y;
            return new Collision{Hit=true,Position=new Point3(r.Origin.X+t*d.X,r.Origin.Y+t*d.Y,r.Origin.Z+t*d.Z),
                Normal=ground?new Point3(0,0,1):new Point3(0,-1,0)};}
    }
    public sealed class ManualGeometryClock:IGeometryClock
    {
        public double Ms;public long Start=Stopwatch.GetTimestamp();public double Milliseconds{get{return Ms;}}
        public long Ticks{get{return Start+(long)(Ms*Frequency/1000);}}public long Frequency{get{return Stopwatch.Frequency;}}
        public ClockPair Pair(){return new ClockPair{ObservationMs=Ms,ListenerTicks=Ticks,UncertaintyMs=2*1000.0/Frequency};}
    }
    public static class GeometryIntegration
    {
        private static int checks,blocks;private static Exception readerError;
        private static void Check(bool test,string label){if(!test)throw new Exception(label);checks++;}
        private static ListenerState Listener(long sequence,double time){double angle=Math.Max(0,Math.Min(1,time-1))*.6;
            return new ListenerState{Version=1,Session=new string('a',32),Generation=1,Sequence=sequence,ObservationTicks=Stopwatch.GetTimestamp(),
                ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(time*1000),Position=new[]{.3+.02*Math.Sin(angle),.1,.7},Velocity=new[]{time>1&&time<2?.012*Math.Cos(angle):0.0,0,0},
                Forward=new[]{-Math.Cos(angle),-Math.Sin(angle),0},Up=new[]{0.0,0,1},ListenerKind="camera",VelocityKind="estimated-camera-difference",
                Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"};}
        private static void KernelTests(){
            var c=new ManualGeometryClock();var w=new AnalyticWorld();var packets=new List<GeometryPacket>();var s=Listener(0,0);
            var capture=new SensingSession(w,c,s,new string('c',32),Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",packets.Add);
            for(int i=0;i<9;i++){c.Ms=i*50;capture.Step(s);}
            Check(packets.Count==1&&packets[0].Groups[0].TraceCalls==9,"qualified nine-ray publication");
            GeometryWire.Validate(packets[0],c.Ticks);Check(PatchReconstruction.Fit(packets[0].Groups[0]).Count==4,"finite support retained");
            double finish=packets[0].Groups[0].FinishedMs;c.Ms=1500;packets[0].SentTicks=c.Ticks;
            bool rejected=false;try{GeometryWire.Validate(packets[0],c.Ticks);}catch(InvalidDataException){rejected=true;}
            Check(rejected&&packets[0].Groups[0].FinishedMs==finish,"fresh forwarding cannot renew old geometry");
            foreach(string condition in new[]{"interior","session","speed","vehicle","invalid"}){
                c=new ManualGeometryClock();w=new AnalyticWorld();packets=new List<GeometryPacket>();s=Listener(0,0);
                capture=new SensingSession(w,c,s,Guid.NewGuid().ToString("N"),Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",packets.Add);
                capture.Step(s);int before=w.Queries;c.Ms=50;
                if(condition=="interior")w.Interior=1;if(condition=="session")s.Session=new string('b',32);
                if(condition=="speed")w.Speed=.3;if(condition=="vehicle")w.OnFoot=false;if(condition=="invalid")w.Invalid=true;
                capture.Step(s);Check(capture.Stopped,"failure stops sensing: "+condition);
                Check(w.Queries==before+(condition=="invalid"?1:0),"guard before additional query: "+condition);
                Check(packets.Count==1&&packets[0].Status=="unavailable","failure publication: "+condition);
            }
            c=new ManualGeometryClock();w=new AnalyticWorld();s=Listener(0,0);packets=new List<GeometryPacket>();
            capture=new SensingSession(w,c,s,Guid.NewGuid().ToString("N"),Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",packets.Add);
            for(int i=0;i<200;i++){c.Ms=i*50;capture.Step(s);}Check(w.Queries==72&&capture.Stopped,"bounded total native calls");
            var real=new GeometryClock();var a=real.Pair();Thread.Sleep(110);var b=real.Pair();
            Check(b.ObservationMs>a.ObservationMs&&b.ListenerTicks>a.ListenerTicks&&a.UncertaintyMs>0&&b.UncertaintyMs>0,"authentic nonzero paired timing evidence");
        }
        public static int Main(string[] args){try{
            KernelTests();TransportTests();if(args.Length<2){Console.WriteLine("PASS capture/clock/transport kernel "+checks);return 0;}
            string root=Path.GetFullPath(args[0]),dest=Path.GetFullPath(args[1]);
            Check(dest.StartsWith(Path.Combine(root,".local")+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"private fixture destination");
            for(var d=new DirectoryInfo(dest);d!=null;d=d.Parent)Check(!d.Exists||(d.Attributes&FileAttributes.ReparsePoint)==0,"unlinked fixture output");
            Check(!Directory.Exists(dest)&&!File.Exists(dest),"fresh fixture destination");Directory.CreateDirectory(dest);
            string token=Guid.NewGuid().ToString("N"),listenerPipe="RichAudio.GeometryFixture.Listener."+token,geometryPipe="RichAudio.GeometryFixture.Geometry."+token;
            var child=new Process{StartInfo=new ProcessStartInfo{FileName="node.exe",WorkingDirectory=root,Arguments="\""+Path.Combine(root,"tools","Run-Acoustics07.mjs")+"\" --geometry-input required --trace-blocks yes --history-diagnostics yes",
                UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};child.Start();
            var model=GeometryModel.Parse("{\"basis\":\"declared-demonstration-scale\",\"metresPerNativeUnit\":10,\"sourceOffsetNative\":[-0.6,0,0.1],\"reference\":\"original-analytic-native-source\"}");
            StatePipeServer listenerServer=null;listenerServer=new StatePipeServer(listenerPipe,HostProgram.ListenerReceived,true,delegate{});
            HostProgram.BeginGeometryFixture(child,model,delegate{return listenerServer.PeerProcessId;},geometryPipe);listenerServer.Start();
            var writer=new StatePublisher(listenerPipe);writer.Start();
            var reader=new Thread(delegate(){try{using(var file=new FileStream(Path.Combine(dest,"stream.f32"),FileMode.CreateNew,FileAccess.Write)){
                byte[] header=new byte[16],body=new byte[4096];uint seq=0;while(BlockProtocol.ReadExact(child.StandardOutput.BaseStream,header,16)){
                    BlockProtocol.ValidateHeader(header,seq++);if(!BlockProtocol.ReadExact(child.StandardOutput.BaseStream,body,4096))throw new EndOfStreamException();file.Write(body,0,4096);Interlocked.Increment(ref blocks);}
            }}catch(Exception e){readerError=e;}}){IsBackground=true};reader.Start();
            HostProgram.GeometryFixtureSend("{\"type\":\"credit\",\"blocks\":4}");int granted=4;
            var wall=Stopwatch.StartNew();HostProgram.BeforeFixtureStage=delegate{double t=wall.Elapsed.TotalSeconds;if(t>.95&&t<1.25)Thread.Sleep(20);};
            double nextListener=0,nextCredit=0;long sequence=0;GeometryPublisher publisher=null;SensingSession sensing=null;
            var world=new AnalyticWorld();bool began=false,failed=false,restarted=false,disconnected=false,emission=false;
            while(wall.Elapsed.TotalSeconds<5.4){double now=wall.Elapsed.TotalSeconds;
                if(now*1000>=nextListener){nextListener=now*1000+50;var state=Listener(sequence++,now);writer.Publish(state);
                    if(!began&&now>.15){publisher=new GeometryPublisher(geometryPipe);sensing=new SensingSession(world,new GeometryClock(),state,Guid.NewGuid().ToString("N"),
                        Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",publisher.Publish);publisher.Start();began=true;}
                    if(!emission&&now>.3){HostProgram.GeometryFixtureSend("{\"type\":\"control\",\"command\":\"start\"}");emission=true;}
                    if(!failed&&now>1.5){world.Invalid=true;failed=true;}
                    if(sensing!=null&&publisher.Connected&&now<3.25){sensing.Step(state);if(sensing.Stopped){publisher.Complete();sensing=null;}}
                    if(!restarted&&now>2){world.Invalid=false;world.Interior=1;publisher=new GeometryPublisher(geometryPipe);sensing=new SensingSession(world,new GeometryClock(),state,Guid.NewGuid().ToString("N"),
                        Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",publisher.Publish);publisher.Start();restarted=true;}
                    if(!disconnected&&now>4.4){publisher.RequestStop();sensing=null;disconnected=true;}
                }
                if(now*1000>=nextCredit&&granted-Volatile.Read(ref blocks)<4){HostProgram.GeometryFixtureSend("{\"type\":\"credit\",\"blocks\":1}");granted++;nextCredit=now*1000+512000.0/48000;}
                if(child.HasExited)throw new Exception("producer exited during geometry scenario");Thread.Sleep(1);
            }
            if(publisher!=null)publisher.Dispose();writer.RequestStop();writer.Dispose();listenerServer.Dispose();
            var metrics=HostProgram.EndGeometryFixture();reader.Join(1500);Check(readerError==null,"RA07 stream complete");Check(child.ExitCode==0,"producer clean shutdown");
            File.WriteAllLines(Path.Combine(dest,"renderer.txt"),HostProgram.GeometryFixtureDiagnostics());
            var json=new JavaScriptSerializer{MaxJsonLength=1048576};File.WriteAllText(Path.Combine(dest,"relay.json"),json.Serialize(metrics));
            Check(Convert.ToInt64(metrics["forwarded"])>=2,"actual measured relay geometry delivery");
            Check(Convert.ToDouble(metrics["maximumObservedRoundTripMs"])>10&&Convert.ToInt64(metrics["rejected"])>0,"actual delayed stage rejected");
            Check(Convert.ToDouble(metrics["maximumAcceptedRoundTripMs"])<=10,"no unmeasured relaxed delivery limit");
            Console.WriteLine(json.Serialize(new Dictionary<string,object>{{"checks",checks},{"blocks",blocks},{"geometryForwarded",metrics["forwarded"]},
                {"maximumAcceptedRoundTripMs",metrics["maximumAcceptedRoundTripMs"]}}));return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
        private static GeometryPacket ClockPacket(){var clock=new GeometryClock();var a=clock.Pair();Thread.Sleep(110);var b=clock.Pair();
            return new GeometryPacket{Schema=1,SourcePid=Process.GetCurrentProcess().Id,ListenerSession=new string('a',32),ListenerGeneration=1,
                GeometrySession=new string('d',32),ClockId="geometry-"+new string('d',32),Build="1.0.1158.16",Framework="1.132.1428.17748",
                Frequency=Stopwatch.Frequency,Pairs=new[]{a,b},SentTicks=Stopwatch.GetTimestamp(),Sequence=0,Status="unavailable",Groups=new TileGroup[0]};}
        private static void Wait(Func<bool> condition){var w=Stopwatch.StartNew();while(!condition()&&w.ElapsedMilliseconds<2000)Thread.Sleep(2);Check(condition(),"bounded transport completion");}
        private static void SendPacket(string name,GeometryPacket p){using(var client=new NamedPipeClientStream(".",name,PipeDirection.Out,PipeOptions.Asynchronous)){client.Connect(1000);p.SentTicks=Stopwatch.GetTimestamp();GeometryWire.Write(client,GeometryWire.Encode(p));}}
        private static void TransportTests(){
            string name="RichAudio.GeometryWire."+Guid.NewGuid().ToString("N");int accepted=0;
            using(var server=new GeometryPipeServer(name,delegate{Interlocked.Increment(ref accepted);},delegate{})){
                server.Start();var p=ClockPacket();p.SourcePid++;SendPacket(name,p);Wait(()=>server.Rejected>=1);Check(accepted==0,"OS peer PID mismatch rejected");
                p=ClockPacket();SendPacket(name,p);Wait(()=>accepted==1);Check(server.Accepted==1,"real bounded frame accepted");
                using(var client=new NamedPipeClientStream(".",name,PipeDirection.Out,PipeOptions.Asynchronous)){client.Connect(1000);TransportStop.Write(client,BitConverter.GetBytes(GeometryWire.MaximumBytes+1));}
                Wait(()=>server.Rejected>=2);Check(accepted==1,"oversize frame rejected before payload allocation");
                p=ClockPacket();p.Pairs[1].ListenerTicks+=Stopwatch.Frequency/20;SendPacket(name,p);Wait(()=>server.Rejected>=3);Check(accepted==1,"incompatible clock pairs rejected");
            }
            name="RichAudio.GeometryContext."+Guid.NewGuid().ToString("N");
            using(var relay=new GeometryHostRelay(delegate{},delegate{return (uint)Process.GetCurrentProcess().Id;},
                GeometryModel.Parse("{\"basis\":\"declared-demonstration-scale\",\"metresPerNativeUnit\":1,\"sourceOffsetNative\":[1,0,0],\"reference\":\"test-native-model\"}"),name)){
                relay.Start();relay.Listener(Listener(0,0));var p=ClockPacket();relay.Listener(Listener(1,.15));p.ListenerSession=new string('b',32);SendPacket(name,p);
                Wait(()=>Convert.ToInt64(relay.Metrics()["pipeRejected"])>=1);Check(relay.Forwarded==0,"unaccepted listener session rejected");
                p=ClockPacket();relay.Listener(Listener(2,.3));p.ListenerGeneration=2;SendPacket(name,p);
                Wait(()=>Convert.ToInt64(relay.Metrics()["pipeRejected"])>=2);Check(relay.Forwarded==0,"listener generation mismatch rejected");
            }
        }
    }
}
