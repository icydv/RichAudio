// Private offline urban/exhaust comparison. No endpoint, game, playback or extraction.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadStockAssets, loadStockExhaustPops, StockVehicleSource, stockModels, stockRoles } from '../src/acoustics/vehicle/stock-source.mjs';
import { StockExhaustEvents } from '../src/acoustics/vehicle/stock-events.mjs';
import { VehicleAcousticPipeline, encodeVehicleWav } from '../src/acoustics/vehicle/pipeline.mjs';
import { StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { createUrbanEnvironment } from '../src/acoustics/vehicle/urban-environment.mjs';
import { vehicleDistanceSceneOptions } from '../src/acoustics/vehicle/distance-presentation.mjs';
import { acousticScene, trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';
import { audioMetrics } from '../src/acoustics/engine/signals.mjs';
import { inBox } from '../src/acoustics/research/local-geometry.mjs';
import { stockEmitters, stockDemonstrations } from './stock-source-01-scenario.mjs';
import { source04DelayedFlybyOperating } from './Render-StockSource04.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const FS = 48000, BLOCK = 512, MASTER = .7, DURATION = 10.3, EXHAUST_GAIN = 2.5;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const frozenSourceFiles = ['src/acoustics/vehicle/stock-source.mjs', 'src/acoustics/vehicle/stock-grain.mjs',
  'src/acoustics/vehicle/stock-events.mjs', 'src/acoustics/vehicle/distance-presentation.mjs'];
const scenarioFiles = ['tools/stock-source-01-scenario.mjs', 'tools/Render-StockSource03.mjs', 'tools/Render-StockSource04.mjs'];
const watched = [...frozenSourceFiles, ...scenarioFiles, 'src/acoustics/vehicle/pipeline.mjs', 'src/acoustics/vehicle/urban-environment.mjs',
  'src/acoustics/engine/contracts.mjs', 'src/acoustics/engine/paths.mjs', 'src/acoustics/streaming/causal.mjs',
  'tools/Render-StockSource05.mjs'];
const variants = [
  { name: 'road-baseline', width: 24, includeFacades: false, exhaustGain: 1 },
  { name: 'road-exhaust', width: 24, includeFacades: false, exhaustGain: EXHAUST_GAIN },
  ...[12, 24, 40].map(width => ({ name: 'urban' + width, width, includeFacades: true, exhaustGain: EXHAUST_GAIN })),
];

function summary(samples) {
  const sorted = samples.map(row => row.ms).sort((a, b) => a - b);
  return { blocks: samples.length, p95Ms: sorted[Math.floor(sorted.length * .95)], maximumMs: sorted.at(-1),
    misses: samples.filter(row => row.ms > row.deadlineMs).map(row => ({ atFrame: row.frame, elapsedMs: row.ms, deadlineMs: row.deadlineMs })) };
}
function voiceSnapshot(player) {
  return Object.fromEntries(stockRoles.map(role => [role, Object.fromEntries(['idle', 'accel', 'decel'].map(mode => {
    const voice = player.voices[role][mode];
    return [mode, { frames: voice.frame, phase: voice.phase, clockCycles: voice.clockCycles,
      maximumBoundaryStep: voice.maximumBoundaryStep, stats: voice.stats }];
  }))]));
}
function cityPose(time) {
  return { position: [22 * (time - 5.3), 0, 0], velocity: [22, 0, 0],
    forward: [1, 0, 0], up: [0, 0, 1], speed: 22, acceleration: 0 };
}
const listener = { position: [0, 2, 1.4], velocity: [0, 0, 0], forward: [0, 1, 0], up: [0, 0, 1] };
function environment(options, duration = DURATION) {
  const authored = createUrbanEnvironment({ ...options, length: 240, height: 24, duration, maxOrder: 10, maxPaths: 32 });
  return { ...authored, scene: acousticScene(authored.scene.tile, authored.scene.materials,
    { ...authored.scene.config, ...vehicleDistanceSceneOptions('authored-detail-loss-v1') }) };
}
function rendererFaults(diagnostics) {
  return ['limited', 'missingHistory', 'cursorResets', 'rejectedControls', 'pathOverflow']
    .every(key => diagnostics.renderer[key] === 0) && diagnostics.history.affectedFrames === 0;
}
function rawRendererDiagnostics(renderer) {
  return { renderer: { ...renderer.stats }, history: renderer.historyDiagnostics };
}
function predictions(scene, sourcePosition, listenerPosition, pressureGain) {
  const track = position => trajectory([{ time: 0, position }, { time: 4, position }]);
  return candidatePaths(scene).map(candidate => {
    const result = solvePath(scene, { track: track(sourcePosition), directivity: 0 }, track(listenerPosition), 2, candidate);
    return result.status === 'renderable' ? { id: candidate.id, order: result.order, distance: result.distance,
      delaySeconds: result.delay, arrivalSeconds: .5 + result.delay,
      reflectors: candidate.surfaces.map(surface => surface.id), bands: result.bands.map(gain => gain * pressureGain * MASTER) } : null;
  }).filter(Boolean).sort((a, b) => a.delaySeconds - b.delaySeconds || a.id.localeCompare(b.id));
}

export async function renderStockSource05({
  previousRoot = path.resolve(root, '../RichAudio-StockSource04'),
  manifestFile = path.resolve(root, '../RichAudio-StockSource01/.local/stock-source-01/assets-native/manifest.json'),
  sustainAtlasFile = path.resolve(root, '../RichAudio-StockSource03/.local/stock-source-03/sustain-assets/atlas.json'),
  mixFile = path.resolve(root, '../RichAudio-StockSource03/.local/stock-source-03/mix-final.json'),
  popManifestFile = path.resolve(root, '../RichAudio-StockSource03/.local/stock-source-03/x80-pops/manifest.json'),
  output = path.join(root, '.local/stock-source-05/audition'), commonPressureGain = 1, verifyInputsOnly = false, preflightOnly = false,
} = {}) {
  const out = path.resolve(output), previousAudition = path.join(previousRoot, '.local/stock-source-04/audition');
  assert.ok(out.startsWith(path.join(root, '.local') + path.sep), 'private output below this checkout required');
  assert.ok(!fs.existsSync(out), 'fresh output directory required');
  assert.ok(Number.isFinite(commonPressureGain) && commonPressureGain > 0 && commonPressureGain <= 1, 'common headroom gain in (0,1] required');
  const previousReportFile = path.join(previousAudition, 'render-report.json');
  const previousReport = JSON.parse(fs.readFileSync(previousReportFile, 'utf8'));
  assert.equal(previousReport.status, 'complete');
  assert.equal(previousReport.milestone, 'STOCK-SOURCE-04');
  const bindings = Object.fromEntries(watched.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
  const protectedFiles = new Map();
  const protect = file => { const hash = sha(fs.readFileSync(file)); protectedFiles.set(file, hash); return hash; };
  protect(previousReportFile);
  for (const file of frozenSourceFiles) {
    assert.equal(bindings[file], protect(path.join(previousRoot, file)), 'frozen Source04 source changed: ' + file);
    assert.equal(bindings[file], previousReport.moduleBindings[file], 'delivered Source04 source binding changed: ' + file);
  }
  const scenarioComparisons = scenarioFiles.map(file => {
    protect(path.join(previousRoot, file));
    const previous = fs.readFileSync(path.join(previousRoot, file), 'utf8').replace(/\r\n/g, '\n');
    const current = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(current, previous, 'scenario implementation changed: ' + file);
    return { file, normalizedLfSha256: sha(current),
      note: 'Current04 scenario text matches after LF normalization; historical render-script defaults were sanitized after04 rendering' };
  });
  for (const file of [manifestFile, sustainAtlasFile, mixFile, popManifestFile]) protect(file);
  const assets = loadStockAssets(manifestFile, { sustainAtlasFile }), popAssets = loadStockExhaustPops(popManifestFile);
  const mix = JSON.parse(fs.readFileSync(mixFile, 'utf8')), G = mix.sourceGain;
  assert.equal(mix.phase, 'new03-corrected-texture-verified');
  assert.equal(sha(fs.readFileSync(sustainAtlasFile)), mix.sustainAtlasSha256);
  assert.equal(G, previousReport.sourceGain);
  assert.equal(MASTER, previousReport.rendererMasterGain);
  const nativeReferences = [];
  for (const vehicle of assets.vehicles.values()) for (const role of stockRoles) for (const mode of ['idle', 'accel', 'decel']) {
    const asset = vehicle.layers[role][mode];
    protect(path.join(assets.base, asset.file));
    const file = path.join(assets.base, asset.wavFile), hash = protect(file);
    assert.equal(hash.toUpperCase(), asset.sourceWavSha256.toUpperCase());
    nativeReferences.push({ model: vehicle.model, role, mode, path: file, sha256: hash, sampleRate: asset.sampleRate });
  }
  for (const asset of popAssets.variants) { protect(path.join(popAssets.base, asset.file)); protect(path.join(popAssets.base, asset.wavFile)); }
  const beforeReferences = [];
  for (const model of stockModels) for (const kind of ['open', 'street']) {
    const record = previousReport.files.find(file => file.model === model && file.name === 'new04-delayed-' + kind);
    assert.ok(record);
    const file = path.join(previousAudition, record.file);
    assert.equal(protect(file), record.sha256);
    beforeReferences.push({ model, name: record.name, kind, path: file, sha256: record.sha256,
      sourceHash: record.sourceHash, controlHash: record.controlHash, motionHash: record.motionHash,
      interpretation: 'Previous04 native source performance; its faster motion and finite10m geometry differ from this controlled city test' });
  }
  if (verifyInputsOnly) return { status: 'inputs-verified', protectedInputCount: protectedFiles.size, frozenSourceFiles, moduleBindings: bindings };
  const report = { schemaVersion: 1, milestone: 'STOCK-SOURCE-05', status: 'rendering', sampleRate: FS, blockFrames: BLOCK,
    sourceGain: G, rendererMasterGain: MASTER, commonPressureGain, exhaustPressureGain: EXHAUST_GAIN,
    exhaustPressureGainDb: 20 * Math.log10(EXHAUST_GAIN),
    calibration: 'Authored emitter pressure: engine1, exhaust2.5; +7.9588dB relative to previous exhaust only, not measured SPL; no normalization',
    sourceReuse: 'Exact unchanged Source04 source classes, delayed-lift operating function, controls, source gain, native PCM, mix shares and authored event plan',
    inputs: { manifestFile, sustainAtlasFile, mixFile, popManifestFile, previousRoot }, moduleBindings: bindings, frozenSourceFiles,
    nativeReferences, beforeReferences, scenarioComparisons, previousPage: path.join(previousAudition, 'index.html'),
    scenario: { durationSeconds: DURATION, speedMetresPerSecond: 22, vehiclePosition: '[22*(t-5.3),0,0]', listener,
      liftSeconds: 6.3, eventSeconds: 6.32, distancePresentation: 'authored-detail-loss-v1',
      geometry: 'Authored finite240m open-ended street,24m tall facades, open roof; widths12/24/40m',
      noPositionReset: true, noSceneReplacement: true, noFdn: true },
    files: [], preflightOnly, gameLaunched: false, audioEndpointOpened: false, subjectiveListeningPerformed: false,
    limitations: ['Urban geometry and energy coefficients are authored assumptions unrelated to Legion Square',
      'Finite specular wall paths through order10 do not implement diffuse late reverb or measured modal resonance',
      'Residual Lectro/X80 pitch stepping remains open; this work changes no source pitch/texture controls',
      'Offline timings retain every deadline miss and do not certify live performance',
      'A fixed22m/s trajectory isolates city and exhaust comparisons; previous04 faster flybys are contextual references'] };
  fs.mkdirSync(out, { recursive: true });
  const save = () => json(path.join(out, 'render-report.json'), report);
  const write = (record, left, right) => {
    const metrics = audioMetrics([left, right]);
    assert.ok(metrics.nonfiniteSamples === 0 && metrics.clippedSamples === 0 && metrics.peak < .98,
      `headroom/finite check failed ${record.file}: ${JSON.stringify(metrics)}; choose one common headroom scalar only`);
    const bytes = encodeVehicleWav([left, right]);
    fs.mkdirSync(path.dirname(path.join(out, record.file)), { recursive: true });
    fs.writeFileSync(path.join(out, record.file), bytes);
    const result = { ...record, metrics, sha256: sha(bytes) };
    report.files.push(result); save(); return result;
  };
  save();

  async function mainRun(model, variant) {
    const total = Math.round(DURATION * FS), profile = mix.profiles[model], ids = stockRoles.map(role => 'stock:' + model + ':' + role);
    assert.equal(profile.sourceGain, G);
    const eventPlan = model === 'prototipo' ? [{ atFrame: Math.round(6.32 * FS), variant: 0, basis: 'authored-offline-lift' }] : [];
    const startInit = performance.now();
    const player = new StockVehicleSource(assets.vehicles.get(model), { sourceGain: G,
      pressureSharesByState: profile.pressureSharesByState,
      ...(eventPlan.length ? { exhaustEvents: { assets: popAssets, triggers: eventPlan } } : {}) });
    const env = environment(variant), sourcePressureGains = { [ids[0]]: commonPressureGain, [ids[1]]: commonPressureGain * variant.exhaustGain };
    const pipeline = new VehicleAcousticPipeline({ scene: env.scene, sourceIds: ids, quality: 'quality',
      acceleration: 'cpu', masterGain: MASTER, sourcePressureGains });
    const stems = model === 'prototipo' && variant.name === 'urban24'
      ? Object.fromEntries(['direct', 'early', 'train'].map(component => [component, {
        renderer: new StreamingRenderer({ sourceIds: ids, maxPathsPerSource: 32, pathCapacityPerSource: 64,
          masterGain: MASTER, historyDiagnostics: true, generationReleaseGuard: true, sourcePressureGains }),
        left: new Float32Array(total), right: new Float32Array(total), l: new Float32Array(BLOCK), r: new Float32Array(BLOCK),
      }])) : null;
    const initializationMs = performance.now() - startInit;
    const left = new Float32Array(total), right = new Float32Array(total), e = new Float32Array(BLOCK), x = new Float32Array(BLOCK),
      l = new Float32Array(BLOCK), r = new Float32Array(BLOCK), rows = [];
    const timing = { source: [], rendererAndControl: [], complete: [] }, sourceHash = createHash('sha256'),
      controlHash = createHash('sha256'), motionHash = createHash('sha256');
    const maximumOrders = Array(11).fill(0), exhaustOrders = Array(11).fill(0);
    let peakInput = 0, maximumRetardedFrameError = 0, minimumRate = Infinity, maximumRate = 0;
    const begin = performance.now(), cpu = process.cpuUsage();
    try {
      for (let at = 0; at < total; at += BLOCK) {
        const start = performance.now(), frames = Math.min(BLOCK, total - at), time = at / FS, deadlineMs = frames / FS * 1000;
        const control = source04DelayedFlybyOperating(time), pose = cityPose(time);
        let stamp = performance.now();
        player.renderInto(control, e, x, frames);
        timing.source.push({ frame: at, ms: performance.now() - stamp, deadlineMs });
        sourceHash.update(Buffer.from(e.buffer, 0, frames * 4)); sourceHash.update(Buffer.from(x.buffer, 0, frames * 4));
        controlHash.update(JSON.stringify([time, control])); motionHash.update(JSON.stringify([time, pose, listener]));
        for (let i = 0; i < frames; i++) peakInput = Math.max(peakInput, Math.abs(e[i]), Math.abs(x[i]));
        stamp = performance.now();
        const emitters = stockEmitters(model, pose).map(source => ({ ...source,
          directivity: profile.directivity[source.id.endsWith('engine') ? 'engine' : 'exhaust'] }));
        assert.ok(inBox(listener.position, env.scene.tile.bounds) && emitters.every(source => inBox(source.position, env.scene.tile.bounds)));
        const paths = await pipeline.prepare({ time, session: 'source05-city', generation: 1, listener, sources: emitters });
        const counts = Array(11).fill(0), exhaust = Array(11).fill(0);
        for (const item of paths.paths) {
          assert.ok(Math.abs(item.delay - item.distance / 343) < 1e-8);
          maximumRetardedFrameError = Math.max(maximumRetardedFrameError, Math.abs(item.emissionFrame - (time - item.delay) * FS));
          minimumRate = Math.min(minimumRate, item.rate); maximumRate = Math.max(maximumRate, item.rate);
          assert.ok(item.rate >= 1 / (1 + 22 / 343) - .02 && item.rate <= 1 / (1 - 22 / 343) + .02);
          counts[item.order]++; if (item.sourceId.endsWith('exhaust')) exhaust[item.order]++;
        }
        for (let order = 0; order <= 10; order++) {
          maximumOrders[order] = Math.max(maximumOrders[order], counts[order]);
          exhaustOrders[order] = Math.max(exhaustOrders[order], exhaust[order]);
        }
        pipeline.process({ [ids[0]]: e, [ids[1]]: x }, l, r, frames);
        timing.rendererAndControl.push({ frame: at, ms: performance.now() - stamp, deadlineMs });
        left.set(l.subarray(0, frames), at); right.set(r.subarray(0, frames), at);
        timing.complete.push({ frame: at, ms: performance.now() - start, deadlineMs });
        // Diagnostic stem rendering follows the complete-block timing interval.
        // It receives the exact accepted controls, dry histories and emitter pressure gains.
        if (stems) for (const [component, stem] of Object.entries(stems)) {
          stem.renderer.accept({ ...paths, paths: paths.paths.filter(item => component === 'direct' ? item.order === 0
            : component === 'early' ? item.order >= 1 && item.order <= 2 : item.order >= 3) });
          stem.renderer.process({ [ids[0]]: e, [ids[1]]: x }, stem.l, stem.r, frames);
          stem.left.set(stem.l.subarray(0, frames), at); stem.right.set(stem.r.subarray(0, frames), at);
        }
        if (at % (5 * BLOCK) === 0) rows.push({ timeSeconds: time, control,
          pose: { x: pose.position[0], speed: 22 }, orders: counts, exhaustOrders: exhaust,
          sourceAddress: player.position, modeWeights: [...player.weights], runningEnvelope: player.envelope });
      }
      const diagnostics = pipeline.diagnostics(), used = process.cpuUsage(cpu);
      const checks = { finite: true, unclipped: true, inputBound: peakInput <= .980001,
        noSourceOverreads: Object.values(player.voices).flatMap(Object.values).every(voice => voice.stats.sourceBoundViolations === 0),
        retardedFrameAgreement: maximumRetardedFrameError < 1, noRendererFaults: rendererFaults(diagnostics),
        noSceneReplacement: diagnostics.simulation.sceneReplacements === 0,
        cityExhaustTrain: !variant.includeFacades || exhaustOrders.slice(3).every(count => count >= 2),
        plannedNativeEventCompleted: !eventPlan.length || player.stats.events.triggered === 1 && player.stats.events.completed === 1 };
      if (!Object.values(checks).every(Boolean)) {
        report.failedCase = { model, name: variant.name, checks, diagnostics, metrics: audioMetrics([left, right]) }; save();
      }
      assert.ok(Object.values(checks).every(Boolean), 'main render checks failed: ' + model + '/' + variant.name + JSON.stringify(checks));
      const record = write({ model, name: variant.name, file: model + '/' + variant.name + '.wav', category: 'main',
        width: variant.width, wallTreatment: variant.includeFacades ? 'reflective' : 'absent', durationSeconds: DURATION,
        sourceGain: G, rendererMasterGain: MASTER, sourcePressureGains,
        sourceConfiguration: { pressureSharesByState: profile.pressureSharesByState }, directivity: profile.directivity,
        eventPlan, sourceHash: sourceHash.digest('hex'), controlHash: controlHash.digest('hex'), motionHash: motionHash.digest('hex'),
        sourceStats: player.stats, voices: voiceSnapshot(player), peakInput, checks, diagnostics,
        geometryProvenance: env.provenance, propagation: { maximumRetardedFrameError, minimumRate, maximumRate, maximumOrders, exhaustOrders },
        timings: Object.fromEntries(Object.entries(timing).map(([key, samples]) => [key, summary(samples)])),
        initializationMs, wallMs: performance.now() - begin, nodeCpuMs: (used.user + used.system) / 1000, rows }, left, right);
      if (stems) {
        const sumLeft = new Float32Array(total), sumRight = new Float32Array(total);
        for (const [component, stem] of Object.entries(stems)) {
          const stemDiagnostics = rawRendererDiagnostics(stem.renderer);
          assert.ok(rendererFaults(stemDiagnostics));
          for (let i = 0; i < total; i++) { sumLeft[i] += stem.left[i]; sumRight[i] += stem.right[i]; }
          write({ model, name: 'urban24-' + component, file: model + '/urban24-' + component + '.wav', category: 'stem',
            width: 24, component, durationSeconds: DURATION, derivedFrom: record.file, sourceHash: record.sourceHash,
            controlHash: record.controlHash, motionHash: record.motionHash, sourcePressureGains, diagnostics: stemDiagnostics,
            checks: { identicalAcceptedControlsAndHistories: true, noRendererFaults: true },
            interpretation: 'Order-filtered actual full-render controls; identical PCM histories, calibration and master; no compensation' }, stem.left, stem.right);
        }
        let maximumSumError = 0;
        for (let i = 0; i < total; i++) maximumSumError = Math.max(maximumSumError,
          Math.abs(sumLeft[i] - left[i]), Math.abs(sumRight[i] - right[i]));
        assert.ok(maximumSumError < 2e-7, 'direct+early+train must reproduce full urban24 render');
        write({ model, name: 'urban24-sum', file: model + '/urban24-sum.wav', category: 'stem', component: 'sum',
          width: 24, durationSeconds: DURATION, derivedFrom: record.file, sourceHash: record.sourceHash,
          controlHash: record.controlHash, motionHash: record.motionHash, sourcePressureGains, maximumSumError,
          checks: { linearStemReconstruction: true }, interpretation: 'Arithmetic direct+early+train sum; no normalization' }, sumLeft, sumRight);
      }
      console.log(model + ' ' + variant.name + ' peak=' + record.metrics.peak.toFixed(5) + ' completeMisses=' + record.timings.complete.misses.length);
      return record;
    } finally { pipeline.close(); }
  }

  async function isolatedRun(width, wallTreatment, category) {
    const duration = 4, total = FS * duration, id = 'stock:prototipo:exhaust';
    const env = environment({ width, wallTreatment }, duration), sourcePosition = [-8, 0, 1.4], stationaryListener = {
      ...listener, position: [0, 0, 1.4] }, sourcePressureGains = { [id]: commonPressureGain * EXHAUST_GAIN };
    const source = { id, generation: 1, position: sourcePosition, velocity: [0, 0, 0], forward: [-1, 0, 0], up: [0, 0, 1],
      directivity: 0, valid: true, emitting: true, rights: 'private-decoded-game-assets', placementBasis: 'authored-stationary-diagnostic' };
    const event = category === 'pop' ? new StockExhaustEvents({ assets: popAssets, triggers: [{ atFrame: FS / 2, variant: 0,
      basis: 'authored-offline-lift' }], bedPeakBound: 0, roleGainBound: 1, maximumGain: .25 }) : null;
    const pipeline = new VehicleAcousticPipeline({ scene: env.scene, sourceIds: [id], quality: 'quality', acceleration: 'cpu',
      masterGain: MASTER, sourcePressureGains });
    const left = new Float32Array(total), right = new Float32Array(total), input = new Float32Array(BLOCK),
      l = new Float32Array(BLOCK), r = new Float32Array(BLOCK), timing = [], inputHash = createHash('sha256');
    let firstNonzeroInputFrame = null, lastNonzeroInputFrame = null;
    try {
      for (let at = 0; at < total; at += BLOCK) {
        const start = performance.now(), frames = Math.min(BLOCK, total - at), time = at / FS;
        for (let i = 0; i < frames; i++) {
          input[i] = event ? event.next(at + i) : at + i === FS / 2 ? .25 : 0;
          if (input[i] !== 0) { firstNonzeroInputFrame ??= at + i; lastNonzeroInputFrame = at + i; }
        }
        inputHash.update(Buffer.from(input.buffer, 0, frames * 4));
        await pipeline.prepare({ time, session: 'source05-isolated-' + category, generation: 1, listener: stationaryListener, sources: [source] });
        pipeline.process({ [id]: input }, l, r, frames);
        left.set(l.subarray(0, frames), at); right.set(r.subarray(0, frames), at);
        timing.push({ frame: at, ms: performance.now() - start, deadlineMs: frames / FS * 1000 });
      }
      const diagnostics = pipeline.diagnostics();
      assert.ok(rendererFaults(diagnostics));
      assert.ok(!event || event.stats.triggered === 1 && event.stats.completed === 1);
      const name = category + '-width' + width + (wallTreatment === 'absorptive' ? '-absorptive' : '');
      const record = write({ model: 'prototipo', name, file: 'diagnostics/' + name + '.wav', category, component: 'full', width,
        wallTreatment, durationSeconds: duration, sourcePressureGains, rendererMasterGain: MASTER, sourceHash: inputHash.digest('hex'),
        geometryProvenance: env.provenance, input: { kind: category === 'pop' ? 'original-X80-native-pop-variant0' : 'original-single-sample-analytic-impulse',
          triggerSeconds: .5, eventGain: .25, firstNonzeroInputFrame, lastNonzeroInputFrame,
          nativeOnsetCaveat: category === 'pop' ? 'Native sample onset and finite edge treatment precede the return train; use matched impulse for exact arrival timing' : null,
          sourcePosition, listenerPosition: stationaryListener.position, directivity: 0 },
        eventStats: event?.stats ?? null, predictedArrivals: predictions(env.scene, sourcePosition, stationaryListener.position, sourcePressureGains[id]),
        diagnostics, timings: { complete: summary(timing) }, checks: { noRendererFaults: true, nativeEventCompleted: !event || event.stats.completed === 1 },
        interpretation: 'Stationary8m diagnostic with identical input across widths/materials; isotropic source isolates path geometry; no FDN or normalization' }, left, right);
      console.log(name + ' peak=' + record.metrics.peak.toFixed(5) + ' completeMisses=' + record.timings.complete.misses.length);
      return record;
    } finally { pipeline.close(); }
  }

  try {
    for (const model of stockModels) {
      const results = [];
      for (const variant of (preflightOnly ? variants.filter(item => item.name === 'urban12') : variants)) results.push(await mainRun(model, variant));
      for (const key of ['sourceHash', 'controlHash', 'motionHash']) for (const result of results)
        assert.equal(result[key], results[0][key], 'controlled variants differ: ' + model + '/' + key);
      const previous = beforeReferences.find(reference => reference.model === model && reference.kind === 'open');
      assert.equal(results[0].sourceHash, previous.sourceHash, 'source PCM differs from delivered Source04 delayed flyby');
      assert.equal(results[0].controlHash, previous.controlHash, 'operating controls differ from delivered Source04 delayed flyby');
    }
    for (const category of (preflightOnly ? [] : ['pop', 'impulse'])) {
      const results = [];
      for (const width of [12, 24, 40]) results.push(await isolatedRun(width, 'reflective', category));
      results.push(await isolatedRun(24, 'absorptive', category));
      assert.ok(results.every(result => result.sourceHash === results[0].sourceHash), 'isolated diagnostic inputs differ');
    }
    assert.equal(report.files.filter(file => file.category === 'main').length, preflightOnly ? 4 : 20);
    assert.equal(report.files.length, preflightOnly ? 4 : 32);
    for (const [file, hash] of protectedFiles) assert.equal(sha(fs.readFileSync(file)), hash, 'protected input changed: ' + file);
    for (const [file, hash] of Object.entries(bindings)) assert.equal(sha(fs.readFileSync(path.join(root, file))), hash, 'rendered module changed: ' + file);
    report.status = 'complete'; report.protectedInputCount = protectedFiles.size; report.protectedInputsUnchanged = true;
    report.frozenSource04PcmAndControlsVerified = true; save(); return report;
  } catch (error) { report.status = 'failed'; report.error = { name: error.name, message: error.message }; save(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}, paths = { '--manifest': 'manifestFile', '--sustain-atlas': 'sustainAtlasFile', '--mix': 'mixFile',
    '--pops': 'popManifestFile', '--previous-root': 'previousRoot', '--output': 'output' };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (paths[flag]) { assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), 'path required after ' + flag); options[paths[flag]] = path.resolve(process.argv[++i]); }
    else if (flag === '--common-gain') options.commonPressureGain = Number(process.argv[++i]);
    else if (flag === '--verify-inputs-only') options.verifyInputsOnly = true;
    else if (flag === '--preflight-only') options.preflightOnly = true;
    else throw Error('unknown argument: ' + flag);
  }
  renderStockSource05(options).then(result => { if (options.verifyInputsOnly) console.log(JSON.stringify(result, null, 2)); })
    .catch(error => { console.error(error); process.exitCode = 1; });
}
