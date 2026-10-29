// Explicit audition-level matching, after acoustic DSP and before host master gain.
// It is not source SPL calibration, normalisation, clipping or an acoustic effect.
export const AUDITION_TRIM_DB = 12;
export const PREMASTER_PEAK_LIMIT = 0.5;
export function validateAuditionProfile(o) {
  if (o.outputTrimDb === 0) return;
  if (o.outputTrimDb !== AUDITION_TRIM_DB || o.sources !== 1 || o.scene !== "open-road" || o.beacon !== "harmonic" || o.frequencyHz !== 600 || o.level !== 0.44 || o.delayMs !== 100 || o.orientation || !o.required)
    throw Error("Audition trim requires the fixed one-source 600Hz/0.44 open-road required-listener 100ms profile");
}
export class BeaconOutputTrim {
  constructor(db = 0) {
    if (db !== 0 && db !== AUDITION_TRIM_DB) throw Error("Output trim must be disabled or exactly +12dB");
    this.enabled = db !== 0;
    this.gain = this.enabled ? 10 ** (db / 20) : 1;
    this.stats = { db, gain: this.gain, peakLimit: PREMASTER_PEAK_LIMIT, peakBefore: 0, peakAfter: 0, blocks: 0, rejectedBlocks: 0 };
  }
  apply(left, right) {
    if (!this.enabled) return; // Preserve default PCM without an extra rounding step.
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length || left.length < 1 || left.length > 512) throw Error("Output trim block bounds");
    let before = 0, after = 0;
    // Validate the whole block before mutating or publishing any of it.
    for (let i = 0; i < left.length; i++) {
      const a = Math.fround(left[i] * this.gain), b = Math.fround(right[i] * this.gain);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > PREMASTER_PEAK_LIMIT || Math.abs(b) > PREMASTER_PEAK_LIMIT) {
        this.stats.rejectedBlocks++;
        throw Error("Audition trim rejected nonfinite or over-ceiling block; no clipping or automatic gain reduction");
      }
      before = Math.max(before, Math.abs(left[i]), Math.abs(right[i]));
      after = Math.max(after, Math.abs(a), Math.abs(b));
    }
    for (let i = 0; i < left.length; i++) { left[i] *= this.gain; right[i] *= this.gain; }
    this.stats.blocks++;
    this.stats.peakBefore = Math.max(this.stats.peakBefore, before);
    this.stats.peakAfter = Math.max(this.stats.peakAfter, after);
  }
}
