// Device-free test of the unchanged actual RA07 parser and native PCM ring.
using System;
using System.IO;
using RichAudio.Beacon.Windows;

internal static class TestVehicleProtocol
{
    public static unsafe int Main(string[] args)
    {
        try
        {
            if (args.Length != 2) throw new ArgumentException("input and output required");
            byte[] header = new byte[16], payload = new byte[4096];
            float[] samples = new float[1024], output = new float[1024];
            using (var stream = File.OpenRead(args[0]))
            {
                if (!BlockProtocol.ReadExact(stream, header, 16)) throw new InvalidDataException("empty frame");
                int frames = BlockProtocol.ValidateHeader(header, 37);
                if (!BlockProtocol.ReadExact(stream, payload, frames * 8)) throw new InvalidDataException("missing PCM");
                if (stream.ReadByte() != -1) throw new InvalidDataException("trailing frame data");
                Buffer.BlockCopy(payload, 0, samples, 0, frames * 8);
                var ring = new PcmRing();
                if (!ring.TryWrite(samples, frames)) throw new InvalidDataException("full ring");
                fixed (float* pointer = output)
                    if (ring.Fill(pointer, frames, 0.25f) != frames) throw new InvalidDataException("short ring read");
                if (ring.UnderflowFrames != 0 || ring.ConsumedBlocks != 1) throw new InvalidDataException("ring accounting");
                Buffer.BlockCopy(output, 0, payload, 0, frames * 8);
                using (var destination = File.Create(args[1])) destination.Write(payload, 0, frames * 8);
                Console.WriteLine("verified=" + frames);
            }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.GetType().Name); return 1; }
    }
}
