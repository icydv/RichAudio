// Wholly original demonstration signals and bounded PCM WAV encoding. No recordings.
import { requireValue } from "./contracts.mjs";
export function signal(
  kind,
  duration,
  { frequency = 220, amplitude = 0.2, sampleRate = 48000 } = {},
) {
  requireValue(
    sampleRate === 48000 &&
      Number.isFinite(duration) &&
      duration > 0 &&
      duration <= 60 &&
      Number.isFinite(frequency) &&
      frequency > 0 &&
      frequency <= 4000 &&
      Number.isFinite(amplitude) &&
      amplitude >= 0 &&
      amplitude <= 0.5,
    "signal bounds",
  );
  requireValue(
    ["tone", "engine", "burst", "impulse"].includes(kind),
    "original signal kind",
  );
  const x = new Float32Array(Math.round(duration * sampleRate));
  let random = 123456789,
    noise = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sampleRate,
      fade = Math.min(1, t / 0.025, (duration - t) / 0.025);
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    if (kind === "tone")
      x[i] = amplitude * Math.sin(2 * Math.PI * frequency * t) * fade;
    if (kind === "engine") {
      let y = 0;
      for (let h = 1; h <= Math.min(12, Math.floor(8000 / frequency)); h++)
        y +=
          Math.sin(
            2 * Math.PI * frequency * h * t +
              0.15 * Math.sin(2 * Math.PI * 1.7 * t),
          ) / Math.pow(h, 1.3);
      noise +=
        (1 - Math.exp((-2 * Math.PI * 1500) / sampleRate)) *
        (random / 2147483648 - 1 - noise);
      x[i] =
        amplitude *
        (0.55 * y + 0.06 * noise) *
        (0.93 + 0.07 * Math.sin(2 * Math.PI * 7 * t)) *
        fade;
    }
    if (kind === "burst") {
      const local = t % 1.5;
      x[i] =
        local < 0.08
          ? amplitude *
            (random / 2147483648 - 1) *
            Math.sin((Math.PI * local) / 0.08) ** 2
          : 0;
    }
  }
  if (kind === "impulse") x[0] = amplitude;
  return x;
}
export function audioMetrics(channels) {
  let peak = 0,
    sum = 0,
    clipped = 0,
    nonfinite = 0,
    zero = 0,
    maximumStep = 0;
  for (const a of channels)
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!Number.isFinite(x)) nonfinite++;
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
      if (Math.abs(x) >= 1) clipped++;
      if (x === 0) zero++;
      if (i) maximumStep = Math.max(maximumStep, Math.abs(x - a[i - 1]));
    }
  const samples = channels.reduce((s, a) => s + a.length, 0);
  return {
    peak,
    rms: Math.sqrt(sum / samples),
    clippedSamples: clipped,
    nonfiniteSamples: nonfinite,
    zeroSamples: zero,
    maximumAdjacentStep: maximumStep,
  };
}
export function wav(channels, sampleRate = 48000) {
  requireValue(
    Array.isArray(channels) &&
      [1, 2].includes(channels.length) &&
      channels.every(
        (x) => x instanceof Float32Array && x.length === channels[0].length,
      ) &&
      channels[0].length <= 2880000 &&
      sampleRate === 48000,
    "bounded WAV format",
  );
  const frames = channels[0].length,
    dataBytes = frames * channels.length * 2,
    b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels.length, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * channels.length * 2, 28);
  b.writeUInt16LE(channels.length * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels.length; c++) {
      const x = channels[c][i];
      requireValue(
        Number.isFinite(x) && Math.abs(x) <= 1,
        "WAV sample outside full scale",
      );
      b.writeInt16LE(Math.round(x * 32767), 44 + (i * channels.length + c) * 2);
    }
  return b;
}
