// Focused original trajectories through the actual native listener pipe, relay,
// producer, worker, guard, PCM ring and owned recorder. No endpoint is started.
using System;
using System.Collections;
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
    public static class SpatialStabilityIntegration
    {
        private static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=32};
        private static readonly ManualResetEvent HostDone=new ManualResetEvent(false);
        private static readonly List<Dictionary<string,object>> Events=new List<Dictionary<string,object>>();
        private static Exception senderError;
        private static long accepted,sequence;
        private static Stopwatch watch;
        private static long origin;
        private static Dictionary<string,object> LastBlock(){var lines=HostProgram.ListeningFixtureDiagnostics();for(int i=lines.Length-1;i>=0;i--)if(lines[i].StartsWith("{\"type\":\"block\",",StringComparison.Ordinal))return Json.Deserialize<Dictionary<string,object>>(lines[i]);return null;}
        private static void Event(string name){var b=LastBlock();var e=new Dictionary<string,object>{{"event",name},{"senderMs",watch.Elapsed.TotalMilliseconds},{"senderQpcTicks",Stopwatch.GetTimestamp()},{"qpcFrequency",Stopwatch.Frequency},{"latestProducerFrame",b==null?null:b["frame"]}};Events.Add(e);Console.WriteLine(Json.Serialize(e));}
        private static double Number(object value){return Convert.ToDouble(value,System.Globalization.CultureInfo.InvariantCulture);}
        private static long SinkClockBegin(){var field=typeof(HostProgram).GetField("fixtureSinkBegin",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic);if(field==null)throw new InvalidOperationException("Actual fixture deadline clock unavailable");return (long)field.GetValue(null);}
        private static double[] Vector(object value){var a=(IList)value;return new[]{Number(a[0]),Number(a[1]),Number(a[2])};}
        private static ListenerState Listener(Dictionary<string,object> value){return new ListenerState{Version=1,Session=new string('a',32),Generation=Convert.ToInt64(value["generation"]),Sequence=sequence++,ObservationTicks=origin+(long)(Number(value["atMs"])*Stopwatch.Frequency/1000),ClockFrequency=Stopwatch.Frequency,GameTimeMs=(long)Number(value["atMs"]),Position=Vector(value["position"]),Velocity=Vector(value["velocity"]),Forward=Vector(value["forward"]),Up=Vector(value["up"]),ListenerKind="camera",VelocityKind="estimated-camera-difference",Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"};}
        private static bool ContextReady(){var b=LastBlock();object v;if(b==null||!b.TryGetValue("readiness",out v)||v==null)return false;var r=(Dictionary<string,object>)v;return r.ContainsKey("rendererReadyForOwnedEmission")&&(bool)r["rendererReadyForOwnedEmission"];}
        private static void Scenario(string listenerPipe,string geometryPipe,Dictionary<string,object> trajectory){
            GeometryPublisher geometry=null;SensingSession sensing=null;
            try{using(var pipe=new NamedPipeClientStream(".",listenerPipe,PipeDirection.InOut,PipeOptions.Asynchronous)){
                pipe.Connect(5000);origin=Stopwatch.GetTimestamp();watch=Stopwatch.StartNew();bool emitted=false,stopped=false,geometryStarted=false;string name=(string)trajectory["name"];double duration=Number(trajectory["durationMs"]);
                foreach(object item in (IEnumerable)trajectory["samples"]){
                    var value=(Dictionary<string,object>)item;double at=Number(value["atMs"]);
                    double receipt=value.ContainsKey("receiptMs")?Number(value["receiptMs"]):at;
                    while(watch.Elapsed.TotalMilliseconds<receipt&&!HostDone.WaitOne(0))Thread.Sleep(1);
                    if(HostDone.WaitOne(0))break;
                    var listener=Listener(value);TransportStop.Write(pipe,Protocol.Frame(listener));TransportStop.Ack(pipe,TransportStop.Accepted);accepted++;
                    if(accepted==1)Event("first-accepted");
                    if(!emitted&&at>=750){if(!ContextReady())throw new InvalidOperationException("Actual source context must be ready before emission");HostProgram.ListeningFixtureControl("start");emitted=true;Event("emission-start");}
                    if(name=="geometry-expiry"||name=="full-planned"){
                        double geometryStart=name=="full-planned"?20000:2000;
                        if(!geometryStarted&&at>=geometryStart){geometry=new GeometryPublisher(geometryPipe);sensing=new SensingSession(new AnalyticWorld(),new GeometryClock(),listener,Guid.NewGuid().ToString("N"),Process.GetCurrentProcess().Id,"1.0.1158.16","1.132.1428.17748",geometry.Publish);geometry.Start();geometryStarted=true;Event("qualified-geometry-start");}
                        if(sensing!=null&&geometry.Connected&&at<geometryStart+1000)sensing.Step(listener);
                    }
                    double emissionStop=trajectory.ContainsKey("emissionStopMs")?Number(trajectory["emissionStopMs"]):duration-500;
                    if(!stopped&&at>=emissionStop){HostProgram.ListeningFixtureControl("emit-stop");stopped=true;Event("emission-stop");}
                }
                if(!HostDone.WaitOne(0)){HostProgram.ListeningFixtureControl("stop");Event("normal-host-stop");HostDone.WaitOne(4000);}
            }}catch(Exception error){senderError=error;try{HostProgram.ListeningFixtureControl("stop");}catch{}}
            finally{if(geometry!=null)geometry.Dispose();}
        }
        public static int Main(string[] args){
            if(args.Length!=5){Console.Error.WriteLine("root output model service trajectory.json");return 1;}
            string root=Path.GetFullPath(args[0]),directory=Path.GetFullPath(args[1]),token=Guid.NewGuid().ToString("N"),listener="RichAudio.SpatialFixture."+token,geometry="RichAudio.SpatialGeometry."+token;
            var trajectory=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[4]));int exit=1;var sender=new Thread(()=>Scenario(listener,geometry,trajectory)){IsBackground=true};
            try{sender.Start();exit=HostProgram.RunListeningFixture(root,directory,listener,geometry,args[2],args[3]);}
            finally{HostDone.Set();if(!sender.Join(5000))throw new TimeoutException("Owned spatial sender did not join");File.WriteAllText(Path.Combine(directory,"fixture.json"),Json.Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"mode",trajectory["name"]},{"nativeHostExit",exit},{"timelineOriginQpcTicks",origin},{"fixtureSinkBeginQpcTicks",SinkClockBegin()},{"qpcFrequency",Stopwatch.Frequency},{"acceptedAcknowledgements",accepted},{"senderError",senderError==null?null:senderError.GetType().Name+": "+senderError.Message},{"events",Events},{"fixtureProvenance","Identical authored20Hz native-camera trajectories; actual private pipes/relay/worker/guard/ring/recorder; no endpoint"}}));}
            Console.WriteLine("Actual spatial native fixture exit="+exit+" accepted="+accepted+" no endpoint");return 0;
        }
    }
}
