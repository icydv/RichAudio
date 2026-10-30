import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acousticScene, trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';
import { createTile, coordinateSpace, timeUnit } from '../src/acoustics/research/local-geometry.mjs';
import { CausalSimulation, StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { patch } from './fixtures/acoustics-scenes.mjs';

const FS = 48000, BLOCK = 512, REFLECTION = [.81, .64, .36];
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const sequence = (order, start = 0) => Array.from({ length: order }, (_, i) =>
  (i + start) % 2 ? 'wall-south' : 'wall-north');
const train = () => Array.from({ length: 8 }, (_, i) => [sequence(i + 3), sequence(i + 3, 1)]).flat();
const pathId = ids => 'r:' + ids.join('>');
const track = position => trajectory([{ time: 0, position }]);

function fixture({ width = 24, paths = train(), order = 2, reflection = REFLECTION,
  edit = () => {}, engine = {} } = {}) {
  const surfaces = [
    patch('wall-north', [0, width / 2, 6], [0, -1, 0], [1, 0, 0], [40, 6], { validUntil: 4000 }),
    patch('wall-south', [0, -width / 2, 6], [0, 1, 0], [1, 0, 0], [40, 6], { validUntil: 4000 }),
  ];
  edit(surfaces);
  const tile = createTile({ schemaVersion: 1, id: 'original-urban-train', coordinateSpace, timeUnit,
    bounds: { min: [-50, -30, -2], max: [50, 30, 14] }, listenerAnchor: [4, 0, 1.5],
    coverage: 'complete-synthetic', surfaces, missingRegions: [], version: 1, createdAt: 0, validUntil: 4000,
    build: 'synthetic-train-v1', session: 'urban-train-test', interior: 'outdoors', dynamicEpoch: 0 });
  const materials = Object.fromEntries(surfaces.map(s => [s.id,
    { reflection, transmission: [0, 0, 0], basis: 'authored-assumption', reference: 'original-train-v1' }]));
  const scene = acousticScene(tile, materials, { order, maxPaths: 32, ...engine,
    ...(paths === undefined ? {} : { higherOrderPaths: paths }) });
  return { scene, tile, materials };
}

function solve(scene, ids, { time = 2, sourceTrack = track([-4, 0, 1.5]) } = {}) {
  const candidate = candidatePaths(scene).find(p => p.id === pathId(ids));
  assert.ok(candidate, 'authored candidate exists');
  return solvePath(scene, { track: sourceTrack, directivity: 0 }, track([4, 0, 1.5]), time, candidate);
}

test('default configuration and zero-to-second-order enumeration stay identical', () => {
  const { tile, materials } = fixture({ paths: [] });
  const original = acousticScene(tile, materials, { order: 2, maxPaths: 32 });
  const empty = acousticScene(tile, materials, { order: 2, maxPaths: 32, higherOrderPaths: [] });
  assert.deepEqual(empty.config, original.config);
  assert.equal(Object.hasOwn(original.config, 'higherOrderPaths'), false);
  assert.equal(Object.hasOwn(empty.config, 'higherOrderPaths'), false);
  const expected = ['direct', 'r:wall-north', 'r:wall-south',
    'r:wall-north>wall-south', 'r:wall-south>wall-north'];
  assert.deepEqual(candidatePaths(original).map(p => p.id), expected);
  assert.deepEqual(candidatePaths(empty), candidatePaths(original));
  const extended = acousticScene(tile, materials, { order: 2, maxPaths: 32, higherOrderPaths: train() });
  const candidates = candidatePaths(extended);
  assert.deepEqual(candidates.slice(0, 5), candidatePaths(original));
  assert.equal(candidates.length, 21, 'five existing plus sixteen authored candidates; no path tree');
  assert.equal(new Set(candidates.map(p => p.id)).size, candidates.length);
  for (const order of [0, 1]) {
    const plain = acousticScene(tile, materials, { order });
    assert.deepEqual(candidatePaths(plain).map(p => p.id), expected.slice(0, order ? 3 : 1));
  }
});

test('authored train input is copied, frozen and bounded to valid unique finite surface sequences', () => {
  const input = train(), { scene, tile, materials } = fixture({ paths: input });
  input[0][0] = 'changed-after-validation';
  assert.equal(scene.config.higherOrderPaths[0][0], 'wall-north');
  assert.ok(Object.isFrozen(scene.config.higherOrderPaths));
  assert.ok(Object.isFrozen(scene.config.higherOrderPaths[0]));
  const invalid = [null, {}, Array(17).fill(sequence(3)), [sequence(2)], [sequence(11)],
    [['wall-north', 'wall-north', 'wall-south']], [['wall-north', 1, 'wall-north']],
    [['wall-north', 'missing-wall', 'wall-north']], [sequence(3), sequence(3)], Array(1), [Array(3)]];
  for (const higherOrderPaths of invalid)
    assert.throws(() => acousticScene(tile, materials, { order: 2, higherOrderPaths }), /higher-order/);
  for (const order of [0, 1])
    assert.throws(() => acousticScene(tile, materials, { order, higherOrderPaths: train() }), /require order 2/);
  assert.throws(() => acousticScene(tile, materials, { order: 3 }), /path\/order budget/);
});

test('every added bounce must survive the existing deterministic quality reflector cap', () => {
  const { scene } = fixture();
  assert.deepEqual(candidatePaths(scene, { maxReflectors: 1 }).map(p => p.id), ['direct', 'r:wall-north']);
  assert.equal(candidatePaths(scene, { maxReflectors: 2 }).filter(p => p.surfaces.length > 2).length, 16);
  const reversed = acousticScene(scene.tile, scene.materials,
    { ...scene.config, higherOrderPaths: [...scene.config.higherOrderPaths].reverse() });
  assert.deepEqual(candidatePaths(reversed, { maxReflectors: 1 }), candidatePaths(scene, { maxReflectors: 1 }));
});

test('parallel finite walls give independently unfolded distances and energy losses at orders three to ten', () => {
  for (const width of [12, 24, 40]) {
    const { scene } = fixture({ width });
    for (let order = 3; order <= 10; order++) {
      const expectedDistance = Math.hypot(8, order * width);
      for (const start of [0, 1]) {
        const p = solve(scene, sequence(order, start));
        assert.equal(p.status, 'renderable');
        assert.equal(p.order, order);
        assert.equal(p.points.length, order);
        close(p.distance, expectedDistance);
        close(p.delay, expectedDistance / 343);
        close(p.emissionTime, 2 - expectedDistance / 343);
        assert.ok(p.retardedResidual < 1e-7);
        for (let band = 0; band < 3; band++) {
          const expectedPressure = REFLECTION[band] ** (order / 2) / expectedDistance *
            10 ** (-scene.config.airDbPerMetre[band] * expectedDistance / 20);
          close(p.bands[band], expectedPressure, 1e-12);
        }
      }
    }
  }
  const narrow = solve(fixture({ width: 12 }).scene, sequence(8));
  const wide = solve(fixture({ width: 24 }).scene, sequence(8));
  assert.ok(wide.delay > narrow.delay * 1.99, 'wall spacing sets the repeated-arrival spacing');
});

test('changing only authored reflectance changes decay while arrival time stays fixed', () => {
  const dryWall = fixture({ reflection: [.49, .25, .09] }).scene;
  const reflectiveWall = fixture().scene;
  for (const order of [3, 6, 10]) {
    const a = solve(dryWall, sequence(order)), b = solve(reflectiveWall, sequence(order));
    close(a.delay, b.delay);
    close(a.distance, b.distance);
    for (let band = 0; band < 3; band++)
      close(a.bands[band] / b.bands[band], ([.49, .25, .09][band] / REFLECTION[band]) ** (order / 2));
  }
});

test('short finite supports, openings and intervening geometry reject unsupported higher-order routes', () => {
  const short = fixture({ edit: surfaces => { surfaces[0].half[0] = .1; } }).scene;
  assert.equal(solve(short, sequence(3)).status, 'outside-finite-patch-or-opening');
  const open = fixture({ edit: surfaces => {
    surfaces[0].openings = [{ min: [-3, -5], max: [-2.4, -4] }];
  } }).scene;
  assert.equal(solve(open, sequence(3)).status, 'outside-finite-patch-or-opening');
  const blocked = fixture({ edit: surfaces => surfaces.push(
    patch('screen', [0, 0, 6], [1, 0, 0], [0, 1, 0], [29, 6], { validUntil: 4000 })) }).scene;
  assert.equal(solve(blocked, sequence(3)).status, 'blocked-reflection');
  assert.throws(() => fixture({ edit: surfaces => surfaces.pop() }), /existing finite/);
  const removed = fixture({ paths: [], edit: surfaces => surfaces.pop() }).scene;
  assert.ok(candidatePaths(removed).every(p => p.surfaces.length <= 1));
});

test('unknown material, expiry and the existing delay limit still reject extended paths', () => {
  const { scene, tile, materials } = fixture();
  const unknown = acousticScene(tile, { ...materials, 'wall-south': null }, scene.config);
  assert.equal(solve(unknown, sequence(3)).status, 'material-unknown');
  assert.equal(solve(scene, sequence(3), { time: 4 }).status, 'geometry-time-unavailable');
  const earlyExpiry = fixture({ edit: surfaces => { surfaces[0].validUntil = 1500; } }).scene;
  assert.equal(solve(earlyExpiry, sequence(3), { time: 1.5 }).status, 'geometry-time-unavailable');
  const delayLimited = fixture({ width: 40, engine: { maxDelay: .1 } }).scene;
  assert.equal(solve(delayLimited, sequence(10)).status, 'delay-budget');
});

test('moving-source higher-order emission time matches an independent retarded-time quadratic', () => {
  const width = 24, order = 8, speed = 3, arrival = 1;
  const { scene } = fixture({ width });
  const sourceTrack = trajectory([{ time: 0, position: [-4, 0, 1.5] },
    { time: 3, position: [-4 + 3 * speed, 0, 1.5] }]);
  const p = solve(scene, sequence(order), { time: arrival, sourceTrack });
  const dx = 8 - speed * arrival, a = 343 ** 2 - speed ** 2;
  const expectedDelay = (dx * speed + Math.sqrt((dx * speed) ** 2 + a * (dx ** 2 + (order * width) ** 2))) / a;
  assert.equal(p.status, 'renderable');
  close(p.delay, expectedDelay);
  close(p.emissionTime, arrival - expectedDelay);
});

test('causal high-order impulse arrives at its predicted frame without unavailable source history', () => {
  const width = 40, order = 10, ids = sequence(order);
  const { scene } = fixture({ width, reflection: [.64, .64, .64], engine: { airDbPerMetre: [0, 0, 0] } });
  const simulation = new CausalSimulation(scene);
  const renderer = new StreamingRenderer({ sourceIds: ['original-impulse'], maxPathsPerSource: 1,
    masterGain: 1, historyDiagnostics: true, generationReleaseGuard: true });
  const frames = FS * 2, emissionFrame = FS / 2, audio = new Float32Array(frames);
  const input = new Float32Array(BLOCK), left = new Float32Array(BLOCK), right = new Float32Array(BLOCK);
  let accepted = 0;
  for (let at = 0; at < frames; at += BLOCK) {
    const n = Math.min(BLOCK, frames - at), time = at / FS;
    simulation.observe({ time, session: 'urban-train-causal', generation: 1,
      listener: { position: [4, 0, 1.5], velocity: [0, 0, 0] },
      sources: [{ id: 'original-impulse', generation: 1, position: [-4, 0, 1.5], velocity: [0, 0, 0], directivity: 0 }] });
    const control = simulation.update(time);
    const selected = control.paths.filter(p => p.id.startsWith('original-impulse:' + pathId(ids) + ':'));
    for (const p of selected) {
      close(p.delay, Math.hypot(8, width * order) / 343);
      close(p.emissionFrame, (time - p.delay) * FS, 1e-6);
      assert.ok(p.emissionFrame >= -1e-6);
      close(p.rate, 1, 1e-8);
      accepted++;
    }
    renderer.accept({ ...control, paths: selected });
    input.fill(0);
    if (emissionFrame >= at && emissionFrame < at + n) input[emissionFrame - at] = .25;
    renderer.process({ 'original-impulse': input }, left, right, n);
    audio.set(left.subarray(0, n), at);
  }
  assert.ok(accepted > 20, 'higher-order route actually reaches the causal renderer');
  const expectedFrame = emissionFrame + Math.hypot(8, width * order) / 343 * FS;
  let peak = 0, peakFrame = -1;
  for (let i = 0; i < audio.length; i++) if (Math.abs(audio[i]) > peak) { peak = Math.abs(audio[i]); peakFrame = i; }
  close(peakFrame, expectedFrame, 1);
  assert.ok(peak > 1e-6);
  assert.ok(audio.subarray(0, Math.floor(expectedFrame) - 1).every(x => x === 0));
  assert.equal(renderer.stats.limited, 0);
  assert.equal(renderer.stats.missingHistory, 0);
  assert.equal(renderer.stats.pathOverflow, 0);
  assert.equal(renderer.historyDiagnostics.affectedFrames, 0);
});
