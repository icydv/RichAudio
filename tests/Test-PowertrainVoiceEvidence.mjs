import assert from 'node:assert/strict';
import {PowertrainVoiceEvidence, powertrainPathBlock} from '../src/acoustics/vehicle/powertrain-voice-evidence.mjs';

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

const packetSequence = 32;
const at = packetSequence * 512;
const paths = ['engine','exhaust'].flatMap(role => [1,1,2,2,3,3].map((order, i) =>
  ({id: role + i, sourceId:role, order, generation:3, bands:[.4,.25,.1],
    diagnosticReflection:{materialBasis:Array.from({length:order}, (_, j) => ({surface:'wall-' + i + '-' + j}))}})));
paths[0].scatter = true;
const samplePipeline = {
  simulation:{lastInstalledPaths01:{frame:at, observationKey:'known'}, scene:{tile:{observationKey:'known'}}},
  lastControl:{frame:at, paths},
  renderer:{frame:at+512, slots:paths.map(p => ({id:p.id,active:true,present:true,generation:3,gain:[.39,.24,.09]}))},
};
const vehicle = {powertrainSequence:7,powertrainRevision:2,id:'adder',generation:4};
const sample = powertrainPathBlock(samplePipeline, packetSequence, vehicle);
assert.deepEqual(sample.selectedByOrder, {1:4,2:4,3:4});
assert.equal(sample.vehicleGeneration, 4);
assert.equal(sample.sourceSequence, 7);
assert.deepEqual(sample.reflected.map(p => [p.sourceId,p.order]), [
  ['engine',1],['engine',2],['engine',3],['exhaust',1],['exhaust',2],['exhaust',3]]);
assert.deepEqual(sample.reflected[0].mixerEndBands, [.39,.24,.09]);
assert.equal(sample.reflected[0].scatter, true);
assert.equal(sample.scatteredMixerPaths, 1);
samplePipeline.renderer.slots[0].generation++;
assert.equal(powertrainPathBlock(samplePipeline, packetSequence, vehicle).reflected[0].mixerEndBands, null);
assert.equal(powertrainPathBlock(samplePipeline, packetSequence, vehicle).scatteredMixerPaths, 0);
assert.equal(powertrainPathBlock(samplePipeline, packetSequence+1, vehicle), null);
samplePipeline.simulation.scene.tile.observationKey = 'replacement';
assert.equal(powertrainPathBlock(samplePipeline, packetSequence, vehicle), null);
samplePipeline.simulation.scene = null;
assert.equal(powertrainPathBlock(samplePipeline, packetSequence, vehicle), null);
samplePipeline.simulation.scene = {tile:{observationKey:'known'}};
samplePipeline.lastControl = null;
assert.equal(powertrainPathBlock(samplePipeline, packetSequence, vehicle), null);
console.log('PASS sampled reflection orders bind to the processed block, scene, voice and mixer generation.');
