import test from 'node:test';
import assert from 'node:assert/strict';
import {createTile,coordinateSpace,querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createSceneTileContext03,composeSceneUnion03,sceneUnionMetadata03,encodeSceneTileContext03,decodeSceneTileContext03,encodeUnionResult03,decodeUnionResult03} from '../src/acoustics/world/scene-union03.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';
const session='3'.repeat(32),world='a'.repeat(64),binding=[{id:'original-ybn',sha256:'b'.repeat(64)}];
const region=(a,b)=>({min:[a,-8,-4],max:[b,8,8]});
function context(id,box,{surfaces=[],missing=[],worldDigest=world,layout='gen9-rsc7',until=60000,materials={},coverage='complete-synthetic'}={}){
 const tile=createTile({schemaVersion:1,id:'tile:'+id,coordinateSpace,timeUnit:'monotonic-ms',bounds:box,
  listenerAnchor:box.min.map((n,i)=>(n+box.max[i])/2),coverage,surfaces,missingRegions:missing,
  version:1,createdAt:0,validUntil:until,build:'world03-original-format-fixture',session,interior:'fixture',dynamicEpoch:1});
 return createSceneTileContext03({tileId:id,worldDigest,scene:acousticScene(tile,materials,{order:1,airDbPerMetre:[0,0,0]}),sourceBindings:binding,layout});
}
const request=contexts=>({contexts,session,worldDigest:world,generation:1,listenerAnchor:[-4,0,1],geometryTimeMs:0});
const panel=(id='boundary')=>({id,coordinateSpace,center:[0,0,1],normal:[1,0,0],u:[0,1,0],half:[4,2],motion:'static',reflectiveSide:'both',
 provenance:{kind:'synthetic',reference:'original-format-boundary'},confidence:1,version:1,observedAt:0,validUntil:60000,material:{observedId:null,observedConfidence:null,acoustic:null}});
const passive={reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-finite-fixture'};

test('adjacent selected resource volumes form one finite scene without source or audio-queue changes',()=>{
 const a=context('west',region(-8,0)),b=context('east',region(0,8));
 const result=composeSceneUnion03(request([b,a]));
 assert.deepEqual(result.metadata.tileIds,['east','west']);assert.equal(result.metadata.unknownRegions,0);
 assert.equal(querySegment(result.scene.tile,[-4,0,1],[4,0,1]).visibility,'clear');
 assert.equal(result.metadata.installedWorldVerified,false);assert.equal(result.metadata.sourceGenerationsModified,0);assert.equal(result.metadata.pcmQueueFramesAdded,0);
 assert.equal(sceneUnionMetadata03(result.scene),result.metadata);
 assert.deepEqual(result.scene.config,a.scene.config);
});

test('an unprepared gap stays unknown while paths wholly inside known input volumes remain qualified',()=>{
 const a=context('west',region(-8,-2)),b=context('east',region(2,8));
 const result=composeSceneUnion03(request([a,b]));assert.equal(result.metadata.unpreparedVolumes,1);
 assert.equal(querySegment(result.scene.tile,[-7,0,1],[-3,0,1]).visibility,'clear');
 const cross=querySegment(result.scene.tile,[-4,0,1],[4,0,1]);assert.equal(cross.visibility,'unknown');assert.equal(cross.unknown.length,1);
 assert.throws(()=>querySegment(result.scene.tile,[-9,0,1],[4,0,1]),/extent/);
});

test('existing unknown regions cannot disappear during union and partial source coverage never becomes complete',()=>{
 const hole={id:'unsupported-winning-map',bounds:{min:[-6,-2,0],max:[-3,2,2]},reason:'unsupported-layout'};
 const a=context('west',region(-8,0),{missing:[hole]}),b=context('east',region(0,8));
 const result=composeSceneUnion03(request([a,b]));assert.equal(result.metadata.unknownRegions,1);
 assert.equal(querySegment(result.scene.tile,[-7,0,1],[-2,0,1]).visibility,'unknown');
 const raw=structuredClone(encodeSceneTileContext03(a));raw.tile.coverage='partial';
 assert.throws(()=>decodeSceneTileContext03(raw),/drift/);
});

test('independent resource/world, layout, session and content identities reject substitution',()=>{
 const a=context('west',region(-8,0));
 assert.throws(()=>composeSceneUnion03(request([a,context('east',region(0,8),{worldDigest:'c'.repeat(64)})])),/matching/);
 assert.throws(()=>composeSceneUnion03(request([a,context('east',region(0,8),{layout:'legacy-rsc7'})])),/matching/);
 assert.throws(()=>composeSceneUnion03(request([a,a])),/unique/);
 assert.throws(()=>composeSceneUnion03({...request([a]),session:'4'.repeat(32)}),/matching/);
 assert.throws(()=>composeSceneUnion03(request([a,context('overlap',region(-1,8))])),/overlapping/);
 assert.throws(()=>composeSceneUnion03(request([{...a}])) ,/qualified/);
 const packet=structuredClone(encodeSceneTileContext03(a));packet.sourceBindings[0].sha256='d'.repeat(64);
 assert.throws(()=>decodeSceneTileContext03(packet),/drift/);
});

test('shared boundary geometry deduplicates by exact identity; conflicting material and coincident copies reject',()=>{
 const a=context('west',region(-8,0),{surfaces:[panel()],materials:{boundary:passive}}),
  b=context('east',region(0,8),{surfaces:[panel()],materials:{boundary:passive}});
 const result=composeSceneUnion03(request([a,b]));assert.equal(result.scene.tile.surfaces.length,1);
 assert.equal(querySegment(result.scene.tile,[-4,0,1],[4,0,1]).hits.length,1);
 const conflicting=context('east',region(0,8),{surfaces:[panel()],materials:{boundary:{...passive,reflection:[.4,.3,.2]}}});
 assert.throws(()=>composeSceneUnion03(request([a,conflicting])),/conflicting/);
 const duplicate=context('east',region(0,8),{surfaces:[panel('other-name')],materials:{'other-name':passive}});
 assert.throws(()=>composeSceneUnion03(request([a,duplicate])),/coincident/);
});

test('union horizon only contracts and raw worker results cannot substitute a geometry packet',()=>{
 const a=context('west',region(-8,0),{until:20}),b=context('east',region(0,8));
 const r=composeSceneUnion03({...request([a,b]),geometryTimeMs:10});assert.equal(r.scene.tile.validUntil,20);
 assert.throws(()=>composeSceneUnion03({...request([a,b]),geometryTimeMs:20}),/expired/);
 const expected={...request([a,b]),geometryTimeMs:10};
 const good=encodeUnionResult03(r);assert.equal(decodeUnionResult03(good,expected).scene.geometryKey,r.scene.geometryKey);
 const bad=structuredClone(good);bad.metadata.worldDigest='e'.repeat(64);assert.throws(()=>decodeUnionResult03(bad,expected),/checksum/);
 const promoted=structuredClone(good);promoted.metadata.authority='installed-live-world';const {packetDigest,...promotedBody}=promoted;promoted.packetDigest=digest(promotedBody);
 assert.throws(()=>decodeUnionResult03(promoted,expected),/promote/);
 assert.throws(()=>decodeUnionResult03(good),/qualified input contexts/);
 const expired=structuredClone(good);expired.metadata.geometryTimeMs=21;const {packetDigest:old,...expiredBody}=expired;expired.packetDigest=digest(expiredBody);
 assert.throws(()=>decodeUnionResult03(expired,expected),/horizon/);
});

test('a rechecksummed worker DTO cannot promote partial coverage or shorten a surface horizon',()=>{
 const partial=context('west',region(-8,0),{coverage:'partial'}),input=request([partial]);
 const result=composeSceneUnion03(input),promoted=structuredClone(encodeUnionResult03(result));
 promoted.tile.coverage='complete-synthetic';const {packetDigest,...body}=promoted;promoted.packetDigest=digest(body);
 assert.throws(()=>decodeUnionResult03(promoted,input),/does not derive/);
 const withWall=context('west',region(-8,0),{surfaces:[panel()],materials:{boundary:passive}}),wallInput=request([withWall]);
 const shortened=structuredClone(encodeUnionResult03(composeSceneUnion03(wallInput)));shortened.tile.surfaces[0].validUntil=1;
 const {packetDigest:old,...shortenedBody}=shortened;shortened.packetDigest=digest(shortenedBody);
 assert.throws(()=>decodeUnionResult03(shortened,wallInput),/full contracted union horizon/);
});

test('surface expiry and conflicting resource dependencies cannot be hidden by a longer tile/world envelope',async()=>{
 const short={...panel(),validUntil:10},scene=context('west',region(-8,0),{surfaces:[short],materials:{boundary:passive}});
 const runtime=new ScenePreparation03({session,worldDigest:world});
 try{
  const first=await runtime.prepare({contexts:[scene],listenerAnchor:[-4,0,1]});assert.equal(first.prepared.scene.tile.validUntil,10);
  const stale=await runtime.prepare({contexts:[scene],listenerAnchor:[-4,0,1],geometryTimeMs:11});assert.equal(stale.state,'failed');assert.equal(runtime.current(),null);
  const a=context('west',region(-8,0)),b=context('east',region(0,8));
  const other=createSceneTileContext03({...b,sourceBindings:[{id:binding[0].id,sha256:'f'.repeat(64)}]});
  assert.throws(()=>composeSceneUnion03(request([a,other])),/conflicting effective resource/);
 }finally{await runtime.close();}
});

test('invalid cancellation and reuse clocks are rejected before any new worker lifetime',async()=>{
 const contexts=[context('west',region(-8,0))],runtime=new ScenePreparation03({session,worldDigest:world});
 try{
  await assert.rejects(runtime.prepare({contexts,listenerAnchor:[-4,0,1],signal:{aborted:false}}),/bounded background/);
  assert.equal(runtime.stats.workersStarted,0);assert.equal(runtime.active,null);
  await runtime.prepare({contexts,listenerAnchor:[-4,0,1]});const count=runtime.stats.workersStarted;
  await assert.rejects(runtime.prepare({contexts,listenerAnchor:[-4,0,1],geometryTimeMs:'1'}),/bounded background/);
  assert.equal(runtime.stats.workersStarted,count);
 }finally{await runtime.close();}
});

test('background preparation joins real workers, publishes atomically, reuses exact input and retains prior scene during work',async()=>{
 const contexts=[context('west',region(-8,0)),context('east',region(0,8))],runtime=new ScenePreparation03({session,worldDigest:world});
 try{
  const first=await runtime.prepare({contexts,listenerAnchor:[-4,0,1]});assert.equal(first.state,'prepared');assert.equal(first.workerJoined,true);
  const before=runtime.current(),same=await runtime.prepare({contexts:[...contexts].reverse(),listenerAnchor:[-4,0,1],geometryTimeMs:1});
  assert.equal(same.reused,true);assert.equal(runtime.current(),before);
  const pending=runtime.prepare({contexts,listenerAnchor:[4,0,1]});assert.equal(runtime.current(),before);
  const next=await pending;assert.equal(next.state,'prepared');assert.equal(next.prepared.generation,2);
  assert.equal(runtime.stats.workersStarted,2);assert.equal(runtime.stats.workersJoined,2);assert.equal(runtime.stats.pcmQueueFramesAdded,0);assert.equal(runtime.stats.sourceGenerationsModified,0);
 }finally{await runtime.close();}assert.equal(runtime.current(),null);assert.equal(runtime.active,null);
});

test('nearby preparation reuses the existing spatial index, prioritises the listener and leaves unselected space unknown',async()=>{
 const contexts=[context('west',region(-8,0)),context('east',region(0,8)),context('far',region(32,40))],runtime=new ScenePreparation03({session,worldDigest:world});
 try{
  const result=await runtime.prepareNearby({contexts,listenerAnchor:[-4,0,1],sources:[[36,0,1]],maximumTiles:1});
  assert.equal(result.state,'prepared');assert.deepEqual(result.prepared.metadata.tileIds,['west']);assert.equal(result.selection.indexed,3);
  assert.throws(()=>querySegment(result.prepared.scene.tile,[-4,0,1],[4,0,1]),/extent/);
  const missing=await runtime.prepareNearby({contexts,listenerAnchor:[20,0,1],radius:4});assert.equal(missing.state,'unprepared-or-unknown');assert.equal(runtime.current(),null);
  assert.equal(runtime.stats.workersStarted,1);assert.equal(runtime.stats.pcmQueueFramesAdded,0);
 }finally{await runtime.close();}
});

test('cancel, timeout and world invalidation join preparation and cannot publish a stale world',async(t)=>{
 // Advance the parent deadline deterministically; do not assume a minimum OS
 // worker startup time or race a 1 ms real scheduler interval in CI.
 t.mock.timers.enable({apis:['setTimeout']});
 const contexts=[context('west',region(-8,0))],runtime=new ScenePreparation03({session,worldDigest:world});
 try{
  const aborter=new AbortController(),pending=runtime.prepare({contexts,listenerAnchor:[-4,0,1],signal:aborter.signal});aborter.abort();
  const cancelled=await pending;assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.workerJoined,true);assert.equal(runtime.current(),null);
  const timing=runtime.prepare({contexts,listenerAnchor:[-4,0,1],budgetMilliseconds:1});t.mock.timers.tick(1);
  const timed=await timing;assert.equal(timed.state,'budget-exceeded');assert.equal(timed.workerJoined,true);
  const old=runtime.prepare({contexts,listenerAnchor:[-4,0,1]});await runtime.invalidate('f'.repeat(64));
  const stale=await old;assert(['cancelled','cancelled-or-invalidated'].includes(stale.state));assert.equal(runtime.current(),null);assert.equal(runtime.active,null);
  assert.equal(runtime.stats.workersStarted,runtime.stats.workersJoined);
 }finally{await runtime.close();}
});
