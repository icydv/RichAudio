// Independent signal measurements and fixtures for the causal streaming/reference comparison.
// All source signals and metre-scale scenes are original; no game resources are read.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { sceneInput } from "../tests/fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import { prepare, render } from "../src/acoustics/engine/renderer.mjs";
import { signal } from "../src/acoustics/engine/signals.mjs";
import { fixture } from "./acoustics-06-scenes.mjs";
import { pose } from "../src/acoustics/engine/contracts.mjs";
import {
  CausalSimulation,
  StreamingRenderer,
} from "../src/acoustics/streaming/causal.mjs";

export const rate = 48000;
export function rms(samples, start = 0, end = samples.length) {
  start = Math.ceil(start);
  end = Math.floor(end);
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}
export function toneFrequency(samples, startSeconds = 1, endSeconds = 2) {
  const crossings = [];
  for (let i = Math.ceil(startSeconds * rate) + 1; i < endSeconds * rate; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0)
      crossings.push(i - 1 - samples[i - 1] / (samples[i] - samples[i - 1]));
  }
  if (crossings.length < 20) throw Error("insufficient measured tone cycles");
  return ((crossings.length - 1) * rate) / (crossings.at(-1) - crossings[0]);
}
export function relativeDifference(
  actual,
  reference,
  startSeconds,
  endSeconds,
) {
  const first = Math.ceil(startSeconds * rate),
    last = Math.floor(endSeconds * rate);
  let delta = 0,
    energy = 0;
  for (let i = first; i < last; i++) {
    delta += (actual[i] - reference[i]) ** 2;
    energy += reference[i] ** 2;
  }
  return Math.sqrt(delta / Math.max(energy, 1e-30));
}
export function absoluteDifference(
  actual,
  reference,
  startSeconds,
  endSeconds,
) {
  const first = Math.ceil(startSeconds * rate),
    last = Math.floor(endSeconds * rate);
  let sum = 0;
  for (let i = first; i < last; i++) sum += (actual[i] - reference[i]) ** 2;
  return Math.sqrt(sum / (last - first));
}
export function originalCase(name) {
  const duration = 4;
  let f = fixture(
    ["ground", "canyon", "obstruction"].includes(name)
      ? {
          ground: "open-road",
          canyon: "urban-street",
          obstruction: "obstructed-corner",
        }[name]
      : "flyby",
  );
  if (!["ground", "canyon", "obstruction"].includes(name)) {
    const input = sceneInput();
    input.surfaces = [];
    input.validUntil = 1000000;
    input.bounds = { min: [-125, -30, -2], max: [125, 30, 12] };
    input.listenerAnchor = [0, 0, 1];
    f = {
      ...f,
      scene: acousticScene(
        createTile(input),
        {},
        { order: 0, airDbPerMetre: [0, 0, 0] },
      ),
    };
  }
  let sourceKeys = [{ time: 0, position: [50, 0, 1] }];
  let listenerKeys = [{ time: 0, position: [0, 0, 1] }];
  if (name === "approach")
    sourceKeys = [
      { time: 0, position: [100, 0, 1] },
      { time: duration, position: [20, 0, 1] },
    ];
  if (name === "departure")
    sourceKeys = [
      { time: 0, position: [20, 0, 1] },
      { time: duration, position: [100, 0, 1] },
    ];
  if (name === "moving-listener") {
    sourceKeys = [{ time: 0, position: [100, 0, 1] }];
    listenerKeys = [
      { time: 0, position: [0, 0, 1] },
      { time: duration, position: [80, 0, 1] },
    ];
  }
  if (name === "flyby") {
    sourceKeys = [
      { time: 0, position: [-30, 0, 1] },
      { time: duration, position: [30, 0, 1] },
    ];
    listenerKeys = [{ time: 0, position: [0, 6, 1] }];
  }
  if (["ground", "canyon", "obstruction"].includes(name)) {
    sourceKeys = f.track.keys;
    listenerKeys = f.listener.keys;
  }
  // Fixed declared 300 ms state-history warm-up in BOTH renderers. Never best-fit align afterwards.
  const dry = signal("tone", duration, { frequency: 1000, amplitude: 0.15 });
  const pcm = new Float32Array(dry.length + 0.3 * rate);
  pcm.set(dry, 0.3 * rate);
  const source = ownedSource({
    id: "independent-tone",
    pcm,
    track: trajectory(sourceKeys),
  });
  const listener = trajectory(listenerKeys);
  return {
    name,
    scene: f.scene,
    source,
    listener,
    duration,
    outputSeconds: duration + 0.8,
  };
}
export function offlineReference(c) {
  return render(
    prepare(c.scene, [c.source], c.listener, { duration: c.outputSeconds }),
    { masterGain: 1 },
  );
}

export function observationAt(c, time) {
  const clean = (p) => ({
    position: p.position,
    velocity: p.velocity,
    forward: p.forward,
    up: p.up,
    valid: p.valid,
  });
  const s = pose(c.source.track, time),
    l = pose(c.listener, time);
  return {
    time,
    session: "independent-fixture",
    generation: 1,
    listener: clean(l),
    sources: [
      {
        id: c.source.id,
        generation: s.generation,
        ...clean(s),
        emitting: time < c.source.pcm.length / rate,
        directivity: c.source.directivity,
      },
    ],
  };
}
export function incrementalReference(
  c,
  {
    blockSize = 512,
    observation = observationAt,
    stopObserving = Infinity,
    controlEveryBlocks = 1,
    observationEveryBlocks = 1,
    onBlock = null,
  } = {},
) {
  const frames = Math.round(c.outputSeconds * rate),
    simulation = new CausalSimulation(c.scene),
    renderer = new StreamingRenderer({
      sourceIds: [c.source.id],
      masterGain: 1,
    });
  const left = new Float32Array(frames),
    right = new Float32Array(frames),
    input = new Float32Array(blockSize),
    l = new Float32Array(blockSize),
    r = new Float32Array(blockSize),
    controls = [];
  let blocks = 0;
  for (let at = 0; at < frames; at += blockSize) {
    const count = Math.min(blockSize, frames - at),
      time = at / rate;
    if (time <= stopObserving && blocks % observationEveryBlocks === 0) {
      const state = observation(c, time);
      if (state) simulation.observe(state);
    }
    if (blocks % controlEveryBlocks === 0) {
      const control = simulation.update(time);
      renderer.accept(control);
      controls.push(control);
    }
    input.fill(0);
    input.set(
      c.source.pcm.subarray(at, Math.min(at + count, c.source.pcm.length)),
    );
    if (onBlock) onBlock({ at, time, simulation, renderer, input, controls });
    renderer.process({ [c.source.id]: input }, l, r, count);
    left.set(l.subarray(0, count), at);
    right.set(r.subarray(0, count), at);
    blocks++;
  }
  return { left, right, controls, simulation, renderer };
}
export function comparisonMeasurements() {
  return [
    "stationary",
    "approach",
    "departure",
    "moving-listener",
    "flyby",
    "ground",
    "canyon",
    "obstruction",
  ].map((name) => {
    const c = originalCase(name),
      reference = offlineReference(c),
      stream = incrementalReference(c);
    const referenceLeftRms = rms(reference.left, 0.8 * rate, 3.5 * rate),
      referenceRightRms = rms(reference.right, 0.8 * rate, 3.5 * rate);
    const row = {
      name,
      knownFixedWarmupSeconds: 0.3,
      blockFrames: 512,
      referenceLeftRms,
      referenceRightRms,
      relativeLeftError:
        referenceLeftRms > 1e-12
          ? relativeDifference(stream.left, reference.left, 0.8, 3.5)
          : null,
      relativeRightError:
        referenceRightRms > 1e-12
          ? relativeDifference(stream.right, reference.right, 0.8, 3.5)
          : null,
      absoluteLeftError: absoluteDifference(
        stream.left,
        reference.left,
        0.8,
        3.5,
      ),
      absoluteRightError: absoluteDifference(
        stream.right,
        reference.right,
        0.8,
        3.5,
      ),
      peak: Math.max(
        ...[stream.left, stream.right].map((x) =>
          x.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
        ),
      ),
      pathCount: Math.max(...stream.controls.map((x) => x.paths.length)),
    };
    row.relativeStereoError =
      Math.hypot(row.absoluteLeftError, row.absoluteRightError) /
      Math.hypot(referenceLeftRms, referenceRightRms);
    if (
      ["stationary", "approach", "departure", "moving-listener"].includes(name)
    ) {
      row.measuredHz = toneFrequency(stream.right, 1, 2);
      row.oracleHz = toneFrequency(reference.right, 1, 2);
      row.analyticalHz = {
        stationary: 1000,
        approach: (1000 * 343) / 323,
        departure: (1000 * 343) / 363,
        "moving-listener": (1000 * 363) / 343,
      }[name];
      row.absoluteFrequencyErrorHz = Math.abs(
        row.measuredHz - row.analyticalHz,
      );
    }
    return row;
  });
}
const timings = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return {
    count: a.length,
    medianMs: a[Math.floor(a.length * 0.5)],
    p95Ms: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
    maximumMs: a.at(-1),
  };
};
export function processingMeasurements() {
  return [
    ["stationary", 1],
    ["ground", 1],
    ["canyon", 1],
    ["canyon", 4],
    ["enclosure", 16],
  ].map(([name, count]) => {
    const c = originalCase(name === "enclosure" ? "canyon" : name),
      f = name === "enclosure" ? fixture("enclosure") : null;
    if (f) c.scene = f.scene;
    const ids = Array.from({ length: count }, (_, i) => `measure-${i}`),
      simulation = new CausalSimulation(c.scene),
      renderer = new StreamingRenderer({ sourceIds: ids, masterGain: 0.2 });
    const inputs = Object.fromEntries(
        ids.map((id) => [id, new Float32Array(512)]),
      ),
      left = new Float32Array(512),
      right = new Float32Array(512),
      blockTimes = [],
      simulationTimes = [];
    const memoryBefore = process.memoryUsage();
    let maximumPaths = 0;
    for (let at = 0; at < rate * 1.6; at += 512) {
      const time = at / rate,
        snapshot = observationAt(c, time);
      snapshot.sources = ids.map((id, i) => ({
        ...snapshot.sources[0],
        id,
        position: f
          ? pose(f.track, time).position
          : snapshot.sources[0].position,
      }));
      if (f)
        snapshot.listener = { ...snapshot.listener, ...pose(f.listener, time) };
      let begin = performance.now();
      simulation.observe(snapshot);
      const control = simulation.update(time);
      const simulationMs = performance.now() - begin;
      renderer.accept(control);
      maximumPaths = Math.max(maximumPaths, control.paths.length);
      for (let i = 0; i < count; i++)
        for (let j = 0; j < 512; j++)
          inputs[ids[i]][j] =
            0.02 * Math.sin((2 * Math.PI * (173 + i * 19) * (at + j)) / rate);
      begin = performance.now();
      renderer.process(inputs, left, right, 512);
      const blockMs = performance.now() - begin;
      if (time >= 0.5) {
        blockTimes.push(blockMs);
        simulationTimes.push(simulationMs);
      }
    }
    const memoryAfter = process.memoryUsage();
    return {
      scene: name,
      sources: count,
      maximumPaths,
      blockFrames: 512,
      blockDeadlineMs: (512 / rate) * 1000,
      dsp: timings(blockTimes),
      observationAndSimulation: timings(simulationTimes),
      ownedTypedArrayBytes: renderer.ownedArrayBytes,
      processHeapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      processRssAfterBytes: memoryAfter.rss,
      peakBeforeLimiter: renderer.stats.peak,
      limitedFrames: renderer.stats.limited,
      geometryQueries: simulation.stats.queries,
      surfaceTests: simulation.stats.surfaceTests,
      allocationLimitation:
        "Heap delta is retained-process usage, not an allocation total. JavaScript iterator/control allocations and GC remain; this is not a device callback or hard real-time certification.",
    };
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const output = privateStoragePath(
    root,
    path.resolve(
      root,
      process.argv[2] ?? ".local/acoustics-07-streaming-metrics.json",
    ),
  );
  if (fs.existsSync(output))
    throw Error("fresh measurement destination required");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const report = {
    version: 1,
    source: "original-generated",
    coordinateSpace: "research-rh-z-up-metres-v1",
    alignment:
      "fixed 0.3-second dry-signal offset in both implementations; no fitted temporal alignment",
    sampleRate: rate,
    silentChannelRule:
      "Relative error is undefined below reference RMS 1e-12; absolute error is always reported.",
    predeclaredAcceptance: {
      stationaryRelativeRms: 0.001,
      linearMotionRelativeRms: 0.05,
      flybyRelativeRms: 0.12,
      frequencyErrorHz: 0.5,
      flatImpulseAmplitudeError: 2e-7,
      alignment: "No fitted timing or phase correction",
    },
    comparisons: comparisonMeasurements(),
    processing: processingMeasurements(),
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(report, null, 2));
}
