import { dot, length, sub } from '../research/local-geometry.mjs';

const maximumRadius = .35;
const frequencies = [200, 1600, 6400];
const byScene = new WeakMap();
const clamp01 = x => Math.max(0, Math.min(1, x));

// Only a compact, approximately circular capsule translated in world space
// qualifies. A nonuniform or sheared native primitive retains opaque shadow.
export function circularCapsule(primitive) {
  if (primitive.family !== 'Capsule') return null;
  const {a, b, radiusAxes} = primitive;
  const radii = radiusAxes.map(length), radius = Math.max(...radii);
  if (radius > maximumRadius || radius - Math.min(...radii) > radius * .01) return null;
  for (let i = 0; i < radiusAxes.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(dot(radiusAxes[i], radiusAxes[j])) > radius * radius * .01) return null;
    }
  }
  return {a, b, radius};
}

export function validateCapsuleObstructions(capsules, tile) {
  const surfaces = new Map(tile.surfaces.map(surface => [surface.id, surface]));
  const seen = new Set();
  if (!Array.isArray(capsules) || capsules.length > 64) throw Error('bounded capsule obstructions');
  for (const {a, b, radius, surfaceIds} of capsules) {
    if (![a,b].every(p => Array.isArray(p) && p.length === 3 &&
      p.every(n => Number.isFinite(n) && Math.abs(n) <= 100000)) ||
      length(sub(a,b)) <= 1e-8 || !Number.isFinite(radius) || radius <= 0 || radius > maximumRadius ||
      !Array.isArray(surfaceIds) || !surfaceIds.length || surfaceIds.length > 2048) {
      throw Error('bounded capsule obstruction geometry');
    }
    for (const id of surfaceIds) {
      if (seen.has(id) || surfaces.get(id)?.provenance?.reference !== 'installed-analytic-approximation01') {
        throw Error('capsule requires unique installed analytic support');
      }
      seen.add(id);
    }
  }
}

export function capsuleObstruction(scene, hits, source, listener) {
  const capsules = scene.observationModel?.capsuleObstructions;
  if (!scene.config.smallCapsuleObstruction || !capsules?.length || !hits.length) return null;
  let lookup = byScene.get(scene);
  if (!lookup) {
    lookup = new Map();
    for (const capsule of capsules) for (const id of capsule.surfaceIds) lookup.set(id, capsule);
    byScene.set(scene, lookup);
  }
  const capsule = lookup.get(hits[0].id);
  if (!capsule || hits.some(hit => lookup.get(hit.id) !== capsule)) return null;

  const {a,b,radius} = capsule;
  const axis = sub(b,a), ray = sub(listener,source), fromSource = sub(a,source);
  const distance = length(ray), rayDirection = ray.map(n => n / distance);
  const along = dot(axis,rayDirection);
  const perpendicularSquared = dot(axis,axis) - along * along;
  // Near-axial incidence has a long shadow through the capsule body and
  // falls outside the small transverse-obstruction approximation.
  if (perpendicularSquared < .25 * dot(axis,axis)) return null;
  const axisPosition = clamp01((dot(fromSource,rayDirection)*along - dot(fromSource,axis)) / perpendicularSquared);
  const offset = fromSource.map((n,i) => n + axisPosition * axis[i]);
  const sourceLeg = dot(offset,rayDirection), listenerLeg = distance - sourceLeg;
  if (Math.min(sourceLeg,listenerLeg) < 2 * radius) return null;
  const clearance = length(offset.map((n,i) => n - sourceLeg * rayDirection[i]));
  const overlap = 1 - clamp01((clearance / radius) ** 2);
  const shadowWidth = 2 * radius * overlap ** 2;
  // A smooth, passive direct-path approximation based on transverse width
  // relative to each first Fresnel radius. It joins unity at grazing and
  // keeps the original retarded time because it is a near-direct filter.
  // This is an authored pressure response, not a solved cylinder wavefield.
  const pressure = frequencies.map(f => {
    const fresnelRadius = Math.sqrt(scene.config.soundSpeed/f * sourceLeg * listenerLeg / distance);
    return Math.exp(-shadowWidth / fresnelRadius);
  });
  return {radius,clearance,shadowWidth,sourceLeg,listenerLeg,pressure};
}
