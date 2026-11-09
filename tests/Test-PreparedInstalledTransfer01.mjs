import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import {once} from 'node:events';import {performance} from 'node:perf_hooks';
import {originalPreparedInstalledPacket01} from './fixtures/PreparedInstalledTransfer01.mjs';
import {bindInstalledStaticSceneWorker01,prepareInstalledStaticSceneTransfer01,decodeInstalledStaticScene01,isInstalledStaticScene01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {querySegment,retimeInstalledStaticTile01} from '../src/acoustics/research/local-geometry.mjs';import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';
const workerUrl=new URL('./fixtures/PreparedInstalledTransfer01.worker.mjs',import.meta.url);
test('only actual channel messages adopt full worker validation; foreign copies, wrong epochs and replay fail',async()=>{
 const input=originalPreparedInstalledPacket01(256),worker=new Worker(workerUrl,{workerData:{...input,messages:3}}),adopter=bindInstalledStaticSceneWorker01(worker,{session:input.expected.session}),messages=[];
 const complete=new Promise((resolve,reject)=>{worker.on('message',message=>{if(message.type==='failed'){reject(Error(message.reason));return;}messages.push(message);if(messages.length===3)resolve();});worker.on('error',reject);worker.on('exit',()=>{if(messages.length<3)reject(Error('prepared fixture exited before all messages'));});});
 try{await complete;const retained={...input.expected,requestId:1,bindingEpoch:1};assert.throws(()=>adopter.adopt(structuredClone(messages[0]),retained),/capability/);assert.throws(()=>adopter.adopt(messages[0],{...retained,generation:2}),/request identity/);assert.throws(()=>adopter.adopt(messages[0],retained),/capability/);assert.throws(()=>adopter.adopt(messages[1],{...retained,requestId:2,bindingEpoch:2}),/admission request/);const scene=adopter.adopt(messages[2],{...retained,requestId:3});assert.equal(isInstalledStaticScene01(scene),true);assert.equal(Object.isFrozen(scene.tile.surfaces[0].center),true);assert.throws(()=>{scene.tile.surfaces[0].center[0]=0;},TypeError);assert.throws(()=>adopter.adopt(messages[2],{...retained,requestId:3}),/capability/);}
 finally{adopter.close();await worker.terminate();}
});

test('full pre-transfer decoder still rejects integrity, invalid materials and stale request headers',()=>{
 const input=originalPreparedInstalledPacket01(129),bad=structuredClone(input.packet);bad.tile.surfaces[0].center[0]++;
 assert.throws(()=>prepareInstalledStaticSceneTransfer01(bad,input.expected),/integrity/);assert.throws(()=>prepareInstalledStaticSceneTransfer01(input.packet,{...input.expected,durationMs:999}),/matches request/);
 const material=structuredClone(input.packet);material.materials[Object.keys(material.materials)[0]].reflection[0]=1.1;const {packetDigest,...body}=material;material.packetDigest=digest(body);assert.throws(()=>prepareInstalledStaticSceneTransfer01(material,input.expected),/energy coefficients/);
 const prepared=prepareInstalledStaticSceneTransfer01(input.packet,input.expected);assert.equal(prepared.tileIndex.surfaceCount,129);assert.ok(prepared.tileIndex.index);assert.equal(prepared.scene.tile.surfaces.length,129);
});

test('4096-support transferred BVH and renderer preserve exact geometry predicates and PCM',async t=>{
 const omissions=Array.from({length:40},(_,i)=>({id:'omission-'+i,reason:'surface-capacity',bounds:{min:[-1,i-20,.5],max:[1,i-19.5,1.5]}}));
 const input=originalPreparedInstalledPacket01(4096,omissions),worker=new Worker(workerUrl,{workerData:input}),adopter=bindInstalledStaticSceneWorker01(worker,{session:input.expected.session});
 try{const [message]=await once(worker,'message');assert.equal(message.type,'scene',message.reason);const began=performance.now(),adopted=adopter.adopt(message,{...input.expected,requestId:1,bindingEpoch:1}),adoptionMs=performance.now()-began,oldAt=performance.now(),reference=decodeInstalledStaticScene01(input.packet,input.expected),fullDecodeMs=performance.now()-oldAt;
  for(const segment of [[[-100,-100,-2],[100,100,2]],[[-1,0,1],[1,0,1]],[[-30,-30,0],[30,30,0]]])assert.deepEqual(querySegment(adopted.tile,...segment),querySegment(reference.tile,...segment));
  for(const tile of [adopted.tile,retimeInstalledStaticTile01(reference.tile,50,1050)]){
   assert.deepEqual(querySegment(tile,[-5,.75,1],[5,.75,1]).unknown,[]);
   assert.deepEqual(querySegment(tile,[-5,.25,1],[5,.25,1]).unknown,['omission-20']);
  }
  const make=scene=>({simulation:new CausalSimulation(scene),renderer:new StreamingRenderer({sourceIds:['beacon'],masterGain:.175,continuousRates:true}),left:new Float32Array(512),right:new Float32Array(512)}),a=make(adopted),b=make(reference),dry=new Float32Array(512);
  for(let block=0;block<60;block++){const time=block*512/48000,snapshot={time,session:input.expected.session,generation:1,listener:{generation:1,position:[5,0,1],velocity:[0,0,0],forward:[-1,0,0],up:[0,0,1],valid:true},sources:[{id:'beacon',generation:1,position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],valid:true,emitting:true}]};for(let i=0;i<512;i++)dry[i]=.02*Math.sin((block*512+i)*.08);for(const run of [a,b]){run.simulation.observe(snapshot);run.renderer.accept(run.simulation.update(time,{geometryTimeMs:time*1000}));run.renderer.process({beacon:dry},run.left,run.right);}assert.deepEqual(a.left,b.left);assert.deepEqual(a.right,b.right);}
  assert.equal(a.renderer.stats.limited,0);assert.equal(a.renderer.stats.missingHistory,0);assert.ok(a.renderer.stats.sumSquares>0);t.diagnostic(JSON.stringify({surfaceCount:4096,producerAdoptionMs:adoptionMs,oldFullDecodeMs:fullDecodeMs,unchangedPcm:true,archiveDecoded:false}));
 }finally{adopter.close();await worker.terminate();}
});
