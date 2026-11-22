import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { vehicleBlockFrames as blockFrames, vehicleSampleRate as sampleRate } from '../src/acoustics/vehicle/pipeline.mjs';
import { parseArguments, readJson, voiceInputs, writeStereoWave, writeJson } from './audio/powertrain-drive.mjs';
import { measureMappedTransitions } from './audio/mapped-drive-continuity.mjs';
import { mappedDrive, prepareDriveWindows } from './audio/mapped-drive-scene.mjs';
import { renderMappedPerformance, replayMappedPaths } from './audio/mapped-drive-render.mjs';

const argv = process.argv.slice(2), passOnly = argv.at(-1) === '--pass-only';
const args = parseArguments(passOnly ? argv.slice(0, -1) : argv);
const directory = args['--output'], privateRoot = fileURLToPath(new URL('../.local/', import.meta.url));
assert(directory.startsWith(privateRoot) && !fs.existsSync(directory), 'Choose a fresh private output folder inside .local');
const placement = readJson(args['--placement']), config = readJson(args['--world']);
const inputs = voiceInputs(args['--package']), session = randomUUID().replaceAll('-', '');
if (!passOnly) assert.equal(inputs.independent.context, 'npc', 'Two-vehicle mapped drives require the independent NPC donor bank');
const drive = mappedDrive(placement, inputs.independent);
const blocks = Math.ceil(drive.seconds * sampleRate / blockFrames);
fs.mkdirSync(directory, { recursive: true });
const { windows, diagnostics } = await prepareDriveWindows({ config, session, drive, placement, inputs, blocks, blockMs: blockFrames * 1000 / sampleRate });
writeJson(path.join(directory, 'worker-windows.json'), diagnostics);
const setup = { blocks, directory, windows, drive, inputs, session };
const full = await renderMappedPerformance({ ...setup, name: 'multi', fleet: false, record: !passOnly });
const report = { kind: 'mapped-installed-vehicle-drive', session, sampleRate, blockFrames, motion: 'authored',
 material: 'Retained stock Bati PCM with authored passive reflection coefficients and unverified native-length calibration',
 sourceBankSHA256: inputs.bank.provenance.awcSha256, normalisation: 'none', masterGain: full.settings.masterGain,
 outputLevel: .8, workerSourcePoses: 'Common worker packets use both authored performances for scene discovery',
 endOfPass: 'Both files and replays use a finite final source release before the last sample',
 stages: { multi: full.receipt } };
if (passOnly) { writeJson(path.join(directory, 'result.json'), report); }
else { await comparison(); }

function countPlanes(paths, byId) {
 const faces = [], walls = [];
 for (const id of new Set(paths.flatMap(p => p.surfaceIds))) {
  const face = byId.get(id);
  if (!face) continue;
  const n = face.normal;
  // Count exposed wall supports in the handoff. The underlying candidates
  // still use their individual clipped faces and visibility tests on every leg.
  if (faces.some(old => {
   const dot = old.n.reduce((sum, x, i) => sum + x * n[i], 0);
   const separation = old.n.reduce((sum, x, i) => sum + x * (face.center[i] - old.center[i]), 0);
   return Math.abs(dot) > Math.cos(2 * Math.PI / 180) && Math.abs(separation) < .12;
  })) continue;
  faces.push({ n, center: face.center, id });
  if (Math.abs(n[2]) < .5) walls.push(id);
 }
 return { planes: faces.length, steepWalls: walls.length, walls, finiteFaces: new Set(paths.flatMap(p => p.surfaceIds)).size };
}

function witnesses(take) {
 const routes = new Map();
 let byId, peakWalls = { steepWalls: 0, planes: 0 };
 for (const row of take.rows) {
  if (row.soundMapGeometry) byId = new Map(row.soundMapGeometry.surfaces.map(s => [s.id, s]));
  const selected = row.soundMapFrame.paths.filter(p => p.status === 'selected' && p.order && p.bands);
  if (!byId || !row.soundMapFrame.geometryGeneration) continue;
  const counts = countPlanes(selected, byId);
  if (counts.steepWalls > peakWalls.steepWalls || counts.steepWalls === peakWalls.steepWalls && counts.planes > peakWalls.planes) peakWalls = { ...counts, sampleFrame: row.sampleFrame };
  for (const p of selected.filter(p => p.order >= 2)) {
   const direct = row.soundMapFrame.paths.find(d => d.sourceId === p.sourceId && d.order === 0 && d.status === 'selected');
   const slot = row.appliedPaths.find(s => s.present && s.id === p.id);
   if (!direct || !slot || !slot.gainBands.every(x => x > 0)) continue;
   const surfaces = countPlanes([p], byId);
   if (surfaces.planes < 2) continue;
   const rec = take.records[row.sampleFrame / blockFrames];
   const strength = Math.max(...slot.gainBands) * (rec.dryLevels[p.sourceId] ?? 0);
   const rank = Math.min(surfaces.steepWalls, 2);
   if (!routes.has(p.order)) routes.set(p.order, new Map());
   const group = routes.get(p.order);
   if (!group.has(p.id)) group.set(p.id, []);
   group.get(p.id).push( { sampleFrame: row.sampleFrame, takeSeconds: row.sampleFrame / sampleRate,
    direct, reflected: p, orderedSurfaceIds: p.surfaceIds, bouncePoints: p.points,
    normals: p.surfaceIds.map(id => byId.get(id).normal), steepWallCount: rank,
    strength, pressureRatio: p.bands[0] / direct.bands[0], pathLength: p.distance,
    predictedExcessTravelMs: (p.distance - direct.distance) * 1000 / row.soundMapFrame.settings.engine.soundSpeed,
    applied: { direct: row.appliedPaths.find(s => s.id === direct.id), reflected: slot } });
  }
 }
 const chosen = new Map();
 for (const [order, byRoute] of routes) {
  // Limit the offline stem renders. Rank actual finite wall pairs ahead of a
  // floor return and use source pressure to shortlist four interesting trains.
  const shortlist = [...byRoute].map(([id, rows]) => ({
   id, rows, wallCount: Math.max(...rows.map(r => r.steepWallCount)), pressure: Math.max(...rows.map(r => r.strength))
  })).sort((a, b) => b.wallCount - a.wallCount || b.pressure - a.pressure || a.id.localeCompare(b.id)).slice(0, 4);
  for (const route of shortlist.filter(r => r.wallCount === shortlist[0].wallCount)) {
   const isolated = replayMappedPaths(take, directory, '', p => p.id === route.id, { save: false });
   for (const row of route.rows.filter(r => r.steepWallCount === route.wallCount)) {
    let power = 0;
    for (const ch of isolated.channels) for (let i = row.sampleFrame; i < row.sampleFrame + blockFrames; i++) power += ch[i] ** 2;
    const rms = Math.sqrt(power / (2 * blockFrames));
    if (rms > (chosen.get(order)?.isolatedBlockRms ?? 0)) chosen.set(order, { ...row, isolatedBlockRms: rms });
   }
  }
 }
 return { chosen, peakWalls };
}

function difference(first, second, offset = 0, length = first[0].length - offset) {
 const squared = [0, 0], reference = [0, 0], peak = [0, 0];
 for (let ch = 0; ch < 2; ch++) for (let i = offset; i < offset + length; i++) {
  const d = first[ch][i] - second[ch][i];
  squared[ch] += d * d;
  reference[ch] += second[ch][i] ** 2;
  peak[ch] = Math.max(peak[ch], Math.abs(d));
 }
 return { offset, frames: length, rms: squared.map(x => Math.sqrt(x / length)), peak,
  relativeDb: squared.map((x, i) => reference[i] && x ? 10 * Math.log10(x / reference[i]) : null) };
}

function stem(file, fullChannels, omitted) {
 return writeStereoWave(path.join(directory, file), fullChannels.map((ch, side) => ch.map((x, i) => x - omitted[side][i])));
}

async function comparison() {
 const { chosen, peakWalls } = witnesses(full);
 const pair = chosen.get(2);
 assert(pair, 'No distinct finite two-surface route reached an active mixer slot. The uninterrupted WAV is retained.');
 report.stages.multi.witness = pair;
 report.stages.multi.simultaneousSurfaces = peakWalls;
 report.stages.multi.witnessesByOrder = Object.fromEntries(chosen);
 const waveformCheck = replayMappedPaths(full, directory, '', () => true, { save: false });
 assert.deepEqual(waveformCheck.channels, full.channels, 'Full DSP replay differs from the original production mix');
 const direct = replayMappedPaths(full, directory, 'direct', p => p.order === 0);
 const single = replayMappedPaths(full, directory, 'single', p => p.order <= 1);
 report.transitions = measureMappedTransitions(full, single);
 const held = replayMappedPaths(full, directory, 'withheld', p => p.id !== pair.reflected.id);
 report.stages.direct = direct.receipt;
 report.stages.single = single.receipt;
 report.stages.withheld = held.receipt;
 const witnessDelta = difference(full.channels, held.channels, pair.sampleFrame, blockFrames);
 assert(Math.max(...witnessDelta.peak) > 1e-8, 'Withdrawing the two-wall route did not change its witness block');
 const isolated = replayMappedPaths(full, directory, '', p => p.id === pair.reflected.id, { save: false });
 const residual = full.channels.map((ch, side) => ch.map((x, i) => x - held.channels[side][i]));
 const cancellation = difference(residual, isolated.channels);
 assert(Math.max(...cancellation.peak) < 1e-7, 'Ablation residual differs from the isolated route');
 report.withdrawal = { id: pair.reflected.id, sampleFrame: pair.sampleFrame,
  removedControls: held.receipt.removedControls, unrelatedSlotsMatched: held.receipt.comparedSlots,
  witnessDelta, wholeTake: difference(full.channels, held.channels), isolatedNull: cancellation,
  stem: 'isolated-two-wall.wav', stemSHA256: writeStereoWave(path.join(directory, 'isolated-two-wall.wav'), isolated.channels),
  policy: 'Exact production controls after headroom admission, identical dry source blocks and matched surviving mixer states in every block' };
 for (const [order, witness] of chosen) {
  if (order === 2) { witness.pcmDelta = witnessDelta; continue; }
  const higher = replayMappedPaths(full, directory, '', p => p.id !== witness.reflected.id, { save: false });
  witness.pcmDelta = difference(full.channels, higher.channels, witness.sampleFrame, blockFrames);
  assert(Math.max(...witness.pcmDelta.peak) > 1e-8, 'The reported higher-order witness must change the mixed PCM');
 }
 report.multiBounceDelta = { wholeTake: difference(full.channels, single.channels),
  stem: 'multi-minus-single.wav', stemSHA256: stem('multi-minus-single.wav', full.channels, single.channels),
  windows: [] };
 for (let start = 0; start + sampleRate / 4 <= full.receipt.frames; start += sampleRate / 4) {
  report.multiBounceDelta.windows.push(difference(full.channels, single.channels, start, sampleRate / 4));
 }
 report.bestComparisonWindow = report.multiBounceDelta.windows.reduce((best, next) =>
  Math.hypot(...next.rms) > Math.hypot(...best.rms) ? next : best);
 const gap = sampleRate / 2, frames = full.receipt.frames;
 const joined = [0, 1].map(side => {
  const channel = new Float32Array(3 * frames + 2 * gap);
  for (const [i, take] of [direct, single, full].entries()) channel.set(take.channels[side], i * (frames + gap));
  return channel;
 });
 report.comparison = { file: 'PLAY FIRST - mapped drive.wav', takes: ['direct', 'single', 'multi'].map((take, i) => ({ take, firstFrame: i * (frames + gap), frames })) };
 report.comparison.sha256 = writeStereoWave(path.join(directory, report.comparison.file), joined);
 const resultFile = path.join(directory, 'result.json');
 writeJson(resultFile, report);
 console.log(report.comparison.file + ' ready');
 const fleet = await renderMappedPerformance({ ...setup, name: 'two-vehicles', fleet: true, record: true });
 report.stages['two-vehicles'] = fleet.receipt;
 const a = fleet.receipt.voices['adder-pass'], b = fleet.receipt.voices['bati-approach'];
 assert.equal(a.drySHA256, full.receipt.voices['adder-pass'].drySHA256, 'The primary voice changed when the NPC was present');
 assert.equal(fleet.receipt.maxActive, 2);
 assert(a.byOrder[0] && a.byOrder[1] && b.byOrder[0] && b.byOrder[1], 'Each vehicle needs direct and reflected sound');
 const primary = replayMappedPaths(fleet, directory, '', p => a.source.includes(p.sourceId), { save: false });
 const npc = replayMappedPaths(fleet, directory, '', p => b.source.includes(p.sourceId), { save: false });
 const combined = primary.channels.map((ch, side) => ch.map((x, i) => x + npc.channels[side][i]));
 const independentNull = difference(fleet.channels, combined);
 assert(Math.max(...independentNull.peak) < 1e-7, 'Independent source contributions must sum to the observed fleet output');
 report.sourceIndependence = { primaryDryIdenticalToSolo: true, actualFleetMinusSumOfIndependentlyReplayedVoices: independentNull,
  primaryWithFleetSelectionVersusSolo: difference(primary.channels, full.channels),
  independentlyMatchedPrimarySlots: primary.comparedSlots, independentlyMatchedNpcSlots: npc.comparedSlots };
 const removed = (fleet.receipt.npcLastBlock + 1) * blockFrames;
 report.retirement = { removedFrame: removed, before: difference(fleet.channels, full.channels, removed - 4 * blockFrames, 4 * blockFrames),
  after: difference(fleet.channels, full.channels, removed + 32 * blockFrames, 4 * blockFrames) };
 assert(Math.max(...report.retirement.before.peak) > .00001);
 assert(Math.max(...report.retirement.after.peak) < Math.max(...report.retirement.before.peak) * .01);
 const changes = full.records.map((r, i) => JSON.stringify({ sampleFrame: i * blockFrames,
  control: r.control.paths.map(p => ({ id: p.id, candidateId: p.candidateId, sourceId: p.sourceId, order: p.order, pan: p.pan, bands: p.bands })),
  applied: r.applied }));
 fs.writeFileSync(path.join(directory, 'mixer-blocks.jsonl'), changes.join('\n') + '\n', { flag: 'wx' });
 fs.writeFileSync(resultFile, JSON.stringify(report, null, 2) + '\n');
}
