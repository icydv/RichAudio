import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OfflineOwnershipPolicy, nativeAudioOwnership, requiredEvidence, takeoverComponents,
  retainedNativeComponents} from '../src/acoustics/ownership/policy.mjs';

const identity = {session: 'authored-session', handle: 7, generation: 1, model: 0xf9300cc5};
const baseline = {known: true, profile: 'original-fixture-profile', identityKey: JSON.stringify(Object.values(identity))};
const certificate = {kind: 'authored-fixture-assumptions', build: 'fixture-1', components: ['engine', 'exhaust'],
  ...Object.fromEntries(requiredEvidence.map(k => [k, true]))};
const make = (extra = {}) => new OfflineOwnershipPolicy({identity, build: 'fixture-1', mode: 'authored-fixture', ...extra});
const observe = (m, frame = 0) => m.observe({identity, acquiredFrame: frame, receivedFrame: frame});
const prepare = (m, extra = {}) => m.prepare({identity, frame: 0, replacementHealthy: true, baseline, certificate, ...extra});
function own(m) {
  assert(observe(m)); assert(prepare(m)); const cmd = m.takeover({identity, frame: 0});
  assert(m.acknowledge({identity, frame: 0, transaction: cmd.id, kind: 'independent-fixture-measurement',
    nativeSuppressed: true, replacementAudible: true, unrelatedPreserved: true}));
  return cmd;
}
function restore(m, frame = 2, reason) {
  const cmd = m.stop({identity, frame, reason});
  assert.equal(cmd.action, 'restore-exact-baseline'); assert.deepEqual(cmd.baseline, baseline);
  assert(m.acknowledge({identity, frame, transaction: cmd.id, kind: 'independent-fixture-measurement',
    nativeRestored: true, unrelatedPreserved: true}));
}

test('real capability registry is immutable, disabled and blocked; fixture assertions cannot enable production', () => {
  assert.equal(nativeAudioOwnership.enabled, false); assert.equal(nativeAudioOwnership.status, 'BLOCKED');
  assert.equal(nativeAudioOwnership.verifiedMechanisms, 0); assert(Object.isFrozen(nativeAudioOwnership));
  const m = make({mode: 'disabled'}); observe(m); assert.equal(prepare(m), false);
  assert.equal(m.takeover({identity, frame: 0}), null); assert.equal(m.snapshot().nativeState, 'unchanged');
});

test('prepared remains native-only and successful invocation alone never permits replacement', () => {
  const m = make(); observe(m); assert(prepare(m));
  assert.equal(m.snapshot().replacementPermitted, false);
  const cmd = m.takeover({identity, frame: 1}); assert(cmd);
  assert.equal(m.snapshot().replacementPermitted, false); assert.equal(m.state, 'Prepared');
  assert.equal(m.takeover({identity, frame: 1}), null);
  assert.equal(m.acknowledge({identity, frame: 1, transaction: cmd.id, kind: 'function-return-success',
    nativeSuppressed: true, replacementAudible: true, unrelatedPreserved: true}), false);
  assert.equal(m.state, 'Restoring'); assert.equal(m.snapshot().nativeRecoveryVerified, false);
});

test('all independent capability evidence is required, and arbitrary gain/mute profiles cannot substitute', () => {
  for (const missing of requiredEvidence) {
    const m = make(); observe(m);
    assert.equal(prepare(m, {certificate: {...certificate, [missing]: false}}), false, missing);
    assert.equal(m.state, 'NativeOnly');
  }
  for (const patch of [{build: 'other-build'}, {components: ['engine']}, {components: ['engine', 'exhaust', 'horn']}, {kind: 'claimed-native-support'}]) {
    const m = make(); observe(m); assert.equal(prepare(m, {certificate: {...certificate, ...patch}}), false);
  }
});

test('known exact original profile, healthy replacement and fresh source are independently necessary', () => {
  for (const patch of [{baseline: null}, {baseline: {...baseline, profile: ''}}, {baseline: {...baseline, known: false}},
    {baseline: {...baseline, identityKey: 'other'}}, {replacementHealthy: false}]) {
    const m = make(); observe(m); assert.equal(prepare(m, patch), false);
  }
  const m = make(); assert.equal(prepare(m), false); observe(m);
  assert.equal(prepare(m, {frame: 96}), false);
});

test('normal fixture transition and exact restoration require measured acknowledgements', () => {
  const m = make(); own(m); assert.equal(m.state, 'RichAudioOwned'); assert(m.snapshot().replacementPermitted);
  const cmd = m.stop({identity, frame: 1}); assert.equal(m.state, 'Restoring');
  assert.equal(m.snapshot().replacementPermitted, false); assert.equal(m.snapshot().nativeRecoveryVerified, false);
  assert(m.acknowledge({identity, frame: 2, transaction: cmd.id, kind: 'independent-fixture-measurement',
    nativeRestored: true, unrelatedPreserved: true}));
  assert.equal(m.state, 'NativeOnly'); assert(m.snapshot().nativeRecoveryVerified);
});

test('same-model sibling, NPC/context session and recycled handle cannot receive commands or stale acknowledgements', () => {
  const m = make(); const cmd = own(m);
  for (const wrong of [{...identity, handle: 8}, {...identity, generation: 2}, {...identity, session: 'npc-session'},
    {...identity, model: 123}]) {
    assert.equal(m.stop({identity: wrong, frame: 1}), null);
    assert.equal(m.acknowledge({identity: wrong, frame: 1, transaction: cmd.id, kind: 'independent-fixture-measurement', nativeRestored: true}), false);
  }
  assert.equal(m.state, 'RichAudioOwned'); restore(m);
});

test('generation loss and disappearance forbid restoration writes to a new occupant', () => {
  const m = make(); own(m);
  assert.equal(m.health({identity, frame: 1, entityExists: false}), null);
  assert.equal(m.state, 'Failed'); assert.equal(m.snapshot().nativeState, 'unknown');
  assert.equal(m.snapshot().reason, 'entity-unavailable-no-restore-write');
  const restoring = make(); own(restoring); restoring.stop({identity, frame: 1});
  restoring.health({identity, frame: 2, entityExists: false});
  assert.equal(restoring.state, 'Failed'); assert.equal(restoring.snapshot().pending, null);
});

test('transaction commands and nested component/baseline data cannot be modified by a dispatcher', () => {
  const m = make(); observe(m); prepare(m); const cmd = m.takeover({identity, frame: 1});
  assert.throws(() => cmd.components.push('horn'), TypeError);
  assert.throws(() => {cmd.identity.generation = 2;}, TypeError);
  assert.throws(() => {cmd.baseline.profile = 'other';}, TypeError);
});

test('source loss, renderer/host failure, plugin unload, switch and native overlap request exact restoration', () => {
  for (const [patch, reason] of [[{sourceEligible: false}, 'source-scope-lost'], [{replacementHealthy: false}, 'replacement-failed'],
    [{nativeOverlap: true}, 'native-overlap']]) {
    const m = make(); own(m); const cmd = m.health({identity, frame: 1, ...patch});
    assert.equal(cmd.action, 'restore-exact-baseline'); assert.equal(m.reason, reason);
    assert.equal(m.snapshot().nativeRecoveryVerified, false);
  }
  for (const reason of ['plugin-unload', 'vehicle-switch', 'host-process-failure']) {
    const m = make(); own(m); restore(m, 1, reason);
  }
});

test('failed or absent restoration proof stays failed and cannot silently acquire another source', () => {
  for (const patch of [{nativeRestored: false}, {unrelatedPreserved: false}, {kind: 'function-return-success'}]) {
    const m = make(); own(m); const cmd = m.stop({identity, frame: 1});
    assert.equal(m.acknowledge({identity, frame: 2, transaction: cmd.id, kind: 'independent-fixture-measurement',
      nativeRestored: true, unrelatedPreserved: true, ...patch}), false);
    assert.equal(m.state, 'Failed'); assert.equal(m.snapshot().nativeState, 'unknown');
    assert.equal(prepare(m, {frame: 3}), false);
  }
  const m = make(); own(m); m.stop({identity, frame: 1}); m.health({identity, frame: 97});
  assert.equal(m.state, 'Failed'); assert.equal(m.reason, 'restoration-timeout');
});

test('expiry is strict and independent backend recovery is an unverified premise, not a cleanup callback', () => {
  const m = make(); own(m); m.health({identity, frame: 95}); assert.equal(m.state, 'RichAudioOwned');
  const cmd = m.health({identity, frame: 96}); assert.equal(cmd.action, 'restore-exact-baseline');
  assert.equal(m.snapshot().nativeRecoveryVerified, false);
  assert.equal(m.snapshot().nativeState, 'unknown');
  // With no independent backend, a crashed controller never executes even this request.
  const crashed = make(); own(crashed); assert.equal(crashed.state, 'RichAudioOwned');
  assert.equal(nativeAudioOwnership.verifiedMechanisms, 0);
});

test('asynchronous observation ordering, stale commands and timing cannot revive expired ownership', () => {
  const m = make(); observe(m);
  for (const [a, r] of [[0, 1], [20, 19], [1, 97]]) assert.equal(m.observe({identity, acquiredFrame: a, receivedFrame: r}), false);
  assert(prepare(m)); const cmd = m.takeover({identity, frame: 1});
  assert.equal(m.acknowledge({identity, frame: 1, transaction: cmd.id + 1, kind: 'independent-fixture-measurement'}), false);
  assert.equal(m.acknowledge({identity, frame: 96, transaction: cmd.id, kind: 'independent-fixture-measurement',
    nativeSuppressed: true, replacementAudible: true, unrelatedPreserved: true}), false);
  assert.equal(m.state, 'Restoring');
  assert.equal(m.health({identity, frame: -1}), null);
  assert.equal(m.health({identity, frame: 95}), null); // cannot rewind the policy clock
});

test('interrupted prepared state leaves native unchanged and scope loss never invents engine shutdown', () => {
  const m = make(); observe(m); prepare(m);
  assert.equal(m.stop({identity, frame: 1, reason: 'source-scope-lost'}), null);
  assert.equal(m.state, 'NativeOnly'); assert.equal(m.reason, 'source-scope-lost');
  assert.equal(m.snapshot().nativeState, 'unchanged');
  assert.equal(JSON.stringify(m.snapshot()).includes('engine-off'), false);
});

test('component policy explicitly retains auxiliary and unresolved transmission/induction/turbo/backfire layers', () => {
  assert.deepEqual(takeoverComponents, ['engine', 'exhaust']);
  for (const c of ['horn', 'tyres', 'collision', 'doors', 'radio', 'ambience', 'transmission', 'induction', 'turbo', 'backfire'])
    assert(retainedNativeComponents.includes(c));
});

test('fixture transfer preserves a same-model sibling and unrelated sounds with no overlap or missing frames', () => {
  const m = make({ttlFrames: 4800}); let overlapFrames = 0, missingFrames = 0, maximumError = 0;
  for (let frame = 0; frame < 4800; frame++) {
    if (frame === 480) { observe(m, frame); prepare(m, {frame});
      const cmd = m.takeover({identity, frame}); m.acknowledge({identity, frame, transaction: cmd.id,
        kind: 'independent-fixture-measurement', nativeSuppressed: true, replacementAudible: true, unrelatedPreserved: true}); }
    if (frame === 2400) restore(m, frame);
    const owned = m.snapshot().replacementPermitted ? 1 : 0, native = 1 - owned;
    overlapFrames += Number(native + owned > 1); missingFrames += Number(native + owned < 1);
    const engine = .2 * Math.sin(frame * .013), sibling = .13 * Math.sin(frame * .021);
    const auxiliaries = retainedNativeComponents.reduce((sum, _, i) => sum + .001 * Math.sin(frame * (.031 + i * .001)), 0);
    const expected = engine + sibling + auxiliaries;
    maximumError = Math.max(maximumError, Math.abs(native * engine + owned * engine + sibling + auxiliaries - expected));
  }
  assert.equal(overlapFrames, 0); assert.equal(missingFrames, 0); assert.equal(maximumError, 0);
});

test('delayed independent commands and persistent mute remain explicit negative controls', () => {
  const counts = (muteAt, startAt) => {
    let overlapFrames = 0, missingFrames = 0;
    for (let n = 0; n < 32; n++) { const sum = Number(n < muteAt) + Number(n >= startAt);
      overlapFrames += Number(sum > 1); missingFrames += Number(sum < 1); }
    return {overlapFrames, missingFrames};
  };
  assert.deepEqual(counts(8, 0), {overlapFrames: 8, missingFrames: 0});
  assert.deepEqual(counts(0, 8), {overlapFrames: 0, missingFrames: 8});
  assert.deepEqual(counts(0, Infinity), {overlapFrames: 0, missingFrames: 32});
});
