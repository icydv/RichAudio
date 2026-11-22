// Independent adversarial controls for startup storage, using new original
// packets and private test directories only. No installed source is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {StartupTileStoreRouter06} from '../src/acoustics/world/startup-tile-store06.mjs';
import {ResourceTileStore04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';
import {worldResources04} from './fixtures/WorldResources04.mjs';
async function temporary(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-storage06-review-'));try{return await fn(root);}finally{const absolute=path.resolve(root);assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));assert(/^richaudio-storage06-review-[^\\/]+$/.test(path.basename(absolute)));await fs.rm(absolute,{recursive:true,force:true});}}
async function prepared(root,options={}){const f=worldResources04(),inventory=qualifyResourceInventory04(f.inventory),directory=path.join(root,'.local','tiles'),router=new StartupTileStoreRouter06({root,directory,...options}),builder=new ResourceTileBuilder04({inventory,inputs:f.inputs,store:router,session:f.session});try{const r=await builder.prepareNearby({listenerAnchor:[-4,0,1],maximumTiles:1});assert.equal(r.results[0].state,'prepared',JSON.stringify(r));return {router,plan:inventory.tilePlans[0],artifact:builder.artifactBindings()[inventory.tilePlans[0].planDigest],directory};}finally{await builder.close();}}

test('accepted maximum version configuration routes through existing cache04 limits without promoting self-hashed artifacts',()=>temporary(async root=>{
 const {router,plan,artifact}=await prepared(root,{maximumVersionsPerTile:64});
 try{const untrusted=await router.load(plan);assert.equal(untrusted.tile,null);assert.equal(untrusted.state,'cache-needs-independent-derivation');assert.equal((await router.load(plan,{tileDigest:artifact})).tile.tileId,plan.tileId);await assert.rejects(router.load(plan,{tileDigest:'f'.repeat(64)}),/independent expected/);}finally{await router.close();}
}));

test('router closure cannot report completion while an owned cache read remains active',()=>temporary(async root=>{
 const {router,plan,artifact,directory}=await prepared(root),original=ResourceTileStore04.prototype.load;let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 ResourceTileStore04.prototype.load=async function(...args){if(this.directory.startsWith(directory+path.sep)){started();await gate;}return original.apply(this,args);};
 try{const work=router.load(plan,{tileDigest:artifact});await entered;await assert.rejects(router.close(),/read|active|join|operation/);assert.equal(router.closed,false);release();assert.equal((await work).tile.tileId,plan.tileId);await router.close();assert.equal(router.closed,true);}finally{release();ResourceTileStore04.prototype.load=original;if(!router.closed)await router.close();}
}));

test('restart remeasures aggregate disk quota, retains interrupted evidence and fails before loading geometry',()=>temporary(async root=>{
 const {router,plan,artifact,directory}=await prepared(root);await router.close();const shard=path.join(directory,digest({kind:'RichAudioStableTileShard06',tileId:plan.tileId})),orphan=path.join(shard,'original-retained-interruption.pending');await fs.writeFile(orphan,Buffer.alloc(524448,3));
 const restarted=new StartupTileStoreRouter06({root,directory,maximumBytes:524448});try{await assert.rejects(restarted.load(plan,{tileDigest:artifact}),/aggregate disk quota/);assert.equal((await fs.stat(orphan)).size,524448);assert.equal(restarted.diagnostics().automaticDeletion,false);assert.equal(restarted.diagnostics().geometryResidentInRouter,0);}finally{await restarted.close();}
}));
