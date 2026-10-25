// Offline file-source research only. No game, endpoint or native ownership APIs.
export const limits = Object.freeze({bytes: 32 * 1024 * 1024, samples: 8_000_000, seconds: 30});
export function validateAudio(a) {
  if (!a || !Number.isInteger(a.rate) || a.rate < 8000 || a.rate > 96000 || ![1, 2].includes(a.channels) ||
      !(a.data instanceof Float64Array) || !a.data.length || a.data.length > limits.samples || a.data.length % a.channels) throw Error('invalid audio layout');
  for (const x of a.data) if (!Number.isFinite(x) || x < -1 || x > 1) throw Error('invalid/excessive sample');
  return a;
}
export function decodeWav(b) {
  if (!Buffer.isBuffer(b) || b.length < 44 || b.length > limits.bytes || b.toString('ascii', 0, 4) !== 'RIFF' ||
      b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) + 8 !== b.length) throw Error('invalid RIFF extent');
  let fmt, payload, chunks = 0;
  for (let p = 12; p < b.length;) {
    if (++chunks > 128 || p + 8 > b.length) throw Error('invalid chunk');
    const n = b.readUInt32LE(p + 4), end = p + 8 + n, name = b.toString('ascii', p, p + 4);
    if (end > b.length || end + (n % 2) > b.length) throw Error('truncated chunk');
    if (name === 'fmt ') { if (fmt || n < 16) throw Error('invalid fmt'); fmt = b.subarray(p + 8, end); }
    if (name === 'data') { if (payload) throw Error('duplicate data'); payload = b.subarray(p + 8, end); }
    p = end + (n % 2);
  }
  if (!fmt || !payload || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(14) !== 16) throw Error('only PCM16 WAV supported');
  const channels = fmt.readUInt16LE(2), rate = fmt.readUInt32LE(4), align = fmt.readUInt16LE(12);
  if (![1, 2].includes(channels) || align !== channels * 2 || fmt.readUInt32LE(8) !== rate * align || payload.length % align) throw Error('invalid PCM frame');
  if (payload.length / 2 > limits.samples) throw Error('sample bound');
  const data = new Float64Array(payload.length / 2);
  for (let n = 0; n < data.length; n++) data[n] = payload.readInt16LE(n * 2) / 32768;
  return validateAudio({rate, channels, data});
}
export function encodeWav(a) {
  validateAudio(a); const bytes = a.data.length * 2;
  if (bytes + 44 > limits.bytes) throw Error('WAV size bound');
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(a.channels, 22); b.writeUInt32LE(a.rate, 24);
  b.writeUInt32LE(a.rate * a.channels * 2, 28); b.writeUInt16LE(a.channels * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let n = 0; n < a.data.length; n++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a.data[n] * 32768))), 44 + n * 2);
  return b;
}
export function measure(a) {
  validateAudio(a); let peak = 0, sum = 0, square = 0, clipped = 0, maxDelta = 0, largeSteps = 0, silentWindows = 0;
  const frames = a.data.length / a.channels, window = Math.max(1, Math.round(a.rate * 0.02));
  for (let n = 0; n < a.data.length; n++) {
    const x = a.data[n]; peak = Math.max(peak, Math.abs(x)); sum += x; square += x * x;
    if (Math.abs(x) >= 32767 / 32768) clipped++;
    if (n >= a.channels) { const d = Math.abs(x - a.data[n - a.channels]); maxDelta = Math.max(maxDelta, d); if (d > 0.5) largeSteps++; }
  }
  for (let p = 0; p < frames; p += window) {
    let e = 0; const end = Math.min(frames, p + window);
    for (let n = p * a.channels; n < end * a.channels; n++) e += a.data[n] ** 2;
    if (Math.sqrt(e / ((end - p) * a.channels)) < 1e-5) silentWindows++;
  }
  return {rate: a.rate, channels: a.channels, frames, durationSeconds: frames / a.rate, peak, rms: Math.sqrt(square / a.data.length),
    dc: sum / a.data.length, clippedSamples: clipped, allZero: peak === 0, nonfiniteSamples: 0, maxAdjacentStep: maxDelta,
    stepsAboveHalfScale: largeSteps, silent20msWindows: silentWindows, windowCount: Math.ceil(frames / window)};
}
export function validateTimeline(points, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > limits.seconds || !Array.isArray(points) || points.length < 2 || points.length > 256 || points[0].t !== 0 || points.at(-1).t !== duration) throw Error('invalid timeline extent');
  for (let n = 0; n < points.length; n++) {
    const p = points[n];
    if (![p.t, p.ratio, p.throttle].every(Number.isFinite) || p.ratio < 0 || p.ratio > 1 || p.throttle < 0 || p.throttle > 1 ||
        (n > 0 && p.t <= points[n - 1].t)) throw Error('invalid synthetic state');
  }
}
export function stateAt(points, t) {
  let i = 1; while (i < points.length - 1 && points[i].t < t) i++;
  const a = points[i - 1], b = points[i], z = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))), u = z * z * (3 - 2 * z);
  return {ratio: a.ratio + (b.ratio - a.ratio) * u, throttle: a.throttle + (b.throttle - a.throttle) * u,
    falling: b.ratio < a.ratio && b.throttle <= 0.2};
}
// Windowed-sinc interpolation. Cutoff contracts when reading faster; no raw
// decimation/pitch-shift claim. Quantised filter tables bound startup/work/memory.
const filterCache = new Map(); const taps = 24, phases = 128;
function filter(rate) {
  const bucket = Math.round(rate * 128), r = bucket / 128;
  if (!Number.isFinite(rate) || rate < 0.125 || rate > 4) throw Error('resampling rate bound');
  if (filterCache.has(bucket)) return filterCache.get(bucket);
  if (filterCache.size >= 384) filterCache.clear();
  const table = new Float64Array(taps * phases), cutoff = 0.9 * Math.min(1, 1 / r);
  for (let p = 0; p < phases; p++) {
    let sum = 0;
    for (let k = 0; k < taps; k++) {
      const x = k - taps / 2 + 1 - p / phases, z = Math.PI * x * cutoff;
      const c = (Math.abs(z) < 1e-12 ? 1 : Math.sin(z) / z) * cutoff * (0.5 + 0.5 * Math.cos(Math.PI * x / (taps / 2)));
      table[p * taps + k] = c; sum += c;
    }
    for (let k = 0; k < taps; k++) table[p * taps + k] /= sum;
  }
  filterCache.set(bucket, table); return table;
}
export function sample(a, position, channel, rate = 1) {
  const frames = a.data.length / a.channels;
  if (!Number.isFinite(position) || channel < 0 || channel >= a.channels || !Number.isInteger(channel)) throw Error('invalid sample request');
  const base = Math.floor(position), phase = Math.min(phases - 1, Math.floor((position - base) * phases)), f = filter(rate);
  let sum = 0;
  for (let k = 0; k < taps; k++) {
    const n = ((base + k - taps / 2 + 1) % frames + frames) % frames;
    sum += a.data[n * a.channels + channel] * f[phase * taps + k];
  }
  return sum;
}
export function loopSample(a, position, channel, rate = 1) {
  const frames = a.data.length / a.channels, overlap = Math.min(Math.round(a.rate * 0.025), Math.floor(frames / 4));
  const period = frames - overlap, p = ((position % period) + period) % period;
  if (p >= overlap) return sample(a, p, channel, rate);
  const z = p / overlap, u = z * z * (3 - 2 * z);
  return (1 - u) * sample(a, period + p, channel, rate) + u * sample(a, p, channel, rate);
}
function sourceMap(sources) {
  if (!Array.isArray(sources) || sources.length !== 6) throw Error('six component/state streams required');
  const assets = new Map(); let total = 0;
  for (const s of sources) {
    const k = s.component + '/' + s.state;
    if (!['engine', 'exhaust'].includes(s.component) || !['idle', 'accel', 'decel'].includes(s.state) || assets.has(k)) throw Error('duplicate/unknown source scheduling');
    validateAudio(s.audio); total += s.audio.data.length;
    if (s.audio.channels !== 1 || s.audio.data.length < s.audio.rate * 0.1 || total > limits.samples) throw Error('source length/channel bound');
    if (s.markers && (!Array.isArray(s.markers) || s.markers.length > 10000 || s.markers.some((x, i) => !Number.isInteger(x) || x < 0 || x >= s.audio.data.length || (i > 0 && x <= s.markers[i - 1])))) throw Error('invalid candidate markers');
    assets.set(k, s);
  }
  return assets;
}
// Faithful limited baseline after the estimated grain demo failed listening.
// Moving recordings run once, contiguously, at their original sample rate.
// This does not reconstruct dynamic RPM, a sustained high layer or native timing.
export function renderReference(sources, options = {}) {
  const rate = options.rate ?? 48000, master = options.master ?? 0.2;
  const gains = options.gains ?? {engine: 1, exhaust: 0.75};
  const idleSeconds = options.idleSeconds ?? 2, crossfadeSeconds = options.crossfadeSeconds ?? 0.12;
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !Number.isFinite(master) || master <= 0 || master > 0.25 ||
      !['engine', 'exhaust'].every(c => Number.isFinite(gains[c]) && gains[c] >= 0 && gains[c] <= 1) ||
      !Number.isFinite(idleSeconds) || idleSeconds < 0.5 || idleSeconds > 4 ||
      !Number.isFinite(crossfadeSeconds) || crossfadeSeconds < 0.005 || crossfadeSeconds > 0.2) throw Error('invalid reference settings');
  const assets = sourceMap(sources), overlap = Math.round(rate * crossfadeSeconds);
  if ([...assets.values()].some(s => s.audio.rate !== rate)) throw Error('reference requires original matching sample rates');
  const states = ['idle', 'accel', 'decel', 'idle'];
  let frames = 0;
  const stages = states.map(state => {
    const length = state === 'idle' ? Math.round(idleSeconds * rate) : Math.max(...['engine', 'exhaust'].map(c => assets.get(c + '/' + state).audio.data.length));
    if (length < 2 * overlap) throw Error('reference segment too short for transition');
    const start = frames ? frames - overlap : 0; frames = start + length;
    return {state, start, frames: length};
  });
  if (frames > rate * limits.seconds) throw Error('reference duration bound');
  const engine = new Float64Array(frames), exhaust = new Float64Array(frames);
  const smooth = z => z * z * (3 - 2 * z), edge = Math.round(rate * 0.025);
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    for (const component of ['engine', 'exhaust']) {
      const a = assets.get(component + '/' + stage.state).audio, target = component === 'engine' ? engine : exhaust;
      const available = stage.state === 'idle' ? stage.frames : a.data.length;
      for (let n = 0; n < available; n++) {
        let w = 1;
        if (i > 0 && n < overlap) w *= smooth(n / overlap);
        if (i < stages.length - 1 && n >= stage.frames - overlap) w *= smooth((stage.frames - n) / overlap);
        // A shorter component ends explicitly; never loop/stretch invented tail.
        if (available < stage.frames && n >= available - edge) w *= smooth((available - 1 - n) / edge);
        const value = stage.state === 'idle' ? loopSample(a, n, 0) : a.data[n];
        target[stage.start + n] += value * w * master * gains[component];
      }
    }
  }
  const mix = new Float64Array(frames);
  for (let n = 0; n < frames; n++) {
    const fade = Math.min(1, n / edge, (frames - 1 - n) / edge);
    if (fade === 0) { engine[n] = 0; exhaust[n] = 0; }
    else { engine[n] *= fade; exhaust[n] *= fade; }
    mix[n] = engine[n] + exhaust[n];
  }
  return {engine: {rate, channels: 1, data: engine}, exhaust: {rate, channels: 1, data: exhaust}, mix: {rate, channels: 1, data: mix}};
}
export function render(sources, points, options = {}) {
  const rate = options.rate ?? 48000, duration = options.duration ?? 27, master = options.master ?? 0.2;
  const gains = options.gains ?? {engine: 1, exhaust: 0.75};
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !Number.isFinite(master) || master < 0 || master > 0.25 ||
      !['engine', 'exhaust'].every(c => Number.isFinite(gains[c]) && gains[c] >= 0 && gains[c] <= 1)) throw Error('invalid render settings');
  validateTimeline(points, duration);
  const assets = sourceMap(sources);
  const frames = Math.round(duration * rate), engine = new Float64Array(frames), exhaust = new Float64Array(frames);
  const hop = Math.round(rate * 0.04), length = hop * 2, weights = new Float64Array(frames);
  // Estimated OLA grains; marker interpretation and state mapping are explicit
  // approximations. Native granular clocks/loop groups are NOT reconstructed.
  for (let start = -hop; start < frames; start += hop) {
    const t = Math.max(0, Math.min(duration, (start + hop) / rate)), state = stateAt(points, t);
    const idle = Math.max(0, Math.min(1, (0.32 - state.ratio) / 0.12));
    const layerWeights = {idle, accel: (1 - idle) * (state.falling ? 0 : 1), decel: (1 - idle) * (state.falling ? 1 : 0)};
    for (let j = 0; j < length; j++) {
      const n = start + j; if (n < 0 || n >= frames) continue;
      weights[n] += Math.sin(Math.PI * j / length) ** 2;
    }
    for (const component of ['engine', 'exhaust']) for (const layer of ['idle', 'accel', 'decel']) {
      const weight = layerWeights[layer]; if (weight === 0) continue;
      const s = assets.get(component + '/' + layer), a = s.audio;
      const q = layer === 'decel' ? 1 - state.ratio : state.ratio;
      const speed = a.rate / rate * (layer === 'idle' ? 1 : 0.9 + state.ratio * 0.2);
      const desired = layer === 'idle' ? ((start + hop) / rate * a.rate) : q * (a.data.length - 1);
      let anchor = desired;
      if (layer !== 'idle' && s.markers?.length) anchor = s.markers.reduce((best, x) => Math.abs(x - desired) < Math.abs(best - desired) ? x : best, s.markers[0]);
      if (layer !== 'idle') {
        const margin = Math.ceil(hop * speed) + taps;
        if (a.data.length < 2 * margin + 1) throw Error('source too short for grain');
        anchor = Math.max(margin, Math.min(a.data.length - 1 - margin, anchor));
      }
      const target = component === 'engine' ? engine : exhaust;
      const gain = master * gains[component] * (layer === 'idle' ? 0.5 : 0.45 + 0.55 * state.throttle);
      for (let j = 0; j < length; j++) {
        const n = start + j; if (n < 0 || n >= frames) continue;
        const w = Math.sin(Math.PI * j / length) ** 2;
        const position = anchor + (j - hop) * speed;
        target[n] += (layer === 'idle' ? loopSample(a, position, 0, speed) : sample(a, position, 0, speed)) * w * weight * gain;
      }
    }
  }
  const mix = new Float64Array(frames);
  for (let n = 0; n < frames; n++) {
    if (weights[n] < 0.999 || weights[n] > 1.001) throw Error('overlap-add coverage error');
    const fade = Math.min(1, n / (rate * 0.025), (frames - 1 - n) / (rate * 0.025));
    if (fade === 0) { engine[n] = 0; exhaust[n] = 0; }
    else { engine[n] *= fade; exhaust[n] *= fade; }
    mix[n] = engine[n] + exhaust[n];
  }
  return {engine: {rate, channels: 1, data: engine}, exhaust: {rate, channels: 1, data: exhaust}, mix: {rate, channels: 1, data: mix}};
}
