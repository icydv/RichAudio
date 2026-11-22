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
        readonly AudibleContinuity audible = new AudibleContinuity();
        long initialVoiceRevision;
        readonly AudibleContinuity initialAudible = new AudibleContinuity();
        readonly AudibleContinuity resumed = new AudibleContinuity();
        readonly AudibleContinuity resumedSteady = new AudibleContinuity();

        internal PowertrainOutputGate() { requested=sink=applied=initial; }
        internal Command Requested { get { return Volatile.Read(ref requested); } }
        internal bool NeedsBoundary(Command next) { return sink!=next; }
        internal bool Withdrawn { get { return Volatile.Read(ref applied).Mode=="withdraw"; } }
        // A cold host can receive an observation queued during its own startup.
        // Consume it without admitting any source or extending its deadline.
        internal bool ExpiredBeforeFirstPrepare(GameplayFrame frame, long now)
        {
            return Requested.Revision == 0 && frame.PowertrainGate == "prepare" &&
                frame.PowertrainRevision == 1 && frame.ValidThroughTicks > 0 && frame.ValidThroughTicks <= now;
        }
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
            if(withdraw&&frame.Vehicles.Length!=0)throw new InvalidDataException("powertrain withdrawal must carry no audio contributors");
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
            if(command.Mode=="mute")outputPeak=0;
            if(command.Mode=="withdraw"){
                outputPeak=0;
                Volatile.Write(ref applied,command);
            }
        }
        internal unsafe int Fill(PcmRing ring,float* data,int frames,out PowertrainSubmission submission)
        {
            long now=Stopwatch.GetTimestamp();
            var suppression = sink != Requested ? PowertrainGapCause.GainBoundaryPending :
                Expired(now) ? PowertrainGapCause.SourceLeaseExpired : PowertrainGapCause.None;
            return ring.FillPowertrain(data,frames,sink.Mode=="voice"?1:0,
                sink.Revision,now,out submission,sink.Mode=="voice",suppression);
        }
        internal void Submitted(PowertrainSubmission result)
        {
            long now=Stopwatch.GetTimestamp();
            if(lastCallback!=0)maxCallbackGap=Math.Max(maxCallbackGap,now-lastCallback);
            lastCallback=now;
            discarded+=result.Discarded;
            stalePcmFrames+=result.Stale;
            outputPeak=result.Peak;
            if (result.Audible)
            {
                if (initialVoiceRevision == 0) initialVoiceRevision = sink.Revision;
                audible.Record(sink.Revision, result);
                (sink.Revision == initialVoiceRevision ? initialAudible : resumed).Record(sink.Revision, result);
                if (sink.Revision != initialVoiceRevision && sink == Volatile.Read(ref applied))
                    resumedSteady.Record(sink.Revision, result);
            }
            if(result.Source==null||sink!=Requested||Expired(now)||result.Source.Revision!=sink.Revision)return;
            submittedFrames+=result.Qualified;
            submittedObservation=result.Source.Sequence;
            submittedOperatingPoint=result.Source.OperatingPoint;
            lastSubmitted=now;
            maximumObservationAge=Math.Max(maximumObservationAge,now-result.Source.ObservedAt);
            if(sink.Mode=="prepare"||sink.Mode=="mute"||sink.Mode=="voice"&&result.Peak>0)Volatile.Write(ref applied,sink);
        }
        internal object Status(string session,int hostPid,bool fixture,bool endpointStarted,long underflow,string failure)
        {
            var ack=Volatile.Read(ref applied);
            // The existing bridge reads at most 8 KiB. Keep even an arbitrary
            // endpoint error bounded when JSON escaping increases its length.
            if (failure != null && failure.Length > 256) failure = failure.Substring(0,256);
            // These counts start after the output worker has completed the gain
            // boundary. The explicit endpoint reset/silence prime is separate.
            return new {session,hostPid,fixture,endpointStarted,mode=ack.Mode,appliedRevision=ack.Revision,
                vehicleId=id,observationSequence=Interlocked.Read(ref observation),observedQpc=Interlocked.Read(ref observedAt),
                renderedBlocks=Interlocked.Read(ref renderedBlocks),renderedObservationSequence=Interlocked.Read(ref renderedObservation),
                submittedObservationSequence=Interlocked.Read(ref submittedObservation),submittedFrames=Interlocked.Read(ref submittedFrames),
                lastSubmittedQpc=Interlocked.Read(ref lastSubmitted),submittedOperatingPoint=Volatile.Read(ref submittedOperatingPoint),
                outputPeak=Volatile.Read(ref outputPeak),discardedFrames=Interlocked.Read(ref discarded),stalePcmFrames=Interlocked.Read(ref stalePcmFrames),
                audibleFrames = Interlocked.Read(ref audible.Frames),
                audibleSubstitutedFrames = Interlocked.Read(ref audible.Substituted),
                audibleLongestGapFrames = Interlocked.Read(ref audible.LongestFrames),
                audibleLongestGapCauses = ((PowertrainGapCause)Volatile.Read(ref audible.LongestCauses)).ToString(),
                audibleLongestGapRevision = Interlocked.Read(ref audible.LongestRevision),
                audibleStaleOnArrivalFrames = Interlocked.Read(ref audible.StaleOnArrival),
                audibleStaleWaitingToEnqueueFrames = Interlocked.Read(ref audible.StaleBeforeEnqueue),
                audibleStaleWaitingFrames = Interlocked.Read(ref audible.StaleInRing),
                audibleMaxArrivalAgeMs = Ms(ref audible.MaxArrivalAge),
                audibleMaxEnqueueAgeMs = Ms(ref audible.MaxEnqueueAge),
                audibleMaxHostEnqueueWaitMs = Ms(ref audible.MaxHostEnqueueWait),
                audibleMaxRingWaitMs = Ms(ref audible.MaxRingWait),
                audibleMaxOutputPeak = Volatile.Read(ref audible.Peak),
                initialAudibleChronology = initialAudible.Chronology(),
                initialAudibleLongestGapFrames = Interlocked.Read(ref initialAudible.LongestFrames),
                initialAudibleLongestGapCauses = ((PowertrainGapCause)Volatile.Read(ref initialAudible.LongestCauses)).ToString(),
                resumedAudibleFrames = Interlocked.Read(ref resumed.Frames),
                resumedAudibleSubstitutedFrames = Interlocked.Read(ref resumed.Substituted),
                resumedAudibleLongestGapFrames = Interlocked.Read(ref resumed.LongestFrames),
                resumedAudibleLongestGapCauses = ((PowertrainGapCause)Volatile.Read(ref resumed.LongestCauses)).ToString(),
                resumedAudibleStaleOnArrivalFrames = Interlocked.Read(ref resumed.StaleOnArrival),
                resumedAudibleStaleWaitingToEnqueueFrames = Interlocked.Read(ref resumed.StaleBeforeEnqueue),
                resumedAudibleStaleWaitingFrames = Interlocked.Read(ref resumed.StaleInRing),
                resumedAudibleMaxOutputPeak = Volatile.Read(ref resumed.Peak),
                resumedAudibleChronology = resumed.Chronology(),
                resumedSteadyLongestGapFrames = Interlocked.Read(ref resumedSteady.LongestFrames),
                resumedSteadyLongestGapCauses = ((PowertrainGapCause)Volatile.Read(ref resumedSteady.LongestCauses)).ToString(),
                maxCallbackGapMs=Interlocked.Read(ref maxCallbackGap)*1000d/Stopwatch.Frequency,
                maxSubmittedObservationAgeMs=Interlocked.Read(ref maximumObservationAge)*1000d/Stopwatch.Frequency,
                underflowFrames=underflow,publicationQpc=Stopwatch.GetTimestamp(),qpcFrequency=Stopwatch.Frequency,failure};
        }

        static double Ms(ref long ticks) { return Interlocked.Read(ref ticks) * 1000d / Stopwatch.Frequency; }
    }

    // Single output-writer counters. An interrupted run joins the next output
    // callback only within the same audible revision.
    internal sealed class AudibleContinuity
    {
        internal long Frames, Substituted, LongestFrames, LongestRevision;
        internal int LongestCauses;
        internal long StaleOnArrival, StaleBeforeEnqueue, StaleInRing;
        internal long MaxArrivalAge, MaxEnqueueAge, MaxHostEnqueueWait, MaxRingWait;
        internal float Peak;
        long trailingRevision;
        PowertrainGap trailing;
        int timingVersion;
        long timingRevision;
        PowertrainPcmTiming firstTiming, lastTiming;

        internal void Record(long revision, PowertrainSubmission result)
        {
            if (revision != trailingRevision)
            {
                trailingRevision = revision;
                trailing = new PowertrainGap();
            }
            var joined = trailing;
            joined.Add(result.Prefix.Frames, result.Prefix.Causes);
            var longest = joined.Frames >= result.Longest.Frames ? joined : result.Longest;
            if (longest.Frames > LongestFrames)
            {
                Volatile.Write(ref LongestCauses, (int)longest.Causes);
                Interlocked.Exchange(ref LongestRevision, revision);
                Interlocked.Exchange(ref LongestFrames, longest.Frames);
            }
            trailing = result.Substituted == result.OutputFrames ? joined : result.Suffix;
            Frames += result.OutputFrames;
            Substituted += result.Substituted;
            StaleOnArrival += result.StaleOnArrival;
            StaleBeforeEnqueue += result.StaleBeforeEnqueue;
            StaleInRing += result.StaleInRing;
            MaxArrivalAge = Math.Max(MaxArrivalAge, result.MaxArrivalAge);
            MaxEnqueueAge = Math.Max(MaxEnqueueAge, result.MaxEnqueueAge);
            MaxHostEnqueueWait = Math.Max(MaxHostEnqueueWait, result.MaxHostEnqueueWait);
            MaxRingWait = Math.Max(MaxRingWait, result.MaxRingWait);
            Peak = Math.Max(Peak, result.Peak);
            if (result.LastTiming.ArrivalQpc == 0) return;
            Interlocked.Increment(ref timingVersion);
            if (revision != timingRevision)
            {
                timingRevision = revision;
                firstTiming = result.FirstTiming;
            }
            lastTiming = result.LastTiming;
            Interlocked.Increment(ref timingVersion);
        }

        internal object Chronology()
        {
            // Read the correlated records off the output thread. Retry a
            // concurrent publication without blocking PCM submission.
            for (int i=0;i<3;i++)
            {
                int version = Volatile.Read(ref timingVersion);
                if ((version & 1) != 0) continue;
                long revision = timingRevision;
                var first = firstTiming;
                var last = lastTiming;
                Thread.MemoryBarrier();
                if (version == Volatile.Read(ref timingVersion))
                    return new { revision, first=first.Status(), last=last.Status() };
            }
            return null;
        }
    }
}
