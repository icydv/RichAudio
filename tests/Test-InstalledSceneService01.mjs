import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';import {performance} from 'node:perf_hooks';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {registerPreparedSoundMapGeometry01} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
const session='e'.repeat(32),request=(generation=1)=>({listener:[0,0,1],sources:[[-1,0,1]],generation,geometryTimeMs:100,durationMs:1000,engine:{order:2}});
const epoch='2026-11-05T13:54:25.2639009Z';
async function until(predicate,timeout=4000){const began=performance.now();while(!predicate()){if(performance.now()-began>timeout)throw Error('Scene service fixture timeout');await delay(10);}}

test('real persistent worker reads original cache, coalesces windows, rate limits and joins without archive decode',async()=>{
 const f=installedSceneFixture01(),scenes=[],statuses=[];const service=new InstalledSceneService01({config:f.config,session,onScene:(scene,binding)=>{const registration=registerPreparedSoundMapGeometry01(scene,binding.preparedSoundMapGeometry,{requestId:binding.requestId,bindingEpoch:binding.bindingEpoch,packetDigest:binding.packetDigest,catalogSHA256:binding.catalogSHA256});scenes.push({scene,binding,registration});},onStatus:s=>statuses.push(s)});
 try{
  for(let n=0;n<30;n++)service.updateWindow({...request(),listener:[n/100,0,1]});
  await until(()=>scenes.length===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(service.stats.coalesced,29);assert.equal(service.stats.dispatched,1);assert.equal(service.stats.workersStarted,1);
  assert.equal(scenes[0].scene.tile.listenerAnchor[0],.29);assert.equal(installedStaticSceneMetadata01(scenes[0].scene).activeSurfaces,2);assert.ok(scenes[0].binding.admissionMs<1000);assert.equal(scenes[0].binding.catalogSHA256,f.config.catalogSHA256);
  assert.equal(scenes[0].registration.registered,true);assert.equal(scenes[0].binding.preparedSoundMapGeometry.surfaceCount,2);assert.ok(scenes[0].binding.workerPreparationMilliseconds>0);
  assert.equal(statuses[0].stage,'preparing/indexing');assert.equal(statuses.at(-1).installedWorldVerified,false);assert.equal(statuses.at(-1).runtimeActivationVerified,false);
  service.updateWindow(request());await until(()=>scenes.length===2||service.failed);assert.equal(service.failed,false,service.failure);assert.ok(service.stats.minimumDispatchIntervalMs>=500);
  const closed=await service.close();assert.equal(closed.workerJoined,true);assert.equal(closed.archiveDecode,false);assert.equal(service.stats.workersJoined,1);assert.throws(()=>service.updateWindow(request()),/active installed scene/);
 }finally{await service.close();f.close();}
});

test('expired in-flight result and newer listener generation are rejected before publication',async()=>{
 const f=installedSceneFixture01(),scenes=[];const service=new InstalledSceneService01({config:f.config,session,onScene:(scene,binding)=>scenes.push(binding)});
 try{
  await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  const receive=service.worker.listeners('message').at(-1);service.worker.removeListener('message',receive);let gate='stale';
  service.worker.on('message',message=>{
   if(message.type==='scene'&&gate==='stale'){gate='generation';setTimeout(()=>receive(message),80);}
   else if(message.type==='scene'&&gate==='generation'){gate='done';service.updateWindow(request(2));receive(message);}
   else receive(message);
  });
  service.updateWindow({...request(),durationMs:40});await until(()=>service.stats.staleResults===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(scenes.length,0);
  service.updateWindow(request());await until(()=>service.stats.generationDiscards===1||service.failed);await until(()=>scenes.length===1||service.failed);
  assert.equal(service.failed,false,service.failure);assert.equal(scenes[0].generation,2);assert.equal(service.stats.workersStarted,1);
 }finally{await service.close();f.close();}
});

test('normal first launch waits for known cache paths then follows changed catalogue with bound game identity',async()=>{
 const f=installedSceneFixture01({write:false}),scenes=[],statuses=[];const service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},session,onScene:(scene,binding)=>scenes.push({scene,binding}),onStatus:s=>statuses.push(s)});
 try{
  await until(()=>statuses.some(s=>s.worker.workerExited===false&&s.worker.state==='preparing/indexing'&&s.worker.ready===false));await delay(50);assert.equal(service.failed,false,service.failure);
  f.publish();await delay(100);assert.equal(service.ready,false);assert.equal(service.bindPreparationEpoch01('invented'),false);assert.equal(service.bindPreparationEpoch01(epoch),true);await delay(100);assert.equal(service.ready,false,'historical manifest cannot precede current archive validation');
  const first=f.publish(1,{validationEpochUtc01:epoch});await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);service.updateWindow(request());await until(()=>scenes.length===1||service.failed);
  assert.equal(scenes[0].binding.catalogSHA256,first.catalogSHA256);
  const changed=f.publish(2,{validationEpochUtc01:epoch});service.updateWindow(request());await until(()=>scenes.length===2||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(scenes[1].binding.catalogSHA256,changed.catalogSHA256);assert.ok(scenes[1].binding.bindingEpoch>scenes[0].binding.bindingEpoch);assert.equal(service.stats.workersStarted,1);
 }finally{await service.close();f.close();}
});

test('normal cache rows require the current archive proof and a supervisor epoch cannot change within a session',async()=>{
 const f=installedSceneFixture01({write:false}),scenes=[];f.publish(1,{validationEpochUtc01:epoch,rowEpochUtc01:'2026-11-04T13:54:25.2639009Z'});
 const service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},session,onScene:scene=>scenes.push(scene)});
 try{
  await delay(50);assert.equal(service.ready,false,'existing files supply no current validation authority');assert.equal(service.bindPreparationEpoch01(epoch),true);await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  service.updateWindow(request());await until(()=>scenes.length===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(installedStaticSceneMetadata01(scenes[0]).activeSurfaces,0,'stale row is an unknown gap');
  f.publish(1,{validationEpochUtc01:epoch});service.updateWindow(request());await until(()=>scenes.length===2||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(installedStaticSceneMetadata01(scenes[1]).activeSurfaces,2);
  assert.equal(service.bindPreparationEpoch01('2026-11-05T13:54:26.2639009Z'),false);assert.equal(service.failed,true);assert.match(service.failure,/changed-normal-preparation-epoch/);
 }finally{await service.close();f.close();}
});

test('wrong game binding fails explicitly without worker restart',async()=>{
 const f=installedSceneFixture01(),statuses=[];const service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:'f'.repeat(64)},session,onStatus:s=>statuses.push(s)});
 try{await until(()=>service.failed);assert.match(service.failure,/game\/catalogue identity/);assert.equal(service.stats.publications,0);assert.equal(service.stats.workersStarted,1);assert.equal(statuses.at(-1).stage,'failed');assert.equal((await service.close()).workerJoined,true);}
 finally{await service.close();f.close();}
});

test('an explicitly pinned catalogue never silently adopts a changed map binding',async()=>{
 const f=installedSceneFixture01(),first=f.config,service=new InstalledSceneService01({config:first,session});
 try{await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);f.publish(2);service.updateWindow(request());await until(()=>service.failed);assert.match(service.failure,/game\/catalogue identity/);assert.equal(service.stats.publications,0);assert.equal(service.stats.workersStarted,1);}
 finally{await service.close();f.close();}
});
