// The actual HostProgram.Run, native listener/geometry pipes, host relay, Node
// producer/worker, StreamingRenderer, PCM ring and recording tap. No endpoint.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.GeometryLive;

namespace RichAudio.Beacon.Windows
{
    public static class ListeningIntegration
    {
        private static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=32};
        private static readonly List<Dictionary<string,object>> Events=new List<Dictionary<string,object>>();
        private static readonly ManualResetEvent HostDone=new ManualResetEvent(false);
        private static Exception senderError;
        private static long accepted,sequence;
        private static Stopwatch watch;
        private static Dictionary<string,object> LastBlock(){
            var lines=HostProgram.ListeningFixtureDiagnostics();
            for(int i=lines.Length-1;i>=0;i--)if(lines[i].StartsWith("{\"type\":\"block\",",StringComparison.Ordinal))
                return Json.Deserialize<Dictionary<string,object>>(lines[i]);
            return null;
        }
        private static void Event(string name){var block=LastBlock();lock(Events)Events.Add(new Dictionary<string,object>{
            {"event",name},{"senderMs",watch==null?0:watch.Elapsed.TotalMilliseconds},{"senderQpcTicks",Stopwatch.GetTimestamp()},{"qpcFrequency",Stopwatch.Frequency},{"latestProducerFrame",block==null?null:block["frame"]}});}
        private static void Require(bool value,string message){if(!value)throw new Exception(message);}
        private static ListenerState Listener(){
            double t=watch.Elapsed.TotalSeconds,angle=.12*Math.Sin(t);
            return new ListenerState{Version=1,Session=new string('a',32),Generation=1,Sequence=sequence++,ObservationTicks=Stopwatch.GetTimestamp(),
                ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)(t*1000),Position=new[]{.3+.005*Math.Sin(t),.1,.7},Velocity=new[]{.005*Math.Cos(t),0,0},
                Forward=new[]{-Math.Cos(angle),-Math.Sin(angle),0},Up=new[]{0.0,0,1},ListenerKind="camera",VelocityKind="estimated-camera-difference",
                Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"};
        }
        private static void Send(NamedPipeClientStream pipe,ListenerState state){
            TransportStop.Write(pipe,Protocol.Frame(state));TransportStop.Ack(pipe,TransportStop.Accepted);accepted++;
        }
        private static bool ContextReady(){var block=LastBlock();object value;
            if(block==null||!block.TryGetValue("readiness",out value)||value==null)return false;
            var readiness=(Dictionary<string,object>)value;
            return readiness.ContainsKey("contextInitialized")&&(bool)readiness["contextInitialized"]&&
                readiness.ContainsKey("rendererReadyForOwnedEmission")&&(bool)readiness["rendererReadyForOwnedEmission"];
        }
        private static void Scenario(string listenerPipe,string geometryPipe,string mode){
            GeometryPublisher geometry=null;SensingSession sensing=null;var world=new AnalyticWorld();
            try{using(var pipe=new NamedPipeClientStream(".",listenerPipe,PipeDirection.InOut,PipeOptions.Asynchronous)){
                pipe.Connect(5000);watch=Stopwatch.StartNew();double next=0;bool emission=false,geometryStarted=false,geometryPaused=false,withdrawn=false,emissionStopped=false;
                while(watch.Elapsed.TotalSeconds<(mode=="baseline"?2.1:mode=="normal"?7.2:1.8)){
                    double now=watch.Elapsed.TotalSeconds;
                    if(now*1000<next){Thread.Sleep(1);continue;}next=now*1000+50;
                    var state=Listener();Send(pipe,state);if(accepted==1)Event("listener-first-accepted");
                    if(!emission&&now>.75){
                        if(mode!="baseline")Require(ContextReady(),"listener-only source context and renderer must be ready before manual emission");
                        Event("emission-start");HostProgram.ListeningFixtureControl("start");emission=true;
                    }
                    if(mode!="normal"&&mode!="baseline"){
                        if(now<1.4)continue;Event("invalid-listener-"+mode);
                        if(mode=="interrupted"){
                            byte[] frame=Protocol.Frame(Listener());pipe.Write(frame,0,6);pipe.Flush();
                            // Leave a real partial frame for the receiver's unchanged 250ms deadline.
                            HostDone.WaitOne(4000);return;
                        }
                        var invalid=Listener();
                        // Preserve wire ordering and genuinely delay a newer
                        // observation; otherwise sequence rejection masks age.
                        if(mode=="stale")Thread.Sleep(350);
                        if(mode=="future")invalid.ObservationTicks+=Stopwatch.Frequency;
                        if(mode=="wrong-session")invalid.Session=new string('b',32);
                        if(mode=="reordered"){invalid.Sequence=state.Sequence;invalid.GameTimeMs=state.GameTimeMs;}
                        TransportStop.Write(pipe,Protocol.Frame(invalid));
                        bool rejected=false;try{TransportStop.Ack(pipe,TransportStop.Accepted);}catch(InvalidDataException){rejected=true;}catch(IOException){rejected=true;}
                        Require(rejected,"invalid listener must never receive accepted acknowledgement");
                        HostDone.WaitOne(4000);return;
                    }
                    if(mode=="normal"){
                        if(!geometryStarted&&now>2.0){Event("no-geometry-window-complete");
                            geometry=new GeometryPublisher(geometryPipe);sensing=new SensingSession(world,new GeometryClock(),state,Guid.NewGuid().ToString("N"),
                                Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",geometry.Publish);geometry.Start();geometryStarted=true;Event("qualified-geometry-acquisition-start");}
                        if(sensing!=null&&geometry.Connected&&now<3.65)sensing.Step(state);
                        if(!geometryPaused&&now>3.65){geometryPaused=true;Event("geometry-observations-ceased-await-original-expiry");}
                        if(!withdrawn&&now>5.45){Event("geometry-withdraw");geometry.RequestStop();withdrawn=true;sensing=null;}
                        if(!emissionStopped&&now>6.1){Event("emission-stop");HostProgram.ListeningFixtureControl("emit-stop");emissionStopped=true;}
                    }
                }
                Event("normal-host-stop");HostProgram.ListeningFixtureControl("stop");HostDone.WaitOne(4000);
            }}catch(Exception error){senderError=error;try{HostProgram.ListeningFixtureControl("stop");}catch{} }
            finally{if(geometry!=null)geometry.Dispose();}
        }
        public static int Main(string[] args){
            if(args.Length!=5){Console.Error.WriteLine("root output model service.json normal|baseline|stale|future|wrong-session|reordered|interrupted");return 1;}
            string root=Path.GetFullPath(args[0]),directory=Path.GetFullPath(args[1]),mode=args[4];
            string token=Guid.NewGuid().ToString("N"),listener="RichAudio.ListeningFixture."+token,geometry="RichAudio.ListeningGeometry."+token;
            int exit=1;Directory.CreateDirectory(directory);var sender=new Thread(()=>Scenario(listener,geometry,mode)){IsBackground=true};
            try{sender.Start();exit=HostProgram.RunListeningFixture(root,directory,listener,geometry,args[2],args[3]);}
            finally{HostDone.Set();Require(sender.Join(5000),"fixture sender joined");
                File.WriteAllText(Path.Combine(directory,"fixture.json"),Json.Serialize(new Dictionary<string,object>{
                    {"schemaVersion",1},{"mode",mode},{"acceptedAcknowledgements",accepted},{"nativeHostExit",exit},
                    {"senderError",senderError==null?null:senderError.ToString()},{"events",Events},
                    {"fixtureProvenance","Deterministic analytic collision query fixture through actual SensingSession/GeometryPublisher; no GTA observations or device access"}}));}
            if(senderError!=null){Console.Error.WriteLine(senderError);return 1;}
            if(mode=="normal")Require(exit==0,"bounded normal actual host shutdown: exit="+exit);
            else if(mode!="baseline")Require(exit==1,"invalid listener must fail actual host closed");
            Console.WriteLine("PASS actual host fixture "+mode+" accepted="+accepted+" exit="+exit+" (no endpoint)");return 0;
        }
    }
}
