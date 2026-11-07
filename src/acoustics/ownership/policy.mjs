// Offline policy prototype only. No native adapter or runtime enable path.
// A fixture certificate describes assumptions, never GTA capabilities.
export const nativeAudioOwnership = Object.freeze({
  enabled: false, status: 'BLOCKED', verifiedMechanisms: 0,
  reason: 'No verified per-instance engine/exhaust suppression and independent recovery contract'
});
export const takeoverComponents = Object.freeze(['engine', 'exhaust']);
export const retainedNativeComponents = Object.freeze([
  'horn', 'tyres', 'road-contact', 'collision', 'damage', 'doors', 'alarms',
  'radio', 'pedestrians', 'traffic', 'ambience', 'transmission', 'induction', 'turbo', 'backfire'
]);
export const requiredEvidence = Object.freeze([
  'perInstance', 'componentIsolation', 'baselineReadback', 'knownRestoration',
  'unrelatedComponentsPreserved', 'exclusiveHandoff', 'independentRecovery', 'observableResult'
]);
const freezeDeep = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
};
const frozen = value => freezeDeep(structuredClone(value));
const identityKey = id => JSON.stringify([id.session, id.handle, id.generation, id.model]);
const validIdentity = id => id && typeof id.session === 'string' && /^[\w:-]{1,64}$/.test(id.session) &&
  Number.isSafeInteger(id.handle) && id.handle > 0 && Number.isSafeInteger(id.generation) && id.generation > 0 &&
  Number.isSafeInteger(id.model) && id.model === 0xf9300cc5; // Bati only, not model-based identity.
const validTime = n => Number.isSafeInteger(n) && n >= 0;

export class OfflineOwnershipPolicy {
  constructor({identity, build, ttlFrames = 96, mode = 'disabled'} = {}) {
    if (!validIdentity(identity) || typeof build !== 'string' || !build || !Number.isSafeInteger(ttlFrames) || ttlFrames < 1 ||
      !['disabled', 'authored-fixture'].includes(mode)) throw Error('Invalid offline ownership configuration');
    this.identity = frozen(identity); this.build = build; this.ttl = ttlFrames; this.mode = mode;
    this.state = 'NativeOnly'; this.reason = null; this.time = -1; this.observed = -1; this.eligible = false;
    this.baseline = null; this.expires = -1; this.transaction = 0; this.pending = null;
    this.nativeState = 'unchanged'; this.history = ['NativeOnly'];
  }
  matches(identity) { return validIdentity(identity) && identityKey(identity) === identityKey(this.identity); }
  advance(frame) {
    if (!validTime(frame) || frame < this.time) throw Error('Non-monotonic ownership clock');
    this.time = frame;
  }
  move(state, reason = null) { this.state = state; this.reason = reason; this.history.push(state); }
  observe({identity, acquiredFrame, receivedFrame, eligible = true}) {
    if (!this.matches(identity) || typeof eligible !== 'boolean' || !validTime(acquiredFrame) || !validTime(receivedFrame) || receivedFrame < this.time ||
      acquiredFrame > receivedFrame || acquiredFrame <= this.observed || receivedFrame - acquiredFrame >= this.ttl) return false;
    this.advance(receivedFrame); this.observed = acquiredFrame; this.eligible = eligible;
    if (!eligible) { this.stop({identity, frame: receivedFrame, reason: 'source-scope-lost'}); return false; }
    return true;
  }
  prepare({identity, frame, replacementHealthy, baseline, certificate}) {
    if (!this.matches(identity) || !validTime(frame) || frame < this.time || this.state !== 'NativeOnly') return false;
    this.advance(frame);
    const validCertificate = this.mode === 'authored-fixture' && certificate?.kind === 'authored-fixture-assumptions' &&
      certificate.build === this.build && Array.isArray(certificate.components) && certificate.components.length === 2 &&
      takeoverComponents.every(c => certificate.components.includes(c)) && requiredEvidence.every(k => certificate[k] === true);
    if (!validCertificate) { this.reason = 'unverified-native-capability'; return false; }
    if (replacementHealthy !== true || this.eligible !== true || this.observed < 0 || frame - this.observed >= this.ttl ||
      baseline?.kind !== 'authored-exact-profile' || baseline.known !== true || typeof baseline.profile !== 'string' || !baseline.profile ||
      baseline.identityKey !== identityKey(this.identity)) { this.reason = 'replacement-or-baseline-unavailable'; return false; }
    this.baseline = frozen(baseline); this.expires = frame + this.ttl; this.move('Prepared'); return true;
  }
  takeover({identity, frame}) {
    if (!this.matches(identity) || this.state !== 'Prepared' || this.pending || !validTime(frame) || frame < this.time) return null;
    this.advance(frame);
    if (!this.eligible || frame >= this.expires || frame - this.observed >= this.ttl) { this.move('NativeOnly', 'prepared-expired'); return null; }
    // A command is only a request. Until independently acknowledged, output is unknown.
    this.pending = frozen({id: ++this.transaction, action: 'exclusive-handoff', identity: this.identity,
      components: takeoverComponents, baseline: this.baseline, deadlineFrame: this.expires});
    this.nativeState = 'handoff-pending'; return this.pending;
  }
  acknowledge({identity, frame, transaction, kind, nativeSuppressed, replacementAudible, unrelatedPreserved, nativeRestored}) {
    if (!this.matches(identity) || !this.pending || transaction !== this.pending.id || !validTime(frame) || frame < this.time) return false;
    this.advance(frame);
    if (this.pending.action === 'exclusive-handoff') {
      if (!this.eligible || frame >= this.expires || frame - this.observed >= this.ttl || kind !== 'independent-fixture-measurement' ||
        nativeSuppressed !== true || replacementAudible !== true || unrelatedPreserved !== true) {
        this.stop({identity, frame, reason: 'handoff-not-verified'}); return false;
      }
      this.pending = null; this.nativeState = 'fixture-suppressed'; this.move('RichAudioOwned'); return true;
    }
    if (this.state !== 'Restoring' || frame >= this.pending.deadlineFrame || kind !== 'independent-fixture-measurement' || nativeRestored !== true || unrelatedPreserved !== true) {
      this.pending = null; this.nativeState = 'unknown'; this.move('Failed', 'restoration-not-verified'); return false;
    }
    this.pending = null; this.nativeState = 'restored'; this.move('NativeOnly'); return true;
  }
  stop({identity, frame, reason = 'normal-stop', entityExists = true} = {}) {
    if (!this.matches(identity) || !validTime(frame) || frame < this.time) return null;
    this.advance(frame);
    if (!entityExists || ['source-scope-lost', 'vehicle-switch', 'entity-lost'].includes(reason)) this.eligible = false;
    if (!entityExists && (this.pending || this.state === 'RichAudioOwned')) {
      this.pending = null; this.nativeState = 'unknown'; this.move('Failed', 'entity-unavailable-no-restore-write'); return null;
    }
    if (this.state === 'Failed' || this.state === 'Restoring') return this.pending;
    if (this.state === 'NativeOnly') return null;
    if (!this.pending && this.state === 'Prepared') { this.move('NativeOnly', reason); return null; }
    if (!entityExists) { this.pending = null; this.nativeState = 'unknown'; this.move('Failed', 'entity-unavailable-no-restore-write'); return null; }
    this.move('Restoring', reason); this.nativeState = 'unknown';
    this.pending = frozen({id: ++this.transaction, action: 'restore-exact-baseline', identity: this.identity,
      components: takeoverComponents, baseline: this.baseline, deadlineFrame: frame + this.ttl});
    return this.pending;
  }
  health({identity, frame, replacementHealthy = true, sourceEligible = true, entityExists = true, nativeOverlap = false}) {
    if (!this.matches(identity) || !validTime(frame) || frame < this.time) return null;
    this.advance(frame);
    if (!sourceEligible || !entityExists) this.eligible = false;
    if (!entityExists && this.state === 'Restoring') return this.stop({identity, frame, entityExists});
    if (this.state === 'Restoring' && frame >= this.pending.deadlineFrame) {
      this.pending = null; this.nativeState = 'unknown'; this.move('Failed', 'restoration-timeout'); return null;
    }
    if (!['Prepared', 'RichAudioOwned'].includes(this.state)) return null;
    const expired = frame >= this.expires || frame - this.observed >= this.ttl;
    if (!entityExists || !sourceEligible || !replacementHealthy || nativeOverlap || expired)
      return this.stop({identity, frame, entityExists, reason: !sourceEligible ? 'source-scope-lost' :
        !replacementHealthy ? 'replacement-failed' : nativeOverlap ? 'native-overlap' : expired ? 'lease-or-observation-expired' : 'entity-lost'});
    return null;
  }
  snapshot() {
    return frozen({mode: this.mode, state: this.state, reason: this.reason, identity: this.identity, sourceEligible: this.eligible,
      nativeState: this.nativeState, pending: this.pending, history: this.history,
      replacementPermitted: this.state === 'RichAudioOwned', nativeRecoveryVerified: this.nativeState === 'restored'});
  }
}
