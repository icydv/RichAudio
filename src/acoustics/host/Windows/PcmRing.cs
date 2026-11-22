using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    internal sealed class PowertrainStamp
    {
        internal readonly long Revision, Sequence, Deadline, ObservedAt;
        internal readonly double OperatingPoint;
        internal PowertrainStamp(long revision,long sequence,long deadline,long observedAt,double operatingPoint)
        {
            Revision=revision;Sequence=sequence;Deadline=deadline;
            ObservedAt=observedAt;OperatingPoint=operatingPoint;
        }
    }
    internal struct PowertrainSubmission
    {
        internal PowertrainStamp Source;
        internal int Qualified, Discarded, Stale;
        internal float Peak;
        internal bool Audible;
        internal int OutputFrames, Substituted, StaleOnArrival, StaleBeforeEnqueue, StaleInRing;
        internal long MaxArrivalAge, MaxEnqueueAge, MaxRingWait, MaxHostEnqueueWait;
        internal PowertrainGap Prefix, Suffix, Longest;
        internal PowertrainPcmTiming FirstTiming, LastTiming;

        internal void Output(int frames, PowertrainGapCause cause)
        {
            if (cause == PowertrainGapCause.None) Suffix = new PowertrainGap();
            else
            {
                if (Substituted == OutputFrames) Prefix.Add(frames, cause);
                Suffix.Add(frames, cause);
                if (Suffix.Frames > Longest.Frames) Longest = Suffix;
                Substituted += frames;
                if (cause == PowertrainGapCause.StaleOnArrival) StaleOnArrival += frames;
                else if (cause == PowertrainGapCause.StaleBeforeEnqueue) StaleBeforeEnqueue += frames;
                else if (cause == PowertrainGapCause.StaleInRing) StaleInRing += frames;
            }
            OutputFrames += frames;
        }
    }
    internal struct PowertrainPcmTiming
    {
        internal long ObservationSequence, ObservationQpc, DeadlineQpc, PcmBlock;
        internal long ArrivalQpc, EnqueueQpc, OutputDecisionQpc;
        internal int SlotFrame;
        internal string Outcome { get { return Cause.ToString(); } }
        internal PowertrainGapCause Cause;
        internal object Status()
        {
            if (ArrivalQpc == 0) return null;
            return new { ObservationSequence, ObservationQpc, DeadlineQpc, PcmBlock, SlotFrame,
                ArrivalQpc, EnqueueQpc, OutputDecisionQpc, Outcome };
        }
    }
    [Flags]
    internal enum PowertrainGapCause
    {
        None = 0, NoSlot = 1, Untagged = 2, RevisionMismatch = 4, StaleOnArrival = 8,
        StaleBeforeEnqueue = 16, StaleInRing = 32, StaleUnmeasured = 64,
        GainBoundaryPending = 128, SourceLeaseExpired = 256
    }
    internal struct PowertrainGap
    {
        internal long Frames;
        internal PowertrainGapCause Causes;
        internal void Add(long frames, PowertrainGapCause cause)
        {
            Frames += frames;
            Causes |= cause;
        }
    }
    // Optional device-free witness, assigned before either ring thread starts.
    internal interface IPowertrainPcmObserver
    {
        void Observe(long sinkFrame, int frames, float[] input, int offset, long block,
            uint wireTag, PowertrainStamp stamp, long revision, bool audible,
            long arrival, long enqueue, long decision, PowertrainGapCause cause);
        void UnobservedArrival(long sinkFrame);
    }
    // Exactly one producer and one consumer. Slot publication uses volatile ordering.
    public sealed class PcmRing
    {
        public const int Slots = 8, MaximumFrames = 512;
        // Gameplay reserves the existing fixed ring capacity. The measured live
        // 27.24 ms producer spike plus a 20 ms device chunk and control/IPC
        // scheduling jitter exceed the legacy 42.67 ms four-block reserve.
        // Eight512-frame blocks reserve85.333ms at startup (four extra blocks
        // versus the older reserve). Actual steady occupancy/residence varies;
        // this is not a fixed measured output delay. No resampling or drift.
        public const int GameplayStartupBlocks = 8;
        public const double GameplayReserveMilliseconds = GameplayStartupBlocks * MaximumFrames / 48.0;
        public readonly int GameplayPrefillBlocks;
        public double SelectedGameplayReserveMilliseconds {get{return GameplayPrefillBlocks*MaximumFrames/48.0;}}
        private readonly float[][] data = new float[Slots][];
        private readonly PowertrainStamp[] stamps = new PowertrainStamp[Slots];
        private readonly long[] arrivedAt = new long[Slots], enqueuedAt = new long[Slots], pcmBlocks = new long[Slots];
        private readonly uint[] wireTags = new uint[Slots];
        private readonly int[] lengths = new int[Slots];
        private readonly AutoResetEvent creditsReady;
        internal IPowertrainPcmObserver PowertrainPcmObserver { get; set; }
        private int write, read, offset, credits;
        public long UnderflowFrames, ConsumedFrames, ConsumedBlocks, EndSilenceFrames;
        public long FirstUnderflowFrame = -1;
        public volatile bool EndOfStream;
        public double SumSquares, Peak;
        public PcmRing():this(GameplayStartupBlocks){}
        public PcmRing(int gameplayPrefillBlocks):this(gameplayPrefillBlocks,null){}
        internal PcmRing(int gameplayPrefillBlocks,AutoResetEvent creditsReady)
        {
            if(gameplayPrefillBlocks<3||gameplayPrefillBlocks>Slots)throw new ArgumentOutOfRangeException("gameplayPrefillBlocks");
            GameplayPrefillBlocks=gameplayPrefillBlocks;
            this.creditsReady=creditsReady;
            for (int i=0;i<Slots;i++) data[i]=new float[MaximumFrames*2];
        }
        public int Count { get { return Thread.VolatileRead(ref write) - Thread.VolatileRead(ref read); } }
        public int BufferedFrames { get { int a=Thread.VolatileRead(ref read),b=Thread.VolatileRead(ref write),n=0;for(int i=a;i<b&&i<a+Slots;i++)n+=lengths[i%Slots];return Math.Max(0,n-Thread.VolatileRead(ref offset)); } }
        // Both real and device-free sinks enforce this same fatal integrity
        // boundary. Underflow is never silently resumed or accepted by a test.
        public void RequireContinuousProducer(){if(Interlocked.Read(ref UnderflowFrames)!=0)throw new InvalidOperationException("Producer starvation: stopped to prevent renderer/device clock drift; no automatic resume");}
        internal int PendingCredits { get { return Volatile.Read(ref credits); } }
        public int TakeCredits() { return Interlocked.Exchange(ref credits, 0); }
        public bool TryWrite(float[] samples, int frames)
        { return TryWrite(samples, frames, null); }
        internal bool TryWrite(float[] samples, int frames, PowertrainStamp stamp, long arrival = 0, long block = -1, uint wireTag = 0)
        {
            if (samples == null || frames < 1 || frames > MaximumFrames || samples.Length < frames * 2) throw new ArgumentException("PCM block bounds");
            for (int i = 0; i < frames * 2; i++) if (float.IsNaN(samples[i]) || float.IsInfinity(samples[i]) || Math.Abs(samples[i]) > 1) throw new InvalidDataException("Invalid PCM sample");
            int cursor = Thread.VolatileRead(ref write);
            if (cursor - Thread.VolatileRead(ref read) >= Slots) return false;
            int index = cursor % Slots;
            Array.Copy(samples, 0, data[index], 0, frames * 2);
            lengths[index] = frames; stamps[index] = stamp;
            if (stamp != null || PowertrainPcmObserver != null)
            {
                arrivedAt[index] = arrival;
                enqueuedAt[index] = arrival == 0 ? 0 : Stopwatch.GetTimestamp();
                pcmBlocks[index] = block;
            }
            if (PowertrainPcmObserver != null) wireTags[index] = wireTag;
            Thread.VolatileWrite(ref write, cursor + 1); return true;
        }
        public unsafe int Fill(float* output, int frames, float gain)
        {return FillCore(output,frames,gain,.25f);}
        // Gameplay PCM already has the explicit source/fleet headroom budget.
        // Legacy audition API above retains its original .25 safety ceiling.
        public unsafe int FillCalibrated(float* output,int frames,float gain)
        {return FillCore(output,frames,gain,1);}
        // Consume only one tagged slot per gain decision. Other host modes use
        // the original sample loop directly, with no per-frame revision checks.
        internal unsafe int FillPowertrain(float* output,int frames,float gain,long revision,long now,
            out PowertrainSubmission submission,bool audible=false,PowertrainGapCause suppression=PowertrainGapCause.None)
        {
            if(output==null||frames<0||frames>8192)throw new ArgumentException("Output bounds");
            int supplied=0,done=0;
            submission=new PowertrainSubmission { Audible=audible };
            while(done<frames){
                int cursor=read,index=cursor%Slots;
                bool available=cursor<Thread.VolatileRead(ref write);
                var stamp=available?stamps[index]:null;
                int chunk=available?Math.Min(frames-done,lengths[index]-offset):frames-done;
                bool stale=stamp!=null&&stamp.Deadline<=now;
                bool qualified=suppression==PowertrainGapCause.None&&stamp!=null&&stamp.Revision==revision&&!stale;
                var observer=PowertrainPcmObserver;
                if (audible || observer != null)
                {
                    long arrival = arrivedAt[index], enqueue = enqueuedAt[index];
                    if (audible && stamp != null && stamp.Revision == revision && arrival > 0 && arrival <= enqueue)
                    {
                        submission.MaxArrivalAge = Math.Max(submission.MaxArrivalAge, arrival - stamp.ObservedAt);
                        submission.MaxEnqueueAge = Math.Max(submission.MaxEnqueueAge, enqueue - stamp.ObservedAt);
                        submission.MaxHostEnqueueWait = Math.Max(submission.MaxHostEnqueueWait, enqueue - arrival);
                        submission.MaxRingWait = Math.Max(submission.MaxRingWait, now - enqueue);
                    }
                    PowertrainGapCause cause;
                    if (suppression != PowertrainGapCause.None) cause = suppression;
                    else if (!available) cause = PowertrainGapCause.NoSlot;
                    else if (stamp == null) cause = PowertrainGapCause.Untagged;
                    else if (stamp.Revision != revision) cause = PowertrainGapCause.RevisionMismatch;
                    else if (!stale) cause = PowertrainGapCause.None;
                    else if (arrival <= 0) cause = PowertrainGapCause.StaleUnmeasured;
                    else if (arrival >= stamp.Deadline) cause = PowertrainGapCause.StaleOnArrival;
                    else if (enqueue >= stamp.Deadline) cause = PowertrainGapCause.StaleBeforeEnqueue;
                    else cause = PowertrainGapCause.StaleInRing;
                    if (audible && stamp != null && stamp.Revision == revision && arrival > 0)
                    {
                        var timing = new PowertrainPcmTiming {
                            ObservationSequence=stamp.Sequence, ObservationQpc=stamp.ObservedAt, DeadlineQpc=stamp.Deadline,
                            PcmBlock=pcmBlocks[index], SlotFrame=offset, ArrivalQpc=arrival, EnqueueQpc=enqueue,
                            OutputDecisionQpc=now, Cause=cause };
                        if (submission.FirstTiming.ArrivalQpc == 0) submission.FirstTiming = timing;
                        submission.LastTiming = timing;
                    }
                    if (audible) submission.Output(chunk, cause);
                    if (observer != null) observer.Observe(ConsumedFrames, chunk,
                        available ? data[index] : null, available ? offset : 0,
                        available ? pcmBlocks[index] : -1, available ? wireTags[index] : 0,
                        stamp, revision, audible, available ? arrival : 0, available ? enqueue : 0, now, cause);
                }
                float* target=output+done*2;
                int taken=FillCore(target,chunk,qualified?gain:0,1);
                // FillCore can discover a slot published after our no-slot
                // decision. Its contents were not observed at the gate.
                if (observer != null && !available && taken > 0)
                    observer.UnobservedArrival(ConsumedFrames-chunk);
                if(qualified){
                    submission.Qualified+=taken;
                    submission.Source=stamp;
                    if(gain>0)for(int i=0;i<taken*2;i++)submission.Peak=Math.Max(submission.Peak,Math.Abs(target[i]));
                }else submission.Discarded+=taken;
                if(stale)submission.Stale+=taken;
                supplied+=taken;done+=chunk;
            }
            return supplied;
        }
        private unsafe int FillCore(float* output,int frames,float gain,float ceiling)
        {
            if (output == null || frames < 0 || frames > 8192 || float.IsNaN(gain) || gain < 0 || gain > ceiling) throw new ArgumentException("Output bounds");
            int supplied = 0, missing = 0, afterEnd = 0;
            for (int f = 0; f < frames; f++)
            {
                float left = 0, right = 0;
                int cursor = read;
                if (cursor < Thread.VolatileRead(ref write))
                {
                    float[] slot = data[cursor % Slots]; left = slot[offset * 2] * gain; right = slot[offset * 2 + 1] * gain;
                    offset++; supplied++;
                    if (offset == lengths[cursor % Slots])
                    {
                        offset = 0; Thread.VolatileWrite(ref read, cursor + 1);
                        ConsumedBlocks++;
                        // Publish the free slot and its credit before waking
                        // the credit writer. Coalesce while credits are pending.
                        if (Interlocked.Increment(ref credits)==1 && creditsReady!=null) creditsReady.Set();
                    }
                }
                else if(EndOfStream)afterEnd++;
                else { missing++;if(FirstUnderflowFrame<0)FirstUnderflowFrame=ConsumedFrames+f; }
                output[f * 2] = left; output[f * 2 + 1] = right;
                SumSquares += (double)left * left + (double)right * right; Peak = Math.Max(Peak, Math.Max(Math.Abs(left), Math.Abs(right)));
            }
            ConsumedFrames += frames; EndSilenceFrames+=afterEnd;UnderflowFrames+=missing; return supplied;
        }
    }
    internal static class BlockProtocol
    {
        internal const int HeaderBytes = 16, MaximumPayload = 4096;
        internal static uint UInt(byte[] b, int at) { return (uint)(b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24); }
        internal static bool ReadExact(Stream stream, byte[] buffer, int count)
        {
            int n = 0; while (n < count) { int got = stream.Read(buffer, n, count - n); if (got == 0) { if (n == 0) return false; throw new EndOfStreamException("Truncated PCM block"); } n += got; } return true;
        }
        internal static int ValidateHeader(byte[] h, uint expected)
        {
            if (h.Length != HeaderBytes || h[0] != 82 || h[1] != 65 || h[2] != 48 || h[3] != 55 || UInt(h, 4) != expected || UInt(h, 12) != 0) throw new InvalidDataException("PCM framing/sequence mismatch");
            uint frames = UInt(h, 8); if (frames < 1 || frames > PcmRing.MaximumFrames) throw new InvalidDataException("PCM frame count"); return (int)frames;
        }
    }
}
