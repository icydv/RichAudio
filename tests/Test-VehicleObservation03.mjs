import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VEHICLE_OBSERVATION_INTERFACES03, VEHICLE_LAST_CONTACT_INTERFACE03, vehicleObservation03, vehicleContactObservation03, VehicleObservationReplay03 }
  from '../src/acoustics/events/vehicle-observation03.mjs';
import { authoredVehicleObservation03 as observation, authoredVehicleContact03 as contact, vehicleSession03 as session } from './fixtures/VehicleObservations03.mjs';
import { evaluateEventAcquisition } from '../src/acoustics/events/acquisition-capability.mjs';

const replay = options => new VehicleObservationReplay03({ session, vehicleId: 'retained-vehicle', generation: 1, ...options });
const accept = (reader, value, nowQpc = value.captureAfterQpc) => reader.accept(value, { nowQpc });
const getter = (packet, name) => packet.fields.find(field => field.name === name);

test('six independent getter brackets preserve raw values and explicit candidate authority', () => {
  const raw = observation(); const value = vehicleObservation03(raw);
  assert.equal(value.fields.rawRevolutionsRatio.value, 50);
  assert.equal(value.fields.currentGear.value, 1);
  assert.equal(value.fields.hornPlaying.beforeQpc, 1000);
  assert.equal(value.fields.rawSpeed.afterQpc, 1006);
  assert.equal(value.batchAtomic, false);
  assert.equal(value.sourcePoseAvailable, false);
  assert.equal(value.runtimeVerified, false);
  raw.fields[0].value = true; assert.equal(value.fields.hornPlaying.value, false);
  assert.throws(() => { value.fields.engineOn.value = false; }, TypeError);
});

test('declaration registry never grants event, physical or ownership authority', () => {
  assert.equal(VEHICLE_OBSERVATION_INTERFACES03.fields.hornPlaying.hash, '0x9D6BFC12B05C6121');
  assert.equal(VEHICLE_OBSERVATION_INTERFACES03.fields.rawRevolutionsRatio.physicalRpmAvailable, false);
  assert.equal(VEHICLE_OBSERVATION_INTERFACES03.fields.currentGear.changeCountOrClunkAvailable, false);
  assert.equal(VEHICLE_OBSERVATION_INTERFACES03.fields.rawSpeed.wheelSlipOrContactAvailable, false);
  assert.equal(VEHICLE_OBSERVATION_INTERFACES03.productionAudioEnabled, false);
  assert.throws(() => { VEHICLE_OBSERVATION_INTERFACES03.runtimeVerified = true; }, TypeError);
  const result = evaluateEventAcquisition({ mode: 'production', hornPlaying: true, runtimeVerified: true });
  assert.equal(result.admitted, false); assert.equal(result.mayGenerateDirect, false);
});

test('initial active horn/running state seeds levels without manufacturing an onset', () => {
  const result = accept(replay(), observation({ values: { hornPlaying: true } }));
  assert.equal(result.levels.find(v => v.field === 'hornPlaying').value, true);
  assert.equal(result.levelTransitions.length, 0);
  assert.equal(result.actualEventMultiplicity, 'unavailable'); assert.equal(result.unobservedEventsPossible, true);
});

test('horn/gear differences retain conservative poll comparison windows and unknown occurrence/multiplicity', () => {
  const reader = replay(); const first = observation(); accept(reader, first);
  const next = observation({ sequence: 1, at: 1050, values: { hornPlaying: true, currentGear: 3 } });
  const result = accept(reader, next);
  assert.equal(result.levelTransitions.length, 2);
  const horn = result.levelTransitions.find(v => v.field === 'hornPlaying');
  assert.deepEqual(horn.actualOccurrence, { known: false, lowerQpc: null, upperQpc: null });
  assert.deepEqual(horn.pollChangeWindow, { lowerQpc: 1000, upperQpc: 1051,
    conditionalOnGetterCurrentStateSemantics: true, qualifiedPhysicalEventBound: false });
  for (const row of result.levelTransitions) {
    assert.equal(row.observedLevelDifferences, 1); assert.equal(row.actualEventMultiplicity, 'unavailable');
    assert.equal(row.sampleAccurateNativeEvent, false); assert.equal(row.mayGenerateAudio, false);
  }
  assert.equal(result.levelTransitions.find(v => v.field === 'currentGear').afterValue, 3);
});

test('equal polls do not certify no intermediate horn or mechanical events', () => {
  const reader = replay(); accept(reader, observation());
  const result = accept(reader, observation({ sequence: 1, at: 1050 }));
  assert.equal(result.levelTransitions.length, 0); assert.equal(result.unobservedEventsPossible, true);
});

test('observed engine flag falling is distinct from physical shutdown or shutdown sound', () => {
  const reader = replay(); accept(reader, observation());
  const result = accept(reader, observation({ sequence: 1, at: 1050, values: { engineOn: false } }));
  assert.equal(result.status, 'observed'); assert.equal(result.retirement, null);
  assert.equal(result.levelTransitions.length, 1);
  assert.equal(result.levelTransitions[0].field, 'engineOn');
  assert.equal(result.levelTransitions[0].engineShutdownSoundInferred, false);
});

test('dismount, disappearance and explicit scope retirement never manufacture engine-off', () => {
  for (const [reason, identity] of [['player-driver-scope-lost', { inPlayerDriverScope: false }], ['vehicle-disappeared', { exists: false }]]) {
    const reader = replay(); accept(reader, observation());
    const result = accept(reader, observation({ sequence: 1, at: 1050, status: 'retired', retirementReason: reason, identity }));
    assert.equal(result.status, 'retired'); assert.equal(result.levelTransitions.length, 0); assert.equal(result.levels.length, 0);
    assert.equal(result.retirement.engineOffInferred, false);
    assert.throws(() => accept(reader, observation({ sequence: 2, at: 1100 })), /terminal/);
  }
});

test('post-query invalidation cannot admit a captured engine-off flag', () => {
  const reader = replay(); accept(reader, observation());
  const changed = observation({ sequence: 1, at: 1050, values: { engineOn: false } });
  changed.status = 'retired'; changed.retirementReason = 'player-driver-scope-lost';
  const result = accept(reader, changed); assert.equal(result.levelTransitions.length, 0); assert.equal(result.levels.length, 0);
});

test('same-model vehicle switch and recycled pool counter terminate the original lifetime', () => {
  for (const identity of [{ poolValue: 8193, poolIndex: 2 }, { poolCounter: 2 }]) {
    const reader = replay(); accept(reader, observation());
    const result = accept(reader, observation({ sequence: 1, at: 1050, identity, values: { hornPlaying: true } }));
    assert.equal(result.retirement.reason, 'vehicle-lifetime-changed'); assert.equal(result.levelTransitions.length, 0);
  }
});

test('another session/source/generation cannot contaminate or restart an existing replay lease', () => {
  const reader = replay(); accept(reader, observation());
  for (const changes of [{ session: 'b'.repeat(32) }, { vehicleId: 'another-bati' }, { generation: 2 }])
    assert.throws(() => accept(reader, observation({ sequence: 1, at: 1050, ...changes })), /another source/);
  assert.equal(accept(reader, observation({ sequence: 1, at: 1050 })).status, 'observed');
});

test('duplicate/reordered observation cannot replay a horn edge or mutate previous history', () => {
  const reader = replay(); accept(reader, observation());
  assert.throws(() => accept(reader, observation({ values: { hornPlaying: true } })), /Duplicate/);
  assert.equal(accept(reader, observation({ sequence: 1, at: 1050, values: { hornPlaying: true } })).levelTransitions.length, 1);
});

test('a failed getter clears only its comparison chain and keeps safe exception provenance', () => {
  const reader = replay(); accept(reader, observation());
  const missing = observation({ sequence: 1, at: 1050, values: { engineStarting: true } });
  Object.assign(getter(missing, 'hornPlaying'), { status: 'error', value: null,
    exceptionType: 'NotSupportedException', exceptionHResult: -2146233067 });
  const result = accept(reader, missing);
  assert.equal(result.levels.some(v => v.field === 'hornPlaying'), false);
  assert.equal(result.levelTransitions[0].field, 'engineStarting');
  const restored = accept(reader, observation({ sequence: 2, at: 1100, values: { hornPlaying: true, engineStarting: true } }));
  assert.equal(restored.levelTransitions.length, 0);
});

test('an over-budget batch is quarantined without emitting partial state or restarting source identity', () => {
  const reader = replay(); accept(reader, observation());
  const rejected = observation({ sequence: 1, at: 1050, status: 'acquisition-rejected', retirementReason: 'acquisition-over-budget' });
  rejected.captureAfterQpc = 1070;
  const result = accept(reader, rejected);
  assert.equal(result.status, 'quarantined'); assert.equal(result.levels.length, 0); assert.equal(result.retirement, null);
  assert.equal(accept(reader, observation({ sequence: 2, at: 1100, values: { hornPlaying: true } })).levelTransitions.length, 0);
});

test('signed freshness is inclusive at250ms; no future read or threshold relaxation', () => {
  const first = observation({ at: 1_000_000, frequency: 1_000_000 });
  assert.equal(accept(replay(), first, first.captureBeforeQpc + 250000).status, 'observed');
  assert.equal(accept(replay(), first, first.captureBeforeQpc + 250001).retirement.reason, 'observation-stale');
  assert.throws(() => accept(replay(), first, first.captureAfterQpc - 1), /receipt time/);
  assert.throws(() => replay({ maximumGapMilliseconds: 251 }), /relax/);
});

test('stream gap expiry is anchored to original capture-before, not the later batch end', () => {
  const first = observation({ at: 1000000, frequency: 1000000 });
  const reader = replay(); accept(reader, first);
  assert.equal(accept(reader, observation({ sequence: 1, at: 1250000, frequency: 1000000 })).status, 'observed');
  const expiredReader = replay(); accept(expiredReader, first);
  assert.equal(accept(expiredReader, observation({ sequence: 1, at: 1250001, frequency: 1000000 })).retirement.reason, 'observation-gap-expired');
});

test('clock discontinuity and bounded record exhaustion require a new explicit lifetime', () => {
  const reader = replay(); accept(reader, observation());
  assert.equal(accept(reader, observation({ sequence: 1, at: 1050, frequency: 2000 })).retirement.reason, 'observation-clock-discontinuous');
  const limited = replay({ maximumRecords: 1 }); accept(limited, observation());
  assert.equal(accept(limited, observation({ sequence: 1, at: 1050 })).retirement.reason, 'record-budget-exhausted');
  const mixed=replay();accept(mixed,observation());const foreignClock=observation({sequence:1,at:1050});foreignClock.evidenceBasis='candidate-native-poll';
  assert.equal(accept(mixed,foreignClock).retirement.reason,'observation-clock-discontinuous');
});

test('malformed or authority-upgrading packets are rejected before replay state changes', () => {
  for (const mutate of [r => { r.mayGenerateAudio = true; }, r => { r.runtimeVerified = true; }, r => { r.sourcePoseAvailable = true; },
    r => { r.generation = 0; }, r => { r.extra = true; }, r => { r.identity.poolCounter = 256; },
    r => { r.fields[0] = { ...r.fields[1] }; }, r => { r.fields[1].beforeQpc = 0; },
    r => { r.fields[1].afterQpc = r.captureAfterQpc + 1; }, r => { r.fields[0].value = 1; },
    r => { r.fields[3].value = Infinity; }, r => { r.fields[4].value = 128; },
    r => { r.fields[0].status = 'unavailable'; }, r => { r.captureAfterQpc = r.captureBeforeQpc - 1; }]) {
    const value = observation(); mutate(value); assert.throws(() => vehicleObservation03(value));
  }
});

test('candidate-native packets remain blocked for sound even when valid as read-only levels', () => {
  const value = observation(); value.evidenceBasis = 'candidate-native-poll';
  const result = accept(replay(), value);
  assert.equal(result.mayGenerateAudio, false); assert.equal(result.nativePrimary, true);
  assert.equal(result.observation.runtimeVerified, false);
});

test('ordinary live gameplay still uses no VehicleObservation03 adapter or event bus activation', () => {
  for (const file of ['src/acoustics/bridge/Rph/Playable.Rph.cs', 'src/acoustics/host/Windows/GameplayRuntime.cs'])
    assert.equal(readFileSync(file, 'utf8').includes('VehicleObservation03'), false);
});

test('last-contact history preserves finite raw vectors without claiming coordinates/materials/impulse', () => {
  const raw=contact(),value=vehicleContactObservation03(raw);
  assert.deepEqual(value.rawPosition,[10,2,1]);assert.equal(value.materialName,'METAL');
  assert.equal(value.coordinatesQualified,false);assert.equal(value.materialQualified,false);
  assert.equal(value.physicalIntensity,null);assert.equal(value.sourcePoseAvailable,false);
  raw.rawPosition[0]=999;assert.equal(value.rawPosition[0],10);
  assert.equal(VEHICLE_LAST_CONTACT_INTERFACE03.collisionEventIdentityAvailable,false);
});

test('repeated or changed last-contact polls do not become collision events or a deduplication identity', () => {
  const rows=[vehicleContactObservation03(contact()),vehicleContactObservation03(contact({sequence:1,at:1050}))];
  for(const row of rows){assert.equal(row.collisionEventIdentity,null);assert.equal(row.actualEventMultiplicity,'unavailable');
    assert.deepEqual(row.actualOccurrence,{known:false,lowerQpc:null,upperQpc:null});assert.equal(row.mayGenerateAudio,false);}
  const changed=contact({sequence:2,at:1100});changed.rawPosition=[11,2,1];
  assert.equal(vehicleContactObservation03(changed).collisionEventIdentity,null);
});

test('no reported last contact leaves point/normal/material unavailable', () => {
  const value=vehicleContactObservation03(contact({found:false}));
  assert.equal(value.rawPosition,null);assert.equal(value.rawNormal,null);assert.equal(value.materialName,null);
  assert.equal(value.actualEventMultiplicity,'unavailable');
});

test('raw contact normal/material labels never upgrade themselves into acoustic qualification', () => {
  const value=contact();value.rawNormal=[0,2,0];value.materialName=null;value.materialNameStatus='invalid';
  const normalized=vehicleContactObservation03(value);assert.deepEqual(normalized.rawNormal,[0,2,0]);assert.equal(normalized.materialQualified,false);
  for(const mutate of [r=>{r.coordinatesQualified=true;},r=>{r.materialQualified=true;},r=>{r.physicalIntensityAvailable=true;},
    r=>{r.eventId=1;},r=>{r.rawPosition=[NaN,0,0];},r=>{r.rawNormal=[0,Infinity,0];},r=>{r.materialName='../private/path';}]){
    const bad=contact();mutate(bad);assert.throws(()=>vehicleContactObservation03(bad));
  }
});

test('contact query errors preserve safe provenance and cannot fabricate contact data', () => {
  const raw=contact({found:false});raw.status='error';raw.found=null;raw.exceptionType='NotSupportedException';raw.exceptionHResult=-2146233067;
  const value=vehicleContactObservation03(raw);assert.equal(value.found,null);assert.equal(value.rawPosition,null);assert.equal(value.exceptionType,'NotSupportedException');
  const bad=contact({found:false});bad.rawPosition=[0,0,0];assert.throws(()=>vehicleContactObservation03(bad));
});
