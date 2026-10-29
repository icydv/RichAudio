using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.Serialization.Json;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;
using RichAudio.Beacon.Transport;
using RichAudio.GeometryResearch;
namespace RichAudio.GeometryLive
{
    public static class GeometryWire
    {
        public const int MaximumBytes=49152;public const string PipeName="RichAudio.Acoustics081.Geometry.v1";
        public static byte[] Encode(GeometryPacket p){using(var m=new MemoryStream()){
            new DataContractJsonSerializer(typeof(GeometryPacket)).WriteObject(m,p);Protocol.Check(m.Length>0&&m.Length<=MaximumBytes,"geometry frame size");return m.ToArray();}}
        public static GeometryPacket Decode(byte[] bytes){Protocol.Check(bytes.Length>0&&bytes.Length<=MaximumBytes,"geometry frame size");
            using(var m=new MemoryStream(bytes,false))return (GeometryPacket)new DataContractJsonSerializer(typeof(GeometryPacket)).ReadObject(m);}
        public static void Validate(GeometryPacket p,long now)
        {
            Protocol.Check(p!=null&&p.Schema==1&&p.SourcePid>0&&System.Text.RegularExpressions.Regex.IsMatch(p.ListenerSession??"","\\A[a-f0-9]{32}\\z")&&
                System.Text.RegularExpressions.Regex.IsMatch(p.GeometrySession??"","\\A[a-f0-9]{32}\\z")&&p.ClockId=="geometry-"+p.GeometrySession&&
                p.ListenerGeneration>0&&p.Sequence>=0&&p.Frequency==Stopwatch.Frequency&&p.Build=="1.0.1158.16"&&p.Framework=="1.132.1428.17748"&&p.Interior>=0,"geometry identity/build");
            double age=(now-p.SentTicks)*1000.0/p.Frequency;Protocol.Check(age>=0&&age<=250,"geometry send freshness");
            Protocol.Check(p.Pairs!=null&&p.Pairs.Length==2,"geometry paired clocks");
            double low=Double.NegativeInfinity,high=Double.PositiveInfinity;
            foreach(var s in p.Pairs){Protocol.Check(s!=null&&ObservationRules.Finite(s.ObservationMs)&&s.ObservationMs>=0&&s.ListenerTicks>=0&&
                ObservationRules.Finite(s.UncertaintyMs)&&s.UncertaintyMs>=0&&s.UncertaintyMs<=1,"paired uncertainty");
                double offset=s.ListenerTicks*1000.0/p.Frequency-s.ObservationMs;low=Math.Max(low,offset-s.UncertaintyMs);high=Math.Min(high,offset+s.UncertaintyMs);}
            Protocol.Check(high>=low-1e-7&&p.Pairs[1].ObservationMs-p.Pairs[0].ObservationMs>=100&&
                p.Pairs[1].ObservationMs-p.Pairs[0].ObservationMs<=60000&&p.Pairs[1].ListenerTicks>p.Pairs[0].ListenerTicks&&
                p.Pairs[1].ListenerTicks<=now,"paired clock order/origin");
            Protocol.Check(p.Groups!=null&&p.Groups.Length<=2&&(p.Status=="snapshot"||p.Status=="unavailable"),"geometry status/groups");
            if(p.Status=="snapshot")Protocol.Check(p.Groups.Length>0,"snapshot support required");
            foreach(var g in p.Groups){var patch=PatchReconstruction.Fit(g);
                Protocol.Check(g.Session==p.GeometrySession&&g.Build==p.Build&&g.Framework==p.Framework&&g.Interior==p.Interior,"group context");
                Protocol.Check(g.FinishedMs-g.StartedMs>=350,"live nine-ray sensing cadence");
                for(int i=1;i<g.Samples.Count;i++)Protocol.Check(g.Samples[i].Observation.ObservedAtMs-g.Samples[i-1].Observation.ObservedAtMs>=49,"live query rate");
                double upper=now*1000.0/p.Frequency-low;Protocol.Check(upper>=g.FinishedMs&&upper<g.FinishedMs+1000,"original geometry expiry");
                Protocol.Check(g.Kind=="wall"?Math.Abs(patch.Normal.Z)<=.2:Math.Abs(patch.Normal.Z)>=Math.Cos(Math.PI/6),"qualified orientation");}
        }
        public static byte[] Read(PipeStream pipe,int timeout)
        {
            byte[] h=new byte[4];if(!ReadExact(pipe,h,timeout))return null;int n=BitConverter.ToInt32(h,0);
            Protocol.Check(n>0&&n<=MaximumBytes,"geometry frame length");byte[] b=new byte[n];Protocol.Check(ReadExact(pipe,b,250),"truncated geometry frame");return b;
        }
        private static bool ReadExact(PipeStream p,byte[] b,int timeout){int at=0;var watch=Stopwatch.StartNew();while(at<b.Length){
            var a=p.BeginRead(b,at,b.Length-at,null,null);using(var done=a.AsyncWaitHandle){if(!done.WaitOne(Math.Max(1,timeout-(int)watch.ElapsedMilliseconds))){p.Dispose();throw new TimeoutException("geometry read");}
                int n=p.EndRead(a);if(n==0){Protocol.Check(at==0,"partial geometry frame");return false;}at+=n;}}return true;}
        public static void Write(PipeStream p,byte[] b){var frame=new byte[b.Length+4];Buffer.BlockCopy(BitConverter.GetBytes(b.Length),0,frame,0,4);Buffer.BlockCopy(b,0,frame,4,b.Length);TransportStop.Write(p,frame);}
    }
    // A latest-value mailbox. Qualification, serialization, connection and pipe IO
    // are strictly background work, never performed by Publish on a game fiber.
    public sealed class GeometryPublisher:IDisposable
    {
        private readonly string pipe;private readonly AutoResetEvent signal=new AutoResetEvent(false);private GeometryPacket latest;
        private Thread thread;private volatile bool stopped,complete;private NamedPipeClientStream active;
        public long Sent,Rejected,Replaced;public string Reason;public GeometryPacket LastRejected;
        public volatile bool Connected;
        public bool Finished{get{return thread!=null&&!thread.IsAlive;}}
        public GeometryPublisher(string pipeName){pipe=pipeName;}
        public void Start(){if(thread!=null)throw new InvalidOperationException("publisher already started");thread=new Thread(Run){IsBackground=true,Name="RichAudio geometry writer"};thread.Start();}
        public void Publish(GeometryPacket p){if(stopped)return;if(Interlocked.Exchange(ref latest,p)!=null)Interlocked.Increment(ref Replaced);signal.Set();}
        private void Run(){try{using(var p=new NamedPipeClientStream(".",pipe,PipeDirection.Out,PipeOptions.Asynchronous)){
            TileGroup wall=null,ground=null;
            active=p;p.Connect(500);Connected=true;while(!stopped){signal.WaitOne(100);var packet=Interlocked.Exchange(ref latest,null);if(packet==null){if(complete)break;continue;}
                try{
                    long now=Stopwatch.GetTimestamp();GeometryWire.Validate(packet,now);
                    if(packet.Status=="snapshot"){
                        var fresh=packet.Groups[0];if(fresh.Kind=="wall")wall=fresh;else ground=fresh;
                        double lowerOffset=Double.PositiveInfinity;foreach(var pair in packet.Pairs)lowerOffset=Math.Min(lowerOffset,pair.ListenerTicks*1000.0/packet.Frequency-pair.ObservationMs-pair.UncertaintyMs);
                        double current=now*1000.0/packet.Frequency-lowerOffset;var support=new System.Collections.Generic.List<TileGroup>();
                        foreach(var g in new[]{wall,ground})if(g!=null&&g.Session==packet.GeometrySession&&g.Interior==packet.Interior&&current<g.FinishedMs+900)support.Add(g);
                        packet.Groups=support.ToArray();GeometryWire.Validate(packet,now);
                    }else{wall=null;ground=null;}
                }catch(Exception e){wall=null;ground=null;Rejected++;LastRejected=packet;packet.Status="unavailable";packet.Reason=e.GetType().Name;packet.RejectedGroup=packet.Groups.Length>0?packet.Groups[0]:packet.RejectedGroup;packet.Groups=new TileGroup[0];}
                packet.SentTicks=Stopwatch.GetTimestamp();GeometryWire.Write(p,GeometryWire.Encode(packet));Sent++;
            }}}catch(Exception e){Reason=e.GetType().Name;}finally{active=null;Connected=false;}}
        public void RequestStop(){stopped=true;signal.Set();var p=active;if(p!=null)try{p.Dispose();}catch{}}
        public void Complete(){complete=true;signal.Set();}
        public void Dispose(){RequestStop();if(thread!=null&&Thread.CurrentThread!=thread)thread.Join(1000);}
    }
    public sealed class GeometryPipeServer:IDisposable
    {
        [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
        private readonly string name;private readonly Action<GeometryPacket,uint> consumer;private readonly Action<string> unavailable;
        private volatile bool stopped;private NamedPipeServerStream active;private Thread thread;
        public long Accepted,Rejected,Connections;public string Reason;
        public byte[] LastRejectedBytes;
        public GeometryPipeServer(string name,Action<GeometryPacket,uint> consumer,Action<string> unavailable){this.name=name;this.consumer=consumer;this.unavailable=unavailable;}
        public void Start(){thread=new Thread(Run){IsBackground=true,Name="RichAudio geometry receiver"};thread.Start();}
        private void Run(){int attempts=0;while(!stopped&&attempts++<4){try{using(var p=new NamedPipeServerStream(name,PipeDirection.In,1,PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,4096,65536,StatePipeServer.CurrentUserSecurity())){active=p;var c=p.BeginWaitForConnection(null,null);
            using(var done=c.AsyncWaitHandle){if(!done.WaitOne(30000))throw new TimeoutException("geometry connect");p.EndWaitForConnection(c);}Connections++;
            uint pid;if(!GetNamedPipeClientProcessId(p.SafePipeHandle,out pid))throw new IOException("geometry peer PID");string session=null,listenerSession=null;long sequence=-1,generation=0;int? interior=null;
            double lastFinished=-1;int frames=0;
            while(!stopped){byte[] bytes=GeometryWire.Read(p,1250);if(bytes==null)break;GeometryPacket packet;
                try{packet=GeometryWire.Decode(bytes);GeometryWire.Validate(packet,Stopwatch.GetTimestamp());
                Protocol.Check(++frames<=10&&packet.Sequence<10,"bounded sensing stream");
                if(packet.Status=="snapshot"){double newest=-1;foreach(var g in packet.Groups)newest=Math.Max(newest,g.FinishedMs);
                    Protocol.Check(newest>lastFinished,"old capture republication");lastFinished=newest;}
                Protocol.Check(packet.SourcePid==pid&&(session==null||packet.GeometrySession==session)&&packet.Sequence>sequence,"geometry peer/sequence");
                Protocol.Check(listenerSession==null||packet.ListenerSession==listenerSession&&packet.ListenerGeneration==generation&&packet.Interior==interior,"geometry stream context changed");
                listenerSession=packet.ListenerSession;generation=packet.ListenerGeneration;interior=packet.Interior;
                session=packet.GeometrySession;sequence=packet.Sequence;consumer(packet,pid);Accepted++;}catch{LastRejectedBytes=bytes;throw;}}
        }}catch(Exception e){if(!stopped){Rejected++;Reason=e.GetType().Name;}}finally{active=null;if(!stopped)unavailable(Reason??"geometry-disconnected");}}}
        public void Dispose(){stopped=true;var p=active;if(p!=null)try{p.Dispose();}catch{}if(thread!=null)thread.Join(1000);}
    }
}
