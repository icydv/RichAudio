import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {AcousticGpuClient} from '../src/acoustics/gpu/client.mjs';
import {createTile,coordinateSpace,timeUnit,querySegment,add,scale,sub,dot} from '../src/acoustics/research/local-geometry.mjs';

test('missing compute helper reports unavailable rather than claiming GPU execution',async()=>{
  const client=new AcousticGpuClient({executable:'RichAudio-Deliberately-Absent-Compute-Helper.exe'});
  const cap=await client.capability();assert.equal(cap.supported,false);assert.equal(cap.hardware,false);
  await assert.rejects(client.dispatch({}),/GPU unavailable/);client.close();
});

// Protocol-only fixture: synthetic completion frames exercise rejection logic;
// these tests do not count as hardware verification or invoke a mock GPU kernel.
function protocolFixture({generation=4,deadlineMs=100,started=performance.now()}={}){
  const client=new AcousticGpuClient();client.cap={supported:true};let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  client.pending={id:7,generation,deadlineMs,started,maskBytes:16,segmentCount:1,surfaceCount:1,cpuStart:process.cpuUsage(),resolve,reject,timer:setTimeout(()=>{},1000)};
  return {client,promise};
}
function response({generation=4,mask=1}={}){
  const metrics=Buffer.from(JSON.stringify({completedDispatch:true,hardware:true,segments:1,surfacePairs:1,submitMs:.1,completionWaitMs:.1,readbackMs:.01,totalMs:.21,helperCpuMs:0}));
  const b=Buffer.alloc(32+metrics.length+16);b.writeUInt32LE(0x32384f52);b.writeUInt32LE(1,4);b.writeUInt32LE(7,8);b.writeUInt32LE(generation,12);b.writeUInt32LE(16,20);b.writeUInt32LE(metrics.length,24);metrics.copy(b,32);b.writeUInt32LE(mask,32+metrics.length);return b;
}
test('GPU completion parser rejects wrong generations, late replies and invalid mask bits',async()=>{
  for(const scenario of ['generation','late','mask']){
    const f=protocolFixture(scenario==='late'?{deadlineMs:1,started:performance.now()-20}:{});
    const rejection=assert.rejects(f.promise,scenario==='generation'?/generation/:scenario==='late'?/deadline/:/surface mask/);
    const bytes=response(scenario==='generation'?{generation:5}:scenario==='mask'?{mask:2}:{});
    f.client.receive(bytes.subarray(0,11));f.client.receive(bytes.subarray(11));await rejection;assert.equal(f.client.stats.completed,0);assert.equal(f.client.closed,true);
  }
});
test('GPU completion parser accepts bounded fragmented framing and ownership closure rejects pending work',async()=>{
  const f=protocolFixture();const bytes=response();for(let i=0;i<bytes.length;i+=7)f.client.receive(bytes.subarray(i,i+7));
  const result=await f.promise;assert.deepEqual([...result.masks],[1,0,0,0]);assert.equal(result.generation,4);f.client.close();
  const pending=protocolFixture();const rejection=assert.rejects(pending.promise,/closed/);pending.client.close();await rejection;
});

function geometryFixture(){
  let seed=0x824aa11;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const surfaces=[];
  for(let i=0;i<128;i++){
    const axis=i%3;let normal=[0,0,0],u=[0,0,0];normal[axis]=1;u[(axis+1)%3]=1;
    if(i%4===3){normal=[1,2,3].map(x=>x/Math.sqrt(14));u=[2,-1,0].map(x=>x/Math.sqrt(5));}
    const center=Array.from({length:3},()=>random()*180-90),half=[.5+random()*6,.5+random()*6];
    surfaces.push({id:'patch-'+String(i).padStart(3,'0'),coordinateSpace,center,normal,u,half,motion:'static',reflectiveSide:'both',
      provenance:{kind:'synthetic',reference:'original-gpu-fixture'},confidence:1,version:1,observedAt:0,validUntil:10000,
      ...(i===0?{openings:[{min:[-.2,-.2],max:[.2,.2]}]}:{}),
      ...(i===1?{footprint:[[-half[0],-half[1]],[half[0],-half[1]],[0,half[1]]]}:{})});
  }
  const tile=createTile({schemaVersion:1,id:'gpu-device-fixture',coordinateSpace,timeUnit,bounds:{min:[-128,-128,-128],max:[128,128,128]},listenerAnchor:[0,0,0],coverage:'complete-synthetic',surfaces,
    missingRegions:[{id:'unknown-region',bounds:{min:[-1,-1,-1],max:[1,1,1]},reason:'original-fixture-gap'}],version:1,createdAt:0,validUntil:10000,build:'synthetic',session:'gpu-test',interior:'outside',dynamicEpoch:0});
  const segments=[];for(let i=0;i<4020;i++)segments.push({a:Array.from({length:3},()=>random()*250-125),b:Array.from({length:3},()=>random()*250-125)});
  for(const s of tile.surfaces.slice(0,12)){
    const corner=add(s.center,add(scale(s.u,s.half[0]),scale(s.v,s.half[1])));
    segments.push({a:add(s.center,scale(s.normal,-2)),b:add(s.center,scale(s.normal,2))},
      {a:add(s.center,scale(s.u,-s.half[0])),b:add(s.center,scale(s.u,s.half[0]))},
      {a:add(corner,scale(s.normal,2)),b:corner},
      {a:add(s.center,scale(s.normal,.004)),b:add(add(s.center,scale(s.normal,.004)),scale(s.u,2))});
  }
  return {tile,segments,surfaces:tile.surfaces.map(s=>({center:s.center,normal:s.normal,min:[0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i])))}))};
}
const withoutCost=({surfaceTests,...rest})=>rest;
test('actual hardware finite-surface dispatch preserves exact CPU hit/ambiguity/opening/footprint results',async t=>{
  const client=new AcousticGpuClient();
  try{
    const cap=await client.capability();if(!cap.supported){t.skip('Real GPU execution unverified: '+cap.reason);return;}
    assert.equal(cap.hardware,true);assert.equal(cap.usesHardwareRayTracing,false);assert.equal(cap.rayTracingCapability,'not-probed');
    const fixture=geometryFixture();const beforeCpu=process.cpuUsage();let started=performance.now();
    const reference=fixture.segments.map(ray=>querySegment(fixture.tile,ray.a,ray.b));const cpuFullMs=performance.now()-started;const cpuFullUsage=process.cpuUsage(beforeCpu);
    started=performance.now();const result=await client.dispatch({...fixture,generation:31,deadlineMs:100});
    assert.equal(result.generation,31);assert.equal(result.metrics.completedDispatch,true);assert.equal(result.metrics.hardware,true);assert.equal(result.metrics.gpuTimingValid,true);
    assert.ok(Number.isFinite(result.metrics.gpuExecutionMs)&&result.metrics.gpuExecutionMs>0);
    let selected=0;
    for(let i=0;i<fixture.segments.length;i++){
      const indices=[];for(let k=0;k<fixture.surfaces.length;k++)if((result.masks[i*4+(k>>5)]&(1<<(k&31)))!==0)indices.push(k);
      selected+=indices.length;const ray=fixture.segments[i],refined=querySegment(fixture.tile,ray.a,ray.b,{surfaceIndices:indices});
      assert.deepEqual(withoutCost(refined),withoutCost(reference[i]));
    }
    const gpuWithRefinementMs=performance.now()-started;assert.ok(selected<fixture.segments.length*fixture.surfaces.length*.25,'actual GPU culls most exact CPU surface tests');
    t.diagnostic(JSON.stringify({hardwareTest:true,device:cap.device,segments:fixture.segments.length,surfacePairs:result.metrics.surfacePairs,cpuFullMs,cpuFullProcessMs:(cpuFullUsage.user+cpuFullUsage.system)/1000,
      gpuWithExactRefinementAndAssertionsMs:gpuWithRefinementMs,selectedCpuSurfaceTests:selected,fullCpuSurfaceTests:fixture.segments.length*fixture.surfaces.length,gpu:result.metrics}));
    const next=await client.dispatch({segments:[{a:[-1,0,0],b:[1,0,0]}],surfaces:[{center:[0,0,0],normal:[1,0,0],min:[0,-1,-1],max:[0,1,1]}],generation:32,deadlineMs:100});
    assert.equal(next.generation,32);assert.equal(next.masks[0],1);assert.ok(next.requestId>result.requestId);
  }finally{client.close();}
});
