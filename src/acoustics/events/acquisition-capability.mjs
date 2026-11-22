// Offline evidence gate. No native calls, endpoint access or game adapter.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const fixtureCapabilities = new WeakSet();
const identity = value => typeof value === 'string' && /^[\w:-]{1,64}$/.test(value);
const tick = value => Number.isSafeInteger(value) && value >= 0;
const frequency = value => Number.isSafeInteger(value) && value > 0 && value <= 1e9;

export const EVENT_ACQUISITION_CAPABILITIES = freeze({
  schema: 1,
  target: { game: 'GTA V Enhanced', framework: 'RPH', runtimeVerified: false },
  production: {
    status: 'BLOCKED', nativePrimary: true,
    acquisitionAdapter: 'unavailable', sourceEventTimestamp: 'unavailable',
    selectiveSuppression: 'unverified', restoration: 'unverified',
    mayGenerateDirect: false, mayGenerateReflections: false,
  },
  interfaces: [
    { id: 'ped-shooting-poll', multiplicity: 'unavailable', sourceTimestamp: 'unavailable' },
    { id: 'ped-last-impact-coordinate', eventIdentity: 'unavailable', sourceTimestamp: 'unavailable' },
    { id: 'rph-ped-shot-notification', scope: 'ped-victim-hit-notification',
      runtimeVerified: false, sourceTimestamp: 'unavailable' },
    { id: 'script-event-queue', exactStackSchema: 'unverified', sourceTimestamp: 'unavailable' },
    { id: 'cfx-framework-events', supportedOnTargetRph: false, sourceTimestampAccuracy: 'unverified' },
  ],
});

// Observation is a host acquisition/receipt bracket, not event emission time.
// Unknown event time stays unknown. No poll interval, clock origin or sample
// alignment is inferred. A declared native callback is still receipt evidence.
export function describeAcquisitionTiming(input = {}) {
  const { basis = 'unavailable', acquisitionBeforeQpc = null,
    observationAfterQpc = null, qpcFrequency = null,
    occurrenceLowerQpc = null, occurrenceUpperQpc = null } = input;
  if (!['unavailable', 'native-poll', 'native-callback-receipt', 'authored-fixture-clock'].includes(basis))
    throw Error('Unreviewed event timing basis');
  const observed = acquisitionBeforeQpc !== null || observationAfterQpc !== null || qpcFrequency !== null;
  if (observed && (!tick(observationAfterQpc) || !frequency(qpcFrequency) ||
      acquisitionBeforeQpc !== null && (!tick(acquisitionBeforeQpc) || acquisitionBeforeQpc > observationAfterQpc)))
    throw Error('Ordered acquisition/receipt and explicit QPC frequency required');
  if (basis !== 'authored-fixture-clock' && (occurrenceLowerQpc !== null || occurrenceUpperQpc !== null))
    throw Error('Source event time is unavailable for this acquisition interface');
  if (basis === 'authored-fixture-clock' && (!observed || !tick(occurrenceLowerQpc) ||
      !tick(occurrenceUpperQpc) || occurrenceUpperQpc < occurrenceLowerQpc ||
      occurrenceUpperQpc > observationAfterQpc))
    throw Error('Authored occurrence must precede receipt on its explicit fixture clock');
  return freeze({
    basis, observationClockDomain: observed
      ? basis === 'authored-fixture-clock' ? 'authored-fixture-QPC' : 'host-Stopwatch-QPC'
      : null,
    acquisitionBeforeQpc, observationAfterQpc, qpcFrequency,
    occurrenceLowerQpc, occurrenceUpperQpc,
    occurrenceClockDomain: basis === 'authored-fixture-clock' ? 'authored-fixture-QPC' : null,
    sourceEventTimeAvailable: basis === 'authored-fixture-clock',
    sampleAccurateNativeEvent: false,
  });
}

// This brand expresses an explicit local synthetic experiment, not security or
// proof of native support. Serializing or copying it does not confer authority.
export function createAuthoredFixtureEventCapability({ session } = {}) {
  if (!identity(session)) throw Error('Authored fixture session identity required');
  const capability = freeze({
    schema: 1, session, authority: 'authored-fixture-only', eventKind: 'authored-impulse',
  });
  fixtureCapabilities.add(capability);
  return capability;
}

function decision(status, reasons, timing = null) {
  const admitted = status === 'AUTHORED_FIXTURE_ONLY';
  return freeze({
    status, admitted, reasons, timing,
    mayGenerateDirect: admitted, mayGenerateReflections: admitted,
    nativePrimary: true, nativeSuppressionPermitted: false,
    nativeReplacementPermitted: false, sampleAccurateNativeEvent: false,
  });
}

export function evaluateEventAcquisition(request = {}) {
  if (request.mode === undefined || request.mode === 'production')
    return decision('BLOCKED', [
      'exact-stack-event-acquisition-unverified',
      'native-event-emission-time-unavailable',
      'selective-suppression-and-restoration-unverified',
      'native-remains-primary-no-duplicate-direct-or-reflected-event',
    ]);
  if (request.mode !== 'authored-fixture') return decision('BLOCKED', ['unsupported-mode']);
  if (request.authority !== 'authored-fixture-only' || request.eventKind !== 'authored-impulse')
    return decision('BLOCKED', ['only-original-authored-impulse-fixtures-allowed']);
  const capability = request.fixtureCapability;
  if (!fixtureCapabilities.has(capability) || !identity(request.session) || capability.session !== request.session)
    return decision('BLOCKED', ['matching-branded-fixture-session-required']);
  let timing;
  try { timing = describeAcquisitionTiming(request.timing); }
  catch { return decision('BLOCKED', ['invalid-fixture-timing']); }
  if (timing.basis !== 'authored-fixture-clock' || !timing.sourceEventTimeAvailable)
    return decision('BLOCKED', ['explicit-authored-event-time-required'], timing);
  return decision('AUTHORED_FIXTURE_ONLY', ['synthetic-source-only-no-native-takeover'], timing);
}
