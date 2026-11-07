// Original procedural pressure signals. Exterior emission enters the existing
// propagation renderer once; rider turbulence is a local stereo input and has
// no world position, reflection paths or Doppler resampler.
const FS = 48000;
const REF = 70 * .44704;
const check = (ok, message) => { if (!ok) throw Error(`Airflow ${message}`); };
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function airflowSpeedStreet01(velocity, airVelocity = [0, 0, 0]) {
  check(vector(velocity) && vector(airVelocity) && Math.hypot(...velocity) <= 100 && Math.hypot(...airVelocity) <= 100, 'bounded observed velocity required');
  return Math.hypot(...velocity.map((x, i) => x - airVelocity[i]));
}
export function airflowSeedStreet01(identity) {
  check(typeof identity === 'string' && identity.length > 0 && identity.length <= 256, 'source identity required');
  let x = 2166136261;
  for (let i = 0; i < identity.length; i++) x = Math.imul(x ^ identity.charCodeAt(i), 16777619);
  return x >>> 0 || 1;
}
class Texture {
  constructor(seed) { this.random = seed >>> 0 || 1; this.low = 0; this.high = 0; this.buffet = 0; this.slow = 0; }
  next(cutoff) {
    let x = this.random; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.random = x >>> 0;
    const n = this.random / 2147483648 - 1;
    this.low += .015 * (n - this.low);
    this.high += cutoff * (n - this.high);
    this.buffet += .0007 * (n - this.buffet);
    this.slow += .0001 * (n - this.slow);
    // A broad continuous band with restrained, nonperiodic low-rate modulation.
    return (this.high - this.low) * (.78 + clamp(this.buffet * 3 + this.slow * 5, -.18, .18));
  }
}
export class AirflowSourceStreet01 {
  constructor({ seed = 1 } = {}) {
    check(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'uint seed required');
    this.exterior = new Texture(seed); this.riderLeft = new Texture(seed ^ 0xa54ff53a); this.riderRight = new Texture(seed ^ 0x510e527f);
    this.exteriorGain = 0; this.riderGain = 0; this.riderReleaseLeft = 0; this.cutoff = .12; this.frame = 0;
    this.stats = { frames: 0, maximumSpeed: 0, exteriorPeak: 0, riderPeak: 0, windBasis: 'explicit-still-air-assumption' };
  }
  renderInto({ velocity, airVelocity = null, enabled = false, level = .35, riderAttached = false, riderViewAttached = false, valid = true }, exterior, riderLeft, riderRight) {
    check(typeof enabled === 'boolean' && typeof valid === 'boolean' && typeof riderAttached === 'boolean' && typeof riderViewAttached === 'boolean' && Number.isFinite(level) && level >= 0 && level <= 1, 'bounded controls required');
    check([exterior, riderLeft, riderRight].every(a => a instanceof Float32Array && a.length === 512) && new Set([exterior, riderLeft, riderRight]).size === 3, 'three distinct 512-frame buffers required');
    const speed = airflowSpeedStreet01(velocity, airVelocity ?? [0, 0, 0]), ratio = clamp(speed / REF, 0, 2);
    const active = enabled && valid;
    // Emission follows air-relative speed, including a co-moving rider. No
    // source-listener relative velocity or camera displacement enters it.
    // Texture's two unit-bounded lowpasses differ by at most two, with a
    // modulation ceiling .96. These bounds keep dry exterior below one and
    // local pressure below the renderer's .25 contract, without a PCM clipper.
    const extTarget = active ? Math.min(.48, .45 * level * ratio * ratio) : 0;
    const riderTarget = active && riderAttached && riderViewAttached ? Math.min(.08, .08 * level * Math.pow(ratio, 1.65)) : 0;
    const cutoffTarget = 1 - Math.exp(-2 * Math.PI * (1500 + 2900 * clamp(ratio, 0, 1)) / FS);
    const gainK = 1 - Math.exp(-1 / (.045 * FS)), spectralK = 1 - Math.exp(-1 / (.08 * FS));
    if(riderTarget>0)this.riderReleaseLeft=0;
    else if(this.riderGain>0&&this.riderReleaseLeft===0)this.riderReleaseLeft=960;
    this.stats.maximumSpeed = Math.max(this.stats.maximumSpeed, speed);
    this.stats.windBasis = airVelocity === null ? 'explicit-still-air-assumption' : 'caller-supplied-air-velocity';
    for (let i = 0; i < 512; i++) {
      this.exteriorGain += gainK * (extTarget - this.exteriorGain);
      if(this.riderReleaseLeft){this.riderGain*=(this.riderReleaseLeft-1)/this.riderReleaseLeft;this.riderReleaseLeft--;}
      else this.riderGain += gainK * (riderTarget - this.riderGain);
      this.cutoff += spectralK * (cutoffTarget - this.cutoff);
      const e = this.exterior.next(this.cutoff) * this.exteriorGain;
      const l = this.riderLeft.next(this.cutoff * .8) * this.riderGain;
      const r = this.riderRight.next(this.cutoff * .8) * this.riderGain;
      // Disable is an exact bypass. Noise/filter histories keep advancing so
      // re-enabling never restarts a periodic loop or reseeds a source.
      exterior[i] = active ? e : 0;
      // Detachment releases the existing envelope over exactly 960 frames rather
      // than chopping pressure at a block edge. This bounded release never
      // creates a world source or asserts a new rider/air observation.
      riderLeft[i] = active ? l : 0;
      riderRight[i] = active ? r : 0;
      this.stats.exteriorPeak = Math.max(this.stats.exteriorPeak, Math.abs(exterior[i]));
      this.stats.riderPeak = Math.max(this.stats.riderPeak, Math.abs(riderLeft[i]), Math.abs(riderRight[i]));
    }
    this.frame += 512; this.stats.frames += 512;
    return { speed, windBasis: this.stats.windBasis, riderActive: active && riderAttached && riderViewAttached, riderReleasing:this.riderReleaseLeft>0, exteriorActive: active && speed > 0 };
  }
}
