// Deterministic original PCM through the real causal finite-path/DSP engine.
// Writes only private .local outputs. Never launches a game or audio device.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { vehicleProfiles } from '../src/acoustics/vehicle/profiles.mjs';
import { VehicleSynthesizer, createVehicleBuffers } from '../src/acoustics/vehicle/synthesizer.mjs';
import { componentEmitters, defaultVehicleLayout, vehicleComponents } from '../src/acoustics/vehicle/state-adapter.mjs';
import { createVehicleEnvironment, BoundedLateReverb } from '../src/acoustics/vehicle/environment.mjs';
import { VehicleAcousticPipeline, encodeVehicleRa07, encodeVehicleWav } from '../src/acoustics/vehicle/pipeline.mjs';
import { audioMetrics } from '../src/acoustics/engine/signals.mjs';
import { privateStoragePath } from '../src/acoustics/research/research-private-storage.mjs';

const FS = 48000, BLOCK = 512, root = fileURLToPath(new URL('..', import.meta.url));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function timingSummary(values, deadlineMs = BLOCK / FS * 1000) {
  const sorted = [...values].sort((a, b) => a - b);
  return { blocks: values.length, deadlineMs, medianMs: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    maximumMs: sorted.at(-1) ?? 0, deadlineMisses: values.filter(x => x > deadlineMs).length };
}

export function authoredControl(kind, t, profile) {
  const idle = profile.idleRpm, red = profile.redlineRpm;
  const c = { estimatedRpm: idle, load: 0.12, throttle: 0.1, speed: 0, gear: 1,
    engineRunning: true, overrun: false, roadSurface: 'asphalt' };
  if (kind === 'idle') return c;
  if (kind === 'steady') return { ...c, estimatedRpm: idle + 0.66 * (red - idle), load: 0.72, throttle: 0.8, speed: 25, gear: 3 };
  if (kind === 'acceleration') {
    const a = clamp((t - 0.8) / 6.8, 0, 1);
    return { ...c, estimatedRpm: idle + a * (red - idle) * 0.96, load: 0.15 + a * 0.8,
      throttle: 0.15 + a * 0.8, speed: a * 45, gear: 2 };
  }
  if (kind === 'upshift') {
    const shift = t >= 3;
    return { ...c, estimatedRpm: shift ? 0.65 * red + Math.min(t - 3, 3) * 500 : idle + clamp(t / 2.6, 0, 1) * (0.93 * red - idle),
      load: t >= 3 && t < 3.14 ? 0.08 : 0.8, throttle: 0.82, speed: 26 + t * 3, gear: shift ? 3 : 2 };
  }
  if (kind === 'lift') {
    const lift = t >= 2;
    return { ...c, estimatedRpm: lift ? Math.max(idle, 0.8 * red - (t - 2) * 950) : 0.8 * red,
      load: lift ? 0.06 : 0.8, throttle: lift ? 0 : 0.85, speed: Math.max(5, 40 - Math.max(0, t - 2) * 4),
      gear: 3, overrun: lift };
  }
  if (kind === 'tunnel') return { ...c, estimatedRpm: 0.6 * red, load: t < 4 ? 0.72 : 0,
    throttle: t < 4 ? 0.75 : 0, speed: t < 4 ? 10 : 0, gear: 3, engineRunning: t < 4 };
  return { ...c, estimatedRpm: 0.78 * red, load: 0.82, throttle: 0.9, speed: 60, gear: 4 };
}

export const vehicleDemoCases = [
  { id: '01-idle-near', label: 'V12 nearby idle', operating: 'idle', environment: 'direct', duration: 7, motion: 'stationary' },
  { id: '02-acceleration', label: 'V12 acceleration · stationary source study', operating: 'acceleration', environment: 'direct', duration: 9, motion: 'stationary' },
  { id: '03-upshift', label: 'V12 upshift at 3 s · stationary source study', operating: 'upshift', environment: 'direct', duration: 7, motion: 'stationary' },
  { id: '04-throttle-lift', label: 'V12 throttle lift at 2 s · stationary source study', operating: 'lift', environment: 'direct', duration: 7, motion: 'stationary' },
  { id: '05-pass-direct', label: '216 km/h pass · direct only', operating: 'pass', environment: 'direct', duration: 4, motion: 'pass' },
  { id: '06-distant-departure', label: 'V12 departure · 8 to 116 m', operating: 'steady', environment: 'direct', duration: 9, motion: 'departure' },
  { id: '07-pass-reflections', label: 'Identical pass · finite street reflections', operating: 'pass', environment: 'canyon', duration: 4, motion: 'pass' },
  { id: '08-tunnel-early', label: 'Analytic tunnel · early paths only', operating: 'tunnel', environment: 'tunnel', duration: 9, motion: 'tunnel' },
  { id: '09-tunnel-late', label: 'Identical tunnel · early + statistical late field', operating: 'tunnel', environment: 'tunnel', duration: 9, motion: 'tunnel', late: true },
  { id: '10-obstruction', label: 'Finite barrier · material transmission', operating: 'steady', environment: 'corner', duration: 7, motion: 'corner' },
  { id: '11-road-v8', label: 'Distinct V8 · stationary acceleration study', operating: 'acceleration', environment: 'direct', duration: 9, motion: 'stationary', profile: 'roadV8' },
  { id: '12-beacon-600', label: '600 Hz diagnostic reference · 0.22 source amplitude', operating: 'idle', environment: 'direct', duration: 7, motion: 'stationary', beacon: true },
];

function poseAt(spec, t) {
  let x = 0, speed = 0;
  if (spec.motion === 'pass') { x = -120 + t * 60; speed = 60; }
  if (spec.motion === 'departure') { x = 8 + 12 * t; speed = 12; }
  if (spec.motion === 'tunnel') {
    const brakeTime = clamp(t - 2, 0, 2);
    x = t < 2 ? -10 + 5 * t : 5 * brakeTime - 1.25 * brakeTime * brakeTime;
    speed = t < 2 ? 5 : Math.max(0, 5 - 2.5 * brakeTime);
  }
  if (spec.motion === 'corner') { x = -25 + 8 * t; speed = 8; }
  return { position: [x, 0, 0.35], velocity: [speed, 0, 0], forward: [1, 0, 0], up: [0, 0, 1] };
}
const hashArrays = arrays => { const hash = createHash('sha256'); for (const a of arrays) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); return hash.digest('hex'); };

export async function renderVehicleCase(spec, { quality = 'quality', acceleration = 'cpu', duration = spec.duration,
  seed = 731 } = {}) {
  if (!(duration > 0 && duration <= 30)) throw Error('bounded vehicle demo duration');
  const profile = vehicleProfiles[spec.profile ?? 'hypercarV12'];
  const synth = new VehicleSynthesizer(profile, { sampleRate: FS, seed });
  const environment = createVehicleEnvironment(spec.environment, { quality, duration: duration + 1 });
  const ids = vehicleComponents.map(component => `vehicle:1:${component}`);
  const pipeline = new VehicleAcousticPipeline({ scene: environment.scene, sourceIds: ids, quality, acceleration,
    masterGain: 0.7, directStem: !!spec.late });
  const late = spec.late ? new BoundedLateReverb(environment.lateEvidence) : null;
  const total = Math.round(duration * FS), left = new Float32Array(total), right = new Float32Array(total), dry = new Float32Array(total);
  const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK), dl = new Float32Array(BLOCK), dr = new Float32Array(BLOCK);
  const wl = new Float32Array(BLOCK), wr = new Float32Array(BLOCK), fullBuffers = createVehicleBuffers(BLOCK);
  const remainderBuffers = total % BLOCK ? createVehicleBuffers(total % BLOCK) : fullBuffers;
  const timings = { synthesis: [], control: [], dsp: [], late: [], total: [] }, pathCounts = { 0: 0, 1: 0, 2: 0 };
  const snapshots = [], dryHash = createHash('sha256');
  let maximumPaths = 0, firstArrival = null, block = 0, ra07Hash = createHash('sha256');
  const packet = Buffer.alloc(4112), cpuStart = process.cpuUsage(), start = performance.now();
  try {
    if (acceleration !== 'cpu') await pipeline.backend.ready();
    for (let at = 0; at < total; at += BLOCK, block++) {
      const begin = performance.now(), frames = Math.min(BLOCK, total - at), time = at / FS;
      const controls = authoredControl(spec.operating, time, profile);
      // Authored test state; these throttle/load values are not GTA observations.
      const vehicle = { id: 'vehicle:1', generation: 1, ...poseAt(spec, time), valid: true, controls };
      if (spec.motion !== 'stationary') controls.speed = Math.hypot(...vehicle.velocity);
      const layout = profile.components ?? defaultVehicleLayout;
      const emitters = componentEmitters(vehicle, layout);
      let stamp = performance.now();
      const generated = synth.renderInto(controls, frames === BLOCK ? fullBuffers : remainderBuffers);
      if (spec.beacon) {
        for (const component of vehicleComponents) generated.layers[component].fill(0);
        for (let i = 0; i < frames; i++) generated.layers.mechanical[i] = 0.22 * Math.sin(2 * Math.PI * 600 * (at + i) / FS);
        generated.mixed.set(generated.layers.mechanical);
      }
      timings.synthesis.push(performance.now() - stamp);
      const inputs = Object.fromEntries(vehicleComponents.map(component => [`vehicle:1:${component}`, generated.layers[component]]));
      for (const component of vehicleComponents) dryHash.update(Buffer.from(generated.layers[component].buffer,
        generated.layers[component].byteOffset, frames * 4));
      stamp = performance.now();
      const listener = { position: spec.motion === 'corner' ? [6, 4, 1.5] : [0, 4, 1.5], velocity: [0, 0, 0], forward: [0, 1, 0], up: [0, 0, 1] };
      const control = await pipeline.prepare({ time, session: 'vehicle-physics-authored', generation: 1, listener, sources: emitters });
      timings.control.push(performance.now() - stamp);
      maximumPaths = Math.max(maximumPaths, control.paths.length);
      for (const p of control.paths) pathCounts[p.order]++;
      if (control.paths.length && firstArrival === null) firstArrival = time;
      if (block % 20 === 0) snapshots.push({ time, controls, position: vehicle.position, paths: control.paths.map(p => ({ sourceId: p.sourceId,
        order: p.order, distance: p.distance, delay: p.delay, rate: p.rate, bands: p.bands, pan: p.pan })) });
      stamp = performance.now();
      pipeline.process(inputs, l, r, frames, dl, dr);
      timings.dsp.push(performance.now() - stamp);
      stamp = performance.now();
      if (late) {
        const inside = Math.abs(vehicle.position[0]) < 40 && Math.abs(vehicle.position[1]) < 7;
        late.setEnabled(inside);
        late.processInto(dl.subarray(0, frames), dr.subarray(0, frames), wl.subarray(0, frames), wr.subarray(0, frames));
        for (let i = 0; i < frames; i++) { l[i] += wl[i]; r[i] += wr[i]; }
      }
      timings.late.push(performance.now() - stamp);
      left.set(l.subarray(0, frames), at); right.set(r.subarray(0, frames), at);
      dry.set(generated.mixed.subarray(0, frames), at);
      if (frames === BLOCK) ra07Hash.update(encodeVehicleRa07(l, r, block, packet));
      timings.total.push(performance.now() - begin);
    }
    const cpu = process.cpuUsage(cpuStart), metrics = audioMetrics([left, right]);
    if (metrics.nonfiniteSamples || metrics.clippedSamples || metrics.rms === 0) throw Error('nonfinite, clipped or silent vehicle result');
    return { left, right, dry, report: { id: spec.id, label: spec.label, profile: profile.id ?? spec.profile ?? 'hypercarV12',
      duration, sampleRate: FS, channels: 2, commonMasterGain: 0.7, independentlyNormalised: false,
      sourceBasis: 'original-generated; authored-operating-state; profile-estimates',
      environment: environment.description, limitations: environment.limitations,
      firstArrival, maximumPaths, pathCounts, metrics, dryMetrics: audioMetrics([dry]),
      hashes: { components: dryHash.digest('hex'), stereoFloat: hashArrays([left, right]), ra07: ra07Hash.digest('hex') },
      timings: Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, timingSummary(values)])),
      wallMs: performance.now() - start, nodeCpuMs: (cpu.user + cpu.system) / 1000,
      pipeline: pipeline.diagnostics(), late: late?.diagnostics() ?? null, controls: snapshots,
      perceptualAcceptance: 'unverified-human-listening-required',
      deadlineScope: 'offline serial processing; not WASAPI scheduling or GTA-load proof' } };
  } finally { pipeline.close(); }
}

function listenHtml(reports) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio · Vehicle Physics 01</title>
<style>body{margin:0;background:#0b1119;color:#eaf0f7;font:16px system-ui}main{max-width:1060px;margin:auto;padding:40px 24px}h1{font-size:36px;margin:10px 0}p{line-height:1.6;color:#b7c7d9}small{color:#91a5bb}article{padding:22px;margin:18px 0;background:#141f2d;border:1px solid #29394c;border-radius:12px}h2{margin:0 0 14px;font-size:21px}audio{width:100%}a{color:#82cfff}.tag{font-size:12px;letter-spacing:.15em;color:#78d5c7}img{max-width:100%;margin-top:14px}button{padding:8px 14px;border:1px solid #638095;border-radius:6px;background:#203246;color:white;margin-right:8px}</style>
<main><span class="tag">ORIGINAL SYNTHESIS / ACTUAL RICHAUDIO PROPAGATION</span><h1>Vehicle Physics 01</h1><p>V12 hypercar and V8 source studies. 48 kHz stereo, common gain, no per-file normalisation. Authored metre-scale scenes and estimated profiles; no calibrated SPL or manufacturer reproduction. Playback starts only when you press play. Human perceptual acceptance remains open.</p>
<p>Pass A/B files use byte-identical component PCM. The tunnel late field is an evidence-gated statistical approximation, separate from finite early paths. The barrier case demonstrates transmission; edge diffraction is unavailable.</p>
<p>Comparison playback level: <button data-level="0.25">Low</button><button data-level="0.5">Medium</button><button data-level="1">Full file level</button> <small>Changes every player equally. No automatic playback.</small></p>
${reports.map(r => `<article><h2>${r.label}</h2><audio controls preload="none" src="${r.id}.wav"></audio><p><a href="${r.id}-dry.wav">Dry source WAV</a> · <a href="${r.id}.wav">Stereo WAV</a> · ${r.metrics.rms.toFixed(5)} RMS · ${r.metrics.peak.toFixed(4)} peak · ${r.maximumPaths} simultaneous component paths</p><details><summary>Waveform and spectrum</summary><img loading="lazy" alt="Measured waveform and spectrogram" src="${r.id}.png"></details></article>`).join('')}
<p><a href="measurements.json">Render measurements</a> · <a href="spectral-measurements.json">Spectral and loudness measurements</a></p></main><script>for(const b of document.querySelectorAll('button[data-level]'))b.onclick=()=>{for(const a of document.querySelectorAll('audio'))a.volume=Number(b.dataset.level)};for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()});</script></html>`;
}

export async function renderVehicleDemo(output, options = {}) {
  const out = privateStoragePath(root, output); fs.mkdirSync(out, { recursive: true });
  const reports = [];
  for (const spec of vehicleDemoCases) {
    const result = await renderVehicleCase(spec, options);
    fs.writeFileSync(path.join(out, `${spec.id}.wav`), encodeVehicleWav([result.left, result.right]));
    fs.writeFileSync(path.join(out, `${spec.id}-dry.wav`), encodeVehicleWav([result.dry, result.dry]));
    reports.push(result.report); console.log(`${spec.id}: RMS ${result.report.metrics.rms.toFixed(5)}, peak ${result.report.metrics.peak.toFixed(4)}`);
  }
  const comparisons = { samePassComponents: reports[4].hashes.components === reports[6].hashes.components,
    sameTunnelComponents: reports[7].hashes.components === reports[8].hashes.components };
  if (!Object.values(comparisons).every(Boolean)) throw Error('comparison source lineage differs');
  fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify({ schemaVersion: 1,
    baseCommit: 'd6390f1c125264d4fa6f0c1e9b53eddeb1f15046', comparisons, reports }, null, 2));
  fs.writeFileSync(path.join(out, 'listen.html'), listenHtml(reports));
  return reports;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? path.join(root, '.local/vehicle-physics/demo');
  await renderVehicleDemo(out);
}
