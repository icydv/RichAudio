// One authorised original vehicle, eight independent PCM histories, no device IO.
import { VehicleStateAdapter, vehicleComponents } from './state-adapter.mjs';
import { vehicleProfiles } from './profiles.mjs';
import { VehicleSynthesizer, createVehicleBuffers } from './synthesizer.mjs';
import { cross, dot, unit, vector } from '../research/local-geometry.mjs';

export const vehicleLiveSourceIds = Object.freeze(vehicleComponents.map(name => `vehicle:1:${name}`));
export const vehicleLiveProfiles = Object.freeze({ v12: vehicleProfiles.hypercarV12, v8: vehicleProfiles.roadV8 });
export const vehicleLiveEstimatorParameters = Object.freeze({ wheelRadiusMetres: .34, finalDrive: 3.4,
  gearRatios: Object.freeze([3.1, 2.15, 1.62, 1.26, 1.02, .84, .7, .6]) });
const check = (ok, message) => { if (!ok) throw Error(message); };
const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
const observed = value => value == null ? { status: 'unavailable' } : { status: 'observed', value };
const xyz = v => ({ x: v[0], y: v[1], z: v[2] });
function quaternion(forward, up) {
  const r = cross(forward, up), m = [r[0], forward[0], up[0], r[1], forward[1], up[1], r[2], forward[2], up[2]];
  const trace = m[0] + m[4] + m[8]; let x, y, z, w, s;
  if (trace > 0) { s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; x = s / 4; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s; }
  else if (m[4] > m[8]) { s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = s / 4; z = (m[5] + m[7]) / s; }
  else { s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = s / 4; }
  return { x, y, z, w };
}
export function vehicleEvidenceRecord(s) {
  const time = s.observationTicks / s.clockFrequency;
  return { SchemaVersion: 1, SessionId: s.session, Kind: s.action === 'remove' ? 'capture_stopped' : 'sample',
    TimestampSeconds: time, Sequence: s.sequence, Events: [], Vehicles: s.action === 'remove' ? [] : [{
      Token: s.vehicleId, TrackingId: `${s.vehicleId}:${s.generation}`, SampleTimestamp: observed(time),
      Model: observed(s.model), PoolHandle: observed(null), PoolCounter: observed(null), PlayerVehicle: observed(true),
      Position: observed(xyz(s.position)), Velocity: observed(xyz(s.velocity)), Orientation: observed(quaternion(s.forward, s.up)),
      RpmRatio: observed(s.rpmRatio), Gear: observed(s.gear), EngineRunning: observed(s.engineRunning),
    }] };
}

export class LiveVehicleSource {
  constructor({ profile = 'v12', maxTransitMs = 10, predictionSeconds = .1, rpmEstimator = vehicleLiveEstimatorParameters } = {}) {
    check(profile in vehicleLiveProfiles && finite(maxTransitMs, 0, 10) && finite(predictionSeconds, .05, .1), 'explicit live vehicle profile/transit/prediction bound');
    check(rpmEstimator&&typeof rpmEstimator==='object','live bounded speed/gear estimator is required');
    this.profile = vehicleLiveProfiles[profile]; this.profileKey = profile; this.maxTransitMs = maxTransitMs;
    this.predictionSeconds=predictionSeconds;this.poseKeys=[];
    this.rpmEstimator=structuredClone(rpmEstimator);
    this.buffers = createVehicleBuffers(512); this.inputs = Object.fromEntries(vehicleComponents.map(n => [`vehicle:1:${n}`, this.buffers.layers[n]]));
    this.generation = 1; this.last = null; this.active = null; this.retired = false; this.sources = [];
    this.stats = { accepted: 0, removals: 0, expired: 0, synthesisMs: 0, maximumSynthesisMs: 0 };
    this.ratioEvidence = { count: 0, minimum: null, maximum: null, changedSamples: 0, previous: null,
      meaning: 'normalised getter, not measured crankshaft RPM; gameplay validation pending', usedForControl: false };
    this.resetAdapter();
  }
  resetAdapter() {
    this.adapter = new VehicleStateAdapter({ maxVehicles: 1, rpmMapping: { idleRpm: this.profile.idleRpm, redlineRpm: this.profile.redlineRpm },
      rpmEstimator: this.rpmEstimator,
      componentLayout: this.profile.components });
    this.synthesizer = new VehicleSynthesizer(this.profile);
  }
  accept(message, { now, receiptNowMs } = {}) {
    const s = message?.state;
    check(message?.type === 'vehicle' && s?.version === 1 && finite(now, 0, 86400) && finite(receiptNowMs, 0, 1e12) &&
      finite(message.receiptAgeMs, 0, 250 - this.maxTransitMs), 'fresh bounded vehicle envelope required');
    check(/^[a-f0-9]{32}$/.test(s.session) && Number.isSafeInteger(s.listenerGeneration) && s.listenerGeneration > 0 &&
      Number.isSafeInteger(s.generation) && s.generation > 0 && s.generation <= 0xffffffff &&
      Number.isSafeInteger(s.sequence) && s.sequence >= 0 && Number.isSafeInteger(s.observationTicks) && s.observationTicks >= 0 &&
      Number.isSafeInteger(s.clockFrequency) && s.clockFrequency > 0 && s.clockFrequency <= 1e10, 'vehicle identity/clock bounds');
    check(s.rights === 'original-generated' && s.coordinates === 'gta-native-unscaled' && s.units === 'native-unverified' &&
      s.profile === this.profile.id && ['update', 'remove'].includes(s.action) && typeof s.valid === 'boolean' &&
      /^[\w:.-]{1,64}$/.test(s.vehicleId), 'vehicle ownership/profile/identity');
    const old = this.last?.state, changing = old && (s.session !== old.session || s.listenerGeneration !== old.listenerGeneration);
    check(!old || changing || (s.sequence > old.sequence && s.observationTicks > old.observationTicks &&
      s.clockFrequency === old.clockFrequency && s.generation >= old.generation), 'vehicle replay or clock/generation rollback');
    if (s.action === 'update') {
      check(s.valid && finite(s.model, 0, 0xffffffff) && Number.isInteger(s.model) && typeof s.engineRunning === 'boolean' &&
        (s.rpmRatio === null || finite(s.rpmRatio, 0, 1)) &&
        (s.gear === null || (Number.isInteger(s.gear) && s.gear >= -1 && s.gear <= 12)), 'vehicle operating evidence');
      const position = vector(s.position), velocity = vector(s.velocity), forward = unit(s.forward), up = unit(s.up);
      check(Math.hypot(...velocity) <= 100 && Math.abs(dot(forward, up)) < 1e-6 && finite(s.speed, 0, 100), 'vehicle pose/speed');
      check(!old || changing || s.generation !== old.generation || s.vehicleId === old.vehicleId, 'vehicle identity changed without generation');
      const replacing = !this.active || changing || s.generation !== old?.generation || s.vehicleId !== old?.vehicleId;
      if (replacing) this.resetAdapter();
      // QPC has an arbitrary origin; CaptureRecord times are session-relative.
      const origin = replacing ? s.observationTicks : this.origin;
      const record = vehicleEvidenceRecord({ ...s, position, velocity, forward, up, observationTicks: s.observationTicks - origin });
      const adapted = this.adapter.update(record);
      check(adapted.vehicles.length === 1, 'one usable player vehicle required');
      if (replacing) { this.generation++; this.origin = origin;
        this.presentationOrigin=now-(message.receiptAgeMs+this.maxTransitMs)/1000;this.poseKeys=[]; }
      else if(adapted.vehicles[0].generation!==this.active.generation){
        // The original adapter can detect a pose discontinuity even when a
        // native handle and generation remain unchanged. Retire that history.
        this.generation++;this.synthesizer=new VehicleSynthesizer(this.profile);this.poseKeys=[];
      }
      this.active = adapted.vehicles[0]; this.sources = adapted.sources; this.retired = false;
      this.poseKeys.push({time:this.presentationOrigin+(s.observationTicks-this.origin)/s.clockFrequency,sources:adapted.sources});
      while(this.poseKeys.length>16)this.poseKeys.shift();
      if (s.rpmRatio !== null) {
        const e = this.ratioEvidence; e.count++; e.minimum = Math.min(e.minimum ?? s.rpmRatio, s.rpmRatio); e.maximum = Math.max(e.maximum ?? s.rpmRatio, s.rpmRatio);
        if (e.previous !== null && Math.abs(e.previous - s.rpmRatio) > 1e-4) e.changedSamples++;
        e.previous = s.rpmRatio;
      }
    } else this.stop('explicit-remove');
    this.last = { state: structuredClone(s), receiptAgeMs: message.receiptAgeMs + this.maxTransitMs, receiptNowMs, now };
    this.stats.accepted++;
    return this.diagnostics();
  }
  stop(reason = 'producer-stop') {
    if (!this.retired) { this.generation++; this.stats.removals++; this.retired = true; }
    this.active = null; this.stopReason = reason;
    for (const input of Object.values(this.inputs)) input.fill(0);
    this.buffers.mixed.fill(0);
  }
  render({ now, receiptNowMs, frames = 512 } = {}) {
    check(finite(now, 0, 86400) && finite(receiptNowMs, 0, 1e12) && frames === 512, 'vehicle render clock/block');
    const age = this.last ? (this.last.receiptAgeMs + receiptNowMs - this.last.receiptNowMs) / 1000 : 0;
    check(age >= 0, 'vehicle receive clock reversed');
    if (this.active && age > .25) { this.stats.expired++; this.stop('vehicle-observation-expired'); }
    if (this.active) {
      const start = performance.now(); this.synthesizer.renderInto(this.active.controls, this.buffers);
      const elapsed = performance.now() - start; this.stats.synthesisMs += elapsed; this.stats.maximumSynthesisMs = Math.max(this.stats.maximumSynthesisMs, elapsed);
    } else for (const input of Object.values(this.inputs)) input.fill(0);
    // Establish the source-QPC/PCM-clock relation once per ownership lifetime.
    // Re-anchoring on each arrival turns native credit bursts into motion jumps.
    // Retain at most16 genuine timestamped poses and interpolate only available
    // evidence. Beyond the newest key, predict at most100ms (no buffering and
    // still independently subject to the unchanged250ms wall freshness gate).
    const before=[...this.poseKeys].reverse().find(k=>k.time<=now)??this.poseKeys[0],
      after=this.poseKeys.find(k=>k.time>now),span=before&&after&&after.time>before.time?after.time-before.time:0,
      blend=span?Math.max(0,Math.min(1,(now-before.time)/span)):0,
      predict=before&&!span?Math.min(Math.max(0,now-before.time),this.predictionSeconds):0;
    const byId = new Map((before?.sources??this.sources).map(s => [s.id, s])), nextById = new Map((after?.sources??[]).map(s=>[s.id,s]));
    const sources = vehicleLiveSourceIds.map(id => {
      const s = byId.get(id),next=nextById.get(id),mix=(a,b)=>a.map((x,i)=>x+(b[i]-x)*blend);
      const forward=span?unit(mix(s.forward,next.forward)):s?.forward??[0,1,0],upMix=span?mix(s.up,next.up):s?.up??[0,0,1],
        up=unit(upMix.map((x,i)=>x-forward[i]*dot(upMix,forward)));
      return { id, rights: 'original-generated', reference: 'vehicle-live-01', generation: this.generation,
        positionNative: span?mix(s.position,next.position):s?s.position.map((x,i)=>x+s.velocity[i]*predict):[0,0,0],
        velocityNative: span?s.position.map((x,i)=>(next.position[i]-x)/span):s?.velocity??[0,0,0],forwardNative:forward,upNative:up,
        directivity: s?.directivity ?? 0, valid: Boolean(this.active), emitting: Boolean(this.active && s?.emitting), vehicle: true };
    });
    const components = {};
    for (const name of vehicleComponents) {
      let peak = 0, energy = 0;
      for (const value of this.buffers.layers[name]) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      components[name] = { peak, energy };
    }
    return { inputs: this.inputs, vehicleSources: this.last ? { session: this.last.state.session, listenerGeneration: this.last.state.listenerGeneration,
      sequence: this.last.state.sequence, ageSeconds: age, sources } : null,
      diagnostics: { ...this.diagnostics(), components } };
  }
  diagnostics() {
    return { profile: this.profile.id, active: Boolean(this.active), generation: this.generation, sourceCount: this.active ? 8 : 0,
      estimatedRpm: this.active?.controls.estimatedRpm ?? 0, load: this.active?.controls.load ?? 0,
      provenance: this.active?.provenance ?? null, ratioEvidence: { ...this.ratioEvidence },
      stopReason: this.stopReason ?? null, stockAudioMode: 'additive-experimental-playback',
      sourcePresentation:{basis:'one-fixed-QPC-to-PCM-clock-relation-per-ownership',maximumPredictionSeconds:this.predictionSeconds,
        retainedPoses:this.poseKeys.length,maximumRetainedPoses:16,addedBufferSeconds:0,wallFreshnessSeconds:.25},
      synthesizer: { ...this.buffers.diagnostics, ...this.synthesizer.stats }, ...this.stats };
  }
}
