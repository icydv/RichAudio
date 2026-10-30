import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderVehicleCase } from '../tools/Render-VehiclePhysics.mjs';
import { encodeVehicleWav } from '../src/acoustics/vehicle/pipeline.mjs';

test('actual multi-component PCM is deterministic and identical before direct/reflected propagation', async () => {
  const spec = { id: 'lineage', label: 'fixture', operating: 'steady', motion: 'stationary', environment: 'direct', duration: 0.8 };
  const direct = await renderVehicleCase(spec), replay = await renderVehicleCase(spec);
  const reflected = await renderVehicleCase({ ...spec, environment: 'canyon' });
  assert.equal(direct.report.hashes.stereoFloat, replay.report.hashes.stereoFloat);
  assert.equal(direct.report.hashes.components, reflected.report.hashes.components);
  assert.notEqual(direct.report.hashes.stereoFloat, reflected.report.hashes.stereoFloat);
  assert.ok(reflected.report.pathCounts[1] > 0 && reflected.report.pathCounts[2] > 0);
  for (const result of [direct, reflected]) {
    assert.ok(result.report.metrics.rms > 0.001);
    assert.equal(result.report.metrics.clippedSamples, 0);
    assert.equal(result.report.metrics.nonfiniteSamples, 0);
    assert.equal(result.report.pipeline.renderer.missingHistory, 0);
    assert.equal(result.report.pipeline.renderer.cursorResets, 0);
    assert.equal(result.report.pipeline.simulation.resets, 1);
  }
});

test('float stereo WAV preserves small late samples exactly and rejects corrupt input', () => {
  const left = new Float32Array([0, 1e-9, -.25]), right = new Float32Array([.1, -1e-8, .5]);
  const bytes = encodeVehicleWav([left, right]);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt16LE(20), 3); assert.equal(bytes.readUInt32LE(24), 48000);
  assert.equal(bytes.readUInt32LE(40), 24);
  for (let i = 0; i < 3; i++) {
    assert.equal(bytes.readFloatLE(44 + i*8), left[i]);
    assert.equal(bytes.readFloatLE(48 + i*8), right[i]);
  }
  assert.throws(() => encodeVehicleWav([new Float32Array([NaN]), new Float32Array(1)]));
});

test('barrier fixture actually intersects the source-listener path and filters high bands', async () => {
  const spec = { id: 'barrier', label: 'fixture', operating: 'steady', motion: 'corner', environment: 'corner', duration: 2 };
  const result = await renderVehicleCase(spec);
  const controls = result.report.controls.flatMap(c => c.paths.filter(p => p.order === 0 && p.sourceId.endsWith(':exhaust')));
  assert.ok(controls.some(p => p.bands[2] / p.bands[0] < 0.12), 'supported barrier high-frequency transmission must be present');
});
