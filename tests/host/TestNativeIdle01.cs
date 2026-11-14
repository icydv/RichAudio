using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.IO;
using System.Threading;
using RichAudio.NativeSuppression01;

public static class TestNativeIdle01
{
    sealed class Api : IIdleApi
    {
        internal int Calls, Spawned, Releases;
        internal Action BeforeAssign;
        internal bool Story = true, Loaded = true, Switchable = true, Restorable = true, FailB, FailPrivate, FailRestore;
        internal readonly Dictionary<int, int> Live = new Dictionary<int, int>();
        internal readonly List<Tuple<int, string>> Assigned = new List<Tuple<int, string>>();
        internal readonly List<int> Deleted = new List<int>();
        public bool StoryReady { get { Calls++; return Story; } }
        public void Prepare() { Calls++; }
        public bool ModelReady { get { Calls++; return Loaded; } }
        public Lifetime Spawn(string role, int token)
        {
            Calls++; if (role == "B" && FailB) throw new InvalidOperationException("authored B creation failure");
            int handle = ++Spawned; Live.Add(handle, token); return new Lifetime { Handle = handle, Token = token, Role = role };
        }
        public bool Matches(Lifetime item) { Calls++; return Live.ContainsKey(item.Handle) && Live[item.Handle] == item.Token; }
        public bool CanSwitch(Lifetime target, Lifetime control) { Calls++; return Switchable && Restorable; }
        public bool CanRestore(Lifetime target) { Calls++; return Restorable; }
        public void Assign(Lifetime item, string profile, Func<bool> stillAdmitted)
        {
            Calls++; if (BeforeAssign != null) BeforeAssign();
            if (!stillAdmitted()) throw new InvalidOperationException("authored final admission rejection");
            Assigned.Add(Tuple.Create(item.Handle, profile));
            if (profile == "BATI" ? FailRestore : FailPrivate) throw new InvalidOperationException("authored void native failure");
        }
        public bool Delete(Lifetime item) { Calls++; if (!Restorable) return false; Deleted.Add(item.Handle); Live.Remove(item.Handle); return true; }
        public void ReleaseModel() { Calls++; Releases++; }
        public string Snapshot(Lifetime item) { Calls++; return "fixture only; effective profile UNKNOWN"; }
    }
    sealed class Fixture
    {
        internal readonly Api Api = new Api();
        internal readonly List<string> Log = new List<string>();
        internal readonly IdleExperiment Experiment;
        internal long Now = 1000;
        internal bool Healthy = true;
        internal Action<string> OnLog;
        int token = 50;
        internal Fixture() { Experiment = new IdleExperiment(Api, delegate(string line) { Log.Add(line); if (OnLog != null) OnLog(line); }, delegate { return Now; }, 1000, delegate { return ++token; }, delegate { return Healthy; }); }
        internal void Pair() { Experiment.Spawn(); Experiment.Tick(); Check(Experiment.Active, "exact pair ready"); }
        internal void Step() { Experiment.Arm(); Experiment.Apply(); }
    }
    sealed class NativeWorld
    {
        internal readonly List<Tuple<ulong, object[]>> Calls = new List<Tuple<ulong, object[]>>();
        internal readonly Dictionary<int, int> Tokens = new Dictionary<int, int> { { 123, 77 }, { 124, 78 } };
        internal int Driver = 10, Passenger, NextHandle = 200, LastVehicle, Interior, ConflictingDecoratorType;
        internal float Speed;
        internal bool Online, Dead, InVehicle, Driveable = true, Belongs = true, Engine = true, ControlEngine = true, Loaded = true, DecorRegistered = true, DecorSet = true;
        internal uint Model = 0xF9300CC5u;
        internal Action<ulong, object[]> BeforeNative;
        internal Action RegisterDecorator;
        internal NativeWorld() { GTA.Native.Function.Handler = Call; GTA.Game.IsPaused = false; }
        internal object Call(ulong hash, object[] args)
        {
            Calls.Add(Tuple.Create(hash, args));
            if (hash == (ulong)GTA.Native.Hash.SET_VEHICLE_ENGINE_ON) throw new Exception("Engine state setter is not audio suppression");
            if (BeforeNative != null) BeforeNative(hash, args);
            switch ((GTA.Native.Hash)hash)
            {
                case GTA.Native.Hash.PLAYER_ID: return 1;
                case GTA.Native.Hash.PLAYER_PED_ID: return 10;
                case GTA.Native.Hash.NETWORK_IS_SESSION_ACTIVE: return Online;
                case GTA.Native.Hash.DOES_ENTITY_EXIST: return (int)args[0] == 10 || Tokens.ContainsKey((int)args[0]);
                case GTA.Native.Hash.IS_PLAYER_PLAYING: return true;
                case GTA.Native.Hash.GET_ENTITY_MODEL: return Model;
                case GTA.Native.Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT: return Belongs;
                case GTA.Native.Hash.DECOR_EXIST_ON: return Tokens.ContainsKey((int)args[0]);
                case GTA.Native.Hash.DECOR_GET_INT: return Tokens[(int)args[0]];
                case GTA.Native.Hash.GET_ENTITY_SPEED: return Speed;
                case GTA.Native.Hash.GET_PED_IN_VEHICLE_SEAT: return (int)args[0] == 123 ? ((int)args[1] == -1 ? Driver : Passenger) : 0;
                case GTA.Native.Hash.IS_ENTITY_DEAD: return Dead;
                case GTA.Native.Hash.IS_VEHICLE_DRIVEABLE: return Driveable;
                case GTA.Native.Hash.GET_IS_VEHICLE_ENGINE_RUNNING: return (int)args[0] == 124 ? ControlEngine : Engine;
                case GTA.Native.Hash.GET_VEHICLE_DEFAULT_HORN: return 123u;
                case GTA.Native.Hash.GET_VEHICLE_PED_IS_IN: return LastVehicle;
                case GTA.Native.Hash.IS_PED_IN_ANY_VEHICLE: return InVehicle;
                case GTA.Native.Hash.GET_INTERIOR_FROM_ENTITY: return Interior;
                case GTA.Native.Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS: return new GTA.Math.Vector3 { X = (float)args[1], Y = (float)args[2], Z = (float)args[3] };
                case GTA.Native.Hash.GET_ENTITY_HEADING: return 90f;
                case GTA.Native.Hash.DECOR_IS_REGISTERED_AS_TYPE: return (int)args[1] == 3 ? DecorRegistered : (int)args[1] == ConflictingDecoratorType;
                case GTA.Native.Hash.DECOR_REGISTER: if (RegisterDecorator != null) RegisterDecorator(); return false;
                case GTA.Native.Hash.HAS_MODEL_LOADED: return Loaded;
                case GTA.Native.Hash.CREATE_VEHICLE: Tokens[++NextHandle] = -1; return NextHandle;
                case GTA.Native.Hash.DECOR_SET_INT: if (DecorSet) Tokens[(int)args[0]] = (int)args[2]; return DecorSet;
                case GTA.Native.Hash.DELETE_ENTITY: Tokens.Remove((int)((GTA.Native.OutputArgument)args[0]).Value); return false;
                default: return false;
            }
        }
        internal IEnumerable<Tuple<ulong, object[]>> Assignments { get { return Calls.Where(x => x.Item1 == 0x4F0C413926060B38UL); } }
    }
    sealed class DecoratorLock : IIdleDecoratorLock
    {
        internal bool Value = true, Available = true, IgnoreUnlock, ThrowUnlock, IgnoreRestore, ThrowRestore;
        internal int Validations, Reads, Writes;
        public void Validate() { Validations++; if (!Available) throw new InvalidOperationException("fixture binding unavailable"); }
        public bool Locked
        {
            get { Reads++; return Value; }
            set
            {
                Writes++;
                if (value)
                {
                    if (ThrowRestore) throw new InvalidOperationException("fixture restore failed");
                    if (!IgnoreRestore) Value = true;
                }
                else
                {
                    if (!IgnoreUnlock) Value = false;
                    if (ThrowUnlock) throw new InvalidOperationException("fixture unlock failed after mutation");
                }
            }
        }
    }
    // Authored pointer values only; no pointed-to memory is read or written.
    sealed unsafe class PointerFixture
    {
        private static byte* value;
        internal static FieldInfo Field(ulong address)
        { value = (byte*)address; return typeof(PointerFixture).GetField("value", BindingFlags.NonPublic | BindingFlags.Static); }
        internal static ulong Address { get { return (ulong)value; } }
    }
    static string PeFixture(uint flags, uint size)
    {
        string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "authored-pe-" + Guid.NewGuid().ToString("N") + ".bin");
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write))
        using (var writer = new BinaryWriter(stream))
        {
            stream.SetLength(512); writer.Write((ushort)0x5a4d); stream.Position = 0x3c; writer.Write(64);
            stream.Position = 64; writer.Write(0x4550u); writer.Write((ushort)0x8664); writer.Write((ushort)1);
            stream.Position = 84; writer.Write((ushort)112); stream.Position = 88; writer.Write((ushort)0x20b);
            stream.Position = 144; writer.Write(4096u); stream.Position = 200;
            writer.Write(new byte[] { 46, 100, 97, 116, 97, 0, 0, 0 }); writer.Write(size); writer.Write(1024u);
            stream.Position = 236; writer.Write(flags);
        }
        return path;
    }
    static int checks, cases;
    static void Check(bool value, string name) { checks++; if (!value) throw new Exception(name); }
    static void Refused(Action operation) { bool refused = false; try { operation(); } catch (InvalidOperationException) { refused = true; } Check(refused, "expected explicit refusal"); }
    static void Test(string name, Action operation) { operation(); cases++; Console.WriteLine("PASS " + name); }
    static Lifetime A() { return new Lifetime { Handle = 123, Token = 77, Role = "A" }; }
    static Lifetime B() { return new Lifetime { Handle = 124, Token = 78, Role = "B" }; }
    public static int Main()
    {
        try
        {
            Test("dormant controller has no native work or automatic assignment", delegate {
                var f = new Fixture(); f.Experiment.Tick(); Check(f.Api.Calls == 0 && f.Api.Assigned.Count == 0, "dormant");
                f.Pair(); f.Experiment.Tick(); f.Experiment.Snapshot(); Check(f.Api.Spawned == 2 && f.Api.Assigned.Count == 0, "stock baseline before manual commands");
                Refused(f.Experiment.Spawn);
            });
            Test("matched six-phase sequence restores the same surviving A", delegate {
                var f = new Fixture(); f.Pair(); int originalA = f.Api.Live[1], originalB = f.Api.Live[2];
                foreach (string expected in IdleExperiment.Profiles) { Check(f.Experiment.Next == expected, "next profile"); f.Step(); }
                Check(f.Api.Assigned.Select(x => x.Item2).SequenceEqual(new[] { "ra_ns01_bati_a", "ra_ns01_bati_b", "ra_ns01_bati_c", "ra_ns01_bati_b", "ra_ns01_bati_a", "BATI" }), "fixed preservation/marker/silent/reversal sequence");
                Check(f.Api.Assigned.All(x => x.Item1 == 1) && f.Api.Live[1] == originalA && f.Api.Live[2] == originalB, "same A, untouched B");
                Check(f.Experiment.RestoreReturned && !f.Experiment.Active && f.Api.Deleted.Count == 0, "native return distinct from vehicle deletion");
                Refused(f.Experiment.Arm); Refused(f.Experiment.Apply); f.Experiment.Tick(); Check(f.Api.Assigned.Count == 6, "no automatic repeat");
                f.Experiment.Cleanup(); Check(f.Experiment.CleanupComplete && f.Api.Deleted.SequenceEqual(new[] { 1, 2 }), "explicit later cleanup");
            });
            Test("arming never applies and expires without assignment", delegate {
                var f = new Fixture(); f.Pair(); Refused(f.Experiment.Apply); f.Experiment.Arm(); Check(f.Api.Assigned.Count == 0, "manual apply remains required");
                f.Now += 10000; f.Experiment.Tick(); Refused(f.Experiment.Apply); Check(f.Api.Assigned.Count == 0, "expired arm does not dispatch");
                f.Step(); Check(f.Api.Assigned.Count == 1, "new explicit arm and apply");
            });
            Test("operating context is checked again immediately before dispatch", delegate {
                var f = new Fixture(); f.Pair(); f.Experiment.Arm(); f.Api.Switchable = false;
                Refused(f.Experiment.Apply); Check(f.Api.Assigned.Count == 0, "moving or occupied control blocks assignment");
            });
            Test("deadline crossed in adapter admission withholds private profile but allows release", delegate {
                var f = new Fixture(); f.Pair(); f.Experiment.Arm();
                f.Api.BeforeAssign = delegate { f.Api.BeforeAssign = null; f.Now += 10000; };
                Refused(f.Experiment.Apply);
                Check(f.Api.Assigned.Count == 1 && f.Api.Assigned[0].Item2 == "BATI" && f.Experiment.RestoreReturned, "expired intervention withheld, narrow release remains available");
            });
            Test("journal failure after intent withholds intervention but allows release", delegate {
                var f = new Fixture(); f.Pair(); f.Experiment.Arm();
                f.OnLog = delegate(string line) { if (line.StartsWith("assignment-intent")) f.Healthy = false; };
                Refused(f.Experiment.Apply);
                Check(f.Api.Assigned.Count == 1 && f.Api.Assigned[0].Item2 == "BATI" && f.Experiment.RestoreReturned, "failed journal cannot authorize private dispatch or prevent baseline release");
            });
            Test("final phase rejection does not consume a restoration that never dispatched", delegate {
                var f = new Fixture(); f.Pair(); for (int i = 0; i < 5; i++) f.Step(); f.Experiment.Arm();
                f.OnLog = delegate(string line) { if (line.StartsWith("assignment-intent")) f.Healthy = false; };
                Refused(f.Experiment.Apply);
                Check(f.Api.Assigned.Count == 6 && f.Api.Assigned.Last().Item2 == "BATI" && f.Experiment.RestoreReturned, "one actual BATI release after final admission rejection");
                f.Experiment.Stop("again"); Check(f.Api.Assigned.Count == 6, "no second restoration after native return");
            });
            Test("reused target handle never receives assignment or stale restoration", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Api.Live[1] = 999; f.Experiment.Tick();
                Check(f.Api.Assigned.Count == 1 && !f.Experiment.RestoreReturned && !f.Experiment.Active, "lost generation cannot restore");
                f.Api.Live[1] = 51; f.Experiment.Stop("fixture identity reappeared");
                Check(f.Api.Assigned.Count == 1, "lost lifetime never reacquired"); Refused(f.Experiment.Cleanup); Check(f.Api.Deleted.Count == 0, "unresolved restoration not hidden by deletion");
            });
            Test("lost control releases surviving A without touching reused B", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Api.Live[2] = 999; f.Experiment.Tick();
                Check(f.Api.Assigned.Count == 2 && f.Api.Assigned[1].Item1 == 1 && f.Api.Assigned[1].Item2 == "BATI", "A-only release after control loss");
                f.Experiment.Cleanup(); Check(!f.Experiment.CleanupComplete && f.Api.Deleted.SequenceEqual(new[] { 1 }), "reused B preserved");
            });
            Test("partial assignment exception consumes the phase and attempts baseline once", delegate {
                var f = new Fixture(); f.Pair(); f.Api.FailPrivate = true; f.Experiment.Arm(); Refused(f.Experiment.Apply);
                Check(f.Api.Assigned.Select(x => x.Item2).SequenceEqual(new[] { "ra_ns01_bati_a", "BATI" }) && f.Experiment.RestoreReturned, "ambiguous private dispatch gets one baseline release");
                Refused(f.Experiment.Arm); f.Experiment.Stop("again"); Check(f.Api.Assigned.Count == 2, "no private retry or repeated restoration");
            });
            Test("throwing restoration never repeats or counts as restored", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Api.FailRestore = true; f.Experiment.Stop("manual"); f.Experiment.Stop("again");
                Check(f.Api.Assigned.Count == 2 && !f.Experiment.RestoreReturned, "one ambiguous restoration");
                Refused(f.Experiment.Cleanup); Check(f.Api.Assigned.Count == 2 && f.Api.Deleted.Count == 0, "no deletion as false restoration");
            });
            Test("unsafe release waits for another explicit command", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Api.Restorable = false; f.Experiment.Stop("manual");
                Check(f.Api.Assigned.Count == 1 && !f.Experiment.Active, "no moving release"); f.Api.Restorable = true; f.Experiment.Tick(); Check(f.Api.Assigned.Count == 1, "stopped tick does not silently retry");
                f.Experiment.Stop("safe manual release"); Check(f.Experiment.RestoreReturned && f.Api.Assigned.Count == 2, "explicit safe release");
            });
            Test("expiry ends intervention and requests known baseline", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Now += 600000; f.Experiment.Tick();
                Check(!f.Experiment.Active && f.Experiment.RestoreReturned && f.Api.Assigned.Last().Item2 == "BATI", "ten-minute bound");
                Refused(f.Experiment.Spawn); Refused(f.Experiment.Arm);
            });
            Test("Story scope loss cannot mutate audio until explicit safe release", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); f.Api.Story = false; f.Experiment.Tick(); Check(f.Api.Assigned.Count == 1 && !f.Experiment.RestoreReturned, "scope loss blocks restoration native");
                f.Api.Story = true; f.Experiment.Tick(); Check(f.Api.Assigned.Count == 1, "no automatic resume"); f.Experiment.Stop("safe manual release"); Check(f.Experiment.RestoreReturned, "known A release after scope returns");
            });
            Test("abort and later calls never invoke game API", delegate {
                var f = new Fixture(); f.Pair(); f.Step(); int before = f.Api.Calls;
                f.Experiment.Abort(); f.Experiment.Tick(); f.Experiment.Snapshot(); f.Experiment.Stop("after abort"); f.Experiment.Cleanup();
                Check(f.Api.Calls == before && !f.Experiment.RestoreReturned && !f.Experiment.Active, "no domain-thread native calls or recovery claim");
            });
            Test("thread abort inside assignment does not enter native recovery", delegate {
                var f = new Fixture(); f.Pair(); f.Experiment.Arm(); int callsAtAbort = -1;
                f.Api.BeforeAssign = delegate { f.Api.BeforeAssign = null; callsAtAbort = f.Api.Calls; Thread.CurrentThread.Abort(); };
                var worker = new Thread(delegate() { try { f.Experiment.Apply(); } catch (ThreadAbortException) { } }); worker.Start();
                Check(worker.Join(5000), "owned aborted fixture thread closed");
                Check(callsAtAbort > 0 && f.Api.Calls == callsAtAbort && f.Api.Assigned.Count == 0, "no game API calls in ThreadAbort recovery catch");
                f.Experiment.Abort(); Check(!f.Experiment.RestoreReturned && !f.Experiment.Active, "abort callback claims no native restoration");
            });
            Test("model wait is bounded and never creates an unready pair", delegate {
                var f = new Fixture(); f.Api.Loaded = false; f.Experiment.Spawn(); f.Experiment.Tick(); Check(f.Api.Spawned == 0, "nonblocking model poll");
                f.Now += 5000; f.Experiment.Tick(); Check(f.Api.Spawned == 0 && f.Api.Releases == 1 && !f.Experiment.Active, "bounded model wait");
            });
            Test("partial pair stays known and only explicit cleanup removes A", delegate {
                var f = new Fixture(); f.Api.FailB = true; f.Experiment.Spawn(); Refused(f.Experiment.Tick);
                Check(f.Api.Assigned.Count == 0 && f.Api.Live.Count == 1, "no private assignment after partial spawn"); f.Experiment.Cleanup(); Check(f.Experiment.CleanupComplete && f.Api.Deleted.SequenceEqual(new[] { 1 }), "known partial A cleanup");
            });
            Test("adapter sends actual profile native hash and A arguments only", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi();
                foreach (string profile in IdleExperiment.Profiles) api.Assign(A(), profile, delegate { return true; });
                Check(w.Assignments.Count() == 6 && w.Assignments.All(x => x.Item2.Length == 2 && (int)x.Item2[0] == 123), "actual fixed hash with same A handle");
                Check(w.Assignments.Select(x => (string)x.Item2[1]).SequenceEqual(IdleExperiment.Profiles), "fixed resource/profile arguments");
                Refused(delegate { api.Assign(B(), "ra_ns01_bati_b", delegate { return true; }); }); Refused(delegate { api.Assign(A(), "ADDER", delegate { return true; }); });
                Check(w.Assignments.Count() == 6, "role and whitelist block unrelated assignment");
            });
            Test("adapter rejects stale generation, foreign owner, model and unsafe state", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi();
                Action apply = delegate { api.Assign(A(), "ra_ns01_bati_c", delegate { return true; }); };
                w.Tokens[123] = 999; Refused(apply); w.Tokens[123] = 77;
                w.Belongs = false; Refused(apply); w.Belongs = true;
                w.Model = 1; Refused(apply); w.Model = 0xF9300CC5u;
                w.Speed = .15f; Refused(apply); w.Speed = Single.NaN; Refused(apply); w.Speed = 0;
                w.Driver = 99; Refused(apply); w.Driver = 10;
                w.Passenger = 99; Refused(apply); w.Passenger = 0;
                w.Dead = true; Refused(apply); w.Dead = false;
                w.Driveable = false; Refused(apply); w.Driveable = true;
                w.Online = true; Refused(apply); w.Online = false;
                GTA.Game.IsPaused = true; Refused(apply); GTA.Game.IsPaused = false;
                Check(!w.Assignments.Any(), "all unsafe targets preserve native path");
            });
            Test("adapter distinguishes player idle activation from safe baseline restoration", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi(); Check(api.CanSwitch(A(), B()), "player idling A and empty B");
                w.Engine = false; Check(!api.CanSwitch(A(), B()), "engine must be running for branch observation"); w.Engine = true;
                w.ControlEngine = false; Check(!api.CanSwitch(A(), B()), "inactive B cannot establish engine collateral isolation"); w.ControlEngine = true;
                w.Driver = 0; Check(!api.CanSwitch(A(), B()) && api.CanRestore(A()), "empty A restoration allowed, player branch test not admitted");
                Refused(delegate { api.Assign(new Lifetime { Handle = 123, Token = 77, Role = "B" }, "BATI", delegate { return true; }); });
            });
            Test("worker-thread native calls are rejected before dispatch", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi(); int before = w.Calls.Count; Exception fault = null;
                var worker = new Thread(delegate() { try { api.Assign(A(), "ra_ns01_bati_c", delegate { return true; }); } catch (Exception e) { fault = e; } }); worker.Start(); worker.Join();
                Check(fault is InvalidOperationException && w.Calls.Count == before, "wrong thread never dispatches native");
            });
            Test("actual adapter evaluates last admission after native context reads", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi(); long now = 0, deadline = 100;
                w.BeforeNative = delegate(ulong hash, object[] args) { if (hash == (ulong)GTA.Native.Hash.IS_VEHICLE_DRIVEABLE) now = deadline; };
                Refused(delegate { api.Assign(A(), "ra_ns01_bati_c", delegate { return now < deadline; }); });
                Check(!w.Assignments.Any(), "expiry during native reads cannot reach setter");
                w.BeforeNative = null; bool allowed = false;
                Refused(delegate { api.Assign(A(), "ra_ns01_bati_c", delegate { return allowed; }); });
                Refused(delegate { api.Assign(A(), "ra_ns01_bati_c", null); });
                Check(!w.Assignments.Any(), "revoked or missing admission cannot reach setter");
                int atGuard = 0; api.Assign(A(), "BATI", delegate { atGuard = w.Calls.Count; return true; });
                Check(w.Calls.Count == atGuard + 1 && w.Calls.Last().Item1 == 0x4F0C413926060B38UL, "guard is immediately before actual native dispatch");
            });
            Test("on-foot preparation ignores a stale last vehicle", delegate {
                var w = new NativeWorld(); w.LastVehicle = 456; var api = new IdleNativeApi(); api.Prepare();
                Check(w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL), "on-foot player may prepare after dismounting");
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.GET_VEHICLE_PED_IS_IN), "last vehicle is not used as current occupancy");
                var occupancy = w.Calls.Single(x => x.Item1 == (ulong)GTA.Native.Hash.IS_PED_IN_ANY_VEHICLE);
                Check((int)occupancy.Item2[0] == 10 && !(bool)occupancy.Item2[1], "current player occupancy query preserves false flag");
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE) && !w.Assignments.Any(), "preparation does not create or assign vehicles");
            });
            foreach (string condition in new[] { "dead", "inVehicle", "interior" })
            {
                Test("spawn refusal identifies " + condition + " before model request", delegate {
                    var w = new NativeWorld();
                    w.Dead = condition == "dead"; w.InVehicle = condition == "inVehicle"; w.Interior = condition == "interior" ? 42 : 0;
                    var api = new IdleNativeApi(); string message = null;
                    try { api.Prepare(); } catch (InvalidOperationException error) { message = error.Message; }
                    string expected = condition + (condition == "interior" ? "=42" : "=true");
                    Check(message != null && message.Contains(expected), "rejection includes the failing predicate and value");
                    Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL || x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE) && !w.Assignments.Any(), "unsafe preparation cannot request model, create or assign");
                });
            }
            Test("actual adapter preparation failure stops the controller without retry", delegate {
                var w = new NativeWorld(); w.InVehicle = true; var api = new IdleNativeApi();
                var experiment = new IdleExperiment(api, delegate(string line) { }, delegate { return 1000L; }, 1000, delegate { return 91; }, delegate { return true; });
                Refused(experiment.Spawn); w.InVehicle = false;
                experiment.Tick(); Refused(experiment.Spawn); Refused(experiment.Arm); Refused(experiment.Apply);
                Check(!experiment.Active && experiment.Status == "STOP: spawn preparation failed", "failure remains stopped after context recovers");
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL || x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE) && !w.Assignments.Any(), "no implicit retry or audio assignment after refusal");
            });
            Test("adapter creates only Bati with separate decorators and never assigns at spawn", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi(); api.Prepare(); var a = api.Spawn("A", 91); var b = api.Spawn("B", 92);
                Check(a.Handle != b.Handle && api.Matches(a) && api.Matches(b), "distinct owned lifetimes");
                var creates = w.Calls.Where(x => x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE).ToArray();
                Check(creates.Length == 2 && creates.All(x => (uint)x.Item2[0] == 0xF9300CC5u && !(bool)x.Item2[5] && !(bool)x.Item2[6] && !(bool)x.Item2[7]), "stock non-network Bati arguments");
                Check(!w.Assignments.Any(), "spawn has native baseline only");
                Check(api.Delete(a) && api.Delete(b), "empty owned disposable cleanup");
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.SET_VEHICLE_ENGINE_ON), "no engine state setter used as suppression or control activation");
            });
            Test("failed decorator registration blocks creation", delegate {
                var w = new NativeWorld(); w.DecorRegistered = false; var api = new IdleNativeApi(); Refused(api.Prepare);
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE || x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL), "no model request or creation after ownership failure");
            });
            foreach (bool initiallyLocked in new[] { true, false })
            {
                Test("decorator registration restores initial lock " + initiallyLocked, delegate {
                    var w = new NativeWorld(); w.DecorRegistered = false; var binding = new DecoratorLock { Value = initiallyLocked };
                    w.RegisterDecorator = delegate { Check(!binding.Value, "registration occurs while unlocked"); w.DecorRegistered = true; };
                    string observation = null;
                    var api = new IdleNativeApi(binding, delegate(string line) { Check(binding.Value == initiallyLocked, "journal runs after prior lock restoration"); observation = line; });
                    api.Prepare();
                    Check(binding.Validations == 1 && binding.Value == initiallyLocked, "binding checked and prior state restored");
                    Check(observation != null && observation.Contains("finalInt=True") && observation.Contains("lockRestored=True"), "bounded registration observation");
                    Check(w.Calls.Count(x => x.Item1 == (ulong)GTA.Native.Hash.DECOR_REGISTER) == 1 && w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL), "one registration before model request");
                });
            }
            Test("existing integer decorator does not inspect or change lock", delegate {
                var w = new NativeWorld(); var binding = new DecoratorLock { Available = false }; var api = new IdleNativeApi(binding); api.Prepare();
                Check(binding.Validations == 0 && binding.Reads == 0 && binding.Writes == 0, "already registered name needs no pointer or lock access");
                Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.DECOR_REGISTER), "existing registration not repeated");
            });
            foreach (int conflict in new[] { 1, 2, 4, 5 })
            {
                Test("conflicting decorator type " + conflict + " is refused without lock access", delegate {
                    var w = new NativeWorld(); w.DecorRegistered = false; w.ConflictingDecoratorType = conflict; var binding = new DecoratorLock();
                    Refused(new IdleNativeApi(binding).Prepare);
                    Check(binding.Validations == 0 && binding.Reads == 0 && binding.Writes == 0, "conflicting type leaves global lock untouched");
                    Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.DECOR_REGISTER || x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL || x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE) && !w.Assignments.Any(), "conflict blocks all preparation mutations");
                });
            }
            foreach (string failure in new[] { "binding", "registerFalse", "registerThrow", "unlockIgnored", "unlockThrow", "restoreIgnored", "restoreThrow" })
            {
                Test("decorator failure " + failure + " blocks model and vehicle work", delegate {
                    var w = new NativeWorld(); w.DecorRegistered = false; var binding = new DecoratorLock();
                    binding.Available = failure != "binding"; binding.IgnoreUnlock = failure == "unlockIgnored"; binding.ThrowUnlock = failure == "unlockThrow";
                    binding.IgnoreRestore = failure == "restoreIgnored"; binding.ThrowRestore = failure == "restoreThrow";
                    w.RegisterDecorator = delegate {
                        if (failure == "registerThrow") throw new InvalidOperationException("fixture registration failed");
                        if (failure != "registerFalse") w.DecorRegistered = true;
                    };
                    Refused(new IdleNativeApi(binding).Prepare);
                    Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.REQUEST_MODEL || x.Item1 == (ulong)GTA.Native.Hash.CREATE_VEHICLE) && !w.Assignments.Any(), "failure never reaches model, creation or audio");
                    if (failure != "restoreIgnored" && failure != "restoreThrow") Check(binding.Value, "prior locked state retained or restored despite failure");
                    if (failure == "binding") Check(binding.Reads == 0 && binding.Writes == 0, "invalid binding blocks unsafe public lock accessor");
                    if (failure == "unlockIgnored" || failure == "unlockThrow") Check(!w.Calls.Any(x => x.Item1 == (ulong)GTA.Native.Hash.DECOR_REGISTER), "failed unlock blocks registration");
                });
            }
            Test("existing pointer must be nonnull and inside the reviewed data interval", delegate {
                Refused(new IdleDecoratorLock(null, 100, 200).Validate);
                foreach (ulong address in new ulong[] { 0, 99, 200, UInt64.MaxValue })
                {
                    var binding = new IdleDecoratorLock(PointerFixture.Field(address), 100, 200); Refused(binding.Validate);
                    Check(PointerFixture.Address == address, "guard never changes pointer");
                }
                new IdleDecoratorLock(PointerFixture.Field(100), 100, 200).Validate();
                new IdleDecoratorLock(PointerFixture.Field(199), 100, 200).Validate();
                Check(PointerFixture.Address == 199, "valid interval endpoints accepted without dereferencing");
            });
            Test("disk PE guard derives only a writable nonexecuting bounded data section", delegate {
                ulong start, end; string valid = PeFixture(0xc0000040, 512);
                IdleDecoratorLock.ReadDataRange(valid, 10000, 4096, out start, out end);
                Check(start == 11024 && end == 11536, "data interval derived from file and module base");
                Refused(delegate { IdleDecoratorLock.ReadDataRange(valid, 10000, 8192, out start, out end); });
                foreach (uint flags in new uint[] { 0x40000040, 0xe0000040 })
                {
                    string invalid = PeFixture(flags, 512);
                    Refused(delegate { IdleDecoratorLock.ReadDataRange(invalid, 10000, 4096, out start, out end); });
                }
                foreach (uint size in new uint[] { 0, 4096 })
                {
                    string invalid = PeFixture(0xc0000040, size);
                    Refused(delegate { IdleDecoratorLock.ReadDataRange(invalid, 10000, 4096, out start, out end); });
                }
            });
            Test("failed new token is cleaned only within the same spawn callback", delegate {
                var w = new NativeWorld(); var api = new IdleNativeApi(); api.Prepare(); w.DecorSet = false; Refused(delegate { api.Spawn("A", 91); });
                Check(!w.Tokens.ContainsKey(201) && !w.Assignments.Any(), "failed just-created vehicle cleaned without profile assignment");
            });
            Console.WriteLine("PASS cases=" + cases + " assertions=" + checks + "; authored offline fixtures; native dispatch contract only, not GTA or audible qualification"); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}

// Authored stand-ins run the actual adapter source without loading GTA or SHVDNE.
namespace GTA {
    public static class Game { public static bool IsPaused { get; set; } }
    public static class DecoratorInterface {
        public static bool IsLocked { get { throw new Exception("public SDK lock access is forbidden in authored binding tests"); } set { throw new Exception("public SDK lock access is forbidden in authored binding tests"); } }
    }
}
namespace GTA.Math { public struct Vector3 { public float X, Y, Z; } }
namespace GTA.Native
{
    public enum Hash : ulong
    {
        PLAYER_ID = 1, PLAYER_PED_ID, GET_IS_LOADING_SCREEN_ACTIVE, NETWORK_IS_SESSION_ACTIVE, NETWORK_IS_GAME_IN_PROGRESS,
        IS_PLAYER_SWITCH_IN_PROGRESS, DOES_ENTITY_EXIST, IS_PLAYER_PLAYING, IS_POSITION_OCCUPIED, IS_ENTITY_DEAD,
        GET_VEHICLE_PED_IS_IN, IS_PED_IN_ANY_VEHICLE, GET_INTERIOR_FROM_ENTITY, GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, GET_ENTITY_HEADING,
        DECOR_IS_REGISTERED_AS_TYPE, DECOR_REGISTER, REQUEST_MODEL, HAS_MODEL_LOADED, CREATE_VEHICLE,
        SET_ENTITY_AS_MISSION_ENTITY, DECOR_SET_INT, GET_ENTITY_MODEL, DOES_ENTITY_BELONG_TO_THIS_SCRIPT, DECOR_EXIST_ON,
        DECOR_GET_INT, GET_ENTITY_SPEED, GET_PED_IN_VEHICLE_SEAT, IS_VEHICLE_DRIVEABLE, GET_VEHICLE_DEFAULT_HORN,
        GET_IS_VEHICLE_ENGINE_RUNNING, DELETE_ENTITY, SET_MODEL_AS_NO_LONGER_NEEDED,
        SET_VEHICLE_ENGINE_ON = 0x2497C4717C8B881EUL
    }
    public sealed class OutputArgument : IDisposable { public readonly object Value; public OutputArgument(object value) { Value = value; } public void Dispose() { } }
    public static class Function
    {
        public static Func<ulong, object[], object> Handler;
        public static T Call<T>(Hash hash, params object[] args) { return (T)Handler((ulong)hash, args); }
        public static void Call(Hash hash, params object[] args) { Handler((ulong)hash, args); }
    }
}
