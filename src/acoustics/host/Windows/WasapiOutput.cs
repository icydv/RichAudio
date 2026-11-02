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
        private readonly bool calibratedGameplay;
        private readonly Thread thread;
        private Latency03OutputSession isolatedExperiment;
        private uint experimentPadding;
        public OwnedOutputTap OwnedRecorder;
        private int startState, disposed;
        private volatile bool stop;
        private volatile float volume = .08f;
        public volatile bool Muted = true;
        public readonly ManualResetEvent Ready = new ManualResetEvent(false);
        public volatile string Error;
        public string EndpointName, FormatResult;
        public string SelectedEndpointId {get;private set;}
        internal static string ReadSelectedIdentity(Func<string> query){try{string value=query();return String.IsNullOrWhiteSpace(value)||value.Length>1024?null:value;}catch(Exception){return null;}}
        public uint BufferFrames, MixRate, MixChannels;
        public uint MaximumCallbackFrames,MinimumCallbackFrames=UInt32.MaxValue;
        public long DevicePeriod100ns, StreamLatency100ns, SubmittedFrames, WakeTimeouts, EmptyPaddingEvents, MaximumSubmissionTicks, LastDeviceQpc100ns, ClockPositionWarnings;
        public ulong DeviceClockFrequency, LastDevicePosition;
        public readonly long[] SubmissionTicks = new long[30000], WakeIntervalsTicks = new long[30000];
        public int Measurements;
        public volatile bool Started;
        public volatile bool DeviceOpened,EverStarted;
        public bool MmcssRegistered, MmcssReverted;
        public int MmcssError;
        public float Volume { get { return volume; } set { if (float.IsNaN(value) || float.IsInfinity(value) || value < 0 || value > (calibratedGameplay?1:.25f)) throw new ArgumentOutOfRangeException("volume"); volume = value; } }
        public WasapiOutput(PcmRing ring, int index,bool calibratedGameplay=false)
        {
            if(ring==null || index < -1)throw new ArgumentException("Invalid output ring or endpoint index");
            this.ring = ring; deviceIndex = index;this.calibratedGameplay=calibratedGameplay; thread = new Thread(Run); thread.IsBackground = true; thread.Name = "RichAudio WASAPI output"; thread.SetApartmentState(ApartmentState.STA);
        }
        // No caller on the gameplay route uses this factory. Construction alone
        // does not enumerate/query/start any endpoint; Start is a separate act.
        public static WasapiOutput CreateSyntheticExperiment(PcmRing ring,Latency03OutputSession experiment)
        {if(experiment==null)throw new ArgumentNullException("experiment");if(!experiment.ClaimOutput())throw new InvalidOperationException("One fresh prepared experimental output only");var output=new WasapiOutput(ring,-1,true);output.isolatedExperiment=experiment;output.Volume=experiment.Gain;output.Muted=false;return output;}
        public void Start() { if(Thread.VolatileRead(ref disposed)!=0 || Interlocked.CompareExchange(ref startState,1,0)!=0)throw new InvalidOperationException("Output requires a fresh host instance");if(isolatedExperiment!=null)isolatedExperiment.MarkStarting(); thread.Start(); }
        public void Stop() { Muted = true; stop = true; }
        internal bool StopRequested { get { return stop; } }
        public long ConsumerFrame { get { return Interlocked.Read(ref ring.ConsumedFrames); } }
        public void Dispose() { if(Interlocked.Exchange(ref disposed,1)!=0)return; Stop(); if (thread.IsAlive && !thread.Join(3000)) throw new TimeoutException("Audio thread did not stop");if(isolatedExperiment!=null)isolatedExperiment.MarkJoined(); Ready.Dispose(); }
        internal static void RequireExactSharedFloat32(int supported){if(supported!=0)throw new NotSupportedException("Endpoint did not accept exact shared 48000 Hz stereo Float32; no implicit format substitution. HRESULT="+supported.ToString("X8"));}
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
                if(isolatedExperiment!=null&&OwnedRecorder!=null)throw new InvalidOperationException("Isolated synthetic experiment forbids recording");
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass();
                if(isolatedExperiment==null)device=Native.Device(enumerator,deviceIndex);else Native.Check(enumerator.GetDevice(isolatedExperiment.EndpointId,out device));
                EndpointName = Native.Name(device);
                SelectedEndpointId=ReadSelectedIdentity(delegate{string id;Native.Check(device.GetId(out id));return id;});
                if(isolatedExperiment!=null&&SelectedEndpointId!=isolatedExperiment.EndpointId)throw new InvalidOperationException("Exact experimental endpoint identity changed");
                client = Native.Client(device);DeviceOpened=true;
                Native.Check(client.GetMixFormat(out mix)); WaveFormat mf = (WaveFormat)Marshal.PtrToStructure(mix, typeof(WaveFormat)); MixRate = mf.SamplesPerSecond; MixChannels = mf.Channels;
                WaveFormat format = WaveFormat.FloatStereo48k(); requested = Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WaveFormat))); Marshal.StructureToPtr(format, requested, false);
                long supportBefore=isolatedExperiment==null?0:Stopwatch.GetTimestamp();int supported = client.IsFormatSupported(0, requested, out closest);
                if(isolatedExperiment!=null)isolatedExperiment.CaptureFormatSupport(mix,requested,supported,supportBefore,Stopwatch.GetTimestamp());
                RequireExactSharedFloat32(supported);
                FormatResult = "Exact shared 48000 Hz stereo Float32 accepted; Windows endpoint mix format recorded separately";
                if(isolatedExperiment==null)Native.Check(client.Initialize(0, 0x40000, 200000, 0, requested, IntPtr.Zero));else isolatedExperiment.Initialize(client,requested);
                Native.Check(client.GetBufferSize(out BufferFrames)); if (BufferFrames < 1 || BufferFrames > 2048) throw new NotSupportedException("Endpoint buffer exceeds validated four-block startup bound");
                Native.Check(client.GetStreamLatency(out StreamLatency100ns)); long minPeriod; Native.Check(client.GetDevicePeriod(out DevicePeriod100ns, out minPeriod));
                object value; Guid iid = typeof(IAudioRenderClient).GUID; Native.Check(client.GetService(ref iid, out value)); renderer = (IAudioRenderClient)value;
                iid = typeof(IAudioClock).GUID; Native.Check(client.GetService(ref iid, out value)); clock = (IAudioClock)value; Native.Check(clock.GetFrequency(out DeviceClockFrequency));
                if(isolatedExperiment!=null)isolatedExperiment.BindClock(DeviceClockFrequency,BufferFrames);
                signal = new AutoResetEvent(false); Native.Check(client.SetEventHandle(signal.SafeWaitHandle.DangerousGetHandle()));
                Ready.Set();
                long deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5;
                int startupBlocks=calibratedGameplay?ring.GameplayPrefillBlocks:4;
                while (!stop && ring.Count < startupBlocks && Stopwatch.GetTimestamp() < deadline) Thread.Sleep(2);
                if (stop) return;
                if (ring.Count < startupBlocks) throw new TimeoutException("No "+startupBlocks+"-block prefill; device was not started");
                uint taskIndex=0;mmcss=Native.AvSetMmThreadCharacteristicsW("Audio",ref taskIndex);MmcssRegistered=mmcss!=IntPtr.Zero;if(!MmcssRegistered)MmcssError=Marshal.GetLastWin32Error();
                uint padding; Native.Check(client.GetCurrentPadding(out padding));experimentPadding=padding; Fill(renderer, BufferFrames - padding);if(isolatedExperiment!=null&&stop)return;
                long startBefore=isolatedExperiment==null?0:Stopwatch.GetTimestamp();Native.Check(client.Start());if(isolatedExperiment!=null)isolatedExperiment.Started(startBefore,Stopwatch.GetTimestamp()); Started = true;EverStarted=true; long lastWake = Stopwatch.GetTimestamp(); int consecutiveTimeouts = 0;
                while (!stop)
                {
                    bool signalled=signal.WaitOne(100);
                    if(stop)break;
                    if (!signalled) { WakeTimeouts++; if (++consecutiveTimeouts >= 5) throw new TimeoutException("Audio endpoint stopped signalling"); continue; }
                    consecutiveTimeouts = 0;
                    long begin = Stopwatch.GetTimestamp(), interval = begin - lastWake; lastWake = begin;
                    long allocatedBefore=isolatedExperiment==null?-1:Latency03OutputSession.AllocatedBytes();
                    long paddingBefore=isolatedExperiment==null?0:Stopwatch.GetTimestamp();Native.Check(client.GetCurrentPadding(out padding));long paddingAfter=isolatedExperiment==null?0:Stopwatch.GetTimestamp(); if (padding > BufferFrames) throw new InvalidOperationException("Invalid device padding"); if (padding == 0) EmptyPaddingEvents++;
                    experimentPadding=padding;
                    if(isolatedExperiment!=null){if(!isolatedExperiment.WithinDeadline(begin)||!isolatedExperiment.ObserveClock(clock,SubmittedFrames,padding,paddingBefore,paddingAfter)){isolatedExperiment.RecordCallback(begin,Stopwatch.GetTimestamp(),allocatedBefore,Latency03OutputSession.AllocatedBytes(),padding);break;}LastDevicePosition=isolatedExperiment.LastDevicePosition;LastDeviceQpc100ns=isolatedExperiment.LastRawQpc100ns;}
                    Fill(renderer, BufferFrames - padding);
                    if(isolatedExperiment!=null)isolatedExperiment.RecordCallback(begin,Stopwatch.GetTimestamp(),allocatedBefore,Latency03OutputSession.AllocatedBytes(),padding);
                    if(isolatedExperiment!=null&&stop)break;
                    if(isolatedExperiment==null){ulong qpc; int positionStatus=clock.GetPosition(out LastDevicePosition, out qpc); Native.Check(positionStatus); if(positionStatus!=0)ClockPositionWarnings++; LastDeviceQpc100ns = (long)qpc;}
                    long ticks = Stopwatch.GetTimestamp() - begin; MaximumSubmissionTicks = Math.Max(MaximumSubmissionTicks, ticks);
                    if (Measurements < SubmissionTicks.Length) { SubmissionTicks[Measurements] = ticks; WakeIntervalsTicks[Measurements] = interval; Measurements++; }
                }
                if(isolatedExperiment!=null&&isolatedExperiment.Failure!=Latency03Failure.None)Error="LATENCY-03 terminal failure code "+(int)isolatedExperiment.Failure;
            }
            catch (Exception ex) { Error = ex.GetType().Name + ": " + ex.Message; Muted = true; }
            finally
            {
                long stopBefore=isolatedExperiment==null?0:Stopwatch.GetTimestamp();int stopResult=0,resetResult=0;
                if (client != null) {if(isolatedExperiment==null){client.Stop();client.Reset();}else if(isolatedExperiment.Initialized){isolatedExperiment.StopResetAttempted=true;stopResult=client.Stop();resetResult=client.Reset();}} Started = false; Ready.Set();
                if(mmcss!=IntPtr.Zero)MmcssReverted=Native.AvRevertMmThreadCharacteristics(mmcss);
                if (signal != null) signal.Dispose(); Native.Release(clock); Native.Release(renderer); Native.Release(client); Native.Release(device); Native.Release(enumerator);
                if (requested != IntPtr.Zero) Marshal.FreeCoTaskMem(requested); if (mix != IntPtr.Zero) Marshal.FreeCoTaskMem(mix); if (closest != IntPtr.Zero) Marshal.FreeCoTaskMem(closest);
                if(isolatedExperiment!=null)isolatedExperiment.FinishOutput(stopResult,resetResult,stopBefore,Stopwatch.GetTimestamp());
            }
        }
        private unsafe void Fill(IAudioRenderClient renderer, uint frames)
        {
            if(isolatedExperiment!=null){if(frames==0||stop)return;if(OwnedRecorder!=null){isolatedExperiment.Fail(Latency03Failure.ForbiddenRecording);stop=true;return;}MaximumCallbackFrames=Math.Max(MaximumCallbackFrames,frames);MinimumCallbackFrames=Math.Min(MinimumCallbackFrames,frames);bool okay=isolatedExperiment.Submit(ring,renderer,frames,SubmittedFrames,experimentPadding,Muted?0:volume);if(isolatedExperiment.LastSubmissionCommitted)SubmittedFrames+=frames;if(!okay){Muted=true;stop=true;}return;}
            if (frames == 0 || stop) return; IntPtr data; Native.Check(renderer.GetBuffer(frames, out data));
            MaximumCallbackFrames=Math.Max(MaximumCallbackFrames,frames);MinimumCallbackFrames=Math.Min(MinimumCallbackFrames,frames);
            int captureSlot=-1;OwnedOutputTap recorder=OwnedRecorder;
            try {long underflow=ring.UnderflowFrames,endSilence=ring.EndSilenceFrames,producerStart=ring.ConsumedFrames-underflow-endSilence;
                // The live route deliberately passes no event bus: native
                // event acquisition/coexistence/clock mapping are unqualified.
                int supplied=OwnedPcmSubmission.Fill(ring,(float*)data,(int)frames,Muted?0:volume,calibratedGameplay,SubmittedFrames,null);
                if(recorder!=null)captureSlot=recorder.Prepare((float*)data,(int)frames,SubmittedFrames,ring.ConsumedFrames,producerStart,supplied,ring.UnderflowFrames-underflow,ring.EndSilenceFrames-endSilence); }
            finally {try{Native.Check(renderer.ReleaseBuffer(frames, 0));}catch{if(recorder!=null)recorder.Cancel(captureSlot);throw;} }
            if(recorder!=null)recorder.Commit(captureSlot);
            SubmittedFrames += frames;
            ring.RequireContinuousProducer();
        }
        public Dictionary<string, object> Metrics()
        {
            // Status is now sampled during gameplay, not only after disposal.
            // Snapshot the published count once so a callback cannot grow the
            // iteration beyond the arrays allocated by this status call.
            int count=Math.Min(Volatile.Read(ref Measurements),SubmissionTicks.Length);
            var duration = new double[count]; var intervals = new double[count];
            for (int i = 0; i < count; i++) { duration[i] = SubmissionTicks[i] * 1000.0 / Stopwatch.Frequency; intervals[i] = WakeIntervalsTicks[i] * 1000.0 / Stopwatch.Frequency; }
            Array.Sort(duration); Array.Sort(intervals);
            return new Dictionary<string, object> {
                {"endpointName",EndpointName},{"format",FormatResult},{"mixSampleRate",MixRate},{"mixChannels",MixChannels},{"processingSampleRate",48000},{"processingChannels",2},
                {"endpointBufferFrames",BufferFrames},{"endpointBufferMilliseconds",BufferFrames/48.0},{"streamLatencyMilliseconds",StreamLatency100ns/10000.0},{"devicePeriodMilliseconds",DevicePeriod100ns/10000.0},
                {"producerStartupBlocks",calibratedGameplay?ring.GameplayPrefillBlocks:4},{"producerReserveMilliseconds",calibratedGameplay?ring.SelectedGameplayReserveMilliseconds:4*512/48.0},{"bufferedFrames",ring.BufferedFrames},{"maximumCallbackFrames",MaximumCallbackFrames},{"minimumCallbackFrames",MinimumCallbackFrames==UInt32.MaxValue?0:MinimumCallbackFrames},
                {"mmcssTask","Audio"},{"mmcssRegistered",MmcssRegistered},{"mmcssReverted",MmcssReverted},{"mmcssError",MmcssError},
                {"submittedFrames",SubmittedFrames},{"consumedFrames",ring.ConsumedFrames},{"underflowFrames",ring.UnderflowFrames},{"firstUnderflowFrame",ring.FirstUnderflowFrame},{"endOfStreamSilenceFrames",ring.EndSilenceFrames},{"emptyPaddingEvents",EmptyPaddingEvents},{"wakeTimeouts",WakeTimeouts},
                {"submissionMeasurements",count},{"submissionMedianMs",Percentile(duration,.5)},{"submissionP99Ms",Percentile(duration,.99)},{"submissionMaxMs",MaximumSubmissionTicks*1000.0/Stopwatch.Frequency},
                {"deviceOpened",DeviceOpened},{"everStarted",EverStarted},{"currentlyStarted",Started},{"selectedEndpointIdAvailable",SelectedEndpointId!=null},
                {"wakeIntervalP99Ms",Percentile(intervals,.99)},{"deviceClockFrequency",DeviceClockFrequency},{"deviceClockPosition",LastDevicePosition},{"deviceQpc100ns",LastDeviceQpc100ns},{"deviceClockPositionWarnings",ClockPositionWarnings},
                {"peakSubmitted",ring.Peak},{"rmsSubmitted",ring.ConsumedFrames>0?Math.Sqrt(ring.SumSquares/(ring.ConsumedFrames*2)):0},{"pcmRingBytes",PcmRing.Slots*PcmRing.MaximumFrames*2*4},{"error",Error},
                {"limits","Shared endpoint acknowledgement is not physical speaker or subjective listening confirmation; empty padding events can include startup and are separate from producer underflows."}
            };
        }
        private static double Percentile(double[] values, double p) { return values.Length == 0 ? 0 : values[Math.Min(values.Length-1,(int)(values.Length*p))]; }
    }
}
