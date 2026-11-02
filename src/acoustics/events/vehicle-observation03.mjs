// Read-only getter observations and deterministic replay. This module cannot
// register a native callback, infer a precise emission time or enable audio.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const need = (condition, why) => { if (!condition) throw Error(why); };
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const integer = (value, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const positive = value => integer(value, 0x7fffffff) && value > 0;
const sameKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fieldNames = ['hornPlaying', 'engineOn', 'engineStarting', 'rawRevolutionsRatio', 'currentGear', 'rawSpeed'];
const retirementReasons = ['identity-read-failed', 'vehicle-disappeared', 'vehicle-lifetime-changed', 'player-driver-scope-lost', 'observation-gap-expired'];
const exceptions = ['TimeoutException', 'InvalidOperationException', 'ArgumentException', 'IOException', 'NotSupportedException', 'Exception'];
const packetKeys = ['schema', 'generation', 'kind', 'evidenceBasis', 'session', 'vehicleId', 'status', 'retirementReason',
  'runtimeVerified', 'mayGenerateAudio', 'nativePrimary', 'sourcePoseAvailable', 'identity', 'sequence', 'clockFrequency',
  'captureBeforeQpc', 'captureAfterQpc', 'fields'];
const identityKeys = ['poolValue', 'poolIndex', 'model', 'poolCounter', 'exists', 'inPlayerDriverScope'];
const fieldKeys = ['name', 'status', 'exceptionType', 'value', 'beforeQpc', 'afterQpc', 'exceptionHResult'];
const expired = (delta, frequency, milliseconds) => BigInt(delta) * 1000n > BigInt(frequency) * BigInt(milliseconds);

export const VEHICLE_OBSERVATION_INTERFACES03 = freeze({
  schema: 1, runtimeVerified: false, productionAudioEnabled: false,
  nativePrimary: true, sourceEventTimestampAvailable: false, sampleAccurateNativeEvent: false,
  sourcePoseAvailable: false, componentMountsAvailable: false,
  identity: 'retained-RPH-reference-and-observed-pool-handle-index-counter-model; counter-wrap-not-runtime-qualified',
  nativeDeclarationCommit: 'c00e0ed83d06dcba2457424ba254fbaa7a05bf7e',
  referenceSdk: { sha256: '1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45',
    version: '1.131.1424.17745', methodBodies: 'RVA-zero-declarations-only', targetRuntimeVerified: false },
  fields: {
    hornPlaying: { getter: 'IS_HORN_ACTIVE', hash: '0x9D6BFC12B05C6121', meaning: 'current-native-horn-playing-level',
      inputButtonOrActivationTimeAvailable: false },
    engineOn: { getter: 'Rage.Vehicle.IsEngineOn', meaning: 'framework-engine-on-flag', shutdownSoundOrCauseAvailable: false },
    engineStarting: { getter: 'Rage.Vehicle.IsEngineStarting', meaning: 'framework-engine-starting-flag', ignitionOccurrenceAvailable: false },
    rawRevolutionsRatio: { getter: 'Rage.Vehicle.EngineRevolutionsRatio', units: 'framework-raw-scale-unverified-on-target', physicalRpmAvailable: false },
    currentGear: { getter: 'Rage.Vehicle.CurrentGear', units: 'framework-signed-gear-index', changeCountOrClunkAvailable: false },
    rawSpeed: { getter: 'Rage.Entity.Speed', units: 'framework-raw-speed-unverified-on-target', wheelSlipOrContactAvailable: false },
  },
  unavailable: ['physical-wheel-slip', 'wheel-load', 'contact-occurrence-and-multiplicity', 'collision-impulse',
    'qualified-contact-material', 'turbo-pressure-release', 'component-emission-mounts', 'recoverable-native-suppression'],
});

export const VEHICLE_LAST_CONTACT_INTERFACE03 = freeze({
  getter: 'Rage.Entity.GetLastCollision(out Vector3, out Vector3, out string)',
  authority: 'last-contact-history-poll', runtimeVerified: false, sourceEventTimestampAvailable: false,
  collisionEventIdentityAvailable: false, eventMultiplicityAvailable: false, impulseAvailable: false,
  coordinatesQualified: false, materialCoefficientsQualified: false, mayGenerateAudio: false, nativePrimary: true,
});

function fieldValue(name, value) {
  if (['hornPlaying', 'engineOn', 'engineStarting'].includes(name)) return typeof value === 'boolean';
  if (name === 'currentGear') return Number.isInteger(value) && value >= -128 && value <= 127;
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6;
}

export function vehicleObservation03(input) {
  need(sameKeys(input, packetKeys) && input.schema === 1 && input.kind === 'vehicle-read-only-observation-03', 'Exact bounded vehicle observation schema required');
  need(typeof input.session === 'string' && /^[a-f0-9]{32}$/.test(input.session) && typeof input.vehicleId === 'string' && /^[\w:.-]{1,48}$/.test(input.vehicleId) &&
    positive(input.generation) && integer(input.sequence), 'Explicit session, source generation and sequence required');
  need(['candidate-native-poll', 'authored-device-free-api-fixture'].includes(input.evidenceBasis) &&
    input.runtimeVerified === false && input.mayGenerateAudio === false && input.nativePrimary === true && input.sourcePoseAvailable === false,
  'Observation data cannot promote runtime, audio, ownership or source-position authority');
  need(integer(input.clockFrequency, 1e9) && input.clockFrequency > 0 && integer(input.captureBeforeQpc) &&
    integer(input.captureAfterQpc) && input.captureAfterQpc >= input.captureBeforeQpc, 'Ordered original acquisition clock required');
  need(['observed', 'retired', 'acquisition-rejected'].includes(input.status) &&
    (input.status === 'observed' ? input.retirementReason === null : input.status === 'retired'
      ? retirementReasons.includes(input.retirementReason) : input.retirementReason === 'acquisition-over-budget'), 'Known observation outcome required');
  if (input.status === 'observed') need(!expired(input.captureAfterQpc - input.captureBeforeQpc, input.clockFrequency, 10), 'Observed acquisition exceeds its unchanged bounded capture budget');
  const identity = input.identity;
  need(sameKeys(identity, identityKeys) && ['poolValue', 'poolIndex', 'model'].every(key => integer(identity[key], 0xffffffff)) &&
    integer(identity.poolCounter, 255) && typeof identity.exists === 'boolean' && typeof identity.inPlayerDriverScope === 'boolean', 'Exact observed pool identity required');
  if (input.status === 'observed') need(identity.poolValue > 0 && identity.exists && identity.inPlayerDriverScope, 'Live scope is required for qualified state observations');
  need(Array.isArray(input.fields) && input.fields.length === fieldNames.length, 'Six separately timed field results required');
  const fields = {};
  let previousAfter = input.captureBeforeQpc;
  for (const field of input.fields) {
    need(sameKeys(field, fieldKeys) && fieldNames.includes(field.name) && !Object.hasOwn(fields, field.name) &&
      ['value', 'unavailable', 'error', 'invalid'].includes(field.status), 'Unique bounded getter result required');
    if (field.status === 'unavailable') need(field.beforeQpc === null && field.afterQpc === null && field.value === null &&
      field.exceptionType === null && field.exceptionHResult === null, 'An unread getter cannot fabricate data or timestamps');
    else {
      need(integer(field.beforeQpc) && integer(field.afterQpc) && field.beforeQpc >= previousAfter &&
        field.afterQpc >= field.beforeQpc && field.afterQpc <= input.captureAfterQpc, 'Per-field acquisition order is required; batch atomicity is not assumed');
      previousAfter = field.afterQpc;
      if (field.status === 'value') need(fieldValue(field.name, field.value) && field.exceptionType === null && field.exceptionHResult === null, 'Getter value does not match its raw declaration');
      else need(field.value === null && (field.status === 'error'
        ? exceptions.includes(field.exceptionType) && Number.isInteger(field.exceptionHResult) && field.exceptionHResult >= -2147483648 && field.exceptionHResult <= 2147483647
        : field.exceptionType === null && field.exceptionHResult === null), 'Failed or invalid getters must remain unavailable');
    }
    fields[field.name] = { ...field };
  }
  return freeze({ schema: 1, kind: input.kind, session: input.session, vehicleId: input.vehicleId, generation: input.generation,
    sequence: input.sequence, evidenceBasis: input.evidenceBasis, clockFrequency: input.clockFrequency,
    captureBeforeQpc: input.captureBeforeQpc, captureAfterQpc: input.captureAfterQpc, status: input.status,
    retirementReason: input.retirementReason, identity: { ...identity }, fields, runtimeVerified: false,
    mayGenerateAudio: false, nativePrimary: true, sourcePoseAvailable: false, batchAtomic: false });
}

const contactKeys = ['schema', 'generation', 'kind', 'evidenceBasis', 'session', 'vehicleId', 'status', 'retirementReason',
  'exceptionType', 'materialName', 'materialNameStatus', 'runtimeVerified', 'mayGenerateAudio', 'nativePrimary', 'lastContactOnly',
  'coordinatesQualified', 'materialQualified', 'physicalIntensityAvailable', 'found', 'rawPosition', 'rawNormal', 'exceptionHResult',
  'sequence', 'clockFrequency', 'captureBeforeQpc', 'captureAfterQpc', 'queryBeforeQpc', 'queryAfterQpc', 'identity'];
const rawVector = value => Array.isArray(value) && value.length === 3 && value.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6);
export function vehicleContactObservation03(input) {
  need(sameKeys(input, contactKeys) && input.schema === 1 && input.kind === 'vehicle-last-contact-observation-03', 'Exact last-contact observation schema required');
  need(typeof input.session === 'string' && /^[a-f0-9]{32}$/.test(input.session) && typeof input.vehicleId === 'string' &&
    /^[\w:.-]{1,48}$/.test(input.vehicleId) && positive(input.generation) && integer(input.sequence), 'Explicit contact source lease required');
  need(['candidate-native-poll', 'authored-device-free-api-fixture'].includes(input.evidenceBasis) &&
    input.runtimeVerified === false && input.mayGenerateAudio === false && input.nativePrimary === true && input.lastContactOnly === true &&
    input.coordinatesQualified === false && input.materialQualified === false && input.physicalIntensityAvailable === false,
  'Last-contact data cannot grant event, intensity, material, coordinate or audio authority');
  need(integer(input.clockFrequency, 1e9) && input.clockFrequency > 0 && integer(input.captureBeforeQpc) &&
    integer(input.captureAfterQpc) && input.captureAfterQpc >= input.captureBeforeQpc, 'Original ordered contact acquisition clock required');
  need(['observed', 'invalid', 'error', 'retired', 'acquisition-rejected'].includes(input.status) &&
    (input.status === 'retired' ? retirementReasons.includes(input.retirementReason) : input.status === 'acquisition-rejected'
      ? input.retirementReason === 'acquisition-over-budget' : input.retirementReason === null), 'Known contact acquisition result required');
  need(sameKeys(input.identity, identityKeys) && ['poolValue', 'poolIndex', 'model'].every(key => integer(input.identity[key], 0xffffffff)) &&
    integer(input.identity.poolCounter, 255) && typeof input.identity.exists === 'boolean' && typeof input.identity.inPlayerDriverScope === 'boolean', 'Observed exact contact-poll source identity required');
  if (input.status === 'observed') need(input.identity.exists && input.identity.inPlayerDriverScope && input.identity.poolValue > 0 &&
    !expired(input.captureAfterQpc - input.captureBeforeQpc, input.clockFrequency, 10), 'Contact level requires a retained eligible acquisition');
  const queried = input.queryBeforeQpc !== null || input.queryAfterQpc !== null;
  if (queried) need(integer(input.queryBeforeQpc) && integer(input.queryAfterQpc) && input.queryBeforeQpc >= input.captureBeforeQpc &&
    input.queryAfterQpc >= input.queryBeforeQpc && input.queryAfterQpc <= input.captureAfterQpc, 'Original contact query bracket required');
  else need(input.queryBeforeQpc === null && input.queryAfterQpc === null && input.found === null &&
    ['retired', 'acquisition-rejected'].includes(input.status), 'An unqueried contact must remain unavailable');
  need(input.found === null || typeof input.found === 'boolean', 'Last-contact result is a level, not an invented event count');
  if (input.status === 'observed') need(typeof input.found === 'boolean', 'Observed contact query must retain its actual boolean result');
  if (input.found === true) need(queried && rawVector(input.rawPosition) && rawVector(input.rawNormal), 'Finite copied raw contact vectors required');
  else need(input.rawPosition === null && input.rawNormal === null && input.materialName === null, 'No contact/failed query cannot fabricate a point or material');
  need(['value', 'unavailable', 'invalid'].includes(input.materialNameStatus) && (input.materialNameStatus === 'value'
    ? input.found === true && typeof input.materialName === 'string' && /^[A-Za-z0-9_.: -]{1,64}$/.test(input.materialName)
    : input.materialName === null), 'Only bounded opaque material names may be retained');
  need(input.exceptionType === null && input.exceptionHResult === null || exceptions.includes(input.exceptionType) &&
    Number.isInteger(input.exceptionHResult) && input.exceptionHResult >= -2147483648 && input.exceptionHResult <= 2147483647, 'Safe contact exception provenance required');
  if (input.status === 'error') need(input.found === null && input.exceptionType !== null, 'Failed contact query must retain unavailable data and its safe error category');
  return freeze({ ...input, identity: { ...input.identity }, rawPosition: input.rawPosition === null ? null : [...input.rawPosition],
    rawNormal: input.rawNormal === null ? null : [...input.rawNormal], observedHistoryOnly: true,
    actualOccurrence: { known: false, lowerQpc: null, upperQpc: null }, collisionEventIdentity: null,
    actualEventMultiplicity: 'unavailable', physicalIntensity: null, sourcePoseAvailable: false,
    interpretation: 'Repeated/equal/changed last-contact polls are not new collision events or a deduplication key' });
}

const lifetimeKey = identity => JSON.stringify([identity.poolValue, identity.poolIndex, identity.poolCounter, identity.model]);
const identityLabel = (session, vehicleId, generation) => JSON.stringify([session, vehicleId, generation]);

export class VehicleObservationReplay03 {
  #context; #limit; #gap; #records = 0; #last = null; #physical = null; #previous = new Map(); #retired = null;
  constructor({ session, vehicleId, generation, maximumGapMilliseconds = 250, maximumRecords = 4096 } = {}) {
    need(typeof session === 'string' && /^[a-f0-9]{32}$/.test(session) && typeof vehicleId === 'string' &&
      /^[\w:.-]{1,48}$/.test(vehicleId) && positive(generation), 'Replay requires one explicit source lease');
    need(Number.isInteger(maximumGapMilliseconds) && maximumGapMilliseconds > 0 && maximumGapMilliseconds <= 250 &&
      Number.isInteger(maximumRecords) && maximumRecords > 0 && maximumRecords <= 4096, 'Replay cannot relax freshness or bounded record storage');
    this.#context = identityLabel(session, vehicleId, generation); this.#gap = maximumGapMilliseconds; this.#limit = maximumRecords;
  }
  #stop(reason, observation) {
    this.#retired = reason; this.#previous.clear();
    return freeze({ status: 'retired', observation, levels: [], levelTransitions: [], retirement: { reason,
      engineOffInferred: false, shutdownSoundInferred: false }, mayGenerateAudio: false, nativePrimary: true });
  }
  accept(input, { nowQpc } = {}) {
    need(this.#retired === null, 'Replay lease is terminal; a new explicit source lifetime is required');
    const observation = vehicleObservation03(input);
    need(this.#context === identityLabel(observation.session, observation.vehicleId, observation.generation), 'Observation belongs to another source lease');
    need(integer(nowQpc) && nowQpc >= observation.captureAfterQpc, 'Explicit same-domain receipt time must follow acquisition');
    if (this.#last) {
      need(observation.sequence > this.#last.sequence, 'Duplicate or reordered observation sequence');
      if (observation.evidenceBasis !== this.#last.evidenceBasis || observation.clockFrequency !== this.#last.clockFrequency || observation.captureBeforeQpc < this.#last.captureAfterQpc)
        return this.#stop('observation-clock-discontinuous', observation);
      if (expired(observation.captureBeforeQpc - this.#last.captureBeforeQpc, observation.clockFrequency, this.#gap))
        return this.#stop('observation-gap-expired', observation);
    }
    if (++this.#records > this.#limit) return this.#stop('record-budget-exhausted', observation);
    if (expired(nowQpc - observation.captureBeforeQpc, observation.clockFrequency, 250)) return this.#stop('observation-stale', observation);
    this.#last = observation;
    if (observation.status === 'retired') return this.#stop(observation.retirementReason, observation);
    const key = lifetimeKey(observation.identity);
    if (this.#physical !== null && key !== this.#physical) return this.#stop('vehicle-lifetime-changed', observation);
    this.#physical = key;
    if (observation.status === 'acquisition-rejected') {
      this.#previous.clear();
      return freeze({ status: 'quarantined', observation, levels: [], levelTransitions: [], retirement: null,
        mayGenerateAudio: false, nativePrimary: true });
    }
    const levels = [], levelTransitions = [];
    for (const name of fieldNames) {
      const field = observation.fields[name];
      if (field.status !== 'value') { this.#previous.delete(name); continue; }
      levels.push({ field: name, value: field.value, acquisitionBeforeQpc: field.beforeQpc, observationAfterQpc: field.afterQpc,
        semantics: VEHICLE_OBSERVATION_INTERFACES03.fields[name], sourcePoseAvailable: false });
      let previous = this.#previous.get(name);
      if (previous && expired(field.beforeQpc - previous.beforeQpc, observation.clockFrequency, this.#gap)) previous = null;
      if (previous && previous.value !== field.value && ['hornPlaying', 'engineOn', 'engineStarting', 'currentGear'].includes(name))
        levelTransitions.push({ kind: 'observed-level-difference', field: name, beforeValue: previous.value, afterValue: field.value,
          previousSequence: previous.sequence, sequence: observation.sequence,
          actualOccurrence: { known: false, lowerQpc: null, upperQpc: null },
          pollChangeWindow: { lowerQpc: previous.beforeQpc, upperQpc: field.afterQpc,
            conditionalOnGetterCurrentStateSemantics: true, qualifiedPhysicalEventBound: false },
          observedLevelDifferences: 1, actualEventMultiplicity: 'unavailable', intermediateLevelChanges: 'unobserved',
          sampleAccurateNativeEvent: false, engineShutdownSoundInferred: false, mayGenerateAudio: false });
      this.#previous.set(name, { value: field.value, beforeQpc: field.beforeQpc, afterQpc: field.afterQpc, sequence: observation.sequence });
    }
    return freeze({ status: 'observed', observation, levels, levelTransitions, retirement: null,
      actualEventMultiplicity: 'unavailable', unobservedEventsPossible: true,
      simultaneousSnapshot: false, mayGenerateAudio: false, nativePrimary: true });
  }
}
