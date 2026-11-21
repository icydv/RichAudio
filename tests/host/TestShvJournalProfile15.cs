using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Handoff;

internal static class TestShvJournalProfile15
{
    static int assertions;
    static void Check(bool value,string reason){assertions++;if(!value)throw new Exception(reason);}
    static int Main()
    {
        try{
#if SHV_HANDOFF_15
            const string profile="PLAYABLE-15",folder="playable-15";
#elif SHV_HANDOFF_14
            const string profile="PLAYABLE-14",folder="playable-14";
#elif SHV_HANDOFF_13
            const string profile="PLAYABLE-13",folder="playable-13";
#else
            const string profile="PLAYABLE-12",folder="playable-12";
#endif
            const string session="0123456789abcdef0123456789abcdef",caller="1111111111111111111111111111111111111111111111111111111111111111";
            // Actual production constructor, with explicit isolated fixture
            // policy constants. TryLoad and native module attachment are not run.
            var config=new ShvHandoffBootstrap.Configuration(session,caller);
            string expected=Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,".local",folder,"live-session",session);
            Check(config.EvidenceRoot==expected,"actual bootstrap root must match compile-time profile");
            Check(config.Scope!=null&&config.CreateReview(caller).Scope==config.Scope,"actual scope/review construction remains unchanged");
            Check(!Directory.Exists(expected),"new isolated journal session required");
            var journal=new ShvHandoffJournal(config.EvidenceRoot);
            Check(journal.WriteEvent("profile-fixture",new{profile=profile,session=session,actualBootstrapRoot=true}),"actual bounded journal admits one event");
            Check(journal.Complete(false,false,"offline-profile-check"),"actual journal writer joins healthy");
            Check(journal.CompletionObservedWithinBound&&!journal.WorkerAlive,"external caller observes writer completion");
            Check(File.ReadAllBytes(Path.Combine(expected,"source-records.bin")).Length==0,"no native source records fabricated");
            string[] events=File.ReadAllLines(Path.Combine(expected,"events.ndjson"));var json=new JavaScriptSerializer();
            Check(events.Length==1,"exact one retained event");var row=json.Deserialize<Dictionary<string,object>>(events[0]);var data=(Dictionary<string,object>)row["data"];
            Check((string)row["kind"]=="profile-fixture"&&(string)data["profile"]==profile&&(string)data["session"]==session,"actual private event roundtrip");
            var summary=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(expected,"summary.json")));
            Check((string)summary["profile"]==profile&&(string)summary["session"]==session,"final summary uses the same compile-time profile");
            Check(!(bool)summary["producerCompleted"]&&!(bool)summary["sourceRetired"]&&!(bool)summary["boundedWriterCompletionEstablishedBySummary"],"offline writer test makes no native completion or self-join claim");
            foreach(string other in new[]{"playable-12","playable-13","playable-14","playable-15"})if(other!=folder){
                string wrong=Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,".local",other,"live-session",session);bool rejected=false;
                try{new ShvHandoffJournal(wrong);}catch(ArgumentException error){rejected=error.Message=="compiled private evidence root";}
                Check(rejected&&!Directory.Exists(wrong),"cross-profile evidence path remains rejected before writer creation: "+other);
            }
            Console.WriteLine("{\"passed\":true,\"profile\":\""+profile+"\",\"assertions\":"+assertions+",\"actualConfigurationExecuted\":true,\"actualJournalWriterExecuted\":true,\"nativeModuleAttached\":false,\"gameExecuted\":false,\"endpointOpened\":false,\"audioPlayback\":false}");return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
