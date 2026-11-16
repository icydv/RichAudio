using System;
using System.Globalization;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using GTA;
using GTA.Math;
using GTA.Native;

namespace RichAudio.NativeSuppression01
{
    // Native plumbing retained from the isolated profile probe. It only owns newly
    // created disposable Batis. No existing vehicle can be adopted by this API.
    internal sealed partial class IdleNativeApi : IAutomaticIdleApi
    {
        const uint Bati = 0xF9300CC5;
        const string Decorator = "RA_NS01_8b7e24c1";
        readonly int thread = Thread.CurrentThread.ManagedThreadId;
        readonly IIdleDecoratorLock decoratorLock;
        readonly Action<string> log;
        readonly IIdleNativeCalls native;readonly Func<long> clock;readonly long frequency;
        readonly Dictionary<SetupStep,string> issued=new Dictionary<SetupStep,string>();
        readonly Dictionary<string,long> evidenceAt=new Dictionary<string,long>();
        bool creationUnknown;public bool CreationUnknown{get{return creationUnknown;}}
        internal IdleNativeApi(IIdleDecoratorLock decoratorLock = null, Action<string> log = null,IIdleNativeCalls calls=null,Func<long> clock=null,long frequency=0)
        { this.decoratorLock=decoratorLock;this.log=log??delegate(string line){};native=calls??new IdleNativeCalls();this.clock=clock??Stopwatch.GetTimestamp;this.frequency=frequency>0?frequency:Stopwatch.Frequency; }
        Vector3 a, b;
        float heading;
        int savedPed, savedModel, oldPedView, oldVehicleView, startsA, stopsA, seatsA, leavesA, horns;
        float oldHeading, oldPitch, originalHeading;
        Vector3 originalPosition;
        bool viewSaved,pedLost,sitePlaced,initialExitRequested,siteSelected,viewRestoreIssued,viewRestoreUnknown,positionReturnRequested;
        int initialVehicle,layout;
        Vector3 siteAnchor;
        void Context() { if (Thread.CurrentThread.ManagedThreadId != thread) throw new InvalidOperationException("probe native outside script callback"); }
        public bool StoryReady
        {
            get
            {
                Context();
                int player = native.Call<int>(Hash.PLAYER_ID), ped = native.Call<int>(Hash.PLAYER_PED_ID);
                return !native.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE) && !native.Paused && !native.Call<bool>(Hash.NETWORK_IS_SESSION_ACTIVE) &&
                    !native.Call<bool>(Hash.NETWORK_IS_GAME_IN_PROGRESS) && !native.Call<bool>(Hash.IS_PLAYER_SWITCH_IN_PROGRESS) &&
                    ped != 0 && native.Call<bool>(Hash.DOES_ENTITY_EXIST, ped) && native.Call<bool>(Hash.IS_PLAYER_PLAYING, player);
            }
        }
        public RuntimeProgress ReadProgress() {
            Context();return new RuntimeProgress {GameMilliseconds=native.GameTime,SimulationFrames=native.FrameCount,StoryReady=StoryReady,PauseMenu=native.Paused};
        }
        void Space(Vector3 p)
        {
            if(Single.IsNaN(p.X)||Single.IsNaN(p.Y)||Single.IsNaN(p.Z)||Math.Abs(p.X)>10000||Math.Abs(p.Y)>10000||Math.Abs(p.Z)>3000)throw new InvalidOperationException("spawn-coordinate-invalid position="+p);
            if(native.Call<bool>(Hash.IS_POSITION_OCCUPIED,p.X,p.Y,p.Z,3f,false,true,true,false,false,0,false))throw new InvalidOperationException("spawn-space-occupied position="+p+" radius=3");
        }
        public void Prepare()
        {
            Context();
            SetupResult state=ObserveSetup(SetupStep.Site,null,null);
            if(state.Outcome!=TransitionOutcome.READY||!siteSelected)throw new InvalidOperationException("site admission changed: "+state.Reason+" "+state.Evidence);
            Space(a); Space(b);
            sitePlaced=true;
            native.RegisterDecorator(Decorator, decoratorLock, log);
            native.Call(Hash.REQUEST_MODEL, Bati); // Nonblocking. Readiness polled by later ticks.
        }
        public bool ModelReady { get { Context(); return native.Call<bool>(Hash.HAS_MODEL_LOADED, Bati); } }
        public Lifetime Spawn(string role, int token)
        {
            Context(); if (!StoryReady || !ModelReady) throw new InvalidOperationException("spawn prerequisites changed");
            var p = role == "A" ? a : b; Space(p);
            int handle;
            try{handle=native.Call<int>(Hash.CREATE_VEHICLE,Bati,p.X,p.Y,p.Z,heading,false,false,false);}
            catch(Exception e){creationUnknown=true;log("create-outcome-unknown role="+role+" requestedPosition="+p+" reason="+e.GetType().Name+":"+e.Message+"; no handle to reacquire, never respawn");throw;}
            var item = new Lifetime { Handle = handle, Role = role, Token = token };
            if(handle==0||!Exists(item)){creationUnknown=true;throw new InvalidOperationException("creation-return-not-verifiable role="+role+" handle="+handle+" requestedPosition="+p);}
            try
            {
                native.Call(Hash.SET_ENTITY_AS_MISSION_ENTITY, handle, true, false);
                if (!native.Call<bool>(Hash.DECOR_SET_INT, handle, Decorator, token) || !Matches(item))
                    throw new InvalidOperationException("test lifetime ownership token not established");
                try {bool placed=native.Call<bool>(Hash.SET_VEHICLE_ON_GROUND_PROPERLY,handle,5f);log("ground-placement-return role="+role+" handle="+handle+" returned="+placed+"; physical completion observed on later callbacks");}
                catch(Exception e){item.SetupUnknown=true;log("ground-placement-outcome-unknown role="+role+" handle="+handle+" "+e.GetType().Name+":"+e.Message+"; never resend");}
                return item;
            }
            catch (ThreadAbortException) { throw; }
            catch(Exception e)
            {
                // Same uninterrupted spawn callback only. Never reacquire a failed token on a later tick.
                item.Lost=true;item.SetupUnknown=true;
                log("spawn-ownership-unresolved role="+role+" handle="+handle+" token="+token+" reason="+e.GetType().Name+":"+e.Message+"; no deletion without established exact token");
                return item;
            }
        }
        public bool Exists(Lifetime item) { Context(); return item != null && item.Handle != 0 && native.Call<bool>(Hash.DOES_ENTITY_EXIST, item.Handle); }
        public bool Matches(Lifetime item)
        {
            Context(); if(item==null||item.Lost||item.Deleted)return false;
            bool match=Exists(item) && native.Call<uint>(Hash.GET_ENTITY_MODEL, item.Handle) == Bati &&
                native.Call<bool>(Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT, item.Handle, true) &&
                native.Call<bool>(Hash.DECOR_EXIST_ON, item.Handle, Decorator) && native.Call<int>(Hash.DECOR_GET_INT, item.Handle, Decorator) == item.Token;
            if(!match&&!item.DeleteIssued)item.Lost=true;
            return match;
        }
        bool EmptyStopped(Lifetime item)
        {
            if (!Matches(item)) return false;
            float speed = native.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return speed >= 0 && speed < .15f && native.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, -1, false) == 0 &&
                native.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, 0, false) == 0;
        }
        public bool EmptyStoppedAndDriveable(Lifetime item)
        {
            Context(); return EmptyStopped(item) && !native.Call<bool>(Hash.IS_ENTITY_DEAD, item.Handle) &&
                native.Call<bool>(Hash.IS_VEHICLE_DRIVEABLE, item.Handle, false);
        }
        public string Snapshot(Lifetime item)
        {
            Context(); if (!Matches(item)) throw new InvalidOperationException("snapshot stale identity");
            uint horn = native.Call<uint>(Hash.GET_VEHICLE_DEFAULT_HORN, item.Handle);
            float speed = native.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return "handle=" + item.Handle + " token=" + item.Token + " horn=" + horn.ToString("X8") +
                " speedMps=" + speed.ToString("R", CultureInfo.InvariantCulture) +
                " engineOn=" + native.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, item.Handle) +
                " effective-profile=UNKNOWN";
        }
        public bool CanSwitch(Lifetime target, Lifetime control)
        {
            return PairState(target,control,true,true);
        }
        public bool CanStartControl(Lifetime target, Lifetime control)
        {
            SetupResult r=ObserveSetup(SetupStep.BInitial,target,control);return r.Outcome==TransitionOutcome.PENDING&&r.CanIssue;
        }
        public void StartControl(Lifetime target, Lifetime control, Func<bool> stillAdmitted)
        {
            Context();
            if(stillAdmitted==null)throw new InvalidOperationException("B-start-admission-callback-missing");
            if (!stillAdmitted()) throw new InvalidOperationException("control start admission expired or revoked");
            RequestSetup(SetupStep.BInitial,target,control,stillAdmitted);
        }
        public bool CanRestore(Lifetime item)
        {
            SetupObservation s=Observe(item,null);string why=item==null||item.Role!="A"?"exact-A-required":VehicleProblem(s.A,false,true);
            if(!s.PlayerValid||!s.Story||!s.Coherent||why!=null){Evidence("release-or-assignment",s,why??"player-story-or-coherence");return false;}return true;
        }
        public void Assign(Lifetime item, string profile, Func<bool> stillAdmitted)
        {
            Context();
            if (stillAdmitted == null || Array.IndexOf(IdleExperiment.Profiles, profile) < 0 || !CanRestore(item))
                throw new InvalidOperationException("fixed profile, exact owned A and safe Story context required");
            // Last operation before the setter: native context queries above can
            // cross a deadline. A release has its own narrowly scoped guard.
            log("native-dispatch-intent role=A handle=" + item.Handle + " token=" + item.Token + " native=4F0C413926060B38 requested=" + profile + "; final admission pending; effective object UNKNOWN");
            if (!stillAdmitted()) throw new InvalidOperationException("assignment admission expired or revoked");
            native.Call((Hash)0x4F0C413926060B38UL, item.Handle, profile);
            log("native-dispatch-returned role=A handle=" + item.Handle + " token=" + item.Token + " requested=" + profile + "; audible outcome unmeasured");
        }
        public bool Delete(Lifetime item,Func<bool> stillAdmitted)
        {
            Context();if(item==null||item.Deleted)return true;
            if(item.Lost){log("retirement-refused lost identity role="+item.Role+" handle="+item.Handle);return false;}
            if(item.DeleteIssued&&!Exists(item)){log("retirement-disappearance-verified role="+item.Role+" handle="+item.Handle);return true;}
            SetupObservation observed=Observe(item.Role=="A"?item:null,item.Role=="B"?item:null);
            VehicleObservation v=item.Role=="A"?observed.A:observed.B;
            string reason=VehicleProblem(v,true,false);
            if(!observed.PlayerValid||!observed.Story||observed.InVehicle||!observed.Coherent||reason!=null){Evidence("delete",observed,reason??"player/context not ready");return false;}
            if(item.DeleteIssued)return false;
            if(stillAdmitted==null||!stillAdmitted()){Evidence("delete",observed,"final-delete-admission-expired-no-dispatch");return false;}
            item.DeleteIssued=true;log("delete-dispatch-intent "+observed+"; one caller-owned SDK pointer");
            try{DeleteHandle(item.Handle);}
            catch(Exception e){item.DeleteUnknown=true;log("delete-outcome-unknown role="+item.Role+" "+e.GetType().Name+":"+e.Message+"; observe disappearance, never resend");}
            return false; // Always verify on a later callback, never from return alone.
        }
        unsafe void DeleteHandle(int handle)
        {
            native.Call(Hash.DELETE_ENTITY, CreateDeleteArgument(&handle));
        }
        // Match the SDK's Entity.Delete: point to this call's integer handle.
        // The synchronous native call finishes before that stack slot expires.
        internal static unsafe InputArgument CreateDeleteArgument(int* handle) { return handle; }
        public void ReleaseModel() { Context(); native.Call(Hash.SET_MODEL_AS_NO_LONGER_NEEDED, Bati); }

        sealed class GroundPendingException:InvalidOperationException {internal GroundPendingException(string s):base(s){}}
        sealed class SlopeException:InvalidOperationException {internal SlopeException(string s):base(s){}}
        unsafe float Ground(Vector3 p) {
            float z=0;
            if(!native.Call<bool>(Hash.GET_GROUND_Z_FOR_3D_COORD,p.X,p.Y,p.Z+3f,CreateGroundArgument(&z),false,false))throw new GroundPendingException("ground-data-pending position="+p);
            if(Single.IsNaN(z)||Single.IsInfinity(z)||Math.Abs(z-p.Z)>3f)throw new SlopeException("local-ground-height-invalid position="+p+" observedZ="+z);
            return z;
        }
        Vector3 FlatGround(Vector3 p) {
            float z=Ground(p);
            foreach(var d in new[]{new Vector3(1,1,0),new Vector3(-1,1,0),new Vector3(1,-1,0),new Vector3(-1,-1,0)})
                if(Math.Abs(Ground(p+d)-z)>.20f)throw new SlopeException("local-slope-exceeds-0.20 position="+p+" centerZ="+z+" corner="+d);
            return new Vector3(p.X,p.Y,z+.5f);
        }
        void PlayerIdentity() {
            Context();int actual=native.Call<int>(Hash.PLAYER_PED_ID);
            bool valid=!pedLost&&savedPed!=0&&actual==savedPed&&native.Call<bool>(Hash.DOES_ENTITY_EXIST,savedPed)&&!native.Call<bool>(Hash.IS_ENTITY_DEAD,savedPed)&&native.Call<int>(Hash.GET_ENTITY_MODEL,savedPed)==savedModel;
            if(!valid){pedLost=true;throw new InvalidOperationException("player-identity-unsafe expected="+savedPed+" actual="+actual+" expectedModel="+savedModel+"; no player operation");}
        }
        public void SaveView() {
            Context();if(viewSaved||!StoryReady)throw new InvalidOperationException("save original view once");
            savedPed=native.Call<int>(Hash.PLAYER_PED_ID);savedModel=native.Call<int>(Hash.GET_ENTITY_MODEL,savedPed);
            originalPosition=native.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);originalHeading=native.Call<float>(Hash.GET_ENTITY_HEADING,savedPed);
            oldPedView=native.Call<int>(Hash.GET_FOLLOW_PED_CAM_VIEW_MODE);oldVehicleView=native.Call<int>(Hash.GET_FOLLOW_VEHICLE_CAM_VIEW_MODE);
            oldHeading=native.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_HEADING);oldPitch=native.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_PITCH);
            if(!native.Call<bool>(Hash.IS_GAMEPLAY_CAM_RENDERING))throw new InvalidOperationException("existing scripted camera refused");
            if(!native.Call<bool>(Hash.IS_ENTITY_FOCUS,savedPed))throw new InvalidOperationException("existing non-player streaming focus refused");
            viewSaved=true;log("view-saved ped="+savedPed+" modes="+oldPedView+","+oldVehicleView+" origin="+originalPosition);
        }
        public void RestoreView() {
            Context();if(!viewSaved||viewRestoreIssued)return;PlayerIdentity();viewRestoreIssued=true;
            try{
            native.Call(Hash.SET_FOLLOW_PED_CAM_VIEW_MODE,oldPedView);native.Call(Hash.SET_FOLLOW_VEHICLE_CAM_VIEW_MODE,oldVehicleView);
            native.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_HEADING,oldHeading);native.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_PITCH,oldPitch,1f);
            Vector3 current=native.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);
            if(PlayerOnFoot&&(current-originalPosition).Length()>.10f&&!native.Call<bool>(Hash.IS_POSITION_OCCUPIED,originalPosition.X,originalPosition.Y,originalPosition.Z,.45f,false,true,true,false,false,savedPed,false)) {
                positionReturnRequested=true;
                native.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET,savedPed,originalPosition.X,originalPosition.Y,originalPosition.Z,false,false,true);
                native.Call(Hash.SET_ENTITY_HEADING,savedPed,originalHeading);
                log("player-original-position-return-requested "+originalPosition+"; verify later callback");
            } else log((current-originalPosition).Length()<=.10f?"player-original-position-already-observed":"player-position-return-unresolved; no occupied-space teleport");
            log("view-restore-requests-returned; later callback must verify; per-frame input/camera clamps cease automatically");
            }catch(Exception e){viewRestoreUnknown=true;log("view-restore-outcome-unknown "+e.GetType().Name+":"+e.Message+"; never resend");throw;}
        }
        public bool PlayerOnFoot { get { Context();int p=native.Call<int>(Hash.PLAYER_PED_ID);return p!=0&&!native.Call<bool>(Hash.IS_PED_IN_ANY_VEHICLE,p,false); } }
        public void SetView(bool seated) {
            PlayerIdentity();native.Call(seated?Hash.SET_FOLLOW_VEHICLE_CAM_VIEW_MODE:Hash.SET_FOLLOW_PED_CAM_VIEW_MODE,1);
            native.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_HEADING,0f);native.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_PITCH,-8f,1f);
            log("normal-gameplay-follow-view-requested seated="+seated+" mode=1 heading=0 pitch=-8; no scripted-camera/listener override");
        }
        public void HoldInputs() {
            PlayerIdentity();
            foreach(int control in new[]{0,1,2,26,59,60,63,64,68,69,70,71,72,75,79,80,86})native.Call(Hash.DISABLE_CONTROL_ACTION,0,control,true);
            native.Call(Hash.SET_THIRD_PERSON_CAM_RELATIVE_HEADING_LIMITS_THIS_UPDATE,0f,0f);
            native.Call(Hash.SET_THIRD_PERSON_CAM_RELATIVE_PITCH_LIMITS_THIS_UPDATE,-8f,-8f);
        }
        public Pose ReadPose() {
            PlayerIdentity();Vector3 p=native.Call<Vector3>(Hash.GET_GAMEPLAY_CAM_COORD),r=native.Call<Vector3>(Hash.GET_GAMEPLAY_CAM_ROT,2),
                f=native.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_COORD),fr=native.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_ROT,2),ped=native.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);
            return new Pose {X=p.X,Y=p.Y,Z=p.Z,RX=r.X,RY=r.Y,RZ=r.Z,PlayerX=ped.X,PlayerY=ped.Y,PlayerZ=ped.Z,
                Gameplay=native.Call<bool>(Hash.IS_GAMEPLAY_CAM_RENDERING)&&(p-f).Length()<.03f&&(r-fr).Length()<.1f};
        }
        public bool PairState(Lifetime target,Lifetime control,bool seated,bool aEngine) {
            SetupObservation s=Observe(target,control);string why=null;
            if(target==null||control==null||target.Role!="A"||control.Role!="B"||target.Handle==control.Handle||target.Token==control.Token)why="distinct-A-B-generation-required";
            else why=VehicleProblem(s.A,!seated,true)??VehicleProblem(s.B,true,true);
            if(why==null&&(!s.PlayerValid||!s.Story||!s.Coherent))why="player-Story-or-coherence";
            if(why==null&&(seated?(!s.InVehicle||s.CurrentVehicle!=target.Handle||s.A.Driver!=savedPed):(s.InVehicle||s.Entering)))why="current-player-occupancy-contradiction";
            if(why==null&&(s.A.Engine!=aEngine||!s.B.Engine))why="required-engine-state-contradiction";
            if(why!=null){Evidence("strict-comparison",s,why);return false;}return true;
        }
        static uint Jenk(string text) {uint h=0;foreach(char c in text.ToLowerInvariant()){h+=(byte)c;h+=h<<10;h^=h>>6;}h+=h<<3;h^=h>>11;h+=h<<15;return h;}
        public void HornA(Lifetime target) {
            SetupObservation s=Observe(target,null);string why=VehicleProblem(s.A,false,true);
            if(++horns>7||!s.PlayerValid||!s.Story||!s.Coherent||why!=null||!s.InVehicle||s.CurrentVehicle!=target.Handle||s.A.Driver!=savedPed||!s.A.Engine)throw new InvalidOperationException("physical-horn-refused count="+horns+" reason="+(why??"player/engine/context")+" "+s);
            log("vehicle-horn-dispatch-intent role=A handle="+target.Handle+" token="+target.Token+" durationMs=600 mode=HELDDOWN forever=false");
            // Same vehicle-bound native and arguments as retained SDK Vehicle.SoundHorn.
            native.Call(Hash.START_VEHICLE_HORN,CreateHornArguments(target.Handle));
        }
        internal static InputArgument[] CreateHornArguments(int handle) {return new InputArgument[]{handle,600,Jenk("HELDDOWN"),false};}
        internal static unsafe InputArgument CreateGroundArgument(float* z) {return z;}
        public bool HornActive(Lifetime target) {Context();return Matches(target)&&!target.Lost&&!target.Deleted&&native.Call<bool>(Hash.IS_HORN_ACTIVE,target.Handle);}
    }
}
