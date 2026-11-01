import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PassiveListener} from '../tools/soundmap/passive.mjs';
import {startSoundMap} from '../tools/soundmap/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const sample=(time=1000,sequence=0)=>({schemaVersion:1,kind:'passive-listener',streamId:'a'.repeat(32),sessionId:'b'.repeat(32),sequence,observedAtUnixMs:time,sampleAgeMs:0,coordinateSpace:'gta-native-unscaled',units:'native-unverified',listener:{position:[0,1,2],forward:[0,1,0],up:[0,0,1],velocity:null,valid:true,reason:'injected-fixture',generation:1}});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio Passive-'));
const clean=root=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudio Passive-'));fs.rmSync(root,{recursive:true});};
test('passive lease preserves original age, ordering, identity and invalid state',()=>{
 let now=1000;const feed=new PassiveListener(()=>now);assert.ok(feed.accept(sample()).accepted);now=1400;assert.equal(feed.snapshot().ageMs,400);
 assert.equal(feed.accept(sample(1000,1)).accepted,true);assert.equal(feed.snapshot().ageMs,400,'same old observation never retimestamped');now=1501;assert.equal(feed.status().available,false);
 assert.equal(feed.accept(sample(1000,2)).accepted,false);assert.equal(feed.accept(sample(1504,2)).accepted,false);assert.equal(feed.accept({...sample(1501,2),sampleAgeMs:501}).accepted,false);
 assert.equal(feed.accept(sample(1501,0)).accepted,false);
 assert.ok(feed.accept({...sample(1501,2),sessionId:'c'.repeat(32)}).accepted,'a new stream may replace an expired passive lease');assert.equal(feed.status().sessionChanges,1);
 assert.equal(feed.accept({...sample(1501,3),sessionId:'d'.repeat(32)}).accepted,false,'a fresh lease cannot be stolen');
 assert.ok(feed.accept({...sample(1501,3),sessionId:'c'.repeat(32),listener:{...sample().listener,valid:false,reason:'paused'}}).accepted);assert.equal(feed.status().available,false);
 assert.equal(feed.accept({...sample(1501,3),listener:{...sample().listener,position:[NaN,0,0]}}).accepted,false);
});
test('actual local service keeps passive identity and recording separate, owner shutdown is capability protected',async()=>{
 const root=temp();let now=1000;const owner='c'.repeat(32),service=await startSoundMap({root,port:0,ownerId:owner,now:()=>now});
 const request=async(route,value)=>{const r=await fetch(service.descriptor.url+route,{method:value===undefined?'GET':'POST',headers:{'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});return {status:r.status,data:await r.json()};};
 try{const recording=(await request('/api/record/start',{})).data.recording;assert.ok((await request('/api/passive',sample())).data.accepted);
 let live=(await request('/api/frame')).data;assert.equal(live.frame,null);assert.equal(live.geometry,null);assert.equal(live.status.connected,false);assert.ok(live.status.passive.available);assert.equal(live.status.sessionId,null);assert.equal(live.status.recording.id,recording.id);
 now+=501;live=(await request('/api/frame')).data;assert.equal(live.status.passive.available,false);assert.equal(live.passive.ageMs,501);assert.equal((await request('/api/service/stop',{ownerId:'d'.repeat(32)})).status,403);
 await request('/api/record/stop',{id:recording.id});assert.equal(service.recorder.open(recording.id).frames.length,0,'passive never recorded as acoustic frame');
 assert.equal((await request('/api/service/stop',{ownerId:owner})).data.stopping,true);
 }finally{await service.close();clean(root);}
});
test('actual C# mailbox automatically starts and gracefully stops owned service after simulated Story ready, without host', {skip:process.platform!=='win32'}, async()=>{
 const root=temp();fs.cpSync(path.join(repo,'tools','soundmap'),path.join(root,'tools','soundmap'),{recursive:true});
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const child=spawn(path.join(repo,'build','passive-soundmap','RichAudio.Passive.Tests.exe'),[root,process.execPath,String(port)],{windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 const until=async f=>{const deadline=performance.now()+12000;while(!await f()){assert.ok(performance.now()<deadline,output||'bounded passive start');await new Promise(resolve=>setTimeout(resolve,30));}};
 try{const descriptor=path.join(root,'.local','soundmap','service.json');await until(()=>fs.existsSync(descriptor));const d=JSON.parse(fs.readFileSync(descriptor));let state;
 await until(async()=>{const r=await fetch(d.url+'/api/frame',{headers:{'X-RichAudio-Token':d.token}});state=await r.json();return state.status.passive.accepted>=3;});
 assert.ok(state.status.passive.available);assert.equal(state.frame,null);assert.equal(state.status.audio.hostConnected,false);assert.equal(state.status.recording,null);assert.equal(state.passive.listener.reason,'device-free-injected-camera');assert.ok(state.passive.listener.position[0]>0);
 fs.writeFileSync(path.join(root,'stop-fixture'),'stop');assert.equal(await exit,0,output);const result=JSON.parse(fs.readFileSync(path.join(root,'.local','soundmap','passive-result.json')));assert.ok(result.accepted>=3);assert.equal(result.serviceOwned,true);assert.equal(result.windowOwned,false);assert.equal(result.audioOpened,false);assert.equal(result.sensingStarted,false);assert.equal(result.diagnostic,'tracking-passive-native');
 await assert.rejects(fetch(d.url+'/api/status',{signal:AbortSignal.timeout(500)}),'owned service is gone after disposal');console.log(JSON.stringify({test:'actual-passive-components',accepted:result.accepted,audioHostStarted:false,serviceOwnedStopped:true,scope:'injected camera; real GTA getters remain live-unverified'}));
 }finally{if(child.exitCode===null){fs.writeFileSync(path.join(root,'stop-fixture'),'stop');await exit;}clean(root);}
});
test('controlled host transport failure leaves explicit recording failure and incomplete tail evidence',async()=>{
 const root=temp(),service=await startSoundMap({root,port:0});
 const post=async(route,value)=>{const response=await fetch(service.descriptor.url+route,{method:'POST',headers:{'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(response.status,200);return response.json();};
 try{const id=(await post('/api/record/start',{})).recording.id;await post('/api/host/event',{type:'owned-capture-start',recordingId:id});await post('/api/host/event',{type:'host-capture-stop',recordingId:id,terminalFailure:'Listener terminal: freshness/invalid-age'});await post('/api/record/stop',{id});
 const replay=service.recorder.open(id);assert.ok(replay.events.some(e=>e.type==='host-terminal-failure'));assert.ok(replay.manifest.audio.gaps.some(g=>g.reason==='host-terminal-failure'&&g.tailConfirmed===false));assert.equal(replay.audioPlayable,false);
 }finally{await service.close();clean(root);}
});

test('actual native passive bridge reconnects after owned service exits without stopping an external replacement',{skip:process.platform!=='win32'},async()=>{
 const root=temp();fs.cpSync(path.join(repo,'tools','soundmap'),path.join(root,'tools','soundmap'),{recursive:true});
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(path.join(repo,'build','passive-soundmap','RichAudio.Passive.Tests.exe'),[root,process.execPath,String(port)],{windowsHide:true});let output='',replacement;
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const until=async f=>{const deadline=performance.now()+10000;while(!await f()){assert.ok(performance.now()<deadline,output||'bounded passive reconnect');await new Promise(resolve=>setTimeout(resolve,40));}};
 try{
 const descriptor=path.join(root,'.local','soundmap','service.json');await until(()=>fs.existsSync(descriptor));const original=JSON.parse(fs.readFileSync(descriptor));
 await until(async()=>{const response=await fetch(original.url+'/api/status',{headers:{'X-RichAudio-Token':original.token}});return (await response.json()).passive.accepted>=3;});
 const stopped=await fetch(original.url+'/api/service/stop',{method:'POST',headers:{'X-RichAudio-Token':original.token,'Content-Type':'application/json'},body:JSON.stringify({ownerId:original.ownerId})});assert.equal(stopped.status,200);await stopped.json();
 await until(async()=>{try{await fetch(original.url+'/api/status',{signal:AbortSignal.timeout(500)});return false;}catch{return true;}});
 replacement=await startSoundMap({root,port});assert.notEqual(replacement.descriptor.token,original.token);assert.equal(replacement.descriptor.ownerId,null);
 let frame;await until(async()=>{const response=await fetch(replacement.descriptor.url+'/api/frame',{headers:{'X-RichAudio-Token':replacement.descriptor.token}});frame=await response.json();return frame.status.passive.accepted>=3;});
 assert.ok(frame.passive.listener.position[0]>0);assert.equal(frame.frame,null);assert.equal(frame.status.audio.hostConnected,false);
 fs.writeFileSync(path.join(root,'stop-fixture'),'stop');assert.equal(await exit,0,output);
 const alive=await fetch(replacement.descriptor.url+'/api/status',{headers:{'X-RichAudio-Token':replacement.descriptor.token}});assert.equal(alive.status,200,'external replacement remains alive after native owner disposal');
 const result=JSON.parse(fs.readFileSync(path.join(root,'.local','soundmap','passive-result.json')));assert.ok(result.accepted>=6);assert.equal(result.audioOpened,false);assert.equal(result.sensingStarted,false);
 }finally{if(child.exitCode===null){fs.writeFileSync(path.join(root,'stop-fixture'),'stop');await exit;}if(replacement)await replacement.close();clean(root);}
});

test('actual native passive sidecar rejects nested invalid types, bounds, duplicates and linked workspace',{skip:process.platform!=='win32'},()=>{
 const root=temp(),exe=path.join(repo,'build','passive-soundmap','RichAudio.Passive.Tests.exe'),pointer=path.join(root,'menu.json');
 const valid={schemaVersion:1,workspaceRoot:root,settingsPath:'.local/settings.json',toggleKey:'F10',controllerEnabled:true,soundMap:{enabled:true,autoStartService:true,openWindow:false,sampleHz:20,port:17833,nodeExecutable:process.execPath}};
 const check=(value,accepted)=>{fs.writeFileSync(pointer,typeof value==='string'?value:JSON.stringify(value));const result=spawnSync(exe,['--validate',pointer],{windowsHide:true,encoding:'utf8',timeout:5000});assert.equal(result.status,accepted?0:2,result.stdout+result.stderr);};
 try{check(valid,true);for(const change of [{sampleHz:21},{sampleHz:0},{sampleHz:'20'},{enabled:'true'},{port:65536},{port:1023},{nodeExecutable:'node.exe'},{unexpected:true},{enabled:false}])check({...valid,soundMap:{...valid.soundMap,...change}},false);
 check(JSON.stringify(valid).replace('"port":17833','"port":17833,"port":17834'),false);
 const target=path.join(root,'actual'),linked=path.join(root,'linked');fs.mkdirSync(target);fs.symlinkSync(target,linked,'junction');check({...valid,workspaceRoot:linked},false);
 }finally{clean(root);}
});
