using System;
using System.IO;
using System.Globalization;
using System.Text;
using RichAudio.Beacon.Windows.Recording;

namespace RichAudio.Beacon.Windows
{
    // One writer on the discard thread. File I/O starts after that thread joins.
    internal sealed class ClockedOutputCapture
    {
        readonly byte[] pcm;
        int frames;
        struct Callback
        {
            internal long Sink, Producer, Start, End;
            internal int Requested, Supplied;
        }
        readonly Callback[] callbacks;
        int count;
        long producerFrames;
        internal ClockedOutputCapture(int capacityFrames, bool collectCallbacks = false)
        {
            if (capacityFrames <= 0 || capacityFrames > 48000 * 180)
                throw new ArgumentOutOfRangeException("capacityFrames");
            pcm = new byte[capacityFrames * 8];
            if (collectCallbacks) callbacks = new Callback[(capacityFrames + 959) / 960];
        }

        internal void Append(float[] interleaved, int count, long firstFrame)
        {
            if (firstFrame != frames || count < 0 || count > interleaved.Length / 2 ||
                count > pcm.Length / 8 - frames)
                throw new InvalidDataException("Clocked capture lost its continuous sample interval");
            Buffer.BlockCopy(interleaved, 0, pcm, frames * 8, count * 8);
            frames += count;
        }

        internal int Frames { get { return frames; } }
        internal bool HasCallbacks { get { return callbacks != null; } }

        internal void Append(float[] interleaved, int requested, long sink, long producer,
            int supplied, long start, long end)
        {
            if (callbacks != null)
            {
                if (count == callbacks.Length || requested != 960 || producer != producerFrames ||
                    supplied < 0 || supplied > requested || start <= 0 || end < start)
                    throw new InvalidDataException("Invalid discard callback interval");
                callbacks[count++] = new Callback {Sink=sink, Producer=producer, Requested=requested,
                    Supplied=supplied, Start=start, End=end};
                producerFrames += supplied;
            }
            Append(interleaved, requested, sink);
        }

        internal void SaveCallbacks(Stream stream)
        {
            if (callbacks == null) throw new InvalidOperationException("Callback map disabled");
            using (var text = new StreamWriter(stream,new UTF8Encoding(false)))
            {
                text.WriteLine("firstSinkFrame,firstProducerFrame,requested,supplied,startQpc,endQpc");
                for (int i=0;i<count;i++)
                {
                    Callback c=callbacks[i];
                    text.WriteLine(String.Format(CultureInfo.InvariantCulture,"{0},{1},{2},{3},{4},{5}",
                        c.Sink,c.Producer,c.Requested,c.Supplied,c.Start,c.End));
                }
            }
        }

        internal void Save(Stream stream)
        {
            using (var wave = new LosslessWaveWriter(stream, LosslessWaveWriter.FloatStereo()))
                wave.Write(pcm, frames * 8);
        }
    }
}
