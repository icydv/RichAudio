// Diagnostic maths only; never delays, phase-aligns or modifies audio.
import {validateAudio, limits} from '../../src/offline-audio/stock-source.mjs';
const N = 4096;
export function spectrum(data, start = 0) {
  if (!(data instanceof Float64Array) || !Number.isInteger(start) || start < 0 || start + N > data.length) throw Error('spectrum extent');
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const x = data[start + n]; if (!Number.isFinite(x)) throw Error('nonfinite spectrum input');
    let j = n, r = 0; for (let b = 0; b < 12; b++) {r = (r << 1) | (j & 1); j >>= 1;}
    re[r] = x * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / N));
  }
  for (let size = 2; size <= N; size *= 2) {
    for (let base = 0; base < N; base += size) for (let k = 0; k < size / 2; k++) {
      const a = base + k, b = a + size / 2, angle = -2 * Math.PI * k / size, c = Math.cos(angle), s = Math.sin(angle);
      const x = re[b] * c - im[b] * s, y = re[b] * s + im[b] * c;
      re[b] = re[a] - x; im[b] = im[a] - y; re[a] += x; im[a] += y;
    }
  }
  return {re, im};
}
export function analysePair(engine, exhaust, start, end) {
  validateAudio(engine); validateAudio(exhaust);
  if (engine.channels !== 1 || exhaust.channels !== 1 || engine.rate !== exhaust.rate || engine.data.length !== exhaust.data.length ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > engine.data.length || end - start < N || end - start > engine.rate * limits.seconds) throw Error('pair extent/layout');
  const rate = engine.rate, width = Math.max(N, Math.round(rate * 0.2)), rows = [], e = engine.data, x = exhaust.data;
  for (let p = start; p + N <= end; p += width) {
    const stop = Math.min(end, p + width), count = stop - p;
    let se = 0, sx = 0, ee = 0, xx = 0, ex = 0;
    for (let n = p; n < stop; n++) {se += e[n]; sx += x[n]; ee += e[n] ** 2; xx += x[n] ** 2; ex += e[n] * x[n];}
    const cov = ex - se * sx / count, ve = ee - se * se / count, vx = xx - sx * sx / count;
    const zeroLagCorrelation = ve > 1e-20 && vx > 1e-20 ? cov / Math.sqrt(ve * vx) : null;
    // Decimated accumulation bounds work; lags are diagnostic only, never applied.
    let best = null;
    for (let lag = -Math.round(rate * 0.002); lag <= Math.round(rate * 0.002); lag += 4) {
      let a = 0, b = 0, aa = 0, bb = 0, ab = 0, samples = 0;
      for (let n = p + Math.max(0, -lag); n < stop - Math.max(0, lag); n += 8) {
        const u = e[n], v = x[n + lag]; a += u; b += v; aa += u * u; bb += v * v; ab += u * v; samples++;
      }
      const den = Math.sqrt(Math.max(0, aa - a * a / samples) * Math.max(0, bb - b * b / samples));
      if (den > 1e-20) {const correlation = (ab - a * b / samples) / den; if (!best || Math.abs(correlation) > Math.abs(best.correlation)) best = {lagSamples: lag, correlation};}
    }
    const a = spectrum(e, p), b = spectrum(x, p), bands = [];
    for (const [low, high] of [[20, 250], [250, 1000], [1000, 4000]]) {
      let independent = 0, combined = 0;
      for (let k = Math.ceil(low * N / rate); k < Math.min(N / 2, Math.ceil(high * N / rate)); k++) {
        independent += a.re[k] ** 2 + a.im[k] ** 2 + b.re[k] ** 2 + b.im[k] ** 2;
        combined += (a.re[k] + b.re[k]) ** 2 + (a.im[k] + b.im[k]) ** 2;
      }
      bands.push({lowHz: low, highHz: high, combinedVsIndependentDb: independent > 1e-20 && combined > 0 ? 10 * Math.log10(combined / independent) : null});
    }
    rows.push({startFrame: p, endFrame: stop, engineRms: Math.sqrt(ee / count), exhaustRms: Math.sqrt(xx / count), mixRms: Math.sqrt(Math.max(0, ee + xx + 2 * ex) / count), zeroLagCorrelation, strongestBoundedLag: best, bands});
  }
  return {method: 'max(200ms,4096 samples) windows; 4096-point Hann FFT at window start; bounded +/-2ms lag diagnostic sampled every4 frames, accumulation stride8',
    limitations: 'A lag peak is not physical alignment. Band interference is instantaneous, not native phase or causal proof. No timing correction is recommended by these numbers alone.', rows};
}
