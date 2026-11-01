using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace RichAudio.Beacon.Handoff
{
    // The RPH-only partial factory captures actual retained SDK wrappers on the
    // game fiber. No public DTO constructor or authenticated/eligible flag issues
    // this witness. Fixture factories are compiled only into explicit test hosts.
    internal sealed partial class HandoffPeerObservation
    {
        internal readonly ShvOperatingStateHandoff.HostContext Context;
        internal readonly object SamplerOwner;
        internal readonly ulong VehicleAddress,PedAddress;
        internal readonly uint VehiclePoolIndex,VehiclePoolValue,PedPoolIndex,PedPoolValue;
        internal readonly byte VehiclePoolCounter,PedPoolCounter;
        readonly double[] position,velocity,forward,up;
        internal double[] Position{get{return (double[])position.Clone();}}
        internal double[] Velocity{get{return (double[])velocity.Clone();}}
        internal double[] Forward{get{return (double[])forward.Clone();}}
        internal double[] Up{get{return (double[])up.Clone();}}
        private HandoffPeerObservation(object samplerOwner,ShvOperatingStateHandoff.HostContext context,
            ulong vehicleAddress,ulong pedAddress,uint vehiclePoolIndex,byte vehiclePoolCounter,uint vehiclePoolValue,
            uint pedPoolIndex,byte pedPoolCounter,uint pedPoolValue,double[] position,double[] velocity,double[] forward,double[] up)
        {
            if(samplerOwner==null||context==null)throw new ArgumentException("owned peer witness");
            SamplerOwner=samplerOwner;Context=context;VehicleAddress=vehicleAddress;PedAddress=pedAddress;
            VehiclePoolIndex=vehiclePoolIndex;VehiclePoolCounter=vehiclePoolCounter;VehiclePoolValue=vehiclePoolValue;
            PedPoolIndex=pedPoolIndex;PedPoolCounter=pedPoolCounter;PedPoolValue=pedPoolValue;
            this.position=Copy(position);this.velocity=Copy(velocity);this.forward=Copy(forward);this.up=Copy(up);
        }
        static double[] Copy(double[] values)
        {
            if(values==null||values.Length!=3)throw new ArgumentException("peer pose vector");
            foreach(double value in values)if(Double.IsNaN(value)||Double.IsInfinity(value)||Math.Abs(value)>100000)
                throw new ArgumentException("peer pose value");
            return (double[])values.Clone();
        }
    }

    // Policy selection is made by the reviewed host composition. A producer or
    // deserialized message cannot turn the still-pending identity decision on.
    internal enum HandoffBindingProofMode
    {
        Pending=0,
        ReadOnlySdkOrdinaryReuse=1
    }
    internal sealed class ShvConsumedAuditRow
    {
        internal readonly long Ordinal;
        internal readonly ShvAbi.ReadReply Reply;
        internal ShvConsumedAuditRow(long ordinal,ShvAbi.ReadReply reply){Ordinal=ordinal;Reply=reply;}
    }

    // An owned passive-candidate composition, not a live handoff acceptance or
    // an audio activation gate. Source and clock witnesses come from actual
    // verified module calls. RPH peer witnesses come from the RPH-only factory.
    internal sealed class TrustedShvComposition:IDisposable
    {
        readonly object gate=new object(),issuer=new object();
        readonly ShvProducerModule module;
        readonly HandoffBindingProofMode mode;
        readonly ShvOperatingStateHandoff.SourceCapability source;
        readonly ShvOperatingStateHandoff validator;
        readonly ShvClockCalibration calibration;
        readonly ShvHandoffConsumer consumer;
        struct AuditSlot
        {
            internal readonly long Ordinal;
            internal readonly ShvAbi.ReadReply Reply;
            internal AuditSlot(long ordinal,ShvAbi.ReadReply reply){Ordinal=ordinal;Reply=reply;}
        }
        readonly Queue<AuditSlot> audit=new Queue<AuditSlot>(128);
        ShvOperatingStateHandoff.ClockCapability clock;
        ShvMeasuredClockMap measuredMap;
        ShvOperatingStateHandoff.BindingCapability binding;
        ShvAbi.ContextReply waiting;
        HandoffPeerObservation originalPeer,acceptedPeer;
        ShvAbi.Context originalSource;
        ShvAbi.Record? pendingReturn;
        ShvAbi.ReadReply lastReply;
        long lastClockPoll=-1;
        long recordsRead;
        bool lastPollHadRecord;
        bool begun,disposed,retired;
        string reason;
        internal TrustedShvComposition(ShvProducerModule module,HandoffBindingProofMode mode)
        {
            if(module==null||module.SessionId==null)throw new ArgumentException("opened verified source module");
            this.module=module;this.mode=mode;
            source=new ShvOperatingStateHandoff.SourceCapability(issuer,module.Review.Scope,module.SessionId,module.Generation,
                module.Description.Frequency,module.HostFrequency);
            validator=new ShvOperatingStateHandoff(issuer,source);calibration=module.NewClockCalibration();
            consumer=new ShvHandoffConsumer(validator,StopwatchHandoffClock.Instance);
        }
        internal bool LiveHandoffReady{get{return false;}}
        internal bool Retired{get{lock(gate)return retired||consumer.Retired;}}
        internal string Reason{get{lock(gate)return reason??consumer.RetirementReason;}}
        internal long AcceptedCount{get{return consumer.AcceptedCount;}}
        internal int ClockAnchors{get{lock(gate)return calibration.AnchorsObserved;}}
        internal bool ClockReady{get{lock(gate)return clock!=null&&!Retired;}}
        internal ShvMeasuredClockMap MeasuredClockMap{get{lock(gate)return measuredMap;}}
        internal ShvAbi.ReadReply LastReadReply{get{lock(gate)return lastReply;}}
        internal long RecordsRead{get{lock(gate)return recordsRead;}}
        internal bool LastPollHadRecord{get{lock(gate)return lastPollHadRecord;}}
        internal int PendingAuditCount{get{lock(gate)return audit.Count;}}
        internal bool TryPeekAudit(out ShvConsumedAuditRow row){lock(gate){
            row=null;if(audit.Count==0)return false;var slot=audit.Peek();row=new ShvConsumedAuditRow(slot.Ordinal,slot.Reply);return true;
        }}
        internal bool AcknowledgeAudit(long ordinal){lock(gate){
            if(audit.Count==0||audit.Peek().Ordinal!=ordinal){RetireOwned("audit-ack-order");return false;}
            audit.Dequeue();return true;
        }}
        internal ShvAbi.Record? PartialReturn{get{lock(gate)return pendingReturn;}}
        internal string SessionId{get{return source.SessionId;}}
        internal long SourceGeneration{get{return source.Generation;}}
        static void Need(bool condition,string why){if(!condition)throw new InvalidDataException(why);}
        void RetireOwned(string why){if(retired)return;retired=true;reason=why;binding=null;acceptedPeer=null;consumer.Invalidate(why);}
        internal void Retire(string why){lock(gate)RetireOwned(why);}
        internal bool ObserveClock()
        {
            lock(gate){
                if(disposed||retired||consumer.Retired)return false;
                long now=StopwatchHandoffClock.Instance.Now;
                if(lastClockPoll>=0&&(decimal)now-lastClockPoll<(decimal)source.HostFrequency*50/1000)return clock!=null;
                try{
                    var witness=module.MeasureClock();lastClockPoll=witness.HostAfter;
                    Need(module.Owns(witness),"clock-witness-owner");
                    if(!calibration.Add(witness)){RetireOwned(calibration.Failure);return false;}
                    ShvMeasuredClockMap map;string pending;
                    if(!calibration.TryMap(witness.HostAfter,out map,out pending)){
                        if(calibration.Failure!=null)RetireOwned(calibration.Failure);return false;
                    }
                    Need(module.Owns(map),"clock-map-owner");measuredMap=map;
                    clock=new ShvOperatingStateHandoff.ClockCapability(issuer,source,map.SourceFrequency,map.HostFrequency,
                        map.SourceAnchor,map.HostBefore,map.HostAfter,map.Expires,map.DriftPpm);return true;
                }catch(System.Threading.ThreadAbortException){throw;}
                catch{RetireOwned("clock-access-or-calibration-failed");return false;}
            }
        }
        static bool SamePool(HandoffPeerObservation a,HandoffPeerObservation b)
        {
            return a!=null&&b!=null&&Object.ReferenceEquals(a.SamplerOwner,b.SamplerOwner)
                &&a.VehicleAddress==b.VehicleAddress&&a.PedAddress==b.PedAddress
                &&a.VehiclePoolIndex==b.VehiclePoolIndex&&a.VehiclePoolCounter==b.VehiclePoolCounter&&a.VehiclePoolValue==b.VehiclePoolValue
                &&a.PedPoolIndex==b.PedPoolIndex&&a.PedPoolCounter==b.PedPoolCounter&&a.PedPoolValue==b.PedPoolValue
                &&ShvOperatingStateHandoff.SameHost(a.Context,b.Context);
        }
        static bool PoseValid(HandoffPeerObservation p)
        {
            double[] forward=p.Forward,up=p.Up,velocity=p.Velocity;double f=0,u=0,dot=0,speed=0;
            for(int i=0;i<3;i++){f+=forward[i]*forward[i];u+=up[i]*up[i];dot+=forward[i]*up[i];speed+=velocity[i]*velocity[i];}
            return Math.Abs(Math.Sqrt(f)-1)<0.0001&&Math.Abs(Math.Sqrt(u)-1)<0.0001&&Math.Abs(dot)<0.0001&&Math.Sqrt(speed)<=100;
        }
        void CheckCorrespondence(ShvAbi.Context pre,ShvAbi.Context post,HandoffPeerObservation peerPre,HandoffPeerObservation peerPost,bool initial)
        {
            Need(mode==HandoffBindingProofMode.ReadOnlySdkOrdinaryReuse,"binding-policy-pending");
            Need(pre.Flags==15&&post.Flags==15&&pre.ReservedZero&&post.ReservedZero,"source-context-proof-incomplete");
            Need(ShvOperatingStateHandoff.ValidShv(pre.ToContext())&&ShvOperatingStateHandoff.ValidShv(post.ToContext()),"source-current-driver-scope");
            Need(peerPre!=null&&peerPost!=null&&ShvOperatingStateHandoff.ValidHost(peerPre.Context)
                &&ShvOperatingStateHandoff.ValidHost(peerPost.Context)&&SamePool(peerPre,peerPost),"independent-peer-lifetime-or-driver");
            Need(module.OwnsPeer(peerPre)&&module.OwnsPeer(peerPost),"reviewed-RPH-caller-witness-owner");
            Need(PoseValid(peerPre)&&PoseValid(peerPost),"independent-peer-pose");
            // Compare supported opaque addresses only. SHV handle integers are
            // checked solely within SHV; RPH PoolHandle fields solely within RPH.
            Need(pre.VehicleAddress!=0&&pre.PedAddress!=0&&pre.VehicleAddress==post.VehicleAddress&&pre.PedAddress==post.PedAddress
                &&pre.VehicleAddress==peerPre.VehicleAddress&&pre.PedAddress==peerPre.PedAddress,"opaque-entity-correspondence");
            Need(ShvOperatingStateHandoff.SameShv(pre.ToContext(),post.ToContext()),"source-identity-bracket");
            if(!initial)Need(SamePool(originalPeer,peerPre)&&ShvOperatingStateHandoff.SameShv(originalSource.ToContext(),pre.ToContext())
                &&originalSource.VehicleAddress==pre.VehicleAddress&&originalSource.PedAddress==pre.PedAddress,"observed-instance-lifetime-changed");
        }
        ShvOperatingStateHandoff.BindingCapability BindInterval(ShvAbi.Context context,HandoffPeerObservation pre,HandoffPeerObservation post,long sourceEnd)
        {
            long now=StopwatchHandoffClock.Instance.Now,low=0,high=0;
            Need(clock!=null&&now<=clock.ExpiresTicks&&ShvOperatingStateHandoff.Map(clock,context.StartQpc,sourceEnd,out low,out high),"measured-clock-map-required");
            Need(pre.Context.StartTicks>=0&&post.Context.EndTicks>=pre.Context.StartTicks
                &&pre.Context.EndTicks>=pre.Context.StartTicks&&post.Context.StartTicks>=pre.Context.EndTicks
                &&post.Context.EndTicks>=post.Context.StartTicks,"peer-acquisition-order");
            decimal frequency=source.HostFrequency;
            Need((decimal)now-low<=frequency*250/1000&&(decimal)high-now<=frequency*2/1000
                &&(decimal)now-pre.Context.StartTicks<=frequency*250/1000&&(decimal)post.Context.EndTicks-now<=frequency*2/1000,"binding-witness-freshness");
            Need(Math.Max(Math.Abs((decimal)post.Context.EndTicks-low),Math.Abs((decimal)high-pre.Context.StartTicks))*1000/frequency<=50,"binding-peer-interval-skew");
            long from=Math.Min(low,pre.Context.StartTicks);decimal end=(decimal)from+frequency*5000/1000;
            long through=(long)Math.Min(end,clock.ExpiresTicks);Need(through>=high&&through>=post.Context.EndTicks,"binding-interval-coverage");
            return new ShvOperatingStateHandoff.BindingCapability(issuer,source,context.ToContext(),pre.Context,from,through);
        }
        internal bool TryBind(HandoffPeerObservation peerPre,ShvAbi.ContextReply sourceWaiting,HandoffPeerObservation peerPost)
        {
            lock(gate){
                if(disposed||retired||begun||consumer.Retired)return false;
                try{
                    Need(module.OwnsWaiting(sourceWaiting),"waiting-context-witness-owner");
                    CheckCorrespondence(sourceWaiting.Context,sourceWaiting.Context,peerPre,peerPost,originalPeer==null);
                    binding=BindInterval(sourceWaiting.Context,peerPre,peerPost,sourceWaiting.Context.EndQpc);
                    if(originalPeer==null){originalPeer=peerPre;originalSource=sourceWaiting.Context;}
                    waiting=sourceWaiting;return true;
                }catch(System.Threading.ThreadAbortException){throw;}
                catch(InvalidDataException error){RetireOwned(error.Message);return false;}
                catch{RetireOwned(mode==HandoffBindingProofMode.Pending?"binding-policy-pending":"independent-binding-failed");return false;}
            }
        }
        internal bool Begin()
        {
            lock(gate){
                if(disposed||retired||begun||consumer.Retired||binding==null||clock==null)return false;
                try{module.Begin(waiting);consumer.StartExpecting();begun=true;return true;}
                catch(System.Threading.ThreadAbortException){throw;}
                catch{RetireOwned("producer-begin-failed");return false;}
            }
        }
        internal bool Poll(Func<HandoffPeerObservation> captureOnGameFiber)
        {
            if(captureOnGameFiber==null)throw new ArgumentNullException("captureOnGameFiber");
            lock(gate){lastPollHadRecord=false;if(disposed||retired||!begun||consumer.Retired)return false;
                if(audit.Count>=128){RetireOwned("audit-queue-full");return false;}}
            // Capture callbacks run only on this caller's game fiber and outside
            // locks. The independent expiry worker never invokes them.
            HandoffPeerObservation before,after;ShvAbi.ReadReply reply=new ShvAbi.ReadReply();ShvAbi.Code code=ShvAbi.Code.Unavailable;
            try{
                before=captureOnGameFiber();
                RuntimeHelpers.PrepareConstrainedRegions();
                try{}
                finally{
                    // Ordinary CLR ThreadAbort is deferred through both the
                    // fixed C ABI pop and publication into preallocated value
                    // storage. No game getter runs inside this region. Fatal
                    // process failure/OOM/native stalls are not made recoverable.
                    code=module.ReadNext(out reply);
                    lock(gate){lastReply=reply;if(code==ShvAbi.Code.Ok){lastPollHadRecord=true;recordsRead++;audit.Enqueue(new AuditSlot(recordsRead,reply));}}
                }
                after=captureOnGameFiber();
            }
            catch(System.Threading.ThreadAbortException){throw;}
            catch{Retire("producer-or-peer-observation-failed");return false;}
            lock(gate){
                if(disposed)return false;
                if(retired||consumer.Retired)return false;
                try{
                    module.ValidateRead(code,reply);
                    Need(before!=null&&after!=null&&SamePool(originalPeer,before)&&SamePool(before,after),"independent-peer-lifetime-changed");
                    Need(ShvOperatingStateHandoff.ValidHost(before.Context)&&ShvOperatingStateHandoff.ValidHost(after.Context),"independent-peer-scope-lost");
                    if(code==ShvAbi.Code.Busy)return false;
                    Need(reply.State!=ShvAbi.State.Retired&&reply.Terminal==0,"producer-retired-or-failed");
                    if(code==ShvAbi.Code.Empty)return false;
                    Need(reply.State==ShvAbi.State.Active,"producer-record-outside-active-state");
                    var row=reply.Record;
                    Need(row.Kind!=ShvAbi.Kind.Terminal&&row.Terminal==0&&row.ExceptionCode==0&&row.FailedNative==0,"producer-terminal-row");
                    Need(row.Sequence==(ulong)consumer.AcceptedCount+1&&row.Sequence<=2400,"producer-attempt-sequence");
                    if(row.Kind==ShvAbi.Kind.TargetReturn){Need(!pendingReturn.HasValue,"return-without-completed-context");pendingReturn=row;return false;}
                    Need(pendingReturn.HasValue,"missing-immediate-target-return");var returned=pendingReturn.Value;
                    Need(returned.Sequence==row.Sequence&&returned.RawBits==row.RawBits&&returned.RawFloat32.Equals(row.RawFloat32)
                        &&returned.ReadStatus==row.ReadStatus&&returned.TargetBeforeQpc==row.TargetBeforeQpc&&returned.TargetAfterQpc==row.TargetAfterQpc,"raw-return-final-mismatch");
                    pendingReturn=null;Need((row.Flags&63)==63&&(row.Flags&192)==0&&row.ReadStatus==ShvAbi.ReadStatus.Good,"incomplete-target-record");
                    CheckCorrespondence(row.Pre,row.Post,before,after,false);
                    binding=BindInterval(row.Pre,before,after,row.Post.EndQpc);
                    var observation=new ShvOperatingStateHandoff.Observation(source.SessionId,source.Generation,(long)row.Sequence,source.Scope,
                        row.Pre.ToContext(),row.Post.ToContext(),before.Context,after.Context,row.TargetBeforeQpc,row.TargetAfterQpc,
                        row.RawBits,(double)row.RawFloat32,(row.Flags&2)!=0,"good");
                    bool accepted=consumer.Submit(observation,binding,clock);if(accepted)acceptedPeer=after;
                    else RetireOwned(consumer.RetirementReason??"validator-rejected");return accepted;
                }catch(System.Threading.ThreadAbortException){throw;}
                catch(InvalidDataException error){RetireOwned(error.Message);return false;}
                catch{RetireOwned("source-stream-or-correspondence-failed");return false;}
            }
        }
        internal bool TryGetCurrent(out ShvOperatingStateHandoff.Candidate candidate)
        {return consumer.TryGetCurrent(out candidate);}
        internal bool TryGetCurrent(out ShvOperatingStateHandoff.Candidate candidate,out HandoffPeerObservation peer)
        {lock(gate){peer=null;if(!consumer.TryGetCurrent(out candidate)||acceptedPeer==null)return false;peer=acceptedPeer;return true;}}
        public void Dispose()
        {lock(gate){if(disposed)return;RetireOwned("composition-stopped");disposed=true;}try{module.Stop();}finally{consumer.Dispose();module.Dispose();}}
    }
}
