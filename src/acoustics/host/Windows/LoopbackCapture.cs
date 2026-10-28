// Optional bounded WASAPI endpoint loopback. It is NOT process-isolated capture.
// Use only for explicitly controlled original-source tests; retain the file privately.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    public sealed class LoopbackCapture : IDisposable
    {
        private readonly int deviceIndex, maximumSeconds;
        private readonly Thread thread;
        private int startState, disposed;
        private volatile bool stop;
        private float[] samples;
        private double sumSquares, peak;
        private long frames, nonfinite;
        private uint rate, channels, packetDiscontinuities, timestampErrors;
        private ulong firstQpc, lastQpc;
        private readonly double[] bins;
        public readonly ManualResetEvent Ready = new ManualResetEvent(false);
        public volatile string Error;
        public LoopbackCapture(int index, int seconds)
        {
            if (seconds < 1 || seconds > 122) throw new ArgumentOutOfRangeException("seconds");
            deviceIndex = index; maximumSeconds = seconds; bins = new double[seconds * 10 + 1];
            thread = new Thread(Run); thread.IsBackground = true; thread.Name = "RichAudio private loopback"; thread.SetApartmentState(ApartmentState.STA);
        }
        public void Start() { if(Thread.VolatileRead(ref disposed)!=0 || Interlocked.CompareExchange(ref startState,1,0)!=0)throw new InvalidOperationException("Capture requires a fresh instance"); thread.Start(); }
        public void Dispose() { if(Interlocked.Exchange(ref disposed,1)!=0)return; stop = true; if (thread.IsAlive && !thread.Join(3000)) throw new TimeoutException("Loopback did not stop"); Ready.Dispose(); }
        private unsafe void Run()
        {
            IMMDeviceEnumerator enumerator = null; IMMDevice device = null; IAudioClient client = null; IAudioCaptureClient capture = null; IntPtr mix = IntPtr.Zero;
            try
            {
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass(); device = Native.Device(enumerator, deviceIndex); client = Native.Client(device);
                Native.Check(client.GetMixFormat(out mix)); WaveFormat format = (WaveFormat)Marshal.PtrToStructure(mix, typeof(WaveFormat)); rate = format.SamplesPerSecond; channels = format.Channels;
                int codec = format.Tag == 65534 && format.ExtraSize >= 22 ? Marshal.ReadInt32(mix, 24) : format.Tag;
                if (rate < 8000 || rate > 96000 || channels < 1 || channels > 8 || !(codec == 3 && format.BitsPerSample == 32 || codec == 1 && (format.BitsPerSample == 16 || format.BitsPerSample == 32))) throw new NotSupportedException("Loopback mix format not supported by bounded verifier");
                samples = new float[checked((int)rate * maximumSeconds * 2)];
                Native.Check(client.Initialize(0, 0x20000, 200000, 0, mix, IntPtr.Zero)); object value; Guid iid = typeof(IAudioCaptureClient).GUID; Native.Check(client.GetService(ref iid, out value)); capture = (IAudioCaptureClient)value;
                Native.Check(client.Start()); Ready.Set();
                while (!stop && frames < samples.Length / 2)
                {
                    uint next; Native.Check(capture.GetNextPacketSize(out next)); if (next == 0) { Thread.Sleep(2); continue; }
                    IntPtr data; uint count, flags; ulong devicePosition, qpc; Native.Check(capture.GetBuffer(out data, out count, out flags, out devicePosition, out qpc));
                    try
                    {
                        if (count > 192000) throw new InvalidDataException("Loopback packet bound");
                        if (frames == 0) firstQpc = qpc; lastQpc = qpc; if ((flags & 1) != 0) packetDiscontinuities++; if ((flags & 4) != 0) timestampErrors++;
                        for (int i = 0; i < count && frames < samples.Length / 2; i++, frames++) for (int c = 0; c < 2; c++)
                        {
                            int source = i * (int)channels + Math.Min(c, (int)channels - 1); float x = 0;
                            if ((flags & 2) == 0) x = codec == 3 ? ((float*)data)[source] : format.BitsPerSample == 16 ? ((short*)data)[source] / 32768f : (float)(((int*)data)[source] / 2147483648.0);
                            if (float.IsNaN(x) || float.IsInfinity(x)) { nonfinite++; x = 0; }
                            samples[frames * 2 + c] = x; sumSquares += (double)x * x; peak = Math.Max(peak, Math.Abs(x)); int bin = (int)(frames * 10 / rate); bins[bin] = Math.Max(bins[bin], Math.Abs(x));
                        }
                    }
                    finally { Native.Check(capture.ReleaseBuffer(count)); }
                }
            }
            catch (Exception ex) { Error = ex.GetType().Name + ": " + ex.Message; }
            finally { if (client != null) client.Stop(); Ready.Set(); Native.Release(capture); Native.Release(client); Native.Release(device); Native.Release(enumerator); if (mix != IntPtr.Zero) Marshal.FreeCoTaskMem(mix); }
        }
        public Dictionary<string, object> Metrics()
        {
            return new Dictionary<string,object> {
                {"scope","Shared endpoint mix, not process-isolated; other application audio may be present. No GTA capture is authorised."},
                {"sampleRate",rate},{"endpointChannels",channels},{"storedChannels",2},{"capturedFrames",frames},{"peak",peak},{"rms",frames>0?Math.Sqrt(sumSquares/(frames*2)):0},
                {"nonfiniteSamples",nonfinite},{"packetDiscontinuities",packetDiscontinuities},{"timestampErrors",timestampErrors},{"firstQpc100ns",firstQpc},{"lastQpc100ns",lastQpc},{"peakPer100ms",bins},{"error",Error}
            };
        }
        public void Save(string path)
        {
            if (samples == null || frames == 0) return;
            using (var stream = new FileStream(path,FileMode.CreateNew,FileAccess.Write)) using(var writer = new BinaryWriter(stream,Encoding.ASCII))
            {
                uint bytes = checked((uint)(frames * 8)); writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36u + bytes); writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16u); writer.Write((ushort)3); writer.Write((ushort)2); writer.Write(rate); writer.Write(rate*8); writer.Write((ushort)8); writer.Write((ushort)32); writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(bytes);
                for(long i=0;i<frames*2;i++)writer.Write(samples[i]);
            }
        }
    }
}
