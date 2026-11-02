// Test-only hypothetical backend. GTA has NOT supplied these capabilities.
// One selector controls both copies on one sample clock. No game/output APIs.
export const required = Object.freeze([
  'perInstance', 'componentIsolation', 'nativeReadback', 'restoreKnownState',
  'atomicSelector', 'independentExpiry'
]);
export const key = id => JSON.stringify([id.epoch, id.handle, id.generation, id.component]);
const validIdentity = id => id && typeof id.epoch === 'string' && id.epoch.length > 0 &&
  Number.isSafeInteger(id.handle) && id.handle > 0 && Number.isSafeInteger(id.generation) &&
  id.generation > 0 && typeof id.component === 'string' && id.component.length > 0;

export class OwnershipSimulation {
  constructor(identity, build, ttlFrames = 96) {
    if (!validIdentity(identity) || !Number.isSafeInteger(ttlFrames) || ttlFrames <= 0) throw Error('invalid fixture');
    this.identity = Object.freeze({...identity}); this.build = build; this.ttl = ttlFrames;
    this.state = 'NativeOnly'; this.selected = 'native'; this.reason = null;
    this.now = -1; this.expires = -1; this.observed = -1; this.ready = false;
    this.history = ['NativeOnly'];
  }
  setState(state) { this.state = state; this.history.push(state); }
  matches(id) { return validIdentity(id) && key(id) === key(this.identity); }
  observe(id, acquiredFrame, receivedFrame, valid = true) {
    if (!this.matches(id) || !Number.isSafeInteger(acquiredFrame) || !Number.isSafeInteger(receivedFrame) ||
      acquiredFrame < 0 || receivedFrame < this.now || acquiredFrame > receivedFrame ||
      acquiredFrame <= this.observed || receivedFrame - acquiredFrame >= this.ttl) return false;
    if (!valid) { this.stop('source_invalid'); return false; }
    this.now = receivedFrame; this.observed = acquiredFrame; return true;
  }
  prepare(id, capabilities, ready, frame) {
    if (!this.matches(id) || this.state !== 'NativeOnly' || !Number.isSafeInteger(frame) || frame < this.now) return false;
    if (capabilities?.build !== this.build || !required.every(c => capabilities[c] === true)) {
      this.reason = 'unsupported_capability'; return false;
    }
    if (!ready || this.observed < 0 || frame < this.observed || frame - this.observed >= this.ttl) {
      this.reason = 'replacement_or_telemetry_unavailable'; return false;
    }
    this.now = frame; this.ready = true; this.expires = frame + this.ttl; this.setState('Prepared'); return true;
  }
  begin(id) {
    if (!this.matches(id) || this.state !== 'Prepared') return false;
    this.setState('Transitioning'); return true;
  }
  confirmExclusive(id, frame, proof) {
    if (!this.matches(id) || this.state !== 'Transitioning' || !Number.isSafeInteger(frame) ||
      frame < this.now || frame < this.observed || frame >= this.expires || frame - this.observed >= this.ttl || !this.ready ||
      !proof?.nativeSuppressionConfirmed || !proof?.replacementReady) {
      if (this.matches(id)) this.stop('handoff_unconfirmed'); return false;
    }
    // Atomic operation belongs solely to this simulated common backend.
    this.now = frame; this.selected = 'owned'; this.setState('RichAudioOwned'); return true;
  }
  stop(reason = 'normal_stop') {
    this.selected = 'native'; this.ready = false; this.reason = reason;
    this.setState('Restoring');
  }
  confirmRestoration(verified) {
    if (this.state !== 'Restoring') return false;
    this.setState(verified ? 'NativeOnly' : 'Failed'); return verified;
  }
  weights(frame, {rendererHealthy = true, nativeStillAudible = false, sourceExists = true} = {}) {
    if (!Number.isSafeInteger(frame) || frame < this.now) throw Error('invalid sample clock');
    this.now = frame;
    if (!sourceExists) {
      if (this.selected === 'owned' || this.state === 'Prepared' || this.state === 'Transitioning') this.stop('source_disappeared');
      return {native: 0, owned: 0}; // No continuing ghost of an absent entity.
    }
    if (this.selected === 'owned' && (!rendererHealthy || nativeStillAudible ||
      frame >= this.expires || frame - this.observed >= this.ttl)) {
      this.stop(nativeStillAudible ? 'native_overlap' : !rendererHealthy ? 'renderer_failed' : 'lease_or_telemetry_expired');
    }
    if ((this.state === 'Prepared' || this.state === 'Transitioning') && frame >= this.expires) this.stop('handoff_timeout');
    // Failed does not mean the real native setting was restored. Test backend
    // still owns this selector; only an explicit ack can certify restoration.
    return {native: this.selected === 'native' ? 1 : 0, owned: this.selected === 'owned' ? 1 : 0};
  }
}
