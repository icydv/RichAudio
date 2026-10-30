import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VehicleOutputGuard,vehicleOutputCalibration} from '../src/acoustics/vehicle/output-guard.mjs';
test('vehicle headroom is attenuation only and rejects the complete block without changing PCM',()=>{
  assert.equal(vehicleOutputCalibration.beaconTrimDb,0);
  assert.ok(vehicleOutputCalibration.masterGain<0.7);
  const g=new VehicleOutputGuard(),l=new Float32Array([.1,-.2]),r=new Float32Array([.3,-.4]);
  const before=l.slice();g.apply(l,r);assert.deepEqual(l,before);assert.equal(g.stats.blocks,1);
  for(const bad of [.50001,-.50001,NaN,Infinity]){
    const right=new Float32Array([.1,bad]);assert.throws(()=>g.apply(l,right),/rejected/);assert.deepEqual(l,before);
  }
  assert.throws(()=>g.apply(l,r,1),/limited/);assert.equal(g.stats.blocks,1);assert.equal(g.stats.rejectedBlocks,5);
});
