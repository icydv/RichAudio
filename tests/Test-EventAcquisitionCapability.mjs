import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_ACQUISITION_CAPABILITIES, createAuthoredFixtureEventCapability,
  describeAcquisitionTiming, evaluateEventAcquisition } from '../src/acoustics/events/acquisition-capability.mjs';

const session = 'original-event-fixture';
const timing = () => ({ basis: 'authored-fixture-clock', acquisitionBeforeQpc: 100,
  observationAfterQpc: 120, qpcFrequency: 1000, occurrenceLowerQpc: 105, occurrenceUpperQpc: 105 });
const fixture = () => ({ mode: 'authored-fixture', authority: 'authored-fixture-only',
  eventKind: 'authored-impulse', session,
  fixtureCapability: createAuthoredFixtureEventCapability({ session }), timing: timing() });

test('production registry is deeply immutable and unavailable on the target stack', () => {
  assert.equal(EVENT_ACQUISITION_CAPABILITIES.production.status, 'BLOCKED');
  assert.equal(EVENT_ACQUISITION_CAPABILITIES.target.runtimeVerified, false);
  assert.throws(() => { EVENT_ACQUISITION_CAPABILITIES.production.mayGenerateDirect = true; }, TypeError);
  assert.throws(() => { EVENT_ACQUISITION_CAPABILITIES.interfaces[0].sourceTimestamp = 'exact'; }, TypeError);
});

test('default and caller-supplied capability claims cannot enable real event audio', () => {
  for (const eventKind of ['gunshot', 'impact', 'explosion', 'authored-impulse']) {
    const r = evaluateEventAcquisition({ ...fixture(), mode: 'production', eventKind,
      eventSchemaVerified: true, sourceTimestampVerified: true,
      selectiveSuppressionVerified: true, restorationVerified: true });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.admitted, false);
    assert.equal(r.mayGenerateDirect, false);
    assert.equal(r.mayGenerateReflections, false);
    assert.equal(r.nativePrimary, true);
    assert.equal(r.nativeSuppressionPermitted, false);
  }
  assert.equal(evaluateEventAcquisition().admitted, false);
});

test('only explicit branded original authored impulse can enter the offline path', () => {
  const r = evaluateEventAcquisition(fixture());
  assert.equal(r.status, 'AUTHORED_FIXTURE_ONLY');
  assert.equal(r.admitted, true);
  assert.equal(r.mayGenerateDirect, true);
  assert.equal(r.mayGenerateReflections, true);
  assert.equal(r.nativeReplacementPermitted, false);
  assert.equal(r.sampleAccurateNativeEvent, false);
  assert.equal(r.timing.occurrenceLowerQpc, 105);
  assert.equal(r.timing.observationAfterQpc, 120);
  assert.equal(r.timing.observationClockDomain, 'authored-fixture-QPC');
  assert.throws(() => { r.timing.occurrenceLowerQpc = 0; }, TypeError);
});

test('fixture mode cannot relabel a gunshot, impact or explosion as acquired support', () => {
  for (const eventKind of ['gunshot', 'impact', 'explosion', '', null])
    assert.equal(evaluateEventAcquisition({ ...fixture(), eventKind }).admitted, false);
  for (const authority of ['native-rph', 'cfx', '', null])
    assert.equal(evaluateEventAcquisition({ ...fixture(), authority }).admitted, false);
});

test('copies, serialization, wrong session and an implicit mode do not grant authority', () => {
  const f = fixture();
  for (const fixtureCapability of [{ ...f.fixtureCapability }, JSON.parse(JSON.stringify(f.fixtureCapability)), null])
    assert.equal(evaluateEventAcquisition({ ...f, fixtureCapability }).admitted, false);
  assert.equal(evaluateEventAcquisition({ ...f, session: 'other-session' }).admitted, false);
  assert.equal(evaluateEventAcquisition({ ...f, mode: undefined }).admitted, false);
  assert.equal(evaluateEventAcquisition({ ...f, mode: 'live-fixture' }).admitted, false);
  assert.throws(() => createAuthoredFixtureEventCapability({ session: '../unsafe' }));
});

test('poll and callback receipt brackets never become event emission timestamps', () => {
  for (const basis of ['native-poll', 'native-callback-receipt']) {
    const r = describeAcquisitionTiming({ basis, acquisitionBeforeQpc: 100,
      observationAfterQpc: 190, qpcFrequency: 1000 });
    assert.equal(r.occurrenceLowerQpc, null);
    assert.equal(r.occurrenceUpperQpc, null);
    assert.equal(r.occurrenceClockDomain, null);
    assert.equal(r.sourceEventTimeAvailable, false);
    assert.equal(r.sampleAccurateNativeEvent, false);
    assert.throws(() => describeAcquisitionTiming({ ...r, occurrenceLowerQpc: 100, occurrenceUpperQpc: 190 }));
  }
  assert.deepEqual(describeAcquisitionTiming().occurrenceLowerQpc, null);
});

test('unavailable or malformed fixture timing cannot be promoted to a trigger', () => {
  for (const bad of [undefined, {}, { basis: 'native-poll' }, { ...timing(), basis: 'game-timer' },
    { ...timing(), acquisitionBeforeQpc: 121 }, { ...timing(), qpcFrequency: 0 },
    { ...timing(), occurrenceLowerQpc: -1 }, { ...timing(), occurrenceUpperQpc: 121 },
    { ...timing(), occurrenceUpperQpc: 104 }, { ...timing(), occurrenceLowerQpc: NaN },
    { ...timing(), observationAfterQpc: Number.MAX_SAFE_INTEGER + 1 }])
    assert.equal(evaluateEventAcquisition({ ...fixture(), timing: bad }).admitted, false);
});

test('caller data is copied and an acquisition bracket retains its uncertainty', () => {
  const f = fixture();
  f.timing.occurrenceLowerQpc = 105; f.timing.occurrenceUpperQpc = 115;
  const r = evaluateEventAcquisition(f);
  f.timing.occurrenceLowerQpc = 110;
  assert.equal(r.timing.occurrenceLowerQpc, 105);
  assert.equal(r.timing.occurrenceUpperQpc, 115);
  assert.notEqual(r.timing.occurrenceLowerQpc, r.timing.occurrenceUpperQpc);
});

test('authored occurrence can predate acquisition without borrowing its receipt time', () => {
  const f = fixture();
  f.timing.occurrenceLowerQpc = 80; f.timing.occurrenceUpperQpc = 90;
  const r = evaluateEventAcquisition(f);
  assert.equal(r.admitted, true);
  assert.equal(r.timing.occurrenceLowerQpc, 80);
  assert.equal(r.timing.acquisitionBeforeQpc, 100);
  assert.equal(r.timing.observationAfterQpc, 120);
});
