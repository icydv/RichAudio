using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace RichAudio.Beacon.Transport
{
    public sealed class SessionPermit {private int consumed;public bool TryConsume(){return Interlocked.CompareExchange(ref consumed,1,0)==0;}}
    public sealed class FirstFrameTiming { public long? FrameSequence, ObservationTicks, ClockFrequency; public double? CopyMs, MailboxAgeMs, AgeBeforeEncodeMs, EncodeMs, AgeBeforeWriteMs, WriteMs, AckMs, ConnectionMs, HeaderMs, PayloadMs, PayloadReceivedAgeMs, DecodeMs, DecisionAgeMs, CallbackMs; public string AgeClass; public double MinimumAgeMs=-2, MaximumAgeMs=250; public bool? ClockFrequencyAgrees; internal static double Ms(long start){return (Stopwatch.GetTimestamp()-start)*1000.0/Stopwatch.Frequency;} }
    public sealed class ExpiredUnsentTiming { public long Sequence; public double AgeMs,EncodeMs,BeforeEncodeAgeMs; public string Stage; }
    public sealed class RejectedFrameTiming { public long FrameOrdinal; public double DecisionAgeMs; public string AgeClass; }
    public sealed class TransportResult
    {
        public long ExpiredBeforeEncoding,ExpiredAfterEncoding; public ExpiredUnsentTiming FirstExpiredUnsent;
        public long StartupDiscarded, Transmitted, Received; public int StartupDiscardLimit=TransportStop.StartupDiscardLimit, StartupBudgetMs=TransportStop.StartupBudgetMs;
        public FirstFrameTiming FirstFrame, FirstAcceptedFrame; public RejectedFrameTiming OffendingFrame; public long Connection; public string Stage, Code, ExceptionType, Outcome;
        public bool HadAcceptedFrame, Terminal, AnotherAttempt; public double ElapsedMs;
    }
    // No exception messages or payload fields are exported from this boundary.
    public static class TransportStop
    {
        public const byte Accepted=1, StartupStaleDiscarded=2, Stopped=3;
        public const int StartupDiscardLimit=4, StartupBudgetMs=1000;
        public static string Kind(Exception e){return e is InvalidDataException?"InvalidDataException":e is TimeoutException?"TimeoutException":e is IOException?"IOException":e is System.Text.DecoderFallbackException?"DecoderFallbackException":e is System.Runtime.Serialization.SerializationException?"SerializationException":e is System.Xml.XmlException?"XmlException":"Exception";}
        public static string Code(string stage,Exception e){if(e is TimeoutException)return "deadline";switch(stage){case "header":return "truncated-header";case "length":return "invalid-length";case "payload":return "payload-failed";case "decoding":return "invalid-encoding-or-json";case "schema":return "invalid-schema";case "sequence":return "invalid-sequence";case "freshness":return "invalid-age";case "callback":return "consumer-failed";default:return "connection-failed";}}
        public static readonly byte[] Payload=System.Text.Encoding.ASCII.GetBytes("{\"transportStop\":1}");
        public static bool IsStop(byte[] bytes,int count){if(count!=Payload.Length)return false;for(int i=0;i<count;i++)if(bytes[i]!=Payload[i])return false;return true;}
        public static byte[] Frame(){var b=new byte[Payload.Length+4];Buffer.BlockCopy(BitConverter.GetBytes(Payload.Length),0,b,0,4);Buffer.BlockCopy(Payload,0,b,4,Payload.Length);return b;}
        public static void Write(PipeStream pipe,byte[] bytes){var operation=pipe.BeginWrite(bytes,0,bytes.Length,null,null);using(var ready=operation.AsyncWaitHandle){if(!ready.WaitOne(250))throw new TimeoutException("write deadline");pipe.EndWrite(operation);}}
        public static byte ReadAck(PipeStream pipe){var b=new byte[1];var operation=pipe.BeginRead(b,0,1,null,null);using(var ready=operation.AsyncWaitHandle){if(!ready.WaitOne(250))throw new TimeoutException("ack deadline");if(pipe.EndRead(operation)!=1)throw new InvalidDataException("peer terminal or closed");return b[0];}}
        public static void Ack(PipeStream pipe,byte expected){if(ReadAck(pipe)!=expected)throw new InvalidDataException("peer terminal or closed");}
    }
    public sealed class StatePipeServer:IDisposable
    {
        [System.Runtime.InteropServices.DllImport("kernel32.dll",SetLastError=true)]
        private static extern bool GetNamedPipeClientProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe,out uint pid);
        public uint PeerProcessId{get;private set;}
        private readonly string name;private readonly Action<ListenerState,double> consumer;
        private RejectedFrameTiming offendingFrame;
        public readonly FirstFrameTiming FirstFrame=new FirstFrameTiming();
        public FirstFrameTiming FirstAcceptedFrame{get;private set;}
        private readonly object lifetime=new object();private Thread thread;private volatile bool stopping;private NamedPipeServerStream active;
        private long accepted,rejected,connections,lastTicks,sequenceGaps,received,startupDiscarded;private string error;
        private readonly bool strict; private readonly Action<TransportResult> terminal;
        private volatile TransportResult diagnostic; public TransportResult Diagnostic{get{return diagnostic;}}
        public bool Finished{get{return thread!=null&&!thread.IsAlive;}}
        public bool ShutdownCompleted{get{return thread==null||!thread.IsAlive;}}
        public long StartupDiscarded{get{return Interlocked.Read(ref startupDiscarded);}}
        public long Accepted{get{return Interlocked.Read(ref accepted);}}
        public long Rejected{get{return Interlocked.Read(ref rejected);}}
        public long Connections{get{return Interlocked.Read(ref connections);}}
        public long SequenceGaps{get{return Interlocked.Read(ref sequenceGaps);}}
        public double LastAgeMs{get{long t=Interlocked.Read(ref lastTicks);return t==0?Double.PositiveInfinity:(Stopwatch.GetTimestamp()-t)*1000.0/Stopwatch.Frequency;}}
        public string Error{get{return error;}}
        public StatePipeServer(string pipeName,Action<ListenerState,double> onState,bool strictMode=true,Action<TransportResult> onTerminal=null){Protocol.Check(pipeName!=null&&System.Text.RegularExpressions.Regex.IsMatch(pipeName,"\\A[A-Za-z0-9.-]{1,100}\\z"),"pipe identity");name=pipeName;consumer=onState??delegate{};strict=strictMode;terminal=onTerminal??delegate{};}
        public static PipeSecurity CurrentUserSecurity()
        {
            var sid=WindowsIdentity.GetCurrent().User;var security=new PipeSecurity();security.SetOwner(sid);security.SetAccessRuleProtection(true,false);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(sid,PipeAccessRights.FullControl,AccessControlType.Allow));return security;
        }
        public void Start(){lock(lifetime){if(thread!=null||stopping)throw new InvalidOperationException("server cannot restart");thread=new Thread(Run){IsBackground=true,Name="RichAudio listener pipe"};thread.Start();}}
#if TRANSPORT_STARTUP_TEST
        internal Action BeforeDecodeTest;
#endif
        private TransportResult Result(string stage,string code,string outcome,long before,double elapsed,Exception exception=null)
        {
            return new TransportResult{FirstFrame=FirstFrame,FirstAcceptedFrame=FirstAcceptedFrame,StartupDiscarded=StartupDiscarded,Received=Interlocked.Read(ref received),OffendingFrame=offendingFrame,Connection=Connections,Stage=stage,Code=code,ExceptionType=exception==null?null:TransportStop.Kind(exception),Outcome=outcome,HadAcceptedFrame=Accepted>before,Terminal=strict,AnotherAttempt=!strict,ElapsedMs=elapsed};
        }
        private void Run()
        {
            byte[] header=new byte[4],payload=new byte[Protocol.MaximumBytes];
            while(!stopping)
            {
                string stage="connection";long before=Accepted;var elapsed=Stopwatch.StartNew();bool clean=false;
                try
                {
                    using(var pipe=new NamedPipeServerStream(name,strict?PipeDirection.InOut:PipeDirection.In,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,CurrentUserSecurity()))
                    {
                        active=pipe;if(stopping)break;var connect=pipe.BeginWaitForConnection(null,null);using(var ready=connect.AsyncWaitHandle){if(!ready.WaitOne(30000))throw new TimeoutException("connection deadline");pipe.EndWaitForConnection(connect);}long connectedAt=Stopwatch.GetTimestamp();Interlocked.Increment(ref connections);FirstFrame.ConnectionMs=elapsed.Elapsed.TotalMilliseconds;var validator=new StateValidator();long previousGaps=0;
                        uint peer; if(!GetNamedPipeClientProcessId(pipe.SafePipeHandle,out peer))throw new IOException("Pipe peer identity unavailable");PeerProcessId=peer;
                        while(!stopping)
                        {
                            bool startup=strict&&Accepted==before;int remaining=TransportStop.StartupBudgetMs-(int)FirstFrameTiming.Ms(connectedAt);
                            if(startup&&remaining<=0){stage="startup";throw new TimeoutException("fresh startup observation deadline");}
                            FirstFrameTiming timing=received==0?FirstFrame:startup?new FirstFrameTiming{ConnectionMs=FirstFrame.ConnectionMs}:null;
                            long mark=Stopwatch.GetTimestamp();stage="header";if(!ReadExactly(pipe,header,4,startup?Math.Min(750,remaining):750)){stage="connection";break;}
                            if(timing!=null)timing.HeaderMs=FirstFrameTiming.Ms(mark);mark=Stopwatch.GetTimestamp();stage="length";int length=BitConverter.ToInt32(header,0);Protocol.Check(length>0&&length<=Protocol.MaximumBytes,"frame length");
                            stage="payload";Protocol.Check(ReadExactly(pipe,payload,length,250),"truncated frame");
                            long receivedAt=Stopwatch.GetTimestamp();if(timing!=null)timing.PayloadMs=FirstFrameTiming.Ms(mark);if(TransportStop.IsStop(payload,length)){if(strict)TransportStop.Write(pipe,new byte[]{TransportStop.Stopped});clean=true;stage="connection";break;}
                            Interlocked.Increment(ref received);
                            stage="decoding";ListenerState state;
                            mark=Stopwatch.GetTimestamp();
#if TRANSPORT_STARTUP_TEST
                            if(BeforeDecodeTest!=null)BeforeDecodeTest();
#endif
                            try{state=Protocol.Decode(payload,length);if(timing!=null){timing.FrameSequence=state.Sequence;timing.ObservationTicks=state.ObservationTicks;timing.ClockFrequency=state.ClockFrequency;timing.DecodeMs=FirstFrameTiming.Ms(mark);timing.ClockFrequencyAgrees=state.ClockFrequency==Stopwatch.Frequency;timing.PayloadReceivedAgeMs=(receivedAt-state.ObservationTicks)*1000.0/Stopwatch.Frequency;}}catch(InvalidDataException){stage="schema";throw;}
                            bool fresh;stage="sequence";try{fresh=validator.AcceptOrDiscardStartup(state,Stopwatch.GetTimestamp(),startup&&StartupDiscarded<TransportStop.StartupDiscardLimit);}catch(InvalidDataException e){if(e.Message=="stale or future observation"){stage="freshness";offendingFrame=new RejectedFrameTiming{FrameOrdinal=Interlocked.Read(ref received),DecisionAgeMs=validator.DecisionAgeMs,AgeClass=validator.AgeClass};if(timing!=null){timing.DecisionAgeMs=validator.DecisionAgeMs;timing.AgeClass=validator.AgeClass;}}throw;}
                            Interlocked.Add(ref sequenceGaps,validator.SequenceGaps-previousGaps);previousGaps=validator.SequenceGaps;
                            if(timing!=null){timing.DecisionAgeMs=validator.DecisionAgeMs;timing.AgeClass=validator.AgeClass;}
                            if(startup&&FirstFrameTiming.Ms(connectedAt)>TransportStop.StartupBudgetMs){stage="startup";throw new TimeoutException("fresh startup observation deadline");}
                            if(!fresh){Interlocked.Increment(ref startupDiscarded);stage="ack";mark=Stopwatch.GetTimestamp();TransportStop.Write(pipe,new byte[]{TransportStop.StartupStaleDiscarded});if(timing!=null)timing.AckMs=FirstFrameTiming.Ms(mark);continue;}
                            if(stopping)break;
                            stage="callback";mark=Stopwatch.GetTimestamp();consumer(state,validator.LastAgeMs);if(timing!=null)timing.CallbackMs=FirstFrameTiming.Ms(mark);if(FirstAcceptedFrame==null)FirstAcceptedFrame=timing;Interlocked.Exchange(ref lastTicks,state.ObservationTicks);Interlocked.Increment(ref accepted);if(strict){mark=Stopwatch.GetTimestamp();TransportStop.Write(pipe,new byte[]{TransportStop.Accepted});if(timing!=null)timing.AckMs=FirstFrameTiming.Ms(mark);}
                        }
                    }
                    if(!stopping){diagnostic=Result(stage,clean?"sender-stop":"clean-eof",clean?"deliberate-stop":"unexpected-eof",before,elapsed.Elapsed.TotalMilliseconds);if(strict){terminal(diagnostic);break;}}
                }
                catch(Exception e){if(!stopping){Interlocked.Increment(ref rejected);error=TransportStop.Kind(e);diagnostic=Result(stage,TransportStop.Code(stage,e),"failed",before,elapsed.Elapsed.TotalMilliseconds,e);if(strict){terminal(diagnostic);break;}Thread.Sleep(25);}}
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
                    int n;try{n=pipe.EndRead(read);}catch(IOException e){int code=e.HResult&65535;if(code!=109&&code!=232&&code!=233)throw;if(offset!=0)throw new InvalidDataException("truncated frame");return false;}if(n==0){if(offset!=0)throw new InvalidDataException("truncated frame");return false;}offset+=n;
                }
            }
            return true;
        }
        public bool StopAndWait(int timeoutMs)
        {
            if(timeoutMs<0||timeoutMs>5000)throw new ArgumentOutOfRangeException("timeoutMs");
            Thread worker;lock(lifetime){stopping=true;worker=thread;}
            var pipe=active;if(pipe!=null)try{pipe.Dispose();}catch(IOException){}catch(ObjectDisposedException){}
            bool complete=worker==null||Thread.CurrentThread!=worker&&worker.Join(timeoutMs);
            if(diagnostic==null)diagnostic=Result("connection","receiver-stop","local-stop",0,0);
            return complete;
        }
        public void Dispose(){StopAndWait(1000);}
    }

    // The game thread copies only a small latest-value snapshot. Connection, framing and writes run here.
    public sealed class StatePublisher:IDisposable
    {
        private readonly string name;private readonly int maximumAttempts;private readonly bool strict;private readonly ManualResetEvent stopped=new ManualResetEvent(false);private readonly object lifetime=new object();
        private volatile TransportResult diagnostic;public TransportResult Diagnostic{get{return diagnostic;}}
        public readonly FirstFrameTiming FirstFrame=new FirstFrameTiming();public FirstFrameTiming FirstAcceptedFrame{get;private set;}private sealed class Publication { internal ListenerState State; internal double CopyMs; }
        public long? FirstPublishedSequence{get;private set;} public long? FirstTransmittedSequence{get;private set;}
        public long ExpiredBeforeEncoding{get{return Interlocked.Read(ref expiredBefore);}} public long ExpiredAfterEncoding{get{return Interlocked.Read(ref expiredAfter);}}
        private long expiredBefore,expiredAfter; public ExpiredUnsentTiming FirstExpiredUnsent{get;private set;}
        internal static bool ExpiredUnsent(long observed,long now){return (now-observed)*1000.0/Stopwatch.Frequency>250;}
        private Publication latest;private Thread thread;private NamedPipeClientStream active;private long sent,replaced,attempts,transmitted,startupDiscarded;private string error;private int stopRequested,disposed;
        public bool Finished{get{return thread==null||!thread.IsAlive;}}
        public long Sent{get{return Interlocked.Read(ref sent);}}public long Replaced{get{return Interlocked.Read(ref replaced);}}public long Attempts{get{return Interlocked.Read(ref attempts);}}public string Error{get{return error;}}
        public long Transmitted{get{return Interlocked.Read(ref transmitted);}}public long StartupDiscarded{get{return Interlocked.Read(ref startupDiscarded);}}
        public StatePublisher(string pipeName,int maxAttempts=1,bool strictMode=true){Protocol.Check(pipeName!=null&&System.Text.RegularExpressions.Regex.IsMatch(pipeName,"\\A[A-Za-z0-9.-]{1,100}\\z"),"pipe identity");Protocol.Check(maxAttempts>0&&maxAttempts<=8&&(!strictMode||maxAttempts==1),"reconnection budget");name=pipeName;maximumAttempts=maxAttempts;strict=strictMode;}
        public void Start(){lock(lifetime){if(thread!=null||stopRequested!=0||disposed!=0)throw new InvalidOperationException("publisher cannot restart");thread=new Thread(Run){IsBackground=true,Name="RichAudio listener writer"};thread.Start();}}
        public void Publish(ListenerState state){if(Interlocked.CompareExchange(ref stopRequested,0,0)!=0)return;long copyStart=Stopwatch.GetTimestamp();var copy=Protocol.Copy(state);double copyMs=FirstFrameTiming.Ms(copyStart);if(FirstPublishedSequence==null)FirstPublishedSequence=copy.Sequence;if(Interlocked.Exchange(ref latest,new Publication{State=copy,CopyMs=copyMs})!=null)Interlocked.Increment(ref replaced);}
#if TRANSPORT_EXPIRY_TEST
        internal Action BeforeEncodeTest, AfterEncodeTest; internal double BeforeDelayMs,AfterDelayMs;
#endif
        private TransportResult Result(string stage,string code,string outcome,long before,double elapsed,Exception exception=null)
        {
            return new TransportResult{ExpiredBeforeEncoding=ExpiredBeforeEncoding,ExpiredAfterEncoding=ExpiredAfterEncoding,FirstExpiredUnsent=FirstExpiredUnsent,FirstFrame=FirstFrame,FirstAcceptedFrame=FirstAcceptedFrame,StartupDiscarded=StartupDiscarded,Transmitted=Transmitted,Connection=Attempts,Stage=stage,Code=code,ExceptionType=exception==null?null:TransportStop.Kind(exception),Outcome=outcome,Terminal=strict,HadAcceptedFrame=Sent>before,AnotherAttempt=!strict&&Attempts<maximumAttempts,ElapsedMs=elapsed};
        }
        private void Run()
        {
            while(!stopped.WaitOne(0)&&Attempts<maximumAttempts)
            {
                string stage="connection";var elapsed=Stopwatch.StartNew();long before=Sent;
                try
                {
                    Interlocked.Increment(ref attempts);
                    using(var pipe=new NamedPipeClientStream(".",name,strict?PipeDirection.InOut:PipeDirection.Out,PipeOptions.Asynchronous))
                    {
                        active=pipe;pipe.Connect(200);long connectedAt=Stopwatch.GetTimestamp();FirstFrame.ConnectionMs=elapsed.Elapsed.TotalMilliseconds;var idle=Stopwatch.StartNew();
                        while(!stopped.WaitOne(10))
                        {
                            if(strict&&Sent==before&&FirstFrameTiming.Ms(connectedAt)>TransportStop.StartupBudgetMs){stage="startup";throw new TimeoutException("fresh startup observation deadline");}
                            var publication=Interlocked.Exchange(ref latest,null);if(publication==null){if(strict&&idle.ElapsedMilliseconds>750)throw new TimeoutException("producer idle");continue;}idle.Restart();var state=publication.State;
                            double mailboxAge=(Stopwatch.GetTimestamp()-state.ObservationTicks)*1000.0/Stopwatch.Frequency;
                            if(mailboxAge>250){Interlocked.Increment(ref expiredBefore);continue;}
                            FirstFrameTiming timing=Transmitted==0?FirstFrame:Sent==0?new FirstFrameTiming{ConnectionMs=FirstFrame.ConnectionMs}:null;
                            if(timing!=null){timing.CopyMs=publication.CopyMs;timing.FrameSequence=state.Sequence;timing.ObservationTicks=state.ObservationTicks;timing.ClockFrequency=state.ClockFrequency;timing.MailboxAgeMs=mailboxAge;}long mark=Stopwatch.GetTimestamp();stage="schema";
#if TRANSPORT_EXPIRY_TEST
                            if(BeforeEncodeTest!=null){long delayStart=Stopwatch.GetTimestamp();BeforeEncodeTest();BeforeDelayMs+=FirstFrameTiming.Ms(delayStart); }
#endif
                            mark=Stopwatch.GetTimestamp();double ageBeforeEncode=(mark-state.ObservationTicks)*1000.0/Stopwatch.Frequency;if(timing!=null)timing.AgeBeforeEncodeMs=ageBeforeEncode;byte[] bytes=Protocol.Frame(state);double encodeMs=FirstFrameTiming.Ms(mark);
#if TRANSPORT_EXPIRY_TEST
                            if(AfterEncodeTest!=null){long delayStart=Stopwatch.GetTimestamp();AfterEncodeTest();AfterDelayMs+=FirstFrameTiming.Ms(delayStart);}
#endif
                            long beforeWrite=Stopwatch.GetTimestamp();if(timing!=null){timing.EncodeMs=encodeMs;timing.AgeBeforeWriteMs=(beforeWrite-state.ObservationTicks)*1000.0/Stopwatch.Frequency;}
                            if(ExpiredUnsent(state.ObservationTicks,beforeWrite)){
                                Interlocked.Increment(ref expiredAfter);
                                if(FirstExpiredUnsent==null)FirstExpiredUnsent=new ExpiredUnsentTiming{Sequence=state.Sequence,AgeMs=(beforeWrite-state.ObservationTicks)*1000.0/Stopwatch.Frequency,EncodeMs=encodeMs,BeforeEncodeAgeMs=ageBeforeEncode,Stage="after-encoding-before-write"};
                                continue; // No bytes sent, no acknowledgement expected, no session restart.
                            }
                            mark=Stopwatch.GetTimestamp();stage="payload";IAsyncResult write=pipe.BeginWrite(bytes,0,bytes.Length,null,null);
                            using(var done=write.AsyncWaitHandle){if(!done.WaitOne(250)){pipe.Dispose();throw new TimeoutException("writer deadline");}pipe.EndWrite(write);}
                            if(timing!=null)timing.WriteMs=FirstFrameTiming.Ms(mark);if(Transmitted==0)FirstTransmittedSequence=state.Sequence;Interlocked.Increment(ref transmitted);
                            mark=Stopwatch.GetTimestamp();byte ack=TransportStop.Accepted;if(strict){stage="callback";ack=TransportStop.ReadAck(pipe);}if(timing!=null)timing.AckMs=FirstFrameTiming.Ms(mark);
                            if(ack==TransportStop.StartupStaleDiscarded){
                                Protocol.Check(strict&&Sent==before&&StartupDiscarded<TransportStop.StartupDiscardLimit&&FirstFrameTiming.Ms(connectedAt)<=TransportStop.StartupBudgetMs&&ExpiredUnsent(state.ObservationTicks,Stopwatch.GetTimestamp()),"unexpected startup discard acknowledgement");
                                Interlocked.Increment(ref startupDiscarded);continue;
                            }
                            Protocol.Check(ack==TransportStop.Accepted,"peer terminal or closed");
                            if(FirstAcceptedFrame==null)FirstAcceptedFrame=timing;
                            Interlocked.Increment(ref sent);
                        }
                        stage="payload";if(strict){TransportStop.Write(pipe,TransportStop.Frame());stage="callback";TransportStop.Ack(pipe,3);}
                        diagnostic=Result("connection","sender-stop","deliberate-stop",before,elapsed.Elapsed.TotalMilliseconds);
                    }
                }
                catch(Exception e){error=TransportStop.Kind(e);diagnostic=Result(stage,e is TimeoutException?"deadline":"operation-failed","failed",before,elapsed.Elapsed.TotalMilliseconds,e);}
                finally{active=null;}
                if(strict)break;
                stopped.WaitOne(Math.Min(2000,250*(int)Attempts));
            }
        }
        public void RequestStop(){lock(lifetime){if(Interlocked.Exchange(ref stopRequested,1)!=0)return;stopped.Set();}if(!strict){var pipe=active;if(pipe!=null)try{pipe.Dispose();}catch(IOException){}catch(ObjectDisposedException){}}}
        public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;RequestStop();if(thread==null||(Thread.CurrentThread!=thread&&thread.Join(1000)))lock(lifetime)stopped.Dispose();}
    }
}
