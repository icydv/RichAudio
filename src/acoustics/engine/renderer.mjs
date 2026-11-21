// Offline preparation is separate from the bounded sample loop. No device, disk or game calls.
import { performance } from "node:perf_hooks";
import { bounds, requireValue, freeze, validated } from "./contracts.mjs";
import { candidatePaths, solvePath } from "./paths.mjs";
export const sampleRate = 48000;
export function splitBands(pcm) {
  const tail = 2400,
    bands = [
      new Float32Array(pcm.length + tail),
      new Float32Array(pcm.length + tail),
      new Float32Array(pcm.length + tail),
    ];
  const a = 1 - Math.exp((-2 * Math.PI * 400) / sampleRate),
    b = 1 - Math.exp((-2 * Math.PI * 4000) / sampleRate);
  let low = 0,
    upper = 0;
  for (let i = 0; i < bands[0].length; i++) {
    const x = i < pcm.length ? pcm[i] : 0;
    requireValue(Number.isFinite(x) && Math.abs(x) <= 1, "invalid dry sample");
    low += a * (x - low);
    upper += b * (x - upper);
    bands[0][i] = low;
    bands[1][i] = upper - low;
    bands[2][i] = x - upper;
  }
  return bands;
}
const validPlans = new WeakSet();
export function prepare(scene, sources, listener, { duration = 10 } = {}) {
  const begin = performance.now();
  requireValue(
    Number.isFinite(duration) && duration > 0 && duration <= bounds.duration,
    "render duration",
  );
  requireValue(
    Array.isArray(sources) &&
      sources.length > 0 &&
      sources.length <= bounds.sources &&
      new Set(sources.map((s) => s.id)).size === sources.length,
    "source count/identity",
  );
  requireValue(
    sources.every(validated.source),
    "validated owned sources required",
  );
  requireValue(
    sources.reduce((n, s) => n + s.pcm.length, 0) <= bounds.pcmFrames,
    "aggregate PCM bound",
  );
  requireValue(
    validated.scene(scene) && validated.track(listener),
    "validated scene/listener required",
  );
  const step = sampleRate / scene.config.updateHz,
    frames = Math.round(duration * sampleRate),
    count = Math.ceil(frames / step) + 1,
    candidates = candidatePaths(scene);
  requireValue(
    count * candidates.length * sources.length <= 250000,
    "simulation grid budget exceeded",
  );
  requireValue(
    scene.tile.createdAt + (((count - 1) * step) / sampleRate) * 1000 <
      Math.min(
        scene.tile.validUntil,
        ...scene.tile.surfaces.map((s) => s.validUntil),
      ),
    "scene expires before render completes",
  );
  const stats = {
    queries: 0,
    surfaceTests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    prunedTracks: 0,
    rejections: {},
    maximumRetardedResidual: 0,
  };
  const prepared = [];
  for (const s of sources) {
    const tracks = [],
      stationary = s.track.keys.length === 1 && listener.keys.length === 1;
    for (const candidate of candidates) {
      const entries = [];
      let peak = 0,
        base;
      for (let i = 0; i < count; i++) {
        const t = (i * step) / sampleRate;
        let p;
        if (stationary && base) {
          stats.cacheHits++;
          p =
            base.status === "renderable"
              ? { ...base, emissionTime: t - base.delay, arrivalTime: t }
              : base;
        } else {
          stats.cacheMisses++;
          p = solvePath(scene, s, listener, t, candidate, stats);
          if (stationary) base = p;
        }
        if (p.status === "renderable") {
          peak = Math.max(peak, ...p.bands);
          stats.maximumRetardedResidual = Math.max(
            stats.maximumRetardedResidual,
            p.retardedResidual,
          );
          entries.push(p);
        } else {
          stats.rejections[p.status] = (stats.rejections[p.status] ?? 0) + 1;
          entries.push(null);
        }
      }
      if (peak > 0) tracks.push({ id: candidate.id, peak, entries });
    }
    tracks.sort((a, b) => b.peak - a.peak || a.id.localeCompare(b.id, "en"));
    stats.prunedTracks += Math.max(0, tracks.length - scene.config.maxPaths);
    const kept = freeze(tracks.slice(0, scene.config.maxPaths));
    prepared.push(
      Object.freeze({
        id: s.id,
        rights: s.rights,
        bands: Object.freeze(splitBands(s.pcm)),
        tracks: kept,
      }),
    );
  }
  // Typed bands are owned by the prepared provider; only the renderer reads them.
  const plan = {
    version: 1,
    coordinateSpace: scene.coordinateSpace,
    geometryKey: scene.geometryKey,
    generation: scene.generation,
    frames,
    step,
    sampleRate,
    sourceCount: sources.length,
    prepared,
    stats,
    preparationMs: performance.now() - begin,
  };
  Object.freeze(prepared);
  freeze(stats);
  Object.freeze(plan);
  validPlans.add(plan);
  return plan;
}
const STRIDE = 8; // active, emission frame, low/mid/high gain, left/right panning, source generation
export class PcmRenderer {
  constructor(plan, { masterGain = 0.7 } = {}) {
    requireValue(validPlans.has(plan), "owned prepared plan required");
    requireValue(
      Number.isFinite(masterGain) && masterGain >= 0 && masterGain <= 1,
      "master headroom gain",
    );
    this.frames = plan.frames;
    this.step = plan.step;
    this.masterGain = masterGain;
    this.position = 0;
    this.limited = 0;
    this.maximumPreLimit = 0;
    this.paths = [];
    for (const source of plan.prepared) {
      const bands = source.bands.map((b) => new Float32Array(b));
      for (const track of source.tracks) {
        const data = new Float64Array(track.entries.length * STRIDE);
        for (let i = 0; i < track.entries.length; i++) {
          const e = track.entries[i];
          if (!e) continue;
          const o = i * STRIDE;
          data[o] = 1;
          data[o + 1] = e.emissionTime * sampleRate;
          for (let k = 0; k < 3; k++) data[o + 2 + k] = e.bands[k];
          data[o + 5] = Math.sqrt((1 - e.pan) / 2);
          data[o + 6] = Math.sqrt((1 + e.pan) / 2);
          data[o + 7] = e.generation;
        }
        this.paths.push({ data, bands });
      }
    }
    this.ownedArrayBytes =
      this.paths.reduce((n, p) => n + p.data.byteLength, 0) +
      plan.prepared.reduce(
        (n, s) => n + s.bands.reduce((a, b) => a + b.byteLength, 0),
        0,
      );
  }
  reset() {
    this.position = 0;
    this.limited = 0;
    this.maximumPreLimit = 0;
  }
  process(left, right, frames = left.length) {
    requireValue(
      left instanceof Float32Array &&
        right instanceof Float32Array &&
        left !== right &&
        !(
          left.buffer === right.buffer &&
          left.byteOffset < right.byteOffset + frames * 4 &&
          right.byteOffset < left.byteOffset + frames * 4
        ) &&
        Number.isInteger(frames) &&
        frames > 0 &&
        frames <= 4096 &&
        frames <= left.length &&
        frames <= right.length,
      "bounded output buffers",
    );
    left.fill(0, 0, frames);
    right.fill(0, 0, frames);
    const count = Math.min(frames, this.frames - this.position);
    // All arrays and path slots are allocated in the constructor. This loop performs no geometry queries.
    for (let p = 0; p < this.paths.length; p++) {
      const data = this.paths[p].data,
        bands = this.paths[p].bands;
      for (let j = 0; j < count; j++) {
        const frame = this.position + j,
          index = Math.floor(frame / this.step),
          o = index * STRIDE,
          n = o + STRIDE,
          u = (frame - index * this.step) / this.step,
          a = data[o],
          b = data[n];
        if (!a && !b) continue;
        let read, g0, g1, g2, gl, gr;
        if (a && b && data[o + 7] === data[n + 7]) {
          read = data[o + 1] + u * (data[n + 1] - data[o + 1]);
          g0 = data[o + 2] + u * (data[n + 2] - data[o + 2]);
          g1 = data[o + 3] + u * (data[n + 3] - data[o + 3]);
          g2 = data[o + 4] + u * (data[n + 4] - data[o + 4]);
          gl = data[o + 5] + u * (data[n + 5] - data[o + 5]);
          gr = data[o + 6] + u * (data[n + 6] - data[o + 6]);
        } else if (a && !b) {
          // One update-cell release; continue the previous measured read slope, never jump the cursor.
          const prev = o - STRIDE,
            rate =
              prev >= 0 && data[prev]
                ? (data[o + 1] - data[prev + 1]) / this.step
                : 1;
          read = data[o + 1] + u * this.step * rate;
          g0 = data[o + 2] * (1 - u);
          g1 = data[o + 3] * (1 - u);
          g2 = data[o + 4] * (1 - u);
          gl = data[o + 5];
          gr = data[o + 6];
        } else if (!a && b) {
          const next = n + STRIDE,
            rate =
              next < data.length && data[next]
                ? (data[next + 1] - data[n + 1]) / this.step
                : 1;
          read = data[n + 1] - (1 - u) * this.step * rate;
          g0 = data[n + 2] * u;
          g1 = data[n + 3] * u;
          g2 = data[n + 4] * u;
          gl = data[n + 5];
          gr = data[n + 6];
        } else continue; // Generation transition without a valid guard cannot create a Doppler spike.
        const k = Math.floor(read),
          f = read - k;
        if (k < -1 || k >= bands[0].length) continue;
        const end = k + 1 < bands[0].length;
        let x = 0;
        x +=
          ((k >= 0 ? bands[0][k] * (1 - f) : 0) +
            (end ? bands[0][k + 1] * f : 0)) *
          g0;
        x +=
          ((k >= 0 ? bands[1][k] * (1 - f) : 0) +
            (end ? bands[1][k + 1] * f : 0)) *
          g1;
        x +=
          ((k >= 0 ? bands[2][k] * (1 - f) : 0) +
            (end ? bands[2][k + 1] * f : 0)) *
          g2;
        left[j] += x * gl * this.masterGain;
        right[j] += x * gr * this.masterGain;
      }
    }
    for (let j = 0; j < count; j++) {
      const peak = Math.max(Math.abs(left[j]), Math.abs(right[j]));
      this.maximumPreLimit = Math.max(this.maximumPreLimit, peak);
      if (peak > 0.98) {
        const reduction = 0.98 / peak;
        left[j] *= reduction;
        right[j] *= reduction;
        this.limited++;
      }
    }
    this.position += count;
    return count;
  }
}
export function render(plan, { blockSize = 512, masterGain = 0.7 } = {}) {
  requireValue(
    Number.isInteger(blockSize) && blockSize > 0 && blockSize <= 4096,
    "block size",
  );
  const renderer = new PcmRenderer(plan, { masterGain }),
    left = new Float32Array(plan.frames),
    right = new Float32Array(plan.frames),
    l = new Float32Array(blockSize),
    r = new Float32Array(blockSize),
    times = [];
  let at = 0;
  while (at < plan.frames) {
    const t = performance.now(),
      n = renderer.process(l, r);
    times.push(performance.now() - t);
    left.set(l.subarray(0, n), at);
    right.set(r.subarray(0, n), at);
    at += n;
  }
  const sorted = [...times].sort((a, b) => a - b);
  return {
    left,
    right,
    metrics: {
      frames: plan.frames,
      sampleRate,
      channels: 2,
      blocks: times.length,
      blockSize,
      blockDeadlineMs: (blockSize / sampleRate) * 1000,
      processingMs: times.reduce((a, b) => a + b, 0),
      medianBlockMs: sorted[Math.floor(sorted.length * 0.5)],
      p95BlockMs: sorted[Math.floor(sorted.length * 0.95)],
      p99BlockMs: sorted[Math.floor(sorted.length * 0.99)],
      maximumBlockMs: sorted.at(-1),
      limitedFrames: renderer.limited,
      maximumPreLimit: renderer.maximumPreLimit,
      rendererArrayBytes: renderer.ownedArrayBytes,
      pathSlots: renderer.paths.length,
    },
  };
}
