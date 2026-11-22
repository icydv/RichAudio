import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativePcmVoice, StockGrainVoice, stockResamplingPeakBound} from '../src/acoustics/vehicle/stock-grain.mjs';
import {prepareStockResamplingPeakBound, retainVerifiedStockResamplingAsset, stockResampler} from '../src/acoustics/vehicle/stock-resampler.mjs';

const outputRate = 48000;
const tone = (frequency, frame, rate) => Math.sin(2 * Math.PI * frequency * frame / rate);

function amplitude(output, frequency, start, length) {
  let real = 0;
  let imaginary = 0;
  for (let i = start; i < start + length; i++) {
    real += output[i] * Math.cos(2 * Math.PI * frequency * i / outputRate);
    imaginary += output[i] * tone(frequency, i, outputRate);
  }
  return 2 * Math.hypot(real, imaginary) / length;
}

test('finite stock PCM reconstruction preserves the native upper band and removes its first image', () => {
  const sampleRate = 32000;
  const samples = Float32Array.from({length: sampleRate / 2}, (_, i) => .5 * tone(12000, i, sampleRate));
  const asset = {samples, frames: samples.length, sampleRate};
  const render = options => {
    const voice = new NativePcmVoice(asset, options);
    const record = () => Float64Array.from({length: samples.length * 1.5 + 8}, () => voice.next());
    const pcm = record();
    voice.position = 0;
    assert.deepEqual(record(), pcm);
    return pcm;
  };
  const previous = render();
  const revised = render({resampling: 'bandlimited'});
  assert.ok(amplitude(previous, 20000, 4800, 14400) > .06, 'linear control must expose the 20 kHz image');
  assert.ok(amplitude(revised, 20000, 4800, 14400) < .015, 'bandlimited conversion suppresses the image');
  assert.ok(amplitude(revised, 12000, 4800, 14400) > .46, 'the native harmonic survives');
  assert.ok(revised.subarray(samples.length * 1.5).every(value => value === 0));
});

test('resampling bounds include kernel overshoot and caller changes before constructing a new voice', () => {
  const samplesFloat32 = new Float32Array(96);
  // A copied or fabricated SHA is not an admission of retained PCM.
  const asset = {samplesFloat32, frames: samplesFloat32.length, sampleRate: 32000, sha256: 'f'.repeat(64)};
  for (const resampling of ['bandlimited', 'reference']) {
    samplesFloat32.fill(0);
    assert.equal(stockResamplingPeakBound(asset, resampling), 0);
    samplesFloat32.fill(.9, 24, 48);
    const voice = new NativePcmVoice(asset, {resampling});
    const values = Float64Array.from({length: 144}, () => Math.abs(voice.next()));
    const peak = Math.max(...values);
    assert.ok(peak > samplesFloat32[24], 'the signed kernel is allowed to reconstruct intersample overshoot');
    assert.ok(peak <= stockResamplingPeakBound(asset, resampling), 'the input proof reserves overshoot without clipping');
    assert.equal(prepareStockResamplingPeakBound(asset, resampling, .5), stockResamplingPeakBound(asset, resampling));
  }
});

test('startup peak proof covers signed kernel knots, arbitrary source clamps and finite file edges', () => {
  const samples = Float32Array.from({length: 24}, (_, i) => i < 8 ? -.4 : i < 16 ? .4 : -.2);
  const asset = {samples};
  retainVerifiedStockResamplingAsset(asset);
  for (const quality of ['bandlimited', 'reference']) {
    const conservativeBound = stockResamplingPeakBound(asset, quality);
    const bound = prepareStockResamplingPeakBound(asset, quality, .6);
    assert.ok(bound <= .6 && bound < conservativeBound);
    assert.equal(stockResamplingPeakBound(asset, quality), bound);
    assert.equal(prepareStockResamplingPeakBound(asset, quality, .2), bound);
    const {radius, taps, stride, weights} = stockResampler(quality);
    let peak = 0;
    for (const center of [0, 7, 8, 15, 16, samples.length - 1]) {
      const first = center + 1 - radius;
      for (let low = 0; low < samples.length; low++) {
        for (let high = low + 1; high <= samples.length; high++) {
          for (const zeroOutside of low === 0 && high === samples.length ? [false, true] : [false]) {
            const window = Float64Array.from({length: taps}, (_, tap) => {
              const index = first + tap;
              return zeroOutside && (index < low || index >= high) ? 0 : samples[Math.max(low, Math.min(high - 1, index))];
            });
            for (let cutoff = 1; cutoff <= 16; cutoff++) {
              for (let phase = 0; phase <= 128; phase++) {
                const offset = cutoff * stride + phase * taps;
                let sample = 0;
                for (let tap = 0; tap < taps; tap++) sample += weights[offset + tap] * window[tap];
                peak = Math.max(peak, Math.abs(sample));
              }
            }
          }
        }
      }
    }
    assert.ok(peak > .4 && peak <= bound, `observed unclipped ${quality} peak ${peak}`);
  }
});

test('stock grains suppress foldback when the native head advances two samples per output sample', () => {
  const span = 480;
  const samples = Float32Array.from({length: span * 120}, (_, i) =>
    .32 * tone(2200, i, outputRate) + .35 * tone(17000, i, outputRate));
  const intervals = Array.from({length: 120}, (_, i) => ({startFrame: i * span, endFrame: (i + 1) * span}));
  const asset = {samples, frames: samples.length, sampleRate: outputRate, intervals};
  const render = options => {
    const voice = new StockGrainVoice(asset, options);
    const output = Float64Array.from({length: 22000}, () => voice.next(.5, 200));
    return {output, cycles: voice.clockCycles, frame: voice.frame};
  };
  const previous = render();
  const revised = render({resampling: 'bandlimited'});
  const previousAlias = amplitude(previous.output, 14000, 9600, 9600);
  assert.ok(previousAlias > .09, 'linear control must expose 14 kHz foldback, measured ' + previousAlias);
  assert.ok(amplitude(revised.output, 14000, 9600, 9600) < .035, 'pitch-up must not fold the 34 kHz image into the passband');
  assert.ok(amplitude(revised.output, 4400, 9600, 9600) > .23, 'the in-band source harmonic survives');
  assert.equal(revised.frame, previous.frame);
  assert.equal(revised.cycles, previous.cycles);
});

test('quality readers preserve constant bed pressure and exact phase at the native rate', () => {
  const samples = Float32Array.from({length: 480}, (_, i) => .4 * tone(17000, i, outputRate));
  const native = new NativePcmVoice({samples, frames: samples.length, sampleRate: outputRate}, {resampling: 'reference'});
  assert.deepEqual(Float32Array.from(samples, () => native.next()), samples);
  const constant = new Float32Array(4800).fill(.4);
  const voice = new StockGrainVoice({samples: constant, frames: constant.length, sampleRate: 32000,
    intervals: Array.from({length: 10}, (_, i) => ({startFrame: 480 * i, endFrame: 480 * (i + 1)}))},
  {resampling: 'bandlimited'});
  for (let i = 0; i < 4800; i++) assert.ok(Math.abs(voice.next(.5, 82) - constant[0]) < 1e-10);
});

test('phrase selection retains real variation when multiple coherent native cycles are available', () => {
  const span = 1024;
  const cycles = 7;
  const samples = Float32Array.from({length: span * cycles}, (_, i) => {
    const cycle = Math.floor(i / span);
    const phase = i / span - cycle;
    return (.265 - .0025 * cycle) * Math.sin(2 * Math.PI * phase) +
      .07 * Math.sin(2 * Math.PI * (4 * phase + cycle * .015));
  });
  const intervals = Array.from({length: cycles}, (_, i) => ({startFrame: i * span, endFrame: (i + 1) * span}));
  const asset = {samples, frames: samples.length, sampleRate: outputRate, intervals, playbackState: 'idle'};
  const render = options => {
    const voice = new StockGrainVoice(asset, options);
    for (let i = 0; i < 96000; i++) voice.next(.9, outputRate / span);
    return voice;
  };
  const previous = render();
  const revised = render({retainNativePhrases: true});
  assert.equal(previous.stats.texture.maximumPoolCycles, cycles);
  assert.ok(previous.stats.texture.uniqueIntervals < cycles / 2 && previous.stats.texture.splices > 80);
  assert.ok(revised.stats.texture.uniqueIntervals >= 5);
  assert.ok(revised.stats.texture.splices < previous.stats.texture.splices / 2);
  assert.ok(revised.stats.texture.minimumSpliceCorrelation > .97);
  assert.equal(revised.clockCycles, previous.clockCycles);
});
