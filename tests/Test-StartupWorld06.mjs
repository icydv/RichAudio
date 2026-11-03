// Acceptance of an entire DECLARED original world; no installation evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {createWorldCoverageSolver06,loadWorldCoverageInspection06} from '../tools/soundmap/worldcoverage06.mjs';
import {createInteriorTopology04,createInteriorState04,planInteriorPropagation04} from '../src/acoustics/world/interior04.mjs';
import {interiorFixture04,interiorStateFixture04,interiorSession04} from './fixtures/Interior04.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {createStockVehiclePipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {originalSourceBank05} from './fixtures/SourcePreparation05.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createHash} from 'node:crypto';

test('startup persists all twelve separated tiles before any visit; an unvisited remote tile reflects from cache without conversion',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),progress=[];const visited=new Set();const c=h.create(f,{onProgress:p=>progress.push(p)});
 try{
  const result=await c.run({checkpointEveryPages:1});assert.equal(result.eligibleComplete,true);assert.equal(result.readiness,'ready-supported-subset');assert.equal(result.completedEligibleTiles,12);assert.equal(result.workersStarted,12);assert.equal(result.workersStarted,result.workersJoined);assert.equal(result.percent,100);assert.equal(result.installedWorldVerified,false);assert.equal(result.actualWorldCoverage,'unmeasured');assert.equal(h.router.diagnostics().geometryResidentInRouter,0);assert.equal(h.router.diagnostics().shards,12);
  assert.equal(visited.size,0);assert(progress.some(p=>p.percent>0&&p.percent<100));
  // Read the remote artifact before adding the FIRST visit. This checks actual
  // persistent geometry rather than a metadata readiness assertion.
  const remote=f.locations.at(-1),page=f.pages.find(p=>p.pageId===remote.pageId),plan=page.inventory.tilePlans.find(p=>p.tileId===remote.tileId),row=result.tiles.find(t=>t.tileId===remote.tileId);
  const persisted=await h.router.load(plan,{tileDigest:row.artifactDigest});assert(persisted.tile.engineTile.surfaces.length>0);assert.equal(visited.has(remote.tileId),false);
  const before=c.snapshot().workersStarted,inspection=await loadWorldCoverageInspection06({coordinator:c,...remote,inventory:page.inventory});assert.equal(inspection.state,'prepared-cache-hit');assert.equal(inspection.conversionWorkers,0);assert.equal(c.snapshot().workersStarted,before);
  const solver=createWorldCoverageSolver06({inspection,source:remote.source,listener:remote.listener});
  try{const reflected=solver.sample.control.paths.filter(p=>p.order>0);assert(reflected.length>0,'actual existing solver selected a finite remote reflection');for(const p of reflected){assert(p.distance>Math.hypot(...remote.source.map((v,i)=>v-remote.listener[i])));assert(Math.abs(p.delay-p.distance/343)<1e-9);assert(p.bands.every(v=>Number.isFinite(v)&&v>=0&&v<=1));}}finally{solver.close();}
  visited.add(remote.tileId);assert.equal(visited.size,1);
 }finally{await h.close();}
});

test('unchanged restart performs no conversions; one YBN, DLC addition and custom winner change only dependent tiles',async()=>{
 const h=await startupHarness06();let pin;
 try{
  const first=h.create(startupWorld06());const a=await first.run({checkpointEveryPages:1});pin=a.checkpointSHA256;await first.close();
  const restart=h.create(startupWorld06(),{trustedCheckpointSHA256:pin});const b=await restart.run();assert.equal(b.workersStarted,0);assert.equal(b.cacheHits,12);assert.equal(b.completedEligibleTiles,12);pin=b.checkpointSHA256;await restart.close();
  const changed=h.create(startupWorld06({changedYbn:true}),{trustedCheckpointSHA256:pin});const d=await changed.run();assert.equal(d.workersStarted,1);assert.equal(d.cacheHits,11);assert.equal(d.completedEligibleTiles,12);const changedIds=d.tiles.filter(t=>t.artifactDigest!==a.tiles.find(x=>x.tileId===t.tileId)?.artifactDigest).map(t=>t.tileId);assert.deepEqual(changedIds,['declared-00']);pin=d.checkpointSHA256;await changed.close();
  const dlc=h.create(startupWorld06({changedYbn:true,dlc:true}),{trustedCheckpointSHA256:pin});const e=await dlc.run();assert.equal(e.workersStarted,1);assert.equal(e.cacheHits,12);assert.equal(e.completedEligibleTiles,13);pin=e.checkpointSHA256;await dlc.close();
  const customFixture=startupWorld06({changedYbn:true,dlc:true,customOverride:true}),custom=h.create(customFixture,{trustedCheckpointSHA256:pin});const g=await custom.run();assert.equal(g.workersStarted,1);assert.equal(g.cacheHits,12);assert.equal(g.completedEligibleTiles,13);const winner=customFixture.pages[0].inventory.effective.find(r=>r.path==='declared-01.ybn');assert.equal(winner.mount,'custom');assert.equal(customFixture.pages[0].inventory.tilePlans.find(p=>p.tileId==='declared-01').bindings[0].resourceId,winner.id);
 }finally{await h.close();}
});

test('unsupported winners and incomplete discovery preserve unknown coverage independently of processed-subset completion',async()=>{
 const h=await startupHarness06(),f=startupWorld06({unsupported:true,missingYtyp:true,incompleteDiscovery:true}),c=h.create(f);
 try{const r=await c.run();assert.equal(r.totalTiles,12);assert.equal(r.eligibleTiles,10);assert.equal(r.completedEligibleTiles,10);assert.equal(r.unsupportedTiles,2);assert.equal(r.percent,null);assert.equal(r.eligibleComplete,true);assert.notEqual(r.readiness,'ready-supported-subset');assert.equal(r.tiles.find(t=>t.tileId==='declared-02').status,'unsupported');assert.match(r.tiles.find(t=>t.tileId==='declared-03').reason,/missing-resource-dependency/);assert(r.unknownRegions.some(x=>x.id==='undiscovered-sector'));assert.equal((await c.loadPrepared({pageId:'page-0',tileId:'declared-02'})).state,'not-ready');assert.equal(c.continuePartially().readiness,'partial');assert.equal(r.actualWorldCoverage,'unmeasured');}finally{await h.close();}
});

test('runtime door/IPL epochs do not rebuild persisted static tiles or fabricate unknown interior connectivity',async()=>{
 const h=await startupHarness06(),world=startupWorld06(),c=h.create(world);
 try{
  const before=await c.run(),f=interiorFixture04(),topology=createInteriorTopology04(f.input,{scene:f.scene}),open=createInteriorState04(topology,interiorStateFixture04(topology)),closed=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{entry:'closed','upper-window':'closed'}}));
  const query=state=>planInteriorPropagation04(topology,state,{from:'outside',to:'upper',sourcePosition:[-2,2,1],listenerPosition:[2,2,4.5],now:100,session:interiorSession04,generation:1});
  assert(query(closed).routes.find(r=>r.portals.length===2).transmissionEnergy.every((v,i)=>v<query(open).routes.find(r=>r.portals.length===2).transmissionEnergy[i]));
  c.setRuntimeState({epoch:1,digest:open.stateDigest});c.setRuntimeState({epoch:2,digest:closed.stateDigest});const after=c.snapshot();assert.deepEqual(after.tiles.map(t=>[t.planDigest,t.artifactDigest]),before.tiles.map(t=>[t.planDigest,t.artifactDigest]));assert.equal(after.workersStarted,before.workersStarted);
  const unknown=createInteriorState04(topology,interiorStateFixture04(topology,{activation:{}}));assert.equal(query(unknown).reason,'unknown-interior-or-ipl-activation');assert.equal(query(unknown).routes.length,0);assert.equal(query(open).acousticRoutingApplied,false,'metadata contract does not enable unvalidated MLO rendering');
 }finally{await h.close();}
});

test('interrupted startup checkpoints completed pages and resumes remaining tiles without revisiting the player',async()=>{
 const h=await startupHarness06(),world=startupWorld06(),abort=new AbortController();let latest;
 const c=h.create(world,{onProgress:p=>{latest=p;if(p.completedEligibleTiles===4)abort.abort();}});
 try{
  const interrupted=await c.run({signal:abort.signal,checkpointEveryPages:1});assert.equal(interrupted.readiness,'cancelled');assert(interrupted.completedEligibleTiles>=4&&interrupted.completedEligibleTiles<12);assert.equal(interrupted.workersStarted,interrupted.workersJoined);assert(interrupted.checkpointSHA256);await c.close();
  const resumed=h.create(startupWorld06(),{trustedCheckpointSHA256:interrupted.checkpointSHA256});const done=await resumed.run();assert.equal(done.completedEligibleTiles,12);assert.equal(done.eligibleComplete,true);assert(done.cacheHits>=4);assert(done.workersStarted<=8);assert.equal(done.workersStarted,done.workersJoined);assert(latest.completedEligibleTiles>=4);
 }finally{await h.close();}
});

test('loading an already-prewarmed remote tile preserves moving stock-source PCM, source cursor and renderer history without a queue',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f),pipelines=[];
 try{
  await c.run();const remote=f.locations.at(-1),loaded=await c.loadPrepared(remote),scene=loaded.context.scene,open=acousticScene(createTile({...scene.tile,id:'original-world06-controlled-open',surfaces:[],missingRegions:[]}),{},scene.config),ids=['stock:slot0:engine','stock:slot0:exhaust'];
  const make=()=>{const source=new StockVehicleSource(originalSourceBank05()),pipeline=createStockVehiclePipeline({scene:open,sourceIds:ids,quality:'balanced',acceleration:'cpu',continuousRates:true}),inputs=Object.fromEntries(ids.map(id=>[id,new Float32Array(512)]));pipelines.push(pipeline);return {source,pipeline,inputs,left:new Float32Array(512),right:new Float32Array(512),dry:createHash('sha256'),histories:null};};
  const a=make(),b=make();assert.equal(b.source.frame,0);let changes=0;
  for(let block=0;block<48;block++){
   if(block===16||block===32){const before=c.snapshot().workersStarted,cached=await c.loadPrepared(remote);assert.equal(cached.conversionWorkers,0);assert.equal(c.snapshot().workersStarted,before);b.pipeline.replaceScene(block===16?cached.context.scene:open);changes++;}
   const time=block*512/48000,position=[remote.x-.4+time*.2,2,.6];
   for(const arm of [a,b]){
    arm.source.renderInto({operatingPoint:.5,load:.9,lift:false,running:true},arm.inputs[ids[0]],arm.inputs[ids[1]]);for(const id of ids)arm.dry.update(Buffer.from(arm.inputs[id].buffer));
    await arm.pipeline.prepare({time,session:f.session,generation:1,listener:{position:remote.listener,forward:[0,1,0],up:[0,0,1]},sources:ids.map((id,i)=>({id,generation:1,position:position.map((v,k)=>v+(k===1?(i?-.75:.35):k===2?(i?.3:.65):0)),velocity:[.2,0,0],forward:i?[0,-1,0]:[0,1,0],up:[0,0,1],directivity:i?.65:.1}))},{geometryTimeMs:time*1000});arm.pipeline.process(arm.inputs,arm.left,arm.right);
    assert.equal(arm.source.frame,(block+1)*512);arm.histories??=arm.pipeline.renderer.sourceList.map(s=>s.bands);arm.pipeline.renderer.sourceList.forEach((s,i)=>assert.equal(s.bands,arm.histories[i]));
   }
  }
  assert.equal(a.dry.digest('hex'),b.dry.digest('hex'));assert.equal(changes,2);assert.equal(b.pipeline.renderer.frame,a.pipeline.renderer.frame);assert.equal(b.pipeline.renderer.frame,48*512);assert.equal(b.pipeline.diagnostics().history.affectedFrames,0);assert.equal(c.snapshot().pcmQueueFramesAdded,0);assert.equal(b.pipeline.diagnostics().simulation.sceneReplacements,2);
 }finally{for(const p of pipelines)p.close();await h.close();}
});
