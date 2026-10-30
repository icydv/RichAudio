import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUrbanEnvironment } from '../src/acoustics/vehicle/urban-environment.mjs';
import { trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, pathGeometry, solvePath } from '../src/acoustics/engine/paths.mjs';
import { inBox, onPatch } from '../src/acoustics/research/local-geometry.mjs';

const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} versus ${expected}`);
const track = position => trajectory([{ time: 0, position }, { time: 20, position }]);
const sourcePosition = [-5, 0, 1.5], listenerPosition = [5, 0, 1.5];
const wallOnly = scene => candidatePaths(scene).filter(candidate =>
  candidate.surfaces.length && candidate.surfaces.every(surface => surface.id.startsWith('wall-')));
function solved(scene, candidate, source = sourcePosition, listener = listenerPosition) {
  return solvePath(scene, { track: track(source), directivity: 0 }, track(listener), 2, candidate);
}

test('authored street consists only of a finite road and inward-facing facades', () => {
  const environment = createUrbanEnvironment(), { scene } = environment;
  assert.deepEqual(scene.tile.surfaces.map(surface => surface.id), ['road', 'wall-north', 'wall-south']);
  assert.deepEqual(scene.tile.surfaces[0].half, [50, 12]);
  assert.deepEqual(scene.tile.surfaces[1].center, [0, 12, 12]);
  assert.deepEqual(scene.tile.surfaces[1].normal, [0, -1, 0]);
  assert.deepEqual(scene.tile.surfaces[2].center, [0, -12, 12]);
  assert.deepEqual(scene.tile.surfaces[2].normal, [0, 1, 0]);
  assert.deepEqual(scene.tile.surfaces[1].half, [50, 12]);
  assert.equal(scene.tile.coverage, 'complete-synthetic');
  assert.equal(scene.tile.interior, 'outdoors');
  assert.equal(environment.lateEvidence, null);
  assert.equal(environment.provenance.gameGeometry, false);
  assert.equal(environment.provenance.physicalCalibration, 'unverified');
  for (const surface of scene.tile.surfaces) {
    assert.equal(surface.provenance.kind, 'synthetic');
    assert.equal(surface.provenance.reference, 'authored-open-urban-v1');
    assert.equal(surface.reflectiveSide, 'front');
    assert.ok(surface.corners.every(point => inBox(point, scene.tile.bounds)));
    assert.ok(Object.isFrozen(surface));
    const material = scene.materials[surface.id];
    assert.equal(material.basis, 'authored-assumption');
    material.reflection.forEach((energy, i) => close(energy + material.absorption[i], 1));
  }
  assert.deepEqual(scene.materials['wall-north'].reflection, [.94, .88, .72]);
  assert.deepEqual(scene.materials.road.reflection, [.85, .7, .45]);
});

test('two explicit alternating wall trains span orders three through ten and use real finite patches', () => {
  const { scene, provenance } = createUrbanEnvironment();
  assert.equal(scene.config.order, 2);
  assert.equal(scene.config.higherOrderPaths.length, 16);
  assert.equal(provenance.higherOrderCandidateCount, 16);
  const candidates = wallOnly(scene);
  assert.equal(candidates.length, 20);
  for (let order = 1; order <= 10; order++) {
    const pair = candidates.filter(candidate => candidate.surfaces.length === order);
    assert.equal(pair.length, 2, `order ${order}`);
    for (const candidate of pair) {
      candidate.surfaces.forEach((surface, i) => {
        assert.ok(scene.tile.surfaces.includes(surface));
        if (i) assert.notEqual(surface.id, candidate.surfaces[i - 1].id);
      });
      const geometry = pathGeometry(scene, sourcePosition, listenerPosition, candidate.surfaces);
      assert.equal(geometry.status, 'clear');
      assert.equal(geometry.points.length, order);
      close(geometry.distance, Math.hypot(10, order * 24));
      geometry.points.forEach((point, i) => assert.ok(onPatch(candidate.surfaces[i], point)));
      const result = solved(scene, candidate);
      assert.equal(result.status, 'renderable');
      close(result.delay, Math.hypot(10, order * 24) / 343);
    }
  }
});

test('changing width moves the facades and changes independently predicted echo spacing', () => {
  const delaysByOrder = new Map();
  for (const width of [12, 24, 40]) {
    const { scene } = createUrbanEnvironment({ width });
    assert.equal(scene.tile.surfaces.find(surface => surface.id === 'wall-north').center[1], width / 2);
    assert.equal(scene.tile.surfaces.find(surface => surface.id === 'wall-south').center[1], -width / 2);
    for (const candidate of wallOnly(scene)) {
      const order = candidate.surfaces.length, result = solved(scene, candidate);
      assert.equal(result.status, 'renderable');
      close(result.distance, Math.hypot(10, order * width));
      close(result.delay, Math.hypot(10, order * width) / 343);
      if (candidate.surfaces[0].id === 'wall-north') {
        const previous = delaysByOrder.get(order);
        if (previous !== undefined) assert.ok(result.delay > previous);
        delaysByOrder.set(order, result.delay);
      }
    }
    const direct = solved(scene, candidatePaths(scene)[0]);
    close(direct.delay, 10 / 343);
  }
});

test('absorptive control keeps every path point and delay while attenuating by actual bounce count', () => {
  const reflective = createUrbanEnvironment().scene;
  const absorptive = createUrbanEnvironment({ wallTreatment: 'absorptive' }).scene;
  assert.deepEqual(absorptive.tile, reflective.tile);
  assert.deepEqual(absorptive.config, reflective.config);
  assert.deepEqual(absorptive.materials.road, reflective.materials.road);
  const reflectiveCandidates = wallOnly(reflective), absorptiveCandidates = wallOnly(absorptive);
  assert.deepEqual(absorptiveCandidates.map(candidate => candidate.id), reflectiveCandidates.map(candidate => candidate.id));
  for (let i = 0; i < reflectiveCandidates.length; i++) {
    const a = solved(reflective, reflectiveCandidates[i]), b = solved(absorptive, absorptiveCandidates[i]);
    assert.equal(a.status, 'renderable');
    assert.equal(b.status, 'renderable');
    assert.deepEqual(b.points, a.points);
    close(b.delay, a.delay);
    for (let band = 0; band < 3; band++) {
      const ratio = absorptive.materials['wall-north'].reflection[band] /
        reflective.materials['wall-north'].reflection[band];
      close(b.bands[band] / a.bands[band], ratio ** (a.order / 2));
    }
  }
});

test('road control removes only the facades and retains identical direct and road paths', () => {
  const street = createUrbanEnvironment().scene;
  const environment = createUrbanEnvironment({ includeFacades: false }), road = environment.scene;
  assert.deepEqual(road.tile.surfaces, [street.tile.surfaces.find(surface => surface.id === 'road')]);
  assert.deepEqual(road.tile.bounds, street.tile.bounds);
  assert.deepEqual(road.tile.listenerAnchor, street.tile.listenerAnchor);
  assert.deepEqual(road.materials.road, street.materials.road);
  assert.equal(environment.lateEvidence, null);
  assert.equal(environment.provenance.higherOrderCandidateCount, 0);
  assert.deepEqual(candidatePaths(road).map(candidate => candidate.id), ['direct', 'r:road']);
  for (const candidate of candidatePaths(road)) {
    const match = candidatePaths(street).find(other => other.id === candidate.id);
    const a = solved(road, candidate), b = solved(street, match);
    assert.equal(a.status, 'renderable');
    assert.equal(b.status, 'renderable');
    assert.equal(a.delay, b.delay);
    assert.deepEqual(a.bands, b.bands);
    assert.deepEqual(a.points, b.points);
  }
});

test('finite street ends and wall tops reject the train rather than inventing infinite facades', () => {
  const { scene } = createUrbanEnvironment();
  for (const [source, listener] of [
    [[51, -1, 1.5], [51, 1, 1.5]],
    [[-5, 0, 25], [5, 0, 25]],
  ]) {
    assert.ok(inBox(source, scene.tile.bounds) && inBox(listener, scene.tile.bounds));
    assert.equal(pathGeometry(scene, source, listener, []).status, 'clear');
    for (const candidate of wallOnly(scene)) {
      assert.equal(pathGeometry(scene, source, listener, candidate.surfaces).status, 'outside-finite-patch-or-opening');
    }
  }
});

test('lower maximum order removes only the explicitly requested extra paths', () => {
  const two = createUrbanEnvironment({ maxOrder: 2 }).scene;
  const six = createUrbanEnvironment({ maxOrder: 6 }).scene;
  const ten = createUrbanEnvironment().scene;
  assert.deepEqual(two.tile, ten.tile);
  assert.deepEqual(six.tile, ten.tile);
  assert.equal(wallOnly(two).length, 4);
  assert.equal(wallOnly(six).length, 12);
  assert.deepEqual(candidatePaths(six).filter(candidate => candidate.surfaces.length <= 2), candidatePaths(two));
  assert.ok(candidatePaths(six).every(candidate => candidate.surfaces.length <= 6));
});

test('fixture rejects invalid dimensions, path orders and undeclared material variants', () => {
  for (const options of [
    { width: NaN }, { width: 5 }, { width: 81 }, { length: 19 }, { length: 241 },
    { height: 3 }, { height: 101 }, { duration: 0 }, { duration: 61 },
    { maxOrder: 1 }, { maxOrder: 11 }, { maxOrder: 3.5 },
    { includeFacades: 'yes' }, { wallTreatment: 'measured' }, { maxPaths: 0 }, { maxPaths: 65 },
  ]) assert.throws(() => createUrbanEnvironment(options));
  const { scene } = createUrbanEnvironment({ width: 80, length: 240, height: 100 });
  assert.ok(scene.tile.bounds.max.every((maximum, i) => maximum - scene.tile.bounds.min[i] <= 256));
});
