import test from 'node:test';
import assert from 'node:assert/strict';
import {checkVehicleDoppler,pcmMetrics} from '../tools/Check-VehicleLiveProof.mjs';
import {createVehicleCiEvidence,createVehicleNativeEvidence,readVehicleNativeEvidence,readVehicleProducerEvidence} from '../tools/vehicle-live-evidence.mjs';
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
    const read=t.mock.method(fs,'readFileSync',()=>{throw Object.assign(new Error('private-path-session-token'),{code:'EACCES'});});
    try{assert.equal(readVehicleNativeEvidence(root,{profile:'v12',childExit:1}).files.fixture,'read-failed');}finally{read.mock.restore();}
    const stat=t.mock.method(fs,'statSync',()=>{throw Object.assign(new Error('private-path-session-token'),{code:'EACCES'});});
    try{e=readVehicleNativeEvidence(root,{profile:'v12',childExit:1});}finally{stat.mock.restore();}
    assert.equal(e.files.fixture,'read-failed');assert.equal(e.files.host,'read-failed');
    const text=JSON.stringify(createVehicleCiEvidence({nativeCases:{v12:e}},{stage:'v12',error:new Error('private-path-session-token')}));
    assert.equal(text.includes('private-path-session-token'),false);assert.ok(text.length<65536);
  }finally{fs.rmSync(root,{recursive:true});}
});

test('producer failure evidence retains last block and first eight active timings without control payloads',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-producer-evidence-')),secret='private-source-path-session-position';
  try{const rows=Array.from({length:13},(_,i)=>({type:'block',frame:i*512,synthesisMilliseconds:i+.1,simulationMilliseconds:i+.2,dspMilliseconds:i+.3,
      workerSchedulingMilliseconds:i+.4,completedBlockProcessingMilliseconds:i+.8,pcmCompletionIntervalMilliseconds:i+12,beforeBlockProcessingGapMilliseconds:11.2,processingDeadlineMisses:4,
      vehicle:{active:i>=2&&i<12,sourceCount:8,position:[1,2,3],provenance:secret},activePaths:8,emitting:true,
      acoustic:{qualityTiming:{processingMs:i+.6},qualityDeadlineMisses:3,device:secret},sourceGenerations:{[secret]:1},geometry:{path:secret}}));
    rows.push({type:'final',frames:13*512,cpuSeconds:2,wallSeconds:3,error:secret,statistics:{blocks:13,processingDeadlineMisses:4,
      synthesisMs:{count:13,p95:7,max:15},simulationMs:{count:13,p95:2,max:4},dspMs:{count:13,p95:1,max:2}},private:secret});
    fs.writeFileSync(path.join(root,'renderer-diagnostics.txt'),rows.map(JSON.stringify).join('\n')+'\n');
    const e=readVehicleProducerEvidence(root);assert.equal(e.fileStatus,'read');assert.equal(e.blockCount,13);assert.equal(e.firstActiveBlocks.length,8);
    assert.equal(e.firstActiveBlocks[0].frame,1024);assert.equal(e.firstActiveBlocks[7].frame,4608);assert.equal(e.lastBlock.frame,6144);
    assert.equal(e.firstActiveBlocks[0].completedBlockProcessingMilliseconds,2.8);assert.equal(e.firstActiveBlocks[0].processingDeadlineMisses,4);
    assert.equal(e.firstActiveBlocks[0].pcmCompletionIntervalMilliseconds,14);assert.equal(e.firstActiveBlocks[0].beforeBlockProcessingGapMilliseconds,11.2);
    assert.equal(e.firstActiveBlocks[0].previousBlockProcessingMilliseconds,2.6);assert.equal(e.final.synthesisMs.max,15);assert.equal(e.final.processingDeadlineMisses,4);
    e.firstActiveBlocks[0].injected=secret;e.injected=secret;e.firstActiveBlocks.push(...e.firstActiveBlocks);
    const native=createVehicleNativeEvidence({profile:'v12',childExit:1,producer:e});
    const result=createVehicleCiEvidence({nativeCases:{v12:native}},{stage:'v12',error:new Error(secret)}),text=JSON.stringify(result);
    assert.equal(result.nativeCases.v12.producer.firstActiveBlocks.length,8);assert.equal(text.includes(secret),false);
    assert.equal(result.nativeCases.v12.producer.firstActiveBlocks[0].pcmCompletionIntervalMilliseconds,14);
    assert.equal(result.nativeCases.v12.producer.firstActiveBlocks[0].beforeBlockProcessingGapMilliseconds,11.2);
    for(const key of ['sourceGenerations','geometry','position','provenance'])assert.equal(text.includes(key),false);assert.ok(text.length<65536);
  }finally{fs.rmSync(root,{recursive:true});}
});

test('bounded producer trace scan preserves completed work across oversized and truncated lines',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-partial-producer-'));
  try{assert.equal(readVehicleProducerEvidence(root).fileStatus,'missing');
    fs.writeFileSync(path.join(root,'renderer-diagnostics.txt'),'x'.repeat(262145)+'\n'+JSON.stringify({type:'block',frame:512,vehicle:{active:true},synthesisMilliseconds:3})+'\n{"type":');
    const e=readVehicleProducerEvidence(root);assert.equal(e.fileStatus,'partial');assert.equal(e.oversizedLines,1);assert.equal(e.malformedLines,1);
    assert.equal(e.lastBlock.frame,512);assert.equal(e.firstActiveBlocks[0].synthesisMilliseconds,3);assert.equal(e.final,null);
    const stat=t.mock.method(fs,'statSync',()=>({isFile:()=>true,size:64*1024*1024+1}));
    try{const over=readVehicleProducerEvidence(root);assert.equal(over.fileStatus,'over-limit');assert.equal(over.blockCount,0);assert.equal(over.lastBlock,null);}finally{stat.mock.restore();}
    const denied=t.mock.method(fs,'statSync',()=>{throw Object.assign(new Error('private-path'),{code:'EACCES'});});
    try{assert.equal(readVehicleProducerEvidence(root).fileStatus,'read-failed');}finally{denied.mock.restore();}
  }finally{fs.rmSync(root,{recursive:true});}
});
