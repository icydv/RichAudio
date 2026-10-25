import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../tools/Analyze-DrivetrainDiagnostics.mjs';
const wrap = rows => rows.map(r => JSON.stringify({DiagnosticSchemaVersion: 1, DiagnosticOnly: true, SessionId: 'authored', ...r})).join('\n');
test('Private raw values stay raw; unavailable production ratios remain unavailable', () => {
  const v = {TrackingId: 'authored:1', Role: 'player_vehicle', Model: {value: 1}, EngineRunning: {value: true}, SpeedMps: {value: 0}, Gear: {value: 1}, ValidatedRpmRatio: {status: 'unavailable', value: null}, RawRpm: {GetterStatus: 'returned', IsFinite: true, RawValue: 7000}};
  const report = analyze(wrap([{Kind: 'diagnostic_start'}, {Kind: 'diagnostic_sample', TimestampSeconds: 0, Vehicles: [v]}, {Kind: 'diagnostic_sample', TimestampSeconds: 0.1, Vehicles: [{...v, Gear: {value: 2}}]}, {Kind: 'diagnostic_end', WrittenFrames: 2, QueueDrops: 0, ByteLimitOmissions: 0}]));
  assert.equal(report.complete, true); assert.equal(report.groups[0].rawMin, 7000); assert.equal(report.groups[0].validatedAvailable, 0); assert.equal(report.gearGetterTransitions.length, 1);
});
test('Nonfinite and exception categories do not invent numeric distributions', () => {
  const report = analyze(wrap([{Kind: 'diagnostic_start'}, {Kind: 'diagnostic_sample', TimestampSeconds: 0, Vehicles: [{Role: 'unoccupied', RawRpm: {GetterStatus: 'returned', IsFinite: false, RawValue: null}}, {Role: 'driven_npc', RawRpm: {GetterStatus: 'exception'}}]}, {Kind: 'diagnostic_end'}]));
  assert.equal(report.groups[0].rawMin, null); assert.equal(report.groups[0].nonfinite, 1); assert.equal(report.groups[1].exceptions, 1);
});
test('Unknown schema rejected and missing footer never complete', () => {
  assert.throws(() => analyze('{"DiagnosticSchemaVersion":2}'));
  assert.equal(analyze(wrap([{Kind: 'diagnostic_start'}])).complete, false);
});
