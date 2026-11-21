// Original deterministic PCM analysis; no device, playback, or capture interfaces.
import { createHash } from "node:crypto";
import { audioMetrics } from "../../src/acoustics/engine/signals.mjs";
export function verifyWav(bytes, reference) {
  const frames = reference.left.length;
  if (bytes.length !== 44 + frames * 4 || bytes.toString("ascii",0,4) !== "RIFF" || bytes.toString("ascii",8,16) !== "WAVEfmt " || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 2 || bytes.readUInt32LE(24) !== 48000 || bytes.readUInt16LE(34) !== 16 || bytes.readUInt32LE(40) !== frames * 4) throw Error("Generated WAV format mismatch");
  const decoded = { left: new Float32Array(frames), right: new Float32Array(frames) };
  let maximumQuantisationError = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const name = c === 0 ? "left" : "right";
    const x = bytes.readInt16LE(44 + i * 4 + c * 2) / 32767;
    decoded[name][i] = x;
    maximumQuantisationError = Math.max(maximumQuantisationError, Math.abs(decoded[name][i] - reference[name][i]));
  }
  if (maximumQuantisationError > 0.5 / 32767 + 1e-9) throw Error("Unexpected PCM16 conversion error");
  return { sampleRate: 48000, channels: 2, bits: 16, frames, durationSeconds: frames / 48000, maximumQuantisationError, metrics: audioMetrics([decoded.left,decoded.right]), decoded };
}
export function pcmHash(r) {
  return createHash("sha256").update(Buffer.from(r.left.buffer, r.left.byteOffset, r.left.byteLength)).update(Buffer.from(r.right.buffer, r.right.byteOffset, r.right.byteLength)).digest("hex");
}
export function spatialSchedule(r) {
  return r.trace.map(t => [t.frame, t.spatialFingerprint, t.pathIds, t.delays, t.mode, t.targetTime, t.startup, t.readyFrame, t.emitting, t.presentationMuted]);
}
export function spectralPower(r, hz, start = 1, seconds = 1) {
  const from = Math.round(start * 48000), count = Math.round(seconds * 48000);
  if (!Number.isFinite(hz) || hz <= 0 || hz >= 24000 || count < 2 || from < 0 || from + count > r.left.length) throw Error("Spectral window bounds");
  let power = 0;
  for (const channel of [r.left, r.right]) {
    let re = 0, im = 0;
    for (let i = 0; i < count; i++) {
      const x = channel[from + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (count - 1)));
      const a = 2 * Math.PI * hz * i / 48000;
      re += x * Math.cos(a); im += x * Math.sin(a);
    }
    power += re * re + im * im;
  }
  return power;
}
export function fundamentalPeak(r, expected) {
  let frequencyHz = null, power = -1;
  for (let hz = expected - 5; hz <= expected + 5; hz++) {
    const p = spectralPower(r, hz);
    if (p > power) { power = p; frequencyHz = hz; }
  }
  return { frequencyHz, windowSeconds: [1, 2], binSpacingHz: 1, nominalBinUncertaintyHz: 0.5 };
}
export function envelope(r, from = 0.5, to = 2.5) {
  const rms = [];
  for (let i = Math.round(from * 48000); i + 960 <= to * 48000; i += 960) {
    let energy = 0;
    for (let j = i; j < i + 960; j++) energy += r.left[j] ** 2 + r.right[j] ** 2;
    rms.push(Math.sqrt(energy / 1920));
  }
  return { windowMs: 20, count: rms.length, minimumRms: Math.min(...rms), maximumRms: Math.max(...rms), zeroWindows: rms.filter(x => x === 0).length };
}
