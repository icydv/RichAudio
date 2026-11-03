// Independent adversarial offline checks. All filesystem effects are confined to
// fresh temporary fixture directories; no installed resource is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {ResourceTileStore04,encodeResourceTile04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';

const fixture=()=>{const f=worldResources04();return {...f,qualified:qualifyResourceInventory04(f.inventory)};};
async function cleanup(root){const resolved=path.resolve(root),temporary=path.resolve(os.tmpdir());assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('richaudio-world04-review-'));await fs.rm(resolved,{recursive:true,force:true});}

test('review: a permanently unknown nearest tile cannot starve progressive supported preparation',async()=>{
 const f=fixture(),override={...structuredClone(f.inventory.resources[0]),id:'unqualified-winning-west',mount:'custom',supported:false};f.inventory.resources.push(override);
 const builder=new ResourceTileBuilder04({...f,inventory:qualifyResourceInventory04(f.inventory)});
 try{for(let i=0;i<3&&!builder.resident.has('east');i++)await builder.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(builder.resident.has('east'),true);assert.equal(builder.resident.has('west'),false);assert.equal(builder.contexts().some(c=>c.tileId==='west'),false);}
 finally{await builder.close();}
});

test('review: independent store instances cannot exceed their shared directory quota',async()=>{
 const f=fixture(),builder=new ResourceTileBuilder04({...f,inventory:f.qualified});const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-review-')),directory=path.join(root,'.local','cache');await fs.mkdir(directory,{recursive:true});
 try{await builder.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:2});const stores=[new ResourceTileStore04(root,directory,{maximumFiles:1}),new ResourceTileStore04(root,directory,{maximumFiles:1})];
  const result=await Promise.allSettled(f.qualified.tilePlans.map((p,i)=>stores[i].publish(p,builder.resident.get(p.tileId).tile)));
  assert.equal(result.filter(r=>r.status==='fulfilled'&&r.value.published).length,1,JSON.stringify(result.map(r=>r.status==='rejected'?{status:r.status,reason:r.reason.message}:r)));const files=await fs.readdir(directory);assert.equal(files.filter(n=>n.endsWith('.raworld04')).length,1);await stores[0].usage();
 }finally{await builder.close();await cleanup(root);}
});

test('review: linked cache root and hard-linked payloads are rejected before decoding',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-review-')),directory=path.join(root,'.local','cache'),outside=path.join(root,'outside');await fs.mkdir(directory,{recursive:true});await fs.mkdir(outside);
 try{await fs.symlink(outside,path.join(root,'.local','linked'),'junction');assert.throws(()=>new ResourceTileStore04(root,path.join(root,'.local','linked')),/linked/);
  await fs.writeFile(path.join(directory,'first'),'fixture');await fs.link(path.join(directory,'first'),path.join(directory,'second'));const store=new ResourceTileStore04(root,directory);await assert.rejects(store.usage(),/regular|linked/);
 }finally{await cleanup(root);}
});

test('review: inventory replacement during cache IO is refused and close joins before publication',async()=>{
 const f=fixture(),source=new ResourceTileBuilder04({...f,inventory:f.qualified});await source.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});const tile=source.resident.get('west').tile;let release;
 const store={load:()=>new Promise(resolve=>release=()=>resolve({state:'cached-original-resource-fixture',tile}))},builder=new ResourceTileBuilder04({...f,inventory:f.qualified,store});
 try{const pending=builder.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.throws(()=>builder.updateInventory(f.qualified),/idle/);await assert.rejects(builder.prepareNearby({listenerAnchor:[4,0,1]}),/idle/);
  const joined=builder.close();release();const result=await pending;await joined;assert.equal(result.state,'cancelled');assert.equal(builder.resident.size,0);assert.equal(builder.stats.workersStarted,0);
 }finally{await builder.close();await source.close();}
});

test('review: rehashed finite replacement geometry cannot acquire cache derivation authority',async()=>{
 const f=fixture(),source=new ResourceTileBuilder04({...f,inventory:f.qualified}),root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-review-')),directory=path.join(root,'.local','cache');await fs.mkdir(directory,{recursive:true});
 const store=new ResourceTileStore04(root,directory);let builder;
 try{await source.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});const original=source.resident.get('west').tile,forged=structuredClone(original);
  forged.engineTile=createTile({...forged.engineTile,surfaces:forged.engineTile.surfaces.map(s=>({...s,half:s.half.map(h=>h*.5),...(s.footprint?{footprint:s.footprint.map(p=>p.map(v=>v*.5))}:{})}))});const {tileDigest,...body}=forged;forged.tileDigest=digest(body);
  // Every ordinary byte/content checksum is recomputed. Dependency identities
  // remain the original ones, while the actual finite collision shape differs.
  await fs.writeFile(store.file(f.qualified.tilePlans[0]),encodeResourceTile04(f.qualified.tilePlans[0],forged));builder=new ResourceTileBuilder04({...f,inventory:f.qualified,store,trustedArtifacts:source.artifactBindings()});const result=await builder.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});
  assert.equal(builder.resident.has('west'),false,JSON.stringify(result));assert.equal(result.results[0].state,'cache-rejected');
 }finally{await builder?.close();await source.close();await cleanup(root);}
});

test('review: warm-cache movement across nine resource tiles keeps at most eight residents',async()=>{
 const f=worldResources04();for(let index=2;index<9;index++){
  const tileId='area'+index,x=index*8-4,names=f.group(tileId,x);
  f.inventory.tiles.push({tileId,bounds:{min:[x-4,-8,-4],max:[x+4,8,8]},bindings:[{archetypeHash:123456789,resourceId:names.ybn,basis:'authored-fixture'}],materialTable:structuredClone(f.inventory.tiles[0].materialTable)});
 }
 const inventory=qualifyResourceInventory04(f.inventory),root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world04-review-')),directory=path.join(root,'.local','cache');await fs.mkdir(directory,{recursive:true});const store=new ResourceTileStore04(root,directory);let builder=new ResourceTileBuilder04({...f,inventory,store});
 try{
  const visit=async()=>{for(const plan of inventory.tilePlans){await builder.prepareNearby({listenerAnchor:plan.bounds.min.map((n,i)=>(n+plan.bounds.max[i])/2),maximumTiles:1,radius:0});assert.ok(builder.resident.size<=8);}};
  await visit();const trustedArtifacts=builder.artifactBindings();assert.equal(Object.keys(trustedArtifacts).length,9);await builder.close();builder=new ResourceTileBuilder04({...f,inventory,store,trustedArtifacts});await visit();assert.equal(builder.stats.cacheHits,9);assert.equal(builder.stats.workersStarted,0);assert.equal(builder.resident.size,8);assert.equal(builder.resident.has('west'),false);
 }finally{await builder.close();await cleanup(root);}
});
