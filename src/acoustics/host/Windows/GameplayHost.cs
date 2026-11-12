// Product route through the existing RA07 decoder and PCM ring. The immutable
// observation mode and the test fixture use a clocked, device-free sink.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Globalization;using System.IO;using System.IO.Pipes;using System.Text;using System.Threading;using System.Web.Script.Serialization;using RichAudio.Beacon.Transport;using RichAudio.Beacon.Windows.Recording;
namespace RichAudio.Beacon.Windows {
 public sealed class GameplayHost {
  volatile bool stop,readerEnded,workerReady,shutdownRequested;volatile string failure,failureDetail,workerFailure;volatile string workerStatus;Process child;OwnedProcessJob nodeJob;NamedPipeServerStream pipe;
  sealed class PendingFrame {internal GameplayFrame Frame;internal long ReceivedQpc;}
  PcmRing ring;GameplayLatencyProfile latencyProfile;GameplayCreditWindow creditWindow;readonly AutoResetEvent wake=new AutoResetEvent(false);PendingFrame latest;int credits;long received,rejected,expired,frames,lastPcmTicks,lastSnapshotTicks;int started;
  long supersededSnapshots,controlDeliveryRows,pcmTimingRows,producerTimingRows,producerTimingRowsRejected,preparedSourceAtQpc,steadyWindowAtQpc;GameplayFixtureLatency fixtureLatency;GameplayFixtureCadence01 fixtureCadence;
  readonly object sync=new object();JavaScriptSerializer Json {get{return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=24};}}
  PlayableConfiguration config;string session,pipeName;int ownerId;long ownerStart;AcousticSettings settings;WasapiOutput audio;Thread writer,reader,diagnostics,receiver,sink;bool fixture;long fixtureCallbacks;string directory;int childId;
  readonly object transportGate=new object();readonly TransportObservationState02 transport=new TransportObservationState02();Thread ownerCommand;long transportConnections;
  bool demo;long admittedLease;GameplayRecording recording;GameplayDemoPermit demoPermit;string recordingFailure,recordingDirectory;object lastRecordingMetrics;readonly GameplayShutdownFade shutdownFade=new GameplayShutdownFade();
  GameplayDeliveryTrace01 delivery;long creditBatch,issuedCredits;
  int ringHighWaterFrames;long maximumAdmissionIntervalTicks;
  string stopReason;object producerIdentity;bool drainProducer;
  long fixtureTrailingSilentFrames;double fixtureLastPeak,fixtureLastSumSquares;
  public static int Run(string[] args){var host=new GameplayHost();return host.Execute(args);}
  static string Q(string s){if(s.IndexOf('"')>=0)throw new ArgumentException("quoted path");return "\""+s+"\"";}
  bool OwnerAlive(){try{using(var p=Process.GetProcessById(ownerId))return !p.HasExited&&p.StartTime.ToUniversalTime().Ticks==ownerStart;}catch(ArgumentException){return false;}}
  void Fail(Exception e){failure=e.GetType().Name;failureDetail=e.Message;stop=true;wake.Set();}
  void RequestShutdown(string reason){Interlocked.CompareExchange(ref stopReason,reason,null);shutdownRequested=true;wake.Set();}
  void Record(string stage,string reason,object detail){if(config!=null&&(config.DiscardEnvironmentalOutput||config.TransportValidationOnly))GameplayLifecycle01.Record(directory,"host",session,stage,reason,detail);}
  int Execute(string[] args){
   if(args.Length!=8)return 2;fixture=args[0]=="--gameplay-fixture";if(fixture)fixtureLatency=new GameplayFixtureLatency();int code=1;
   try{
    config=PlayableConfiguration.Load(args[1]);if(!String.Equals(PlayableConfiguration.Digest(args[1]),args[2],StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("playable manifest changed");
    ownerId=int.Parse(args[3],CultureInfo.InvariantCulture);ownerStart=long.Parse(args[4],CultureInfo.InvariantCulture);session=args[5];pipeName=args[6];
    if(!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z")||pipeName!="RichAudio.Playable01."+ownerId+"."+session)throw new InvalidDataException("owned gameplay endpoint");
    string permit=Path.GetFullPath(args[7]),privateRoot=Path.Combine(config.Root,".local")+Path.DirectorySeparatorChar;if(!permit.StartsWith(privateRoot,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("private startup permit");
    var gate=Stopwatch.StartNew();while(!File.Exists(permit)){if(gate.Elapsed.TotalSeconds>10||!OwnerAlive())throw new TimeoutException("startup ownership permit");Thread.Sleep(10);}
    if(!OwnerAlive())throw new InvalidOperationException("owner ended");if(!fixture){using(var p=Process.GetProcessById(ownerId))if(!String.Equals(p.MainModule.FileName,config.GameExecutable,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("game owner differs");}
    demo=config.DemoProfile=="PLAYABLE-13";if(demo)demoPermit=GameplayDemoPermit.Load(permit,session,fixture);
    directory=Path.Combine(config.Root,".local","gameplay",session);Directory.CreateDirectory(directory);
    using(var self=Process.GetCurrentProcess())Record("host-started","owner-permit-verified",new{host=GameplayLifecycle01.Identity(self),ownerPid=ownerId,ownerStartUtcTicks=ownerStart});
    string settingFile=AcousticSettingsStore.DefaultPath(config.Root);settings=AcousticSettingsStore.Load(config.Root,settingFile);
    if(config.TransportValidationOnly){code=RunTransportOnly();}
    else {
    if(config.DiscardEnvironmentalOutput)delivery=new GameplayDeliveryTrace01();latencyProfile=GameplayLatencyProfile.Resolve(config.LatencyProfile);ring=new PcmRing(latencyProfile.StartupBlocks);creditWindow=new GameplayCreditWindow(latencyProfile);credits=latencyProfile.StartupBlocks;
    if(!fixture&&(!settings.RichAudioEnabled||settings.IntegrationMode!="experimental-additive"))throw new InvalidOperationException("stock fallback selected");
    nodeJob=new OwnedProcessJob(1024);
    string producerArgs=Q(PlayableConfiguration.Inside(config.Root,"tools/Run-Gameplay.mjs"))+" --manifest "+Q(config.Manifest)+" --session "+session;
    // Keep startup-warmed synthesis bytecode through camera-only traversal and
    // its garbage collections. The package binds the Node runtime and the
    // owned job keeps the existing producer memory limit.
    if(latencyProfile.Id=="street-01")producerArgs="--no-flush-bytecode "+producerArgs;
    child=new Process{StartInfo=new ProcessStartInfo{FileName=PlayableConfiguration.Inside(config.Root,"runtime/node.exe"),Arguments=producerArgs,WorkingDirectory=config.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};
    if(delivery!=null)child.StartInfo.EnvironmentVariables["RICHAUDIO_DISCARD_DELIVERY_TRACE01"]="1";
    child.Start();childId=child.Id;nodeJob.Assign(child);
    drainProducer=config.DiscardEnvironmentalOutput;producerIdentity=GameplayLifecycle01.Identity(child);
    Record("producer-started","assigned-to-owned-job",producerIdentity);
    writer=new Thread(WriteControls){IsBackground=true,Name="RichAudio gameplay control"};reader=new Thread(ReadPcm){IsBackground=true,Name="RichAudio RA07 reader"};diagnostics=new Thread(ReadDiagnostics){IsBackground=true};receiver=new Thread(Receive){IsBackground=true,Name="RichAudio gameplay pipe"};
    writer.Start();reader.Start();diagnostics.Start();receiver.Start();lastPcmTicks=lastSnapshotTicks=Stopwatch.GetTimestamp();
    // Preparation finishes before either output sink starts. The demo lease
    // and worker share the existing five-second startup allowance.
    var startup=Stopwatch.StartNew();while(!workerReady){
     if(!OwnerAlive())RequestShutdown("owner-lost");else if(readerEnded||child.HasExited)RequestShutdown("producer-ended");
      if(shutdownRequested||stop||startup.ElapsedMilliseconds>=5000)throw new InvalidOperationException("producer preparation unavailable before output startup");wake.WaitOne(10);}
    if(demo){while(Interlocked.Read(ref admittedLease)<=Stopwatch.GetTimestamp()){
      if(shutdownRequested||stop||!OwnerAlive()||child.HasExited||startup.ElapsedMilliseconds>=5000)throw new InvalidOperationException("fresh accepted Bati snapshot unavailable before output startup");wake.WaitOne(10);}
     recording=GameplayRecording.TryStart(config.Root,demoPermit,out recordingFailure);
     if(recording!=null)recordingDirectory=recording.DirectoryPath;
     if(shutdownRequested||Interlocked.Read(ref admittedLease)<=Stopwatch.GetTimestamp())throw new InvalidOperationException("Bati lease expired during output preparation");
    }
    if(shutdownRequested||stop||readerEnded||!OwnerAlive()||child.HasExited||startup.ElapsedMilliseconds>=5000)throw new InvalidOperationException("producer preparation ended before output startup");
    if(fixture||config.DiscardEnvironmentalOutput){sink=new Thread(ConsumeDeviceFree){IsBackground=true};sink.Start();}
    else{audio=new WasapiOutput(ring,-1,true);audio.Volume=1;audio.Muted=false;if(recording!=null)audio.OwnedRecorder=recording.Tap;audio.Start();if(!audio.Ready.WaitOne(5000)||audio.Error!=null)throw new InvalidOperationException("playback endpoint unavailable");if(recording!=null)recording.StartLoopback(audio.SelectedEndpointId);}
    var command=new Thread(ReadOwnerCommands){IsBackground=true};command.Start();
    long lastSettings=0,lastStatus=0,fadeAt=-1,lastGeometry=0;DateTime geometryModified=DateTime.MinValue;var clock=Stopwatch.StartNew();
    while(!stop){
     if(!OwnerAlive()){RequestShutdown("owner-lost");stop=true;break;}
      if(child.HasExited||readerEnded){RequestShutdown("producer-ended");throw new IOException("producer ended"+(workerFailure==null?"":": "+workerFailure));}if(audio!=null&&audio.Error!=null)throw new IOException("endpoint stopped: "+audio.Error);
     if((Stopwatch.GetTimestamp()-Interlocked.Read(ref lastPcmTicks))*1000d/Stopwatch.Frequency>5000){RequestShutdown("producer-progress-timeout");throw new TimeoutException("producer stopped progressing");}
     if(demo&&Interlocked.Read(ref admittedLease)<=Stopwatch.GetTimestamp()){shutdownRequested=true;wake.Set();}
     // A paused/background GTA fiber may stop supplying observations. The
     // producer's independent250ms freshness guard retires/mutes sources;
     // keep the healthy owned host ready for the next genuine observation.

     if(clock.ElapsedMilliseconds-lastSettings>=200){lastSettings=clock.ElapsedMilliseconds;if(fixtureLatency!=null)fixtureLatency.Progress("settings-start",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,0);long settingsAt=delivery==null?0:Stopwatch.GetTimestamp();
      if(delivery!=null)delivery.Supervisor.Add(GameplayDeliveryTrace01.Row("settings-start",-1,settingsAt));
      var s=AcousticSettingsStore.Load(config.Root,settingFile);
      if(delivery!=null)delivery.Supervisor.Add(GameplayDeliveryTrace01.Row("settings-done",-1,Stopwatch.GetTimestamp(),settingsAt));
      if(fixtureLatency!=null)fixtureLatency.Progress("settings-done",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,0);lock(sync)settings=s;wake.Set();if(!s.RichAudioEnabled||s.IntegrationMode!="experimental-additive")RequestShutdown("settings-stock-fallback");}
     if(shutdownRequested&&fadeAt<0){fadeAt=clock.ElapsedMilliseconds;shutdownFade.Begin(fadeAt,Interlocked.Read(ref ring.ConsumedFrames),ring.BufferedFrames);if(recording!=null)recording.Event("output-fade-request",Stopwatch.GetTimestamp(),new{bufferedFrames=ring.BufferedFrames,minimumMilliseconds=GameplayShutdownFade.MinimumMilliseconds,maximumMilliseconds=GameplayShutdownFade.MaximumMilliseconds});wake.Set();}
     if(fadeAt>=0&&(demo?shutdownFade.Complete(clock.ElapsedMilliseconds,Interlocked.Read(ref ring.ConsumedFrames)):clock.ElapsedMilliseconds-fadeAt>=120)){stop=true;break;}
     if(recording!=null&&!recording.Accepting){if(audio!=null)audio.OwnedRecorder=null;recordingFailure=recording.Snapshot.Reason??recording.Failure;recording.Dispose();lastRecordingMetrics=recording.Metrics();recording=null;}
     if(clock.ElapsedMilliseconds-lastGeometry>=200){lastGeometry=clock.ElapsedMilliseconds;string file=Path.Combine(config.Root,".local","qualified-geometry.json");if(File.Exists(file)&&File.GetLastWriteTimeUtc(file)!=geometryModified){geometryModified=File.GetLastWriteTimeUtc(file);try{string value=AcousticSettingsStore.ReadBounded(file,131072);lock(sync)pendingGeometry=value;wake.Set();}catch(IOException){}}}
     if(clock.ElapsedMilliseconds-lastStatus>=500){lastStatus=clock.ElapsedMilliseconds;if(fixtureLatency!=null)fixtureLatency.Progress("status-start",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,0);long statusAt=delivery==null?0:Stopwatch.GetTimestamp();if(delivery!=null)delivery.Supervisor.Add(GameplayDeliveryTrace01.Row("status-start",-1,statusAt));
      try{PublishStatus("running");}catch(IOException e){int nativeCode=e.HResult&0xffff;if(!config.DiscardEnvironmentalOutput||(nativeCode!=32&&nativeCode!=33))throw;}
      if(delivery!=null)delivery.Supervisor.Add(GameplayDeliveryTrace01.Row("status-done",-1,Stopwatch.GetTimestamp(),statusAt));
      if(fixtureLatency!=null)fixtureLatency.Progress("status-done",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,0);}
     Thread.Sleep(2);
    }
    code=0;
    }
   }catch(Exception e){failure=e.GetType().Name;failureDetail=e.Message;Console.Error.WriteLine("RichAudio gameplay stock fallback: "+failure+": "+failureDetail);}
   finally{
    Record("host-stop",stopReason??(failure==null?"host-ended":"host-fault"),new{failure,failureDetail,workerFailure,producer=producerIdentity,lastPcmQpc=Interlocked.Read(ref lastPcmTicks),lastSnapshotQpc=Interlocked.Read(ref lastSnapshotTicks),receivedBlocks=Interlocked.Read(ref received),consumedFrames=ring==null?0:Interlocked.Read(ref ring.ConsumedFrames)});
    stop=true;wake.Set();if(pipe!=null)try{pipe.Dispose();}catch(IOException){}if(audio!=null){try{audio.Dispose();}catch(Exception e){failure=failure??e.GetType().Name;code=1;}}
    if(recording!=null){try{recording.Event("host-audio-stopped",Stopwatch.GetTimestamp(),new{underflowFrames=ring.UnderflowFrames,consumedFrames=ring.ConsumedFrames,fadeReserveConsumed=shutdownFade.FullyConsumed(ring.ConsumedFrames)});recording.Dispose();}catch(Exception e){recordingFailure=e.GetType().Name;}}
    CloseProducer();
    foreach(var t in new[]{writer,reader,diagnostics,receiver,sink,ownerCommand})if(t!=null&&t.IsAlive&&!t.Join(1500)){failure="cleanup-timeout";code=1;}
    if(delivery!=null&&directory!=null)try{
     var receipt=delivery.Snapshot(session,Process.GetCurrentProcess().Id,childId,latencyProfile.StartupBlocks,latencyProfile.ProducerBlocks,Interlocked.Read(ref received),Interlocked.Read(ref ring.ConsumedFrames),issuedCredits,creditWindow.Retired,creditWindow.SourcePrepared);
     string file=Path.Combine(directory,delivery.Underflow?"first-underflow.json":"delivery-timing.json");
     using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){
      byte[] bytes=new UTF8Encoding(false).GetBytes(new JavaScriptSerializer{MaxJsonLength=1048576}.Serialize(receipt));
      output.Write(bytes,0,bytes.Length);output.Flush(true);
     }
    }catch(Exception e){Record("delivery-receipt-fault",e.GetType().Name,e.Message);code=1;}
    if(config!=null&&directory!=null)try{if(fixtureLatency!=null){var first=fixtureLatency.FirstUnderflow01();if(first!=null&&delivery==null)File.WriteAllText(Path.Combine(directory,"first-underflow.json"),Json.Serialize(first),new UTF8Encoding(false));}PublishStatus("stopped");}catch(Exception e){Record("terminal-status-fault",e.GetType().Name,e.Message);code=1;}
    Record("host-closed",stopReason??(failure==null?"host-ended":"host-fault"),new{exitCode=failure==null?code:1,failure,failureDetail});
   }
   return failure==null?code:1;
  }
  int RunTransportOnly(){
   Record("transport-ready","no-producer-no-endpoint",new{protocol=1,extension="vehicleObservations02",queueCapacity=0});
   receiver=new Thread(ReceiveTransportOnly){IsBackground=true,Name="RichAudio transport validation"};receiver.Start();
   ownerCommand=new Thread(ReadOwnerCommands){IsBackground=true,Name="RichAudio normal stop event"};ownerCommand.Start();
   while(!stop&&!shutdownRequested){if(!OwnerAlive()){RequestShutdown("owner-lost");break;}PublishTransportStatus("running");wake.WaitOne(200);}
   stop=true;return failure==null?0:1;
  }
  void ReceiveTransportOnly(){try{while(!stop){pipe=GameplayWire.Server(pipeName);pipe.WaitForConnection();GameplayWire.Peer(pipe,ownerId,true);Interlocked.Increment(ref transportConnections);
   try{while(!stop){var frame=GameplayWire.Decode(GameplayWire.Read(pipe),session);bool accepted;lock(transportGate)accepted=transport.Accept(frame,session,Stopwatch.GetTimestamp());if(accepted){Interlocked.Increment(ref frames);Interlocked.Exchange(ref lastSnapshotTicks,Stopwatch.GetTimestamp());}else Interlocked.Increment(ref expired);TransportStop.Write(pipe,new[]{TransportStop.Accepted});}}
   catch(TimeoutException){if(!stop)Interlocked.Increment(ref expired);}
   catch(Exception e){if(e is ThreadAbortException)throw;if(!stop){Interlocked.Increment(ref rejected);Record("transport-rejected",e.GetType().Name,e.Message);}}
   finally{var current=pipe;pipe=null;if(current!=null)current.Dispose();}
  }}catch(Exception e){if(!stop)Fail(e);}}
  void PublishTransportStatus(string state){
   object observations;lock(transportGate)observations=transport.Snapshot(Stopwatch.GetTimestamp());
   var status=new{schema=1,hostState=state,session,publicationQpc=Stopwatch.GetTimestamp(),publicationClockFrequency=Stopwatch.Frequency,ownerPid=ownerId,ownerStartUtcTicks=ownerStart,hostPid=Process.GetCurrentProcess().Id,nodePid=0,transportValidationOnly=true,endpointOpened=false,rendererStarted=false,pcmFrames=0,nativeSuppression=false,queueCapacity=0,connections=Interlocked.Read(ref transportConnections),receivedSnapshots=Interlocked.Read(ref frames),expiredSnapshots=Interlocked.Read(ref expired),rejectedConnections=Interlocked.Read(ref rejected),observations,failure,failureDetail};
   string path=Path.Combine(directory,"host.json"),tmp=path+".pending";File.WriteAllText(tmp,Json.Serialize(status),new UTF8Encoding(false));if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
   if(state=="stopped")File.WriteAllText(Path.Combine(directory,failure==null?"last-stop.json":"last-failure.json"),Json.Serialize(status),new UTF8Encoding(false));
  }
  void ReadOwnerCommands(){
   if(config.Shvdne){
    try{using(var signal=GameplayStopSignal.Open(ownerId,session))while(!stop){if(signal.WaitOne(100)){RequestShutdown("owner-stop-event");break;}}}
    catch(Exception){if(!stop)RequestShutdown("owner-stop-event-unavailable");}return;
   }
   // The redirected .NET writer may emit a UTF-8 preamble. Use the same
   // wire encoding as the owner and allow the reader to consume that preamble.
   try{using(var input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),true,128)){
    while(!stop){string line=input.ReadLine();if(line==null||line=="stop"){RequestShutdown(line==null?"owner-control-pipe-closed":"owner-stop-command");break;}}
   }}catch(IOException){if(!stop)RequestShutdown("owner-control-pipe-fault");}
   catch(DecoderFallbackException){if(!stop)RequestShutdown("owner-control-pipe-invalid-encoding");}
  }
  void CloseProducer(){
   bool exited=false;int? exitCode=null;
   if(child!=null&&drainProducer){
    try{
     if(!child.HasExited&&(writer==null||writer.Join(300))){
      Record("producer-stop-requested","host-stop",producerIdentity);
      PipeDeadline.Write(child.StandardInput.BaseStream,Encoding.UTF8.GetBytes("{\"type\":\"stop\"}\n"),200,"producer stop write deadline");
      child.StandardInput.Close();
      child.WaitForExit(1500);
     }
     exited=child.HasExited;
    }catch(Exception e){Record("producer-stop-signal-failed",e.GetType().Name,e.Message);}
    if(!exited)try{exited=child.HasExited;}catch(Exception){}
    if(!exited){Record("forced-containment-close","producer-exit-not-confirmed-before-job-close",producerIdentity);failure=failure??"producer-stop-timeout";}
   }
   if(nodeJob!=null){var closed=nodeJob.CloseContainment();Record("containment-closed","producer-job",new{closed.Attempted,closed.Succeeded,closed.NativeError});}
   if(child!=null){
    try{if(!child.HasExited)child.Kill();exited=child.WaitForExit(2000);if(exited)exitCode=child.ExitCode;}catch(Exception){}
    if(drainProducer&&diagnostics!=null)diagnostics.Join(300);
    if(drainProducer&&exitCode!=0)failure=failure??"producer-exit-unverified-or-nonzero";
    Record("producer-exit-observed","owned-child",new{producer=producerIdentity,exited,exitCode});
    child.Dispose();
   }
  }
  string pendingGeometry;
  internal static string SettingsCommand(AcousticSettings current,bool shutdown){return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=24}.Serialize(new{type="settings",quality=current.Quality,acceleration=current.Acceleration,enabled=current.RichAudioEnabled&&!shutdown,volume=current.OutputLevel,reflections=current.EarlyReflections,mode=current.IntegrationMode,soundMapVisible=current.SoundMapVisible,airflowEnabled=current.AirflowEnabled,airflowLevel=current.AirflowLevel});}
  // Credits belong to the existing control worker, independent of settings/status IO.
  void ReturnCredits01(){
   int returned=ring.TakeCredits(),n=creditWindow.Return(returned);
   if(delivery!=null&&returned>0)delivery.Control.Add(GameplayDeliveryTrace01.Row("credits-returned",creditBatch,Stopwatch.GetTimestamp(),0,0,returned,creditWindow.Retired,n,creditWindow.SourcePrepared?1:0));if(latencyProfile.Id!="baseline"&&creditWindow.Retired==2&&steadyWindowAtQpc==0){steadyWindowAtQpc=Stopwatch.GetTimestamp();if(fixtureLatency!=null)fixtureLatency.EnterSteady(steadyWindowAtQpc);}if(n>0){if(fixtureLatency!=null)fixtureLatency.Progress("credits-returned",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,n);Interlocked.Add(ref credits,n);}}
  void WriteControls(){try{AcousticSettings sent=null;bool sentShutdown=false;while(!stop){wake.WaitOne(20);if(stop)break;ReturnCredits01();int n=Interlocked.Exchange(ref credits,0);if(n>0&&fixtureLatency!=null)fixtureLatency.Progress("credits-sent",-1,Stopwatch.GetTimestamp(),0,ring.BufferedFrames,n);if(n>0){
    long id=++creditBatch;
    if(delivery!=null)delivery.Control.Add(GameplayDeliveryTrace01.Row("credit-write-start",id,Stopwatch.GetTimestamp(),0,0,ring.BufferedFrames,ring.PendingCredits,n,creditWindow.Retired));
    child.StandardInput.WriteLine("{\"type\":\"credit\",\"blocks\":"+n+(delivery==null?"":",\"deliveryId\":"+id)+"}");
    if(delivery!=null){issuedCredits+=n;delivery.Control.Add(GameplayDeliveryTrace01.Row("credit-write-return",id,Stopwatch.GetTimestamp(),0,0,ring.BufferedFrames,ring.PendingCredits,n,creditWindow.Retired));}
   }
   AcousticSettings current;string geometry;lock(sync){current=settings;geometry=pendingGeometry;pendingGeometry=null;}if(sent==null||sent.Revision!=current.Revision||shutdownRequested&&!sentShutdown){sent=current;sentShutdown=shutdownRequested;child.StandardInput.WriteLine(SettingsCommand(current,sentShutdown));}
   if(geometry!=null&&workerReady)child.StandardInput.WriteLine("{\"type\":\"geometry\",\"value\":"+geometry+"}");
   var pending=workerReady?Interlocked.Exchange(ref latest,null):null;if(pending!=null){var frame=pending.Frame;long now=Stopwatch.GetTimestamp();double age=(now-frame.Listener.ObservationTicks)*1000d/Stopwatch.Frequency;bool leased=frame.ValidThroughTicks<=0||now<frame.ValidThroughTicks;if(age<=250&&leased){string payload=Encoding.UTF8.GetString(GameplayWire.Encode(frame,session));string remaining=frame.ValidThroughTicks>0?",\"validForMs\":"+((frame.ValidThroughTicks-now)*1000d/Stopwatch.Frequency).ToString("R",CultureInfo.InvariantCulture):"";long before=Stopwatch.GetTimestamp();child.StandardInput.WriteLine("{\"type\":\"snapshot\",\"ageMs\":"+age.ToString("R",CultureInfo.InvariantCulture)+remaining+",\"hostWriteBeforeQpc\":"+before+",\"hostQpcFrequency\":"+Stopwatch.Frequency+",\"frame\":"+payload+"}");child.StandardInput.Flush();long after=Stopwatch.GetTimestamp();var capture=recording;if(capture!=null&&Interlocked.Read(ref controlDeliveryRows)<2400){if(capture.Event("gameplay-control-delivery",before,new{listenerSequence=frame.Listener.Sequence,observationTicks=frame.Listener.ObservationTicks,receivedHostQpc=pending.ReceivedQpc,writeBeforeQpc=before,writeAfterQpc=after,qpcFrequency=Stopwatch.Frequency,observationAgeAtWriteMs=age,controlQueueResidenceMs=(before-pending.ReceivedQpc)*1000d/Stopwatch.Frequency,supersededSnapshots=Interlocked.Read(ref supersededSnapshots)}))Interlocked.Increment(ref controlDeliveryRows);}}else{Interlocked.Increment(ref expired);if(demo)shutdownRequested=true;}}
   child.StandardInput.Flush();
   if(delivery!=null&&n>0)delivery.Control.Add(GameplayDeliveryTrace01.Row("control-flushed",creditBatch,Stopwatch.GetTimestamp()));
  }}catch(Exception e){if(!stop)Fail(e);}}
  void ReadPcm(){try{var h=new byte[16];var payload=new byte[4096];var samples=new float[1024];uint sequence=0;
   while(!stop||drainProducer){long readBefore=Stopwatch.GetTimestamp();
    if(delivery!=null)delivery.Pcm.Add(GameplayDeliveryTrace01.Row("pcm-read-start",sequence,readBefore,0,0,ring.BufferedFrames));
    if(!BlockProtocol.ReadExact(child.StandardOutput.BaseStream,h,16))break;uint blockSequence=sequence;int n=BlockProtocol.ValidateHeader(h,sequence++);if(n!=512)throw new InvalidDataException("gameplay block size");
    if(delivery!=null)delivery.Pcm.Add(GameplayDeliveryTrace01.Row("pcm-header-read",blockSequence,Stopwatch.GetTimestamp()));
    if(!BlockProtocol.ReadExact(child.StandardOutput.BaseStream,payload,n*8))throw new EndOfStreamException();if(stop)continue;long readAfter=Stopwatch.GetTimestamp();
    if(delivery!=null)delivery.Payload(blockSequence,readBefore,readAfter,ring.BufferedFrames);
    Buffer.BlockCopy(payload,0,samples,0,n*8);while(!stop&&!ring.TryWrite(samples,n))Thread.Sleep(1);long admitted=Stopwatch.GetTimestamp();
    if(delivery!=null&&!stop){
     int depth=ring.BufferedFrames;delivery.Admit(blockSequence,readAfter,admitted,depth,n);
     ringHighWaterFrames=Math.Max(ringHighWaterFrames,depth);
     long previous=Interlocked.Read(ref lastPcmTicks);
     if(blockSequence>0)Interlocked.Exchange(ref maximumAdmissionIntervalTicks,Math.Max(Interlocked.Read(ref maximumAdmissionIntervalTicks),admitted-previous));
    }
    if(fixtureLatency!=null){fixtureLatency.Admission((long)blockSequence*512,admitted);fixtureLatency.Progress("admission",blockSequence,readBefore,readAfter,ring.BufferedFrames,n,admitted);}Interlocked.Increment(ref received);Interlocked.Exchange(ref lastPcmTicks,admitted);var capture=recording;if(!stop&&capture!=null&&blockSequence%8==0&&Interlocked.Read(ref pcmTimingRows)<1500){if(capture.Event("host-producer-block",admitted,new{sequence=blockSequence,producerFrameStart=(long)blockSequence*512,frames=n,readBeforeQpc=readBefore,payloadReadAfterQpc=readAfter,ringAdmittedAfterQpc=admitted,qpcFrequency=Stopwatch.Frequency,bufferedFramesAfterConcurrentSnapshot=ring.BufferedFrames,ringCapacityFrames=PcmRing.Slots*PcmRing.MaximumFrames}))Interlocked.Increment(ref pcmTimingRows);}}
  }catch(Exception e){if(!stop)Fail(e);}finally{readerEnded=true;ring.EndOfStream=true;}}
  static bool TimingNumber(string s,out double n){return Double.TryParse(s,NumberStyles.Float,CultureInfo.InvariantCulture,out n)&&!Double.IsNaN(n)&&!Double.IsInfinity(n)&&n>=0;}
  void ReadDelivery(string line,long receivedAt){
   string[] f=line.Split('|');
   if(f.Length!=8){delivery.InvalidNodeRow();return;}
   string phase=f[1]=="b"?"render-start":f[1]=="w"?"stdout-attempt":f[1]=="d"?"stdout-complete":f[1]=="c"?"credit-received":null;
   long id;int dropped;
   if(phase==null||!Int64.TryParse(f[2],NumberStyles.None,CultureInfo.InvariantCulture,out id)){delivery.InvalidNodeRow();return;}
   var row=GameplayDeliveryTrace01.Row(phase,id,receivedAt);
   if(!TimingNumber(f[3],out row.NodeMs)||!TimingNumber(f[4],out row.NodeStartMs)||!TimingNumber(f[5],out row.NodeRenderMs)||
      !Int32.TryParse(f[6],NumberStyles.None,CultureInfo.InvariantCulture,out row.Amount)||!Int32.TryParse(f[7],NumberStyles.None,CultureInfo.InvariantCulture,out dropped)){
    delivery.InvalidNodeRow();return;
   }
   delivery.Node(row,dropped);
  }
  void ReadDiagnostics(){try{string line;while((!stop||drainProducer)&&(line=child.StandardError.ReadLine())!=null){long receivedAt=Stopwatch.GetTimestamp();if(line.Length>32768)throw new InvalidDataException("producer diagnostic size");
   if(delivery!=null&&line.StartsWith("delivery01|",StringComparison.Ordinal)){ReadDelivery(line,receivedAt);continue;}
   lock(sync){var d=Json.DeserializeObject(line)as Dictionary<string,object>;object type;if(d!=null&&d.TryGetValue("type",out type)){
    string kind=(string)type;
    object hardMiss;
    if(delivery!=null&&kind=="complete-render-overrun"&&d.TryGetValue("hardMiss",out hardMiss)&&true.Equals(hardMiss))
     delivery.HardRenderMiss(receivedAt,d);
    if(delivery!=null&&kind=="first-source-render")delivery.FirstSourceRender(receivedAt,d);
    if(delivery!=null&&kind=="installed-world-producer-admission"){
     var row=GameplayDeliveryTrace01.Row("worker-publication",Convert.ToInt64(d["requestId"]),receivedAt);
     row.NodeMs=d.ContainsKey("nodeAtMs")?Convert.ToDouble(d["nodeAtMs"]):0;
     row.NodeStartMs=Convert.ToDouble(d["workerPreparationMs"]);row.NodeRenderMs=Convert.ToDouble(d["validationMs"]);delivery.Worker.Add(row);
    }
    if(kind=="producer-terminal"||kind=="installed-world-worker-closed"||kind=="installed-world-worker-close-failed"||kind=="gameplay-error")Record("producer-evidence",kind,d);
    if((string)type=="gameplay-status"){workerStatus=line;if(latencyProfile.Id!="baseline"&&!creditWindow.SourcePrepared&&PreparedSource(d)){preparedSourceAtQpc=receivedAt;creditWindow.SourcePrepared=true;}}if((string)type=="gameplay-error"){object code;workerFailure=d.TryGetValue("code",out code)?Convert.ToString(code):"unspecified worker failure";}if((string)type=="gameplay-ready"){workerReady=true;wake.Set();}if((string)type=="producer-block-timing"){if(fixtureLatency!=null){fixtureLatency.Producer(d,receivedAt);object nodeDone;if(d.TryGetValue("stdoutCompletedNodeMs",out nodeDone))fixtureLatency.Progress("node-output",Convert.ToInt64(d["producerFrameStart"])/512,receivedAt,0,ring.BufferedFrames,512,0,Convert.ToDouble(nodeDone));}var capture=recording;if(capture!=null&&line.Length<=1900&&Interlocked.Read(ref producerTimingRows)<1500){if(capture.Event("producer-block-timing",receivedAt,d))Interlocked.Increment(ref producerTimingRows);else Interlocked.Increment(ref producerTimingRowsRejected);}else Interlocked.Increment(ref producerTimingRowsRejected);}}}}}catch(Exception e){if(!stop)Fail(e);}}
  static bool PreparedSource(Dictionary<string,object> row){object raw;var status=row.TryGetValue("status",out raw)?raw as Dictionary<string,object>:null;var stages=status!=null&&status.TryGetValue("stageCounters",out raw)?raw as Dictionary<string,object>:null;if(stages==null)return false;foreach(string key in new[]{"engine","exhaust","stereo"}){var stage=stages.TryGetValue(key,out raw)?raw as Dictionary<string,object>:null;if(stage==null||!stage.TryGetValue("nonzeroBlocks",out raw)||Convert.ToInt64(raw)<=0)return false;}return true;}
  void Receive(){try{var validator=new StateValidator();while(!stop){pipe=GameplayWire.Server(pipeName);pipe.WaitForConnection();GameplayWire.Peer(pipe,ownerId,true);
   try{while(!stop){byte[] b=GameplayWire.Read(pipe);var f=GameplayWire.Decode(b,session);Protocol.Check(f.Vehicles.Length<=config.MaximumVehicleObservations,"gameplay package vehicle budget");double age=(Stopwatch.GetTimestamp()-f.Listener.ObservationTicks)*1000d/Stopwatch.Frequency;
     long now=Stopwatch.GetTimestamp();bool leased=f.ValidThroughTicks<=0||now<f.ValidThroughTicks;
     if(age<=250&&age>=-2&&leased){validator.Accept(f.Listener,now);if(demo){
       if(f.Vehicles.Length==0){Interlocked.Exchange(ref admittedLease,0);shutdownRequested=true;wake.Set();}
       else if(f.Vehicles.Length!=1||f.Vehicles[0].Model!=0xF9300CC5||f.Vehicles[0].Context!="player"||!f.Vehicles[0].Valid||!f.Vehicles[0].Running||!f.Listener.Valid||f.Listener.Paused||f.ValidThroughTicks<=now)throw new InvalidDataException("accepted running player-Bati lease required");
       else Interlocked.Exchange(ref admittedLease,f.ValidThroughTicks);
      }foreach(var v in f.Vehicles)if(!config.Allows(v.Model,v.Context))v.Valid=false;if(Interlocked.Exchange(ref latest,new PendingFrame{Frame=f,ReceivedQpc=now})!=null)Interlocked.Increment(ref supersededSnapshots);Interlocked.Exchange(ref lastSnapshotTicks,now);Interlocked.Increment(ref frames);var capture=recording;if(capture!=null)capture.Frame(f,f.ValidThroughTicks);wake.Set();}else{Interlocked.Increment(ref expired);if(demo){Interlocked.Exchange(ref admittedLease,0);shutdownRequested=true;wake.Set();}}
     TransportStop.Write(pipe,new[]{TransportStop.Accepted});
    }}catch(TimeoutException){if(!stop)Interlocked.Increment(ref expired);}
    catch(IOException e){if(!stop&&Interlocked.Increment(ref rejected)==1&&config.CatalogueFleet)Record("snapshot-rejected",e.GetType().Name,e.Message);}
    finally{pipe.Dispose();pipe=null;}
  }}catch(Exception e){if(!stop)Fail(e);}}
  unsafe void ConsumeDeviceFree(){try{var clock=Stopwatch.StartNew();while(!stop&&ring.Count<ring.GameplayPrefillBlocks&&clock.Elapsed.TotalSeconds<5)Thread.Sleep(1);if(stop)return;if(ring.Count<ring.GameplayPrefillBlocks)throw new TimeoutException("device-free sink prefill");Interlocked.Exchange(ref started,1);const int callbackFrames=960;var buffer=new float[callbackFrames*2];long begin=Stopwatch.GetTimestamp(),block=0;fixtureCadence=new GameplayFixtureCadence01(begin,Stopwatch.Frequency);
   while(!stop){long due=fixtureCadence.Due(block);while(!stop&&Stopwatch.GetTimestamp()<due)Thread.Sleep(1);if(stop)break;due=fixtureCadence.Begin(block,Stopwatch.GetTimestamp());int bufferedBefore=ring.BufferedFrames;long callbackBefore=Stopwatch.GetTimestamp();int callbackSupplied=0;long before=ring.ConsumedFrames,under=ring.UnderflowFrames,end=ring.EndSilenceFrames;fixed(float* p=buffer){int supplied=ring.FillCalibrated(p,callbackFrames,1);callbackSupplied=supplied;var capture=recording;if(capture!=null){int slot=capture.Tap.Prepare(p,callbackFrames,before,ring.ConsumedFrames,before-under-end,supplied,ring.UnderflowFrames-under,ring.EndSilenceFrames-end);capture.Tap.Commit(slot);}}if(delivery!=null)delivery.Callback(block,due,callbackBefore,Stopwatch.GetTimestamp(),callbackFrames,callbackSupplied,(int)(ring.UnderflowFrames-under),bufferedBefore,ring.BufferedFrames,ring.FirstUnderflowFrame,before-under-end,ring.UnderflowFrames>under?ring.PendingCredits:0);
   if(fixtureLatency!=null){fixtureLatency.Submission(before-under-end,callbackFrames,Stopwatch.GetTimestamp());fixtureLatency.Callback01(block,due,callbackBefore,Stopwatch.GetTimestamp(),callbackFrames,callbackSupplied,bufferedBefore,ring.BufferedFrames,ring.UnderflowFrames>under,ring.FirstUnderflowFrame,shutdownRequested,Interlocked.Read(ref admittedLease),Interlocked.Read(ref lastSnapshotTicks));}double peak=0,energy=0;long silent=Interlocked.Read(ref fixtureTrailingSilentFrames);for(int i=0;i<callbackFrames;i++){float l=buffer[i*2],r=buffer[i*2+1];peak=Math.Max(peak,Math.Max(Math.Abs(l),Math.Abs(r)));energy+=(double)l*l+(double)r*r;silent=l==0&&r==0?silent+1:0;}Interlocked.Exchange(ref fixtureTrailingSilentFrames,silent);Interlocked.Exchange(ref fixtureLastPeak,peak);Interlocked.Exchange(ref fixtureLastSumSquares,energy);ring.RequireContinuousProducer();Interlocked.Increment(ref fixtureCallbacks);block++;wake.Set();}
  }catch(Exception e){if(!stop)Fail(e);}}
  void PublishStatus(string state){
   if(config.TransportValidationOnly){PublishTransportStatus(state);return;}
   AcousticSettings s;Dictionary<string,object> measured=null;lock(sync){s=settings;if(workerStatus!=null){var d=Json.DeserializeObject(workerStatus)as Dictionary<string,object>;object raw;if(d!=null&&d.TryGetValue("status",out raw))measured=raw as Dictionary<string,object>;}}
   var status=new Dictionary<string,object>{{"requestedQuality",s.Quality},{"activeQuality","performance"},{"pathBudget",12},{"requestedAcceleration",s.Acceleration},{"activeAcceleration","cpu"},{"gpuResultsApplied",0},{"qualityDeadlineMisses",0},{"droppedResults",0},{"settingsRevision",s.Revision},{"richAudioEnabled",s.RichAudioEnabled},{"outputLevel",s.OutputLevel},{"earlyReflections",s.EarlyReflections},{"integrationMode",s.IntegrationMode},{"fallbackReason","Conditional direct sound; no qualified collision coverage"}};
   if(measured!=null)foreach(var kv in measured)status[kv.Key]=kv.Value;
   status["nativeUnderflowFrames"]=Interlocked.Read(ref ring.UnderflowFrames);status["nativeConsumedFrames"]=Interlocked.Read(ref ring.ConsumedFrames);status["hostMemoryBytes"]=Process.GetCurrentProcess().WorkingSet64;
   status["observationAgeMs"]=(Stopwatch.GetTimestamp()-Interlocked.Read(ref lastSnapshotTicks))*1000d/Stopwatch.Frequency;
   status["producerStartupBlocks"]=ring.GameplayPrefillBlocks;status["producerReserveMs"]=ring.SelectedGameplayReserveMilliseconds;status["bufferedFrames"]=ring.BufferedFrames;
   var wrapper=new Dictionary<string,object>{{"schemaVersion",1},{"hostState",state},{"recordedAtUtc",DateTime.UtcNow.ToString("o")},{"status",status}};
   AcousticSettingsStore.WriteAtomic(config.Root,AcousticSettingsStore.StatusPath(AcousticSettingsStore.DefaultPath(config.Root)),Json.Serialize(wrapper),16384);
   var evidence=new Dictionary<string,object>{{"schema",1},{"hostState",state},{"fixture",fixture},{"endpointOpened",!fixture&&audio!=null&&audio.DeviceOpened},{"failure",failure},{"ownerPid",ownerId},{"hostPid",Process.GetCurrentProcess().Id},{"nodePid",childId},{"receivedBlocks",Interlocked.Read(ref received)},{"receivedSnapshots",Interlocked.Read(ref frames)},{"expiredSnapshots",Interlocked.Read(ref expired)},{"rejectedConnections",Interlocked.Read(ref rejected)},{"consumedFrames",Interlocked.Read(ref ring.ConsumedFrames)},{"underflowFrames",Interlocked.Read(ref ring.UnderflowFrames)},{"peak",ring.Peak},{"hostCpuMs",Process.GetCurrentProcess().TotalProcessorTime.TotalMilliseconds},{"hostMemoryBytes",Process.GetCurrentProcess().WorkingSet64},{"fixtureCallbacks",Interlocked.Read(ref fixtureCallbacks)},{"fixtureStarted",Thread.VolatileRead(ref started)!=0},{"nativeSuppression",false},{"worker",measured}};
   evidence["outputSink"]=config.DiscardEnvironmentalOutput?"environment-observation":fixture?"authored-fixture":"wasapi";
   evidence["publicationQpc"]=Stopwatch.GetTimestamp();evidence["publicationClockFrequency"]=Stopwatch.Frequency;evidence["session"]=session;evidence["firstUnderflowFrame"]=ring.FirstUnderflowFrame;evidence["failureDetail"]=failureDetail;evidence["workerFailure"]=workerFailure;evidence["audioError"]=audio==null?null:audio.Error;evidence["outputMetrics"]=audio==null?null:audio.Metrics();evidence["producerStartupBlocks"]=ring.GameplayPrefillBlocks;evidence["producerReserveMs"]=ring.SelectedGameplayReserveMilliseconds;evidence["bufferedFrames"]=ring.BufferedFrames;evidence["fixtureCallbackFrames"]=fixture?960:0;evidence["deviceFreeCallbackFrames"]=config.DiscardEnvironmentalOutput?960:0;evidence["sumSquares"]=ring.SumSquares;
   evidence["latencyDiagnostics"]=new{hostClockDomain="host-Stopwatch-QPC",qpcFrequency=Stopwatch.Frequency,controlDeliveryRows=Interlocked.Read(ref controlDeliveryRows),producerTimingRows=Interlocked.Read(ref producerTimingRows),producerTimingRowsRejected=Interlocked.Read(ref producerTimingRowsRejected),pcmTimingRows=Interlocked.Read(ref pcmTimingRows),supersededSnapshots=Interlocked.Read(ref supersededSnapshots),sampleEveryProducerBlocks=8,maximumProducerRows=1500,maximumControlRows=2400,ringDepthScope="Concurrent snapshot; not an atomic occupancy or speaker latency measurement"};
   if(config.DiscardEnvironmentalOutput){
    evidence["discardCadence"]=fixtureCadence==null?null:fixtureCadence.Snapshot();
    evidence["ringObservedHighWaterFrames"]=Thread.VolatileRead(ref ringHighWaterFrames);
    evidence["maximumAdmissionIntervalMs"]=Interlocked.Read(ref maximumAdmissionIntervalTicks)*1000d/Stopwatch.Frequency;
    evidence["terminalDrainSilenceFrames"]=Interlocked.Read(ref ring.EndSilenceFrames);
   }
   if(latencyProfile.Id!="baseline"){evidence["latencyProfile"]=latencyProfile.Id;evidence["steadyProducerCreditBlocks"]=latencyProfile.ProducerBlocks;evidence["sourcePreparedForSteadyWindow"]=creditWindow.SourcePrepared;evidence["startupCreditsRetired"]=creditWindow.Retired;evidence["preparedSourceAtQpc"]=preparedSourceAtQpc;evidence["steadyWindowAtQpc"]=steadyWindowAtQpc;evidence["profileClockFrequency"]=Stopwatch.Frequency;}
   if(fixture){evidence["fixtureCadence"]=fixtureCadence==null?null:fixtureCadence.Snapshot();evidence["offlineLatencyMeasurements"]=fixtureLatency.Snapshot();evidence["fixtureTrailingSilentFrames"]=Interlocked.Read(ref fixtureTrailingSilentFrames);evidence["fixtureLastPeak"]=Interlocked.CompareExchange(ref fixtureLastPeak,0,0);evidence["fixtureLastSumSquares"]=Interlocked.CompareExchange(ref fixtureLastSumSquares,0,0);}
   if(demo){evidence["demoProfile"]="PLAYABLE-13";evidence["recordingRequested"]=demoPermit!=null&&demoPermit.RecordingAllowed;evidence["loopbackRequested"]=demoPermit!=null&&demoPermit.LoopbackAllowed;evidence["recordingFailure"]=recordingFailure;evidence["recordingDirectory"]=recordingDirectory;evidence["recording"]=recording==null?lastRecordingMetrics:recording.Metrics();evidence["fadeReserveConsumed"]=shutdownFade.FullyConsumed(ring.ConsumedFrames);evidence["humanListeningApproved"]=false;var capture=recording;object sourceCounters=null;if(measured!=null)measured.TryGetValue("stageCounters",out sourceCounters);if(capture!=null)capture.Event("host-buffer-state",Stopwatch.GetTimestamp(),new{receivedBlocks=received,consumedFrames=ring.ConsumedFrames,bufferedFrames=ring.BufferedFrames,underflowFrames=ring.UnderflowFrames,outputFrames=audio==null?ring.ConsumedFrames:audio.SubmittedFrames,outputPeak=ring.Peak,endpointOpened=audio!=null&&audio.DeviceOpened,sourceCounters=sourceCounters});}
   string path=Path.Combine(directory,"host.json"),tmp=path+".pending";File.WriteAllText(tmp,Json.Serialize(evidence),new UTF8Encoding(false));if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
   if(state=="stopped")File.WriteAllText(Path.Combine(directory,failure==null?"last-stop.json":"last-failure.json"),Json.Serialize(evidence),new UTF8Encoding(false));
  }
 }
}
