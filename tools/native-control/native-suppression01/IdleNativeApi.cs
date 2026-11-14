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
    internal sealed class IdleNativeApi : IIdleApi
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
            if (!stillAdmitted()) throw new InvalidOperationException("assignment admission expired or revoked");
            Function.Call((Hash)0x4F0C413926060B38UL, item.Handle, profile);
        }
        public bool Delete(Lifetime item)
        {
            Context(); if (!StoryReady || !EmptyStopped(item)) return false;
            DeleteHandle(item.Handle);
            return !Exists(item);
        }
        static void DeleteHandle(int handle)
        {
            using (var argument = new OutputArgument(handle)) Function.Call(Hash.DELETE_ENTITY, argument);
        }
        public void ReleaseModel() { Context(); Function.Call(Hash.SET_MODEL_AS_NO_LONGER_NEEDED, Bati); }
    }
}
