import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {pathGeometry} from '../src/acoustics/engine/paths.mjs';
import {readWave} from '../src/acoustics/recording/analyze.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {createStockVehiclePipeline, vehicleBlockFrames, vehicleSampleRate} from '../src/acoustics/vehicle/pipeline.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';

function readJson(file) {
 return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
function readWav(file, digest) {
 const decoded = readWave(file);
 assert.equal(decoded.codec, 3, 'IEEE float format expected');
 assert.equal(decoded.channels, 2, 'Stereo expected');
 assert.equal(decoded.sampleRate, vehicleSampleRate);
 if (digest) assert.equal(decoded.sha256, digest);
 let peak = 0;
 for (const sample of decoded.samples) {
  assert(Number.isFinite(sample) && Math.abs(sample) <= 1, 'Non-finite or clipped comparison');
  peak = Math.max(peak, Math.abs(sample));
 }
 return {...decoded, peak};
}
const sampleBytes = samples => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
function blockStart(channels, threshold = 1e-7) {
 return channels[0].findIndex((sample, i) => Math.abs(sample) > threshold || Math.abs(channels[1][i]) > threshold);
}
async function renderImpulse(scene, listener, source, sourceId) {
 const sourceIds = [sourceId.replace(/:(engine|exhaust)$/, ':engine'), sourceId.replace(/:(engine|exhaust)$/, ':exhaust')];
 assert.equal(new Set(sourceIds).size, 2, 'Expected the stock engine/exhaust pair');
 const pipeline = createStockVehiclePipeline({scene, sourceIds, quality: 'quality', masterGain: .175, continuousRates: true});
 const blocks = 12, initialImpulse = vehicleBlockFrames * 3;
 const channels = [new Float32Array(blocks * vehicleBlockFrames), new Float32Array(blocks * vehicleBlockFrames)];
 const input = new Float32Array(vehicleBlockFrames), left = new Float32Array(vehicleBlockFrames), right = new Float32Array(vehicleBlockFrames);
 const inputs = Object.fromEntries(sourceIds.map(id => [id, id === sourceId ? input : new Float32Array(vehicleBlockFrames)]));
 try {
  for (let block = 0; block < blocks; block++) {
   const time = block * vehicleBlockFrames / vehicleSampleRate;
   await pipeline.prepare({time, session: scene.tile.session, generation: scene.tile.version, listener,
    sources: [{id: sourceId, generation: 1, position: source, velocity: [0, 0, 0], forward: [0, 1, 0], up: [0, 0, 1], directivity: 0}]},
    {geometryTimeMs: time * 1000});
   input[0] = block === 3 ? .2 : 0;
   pipeline.process(inputs, left, right);
   channels[0].set(left, block * vehicleBlockFrames);
   channels[1].set(right, block * vehicleBlockFrames);
  }
  return {channels, paths: pipeline.lastControl.paths, initialImpulse};
 } finally {
  pipeline.close();
 }
}

const [directoryArg, worldPath, placementPath] = process.argv.slice(2);
assert(directoryArg && worldPath && placementPath, 'Supply the drive directory, world configuration, and authored placement JSON');
const directory = fs.realpathSync(directoryArg);
const privatePrefix = fs.realpathSync(fileURLToPath(new URL('../.local', import.meta.url))) + path.sep;
assert(directory.startsWith(privatePrefix), 'Use a private drive directory');
const report = readJson(path.join(directory, 'result.json'));
const on = report.stages['wall-on'], off = report.stages['wall-off'];
const takes = report.comparison.takes;
const file = (name) => {
 assert.equal(name, path.basename(name), 'Expected a comparison file name');
 return path.join(directory, name);
};
const wallOnWav = readWav(file('wall-on.wav'), on.wavSHA256);
const wallOffWav = readWav(file('wall-off.wav'), off.wavSHA256);
const comparison = readWav(file(report.comparison.file), report.comparison.sha256);
assert.equal(off.dryADDER, on.dryADDER, 'Dry PCM differs');
assert.equal(off.directPathSHA256, on.directPathSHA256, 'Direct solver controls differ');
assert.deepEqual(takes.map(take => take.frames), [wallOffWav.frames, wallOnWav.frames]);
assert.equal(takes[0].firstFrame, 0);
assert(sampleBytes(comparison.samples.subarray(0, takes[0].frames * 2)).equals(sampleBytes(wallOffWav.samples)));
assert(sampleBytes(comparison.samples.subarray(takes[1].firstFrame * 2)).equals(sampleBytes(wallOnWav.samples)));
assert(comparison.samples.subarray(takes[0].frames * 2, takes[1].firstFrame * 2).every(sample => sample === 0),
 'Expected silence between matched takes');

const placement = readJson(placementPath), world = new InstalledStaticWorld01(readJson(worldPath));
try {
 const witness = report.wall.witness, source = witness.reflected.sourceAtEmission;
 const listener = {position: witness.reflected.listenerAtArrival, forward: placement.forward, up: [0, 0, 1]};
 const session = report.session, surfaceId = witness.surfaceId;
 assert.equal(surfaceId, placement.surfaceId);
 const engine = {order: 1, maxPaths: 32, maxReflectors: 16, ...vehicleDistanceSceneOptions('authored-detail-loss-v1')};
 const scene = world.window({listener: listener.position, sources: [source], session, generation: 1,
  geometryTimeMs: 0, durationMs: 999, radius: placement.radius ?? 12, maximumSurfaces: 2048, engine});
 const surface = scene.tile.surfaces.find(surface => surface.id === surfaceId);
 assert(surface && scene.observationModel.reflectionSurfaceIds.includes(surfaceId), 'Finite wall did not admit the selected witness');
 const routeOnly = {...scene.observationModel, reflectionSurfaceIds: [surfaceId]};
 const reflecting = acousticScene(scene.tile, scene.materials, {...scene.config, observationModel: routeOnly});
 const removed = acousticScene(createTile({...scene.tile, surfaces: scene.tile.surfaces.filter(surface => surface.id !== surfaceId)},
  {maximumSurfaces: 2048}), scene.materials, {...scene.config, observationModel: {...routeOnly, reflectionSurfaceIds: []}});
 const direct = pathGeometry(reflecting, source, listener.position, []);
 const reflected = pathGeometry(reflecting, source, listener.position, [surface]);
 const directAfterRemoval = pathGeometry(removed, source, listener.position, []);
 assert.equal(direct.status, 'clear');
 assert.equal(reflected.status, 'clear');
 assert.deepEqual(directAfterRemoval, direct, 'Wall deletion changed direct geometry at witness');
 assert(Math.abs(reflected.distance - witness.reflected.distance) < 1e-5, 'Recorded reflection disagrees with finite solve');
 const sourceId = witness.reflected.sourceId;
 const before = await renderImpulse(reflecting, listener, source, sourceId);
 const after = await renderImpulse(removed, listener, source, sourceId);
 const bounce = before.paths.find(item => item.order === 1 && item.id.includes(surfaceId));
 assert(bounce && after.paths.every(item => item.order === 0), 'Finite wall deletion did not withdraw the reflected path');
 const difference = before.channels.map((channel, side) => channel.map((sample, i) => sample - after.channels[side][i]));
 const directArrival = blockStart(after.channels), reflectedArrival = blockStart(difference);
 assert(directArrival > before.initialImpulse && reflectedArrival > directArrival, 'The reflection did not arrive after the direct pulse');
 const predictedExcess = (reflected.distance - direct.distance) / scene.config.soundSpeed * vehicleSampleRate;
 assert(Math.abs(reflectedArrival - directArrival - predictedExcess) < 3, 'Rendered arrival spacing differs from the finite solve');
 const result = {session, surfaceId, peak: comparison.peak, comparisonTakes: takes,
  matchedDryPcm: true, matchedDirectControls: true, exactComparisonSegments: true,
  witnessFrame: witness.sampleFrame, nativeMaterialId: surface.material.observedId,
  emitter: source, listener: listener.position, bounce: reflected.points[0],
  movingPaths: {directLength: witness.direct.distance, reflectedLength: witness.reflected.distance,
   predictedExcessMs: (witness.reflected.distance - witness.direct.distance) / scene.config.soundSpeed * 1000,
   reflectedDelaySeconds: witness.reflected.delay, reflectedBands: witness.reflected.bands, pan: witness.reflected.pan},
  appliedAtWitness: witness.applied ?? {reflected: {gainBands: witness.appliedBands}},
  impulse: {directLength: direct.distance, reflectedLength: reflected.distance,
   predictedExcessMs: predictedExcess / vehicleSampleRate * 1000, directArrival, reflectedArrival,
   measuredExcessMs: (reflectedArrival - directArrival) / vehicleSampleRate * 1000,
   directUnmappedFallback: direct.unknownDirectFallback ?? false,
   reflectedPathsWithSurface: 1, reflectedPathsAfterRemoval: 0}};
 fs.writeFileSync(path.join(directory, 'wall-verification.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
 console.log(JSON.stringify(result));
} finally {
 world.close();
}
