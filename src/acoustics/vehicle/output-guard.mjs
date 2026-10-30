// Vehicle audition uses attenuation only. This is a digital headroom budget,
// not measured engine SPL, automatic normalisation or the beacon's +12 dB trim.
export const vehicleOutputCalibration = Object.freeze({
  id: 'vehicle-live-01-relative-v1', masterGain: 0.35, hostGain: 0.20,
  preHostPeakLimit: 0.5, beaconTrimDb: 0,
  basis: 'fixed-half-default-renderer-gain; measured-device-free-profile-envelope',
});
export class VehicleOutputGuard {
  constructor() {
    this.stats = { ...vehicleOutputCalibration, blocks: 0, peak: 0, sumSquares: 0, samples: 0, rejectedBlocks: 0 };
  }
  apply(left, right, limitedSamples = 0) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) ||
      left.length !== right.length || left.length < 1 || left.length > 512) throw Error('Vehicle output block bounds');
    let peak = 0, sumSquares = 0;
    for (let i = 0; i < left.length; i++) {
      for (const sample of [left[i], right[i]]) {
        if (!Number.isFinite(sample) || Math.abs(sample) > this.stats.preHostPeakLimit || limitedSamples !== 0) {
          this.stats.rejectedBlocks++;
          throw Error('Vehicle output rejected nonfinite, limited or over-ceiling block before publication');
        }
        peak = Math.max(peak, Math.abs(sample)); sumSquares += sample * sample;
      }
    }
    this.stats.blocks++; this.stats.peak = Math.max(this.stats.peak, peak);
    this.stats.sumSquares += sumSquares; this.stats.samples += left.length * 2;
  }
}
