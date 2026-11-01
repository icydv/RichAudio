import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';import {loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {observedAcousticScene,observationCoordinates} from '../src/acoustics/engine/observed-geometry.mjs';import {observedInput,demonstrationCoordinates} from './fixtures/ObservedGeometry.mjs';
const root=process.env.PLAYABLE01_CANDIDATE,session='b'.repeat(32),skip=!root;
let registry,profiles;function loaded(){if(registry)return;const m=JSON.parse(fs.readFileSync(path.join(root,'playable.json'))),assets=loadStockCatalogAssets(path.join(root,m.playerManifest),{sustainAtlasFile:path.join(root,m.atlas)}),npcAssets=loadStockNpcAssets(path.join(root,m.npcManifest));registry=loadInstalledStockRegistry({catalogFile:path.join(root,m.catalog),catalogSha256:m.catalogSha256,assets,npcAssets});profiles=JSON.parse(fs.readFileSync(path.join(root,m.profiles)));}
function fixture(){loaded();let wall=0,sequence=0,generation=1,paused=false;const engine=new StockGameplay({registry,profiles,session,now:()=>wall});
 const vehicle=(id='bati',context='npc',model=0xf9300cc5)=>({id,generation:1,observationTicks:Math.round((1000+wall)*10000),model,context,position:[-.3,.1,.8],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true});
 function accept(vehicles=[vehicle()],opts={}){if(opts.paused!==undefined&&opts.paused!==paused){generation++;paused=opts.paused;}engine.accept({version:1,session,listener:{version:1,session,generation,sequence:sequence++,observationTicks:Math.round((1000+wall)*10000),clockFrequency:10000000,gameTimeMs:Math.round(wall),position:[.3,.1,.7],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused,valid:opts.valid??true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},vehicles},0,opts.validForMs??null);}
 async function step(blocks,make=()=>[vehicle()],opts={}){let peak=0,reflections=0;for(let i=0;i<blocks;i++){if(i%4===0)accept(make(),opts);const channels=await engine.render();for(const c of channels)for(const x of c){assert.ok(Number.isFinite(x)&&Math.abs(x)<1);peak=Math.max(peak,Math.abs(x));}reflections=Math.max(reflections,engine.pipeline.lastControl.paths.filter(p=>p.order>0).length);wall+=512000/48000;}return {peak,reflections};}
 return {engine,vehicle,accept,step,now:()=>wall,advance:ms=>{wall+=ms;}};}
test('an accepted Bati source lease expires independently of a newer listener or render clock',{skip},async()=>{
 const f=fixture();try{
  await f.step(24,()=>[f.vehicle('bati-player','player')],{validForMs:80});
  f.accept([f.vehicle('bati-player','player')],{validForMs:15});
  const time=f.engine.snapshots.at(-1).time;
  assert.equal(f.engine.vehiclesAt(time).length,1);
  f.advance(16);
  assert.equal(f.engine.vehiclesAt(time).length,0,'original source lease cannot be renewed by delayed playout');
  await f.engine.render();assert.equal(f.engine.diagnostics().active,0);
  assert.throws(()=>f.accept([f.vehicle()],{validForMs:0}));
  assert.throws(()=>f.accept([f.vehicle()],{validForMs:300}));
 }finally{f.engine.close();}
});
test('genuine multi-source ownership, retirement, pause/resume and unchanged PCM through actual causal pipeline',{skip},async()=>{
 const f=fixture(),e=f.engine;try{assert.equal((await f.step(120)).peak>0,true);const first=e.slots.find(s=>s.identity),source=first.source,pcm=source.vehicle.layers.engine.accel.samples,hash=()=>createHash('sha256').update(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)).digest('hex'),before=hash();
 await f.step(80,()=>[f.vehicle(),{...f.vehicle('schafter','player',0xa774b5a6),position:[-1,.1,.8]}]);assert.equal(e.diagnostics().maximumActive,2);assert.notEqual(e.slots[0].source,e.slots[1].source);assert.notEqual(e.pipeline.renderer.sources.get('stock:slot0:engine').bands[0],e.pipeline.renderer.sources.get('stock:slot1:engine').bands[0]);
 await f.step(40,()=>[f.vehicle()]);assert.equal(e.diagnostics().active,1);assert.ok(e.diagnostics().retired>0);await f.step(50,()=>[f.vehicle()],{paused:true});const at=source.frame;await f.step(30,()=>[f.vehicle()],{paused:true});assert.equal(source.frame,at,'game pause does not advance recorded source phase');
 await f.step(60,()=>[f.vehicle()],{paused:false});assert.ok(source.frame>at);await f.step(60,()=>[{...f.vehicle(),generation:2}]);assert.notEqual(e.slots.find(s=>s.identity).source,source,'reused identity owns fresh state');
 await f.step(60,()=>[]);assert.equal(e.diagnostics().active,0);assert.equal(hash(),before);assert.equal(e.diagnostics().pipeline.renderer.limited,0);assert.equal(e.diagnostics().pipeline.history.affectedFrames,0);assert.equal(e.diagnostics().pipeline.renderer.missingHistory,0);assert.equal(e.playout.stats.startupClockCalibrations,0,'moving sources never trigger camera-only clock relabelling');
 }finally{e.close();}
});
test('qualified finite geometry adds real solver paths, expires and preserves original source history',{skip},async()=>{
 const f=fixture(),e=f.engine;try{await f.step(90);const source=e.slots[0].source,history=e.pipeline.renderer.sources.get('stock:slot0:engine').bands[0];
 const input=observedInput();for(const group of input.groups){group.Session=session;for(const sample of group.Samples)sample.Observation.SessionId=session;}input.context.session=session;input.coordinates=observationCoordinates(demonstrationCoordinates(1));const scene=observedAcousticScene(input);
 e.geometryAnchor={at:f.now(),observationMs:20};e.setQualifiedScene(scene,f.now()+850);const measured=await f.step(40);assert.ok(measured.reflections>0,'actual finite reflection paths reach existing renderer');assert.equal(e.slots[0].source,source);assert.equal(e.pipeline.renderer.sources.get('stock:slot0:engine').bands[0],history);
 await f.step(80);assert.equal(e.pipeline.simulation.scene,e.direct);assert.equal(e.slots[0].source,source);assert.equal(e.diagnostics().pipeline.renderer.missingHistory,0);assert.equal(e.diagnostics().pipeline.renderer.limited,0);
 }finally{e.close();}
});
test('unsupported context never substitutes a player bank and malformed telemetry fails closed',{skip},async()=>{
 const f=fixture();try{const result=await f.step(60,()=>[f.vehicle('unsupported','npc',0xa774b5a6)]);assert.equal(result.peak,0);assert.equal(f.engine.diagnostics().active,0);assert.ok(f.engine.diagnostics().unsupported>0);assert.throws(()=>f.accept([{...f.vehicle(),operatingPoint:1.1}]));assert.throws(()=>f.engine.setSettings({quality:'max',acceleration:'cpu',enabled:true,volume:1.01,reflections:true,mode:'experimental-additive'}));}finally{f.engine.close();}
});
test('observed RPH out-of-contract ratio is rejected without rescaling',{skip},()=>{
 const f=fixture();try{const before=f.engine.snapshots.length;
  for(const operatingPoint of [50,NaN,Infinity,-.1])assert.throws(()=>f.accept([{...f.vehicle(),operatingPoint}]));
  assert.equal(f.engine.snapshots.length,before,'invalid vehicle evidence cannot enter source history');
  assert.equal(f.engine.diagnostics().active,0);
  const stages=f.engine.diagnostics().stageCounters;assert.equal(stages.validVehicleObservations,0);assert.equal(stages.sourceCreations,0);assert.equal(stages.engine.nonzeroBlocks,0);assert.equal(stages.exhaust.nonzeroBlocks,0);assert.equal(stages.stereo.nonzeroBlocks,0);
 }finally{f.engine.close();}
});
test('injected valid Bati observations produce independent genuine engine/exhaust and post-propagation PCM stage evidence',{skip},async()=>{
 const f=fixture();try{
  // Only observations are authored. The decoded private Bati NPC bank,
  // registry, continuous source and causal renderer are genuine components.
  await f.step(90,()=>[f.vehicle('unsupported','npc',0xa774b5a6)]);
  const unsupported=f.engine.diagnostics().stageCounters;assert.ok(unsupported.validVehicleObservations>0);assert.ok(unsupported.runningVehicleObservations>0);
  assert.equal(unsupported.eligibleVehicleBlocks,0);assert.equal(unsupported.sourceCreations,0);assert.equal(unsupported.sourcePlaybackBlocks,0);assert.equal(unsupported.engine.nonzeroBlocks,0);assert.equal(unsupported.exhaust.nonzeroBlocks,0);assert.equal(unsupported.acousticPathBlocks,0);assert.equal(unsupported.stereo.nonzeroBlocks,0);
  assert.ok((await f.step(150)).peak>0);
  const d=f.engine.diagnostics(),stages=d.stageCounters;assert.ok(stages.eligibleVehicleBlocks>0);assert.equal(stages.sourceCreations,1);assert.ok(stages.sourcePlaybackBlocks>0);assert.ok(stages.acousticPathBlocks>0);
  assert.equal(d.sourceStates[0].bank,'bati');assert.equal(d.sourceStates[0].context,'npc');
  for(const role of ['engine','exhaust','stereo']){assert.ok(stages[role].nonzeroBlocks>0,role+' has actual nonzero PCM blocks');assert.ok(stages[role].peak>0&&stages[role].peak<1,role+' bounded PCM peak');assert.ok(stages[role].sumSquares>0,role+' actual PCM energy');}
  assert.equal(d.pipeline.renderer.limited,0);assert.equal(d.pipeline.renderer.missingHistory,0);assert.equal(d.pipeline.history.affectedFrames,0);
  // Diagnostics are a snapshot; a consumer cannot rewrite accumulated proof.
  stages.engine.nonzeroBlocks=0;assert.ok(f.engine.diagnostics().stageCounters.engine.nonzeroBlocks>0);
 }finally{f.engine.close();}
});
test('all nine prepared player mappings and the exact Bati NPC mapping still resolve and emit genuine PCM',{skip},async()=>{
 loaded();const manifest=JSON.parse(fs.readFileSync(path.join(root,'playable.json')));assert.equal(manifest.eligible.filter(v=>v.context==='player').length,9);
 assert.deepEqual(manifest.eligible.filter(v=>v.context==='npc').map(v=>v.model),[0xf9300cc5]);
 for(const mapping of manifest.eligible){const f=fixture();try{
  assert.equal(registry.resolve(mapping.model,mapping.context).status,'available');assert.ok((await f.step(70,()=>[f.vehicle(mapping.name,mapping.context,mapping.model)])).peak>0,mapping.context+':'+mapping.name);
  const d=f.engine.diagnostics();for(const role of ['engine','exhaust','stereo'])assert.ok(d.stageCounters[role].sumSquares>0,mapping.name+':'+role);
  assert.equal(d.pipeline.renderer.limited,0);assert.equal(d.pipeline.renderer.missingHistory,0);
 }finally{f.engine.close();}}
});
