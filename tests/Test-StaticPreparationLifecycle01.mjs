// Negative lifecycle checks use real authored geometry work, never a timing
// delay inserted in the worker. These are not performance qualification runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createCachePressure01,cachePressurePose01} from './fixtures/CachePressure01.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
const session='b'.repeat(32);
async function until(predicate){const start=performance.now();while(!predicate()){if(performance.now()-start>8000)throw Error('Static preparation lifecycle timeout');await delay(5);}}
const observation=(generation=1,durationMs=1000)=>({...cachePressurePose01(0),generation,geometryTimeMs:performance.now(),durationMs,radius:32,maximumSurfaces:4096,engine:{order:2}});
const takeReceiver=service=>{const receive=service.worker.listeners('message').at(-1);service.worker.removeListener('message',receive);return receive;};

test('expired static preparation retains reusable geometry but only a separate fresh observation publishes; cancellation and restart stay isolated',async()=>{
 const scratch=path.resolve('.local/street01-cache-pressure01/lifecycle-original'),root=path.join(scratch,randomUUID()),fixture=createCachePressure01(root),published=[];
 let service,second,coldTimer,restartTimer,error=null,passed=false;
 try{
  service=new InstalledSceneService01({config:{...fixture,privateRoot:root},session,onScene:(scene,receipt)=>published.push({scene,receipt})});
  await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  const receive=takeReceiver(service);let prepared;
  service.worker.on('message',message=>{if(message.type==='static-prepared'&&!prepared)prepared=message;else receive(message);});
  // Leave room for real dispatch jitter before this deliberately short
  // negative lease. Independent observations also preserve a legitimate
  // before-work expiry instead of assuming every first request starts work.
  const coldObservations=new Map(),updateCold=()=>{if(!service.failed&&!service.closed){const request=service.updateWindow(observation(1,100));coldObservations.set(request.requestId,request);}};updateCold();coldTimer=setInterval(updateCold,200);
  await until(()=>prepared||service.failed);clearInterval(coldTimer);assert.equal(service.failed,false,service.failure);const expired=coldObservations.get(prepared.requestId);assert(expired,'prepared work belongs to an actual original observation');
  assert.equal(prepared.workerProfile01.expiryPhase,'static-preparation');assert(prepared.workerProfile01.staticPreparationMilliseconds>0);assert.equal(prepared.workerProfile01.windowMilliseconds,0);assert.equal(prepared.workerProfile01.staticWorksetHeavyWork,true);assert.equal(published.length,0);
  const fresh=service.updateWindow(observation(2));receive(prepared);
  assert.equal(service.stats.staticPreparationExpiredObservations,1);assert.equal(published.length,0);
  const old=service.snapshot().sceneDeliveryDiagnostics01.recent.find(x=>x.requestId===expired.requestId);assert.equal(old.outcome,'static-prepared-observation-expired');assert.equal(old.supersededPreparation,true);assert.equal(old.requestedAt,expired.requestedAt);assert.equal(old.expiresAt,expired.expiresAt);
  await until(()=>published.length===1||service.failed);assert.equal(service.failed,false,service.failure);
  const accepted=published[0];assert.equal(accepted.scene.tile.surfaces.length,781);assert.equal(accepted.receipt.requestId,fresh.requestId);assert.equal(accepted.receipt.requestedAt,fresh.requestedAt);assert.equal(accepted.receipt.expiresAt,fresh.expiresAt);assert.equal(accepted.receipt.generation,2);assert(accepted.receipt.admittedAt<fresh.expiresAt);
  const diagnostic=service.snapshot().sceneDeliveryDiagnostics01.recent.at(-1);assert.equal(diagnostic.workerProfile01.staticPreparation.operations01.chunkDecodeCalls,0);assert.equal(diagnostic.workerProfile01.staticPreparation.operations01.analyticTessellationCalls,0);
  const closed=await service.close();assert.equal(closed.workerJoined,true);receive(prepared);assert.equal(published.length,1);assert.equal(service.stats.workersStarted,1);
  const restarted=[];second=new InstalledSceneService01({config:{...fixture,privateRoot:root},session,onScene:(scene,receipt)=>restarted.push({scene,receipt})});
  // A cold restart can legitimately finish after its first observation expires.
  // Supply independent fresh observations, as gameplay does, without retrying
  // or renewing any old request. The one worker and original leases remain.
  const updateRestart=()=>{if(!second.failed&&!second.closed)second.updateWindow(observation(3));};updateRestart();restartTimer=setInterval(updateRestart,200);
  await until(()=>restarted.length||second.failed);clearInterval(restartTimer);assert.equal(second.failed,false,second.failure);assert.notEqual(second.worker,service.worker);assert.equal(restarted[0].receipt.generation,3);assert.equal(restarted[0].scene.tile.surfaces.length,781);assert.equal(second.stats.workersStarted,1);
  const restartProfiles=second.snapshot().sceneDeliveryDiagnostics01.recent.map(x=>x.workerProfile01).filter(Boolean);assert(restartProfiles.some(x=>x.staticPreparation?.operations01.chunkDecodeCalls>0),'new worker cannot inherit private component buffers, even if its cold observation expires');passed=true;
 }catch(e){error=String(e?.stack??e);throw e;}finally{
  clearInterval(coldTimer);clearInterval(restartTimer);const secondClosure=await second?.close(),firstClosure=await service?.close(),diagnostics=path.join(path.dirname(scratch),'ci-lifecycle-'+randomUUID());fs.mkdirSync(diagnostics,{recursive:true});
  fs.writeFileSync(path.join(diagnostics,'result.json'),JSON.stringify({schema:1,kind:'OriginalStaticPreparationLifecycle01',passed:passed&&firstClosure?.workerJoined===true&&secondClosure?.workerJoined===true,error,originalAuthoredDataOnly:true,first:service?.snapshot(),restart:second?.snapshot(),firstClosure,secondClosure},null,2),{flag:'wx'});
  if(second)assert.equal(secondClosure.workerJoined,true);if(service)assert.equal(firstClosure.workerJoined,true);assert(root.startsWith(scratch+path.sep));fs.rmSync(root,{recursive:true,force:true});
 }
});

test('a geometry-bearing cache diagnostic fails closed before publication',async()=>{
 const {installedSceneFixture01}=await import('./fixtures/InstalledSceneService01.mjs'),fixture=installedSceneFixture01();const scenes=[],service=new InstalledSceneService01({config:fixture.config,session,onScene:scene=>scenes.push(scene)});
 try{await until(()=>service.ready||service.failed);const receive=takeReceiver(service);service.worker.on('message',message=>{if(message.type==='scene')message.cacheResidency01={schema:1,historyLimit:128,events:[{sequence:1,positions:[1,2,3]}]};receive(message);});service.updateWindow({listener:[0,0,1],sources:[[-1,0,1]],generation:1,geometryTimeMs:performance.now(),durationMs:1000});await until(()=>service.failed);assert.match(service.failure,/metadata-only cache diagnostic/);assert.equal(scenes.length,0);assert.equal(service.stats.publications,0);}finally{assert.equal((await service.close()).workerJoined,true);fixture.close();}
});
