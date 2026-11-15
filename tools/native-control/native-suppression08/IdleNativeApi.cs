using System;
using System.Globalization;
using System.Threading;
using GTA;
using GTA.Math;
using GTA.Native;

namespace RichAudio.NativeSuppression01
{
    // Native plumbing retained from the isolated profile probe. It only owns newly
    // created disposable Batis. No existing vehicle can be adopted by this API.
    internal sealed class IdleNativeApi : IAutomaticIdleApi
    {
        const uint Bati = 0xF9300CC5;
        const string Decorator = "RA_NS01_8b7e24c1";
        readonly int thread = Thread.CurrentThread.ManagedThreadId;
        readonly IIdleDecoratorLock decoratorLock;
        readonly Action<string> log;
        internal IdleNativeApi(IIdleDecoratorLock decoratorLock = null, Action<string> log = null)
        { this.decoratorLock = decoratorLock; this.log = log ?? delegate(string line) { }; }
        Vector3 a, b;
        float heading;
        int savedPed, savedModel, oldPedView, oldVehicleView, startsA, stopsA, seatsA, leavesA, horns;
        float oldHeading, oldPitch, originalHeading;
        Vector3 originalPosition;
        bool viewSaved, pedLost, sitePlaced, initialExitRequested, focusOwned;
        int collisionRequests;
        long collisionAt;
        void Context() { if (Thread.CurrentThread.ManagedThreadId != thread) throw new InvalidOperationException("probe native outside script callback"); }
        public bool StoryReady
        {
            get
            {
                Context();
                int player = Function.Call<int>(Hash.PLAYER_ID), ped = Function.Call<int>(Hash.PLAYER_PED_ID);
                return !Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE) && !Game.IsPaused && !Function.Call<bool>(Hash.NETWORK_IS_SESSION_ACTIVE) &&
                    !Function.Call<bool>(Hash.NETWORK_IS_GAME_IN_PROGRESS) && !Function.Call<bool>(Hash.IS_PLAYER_SWITCH_IN_PROGRESS) &&
                    ped != 0 && Function.Call<bool>(Hash.DOES_ENTITY_EXIST, ped) && Function.Call<bool>(Hash.IS_PLAYER_PLAYING, player);
            }
        }
        public RuntimeProgress ReadProgress() {
            Context();return new RuntimeProgress {GameMilliseconds=Game.GameTime,SimulationFrames=Game.FrameCount,StoryReady=StoryReady,PauseMenu=Game.IsPaused};
        }
        static void Space(Vector3 p)
        {
            if (Single.IsNaN(p.X) || Single.IsNaN(p.Y) || Single.IsNaN(p.Z) || Math.Abs(p.X) > 10000 || Math.Abs(p.Y) > 10000 || Math.Abs(p.Z) > 3000 ||
                Function.Call<bool>(Hash.IS_POSITION_OCCUPIED, p.X, p.Y, p.Z, 3f, false, true, true, false, false, 0, false))
                throw new InvalidOperationException("spawn space invalid or occupied; clear flat exterior required");
        }
        public void Prepare()
        {
            Context();
            if (!StoryReady) throw new InvalidOperationException("Story scope unavailable");
            int ped = Function.Call<int>(Hash.PLAYER_PED_ID);
            if (Function.Call<bool>(Hash.IS_ENTITY_DEAD, ped))
                throw new InvalidOperationException("spawn refused: player dead=true");
            // GET_VEHICLE_PED_IS_IN can return the last vehicle after dismounting.
            // Ask whether the ped is currently in a vehicle instead.
            if (Function.Call<bool>(Hash.IS_PED_IN_ANY_VEHICLE, ped, false))
                throw new InvalidOperationException("spawn refused: player inVehicle=true; stand on foot");
            int interior = Function.Call<int>(Hash.GET_INTERIOR_FROM_ENTITY, ped);
            if (interior != 0)
                throw new InvalidOperationException("spawn refused: player interior=" + interior.ToString(CultureInfo.InvariantCulture) + "; clear flat exterior required");
            a = Function.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, ped, -5f, 8f, .5f);
            b = Function.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, ped, 5f, 8f, .5f);
            heading = Function.Call<float>(Hash.GET_ENTITY_HEADING, ped);
            a = FlatGround(a); b = FlatGround(b);
            Space(a); Space(b);
            IdleDecoratorRegistration.Ensure(Decorator, decoratorLock, log);
            Function.Call(Hash.REQUEST_MODEL, Bati); // Nonblocking. Readiness polled by later ticks.
        }
        public bool ModelReady { get { Context(); return Function.Call<bool>(Hash.HAS_MODEL_LOADED, Bati); } }
        public Lifetime Spawn(string role, int token)
        {
            Context(); if (!StoryReady || !ModelReady) throw new InvalidOperationException("spawn prerequisites changed");
            var p = role == "A" ? a : b; Space(p);
            int handle = Function.Call<int>(Hash.CREATE_VEHICLE, Bati, p.X, p.Y, p.Z, heading, false, false, false);
            var item = new Lifetime { Handle = handle, Role = role, Token = token };
            if (handle == 0 || !Exists(item)) throw new InvalidOperationException("vehicle creation failed");
            try
            {
                Function.Call(Hash.SET_ENTITY_AS_MISSION_ENTITY, handle, true, false);
                if (!Function.Call<bool>(Hash.DECOR_SET_INT, handle, Decorator, token) || !Matches(item))
                    throw new InvalidOperationException("test lifetime ownership token not established");
                if (!Function.Call<bool>(Hash.SET_VEHICLE_ON_GROUND_PROPERLY, handle, 5f))
                    throw new InvalidOperationException("disposable vehicle did not reach ground");
                return item;
            }
            catch (ThreadAbortException) { throw; }
            catch
            {
                // Same uninterrupted spawn callback only. Never reacquire a failed token on a later tick.
                if (Function.Call<bool>(Hash.DOES_ENTITY_EXIST, handle) && Function.Call<uint>(Hash.GET_ENTITY_MODEL, handle) == Bati &&
                    Function.Call<bool>(Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT, handle, true))
                    DeleteHandle(handle);
                throw;
            }
        }
        public bool Exists(Lifetime item) { Context(); return item != null && item.Handle != 0 && Function.Call<bool>(Hash.DOES_ENTITY_EXIST, item.Handle); }
        public bool Matches(Lifetime item)
        {
            Context(); return Exists(item) && Function.Call<uint>(Hash.GET_ENTITY_MODEL, item.Handle) == Bati &&
                Function.Call<bool>(Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT, item.Handle, true) &&
                Function.Call<bool>(Hash.DECOR_EXIST_ON, item.Handle, Decorator) && Function.Call<int>(Hash.DECOR_GET_INT, item.Handle, Decorator) == item.Token;
        }
        bool EmptyStopped(Lifetime item)
        {
            if (!Matches(item)) return false;
            float speed = Function.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return speed >= 0 && speed < .15f && Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, -1, false) == 0 &&
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, 0, false) == 0;
        }
        public bool EmptyStoppedAndDriveable(Lifetime item)
        {
            Context(); return EmptyStopped(item) && !Function.Call<bool>(Hash.IS_ENTITY_DEAD, item.Handle) &&
                Function.Call<bool>(Hash.IS_VEHICLE_DRIVEABLE, item.Handle, false);
        }
        public string Snapshot(Lifetime item)
        {
            Context(); if (!Matches(item)) throw new InvalidOperationException("snapshot stale identity");
            uint horn = Function.Call<uint>(Hash.GET_VEHICLE_DEFAULT_HORN, item.Handle);
            float speed = Function.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return "handle=" + item.Handle + " token=" + item.Token + " horn=" + horn.ToString("X8") +
                " speedMps=" + speed.ToString("R", CultureInfo.InvariantCulture) +
                " engineOn=" + Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, item.Handle) +
                " effective-profile=UNKNOWN";
        }
        public bool CanSwitch(Lifetime target, Lifetime control)
        {
            Context();
            return StoryReady && target.Role == "A" && control.Role == "B" && CanRestore(target) &&
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, target.Handle, -1, false) == Function.Call<int>(Hash.PLAYER_PED_ID) &&
                Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, target.Handle) && EmptyStoppedAndDriveable(control) &&
                Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, control.Handle);
        }
        public bool CanStartControl(Lifetime target, Lifetime control)
        {
            Context();
            return target != null && control != null && !target.Lost && !target.Deleted && !control.Lost && !control.Deleted &&
                target.Handle != control.Handle && target.Token != control.Token && target.Role == "A" && control.Role == "B" &&
                StoryReady && CanRestore(target) &&
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, target.Handle, -1, false) == Function.Call<int>(Hash.PLAYER_PED_ID) &&
                Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, target.Handle) && EmptyStoppedAndDriveable(control) &&
                !Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, control.Handle);
        }
        public void StartControl(Lifetime target, Lifetime control, Func<bool> stillAdmitted)
        {
            Context();
            if (stillAdmitted == null || !CanStartControl(target, control))
                throw new InvalidOperationException("control start requires the exact safe pair and B engine off");
            if (!stillAdmitted()) throw new InvalidOperationException("control start admission expired or revoked");
            // Manual setup only. Never used to suppress A or to maintain B automatically.
            Function.Call(Hash.SET_VEHICLE_ENGINE_ON, control.Handle, true, true, false);
        }
        public bool CanRestore(Lifetime item)
        {
            Context();
            if (!StoryReady || !Matches(item) || item.Role != "A") return false;
            float speed = Function.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            int driver = Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, -1, false);
            return speed >= 0 && speed < .15f && (driver == 0 || driver == Function.Call<int>(Hash.PLAYER_PED_ID)) &&
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, 0, false) == 0 &&
                !Function.Call<bool>(Hash.IS_ENTITY_DEAD, item.Handle) && Function.Call<bool>(Hash.IS_VEHICLE_DRIVEABLE, item.Handle, false);
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
            Function.Call((Hash)0x4F0C413926060B38UL, item.Handle, profile);
            log("native-dispatch-returned role=A handle=" + item.Handle + " token=" + item.Token + " requested=" + profile + "; audible outcome unmeasured");
        }
        public bool Delete(Lifetime item)
        {
            Context(); if (!StoryReady || !EmptyStopped(item)) return false;
            DeleteHandle(item.Handle);
            return !Exists(item);
        }
        static unsafe void DeleteHandle(int handle)
        {
            Function.Call(Hash.DELETE_ENTITY, CreateDeleteArgument(&handle));
        }
        // Match the SDK's Entity.Delete: point to this call's integer handle.
        // The synchronous native call finishes before that stack slot expires.
        internal static unsafe InputArgument CreateDeleteArgument(int* handle) { return handle; }
        public void ReleaseModel() { Context(); Function.Call(Hash.SET_MODEL_AS_NO_LONGER_NEEDED, Bati); }

        static unsafe float Ground(Vector3 p) {
            float z=0;
            if(!Function.Call<bool>(Hash.GET_GROUND_Z_FOR_3D_COORD,p.X,p.Y,p.Z+3f,CreateGroundArgument(&z),false,false)||
                Single.IsNaN(z)||Single.IsInfinity(z)||Math.Abs(z-p.Z)>3f)
                throw new InvalidOperationException("bounded dry ground query failed");
            return z;
        }
        static Vector3 FlatGround(Vector3 p) {
            float z=Ground(p);
            foreach(var d in new[]{new Vector3(1,1,0),new Vector3(-1,1,0),new Vector3(1,-1,0),new Vector3(-1,-1,0)})
                if(Math.Abs(Ground(p+d)-z)>.20f)throw new InvalidOperationException("placement slope exceeds bounded flat exterior");
            return new Vector3(p.X,p.Y,z+.5f);
        }
        void PlayerIdentity() {
            Context();
            if(pedLost||!StoryReady||savedPed==0||Function.Call<int>(Hash.PLAYER_PED_ID)!=savedPed||
                !Function.Call<bool>(Hash.DOES_ENTITY_EXIST,savedPed)||Function.Call<bool>(Hash.IS_ENTITY_DEAD,savedPed)||
                Function.Call<int>(Hash.GET_ENTITY_MODEL,savedPed)!=savedModel) {
                pedLost=true;throw new InvalidOperationException("original player identity lost; no player operation");
            }
        }
        public void SaveView() {
            Context();if(viewSaved||!StoryReady)throw new InvalidOperationException("save original view once");
            savedPed=Function.Call<int>(Hash.PLAYER_PED_ID);savedModel=Function.Call<int>(Hash.GET_ENTITY_MODEL,savedPed);
            originalPosition=Function.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);originalHeading=Function.Call<float>(Hash.GET_ENTITY_HEADING,savedPed);
            oldPedView=Function.Call<int>(Hash.GET_FOLLOW_PED_CAM_VIEW_MODE);oldVehicleView=Function.Call<int>(Hash.GET_FOLLOW_VEHICLE_CAM_VIEW_MODE);
            oldHeading=Function.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_HEADING);oldPitch=Function.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_PITCH);
            if(!Function.Call<bool>(Hash.IS_GAMEPLAY_CAM_RENDERING))throw new InvalidOperationException("existing scripted camera refused");
            if(!Function.Call<bool>(Hash.IS_ENTITY_FOCUS,savedPed))throw new InvalidOperationException("existing non-player streaming focus refused");
            viewSaved=true;log("view-saved ped="+savedPed+" modes="+oldPedView+","+oldVehicleView+" origin="+originalPosition);
        }
        public bool PrepareSite() {
            PlayerIdentity();if(sitePlaced)return true;
            if(!PlayerOnFoot) {
                if(initialExitRequested)return false;
                int current=Function.Call<int>(Hash.GET_VEHICLE_PED_IS_IN,savedPed,false);
                if(current==0||Function.Call<float>(Hash.GET_ENTITY_SPEED,current)>=.15f)throw new InvalidOperationException("initial player vehicle must be stationary for normal exit");
                initialExitRequested=true;log("initial-player-exit-request; no ownership, engine setter or deletion on the pre-existing vehicle");
                Function.Call(Hash.TASK_LEAVE_VEHICLE,savedPed,current,0);return false;
            }
            // One fixed reviewed exterior, not a free-form teleport endpoint.
            // No traffic deletion, time/weather change, or world population edit.
            var site=new Vector3(1730f,3300f,41.2f);
            if(!focusOwned) {Function.Call(Hash.SET_FOCUS_POS_AND_VEL,site.X,site.Y,site.Z,0f,0f,0f);focusOwned=true;}
            long now=System.Diagnostics.Stopwatch.GetTimestamp();
            if(collisionRequests<10&&(collisionAt==0||now-collisionAt>=System.Diagnostics.Stopwatch.Frequency)) {
                Function.Call(Hash.REQUEST_COLLISION_AT_COORD,site.X,site.Y,site.Z);collisionAt=now;collisionRequests++;
            }
            Vector3 ground;
            try{ground=FlatGround(site);Space(ground);}catch(InvalidOperationException){return false;}
            Function.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET,savedPed,ground.X,ground.Y,ground.Z+.5f,false,false,true);
            Function.Call(Hash.SET_ENTITY_HEADING,savedPed,195f);sitePlaced=true;
            Function.Call(Hash.CLEAR_FOCUS);focusOwned=false;
            Vector3 actual=Function.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);
            if((actual-new Vector3(ground.X,ground.Y,ground.Z+.5f)).Length()>.15f)throw new InvalidOperationException("site placement readback failed");
            log("fixed-exterior-placement-verified requested=1730,3300,41.2 heading=195 actual="+actual+" bounded collisionRequests="+collisionRequests);
            return true;
        }
        public void RestoreView() {
            Context();if(!viewSaved)return;PlayerIdentity();
            if(focusOwned){Function.Call(Hash.CLEAR_FOCUS);focusOwned=false;}
            Function.Call(Hash.SET_FOLLOW_PED_CAM_VIEW_MODE,oldPedView);Function.Call(Hash.SET_FOLLOW_VEHICLE_CAM_VIEW_MODE,oldVehicleView);
            Function.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_HEADING,oldHeading);Function.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_PITCH,oldPitch,1f);
            if(PlayerOnFoot&&!Function.Call<bool>(Hash.IS_POSITION_OCCUPIED,originalPosition.X,originalPosition.Y,originalPosition.Z,.45f,false,true,true,false,false,savedPed,false)) {
                Function.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET,savedPed,originalPosition.X,originalPosition.Y,originalPosition.Z,false,false,true);
                Function.Call(Hash.SET_ENTITY_HEADING,savedPed,originalHeading);
                log("player-returned-to-original-clear-position "+originalPosition);
            } else log("player-position-return-unresolved; no occupied-space teleport");
            if(Function.Call<int>(Hash.GET_FOLLOW_PED_CAM_VIEW_MODE)!=oldPedView||Function.Call<int>(Hash.GET_FOLLOW_VEHICLE_CAM_VIEW_MODE)!=oldVehicleView)
                throw new InvalidOperationException("view-mode restoration readback failed");
            viewSaved=false;log("view-mode-restore-verified; per-frame input/camera clamps cease automatically; no script camera created");
        }
        public bool PlayerOnFoot { get { Context();int p=Function.Call<int>(Hash.PLAYER_PED_ID);return p!=0&&!Function.Call<bool>(Hash.IS_PED_IN_ANY_VEHICLE,p,false); } }
        public void SeatA(Lifetime target) {
            PlayerIdentity();if(++seatsA>2||!PlayerOnFoot||!CanRestore(target)||!EmptyStoppedAndDriveable(target))throw new InvalidOperationException("bounded seat-A prerequisites");
            log("seat-A-intent handle="+target.Handle+" token="+target.Token);
            Function.Call(Hash.SET_PED_INTO_VEHICLE,savedPed,target.Handle,-1);
        }
        public bool SeatedA(Lifetime target) { PlayerIdentity();return Matches(target)&&!target.Lost&&!target.Deleted&&Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT,target.Handle,-1,false)==savedPed; }
        public bool EngineOn(Lifetime item) { Context();if(item==null||item.Lost||item.Deleted||!Matches(item))throw new InvalidOperationException("engine read stale lifetime");return Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING,item.Handle); }
        public void StartA(Lifetime target) {
            PlayerIdentity();if(++startsA>2||!SeatedA(target)||!CanRestore(target)||EngineOn(target))throw new InvalidOperationException("bounded setup-only A start");
            log("setup-A-start-intent handle="+target.Handle+" token="+target.Token+" count="+startsA+"; no maintenance/restart after baseline");
            Function.Call(Hash.SET_VEHICLE_ENGINE_ON,target.Handle,true,true,false);
        }
        public void LeaveA(Lifetime target) {
            PlayerIdentity();if(PlayerOnFoot)return;
            if(++leavesA>3||!SeatedA(target)||!CanRestore(target))throw new InvalidOperationException("bounded stationary A dismount");
            log("leave-A-intent handle="+target.Handle+" token="+target.Token);
            Function.Call(Hash.TASK_LEAVE_VEHICLE,savedPed,target.Handle,0);
        }
        public void StopAForComparison(Lifetime target) {
            PlayerIdentity();if(!EmptyStoppedAndDriveable(target)||!PlayerOnFoot)throw new InvalidOperationException("empty A required for B comparison");
            if(!EngineOn(target))return;
            if(++stopsA>2)throw new InvalidOperationException("at most two comparison-only A stops");
            log("comparison-A-stop handle="+target.Handle+" token="+target.Token+" count="+stopsA);
            Function.Call(Hash.SET_VEHICLE_ENGINE_ON,target.Handle,false,true,false);
        }
        public void StandBehindB(Lifetime target,Lifetime control) {
            PlayerIdentity();if(!PlayerOnFoot||!EmptyStoppedAndDriveable(target)||!EmptyStoppedAndDriveable(control)||EngineOn(target)||!EngineOn(control))throw new InvalidOperationException("exact empty pair for B viewpoint");
            Vector3 p=Function.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS,control.Handle,0f,-3f,0f);
            p.Z=Ground(p)+1f;
            Vector3 current=Function.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);
            if((p-current).Length()>20||Function.Call<bool>(Hash.IS_POSITION_OCCUPIED,p.X,p.Y,p.Z,.45f,false,true,true,false,false,savedPed,false))throw new InvalidOperationException("bounded B standing point blocked");
            Function.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET,savedPed,p.X,p.Y,p.Z,false,false,true);
            Function.Call(Hash.SET_ENTITY_HEADING,savedPed,Function.Call<float>(Hash.GET_ENTITY_HEADING,control.Handle));
            log("B-player-placement-requested rear-origin-offset=0,-3,0 ground+1 "+p+"; verify actual readback");
        }
        public void SetView(bool seated) {
            PlayerIdentity();Function.Call(seated?Hash.SET_FOLLOW_VEHICLE_CAM_VIEW_MODE:Hash.SET_FOLLOW_PED_CAM_VIEW_MODE,1);
            Function.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_HEADING,0f);Function.Call(Hash.SET_GAMEPLAY_CAM_RELATIVE_PITCH,-8f,1f);
            log("normal-gameplay-follow-view-requested seated="+seated+" mode=1 heading=0 pitch=-8; no scripted-camera/listener override");
        }
        public void HoldInputs() {
            PlayerIdentity();
            foreach(int control in new[]{0,1,2,26,59,60,63,64,68,69,70,71,72,75,79,80,86})Function.Call(Hash.DISABLE_CONTROL_ACTION,0,control,true);
            Function.Call(Hash.SET_THIRD_PERSON_CAM_RELATIVE_HEADING_LIMITS_THIS_UPDATE,0f,0f);
            Function.Call(Hash.SET_THIRD_PERSON_CAM_RELATIVE_PITCH_LIMITS_THIS_UPDATE,-8f,-8f);
        }
        public Pose ReadPose() {
            PlayerIdentity();Vector3 p=Function.Call<Vector3>(Hash.GET_GAMEPLAY_CAM_COORD),r=Function.Call<Vector3>(Hash.GET_GAMEPLAY_CAM_ROT,2),
                f=Function.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_COORD),fr=Function.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_ROT,2),ped=Function.Call<Vector3>(Hash.GET_ENTITY_COORDS,savedPed,true);
            return new Pose {X=p.X,Y=p.Y,Z=p.Z,RX=r.X,RY=r.Y,RZ=r.Z,PlayerX=ped.X,PlayerY=ped.Y,PlayerZ=ped.Z,
                Gameplay=Function.Call<bool>(Hash.IS_GAMEPLAY_CAM_RENDERING)&&(p-f).Length()<.03f&&(r-fr).Length()<.1f};
        }
        public bool PairState(Lifetime target,Lifetime control,bool seated,bool aEngine) {
            PlayerIdentity();if(target==null||control==null||target.Lost||control.Lost||target.Deleted||control.Deleted||target.Role!="A"||control.Role!="B"||target.Handle==control.Handle||target.Token==control.Token||!CanRestore(target)||!EmptyStoppedAndDriveable(control))return false;
            bool occupancy=seated?SeatedA(target):PlayerOnFoot&&EmptyStoppedAndDriveable(target);
            return occupancy&&EngineOn(target)==aEngine&&EngineOn(control);
        }
        static uint Jenk(string text) {uint h=0;foreach(char c in text.ToLowerInvariant()){h+=(byte)c;h+=h<<10;h^=h>>6;}h+=h<<3;h^=h>>11;h+=h<<15;return h;}
        public void HornA(Lifetime target) {
            PlayerIdentity();if(++horns>7||!SeatedA(target)||!CanRestore(target)||!EngineOn(target))throw new InvalidOperationException("bounded physical vehicle horn on A only");
            log("vehicle-horn-dispatch-intent role=A handle="+target.Handle+" token="+target.Token+" durationMs=600 mode=HELDDOWN forever=false");
            // Same vehicle-bound native and arguments as retained SDK Vehicle.SoundHorn.
            Function.Call(Hash.START_VEHICLE_HORN,CreateHornArguments(target.Handle));
        }
        internal static InputArgument[] CreateHornArguments(int handle) {return new InputArgument[]{handle,600,Jenk("HELDDOWN"),false};}
        internal static unsafe InputArgument CreateGroundArgument(float* z) {return z;}
        public bool HornActive(Lifetime target) {Context();return Matches(target)&&!target.Lost&&!target.Deleted&&Function.Call<bool>(Hash.IS_HORN_ACTIVE,target.Handle);}
    }
}
