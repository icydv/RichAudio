using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace RichAudio.Beacon.Handoff
{
    // Mirror of src/telemetry/ShvHandoff/ProducerApi.h, Windows x64 pack8.
    // No structure contains a claim of authentication or binding qualification.
    internal static class ShvAbi
    {
        internal const uint Version=1;
        internal enum Code:uint{Ok,Empty,Busy,BadArgument,Unauthorized,InvalidState,AlreadyUsed,Unavailable}
        internal enum State:uint{Dormant,Ready,Waiting,BeginPending,Active,Retired}
        internal enum Kind:uint{TargetReturn=1,Observation=2,Terminal=3}
        internal enum ReadStatus:uint{NotAttempted,Good,Null,Seh}
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Header{internal uint Size,Version;}
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Key{internal ulong Session0,Session1,Secret0,Secret1,Secret2,Secret3;}
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Request{internal Header Header;internal Key Key;}
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Description{
            internal Header Header;internal uint Build0,Build1,Build2,Build3,ProcessId,Flags;
            internal ulong ProcessCreationFileTime;internal long SourceInstanceQpc,Frequency,CallQpc;
            internal uint WaitingMilliseconds,ActiveMilliseconds,MaximumTargets,MinimumIntervalMilliseconds,QueueCapacity,RecordBytes,ContextBytes,Packing;
            internal ulong NativeHash;internal uint Model,Reserved;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct OpenRequest{
            internal Header Header;internal Key Key;internal uint ExpectedProcessId,Reserved;
            internal ulong ExpectedProcessCreationFileTime;internal uint Build0,Build1,Build2,Build3;internal ulong Reserved2;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct BeginRequest{
            internal Header Header;internal Key Key;internal ulong ExpectedContextSequence,ExpectedVehicleAddress,ExpectedPedAddress;
            internal long ExpectedContextEndQpc;internal int ExpectedVehicle,ExpectedPed,ExpectedPlayer;internal uint Reserved,Identity0,Identity1,Identity2,Identity3;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct ControlReply{
            internal Header Header;internal State State;internal uint Terminal,Reserved0,Reserved1;
            internal long CallQpc;internal ulong Generation;internal long SourceInstanceQpc;
            internal uint Queued,TargetAttempts;internal long LastTargetAfterQpc;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct ClockReply{
            internal Header Header;internal long CallQpc,Frequency,SourceInstanceQpc;internal ulong ProcessCreationFileTime,Session0,Session1,Generation;
            internal State State;internal uint Terminal;internal long LastTargetAfterQpc,ActiveStartQpc,WaitingDeadlineQpc,ActiveDeadlineQpc;
            internal uint TargetAttempts,Queued;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Context{
            internal long StartQpc,EndQpc;internal int Player,Ped,Vehicle,Driver;
            internal uint Model,EngineRunningRaw,SpeedBits,Flags;internal ulong VehicleAddress,PedAddress;
            internal uint Identity0,Identity1,Identity2,Identity3;
            internal bool ReservedZero{get{return (Identity0|Identity1|Identity2|Identity3)==0;}}
            internal ShvOperatingStateHandoff.ShvContext ToContext(){return new ShvOperatingStateHandoff.ShvContext(
                Player,Ped,Vehicle,Driver,Model,EngineRunningRaw,SpeedBits,Flags==15&&ReservedZero,StartQpc,EndQpc);}
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct ContextReply{
            internal Header Header;internal ulong Session0,Session1;internal long SourceInstanceQpc;internal ulong Generation,ContextSequence;
            internal Context Context;internal State State;internal uint Terminal;internal ulong FailedNative;internal uint ExceptionCode,Reserved;internal long CallQpc;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct Record{
            internal uint Size;internal Kind Kind;internal ulong Session0,Session1,Generation,Sequence;internal long SourceInstanceQpc,TargetBeforeQpc,TargetAfterQpc;
            internal uint RawBits;internal float RawFloat32;internal ReadStatus ReadStatus;internal uint Flags;
            internal Context Pre,Post;internal uint Terminal,ExceptionCode;internal ulong FailedNative;
        }
        [StructLayout(LayoutKind.Sequential,Pack=8)] internal struct ReadReply{
            internal Header Header;internal State State;internal uint Terminal;internal Record Record;
            internal long CallQpc;internal uint Queued,DroppedRecords;
        }
        internal static Header Head(Type type){return new Header{Size=(uint)Marshal.SizeOf(type),Version=Version};}
        internal static void CheckLayout(){
            Type[] types={typeof(Key),typeof(Request),typeof(Description),typeof(OpenRequest),typeof(BeginRequest),typeof(ControlReply),typeof(ClockReply),typeof(Context),typeof(ContextReply),typeof(Record),typeof(ReadReply)};
            int[] sizes={48,56,112,96,120,64,112,80,160,256,288};
            if(IntPtr.Size!=8)throw new InvalidDataException("x64 handoff required");
            for(int i=0;i<types.Length;i++)if(Marshal.SizeOf(types[i])!=sizes[i])throw new InvalidDataException("handoff ABI layout");
            if(Marshal.OffsetOf(typeof(Record),"RawBits").ToInt32()!=64||Marshal.OffsetOf(typeof(Record),"RawFloat32").ToInt32()!=68
                ||Marshal.OffsetOf(typeof(Record),"Pre").ToInt32()!=80||Marshal.OffsetOf(typeof(Record),"Post").ToInt32()!=160
                ||Marshal.OffsetOf(typeof(Context),"VehicleAddress").ToInt32()!=48)throw new InvalidDataException("handoff ABI offsets");
        }
    }

    // This is expected reviewed policy, not evidence. AttachLoaded independently
    // measures the loaded module, actual process and all referenced file hashes.
    internal sealed class ShvModuleReview
    {
        internal readonly ShvOperatingStateHandoff.Scope Scope;
        internal readonly string GamePath,ShvPath,LoaderPath,ProducerPath,RphPath,CallerAssemblySha256;
        internal readonly bool FixtureOnly;
        internal ShvModuleReview(ShvOperatingStateHandoff.Scope scope,string gamePath,string shvPath,string loaderPath,
            string producerPath,string rphPath,string callerAssemblySha256,bool fixtureOnly=false)
        {Scope=scope;GamePath=gamePath;ShvPath=shvPath;LoaderPath=loaderPath;ProducerPath=producerPath;RphPath=rphPath;
         CallerAssemblySha256=callerAssemblySha256;FixtureOnly=fixtureOnly;}
    }
    internal sealed class ShvProducerModule:IDisposable
    {
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint DescribeFn(out ShvAbi.Description output,uint bytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint OpenFn(ref ShvAbi.OpenRequest request,uint requestBytes,out ShvAbi.ControlReply output,uint outputBytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint ClockFn(ref ShvAbi.Request request,uint requestBytes,out ShvAbi.ClockReply output,uint outputBytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint PeekFn(ref ShvAbi.Request request,uint requestBytes,out ShvAbi.ContextReply output,uint outputBytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint BeginFn(ref ShvAbi.BeginRequest request,uint requestBytes,out ShvAbi.ControlReply output,uint outputBytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint ReadFn(ref ShvAbi.Request request,uint requestBytes,out ShvAbi.ReadReply output,uint outputBytes);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint StopFn(ref ShvAbi.Request request,uint requestBytes,out ShvAbi.ControlReply output,uint outputBytes);
        [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true)] static extern IntPtr GetProcAddress(IntPtr module,string name);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetModuleHandleExW(uint flags,IntPtr address,out IntPtr module);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
        readonly object gate=new object(),witnessOwner=new object();
        readonly List<FileStream> pinnedFiles=new List<FileStream>();
        readonly DescribeFn describe;readonly OpenFn open;readonly ClockFn clock;readonly PeekFn peek;
        readonly BeginFn begin;readonly ReadFn read;readonly StopFn stop;
        readonly IHandoffHostClock hostClock=StopwatchHandoffClock.Instance;
        readonly ShvModuleReview review;
        readonly Assembly callerAssembly;
        readonly uint processId;
        readonly ulong creation;
        ShvAbi.Description description;
        bool metadataReady;
        ShvAbi.ContextReply lastPeek;
        bool hasPeek;
        ShvAbi.Key key;bool opened,disposed,stopped;
        string session;
        private ShvProducerModule(ShvModuleReview review,Assembly caller)
        {
            ShvAbi.CheckLayout();this.review=review;callerAssembly=caller;
            if(review==null||review.Scope==null||caller==null||caller.IsDynamic)throw new InvalidDataException("reviewed module policy");
            if(!review.FixtureOnly){var q=ShvOperatingStateHandoff.QualifiedDiagnosticScope();
                if(review.Scope.GameVersion!=q.GameVersion||!Equal(review.Scope.GameSha256,q.GameSha256)||!Equal(review.Scope.ShvSha256,q.ShvSha256)
                    ||!Equal(review.Scope.LoaderSha256,q.LoaderSha256)
                    ||review.Scope.Model!=q.Model)throw new InvalidDataException("unreviewed framework scope");}
            try{
                Pin(review.GamePath,review.Scope.GameSha256);Pin(review.ShvPath,review.Scope.ShvSha256);Pin(review.LoaderPath,review.Scope.LoaderSha256);
                // RPH is a host API, not an authenticated distribution owned by
                // RichAudio. Keep our producer/caller and qualified SHV stack
                // pinned; the typed RPH operations enforce functional validity.
                Pin(review.ProducerPath,review.Scope.ProducerSha256);Pin(caller.Location,review.CallerAssemblySha256);
                bool callerLoaded=false;foreach(var loaded in AppDomain.CurrentDomain.GetAssemblies())if(Object.ReferenceEquals(loaded,caller))callerLoaded=true;
                if(!callerLoaded)throw new InvalidDataException("RPH caller assembly not loaded");
                IntPtr baseAddress=IntPtr.Zero;long moduleBytes=0;
                using(var process=Process.GetCurrentProcess()){
                    processId=(uint)process.Id;
                    if(!SamePath(process.MainModule.FileName,review.GamePath))throw new InvalidDataException("actual game process path");
                    long made,exit,kernel,user;if(!GetProcessTimes(process.Handle,out made,out exit,out kernel,out user)||made<=0)throw new InvalidDataException("process creation witness");
                    creation=(ulong)made;
                    bool shvLoaded=false,loaderLoaded=false;
                    foreach(ProcessModule module in process.Modules){
                        if(SamePath(module.FileName,review.ShvPath))shvLoaded=true;
                        if(SamePath(module.FileName,review.LoaderPath))loaderLoaded=true;
                        if(Equal(module.ModuleName,"ScriptHookV.dll")&&!SamePath(module.FileName,review.ShvPath))throw new InvalidDataException("different loaded SHV dependency");
                        if(SamePath(module.FileName,review.ProducerPath)){
                            if(baseAddress!=IntPtr.Zero)throw new InvalidDataException("ambiguous loaded producer module");baseAddress=module.BaseAddress;moduleBytes=module.ModuleMemorySize;
                        }
                    }
                    Require(shvLoaded&&(review.FixtureOnly||loaderLoaded),"actual reviewed SHV/loader module paths");
                }
                if(baseAddress==IntPtr.Zero||moduleBytes<=0)throw new InvalidDataException("reviewed producer is not already loaded");
                IntPtr held;if(!GetModuleHandleExW(5,baseAddress,out held)||held!=baseAddress)throw new InvalidDataException("loaded module pin");
                describe=Export<DescribeFn>(baseAddress,moduleBytes,"RichAudioShvDescribe");open=Export<OpenFn>(baseAddress,moduleBytes,"RichAudioShvOpen");
                clock=Export<ClockFn>(baseAddress,moduleBytes,"RichAudioShvClock");peek=Export<PeekFn>(baseAddress,moduleBytes,"RichAudioShvPeek");
                begin=Export<BeginFn>(baseAddress,moduleBytes,"RichAudioShvBegin");read=Export<ReadFn>(baseAddress,moduleBytes,"RichAudioShvReadNext");
                stop=Export<StopFn>(baseAddress,moduleBytes,"RichAudioShvStop");
                TryInitializeMetadata();
            }catch{foreach(var file in pinnedFiles)file.Dispose();pinnedFiles.Clear();throw;}
        }
        internal static ShvProducerModule AttachLoaded(ShvModuleReview review,Assembly caller){return new ShvProducerModule(review,caller);}
        internal bool MetadataReady{get{lock(gate)return metadataReady;}}
        internal ShvAbi.Description Description{get{lock(gate){Require(metadataReady,"producer metadata pending");return description;}}}
        internal ShvModuleReview Review{get{return review;}}
        internal string SessionId{get{lock(gate)return session;}}
        internal long Generation{get{return 1;}}
        internal long HostFrequency{get{return hostClock.Frequency;}}
        internal bool FixtureOnly{get{return review.FixtureOnly;}}
        internal bool LiveHandoffReady{get{return false;}}
        internal ShvClockCalibration NewClockCalibration(){return new ShvClockCalibration(witnessOwner,description.Frequency,hostClock.Frequency,description.SourceInstanceQpc);}
        internal bool Owns(ShvClockWitness witness){return witness!=null&&witness.IssuedBy(witnessOwner);}
        internal bool Owns(ShvMeasuredClockMap mapping){return mapping!=null&&mapping.IssuedBy(witnessOwner);}
        internal bool OwnsWaiting(ShvAbi.ContextReply waiting){lock(gate)return hasPeek&&lastPeek.Equals(waiting);}
        internal bool OwnsPeer(HandoffPeerObservation peer){return peer!=null&&peer.SamplerOwner!=null
            &&Object.ReferenceEquals(peer.SamplerOwner.GetType().Assembly,callerAssembly);}
        internal bool TryInitializeMetadata(){lock(gate){
            Require(!disposed,"producer module disposed");ShvAbi.Description d;var code=(ShvAbi.Code)describe(out d,112);
            if(code==ShvAbi.Code.Unavailable)return false;
            Require(code==ShvAbi.Code.Ok,"producer describe result");CheckDescription(d);
            if(metadataReady)Require(d.SourceInstanceQpc==description.SourceInstanceQpc&&d.Frequency==description.Frequency,"producer metadata changed");
            description=d;metadataReady=true;return true;
        }}
        void CheckDescription(ShvAbi.Description d){
            CheckHead(d.Header,112);Require(d.Build0==0x52413039&&d.Build1==0x00010000&&d.Build2==0xF9DDA40B&&d.Build3==0xC293A61E,"producer build contract");
            Require(d.ProcessId==processId&&d.ProcessCreationFileTime==creation&&d.SourceInstanceQpc>0,"producer process/instance witness");
            Require(d.Frequency>0&&d.Frequency<=1000000000&&(d.Flags==63||d.Flags==127)&&d.Reserved==0,"producer passive flags/clock");
            Require(d.WaitingMilliseconds==300000&&d.ActiveMilliseconds==120000&&d.MaximumTargets==2400&&d.MinimumIntervalMilliseconds==50
                &&d.QueueCapacity==128&&d.RecordBytes==256&&d.ContextBytes==80&&d.Packing==8&&d.NativeHash==0xF9DDA40BC293A61E
                &&d.Model==ShvOperatingStateHandoff.BatiModel,"producer fixed review bounds");
        }
        internal ShvAbi.Description DescribeSnapshot(){lock(gate){
            Require(!disposed&&metadataReady,"producer module metadata unavailable");ShvAbi.Description reply;
            Require((ShvAbi.Code)describe(out reply,112)==ShvAbi.Code.Ok,"producer describe unavailable");CheckHead(reply.Header,112);
            Require(reply.ProcessId==processId&&reply.ProcessCreationFileTime==creation&&reply.SourceInstanceQpc==description.SourceInstanceQpc
                &&reply.Frequency==description.Frequency&&(reply.Flags==63||reply.Flags==127)&&reply.Reserved==0,"producer completion identity");
            return reply;
        }}
        internal bool ReadSourceCompletion(){return (DescribeSnapshot().Flags&64)!=0;}
        static bool Equal(string a,string b){return String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
        static bool SamePath(string a,string b){return Equal(Path.GetFullPath(a),Path.GetFullPath(b));}
        static void Require(bool condition,string reason){if(!condition)throw new InvalidDataException(reason);}
        static void CheckHead(ShvAbi.Header header,uint size){Require(header.Size==size&&header.Version==1,"producer-abi-reply-header");}
        static T Export<T>(IntPtr module,long bytes,string name)where T:class{
            IntPtr address=GetProcAddress(module,name);long offset=address.ToInt64()-module.ToInt64();
            Require(address!=IntPtr.Zero&&offset>=0&&offset<bytes,"owned nonforwarded producer export");
            return (T)(object)Marshal.GetDelegateForFunctionPointer(address,typeof(T));
        }
        void Pin(string path,string expected){
            Require(!String.IsNullOrEmpty(path)&&Path.IsPathRooted(path)&&expected!=null&&expected.Length==64,"reviewed artifact path/hash");
            string full=Path.GetFullPath(path);for(string at=full;!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){
                Require((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"linked reviewed artifact path");
                if(Path.GetDirectoryName(at)==at)break;
            }
            var file=new FileStream(full,FileMode.Open,FileAccess.Read,FileShare.Read);
            try{string digest;using(var sha=SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();
                Require(Equal(digest,expected),"actual reviewed artifact hash");pinnedFiles.Add(file);
            }catch{file.Dispose();throw;}
        }
        ShvAbi.Request Request(){Require(opened&&!disposed,"owned producer session not open");return new ShvAbi.Request{Header=ShvAbi.Head(typeof(ShvAbi.Request)),Key=key};}
        void CheckControl(ShvAbi.ControlReply reply){CheckHead(reply.Header,64);Require(reply.Reserved0==0&&reply.Reserved1==0&&reply.Generation==1
            &&reply.SourceInstanceQpc==description.SourceInstanceQpc&&reply.Queued<=128&&reply.TargetAttempts<=2400,"producer control identity/bounds");}
        void CheckSession(ulong a,ulong b,ulong generation,long instance){Require(a==key.Session0&&b==key.Session1&&generation==1&&instance==description.SourceInstanceQpc,"producer-session-generation-instance");}
        internal void OpenSession(string requestedSession=null){lock(gate){
            Require(!opened&&!disposed&&metadataReady,"one metadata-ready owned producer open");byte[] random=new byte[48];using(var rng=new RNGCryptoServiceProvider())rng.GetBytes(random);
            if(requestedSession!=null){Require(requestedSession.Length==32,"owned session format");for(int i=0;i<16;i++)random[i]=Convert.ToByte(requestedSession.Substring(i*2,2),16);}
            key=new ShvAbi.Key{Session0=BitConverter.ToUInt64(random,0),Session1=BitConverter.ToUInt64(random,8),Secret0=BitConverter.ToUInt64(random,16),
                Secret1=BitConverter.ToUInt64(random,24),Secret2=BitConverter.ToUInt64(random,32),Secret3=BitConverter.ToUInt64(random,40)};
            session=BitConverter.ToString(random,0,16).Replace("-","").ToLowerInvariant();Array.Clear(random,0,random.Length);
            var request=new ShvAbi.OpenRequest{Header=ShvAbi.Head(typeof(ShvAbi.OpenRequest)),Key=key,ExpectedProcessId=processId,
                ExpectedProcessCreationFileTime=creation,Build0=0x52413039,Build1=0x00010000,Build2=0xF9DDA40B,Build3=0xC293A61E};
            ShvAbi.ControlReply reply;Require((ShvAbi.Code)open(ref request,96,out reply,64)==ShvAbi.Code.Ok,"producer refused owned open");
            CheckControl(reply);Require(reply.State==ShvAbi.State.Waiting&&reply.Terminal==0,"producer waiting state");opened=true;
        }}
        internal ShvAbi.ClockReply ReadSourceStatus(){lock(gate){
            var request=Request();ShvAbi.ClockReply reply;Require((ShvAbi.Code)clock(ref request,56,out reply,112)==ShvAbi.Code.Ok,"owned producer status reply");
            CheckHead(reply.Header,112);CheckSession(reply.Session0,reply.Session1,reply.Generation,reply.SourceInstanceQpc);
            Require(reply.Frequency==description.Frequency&&reply.ProcessCreationFileTime==creation,"producer status identity");return reply;
        }}
        internal ShvClockWitness MeasureClock(){lock(gate){
            var request=Request();long before=hostClock.Now;ShvAbi.ClockReply reply;var code=(ShvAbi.Code)clock(ref request,56,out reply,112);long after=hostClock.Now;
            Require(code==ShvAbi.Code.Ok,"owned producer clock reply");CheckHead(reply.Header,112);
            CheckSession(reply.Session0,reply.Session1,reply.Generation,reply.SourceInstanceQpc);
            Require(reply.Frequency==description.Frequency&&reply.ProcessCreationFileTime==creation&&reply.Terminal==0&&reply.State!=ShvAbi.State.Retired,"producer clock identity/state");
            return new ShvClockWitness(witnessOwner,reply.Frequency,hostClock.Frequency,reply.SourceInstanceQpc,reply.CallQpc,before,after);
        }}
        internal ShvAbi.Code TryPeek(out ShvAbi.ContextReply reply){ShvAbi.Code raw;bool returned;return TryPeek(out reply,out raw,out returned);}
        internal ShvAbi.Code TryPeek(out ShvAbi.ContextReply reply,out ShvAbi.Code rawCode,out bool nativeReturned){lock(gate){
            reply=new ShvAbi.ContextReply();rawCode=ShvAbi.Code.Unavailable;nativeReturned=false;
            var request=Request();var code=(ShvAbi.Code)peek(ref request,56,out reply,160);rawCode=code;nativeReturned=true;
            Require(code==ShvAbi.Code.Ok||code==ShvAbi.Code.Empty||code==ShvAbi.Code.Busy,"owned producer waiting context");
            if(code==ShvAbi.Code.Busy)return code;
            CheckHead(reply.Header,160);CheckSession(reply.Session0,reply.Session1,reply.Generation,reply.SourceInstanceQpc);
            Require(reply.Reserved==0&&reply.Context.ReservedZero&&reply.State==ShvAbi.State.Waiting&&reply.Terminal==0,"producer waiting context state");
            if(code==ShvAbi.Code.Ok){Require(reply.ContextSequence>0,"producer context sequence");lastPeek=reply;hasPeek=true;}
            return code;
        }}
        internal ShvAbi.ContextReply Peek(){ShvAbi.ContextReply reply;Require(TryPeek(out reply)==ShvAbi.Code.Ok,"producer waiting context not yet available");return reply;}
        internal void Begin(ShvAbi.ContextReply waiting){lock(gate){
            Request();CheckSession(waiting.Session0,waiting.Session1,waiting.Generation,waiting.SourceInstanceQpc);
            var c=waiting.Context;var request=new ShvAbi.BeginRequest{Header=ShvAbi.Head(typeof(ShvAbi.BeginRequest)),Key=key,
                ExpectedContextSequence=waiting.ContextSequence,ExpectedVehicleAddress=c.VehicleAddress,ExpectedPedAddress=c.PedAddress,
                ExpectedContextEndQpc=c.EndQpc,ExpectedVehicle=c.Vehicle,ExpectedPed=c.Ped,ExpectedPlayer=c.Player};
            ShvAbi.ControlReply reply;Require((ShvAbi.Code)begin(ref request,120,out reply,64)==ShvAbi.Code.Ok,"producer refused begin");
            CheckControl(reply);Require(reply.Terminal==0&&(reply.State==ShvAbi.State.BeginPending||reply.State==ShvAbi.State.Active),"producer begin state");
        }}
        internal ShvAbi.Code ReadNext(out ShvAbi.ReadReply reply){lock(gate){
            // The fixed-size native call can pop a row. Return its bytes before
            // any interpretation can reject them, so the audit owner retains
            // a known raw row even when it must deny all use of that row.
            var request=Request();return (ShvAbi.Code)read(ref request,56,out reply,288);
        }}
        internal void ValidateRead(ShvAbi.Code code,ShvAbi.ReadReply reply){lock(gate){
            Require(code==ShvAbi.Code.Ok||code==ShvAbi.Code.Empty||code==ShvAbi.Code.Busy,"producer-read-result");
            if(code==ShvAbi.Code.Busy)return;CheckHead(reply.Header,288);Require(reply.State<=ShvAbi.State.Retired,"producer-state-invalid");
            Require(reply.Queued<=128&&reply.DroppedRecords==0,"producer-queue-bounds-or-loss");
            if(code==ShvAbi.Code.Ok){var row=reply.Record;Require(row.Size==256&&row.Kind>=ShvAbi.Kind.TargetReturn&&row.Kind<=ShvAbi.Kind.Terminal,"producer-row-abi-kind");
                CheckSession(row.Session0,row.Session1,row.Generation,row.SourceInstanceQpc);
                Require((row.Flags&~255u)==0&&row.Pre.ReservedZero&&row.Post.ReservedZero,"producer-row-reserved-bits");}
        }}
        internal void Stop(){lock(gate){
            if(disposed||!opened||stopped)return;var request=Request();ShvAbi.ControlReply reply;
            var code=(ShvAbi.Code)stop(ref request,56,out reply,64);stopped=true;
            Require(code==ShvAbi.Code.Ok,"producer stop result");CheckControl(reply);
        }}
        public void Dispose(){lock(gate){if(disposed)return;try{Stop();}finally{
            disposed=true;key=new ShvAbi.Key();foreach(var file in pinnedFiles)file.Dispose();pinnedFiles.Clear();
            // The module is intentionally pinned for process lifetime. No hot unload.
        }}}
    }
}
