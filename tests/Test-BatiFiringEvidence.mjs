import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BatiFiringEnvelope } from '../src/acoustics/vehicle/bati-powertrain-voicing.mjs';
import { PowertrainVoiceEvidence } from '../src/acoustics/vehicle/powertrain-voice-evidence.mjs';

const ceiling = {operatingPoint: 1, running: true, lift: false};

test('edges mark the first affected source sample without changing the existing cut timing or targets', () => {
  const firing = new BatiFiringEnvelope();
  const digest = createHash('sha256');
  const firstEdges = [];
  let frame = 0;
  for (let i = 0; i < 410; i++) {
    const frames = [512, 128, 480, 321][i % 4];
    const control = {operatingPoint: i % 97 === 0 ? .8 : 1, running: i % 179 !== 0, lift: i % 113 === 0};
    const previous = firing.cutting;
    const target = firing.select(control, frames);
    const sample = Buffer.alloc(9);
    sample.writeDoubleLE(target);
    sample[8] = Number(firing.cutting);
    digest.update(sample);
    if (previous !== firing.cutting) {
      assert.equal(firing.lastEdge.kind, firing.cutting ? 'cut' : 'catch');
      assert.equal(firing.lastEdge.sourceFrame, frame);
      if (firstEdges.length < 4) firstEdges.push(frame);
    } else assert.equal(firing.lastEdge, null);
    frame += frames;
    assert.equal(firing.renderedFrames, frame);
  }
  assert.deepEqual(firstEdges, [4963, 7205, 11528, 13481]);
  assert.equal(digest.digest('hex'), '99b5e6d8905bf1e0cd90edf4156f655c42205d7530cb3c8e588354b8f96f6fbf');
});

test('cut termination reports the transition on lift, on a ceiling exit and when stopped', () => {
  for (const [reason, override] of [['lift', {lift: true}], ['below-ceiling', {operatingPoint: .7}], ['stopped', {running: false}]]) {
    const firing = new BatiFiringEnvelope();
    for (let i = 0; i < 10; i++) firing.select(ceiling, 512);
    assert.equal(firing.cutting, true);
    firing.select({...ceiling, ...override}, 512);
    assert.deepEqual(firing.lastEdge, {kind: 'catch', reason, sourceFrame: 5120});
    firing.select({...ceiling, ...override}, 512);
    assert.equal(firing.lastEdge, null);
  }
});

test('evidence maps every transition to producer samples even outside the high-rev trace and bounds retention', () => {
  const evidence = new PowertrainVoiceEvidence();
  const listener = {sequence: 8, clockFrequency: 10_000_000};
  const vehicle = {powertrainRevision: 2, powertrainSequence: 8, observationTicks: 1_000_000, operatingPoint: 1};
  evidence.accept({powertrainRevision: 2, powertrainGate: 'voice', listener, vehicles: [vehicle]});
  const firing = new BatiFiringEnvelope();
  const slot = {index: 0, generation: 5, vehicle, source: {batiFiring: firing, position: 1, commonRates: {engine: 30, exhaust: 30}}};
  const engine = {slots: [slot], inputs: {'stock:slot0:engine': [], 'stock:slot0:exhaust': []},
    pipeline: {lastControl: {paths: []}, renderer: {frame: 20 * 512, stats: {limited: 0}}}};
  const step = () => {
    firing.select(ceiling, 512);
    engine.pipeline.renderer.frame += 512;
    evidence.render(engine, [[], []]);
  };
  for (let i = 0; i < 18; i++) step();
  const trace = evidence.report().firingEdges;
  assert.equal(trace.sampleRate, 48000);
  assert.equal(trace.qpcFrequency, listener.clockFrequency);
  const events = trace.rows.map(row => Object.fromEntries(trace.columns.map((key, i) => [key, row[i]])));
  assert.deepEqual(events, [
    {kind: 'cut', reason: 'cycle', sourceFrame: 4608, producerFrame: 14848, sourceSequence: 8, sourceObservationQpc: 1_000_000, selectedRatio: 1, revision: 2, slotIndex: 0, slotGeneration: 5},
    {kind: 'catch', reason: 'cycle', sourceFrame: 7168, producerFrame: 17408, sourceSequence: 8, sourceObservationQpc: 1_000_000, selectedRatio: 1, revision: 2, slotIndex: 0, slotGeneration: 5},
  ]);
  vehicle.observationTicks += 10 * listener.clockFrequency;
  for (let i = 0; i < 840; i++) step();
  const retained = evidence.report().firingEdges;
  assert.ok(retained.omitted > 0);
  assert.equal(retained.rows.length, 64);
  assert.equal(retained.total, retained.omitted + retained.rows.length);
  assert.equal(retained.rows.at(-1)[retained.columns.indexOf('sourceObservationQpc')], vehicle.observationTicks);
});
