import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { LiveVehicleSource, vehicleLiveSourceIds } from '../src/acoustics/vehicle/live-source.mjs';
import { CausalSimulation, StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { ObservedSimulationInput } from '../src/acoustics/streaming/observed-live.mjs';
import { nativeEnvelope, liveConfiguration } from './fixtures/LiveGeometry.mjs';

const clock = time => ({ now: time, receiptNowMs: time * 1000 });
function evidence(time, sequence, changes = {}, profile = 'original-hypercar-v12') {
  return { type: 'vehicle', receiptAgeMs: 0, state: { version: 1, session: 'a'.repeat(32), listenerGeneration: 1,
    generation: 1, sequence, observationTicks: 700000000 + Math.round(time * 10000000), clockFrequency: 10000000,
    gameTimeMs: time * 1000, sourcePid: 1, vehicleId: 'vehicle-100', model: 123, profile, action: 'update',
    position: [0, 0, 1], velocity: [0, 0, 0], forward: [0, 1, 0], up: [0, 0, 1], speed: 0,
    engineRunning: true, rpmRatio: .5, gear: 1, valid: true, reason: 'valid', rights: 'original-generated',
    coordinates: 'gta-native-unscaled', units: 'native-unverified', ...changes } };
}
function context() {
  const c = liveConfiguration().configuration;
  return { type: 'listener-context-config', configuration: { contextEpoch: 1, listenerSession: c.listenerSession,
    minimumListenerGeneration: 1, build: c.build, coordinates: { ...c.coordinates, originNative: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], metresPerNativeUnit: 1 },
    region: { minNative: [-12, -12, -12], maxNative: [12, 12, 12] }, sources: vehicleLiveSourceIds.map(id => ({ id,
      generation: 1, rights: 'original-generated', reference: 'vehicle-live-01', positionNative: [0, 0, 0],
      velocityNative: [0, 0, 0], forwardNative: [0, 1, 0], upNative: [0, 0, 1], valid: false, emitting: false, vehicle: true })),
    directPath: { mode: 'vehicle-conditional-direct', sourceIds: vehicleLiveSourceIds, rights: 'original-generated',
      visibilityAssumption: 'unobserved-space-assumed-clear', regionPolicy: 'bounded-follow-player' } } };
}
function anchor(time, sequence, changes = {}) {
  return { ...nativeEnvelope(time, sequence, { position: [0, 5, 1.6], ...changes }), queueAgeMs: 0,
    delivery: { maximumMs: 0, basis: 'controlled-fixture', reference: 'vehicle-fixture' } };
}

test('live original source uses actual changing speed/gear with honest constant-getter evidence', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 });
  source.accept(evidence(0, 0), clock(0)); const idle = source.render(clock(0));
  const generation = idle.vehicleSources.sources[0].generation;
  source.accept(evidence(.05, 1, { position: [0, .5, 1], speed: 20, velocity: [0, 20, 0] }), clock(.05));
  const accel = source.render(clock(.05));
  assert.ok(accel.diagnostics.estimatedRpm > idle.diagnostics.estimatedRpm);
  assert.ok(accel.diagnostics.load > idle.diagnostics.load);
  assert.equal(accel.diagnostics.ratioEvidence.minimum, .5); assert.equal(accel.diagnostics.ratioEvidence.maximum, .5);
  assert.equal(accel.diagnostics.ratioEvidence.usedForControl, false);
  assert.match(accel.diagnostics.provenance.rpm.basis, /not measured crankshaft RPM/);
  assert.equal(new Set(Object.values(accel.inputs).map(x => x.buffer)).size, 8);
  assert.deepEqual(Object.keys(accel.inputs), vehicleLiveSourceIds);
  source.accept(evidence(.1, 2, { position: [0, 1.5, 1], speed: 20, velocity: [0, 20, 0], gear: 2 }), clock(.1));
  const shift = source.render(clock(.1));
  assert.equal(shift.vehicleSources.sources[0].generation, generation);
  assert.equal(shift.diagnostics.synthesizer.shifts, 1); assert.ok(shift.diagnostics.synthesizer.cyclePhase > 0);
  assert.equal(shift.diagnostics.provenance.overrun.status, 'unavailable');
  assert.equal(shift.diagnostics.components.transients.energy, 0); assert.equal(shift.diagnostics.components.induction.energy, 0);
});

test('profile comparison preserves original V12/V8 distinctions and independent active components', () => {
  const reports = [];
  for (const profile of ['v12', 'v8']) {
    const source = new LiveVehicleSource({ profile, maxTransitMs: 0 });
    source.accept(evidence(0, 0, { speed: 30, velocity: [0, 30, 0], gear: 3 }, source.profile.id), clock(0));
    let result;
    for (let block = 0; block < 20; block++) result = source.render(clock(block * 512 / 48000));
    for (const name of ['mechanical', 'exhaust', 'intake', 'drivetrain', 'tyres', 'aero']) assert.ok(result.diagnostics.components[name].energy > 0);
    reports.push(result.diagnostics);
  }
  assert.equal(reports[0].synthesizer.inductionKind, 'none'); assert.equal(reports[1].synthesizer.inductionKind, 'supercharger');
  assert.ok(reports[1].components.induction.energy > 0); assert.notEqual(reports[0].synthesizer.firingHz, reports[1].synthesizer.firingHz);
});

test('bounded prediction holds after 100ms and expiry or remove retires every component', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 });
  source.accept(evidence(0, 0, { velocity: [0, 10, 0], speed: 10 }), clock(0));
  const a = source.render(clock(.1)), b = source.render(clock(.2));
  assert.deepEqual(a.vehicleSources.sources.map(s => s.positionNative), b.vehicleSources.sources.map(s => s.positionNative));
  const expired = source.render(clock(.251));
  assert.equal(expired.diagnostics.active, false); assert.equal(expired.diagnostics.expired, 1);
  assert.ok(expired.vehicleSources.sources.every(s => !s.valid && !s.emitting));
  assert.ok(Object.values(expired.inputs).every(a => a.every(x => x === 0)));
  assert.ok(expired.vehicleSources.sources[0].generation > a.vehicleSources.sources[0].generation);
  source.stop(); assert.equal(source.diagnostics().removals, 1);
});

test('malformed identity, replay, profile and expired input cannot mutate accepted source ownership', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 }); source.accept(evidence(0, 0), clock(0));
  const generation = source.generation;
  for (const message of [evidence(0, 0), evidence(.05, 1, { rights: 'unknown' }), evidence(.05, 1, { profile: 'copied-engine' }),
    { ...evidence(.05, 1), receiptAgeMs: 251 }, evidence(.05, 1, { velocity: [0, 101, 0] }), evidence(.05, 1, { vehicleId: 'different' })])
    assert.throws(() => source.accept(message, clock(.05)));
  assert.equal(source.generation, generation); assert.equal(source.stats.accepted, 1);
});

test('credit catchup bursts cannot reanchor timestamped vehicle motion or Doppler', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 });
  source.accept(evidence(0, 0, { velocity: [0, 28, 0], speed: 28 }), clock(0));
  const first = source.render({ now: .032, receiptNowMs: 40 }).vehicleSources.sources[0].positionNative;
  // Same wall wake, advancing PCM blocks: motion advances continuously.
  const second = source.render({ now: .043, receiptNowMs: 40 }).vehicleSources.sources[0].positionNative;
  assert.ok(Math.abs((second[1] - first[1]) / .011 - 28) < 1e-8);
  // Next real observation arrives when the PCM clock has advanced differently.
  // It retains its original observation time; arrival does not snap the model.
  source.accept(evidence(.063, 1, { position: [0, .063 * 28, 1], velocity: [0, 28, 0], speed: 28 }),
    { now: .055, receiptNowMs: 70 });
  const before = source.render({ now: .055, receiptNowMs: 70 }).vehicleSources.sources[0].positionNative;
  const after = source.render({ now: .066, receiptNowMs: 70 }).vehicleSources.sources[0].positionNative;
  assert.ok(Math.abs((after[1] - before[1]) / .011 - 28) < 1e-8);
  assert.ok(Math.abs(after[1] - .066 * 28 - source.profile.components.mechanical.offset[1]) < 1e-8);
  assert.equal(source.diagnostics().sourcePresentation.addedBufferSeconds, 0);
});

test('adapter-detected teleport retires acoustic generation while estimator parameters remain explicit and bounded', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 }); source.accept(evidence(0, 0), clock(0));
  const generation = source.generation;
  source.accept(evidence(.05, 1, { position: [0, 50, 1] }), clock(.05));
  assert.ok(source.generation > generation); assert.equal(source.poseKeys.length, 1);
  assert.throws(() => new LiveVehicleSource({ rpmEstimator: { wheelRadiusMetres: 0, finalDrive: 3, gearRatios: [2] } }), /wheel radius/);
  const configured = new LiveVehicleSource({ rpmEstimator: { wheelRadiusMetres: .4, finalDrive: 2, gearRatios: [2, 1] }, maxTransitMs: 0 });
  configured.accept(evidence(0, 0, { speed: 20, velocity: [0, 20, 0] }), clock(0));
  assert.deepEqual(configured.diagnostics().provenance.rpm.parameters, { wheelRadiusMetres: .4, finalDrive: 2, gearRatios: [2, 1] });
});

test('same causal engine follows authorised vehicle beyond initial region without resetting histories', () => {
  const source = new LiveVehicleSource({ maxTransitMs: 0 }), simulation = new CausalSimulation(null, { allowMissingScene: true }),
    input = new ObservedSimulationInput(simulation, vehicleLiveSourceIds);
  input.consume([context()], anchor(0, 0), 0);
  let firstGeneration, control;
  for (let step = 0; step < 101; step++) {
    const now = step * .02; source.accept(evidence(now, step, { position: [0, now * 20, 1], velocity: [0, 20, 0], speed: 20 }), clock(now));
    const dry = source.render(clock(now)), a = anchor(now, step, { position: [0, now * 20 + 5, 1.6], velocity: [0, 20, 0] });
    input.vehicleSources(dry.vehicleSources, a, now);
    control = input.update({ session: a.state.session, generation: 1, listener: a.state, emitting: true }, a, now);
    firstGeneration ??= control.sourceGenerations['vehicle:1:exhaust'];
  }
  assert.equal(control.readiness.rendererReadyForOwnedEmission, true); assert.ok(control.paths.length >= 6);
  assert.equal(control.sourceGenerations['vehicle:1:exhaust'], firstGeneration); assert.equal(control.stats.resets, 1);
  assert.equal(simulation.scene.directPath.mode, 'vehicle-conditional-direct');
  assert.ok(simulation.scene.modelBounds.max[1] - simulation.scene.modelBounds.min[1] <= 256);
  source.stop(); const dry = source.render(clock(2.02)), a = anchor(2.02, 102, { position: [0, 45, 1.6], velocity: [0, 20, 0] });
  input.vehicleSources(dry.vehicleSources, a, 2.02);
  control = input.update({ session: a.state.session, generation: 1, listener: a.state, emitting: true }, a, 2.02);
  assert.deepEqual(control.activeSourceIds, []); assert.deepEqual(control.releasedSourceIds, vehicleLiveSourceIds);
});

test('renderer releases source arrays, filter state and paths, and rejects late nonzero PCM', () => {
  const renderer = new StreamingRenderer({ sourceIds: vehicleLiveSourceIds, generationReleaseGuard: true }),
    left = new Float32Array(512), right = new Float32Array(512), inputs = Object.fromEntries(vehicleLiveSourceIds.map(id => [id, new Float32Array(512).fill(.01)]));
  renderer.process(inputs, left, right); renderer.releaseSources([vehicleLiveSourceIds[0]]);
  const source = renderer.sources.get(vehicleLiveSourceIds[0]);
  assert.ok(source.bands.every(b => b.every(x => x === 0))); assert.ok(source.frames.every(x => x === -1));
  assert.ok(source.generations.every(x => x === 0)); assert.equal(source.low, 0); assert.equal(source.upper, 0);
  assert.throws(() => renderer.process(inputs, left, right), /released source/);
  inputs[vehicleLiveSourceIds[0]].fill(0); renderer.process(inputs, left, right);
  renderer.releaseSources(vehicleLiveSourceIds); assert.equal(renderer.stats.releasedSources, 8);
  renderer.releaseSources([]); renderer.releaseSources(vehicleLiveSourceIds); assert.equal(renderer.stats.releasedSources, 8);
  assert.throws(() => renderer.releaseSources(['unowned']), /owned source/);
});

test('actual worker accepts eight original sources and rejects unauthorised context', async t => {
  const worker = new Worker(new URL('../src/acoustics/streaming/simulation-worker.mjs', import.meta.url),
    { workerData: { geometry: true, sourceIds: vehicleLiveSourceIds, vehicleProfile: 'v12', controlledClock: true } });
  t.after(() => worker.terminate()); const source = new LiveVehicleSource({ maxTransitMs: 0 });
  const send = (now, id, events = []) => new Promise((resolve, reject) => {
    source.accept(evidence(now, id), clock(now)); const dry = source.render(clock(now)), a = anchor(now, id);
    const timeout = setTimeout(() => reject(Error('worker timeout')), 3000);
    worker.once('message', m => { clearTimeout(timeout); m.error ? reject(Error(m.error)) : resolve(m.control); });
    worker.postMessage({ id, now, anchor: a, vehicleSources: dry.vehicleSources, geometryEvents: events,
      snapshot: { session: a.state.session, generation: 1, listener: a.state, emitting: true } });
  });
  await send(0, 0, [context()]); const control = await send(.1, 1);
  assert.equal(Object.keys(control.sourceGenerations).length, 8); assert.equal(control.activeSourceIds.length, 8);
  assert.ok(control.paths.some(p => p.sourceId === 'vehicle:1:exhaust')); assert.ok(control.paths.some(p => p.sourceId === 'vehicle:1:intake'));
  const bad = context(); bad.configuration.contextEpoch++; bad.configuration.directPath.sourceIds = ['beacon-0'];
  const rejected = await send(.2, 2, [bad]); assert.equal(rejected.paths.length, 0); assert.equal(rejected.readiness.rendererReadyForOwnedEmission, false);
});
