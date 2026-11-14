using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;
using GTA;
using GTA.Native;

[assembly:System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]

namespace RichAudio.NativeSuppression01
{
    // Separate experimental script. The build emits Enabled=false; installation
    // and changing that setting require the separately reviewed live scope.
    public sealed class IdleProbe : Script
    {
        readonly IdleJournal journal;
        readonly HashSet<Keys> down = new HashSet<Keys>();
        IdleExperiment experiment;
        volatile bool aborted;
        public IdleProbe()
        {
            Interval = 0;
            journal = new IdleJournal(Path.GetDirectoryName(Filename));
            Tick += OnTick; KeyDown += OnKey;
            KeyUp += delegate(object s, KeyEventArgs e) { down.Remove(e.KeyCode); };
            Aborted += delegate { aborted = true; if (experiment != null) experiment.Abort(); journal.Close(); };
        }
        void OnTick(object s, EventArgs e)
        {
            if (aborted) return;
            if (experiment == null)
            {
                if (!journal.Enabled || !journal.Healthy) return;
                experiment = new IdleExperiment(new IdleNativeApi(), journal.Append, Stopwatch.GetTimestamp, Stopwatch.Frequency,
                    delegate { return BitConverter.ToInt32(Guid.NewGuid().ToByteArray(), 0) & Int32.MaxValue; }, delegate { return journal.Healthy; });
            }
            try
            {
                if (!journal.Healthy) experiment.Stop("journal unavailable");
                else experiment.Tick();
                Draw(experiment.Status);
            }
            catch (ThreadAbortException) { throw; }
            catch (Exception ex) { Fault(ex); }
        }
        void OnKey(object s, KeyEventArgs e)
        {
            if (!down.Add(e.KeyCode) || aborted || experiment == null || !e.Control || !e.Shift) return;
            try
            {
                // Restoration and cleanup remain available after journal failure.
                if (e.KeyCode == Keys.F9) { experiment.Stop("manual release"); return; }
                if (e.KeyCode == Keys.F10) { experiment.Cleanup(); return; }
                if (!journal.Healthy) throw new InvalidOperationException("journal unavailable");
                switch (e.KeyCode)
                {
                    case Keys.F5: experiment.Spawn(); break;
                    case Keys.F6: experiment.Arm(); break;
                    case Keys.F7: experiment.Apply(); break;
                    case Keys.F8: experiment.Snapshot(); break;
                }
            }
            catch (ThreadAbortException) { throw; }
            catch (Exception ex) { Fault(ex); }
        }
        void Fault(Exception ex)
        {
            journal.Append("fault " + ex.GetType().Name + ":" + ex.Message);
            try { experiment.Stop("command or callback fault"); }
            catch (ThreadAbortException) { throw; }
            catch (Exception cleanup) { journal.Append("release unavailable " + cleanup.Message); }
        }
        static void Draw(string status)
        {
            Function.Call(Hash.SET_TEXT_FONT, 0);
            Function.Call(Hash.SET_TEXT_SCALE, 0f, .35f);
            Function.Call(Hash.SET_TEXT_COLOUR, 255, 230, 100, 255);
            Function.Call(Hash.SET_TEXT_OUTLINE);
            Function.Call(Hash.BEGIN_TEXT_COMMAND_DISPLAY_TEXT, "STRING");
            Function.Call(Hash.ADD_TEXT_COMPONENT_SUBSTRING_PLAYER_NAME, "RA idle research: " + status);
            Function.Call(Hash.END_TEXT_COMMAND_DISPLAY_TEXT, .02f, .12f, 0);
        }
    }
    internal sealed class IdleJournal
    {
        readonly BlockingCollection<string> queue = new BlockingCollection<string>(128);
        readonly string directory;
        volatile bool enabled, healthy, closing;
        int issued;
        internal bool Enabled { get { return enabled; } }
        internal bool Healthy { get { return healthy && !closing; } }
        internal IdleJournal(string directory)
        {
            this.directory = directory;
            new Thread(Work) { IsBackground = true, Name = "RichAudio idle experiment journal" }.Start();
        }
        internal void Append(string value)
        {
            if (!Healthy) return;
            if (value == null) value = "unknown";
            if (value.Length > 2048) value = value.Substring(0, 2048) + " [truncated]";
            if (Interlocked.Increment(ref issued) > 4096) { healthy = false; return; }
            try
            {
                if (!queue.TryAdd(DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + " qpc=" + Stopwatch.GetTimestamp() + " " + value)) healthy = false;
            }
            catch (InvalidOperationException) { healthy = false; }
        }
        static string Digest(string path)
        {
            using (var s = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(s)).Replace("-", "").ToLowerInvariant();
        }
        void Work()
        {
            try
            {
                string config = Path.Combine(directory, "RichAudio.NativeSuppression01.ini");
                if (!File.Exists(config) || new FileInfo(config).Length > 1024 ||
                    File.ReadAllText(config).Trim() != "Enabled=true") return;
                var module = Process.GetCurrentProcess().MainModule;
                if (module.FileVersionInfo.FileVersion != "1.0.1158.16" ||
                    !String.Equals(Path.GetFullPath(module.FileName), Candidate.GamePath, StringComparison.OrdinalIgnoreCase) ||
                    Digest(module.FileName) != Candidate.GameSha256 ||
                    Digest(typeof(Script).Assembly.Location) != Candidate.ApiSha256 ||
                    Digest(Path.Combine(Path.GetDirectoryName(module.FileName), @"mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf")) != Candidate.DlcSha256)
                    return;
                string evidence = Path.Combine(directory, "RichAudio.NativeSuppression01.Evidence");
                Directory.CreateDirectory(evidence);
                using (var file = new FileStream(Path.Combine(evidence, "session-" + Guid.NewGuid().ToString("N") + ".log"), FileMode.CreateNew, FileAccess.Write, FileShare.Read))
                using (var writer = new StreamWriter(file))
                {
                    writer.WriteLine("Native idle experiment; source=" + Candidate.SourceCommit + "; qpcFrequency=" + Stopwatch.Frequency + "; audible results UNOBSERVED; crash recovery UNQUALIFIED");
                    writer.Flush(); file.Flush(true); healthy = true; enabled = true;
                    foreach (string line in queue.GetConsumingEnumerable()) { writer.WriteLine(line); writer.Flush(); file.Flush(true); }
                }
            }
            catch (ThreadAbortException) { throw; }
            catch { healthy = false; }
            finally { healthy = false; enabled = false; }
        }
        internal void Close() { closing = true; queue.CompleteAdding(); }
    }
}
