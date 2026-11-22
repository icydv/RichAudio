import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { installedStaticSceneMetadata01 } from '../../src/acoustics/world/installed-static-scene01.mjs';
import { InstalledSceneService01 } from '../../src/acoustics/world/installed-scene-service01.mjs';
import { registerPreparedSoundMapGeometry01 } from '../../src/acoustics/streaming/soundmap-telemetry.mjs';
import { vehicleDistanceSceneOptions } from '../../src/acoustics/vehicle/distance-presentation.mjs';
import { adderModel, add, unit } from './powertrain-drive.mjs';

const clamp = value => Math.max(0, Math.min(1, value));
const eased = t => t * t * (3 - 2 * t);
const between = (first, last, t) => first.map((x, i) => x + t * (last[i] - x));

export function mappedDrive(placement, independent) {
 const direction = unit([placement.forward[0], placement.forward[1], 0]);
 const distance = placement.halfLength ?? 2;
 const start = placement.sourceStart ?? add(placement.source, direction, -distance);
 const end = placement.sourceEnd ?? add(placement.source, direction, distance);
 const otherStart = placement.npcStart ?? placement.npcPosition ?? add(placement.source, direction, distance + 1);
 const otherEnd = placement.npcEnd ?? placement.npcPosition ?? otherStart;
 const facing = unit(placement.cameraForward ?? direction);
 const cameraAngle = Math.atan2(facing[1], facing[0]);
 const turn = placement.turnRadians ?? .9;
 const sec = placement.seconds ?? 8.0;
 assert(sec >= 5.5 && sec <= 30 && Number.isFinite(turn) && Math.abs(turn) <= Math.PI);
 const npcForward = placement.npcForward ?? direction.map(v => -v);
 const moveStart = .65, moveDuration = sec * .58, npcRemoveAt = sec * .73;
 function pose(first, last, seconds, since, duration) {
  const phase = clamp((seconds - since) / duration);
  const position = between(first, last, eased(phase));
  const velocity = first.map((x, i) => (last[i] - x) * 6 * phase * (1 - phase) / duration);
  return { position, velocity };
 }
 return {
  seconds: sec, listener: placement.listener, npcRemoveAt,
  at(seconds, ticks, fleet) {
   const step = clamp((seconds - sec * .72) / (sec * .22));
   const angle = cameraAngle + turn * eased(step);
   const peak = clamp((seconds - .65) / (moveDuration * .53));
   const lift = clamp((seconds - (.65 + moveDuration * .53)) / (moveDuration * .52));
   const rpm = .14 + .57 * eased(peak) - .48 * eased(lift);
   const common = { generation: 1, observationTicks: ticks, up: [0, 0, 1], valid: true, running: true };
   const vehicles = [{ ...common, id: 'adder-pass', model: adderModel, context: 'player',
    forward: direction, ...pose(start, end, seconds, moveStart, moveDuration), operatingPoint: rpm }];
   if (fleet && seconds < npcRemoveAt) {
    const rev = clamp((seconds - 1) / 1.1), easeOff = clamp((seconds - 2.7) / 1.2);
    vehicles.push({ ...common, ...independent, id: 'bati-approach', forward: npcForward,
     ...pose(otherStart, otherEnd, seconds, 1.1, moveDuration * .73),
     operatingPoint: .15 + .39 * eased(rev) - .30 * eased(easeOff) });
   }
   // Withdrawing the last observation leaves the existing finite mixer release
   // inside the WAV, including the silence at the comparison edit.
   return { vehicles: seconds >= sec - .16 ? [] : vehicles, forward: [Math.cos(angle), Math.sin(angle), 0] };
  }
 };
}

// Prepare exactly the worker packets that will be replayed on the authored
// sample clock. The live path retains its own wall clock and observation leases.
export async function prepareDriveWindows({ config, session, drive, placement, inputs, blocks, blockMs, surfaceRoughnessRmsMetres }) {
 let delivered = null;
 const service = new InstalledSceneService01({ config, session, unmanagedIntervalMs01: 150,
  onScene(scene, receipt) { delivered = { scene, receipt }; } });
 const windows = new Map(), diagnostics = [];
 try {
  for (let block = 0; block < blocks; block += 64) {
   const now = block * blockMs;
   const { vehicles } = drive.at(now / 1000, Math.round(now * 10000), true);
   const sources = vehicles.flatMap(v => {
    const profile = inputs.profiles.emitters?.[inputs.registry.resolve(v.model, v.context).bank.model];
    return [[profile?.engineOffset ?? .35, .65], [profile?.exhaustOffset ?? -.75, .3]]
     .map(([offset, height]) => add(add(v.position, v.forward, offset), v.up, height));
   });
   const request = { generation: 1, listener: drive.listener, sources, radius: placement.radius ?? 12,
    maximumSurfaces: 2048, adaptiveRadius: false, geometryTimeMs: now, durationMs: 1000,
    prepareSoundMapGeometry01: true,
    engine: { order: 2, installedReflectionTrains: true, maxPaths: 32, maxReflectors: 12,
     ...(surfaceRoughnessRmsMetres === undefined ? {} : {surfaceRoughnessRmsMetres}),
     ...vehicleDistanceSceneOptions('authored-detail-loss-v1') } };
   delivered = null;
   const until = performance.now() + 30000;
   let nextAttempt = 0;
   while (!delivered) {
    if (service.failed) throw Error(service.failure);
    if (performance.now() >= until) throw Error('No fresh retained worker scene at block ' + block);
    if (service.ready && !service.active && !service.pending && performance.now() >= nextAttempt) {
     service.updateWindow(request);
     nextAttempt = performance.now() + 175;
    }
    await sleep(10);
   }
   const { scene, receipt } = delivered;
   assert.equal(scene.tile.createdAt, now);
   assert(scene.tile.surfaces.length > 0 && scene.observationModel.evidence.length > 0,
    'The worker must supply qualified retained installed collision');
   registerPreparedSoundMapGeometry01(scene, receipt.preparedSoundMapGeometry, receipt);
   windows.set(block, scene);
   diagnostics.push({ block, geometryTimeMs: now, surfaces: scene.tile.surfaces.length,
    evidence: scene.observationModel.evidence, tile: scene.tile.id, packetDigest: receipt.packetDigest,
    reflectorIds: scene.observationModel.reflectionSurfaceIds,
    sequences: scene.observationModel.reflectionSequences, search: installedStaticSceneMetadata01(scene).reflectionSearch01,
    workerMilliseconds: receipt.workerPreparationMilliseconds });
  }
 } finally { await service.close(); }
 return { windows, diagnostics };
}
