import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {startSoundMap} from '../tools/soundmap/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
test('native owned output queue uploads exact original post-gain samples with replay lineage, device-free',{skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudioSoundMap-')),service=await startSoundMap({root,port:0});
 const executable=path.join(repo,'build/acoustics-host/RichAudio.Acoustics.Host.Tests.exe');assert.ok(fs.existsSync(executable),'Build-AcousticsHost.ps1 -Tests first');
 try{
 const id=service.recorder.start().id;
 // An intentionally delayed telemetry receipt must not shift canonical playback.
 const f={schemaVersion:1,sessionId:'native-fixture',sequence:1,audioFrame:0,paths:[],geometryGeneration:null};service.recorder.frame(f,null);
 service.recorder.frame({...f,sequence:2,audioFrame:4800},null,Date.now()+900);
 const result=await new Promise((resolve,reject)=>{const child=spawn(executable,['--owned-recorder-fixture',path.join(service.privateRoot,'service.json')],{windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);const timeout=setTimeout(()=>{child.kill();reject(Error('Fixture deadline'));},5000);child.once('exit',code=>{clearTimeout(timeout);resolve({code,output});});});
 assert.equal(result.code,0,result.output);service.recorder.stop();const replay=service.recorder.open(id),bytes=fs.readFileSync(path.join(replay.dir,'owned-output.f32le'));
 assert.equal(bytes.length,100*512*8);for(let i=0;i<100*1024;i++)assert.equal(bytes.readFloatLE(i*4),i%2===0?.125:-.25);
 assert.equal(replay.manifest.audio.gaps.length,0);assert.equal(replay.audioPlayable,true);assert.equal(replay.frames[1].timeMs,100,'original sample timeline ignores900ms network delay');assert.equal(replay.originFrame,0);assert.ok(replay.audioIndex.every(c=>c.submissions.every(s=>Number.isSafeInteger(s.qpcTicks)&&s.producerFrameStart>=0)));
 console.log(result.output.trim());
 }finally{await service.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudioSoundMap-'));fs.rmSync(root,{recursive:true});}
});

test('native control outage followed by Stop records capture suspension without later PCM',{skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudioSoundMap-')),service=await startSoundMap({root,port:0});let polls=0,proxy;
 try{
 const id=service.recorder.start().id,forward=async(route,body)=>fetch(service.descriptor.url+route,{method:'POST',headers:{'Content-Type':route==='/api/host/pcm'?'application/octet-stream':'application/json','X-RichAudio-Token':service.descriptor.token},body});
 proxy=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   if(req.url==='/api/host/control'&&++polls===2){await forward('/api/record/stop',JSON.stringify({id}));res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"device-free injected control outage"}');return;}
   const response=await forward(req.url,body);res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
 }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));fs.writeFileSync(path.join(service.privateRoot,'service.json'),JSON.stringify({...service.descriptor,url:'http://127.0.0.1:'+proxy.address().port}));
 const executable=path.join(repo,'build/acoustics-host/RichAudio.Acoustics.Host.Tests.exe');
 const result=await new Promise((resolve,reject)=>{const child=spawn(executable,['--owned-recorder-outage-fixture',path.join(service.privateRoot,'service.json')],{windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);const timeout=setTimeout(()=>{child.kill();reject(Error('Outage fixture deadline'));},6000);child.once('exit',code=>{clearTimeout(timeout);resolve({code,output});});});
 assert.equal(result.code,0,result.output);assert.ok(polls>=3);assert.equal(service.recorder.active,null);const replay=service.recorder.open(id);
 assert.equal(replay.manifest.terminationReason,'user-stop');assert.ok(replay.manifest.audio.capturedFrames>0);assert.ok(replay.manifest.audio.capturedFrames<100*512);assert.equal(replay.audioPlayable,false);assert.ok(replay.manifest.audio.gaps.some(g=>g.reason==='capture-suspended'&&g.count>=1));assert.ok(replay.events.some(e=>e.type==='recording-flushed'&&e.detail.captureSuspensions>=1));
 }finally{if(proxy)await new Promise(resolve=>proxy.close(resolve));await service.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudioSoundMap-'));fs.rmSync(root,{recursive:true});}
});
