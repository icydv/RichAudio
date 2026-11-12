using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using GTA;
using GTA.Math;
using GTA.Native;
using RichAudio.Beacon.Transport;

namespace RichAudio.Integration.Shvdne
{
    // API3 v3.9.0.0 from SHVDNE v1.1.0.6. Native declarations have been
    // source-checked; exact Enhanced 1.0.1158.16 runtime behavior is unqualified.
    public sealed class ShvdneGameSource : IGameObservationSource, IObservationTraceSource02B
    {
        public StartupTrace02B StartupTrace {get;set;}
        readonly bool allowMemoryTelemetry;
        readonly bool useEnhancedNativeTelemetry;
        bool nativeOperatingPointFaulted;
        // Pinned NativeDB Gen9 424fb51b089049a9fbcebcc641500b1d44d255b4,
        // same candidate contract as the retained independent SHV producer.
        public const ulong EnhancedRevRatioHash = 0xF9DDA40BC293A61EUL;
        int callbackThread;
        // Last identity validated by StoryReady, for passive diagnostics only.
        public int LastReadyPlayerPedHandle { get; private set; }
        public ShvdneGameSource(bool allowMemoryTelemetry = false, bool useEnhancedNativeTelemetry = false)
        {
            if (allowMemoryTelemetry && useEnhancedNativeTelemetry) throw new ArgumentException("Operating-point providers are mutually exclusive");
            this.allowMemoryTelemetry = allowMemoryTelemetry; this.useEnhancedNativeTelemetry = useEnhancedNativeTelemetry;
        }
        void Context()
        {
            int current = Thread.CurrentThread.ManagedThreadId;
            if (callbackThread == 0) callbackThread = current;
            if (callbackThread != current) throw new InvalidOperationException("SHVDNE game observation must stay on its script callback thread");
        }
        static double[] V(Vector3 v) { return new double[] { v.X, v.Y, v.Z }; }
        static bool Exists(int h)
        { return h != 0 && Function.Call<bool>(Hash.DOES_ENTITY_EXIST, h); }
        public bool StoryReady
        {
            get
            {
                Context();
                LastReadyPlayerPedHandle = 0;
                if (Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE) || Function.Call<bool>(Hash.NETWORK_IS_SESSION_STARTED) ||
                    Function.Call<bool>(Hash.NETWORK_IS_GAME_IN_PROGRESS) || Function.Call<bool>(Hash.IS_PLAYER_SWITCH_IN_PROGRESS)) return false;
                int player = Function.Call<int>(Hash.PLAYER_ID), ped = Function.Call<int>(Hash.PLAYER_PED_ID);
                bool ready = Exists(ped) && Function.Call<bool>(Hash.IS_PLAYER_PLAYING, player) && !Function.Call<bool>(Hash.IS_ENTITY_DEAD, ped, false);
                if (ready) LastReadyPlayerPedHandle = ped;
                return ready;
            }
        }
        public int PlayerVehicleHandle
        {
            get
            {
                Context(); int ped = Function.Call<int>(Hash.PLAYER_PED_ID);
                return Exists(ped) ? Function.Call<int>(Hash.GET_VEHICLE_PED_IS_IN, ped, false) : 0;
            }
        }
        public CameraObservation ReadCamera()
        {
            Context(); long before = Stopwatch.GetTimestamp();var trace=StartupTrace;
            if(trace!=null){trace.CameraStarted(before);trace.Mark(ObservationStage02B.CameraPrelude);}
            Vector3 p;try{p=Function.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_COORD);if(trace!=null)trace.CameraReturned(1);}finally{if(trace!=null)trace.Mark(ObservationStage02B.CameraCoordinate);}
            Vector3 rotation;try{rotation=Function.Call<Vector3>(Hash.GET_FINAL_RENDERED_CAM_ROT,2);if(trace!=null)trace.CameraReturned(2);}finally{if(trace!=null)trace.Mark(ObservationStage02B.CameraRotation);}
            uint time;try{time=Function.Call<uint>(Hash.GET_GAME_TIMER);if(trace!=null)trace.CameraReturned(4);}finally{if(trace!=null)trace.Mark(ObservationStage02B.GameTime);}
            bool paused;try{paused=Function.Call<bool>(Hash.IS_PAUSE_MENU_ACTIVE);if(trace!=null)trace.CameraReturned(8);}finally{if(trace!=null)trace.Mark(ObservationStage02B.PauseState);}
            long after = Stopwatch.GetTimestamp(), observed = before + (after - before) / 2;
            if(trace!=null){trace.CameraAcquired(after,observed);trace.Mark(ObservationStage02B.CameraNativeTail);}
            try{double[] forward, up; CameraBasis.FromZxyDegrees(rotation.X, rotation.Y, rotation.Z, out forward, out up);
            var result=new CameraObservation { Before = before, After = after, Observed = observed, GameTime = time, Paused = paused,
                UnixMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds -
                    (long)((after - observed) * 1000d / Stopwatch.Frequency), Position = V(p), Forward = forward, Up = up };
            return result;}finally{if(trace!=null)trace.Mark(ObservationStage02B.CameraManaged);}
        }
        public int[] DiscoverVehicles(double[] p, float radius)
        {
            Context();
            // The supported wrapper reads SHVDNE's vehicle pool. This remains
            // memory-layout dependent even with optional mechanical reads off.
            Vehicle[] vehicles = World.GetNearbyVehicles(new Vector3((float)p[0], (float)p[1], (float)p[2]), radius);
            var handles = new List<int>(vehicles.Length);
            foreach (Vehicle vehicle in vehicles) if (vehicle != null && vehicle.Handle != 0) handles.Add(vehicle.Handle);
            return handles.ToArray(); // Do not retain GTA wrappers between callbacks.
        }
        public VehicleObservation ReadVehicle(int handle)
        {
            Context(); var o = new VehicleObservation { Handle = handle, Before = Stopwatch.GetTimestamp() };
            if (!Exists(handle) || Function.Call<int>(Hash.GET_ENTITY_TYPE, handle) != 2) return o;
            o.Model = Function.Call<uint>(Hash.GET_ENTITY_MODEL, handle);
            o.Dead = Function.Call<bool>(Hash.IS_ENTITY_DEAD, handle, false);
            if (o.Dead) return o;
            int ped = Function.Call<int>(Hash.PLAYER_PED_ID);
            int driver = Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, handle, -1, false);
            o.PlayerDriver = Exists(ped) && driver == ped && Function.Call<int>(Hash.GET_VEHICLE_PED_IS_IN, ped, false) == handle;
            o.VehicleView = Function.Call<bool>(Hash.IS_GAMEPLAY_CAM_RENDERING) && Function.Call<bool>(Hash.IS_FOLLOW_VEHICLE_CAM_ACTIVE);
            using (var right = new OutputArgument())
            using (var forward = new OutputArgument())
            using (var up = new OutputArgument())
            using (var position = new OutputArgument())
            {
                Function.Call(Hash.GET_ENTITY_MATRIX, handle, right, forward, up, position);
                o.Position = V(position.GetResult<Vector3>()); o.Forward = V(forward.GetResult<Vector3>()); o.Up = V(up.GetResult<Vector3>());
            }
            o.Velocity = V(Function.Call<Vector3>(Hash.GET_ENTITY_VELOCITY, handle));
            o.AngularVelocity = V(Function.Call<Vector3>(Hash.GET_ENTITY_ROTATION_VELOCITY, handle));
            o.Running = Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, handle);
            o.VehicleClass = Function.Call<int>(Hash.GET_VEHICLE_CLASS, handle);
            o.EngineHealth = Function.Call<float>(Hash.GET_VEHICLE_ENGINE_HEALTH, handle);
            o.BodyHealth = Function.Call<float>(Hash.GET_VEHICLE_BODY_HEALTH, handle);
            o.AllWheelsOnGround = Function.Call<bool>(Hash.IS_VEHICLE_ON_ALL_WHEELS, handle);
            o.HornPlaying = Function.Call<bool>(Hash.IS_HORN_ACTIVE, handle);
            o.SirenPlaying = Function.Call<bool>(Hash.IS_VEHICLE_SIREN_ON, handle);
            if (useEnhancedNativeTelemetry)
            {
                o.OperatingPointEvidence = nativeOperatingPointFaulted ? "candidate-public-native-disabled-after-fault" : "candidate-public-native-unqualified-shvdne";
                if (!nativeOperatingPointFaulted)
                {
                    try { o.RpmRatio = Function.Call<float>((Hash)EnhancedRevRatioHash, handle); }
                    catch (ThreadAbortException) { throw; }
                    catch (Exception) { nativeOperatingPointFaulted = true; throw; }
                }
            }
            if (allowMemoryTelemetry)
            {
                // Explicit diagnostic admission only. These wrappers can return
                // zero for missing offsets; range checks cannot establish that
                // an offset works on .16. No automatic/native fallback exists.
                var vehicle = Entity.FromHandle(handle) as Vehicle;
                if (vehicle == null) { o.Failure = "vehicle-wrapper-invalid"; return o; }
                o.RpmRatio = vehicle.CurrentRPM; o.Gear = vehicle.CurrentGear;
                o.Throttle = vehicle.Throttle; o.Brake = vehicle.BrakePower; o.SteeringDegrees = vehicle.SteeringAngle;
                o.Clutch = vehicle.Clutch; o.AggregateWheelSpeed = vehicle.WheelSpeed;
                o.EngineStarting = vehicle.IsEngineStarting;
                o.OperatingPointEvidence = "shvdne-memory-wrapper-unqualified-exact-build";
            }
            o.After = Stopwatch.GetTimestamp(); o.Observed = o.Before + (o.After - o.Before) / 2;
            // Full public script handle includes the framework's pool generation.
            // Recheck after all getters. No pointer becomes acoustic identity.
            o.Exists = Exists(handle) && Function.Call<int>(Hash.GET_ENTITY_TYPE, handle) == 2 &&
                Function.Call<uint>(Hash.GET_ENTITY_MODEL, handle) == o.Model && !Function.Call<bool>(Hash.IS_ENTITY_DEAD, handle, false);
            if (o.PlayerDriver) o.PlayerDriver = Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, handle, -1, false) == ped &&
                Function.Call<int>(Hash.GET_VEHICLE_PED_IS_IN, ped, false) == handle;
            return o;
        }
        public GameplayInterior ReadCameraInterior(ListenerState listener, out CameraInteriorReadback raw)
        {
            Context(); raw = new CameraInteriorReadback { Outcome = "unavailable" };
            try
            {
                double[] p = listener.Position;
                int proxy = Function.Call<int>(Hash.GET_INTERIOR_FROM_COLLISION, (float)p[0], (float)p[1], (float)p[2]);
                raw.Proxy = proxy;
                if (proxy <= 0) { raw.Outcome = "no-proxy"; return null; }
                raw.Ready = Function.Call<bool>(Hash.IS_INTERIOR_READY, proxy);
                if (raw.Ready != true) { raw.Outcome = "not-ready"; return null; }
                using (var at = new OutputArgument())
                using (var name = new OutputArgument())
                {
                    Function.Call(Hash.GET_INTERIOR_LOCATION_AND_NAMEHASH, proxy, at, name);
                    raw.Origin = V(at.GetResult<Vector3>()); raw.Archetype = name.GetResult<uint>();
                }
                foreach (double x in raw.Origin) if (!Protocol.Finite(x) || Math.Abs(x) > 100000) { raw.Outcome = "invalid-origin"; return null; }
                raw.SampleTicks = Stopwatch.GetTimestamp();
                if (raw.Archetype == 0 || Math.Abs((decimal)raw.SampleTicks - listener.ObservationTicks) > Stopwatch.Frequency / 20m)
                { raw.Outcome = "invalid-archetype-or-age"; return null; }
                raw.Outcome = "observed";
                return new GameplayInterior { Proxy = proxy, Archetype = raw.Archetype.Value, Origin = raw.Origin, ObservationTicks = raw.SampleTicks };
            }
            catch (ThreadAbortException) { throw; }
            catch (Exception e) { raw.Outcome = "getter-error:" + e.GetType().Name; return null; }
            finally { if (raw.Outcome != "observed") raw.SampleTicks = Stopwatch.GetTimestamp(); }
        }
    }
}
