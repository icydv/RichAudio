import test from 'node:test';
import assert from 'node:assert/strict';
import {replayAcousticAcceleration} from '../tools/audio/acoustic-acceleration-replay.mjs';
import {AcousticGpuClient} from '../src/acoustics/gpu/client.mjs';
import {ObservedSimulationInput} from '../src/acoustics/streaming/observed-live.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
import {scenario} from '../tools/acoustics-08-2-scenes.mjs';
import {liveConfiguration,nativeEnvelope,geometryEvent} from './fixtures/LiveGeometry.mjs';

test('actual RA07 producer applies 12/16/32/64 quality budgets live without replacing source history',async()=>{
  const r=await replayAcousticAcceleration({quality:'performance',acceleration:'cpu',blocks:192,changes:[
    {block:48,revision:1,quality:'balanced',acceleration:'cpu'},
    {block:72,revision:2,quality:'quality',acceleration:'cpu'},
    {block:96,revision:3,quality:'max',acceleration:'cpu'},
    {block:128,revision:4,quality:'auto',acceleration:'cpu'}]});
  for(const [at,budget]of[[40,12],[60,16],[84,32],[112,64],[144,12]]){
    assert.equal(r.traces[at].acoustic.pathBudget,budget);assert.equal(r.traces[at].paths,budget);
  }
  assert.equal(r.final.acousticSettings.requestedAcceleration,'cpu');assert.equal(r.final.acousticSettings.gpuAcousticDispatches,0);
  assert.equal(r.final.acousticSettings.requestedQuality,'auto');
  assert.ok(r.statuses.some(s=>s.activeQuality==='max'));assert.equal(r.final.simulation.resets,1);
});

test('Auto quality and acceleration retain the CPU route for small genuine path demand',async()=>{
  const r=await replayAcousticAcceleration({quality:'auto',acceleration:'auto',scenario:'small',blocks:112});
  assert.ok(r.traces.every(t=>t.acoustic.activeQuality==='performance'&&t.acoustic.activeAcceleration==='cpu'));
  assert.equal(r.final.acousticSettings.gpuAcousticDispatches,0);assert.equal(r.final.acousticSettings.initializationAttempts,0);
  assert.equal(r.final.acousticSettings.gpuCapability,'unverified');assert.equal(Math.max(...r.traces.map(t=>t.paths)),2);
});

test('actual CPU, GPU and Auto workers feed bit-identical RA07 PCM at matching Quality settings',async t=>{
  const probe=new AcousticGpuClient();let capability;try{capability=await probe.capability();}finally{probe.close();}
  if(!capability.supported){t.skip('Real GPU producer execution unverified: '+capability.reason);return;}
  const cpu=await replayAcousticAcceleration({quality:'quality',acceleration:'cpu'});
  const gpu=await replayAcousticAcceleration({quality:'quality',acceleration:'gpu'});
  const auto=await replayAcousticAcceleration({quality:'quality',acceleration:'auto'});
  assert.equal(gpu.sha256,cpu.sha256);assert.deepEqual(gpu.raw,cpu.raw);
  assert.equal(auto.sha256,cpu.sha256);assert.deepEqual(auto.raw,cpu.raw);
  assert.ok(gpu.traces.some(b=>b.paths>0&&b.acoustic.activeAcceleration==='gpu'&&b.acoustic.gpuResultsApplied>0));
  assert.ok(gpu.final.acousticSettings.gpuCompletedBatches>0);assert.match(gpu.final.acousticSettings.gpuCapability,/hardware/);
  assert.ok(gpu.traces.every(b=>b.workerSchedulingMilliseconds>=0));
  t.diagnostic(JSON.stringify({hardwareGpuProducer:true,device:capability.device,frames:gpu.final.frames,
    bitExactCpuPcm:true,bitExactAutoPcm:true,gpuResultsApplied:gpu.final.acousticSettings.gpuResultsApplied,
    autoGpuResultsApplied:auto.final.acousticSettings.gpuResultsApplied,
    maximumWorkerSchedulingMs:Math.max(...gpu.traces.map(b=>b.workerSchedulingMilliseconds)),
    maximumGpuQueryMs:Math.max(...gpu.traces.filter(b=>b.acoustic.activeAcceleration==='gpu').map(b=>b.acoustic.taskWallMs))}));
});

test('geometry expiring while asynchronous visibility completes is withdrawn without source-history reset',async()=>{
  const simulation=new CausalSimulation(null,{allowMissingScene:true}),observed=new ObservedSimulationInput(simulation,['beacon-0']);
  const anchor=nativeEnvelope(.995),events=[liveConfiguration(),geometryEvent(0,1)];observed.consume(events,{...anchor,queueAgeMs:0},.2);
  let elapsed=0;const refresh=()=>({...anchor,queueAgeMs:elapsed});
  const snapshot={session:anchor.state.session,generation:1,listener:anchor.state,emitting:true};
  // No GPU claim: this is an asynchronous boundary fixture crossing the original
  // lease, independent of hardware. The valid pose is observed only once.
  const first=await observed.updateAccelerated(snapshot,refresh(),.2,{query:async()=>{elapsed=10;return [];}},refresh);
  assert.equal(first.paths.length,0);assert.equal(simulation.stats.resets,1);assert.equal(simulation.scene,null);
  assert.equal(first.geometry.mode,'expired');
});

test('prepared acoustic results cannot apply after a source, session, geometry or quality context change',async()=>{
  for(const change of ['source','session','geometry','quality']){
    const f=scenario('small'),s=new CausalSimulation(f.scene);s.observe(f.snapshot(0));s.observe(f.snapshot(.1));
    let complete;const result=s.updateAccelerated(.1,{}, {query:()=>new Promise(resolve=>{complete=resolve;})});
    if(change==='quality')s.setProcessingSettings({pathBudget:64,maxReflectors:16});
    else if(change==='geometry')s.replaceScene(scenario('enclosure').scene);
    else{const next=f.snapshot(.2);if(change==='source')next.sources[0].generation++;else next.session+='-new';s.observe(next);}
    complete([]);await assert.rejects(result,/superseded|out-of-generation/,change);
    assert.equal(s.previous.size,0,'rejected work cannot mutate path-rate history');
  }
});

test('prepared acoustic results reject duplicate or older completion before touching path history',()=>{
  const f=scenario('small'),s=new CausalSimulation(f.scene);s.observe(f.snapshot(0));s.observe(f.snapshot(.1));
  const old=s.prepareUpdate(.1),latest=s.prepareUpdate(.11);assert.ok(s.completeUpdate(latest).paths.length);
  const history=JSON.stringify([...s.previous]);assert.throws(()=>s.completeUpdate(old),/superseded/);
  assert.throws(()=>s.completeUpdate(latest),/superseded/);assert.equal(JSON.stringify([...s.previous]),history);
});
