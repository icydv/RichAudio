using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;
using RichAudio.GateA.Private01.Supervision;

[assembly:System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8",FrameworkDisplayName=".NET Framework 4.8")]

namespace RichAudio.GateA.Private03
{
    // Separate experimental DLL. Nothing in the normal product loads this type.
    public sealed class GateAPrivate03Script : Script
    {
        readonly ProbeJournal journal;
        readonly HashSet<Keys> down = new HashSet<Keys>();
        ProfileAssignmentController controller;
        long armedUntil;
        volatile bool closing;
        public GateAPrivate03Script()
        {
            Interval = 20;
            journal = new ProbeJournal(Path.GetDirectoryName(Filename));
            Tick += OnTick;
            KeyDown += OnKeyDown;
            KeyUp += delegate(object sender, KeyEventArgs e) { down.Remove(e.KeyCode); };
            Aborted += delegate { closing = true; if (controller != null) controller.Aborted(); journal.Close(); };
        }
        void OnTick(object sender, EventArgs e)
        {
            if (closing) return;
            if (controller == null)
            {
                if (!journal.Enabled || !journal.Healthy) return;
                var api = new ShvdneProfileApi(delegate { return journal.Ready; }, delegate { return controller != null && controller.NativeAssignmentAllowed; });
                controller = new ProfileAssignmentController(api, journal, Stopwatch.GetTimestamp, Stopwatch.Frequency,
                    delegate { return BitConverter.ToInt32(Guid.NewGuid().ToByteArray(), 0) & Int32.MaxValue; }, journal);
                journal.Append("dormant; Ctrl+Shift+F5 spawn, F10 confirm reviewed marker-free A/B baselines, F6 arm, F7 confirm ra_gapriv01_bati to A, F8 sample, F9 stop; no automatic assignment");
            }
            if (controller.Finished) return;
            if (!journal.Pulse()) { armedUntil = 0; controller.Stop("external-supervision-stop"); return; }
            controller.Tick();
        }
        void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (!down.Add(e.KeyCode) || closing || controller == null || !e.Control || !e.Shift) return;
            try
            {
                switch (e.KeyCode)
                {
                    case Keys.F5: controller.RequestSpawn(); break;
                    case Keys.F6:
                        if (!journal.Healthy || !controller.Active || !controller.BaselineAccepted || controller.AssignmentAttempted) throw new InvalidOperationException("no assignable test pair");
                        armedUntil = Stopwatch.GetTimestamp() + 10 * Stopwatch.Frequency;
                        journal.Append("manual-arm ra_gapriv01_bati to A; Ctrl+Shift+F7 within 10 seconds required");
                        break;
                    case Keys.F7:
                        if (armedUntil == 0 || Stopwatch.GetTimestamp() >= armedUntil) throw new InvalidOperationException("assignment not armed or expired");
                        armedUntil = 0; controller.RequestAssignment("ASSIGN_PRIVATE_TO_A"); break;
                    case Keys.F8: controller.Snapshot("manual"); break;
                    case Keys.F10: controller.ConfirmBaseline("BASELINES_A_B_MARKER_FREE"); break;
                    case Keys.F9: armedUntil = 0; controller.Stop("manual"); break;
                }
            }
            catch (ThreadAbortException) { throw; }
            catch (Exception ex) { journal.Append("command-refused-or-failed " + ex.GetType().Name + ":" + ex.Message); }
        }
    }
    internal sealed class ShvdneProfileApi : IProfileProbeApi
    {
        const uint Bati = 0xF9300CC5;
        const string Decorator = "RA_PRIVATE03C";
        readonly int thread = Thread.CurrentThread.ManagedThreadId;
        readonly Func<bool> admitted, assignmentAllowed;
        internal ShvdneProfileApi(Func<bool> admitted, Func<bool> assignmentAllowed) { if (admitted == null || assignmentAllowed == null) throw new ArgumentNullException("admission/assignment guard"); this.admitted = admitted; this.assignmentAllowed = assignmentAllowed; }
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
        public void PreparePair()
        {
            Context();
            if (!admitted() || !StoryReady) throw new InvalidOperationException("Story scope or supervision unavailable");
            int ped = Function.Call<int>(Hash.PLAYER_PED_ID);
            if (Function.Call<bool>(Hash.IS_ENTITY_DEAD, ped) || Function.Call<int>(Hash.GET_VEHICLE_PED_IS_IN, ped, false) != 0 ||
                Function.Call<int>(Hash.GET_INTERIOR_FROM_ENTITY, ped) != 0)
                throw new InvalidOperationException("stand on foot in a clear flat exterior area");
            a = Function.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, ped, -5f, 8f, .5f);
            b = Function.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS, ped, 5f, 8f, .5f);
            heading = Function.Call<float>(Hash.GET_ENTITY_HEADING, ped);
            Space(a); Space(b);
            if (!Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, Decorator, 3)) Function.Call(Hash.DECOR_REGISTER, Decorator, 3);
            if (!Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, Decorator, 3))
                throw new InvalidOperationException("ownership decorator registration unavailable; no spawn permitted");
            if (!admitted()) throw new InvalidOperationException("supervision stopped before model request");
            Function.Call(Hash.REQUEST_MODEL, Bati); // Nonblocking. Readiness polled by later ticks.
        }
        public bool ModelReady { get { Context(); return Function.Call<bool>(Hash.HAS_MODEL_LOADED, Bati); } }
        public ProbeLifetime Spawn(string role, int token)
        {
            Context(); if ((role != "A" && role != "B") || token <= 0 || !admitted() || !StoryReady || !ModelReady) throw new InvalidOperationException("spawn prerequisites changed");
            var p = role == "A" ? a : b; Space(p);
            if (!admitted()) throw new InvalidOperationException("supervision stopped before vehicle creation");
            int handle = Function.Call<int>(Hash.CREATE_VEHICLE, Bati, p.X, p.Y, p.Z, heading, false, false, false);
            var item = new ProbeLifetime { Handle = handle, Role = role, Token = token };
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
        public bool Exists(ProbeLifetime item) { Context(); return item != null && item.Handle != 0 && Function.Call<bool>(Hash.DOES_ENTITY_EXIST, item.Handle); }
        public bool Matches(ProbeLifetime item)
        {
            Context(); return Exists(item) && Function.Call<uint>(Hash.GET_ENTITY_MODEL, item.Handle) == Bati &&
                Function.Call<bool>(Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT, item.Handle, true) &&
                Function.Call<bool>(Hash.DECOR_EXIST_ON, item.Handle, Decorator) && Function.Call<int>(Hash.DECOR_GET_INT, item.Handle, Decorator) == item.Token;
        }
        bool EmptyStopped(ProbeLifetime item)
        {
            if (!Matches(item)) return false;
            float speed = Function.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return speed >= 0 && speed < .15f && Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, -1, false) == 0 &&
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, 0, false) == 0;
        }
        public bool EmptyStoppedAndDriveable(ProbeLifetime item)
        {
            Context(); return EmptyStopped(item) && !Function.Call<bool>(Hash.IS_ENTITY_DEAD, item.Handle) &&
                Function.Call<bool>(Hash.IS_VEHICLE_DRIVEABLE, item.Handle, false);
        }
        public string ReadSnapshot(ProbeLifetime item)
        {
            Context(); if (!Matches(item)) throw new InvalidOperationException("snapshot stale identity");
            uint horn = Function.Call<uint>(Hash.GET_VEHICLE_DEFAULT_HORN, item.Handle);
            float speed = Function.Call<float>(Hash.GET_ENTITY_SPEED, item.Handle);
            return "role=" + item.Role + " model=bati/F9300CC5 handle=" + item.Handle + " token=" + item.Token + " horn=" + horn.ToString("X8") +
                " speedMps=" + speed.ToString("R", CultureInfo.InvariantCulture) +
                " engineOn=" + Function.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING, item.Handle) +
                " driverPed=" + Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, item.Handle, -1, false) +
                " playerPed=" + Function.Call<int>(Hash.PLAYER_PED_ID) +
                " effective-profile=UNKNOWN";
        }
        public void AssignPrivateProfile(ProbeLifetime item)
        {
            Context(); if (item == null || item.Role != "A" || !admitted() || !StoryReady || !Matches(item) || !EmptyStoppedAndDriveable(item) || !admitted() || !assignmentAllowed()) throw new InvalidOperationException("assignment final identity/context/supervision/phase refused");
            Function.Call((Hash)0x4F0C413926060B38UL, item.Handle, PrivateProfileContract.Profile);
        }
        public bool Retire(ProbeLifetime item)
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
    internal sealed class ProbeJournal : IProbeJournal, IPrivateProbeGuard
    {
        sealed class Record { internal long Ticket; internal string Text; }
        readonly BlockingCollection<Record> queue = new BlockingCollection<Record>(128);
        readonly Thread worker;
        readonly string directory;
        long issued, persisted;
        volatile bool enabled, healthy, closing;
        SupervisorProbeClient supervisor;
        internal bool Enabled { get { return enabled; } }
        public bool Healthy { get { return healthy && !closing; } }
        public bool Ready { get { try { return enabled && Healthy && supervisor != null && !supervisor.StopRequested; } catch { return false; } } }
        public bool ClaimActivation() { try { return Ready && supervisor.TryClaimActivation(); } catch { return false; } }
        internal bool Pulse() { try { return Ready && supervisor.Heartbeat(); } catch { return false; } }
        public void RequestStop() { if (supervisor != null) supervisor.ReportFailure(); }
        public void StopAcknowledged() { if (supervisor != null) supervisor.ReportStopAcknowledged(); }
        public void VehiclesRetired() { if (supervisor != null) supervisor.ReportVehiclesRetired(); }
        internal ProbeJournal(string directory)
        {
            this.directory = directory;
            worker = new Thread(Work) { IsBackground = true, Name = "RichAudio isolated probe journal" };
            worker.Start();
        }
        public long Append(string message)
        {
            // Serialize enqueue/ticket ordering only. The lock never covers disk I/O or game calls.
            lock (queue)
            {
                if (!Healthy) return 0;
                long ticket = ++issued;
                try
                {
                    if (!queue.TryAdd(new Record { Ticket = ticket, Text = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + " qpc=" + Stopwatch.GetTimestamp() + " frequency=" + Stopwatch.Frequency + " " + message }))
                    { healthy = false; return 0; }
                    return ticket;
                }
                catch (InvalidOperationException) { healthy = false; return 0; }
            }
        }
        public bool Persisted(long ticket) { return ticket > 0 && Healthy && Interlocked.Read(ref persisted) >= ticket; }
        void Work()
        {
            try
            {
                // Deliberately no shipped enabled sidecar. Absence or any other value is dormant.
                string config = Path.Combine(directory, "RichAudio.GateAPrivate03C.Shvdne.ini");
                if (!File.Exists(config)) return;
                bool requested = false, experiment = false;
                string session = null;
                foreach (string raw in File.ReadAllLines(config))
                {
                    string line = raw.Trim();
                    if (line == "Experiment=GATE-A-SHVDNE-PRIVATE-03C") experiment = true;
                    if (line == "Enabled=true") requested = true;
                    if (line.StartsWith("SupervisorSession=", StringComparison.Ordinal)) session = line.Substring(18);
                }
                if (!requested || !experiment) return;
                var executable = Process.GetCurrentProcess().MainModule;
                if (executable.FileVersionInfo.FileVersion != "1.0.1158.16") return;
                if (!PrivateCandidateBinding.Admitted || !PrivateResourceAdmission.Verify(Path.GetDirectoryName(executable.FileName), PrivateCandidateBinding.Pins)) return;
                supervisor = SupervisorProbeClient.TryOpen(session);
                if (supervisor == null || supervisor.StopRequested) return;
                string evidence = Path.Combine(directory, "RichAudio.GateAPrivate03C.Evidence");
                Directory.CreateDirectory(evidence);
                using (var stream = new FileStream(Path.Combine(evidence, "session-" + Guid.NewGuid().ToString("N") + ".log"), FileMode.CreateNew, FileAccess.Write, FileShare.Read))
                using (var writer = new StreamWriter(stream))
                {
                    writer.WriteLine("SHVDNE isolated private-marker probe game=" + executable.FileVersionInfo.FileVersion +
                        " api=" + typeof(Script).Assembly.FullName + "; basic SHVDNE runtime previously observed; private resource mounting UNQUALIFIED");
                    writer.Flush(); stream.Flush(true); healthy = true; enabled = true;
                    foreach (var record in queue.GetConsumingEnumerable())
                    {
                        writer.WriteLine(record.Text); writer.Flush(); stream.Flush(true);
                        Interlocked.Exchange(ref persisted, record.Ticket);
                    }
                }
            }
            catch (ThreadAbortException) { throw; }
            catch { healthy = false; }
            finally { healthy = false; enabled = false; if (supervisor != null) { try { supervisor.ReportFailure(); } catch { } supervisor.Dispose(); } }
        }
        internal void Close() { lock (queue) { closing = true; queue.CompleteAdding(); } } // No join or I/O on Aborted.
    }
}
