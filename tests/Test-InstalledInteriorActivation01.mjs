import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {InstalledWorldContext01} from '../tools/soundmap/installed-world-context01.mjs';
import {bindCameraInterior01,interiorObservationKey01,matchInteriorInstance01} from '../src/acoustics/world/interior-activation01.mjs';
import {publishWarmupManifest01} from '../src/acoustics/world/world-warmup.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const epoch='2026-11-07T00:00:00.000Z',session='ac'.repeat(16),archetype=0x12345678,origin=[25,10,4];
const observation={proxy:71,archetype,origin,durationMs:950,epoch};
async function until(check){const end=performance.now()+5000;while(!check()){assert(performance.now()<end,'scene test deadline');await wait(10);}}

test('camera lease and proxy matching refuse stale, ambiguous, and foreign observations',()=>{
 const listener={valid:true,paused:false,observationTicks:2000,clockFrequency:1000};
 const frame={listener,worldPreparationStartedUtc:epoch,cameraInterior01:{...observation,observationTicks:2020}};
 assert.equal(bindCameraInterior01(frame,180,null).durationMs,820);
 assert.equal(bindCameraInterior01(frame,180,500).durationMs,500);
 assert.equal(bindCameraInterior01({...frame,cameraInterior01:{...observation,observationTicks:1940}},180,null),null);
 const scope={session,generation:1,catalogSHA256:'a'.repeat(64),epoch},sample={...scope,...observation};
 const instances={'0x12345678':[{id:'near',origin},{id:'far',origin:[25,10,40]}]};
 assert.equal(matchInteriorInstance01(instances,sample,scope),'near');
 assert.equal(matchInteriorInstance01(instances,{...sample,generation:2},scope),null);
 assert.equal(matchInteriorInstance01(instances,{...sample,catalogSHA256:'b'.repeat(64)},scope),null);
 assert.equal(matchInteriorInstance01(instances,{...sample,epoch:'unbound'},scope),null);
 instances['0x12345678'].push({id:'ambiguous',origin:[25.01,10,4]});
 assert.equal(matchInteriorInstance01(instances,sample,scope),null);
});

test('owned scene worker admits the rotated interior only for the exact camera proxy observation',async()=>{
 const f=installedSceneFixture01();let service,engine,viewer;
 try {
  f.publish(1,{validationEpochUtc01:epoch});
  const catalog=read(f.catalogPath),manifest=read(f.manifestPath),row=manifest.Resources[0];
  const ytyp='authored.rpf/interior.ytyp',ymap='authored.rpf/interior.ymap',pin='d'.repeat(64),name='0x12345678';
  catalog.Resources.push({Kind:'ytyp',Path:ytyp},{Kind:'ymap',Path:ymap});
  catalog.TargetCollisionEvidence.InteriorBoundsMembership=[{InteriorName:name,BoundsHash:row.Hash}];
  catalog.InteriorPlacementMetadata01={Schema:1,Kind:'RichAudioInstalledMloPlacementMetadata01',
   YtypSourceBindings:[{Path:ytyp,SHA256:pin}],YmapSourceBindings:[{Path:ymap,SHA256:pin}],
   Archetypes:[{ArchetypeHash:name,PhysicsDictionaryHash:row.Hash,SourceYtyp:ytyp,SourceSHA256:pin,
    LocalMin:[-4,-1,-1],LocalMax:[4,5,5],Rooms:[],
    Portals:[{Index:0,RoomFrom:0,RoomTo:1,Flags:0,AudioOcclusion:0,Corners:[[-1,1,0],[1,1,0],[1,1,2],[-1,1,2]]}]}],
   Instances:[{ArchetypeHash:name,InstanceId:'authored-rotated',SourceYmap:ymap,SourceSHA256:pin,
    Matrix:[0,1,0,0,-1,0,0,0,0,0,1,0,...origin,1]}]};
  fs.writeFileSync(f.catalogPath,JSON.stringify(catalog));
  manifest.ResolvedCatalogSHA256=digest(f.catalogPath);
  row.Eligibility='deferred-interior-local';row.Status=row.Eligibility;
  row.PotentialStatus='imported-resource-root-incomplete-surfaces';row.PotentialResult=row.Result;row.Result=null;
  publishWarmupManifest01(f.manifestPath,manifest);
  const scenes=[];
  service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},
   session,onScene:(scene,receipt)=>{
    scenes.push({scene,receipt});
    if(engine&&scene.tile.surfaces.length){engine.queueInstalledStaticScene01(scene,receipt);engine.applyPendingInstalledStaticScene01();}
   }});
  assert.equal(service.bindPreparationEpoch01(epoch),true);
  await until(()=>service.ready||service.failed);
  const request=async(cameraInterior01,generation=1,anchored=false)=>{
   const count=scenes.length;
   service.updateWindow({listener:[25,10,5],sources:anchored?[]:[[24,9,5]],generation,geometryTimeMs:performance.now(),
    radius:8,maximumSurfaces:128,prepareSoundMapGeometry01:false,cameraInterior01});
   await until(()=>service.failed||scenes.length>count);
   assert.equal(service.failed,false,service.failure);
   return scenes.at(-1);
  };
  assert.equal((await request(null)).scene.tile.surfaces.length,0);
  assert.equal((await request({...observation,origin:[25,10,45]})).scene.tile.surfaces.length,0);
  const active=await request(observation);
  assert.equal(active.receipt.durationMs,950);
  assert.equal(active.scene.tile.surfaces.length,2);
  assert.equal(active.scene.observationModel.evidence[0].interiorInstanceId,'authored-rotated');
  assert(active.scene.tile.surfaces.every(s=>Math.abs(s.center[0]-21)<1e-8),'rotation and translation applied');
  assert(active.scene.tile.missingRegions.some(r=>r.bounds.min[0]<24&&r.bounds.max[0]>24),'portal retains bounded unknown geometry');
  assert.equal(active.scene.observationModel.runtimeActivationVerified,false);
  viewer=new InstalledWorldContext01({manifestPath:f.manifestPath,catalogPath:f.catalogPath,
   expectedGameSHA256:f.gameSHA256,catalogSHA256:manifest.ResolvedCatalogSHA256});
  const viewFrame=interior=>({sessionId:session+':1',streamId:'original-viewer',producedAtUnixMs:Date.now(),
   listener:{valid:true,position:[25,10,5]},worldContext01:{epoch,catalogue:manifest.ResolvedCatalogSHA256,
    ownerSession:session,generation:1,position:[25,10,5],ageMs:10,interior,interiorKey:interiorObservationKey01(interior)}});
  let context;
  await until(()=>{context=viewer.snapshot(viewFrame({...observation,durationMs:200}));return context.tiles?.some(t=>t.surfaces.length===2);});
  assert(context.remainingMs<=200,'viewer-only geometry keeps the shorter incoming lease');
  assert(context.tiles.flatMap(t=>t.surfaces).every(s=>s.vertices.every(p=>Math.abs(p[0]-21)<1e-8)));
  assert(context.tiles.some(t=>t.missingRegions.some(r=>r.reason==='unknown-portal-state')));
  const originalGeneration=context.generation;
  await until(()=>{context=viewer.snapshot(viewFrame({...observation,durationMs:200}));
   return context.generation!==originalGeneration&&context.tiles?.some(t=>t.surfaces.length===2);});
  assert(viewer.reader.stats.minimumDispatchIntervalMs<500,'short interior leases use the independent viewer cadence');
  assert.deepEqual(viewer.snapshot(viewFrame(null)).tiles,[],'proxy loss withdraws the viewer-only geometry immediately');
  await viewer.close();viewer=null;
  publishWarmupManifest01(f.manifestPath,{...manifest,UnrelatedProgress:1});
  assert.equal((await request(observation)).scene.tile.surfaces.length,2);
  assert.equal((await request(null,2)).scene.tile.surfaces.length,0);
  assert.equal((await request(observation,3)).scene.tile.surfaces.length,2);
  const forbidden=()=>{throw Error('No source required for the bankless consumer')};
  engine=new StockGameplay({registry:{resolve:forbidden,createSource:forbidden},session,now:()=>performance.now(),continuityPolicy:'camera-source-01'});
  engine.bindInstalledSceneService01(service);
  const started=performance.now();let sequence=0;
  const frame=()=>{
   const now=performance.now(),s=airflowFrameStreet01(++sequence,(now-started)/1000,{speed:0,cameraGeneration:3});
   s.session=session;s.listener.session=session;s.listener.position=[25,10,5];
   for(const vehicle of s.vehicles)vehicle.position=[24,9,5];
   engine.accept(s,0,200);
   service.updateWindow({listener:s.listener.position,sources:[[24,9,5]],generation:3,geometryTimeMs:now,
    radius:8,maximumSurfaces:128,prepareSoundMapGeometry01:false,cameraInterior01:observation,engine:engine.direct.config});
  };
  frame();const expiry=performance.now()+4200;
  while(!engine.staticSceneBinding&&!service.failed&&performance.now()<expiry){await wait(160);frame();}
  assert.equal(service.failed,false,service.failure);
  assert.equal(engine.staticSceneBinding?.interiorGeometryActivation,'camera-proxy-matched-selected-instance; portals-unknown');
  service.withdrawCameraInterior01();
  assert.equal(engine.staticSceneBinding,null,'camera proxy loss revokes applied interior without waiting for the old expiry');
  const first=await request(observation,3,true),second=await request(observation,3,true);
  assert.equal(first.scene.tile.surfaces.length,2);
  assert.equal(second.receipt.lifecycle01.workerProfile01.staticPreparation.reusedAnchoredSelection01,true);
  assert.notEqual(first.scene.geometryKey,second.scene.geometryKey);
  assert(second.scene.tile.surfaces.every(s=>s.validUntil===second.scene.tile.validUntil));
  const indexPath=row.PotentialResult.IndexPath;
  const chunk=path.join(path.dirname(indexPath),read(indexPath).chunks[0].file);
  const bytes=fs.readFileSync(chunk),changed=Buffer.from(bytes),stat=fs.statSync(chunk);
  changed[changed.length-1]^=1;
  fs.writeFileSync(chunk,changed);
  fs.utimesSync(chunk,stat.atime,stat.mtime);
  assert.equal((await request(observation,3,true)).scene.tile.surfaces.length,0,'reuse cannot mask same-size chunk corruption');
  fs.writeFileSync(chunk,bytes);
  const before=service.snapshot().cacheTimings.metadataInstalledAt01;
  delete row.ArchiveValidation01;
  publishWarmupManifest01(f.manifestPath,manifest);
  await until(()=>service.failed||service.snapshot().cacheTimings?.metadataInstalledAt01>before);
  assert.equal((await request(observation,3)).scene.tile.surfaces.length,0);
  assert.equal((await service.close()).workerJoined,true);service=null;
  // A matching proxy does not grant authority to the same resource when its
  // catalogue declares a conditional group, even with current archive proof.
  catalog.TargetCollisionEvidence.MapGroupMembership=[{BoundsHash:row.Hash,DataGroupName:'authored-conditional'}];
  fs.writeFileSync(f.catalogPath,JSON.stringify(catalog));
  manifest.ResolvedCatalogSHA256=digest(f.catalogPath);
  row.ArchiveValidation01={EpochUtc:epoch,ArchiveSHA256:row.PotentialResult.ArchiveSHA256,Source:'current-archive-sha256'};
  publishWarmupManifest01(f.manifestPath,manifest);
  const world=new InstalledStaticWorld01({manifestPath:f.manifestPath,catalogPath:f.catalogPath,
   catalogSHA256:manifest.ResolvedCatalogSHA256,requiredValidationEpochUtc01:epoch});
  try{
   const blocked=world.window({listener:[25,10,5],session,generation:3,radius:8,
    interiorActivation01:{...observation,session,generation:3,catalogSHA256:manifest.ResolvedCatalogSHA256}});
   assert.equal(blocked.tile.surfaces.length,0);
   assert(blocked.tile.missingRegions.length>0,'conditional geometry remains unknown');
  }finally{world.close();}
 } finally {
  if(service)assert.equal((await service.close()).workerJoined,true);
  await viewer?.close();
  await engine?.close();
  f.close();
 }
});
