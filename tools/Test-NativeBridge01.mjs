// Authored observations, a verified retained Bati bank, and the production
// source and acoustic pipeline. This runner has no GTA or audio-device adapter.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {splitBands} from '../src/acoustics/engine/renderer.mjs';
import {createTile, coordinateSpace} from '../src/acoustics/research/local-geometry.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {composeSceneUnion03, createSceneTileContext03} from '../src/acoustics/world/scene-union03.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {loadStockCatalogAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {vehicleBlockFrames as blockFrames, vehicleSampleRate as rate} from '../src/acoustics/vehicle/pipeline.mjs';
import {budgetFrame042, budgetSession042 as session, budgetWorld042 as worldDigest} from '../tests/fixtures/AcousticBudget042.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const retained = path.join(root, '.local/street01/fleet04-sustained24-retained-bati');
const receiptHash = 'd178384ab796b38e52d4c46ac4de3a4acde8b1534c37548d279720bb59946e96';
const model = 0xf9300cc5;
const period = blockFrames / rate;
const roles = ['engine', 'exhaust'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const newDigest = () => createHash('sha256');
const pcmBytes = pcm => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

function loadBank() {
  const read = file => fs.readFileSync(privateStoragePath(root, file));
  const receipt = read(path.join(retained, 'benchmark-inputs.json'));
  assert.equal(hash(receipt), receiptHash, 'retained benchmark input receipt');
  const pins = JSON.parse(receipt).package.retainedBati.reads;
  const metadata = ['atlas.json', 'catalog.json', 'profiles.json', 'player/manifest.json', 'player/analysis-intervals.json'];
  const layers = roles.flatMap(role => ['idle', 'accel', 'decel'].map(state => `player/bati/${role}_${state}.f32`));
  assert.deepEqual(pins.map(pin => pin.file).sort(), [...metadata, ...layers].map(file => `sources/${file}`).sort());
  const source = file => path.join(retained, 'package', file);
  for (const pin of pins) {
    const bytes = read(source(pin.file));
    assert.equal(bytes.length, pin.bytes, pin.file);
    assert.equal(hash(bytes), pin.sha256, pin.file);
  }
  const manifest = source('sources/player/manifest.json');
  const vehicles = JSON.parse(read(manifest)).vehicles;
  assert.deepEqual(vehicles.map(v => v.model), ['bati']);
  assert.deepEqual(roles.flatMap(role => ['idle', 'accel', 'decel'].map(state =>
    `player/${vehicles[0].layers[role][state].file.replaceAll('\\', '/')}`)), layers);
  const assets = loadStockCatalogAssets(manifest, {sustainAtlasFile: source('sources/atlas.json')});
  const registry = loadInstalledStockRegistry({catalogFile: source('sources/catalog.json'),
    catalogSha256: pins.find(pin => pin.file === 'sources/catalog.json').sha256, assets});
  const profiles = JSON.parse(read(source('sources/profiles.json')));
  const resolution = registry.resolve(model, 'player');
  assert.equal(resolution.basis, 'exact-installed-six-stream-graph');
  assert.equal(resolution.runtimeSelectionObserved, false);
  const preparation = registry.prepareSource10(model, 'player');
  assert.equal(preparation.sourceFramesAdvanced, 0);
  return {registry, profiles, evidence: {receiptHash, pins, basis: resolution.basis, preparation}};
}

function vehicle(id, x, speed = 0, generation = 1) {
  return {id, generation, model, context: 'player', position: [x, 0, 1], velocity: [speed, 0, 0],
    forward: [-1, 0, 0], up: [0, 0, 1], valid: true, running: true, operatingPoint: .55};
}

function fixture({registry, profiles}, fleet = false) {
  let wall = 0;
  const g = new StockGameplay({registry, profiles, session, now: () => wall,
    latencyProfile: 'street-01', continuityPolicy: 'camera-source-01',
    ...(fleet ? {vehicleSourcePolicy: 'catalogue-fleet-01'} : {})});
  g.setSettings({...g.settings, quality: 'balanced', acceleration: 'cpu'});
  function accept(block, vehicles, lease = 120) {
    wall = block * period * 1000;
    const observation = budgetFrame042(block, block * period);
    Object.assign(observation.listener, {position: [0, 0, 1], velocity: [0, 0, 0], forward: [1, 0, 0]});
    observation.vehicles = vehicles.map(v => ({...v, observationTicks: observation.listener.observationTicks}));
    g.accept(observation, 0, lease);
  }
  return {g, accept, async step(block, vehicles) {
    wall = block * period * 1000;
    if (vehicles) accept(block, vehicles);
    return g.render();
  }};
}

function observeDuration(object, name, durations) {
  const original = object[name];
  object[name] = function (...args) {
    const started = performance.now();
    const complete = () => durations.push(performance.now() - started);
    const result = original.apply(this, args);
    if (result instanceof Promise) return result.finally(complete);
    complete();
    return result;
  };
}

function timing(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = p => ordered[Math.ceil(p * ordered.length) - 1] ?? null;
  return {calls: ordered.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: ordered.at(-1) ?? null};
}

function measureStereo(output, distance) {
  const start = Math.round((2.5 + distance / 343) * rate);
  if (start + rate > output[0].length) return {stereoRms: null, stereoBandRms: null};
  const preroll = 2400;
  const energy = samples => samples.reduce((sum, sample) => sum + sample * sample, 0);
  let stereoEnergy = 0;
  const bandEnergy = [0, 0, 0];
  for (const channel of output) {
    stereoEnergy += energy(channel.subarray(start, start + rate));
    splitBands(channel.subarray(start - preroll, start + rate)).forEach((band, index) => {
      bandEnergy[index] += energy(band.subarray(preroll, preroll + rate));
    });
  }
  return {stereoRms: Math.sqrt(stereoEnergy / (2 * rate)), stereoBandRms: bandEnergy.map(e => Math.sqrt(e / (2 * rate)))};
}

function installGeometry(g, mode) {
  const until = 10000;
  const geometry = mode === 'reflect' ? {center: [12, 5, 2], normal: [0, -1, 0], u: [1, 0, 0]} :
    {center: [12, 0, 2], normal: [-1, 0, 0], u: [0, 1, 0]};
  const surface = {id: 'bridge01-wall', coordinateSpace, ...geometry, half: [5, 2.5], motion: 'static',
    reflectiveSide: 'both', provenance: {kind: 'synthetic', reference: 'original-bridge01-wall'},
    confidence: 1, version: 1, observedAt: 0, validUntil: until,
    material: {observedId: null, observedConfidence: null, acoustic: null}};
  const tile = createTile({schemaVersion: 1, id: 'bridge01-tile', coordinateSpace, timeUnit: 'monotonic-ms',
    bounds: {min: [-4, -12, -4], max: [32, 12, 8]}, listenerAnchor: [0, 0, 1],
    coverage: 'complete-synthetic', surfaces: [surface], missingRegions: [], version: 1, createdAt: 0,
    validUntil: until, build: 'original-bridge01', session, interior: 'outdoors', dynamicEpoch: 1});
  const materials = {[surface.id]: {reflection: [.64, .49, .25], transmission: [0, 0, 0],
    basis: 'authored-assumption', reference: 'bridge01-wall-assumption'}};
  const scene = acousticScene(tile, materials, {airDbPerMetre: g.direct.config.airDbPerMetre});
  const context = createSceneTileContext03({tileId: tile.id, worldDigest, scene,
    sourceBindings: [{id: surface.id, sha256: hash(JSON.stringify(surface))}]});
  const union = composeSceneUnion03({contexts: [context], worldDigest, session, generation: 1, listenerAnchor: tile.listenerAnchor});
  g.setPreparedResourceScene03(union.scene, {worldDigest, generation: 1});
}

async function renderScenario(bank, distance, {cutNative = false, speed = 0, geometry} = {}) {
  const {g, step} = fixture(bank);
  const stages = {completeRender: [], stockSynthesis: [], propagationPreparation: [], pcmMix: []};
  const dry = roles.map(newDigest), stereo = newDigest(), native = newDigest();
  const nativeBlock = new Float32Array(blockFrames);
  const cutBlock = 100, blocks = 480;
  const output = [new Float32Array(blocks * blockFrames), new Float32Array(blocks * blockFrames)];
  let owner, firstSourceBlock = null, firstStereo = null;
  let dryBlocksAfterCut = 0, nativeBlocksAfterCut = 0;
  try {
    if (geometry) installGeometry(g, geometry);
    observeDuration(g, 'render', stages.completeRender);
    observeDuration(g.pipeline, 'prepare', stages.propagationPreparation);
    observeDuration(g.pipeline, 'process', stages.pcmMix);
    for (let block = 0; block < blocks; block++) {
      const time = block * period;
      // Separate authored comparison stream. Neither this PCM nor its cull
      // event is a field of the production vehicle/listener observation.
      nativeBlock.fill(cutNative && block >= cutBlock ? 0 : .03125);
      native.update(pcmBytes(nativeBlock));
      if (block >= cutBlock && nativeBlock[0] !== 0) nativeBlocksAfterCut++;
      if (block === blocks - 1) g.pipeline.simulation.captureSoundMap = true;
      const rendered = await step(block, [vehicle('observed-bati', distance + time * speed, speed)]);
      const source = g.slots[0].source;
      if (source) {
        if (!owner) {
          owner = source;
          firstSourceBlock = block;
          observeDuration(owner, 'renderInto', stages.stockSynthesis);
          assert.equal(source.frame, blockFrames);
        }
        assert.equal(source, owner);
        assert.equal(source.frame, (stages.stockSynthesis.length + 1) * blockFrames);
      }
      const signals = roles.map(role => g.inputs[`stock:slot0:${role}`]);
      signals.forEach((signal, i) => dry[i].update(pcmBytes(signal)));
      if (block >= cutBlock && signals.every(signal => signal.some(sample => sample !== 0))) dryBlocksAfterCut++;
      for (const [index, channel] of rendered.entries()) {
        stereo.update(pcmBytes(channel));
        assert(channel.every(sample => Number.isFinite(sample) && Math.abs(sample) < 1));
        if (firstStereo === null && channel.some(sample => sample !== 0)) firstStereo = block;
        output[index].set(channel, block * blockFrames);
      }
    }
    const d = g.diagnostics();
    assert.equal(d.arrivals, 1);
    assert.equal(d.retired, 0);
    assert.equal(d.stageCounters.stereo.nonzeroBlocks > 0, firstStereo !== null);
    assert.equal(d.pipeline.renderer.missingHistory, 0);
    assert.equal(d.clippingFaults, 0);
    assert.equal(dryBlocksAfterCut, blocks - cutBlock);
    return {distance, speed, geometry: geometry ?? d.geometry, sourceFrames: owner.frame, dry: dry.map(h => h.digest('hex')),
      stereo: stereo.digest('hex'), native: native.digest('hex'), nativeBlocksAfterCut, dryBlocksAfterCut,
      sourceGeneration: d.sourceStates[0].generation, firstSourceBlock, firstStereo,
      stereoNonzeroBlocks: d.stageCounters.stereo.nonzeroBlocks, ...(speed ? {} : measureStereo(output, distance)),
      paths: g.pipeline.lastControl.paths.map(({sourceId, distance, delay, bands, rate, order}) => ({sourceId, distance, delay, bands, rate, order})),
      pathDecisions: g.pipeline.simulation.soundMapState.candidates.map(({sourceId, reason, result}) => ({sourceId, reason, status: result.status})),
      renderHistory: d.pipeline.history, timing: Object.fromEntries(Object.entries(stages).map(([name, values]) => [name, timing(values)]))};
  } finally { await g.close(); }
}

async function lifecycle(bank) {
  const {g, step, accept} = fixture(bank, true);
  const find = id => g.slots.find(slot => slot.vehicle?.id === id);
  const far = vehicle('far', 100);
  const close = Array.from({length: 5}, (_, i) => vehicle(`close-${i}`, 4 + i));
  let block = 0;
  const advance = async (count, vehicles) => { for (let i = 0; i < count; i++) await step(block++, vehicles); };
  try {
    await advance(36, [...close, far]);
    assert.equal(find('far'), undefined);
    assert.equal(g.diagnostics().fleetPopulation.virtualized, 1);
    const initialPopulation = g.diagnostics().fleetPopulation;
    const continuing = find('close-0').source;
    const before = continuing.frame;
    await advance(36, [close[0], far]);
    assert.equal(find('close-0').source, continuing);
    assert.equal(continuing.frame, before + 36 * blockFrames);
    const first = find('far').source;
    assert(first.frame > 0 && first.frame < continuing.frame);
    const firstWindowFrames = first.frame;
    await advance(36, [...close, far]);
    assert.equal(find('far'), undefined);
    const virtualization = g.lifecycle.lastRetirements.find(r => r.reason === 'voice-budget-virtualized');
    assert(virtualization && !virtualization.engineShutdownInferred);
    await advance(36, [close[0], far]);
    const reacquired = find('far').source;
    assert.notEqual(first, reacquired);
    assert.equal(reacquired.frame, firstWindowFrames);
    assert.equal(find('close-0').source, continuing);
    assert.equal(continuing.frame, before + 108 * blockFrames);
    assert.throws(() => accept(block, [{...far, operatingPoint: undefined}]), /vehicle identity\/state/);
    assert.throws(() => accept(block, [{...far, running: undefined}]), /vehicle identity\/state/);
    await advance(1, [{...far, valid: false}, close[0]]);
    assert.equal(find('far'), undefined);
    assert(g.lifecycle.lastRetirements.some(r => r.reason === 'source-invalid'));
    await advance(36, [vehicle('far', 100, 0, 2)]);
    const recycled = find('far');
    assert.equal(recycled.vehicle.generation, 2);
    assert.notEqual(recycled.source, reacquired);
    await advance(12, null);
    assert.equal(find('far'), undefined);
    assert.equal(g.lifecycle.lastRetirements.at(-1).reason, 'source-expiry');
    assert.equal(g.lifecycle.observedNotRunning, 0);
    assert(g.lifecycle.lastRetirements.every(r => !r.engineShutdownInferred));
    return {initialPopulation, virtualization, retirements: g.lifecycle.scopeRetirements, lastRetirements: g.lifecycle.lastRetirements,
      authoredUnknownStatesRejected: g.stats.rejectedFrames, continuingOwnerAdvancedFrames: 108 * blockFrames,
      returnedVirtualVoiceUsesFreshHistory: true, firstWindowFrames, reacquiredWindowFrames: firstWindowFrames, expiryLeaseMs: 120};
  } finally { await g.close(); }
}

assert.equal(process.argv.length, 3, 'usage: node tools/Test-NativeBridge01.mjs <fresh .local/street01 output directory>');
const out = privateStoragePath(root, process.argv[2]);
assert(out.startsWith(path.join(root, '.local/street01') + path.sep), 'private STREET-01 result directory required');
fs.mkdirSync(out);
try {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', timeout: 5000}).trim();
  const sourceCommit = git('rev-parse', 'HEAD');
  const files = [...git('ls-files', 'src/acoustics').split('\n').filter(file => file.endsWith('.mjs')),
    'tools/Test-NativeBridge01.mjs', 'tests/fixtures/AcousticBudget042.mjs'];
  const sourceSha256 = Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
  const beforeBank = performance.now();
  const bank = loadBank();
  const preparationMs = performance.now() - beforeBank;
  const distances = [];
  for (const distance of [25, 100, 250, 500, 1000]) distances.push(await renderScenario(bank, distance, {cutNative: true}));
  const control = await renderScenario(bank, 250);
  assert.equal(control.stereo, distances[2].stereo);
  assert.deepEqual(control.dry, distances[2].dry);
  assert.notEqual(control.native, distances[2].native);
  assert.equal(control.nativeBlocksAfterCut, 380);
  for (const [index, row] of distances.entries()) {
    assert.deepEqual(row.dry, control.dry, 'held dry PCM is distance-independent');
    assert.equal(row.sourceFrames, control.sourceFrames);
    assert.equal(row.nativeBlocksAfterCut, 0);
    if (row.distance <= 500) {
      assert.equal(row.paths.length, 2);
      assert(row.stereoRms > 0);
      const firstArrivalBlock = row.firstSourceBlock + Math.min(...row.paths.map(p => p.delay)) / period;
      assert(Math.abs(row.firstStereo - firstArrivalBlock) < 2, 'first PCM follows causal flight time');
      if (index) {
        const previous = distances[index - 1];
        assert(row.stereoRms < previous.stereoRms);
        assert(row.stereoBandRms[2] / row.stereoBandRms[0] < previous.stereoBandRms[2] / previous.stereoBandRms[0]);
      }
      for (const p of row.paths) {
        assert.equal(p.order, 0);
        assert(Math.abs(p.distance - row.distance) < 1);
        assert(Math.abs(p.delay - p.distance / 343) < 1e-9);
        assert(Math.abs(p.rate - 1) < 1e-8);
        assert(p.bands[0] > p.bands[1] && p.bands[1] > p.bands[2]);
        if (index) {
          const nearer = distances[index - 1].paths.find(other => other.sourceId === p.sourceId);
          assert(p.bands[0] < nearer.bands[0] && p.bands[2] / p.bands[0] < nearer.bands[2] / nearer.bands[0]);
        }
      }
    } else {
      assert.equal(row.paths.length, 0);
      assert.equal(row.firstStereo, null);
      assert.equal(row.stereoNonzeroBlocks, 0);
      assert.equal(row.pathDecisions.length, 2);
      assert(row.pathDecisions.every(p => p.status === 'delay-budget'));
    }
  }
  const moving = await renderScenario(bank, 250, {cutNative: true, speed: -20});
  assert.deepEqual(moving.dry, control.dry);
  assert.equal(moving.paths.length, 2);
  assert(moving.paths.every(p => Math.abs(p.rate - 343 / (343 - 20)) < .001));
  const reflection = await renderScenario(bank, 25, {cutNative: true, geometry: 'reflect'});
  assert(reflection.paths.some(p => p.order === 1));
  assert(reflection.paths.some(p => p.order === 0));
  assert.deepEqual(reflection.dry, control.dry);
  assert.notEqual(reflection.stereo, distances[0].stereo);
  const occlusion = await renderScenario(bank, 25, {cutNative: true, geometry: 'block'});
  assert.equal(occlusion.firstStereo, null);
  assert.deepEqual(occlusion.dry, control.dry);
  assert(occlusion.pathDecisions.some(p => p.status === 'blocked-no-modelled-path'));
  const lifecycleEvidence = await lifecycle(bank);
  for (const [file, sha256] of Object.entries(sourceSha256)) assert.equal(hash(fs.readFileSync(path.join(root, file))), sha256, file);
  const report = {schema: 1, sourceCommit, sourceSha256,
    node: process.version, nodeSha256: hash(fs.readFileSync(process.execPath)), sampleRate: rate, blockFrames, preparationMs,
    clock: 'deterministic 512-frame steps; elapsed method timing is diagnostic, not clocked delivery',
    authority: 'authored vehicle and camera observations, authored comparison PCM and wall; verified private retained Bati source',
    propagation: {soundSpeedMetresPerSecond: 343, delayLimitSeconds: 2, poseAndPcmHistorySeconds: 2.5},
    bank: bank.evidence, distances, control, moving, reflection, occlusion, lifecycle: lifecycleEvidence};
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({output: out, node: process.version, distances: distances.map(r => ({metres: r.distance,
    sourceFrames: r.sourceFrames, paths: r.paths.length, stereoRms: r.stereoRms})), sourceExactAfterNativeCut: true}));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.txt'), error.stack + '\n', {flag: 'wx'});
  throw error;
}
