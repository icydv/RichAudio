using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.Serialization.Json;
using System.IO;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    internal sealed partial class HandoffPeerObservation
    {
        // Authored device-free witness. Never included in the RPH assembly.
        internal static HandoffPeerObservation ForAdapterFixture(object owner,H.HostContext context,
            double[] forward=null,ulong address=100)
        {
            return new HandoffPeerObservation(owner,context,address,200,1,2,0x102,3,4,0x304,
                new[]{10d,20d,1d},new[]{0d,3d,0d},forward??new[]{0d,1d,0d},new[]{0d,0d,1d});
        }
    }
}
internal static class TestShvGameplayFrameAdapter
{
    static int checks,cases;static readonly List<string> names=new List<string>();
    static void Check(bool value,string why){checks++;if(!value)throw new Exception(why);}
    static void Test(string name,Action body){body();cases++;names.Add(name);}
    sealed class Clock:IHandoffHostClock
    {
        internal long Value;internal int Calls,JumpAt=-1;internal long Jump;
        public long Frequency{get{return Stopwatch.Frequency;}}
        public long Now{get{Calls++;return Value+(JumpAt>0&&Calls>=JumpAt?Jump:0);}}
    }
    sealed class Fixture
    {
        internal const string Session="0123456789abcdef0123456789abcdef";
        internal readonly Clock Clock=new Clock{Value=Stopwatch.GetTimestamp()};
        internal readonly object PeerOwner=new object();
        internal readonly H.OfflineComposition Owner=new H.OfflineComposition();
        internal readonly H.SourceCapability Source;internal readonly H Validator;
        internal readonly H.BindingCapability Binding;internal readonly H.ClockCapability Mapping;
        internal readonly long Frequency=Stopwatch.Frequency,Anchor,SourceAnchor=1000000;
        internal H.Observation Last;
        internal readonly ShvGameplayFrameAdapter Adapter;
        internal Fixture(){
            Anchor=Clock.Value-Frequency/50;
            Source=Owner.Source(H.QualifiedDiagnosticScope(),Session,1,Frequency,Frequency);
            var first=Observation(1);Binding=Owner.BindForFixture(Source,first.Pre,first.HostPre,Anchor,Anchor+Frequency*5);
            Mapping=Owner.ClockForFixture(Source,SourceAnchor,Anchor,Anchor+1,Anchor+Frequency*5,0);
            Validator=Owner.Validator(Source);Adapter=new ShvGameplayFrameAdapter(Session,1,Source.Scope,Clock);
        }
        H.Observation Observation(long sequence,uint bits=0x3E4CCCCD){
            long delta=(sequence-1)*Frequency*60/1000,s=SourceAnchor+delta,h=Anchor+delta,m=Frequency/1000;
            var pre=new H.ShvContext(0,3,7,3,H.BatiModel,1,0,true,s,s+m);
            var post=new H.ShvContext(0,3,7,3,H.BatiModel,1,0,true,s+3*m,s+4*m);
            var a=new H.HostContext("player","ped-local","vehicle-local","vehicle-local","ped-local",1,H.BatiModel,true,true,h,h+m);
            var b=new H.HostContext("player","ped-local","vehicle-local","vehicle-local","ped-local",1,H.BatiModel,true,true,h+3*m,h+4*m);
            return new H.Observation(Session,1,sequence,Source.Scope,pre,post,a,b,s+m,s+2*m,bits,H.Decode(bits),true,"good");
        }
        internal H.Candidate Candidate(long sequence=1,uint bits=0x3E4CCCCD){
            Last=Observation(sequence,bits);Clock.Value=Anchor+(sequence-1)*Frequency*60/1000+Frequency/50;
            var decision=Validator.Accept(Last,Binding,Mapping,Clock.Value);Check(decision.Accepted,"real value validator accepts authored typed fixture: "+decision.Reason);return decision.Value;
        }
        internal HandoffPeerObservation Peer(){return HandoffPeerObservation.ForAdapterFixture(PeerOwner,Last.HostPost);}
        internal ListenerState Listener(){var peer=Last.HostPost;return new ListenerState{Version=1,Session=Session,Generation=1,Sequence=Last.Sequence,
            ObservationTicks=peer.StartTicks+(peer.EndTicks-peer.StartTicks)/2,ClockFrequency=Frequency,GameTimeMs=1,
            Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},
            ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=false,Valid=true,Reason="valid",
            Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};}
        internal bool Emit(H.Candidate candidate,HandoffPeerObservation peer,ListenerState listener,out GameplayFrame frame){ShvGameplayFrameAdapter.Lineage lineage;string reason;return Adapter.TryCreate(candidate,peer,listener,out frame,out lineage,out reason);}
    }
    static int Main(){try{
        Test("accepted exact float32 maps through existing gameplay codec",delegate{
            var f=new Fixture();var c=f.Candidate();var listener=f.Listener();var peer=f.Peer();GameplayFrame frame;ShvGameplayFrameAdapter.Lineage line;string reason;
            Check(f.Adapter.TryCreate(c,peer,listener,out frame,out line,out reason),"new accepted vehicle");
            GameplayWire.Validate(frame,Fixture.Session);var decoded=GameplayWire.Decode(GameplayWire.Encode(frame,Fixture.Session),Fixture.Session);var v=decoded.Vehicles[0];
            Check(v.OperatingPoint==H.Decode(c.RawBits)&&v.Id=="vehicle-local"&&v.Generation==1&&v.Model==H.BatiModel,"exact scalar and host identity roundtrip");
            Check(v.Running&&v.Valid&&v.Context=="player"&&v.Position[0]==10&&v.Velocity[1]==3,"actual peer pose and running scope");
            Check(v.RiderAttached==true&&v.RiderViewAttached==null,"qualified player-driver attachment; camera view remains unknown until observed");
            Check(v.ObservationTicks==peer.Context.StartTicks+(peer.Context.EndTicks-peer.Context.StartTicks)/2&&v.ObservationTicks!=f.Clock.Value,"pose was not retimestamped");
            Check(line.RawBits==c.RawBits&&line.SessionId==Fixture.Session&&line.SourceSequence==1&&line.SourceGeneration==1,"private source lineage");
            Check(line.MinimumHostTicks==c.MinimumHostTicks&&line.MaximumHostTicks==c.MaximumHostTicks&&line.ValidThroughHostTicks==c.ValidThroughHostTicks,"uncertainty and expiry retained");
            Check(frame.ValidThroughTicks==c.ValidThroughHostTicks,"original source expiry reaches the gameplay wire");
            Check(line.SourceBeforeTicks==c.SourceBeforeTicks&&line.PeerStartTicks==peer.Context.StartTicks&&line.ListenerObservationTicks==listener.ObservationTicks,"original acquisition times retained");
            Check(f.Adapter.PassiveOnly&&!f.Adapter.AudioPlaybackAllowed&&!c.LiveHandoffReady,"no audio or live promotion");
            listener.Position[0]=99;Check(frame.Listener.Position[0]==0,"listener snapshot copied");var p=peer.Position;p[0]=999;Check(frame.Vehicles[0].Position[0]==10,"peer pose snapshot copied");
        });
        Test("a second changing accepted source observation emits once",delegate{
            var f=new Fixture();GameplayFrame frame;var c=f.Candidate();Check(f.Emit(c,f.Peer(),f.Listener(),out frame),"first");
            c=f.Candidate(2,0x3F400000);Check(f.Emit(c,f.Peer(),f.Listener(),out frame)&&frame.Vehicles[0].OperatingPoint==.75,"second exact observation");
            Check(!f.Emit(c,f.Peer(),f.Listener(),out frame)&&frame.Vehicles.Length==0&&!f.Adapter.Retired,"duplicate produces no last-good vehicle");
        });
        Test("private camera baseline consumes source under unchanged gates before fresh recovery",delegate{
            var f=new Fixture();GameplayFrame frame;var c=f.Candidate();Check(f.Emit(c,f.Peer(),f.Listener(),out frame),"first published frame");
            c=f.Candidate(2);var baseline=f.Listener();baseline.Generation=2;baseline.Position[0]=20;baseline.VelocityKind="unavailable";
            Check(f.Emit(c,f.Peer(),baseline,out frame)&&frame.Listener.Generation==2&&!f.Adapter.Retired,"private cut baseline passes original full adapter gates");
            // The entry discards this frame instead of serializing or publishing.
            frame=null;c=f.Candidate(3);var fresh=f.Listener();fresh.Generation=2;fresh.Position[0]=21;fresh.Velocity[0]=1/.06;
            Check(f.Emit(c,f.Peer(),fresh,out frame)&&frame.Listener.Generation==2&&frame.Vehicles[0].OperatingPoint==c.OperatingPoint,"next fresh source publishes without sequence fabrication");
            f=new Fixture();c=f.Candidate();baseline=f.Listener();baseline.Generation=2;baseline.VelocityKind="unavailable";f.Clock.Value=c.ValidThroughHostTicks+1;
            Check(!f.Emit(c,f.Peer(),baseline,out frame)&&f.Adapter.Retired,"private cut cannot conceal genuine source expiry");
            f=new Fixture();c=f.Candidate();baseline=f.Listener();baseline.Generation=2;baseline.VelocityKind="unavailable";baseline.ObservationTicks+=f.Frequency*51/1000;f.Clock.Value=baseline.ObservationTicks;
            Check(!f.Emit(c,f.Peer(),baseline,out frame)&&f.Adapter.Retired,"private cut cannot conceal original clock skew");
        });
        Test("retirement clears a previously emitted vehicle",delegate{
            var f=new Fixture();GameplayFrame frame;Check(f.Emit(f.Candidate(),f.Peer(),f.Listener(),out frame),"active");f.Adapter.Retire("source-stopped");
            Check(!f.Emit(f.Candidate(2),f.Peer(),f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"no resurrection");
            string why;Check(f.Adapter.TryCreateEmpty(f.Listener(),out frame,out why)&&GameplayWire.Decode(GameplayWire.Encode(frame,Fixture.Session),Fixture.Session).Vehicles.Length==0,"empty cleanup frame codec");
        });
        Test("stale native value cannot be refreshed by a new listener",delegate{
            var f=new Fixture();var c=f.Candidate();var peer=f.Peer();var listener=f.Listener();f.Clock.Value=c.ValidThroughHostTicks+1;listener.ObservationTicks=f.Clock.Value;GameplayFrame frame;
            Check(!f.Emit(c,peer,listener,out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"expired candidate absent despite fresh listener");
        });
        Test("stale listener yields no frame even after retirement",delegate{
            var f=new Fixture();var c=f.Candidate();var listener=f.Listener();f.Clock.Value+=f.Frequency;GameplayFrame frame;
            Check(!f.Emit(c,f.Peer(),listener,out frame)&&frame==null&&f.Adapter.Retired,"no stale listener publication");string why;
            Check(!f.Adapter.TryCreateEmpty(listener,out frame,out why)&&frame==null,"no synthetic cleanup timestamp");
        });
        Test("candidate from another source session is rejected",delegate{
            var f=new Fixture();var c=f.Candidate();var wrong=new ShvGameplayFrameAdapter("1123456789abcdef0123456789abcdef",1,f.Source.Scope,f.Clock);var listener=f.Listener();listener.Session="1123456789abcdef0123456789abcdef";
            GameplayFrame frame;ShvGameplayFrameAdapter.Lineage line;string why;Check(!wrong.TryCreate(c,f.Peer(),listener,out frame,out line,out why)&&frame.Vehicles.Length==0&&wrong.Retired,"cross-session candidate");
        });
        Test("source generation scope and frequency are all checked",delegate{
            var f=new Fixture();var c=f.Candidate();var bad=new ShvGameplayFrameAdapter(Fixture.Session,2,f.Source.Scope,f.Clock);GameplayFrame frame;ShvGameplayFrameAdapter.Lineage line;string why;
            Check(!bad.TryCreate(c,f.Peer(),f.Listener(),out frame,out line,out why)&&bad.Retired,"generation mismatch");
            var q=f.Source.Scope;var wrong=new H.Scope(q.GameVersion,q.GameSha256,q.ShvSha256,q.LoaderSha256,new String('0',64),q.Model,q.RphVersion,q.RphSha256);
            bad=new ShvGameplayFrameAdapter(Fixture.Session,1,wrong,f.Clock);Check(!bad.TryCreate(c,f.Peer(),f.Listener(),out frame,out line,out why)&&bad.Retired,"scope mismatch");
            var o=f.Last;var forged=new H.Candidate(o,c.MinimumHostTicks,c.MaximumHostTicks,c.ValidThroughHostTicks,f.Frequency+1);
            Check(!f.Emit(forged,f.Peer(),f.Listener(),out frame)&&f.Adapter.Retired,"clock-domain mismatch");
        });
        Test("old or changed peer pose cannot accompany a new raw value",delegate{
            var f=new Fixture();var c=f.Candidate();GameplayFrame frame;var original=f.Peer();Check(f.Emit(c,original,f.Listener(),out frame),"first");
            c=f.Candidate(2);var changed=HandoffPeerObservation.ForAdapterFixture(new object(),f.Last.HostPost);
            Check(!f.Emit(c,changed,f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"new sampler owner cannot rebind");
            f=new Fixture();c=f.Candidate();var old=f.Last.HostPost;old=new H.HostContext(old.PlayerId,old.PedId,old.VehicleId,old.CurrentVehicleId,old.DriverId,1,old.Model,true,true,old.StartTicks-f.Frequency,old.EndTicks-f.Frequency);
            Check(!f.Emit(c,HandoffPeerObservation.ForAdapterFixture(f.PeerOwner,old),f.Listener(),out frame)&&frame.Vehicles.Length==0,"old pose cannot look current");
        });
        Test("peer listener and mapped native full intervals obey50ms",delegate{
            var f=new Fixture();var c=f.Candidate();var listener=f.Listener();listener.ObservationTicks+=f.Frequency*51/1000;GameplayFrame frame;
            f.Clock.Value=listener.ObservationTicks;Check(!f.Emit(c,f.Peer(),listener,out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"skew beyond endpoint budget");
        });
        Test("raw float tampering and running zero are not playable observations",delegate{
            foreach(uint bits in new uint[]{0x7FC00000,0x00000000,0x3F800001}){
                var f=new Fixture();var c=f.Candidate();var o=f.Last;var bad=new H.Observation(o.SessionId,o.Generation,o.Sequence,o.SourceScope,o.Pre,o.Post,o.HostPre,o.HostPost,o.TargetBeforeTicks,o.TargetAfterTicks,bits,H.Decode(bits),true,"good");
                var forged=new H.Candidate(bad,c.MinimumHostTicks,c.MaximumHostTicks,c.ValidThroughHostTicks,f.Frequency);GameplayFrame frame;
                Check(!f.Emit(forged,f.Peer(),f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"malformed raw quantity absent");
            }
        });
        Test("existing gameplay vector validation cannot be bypassed",delegate{
            var f=new Fixture();var c=f.Candidate();var peer=HandoffPeerObservation.ForAdapterFixture(f.PeerOwner,f.Last.HostPost,new[]{1d,1d,0d});GameplayFrame frame;
            Check(!f.Emit(c,peer,f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"non-unit basis fails existing wire validation");
        });
        Test("paused synthetic or wrong-units listeners cannot publish native pose",delegate{
            for(int mode=0;mode<3;mode++){
                var f=new Fixture();var c=f.Candidate();var listener=f.Listener();if(mode==0)listener.Paused=true;
                if(mode==1){listener.ListenerKind="synthetic";listener.VelocityKind="authored-synthetic";}if(mode==2){listener.Coordinates="research-rh-z-up-metres-v1";listener.Units="metres";}
                GameplayFrame frame;Check(!f.Emit(c,f.Peer(),listener,out frame)&&frame==null&&f.Adapter.Retired,"independent real listener prerequisite");
            }
        });
        Test("source gaps and expiry during final validation fail closed",delegate{
            var f=new Fixture();var first=f.Candidate();var c=f.Candidate(2);GameplayFrame frame;
            Check(!f.Emit(c,f.Peer(),f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"unemitted first source observation cannot be skipped");
            f=new Fixture();c=f.Candidate();f.Clock.Calls=0;f.Clock.JumpAt=3;f.Clock.Jump=f.Frequency;
            Check(!f.Emit(c,f.Peer(),f.Listener(),out frame)&&frame.Vehicles.Length==0&&f.Adapter.Retired,"expiry rechecked at final use");Check(first.SourceSequence==1,"typed fixture retained");
        });
        Test("clock rollback clears a previously active vehicle",delegate{
            var f=new Fixture();GameplayFrame frame;Check(f.Emit(f.Candidate(),f.Peer(),f.Listener(),out frame),"active");f.Clock.Value--;
            string why;Check(!f.Adapter.TryCreateEmpty(f.Listener(),out frame,out why)&&frame==null,"backwards host clock fails closed");
        });
        Console.WriteLine("{\"passed\":true,\"cases\":"+cases+",\"assertions\":"+checks+",\"passiveOnly\":true,\"audioPlaybackAllowed\":false,\"gameLaunched\":false,\"endpointOpened\":false,\"casesPassed\":[\""+String.Join("\",\"",names.ToArray())+"\"]}");return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
