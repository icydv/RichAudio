using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

// Record serialization only: no sender, listener, pipe or endpoint is constructed.
internal static class ExpiryRecordTests
{
    private static int checks;
    private static void Check(bool condition,string label)
    {
        checks++;if(!condition)throw new InvalidOperationException("Expiry record fixture: "+label);
    }
    private static int Main()
    {
        const string privateMarker="DO-NOT-EXPORT-THIS";
        var record=ExpiryRecords.New("sender","domain");
        record["diagnostic"]=new TransportResult {Stage="freshness",Code="invalid-age",Outcome="failed"};
        record["harnessFailure"]=ExpiryRecords.Failure("sender-stop-wait","sender-lifetime",new TimeoutException(privateMarker));
        ((List<object>)record["cleanupFailures"]).Add(ExpiryRecords.Failure("publisher-dispose","fixture-cleanup-failed",new System.IO.IOException(privateMarker)));
        ((Dictionary<string,object>)record["lifecycle"])["firstPublishMs"]=3.5;
        var serializer=new JavaScriptSerializer();
        string json=serializer.Serialize(record);
        Check(!json.Contains(privateMarker),"exception messages excluded");
        var restored=ExpiryRecords.Read(json);
        Check(restored["cleanupFailures"] is List<object>,"runtime cleanup collection normalized");
        Check(((List<object>)restored["cleanupFailures"]).Count==1,"cleanup entry survives roundtrip");
        Check(ExpiryRecords.Failed(restored),"failure survives roundtrip");
        Check((string)((Dictionary<string,object>)restored["diagnostic"])["Code"]=="invalid-age","primary transport result preserved");
        Check((string)((Dictionary<string,object>)restored["harnessFailure"])["code"]=="sender-lifetime","primary harness failure preserved");
        Check(Convert.ToDouble(((Dictionary<string,object>)restored["lifecycle"])["firstPublishMs"])==3.5,"numeric lifecycle survives roundtrip");
        ((List<object>)restored["cleanupFailures"]).Add(ExpiryRecords.Failure("appdomain-unload","fixture-cleanup-failed",new CannotUnloadAppDomainException(privateMarker)));
        var twice=ExpiryRecords.Read(serializer.Serialize(restored));
        Check(((List<object>)twice["cleanupFailures"]).Count==2,"outer-domain cleanup appended without replacing inner failure");
        Check(!serializer.Serialize(twice).Contains(privateMarker),"second serialization remains sanitized");
        Check(!ExpiryRecords.Failed(ExpiryRecords.Read(serializer.Serialize(ExpiryRecords.New("receiver","none")))),"empty runtime cleanup collection normalized");
        Console.WriteLine("Expiry record fixtures passed: "+checks+" checks; no transport or endpoint constructed");
        return 0;
    }
}
