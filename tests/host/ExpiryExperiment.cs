using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

// Device-free fixture records contain timings, counters and bounded failure codes only.
// The ready marker still means Start returned, not that its worker created the pipe.
internal static class ExpiryRecords
{
    internal static double Ms(long mark) { return (Stopwatch.GetTimestamp()-mark)*1000.0/Stopwatch.Frequency; }
    internal static Dictionary<string,object> New(string role,string mode)
    {
        return new Dictionary<string,object> {
            {"schemaVersion",1}, {"role",role}, {"mode",mode},
            {"childAppDomain",!AppDomain.CurrentDomain.IsDefaultAppDomain()},
            {"lifecycle",new Dictionary<string,object>()}, {"harnessFailure",null},
            {"cleanupFailures",new List<object>()}
        };
    }
    internal static Dictionary<string,object> Read(string json)
    {
        var record=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(json);
        var cleanup=new List<object>();
        foreach(object item in (System.Collections.IEnumerable)record["cleanupFailures"])cleanup.Add(item);
        record["cleanupFailures"]=cleanup;
        return record;
    }
    internal static object Failure(string stage,string code,Exception exception)
    {
        // Do not export messages, stack traces, paths, pipe names or payloads.
        string kind=exception is CannotUnloadAppDomainException?"CannotUnloadAppDomainException":
            exception is AppDomainUnloadedException?"AppDomainUnloadedException":
            exception is TypeLoadException?"TypeLoadException":
            exception is FileNotFoundException?"FileNotFoundException":TransportStop.Kind(exception);
        return new {stage=stage,code=code,exceptionType=kind};
    }
    internal static bool Failed(Dictionary<string,object> record)
    {
        return record["harnessFailure"]!=null||((List<object>)record["cleanupFailures"]).Count!=0;
    }
}

public sealed class DomainSender:MarshalByRefObject
{
    public string Run(string pipe,string mode)
    {
        long runStart=Stopwatch.GetTimestamp();
        StatePublisher publisher=null;string stage="publisher-construct";
        Exception primaryFailure=null,cleanupFailure=null;string failureStage=null;
        double constructMs=0,startMs=0,firstSyntheticMs=0,firstPublishMs=0,firstPublicationAtMs=0;
        double productionLoopMs=0,stopRequestMs=0,stopWaitMs=0,disposeMs=0;
        long publications=0,sent=0,attempts=0,replaced=0;bool finished=false;
        TransportResult diagnostic=null;
#if !EXPIRY_BASELINE
        long transmitted=0,startupDiscarded=0,expiredBefore=0,expiredAfter=0;
        double beforeDelayMs=0,afterDelayMs=0;long? firstPublished=null,firstTransmitted=null;
        ExpiredUnsentTiming firstExpired=null;
#endif
        try
        {
            long mark=Stopwatch.GetTimestamp();publisher=new StatePublisher(pipe,1,true);
            constructMs=ExpiryRecords.Ms(mark);
            int delayed=0;Action hold=delegate { if(Interlocked.Increment(ref delayed)==1)Thread.Sleep(mode=="late"?900:350); };
            if(mode=="before"||mode=="late")publisher.BeforeEncodeTest=hold;
            if(mode=="after")publisher.AfterEncodeTest=hold;
            stage="publisher-start";mark=Stopwatch.GetTimestamp();publisher.Start();startMs=ExpiryRecords.Ms(mark);
            var watch=Stopwatch.StartNew();long n=0;
            stage="sender-publish";
            while(watch.ElapsedMilliseconds<1100&&!publisher.Finished)
            {
                mark=Stopwatch.GetTimestamp();var state=Protocol.Synthetic(new string('a',32),n++,0);
                if(n==1)firstSyntheticMs=ExpiryRecords.Ms(mark);
                mark=Stopwatch.GetTimestamp();publisher.Publish(state);publications++;
                if(n==1){firstPublishMs=ExpiryRecords.Ms(mark);firstPublicationAtMs=watch.Elapsed.TotalMilliseconds;}
                while(watch.ElapsedMilliseconds<n*50&&!publisher.Finished)Thread.Sleep(0);
            }
            productionLoopMs=watch.Elapsed.TotalMilliseconds;
            stage="sender-stop";mark=Stopwatch.GetTimestamp();publisher.RequestStop();stopRequestMs=ExpiryRecords.Ms(mark);
            watch.Restart();stage="sender-stop-wait";
            while(!publisher.Finished&&watch.ElapsedMilliseconds<1500)Thread.Sleep(1);
            stopWaitMs=watch.Elapsed.TotalMilliseconds;
            if(!publisher.Finished)throw new TimeoutException("sender lifetime");
        }
        catch(Exception exception){primaryFailure=exception;failureStage=stage;}
        finally
        {
            if(publisher!=null)
            {
                // Snapshot the primary transport result before disposal can add a secondary failure.
                sent=publisher.Sent;attempts=publisher.Attempts;replaced=publisher.Replaced;
                finished=publisher.Finished;diagnostic=publisher.Diagnostic;
#if !EXPIRY_BASELINE
                transmitted=publisher.Transmitted;startupDiscarded=publisher.StartupDiscarded;
                beforeDelayMs=publisher.BeforeDelayMs;afterDelayMs=publisher.AfterDelayMs;
                expiredBefore=publisher.ExpiredBeforeEncoding;expiredAfter=publisher.ExpiredAfterEncoding;
                firstExpired=publisher.FirstExpiredUnsent;firstPublished=publisher.FirstPublishedSequence;
                firstTransmitted=publisher.FirstTransmittedSequence;
#endif
                long mark=Stopwatch.GetTimestamp();
                try{publisher.Dispose();}catch(Exception exception){cleanupFailure=exception;}
                disposeMs=ExpiryRecords.Ms(mark);
            }
        }
        // Construct diagnostic collections and serializers only after the cold transport path and disposal.
        double runMs=ExpiryRecords.Ms(runStart);var record=ExpiryRecords.New("sender",mode);
        var lifecycle=(Dictionary<string,object>)record["lifecycle"];
        lifecycle["publisherConstructMs"]=constructMs;lifecycle["publisherStartMs"]=startMs;
        lifecycle["firstSyntheticMs"]=firstSyntheticMs;lifecycle["firstPublishMs"]=firstPublishMs;
        lifecycle["firstPublicationAtMs"]=firstPublicationAtMs;lifecycle["publicationCount"]=publications;
        lifecycle["productionLoopMs"]=productionLoopMs;lifecycle["stopRequestMs"]=stopRequestMs;lifecycle["stopWaitMs"]=stopWaitMs;
        lifecycle["disposeMs"]=disposeMs;lifecycle["runMs"]=runMs;
        record["sent"]=sent;record["attempts"]=attempts;record["replaced"]=replaced;
        record["finished"]=finished;record["diagnostic"]=diagnostic;
#if !EXPIRY_BASELINE
        record["transmitted"]=transmitted;record["startupDiscarded"]=startupDiscarded;
        record["beforeDelayMs"]=beforeDelayMs;record["afterDelayMs"]=afterDelayMs;
        record["expiredBefore"]=expiredBefore;record["expiredAfter"]=expiredAfter;record["firstExpired"]=firstExpired;
        record["firstPublished"]=firstPublished;record["firstTransmitted"]=firstTransmitted;
#endif
        if(primaryFailure!=null)record["harnessFailure"]=ExpiryRecords.Failure(failureStage,failureStage=="sender-stop-wait"?"sender-lifetime":"fixture-operation-failed",primaryFailure);
        if(cleanupFailure!=null)((List<object>)record["cleanupFailures"]).Add(ExpiryRecords.Failure("publisher-dispose","fixture-cleanup-failed",cleanupFailure));
        return new JavaScriptSerializer().Serialize(record);
    }
    public override object InitializeLifetimeService(){return null;}
}

internal static class ExpiryExperiment
{
    private static Dictionary<string,object> Receive(string[] arguments)
    {
        long runStart=Stopwatch.GetTimestamp();
        StatePipeServer server=null;string stage="receiver-construct";
        Exception primaryFailure=null,cleanupFailure=null;string failureStage=null;
        double constructMs=0,startMs=0,readyMarkerAtMs=0,waitMs=0,disposeMs=0;
        long accepted=0,rejected=0,connections=0;bool finished=false,markerWritten=false;TransportResult diagnostic=null;
#if !EXPIRY_BASELINE
        long startupDiscarded=0;
#endif
        try
        {
            long mark=Stopwatch.GetTimestamp();server=new StatePipeServer(arguments[1],null,true);constructMs=ExpiryRecords.Ms(mark);
            stage="receiver-start";mark=Stopwatch.GetTimestamp();server.Start();startMs=ExpiryRecords.Ms(mark);
            stage="receiver-ready-marker";File.WriteAllText(arguments[3]+".ready","ready");
            readyMarkerAtMs=ExpiryRecords.Ms(runStart);markerWritten=true;
            var watch=Stopwatch.StartNew();stage="receiver-wait";
            while(!server.Finished&&watch.ElapsedMilliseconds<5000)Thread.Sleep(1);
            waitMs=watch.Elapsed.TotalMilliseconds;
            if(!server.Finished)throw new TimeoutException("receiver lifetime");
        }
        catch(Exception exception){primaryFailure=exception;failureStage=stage;}
        finally
        {
            if(server!=null)
            {
                accepted=server.Accepted;rejected=server.Rejected;connections=server.Connections;
                finished=server.Finished;diagnostic=server.Diagnostic;
#if !EXPIRY_BASELINE
                startupDiscarded=server.StartupDiscarded;
#endif
                long mark=Stopwatch.GetTimestamp();
                try{server.Dispose();}catch(Exception exception){cleanupFailure=exception;}
                disposeMs=ExpiryRecords.Ms(mark);
            }
        }
        double runMs=ExpiryRecords.Ms(runStart);var record=ExpiryRecords.New("receiver",arguments[2]);
        var lifecycle=(Dictionary<string,object>)record["lifecycle"];
        lifecycle["serverConstructMs"]=constructMs;lifecycle["serverStartMs"]=startMs;lifecycle["readyMarkerAtMs"]=readyMarkerAtMs;
        lifecycle["waitMs"]=waitMs;lifecycle["disposeMs"]=disposeMs;lifecycle["runMs"]=runMs;
        record["accepted"]=accepted;record["rejected"]=rejected;record["connections"]=connections;
        record["finished"]=finished;record["diagnostic"]=diagnostic;
        if(markerWritten)record["readyMarkerKind"]="worker-start-requested";
#if !EXPIRY_BASELINE
        record["startupDiscarded"]=startupDiscarded;
#endif
        if(primaryFailure!=null)record["harnessFailure"]=ExpiryRecords.Failure(failureStage,failureStage=="receiver-wait"?"receiver-lifetime":"fixture-operation-failed",primaryFailure);
        if(cleanupFailure!=null)((List<object>)record["cleanupFailures"]).Add(ExpiryRecords.Failure("receiver-dispose","fixture-cleanup-failed",cleanupFailure));
        return record;
    }

    private static Dictionary<string,object> Send(string[] arguments)
    {
        if(arguments[2]!="domain")
        {
            string result=new DomainSender().Run(arguments[1],arguments[2]);return ExpiryRecords.Read(result);
        }
        AppDomain domain=null;string stage="appdomain-create";
        Dictionary<string,object> outer=null;Exception primaryFailure=null,cleanupFailure=null;string failureStage=null;
        double createMs=0,activateMs=0,unloadMs=0;
        try
        {
            long mark=Stopwatch.GetTimestamp();domain=AppDomain.CreateDomain("original-synthetic-domain");createMs=ExpiryRecords.Ms(mark);
            stage="appdomain-activate";mark=Stopwatch.GetTimestamp();
            var sender=(DomainSender)domain.CreateInstanceAndUnwrap(typeof(DomainSender).Assembly.FullName,typeof(DomainSender).FullName);
            activateMs=ExpiryRecords.Ms(mark);stage="appdomain-run";
            string result=sender.Run(arguments[1],"none");outer=ExpiryRecords.Read(result);outer["mode"]="domain";
        }
        catch(Exception exception){primaryFailure=exception;failureStage=stage;}
        finally
        {
            if(domain!=null)
            {
                long mark=Stopwatch.GetTimestamp();
                try{AppDomain.Unload(domain);}catch(Exception exception){cleanupFailure=exception;}
                unloadMs=ExpiryRecords.Ms(mark);
            }
        }
        if(outer==null)outer=ExpiryRecords.New("sender","domain");
        var outerLifecycle=(Dictionary<string,object>)outer["lifecycle"];
        outerLifecycle["appDomainCreateMs"]=createMs;outerLifecycle["appDomainActivateMs"]=activateMs;outerLifecycle["appDomainUnloadMs"]=unloadMs;
        if(primaryFailure!=null)outer["harnessFailure"]=ExpiryRecords.Failure(failureStage,"fixture-operation-failed",primaryFailure);
        if(cleanupFailure!=null)((List<object>)outer["cleanupFailures"]).Add(ExpiryRecords.Failure("appdomain-unload","fixture-cleanup-failed",cleanupFailure));
        return outer;
    }

    static int Main(string[] arguments)
    {
        if(arguments.Length>0&&arguments[0]=="console")
        {
            Console.WriteLine("READY synthetic-console; no endpoint");Console.Out.Flush();
            if(arguments.Length>1)File.WriteAllText(arguments[1],"emitted");Thread.Sleep(1200);return 0;
        }
        if(arguments.Length!=4||(arguments[0]!="receive"&&arguments[0]!="send"))return 2;
        long mainStart=Stopwatch.GetTimestamp();
        var record=arguments[0]=="receive"?Receive(arguments):Send(arguments);
        ((Dictionary<string,object>)record["lifecycle"])["mainMs"]=ExpiryRecords.Ms(mainStart);
        try{File.WriteAllText(arguments[3],new JavaScriptSerializer().Serialize(record));}
        catch(Exception){Console.Error.WriteLine("fixture-record-write-failed");return 1;}
        return ExpiryRecords.Failed(record)?1:0;
    }
}
