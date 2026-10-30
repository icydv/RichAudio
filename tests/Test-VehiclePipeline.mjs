import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VehicleStateAdapter, vehicleComponents } from '../src/acoustics/vehicle/state-adapter.mjs';
import { VehicleAcousticPipeline, encodeVehicleRa07 } from '../src/acoustics/vehicle/pipeline.mjs';
import { acousticScene } from '../src/acoustics/engine/contracts.mjs';
import { createTile } from '../src/acoustics/research/local-geometry.mjs';
import { sceneInput } from './fixtures/acoustics-scenes.mjs';

const FS = 48000, BLOCK = 512;
const observed = value => ({ status: 'observed', value, origin: 'authored integration fixture' });
const vec = (x, y, z) => observed({ x, y, z });
function record(block, { replacement = false, shift = false } = {}) {
  const t = block * BLOCK / FS;
  return { SchemaVersion: 1, Kind: 'sample', SessionId: 'vehicle-pipeline-fixture',
    TimestampSeconds: t, Sequence: block + 1, Events: [], Vehicles: [1, 2].map(i => ({
      Token: `token-${i}`, TrackingId: `tracking:${i}`, Model: observed(i), PoolHandle: observed(i),
      PoolCounter: observed(replacement && i === 1 ? 2 : 1),
      Position: vec(i * 2, t, 0.4), Velocity: vec(0, 1, 0),
      Orientation: observed({ x: 0, y: 0, z: 0, w: 1 }), EngineRunning: observed(true),
      Gear: observed(shift ? 3 : 2), RpmRatio: observed(shift ? 0.35 : 0.6),
    })) };
}
const directScene = () => acousticScene(createTile({ ...sceneInput(), surfaces: [] }), {}, { order: 0 });

test('actual pipeline preserves sibling PCM history on slot reuse and preserves all rings through motion/gear changes', async () => {
  const adapter = new VehicleStateAdapter({ rpmMapping: { idleRpm: 900, redlineRpm: 9000 },
    coordinates: { metresPerUnit: 1, basis: 'authored-metre-fixture' } });
  const ids = [1, 2].flatMap(i => vehicleComponents.map(component => `vehicle:${i}:${component}`));
  const pipeline = new VehicleAcousticPipeline({ scene: directScene(), sourceIds: ids, quality: 'performance', acceleration: 'cpu' });
  const inputs = Object.fromEntries(ids.map(id => [id, new Float32Array(BLOCK)]));
  const left = new Float32Array(BLOCK), right = new Float32Array(BLOCK);
  const ringReferences = new Map(pipeline.renderer.sourceList.map(s => [s.id, s.bands]));
  let previous = null, original = null, audible = 0;
  try {
    for (let block = 0; block < 36; block++) {
      const adapted = adapter.update(record(block, { replacement: block >= 20, shift: block >= 10 }));
      const control = await pipeline.prepare({ ...adapted,
        listener: { position: [0, 4, 1.5], velocity: [0, 0, 0], forward: [0, 1, 0], up: [0, 0, 1] } });
      if (block === 0) original = { ...control.sourceGenerations };
      if (block === 10) assert.deepEqual(control.sourceGenerations, original, 'a shift cannot reset any source generation');
      if (block === 20) {
        assert.equal(adapted.retired.length, 1);
        for (const id of ids) {
          if (id.startsWith('vehicle:1:')) assert.notEqual(control.sourceGenerations[id], previous[id]);
          else assert.equal(control.sourceGenerations[id], previous[id], 'sibling ring keeps its causal generation');
        }
      }
      for (const id of ids) {
        const input = inputs[id];
        for (let i = 0; i < BLOCK; i++) input[i] = id.endsWith(':mechanical') ?
          0.01 * Math.sin(2 * Math.PI * 183 * (block * BLOCK + i) / FS) : 0;
        assert.strictEqual(pipeline.renderer.sources.get(id).bands, ringReferences.get(id), 'no PCM ring reallocation');
      }
      pipeline.process(inputs, left, right);
      for (const sample of left) { assert.ok(Number.isFinite(sample) && Math.abs(sample) < 1); audible += sample * sample; }
      const sibling = pipeline.renderer.sources.get('vehicle:2:mechanical');
      const index = (pipeline.renderer.frame - 1) % pipeline.renderer.historyFrames;
      assert.equal(sibling.generations[index], original['vehicle:2:mechanical']);
      previous = { ...control.sourceGenerations };
    }
    assert.ok(audible > 0.001, 'real causal renderer emitted non-silent vehicle PCM');
    assert.equal(pipeline.renderer.stats.limited, 0);
    assert.equal(pipeline.simulation.stats.resets, 1, 'only initial session reset');
    assert.equal(pipeline.renderer.stats.cursorResets, 0);
  } finally { pipeline.close(); }
});

test('RA07 encodes exact legacy header and interleaved Float32 samples in caller storage', () => {
  const left = Float32Array.from({ length: BLOCK }, (_, i) => Math.sin(i * 0.1) * 0.2);
  const right = Float32Array.from({ length: BLOCK }, (_, i) => Math.cos(i * 0.3) * 0.15);
  const packet = Buffer.alloc(4112);
  assert.strictEqual(encodeVehicleRa07(left, right, 0xffffffff, packet), packet);
  assert.equal(packet.toString('ascii', 0, 4), 'RA07');
  assert.equal(packet.readUInt32LE(4), 0xffffffff);
  assert.equal(packet.readUInt32LE(8), BLOCK); assert.equal(packet.readUInt32LE(12), 0);
  for (let i = 0; i < BLOCK; i++) {
    assert.equal(packet.readFloatLE(16 + i * 8), left[i]);
    assert.equal(packet.readFloatLE(20 + i * 8), right[i]);
  }
});

test('RA07 rejects nonfinite, out-of-range, wrong-sized, and invalid-sequence input', () => {
  const left = new Float32Array(BLOCK), right = new Float32Array(BLOCK);
  for (const sequence of [-1, 0x100000000, 0.5, NaN]) assert.throws(() => encodeVehicleRa07(left, right, sequence), /RA07/);
  assert.throws(() => encodeVehicleRa07(new Float32Array(511), right, 0), /RA07/);
  assert.throws(() => encodeVehicleRa07([...left], right, 0), /RA07/);
  assert.throws(() => encodeVehicleRa07(left, right, 0, Buffer.alloc(4111)), /RA07/);
  for (const sample of [NaN, Infinity, -Infinity, 1.001, -1.001]) {
    left[100] = sample; assert.throws(() => encodeVehicleRa07(left, right, 0), /PCM/);
  }
});

test('actual native BlockProtocol and PcmRing accept generated RA07 and reject corrupted packets without an endpoint',
  { skip: process.platform !== 'win32' ? 'native .NET Framework test requires Windows' : false }, () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    assert.ok(fs.existsSync(compiler), 'installed native compiler');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'richaudio-vehicle-protocol-'));
    try {
      const executable = path.join(temporary, 'vehicle-protocol.exe');
      const compile = spawnSync(compiler, ['/nologo', '/optimize+', '/unsafe+', '/warnaserror+', '/target:exe', '/platform:x64',
        `/out:${executable}`, path.join(root, 'src/acoustics/host/Windows/PcmRing.cs'), path.join(root, 'tests/host/TestVehicleProtocol.cs')],
      { encoding: 'utf8', timeout: 20000, windowsHide: true });
      assert.equal(compile.status, 0, compile.stdout + compile.stderr);
      const left = Float32Array.from({ length: BLOCK }, (_, i) => Math.sin(i * 0.13) * 0.2);
      const right = Float32Array.from({ length: BLOCK }, (_, i) => Math.cos(i * 0.19) * 0.1);
      const packet = encodeVehicleRa07(left, right, 37);
      const input = path.join(temporary, 'input.bin'), output = path.join(temporary, 'output.bin');
      const invoke = bytes => {
        fs.writeFileSync(input, bytes);
        return spawnSync(executable, [input, output], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      };
      const result = invoke(packet);
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /verified=512/);
      const rendered = fs.readFileSync(output);
      assert.equal(rendered.length, 4096);
      for (let i = 0; i < BLOCK; i++) {
        assert.equal(rendered.readFloatLE(i * 8), Math.fround(left[i] * 0.25));
        assert.equal(rendered.readFloatLE(i * 8 + 4), Math.fround(right[i] * 0.25));
      }
      for (const mutate of [b => { b[0] = 0; }, b => b.writeUInt32LE(36, 4), b => b.writeUInt32LE(513, 8),
        b => b.writeUInt32LE(1, 12), b => b.writeFloatLE(NaN, 16), b => b.writeFloatLE(1.1, 20)]) {
        const corrupted = Buffer.from(packet); mutate(corrupted);
        assert.equal(invoke(corrupted).status, 1, 'native contract must reject corrupt frame');
      }
      assert.equal(invoke(packet.subarray(0, 9)).status, 1);
      assert.equal(invoke(packet.subarray(0, 4110)).status, 1);
    } finally {
      assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
      assert.match(path.basename(temporary), /^richaudio-vehicle-protocol-/);
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
