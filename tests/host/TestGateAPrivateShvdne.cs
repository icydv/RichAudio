using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.IO;
using System.Security.Cryptography;
using RichAudio.GateA.Private01;

internal static class TestGateAPrivateShvdne
{
    sealed class Journal : IProbeJournal
    {
        internal bool Health = true;
        internal long Issued, Flushed;
        internal readonly List<string> Lines = new List<string>();
        public bool Healthy { get { return Health; } }
        public long Append(string line) { if (!Health) return 0; Lines.Add(line); return ++Issued; }
        public bool Persisted(long ticket) { return Health && Flushed >= ticket; }
        internal void Flush() { Flushed = Issued; }
    }
    sealed class Api : IProfileProbeApi
    {
        internal bool Story = true, Loaded = true, ThrowAssignment, FailB, MovingA, MovingB;
        internal int Calls, Assignments, Preparations, Spawned;
        internal readonly Dictionary<int, int> Live = new Dictionary<int, int>();
        internal readonly List<int> Deleted = new List<int>();
        internal int AssignedHandle;
        public bool StoryReady { get { Calls++; return Story; } }
        public void PreparePair() { Calls++; Preparations++; }
        public bool ModelReady { get { Calls++; return Loaded; } }
        public ProbeLifetime Spawn(string role, int token)
        {
            Calls++; if (role == "B" && FailB) throw new InvalidOperationException("spawn B failed");
            int handle = ++Spawned;
            Live[handle] = token;
            return new ProbeLifetime { Handle = handle, Token = token, Role = role };
        }
        public bool Exists(ProbeLifetime item) { Calls++; return Live.ContainsKey(item.Handle); }
        public bool Matches(ProbeLifetime item) { Calls++; return Live.ContainsKey(item.Handle) && Live[item.Handle] == item.Token; }
        public bool EmptyStoppedAndDriveable(ProbeLifetime item) { Calls++; return item.Role == "A" ? !MovingA : !MovingB; }
        public string ReadSnapshot(ProbeLifetime item) { Calls++; return "handle=" + item.Handle + " profile=UNKNOWN"; }
        public void AssignPrivateProfile(ProbeLifetime item)
        {
            Calls++; Assignments++; AssignedHandle = item.Handle;
            if (ThrowAssignment) throw new InvalidOperationException("partial native failure");
        }
        public bool Retire(ProbeLifetime item)
        {
            Calls++; if (!EmptyStoppedAndDriveable(item)) return false;
            Deleted.Add(item.Handle); Live.Remove(item.Handle); return true;
        }
        public void ReleaseModel() { Calls++; }
    }
    sealed class Fixture
    {
        internal readonly Api Api = new Api();
        internal readonly Journal Journal = new Journal();
        internal readonly Guard Guard = new Guard();
        internal readonly ProfileAssignmentController Controller;
        internal long Now = 1000;
        int token = 42;
        internal Fixture() { Controller = new ProfileAssignmentController(Api, Journal, delegate { return Now; }, 1000, delegate { return ++token; }, Guard); }
        internal void Pair() { Controller.RequestSpawn(); Journal.Flush(); Controller.Tick(); Check(Controller.Active, "pair ready"); }
    }
    sealed class Guard : IPrivateProbeGuard
    {
        internal bool Live = true, Claimed, Stop, Acknowledged, Retired;
        public bool Ready { get { return Live && !Stop; } }
        public bool ClaimActivation() { if (!Ready || Claimed) return false; Claimed = true; return true; }
        public void RequestStop() { Stop = true; }
        public void StopAcknowledged() { Acknowledged = true; }
        public void VehiclesRetired() { Retired = true; }
    }
    static int checks, cases;
    static void Check(bool result, string message) { checks++; if (!result) throw new Exception(message); }
    static void Refused(Action action) { bool rejected = false; try { action(); } catch (InvalidOperationException) { rejected = true; } Check(rejected, "expected refusal"); }
    static void Test(string name, Action action) { action(); cases++; Console.WriteLine("PASS " + name); }
    public static int Main()
    {
        try
        {
            Test("script with absent sidecar remains dormant under ticks and keys", delegate {
                int nativeCalls = 0;
                GTA.Native.Function.Handler = delegate(ulong hash, object[] args) { nativeCalls++; throw new Exception("unexpected dormant native"); };
                var script = new GateAPrivate01Script();
                for (int i = 0; i < 25; i++)
                {
                    script.FixtureTick();
                    script.FixtureKey(System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.Shift | System.Windows.Forms.Keys.F5);
                    Thread.Sleep(2);
                }
                script.FixtureAbort(); Check(nativeCalls == 0, "absent sidecar performs no native calls");
            });
            Test("dormant controller never creates or assigns", delegate {
                var f = new Fixture(); f.Controller.Tick(); Check(f.Api.Calls == 0 && f.Api.Assignments == 0, "dormant native isolation");
            });
            Test("spawn waits for durable intent", delegate {
                var f = new Fixture(); f.Controller.RequestSpawn(); f.Controller.Tick(); Check(f.Api.Preparations == 0, "no creation before intent flush");
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Spawned == 2 && f.Api.Assignments == 0, "independent pair only");
                Refused(f.Controller.RequestSpawn);
            });
            Test("model polling has finite deadline", delegate {
                var f = new Fixture(); f.Api.Loaded = false; f.Controller.RequestSpawn(); f.Journal.Flush(); f.Controller.Tick();
                Check(f.Api.Preparations == 1 && f.Api.Spawned == 0, "nonblocking model request"); f.Now += 5000; f.Controller.Tick();
                Check(f.Controller.Finished && f.Api.Spawned == 0, "model wait bounded");
            });
            Test("assignment has confirmation and journal barriers", delegate {
                var f = new Fixture(); f.Pair(); Refused(delegate { f.Controller.RequestAssignment("ra_gapriv01_bati"); });
                f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); f.Controller.Tick(); Check(f.Api.Assignments == 0, "not flushed");
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Assignments == 1 && f.Api.AssignedHandle == 1, "A only");
                Refused(delegate { f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); }); f.Controller.Tick(); Check(f.Api.Assignments == 1, "no repeat");
                Check(f.Journal.Lines.Any(x => x.Contains("profile-resolution=UNVERIFIED")), "invocation is not effective identity");
            });
            Test("control remains unchanged by assignment", delegate {
                var f = new Fixture(); f.Pair(); int controlToken = f.Api.Live[2]; f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A");
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Live[2] == controlToken && f.Api.AssignedHandle != 2, "control isolation");
            });
            Test("control movement during journal wait cancels", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); f.Api.MovingB = true;
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Controller.Finished && f.Api.Assignments == 0, "final pair check");
            });
            Test("reused handle cannot inherit assignment or cleanup", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); f.Api.Live[1] = 999;
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Assignments == 0 && !f.Api.Deleted.Contains(1), "stale instance untouched");
                Check(!f.Controller.CleanupComplete, "identity loss is unresolved cleanup");
            });
            Test("control identity loss blocks A dispatch", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); f.Api.Live[2] = 888;
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Assignments == 0 && !f.Api.Deleted.Contains(2), "control lifetime lost");
            });
            Test("partial assignment exception is consumed", delegate {
                var f = new Fixture(); f.Pair(); f.Api.ThrowAssignment = true; f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A");
                f.Journal.Flush(); f.Controller.Tick(); Check(f.Api.Assignments == 1 && f.Controller.AssignmentAttempted && f.Controller.Finished, "exception consumed");
                Refused(delegate { f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); }); Check(f.Api.Assignments == 1, "no fallback or retry");
            });
            Test("evidence failure retires normal pair", delegate {
                var f = new Fixture(); f.Pair(); f.Journal.Health = false; f.Controller.Tick();
                Check(f.Controller.Finished && f.Controller.CleanupComplete && f.Api.Assignments == 0, "fail closed cleanup");
            });
            Test("partial spawn cleans established A", delegate {
                var f = new Fixture(); f.Api.FailB = true; f.Controller.RequestSpawn(); f.Journal.Flush(); f.Controller.Tick();
                Check(f.Controller.Finished && f.Api.Deleted.SequenceEqual(new[] { 1 }), "partial pair cleanup");
            });
            Test("normal stop is retryable after dismount", delegate {
                var f = new Fixture(); f.Pair(); f.Api.MovingA = true; f.Controller.Stop("manual");
                Check(!f.Controller.CleanupComplete && !f.Api.Deleted.Contains(1), "moving target retained");
                f.Api.MovingA = false; f.Controller.Stop("manual-retry"); Check(f.Controller.CleanupComplete, "second explicit stop cleanup");
            });
            Test("scope loss does not call retirement natives", delegate {
                var f = new Fixture(); f.Pair(); f.Api.Story = false; f.Controller.Tick();
                Check(f.Controller.Finished && !f.Controller.CleanupComplete && f.Api.Deleted.Count == 0, "online/loading no mutation");
            });
            Test("absolute experiment bound", delegate {
                var f = new Fixture(); f.Pair(); f.Now += 180000; f.Controller.Tick(); Check(f.Controller.Finished && f.Controller.CleanupComplete, "3 minute stop");
            });
            Test("abort never accesses game API", delegate {
                var f = new Fixture(); f.Pair(); int before = f.Api.Calls; f.Controller.Aborted();
                Check(f.Api.Calls == before && f.Controller.Finished && !f.Controller.CleanupComplete, "abort no natives or restoration claim");
            });
            Test("missing lifetime already absent", delegate {
                var f = new Fixture(); f.Pair(); f.Api.Live.Remove(1); f.Controller.Stop("manual"); Check(f.Controller.CleanupComplete, "already absent accepted without mutation");
            });
            Test("API constructs original hash, target handle, fixed private name", delegate {
                var calls = new List<Tuple<ulong, object[]>>();
                GTA.Native.Function.Handler = delegate(ulong hash, object[] args) {
                    calls.Add(Tuple.Create(hash, args));
                    switch ((GTA.Native.Hash)hash) {
                        case GTA.Native.Hash.PLAYER_ID: return 1;
                        case GTA.Native.Hash.PLAYER_PED_ID: return 10;
                        case GTA.Native.Hash.GET_ENTITY_MODEL: return 0xF9300CC5u;
                        case GTA.Native.Hash.DECOR_GET_INT: return 77;
                        case GTA.Native.Hash.GET_ENTITY_SPEED: return 0f;
                        case GTA.Native.Hash.GET_PED_IN_VEHICLE_SEAT: return 0;
                        case GTA.Native.Hash.DOES_ENTITY_EXIST:
                        case GTA.Native.Hash.IS_PLAYER_PLAYING:
                        case GTA.Native.Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT:
                        case GTA.Native.Hash.DECOR_EXIST_ON:
                        case GTA.Native.Hash.IS_VEHICLE_DRIVEABLE: return true;
                        default: return false;
                    }
                };
                var api = new ShvdneProfileApi(delegate { return true; }); api.AssignPrivateProfile(new ProbeLifetime { Handle = 123, Token = 77, Role = "A" });
                var assignment = calls.Single(x => x.Item1 == 0x4F0C413926060B38UL);
                Check(assignment.Item2.Length == 2 && (int)assignment.Item2[0] == 123 && (string)assignment.Item2[1] == "ra_gapriv01_bati", "native argument contract");
                Refused(delegate { api.AssignPrivateProfile(new ProbeLifetime { Handle = 123, Token = 77, Role = "B" }); });
                var revoked = new ShvdneProfileApi(delegate { return false; });
                Refused(delegate { revoked.AssignPrivateProfile(new ProbeLifetime { Handle = 123, Token = 77, Role = "A" }); });
                Check(calls.Count(x => x.Item1 == 0x4F0C413926060B38UL) == 1, "control and revoked supervisor cannot dispatch");
                int before = calls.Count; Exception fault = null;
                var thread = new Thread(delegate() { try { api.ReleaseModel(); } catch (Exception e) { fault = e; } }); thread.Start(); thread.Join();
                Check(fault is InvalidOperationException && calls.Count == before, "worker cannot invoke game natives");
            });
            Test("missing admission or supervisor refuses before game observation", delegate {
                var f = new Fixture(); f.Guard.Live = false; Refused(f.Controller.RequestSpawn);
                Check(f.Api.Calls == 0 && !f.Guard.Claimed, "no game calls without independent admission");
            });
            Test("supervisor loss across durable acknowledgement cancels dispatch", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A");
                f.Journal.Flush(); f.Guard.Live = false; f.Controller.Tick();
                Check(f.Api.Assignments == 0 && f.Controller.CleanupComplete && f.Guard.Retired, "fail closed with normal retirement");
            });
            Test("external activation lease survives a new controller", delegate {
                var f = new Fixture(); f.Pair();
                var reloaded = new ProfileAssignmentController(f.Api, f.Journal, delegate { return f.Now; }, 1000, delegate { return 100; }, f.Guard);
                Refused(reloaded.RequestSpawn); Check(f.Api.Spawned == 2, "reload never grants another pair");
            });
            Test("assignment acknowledgement timeout stops without dispatch", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.RequestAssignment("ASSIGN_PRIVATE_TO_A");
                f.Now += 2000; f.Controller.Tick();
                Check(f.Api.Assignments == 0 && f.Controller.Finished && f.Guard.Stop && f.Controller.CleanupComplete, "unacknowledged intent cannot hang experiment");
            });
            Test("normal retirement is separate from resource unloading", delegate {
                var f = new Fixture(); f.Pair(); f.Controller.Stop("manual");
                Check(f.Guard.Stop && f.Guard.Acknowledged && f.Guard.Retired && f.Controller.CleanupComplete, "stop and vehicle-only completion reported");
                Check(f.Api.Assignments == 0, "no prior-profile restoration native");
            });
            Test("disk admission missing tampered duplicate and escaped resource rejection", delegate {
                string root = Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), "admission-fixture");
                Directory.CreateDirectory(root); string path = Path.Combine(root, "authored.bin"); File.WriteAllBytes(path, new byte[] { 1, 2, 3, 4 });
                string hash; using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(path))).Replace("-", "").ToLowerInvariant();
                var good = new ResourcePin("authored.bin", hash);
                Check(PrivateResourceAdmission.Verify(root, new[] { good }), "exact disk resource");
                Check(!PrivateResourceAdmission.Verify(root, new[] { new ResourcePin("missing.bin", hash) }), "missing resource");
                Check(!PrivateResourceAdmission.Verify(root, new[] { good, good }), "duplicate destination");
                Check(!PrivateResourceAdmission.Verify(root, new[] { new ResourcePin("../authored.bin", hash) }), "path escape");
                Check(!PrivateResourceAdmission.Verify(root, new[] { new ResourcePin(path, hash) }), "absolute path");
                Check(!PrivateResourceAdmission.Verify(root, new ResourcePin[0]), "empty evidence");
                File.WriteAllBytes(path, new byte[] { 4, 3, 2, 1 });
                Check(!PrivateResourceAdmission.Verify(root, new[] { good }), "changed resource");
            });
            Console.WriteLine("PASS cases=" + cases + " assertions=" + checks + "; authored offline fixtures, not runtime qualification");
            return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}

namespace RichAudio.GateA.Private01
{
    internal static class PrivateCandidateBinding
    {
        internal static readonly bool Admitted = false;
        internal static readonly ResourcePin[] Pins = new ResourcePin[0];
    }
}

// Authored API stand-ins execute the production adapter source without loading GTA/SHVDNE.
namespace GTA
{
    public class Script
    {
        public string Filename { get { return System.IO.Path.Combine(System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), "fixture-disabled.dll"); } }
        public int Interval { get; set; }
        public event EventHandler Tick;
        public event EventHandler Aborted;
        public event System.Windows.Forms.KeyEventHandler KeyDown;
        public event System.Windows.Forms.KeyEventHandler KeyUp;
        public void FixtureTick() { if (Tick != null) Tick(this, EventArgs.Empty); }
        public void FixtureAbort() { if (Aborted != null) Aborted(this, EventArgs.Empty); }
        public void FixtureKey(System.Windows.Forms.Keys keys) { var e = new System.Windows.Forms.KeyEventArgs(keys); if (KeyDown != null) KeyDown(this, e); if (KeyUp != null) KeyUp(this, e); }
    }
    public static class Game { public static bool IsPaused { get { return false; } } }
}
namespace GTA.Math { public struct Vector3 { public float X, Y, Z; } }
namespace GTA.Native
{
    public enum Hash : ulong
    {
        PLAYER_ID = 1, PLAYER_PED_ID, GET_IS_LOADING_SCREEN_ACTIVE, NETWORK_IS_SESSION_ACTIVE, NETWORK_IS_GAME_IN_PROGRESS,
        IS_PLAYER_SWITCH_IN_PROGRESS, DOES_ENTITY_EXIST, IS_PLAYER_PLAYING, IS_POSITION_OCCUPIED, IS_ENTITY_DEAD,
        GET_VEHICLE_PED_IS_IN, GET_INTERIOR_FROM_ENTITY, GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, GET_ENTITY_HEADING,
        DECOR_IS_REGISTERED_AS_TYPE, DECOR_REGISTER, REQUEST_MODEL, HAS_MODEL_LOADED, CREATE_VEHICLE,
        SET_ENTITY_AS_MISSION_ENTITY, DECOR_SET_INT, GET_ENTITY_MODEL, DOES_ENTITY_BELONG_TO_THIS_SCRIPT, DECOR_EXIST_ON,
        DECOR_GET_INT, GET_ENTITY_SPEED, GET_PED_IN_VEHICLE_SEAT, IS_VEHICLE_DRIVEABLE, GET_VEHICLE_DEFAULT_HORN,
        GET_IS_VEHICLE_ENGINE_RUNNING, DELETE_ENTITY, SET_MODEL_AS_NO_LONGER_NEEDED
    }
    public sealed class OutputArgument : IDisposable { public OutputArgument(object value) { } public void Dispose() { } }
    public static class Function
    {
        public static Func<ulong, object[], object> Handler;
        public static T Call<T>(Hash hash, params object[] args) { return (T)Handler((ulong)hash, args); }
        public static void Call(Hash hash, params object[] args) { Handler((ulong)hash, args); }
    }
}
