using System;
using System.Collections.Generic;
using System.Linq;
using RichAudio.NativeSuppression01;
internal static partial class TestUnknownName {
    static int cases,assertions;static Fixture current;static readonly List<Fixture> fixtures=new List<Fixture>();
    static void Check(bool b,string why){assertions++;if(!b)throw new Exception(why);}
    internal sealed class Journal:IRunJournal {
        internal Action<string> OnWrite;
        internal Func<long> Clock;
        internal readonly List<string> Wire=new List<string>();
        internal readonly List<string> Lines=new List<string>();long seq;
        public bool Healthy{get{return true;}}public long Write(string s){Lines.Add(s);if(Clock!=null)Wire.Add((seq+1)+"|AUTHORED qpc="+Clock()+" "+s);if(OnWrite!=null)OnWrite(s);return ++seq;}public bool Durable(long s){return s<=seq;}
    }
    // This adapter records requested controls. It never changes a speed or simulates brake physics.
    sealed class RiderInput : IIdleNativeCalls {
        readonly SetupGame11 game;
        internal long LastBrake, FirstBrake, ThrottleClamp;
        internal bool ReplayExit;
        internal Func<float,float,float,bool> Occupied;
        internal RiderInput(SetupGame11 game){this.game=game;}
        static ulong Bits(GTA.Native.InputArgument a){return (ulong)typeof(GTA.Native.InputArgument)
            .GetField("_data",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(a);}
        public int GameTime{get{return game.GameTime;}}
        public int FrameCount{get{return game.FrameCount;}}
        public bool Paused{get{return game.Paused;}}
        public void RegisterDecorator(string n,IIdleDecoratorLock g,Action<string> log){game.RegisterDecorator(n,g,log);}
        public void Call(GTA.Native.Hash h,params GTA.Native.InputArgument[] a){
            if(h==GTA.Native.Hash.DISABLE_CONTROL_ACTION && Bits(a[1])==71)ThrottleClamp=game.Now;
            game.Call(h,a);
        }
        public T Call<T>(GTA.Native.Hash h,params GTA.Native.InputArgument[] a){
            if(h==GTA.Native.Hash.GET_GROUND_Z_FOR_3D_COORD && ReplayExit) {
                System.Runtime.InteropServices.Marshal.Copy(BitConverter.GetBytes(40.16f),0,new IntPtr((long)Bits(a[3])),4);
                return (T)(object)true;
            }
            if(h==GTA.Native.Hash.IS_POSITION_OCCUPIED && Occupied!=null) {
                Func<int,float> value=i=>BitConverter.ToSingle(BitConverter.GetBytes((uint)Bits(a[i])),0);
                return (T)(object)Occupied(value(0),value(1),value(3));
            }
            if(h!=GTA.Native.Hash.SET_CONTROL_VALUE_NEXT_FRAME)return game.Call<T>(h,a);
            if(game.Current!=100 || game.Entities[100].Driver!=2 || ThrottleClamp!=game.Now)
                throw new Exception("Unexpected brake target or unclamped throttle");
            if(a.Length!=3 || Bits(a[0])!=0 || Bits(a[1])!=76 || (uint)Bits(a[2])!=0x3f800000)
                throw new Exception("Expected next-frame full handbrake");
            LastBrake=game.Now;if(FirstBrake==0)FirstBrake=LastBrake;return (T)(object)true;
        }
    }
    sealed class Fixture {
        internal readonly SetupGame11 Game=new SetupGame11();internal readonly Journal Log=new Journal();
        internal readonly IdleNativeApi Api;internal readonly AutomaticRun Run;internal CaptureLease Capture;int token=10;
        internal bool FailLookup;internal readonly RiderInput Input;
        internal Action BeforeTick;internal CaptureLease WireCapture;
        internal Fixture(){current=this;fixtures.Add(this);Log.Clock=()=>Game.Now;Input=new RiderInput(Game);Api=new IdleNativeApi(null,s=>Log.Write(s),Input,()=>Game.Now,1000,handle=>{
                if(FailLookup) throw new InvalidOperationException("authored failed vehicle lookup");
                return name=>Game.Call(GTA.Native.Hash.FORCE_USE_AUDIO_GAME_OBJECT,handle,name);
            });Run=new AutomaticRun(Api,Log,()=>Game.Now,1000,()=>++token,"authored11");Step();Step();}
        internal void Step(double seconds=.05){Game.Advance(seconds);if(BeforeTick!=null)BeforeTick();Capture=WireCapture??new CaptureLease{Session="authored11",Recording="authored-media",RecordingActive=true,Foreground=true,TimelineReady=true,StartupAdmitted=true,ObservedTicks=Game.Now};Run.Tick(Capture);}
        internal RunCommand Command(string op="Review",string decision=null){var s=Run.State;return new RunCommand{Session=s.Session,Id=Guid.NewGuid().ToString("N"),Phase=s.Phase,Generation=s.Generation,Observation=s.Observation,Profile=s.Profile,Operation=op,Decision=decision??(s.Phase.StartsWith("B-")?"ControlNormal":s.Phase=="1"?"Observed":"Normal"),Text="AUTHORED offline response; not human perception or approval",ExpiresTicks=Game.Now+5000,CaptureReviewed=true,ContextReviewed=true,EvidenceSha256=new string('a',64)};}
        internal void Begin(){Check(Run.Command(Command("Begin"),Capture)=="accepted start","begin actual runner");}
        internal void Review(string decision=null){Check(Run.Command(Command("Review",decision),Capture).StartsWith("accepted"),"review actual binding");}
        internal void Until(Func<bool> condition,double limit=620){long end=Game.Now+(long)(limit*1000);while(!condition()&&!Run.State.Finished&&Game.Now<end)Step();Check(condition(),"expected state; actual="+Run.State.Stage+" "+Run.State.Status+"\n"+string.Join("\n",Log.Lines.Skip(Math.Max(0,Log.Lines.Count-5))));}
        internal void Stage(string s){Until(()=>Run.State.Stage==s);}
        internal void At(string phase){Until(()=>Run.State.AwaitingReview&&Run.State.Phase==phase);}
        internal void Finish(bool review=false){long end=Game.Now+620000;while(!Run.State.Finished&&Game.Now<end){if(review&&Run.State.AwaitingReview)Review();Step();}Check(Run.State.Finished,"bounded termination");}
        internal void Stop(){Run.Stop("AUTHORED stop",Capture);Finish();}
        internal bool Has(string text){return Log.Lines.Any(s=>s.Contains(text));}
        internal void SafeRetired(){Check(Run.State.Retired&&Game.N("delete-100")==1&&Game.N("delete-101")==1,"both exact owned identities disappeared after one delete each");Check(Game.Entities.Values.All(e=>!e.Exists),"native return alone not accepted as deletion");}
    }
    static void Test(string name,Action action){int first=fixtures.Count;action();cases++;for(int i=first;i<fixtures.Count;i++)System.IO.File.WriteAllLines(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(TestUnknownName).Assembly.Location),"case-"+cases.ToString("D2")+"-fixture-"+i.ToString("D3")+".log"),fixtures[i].Log.Lines);Console.WriteLine("PASS "+name);}
    static void ExitReplay(bool previous) {
        var f=new Fixture();f.Input.ReplayExit=true;
        var start=new GTA.Math.Vector3(1737.014f,3293.598f,40.50861f);
        var foot=new GTA.Math.Vector3(1737.733f,3293.922f,41.16322f);
        f.Game.Current=1282;f.Game.Player=start;
        f.Game.Entities.Add(1282,new SetupGame11.Entity{Handle=1282,Driver=2,Position=start});
        f.Input.Occupied=(x,y,r)=>r==.60f && Math.Abs(x-foot.X)<.01 && Math.Abs(y-foot.Y)<.01;
        f.Begin();f.Until(()=>f.Game.N("exit")==1);
        f.Game.Advance(f.Game.ExitDelay+.01);f.Game.Player=foot;f.Game.PlayerSpeed=.120991267f;
        f.Step(); // Recorded operands end at the occupied on-foot query.
        f.Game.PlayerSpeed=0;f.Game.UnpavedSamples=1; // All subsequent responses are authored.
        f.Until(()=>f.Run.State.Finished || f.Run.State.AwaitingReview);
        if(previous)Check(f.Run.State.Finished && f.Has("saved-return-space-occupied") && f.Game.Created==0,"previous terminal site rejection");
        else {
            Check(f.Run.State.AwaitingReview && f.Run.State.Phase=="B-pre" && f.Game.Created==2,"compiled runner admitted first B listening window");
            f.Review();f.At("baseline");
            var commands=f.Log.Lines.Where(l=>l.StartsWith("setup-command-reserved step=")).Select(l=>l.Split(' ')[1]).ToArray();
            Check(commands.Length==commands.Distinct().Count() && f.Game.N("model")==1 && f.Game.N("register")==1,"no duplicate setup commands");
            Check(f.Has("paved-pair-selected layout=2") && f.Game.Entities[1282].Exists && !f.Game.Entities[1282].Owned,"third layout and untouched starting vehicle");
        }
        Check(f.Game.Profiles.Count==0,"zero assignments before baseline review");
        if(!previous){f.Stop();Check(f.Has("return-position-readback") && (f.Game.Player-foot).Length()>1,"actual fallback readback");}
    }
    public static int Main(string[] args){try{
        if(args.Length>0 && args[0]=="wire")return WireFixture();
        bool previous=args.Length>0 && args[0]=="True";
        Test("recorded occupied exit; subsequent callbacks authored",()=>ExitReplay(previous));
        if(previous)return 0;

        Test("recorded speed invalidates partial acquisition; authored clean callbacks reach review",()=>{
            var f=new Fixture();f.Begin();f.Stage("Stability");for(int i=0;i<25;i++)f.Step();
            f.Game.Entities[100].Speed=.217606142f;f.Game.PlayerSpeed=.217606142f;f.Step(.06);
            Check(f.Run.State.Stage=="Stability","recorded A speed must return to acquisition");
            f.Game.Entities[100].Speed=0;f.Game.PlayerSpeed=0;f.Step();
            var counts=new Dictionary<string,int>(f.Game.Counts);
            for(int i=0;i<199;i++)f.Step();
            Check(f.Run.State.Stage=="Stability" && counts.All(k=>f.Game.N(k.Key)==k.Value)&&counts.Count==f.Game.Counts.Count&&f.Game.Profiles.Count==0,"9.95 clean seconds; no repeated setup or assignments");
            f.Step();Check(f.Run.State.Stage=="LeaveBPre","ten uninterrupted seconds");f.At("B-pre");
        });
        Test("authored continuous and intermittent motion expire at original bound",()=>{
            foreach(bool continuous in new[]{true,false}){
                var f=new Fixture();f.Begin();f.Stage("Stability");long start=f.Game.Now;
                for(int i=0;i<600&&f.Run.State.Stage=="Stability";i++){
                    f.Game.Entities[101].Speed=continuous||i%100==0?.218f:0;f.Step();
                }
                Check(f.Has("stationary acquisition timed out")&&f.Game.Now-start==30000&&f.Game.Profiles.Count==0,"fixed 30 second timeout");
            }
        });
        Test("authored conflicting B occupant stops on the first moving callback",()=>{
            var f=new Fixture();f.Begin();f.Stage("Stability");f.Game.Entities[100].Speed=.217606142f;
            f.Game.Entities[101].Driver=99;f.Step();Check(f.Has("B.conflicting-occupant")&&f.Run.State.Stage!="Stability"&&f.Game.Profiles.Count==0,"priority of safety");
        });
        Test("authored movement after window selection or at dispatch remains terminal",()=>{
            foreach(string stage in new[]{"BWindow","DispatchReady"}){
                var f=new Fixture();f.Begin();
                if(stage=="DispatchReady"){f.At("B-pre");f.Review();f.At("baseline");f.Review();}
                f.Stage(stage);f.Game.Entities[100].Speed=.217606142f;f.Step();
                Check(f.Has("automatic-stop")&&f.Game.Profiles.Count==0,"no reselection or assignment in "+stage);
            }
        });
        Test("authored unsafe speed, invalid readback and identity loss stop immediately",()=>{
            foreach(string condition in new[]{"unsafe speed","invalid speed","changed token"}){
                var f=new Fixture();f.Begin();f.Stage("Stability");f.Game.Entities[100].Speed=.217606142f;
                var b=f.Game.Entities[101];
                if(condition=="unsafe speed")b.Speed=2;
                if(condition=="invalid speed")b.Speed=float.NaN;
                if(condition=="changed token")b.Token++;
                f.Step();Check(f.Run.State.Stage!="Stability"&&f.Game.Profiles.Count==0,condition+" never enters waiting");
            }
        });
        Test("recorded settle-run speeds still stop a braked A",()=>{
            var f=new Fixture();f.Begin();f.Stage("Stability");long start=f.Game.Now;
            Check(f.Input.FirstBrake>0 && f.Input.FirstBrake<start,"brake requested before recorded disturbance");
            for(int i=0;i<25;i++)f.Step();
            f.Game.Entities[100].Speed=.217305109f;f.Step(.053);
            Check(f.Run.State.Stage=="Stability" && f.Input.LastBrake==f.Game.Now,"recorded first sample restarts clock while braked");
            f.Game.Entities[100].Speed=.3516701f;f.Step(.016);
            Check(f.Has("unsafe-motion") && f.Game.Profiles.Count==0,"recorded second sample still stops progression");
            long last=f.Input.LastBrake;f.Game.Entities[100].Speed=0;f.Finish();
            Check(last==f.Input.LastBrake && last<f.Game.Now,"no brake renewals during early retirement");f.SafeRetired();
        });
        Test("authored stationary response maintains brake across four seated listening phases",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");Check(f.Input.LastBrake<f.Game.Now,"brake expired off bike");f.Review();
            foreach(string phase in new[]{"baseline","0","1","2"}){
                f.At(phase);Check(f.Input.LastBrake==f.Game.Now,"brake through idle and horn "+phase);f.Review();
            }
            f.At("B-post");long last=f.Input.LastBrake;f.Review();f.Finish();
            Check(f.Input.LastBrake==last && last<f.Game.Now,"no brake during control comparison or retirement");f.SafeRetired();
        });
        Test("selected return obstructed during model loading resumes search",()=>{
            var f=new Fixture();f.Input.Occupied=(x,y,r)=>r==.60f && f.Game.N("model")==1 && Math.Abs(x)<.01 && Math.Abs(y)<.01;
            f.Begin();f.At("B-pre");
            Check(f.Has("survey-rejected layout=0 check=return-point") && f.Game.Created==2 && f.Game.N("model")==1,"final recheck searches without duplicate model or pair");
            f.Stop();
        });
        Test("occupied return at actual restoration never teleports player",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");f.Input.Occupied=(x,y,r)=>r==.60f;
            int moves=f.Game.N("move");f.Stop();
            Check(f.Game.N("move")==moves && f.Has("selected-return-blocked") && f.Has("return-position-readback actual="),"blocked final return leaves player in place");
        });
        Test("both car footprints and listener rejection advance on later callbacks",()=>{
            var f=new Fixture();var times=new List<long>();int calls=0;
            f.Input.Occupied=(x,y,r)=>{
                if(r!=4)return false;
                calls++;
                if(calls!=1 && calls!=3 && calls!=6)return false;
                times.Add(f.Game.Now);return true;
            };
            f.Begin();f.At("B-pre");
            Check(f.Has("layout=0 check=A footprint") && f.Has("layout=1 check=B footprint") && f.Has("layout=2 check=B listener"),"each obstruction indexed");
            Check(times.Distinct().Count()==3 && f.Game.Created==2,"each rejection on a distinct callback");
            f.Stop();
        });
        Test("clear first site preserves the preferred return",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");
            Check(f.Has("paved-pair-selected layout=0") && !f.Has("survey-rejected") && f.Game.Created==2,"clear preferred layout accepted");
            f.Stop();f.SafeRetired();
        });
        Test("exit admission changing to occupied on foot does not send an exit",()=>{
            var f=new Fixture();f.Game.Current=1282;
            f.Game.Entities.Add(1282,new SetupGame11.Entity{Handle=1282,Driver=2});
            bool changed=false;
            f.Log.OnWrite=line=>{
                if(!changed && line.StartsWith("setup-decision") && line.Contains("initial-exit-pending")){
                    changed=true;f.Game.Current=0;f.Game.Entities[1282].Driver=0;
                }
            };
            f.Input.Occupied=(x,y,r)=>r==.60f && Math.Abs(x)<.01 && Math.Abs(y)<.01;
            f.Begin();f.Until(()=>f.Game.Created==2);
            Check(changed && f.Has("survey-rejected layout=0") && f.Game.N("exit")==0,"no fatal stale exit request");
            f.Stop();
        });
        Test("session loss during survey is terminal",()=>{
            var f=new Fixture();f.Game.UnpavedSamples=100;f.Begin();f.Until(()=>f.Has("survey-rejected layout=0"));
            f.Game.PausedValue=true;f.Step();
            Check(f.Run.State.Stage!="PrepareSite" && f.Game.Created==0 && f.Game.Profiles.Count==0,"no survey or setup after session loss");
        });
        Test("B obstructed after creating A retires A without spawning another pair",()=>{
            var f=new Fixture();f.Input.Occupied=(x,y,r)=>r==4 && f.Game.Created==1;
            f.Begin();f.Finish();
            Check(f.Game.Created==1 && f.Game.N("delete-100")==1 && !f.Game.Entities[100].Exists && f.Game.Profiles.Count==0,"only the committed A was retired");
        });
        Test("slow survey keeps the original site deadline",()=>{
            var f=new Fixture();f.Game.UnpavedSamples=1000;f.Begin();f.Stage("PrepareSite");
            long start=f.Game.Now;while(f.Run.State.Stage=="PrepareSite")f.Step(.5);
            Check(f.Has("TIMED_OUT Site") && f.Game.Now-start==12000 && f.Game.Created==0,"12 second deadline never renewed");
            f.Finish();
        });
        Test("authored pavement survey skips rock and keeps both cars clear of return",()=>{
            var f=new Fixture();f.Game.UnpavedSamples=1;f.Begin();f.At("B-pre");
            var a=f.Game.Entities[100];var b=f.Game.Entities[101];
            Check(f.Has("paved-pair-selected layout=1"),"rock layout rejected");
            Check((a.Position-b.Position).Length()>13.9f && a.Position.Length()>8 && b.Position.Length()>8,"car and return clearance");
            f.Stop();f.SafeRetired();
        });
        Test("authored all-rock site ends before creating cars or assigning audio",()=>{
            var f=new Fixture();f.Game.UnpavedSamples=1000;f.Begin();f.Finish();
            Check(f.Game.Created==0 && f.Game.Profiles.Count==0 && f.Log.Lines.Count(l=>l.StartsWith("survey-rejected layout="))==80 && f.Has("exhausted 80"),"each refused candidate recorded; zero creations or writes");
        });
        Test("only the self assignment, unknown name and same-A release dispatch",()=>{
            var f=new Fixture();f.Begin();f.Finish(true);
            Check(f.Game.Profiles.SequenceEqual(new[]{"ADDER","ra_quiet_orchard","ADDER"}),"three A-only dispatches in order");
            f.SafeRetired();
        });
        Test("setup failure before any audio write retires without release",()=>{
            var f=new Fixture();f.Game.BNeverStarts=true;f.Begin();f.Finish();
            Check(f.Game.Profiles.Count==0,"zero assignments including cleanup");f.SafeRetired();
        });
        Test("uncertain unknown-name observation releases only once",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();
            f.At("0");f.Review();f.At("1");f.Review("Ambiguous");f.Finish(true);
            Check(f.Game.Profiles.SequenceEqual(new[]{"ADDER","ra_quiet_orchard","ADDER"}),"one terminal release");f.SafeRetired();
        });
        Test("first setter lookup fails before admission and cleanup writes no profile",()=>{
            var f=new Fixture();f.FailLookup=true;f.Begin();f.Finish(true);
            Check(f.Game.Profiles.Count==0&&!f.Has("restore-intent"),"no release for an untouched bike");f.SafeRetired();
        });
        Test("lost A after unknown name cannot receive a release",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");f.Review();
            f.At("0");f.Review();f.At("1");f.Game.Entities[100].Token=999;f.Step();f.Finish(true);
            Check(f.Game.Profiles.SequenceEqual(new[]{"ADDER","ra_quiet_orchard"})&&!f.Run.State.Retired,"no writes to replaced A");
        });
        Test("missing horn readback on unknown name still records the physical observation",()=>{
            var f=new Fixture();
            f.Log.OnWrite=line=>{
                if(line.StartsWith("horn-native-returned") && f.Game.Profiles.LastOrDefault()=="ra_quiet_orchard")
                    f.Game.HornUntil=0;
            };
            f.Begin();f.Finish(true);
            Check(f.Has("native-vehicle-horn-active=False") && f.Has("evidence=UnknownNameReviewed"),"retain absent horn readback with listening");
            f.SafeRetired();
        });
        Test("adapter refuses B and a revoked final admission",()=>{
            var f=new Fixture();f.Begin();f.At("B-pre");f.Review();f.At("baseline");
            foreach(int handle in new[]{101,100}){
                var item=new Lifetime{Handle=handle,Token=f.Game.Entities[handle].Token,Role=handle==100?"A":"B"};
                bool refused=false;
                try{f.Api.Assign(item,"ra_quiet_orchard",()=>handle!=100);}
                catch(InvalidOperationException){refused=true;}
                Check(refused && f.Game.Profiles.Count==0,"no setter for control or revoked admission");
            }
            f.Stop();f.SafeRetired();
        });
        Console.WriteLine("PASS cases="+cases+" assertions="+assertions+"; AUTHORED delayed responses through actual runner, native adapter and SDK InputArgument; zero GTA launches, no live sound proof");return 0;
    }catch(Exception e){if(current!=null){System.IO.File.WriteAllLines(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(TestUnknownName).Assembly.Location),"failure-journal.txt"),current.Log.Lines);Console.Error.WriteLine("Actual stage="+current.Run.State.Stage+" profiles="+string.Join(",",current.Game.Profiles));}Console.Error.WriteLine(e);return 1;}}
}
