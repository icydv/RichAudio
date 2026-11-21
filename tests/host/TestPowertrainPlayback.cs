using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security.AccessControl;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.AudioSwitch;
using RichAudio.Beacon.Transport;
using RichAudio.Integration;

internal sealed class TestPowertrainPlayback
{
    sealed class FixtureSource : IGameObservationSource
    {
        readonly Stopwatch clock = Stopwatch.StartNew();
        internal double? RevRatio = 0.22;
        public bool StoryReady { get { return true; } }
        public int PlayerVehicleHandle { get { return 19; } }

        public CameraObservation ReadCamera()
        {
            long now = Stopwatch.GetTimestamp();
            return new CameraObservation {
                Before = now, After = now, Observed = now, GameTime = (uint)clock.ElapsedMilliseconds,
                Position = new[] { 0d, 0d, 1d }, Forward = new[] { 0d, 1d, 0d }, Up = new[] { 0d, 0d, 1d }
            };
        }

        public VehicleObservation ReadVehicle(int handle)
        {
            var observation = new VehicleObservation {
                Before = Stopwatch.GetTimestamp(),
                Handle = handle, Model = 0xB779A091, Exists = true, PlayerDriver = true, VehicleView = true,
                Running = true, RpmRatio = RevRatio,
                OperatingPointEvidence = "candidate-public-native-unqualified-shvdne",
                Position = new[] { 0d, 2d, 0d }, Velocity = new[] { 0d, 0d, 0d },
                Forward = new[] { 0d, 1d, 0d }, Up = new[] { 0d, 0d, 1d }
            };
            do { observation.After = Stopwatch.GetTimestamp(); } while (observation.After == observation.Before);
            observation.Observed = observation.Before + (observation.After - observation.Before) / 2;
            return observation;
        }

        public int[] DiscoverVehicles(double[] cameraPosition, float radius)
        {
            throw new InvalidOperationException("Single-vehicle path must not enumerate the pool");
        }

        public GameplayInterior ReadCameraInterior(ListenerState listener, out CameraInteriorReadback readback)
        {
            throw new InvalidOperationException("Dev powertrain path does not need interiors");
        }
    }

    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    readonly FixtureSource source = new FixtureSource();
    readonly string session = Guid.NewGuid().ToString("N");
    readonly string vehicle = Guid.NewGuid().ToString("N");
    readonly List<object> stages = new List<object>();
    string statusFile;
    string directory;
    PowertrainLink link;
    PowertrainHandoff handoff;
    readonly List<string> assignments = new List<string>();
    readonly List<object> handoffJournal = new List<object>();
    string releaseReason;

    Dictionary<string, object> ReadStatus()
    {
        try
        {
            using (var stream = new FileStream(statusFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream))
                return json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
        }
        catch (IOException) { return null; }
    }

    static double Number(Dictionary<string, object> row, string key)
    {
        object value;
        if (!row.TryGetValue(key, out value) || value == null) return -1;
        return Convert.ToDouble(value, CultureInfo.InvariantCulture);
    }

    static void Require(bool test, string why)
    {
        if (!test) throw new InvalidDataException(why);
    }

    void Advance()
    {
        var host = link.Snapshot;
        var evidence = new PowertrainEvidence(host.VehicleId, host.AppliedRevision, host.Mode,
            host.Fresh, host.Prepared, host.Ended, host.Failure);
        handoff.Advance(Stopwatch.GetTimestamp(), vehicle, true, true, evidence);
    }

    Dictionary<string, object> Drive(string stage, Func<Dictionary<string, object>, bool> verify)
    {
        var clock = Stopwatch.StartNew();
        Dictionary<string, object> row = null;
        while (clock.ElapsedMilliseconds < 12000)
        {
            link.SubmitObservation(source.PlayerVehicleHandle, vehicle);
            Advance();
            row = ReadStatus();
            var host = link.Snapshot;
            if (row != null)
            {
                Require(row["session"].Equals(session) && row["fixture"].Equals(true),
                    "Status belongs to another session or endpoint mode");
                Require(Number(row, "underflowFrames") == 0, "Device-free sink underflow during " + stage);
                if (verify(row))
                {
                    stages.Add(new { stage, elapsedMs = clock.ElapsedMilliseconds, status = row });
                    Console.WriteLine("PASS " + stage);
                    return row;
                }
            }
            if (host.Failure != null) throw new InvalidOperationException("Host failed during " + stage + ": " + host.Failure);
            Thread.Sleep(50);
        }
        throw new TimeoutException("Timed out during " + stage + ". Handoff: " + handoff.Phase + ", " +
            handoff.Reason + ". Last status: " + json.Serialize(row));
    }

    // The live journal retained native transition times and cumulative host
    // counters. It did not retain individual callback arrival times or revs.
    // Use the same authored 20 Hz workload and periodic delivery stalls in
    // both builds. The adapter timestamps its actual acquisitions.
    void DriveWindow(string stage, int durationMs, string phase, long revision)
    {
        var clock = Stopwatch.StartNew();
        var before = ReadStatus();
        Require(before != null, "No starting status for " + stage);
        Dictionary<string, object> after = null;
        int tick = 0;
        while (clock.ElapsedMilliseconds < durationMs)
        {
            // Hold a ratio through several observations to exercise high-rev
            // racing before changing load. Muted tracking keeps the high ratio.
            source.RevRatio = phase == "Muted" ? 0.83 : (tick / 8) % 2 == 0 ? 0.83 : 0.35;
            link.SubmitObservation(source.PlayerVehicleHandle, vehicle);
            Advance();
            after = ReadStatus();
            Require(handoff.Phase == phase, stage + ": " + handoff.Phase + " " + handoff.Reason);
            Require(link.Snapshot.Failure == null, "Host failed during " + stage + ": " + link.Snapshot.Failure);
            int intervalMs = ++tick % 9 == 0 ? 90 : 50;
            Thread.Sleep(intervalMs);
        }
        Require(after != null && Number(after, "appliedRevision") == revision &&
            Number(after, "submittedFrames") > Number(before, "submittedFrames") &&
            Number(after, "outputPeak") >= 0, "Output did not progress during " + stage);
        if (phase == "Muted") Require(Number(after, "outputPeak") == 0, "Muted interval emitted sound");
        stages.Add(new { stage, elapsedMs = clock.ElapsedMilliseconds, observations = tick,
            deltaStaleFrames = Number(after, "stalePcmFrames") - Number(before, "stalePcmFrames"),
            deltaUnderflowFrames = Number(after, "underflowFrames") - Number(before, "underflowFrames"),
            deltaDiscardedFrames = Number(after, "discardedFrames") - Number(before, "discardedFrames"),
            before, status = after });
        Console.WriteLine("PASS " + stage + " at the authored callback cadence");
    }

    void WaitForStock()
    {
        var clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < 6000)
        {
            // Keep ticking the original vehicle while real host receipts or
            // process-exit evidence reach the SHVDNE worker.
            Advance();
            if (handoff.Phase == "Restored" && link.Snapshot.Ended)
            {
                Advance();
                Advance();
                Require(String.Join(",", assignments) == "RA_RC_QUIET,ADDER",
                    "Recovery assigned stock more than once or on the wrong stage");
                return;
            }
            Thread.Sleep(50);
        }
        throw new TimeoutException("Stock return failed: " + handoff.Phase + ", " + handoff.Reason +
            ". Host report: " + json.Serialize(ReadStatus()));
    }

    object Run(string manifestPath, string fixtureRoot, string termination)
    {
        var configuration = PlayableConfiguration.Load(manifestPath);
        string root = configuration.Root;
        directory = Path.Combine(root, ".local", "gameplay", session);
        statusFile = Path.Combine(directory, "powertrain.json");
        string linkDirectory = Path.Combine(fixtureRoot, session);
        Directory.CreateDirectory(linkDirectory);
        var frames = new PowertrainFrames(session, source);
        var first = frames.Capture(19, vehicle, 1, "prepare");
        Require(first != null && first.Vehicles.Length == 1 && first.Vehicles[0].Model == 0xB779A091 &&
            first.Vehicles[0].Id == vehicle && first.Vehicles[0].OperatingPoint == source.RevRatio &&
            first.OperatingPointEvidence == PowertrainFrames.NativeRevEvidence, "ADDER identity or rev provenance drifted");
        Thread.Sleep(50);
        double observed = source.RevRatio.Value;
        source.RevRatio = null;
        Require(frames.Capture(19, vehicle, 1, "prepare") == null && frames.Failure.Contains("rev ratio unavailable"),
            "Missing RPM did not take the provider rejection branch");
        source.RevRatio = observed;
        string host = PlayableConfiguration.Inside(root, "runtime/RichAudio.Acoustics.Host.exe");
        link = PowertrainLink.CreateFixture(linkDirectory, manifestPath,
            PlayableConfiguration.Digest(manifestPath), PlayableConfiguration.Digest(host), source);
        handoff = new PowertrainHandoff(Stopwatch.Frequency, link.SetGain, link.Withdraw, assignment =>
        {
            var receipt = link.Snapshot;
            if (assignment == "RA_RC_QUIET")
                Require(receipt.Fresh && receipt.Prepared && receipt.Mode == "prepare" &&
                    receipt.AppliedRevision == 1 && receipt.RenderedBlocks > 0 && receipt.SubmittedFrames > 0,
                    "Native quiet requested before real renderer and sink progress");
            else
                Require(receipt.Ended || receipt.Mode == "withdraw",
                    "Stock assigned before voice withdrawal");
            assignments.Add(assignment);
        }, (phase, reason) =>
        {
            if (phase == "Releasing") releaseReason = reason;
            handoffJournal.Add(new { phase, reason, ticks = Stopwatch.GetTimestamp() });
        });
        try
        {
            handoff.Start(vehicle, Stopwatch.GetTimestamp());
            Advance();
            Require(handoff.Phase == "Preparing" && assignments.Count == 0,
                "Native quiet requested before any host progress");
            var playing = Drive("real renderer readiness admitted one authored native quiet request", r =>
                handoff.Phase == "Active" && assignments.Count == 1 && Number(r, "appliedRevision") == 2 &&
                Number(r, "outputPeak") > 0 && Math.Abs(Number(r, "submittedOperatingPoint") - observed) < .00001);
            if (termination == "disconnect")
            {
                using (var owner = Process.GetCurrentProcess())
                using (var stop = EventWaitHandle.OpenExisting(GameplayStopSignal.Name(owner.Id, session), EventWaitHandleRights.Modify))
                    stop.Set();
                WaitForStock();
                Require(link.Snapshot.Failure != null, "Host exit did not reach the callback as a failure");
                Console.WriteLine("PASS actual owned host disconnect restored stock exactly once");
            }
            else if (termination == "expiry")
            {
                // Advance the exact same vehicle's handoff with observations
                // withheld. Neither the host nor the controller may extend
                // the age of already-rendered data to keep the voice alive.
                WaitForStock();
                Require(releaseReason == "host output progress expired" ||
                    (releaseReason != null && releaseReason.Contains("telemetry expired")),
                    "Expired telemetry did not cause withdrawal: " + releaseReason);
                Console.WriteLine("PASS lost observation lease withdrew playback and restored stock exactly once");
            }
            else
            {
                DriveWindow("initial audible playback", 3800, "Active", 2);
                Require(handoff.Mute(Stopwatch.GetTimestamp()) == "accepted", "Mute refused");
                var muted = Drive("mute acknowledged only with silent output", r =>
                    handoff.Phase == "Muted" && Number(r, "appliedRevision") == 3 && Number(r, "outputPeak") == 0 &&
                    Number(r, "submittedFrames") > Number(playing, "submittedFrames"));
                source.RevRatio = 0.83;
                Drive("fresh telemetry continued while output stayed muted", r =>
                    handoff.Phase == "Muted" && Number(r, "appliedRevision") == 3 && Number(r, "outputPeak") == 0 &&
                    Number(r, "submittedObservationSequence") > Number(muted, "submittedObservationSequence") &&
                    Math.Abs(Number(r, "submittedOperatingPoint") - 0.83) < .00001);
                DriveWindow("muted tracking", 2400, "Muted", 3);
                Require(handoff.Resume(Stopwatch.GetTimestamp()) == "accepted", "Resume refused");
                Drive("resume submitted current rev ratio in the new output revision", r =>
                    handoff.Phase == "Active" && Number(r, "appliedRevision") == 4 && Number(r, "outputPeak") > 0 &&
                    Math.Abs(Number(r, "submittedOperatingPoint") - 0.83) < .00001 &&
                    Number(r, "submittedObservationSequence") > Number(playing, "submittedObservationSequence"));
                DriveWindow("resumed audible playback", 7600, "Active", 4);
                Require(assignments.Count == 1, "Mute or resume performed a native assignment");
                Require(handoff.Restore(Stopwatch.GetTimestamp()) == "accepted", "Stock return refused");
                WaitForStock();
                var withdrawn = ReadStatus();
                Require(withdrawn != null && withdrawn["mode"].Equals("withdraw") &&
                    Number(withdrawn, "appliedRevision") == 5 && Number(withdrawn, "outputPeak") == 0 &&
                    Number(withdrawn, "underflowFrames") == 0,
                    "Stale output remained after withdrawal");
                Console.WriteLine("PASS withdrawal retired source and reached silent output before stock return");
            }
            return new {
                session, termination, stages, assignments, handoffJournal, evidenceDirectory = directory,
                transportReceipt = Path.Combine(linkDirectory, "powertrain-transport.json"), finalHost = ReadStatus()
            };
        }
        catch
        {
            Console.Error.WriteLine("Private host evidence: " + directory);
            Console.Error.WriteLine("Handoff journal: " + json.Serialize(handoffJournal));
            throw;
        }
        finally
        {
            if (!link.Snapshot.Ended) link.Abort();
        }
    }

    static int Main(string[] args)
    {
        if (args.Length != 2) return 2;
        try
        {
            string root = Path.GetDirectoryName(args[1]);
            var playback = new TestPowertrainPlayback().Run(args[0], root, "restore");
            var disconnect = new TestPowertrainPlayback().Run(args[0], root, "disconnect");
            var expiry = new TestPowertrainPlayback().Run(args[0], root, "expiry");
            File.WriteAllText(args[1], new JavaScriptSerializer().Serialize(new {
                passed = true, fixture = "device-free", authoredObservations = true,
                authoredTiming = "50 ms between observations with a 90 ms interval every ninth tick; operating ratios held at 0.83 while muted and alternated in eight-observation runs during audible windows",
                authoredEndpointPrime = "One 20 ms fixture callback of silence without consuming the ring for each output revision; excluded from substituted-frame counters",
                nativeAssignmentsAreFixtureActions = true, measuredSpeakerLatency = false, playback, disconnect, expiry
            }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
