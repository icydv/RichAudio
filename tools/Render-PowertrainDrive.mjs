import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { InstalledStaticWorld01, encodeInstalledStaticScene01 } from '../src/acoustics/world/installed-static-scene01.mjs';
import { StockGameplay } from '../src/acoustics/vehicle/gameplay.mjs';
import { loadStockCatalogAssets, loadStockNpcAssets } from '../src/acoustics/vehicle/stock-source.mjs';
import { loadInstalledStockRegistry } from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import { powertrainRegistry } from '../src/acoustics/vehicle/powertrain-registry.mjs';
import { encodeVehicleWav, vehicleBlockFrames as blockFrames, vehicleSampleRate as sampleRate } from '../src/acoustics/vehicle/pipeline.mjs';
import { readWave } from '../src/acoustics/recording/analyze.mjs';
import { vehicleDistanceSceneOptions } from '../src/acoustics/vehicle/distance-presentation.mjs';
import { SoundMapTelemetry, prepareInstalledSoundMapGeometry01, registerPreparedSoundMapGeometry01 } from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import { preparedGeometryEncoding } from '../src/acoustics/streaming/soundmap-wire.mjs';

const adderModel = 0xb779a091;
const batiModel = 0xf9300cc5;
const blockMs = blockFrames * 1000 / sampleRate;
const checkout = fileURLToPath(new URL('../', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const add = (origin, direction, distance) => origin.map((coordinate, index) => coordinate + direction[index] * distance);
const unit = vector => vector.map(coordinate => coordinate / Math.hypot(...vector));

function writeStereoWave(file, channels) {
 const pcm = encodeVehicleWav(channels);
 fs.writeFileSync(file, pcm, { flag: 'wx' });
 const decoded = readWave(file);
 assert(decoded.frames === channels[0].length && decoded.sampleRate === sampleRate && decoded.channels === 2,
  'Stereo WAV format changed on readback');
 for (let i = 0; i < decoded.frames; i++) {
  assert(decoded.samples[2 * i] === channels[0][i] && decoded.samples[2 * i + 1] === channels[1][i],
   'Stereo PCM changed on readback');
 }
 return decoded.sha256;
}

function parseArguments(args) {
 const values = {};
 const names = ['--package', '--world', '--placement', '--output'];
 for (let i = 0; i < args.length; i += 2) {
  assert(names.includes(args[i]) && args[i + 1] && values[args[i]] === undefined, 'Expected --package, --world, --placement and --output');
  values[args[i]] = path.resolve(args[i + 1]);
 }
 assert(names.every(key => values[key]), 'All four arguments are required');
 return values;
}

function voiceInputs(packageFile) {
 const config = readJson(packageFile);
 const directory = path.dirname(packageFile);
 const inside = field => {
  const file = path.resolve(directory, config[field]);
  assert(file.startsWith(directory + path.sep), 'Package file escaped its root');
  return file;
 };
 const assets = loadStockCatalogAssets(inside('playerManifest'), { sustainAtlasFile: inside('atlas') });
 const npcAssets = config.npcManifest ? loadStockNpcAssets(inside('npcManifest')) : null;
 const installed = loadInstalledStockRegistry({ catalogFile: inside('catalog'), catalogSha256: config.catalogSha256, assets, npcAssets });
 // The production donor mapping keeps the game model and context in the snapshots.
 const player = powertrainRegistry(installed);
 const independent = installed.resolve(batiModel, 'npc').status === 'available' ? { model: batiModel, context: 'npc' } : { model: batiModel, context: 'player' };
 const registry = {
  resolve(model, context) { return model === adderModel ? player.resolve(model, context) : installed.resolve(model, context); },
  createSource(model, context, options) {
   return model === adderModel ? player.createSource(model, context, options) : installed.createSource(model, context, options);
  }
 };
 const bank = registry.resolve(adderModel, 'player').bank;
 assert(bank?.model === 'bati', 'The retained Bati development voice is required');
 return { registry, profiles: readJson(inside('profiles')), bank, independent };
}

function authoredMotion(placement, second) {
 const forward = unit([placement.forward[0], placement.forward[1], 0]);
 assert(forward.every(Number.isFinite), 'A horizontal drive direction is required');
 const listener = placement.listener;
 const across = [-forward[1], forward[0], 0];
 const towardListener = listener.map((value, index) => value - placement.source[index]);
 const sign = across.reduce((value, component, index) => value + component * towardListener[index], 0) >= 0 ? 1 : -1;
 const secondStart = add(add(placement.source, forward, 3.7), across, sign * 2.1);
 const authored = (seconds, ticks, includeSecond) => {
  const halfLength = placement.halfLength ?? 3;
  const phase = Math.max(0, Math.min(1, (seconds - .62) / 3.65));
  const eased = phase * phase * (3 - 2 * phase);
  const movement = phase > 0 && phase < 1 ? 2 * halfLength * (6 * phase - 6 * phase * phase) / 3.65 : 0;
  const rpm = seconds < .62 ? .11 : seconds < 2.25 ? .11 + .64 * ((seconds - .62) / 1.63) :
   Math.max(.12, .75 - (seconds - 2.25) * .29);
  const common = { generation: 1, observationTicks: ticks, forward, up: [0, 0, 1], valid: true, running: true };
  const vehicles = [{ ...common, id: 'adder-pass', model: adderModel, context: 'player',
   position: add(placement.source, forward, (2 * eased - 1) * halfLength),
   velocity: forward.map(component => component * movement), operatingPoint: rpm }];
  if (includeSecond && seconds < 3.7) {
   const progress = Math.max(0, seconds - .82);
   vehicles.push({ ...common, ...second, id: 'bati-approach', forward: forward.map(component => -component),
    position: add(secondStart, forward, -progress * .74),
    velocity: forward.map(component => seconds > .82 ? -.74 * component : 0),
    operatingPoint: seconds < 1.18 ? .12 : seconds < 2.25 ? .12 + .44 * (seconds - 1.18) / 1.07 : .27 });
  }
  return vehicles;
 };
 return { camera: listener, forward, at: authored };
}

function soundMapPacket(visual, sampleFrame, active) {
 const geometry = visual.soundMapGeometry;
 const prepared = preparedGeometryEncoding(geometry);
 const expanded = prepared ? { ...JSON.parse(Buffer.from(prepared.bodyBytes).toString('utf8')), ...prepared.header } : geometry;
 const { soundMapFrame } = visual;
 const voices = active.map(slot => ({
  vehicle: slot.vehicle.id,
  model: slot.vehicle.model,
  context: slot.vehicle.context,
  observedGeneration: slot.vehicle.generation,
  voice: slot.source.vehicle.model,
  operatingPoint: slot.vehicle.operatingPoint,
  sourceFrame: slot.source.frame,
  engine: 'stock:slot' + slot.index + ':engine',
  exhaust: 'stock:slot' + slot.index + ':exhaust'
 }));
 return soundMapFrame ? { sampleFrame, soundMapFrame, voices, ...(expanded ? { soundMapGeometry: expanded } : {}) } : null;
}

function appliedPath(renderer, path) {
 const slot = renderer.slots.find(item => item.active && item.id === path.id);
 if (!slot) return null;
 return { atFrame: renderer.frame, sourceFrame: slot.cursor,
  delayMs: 1000 * (renderer.frame - slot.cursor) / sampleRate, gainBands: [...slot.gain],
  pan: slot.pan, rate: slot.rate, sourcePressureGain: slot.source.pressureGain,
  masterGain: renderer.masterGain, outputGain: renderer.outputGain };
}

async function renderTake({ name, directory, world, placement, inputs, session, drive, reflected, fleet, invalidationBlock = null }) {
 let now = 0;
 const seconds = 5.25, blocks = Math.ceil(seconds * sampleRate / blockFrames), frames = blocks * blockFrames;
 const engine = new StockGameplay({ registry: inputs.registry, profiles: inputs.profiles, session, now: () => now,
  continuityPolicy: 'camera-source-01', latencyProfile: fleet ? 'street-01' : 'baseline',
  vehicleSourcePolicy: fleet ? 'catalogue-fleet-01' : null, privatePowertrain: !fleet });
 engine.setSettings({ ...engine.settings, quality: 'quality', acceleration: 'cpu', volume: .8 });
 engine.telemetry = new SoundMapTelemetry({ enabled: true });
 engine.pipeline.simulation.captureInstalledPaths01 = true;
 const originalFilter = engine.pipeline.controlFilter;
 engine.pipeline.controlFilter = (control, renderer) => {
  const paths = control.paths.filter(item => item.order === 0 ||
   (reflected && item.order === 1 && item.id.includes(placement.surfaceId)));
  return originalFilter({ ...control, paths }, renderer);
 };
 const channels = [new Float32Array(frames), new Float32Array(frames)];
 const replay = [], timings = [], scenes = new Set(), invalidation = [];
 let retainedWall = null;
 const dry = createHash('sha256'), direct = createHash('sha256');
 let previousMapSequence = null, maxActive = 0, leases = 0, wallBlocks = 0, fallbackBlocks = 0;
 let witness = null, secondLastBlock = null, firstWithoutSecond = null;
 let maxAOperatingPoint = 0, maxBOperatingPoint = 0, peak = 0;
 try {
  for (let block = 0; block < blocks; block++) {
   now = block * blockMs;
   const ticks = 10_000_000 + Math.round(now * 10_000);
   const cars = drive.at(now / 1000, ticks, name === 'two-vehicles');
   if (block % 90 === 0 && (invalidationBlock === null || block < invalidationBlock)) {
    const model = world.window({ session, generation: 1, listener: drive.camera, sources: [placement.source],
     radius: placement.radius ?? 12, adaptiveRadius: false, maximumSurfaces: 2048,
     geometryTimeMs: now, durationMs: 1000,
     engine: { order: 1, maxPaths: 32, maxReflectors: 16, ...vehicleDistanceSceneOptions('authored-detail-loss-v1') } });
    assert(model.observationModel.reflectionSurfaceIds.includes(placement.surfaceId), 'The installed workset did not admit the selected wall');
    retainedWall = model.tile.surfaces.find(surface => surface.id === placement.surfaceId);
    scenes.add(JSON.stringify({ tileId: model.tile.id, surfaces: model.tile.surfaces.length,
     catalogueSHA256: model.observationModel.sourceCatalogueSHA256 }));
    const binding = { requestId: ++leases, bindingEpoch: 0, packetDigest: encodeInstalledStaticScene01(model).packetDigest,
     catalogSHA256: model.observationModel.sourceCatalogueSHA256 };
    const packet = prepareInstalledSoundMapGeometry01(model, binding);
    registerPreparedSoundMapGeometry01(model, packet, binding);
    assert(engine.setInstalledStaticScene01(model, { expiresAt: now + 1000 }), 'Installed workset expired before admission');
    engine.telemetry.resetGeometry();
   }
   if (block === invalidationBlock) engine.invalidateInstalledScene01('demo-workset-invalidated', now);
   // A single clocked stream with independent vehicle lifetimes. No output is
   // intended for the one-car live takeover or its single observation tag.
   if (block % 4 === 0) {
    const listener = { version: 1, session, sequence: block / 4, generation: 1, observationTicks: ticks,
     clockFrequency: 10_000_000, gameTimeMs: Math.round(now), position: drive.camera,
     velocity: [0, 0, 0], forward: drive.forward, up: [0, 0, 1], valid: true,
     paused: false, reason: 'valid', coordinates: 'gta-native-unscaled', units: 'native-unverified',
     listenerKind: 'camera', velocityKind: 'unavailable', sourceId: null };
    engine.accept({ version: 1, session, listener, vehicles: cars }, 0, 250);
   }
   const began = performance.now();
   const output = await engine.render();
   timings.push(performance.now() - began);
   const sampleFrame = block * blockFrames;
   output.forEach((channel, side) => {
    channels[side].set(channel, sampleFrame);
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
   });
   const active = engine.slots.filter(slot => slot.source);
   maxActive = Math.max(maxActive, active.length);
   const a = active.find(slot => slot.vehicle.id === 'adder-pass'), b = active.find(slot => slot.vehicle.id === 'bati-approach');
   if (a) {
    maxAOperatingPoint = Math.max(maxAOperatingPoint, a.vehicle.operatingPoint);
    for (const role of ['engine', 'exhaust']) dry.update(Buffer.from(engine.inputs['stock:slot' + a.index + ':' + role].buffer));
   }
   if (b) {
    maxBOperatingPoint = Math.max(maxBOperatingPoint, b.vehicle.operatingPoint);
    secondLastBlock = block;
   } else if (secondLastBlock !== null && firstWithoutSecond === null) firstWithoutSecond = block;
   const control = engine.pipeline.lastControl;
   const directPaths = control?.paths.filter(item => item.order === 0) ?? [];
   direct.update(JSON.stringify(directPaths));
   const wallPaths = control?.paths.filter(item => item.order === 1) ?? [];
   if (wallPaths.length) wallBlocks++;
   if (!engine.staticSceneBinding) fallbackBlocks++;
   if (invalidationBlock !== null && Math.abs(block - invalidationBlock) <= 4) {
    invalidation.push({ block, selectedWallPaths: wallPaths.length,
     retainedWallPaths: engine.pipeline.renderer.slots.filter(slot =>
      slot.active && slot.id?.includes(placement.surfaceId)).length, sourceVoices: active.length });
   }
   if (engine.visual?.soundMapFrame && engine.visual.soundMapFrame.sequence !== previousMapSequence) {
    previousMapSequence = engine.visual.soundMapFrame.sequence;
    const packet = soundMapPacket(engine.visual, sampleFrame, active);
    replay.push(packet);
    for (const reflection of packet.soundMapFrame.paths.filter(item => item.status === 'selected' && item.surfaceIds.includes(placement.surfaceId))) {
     const directPath = packet.soundMapFrame.paths.find(item => item.status === 'selected' && item.sourceId === reflection.sourceId && item.order === 0);
     if (!directPath) continue;
     const ratio = reflection.bands[0] / directPath.bands[0];
     if (now > 2050 && now < 2900 && ratio > (witness?.pressureRatio ?? 0)) {
      witness = { sampleFrame, surfaceId: placement.surfaceId, pressureRatio: ratio, direct: directPath,
       reflected: reflection, predictedExcessTravelMs: 1000 * (reflection.distance - directPath.distance) /
        engine.pipeline.simulation.scene.config.soundSpeed,
       applied: { direct: appliedPath(engine.pipeline.renderer, directPath), reflected: appliedPath(engine.pipeline.renderer, reflection) } };
     }
    }
   }
  }
  assert(peak > 0 && peak < 1 && maxActive >= 1, 'Expected nonclipped audible vehicle PCM');
  if (invalidationBlock !== null) {
   const preceding = invalidation.find(row => row.block === invalidationBlock - 1);
   const first = invalidation.find(row => row.block === invalidationBlock);
   const after = invalidation.find(row => row.block === invalidationBlock + 2);
   assert(preceding?.selectedWallPaths > 0 && first?.selectedWallPaths === 0 && after?.retainedWallPaths === 0 &&
    after?.sourceVoices === 1, 'Invalidated workset did not release the wall while retaining the vehicle voice');
   return { block: invalidationBlock, sampled: invalidation };
  }
  assert(fallbackBlocks === 0, 'Vehicle or listener left the admitted world workset');
  if (reflected) assert(wallBlocks > 20 && witness, 'The chosen wall did not contribute to enough rendered blocks');
  if (name === 'two-vehicles') assert(maxActive === 2 && firstWithoutSecond !== null && maxBOperatingPoint > .5, 'Independent second voice did not accelerate and retire');
  const wavSHA256 = writeStereoWave(path.join(directory, name + '.wav'), channels);
  fs.writeFileSync(path.join(directory, 'soundmap-' + name + '.jsonl'), replay.map(packet => JSON.stringify(packet)).join('\n') + '\n', { flag: 'wx' });
  return { channels, receipt: {
   name, frames, soundMapFrames: replay.length, wavSHA256, peak, distinctWorksets: [...scenes].map(JSON.parse),
   dryADDER: dry.digest('hex'), directPathSHA256: direct.digest('hex'), maxActive, wallBlocks, witness, retainedWall,
   maxAOperatingPoint, maxBOperatingPoint, secondLastBlock, firstWithoutSecond,
   completeRenderMs: { maximum: Math.max(...timings), mean: timings.reduce((total, value) => total + value, 0) / timings.length,
    overDeadline: timings.filter(value => value > blockMs).length }, retired: engine.stats.retired
  } };
 } finally {
  await engine.close();
 }
}

const args = parseArguments(process.argv.slice(2));
const directory = args['--output'];
assert(directory.startsWith(path.join(checkout, '.local') + path.sep) && !fs.existsSync(directory), 'Use a fresh output folder under the private worktree .local');
const placement = readJson(args['--placement']);
const world = new InstalledStaticWorld01(readJson(args['--world']));
const session = randomUUID().replaceAll('-', '');
try {
 const inputs = voiceInputs(args['--package']);
 const drive = authoredMotion(placement, inputs.independent);
 fs.mkdirSync(directory, { recursive: true });
 const data = {};
 for (const [name, reflected] of [['wall-off', false], ['wall-on', true]]) {
  data[name] = await renderTake({ name, directory, world, placement, inputs, session, drive, reflected, fleet: false });
  console.log(name + ' ready in ' + directory);
 }
 const off = data['wall-off'], on = data['wall-on'];
 assert.equal(off.receipt.dryADDER, on.receipt.dryADDER, 'Matched takes changed the dry vehicle source');
 assert.equal(off.receipt.directPathSHA256, on.receipt.directPathSHA256, 'Matched takes changed the direct path');
 assert.notEqual(off.receipt.wavSHA256, on.receipt.wavSHA256, 'Matched takes emitted identical stereo PCM');
 const gap = sampleRate / 2, firstFrame = off.receipt.frames + gap;
 const stereo = off.channels.map((channel, index) => {
  const joined = new Float32Array(firstFrame + on.receipt.frames);
  joined.set(channel);
  joined.set(on.channels[index], firstFrame);
  return joined;
 });
 const comparison = { file: 'PLAY FIRST - wall comparison.wav',
  takes: [{ take: 'wall-off', firstFrame: 0, frames: off.receipt.frames }, { take: 'wall-on', firstFrame, frames: on.receipt.frames }] };
 comparison.sha256 = writeStereoWave(path.join(directory, comparison.file), stereo);
 console.log(comparison.file + ' ready in ' + directory);
 const report = { kind: 'authored-vehicle-drive-through-retained-installed-world', comparison, session, sampleRate,
  material: 'Bati development voice on ADDER telemetry', sourceBankSHA256: inputs.bank.provenance.awcSha256,
  motion: 'authored', paths: 'StockGameplay solver and mixer',
  wall: { surfaceId: placement.surfaceId, witness: on.receipt.witness, surface: on.receipt.retainedWall,
   deltaRelativeToDirectDb: off.channels.map((channel, side) => {
    let directEnergy = 0, differenceEnergy = 0;
    for (let frame = 0; frame < channel.length; frame++) {
     directEnergy += channel[frame] ** 2;
     differenceEnergy += (on.channels[side][frame] - channel[frame]) ** 2;
    }
    return 10 * Math.log10(differenceEnergy / directEnergy);
   }) },
  stages: Object.fromEntries(Object.entries(data).map(([name, take]) => [name, take.receipt])) };
 writeJson(path.join(directory, 'result.json'), report);
 for (const name of ['two-vehicles', 'solo-vehicle']) {
  const take = await renderTake({ name, directory, world, placement, inputs, session, drive, reflected: true, fleet: true });
  data[name] = take;
  report.stages[name] = take.receipt;
  console.log(name + ' ready in ' + directory);
 }
 const mixed = data['two-vehicles'], solo = data['solo-vehicle'];
 assert.notEqual(mixed.receipt.wavSHA256, solo.receipt.wavSHA256);
 assert.equal(mixed.receipt.dryADDER, solo.receipt.dryADDER, 'Removing the second vehicle changed the dry ADDER voice');
 const removedFrame = mixed.receipt.firstWithoutSecond * blockFrames;
 const residual = (first, frames) => {
  let sum = 0, peak = 0;
  for (let side = 0; side < 2; side++) for (let i = first; i < first + frames; i++) {
   const difference = mixed.channels[side][i] - solo.channels[side][i];
   sum += difference * difference;
   peak = Math.max(peak, Math.abs(difference));
  }
  return { rms: Math.sqrt(sum / (2 * frames)), peak };
 };
 report.retirement = { removedFrame, before: residual(removedFrame - 4 * blockFrames, 4 * blockFrames),
  release: residual(removedFrame, 4 * blockFrames), settled: residual(removedFrame + 12 * blockFrames, 4 * blockFrames) };
 assert(report.retirement.before.peak > .001 && report.retirement.settled.peak < report.retirement.before.peak / 10,
  'The removed voice did not decay toward the matched remaining-car take');
 report.wall.invalidation = await renderTake({ name: 'wall-invalidation', directory, world, placement, inputs, session,
  drive, reflected: true, fleet: false, invalidationBlock: 260 });
 report.independentVehicle = { ...inputs.independent, voice: 'bati',
  sourceBankSHA256: inputs.registry.resolve(inputs.independent.model, inputs.independent.context).bank.provenance.awcSha256 };
 fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
 world.close();
}
