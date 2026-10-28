using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace RichAudio.Beacon.Transport
{
    public sealed class StatePipeServer:IDisposable
    {
        private readonly string name;private readonly Action<ListenerState,double> consumer;
        private Thread thread;private volatile bool stopping;private NamedPipeServerStream active;
        private long accepted,rejected,connections,lastTicks,sequenceGaps;private string error;
        public long Accepted{get{return Interlocked.Read(ref accepted);}}
        public long Rejected{get{return Interlocked.Read(ref rejected);}}
        public long Connections{get{return Interlocked.Read(ref connections);}}
        public long SequenceGaps{get{return Interlocked.Read(ref sequenceGaps);}}
        public double LastAgeMs{get{long t=Interlocked.Read(ref lastTicks);return t==0?Double.PositiveInfinity:(Stopwatch.GetTimestamp()-t)*1000.0/Stopwatch.Frequency;}}
        public string Error{get{return error;}}
        public StatePipeServer(string pipeName,Action<ListenerState,double> onState){Protocol.Check(pipeName!=null&&System.Text.RegularExpressions.Regex.IsMatch(pipeName,"\\A[A-Za-z0-9.-]{1,100}\\z"),"pipe identity");name=pipeName;consumer=onState??delegate{};}
        public static PipeSecurity CurrentUserSecurity()
        {
            var sid=WindowsIdentity.GetCurrent().User;var security=new PipeSecurity();security.SetOwner(sid);security.SetAccessRuleProtection(true,false);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(sid,PipeAccessRights.FullControl,AccessControlType.Allow));return security;
        }
        public void Start(){if(thread!=null||stopping)throw new InvalidOperationException("server cannot restart");thread=new Thread(Run){IsBackground=true,Name="RichAudio listener pipe"};thread.Start();}
        private void Run()
        {
            byte[] header=new byte[4],payload=new byte[Protocol.MaximumBytes];
            while(!stopping)
            {
                try
                {
                    using(var pipe=new NamedPipeServerStream(name,PipeDirection.In,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,CurrentUserSecurity()))
                    {
                        active=pipe;if(stopping)break;pipe.WaitForConnection();Interlocked.Increment(ref connections);var validator=new StateValidator();long previousGaps=0;
                        while(!stopping)
                        {
                            if(!ReadExactly(pipe,header,4,750))break;
                            int length=BitConverter.ToInt32(header,0);Protocol.Check(length>0&&length<=Protocol.MaximumBytes,"frame length");
                            Protocol.Check(ReadExactly(pipe,payload,length,250),"truncated frame");
                            ListenerState state=Protocol.Decode(payload,length);validator.Accept(state,Stopwatch.GetTimestamp());
                            Interlocked.Add(ref sequenceGaps,validator.SequenceGaps-previousGaps);previousGaps=validator.SequenceGaps;
                            Interlocked.Exchange(ref lastTicks,state.ObservationTicks);Interlocked.Increment(ref accepted);consumer(state,validator.LastAgeMs);
                        }
                    }
                }
                catch(Exception e){if(!stopping){Interlocked.Increment(ref rejected);error=e.GetType().Name;Thread.Sleep(25);}}
                finally{active=null;}
            }
        }
        private static bool ReadExactly(PipeStream pipe,byte[] buffer,int length,int deadlineMs)
        {
            int offset=0;var elapsed=Stopwatch.StartNew();
            while(offset<length)
            {
                IAsyncResult read=pipe.BeginRead(buffer,offset,length-offset,null,null);
                using(var done=read.AsyncWaitHandle)
                {
                    if(!done.WaitOne(Math.Max(1,deadlineMs-(int)elapsed.ElapsedMilliseconds))){pipe.Dispose();throw new TimeoutException("bounded pipe read timeout");}
                    int n=pipe.EndRead(read);if(n==0){if(offset!=0)throw new InvalidDataException("truncated frame");return false;}offset+=n;
                }
            }
            return true;
        }
        public void Dispose(){stopping=true;var pipe=active;if(pipe!=null)try{pipe.Dispose();}catch{}if(thread!=null&&Thread.CurrentThread!=thread)thread.Join(1000);}
    }

    // The game thread copies only a small latest-value snapshot. Connection, framing and writes run here.
    public sealed class StatePublisher:IDisposable
    {
        private readonly string name;private readonly int maximumAttempts;private readonly ManualResetEvent stopped=new ManualResetEvent(false);
        private ListenerState latest;private Thread thread;private NamedPipeClientStream active;private long sent,replaced,attempts;private string error;private int stopRequested,disposed;
        public bool Finished{get{return thread==null||!thread.IsAlive;}}
        public long Sent{get{return Interlocked.Read(ref sent);}}public long Replaced{get{return Interlocked.Read(ref replaced);}}public long Attempts{get{return Interlocked.Read(ref attempts);}}public string Error{get{return error;}}
        public StatePublisher(string pipeName,int maxAttempts=8){Protocol.Check(pipeName!=null&&System.Text.RegularExpressions.Regex.IsMatch(pipeName,"\\A[A-Za-z0-9.-]{1,100}\\z"),"pipe identity");Protocol.Check(maxAttempts>0&&maxAttempts<=8,"reconnection budget");name=pipeName;maximumAttempts=maxAttempts;}
        public void Start(){if(thread!=null||Interlocked.CompareExchange(ref stopRequested,0,0)!=0)throw new InvalidOperationException("publisher cannot restart");thread=new Thread(Run){IsBackground=true,Name="RichAudio listener writer"};thread.Start();}
        public void Publish(ListenerState state){if(Interlocked.CompareExchange(ref stopRequested,0,0)!=0)return;var copy=Protocol.Copy(state);if(Interlocked.Exchange(ref latest,copy)!=null)Interlocked.Increment(ref replaced);}
        private void Run()
        {
            while(!stopped.WaitOne(0)&&Attempts<maximumAttempts)
            {
                try
                {
                    Interlocked.Increment(ref attempts);
                    using(var pipe=new NamedPipeClientStream(".",name,PipeDirection.Out,PipeOptions.Asynchronous))
                    {
                        active=pipe;pipe.Connect(200);
                        while(!stopped.WaitOne(10))
                        {
                            var state=Interlocked.Exchange(ref latest,null);if(state==null)continue;
                            if((Stopwatch.GetTimestamp()-state.ObservationTicks)*1000.0/Stopwatch.Frequency>250)continue;
                            byte[] bytes=Protocol.Frame(state);IAsyncResult write=pipe.BeginWrite(bytes,0,bytes.Length,null,null);
                            using(var done=write.AsyncWaitHandle){if(!done.WaitOne(250)){pipe.Dispose();throw new TimeoutException("writer deadline");}pipe.EndWrite(write);}
                            Interlocked.Increment(ref sent);
                        }
                    }
                }
                catch(Exception e){if(!stopped.WaitOne(0))error=e.GetType().Name;}
                finally{active=null;}
                stopped.WaitOne(Math.Min(2000,250*(int)Attempts));
            }
        }
        public void RequestStop(){if(Interlocked.Exchange(ref stopRequested,1)!=0)return;stopped.Set();var pipe=active;if(pipe!=null)try{pipe.Dispose();}catch{}}
        public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;RequestStop();if(thread==null||(Thread.CurrentThread!=thread&&thread.Join(1000)))stopped.Dispose();}
    }
}
