import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OwnershipSimulation, required} from './ownership/OwnershipSimulation.mjs';

const id = {epoch: 'authored-session', handle: 7, generation: 1, component: 'engine'};
const caps = {build: 'synthetic-1', ...Object.fromEntries(required.map(k => [k, true]))};
const proof = {nativeSuppressionConfirmed: true, replacementReady: true};
const make = () => new OwnershipSimulation(id, 'synthetic-1');
function own(m, frame = 0) {
  assert.equal(m.observe(id, frame, frame), true);
  assert.equal(m.prepare(id, caps, true, frame), true);
  assert.equal(m.begin(id), true); assert.equal(m.confirmExclusive(id, frame, proof), true);
}
const native = {native: 1, owned: 0};

test('Two synthetic sources: sample-exact transfer preserves sibling and horn without duplicate copies', () => {
  const a = make(), b = new OwnershipSimulation({...id, handle: 8}, 'synthetic-1');
  let overlap = 0, gaps = 0, maxError = 0;
  for (let n = 0; n < 4800; n++) {
    if (n === 480) own(a, n);
    if (n > 480 && n < 2400 && n % 48 === 0) {
      // Controller issues a fresh prepare/lease only for this short experiment;
      // each complete cycle re-proves exclusivity, rather than renewing blindly.
      a.stop(); a.confirmRestoration(true); own(a, n);
    }
    if (n === 2400) { a.stop(); a.confirmRestoration(true); }
    const aw = a.weights(n), bw = b.weights(n);
    overlap += Number(aw.native + aw.owned > 1); gaps += Number(aw.native + aw.owned < 1);
    const sourceA = 0.2 * Math.sin(2 * Math.PI * 97 * n / 48000);
    const replacementA = sourceA; // Known, phase-identical synthetic copy ONLY.
    const sourceB = 0.13 * Math.sin(2 * Math.PI * 151 * n / 48000);
    const horn = 0.04 * Math.sin(2 * Math.PI * 611 * n / 48000);
    const actual = aw.native * sourceA + aw.owned * replacementA + bw.native * sourceB + horn;
    maxError = Math.max(maxError, Math.abs(actual - (sourceA + sourceB + horn)));
    assert.deepEqual(bw, native);
  }
  assert.equal(overlap, 0); assert.equal(gaps, 0); assert.equal(maxError, 0);
  assert.ok(a.history.includes('Transitioning')); assert.ok(a.history.includes('RichAudioOwned'));
});

test('Missing replacement never suppresses native', () => {
  const m = make(); m.observe(id, 0, 0);
  assert.equal(m.prepare(id, caps, false, 0), false);
  assert.deepEqual(m.weights(1), native); assert.equal(m.state, 'NativeOnly');
});

test('Every missing capability, including persistent mute without expiry, blocks takeover', () => {
  const unknown = make(); unknown.observe(id, 0, 0);
  assert.equal(unknown.prepare(id, null, true, 0), false);
  assert.deepEqual(unknown.weights(1), native);
  for (const missing of required) {
    const m = make(); m.observe(id, 0, 0);
    assert.equal(m.prepare(id, {...caps, [missing]: false}, true, 0), false);
    assert.deepEqual(m.weights(1), native);
  }
});

test('Disappearance stops the source, rather than continuing a ghost', () => {
  const m = make(); own(m);
  assert.deepEqual(m.weights(10, {sourceExists: false}), {native: 0, owned: 0});
  assert.equal(m.state, 'Restoring'); assert.equal(m.reason, 'source_disappeared');
});

test('Renderer failure falls back only through the hypothetical independent selector', () => {
  const m = make(); own(m);
  assert.deepEqual(m.weights(10, {rendererHealthy: false}), native);
  assert.equal(m.state, 'Restoring'); assert.equal(m.confirmRestoration(true), true);
  assert.equal(m.state, 'NativeOnly');
});

test('Controller crash/absent renewal and stale telemetry expire on the exact lease boundary', () => {
  const m = make(); own(m);
  assert.deepEqual(m.weights(95), {native: 0, owned: 1});
  assert.deepEqual(m.weights(96), native);
  assert.equal(m.reason, 'lease_or_telemetry_expired');
});

test('Recycled handle, different epoch or different component cannot acquire ownership', () => {
  for (const wrong of [{...id, generation: 2}, {...id, epoch: 'new-session'}, {...id, component: 'exhaust'}]) {
    const m = make(); m.observe(id, 0, 0);
    assert.equal(m.prepare(wrong, caps, true, 0), false);
    assert.equal(m.begin(wrong), false); assert.equal(m.confirmExclusive(wrong, 0, proof), false);
    assert.deepEqual(m.weights(1), native);
  }
});

test('Delayed, future and out-of-order async observations are rejected', () => {
  const m = make(); assert.equal(m.observe(id, 0, 0), true);
  assert.equal(m.observe(id, 0, 20), false);
  assert.equal(m.observe(id, 30, 20), false);
  assert.equal(m.observe(id, 1, 97), false);
  assert.equal(m.observe(id, 20, 25), true);
  assert.equal(m.prepare(id, caps, true, 116), false);
  assert.equal(m.observe(id, 117, 117), true);
  assert.equal(m.prepare(id, caps, true, 117), true);
});

test('Repeated transition and stale proof cannot create a second owner', () => {
  const m = make(); own(m);
  assert.equal(m.prepare(id, caps, true, 1), false); assert.equal(m.begin(id), false);
  assert.equal(m.confirmExclusive({...id, generation: 2}, 1, proof), false);
  assert.deepEqual(m.weights(1), {native: 0, owned: 1});
});

test('Unknown game build and unconfirmed suppression refuse takeover', () => {
  const m = make(); m.observe(id, 0, 0);
  assert.equal(m.prepare(id, {...caps, build: 'other'}, true, 0), false);
  assert.equal(m.prepare(id, caps, true, 0), true); m.begin(id);
  assert.equal(m.confirmExclusive(id, 1, {...proof, nativeSuppressionConfirmed: false}), false);
  assert.deepEqual(m.weights(1), native);
});

test('Native still audible cancels owned copy; recovery acknowledgement is separate', () => {
  const m = make(); own(m);
  assert.deepEqual(m.weights(1, {nativeStillAudible: true}), native);
  assert.equal(m.reason, 'native_overlap'); assert.equal(m.confirmRestoration(false), false);
  assert.equal(m.state, 'Failed'); // No false declaration of verified recovery.
});

test('Prepared transition times out without native mutation', () => {
  const m = make(); m.observe(id, 0, 0); m.prepare(id, caps, true, 0); m.begin(id);
  assert.deepEqual(m.weights(96), native); assert.equal(m.reason, 'handoff_timeout');
  assert.throws(() => m.weights(95), /sample clock/);
});

test('A handoff proof cannot precede preparation on the shared sample clock', () => {
  const m = make(); m.observe(id, 10, 10); m.prepare(id, caps, true, 20); m.begin(id);
  assert.equal(m.confirmExclusive(id, 19, proof), false);
  assert.deepEqual(m.weights(20), native);
});

test('A still-live prepared lease does not make old telemetry fresh', () => {
  const m = make(); m.observe(id, 0, 0); m.prepare(id, caps, true, 50); m.begin(id);
  assert.equal(m.confirmExclusive(id, 96, proof), false);
  assert.deepEqual(m.weights(96), native);
});

test('Negative control: separate delayed mute/start commands can cause overlap or silence', () => {
  function counts(muteAt, startAt) {
    let overlap = 0, gaps = 0;
    for (let n = 0; n < 32; n++) {
      const copies = Number(n < muteAt) + Number(n >= startAt);
      overlap += Number(copies > 1); gaps += Number(copies < 1);
    }
    return {overlap, gaps};
  }
  assert.deepEqual(counts(8, 0), {overlap: 8, gaps: 0});
  assert.deepEqual(counts(0, 8), {overlap: 0, gaps: 8});
  // Persistent native mute plus a dead renderer: a normal exit handler cannot run.
  assert.deepEqual(counts(0, Infinity), {overlap: 0, gaps: 32});
});
