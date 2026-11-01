using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Windows.Recording
{
    // Only the scoped host consumes this owner-created per-run permit. Ordinary
    // host mode retains its existing startup permit and recording policy.
    internal sealed class GameplayDemoPermit
    {
        internal readonly bool RecordingAllowed,LoopbackAllowed,FixtureOnly;
        internal readonly string Session;
        private GameplayDemoPermit(string session,bool recording,bool loopback,bool fixture)
        {Session=session;RecordingAllowed=recording;LoopbackAllowed=loopback;FixtureOnly=fixture;}
        internal static GameplayDemoPermit Load(string path,string session,bool fixture)
        {
            PlayableConfiguration.NoLinks(path);
            string text=AcousticSettingsStore.ReadBounded(path,4096);
            string[] fields={"schema","profile","session","playbackAllowed","recordingAllowed","loopbackAllowed","fixtureOnly"};
            var d=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=3}.DeserializeObject(text) as Dictionary<string,object>;
            if(d==null||d.Count!=fields.Length)throw new InvalidDataException("Scoped demo permit schema");
            foreach(string key in fields)if(!d.ContainsKey(key)||Regex.Matches(text,"\""+key+"\"\\s*:").Count!=1)throw new InvalidDataException("Scoped demo permit fields");
            foreach(string key in new[]{"playbackAllowed","recordingAllowed","loopbackAllowed","fixtureOnly"})if(!(d[key] is bool))throw new InvalidDataException("Scoped demo permit flags");
            if(!(d["schema"] is int)||(int)d["schema"]!=1||!Object.Equals(d["profile"],"PLAYABLE-13")||!Object.Equals(d["session"],session)
                ||!(bool)d["playbackAllowed"]||(bool)d["fixtureOnly"]!=fixture||(bool)d["loopbackAllowed"]&&!(bool)d["recordingAllowed"])
                throw new InvalidDataException("Scoped demo permit ownership or permission");
            return new GameplayDemoPermit(session,(bool)d["recordingAllowed"],(bool)d["loopbackAllowed"],fixture);
        }
    }

    // The PCM tap and loopback/file writers are the existing recording system.
    // This adapter adds host lifecycle and frame diagnostics, not a new recorder.
    internal sealed class GameplayRecording:IDisposable
    {
        readonly RecordingSession session;
        readonly GameplayDemoPermit permit;
        readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=8};
        readonly object events=new object();
        int stopped;
        internal readonly OwnedOutputTap Tap;
        internal string Failure,LoopbackState="not-requested";
        internal string DirectoryPath{get{return session.DirectoryPath;}}
        internal string RecordingId{get{return session.RecordingId;}}
        internal RecordingSnapshot Snapshot{get{return session.Snapshot;}}
        internal bool Accepting{get{return session.Accepting;}}
        private GameplayRecording(RecordingSession recording,GameplayDemoPermit approved)
        {session=recording;permit=approved;Tap=session.CreateOwnedTap();}
        internal static GameplayRecording TryStart(string root,GameplayDemoPermit permit,out string reason)
        {
            reason=null;if(permit==null||!permit.RecordingAllowed){reason="recording-not-requested";return null;}
            RecordingSession recording;
            if(!RecordingSession.TryCreate(root,new RecordingOptions(120),RecordingReadiness.FirstDemo(true,permit.LoopbackAllowed,permit.FixtureOnly),out recording,out reason))return null;
            try{
                var result=new GameplayRecording(recording,permit);
                result.Event("demo-measurement-start",Stopwatch.GetTimestamp(),new{profile="PLAYABLE-13",hostSession=permit.Session,firstDemoMeasurement=true,
                    productionRecordingFeatureEnabled=false,humanListeningApproved=false,livePcmVerified=false,
                    loopbackRequested=permit.LoopbackAllowed,fixtureOnly=permit.FixtureOnly,
                    purpose="Measure the approved demonstration; no listening or live qualification inferred"});
                return result;
            }catch(Exception error){recording.Dispose();reason=error.GetType().Name+": "+error.Message;return null;}
        }
        internal void StartLoopback(string actualSelectedEndpointId,ILoopbackDriver fixtureDriver=null)
        {
            if(!permit.LoopbackAllowed)return;
            string reason;
            bool accepted;
            if(permit.FixtureOnly){
                if(fixtureDriver==null){LoopbackState="fixture-loopback-not-supplied";Failure=LoopbackState;session.LoopbackUnavailable(LoopbackState);return;}
                accepted=session.StartFixtureLoopback(fixtureDriver,out reason);
            }else accepted=session.StartLoopback(actualSelectedEndpointId,out reason);
            LoopbackState=accepted?"selected-endpoint-loopback-requested":"loopback-unavailable";
            if(!accepted)Failure=reason??LoopbackState;
            Event("demo-loopback-request",Stopwatch.GetTimestamp(),new{accepted=accepted,reason=reason,selectedEndpointAvailable=!String.IsNullOrEmpty(actualSelectedEndpointId),
                firstOutputCoverageGuaranteed=false,clockBasis="Existing WASAPI packet QPC and post-gain output submission indices"});
        }
        internal bool Event(string kind,long sourceTicks,object payload)
        {
            try{lock(events)return session.TryDiagnostic(kind,"host-Stopwatch-QPC",sourceTicks,Stopwatch.Frequency,json.Serialize(payload));}
            catch(Exception error){Failure="recording-diagnostic: "+error.GetType().Name;return false;}
        }
        internal void Frame(GameplayFrame frame,long validThrough)
        {
            var v=frame.Vehicles.Length==1?frame.Vehicles[0]:null;
            Event("gameplay-frame",frame.Listener.ObservationTicks,new{session=frame.Session,listenerSequence=frame.Listener.Sequence,listenerGeneration=frame.Listener.Generation,
                observationTicks=frame.Listener.ObservationTicks,validThroughTicks=validThrough,vehicleObservationTicks=v==null?(long?)null:v.ObservationTicks,
                operatingPoint=v==null?(double?)null:v.OperatingPoint,model=v==null?(uint?)null:v.Model,context=v==null?null:v.Context,
                vehicleId=v==null?null:v.Id,vehicleGeneration=v==null?(int?)null:v.Generation,position=v==null?null:v.Position,
                velocity=v==null?null:v.Velocity,listenerPosition=frame.Listener.Position,listenerForward=frame.Listener.Forward,
                sourceClock="Frame already mapped from SHV into the owned host QPC domain; original native/map lineage remains in handoff journal"});
        }
        internal object Metrics(){var s=Snapshot;return new{requested=true,hostSession=permit.Session,recordingId=RecordingId,state=s.State,reason=s.Reason,complete=s.Complete&&Failure==null&&(!permit.LoopbackAllowed||s.LoopbackFrames>0),
            ownedFrames=s.OwnedFrames,loopbackFrames=s.LoopbackFrames,bytes=s.Bytes,loopbackState=LoopbackState,failure=Failure,
            endpointOpened=s.EndpointOpened,humanListeningApproved=false,subjectiveQualityEstablished=false};}
        public void Dispose()
        {
            if(Interlocked.Exchange(ref stopped,1)!=0)return;
            Event("demo-measurement-stop",Stopwatch.GetTimestamp(),new{tapStopRequested=true,finalizationRequiresExistingTapCompletion=true});
            session.RequestStop();Tap.Dispose();session.Dispose();
            var s=Snapshot;
            var value=new{schema=1,profile="PLAYABLE-13",hostSession=permit.Session,recordingId=RecordingId,recordingComplete=s.Complete&&Failure==null&&(!permit.LoopbackAllowed||s.LoopbackFrames>0),state=s.State,reason=s.Reason,
                adapterFailure=Failure,loopbackRequested=permit.LoopbackAllowed,loopbackState=LoopbackState,
                firstDemoMeasurement=true,humanListeningApproved=false,subjectiveQualityEstablished=false,
                analysisCommand="node tools/Analyze-Playable13Recording.mjs --session <this directory> --output <new private directory>",
                analysisMustRunAfterFinalManifest=s.Complete||File.Exists(Path.Combine(DirectoryPath,"session.json"))};
            string path=Path.Combine(DirectoryPath,"demo-analysis-request.json");
            try{using(var f=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read))using(var writer=new StreamWriter(f)){writer.Write(new JavaScriptSerializer().Serialize(value));}}
            catch(Exception error){Failure=Failure??("analysis-request: "+error.GetType().Name);}
        }
    }

    internal sealed class GameplayShutdownFade
    {
        // Existing renderer's20ms exponential snaps below1e-9 (~415ms).
        // Preserve it, then consume queued PCM/control/device reserve as well.
        internal const int MinimumMilliseconds=650,MaximumMilliseconds=1500;
        long at=-1,consumedAt,requiredFrames;
        internal bool Requested{get{return at>=0;}}
        internal bool Begin(long now,long consumed,int bufferedFrames)
        {if(Requested)return false;at=now;consumedAt=consumed;requiredFrames=Math.Max(0,bufferedFrames)+24000;return true;}
        internal bool Complete(long now,long consumed)
        {return Requested&&(now-at>=MaximumMilliseconds||now-at>=MinimumMilliseconds&&consumed-consumedAt>=requiredFrames);}
        internal bool FullyConsumed(long consumed){return Requested&&consumed-consumedAt>=requiredFrames;}
    }
}
