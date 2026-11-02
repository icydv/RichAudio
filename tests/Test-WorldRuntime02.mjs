import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SpatialTileIndex02,StaticWorldRuntime02,DynamicWorldOverlay02,composeDynamicWorldScene02,dynamicSceneMetadata02} from '../src/acoustics/world/runtime02.mjs';
import {StaticFixtureTileStore} from '../src/acoustics/world/static-cache.mjs';
import {fixtureWorld,resource} from './fixtures/StaticWorld01.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';

test('a ten-thousand-tile index visits bounded neighboring cells rather than the entire world',()=>{
 const entries=[];for(let x=0;x<100;x++)for(let y=0;y<100;y++)entries.push({tileId:`tile:${x}:${y}`,bounds:{min:[x*128,y*128,0],max:[x*128+120,y*128+120,8]}});
 const index=new SpatialTileIndex02(entries),query=index.nearby([1,1,1]);assert.equal(query.indexed,10000);assert.equal(query.entries[0].tileId,'tile:0:0');assert(query.referencesVisited<16);assert(query.cellsVisited<=27);assert(query.candidates<16);
 assert.throws(()=>new SpatialTileIndex02([...entries,entries[0]]),/duplicate/);
 assert.throws(()=>new SpatialTileIndex02(Array.from({length:129},(_,i)=>({...entries[0],tileId:'overlap:'+i}))),/overlap/);
 const priority=index.nearby([129,129,1],{sources:[[1,1,1]],maximum:1});assert.equal(priority.entries[0].tileId,'tile:1:1','listener tile takes precedence over a lexically earlier source tile');
});

test('nearby preparation uses the existing joined worker, keeps prior qualified tiles while loading and invalidates on override',async()=>{
 const original=fixtureWorld(),runtime=new StaticWorldRuntime02(original);assert.equal(runtime.current(),null);
 const first=await runtime.prepareNearby({listener:[0,0,1],maximumTiles:1});assert.equal(first.state,'prepared');assert.equal(first.workerJoined,true);assert.equal(first.audioBuffersAdded,0);const before=runtime.current();
 const next=runtime.prepareNearby({listener:[90,90,1],maximumTiles:1});assert.equal(runtime.current(),before,'map loading does not reset current immutable scene');const far=await next;assert.equal(far.state,'prepared');assert.equal(far.prepared.tileIds[0],'far');
 const modified=fixtureWorld('wall',{moved:1}),changing=runtime.invalidate(modified);assert.equal(runtime.current(),null,'invalidation withdraws old geometry immediately');await changing;assert.equal(runtime.resident.size,0);const changed=await runtime.prepareNearby({listener:[0,0,1],maximumTiles:1});assert.notEqual(changed.prepared.worldDigest,before.worldDigest);assert.equal(runtime.stats.audioBuffersAdded,0);
 await runtime.close();assert.equal(runtime.current(),null);assert.equal(runtime.active,null);
});

test('cancel/invalidate joins in-flight preparation without publishing an old world',async()=>{
 const runtime=new StaticWorldRuntime02(fixtureWorld()),pending=runtime.prepareNearby({listener:[0,0,1],maximumTiles:1}),change=runtime.invalidate(fixtureWorld('open'));await change;const old=await pending;assert(['cancelled','cancelled-or-invalidated'].includes(old.state));assert.equal(runtime.active,null);assert.equal(runtime.current(),null);
 const next=await runtime.prepareNearby({listener:[0,0,1],maximumTiles:1});assert.equal(next.prepared.scene.tile.surfaces.length,0);await runtime.close();
});

test('noncontiguous cached tiles cannot turn their unprepared union gap into verified clear space',async()=>{
 const runtime=new StaticWorldRuntime02(fixtureWorld('open'));const result=await runtime.prepareNearby({listener:[10,10,1],sources:[[90,90,1]],maximumTiles:2});
 assert.equal(result.state,'prepared');assert.equal(runtime.resident.size,2);assert.deepEqual(result.prepared.tileIds,['local']);assert.equal(result.prepared.scene.tile.bounds.max[0],16);
 assert.throws(()=>querySegment(result.prepared.scene.tile,[40,40,1],[41,40,1]),/extent/);assert.equal(result.prepared.coverage,'selected-known-static-fixture-tiles');await runtime.close();
});

test('an unsupported winning primary resource remains unprepared rather than a qualified empty tile',async()=>{
 const unknown=resource('unsupported-winner','placements',{entities:[]},{path:'base-map.json',order:10,scopeTiles:['local'],format:'binary-ymap-unimplemented'}),runtime=new StaticWorldRuntime02(fixtureWorld('wall',{extraResources:[unknown]}));
 const result=await runtime.prepareNearby({listener:[0,0,1],maximumTiles:1});assert.equal(result.state,'unprepared-or-unknown');assert.deepEqual(result.unknown,['local']);assert.equal(runtime.current(),null);await runtime.close();
});

test('persistent cache IO stays on async preparation and a matching tile is reloaded without a worker',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudioWorld02-'));fs.mkdirSync(path.join(root,'.local'));const dir=fs.mkdtempSync(path.join(root,'.local','tiles-'));
 try{const store=new StaticFixtureTileStore(root,dir),world=fixtureWorld(),first=new StaticWorldRuntime02({...world,store});await first.prepareNearby({listener:[0,0,1],maximumTiles:1});const keys={...first.cacheKeys};await first.close();const second=new StaticWorldRuntime02({...world,store,cacheKeys:keys}),result=await second.prepareNearby({listener:[0,0,1],maximumTiles:1});assert.equal(result.state,'prepared');assert.equal(second.stats.cachedLoads,1);assert.equal(second.stats.workerLoads,0);assert.equal(second.stats.audioBuffersAdded,0);await second.close();}
 finally{assert.equal(path.dirname(root),os.tmpdir());assert(path.basename(root).startsWith('RichAudioWorld02-'));fs.rmSync(root,{recursive:true,force:true});}
});

test('door/destruction overlay is separate; expired or moving geometry becomes unknown instead of a restored closed door',async()=>{
 const session='c'.repeat(32),runtime=new StaticWorldRuntime02({...fixtureWorld(),session});await runtime.prepareNearby({listener:[0,0,1],maximumTiles:1});const prepared=runtime.current(),base=prepared.scene.tile.surfaces[0],originalKey=prepared.scene.geometryKey;
 const overlay=new DynamicWorldOverlay02({session,worldDigest:prepared.worldDigest,staticGeneration:prepared.generation});
 const input={authority:'original-authored-dynamic-fixture',session,worldDigest:prepared.worldDigest,staticGeneration:prepared.generation,sequence:0,objectId:'door',objectGeneration:1,
  state:'closed-static',observedFrame:0,validThroughFrame:12000,region:{min:[-13,3,-2],max:[13,5,8]},removes:[base.id],panels:[{...base,id:'door-panel'}],materials:{'door-panel':{reflection:[.6,.4,.2],transmission:[0,0,0],basis:'authored-assumption',reference:'authored-door02'}}};
 overlay.accept(input,0);const closed=composeDynamicWorldScene02(prepared,overlay.snapshot(0),0);assert.equal(querySegment(closed.tile,[0,3,1],[0,5,1]).hits.length,1);
 overlay.accept({...input,sequence:1,observedFrame:512,validThroughFrame:12512,state:'open',panels:[]},512);const open=composeDynamicWorldScene02(prepared,overlay.snapshot(512),512);assert.equal(querySegment(open.tile,[0,3,1],[0,5,1]).hits.length,0);
 const finalSnapshot=overlay.snapshot(12512),expired=composeDynamicWorldScene02(prepared,finalSnapshot,12512);assert.equal(querySegment(expired.tile,[0,3,1],[0,5,1]).unknown.length,1);assert.equal(querySegment(expired.tile,[0,3,1],[0,5,1]).visibility,'unknown');assert.equal(expired.tile.surfaces.length,0);assert.equal(dynamicSceneMetadata02(expired).unknownObjects,1);
 assert.equal(prepared.scene.geometryKey,originalKey);assert.equal(prepared.scene.tile.surfaces.length,1);assert.equal(dynamicSceneMetadata02(open).staticCacheModified,false);
 assert.throws(()=>overlay.accept({...input,sequence:2,observedFrame:0},512),/clock/);assert.throws(()=>overlay.snapshot(512),/clock/);assert.throws(()=>composeDynamicWorldScene02(prepared,{...finalSnapshot},12512),/exact/);
 await runtime.close();
});
