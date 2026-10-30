using System;
using System.IO;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    // Exactly one producer and one consumer. Slot publication uses volatile ordering.
    public sealed class PcmRing
    {
        public const int Slots = 8, MaximumFrames = 512;
        private readonly float[][] data = new float[Slots][];
        private readonly int[] lengths = new int[Slots];
        private int write, read, offset, credits;
        public long UnderflowFrames, ConsumedFrames, ConsumedBlocks, EndSilenceFrames;
        public long FirstUnderflowFrame = -1;
        public volatile bool EndOfStream;
        public double SumSquares, Peak;
        public PcmRing() { for (int i = 0; i < Slots; i++) data[i] = new float[MaximumFrames * 2]; }
        public int Count { get { return Thread.VolatileRead(ref write) - Thread.VolatileRead(ref read); } }
        public int TakeCredits() { return Interlocked.Exchange(ref credits, 0); }
        public bool TryWrite(float[] samples, int frames)
        {
            if (samples == null || frames < 1 || frames > MaximumFrames || samples.Length < frames * 2) throw new ArgumentException("PCM block bounds");
            for (int i = 0; i < frames * 2; i++) if (float.IsNaN(samples[i]) || float.IsInfinity(samples[i]) || Math.Abs(samples[i]) > 1) throw new InvalidDataException("Invalid PCM sample");
            int cursor = Thread.VolatileRead(ref write);
            if (cursor - Thread.VolatileRead(ref read) >= Slots) return false;
            Array.Copy(samples, 0, data[cursor % Slots], 0, frames * 2); lengths[cursor % Slots] = frames;
            Thread.VolatileWrite(ref write, cursor + 1); return true;
        }
        public unsafe int Fill(float* output, int frames, float gain)
        {return FillCore(output,frames,gain,.25f);}
        // Gameplay PCM already has the explicit source/fleet headroom budget.
        // Legacy audition API above retains its original .25 safety ceiling.
        public unsafe int FillCalibrated(float* output,int frames,float gain)
        {return FillCore(output,frames,gain,1);}
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
                        offset = 0; Thread.VolatileWrite(ref read, cursor + 1); Interlocked.Increment(ref credits); ConsumedBlocks++;
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
