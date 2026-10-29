import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {startSoundMap} from '../tools/soundmap/server.mjs';
import {SessionRecorder,replayFrame} from '../tools/soundmap/recorder.mjs';
import {SoundMapClient,readServiceConfiguration} from '../tools/soundmap/producer-client.mjs';

const fixture=()=>({frame:{schemaVersion:1,sessionId:'synthetic-test',sequence:1,audioFrame:512,producedAtUnixMs:1000,arrivalTimeSeconds:.0106667,observationTimeSeconds:.001,geometryTimeMs:100,geometryGeneration:'g1',paths:[{id:'actual-solver-path',status:'selected',vertices:[[0,0,0],[1,0,0]],delay:.003}],sources:[],listener:{position:[1,0,0]},settings:{quality:'balanced'}},geometry:{schemaVersion:1,generation:'g1',sessionId:'synthetic-test',surfaces:[],validUntil:123,clockDomain:'publisher-monotonic-ms'}});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'RichAudioSoundMap-'));
const clean=root=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudioSoundMap-'));fs.rmSync(root,{recursive:true});};
const pcmMeta=(id,frame=0,frames=2)=>({recordingId:id,hostId:'synthetic-device-free',frames,submittedFrame:frame,anchorUnixMs:1000,anchorQpcTicks:1000000,qpcFrequency:1000000,submissions:[{submittedFrame:frame,consumedFrame:frame+frames,frames,qpcTicks:1000000+frame*1000000/48000|0}]});

test('private recording preserves exact PCM, solver state, historical clocks and explicit gaps',()=>{
 const root=temp();try{let now=1000;const recorder=new SessionRecorder(root,{now:()=>now});const {id}=recorder.start();const value=fixture();recorder.frame(value.frame,value.geometry);const bytes=Buffer.alloc(16);bytes.writeFloatLE(.125,0);bytes.writeFloatLE(-.25,4);assert.ok(recorder.pcm(pcmMeta(id),bytes));now=1050;value.frame={...value.frame,sequence:2,audioFrame:1024};recorder.frame(value.frame);assert.ok(recorder.pcm(pcmMeta(id,4),bytes));now=1100;recorder.stop();
 const replay=recorder.open(id);assert.equal(replay.manifest.audio.gaps.length,1);assert.deepEqual(fs.readFileSync(path.join(replay.dir,'owned-output.f32le')),Buffer.concat([bytes,bytes]));assert.equal(replayFrame(replay,75).frame.audioFrame,1024);assert.equal(replayFrame(replay,25).geometry.validUntil,123);assert.equal(replayFrame(replay,25).frame.observationTimeSeconds,.001);assert.equal(replayFrame(replay,75).status.historical,true);assert.equal(replay.manifest.audio.startTimeMs,0);assert.ok(replay.events.some(e=>e.type==='audio-gap'));
 fs.appendFileSync(path.join(replay.dir,'owned-output.f32le'),'corrupt');assert.throws(()=>recorder.open(id),/integrity/);
 }finally{clean(root);}
});

test('duration and byte limits seal evidence without repairing missing or truncated data',()=>{
 const root=temp();try{let now=100;const recorder=new SessionRecorder(root,{now:()=>now});let id=recorder.start({maxDurationSeconds:.1,maxBytes:65536}).id;now=250;recorder.tick();assert.equal(recorder.active,null);assert.equal(recorder.open(id).manifest.terminationReason,'duration-limit');
 id=recorder.start({maxDurationSeconds:10,maxBytes:65536}).id;recorder.event('oversize',{detail:'x'.repeat(65536)});assert.equal(recorder.active,null);const m=recorder.open(id).manifest;assert.equal(m.terminationReason,'byte-limit');assert.ok(m.bytes<65536);
 assert.throws(()=>recorder.start({maxBytes:1024}),/bounds/);assert.throws(()=>recorder.open('../escape'),/ID/);
 }finally{clean(root);}
});

test('localhost service enforces capability, host/origin, immutable cache, session reset and replay API',async()=>{
 const root=temp();let now=1000;const service=await startSoundMap({root,port:0,now:()=>now});const base=service.descriptor.url,token=service.descriptor.token;
 const request=async(route,data,headers={})=>{const r=await fetch(base+route,{method:data===undefined?'GET':'POST',headers:{'X-RichAudio-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json()};};
 try{
 assert.equal((await fetch(base+'/api/status')).status,403);assert.equal((await request('/api/status',undefined,{Origin:'https://unrelated.invalid'})).status,403);
 assert.equal((await fetch(base+'/api/session',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);assert.equal((await fetch(base+'/',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,200);
 const rebindingStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/status',{headers:{Host:'localhost:'+new URL(base).port,'X-RichAudio-Token':token}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});assert.equal(rebindingStatus,403);
 assert.equal((await request('/api/telemetry',fixture())).status,200);let live=(await request('/api/frame')).value;assert.equal(live.geometry.generation,'g1');assert.equal((await request('/api/frame?geometryGeneration=g1')).value.geometry,null);
 assert.equal((await request('/api/telemetry',fixture())).value.accepted,false);assert.equal(service.status().droppedUpdates,1);
 const started=(await request('/api/record/start',{})).value.recording;assert.ok(started.id);assert.equal((await request('/api/record/start',{})).status,400);assert.equal((await request('/api/record/stop',{id:'stale'})).status,400);
 now=1100;const next=fixture();next.frame.sequence=2;next.geometry.surfaces=[{id:'changed'}];assert.equal((await request('/api/telemetry',next)).status,400);
 const switchFrame=fixture();switchFrame.frame.sessionId='new';switchFrame.frame.sequence=1;switchFrame.frame.geometryGeneration=null;delete switchFrame.geometry;assert.equal((await request('/api/telemetry',switchFrame)).status,200);assert.equal((await request('/api/frame')).value.geometry,null);
 now=1200;await request('/api/record/stop',{});const opened=(await request('/api/replay/open',{id:started.id})).value;assert.equal(opened.durationMs,100);assert.equal(opened.timeline.basis,'original-engine-audioFrame');assert.ok(opened.events.some(e=>e.type==='session-change'));assert.equal((await request('/api/replay/frame?timeMs=100')).value.mode,'replay');
 now=3000;assert.equal(service.status().connected,false);
 }finally{await service.close();clean(root);}
});

test('partial PCM disk writes remain incomplete evidence and cannot become seamless replay audio',()=>{
 const root=temp();const original=fs.writeSync;try{const recorder=new SessionRecorder(root);const id=recorder.start().id;let inject=true;fs.writeSync=(fd,data,...args)=>{if(inject&&Buffer.isBuffer(data)&&data.length===16){inject=false;return original(fd,data.subarray(0,8),...args);}return original(fd,data,...args);};
 assert.equal(recorder.pcm(pcmMeta(id),Buffer.alloc(16)),false);const replay=recorder.open(id);assert.equal(replay.manifest.integrity.complete,false);assert.equal(replay.manifest.audio.unindexedBytes,8);assert.equal(replay.audioPlayable,false);assert.ok(replay.manifest.audio.gaps.some(g=>g.reason==='unindexed-PCM-bytes'));
 }finally{fs.writeSync=original;clean(root);}
});

test('filesystem flush failures cannot claim complete or playable owned output',()=>{
 const root=temp(),original=fs.fsyncSync;try{const recorder=new SessionRecorder(root),id=recorder.start().id;recorder.pcm(pcmMeta(id),Buffer.alloc(16));fs.fsyncSync=()=>{const error=Error('fixture flush failure');error.code='EIO';throw error;};recorder.stop();fs.fsyncSync=original;
 const replay=recorder.open(id);assert.equal(replay.manifest.integrity.complete,false);assert.equal(replay.audioPlayable,false);assert.ok(replay.manifest.integrity.finalizationErrors.some(e=>e==='flush:EIO'));
 }finally{fs.fsyncSync=original;clean(root);}
});

test('service restart refreshes private capability and geometry, never resumes recording',async()=>{
 const root=temp();let service=await startSoundMap({root,port:0});const descriptor=path.join(service.privateRoot,'service.json'),port=service.server.address().port,client=new SoundMapClient(descriptor);
 const pause=()=>new Promise(resolve=>setTimeout(resolve,120));
 try{const value=fixture();client.offer(value.frame,value.geometry);await pause();assert.equal(service.status().accepted,1);const id=service.recorder.start().id;await service.close();service=await startSoundMap({root,port});
 client.offer({...value.frame,sequence:2});await pause();client.offer({...value.frame,sequence:3});await pause();assert.equal(service.status().accepted,1);assert.equal(service.recorder.active,null);assert.ok(client.stats.errors>=1);assert.equal(service.recorder.open(id).manifest.terminationReason,'service-shutdown');
 const invalid=path.join(service.privateRoot,'invalid.json');fs.writeFileSync(invalid,'x'.repeat(8192));assert.throws(()=>readServiceConfiguration(invalid),/private/i);
 }finally{await client.close();await service.close();clean(root);}
});

test('new producer stream with the same listener session seals recording and accepts reset sequence',async()=>{
 const root=temp(),service=await startSoundMap({root,port:0});try{const send=async value=>{const response=await fetch(service.descriptor.url+'/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token},body:JSON.stringify(value)});assert.equal(response.status,200);return response.json();};
 const a=fixture();a.frame.streamId='stream-a';a.frame.sequence=100;a.frame.geometryGeneration='stream-a:g1';a.geometry.generation='stream-a:g1';await send(a);const id=service.recorder.start().id;
 const b=fixture();b.frame.streamId='stream-b';b.frame.sequence=1;b.frame.geometryGeneration='stream-b:g1';b.geometry.generation='stream-b:g1';assert.equal((await send(b)).accepted,true);assert.equal(service.recorder.active,null);assert.equal(service.recorder.open(id).manifest.terminationReason,'stream-change');assert.equal(service.status().streamId,'stream-b');
 }finally{await service.close();clean(root);}
});

test('stale participating host cannot produce a clean playable recording tail',async()=>{
 const root=temp();let now=1000;const service=await startSoundMap({root,port:0,now:()=>now});try{
 const post=async(route,value)=>{const response=await fetch(service.descriptor.url+route,{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token},body:JSON.stringify(value)});assert.equal(response.status,200);return response.json();};
 const id=service.recorder.start().id;await post('/api/host/control',{hostId:'fixture'});await post('/api/host/event',{type:'owned-capture-start',recordingId:id,metrics:{droppedFrames:0}});service.recorder.pcm(pcmMeta(id),Buffer.alloc(16));now+=2000;await post('/api/record/stop',{id});
 const replay=service.recorder.open(id);assert.equal(replay.audioPlayable,false);assert.ok(replay.manifest.audio.gaps.some(g=>g.reason==='host-disconnected-tail-unconfirmed'));
 }finally{await service.close();clean(root);}
});

test('recording before READY preserves unavailable frames through first listener qualification',async()=>{
 const root=temp(),service=await startSoundMap({root,port:0});try{
 const send=async frame=>{const response=await fetch(service.descriptor.url+'/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token},body:JSON.stringify({frame})});assert.equal(response.status,200);return response.json();};
 const id=service.recorder.start().id,frame={...fixture().frame,streamId:'continuous-worker',sessionId:'uninitialised',listenerSessionId:null,audioFrame:0,geometryGeneration:null,listener:{valid:false},paths:[]};
 assert.equal((await send(frame)).accepted,true);
 assert.equal((await send({...frame,sessionId:'real-listener',listenerSessionId:'real-listener',sequence:2,audioFrame:512,listener:{valid:true}})).accepted,true);
 assert.equal(service.recorder.active.manifest.id,id,'initial qualification must not seal explicit pre-READY recording');
 await send({...frame,sessionId:'another-established-listener',listenerSessionId:'another-established-listener',sequence:3,audioFrame:1024});assert.equal(service.recorder.active,null,'established session change still seals');
 const replay=service.recorder.open(id);assert.equal(replay.manifest.terminationReason,'session-change');assert.equal(replay.frames.length,2);assert.equal(replay.frames[0].frame.listener.valid,false);assert.equal(replay.frames[1].frame.listener.valid,true);assert.ok(replay.events.some(e=>e.type==='listener-initialised'));
 }finally{await service.close();clean(root);}
});

test('one-inflight producer transport drops visual updates without queuing or awaiting sound',async()=>{
 const root=temp();const service=await startSoundMap({root,port:0});const client=new SoundMapClient(path.join(service.privateRoot,'service.json'));
 try{const first=fixture();assert.equal(client.offer(first.frame,first.geometry),true);for(let i=2;i<100;i++)client.offer({...first.frame,sequence:i});assert.equal(client.stats.dropped,98);
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(client.stats.sent,1);assert.equal(service.status().accepted,1);assert.equal(client.busy,false);
 }finally{await client.close();await service.close();clean(root);}
});

test('device-free recording throughput measurement on deterministic post-gain samples',()=>{
 const root=temp();try{let now=1000;const recorder=new SessionRecorder(root,{now:()=>now});const id=recorder.start().id;const samples=Buffer.alloc(4096);for(let i=0;i<1024;i++)samples.writeFloatLE(Math.sin(i)*.02,i*4);
 let check=0;const baseline=performance.now();for(let i=0;i<1000;i++)check+=samples.readFloatLE(i%1024*4);const baselineMs=performance.now()-baseline;
 const begin=performance.now();for(let i=0;i<1000;i++)recorder.pcm(pcmMeta(id,i*512,512),samples);const recordMs=performance.now()-begin;now+=1000*512/48;recorder.stop();
 const result={test:'device-free-recorder-throughput',blocks:1000,frames:512000,bytes:4096000,baselineReadMs:baselineMs,recordWriteMs:recordMs,recordMicrosecondsPerBlock:recordMs*1000/1000,scope:'Standalone service synchronous evidence writes; does not measure WASAPI or physical audibility',checksumFinite:Number.isFinite(check)};console.log(JSON.stringify(result));assert.equal(recorder.open(id).manifest.audio.capturedFrames,512000);
 }finally{clean(root);}
});
