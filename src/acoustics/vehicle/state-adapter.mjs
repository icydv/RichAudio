// Source adapter for the existing telemetry/Core/Model.cs CaptureRecord schema.
// No native calls, host contract changes, audio endpoint, or stock-audio interception.
import { cross, dot, unit, vector } from '../research/local-geometry.mjs';

const check = (condition, message) => { if (!condition) throw Error(message); };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const number = (n, lo, hi, label) => {
  check(Number.isFinite(n) && n >= lo && n <= hi, `invalid ${label}`);
  return n;
};
const identity = (value, label) => {
  check(typeof value === 'string' && /^[\w:.-]{1,128}$/.test(value), `invalid ${label}`);
  return value;
};
function field(value, validate, label) {
  if (value == null || value.status === 'unavailable') return null;
  check(['observed', 'estimated'].includes(value.status), `invalid ${label} status`);
  validate(value.value, label);
  return value.value;
}
const scalar = (value, lo, hi, label) => field(value, n => number(n, lo, hi, label), label);
const integer = (value, lo, hi, label) => field(value, n => {
  number(n, lo, hi, label); check(Number.isInteger(n), `invalid ${label} integer`);
}, label);
function vecField(value, scale, label) {
  const v = field(value, p => {
    check(p && typeof p === 'object', `invalid ${label}`);
    for (const axis of ['x', 'y', 'z']) number(p[axis], -100000, 100000, label);
  }, label);
  return v && vector([v.x * scale, v.y * scale, v.z * scale]);
}
function orientation(value) {
  const q = field(value, p => {
    check(p && ['x', 'y', 'z', 'w'].every(k => Number.isFinite(p[k])), 'invalid quaternion');
    const norm = p.x * p.x + p.y * p.y + p.z * p.z + p.w * p.w;
    check(norm > 0.5 && norm < 1.5, 'invalid quaternion norm');
  }, 'orientation');
  if (!q) return null;
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  const [x, y, z, w] = [q.x / n, q.y / n, q.z / n, q.w / n];
  // Same x-right/y-forward/z-up basis as the existing GTA telemetry quaternion.
  return {
    forward: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    up: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
  };
}

/** Ratio mapping is a configured estimate, never a crankshaft measurement. */
export function estimatedRpmFromRatio(ratio, mapping) {
  const m = validateRpmMapping(mapping);
  number(ratio, 0, 1, 'RPM ratio');
  return m.idleRpm + clamp((ratio - m.ratioAtIdle) / (m.ratioAtRedline - m.ratioAtIdle), 0, 1)
    * (m.redlineRpm - m.idleRpm);
}
function validateRpmMapping(input) {
  check(input && typeof input === 'object', 'explicit RPM mapping required');
  const m = { ratioAtIdle: 0, ratioAtRedline: 1, ...input };
  number(m.idleRpm, 200, 3000, 'idle RPM'); number(m.redlineRpm, m.idleRpm + 100, 24000, 'redline RPM');
  number(m.ratioAtIdle, 0, 0.9, 'idle ratio'); number(m.ratioAtRedline, m.ratioAtIdle + 0.01, 1, 'redline ratio');
  return Object.freeze(m);
}

const layout = {
  mechanical: { offset: [0, 0.35, 0.5], axis: [0, 1, 0], directivity: 0.15 },
  exhaust: { offset: [0, -2, 0.25], axis: [0, -1, 0], directivity: 0.75 },
  intake: { offset: [0, 1.2, 0.65], axis: [0, 1, 0], directivity: 0.55 },
  drivetrain: { offset: [0, -0.4, 0.3], axis: [0, 1, 0], directivity: 0.1 },
  tyres: { offset: [0, 0, 0.15], axis: [0, 1, 0], directivity: 0 },
  aero: { offset: [0, 0.7, 0.8], axis: [0, 1, 0], directivity: 0.25 },
  induction: { offset: [0, 0.35, 0.55], axis: [0, 1, 0], directivity: 0.4 },
  transients: { offset: [0, -2, 0.25], axis: [0, -1, 0], directivity: 0.75 },
};
for (const component of Object.values(layout)) {
  Object.freeze(component.offset); Object.freeze(component.axis); Object.freeze(component);
}
/** Authored example dimensions/radiation, not inferred dimensions of a GTA model. */
export const defaultVehicleLayout = Object.freeze(layout);
export const vehicleComponents = Object.freeze(Object.keys(layout));

/** Per-component ownership/pose hooks for CausalSimulation and SoundMap metadata. */
export function componentEmitters(vehicle, componentLayout = defaultVehicleLayout) {
  identity(vehicle.id, 'vehicle id');
  check(/^[\w:-]{1,48}$/.test(vehicle.id), 'bounded acoustic vehicle id');
  number(vehicle.generation, 1, 4294967295, 'generation');
  check(Number.isInteger(vehicle.generation), 'integer generation');
  const position = vector(vehicle.position), velocity = vector(vehicle.velocity);
  check(Math.hypot(...velocity) <= 100, 'source speed exceeds causal model');
  const forward = unit(vehicle.forward), up = unit(vehicle.up);
  check(Math.abs(dot(forward, up)) < 1e-6, 'orthogonal vehicle basis required');
  const right = unit(cross(forward, up));
  const local = value => value.map((_, i) => right[i] * value[0] + forward[i] * value[1] + up[i] * value[2]);
  return vehicleComponents.map(component => {
    const entry = componentLayout[component];
    check(entry && typeof entry === 'object', `missing ${component} layout`);
    const offset = vector(entry.offset);
    check(Math.hypot(...offset) <= 10, 'bounded vehicle offset');
    const axis = unit(entry.axis);
    // The existing radiation model uses forward/up, so horizontal emitter axes
    // are required here; this avoids fabricating an invalid frame for tilted axes.
    check(Math.abs(axis[2]) < 1e-8, 'horizontal emitter axis required');
    number(entry.directivity, 0, 1, 'component directivity');
    const worldOffset = local(offset);
    const rolling = component === 'tyres' || component === 'aero' || component === 'drivetrain';
    return {
      id: `${vehicle.id}:${component}`, vehicleId: vehicle.id, component,
      generation: vehicle.generation, position: position.map((x, i) => x + worldOffset[i]),
      velocity: [...velocity], forward: unit(local(axis)), up: [...up],
      directivity: entry.directivity, valid: vehicle.valid !== false,
      emitting: vehicle.valid !== false && (rolling ? vehicle.controls.speed > 0.05 ||
        (component === 'drivetrain' && vehicle.controls.engineRunning) : vehicle.controls.engineRunning),
      rights: 'original-generated', layoutBasis: 'authored-profile-estimate',
      velocityBasis: 'rigid-translation; angular-velocity-unavailable',
    };
  });
}

/**
 * Consumes the existing C# JSON schema, with bounded 2 x 8 emitter capacity.
 * Missing census members are not declared despawned. Explicit lifecycle events,
 * changed model/pool counter/tracking id, session changes and expiry retire them.
 * Identical handle reuse with no distinguishing observation remains unknowable.
 */
export class VehicleStateAdapter {
  constructor({ rpmMapping, rpmEstimator = null, maxVehicles = 2, staleAfter = 0.25,
    coordinates = { metresPerUnit: 1, basis: 'assumed-gta-unit-metre' },
    componentLayout = defaultVehicleLayout } = {}) {
    this.rpmMapping = validateRpmMapping(rpmMapping);
    if (rpmEstimator) {
      number(rpmEstimator.wheelRadiusMetres, .2, .6, 'estimated wheel radius');
      number(rpmEstimator.finalDrive, 1, 6, 'estimated final drive');
      check(Array.isArray(rpmEstimator.gearRatios) && rpmEstimator.gearRatios.length >= 1 && rpmEstimator.gearRatios.length <= 12,
        'bounded estimated gear ratios');
      rpmEstimator.gearRatios.forEach(x => number(x, .2, 6, 'estimated gear ratio'));
    }
    this.rpmEstimator = rpmEstimator && Object.freeze(structuredClone(rpmEstimator));
    check(Number.isInteger(maxVehicles) && maxVehicles >= 1 && maxVehicles <= 2, 'two-vehicle source budget');
    number(staleAfter, 0.05, 0.75, 'telemetry expiry');
    number(coordinates.metresPerUnit, 0.001, 100, 'coordinate scale');
    check(['assumed-gta-unit-metre', 'authored-metre-fixture', 'measured-calibration'].includes(coordinates.basis),
      'explicit coordinate basis');
    this.maxVehicles = maxVehicles; this.staleAfter = staleAfter;
    this.coordinates = Object.freeze({ ...coordinates });
    // Validate and copy profile geometry once, before any ownership is created.
    componentEmitters({ id: 'vehicle:1', generation: 1, position: [0, 0, 0], velocity: [0, 0, 0],
      forward: [0, 1, 0], up: [0, 0, 1], controls: { speed: 0, engineRunning: false } }, componentLayout);
    this.componentLayout = structuredClone(componentLayout);
    this.tracks = new Map(); this.nextId = 0; this.session = null;
    this.generation = 0; this.lastTime = -1; this.lastSequence = -1; this.closed = false;
  }
  get activeCount() { return this.tracks.size; }
  update(record, { now = record?.TimestampSeconds } = {}) {
    check(record && record.SchemaVersion === 1, 'telemetry schema version 1 required');
    identity(record.SessionId, 'telemetry session');
    check(['sample', 'capture_stopped'].includes(record.Kind), 'sample or capture_stopped record required');
    const time = number(record.TimestampSeconds, 0, 86400, 'telemetry time');
    number(now, time, time + this.staleAfter, 'fresh receive time');
    check(Number.isSafeInteger(record.Sequence) && record.Sequence >= 0, 'telemetry sequence');
    const changed = record.SessionId !== this.session;
    check(changed || !this.closed, 'capture is closed; a new session is required');
    check(changed || (record.Sequence > this.lastSequence &&
      (time > this.lastTime || (record.Kind === 'capture_stopped' && time === this.lastTime))),
    'out-of-order telemetry');
    check(Array.isArray(record.Vehicles) && record.Vehicles.length <= 64, 'bounded telemetry vehicle list');
    check(Array.isArray(record.Events) && record.Events.length <= 256, 'bounded lifecycle event list');
    const seen = new Set();
    // Validate before changing ownership, so rejected packets cannot reset audio.
    const candidates = record.Vehicles.map(v => {
      identity(v.Token, 'vehicle token'); identity(v.TrackingId, 'tracking id');
      check(!seen.has(v.Token), 'duplicate vehicle token'); seen.add(v.Token);
      const sampleTime = scalar(v.SampleTimestamp, 0, 86400, 'vehicle sample time');
      check(sampleTime === null || Math.abs(sampleTime - time) < 1e-6,
        'vehicle sample timestamp does not match capture');
      const engine = field(v.EngineRunning, b => check(typeof b === 'boolean', 'engine boolean'), 'engine');
      const pose = orientation(v.Orientation);
      const velocity = vecField(v.Velocity, this.coordinates.metresPerUnit, 'velocity');
      if (velocity) check(Math.hypot(...velocity) <= 100, 'source speed exceeds causal model');
      return { raw: v, token: v.Token, trackingId: v.TrackingId,
        model: integer(v.Model, 0, 4294967295, 'model'),
        poolCounter: integer(v.PoolCounter, 0, 2147483647, 'pool counter'),
        poolHandle: integer(v.PoolHandle, 0, 4294967295, 'pool handle'),
        position: vecField(v.Position, this.coordinates.metresPerUnit, 'position'), velocity, pose,
        ratio: scalar(v.RpmRatio, 0, 1, 'RPM ratio'), gear: integer(v.Gear, -1, 12, 'gear'), engine,
        player: v.PlayerVehicle?.status === 'observed' && v.PlayerVehicle.value === true };
    });
    for (const event of record.Events) {
      identity(event.Token, 'event token'); identity(event.TrackingId, 'event tracking id');
      check(typeof event.Kind === 'string' && event.Kind.length <= 64, 'event kind');
      number(event.Time, 0, time, 'event time');
    }
    const retired = [], unavailable = [];
    const retire = (token, reason) => {
      const old = this.tracks.get(token);
      if (old) { retired.push({ id: old.id, generation: old.generation, token, reason }); this.tracks.delete(token); }
    };
    if (changed) {
      for (const token of this.tracks.keys()) retire(token, 'session-changed');
      this.session = record.SessionId; this.generation++; this.closed = false;
    }
    this.lastTime = time; this.lastSequence = record.Sequence;
    for (const event of record.Events) {
      if (['tracking_termination', 'despawn_or_stream_out', 'invalid_entity'].includes(event.Kind) &&
        this.tracks.get(event.Token)?.trackingId === event.TrackingId) retire(event.Token, event.Kind);
    }
    for (const [token, track] of this.tracks) if (now - track.time > this.staleAfter) retire(token, 'observation-expired');
    if (record.Kind === 'capture_stopped') {
      for (const token of this.tracks.keys()) retire(token, 'capture-stopped');
      this.closed = true;
      return this.result(time, [], retired, unavailable);
    }
    // Stable incumbents retain ownership; new player/nearby entries fill free slots.
    // No frame-to-frame loudness churn or source history reset is used for ranking.
    candidates.sort((a, b) => Number(this.tracks.has(b.token)) - Number(this.tracks.has(a.token)) ||
      Number(b.player) - Number(a.player) || a.token.localeCompare(b.token));
    const vehicles = [];
    for (const c of candidates) {
      let old = this.tracks.get(c.token);
      const changedValue = key => old?.[key] != null && c[key] != null && old[key] !== c[key];
      const dt = old ? time - old.time : 0;
      const jump = old && c.position && c.pose && dt > 0 &&
        (Math.hypot(...c.position.map((x, i) => x - old.position[i])) / dt > 100 + 1e-6 ||
          dot(c.pose.forward, old.forward) < -0.99 || dot(c.pose.up, old.up) < -0.99);
      if (old && (old.trackingId !== c.trackingId || changedValue('model') || changedValue('poolCounter') ||
        changedValue('poolHandle') || jump)) { retire(c.token, jump ? 'pose-discontinuity' : 'identity-replaced'); old = null; }
      if (!c.position || !c.velocity || !c.pose) {
        unavailable.push({ token: c.token, reason: 'position-velocity-or-orientation-unavailable' }); continue;
      }
      if (!old && this.tracks.size >= this.maxVehicles) {
        unavailable.push({ token: c.token, reason: 'bounded-source-capacity' }); continue;
      }
      if (!old) check(this.nextId < 1000000, 'source lifetime generation budget exhausted');
      // Renderer rings are registered once. Reuse one bounded slot identity and
      // advance only its generation; other vehicles retain their PCM histories.
      const occupied = new Set([...this.tracks.values()].map(t => t.id));
      let slot = 1;
      while (occupied.has(`vehicle:${slot}`)) slot++;
      const id = old?.id ?? `vehicle:${slot}`, generation = old?.generation ?? ++this.nextId;
      const speed = Math.hypot(...c.velocity), estimate = this.rpmEstimator;
      // Live demonstrations deliberately do not trust an unvalidated RPM getter.
      // Wheel radius, final drive and gear ratios are authored profile estimates.
      const ratio = estimate?.gearRatios[Math.max(0, (c.gear ?? 1) - 1)] ?? estimate?.gearRatios.at(-1);
      const rpm = estimate ? clamp(speed / (2 * Math.PI * estimate.wheelRadiusMetres) * 60 * estimate.finalDrive * ratio,
        this.rpmMapping.idleRpm, this.rpmMapping.redlineRpm) : c.ratio === null ? null : estimatedRpmFromRatio(c.ratio, this.rpmMapping);
      const running = c.engine === true && rpm !== null;
      const usablePair = old && dt > 0 && dt <= 0.25 && old.gear === c.gear;
      const rpmRise = usablePair && old.estimatedRpm !== null && rpm !== null ? (rpm - old.estimatedRpm) / dt : 0;
      const acceleration = usablePair ? dot(c.velocity.map((x, i) => (x - old.velocity[i]) / dt), c.pose.forward) : 0;
      // A bounded timbral proxy, explicitly not torque/load measurement. A gear
      // change suppresses derivatives; a shift RPM fall is not called throttle lift.
      const load = running ? clamp(0.16 + 0.4 * clamp(acceleration / 6, 0, 1) +
        0.35 * clamp(rpmRise / 4000, 0, 1), 0.08, 0.91) : 0;
      const controls = { estimatedRpm: rpm ?? 0, load, throttle: load, speed, gear: c.gear ?? 0,
        engineRunning: running, overrun: false, roadSurface: 'asphalt' };
      const vehicle = { id, generation, token: c.token, trackingId: c.trackingId,
        model: c.model ?? old?.model ?? null, poolCounter: c.poolCounter ?? old?.poolCounter ?? null,
        poolHandle: c.poolHandle ?? old?.poolHandle ?? null, time, gear: c.gear,
        estimatedRpm: rpm, position: c.position, velocity: c.velocity, ...c.pose, valid: true, controls,
        provenance: {
          rpm: { status: rpm === null ? 'unavailable' : 'estimated', value: rpm,
            basis: estimate ? 'configured-speed-gear-estimate; not measured crankshaft RPM; stationary revs unavailable' :
              'configured-normalised-ratio-mapping; not crankshaft RPM', mapping: this.rpmMapping,
            ...(estimate ? { parameters: estimate, normalisedGetterUsed: false, observedGearAvailable: c.gear !== null } : {}) },
          load: { status: 'estimated', basis: 'bounded acceleration/RPM-rise timbral proxy; uncalibrated; ignores grade, drag and braking' },
          throttle: { status: 'estimated', basis: 'load-proxy; no throttle getter in current telemetry' },
          overrun: { status: 'unavailable', basis: 'disabled; deceleration alone does not establish throttle lift or fuel state' },
          roadSurface: { status: 'assumed', basis: 'asphalt; current vehicle telemetry has no surface field' },
          coordinates: this.coordinates, engineRunning: c.raw.EngineRunning?.status ?? 'unavailable',
          identity: 'session tracking, model and pool evidence; undetectable same-token/same-counter reuse remains possible',
        } };
      // Returned control snapshots belong to the caller. Keep our continuity and
      // ownership state independent of later mutation by a source worker.
      this.tracks.set(c.token, structuredClone(vehicle)); vehicles.push(vehicle);
    }
    return this.result(time, vehicles, retired, unavailable);
  }
  result(time, vehicles, retired, unavailable) {
    return { time, session: this.session, generation: this.generation, vehicles,
      sources: vehicles.flatMap(v => componentEmitters(v, this.componentLayout)), retired, unavailable,
      diagnostics: { activeVehicles: this.activeCount, maxVehicles: this.maxVehicles,
        maximumEmitters: this.maxVehicles * vehicleComponents.length,
        throttleObserved: false, loadObserved: false, stockAudioReplacement: false } };
  }
}
