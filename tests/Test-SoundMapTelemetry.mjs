// Device-free checks. Original synthetic geometry/audio only, no GTA or endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry,soundMapLimits} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import {ObservedSimulationInput} from '../src/acoustics/streaming/observed-live.mjs';
import {fixture} from '../tools/acoustics-06-scenes.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile,onPatch,querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {liveConfiguration,nativeEnvelope,geometryEvent} from './fixtures/LiveGeometry.mjs';
import {originalCase,observationAt} from '../tools/Measure-Acoustics07.mjs';

function observation(time,{moving=false,session='soundmap-original-fixture'}={}){
  return {time,session,generation:1,listener:{position:[5,0,1],forward:[-1,0,0]},
    sources:[{id:'beacon',position:[-5+(moving?time:0),0,1],velocity:moving?[1,0,0]:[0,0,0],forward:[1,0,0]}]};
}
function step(sim,tel,time,options={}){
  tel.begin(sim,time*1000);sim.observe(observation(time,options));
  const control=sim.update(time);return {control,...tel.publish(sim,control,{producedAtUnixMs:0})};
}

test('opt-in sampling is bounded to 15–30 fps, disabled adds no debug state, cache can resend on reconnect',()=>{
  const sim=new CausalSimulation(fixture().scene),off=new SoundMapTelemetry();
  assert.deepEqual(step(sim,off,0).soundMapFrame,undefined);assert.equal(sim.soundMapState,null);
  assert.throws(()=>new SoundMapTelemetry({fps:31}),/bounded/);assert.throws(()=>new SoundMapTelemetry({fps:14}),/bounded/);
  const tel=new SoundMapTelemetry({enabled:true,fps:20}),first=step(sim,tel,.1);
  assert.ok(first.soundMapGeometry);assert.ok(Object.isFrozen(first.soundMapGeometry.surfaces[0].vertices));
  assert.equal(step(sim,tel,.125).soundMapFrame,undefined);
  const next=step(sim,tel,.15);assert.ok(next.soundMapFrame);assert.equal(next.soundMapGeometry,undefined);
  assert.equal(next.soundMapFrame.geometryGeneration,first.soundMapGeometry.generation);
  tel.resetGeometry();const resumed=step(sim,tel,.2);
  assert.deepEqual(resumed.soundMapGeometry,first.soundMapGeometry);
  const newSession=step(sim,tel,.25,{session:'new-session'});
  assert.notEqual(newSession.soundMapFrame.geometryGeneration,first.soundMapGeometry.generation);
  assert.equal(newSession.soundMapFrame.sessionId,'new-session:1');
});

test('restarted workers retain listener identity but get independent stream and immutable geometry identities',()=>{
  const firstSim=new CausalSimulation(fixture().scene),first=new SoundMapTelemetry({enabled:true});
  step(firstSim,first,0);const old=step(firstSim,first,.1);
  const nextSim=new CausalSimulation(fixture().scene),next=new SoundMapTelemetry({enabled:true}),fresh=step(nextSim,next,0);
  assert.equal(old.soundMapFrame.sessionId,fresh.soundMapFrame.sessionId);
  assert.equal(fresh.soundMapFrame.sequence,1);assert.equal(fresh.soundMapFrame.audioFrame,0);
  assert.notEqual(old.soundMapFrame.streamId,fresh.soundMapFrame.streamId);
  assert.notEqual(old.soundMapFrame.geometryGeneration,fresh.soundMapFrame.geometryGeneration);
  assert.equal(fresh.soundMapGeometry.streamId,fresh.soundMapFrame.streamId);
  assert.ok(fresh.soundMapGeometry.generation.startsWith(fresh.soundMapFrame.streamId+':'));
});

test('initial missing observations export explicit unavailable identity without inventing a listener pose',()=>{
  const sim=new CausalSimulation(null,{allowMissingScene:true}),tel=new SoundMapTelemetry({enabled:true});
  tel.begin(sim,0);const absent=tel.publish(sim,sim.update(0)).soundMapFrame;
  assert.equal(absent.sessionId,'uninitialised');assert.equal(absent.listenerSessionId,null);
  assert.equal(absent.diagnostics.reason,'observation-unavailable');assert.equal(absent.listener,null);
  assert.deepEqual(absent.sources,[]);assert.deepEqual(absent.paths,[]);assert.equal(absent.geometryGeneration,null);
  const accepted=step(sim,tel,.1).soundMapFrame;
  assert.equal(accepted.sessionId,'soundmap-original-fixture:1');assert.equal(accepted.listenerSessionId,accepted.sessionId);
  assert.equal(accepted.streamId,absent.streamId);assert.equal(accepted.diagnostics.reason,'geometry-unavailable');
  assert.ok(accepted.listener.valid);assert.equal(accepted.geometryGeneration,null);
});

test('selected direct, first and second order traces are the exact solver results and retarded endpoints',()=>{
  const scene=fixture('enclosure').scene,sim=new CausalSimulation(scene),tel=new SoundMapTelemetry({enabled:true,maxPaths:256});
  for(let t=0;t<=.5+1e-9;t+=.025)step(sim,tel,t,{moving:true});
  const r=step(sim,tel,.55,{moving:true}),frame=r.soundMapFrame;
  const selected=frame.paths.filter(p=>p.status==='selected');
  assert.deepEqual(selected.map(p=>p.id).sort(),r.control.paths.map(p=>p.id).sort());
  for(const visual of selected){
    const actual=r.control.paths.find(p=>p.id===visual.id),trace=sim.soundMapState.candidates.find(p=>p.identity===visual.id);
    assert.deepEqual(visual.points,trace.result.points);assert.deepEqual(visual.bands,actual.bands);
    assert.notEqual(visual.bands,actual.bands,'debug consumers cannot mutate acoustic gain controls');
    assert.equal(visual.delay,actual.delay);assert.equal(visual.rate,actual.rate);
    assert.deepEqual(visual.vertices,[trace.plan.state.position,...trace.result.points,trace.plan.listener.position]);
    assert.ok(visual.sourceAtEmission[0]<frame.sources[0].position[0]);
    visual.points.forEach((p,i)=>assert.ok(onPatch(scene.tile.surfaces.find(s=>s.id===visual.surfaceIds[i]),p)));
  }
  for(const order of [0,1,2])assert.ok(selected.some(p=>p.order===order),'actual selected order '+order);
  assert.ok(frame.paths.some(p=>p.status==='rejected'&&p.vertices===null),'invalid contact is not invented');
  assert.ok(frame.paths.every(p=>p.visibility!=='physically-simulated-wavefront'));
});

test('unknown visibility, obstruction and pruned valid paths remain distinct',()=>{
  const base=fixture('enclosure').scene;
  const pruned=new CausalSimulation(base);pruned.setProcessingSettings({pathBudget:1,maxReflectors:8});
  const tel=new SoundMapTelemetry({enabled:true});step(pruned,tel,0);
  const frame=step(pruned,tel,.2).soundMapFrame;
  assert.equal(frame.paths.filter(p=>p.status==='selected').length,1);
  assert.ok(frame.paths.some(p=>p.status==='pruned'&&p.solverStatus==='renderable'));
  const input=structuredClone(base.tile);input.missingRegions=[{id:'unknown-gap',bounds:{min:[-1,-1,.5],max:[1,1,1.5]},reason:'unobserved'}];
  const unknownSim=new CausalSimulation(acousticScene(createTile(input),base.materials,base.config)),ut=new SoundMapTelemetry({enabled:true});
  step(unknownSim,ut,0);const unknown=step(unknownSim,ut,.2).soundMapFrame.paths.find(p=>p.candidateId==='direct');
  assert.equal(unknown.status,'unknown');assert.equal(unknown.solverStatus,'unknown');assert.ok(unknown.vertices);
  const obstructed=new CausalSimulation(fixture('obstructed-corner').scene),ot=new SoundMapTelemetry({enabled:true});
  step(obstructed,ot,0);const direct=step(obstructed,ot,.2).soundMapFrame.paths.find(p=>p.candidateId==='direct');
  assert.equal(direct.status,'selected');assert.equal(direct.propagation,'obstructed');assert.match(direct.visibility,/transmission/);
});

test('missing geometry remains unknown, live native transform and original leases are exact, expiry removes geometry',()=>{
  const sim=new CausalSimulation(null,{allowMissingScene:true}),tel=new SoundMapTelemetry({enabled:true});
  const input=new ObservedSimulationInput(sim,['beacon-0']);
  const update=(now,events=[])=>{
    tel.begin(sim,now*1000);const e=nativeEnvelope(now,Math.round(now*100)),anchor={...e,queueAgeMs:0};
    input.consume(events,anchor,now);const control=input.update({session:e.state.session,generation:1,listener:e.state,emitting:true},anchor,now);
    return {control,...tel.publish(sim,control,{producedAtUnixMs:0})};
  };
  const missing=update(0,[liveConfiguration()]);assert.equal(missing.soundMapFrame.geometryGeneration,null);
  assert.equal(missing.soundMapFrame.diagnostics.reason,'geometry-unavailable');assert.equal(missing.soundMapFrame.paths.length,0);
  assert.equal(missing.soundMapFrame.sources[0].valid,true);
  const observed=update(.1,[geometryEvent(.1,1)]),g=observed.soundMapGeometry,f=observed.soundMapFrame;
  f.listener.position.forEach((x,i)=>assert.ok(Math.abs(x-[1,-3,7][i])<1e-10));
  assert.deepEqual(f.listener.position,observed.control.geometry.mappedListener.position);
  assert.deepEqual(f.sources[0].position,observed.control.geometry.mappedSources['beacon-0'].position);
  assert.equal(g.coverage,'partial');assert.equal(g.unknownSpace,'all-space-outside-observed-patches');assert.equal(g.visualContext.length,0);
  assert.equal(g.validUntil,11099);assert.equal(g.clockDomain,'publisher-monotonic-ms');
  assert.equal(g.calibration.metresPerNativeUnit,10);assert.equal(g.calibration.physicalCalibration,'unverified');
  assert.equal(f.listenerObservation.observationTicks,nativeEnvelope(.1).state.observationTicks);
  for(const surface of g.surfaces){
    const original=sim.scene.tile.surfaces.find(s=>s.id===surface.id);
    assert.equal(surface.vertices.length,original.footprint.length);
    surface.vertices.forEach(p=>assert.ok(onPatch(original,p)));
    assert.equal(surface.material.basis,'authored-assumption');
  }
  const expired=update(1.1);assert.equal(expired.soundMapFrame.geometryGeneration,null);
  assert.equal(expired.soundMapFrame.geometryStatus.mode,'expired');assert.equal(expired.soundMapFrame.paths.length,0);
  assert.equal(expired.soundMapGeometry,undefined);
});

test('visual byte/path caps omit diagnostics explicitly and preserve all audio controls',()=>{
  const sim=new CausalSimulation(fixture('enclosure').scene),tel=new SoundMapTelemetry({enabled:true,maxPaths:2});
  step(sim,tel,0);const r=step(sim,tel,.3),f=r.soundMapFrame;
  assert.equal(f.paths.length,2);assert.ok(r.control.paths.length>2);assert.ok(f.diagnostics.omittedPaths>0);
  assert.equal(f.diagnostics.omittedSelectedPaths,r.control.paths.length-2);assert.ok(f.paths.every(p=>p.status==='selected'));
  assert.ok(Buffer.byteLength(JSON.stringify(f))<=soundMapLimits.frameBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(tel.cachedGeometry))<=soundMapLimits.geometryBytes);
});

test('accelerated batch completion publishes only the exact applied solver results',async()=>{
  const sim=new CausalSimulation(fixture('enclosure').scene),tel=new SoundMapTelemetry({enabled:true});
  step(sim,tel,0);tel.begin(sim,200);sim.observe(observation(.2));
  const backend={query:async(tile,segments)=>segments.map(s=>querySegment(tile,s.a,s.b))};
  const control=await sim.updateAccelerated(.2,{},backend),r=tel.publish(sim,control);
  assert.deepEqual(r.soundMapFrame.paths.filter(p=>p.status==='selected').map(p=>p.id).sort(),control.paths.map(p=>p.id).sort());
  assert.equal(r.soundMapFrame.settings.acoustic,null,'no GPU execution claim from injected CPU fixture');
});

function renderWithTelemetry(enabled){
  const c=originalCase('canyon'),sim=new CausalSimulation(c.scene),tel=new SoundMapTelemetry({enabled,fps:20}),frames=48000;
  const dsp=new StreamingRenderer({sourceIds:[c.source.id],masterGain:1});
  const left=new Float32Array(frames),right=new Float32Array(frames),l=new Float32Array(512),r=new Float32Array(512),dry=new Float32Array(512),controls=[];
  let visual=0;
  for(let at=0;at<frames;at+=512){
    const now=at/48000,count=Math.min(512,frames-at);tel.begin(sim,now*1000);sim.observe(observationAt(c,now));
    const control=sim.update(now);controls.push(control);if(tel.publish(sim,control).soundMapFrame)visual++;
    dsp.accept(control);dry.fill(0);dry.set(c.source.pcm.subarray(at,at+count));dsp.process({[c.source.id]:dry},l,r,count);
    left.set(l.subarray(0,count),at);right.set(r.subarray(0,count),at);
  }
  return {left,right,controls,visual};
}
test('enabled SoundMap has identical selected controls and owned output PCM at 20 fps',()=>{
  const off=renderWithTelemetry(false),on=renderWithTelemetry(true);
  assert.deepEqual(on.controls,off.controls);assert.deepEqual(on.left,off.left);assert.deepEqual(on.right,off.right);
  assert.ok(on.left.some(x=>x!==0));assert.ok(on.visual>=18&&on.visual<=20);assert.equal(off.visual,0);
});

test('actual worker export is opt-in, preserves controls, sends generation once and reissues it on reset',async t=>{
  const workers=[false,true].map(enabled=>new Worker(new URL('../src/acoustics/streaming/simulation-worker.mjs',import.meta.url),
    {workerData:{scene:'enclosure',sourceIds:['beacon'],controlledClock:true,soundMap:{enabled,fps:20}}}));
  t.after(()=>Promise.all(workers.map(w=>w.terminate())));
  let id=0;
  const ask=(worker,now,reset=false)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('SoundMap worker deadline')),3000);
    worker.once('message',r=>{clearTimeout(timer);r.error?reject(Error(r.error)):resolve(r);});
    worker.postMessage({id:++id,now,snapshot:observation(now),soundMapReset:reset});
  });
  for(const now of [0,.1,.125,.15,.2]){
    const [off,on]=await Promise.all(workers.map(w=>ask(w,now,now===.2)));
    assert.deepEqual(on.control,off.control);assert.equal(off.soundMapFrame,undefined);
    if(now===.125)assert.equal(on.soundMapFrame,undefined);
    else {assert.ok(on.soundMapFrame);assert.equal(Boolean(on.soundMapGeometry),now===0||now===.2);}
  }
});

test('report paired 20 fps telemetry overhead on original CPU fixtures without performance claims about GTA',()=>{
  const run=enabled=>{
    const sim=new CausalSimulation(fixture('enclosure').scene),tel=new SoundMapTelemetry({enabled,fps:20});
    const durations=[],publish=[];const cpu=process.cpuUsage(),start=performance.now();
    for(let i=0;i<240;i++){
      const at=performance.now();const r=step(sim,tel,i*.025);durations.push(performance.now()-at);
      if(r.soundMapFrame)publish.push(r.soundMapFrame.performance.telemetryMs);
    }
    const used=process.cpuUsage(cpu),wallMs=performance.now()-start;
    const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]??null;
    return {wallMs,cpuMs:(used.user+used.system)/1000,updates:240,visualFrames:publish.length,
      updateP50Ms:percentile(durations,.5),updateP95Ms:percentile(durations,.95),updateMaxMs:Math.max(...durations),
      serializationP95Ms:percentile(publish,.95)};
  };
  run(false);run(true);const pairs=Array.from({length:3},()=>({disabled:run(false),enabled:run(true)}));
  for(const p of pairs){assert.equal(p.disabled.visualFrames,0);assert.equal(p.enabled.visualFrames,120);}
  console.log(JSON.stringify({soundMapOfflineOverhead:{scene:'original-enclosure',sources:1,visualFps:20,solverHz:40,
    hardwareGpuDispatches:0,pcmEquality:'separate bit-identical regression',pairs}}));
});
