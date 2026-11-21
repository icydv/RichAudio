import assert from 'node:assert/strict';
import {PowertrainVoiceEvidence} from '../src/acoustics/vehicle/powertrain-voice-evidence.mjs';

const evidence = new PowertrainVoiceEvidence();
const frame = (revision, mode, sequence, ratio) => ({
  powertrainRevision: revision, powertrainGate: mode,
  listener: {sequence, clockFrequency: 10_000_000},
  vehicles: [{observationTicks: sequence * 500_000, operatingPoint: ratio}],
});
const engine = {
  slots: [{index: 0, vehicle: {powertrainRevision: 2, powertrainSequence: 2, observationTicks: 1_000_000, operatingPoint: .92},
    source: {position: .86, commonRates: {engine: 34, exhaust: 35}}}],
  inputs: {'stock:slot0:engine': [.5, -.5], 'stock:slot0:exhaust': [.25, -.25]},
  pipeline: {lastControl: {paths: [
    {sourceId: 'stock:slot0:engine', order: 0, distance: 4},
    {sourceId: 'stock:slot0:exhaust', order: 0, distance: 3},
  ]}, renderer: {stats: {limited: 0}}},
};

evidence.accept(frame(1, 'prepare', 1, .08));
evidence.accept(frame(2, 'voice', 2, .92));
evidence.accept(frame(2, 'voice', 3, .81));
evidence.render(engine, [[.05, -.05], [0, 0]]);
evidence.accept(frame(3, 'mute', 4, .42));
const report = evidence.report();
assert.deepEqual(report.phases.map(p => p.mode), ['prepare', 'voice', 'mute']);
assert.deepEqual(report.phases[1].inputRange, [.81, .92]);
assert.deepEqual(report.phases[1].engineDistance, [4, 4]);
assert.deepEqual(report.phases[1].exhaustDistance, [3, 3]);
assert.equal(report.phases[1].dryEngine.rms, .5);
assert.equal(report.phases[1].dryExhaust.peak, .25);
assert.equal(report.phases[1].renderedOutput.peak, .05);
assert.deepEqual(report.highRev.input, [[2, 1_000_000, .92], [3, 1_500_000, .81]]);
assert.deepEqual(report.highRev.rendered, [[2, 1_000_000, .92, .86, 34, 35]]);
for (let i = 1; i <= 3; i++) evidence.render(engine, [[.05, -.05], [0, 0]]);
assert.equal(evidence.report().highRev.rendered.length, 2);
assert.equal(evidence.report().phases[1].renderedOutput.samples, 4);
for (let i = 5; i <= 150; i++) evidence.accept(frame(i, 'voice', i, .99));
assert.ok(evidence.report().phases.length <= 8);
assert.ok(evidence.report().highRev.input.length <= 96);
console.log('PASS bounded one-car phase levels, path distances and matched high-rev evidence.');
