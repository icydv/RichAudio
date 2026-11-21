// Device-free causal schedules around an unchanged StatePipe private copy.
// The companion tool inserts only two control gates and their field declaration.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

public static class TestHostConnectionBoundary03
{
    sealed class Failure : Exception { public readonly string Code; public Failure(string code) { Code=code; } }
    static void Need(bool value,string code) { if(!value)throw new Failure(code); }
    static readonly List<Dictionary<string,object>> Results=new List<Dictionary<string,object>>();
    static string ErrorKind(Exception error) { if(error==null)return null;string value=error.GetType().Name;return value.Length<=80?value:value.Substring(0,80); }
    static void FreshnessControls()
    {
        long now=Stopwatch.GetTimestamp();
        foreach(int milliseconds in new[]{250,251,-2,-3})
        {
            var state=Protocol.Synthetic(new string('c',32),0,0);
            state.ObservationTicks=now-(long)(milliseconds*Stopwatch.Frequency/1000d);
            bool accepted=false;try{accepted=new StateValidator().AcceptOrDiscardStartup(state,now,false);}catch(InvalidDataException){}
            Need(accepted==(milliseconds==250||milliseconds==-2),"unchanged-freshness-boundary");
        }
    }
    static void Run(string phase)
    {
        var result=new Dictionary<string,object>{{"phase",phase},{"passed",false}};Results.Add(result);
        string name="RichAudio.ConnectionBoundary03."+Guid.NewGuid().ToString("N");
        var closed=new ManualResetEvent(false);var qualified=new ManualResetEvent(false);var terminal=new ManualResetEvent(false);
        Exception senderError=null;int attempts=0,endings=0;long connectedAt=0,closedAt=0,beforeWaitReleasedAt=0,peerQualifiedAt=0,terminalAt=0;
        bool senderStarted=false,senderJoined=false,serverJoined=false;
        var server=new StatePipeServer(name,null,true,delegate{terminalAt=Stopwatch.GetTimestamp();Interlocked.Increment(ref endings);terminal.Set();});
        server.ConnectionBoundaryBeforeWait03=phase=="before-begin"?(Action)delegate{
            Need(closed.WaitOne(3000),"pre-begin-client-closure-bound");beforeWaitReleasedAt=Stopwatch.GetTimestamp();
        }:null;
        server.ConnectionBoundaryAfterPeer03=phase=="after-peer"?(Action)delegate{
            peerQualifiedAt=Stopwatch.GetTimestamp();qualified.Set();Need(closed.WaitOne(3000),"post-peer-client-closure-bound");
        }:null;
        var sender=new Thread(delegate(){try{
            Interlocked.Increment(ref attempts);
            using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
                client.Connect(2000);connectedAt=Stopwatch.GetTimestamp();
                if(phase=="after-peer")Need(qualified.WaitOne(3000),"actual-peer-qualification-bound");
            }
            closedAt=Stopwatch.GetTimestamp();
        }catch(Exception error){senderError=error;}finally{closed.Set();}}){IsBackground=true};
        try
        {
            server.Start();sender.Start();senderStarted=true;
            Need(terminal.WaitOne(4000),"actual-terminal-bound");
            senderJoined=sender.Join(3000);serverJoined=server.StopAndWait(1000);
            var d=server.Diagnostic;
            result["connections"]=server.Connections;result["accepted"]=server.Accepted;result["rejected"]=server.Rejected;
            result["received"]=d==null?-1:d.Received;result["stage"]=d==null?null:d.Stage;result["code"]=d==null?null:d.Code;
            result["outcome"]=d==null?null:d.Outcome;result["exceptionType"]=d==null?null:d.ExceptionType;
            result["terminal"]=d!=null&&d.Terminal;result["anotherAttempt"]=d!=null&&d.AnotherAttempt;
            result["peerMatchesSender"]=server.PeerProcessId==(uint)Process.GetCurrentProcess().Id;
            result["clientAttempts"]=attempts;result["terminalCallbacks"]=endings;
            result["clientConnectedQpc"]=connectedAt;result["clientClosedQpc"]=closedAt;
            result["beforeBeginWaitReleasedQpc"]=beforeWaitReleasedAt;result["peerQualifiedQpc"]=peerQualifiedAt;
            result["terminalQpc"]=terminalAt;result["qpcFrequency"]=Stopwatch.Frequency;
            result["senderExceptionType"]=ErrorKind(senderError);result["senderJoined"]=senderJoined;result["serverJoined"]=serverJoined;
            Need(senderJoined&&serverJoined&&server.ShutdownCompleted,"owned-lifetimes-joined");
            Need(senderError==null&&attempts==1&&endings==1,"one-client-and-one-terminal");
            Need(d!=null&&d.Stage=="connection"&&d.Terminal&&!d.AnotherAttempt&&!d.HadAcceptedFrame&&d.Received==0&&server.Accepted==0,"no-frame-or-rearm");
            Need(d.FirstFrame.MinimumAgeMs==-2&&d.FirstFrame.MaximumAgeMs==250&&TransportStop.StartupBudgetMs==1000&&TransportStop.StartupDiscardLimit==4,"unchanged-freshness-contract");
            Need(connectedAt>0&&closedAt>=connectedAt&&terminalAt>=closedAt,"original-causal-timestamps");
            if(phase=="before-begin"){
                Need(beforeWaitReleasedAt>=closedAt&&peerQualifiedAt==0,"closure-precedes-BeginWait");
                Need(server.Connections==0&&server.Rejected==1&&server.PeerProcessId==0&&d.Code=="connection-failed"&&d.Outcome=="failed"&&d.ExceptionType=="IOException","prewait-is-real-connection-failure");
            }else{
                Need(peerQualifiedAt>0&&closedAt>=peerQualifiedAt&&beforeWaitReleasedAt==0,"closure-follows-peer-qualification");
                Need(server.Connections==1&&server.Rejected==0&&(bool)result["peerMatchesSender"]&&d.Code=="clean-eof"&&d.Outcome=="unexpected-eof"&&d.ExceptionType==null,"qualified-close-is-clean-eof");
            }
            result["passed"]=true;
        }
        finally
        {
            // Also retain bounded operands when a readiness assertion fails
            // before the ordinary post-terminal snapshot can be constructed.
            var originalEnding=server.Diagnostic;result["terminalObservedBeforeCleanup"]=originalEnding!=null;
            result["connections"]=server.Connections;result["accepted"]=server.Accepted;result["rejected"]=server.Rejected;
            result["stage"]=originalEnding==null?null:originalEnding.Stage;result["code"]=originalEnding==null?null:originalEnding.Code;
            result["exceptionType"]=originalEnding==null?null:originalEnding.ExceptionType;
            result["clientAttempts"]=attempts;result["terminalCallbacks"]=endings;
            result["senderExceptionType"]=ErrorKind(senderError);result["senderHResult"]=senderError==null?(int?)null:senderError.HResult;
            result["clientConnectedQpc"]=connectedAt;result["clientClosedQpc"]=closedAt;
            result["beforeBeginWaitReleasedQpc"]=beforeWaitReleasedAt;result["peerQualifiedQpc"]=peerQualifiedAt;
            result["terminalQpc"]=terminalAt;result["qpcFrequency"]=Stopwatch.Frequency;
            closed.Set();qualified.Set();
            if(senderStarted)senderJoined=sender.Join(3000);serverJoined=server.StopAndWait(1000);
            result["senderJoined"]=senderJoined;result["serverJoined"]=serverJoined;
            if(senderJoined&&serverJoined){closed.Dispose();qualified.Dispose();terminal.Dispose();server.Dispose();}
        }
    }
    public static int Main()
    {
        Exception failure=null;try{FreshnessControls();Run("before-begin");Run("after-peer");}catch(Exception error){failure=error;}
        Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=16384}.Serialize(new{
            schema=1,passed=failure==null,kind="device-free-host-connection-boundary03",deviceFree=true,endpointOpened=false,
            gameFilesRead=false,productionSourcesModified=false,privateControlSites=3,freshnessControls=4,
            errorType=ErrorKind(failure),failureCode=failure is Failure?((Failure)failure).Code:failure==null?null:"unexpected-fixture-exception",
            results=Results}));
        return failure==null?0:1;
    }
}
