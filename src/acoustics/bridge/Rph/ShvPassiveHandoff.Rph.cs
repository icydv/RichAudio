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
        static CameraObservation previous;
        static long listenerSequence,listenerGeneration=1;
        static bool ran;
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
                Game.Console.Print("RichAudio PLAYABLE-12 passive handoff only; GTA stock audio retained. No audio host or recording.");
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
                    passiveOnly=true,audioHostStarted=false,recordingStarted=false,
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
                Need(RphHandoffSampler.TryAcquire(out sampler,out reason),reason);
                string peerReason;
                var pre=sampler.Capture(out peerReason);
                ShvAbi.ContextReply waiting;
                Need(module.TryPeek(out waiting)==ShvAbi.Code.Ok,"source-waiting-context-unavailable");
                var post=sampler.Capture(out peerReason);
                Need(composition.TryBind(pre,waiting,post),composition.Reason??"independent-binding-rejected");
                Need(journal.WriteEvent("binding",new{hostBefore=pre.Context.StartTicks,hostAfter=post.Context.EndTicks,
                    sourceBefore=waiting.Context.StartQpc,sourceAfter=waiting.Context.EndQpc,
                    vehicleAddress=pre.VehicleAddress,pedAddress=pre.PedAddress,
                    rphVehiclePoolIndex=pre.VehiclePoolIndex,rphVehiclePoolCounter=pre.VehiclePoolCounter,
                    rphPedPoolIndex=pre.PedPoolIndex,rphPedPoolCounter=pre.PedPoolCounter,
                    crossFrameworkHandleIntegersCompared=false}),"journal-binding-failed");
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
                        composition.Poll(delegate{return sampler.Capture(out peerReason);});
                        Need(DrainAudit(composition,journal),"source-evidence-budget-or-queue");
                        if(composition.AcceptedCount!=accepted)
                        {
                            H.Candidate current;HandoffPeerObservation peer;
                            Need(composition.TryGetCurrent(out current,out peer),"accepted-observation-expired-before-use");
                            GameplayFrame frame;ShvGameplayFrameAdapter.Lineage lineage;string adaptationReason;
                            Need(adapter.TryCreate(current,peer,Listener(module.SessionId),out frame,out lineage,out adaptationReason),adaptationReason);
                            Need(journal.WriteFrame(frame,lineage),"gameplay-evidence-budget-or-queue");
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
                                    nativeOutcomeMayRemainUnobserved=!completed,audioHostStarted=false});
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
        internal static void Stop(){stopping=true;stopRequested=true;}
        internal static void PrintStatus()
        {Game.Console.Print("RichAudio passive handoff: "+stage+"; accepted="+accepted+"; frames="+frames+"; reason="+reason+"; audio host disabled.");}
        [ConsoleCommand(Name="RichAudioHandoffStart",Description="Arm the single reviewed passive SHV/RPH handoff. No audio; no retry.")]
        public static void RequestStart(){if(!ran||stopping||stage!="ready-for-operator"||startRequested)return;startRequested=true;}
        [ConsoleCommand(Name="RichAudioHandoffStop",Description="Permanently retire this passive handoff session; no restart.")]
        public static void RequestStop(){stopRequested=true;}
    }
}
#endif
