using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
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
        internal double[] CameraPosition = { 0d, 0d, 1d };
        internal double[] VehiclePosition = { 0d, 2d, 0d };
        internal double[] Forward = { 0d, 1d, 0d };
        internal double[] CameraForward;
        internal double[] CameraUp;
        internal double[] VehicleUp;
        internal double[] Velocity = { 0d, 0d, 0d };
        public bool StoryReady { get { return true; } }
        public int PlayerVehicleHandle { get { return 19; } }

        public CameraObservation ReadCamera()
        {
            long now = Stopwatch.GetTimestamp();
            return new CameraObservation {
                Before = now, After = now, Observed = now, GameTime = (uint)clock.ElapsedMilliseconds,
                Position = CameraPosition, Forward = CameraForward ?? Forward, Up = CameraUp ?? new[] { 0d, 0d, 1d }
            };
        }

        public VehicleObservation ReadVehicle(int handle)
        {
            var observation = new VehicleObservation {
                Before = Stopwatch.GetTimestamp(),
                Handle = handle, Model = 0xB779A091, Exists = true, PlayerDriver = true, VehicleView = true,
                Running = true, RpmRatio = RevRatio,
                OperatingPointEvidence = "candidate-public-native-unqualified-shvdne",
                Position = VehiclePosition, Velocity = Velocity,
                Forward = Forward, Up = VehicleUp ?? new[] { 0d, 0d, 1d }
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
    long previousObservation;
    int observationCount;
    double minimumCallbackIntervalMs = Double.PositiveInfinity;
    double maximumCallbackIntervalMs;
    PassageRoute passage;
    PerformanceFrame[] performance;
    int passageSeconds;
    int warmupSeconds;
    bool contendStatus;
    long routeStarted;
    int contentionCount;
    volatile bool stopStatusContention;
    Thread statusContender;
    int performanceIndex;
    string shot;
    readonly List<object> routeEvents = new List<object>();

    void ContendWithPublication()
    {
        while(!stopStatusContention)
        {
            // Run independently of the observation callback. Holding a
            // snapshot must not also starve the fixture's telemetry.
            try
            {
                using(var held=new FileStream(statusFile,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
                {
                    Interlocked.Increment(ref contentionCount);
                    Thread.Sleep(52);
                }
            }
            catch(IOException) {}
            for(int i=0;i<20&&!stopStatusContention;i++)Thread.Sleep(30);
        }
    }

    void MoveCameraAndCar()
    {
        if (routeStarted == 0) return;
        long now = Stopwatch.GetTimestamp();
        double elapsed = (now - routeStarted) / (double)Stopwatch.Frequency;
        if (performance != null)
        {
            while (performanceIndex + 1 < performance.Length && performance[performanceIndex+1].seconds <= elapsed)
                performanceIndex++;
            ApplyPerformanceFrame(performance[performanceIndex]);
            return;
        }
        if (passage == null) return;
        double t = elapsed % 42;
        // Fifteen seconds under cover with a stationary car and a drifting camera.
        // Return to the north opening, then traverse the same measured lane again.
        double leg = t < 8 ? t / 8 : t < 23 ? 1 : t < 35 ? 1 - (t-23)/12 : 0;
        double eased=leg*leg*(3-2*leg);
        double speed=6*leg*(1-leg)*(t<8?1d/8:t<35&&t>=23?-1d/12:0);
        double wobble=0.6*Math.Sin(t*.37);
        source.Forward=passage.forward;
        source.VehiclePosition=passage.outside.Select((x,i)=>x+eased*(passage.inside[i]-x)).ToArray();
        source.Velocity=passage.outside.Select((x,i)=>speed*(passage.inside[i]-x)).ToArray();
        source.CameraPosition=new[]{source.VehiclePosition[0]-4.9*source.Forward[0]+wobble*source.Forward[1],
            source.VehiclePosition[1]-4.9*source.Forward[1]-wobble*source.Forward[0],source.VehiclePosition[2]+1.4};
        source.RevRatio=t>=8&&t<23?.84:.33+.2*Math.Sin(t*.67);
        if (passageSeconds >= 180)
        {
            bool highCamera = t >= 36 && t < 40;
            string current = highCamera ? "high-camera" : t < 8 ? "enter" : t < 23 ? "covered" : "exit";
            if (shot != current)
            {
                shot = current;
                routeEvents.Add(new { shot, elapsedSeconds = elapsed, qpc = now });
            }
            if (highCamera)
                source.CameraPosition = new[]{source.VehiclePosition[0]-171*source.Forward[0],
                    source.VehiclePosition[1]-171*source.Forward[1],source.VehiclePosition[2]+23};
            // Use the short audition's ratio landmarks in each covered leg.
            if (t >= 8 && t < 23)
            {
                double revTime = t - 8;
                if (revTime <= 8) source.RevRatio = AuditionRatio(revTime);
                else source.RevRatio = .74;
                if (revTime >= 1.85 && revTime < 3.7)
                    source.RevRatio = ((int)Math.Floor(revTime*20) % 2 == 0) ? .826 : .834;
            }
            if (highCamera) source.RevRatio = .88;
        }
    }

    static double AuditionRatio(double seconds)
    {
        for (int i=1; i<RevTimes.Length; i++)
            if (seconds <= RevTimes[i])
            {
                double part = (seconds-RevTimes[i-1])/(RevTimes[i]-RevTimes[i-1]);
                return RevRatios[i-1]+part*(RevRatios[i]-RevRatios[i-1]);
            }
        return RevRatios[RevRatios.Length-1];
    }
    static readonly double[] RevTimes={0,.5,.62,.79,.92,1.05,1.6,3.8,5.1,6.6,6.72,7.5,15};
    static readonly double[] RevRatios={.20,.20,.88,.88,.31,.30,.72,.72,1,1,.28,.24,.24};

    void ApplyPerformanceFrame(PerformanceFrame frame)
    {
        source.CameraPosition = frame.camera;
        source.CameraForward = frame.cameraForward;
        source.CameraUp = frame.cameraUp;
        source.VehiclePosition = frame.vehicle;
        source.Forward = frame.forward;
        source.VehicleUp = frame.up;
        source.Velocity = frame.velocity ?? new[]{0d,0d,0d};
        source.RevRatio = frame.rev;
    }

    Dictionary<string, object> ReadStatus()
    {
        var primary=ReadSharedJson(statusFile);
        var alternate=ReadSharedJson(Path.Combine(directory,"powertrain-alternate.json"));
        return alternate!=null && (primary==null || Number(alternate,"publicationQpc")>Number(primary,"publicationQpc"))?alternate:primary;
    }

    Dictionary<string, object> ReadSharedJson(string file)
    {
        try
        {
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
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

    static long LastAudibleBlock(Dictionary<string, object> status)
    {
        var chronology = status["initialAudibleChronology"] as Dictionary<string,object>;
        var last = chronology == null ? null : chronology["last"] as Dictionary<string,object>;
        return last == null ? -1 : (long)Number(last, "PcmBlock");
    }

    object CallbackWitness()
    {
        const string key = "RICHAUDIO_POWERTRAIN_FIXTURE_CALLBACK_FRAMES";
        string configured = Environment.GetEnvironmentVariable(key);
        if (configured == null) return null;
        int requested = Int32.Parse(configured, CultureInfo.InvariantCulture);
        Require(requested == 480 || requested == 960, "Unrecognized fixture callback size");
        string file = Path.Combine(directory, "delivery-timing.json");
        var serializer = new JavaScriptSerializer { MaxJsonLength = 1048576 };
        var receipt = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
        var callbacks = ((System.Collections.IList)receipt["sink"]).Cast<Dictionary<string,object>>()
            .Where(row => (string)row["Phase"] == "sink-callback").ToArray();
        Require(callbacks.Length > 1 && callbacks.All(row => Number(row, "Amount") == requested ||
            (requested == 480 && Number(row, "Sequence") == 0 && Number(row, "Amount") == 1056)),
            "The sink trace did not verify the requested callback size");
        bool initialFillRetained = Number(callbacks[0], "Sequence") == 0;
        if (initialFillRetained && requested == 480)
            Require(Number(callbacks[0], "Amount") == 1056, "The cold sink trace did not retain the 1056-frame initial fill");
        double frequency = Number(receipt, "frequency");
        Require(frequency > 0, "The sink trace has no clock frequency");
        var intervals = callbacks.Zip(callbacks.Skip(1), (a,b) =>
            (Number(b, "Qpc") - Number(a, "Qpc")) * 1000 / frequency).ToArray();
        Require(intervals.All(x => x > 0), "The sink trace contains out-of-order callbacks");
        Array.Sort(intervals);
        double median = intervals[(intervals.Length-1)/2];
        if (requested == 480)
            Require(median >= 8 && median <= 12, "The 480-frame fixture did not sustain a 10 ms median callback interval");
        return new { callbackFrames=requested, nominalPeriodMs=requested/48.0, retainedCallbacks=callbacks.Length, initialFillRetained,
            minimumIntervalMs=intervals[0], medianIntervalMs=median,
            p95IntervalMs=intervals[(int)Math.Ceiling(intervals.Length*.95)-1], maximumIntervalMs=intervals[intervals.Length-1], receipt=file };
    }

    static bool TargetReflection(Dictionary<string,object> path, WorldPose pose)
    {
        var basis = (System.Collections.IList)path["materialBasis"];
        var ids = basis.Cast<Dictionary<string,object>>().Select(m => (string)m["surface"]).ToArray();
        if (pose.orderedSurfaces == null) return ids.Contains(pose.surfaceId);
        if (!ids.SequenceEqual(pose.orderedSurfaces) || Number(path,"order") != ids.Length) return false;
        var points = path["bouncePoints"] as System.Collections.IList;
        var bands = path["mixerEndBands"] as System.Collections.IList;
        return points != null && points.Count == ids.Length && bands != null && bands.Count == 3 &&
            bands.Cast<object>().Any(b => Convert.ToDouble(b, CultureInfo.InvariantCulture) > 0);
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

    double SubmitObservation()
    {
        int intervalMs = observationCount != 0 && observationCount % 9 == 0 ? 90 : 50;
        long due = previousObservation + intervalMs * Stopwatch.Frequency / 1000;
        long now = Stopwatch.GetTimestamp();
        while (now < due)
        {
            Thread.Sleep((int)Math.Ceiling((due - now) * 1000d / Stopwatch.Frequency));
            now = Stopwatch.GetTimestamp();
        }
        double spacing = previousObservation == 0 ? 0 : (now - previousObservation) * 1000d / Stopwatch.Frequency;
        if (previousObservation != 0)
        {
            minimumCallbackIntervalMs = Math.Min(minimumCallbackIntervalMs, spacing);
            maximumCallbackIntervalMs = Math.Max(maximumCallbackIntervalMs, spacing);
        }
        previousObservation = now;
        observationCount++;
        MoveCameraAndCar();
        link.SubmitObservation(source.PlayerVehicleHandle, vehicle);
        return spacing;
    }

    Dictionary<string, object> Drive(string stage, Func<Dictionary<string, object>, bool> verify)
    {
        var clock = Stopwatch.StartNew();
        Dictionary<string, object> row = null;
        while (clock.ElapsedMilliseconds < 12000)
        {
            SubmitObservation();
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
        }
        throw new TimeoutException("Timed out during " + stage + ". Handoff: " + handoff.Phase + ", " +
            handoff.Reason + ". Last status: " + json.Serialize(row));
    }

    // The live journal retained native transition times and cumulative host
    // counters. It did not retain individual callback arrival times or revs.
    // Use the same authored 20 Hz workload and periodic delivery stalls in
    // both builds. The adapter timestamps its actual acquisitions.
    bool DriveWindow(string stage, int durationMs, string phase, long revision, bool observeExpiry = false)
    {
        var clock = Stopwatch.StartNew();
        var before = ReadStatus();
        for (int tries=0; before==null && tries<3; tries++)
        {
            SubmitObservation();
            Advance();
            before=ReadStatus();
        }
        Require(before != null, "No starting status for " + stage);
        var after = before;
        int tick = 0;
        bool returnedEarly = false;
        object firstSecond = null;
        double minimumIntervalMs = Double.PositiveInfinity, maximumIntervalMs = 0;
        while (clock.ElapsedMilliseconds < durationMs)
        {
            // Hold a ratio through several observations to exercise high-rev
            // racing before changing load. Muted tracking keeps the high ratio.
            source.RevRatio = phase == "Muted" ? 0.83 : (tick / 8) % 2 == 0 ? 0.83 : 0.35;
            double spacing = SubmitObservation();
            minimumIntervalMs = Math.Min(minimumIntervalMs, spacing);
            maximumIntervalMs = Math.Max(maximumIntervalMs, spacing);
            Advance();
            tick++;
            var latest = ReadStatus();
            if (latest != null && Number(latest, "appliedRevision") == revision)
            {
                after = latest;
                if (firstSecond == null && clock.ElapsedMilliseconds >= 1000)
                    firstSecond = new { elapsedMs = clock.ElapsedMilliseconds, observations = tick,
                        deltaStaleFrames = Number(after, "stalePcmFrames") - Number(before, "stalePcmFrames"),
                        deltaDiscardedFrames = Number(after, "discardedFrames") - Number(before, "discardedFrames"),
                        deltaUnderflowFrames = Number(after, "underflowFrames") - Number(before, "underflowFrames"),
                        status = after };
            }
            if (observeExpiry && handoff.Phase == "Releasing" && IsExpiredRelease())
            {
                returnedEarly = true;
                break;
            }
            Require(handoff.Phase == phase, stage + ": " + handoff.Phase + " " + handoff.Reason);
            Require(link.Snapshot.Failure == null, "Host failed during " + stage + ": " + link.Snapshot.Failure);
        }
        Require(Number(after, "appliedRevision") == revision &&
            (returnedEarly || Number(after, "submittedFrames") > Number(before, "submittedFrames")) &&
            Number(after, "outputPeak") >= 0, "Output did not progress during " + stage);
        if (phase == "Muted") Require(Number(after, "outputPeak") == 0, "Muted interval emitted sound");
        stages.Add(new { stage, intendedDurationMs = durationMs, elapsedMs = clock.ElapsedMilliseconds, observations = tick, returnedEarly,
            minimumCallbackIntervalMs = minimumIntervalMs, maximumCallbackIntervalMs = maximumIntervalMs,
            deltaStaleFrames = Number(after, "stalePcmFrames") - Number(before, "stalePcmFrames"),
            deltaUnderflowFrames = Number(after, "underflowFrames") - Number(before, "underflowFrames"),
            deltaDiscardedFrames = Number(after, "discardedFrames") - Number(before, "discardedFrames"),
            before, firstSecond, status = after });
        Console.WriteLine((returnedEarly ? "OBSERVED stock-return deadline during " : "PASS ") + stage + " at the authored callback cadence");
        return returnedEarly;
    }

    bool IsExpiredRelease()
    {
        return releaseReason == "host output progress expired" ||
            (releaseReason != null && releaseReason.Contains("telemetry expired"));
    }

    void WaitForStock()
    {
        var clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < 8000)
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

    object Run(string manifestPath, string fixtureRoot, string termination, bool observeExpiry = false, WorldPose pose = null)
    {
        var configuration = PlayableConfiguration.Load(manifestPath);
        if (pose != null)
        {
            Require(configuration.PowertrainWorld, "Expected retained-world private producer configuration");
            source.CameraPosition = pose.listener;
            source.VehiclePosition = pose.source;
            source.Forward = pose.forward;
        }
        if(passage!=null){
            Require(configuration.PowertrainWorld,"Passage requires the one-car installed-world configuration");
            routeStarted=Stopwatch.GetTimestamp();MoveCameraAndCar();routeStarted=0;
            routeEvents.Clear();shot=null;
        }
        if (performance != null) ApplyPerformanceFrame(performance[0]);
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
            if(contendStatus)
            {
                statusContender=new Thread(ContendWithPublication){IsBackground=true};
                statusContender.Start();
            }
            object reflectionEvidence = null;
            object reflectionSinkInterval = null;
            if (pose != null)
            {
                string proof = Path.Combine(directory, "powertrain-source.json");
                var recent = new List<Dictionary<string,object>> { playing };
                Drive("retained exterior contributed a reflection to tagged Bati output on the ADDER", r =>
                {
                    recent.Add(r);
                    if (recent.Count > 32) recent.RemoveAt(0);
                    var row = ReadSharedJson(proof);
                    if (row == null || Number(row, "reflectionPaths") <= 0 || row["geometry"] == null ||
                        row["provenance"] == null || Number(r, "submittedFrames") <= Number(playing, "submittedFrames") ||
                        Number(r, "outputPeak") <= 0 || handoff.Phase != "Active") return false;
                    var paths = (Dictionary<string,object>)row["provenance"];
                    if (!paths.ContainsKey("reflected")) return false;
                    var reflected = ((System.Collections.IList)paths["reflected"]).Cast<Dictionary<string,object>>();
                    if (!reflected.Any(path => TargetReflection(path, pose))) return false;
                    if (pose.orderedSurfaces != null)
                    {
                        long packet = (long)Number(paths, "packetSequence");
                        if (!session.Equals(paths["session"]) || !vehicle.Equals(paths["vehicleId"]) ||
                            Number(paths,"revision") != 2 || Number(paths,"vehicleGeneration") <= 0 ||
                            Number(paths,"frame") != packet * 512 || Number(paths,"sourceSequence") < 0 ||
                            Number(r,"submittedObservationSequence") < Number(paths,"sourceSequence") ||
                            LastAudibleBlock(r) <= packet) return false;
                        var previous = recent.LastOrDefault(s => LastAudibleBlock(s) >= 0 && LastAudibleBlock(s) < packet);
                        if (previous == null || Number(previous,"audibleSubstitutedFrames") != Number(r,"audibleSubstitutedFrames"))
                            return false;
                        reflectionSinkInterval = new {packet, beforeBlock = LastAudibleBlock(previous), afterBlock = LastAudibleBlock(r),
                            revision = 2, substitutedFrames = 0, underflowFrames = 0};
                    }
                    reflectionEvidence = row;
                    return true;
                });
                WaitForStock();
                Require(IsExpiredRelease(), "Expired world-aware telemetry did not withdraw the voice");
            }
            else if (termination == "disconnect")
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
                Require(IsExpiredRelease(),
                    "Expired telemetry did not cause withdrawal: " + releaseReason);
                Console.WriteLine("PASS lost observation lease withdrew playback and restored stock exactly once");
            }
            else if (performance != null)
            {
                routeStarted=Stopwatch.GetTimestamp();
                DriveWindow("matched clocked performance", (int)Math.Ceiling(performance.Last().seconds*1000), "Active", 2);
                Require(handoff.Restore(Stopwatch.GetTimestamp()) == "accepted", "Stock return refused");
                WaitForStock();
            }
            else
            {
                if(passage!=null)routeStarted=Stopwatch.GetTimestamp();
                if(warmupSeconds>0)
                    DriveWindow("in-process warm-up", warmupSeconds*1000, "Active", 2);
                DriveWindow("initial audible playback", passage==null?3800:12000, "Active", 2);
                Require(handoff.Mute(Stopwatch.GetTimestamp()) == "accepted", "Mute refused");
                var muted = Drive("mute acknowledged only with silent output", r =>
                    handoff.Phase == "Muted" && Number(r, "appliedRevision") == 3 && Number(r, "outputPeak") == 0 &&
                    Number(r, "submittedFrames") > Number(playing, "submittedFrames"));
                source.RevRatio = 0.83;
                Drive("fresh telemetry continued while output stayed muted", r =>
                    handoff.Phase == "Muted" && Number(r, "appliedRevision") == 3 && Number(r, "outputPeak") == 0 &&
                    Number(r, "submittedObservationSequence") > Number(muted, "submittedObservationSequence") &&
                    (passage!=null || Math.Abs(Number(r, "submittedOperatingPoint") - 0.83) < .00001));
                DriveWindow("muted tracking", 2400, "Muted", 3);
                Require(handoff.Resume(Stopwatch.GetTimestamp()) == "accepted", "Resume refused");
                Drive("resume submitted current rev ratio in the new output revision", r =>
                    handoff.Phase == "Active" && Number(r, "appliedRevision") == 4 && Number(r, "outputPeak") > 0 &&
                    (passage!=null || Math.Abs(Number(r, "submittedOperatingPoint") - 0.83) < .00001) &&
                    Number(r, "submittedObservationSequence") > Number(playing, "submittedObservationSequence"));
                bool returnedEarly = DriveWindow("resumed audible playback", passage==null?7600:Math.Max(1000,(passageSeconds-12)*1000), "Active", 4, observeExpiry);
                stopStatusContention=true;
                if(statusContender!=null)Require(statusContender.Join(1000),"Status contender did not stop");
                Require(assignments.Count <= (returnedEarly ? 2 : 1), "Mute or resume performed a native assignment");
                if (!returnedEarly)
                    Require(handoff.Restore(Stopwatch.GetTimestamp()) == "accepted", "Stock return refused");
                WaitForStock();
                var withdrawn = ReadStatus();
                Require(returnedEarly ? link.Snapshot.Ended : withdrawn != null && withdrawn["mode"].Equals("withdraw") &&
                    Number(withdrawn, "appliedRevision") == 5 && Number(withdrawn, "outputPeak") == 0 &&
                    Number(withdrawn, "underflowFrames") == 0,
                    "Stale output remained after withdrawal");
                // Long runs also contain deliberate listener cuts. The
                // private pre-gate/submitted capture classifies their PCM
                // independently of this older all-substitutions assertion.
                if (!observeExpiry && passageSeconds < 180)
                    Require(Number(withdrawn, "resumedSteadyLongestGapFrames") == 0,
                        "Substituted output interrupted qualified resumed playback");
                Console.WriteLine("PASS withdrawal retired source and reached silent output before stock return");
            }
            return new {
                session, termination, stages, assignments, handoffJournal, evidenceDirectory = directory, reflectionEvidence, reflectionSinkInterval,
                observationCount, minimumCallbackIntervalMs, maximumCallbackIntervalMs, contentionCount,
                warmupSeconds, routeStartedQpc = routeStarted, routeEvents,
                transportReceipt = Path.Combine(linkDirectory, "powertrain-transport.json"),
                progressReceipt = Path.Combine(linkDirectory, "powertrain-progress.json"), finalHost = ReadStatus(),
                callbackWitness = CallbackWitness()
            };
        }
        catch (Exception error)
        {
            // Keep the controller alive long enough for an automatic
            // withdrawal to finish so a failing run still emits evidence.
            if (handoff.Phase == "Releasing")
            {
                try { WaitForStock(); }
                catch (Exception cleanup) { Console.Error.WriteLine("Failure cleanup: " + cleanup.Message); }
            }
            File.WriteAllText(Path.Combine(linkDirectory,"fixture-failure.json"),
                json.Serialize(new { error=error.Message, session, evidenceDirectory=directory, stages,
                    assignments, handoffJournal, routeStartedQpc=routeStarted, routeEvents, finalHost=ReadStatus() }));
            Console.Error.WriteLine("Private host evidence: " + directory);
            Console.Error.WriteLine("Handoff journal: " + json.Serialize(handoffJournal));
            throw;
        }
        finally
        {
            stopStatusContention=true;
            if(statusContender!=null)statusContender.Join(1000);
            if (!link.Snapshot.Ended) link.Abort();
        }
    }

    sealed class WorldPose
    {
        public double[] listener { get; set; }
        public double[] source { get; set; }
        public double[] forward { get; set; }
        public string surfaceId { get; set; }
        public string[] orderedSurfaces { get; set; }
    }
    sealed class PassageRoute
    {
        public double[] outside { get; set; }
        public double[] inside { get; set; }
        public double[] forward { get; set; }
        public PerformanceFrame[] performance { get; set; }
    }

    sealed class PerformanceFrame
    {
        public double seconds { get; set; }
        public double[] camera { get; set; }
        public double[] cameraForward { get; set; }
        public double[] cameraUp { get; set; }
        public double[] vehicle { get; set; }
        public double[] forward { get; set; }
        public double[] up { get; set; }
        public double[] velocity { get; set; }
        public double rev { get; set; }
    }

    static bool Vector(double[] values)
    {
        return values!=null && values.Length==3 && values.All(x=>!Double.IsInfinity(x)&&!Double.IsNaN(x));
    }

    static int Main(string[] args)
    {
        bool world = args.Length == 4 && args[2] == "--world-pose";
        bool moving = args.Length>=5 && args[2]=="--passage";
        bool matched = args.Length==4 && args[2]=="--performance";
        if (!moving && !matched && !world && args.Length != 2 && (args.Length != 3 || args[2] != "--observe-baseline-expiry")) return 2;
        try
        {
            string root = Path.GetDirectoryName(args[1]);
            if(matched)
            {
                var serializer=new JavaScriptSerializer{MaxJsonLength=1048576};
                var replay=serializer.Deserialize<PassageRoute>(File.ReadAllText(args[3]));
                var authored=replay==null ? null : replay.performance;
                Require(authored!=null && authored.Length>1 && authored[0].seconds==0 && authored.Last().seconds>=1
                    && authored.Last().seconds<=180
                    && authored.All(f=>Vector(f.camera)&&Vector(f.vehicle)&&Vector(f.forward)&&f.rev>0&&f.rev<=1
                        &&(f.cameraForward==null||Vector(f.cameraForward))&&(f.cameraUp==null||Vector(f.cameraUp))
                        &&(f.velocity==null||Vector(f.velocity))&&(f.up==null||Vector(f.up)))
                    && authored.Zip(authored.Skip(1),(a,b)=>a.seconds<b.seconds).All(x=>x),
                    "Ordered performance frames with valid poses and rev ratios required");
                var playbackPerformance=new TestPowertrainPlayback{performance=authored}.Run(args[0],root,"restore");
                File.WriteAllText(args[1],serializer.Serialize(new{passed=true,fixture="device-free",playbackPerformance}));
                return 0;
            }
            if(moving)
            {
                var serializer=new JavaScriptSerializer{MaxJsonLength=1048576};
                var route=serializer.Deserialize<PassageRoute>(File.ReadAllText(args[3]));
                Require(route!=null && new[]{route.outside,route.inside,route.forward}.All(Vector),"Reconstructed XYZ route required");
                var test=new TestPowertrainPlayback{passage=route,passageSeconds=Int32.Parse(args[4])};
                foreach(string option in args.Skip(5))
                {
                    if(option=="--contend-status") test.contendStatus=true;
                    else if(option.StartsWith("--warmup=", StringComparison.Ordinal)) test.warmupSeconds=Int32.Parse(option.Substring("--warmup=".Length));
                    else throw new ArgumentException("Unknown passage test option");
                }
                Require(test.passageSeconds>=10 && test.passageSeconds<=300 && test.warmupSeconds>=0 && test.warmupSeconds<=60,
                    "Passage fixture timing outside its declared bounds");
                var playbackPassage=test.Run(args[0],root,"restore");
                object loss=null;
                if(!test.contendStatus)
                    loss=new TestPowertrainPlayback{passage=route}.Run(args[0],root,"disconnect");
                File.WriteAllText(args[1],serializer.Serialize(new{passed=true,reconstructed=true,fixture="device-free",playbackPassage,loss}));
                return 0;
            }
            if (world)
            {
                var serializer = new JavaScriptSerializer { MaxJsonLength = 1048576 };
                var pose = serializer.Deserialize<WorldPose>(File.ReadAllText(args[3]));
                Require(pose != null && pose.listener != null && pose.listener.Length == 3 &&
                    pose.source != null && pose.source.Length == 3 && pose.forward != null && pose.forward.Length == 3 &&
                    (pose.orderedSurfaces == null ? !String.IsNullOrEmpty(pose.surfaceId) :
                        pose.orderedSurfaces.Length >= 2 && pose.orderedSurfaces.Length <= 3 &&
                        pose.orderedSurfaces.All(id => !String.IsNullOrEmpty(id))),
                    "Authored pose and target surface or ordered reflection required");
                var playbackWorld = new TestPowertrainPlayback().Run(args[0], root, "world-expiry", pose:pose);
                File.WriteAllText(args[1], serializer.Serialize(new { passed=true, fixture="device-free", authoredObservations=true,
                    nativeAssignmentsAreFixtureActions=true, playbackWorld }));
                return 0;
            }
            bool observeBaselineExpiry = args.Length == 3;
            var playback = new TestPowertrainPlayback().Run(args[0], root, "restore", observeBaselineExpiry);
            var disconnect = new TestPowertrainPlayback().Run(args[0], root, "disconnect");
            var expiry = new TestPowertrainPlayback().Run(args[0], root, "expiry");
            File.WriteAllText(args[1], new JavaScriptSerializer().Serialize(new {
                passed = true, fixture = "device-free", authoredObservations = true, observeBaselineExpiry,
                authoredTiming = "One shared pacing schedule requests 50 ms between acquisitions, or 90 ms every ninth interval. Actual observed spacing is recorded. Operating ratios are held at 0.83 while muted and alternated in eight-observation runs during audible windows.",
                authoredEndpointPrime = "One fixture callback of silence without consuming the ring for each output revision, excluded from substituted-frame counters",
                nativeAssignmentsAreFixtureActions = true, measuredSpeakerLatency = false, playback, disconnect, expiry
            }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
