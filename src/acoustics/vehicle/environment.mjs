// Original analytic fixtures and bounded statistical late field. No GTA geometry inference.
import { acousticScene, freeze, requireValue } from '../engine/contracts.mjs';
import { createTile, coordinateSpace, timeUnit } from '../research/local-geometry.mjs';
import { qualityPresets, qualityReflectors } from '../streaming/acoustic-quality.mjs';

const FS = 48000;
const SQRT8 = Math.sqrt(8);
const acceptedEvidence = new WeakSet();
const bounded = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;

/** Explicit analytic dimensions and absorption, never inferred from sparse GTA rays.
 * Sabine T60 = 0.161 V / sum(S alpha). Open ends have alpha=1.
 * This is a diffuse-field approximation, particularly limited in long tunnels.
 * Source: MIT 21M.380, Room acoustics & reverberation, session 18 (2016), p4.
 * https://ocw.mit.edu/courses/21m-380-music-and-technology-recording-techniques-and-audio-production-fall-2016/d315c75efb01cb76ca897958570bab87_MIT21M_380F16_ses18_note.pdf
 */
export function analyticLateEvidence({ id, dimensions, surfaces, reference = 'vehicle-analytic-v1' }) {
  requireValue(typeof id === 'string' && /^[\w:-]{1,64}$/.test(id), 'late enclosure identity');
  requireValue(typeof reference === 'string' && /^[\w:-]{1,80}$/.test(reference), 'late provenance reference');
  requireValue(Array.isArray(dimensions) && dimensions.length === 3 && dimensions.every(x => bounded(x, 2, 200)), 'analytic enclosure dimensions');
  requireValue(Array.isArray(surfaces) && surfaces.length >= 1 && surfaces.length <= 16, 'analytic enclosure boundaries');
  const [x, y, z] = dimensions, volume = x * y * z;
  const area = 2 * (x * y + x * z + y * z), absorptionArea = [0, 0, 0];
  let suppliedArea = 0;
  for (const s of surfaces) {
    requireValue(bounded(s.area, 0.1, area) && Array.isArray(s.absorption) && s.absorption.length === 3 &&
      s.absorption.every(a => bounded(a, 0.001, 1)) && s.absorption[0] <= s.absorption[1] && s.absorption[1] <= s.absorption[2],
    'explicit monotone absorption coefficients');
    suppliedArea += s.area;
    for (let i = 0; i < 3; i++) absorptionArea[i] += s.area * s.absorption[i];
  }
  requireValue(Math.abs(suppliedArea - area) < area * 1e-6, 'all analytic boundary areas including openings required');
  const rt60Seconds = absorptionArea.map(a => 0.161 * volume / a);
  requireValue(rt60Seconds.every(t => bounded(t, 0.08, 6)), 'late decay outside bounded 0.08 to 6 second implementation');
  const meanFreePathMetres = 4 * volume / area;
  const result = freeze({ id, basis: 'complete-authored-analytic-enclosure', reference,
    dimensions: [...dimensions], volumeCubicMetres: volume, surfaceAreaSquareMetres: area,
    absorptionAreaSquareMetres: absorptionArea, rt60Seconds, meanFreePathMetres,
    meanCollisionSeconds: meanFreePathMetres / 343,
    bounds: { min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, z] },
    physicalCalibration: 'unverified', model: 'diffuse-statistical-approximation',
    limitations: ['No measured impulse response', 'Diffuse approximation does not resolve axial tunnel modes',
      'Wet level is a declared mix calibration, not measured sound power'] });
  acceptedEvidence.add(result);
  return result;
}

function patch(id, center, normal, u, half, validUntil) {
  return { id, coordinateSpace, center, normal, u, half, motion: 'static', reflectiveSide: 'both',
    provenance: { kind: 'synthetic', reference: 'vehicle-analytic-v1' }, confidence: 1, version: 1,
    observedAt: 0, validUntil, material: { observedId: null, observedConfidence: null, acoustic: null } };
}

/** Genuine finite supports only. Quality controls ceilings; it never creates surfaces. */
export function createVehicleEnvironment(kind, { quality = 'quality', duration = 30 } = {}) {
  requireValue(['direct', 'road', 'canyon', 'tunnel', 'corner'].includes(kind), 'vehicle environment kind');
  requireValue(Object.hasOwn(qualityPresets, quality), 'vehicle environment quality');
  requireValue(bounded(duration, 0.1, 60), 'vehicle environment duration');
  const validUntil = (duration + 1) * 1000;
  const floor = patch('road', [0, 0, 0], [0, 0, 1], [1, 0, 0], [120, 14], validUntil);
  let surfaces = kind === 'direct' ? [] : [floor];
  let lateEvidence = null;
  if (kind === 'canyon') surfaces.push(
    patch('wall-north', [0, 8, 4], [0, -1, 0], [1, 0, 0], [100, 4], validUntil),
    patch('wall-south', [0, -8, 4], [0, 1, 0], [1, 0, 0], [100, 4], validUntil));
  if (kind === 'tunnel') {
    surfaces = [patch('road', [0, 0, 0], [0, 0, 1], [1, 0, 0], [40, 7], validUntil),
      patch('wall-north', [0, 7, 3], [0, -1, 0], [1, 0, 0], [40, 3], validUntil),
      patch('wall-south', [0, -7, 3], [0, 1, 0], [1, 0, 0], [40, 3], validUntil),
      patch('ceiling', [0, 0, 6], [0, 0, -1], [1, 0, 0], [40, 7], validUntil)];
    lateEvidence = analyticLateEvidence({ id: 'analytic-open-ended-tunnel', dimensions: [80, 14, 6],
      surfaces: [{ area: 2 * (80 * 14 + 80 * 6), absorption: [0.12, 0.2, 0.35] },
        { area: 2 * 14 * 6, absorption: [1, 1, 1] }] });
  }
  if (kind === 'corner') surfaces.push(
    patch('barrier', [0, 1.5, 2], [0, 1, 0], [1, 0, 0], [10, 2], validUntil));
  const materials = Object.fromEntries(surfaces.map(s => [s.id, {
    reflection: s.id === 'barrier' ? [0.55, 0.45, 0.25] : kind === 'tunnel' ? [0.88, 0.8, 0.65] : [0.85, 0.7, 0.45],
    transmission: s.id === 'barrier' ? [0.09, 0.009, 0.0009] : [0, 0, 0],
    basis: 'authored-assumption', reference: s.id === 'barrier' ? 'illustrative-band-transmission' : 'vehicle-analytic-v1',
  }]));
  const tile = createTile({ schemaVersion: 1, id: 'vehicle-' + kind, coordinateSpace, timeUnit,
    bounds: { min: [-125, -15, -2], max: [125, 15, 10] }, listenerAnchor: [0, 3, 1.5],
    coverage: 'complete-synthetic', surfaces, missingRegions: [], version: 1, createdAt: 0, validUntil,
    build: 'synthetic-vehicle-v1', session: 'vehicle-reference', interior: kind === 'tunnel' ? 'analytic-enclosed' : 'outdoors', dynamicEpoch: 0 });
  return { scene: acousticScene(tile, materials, { order: kind === 'direct' ? 0 : 2,
    maxPaths: qualityPresets[quality], maxReflectors: qualityReflectors[quality] }), lateEvidence,
  description: kind === 'corner' ? 'Finite authored barrier with band-dependent transmission; diffraction unavailable' :
    kind === 'tunnel' ? 'Finite open-ended analytic tunnel; genuine early paths plus optional statistical late field' :
      'Original finite synthetic ' + kind + ' geometry',
  limitations: ['Geometry and acoustic coefficients are authored, not measured GTA data',
    'Only first- and second-order finite reflections; higher orders unavailable',
    'Edge diffraction is unavailable; transmission is an explicit material assumption'] };
}

function nextPrime(n) {
  n = Math.max(3, Math.round(n) | 1);
  for (;; n += 2) {
    let prime = true;
    for (let k = 3; k * k <= n; k += 2) if (n % k === 0) { prime = false; break; }
    if (prime) return n;
  }
}

/** 8-line orthogonal Householder FDN, all preparation off the sample loop.
 * H=I-2vv^T, v=(1,...,1)/sqrt(8), so ||H||2=1. Feedback filters are
 * positive sums of unit-gain stable lowpasses and feedthrough; their H-infinity
 * norm is at most gLow<1. No limiting hides unstable energy or bad inputs.
 * Per-loop amplitude target g=10^(-3 delay/T60); spectral decay is approximate
 * between the three damping anchors, not an exact frequency-domain room solution.
 * Smith, Physical Audio Signal Processing (2010), FDN Reverberation:
 * https://ccrma.stanford.edu/~jos/pasp/FDN_Reverberation.html
 */
export class BoundedLateReverb {
  constructor(evidence, { sampleRate = FS, wet = 0.22 } = {}) {
    requireValue(sampleRate === FS && bounded(wet, 0, 0.6), 'bounded late-field sample rate and mix');
    requireValue(evidence == null || acceptedEvidence.has(evidence), 'validated analytic late evidence required');
    this.evidence = evidence;
    this.wet = wet;
    this.enabled = Boolean(evidence);
    this.send = this.enabled ? 1 : 0;
    this.smooth = 1 - Math.exp(-1 / (0.05 * FS));
    this.lowA = 1 - Math.exp(-2 * Math.PI * 400 / FS);
    this.upperA = 1 - Math.exp(-2 * Math.PI * 4000 / FS);
    this.outputFrames = 0;
    this.peak = 0;
    this.values = new Float64Array(8);
    this.lines = [];
    this.inputGain = 0;
    if (!evidence) return;
    const factors = [0.71, 0.83, 0.97, 1.09, 1.23, 1.37, 1.51, 1.67];
    // Prime delays centred around mean collision time, bounded 8..90 ms.
    const scale = Math.max(0.012, Math.min(0.05, evidence.meanCollisionSeconds));
    for (const factor of factors) {
      const n = nextPrime(FS * scale * factor);
      const gains = evidence.rt60Seconds.map(t => 10 ** (-3 * n / (FS * t)));
      this.lines.push({ data: new Float64Array(n), index: 0, low: 0, upper: 0, gains });
    }
    const maximumFeedback = Math.max(...this.lines.map(l => l.gains[0]));
    // A unit-variance uncorrelated excitation in a feedback loop with amplitude
    // g accumulates variance 1/(1-g*g). Compensate with sqrt(1-g*g), using the
    // least lossy loop as a conservative common energy normalization. The old
    // (1-g) send unnecessarily suppressed this dense field by ~15 dB here.
    // This is algorithmic energy calibration, NOT measured diffuse SPL. Its
    // finite per-channel induced L2 gain is bounded by wet*sqrt((1+g)/(1-g));
    // coherent resonances can exceed a white-noise RMS calibration.
    this.inputGain = Math.sqrt(1 - maximumFeedback * maximumFeedback) / SQRT8;
    this.maximumL2GainBound = wet * Math.sqrt((1 + maximumFeedback) / (1 - maximumFeedback));
    const onsetFrames = Math.round(FS * Math.min(0.15, Math.max(0.035, 3 * evidence.meanCollisionSeconds)));
    this.predelay = new Float64Array(onsetFrames);
    this.preIndex = 0;
  }

  setEnabled(value) {
    requireValue(typeof value === 'boolean', 'late enabled flag');
    this.enabled = Boolean(this.evidence) && value;
  }

  process(left, right, { enabled = this.enabled } = {}) {
    requireValue(left instanceof Float32Array && right instanceof Float32Array && left.length === right.length &&
      left.length > 0 && left.length <= 16384, 'bounded stereo late input');
    const out = { left: new Float32Array(left.length), right: new Float32Array(left.length) };
    this.processInto(left, right, out.left, out.right, { enabled });
    return out;
  }

  /** Caller-owned buffers avoid allocation in production DSP. Never blocks or uses devices. */
  processInto(left, right, outLeft, outRight, { enabled = this.enabled } = {}) {
    requireValue(left instanceof Float32Array && right instanceof Float32Array && left.length === right.length &&
      left.length > 0 && left.length <= 16384 && outLeft instanceof Float32Array && outRight instanceof Float32Array &&
      outLeft.length === left.length && outRight.length === left.length, 'bounded stereo late buffers');
    const overlaps = (a, b) => a.buffer === b.buffer && a.byteOffset < b.byteOffset + b.byteLength &&
      b.byteOffset < a.byteOffset + a.byteLength;
    requireValue(!overlaps(outLeft, outRight) && ![left, right].some(input =>
      overlaps(input, outLeft) || overlaps(input, outRight)), 'late outputs must not overlap inputs or each other');
    for (let n = 0; n < left.length; n++) requireValue(Number.isFinite(left[n]) && Number.isFinite(right[n]) &&
      Math.abs(left[n]) <= 1 && Math.abs(right[n]) <= 1, 'finite bounded late send');
    this.setEnabled(enabled);
    if (!this.evidence) { outLeft.fill(0); outRight.fill(0); this.outputFrames += left.length; return; }
    const target = this.enabled ? 1 : 0;
    for (let n = 0; n < left.length; n++) {
      this.send += this.smooth * (target - this.send);
      const delayed = this.predelay[this.preIndex];
      this.predelay[this.preIndex] = 0.5 * (left[n] + right[n]) * this.send;
      if (++this.preIndex === this.predelay.length) this.preIndex = 0;
      let total = 0, outputL = 0, outputR = 0;
      for (let i = 0; i < 8; i++) {
        const line = this.lines[i], value = line.data[line.index];
        line.low += this.lowA * (value - line.low);
        line.upper += this.upperA * (value - line.upper);
        const [lo, mid, hi] = line.gains;
        const filtered = hi * value + (mid - hi) * line.upper + (lo - mid) * line.low;
        this.values[i] = filtered;
        total += filtered;
        outputL += (i % 2 ? -1 : 1) * value;
        outputR += (i % 4 < 2 ? 1 : -1) * value;
      }
      for (let i = 0; i < 8; i++) {
        const line = this.lines[i];
        // Independent alternating injection avoids the constant Householder eigenvector.
        line.data[line.index] = this.values[i] - total / 4 + (i % 3 ? 1 : -1) * delayed * this.inputGain;
        if (++line.index === line.data.length) line.index = 0;
      }
      outLeft[n] = outputL * this.wet / SQRT8;
      outRight[n] = outputR * this.wet / SQRT8;
      this.peak = Math.max(this.peak, Math.abs(outLeft[n]), Math.abs(outRight[n]));
    }
    this.outputFrames += left.length;
  }

  diagnostics() {
    return { supported: Boolean(this.evidence), enabled: this.enabled,
      model: this.evidence?.model ?? 'unsupported-no-late-field', rt60Seconds: this.evidence?.rt60Seconds ?? null,
      delayFrames: this.lines.map(l => l.data.length), predelayFrames: this.predelay?.length ?? 0,
      memoryBytes: this.lines.reduce((n, l) => n + l.data.byteLength, this.values.byteLength + (this.predelay?.byteLength ?? 0)),
      maximumFeedbackGain: this.lines.length ? Math.max(...this.lines.map(l => l.gains[0])) : 0,
      inputNormalization: 'feedback-energy', maximumL2GainBound: this.maximumL2GainBound ?? 0,
      frames: this.outputFrames, peak: this.peak, processingDevice: 'CPU', physicalCalibration: 'unverified' };
  }
}
