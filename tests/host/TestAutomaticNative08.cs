using System;
using System.Collections.Generic;
using System.Linq;
using RichAudio.NativeSuppression01;

internal static class TestAutomaticNative08
{
    static int assertions,cases;
    static void Check(bool b,string s){assertions++;if(!b)throw new Exception(s);}
    internal sealed class Journal:IRunJournal {
        public readonly List<string> Lines=new List<string>();public bool OK=true,Flush=true;long seq;
        public bool Healthy{get{return OK;}}public long Write(string s){Lines.Add(s);return ++seq;}public bool Durable(long n){return OK&&Flush&&n<=seq;}
    }
    internal sealed class Api:IAutomaticIdleApi {
        public bool Ready=true,SeatFails,CameraFails,IdentityLost,DeleteFails,AEngine,BEngine,Seated,ViewSaved,Restored,HornFails,PlacementFails,Paused,Frozen;
        int simTime,simFrames;
        public RuntimeProgress ReadProgress(){if(!Frozen){simTime+=50;simFrames++;}return new RuntimeProgress{StoryReady=Ready,PauseMenu=Paused,GameMilliseconds=simTime,SimulationFrames=simFrames};}
        public double CameraShift;public Action BeforeAssign;public int AdmissionFailures;
        public bool Model=true,ThrowOnReturn;public int Deletes,Seats,AStarts,BStarts,StopsA,Horns;
        public string ThrowProfile="";public readonly List<string> Profiles=new List<string>();
        public bool StoryReady{get{return Ready;}}public bool ModelReady{get{return Model;}}public bool PlayerOnFoot{get{return !Seated;}}
        public void Prepare(){}public void ReleaseModel(){}
        public Lifetime Spawn(string role,int token){return new Lifetime{Handle=role=="A"?100:200,Token=token,Role=role};}
        public bool Matches(Lifetime l){return l!=null&&!l.Deleted&&!l.Lost&&!IdentityLost;}
        public bool CanRestore(Lifetime a){return Ready&&Matches(a)&&a.Role=="A";}
        public bool CanSwitch(Lifetime a,Lifetime b){return CanRestore(a)&&Matches(b)&&Seated&&AEngine&&BEngine;}
        public bool CanStartControl(Lifetime a,Lifetime b){return CanRestore(a)&&Matches(b)&&Seated&&AEngine&&!BEngine;}
        public void StartControl(Lifetime a,Lifetime b,Func<bool> admitted){Check(CanStartControl(a,b)&&admitted(),"real controller validates control start");BStarts++;BEngine=true;}
        public void Assign(Lifetime a,string p,Func<bool> admitted){if(BeforeAssign!=null){var callback=BeforeAssign;BeforeAssign=null;callback();}if(!admitted()){AdmissionFailures++;throw new InvalidOperationException("fixture final admission expired");}Check(a.Role=="A"&&CanRestore(a),"A-only checked dispatch");Profiles.Add(p);if(ThrowOnReturn&&p==ThrowProfile)throw new Exception("fixture lost native return");}
        public bool Delete(Lifetime a){if(!Matches(a)||Seated||DeleteFails)return false;Deletes++;a.Deleted=true;return true;}
        public string Snapshot(Lifetime a){return "fixture handle="+a.Handle+" token="+a.Token+" engineOn="+(a.Role=="A"?AEngine:BEngine);}
        public void SaveView(){ViewSaved=true;}public bool PrepareSite(){return !PlacementFails;}public void RestoreView(){Restored=true;}
        public void HoldInputs(){}
        public void SeatA(Lifetime a){Seats++;if(!SeatFails)Seated=true;}
        public bool SeatedA(Lifetime a){return Matches(a)&&Seated;}
        public void StartA(Lifetime a){AStarts++;AEngine=true;}
        public bool EngineOn(Lifetime a){return a.Role=="A"?AEngine:BEngine;}
        public void LeaveA(Lifetime a){Seated=false;AEngine=false;}
        public void StandBehindB(Lifetime a,Lifetime b){}
        public void StopAForComparison(Lifetime a){if(AEngine){StopsA++;AEngine=false;}}
        public void SetView(bool seated){}
        public Pose ReadPose(){return new Pose{X=(Seated?1:11)+CameraShift,Y=Seated?2:12,Z=3,PlayerX=Seated?1:11,PlayerY=2,PlayerZ=1,Gameplay=!CameraFails};}
        public bool PairState(Lifetime a,Lifetime b,bool seated,bool aEngine){return Ready&&Matches(a)&&Matches(b)&&Seated==seated&&AEngine==aEngine&&BEngine;}
        public void HornA(Lifetime a){Check(Matches(a)&&Seated&&AEngine,"physical horn requires exact idling A");Horns++;}
        public bool HornActive(Lifetime a){return !HornFails;}
    }
    sealed class Fixture {
        public long Time=1000000;public const long Freq=1000;int token=10;
        public readonly Api Api=new Api();public readonly Journal Journal=new Journal();public readonly AutomaticRun Run;
        public CaptureLease Capture;
        public Fixture(){Run=new AutomaticRun(Api,Journal,()=>Time,Freq,()=>++token,"fixture-session");Step();Step();}
        public void Pulse(){Capture=new CaptureLease{Session="fixture-session",Recording="fixture-recording",RecordingActive=true,Foreground=true,TimelineReady=true,StartupAdmitted=true,ObservedTicks=Time};}
        public void Step(double seconds=.05){Time+=(long)(seconds*Freq);Pulse();Run.Tick(Capture);}
        public RunCommand Make(string op="Review",string decision=null){var s=Run.State;return new RunCommand{Session=s.Session,Id=Guid.NewGuid().ToString("N"),Phase=s.Phase,Profile=s.Profile,Generation=s.Generation,Observation=s.Observation,Operation=op,Decision=decision??(s.Phase=="B-pre"||s.Phase=="B-post"?"ControlNormal":s.Phase=="1"?"DistinctEngine":s.Phase=="3"?"MatchedEngine":"Normal"),Text="AUTOMATED OFFLINE LISTENING FIXTURE; no human opinion or live consent",ExpiresTicks=Time+5000,CaptureReviewed=true,ContextReviewed=true,EvidenceSha256=new String('a',64)};}
        public void Begin(){Check(Run.Command(Make("Begin"),Capture).StartsWith("accepted"),"begin accepted");}
        public void Review(){Check(Run.Command(Make(),Capture).StartsWith("accepted"),"bound review accepted");}
        public void Until(Func<bool> p,double max=650){long end=Time+(long)(max*Freq);while(!p()&&Time<end&&!Run.State.Finished)Step();Check(p(),"fixture reached expected state; actual="+Run.State.Stage+" "+Run.State.Phase);}
        public void At(string phase){Until(()=>Run.State.AwaitingReview&&Run.State.Phase==phase);}
        public void Finish(bool reviews=true){Until(()=>Run.State.Finished||Run.State.AwaitingReview);for(int i=0;!Run.State.Finished&&i<20000;i++){if(reviews&&Run.State.AwaitingReview)Review();Step();}Check(Run.State.Finished,"bounded finish");}
    }
    static void Test(string name,Action f){f();cases++;Console.WriteLine("PASS "+name);}
    public static int Main(){try{
        Test("Dormant observes runtime without taking controls",()=>{var f=new Fixture();for(int i=0;i<40;i++)f.Step();Check(f.Run.State.CallbackSequence>40&&f.Run.State.RuntimeReady&&f.Api.Seats==0&&f.Api.Profiles.Count==0&&!f.Api.ViewSaved,"passive startup observations only");});
        Test("startup focus/capture receipt required before Begin",()=>{var f=new Fixture();f.Capture.StartupAdmitted=false;Check(f.Run.Command(f.Make("Begin"),f.Capture).StartsWith("rejected"),"no startup admission no spawn");});
        Test("pause menu refuses activation despite fresh external capture",()=>{var f=new Fixture();f.Api.Paused=true;f.Step();Check(!f.Run.State.RuntimeReady&&f.Run.Command(f.Make("Begin"),f.Capture).StartsWith("rejected"),"pause cannot become an audio result");});
        Test("callbacks with frozen simulation do not prove readiness",()=>{var f=new Fixture();f.Api.Frozen=true;for(int i=0;i<20;i++)f.Step();Check(!f.Run.State.RuntimeReady&&f.Run.State.CallbackSequence>20,"fresh callback counter alone insufficient");Check(f.Run.Command(f.Make("Begin"),f.Capture).StartsWith("rejected"),"frozen timer/frames refuse Begin");});
        Test("feedback stays unarmed in background and settles after return",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");for(int i=0;i<600;i++){f.Time+=50;f.Pulse();f.Capture.Foreground=false;f.Run.Tick(f.Capture);}Check(f.Api.Profiles.Count==0&&!f.Run.State.ArmPending,"30-second feedback window has no arm");f.Review();for(int i=0;i<60;i++){f.Time+=50;f.Pulse();f.Capture.Foreground=false;f.Run.Tick(f.Capture);}Check(f.Run.State.Stage=="Resume"&&f.Api.Profiles.Count==0,"background durable reply cannot dispatch");f.Until(()=>f.Run.State.Stage=="DispatchReady",6);Check(f.Api.Profiles.Count==0,"settled foreground precedes reservation");f.At("0");Check(f.Api.Profiles.Count==1,"one self-control after return");});
        Test("pause after feedback prevents next profile",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.Api.Paused=true;f.Step();f.Finish(false);Check(!f.Api.Profiles.Any(x=>x=="ADDER"),"no phase admission while paused");});
        Test("wrong foreground during fixed window invalidates it",()=>{var f=new Fixture();f.Begin();f.Until(()=>f.Run.State.Stage=="Stability");f.Capture.Foreground=false;f.Run.Tick(f.Capture);f.Finish(false);Check(f.Api.Profiles.Count==0,"focus loss cannot be suppression evidence");});
        Test("absolute deadline survives stopped callbacks",()=>{var f=new Fixture();f.Begin();f.At("B-pre");long deadline=f.Run.State.Deadline;long tick=f.Run.State.Ticks;f.Time+=610000;Check(f.Run.State.Deadline==deadline&&f.Run.State.Ticks==tick,"status cannot manufacture fresh callbacks or renew OS-clock deadline");f.Run.Tick(f.Capture);Check(f.Run.State.Finished&&f.Run.State.Deadline==deadline,"expired session cannot restart progression");});
        Test("complete actual runner/controller path, zero F keys",()=>{var f=new Fixture();f.Begin();f.Finish();Check(f.Api.Profiles.SequenceEqual(IdleExperiment.Profiles),"exact five profiles in order");Check(f.Api.BStarts==1&&f.Api.AStarts==2&&f.Api.Horns==6,"bounded automatic setup/horns");Check(f.Run.State.Retired&&f.Api.Deletes==2&&f.Api.Restored,"automatic retirement and settings restoration");Check(f.Journal.Lines.Count(x=>x.StartsWith("armed phase="))==5,"one arm per applied phase");});
        Test("human delay exceeds ten seconds BEFORE arm",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");for(int i=0;i<700;i++)f.Step();Check(!f.Journal.Lines.Any(x=>x.StartsWith("armed phase=")),"35-second conversational delay cannot expire unstarted arm");f.Review();f.At("0");Check(f.Api.Profiles.SequenceEqual(new[]{"BATI"}),"local arm and apply after review succeed");});
        Test("duplicate reviewed command cannot duplicate setter",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");var c=f.Make();var first=f.Run.Command(c,f.Capture);Check(f.Run.Command(c,f.Capture)==first,"duplicate reconciles same accepted record");f.At("0");f.Run.Command(c,f.Capture);Check(f.Api.Profiles.Count==1,"lost response reconciled without resending setter");});
        Test("stale earlier-phase review cannot operate later phase",()=>{var f=new Fixture();f.Begin();f.At("B-pre");var c=f.Make();f.Review();f.At("baseline");c.Id=Guid.NewGuid().ToString("N");c.ExpiresTicks=f.Time+5000;Check(f.Run.Command(c,f.Capture).StartsWith("rejected"),"stale feedback rejected");Check(f.Api.Profiles.Count==0,"no assignment from stale feedback");});
        Test("foreign session, generation, observation and expired request rejected",()=>{foreach(string bad in new[]{"session","generation","observation","expiry","profile"}){var f=new Fixture();f.Begin();f.At("B-pre");var c=f.Make();if(bad=="session")c.Session="other";if(bad=="generation")c.Generation="reused";if(bad=="observation")c.Observation="old";if(bad=="expiry")c.ExpiresTicks=f.Time-1;if(bad=="profile")c.Profile="arbitrary";Check(f.Run.Command(c,f.Capture).StartsWith("rejected"),"reject "+bad);Check(f.Api.Profiles.Count==0,"no setter "+bad);}});
        Test("missing listening answer expires locally and retires",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Finish(false);Check(f.Api.Profiles.Count==0&&f.Run.State.Retired,"no invented answer or assignment; automatic cleanup");Check(f.Time-f.Run.State.ActiveStart<600*Fixture.Freq,"cleanup before absolute session expiry");});
        Test("ambiguous listening result stops progression",()=>{var f=new Fixture();f.Begin();f.At("B-pre");var c=f.Make(decision:"Ambiguous");f.Run.Command(c,f.Capture);f.Finish(false);Check(f.Api.Profiles.Count==0,"ambiguity cannot pass");});
        Test("partial capture review fails closed",()=>{var f=new Fixture();f.Begin();f.At("B-pre");var c=f.Make();c.CaptureReviewed=false;f.Run.Command(c,f.Capture);f.Finish(false);Check(f.Api.Profiles.Count==0,"partial evidence never arms");});
        Test("durable acceptance barrier precedes spawn and dispatch",()=>{var f=new Fixture();f.Journal.Flush=false;f.Begin();for(int i=0;i<20;i++)f.Step();Check(f.Api.Seats==0,"unflushed begin never spawns/seats");f.Journal.Flush=true;f.At("B-pre");f.Review();f.At("baseline");f.Journal.Flush=false;f.Review();for(int i=0;i<20;i++)f.Step();Check(f.Api.Profiles.Count==0,"unflushed reviewed decision never arms");f.Journal.Flush=true;f.At("0");Check(f.Api.Profiles.Count==1,"durable continuation exactly once");});
        Test("reused vehicle identity cannot be adopted or deleted",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Api.IdentityLost=true;f.Finish(false);Check(f.Api.Profiles.Count==0&&f.Api.Deletes==0&&!f.Run.State.Retired,"lost lifetime stays unresolved");});
        Test("unexpected B engine stop is not maintained or restarted",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.At("0");f.Api.BEngine=false;f.Finish(false);Check(f.Api.BStarts==1&&f.Api.Profiles.All(x=>x=="BATI"),"one B start, no diagnostic continuation");});
        Test("player seating failure is bounded",()=>{var f=new Fixture();f.Api.SeatFails=true;f.Begin();f.Finish(false);Check(f.Api.Seats==1&&f.Api.Profiles.Count==0,"no seat retry or profile");});
        Test("camera cannot reach required pose",()=>{var f=new Fixture();f.Api.CameraFails=true;f.Begin();f.Finish(false);Check(f.Api.Profiles.Count==0,"camera failure no assignment");});
        Test("camera change invalidates selected window",()=>{var f=new Fixture();f.Begin();f.Until(()=>f.Run.State.Stage=="Stability");f.Api.CameraFails=true;f.Finish(false);Check(f.Api.Profiles.Count==0,"no retimed camera take");});
        Test("capture not ready prevents activation",()=>{var f=new Fixture();f.Capture.RecordingActive=false;Check(f.Run.Command(f.Make("Begin"),f.Capture).StartsWith("rejected"),"no ready capture no begin");Check(f.Run.State.ActiveStart==0,"active clock unstarted");});
        Test("capture stops during observation",()=>{var f=new Fixture();f.Begin();f.Until(()=>f.Run.State.Stage=="Stability");f.Capture.RecordingActive=false;f.Run.Tick(f.Capture);f.Finish(false);Check(f.Api.Profiles.Count==0,"capture failure stops diagnostics");});
        Test("late human feedback is retained but cannot revive stopped run",()=>{var f=new Fixture();f.Begin();f.At("B-pre");var c=f.Make();f.Finish(false);c.ExpiresTicks=f.Time+5000;Check(f.Run.Command(c,f.Capture).StartsWith("rejected"),"late feedback no restart");Check(f.Api.Profiles.Count==0,"no late assignment");});
        Test("time reserve refuses next phase before arming",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");while((f.Time-f.Run.State.ActiveStart)/1000.0<421)f.Step();f.Review();f.Finish(false);Check(f.Api.Profiles.Count==0,"full observation reserve enforced");});
        Test("automatic terminal BATI release and no more diagnostics",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.At("0");f.Review();f.At("1");f.Finish(false);Check(f.Api.Profiles.SequenceEqual(new[]{"BATI","ADDER","BATI"}),"one reserve release after unreviewed ADDER");Check(f.Run.State.Retired,"unanswered release does not block bounded cleanup");});
        Test("failed retirement never broadens deletion",()=>{var f=new Fixture();f.Api.DeleteFails=true;f.Begin();f.Finish();Check(!f.Run.State.Retired&&f.Api.Deletes==0,"unresolved delete logged, no alternative mechanism");});
        Test("uncertain terminal dispatch is never retried",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.At("0");f.Review();f.At("1");f.Api.ThrowProfile="BATI";f.Api.ThrowOnReturn=true;f.Run.Stop("fixture emergency",f.Capture);f.Finish(false);Check(f.Api.Profiles.SequenceEqual(new[]{"BATI","ADDER","BATI"}),"throwing release consumed once");Check(!f.Run.State.Retired,"unknown dispatch cannot become restoration/deletion proof");});
        Test("native prerequisite delay still expires final admission",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Api.BeforeAssign=()=>f.Time+=11000;f.Review();f.Finish(false);Check(f.Api.AdmissionFailures==1&&f.Api.Profiles.SequenceEqual(new[]{"BATI"}),"expired self request not dispatched; one separately admitted terminal BATI only");});
        Test("unexpected A engine stop is not restarted",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.At("0");f.Api.AEngine=false;f.Finish(false);Check(f.Api.AStarts==2&&f.Api.Profiles.All(x=>x=="BATI"),"no A restart or ADDER after baseline");});
        Test("pose drift invalidates observation without retake",()=>{var f=new Fixture();f.Begin();f.Until(()=>f.Run.State.Stage=="Stability");f.Api.CameraShift=.2;f.Finish(false);Check(f.Api.Profiles.Count==0,"actual geometry drift fails before assignment");});
        Test("missing horn-active witness stops baseline",()=>{var f=new Fixture();f.Api.HornFails=true;f.Begin();f.At("B-pre");f.Review();f.Finish(false);Check(f.Api.Profiles.Count==0&&f.Api.Horns==1,"no horn repeat or profile without route witness");});
        Test("lost ADDER return is not replayed or accepted as positive",()=>{var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();f.At("0");f.Api.ThrowProfile="ADDER";f.Api.ThrowOnReturn=true;f.Review();f.Finish(false);Check(f.Api.Profiles.SequenceEqual(new[]{"BATI","ADDER","BATI"})&&!f.Journal.Lines.Any(x=>x.StartsWith("REQUEST RETURNED ADDER")),"dispatched but unreturned ADDER remains uncertain; one release and no private request");});
        Test("fixed exterior cannot be verified",()=>{var f=new Fixture();f.Api.PlacementFails=true;f.Begin();f.Finish(false);Check(f.Api.Seats==0&&f.Api.Profiles.Count==0&&f.Api.Restored,"bounded pre-pair failure restores view");});
        Test("all native operations stay A-only; terminal commands cannot add profiles",()=>{var f=new Fixture();f.Begin();f.Finish();int n=f.Api.Profiles.Count;for(int i=0;i<20;i++){f.Run.Stop("duplicate emergency",f.Capture);f.Run.Command(f.Make(),f.Capture);f.Step();}Check(f.Api.Profiles.Count==n&&n==5,"no extra assignments after terminal finish");});
        Console.WriteLine("PASS cases="+cases+" assertions="+assertions+"; authored deterministic fixtures; zero GTA launches; zero human-key requirements; no live sound qualification");return 0;
    }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
