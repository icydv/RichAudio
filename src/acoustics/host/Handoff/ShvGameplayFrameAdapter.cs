using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    // Value adaptation only. This opens no pipe, endpoint, game API or audio
    // device. Its input must come from the owned composition, which establishes
    // binding and clock provenance. It cannot upgrade a candidate to live proof.
    internal sealed class ShvGameplayFrameAdapter
    {
        internal sealed class Lineage
        {
            internal readonly string SessionId,HostVehicleId;
            internal readonly long SourceGeneration,SourceSequence,SourceBeforeTicks,SourceAfterTicks;
            internal readonly long MinimumHostTicks,MaximumHostTicks,PeerStartTicks,PeerEndTicks;
            internal readonly long VehicleObservationTicks,ListenerObservationTicks,ValidThroughHostTicks,HostClockFrequency;
            internal readonly uint RawBits;
            internal readonly double OperatingPoint;
            internal Lineage(H.Candidate c,HandoffPeerObservation peer,ListenerState listener,long observed)
            {
                SessionId=c.SessionId;HostVehicleId=c.HostVehicleId;SourceGeneration=c.SourceGeneration;SourceSequence=c.SourceSequence;
                SourceBeforeTicks=c.SourceBeforeTicks;SourceAfterTicks=c.SourceAfterTicks;
                MinimumHostTicks=c.MinimumHostTicks;MaximumHostTicks=c.MaximumHostTicks;
                PeerStartTicks=peer.Context.StartTicks;PeerEndTicks=peer.Context.EndTicks;
                VehicleObservationTicks=observed;ListenerObservationTicks=listener.ObservationTicks;
                ValidThroughHostTicks=c.ValidThroughHostTicks;HostClockFrequency=c.HostClockFrequency;
                RawBits=c.RawBits;OperatingPoint=c.OperatingPoint;
            }
        }
        readonly object gate=new object();
        readonly string session;
        readonly long generation;
        readonly H.Scope scope;
        readonly IHandoffHostClock clock;
        HandoffPeerObservation originalPeer;
        long lastSourceSequence,lastNow=-1;
        bool retired;
        string retirementReason;
        internal ShvGameplayFrameAdapter(string sessionId,long sourceGeneration,H.Scope reviewedScope,IHandoffHostClock clock=null)
        {
            if(sessionId==null||!Regex.IsMatch(sessionId,"\\A[a-f0-9]{32}\\z")||sourceGeneration<=0||reviewedScope==null
                ||reviewedScope.Model!=H.BatiModel)throw new ArgumentException("owned adapter session/scope");
            this.clock=clock??StopwatchHandoffClock.Instance;
            if(this.clock.Frequency!=Stopwatch.Frequency)throw new ArgumentException("gameplay wire host clock domain");
            session=sessionId;generation=sourceGeneration;scope=reviewedScope;
        }
        internal bool PassiveOnly{get{return true;}}
        internal bool AudioPlaybackAllowed{get{return false;}}
        internal bool Retired{get{lock(gate)return retired;}}
        internal string RetirementReason{get{lock(gate)return retirementReason;}}
        internal void Retire(string why){lock(gate){if(!retired){retired=true;retirementReason=why??"adapter-retired";}}}
        static void Need(bool condition,string why){if(!condition)throw new InvalidDataException(why);}
        static bool SamePeer(HandoffPeerObservation a,HandoffPeerObservation b)
        {
            return Object.ReferenceEquals(a.SamplerOwner,b.SamplerOwner)&&H.SameHost(a.Context,b.Context)
                &&a.VehicleAddress==b.VehicleAddress&&a.PedAddress==b.PedAddress
                &&a.VehiclePoolIndex==b.VehiclePoolIndex&&a.VehiclePoolCounter==b.VehiclePoolCounter&&a.VehiclePoolValue==b.VehiclePoolValue
                &&a.PedPoolIndex==b.PedPoolIndex&&a.PedPoolCounter==b.PedPoolCounter&&a.PedPoolValue==b.PedPoolValue;
        }
        bool Listener(ListenerState input,out ListenerState value,out string reason)
        {
            value=null;reason=null;
            try{
                Protocol.Validate(input);long now=clock.Now;
                Need(now>=0&&now>=lastNow,"adapter-host-clock-discontinuity");lastNow=now;
                Need(input.Session==session&&input.ClockFrequency==clock.Frequency,"adapter-listener-domain");
                Need((input.ListenerKind=="camera"||input.ListenerKind=="player")&&input.Coordinates=="gta-native-unscaled"
                    &&input.Units=="native-unverified","adapter-listener-coordinate-provenance");
                Need(input.Valid&&!input.Paused,"adapter-listener-not-current");
                Need((decimal)now-input.ObservationTicks<=clock.Frequency*250/1000m
                    &&(decimal)input.ObservationTicks-now<=clock.Frequency*2/1000m,"adapter-listener-stale-or-future");
                value=Protocol.Copy(input);return true;
            }catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){reason=error is InvalidDataException?error.Message:"adapter-invalid-listener";return false;}
        }
        GameplayFrame Empty(ListenerState listener)
        {
            var frame=new GameplayFrame{Session=session,Listener=listener,Vehicles=new GameplayVehicle[0]};
            GameplayWire.Validate(frame,session);return frame;
        }
        internal bool TryCreateEmpty(ListenerState listener,out GameplayFrame frame,out string reason)
        {
            lock(gate){frame=null;ListenerState current;if(!Listener(listener,out current,out reason))return false;
                frame=Empty(current);return true;}
        }
        internal bool TryCreate(H.Candidate candidate,HandoffPeerObservation peer,ListenerState listener,
            out GameplayFrame frame,out Lineage lineage,out string reason)
        {
            lock(gate){
                frame=null;lineage=null;ListenerState current;
                if(!Listener(listener,out current,out reason)){Retire(reason);return false;}
                frame=Empty(current);
                if(retired){reason=retirementReason;return false;}
                try{
                    Need(candidate!=null&&peer!=null,"adapter-missing-owned-observation");
                    Need(candidate.SessionId==session&&candidate.SourceGeneration==generation&&H.SameScope(candidate.Scope,scope),"adapter-source-domain");
                    Need(candidate.HostClockFrequency==clock.Frequency,"adapter-candidate-clock-domain");
                    long now=clock.Now;
                    Need(now>=lastNow,"adapter-host-clock-discontinuity");lastNow=now;
                    Need(now<=candidate.ValidThroughHostTicks,"adapter-candidate-expired");
                    Need(candidate.MinimumHostTicks>=0&&candidate.MaximumHostTicks>=candidate.MinimumHostTicks
                        &&(decimal)now-candidate.MinimumHostTicks<=clock.Frequency*250/1000m
                        &&(decimal)candidate.MaximumHostTicks-now<=clock.Frequency*2/1000m,"adapter-native-stale-or-future");
                    Need(candidate.SourceSequence>0&&candidate.SourceSequence<=2400,"adapter-source-sequence");
                    if(candidate.SourceSequence==lastSourceSequence){reason="adapter-no-new-source-observation";return false;}
                    Need(candidate.SourceSequence==lastSourceSequence+1,"adapter-source-sequence");
                    Need(H.ValidHost(peer.Context)&&peer.Context.VehicleId==candidate.HostVehicleId
                        &&peer.Context.Generation==candidate.HostVehicleGeneration,"adapter-peer-identity");
                    Need(peer.VehicleAddress!=0&&peer.PedAddress!=0&&(originalPeer==null||SamePeer(originalPeer,peer)),"adapter-peer-lifetime");
                    long start=peer.Context.StartTicks,end=peer.Context.EndTicks;
                    Need(start>=0&&end>=start&&(decimal)now-start<=clock.Frequency*250/1000m
                        &&(decimal)end-now<=clock.Frequency*2/1000m,"adapter-peer-stale-or-future");
                    decimal skew=clock.Frequency*50/1000m;
                    Need(Math.Abs((decimal)start-current.ObservationTicks)<=skew&&Math.Abs((decimal)end-current.ObservationTicks)<=skew
                        &&Math.Abs((decimal)candidate.MinimumHostTicks-current.ObservationTicks)<=skew
                        &&Math.Abs((decimal)candidate.MaximumHostTicks-current.ObservationTicks)<=skew
                        &&Math.Abs((decimal)start-candidate.MaximumHostTicks)<=skew
                        &&Math.Abs((decimal)end-candidate.MinimumHostTicks)<=skew,"adapter-peer-listener-native-skew");
                    Need(candidate.Scope.Model==H.BatiModel&&Protocol.Finite(candidate.OperatingPoint)&&candidate.OperatingPoint>0
                        &&candidate.OperatingPoint<=1&&candidate.OperatingPoint==H.Decode(candidate.RawBits),"adapter-raw-float32");
                    // The wire carries the actual peer acquisition midpoint, never
                    // the current call time. The raw native/map interval is retained
                    // independently in Lineage and bounded against this pose.
                    long observed=start+(end-start)/2;
                    var vehicle=new GameplayVehicle{Id=peer.Context.VehicleId,Generation=peer.Context.Generation,
                        ObservationTicks=observed,Model=H.BatiModel,Context="player",Position=peer.Position,Velocity=peer.Velocity,
                        Forward=peer.Forward,Up=peer.Up,OperatingPoint=candidate.OperatingPoint,Running=true,Valid=true,
                        RiderAttached=true}; // This scope requires the same current player driver.
                    var output=new GameplayFrame{Session=session,Listener=current,Vehicles=new[]{vehicle},ValidThroughTicks=candidate.ValidThroughHostTicks};
                    GameplayWire.Validate(output,session);
                    // Validation and cloning take time too; expiry is checked at
                    // publication, and no previously emitted row can be reused.
                    long finish=clock.Now;
                    Need(finish>=now&&finish<=candidate.ValidThroughHostTicks,"adapter-expired-during-use");lastNow=finish;
                    frame=output;lineage=new Lineage(candidate,peer,current,observed);
                    if(originalPeer==null)originalPeer=peer;lastSourceSequence=candidate.SourceSequence;
                    reason="passive-new-source-observation";return true;
                }catch(System.Threading.ThreadAbortException){throw;}
                catch(Exception error){reason=error is InvalidDataException?error.Message:"adapter-invalid-observation";Retire(reason);return false;}
            }
        }
    }
}
