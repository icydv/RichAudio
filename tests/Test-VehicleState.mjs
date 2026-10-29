import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  VehicleStateAdapter, estimatedRpmFromRatio, componentEmitters, defaultVehicleLayout,
} from '../src/acoustics/vehicle/state-adapter.mjs';

const mapping = { idleRpm: 1000, redlineRpm: 9000, ratioAtIdle: 0.1, ratioAtRedline: 1 };
const observed = value => ({ status: 'observed', value, origin: 'authored fixture', units: 'fixture' });
const missing = { status: 'unavailable', value: null, reason: 'authored gap' };
const vector = (x, y, z) => observed({ x, y, z });
function vehicle(overrides = {}) {
  return { Token: '00000100', TrackingId: 'fixture:1', Lifecycle: 'continued_tracking',
    Model: observed(12), PoolHandle: observed(256), PoolCounter: observed(1),
    Position: vector(0, 0, 0), Velocity: vector(0, 0, 0),
    Orientation: observed({ x: 0, y: 0, z: 0, w: 1 }),
    RpmRatio: observed(0.55), Gear: observed(2), EngineRunning: observed(true),
    ...overrides };
}
function frame(time = 0, vehicles = [vehicle()], extra = {}) {
  return { SchemaVersion: 1, Kind: 'sample', SessionId: 'fixture', Sequence: Math.round(time * 1000) + 1,
    TimestampSeconds: time, Vehicles: vehicles, Events: [], ...extra };
}
const adapter = options => new VehicleStateAdapter({ rpmMapping: mapping,
  coordinates: { metresPerUnit: 1, basis: 'authored-metre-fixture' }, ...options });
const first = result => result.vehicles[0];

test('normalised ratio maps to an explicit estimate and never depends on road speed', () => {
  assert.equal(estimatedRpmFromRatio(0.1, mapping), 1000);
  assert.ok(Math.abs(estimatedRpmFromRatio(0.55, mapping) - 5000) < 1e-9);
  assert.equal(estimatedRpmFromRatio(1, mapping), 9000);
  assert.equal(estimatedRpmFromRatio(0, mapping), 1000);
  const a = first(adapter().update(frame()));
  const b = first(adapter().update(frame(0, [vehicle({ Velocity: vector(0, 90, 0) })])));
  assert.equal(a.controls.estimatedRpm, b.controls.estimatedRpm);
  assert.equal(a.provenance.rpm.status, 'estimated');
  assert.match(a.provenance.rpm.basis, /not crankshaft RPM/);
  assert.equal(b.controls.speed, 90);
});

test('same generation and component IDs survive ordinary motion and shifts', () => {
  const a = adapter(), start = a.update(frame());
  const moved = a.update(frame(0.05, [vehicle({ Position: vector(0, 1, 0), Velocity: vector(0, 20, 0), Gear: observed(3), RpmRatio: observed(0.3) })]));
  assert.equal(first(start).id, first(moved).id);
  assert.equal(first(start).generation, first(moved).generation);
  assert.deepEqual(start.sources.map(s => s.id), moved.sources.map(s => s.id));
  assert.deepEqual(moved.retired, []);
  assert.equal(first(moved).controls.overrun, false);
  assert.equal(first(moved).controls.load, 0.16, 'shift derivatives do not masquerade as load');
});

test('load proxy responds to consistent acceleration but carries explicit uncertainty', () => {
  const a = adapter(); a.update(frame());
  const state = first(a.update(frame(0.05, [vehicle({ Position: vector(0, 0.01, 0), Velocity: vector(0, 0.3, 0), RpmRatio: observed(0.57) })])));
  assert.ok(state.controls.load > 0.6 && state.controls.load <= 0.91);
  assert.equal(state.provenance.load.status, 'estimated');
  assert.match(state.provenance.load.basis, /uncalibrated/);
  assert.equal(state.provenance.throttle.status, 'estimated');
  assert.equal(state.provenance.overrun.status, 'unavailable');
});

test('explicit termination retires source and handle reuse creates a new generation', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const ended = a.update(frame(0.05, [], { Events: [{ Token: '00000100', TrackingId: 'fixture:1', Kind: 'despawn_or_stream_out', Time: 0.05 }] }));
  assert.equal(ended.retired[0].id, initial.id); assert.equal(a.activeCount, 0);
  const next = first(a.update(frame(0.1)));
  assert.equal(next.id, initial.id); assert.notEqual(next.generation, initial.generation);
});

for (const [name, value] of [['Model', observed(13)], ['PoolCounter', observed(2)],
  ['PoolHandle', observed(257)], ['TrackingId', 'fixture:2']]) {
  test(`changed ${name} retires ownership even with the same token`, () => {
    const a = adapter(), initial = first(a.update(frame()));
    const result = a.update(frame(0.05, [vehicle({ [name]: value })]));
    assert.equal(first(result).id, initial.id);
    assert.notEqual(first(result).generation, initial.generation);
    assert.equal(result.retired[0].reason, 'identity-replaced');
  });
}

test('missing optional identity fields do not invent a replacement', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const result = a.update(frame(0.05, [vehicle({ PoolCounter: missing, Model: missing })]));
  assert.equal(first(result).id, initial.id); assert.equal(first(result).model, 12);
});

test('omission is not despawn; expiry and session restart regenerate ownership', () => {
  const a = adapter(), initial = first(a.update(frame()));
  assert.equal(a.update(frame(0.1, [])).retired.length, 0);
  const same = first(a.update(frame(0.2)));
  assert.equal(same.id, initial.id);
  const expired = a.update(frame(0.5));
  assert.equal(expired.retired[0].reason, 'observation-expired');
  assert.equal(first(expired).id, initial.id);
  assert.notEqual(first(expired).generation, initial.generation);
  const session = a.update(frame(0, [vehicle()], { SessionId: 'replacement-session' }));
  assert.equal(session.retired[0].reason, 'session-changed');
  assert.equal(session.generation, 2);
});

test('stale, future, reordered and malformed records cannot mutate ownership', () => {
  const a = adapter(), initial = first(a.update(frame()));
  assert.throws(() => a.update(frame()), /out-of-order/);
  assert.throws(() => a.update(frame(0.05), { now: 0.4 }), /fresh/);
  assert.throws(() => a.update(frame(0.05), { now: 0.04 }), /fresh/);
  assert.throws(() => a.update(frame(0.05, [vehicle({ RpmRatio: observed(NaN) })])), /RPM ratio/);
  assert.throws(() => a.update(frame(0.05, [vehicle({ Velocity: vector(0, Infinity, 0) })])), /velocity/);
  assert.throws(() => a.update(frame(0.05, [vehicle({ Orientation: observed({ x: 0, y: 0, z: 0, w: 0 }) })])), /norm/);
  assert.throws(() => a.update(frame(0.05, [vehicle({ SampleTimestamp: observed(0) })])), /timestamp/);
  assert.throws(() => a.update(frame(0.05, [vehicle({ Gear: observed(13) })])), /gear/);
  const valid = first(a.update(frame(0.05)));
  assert.equal(valid.id, initial.id); assert.equal(a.activeCount, 1);
});

test('caller mutation of an emitted snapshot cannot change retained identity or pose history', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const id = initial.id, generation = initial.generation;
  initial.id = 'tampered'; initial.generation = 999; initial.position[0] = 99999;
  const next = a.update(frame(0.05));
  assert.equal(first(next).id, id); assert.equal(first(next).generation, generation);
  assert.equal(next.retired.length, 0);
});

test('unavailable RPM or engine state mutes engine layers without resetting identity', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const gap = a.update(frame(0.05, [vehicle({ RpmRatio: missing, Velocity: vector(0, 20, 0) })]));
  assert.equal(first(gap).id, initial.id); assert.equal(first(gap).controls.engineRunning, false);
  assert.equal(first(gap).provenance.rpm.value, null);
  assert.equal(gap.sources.find(s => s.component === 'exhaust').emitting, false);
  assert.equal(gap.sources.find(s => s.component === 'tyres').emitting, true);
  const recovered = first(a.update(frame(0.1)));
  assert.equal(recovered.id, initial.id); assert.equal(recovered.controls.engineRunning, true);
  const unknown = first(a.update(frame(0.15, [vehicle({ EngineRunning: missing })])));
  assert.equal(unknown.controls.engineRunning, false);
});

test('invalid pose availability cannot fabricate a source but does not retire identity prematurely', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const gap = a.update(frame(0.05, [vehicle({ Position: missing })]));
  assert.equal(gap.sources.length, 0); assert.equal(gap.retired.length, 0);
  assert.equal(first(a.update(frame(0.1))).id, initial.id);
});

test('undeclared teleport regenerates histories instead of an unphysical Doppler sweep', () => {
  const a = adapter(), initial = first(a.update(frame()));
  const jumped = a.update(frame(0.05, [vehicle({ Position: vector(0, 100, 0) })]));
  assert.equal(jumped.retired[0].reason, 'pose-discontinuity');
  assert.notEqual(first(jumped).generation, initial.generation);
});

test('stop at the last timestamp retires every owned emitter', () => {
  const a = adapter(); a.update(frame());
  const ended = a.update(frame(0, [], { Kind: 'capture_stopped', Sequence: 2 }));
  assert.equal(ended.sources.length, 0); assert.equal(a.activeCount, 0); assert.equal(ended.retired.length, 1);
  assert.throws(() => a.update(frame(0.05)), /closed/);
  assert.equal(a.update(frame(0, [vehicle()], { SessionId: 'next-session' })).sources.length, 8);
});

test('slot reuse changes only the retired vehicle generation and preserves its neighbour', () => {
  const a = adapter(), other = vehicle({ Token: '00000200', TrackingId: 'fixture:2', PoolHandle: observed(512) });
  const start = a.update(frame(0, [vehicle(), other]));
  const replacement = a.update(frame(0.05, [vehicle({ PoolCounter: observed(2) }), other]));
  const initialByToken = new Map(start.vehicles.map(v => [v.token, v]));
  for (const v of replacement.vehicles) {
    assert.equal(v.id, initialByToken.get(v.token).id);
    if (v.token === other.Token) assert.equal(v.generation, initialByToken.get(v.token).generation);
    else assert.notEqual(v.generation, initialByToken.get(v.token).generation);
  }
  assert.equal(new Set(replacement.sources.map(s => s.id)).size, 16);
  assert.equal(a.activeCount, 2);
});

test('bounded capacity is stable and prioritises player only when allocating a free slot', () => {
  const a = adapter({ maxVehicles: 1 });
  const initial = a.update(frame(0, [vehicle(), vehicle({ Token: '00000101', TrackingId: 'fixture:2', PlayerVehicle: observed(true) })]));
  assert.equal(first(initial).token, '00000101'); assert.equal(initial.sources.length, 8);
  assert.equal(initial.unavailable[0].reason, 'bounded-source-capacity');
  const same = a.update(frame(0.05, [vehicle({ PlayerVehicle: observed(true) }), vehicle({ Token: '00000101', TrackingId: 'fixture:2' })]));
  assert.equal(first(same).id, first(initial).id); assert.equal(a.activeCount, 1);
  assert.throws(() => adapter({ maxVehicles: 3 }), /budget/);
});

test('emitter placement and rear radiation follow the vehicle quaternion', () => {
  const a = adapter();
  const result = a.update(frame(0, [vehicle({ Orientation: observed({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }), Position: vector(10, 0, 0) })]));
  const exhaust = result.sources.find(s => s.component === 'exhaust');
  const intake = result.sources.find(s => s.component === 'intake');
  assert.ok(Math.abs(exhaust.position[0] - 12) < 1e-10);
  assert.ok(Math.abs(exhaust.forward[0] - 1) < 1e-10);
  assert.ok(Math.abs(intake.forward[0] + 1) < 1e-10);
  assert.equal(exhaust.layoutBasis, 'authored-profile-estimate');
  assert.notEqual(exhaust.directivity, intake.directivity);
  assert.equal(new Set(result.sources.map(s => s.id)).size, 8);
});

test('profile layout is configurable and rejects invalid frame/gain/offset values', () => {
  const v = first(adapter().update(frame()));
  const custom = { ...defaultVehicleLayout, exhaust: { offset: [0, -1, 0.4], axis: [0, -1, 0], directivity: 0.4 } };
  assert.equal(componentEmitters(v, custom).find(s => s.component === 'exhaust').directivity, 0.4);
  assert.throws(() => componentEmitters(v, { ...custom, exhaust: { ...custom.exhaust, directivity: 2 } }), /directivity/);
  assert.throws(() => componentEmitters(v, { ...custom, exhaust: { ...custom.exhaust, offset: [0, 11, 0] } }), /offset/);
  assert.throws(() => componentEmitters(v, { ...custom, exhaust: { ...custom.exhaust, axis: [0, 0, 1] } }), /horizontal/);
});

test('the existing checked-in C# authored recording replays without schema translation', () => {
  const records = fs.readFileSync(new URL('./fixtures/mock-session.jsonl', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).map(line => JSON.parse(line)).filter(r => ['sample', 'capture_stopped'].includes(r.Kind));
  const a = adapter(); let samples = 0, sources = 0, retirements = 0;
  for (const record of records) {
    const result = a.update(record); samples++; sources += result.sources.length; retirements += result.retired.length;
    assert.ok(result.sources.length <= 16);
    for (const source of result.sources) assert.ok(source.position.every(Number.isFinite));
  }
  assert.ok(samples >= 10 && sources > 0 && retirements > 0);
});

test('configuration rejects missing calibration and invalid ratios', () => {
  assert.throws(() => new VehicleStateAdapter(), /mapping/);
  assert.throws(() => estimatedRpmFromRatio(1.1, mapping), /RPM ratio/);
  assert.throws(() => adapter({ rpmMapping: { ...mapping, ratioAtRedline: 0.1 } }), /redline ratio/);
  assert.throws(() => adapter({ coordinates: { metresPerUnit: 0, basis: 'authored-metre-fixture' } }), /coordinate scale/);
});
