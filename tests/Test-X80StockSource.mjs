import assert from 'node:assert/strict';
import {test} from 'node:test';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';

const rate = 48000;
const running = {operatingPoint: .79, load: .92, lift: false, running: true, gear: 2};

function fixture(model = 'prototipo') {
  const samples = Float32Array.from({length: rate}, (_, i) =>
    .22 * Math.sin(2 * Math.PI * 100 * i / rate) + .16 * Math.sin(2 * Math.PI * 3500 * i / rate));
  const intervals = Array.from({length: 100}, (_, i) => ({startFrame: 480 * i, endFrame: 480 * (i + 1)}));
  const layer = {samples, frames: rate, sampleRate: rate, intervals};
  const modes = {idle: layer, accel: layer, decel: layer};
  return {model, layers: {engine: modes, exhaust: modes}};
}

function render(source, control, frames, size = 512) {
  const engine = new Float32Array(frames);
  const exhaust = new Float32Array(frames);
  for (let at = 0; at < frames; at += size) {
    source.renderInto(control, engine.subarray(at, at + size), exhaust.subarray(at, at + size));
  }
  return {engine, exhaust};
}

function band(samples, frequency) {
  let sine = 0, cosine = 0;
  for (let i = 0; i < samples.length; i++) {
    const phase = 2 * Math.PI * frequency * i / rate;
    sine += samples[i] * Math.sin(phase);
    cosine += samples[i] * Math.cos(phase);
  }
  return Math.hypot(sine, cosine);
}

const rms = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);

test('X80 adds exhaust bite at the same revs without changing grain pitch', () => {
  const high = new StockVehicleSource(fixture(), {x80LoadResponse: true});
  const low = new StockVehicleSource(fixture(), {x80LoadResponse: true});
  const legacy = new StockVehicleSource(fixture());
  const highPcm = render(high, running, 48000).exhaust.subarray(24000);
  const lowPcm = render(low, {...running, load: .34}, 48000).exhaust.subarray(24000);
  const legacyPcm = render(legacy, running, 48000).exhaust.subarray(24000);
  const upperToLower = samples => band(samples, 3500) / band(samples, 100);
  assert.ok(upperToLower(highPcm) > upperToLower(lowPcm) * 1.5);
  assert.notDeepEqual(highPcm, legacyPcm);
  assert.deepEqual(high.commonRates, low.commonRates);
  assert.deepEqual(high.commonRates, legacy.commonRates);
  assert.throws(() => new StockVehicleSource(fixture('schafter3'), {x80LoadResponse: true}));
});

test('X80 upshift cuts and recovers exhaust pressure without changing reader clocks', () => {
  const shifted = new StockVehicleSource(fixture(), {x80LoadResponse: true});
  const held = new StockVehicleSource(fixture(), {x80LoadResponse: true});
  render(shifted, running, 24000);
  render(held, running, 24000);
  const cut = render(shifted, {...running, gear: 3}, 19200).exhaust;
  const steady = render(held, running, 19200).exhaust;
  assert.ok(rms(cut.subarray(960, 1920)) < .6 * rms(steady.subarray(960, 1920)));
  assert.deepEqual(cut.subarray(14400), steady.subarray(14400));
  assert.deepEqual(shifted.commonRates, held.commonRates);
});

function popAssets() {
  return {model: 'prototipo', variants: [32005, 32001, 32002, 32001].map((sampleRate, variant) => ({
    samples: Float32Array.from({length: 3200}, (_, i) =>
      .8 * Math.sin(2 * Math.PI * (450 + variant * 130) * i / sampleRate)), frames: 3200, sampleRate,
  }))};
}

test('a hard lift emits one finite native event at the exhaust on the source clock', () => {
  const make = () => new StockVehicleSource(fixture(), {
    exhaustEvents: {assets: popAssets(), inferFromControls: true, maximumGain: .65},
  });
  const first = make(), second = make(), quiet = new StockVehicleSource(fixture());
  const release = {...running, operatingPoint: .73, load: .09, lift: true};
  render(first, running, 9600);
  render(second, running, 9600, 64);
  render(quiet, running, 9600);
  const emitted = render(first, release, 14400);
  const separatelyBlocked = render(second, release, 14400, 64);
  const noPop = render(quiet, release, 14400);
  assert.deepEqual(emitted, separatelyBlocked);
  assert.deepEqual(emitted.engine, noPop.engine);
  assert.ok(emitted.exhaust.subarray(1, 4800).some((value, index) => value !== noPop.exhaust[index + 1]));
  assert.deepEqual(emitted.exhaust.subarray(5000), noPop.exhaust.subarray(5000));
  assert.equal(first.stats.events.triggered, 1);
  assert.equal(first.stats.events.completed, 1);
  assert.equal(first.stats.events.lastTrigger.atFrame, 9600);
  assert.ok(first.stats.events.lastTrigger.variant >= 0 && first.stats.events.lastTrigger.variant < 4);
  assert.ok(first.stats.events.maximumCombinedInputBound <= .98 + 1e-12);
});

test('gentle lifts, brief input spikes, startup and an unaccompanied shift stay quiet', () => {
  for (const previous of [null, {...running, load: .35}, {...running, operatingPoint: .36}, {...running, running: false}]) {
    const source = new StockVehicleSource(fixture(), {exhaustEvents: {assets: popAssets(), inferFromControls: true}});
    if (previous) render(source, previous, 14400);
    render(source, running, 480);
    render(source, {...running, lift: true, load: .08}, 14400);
    assert.equal(source.stats.events.triggered, 0);
    render(source, running, 14400);
    render(source, {...running, gear: 3, operatingPoint: .58, load: .15}, 14400);
    assert.equal(source.stats.events.triggered, 0);
  }
});

test('rapid repeated lifts do not stack events and spaced pulls cycle the four native variants', () => {
  const source = new StockVehicleSource(fixture(), {exhaustEvents: {assets: popAssets(), inferFromControls: true}});
  const release = {...running, load: .07, lift: true};
  render(source, running, 9600);
  render(source, release, 4800);
  const variants = [source.stats.events.lastTrigger.variant];
  render(source, running, 6720);
  render(source, release, 9600);
  assert.equal(source.stats.events.triggered, 1);
  for (let i = 0; i < 4; i++) {
    render(source, running, 9600);
    render(source, release, 9600);
    variants.push(source.stats.events.lastTrigger.variant);
  }
  assert.equal(source.stats.events.completed, 5);
  assert.equal(new Set(variants.slice(0, 4)).size, 4);
  assert.equal(variants[0], variants[4]);
});
