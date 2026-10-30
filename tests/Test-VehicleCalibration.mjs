import test from 'node:test';
import assert from 'node:assert/strict';
import { measureVehicleLiveCalibration } from '../tools/Measure-VehicleLiveCalibration.mjs';

test('original component near-field direct/tunnel upper-control matrix stays below the vehicle digital ceiling', async () => {
  const report = await measureVehicleLiveCalibration();
  assert.equal(report.cases.length, 12); assert.ok(report.maximumPeak > 0 && report.maximumPeak < .5);
  assert.ok(report.cases.every(c => c.limiterFrames === 0 && c.shifts === 3 && c.outputTrimDb === 0));
  assert.ok(report.cases.some(c => c.scene === 'tunnel' && c.maximumPaths > 8));
  assert.equal(report.audioDeviceOpened, false);
});
