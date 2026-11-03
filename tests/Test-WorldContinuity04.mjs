// Device-free source/worker integration. PCM is authored, never a private bank.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {createTile,coordinateSpace} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createSceneTileContext03} from '../src/acoustics/world/scene-union03.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {ResourceTileStore04} from '../src/acoustics/world/resource-tile-store04.mjs';

const session='4'.repeat(32),world='4'.repeat(64),changedWorld='5'.repeat(64),FS=48000,BLOCK=512;
function contexts({worldDigest=world,until=60000,override=false,missing=false}={}){
 return [['west',-16,0],['east',0,16]].map(([id,min,max])=>{
  const surfaces=override?[{id:'wall:'+id,coordinateSpace,center:[(min+max)/2,4,2],normal:[0,-1,0],u:[1,0,0],half:[6,3],motion:'static',reflectiveSide:'both',
   provenance:{kind:'synthetic',reference:'world04-authored-wall'},confidence:1,version:1,observedAt:0,validUntil:until,material:{observedId:null,observedConfidence:null,acoustic:null}}]:[];
  const materials=Object.fromEntries(surfaces.map(s=>[s.id,{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'world04-authored-passive'}]));
  const box={min:[min,-16,-8],max:[max,16,16]},unknown=missing&&id==='east'?[{id:'missing-winning-geometry',bounds:box,reason:'unsupported-winning-resource'}]:[];
  const tile=createTile({schemaVersion:1,id:'continuity04:'+id,coordinateSpace,timeUnit:'monotonic-ms',bounds:box,listenerAnchor:[(min+max)/2,0,1],coverage:unknown.length?'partial':'complete-synthetic',surfaces,missingRegions:unknown,
   version:1,createdAt:0,validUntil:until,build:'world04-continuity-fixture',session,interior:'fixture',dynamicEpoch:1});
  return createSceneTileContext03({tileId:id,worldDigest,scene:acousticScene(tile,materials,vehicleDistanceSceneOptions('authored-detail-loss-v1')),
   sourceBindings:[{id:'collision:'+id,sha256:(override?'b':'a').repeat(64)}],layout:'gen9-rsc7'});
 });
}
function frame(sequence,time){
 const ticks=10000000+Math.round(time*10000000),x=-3+time*4;
 return {version:1,session,listener:{version:1,session,generation:1,sequence,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(time*1000),position:[x,0,1],velocity:[4,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},
  vehicles:[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:[x+1,10,1],velocity:[4,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};
}
function engine(){
 const samples=Float32Array.from({length:8192},(_,i)=>.05*Math.sin(i*.13)+.025*Math.cos(i*.031));
 const asset={frames:samples.length,sampleRate:24000,samples,nativePeak:.075};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
 const registry={resolve:()=>({status:'available',bank}),createSource:()=>new StockVehicleSource(bank)};let wall=0;
 const instance=new StockGameplay({registry,session,now:()=>wall,continuityPolicy:'camera-source-01'});
 instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 return {instance,setWall:value=>{wall=value;}};
}

test('moving sources keep dry PCM, grain cursor and history across joined workers, overrides, gaps, cancellation and expiry',async t=>{
 const baseline=engine(),trial=engine(),runtime=new ScenePreparation03({session,worldDigest:world});
 let source=null,previousFrame=null,history=null,sequence=0,next=0,cancelPending=null,sourceCrossed=false,listenerCrossed=false;
 const dryBase=createHash('sha256'),dryTrial=createHash('sha256'),timings=[];
 const attach=result=>{assert.equal(result.state,'prepared');assert.equal(result.workerJoined,true);trial.instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:result.prepared.worldDigest,generation:result.prepared.generation});};
 try{
  attach(await runtime.prepare({contexts:contexts(),listenerAnchor:[-3,0,1]}));
  for(let block=0;block<144;block++){
   const time=block*BLOCK/FS,ms=time*1000;baseline.setWall(ms);trial.setWall(ms);
   if(block===32)attach(await runtime.prepare({contexts:contexts({override:true}),listenerAnchor:[-3+time*4,0,1],geometryTimeMs:ms}));
   if(block===48){const controller=new AbortController();cancelPending=runtime.prepare({contexts:contexts(),listenerAnchor:[-1,0,1],geometryTimeMs:ms,signal:controller.signal});controller.abort();}
   if(block===49){const result=await cancelPending;assert.equal(result.state,'cancelled');assert.equal(result.workerJoined,true);assert(runtime.current(),'cancellation retains the prior fresh scene');}
   if(block===64)attach(await runtime.prepare({contexts:contexts({missing:true}),listenerAnchor:[-3+time*4,0,1],geometryTimeMs:ms}));
   if(block===80){const binding=trial.instance.staticSceneBinding;await runtime.invalidate(changedWorld);trial.instance.clearPreparedResourceScene03(binding);assert.equal(trial.instance.pipeline.simulation.scene,trial.instance.direct);}
   if(block===96)attach(await runtime.prepare({contexts:contexts({worldDigest:changedWorld,until:ms+80}),listenerAnchor:[-3+time*4,0,1],geometryTimeMs:ms}));
   if(time+1e-10>=next){const observation=frame(sequence++,next),age=Math.max(0,(time-next)*1000);baseline.instance.accept(observation,age,200);trial.instance.accept(observation,age,200);next+=.05;}
   await baseline.instance.render();const started=performance.now();await trial.instance.render();timings.push(performance.now()-started);
   for(const id of trial.instance.ids){dryBase.update(Buffer.from(baseline.instance.inputs[id].buffer));dryTrial.update(Buffer.from(trial.instance.inputs[id].buffer));}
   const active=trial.instance.slots.find(slot=>slot.source);
   if(active){source??=active.source;assert.equal(active.source,source);if(previousFrame!==null)assert.equal(source.frame-previousFrame,BLOCK);previousFrame=source.frame;
    history??=trial.instance.pipeline.renderer.sourceList.map(s=>s.bands);trial.instance.pipeline.renderer.sourceList.forEach((s,i)=>assert.equal(s.bands,history[i]));
    sourceCrossed ||= active.vehicle.position[0]>0;listenerCrossed ||= (trial.instance.sample.state?.position[0]??-1)>0;}
  }
  assert.equal(dryTrial.digest('hex'),dryBase.digest('hex'),'geometry never resets or alters the source generator');
  assert(sourceCrossed&&listenerCrossed);assert.equal(trial.instance.diagnostics().stageCounters.sourceCreations,1);
  assert.equal(trial.instance.pipeline.renderer.frame,baseline.instance.pipeline.renderer.frame,'no fixed frames added by map changes');
  assert.equal(trial.instance.pipeline.simulation.scene,trial.instance.direct,'finite scene lease expires into the existing fallback');
  assert.equal(trial.instance.diagnostics().pipeline.history.affectedFrames,0);assert.equal(trial.instance.diagnostics().pipeline.renderer.limited,0);
  assert.equal(runtime.stats.workersStarted,runtime.stats.workersJoined);assert.equal(runtime.stats.pcmQueueFramesAdded,0);
  timings.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({kind:'device-free-render-processing-ms',calls:timings.length,p50:timings[Math.ceil(timings.length*.5)-1],p99:timings[Math.ceil(timings.length*.99)-1],maximum:timings.at(-1),overBudget:timings.filter(n=>n>BLOCK/FS*1000).length,blockBudgetMs:BLOCK/FS*1000,endpointAccess:false,privateAssetsRead:false}));
 }finally{baseline.instance.close();trial.instance.close();await runtime.close();}
});

test('supplied resource packets import progressively, survive cache restart and reach the existing Bati renderer through a joined scene worker',async()=>{
 const fixture=worldResources04(),inventory=qualifyResourceInventory04(fixture.inventory);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-render-')),directory=path.join(root,'.local','tiles');await fs.mkdir(directory,{recursive:true});
 const store=new ResourceTileStore04(root,directory),runtime=new ScenePreparation03({session,worldDigest:inventory.inventoryDigest}),trial=engine();
 let builder=new ResourceTileBuilder04({...fixture,inventory,store}),source=null,sourceFrame=null,next=0,sequence=0;
 try{
  await builder.prepareNearby({listenerAnchor:[-3,0,1],maximumTiles:1});assert.deepEqual([...builder.resident.keys()],['west']);
  await builder.prepareNearby({listenerAnchor:[3,0,1],maximumTiles:1});assert.equal(builder.resident.size,2);assert.equal(builder.stats.workersJoined,2);const trustedArtifacts=builder.artifactBindings();await builder.close();
  builder=new ResourceTileBuilder04({...fixture,inventory,store,trustedArtifacts});
  const reloaded=await builder.prepareNearby({listenerAnchor:[-3,0,1],maximumTiles:2});assert.equal(reloaded.state,'prepared');assert.equal(builder.stats.cacheHits,2);assert.equal(builder.stats.workersStarted,0);
  const result=await runtime.prepare({contexts:builder.contexts({engine:vehicleDistanceSceneOptions('authored-detail-loss-v1')}),listenerAnchor:[-3,0,1]});
  assert.equal(result.state,'prepared');assert.equal(result.workerJoined,true);assert.equal(result.prepared.scene.tile.surfaces.length,2);
  trial.instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:inventory.inventoryDigest,generation:1});
  for(let block=0;block<112;block++){
   const time=block*BLOCK/FS;trial.setWall(time*1000);
   if(time+1e-10>=next){const observation=frame(sequence++,next);observation.vehicles[0].position[1]=2;trial.instance.accept(observation,Math.max(0,(time-next)*1000),200);next+=.05;}
   await trial.instance.render();const active=trial.instance.slots.find(s=>s.source);
   if(active){source??=active.source;assert.equal(active.source,source);if(sourceFrame!==null)assert.equal(source.frame-sourceFrame,BLOCK);sourceFrame=source.frame;}
  }
  assert.equal(trial.instance.diagnostics().stageCounters.sourceCreations,1);assert.equal(trial.instance.diagnostics().geometry,'qualified-original-resource-subset');
  assert.equal(trial.instance.diagnostics().pipeline.history.affectedFrames,0);assert.equal(runtime.stats.workersStarted,runtime.stats.workersJoined);
 }finally{
  await builder.close();await runtime.close();trial.instance.close();
  const expectedPrefix=path.resolve(os.tmpdir())+path.sep+'richaudio-world04-render-';assert(path.resolve(root).startsWith(expectedPrefix));await fs.rm(root,{recursive:true,force:true});
 }
});
