// Backend/policy regressions. The injected clients below are explicitly protocol
// fixtures, not GPU kernels or evidence of hardware execution. Real DirectCompute
// correctness is exercised separately by Test-AcousticGpuDevice.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AcousticAcceleration} from '../src/acoustics/streaming/acoustic-backend.mjs';
import {createTile,coordinateSpace,timeUnit,querySegment} from '../src/acoustics/research/local-geometry.mjs';

const stripCost=({surfaceTests,...rest})=>rest;
function fixture({count=4,wall=true,origin=[0,0,0]}={}){
  const offset=p=>p.map((x,i)=>x+origin[i]);
  const surfaces=Array.from({length:count},(_,i)=>({id:'policy-surface-'+i,coordinateSpace,
    center:offset(wall&&i===0?[0,0,0]:[0,20+i*.2,0]),normal:wall&&i===0?[1,0,0]:[0,1,0],u:wall&&i===0?[0,1,0]:[1,0,0],half:[2,2],
    motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-policy-fixture'},confidence:1,version:1,observedAt:0,validUntil:10000}));
  const tile=createTile({schemaVersion:1,id:'policy-tile',coordinateSpace,timeUnit,bounds:{min:offset([-64,-64,-64]),max:offset([64,64,64])},listenerAnchor:origin,
    coverage:'complete-synthetic',surfaces,missingRegions:[{id:'gap',bounds:{min:offset([-.2,-.2,-.2]),max:offset([.2,.2,.2])},reason:'synthetic-gap'}],
    version:1,createdAt:0,validUntil:10000,build:'synthetic',session:'policy-tests',interior:'outside',dynamicEpoch:0});
  const segments=[{a:offset([-2,0,0]),b:offset([2,0,0])},{a:offset([-2,4,0]),b:offset([2,4,0])},{a:offset([0,-1,0]),b:offset([0,1,0])}];
  return {tile,segments};
}
function reference(tile,segments){return segments.map(s=>querySegment(tile,s.a,s.b));}
function parity(actual,expected){assert.deepEqual(actual.map(stripCost),expected.map(stripCost));}
class ProtocolFixtureClient {
  constructor({supported=true,mask='all'}={}){this.supported=supported;this.mask=mask;this.closed=false;this.acousticCalls=0;this.calls=[];this.corruption=null;this.hold=null;this.extraCpu=0;this.totalCpu=0;}
  async capability(){return {schemaVersion:1,supported:this.supported,hardware:this.supported,device:'PROTOCOL-POLICY-FIXTURE-NOT-HARDWARE-PROOF',reason:'deliberately unsupported policy fixture'};}
  async dispatch(request){
    if(request.generation!==0){this.acousticCalls++;this.calls.push(request);if(this.hold)await this.hold;if(this.corruption==='late')await new Promise(resolve=>setTimeout(resolve,20));}
    const masks=new Uint32Array(request.segments.length*4);
    if(request.generation===0)masks[0]=1;
    else if(this.mask==='all')for(let i=0;i<request.segments.length;i++)for(let k=0;k<request.surfaces.length;k++)masks[i*4+(k>>5)]|=1<<(k&31);
    this.totalCpu+=this.extraCpu;
    const result={generation:request.generation,masks,metrics:{hardware:true,completedDispatch:true,segments:request.segments.length,surfacePairs:request.segments.length*request.surfaces.length,
      submitMs:.01,completionWaitMs:.01,readbackMs:.01,totalMs:.03,helperCpuMs:this.extraCpu,helperCumulativeCpuMs:this.totalCpu,gpuTimingValid:true,gpuExecutionMs:.005,gpuUploadMs:.002,gpuCopyMs:.002,roundTripMs:.05,
      ownedBufferBytes:270352,processVideoMemoryBytes:8000000,processWorkingSetBytes:50000000}};
    if(request.generation!==0){
      if(this.corruption==='generation')result.generation++;
      if(this.corruption==='mask')result.masks[0]=0x80000000;
      if(this.corruption==='type')result.masks=Array.from(masks);
      if(this.corruption==='proof')result.metrics.completedDispatch=false;
      if(this.corruption==='timing'){result.metrics.gpuTimingValid=false;result.metrics.gpuExecutionMs=null;result.metrics.gpuUploadMs=null;result.metrics.gpuCopyMs=null;}
    }
    return result;
  }
  close(){this.closed=true;}
}

test('CPU acceleration uses exact existing hit, ambiguity and unknown-region queries without creating a GPU client',async()=>{
  let creations=0;const backend=new AcousticAcceleration({mode:'cpu',clientFactory:()=>{creations++;throw Error('CPU must not initialize GPU');}});
  const f=fixture();parity(await backend.query(f.tile,f.segments,{generation:2}),reference(f.tile,f.segments));
  const d=backend.diagnostics();assert.equal(creations,0);assert.equal(d.requestedAcceleration,'cpu');assert.equal(d.activeAcceleration,'cpu');assert.equal(d.gpuAcousticDispatches,0);assert.equal(d.cpuSurfaceTests,12);backend.close();
});

test('GPU client construction failure retains the complete CPU backend instead of terminating the worker',async()=>{
  const backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>{throw Error('deliberate device initialization failure');}});
  const f=fixture();parity(await backend.query(f.tile,f.segments,{generation:2}),reference(f.tile,f.segments));
  assert.equal(backend.diagnostics().activeAcceleration,'cpu');assert.match(backend.diagnostics().fallbackReason,/initialization failure/);
  assert.equal(backend.diagnostics().gpuResultsApplied,0);backend.close();
});
test('unsupported compute capability produces explicit CPU fallback and no GPU computation claim',async()=>{
  const client=new ProtocolFixtureClient({supported:false}),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client});await backend.ready();
  const f=fixture();parity(await backend.query(f.tile,f.segments,{generation:3}),reference(f.tile,f.segments));
  const d=backend.diagnostics();assert.equal(d.activeAcceleration,'cpu');assert.equal(d.gpuCapability,'unsupported');assert.match(d.fallbackReason,/unsupported/);assert.equal(d.gpuAcousticDispatches,0);assert.equal(client.acousticCalls,0);backend.close();
});
test('GPU backend keeps native-origin localization separate from exact CPU refinement',async()=>{
  const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'gpu',deadlineMs:10,clientFactory:()=>client});await backend.ready();
  const f=fixture({origin:[90000,-50000,1000]});parity(await backend.query(f.tile,f.segments,{generation:7}),reference(f.tile,f.segments));
  const request=client.calls[0];assert.ok(request.segments.flatMap(s=>[...s.a,...s.b]).every(x=>Math.abs(x)<=64));
  assert.ok(request.surfaces.flatMap(s=>[...s.center,...s.min,...s.max]).every(x=>Math.abs(x)<=64));
  assert.equal(backend.diagnostics().activeAcceleration,'gpu');assert.equal(backend.diagnostics().gpuResultsApplied,1);backend.close();
});
test('wrong-generation, malformed, unproved and late GPU results fall back to complete CPU geometry',async()=>{
  for(const corruption of ['generation','mask','type','proof','late']){
    const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'gpu',deadlineMs:10,clientFactory:()=>client});await backend.ready();client.corruption=corruption;
    const f=fixture();parity(await backend.query(f.tile,f.segments,{generation:8}),reference(f.tile,f.segments));
    const d=backend.diagnostics();assert.equal(d.activeAcceleration,'cpu',corruption);assert.ok(d.fallbackReason,corruption);assert.equal(d.gpuResultsApplied,0,corruption);
    assert.ok(d.droppedResults>=1,corruption);if(corruption==='late')assert.ok(d.deadlineMisses>=1);else assert.ok(d.invalidResults>=1);backend.close();
  }
});
test('one occupied GPU slot causes a bounded CPU route rather than queueing additional work',async()=>{
  const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'gpu',deadlineMs:10,clientFactory:()=>client});await backend.ready();
  let release;client.hold=new Promise(resolve=>{release=resolve;});const f=fixture();
  const first=backend.query(f.tile,f.segments,{generation:9});await Promise.resolve();
  const second=await backend.query(f.tile,f.segments,{generation:10});parity(second,reference(f.tile,f.segments));
  assert.equal(client.acousticCalls,1);assert.equal(backend.diagnostics().activeAcceleration,'cpu');assert.match(backend.diagnostics().fallbackReason,/queue.*occupied/);
  release();parity(await first,reference(f.tile,f.segments));backend.close();
});
test('changing requested backend discards a pending GPU selection without resetting geometry results',async()=>{
  const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'gpu',deadlineMs:10,clientFactory:()=>client});await backend.ready();
  let release;client.hold=new Promise(resolve=>{release=resolve;});const f=fixture();const pending=backend.query(f.tile,f.segments,{generation:11});await Promise.resolve();
  backend.setMode('cpu');release();parity(await pending,reference(f.tile,f.segments));const d=backend.diagnostics();assert.equal(d.requestedAcceleration,'cpu');assert.equal(d.activeAcceleration,'cpu');assert.equal(d.gpuResultsApplied,0);backend.close();
});
test('Auto leaves genuinely small batches on CPU with no acoustic GPU dispatch',async()=>{
  const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'auto',clientFactory:()=>client});await backend.ready();const f=fixture();
  parity(await backend.query(f.tile,f.segments,{generation:12}),reference(f.tile,f.segments));
  assert.equal(backend.diagnostics().activeAcceleration,'cpu');assert.match(backend.diagnostics().fallbackReason,/small-workload/);assert.equal(client.acousticCalls,0);backend.close();
});
test('Auto policy requires repeated timing/CPU wins and a dwell interval before reducing a qualified backend',async()=>{
  let now=0;const client=new ProtocolFixtureClient({mask:'none'}),backend=new AcousticAcceleration({mode:'auto',deadlineMs:10,minimumPairs:4,cooldownMs:100,now:()=>now,clientFactory:()=>client});await backend.ready();
  const f=fixture({wall:false}),expected=reference(f.tile,f.segments),key=Math.floor(Math.log2(f.tile.surfaces.length*f.segments.length));
  // Deliberately supplied policy calibration values, not hardware measurements.
  backend.recordCpu(key,{wallMs:100,cpuMs:100});
  for(let i=0;i<2;i++){parity(await backend.query(f.tile,f.segments,{generation:13}),expected);assert.equal(backend.diagnostics().autoGpuQualified,false);}
  parity(await backend.query(f.tile,f.segments,{generation:13}),expected);assert.equal(backend.diagnostics().autoGpuQualified,true);
  parity(await backend.query(f.tile,f.segments,{generation:13}),expected);assert.equal(backend.diagnostics().activeAcceleration,'gpu');
  client.extraCpu=10000;
  for(let i=0;i<3;i++)parity(await backend.query(f.tile,f.segments,{generation:13}),expected);
  assert.equal(backend.diagnostics().autoGpuQualified,true,'dwell prevents immediate oscillation');
  now=101;parity(await backend.query(f.tile,f.segments,{generation:13}),expected);assert.equal(backend.diagnostics().autoGpuQualified,false);
  parity(await backend.query(f.tile,f.segments,{generation:13}),expected);assert.equal(backend.diagnostics().activeAcceleration,'cpu');backend.close();
});
test('GPU timing unavailable remains unknown in diagnostics rather than becoming zero milliseconds',async()=>{
  const client=new ProtocolFixtureClient(),backend=new AcousticAcceleration({mode:'gpu',deadlineMs:10,clientFactory:()=>client});await backend.ready();client.corruption='timing';const f=fixture();
  parity(await backend.query(f.tile,f.segments,{generation:14}),reference(f.tile,f.segments));const d=backend.diagnostics();assert.equal(d.gpuExecutionMs,null);assert.equal(d.gpuTransferMs,null);assert.equal(d.gpuTimingValid,false);backend.close();
});
test('Auto observes a fresh workload bin before applying an earlier bin GPU qualification',async()=>{
  const client=new ProtocolFixtureClient({mask:'none'}),backend=new AcousticAcceleration({mode:'auto',deadlineMs:10,minimumPairs:4,cooldownMs:100,clientFactory:()=>client});await backend.ready();
  const first=fixture({wall:false}),oldKey=Math.floor(Math.log2(first.tile.surfaces.length*first.segments.length));backend.recordCpu(oldKey,{wallMs:100,cpuMs:100});
  for(let i=0;i<4;i++)await backend.query(first.tile,first.segments,{generation:15});assert.equal(backend.diagnostics().autoGpuQualified,true);
  const next=fixture({count:8,wall:false}),key=Math.floor(Math.log2(next.tile.surfaces.length*next.segments.length));assert.notEqual(key,oldKey);
  parity(await backend.query(next.tile,next.segments,{generation:16}),reference(next.tile,next.segments));
  assert.equal(backend.diagnostics().activeAcceleration,'cpu');assert.equal(backend.diagnostics().invalidResults,0);assert.ok(backend.samples.get(key).cpuWall!==null);backend.close();
});
test('acceleration mode, work count and generation bounds reject invalid configuration',async()=>{
  assert.throws(()=>new AcousticAcceleration({mode:'mock-gpu'}),/policy/);assert.throws(()=>new AcousticAcceleration({deadlineMs:11}),/policy/);
  const backend=new AcousticAcceleration();const f=fixture();assert.throws(()=>backend.setMode('fastest'),/value/);
  await assert.rejects(backend.query(f.tile,Array(16385).fill(f.segments[0])),/batch/);await assert.rejects(backend.query(f.tile,f.segments,{generation:-1}),/batch/);backend.close();
});
