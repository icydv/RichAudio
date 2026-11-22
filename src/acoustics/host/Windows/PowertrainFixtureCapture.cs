using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace RichAudio.Beacon.Windows
{
    // Only enabled by the device-free powertrain fixture. The sink owns all
    // writes into these fixed arrays. Persist after the sink thread has joined.
    internal sealed class PowertrainFixtureCapture : IPowertrainPcmObserver
    {
        internal const string EnvironmentName = "RICHAUDIO_POWERTRAIN_PCM_WITNESS_FRAMES";
        const int SampleRate = 48000, BytesPerFrame = 8, MaximumSeconds = 300;

        struct Decision
        {
            internal long SinkFrame, Block, Revision, Arrival, Enqueue, Qpc;
            internal int Frames, SlotOffset;
            internal uint WireTag;
            internal PowertrainStamp Stamp;
            internal bool Audible;
            internal bool InputUnknown;
            internal PowertrainGapCause Cause;
        }

        readonly byte[] beforeGate, submitted;
        readonly Decision[] decisions;
        readonly int capacityFrames;
        int originalFrames, submittedFrames, decisionCount, resetBoundaries, unknownInputFrames;
        bool decisionOverflow;

        internal PowertrainFixtureCapture(int capacity)
        {
            if (capacity < 1 || capacity > SampleRate * MaximumSeconds)
                throw new ArgumentOutOfRangeException("capacity");
            capacityFrames = capacity;
            beforeGate = new byte[capacity * BytesPerFrame];
            submitted = new byte[capacity * BytesPerFrame];
            // 960-frame fixture callbacks with 512-frame RA07 blocks split at
            // most once by each callback. Leave room for zero-length resets.
            decisions = new Decision[capacity / 128 + 32];
        }

        public void Observe(long sinkFrame, int frames, float[] input, int offset, long block,
            uint wireTag, PowertrainStamp stamp, long revision, bool audible,
            long arrival, long enqueue, long decision, PowertrainGapCause cause)
        {
            if (sinkFrame >= capacityFrames) return;
            if (sinkFrame != originalFrames) throw new InvalidDataException("Powertrain witness input is not contiguous");
            int count = Math.Min(frames, capacityFrames - originalFrames);
            if (input != null)
                Buffer.BlockCopy(input, offset * BytesPerFrame, beforeGate, originalFrames * BytesPerFrame, count * BytesPerFrame);
            originalFrames += count;
            Add(new Decision { SinkFrame=sinkFrame, Frames=count, Block=block, SlotOffset=offset, WireTag=wireTag,
                Stamp=stamp, Revision=revision, Audible=audible, Arrival=arrival, Enqueue=enqueue, Qpc=decision, Cause=cause });
        }

        internal void Reset(long sinkFrame, long qpc, long revision)
        {
            if (sinkFrame >= capacityFrames) return;
            resetBoundaries++;
            Add(new Decision { SinkFrame=sinkFrame, Block=-1, Qpc=qpc, Revision=revision });
        }

        public void UnobservedArrival(long sinkFrame)
        {
            if (sinkFrame >= capacityFrames || decisionOverflow) return;
            int index = decisionCount - 1;
            if (index < 0 || decisions[index].SinkFrame != sinkFrame)
                throw new InvalidDataException("Powertrain witness missing no-slot decision");
            decisions[index].InputUnknown = true;
            unknownInputFrames += decisions[index].Frames;
        }

        void Add(Decision value)
        {
            if (decisionCount == decisions.Length)
            {
                decisionOverflow = true;
                return;
            }
            decisions[decisionCount++] = value;
        }

        internal void Submit(float[] output, int frames, long sinkFrame)
        {
            if (sinkFrame >= capacityFrames) return;
            if (sinkFrame != submittedFrames) throw new InvalidDataException("Powertrain witness submission is not contiguous");
            int count = Math.Min(frames, capacityFrames - submittedFrames);
            Buffer.BlockCopy(output, 0, submitted, submittedFrames * BytesPerFrame, count * BytesPerFrame);
            submittedFrames += count;
        }

        internal void Save(string directory, string session, long sinkFrames)
        {
            if (originalFrames != submittedFrames || submittedFrames != Math.Min(capacityFrames, sinkFrames) || decisionOverflow)
                throw new InvalidDataException("Powertrain witness chronology incomplete");
            string root = Path.Combine(directory, "powertrain-fixture-pcm");
            Directory.CreateDirectory(root);
            SavePcm(Path.Combine(root, "pre-gate.f32"), beforeGate);
            SavePcm(Path.Combine(root, "submitted.f32"), submitted);
            using (var stream = new FileStream(Path.Combine(root, "decisions.tsv"), FileMode.CreateNew))
            using (var text = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                text.WriteLine("kind\tsinkFrame\tframes\tproducerBlock\tblockOffset\twireTag\tobservationSequence\tobservationQpc\tdeadlineQpc\tsourceRevision\tsinkRevision\tvoice\tarrivalQpc\tenqueueQpc\tdecisionQpc\tinputKnown\toutcome");
                for (int i = 0; i < decisionCount; i++)
                {
                    var row = decisions[i];
                    bool reset = row.Frames == 0;
                    var stamp = row.Stamp;
                    text.WriteLine(String.Format(CultureInfo.InvariantCulture,
                        "{0}\t{1}\t{2}\t{3}\t{4}\t{5}\t{6}\t{7}\t{8}\t{9}\t{10}\t{11}\t{12}\t{13}\t{14}\t{15}\t{16}",
                        reset ? "reset" : "pcm", row.SinkFrame, row.Frames, row.Block, row.SlotOffset, row.WireTag,
                        stamp == null ? -1 : stamp.Sequence, stamp == null ? 0 : stamp.ObservedAt,
                        stamp == null ? 0 : stamp.Deadline, stamp == null ? 0 : stamp.Revision,
                        row.Revision, row.Audible ? 1 : 0, row.Arrival, row.Enqueue, row.Qpc, row.InputUnknown ? 0 : 1,
                        reset ? "SilentResetPrime" : row.Cause.ToString()));
                }
            }
            using (var stream = new FileStream(Path.Combine(root, "receipt.json"), FileMode.CreateNew))
            using (var text = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                text.WriteLine(new JavaScriptSerializer().Serialize(new { session, fixture=true, sampleRate=SampleRate,
                    channels=2, format="interleaved IEEE float32 little-endian", qpcFrequency=Stopwatch.Frequency,
                    frames=submittedFrames, sinkFrames, truncated=submittedFrames!=sinkFrames, decisions=decisionCount, resetBoundaries, unknownInputFrames,
                    scope="Device-free sink on the production output gate. Reset-prime callbacks are marked but consume no sample frames." }));
            }
        }

        void SavePcm(string path, byte[] pcm)
        {
            using (var file = new FileStream(path, FileMode.CreateNew))
                file.Write(pcm, 0, submittedFrames * BytesPerFrame);
        }
    }
}
