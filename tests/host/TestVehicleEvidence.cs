using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Tests
{
    public static class TestVehicleEvidence
    {
        private static int checks;
        private static void Check(bool condition,string name){checks++;if(!condition)throw new Exception(name);}
        private static void Reject(Action action,string name){bool failed=false;try{action();}catch(InvalidDataException){failed=true;}catch(System.Runtime.Serialization.SerializationException){failed=true;}catch(System.Xml.XmlException){failed=true;}catch(DecoderFallbackException){failed=true;}Check(failed,name);}
        private static VehiclePacket Packet(long seq=0){return new VehiclePacket{Version=1,Session=new string('a',32),ListenerGeneration=1,Generation=1,Sequence=seq,ObservationTicks=Stopwatch.GetTimestamp(),ClockFrequency=Stopwatch.Frequency,GameTimeMs=seq*50,SourcePid=(uint)Process.GetCurrentProcess().Id,VehicleId="fixture-player-1",Model=123,Profile="original-hypercar-v12",Action="update",Position=new double[]{0,0,0},Velocity=new double[]{0,0,0},Forward=new double[]{0,1,0},Up=new double[]{0,0,1},Speed=0,EngineRunning=true,RpmRatio=.2,Gear=1,Valid=true,Reason="valid",Rights="original-generated",Coordinates="gta-native-unscaled",Units="native-unverified"};}
        public static int Main()
        {
            try{
                var p=Packet();var bytes=VehicleProtocol.Encode(p);var decoded=VehicleProtocol.Decode(bytes);Check(decoded.RpmRatio==.2&&decoded.Gear==1&&decoded.Profile==p.Profile,"actual codec");
                var copy=VehicleProtocol.Copy(p);p.Position[0]=77;Check(copy.Position[0]==0,"mailbox own immutable vector copy");
                p=Packet();p.RpmRatio=null;p.Gear=null;decoded=VehicleProtocol.Decode(VehicleProtocol.Encode(p));Check(!decoded.RpmRatio.HasValue&&!decoded.Gear.HasValue,"missing getters remain null");
                foreach(double value in new[]{-1.0,1.01,Double.NaN,Double.PositiveInfinity}){p=Packet();p.RpmRatio=value;Reject(()=>VehicleProtocol.Validate(p),"invalid ratio");}
                foreach(int value in new[]{-2,13}){p=Packet();p.Gear=value;Reject(()=>VehicleProtocol.Validate(p),"invalid gear");}
                p=Packet();p.Position=new double[]{0,0};Reject(()=>VehicleProtocol.Validate(p),"short vector");p=Packet();p.Up=new double[]{0,1,0};Reject(()=>VehicleProtocol.Validate(p),"parallel orientation");
                p=Packet();p.Velocity=new double[]{80,80,0};Reject(()=>VehicleProtocol.Validate(p),"source causal speed bound");p=Packet();p.Rights="stock-game";Reject(()=>VehicleProtocol.Validate(p),"ownership");
                p=Packet();p.Sequence=2401;Reject(()=>VehicleProtocol.Validate(p),"bounded 120 second stream");
                string raw=VehicleProtocol.EncodeJson(Packet());foreach(string text in new[]{raw.Replace("\"version\":1","\"version\":1,\"version\":1"),raw.Replace(",\"version\":1",""),raw.Replace("\"version\":1","\"version\":\"1\""),raw.Replace("\"version\":1","\"unexpected\":1,\"version\":1"),raw.Replace("\"gear\":1","\"gear\":{}")})Reject(()=>VehicleProtocol.Decode(Encoding.UTF8.GetBytes(text)),"strict JSON fields/types");
                Reject(()=>VehicleProtocol.Decode(new byte[]{255,255}),"strict UTF8");
                var first=Packet();var validator=new VehicleValidator();validator.Accept(first,first.ObservationTicks,first.SourcePid);Reject(()=>validator.Accept(first,first.ObservationTicks,first.SourcePid),"duplicate evidence");
                var next=Packet(1);next.ObservationTicks=first.ObservationTicks+1;next.VehicleId="second-vehicle";Reject(()=>validator.Accept(next,next.ObservationTicks,next.SourcePid),"vehicle identity switch");next=Packet(1);next.ObservationTicks=first.ObservationTicks+1;next.Profile="original-supercharged-v8";Reject(()=>validator.Accept(next,next.ObservationTicks,next.SourcePid),"profile switch");
                next=Packet(1);next.ObservationTicks=first.ObservationTicks+1;Reject(()=>validator.Accept(next,next.ObservationTicks,next.SourcePid+1),"peer spoof");Reject(()=>validator.Accept(next,next.ObservationTicks+Stopwatch.Frequency,next.SourcePid),"stale");Reject(()=>validator.Accept(next,next.ObservationTicks-Stopwatch.Frequency,next.SourcePid),"future");
                next.Action="remove";next.Valid=false;next.EngineRunning=false;next.Reason="manual-stop";validator.Accept(next,next.ObservationTicks,next.SourcePid);Check(true,"explicit removal");
                var resumed=Packet(2);resumed.ObservationTicks=next.ObservationTicks+1;Reject(()=>validator.Accept(resumed,resumed.ObservationTicks,resumed.SourcePid),"removed source cannot resume");
                p=Packet();var listener=Protocol.Synthetic(p.Session,0,0);listener.ListenerKind="camera";listener.VelocityKind="unavailable";listener.Coordinates="gta-native-unscaled";listener.Units="native-unverified";listener.ObservationTicks=p.ObservationTicks;
                VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks);Check(true,"production listener binding");
                listener.Session=new string('b',32);Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"listener session mismatch");listener.Session=p.Session;
                listener.Generation=2;Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"listener generation mismatch");listener.Generation=1;
                Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid+1,p.Profile,p.ObservationTicks),"listener pipe peer mismatch");
                listener.ObservationTicks=p.ObservationTicks-Stopwatch.Frequency;Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"stale listener");listener.ObservationTicks=p.ObservationTicks;
                listener.Paused=true;Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"paused listener");listener.Paused=false;
                listener.Valid=false;Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"invalid listener");listener.Valid=true;
                listener.ListenerKind="synthetic";Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,p.Profile,p.ObservationTicks),"synthetic listener cannot authorize native source");listener.ListenerKind="camera";
                Reject(()=>VehicleListenerBinding.Validate(p,p.SourcePid,listener,p.SourcePid,"original-supercharged-v8",p.ObservationTicks),"selected host profile mismatch");
                string pipeName="RichAudio.VehicleTest."+Guid.NewGuid().ToString("N");var done=new ManualResetEvent(false);int accepted=0;string ending=null;VehiclePacket received=null;
                using(var server=new VehiclePipeServer(pipeName,delegate(VehiclePacket state,uint peer){Check(peer==state.SourcePid,"actual named pipe peer identity");received=state;Interlocked.Increment(ref accepted);},delegate(string reason){ending=reason;done.Set();})){
                    server.Start();using(var pipe=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut,PipeOptions.Asynchronous)){pipe.Connect(2000);p=Packet();VehicleWire.Write(pipe,VehicleProtocol.Encode(p));TransportStop.Ack(pipe,TransportStop.Accepted);
                        p=Packet(1);p.Action="remove";p.Valid=false;p.EngineRunning=false;p.Reason="manual-stop";VehicleWire.Write(pipe,VehicleProtocol.Encode(p));TransportStop.Ack(pipe,TransportStop.Accepted);TransportStop.Write(pipe,TransportStop.Frame());TransportStop.Ack(pipe,TransportStop.Stopped);}
                    Check(done.WaitOne(2000)&&ending=="deliberate-stop"&&accepted==2&&received.Action=="remove"&&server.Rejected==0,"actual bounded transport lifecycle");
                }
                Console.WriteLine("Vehicle evidence: "+checks+" checks passed; real named pipes, no game or audio endpoint.");return 0;
            }catch(Exception e){Console.Error.WriteLine(e);return 1;}
        }
    }
}
