// Bounded, credit-paced live PCM producer. stdout is exclusively RA07 binary.
// The Windows endpoint thread never runs this JavaScript or the geometry solver.
import { Worker } from "node:worker_threads";
import { StreamingRenderer } from "../src/acoustics/streaming/causal.mjs";
import { ListenerPlayout } from "../src/acoustics/streaming/listener-playout.mjs";
import { StartupGate } from "../src/acoustics/streaming/startup-gate.mjs";
import {
  OrientationPresentation,
  orientationTiming,
} from "../src/acoustics/streaming/orientation-presentation.mjs";
import { createHash } from "node:crypto";
import { DEFAULT_BEACON_FREQUENCY_HZ, DEFAULT_BEACON_LEVEL, validateBeaconFrequencyHz, validateBeaconLevel } from "../src/acoustics/streaming/beacon-frequency.mjs";
import { liveGeometryLimits } from '../src/acoustics/streaming/observed-live.mjs';
import { GeometryRelayGate } from '../src/acoustics/streaming/geometry-relay.mjs';
import {validateAcousticSettings} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {scenario as acousticScenario} from './acoustics-08-2-scenes.mjs';

const args = process.argv.slice(2),
  options = {
    scene: "open-road",
    sources: 1,
    beacon: "harmonic",
    frequencyHz: DEFAULT_BEACON_FREQUENCY_HZ,
    level: DEFAULT_BEACON_LEVEL,
    delayMs: 100,
    headless: false,
    trace: false,
    required: false,
    diagnostics: false,
    orientation: false,
    barrierFrame: null,
    geometry: false,
    acousticQuality:null,acousticAcceleration:null,acousticBenchmark:null,
  };
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === "--scene") options.scene = args[i + 1];
  else if (args[i] === "--sources") options.sources = Number(args[i + 1]);
  else if (args[i] === "--beacon") options.beacon = args[i + 1];
  else if (args[i] === "--beacon-frequency-hz") options.frequencyHz = Number(args[i + 1]);
  else if (args[i] === "--beacon-level") options.level = Number(args[i + 1]);
  else if (args[i] === "--listener-delay-ms")
    options.delayMs = Number(args[i + 1]);
  else if (args[i] === "--headless-clock" && args[i + 1] === "audio")
    options.headless = true;
  else if (args[i] === "--trace-blocks" && args[i + 1] === "yes")
    options.trace = true;
  else if (args[i] === "--listener-input" && args[i + 1] === "required")
    options.required = true;
  else if (args[i] === '--geometry-input' && args[i+1] === 'required') options.geometry=true;
  else if (args[i] === "--history-diagnostics" && args[i + 1] === "yes")
    options.diagnostics = true;
  else if (args[i] === "--experimental-orientation" && args[i + 1] === "50ms")
    options.orientation = true;
  else if (args[i] === "--headless-barrier-frame")
    options.barrierFrame = Number(args[i + 1]);
  else if(args[i]==='--acoustic-quality')options.acousticQuality=args[i+1];
  else if(args[i]==='--acoustic-acceleration')options.acousticAcceleration=args[i+1];
  else if(args[i]==='--acoustic-benchmark')options.acousticBenchmark=args[i+1];
  else throw Error("Unknown producer option");
}
if (
  ![
    "open-road",
    "urban-street",
    "obstructed-corner",
    "enclosure",
    "flyby",
  ].includes(options.scene) ||
  !Number.isInteger(options.sources) ||
  options.sources < 1 ||
  options.sources > 16 ||
  !["harmonic", "pulse", "impulse"].includes(options.beacon)
)
  throw Error("Scene/source/beacon budget");
options.acousticSettings=options.acousticQuality!==null||options.acousticAcceleration!==null?
  validateAcousticSettings({acousticQuality:options.acousticQuality??'auto',acousticAcceleration:options.acousticAcceleration??'auto'}):null;
if(options.acousticBenchmark&&(!options.headless||!options.trace||!options.acousticSettings||options.geometry||
  !['small','enclosure','demanding'].includes(options.acousticBenchmark)))throw Error('Explicit device-free acoustic benchmark scope');
validateBeaconFrequencyHz(options.frequencyHz);
validateBeaconLevel(options.level);
if ((options.frequencyHz !== DEFAULT_BEACON_FREQUENCY_HZ || options.level !== DEFAULT_BEACON_LEVEL) && options.beacon !== "harmonic")
  throw Error("Custom frequency/level is supported for the harmonic beacon only");
if (options.orientation && options.delayMs !== 100)
  throw Error("Orientation experiment requires the 100 ms spatial policy");
if(options.geometry){
  if(options.orientation)throw Error('Observed geometry uses the existing buffered pose policy; orientation experiment unsupported');
  options.required=true;
}
if (
  options.barrierFrame !== null &&
  (!options.headless ||
    !options.trace ||
    !Number.isInteger(options.barrierFrame) ||
    options.barrierFrame < 0 ||
    options.barrierFrame > 480000 ||
    options.barrierFrame % 512)
)
  throw Error("Headless barrier budget");
const FS = 48000,
  BLOCK = 512,
  ids = Array.from({ length: options.sources }, (_, i) => "beacon-" + i);
const renderer = new StreamingRenderer({
    sourceIds: ids,
    historyDiagnostics: options.diagnostics,
    generationReleaseGuard:options.geometry,
    ...(options.acousticSettings?{pathCapacityPerSource:64}:{}),
  }),
  worker = new Worker(
    new URL(
      "../src/acoustics/streaming/simulation-worker.mjs",
      import.meta.url,
    ),
    { workerData: { scene: options.scene, geometry:options.geometry, sourceIds:ids, controlledClock:options.headless,
      acousticSettings:options.acousticSettings,acousticBenchmark:options.acousticBenchmark } },
  );
const listenerPlayout = new ListenerPlayout({ delayMs: options.delayMs });
const orientation = options.orientation ? new OrientationPresentation() : null;
let barrier = null,
  orientationDiagnostic = null;
const startup = new StartupGate();
const benchmarkScene=options.acousticBenchmark?acousticScenario(options.acousticBenchmark,{sources:options.sources}):null;
let pendingAcousticSettings=null,acousticRevision=0,lastAcousticFeedback=null,lastAcousticStatus=null,lastAcousticStatusKey=null;
let startupIdentity = null,
  lifecycle = "initial-priming",
  priorPaths = "";
// Explicit silent replay clock. The normal host continues to use the monotonic wall clock.
const receiptClock = () =>
  options.headless ? (renderer.frame / FS) * 1000 : performance.now();
const inputs = Object.fromEntries(
  ids.map((id) => [id, new Float32Array(BLOCK)]),
);
const left = new Float32Array(BLOCK),
  right = new Float32Array(BLOCK),
  packet = Buffer.alloc(16 + BLOCK * 8);
const stats = {
  blocks: 0,
  listenerMessages: 0,
  listenerRejected: 0,
  listenerSuperseded: 0,
  maxReceiptAgeMs: 0,
  maxNodeQueueAgeMs: 0,
  simulationMs: [],
  dspMs: [],
  orientationMs: [],
  pathMinimum: Infinity,
  pathMaximum: 0,
  listenerMode: "synthetic-metric",
  controlCadenceFrames: BLOCK,
};
const cpuStart = process.cpuUsage(),
  wallStart = performance.now();
let credits = 0,
  inFlight = 0,
  running = false,
  stopping = false,
  enabled = false,
  gain = 0,
  sequence = 0,
  requestId = 0,
  pending = null,
  inputText = "",
  external = null;
let geometryEvents=[];
const geometryRelay=options.geometry&&!options.headless?new GeometryRelayGate({now:receiptClock,log,
  apply:({listener,messages,at,elapsed,delivery})=>{
    if(geometryEvents.length+messages.length>liveGeometryLimits.events)throw Error('relay geometry queue bound');
    // Presentation uses conservative age; the geometry clock retains the lower
    // receipt age and its separately measured interval, avoiding double counting.
    const upperAge=listener.receiptAgeMs+elapsed+delivery.maximumMs;
    const accepted=listenerPlayout.add({...listener,receiptAgeMs:upperAge},renderer.frame/FS,receiptClock());
    external={state:accepted.state,receiptAgeMs:listener.receiptAgeMs,receivedAt:at,pendingReceipt:true,
      audioTime:renderer.frame/FS,delivery};
    stats.listenerMessages++;stats.maxReceiptAgeMs=Math.max(stats.maxReceiptAgeMs,upperAge);
    geometryEvents.push(...messages);
  },unavailable:event=>{if(event){geometryEvents=[];geometryEvents.push(event);}}}):null;
let lastControl = null,
  lastPlayout = null;
const phase = new Float64Array(options.sources);
function log(value) {
  process.stderr.write(JSON.stringify(value) + "\n");
}
function summary(values) {
  const s = values.slice().sort((a, b) => a - b);
  return {
    count: s.length,
    median: s[Math.floor(s.length * 0.5)] ?? 0,
    p95: s[Math.floor(s.length * 0.95)] ?? 0,
    max: s.at(-1) ?? 0,
  };
}
async function finish(error) {
  if (stopping) return;
  stopping = true;
  enabled = false;
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(Error("Producer stopping"));
    pending = null;
  }
  if (barrier) {
    clearTimeout(barrier.timer);
    barrier.reject(Error("Producer stopping"));
    barrier = null;
  }
  if(options.acousticSettings){
    await new Promise(resolve=>{const done=m=>{if(m.type==='acoustic-shutdown'){clearTimeout(timer);worker.off('message',done);resolve();}};
      const timer=setTimeout(()=>{worker.off('message',done);resolve();},100);worker.on('message',done);worker.postMessage({type:'acoustic-shutdown'});});
  }
  await worker.terminate();
  const memory = process.memoryUsage(),
    cpu = process.cpuUsage(cpuStart);
  log({
    type: "final",
    beaconFrequencyHz: options.frequencyHz,
    beaconLevel: options.level,
    error: error?.message ?? null,
    frames: renderer.frame,
    wallSeconds: (performance.now() - wallStart) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    statistics: {
      ...stats,
      pathMinimum: Number.isFinite(stats.pathMinimum) ? stats.pathMinimum : 0,
      simulationMs: summary(stats.simulationMs),
      dspMs: summary(stats.dspMs),
      orientationMs: summary(stats.orientationMs),
    },
    dsp: renderer.stats,
    historyDiagnostics: renderer.historyDiagnostics,
    startup,
    simulation: lastControl?.stats ?? null,
    geometry: lastControl?.geometry ?? null,
    geometryRelay: geometryRelay?.stats ?? null,
    ...(options.acousticSettings?{acousticSettings:lastAcousticStatus}:{}),
    listenerPlayout: listenerPlayout.stats,
    orientation: orientation?.stats ?? null,
    ownedArrayBytes: renderer.ownedArrayBytes,
    memory,
    clockModel: options.headless
      ? "Explicit silent replay: receipt clock equals produced audio frames; no endpoint or hardware latency"
      : "Receipt age plus Node queue age; audio render clock leads endpoint by bounded queues, no hardware timestamp alignment",
    subjectiveListening: options.headless
      ? "not assessed; silent offline run"
      : "pending",
  });
  process.stdin.pause();
  process.exitCode = error ? 1 : 0;
}
worker.on("error", (e) => finish(e));
worker.on("message", (m) => {
  if (!pending || m.id !== pending.id) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  if (m.error) p.reject(Error(m.error));
  else p.resolve(m);
});
function simulate(snapshot, now) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      pending = null;
      reject(Error("Simulation worker deadline exceeded"));
    }, 1000);
    const scheduled=performance.now();pending = { id, resolve:m=>resolve({...m,schedulingMilliseconds:performance.now()-scheduled}), reject, timer };
    const events=geometryEvents;geometryEvents=[];
    let anchor=null;
    if(options.geometry&&external){
      const before=process.hrtime.bigint(),age=Math.max(0,receiptClock()-external.receivedAt),after=process.hrtime.bigint();
      anchor={state:external.state,receiptAgeMs:external.receiptAgeMs,queueAgeMs:age,delivery:external.delivery,
        dispatchNs:((before+after)/2n).toString(),dispatchUncertaintyMs:options.headless?0:Number(after-before)/2e6+.001};
    }
    worker.postMessage({ id, snapshot, now, geometryEvents:events,anchor,
      acousticSettings:pendingAcousticSettings,acousticFeedback:lastAcousticFeedback });
    pendingAcousticSettings=null;
  });
}
function baseListener() {
  return {
    position: options.scene === "flyby" ? [0, 6, 1] : [5, 0, 1],
    velocity: [0, 0, 0],
    forward: options.scene === "flyby" ? [0, 1, 0] : [-1, 0, 0],
    up: [0, 0, 1],
    generation: 1,
    valid: true,
  };
}
function sourceStates(time, externalMode) {
  return ids.map((id, i) => {
    let position = [-5, i * 0.4, 1],
      velocity = [0, 0, 0];
    if (options.scene === "flyby" && !externalMode) {
      const angle = (time - 3) * 0.35;
      position = [35 * Math.sin(angle), i * 0.4, 1];
      velocity = [12.25 * Math.cos(angle), 0, 0];
    }
    return {
      id,
      generation: 1,
      position,
      velocity,
      forward: [1, 0, 0],
      up: [0, 0, 1],
      directivity: 0.2,
      valid: true,
      emitting: enabled,
    };
  });
}
function snapshot(now) {
  if(benchmarkScene&&!external){const s=benchmarkScene.snapshot(now);return {...s,emitting:enabled,
    sources:s.sources.map(source=>({...source,emitting:enabled}))};}
  if(options.geometry){
    if(!external)return null;
    lastPlayout=listenerPlayout.sample(now,receiptClock());
    const s=lastPlayout.state??external.state;
    stats.listenerMode='mapped-native-observed-geometry';
    return {time:now,session:s.session,generation:s.generation,paused:s.paused,emitting:enabled,
      listener:{...s,valid:Boolean(lastPlayout.state)&&
        !(lastPlayout.mode==='predicted'&&s.velocityKind==='unavailable')}};
  }
  if (!external)
    return {
      time: now,
      session: "synthetic-owned",
      generation: 1,
      listener: { ...baseListener(), valid: !options.required },
      sources: sourceStates(now, false),
      paused: false,
    };
  if (external.pendingReceipt) {
    stats.maxNodeQueueAgeMs = Math.max(
      stats.maxNodeQueueAgeMs,
      receiptClock() - external.receivedAt,
    );
    external.pendingReceipt = false;
  }
  lastPlayout = listenerPlayout.sample(now, receiptClock());
  const s = lastPlayout.state ?? external.state;
  const native = s.coordinates === "gta-native-unscaled";
  const listener = {
    ...baseListener(),
    position: native ? baseListener().position : s.position,
    velocity: native ? [0, 0, 0] : s.velocity,
    forward: s.forward,
    up: s.up,
    valid: Boolean(lastPlayout.state),
  };
  stats.listenerMode = native
    ? "native-orientation-only-in-synthetic-scene"
    : "external-synthetic-metric";
  return {
    time: now,
    session: s.session,
    generation: s.generation,
    listener,
    sources: sourceStates(now, true),
    paused: s.paused,
  };
}
async function pump() {
  if (running || stopping) return;
  running = true;
  try {
    while (credits > 0 && !stopping) {
      const blockProcessingStart=performance.now();
      credits--;
      inFlight = 1;
      const now = renderer.frame / FS;
      if (now >= 120) {
        await finish();
        break;
      }
      const spatialSnapshot = snapshot(now);
      const controlContext = lastPlayout?.state ?? null;
      const orientationStarted = orientation ? performance.now() : 0;
      const selection = orientation?.select(
        lastPlayout,
        listenerPlayout,
        renderer.frame,
        receiptClock(),
      );
      let orientationMilliseconds = orientation
        ? performance.now() - orientationStarted
        : 0;
      orientationDiagnostic =
        orientation || !options.trace
          ? null
          : {
              policy: "buffered-" + options.delayMs,
              selectionMode: "reference",
              spatialTargetTime: lastPlayout?.targetTime ?? null,
              ...orientationTiming(
                listenerPlayout,
                lastPlayout,
                renderer.frame,
                receiptClock(),
              ),
            };
      const result = await simulate(spatialSnapshot, now);
      if (stopping) break;
      // Test-only bounded hold of an actual worker result, before DSP handoff.
      if (options.barrierFrame === renderer.frame) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            barrier = null;
            reject(Error("Headless barrier deadline"));
          }, 500);
          barrier = { resolve, reject, timer };
          log({ type: "selection-barrier", frame: renderer.frame });
        });
      }
      if (stopping) break;
      let mutePresentation = false;
      const spatialFingerprint = options.trace
        ? createHash("sha256")
            .update(
              JSON.stringify({
                frame: result.control.frame,
                sourceGenerations: result.control.sourceGenerations,
                paths: result.control.paths.map(({ pan, ...p }) => p),
              }),
            )
            .digest("hex")
        : null;
      if (orientation) {
        const t = performance.now(),
          presented = orientation.present(
            result.control,
            selection,
            receiptClock(),
            controlContext,
          );
        result.control = presented.control;
        mutePresentation = presented.muteBlock;
        orientationDiagnostic = presented.diagnostic;
        orientationMilliseconds += performance.now() - t;
        stats.orientationMs.push(orientationMilliseconds);
      }
      lastControl = result.control;
      if(lastControl.acoustic){
        renderer.setPathBudget(lastControl.acoustic.pathBudget);
        lastAcousticStatus={type:'acoustic-settings-status',...lastControl.acoustic};
        const key=JSON.stringify([lastAcousticStatus.settingsRevision,lastAcousticStatus.activeQuality,lastAcousticStatus.activeAcceleration,lastAcousticStatus.fallbackReason]);
        if(key!==lastAcousticStatusKey||stats.blocks%94===0){log(lastAcousticStatus);lastAcousticStatusKey=key;}
      }
      const identity = Object.values(lastControl.sourceGenerations).join(":");
      if (identity && startupIdentity !== identity) {
        // Once primed, geometry-mode generation transitions use the renderer's
        // existing old-path release bank while new retarded history becomes valid.
        if(!options.geometry || startup.readyFrame===null)startup.reset(renderer.frame);
        lifecycle =
          startupIdentity === null
            ? "initial-priming"
            : "source-generation-change";
        startupIdentity = identity;
      }
      renderer.accept(result.control);
      const ready =
        (!options.required || external !== null) &&
        renderer.historyReady(result.control);
      // An intentionally idle host may wait for manual Start. Priming's bounded
      // deadline begins with requested emission, not process creation.
      if (!enabled && startup.readyFrame === null) {
        startup.reset(renderer.frame);
        startup.status = "idle";
      } else if (enabled && startup.status === "idle") {
        startup.reset(renderer.frame);
      }
      startup.update(renderer.frame, ready);
      if (startup.status === "deadline-expired")
        throw Error("Startup priming deadline exceeded");
      const previousMissing = renderer.stats.missingHistory;
      const diagnosticsBefore = renderer.historyDiagnostics
        ? { ...renderer.historyDiagnostics }
        : null;
      stats.simulationMs.push(result.milliseconds);
      stats.pathMinimum = Math.min(
        stats.pathMinimum,
        result.control.paths.length,
      );
      stats.pathMaximum = Math.max(
        stats.pathMaximum,
        result.control.paths.length,
      );
      const renderingEnabled=enabled;
      for (let j = 0; j < BLOCK; j++) {
        gain +=
          (Number(renderingEnabled) * options.level - gain) * (1 - Math.exp(-1 / (0.01 * FS)));
        for (let i = 0; i < ids.length; i++) {
          phase[i] =
            (phase[i] + (2 * Math.PI * (options.frequencyHz + i * 7)) / FS) % (2 * Math.PI);
          let value =
            (Math.sin(phase[i]) +
              0.35 * Math.sin(2 * phase[i]) +
              0.15 * Math.sin(3 * phase[i])) /
            1.5;
          if (options.beacon === "pulse")
            value =
              (Math.cos(phase[i]) +
                0.5 * Math.cos(2 * phase[i]) +
                0.25 * Math.cos(3 * phase[i]) +
                0.125 * Math.cos(4 * phase[i])) /
              1.875;
          if (options.beacon === "impulse")
            value = (renderer.frame + j) % FS === FS / 2 ? 1 : 0;
          inputs[ids[i]][j] = gain * value;
        }
      }
      const started = performance.now();
      renderer.process(inputs, left, right, BLOCK);
      startup.apply(left, right, renderer.frame - BLOCK, ready);
      if (mutePresentation) {
        left.fill(0);
        right.fill(0);
      }
      const dspMilliseconds = performance.now() - started;
      if(lastControl.acoustic)lastAcousticFeedback={processingMs:performance.now()-blockProcessingStart,
        deadlineMiss:performance.now()-blockProcessingStart>BLOCK/FS*1000,
        availablePaths:lastControl.acoustic.availablePaths,activeBackend:lastControl.acoustic.activeAcceleration};
      stats.dspMs.push(dspMilliseconds);
      packet.write("RA07", 0, "ascii");
      packet.writeUInt32LE(sequence++, 4);
      packet.writeUInt32LE(BLOCK, 8);
      packet.writeUInt32LE(0, 12);
      for (let j = 0; j < BLOCK; j++) {
        packet.writeFloatLE(left[j], 16 + j * 8);
        packet.writeFloatLE(right[j], 20 + j * 8);
      }
      await new Promise((resolve, reject) =>
        process.stdout.write(packet, (e) => (e ? reject(e) : resolve())),
      );
      stats.blocks++;
      inFlight = 0;
      if (options.trace)
        log({
          type: "block",
          frame: renderer.frame - BLOCK,
          dspMilliseconds,
          orientationMilliseconds,
          simulationMilliseconds: result.milliseconds,
          paths: lastControl.paths.length,
          sourceGenerations: options.geometry||options.acousticSettings?lastControl.sourceGenerations:undefined,
          ...(options.acousticSettings?{acoustic:lastControl.acoustic,workerSchedulingMilliseconds:result.schedulingMilliseconds}:{}),
          geometry: lastControl.geometry,
          activePaths: renderer.activePaths,
          orientation: orientationDiagnostic,
          spatialFingerprint,
          pathPresentation: lastControl.paths.map((p) => ({
            ...(options.geometry||options.acousticSettings?{sourceId:p.sourceId,generation:p.generation}:{}),
            id: p.id,
            pan: p.pan,
            arrivalDirection: p.arrivalDirection,
            order: p.order,
            delay: p.delay,
            rate: p.rate,
            bands: p.bands,
            emissionFrame: p.emissionFrame,
          })),
          smoothedPan: renderer.slots
            .filter((s) => s.active)
            .map((s) => ({ id: s.id, pan: s.pan })),
          presentationMuted: mutePresentation,
          missingHistory: renderer.stats.missingHistory,
          mode:
            lastPlayout?.mode ??
            (options.required ? "waiting-for-listener" : "synthetic"),
          targetTime: lastPlayout?.targetTime ?? now,
          age: lastPlayout?.newestAgeSeconds ?? 0,
          prediction: lastPlayout?.extrapolationSeconds ?? 0,
          orientationAgeSeconds:
            orientationDiagnostic?.ageSeconds ??
            (lastPlayout?.state
              ? lastPlayout.playoutSeconds +
                (lastPlayout.mode === "predicted"
                  ? lastPlayout.extrapolationSeconds
                  : 0)
              : null),
          pan: lastControl.paths.find((p) => p.order === 0)?.pan ?? null,
          delays: lastControl.paths.map((p) => p.delay),
          pathIds: lastControl.paths.map((p) => p.id),
          emitting: renderingEnabled,
          missingDelta: renderer.stats.missingHistory - previousMissing,
          historyDelta: diagnosticsBefore
            ? Object.fromEntries(
                Object.entries(renderer.historyDiagnostics)
                  .filter(([k]) => !["firstFrame", "lastFrame"].includes(k))
                  .map(([k, v]) => [k, v - diagnosticsBefore[k]]),
              )
            : null,
          historyFirstFrame: renderer.historyDiagnostics?.firstFrame ?? null,
          historyLastFrame: renderer.historyDiagnostics?.lastFrame ?? null,
          lifecycle:
            startup.status !== "ready"
              ? lifecycle === "source-generation-change"
                ? lifecycle
                : lastPlayout?.mode === "warming"
                  ? "listener-buffer-warmup"
                  : "initial-priming"
              : !enabled
                ? "emission-stop-tail"
                : lastPlayout && !lastPlayout.state
                  ? "unavailable-input"
                  : priorPaths !== lastControl.paths.map((p) => p.id).join("|")
                    ? "path-change"
                    : "valid-steady",
          startup: startup.status,
          readyFrame: startup.readyFrame,
        });
      priorPaths = lastControl.paths.map((p) => p.id).join("|");
      if (stats.blocks % 94 === 0)
        log({
          type: "status",
          beaconFrequencyHz: options.frequencyHz,
          beaconLevel: options.level,
          frame: renderer.frame,
          paths: renderer.activePaths,
          sourceEmitting: enabled,
          listenerMode: stats.listenerMode,
          observationAgeSeconds:
            lastPlayout?.newestAgeSeconds ?? lastControl.ageSeconds,
          listenerPlayoutMode: lastPlayout?.mode ?? null,
          listenerControlDelaySeconds: lastPlayout?.playoutSeconds ?? 0,
          peak: renderer.stats.peak,
          limited: renderer.stats.limited,
          startupStatus: startup.status,
        });
    }
  } catch (e) {
    if (!stopping) await finish(e);
  } finally {
    running = false;
    if (credits > 0 && !stopping) queueMicrotask(pump);
  }
}
function receive(m) {
  if (!m || typeof m !== "object") throw Error("Control object");
  if(geometryRelay?.receive(m))return;
  if(m.type==='acoustic-settings'){
    if(!options.acousticSettings||!Number.isSafeInteger(m.revision)||m.revision<=acousticRevision)throw Error('Acoustic settings startup/revision');
    const validated=validateAcousticSettings({acousticQuality:m.quality,acousticAcceleration:m.acceleration});
    acousticRevision=m.revision;pendingAcousticSettings={revision:m.revision,quality:validated.acousticQuality,acceleration:validated.acousticAcceleration};
  }else if (m.type === "credit") {
    if (
      !Number.isInteger(m.blocks) ||
      m.blocks < 1 ||
      m.blocks > 8 ||
      credits + m.blocks + inFlight > 8
    )
      throw Error("Credit budget");
    credits += m.blocks;
    void pump();
  } else if (m.type === "control") {
    if (m.command === "start" || m.command === "resume") enabled = true;
    else if (m.command === "emit-stop") enabled = false;
    else if (m.command === "mute") enabled = false;
    else if (m.command === "stop") void finish();
    else throw Error("Unknown control");
  } else if (m.type === "listener") {
    m = listenerPlayout.add(m, renderer.frame / FS, receiptClock());
    orientation?.add(m, renderer.frame / FS, receiptClock());
    const s = m.state;
    external = {
      state: s,
      receiptAgeMs: Math.max(0, m.receiptAgeMs),
      receivedAt: receiptClock(),
      pendingReceipt: true,
      audioTime: renderer.frame / FS,
    };
    stats.listenerMessages++;
    stats.maxReceiptAgeMs = Math.max(stats.maxReceiptAgeMs, m.receiptAgeMs);
  } else if(options.geometry && ['geometry-config','geometry','owned-sources'].includes(m.type)){
    if(geometryEvents.length>=liveGeometryLimits.events || Buffer.byteLength(JSON.stringify(m))>liveGeometryLimits.bytes)
      throw Error('Bounded geometry input queue');
    geometryEvents.push(m);
  } else if (m.type === "headless-release" && options.headless && barrier) {
    const b = barrier;
    barrier = null;
    clearTimeout(b.timer);
    b.resolve();
  } else throw Error("Unknown message");
}
process.stdin.setEncoding("utf8");
let initialControlChunk=true;
process.stdin.on("data", (chunk) => {
  try {
    // Framework Process can prime redirected stdin with the UTF-8 preamble
    // before the host owns its writer. Allow exactly one stream-start BOM;
    // later/repeated prefixes still fail ordinary JSON parsing and all bounds.
    if(initialControlChunk&&chunk.length){initialControlChunk=false;if(chunk.charCodeAt(0)===0xfeff)chunk=chunk.slice(1);}
    inputText += chunk;
    const frameBound=options.geometry?liveGeometryLimits.bytes:16384;
    if (inputText.length > (options.geometry?liveGeometryLimits.bytes*2:65536)) throw Error("Control buffer bound");
    let end;
    while ((end = inputText.indexOf("\n")) >= 0) {
      const line = inputText.slice(0, end);
      inputText = inputText.slice(end + 1);
      if (line.length > frameBound) throw Error("Control frame bound");
      if (line.trim()) receive(JSON.parse(line));
    }
    if (inputText.length > frameBound) throw Error("Unterminated control bound");
  } catch (e) {
    void finish(e);
  }
});
process.stdin.on("end", () => void finish());
process.stdout.on("error", (e) => void finish(e));
process.on("SIGINT", () => void finish());
