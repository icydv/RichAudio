// Focused PLAYABLE-14 extension of the existing actual-component fixture host.
// The proprietary SDK is not loaded. RPH peers below are explicitly authored;
// the exact unchanged native producer executes against the fake SHV imports.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

internal static partial class ShvHandoffFixtureHost
{
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void PauseWaiting14Fn(int pause);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int WaitingPaused14Fn();
    static readonly List<object> bindingDiagnostics14=new List<object>();
    static string bindingOutput14;
    static int bindingDiagnosticWrites14;
    static int foregroundChecks14;
    static string foregroundViolationStage14;
    static long foregroundViolationTicks14;
    static void RequireForeground14(string stage)
    {
        foregroundChecks14++;
        if(Foreground())return;
        foregroundViolationStage14=stage;foregroundViolationTicks14=Stopwatch.GetTimestamp();
        throw new InvalidOperationException("fixture-foreground-lost:"+stage);
    }
    static bool BeginProbe14(ref int probes,ref int admitted)
    {probes++;bool value=composition.Begin();if(value)admitted++;return value;}
    static HandoffPeerObservation Peer14(bool wrong=false,long offset=0)
    {
        long start=Stopwatch.GetTimestamp()-offset;
        var context=new H.HostContext("rph-player","rph-ped-A","rph-vehicle-A","rph-vehicle-A","rph-ped-A",1,H.BatiModel,true,true,start,Stopwatch.GetTimestamp()-offset);
        return HandoffPeerObservation.ForPipelineFixture(owner,context,wrong?0xDEAD1000UL:0x20012000UL,0x10011000UL,17,(71u<<8)|17u);
    }
    static void ClockWait14(int milliseconds,bool observe)
    {var time=Stopwatch.StartNew();while(time.ElapsedMilliseconds<milliseconds){Pump();RequireForeground14("clock-wait");if(observe)composition.ObserveClock();Thread.Sleep(2);}}
    static ShvAbi.ContextReply Peek14(ShvProducerModule module)
    {
        ShvAbi.ContextReply reply;var budget=Stopwatch.StartNew();ShvAbi.Code code;
        do{code=module.TryPeek(out reply);if(code==ShvAbi.Code.Ok)break;Pump();Thread.Sleep(1);}while(budget.ElapsedMilliseconds<100);
        Check(code==ShvAbi.Code.Ok,"actual waiting context available after bounded safe Empty/Busy reads");return reply;
    }
    static void Calibrate14()
    {var budget=Stopwatch.StartNew();while(!composition.ClockReady&&budget.ElapsedMilliseconds<4000){Pump();composition.ObserveClock();Thread.Sleep(2);}Check(composition.ClockReady&&!composition.Retired,"measured actual Clock export map ready");}
    static ShvAbi.ContextReply Pause14(ShvProducerModule module,PauseWaiting14Fn pause,WaitingPaused14Fn paused)
    {
        RequireForeground14("before-pause");pause(1);var budget=Stopwatch.StartNew();while(paused()==0&&budget.ElapsedMilliseconds<1000){Pump();RequireForeground14("entering-pause");Thread.Sleep(1);}
        Check(paused()!=0,"registered script actually paused inside fake WAIT");return Peek14(module);
    }
    static bool Retain14(object diagnostic,bool accepted)
    {
        bindingDiagnosticWrites14++;if(!accepted)return false;
        string row=new JavaScriptSerializer().Serialize(diagnostic);Check(row.Length<=32768,"bounded actual prebinding diagnostic");
        if(bindingDiagnostics14.Count>=402)throw new InvalidDataException("fixture diagnostic bound");bindingDiagnostics14.Add(diagnostic);
        File.AppendAllText(Path.Combine(bindingOutput14,"prebinding.ndjson"),row+"\n");return true;
    }
    static int RunWaitingBinding14(string[] args)
    {
        IntPtr window=IntPtr.Zero;ShvProducerModule module=null;ReleaseFn release=null;JoinFn join=null;PauseWaiting14Fn pause=null;MetricsFn getMetrics=null;
        var facts=new Dictionary<string,object>();bool callback=false,passed=false;int frames=0,bindAttempts=0,beginProbes=0,beginAdmissions=0,directBindProbes=0;
        try
        {
            Check(args.Length==4,"focused binding case/hash/hash/output arguments");caseName=args[0];bindingOutput14=Path.GetFullPath(args[3]);
            string binary=Assembly.GetExecutingAssembly().Location,root=Path.GetDirectoryName(binary),fake=Path.Combine(root,"ScriptHookV.dll"),producer=Path.Combine(root,"RichAudio.OperatingState.ShvHandoff.asi");
            Check(Hash(fake)==args[1]&&Hash(producer)==args[2],"exact fake and unchanged producer inputs");
            foreach(ProcessModule loaded in Process.GetCurrentProcess().Modules)Check(!String.Equals(loaded.ModuleName,"ScriptHookV.dll",StringComparison.OrdinalIgnoreCase),"no actual/preloaded SHV");
            IntPtr fakeModule=LoadLibraryExW(fake,IntPtr.Zero,0x100|0x800);Check(fakeModule!=IntPtr.Zero,"explicit fake SHV loaded");
            var configure=Export<ConfigureFn>(fakeModule,"FixtureConfigure");var start=Export<StartFn>(fakeModule,"FixtureStartRegistered");
            release=Export<ReleaseFn>(fakeModule,"FixtureRelease");join=Export<JoinFn>(fakeModule,"FixtureJoin");getMetrics=Export<MetricsFn>(fakeModule,"FixtureGetMetrics");var raw=Export<RawFn>(fakeModule,"FixtureRaw");
            pause=Export<PauseWaiting14Fn>(fakeModule,"FixturePauseWaiting");var paused=Export<WaitingPaused14Fn>(fakeModule,"FixtureWaitingPaused");
            Check(configure("valid_changing")!=0,"unchanged existing changing-native fixture selected");window=Window(true);
            Check(LoadLibraryExW(producer,IntPtr.Zero,0x100|0x800)!=IntPtr.Zero,"exact unchanged production ASI loaded against fake imports");
            Check(start()!=0,"registered native producer callback started");callback=true;Thread.Sleep(20);
            string hostHash=Hash(binary);var scope=new H.Scope("0.0.0.0",hostHash,args[1],args[1],args[2],H.BatiModel,"functional-fixture",hostHash);
            module=ShvProducerModule.AttachLoaded(new ShvModuleReview(scope,binary,fake,fake,producer,Path.Combine(root,"no-rph-launcher.exe"),hostHash,true),Assembly.GetExecutingAssembly());
            var metadata=Stopwatch.StartNew();while(!module.MetadataReady&&metadata.ElapsedMilliseconds<1000){module.TryInitializeMetadata();Pump();Thread.Sleep(1);}Check(module.MetadataReady,"native metadata ready");module.OpenSession();
            composition=new TrustedShvComposition(module,HandoffBindingProofMode.ReadOnlySdkOrdinaryReuse);
            if(caseName!="binding14_map_unavailable")Calibrate14();
            var baseline=Peek14(module);long armed=Stopwatch.GetTimestamp();
            if(caseName=="binding14_legacy_frozen"||caseName=="binding14_resume")
            {
                var frozen=Pause14(module,pause,paused);var clockBefore=module.ReadSourceStatus();
                var elapsed=Stopwatch.StartNew();ClockWait14(6000,true);var still=Peek14(module);var clockAfter=module.ReadSourceStatus();
                Check(still.ContextSequence==frozen.ContextSequence&&still.Context.StartQpc==frozen.Context.StartQpc&&still.Context.EndQpc==frozen.Context.EndQpc,"original waiting context sequence/timestamps actually frozen");
                Check(clockAfter.CallQpc>clockBefore.CallQpc&&clockAfter.Frequency==clockBefore.Frequency,"independent real Clock export advances while callback WAIT is paused");
                Check(elapsed.ElapsedMilliseconds>5502,"actual pause exceeds full source mapping radius");
                var map=composition.MeasuredClockMap;Check(map!=null&&Stopwatch.GetTimestamp()<map.Expires,"current measured map remains nonexpired during failure repro");
                Check((decimal)(map.SourceAnchor-still.Context.EndQpc)*1000/map.SourceFrequency>5502,"actual old context outside current map radius");
                Metrics m;Check(getMetrics(out m,128)!=0&&m.TargetCalls==0,"waiting-only repro made zero native target calls");
                facts["frozenContextSequence"]=still.ContextSequence;facts["frozenSourceStart"]=still.Context.StartQpc;facts["frozenSourceEnd"]=still.Context.EndQpc;
                facts["pausedMilliseconds"]=elapsed.ElapsedMilliseconds;facts["clockBefore"]=clockBefore.CallQpc;facts["clockAfter"]=clockAfter.CallQpc;facts["mapAnchor"]=map.SourceAnchor;facts["mapExpires"]=map.Expires;
                baseline=still;armed=Stopwatch.GetTimestamp();
#if LEGACY_BINDING_13
                var pre=Peer14();var waiting=Peek14(module);var post=Peer14();directBindProbes++;
                Check(!composition.TryBind(pre,waiting,post)&&composition.Retired&&composition.Reason=="measured-clock-map-required","genuine frozen PLAYABLE13 initial-binding error reproduced with a valid map");
                Check(!BeginProbe14(ref beginProbes,ref beginAdmissions),"legacy terminal failure prevents BEGIN");pause(0);ClockWait14(80,true);directBindProbes++;
                Check(!composition.TryBind(Peer14(),Peek14(module),Peer14())&&!BeginProbe14(ref beginProbes,ref beginAdmissions),"legacy retirement cannot be repaired by a later context");
                facts["legacyError"]=composition.Reason;
#else
                Check(caseName=="binding14_resume","legacy case uses separately compiled frozen13 core");
#endif
            }
#if !LEGACY_BINDING_13
            if(caseName=="binding14_never")baseline=Pause14(module,pause,paused);
            if(caseName=="binding14_map_expired"){ClockWait14(5100,false);Check(composition.MeasuredClockMap.Expires<Stopwatch.GetTimestamp(),"actual measured map expired without refresh");}
            if(caseName=="binding14_source_stale")
            {
                var wait=Stopwatch.StartNew();ShvAbi.ContextReply advanced=baseline;
                while(advanced.ContextSequence<=baseline.ContextSequence&&wait.ElapsedMilliseconds<500){Thread.Sleep(5);advanced=Peek14(module);}
                Check(advanced.ContextSequence>baseline.ContextSequence,"actual context advances after operator arm before stale-age control");Pause14(module,pause,paused);ClockWait14(350,true);
            }
            bool positive=caseName=="binding14_normal"||caseName=="binding14_resume";
            bool terminalExpected=caseName=="binding14_wrong_identity"||caseName=="binding14_journal_failure";
            var readiness=Stopwatch.StartNew();int attempts=0;bool bound=false;object lastDiagnostic=null;bool sawWaiting=false;
            while(!composition.Retired&&!bound&&readiness.ElapsedMilliseconds<TrustedShvComposition.PrebindMaximumWaitMilliseconds&&attempts<TrustedShvComposition.PrebindMaximumAttempts)
            {
                attempts++;Pump();if(caseName!="binding14_map_expired"&&caseName!="binding14_map_unavailable")composition.ObserveClock();
                RequireForeground14("readiness-attempt");
                if(caseName=="binding14_resume"&&readiness.ElapsedMilliseconds>=150){RequireForeground14("before-resume");pause(0);}
                var waiting=Peek14(module);
                // Safe source-only inspection does not call the terminal binder.
                var sourceOnly=composition.InspectInitialBinding(ShvAbi.Code.Ok,waiting,null,null,baseline.ContextSequence,baseline.Context.EndQpc,armed);
                if(waiting.ContextSequence<=baseline.ContextSequence||waiting.Context.EndQpc<=baseline.Context.EndQpc)
                {
                    lastDiagnostic=sourceOnly;Retain14(sourceOnly,true);Check(!sourceOnly.CanBind&&!composition.Retired,"cached waiting context is nonterminal and cannot bind");sawWaiting=true;
                }
                else
                {
                    long offset=caseName=="binding14_peer_stale"?Stopwatch.Frequency*300/1000:0;
                    var pre=Peer14(caseName=="binding14_wrong_identity",offset);var attemptBaseline=waiting;
                    var inner=Stopwatch.StartNew();
                    for(int read=0;read<8&&inner.ElapsedMilliseconds<40;read++)
                    {Thread.Sleep(5);Pump();RequireForeground14("peer-source-bracket");waiting=Peek14(module);if(waiting.ContextSequence>attemptBaseline.ContextSequence&&waiting.Context.EndQpc>attemptBaseline.Context.EndQpc)break;}
                    if(caseName=="binding14_peer_skew")Thread.Sleep(85);
                    var post=Peer14(caseName=="binding14_wrong_identity",offset);
                    var diagnostic=composition.InspectInitialBinding(ShvAbi.Code.Ok,waiting,pre,post,baseline.ContextSequence,baseline.Context.EndQpc,armed);lastDiagnostic=diagnostic;
                    if(diagnostic.CanBind||diagnostic.Outcome=="terminal")
                    {
                        bindAttempts++;var retained=diagnostic;
                        bound=composition.TryInitialBind(pre,waiting,post,baseline.ContextSequence,baseline.Context.EndQpc,armed,d=>Retain14(d,caseName!="binding14_journal_failure"),out retained);lastDiagnostic=retained;
                        if(terminalExpected){Check(!bound&&composition.Retired,"real identity/diagnostic failure permanently retires before BEGIN");break;}
                    }
                    else {Retain14(diagnostic,true);sawWaiting=true;}
                }
                if(!positive&&caseName!="binding14_never"&&!terminalExpected&&lastDiagnostic!=null)
                {
                    var observed=lastDiagnostic as ShvPrebindDiagnostic;
                    string expected=caseName=="binding14_map_unavailable"?"clock-map-unavailable":caseName=="binding14_map_expired"?"clock-map-expired":caseName=="binding14_source_stale"?"source-context-stale-or-future":caseName=="binding14_peer_stale"?"peer-observation-stale-or-future":"binding-peer-skew-exceeded";
                    if(observed.Reason==expected)break;
                }
                if(!bound&&!composition.Retired)Thread.Sleep(TrustedShvComposition.PrebindPollMilliseconds);
            }
            facts["readinessAttempts"]=attempts;facts["readinessElapsedMilliseconds"]=readiness.ElapsedMilliseconds;facts["sawSafeWaiting"]=sawWaiting;facts["lastDiagnostic"]=lastDiagnostic;
            if(positive)
            {
                Check(bound&&!composition.Retired&&bindAttempts==1,"one successful terminal binding only after fresh independent readiness");
                if(caseName=="binding14_resume")Check(sawWaiting,"resuming case first refuses stale unchanged context safely");
                Check(BeginProbe14(ref beginProbes,ref beginAdmissions),"single actual BEGIN after accepted readiness");Check(!BeginProbe14(ref beginProbes,ref beginAdmissions),"duplicate BEGIN blocked without a second native request");
                var adapter=new ShvGameplayFrameAdapter(module.SessionId,1,scope);var running=Stopwatch.StartNew();var bitsSeen=new HashSet<uint>();
                while(frames<6&&!composition.Retired&&running.ElapsedMilliseconds<3000)
                {
                    Pump();RequireForeground14("active-poll");composition.ObserveClock();bool fresh=composition.Poll(Capture);AuditConsumed(new List<object>());
                    if(fresh){H.Candidate candidate;HandoffPeerObservation peer;Check(composition.TryGetCurrent(out candidate,out peer),"actual accepted candidate current");
                        uint rawBits,status;long ticks;Check(raw((uint)candidate.SourceSequence-1,out rawBits,out ticks,out status)!=0&&status==0&&rawBits==candidate.RawBits&&candidate.OperatingPoint==H.Decode(rawBits),"raw float32 preserved from independently recorded actual native return");
                        GameplayFrame frame;ShvGameplayFrameAdapter.Lineage lineage;string reason;Check(adapter.TryCreate(candidate,peer,Listener(module.SessionId,candidate.SourceSequence),out frame,out lineage,out reason),"existing actual adapter admits correlated peer/scalar");
                        var decoded=GameplayWire.Decode(GameplayWire.Encode(frame,module.SessionId),module.SessionId);Check(decoded.Vehicles.Length==1&&decoded.Vehicles[0].OperatingPoint==H.Decode(rawBits)&&adapter.PassiveOnly&&!adapter.AudioPlaybackAllowed,"existing actual gameplay codec exact scalar; passive audio stays off");
                        bitsSeen.Add(rawBits);frames++;}
                    Thread.Sleep(1);
                }
                Check(frames==6&&bitsSeen.Count>1,"genuine compiled producer emits changing observations through existing validator/adapter");
                composition.Retire("fixture14-completed");H.Candidate old;Check(!composition.TryGetCurrent(out old),"current state empty on permanent retirement");
                directBindProbes++;Check(!BeginProbe14(ref beginProbes,ref beginAdmissions)&&!composition.TryBind(Peer14(),default(ShvAbi.ContextReply),Peer14()),"no rebind/BEGIN after retirement");adapter.Retire("fixture14-completed");
                GameplayFrame empty;string why;Check(adapter.TryCreateEmpty(Listener(module.SessionId,frames+1),out empty,out why)&&GameplayWire.Decode(GameplayWire.Encode(empty,module.SessionId),module.SessionId).Vehicles.Length==0,"existing empty retirement frame remains valid passive data");
            }
            else if(caseName=="binding14_never")
            {
                Check(!bound&&!composition.Retired&&sawWaiting,"no terminal binding while waiting for a frozen context");
                Check(readiness.ElapsedMilliseconds>=TrustedShvComposition.PrebindMaximumWaitMilliseconds||attempts==TrustedShvComposition.PrebindMaximumAttempts,"real bounded prebinding deadline or attempt cap reached");
                composition.Retire("waiting-context-not-refreshing");Check(composition.Reason=="waiting-context-not-refreshing"&&!BeginProbe14(ref beginProbes,ref beginAdmissions),"explicit nonrefreshing outcome and permanent no-BEGIN");
            }
            else if(!terminalExpected){
                var observed=lastDiagnostic as ShvPrebindDiagnostic;
                Check(!bound&&observed!=null,"invalid map/freshness/skew cannot bind");
                if(caseName=="binding14_map_unavailable")Check(!observed.MapAvailable&&observed.Reason=="clock-map-unavailable","missing map classified distinctly");
                if(caseName=="binding14_map_expired")Check(observed.MapAvailable&&observed.MapCurrent==false&&observed.Reason=="clock-map-expired","expired real map classified distinctly");
                if(caseName=="binding14_source_stale")Check(observed.SourceMapped==true&&observed.SourceFresh==false&&observed.MappedSourceAgeMs>250,"unchanged250ms source freshness still rejects");
                if(caseName=="binding14_peer_stale")Check(observed.SourceFresh==true&&observed.PeerFresh==false&&observed.PeerAgeMs>250,"unchanged250ms peer freshness still rejects");
                if(caseName=="binding14_peer_skew")Check(observed.SourceFresh==true&&observed.PeerFresh==true&&observed.PeerSkewWithinLimit==false&&observed.PeerSkewMs>50,"unchanged50ms endpoint skew still rejects");
                composition.Retire("fixture14-negative-control");}
            if(!positive){Metrics m;Check(getMetrics(out m,128)!=0&&m.TargetCalls==0&&m.RawPublished==0,"negative/prebinding paths made no target calls or fabricated engine values");Check(!BeginProbe14(ref beginProbes,ref beginAdmissions),"negative path cannot BEGIN after retirement");}
#endif
            Metrics beforeStop;Check(getMetrics(out beforeStop,128)!=0,"actual native fixture metrics available");facts["targetCalls"]=beforeStop.TargetCalls;facts["rawPublished"]=beforeStop.RawPublished;
            Check(beforeStop.NativeThreadViolations==0&&beforeStop.AddressThreadViolations==0&&beforeStop.ArgumentViolations==0&&beforeStop.UnknownNative==0,"native/address calls stay on registered script thread with exact ABI arguments");
            var sourceStatus=module.ReadSourceStatus();facts["sourceStateBeforeStop"]=(uint)sourceStatus.State;facts["sourceActiveStartQpcBeforeStop"]=sourceStatus.ActiveStartQpc;
            if(caseName=="binding14_legacy_frozen")Check(beforeStop.TargetCalls==0&&frames==0,"legacy failure produced no native targets or gameplay frames");
            passed=true;return 0;
        }
        catch(Exception error){facts["error"]=error.GetType().Name;facts["message"]=error.Message;Console.Error.WriteLine(error);return 1;}
        finally
        {
            try{if(module!=null)module.Stop();}catch(Exception error){facts["cleanupStop"]=error.GetType().Name;passed=false;}
            if(pause!=null)pause(0);if(release!=null)release();
            if(callback&&join!=null){bool joined=join(1000)!=0;facts["ownedCallbackJoined"]=joined;if(!joined)passed=false;}
            if(composition!=null)composition.Dispose();else if(module!=null)module.Dispose();if(window!=IntPtr.Zero)DestroyWindow(window);
            if(bindingOutput14!=null)File.WriteAllText(Path.Combine(bindingOutput14,"fixture-result.json"),new JavaScriptSerializer{MaxJsonLength=2097152}.Serialize(new{schema=1,profile="PLAYABLE-14",@case=caseName,passed=passed,assertions=checks,
                actualProducerExecuted=callback,unchangedProducerSha256=args.Length>2?args[2]:null,actualShvExecuted=false,actualRphWitnessExecuted=false,gameStarted=false,gameFilesWritten=false,endpointOpened=false,audioPlayback=false,
                independentPeerIsAuthoredFixture=true,globalKeyboardInputInjected=false,foregroundReadersSubstituted=false,foregroundChecks=foregroundChecks14,foregroundViolationStage=foregroundViolationStage14,foregroundViolationTicks=foregroundViolationTicks14,gameplayFrames=frames,guardedBindCallAttempts=bindAttempts,directTryBindCallProbes=directBindProbes,managedBeginCallProbes=beginProbes,nativeBeginAdmissionsObserved=beginAdmissions,nativeBeginExportEntryCounterMeasured=false,diagnosticWrites=bindingDiagnosticWrites14,
                facts=facts,diagnostics=bindingDiagnostics14,limits="Exact native producer with explicit fake SHV and authored RPH peers; real Clock/QPC and callback pause. Not GTA, real SDK, live correspondence or audibility proof."}));
        }
    }
}
