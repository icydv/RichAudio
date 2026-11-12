using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using GTA;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;
using RichAudio.Preparation;

[assembly:TargetFramework(".NETFramework,Version=v4.8",FrameworkDisplayName=".NET Framework 4.8")]
namespace RichAudio.Integration.Shvdne
{
    // SHVDNE's normal script thread marshals Function.Call through its supported
    // domain task mechanism. It is NOT the GTA main thread. No waits/yields,
    // filesystem operations, acoustic rendering or worker joins occur in Tick.
    [ScriptAttributes(Author="RichAudio",NoScriptThread=false)]
    public sealed class RichAudioScript : Script
    {
        const string ApiSha="1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48";
        readonly string root;
        readonly string observationSession=Guid.NewGuid().ToString("N");
        readonly AutoResetEvent diagnosticsWake=new AutoResetEvent(false);
        ShvdneConfiguration configuration;
        ShvdneHostController host;
        ShvdneGameSource source;
        SharedFrameSampler sampler;
        StartupTrace02B startupTrace;
        ShvdneMenu menu;
        PassiveSoundMapBridge soundMap;
        WorldWarmupSupervisor world;
        object latestDiagnostic;
        int stopped,initialized;
        long nextSample,nextDiagnostic,ticks;
        string startup="loading";
        string stopReason;
        string transportCommandState="passive";volatile bool transportArmed,transportRetired;long passiveBegan;
        bool wasReady;
        ListenerState lastDiagnosticListener;
        readonly TimingSeries02 diagnosticSerialization=new TimingSeries02();
        public RichAudioScript()
        {
            root=Path.Combine(BaseDirectory,"RichAudio");Interval=0;
            Tick+=OnTick;Aborted+=OnAborted;KeyDown+=OnKeyDown;KeyUp+=OnKeyUp;
            AppDomain.CurrentDomain.DomainUnload+=OnDomainUnload;
            AppDomain.CurrentDomain.ProcessExit+=OnDomainUnload;
            new Thread(InitializeAndJournal){IsBackground=true,Name="RichAudio SHVDNE bootstrap"}.Start();
        }
        void InitializeAndJournal()
        {
            try{
                var config=ShvdneConfiguration.Read(Path.Combine(root,"integration.json"));
                if(config.Enabled){
                    string game=Process.GetCurrentProcess().MainModule.FileName;
                    if(FileVersionInfo.GetVersionInfo(game).FileVersion!="1.0.1158.16")throw new InvalidDataException("Exact game version not admitted");
                    using(var input=File.OpenRead(typeof(Script).Assembly.Location))using(var sha=SHA256.Create()){
                        if(BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant()!=ApiSha)throw new InvalidDataException("SHVDNE API3 differs from pinned release");
                    }
                    var links=ShvdnePackageLinks.Prepare(root,config);
                    if(config.HostEnabled){
                        var controller=new ShvdneHostController();host=controller;
                        if(Volatile.Read(ref stopped)==0)controller.Start(links.PlayablePath,game,typeof(Script).Assembly.Location);
                    }
                    // Construction and worker startup need no GTA API. Publish
                    // completed references before the initialization barrier.
                    if(Volatile.Read(ref stopped)==0&&config.MenuEnabled)menu=new ShvdneMenu(links.MenuPath);
                    if(Volatile.Read(ref stopped)==0&&config.SoundMapEnabled){soundMap=new PassiveSoundMapBridge(links.MenuPath,true);soundMap.Start();}
                    if(Volatile.Read(ref stopped)==0&&config.WorldWarmupEnabled){world=new WorldWarmupSupervisor();world.Start(Path.Combine(root,"world-warmup.json"),game);}
                }
                if(config.Enabled&&config.StartupTiming02B){startupTrace=new StartupTrace02B();transportCommandState="diagnostic-disarmed";startupTrace.BootstrapReadyQpc=Stopwatch.GetTimestamp();}
                configuration=config;startup=config.Enabled?"ready":"disabled";Volatile.Write(ref initialized,1);
                var serializer=new JavaScriptSerializer{MaxJsonLength=65536};
                while(true){
                    if(Volatile.Read(ref stopped)==0)diagnosticsWake.WaitOne(1000);
                    var value=Interlocked.Exchange(ref latestDiagnostic,null);
                    if(value!=null)WriteDiagnostic(serializer,value);
                    if(config.Enabled&&config.TransportValidationOnly&&!config.StartupTiming02B&&Volatile.Read(ref stopped)==0){
                        var measured=sampler;
                        if(transportArmed&&measured!=null&&(measured.Timing.Batch.Over10>0||measured.Timing.Tick.Over10>0||measured.GetterFailures>0||measured.Timing.MissedIntervals>0)){
                            host.SetTransportArmed(false);transportArmed=false;transportRetired=true;transportCommandState="retired-observation-failure";
                        }
                        CheckTransportCommand(serializer);
                    }
                    if(Volatile.Read(ref stopped)!=0){
                        // A graceful script abort gives this ordinary worker a
                        // chance to drain. Domain teardown can still abort it.
                        if(config.Enabled)WriteDiagnostic(serializer,new{schema=1,session=observationSession,state="stopped",reason=Volatile.Read(ref stopReason),forcedDomainDrainGuaranteed=false});
                        break;
                    }
                }
            }catch(ThreadAbortException){throw;}
            catch(Exception e){startup="bootstrap-failed:"+e.GetType().Name;Volatile.Write(ref initialized,-1);Stop("bootstrap-failed");}
            finally{
                // Recheck late-created resources even if Stop raced bootstrap.
                if(menu!=null)menu.Stop();
                if(soundMap!=null)soundMap.AbortAndCloseContainment();
                if(world!=null)world.AbortAndCloseContainment();
                var h=host;if(h!=null){h.AbortAndCloseContainment("script-worker-exit");h.Join(5000);h.Dispose();}
            }
        }
        void WriteDiagnostic(JavaScriptSerializer serializer,object value)
        {
            long serializationBegan=Stopwatch.GetTimestamp();
            var packet=value as System.Collections.Generic.Dictionary<string,object>;
            if(packet==null){packet=serializer.Deserialize<System.Collections.Generic.Dictionary<string,object>>(serializer.Serialize(value));}
            var sampled=sampler;var h=host;
            packet["timing02"]=sampled==null?null:sampled.Timing.Snapshot();packet["publisher02"]=h==null?null:h.PublisherMetrics;
            packet["transportSession"]=h==null?null:h.Session;packet["transportCommandState"]=transportCommandState;
            packet["passiveGateReady"]=PassiveGateReady();packet["startupTiming02B"]=configuration!=null&&configuration.StartupTiming02B;
            var trace=startupTrace;if(trace!=null)packet["startupTrace02B"]=trace.Drain();
            packet["diagnosticSerialization02"]=diagnosticSerialization.Snapshot();
            string encoded=serializer.Serialize(packet);
            diagnosticSerialization.Add(ObservationTiming02.Ms(Stopwatch.GetTimestamp()-serializationBegan));
            Directory.CreateDirectory(Path.Combine(root,"logs"));
            File.AppendAllText(Path.Combine(root,"logs","session-"+observationSession+".jsonl"),encoded+Environment.NewLine);
        }
        void OnTick(object sender,EventArgs args)
        {
            if(Volatile.Read(ref stopped)!=0||Volatile.Read(ref initialized)!=1||!configuration.Enabled)return;
            long tickBegan=Stopwatch.GetTimestamp();
            try{
                if(source==null){
                    if(startupTrace!=null)startupTrace.SamplerSetupBeforeQpc=Stopwatch.GetTimestamp();
                    source=new ShvdneGameSource(configuration.AllowMemoryTelemetry,configuration.UseEnhancedNativeTelemetry);source.StartupTrace=startupTrace;
                    sampler=new SharedFrameSampler(host==null?observationSession:host.Session,source,Allows,configuration.MaximumVehicles);sampler.IncludeTransportObservations=configuration.TransportValidationOnly;sampler.StartupTrace=startupTrace;
                    if(startupTrace!=null)startupTrace.SamplerSetupAfterQpc=Stopwatch.GetTimestamp();
                }
                ticks++;bool ready=source.StoryReady;
                if(host!=null)host.SetStoryReady(ready);if(ready&&passiveBegan==0)Interlocked.CompareExchange(ref passiveBegan,Stopwatch.GetTimestamp(),0);
                if(soundMap!=null)soundMap.SetStoryReady(ready);
                if(wasReady&&!ready)sampler.Invalidate();wasReady=ready;
                if(!ready)lastDiagnosticListener=null;
                if(menu!=null)menu.Tick(ready);
                long now=Stopwatch.GetTimestamp();
                if(ready&&now>=nextSample){
                    nextSample=sampler.Timing.Due(now,nextSample,Stopwatch.Frequency/configuration.SampleHz);
                    sampler.WorldPreparationStartedUtc=world==null?null:world.StartedUtc;
                    var frame=sampler.Capture();
                    // Plain copied listener state already acquired by the sampler.
                    // Keep host-disabled smoke observations independently reviewable.
                    lastDiagnosticListener=frame==null?null:frame.Listener;
                    if(frame!=null){
                        if(host!=null&&!configuration.StartupTiming02B&&(!configuration.TransportValidationOnly||transportArmed))host.Publish(frame);
                        if(world!=null)world.OfferInitialObservation01(frame.Session,frame.Listener.Sequence,frame.Listener.Generation,frame.Listener.ObservationTicks,frame.Listener.ClockFrequency,frame.Listener.Position);
                        if(soundMap!=null){var l=frame.Listener;var i=frame.CameraInteriorReadback;
                            soundMap.Publish(new PassiveCameraSample{Sequence=l.Sequence,Generation=l.Generation,ObservationTicks=l.ObservationTicks,
                                ObservedAtUnixMs=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds-(long)((Stopwatch.GetTimestamp()-l.ObservationTicks)*1000d/Stopwatch.Frequency),
                                Position=l.Position,Forward=l.Forward,Up=l.Up,Velocity=l.Velocity,Valid=l.Valid,Reason=l.Reason,
                                InteriorOutcome=i==null?null:i.Outcome,InteriorProxy=i==null?null:i.Proxy,InteriorReady=i==null?null:i.Ready,
                                InteriorArchetype=i==null?null:i.Archetype,InteriorOrigin=i==null?null:i.Origin});
                        }
                    }
                }
                if(now>=nextDiagnostic){nextDiagnostic=now+Stopwatch.Frequency;
                    QueueDiagnostic(new{schema=1,session=observationSession,ticks=ticks,state=startup,storyReady=ready,
                        playerPedHandle=source.LastReadyPlayerPedHandle,listener=lastDiagnosticListener,
                        observationStatus=sampler.LastStatus,observations=sampler.LastObservations,captures=sampler.Captures,
                        missingOperatingPoints=sampler.MissingOperatingPoints,retirements=sampler.Retirements,getterFailures=sampler.GetterFailures,
                        maximumObservationMs=sampler.MaximumObservationMs,hostState=host==null?"disabled":host.State,hostPid=host==null?0:host.HostPid,
                        nativeAudioOwnership=false,exactBuildQualified=false});
                }
            }catch(ThreadAbortException){throw;}
            catch(Exception e){QueueDiagnostic(new{schema=1,session=observationSession,state="callback-failed",exception=e.GetType().Name});Stop("callback-failed");}
            finally{var measured=sampler;if(measured!=null)measured.Timing.Tick.Add(ObservationTiming02.Ms(Stopwatch.GetTimestamp()-tickBegan));}
        }
        bool PassiveGateReady(){var s=sampler;long began=Interlocked.Read(ref passiveBegan);var l=lastDiagnosticListener;return s!=null&&began>0&&ShvdneHostController.PassiveTimingGate02(Stopwatch.GetTimestamp()-began,s.Timing.Batch.Count,s.Timing.Batch.Over10,s.Timing.Tick.Over10,s.GetterFailures,l!=null&&l.Valid&&!l.Paused,s.Timing.MissedIntervals);}
        void CheckTransportCommand(JavaScriptSerializer serializer){
            string file=Path.Combine(root,"state","transport-command.json");if(!File.Exists(file))return;
            PlayableConfiguration.NoLinks(file);if(new FileInfo(file).Length>1024)throw new InvalidDataException("Bounded transport command required");
            var command=serializer.Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(file));File.Delete(file);
            object session,action;if(command==null||!command.TryGetValue("session",out session)||!Equals(session,host.Session)||!command.TryGetValue("action",out action)) {transportCommandState="rejected-session-command";return;}
            string decision=ShvdneHostController.CommandDecision02(host.Session,session,action,PassiveGateReady(),transportArmed,transportRetired);
            if(decision=="arm"){
                host.SetTransportArmed(true);transportArmed=true;transportCommandState="armed-after-passive-gate";
            }else if(decision=="retire"){host.SetTransportArmed(false);transportArmed=false;transportRetired=true;transportCommandState="retired-no-rearm";}
            else transportCommandState=decision;
        }
        bool Allows(uint model,string context)
        {var h=host;return h==null||h.Configuration==null||h.Configuration.Allows(model,context);}
        void QueueDiagnostic(object value){if(Volatile.Read(ref stopped)!=0)return;Interlocked.Exchange(ref latestDiagnostic,value);diagnosticsWake.Set();}
        void OnKeyDown(object sender,System.Windows.Forms.KeyEventArgs args){var m=menu;if(Volatile.Read(ref stopped)==0&&m!=null)m.KeyDown(args.KeyCode);}
        void OnKeyUp(object sender,System.Windows.Forms.KeyEventArgs args){var m=menu;if(Volatile.Read(ref stopped)==0&&m!=null)m.KeyUp(args.KeyCode);}
        void OnAborted(object sender,EventArgs args){Stop("script-aborted");}
        void OnDomainUnload(object sender,EventArgs args){Stop("domain-unload");}
        void Stop(string reason)
        {
            Interlocked.CompareExchange(ref stopReason,reason,null);
            if(Interlocked.Exchange(ref stopped,1)!=0)return;
            Tick-=OnTick;Aborted-=OnAborted;KeyDown-=OnKeyDown;KeyUp-=OnKeyUp;
            AppDomain.CurrentDomain.DomainUnload-=OnDomainUnload;AppDomain.CurrentDomain.ProcessExit-=OnDomainUnload;
            var h=host;if(h!=null)h.AbortAndCloseContainment(reason);
            if(menu!=null)menu.Stop();if(soundMap!=null)soundMap.AbortAndCloseContainment();if(world!=null)world.AbortAndCloseContainment();
            diagnosticsWake.Set();
        }
    }
}
