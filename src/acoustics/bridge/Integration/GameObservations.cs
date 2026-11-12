using System;
using RichAudio.Beacon.Transport;

namespace RichAudio.Integration
{
    // Framework objects and memory addresses never cross this boundary. Handles
    // are transient sampler keys, not identities stored by the acoustic engine.
    public sealed class CameraObservation
    {
        public long Before, After, Observed, UnixMs;
        public uint GameTime;
        public bool Paused;
        public double[] Position, Forward, Up;
    }

    public sealed class VehicleObservation
    {
        public int Handle;
        public uint Model;
        public bool Exists, Dead, PlayerDriver, VehicleView, Running;
        public long Before, After, Observed;
        public double[] Position, Velocity, Forward, Up, AngularVelocity;
        // Null means unavailable. In particular, a missing RPM must never turn
        // into idle in the existing wire schema, which has no null RPM field.
        public double? RpmRatio, Throttle, Brake, SteeringDegrees, Clutch, AggregateWheelSpeed;
        public int? Gear, VehicleClass;
        public double? EngineHealth, BodyHealth;
        public bool? AllWheelsOnGround, HornPlaying, SirenPlaying, EngineStarting;
        public string OperatingPointEvidence = "unavailable";
        public string Failure;
    }

    public interface IGameObservationSource
    {
        bool StoryReady { get; }
        CameraObservation ReadCamera();
        int PlayerVehicleHandle { get; }
        int[] DiscoverVehicles(double[] cameraPosition, float radius);
        VehicleObservation ReadVehicle(int handle);
        GameplayInterior ReadCameraInterior(ListenerState listener, out CameraInteriorReadback readback);
    }
}
