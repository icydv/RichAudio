import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {qualifyResourceInventory04,resourceInvalidation04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {ResourceTileStore04,decodeResourceTile04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {composeSceneUnion03} from '../src/acoustics/world/scene-union03.mjs';
const setup=()=>{const fixture=worldResources04();return {...fixture,qualified:qualifyResourceInventory04(fixture.inventory)};};
async function cleanup(root){const absolute=path.resolve(root),base=path.resolve(os.tmpdir());assert(absolute.startsWith(base+path.sep)&&/^richaudio-world04-[^\\/]+$/.test(path.basename(absolute)));await fs.rm(absolute,{recursive:true,force:true});}
test('qualified explicit base/DLC/custom winners retain missing and unsupported geometry without base fallback',()=>{
 const f=setup();const same=structuredClone(f.inventory.resources[0]);same.id='custom-map';same.mount='custom';same.supported=false;f.inventory.resources.push(same);const inv=qualifyResourceInventory04(f.inventory);assert.equal(inv.effective.find(r=>r.path===same.path).id,'custom-map');assert(inv.tilePlans[0].unknown.some(r=>r.reason==='unsupported-winning-resource'));assert.equal(inv.tilePlans[1].unknown.length,0);
 const missing=setup();missing.inventory.resources=missing.inventory.resources.filter(r=>r.id!=='west-type');assert(qualifyResourceInventory04(missing.inventory).tilePlans[0].unknown.some(r=>r.reason==='missing-resource-dependency'));
 same.deleted=true;assert(qualifyResourceInventory04(f.inventory).tilePlans[0].unknown.some(r=>r.reason==='deleted-winning-resource'));
});
test('tile dependency keys survive unrelated change and invalidate override, bounds, binding and parser changes',()=>{
 const a=setup(),b=worldResources04();b.inventory.resources.find(r=>r.id==='west-map').sha256='f'.repeat(64);const next=qualifyResourceInventory04(b.inventory);assert.deepEqual(resourceInvalidation04(a.qualified,next).map(r=>r.valid),[false,true]);assert.equal(a.qualified.tilePlans[1].worldDigest,next.tilePlans[1].worldDigest);
 for(const mutate of [x=>x.tiles[0].bindings[0].resourceId='other',x=>x.tiles[0].bounds.min[0]=-9,x=>x.parser.sha256='a'.repeat(64)]){const c=worldResources04();mutate(c.inventory);assert.equal(resourceInvalidation04(a.qualified,qualifyResourceInventory04(c.inventory))[0].valid,false);}
 const order=worldResources04();order.inventory.mounts[1].order=0;assert.throws(()=>qualifyResourceInventory04(order.inventory),/unambiguous/);
});
test('unknown scope, cyclic closure and installed metadata remain explicitly unqualified',async()=>{
 const f=worldResources04();f.inventory.resources[0].scopeTiles=null;assert(qualifyResourceInventory04(f.inventory).tilePlans.every(p=>p.unknown.some(u=>u.reason==='unknown-resource-spatial-scope')));
 const cycle=worldResources04();cycle.inventory.resources[1].dependencies=['west.ymap'];assert(qualifyResourceInventory04(cycle.inventory).tilePlans[0].unknown.some(u=>u.reason==='cyclic-resource-dependency'));
 const real=worldResources04();real.inventory.origin='separately-authorized-installed-metadata';const b=new ResourceTileBuilder04({...real,inventory:qualifyResourceInventory04(real.inventory)});try{const r=await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'unqualified');assert.equal(b.stats.workersStarted,0);assert.equal(b.contexts().length,0);}finally{await b.close();}
});
test('original resource tiles persist, reload on restart and join existing scene worker contexts',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-')),dir=path.join(root,'.local','cache');await fs.mkdir(dir,{recursive:true});const f=setup(),store=new ResourceTileStore04(root,dir);let b=new ResourceTileBuilder04({...f,inventory:f.qualified,store});
 try{let r=await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'prepared',JSON.stringify(r));assert.equal(b.stats.workersStarted,b.stats.workersJoined);r=await b.prepareNearby({listenerAnchor:[4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'prepared');const contexts=b.contexts();assert.equal(contexts.length,2);const union=composeSceneUnion03({contexts,session:f.session,worldDigest:f.qualified.inventoryDigest,generation:1,listenerAnchor:[-4,0,1],geometryTimeMs:0});assert.equal(union.scene.tile.surfaces.length,2);assert.equal(union.metadata.pcmQueueFramesAdded,0);await b.close();
 const trustedArtifacts=b.artifactBindings();b=new ResourceTileBuilder04({...f,session:'5'.repeat(32),inventory:f.qualified,store,trustedArtifacts});r=await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'cached-original-resource-fixture');assert.equal(b.stats.workersStarted,0);assert.equal(b.stats.cacheHits,1);assert.equal(b.contexts()[0].scene.tile.session,'5'.repeat(32));const bytes=await fs.readFile(store.file(f.qualified.tilePlans[0]));bytes[bytes.length-1]^=1;assert.throws(()=>decodeResourceTile04(f.qualified.tilePlans[0],bytes),/checksum/);
 }finally{await b.close();await cleanup(root);}
});
test('worker cancellation and timeout join before publication; resident unaffected plans survive inventory change',async(t)=>{
 const f=setup(),b=new ResourceTileBuilder04({...f,inventory:f.qualified});try{await b.prepareNearby({listenerAnchor:[4,0,1],maximumTiles:1});const old=b.resident.get('east');const changed=worldResources04();changed.inventory.resources[0].sha256='f'.repeat(64);const next=qualifyResourceInventory04(changed.inventory);assert.deepEqual(b.updateInventory(next,changed.inputs).retainedTileIds,['east']);assert.equal(b.resident.get('east'),old);
 const c=new AbortController(),pending=b.prepareNearby({listenerAnchor:[-4,0,1],signal:c.signal});c.abort();await assert.rejects(pending,/exact supplied/); // Binding rejection precedes worker creation.
 b.updateInventory(f.qualified,f.inputs);const a=new AbortController(),work=b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1,signal:a.signal});a.abort();assert.equal((await work).state,'cancelled');assert.equal(b.resident.has('west'),false);assert.equal(b.stats.workersStarted,b.stats.workersJoined);
 t.mock.timers.enable({apis:['setTimeout']});const timeout=b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1,budgetMilliseconds:1});t.mock.timers.tick(1);assert.equal((await timeout).state,'budget-exceeded');assert.equal(b.stats.workersStarted,b.stats.workersJoined);
 }finally{await b.close();}
});
test('private store rejects links, quota excess and corrupt existing packets without rebuilding under the same key',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-')),dir=path.join(root,'.local','cache');await fs.mkdir(dir,{recursive:true});const f=setup(),store=new ResourceTileStore04(root,dir);const b=new ResourceTileBuilder04({...f,inventory:f.qualified,store});try{await fs.writeFile(store.file(f.qualified.tilePlans[0]),'corrupt');const r=await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'cache-rejected');assert.equal(b.stats.workersStarted,0);assert.equal(b.contexts().length,0);assert.throws(()=>new ResourceTileStore04(root,path.join(root,'outside')),/private/);await fs.writeFile(path.join(dir,'oversize'),Buffer.alloc(524449));await assert.rejects(store.usage(),/bounded|regular/);}finally{await b.close();await cleanup(root);}
});
test('unbound cache checksum requires fresh worker derivation before the artifact may become resident',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-')),dir=path.join(root,'.local','cache');await fs.mkdir(dir,{recursive:true});const f=setup(),store=new ResourceTileStore04(root,dir);let b=new ResourceTileBuilder04({...f,inventory:f.qualified,store});try{await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});const first=b.artifactBindings();await b.close();assert.equal((await store.load(f.qualified.tilePlans[0])).state,'cache-needs-independent-derivation');b=new ResourceTileBuilder04({...f,inventory:f.qualified,store});const r=await b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'prepared');assert.equal(b.stats.workersStarted,1);assert.equal(b.stats.cacheHits,0);assert.deepEqual(b.artifactBindings(),first);}finally{await b.close();await cleanup(root);}
});
test('abort during final cache publication cannot publish a resident scene or artifact binding',async()=>{
 const f=setup();let publishStarted,release;const started=new Promise(r=>publishStarted=r),wait=new Promise(r=>release=r),store={load:async()=>({tile:null}),publish:async()=>{publishStarted();await wait;return {published:true};}};const b=new ResourceTileBuilder04({...f,inventory:f.qualified,store});try{const c=new AbortController(),pending=b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1,signal:c.signal});await started;c.abort();release();const r=await pending;assert.equal(r.state,'cancelled');assert.equal(b.resident.size,0);assert.deepEqual(b.artifactBindings(),{});assert.equal(b.stats.workersStarted,b.stats.workersJoined);}finally{release();await b.close();}
});
test('oversized decoded resource DTO is rejected before cloning or worker creation',async()=>{
 const f=setup(),packet=f.inputs.decodedResources['west-map'];packet.decodedJson='x'.repeat(16777217);const b=new ResourceTileBuilder04({...f,inventory:f.qualified});try{await assert.rejects(b.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1}),/before cloning/);assert.equal(b.stats.workersStarted,0);assert.equal(b.preparing,false);}finally{await b.close();}
});
