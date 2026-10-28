// Original owned-source configuration. Acoustic/path state is independent of it.
export const DEFAULT_BEACON_FREQUENCY_HZ = 95;
export const DEFAULT_BEACON_LEVEL = 0.22;
export function validateBeaconLevel(level) {
  if (!Number.isFinite(level) || level < 0 || level > 0.5)
    throw Error("Beacon level must be finite, 0..0.5");
  return level;
}
export function validateBeaconFrequencyHz(hz) {
  if (!Number.isFinite(hz) || hz < 20 || hz > 2000)
    throw Error("Beacon frequency must be finite, 20..2000 Hz");
  return hz;
}
