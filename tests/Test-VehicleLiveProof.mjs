import test from 'node:test';
import assert from 'node:assert/strict';
import {checkVehicleDoppler,pcmMetrics} from '../tools/Check-VehicleLiveProof.mjs';
import {createVehicleCiEvidence,createVehicleNativeEvidence,readVehicleNativeEvidence} from '../tools/vehicle-live-evidence.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
test('native exit failure retains whitelisted listener ACK/age, host failure stage and transport counters',()=>{
  const secret='private-path-pipe-session-token';
  const native=createVehicleNativeEvidence({profile:'v12',childExit:1,files:{fixture:'read',host:'read'},fixture:{nativeHostExit:0,
    senderStage:'listener-ack',senderErrorKind:'InvalidDataException',senderError:secret,senderJoined:true,
    listenerWire:{firstAck:2,firstAgeAtWriteMs:350,firstEncodeMs:12},vehiclePublisher:{terminalReason:secret}},
    host:{primaryFailure:{stage:'listener-terminal',exceptionType:'IOException',message:secret,stack:secret},secondaryFailures:[],
      transport:{accepted:0,rejected:0,startupDiscarded:1,connections:1},listenerTerminal:{Stage:'connection',Code:'peer-stop',Outcome:'deliberate-stop',FirstFrame:{ObservationTicks:999,ClockFrequency:10000000,DecisionAgeMs:351}},
      vehicle:{first128Receipts:[{session:secret}]},deviceFreeSink:{underflowFrames:0}}});
  const result=createVehicleCiEvidence({nativeCases:{v12:native}},{stage:'v12',error:new Error(secret)}),text=JSON.stringify(result);
  assert.equal(result.nativeCases.v12.childExit,1);assert.equal(result.nativeCases.v12.fixture.listenerWire.firstAck,2);
  assert.equal(result.nativeCases.v12.fixture.listenerWire.firstAgeAtWriteMs,350);assert.equal(result.nativeCases.v12.host.listener.startupDiscarded,1);
  assert.equal(result.nativeCases.v12.host.stage,'listener-terminal');assert.equal(text.includes(secret),false);assert.equal(text.includes('ObservationTicks'),false);
  native.host.secondaryFailureCount=1000000000;
  assert.equal(createVehicleCiEvidence({nativeCases:{v12:native}}).nativeCases.v12.host.secondaryFailureCount,1000000000);
});
test('missing, malformed and over-limit native diagnostics produce bounded failure records',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-native-evidence-'));
  try{let e=readVehicleNativeEvidence(root,{profile:'v12',childExit:1});assert.equal(e.files.fixture,'missing');assert.equal(e.files.host,'missing');
    fs.writeFileSync(path.join(root,'fixture.json'),'{');fs.writeFileSync(path.join(root,'host-result.json'),'x'.repeat(262145));
    e=readVehicleNativeEvidence(root,{profile:'v12',childExit:1});assert.equal(e.files.fixture,'malformed');assert.equal(e.files.host,'over-limit');
    assert.ok(JSON.stringify(createVehicleCiEvidence({nativeCases:{v12:e}},{stage:'v12',error:new Error('failed')})).length<65536);
  }finally{fs.rmSync(root,{recursive:true});}
});

test('partial native evidence preserves available diagnostics and read failures remain bounded',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-partial-evidence-'));
  try{fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify({nativeHostExit:1,senderStage:'listener-publish',senderErrorKind:'TimeoutException',senderError:'private-path-session-token'}));
    let e=readVehicleNativeEvidence(root,{profile:'v12',childExit:1});
    assert.equal(e.files.fixture,'read');assert.equal(e.files.host,'missing');assert.equal(e.fixture.senderErrorKind,'TimeoutException');
    assert.equal(e.host.stage,null);assert.equal(e.host.receivedBlocks,null);
    const stat=t.mock.method(fs,'statSync',()=>{throw Object.assign(new Error('private-path-session-token'),{code:'EACCES'});});
    try{e=readVehicleNativeEvidence(root,{profile:'v12',childExit:1});}finally{stat.mock.restore();}
    assert.equal(e.files.fixture,'read-failed');assert.equal(e.files.host,'read-failed');
    const text=JSON.stringify(createVehicleCiEvidence({nativeCases:{v12:e}},{stage:'v12',error:new Error('private-path-session-token')}));
    assert.equal(text.includes('private-path-session-token'),false);assert.ok(text.length<65536);
  }finally{fs.rmSync(root,{recursive:true});}
});
