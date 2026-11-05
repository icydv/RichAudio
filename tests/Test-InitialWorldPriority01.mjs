import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {performance} from 'node:perf_hooks';import {setTimeout as delay} from 'node:timers/promises';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {createInitialWorldObservationWriter01} from '../src/acoustics/world/initial-observation01.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
import {writeOriginalGameplayPackageStreet01} from './fixtures/StreetGameplayPackage01.mjs';
import {airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),session='e'.repeat(32),game='a'.repeat(64);
async function until(predicate,timeout=5000){const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw Error('Bounded initial priority fixture timed out');await delay(10);}}
const record=now=>({Schema:1,Kind:'RichAudioInitialWorldObservation01',GameExecutableSHA256:game,session,sequence:0,generation:1,geometryTimeMs:123,sourceAgeMs:20,listener:[1,2,3],sources:[[4,5,6]],origin:'normal-gameplay-observation',receivedUtc:new Date(now).toISOString()});
test('initial priority preserves the first observation and accounts for background delay',()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),now=Date.parse('2026-11-05T12:00:00Z');
 try{const writer=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now+100});const first=record(now);assert.equal(writer.write(first).accepted,true);const saved=fs.readFileSync(target);assert.equal(JSON.parse(saved).sourceAgeMs,120);assert.equal(JSON.parse(saved).receivedUtc,first.receivedUtc);
  assert.equal(writer.write({...first,sequence:2,listener:[9,9,9]}).reused,true);assert.deepEqual(fs.readFileSync(target),saved);assert.equal(fs.existsSync(f.manifestPath),false);
 }finally{f.close();}
});
test('wrong identities, stale/future observations and invented origins cannot create priority',()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),now=Date.now();
 try{const changes=[{session:'f'.repeat(32)},{GameExecutableSHA256:'f'.repeat(64)},{sequence:-1},{generation:0},{sourceAgeMs:-1},{sourceAgeMs:501},{receivedUtc:new Date(now-600).toISOString()},{receivedUtc:new Date(now+251).toISOString()},{listener:[NaN,0,0]},{listener:[100001,0,0]},{sources:[[0,0,0],[0,0,0],[0,0,0]]},{origin:'cached-geometry'}];for(const change of changes){const w=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now});assert.equal(w.write({...record(now),...change}).accepted,false);assert.equal(fs.existsSync(target),false);}}
 finally{f.close();}
});
test('a later audio worker preserves the earlier valid preparation-only observation for its session',()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),now=Date.now(),first=record(now-100),later={...record(now),sequence:2,listener:[9,9,9]};
 try{fs.writeFileSync(target,JSON.stringify(first));const saved=fs.readFileSync(target),writer=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now});assert.equal(writer.write(later).reason,'earlier-preparation-session-position-retained');assert.deepEqual(fs.readFileSync(target),saved);
  for(const change of [{session:'b'.repeat(32)},{GameExecutableSHA256:'b'.repeat(64)},{origin:'cached-geometry'},{sourceAgeMs:501},{receivedUtc:new Date(now+10).toISOString()}]){fs.writeFileSync(target,JSON.stringify({...first,...change}));const w=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now});assert.equal(w.write(later).reused,false);assert.deepEqual(JSON.parse(fs.readFileSync(target)).listener,later.listener);}
 }finally{f.close();}
});
test('a busy shared advisory writer lock preserves the initial file and permits a bounded later offer',()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),now=Date.now(),lock=target+'.lock';let handle;
 try{const first=record(now-100);fs.writeFileSync(target,JSON.stringify(first));const saved=fs.readFileSync(target),writer=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now});handle=fs.openSync(lock,'wx');assert.equal(writer.write(record(now)).accepted,false);assert.deepEqual(fs.readFileSync(target),saved);fs.closeSync(handle);handle=undefined;fs.unlinkSync(lock);assert.equal(writer.write(record(now)).accepted,true);assert.deepEqual(fs.readFileSync(target),saved);assert.equal(fs.existsSync(lock),false);}
 finally{if(handle!==undefined)fs.closeSync(handle);f.close();}
});
test('an observation that expires during background IO cannot replace the priority file',()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),now=Date.now();let calls=0;
 try{const writer=createInitialWorldObservationWriter01({outputPath:target,session,gameSHA256:game,now:()=>now+(calls++?501:0)});assert.equal(writer.write(record(now)).reason,'initial-observation-expired-before-publication');assert.equal(fs.existsSync(target),false);assert.equal(fs.existsSync(target+'.lock'),false);}
 finally{f.close();}
});
test('actual background worker accepts first position before a cache manifest exists',async()=>{
 const f=installedSceneFixture01({write:false}),target=path.join(f.root,'initial-observation01.json'),service=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256,initialObservationPath:target},session});
 try{const observed={sequence:0,generation:1,geometryTimeMs:100,sourceAgeMs:0,listener:[1,2,3],sources:[[4,5,6]]};assert.equal(service.observeInitial01({...observed,sequence:-1}),false);assert.equal(service.observeInitial01(observed),true);await until(()=>service.priorityAccepted||service.failed);assert.equal(service.failed,false,service.failure);assert.equal(service.ready,false);assert.equal(fs.existsSync(f.manifestPath),false);assert.deepEqual(JSON.parse(fs.readFileSync(target)).listener,observed.listener);assert.equal(service.snapshot().initialPreparationPriority.activationAuthority,false);assert.equal(service.observeInitial01({...observed,sequence:2}),false);assert.equal((await service.close()).workerJoined,true);}
 finally{await service.close();f.close();}
});
test('actual main worker forwards an accepted normal frame while world data is still absent',{timeout:12000},async()=>{
 const folder=path.join(repo,'.local/street01-completion/initial-main-'+randomUUID());fs.mkdirSync(folder,{recursive:true});const pkg=writeOriginalGameplayPackageStreet01(folder),target=path.join(folder,'.local/plugin-world-warmup/geometry/initial-observation01.json');
 const child=spawn(process.execPath,[path.join(repo,'tools/Run-Gameplay.mjs'),'--manifest',pkg.manifest,'--session',session],{cwd:repo,windowsHide:true,stdio:['pipe','pipe','pipe']}),rows=[];let buffer='',ready=false,bytes=0,closed=false;
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{closed=true;resolve({code,signal});});});child.stdout.on('data',b=>bytes+=b.length);child.stdin.on('error',()=>{});
 child.stderr.on('data',b=>{buffer+=b;for(let n;(n=buffer.indexOf('\n'))>=0;){const text=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!text.trim())continue;const row=JSON.parse(text);rows.push(row);if(row.type==='gameplay-ready'){ready=true;const frame=airflowFrameStreet01(0,0,{speed:0});frame.session=session;frame.listener.session=session;child.stdin.write(JSON.stringify({type:'snapshot',frame,ageMs:0,validForMs:180})+'\n'+JSON.stringify({type:'credit',blocks:1})+'\n');}}});
 try{await until(()=>fs.existsSync(target)||closed,8000);assert.equal(closed,false,JSON.stringify(rows));const saved=JSON.parse(fs.readFileSync(target));assert.equal(ready,true);assert.equal(saved.origin,'normal-gameplay-observation');assert.equal(saved.session,session);assert.equal(saved.GameExecutableSHA256,pkg.config.gameSha256);assert.equal(saved.sequence,0);assert.equal(fs.existsSync(path.join(path.dirname(target),'manifest.json')),false);child.stdin.end('{"type":"stop"}\n');const outcome=await exit;assert.equal(outcome.code,0,JSON.stringify(rows));assert.ok(rows.some(r=>r.type==='installed-world-worker-closed'&&r.workerJoined===true));fs.writeFileSync(path.join(folder,'validation.json'),JSON.stringify({schema:1,kind:'OriginalMainInitialPriority01',outcome,bytes,priority:saved,rows,actualMainWorker:true,archiveDecoded:false,gameRead:false,endpointOpened:false},null,2)+'\n',{flag:'wx'});}
 finally{if(!closed){child.kill();await exit;}}
});
