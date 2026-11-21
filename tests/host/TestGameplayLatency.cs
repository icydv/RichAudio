// Real private Bati source -> Node -> RA07 -> host ring -> fixture sink/tap.
// This verifies timing evidence through the complete device-free chain.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows;
internal static class TestGameplayLatency {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4194304,RecursionLimit=32};
 static int checks,activeStatusReadRetries;static long sequence;static BatiPlaybackSession current;static string root;
 static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
 static Dictionary<string,object> Read(string path){return Json.DeserializeObject(File.ReadAllText(path))as Dictionary<string,object>;}
 // host.json is still being published during this polling phase. A missed
 // observation retries on the next 25 ms poll under the original 15 s limit.
 // Final status, manifests and retained indexes continue using strict reads.
 static Dictionary<string,object> ReadActiveStatus(string path){
  try{return Read(path);}catch(IOException){activeStatusReadRetries++;return null;}
  catch(ArgumentException){activeStatusReadRetries++;return null;}
  catch(InvalidOperationException){activeStatusReadRetries++;return null;}
 }
 static Dictionary<string,object> Part(Dictionary<string,object> value,string key){return value[key] as Dictionary<string,object>;}
 static long N(Dictionary<string,object> value,string key){return Convert.ToInt64(value[key]);}
 static void Feed(){long now=Stopwatch.GetTimestamp(),n=sequence++;var frame=new GameplayFrame{Session=current.Session,ValidThroughTicks=now+Stopwatch.Frequency/5,
  Listener=new ListenerState{Version=1,Session=current.Session,Generation=1,Sequence=n,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,GameTimeMs=n*25,
   Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=false,Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified"},
  Vehicles=new[]{new GameplayVehicle{Id="latency-fixture",Generation=1,ObservationTicks=now,Model=0xf9300cc5u,Context="player",Position=new[]{2d,4d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},OperatingPoint=.2+.6*(.5+.5*Math.Sin(n*.035)),Running=true,Valid=true}}};
  Check(current.PublishAccepted(frame,frame.ValidThroughTicks),"authored genuine contract frame admitted");}
 public static int Main(string[] args){try{
  if(args.Length!=2)throw new ArgumentException("private candidate and fresh result path required");root=Path.GetFullPath(args[0]);var config=PlayableConfiguration.Load(Path.Combine(root,"playable.json"));
  Check(config.DemoProfile=="PLAYABLE-13","scoped gameplay protocol retained");string settings=AcousticSettingsStore.DefaultPath(root),before=PlayableConfiguration.Digest(settings);
  string pointer=Path.Combine(root,".local","latency-fixture-pointer-"+Guid.NewGuid().ToString("N")+".json");File.WriteAllText(pointer,Json.Serialize(new{schema=1,packageRoot=root,manifestSha256=PlayableConfiguration.Digest(config.Manifest)}));
  current=new BatiPlaybackSession(Guid.NewGuid().ToString("N"),true,true,false);current.Start(pointer,config.GameExecutable);var clock=Stopwatch.StartNew();
  while(current.Configuration==null){if(clock.ElapsedMilliseconds>10000)throw new TimeoutException("fixture configure");Thread.Sleep(25);}Check(current.Enable(),"fixture recording permit armed, no loopback capability");
  string hostFile=Path.Combine(root,".local","gameplay",current.Session,"host.json");clock.Restart();bool progressed=false;long activeAt=0;
  while(true){Feed();Thread.Sleep(25);if(clock.ElapsedMilliseconds>15000)throw new TimeoutException("actual recording pipeline did not progress");if(File.Exists(hostFile)){var h=ReadActiveStatus(hostFile);if(h!=null&&h.ContainsKey("recordingDirectory")&&h["recordingDirectory"]!=null&&Convert.ToDouble(h["sumSquares"])>0){if(!progressed){progressed=true;activeAt=clock.ElapsedMilliseconds;}if(clock.ElapsedMilliseconds-activeAt>1500)break;}}}
  current.Disable();clock.Restart();while(current.HostPid!=0){if(clock.ElapsedMilliseconds>10000)throw new TimeoutException("fixture fade did not finish");Thread.Sleep(25);}current.Stop();Check(current.Join(10000),"owned host and expiry worker joined");
  var host=Read(hostFile);Check(!(bool)host["endpointOpened"],"no endpoint opened");Check(N(host,"underflowFrames")==0,"continuous PCM without starvation");string capture=(string)host["recordingDirectory"];
  var manifest=Read(Path.Combine(capture,"session.json"));Check((bool)manifest["complete"],"owned-only recording complete");Check(N(manifest,"ownedFrames")>48000,"sustained actual PCM retained");Check(N(manifest,"loopbackFrames")==0,"no loopback or microphone introduced");
  var producer=new Dictionary<long,Dictionary<string,object>>();var ring=new Dictionary<long,Dictionary<string,object>>();int delivery=0,sourceBrackets=0;
  foreach(string line in File.ReadLines(Path.Combine(capture,"diagnostics.ndjson"))){var row=Json.DeserializeObject(line)as Dictionary<string,object>;string type=Convert.ToString(row["type"]);var payload=Part(row,"payload");
   if(type=="gameplay-control-delivery"){delivery++;Check(N(payload,"receivedHostQpc")<=N(payload,"writeBeforeQpc")&&N(payload,"writeBeforeQpc")<=N(payload,"writeAfterQpc"),"real control queue/delivery QPC ordered");}
   if(type=="host-producer-block"){long frame=N(payload,"producerFrameStart");ring.Add(frame,payload);Check(N(payload,"readBeforeQpc")<=N(payload,"payloadReadAfterQpc")&&N(payload,"payloadReadAfterQpc")<=N(payload,"ringAdmittedAfterQpc"),"actual RA07 read/ring admission QPC ordered");}
   if(type=="producer-block-timing"){long frame=N(payload,"producerFrameStart");producer.Add(frame,payload);Check(Convert.ToString(payload["nodeClockDomain"])=="node-performance-ms"&&N(payload,"nodeFrequency")==1000,"Node clock explicit");Check(Convert.ToDouble(payload["renderStartedNodeMs"])<=Convert.ToDouble(payload["renderCompletedNodeMs"])&&Convert.ToDouble(payload["renderCompletedNodeMs"])<=Convert.ToDouble(payload["stdoutCompletedNodeMs"]),"actual Node render/stdout times ordered");
    Check(N(payload,"snapshotHostWriteBeforeQpc")<=N(row,"sourceTicks"),"host send and diagnostic receive bound Node exchange");foreach(var item in (object[])payload["sourceBrackets"]){var bracket=(Dictionary<string,object>)item;sourceBrackets++;Check(N(bracket,"leftObservationTicks")>0&&N(bracket,"leftSequence")<=N(payload,"latestAcceptedSequence"),"selected source retains original observation lineage");}
   }
  }
  int joined=0;foreach(string line in File.ReadLines(Path.Combine(capture,"owned-index.ndjson"))){var row=Json.DeserializeObject(line)as Dictionary<string,object>;long start=N(row,"producerFrameStart"),end=start+N(row,"suppliedFrames");foreach(var pair in producer){if(pair.Key>=start&&pair.Key<end&&ring.ContainsKey(pair.Key)){joined++;Check(N(ring[pair.Key],"ringAdmittedAfterQpc")<=N(row,"preparedBeforeQpc"),"sampled generated block reaches actual retained host submission");}}}
  Check(delivery>5&&producer.Count>5&&ring.Count>5&&sourceBrackets>3&&joined>5,"all timing stages and selected source lineage survived actual recording");
  Check(producer.Count<=1500&&ring.Count<=1500&&delivery<=2400,"diagnostic row caps retained");Check(PlayableConfiguration.Digest(settings)==before,"isolated preferences unchanged");
  var result=new{schema=1,passed=true,checks=checks,fixtureOnly=true,endpointOpened=false,microphoneOpened=false,gameLaunched=false,sourceObservations="authored; native GTA acquisition unverified",recordingDirectory=capture,
   producerTimingRows=producer.Count,ringTimingRows=ring.Count,controlDeliveryRows=delivery,selectedSourceBrackets=sourceBrackets,joinedRetainedSubmissions=joined,ownedFrames=N(manifest,"ownedFrames"),activeStatusReadRetries=activeStatusReadRetries,physicalLatencyMeasured=false};
  if(File.Exists(args[1]))throw new IOException("fresh report required");File.WriteAllText(args[1],Json.Serialize(result));Console.WriteLine("PASS "+checks+" actual gameplay latency recording checks; no endpoint; "+args[1]);return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}finally{if(current!=null){current.Stop();current.Join(10000);}}}
}
