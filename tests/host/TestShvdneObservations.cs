using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using RichAudio.Integration;
using RichAudio.Beacon.Transport;

internal static class TestShvdneObservations
{
    const string Session = "0123456789abcdef0123456789abcdef";
    static int assertions, cases;
    static void Check(bool v, string why) { assertions++; if (!v) throw new Exception(why); }
    static void Test(string name, Action test) { test(); cases++; Console.WriteLine("PASS " + name); }
    static readonly long Step = Stopwatch.Frequency / 20;
    static CameraObservation Camera(long t, double x = 0)
    { return new CameraObservation { Before = t, After = t, Observed = t, GameTime = 1000, Position = new[] { x, 0d, 1d }, Forward = new[] { 0d, 1d, 0d }, Up = new[] { 0d, 0d, 1d } }; }
    sealed class Source : IGameObservationSource
    {
        public bool Ready = true, ThrowVehicle;
        public int Player = 257;
        public long Time = Stopwatch.Frequency * 10, Work;
        public readonly Dictionary<int, VehicleObservation> Vehicles = new Dictionary<int, VehicleObservation>();
        public bool StoryReady { get { return Ready; } }
        public int PlayerVehicleHandle { get { return Player; } }
        public int[] DiscoverVehicles(double[] p, float r) { return Vehicles.Keys.ToArray(); }
        public CameraObservation ReadCamera() { return Camera(Time); }
        public VehicleObservation ReadVehicle(int handle)
        {
            if (ThrowVehicle) throw new InvalidOperationException("authored getter failure");
            VehicleObservation o; return Vehicles.TryGetValue(handle, out o) ? o : new VehicleObservation { Handle = handle };
        }
        public GameplayInterior ReadCameraInterior(ListenerState l, out CameraInteriorReadback raw)
        { raw = new CameraInteriorReadback { Outcome = "no-proxy", Proxy = 0, SampleTicks = Time }; return null; }
        public long Clock() { long t = Time + Work; Work = 0; return t; }
        public void Advance()
        {
            Time += Step;
            foreach (var v in Vehicles.Values) { v.Before = Time; v.After = Time; v.Observed = Time; }
        }
        public VehicleObservation Add(int h, bool player = false)
        {
            var o = new VehicleObservation { Handle = h, Model = 0xf9300cc5, Exists = true, PlayerDriver = player,
                VehicleView = player, Running = true, Before = Time, After = Time, Observed = Time,
                Position = new[] { 0d, 0d, 0d }, Velocity = new[] { 0d, 0d, 0d }, Forward = new[] { 0d, 1d, 0d }, Up = new[] { 0d, 0d, 1d },
                RpmRatio = .5, OperatingPointEvidence = "authored-offline-fixture" };
            Vehicles[h] = o; return o;
        }
        public SharedFrameSampler Sampler(int max = 4)
        { return new SharedFrameSampler(Session, this, delegate(uint model, string context) { return true; }, max, Clock); }
    }
    static RichAudio.Beacon.Rph.CameraObservation Rph(CameraObservation c)
    {
        return c == null ? null : new RichAudio.Beacon.Rph.CameraObservation { Before = c.Before, After = c.After,
            Observed = c.Observed, UnixMs = c.UnixMs, GameTime = c.GameTime, Paused = c.Paused,
            Position = c.Position, Forward = c.Forward, Up = c.Up };
    }
    static void Pair(params CameraObservation[] samples)
    {
        var common = new CameraListenerTracker(); var rph = new RichAudio.Beacon.Rph.CameraListenerTracker();
        foreach (var c in samples)
        {
            var a = common.Observe(Session, c); var b = rph.Observe(Session, Rph(c));
            Check(a.Publish == b.Publish && a.Terminal == b.Terminal && a.Classification == b.Classification &&
                a.Generation == b.Generation && a.Sequence == b.Sequence, "paired listener decision");
            if (a.Listener == null || b.Listener == null) Check(a.Listener == null && b.Listener == null, "paired null state");
            else Check(Protocol.EncodeJson(a.Listener) == Protocol.EncodeJson(b.Listener), "byte equivalent listener schema and numbers");
        }
    }
    public static int Main()
    {
        try
        {
            Test("RPH and shared listener continuous camera fixture equality", delegate { Pair(Camera(Step), Camera(2 * Step, 1), Camera(3 * Step, 2)); });
            Test("RPH and shared listener cut/cache/recovery equality", delegate { var cut = Camera(2 * Step, 20); Pair(Camera(Step), cut, cut, Camera(3 * Step, 21)); });
            Test("RPH and shared listener invalid time/pose/pause equality", delegate {
                foreach (var bad in new[] { Camera(Step - 1), Camera(Step + Stopwatch.Frequency), Camera(2 * Step, Double.NaN), Camera(Step, 3) }) Pair(Camera(Step), bad);
                var paused = Camera(2 * Step); paused.Paused = true; Pair(Camera(Step), paused);
            });
            Test("RPH and shared listener orientation and clock transition equality", delegate {
                var rotated = Camera(2 * Step); rotated.Forward = new[] { 0d, -1d, 0d }; Pair(Camera(Step), rotated, Camera(3 * Step));
                var reset = Camera(2 * Step); reset.GameTime = 1; Pair(Camera(Step), reset);
            });
            Test("player and NPC have independent stable source identities", delegate {
                var s = new Source(); s.Add(257, true); s.Add(513); var sampler = s.Sampler(); var a = sampler.Capture();
                Check(a.Vehicles.Length == 2 && a.Vehicles[0].Context == "player" && a.Vehicles[1].Context == "npc", "independent contexts");
                Check(a.Vehicles[0].Id != a.Vehicles[1].Id, "independent identity"); s.Advance(); var b = sampler.Capture();
                Check(a.Vehicles[0].Id == b.Vehicles[0].Id && b.Vehicles[0].Generation == 1, "continuous source identity");
                Check(GameplayWire.Decode(GameplayWire.Encode(b, Session), Session).Vehicles.Length == 2, "unchanged schema round trip");
            });
            Test("dismount retains bank context and revokes rider attachment", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); var a = sampler.Capture();
                s.Advance(); o.PlayerDriver = false; o.VehicleView = false; s.Player = 0; var b = sampler.Capture();
                Check(a.Vehicles[0].Id == b.Vehicles[0].Id && b.Vehicles[0].Context == "player" && b.Vehicles[0].RiderAttached == false && b.Vehicles[0].RiderViewAttached == false, "context independent of attachment");
            });
            Test("invalid handle retirement prevents source resurrection", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); string id = sampler.Capture().Vehicles[0].Id;
                s.Advance(); o.Exists = false; Check(sampler.Capture().Vehicles.Length == 0, "invalid handle withheld");
                s.Advance(); o.Exists = true; Check(sampler.Capture().Vehicles[0].Id != id, "reused handle fresh lifetime");
            });
            Test("same handle changed model cannot inherit source", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); string id = sampler.Capture().Vehicles[0].Id;
                s.Advance(); o.Model++; Check(sampler.Capture().Vehicles[0].Id != id, "changed-model fresh lifetime");
            });
            Test("unsupported RPM retains diagnostics and never invents wire idle", delegate {
                var s = new Source(); s.Add(257, true).RpmRatio = null; var sampler = s.Sampler(); var f = sampler.Capture();
                Check(f.Vehicles.Length == 0 && sampler.LastObservations.Length == 1 && sampler.LastObservations[0].RpmRatio == null && sampler.MissingOperatingPoints == 1, "null RPM omission");
                foreach (double invalid in new[] { Double.NaN, Double.PositiveInfinity, -.01, 1.01 }) { s.Advance(); s.Vehicles[257].RpmRatio = invalid; Check(sampler.Capture().Vehicles.Length == 0, "invalid ratio omitted"); }
            });
            Test("missing evidence does not refresh source chronology", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); var a = sampler.Capture();
                for (int i = 0; i < 6; i++) { s.Advance(); o.RpmRatio = null; Check(sampler.Capture().Vehicles.Length == 0, "missing sample"); }
                s.Advance(); o.RpmRatio = .6; var b = sampler.Capture(); Check(b.Vehicles[0].Id == a.Vehicles[0].Id && b.Vehicles[0].Generation == 2, "fresh generation after telemetry gap");
            });
            Test("teleport renews generation without changing another source", delegate {
                var s = new Source(); var o = s.Add(257, true); s.Add(513); var sampler = s.Sampler(); sampler.Capture();
                s.Advance(); o.Position[0] = 20; var b = sampler.Capture(); Check(b.Vehicles[0].Generation == 2 && b.Vehicles[1].Generation == 1, "isolated teleport generation");
            });
            Test("published frames own immutable vector snapshots", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); var a = sampler.Capture(); o.Position[0] = 99;
                Check(a.Vehicles[0].Position[0] == 0, "copy boundary prevents future source mutation");
            });
            Test("invalid pose missing source and getter failure remain isolated", delegate {
                var s = new Source(); var o = s.Add(257, true); s.Add(513); var sampler = s.Sampler(); sampler.Capture();
                s.Advance(); o.Forward[0] = 2; Check(sampler.Capture().Vehicles.Length == 1, "invalid player does not suppress NPC");
                s.Advance(); s.ThrowVehicle = true; Check(sampler.Capture().Vehicles.Length == 0 && sampler.GetterFailures == 2, "getter exceptions withdraw each source");
            });
            Test("scope loss and restart require new source lifetimes", delegate {
                var s = new Source(); s.Add(257, true); var sampler = s.Sampler(); string id = sampler.Capture().Vehicles[0].Id;
                s.Ready = false; Check(sampler.Capture() == null && sampler.LastObservations.Length == 0, "scope invalidated");
                s.Ready = true; s.Advance(); Check(sampler.Capture().Vehicles[0].Id != id, "new lifetime after readiness returns");
                var fresh = new SharedFrameSampler("abcdef0123456789abcdef0123456789", s, delegate { return true; }, 4, s.Clock);
                Check(fresh.Capture().Session != Session, "new script instance has independent session");
            });
            Test("bounded fleet prioritizes current player without retaining evicted ownership", delegate {
                var s = new Source(); s.Add(257, true); s.Add(513); var sampler = s.Sampler(1); Check(sampler.Capture().Vehicles.Length == 1, "fleet bounded");
                s.Advance(); s.Player = 513; s.Vehicles[257].PlayerDriver = false; s.Vehicles[513].PlayerDriver = true;
                var b = sampler.Capture(); Check(b.Vehicles.Length == 1 && b.Vehicles[0].Context == "player" && sampler.Retirements >= 1, "eviction retires old source");
            });
            Test("full fleet admits newly discovered nearer NPC with bounded hysteresis", delegate {
                var s = new Source(); s.Player = 0; s.Add(257).Position[0] = 100; var sampler = s.Sampler(1); string first = sampler.Capture().Vehicles[0].Id;
                s.Add(513).Position[0] = 5; GameplayFrame f = null;
                for (int i = 0; i < 21; i++) { s.Advance(); f = sampler.Capture(); Check(f.Vehicles.Length == 1, "fleet stays bounded"); }
                Check(f.Vehicles[0].Id != first && f.Vehicles[0].Position[0] == 5, "new nearby NPC admitted");
            });
            Test("far-away NPC retires even when operating point is unavailable", delegate {
                var s = new Source(); s.Player = 0; var o = s.Add(257); var sampler = s.Sampler(); sampler.Capture();
                s.Advance(); o.Position[0] = 601; o.RpmRatio = null;
                Check(sampler.Capture().Vehicles.Length == 0 && sampler.Retirements > 0, "far lifetime retired before RPM filtering");
            });
            Test("lost observations revoke identity independently of missing RPM", delegate {
                var s = new Source(); var o = s.Add(257, true); var sampler = s.Sampler(); string first = sampler.Capture().Vehicles[0].Id;
                s.Advance(); o.Failure = "authored-pre-post-identity-failed"; Check(sampler.Capture().Vehicles.Length == 0, "identity failure rejected");
                s.Advance(); o.Failure = null; o.RpmRatio = null; sampler.Capture();
                s.Advance(); o.RpmRatio = .5; Check(sampler.Capture().Vehicles[0].Id != first, "RPM absent did not retain dead lifetime");
            });
            Test("camera basis keeps roll pitch and yaw conventions", delegate {
                double[] f, u; CameraBasis.FromZxyDegrees(0, 0, 90, out f, out u);
                Check(Math.Abs(f[0] + 1) < 1e-12 && Math.Abs(f[1]) < 1e-12 && u[2] == 1, "native ZXY yaw");
                CameraBasis.FromZxyDegrees(30, 20, 10, out f, out u); double dot = f.Zip(u, (a, b) => a * b).Sum();
                Check(Math.Abs(dot) < 1e-12 && Math.Abs(f.Sum(x => x * x) - 1) < 1e-12, "rolled/pitched camera orthonormal");
            });
            Console.WriteLine("RESULT cases=" + cases + " assertions=" + assertions + " gameLaunched=false endpointOpened=false"); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
