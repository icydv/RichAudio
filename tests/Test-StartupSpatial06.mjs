import test from 'node:test';
import assert from 'node:assert/strict';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {sealStartupCatalogue06} from '../src/acoustics/world/startup-catalogue06.mjs';
import {createStartupSpatialIndex06,encodeStartupSpatialIndex06,restoreStartupSpatialIndex06,selectPreparedStartupTiles06,startupCorridorIntersects06} from '../src/acoustics/world/startup-spatial06.mjs';
const seal=f=>sealStartupCatalogue06({catalogueId:f.catalogueId,pages:f.pages.map(({pageId,inventory})=>({pageId,inventory})),discovery:f.discovery});
test('persistable spatial metadata rebinds only to exact qualified catalogue and cannot invent geometry',()=>{
 const f=startupWorld06(),catalogue=seal(f),index=createStartupSpatialIndex06(catalogue),bytes=encodeStartupSpatialIndex06(index);assert.equal(index.tileCount,12);assert.equal(index.metadataOnly,true);assert.equal(restoreStartupSpatialIndex06(bytes,catalogue),index);assert.equal(createStartupSpatialIndex06(catalogue),index);const bad=Buffer.from(bytes);bad[bad.length-2]^=1;assert.throws(()=>restoreStartupSpatialIndex06(bad,catalogue),/derivation/);
 const changed=seal(startupWorld06({changedYbn:true}));assert.throws(()=>restoreStartupSpatialIndex06(bytes,changed),/derivation/);assert.throws(()=>createStartupSpatialIndex06({...catalogue}),/qualified/);assert.equal(index.triangles,undefined);
});
test('nearby and intervening corridor cache selection uses the prepared global index without visits or rebuilding',async()=>{
 assert.equal(startupCorridorIntersects06({from:[0,0,0],to:[1e-13,0,0],region:{min:[5e-14,-1,-1],max:[2e-13,1,1]}}),true);assert.equal(startupCorridorIntersects06({from:[0,2,0],to:[1e-13,2,0],region:{min:[5e-14,-1,-1],max:[2e-13,1,1]}}),false);
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);try{await c.run();const before=c.snapshot().workersStarted,visited=new Set(),remote=f.locations.at(-1),near=selectPreparedStartupTiles06(c,{listener:remote.listener,radius:5});assert.equal(visited.size,0);assert.equal(near.selected[0].tileId,remote.tileId);assert.equal(near.selected.length,1);assert.equal(near.conversionWorkersStarted,0);assert.equal(near.geometryAuthority,false);assert.equal(c.snapshot().workersStarted,before);assert(near.candidateCount<12);
  const corridor=selectPreparedStartupTiles06(c,{listener:f.locations[0].listener,sources:[f.locations[3].source],radius:5});assert(corridor.selected.some(t=>t.tileId==='declared-01'));assert(corridor.selected.some(t=>t.tileId==='declared-02'));assert.equal(corridor.unknownOutsideSelected,true);assert(corridor.visitedCellCount<32768);const loaded=await c.loadPrepared(near.selected[0]);assert.equal(loaded.state,'prepared-cache-hit');assert.equal(loaded.conversionWorkers,0);
 }finally{await h.close();}
});
test('unprepared and omitted cache windows are explicit and no renderer authority follows from empty selection',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);try{const pending=selectPreparedStartupTiles06(c,{listener:f.locations[0].listener,radius:5});assert.equal(pending.selected.length,0);assert.equal(pending.unpreparedRelevantTiles,1);assert.equal(pending.unknownOutsideSelected,true);await c.run();const limited=selectPreparedStartupTiles06(c,{listener:f.locations[0].listener,sources:[f.locations[5].source],radius:5,maximumTiles:2});assert.equal(limited.selected.length,2);assert(limited.omittedPreparedTiles>0);assert.throws(()=>selectPreparedStartupTiles06(c,{listener:[0,0,0],sources:[[3000,0,0]]}),/corridor length/);assert.throws(()=>selectPreparedStartupTiles06(c,{listener:[0,0,0],maximumTiles:9}),/bounded/);
 }finally{await h.close();}
});
