import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spreadingDistance,solvePath} from '../src/acoustics/engine/paths.mjs';
import {conditionalDirectScene,trajectory} from '../src/acoustics/engine/contracts.mjs';

const scene=conditionalDirectScene({calibration:{basis:'declared-demonstration-scale',physicalCalibration:'unverified'},
  modelBounds:{min:[-20,-20,-5],max:[20,20,10]},listenerSession:'a'.repeat(32),contextEpoch:1,
  sourceId:'beacon-0',visibilityAssumption:'unobserved-space-assumed-clear'});
const track=position=>trajectory([{time:0,position,forward:[1,0,0]}]);
const candidate={id:'direct',surfaces:[]};
const radius=10;

test('Finite-emitter radius is explicit, bounded, monotone and C1 with the original far field',()=>{
  for(const d of [0,.1,1,2,5,6,10])assert.equal(spreadingDistance(d,1),Math.max(d,1));
  for(const d of [10,11,20,100])assert.equal(spreadingDistance(d,1,radius),Math.max(d,1));
  assert.equal(1/spreadingDistance(0,1,radius),.15);
  let previous=.15;
  for(let i=1;i<=1000;i++){const pressure=1/spreadingDistance(i/100,1,radius);assert.ok(pressure<=previous+1e-15);previous=pressure;}
  const pressure=d=>1/spreadingDistance(d,1,radius),h=1e-5;
  assert.ok(Math.abs((pressure(10)-pressure(10-h))/h+.01)<1e-6);
  assert.ok(Math.abs((pressure(10+h)-pressure(10))/h+.01)<1e-6);
  assert.ok(Math.abs((pressure(h)-pressure(0))/h)<1e-6);
  for(const radius of [-1,Infinity,NaN,.5,10.001])assert.throws(()=>spreadingDistance(1,1,radius));
});
test('Beacon near-field calibration preserves causal geometry, direction, material spectrum and all far-field gains',()=>{
  for(const distance of [0,.1,.5,1,2,3,6,8,10,12]){
    const listener=track([distance,0,1]),source={track:track([0,0,1]),directivity:.2};
    const original=solvePath(scene,source,listener,1,candidate),calibrated=solvePath(scene,{...source,nearFieldRadius:radius},listener,1,candidate);
    assert.equal(calibrated.status,'renderable');
    for(const key of ['distance','delay','emissionTime','arrivalTime','pan','generation','retardedResidual'])assert.equal(calibrated[key],original[key]);
    assert.deepEqual(calibrated.arrivalDirection,original.arrivalDirection);assert.deepEqual(calibrated.materialBasis,original.materialBasis);
    if(distance>=radius)assert.deepEqual(calibrated.bands,original.bands);
    else {
      const ratio=Math.max(distance,1)/spreadingDistance(distance,1,radius);
      for(let band=0;band<3;band++)assert.ok(Math.abs(calibrated.bands[band]/original.bands[band]-ratio)<1e-14);
      assert.ok(calibrated.bands.every(g=>g<=.15));
    }
  }
});
