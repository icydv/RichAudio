import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadStockCatalogAssets, loadStockNpcAssets } from '../../src/acoustics/vehicle/stock-source.mjs';
import { loadInstalledStockRegistry } from '../../src/acoustics/vehicle/installed-stock-registry.mjs';
import { powertrainRegistry } from '../../src/acoustics/vehicle/powertrain-registry.mjs';
import { encodeVehicleWav, vehicleSampleRate as sampleRate } from '../../src/acoustics/vehicle/pipeline.mjs';
import { readWave } from '../../src/acoustics/recording/analyze.mjs';
import { preparedGeometryEncoding } from '../../src/acoustics/streaming/soundmap-wire.mjs';

const adderModel = 0xb779a091;
const batiModel = 0xf9300cc5;
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

function voiceInputs(packageFile, { voicing, includeNpc = true } = {}) {
 const config = readJson(packageFile);
 const directory = path.dirname(packageFile);
 const inside = field => {
  const file = path.resolve(directory, config[field]);
  assert(file.startsWith(directory + path.sep), 'Package file escaped its root');
  return file;
 };
 const assets = loadStockCatalogAssets(inside('playerManifest'), { sustainAtlasFile: inside('atlas') });
 const npcAssets = includeNpc && config.npcManifest ? loadStockNpcAssets(inside('npcManifest')) : null;
 const installed = loadInstalledStockRegistry({ catalogFile: inside('catalog'), catalogSha256: config.catalogSha256, assets, npcAssets });
 // The production donor mapping keeps the game model and context in the snapshots.
 const player = powertrainRegistry(installed, voicing);
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

export { adderModel, batiModel, sha256, readJson, writeJson, add, unit, writeStereoWave, parseArguments, voiceInputs, soundMapPacket, appliedPath };
