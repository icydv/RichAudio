import test from 'node:test';import assert from 'node:assert/strict';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
import {budgetSession042} from './fixtures/AcousticBudget042.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {pathGeometry} from '../src/acoustics/engine/paths.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
const BLOCK=512,FS=48000,engineOptions={order:2,maxPaths:64,maxReflectors:16,...vehicleDistanceSceneOptions('authored-detail-loss-v1')};

test('installed scene arriving during held asynchronous visibility stays queued until the next real render boundary',async()=>{
 const f=installedSceneFixture01(),run=await originalAirflowEngineStreet01({enabled:false}),engine=run.engine,world=new InstalledStaticWorld01(f.config);
 let release=null;
 try{
  const sceneAt=t=>world.window({listener:[0,3,1.65],sources:[[0,3,1]],session:budgetSession042,generation:1,geometryTimeMs:t,durationMs:1000,engine:engineOptions});
  const first=sceneAt(0);engine.setInstalledStaticScene01(first,{expiresAt:1000});
  for(let block=0;block<60;block++){const t=block*BLOCK/FS;run.setWall(t*1000);if(block%4===0)engine.accept(airflowFrameStreet01(block/4,t,{speed:0,near:3}),0,200);await engine.render();}
  const source=engine.slots[0].source,frame=source.frame,originalQuery=engine.pipeline.backend.query.bind(engine.pipeline.backend),at=60*BLOCK/FS;run.setWall(at*1000);engine.accept(airflowFrameStreet01(15,at,{speed:0,near:3}),0,200);
  let entered;const awaiting=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  engine.pipeline.backend.query=async(...args)=>{entered();await held;return originalQuery(...args);};
  const rendering=engine.render();await awaiting;
  const second=sceneAt(at*1000);engine.queueInstalledStaticScene01(second,{expiresAt:at*1000+1000,generation:1});
  assert.equal(engine.pipeline.simulation.scene,first,'publication cannot mutate geometry epoch of pending visibility');
  release();await rendering;release=null;assert.equal(engine.pipeline.simulation.scene,first);assert.equal(source.frame,frame+BLOCK);
  engine.pipeline.backend.query=originalQuery;run.setWall((61*BLOCK/FS)*1000);await engine.render();
  assert.equal(engine.pipeline.simulation.scene,second);assert.equal(engine.slots[0].source,source);assert.equal(source.frame,frame+2*BLOCK);assert.equal(engine.stats.arrivals,1);assert.equal(engine.pipeline.renderer.stats.missingHistory,0);
  engine.queueInstalledStaticScene01(first,{expiresAt:0,generation:1});run.setWall((62*BLOCK/FS)*1000);await engine.render();assert.equal(engine.pipeline.simulation.scene,second,'expired queued work cannot replace current geometry');
 }finally{release?.();await run.close();world.close();f.close();}
});

test('explicit installed unknown regions retain labelled direct fallback, reject reflected gaps and never bypass known walls',()=>{
 const f=installedSceneFixture01(),world=new InstalledStaticWorld01(f.config);
 try{
  const base=world.window({listener:[0,0,1],sources:[[-1,0,1]],session:budgetSession042,generation:1,geometryTimeMs:0,durationMs:1000,engine:engineOptions});
  const tile=createTile({...base.tile,missingRegions:[{id:'original:unknown',bounds:{min:[-2,-1,.5],max:[2,6,1.5]},reason:'original-unsupported-control'}]});
  const scene=acousticScene(tile,base.materials,{...base.config,observationModel:base.observationModel});
  const direct=pathGeometry(scene,[-1,0,1],[0,0,1],[]);assert.equal(direct.status,'clear');assert.equal(direct.unknownDirectFallback,true);assert.deepEqual(direct.unmappedRegions,['original:unknown']);
  const reflected=pathGeometry(scene,[-1,0,1],[0,0,1],[scene.tile.surfaces.find(s=>s.id===scene.observationModel.reflectionSurfaceIds[0])]);assert.equal(reflected.status,'unknown');
  const blocked=pathGeometry(scene,[0,3,1],[0,5,1],[]);assert.notEqual(blocked.status,'clear');assert.notEqual(blocked.unknownDirectFallback,true);assert.ok(blocked.hits.length>0,'represented finite facade still participates in obstruction');
  const simulation=new CausalSimulation(scene),pose=position=>({position,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],generation:1,valid:true});
  for(const time of [0,.1])simulation.observe({time,session:budgetSession042,generation:1,listener:pose([0,0,1]),sources:[{id:'stock:review:engine',...pose([-1,0,1]),emitting:true}]});
  const control=simulation.update(.1,{geometryTimeMs:100});assert.equal(control.paths.length,1);assert.equal(control.paths[0].order,0);assert.equal(control.paths[0].coverageFallback,'conditional-direct-unknown-coverage');
  const observed=acousticScene(tile,base.materials,{...base.config,observationModel:{...base.observationModel,kind:'conditional-observed-model',mode:'historical-replay'}});assert.equal(pathGeometry(observed,[-1,0,1],[0,0,1],[]).status,'unknown','new fallback cannot weaken existing observed-geometry rules');
 }finally{world.close();f.close();}
});
