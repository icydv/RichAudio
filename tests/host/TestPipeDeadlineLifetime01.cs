// Original, device-free scheduling controls. The companion tool adds observation
// delegates to a private helper copy; no production deadline or operation changes.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.GeometryLive;

public static class TestPipeDeadlineLifetime01
{
    [DllImport("kernel32.dll")] static extern uint SetErrorMode(uint mode);
    static readonly object sync=new object();
    static readonly List<object> finishes=new List<object>();
    static readonly ManualResetEvent began=new ManualResetEvent(false),finished=new ManualResetEvent(false);
    static int starts,ends,checks;
    static void Need(bool value,string reason){Interlocked.Increment(ref checks);if(!value)throw new Exception(reason);}
    static void Started(bool connection,bool write){Interlocked.Increment(ref starts);began.Set();}
    static void Finished(bool connection,bool write,int count,Exception error,bool abandoned){
        lock(sync)finishes.Add(new{connection,write,count,errorType=error==null?null:error.GetType().Name,abandoned});
        Interlocked.Increment(ref ends);finished.Set();
    }
    static void AwaitEnds(int wanted){var watch=Stopwatch.StartNew();while(Volatile.Read(ref ends)<wanted&&watch.ElapsedMilliseconds<2000)Thread.Sleep(1);Need(Volatile.Read(ref ends)==wanted,"one callback-owned End per begun operation");}
    sealed class Pair:IDisposable {
        public readonly NamedPipeServerStream Server;public readonly NamedPipeClientStream Client;
        public Pair(){string name="RichAudio.Original.Lifetime01."+Guid.NewGuid().ToString("N");
            Server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096);
            Client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous);
            var op=Server.BeginWaitForConnection(null,null);Client.Connect(1000);Server.EndWaitForConnection(op);}
        public void Dispose(){Client.Dispose();Server.Dispose();}
    }
    sealed class HeldCompletions:IDisposable {
        readonly ManualResetEvent entered=new ManualResetEvent(false),release=new ManualResetEvent(false),exited=new ManualResetEvent(false);bool released;
        unsafe void Block(uint error,uint bytes,NativeOverlapped* pointer){Overlapped.Free(pointer);entered.Set();release.WaitOne(6000);exited.Set();}
        public static void Configure(){int workers,io;ThreadPool.GetMaxThreads(out workers,out io);
            Need(ThreadPool.SetMinThreads(1,1)&&ThreadPool.SetMaxThreads(workers,1),"bounded original completion scheduler");}
        public unsafe HeldCompletions(){int workers,io;
            var overlapped=new Overlapped();Need(ThreadPool.UnsafeQueueNativeOverlapped(overlapped.Pack(Block,null)),"queue one original callback");
            Need(entered.WaitOne(2000),"original callback entered");ThreadPool.GetAvailableThreads(out workers,out io);Need(io==0,"exactly one held completion thread");}
        public void Release(){if(released)return;released=true;release.Set();Need(exited.WaitOne(1000),"original scheduling callback exited");}
        public void Dispose(){Release();entered.Dispose();release.Dispose();exited.Dispose();}
    }
    sealed class Call {
        public readonly Thread Thread;public Exception Error;public bool Joined;
        public Call(Action action){Thread=new Thread(delegate(){try{action();}catch(Exception e){Error=e;}}){IsBackground=true};Thread.Start();}
        public void Join(){Joined=Thread.Join(2000);Need(Joined,"owned operation thread joined");}
    }
    static void Timeout(string mode){
        using(var pair=new Pair())using(var hold=new HeldCompletions()){
            var handle=pair.Server.SafePipeHandle;
            bool timed=false;var watch=Stopwatch.StartNew();try{
                if(mode=="geometry-timeout")GeometryWire.Read(pair.Server,25);
                else if(mode=="read-timeout")PipeDeadline.Read(pair.Server,new byte[4],0,4,25,"original read timeout");
                else PipeDeadline.Write((Stream)pair.Server,new byte[1048576],25,"original write timeout");
            }catch(TimeoutException){timed=true;}
            Need(timed,"actual read/write timeout retained");Need(watch.ElapsedMilliseconds<1500,"caller did not wait for held completion");
            Need(starts==1&&ends==0,"caller abandoned before real cancellation callback");Need(handle.IsClosed,"timed-out stream closed");
            hold.Release();AwaitEnds(1);
        }
    }
    static void ConnectTimeout(){string name="RichAudio.Original.ConnectTimeout01."+Guid.NewGuid().ToString("N");
        using(var server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))using(var hold=new HeldCompletions()){
            var handle=server.SafePipeHandle;
            bool timed=false;try{PipeDeadline.WaitForConnection(server,25,"original connect timeout");}catch(TimeoutException){timed=true;}
            Need(timed&&starts==1&&ends==0&&handle.IsClosed,"actual connect cancellation precedes callback");hold.Release();AwaitEnds(1);
        }
    }
    static void ServerStop(bool geometry){string name="RichAudio.Original.ServerStop01."+Guid.NewGuid().ToString("N");
        IDisposable server=geometry?(IDisposable)new GeometryPipeServer(name,delegate{},delegate{}):new StatePipeServer(name,delegate{});
        using(var hold=new HeldCompletions()){
            Call closing=null;try{
                if(geometry)((GeometryPipeServer)server).Start();else ((StatePipeServer)server).Start();
                Need(began.WaitOne(2000),"actual server BeginWait observed");closing=new Call(server.Dispose);
                Thread.Sleep(30);Need(ends==0,"server cancellation callback remains held");hold.Release();closing.Join();
                Need(closing.Error==null,"actual server stop succeeds");AwaitEnds(1);
                if(!geometry)Need(((StatePipeServer)server).ShutdownCompleted,"actual state receiver joined");
            }finally{hold.Release();if(closing!=null&&!closing.Joined)closing.Join();server.Dispose();}
        }
    }
    static void ServerStopBeforeActive(){
        var before=new ManualResetEvent(false);var stopped=new ManualResetEvent(false);var release=new ManualResetEvent(false);int unavailable=0;
        var server=new GeometryPipeServer("RichAudio.Original.PreActive01."+Guid.NewGuid().ToString("N"),delegate{},delegate{Interlocked.Increment(ref unavailable);});Call closing=null;
        GeometryPipeServer.BeforeActiveObserved01=delegate{before.Set();Need(release.WaitOne(2000),"private pre-active gate released");};
        GeometryPipeServer.StoppedObserved01=delegate{stopped.Set();};
        try{server.Start();Need(before.WaitOne(1000),"actual geometry worker paused before active publication");closing=new Call(server.Dispose);
            Need(stopped.WaitOne(1000),"actual Dispose set stopped before active publication");release.Set();closing.Join();
            var worker=(Thread)typeof(GeometryPipeServer).GetField("thread",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(server);
            Need(closing.Error==null&&!worker.IsAlive,"pre-active stop joins actual geometry worker");
            Need(starts==0&&ends==0&&unavailable==0,"stopped worker never begins connection or rearms unavailable callback");
        }finally{release.Set();if(closing!=null&&!closing.Joined)closing.Join();server.Dispose();GeometryPipeServer.BeforeActiveObserved01=null;GeometryPipeServer.StoppedObserved01=null;before.Dispose();stopped.Dispose();release.Dispose();}
    }
    static void PeerClosure(bool partial){using(var pair=new Pair()){
        if(partial)pair.Client.Write(new byte[]{7,0},0,2);
        using(var hold=new HeldCompletions()){
            byte[] value=null;var call=new Call(delegate{value=GeometryWire.Read(pair.Server,1000);});
            try{Need(began.WaitOne(1000),"actual geometry read began");pair.Client.Dispose();hold.Release();call.Join();
                if(partial)Need(call.Error is InvalidDataException,"partial header still rejected");else Need(call.Error==null&&value==null,"closed peer remains clean EOF");
                AwaitEnds(partial?2:1);
            }finally{hold.Release();if(!call.Joined){pair.Server.Dispose();call.Join();}}
        }
    }}
    static void SuccessfulFraming(){using(var pair=new Pair()){
        byte[] body=new byte[]{2,3,5,7};GeometryWire.Write(pair.Client,body);byte[] result=GeometryWire.Read(pair.Server,1000);
        Need(result.Length==4&&result[0]==2&&result[1]==3&&result[2]==5&&result[3]==7,"actual geometry framing unchanged");AwaitEnds(3);
    }}
    static void SuccessfulConnection(){string name="RichAudio.Original.ConnectSuccess01."+Guid.NewGuid().ToString("N");
        using(var server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
            var call=new Call(delegate{PipeDeadline.WaitForConnection(server,1000,"original connect");});
            try{Need(began.WaitOne(1000),"actual connect began");client.Connect(1000);call.Join();Need(call.Error==null&&server.IsConnected,"actual connect accepted");AwaitEnds(1);}
            finally{if(!call.Joined){server.Dispose();call.Join();}}
        }
    }
    sealed class OriginalLateStream:Stream {
        sealed class Result:IAsyncResult {
            public readonly ManualResetEvent Event=new ManualResetEvent(false);public AsyncCallback Callback;public bool Complete;
            public object AsyncState{get{return null;}}public WaitHandle AsyncWaitHandle{get{return Event;}}
            public bool CompletedSynchronously{get{return false;}}public bool IsCompleted{get{return Complete;}}
        }
        Result pending;public int EndCalls;public bool Closed;readonly bool inline;
        public OriginalLateStream(bool inline){this.inline=inline;}
        public override IAsyncResult BeginWrite(byte[] b,int o,int n,AsyncCallback cb,object state){pending=new Result{Callback=cb};if(inline)Complete();return pending;}
        public void Complete(){pending.Complete=true;pending.Event.Set();pending.Callback(pending);}
        public bool ResultEventClosed{get{return pending.Event.SafeWaitHandle.IsClosed;}}
        public override void EndWrite(IAsyncResult result){Need(ReferenceEquals(result,pending)&&pending.Complete,"matching actual completed stream result");EndCalls++;pending.Event.Dispose();}
        protected override void Dispose(bool disposing){Closed=true;}
        public override bool CanRead{get{return false;}}public override bool CanWrite{get{return true;}}public override bool CanSeek{get{return false;}}
        public override long Length{get{throw new NotSupportedException();}}public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}
        public override int Read(byte[] b,int o,int n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int n){throw new NotSupportedException();}
        public override void Flush(){}public override long Seek(long n,SeekOrigin o){throw new NotSupportedException();}public override void SetLength(long n){throw new NotSupportedException();}
    }
    static void LateStream(bool inline){using(var stream=new OriginalLateStream(inline)){
        bool timed=false;try{PipeDeadline.Write((Stream)stream,new byte[]{11},25,"original stream write");}catch(TimeoutException){timed=true;}
        Need(timed!=inline,"inline success versus pending timeout");
        if(!inline){Need(stream.Closed&&!stream.ResultEventClosed&&stream.EndCalls==0&&ends==0,"pending result event remains owned by completion after timeout");stream.Complete();}
        AwaitEnds(1);Need(stream.EndCalls==1&&stream.ResultEventClosed,"late or inline callback owns exactly one EndWrite and event cleanup");
    }}
    public static int Main(string[] args){SetErrorMode(3);Exception failure=null;
        PipeDeadline.StartedObserved01=Started;PipeDeadline.FinishedObserved01=Finished;
        try{HeldCompletions.Configure();switch(args[0]){
            case "geometry-timeout":case "read-timeout":case "write-timeout":Timeout(args[0]);break;
            case "connect-timeout":ConnectTimeout();break;
            case "geometry-server-stop":ServerStop(true);break;case "state-server-stop":ServerStop(false);break;
            case "geometry-server-stop-before-active":ServerStopBeforeActive();break;
            case "peer-close":PeerClosure(false);break;case "partial-peer-close":PeerClosure(true);break;
            case "success-framing":SuccessfulFraming();break;case "success-connection":SuccessfulConnection();break;
            case "late-stream-write":LateStream(false);break;case "inline-stream-write":LateStream(true);break;
            default:throw new ArgumentException("original scenario");
        }}catch(Exception e){failure=e;}
        Console.WriteLine(new JavaScriptSerializer().Serialize(new{schema=1,kind="original-production-pipe-lifetime01",scenario=args[0],passed=failure==null,checks,starts,ends,finishes,runtime=Environment.Version.ToString(),error=failure==null?null:failure.ToString(),gameFilesRead=false,endpointOpened=false}));
        return failure==null?0:1;
    }
}
