import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {ObservedSimulationInput} from '../src/acoustics/streaming/observed-live.mjs';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {liveConfiguration,nativeEnvelope,geometryEvent} from './fixtures/LiveGeometry.mjs';

function listenerContext(contextEpoch=1){
  const c=liveConfiguration().configuration;
  return {type:'listener-context-config',configuration:{contextEpoch,listenerSession:c.listenerSession,
    minimumListenerGeneration:c.minimumListenerGeneration,build:c.build,coordinates:c.coordinates,region:c.region,
    sources:c.sources,engine:c.engine,directPath:{mode:'listener-only-conditional-direct',sourceId:'beacon-0',
      rights:'original-generated',visibilityAssumption:'unobserved-space-assumed-clear'}}};
}
const anchorAt=(now,sequence,changes={})=>({...nativeEnvelope(now,sequence,changes),queueAgeMs:0,
  delivery:{maximumMs:0,basis:'controlled-fixture',reference:'deterministic-listener-delivery'}});
function fixture(){
  const simulation=new CausalSimulation(null,{allowMissingScene:true}),input=new ObservedSimulationInput(simulation,['beacon-0']);
  let sequence=0;
  return {simulation,input,step(now,events=[],changes={},anchorChanges={}){
    const anchor={...anchorAt(now,sequence++,changes),...anchorChanges};input.consume(events,anchor,now);
    const state=anchor.state??nativeEnvelope(now,sequence).state;
    return input.update({session:state.session,generation:state.generation,listener:state,paused:state.paused,emitting:true},anchor,now);
  }};
}

test('listener-only context prepares owned emission and existing causal renderer without any geometry configuration or observations',()=>{
  const f=fixture(),renderer=new StreamingRenderer({sourceIds:['beacon-0'],masterGain:1,historyDiagnostics:true});
  const owned=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512);let peak=0,energy=0,direct;
  for(let block=0;block<50;block++){
    const now=block*512/48000,control=f.step(now,block===0?[listenerContext()]:[]);
    renderer.accept(control);
    for(let k=0;k<512;k++)owned[k]=.44*(Math.sin(2*Math.PI*600*(block*512+k)/48000)+.2*Math.sin(2*Math.PI*1200*(block*512+k)/48000))/1.2;
    renderer.process({'beacon-0':owned},left,right);
    for(let k=0;k<512;k++){peak=Math.max(peak,Math.abs(left[k]),Math.abs(right[k]));energy+=left[k]**2+right[k]**2;}
    if(control.paths.length)direct=control;
  }
  assert.ok(peak>.01&&energy>.1,'actual original harmonic PCM propagates through causal renderer');
  assert.equal(f.input.config,null);assert.equal(f.input.feed.scene,null);assert.equal(f.simulation.scene.tile,null);
  assert.equal(f.simulation.scene.directPath.observationEvidence.length,0);
  assert.equal(direct.paths.length,1);assert.equal(direct.paths[0].order,0);assert.equal(direct.readiness.rendererReadyForOwnedEmission,true);
  assert.equal(direct.readiness.genuineGeometryPresent,false);assert.equal(direct.readiness.reflectionsActive,false);
  assert.equal(direct.geometry.mode,'conditional-direct-only');assert.equal(direct.geometry.visibilityAssumption,'unobserved-space-assumed-clear');
  assert.equal(renderer.historyDiagnostics.affectedFrames,0);assert.equal(renderer.stats.cursorResets,0);
});

test('qualified geometry attaches later and expiry or withdrawal retains direct identity, source histories and retarded-time rate',()=>{
  const f=fixture();f.step(0,[listenerContext()]);const direct=f.step(.1),identity=direct.paths[0].id;
  const previous=f.simulation.previous.get(identity);
  const reflected=f.step(.2,[liveConfiguration(),geometryEvent(.2,1)]);
  assert.ok(reflected.paths.some(p=>p.order>0));assert.equal(reflected.readiness.genuineGeometryPresent,true);
  assert.equal(reflected.readiness.reflectionsActive,true);assert.deepEqual(reflected.sourceGenerations,direct.sourceGenerations);
  assert.equal(reflected.stats.resets,direct.stats.resets);assert.equal(reflected.paths.find(p=>p.order===0).id,identity);
  assert.ok(f.simulation.previous.get(identity).time>previous.time);
  const expired=f.step(1.21);assert.equal(expired.geometry.mode,'conditional-direct-only');assert.equal(expired.geometry.geometryMode,'expired');
  assert.equal(expired.paths.length,1);assert.equal(expired.paths[0].id,identity);assert.equal(expired.paths[0].rate,1);
  assert.deepEqual(expired.sourceGenerations,direct.sourceGenerations);assert.equal(expired.stats.resets,direct.stats.resets);
  f.step(1.3,[geometryEvent(1.3,2)]);
  const withdrawn=f.step(1.4,[{...geometryEvent(1.4,3,{empty:true}),unavailableReason:'geometry-unavailable'}]);
  assert.equal(withdrawn.paths.length,1);assert.equal(withdrawn.paths[0].id,identity);assert.equal(withdrawn.readiness.genuineGeometryPresent,false);
});

test('conditional authorisation and native calibration are explicit and restricted to the original owned beacon',()=>{
  for(const mutate of [c=>delete c.configuration.directPath,c=>c.configuration.sources[0].rights='gta-stock-audio',
    c=>c.configuration.directPath.sourceId='other',c=>c.configuration.coordinates.basis='measured',
    c=>c.configuration.directPath.visibilityAssumption='verified-clear']){
    const f=fixture(),context=listenerContext();mutate(context);const control=f.step(0,[context]);
    assert.equal(control.paths.length,0);assert.equal(control.readiness.contextInitialized,false);assert.equal(f.simulation.scene,null);
  }
});

test('valid listener and source outside the configured region remain silent and cannot pass owned-emission readiness',()=>{
  const listenerOutside=fixture();listenerOutside.step(0,[listenerContext()]);
  const moved=listenerOutside.step(.1,[],{position:[103,200.1,3.7],generation:2});
  assert.equal(moved.paths.length,0);assert.equal(moved.readiness.transportAccepted,true);
  assert.equal(moved.readiness.contextInitialized,true);assert.equal(moved.readiness.rendererReadyForOwnedEmission,false);
  assert.equal(moved.readiness.emissionUnavailableReason,'listener-outside-configured-region');
  const sourceOutside=fixture(),context=listenerContext();context.configuration.sources[0].positionNative=[103,200.1,3.8];
  sourceOutside.step(0,[context]);const result=sourceOutside.step(.1);
  assert.equal(result.paths.length,0);assert.equal(result.readiness.rendererReadyForOwnedEmission,false);
  assert.equal(result.readiness.emissionUnavailableReason,'owned-source-outside-configured-region');
});

test('an in-region valid context can become ready before an emission command',()=>{
  const f=fixture(),anchor=anchorAt(0,0);f.input.consume([listenerContext()],anchor,0);
  const control=f.input.update({session:anchor.state.session,generation:1,listener:anchor.state,emitting:false},anchor,0);
  assert.equal(control.paths.length,0);assert.equal(control.readiness.rendererReadyForOwnedEmission,true);
  assert.equal(control.readiness.emissionUnavailableReason,null);
});

test('stale, future, wrong-session, reordered, invalid and interrupted listener inputs stay fail closed',()=>{
  for(const [changes,anchorChanges] of [[{}, {receiptAgeMs:251}],[{}, {receiptAgeMs:-3}],
    [{session:'b'.repeat(32)},{}],[{sequence:0},{}],[{valid:false,reason:'unavailable'},{}],
    [{paused:true},{}],[{}, {state:null}],[{}, {delivery:null}],[{clockFrequency:20000000},{}]]){
    const f=fixture();f.step(0,[listenerContext()]);assert.equal(f.step(.1).paths.length,1);
    // A monotonic frequency change is invalid even before a geometry clock exists.
    const result=f.step(.2,[],changes,anchorChanges);
    assert.equal(result.paths.length,0);assert.equal(result.readiness.rendererReadyForOwnedEmission,false);assert.equal(f.simulation.scene,null);
  }
});

test('actual simulation worker begins with conditional direct readiness, then publishes genuine reflected paths without history resets',async t=>{
  const worker=new Worker(new URL('../src/acoustics/streaming/simulation-worker.mjs',import.meta.url),
    {workerData:{geometry:true,sourceIds:['beacon-0'],controlledClock:true}});t.after(()=>worker.terminate());let id=0;
  const step=(now,events=[])=>new Promise((resolve,reject)=>{
    const anchor=anchorAt(now,id++),timer=setTimeout(()=>reject(Error('worker deadline')),3000);
    worker.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m.control);});
    worker.postMessage({id,now,geometryEvents:events,anchor,snapshot:{session:anchor.state.session,generation:1,listener:anchor.state,emitting:true}});
  });
  await step(0,[listenerContext()]);const direct=await step(.1),reflected=await step(.2,[liveConfiguration(),geometryEvent(.2,1)]),expired=await step(1.3);
  assert.equal(direct.readiness.rendererReadyForOwnedEmission,true);assert.equal(direct.paths.length,1);
  assert.equal(reflected.readiness.reflectionsActive,true);assert.equal(expired.readiness.genuineGeometryPresent,false);
  assert.equal(expired.paths.length,1);assert.deepEqual(expired.sourceGenerations,direct.sourceGenerations);
  assert.equal(expired.stats.resets,direct.stats.resets);
});
