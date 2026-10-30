import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleAcousticPipeline } from '../src/acoustics/vehicle/pipeline.mjs';
import { createVehicleEnvironment } from '../src/acoustics/vehicle/environment.mjs';
import { componentEmitters } from '../src/acoustics/vehicle/state-adapter.mjs';
import { vehicleProfiles } from '../src/acoustics/vehicle/profiles.mjs';
import { trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';

const FS = 48000, BLOCK = 512;
const near = (a, b, tolerance, label = 'measurement') => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
function track(position, forward = [1, 0, 0]) {
  return trajectory([{ time: 0, position, forward }, { time: 5, position, forward }]);
}
function direct(scene, emitter, listener) {
  return solvePath(scene, { track: track(emitter.position, emitter.forward), directivity: emitter.directivity }, track(listener), 1,
    candidatePaths(scene).find(p => p.id === 'direct'));
}
function component(name) {
  return componentEmitters({ id: 'vehicle:1', generation: 1, position: [0, 0, 0.35], velocity: [0, 0, 0],
    forward: [1, 0, 0], up: [0, 0, 1], valid: true, controls: { engineRunning: true, speed: 20 } }, vehicleProfiles.hypercarV12.components)
    .find(s => s.component === name);
}
async function streamed({ seconds = 2, sourceAt = () => [0, 0, 1], velocity = [0, 0, 0],
  listener = [0, 4, 1], input = () => 0.1, environment = 'direct', onBlock = null, directStem = false } = {}) {
  const pipeline = new VehicleAcousticPipeline({ scene: createVehicleEnvironment(environment).scene,
    sourceIds: ['original-test-source'], quality: 'quality', acceleration: 'cpu', directStem });
  const frames = Math.round(FS * seconds), left = new Float32Array(frames), right = new Float32Array(frames);
  const controls = [], outputL = new Float32Array(BLOCK), outputR = new Float32Array(BLOCK),
    directL = new Float32Array(BLOCK), directR = new Float32Array(BLOCK);
  try {
    for (let start = 0; start < frames; start += BLOCK) {
      const n = Math.min(BLOCK, frames - start), t = start / FS;
      if (onBlock) onBlock(pipeline, t);
      const c = await pipeline.prepare({ time: t, session: 'vehicle-propagation-fixture', generation: 1,
        listener: { position: listener, velocity: [0, 0, 0] },
        sources: [{ id: 'original-test-source', generation: 1, position: sourceAt(t), velocity, directivity: 0 }] });
      controls.push(c);
      const pcm = Float32Array.from({ length: n }, (_, i) => input(start + i));
      pipeline.process({ 'original-test-source': pcm }, outputL, outputR, n, directL, directR);
      left.set(outputL.subarray(0, n), start); right.set(outputR.subarray(0, n), start);
    }
    return { left, right, controls, diagnostics: pipeline.diagnostics(),
      sourceGeneration: pipeline.renderer.sourceList[0].generation,
      generationFrame: pipeline.renderer.sourceList[0].generationFrame };
  } finally { pipeline.close(); }
}
function spectralPeak(pcm, expected, startSeconds = 1, durationSeconds = 0.7) {
  const start = Math.round(startSeconds * FS), count = Math.round(durationSeconds * FS);
  let bestFrequency = 0, bestPower = -1;
  // Independent direct DFT with a Hann window, no source/control values used as result.
  for (let f = expected - 3; f <= expected + 3; f += 0.125) {
    let re = 0, im = 0;
    for (let i = 0; i < count; i++) {
      const x = pcm[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (count - 1)));
      const phase = 2 * Math.PI * f * i / FS;
      re += x * Math.cos(phase); im -= x * Math.sin(phase);
    }
    const power = re * re + im * im;
    if (power > bestPower) { bestPower = power; bestFrequency = f; }
  }
  return bestFrequency;
}

test('component axes produce opposite exhaust/intake front-rear radiation through actual path math', () => {
  const scene = createVehicleEnvironment('direct').scene;
  for (const [name, expectedRearToFront] of [['exhaust', 1 / (1 - 0.65)], ['intake', 1 - 0.5]]) {
    const emitter = component(name), rear = direct(scene, emitter, [-15, 0, emitter.position[2]]),
      front = direct(scene, emitter, [15, 0, emitter.position[2]]);
    const compensated = p => p.bands[0] * p.distance * 10 ** (scene.config.airDbPerMetre[0] * p.distance / 20);
    near(compensated(rear) / compensated(front), expectedRearToFront, 1e-9, name);
    assert.equal(rear.status, 'renderable'); assert.equal(front.status, 'renderable');
  }
});

test('distance bands obey independently predicted inverse distance and greater high-frequency absorption', () => {
  const scene = createVehicleEnvironment('direct').scene, emitter = { position: [0, 0, 1], forward: [1, 0, 0], directivity: 0 };
  const close = direct(scene, emitter, [5, 0, 1]), far = direct(scene, emitter, [100, 0, 1]);
  for (let band = 0; band < 3; band++) near(far.bands[band] / close.bands[band],
    5 / 100 * 10 ** (-scene.config.airDbPerMetre[band] * 95 / 20), 1e-12);
  assert.ok(far.bands[2] / far.bands[0] < close.bands[2] / close.bands[0]);
  const nearField = direct(scene, emitter, [0.01, 0, 1]);
  assert.ok(nearField.bands.every(x => Number.isFinite(x) && x <= 1));
});

test('actual streaming impulse arrives at predicted retarded delay without pre-arrival PCM', async () => {
  const expectedFrame = Math.round((0.5 + 34.3 / 343) * FS);
  const result = await streamed({ seconds: 1, sourceAt: () => [-34.3, 0, 1], listener: [0, 0, 1],
    input: frame => frame === FS / 2 ? 0.5 : 0 });
  let peakIndex = 0, peak = 0;
  for (let i = 0; i < result.left.length; i++) if (Math.abs(result.left[i]) > peak) { peak = Math.abs(result.left[i]); peakIndex = i; }
  near(peakIndex, expectedFrame, 1, 'impulse arrival frame');
  assert.ok(result.left.subarray(0, expectedFrame - 1).every(x => Math.abs(x) < 1e-7));
  assert.ok(peak > 0.001);
  assert.equal(result.diagnostics.renderer.limited, 0);
  assert.equal(result.diagnostics.history.affectedFrames, 0);
});

test('full emitted multi-order signal receives a single physically predicted Doppler ratio', async () => {
  const emitted = [500, 1100, 2100], expectedRatio = 343 / (343 - 20);
  const result = await streamed({ seconds: 2, sourceAt: t => [-60 + 20 * t, 0, 1], velocity: [20, 0, 0], listener: [0, 0, 1],
    input: frame => emitted.reduce((sum, f) => sum + 0.07 * Math.sin(2 * Math.PI * f * frame / FS), 0) });
  for (const f of emitted) near(spectralPeak(result.left, f * expectedRatio), f * expectedRatio, 0.5, `received ${f} Hz order`);
  const settled = result.controls.filter(c => c.frame > FS / 2).flatMap(c => c.paths);
  assert.ok(settled.length > 100);
  for (const p of settled) near(p.rate, expectedRatio, 1e-6, 'retarded-time derivative');
  assert.equal(result.diagnostics.renderer.cursorResets, 0);
  assert.equal(result.diagnostics.history.affectedFrames, 0);
});

test('receding source lowers a constant emitted frequency without changing source generation', async () => {
  const speed = 15, ratio = 343 / (343 + speed), frequency = 800;
  const result = await streamed({ seconds: 2, sourceAt: t => [20 + speed * t, 0, 1], velocity: [speed, 0, 0], listener: [0, 0, 1],
    input: frame => 0.1 * Math.sin(2 * Math.PI * frequency * frame / FS) });
  near(spectralPeak(result.right, frequency * ratio), frequency * ratio, 0.5, 'departing frequency');
  assert.ok(result.controls.at(-1).paths[0].delay > result.controls[30].paths[0].delay);
  assert.equal(result.sourceGeneration, 4294967297);
});

test('quality changes and finite geometry withdrawal/restoration preserve source PCM generation', async () => {
  const road = createVehicleEnvironment('road').scene, directScene = createVehicleEnvironment('direct').scene;
  let changedToDirect = false, restored = false, qualityChanged = false;
  const result = await streamed({ seconds: 2.5, environment: 'road', directStem: true,
    input: frame => 0.15 * Math.sin(2 * Math.PI * 600 * frame / FS),
    onBlock(pipeline, t) {
      if (t >= 0.5 && !qualityChanged) { pipeline.setQuality('max'); qualityChanged = true; }
      if (t >= 0.8 && !changedToDirect) { pipeline.replaceScene(directScene); changedToDirect = true; }
      if (t >= 1.6 && !restored) { pipeline.replaceScene(road); pipeline.setQuality('performance'); restored = true; }
    } });
  const during = result.controls.filter(c => c.frame >= FS * 0.9 && c.frame < FS * 1.5);
  assert.ok(during.every(c => c.paths.length === 1 && c.paths[0].order === 0));
  assert.ok(result.controls.at(-1).paths.some(p => p.order === 1));
  assert.equal(result.diagnostics.simulation.resets, 1);
  assert.equal(result.diagnostics.simulation.sceneReplacements, 2);
  assert.equal(result.generationFrame, 0);
  assert.equal(result.diagnostics.renderer.cursorResets, 0);
  assert.equal(result.diagnostics.history.affectedFrames, 0);
  assert.equal(result.diagnostics.renderer.limited, 0);
});

test('finite reflection delay controls differ from direct arrival and use actual material spectra', async () => {
  const result = await streamed({ environment: 'canyon', seconds: 0.6, input: frame => 0.05 * Math.sin(2 * Math.PI * 900 * frame / FS) });
  const c = result.controls.at(-1), first = c.paths.filter(p => p.order === 1), second = c.paths.filter(p => p.order === 2);
  assert.ok(first.length >= 3 && second.length >= 2);
  const directPath = c.paths.find(p => p.order === 0);
  for (const p of [...first, ...second]) {
    near(p.delay, p.distance / 343, 1e-12);
    assert.ok(p.delay > directPath.delay);
    assert.ok(p.bands[0] >= p.bands[1] && p.bands[1] >= p.bands[2]);
  }
  assert.equal(result.diagnostics.renderer.limited, 0);
});
