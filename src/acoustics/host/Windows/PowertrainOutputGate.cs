using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Windows
{
    // A single pipe reader owns admission. The output thread alone applies a revision
    // after flushing its endpoint and acknowledges PCM only after successful submission.
    internal sealed class PowertrainOutputGate
    {
        internal sealed class Command
        {
            internal readonly long Revision;
            internal readonly string Mode;
            internal Command(long revision, string mode) { Revision=revision; Mode=mode; }
        }
        readonly PowertrainStamp[] history=new PowertrainStamp[256];
        readonly Command initial=new Command(0,null);
        Command requested, sink, applied;
        string id;
        long generation, observation=-1, observedAt, expires, renderedObservation=-1, renderedBlocks;
        long submittedFrames, submittedObservation=-1, lastSubmitted, lastCallback, maxCallbackGap;
        long maximumObservationAge, discarded, stalePcmFrames;
        double submittedOperatingPoint, outputPeak;

        internal PowertrainOutputGate() { requested=sink=applied=initial; }
        internal Command Requested { get { return Volatile.Read(ref requested); } }
        internal bool NeedsBoundary(Command next) { return sink!=next; }
        internal bool Withdrawn { get { return Volatile.Read(ref applied).Mode=="withdraw"; } }
        internal bool Expired(long now)
        {
            long deadline=Interlocked.Read(ref expires);
            return deadline!=0 && now>=deadline && Requested.Mode!="withdraw";
        }
        internal void Accept(GameplayFrame frame,long now)
        {
            var command=Requested;
            long revision=frame.PowertrainRevision;
            string mode=frame.PowertrainGate;
            bool withdraw=mode=="withdraw";
            if(revision!=command.Revision||mode!=command.Mode){
                bool allowed=withdraw || (command.Mode==null ? mode=="prepare" :
                    command.Mode=="prepare"||command.Mode=="mute" ? mode=="voice" : command.Mode=="voice" && mode=="mute");
                // The single-slot sender can replace an unconsumed gain change
                // with a terminal withdrawal. It can only skip toward silence.
                bool validRevision=withdraw?revision>command.Revision:revision==command.Revision+1;
                if(!allowed||command.Mode=="withdraw"||!validRevision)
                    throw new InvalidDataException("powertrain gate revision or transition");
            }
            if(!withdraw){
                if(Expired(now)||frame.ValidThroughTicks<=now||frame.Listener.ClockFrequency!=Stopwatch.Frequency||
                    !frame.Listener.Valid||frame.Listener.Paused||frame.Vehicles.Length!=1||
                    frame.OperatingPointEvidence!="shvdne-enhanced-native-F9DDA40BC293A61E")
                    throw new InvalidDataException("fresh player ADDER telemetry and rev-ratio provenance required");
                var car=frame.Vehicles[0];
                if(!car.Valid||!car.Running||car.Context!="player"||car.Model!=0xb779a091u||
                    id!=null&&(id!=car.Id||generation!=car.Generation)||frame.Listener.Sequence<=observation||
                    frame.Listener.Sequence>=UInt32.MaxValue)
                    throw new InvalidDataException("running ADDER lifetime or observation chronology changed");
                id=car.Id;generation=car.Generation;
                long seq=frame.Listener.Sequence;
                Volatile.Write(ref history[seq%history.Length],new PowertrainStamp(revision,seq,
                    frame.ValidThroughTicks,car.ObservationTicks,car.OperatingPoint));
                Interlocked.Exchange(ref observedAt,frame.Listener.ObservationTicks);
                Interlocked.Exchange(ref observation,seq);
                Interlocked.Exchange(ref expires,frame.ValidThroughTicks);
            }
            if(command.Revision!=revision)Volatile.Write(ref requested,new Command(revision,mode));
        }
        internal PowertrainStamp Rendered(uint tag)
        {
            if(tag==0)return null;
            long sequence=(long)tag-1;
            var found=Volatile.Read(ref history[sequence%history.Length]);
            if(found==null||found.Sequence!=sequence)return null;
            Interlocked.Exchange(ref renderedObservation,sequence);
            Interlocked.Increment(ref renderedBlocks);
            return found;
        }
        // Called only on the output thread, after Stop/Reset/prime/Start succeeded.
        internal void BoundaryComplete(Command command)
        {
            sink=command;
            if(command.Mode=="withdraw"||command.Mode=="mute"){
                outputPeak=0;
                Volatile.Write(ref applied,command);
            }
        }
        internal unsafe int Fill(PcmRing ring,float* data,int frames,out PowertrainSubmission submission)
        {
            long now=Stopwatch.GetTimestamp();
            bool current=sink==Requested&&!Expired(now);
            return ring.FillPowertrain(data,frames,current&&sink.Mode=="voice"?1:0,
                current?sink.Revision:0,now,out submission);
        }
        internal void Submitted(PowertrainSubmission result)
        {
            long now=Stopwatch.GetTimestamp();
            if(lastCallback!=0)maxCallbackGap=Math.Max(maxCallbackGap,now-lastCallback);
            lastCallback=now;
            discarded+=result.Discarded;
            stalePcmFrames+=result.Stale;
            outputPeak=result.Peak;
            if(result.Source==null||sink!=Requested||Expired(now)||result.Source.Revision!=sink.Revision)return;
            submittedFrames+=result.Qualified;
            submittedObservation=result.Source.Sequence;
            submittedOperatingPoint=result.Source.OperatingPoint;
            lastSubmitted=now;
            maximumObservationAge=Math.Max(maximumObservationAge,now-result.Source.ObservedAt);
            if(sink.Mode=="prepare"||sink.Mode=="voice"&&result.Peak>0)Volatile.Write(ref applied,sink);
        }
        internal object Status(string session,int hostPid,bool fixture,bool endpointStarted,long underflow,string failure)
        {
            var ack=Volatile.Read(ref applied);
            return new {session,hostPid,fixture,endpointStarted,mode=ack.Mode,appliedRevision=ack.Revision,
                vehicleId=id,observationSequence=Interlocked.Read(ref observation),observedQpc=Interlocked.Read(ref observedAt),
                renderedBlocks=Interlocked.Read(ref renderedBlocks),renderedObservationSequence=Interlocked.Read(ref renderedObservation),
                submittedObservationSequence=Interlocked.Read(ref submittedObservation),submittedFrames=Interlocked.Read(ref submittedFrames),
                lastSubmittedQpc=Interlocked.Read(ref lastSubmitted),submittedOperatingPoint=Volatile.Read(ref submittedOperatingPoint),
                outputPeak=Volatile.Read(ref outputPeak),discardedFrames=Interlocked.Read(ref discarded),stalePcmFrames=Interlocked.Read(ref stalePcmFrames),
                maxCallbackGapMs=Interlocked.Read(ref maxCallbackGap)*1000d/Stopwatch.Frequency,
                maxSubmittedObservationAgeMs=Interlocked.Read(ref maximumObservationAge)*1000d/Stopwatch.Frequency,
                underflowFrames=underflow,publicationQpc=Stopwatch.GetTimestamp(),qpcFrequency=Stopwatch.Frequency,failure};
        }
    }
}
