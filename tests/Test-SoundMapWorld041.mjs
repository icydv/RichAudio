import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {interiorFixture04} from './fixtures/Interior04.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {createSceneTileContext03} from '../src/acoustics/world/scene-union03.mjs';
import {createInteriorTopology04} from '../src/acoustics/world/interior04.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';
import {createCachedAcousticWorld041,cachedWorldFromBuilder041,CachedWorldFeed041} from '../tools/soundmap/cache-world041.mjs';
import {checkCachedAcousticWorld041,CachedWorldState041,cachedWorldPresentation041,TELEMETRY_POLL_FPS,DISPLAY_RATES,VisualState,PassiveState,presentation} from '../tools/soundmap/ui/model.mjs';
import {startSoundMap} from '../tools/soundmap/server.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
async function prepared(){const f=worldResources04(),inventory=qualifyResourceInventory04(f.inventory),builder=new ResourceTileBuilder04({...f,inventory});await builder.prepareNearby({listenerAnchor:[4,0,1],maximumTiles:2});return {...f,inventory,builder};}
const inspect=b=>cachedWorldFromBuilder041(b,{expectedArtifacts:b.artifactBindings()});

test('cache inspection retains actual finite footprints, resource/building bindings and explicit fixture badges without solver paths',async()=>{
 const f=await prepared();try{const packet=inspect(f.builder);assert.equal(checkCachedAcousticWorld041(packet),packet);assert.equal(packet.authority,'original-authored-fixture-only');assert.equal(packet.installedWorldVerified,false);assert.equal(packet.runtimeActivationVerified,false);assert.equal(packet.viewerCanPublishAcoustics,false);assert.deepEqual(packet.paths,[]);
  const east=packet.tiles.find(t=>t.tileId==='east');assert.equal(east.state,'prepared-fixture');assert.equal(east.surfaces.length,1);assert.equal(east.surfaces[0].vertices.length,3,'actual triangle footprint, never bounding rectangle');assert.equal(east.buildingBindings[0].collisionResourceId,'east-collision');assert.match(east.buildingIdentityBasis,/not-a-building-name/);assert.equal(east.resourceBindings.length,3);assert.equal(TELEMETRY_POLL_FPS,20);assert.ok(DISPLAY_RATES.includes(60));
 }finally{await f.builder.close();}
});

test('cache snapshots reject unbranded contexts, wrong session/artifact digests and real installation claims',async()=>{
 const f=await prepared();try{const common={inventory:f.inventory,contexts:f.builder.contexts(),tiles:[...f.builder.resident.values()].map(r=>r.tile),expectedArtifacts:f.builder.artifactBindings(),session:f.session};
  assert.throws(()=>createCachedAcousticWorld041({...common,contexts:common.contexts.map(c=>({...c}))}),/qualified/);assert.throws(()=>createCachedAcousticWorld041({...common,session:'5'.repeat(32)}),/exact selected/);
  const bad={...common.expectedArtifacts,[f.inventory.tilePlans[0].planDigest]:'f'.repeat(64)};assert.throws(()=>createCachedAcousticWorld041({...common,expectedArtifacts:bad}),/artifact binding/);assert.throws(()=>createCachedAcousticWorld041({...common,alignment:{basis:'native-unscaled',coordinateKey:'native:camera',session:f.session}}),/alignment/);
  const real=worldResources04();real.inventory.origin='separately-authorized-installed-metadata';assert.throws(()=>createCachedAcousticWorld041({...common,inventory:qualifyResourceInventory04(real.inventory)}),/original fixture/);
 }finally{await f.builder.close();}
});

test('unsupported winners and unprepared tiles remain visible unknown bounds with no invented empty street',async()=>{
 const f=worldResources04();f.inventory.resources.push({...structuredClone(f.inventory.resources[0]),id:'unsupported-winning-map',mount:'custom',supported:false});const inventory=qualifyResourceInventory04(f.inventory),builder=new ResourceTileBuilder04({...f,inventory});
 try{let packet=inspect(builder);assert.equal(packet.tiles.find(t=>t.tileId==='west').state,'unsupported-or-unknown');assert.equal(packet.tiles.find(t=>t.tileId==='east').state,'unprepared');assert.ok(packet.tiles.every(t=>t.surfaces.length===0));await builder.prepareNearby({listenerAnchor:[4,0,1],maximumTiles:1});packet=inspect(builder);assert.equal(packet.tiles.find(t=>t.tileId==='east').state,'prepared-fixture');assert.ok(packet.tiles.find(t=>t.tileId==='west').unknown.some(u=>u.reason==='unsupported-winning-resource'));assert.equal(packet.outsideCoverage,'unknown');}
 finally{await builder.close();}
});

test('branded custom interior rooms and portals retain unknown floors, activation and connectivity without rendering propagation',async()=>{
 const f=await prepared();try{const plan=f.inventory.tilePlans.find(p=>p.tileId==='east'),original=f.builder.resident.get('east').tile,interior=interiorFixture04({mapKind:'custom'});
  const engineTile=createTile({...original.engineTile,surfaces:interior.scene.tile.surfaces,listenerAnchor:[2,2,1]}),scene=acousticScene(engineTile,interior.scene.materials),tile={...original,engineTile,materials:scene.materials};const {tileDigest,...body}=tile;tile.tileDigest=digest(body);
  interior.input.sourceBindings=tile.sources.map(({id,sha256})=>({id,sha256}));interior.input.rooms[1].completeness='unknown';interior.input.rooms[1].surfaces.floors=[];interior.input.portals[1].topology='unknown';interior.input.portals[1].b=null;
  const topology=createInteriorTopology04(interior.input,{scene}),context=createSceneTileContext03({tileId:'east',worldDigest:f.inventory.inventoryDigest,scene,sourceBindings:interior.input.sourceBindings,layout:'gen9-rsc7'});
  const options={inventory:f.inventory,contexts:[context],tiles:[tile],expectedArtifacts:{[plan.planDigest]:tile.tileDigest},interiors:[topology],session:f.session};const packet=createCachedAcousticWorld041(options);checkCachedAcousticWorld041(packet);const shown=packet.interiors[0];assert.equal(shown.mapKind,'custom');assert.equal(shown.rooms[1].completeness,'unknown');assert.deepEqual(shown.rooms[1].surfaces.floors,[]);assert.equal(shown.portals[1].b,null);assert.equal(shown.runtimeState,'not-supplied');assert.deepEqual(packet.paths,[]);assert.throws(()=>createCachedAcousticWorld041({...options,interiors:[{...topology}]}),/branded/);
 }finally{await f.builder.close();}
});

test('cached metre geometry uses an independent view unless the acoustic stream has exact explicit alignment',async()=>{
 const f=await prepared();try{let clock=1000;const feed=new CachedWorldFeed041(()=>clock),cache=new CachedWorldState041();feed.publish(inspect(f.builder));cache.ingest(feed.snapshot(),10);const passive={kind:'passive',coordinateKey:'native:camera:'+f.session,frame:null,listener:{valid:true,position:[100,200,3]}};
  let view=cachedWorldPresentation041(cache,passive,10,{enabled:true});assert.equal(view.cacheOnly,true);assert.equal(view.overlay,false);assert.match(view.coordinateKey,/^cached-world:/);assert.equal(cachedWorldPresentation041(cache,passive,10).visible,false,'default disabled');
  const coordinateKey='model:fixture:'+f.session,acousticSession=f.session+':1',aligned=cachedWorldFromBuilder041(f.builder,{expectedArtifacts:f.builder.artifactBindings(),alignment:{basis:'original-authored-exact-model-alignment',session:f.session,acousticSession,coordinateKey}});feed.publish(aligned);cache.ingest(feed.snapshot(),20);view=cachedWorldPresentation041(cache,{kind:'acoustic',coordinateKey,frame:{listenerSessionId:acousticSession}},20,{enabled:true});assert.equal(view.overlay,true);assert.equal(cachedWorldPresentation041(cache,{kind:'acoustic',coordinateKey,frame:{listenerSessionId:f.session+':2'}},20,{enabled:true}).cacheOnly,true);assert.equal(cachedWorldPresentation041(cache,passive,20,{enabled:true}).overlay,false);
  assert.throws(()=>cachedWorldFromBuilder041(f.builder,{expectedArtifacts:f.builder.artifactBindings(),alignment:{basis:'original-authored-exact-model-alignment',session:f.session,coordinateKey}}),/acoustic session/);
  clock+=60001;cache.ingest(feed.snapshot(cache.requestKey()),30);view=cachedWorldPresentation041(cache,passive,30,{enabled:true});assert.ok(view.tiles.filter(t=>t.tileDigest).every(t=>t.state==='expired-fixture'),'repeated fetch does not renew geometry lease');
 }finally{await f.builder.close();}
});

test('actual CausalSimulation and SoundMapTelemetry session suffix align only through the explicit acoustic session contract',async()=>{
 const f=await prepared();try{
  const context=f.builder.contexts().find(c=>c.tileId==='east'),simulation=new CausalSimulation(context.scene),telemetry=new SoundMapTelemetry({enabled:true,fps:20});let published,geometry;
  for(const time of [0,.1,.2]){telemetry.begin(simulation,time*1000);simulation.observe({time,session:f.session,generation:1,listener:{position:[4,1,1],forward:[0,1,0]},sources:[{id:'fixture-source',position:[4,0,1],velocity:[0,0,0],forward:[0,1,0]}]});published=telemetry.publish(simulation,simulation.update(time),{producedAtUnixMs:0});geometry=published.soundMapGeometry??geometry;}
  const frame=published.soundMapFrame;assert.equal(frame.listenerSessionId,f.session+':1');assert.equal(frame.sessionId,f.session+':1');assert.ok(frame.paths.some(path=>path.status==='selected'),'actual supplied solver evidence');
  const visual=new VisualState();visual.ingest({mode:'live',frame,geometry,status:{ageMs:0}},200,{wallNow:0});const base=presentation(visual,new PassiveState(),200,true);assert.equal(base.kind,'acoustic');
  const alignment={basis:'original-authored-exact-model-alignment',session:f.session,acousticSession:frame.listenerSessionId,coordinateKey:base.coordinateKey},packet=cachedWorldFromBuilder041(f.builder,{expectedArtifacts:f.builder.artifactBindings(),alignment}),feed=new CachedWorldFeed041(()=>1000),cache=new CachedWorldState041();feed.publish(packet);cache.ingest(feed.snapshot(),200);
  assert.equal(cachedWorldPresentation041(cache,base,200,{enabled:true}).overlay,true);assert.deepEqual(packet.paths,[],'cache does not copy or manufacture reflected paths');assert.equal(cachedWorldPresentation041(cache,{...base,frame:{...frame,listenerSessionId:f.session+':2'}},200,{enabled:true}).overlay,false);assert.equal(cachedWorldPresentation041(cache,{...base,coordinateKey:base.coordinateKey+':changed'},200,{enabled:true}).overlay,false);assert.equal(cachedWorldPresentation041(cache,{kind:'passive',coordinateKey:base.coordinateKey,frame},200,{enabled:true}).overlay,false);
 }finally{await f.builder.close();}
});

test('cache invalidation withdraws inspection snapshots and rejects fabricated solver or compatibility packets',async()=>{
 const f=await prepared();try{const packet=inspect(f.builder),feed=new CachedWorldFeed041(),cache=new CachedWorldState041();assert.throws(()=>feed.publish({...packet}),/branded/);feed.publish(packet);cache.ingest(feed.snapshot(),0);feed.invalidate('f'.repeat(64));cache.ingest(feed.snapshot(),1);assert.equal(cache.packet,null);assert.equal(feed.status().available,false);assert.equal(feed.status().reason,'resource-inventory-changed');
  for(const mutate of [p=>p.paths=[{id:'invented-reflection'}],p=>p.installedWorldVerified=true,p=>p.tiles[0].surfaces[0].vertices[0][0]=99999,p=>p.coordinateSpace='gta-native-unscaled']){const bad=structuredClone(packet);mutate(bad);assert.throws(()=>checkCachedAcousticWorld041(bad));}
 }finally{await f.builder.close();}
});

test('future geometry remains explicitly unqualified and a reversed display clock cannot renew cached evidence',async()=>{
 const f=await prepared();try{const plan=f.inventory.tilePlans.find(p=>p.tileId==='east'),original=f.builder.resident.get('east').tile,engineTile=createTile({...original.engineTile,createdAt:200}),tile={...original,engineTile};const {tileDigest,...body}=tile;tile.tileDigest=digest(body);
  const scene=acousticScene(engineTile,tile.materials),context=createSceneTileContext03({tileId:'east',worldDigest:f.inventory.inventoryDigest,scene,sourceBindings:tile.sources.map(({id,sha256})=>({id,sha256})),layout:'gen9-rsc7'}),packet=createCachedAcousticWorld041({inventory:f.inventory,contexts:[context],tiles:[tile],expectedArtifacts:{[plan.planDigest]:tile.tileDigest},session:f.session,geometryTimeMs:100});
  assert.equal(packet.tiles.find(t=>t.tileId==='east').state,'future-fixture');checkCachedAcousticWorld041(packet);let now=1000;const feed=new CachedWorldFeed041(()=>now),cache=new CachedWorldState041();feed.publish(packet);cache.ingest(feed.snapshot(),0);assert.equal(cachedWorldPresentation041(cache,{kind:'waiting'},0,{enabled:true}).tiles.find(t=>t.tileId==='east').state,'future-fixture');
  now=999;const invalid=feed.snapshot();assert.equal(invalid.packet,null);assert.equal(invalid.status.available,false);assert.equal(invalid.status.clockQualified,false);assert.equal(invalid.status.reason,'cache-display-clock-fault');cache.ingest(invalid,1);assert.equal(cache.packet,null);now=2000;assert.throws(()=>feed.publish(packet),/new feed/);assert.equal(feed.status().available,false);
 }finally{await f.builder.close();}
});

test('SoundMap serves opt-in snapshots through GET only, accepts publication only through local branded control API and never records',async()=>{
 const f=await prepared(),root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-soundmap041-'));let service;
 try{service=await startSoundMap({root,port:0});const base=service.descriptor.url,headers={'X-RichAudio-Token':service.descriptor.token};const get=async route=>{const response=await fetch(base+route,{headers});assert.equal(response.status,200);return response.json();};let result=await get('/api/cache-world');assert.equal(result.status.available,false);assert.equal(result.packet,null);
  const pending=service.cacheWorld.publish(inspect(f.builder));service.cacheWorld.clear('withdrawn-during-import');assert.equal((await pending).publicationWithdrawn,true);result=await get('/api/cache-world');assert.equal(result.packet,null);assert.equal(result.status.reason,'withdrawn-during-import');
  const invalidated=service.cacheWorld.publish(inspect(f.builder));service.cacheWorld.invalidate('f'.repeat(64));assert.equal((await invalidated).publicationWithdrawn,true);result=await get('/api/cache-world');assert.equal(result.status.available,false);
  await service.cacheWorld.publish(inspect(f.builder));result=await get('/api/cache-world');assert.equal(result.packet.kind,'richaudio-cached-acoustic-world041');const frame=await get('/api/frame?cacheWorldGeneration='+result.packet.generation);assert.equal(frame.cacheWorld.packet,null);assert.equal(frame.cacheWorld.status.available,true);assert.equal(frame.frame,null);assert.equal(service.recorder.active,null);
  const refused=await fetch(base+'/api/cache-world',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({path:'unread-browser-supplied-path',packet:result.packet})});assert.equal(refused.status,404);service.cacheWorld.clear('withdrawn');result=await get('/api/cache-world');assert.equal(result.packet,null);assert.equal(result.status.available,false);assert.equal(service.recorder.active,null);
 }finally{await service?.close();await f.builder.close();const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('richaudio-soundmap041-'));await fs.rm(resolved,{recursive:true,force:true});}
});
