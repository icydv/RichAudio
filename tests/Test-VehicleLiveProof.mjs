import test from 'node:test';
import assert from 'node:assert/strict';
import {checkVehicleDoppler,pcmMetrics} from '../tools/Check-VehicleLiveProof.mjs';
import {createVehicleCiEvidence} from '../tools/vehicle-live-evidence.mjs';

test('direct vehicle Doppler oracle accepts physical approach/recession and rejects observed telemetry stepping',()=>{
  const velocity=28,c=343;
  const result=checkVehicleDoppler({minimum:1/(1+velocity/c),maximum:1/(1-velocity/c)},velocity);
  assert.equal(result.passed,true);
  for(const minimum of [.8254062392148799,.8428112682698723])assert.throws(()=>checkVehicleDoppler({minimum,maximum:1.094989510814272},velocity),
    error=>error.vehiclePredicate==='measured-path-rate-within-kinematic-envelope');
});
test('CI proof summary retains bounded numerical failure evidence and excludes arbitrary private fields',()=>{
  const secret='private-path-session-token';
  const report={sourceDigest:'a'.repeat(64),nativeFixtureSha256:'b'.repeat(64),v12:{profile:'v12',vehiclePackets:124,
    path:secret,sourceIds:[secret],provenance:{basis:secret},performance:{statistics:{dspMs:{count:1,p95:.5,path:secret}},
      deviceFreeSink:{lastSubmissionQpcTicks:123,pipe:secret},acousticSettings:{gpuDevice:secret,activeAcceleration:'cpu'}}}};
  const error=new Error(secret);error.actual=secret;error.expected=secret;
  const result=createVehicleCiEvidence(report,{stage:'v12',error}),text=JSON.stringify(result);
  assert.equal(result.status,'failed');assert.equal(result.v12.vehiclePackets,124);assert.equal(result.v12.performance.dspMs.p95,.5);
  assert.equal(text.includes(secret),false);assert.equal(text.includes('Qpc'),false);assert.ok(text.length<65536);
});
test('PCM measurements preserve actual stereo amplitude, signed crossings and nonfinite evidence',()=>{
  const bytes=Buffer.alloc(32);[.25,-.5,-.25,.5,.25,-.5,-.25,.5].forEach((v,i)=>bytes.writeFloatLE(v,i*4));
  const result=pcmMetrics(bytes);assert.equal(result.frames,4);assert.equal(result.peak,.5);
  assert.equal(result.rms,Math.sqrt((.25**2+.5**2)/2));assert.equal(result.zeroCrossings,3);assert.equal(result.stereoDifferenceRms,.75);
  bytes.writeFloatLE(NaN,0);assert.equal(pcmMetrics(bytes).nonfiniteSamples,1);
});
