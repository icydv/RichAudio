using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Windows
{
    internal sealed class SinkBoundaryCapture:FileStream
    {
        internal readonly ManualResetEvent Entered=new ManualResetEvent(false),ReleaseWrite=new ManualResetEvent(false);
        internal byte[] PreparedBytes;
        internal long WriteCompletedQpc;
        private readonly bool hold;
        internal SinkBoundaryCapture(string path,bool barrier):base(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)
        {
            hold=barrier;if(!barrier)ReleaseWrite.Set();
        }
        public override void Write(byte[] buffer,int offset,int count)
        {
            PreparedBytes=new byte[count];Buffer.BlockCopy(buffer,offset,PreparedBytes,0,count);Entered.Set();
            if(hold&&!ReleaseWrite.WaitOne(3000))throw new TimeoutException("Sink boundary fixture barrier");
            base.Write(buffer,offset,count);WriteCompletedQpc=Stopwatch.GetTimestamp();
        }
    }

    public static partial class HostProgram
    {
        private static void SinkBoundaryRequire(bool value,string code){if(!value)throw new InvalidOperationException(code);}
        internal static object TestListeningSinkBoundary(string mode,string directory)
        {
            var ring=new PcmRing();var input=new float[1024];
            for(int i=0;i<512;i++){input[i*2]=.125f;input[i*2+1]=-.25f;}
            for(int i=0;i<4;i++)SinkBoundaryRequire(ring.TryWrite(input,512),"four-block prefill");
            string pcmPath=Path.Combine(directory,"post-host.f32le");
            var capture=new SinkBoundaryCapture(pcmPath,mode=="R2");
            var tap=new OwnedOutputTap();tap.CaptureForTest("sink-boundary");
            fixturePostHost=capture;listeningFixture=true;
            output=new WasapiOutput(ring,-1);output.Volume=.20f;output.Muted=false;
            Exception terminalError=null,sinkError=null;long terminalReturned=0;
            var terminal=new Thread(delegate(){try{ListenerEnded(new TransportResult {Outcome="failed",Stage="schema",Code="invalid-schema",Terminal=true});}
                catch(Exception error){terminalError=error;}finally{terminalReturned=Stopwatch.GetTimestamp();}}){IsBackground=true};
            Thread sink=null;
            try
            {
                if(mode=="R1")
                {
                    // The actual terminal callback is held after output.Stop
                    // and its boundary, before setting the host's stop flag.
                    // No source hook or scheduler race establishes this order.
                    lock(failureLock)
                    {
                        terminal.Start();var wait=Stopwatch.StartNew();
                        while(listenerTerminalBoundary==null&&wait.ElapsedMilliseconds<3000){Thread.MemoryBarrier();Thread.Sleep(1);}
                        SinkBoundaryRequire(listenerTerminalBoundary!=null,"terminal boundary observed");
                        SinkBoundaryRequire(!stop&&output.StopRequested&&output.Muted,"authoritative output stop precedes host stop");
                        ConsumeListeningFixture(ring,tap);
                        SinkBoundaryRequire(ring.ConsumedFrames==0&&fixtureSinkFrames==0&&fixtureLastSubmissionQpc==0,
                            "stopped output cannot admit another fixture Fill");
                        SinkBoundaryRequire(capture.Length==0&&tap.CapturedFrames==0&&tap.Quiescent,
                            "no extra muted zeros or recorder submission after Stop");
                    }
                    SinkBoundaryRequire(terminal.Join(3000),"terminal thread joined");
                }
                else
                {
                    // The real ring.Fill and recorder Prepare/Commit finish
                    // before capture Write blocks. Stop is a request; retain
                    // this already-admitted buffer instead of dropping it or
                    // pretending the request is a completion barrier.
                    sink=new Thread(delegate(){try{ConsumeListeningFixture(ring,tap);}catch(Exception error){sinkError=error;}}){IsBackground=true};
                    sink.Start();SinkBoundaryRequire(capture.Entered.WaitOne(3000),"actual post-Fill capture reached");
                    terminal.Start();SinkBoundaryRequire(terminal.Join(3000),"terminal thread joined");
                    capture.ReleaseWrite.Set();SinkBoundaryRequire(sink.Join(3000),"sink thread joined");
                }
                SinkBoundaryRequire(terminalError==null&&sinkError==null,"native fixture threads succeeded");
                capture.Flush();capture.Dispose();byte[] pcm=File.ReadAllBytes(pcmPath);
                var metrics=ListeningFixtureMetrics(ring);long boundary=Convert.ToInt64(listenerTerminalBoundary["qpcTicks"]);
                long completedAtRequest=Convert.ToInt64(listenerTerminalBoundary["fixtureCompletedFrames"]);
                SinkBoundaryRequire(!output.Started&&stop&&output.StopRequested&&output.Muted,"no endpoint; actual terminal stops and mutes output");
                SinkBoundaryRequire(primaryFailure["stage"].Equals("listener-terminal")&&secondaryFailures.Count==0,"original terminal result retained");
                SinkBoundaryRequire(ring.UnderflowFrames==0,"no underflow concealed by stop handling");
                SinkBoundaryRequire(fixtureLastSubmissionQpc<=boundary,"strict no-new-admission-after-Stop comparison");
                SinkBoundaryRequire(fixtureSinkFrames-completedAtRequest>=0&&fixtureSinkFrames-completedAtRequest<=512,"at most one prior-admitted completion");
                if(mode=="R2")
                {
                    SinkBoundaryRequire(pcm.Length==4096&&fixtureSinkFrames==512&&completedAtRequest==0,"exactly one prior-admitted buffer completes");
                    SinkBoundaryRequire(fixtureLastSubmissionQpc<boundary&&fixtureLastCompletionQpc>boundary&&capture.WriteCompletedQpc>terminalReturned,
                        "admission, Stop request and completion remain distinct");
                    SinkBoundaryRequire(Convert.ToInt64(metrics["lastAdmissionFrameStart"])==0&&Convert.ToInt64(metrics["lastCompletionFrameEnd"])==512,
                        "completed tail identifies the same admitted frame range");
                    var chunk=tap.Peek();SinkBoundaryRequire(chunk!=null&&chunk.Frames==512&&chunk.SubmittedFrame==0&&tap.CapturedFrames==512,"actual recorder preserves one submitted prefix");
                    for(int i=0;i<1024;i++)
                    {
                        float expected=input[i]*.20f;int bits=BitConverter.ToInt32(BitConverter.GetBytes(expected),0);
                        SinkBoundaryRequire(BitConverter.ToInt32(pcm,i*4)==bits&&BitConverter.ToInt32(capture.PreparedBytes,i*4)==bits&&
                            BitConverter.ToInt32(BitConverter.GetBytes(chunk.Samples[i]),0)==bits,"exact nonzero pre-admitted post-gain bytes retained");
                    }
                    tap.Release();
                }
                return new Dictionary<string,object> {{"mode",mode},{"endpointOpened",false},{"passed",true},{"sink",metrics},
                    {"terminalBoundary",listenerTerminalBoundary},{"capturedFileBytes",pcm.Length},{"terminalReturnedQpcTicks",terminalReturned},
                    {"finding",mode=="R1"?"authoritative output stop rejects extra fixture admission while host stop is still false":"same already-admitted nonzero buffer completes after the Stop request with exact PCM and recorder lineage"}};
            }
            finally
            {
                capture.ReleaseWrite.Set();if(sink!=null&&sink.IsAlive)sink.Join(3000);if(terminal.IsAlive)terminal.Join(3000);
                output.Dispose();tap.Dispose();capture.Dispose();capture.Entered.Dispose();capture.ReleaseWrite.Dispose();fixturePostHost=null;
            }
        }
    }
}

namespace RichAudio.Beacon.Tests
{
    public static class TestListeningSinkBoundary
    {
        public static int Main(string[] args)
        {
            if(args.Length!=2||(args[1]!="R1"&&args[1]!="R2"))return 2;
            string directory=Path.Combine(Path.GetFullPath(args[0]),".local","sink-boundary-"+args[1]+"-"+Guid.NewGuid().ToString("N"));
            for(var ancestor=new DirectoryInfo(directory);ancestor!=null;ancestor=ancestor.Parent)
                if(ancestor.Exists&&(ancestor.Attributes&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Linked fixture directory");
            Directory.CreateDirectory(directory);
            try
            {
                object result=RichAudio.Beacon.Windows.HostProgram.TestListeningSinkBoundary(args[1],directory);
                string json=new JavaScriptSerializer().Serialize(result);File.WriteAllText(Path.Combine(directory,"result.json"),json);
                Console.WriteLine(json);return 0;
            }
            catch(Exception error){File.WriteAllText(Path.Combine(directory,"failure.json"),new JavaScriptSerializer().Serialize(new {mode=args[1],type=error.GetType().Name}));throw;}
        }
    }
}
