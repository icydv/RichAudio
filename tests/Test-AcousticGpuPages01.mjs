// Original finite geometry and explicit protocol controls. GPU hardware is
// exercised only with an explicitly selected freshly built helper executable.
import test from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {AcousticGpuClient,gpuMaskLayout,gpuMaskWords} from '../src/acoustics/gpu/client.mjs';
import {AcousticAcceleration} from '../src/acoustics/streaming/acoustic-backend.mjs';
import {prepareGpuGeometry01,preparedGpuGeometry01,adoptSourceBoundGpuGeometry01} from '../src/acoustics/gpu/geometry.mjs';
import {createTile,coordinateSpace,timeUnit,querySegment} from '../src/acoustics/research/local-geometry.mjs';
const cap={schemaVersion:1,supported:true,hardware:true,api:'Direct3D11-ComputeShader5',device:'ORIGINAL-PROTOCOL-FIXTURE-NOT-HARDWARE',maximumSegments:4096,maximumSurfaces:4096,visibilityProtocol:2,legacyVisibilityProtocol:1,surfacePageSize:128,maximumSurfacePages:32,maskLayout:gpuMaskLayout};
const clean=({surfaceTests,...rest})=>rest;
function original(count){
 const surfaces=Array.from({length:count},(_,i)=>({id:'original:'+String(i).padStart(4,'0'),coordinateSpace,center:[Math.floor(i/32)-64,(i%32)*4-62,0],normal:[1,0,0],u:[0,1,0],half:[.9,6],motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-global-page-control'},confidence:1,version:1,observedAt:0,validUntil:10000,...(i===660?{openings:[{min:[-.25,-.25],max:[.25,.25]}]}:{}),...(i===128?{footprint:[[-.9,-6],[.9,-6],[-.9,6]]}:{})}));
 const tile=createTile({schemaVersion:1,id:'original-pages-'+count,coordinateSpace,timeUnit,bounds:{min:[-128,-128,-128],max:[128,128,128]},listenerAnchor:[0,0,0],coverage:'complete-synthetic',surfaces,missingRegions:[{id:'original-unknown',bounds:{min:[-56.1,-62.1,-.1],max:[-55.9,-61.9,.1]},reason:'original-gap'}],version:1,createdAt:0,validUntil:10000,build:'original',session:'original-pages',interior:'outside',dynamicEpoch:0},{maximumSurfaces:4096});
 const selected=[0,31,32,127,128,255,256,660,count-1].filter((i,k,a)=>i<count&&a.indexOf(i)===k),segments=selected.map(i=>{const p=tile.surfaces[i].center;return {a:[p[0]-.2,p[1],p[2]],b:[p[0]+.2,p[1],p[2]]};});
 const last=tile.surfaces.at(-1).center;segments.push({a:[last[0],last[1]-.2,0],b:[last[0],last[1]+.2,0]});
 if(count>128){const p=tile.surfaces[128].center;segments.push({a:[p[0]-.2,p[1]+.7,5],b:[p[0]+.2,p[1]+.7,5]});}
 return {tile,segments,surfaces:tile.surfaces.map(s=>({center:s.center,normal:s.normal,min:[0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i])))}))};
}
function packet({badPadding=false,badVersion=false,badLayout=false}={}){
 const metrics=Buffer.from(JSON.stringify({completedDispatch:true,hardware:true,segments:2,surfacePairs:514,surfaceCount:257,surfacePages:3,maskWordsPerSegment:12,maskLayout:badLayout?'unnegotiated':gpuMaskLayout,readbackCount:1,readbackBytes:96,submitMs:0,completionWaitMs:0,readbackMs:0,totalMs:0,helperCpuMs:0})),bytes=Buffer.alloc(32+metrics.length+96);
 bytes.writeUInt32LE(0x32384f52);bytes.writeUInt32LE(badVersion?1:2,4);bytes.writeUInt32LE(7,8);bytes.writeUInt32LE(4,12);bytes.writeUInt32LE(96,20);bytes.writeUInt32LE(metrics.length,24);metrics.copy(bytes,32);bytes.writeUInt32LE(1,32+metrics.length+8*4);bytes.writeUInt32LE(1,32+metrics.length+16*4);if(badPadding)bytes.writeUInt32LE(2,32+metrics.length+8*4);return bytes;
}
function pending(){const client=new AcousticGpuClient();client.cap=cap;let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});client.pending={id:7,generation:4,protocolVersion:2,maskWordsPerSegment:12,deadlineMs:100,started:performance.now(),maskBytes:96,segmentCount:2,surfaceCount:257,cpuStart:process.cpuUsage(),resolve,reject,timer:setTimeout(()=>{},1000)};return {client,promise};}
test('extended protocol preserves per-segment global page offsets and rejects padding, unnegotiated versions and layout drift',async()=>{
 const f=pending(),bytes=packet();for(let i=0;i<bytes.length;i+=17)f.client.receive(bytes.subarray(i,i+17));const result=await f.promise;assert.equal(result.maskWordsPerSegment,12);assert.equal(result.masks[8],1);assert.equal(result.masks[16],1);f.client.close();
 for(const option of ['badPadding','badVersion','badLayout']){const f=pending(),rejected=assert.rejects(f.promise,/surface mask|protocol mismatch|layout/);f.client.receive(packet({[option]:true}));await rejected;assert.equal(f.client.closed,true);}
});
class AllCandidates {
 constructor(extended=true){this.closed=false;this.extended=extended;this.calls=[];}
 async capability(){return this.extended?cap:{...cap,maximumSurfaces:128,visibilityProtocol:1};}
 prepare(f){const words=gpuMaskWords(f.surfaces.length);this.masks=new Uint32Array(f.segments.length*words);for(let i=0;i<f.segments.length;i++)for(let n=0;n<f.surfaces.length;n++){const ray=f.segments[i],s=f.surfaces[n],da=ray.a.reduce((v,x,k)=>v+(x-s.center[k])*s.normal[k],0),db=ray.b.reduce((v,x,k)=>v+(x-s.center[k])*s.normal[k],0);if(s.min.every((v,k)=>Math.max(ray.a[k],ray.b[k])>=v-.005&&Math.min(ray.a[k],ray.b[k])<=s.max[k]+.005)&&!((da>.005&&db>.005)||(da<-.005&&db<-.005)))this.masks[i*words+(n>>>5)]|=1<<(n&31);}}
 async dispatch(r){const words=gpuMaskWords(r.surfaces.length),masks=r.generation===0?new Uint32Array([1,0,0,0]):this.masks.slice();if(r.generation!==0)this.calls.push(r);return {generation:r.generation,protocolVersion:r.surfaces.length>128?2:1,maskWordsPerSegment:words,masks,metrics:{hardware:true,completedDispatch:true,maskLayout:gpuMaskLayout,readbackCount:1,helperCpuMs:0,helperCumulativeCpuMs:0,gpuTimingValid:false}};}
 close(){this.closed=true;}
}
test('indexed CPU accounting counts actual predicates and labels the Cartesian reference separately',async()=>{
 const f=original(661),segments=f.segments.slice(0,2),expected=segments.map(s=>querySegment(f.tile,s.a,s.b)),actualTests=expected.reduce((n,q)=>n+q.surfaceTests,0),ceiling=segments.length*f.tile.surfaces.length;let clients=0;
 const backend=new AcousticAcceleration({mode:'cpu',clientFactory:()=>{clients++;throw Error('CPU accounting must not create GPU work');}});
 try{assert.ok(actualTests>0&&actualTests<ceiling/10,'the original sparse index must reject most finite supports');const actual=await backend.query(f.tile,segments,{generation:1});assert.deepEqual(actual,expected);const d=backend.diagnostics();assert.equal(d.cpuSurfaceTests,actualTests);assert.equal(d.cartesianReferenceSurfacePairs,ceiling);assert.notEqual(d.cpuSurfaceTests,ceiling);assert.equal(d.calibrationCpuSurfaceTests,0);assert.equal(d.unindexedReferencePairsExcludedByGpu,0);assert.equal(d.avoidedCpuSurfaceTestsDeprecated,true);assert.match(d.avoidedCpuSurfaceTestsScope,/never actual avoided indexed/);assert.equal(d.actualAvoidedIndexedCpuSurfaceTests,null);assert.equal(clients,0);}finally{backend.close();}
});
test('661 and 4096 supports refine exact global identities, openings, finite footprints and unknowns without geometry truncation',async()=>{
 for(const count of [661,4096]){const f=original(count),client=new AllCandidates(),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client,deadlineMs:10});client.prepare(f);backend.prepareGeometry(f.tile);await backend.ready();
  try{const expected=f.segments.map(s=>querySegment(f.tile,s.a,s.b)),actual=await backend.query(f.tile,f.segments,{generation:7});assert.deepEqual(actual.map(clean),expected.map(clean));assert.equal(client.calls.length,1);assert.equal(client.calls[0].surfaces.length,count);assert.equal(backend.diagnostics().gpuResultsApplied,1);assert.equal(backend.diagnostics().surfacePages,Math.ceil(count/128));
   await backend.query(f.tile,f.segments,{generation:8});assert.equal(client.calls[0].surfaces,client.calls[1].surfaces);assert.equal(backend.diagnostics().geometryPackingCached,true);assert.ok(expected.some(q=>q.ambiguous.includes('original:'+String(count-1).padStart(4,'0'))));assert.ok(expected.some(q=>q.unknown.includes('original-unknown')));assert.equal(expected[f.segments.findIndex(s=>s.a[0]===f.tile.surfaces[660].center[0]-.2&&s.a[1]===f.tile.surfaces[660].center[1])].hits.length,0);
  }finally{backend.close();}
 }
});
test('large unprepared scenes stay exact on CPU and source-bound packed bytes reject mismatches/shared backing',async()=>{
 const f=original(661),client=new AllCandidates(),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client});await backend.ready();
 try{assert.deepEqual((await backend.query(f.tile,f.segments,{generation:1})).map(clean),f.segments.map(s=>clean(querySegment(f.tile,s.a,s.b))));assert.equal(client.calls.length,0);assert.match(backend.diagnostics().fallbackReason,/not-prepared/);}finally{backend.close();}
 const packet=prepareGpuGeometry01(f.tile),copy={...packet,bodyBytes:Uint8Array.from(packet.bodyBytes)};const adopted=adoptSourceBoundGpuGeometry01(f.tile,copy),before=adopted.bodyBytes[0];copy.bodyBytes[0]^=255;assert.equal(adopted.bodyBytes[0],before);assert.equal(preparedGpuGeometry01(f.tile),adopted);
 for(const bad of [{...packet,observationKey:'wrong'},{...packet,surfaceCount:660},{...packet,origin:[1,0,0]},{...packet,bodyBytes:packet.bodyBytes.subarray(64)},{...packet,bodyBytes:new Uint8Array(new SharedArrayBuffer(packet.bodyBytes.length))}])assert.throws(()=>adoptSourceBoundGpuGeometry01(f.tile,bad),/header\/backing/);
 assert.throws(()=>adoptSourceBoundGpuGeometry01(Object.freeze(structuredClone(f.tile)),packet),/Validated immutable/);
 const unbound=new AcousticGpuClient();unbound.cap=cap;try{await assert.rejects(unbound.dispatch({segments:f.segments,surfaces:[...f.tile.surfaces],geometry:adopted}),/capability\/count\/identity/);}finally{unbound.close();}
});
test('an older 128-surface helper keeps the entire larger geometry on the exact CPU route',async()=>{const f=original(661),client=new AllCandidates(false),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client});await backend.ready();try{assert.deepEqual((await backend.query(f.tile,f.segments,{generation:1})).map(clean),f.segments.map(s=>clean(querySegment(f.tile,s.a,s.b))));assert.equal(client.calls.length,0);assert.match(backend.diagnostics().fallbackReason,/extended-global-mask/);}finally{backend.close();}});
test('explicit new helper executes one hardware dispatch/readback across all original surface pages',{skip:!process.env.RICHAUDIO_GPU_PAGES_EXE},async t=>{
 const client=new AcousticGpuClient({executable:process.env.RICHAUDIO_GPU_PAGES_EXE});try{const capability=await client.capability();assert.equal(capability.supported,true,capability.reason);assert.equal(capability.hardware,true);assert.equal(capability.visibilityProtocol,2);assert.equal(capability.maximumSurfaces,4096);const retained=[];
  for(const count of [128,129,661,4096]){const f=original(count),result=await client.dispatch({...f,generation:count,deadlineMs:100}),words=gpuMaskWords(count);assert.equal(result.masks.length,f.segments.length*words);assert.equal(result.protocolVersion,count>128?2:1);assert.equal(result.metrics.readbackCount,1);assert.equal(result.metrics.surfacePages,Math.ceil(count/128));
   for(let i=0;i<f.segments.length;i++){const indices=[];for(let n=0;n<count;n++)if(result.masks[i*words+(n>>>5)]&(1<<(n&31)))indices.push(n);const s=f.segments[i];assert.deepEqual(clean(querySegment(f.tile,s.a,s.b,{surfaceIndices:indices})),clean(querySegment(f.tile,s.a,s.b)));}
   retained.push({surfaces:count,segments:f.segments.length,protocolVersion:result.protocolVersion,metrics:result.metrics});
  }
  const maximum=original(4096),rays=Array.from({length:4096},(_,i)=>maximum.segments[i%maximum.segments.length]),geometry=prepareGpuGeometry01(maximum.tile),expected=maximum.segments.map(s=>clean(querySegment(maximum.tile,s.a,s.b))),full=await client.dispatch({segments:rays,surfaces:maximum.tile.surfaces,geometry,generation:4097,deadlineMs:100});assert.equal(full.masks.length,4096*128);assert.equal(full.metrics.readbackBytes,2097152);assert.equal(full.metrics.readbackCount,1);
  for(let i=0;i<rays.length;i++){const indices=[];for(let n=0;n<4096;n++)if(full.masks[i*128+(n>>>5)]&(1<<(n&31)))indices.push(n);assert.deepEqual(clean(querySegment(maximum.tile,rays[i].a,rays[i].b,{surfaceIndices:indices})),expected[i%expected.length]);}
  retained.push({maximumCapacity:true,surfaces:4096,segments:4096,metrics:full.metrics});t.diagnostic(JSON.stringify({scope:'Original geometry hardware correctness with 100ms diagnostic request deadline, not audio headroom qualification',device:capability.device,retained}));
 }finally{client.close();const closure=await client.waitForClose();assert.equal(closure.joined,true);}
});
