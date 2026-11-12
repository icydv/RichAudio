using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using GTA.Native;
using RichAudio.Integration.Shvdne;
using RichAudio.Beacon.Transport;

// Deliberately authored GTA stand-ins, never loaded into the game. Production
// source is also independently compiled against the pinned real API3 binary.
namespace GTA.Math
{
    public struct Vector3 { public float X, Y, Z; public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; } }
}
namespace GTA
{
    public class Entity
    {
        public int Handle;
        public static Entity FromHandle(int h) { return new Vehicle { Handle = h }; }
    }
    public sealed class Vehicle : Entity
    {
        public static int MemoryReads;
        static float Read(float x) { MemoryReads++; return x; }
        public float CurrentRPM { get { return Read(.6f); } }
        public int CurrentGear { get { MemoryReads++; return 2; } }
        public float Throttle { get { return Read(.7f); } }
        public float BrakePower { get { return Read(.1f); } }
        public float SteeringAngle { get { return Read(12); } }
        public float Clutch { get { return Read(.8f); } }
        public float WheelSpeed { get { return Read(15); } }
        public bool IsEngineStarting { get { MemoryReads++; return false; } }
    }
    public static class World
    {
        public static float Radius;
        public static Math.Vector3 Position;
        public static Vehicle[] GetNearbyVehicles(Math.Vector3 p, float radius)
        { Position = p; Radius = radius; return new[] { new Vehicle { Handle = 257 }, new Vehicle { Handle = 513 } }; }
    }
}
namespace GTA.Native
{
    public sealed class OutputArgument : IDisposable
    {
        public object Value;
        public T GetResult<T>() { return (T)Value; }
        public void Dispose() { }
    }
    public static class Function
    {
        public static readonly List<Tuple<Hash, object[]>> Calls = new List<Tuple<Hash, object[]>>();
        public static Func<Hash, object[], object> Response;
        public static T Call<T>(Hash h, params object[] args)
        { Calls.Add(Tuple.Create(h, args)); return (T)Response(h, args); }
        public static void Call(Hash h, params object[] args)
        { Calls.Add(Tuple.Create(h, args)); Response(h, args); }
    }
}
internal static class TestShvdneGameSource
{
    static int assertions, cases, models, drivers;
    static bool Exists = true, ChangeModel, ChangeDriver, Network, Interior, BadInterior;
    static void Check(bool v, string message) { assertions++; if (!v) throw new Exception(message); }
    static void Test(string name, Action body)
    {
        Function.Calls.Clear(); GTA.Vehicle.MemoryReads = 0; models = 0; drivers = 0;
        Exists = true; ChangeModel = ChangeDriver = Network = Interior = BadInterior = false; Function.Response = Respond;
        body(); cases++; Console.WriteLine("PASS " + name);
    }
    static object Respond(Hash h, object[] args)
    {
        if((ulong)h==ShvdneGameSource.EnhancedRevRatioHash)return .35f;
        switch (h)
        {
            case Hash.GET_IS_LOADING_SCREEN_ACTIVE:
            case Hash.IS_PLAYER_SWITCH_IN_PROGRESS:
            case Hash.IS_PAUSE_MENU_ACTIVE:
            case Hash.IS_ENTITY_DEAD: return false;
            case Hash.NETWORK_IS_SESSION_STARTED:
            case Hash.NETWORK_IS_GAME_IN_PROGRESS: return Network;
            case Hash.PLAYER_ID: return 0;
            case Hash.PLAYER_PED_ID: return 42;
            case Hash.IS_PLAYER_PLAYING: return true;
            case Hash.DOES_ENTITY_EXIST: return (int)args[0] == 42 || Exists;
            case Hash.GET_VEHICLE_PED_IS_IN: return 257;
            case Hash.GET_ENTITY_TYPE: return 2;
            case Hash.GET_ENTITY_MODEL: models++; return ChangeModel && models > 1 ? 3u : 0xf9300cc5u;
            case Hash.GET_PED_IN_VEHICLE_SEAT: drivers++; return ChangeDriver && drivers > 1 ? 99 : 42;
            case Hash.IS_GAMEPLAY_CAM_RENDERING:
            case Hash.IS_FOLLOW_VEHICLE_CAM_ACTIVE:
            case Hash.GET_IS_VEHICLE_ENGINE_RUNNING:
            case Hash.IS_INTERIOR_READY:
            case Hash.IS_VEHICLE_ON_ALL_WHEELS: return true;
            case Hash.IS_HORN_ACTIVE:
            case Hash.IS_VEHICLE_SIREN_ON: return false;
            case Hash.GET_ENTITY_VELOCITY: return new GTA.Math.Vector3(1, 2, 3);
            case Hash.GET_ENTITY_ROTATION_VELOCITY: return new GTA.Math.Vector3(.1f, .2f, .3f);
            case Hash.GET_FINAL_RENDERED_CAM_COORD: return new GTA.Math.Vector3(10, 20, 30);
            case Hash.GET_FINAL_RENDERED_CAM_ROT: return new GTA.Math.Vector3(0, 0, 90);
            case Hash.GET_GAME_TIMER: return 1234u;
            case Hash.GET_VEHICLE_CLASS: return 8;
            case Hash.GET_VEHICLE_ENGINE_HEALTH: return 950f;
            case Hash.GET_VEHICLE_BODY_HEALTH: return 900f;
            case Hash.GET_ENTITY_MATRIX:
                ((OutputArgument)args[1]).Value = new GTA.Math.Vector3(1, 0, 0);
                ((OutputArgument)args[2]).Value = new GTA.Math.Vector3(0, 1, 0);
                ((OutputArgument)args[3]).Value = new GTA.Math.Vector3(0, 0, 1);
                ((OutputArgument)args[4]).Value = new GTA.Math.Vector3(4, 5, 6); return null;
            case Hash.GET_INTERIOR_FROM_COLLISION: return Interior ? 5 : 0;
            case Hash.GET_INTERIOR_LOCATION_AND_NAMEHASH:
                ((OutputArgument)args[1]).Value = new GTA.Math.Vector3(BadInterior ? Single.NaN : 1, 2, 3);
                ((OutputArgument)args[2]).Value = 0x12345678u; return null;
            default: throw new Exception("unexpected fake native " + h);
        }
    }
    public static int Main()
    {
        try
        {
            Test("passive player identity is validated and clears outside Story readiness", delegate {
                var source = new ShvdneGameSource();
                Check(source.LastReadyPlayerPedHandle == 0, "no invented player before observation");
                Check(source.StoryReady && source.LastReadyPlayerPedHandle == 42, "validated player handle available to diagnostics");
                Network = true;
                Check(!source.StoryReady && source.LastReadyPlayerPedHandle == 0, "readiness loss cannot retain a stale player identity");
            });
            Test("actual provider defaults omit all unqualified mechanical getters", delegate {
                var o = new ShvdneGameSource().ReadVehicle(257);
                Check(o.Exists && o.PlayerDriver && o.Running && o.Model == 0xf9300cc5, "native state captured");
                Check(o.RpmRatio == null && o.Gear == null && o.Throttle == null && o.Brake == null && o.Clutch == null &&
                    o.AggregateWheelSpeed == null && o.EngineStarting == null && GTA.Vehicle.MemoryReads == 0, "no memory getter side effects");
                Check(o.Position[0] == 4 && o.Forward[1] == 1 && o.Up[2] == 1 && o.Velocity[2] == 3 && o.VehicleClass == 8 &&
                    o.EngineHealth == 950 && o.BodyHealth == 900 && o.AllWheelsOnGround == true, "matrix argument order and side observations");
                Check(o.Before <= o.Observed && o.Observed <= o.After && o.Observed == o.Before + (o.After - o.Before) / 2, "original midpoint chronology");
            });
            Test("actual provider optional mechanical wrappers retain explicit unqualified provenance", delegate {
                var o = new ShvdneGameSource(true).ReadVehicle(257);
                Check(GTA.Vehicle.MemoryReads == 8 && o.RpmRatio.HasValue && o.Gear == 2 && o.AggregateWheelSpeed == 15 && o.Clutch.HasValue, "opt-in wrapper path");
                Check(o.OperatingPointEvidence == "shvdne-memory-wrapper-unqualified-exact-build", "unqualified provenance retained");
            });
            Test("Enhanced native operating point is explicit single-provider dispatch", delegate {
                var o = new ShvdneGameSource(false,true).ReadVehicle(257);
                var calls=Function.Calls.Where(x=>(ulong)x.Item1==0xF9DDA40BC293A61EUL).ToArray();
                Check(calls.Length==1&&calls[0].Item2.Length==1&&(int)calls[0].Item2[0]==257&&o.RpmRatio.HasValue, "exact float native argument construction");
                Check(GTA.Vehicle.MemoryReads==0&&o.Gear==null&&o.OperatingPointEvidence=="candidate-public-native-unqualified-shvdne", "no silent memory fallback or gear invention");
                bool failed=false;try{new ShvdneGameSource(true,true);}catch(ArgumentException){failed=true;}Check(failed,"ambiguous provider configuration rejected");
            });
            Test("Enhanced native getter failure cannot fall back to another source", delegate {
                Function.Response=delegate(Hash h,object[] args){if((ulong)h==ShvdneGameSource.EnhancedRevRatioHash)throw new InvalidOperationException("authored unsupported native");return Respond(h,args);};
                var source=new ShvdneGameSource(false,true); bool failed=false;try{source.ReadVehicle(257);}catch(InvalidOperationException){failed=true;}
                Check(failed&&GTA.Vehicle.MemoryReads==0,"failed native remains unavailable without fallback");
                var after=source.ReadVehicle(257);
                Check(after.RpmRatio==null&&after.OperatingPointEvidence=="candidate-public-native-disabled-after-fault"&&
                    Function.Calls.Count(x=>(ulong)x.Item1==ShvdneGameSource.EnhancedRevRatioHash)==1,"fault is not retried until a new provider lifetime");
            });
            Test("invalid vehicle invokes no pose or mechanical reads", delegate {
                Exists = false; var o = new ShvdneGameSource().ReadVehicle(257);
                Check(!o.Exists && Function.Calls.Count == 1 && Function.Calls[0].Item1 == Hash.DOES_ENTITY_EXIST, "early invalid handle");
                Function.Calls.Clear(); o = new ShvdneGameSource().ReadVehicle(0); Check(!o.Exists && Function.Calls.Count == 0, "zero handle no native");
            });
            Test("model reuse across getters rejects the observation", delegate {
                ChangeModel = true; var o = new ShvdneGameSource().ReadVehicle(257); Check(!o.Exists && models == 2, "post read identity rejection");
            });
            Test("driver relationship rechecked and lost attachment withdrawn", delegate {
                ChangeDriver = true; var o = new ShvdneGameSource().ReadVehicle(257); Check(o.Exists && !o.PlayerDriver && drivers == 2, "driver transition no guessed attachment");
                var calls = Function.Calls.Where(x => x.Item1 == Hash.GET_PED_IN_VEHICLE_SEAT).ToArray();
                Check(calls.All(x => (int)x.Item2[0] == 257 && (int)x.Item2[1] == -1 && (bool)x.Item2[2] == false), "native seat argument contract");
            });
            Test("render camera uses exact native basis and rotation order", delegate {
                var c = new ShvdneGameSource().ReadCamera(); Check(c.Position[0] == 10 && Math.Abs(c.Forward[0] + 1) < 1e-10 && c.Up[2] == 1, "camera native convention");
                Check(Function.Calls.Any(x => x.Item1 == Hash.GET_FINAL_RENDERED_CAM_ROT && (int)x.Item2[0] == 2), "rotation order 2");
            });
            Test("online state is rejected before entity sampling", delegate {
                Network = true; Check(!new ShvdneGameSource().StoryReady, "online refused");
                Check(!Function.Calls.Any(x => x.Item1 == Hash.PLAYER_PED_ID), "scope guard before player");
            });
            Test("discovery returns only integer keys and forwards radius position", delegate {
                var handles = new ShvdneGameSource().DiscoverVehicles(new[] { 1d, 2d, 3d }, 600);
                Check(handles.SequenceEqual(new[] { 257, 513 }) && GTA.World.Radius == 600 && GTA.World.Position.Y == 2, "pool wrapper boundary");
            });
            Test("interior outputs match proxy-name-origin and reject nonfinite position", delegate {
                Interior = true; var source = new ShvdneGameSource(); var c = source.ReadCamera();
                var listener = new ListenerState { Position = c.Position, ObservationTicks = c.Observed }; CameraInteriorReadback raw;
                var i = source.ReadCameraInterior(listener, out raw); Check(i != null && i.Proxy == 5 && i.Archetype == 0x12345678 && i.Origin[1] == 2 && raw.Outcome == "observed", "interior output arguments");
                BadInterior = true; i = source.ReadCameraInterior(listener, out raw); Check(i == null && raw.Outcome == "invalid-origin", "invalid interior rejected");
            });
            Test("actual provider forbids cross-thread native calls", delegate {
                var source = new ShvdneGameSource(); source.ReadCamera(); int before = Function.Calls.Count; Exception caught = null;
                var thread = new Thread(delegate() { try { source.ReadCamera(); } catch (Exception e) { caught = e; } }); thread.Start(); thread.Join();
                Check(caught is InvalidOperationException && Function.Calls.Count == before, "worker context rejected before native dispatch");
            });
            Console.WriteLine("RESULT cases=" + cases + " assertions=" + assertions + " gameLaunched=false endpointOpened=false"); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
