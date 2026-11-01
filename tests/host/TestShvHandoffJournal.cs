using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    internal sealed partial class HandoffPeerObservation
    {
        internal static HandoffPeerObservation JournalFixturePeer(H.HostContext context)
        {return new HandoffPeerObservation(new object(),context,1,2,1,1,257,2,1,513,new[]{1d,2d,3d},new[]{0d,0d,0d},new[]{0d,1d,0d},new[]{0d,0d,1d});}
    }
}
internal static class TestShvHandoffJournal
{
    static int cases,assertions;static readonly List<string> names=new List<string>();static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=65536};
    [DllImport("kernel32.dll")]static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
    static void Check(bool value,string why){assertions++;if(!value)throw new Exception(why);}
    static void Test(string name,Action body){body();cases++;names.Add(name);}
    static string Session(int value){return value.ToString("x32");}
    static string Root(int value){return Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,".local","playable-09","live-session",Session(value));}
    static IDictionary<string,object> Lease(){
        long creation,exit,kernel,user;using(var process=Process.GetCurrentProcess()){Check(GetProcessTimes(process.Handle,out creation,out exit,out kernel,out user),"actual fixture process creation");
            return new Dictionary<string,object>{{"schema",1},{"profile","PLAYABLE-09"},{"sessionId",Session(90)},{"gameProcessId",process.Id},{"gameProcessCreationFileTime",creation.ToString(System.Globalization.CultureInfo.InvariantCulture)},
                {"gamePath",ShvHandoffBuildPolicy.GamePath},{"gameSha256",ShvHandoffBuildPolicy.GameSha256},{"gameVersion",ShvHandoffBuildPolicy.GameVersion},
                {"shvPath",ShvHandoffBuildPolicy.ShvPath},{"shvSha256",ShvHandoffBuildPolicy.ShvSha256},{"loaderPath",ShvHandoffBuildPolicy.LoaderPath},{"loaderSha256",ShvHandoffBuildPolicy.LoaderSha256},
                {"rphPath",ShvHandoffBuildPolicy.RphPath},{"rphSha256",ShvHandoffBuildPolicy.RphSha256},{"rphVersion",ShvHandoffBuildPolicy.RphVersion},
                {"producerPath",ShvHandoffBuildPolicy.ProducerPath},{"producerSha256",ShvHandoffBuildPolicy.ProducerSha256},{"callerAssemblySha256",ShvHandoffBootstrap.HashAssembly(Assembly.GetExecutingAssembly())},
                {"passiveOnly",true},{"audioPlaybackAllowed",false},{"fixtureOnly",false},{"identityMode","read-only-sdk-ordinary-reuse"},{"counterWrapAddressAbaExcluded",true}};
        }
    }
    static void Put(IDictionary<string,object> lease){Directory.CreateDirectory(Path.GetDirectoryName(ShvHandoffBuildPolicy.LeasePath));File.WriteAllText(ShvHandoffBuildPolicy.LeasePath,Json.Serialize(lease),new System.Text.UTF8Encoding(false));}
    static void End(ShvHandoffJournal journal,bool completed=true){Check(journal.Complete(completed,true,"fixture-stopped"),"actual bounded writer joined healthy");Check(journal.CompletionObservedWithinBound&&!journal.WorkerAlive,"no orphan writer; externally observed join");}
    static GameplayFrame Frame(string session,long now){return new GameplayFrame{Session=session,Vehicles=new GameplayVehicle[0],Listener=new ListenerState{Version=1,Session=session,Generation=1,Sequence=1,ObservationTicks=now,ClockFrequency=Stopwatch.Frequency,GameTimeMs=0,Position=new[]{0d,0d,1d},Velocity=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d},ListenerKind="camera",VelocityKind="estimated-camera-difference",Paused=false,Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null}};}
    static int Main(){try{
        Test("actual process-bound strict lease and absent lease",delegate{
            ShvHandoffBootstrap.Configuration config;string why;Check(!ShvHandoffBootstrap.TryLoad(out config,out why)&&why=="reviewed-session-absent","absent lease cannot arm");
            var lease=Lease();Put(lease);Check(ShvHandoffBootstrap.TryLoad(out config,out why)&&config.SessionId==Session(90),"actual fixture PID/time and caller bytes match authored fixture policy");
            Check(config.EvidenceRoot==Root(90)&&!config.CreateReview((string)lease["callerAssemblySha256"]).FixtureOnly,"output derives from policy; no fixtureOnly lease bypass");
        });
        Test("wrong process creation artifact purpose fields and duplicate JSON fail closed",delegate{
            string[] keys={"gameProcessId","gameProcessCreationFileTime","producerSha256","callerAssemblySha256","audioPlaybackAllowed","fixtureOnly","counterWrapAddressAbaExcluded","identityMode"};
            foreach(string key in keys){var lease=Lease();if(key=="gameProcessId")lease[key]=Int32.MaxValue;else if(key=="gameProcessCreationFileTime")lease[key]="1";else if(key=="producerSha256"||key=="callerAssemblySha256")lease[key]=new String('0',64);else if(key=="identityMode")lease[key]="marker-mode";else lease[key]=!(bool)lease[key];Put(lease);
                ShvHandoffBootstrap.Configuration config;string why;Check(!ShvHandoffBootstrap.TryLoad(out config,out why)&&config==null,"bad lease "+key);}
            var extra=Lease();extra["outputRoot"]="C:\\arbitrary";Put(extra);ShvHandoffBootstrap.Configuration value;string reason;Check(!ShvHandoffBootstrap.TryLoad(out value,out reason),"no arbitrary output field");
            string text=Json.Serialize(Lease());File.WriteAllText(ShvHandoffBuildPolicy.LeasePath,text.Substring(0,text.Length-1)+",\"schema\":1}");Check(!ShvHandoffBootstrap.TryLoad(out value,out reason),"duplicate field rejected");
            File.WriteAllText(ShvHandoffBuildPolicy.LeasePath,"{\"schema\":");Check(!ShvHandoffBootstrap.TryLoad(out value,out reason),"partial lease rejected");
        });
        Test("exact256-byte source POD survives actual background file writer",delegate{
            var journal=new ShvHandoffJournal(Root(1));var row=new ShvAbi.Record{Size=256,Kind=ShvAbi.Kind.TargetReturn,Session0=123,Session1=456,Generation=1,Sequence=1,SourceInstanceQpc=1000,TargetBeforeQpc=2000,TargetAfterQpc=2010,RawBits=0x3E4CCCCD,RawFloat32=.2f,ReadStatus=ShvAbi.ReadStatus.Good,Flags=39};
            Check(journal.WriteSource(row),"return admitted");row.Kind=ShvAbi.Kind.Observation;row.Flags=63;Check(journal.WriteSource(row),"observation admitted");row.Kind=ShvAbi.Kind.Terminal;row.Flags=128;row.Terminal=1;Check(journal.WriteSource(row),"terminal admitted");End(journal);
            byte[] raw=File.ReadAllBytes(Path.Combine(Root(1),"source-records.bin"));Check(raw.Length==3*256,"exact fixed records");
            Check(BitConverter.ToUInt32(raw,0)==256&&BitConverter.ToUInt32(raw,4)==1&&BitConverter.ToUInt64(raw,32)==1,"manual golden ABI header offsets");
            Check(BitConverter.ToUInt32(raw,64)==0x3E4CCCCD&&BitConverter.ToSingle(raw,68)==.2f,"raw bits and separate float32 exact");
            Check(BitConverter.ToUInt32(raw,256+4)==2&&BitConverter.ToUInt32(raw,512+4)==3,"FIFO order independent byte checks");
            var summary=Json.DeserializeObject(File.ReadAllText(Path.Combine(Root(1),"summary.json"))) as IDictionary<string,object>;
            Check((bool)summary["producerCompleted"]&&(bool)summary["sourceRetired"]&&!(bool)summary["boundedWriterCompletionEstablishedBySummary"],"source completion distinct; summary never self-certifies join");
        });
        Test("gameplay frame codec and private internal lineage are both preserved",delegate{
            string session=Session(2);long now=Stopwatch.GetTimestamp();var frame=Frame(session,now);
            var host=new H.HostContext("player","ped","vehicle-local","vehicle-local","ped",1,H.BatiModel,true,true,now-10,now);
            var context=new H.ShvContext(0,3,7,3,H.BatiModel,1,0,true,100,200);var observation=new H.Observation(session,1,1,H.QualifiedDiagnosticScope(),context,context,host,host,120,130,0x3E4CCCCD,(double).2f,true,"good");
            var candidate=new H.Candidate(observation,now-10,now,now+Stopwatch.Frequency/4,Stopwatch.Frequency);var peer=HandoffPeerObservation.JournalFixturePeer(host);
            frame.Vehicles=new[]{new GameplayVehicle{Id="vehicle-local",Generation=1,ObservationTicks=now,Model=H.BatiModel,Context="player",Position=peer.Position,Velocity=peer.Velocity,Forward=peer.Forward,Up=peer.Up,OperatingPoint=(double).2f,Running=true,Valid=true}};
            var journal=new ShvHandoffJournal(Root(2));Check(journal.WriteFrame(frame,new ShvGameplayFrameAdapter.Lineage(candidate,peer,frame.Listener,now)),"actual codec frame queued");End(journal,false);
            var events=File.ReadAllLines(Path.Combine(Root(2),"events.ndjson"));var item=Json.DeserializeObject(events[0]) as IDictionary<string,object>;var data=item["data"] as IDictionary<string,object>;
            var decoded=GameplayWire.Decode(System.Text.Encoding.UTF8.GetBytes((string)data["frameJson"]),session);Check(decoded.Vehicles[0].OperatingPoint==(double).2f,"existing gameplay decode preserves promoted float");
            var lineage=data["lineage"] as IDictionary<string,object>;Check(lineage.ContainsKey("rawBits")&&(string)lineage["session"]==session&&Convert.ToInt64(lineage["minimumHostTicks"])==now-10,"internal fields explicitly journaled rather than empty object");
            var summary=Json.DeserializeObject(File.ReadAllText(Path.Combine(Root(2),"summary.json"))) as IDictionary<string,object>;
            Check(!(bool)summary["producerCompleted"]&&(string)summary["sourceCallbackOutcome"]=="outcome-unobserved","retirement without callback completion remains unknown");
        });
        Test("admitted audit ordinal retries are byte-exact and idempotent",delegate{
            var journal=new ShvHandoffJournal(Root(4));var row=new ShvAbi.Record{Size=256,Kind=ShvAbi.Kind.TargetReturn,Sequence=1,RawBits=0x3E4CCCCD,RawFloat32=.2f};
            Check(journal.WriteSourceAudit(1,row),"first audit admission");Check(journal.WriteSourceAudit(1,row),"retry after simulated admission-before-ack interruption");
            row.Kind=ShvAbi.Kind.Observation;Check(journal.WriteSourceAudit(2,row),"next ordinal after ack");End(journal);
            Check(File.ReadAllBytes(Path.Combine(Root(4),"source-records.bin")).Length==512,"retry produces no duplicate file record");
            var summary=Json.DeserializeObject(File.ReadAllText(Path.Combine(Root(4),"summary.json"))) as IDictionary<string,object>;
            Check(Convert.ToInt64(summary["lastAuditOrdinal"])==2&&Convert.ToInt32(summary["duplicateAuditsSuppressed"])==1,"bounded last ordinal evidence");
            journal=new ShvHandoffJournal(Root(5));Check(journal.WriteSourceAudit(1,row),"known raw row admitted even malformed semantic sequence");row.RawBits++;
            Check(!journal.WriteSourceAudit(1,row)&&!journal.Healthy,"changed bytes cannot reuse admitted ordinal");
            Check(!journal.Complete(false,true,"changed-duplicate")&&journal.CompletionObservedWithinBound&&!journal.WorkerAlive,"failed audit still joins bounded writer");
            Check(File.ReadAllBytes(Path.Combine(Root(5),"source-records.bin")).Length==256,"changed duplicate never appended");
        });
        Test("known malformed raw POD is retained without qualification",delegate{
            var journal=new ShvHandoffJournal(Root(6));var row=new ShvAbi.Record{Size=0,Kind=(ShvAbi.Kind)999,Sequence=999,Session0=777,RawBits=0x7FC00000,RawFloat32=Single.NaN};
            Check(journal.WriteSourceAudit(1,row),"reported invalid size kind session sequence remain known256-byte audit");End(journal,false);
            byte[] bytes=File.ReadAllBytes(Path.Combine(Root(6),"source-records.bin"));Check(bytes.Length==256&&BitConverter.ToUInt32(bytes,0)==0&&BitConverter.ToUInt32(bytes,4)==999&&BitConverter.ToUInt32(bytes,64)==0x7FC00000,"manual raw malformed golden preserved");
            var summary=Json.DeserializeObject(File.ReadAllText(Path.Combine(Root(6),"summary.json"))) as IDictionary<string,object>;
            Check(Convert.ToInt32(summary["sourceOrderAnomalies"])==1&&!(bool)summary["producerCompleted"],"anomaly is audit-only and completion unknown");
        });
        Test("new session ownership never overwrites an existing evidence folder",delegate{
            var journal=new ShvHandoffJournal(Root(1));Check(!journal.Complete(false,true,"existing-folder"),"CreateNew folder refused");Check(!journal.Healthy&&!journal.WorkerAlive,"failed writer exits without orphan");
            Check(File.ReadAllBytes(Path.Combine(Root(1),"source-records.bin")).Length==768,"earlier evidence untouched");
            bool rejected=false;try{new ShvHandoffJournal(Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,"arbitrary"));}catch(ArgumentException){rejected=true;}Check(rejected,"compiled path boundary enforced");
        });
        Test("bounded queue or aggregate budget fails health without unbounded memory or output",delegate{
            var journal=new ShvHandoffJournal(Root(3));bool failed=false;string payload=new String('x',60000);
            for(int i=0;i<300;i++)if(!journal.WriteEvent("bounded-budget",new{value=payload})){failed=true;break;}
            Check(failed&&!journal.Healthy,"queue or12MiB admission cap stops writer feed");Check(!journal.Complete(false,true,"budget-rejected"),"failed health is not clean completion");
            var wait=Stopwatch.StartNew();while(journal.WorkerAlive&&wait.ElapsedMilliseconds<5000)Thread.Sleep(10);Check(!journal.WorkerAlive,"bounded private worker subsequently drains and exits");
            long bytes=0;foreach(string path in Directory.GetFiles(Root(3)))bytes+=new FileInfo(path).Length;Check(bytes<=12*1024*1024,"actual files stay below aggregate cap");
        });
        Console.WriteLine("{\"passed\":true,\"cases\":"+cases+",\"assertions\":"+assertions+",\"gameExecuted\":false,\"endpointOpened\":false,\"audioPlayback\":false,\"casesPassed\":[\""+String.Join("\",\"",names.ToArray())+"\"]}");return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
