import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {decodeWav, encodeWav, measure, render, renderReference, sample, loopSample, validateAudio, validateTimeline} from '../src/offline-audio/stock-source.mjs';
import {run} from '../tools/Render-StockAudio.mjs';
import {privateRoot} from '../tools/audio/private-files.mjs';
const tone = (rate = 48000, channels = 1, frequency = 440) => ({rate, channels,
  data: Float64Array.from({length: Math.round(rate * 0.2) * channels}, (_, n) => 0.3 * Math.sin(2 * Math.PI * frequency * Math.floor(n / channels) / rate) * (n % channels === 0 ? 1 : -0.5))});
const assets = () => ['engine', 'exhaust'].flatMap((component, c) => ['idle', 'accel', 'decel'].map((state, i) => ({component, state, audio: tone(48000, 1, 90 + c * 37 + i * 11)})));
const points = [{t: 0, ratio: 0.2, throttle: 0.1}, {t: 0.15, ratio: 0.8, throttle: 1}, {t: 0.3, ratio: 0.2, throttle: 0}];
const opts = {duration: 0.3};

test('PCM16 conversion preserves exact integer samples and byte order', () => {
  const a = {rate: 48000, channels: 1, data: Float64Array.from([-1, -0.5, 0, 0.5, 32767 / 32768])};
  const b = encodeWav(a); assert.equal(b.readInt16LE(44), -32768);assert.equal(b.readInt16LE(50), 16384);
  assert.deepEqual(decodeWav(b).data, a.data);assert.deepEqual(encodeWav(decodeWav(b)), b);
});
test('Mono/stereo remain distinct; offline component renderer explicitly requires mono sources', () => {
  const a = tone(24000, 2), b = decodeWav(encodeWav(a)); assert.equal(b.channels, 2);
  assert.notEqual(b.data[2], b.data[3]);assert.equal(measure(b).frames, 4800);
  const s = assets();s[0].audio = a;assert.throws(() => render(s, points, opts), /channel/);
});
test('Sample-rate conversion preserves a 440 Hz synthetic tone', () => {
  const a = tone(24000); let e = 0;
  for (let n = 100; n < 4000; n++) e = Math.max(e, Math.abs(sample(a, n * 0.5, 0, 0.5) - 0.3 * Math.sin(2 * Math.PI * 440 * n / 48000)));
  assert.ok(e < 0.003, String(e));
});
test('Downsampling filter reduces a known synthetic alias by at least 20 dB', () => {
  const a = tone(48000, 1, 18000);let filtered = 0, naive = 0;
  for (let n = 100; n < 4000; n++) {filtered += sample(a, n * 2, 0, 2) ** 2;naive += a.data[n * 2] ** 2;}
  assert.ok(filtered < naive * 0.01);
});
test('Estimated idle wrap crossfade removes a deliberately mismatched endpoint jump', () => {
  const a = {rate: 48000, channels: 1, data: Float64Array.from({length: 9600}, (_, n) => n / 9600 * 0.8 - 0.4)};
  const period = 9600 - 1200;
  assert.ok(Math.abs(a.data[0] - a.data.at(-1)) > 0.79);
  assert.ok(Math.abs(loopSample(a, period - 1, 0) - loopSample(a, period, 0)) < 0.002);
});
test('Transition windows have complete coverage, bounded steps and zero file endpoints', () => {
  const r = render(assets(), points, opts); const m = measure(r.mix);
  assert.equal(r.mix.data[0], 0);assert.equal(r.mix.data.at(-1), 0);assert.equal(m.clippedSamples, 0);
  assert.ok(m.maxAdjacentStep < 0.1);assert.equal(m.allZero, false);
});
test('Rendering is deterministic across repeated independent calls', () => {
  assert.deepEqual(encodeWav(render(assets(), points, opts).mix), encodeWav(render(assets(), points, opts).mix));
});
test('Malformed RIFF, unsupported format, truncation and frame alignment fail', () => {
  const b = encodeWav(tone());
  assert.throws(() => decodeWav(b.subarray(0, b.length - 1)));
  const bad = Buffer.from(b);bad.writeUInt16LE(24, 34);assert.throws(() => decodeWav(bad), /PCM16/);
  bad.writeUInt16LE(16, 34);bad.writeUInt16LE(3, 32);assert.throws(() => decodeWav(bad), /frame/);
  assert.throws(() => decodeWav(Buffer.alloc(44)));
});
test('Nonfinite, excessive, empty and invalid-rate audio fail explicitly', () => {
  for (const v of [NaN, Infinity, -Infinity, 1.01, -1.01]) assert.throws(() => validateAudio({rate: 48000, channels: 1, data: Float64Array.of(v)}));
  assert.throws(() => validateAudio({rate: 48000, channels: 1, data: new Float64Array()}));
  assert.throws(() => validateAudio(tone(4000)));
});
test('Missing streams and duplicate component/state scheduling fail', () => {
  assert.throws(() => render(assets().slice(1), points, opts), /six/);
  const s = assets();s[5] = s[0];assert.throws(() => render(s, points, opts), /duplicate/);
});
test('Invalid ratios, throttle, timing and render duration are rejected', () => {
  for (const ratio of [-0.1, 1.1, NaN]) assert.throws(() => validateTimeline([{t: 0, ratio, throttle: 0}, points.at(-1)], 0.3));
  assert.throws(() => validateTimeline([{t: 0, ratio: 0, throttle: 2}, points.at(-1)], 0.3));
  assert.throws(() => render(assets(), points, {duration: 300}));
  assert.throws(() => validateTimeline([points[0], {...points[1], t: 0}, points[2]], 0.3));
});
test('Render failure and gain bounds cannot silently create clipped output', () => {
  assert.throws(() => render(assets(), points, {...opts, master: 2}));
  assert.throws(() => render(assets(), points, {...opts, gains: {engine: 2, exhaust: 1}}));
  const s = assets();s[0].audio.data[0] = NaN;assert.throws(() => render(s, points, opts));
});
test('Independent components stay time-aligned; muting one does not replace the other', () => {
  const r = render(assets(), points, {...opts, gains: {engine: 0, exhaust: 1}});
  assert.equal(r.engine.data.length, 14400);assert.equal(r.exhaust.data.length, r.mix.data.length);
  assert.ok(r.engine.data.every(x => x === 0));assert.deepEqual(r.exhaust.data, r.mix.data);
});
test('Unknown grain integers are only optional bounded candidate anchors', () => {
  for (const markers of [[3, 2], [-1], [999999], [1.5]]) {
    const s = assets();s[1].markers = markers;assert.throws(() => render(s, points, opts), /markers/);
  }
  assert.throws(() => sample(tone(), 0, 3));assert.throws(() => sample(tone(), NaN, 0));
  assert.throws(() => sample(tone(), 0, 0, 5), /rate/);
});
test('Private CLI verifies fingerprints, refuses unsafe/existing output and preserves input bytes', () => {
  fs.mkdirSync(privateRoot, {recursive: true});const dir = fs.mkdtempSync(path.join(privateRoot, 'synthetic-test-'));
  const sources = assets().map((s, i) => {const b = encodeWav(s.audio), file = i + '.wav';fs.writeFileSync(path.join(dir, file), b);
    return {component: s.component, state: s.state, file, sampleCount: s.audio.data.length, sampleRate: 48000, channels: 1, sha256: createHash('sha256').update(b).digest('hex').toUpperCase()};});
  const manifest = path.join(dir, 'manifest.json'), timeline = path.join(dir, 'timeline.json');
  fs.writeFileSync(manifest, JSON.stringify({schemaVersion: 1, family: 'authored-sine-only', sources}));
  fs.writeFileSync(timeline, JSON.stringify({schemaVersion: 1, ...opts, points}));
  const out = path.join(dir, 'render');run(manifest, timeline, out);
  assert.equal(decodeWav(fs.readFileSync(path.join(out, 'demo_mix.wav'))).data.length, 14400);
  assert.throws(() => run(manifest, timeline, out), /new output/);
  assert.throws(() => run(manifest, timeline, path.resolve('not-private')), /private/);
  sources[0].sha256 = '0'.repeat(64);fs.writeFileSync(manifest, JSON.stringify({schemaVersion: 1, sources}));
  const failed = path.join(dir, 'failed');assert.throws(() => run(manifest, timeline, failed), /fingerprint/);assert.equal(fs.existsSync(failed), false);
});

test('Continuous reference preserves moving samples at original speed outside transition fades', () => {
  const s = assets(), r = renderReference(s, {idleSeconds: 0.5, crossfadeSeconds: 0.02});
  const start = 24000 - 960, a = s.find(x => x.component === 'engine' && x.state === 'accel').audio;
  for (let n = 1000; n < a.data.length - 1000; n++) assert.equal(r.engine.data[start + n], a.data[n] * 0.2);
  assert.equal(r.mix.data.length, 24000 * 2 + 9600 * 2 - 960 * 3);
});
test('Shorter reference component ends without repetition or invented continuation', () => {
  const s = assets();s.find(x => x.component === 'engine' && x.state === 'decel').audio = tone(48000 * 1, 1);
  const short = s.find(x => x.component === 'exhaust' && x.state === 'decel');
  short.audio = {...short.audio, data: short.audio.data.slice(0, 6000)};
  const r = renderReference(s, {idleSeconds: 0.5, crossfadeSeconds: 0.02});
  const start = 24000 + 9600 - 960 * 2;
  assert.ok(r.exhaust.data.slice(start + 6000, start + 8000).every(x => x === 0));
  assert.ok(r.engine.data.slice(start + 6000, start + 8000).some(x => x !== 0));
});
test('Reference rejects unsupported rates, missing sources, invalid settings and long sequences', () => {
  const s = assets();s[0].audio = tone(24000);
  assert.throws(() => renderReference(s), /matching sample rates/);
  assert.throws(() => renderReference(assets().slice(1)), /six/);
  for (const settings of [{idleSeconds: NaN}, {crossfadeSeconds: 2}, {master: 1}, {gains: {engine: -1, exhaust: 1}}]) assert.throws(() => renderReference(assets(), settings));
  const long = assets();long[2].audio = {rate: 48000, channels: 1, data: new Float64Array(48000 * 30)};
  assert.throws(() => renderReference(long, {crossfadeSeconds: 0.02}), /duration/);
});
test('Reference is deterministic with aligned components, no clipping and zero file endpoints', () => {
  const r = renderReference(assets(), {crossfadeSeconds: 0.02});
  assert.deepEqual(encodeWav(r.mix), encodeWav(renderReference(assets(), {crossfadeSeconds: 0.02}).mix));
  assert.equal(r.engine.data.length, r.exhaust.data.length);assert.equal(r.mix.data[0], 0);assert.equal(r.mix.data.at(-1), 0);
  assert.equal(measure(r.mix).clippedSamples, 0);
  for (let n = 0; n < r.mix.data.length; n++) assert.equal(r.mix.data[n], r.engine.data[n] + r.exhaust.data[n]);
});
