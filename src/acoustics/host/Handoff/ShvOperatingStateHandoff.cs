// Shared value/identity/time validator, originally PLAYABLE-08 offline preparation.
// PLAYABLE-09 adds owned composition separately; this file opens no endpoint,
// launches no process and performs no native calls, transport or rendering.
using System;
using System.IO;

namespace RichAudio.Beacon.Handoff
{
    internal sealed partial class ShvOperatingStateHandoff
    {
        // Authored conservative validation policy, not measured transport guarantees.
        internal const int MaximumAgeMs=250, MaximumFutureMs=2, MaximumPeerSkewMs=50;
        internal const int MaximumBracketMs=250, MinimumTargetIntervalMs=50;
        internal const int MaximumContinuityGapMs=250;
        internal const int MaximumMapLifetimeMs=5000, MaximumAnchorWidthMs=4;
        internal const int MaximumDriftPpm=100;
        internal const long ExactIntegerLimit=9007199254740991;
        internal const uint BatiModel=0xF9300CC5;
        internal const string Quantity="normalised-engine-operating-state";
        internal const string NativeHash="F9DDA40BC293A61E";

        internal sealed class Scope
        {
            // RPH metadata is retained for historical diagnostics only. Runtime
            // compatibility, not third-party distribution identity, is policy.
            internal readonly string GameVersion, GameSha256, ShvSha256, LoaderSha256, ProducerSha256,RphVersion,RphSha256;
            internal readonly uint Model;
            internal Scope(string version,string game,string shv,string loader,string producer,uint model,string rphVersion,string rph)
            { GameVersion=version;GameSha256=game;ShvSha256=shv;LoaderSha256=loader;ProducerSha256=producer;Model=model;RphVersion=rphVersion;RphSha256=rph; }
        }
        internal static Scope QualifiedDiagnosticScope()
        {
            return new Scope("1.0.1158.16",
                "b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea",
                "126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f",
                "9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d",
                "41361aa281493e1cc54fe196161aafc4a93ce002bfe0bb9da2effbc742465484",BatiModel,
                "1.132.1428.17748","73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac");
        }
        internal static bool SameScope(Scope a,Scope b)
        {
            return a!=null&&b!=null&&a.GameVersion==b.GameVersion&&a.GameSha256==b.GameSha256
                &&a.ShvSha256==b.ShvSha256&&a.LoaderSha256==b.LoaderSha256
                &&a.ProducerSha256==b.ProducerSha256&&a.Model==b.Model;
        }
        static bool Token(string x,int length)
        {
            if(x==null||x.Length==0||x.Length>length)return false;
            foreach(char c in x)if(!(c>='a'&&c<='z'||c>='A'&&c<='Z'||c>='0'&&c<='9'||c=='-'||c==':'||c=='_'))return false;
            return true;
        }
        static bool Session(string x)
        {
            if(x==null||x.Length!=32)return false;
            foreach(char c in x)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))return false;
            return true;
        }
        static bool Finite(double x){return !Double.IsNaN(x)&&!Double.IsInfinity(x);}
        static bool Within(long start,long end,long frequency,int milliseconds)
        { return start>=0&&end>=start&&(decimal)end-start<=(decimal)frequency*milliseconds/1000; }
        static void Require(bool x,string reason){if(!x)throw new InvalidDataException(reason);}
        internal static double Decode(uint bits){return (double)BitConverter.ToSingle(BitConverter.GetBytes(bits),0);}

        // Handles are meaningful only inside this SHV observation. They are never
        // compared with a host/RPH handle or used as a shared identity namespace.
        internal sealed class ShvContext
        {
            internal readonly int Player,Ped,Vehicle,Driver;
            internal readonly uint Model,EngineRunningRaw,SpeedBits;
            internal readonly bool Eligible;
            internal readonly long StartTicks,EndTicks;
            internal ShvContext(int player,int ped,int vehicle,int driver,uint model,uint running,uint speedBits,
                bool eligible,long start,long end)
            { Player=player;Ped=ped;Vehicle=vehicle;Driver=driver;Model=model;EngineRunningRaw=running;
              SpeedBits=speedBits;Eligible=eligible;StartTicks=start;EndTicks=end; }
        }
        // Eligible means independently read valid/living own player, current
        // vehicle and driver, offline, not loading/switching/paused, foreground.
        // A future authenticated composition must substantiate that precondition;
        // this DTO is not authentication and cannot mint a binding capability.
        internal sealed class HostContext
        {
            internal readonly string PlayerId,PedId,VehicleId,CurrentVehicleId,DriverId;
            internal readonly int Generation;
            internal readonly uint Model;
            internal readonly bool Eligible,Running;
            internal readonly long StartTicks,EndTicks;
            internal HostContext(string player,string ped,string vehicle,string currentVehicle,string driver,
                int generation,uint model,bool eligible,bool running,long start,long end)
            { PlayerId=player;PedId=ped;VehicleId=vehicle;CurrentVehicleId=currentVehicle;DriverId=driver;
              Generation=generation;Model=model;Eligible=eligible;Running=running;StartTicks=start;EndTicks=end; }
        }
        internal sealed class Observation
        {
            internal readonly string SessionId,ReadStatus;
            internal readonly long Generation,Sequence,TargetBeforeTicks,TargetAfterTicks;
            internal readonly Scope SourceScope;
            internal readonly ShvContext Pre,Post;
            internal readonly HostContext HostPre,HostPost;
            internal readonly uint RawBits;
            internal readonly double RawValue;
            internal readonly bool PointerPresent;
            internal Observation(string session,long generation,long sequence,Scope scope,ShvContext pre,ShvContext post,
                HostContext hostPre,HostContext hostPost,long before,long after,uint bits,double value,bool pointer,string status)
            { SessionId=session;Generation=generation;Sequence=sequence;SourceScope=scope;Pre=pre;Post=post;
              HostPre=hostPre;HostPost=hostPost;TargetBeforeTicks=before;TargetAfterTicks=after;
              RawBits=bits;RawValue=value;PointerPresent=pointer;ReadStatus=status; }
        }

        internal sealed class SourceCapability
        {
            readonly object issuer;
            internal readonly Scope Scope;
            internal readonly string SessionId;
            internal readonly long Generation;
            internal readonly long SourceFrequency,HostFrequency;
            internal SourceCapability(object key,Scope scope,string session,long generation,long sourceFrequency,long hostFrequency)
            { issuer=key;Scope=scope;SessionId=session;Generation=generation;SourceFrequency=sourceFrequency;HostFrequency=hostFrequency; }
            internal bool IssuedBy(object key){return Object.ReferenceEquals(issuer,key);}
        }
        internal sealed class BindingCapability
        {
            readonly object issuer;
            internal readonly SourceCapability Source;
            internal readonly ShvContext ShvIdentity;
            internal readonly HostContext HostIdentity;
            internal readonly long ValidFromTicks,ValidThroughTicks;
            internal BindingCapability(object key,SourceCapability source,ShvContext shv,HostContext host,long from,long through)
            { issuer=key;Source=source;ShvIdentity=shv;HostIdentity=host;ValidFromTicks=from;ValidThroughTicks=through; }
            internal bool IssuedBy(object key){return Object.ReferenceEquals(issuer,key);}
        }
        internal sealed class ClockCapability
        {
            readonly object issuer;
            internal readonly SourceCapability Source;
            internal readonly long SourceFrequency,HostFrequency,SourceAnchor,HostBefore,HostAfter,ExpiresTicks;
            internal readonly int DriftPpm;
            internal ClockCapability(object key,SourceCapability source,long sourceFrequency,long hostFrequency,
                long sourceAnchor,long hostBefore,long hostAfter,long expires,int drift)
            { issuer=key;Source=source;SourceFrequency=sourceFrequency;HostFrequency=hostFrequency;
              SourceAnchor=sourceAnchor;HostBefore=hostBefore;HostAfter=hostAfter;ExpiresTicks=expires;DriftPpm=drift; }
            internal bool IssuedBy(object key){return Object.ReferenceEquals(issuer,key);}
        }

        // Only an explicit OFFLINE composition can issue capabilities here. No
        // public JSON parser, authenticated=true field or production/live factory
        // exists. Issuer tokens prevent mixing different offline compositions;
        // they are an API ownership boundary, not a hostile in-process sandbox.
        internal sealed class OfflineComposition
        {
            readonly object issuer=new object();
            internal bool LiveHandoffReady{get{return false;}}
            internal SourceCapability Source(Scope scope,string session,long generation,long sourceFrequency,long hostFrequency)
            {
                Require(SameScope(scope,QualifiedDiagnosticScope()),"unqualified diagnostic scope");
                Require(Session(session)&&generation>0&&generation<=ExactIntegerLimit,"source session/generation");
                Require(Frequency(sourceFrequency)&&Frequency(hostFrequency),"source and host clock domains");
                return new SourceCapability(issuer,scope,session,generation,sourceFrequency,hostFrequency);
            }
            internal BindingCapability BindForFixture(SourceCapability source,ShvContext shv,HostContext host,
                long from,long through)
            {
                Require(source!=null&&source.IssuedBy(issuer),"source capability issuer");
                Require(Within(from,through,source.HostFrequency,MaximumMapLifetimeMs),"binding lifetime");
                Require(ValidShv(shv)&&ValidHost(host),"independent driver observations required");
                // This explicit fixture binding is authored ground truth, NOT a
                // model/speed heuristic or evidence of real entity correlation.
                return new BindingCapability(issuer,source,shv,host,from,through);
            }
            internal ClockCapability ClockForFixture(SourceCapability source,long sourceAnchor,long hostBefore,long hostAfter,long expires,int driftPpm)
            {
                Require(source!=null&&source.IssuedBy(issuer),"source capability issuer");
                Require(sourceAnchor>=0,"clock domain");
                Require(Within(hostBefore,hostAfter,source.HostFrequency,MaximumAnchorWidthMs),"clock anchor uncertainty");
                Require(Within(hostAfter,expires,source.HostFrequency,MaximumMapLifetimeMs)&&expires>hostAfter,"clock map lifetime");
                Require(driftPpm>=0&&driftPpm<=MaximumDriftPpm,"clock drift bound");
                return new ClockCapability(issuer,source,source.SourceFrequency,source.HostFrequency,sourceAnchor,hostBefore,hostAfter,expires,driftPpm);
            }
            internal ShvOperatingStateHandoff Validator(SourceCapability source)
            {
                Require(source!=null&&source.IssuedBy(issuer),"source capability issuer");
                return new ShvOperatingStateHandoff(issuer,source);
            }
        }

        internal sealed class Candidate
        {
            internal readonly double OperatingPoint;
            internal readonly uint RawBits;
            internal readonly long SourceSequence,SourceGeneration,SourceBeforeTicks,SourceAfterTicks;
            internal readonly long MinimumHostTicks,MaximumHostTicks,HostVehicleObservationTicks;
            internal readonly long ValidThroughHostTicks,HostClockFrequency;
            internal readonly string HostVehicleId,SessionId;
            internal readonly int HostVehicleGeneration;
            internal readonly Scope Scope;
            internal bool LiveHandoffReady{get{return false;}}
            internal bool MeasuredRpm{get{return false;}}
            internal Candidate(Observation o,long low,long high,long through,long frequency)
            { OperatingPoint=o.RawValue;RawBits=o.RawBits;SourceSequence=o.Sequence;SourceGeneration=o.Generation;SessionId=o.SessionId;
              SourceBeforeTicks=o.TargetBeforeTicks;SourceAfterTicks=o.TargetAfterTicks;MinimumHostTicks=low;MaximumHostTicks=high;
              HostVehicleId=o.HostPre.VehicleId;HostVehicleGeneration=o.HostPre.Generation;
              HostVehicleObservationTicks=o.HostPre.StartTicks+(o.HostPost.EndTicks-o.HostPre.StartTicks)/2;
              ValidThroughHostTicks=through;HostClockFrequency=frequency;Scope=o.SourceScope; }
        }
        internal sealed class Decision
        {
            internal readonly bool Accepted,RawReturnPresent;
            internal readonly string Reason;
            internal readonly Candidate Value;
            internal readonly uint RawBits;
            internal readonly double RawValue;
            internal Decision(bool accepted,string reason,Candidate value,Observation o)
            { Accepted=accepted;Reason=reason;Value=value;RawReturnPresent=o!=null&&o.PointerPresent&&o.ReadStatus=="good";
              RawBits=o==null?0:o.RawBits;RawValue=o==null?0:o.RawValue; }
        }

        readonly object issuer;
        readonly object admission=new object();
        readonly SourceCapability source;
        bool retired;
        string retirementReason;
        long lastSequence,lastAfter=-1,lastReceive=-1;
        internal ShvOperatingStateHandoff(object key,SourceCapability src){issuer=key;source=src;}
        internal bool Retired{get{lock(admission)return retired;}}
        internal long HostFrequency{get{return source.HostFrequency;}}
        internal string RetirementReason{get{lock(admission)return retirementReason;}}
        // Missing arrivals must be able to retire the same validator. This is
        // permanent and does not create a replacement source/session.
        internal void Retire(string reason)
        {
            if(!Token(reason,96))throw new ArgumentException("bounded retirement reason");
            lock(admission){if(!retired){retired=true;retirementReason=reason;}}
        }
        static bool Frequency(long x){return x>0&&x<=1000000000;}
        internal static bool ValidShv(ShvContext x)
        {
            return x!=null&&x.Eligible&&x.Player>=0&&x.Ped!=0&&x.Vehicle!=0&&x.Driver==x.Ped
                &&x.Model==BatiModel&&x.EngineRunningRaw==1&&Finite(Decode(x.SpeedBits))
                &&Decode(x.SpeedBits)>=0&&Decode(x.SpeedBits)<=100;
        }
        internal static bool ValidHost(HostContext x)
        {
            return x!=null&&x.Eligible&&x.Running&&x.Model==BatiModel&&x.Generation>0
                &&Token(x.PlayerId,64)&&Token(x.PedId,64)&&Token(x.VehicleId,64)
                &&x.CurrentVehicleId==x.VehicleId&&x.DriverId==x.PedId;
        }
        internal static bool SameShv(ShvContext a,ShvContext b)
        { return a.Player==b.Player&&a.Ped==b.Ped&&a.Vehicle==b.Vehicle&&a.Driver==b.Driver&&a.Model==b.Model; }
        internal static bool SameHost(HostContext a,HostContext b)
        { return a.PlayerId==b.PlayerId&&a.PedId==b.PedId&&a.VehicleId==b.VehicleId&&a.CurrentVehicleId==b.CurrentVehicleId
            &&a.DriverId==b.DriverId&&a.Model==b.Model&&a.Generation==b.Generation; }
        internal static bool Map(ClockCapability clock,long start,long end,out long low,out long high)
        {
            low=high=0;
            if(start<0||end<start)return false;
            decimal allowed=(decimal)clock.SourceFrequency*(MaximumMapLifetimeMs+MaximumAgeMs+MaximumBracketMs+MaximumFutureMs)/1000;
            if(Math.Abs((decimal)start-clock.SourceAnchor)>allowed||Math.Abs((decimal)end-clock.SourceAnchor)>allowed)return false;
            decimal a=((decimal)start-clock.SourceAnchor)*clock.HostFrequency/clock.SourceFrequency;
            decimal b=((decimal)end-clock.SourceAnchor)*clock.HostFrequency/clock.SourceFrequency;
            decimal drift=Math.Max(Math.Abs(a),Math.Abs(b))*clock.DriftPpm/1000000;
            decimal lower=Math.Floor(clock.HostBefore+a-drift),upper=Math.Ceiling(clock.HostAfter+b+drift);
            if(lower<0||upper>Int64.MaxValue||upper<lower)return false;
            low=(long)lower;high=(long)upper;return true;
        }
        Decision Reject(string reason,Observation o){retired=true;retirementReason=reason;return new Decision(false,reason,null,o);}

        internal Decision Accept(Observation o,BindingCapability binding,ClockCapability clock,long nowHostTicks)
        { lock(admission)return AcceptOwned(o,binding,clock,nowHostTicks); }

        Decision AcceptOwned(Observation o,BindingCapability binding,ClockCapability clock,long nowHostTicks)
        {
            if(retired)return new Decision(false,"session-retired",null,o);
            if(o==null)return Reject("missing-observation",o);
            if(binding==null||clock==null||!binding.IssuedBy(issuer)||!clock.IssuedBy(issuer)
                ||!Object.ReferenceEquals(binding.Source,source)||!Object.ReferenceEquals(clock.Source,source))
                return Reject("untrusted-capability",o);
            if(!SameScope(o.SourceScope,source.Scope)||o.SessionId!=source.SessionId||o.Generation!=source.Generation)
                return Reject("scope-session-generation",o);
            if(o.Sequence<1||o.Sequence>ExactIntegerLimit||o.Sequence!=lastSequence+1||nowHostTicks<0||nowHostTicks<=lastReceive)
                return Reject("sequence-or-receive-order",o);
            if(nowHostTicks<clock.HostAfter||nowHostTicks>clock.ExpiresTicks
                ||nowHostTicks<binding.ValidFromTicks||nowHostTicks>binding.ValidThroughTicks)
                return Reject("expired-or-future-capability",o);
            if(!o.PointerPresent||o.ReadStatus!="good")return Reject("target-not-good",o);
            double decoded=Decode(o.RawBits);
            if(!Finite(decoded)||!Finite(o.RawValue))return Reject("nonfinite-return",o);
            if(decoded!=o.RawValue)return Reject("raw-bits-value-mismatch",o);
            if(decoded<0||decoded>1)return Reject("outside-qualified-envelope",o);
            if(!ValidShv(o.Pre)||!ValidShv(o.Post)||!ValidHost(o.HostPre)||!ValidHost(o.HostPost))
                return Reject("invalid-driver-or-running-context",o);
            if(decoded==0)return Reject("unexplained-running-zero",o);
            if(!SameShv(o.Pre,o.Post)||!SameShv(o.Pre,binding.ShvIdentity)
                ||!SameHost(o.HostPre,o.HostPost)||!SameHost(o.HostPre,binding.HostIdentity))
                return Reject("identity-binding-changed",o);
            if(!Within(o.Pre.StartTicks,o.Post.EndTicks,clock.SourceFrequency,MaximumBracketMs)
                ||o.Pre.EndTicks<o.Pre.StartTicks||o.TargetBeforeTicks<o.Pre.EndTicks
                ||o.TargetAfterTicks<o.TargetBeforeTicks||o.Post.StartTicks<o.TargetAfterTicks||o.Post.EndTicks<o.Post.StartTicks
                ||!Within(o.HostPre.StartTicks,o.HostPost.EndTicks,clock.HostFrequency,MaximumBracketMs)
                ||o.HostPre.EndTicks<o.HostPre.StartTicks||o.HostPost.StartTicks<o.HostPre.EndTicks||o.HostPost.EndTicks<o.HostPost.StartTicks)
                return Reject("incomplete-or-invalid-time-bracket",o);
            if(lastAfter>=0&&((decimal)o.TargetBeforeTicks-lastAfter)<(decimal)clock.SourceFrequency*MinimumTargetIntervalMs/1000)
                return Reject("rate-or-source-clock-discontinuity",o);
            if(lastAfter>=0&&((decimal)o.Pre.StartTicks-lastAfter)>(decimal)clock.SourceFrequency*MaximumContinuityGapMs/1000)
                return Reject("source-continuity-gap",o);
            long low,high;
            if(!Map(clock,o.Pre.StartTicks,o.Post.EndTicks,out low,out high))return Reject("clock-map-overflow",o);
            // The entire acquisition + map-uncertainty interval must be fresh.
            decimal oldestMs=((decimal)nowHostTicks-low)*1000/clock.HostFrequency;
            decimal newestMs=((decimal)nowHostTicks-high)*1000/clock.HostFrequency;
            if(oldestMs>MaximumAgeMs||newestMs< -MaximumFutureMs)return Reject("stale-or-future-interval",o);
            if(high>clock.ExpiresTicks)return Reject("clock-map-does-not-cover-interval",o);
            if(low<binding.ValidFromTicks||high>binding.ValidThroughTicks
                ||o.HostPre.StartTicks<binding.ValidFromTicks||o.HostPost.EndTicks>binding.ValidThroughTicks)
                return Reject("binding-does-not-cover-interval",o);
            // Worst endpoint pairing: midpoint agreement alone is insufficient.
            decimal peerDistance=Math.Max(Math.Abs((decimal)o.HostPost.EndTicks-low),Math.Abs((decimal)high-o.HostPre.StartTicks));
            if(peerDistance*1000/clock.HostFrequency>MaximumPeerSkewMs)return Reject("peer-observation-skew",o);
            decimal peerOldest=((decimal)nowHostTicks-o.HostPre.StartTicks)*1000/clock.HostFrequency;
            decimal peerNewest=((decimal)nowHostTicks-o.HostPost.EndTicks)*1000/clock.HostFrequency;
            if(peerOldest>MaximumAgeMs||peerNewest< -MaximumFutureMs)return Reject("stale-or-future-peer",o);
            lastSequence=o.Sequence;lastAfter=o.TargetAfterTicks;lastReceive=nowHostTicks;
            decimal freshThrough=(decimal)Math.Min(low,o.HostPre.StartTicks)+(decimal)clock.HostFrequency*MaximumAgeMs/1000;
            long through=(long)Math.Min(freshThrough,Math.Min(clock.ExpiresTicks,binding.ValidThroughTicks));
            return new Decision(true,"offline-candidate",new Candidate(o,low,high,through,clock.HostFrequency),o);
        }
    }
}
