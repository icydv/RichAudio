import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PassiveListener} from '../tools/soundmap/passive.mjs';
import {startSoundMap} from '../tools/soundmap/server.mjs';
import {InstalledContextState01} from '../tools/soundmap/ui/model.mjs';
import {verifyMapProofReceipt01} from '../tools/soundmap/installed-world-context01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const sample=(time=1000,sequence=0)=>({schemaVersion:1,kind:'passive-listener',streamId:'a'.repeat(32),sessionId:'b'.repeat(32),sequence,observedAtUnixMs:time,sampleAgeMs:0,coordinateSpace:'gta-native-unscaled',units:'native-unverified',listener:{position:[0,1,2],forward:[0,1,0],up:[0,0,1],velocity:null,valid:true,reason:'injected-fixture',generation:1}});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio Passive-'));
const clean=root=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudio Passive-'));fs.rmSync(root,{recursive:true});};
function copyPassiveService(root){
 fs.cpSync(path.join(repo,'tools','soundmap'),path.join(root,'tools','soundmap'),{recursive:true});
 // The passive payload carries the one pure contract, rather than any engine
 // modules or a fork of its limits. Normal product/provider packages already
 // include this member in their recursive acoustics-MJS source closure.
 const relative=path.join('src','acoustics','streaming','soundmap-wire.mjs'),target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repo,relative),target);
 assert.deepEqual(fs.readdirSync(path.dirname(target)),['soundmap-wire.mjs']);assert.deepEqual(fs.readFileSync(target),fs.readFileSync(path.join(repo,relative)));
}
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
test('view-only map binds passive interior identity and original expiry without acoustic telemetry',()=>{
 let now=1000;const feed=new PassiveListener(()=>now,{viewOnlyMap:true});
 const interiorReadback={outcome:'observed',proxy:91,ready:true,archetype:0xf1234567,origin:[1,2,3],offsetMs:-12};
 assert.equal(feed.accept(sample()).reason,'invalid-interior-readback');
 assert.ok(feed.accept({...sample(),interiorReadback}).accepted);
 assert.deepEqual(feed.snapshot().interiorReadback,interiorReadback);
 assert.equal(feed.accept({...sample(1000,1),interiorReadback}).reason,'ordering');
 now=1501;
 assert.equal(feed.status().available,false);
 assert.equal(feed.accept({...sample(now,2),sessionId:'c'.repeat(32),interiorReadback}).reason,'single-use-camera-identity');
});
test('camera-only source proof is one-use, pinned and stops on archive identity drift',()=>{
 const tempRoot=temp(),root=fs.realpathSync.native(tempRoot),attempt=path.join(root,'.local','attempt');
 fs.mkdirSync(attempt,{recursive:true});
 const sha=value=>createHash('sha256').update(value).digest('hex');
 const pin=(name,value)=>{const file=path.join(attempt,name),bytes=JSON.stringify(value);fs.writeFileSync(file,bytes);return [file,sha(bytes)];};
 const call=(...args)=>spawnSync(process.execPath,[path.join(repo,'tools','soundmap','verify-map-source01.mjs'),...args],{encoding:'utf8',windowsHide:true,timeout:5000});
 try{
  const proofEpoch=new Date().toISOString(),game=Buffer.from('authored executable identity only'),gameExecutableSHA256=sha(game);
  fs.writeFileSync(path.join(root,'GTA5_Enhanced.exe'),game);
  const archives=Array.from({length:123},(_,i)=>{
   const relative=`fixture-${i}.rpf`,file=path.join(root,relative);fs.writeFileSync(file,Buffer.alloc(16,i));
   const stat=fs.lstatSync(file,{bigint:true});
   return {relative,identity:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','nlink'].map(k=>[k,String(stat[k])]))};
  });
  const configSHA256='a'.repeat(64),scope=pin('scope.json',{schema:1,kind:'soundmap-retained-source-continuity',approved:false,
   gameRoot:root,proofEpoch,configSHA256,gameExecutableSHA256,gameExecutableBytes:game.length,archives});
  const verified=call('verify',...scope);
  assert.equal(verified.status,0,verified.stderr||verified.error?.message);
  assert.deepEqual(JSON.parse(verified.stdout),{archives:123,protectedPathsAccessed:0,archiveContentBytesRead:0});
  const startAt=Date.now(),stopAt=startAt+10000,ownerId='b'.repeat(32);
  const approval=pin('approval.json',{schema:1,kind:'soundmap-one-use-source-approval',approved:true,scopeSHA256:scope[1],startAt,stopAt,ownerId});
  const result=call('confirm',...scope,...approval);
  assert.equal(result.status,0,result.stderr);
  const {file,sha256}=JSON.parse(result.stdout),config={configSHA256,proofEpoch,expectedGameSHA256:gameExecutableSHA256};
  assert.doesNotThrow(()=>verifyMapProofReceipt01(file,sha256,config,ownerId,stopAt));
  assert.throws(()=>verifyMapProofReceipt01(file,sha256,config,'c'.repeat(32),stopAt),/Fresh bound/);
  assert.notEqual(call('confirm',...scope,...approval).status,0);
  fs.appendFileSync(path.join(root,archives[0].relative),'drift');
  const changed=call('postcheck',...scope,...approval);
  assert.notEqual(changed.status,0);assert.match(changed.stderr,/archive identity differs/);
 }finally{clean(tempRoot);}
});
test('actual C# view-only camera mailbox drives the service and browser context without a host',{skip:process.platform!=='win32'},async()=>{
 const fixture=installedSceneFixture01({parentRoot:path.join(repo,'.local','soundmap-tests')});
 const proofEpoch=new Date().toISOString();
 const config=fixture.publish(1,{validationEpochUtc01:proofEpoch});
 const ownerId='e'.repeat(32),service=await startSoundMap({root:fixture.root,port:0,ownerId,viewOnly:true,viewOnlyMap:true,
  installedContext:{...config,expectedGameSHA256:fixture.gameSHA256,privateRoot:fixture.root,proofEpoch,maximumResidentResources:16}});
 const child=spawn(path.join(repo,'build','passive-soundmap','RichAudio.Passive.Tests.exe'),
  [fixture.root,process.execPath,new URL(service.descriptor.url).port,'view-only-map'],{windowsHide:true});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 const request=async(route,value)=>{
  const response=await fetch(service.descriptor.url+route,{method:value===undefined?'GET':'POST',
   headers:{'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'},
   body:value===undefined?undefined:JSON.stringify(value)});
  return {status:response.status,data:await response.json()};
 };
 const model=new InstalledContextState01(),stop=path.join(fixture.root,'stop-fixture');
 const until=async predicate=>{
  const deadline=performance.now()+8000;
  while(!await predicate()){
   assert.ok(performance.now()<deadline,'bounded view-only context');
   await new Promise(resolve=>setTimeout(resolve,40));
  }
 };
 try{
  for(const route of ['/api/record/start','/api/host/control','/api/telemetry','/api/replay/open'])assert.equal((await request(route,{})).status,403);
  assert.equal((await request('/api/replay/audio')).status,403);
  await until(async()=>{
   const {data:frame}=await request('/api/frame');
   assert.equal(frame.frame,null);assert.equal(frame.geometry,null);assert.equal(frame.status.audio.hostConnected,false);
   if(!frame.mapContext)return false;
   assert.deepEqual(frame.passive.interiorReadback,{outcome:'no-proxy',proxy:0,ready:null,archetype:null,origin:null,offsetMs:0});
   const began=performance.now(),{data:context}=await request('/api/world-context?generation='+model.generation);
   model.ingest(context,frame.mapContext,performance.now(),performance.now()-began);
   const visible=model.visible(frame.mapContext,performance.now());
   if(!visible.some(tile=>tile.surfaces.length))return false;
   assert.equal(context.rendererAdmission,false);
   assert.equal(context.authority,'verified-collision-context-only');
   assert.ok(context.remainingMs<=500);
   assert.equal(model.explanation(frame.mapContext,null,performance.now()).admitted,0);
   assert.ok(visible.some(tile=>tile.sources.some(source=>source.resourceId==='original_scene01')));
   return true;
  });
  fixture.publish(1,{validationEpochUtc01:proofEpoch,rowEpochUtc01:'2020-01-01T00:00:00Z'});
  await until(async()=>{
   const {data:context}=await request('/api/world-context');
   return !context.tiles?.some(tile=>tile.surfaces.length);
  });
  fs.writeFileSync(stop,'stop');assert.equal(await exit,0);
  await until(async()=>(await request('/api/frame')).data.mapContext===null);
  assert.deepEqual((await request('/api/world-context')).data.tiles,[]);
  const receipt=JSON.parse(fs.readFileSync(path.join(service.privateRoot,'passive-result.json')));
  assert.ok(receipt.accepted>0);assert.equal(receipt.serviceOwned,false);assert.equal(receipt.audioOpened,false);
  assert.equal((await request('/api/service/stop',{ownerId})).status,200);
 }finally{
  if(child.exitCode===null){fs.writeFileSync(stop,'stop');await exit;}
  await service.close();fixture.close();
 }
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
 const root=temp();copyPassiveService(root);
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
 const root=temp();copyPassiveService(root);
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
