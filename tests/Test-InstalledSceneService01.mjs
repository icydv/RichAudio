import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';import {performance} from 'node:perf_hooks';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {registerPreparedSoundMapGeometry01} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
const session='e'.repeat(32),request=(generation=1)=>({listener:[0,0,1],sources:[[-1,0,1]],generation,geometryTimeMs:100,durationMs:1000,engine:{order:2}});
const epoch='2026-11-05T13:54:25.2639009Z';
async function until(predicate,timeout=4000){const began=performance.now();while(!predicate()){if(performance.now()-began>timeout)throw Error('Scene service fixture timeout');await delay(10);}}

function denseExterior(){
 const vertices=[],polygons=[];
 for(let x=0;x<32;x++)for(let z=0;z<17;z++){
  const index=vertices.length,left=x*.2,bottom=z*.2;
  vertices.push([left,2,bottom],[left+.19,2,bottom],[left,2,bottom+.19]);
  polygons.push({family:'Triangle',indices:[index,index+1,index+2],materialSlot:0});
 }
 return originalInstalledCache01({mesh:{vertices,polygons}});
}
const denseWindow=generation=>({...request(generation),adaptiveRadius:false,radius:12,maximumSurfaces:1024,
 engine:{order:2,installedReflectionTrains:true},prepareSoundMapGeometry01:false});
test('dense exterior hydration discards superseded generations and joins cleanly on STOP',async()=>{
 const f=denseExterior(),delivered=[],interrupted=[];
 const config={manifestPath:f.manifestPath,catalogPath:f.catalogPath,catalogSHA256:f.catalogSHA256};
 const service=new InstalledSceneService01({config,session,onScene:(scene,receipt)=>delivered.push({scene,receipt})});
 try{
  await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  // The listener runs after the service has accepted the original worker
  // message and scheduled its first slice. Intervene before the next slice.
  service.worker.on('message',message=>{
   if(!message.preparedScene?.packedFaces)return;
   const generation=message.preparedScene.metadata.generation;
   if(generation===1)setImmediate(()=>{interrupted.push(1);service.updateWindow(denseWindow(2));});
   if(generation===3)setImmediate(()=>{interrupted.push(3);service.beginStop01(performance.now(),'authored-stop-during-hydration');});
  });
  service.updateWindow(denseWindow(1));
  await until(()=>delivered.length||service.failed);
  assert.equal(service.failed,false,service.failure);
  assert.deepEqual(delivered.map(e=>e.receipt.generation),[2]);
  assert.ok(delivered[0].receipt.lifecycle01.surfaceUnpack.chunks>1);
  service.updateWindow(denseWindow(3));
  await until(()=>interrupted.length===2&&!service.active||service.failed);
  assert.equal(service.failed,false,service.failure);
  assert.deepEqual(delivered.map(e=>e.receipt.generation),[2]);
  assert.equal(service.stats.generationDiscards,1);
  assert.equal((await service.close()).workerJoined,true);
 }finally{await service.close();f.close();}
});

test('source epoch, original deadline and close are checked during packed publication',async()=>{
 const f=denseExterior(),config={manifestPath:f.manifestPath,catalogPath:f.catalogPath,catalogSHA256:f.catalogSHA256};
 try{
  for(const change of ['epoch','expiry','close']){
   let delivered=0,closing,interrupted=false;
   const service=new InstalledSceneService01({config,session,onScene:()=>delivered++});
   try{
    await until(()=>service.ready||service.failed);
    service.worker.on('message',message=>{
     if(!message.preparedScene?.packedFaces)return;
     setImmediate(()=>{
      interrupted=true;
      if(change==='close')closing=service.close();
      // Inject original-ticket invalidations precisely between slice turns.
      else if(change==='epoch')service.validationEpochUtc01=epoch;
      else service.active.expiresAt=performance.now();
     });
    });
    service.updateWindow(denseWindow(1));
    await until(()=>interrupted&&!service.active||service.failed);
    assert.equal(service.failed,false,service.failure);
    assert.equal(delivered,0);
    if(change==='epoch')assert.equal(service.stats.generationDiscards,1);
    if(change==='expiry')assert.equal(service.stats.expiredBeforeAdoption,1);
    assert.equal((await (closing??service.close())).workerJoined,true);
   }finally{await service.close();}
  }
 }finally{f.close();}
});

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
  const changed=f.publish(2,{validationEpochUtc01:epoch});service.updateWindow(request());await until(()=>service.catalogBinding===changed.catalogSHA256&&service.ready||service.failed);if(scenes.length<2)service.updateWindow(request());await until(()=>scenes.length>=2||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(scenes[1].binding.catalogSHA256,changed.catalogSHA256);assert.ok(scenes[1].binding.bindingEpoch>scenes[0].binding.bindingEpoch);assert.equal(service.stats.workersStarted,1);
 }finally{await service.close();f.close();}
});

test('normal cache rows require the current archive proof and a supervisor epoch cannot change within a session',async()=>{
 const f=installedSceneFixture01({write:false}),scenes=[];f.publish(1,{validationEpochUtc01:epoch,rowEpochUtc01:'2026-11-04T13:54:25.2639009Z'});
 const service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},session,onScene:scene=>scenes.push(scene)});
 try{
  await delay(50);assert.equal(service.ready,false,'existing files supply no current validation authority');assert.equal(service.bindPreparationEpoch01(epoch),true);await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  service.updateWindow(request());await until(()=>scenes.length===1||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(installedStaticSceneMetadata01(scenes[0]).activeSurfaces,0,'stale row is an unknown gap');
  const reads=service.snapshot().cacheTimings.manifestLoads;f.publish(1,{validationEpochUtc01:epoch});service.updateWindow(request());await until(()=>service.snapshot().cacheTimings.manifestLoads>reads&&service.ready&&!service.snapshot().cacheTimings.metadataPreparing01||service.failed);if(scenes.length<2)service.updateWindow(request());await until(()=>scenes.length>=2||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(installedStaticSceneMetadata01(scenes[1]).activeSurfaces,2);
  assert.equal(service.bindPreparationEpoch01('2026-11-05T13:54:26.2639009Z'),false);assert.equal(service.failed,true);assert.match(service.failure,/changed-normal-preparation-epoch/);
 }finally{await service.close();f.close();}
});

test('metadata preparation retains one pending observation without retimestamping its lease',async()=>{
 const f=installedSceneFixture01(),scenes=[],service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},session,onScene:(scene,binding)=>scenes.push({scene,binding})});
 try{f.publish(1,{validationEpochUtc01:epoch});service.bindPreparationEpoch01(epoch);await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);
  f.publish(2,{validationEpochUtc01:epoch});const original=service.updateWindow(request());await until(()=>scenes.length||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(service.stats.cacheNotReadyResults,1);assert.equal(scenes.length,1);assert.ok(scenes[0].binding.requestId>original.requestId);assert.equal(scenes[0].binding.requestedAt,original.requestedAt);assert.equal(scenes[0].binding.expiresAt,original.expiresAt);assert.equal(scenes[0].scene.tile.createdAt,100);assert.equal(service.stats.pendingExpired,0);
 }finally{assert.equal((await service.close()).workerJoined,true);f.close();}
});

test('wrong game binding fails explicitly without worker restart',async()=>{
 const f=installedSceneFixture01(),statuses=[];const service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:'f'.repeat(64)},session,onStatus:s=>statuses.push(s)});
 try{assert.equal(service.bindPreparationEpoch01(epoch),true);await until(()=>service.failed);assert.match(service.failure,/game\/catalogue identity/);assert.equal(service.stats.publications,0);assert.equal(service.stats.workersStarted,1);assert.equal(statuses.at(-1).stage,'failed');assert.equal((await service.close()).workerJoined,true);}
 finally{await service.close();f.close();}
});

test('an explicitly pinned catalogue never silently adopts a changed map binding',async()=>{
 const f=installedSceneFixture01(),first=f.config,service=new InstalledSceneService01({config:first,session});
 try{await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);f.publish(2);service.updateWindow(request());await until(()=>service.failed);assert.match(service.failure,/game\/catalogue identity/);assert.equal(service.stats.publications,0);assert.equal(service.stats.workersStarted,1);}
 finally{await service.close();f.close();}
});
