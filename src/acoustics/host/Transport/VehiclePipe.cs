using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;
namespace RichAudio.Beacon.Transport
{
    public static class VehicleWire
    {
        public const string PipeName="RichAudio.VehicleLive01.v1";
        public static void Write(PipeStream pipe,byte[] payload){Protocol.Check(payload.Length>0&&payload.Length<=VehicleProtocol.MaximumBytes,"vehicle frame size");var frame=new byte[payload.Length+4];Buffer.BlockCopy(BitConverter.GetBytes(payload.Length),0,frame,0,4);Buffer.BlockCopy(payload,0,frame,4,payload.Length);TransportStop.Write(pipe,frame);}
        private static bool ReadExact(PipeStream pipe,byte[] bytes,int timeout){int offset=0;var watch=Stopwatch.StartNew();while(offset<bytes.Length){var read=pipe.BeginRead(bytes,offset,bytes.Length-offset,null,null);using(var ready=read.AsyncWaitHandle){if(!ready.WaitOne(Math.Max(1,timeout-(int)watch.ElapsedMilliseconds))){pipe.Dispose();throw new TimeoutException("vehicle read deadline");}int count=pipe.EndRead(read);if(count==0){Protocol.Check(offset==0,"vehicle partial frame");return false;}offset+=count;}}return true;}
        public static byte[] Read(PipeStream pipe){var header=new byte[4];if(!ReadExact(pipe,header,750))return null;int n=BitConverter.ToInt32(header,0);Protocol.Check(n>0&&n<=VehicleProtocol.MaximumBytes,"vehicle frame length");var payload=new byte[n];Protocol.Check(ReadExact(pipe,payload,250),"vehicle truncated payload");return payload;}
    }
    // One connection, no retry. Single latest immutable copy; all serialization and IO are background work.
    public sealed class VehiclePublisher:IDisposable
    {
        private readonly string name;private readonly AutoResetEvent signal=new AutoResetEvent(false);private readonly object sync=new object();
        private VehiclePacket latest;private Thread thread;private NamedPipeClientStream active;private volatile bool stopped,complete;
        public volatile bool Connected;public long Sent,Replaced,Expired;public string Reason;
        public bool Finished{get{return thread!=null&&!thread.IsAlive;}}
        public VehiclePublisher(string pipeName){name=pipeName;}
        public void Start(){if(thread!=null)throw new InvalidOperationException("one vehicle connection");thread=new Thread(Run){IsBackground=true,Name="RichAudio vehicle writer"};thread.Start();}
        public void Publish(VehiclePacket p){var copy=VehicleProtocol.Copy(p);lock(sync){if(stopped||complete)return;if(latest!=null)Replaced++;latest=copy;}signal.Set();}
        private void Run(){try{using(var pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
            active=pipe;pipe.Connect(500);Connected=true;
            while(!stopped){signal.WaitOne(50);VehiclePacket packet;lock(sync){packet=latest;latest=null;}if(packet==null){if(complete)break;continue;}
                long now=Stopwatch.GetTimestamp();if((now-packet.ObservationTicks)*1000.0/packet.ClockFrequency>250){Expired++;continue;}
                byte[] bytes=VehicleProtocol.Encode(packet);now=Stopwatch.GetTimestamp();if((now-packet.ObservationTicks)*1000.0/packet.ClockFrequency>250){Expired++;continue;}
                VehicleProtocol.Fresh(packet,now);VehicleWire.Write(pipe,bytes);TransportStop.Ack(pipe,TransportStop.Accepted);Sent++;
            }
            if(!stopped){TransportStop.Write(pipe,TransportStop.Frame());TransportStop.Ack(pipe,TransportStop.Stopped);Reason="deliberate-stop";}
        }}catch(Exception e){if(!stopped)Reason=TransportStop.Kind(e);}finally{Connected=false;active=null;}}
        public void Complete(){complete=true;signal.Set();}
        public void RequestStop(){stopped=true;signal.Set();var p=active;if(p!=null)try{p.Dispose();}catch(IOException){}catch(ObjectDisposedException){}}
        public void Dispose(){RequestStop();if(thread!=null&&Thread.CurrentThread!=thread)thread.Join(1000);}
    }
    public sealed class VehiclePipeServer:IDisposable
    {
        [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
        private readonly string name;private readonly Action<VehiclePacket,uint> consumer;private readonly Action<string> terminal;
        private volatile bool stopped;private NamedPipeServerStream active;private Thread thread;
        public long Accepted,Rejected,Connections;public string Reason;public bool ShutdownCompleted{get{return thread==null||!thread.IsAlive;}}
        public VehiclePipeServer(string pipeName,Action<VehiclePacket,uint> receive,Action<string> end){name=pipeName;consumer=receive;terminal=end;}
        public void Start(){if(thread!=null)throw new InvalidOperationException("one vehicle receiver");thread=new Thread(Run){IsBackground=true,Name="RichAudio vehicle receiver"};thread.Start();}
        private void Run(){try{using(var pipe=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,StatePipeServer.CurrentUserSecurity())){
            active=pipe;var wait=pipe.BeginWaitForConnection(null,null);using(var ready=wait.AsyncWaitHandle){if(!ready.WaitOne(30000))throw new TimeoutException("vehicle connect deadline");pipe.EndWaitForConnection(wait);}Connections++;
            uint peer;if(!GetNamedPipeClientProcessId(pipe.SafePipeHandle,out peer))throw new IOException("vehicle peer identity");var validator=new VehicleValidator();
            while(!stopped){var bytes=VehicleWire.Read(pipe);if(bytes==null){Reason="unexpected-eof";break;}
                if(TransportStop.IsStop(bytes,bytes.Length)){TransportStop.Write(pipe,new[]{TransportStop.Stopped});Reason="deliberate-stop";break;}
                var packet=VehicleProtocol.Decode(bytes);validator.Accept(packet,Stopwatch.GetTimestamp(),peer);consumer(packet,peer);Accepted++;TransportStop.Write(pipe,new[]{TransportStop.Accepted});
            }
        }}catch(Exception e){if(!stopped){Rejected++;Reason=TransportStop.Kind(e);}}finally{active=null;if(!stopped)terminal(Reason??"unexpected-eof");}}
        public bool StopAndWait(int timeout){stopped=true;var p=active;if(p!=null)try{p.Dispose();}catch(IOException){}catch(ObjectDisposedException){}return thread==null||Thread.CurrentThread!=thread&&thread.Join(timeout);}
        public void Dispose(){StopAndWait(1000);}
    }
}
