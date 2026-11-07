#if SHV_HANDOFF_09
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Rph
{
    // This profile deliberately has no GameplayRuntime instance or publisher
    // endpoint. It exercises the real gameplay value contract into a bounded
    // private evidence sink. It cannot activate the playback host from settings.
    public static class ShvPassiveHandoffEntry
    {
        static volatile bool stopping,startRequested,stopRequested;
        static string stage="waiting-reviewed-session",reason="not-started";
        static long accepted,frames;
#if SHV_HANDOFF_15
        static readonly CameraListenerTracker listenerTracker=new CameraListenerTracker();
#else
        static CameraObservation previous;
        static long listenerSequence,listenerGeneration=1;
#endif
        static bool ran;
#if SHV_PLAYABLE_13
        static RichAudio.Beacon.Windows.BatiPlaybackSession playback;
#endif
        internal static void Run()
        {
            if(ran)return;ran=true;
            ShvHandoffBootstrap.Configuration config=null;
            ShvProducerModule module=null;
            TrustedShvComposition composition=null;
            ShvGameplayFrameAdapter adapter=null;
            ShvHandoffJournal journal=null;
            RphHandoffSampler sampler=null;
            bool began=false,completed=false,sourceRetired=false,nativeFifoDrained=false,rawAuditAdmissionFailed=false;
            uint lastObservedQueued=0;
            long lastClockLogged=-1;
            try
            {
#if SHV_PLAYABLE_13
                Game.Console.Print("RichAudio Bati audio profile; separately approved lease and explicit AudioOn required. GTA stock audio retained.");
#elif SHV_HANDOFF_15
                Game.Console.Print("RichAudio PLAYABLE-15 passive listener recovery profile; GTA stock audio retained. No audio host or recording.");
#elif SHV_HANDOFF_14
                Game.Console.Print("RichAudio PLAYABLE-14 passive fresh-context handoff only; GTA stock audio retained. No audio host or recording.");
#elif SHV_HANDOFF_13
                Game.Console.Print("RichAudio PLAYABLE-13 passive handoff only; GTA stock audio retained. No audio host or recording.");
#else
                Game.Console.Print("RichAudio PLAYABLE-12 passive handoff only; GTA stock audio retained. No audio host or recording.");
#endif
                // A later authorised coordinator writes the process-bound lease.
                // Merely loading this candidate cannot start target readings.
                long leaseDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*60;
                while(!stopping&&Stopwatch.GetTimestamp()<leaseDeadline)
                {
                    if(ShvHandoffBootstrap.TryLoad(out config,out reason))break;
                    if(reason!="reviewed-session-absent")throw new InvalidDataException(reason);
                    GameFiber.Sleep(50);
                }
                if(stopping||config==null)throw new InvalidDataException("reviewed-session-not-acquired");
                stage="checking-rph-compatibility";
                Assembly caller=typeof(ShvPassiveHandoffEntry).Assembly;
                var compatibility=RphHandoffCompatibility.Inspect();
                Need(compatibility.Compatible,compatibility.Reason);
#if SHV_PLAYABLE_13
                playback=new RichAudio.Beacon.Windows.BatiPlaybackSession(config.SessionId,false,config.RecordingAllowed,config.LoopbackAllowed);
                playback.Start(ShvHandoffBuildPolicy.GameplayPointerPath,ShvHandoffBuildPolicy.GamePath);
#endif
                stage="waiting-offline-story";
                long storyDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*300;
                while(!stopping&&!stopRequested&&Stopwatch.GetTimestamp()<storyDeadline&&!CameraSampler.StoryReady())
                    GameFiber.Sleep(50);
                Need(!stopping&&!stopRequested&&CameraSampler.StoryReady(),"offline-story-not-acquired");
                stage="attaching-reviewed-module";
                module=ShvProducerModule.AttachLoaded(config.CreateReview(Hash(caller.Location)),caller);
                // Retain the functional check and best-effort private diagnostics
                // before source Open. Metadata availability never decides API
                // compatibility; ordinary journal failure still stops the run.
                journal=new ShvHandoffJournal(config.EvidenceRoot);
                Need(journal.WriteEvent("rph-compatibility",new{runtimePolicy="functional-compatibility",
                    compatible=compatibility.Compatible,reason=compatibility.Reason,
                    diagnosticStatus=compatibility.DiagnosticStatus,apiAssemblyName=compatibility.ApiAssemblyName,
                    apiModuleName=compatibility.ApiModuleName,apiMvid=compatibility.ApiMvid,
                    apiLocation=compatibility.ApiLocation,apiSha256=compatibility.ApiSha256,
                    apiFileVersion=compatibility.ApiFileVersion,distributionAuthenticationRequired=false,
                    actualBehaviourRequiresSubsequentCalls=true}),"journal-compatibility-failed");
                stage="waiting-source-metadata";
                long metadataDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*2;
                while(!stopping&&!stopRequested&&!module.MetadataReady&&Stopwatch.GetTimestamp()<metadataDeadline)
                {
                    module.TryInitializeMetadata();GameFiber.Sleep(1);
                }
                Need(!stopping&&!stopRequested&&module.MetadataReady,"source-metadata-not-observed");
                module.OpenSession(config.SessionId);
                composition=new TrustedShvComposition(module,HandoffBindingProofMode.ReadOnlySdkOrdinaryReuse);
                adapter=new ShvGameplayFrameAdapter(module.SessionId,module.Generation,config.Scope);
                Need(journal.WriteEvent("session",new{session=module.SessionId,generation=module.Generation,
                    producerSha256=config.Scope.ProducerSha256,bridgeSha256=Hash(caller.Location),
                    identityMode="read-only-sdk-ordinary-reuse",unobservedFullCounterWrapAddressReuseExcluded=true,
                    passiveOnly=
#if SHV_PLAYABLE_13
                    false,
#else
                    true,
#endif
                    audioHostStarted=false,recordingStarted=false,
                    sourceInstanceQpc=module.Description.SourceInstanceQpc,sourceFrequency=module.Description.Frequency,
                    hostFrequency=module.HostFrequency,rphRuntimeHash=compatibility.ApiSha256,
                    rphRuntimeVersion=compatibility.ApiFileVersion,rphRuntimeAssemblyName=compatibility.ApiAssemblyName,
                    runtimePolicy="functional-compatibility"}),"journal-start-failed");
                // The original gold menu and services remain unchanged, but
                // this temporary diagnostic profile starts none of them. Menu
                // workers can contact an existing SoundMap recorder endpoint.
                stage="measuring-clocks";
                long waitingDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*290;
                while(!stopping&&!stopRequested&&Stopwatch.GetTimestamp()<waitingDeadline)
                {
                    Need(journal.Healthy,"journal-worker-failed");
                    composition.ObserveClock();
                    Need(!composition.Retired,composition.Reason??"clock-retired");
                    LogClock(composition,journal,ref lastClockLogged);
                    if(composition.ClockReady)
                    {
                        if(stage!="ready-for-operator")
                        {
                            stage="ready-for-operator";
                            Game.Console.Print("RichAudio handoff READY: settle the player-driven, engine-running Bati. Run RichAudioHandoffStart once, then close the console. No audio test.");
                        }
                        if(startRequested)break;
                    }
                    GameFiber.Sleep(1);
                }
                Need(!stopping&&!stopRequested&&startRequested&&composition.ClockReady,"operator-start-not-acquired");
                stage="independent-binding";
#if SHV_HANDOFF_14
                HandoffPeerObservation pre,post;ShvAbi.ContextReply waiting;
                Need(AcquireFreshInitialBinding(module,composition,journal,waitingDeadline,ref lastClockLogged,ref sampler,out pre,out waiting,out post,out reason),reason);
#else
                Need(RphHandoffSampler.TryAcquire(out sampler,out reason),reason);
                string peerReason;
                var pre=sampler.Capture(out peerReason);
                ShvAbi.ContextReply waiting;
                Need(module.TryPeek(out waiting)==ShvAbi.Code.Ok,"source-waiting-context-unavailable");
                var post=sampler.Capture(out peerReason);
                Need(composition.TryBind(pre,waiting,post),composition.Reason??"independent-binding-rejected");
#endif
                Need(journal.WriteEvent("binding",new{hostBefore=pre.Context.StartTicks,hostAfter=post.Context.EndTicks,
                    sourceBefore=waiting.Context.StartQpc,sourceAfter=waiting.Context.EndQpc,
                    vehicleAddress=pre.VehicleAddress,pedAddress=pre.PedAddress,
                    rphVehiclePoolIndex=pre.VehiclePoolIndex,rphVehiclePoolCounter=pre.VehiclePoolCounter,
                    rphPedPoolIndex=pre.PedPoolIndex,rphPedPoolCounter=pre.PedPoolCounter,
                    crossFrameworkHandleIntegersCompared=false}),"journal-binding-failed");
                Need(journal.Healthy,"prebind-journal-worker-failed");
                Need(composition.Begin(),composition.Reason??"begin-rejected");began=true;stage="active";
                Game.Console.Print("RichAudio passive handoff ACTIVE (120 seconds maximum). Manually idle/rev/drive gently, then exit the Bati when requested. RichAudioHandoffStop retires permanently.");
                long activeDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*120;
                while(!stopping&&!stopRequested&&Stopwatch.GetTimestamp()<activeDeadline&&!composition.Retired)
                {
                    Need(journal.Healthy,"journal-worker-failed");
                    composition.ObserveClock();LogClock(composition,journal,ref lastClockLogged);
                    if(composition.Retired)break;
                    // Drain a bounded small batch per game-fiber turn: one
                    // target publishes a return plus final-context row. Do not
                    // introduce an artificial frame of latency between them.
                    for(int batch=0;batch<4&&!composition.Retired;batch++)
                    {
#if SHV_HANDOFF_14
                        string peerReason;
#endif
                        composition.Poll(delegate{return sampler.Capture(out peerReason);});
                        Need(DrainAudit(composition,journal),"source-evidence-budget-or-queue");
#if SHV_HANDOFF_15
                        // Preserve the concrete driver/lifetime retirement cause
                        // before a camera transition can obscure it.
                        Need(!sampler.Retired,sampler.RetirementReason);
#endif
                        if(composition.AcceptedCount!=accepted)
                        {
                            H.Candidate current;HandoffPeerObservation peer;
                            Need(composition.TryGetCurrent(out current,out peer),"accepted-observation-expired-before-use");
                            GameplayFrame frame;ShvGameplayFrameAdapter.Lineage lineage;string adaptationReason;
#if SHV_HANDOFF_15
                            bool publishListener;
                            var listener=Listener(module.SessionId,sampler,current,peer,journal,out publishListener);
                            Need(adapter.TryCreate(current,peer,listener,out frame,out lineage,out adaptationReason),adaptationReason);
                            // The adapter consumes the original source sequence
                            // under every original identity/clock/expiry gate.
                            // No rejected camera frame reaches the wire or audio.
                            accepted=composition.AcceptedCount;
                            if(!publishListener)continue;
#if SHV_PLAYABLE_13
                            // Rider-local airflow requires an observed vehicle camera.
                            // Unknown camera mode withholds it; exterior flow remains spatial.
                            bool vehicleView=false;
                            try{vehicleView=Rage.Native.NativeFunction.CallByName<bool>("IS_GAMEPLAY_CAM_RENDERING")&&Rage.Native.NativeFunction.CallByName<bool>("IS_FOLLOW_VEHICLE_CAM_ACTIVE");}
                            catch(ThreadAbortException){throw;}catch{vehicleView=false;}
                            frame.Vehicles[0].RiderViewAttached=vehicleView;
#endif
#else
                            Need(adapter.TryCreate(current,peer,Listener(module.SessionId),out frame,out lineage,out adaptationReason),adaptationReason);
#endif
                            Need(journal.WriteFrame(frame,lineage),"gameplay-evidence-budget-or-queue");
#if SHV_PLAYABLE_13
                            Need(playback.PublishAccepted(frame,lineage.ValidThroughHostTicks),"audio-frame-gate:"+playback.State);
#endif
                            accepted=composition.AcceptedCount;frames++;
                        }
                        if(!composition.LastPollHadRecord)break;
                    }
                    GameFiber.Sleep(1);
                }
                reason=composition.Reason??(stopping?"plugin-stopped":stopRequested?"operator-stopped":"passive-active-deadline");
            }
            catch(ThreadAbortException){reason="plugin-fiber-aborted";throw;}
            catch(Exception error)
            {
                reason=error is InvalidDataException?error.Message:"passive-handoff-failed:"+error.GetType().Name;
                Game.Console.Print("RichAudio passive handoff stopped: "+reason+". Stock fallback retained; no retry.");
            }
            finally
            {
                stage="retiring";
#if SHV_PLAYABLE_13
                if(playback!=null)playback.Retire(reason??"provider-retired");
#endif
                try
                {
                    // Retire the consumer before any source-control/drain operation.
                    if(composition!=null)composition.Retire(reason??"passive-stopped");
                    if(adapter!=null)adapter.Retire(reason??"passive-stopped");
                    if(sampler!=null)sampler.Retire();
                    if(journal!=null)
                    {
                        // Consumer state, not a fabricated new camera/frame. Cleanup
                        // makes no further RPH or camera getter calls before Stop.
                        journal.WriteEvent("source-cleared",new{vehicles=0,freshListenerAvailable=false});
                    }
                    // The exports below contain no game native calls. Their bounded
                    // drain still cannot promise recovery from arbitrary OS faults.
                    if(module!=null)
                    {
                        try
                        {
                            try{module.Stop();}
                            finally
                            {
                                // A raw row popped before a peer-fiber abort is
                                // queued in the composition. Admit it before
                                // draining later native FIFO rows. The ordinal
                                // makes admission/ack retry idempotent.
                                if(!DrainAudit(composition,journal)){rawAuditAdmissionFailed=true;reason="consumed-source-audit-not-fully-admitted";}
                            }
                            long end=Stopwatch.GetTimestamp()+Stopwatch.Frequency/2;
                            while(Stopwatch.GetTimestamp()<end)
                            {
                                ShvAbi.ReadReply reply;var code=module.ReadNext(out reply);
                                if(code==ShvAbi.Code.Ok&&(journal==null||!journal.WriteSource(reply.Record)))rawAuditAdmissionFailed=true;
                                completed=module.ReadSourceCompletion();
                                var status=module.ReadSourceStatus();sourceRetired=status.State==ShvAbi.State.Retired;
                                lastObservedQueued=status.Queued;
                                if(completed&&code==ShvAbi.Code.Empty&&lastObservedQueued==0){nativeFifoDrained=true;break;}
                                if(code!=ShvAbi.Code.Ok)GameFiber.Sleep(1);
                            }
                        }catch(ThreadAbortException){throw;}catch{completed=false;}
                    }
                    }
                finally
                {
                    // A drain abort/fault cannot bypass later cleanup attempts.
                    // No ResetAbort or forced OS/native cleanup is claimed.
                    try
                    {
                        if(journal!=null)
                        {
                            try
                            {
                                journal.WriteEvent("retirement",new{reason=reason,accepted=accepted,frames=frames,began=began,
                                    currentVehicles=0,producerCompleted=completed,sourceRetired=sourceRetired,
                                    pendingConsumedAuditRows=composition==null?0:composition.PendingAuditCount,
                                    nativeFifoDrained=nativeFifoDrained,lastObservedQueued=lastObservedQueued,
                                    rawAuditAdmissionFailed=rawAuditAdmissionFailed,
                                    auditOutcomeUnobserved=!nativeFifoDrained||rawAuditAdmissionFailed||!journal.Healthy
                                        ||(composition!=null&&composition.PendingAuditCount!=0),
                                    nativeOutcomeMayRemainUnobserved=!completed,audioHostStarted=
#if SHV_PLAYABLE_13
                                    playback!=null&&playback.Attempts>0
#else
                                    false
#endif
                                    });
                            }
                            finally
                            {
                                if(!journal.Complete(completed,sourceRetired,reason))
                                    reason=journal.CompletionObservedWithinBound?"evidence-writer-failed":"evidence-writer-completion-unobserved";
                            }
                        }
                    }
                    finally
                    {
                        try{if(composition!=null)composition.Dispose();}
                        finally
                        {
                            // Idempotent fallback runs even if composition
                            // disposal faults before releasing module resources.
                            try{if(module!=null)module.Dispose();}
                            finally
                            {
                                stage="retired";
#if SHV_PLAYABLE_13
                                if(playback!=null){
                                    playback.Stop();bool audioJoined=false;long audioEnd=Stopwatch.GetTimestamp()+Stopwatch.Frequency*8;
                                    while(!audioJoined&&Stopwatch.GetTimestamp()<audioEnd){audioJoined=playback.Join(0);if(!audioJoined)GameFiber.Sleep(10);}
                                    Game.Console.Print("RichAudio Bati audio shutdown joined="+audioJoined+" state="+playback.State+"; native stock audio retained.");
                                }
#endif
                                bool joined=journal!=null&&journal.CompletionObservedWithinBound;
                                bool writerAlive=journal!=null&&journal.WorkerAlive;
                                Game.Console.Print("RichAudio passive handoff RETIRED: accepted="+accepted+", frames="+frames+", reason="+reason
                                    +", producerCompleted="+completed+", writerCompletionObservedWithinBound="+joined+", writerWorkerAlive="+writerAlive
                                    +", nativeFifoDrained="+nativeFifoDrained+", lastObservedQueued="+lastObservedQueued
                                    +". Do not restart; GTA stock audio retained.");
                            }
                        }
                    }
                }
            }
        }
#if SHV_HANDOFF_14
        static bool RetainPrebind(ShvHandoffJournal journal,int attempt,string phase,ShvPrebindDiagnostic diagnostic)
        {
            return journal.Healthy&&journal.WriteEvent("prebind-readiness",new{attempt=attempt,phase=phase,diagnostic=diagnostic,
                maximumWaitMilliseconds=TrustedShvComposition.PrebindMaximumWaitMilliseconds,
                maximumAttempts=TrustedShvComposition.PrebindMaximumAttempts,
                retention="bounded asynchronous queue admission; writer completion separately observed"})&&journal.Healthy;
        }
        static ShvAbi.Code ReadPrebindContext(ShvProducerModule module,TrustedShvComposition composition,ShvHandoffJournal journal,
            int attempt,ulong baselineSequence,long baselineEnd,long armed,out ShvAbi.ContextReply value,
            ref bool previousKnown,ref ShvAbi.ContextReply previous)
        {
            ShvAbi.Code code=ShvAbi.Code.Unavailable;bool returned=false;value=new ShvAbi.ContextReply();
            try{
                module.TryPeek(out value,out code,out returned);
                if(previousKnown&&code==ShvAbi.Code.Empty)throw new InvalidDataException("waiting-context-sequence-regressed");
                if(code==ShvAbi.Code.Ok&&previousKnown){
                    Need(value.ContextSequence>=previous.ContextSequence,"waiting-context-sequence-regressed");
                    if(value.ContextSequence==previous.ContextSequence)Need(value.Context.Equals(previous.Context),"waiting-context-sequence-content-changed");
                    else Need(value.Context.StartQpc>previous.Context.EndQpc&&value.Context.EndQpc>previous.Context.EndQpc,"waiting-context-timestamp-regressed");
                }
                if(code==ShvAbi.Code.Ok){previous=value;previousKnown=true;}return code;
            }catch(ThreadAbortException){throw;}
            catch(Exception error){
                var diagnostic=composition.InspectInitialBinding(code,value,null,null,baselineSequence,baselineEnd,armed);
                diagnostic.PeekApiReturned=returned;diagnostic.PeekValidationError=error is InvalidDataException?error.Message:error.GetType().Name;
                diagnostic.Outcome="terminal";diagnostic.CanBind=false;diagnostic.SafeToWait=false;diagnostic.Reason="waiting-context-validation-failed:"+diagnostic.PeekValidationError;
                Need(RetainPrebind(journal,attempt,"peek-rejected",diagnostic),"prebind-diagnostic-write-failed");
                composition.Retire(diagnostic.Reason);throw new InvalidDataException(diagnostic.Reason);
            }
        }
        static bool AcquireFreshInitialBinding(ShvProducerModule module,TrustedShvComposition composition,ShvHandoffJournal journal,
            long originalWaitingDeadline,ref long lastClockLogged,ref RphHandoffSampler sampler,
            out HandoffPeerObservation pre,out ShvAbi.ContextReply waiting,out HandoffPeerObservation post,out string why)
        {
            pre=post=null;waiting=new ShvAbi.ContextReply();why="waiting-context-not-refreshing";
            long armed=Stopwatch.GetTimestamp(),deadline=Math.Min(originalWaitingDeadline,armed+Stopwatch.Frequency*TrustedShvComposition.PrebindMaximumWaitMilliseconds/1000);
            ulong baselineSequence=0;long baselineEnd=0;bool baselineKnown=false,previousKnown=false;ShvAbi.ContextReply previous=new ShvAbi.ContextReply();
            Game.Console.Print("RichAudio Start armed. Close the RPH console now; waiting up to10 seconds for NEW SHV context and independent RPH brackets.");
            for(int attempt=1;attempt<=TrustedShvComposition.PrebindMaximumAttempts&&Stopwatch.GetTimestamp()<deadline;attempt++){
                if(stopping||stopRequested){why="operator-stopped-before-binding";return false;}
                Need(journal.Healthy,"prebind-journal-worker-failed");composition.ObserveClock();
                Need(!composition.Retired,composition.Reason??"prebind-clock-retired");LogClock(composition,journal,ref lastClockLogged);
                if(!baselineKnown){
                    var baseCode=ReadPrebindContext(module,composition,journal,attempt,0,0,armed,out waiting,ref previousKnown,ref previous);
                    if(baseCode==ShvAbi.Code.Ok||baseCode==ShvAbi.Code.Empty){baselineSequence=waiting.ContextSequence;baselineEnd=baseCode==ShvAbi.Code.Ok?waiting.Context.EndQpc:0;baselineKnown=true;}
                    var initial=composition.InspectInitialBinding(baseCode,waiting,null,null,baselineSequence,baselineEnd,armed);initial.PeekApiReturned=true;
                    Need(RetainPrebind(journal,attempt,"arm-baseline",initial),"prebind-diagnostic-write-failed");
                    if(!initial.SafeToWait&&!initial.CanBind){composition.Retire(initial.Reason);why=initial.Reason;return false;}
                }
                bool consoleOpen=Game.Console.IsOpen,paused=Game.IsPaused;
                if(consoleOpen||paused||!baselineKnown){
                    Need(journal.WriteEvent("prebind-ui-wait",new{attempt=attempt,consoleOpen=consoleOpen,paused=paused,baselineKnown=baselineKnown,
                        armedHostQpc=armed,observedHostQpc=Stopwatch.GetTimestamp(),reason=consoleOpen?"close-rph-console":paused?"game-paused":"waiting-context-baseline-unavailable"}),"prebind-diagnostic-write-failed");
                    GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);continue;
                }
                if(stopping||stopRequested){why="operator-stopped-before-binding";return false;}
                var previewCode=ReadPrebindContext(module,composition,journal,attempt,baselineSequence,baselineEnd,armed,out waiting,ref previousKnown,ref previous);
                var preview=composition.InspectInitialBinding(previewCode,waiting,null,null,baselineSequence,baselineEnd,armed);preview.PeekApiReturned=true;
                Need(RetainPrebind(journal,attempt,"source-readiness",preview),"prebind-diagnostic-write-failed");
                if(!preview.SafeToWait&&!preview.CanBind){composition.Retire(preview.Reason);why=preview.Reason;return false;}
                if(!preview.SourceReady){GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);continue;}
                if(sampler==null){
                    string acquireReason;
                    if(!RphHandoffSampler.TryAcquire(out sampler,out acquireReason)){
                        if(Game.Console.IsOpen||Game.IsPaused){GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);continue;}
                        preview.Outcome="terminal";preview.SafeToWait=false;preview.CanBind=false;preview.Reason="vehicle-correspondence-failure:"+acquireReason;
                        preview.PeerCaptureReason=acquireReason;Need(RetainPrebind(journal,attempt,"rph-acquisition-rejected",preview),"prebind-diagnostic-write-failed");
                        composition.Retire(preview.Reason);why=preview.Reason;return false;
                    }
                }
                string peerReason;pre=sampler.Capture(out peerReason);
                if(pre==null){preview.Outcome="terminal";preview.SafeToWait=false;preview.CanBind=false;preview.PeerCaptureReason=peerReason;preview.Reason="vehicle-correspondence-failure:"+peerReason;
                    Need(RetainPrebind(journal,attempt,"rph-pre-rejected",preview),"prebind-diagnostic-write-failed");composition.Retire(preview.Reason);why=preview.Reason;return false;}
                ulong beforeSequence=waiting.ContextSequence;long beforeEnd=waiting.Context.EndQpc;
                long bracketDeadline=Math.Min(deadline,pre.Context.StartTicks+Stopwatch.Frequency*TrustedShvComposition.PrebindBracketWaitMilliseconds/1000);
                ShvAbi.Code code=previewCode;bool uiReopened=false;
                for(int read=0;read<TrustedShvComposition.PrebindMaximumBracketReads&&Stopwatch.GetTimestamp()<bracketDeadline;read++){
                    GameFiber.Sleep(1);
                    if(stopping||stopRequested)break;
                    if(Game.Console.IsOpen||Game.IsPaused){uiReopened=true;break;}
                    code=ReadPrebindContext(module,composition,journal,attempt,baselineSequence,baselineEnd,armed,out waiting,ref previousKnown,ref previous);
                    if(code==ShvAbi.Code.Ok&&waiting.ContextSequence>beforeSequence&&waiting.Context.StartQpc>beforeEnd)break;
                }
                if(stopping||stopRequested){why="operator-stopped-before-binding";return false;}
                if(uiReopened){Need(journal.WriteEvent("prebind-ui-wait",new{attempt=attempt,reason="console-or-pause-reopened-before-post",preHostStart=pre.Context.StartTicks}),"prebind-diagnostic-write-failed");GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);continue;}
                post=sampler.Capture(out peerReason);
                var diagnostic=composition.InspectInitialBinding(code,waiting,pre,post,baselineSequence,baselineEnd,armed);diagnostic.PeekApiReturned=true;
                if(post==null){diagnostic.Outcome="terminal";diagnostic.SafeToWait=false;diagnostic.CanBind=false;diagnostic.PeerCaptureReason=peerReason;diagnostic.Reason="vehicle-correspondence-failure:"+peerReason;}
                if(!diagnostic.CanBind){
                    Need(RetainPrebind(journal,attempt,"bracket-readiness",diagnostic),"prebind-diagnostic-write-failed");
                    if(!diagnostic.SafeToWait){composition.Retire(diagnostic.Reason);why=diagnostic.Reason;return false;}
                    GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);continue;
                }
                if(stopping||stopRequested){why="operator-stopped-before-binding";break;}
                if(Stopwatch.GetTimestamp()>=deadline)break;
                ShvPrebindDiagnostic commit;
                if(composition.TryInitialBind(pre,waiting,post,baselineSequence,baselineEnd,armed,
                    delegate(ShvPrebindDiagnostic value){
                        value.PeekApiReturned=true;bool retained=RetainPrebind(journal,attempt,"before-terminal-binding",value);
                        if(retained&&(stopping||stopRequested||Stopwatch.GetTimestamp()>=deadline))
                            composition.Retire(stopping||stopRequested?"operator-stopped-before-binding":"waiting-context-not-refreshing");
                        return retained;
                    },out commit)){
                    Need(journal.Healthy,"prebind-journal-worker-failed");why="fresh-context-bound";return true;
                }
                if(composition.Retired){why=composition.Reason??commit.Reason;return false;}
                GameFiber.Sleep(TrustedShvComposition.PrebindPollMilliseconds);
            }
            if(stopping||stopRequested)why="operator-stopped-before-binding";
            Need(journal.WriteEvent("prebind-window-ended",new{reason=why,armedHostQpc=armed,endedHostQpc=Stopwatch.GetTimestamp(),
                maximumMilliseconds=TrustedShvComposition.PrebindMaximumWaitMilliseconds,maximumAttempts=TrustedShvComposition.PrebindMaximumAttempts}),"prebind-diagnostic-write-failed");
            composition.Retire(why);return false;
        }
#endif
        static void Need(bool value,string why){if(!value)throw new InvalidDataException(why??"passive-gate-rejected");}
        static bool DrainAudit(TrustedShvComposition composition,ShvHandoffJournal journal)
        {
            if(composition==null)return true;
            if(journal==null)return composition.PendingAuditCount==0;
            ShvConsumedAuditRow row;int count=0;
            while(composition.TryPeekAudit(out row))
            {
                if(++count>128||!journal.WriteSourceAudit(row.Ordinal,row.Reply.Record)
                    ||!composition.AcknowledgeAudit(row.Ordinal))return false;
            }
            return true;
        }
        static string Hash(string path)
        {using(var file=File.OpenRead(path))using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(file)).Replace("-","").ToLowerInvariant();}
        static void LogClock(TrustedShvComposition composition,ShvHandoffJournal journal,ref long last)
        {
            var map=composition.MeasuredClockMap;if(map==null||map.SourceAnchor==last)return;last=map.SourceAnchor;
            Need(journal.WriteEvent("clock-map",new{sourceFrequency=map.SourceFrequency,hostFrequency=map.HostFrequency,
                sourceAnchor=map.SourceAnchor,hostBefore=map.HostBefore,hostAfter=map.HostAfter,expires=map.Expires,
                driftPpm=map.DriftPpm,minimumMeasuredRatePpm=map.MinimumMeasuredRatePpm,
                maximumMeasuredRatePpm=map.MaximumMeasuredRatePpm,anchors=map.AnchorsUsed}),"clock-evidence-budget-or-queue");
        }
#if SHV_HANDOFF_15
        static object Number(double? value)
        {return !value.HasValue?null:Protocol.Finite(value.Value)?(object)value.Value:value.Value.ToString("R",System.Globalization.CultureInfo.InvariantCulture);}
        static object[] Numbers(double[] values)
        {if(values==null)return null;var result=new object[values.Length];for(int i=0;i<values.Length;i++)result[i]=Number(values[i]);return result;}
        static object CameraOperands(CameraObservation value)
        {return value==null?null:new{before=value.Before,after=value.After,observed=value.Observed,unixMs=value.UnixMs,
            gameTime=value.GameTime,paused=value.Paused,position=Numbers(value.Position),forward=Numbers(value.Forward),up=Numbers(value.Up)};}
        static object PeerOperands(HandoffPeerObservation value)
        {return value==null?null:new{start=value.Context.StartTicks,end=value.Context.EndTicks,player=value.Context.PlayerId,
            ped=value.Context.PedId,vehicle=value.Context.VehicleId,currentVehicle=value.Context.CurrentVehicleId,driver=value.Context.DriverId,
            generation=value.Context.Generation,model=value.Context.Model,eligible=value.Context.Eligible,running=value.Context.Running,
            vehicleAddress=value.VehicleAddress,pedAddress=value.PedAddress,
            vehiclePoolIndex=value.VehiclePoolIndex,vehiclePoolCounter=value.VehiclePoolCounter,vehiclePoolValue=value.VehiclePoolValue,
            pedPoolIndex=value.PedPoolIndex,pedPoolCounter=value.PedPoolCounter,pedPoolValue=value.PedPoolValue};}
        static ListenerState Listener(string session,RphHandoffSampler sampler,H.Candidate source,HandoffPeerObservation sourcePeer,
            ShvHandoffJournal journal,out bool publish)
        {
            publish=false;string why;
            var before=sampler.Capture(out why);
            Need(before!=null,why??"listener-pre-camera-driver-qualification-failed");
            var camera=CameraSampler.Read();
            var after=sampler.Capture(out why);
            if(after==null){
                Need(journal.WriteEvent("listener-ownership-retired",new{classification=why,sourceSequence=source.SourceSequence,
                    sourceGeneration=source.SourceGeneration,rawBits=source.RawBits,operatingPoint=source.OperatingPoint,
                    sourcePeer=PeerOperands(sourcePeer),beforeCamera=PeerOperands(before),camera=CameraOperands(camera),afterCamera=PeerOperands(after)}),
                    "listener-diagnostic-write-failed");
                Need(false,why??"listener-post-camera-driver-qualification-failed");
            }
            var decision=listenerTracker.Observe(session,camera);
            if(!decision.Publish&&decision.Classification!="listener-cached-observation"){
                // Original measured operands are captured by Observe once. This
                // journal write precedes throwing or discarding, and failure is
                // terminal rather than an invisible loss of the diagnosis.
                Need(journal.WriteEvent("listener-rejection",new{schema=1,classification=decision.Classification,terminal=decision.Terminal,
                    previous=CameraOperands(decision.Previous),current=CameraOperands(decision.Current),
                    dt=Number(decision.Dt),delta=Numbers(decision.Delta),velocity=Numbers(decision.Velocity),speedSquared=Number(decision.SpeedSquared),
                    listenerSequence=decision.Sequence,listenerGeneration=decision.Generation,sourceSequence=source.SourceSequence,
                    sourceGeneration=source.SourceGeneration,sourceBefore=source.SourceBeforeTicks,sourceAfter=source.SourceAfterTicks,
                    mappedLow=source.MinimumHostTicks,mappedHigh=source.MaximumHostTicks,validThrough=source.ValidThroughHostTicks,
                    rawBits=source.RawBits,operatingPoint=source.OperatingPoint,sourcePeer=PeerOperands(sourcePeer),
                    beforeCamera=PeerOperands(before),afterCamera=PeerOperands(after),
                    callOrder="source-peer-then-pre-camera-peer-then-camera-read-then-post-camera-peer-then-policy",
                    originalCameraAcquisitionBeforePrePeer=camera!=null&&camera.Before<before.Context.StartTicks,
                    unpublishedBaseline=!decision.Terminal,velocityAcrossCutPublished=false}),"listener-diagnostic-write-failed");
                Need(!decision.Terminal,decision.Classification);
            }
            publish=decision.Publish;return decision.Listener;
        }
#else
        static ListenerState Listener(string session)
        {
            var camera=CameraSampler.Read();double[] velocity={0,0,0};
            if(previous!=null)
            {
                double dt=(camera.Observed-previous.Observed)/(double)Stopwatch.Frequency;
                if(dt>0&&dt<=.25)
                {
                    double sum=0;for(int i=0;i<3;i++){velocity[i]=(camera.Position[i]-previous.Position[i])/dt;sum+=velocity[i]*velocity[i];}
                    if(sum>10000)throw new InvalidDataException("listener-discontinuous");
                }
                else if(dt!=0)throw new InvalidDataException("listener-time-discontinuous");
                if(camera.GameTime<previous.GameTime||camera.Paused!=previous.Paused)listenerGeneration++;
            }
            previous=camera;
            return new ListenerState{Version=1,Session=session,Generation=listenerGeneration,Sequence=listenerSequence++,
                ObservationTicks=camera.Observed,ClockFrequency=Stopwatch.Frequency,GameTimeMs=camera.GameTime,
                Position=camera.Position,Velocity=velocity,Forward=camera.Forward,Up=camera.Up,ListenerKind="camera",
                VelocityKind="estimated-camera-difference",Paused=camera.Paused,Valid=!camera.Paused,
                Reason=camera.Paused?"paused":"valid",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};
        }
#endif
        internal static void Stop(){stopping=true;stopRequested=true;
#if SHV_PLAYABLE_13
            if(playback!=null)playback.Stop();
#endif
        }
        internal static void PrintStatus()
        {Game.Console.Print("RichAudio handoff: "+stage+"; accepted="+accepted+"; frames="+frames+"; reason="+reason+
#if SHV_PLAYABLE_13
            "; playback="+(playback==null?"not-ready":playback.State)
#else
            "; audio host disabled."
#endif
            );}
        [ConsoleCommand(Name="RichAudioHandoffStart",Description="Arm the single approved SHV/RPH handoff. Playback requires its own approved profile and AudioOn.")]
        public static void RequestStart(){if(!ran||stopping||stage!="ready-for-operator"||startRequested)return;startRequested=true;}
        [ConsoleCommand(Name="RichAudioHandoffStop",Description="Permanently retire this passive handoff session; no restart.")]
        public static void RequestStop(){stopRequested=true;}
#if SHV_PLAYABLE_13
        [ConsoleCommand(Name="RichAudioBatiAudioOn",Description="Explicitly enable this approved Bati additive audio session; fresh accepted telemetry required.")]
        public static void AudioOn(){var value=playback;if(value!=null&&!stopping)Game.Console.Print("RichAudio Bati audio enable="+value.Enable()+" state="+value.State);}
        [ConsoleCommand(Name="RichAudioBatiAudioOff",Description="Disable additive Bati audio; preserve stock audio and the still-valid provider.")]
        public static void AudioOff(){var value=playback;if(value!=null)value.Disable();}
        [ConsoleCommand(Name="RichAudioBatiAudioStatus",Description="Report this scoped Bati playback state without activating output or recording.")]
        public static void AudioStatus(){var value=playback;Game.Console.Print("RichAudio Bati audio "+(value==null?"not-ready":value.State+" host="+value.HostPid+" starts="+value.Attempts));}
#endif
    }
}
#endif
