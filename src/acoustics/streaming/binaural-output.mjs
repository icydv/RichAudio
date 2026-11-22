import { compactMeasurements } from './kemar-measurements.mjs';

const rate = 48000;
const compactRate = 44100;
const compactLength = 128;
const referenceLength = Math.ceil(compactLength * rate / compactRate);
const realtimeLength = 80;
const crossfadeFrames = 384;
const initialPathDelay = .12;
const individuallyRenderedReflections = 4;
const cardinalDirections = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const degrees = 180 / Math.PI;
const frontal = [0, 1, 0];
let measurementRows;

export function headArrivalDirection(direction, right, forward, up) {
  return [right, forward, up].map(axis => axis[0] * direction[0] + axis[1] * direction[1] + axis[2] * direction[2]);
}

function readMeasurements() {
  if (measurementRows) return measurementRows;
  const bytes = Buffer.from(compactMeasurements, 'base64');
  const rows = Array.from({ length: 14 }, () => []);
  // Windowed sinc interpolation of the original 44.1 kHz measurements. The
  // archive itself has already removed the common capture and loudspeaker delay.
  const kernels = Array.from({ length: referenceLength }, (_, frame) => {
    const at = frame * compactRate / rate;
    const support = 12, center = Math.floor(at), start = Math.max(0, center - support + 1);
    const end = Math.min(compactLength - 1, center + support);
    const weights = [];
    for (let k = start; k <= end; k++) {
      const delta = at - k;
      const sinc = Math.abs(delta) < 1e-12 ? 1 : Math.sin(Math.PI * delta) / (Math.PI * delta);
      weights.push(sinc * (.5 + .5 * Math.cos(Math.PI * delta / support)) / 32768);
    }
    return { start, weights };
  });
  for (let offset = 0; offset < bytes.length; offset += 4 + 4 * compactLength) {
    const elevation = bytes.readInt16LE(offset);
    const azimuth = bytes.readInt16LE(offset + 2);
    const ears = [0, 1].map(ear => {
      const impulse = Float32Array.from(kernels, ({start, weights}) => {
        let value = 0;
        const startByte = offset + 4 + 4 * start + ear * 2;
        for (let i = 0; i < weights.length; i++) value += weights[i] * bytes.readInt16LE(startByte + 4 * i);
        return value;
      });
      const threshold = .1 * Math.max(...impulse.map(Math.abs));
      const onset = Math.max(0, impulse.findIndex(sample => Math.abs(sample) >= threshold) - 2);
      return { impulse, onset };
    });
    const row = rows[(elevation + 40) / 10];
    row.push({ azimuth, ears });
    if (azimuth > 0 && azimuth < 180) row.push({ azimuth: 360 - azimuth, ears: [ears[1], ears[0]] });
  }
  for (const row of rows) row.sort((a, b) => a.azimuth - b.azimuth);
  measurementRows = rows;
  return rows;
}

function azimuthPair(row, angle, weight) {
  if (row.length === 1) return [{ ears: row[0].ears, weight }];
  let hi = 1, lo = 0;
  while (hi < row.length && row[hi].azimuth < angle) hi++;
  lo = hi - 1;
  const next = row[hi] ?? row[0];
  const u = (angle - row[lo].azimuth) / ((hi === row.length ? 360 : next.azimuth) - row[lo].azimuth);
  return [{ ears: row[lo].ears, weight: weight * (1 - u) }, { ears: next.ears, weight: weight * u }];
}

function interpolateImpulse(direction, left, right) {
  const rows = readMeasurements();
  const azimuth = (degrees * Math.atan2(direction[0], direction[1]) + 360) % 360;
  const altitude = Math.max(0, Math.min(13, (degrees *
    Math.atan2(direction[2], Math.hypot(direction[0], direction[1])) + 40) / 10));
  const lowRow = Math.floor(altitude), altitudeMix = altitude - lowRow;
  const responses = azimuthPair(rows[lowRow], azimuth, 1 - altitudeMix);
  if (altitudeMix > 0) responses.push(...azimuthPair(rows[lowRow + 1], azimuth, altitudeMix));
  for (const [ear, output] of [left, right].entries()) {
    output.fill(0);
    // Interpolate the measured delay separately from the aligned response.
    // Mixing two unaligned raw impulses would give moving sounds a comb filter.
    let arrival = 0;
    for (const response of responses) arrival += response.ears[ear].onset * response.weight;
    for (const { ears, weight } of responses) {
      if (weight === 0) continue;
      const { impulse, onset } = ears[ear];
      const offset = arrival - onset, base = Math.floor(offset), fraction = offset - base;
      for (let i = Math.max(0, -1 - base); i < impulse.length && i + base < output.length; i++) {
        const at = i + base, value = weight * impulse[i];
        if (at >= 0) output[at] += (1 - fraction) * value;
        if (at + 1 >= 0 && at + 1 < output.length) output[at + 1] += fraction * value;
      }
    }
    if (output.length < referenceLength)
      for (let i = output.length - 12; i < output.length; i++)
        output[i] *= .5 - .5 * Math.cos(Math.PI * (output.length - 1 - i) / 11);
  }
}

class HeadFilter {
  constructor(taps) {
    this.history = new Float32Array(2 * taps);
    this.taps = taps;
    this.leftCoeffs = new Float32Array(taps);
    this.rightCoeffs = new Float32Array(taps);
    this.nextLeft = new Float32Array(taps);
    this.nextRight = new Float32Array(taps);
    this.direction = null;
    this.fade = 1;
    this.at = 0;
    this.residual = 0;
    this.left = this.right = 0;
  }
  reset() {
    this.history.fill(0);
    this.at = this.residual = 0;
    this.direction = null;
    this.fade = 1;
  }
  update(direction) {
    const previous = this.direction;
    if (previous && previous[0] === direction[0] && previous[1] === direction[1] && previous[2] === direction[2]) return;
    if (previous) {
      const blend = this.fade;
      for (let i = 0; i < this.taps; i++) {
        this.leftCoeffs[i] += (this.nextLeft[i] - this.leftCoeffs[i]) * blend;
        this.rightCoeffs[i] += (this.nextRight[i] - this.rightCoeffs[i]) * blend;
      }
    }
    interpolateImpulse(direction, this.nextLeft, this.nextRight);
    this.direction = direction;
    this.fade = previous ? 0 : 1;
  }
  step(input, apply = true) {
    const n = this.taps, history = this.history;
    const at = this.at > 0 ? this.at - 1 : n - 1;
    this.at = at;
    history[at] = history[at + n] = input;
    if (input !== 0) this.residual = n;
    else if (this.residual > 0) this.residual--;
    let left = 0, right = 0;
    if (apply && this.residual) {
      const nextLeft = this.nextLeft, nextRight = this.nextRight;
      if (this.fade < 1) {
        const leftCoeffs = this.leftCoeffs, rightCoeffs = this.rightCoeffs, u = this.fade;
        let targetLeft = 0, targetRight = 0;
        for (let i = 0; i < n; i++) {
          const sample = history[at + i];
          left += sample * leftCoeffs[i];
          right += sample * rightCoeffs[i];
          targetLeft += sample * nextLeft[i];
          targetRight += sample * nextRight[i];
        }
        left += (targetLeft - left) * u;
        right += (targetRight - right) * u;
      } else {
        for (let i = 0; i < n; i++) {
          const sample = history[at + i];
          left += sample * nextLeft[i];
          right += sample * nextRight[i];
        }
      }
    }
    if (this.fade < 1) this.fade = Math.min(1, this.fade + 1 / crossfadeFrames);
    this.left = left;
    this.right = right;
  }
}

export class BinauralOutput {
  constructor(mode) {
    this.reference = mode === 'binaural-reference';
    this.taps = this.reference ? referenceLength : realtimeLength;
    this.individualPaths = new Set();
    this.directionalBuses = this.reference ? [] : cardinalDirections.map(direction => {
      const filter = new HeadFilter(this.taps);
      filter.update(direction);
      return filter;
    });
    if (this.reference) readMeasurements();
    this.busInputs = new Float64Array(this.directionalBuses.length);
    this.left = this.right = 0;
  }
  get extraLatencyFrames() {
    // Last tap of the causal head FIR (no block buffering). This is an upper
    // bound on filter support, covering late pinna response as well as onset.
    return this.taps - 1;
  }
  arrayBytes(pathCount) {
    const filterArrayBytes = 6 * this.taps * Float32Array.BYTES_PER_ELEMENT;
    return (pathCount + this.directionalBuses.length) * filterArrayBytes +
      (2 * pathCount + 1) * this.busInputs.byteLength;
  }
  createPath() {
    return { filter: new HeadFilter(this.taps), mix: 0, mixTarget: 0,
      busWeights: this.reference ? null : new Float64Array(cardinalDirections.length),
      busTargets: this.reference ? null : new Float64Array(cardinalDirections.length), left: 0, right: 0 };
  }
  choosePaths(paths, sources) {
    if (this.reference) return;
    const first = new Map();
    for (const path of paths) first.set(path.sourceId, Math.min(first.get(path.sourceId) ?? Infinity, path.delay ?? 0));
    const ranked = paths.filter(path => path.order > 0 && !path.scatter && Array.isArray(path.bands) &&
      (path.delay ?? 0) - first.get(path.sourceId) <= initialPathDelay).map(path => ({
        id: path.id,
        score: Math.max(...path.bands) * sources.get(path.sourceId).pressureGain *
          (this.individualPaths.has(path.id) ? 1.125 : 1),
      }));
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    this.individualPaths = new Set(ranked.slice(0, individuallyRenderedReflections).map(path => path.id));
  }
  setPath(pathState, path, reset) {
    const direction = path.arrivalHeadDirection ?? (
      path.pan === 0 ? frontal : [path.pan, Math.sqrt(Math.max(0, 1 - path.pan ** 2)), 0]
    );
    const individual = this.reference || !path.order || this.individualPaths.has(path.id);
    if (reset) {
      pathState.filter.reset();
      pathState.mix = Number(individual);
    }
    pathState.mixTarget = Number(individual);
    if (individual || pathState.mix > 0) pathState.filter.update(direction);
    if (this.reference) return;
    const total = Math.abs(direction[0]) + Math.abs(direction[1]) + Math.abs(direction[2]);
    for (let axis = 0; axis < 3; axis++) {
      pathState.busTargets[2 * axis] = total ? Math.max(0, direction[axis]) / total : Number(axis === 1);
      pathState.busTargets[2 * axis + 1] = total ? Math.max(0, -direction[axis]) / total : 0;
    }
    // An inaudible bus send can move before it enters the mix. Keep the
    // currently audible sends continuous when the receiver changes direction.
    if (reset || pathState.mix === 1) pathState.busWeights.set(pathState.busTargets);
  }
  stepPath(path, sample) {
    if (path.mix !== path.mixTarget)
      path.mix += Math.sign(path.mixTarget - path.mix) * Math.min(1 / crossfadeFrames, Math.abs(path.mixTarget - path.mix));
    const mix = path.mix;
    path.filter.step(sample, mix > 0);
    path.left = path.filter.left * mix;
    path.right = path.filter.right * mix;
    if (mix < 1) {
      const late = sample * (1 - mix);
      for (let i = 0; i < this.busInputs.length; i++) {
        const weight = path.busWeights[i];
        const followed = weight + (path.busTargets[i] - weight) / crossfadeFrames;
        path.busWeights[i] = followed;
        this.busInputs[i] += followed * late;
      }
    }
  }
  stepLate() {
    let left = 0, right = 0;
    for (let i = 0; i < this.directionalBuses.length; i++) {
      const bus = this.directionalBuses[i];
      bus.step(this.busInputs[i]);
      this.busInputs[i] = 0;
      left += bus.left;
      right += bus.right;
    }
    this.left = left;
    this.right = right;
  }
}
