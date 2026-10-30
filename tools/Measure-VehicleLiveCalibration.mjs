// Device-free digital-headroom matrix. Original PR74 analytic scenes only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VehicleAcousticPipeline } from '../src/acoustics/vehicle/pipeline.mjs';
import { VehicleSynthesizer, createVehicleBuffers } from '../src/acoustics/vehicle/synthesizer.mjs';
import { vehicleProfiles } from '../src/acoustics/vehicle/profiles.mjs';
import { createVehicleEnvironment } from '../src/acoustics/vehicle/environment.mjs';
import { componentEmitters } from '../src/acoustics/vehicle/state-adapter.mjs';

export async function measureVehicleLiveCalibration() {
  const cases = [], masterGain = .35, ceiling = .5, frames = 512;
  for (const profile of [vehicleProfiles.hypercarV12, vehicleProfiles.roadV8]) {
    for (const sceneName of ['direct', 'tunnel']) for (const nearComponent of ['mechanical', 'exhaust', 'intake']) {
      const synth = new VehicleSynthesizer(profile), buffers = createVehicleBuffers(frames),
        emitters = componentEmitters({ id: 'vehicle:1', generation: 1, position: [0, 0, .35], velocity: [0, 0, 0],
          forward: [0, 1, 0], up: [0, 0, 1], valid: true, controls: { engineRunning: true, speed: 100 } }, profile.components),
        listener = emitters.find(s => s.component === nearComponent).position.map((x, i) => x + (i === 0 ? .01 : 0)),
        pipeline = new VehicleAcousticPipeline({ scene: createVehicleEnvironment(sceneName, { quality: 'balanced', duration: 2 }).scene,
          sourceIds: emitters.map(s => s.id), quality: 'balanced', acceleration: 'cpu', masterGain }),
        left = new Float32Array(frames), right = new Float32Array(frames),
        inputs = Object.fromEntries(emitters.map(s => [s.id, buffers.layers[s.component]]));
      let peak = 0, energy = 0, maximumPaths = 0, maximumWorkMs = 0, deadlineMisses = 0;
      try {
        // Prime the actual synthesizer at upper operating bounds, then exercise
        // three real gear transitions and a bounded explicitly authored lift.
        for (let block = 0; block < 72; block++) {
          const time = block * frames / 48000, started = performance.now(), lift = block >= 60;
          const control = await pipeline.prepare({ time, session: 'vehicle-headroom-calibration', generation: 1,
            listener: { position: listener, velocity: [0, 0, 0] }, sources: emitters });
          maximumPaths = Math.max(maximumPaths, control.paths.length);
          synth.renderInto({ engineRunning: true, estimatedRpm: profile.redlineRpm, load: lift ? .05 : 1,
            throttle: lift ? .05 : 1, speed: 100, gear: 1 + Math.floor(block / 20), overrun: lift, exhaustPop: lift }, buffers);
          pipeline.process(inputs, left, right, frames);
          for (let sample = 0; sample < frames; sample++) {
            if (![left[sample], right[sample]].every(Number.isFinite)) throw Error('nonfinite calibration PCM');
            peak = Math.max(peak, Math.abs(left[sample]), Math.abs(right[sample]));
            energy += left[sample] ** 2 + right[sample] ** 2;
          }
          const elapsed = performance.now() - started;
          maximumWorkMs = Math.max(maximumWorkMs, elapsed); if (elapsed > frames / 48) deadlineMisses++;
        }
        const diagnostics = pipeline.diagnostics();
        if (peak <= 0 || peak > ceiling || diagnostics.renderer.limited !== 0) throw Error('vehicle calibration headroom failed');
        cases.push({ profile: profile.id, scene: sceneName, nearComponent, nearestDistanceMetres: .01, frames: frames * 72,
          peak, rms: Math.sqrt(energy / (frames * 72 * 2)), maximumPaths, masterGain, outputTrimDb: 0, ceiling,
          limiterFrames: diagnostics.renderer.limited, shifts: synth.stats.shifts, authoredPops: synth.stats.pops,
          maximumWorkMs, deadlineMisses, backend: diagnostics.backend });
      } finally { pipeline.close(); }
    }
  }
  return { schemaVersion: 1, status: 'offline-measured', basis: 'bounded authored stress matrix; not absolute SPL or universal worst-case proof',
    chain: 'original PR74 synthesizer -> per-component CausalSimulation -> StreamingRenderer',
    controls: 'redline/full-load/100mps component excitation, three shifts, explicitly authored overrun; stationary source poses isolate near-field level',
    geometry: 'existing PR74 original direct and analytic tunnel fixtures; no game geometry or additional late field',
    gpu: 'CPU path selected; hardware GPU work not measured', audioDeviceOpened: false, cases,
    maximumPeak: Math.max(...cases.map(c => c.peak)), peakLimit: ceiling,
    digitalHeadroomDb: 20 * Math.log10(ceiling / Math.max(...cases.map(c => c.peak))),
    totalDeadlineMisses: cases.reduce((n, c) => n + c.deadlineMisses, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await measureVehicleLiveCalibration(), output = process.argv[2];
  if (output) {
    const root = path.resolve('.local'), target = path.resolve(output);
    if (!target.startsWith(root + path.sep) || fs.existsSync(target)) throw Error('fresh local calibration output required');
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(result, null, 2));
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
