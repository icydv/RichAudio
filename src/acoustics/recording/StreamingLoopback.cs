using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace RichAudio.Beacon.Windows.Recording
{
    // Windows SDK10.0.26100.0 mmdeviceapi.h IMMEndpoint public ABI.
    [ComImport,Guid("1BE09788-6894-4089-8586-9A2A6C265AC5"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IRenderEndpointFlow {[PreserveSig]int GetDataFlow(out int flow);}
    internal interface ILoopbackDriver:IDisposable
    {
        bool DeviceFree {get;}
        void BeforeActivation();byte[] Open(string endpoint);void BeforeStart();void Start();bool ReadPacket();
    }
    // Driver injection is internal unit-test composition, not an environment or
    // runtime bypass. A fixture capability is forbidden from using a real driver.
    internal sealed class StreamingLoopback:IDisposable
    {
        readonly RecordingSession session;readonly string endpoint;readonly Thread thread;readonly ILoopbackDriver driver;
        readonly object lifecycle=new object();volatile bool stop;bool started;
        internal StreamingLoopback(RecordingSession owner,string selectedOutputEndpointId,ILoopbackDriver fake=null)
        {session=owner;endpoint=selectedOutputEndpointId;driver=fake??new NativeLoopbackDriver(owner,delegate{return !stop&&session.Accepting;});thread=new Thread(Run){IsBackground=true,Name="RichAudio selected endpoint loopback"};thread.SetApartmentState(ApartmentState.STA);}
        internal void Start(){lock(lifecycle){if(started||stop||!session.Accepting)throw new InvalidOperationException("Loopback start was cancelled");if(session.FixtureOnly&&!driver.DeviceFree)throw new InvalidOperationException("Fixture capability cannot open an endpoint");started=true;thread.Start();}}
        void Run()
        {
            string error=null;
            try{
                driver.BeforeActivation();if(stop||!session.Accepting)return;
                byte[] format=driver.Open(endpoint);if(stop||!session.Accepting)return;
                session.SetLoopbackFormat(format,endpoint);driver.BeforeStart();if(stop||!session.Accepting)return;
                driver.Start();
                while(!stop&&session.Accepting)if(!driver.ReadPacket())Thread.Sleep(2);
            }catch(OperationCanceledException){if(!stop&&session.Accepting)error="unexpected-loopback-cancellation";}
            catch(Exception failure){error="loopback: "+failure.GetType().Name+": "+failure.Message;}
            finally{try{driver.Dispose();}catch(Exception failure){error=error??("loopback-stop: "+failure.GetType().Name);}session.LoopbackStopped(error);}
        }
        public void Dispose(){bool join;lock(lifecycle){stop=true;join=started;}if(join&&thread.IsAlive&&!thread.Join(2000))session.Fault("loopback-stop-timeout; worker retains COM ownership");}
    }
    internal sealed class NativeLoopbackDriver:ILoopbackDriver
    {
        readonly RecordingSession session;readonly Func<bool> continuing;IMMDeviceEnumerator enumerator;IMMDevice device;IAudioClient client;IAudioCaptureClient capture;IntPtr mix;WaveFormat format;bool started;
        internal NativeLoopbackDriver(RecordingSession owner,Func<bool> permission){session=owner;continuing=permission;}
        public bool DeviceFree {get{return false;}}
        void Check(){if(!continuing())throw new OperationCanceledException();}
        public void BeforeActivation(){}
        public void BeforeStart(){}
        public byte[] Open(string endpoint)
        {
            Check();enumerator=(IMMDeviceEnumerator)new MMDeviceEnumeratorClass();Check();Native.Check(enumerator.GetDevice(endpoint,out device));string actual;Native.Check(device.GetId(out actual));if(actual!=endpoint)throw new InvalidOperationException("Loopback endpoint identity changed");
            int flow;Native.Check(((IRenderEndpointFlow)device).GetDataFlow(out flow));if(flow!=0)throw new InvalidOperationException("Loopback requires the selected render endpoint; microphone capture is forbidden");
            Check();client=Native.Client(device);session.MarkEndpointOpened();Check();Native.Check(client.GetMixFormat(out mix));format=(WaveFormat)Marshal.PtrToStructure(mix,typeof(WaveFormat));
            if(format.ExtraSize>46)throw new NotSupportedException("Bounded endpoint format required");var bytes=new byte[18+format.ExtraSize];Marshal.Copy(mix,bytes,0,bytes.Length);
            using(var memory=new System.IO.MemoryStream())using(var check=new LosslessWaveWriter(memory,bytes)){}
            Check();Native.Check(client.Initialize(0,0x20000,200000,0,mix,IntPtr.Zero));object value;Guid iid=typeof(IAudioCaptureClient).GUID;Check();Native.Check(client.GetService(ref iid,out value));capture=(IAudioCaptureClient)value;return bytes;
        }
        public void Start(){Check();Native.Check(client.Start());started=true;}
        public bool ReadPacket()
        {
            Check();uint next;Native.Check(capture.GetNextPacketSize(out next));if(next==0)return false;
            IntPtr data;uint frames,flags;ulong deviceFrame,qpc100ns;long before=Stopwatch.GetTimestamp();Native.Check(capture.GetBuffer(out data,out frames,out flags,out deviceFrame,out qpc100ns));long after=Stopwatch.GetTimestamp();if(frames==0)return false;int slot=-1;
            try{slot=session.PrepareLoopback(data,checked((int)frames),checked((int)frames*format.BlockAlign),flags,deviceFrame,qpc100ns,before,after);}
            finally{try{Native.Check(capture.ReleaseBuffer(frames));}catch{session.CancelLoopback(slot);throw;}}
            session.CommitLoopback(slot);return true;
        }
        public void Dispose(){try{if(client!=null&&started)Native.Check(client.Stop());}finally{Native.Release(capture);Native.Release(client);Native.Release(device);Native.Release(enumerator);if(mix!=IntPtr.Zero)Marshal.FreeCoTaskMem(mix);}}
    }
}
