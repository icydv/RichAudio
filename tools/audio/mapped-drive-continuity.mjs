// Offline inspection of the persisted mixer state and the matched single- and
// multi-bounce stereo buffers. Time is the beginning of the indicated PCM block.
import assert from 'node:assert/strict';

const frames = 512, rate = 48000;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = x => x.map(v => v / Math.hypot(...x));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

function larger(previous, value, sampleFrame, detail = {}) {
 return !previous || previous.value < value ? {value, sampleFrame, ...detail} : previous;
}

function blockLevel(channels, single, start) {
 const sum = [0, 0], delta = [0, 0];
 let residualBoundary = 0, mixBoundary = 0, residualInterior = 0, mixInterior = 0;
 for (let side = 0; side < 2; side++) {
  const full = channels[side], one = single[side];
  for (let i = start; i < start + frames; i++) {
   const x = full[i], d = x - one[i];
   sum[side] += x*x;
   delta[side] += d*d;
   if (i === 0) continue;
   const step = Math.abs(x - full[i-1]), change = Math.abs(d - (full[i-1] - one[i-1]));
   if (i === start) {
    mixBoundary = Math.max(mixBoundary, step);
    residualBoundary = Math.max(residualBoundary, change);
   } else {
    mixInterior = Math.max(mixInterior, step);
    residualInterior = Math.max(residualInterior, change);
   }
  }
 }
 return {mixRms: Math.sqrt((sum[0]+sum[1])/(2*frames)), residualRms: Math.sqrt((delta[0]+delta[1])/(2*frames)),
  residualPowerPan: delta[0] + delta[1] > 0 ? (delta[1]-delta[0])/(delta[0]+delta[1]) : null,
  mixBoundary, residualBoundary, mixInterior, residualInterior};
}

export function measureMappedTransitions(solo, single) {
 assert.equal(solo.records.length * frames, solo.channels[0].length);
 assert.equal(single.channels[0].length, solo.channels[0].length);
 const changes = {physicalFaceHandoffs: 0, lost: 0, resumedWithinTwoBlocks: 0,
  releasesSeenAfterFirstBlock: 0, maximumRemainingReleaseFrames: 0, examples: {}};
 const pan = {raysChecked: 0, maximumArrivalVectorError: 0, maximumSolverPanError: 0,
  maximumEndOfBlockPanDifference: null, maximumInterBlockPanChange: null, widestCameraTurn: null};
 const pcm = {units: 'Float32 full scale. Each RMS window spans 512 stereo frames. Residual is multi minus single.',
  boundariesWithHigherOrderSetChanges: 0, largestResidualBoundary: null, largestResidualInterior: null,
  largestMixedBoundary: null, largestMixedInterior: null, largestChangeBoundary: null,
  largestChangeRmsStep: null, largestHandoffBoundary: null};
 const lastLost = new Map();
 let previous = new Map(), lastLevel = null, firstRight;
 for (const record of solo.records) {
  const frame = record.control.frame;
  const reflected = new Map(record.control.paths.filter(p => p.order > 0).map(p => [p.id, p]));
  const taps = new Map(record.applied.map(t => [t.id, t]));
  const level = blockLevel(solo.channels, single.channels, frame);
  pcm.largestMixedBoundary = larger(pcm.largestMixedBoundary, level.mixBoundary, frame);
  pcm.largestMixedInterior = larger(pcm.largestMixedInterior, level.mixInterior, frame);
  pcm.largestResidualBoundary = larger(pcm.largestResidualBoundary, level.residualBoundary, frame);
  pcm.largestResidualInterior = larger(pcm.largestResidualInterior, level.residualInterior, frame);
  let orderChanged = false;
  for (const [id, p] of previous) {
   if (reflected.has(id)) continue;
   const tap = taps.get(id);
   changes.lost++;
   orderChanged ||= p.order > 1;
   lastLost.set(id, frame);
   if (tap && !tap.present && tap.releaseFrames > 0) {
    changes.releasesSeenAfterFirstBlock++;
    changes.maximumRemainingReleaseFrames = Math.max(changes.maximumRemainingReleaseFrames, tap.releaseFrames);
    changes.examples.release ??= {frame, id, order: p.order, remainingFramesAtBlockEnd: tap.releaseFrames};
   }
  }
  for (const [id, p] of reflected) {
   const before = previous.get(id), tap = taps.get(id);
   assert.ok(tap?.present, 'Retained reflection is absent from the actual mixer');
   if (!before) {
    orderChanged ||= p.order > 1;
    if (frame - lastLost.get(id) <= 2 * frames) {
     changes.resumedWithinTwoBlocks++;
     changes.examples.quickReturn ??= {frame, id, order: p.order, absentBlocks: (frame-lastLost.get(id))/frames};
    }
   } else {
    if (p.candidateId && before.candidateId && before.candidateId !== p.candidateId) {
     changes.physicalFaceHandoffs++;
     changes.examples.faceHandoff ??= {frame, id, previousFaceRoute: before.candidateId, faceRoute: p.candidateId};
     pcm.largestHandoffBoundary = larger(pcm.largestHandoffBoundary, level.mixBoundary, frame,
      {id, precedingInteriorPeak: lastLevel.mixInterior, followingInteriorPeak: level.mixInterior});
    }
    pan.maximumInterBlockPanChange = larger(pan.maximumInterBlockPanChange, Math.abs(tap.pan-before.appliedPan), frame, {id});
   }
   pan.maximumEndOfBlockPanDifference = larger(pan.maximumEndOfBlockPanDifference, Math.abs(tap.pan-p.pan), frame, {id});
   reflected.set(id, {...p, appliedPan: tap.pan});
  }
  if (orderChanged && lastLevel) {
   pcm.boundariesWithHigherOrderSetChanges++;
   pcm.largestChangeBoundary = larger(pcm.largestChangeBoundary, level.residualBoundary, frame,
    {precedingInteriorPeak: lastLevel.residualInterior, followingInteriorPeak: level.residualInterior,
     mixedBoundary: level.mixBoundary});
   pcm.largestChangeRmsStep = larger(pcm.largestChangeRmsStep, Math.abs(level.residualRms-lastLevel.residualRms), frame,
    {beforeRms: lastLevel.residualRms, afterRms: level.residualRms, beforePowerPan: lastLevel.residualPowerPan,
     afterPowerPan: level.residualPowerPan});
  }
  const map = record.packet?.soundMapFrame;
  if (map?.listener?.valid) {
   const right = unit(cross(map.listener.forward, map.listener.up));
   firstRight ??= right;
   const degrees = 180/Math.PI*Math.acos(Math.max(-1, Math.min(1, dot(firstRight, right))));
   pan.widestCameraTurn = larger(pan.widestCameraTurn, degrees, frame);
   for (const ray of map.paths.filter(p => p.status === 'selected' && p.order > 0)) {
    const direction = unit(ray.points.at(-1).map((v, i) => v - ray.listenerAtArrival[i]));
    const angularVectorError = Math.hypot(...direction.map((v, i) => v - ray.arrivalDirection[i]));
    pan.maximumArrivalVectorError = Math.max(pan.maximumArrivalVectorError, angularVectorError);
    pan.maximumSolverPanError = Math.max(pan.maximumSolverPanError, Math.abs(ray.pan-dot(direction, right)));
    pan.raysChecked++;
   }
  }
  previous = reflected;
  lastLevel = level;
 }
 return {sampleRate: rate, blockFrames: frames, changes, pan, pcm};
}
