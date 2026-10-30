import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { ObservationClock } from '../src/acoustics/streaming/observed-live.mjs';
import { ObservedSimulationInput } from '../src/acoustics/streaming/observed-live.mjs';
import { CausalSimulation } from '../src/acoustics/streaming/causal.mjs';
import { liveConfiguration,nativeEnvelope,geometryEvent } from './fixtures/LiveGeometry.mjs';
import { replayGeometry } from '../tools/audio/geometry-replay.mjs';

test('paired clocks map separate origins, conservatively bound uncertainty and reject incompatible evidence',()=>{
  const c=liveConfiguration().configuration.clock,clock=new ObservationClock(c);
  assert.equal(clock.now({...nativeEnvelope(.2),queueAgeMs:0}).upper,10200);
  assert.throws(()=>clock.now({...nativeEnvelope(.1),queueAgeMs:0}),/reversed/);
  assert.throws(()=>new ObservationClock({}),/paired/);
  const bad=structuredClone(c);bad.samples[1].listenerTicks+=100000;
  assert.throws(()=>new ObservationClock(bad),/disagree/);
  const uncertain=structuredClone(c);for(const p of uncertain.samples)p.uncertaintyMs=.5;
  const t=new ObservationClock(uncertain).now({...nativeEnvelope(.2),queueAgeMs:0});
  assert.equal(t.lower,10199.5);assert.equal(t.upper,10200.5);
  const delivery=structuredClone(c);delivery.delivery.maximumMs=5;
  assert.equal(new ObservationClock(delivery).now({...nativeEnvelope(.2),queueAgeMs:0}).upper,10205);
  const missingDelivery=structuredClone(c);delete missingDelivery.delivery;
  assert.throws(()=>new ObservationClock(missingDelivery),/delivery/);
  assert.throws(()=>clock.now({...nativeEnvelope(121),queueAgeMs:0}),/horizon/);
});

test('actual credit-paced producer renders changing geometry with bounded PCM transitions and retained source history',async()=>{
  const r=await replayGeometry(),{traces,final,metrics}=r;
  assert.equal(final.error,null);assert.equal(metrics.nonfinite,0);assert.equal(metrics.clipped,0);assert.equal(final.dsp.limited,0);
  assert.ok(metrics.peak>.005);assert.ok(metrics.maximumStep<.02);assert.ok(metrics.maximumBlockBoundaryStep<.02);
  assert.equal(traces[40].paths,1);assert.equal(traces[80].paths,4);
  assert.equal(traces[164].paths,0);assert.equal(traces[290].paths,0);
  assert.equal(traces[325].paths,4);assert.equal(traces[444].paths,0);assert.equal(traces[480].paths,4);
  assert.deepEqual(traces[40].sourceGenerations,traces[80].sourceGenerations);
  assert.deepEqual(traces[80].sourceGenerations,traces[130].sourceGenerations);
  assert.notDeepEqual(traces[350].sourceGenerations,traces[360].sourceGenerations);
  assert.notDeepEqual(traces[410].sourceGenerations,traces[430].sourceGenerations);
  assert.notDeepEqual(traces[430].sourceGenerations,traces[480].sourceGenerations);
  assert.equal(final.dsp.pathOverflow,0);assert.equal(final.dsp.cursorResets,0);
  assert.equal(final.historyDiagnostics.affectedFrames,0);
  const energy=(a,b)=>{let sum=0;for(let i=a*512;i<b*512;i++)sum+=r.left[i]**2+r.right[i]**2;return sum;};
  for(const [a,b] of [[30,60],[80,110],[125,155],[205,280],[330,350],[375,410],[485,510]])assert.ok(energy(a,b)>1e-6,'no unexpected silence in valid steady intervals');
  for(const [a,b] of [[170,185],[300,315],[450,460],[550,559]])assert.ok(energy(a,b)<1e-14,'released paths and stopped emission are silent');
  assert.ok(traces.flatMap(t=>t.pathPresentation).every(p=>p.rate>.85&&p.rate<1.15));
  const reference=await replayGeometry({mode:'direct-reference'}),fixed=await replayGeometry({mode:'fixed-scene'}),repeat=await replayGeometry();
  assert.equal(repeat.metrics.sha256,metrics.sha256,'deterministic actual worker/producer PCM');
  assert.deepEqual(r.left.subarray(0,64*512),reference.left.subarray(0,64*512),'matched direct-only prefix');
  let difference=0;for(let i=80*512;i<110*512;i++)difference+=(r.left[i]-reference.left[i])**2+(r.right[i]-reference.right[i])**2;
  assert.ok(difference>1e-3,'geometry changes actual samples, not only metadata');
  assert.ok(fixed.metrics.peak>0);assert.notEqual(fixed.metrics.sha256,metrics.sha256);
  assert.equal(final.ownedArrayBytes,reference.final.ownedArrayBytes);
  // The corrected route reserves one three-band Float64 attack target for
  // each of the 24 fixed path/release slots; geometry updates do not grow it.
  assert.equal(final.ownedArrayBytes,fixed.final.ownedArrayBytes+24*3*Float64Array.BYTES_PER_ELEMENT);
  console.log(JSON.stringify({integration:metrics,simulationMs:final.statistics.simulationMs,dspMs:final.statistics.dspMs,
    ownedArrayBytes:final.ownedArrayBytes,memory:final.memory,history:final.historyDiagnostics}));
});

test('actual simulation worker maps native poses, replaces geometry, retains histories and expires without a scene fallback',async t=>{
  const worker=new Worker(new URL('../src/acoustics/streaming/simulation-worker.mjs',import.meta.url),
    {workerData:{geometry:true,sourceIds:['beacon-0'],controlledClock:true}});
  t.after(()=>worker.terminate());let id=0;
  function update(now,events=[],overrides={}){return new Promise((resolve,reject)=>{
    const m=nativeEnvelope(now,id++,overrides),timer=setTimeout(()=>reject(Error('worker deadline')),3000);
    worker.once('message',r=>{clearTimeout(timer);if(r.error)reject(Error(r.error));else resolve(r.control);});
    worker.postMessage({id,now,geometryEvents:events,anchor:{...m,queueAgeMs:0},
      snapshot:{time:now,session:m.state.session,generation:m.state.generation,listener:m.state,paused:false,emitting:true}});
  });}
  await update(0,[liveConfiguration(),geometryEvent(0,1,{empty:true})]);
  const direct=await update(.1);
  assert.equal(direct.paths.length,1);assert.equal(direct.paths[0].order,0);
  direct.geometry.mappedListener.position.forEach((x,i)=>assert.ok(Math.abs(x-[1,-3,7][i])<1e-10));
  const reflected=await update(.2,[geometryEvent(.2,2)]);
  assert.equal(reflected.paths.length,4);
  assert.deepEqual(reflected.sourceGenerations,direct.sourceGenerations);
  assert.equal(reflected.stats.resets,direct.stats.resets);
  assert.ok(Math.abs(reflected.paths.find(p=>p.order===0).delay-Math.sqrt(.37)*10/343)<1e-10);
  const changed=await update(.25,[geometryEvent(.25,3,{wallY:.6})]);
  assert.equal(changed.paths.find(p=>p.order===0).id,direct.paths[0].id);
  assert.notEqual(changed.paths.find(p=>p.order===1).id,reflected.paths.find(p=>p.order===1).id);
  assert.ok(changed.paths.every(p=>p.rate>.9&&p.rate<1.1));
  const expired=await update(1.25);
  assert.equal(expired.paths.length,0);assert.equal(expired.geometry.mode,'expired');
  assert.deepEqual(expired.sourceGenerations,direct.sourceGenerations);
  const stale=await update(1.3,[geometryEvent(.25,4)]);
  assert.equal(stale.paths.length,0);assert.match(stale.geometry.reason,/stale/);
  const duplicate=await update(1.35,[geometryEvent(1.35,3)]);
  assert.equal(duplicate.paths.length,0);assert.match(duplicate.geometry.reason,/revision/);
});

test('invalid clock, coordinate, pose and ownership inputs release geometry without synthetic substitution',()=>{
  const cases=[
    ['unpaired clock',(c)=>{delete c.configuration.clock;}],
    ['measured scale',(c)=>{c.configuration.coordinates.basis='measured';}],
    ['unowned source',(c)=>{c.configuration.sources[0].rights='gta-stock-audio';}],
  ];
  for(const [name,mutate] of cases){
    const sim=new CausalSimulation(null,{allowMissingScene:true}),input=new ObservedSimulationInput(sim,['beacon-0']),c=liveConfiguration();
    mutate(c);input.consume([c],null,0);assert.equal(input.config,null,name);assert.equal(sim.scene,null);
  }
  for(const changes of [{clockFrequency:20000000},{session:'c'.repeat(32)},{coordinates:'research-rh-z-up-metres-v1',units:'metres'},
    {velocity:[20,0,0]},{position:[1000,200,3]}]){
    const sim=new CausalSimulation(null,{allowMissingScene:true}),input=new ObservedSimulationInput(sim,['beacon-0']);
    const step=(now,events=[],overrides={})=>{const e=nativeEnvelope(now,Math.round(now*100),overrides),anchor={...e,queueAgeMs:0};
      input.consume(events,anchor,now);return input.update({session:e.state.session,generation:1,listener:e.state,emitting:true},anchor,now);};
    step(0,[liveConfiguration(),geometryEvent(0,1)]);assert.ok(step(.1).paths.length);
    const bad=step(.2,[],changes);assert.equal(bad.paths.length,0);assert.equal(sim.scene,null);
    assert.match(bad.geometry.mode,/unavailable/);
  }
  const sim=new CausalSimulation(null,{allowMissingScene:true}),input=new ObservedSimulationInput(sim,['beacon-0']);
  input.consume([liveConfiguration()],null,0);
  const changed=liveConfiguration(2);changed.configuration.coordinates.metresPerNativeUnit=2;
  input.consume([changed],null,.1);assert.equal(input.config,null);assert.match(input.status.reason,/new listener generation/);
});

test('actual worker includes monotonic dispatch age and rejects geometry that expired in its queue',async t=>{
  const worker=new Worker(new URL('../src/acoustics/streaming/simulation-worker.mjs',import.meta.url),
    {workerData:{geometry:true,sourceIds:['beacon-0'],controlledClock:false}});
  t.after(()=>worker.terminate());
  const e=nativeEnvelope(.95),reply=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('worker deadline')),3000);
    worker.once('message',r=>{clearTimeout(timer);r.error?reject(Error(r.error)):resolve(r.control);});
    worker.postMessage({id:1,now:0,geometryEvents:[liveConfiguration(),geometryEvent(0,1)],
      anchor:{...e,queueAgeMs:0,dispatchNs:(process.hrtime.bigint()-50000000n).toString()},
      snapshot:{session:e.state.session,generation:1,listener:e.state,emitting:true}});
  });
  assert.equal(reply.paths.length,0);assert.match(reply.geometry.reason,/stale/);
  assert.ok(reply.geometry.clock.upper>=11000,'queue time cannot renew the original lease');
});
