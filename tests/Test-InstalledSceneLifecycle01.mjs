import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';

const session='9'.repeat(32);
const observation=(generation=1,geometryTimeMs=100)=>({listener:[0,0,1],sources:[[-1,0,1]],generation,geometryTimeMs,durationMs:1000,engine:{order:2}});
async function until(predicate,timeout=4000){const began=performance.now();while(!predicate()){if(performance.now()-began>timeout)throw Error('Installed lifecycle fixture timeout');await delay(5);}}
const receive01=service=>{const receive=service.worker.listeners('message').at(-1);service.worker.removeListener('message',receive);return receive;};
const spin01=ms=>{const until=performance.now()+ms;while(performance.now()<until){/* Deliberately account for a transport/adoption stall. */}};

test('owned worker lifecycle measurements share a verified clock and retain only the latest bounded observations',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  const observations=[];for(let n=0;n<100;n++)observations.push(service.updateWindow({...observation(),listener:[n/1000,0,1]}));
  await until(()=>bindings.length===1||service.failed);assert.equal(service.failed,false,service.failure);
  await until(()=>service.stats.maximumPostMessageMs>0);
  const snapshot=service.snapshot(),history=snapshot.sceneDeliveryDiagnostics01,record=history.recent.at(-1),binding=bindings[0],profile=record.workerProfile01;
  assert.equal(history.historyLimit,64);assert.equal(history.recent.length,64);assert.equal(history.recent[0].requestId,37);assert.equal(service.stats.coalesced,99);assert.equal(service.stats.dispatched,1);
  assert.ok(history.recent.slice(0,-1).every(x=>x.outcome==='coalesced-before-dispatch'));assert.equal(record.outcome,'published');assert.equal(record.requestId,100);
  assert.deepEqual(binding.clock01,{kind:'node-process-performance',processId:process.pid,timeOrigin:performance.timeOrigin,verified:true});assert.equal(history.clock.verified,true);
  assert.equal(record.requestedAt,observations.at(-1).requestedAt);assert.equal(record.expiresAt,record.requestedAt+1000);assert.equal(binding.lifecycle01.requestedAt,record.requestedAt);
  assert.ok(record.requestedAt<=record.dispatchedAt&&record.dispatchedAt<=profile.startedAt&&profile.startedAt<=profile.finishedAt&&profile.finishedAt<=record.receivedAt&&record.receivedAt<=record.admittedAt&&record.admittedAt<record.expiresAt);
  assert.equal(record.requestWaitMilliseconds,record.dispatchedAt-record.requestedAt);assert.equal(record.dispatchToWorkerMilliseconds,profile.startedAt-record.dispatchedAt);assert.equal(record.workerPreparationMilliseconds,profile.finishedAt-profile.startedAt);
  for(const field of ['refreshMilliseconds','windowMilliseconds','encodeMilliseconds','transferPreparationMilliseconds','soundMapPreparationMilliseconds','statusMilliseconds'])assert.ok(Number.isFinite(profile[field])&&profile[field]>=0,field);
  assert.equal(profile.activeSurfaces,2);assert.equal(profile.qualifiedResourceCount,1);assert.ok(record.postMessageMilliseconds>0);assert.ok(record.workerTransportMilliseconds>=0);
  assert.ok(service.stats.firstReadyAt01<=profile.startedAt);assert.equal(service.stats.firstInternalNonemptyAt01,profile.windowCompletedAt);assert.equal(service.stats.firstPublishedNonemptyAt01,record.admittedAt);assert.equal(service.stats.pcmQueueFramesAdded,0);
 }finally{assert.equal((await service.close()).workerJoined,true);f.close();}
});

test('an observation that expires before worker work stays expired and only a distinct fresh observation publishes',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  const post=service.worker.postMessage.bind(service.worker);let stall=true;service.worker.postMessage=(message,...args)=>{if(message.type==='window'&&stall){stall=false;spin01(30);}return post(message,...args);};
  const original=service.updateWindow({...observation(),durationMs:10});await until(()=>service.stats.workerExpiredResults===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(bindings.length,0);
  const expired=service.snapshot().sceneDeliveryDiagnostics01.recent.at(-1);assert.equal(expired.requestedAt,original.requestedAt);assert.equal(expired.expiresAt,original.expiresAt);assert.equal(expired.outcome,'expired-in-worker');assert.equal(expired.workerProfile01.expiryPhase,'before-refresh');assert.equal(expired.workerProfile01.windowMilliseconds,0);assert.equal(service.stats.expiredBeforeAdoption,1);
  const fresh=service.updateWindow(observation(1,200));await until(()=>bindings.length===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(bindings[0].requestId,fresh.requestId);assert.notEqual(bindings[0].requestId,original.requestId);assert.equal(bindings[0].geometryTimeMs,200);assert.equal(bindings[0].requestedAt,fresh.requestedAt);assert.ok(bindings[0].admittedAt<fresh.expiresAt);assert.equal(service.stats.workersStarted,1);
 }finally{assert.equal((await service.close()).workerJoined,true);f.close();}
});

test('expiry during real main-thread adoption retains the rejection and its validation cost',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  await until(()=>service.ready||service.failed);let expiry;const adopt=service.adopter.adopt.bind(service.adopter);service.adopter.adopt=(message,expected)=>{const scene=adopt(message,expected);spin01(Math.max(0,expiry-performance.now())+10);return scene;};
  expiry=service.updateWindow(observation()).expiresAt;await until(()=>service.stats.staleResults===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(bindings.length,0);assert.equal(service.stats.expiredDuringAdoption,1);
  const record=service.snapshot().sceneDeliveryDiagnostics01.recent.at(-1);assert.equal(record.outcome,'expired-during-adoption');assert.ok(record.validationMilliseconds>0);assert.ok(record.workerPreparationMilliseconds>0);assert.ok(record.admittedAt>=record.expiresAt);assert.ok(service.stats.maximumWorkerPreparationMs>=record.workerPreparationMilliseconds);assert.equal(service.stats.firstPublishedNonemptyAt01,null);
 }finally{assert.equal((await service.close()).workerJoined,true);f.close();}
});

test('a superseded generation retains real worker costs and cannot be relabelled as the fresh generation',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  await until(()=>service.ready||service.failed);const receive=receive01(service);let held;service.worker.on('message',message=>{if(message.type==='scene'&&!held)held=message;else receive(message);});
  const original=service.updateWindow(observation());await until(()=>held||service.failed);assert.equal(service.failed,false,service.failure);
  const fresh=service.updateWindow(observation(2,200));receive(held);assert.equal(bindings.length,0);assert.equal(service.stats.generationDiscards,1);
  const discarded=service.snapshot().sceneDeliveryDiagnostics01.recent.find(x=>x.requestId===original.requestId);assert.equal(discarded.outcome,'generation-discarded');assert.equal(discarded.generation,1);assert.equal(discarded.geometryTimeMs,100);assert.equal(discarded.requestedAt,original.requestedAt);assert.equal(discarded.expiresAt,original.expiresAt);assert.ok(discarded.workerPreparationMilliseconds>0);assert.ok(service.stats.maximumWorkerPreparationMs>=discarded.workerPreparationMilliseconds);
  await until(()=>bindings.length===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(bindings[0].requestId,fresh.requestId);assert.equal(bindings[0].generation,2);assert.equal(bindings[0].geometryTimeMs,200);assert.equal(service.stats.workersStarted,1);
 }finally{assert.equal((await service.close()).workerJoined,true);f.close();}
});

test('a mismatched worker clock fails closed before an otherwise valid scene can publish',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  await until(()=>service.ready||service.failed);const receive=receive01(service);service.worker.on('message',message=>{if(message.type==='scene')message.clock01={...message.clock01,timeOrigin:message.clock01.timeOrigin+1};receive(message);});
  service.updateWindow(observation());await until(()=>service.failed);assert.match(service.failure,/verified shared installed worker performance clock/);assert.equal(bindings.length,0);assert.equal(service.stats.workersStarted,1);assert.equal(service.stats.publications,0);
  const closed=await service.close();assert.equal(closed.workerJoined,true);assert.equal(closed.controlClosureUnknown,false);
 }finally{await service.close();f.close();}
});

test('cancellation rejects a late owned-channel result and a fresh service never reuses the closed worker',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});let second;
 try{
  await until(()=>service.ready||service.failed);const receive=receive01(service);let held;
  service.worker.on('message',message=>{if(message.type==='scene')held=message;else receive(message);});service.updateWindow(observation());await until(()=>held||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(bindings.length,0);
  const closed=await service.close();assert.equal(closed.workerJoined,true);assert.equal(service.snapshot().sceneDeliveryDiagnostics01.recent.at(-1).outcome,'cancelled');receive(held);assert.equal(bindings.length,0);assert.equal(service.stats.publications,0);assert.equal(service.stats.workersStarted,1);assert.equal(service.stats.workersJoined,1);
  const accepted=[];second=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>accepted.push(binding)});second.updateWindow(observation(2,200));await until(()=>accepted.length===1||second.failed);assert.equal(second.failed,false,second.failure);assert.notEqual(second.worker,service.worker);assert.equal(accepted[0].generation,2);assert.equal(accepted[0].geometryTimeMs,200);assert.equal(second.stats.workersStarted,1);assert.equal(second.stats.publications,1);
 }finally{if(second)assert.equal((await second.close()).workerJoined,true);await service.close();f.close();}
});

test('unexpected owned worker closure fails pending work without an automatic replacement or retry',async()=>{
 const f=installedSceneFixture01(),bindings=[],service=new InstalledSceneService01({config:f.config,session,onScene:(_scene,binding)=>bindings.push(binding)});
 try{
  service.updateWindow(observation());await service.worker.terminate();await until(()=>service.failed);assert.equal(service.failure,'worker-exited-without-close');assert.equal(bindings.length,0);assert.equal(service.stats.workersStarted,1);assert.equal(service.stats.workersJoined,1);assert.equal(service.stats.dispatched,0);assert.equal(service.snapshot().sceneDeliveryDiagnostics01.recent.at(-1).outcome,'failed');assert.throws(()=>service.updateWindow(observation()),/active installed scene/);
  const closed=await service.close();assert.equal(closed.workerJoined,true);assert.equal(closed.controlClosureUnknown,false);assert.equal(service.stats.workersStarted,1);
 }finally{await service.close();f.close();}
});
