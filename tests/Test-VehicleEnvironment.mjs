import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticLateEvidence, BoundedLateReverb, createVehicleEnvironment } from '../src/acoustics/vehicle/environment.mjs';
import { trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';

const FS = 48000;
const track = position => trajectory([{ time: 0, position }, { time: 8, position }]);
const listener = track([0, 3, 1.5]);
function paths(scene, sourcePosition, time = 1) {
  const source = { track: track(sourcePosition), directivity: 0 };
  return candidatePaths(scene).map(c => solvePath(scene, source, listener, time, c));
}
function impulse(evidence, seconds = 5) {
  const reverb = new BoundedLateReverb(evidence, { wet: 0.6 });
  const all = new Float32Array(FS * seconds);
  for (let start = 0; start < all.length; start += 512) {
    const input = new Float32Array(Math.min(512, all.length - start));
    if (!start) input[0] = 1;
    all.set(reverb.process(input, input).left, start);
  }
  return { audio: all, reverb };
}
function band(pcm, frequency, high = false) {
  const a = 1 - Math.exp(-2 * Math.PI * frequency / FS), result = new Float32Array(pcm.length);
  let lp = 0;
  for (let i = 0; i < pcm.length; i++) { lp += a * (pcm[i] - lp); result[i] = high ? pcm[i] - lp : lp; }
  return result;
}
function schroederRt60(pcm) {
  const energies = new Float64Array(pcm.length);
  let sum = 0;
  for (let i = pcm.length - 1; i >= 0; i--) { sum += pcm[i] * pcm[i]; energies[i] = sum; }
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < pcm.length; i += 48) {
    const db = 10 * Math.log10(energies[i] / sum), time = i / FS;
    if (db < -5 && db > -35) { n++; sx += time; sy += db; sxx += time * time; sxy += time * db; }
  }
  assert.ok(n > 20, 'sufficient measurable decay interval');
  return -60 / ((n * sxy - sx * sy) / (n * sxx - sx * sx));
}

test('finite environments preserve established quality ceilings without invented paths', () => {
  for (const [quality, budget] of Object.entries({ performance: 12, balanced: 16, quality: 32, max: 64 })) {
    const { scene } = createVehicleEnvironment('road', { quality });
    assert.equal(scene.config.maxPaths, budget);
    assert.equal(scene.tile.surfaces.length, 1);
    assert.equal(candidatePaths(scene).length, 2);
  }
});

test('canyon and tunnel have simultaneous genuine finite first and second orders with physical delays', () => {
  for (const name of ['canyon', 'tunnel']) {
    const { scene } = createVehicleEnvironment(name);
    const solved = paths(scene, [-8, 0, 1]).filter(p => p.status === 'renderable');
    assert.ok(solved.some(p => p.order === 0));
    assert.ok(solved.filter(p => p.order === 1).length >= 3);
    assert.ok(solved.filter(p => p.order === 2).length >= 2);
    const direct = solved.find(p => p.order === 0);
    for (const p of solved) {
      assert.ok(Math.abs(p.delay - p.distance / 343) < 1e-12);
      assert.ok(p.delay >= direct.delay);
      assert.ok(p.retardedResidual < 1e-7);
      assert.ok(p.bands[0] >= p.bands[1] && p.bands[1] >= p.bands[2]);
      assert.equal(p.points.length, p.order);
    }
  }
});

test('authored finite barrier transmits less high frequency and clears beyond its actual edge', () => {
  const { scene } = createVehicleEnvironment('corner');
  const directScene = createVehicleEnvironment('direct').scene;
  const blocked = paths(scene, [0, 0, 1]).find(p => p.order === 0);
  const clear = paths(directScene, [0, 0, 1]).find(p => p.order === 0);
  assert.equal(blocked.visibility, 'authored-transmission');
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(blocked.bands[i] / clear.bands[i] - Math.sqrt([0.09, 0.009, 0.0009][i])) < 1e-12);
  const around = paths(scene, [30, 0, 1]).find(p => p.order === 0);
  assert.equal(around.visibility, 'verified-synthetic-path');
  assert.equal(around.materialBasis.length, 0);
  assert.ok(paths(scene, [0, 0, 1], 31).every(p => p.status === 'geometry-time-unavailable'));
});

test('late fields require complete authored enclosure evidence and never activate outdoors', () => {
  for (const kind of ['direct', 'road', 'canyon', 'corner']) {
    const env = createVehicleEnvironment(kind), reverb = new BoundedLateReverb(env.lateEvidence);
    const input = new Float32Array(512).fill(0.2);
    assert.equal(reverb.diagnostics().supported, false);
    assert.ok(reverb.process(input, input).left.every(x => x === 0));
  }
  assert.throws(() => new BoundedLateReverb({ rt60Seconds: [2, 2, 2] }), /validated/);
  assert.throws(() => analyticLateEvidence({ id: 'partial', dimensions: [10, 10, 5], surfaces: [{ area: 100, absorption: [0.2, 0.3, 0.4] }] }), /all analytic/);
});

test('flat loss FDN measured decay agrees with independent Sabine T60 prediction', () => {
  const evidence = analyticLateEvidence({ id: 'flat-room', dimensions: [12, 10, 4],
    surfaces: [{ area: 416, absorption: [0.2, 0.2, 0.2] }] });
  const expected = 0.161 * 480 / (416 * 0.2);
  assert.equal(evidence.rt60Seconds[0], expected);
  const { audio, reverb } = impulse(evidence, 4), measured = schroederRt60(audio);
  assert.ok(Math.abs(measured / expected - 1) < 0.12, `${measured} vs ${expected}`);
  const d = reverb.diagnostics();
  assert.ok(d.maximumFeedbackGain < 1 && d.memoryBytes < 300000);
  assert.ok(audio.every(Number.isFinite));
  assert.ok(d.peak < 0.1);
  const onset = audio.findIndex(x => x !== 0);
  assert.ok(onset >= d.predelayFrames + Math.min(...d.delayFrames));
  assert.ok(audio.subarray(FS / 2, FS).filter(x => Math.abs(x) > 1e-8).length > FS / 3, 'late field becomes dense');
});

test('frequency-dependent enclosure damping gives shorter bright decay and stable quiet tail', () => {
  const { lateEvidence } = createVehicleEnvironment('tunnel');
  const { audio, reverb } = impulse(lateEvidence, 6);
  const low = schroederRt60(band(audio, 120)), high = schroederRt60(band(audio, 7000, true));
  assert.ok(low > high * 1.2, `low ${low}; high ${high}`);
  assert.ok(low < 4 && high < 3);
  let early = 0, late = 0;
  for (let i = FS / 4; i < FS; i++) early += audio[i] ** 2;
  for (let i = 5 * FS; i < audio.length; i++) late += audio[i] ** 2;
  assert.ok(late < early * 1e-8);
  assert.ok(reverb.diagnostics().peak < 0.1);
});

test('late processing is deterministic across block boundaries and reuses caller buffers', () => {
  const evidence = createVehicleEnvironment('tunnel').lateEvidence;
  const input = Float32Array.from({ length: 8192 }, (_, i) => 0.2 * Math.sin(i * 0.1));
  const a = new BoundedLateReverb(evidence), b = new BoundedLateReverb(evidence);
  const whole = a.process(input, input);
  const left = new Float32Array(input.length), right = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += 256) b.processInto(input.subarray(start, start + 256), input.subarray(start, start + 256), left.subarray(start, start + 256), right.subarray(start, start + 256));
  assert.deepEqual(left, whole.left);
  assert.deepEqual(right, whole.right);
  assert.throws(() => b.process(new Float32Array([NaN]), new Float32Array([0])), /finite bounded/);
  assert.throws(() => b.process(new Float32Array(16385), new Float32Array(16385)), /bounded stereo/);
  assert.throws(() => b.processInto(input, input, input, new Float32Array(input.length)), /overlap/);
});

test('source departure smooths late injection and preserves an existing decaying tail', () => {
  const reverb = new BoundedLateReverb(createVehicleEnvironment('tunnel').lateEvidence);
  const input = new Float32Array(512).fill(0.15);
  for (let n = 0; n < 100; n++) reverb.process(input, input);
  const before = reverb.send;
  const tail = reverb.process(new Float32Array(512), new Float32Array(512), { enabled: false });
  assert.ok(reverb.send < before && reverb.send > 0.7);
  assert.ok(tail.left.some(x => Math.abs(x) > 1e-6));
  assert.equal(reverb.diagnostics().enabled, false);
});

test('energy-normalized late field stays bounded under sustained DC, noise and coherent tones', () => {
  const evidence = createVehicleEnvironment('tunnel').lateEvidence;
  let maximumPeak = 0;
  // These are stress inputs, not a claim of physical room-level calibration.
  for (const frequency of [0, 30, 50, 100, 125, 200, 600, 2000, 10000, 'noise']) {
    const reverb = new BoundedLateReverb(evidence, { wet: 0.6 });
    let seed = 1234567, inputEnergy = 0, outputEnergy = 0;
    for (let start = 0; start < FS * 2; start += 512) {
      const input = Float32Array.from({ length: 512 }, (_, i) => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return frequency === 'noise' ? (seed >>> 0) / 2147483648 - 1 :
          frequency === 0 ? 1 : Math.sin(2 * Math.PI * frequency * (start + i) / FS);
      });
      const out = reverb.process(input, input);
      for (let i = 0; i < input.length; i++) {
        assert.ok(Number.isFinite(out.left[i]) && Number.isFinite(out.right[i]));
        inputEnergy += input[i] ** 2;
        outputEnergy += out.left[i] ** 2;
      }
    }
    const d = reverb.diagnostics();
    assert.ok(d.peak < 0.7, `${frequency}: ${d.peak}`);
    assert.ok(Math.sqrt(outputEnergy / inputEnergy) <= d.maximumL2GainBound);
    assert.equal(d.inputNormalization, 'feedback-energy');
    if (frequency === 'noise') assert.ok(outputEnergy / inputEnergy > 0.001, 'energy send is materially nonzero');
    maximumPeak = Math.max(maximumPeak, d.peak);
  }
  assert.ok(maximumPeak > 0.1, 'stress check exercised a substantial response');
});
