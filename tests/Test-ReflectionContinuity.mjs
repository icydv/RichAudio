import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acousticScene } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths } from '../src/acoustics/engine/paths.mjs';
import { createTile } from '../src/acoustics/research/local-geometry.mjs';
import { CausalSimulation, StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { patch, sceneInput } from './fixtures/acoustics-scenes.mjs';

const sampleRate = 48000, blockFrames = 512, blocks = 84;

function renderWall({ split }) {
  const input = sceneInput();
  const walls = split ? [['west-face', -5, 5], ['east-face', 5, 5]] : [['whole-face', 0, 10]];
  input.surfaces = walls.map(([id, x, half]) => patch(id, [x, 6, 2], [0, -1, 0], [1, 0, 0], [half, 2]));
  const tile = createTile(input);
  const materials = Object.fromEntries(tile.surfaces.map(s => [s.id, {
    reflection: [.81, .64, .36], transmission: [0, 0, 0], basis: 'authored-assumption', reference: 'split-wall-test',
  }]));
  const scene = acousticScene(tile, materials, { order: 1 });
  const simulation = new CausalSimulation(scene);
  // This test isolates consumption of the worker's face-to-support association.
  // Both variants still solve visibility and finite bounds against the actual faces.
  simulation.candidates = candidatePaths(scene).filter(c => c.surfaces.length)
    .map(c => ({ ...c, continuityId: 'r:continuous-wall' }));
  const renderer = new StreamingRenderer({ sourceIds: ['motor'], continuousRates: true, masterGain: 1 });
  const stereo = [new Float32Array(blockFrames * blocks), new Float32Array(blockFrames * blocks)];
  const dry = new Float32Array(blockFrames), left = new Float32Array(blockFrames), right = new Float32Array(blockFrames);
  const controls = [], activeSlots = [];
  for (let block = 0; block < blocks; block++) {
    const frame = block * blockFrames, time = frame / sampleRate;
    simulation.observe({ session: 'split-wall', time, listener: { position: [0, 0, 1] },
      sources: [{ id: 'motor', generation: 1, position: [-2.03 + 6 * time, 0, 1], velocity: [6, 0, 0] }] });
    const control = simulation.update(time);
    renderer.accept(control);
    for (let i = 0; i < blockFrames; i++) dry[i] = .5 * Math.sin(2 * Math.PI * 731 * (frame + i) / sampleRate);
    renderer.process({ motor: dry }, left, right);
    stereo[0].set(left, frame);
    stereo[1].set(right, frame);
    controls.push(...control.paths);
    activeSlots.push(renderer.slots.filter(s => s.active).length);
  }
  return { stereo, controls, activeSlots };
}

test('crossing a coplanar face seam keeps one arrival and the continuous wall waveform', () => {
  const whole = renderWall({ split: false }), split = renderWall({ split: true });
  const residual = Math.max(...split.stereo.map((samples, side) =>
    samples.reduce((peak, value, i) => Math.max(peak, Math.abs(value - whole.stereo[side][i])), 0)));
  assert.ok(residual < 1e-7, `seam changes stereo PCM by ${residual}`);
  assert.equal(Math.max(...split.activeSlots), 1);
  assert.equal(new Set(split.controls.map(p => p.id)).size, 1);
  assert.deepEqual([...new Set(split.controls.map(p => p.candidateId))], ['r:west-face', 'r:east-face']);
});

function twoWallScene(limited) {
  const input = sceneInput();
  input.surfaces = [
    patch('south', [limited ? -5 : 0, -6, 2], [0, 1, 0], [1, 0, 0], [limited ? 5 : 10, 2]),
    patch('north', [0, 6, 2], [0, -1, 0], [1, 0, 0], [10, 2]),
  ];
  const tile = createTile(input);
  const materials = Object.fromEntries(tile.surfaces.map(s => [s.id, {
    reflection: [.81, .81, .81], transmission: [0, 0, 0], basis: 'authored-assumption', reference: 'parallel-wall-test',
  }]));
  return acousticScene(tile, materials, { order: 2, airDbPerMetre: [0, 0, 0] });
}

function renderTwoWall({ limited, sourcePosition, sourceVelocity, cameraAngle, drySample }) {
  const simulation = new CausalSimulation(twoWallScene(limited));
  const renderer = new StreamingRenderer({ sourceIds: ['motor'], continuousRates: true, masterGain: 1,
    generationReleaseGuard: true, historyDiagnostics: true });
  const audio = [[], []], rows = [];
  const dry = new Float32Array(blockFrames), left = new Float32Array(blockFrames), right = new Float32Array(blockFrames);
  for (let block = 0; block < blocks; block++) {
    const frame = block * blockFrames, time = frame / sampleRate, yaw = cameraAngle(time);
    simulation.observe({ time, session: 'moving-two-wall', listener: { position: [0, 0, 1],
      forward: [Math.cos(yaw), Math.sin(yaw), 0] }, sources: [
      { id: 'motor', position: sourcePosition(time), velocity: sourceVelocity, directivity: 0 },
    ] });
    const control = simulation.update(time);
    const selected = control.paths.filter(p => p.id.includes(':r:south>north:'));
    renderer.accept({ ...control, paths: selected });
    const slot = renderer.slots.find(s => s.active);
    rows.push({ frame, path: selected[0], active: !!slot, releaseLeft: slot?.releaseLeft ?? 0 });
    for (let i = 0; i < blockFrames; i++) dry[i] = drySample(frame + i);
    renderer.process({ motor: dry }, left, right);
    audio[0].push(...left);
    audio[1].push(...right);
  }
  assert.equal(renderer.stats.pathOverflow, 0);
  assert.equal(renderer.historyDiagnostics.affectedFrames, 0);
  assert.equal(renderer.stats.limited, 0);
  return { audio, rows };
}

test('turning the listener turns a two-bounce return from the last wall across the stereo field', () => {
  const { audio, rows } = renderTwoWall({ limited: false, sourcePosition: () => [2, 0, 1], sourceVelocity: [0, 0, 0],
    cameraAngle: t => Math.PI * Math.max(0, Math.min(1, (t - .28) / .27)), drySample: () => .25 });
  // The car lies to the east, the final bounce lies almost due north. Looking
  // east then west puts that bounce on the left then the right of the listener.
  const panFromPcm = t => {
    const i = Math.round(sampleRate * t), l = audio[0][i] ** 2, r = audio[1][i] ** 2;
    return (r - l) / (r + l);
  };
  const expected = 24 / Math.hypot(24, 2);
  assert.ok(Math.abs(panFromPcm(.24) + expected) < 1e-5);
  assert.ok(Math.abs(panFromPcm(.84) - expected) < 1e-5);
  const selected = rows.flatMap(r => r.path ? [r.path] : []);
  assert.ok(selected.every(p => Math.abs(p.distance - Math.hypot(24, 2)) < 1e-9));
  assert.ok(selected.every(p => Math.abs(p.arrivalDirection[1] - expected) < 1e-9));
});

test('an impulse emitted before the car passes a finite wall end arrives after the crossing', () => {
  const crossing = .55, emission = .545, speed = 4, impulseFrame = Math.round(emission * sampleRate);
  const { audio, rows } = renderTwoWall({ limited: true, cameraAngle: () => Math.PI / 2,
    sourcePosition: t => [speed * (t - crossing), 0, 1], sourceVelocity: [speed, 0, 0],
    drySample: frame => frame === impulseFrame ? .5 : 0 });
  const expectedDelay = Math.hypot(24, speed * (emission - crossing)) / 343;
  const expected = (emission + expectedDelay) * sampleRate;
  let peakFrame = 0;
  for (let i = 1; i < audio[0].length; i++) if (Math.abs(audio[0][i]) > Math.abs(audio[0][peakFrame])) peakFrame = i;
  assert.ok(Math.abs(audio[0][peakFrame]) > .001);
  assert.ok(Math.abs(peakFrame - expected) < 2, `arrival ${peakFrame}, expected ${expected}`);
  assert.ok(peakFrame / sampleRate > crossing + .06);
  const lost = rows.findIndex((row, i) => i > 0 && rows[i - 1].path && !row.path);
  assert.ok(lost > 0);
  assert.equal(rows[lost].releaseLeft, 960);
  assert.equal(rows[lost + 1].releaseLeft, 960 - blockFrames);
  assert.equal(rows[lost + 2].active, false);
  assert.ok(rows.slice(lost).every(row => !row.path));
});
