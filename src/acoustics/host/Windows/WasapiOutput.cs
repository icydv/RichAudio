using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    public sealed class WasapiOutput : IDisposable
    {
        private readonly PcmRing ring;
        private readonly int deviceIndex;
        private readonly Thread thread;
        public OwnedOutputTap OwnedRecorder;
        private int startState, disposed;
        private volatile bool stop;
        private volatile float volume = .08f;
        public volatile bool Muted = true;
        public readonly ManualResetEvent Ready = new ManualResetEvent(false);
        public volatile string Error;
        public string EndpointName, FormatResult;
        public uint BufferFrames, MixRate, MixChannels;
        public long DevicePeriod100ns, StreamLatency100ns, SubmittedFrames, WakeTimeouts, EmptyPaddingEvents, MaximumSubmissionTicks, LastDeviceQpc100ns, ClockPositionWarnings;
        public ulong DeviceClockFrequency, LastDevicePosition;
        public readonly long[] SubmissionTicks = new long[30000], WakeIntervalsTicks = new long[30000];
        public int Measurements;
        public volatile bool Started;
        public bool MmcssRegistered, MmcssReverted;
        public int MmcssError;
        public float Volume { get { return volume; } set { if (float.IsNaN(value) || float.IsInfinity(value) || value < 0 || value > .25f) throw new ArgumentOutOfRangeException("volume"); volume = value; } }
        public WasapiOutput(PcmRing ring, int index)
        {
            if(ring==null || index < -1)throw new ArgumentException("Invalid output ring or endpoint index");
            this.ring = ring; deviceIndex = index; thread = new Thread(Run); thread.IsBackground = true; thread.Name = "RichAudio WASAPI output"; thread.SetApartmentState(ApartmentState.STA);
        }
        public void Start() { if(Thread.VolatileRead(ref disposed)!=0 || Interlocked.CompareExchange(ref startState,1,0)!=0)throw new InvalidOperationException("Output requires a fresh host instance"); thread.Start(); }
        public void Stop() { Muted = true; stop = true; }
        public void Dispose() { if(Interlocked.Exchange(ref disposed,1)!=0)return; Stop(); if (thread.IsAlive && !thread.Join(3000)) throw new TimeoutException("Audio thread did not stop"); Ready.Dispose(); }
        public static string[] ListDevices()
        {
            IMMDeviceEnumerator enumerator = null; IMMDeviceCollection collection = null; var names = new List<string>();
            try
            {
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass(); Native.Check(enumerator.EnumAudioEndpoints(0, 1, out collection)); uint count; Native.Check(collection.GetCount(out count));
                if (count > 128) throw new InvalidOperationException("Endpoint count exceeds bounded inventory");
                for (uint i = 0; i < count; i++) { IMMDevice device = null; try { Native.Check(collection.Item(i, out device)); names.Add(Native.Name(device)); } finally { Native.Release(device); } }
                return names.ToArray();
            }
            finally { Native.Release(collection); Native.Release(enumerator); }
        }
        public static Dictionary<string, object> ProbeDevice(int index)
        {
            IMMDeviceEnumerator enumerator = null; IMMDevice device = null; IAudioClient client = null;
            IntPtr mix = IntPtr.Zero, request = IntPtr.Zero, closest = IntPtr.Zero;
            try
            {
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass(); device = Native.Device(enumerator,index); client = Native.Client(device);
                Native.Check(client.GetMixFormat(out mix)); WaveFormat format = (WaveFormat)Marshal.PtrToStructure(mix,typeof(WaveFormat));
                request = Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WaveFormat))); Marshal.StructureToPtr(WaveFormat.FloatStereo48k(),request,false);
                int supported = client.IsFormatSupported(0,request,out closest); long period, minimum; Native.Check(client.GetDevicePeriod(out period,out minimum));
                return new Dictionary<string,object>{{"endpointName",Native.Name(device)},{"mixRate",format.SamplesPerSecond},{"mixChannels",format.Channels},{"mixBits",format.BitsPerSample},{"exact48kStereoFloatSupported",supported==0},{"formatResult",supported.ToString("X8")},{"periodMs",period/10000.0},{"deviceStarted",false}};
            }
            finally { if(mix!=IntPtr.Zero)Marshal.FreeCoTaskMem(mix); if(request!=IntPtr.Zero)Marshal.FreeCoTaskMem(request); if(closest!=IntPtr.Zero)Marshal.FreeCoTaskMem(closest); Native.Release(client);Native.Release(device);Native.Release(enumerator); }
        }
        private unsafe void Run()
        {
            IMMDeviceEnumerator enumerator = null; IMMDevice device = null; IAudioClient client = null; IAudioRenderClient renderer = null; IAudioClock clock = null;
            IntPtr requested = IntPtr.Zero, mix = IntPtr.Zero, closest = IntPtr.Zero, mmcss = IntPtr.Zero; AutoResetEvent signal = null;
            try
            {
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass(); device = Native.Device(enumerator, deviceIndex); EndpointName = Native.Name(device); client = Native.Client(device);
                Native.Check(client.GetMixFormat(out mix)); WaveFormat mf = (WaveFormat)Marshal.PtrToStructure(mix, typeof(WaveFormat)); MixRate = mf.SamplesPerSecond; MixChannels = mf.Channels;
                WaveFormat format = WaveFormat.FloatStereo48k(); requested = Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WaveFormat))); Marshal.StructureToPtr(format, requested, false);
                int supported = client.IsFormatSupported(0, requested, out closest);
                if (supported != 0) throw new NotSupportedException("Endpoint did not accept exact shared 48000 Hz stereo Float32; no implicit format substitution. HRESULT=" + supported.ToString("X8"));
                FormatResult = "Exact shared 48000 Hz stereo Float32 accepted; Windows endpoint mix format recorded separately";
                Native.Check(client.Initialize(0, 0x40000, 200000, 0, requested, IntPtr.Zero));
                Native.Check(client.GetBufferSize(out BufferFrames)); if (BufferFrames < 1 || BufferFrames > 2048) throw new NotSupportedException("Endpoint buffer exceeds validated four-block startup bound");
                Native.Check(client.GetStreamLatency(out StreamLatency100ns)); long minPeriod; Native.Check(client.GetDevicePeriod(out DevicePeriod100ns, out minPeriod));
                object value; Guid iid = typeof(IAudioRenderClient).GUID; Native.Check(client.GetService(ref iid, out value)); renderer = (IAudioRenderClient)value;
                iid = typeof(IAudioClock).GUID; Native.Check(client.GetService(ref iid, out value)); clock = (IAudioClock)value; Native.Check(clock.GetFrequency(out DeviceClockFrequency));
                signal = new AutoResetEvent(false); Native.Check(client.SetEventHandle(signal.SafeWaitHandle.DangerousGetHandle()));
                Ready.Set();
                long deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5;
                while (!stop && ring.Count < 4 && Stopwatch.GetTimestamp() < deadline) Thread.Sleep(2);
                if (stop) return;
                if (ring.Count < 4) throw new TimeoutException("No four-block prefill; device was not started");
                uint taskIndex=0;mmcss=Native.AvSetMmThreadCharacteristicsW("Audio",ref taskIndex);MmcssRegistered=mmcss!=IntPtr.Zero;if(!MmcssRegistered)MmcssError=Marshal.GetLastWin32Error();
                uint padding; Native.Check(client.GetCurrentPadding(out padding)); Fill(renderer, BufferFrames - padding);
                Native.Check(client.Start()); Started = true; long lastWake = Stopwatch.GetTimestamp(); int consecutiveTimeouts = 0;
                while (!stop)
                {
                    if (!signal.WaitOne(100)) { WakeTimeouts++; if (++consecutiveTimeouts >= 5) throw new TimeoutException("Audio endpoint stopped signalling"); continue; }
                    consecutiveTimeouts = 0;
                    long begin = Stopwatch.GetTimestamp(), interval = begin - lastWake; lastWake = begin;
                    Native.Check(client.GetCurrentPadding(out padding)); if (padding > BufferFrames) throw new InvalidOperationException("Invalid device padding"); if (padding == 0) EmptyPaddingEvents++;
                    Fill(renderer, BufferFrames - padding);
                    ulong qpc; int positionStatus=clock.GetPosition(out LastDevicePosition, out qpc); Native.Check(positionStatus); if(positionStatus!=0)ClockPositionWarnings++; LastDeviceQpc100ns = (long)qpc;
                    long ticks = Stopwatch.GetTimestamp() - begin; MaximumSubmissionTicks = Math.Max(MaximumSubmissionTicks, ticks);
                    if (Measurements < SubmissionTicks.Length) { SubmissionTicks[Measurements] = ticks; WakeIntervalsTicks[Measurements] = interval; Measurements++; }
                }
            }
            catch (Exception ex) { Error = ex.GetType().Name + ": " + ex.Message; Muted = true; }
            finally
            {
                if (client != null) { client.Stop(); client.Reset(); } Started = false; Ready.Set();
                if(mmcss!=IntPtr.Zero)MmcssReverted=Native.AvRevertMmThreadCharacteristics(mmcss);
                if (signal != null) signal.Dispose(); Native.Release(clock); Native.Release(renderer); Native.Release(client); Native.Release(device); Native.Release(enumerator);
                if (requested != IntPtr.Zero) Marshal.FreeCoTaskMem(requested); if (mix != IntPtr.Zero) Marshal.FreeCoTaskMem(mix); if (closest != IntPtr.Zero) Marshal.FreeCoTaskMem(closest);
            }
        }
        private unsafe void Fill(IAudioRenderClient renderer, uint frames)
        {
            if (frames == 0) return; IntPtr data; Native.Check(renderer.GetBuffer(frames, out data));
            int captureSlot=-1;
            try {long underflow=ring.UnderflowFrames,endSilence=ring.EndSilenceFrames,producerStart=ring.ConsumedFrames-underflow-endSilence;
                int supplied=ring.Fill((float*)data, (int)frames, Muted ? 0 : volume);
                if(OwnedRecorder!=null)captureSlot=OwnedRecorder.Prepare((float*)data,(int)frames,SubmittedFrames,ring.ConsumedFrames,producerStart,supplied,ring.UnderflowFrames-underflow,ring.EndSilenceFrames-endSilence); }
            finally {try{Native.Check(renderer.ReleaseBuffer(frames, 0));}catch{if(OwnedRecorder!=null)OwnedRecorder.Cancel(captureSlot);throw;} }
            if(OwnedRecorder!=null)OwnedRecorder.Commit(captureSlot);
            SubmittedFrames += frames;
            if(ring.UnderflowFrames!=0)throw new InvalidOperationException("Producer starvation: stopped to prevent renderer/device clock drift; no automatic resume");
        }
        public Dictionary<string, object> Metrics()
        {
            var duration = new double[Measurements]; var intervals = new double[Measurements];
            for (int i = 0; i < Measurements; i++) { duration[i] = SubmissionTicks[i] * 1000.0 / Stopwatch.Frequency; intervals[i] = WakeIntervalsTicks[i] * 1000.0 / Stopwatch.Frequency; }
            Array.Sort(duration); Array.Sort(intervals);
            return new Dictionary<string, object> {
                {"endpointName",EndpointName},{"format",FormatResult},{"mixSampleRate",MixRate},{"mixChannels",MixChannels},{"processingSampleRate",48000},{"processingChannels",2},
                {"endpointBufferFrames",BufferFrames},{"endpointBufferMilliseconds",BufferFrames/48.0},{"streamLatencyMilliseconds",StreamLatency100ns/10000.0},{"devicePeriodMilliseconds",DevicePeriod100ns/10000.0},
                {"mmcssTask","Audio"},{"mmcssRegistered",MmcssRegistered},{"mmcssReverted",MmcssReverted},{"mmcssError",MmcssError},
                {"submittedFrames",SubmittedFrames},{"consumedFrames",ring.ConsumedFrames},{"underflowFrames",ring.UnderflowFrames},{"firstUnderflowFrame",ring.FirstUnderflowFrame},{"endOfStreamSilenceFrames",ring.EndSilenceFrames},{"emptyPaddingEvents",EmptyPaddingEvents},{"wakeTimeouts",WakeTimeouts},
                {"submissionMeasurements",Measurements},{"submissionMedianMs",Percentile(duration,.5)},{"submissionP99Ms",Percentile(duration,.99)},{"submissionMaxMs",MaximumSubmissionTicks*1000.0/Stopwatch.Frequency},
                {"wakeIntervalP99Ms",Percentile(intervals,.99)},{"deviceClockFrequency",DeviceClockFrequency},{"deviceClockPosition",LastDevicePosition},{"deviceQpc100ns",LastDeviceQpc100ns},{"deviceClockPositionWarnings",ClockPositionWarnings},
                {"peakSubmitted",ring.Peak},{"rmsSubmitted",ring.ConsumedFrames>0?Math.Sqrt(ring.SumSquares/(ring.ConsumedFrames*2)):0},{"pcmRingBytes",PcmRing.Slots*PcmRing.MaximumFrames*2*4},{"error",Error},
                {"limits","Shared endpoint acknowledgement is not physical speaker or subjective listening confirmation; empty padding events can include startup and are separate from producer underflows."}
            };
        }
        private static double Percentile(double[] values, double p) { return values.Length == 0 ? 0 : values[Math.Min(values.Length-1,(int)(values.Length*p))]; }
    }
}
