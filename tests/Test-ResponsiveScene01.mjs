import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createResponsiveScene01,responsivePose01,responsiveEpoch01} from './fixtures/ResponsiveScene01.mjs';
import {InstalledStaticWorld01,installedStaticSceneMetadata01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
import {budgetSession042 as session} from './fixtures/AcousticBudget042.mjs';
import {exportCollision} from '../src/acoustics/world/convert-collision.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function authoredFixture(){const parent=path.resolve('.local/street01-responsive-controls');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'original-'));return createResponsiveScene01(root);}
function config(f,extra={}){return {...f,privateRoot:f.root,requiredValidationEpochUtc01:responsiveEpoch01,maximumResidentResources:4,...extra};}
function request(sequence=0){const p=responsivePose01(sequence);return {...p,session,geometryTimeMs:performance.now(),durationMs:1000,radius:32,maximumSurfaces:4096};}
function writeManifest(f,manifest){fs.writeFileSync(f.manifestPath,JSON.stringify(manifest));}
function validationReceipt(f,value){fs.writeFileSync(path.join(f.root,'validation.json'),JSON.stringify({schema:1,kind:'EntirelyOriginalResponsiveSceneValidation01',resources:f.resources,nearbyFiniteSurfaces:781,installedDataRead:false,pcmRendered:false,...value},null,2),{flag:'wx'});}

test('original 10663-resource world preserves finite geometry through warm reuse, proof changes, changed source and corruption',{timeout:20000},async t=>{
 const f=authoredFixture(),original=fs.readFileSync(f.manifestPath),manifest=JSON.parse(original),world=new InstalledStaticWorld01(config(f));
 let passed=false;t.after(()=>validationReceipt(f,{case:'geometry-source-proof-corruption-eviction',passed,world:world.profile01(),controls:['warm-reuse','proof-revocation','same-length-chunk-corruption','source-revision','receipt-mismatch','neighbor-return-identity','epoch-mismatch','catalogue-mismatch','resident-eviction']}));
 try{
  const first=world.window(request()),second=world.window(request(1));assert.equal(first.tile.surfaces.length,781);assert.equal(second.tile.surfaces.length,781);assert.equal(installedStaticSceneMetadata01(second).successfulResources,3);assert.ok(world.profile01().queryViewHits>=3);
  const packet=encodeInstalledStaticScene01(second),expected={catalogSHA256:f.catalogSHA256,session,generation:second.tile.version,geometryTimeMs:second.tile.createdAt,durationMs:1000},transferred=prepareInstalledStaticSceneTransfer01(packet,expected);
  assert.deepEqual(second.tile.surfaces,transferred.scene.tile.surfaces);assert.deepEqual(second.observationModel.reflectionSurfaceIds,transferred.scene.observationModel.reflectionSurfaceIds);
  assert.throws(()=>prepareInstalledStaticSceneTransfer01(packet,{...expected,generation:2}));assert.throws(()=>prepareInstalledStaticSceneTransfer01(packet,{...expected,catalogSHA256:'f'.repeat(64)}));
  // A revoked current-archive proof removes its formerly resident geometry.
  delete manifest.Resources[0].ArchiveValidation01;writeManifest(f,manifest);world.reload();const revoked=world.window(request(2));assert.equal(revoked.tile.surfaces.length,521);assert.equal(installedStaticSceneMetadata01(revoked).successfulResources,2);assert.ok(revoked.tile.missingRegions.length>0);
  writeManifest(f,JSON.parse(original));world.reload();assert.equal(world.window(request(3)).tile.surfaces.length,781);
  // Same-length changed cached chunk bytes cannot enter through warm reuse.
  const index=JSON.parse(fs.readFileSync(manifest.Resources[0].Result.IndexPath)),chunk=path.join(path.dirname(manifest.Resources[0].Result.IndexPath),index.chunks[0].file),saved=fs.readFileSync(chunk),corrupt=Buffer.from(saved);corrupt[corrupt.length-2]^=1;
  try{fs.writeFileSync(chunk,corrupt);const rejected=world.window(request(4));assert.equal(rejected.tile.surfaces.length,521);assert.ok(installedStaticSceneMetadata01(rejected).failures.some(s=>/integrity/.test(s)));}finally{fs.writeFileSync(chunk,saved);}
  assert.equal(world.window(request(5)).tile.surfaces.length,781);
  // A new authored source revision requires new index, receipt and archive
  // proof identities; the same path name cannot grant the old geometry reuse.
  const updated=JSON.parse(original),row=updated.Resources[0],rawPath=path.join(f.root,row.Id,'original-input.json'),raw=JSON.parse(fs.readFileSync(rawPath));raw.nodes[0].vertices.forEach(p=>p[0]+=.25);raw.source.sha256=sha(JSON.stringify(raw.nodes));const revision=path.join(f.root,row.Id,'revision01');fs.mkdirSync(revision);const normalized=path.join(revision,'original-input.json');fs.writeFileSync(normalized,JSON.stringify(raw));const result=exportCollision(normalized,revision),archive=sha('original revised archive'),receiptPath=path.join(revision,'receipt.json');fs.writeFileSync(receiptPath,JSON.stringify({Schema:1,Archive:raw.source.archive,Entry:raw.source.entry,SourceSHA256:raw.source.sha256,ArchiveUnchanged:true,ArchiveVerification:'sha256-before-after',BeforeSHA256:archive,AfterSHA256:archive,ParserSHA256:updated.InputBinding.CodeWalkerCoreSHA256,Result:result}));row.Result={IndexPath:result.index,IndexSHA256:result.indexSHA256,ReceiptPath:receiptPath,ReceiptSHA256:sha(fs.readFileSync(receiptPath)),ArchiveSHA256:archive};row.ArchiveValidation01={EpochUtc:responsiveEpoch01,Source:'current-archive-sha256',ArchiveSHA256:archive};writeManifest(f,updated);world.reload();const revised=world.window(request(6));assert.equal(revised.tile.surfaces.length,781);assert.notDeepEqual(revised.tile.surfaces.map(s=>s.id).sort(),first.tile.surfaces.map(s=>s.id).sort());assert.ok(revised.observationModel.evidence.some(e=>e.indexSHA256===result.indexSHA256));
  const wrong=structuredClone(updated);wrong.Resources[0].Result.ReceiptSHA256='f'.repeat(64);writeManifest(f,wrong);world.reload();assert.equal(world.window(request(7)).tile.surfaces.length,521);
  writeManifest(f,JSON.parse(original));world.reload();const neighboring=world.window(request(30));assert.equal(neighboring.tile.surfaces.length,1041);const returned=world.window(request(50));assert.equal(returned.tile.surfaces.length,781);assert.deepEqual(returned.tile.surfaces.map(s=>s.id).sort(),first.tile.surfaces.map(s=>s.id).sort());
  assert.ok(world.profile01().queryViews<=world.profile01().maximumQueryViews);assert.ok(world.profile01().queryViewBytes<=world.profile01().maximumQueryViewBytes);
 }finally{writeManifest(f,JSON.parse(original));world.close();}
 const nextEpoch=new InstalledStaticWorld01(config(f,{requiredValidationEpochUtc01:'2026-11-05T00:00:01.000Z'}));try{assert.equal(nextEpoch.window(request()).tile.surfaces.length,0);assert.equal(nextEpoch.status().validationEpoch.headerMatches,false);}finally{nextEpoch.close();}
 assert.throws(()=>new InstalledStaticWorld01(config(f,{catalogSHA256:'f'.repeat(64)})));
 const evicting=new InstalledStaticWorld01(config(f,{maximumResidentResources:1}));try{assert.equal(evicting.window(request()).tile.surfaces.length,781);assert.equal(evicting.status().residentResources,1);assert.ok(evicting.profile01().queryViewEvictions>=2);assert.equal(evicting.window(request(30)).tile.surfaces.length,1041);assert.equal(evicting.status().residentResources,1);assert.ok(evicting.profile01().queryViews<=1);}finally{evicting.close();}
 passed=true;
});

test('representative moving original worker scene reaches actual consumer cold, warm, neighboring and new-generation phases',{timeout:18000},async t=>{
 const f=authoredFixture(),run=await originalAirflowEngineStreet01({enabled:false}),engine=run.engine;engine.now=()=>performance.now();let service;const acceptances=[],snapshots=[];
 let passed=false,closure=null;t.after(()=>validationReceipt(f,{case:'actual-worker-consumer-moving-cold-warm-neighbor-generation',passed,acceptances,worker:service?.snapshot().worker??null,closure,renderedFrames:engine.pipeline.renderer.frame}));
 try{
  service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.expectedGameSHA256,privateRoot:f.root,maximumResidentResources:4},session,onScene:(scene,receipt)=>{engine.queueInstalledStaticScene01(scene,receipt);const accepted=engine.applyPendingInstalledStaticScene01();assert.equal(accepted,true);assert.ok(performance.now()<receipt.expiresAt);assert.equal(scene.tile.createdAt,receipt.geometryTimeMs);assert.equal(scene.tile.validUntil,receipt.geometryTimeMs+1000);acceptances.push({requestId:receipt.requestId,generation:receipt.generation,surfaces:scene.tile.surfaces.length,headroom:receipt.expiresAt-performance.now()});},onStatus:s=>{snapshots.push(s);assert.equal(typeof s.worker.inFlight,'boolean');assert.equal(typeof s.worker.pendingLatest,'boolean');}});
  assert.equal(service.bindPreparationEpoch01(responsiveEpoch01),true);
  // Metadata now prepares asynchronously. Bound startup separately so it
  // cannot consume the moving-observation population's fixed eight seconds.
  const startupDeadline=performance.now()+5000;while(!service.ready&&!service.failed&&performance.now()<startupDeadline)await sleep(10);assert.equal(service.failed,false,service.failure);assert.equal(service.ready,true,'bounded asynchronous metadata startup');
  const began=performance.now();
  for(let sequence=0;sequence<40;sequence++){
   const due=began+sequence*200,delay=due-performance.now();if(delay>0)await sleep(delay);assert.equal(service.failed,false,service.failure);
   // Preserve 200ms observation cadence and the same 500ms dispatch limiter.
   const authoredSequence=sequence<16?sequence:sequence<30?20+(sequence-16):50+(sequence-30),pose=responsivePose01(authoredSequence),frame=airflowFrameStreet01(sequence+1,sequence*.2,{speed:0,cameraGeneration:pose.generation});frame.listener.position=pose.listener;frame.vehicles[0].position=pose.sources[0];frame.listener.velocity=pose.velocity;frame.vehicles[0].velocity=pose.velocity;engine.accept(frame,0,200);service.updateWindow({...pose,geometryTimeMs:performance.now(),durationMs:1000,radius:32,maximumSurfaces:4096,engine:engine.direct.config});
  }
  const deadline=performance.now()+1600;while((service.active||service.pending)&&performance.now()<deadline)await sleep(20);
  assert.equal(service.failed,false,service.failure);assert.ok(acceptances.filter(a=>a.generation===1&&a.surfaces===781).length>=3);assert.ok(acceptances.some(a=>a.generation===1&&a.surfaces===1041));assert.ok(acceptances.some(a=>a.generation===3&&a.surfaces===781));assert.ok(acceptances.length>=12);assert.equal(service.stats.staleResults,0);assert.equal(service.stats.pendingExpired,0);assert.equal(service.stats.callbackFailures,0);assert.ok(service.stats.minimumDispatchIntervalMs>=500);assert.equal(engine.pipeline.renderer.frame,0);assert.ok(snapshots.length<200);
 }finally{closure=await service?.close();await run.close();assert.equal(closure.closed,true);assert.equal(closure.workerJoined,true);assert.equal(closure.controlClosureUnknown,false);assert.equal(closure.workerExitCode,0);}
 passed=true;
});
