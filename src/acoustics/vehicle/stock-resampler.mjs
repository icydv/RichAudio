const phaseCount = 128;
const cutoffCount = 16;
const radii = new Map([['bandlimited', 10], ['reference', 24]]);
const kernels = new Map();
const assetBounds = new WeakMap();
const proofBanks = new WeakMap();
const peakRoundingAllowance = 2e-12;
const proofRoundingAllowance = 1e-10;
const maximumProofFrames = 2_097_152;
const maximumProofKnotEvaluations = 12_000_000;

const sinc = x => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);

function kernelBank(radius) {
  const taps = 2 * radius;
  const stride = (phaseCount + 1) * taps;
  const weights = new Float64Array((cutoffCount + 1) * stride);
  let absoluteGain = 1;
  for (let i = 1; i <= cutoffCount; i++) {
    const cutoff = i / cutoffCount;
    for (let j = 0; j <= phaseCount; j++) {
      const offset = i * stride + j * taps;
      const fraction = j / phaseCount;
      let dc = 0;
      for (let k = 0; k < taps; k++) {
        const x = k + 1 - radius - fraction;
        const angle = Math.PI * x / radius;
        const window = Math.abs(x) >= radius ? 0 : .42 + .5 * Math.cos(angle) + .08 * Math.cos(2 * angle);
        const weight = cutoff * sinc(cutoff * x) * window;
        weights[offset + k] = weight;
        dc += weight;
      }
      let magnitude = 0;
      for (let k = 0; k < taps; k++) {
        weights[offset + k] /= dc;
        magnitude += Math.abs(weights[offset + k]);
      }
      absoluteGain = Math.max(absoluteGain, magnitude);
    }
  }
  return {radius, taps, weights, stride, absoluteGain};
}

export function stockResampler(quality) {
  if (quality === 'linear') return null;
  if (!radii.has(quality)) throw Error('supported stock resampling quality required');
  if (!kernels.has(quality)) kernels.set(quality, kernelBank(radii.get(quality)));
  return kernels.get(quality);
}

/** Called by the verified PCM loader once it has admitted the retained samples. */
export function retainVerifiedStockResamplingAsset(asset) {
  const samples = asset.samplesFloat32 ?? asset.samples;
  if (!(samples instanceof Float32Array)) throw Error('retained decoded stock PCM required');
  if (!assetBounds.has(asset)) assetBounds.set(asset, {samples, bounds: new Map()});
}

function cachedAssetBounds(asset, samples) {
  // Caller-owned fixtures may be edited even if they supply a SHA field.
  const retained = assetBounds.get(asset);
  return retained && retained.samples === samples ? retained.bounds : null;
}

/**
 * In an asset-local range [low, high], a unit-DC signed kernel can move the
 * midpoint by at most half the range times its L1 gain. Phase and cutoff
 * interpolation are convex combinations of the same proven kernels.
 */
export function stockResamplingPeakBound(asset, quality = 'linear') {
  const bank = stockResampler(quality);
  const samples = asset.samplesFloat32 ?? asset.samples;
  if (!bank) return asset.nativePeak ?? samples.reduce((p, sample) => Math.max(p, Math.abs(sample)), 0);
  const bounds = cachedAssetBounds(asset, samples);
  if (bounds?.has(quality)) return bounds.get(quality);
  const {radius, absoluteGain} = bank;
  let peak = 0;
  for (let center = 0; center < samples.length; center++) {
    const first = Math.max(0, center + 1 - radius);
    const last = Math.min(samples.length - 1, center + radius);
    const edge = center + 1 - radius < 0 || center + radius >= samples.length;
    let low = edge ? 0 : samples[center];
    let high = low;
    for (let i = first; i <= last; i++) {
      const sample = samples[i];
      if (sample < low) low = sample;
      if (sample > high) high = sample;
    }
    peak = Math.max(peak, (Math.abs(high + low) + absoluteGain * (high - low)) / 2);
  }
  if (peak) peak += peakRoundingAllowance;
  bounds?.set(quality, peak);
  return peak;
}

function peakProofBank(bank) {
  const {radius, taps, weights, stride} = bank;
  const suffixWeights = new Float64Array(weights.length);
  for (let offset = stride; offset < weights.length; offset += taps) {
    let sum = 0;
    for (let tap = taps - 1; tap >= 0; tap--) {
      sum += weights[offset + tap];
      suffixWeights[offset + tap] = sum;
    }
  }
  const group = (firstCutoff, lastCutoff, firstPhase, lastPhase) => {
    const offset00 = firstCutoff * stride + firstPhase * taps;
    const offset01 = firstCutoff * stride + lastPhase * taps;
    const offset10 = lastCutoff * stride + firstPhase * taps;
    const offset11 = lastCutoff * stride + lastPhase * taps;
    const cutoffWidth = lastCutoff - firstCutoff;
    const phaseWidth = lastPhase - firstPhase;
    let remainder = 0;
    // Every omitted row is a convex combination of the four corners plus a
    // residual. Its contribution is at most half the window's range times
    // this L1 remainder because the residual has zero DC (up to roundoff).
    for (let cutoff = firstCutoff; cutoff <= lastCutoff; cutoff++) {
      const cutoffMix = (cutoff - firstCutoff) / cutoffWidth;
      for (let phase = firstPhase; phase <= lastPhase; phase++) {
        const phaseMix = (phase - firstPhase) / phaseWidth;
        const offset = cutoff * stride + phase * taps;
        let magnitude = 0;
        for (let tap = 0; tap < taps; tap++) {
          const low = weights[offset00 + tap] * (1 - phaseMix) + weights[offset01 + tap] * phaseMix;
          const high = weights[offset10 + tap] * (1 - phaseMix) + weights[offset11 + tap] * phaseMix;
          magnitude += Math.abs(weights[offset + tap] - (low * (1 - cutoffMix) + high * cutoffMix));
        }
        remainder = Math.max(remainder, magnitude);
      }
    }
    let children = null;
    if (cutoffWidth > 1) {
      const middle = firstCutoff + Math.floor(cutoffWidth / 2);
      children = [group(firstCutoff, middle, firstPhase, lastPhase), group(middle, lastCutoff, firstPhase, lastPhase)];
    } else if (phaseWidth > 1) {
      const middle = firstPhase + Math.floor(phaseWidth / 2);
      children = [group(firstCutoff, lastCutoff, firstPhase, middle), group(firstCutoff, lastCutoff, middle, lastPhase)];
    }
    return {corners: [offset00, offset01, offset10, offset11], remainder, children};
  };
  const groups = [];
  const cutoffWidth = radius === 10 ? 3 : 2;
  for (let cutoff = 1; cutoff < cutoffCount; cutoff += cutoffWidth) {
    for (let phase = 0; phase < phaseCount; phase += 32) {
      groups.push(group(cutoff, Math.min(cutoff + cutoffWidth, cutoffCount), phase, phase + 32));
    }
  }
  return {suffixWeights, groups};
}

function certifyPeakBound(samples, bank, ceiling) {
  if (!proofBanks.has(bank)) proofBanks.set(bank, peakProofBank(bank));
  const {suffixWeights, groups} = proofBanks.get(bank);
  const {radius, taps, absoluteGain} = bank;
  const maximumByKnot = new Float64Array(suffixWeights.length / taps);
  const windowByKnot = new Uint32Array(maximumByKnot.length);
  const window = new Float64Array(taps);
  const differences = new Float64Array(taps);
  let windowId = 0;
  let remainingEvaluations = maximumProofKnotEvaluations;
  let halfRange;

  function knotPeak(offset) {
    const knot = offset / taps;
    if (windowByKnot[knot] === windowId) return maximumByKnot[knot];
    if (remainingEvaluations === 0) return Infinity;
    remainingEvaluations--;
    // For a clamp interval [a,b], the tap dot product is
    // x[a]*DC - t[a] + t[b], with t[j] the cumulative sum of neighboring
    // sample differences weighted by the kernel suffix sums. At each b,
    // running extrema over a <= b cover all allowed clamps in O(taps).
    const dc = suffixWeights[offset];
    let total = 0;
    let minimum = window[0] * dc;
    let maximum = minimum;
    let peak = Math.abs(minimum);
    for (let tap = 1; tap < taps; tap++) {
      total += differences[tap] * suffixWeights[offset + tap];
      const value = window[tap] * dc - total;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      peak = Math.max(peak, maximum + total, -minimum - total);
    }
    windowByKnot[knot] = windowId;
    maximumByKnot[knot] = peak;
    return peak;
  }

  function groupPasses({corners, remainder, children}) {
    const peak = Math.max(knotPeak(corners[0]), knotPeak(corners[1]), knotPeak(corners[2]), knotPeak(corners[3]));
    if (peak > ceiling) return false;
    return peak + halfRange * remainder <= ceiling ||
      (children !== null && groupPasses(children[0]) && groupPasses(children[1]));
  }

  function windowPasses(first, zeroOutside) {
    const last = first + taps;
    const interior = first >= 0 && last <= samples.length;
    let low = Infinity;
    let high = -Infinity;
    for (let tap = 0; tap < taps; tap++) {
      const index = first + tap;
      const sample = interior ? samples[index] : zeroOutside && (index < 0 || index >= samples.length) ? 0 :
        samples[Math.max(0, Math.min(samples.length - 1, index))];
      window[tap] = sample;
      low = Math.min(low, sample);
      high = Math.max(high, sample);
    }
    halfRange = (high - low) / 2;
    if (Math.max(high, -low) > ceiling) return false;
    if (Math.abs((high + low) / 2) + absoluteGain * halfRange <= ceiling) return true;
    for (let tap = 1; tap < taps; tap++) differences[tap] = window[tap] - window[tap - 1];
    windowId++;
    for (const group of groups) if (!groupPasses(group)) return false;
    return true;
  }

  for (let center = 0; center < samples.length; center++) {
    const first = center + 1 - radius;
    if (!windowPasses(first, false)) return false;
    if ((first < 0 || first + taps > samples.length) && !windowPasses(first, true)) return false;
  }
  return true;
}

/**
 * Startup only. Proves a requested bound for decoded PCM with both file-edge
 * modes and any internal clamp. Runtime phase/cutoff interpolation is convex
 * between the proved rows. If the target or work budget fails, keep the
 * existing safe bound. At most one bounded frame scan and a fixed number of
 * knot evaluations are used per attempt. Nothing is added to each PCM read.
 */
export function prepareStockResamplingPeakBound(asset, quality, targetPeak) {
  if (!Number.isFinite(targetPeak) || targetPeak <= 0) throw Error('positive stock peak proof target required');
  const bank = stockResampler(quality);
  if (!bank) return stockResamplingPeakBound(asset, quality);
  const samples = asset.samplesFloat32 ?? asset.samples;
  const bounds = cachedAssetBounds(asset, samples);
  if (!bounds) return stockResamplingPeakBound(asset, quality);
  const previous = bounds.get(quality);
  if (previous !== undefined && previous <= targetPeak) return previous;
  if (samples.length <= maximumProofFrames && certifyPeakBound(samples, bank, targetPeak - proofRoundingAllowance)) {
    bounds.set(quality, targetPeak);
    return targetPeak;
  }
  return stockResamplingPeakBound(asset, quality);
}

/** Symmetric interpolation at the current source time, with no added latency. */
export function resampleStockPcm(bank, samples, position, nativeStep, low, high, zeroOutside = false) {
  const center = Math.floor(position);
  const fraction = position - center;
  if (nativeStep <= 1 && fraction === 0) return samples[center];
  // When transposing up, leave a little transition band before output
  // Nyquist. Below unity the full native bandwidth can be reconstructed.
  const cutoff = nativeStep <= 1 ? cutoffCount :
    Math.max(1, cutoffCount / (nativeStep * (1 + .08 * Math.min(1, (nativeStep - 1) * 4))));
  const lower = Math.floor(cutoff);
  const cutoffMix = cutoff - lower;
  const phasePosition = fraction * phaseCount;
  const phase = Math.floor(phasePosition);
  const phaseMix = phasePosition - phase;
  const {radius, taps, stride, weights} = bank;
  const first = center + 1 - radius;
  const offset = lower * stride + phase * taps;
  let sum = 0;
  if (cutoffMix === 0 && first >= low && first + taps <= high) {
    for (let i = 0; i < taps; i++) {
      const at = offset + i;
      const base = weights[at];
      sum += samples[first + i] * (base + (weights[at + taps] - base) * phaseMix);
    }
    return sum;
  }
  for (let i = 0; i < taps; i++) {
    const index = first + i;
    if (zeroOutside && (index < low || index >= high)) continue;
    const sample = samples[Math.max(low, Math.min(high - 1, index))];
    const at = offset + i;
    const base = weights[at];
    let weight = base + (weights[at + taps] - base) * phaseMix;
    if (cutoffMix) {
      const above = weights[at + stride];
      weight += (above + (weights[at + stride + taps] - above) * phaseMix - weight) * cutoffMix;
    }
    sum += sample * weight;
  }
  return sum;
}
