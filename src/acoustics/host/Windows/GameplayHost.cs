// Product route through the existing RA07 decoder, PCM ring and WASAPI output.
// The fixture route differs only at the final sink and never opens a device.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Globalization;using System.IO;using System.IO.Pipes;using System.Text;using System.Threading;using System.Web.Script.Serialization;using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Windows {
 public sealed class GameplayHost {
  volatile bool stop,readerEnded,workerReady,shutdownRequested;volatile string failure;volatile string workerStatus;Process child;OwnedProcessJob nodeJob;NamedPipeServerStream pipe;
  readonly PcmRing ring=new PcmRing();readonly AutoResetEvent wake=new AutoResetEvent(false);GameplayFrame latest;int credits=4;long received,rejected,expired,frames,lastPcmTicks,lastSnapshotTicks;int started;
  readonly object sync=new object();JavaScriptSerializer Json {get{return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=24};}}
  PlayableConfiguration config;string session,pipeName;int ownerId;long ownerStart;AcousticSettings settings;WasapiOutput audio;Thread writer,reader,diagnostics,receiver,sink;bool fixture;long fixtureCallbacks;string directory;int childId;
  public static int Run(string[] args){var host=new GameplayHost();return host.Execute(args);}
  static string Q(string s){if(s.IndexOf('"')>=0)throw new ArgumentException("quoted path");return "\""+s+"\"";}
  bool OwnerAlive(){try{using(var p=Process.GetProcessById(ownerId))return !p.HasExited&&p.StartTime.ToUniversalTime().Ticks==ownerStart;}catch(ArgumentException){return false;}}
  void Fail(Exception e){failure=e.GetType().Name;stop=true;wake.Set();}
  int Execute(string[] args){
   if(args.Length!=8)return 2;fixture=args[0]=="--gameplay-fixture";int code=1;
   try{
    config=PlayableConfiguration.Load(args[1]);if(!String.Equals(PlayableConfiguration.Digest(args[1]),args[2],StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("playable manifest changed");
    ownerId=int.Parse(args[3],CultureInfo.InvariantCulture);ownerStart=long.Parse(args[4],CultureInfo.InvariantCulture);session=args[5];pipeName=args[6];
    if(!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z")||pipeName!="RichAudio.Playable01."+ownerId+"."+session)throw new InvalidDataException("owned gameplay endpoint");
    string permit=Path.GetFullPath(args[7]),privateRoot=Path.Combine(config.Root,".local")+Path.DirectorySeparatorChar;if(!permit.StartsWith(privateRoot,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("private startup permit");
    var gate=Stopwatch.StartNew();while(!File.Exists(permit)){if(gate.Elapsed.TotalSeconds>10||!OwnerAlive())throw new TimeoutException("startup ownership permit");Thread.Sleep(10);}
    if(!OwnerAlive())throw new InvalidOperationException("owner ended");if(!fixture){using(var p=Process.GetProcessById(ownerId))if(!String.Equals(p.MainModule.FileName,config.GameExecutable,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("game owner differs");}
    directory=Path.Combine(config.Root,".local","gameplay",session);Directory.CreateDirectory(directory);
    string settingFile=AcousticSettingsStore.DefaultPath(config.Root);settings=AcousticSettingsStore.Load(config.Root,settingFile);
    if(!fixture&&(!settings.RichAudioEnabled||settings.IntegrationMode!="experimental-additive"))throw new InvalidOperationException("stock fallback selected");
    nodeJob=new OwnedProcessJob(1024);
    child=new Process{StartInfo=new ProcessStartInfo{FileName=PlayableConfiguration.Inside(config.Root,"runtime/node.exe"),Arguments=Q(PlayableConfiguration.Inside(config.Root,"tools/Run-Gameplay.mjs"))+" --manifest "+Q(config.Manifest)+" --session "+session,WorkingDirectory=config.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};child.Start();childId=child.Id;nodeJob.Assign(child);
    writer=new Thread(WriteControls){IsBackground=true,Name="RichAudio gameplay control"};reader=new Thread(ReadPcm){IsBackground=true,Name="RichAudio RA07 reader"};diagnostics=new Thread(ReadDiagnostics){IsBackground=true};receiver=new Thread(Receive){IsBackground=true,Name="RichAudio gameplay pipe"};
    writer.Start();reader.Start();diagnostics.Start();receiver.Start();lastPcmTicks=lastSnapshotTicks=Stopwatch.GetTimestamp();
    if(fixture){sink=new Thread(ConsumeFixture){IsBackground=true};sink.Start();}
    else{audio=new WasapiOutput(ring,-1,true);audio.Volume=1;audio.Muted=false;audio.Start();if(!audio.Ready.WaitOne(5000)||audio.Error!=null)throw new InvalidOperationException("playback endpoint unavailable");}
    var command=new Thread(delegate(){try{while(!stop){string s=Console.ReadLine();if(s==null||s=="stop"){shutdownRequested=true;wake.Set();break;}}}catch(IOException){}}){IsBackground=true};command.Start();
    long lastSettings=0,lastStatus=0,fadeAt=-1,lastGeometry=0;DateTime geometryModified=DateTime.MinValue;var clock=Stopwatch.StartNew();
    while(!stop){
     if(!OwnerAlive()){stop=true;break;}if(child.HasExited||readerEnded)throw new IOException("producer ended");if(audio!=null&&audio.Error!=null)throw new IOException("endpoint stopped");
     if((Stopwatch.GetTimestamp()-Interlocked.Read(ref lastPcmTicks))*1000d/Stopwatch.Frequency>5000)throw new TimeoutException("producer stopped progressing");
     if((Stopwatch.GetTimestamp()-Interlocked.Read(ref lastSnapshotTicks))*1000d/Stopwatch.Frequency>5000)throw new TimeoutException("game observation stopped");
     int n=ring.TakeCredits();if(n>0){Interlocked.Add(ref credits,n);wake.Set();}
     if(clock.ElapsedMilliseconds-lastSettings>=200){lastSettings=clock.ElapsedMilliseconds;var s=AcousticSettingsStore.Load(config.Root,settingFile);lock(sync)settings=s;wake.Set();if(!s.RichAudioEnabled||s.IntegrationMode!="experimental-additive")shutdownRequested=true;}
     if(shutdownRequested&&fadeAt<0){fadeAt=clock.ElapsedMilliseconds;wake.Set();}if(fadeAt>=0&&clock.ElapsedMilliseconds-fadeAt>=120){stop=true;break;}
     if(clock.ElapsedMilliseconds-lastGeometry>=200){lastGeometry=clock.ElapsedMilliseconds;string file=Path.Combine(config.Root,".local","qualified-geometry.json");if(File.Exists(file)&&File.GetLastWriteTimeUtc(file)!=geometryModified){geometryModified=File.GetLastWriteTimeUtc(file);try{string value=AcousticSettingsStore.ReadBounded(file,131072);lock(sync)pendingGeometry=value;wake.Set();}catch(IOException){}}}
     if(clock.ElapsedMilliseconds-lastStatus>=500){lastStatus=clock.ElapsedMilliseconds;PublishStatus("running");}
     Thread.Sleep(2);
    }
    code=0;
   }catch(Exception e){failure=e.GetType().Name;Console.Error.WriteLine("RichAudio gameplay stock fallback: "+failure);}
   finally{
    stop=true;wake.Set();if(pipe!=null)try{pipe.Dispose();}catch(IOException){}if(audio!=null){try{audio.Dispose();}catch(Exception e){failure=failure??e.GetType().Name;code=1;}}
    if(nodeJob!=null)nodeJob.Dispose();if(child!=null){try{if(!child.HasExited)child.Kill();child.WaitForExit(2000);}catch(Exception){}child.Dispose();}
    foreach(var t in new[]{writer,reader,diagnostics,receiver,sink})if(t!=null&&t.IsAlive&&!t.Join(1500)){failure="cleanup-timeout";code=1;}
    if(config!=null&&directory!=null)try{PublishStatus("stopped");}catch(Exception){code=1;}
   }
   return failure==null?code:1;
  }
  string pendingGeometry;
  void WriteControls(){try{AcousticSettings sent=null;bool sentShutdown=false;while(!stop){wake.WaitOne(20);if(stop)break;int n=Interlocked.Exchange(ref credits,0);if(n>0)child.StandardInput.WriteLine("{\"type\":\"credit\",\"blocks\":"+n+"}");
   AcousticSettings current;string geometry;lock(sync){current=settings;geometry=pendingGeometry;pendingGeometry=null;}if(sent==null||sent.Revision!=current.Revision||shutdownRequested&&!sentShutdown){sent=current;sentShutdown=shutdownRequested;child.StandardInput.WriteLine(Json.Serialize(new{type="settings",quality=current.Quality,acceleration=current.Acceleration,enabled=current.RichAudioEnabled&&!sentShutdown,volume=current.OutputLevel,reflections=current.EarlyReflections,mode=current.IntegrationMode,soundMapVisible=current.SoundMapVisible}));}
   if(geometry!=null&&workerReady)child.StandardInput.WriteLine("{\"type\":\"geometry\",\"value\":"+geometry+"}");
   var frame=workerReady?Interlocked.Exchange(ref latest,null):null;if(frame!=null){double age=(Stopwatch.GetTimestamp()-frame.Listener.ObservationTicks)*1000d/Stopwatch.Frequency;if(age<=250){string payload=Encoding.UTF8.GetString(GameplayWire.Encode(frame,session));child.StandardInput.WriteLine("{\"type\":\"snapshot\",\"ageMs\":"+age.ToString("R",CultureInfo.InvariantCulture)+",\"frame\":"+payload+"}");}else Interlocked.Increment(ref expired);}
   child.StandardInput.Flush();
  }}catch(Exception e){if(!stop)Fail(e);}}
  void ReadPcm(){try{var h=new byte[16];var payload=new byte[4096];var samples=new float[1024];uint sequence=0;
   while(!stop&&BlockProtocol.ReadExact(child.StandardOutput.BaseStream,h,16)){int n=BlockProtocol.ValidateHeader(h,sequence++);if(n!=512)throw new InvalidDataException("gameplay block size");if(!BlockProtocol.ReadExact(child.StandardOutput.BaseStream,payload,n*8))throw new EndOfStreamException();Buffer.BlockCopy(payload,0,samples,0,n*8);while(!stop&&!ring.TryWrite(samples,n))Thread.Sleep(1);Interlocked.Increment(ref received);Interlocked.Exchange(ref lastPcmTicks,Stopwatch.GetTimestamp());}
  }catch(Exception e){if(!stop)Fail(e);}finally{readerEnded=true;ring.EndOfStream=true;}}
  void ReadDiagnostics(){try{string line;while(!stop&&(line=child.StandardError.ReadLine())!=null){if(line.Length>32768)throw new InvalidDataException("producer diagnostic size");lock(sync){var d=Json.DeserializeObject(line)as Dictionary<string,object>;object type;if(d!=null&&d.TryGetValue("type",out type)){if((string)type=="gameplay-status")workerStatus=line;if((string)type=="gameplay-ready"){workerReady=true;wake.Set();}}}}}catch(Exception e){if(!stop)Fail(e);}}
  void Receive(){try{var validator=new StateValidator();while(!stop){pipe=GameplayWire.Server(pipeName);pipe.WaitForConnection();GameplayWire.Peer(pipe,ownerId,true);
   try{while(!stop){byte[] b=GameplayWire.Read(pipe);var f=GameplayWire.Decode(b,session);double age=(Stopwatch.GetTimestamp()-f.Listener.ObservationTicks)*1000d/Stopwatch.Frequency;
     if(age<=250&&age>=-2){validator.Accept(f.Listener,Stopwatch.GetTimestamp());foreach(var v in f.Vehicles)if(!config.Allows(v.Model,v.Context))v.Valid=false;Interlocked.Exchange(ref latest,f);Interlocked.Exchange(ref lastSnapshotTicks,Stopwatch.GetTimestamp());Interlocked.Increment(ref frames);wake.Set();}else Interlocked.Increment(ref expired);
     TransportStop.Write(pipe,new[]{TransportStop.Accepted});
    }}catch(IOException){if(!stop)Interlocked.Increment(ref rejected);}finally{pipe.Dispose();pipe=null;}
  }}catch(Exception e){if(!stop)Fail(e);}}
  unsafe void ConsumeFixture(){try{var clock=Stopwatch.StartNew();while(!stop&&ring.Count<4&&clock.Elapsed.TotalSeconds<5)Thread.Sleep(1);if(stop)return;if(ring.Count<4)throw new TimeoutException("fixture prefill");Interlocked.Exchange(ref started,1);var buffer=new float[1024];long begin=Stopwatch.GetTimestamp(),block=0;
   while(!stop){double due=block*512d/48000;while(!stop&&(Stopwatch.GetTimestamp()-begin)/(double)Stopwatch.Frequency<due)Thread.Sleep(1);if(stop)break;fixed(float* p=buffer)ring.FillCalibrated(p,512,1);Interlocked.Increment(ref fixtureCallbacks);block++;wake.Set();}
  }catch(Exception e){if(!stop)Fail(e);}}
  void PublishStatus(string state){
   AcousticSettings s;Dictionary<string,object> measured=null;lock(sync){s=settings;if(workerStatus!=null){var d=Json.DeserializeObject(workerStatus)as Dictionary<string,object>;object raw;if(d!=null&&d.TryGetValue("status",out raw))measured=raw as Dictionary<string,object>;}}
   var status=new Dictionary<string,object>{{"requestedQuality",s.Quality},{"activeQuality","performance"},{"pathBudget",12},{"requestedAcceleration",s.Acceleration},{"activeAcceleration","cpu"},{"gpuResultsApplied",0},{"qualityDeadlineMisses",0},{"droppedResults",0},{"settingsRevision",s.Revision},{"richAudioEnabled",s.RichAudioEnabled},{"outputLevel",s.OutputLevel},{"earlyReflections",s.EarlyReflections},{"integrationMode",s.IntegrationMode},{"fallbackReason","Conditional direct sound; no qualified collision coverage"}};
   if(measured!=null)foreach(var kv in measured)status[kv.Key]=kv.Value;
   status["nativeUnderflowFrames"]=Interlocked.Read(ref ring.UnderflowFrames);status["nativeConsumedFrames"]=Interlocked.Read(ref ring.ConsumedFrames);status["hostMemoryBytes"]=Process.GetCurrentProcess().WorkingSet64;
   var wrapper=new Dictionary<string,object>{{"schemaVersion",1},{"hostState",state},{"recordedAtUtc",DateTime.UtcNow.ToString("o")},{"status",status}};
   AcousticSettingsStore.WriteAtomic(config.Root,AcousticSettingsStore.StatusPath(AcousticSettingsStore.DefaultPath(config.Root)),Json.Serialize(wrapper),16384);
   var evidence=new Dictionary<string,object>{{"schema",1},{"hostState",state},{"fixture",fixture},{"endpointOpened",!fixture&&audio!=null&&audio.Started},{"failure",failure},{"ownerPid",ownerId},{"hostPid",Process.GetCurrentProcess().Id},{"nodePid",childId},{"receivedBlocks",Interlocked.Read(ref received)},{"receivedSnapshots",Interlocked.Read(ref frames)},{"expiredSnapshots",Interlocked.Read(ref expired)},{"rejectedConnections",Interlocked.Read(ref rejected)},{"consumedFrames",Interlocked.Read(ref ring.ConsumedFrames)},{"underflowFrames",Interlocked.Read(ref ring.UnderflowFrames)},{"peak",ring.Peak},{"hostCpuMs",Process.GetCurrentProcess().TotalProcessorTime.TotalMilliseconds},{"hostMemoryBytes",Process.GetCurrentProcess().WorkingSet64},{"fixtureCallbacks",Interlocked.Read(ref fixtureCallbacks)},{"fixtureStarted",Thread.VolatileRead(ref started)!=0},{"nativeSuppression",false},{"worker",measured}};
   string path=Path.Combine(directory,"host.json"),tmp=path+".pending";File.WriteAllText(tmp,Json.Serialize(evidence),new UTF8Encoding(false));if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
  }
 }
}
