// Device-free fixture: real listener/vehicle named pipes, HostProgram, worker,
// StreamingRenderer, RA07 framing, PcmRing and OwnedOutputTap. No GTA or endpoint.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Windows
{
    public static class VehicleIntegration
    {
        private static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=32};
        private static readonly List<Dictionary<string,object>> Events=new List<Dictionary<string,object>>();
        private static readonly ManualResetEvent HostDone=new ManualResetEvent(false);
        private static Exception senderError;
        private static VehiclePublisher publisher;
        private static StatePublisher listenerPublisher;
        private static long listenerSequence,vehicleSequence,listenerAccepted,vehicleAccepted;
        private static Stopwatch watch;
        private static string phase;
        private static string senderStage="not-started",probeMode="normal";
        private static int? firstAck,lastAck,listenerStopAck;
        private static double? firstEncodeMs,firstAgeAtWriteMs,firstAckMs,firstAgeAfterAckMs;
        private static long listenerTransmitted,listenerStartupDiscarded;
        private static readonly string Session=new string('a',32);
        private static readonly uint Pid=(uint)Process.GetCurrentProcess().Id;
        private static void Require(bool value,string message){if(!value)throw new Exception(message);}
        private static Dictionary<string,object> LastBlock(){var lines=HostProgram.ListeningFixtureDiagnostics();
            for(int i=lines.Length-1;i>=0;i--)if(lines[i].StartsWith("{\"type\":\"block\",",StringComparison.Ordinal))return Json.Deserialize<Dictionary<string,object>>(lines[i]);return null;}
        private static void Event(string name){var block=LastBlock();Events.Add(new Dictionary<string,object>{{"event",name},{"senderMs",watch.Elapsed.TotalMilliseconds},
            {"qpcTicks",Stopwatch.GetTimestamp()},{"latestProducerFrame",block==null?null:block["frame"]}});}
        private static ListenerState Listener(double time){double yaw=.35*Math.Sin(time*.8);
            return new ListenerState{Version=1,Session=Session,Generation=1,Sequence=listenerSequence++,ObservationTicks=Stopwatch.GetTimestamp(),
                ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(time*1000),Position=new[]{0.0,16,1.6},Velocity=new[]{0.0,0,0},
                Forward=new[]{Math.Sin(yaw),Math.Cos(yaw),0},Up=new[]{0.0,0,1},ListenerKind="camera",VelocityKind="estimated-camera-difference",
                Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"};}
        // C1 position/velocity trajectory; only acceleration/gear/control change at
        // segment boundaries. All quantities are authored fixture observations.
        private static VehiclePacket Vehicle(double time,string profile){
            double t=Math.Max(0,time-1.0),distance=0,speed=0;int gear=1;bool running=true;string stage;
            if(t<1){stage="idle";}
            else if(t<3){double u=t-1;speed=6*u;distance=3*u*u;stage="acceleration";}
            else if(t<3.25){double u=t-3;speed=12;distance=12+12*u;gear=2;stage="gear-change";}
            else if(t<5.25){double u=t-3.25;speed=12+8*u;distance=15+12*u+4*u*u;gear=2;stage=u<1?"continued-acceleration":"high-speed-pass";}
            else if(t<7.25){double u=t-5.25;speed=28-14*u;distance=55+28*u-7*u*u;gear=2;stage="deceleration";}
            else{distance=83;running=false;gear=0;stage="engine-stop";}
            bool remove=t>=7.65;if(remove)stage="source-removal";
            if(phase!=stage){phase=stage;Event(stage);}
            return new VehiclePacket{Version=1,Session=Session,ListenerGeneration=1,Generation=1,Sequence=vehicleSequence++,ObservationTicks=Stopwatch.GetTimestamp(),
                ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(time*1000),SourcePid=Pid,VehicleId="fixture-player-1",Model=123456,
                Profile=profile=="v12"?"original-hypercar-v12":"original-supercharged-v8",Action=remove?"remove":"update",
                Position=new[]{3.5,-10+distance,.3},Velocity=new[]{0.0,speed,0},Forward=new[]{0.0,1,0},Up=new[]{0.0,0,1},Speed=speed,
                EngineRunning=running,RpmRatio=.5,Gear=gear,Valid=!remove,Reason=remove?"stopped":"valid",Rights="original-generated",
                Coordinates="gta-native-unscaled",Units="native-unverified"};
        }
        // Explicit legacy/protocol probes retain the demonstrated ACK2 failure.
        // Normal integration uses the unchanged production StatePublisher below.
        private static void ScenarioRaw(string listenerPipe,string vehiclePipe,string profile){
            try{using(var listener=new NamedPipeClientStream(".",listenerPipe,PipeDirection.InOut,PipeOptions.Asynchronous)){
                senderStage="listener-connect";listener.Connect(5000);watch=Stopwatch.StartNew();double next=0;bool complete=false,started=false;
                using(var vehicle=publisher=new VehiclePublisher(vehiclePipe)){
                    while(watch.Elapsed.TotalSeconds<9.8){double time=watch.Elapsed.TotalSeconds;
                        if(time*1000<next){Thread.Sleep(1);continue;}next=time*1000+50;
                        senderStage="listener-encode";var state=Listener(time);long encodedAt=Stopwatch.GetTimestamp();var bytes=Protocol.Frame(state);
                        double encodedMs=(Stopwatch.GetTimestamp()-encodedAt)*1000.0/Stopwatch.Frequency;
                        if(probeMode!="normal"&&listenerTransmitted==0)Thread.Sleep(350);
                        senderStage="listener-write";double writeAge=(Stopwatch.GetTimestamp()-state.ObservationTicks)*1000.0/Stopwatch.Frequency;
                        TransportStop.Write(listener,bytes);listenerTransmitted++;senderStage="listener-ack";long ackAt=Stopwatch.GetTimestamp();byte ack=TransportStop.ReadAck(listener);lastAck=ack;
                        if(firstAck==null){firstAck=ack;firstEncodeMs=encodedMs;firstAgeAtWriteMs=writeAge;firstAckMs=(Stopwatch.GetTimestamp()-ackAt)*1000.0/Stopwatch.Frequency;firstAgeAfterAckMs=(Stopwatch.GetTimestamp()-state.ObservationTicks)*1000.0/Stopwatch.Frequency;}
                        if(probeMode=="cold-listener-sequence"&&listenerTransmitted==1){Require(ack==TransportStop.StartupStaleDiscarded,"aged first observation receives existing bounded startup-discard acknowledgement");listenerStartupDiscarded++;continue;}
                        if(ack!=TransportStop.Accepted)throw new InvalidDataException("fixture listener expected accepted acknowledgement");listenerAccepted++;
                        if(listenerAccepted==1)Event("listener-first-accepted");
                        if(probeMode=="cold-listener-sequence"){senderStage="probe-complete";TransportStop.Write(listener,TransportStop.Frame());listenerStopAck=TransportStop.ReadAck(listener);
                            Require(listenerStopAck==TransportStop.Stopped,"native receiver acknowledged deliberate listener Stop");HostDone.WaitOne(4000);return;}
                        if(time<1)continue;
                        if(!started){senderStage="vehicle-start";vehicle.Start();started=true;Event("vehicle-publisher-start");HostProgram.ListeningFixtureControl("start");}
                        if(!complete){senderStage="vehicle-publish";var sample=Vehicle(time,profile);vehicle.Publish(sample);
                            if(sample.Action=="remove"){vehicle.Complete();complete=true;Event("vehicle-transport-stop-request");}}
                    }
                    senderStage="vehicle-stop-ack";vehicleAccepted=vehicle.Sent;Require(vehicle.Finished&&vehicle.Reason=="deliberate-stop","vehicle publisher deliberate Stop acknowledged: "+vehicle.Reason);
                    Event("vehicle-transport-deliberate-stop");
                    Event("normal-host-stop");senderStage="host-stop";HostProgram.ListeningFixtureControl("stop");HostDone.WaitOne(4000);senderStage="complete";
                }
            }}catch(Exception error){senderError=error;try{HostProgram.ListeningFixtureControl("stop");}catch{}}
        }
        private static void ScenarioPublished(string listenerPipe,string vehiclePipe,string profile){
            try{
                senderStage="listener-ready";var ready=Stopwatch.StartNew();
                while(LastBlock()==null&&ready.ElapsedMilliseconds<4000&&!HostDone.WaitOne(5)){}
                Require(LastBlock()!=null,"actual host producer ready before the strict single-connection listener publisher starts");
                using(var listener=listenerPublisher=new StatePublisher(listenerPipe,1,true))
                using(var vehicle=publisher=new VehiclePublisher(vehiclePipe)){
#if TRANSPORT_EXPIRY_TEST
                    listener.AfterEncodeTest=null;
                    if(probeMode=="publisher-cold-listener-probe")listener.BeforeEncodeTest=delegate{listener.BeforeEncodeTest=null;Thread.Sleep(350);};
                    else listener.BeforeEncodeTest=null;
#endif
                    senderStage="listener-connect";listener.Start();watch=Stopwatch.StartNew();double next=0;bool complete=false,started=false,acceptedEvent=false;
                    while(watch.Elapsed.TotalSeconds<9.8){double time=watch.Elapsed.TotalSeconds;
                        if(time*1000<next){Thread.Sleep(1);continue;}next=time*1000+50;
                        senderStage="listener-publish";listener.Publish(Listener(time));listenerAccepted=listener.Sent;
                        if(listener.Error!=null)throw new InvalidDataException("production listener publisher ended before deliberate Stop");
                        if(listenerAccepted>0&&!acceptedEvent){acceptedEvent=true;Event("listener-first-accepted");}
                        if(probeMode=="publisher-cold-listener-probe"&&listenerAccepted>0)break;
                        if(time<1||listenerAccepted==0)continue;
                        if(!started){senderStage="vehicle-start";vehicle.Start();started=true;Event("vehicle-publisher-start");HostProgram.ListeningFixtureControl("start");}
                        if(!complete){senderStage="vehicle-publish";var sample=Vehicle(time,profile);vehicle.Publish(sample);
                            if(sample.Action=="remove"){vehicle.Complete();complete=true;Event("vehicle-transport-stop-request");}}
                    }
                    if(probeMode=="normal"){
                        senderStage="vehicle-stop-ack";vehicleAccepted=vehicle.Sent;Require(vehicle.Finished&&vehicle.Reason=="deliberate-stop","vehicle publisher deliberate Stop acknowledged: "+vehicle.Reason);
                        Event("vehicle-transport-deliberate-stop");
                    }
                    Event("normal-host-stop");senderStage="host-stop";listener.RequestStop();var until=Stopwatch.StartNew();
                    while(!listener.Finished&&until.ElapsedMilliseconds<2000)Thread.Sleep(1);
                    Require(listener.Finished&&listener.Diagnostic!=null&&listener.Diagnostic.Outcome=="deliberate-stop","production listener deliberate Stop acknowledged");
                    listenerAccepted=listener.Sent;listenerTransmitted=listener.Transmitted;listenerStartupDiscarded=listener.StartupDiscarded;
                    HostDone.WaitOne(4000);senderStage="complete";
                }
            }catch(Exception error){senderError=error;try{HostProgram.ListeningFixtureControl("stop");}catch{}}
        }
        public static int Main(string[] args){
            if((args.Length!=5&&args.Length!=6)||(args[4]!="v12"&&args[4]!="v8")){Console.Error.WriteLine("root output model service.json v12|v8 [legacy-cold-listener-probe|cold-listener-sequence|publisher-cold-listener-probe]");return 1;}
            if(args.Length==6){probeMode=args[5];if(probeMode!="legacy-cold-listener-probe"&&probeMode!="cold-listener-sequence"&&probeMode!="publisher-cold-listener-probe")return 1;}
            string root=Path.GetFullPath(args[0]),directory=Path.GetFullPath(args[1]),profile=args[4],token=Guid.NewGuid().ToString("N");
            string listener="RichAudio.VehicleListenerFixture."+token,vehicle="RichAudio.VehicleFixture."+token,geometry="RichAudio.VehicleGeometryFixture."+token;
            int exit=1;Directory.CreateDirectory(directory);var sender=new Thread(()=>{if(probeMode=="legacy-cold-listener-probe"||probeMode=="cold-listener-sequence")ScenarioRaw(listener,vehicle,profile);else ScenarioPublished(listener,vehicle,profile);}){IsBackground=true};
            TimeSpan cpuBefore=Process.GetCurrentProcess().TotalProcessorTime;
            try{sender.Start();exit=HostProgram.RunVehicleFixture(root,directory,listener,geometry,vehicle,args[2],args[3],profile);}
            finally{HostDone.Set();bool senderJoined=sender.Join(5000);vehicleAccepted=publisher==null?0:publisher.Sent;File.WriteAllText(Path.Combine(directory,"fixture.json"),Json.Serialize(new Dictionary<string,object>{
                    {"schemaVersion",1},{"profile",profile},{"acceptedListenerAcknowledgements",listenerAccepted},{"acceptedVehicleAcknowledgements",vehicleAccepted},
                    {"nativeHostExit",exit},{"senderError",senderError==null?null:senderError.ToString()},{"events",Events},
                    {"senderStage",senderStage},{"senderErrorKind",senderError==null?null:TransportStop.Kind(senderError)},{"senderJoined",senderJoined},{"probeMode",probeMode},
                    {"listenerWire",new Dictionary<string,object>{{"transmitted",listenerTransmitted},{"startupDiscarded",listenerStartupDiscarded},{"firstAck",firstAck},{"lastAck",lastAck},{"stopAck",listenerStopAck},
                        {"firstEncodeMs",firstEncodeMs},{"firstAgeAtWriteMs",firstAgeAtWriteMs},{"firstAckMs",firstAckMs},{"firstAgeAfterAckMs",firstAgeAfterAckMs}}},
                    {"hostCpuSeconds",(Process.GetCurrentProcess().TotalProcessorTime-cpuBefore).TotalSeconds},{"qpcFrequency",Stopwatch.Frequency},
                    {"vehiclePublisher",publisher==null?null:new Dictionary<string,object>{{"sent",publisher.Sent},{"expired",publisher.Expired},{"replaced",publisher.Replaced},{"terminalReason",publisher.Reason}}},
                    {"listenerPublisher",listenerPublisher==null?null:new Dictionary<string,object>{{"sent",listenerPublisher.Sent},{"transmitted",listenerPublisher.Transmitted},{"attempts",listenerPublisher.Attempts},
                        {"expiredBeforeEncoding",listenerPublisher.ExpiredBeforeEncoding},{"expiredAfterEncoding",listenerPublisher.ExpiredAfterEncoding},{"startupDiscarded",listenerPublisher.StartupDiscarded},
                        {"errorKind",listenerPublisher.Error},{"diagnostic",listenerPublisher.Diagnostic},{"firstFrame",listenerPublisher.FirstFrame},{"firstAcceptedFrame",listenerPublisher.FirstAcceptedFrame},{"firstExpiredUnsent",listenerPublisher.FirstExpiredUnsent}}},
                    {"rpmGetterFixture",new Dictionary<string,object>{{"value",.5},{"range",0},{"meaningfulness","constant-getter fixture; never measured engine RPM"}}},
                    {"fixtureProvenance","Authored RPH-format player vehicle and camera observations through actual named-pipe validation/relay; no GTA, geometry or audio endpoint"}}));Require(senderJoined,"fixture sender joined");}
            if(senderError!=null){Console.Error.WriteLine(senderError);return 1;}Require(exit==0,"bounded actual host shutdown: exit="+exit);
            Console.WriteLine("PASS actual vehicle host "+profile+" accepted="+vehicleAccepted+" exit="+exit+" (no endpoint)");return 0;
        }
    }
}
