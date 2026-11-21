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

        void Log(object row)
        {
            File.AppendAllText(Path.Combine(directory, "events.jsonl"), json.Serialize(row) + Environment.NewLine);
        }

        public sealed class Request
        {
            public string Session, Generation, Focus, Id, Operation, Text;
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
                var status = json.Serialize(new { Session=session, Pid=pid, ProcessStart=processStart, Generation=control.Generation,
                    Focus=focusEpoch, Foreground=focused, Vehicle=key, Engine=v != null && v.IsEngineRunning,
                    Phase=control.Phase, Reason=reason });
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
                string name = q.Operation == "Ready" ? Switch.Donor : q.Operation == "Restore" ? "ADDER" : null;
                string result;
                if (q.Operation == "Report" && q.Text != null && q.Text.Length <= 1024) result = "report saved";
                else if (name == null || q.ExpiresTicks < Stopwatch.GetTimestamp()) result = "invalid or expired";
                else if (q.Operation == "Ready" && !q.KnownStock) result = "confirm known stock audio first";
                else
                {
                    bool apply = q.Operation == "Ready";
                    bool valid = v != null && (apply ? !Marked(v) : Marked(v) && token != 0 &&
                        Function.Call<int>(Hash.DECOR_GET_INT,v.Handle,Marker) == token);
                    result = control.Command(q.Operation,q.Generation,focused && q.Focus == focusEpoch,engine,valid,delegate(string requested)
                    {
                        if (apply)
                        {
                            if (!Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, Marker, 3))
                            {
                                using (var game = Process.GetCurrentProcess())
                                    IdleDecoratorRegistration.Ensure(Marker, IdleDecoratorLock.Capture(game.MainModule), delegate {});
                            }
                            token = Guid.NewGuid().GetHashCode() | 1;
                            if (!Function.Call<bool>(Hash.DECOR_SET_INT,v.Handle,Marker,token)) throw new InvalidOperationException("token unavailable");
                        }
                        Log(new { utc=DateTime.UtcNow.ToString("o"), q.Id, vehicle=key, requested, engine=true, outcome="dispatch reserved" });
                        if (Key(Current(out reason)) != key || !CanAcceptInput() || !v.IsEngineRunning ||
                            !Marked(v) || Function.Call<int>(Hash.DECOR_GET_INT,v.Handle,Marker) != token)
                            throw new InvalidOperationException("final target check failed");
                        v.ForceUseAudioGameObject(requested);
                        if (!apply) Function.Call<bool>(Hash.DECOR_REMOVE,v.Handle,Marker);
                    });
                }
                Log(new { utc=DateTime.UtcNow.ToString("o"), q.Id, q.Operation, q.Generation, vehicle=key,
                    model=v == null ? null : "ADDER", engine, requested=name, phase=control.Phase, outcome=result, listeningReport=q.Text });
                Publish(reply,result);
            }
            catch(Exception e)
            {
                if (!observed) control.Observe(null);
                previousStatus = null;
                try { Log(new { utc=DateTime.UtcNow.ToString("o"), error=e.Message }); } catch(IOException) {}
            }
        }
    }
}
