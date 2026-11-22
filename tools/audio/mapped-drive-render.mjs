import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StockGameplay } from '../../src/acoustics/vehicle/gameplay.mjs';
import { StreamingRenderer } from '../../src/acoustics/streaming/causal.mjs';
import { SoundMapTelemetry } from '../../src/acoustics/streaming/soundmap-telemetry.mjs';
import { vehicleSampleRate as sampleRate, vehicleBlockFrames as blockFrames } from '../../src/acoustics/vehicle/pipeline.mjs';
import { sha256, soundMapPacket, writeStereoWave } from './powertrain-drive.mjs';

const blockMs = blockFrames * 1000 / sampleRate;
const stereo = frames => [new Float32Array(frames), new Float32Array(frames)];
const level = samples => Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);

function appliedSlots(renderer, identities) {
 return renderer.slots.filter(s => s.active).map(s => ({ id: s.id, sourceId: s.source.id,
  order: identities.get(s.id)?.order, atFrame: renderer.frame, sourceFrame: s.cursor,
  delayMs: 1000 * (renderer.frame - s.cursor) / sampleRate, gainBands: [...s.gain], pan: s.pan,
  present: s.present, releaseFrames: s.releaseLeft, generation: s.generation, rate: s.rate,
  masterGain: renderer.masterGain, outputGain: renderer.outputGain, sourcePressureGain: s.source.pressureGain }));
}

export function listenerPacket(session, block, ticks, position, forward) {
 return { version: 1, session, sequence: block / 4, generation: 1, observationTicks: ticks,
  clockFrequency: 10_000_000, gameTimeMs: Math.round(block * blockMs), position,
  velocity: [0, 0, 0], forward, up: [0, 0, 1], valid: true, paused: false, reason: 'valid',
  coordinates: 'gta-native-unscaled', units: 'native-unverified', listenerKind: 'camera',
  velocityKind: 'unavailable', sourceId: null };
}

export function describeRenderer(r) {
 return { sourceIds: [...r.sources.keys()], maxPathsPerSource: r.maxPathsPerSource,
  pathCapacityPerSource: r.pathCapacityPerSource, masterGain: r.masterGain,
  historyDiagnostics: true, generationReleaseGuard: r.generationReleaseGuard,
  sourcePressureGains: r.sourcePressureGains, continuousRates: r.continuousRates,
  continuousTransitions: r.continuousTransitions };
}

export async function renderMappedPerformance({ directory, name, file, windows, drive, inputs, blocks, session, fleet, record }) {
 let now = 0, maxActive = 0, npcLastBlock = null, lastObservation = -1;
 const engine = new StockGameplay({ registry: inputs.registry, profiles: inputs.profiles, session, now: () => now,
  continuityPolicy: 'camera-source-01', latencyProfile: 'street-01', vehicleSourcePolicy: 'catalogue-fleet-01' });
 engine.setSettings({ ...engine.settings, quality: 'quality', acceleration: 'cpu', volume: .8 });
 engine.telemetry = new SoundMapTelemetry({ enabled: true });
 const renderer = engine.pipeline.renderer, settings = describeRenderer(renderer);
 const channels = stereo(blocks * blockFrames), rows = [], records = [], evidence = {}, identities = new Map();
 const candidateTotals = {}, worksetCounts = {}, dry = new Map();
 const census = { proposed: 0, admitted: 0, headroomOmitted: 0 };
 let proposed = 0, lastWorkset, oldSequence = null;
 const filter = engine.pipeline.controlFilter;
 engine.pipeline.controlFilter = (control, renderer) => {
  proposed = control.paths.length;
  return filter(control, renderer);
 };
 try {
  for (let block = 0; block < blocks; block++) {
   now = block * blockMs;
   const ticks = 10_000_000 + Math.round(now * 10_000);
   const { vehicles, forward } = drive.at(now / 1000, ticks, fleet);
   const scene = windows.get(block);
   if (scene) {
    assert(engine.setInstalledStaticScene01(scene, { expiresAt: now + 1000 }), 'Worker scene failed sample-clock admission');
    engine.telemetry.resetGeometry();
    lastWorkset = scene;
   }
   if (drive.observationStepMs) {
    const step = Math.floor((now + .00001) / drive.observationStepMs);
    if (step !== lastObservation) {
     lastObservation = step;
     const observedAt = step * drive.observationStepMs, observedTicks = 10_000_000 + Math.round(observedAt * 10_000);
     const observed = drive.at(observedAt / 1000, observedTicks, fleet);
     const listener = {...listenerPacket(session, block, observedTicks, drive.listener, observed.forward), sequence:step, gameTimeMs:observedAt};
     engine.accept({version:1, session, listener, vehicles:observed.vehicles}, now-observedAt, 250-(now-observedAt));
    }
   } else if (block % 4 === 0) engine.accept({ version: 1, session, listener: listenerPacket(session, block, ticks, drive.listener, forward), vehicles }, 0, 250);
   const output = await engine.render();
   const first = block * blockFrames;
   output.forEach((ch, i) => channels[i].set(ch, first));
   assert(engine.staticSceneBinding, 'Emitter or camera left the admitted installed workset at block ' + block);
   const control = engine.pipeline.lastControl;
   const active = engine.slots.filter(s => s.source);
   maxActive = Math.max(maxActive, active.length);
   const pcm = record ? {} : null;
   const dryLevels = {};
   for (const slot of active) {
    const { model, context, generation } = slot.vehicle;
    const id = drive.observationStepMs ? slot.vehicle.id+'@'+generation : slot.vehicle.id;
    if (!dry.has(id)) {
     dry.set(id, createHash('sha256'));
     const bank = inputs.registry.resolve(model, context).bank;
     evidence[id] = { model, context, generation, donor: bank.model, bankSHA256: bank.provenance.awcSha256,
      firstBlock: block, lastBlock: block, source: [], maxObservationAgeMs: 0, maxRpm: 0, byOrder: {} };
     if (drive.observationStepMs) Object.assign(evidence[id], {vehicle:slot.vehicle.id,renderGeneration:slot.generation,slot:slot.index});
    }
    const voice = evidence[id];
    if (drive.observationStepMs) assert(slot.index === voice.slot && slot.generation === voice.renderGeneration, 'Continuous lifetime changed voice slots');
    voice.lastBlock = block;
    voice.maxRpm = Math.max(voice.maxRpm, slot.vehicle.operatingPoint);
    voice.maxObservationAgeMs = Math.max(voice.maxObservationAgeMs, (ticks - slot.vehicle.observationTicks) / 10_000);
    for (const role of ['engine', 'exhaust']) {
     const source = 'stock:slot' + slot.index + ':' + role, samples = engine.inputs[source];
     if (!voice.source.includes(source)) voice.source.push(source);
     dry.get(id).update(samples);
     dryLevels[source] = level(samples);
     if (record) pcm[source] = samples.slice();
     for (const p of control.paths.filter(p => p.sourceId === source)) voice.byOrder[p.order] = (voice.byOrder[p.order] ?? 0) + 1;
    }
    if (id === 'bati-approach') npcLastBlock = block;
   }
   census.proposed += proposed;
   census.admitted += control.paths.length;
   for (const p of control.paths) identities.set(p.id, p);
   const applied = appliedSlots(renderer, identities);
   const packet = engine.visual?.soundMapFrame && engine.visual.soundMapFrame.sequence !== oldSequence
    ? soundMapPacket(engine.visual, first, active) : null;
   if (packet) {
    oldSequence = packet.soundMapFrame.sequence;
    assert.equal(packet.soundMapFrame.audioFrame, first);
    packet.appliedPaths = applied;
    packet.voices.forEach((voice, i) => {
     const slot = active[i];
     voice.observationAgeMs = (ticks - slot.vehicle.observationTicks) / 10_000;
     voice.renderGeneration = slot.generation;
     if (drive.observationStepMs) Object.assign(voice,{position:[...slot.vehicle.position],velocity:[...slot.vehicle.velocity]});
    });
    for (const [key, value] of Object.entries(packet.soundMapFrame.diagnostics.candidateTotals)) candidateTotals[key] = (candidateTotals[key] ?? 0) + value;
    rows.push(packet);
   }
   if (record) records.push({ control: { frame: control.frame, paths: control.paths, sourceGenerations: control.sourceGenerations },
    pcm, applied, packet, dryLevels });
   worksetCounts[lastWorkset.tile.surfaces.length] = (worksetCounts[lastWorkset.tile.surfaces.length] ?? 0) + 1;
  }
  assert(renderer.stats.peak > 0 && !renderer.stats.limited && !renderer.stats.pathOverflow);
  assert(channels.every(ch => ch.subarray(-blockFrames).every(x => x === 0)), 'The finite source release must finish before the WAV edit');
  census.headroomOmitted = engine.stats.headroomPathsOmitted;
  for (const [id, hash] of dry) evidence[id].drySHA256 = hash.digest('hex');
  const take = saveMappedTake(directory, name, channels, rows, file);
  return { ...take, records, settings, rows, receipt: { ...take.receipt, maxActive, npcLastBlock, voices: evidence,
   candidateTotalsAtTelemetryFrames: candidateTotals, controlsAcrossAllBlocks: census, worksetSurfaceCounts: worksetCounts,
   mixer: { limitedFrames: renderer.stats.limited, pathOverflow: renderer.stats.pathOverflow, peak: renderer.stats.peak },
   admission: 'Final gameplay control after per-emitter budget and stock source headroom' } };
 } finally { await engine.close(); }
}

function filteredPacket(packet, admitted, applied) {
 const frame = packet.soundMapFrame;
 const ids = new Set(admitted.map(p => p.id));
 let omitted = 0;
 const paths = frame.paths.map(p => {
  if (p.status !== 'selected' || ids.has(p.id)) return p;
  omitted++;
  return { ...p, status: 'pruned', reason: 'comparison-withheld-after-admission', rate: null };
 });
 const counts = frame.diagnostics.candidateTotals;
 return { ...packet, appliedPaths: applied, soundMapFrame: { ...frame, paths,
  diagnostics: { ...frame.diagnostics, candidateTotals: { ...counts, selected: ids.size, pruned: counts.pruned + omitted },
   omittedSelectedPaths: Math.max(0, ids.size - paths.filter(p => p.status === 'selected').length) } } };
}

// Replay the exact dry blocks and final production controls. Removing a path
// after admission cannot let another reflector fill its freed position.
export function replayMappedPaths(solo, directory, name, include, { save = true } = {}) {
 const renderer = new StreamingRenderer(solo.settings);
 renderer.setOutputPreferences({ richAudioEnabled: true, outputLevel: .8 });
 const channels = stereo(solo.channels[0].length), rows = [], identities = new Map();
 const silence = new Float32Array(blockFrames);
 const inputs = Object.fromEntries(solo.settings.sourceIds.map(id => [id, silence]));
 const selectedOrders = new Map();
 let comparedSlots = 0, removedControls = 0;
 for (const block of solo.records) {
  const paths = block.control.paths.filter(include);
  removedControls += block.control.paths.length - paths.length;
  for (const p of paths) {
   identities.set(p.id, p);
   if (!selectedOrders.has(p.sourceId)) selectedOrders.set(p.sourceId, {});
   const totals = selectedOrders.get(p.sourceId);
   totals[p.order] = (totals[p.order] ?? 0) + 1;
  }
  renderer.accept({ ...block.control, paths });
  for (const source of solo.settings.sourceIds) inputs[source] = block.pcm[source] ?? silence;
  const first = block.control.frame;
  renderer.process(inputs, ...channels.map(ch => ch.subarray(first, first + blockFrames)), blockFrames);
  const applied = appliedSlots(renderer, identities);
  const expected = block.applied.filter(include);
  const sorted = arr => [...arr].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sorted(applied), sorted(expected), 'Unrelated mixer delay, gains, placement or release changed at frame ' + first);
  comparedSlots += expected.length;
  if (block.packet) rows.push(filteredPacket(block.packet, paths, applied));
 }
 assert.equal(renderer.stats.limited, 0);
 if (!save) return { channels, comparedSlots, removedControls };
 const take = saveMappedTake(directory, name, channels, rows);
 const voices = Object.fromEntries(Object.entries(solo.receipt.voices).map(([vehicle, v]) => {
  const byOrder = {};
  for (const source of v.source) for (const [order, n] of Object.entries(selectedOrders.get(source) ?? {}))
   byOrder[order] = (byOrder[order] ?? 0) + n;
  return [vehicle, { ...v, byOrder }];
 }));
 return { ...take, rows, receipt: { ...take.receipt, comparedSlots, removedControls, voices,
  drySHA256: solo.receipt.voices['adder-pass'].drySHA256, mixer: { peak: renderer.stats.peak, limitedFrames: renderer.stats.limited } } };
}

function saveMappedTake(directory, name, channels, rows, file = name + '.wav') {
 const wavSHA256 = writeStereoWave(path.join(directory, file), channels);
 const timeline = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
 fs.writeFileSync(path.join(directory, 'soundmap-' + name + '.jsonl'), timeline, { flag: 'wx' });
 console.log(file + ' ready');
 return { channels, receipt: { name, frames: channels[0].length, soundMapFrames: rows.length,
  wavSHA256, timelineSHA256: sha256(timeline) } };
}
