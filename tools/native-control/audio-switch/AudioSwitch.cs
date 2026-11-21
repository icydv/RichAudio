using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using GTA;
using GTA.Native;
using RichAudio.NativeSuppression01;

namespace RichAudio.AudioSwitch
{
    public sealed class AudioSwitchScript : Script
    {
        const uint Adder = 0xB779A091;
        const string Marker = "RA_StockSwitch";
        readonly Switch control = new Switch();
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8192 };
        readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RichAudio", "AudioSwitch");
        readonly string session = Guid.NewGuid().ToString("N");
        readonly int pid;
        readonly string processStart;
        string directory, previousStatus, focusEpoch;
        bool hadFocus;
        int token;
        bool legacyAssignment;
        PowertrainLink powertrainLink;
        PowertrainHandoff powertrain;
        string powertrainGeneration, powertrainFocus, powertrainVehicle, powertrainCommandId;
        string powertrainJournalError;
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int id);

        bool Foreground() { int id; GetWindowThreadProcessId(GetForegroundWindow(), out id); return id == pid; }

        public AudioSwitchScript()
        {
            using (var game = Process.GetCurrentProcess())
            {
                pid = game.Id;
                processStart = game.StartTime.ToUniversalTime().Ticks.ToString();
            }
            directory = Path.Combine(root, session);
            Directory.CreateDirectory(directory);
            Interval = 50;
            Tick += OnTick;
            Aborted += delegate { if (powertrainLink != null) powertrainLink.Abort(); };
        }

        static Vehicle Current(out string reason)
        {
            reason = "Story Mode unavailable";
            if (Function.Call<bool>(Hash.NETWORK_IS_SESSION_ACTIVE) || Function.Call<bool>(Hash.NETWORK_IS_GAME_IN_PROGRESS) ||
                Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE) || Function.Call<bool>(Hash.IS_PLAYER_SWITCH_IN_PROGRESS)) return null;
            var ped = Game.Player.Character;
            if (ped == null || !ped.Exists()) return null;
            var v = ped.CurrentVehicle;
            reason = "Drive a stock ADDER";
            if (v == null || !v.Exists() || unchecked((uint)v.Model.Hash) != Adder ||
                Function.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT, v.Handle, -1, false) != ped.Handle) return null;
            reason = v.IsEngineRunning ? "driver seated" : "engine stopped";
            return v;
        }

        static string Key(Vehicle v)
        {
            return v == null ? null : v.Handle + "/" + v.MemoryAddress.ToInt64() + "/" + Game.Player.Character.Handle;
        }

        void Publish(string path, string body)
        {
            string tmp = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllText(tmp, body);
            if (File.Exists(path)) File.Replace(tmp, path, null);
            else File.Move(tmp, path);
        }

        bool CanAcceptInput()
        {
            return Foreground() && !Game.IsPaused && !Function.Call<bool>(Hash.IS_PAUSE_MENU_ACTIVE);
        }

        bool Marked(Vehicle v)
        {
            return Function.Call<bool>(Hash.DECOR_EXIST_ON, v.Handle, Marker);
        }

        bool Owns(Vehicle vehicle)
        {
            return vehicle != null && token != 0 && Marked(vehicle) &&
                Function.Call<int>(Hash.DECOR_GET_INT, vehicle.Handle, Marker) == token;
        }

        void Mark(Vehicle vehicle)
        {
            if (!Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, Marker, 3))
            {
                using (var game = Process.GetCurrentProcess())
                    IdleDecoratorRegistration.Ensure(Marker, IdleDecoratorLock.Capture(game.MainModule), delegate {});
            }
            token = Guid.NewGuid().GetHashCode() | 1;
            if (!Function.Call<bool>(Hash.DECOR_SET_INT, vehicle.Handle, Marker, token))
                throw new InvalidOperationException("token unavailable");
        }

        void PowertrainLog(string phase, string reason)
        {
            try
            {
                PowertrainStatus host = powertrainLink == null ? null : powertrainLink.Snapshot;
                Log(new { utc = DateTime.UtcNow.ToString("o"), powertrain = phase, reason,
                    qpc = Stopwatch.GetTimestamp(), generation = powertrainGeneration, vehicle = powertrainVehicle,
                    hostMode = host == null ? null : host.Mode, revision = host == null ? 0 : host.AppliedRevision,
                    observedQpc = host == null ? 0 : host.ObservedQpc, renderedBlocks = host == null ? 0 : host.RenderedBlocks,
                    submittedFrames = host == null ? 0 : host.SubmittedFrames });
            }
            catch (Exception failure) { powertrainJournalError = failure.Message; }
        }

        void ClearPowertrainMarker()
        {
            try
            {
                string reason;
                Vehicle vehicle = Current(out reason);
                if (Key(vehicle) == powertrainVehicle && control.Generation == powertrainGeneration && Owns(vehicle))
                {
                    if (!Function.Call<bool>(Hash.DECOR_REMOVE, vehicle.Handle, Marker))
                        PowertrainLog("Marker retained", "ADDER token removal failed");
                }
            }
            catch (Exception failure) { PowertrainLog("Marker cleanup failed", failure.Message); }
        }

        void AssignPowertrain(string profile)
        {
            PowertrainLog("Native assignment reserved", profile);
            Vehicle vehicle;
            try
            {
                string reason;
                vehicle = Current(out reason);
                if (Key(vehicle) != powertrainVehicle || control.Generation != powertrainGeneration || !Owns(vehicle))
                    throw new InvalidOperationException("original ADDER identity or owner token changed");
                if (profile == Switch.PrivateQuiet)
                {
                    if (!vehicle.IsEngineRunning || !CanAcceptInput() || focusEpoch != powertrainFocus)
                        throw new InvalidOperationException("ready authorization or engine state expired");
                    var host = powertrainLink.Snapshot;
                    if (!HostCurrent(host) || !host.Prepared || host.Mode != "prepare" ||
                        host.AppliedRevision != 1 || host.VehicleId != powertrainGeneration)
                        throw new InvalidOperationException("muted render/output progress expired before native quiet");
                }
            }
            catch (Exception failure) { throw new PowertrainAssignmentRefused(failure.Message); }

            vehicle.ForceUseAudioGameObject(profile);
            PowertrainLog("Native returned", profile);
        }

        static bool HostCurrent(PowertrainStatus host)
        {
            long age = Stopwatch.GetTimestamp() - host.ObservedQpc;
            return host.Fresh && age >= 0 && age <= Stopwatch.Frequency / 4;
        }

        void AdvancePowertrain(Vehicle vehicle, string key, bool focused)
        {
            if (powertrain == null || !powertrain.NeedsTarget) return;
            bool owns;
            try { owns = key == powertrainVehicle && control.Generation == powertrainGeneration && Owns(vehicle); }
            catch (Exception failure)
            {
                PowertrainLog("Owner check failed", failure.Message);
                owns = false;
            }
            bool running = false;
            string submitFailure = null;
            if (owns)
            {
                try
                {
                    running = vehicle.IsEngineRunning;
                    if (powertrain.TracksInput) powertrainLink.Submit(running ? vehicle : null, powertrainGeneration);
                }
                catch (Exception failure) { submitFailure = "game input publication failed: " + failure.Message; }
            }
            var host = powertrainLink.Snapshot;
            var evidence = new PowertrainEvidence(host.VehicleId, host.AppliedRevision, host.Mode,
                                                   HostCurrent(host) && running, host.Prepared, host.Ended,
                                                   submitFailure ?? host.Failure);
            powertrain.Advance(Stopwatch.GetTimestamp(), control.Generation, owns,
                               focused && focusEpoch == powertrainFocus && running, evidence);
            if (powertrain.Phase == "Failed" || powertrain.Phase == "Restored")
                ClearPowertrainMarker();
        }

        string CommandPowertrain(Request request, Vehicle vehicle, string key, bool focused)
        {
            long now = Stopwatch.GetTimestamp();
            if (request.ExpiresTicks < now) return "expired request";
            if (vehicle == null || request.Generation != control.Generation) return "original ADDER unavailable";
            bool validFocus = focused && focusEpoch == request.Focus;
            if (request.Operation == "ReadyPowertrain")
            {
                if (!request.KnownStock || !validFocus || !vehicle.IsEngineRunning)
                    return "confirm a running, known-stock ADDER while GTA is foreground";
                if (powertrain != null && (key != powertrainVehicle || control.Generation != powertrainGeneration))
                    return "original ADDER lifetime changed";
                if (powertrain != null && (!powertrain.CanRetry || !powertrainLink.Snapshot.Ended))
                    return "previous powertrain attempt still owns the session or its native outcome";
                if (legacyAssignment || control.Phase != "idle" || Marked(vehicle))
                    return "start on an unclaimed stock ADDER";

                powertrainGeneration = control.Generation;
                powertrainVehicle = key;
                powertrainFocus = focusEpoch;
                try
                {
                    Mark(vehicle);
                    powertrainLink = PowertrainLink.TryCreate(directory);
                    if (powertrainLink == null)
                    {
                        ClearPowertrainMarker();
                        return "powertrain developer configuration unavailable";
                    }
                }
                catch (Exception failure)
                {
                    ClearPowertrainMarker();
                    return "could not begin powertrain preparation: " + failure.Message;
                }
                powertrain = new PowertrainHandoff(Stopwatch.Frequency, powertrainLink.SetGain,
                    powertrainLink.Withdraw, AssignPowertrain, PowertrainLog);
                powertrain.Start(powertrainGeneration, now);
                return "accepted";
            }

            if (powertrain == null || key != powertrainVehicle || control.Generation != powertrainGeneration || !Owns(vehicle))
                return "original claimed ADDER unavailable";
            if (request.Operation == "MutePowertrain") return powertrain.Mute(now);
            if (request.Operation == "ResumePowertrain")
                return validFocus && vehicle.IsEngineRunning ? powertrain.Resume(now) : "foreground running ADDER required to resume";
            string result = powertrain.Restore(now);
            if (powertrain.Phase == "Failed") ClearPowertrainMarker();
            return result;
        }

        void Log(object row)
        {
            File.AppendAllText(Path.Combine(directory, "events.jsonl"), json.Serialize(row) + Environment.NewLine);
        }

        public sealed class Request
        {
            public string Session, Generation, Focus, Id, Operation, Text, Cue, Finding;
            public string Donor = Switch.DefaultDonor;
            public bool KnownStock;
            public long ExpiresTicks;
        }

        void OnTick(object sender, EventArgs args)
        {
            bool observed = false;
            try
            {
                string reason;
                Vehicle v = Current(out reason);
                string key = Key(v);
                observed = true;
                control.Observe(key);
                bool focused = CanAcceptInput();
                if (focused != hadFocus || focusEpoch == null) focusEpoch = Guid.NewGuid().ToString("N");
                hadFocus = focused;
                AdvancePowertrain(v, key, focused);
                var status = json.Serialize(new { Session=session, Pid=pid, ProcessStart=processStart, Generation=control.Generation,
                    Focus=focusEpoch, Foreground=focused, Vehicle=key, Engine=v != null && v.IsEngineRunning,
                    Phase=control.Phase, Comparison=control.Comparison.ToString(), Reason=reason,
                    Powertrain=powertrain == null ? "Inactive" : powertrain.Phase,
                    PowertrainReason=powertrain == null ? null : powertrain.Reason,
                    PowertrainJournalError=powertrainJournalError, PowertrainCommandId=powertrainCommandId,
                    PowertrainEvidenceDirectory=powertrainLink == null ? null : powertrainLink.EvidenceDirectory });
                if (status != previousStatus)
                {
                    Publish(Path.Combine(root, "status.json"), status);
                    previousStatus = status;
                }
                string pending = Path.Combine(directory, "pending.json");
                if (!File.Exists(pending)) return;
                string claimed = Path.Combine(directory, "claimed-" + Guid.NewGuid().ToString("N") + ".json");
                File.Move(pending, claimed);
                if (new FileInfo(claimed).Length > 8192) return;
                var q = json.Deserialize<Request>(File.ReadAllText(claimed));
                Guid id;
                if (q == null || q.Session != session || !Guid.TryParseExact(q.Id,"N",out id)) return;
                string reply = Path.Combine(directory, id.ToString("N") + ".reply");
                string reserved = reply + ".reserved";
                if (File.Exists(reserved)) return;
                using (File.Open(reserved,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {}
                bool engine = v != null && v.IsEngineRunning;
                string name = q.Operation == "Ready" ? q.Donor : q.Operation == "Restore" ? "ADDER" : null;
                string result;
                bool ownsTarget = Owns(v);
                if (q.Operation == "Report" && q.Text != null && q.Text.Length <= 1024)
                {
                    result = "report saved";
                    if (!String.IsNullOrEmpty(q.Finding))
                        result = String.IsNullOrWhiteSpace(q.Text) || q.ExpiresTicks < Stopwatch.GetTimestamp()
                            ? "invalid or expired finding"
                            : control.RecordFinding(q.Finding, q.Generation, engine, ownsTarget);
                }
                else if (q.Operation == "ReadyPowertrain" || q.Operation == "MutePowertrain" ||
                         q.Operation == "ResumePowertrain" || q.Operation == "RestorePowertrain")
                {
                    result = CommandPowertrain(q, v, key, focused);
                    if (result == "accepted") powertrainCommandId = q.Id;
                }
                else if (powertrain != null) result = "this session is reserved for the powertrain replacement";
                else if (name == null || q.ExpiresTicks < Stopwatch.GetTimestamp()) result = "invalid or expired";
                else if (q.Operation == "Ready" && !q.KnownStock) result = "confirm known stock audio first";
                else
                {
                    bool apply = q.Operation == "Ready";
                    bool markNewTarget = apply && q.Donor != Switch.PrivateQuiet;
                    bool keepMarker = control.KeepMarkerOnRestore;
                    bool valid = v != null && (markNewTarget ? !Marked(v) : ownsTarget);
                    result = control.Command(q.Operation,q.Generation,focused && q.Focus == focusEpoch,engine,valid,delegate(string requested)
                    {
                        if (markNewTarget) Mark(v);
                        Log(new { utc=DateTime.UtcNow.ToString("o"), q.Id, vehicle=key, requested, engine=true, outcome="dispatch reserved" });
                        if (Key(Current(out reason)) != key || !CanAcceptInput() || !v.IsEngineRunning ||
                            !Marked(v) || Function.Call<int>(Hash.DECOR_GET_INT,v.Handle,Marker) != token)
                            throw new InvalidOperationException("final target check failed");
                        legacyAssignment = true;
                        v.ForceUseAudioGameObject(requested);
                        if (!apply && !keepMarker && !Function.Call<bool>(Hash.DECOR_REMOVE,v.Handle,Marker))
                            throw new InvalidOperationException("stock call returned but token removal failed");
                    }, q.Donor);
                }
                Log(new { utc=DateTime.UtcNow.ToString("o"), q.Id, q.Operation, q.Generation, vehicle=key,
                    model=v == null ? null : "ADDER", engine, requested=name, phase=control.Phase, comparison=control.Comparison.ToString(), outcome=result,
                    cue=q.Cue, finding=q.Finding, listeningReport=q.Text,
                    powertrain=powertrain == null ? "Inactive" : powertrain.Phase });
                Publish(reply,result);
            }
            catch(Exception e)
            {
                if (!observed)
                {
                    control.Observe(null);
                    if (powertrain != null)
                        powertrain.Advance(Stopwatch.GetTimestamp(), null, false, false, default(PowertrainEvidence));
                }
                previousStatus = null;
                try { Log(new { utc=DateTime.UtcNow.ToString("o"), error=e.Message }); } catch(IOException) {}
            }
        }
    }
}
