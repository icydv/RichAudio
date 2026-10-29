using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
#if STATE_TRANSPORT
using RichAudio.Beacon.Transport;
#endif

namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        private static volatile bool stop, producerEnded;
        private static volatile string producerError;
        private static volatile string latestRendererStatus;
        private static bool auditionOutputEnabled;
        private static readonly object inputLock = new object(), logLock = new object();
        private sealed class ControlMessage { internal string Text, ListenerJson; internal long QueuedTicks, Sequence, ObservationTicks; internal double ObservationQpc100ns; }
        private static readonly Queue<ControlMessage> inputQueue = new Queue<ControlMessage>();
        private static readonly AutoResetEvent inputSignal = new AutoResetEvent(false);
        private static volatile bool inputStop;
        private static Thread inputWriter;
        private static double maxListenerHostQueueAgeMs;
        private static long listenerMessagesWritten;
        private static int controlQueueHigh; private static double maximumControlWriteMs;
        private static readonly List<Dictionary<string,object>> listenerReceipts=new List<Dictionary<string,object>>();
        private static Process child;
        private static AcousticSettingsMonitor acousticSettingsMonitor;
        private static volatile string latestAcousticSettingsStatus;
#if GEOMETRY_LIVE
        private static RichAudio.GeometryLive.GeometryHostRelay geometryRelay;
#endif
        private static WasapiOutput output;
        private static readonly List<string> rendererLog = new List<string>();
        private static long droppedLogLines, receivedBlocks, rejectedBlocks;
        private static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 16 };

        [STAThread]
        public static int Main(string[] args)
        {
            if(args.Length==1 && (args[0]=="--help" || args[0]=="-h"))
            {
                Console.WriteLine("RichAudio Windows host\n"+
                    "Acoustic controls (incremental rendering):\n"+
                    "  --acoustic-quality auto|performance|balanced|quality|max\n"+
                    "  --acoustic-acceleration auto|cpu|gpu\n"+
                    "  --acoustic-settings <private .local JSON file>\n"+
                    "  --beacon-output-trim-db 12 enables the bounded geometry audition profile (default 0)\n"+
                    "  --soundmap-config <private .local/soundmap/service.json> enables bounded viewer telemetry and owned post-gain PCM recording\n"+
                    "  --rich-audio-enabled true|false; --rich-audio-output-level 0..1; --early-reflections true|false; --acoustic-diagnostics-overlay true|false\n"+
                    "Saved .local/acoustic-settings.json loads automatically on subsequent incremental launches.\n"+
                    "Build/run build/acoustic-settings/RichAudio.Settings.exe for the five-position slider and independent backend selector.\n"+
                    "Save once before host startup; later changes apply live to a configured host. Active/fallback diagnostics come from the producer.\n"+
                    "Without saved controls or these options, the existing 12-path/default-profile route remains unchanged.\n"+
                    "Known-WAV playback ignores saved incremental preferences and rejects explicit processing controls.\n"+
                    "Other existing options: --root, --scene, --sources, --seconds, --gain, --beacon, --beacon-frequency-hz, --beacon-level,\n"+
                    "  --listener-pipe, --geometry-model, --output, --wav, --device, --list-devices, --probe-device, --autostart, --exercise-controls, --loopback.\n"+
                    "This help command opens no audio endpoint.");return 0;
            }
            string root = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "..", ".."));
            string scene = "open-road", beacon = "harmonic", outputPath = null, wav = null, geometryModel=null; int device = -1, seconds = 15, sources = 1; float gain = .08f;
            double beaconFrequencyHz = 95;
            double beaconLevel = .22;
            double outputTrimDb=0;
            string acousticSettingsPath=null,acousticQuality=null,acousticAcceleration=null,soundMapConfig=null;
            bool? richAudioEnabled=null,earlyReflections=null,diagnosticsOverlay=null;double? acousticOutputLevel=null;
            bool autostart = false, exercise = false, loopback = false, listenerPipe = false, list = false, probe = false;
            try
            {
                for (int i = 0; i < args.Length; i++)
                {
                    string key = args[i];
                    if (key == "--list-devices") list = true;
                    else if (key == "--probe-device") probe = true;
                    else if (key == "--autostart") autostart = true;
                    else if (key == "--exercise-controls") exercise = true;
                    else if (key == "--loopback") loopback = true;
                    else if (key == "--listener-pipe") listenerPipe = true;
                    else
                    {
                        if (i + 1 >= args.Length) throw new ArgumentException("Missing option value"); string value = args[++i];
                        if (key == "--root") root = Path.GetFullPath(value);
                        else if (key == "--scene") scene = value;
                        else if (key == "--beacon") beacon = value;
                        else if (key == "--beacon-frequency-hz") beaconFrequencyHz = double.Parse(value, CultureInfo.InvariantCulture);
                        else if (key == "--beacon-level") beaconLevel = double.Parse(value, CultureInfo.InvariantCulture);
                        else if (key == "--beacon-output-trim-db") outputTrimDb=double.Parse(value,CultureInfo.InvariantCulture);
                        else if (key == "--geometry-model") geometryModel=Path.GetFullPath(value);
                        else if (key == "--acoustic-settings") acousticSettingsPath=value;
                        else if (key == "--soundmap-config") soundMapConfig=Path.GetFullPath(value);
                        else if (key == "--acoustic-quality") acousticQuality=value;
                        else if (key == "--acoustic-acceleration") acousticAcceleration=value;
                        else if (key == "--rich-audio-enabled") richAudioEnabled=bool.Parse(value);
                        else if (key == "--rich-audio-output-level") acousticOutputLevel=double.Parse(value,CultureInfo.InvariantCulture);
                        else if (key == "--early-reflections") earlyReflections=bool.Parse(value);
                        else if (key == "--acoustic-diagnostics-overlay") diagnosticsOverlay=bool.Parse(value);
                        else if (key == "--output") outputPath = value;
                        else if (key == "--wav") wav = Path.GetFullPath(value);
                        else if (key == "--device") device = value == "default" ? -1 : int.Parse(value, CultureInfo.InvariantCulture);
                        else if (key == "--seconds") seconds = int.Parse(value, CultureInfo.InvariantCulture);
                        else if (key == "--sources") sources = int.Parse(value, CultureInfo.InvariantCulture);
                        else if (key == "--gain") gain = float.Parse(value, CultureInfo.InvariantCulture);
                        else throw new ArgumentException("Unknown option " + key);
                    }
                }
                string auditionArguments=AuditionArguments(outputTrimDb,scene,beacon,sources,beaconFrequencyHz,beaconLevel,gain,listenerPipe,geometryModel!=null,wav!=null,autostart||exercise||loopback||list||probe);
                if (list) { string[] devices = WasapiOutput.ListDevices(); for (int i = 0; i < devices.Length; i++) Console.WriteLine(i + ": " + devices[i]); return 0; }
                if (probe) { if(device < -1)throw new ArgumentException("Invalid device index"); Console.WriteLine(json.Serialize(WasapiOutput.ProbeDevice(device))); return 0; }
                if (seconds < 1 || seconds > 120 || sources < 1 || sources > 4 || device < -1 || !new List<string>{"open-road","urban-street","obstructed-corner","enclosure","flyby"}.Contains(scene)) throw new ArgumentException("Host bounds: 1..120 seconds, 1..4 measured sources, known scene, valid endpoint");
                if(!new List<string>{"harmonic","pulse","impulse"}.Contains(beacon))throw new ArgumentException("Unknown owned beacon");
                if(wav!=null&&listenerPipe)throw new ArgumentException("The listener bridge requires incremental rendering; known-WAV playback cannot respond to telemetry");
                if(geometryModel!=null&&(!listenerPipe||wav!=null||sources!=1))throw new ArgumentException("Geometry requires listener pipe, incremental owned source and one source");
                if (float.IsNaN(gain) || float.IsInfinity(gain) || gain < 0 || gain > .25f) throw new ArgumentException("Gain must be 0..0.25; initial default is 0.08");
                BeaconFrequencyArguments(beaconFrequencyHz, beacon, wav != null);
                BeaconLevelArguments(beaconLevel, beacon, wav != null);
                string resolvedSettingsPath;
                var acousticSettings=AcousticSettingsStore.ResolveForLaunch(root,acousticSettingsPath,acousticQuality,acousticAcceleration,wav!=null,out resolvedSettingsPath);
                if(richAudioEnabled.HasValue||acousticOutputLevel.HasValue||earlyReflections.HasValue||diagnosticsOverlay.HasValue){
                    if(wav!=null)throw new ArgumentException("Acoustic processing controls require incremental rendering");
                    acousticSettings=(acousticSettings??AcousticSettings.Defaults(1)).WithAudio(richAudioEnabled,acousticOutputLevel,earlyReflections,diagnosticsOverlay);}
                outputPath = PrivateOutput(root, outputPath ?? Path.Combine(".local", "acoustics07-host-" + Guid.NewGuid().ToString("N")));
                Directory.CreateDirectory(outputPath);
                auditionOutputEnabled=outputTrimDb!=0;
                return Run(root, scene, beacon, sources, seconds, gain, device, autostart, exercise, loopback, listenerPipe, wav, outputPath, beaconFrequencyHz, beaconLevel,geometryModel,acousticSettings,resolvedSettingsPath,soundMapConfig,auditionArguments);
            }
            catch (Exception ex) { Console.Error.WriteLine(ex.GetType().Name + ": " + ex.Message); return 1; }
        }

        internal static string PrivateOutput(string root, string path)
        {
            string prefix = Path.GetFullPath(Path.Combine(root, ".local")) + Path.DirectorySeparatorChar;
            string target = Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(root, path));
            if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || Directory.Exists(target) || File.Exists(target)) throw new ArgumentException("Fresh private .local output required");
            for (DirectoryInfo d = new DirectoryInfo(target); d != null; d = d.Parent) if (d.Exists && (d.Attributes & FileAttributes.ReparsePoint) != 0) throw new ArgumentException("Linked output path rejected");
            return target;
        }

        internal static string BeaconFrequencyArguments(double hz, string beacon, bool knownWav)
        {
            if (double.IsNaN(hz) || double.IsInfinity(hz) || hz < 20 || hz > 2000) throw new ArgumentException("Beacon frequency must be finite, 20..2000 Hz");
            if (hz != 95 && (beacon != "harmonic" || knownWav)) throw new ArgumentException("Custom frequency requires incremental harmonic beacon");
            return hz == 95 ? "" : " --beacon-frequency-hz " + hz.ToString("R", CultureInfo.InvariantCulture);
        }

        internal static string BeaconLevelArguments(double level, string beacon, bool knownWav)
        {
            if (double.IsNaN(level) || double.IsInfinity(level) || level < 0 || level > .5) throw new ArgumentException("Beacon level must be finite, 0..0.5");
            if (level != .22 && (beacon != "harmonic" || knownWav)) throw new ArgumentException("Custom level requires incremental harmonic beacon");
            return level == .22 ? "" : " --beacon-level " + level.ToString("R", CultureInfo.InvariantCulture);
        }

        internal static string AuditionArguments(double db,string scene,string beacon,int sources,double hz,double level,float gain,bool listener,bool geometry,bool wav,bool incompatible)
        {
            if(db==0)return "";
            if(db!=12||scene!="open-road"||beacon!="harmonic"||sources!=1||hz!=600||level!=.44||gain!=.20f||!listener||!geometry||wav||incompatible)
                throw new ArgumentException("Audition trim requires explicit +12dB, one 600Hz/.44 geometry-enabled harmonic source, required listener, gain .20 and manual muted startup without loopback/device probes");
            return " --beacon-output-trim-db 12";
        }

        private static int Run(string root, string scene, string beacon, int sources, int seconds, float gain, int device, bool autostart, bool exercise, bool loopbackEnabled, bool listenerPipe, string wav, string directory, double beaconFrequencyHz, double beaconLevel,string geometryModel,AcousticSettings acousticSettings,string settingsPath,string soundMapConfig,string auditionArguments)
        {
            AppDomain.MonitoringIsEnabled = true;
            long initialAllocated = AppDomain.CurrentDomain.MonitoringTotalAllocatedMemorySize;
            int initialGen0 = GC.CollectionCount(0), initialGen1 = GC.CollectionCount(1), initialGen2 = GC.CollectionCount(2);
            PcmRing ring = new PcmRing(); Thread reader = null, controls = null, stderr = null; LoopbackCapture capture = null;
            OwnedOutputTap ownedRecorder=null;
            var actions = new List<Dictionary<string, object>>(); Stopwatch wall = Stopwatch.StartNew(); Process self = Process.GetCurrentProcess(); TimeSpan initialCpu = self.TotalProcessorTime;
#if STATE_TRANSPORT
            StatePipeServer pipe = null;
#endif
            try
            {
#if GEOMETRY_LIVE
                var geometrySettings=geometryModel==null?null:LoadGeometryModel(root,geometryModel);
#endif
                Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; stop = true; if (output != null) output.Muted = true; };
                if(soundMapConfig!=null)ownedRecorder=new OwnedOutputTap(soundMapConfig);
                if (wav == null)
                {
                    if(acousticSettings!=null)acousticSettingsMonitor=new AcousticSettingsMonitor(root,settingsPath,acousticSettings,
                        delegate(AcousticSettings changed){Send(changed.ControlMessage());});
                    string script = Path.Combine(root, "tools", "Run-Acoustics07.mjs"); if (!File.Exists(script)) throw new FileNotFoundException("Streaming worker is not built", "Run-Acoustics07.mjs");
                    child = new Process { StartInfo = new ProcessStartInfo { FileName = "node.exe", Arguments = Quote(script) + " --scene " + scene + " --sources " + sources + " --beacon " + beacon + BeaconFrequencyArguments(beaconFrequencyHz, beacon, false) + BeaconLevelArguments(beaconLevel, beacon, false) + auditionArguments + (listenerPipe ? " --listener-input required" : "")+(geometryModel!=null?" --geometry-input required":"")+(acousticSettings==null?"":acousticSettings.ProducerArguments())+(soundMapConfig==null?"":" --soundmap-config "+Quote(soundMapConfig)), WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true } };
                    child.Start();
                    inputWriter = new Thread(WriteControls); inputWriter.IsBackground = true; inputWriter.Start();
                    stderr = new Thread(ReadDiagnostics); stderr.IsBackground = true; stderr.Start();
                    if(acousticSettingsMonitor!=null)acousticSettingsMonitor.Start();
                    reader = new Thread(delegate() { ReadBlocks(child.StandardOutput.BaseStream, ring); });
                    Send("{\"type\":\"credit\",\"blocks\":4}");
                    if (autostart) SendControl("start");
                }
                else reader = new Thread(delegate() { ReadWav(wav, ring); });
                reader.IsBackground = true; reader.Start();
                output = new WasapiOutput(ring, device); output.Volume = gain; output.Muted = !autostart;
                output.OwnedRecorder=ownedRecorder;
                if (loopbackEnabled) { capture = new LoopbackCapture(device, seconds + 2); capture.Start(); capture.Ready.WaitOne(3000); }
                output.Start(); if (!output.Ready.WaitOne(5000)) throw new TimeoutException("Endpoint readiness timeout"); if (output.Error != null) throw new InvalidOperationException(output.Error);
#if STATE_TRANSPORT
                if (listenerPipe)
                {
                    pipe = new StatePipeServer("RichAudio.Acoustics07.Listener.v1", ListenerReceived,true,ListenerEnded);
#if GEOMETRY_LIVE
                    if(geometrySettings!=null){geometryRelay=new RichAudio.GeometryLive.GeometryHostRelay(Send,delegate{return pipe.PeerProcessId;},geometrySettings);geometryRelay.Start();}
#else
                    if(geometryModel!=null)throw new NotSupportedException("Geometry relay not included");
#endif
                    pipe.Start();
                }
#else
                if (listenerPipe) throw new NotSupportedException("Listener transport was not included in this build");
#endif
                Console.WriteLine("RichAudio shared output: " + output.EndpointName + ". Commands: start, mute, resume, emit-stop, status, stop. Maximum " + seconds + " seconds; gain " + gain.ToString(CultureInfo.InvariantCulture));
                controls = new Thread(delegate() { string line; while (!stop && (line = Console.ReadLine()) != null) { if (line == "status") { Console.WriteLine("queued=" + ring.Count + " underflowFrames=" + Interlocked.Read(ref ring.UnderflowFrames)); Console.WriteLine(latestRendererStatus ?? "Renderer status pending (or known-WAV mode)."); if(acousticSettingsMonitor!=null)Console.WriteLine(latestAcousticSettingsStatus??"Acoustic settings active status pending."); } else Control(line.Trim()); } }); controls.IsBackground = true; controls.Start();
                bool didMute = false, didResume = false, didEmitStop = false; double drainStart = -1;
                while (!stop && wall.Elapsed.TotalSeconds < seconds)
                {
                    if (output.Error != null || producerError != null) break;
                    int credits = ring.TakeCredits(); if (credits != 0 && child != null && !producerEnded) Send("{\"type\":\"credit\",\"blocks\":" + credits + "}");
                    if (exercise)
                    {
                        if (!didMute && wall.Elapsed.TotalSeconds >= 1) { Control("mute"); didMute = true; actions.Add(Action("mute", wall.Elapsed.TotalMilliseconds, ring.ConsumedFrames)); }
                        if (!didResume && wall.Elapsed.TotalSeconds >= 1.5) { Control("resume"); didResume = true; actions.Add(Action("resume", wall.Elapsed.TotalMilliseconds, ring.ConsumedFrames)); }
                        if (!didEmitStop && wall.Elapsed.TotalSeconds >= Math.Max(2, seconds - 1)) { Control("emit-stop"); didEmitStop = true; actions.Add(Action("emit-stop", wall.Elapsed.TotalMilliseconds, ring.ConsumedFrames)); }
                    }
                    if (producerEnded && ring.Count == 0) { if(drainStart<0)drainStart=wall.Elapsed.TotalMilliseconds; else if(wall.Elapsed.TotalMilliseconds-drainStart>output.BufferFrames/48.0+output.StreamLatency100ns/10000.0+20)break; }
                    Thread.Sleep(2);
                }
            }
            catch (Exception ex) { producerError = ex.GetType().Name + ": " + ex.Message; }
            finally
            {
                stop = true; if (output != null) { output.Muted = true; try { output.Dispose(); } catch(Exception ex) { producerError="Output shutdown: "+ex.GetType().Name; } }
#if STATE_TRANSPORT
                if (pipe != null) pipe.Dispose();
#endif
#if GEOMETRY_LIVE
                if(geometryRelay!=null)geometryRelay.Dispose();
#endif
                if (capture != null) { try { capture.Dispose(); } catch(Exception ex) { producerError="Capture shutdown: "+ex.GetType().Name; } }
                if(ownedRecorder!=null)ownedRecorder.Dispose();
                if (child != null)
                {
                    SendControl("stop");
                    if (!child.WaitForExit(2500)) { child.Kill(); child.WaitForExit(2000); if(producerError==null)producerError="Renderer did not acknowledge bounded shutdown; owned child terminated"; }
                    else if(child.ExitCode!=0 && producerError==null)producerError="Renderer exited with code "+child.ExitCode;
                    inputStop=true;inputSignal.Set();if(inputWriter!=null&&inputWriter.IsAlive)inputWriter.Join(1000);
                    try { child.StandardInput.Close(); } catch (IOException) { }
                }
                if (reader != null && reader.IsAlive) reader.Join(1000); if (stderr != null && stderr.IsAlive) stderr.Join(1000);
                if(acousticSettingsMonitor!=null)acousticSettingsMonitor.Dispose();
                self.Refresh();
                var result = new Dictionary<string, object> {
                    {"schemaVersion",1},{"backend","WASAPI shared event-driven, exact Float32 stereo 48k"},{"mode",wav == null ? "incremental-streaming" : "known-WAV-device-test"},{"scene",scene},{"beacon",beacon},{"sources",sources},{"terminationReason",producerError!=null?"failure":wall.Elapsed.TotalSeconds>=seconds?"duration-limit":"controlled-stop"},{"durationWallSeconds",wall.Elapsed.TotalSeconds},{"gain",gain},
                    {"cpuSeconds",(self.TotalProcessorTime-initialCpu).TotalSeconds},{"workingSetBytes",self.WorkingSet64},{"privateBytes",self.PrivateMemorySize64},{"managedHeapBytes",GC.GetTotalMemory(false)},
                    {"managedAllocatedBytes",AppDomain.CurrentDomain.MonitoringTotalAllocatedMemorySize-initialAllocated},{"allocationScope","Host AppDomain, all threads; not isolated audio callback allocation measurement"},{"gen0Collections",GC.CollectionCount(0)-initialGen0},{"gen1Collections",GC.CollectionCount(1)-initialGen1},{"gen2Collections",GC.CollectionCount(2)-initialGen2},
                    {"receivedBlocks",receivedBlocks},{"rejectedBlocks",rejectedBlocks},{"producerError",producerError},{"rendererExitCode",child != null && child.HasExited ? (object)child.ExitCode : null},
                    {"audio",output != null ? output.Metrics() : null},{"actions",actions},{"rendererDiagnosticsDropped",droppedLogLines},{"listening","not confirmed"},{"loopback",capture != null ? capture.Metrics() : null}
                };
                result["beaconFrequencyHz"] = beaconFrequencyHz;
                result["beaconLevel"] = beaconLevel;
                result["beaconOutputTrimDb"]=auditionOutputEnabled?12:0;
                result["ownedRecorder"] = ownedRecorder==null?null:ownedRecorder.Metrics();
                if(acousticSettingsMonitor!=null)result["acousticSettings"]=acousticSettingsMonitor.Metrics();
#if GEOMETRY_LIVE
                if(geometryRelay!=null){result["geometryRelay"]=geometryRelay.Metrics();var rejected=geometryRelay.RejectedEvidence();if(rejected!=null)
                    using(var file=new FileStream(Path.Combine(directory,"geometry-rejected.bin"),FileMode.CreateNew,FileAccess.Write))file.Write(rejected,0,rejected.Length);}
#endif
                result["listenerForwarding"]=new Dictionary<string,object>{{"written",listenerMessagesWritten},{"maxHostQueueAgeMs",maxListenerHostQueueAgeMs},{"first128Receipts",listenerReceipts},{"remainingClockUncertainty","Anonymous-pipe transit after write plus Windows device buffering are separate from acoustic delay"}};
#if STATE_TRANSPORT
                if (pipe != null) result["transport"] = new Dictionary<string,object>{{"accepted",pipe.Accepted},{"rejected",pipe.Rejected},{"connections",pipe.Connections},{"lastAgeMs",pipe.Accepted>0?(object)pipe.LastAgeMs:null},{"error",pipe.Error},{"diagnostic",pipe.Diagnostic},{"strict",true},{"outputMuted",output==null||output.Muted},{"hostStopped",stop}};
#endif
                WriteNew(Path.Combine(directory, "host-result.json"), json.Serialize(result));
                lock (logLock) WriteNew(Path.Combine(directory, "renderer-diagnostics.txt"), string.Join(Environment.NewLine, rendererLog.ToArray()));
                if (capture != null) capture.Save(Path.Combine(directory, "loopback.wav"));
                Console.WriteLine("Host stopped. Underflow frames: " + ring.UnderflowFrames + "; peak submitted: " + ring.Peak.ToString("G6", CultureInfo.InvariantCulture) + "; output: " + directory);
                if (child != null) child.Dispose();
            }
            return producerError != null || (output != null && output.Error != null) ? 1 : 0;
        }
        private static Dictionary<string, object> Action(string name, double ms, long frame) { return new Dictionary<string,object>{{"command",name},{"hostMs",ms},{"consumedFrame",frame},{"qpc100ns",Stopwatch.GetTimestamp()*(10000000.0/Stopwatch.Frequency)}}; }
        internal static double ObservationAgeAtWrite(long observed,long now,long frequency){return Math.Max(0,(now-observed)*1000.0/frequency);}
        internal static void ListenerReceived(ListenerState state,double age){
#if GEOMETRY_LIVE
            if(geometryRelay!=null){geometryRelay.Listener(state);return;}
#endif
            Enqueue(new ControlMessage{ListenerJson=Protocol.EncodeJson(state),ObservationTicks=state.ObservationTicks,QueuedTicks=Stopwatch.GetTimestamp(),Sequence=state.Sequence,ObservationQpc100ns=state.ObservationTicks*(10000000.0/state.ClockFrequency)});}
        internal static void ListenerEnded(TransportResult ending){if(output!=null)output.Muted=true;stop=true;if(ending.Outcome!="deliberate-stop")producerError="Listener terminal: "+ending.Stage+"/"+ending.Code;Console.WriteLine("Listener terminal "+json.Serialize(ending)+"; owned output muted/stopping");stop=true;}
        private static void Control(string command)
        {
            if (command == "stop") { stop = true; if (output != null) output.Muted = true; }
            else if (command == "mute") { if (output != null) output.Muted = true; }
            else if (command == "start" || command == "resume") { if (output != null && output.Error == null) output.Muted = false; SendControl(command); }
            else if (command == "emit-stop") SendControl(command);
        }
        private static void SendControl(string command) { Send("{\"type\":\"control\",\"command\":\"" + command + "\"}"); }
        private static void ReadDiagnostics()
        {
            try { ReadDiagnosticsCore(); }
            catch(IOException ex) { if(!stop)producerError="Diagnostic pipe closed: "+ex.GetType().Name; }
            catch(ObjectDisposedException) { if(!stop)producerError="Diagnostic pipe disposed"; }
        }
        private static void ReadDiagnosticsCore()
        {
            var line=new StringBuilder(1024);var chars=new char[2048];bool overlong=false;int count;
            while((count=child.StandardError.Read(chars,0,chars.Length))>0)
            {
                for(int i=0;i<count;i++)
                {
                    if(chars[i]=='\n')
                    {
                        RememberDiagnostic(line.ToString(),overlong);
                        line.Length=0;overlong=false;
                    }
                    else if(chars[i]!='\r') { if(line.Length<16384)line.Append(chars[i]);else overlong=true; }
                }
            }
            if(line.Length>0||overlong)RememberDiagnostic(line.ToString(),overlong);
        }
        private static void RememberDiagnostic(string line,bool overlong)
        {
            if(!overlong && line.StartsWith("{\"type\":\"acoustic-settings-status\",",StringComparison.Ordinal))
            {latestAcousticSettingsStatus=line;if(acousticSettingsMonitor!=null)acousticSettingsMonitor.PublishStatus(line);}
#if GEOMETRY_LIVE
            if(!overlong&&geometryRelay!=null)geometryRelay.Diagnostic(line);
#endif
            if(!overlong && line.StartsWith("{\"type\":\"status\",",StringComparison.Ordinal))latestRendererStatus=line;
            lock(logLock){if(!overlong&&rendererLog.Count<4096)rendererLog.Add(line);else droppedLogLines++;}
        }
        private static void Send(string message)
        {
            if (child == null) return;
            int maximum=16384;
#if GEOMETRY_LIVE
            if(geometryRelay!=null)maximum=65536;
#endif
            if(message.Length>maximum){producerError="Control message size limit";return;}
            Enqueue(new ControlMessage{Text=message,QueuedTicks=Stopwatch.GetTimestamp()});
        }
        private static void Enqueue(ControlMessage message)
        {
            if(child==null)return;
            lock(inputLock){if(inputQueue.Count>=64){producerError="Bounded control queue overflow";return;}inputQueue.Enqueue(message);controlQueueHigh=Math.Max(controlQueueHigh,inputQueue.Count);}inputSignal.Set();
        }
        private static void WriteControls()
        {
            try
            {
                // Framework Process.StandardInput inherits a console-dependent
                // encoding, which can prepend a BOM to the first JSON frame.
                // Own the byte encoding; no locale or console settings change.
                using(var controlWriter=new StreamWriter(child.StandardInput.BaseStream,new UTF8Encoding(false,true)))
                {
                while(!inputStop)
                {
                    ControlMessage message=null;lock(inputLock){if(inputQueue.Count>0)message=inputQueue.Dequeue();}
                    if(message==null){inputSignal.WaitOne(50);continue;}
                    string text=message.Text;
                    if(message.ListenerJson!=null)
                    {
                        long now=Stopwatch.GetTimestamp();double queueMs=(now-message.QueuedTicks)*1000.0/Stopwatch.Frequency;
                        maxListenerHostQueueAgeMs=Math.Max(maxListenerHostQueueAgeMs,queueMs);double totalAge=ObservationAgeAtWrite(message.ObservationTicks,now,Stopwatch.Frequency);
                        text="{\"type\":\"listener\",\"receiptAgeMs\":"+totalAge.ToString("R",CultureInfo.InvariantCulture)+",\"state\":"+message.ListenerJson+"}";
                        if(listenerReceipts.Count<128)listenerReceipts.Add(new Dictionary<string,object>{{"sequence",message.Sequence},{"observationQpc100ns",message.ObservationQpc100ns},{"writeQpc100ns",now*(10000000.0/Stopwatch.Frequency)},{"receiptAgeMs",totalAge},{"hostQueueAgeMs",queueMs}});
                    }
                    long writeStart=Stopwatch.GetTimestamp();controlWriter.WriteLine(text);controlWriter.Flush();maximumControlWriteMs=Math.Max(maximumControlWriteMs,(Stopwatch.GetTimestamp()-writeStart)*1000.0/Stopwatch.Frequency);if(message.ListenerJson!=null)listenerMessagesWritten++;
                }
                }
            }
            catch (IOException ex) { if (!stop) producerError = "Control pipe closed: " + ex.GetType().Name; }
            catch (ObjectDisposedException) { }
            catch (InvalidOperationException) { if (!stop) producerError = "Control producer unavailable"; }
        }
        private static void ReadBlocks(Stream stream, PcmRing ring)
        {
            byte[] header = new byte[16], payload = new byte[4096]; float[] samples = new float[1024]; uint sequence = 0;
            try
            {
                while (!stop && BlockProtocol.ReadExact(stream, header, header.Length))
                {
                    int frames = BlockProtocol.ValidateHeader(header, sequence++);
                    if (!BlockProtocol.ReadExact(stream, payload, frames * 8)) throw new EndOfStreamException("Missing PCM payload");
                    Buffer.BlockCopy(payload, 0, samples, 0, frames * 8);
                    if(auditionOutputEnabled)for(int i=0;i<frames*2;i++)if(float.IsNaN(samples[i])||float.IsInfinity(samples[i])||Math.Abs(samples[i])>.5f)throw new InvalidDataException("Audition pre-master ceiling violated");
                    if (!ring.TryWrite(samples, frames)) throw new InvalidDataException("Producer exceeded granted PCM credits"); receivedBlocks++;
                }
            }
            catch (Exception ex) { if (!stop) { rejectedBlocks++; producerError = ex.GetType().Name + ": " + ex.Message; } }
            finally { if(producerError==null)ring.EndOfStream=true; producerEnded = true; }
        }
        private static void ReadWav(string filename, PcmRing ring)
        {
            try
            {
                using (FileStream stream = new FileStream(filename, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (BinaryReader reader = new BinaryReader(stream))
                {
                    if (stream.Length < 44 || stream.Length > 48000L*2*2*120+4096 || new string(reader.ReadChars(4)) != "RIFF") throw new InvalidDataException("Bounded PCM WAV required");
                    if(reader.ReadUInt32()!=stream.Length-8)throw new InvalidDataException("RIFF length mismatch"); if (new string(reader.ReadChars(4)) != "WAVE") throw new InvalidDataException("WAVE header"); bool format = false, found = false;
                    while (stream.Position + 8 <= stream.Length)
                    {
                        string chunk = new string(reader.ReadChars(4)); uint bytes = reader.ReadUInt32(); long end = stream.Position + bytes; if (end > stream.Length) throw new InvalidDataException("Truncated WAV");
                        if (chunk == "fmt ") { if (bytes < 16 || reader.ReadUInt16() != 1 || reader.ReadUInt16() != 2 || reader.ReadUInt32() != 48000 || reader.ReadUInt32() != 192000 || reader.ReadUInt16() != 4 || reader.ReadUInt16() != 16) throw new NotSupportedException("Device test accepts only PCM16 stereo 48k WAV"); format = true; }
                        else if (chunk == "data")
                        {
                            if (!format || bytes == 0 || bytes % 4 != 0) throw new InvalidDataException("WAV format/data order"); found = true; float[] samples = new float[1024]; long remain = bytes / 4;
                            while (!stop && remain > 0) { int frames = (int)Math.Min(512, remain); for (int i = 0; i < frames * 2; i++) samples[i] = reader.ReadInt16() / 32768f; while (!stop && !ring.TryWrite(samples, frames)) Thread.Sleep(1); receivedBlocks++; remain -= frames; }
                            break;
                        }
                        stream.Position = end + (bytes & 1);
                    }
                    if (!found) throw new InvalidDataException("No WAV data");
                }
            }
            catch (Exception ex) { if (!stop) producerError = ex.GetType().Name + ": " + ex.Message; }
            finally { if(producerError==null)ring.EndOfStream=true; producerEnded = true; }
        }
        private static string Quote(string text) { if (text.IndexOf('"') >= 0) throw new ArgumentException("Unsupported quote in path"); return "\"" + text + "\""; }
        private static void WriteNew(string path, string text) { using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write)) using (var writer = new StreamWriter(file, new UTF8Encoding(false))) writer.Write(text); }
    }
}
