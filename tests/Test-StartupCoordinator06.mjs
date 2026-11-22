import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {sealStartupCatalogue06,boundedStartupMetadata06} from '../src/acoustics/world/startup-catalogue06.mjs';
import {StartupAcousticCoordinator06} from '../src/acoustics/world/startup-coordinator06.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {digest,canonical,byteDigest} from '../src/acoustics/world/contracts.mjs';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {admittedOriginalXml05} from './fixtures/AdmittedXml05.mjs';
import {xmlInventory05} from '../src/acoustics/world/xml-building05.mjs';
import {StartupTileStoreRouter06} from '../src/acoustics/world/startup-tile-store06.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
const never=()=>new Promise(()=>{}),tick=()=>new Promise(r=>setImmediate(r));
function fixture(){const f=startupWorld06();f.pages=f.pages.slice(0,1);return f;}
function seal(f){return sealStartupCatalogue06({catalogueId:f.catalogueId,pages:f.pages.map(({pageId,inventory})=>({pageId,inventory})),discovery:f.discovery});}
function memory(){const values=new Map();return {load:async pin=>values.get(pin)??null,save:async value=>{const bytes=Buffer.from(canonical(value)),sha256=byteDigest(bytes);values.set(sha256,structuredClone(value));return {sha256,bytes:bytes.length};}};}
const emptyStore={load:async()=>({state:'not-cached',tile:null}),publish:async()=>({published:false})};
function coordinator(f,options={}){return new StartupAcousticCoordinator06({catalogue:seal(f),pageProvider:f.pageProvider,checkpoint:memory(),storeForPage:async()=>emptyStore,session:f.session,...options});}
function oldCheckpoint(f){const c=seal(f);return {schema:1,kind:'RichAudioStartupCheckpoint06',catalogueId:c.catalogueId,catalogueDigest:c.catalogueDigest,build:c.build,cacheRevision:'resource-cache04',pages:c.pages.map(p=>({pageId:p.pageId,inventoryDigest:p.inventoryDigest,artifacts:Object.fromEntries(p.tiles.map(t=>[t.planDigest,'f'.repeat(64)]))}))};}
test('catalogue stores bounded metadata only; dense data, exact UTF8 caps and global identities fail closed',async()=>{
 const f=fixture(),c=seal(f);assert.equal(c.totalTiles,4);assert.equal(c.pages[0].inventory,undefined);assert.equal(c.pages[0].inputs,undefined);assert.equal(c.installedWorldVerified,false);assert.equal(c.pages[0].tiles[0].dependencyIds.length,3);
 for(const value of ['é'.repeat(4),'\u0000'.repeat(2),'\ud800'.repeat(2),'😀'.repeat(2)])assert.throws(()=>boundedStartupMetadata06(value,8),/UTF8/);
 for(const value of ['é','\u0000','\ud800','😀']){const bytes=Buffer.from(canonical(value));assert.equal(boundedStartupMetadata06(value,bytes.length).length,bytes.length);assert.throws(()=>boundedStartupMetadata06(value,bytes.length-1),/UTF8/);}
 const extra=[1,2];extra.hidden='not canonical';assert.throws(()=>boundedStartupMetadata06(extra),/dense/);assert.throws(()=>boundedStartupMetadata06(new Array(2)),/dense/);assert.throws(()=>boundedStartupMetadata06({get value(){throw Error('accessor must not execute');}}),/data properties/);
 assert.throws(()=>sealStartupCatalogue06({catalogueId:f.catalogueId,pages:[{pageId:'a',inventory:f.pages[0].inventory},{pageId:'b',inventory:f.pages[0].inventory}],discovery:f.discovery}),/unique catalogue tile/);
 const dishonest=startupWorld06();dishonest.pages[1].inventoryInput.mounts.find(m=>m.id==='base').order=4;dishonest.pages[1].inventory=qualifyResourceInventory04(dishonest.pages[1].inventoryInput);assert.throws(()=>seal(dishonest),/mount identity\/order/);
 const overlap=startupWorld06();overlap.pages[1].inventoryInput.tiles[0].bounds=structuredClone(overlap.pages[0].inventoryInput.tiles[0].bounds);overlap.pages[1].inventory=qualifyResourceInventory04(overlap.pages[1].inventoryInput);assert.throws(()=>seal(overlap),/overlapping tile interiors/);
 const tiny=startupWorld06();for(const p of tiny.pages.slice(0,2)){p.inventoryInput.tiles[0].bounds={min:[0,0,0],max:[Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE]};p.inventory=qualifyResourceInventory04(p.inventoryInput);}assert.throws(()=>seal(tiny),/overlapping tile interiors/,'subnormal bounds must not skip the broad-phase cells');
 const statusCoordinator=coordinator(f);try{statusCoordinator.snapshot=()=>{throw Error('single status lookup must not copy a world snapshot');};const row=statusCoordinator.tileStatus06({pageId:'page-0',tileId:'declared-00'});assert.equal(row.status,'pending');assert.equal(row.geometryCoverage,'unverified');assert.equal(row.artifactDigest,null);assert(Object.isFrozen(row));assert.equal(statusCoordinator.tileStatus06({pageId:'page-0',tileId:'absent'}),null);assert.throws(()=>statusCoordinator.tileStatus06({pageId:'../private',tileId:'x'}),/identifier/);}finally{await statusCoordinator.close();}
});
test('hung page provider returns a partial gate by deadline, quarantines its late result and never publishes it',async()=>{
 const f=fixture();let release,providerSignal;const c=coordinator(f,{pageProvider:(id,{signal})=>{providerSignal=signal;return new Promise(r=>release=r);}}),began=performance.now();
 const result=await c.run({budgetMilliseconds:1000,controlOperationMilliseconds:10});assert(performance.now()-began<500);assert.equal(result.readiness,'partial');assert.equal(result.controlClosureUnknown,true);assert.equal(result.unresolvedControlOperations,1);assert.equal(result.workersStarted,0);assert.equal(result.completedEligibleTiles,0);assert.equal(providerSignal.aborted,true);
 const closed=await c.close({budgetMilliseconds:5});assert.equal(closed.joinState,'bounded-return-closure-unknown');assert.equal(closed.providerOsClosureEstablished,false);release({inventory:f.pages[0].inventory,inputs:f.pages[0].inputs});await tick();await tick();assert.equal(c.snapshot().unresolvedControlOperations,0);assert.equal(c.snapshot().lateControlCompletions,1);assert.equal(c.snapshot().completedEligibleTiles,0);assert.equal(c.snapshot().pageLoads,0);
});
test('hung trusted checkpoint load is bounded and never replaced by self-inferred cache trust',async()=>{
 const f=fixture();let saves=0;const c=coordinator(f,{trustedCheckpointSHA256:'a'.repeat(64),checkpoint:{load:never,save:async()=>{saves++;throw Error('no fallback save');}}});
 const result=await c.run({budgetMilliseconds:1000,controlOperationMilliseconds:10});assert.equal(result.readiness,'partial');assert.equal(result.unresolvedControlOperations,1);assert.match(result.restoreWarning,/checkpoint-rejected/);assert.equal(result.workersStarted,0);assert.equal(saves,0);assert.equal((await c.close({budgetMilliseconds:5})).joinState,'bounded-return-closure-unknown');
});
test('hung source-buffer and store-provider operations stop without starting another worker or page',async()=>{
 for(const kind of ['store-provider','source-inputs']){const f=fixture(),c=coordinator(f,kind==='store-provider'?{storeForPage:never}:{pageProvider:async()=>({inventory:f.pages[0].inventory,loadInputs:never})});const r=await c.run({controlOperationMilliseconds:10});assert.equal(r.readiness,'partial');assert.match(r.controlBoundaryFailure,new RegExp(kind));assert.equal(r.unresolvedControlOperations,1);assert.equal(r.workersStarted,0);assert.equal(r.checkpointWrites,0);await c.close({budgetMilliseconds:5});}
});
test('zero eligible tiles never report100percent or readiness; hung checkpoint save remains explicit',async()=>{
 const f=fixture();for(const r of f.pages[0].inventoryInput.resources)r.supported=false;f.pages[0].inventory=qualifyResourceInventory04(f.pages[0].inventoryInput);f.pageProvider=async()=>({inventory:f.pages[0].inventory});
 const c=coordinator(f,{checkpoint:{load:async()=>null,save:never}}),r=await c.run({controlOperationMilliseconds:10});assert.equal(r.eligibleTiles,0);assert.equal(r.percent,null);assert.equal(r.percentBasis,'no-supported-work');assert.equal(r.eligibleComplete,false);assert.equal(r.readiness,'partial');assert.equal(r.workersStarted,0);assert.match(r.checkpointError,/checkpoint-write-failed/);assert.equal(r.unresolvedControlOperations,1);await c.close({budgetMilliseconds:5});
});
test('pending cache queries exclude startup work and close returns bounded with unresolved provider closure',async()=>{
 const f=fixture(),old=oldCheckpoint(f);let entered;const started=new Promise(r=>entered=r),c=coordinator(f,{trustedCheckpointSHA256:'a'.repeat(64),checkpoint:{load:async()=>old,save:async()=>{throw Error('query cannot save');}},pageProvider:()=>{entered();return never();}});
 const pending=c.loadPrepared({pageId:'page-0',tileId:'declared-00',budgetMilliseconds:1000});await started;assert.equal(c.snapshot().pendingQueries,1);await assert.rejects(c.run(),/one bounded startup/);const closed=await c.close({budgetMilliseconds:10});assert.equal((await pending).state,'not-ready');assert.equal(closed.joinState,'bounded-return-closure-unknown');assert.equal(closed.unresolvedControlOperations,1);assert.equal(c.snapshot().pendingQueries,0);assert.equal(c.snapshot().workersStarted,0);
});
test('a hung prepared cache read is quarantined with no conversion fallback or acoustic context',async()=>{
 const f=fixture(),old=oldCheckpoint(f),c=coordinator(f,{trustedCheckpointSHA256:'a'.repeat(64),checkpoint:{load:async()=>old,save:never},storeForPage:async()=>({load:never,publish:never})});
 const r=await c.loadPrepared({pageId:'page-0',tileId:'declared-00',budgetMilliseconds:10});assert.equal(r.state,'cache-rejected');assert.equal(r.context,undefined);assert.equal(r.conversionWorkers,0);assert.equal(c.snapshot().unresolvedControlOperations,1);await c.close({budgetMilliseconds:5});
});
test('a corrupt persisted tile fails only its dependency and preserves a partial continue option',async()=>{
 const h=await startupHarness06(),f=fixture();try{const a=h.create(f),built=await a.run();assert.equal(built.completedEligibleTiles,4);await a.close();const plan=f.pages[0].inventory.tilePlans[0],file=path.join(h.root,'.local','tiles',digest({kind:'RichAudioStableTileShard06',tileId:plan.tileId}),plan.planDigest+'.raworld04');await fs.writeFile(file,Buffer.from('original deliberate corrupt cache control'));
  const c=h.create(f,{trustedCheckpointSHA256:built.checkpointSHA256}),r=await c.run();assert.equal(r.readiness,'partial');assert.equal(r.failedTiles,1);assert.equal(r.completedEligibleTiles,3);assert.equal(r.workersStarted,0);assert.equal(r.cacheHits,3);assert.equal(r.percent,75);assert.equal(c.continuePartially().continuePartiallySelected,true);assert.equal((await c.loadPrepared({pageId:'page-0',tileId:plan.tileId})).state,'cache-rejected');
 }finally{await h.close();}
});
test('processing100percent preserves trusted original partial-artifact gaps and unmapped reviewed XML coverage',async()=>{
 const h=await startupHarness06();let partialStore;try{
  const f=fixture(),first=h.create(f),initial=await first.run();await first.close();
  partialStore=new StartupTileStoreRouter06({root:h.root,directory:path.join(h.root,'.local','original-partial-artifacts')});const receipt=structuredClone(await h.checkpoint.load(initial.checkpointSHA256));
  for(const [index,plan]of f.pages[0].inventory.tilePlans.entries()){
   const row=initial.tiles.find(t=>t.tileId===plan.tileId),loaded=await h.router.load(plan,{tileDigest:row.artifactDigest});let tile=loaded.tile;
   if(index===0){
    // An explicitly AUTHORISED ORIGINAL partial-artifact fixture. The existing
    // single-tile importer rejects out-of-scene surfaces before clipping; this
    // is not represented as a successful native boundary conversion. The host
    // separately binds this conservative omitted-surface fixture in its trusted
    // checkpoint, rather than trusting a cache file's own checksum as authority.
    const {tileDigest,...body}=structuredClone(tile);body.engineTile=createTile({...body.engineTile,surfaces:[],coverage:'partial',missingRegions:[{id:'original-boundary-region06',bounds:plan.bounds,reason:'crossing-resource-surface'}]});body.materials={};body.unknown=[{resource:tile.engineTile.surfaces[0].id,reason:'tile-boundary-crossing-finite-surface-not-clipped'}];tile={...body,tileDigest:digest(body)};receipt.pages[0].artifacts[plan.planDigest]=tile.tileDigest;
   }
   await partialStore.publish(plan,tile);
  }
  const trusted=await h.checkpoint.save(receipt),partial=h.create(f,{trustedCheckpointSHA256:trusted.sha256,storeForPage:async()=>partialStore}),a=await partial.run();assert.equal(a.percent,100);assert.equal(a.eligibleComplete,true);assert.equal(a.readiness,'partial');assert.equal(a.geometryUnknownTiles,1);assert.equal(a.geometryUnknownRegions,1);assert.equal(a.geometryUnknownEntries,1);const row=a.tiles.find(t=>t.tileId==='declared-00');assert.equal(row.geometryCoverage,'partial');assert.deepEqual(row.geometryMissingRegions[0].bounds,row.bounds);await partial.close();
  const restart=h.create(f,{trustedCheckpointSHA256:a.checkpointSHA256,storeForPage:async()=>partialStore}),b=await restart.run();assert.equal(b.workersStarted,0);assert.equal(b.geometryUnknownTiles,1);assert.equal(b.readiness,'partial');const loaded=await restart.loadPrepared({pageId:'page-0',tileId:'declared-00'});assert.equal(loaded.state,'prepared-cache-hit');assert.equal(loaded.tile.engineTile.coverage,'partial');assert.equal(restart.snapshot().geometryUnknownTiles,1);
  // Original XML runs through the separately pinned review-policy lane solely
  // to prove its deliberately partial coverage cannot become a full-ready gate.
  const xml=admittedOriginalXml05({authority:'review-policy-bound-static-export'}),inventory=xmlInventory05(xml.admission),x={catalogueId:'original-reviewed-lane06',pages:[{pageId:'xml-page',inventory}],discovery:f.discovery,session:xml.session,pageProvider:async()=>({inventory,inputs:xml.inputs})};
  const reviewed=h.create(x),r=await reviewed.run();assert.equal(r.completedEligibleTiles,1);assert.equal(r.percent,100);assert.equal(r.geometryUnknownTiles,1);assert.equal(r.geometryUnknownRegions,0,'no fabricated location for unmapped partial coverage');assert.equal(r.geometryUnknownEntries,0);assert.equal(r.readiness,'partial');assert.equal(r.installedWorldVerified,false);
 }finally{await partialStore?.close();await h.close();}
});
