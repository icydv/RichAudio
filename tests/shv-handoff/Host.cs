using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    // Authored independent-peer fixture only. This partial is not a product
    // source or a factory available to the real RPH assembly.
    internal sealed partial class HandoffPeerObservation
    {
        internal static HandoffPeerObservation ForPipelineFixture(object owner,H.HostContext context,ulong vehicle,
            ulong ped,byte counter,uint value){return new HandoffPeerObservation(owner,context,vehicle,ped,71,counter,value,
                91,12,(91u<<8)|12u,new[]{10d,20d,0d},new[]{0d,0d,0d},new[]{0d,1d,0d},new[]{0d,0d,1d});}
    }
}

internal static class ShvHandoffFixtureHost
{
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr LoadLibraryExW(string path,IntPtr file,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true)]static extern IntPtr GetProcAddress(IntPtr module,string name);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandleW(string name);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern ushort RegisterClassW(ref WindowClass value);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateWindowExW(uint ex,string cls,string name,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
    [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool SetWindowTextW(IntPtr window,string text);
    [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")]static extern bool PeekMessageW(out Message message,IntPtr window,uint min,uint max,uint remove);
    [DllImport("user32.dll")]static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")]static extern IntPtr DispatchMessageW(ref Message message);
    [DllImport("user32.dll")]static extern IntPtr DefWindowProcW(IntPtr window,uint message,UIntPtr w,IntPtr l);
    delegate IntPtr WindowProcedure(IntPtr window,uint message,UIntPtr w,IntPtr l);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct WindowClass{
        internal uint Style;internal WindowProcedure Procedure;internal int ClassExtra,WindowExtra;internal IntPtr Instance,Icon,Cursor,Background;
        internal string MenuName,ClassName;
    }
    [StructLayout(LayoutKind.Sequential)]struct Message{internal IntPtr Window;internal uint Id;internal UIntPtr W;internal IntPtr L;internal uint Time;internal int X,Y;internal uint Private;}
    [StructLayout(LayoutKind.Sequential,Pack=8)]struct Metrics{
        internal uint Size,Version,CaseId,ScriptThreadId;internal ulong NativeCalls,AddressCalls,TargetCalls,Waits;
        internal uint NativeThreadViolations,AddressThreadViolations,ArgumentViolations,UnknownNative,Started,Exited,Blocked,Registered,Unregistered,RawPublished;
        internal long FirstTargetQpc,LastTargetQpc,FirstBlockedQpc,Frequency;internal ulong LastNativeHash;
    }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int ConfigureFn([MarshalAs(UnmanagedType.LPStr)]string name);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int StartFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void ReleaseFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int JoinFn(uint ms);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int MetricsFn(out Metrics metrics,uint bytes);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate int RawFn(uint index,out uint bits,out long qpc,out uint status);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint ClockFn(ref ShvAbi.Request request,uint inputBytes,out ShvAbi.ClockReply output,uint bytes);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint OpenFn(ref ShvAbi.OpenRequest request,uint inputBytes,out ShvAbi.ControlReply output,uint bytes);
    static readonly WindowProcedure windowProcedure=DefWindowProcW;
    sealed class FixtureSamplerOwner{}
    static readonly object owner=new FixtureSamplerOwner();
    static string caseName;
    static TrustedShvComposition composition;
    static int checks;
    static void Check(bool value,string why){checks++;if(!value)throw new InvalidDataException(why);}
    static string Hash(string path){using(var stream=File.OpenRead(path))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
    static T Export<T>(IntPtr module,string name)where T:class{IntPtr at=GetProcAddress(module,name);Check(at!=IntPtr.Zero,"fixture export present");return (T)(object)Marshal.GetDelegateForFunctionPointer(at,typeof(T));}
    static void Pump(){Message message;while(PeekMessageW(out message,IntPtr.Zero,0,0,1)){TranslateMessage(ref message);DispatchMessageW(ref message);}}
    static bool Foreground(){uint pid;return GetWindowThreadProcessId(GetForegroundWindow(),out pid)!=0&&pid==(uint)Process.GetCurrentProcess().Id;}
    static IntPtr Window(bool activate){
        var value=new WindowClass{Procedure=windowProcedure,Instance=GetModuleHandleW(null),ClassName="RichAudioShvHandoffFixture"};
        Check(RegisterClassW(ref value)!=0,"owned window class");
        IntPtr window=CreateWindowExW(0,value.ClassName,activate?"RichAudio offline handoff fixture - awaiting foreground":"RichAudio offline handoff fixture - negative foreground",
            0x00CF0000,100,100,520,180,IntPtr.Zero,IntPtr.Zero,value.Instance,IntPtr.Zero);Check(window!=IntPtr.Zero,"owned fixture window");
        ShowWindow(window,activate?1:4);
        if(activate){SetForegroundWindow(window);var wait=Stopwatch.StartNew();while(!Foreground()&&wait.ElapsedMilliseconds<10000){Pump();Thread.Sleep(10);}
            Check(Foreground(),"real foreground setup refused before production ASI callback");SetWindowTextW(window,"RichAudio offline handoff fixture - positive active");}
        else Check(!Foreground(),"negative foreground case requires another process foreground");
        return window;
    }
    static HandoffPeerObservation Capture(){
        long before=Stopwatch.GetTimestamp();long accepted=composition==null?0:composition.AcceptedCount;bool change=accepted>=3;
        if(caseName=="post_peer_fault"&&change&&composition.LastPollHadRecord)throw new InvalidOperationException("explicit post-read peer getter fixture fault");
        string vehicle=caseName=="host_identity_changed"&&change?"rph-vehicle-B":"rph-vehicle-A";
        string driver=caseName=="host_driver_changed"&&change?"rph-other-ped":"rph-ped-A";
        bool eligible=!(caseName=="host_exit"&&change);
        object currentOwner=caseName=="host_owner_changed"&&change?new FixtureSamplerOwner():owner;
        byte counter=(byte)(caseName=="host_pool_counter_changed"&&change?18:17);
        ulong address=caseName=="wrong_peer_address"?0xDEAD1000UL:0x20012000UL;
        var context=new H.HostContext("rph-player", "rph-ped-A",vehicle,vehicle,driver,1,H.BatiModel,eligible,true,before,Stopwatch.GetTimestamp());
        return HandoffPeerObservation.ForPipelineFixture(currentOwner,context,address,0x10011000UL,counter,(71u<<8)|counter);
    }
    static ListenerState Listener(string session,long sequence){return new ListenerState{Version=1,Session=session,Generation=1,Sequence=sequence,
        ObservationTicks=Stopwatch.GetTimestamp(),ClockFrequency=Stopwatch.Frequency,GameTimeMs=0,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},
        Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="unavailable",Paused=false,Valid=true,
        Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};}
    static void AuditConsumed(List<object> audit){
        if(composition==null)return;ShvConsumedAuditRow item;
        while(composition.TryPeekAudit(out item)){
            audit.Add(new{ordinal=item.Ordinal,kind=(uint)item.Reply.Record.Kind,sequence=item.Reply.Record.Sequence,
                rawBits=item.Reply.Record.RawBits,state=(uint)item.Reply.State,terminal=item.Reply.Terminal});
            Check(composition.AcknowledgeAudit(item.Ordinal),"known consumed audit row acknowledged after admission");
        }
    }
    static int Main(string[] args){
        IntPtr window=IntPtr.Zero;ShvProducerModule module=null;ReleaseFn release=null;JoinFn join=null;MetricsFn metricsFn=null;
        bool callbackStarted=false;string output=null;var acceptedBits=new List<uint>();int emitted=0;bool completionBeforeRelease=false,completionAfterRelease=false;
        bool partialReturnRetained=false,autonomousSilenceObserved=false,emptyRetirementFrame=false,postPeerAuditRetained=false,queueLossAuditRetained=false;
        bool metadataPendingObserved=false,threadAbortAuditRetained=false,syntheticLossMetadataRejected=false;uint sourceTerminal=0;
        string terminal=null;var run=Stopwatch.StartNew();var audit=new List<object>();object queueAtFourSeconds=null;
        try{
            Check(args.Length==4,"case/hash/hash/output arguments");caseName=args[0];output=Path.GetFullPath(args[3]);
            string binary=Assembly.GetExecutingAssembly().Location,root=Path.GetDirectoryName(binary),fake=Path.Combine(root,"ScriptHookV.dll"),producer=Path.Combine(root,"RichAudio.OperatingState.ShvHandoff.asi");
            Check(Hash(fake)==args[1]&&Hash(producer)==args[2],"fake and exact production bytes verified before load");
            foreach(ProcessModule loaded in Process.GetCurrentProcess().Modules)Check(!String.Equals(loaded.ModuleName,"ScriptHookV.dll",StringComparison.OrdinalIgnoreCase),"no preloaded actual SHV");
            IntPtr fakeModule=LoadLibraryExW(fake,IntPtr.Zero,0x100|0x800);Check(fakeModule!=IntPtr.Zero,"verified fake loaded by exact local path");
            var configure=Export<ConfigureFn>(fakeModule,"FixtureConfigure");var start=Export<StartFn>(fakeModule,"FixtureStartRegistered");
            release=Export<ReleaseFn>(fakeModule,"FixtureRelease");join=Export<JoinFn>(fakeModule,"FixtureJoin");metricsFn=Export<MetricsFn>(fakeModule,"FixtureGetMetrics");var raw=Export<RawFn>(fakeModule,"FixtureRaw");
            string nativeCase=caseName.StartsWith("host_")||caseName.StartsWith("wrong_")||caseName=="no_foreground"||caseName=="metadata_pending"
                ||caseName=="post_peer_fault"||caseName=="post_peer_abort"||caseName=="queue_full"?"valid_changing":caseName;
            Check(configure(nativeCase)!=0,"explicit fixture case configured");
            window=Window(caseName!="no_foreground");
            IntPtr sourceModule=LoadLibraryExW(producer,IntPtr.Zero,0x100|0x800);Check(sourceModule!=IntPtr.Zero,"unchanged production ASI loaded against fake import");
            string hostHash=Hash(binary);var scope=new H.Scope("0.0.0.0",hostHash,args[1],args[1],args[2],H.BatiModel,"explicit-fixture",hostHash);
            var review=new ShvModuleReview(scope,binary,fake,fake,producer,binary,hostHash,true);
            if(caseName=="wrong_provider_hash"){
                var bad=new H.Scope(scope.GameVersion,scope.GameSha256,scope.ShvSha256,scope.LoaderSha256,new string('0',64),scope.Model,scope.RphVersion,scope.RphSha256);
                bool denied=false;try{ShvProducerModule.AttachLoaded(new ShvModuleReview(bad,binary,fake,fake,producer,binary,hostHash,true),Assembly.GetExecutingAssembly());}catch(InvalidDataException){denied=true;}
                Check(denied,"wrong actual producer bytes rejected before callback/open");terminal="wrong-provider-rejected";
            }else{
                if(caseName=="metadata_pending"){
                    module=ShvProducerModule.AttachLoaded(review,Assembly.GetExecutingAssembly());
                    Check(!module.MetadataReady,"already loaded owned module can be metadata-pending before script callback");metadataPendingObserved=true;
                }
                Check(start()!=0,"dedicated registered script callback started");callbackStarted=true;
                Thread.Sleep(20);if(module==null)module=ShvProducerModule.AttachLoaded(review,Assembly.GetExecutingAssembly());
                var metadataWait=Stopwatch.StartNew();while(!module.MetadataReady&&metadataWait.ElapsedMilliseconds<1000){module.TryInitializeMetadata();Pump();Thread.Sleep(1);}
                Check(module.MetadataReady,"actual callback metadata obtained without opening or retrying a target");
                if(caseName=="wrong_process_open"){
                    var request=new ShvAbi.OpenRequest{Header=ShvAbi.Head(typeof(ShvAbi.OpenRequest)),Key=new ShvAbi.Key{Session0=1,Secret0=1},
                        ExpectedProcessId=module.Description.ProcessId+1,ExpectedProcessCreationFileTime=module.Description.ProcessCreationFileTime,
                        Build0=0x52413039,Build1=0x00010000,Build2=0xF9DDA40B,Build3=0xC293A61E};ShvAbi.ControlReply reply;
                    var open=Export<OpenFn>(sourceModule,"RichAudioShvOpen");Check((ShvAbi.Code)open(ref request,96,out reply,64)==ShvAbi.Code.BadArgument,"wrong process lifetime rejected");
                    module.OpenSession();terminal="wrong-process-rejected";
                }else{
                    module.OpenSession();
                    if(caseName=="wrong_session_key"){
                        var request=new ShvAbi.Request{Header=ShvAbi.Head(typeof(ShvAbi.Request))};ShvAbi.ClockReply reply;
                        var clock=Export<ClockFn>(sourceModule,"RichAudioShvClock");Check((ShvAbi.Code)clock(ref request,56,out reply,112)==ShvAbi.Code.Unauthorized,"wrong session/secret cannot read owned source");terminal="wrong-session-rejected";
                    }else{
                        composition=new TrustedShvComposition(module,caseName=="wrong_binding_policy"?HandoffBindingProofMode.Pending:HandoffBindingProofMode.ReadOnlySdkOrdinaryReuse);
                        var preparation=Stopwatch.StartNew();bool bound=false;
                        while(!composition.Retired&&preparation.ElapsedMilliseconds<4000){
                            Pump();composition.ObserveClock();if(composition.ClockReady){var before=Capture();ShvAbi.ContextReply waiting;
                                var code=module.TryPeek(out waiting);var after=Capture();if(code==ShvAbi.Code.Ok){bound=composition.TryBind(before,waiting,after);break;}}
                            Thread.Sleep(1);
                        }
                        if(caseName=="wrong_peer_address"||caseName=="wrong_binding_policy"||caseName=="no_foreground")Check(!bound&&composition.Retired,"independent initial binding denied");
                        else{
                            Check(bound&&composition.ClockReady,"actual loaded-module clock and independent fixture binding");Check(composition.Begin(),"single begin after measured binding");
                            var adapter=new ShvGameplayFrameAdapter(module.SessionId,1,scope);
                            var active=Stopwatch.StartNew();int limit=caseName=="max_duration"?123000:6000;
                            while(!composition.Retired&&active.ElapsedMilliseconds<limit){
                                Pump();composition.ObserveClock();bool fresh=composition.Poll(Capture);
                                AuditConsumed(audit);
                                if(fresh){H.Candidate value;HandoffPeerObservation peer;Check(composition.TryGetCurrent(out value,out peer),"accepted value readable only while current");
                                    uint bits,status;long qpc;Check(raw((uint)value.SourceSequence-1,out bits,out qpc,out status)!=0&&status==0&&bits==value.RawBits,"independent actual native raw bits preserved");
                                    Check(value.OperatingPoint==H.Decode(bits)&&!value.LiveHandoffReady&&!value.MeasuredRpm,"exact promoted scalar without live/RPM claim");
                                    GameplayFrame frame;ShvGameplayFrameAdapter.Lineage lineage;string why;
                                    Check(adapter.TryCreate(value,peer,Listener(module.SessionId,value.SourceSequence),out frame,out lineage,out why),"actual adapter accepts correlated candidate");
                                    byte[] bytes=GameplayWire.Encode(frame,module.SessionId);var decoded=GameplayWire.Decode(bytes,module.SessionId);
                                    Check(decoded.Vehicles.Length==1&&decoded.Vehicles[0].OperatingPoint==H.Decode(bits)&&decoded.Vehicles[0].Id==peer.Context.VehicleId,"existing actual GameplayWire preserves scalar/host-local identity");
                                    Check(adapter.PassiveOnly&&!adapter.AudioPlaybackAllowed,"serialized data grants no playback");acceptedBits.Add(bits);emitted++;
                                    if((caseName=="valid_changing"||caseName=="metadata_pending")&&emitted>=8)break;
                                    if(caseName=="queue_full"&&emitted>=3)break;
                                    if(caseName=="post_peer_abort"&&emitted>=3)break;
                                }
                                if(caseName=="post_context_delay"&&composition.PartialReturn.HasValue)partialReturnRetained=true;
                                Thread.Sleep(1);
                            }
                            if(caseName=="post_peer_abort"){
                                bool unwound=false;var thread=new Thread(delegate(){
                                    try{var budget=Stopwatch.StartNew();while(budget.ElapsedMilliseconds<750&&!composition.Retired){
                                        composition.Poll(delegate(){var peer=Capture();if(composition.LastPollHadRecord)Thread.CurrentThread.Abort();return peer;});Thread.Sleep(1);
                                    }}finally{unwound=true;}
                                });thread.IsBackground=true;thread.Start();var abortWait=Stopwatch.StartNew();
                                while(thread.IsAlive&&abortWait.ElapsedMilliseconds<1200){Pump();Thread.Sleep(2);}
                                Check(thread.Join(100)&&unwound,"owned peer thread aborted/unwound without resetting or swallowing abort");
                                ShvConsumedAuditRow retained;threadAbortAuditRetained=composition.TryPeekAudit(out retained)&&retained.Reply.Record.Size==256;
                                Check(threadAbortAuditRetained,"actual consumed native row survives post-peer ThreadAbort until acknowledged");
                                composition.Retire("fixture-peer-aborted");AuditConsumed(audit);
                            }
                            if(caseName=="queue_full"){
                                var stalled=Stopwatch.StartNew();while(stalled.ElapsedMilliseconds<4000){Pump();Thread.Sleep(5);}
                                var initial=module.ReadSourceStatus();queueAtFourSeconds=new{state=(uint)initial.State,terminal=initial.Terminal,
                                    queued=initial.Queued,attempts=initial.TargetAttempts,foreground=Foreground(),elapsedMilliseconds=stalled.ElapsedMilliseconds};
                                File.WriteAllText(Path.Combine(output,"queue-at-four-seconds.json"),new JavaScriptSerializer().Serialize(queueAtFourSeconds));
                                while(initial.State!=ShvAbi.State.Retired&&stalled.ElapsedMilliseconds<8000){Pump();Thread.Sleep(5);initial=module.ReadSourceStatus();}
                                sourceTerminal=initial.Terminal;
                                ShvAbi.ReadReply lost;var code=module.ReadNext(out lost);
                                Check(code==ShvAbi.Code.Ok&&lost.Record.Size==256&&lost.State==ShvAbi.State.Retired&&lost.Terminal==5,
                                    "known popped row retained after FIFO retirement: code="+(uint)code+" size="+lost.Record.Size+" state="+(uint)lost.State+
                                    " terminal="+lost.Terminal+" queued="+lost.Queued+" dropped="+lost.DroppedRecords+" attempts="+initial.TargetAttempts+" foreground="+Foreground());
                                // Reservation can stop before any physical drop.
                                // This separate malformed-metadata control is
                                // explicitly authored, never reported as a drop.
                                var malformed=lost;malformed.DroppedRecords=1;bool denied=false;
                                try{module.ValidateRead(code,malformed);}catch(InvalidDataException){denied=true;}
                                Check(denied,"explicit mutated loss metadata rejects after raw audit availability");syntheticLossMetadataRejected=denied;queueLossAuditRetained=true;
                                audit.Add(new{kind=(uint)lost.Record.Kind,sequence=lost.Record.Sequence,rawBits=lost.Record.RawBits,actualDropped=lost.DroppedRecords});
                            }
                            if(caseName=="max_duration"){
                                var finish=Stopwatch.StartNew();ShvAbi.ClockReply status=module.ReadSourceStatus();
                                while(status.State!=ShvAbi.State.Retired&&finish.ElapsedMilliseconds<500){Pump();Thread.Sleep(2);status=module.ReadSourceStatus();}
                                sourceTerminal=status.Terminal;Check(sourceTerminal==3||sourceTerminal==4,"actual native fixed active/target cap reached without a shortened test clock");
                            }
                            if(caseName!="valid_changing"&&caseName!="metadata_pending"){
                                Check(composition.Retired,"invalid context/shutdown/silence/deadline retired actual composition");H.Candidate expired;
                                Check(!composition.TryGetCurrent(out expired)&&expired==null,"previous candidate cannot persist after failure");
                            }else Check(emitted>=8&&new HashSet<uint>(acceptedBits).Count>=3,"valid changing producer/consumer/frame sequence");
                            if(caseName=="freeze_after_3"||caseName=="shutdown_after_3")autonomousSilenceObserved=composition.Reason=="source-silence-or-expiry";
                            if(caseName=="freeze_after_3"||caseName=="shutdown_after_3")Check(autonomousSilenceObserved&&emitted>=2,"actual missing stream expired without synthetic observations");
                            if(caseName=="post_context_delay")Check(partialReturnRetained&&composition.PartialReturn.HasValue,"known early raw return retained when later native blocked");
                            if(caseName=="post_peer_fault"){
                                postPeerAuditRetained=composition.LastPollHadRecord&&composition.RecordsRead>0&&composition.LastReadReply.Record.Size==256;
                                Check(postPeerAuditRetained,"post-peer fault cannot erase a known consumed ABI row");
                            }
                            if(caseName!="max_duration"&&caseName!="valid_changing"&&caseName!="metadata_pending")Check(emitted>=2,"failure cleared a previously active actual candidate");
                            adapter.Retire("fixture-source-retired");GameplayFrame empty;string emptyReason;
                            Check(adapter.TryCreateEmpty(Listener(module.SessionId,emitted+1),out empty,out emptyReason),"retirement creates valid passive empty frame");
                            var emptied=GameplayWire.Decode(GameplayWire.Encode(empty,module.SessionId),module.SessionId);
                            Check(emptied.Vehicles.Length==0,"existing wire clears all affected sources on retirement");emptyRetirementFrame=true;
                        }
                        terminal=composition.Reason??"fixture-requested-stop";
                    }
                }
                completionBeforeRelease=module.ReadSourceCompletion();module.Stop();
                if(caseName=="freeze_after_3"||caseName=="post_context_delay")Check(!completionBeforeRelease,"retirement is not native callback completion");
                release();var drain=Stopwatch.StartNew();bool emptyQueue=false;
                while(drain.ElapsedMilliseconds<1000){
                    for(int i=0;i<128;i++){
                        ShvAbi.ReadReply remaining;var code=module.ReadNext(out remaining);emptyQueue=code==ShvAbi.Code.Empty;
                        if(code!=ShvAbi.Code.Ok)break;
                        audit.Add(new{kind=(uint)remaining.Record.Kind,sequence=remaining.Record.Sequence,rawBits=remaining.Record.RawBits,
                            readStatus=(uint)remaining.Record.ReadStatus,flags=remaining.Record.Flags,state=(uint)remaining.State,terminal=remaining.Terminal});
                    }
                    if(module.ReadSourceCompletion()&&emptyQueue)break;Pump();Thread.Sleep(5);
                }
                completionAfterRelease=module.ReadSourceCompletion();
                if(caseName=="shutdown_after_3")Check(!completionAfterRelease,"unexpected callback exit cannot invent producer completion");
                else Check(completionAfterRelease,"released owned callback published completion");
                Check(join(1000)!=0,"owned fixture script thread joined");
            }
            Metrics metrics;Check(metricsFn(out metrics,128)!=0&&Marshal.SizeOf(typeof(Metrics))==128,"bounded fixture metrics ABI");
            Check(metrics.NativeThreadViolations==0&&metrics.AddressThreadViolations==0&&metrics.ArgumentViolations==0&&metrics.UnknownNative==0,"all real producer natives/address calls stayed in registered script context");
            Check(metrics.TargetCalls<=2400&&metrics.RawPublished<=2400,"real producer acquisition cap");
            if(caseName.StartsWith("wrong_")||caseName=="no_foreground")Check(metrics.TargetCalls==0,"untrusted/mismatched initial scope made zero target calls");
            if(caseName=="max_duration")Check(metrics.TargetCalls>=400&&run.ElapsedMilliseconds>=120000&&(sourceTerminal==3||sourceTerminal==4),"unshortened real producer active cap");
            var rawHistory=new List<object>();long previousTarget=-1;for(uint i=0;i<metrics.RawPublished;i++){
                uint bits,status;long qpc;Check(raw(i,out bits,out qpc,out status)!=0,"bounded independent raw history");
                if(previousTarget>=0)Check((qpc-previousTarget)*1000m/metrics.Frequency>=50,"actual source native entry rate<=20Hz");
                previousTarget=qpc;rawHistory.Add(new{index=i,bits=bits,status=status,targetQpc=qpc});
            }
            var report=new Dictionary<string,object>{{"schema",1},{"case",caseName},{"passed",true},{"assertions",checks},{"candidateSha256",args[2]},
                {"fixtureSha256",args[1]},{"actualProducerExecuted",callbackStarted},{"actualShvExecuted",false},{"actualRphWitnessExecuted",false},{"gameStarted",false},
                {"globalKeyboardInputInjected",false},{"foregroundReadersSubstituted",false},{"endpointOpened",false},{"audioPlayback",false},{"providerQualified",false},
                {"targetCalls",metrics.TargetCalls},{"accepted",acceptedBits.Count},{"gameplayFrames",emitted},{"acceptedRawBits",acceptedBits},{"terminalReason",terminal},
                {"sourceCompletedBeforeRelease",completionBeforeRelease},{"sourceCompletedAfterRelease",completionAfterRelease},{"partialReturnRetained",partialReturnRetained},
                {"autonomousSilenceObserved",autonomousSilenceObserved},{"elapsedMilliseconds",run.ElapsedMilliseconds},{"nativeCalls",metrics.NativeCalls},
                {"emptyRetirementFrame",emptyRetirementFrame},{"nativeTerminalCode",sourceTerminal},{"drainedAuditRows",audit},{"independentNativeHistory",rawHistory},
                {"metadataPendingObserved",metadataPendingObserved},{"postPeerAuditRetained",postPeerAuditRetained},{"queueLossAuditRetained",queueLossAuditRetained},
                {"threadAbortAuditRetained",threadAbortAuditRetained},{"syntheticLossMetadataRejected",syntheticLossMetadataRejected},
                {"queueAtFourSeconds",queueAtFourSeconds},
                {"addressCalls",metrics.AddressCalls},{"nativeThreadViolations",metrics.NativeThreadViolations},{"addressThreadViolations",metrics.AddressThreadViolations},
                {"argumentViolations",metrics.ArgumentViolations},{"unknownNativeCalls",metrics.UnknownNative},{"firstTargetQpc",metrics.FirstTargetQpc},
                {"lastTargetQpc",metrics.LastTargetQpc},{"qpcFrequency",metrics.Frequency},{"lifetimeLimit","Full unobserved8-bit pool-counter/address ABA is not excluded by the bounded read-only proof."}};
            File.WriteAllText(Path.Combine(output,"fixture-result.json"),new JavaScriptSerializer().Serialize(report));
            Console.WriteLine("PASS actual handoff fixture "+caseName+"; accepted="+acceptedBits.Count+"; target="+metrics.TargetCalls);return 0;
        }catch(Exception error){
            if(output!=null)try{
                Metrics failureMetrics=new Metrics();if(metricsFn!=null)metricsFn(out failureMetrics,128);
                object sourceStatus=null;if(module!=null&&module.MetadataReady&&module.SessionId!=null){var s=module.ReadSourceStatus();
                    sourceStatus=new{state=(uint)s.State,terminal=s.Terminal,queued=s.Queued,attempts=s.TargetAttempts,completed=module.ReadSourceCompletion()};}
                File.WriteAllText(Path.Combine(output,"failure.json"),new JavaScriptSerializer().Serialize(new{error=error.GetType().Name,message=error.Message,
                    targetCalls=failureMetrics.TargetCalls,rawPublished=failureMetrics.RawPublished,foreground=Foreground(),sourceStatus=sourceStatus,queueAtFourSeconds=queueAtFourSeconds}));
            }catch{}
            Console.Error.WriteLine(error.GetType().Name+": "+error.Message);return 1;
        }
        finally{
            AuditConsumed(audit);if(release!=null)release();if(composition!=null)composition.Dispose();else if(module!=null)module.Dispose();
            if(callbackStarted&&join!=null)join(1000);if(window!=IntPtr.Zero)DestroyWindow(window);
        }
    }
}
