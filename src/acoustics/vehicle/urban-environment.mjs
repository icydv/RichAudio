// Original finite analytic street. These coordinates and materials describe no GTA location.
import { acousticScene, freeze, requireValue } from '../engine/contracts.mjs';
import { coordinateSpace, timeUnit, createTile } from '../research/local-geometry.mjs';

const REFERENCE = 'authored-open-urban-v1';
const WALL_IDS = ['wall-north', 'wall-south'];
const REFLECTION_ENERGY = freeze({
  road: [0.85, 0.70, 0.45],
  reflective: [0.94, 0.88, 0.72],
  absorptive: [0.25, 0.12, 0.04],
});
const bounded = (value, minimum, maximum) =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

function patch(id, center, normal, half, validUntil) {
  return {
    id, coordinateSpace, center, normal, u: [1, 0, 0], half,
    motion: 'static', reflectiveSide: 'front',
    provenance: { kind: 'synthetic', reference: REFERENCE },
    confidence: 1, version: 1, observedAt: 0, validUntil,
    material: { observedId: null, observedConfidence: null, acoustic: null },
  };
}

/** Explicit ordered paths supplement the normal first/second-order candidates.
 * Each path alternates actual opposite facades. Finite-support and every-leg
 * visibility checks still decide whether it exists at each source/listener pose.
 */
function alternatingWallPaths(maxOrder) {
  const paths = [];
  for (let order = 3; order <= maxOrder; order++) {
    for (let first = 0; first < 2; first++) {
      paths.push(Array.from({ length: order }, (_, i) => WALL_IDS[(first + i) % 2]));
    }
  }
  return paths;
}

/** Authored open-roof, open-ended street, with declared energy coefficients.
 * Width moves the two facades; wallTreatment changes only their materials.
 * includeFacades=false provides the identical finite road and scene settings.
 * There is no roof, end wall, diffuse late field or inferred Los Santos mesh.
 */
export function createUrbanEnvironment({
  width = 24, length = 100, height = 24, duration = 20,
  wallTreatment = 'reflective', includeFacades = true, maxOrder = 10, maxPaths = 32,
} = {}) {
  requireValue(bounded(width, 6, 80), 'urban width must be 6 to 80 metres');
  requireValue(bounded(length, 20, 240), 'urban length must be 20 to 240 metres');
  requireValue(bounded(height, 4, 100), 'urban height must be 4 to 100 metres');
  requireValue(bounded(duration, 0.1, 60), 'bounded urban duration');
  requireValue(['reflective', 'absorptive'].includes(wallTreatment), 'urban wall treatment');
  requireValue(typeof includeFacades === 'boolean', 'explicit urban facade flag');
  requireValue(Number.isInteger(maxOrder) && maxOrder >= 2 && maxOrder <= 10,
    'urban maximum order must be an integer from 2 to 10');
  requireValue(Number.isInteger(maxPaths) && maxPaths >= 1 && maxPaths <= 64,
    'bounded urban retained path count');

  const validUntil = (duration + 1) * 1000;
  const surfaces = [patch('road', [0, 0, 0], [0, 0, 1], [length / 2, width / 2], validUntil)];
  if (includeFacades) surfaces.push(
    patch('wall-north', [0, width / 2, height / 2], [0, -1, 0], [length / 2, height / 2], validUntil),
    patch('wall-south', [0, -width / 2, height / 2], [0, 1, 0], [length / 2, height / 2], validUntil),
  );
  const tile = createTile({
    schemaVersion: 1, id: `urban-${includeFacades ? 'street' : 'road'}-${width}-${length}-${height}`,
    coordinateSpace, timeUnit,
    bounds: { min: [-length / 2 - 2, -width / 2 - 2, -2],
      max: [length / 2 + 2, width / 2 + 2, height + 2] },
    listenerAnchor: [0, 0, 1.5], coverage: 'complete-synthetic', surfaces, missingRegions: [],
    version: 1, createdAt: 0, validUntil, build: REFERENCE, session: 'urban-offline-fixture',
    interior: 'outdoors', dynamicEpoch: 0,
  });
  const materials = Object.fromEntries(tile.surfaces.map(surface => [surface.id, {
    reflection: REFLECTION_ENERGY[surface.id === 'road' ? 'road' : wallTreatment],
    transmission: [0, 0, 0], basis: 'authored-assumption', reference: REFERENCE,
  }]));
  const higherOrderPaths = includeFacades ? alternatingWallPaths(maxOrder) : [];
  const scene = acousticScene(tile, materials, {
    order: 2, maxPaths, maxReflectors: 3, higherOrderPaths,
  });
  return freeze({
    scene, lateEvidence: null, dimensions: { width, length, height },
    provenance: {
      kind: 'authored-analytic-fixture', reference: REFERENCE,
      coordinateSpace, units: 'metres', coverage: 'complete-synthetic-within-authored-model',
      gameGeometry: false, physicalCalibration: 'unverified',
      wallTreatment: includeFacades ? wallTreatment : 'absent',
      reflectionEnergyBands: ['low', 'mid', 'high'],
      materialBasis: 'illustrative-energy-coefficients-not-measured-materials',
      requestedMaximumWallOrder: includeFacades ? maxOrder : 0,
      higherOrderCandidateCount: higherOrderPaths.length,
    },
    description: includeFacades
      ? `Authored finite ${width} metre wide open-roof, open-ended street with ${wallTreatment} facades`
      : 'Authored finite road control with identical bounds and no facades',
    limitations: [
      'This fixture is unrelated to Legion Square or any measured GTA location',
      'Only specular finite paths are represented; sky and street ends have no reflectors',
      'Additional wall paths stop at the declared order; retained path limits can omit candidates',
      'Energy coefficients are authored assumptions, not acoustic material measurements',
      'Diffuse reverberation, diffraction, scattering and measured modal resonance are unavailable',
    ],
  });
}
