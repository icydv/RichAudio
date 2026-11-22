using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using GTA;
using RichAudio.Beacon.Transport;
using RichAudio.Integration;
using RichAudio.Integration.Shvdne;

namespace RichAudio.AudioSwitch
{
    internal sealed class PowertrainStatus
    {
        internal readonly string VehicleId, Mode, Failure;
        internal readonly long AppliedRevision, ObservedQpc, RenderedBlocks, SubmittedFrames;
        internal readonly bool Prepared, Ended;
        readonly long validThrough;
        internal bool Fresh { get { return !Ended && Failure == null && validThrough > Stopwatch.GetTimestamp(); } }

        internal PowertrainStatus(string vehicleId, string mode, string failure, long revision,
                                  long observedQpc, long renderedBlocks, long submittedFrames,
                                  long validThrough, bool prepared, bool ended)
        {
            VehicleId = vehicleId; Mode = mode; Failure = failure; AppliedRevision = revision;
            ObservedQpc = observedQpc; RenderedBlocks = renderedBlocks; SubmittedFrames = submittedFrames;
            this.validThrough = validThrough; Prepared = prepared; Ended = ended;
        }
    }

    // Only immutable completed observations cross from SHVDNE to the worker.
    // The worker owns process creation, files, the publisher and shutdown waits.
    internal sealed class PowertrainLink
    {
        sealed class LaunchConfig
        {
            public int Schema { get; set; }
            public string Manifest { get; set; }
            public string ManifestSha256 { get; set; }
            public string HostSha256 { get; set; }
        }
        sealed class HostReport
        {
            public string session { get; set; }
            public int hostPid { get; set; }
            public bool fixture { get; set; }
            public bool endpointStarted { get; set; }
            public string vehicleId { get; set; }
            public string mode { get; set; }
            public long appliedRevision { get; set; }
            public long observedQpc { get; set; }
            public long publicationQpc { get; set; }
            public long lastSubmittedQpc { get; set; }
            public long observationSequence { get; set; }
            public long renderedObservationSequence { get; set; }
            public long submittedObservationSequence { get; set; }
            public long renderedBlocks { get; set; }
            public long submittedFrames { get; set; }
            public long underflowFrames { get; set; }
            public long discardedFrames { get; set; }
            public long stalePcmFrames { get; set; }
            public long audibleFrames { get; set; }
            public long audibleSubstitutedFrames { get; set; }
            public long audibleLongestGapFrames { get; set; }
            public string audibleLongestGapCauses { get; set; }
            public long audibleLongestGapRevision { get; set; }
            public long audibleStaleOnArrivalFrames { get; set; }
            public long audibleStaleWaitingToEnqueueFrames { get; set; }
            public long audibleStaleWaitingFrames { get; set; }
            public double audibleMaxArrivalAgeMs { get; set; }
            public double audibleMaxEnqueueAgeMs { get; set; }
            public double audibleMaxHostEnqueueWaitMs { get; set; }
            public double audibleMaxRingWaitMs { get; set; }
            public float audibleMaxOutputPeak { get; set; }
            public object initialAudibleChronology { get; set; }
            public long initialAudibleLongestGapFrames { get; set; }
            public string initialAudibleLongestGapCauses { get; set; }
            public long resumedAudibleFrames { get; set; }
            public long resumedAudibleSubstitutedFrames { get; set; }
            public long resumedAudibleLongestGapFrames { get; set; }
            public string resumedAudibleLongestGapCauses { get; set; }
            public long resumedAudibleStaleOnArrivalFrames { get; set; }
            public long resumedAudibleStaleWaitingToEnqueueFrames { get; set; }
            public long resumedAudibleStaleWaitingFrames { get; set; }
            public float resumedAudibleMaxOutputPeak { get; set; }
            public object resumedAudibleChronology { get; set; }
            public long resumedSteadyLongestGapFrames { get; set; }
            public string resumedSteadyLongestGapCauses { get; set; }
            public long qpcFrequency { get; set; }
            public double maxCallbackGapMs { get; set; }
            public double maxSubmittedObservationAgeMs { get; set; }
            public double submittedOperatingPoint { get; set; }
            public double outputPeak { get; set; }
            public string failure { get; set; }
        }
        sealed class ProgressRead
        {
            public long readQpc { get; set; }
            public long publicationQpc { get; set; }
            public long observedQpc { get; set; }
            public long lastSubmittedQpc { get; set; }
            public long jointProgressQpc { get; set; }
            public long validThroughQpc { get; set; }
            public long observationSequence { get; set; }
            public long renderedObservationSequence { get; set; }
            public long submittedObservationSequence { get; set; }
            public long renderedBlocks { get; set; }
            public long submittedFrames { get; set; }
            public long revision { get; set; }
            public string mode { get; set; }
            public string waitingFor { get; set; }
        }
        readonly string session, sessionDirectory;
        readonly PowertrainFrames frames;
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8192 };
        volatile PowertrainStatus status = new PowertrainStatus(null, null, null, 0, 0, 0, 0, 0, false, false);
        volatile string sampleFailure;
        volatile bool withdrawing;
        long withdrawRequestedQpc;
        string mode = "prepare";
        long revision = 1;
        string vehicleId;
        GameplayFrame latest;
        OwnedProcessJob containment;
#if POWERTRAIN_FIXTURE
        readonly LaunchConfig fixtureConfig;
#endif

        PowertrainLink(string sessionDirectory, string session, IGameObservationSource source, LaunchConfig fixture = null)
        {
            this.sessionDirectory = sessionDirectory;
            this.session = session;
            frames = new PowertrainFrames(session, source);
#if POWERTRAIN_FIXTURE
            fixtureConfig = fixture;
#endif
            new Thread(Run) { IsBackground = true, Name = "RichAudio one-car host ownership" }.Start();
        }

        internal static PowertrainLink TryCreate(string sessionDirectory)
        {
            string session = Guid.NewGuid().ToString("N");
            return new PowertrainLink(Path.Combine(sessionDirectory, "powertrain-" + session), session,
                new ShvdneGameSource(useEnhancedNativeTelemetry: true));
        }

        internal string EvidenceDirectory { get { return sessionDirectory; } }

#if POWERTRAIN_FIXTURE
        internal static PowertrainLink CreateFixture(string sessionDirectory, string manifest, string manifestSha256,
                                                     string hostSha256, IGameObservationSource source)
        {
            return new PowertrainLink(sessionDirectory, Path.GetFileName(sessionDirectory), source, new LaunchConfig
            {
                Schema = 1, Manifest = manifest, ManifestSha256 = manifestSha256, HostSha256 = hostSha256
            });
        }
        internal void SubmitObservation(int handle, string generation) { SubmitHandle(handle, generation); }
#endif

        internal PowertrainStatus Snapshot
        {
            get
            {
                var current = status;
                var failure = sampleFailure;
                if (failure == null || current.Failure != null) return current;
                // The listening/controller callback sees a useful reason even
                // if this run never produced enough telemetry to start the host.
                return new PowertrainStatus(current.VehicleId, current.Mode, failure, current.AppliedRevision,
                    current.ObservedQpc, current.RenderedBlocks, current.SubmittedFrames, 0, false, current.Ended);
            }
        }

        internal void Submit(Vehicle vehicle, string generation)
        {
            SubmitHandle(vehicle == null ? 0 : vehicle.Handle, generation);
        }

        void SubmitHandle(int handle, string generation)
        {
            if (withdrawing || status.Ended) return;
            if (handle == 0 || (vehicleId != null && vehicleId != generation))
            {
                sampleFailure = "bound ADDER changed";
                Withdraw();
                return;
            }
            try
            {
                var frame = frames.Capture(handle, generation, revision, mode);
                if (frame == null)
                {
                    // A camera cut discards a single frame without cancelling a
                    // healthy stream whose previously accepted lease is current.
                    var reason = frames.Failure;
                    sampleFailure = reason != null && reason.StartsWith("listener-", StringComparison.Ordinal) ? null : reason;
                    Interlocked.Exchange(ref latest, null);
                    return;
                }
                vehicleId = generation;
                sampleFailure = null;
                Interlocked.Exchange(ref latest, frame);
            }
            catch (ThreadAbortException) { throw; }
            catch (Exception e)
            {
                sampleFailure = "SHVDNE vehicle observation failed: " + e.GetType().Name + ": " + e.Message;
                Interlocked.Exchange(ref latest, null);
            }
        }

        internal long SetGain(bool audible)
        {
            if (withdrawing) return revision;
            mode = audible ? "voice" : "mute";
            return ++revision;
        }

        internal long Withdraw()
        {
            if (withdrawing) return revision;
            ++revision;
            Interlocked.Exchange(ref latest, frames.Withdraw(revision));
            Interlocked.Exchange(ref withdrawRequestedQpc, Stopwatch.GetTimestamp());
            withdrawing = true;
            return revision;
        }

        internal void Abort()
        {
            withdrawing = true;
            var job = Volatile.Read(ref containment);
            if (job != null) job.RequestContainmentClose();
        }

        static string Quote(string value)
        {
            if (value.IndexOfAny(new[] { '"', '\r', '\n' }) >= 0) throw new InvalidDataException("literal host path required");
            return "\"" + value + "\"";
        }

        T Read<T>(string path)
        {
            using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(file))
            {
                if (file.Length == 0 || file.Length > 8192) throw new InvalidDataException("invalid powertrain JSON size");
                return json.Deserialize<T>(reader.ReadToEnd());
            }
        }

        LaunchConfig ReadOptIn(string game)
        {
            string path = Path.Combine(Path.GetDirectoryName(game), "scripts", "RichAudio.Powertrain.json");
            PlayableConfiguration.NoLinks(path);
            if (!File.Exists(path)) throw new InvalidDataException("RichAudio.Powertrain.json opt-in is unavailable");
            return Read<LaunchConfig>(path);
        }

        void Run()
        {
            OwnedProcessLifetime host = null;
            GameplayPublisher publisher = null;
            EventWaitHandle ownerStop = null;
            string failure = null;
            string permit = null;
            HostReport last = null, lastProgressReport = null;
            bool ended = false;
            long lastProgress = 0, withdrawnAt = 0, maxSubmissionAge = 0;
            var progressReads = new Queue<ProgressRead>(40);
            long newestObservedPublication = 0;
            try
            {
                Directory.CreateDirectory(sessionDirectory);
                int owner;
                long ownerStart;
                string game;
                using (var self = Process.GetCurrentProcess())
                {
                    owner = self.Id; ownerStart = self.StartTime.ToUniversalTime().Ticks; game = self.MainModule.FileName;
                }
                const string liveMode = "--powertrain-host";
                string launchMode = liveMode;
                LaunchConfig config;
#if POWERTRAIN_FIXTURE
                if (fixtureConfig != null) { config = fixtureConfig; launchMode = "--powertrain-fixture"; }
                else
#endif
                config = ReadOptIn(game);
                if (config == null || config.Schema != 1 || String.IsNullOrWhiteSpace(config.Manifest) ||
                    !Path.IsPathRooted(config.Manifest) || !DigestText(config.ManifestSha256) || !DigestText(config.HostSha256))
                    throw new InvalidDataException("unsupported powertrain opt-in");
                string manifest = Path.GetFullPath(config.Manifest);
                PlayableConfiguration.NoLinks(manifest);
                if (PlayableConfiguration.Digest(manifest) != config.ManifestSha256)
                    throw new InvalidDataException("powertrain manifest changed");
                var package = PlayableConfiguration.Load(manifest);
                if (launchMode == liveMode)
                {
                    if (!String.Equals(game, package.GameExecutable, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("powertrain game binding differs");
                    package.ValidateRuntimeAssembly(typeof(Vehicle).Assembly.Location, "shvdne");
                }
                string executable = PlayableConfiguration.Inside(package.Root, "runtime/RichAudio.Acoustics.Host.exe");
                if (PlayableConfiguration.Digest(executable) != config.HostSha256)
                    throw new InvalidDataException("powertrain host changed");
                string hostDirectory = PlayableConfiguration.Inside(package.Root, ".local/gameplay/" + session);
                string hostStatus = Path.Combine(hostDirectory, "powertrain.json");
                Directory.CreateDirectory(hostDirectory);
                permit = Path.Combine(hostDirectory, "powertrain-start");
                File.WriteAllText(Path.Combine(sessionDirectory, "powertrain-host-location.json"),
                    json.Serialize(new { session, owner, ownerStart, hostStatus, manifest, fixture = launchMode != liveMode }));
                while (!withdrawing && Volatile.Read(ref latest) == null) Thread.Sleep(20);
                if (withdrawing) return;

                string pipe = "RichAudio.Playable01." + owner + "." + session;
                ownerStop = GameplayStopSignal.Create(owner, session);
                var job = new OwnedProcessJob(1536);
                Volatile.Write(ref containment, job);
                if (withdrawing) return;
                string arguments = String.Format(CultureInfo.InvariantCulture,
                    "{0} {1} {2} {3} {4} {5} {6} {7}",
                    launchMode, Quote(manifest), config.ManifestSha256, owner, ownerStart, session, pipe, Quote(permit));
                host = job.StartOwned(executable, arguments, package.Root);
                if (!withdrawing)
                {
                    using (new FileStream(permit, FileMode.CreateNew, FileAccess.Write, FileShare.Read)) { }
                    publisher = new GameplayPublisher(session);
                    publisher.Configure(pipe, host.Id);
                    publisher.Start();
                }
                while (!host.WaitForExit(0))
                {
                    var frame = Interlocked.Exchange(ref latest, null);
                    if (publisher != null && frame != null && (!withdrawing || frame.PowertrainGate == "withdraw"))
                        publisher.Publish(frame);
                    if (withdrawing && withdrawnAt == 0) withdrawnAt = Stopwatch.GetTimestamp();
                    HostReport report = ReadProgress(hostStatus, host.Id, launchMode != liveMode);
                    if (report != null)
                    {
                        if (report.failure != null) { last = report; failure = report.failure; break; }
                        long now = Stopwatch.GetTimestamp();
                        // The evidence lists blocked legs independently. The
                        // handoff keeps its existing joint freshness rule.
                        string waitingFor = null;
                        if (lastProgressReport == null) lastProgressReport = report;
                        else if (report.publicationQpc > newestObservedPublication)
                        {
                            if (report.publicationQpc <= lastProgressReport.publicationQpc) waitingFor += "publication ";
                            if (report.renderedBlocks <= lastProgressReport.renderedBlocks) waitingFor += "renderedBlocks ";
                            if (report.submittedFrames <= lastProgressReport.submittedFrames) waitingFor += "submittedFrames ";
                            if (report.submittedObservationSequence <= lastProgressReport.submittedObservationSequence) waitingFor += "submittedObservationSequence ";
                        }
                        if (report.publicationQpc > lastProgressReport.publicationQpc &&
                            report.renderedBlocks > lastProgressReport.renderedBlocks &&
                            report.submittedFrames > lastProgressReport.submittedFrames &&
                            report.submittedObservationSequence > lastProgressReport.submittedObservationSequence)
                        {
                            lastProgress = report.publicationQpc;
                            lastProgressReport = report;
                        }
                        last = report;
                        long through = ProgressDeadline(report, lastProgress, now);
                        if (report.publicationQpc > newestObservedPublication)
                        {
                            newestObservedPublication = report.publicationQpc;
                            if (progressReads.Count == 40) progressReads.Dequeue();
                            progressReads.Enqueue(new ProgressRead
                            {
                                readQpc=now, publicationQpc=report.publicationQpc, observedQpc=report.observedQpc,
                                lastSubmittedQpc=report.lastSubmittedQpc, jointProgressQpc=lastProgress,
                                validThroughQpc=through, observationSequence=report.observationSequence,
                                renderedObservationSequence=report.renderedObservationSequence,
                                submittedObservationSequence=report.submittedObservationSequence,
                                renderedBlocks=report.renderedBlocks, submittedFrames=report.submittedFrames,
                                revision=report.appliedRevision, mode=report.mode, waitingFor=waitingFor
                            });
                        }
                        // The audio and receive threads publish separate
                        // counters. A torn report cannot replace coherent
                        // evidence; the latter still expires in its own time.
                        if (through > now || report.mode == "withdraw")
                            status = new PowertrainStatus(report.vehicleId, report.mode, null, report.appliedRevision,
                                report.observedQpc, report.renderedBlocks, report.submittedFrames, through, through > now, false);
                        if (report.lastSubmittedQpc > 0 && report.lastSubmittedQpc <= now)
                            maxSubmissionAge = Math.Max(maxSubmissionAge, now - report.lastSubmittedQpc);
                        if (withdrawing && report.mode == "withdraw") break;
                    }
                    if (withdrawnAt != 0 && Stopwatch.GetTimestamp() - withdrawnAt > Stopwatch.Frequency)
                        break;
                    Thread.Sleep(15);
                }
                if (!withdrawing && failure == null)
                {
                    var terminal = ReadProgress(hostStatus, host.Id, launchMode != liveMode, true);
                    if(terminal != null) failure=terminal.failure;
                    failure = failure ?? "powertrain host exited";
                }
            }
            catch (OwnedProcessStartException e)
            {
                failure = e.Message;
                ended = e.ExitVerified;
            }
            catch (Exception e)
            {
                failure = e.GetType().Name + ": " + e.Message;
                ended = host == null;
            }
            finally
            {
                try { if (ownerStop != null) ownerStop.Set(); }
                catch (Exception e) { failure = failure ?? e.Message; }
                try { if (publisher != null) publisher.Dispose(); }
                catch (Exception e) { failure = failure ?? e.Message; }
                var job = Volatile.Read(ref containment);
                if (host != null)
                {
                    int exitWaitMs = 300;
#if POWERTRAIN_FIXTURE
                    // A device-free witness flushes bounded offline PCM
                    // after output withdrawal. Live ownership stays at 300 ms.
                    if (fixtureConfig != null) exitWaitMs = 5000;
#endif
                    ended = host.WaitForExit(exitWaitMs);
                    if (!ended)
                    {
                        if (job != null) job.RequestContainmentClose();
                        ended = host.WaitForExit(1000);
                    }
                    host.Dispose();
                }
                if (job != null) job.Dispose();
                if (ownerStop != null) ownerStop.Dispose();
                if (host == null && failure == null) ended = true;
                status = new PowertrainStatus(last == null ? null : last.vehicleId,
                    last == null ? null : last.mode, failure, last == null ? 0 : last.appliedRevision,
                    last == null ? 0 : last.observedQpc, last == null ? 0 : last.renderedBlocks,
                    last == null ? 0 : last.submittedFrames, 0, false, ended);
                try
                {
                    File.WriteAllText(Path.Combine(sessionDirectory, "powertrain-transport.json"),
                        json.Serialize(new { session, failure, hostExitObserved = ended, finalHost = last,
                            maximumObservationMs = frames.MaximumCallbackMs, maxSubmissionAgeTicks = maxSubmissionAge,
                            clockFrequency = Stopwatch.Frequency, publisher = publisher == null ? null : publisher.Metrics() }));
                }
                catch (IOException) { }
                try
                {
                    var diagnostic = new JavaScriptSerializer { MaxJsonLength = 65536 };
                    File.WriteAllText(Path.Combine(sessionDirectory, "powertrain-progress.json"),
                        diagnostic.Serialize(new { session, clockFrequency=Stopwatch.Frequency,
                            withdrawRequestedQpc=Interlocked.Read(ref withdrawRequestedQpc), reads=progressReads.ToArray() }));
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }

        static bool DigestText(string value) { return value != null && Regex.IsMatch(value, "\\A[0-9a-f]{64}\\z"); }

        HostReport ReadProgress(string primary,int hostPid,bool fixture,bool terminal=false)
        {
            HostReport report=ReadProgressSlot(primary,hostPid,fixture);
            // Keep the original polling cadence. Consult the alternate when
            // the main publication may have missed a write or at shutdown.
            if(terminal || report==null || Stopwatch.GetTimestamp()-report.publicationQpc>=Stopwatch.Frequency*6/100)
            {
                var alternate=ReadProgressSlot(Path.Combine(Path.GetDirectoryName(primary),"powertrain-alternate.json"),hostPid,fixture);
                if(alternate!=null && (report==null || alternate.publicationQpc>report.publicationQpc))report=alternate;
            }
            return report;
        }

        HostReport ReadProgressSlot(string path,int hostPid,bool fixture)
        {
            HostReport row;
            try { row=Read<HostReport>(path); }
            catch(IOException) {return null;}
            if(row.session!=session || row.hostPid!=hostPid || row.fixture!=fixture)
                throw new InvalidDataException("powertrain host report identity changed");
            return row;
        }

        static long ProgressDeadline(HostReport report, long progress, long now)
        {
            if (!report.endpointStarted || report.qpcFrequency != Stopwatch.Frequency ||
                progress <= 0 || progress > now || report.publicationQpc <= 0 || report.publicationQpc > now ||
                report.observedQpc <= 0 || report.observedQpc > report.publicationQpc ||
                report.lastSubmittedQpc <= 0 || report.lastSubmittedQpc > report.publicationQpc ||
                report.observationSequence < 0 || report.renderedObservationSequence < 0 ||
                report.submittedObservationSequence < 0 || report.submittedObservationSequence > report.renderedObservationSequence ||
                report.renderedObservationSequence > report.observationSequence || report.vehicleId == null)
                return 0;
            return Math.Min(Math.Min(report.observedQpc, report.lastSubmittedQpc), progress) + Stopwatch.Frequency / 4;
        }
    }
}
