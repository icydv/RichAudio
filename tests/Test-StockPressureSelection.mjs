import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockExteriorPressure, stockExteriorPressureGains } from '../src/acoustics/vehicle/stock-pressure.mjs';
import { createStockVehiclePipeline } from '../src/acoustics/vehicle/pipeline.mjs';
import { createUrbanEnvironment } from '../src/acoustics/vehicle/urban-environment.mjs';

test('one shared stock profile carries the chosen10x balance and common audition headroom for any bank identity', () => {
  const ids = ['stock:lectro:engine', 'stock:lectro:exhaust', 'stock:installed_other:engine', 'stock:installed_other:exhaust'];
  const gains = stockExteriorPressureGains(ids);
  assert.equal(gains[ids[0]], .25); assert.equal(gains[ids[1]], 2.5);
  assert.equal(gains[ids[2]], .25); assert.equal(gains[ids[3]], 2.5);
  assert.equal(gains[ids[1]] / gains[ids[0]], 10);
  assert.ok(Object.isFrozen(gains) && Object.isFrozen(stockExteriorPressure));
  for (const invalid of [[], ['stock:lectro:exhaust'], ['stock:lectro:engine', 'stock:lectro:engine'], ['engine', 'exhaust']])
    assert.throws(() => stockExteriorPressureGains(invalid));
});

test('stock pipeline applies selected pressure once; historical generic calibration remains explicit', () => {
  const ids = ['stock:lectro:engine', 'stock:lectro:exhaust'];
  const options = { scene: createUrbanEnvironment({ duration: 3 }).scene, sourceIds: ids, directStem: true };
  const pipeline = createStockVehiclePipeline(options);
  try {
    assert.deepEqual(pipeline.renderer.sourcePressureGains, { [ids[0]]: .25, [ids[1]]: 2.5 });
    assert.deepEqual(pipeline.directRenderer.sourcePressureGains, pipeline.renderer.sourcePressureGains);
    assert.throws(() => createStockVehiclePipeline({ ...options, sourcePressureGains: {} }));
  } finally { pipeline.close(); }
});
