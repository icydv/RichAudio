import test from 'node:test';import assert from 'node:assert/strict';
import {VehicleWorldLink03} from '../src/acoustics/events/vehicle-world-link03.mjs';
import {authoredVehicleObservation03 as observed,vehicleSession03 as session} from './fixtures/VehicleObservations03.mjs';
import {createTile,coordinateSpace} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createSceneTileContext03,composeSceneUnion03} from '../src/acoustics/world/scene-union03.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
const world='1'.repeat(64),model=0xf9300cc5;
function prepared({worldDigest=world,generation=1,at=0,air=true,wall=false}={}){
 const surfaces=wall?[{id:'resource-facade',coordinateSpace,center:[0,4,2],normal:[0,-1,0],u:[1,0,0],half:[8,4],motion:'static',reflectiveSide:'both',
  provenance:{kind:'synthetic',reference:'original-resource-fixture'},confidence:1,version:1,observedAt:0,validUntil:60000,material:{observedId:null,observedConfidence:null,acoustic:null}}]:[];
 const tile=createTile({schemaVersion:1,id:'resource-origin',coordinateSpace,timeUnit:'monotonic-ms',bounds:{min:[-16,-16,-8],max:[16,16,16]},listenerAnchor:[0,0,1],
  coverage:'complete-synthetic',surfaces,missingRegions:[],version:1,createdAt:0,validUntil:60000,build:'original-resource-integration-test',session,interior:'fixture',dynamicEpoch:1});
 const materials=wall?{'resource-facade':{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'fixture-passive'}}:{};
 const scene=acousticScene(tile,materials,air?vehicleDistanceSceneOptions('authored-detail-loss-v1'):{});
 const context=createSceneTileContext03({tileId:'local',worldDigest,scene,sourceBindings:[{id:'original-map',sha256:'2'.repeat(64)}],layout:'gen9-rsc7'});
 return composeSceneUnion03({contexts:[context],session,worldDigest,generation,listenerAnchor:[0,0,1],geometryTimeMs:at});
}
const link=()=>new VehicleWorldLink03({session,vehicleId:'retained-vehicle',generation:1,model,worldDigest:world});

test('observed vehicle levels associate with existing component identities without creating a sound event',()=>{
 const l=link(),result=l.accept(observed(),{nowQpc:1007});assert.equal(result.levels.length,6);
 const engine=result.levels.filter(x=>['engineOn','engineStarting','rawRevolutionsRatio'].includes(x.field));
 assert.equal(new Set(engine.map(x=>x.sourceId)).size,1,'separate getter fields describe one existing engine component');
 for(const level of result.levels){assert.equal(level.identity.model,model);assert.equal(level.acousticPosition,null);assert.equal(level.physicalIntensity,null);assert.equal(level.replacementPermitted,false);}
 assert.equal(result.levelTransitions.length,0);assert.equal(result.mayGenerateAudio,false);assert.equal(result.eventDescriptorsEmitted,0);
 assert.equal(l.diagnostics().nativeEventBus,null);
});

test('native horn/gear changes remain qualified level differences with uncertain physical occurrence',()=>{
 const l=link();l.accept(observed(),{nowQpc:1007});
 const result=l.accept(observed({sequence:1,at:1050,values:{hornPlaying:true,currentGear:2}}),{nowQpc:1057});
 assert.equal(result.levelTransitions.length,2);for(const t of result.levelTransitions){assert.equal(t.actualOccurrence.known,false);assert.equal(t.actualEventMultiplicity,'unavailable');}
 const blocked=l.planTransient({component:'horn',nowQpc:1057,runtimeVerified:true,ownershipVerified:true});
 assert.equal(blocked.admitted,false);assert.equal(blocked.descriptor,null);assert.equal(blocked.nativePrimary,true);assert.equal(blocked.mayGenerateReflections,false);
 assert.equal(l.diagnostics().eventDescriptorsEmitted,0);
});

test('the selected vehicle generation and world are immutable and an omitted geometry clock stays unavailable',()=>{
 const l=link();assert.throws(()=>{l.identity.vehicleGeneration=2;},TypeError);
 assert.throws(()=>{l.identity={...l.identity,vehicleGeneration:2};},TypeError);assert.throws(()=>{l.worldDigest='f'.repeat(64);},TypeError);
 const result=l.accept(observed(),{nowQpc:1007});assert(result.levels.every(x=>x.identity.vehicleGeneration===1));
 l.bindScene(prepared().scene);assert(l.planTransient({component:'horn',nowQpc:1007}).reasons.includes('geometry-clock-unavailable'));
 assert(!l.planTransient({component:'horn',nowQpc:1007,geometryTimeMs:0}).reasons.includes('geometry-clock-unavailable'));
 assert(l.planTransient({component:'horn',nowQpc:1007,geometryTimeMs:60000}).reasons.includes('scene-horizon-expired-or-future'));
});

test('scene/session/world identities are independently checked and map preparation adds no event waiting queue',()=>{
 const l=link(),scene=prepared();l.bindScene(scene.scene);l.accept(observed(),{nowQpc:1007});
 const result=l.planTransient({component:'engine',nowQpc:1007});assert.equal(result.status,'BLOCKED');assert(!result.reasons.some(x=>x.startsWith('scene-unprepared')));
 assert.throws(()=>l.bindScene(prepared({worldDigest:'3'.repeat(64)}).scene),/exact/);
 assert.throws(()=>l.clearScene({worldDigest:world,generation:2}),/Exact|exact/);l.clearScene({worldDigest:world,generation:1});
 assert(l.planTransient({component:'horn',nowQpc:1007}).reasons.includes('scene-unprepared-map-loading-does-not-queue-audio'));
 assert.equal(l.diagnostics().pcmQueueFramesAdded,0);
});

test('scope loss and recycled identity cannot invent an engine shutdown or restart a retired source',()=>{
 const l=link();l.accept(observed(),{nowQpc:1007});
 const result=l.accept(observed({sequence:1,at:1050,status:'retired',retirementReason:'player-driver-scope-lost',identity:{inPlayerDriverScope:false}}),{nowQpc:1057});
 assert.equal(result.retirement.engineOffInferred,false);assert.equal(result.retirement.shutdownSoundInferred,false);assert.equal(result.levelTransitions.length,0);
 assert(l.planTransient({component:'engine-shutdown',nowQpc:1057}).reasons.includes('source-lease-retired-no-engine-shutdown-inferred'));
 assert.throws(()=>l.accept(observed({sequence:2,at:1100}),{nowQpc:1107}),/terminal/);
 const other=link();other.accept(observed(),{nowQpc:1007});
 const changed=other.accept(observed({sequence:1,at:1050,identity:{poolCounter:2}}),{nowQpc:1057});assert.equal(changed.status,'retired');
});

test('stale or incompatible clocks cannot promote an otherwise observed operating level',()=>{
 const l=link();l.accept(observed(),{nowQpc:1007});
 assert(l.planTransient({component:'engine',nowQpc:1251}).reasons.includes('observation-expired-or-clock-incompatible'));
 assert(l.planTransient({component:'engine',nowQpc:1006}).reasons.includes('observation-expired-or-clock-incompatible'));
 assert.throws(()=>l.planTransient({component:'invented-turbo-pressure',nowQpc:1007}));
 assert.equal(l.planTransient({component:'engine',nowQpc:1250}).mayGenerateDirect,false);
});

function frame(sequence,time,generation=1){const ticks=10000000+Math.round(time*10000000);return {version:1,session,listener:{version:1,session,generation,sequence,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(time*1000),
 position:[0,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},
 vehicles:[{id:'bati',generation:1,observationTicks:ticks,model,context:'player',position:[0,10,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};}

test('opt-in resource attachment preserves an already valid engine, grain cursor and renderer source history',async()=>{
 const asset={frames:8192,sampleRate:24000,samples:new Float32Array(8192).fill(.1),nativePeak:.1};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
 const registry={resolve:()=>({status:'available',bank}),createSource:()=>new StockVehicleSource(bank)};let wall=0,sequence=0,next=0,source=null,sourceFrame=null,history=null;
 const engine=new StockGameplay({registry,session,now:()=>wall,continuityPolicy:'camera-source-01'});engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 try{
  const first=prepared();engine.setPreparedResourceScene03(first.scene,{worldDigest:world,generation:1});
  for(let block=0;block<160;block++){
   const time=block*512/48000;wall=time*1000;
   if(block===80){const changed=prepared({generation:2,at:wall,wall:true});engine.setPreparedResourceScene03(changed.scene,{worldDigest:world,generation:2});}
   if(time+1e-10>=next){engine.accept(frame(sequence++,next,next>=1.2?2:1),Math.max(0,(time-next)*1000),200);next+=.05;}
   await engine.render();const active=engine.slots.find(s=>s.source);
   if(active){source??=active.source;assert.equal(active.source,source);if(sourceFrame!==null)assert.equal(source.frame-sourceFrame,512);sourceFrame=source.frame;
    history??=engine.pipeline.renderer.sourceList.map(s=>s.bands);engine.pipeline.renderer.sourceList.forEach((s,i)=>assert.equal(s.bands,history[i]));}
  }
  assert.equal(engine.diagnostics().stageCounters.sourceCreations,1);assert.equal(engine.diagnostics().pipeline.history.affectedFrames,0);
  assert.equal(engine.diagnostics().pipeline.renderer.limited,0);assert.equal(engine.diagnostics().geometry,'qualified-original-resource-subset');
  assert.throws(()=>engine.setPreparedResourceScene03(prepared().scene,{worldDigest:'4'.repeat(64),generation:1}),/mismatch/);
  assert.throws(()=>engine.setPreparedResourceScene03(prepared({air:false}).scene,{worldDigest:world,generation:1}),/presentation/);
 }finally{engine.close();}
});
