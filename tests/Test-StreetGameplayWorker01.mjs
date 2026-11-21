import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {writeOriginalGameplayPackageStreet01} from './fixtures/StreetGameplayPackage01.mjs';
import {airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),session='6'.repeat(32),privateRoot=path.join(root,'.local','street01','worker-tests');
const sha=x=>createHash('sha256').update(x).digest('hex');
test('stop received while the main credit render awaits completion prevents post-stop PCM',{timeout:15000},async()=>{
 const folder=path.join(privateRoot,randomUUID());fs.mkdirSync(folder,{recursive:true});const pkg=writeOriginalGameplayPackageStreet01(folder),child=spawn(process.execPath,[path.join(root,'tools/Run-Gameplay.mjs'),'--manifest',pkg.manifest,'--session',session],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let bytes=0,buffer='',ready=false;const rows=[];
 try{await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill();reject(Error('Bounded main stop fixture timed out'));},10000);
  child.on('error',reject);child.stdin.on('error',error=>{if(!ready)reject(error);});child.stdout.on('data',chunk=>bytes+=chunk.length);
  child.stderr.on('data',chunk=>{buffer+=chunk.toString('utf8');for(let end;(end=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;try{const row=JSON.parse(line);rows.push(row);if(row.type==='gameplay-ready'){
   ready=true;
   // One pipe write produces consecutive readline events. The real async
   // render has already started at credit, and stop runs before its await
   // continuation. This uses the real CPU backend, never a timer/mock delay.
   child.stdin.end('{"type":"credit","blocks":1}\n{"type":"stop"}\n');
  }}catch(error){reject(error);}}});
  child.once('exit',(code,signal)=>{clearTimeout(timeout);const receipt={schema:1,ready,code,signal,pcmBytesAfterStop:bytes,rows,mainSHA256:sha(fs.readFileSync(path.join(root,'tools/Run-Gameplay.mjs'))),originalFixtureOnly:true,gameLaunched:false,endpointOpened:false};fs.writeFileSync(path.join(folder,'stop-boundary-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});try{assert.equal(code,0,JSON.stringify(rows));assert.equal(ready,true);assert.equal(bytes,0,'a completed async render cannot publish PCM after stop');assert.ok(rows.some(r=>r.type==='installed-world-worker-closed'&&r.workerJoined===true),'the actual derived cache worker joins');resolve();}catch(error){reject(error);}});
 });}finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
});
function csharpSettings(folder){
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),exe=path.join(folder,'original-settings-wire.exe');
 const sourceFolders=['src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry'];
 const sources=sourceFolders.flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.cs')).map(f=>path.join(root,dir,f))).concat(['GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs'].map(f=>path.join(root,'src/acoustics/observation',f)),path.join(root,'tests/host/TestStreetSettingsWire01.cs'));
 const compile=spawnSync(compiler,['/nologo','/optimize+','/warnaserror+','/unsafe+','/platform:x64','/target:exe','/define:STATE_TRANSPORT,GEOMETRY_LIVE','/r:System.Web.Extensions.dll','/r:System.Runtime.Serialization.dll','/main:TestStreetSettingsWire01','/out:'+exe,...sources],{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(compile.status,0,compile.stdout+compile.stderr);
 const result=spawnSync(exe,[folder],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr);
 const lines=result.stdout.trim().split(/\r?\n/);assert.equal(lines.length,2);const current=JSON.parse(lines[0]),shutdown=JSON.parse(lines[1]);assert.equal(current.airflowEnabled,true);assert.equal(current.airflowLevel,.4);assert.equal(shutdown.enabled,false);assert.equal(shutdown.airflowEnabled,true);
 return {currentLine:lines[0],current,shutdown,executableSha256:sha(fs.readFileSync(exe)),hostSourceSha256:sha(fs.readFileSync(path.join(root,'src/acoustics/host/Windows/GameplayHost.cs')))};
}
async function runOriginalWorker(folder,settingsLine,{attachment=true,demoProfile=null,latencyProfile=null,dismount=false}={}){
 const pkg=writeOriginalGameplayPackageStreet01(folder,{demoProfile,latencyProfile}),child=spawn(process.execPath,[path.join(root,'tools/Run-Gameplay.mjs'),'--manifest',pkg.manifest,'--session',session],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let packetBuffer=Buffer.alloc(0),diagnosticBuffer='',sequence=0,snapshotSequence=0,started=null,timer=null,timeout=null,done=false;const rows=[],pcm=createHash('sha256'),targetBlocks=90;let peak=0,nonfinite=0;
 const send=x=>child.stdin.write(typeof x==='string'?x+'\n':JSON.stringify(x)+'\n');
 const schedule=()=>{const due=started+sequence*512/48;timer=setTimeout(()=>{if(done)return;try{const time=(performance.now()-started)/1000;
   if(sequence%4===0){const frame=airflowFrameStreet01(snapshotSequence++,time,{speed:31.2928,rider:!dismount||time<.55,cameraGeneration:time>=.35?2:1});const x=time*31.2928;frame.vehicles[0].position=[x,3,1];frame.listener.position=[x,3,1.65];if(!attachment){delete frame.vehicles[0].riderAttached;delete frame.vehicles[0].riderViewAttached;}send({type:'snapshot',frame,ageMs:0,validForMs:180});}
   send({type:'credit',blocks:1});}catch(error){child.kill();}},Math.max(0,due-performance.now()));};
 try{return await new Promise((resolve,reject)=>{
  timeout=setTimeout(()=>{fs.writeFileSync(path.join(folder,'failed-worker-receipt.json'),JSON.stringify({reason:'bounded-worker-timeout',sequence,rows,endpointOpened:false,gameLaunched:false},null,2)+'\n',{flag:'wx'});child.kill();reject(Error('Bounded original worker fixture timed out: '+JSON.stringify(rows.slice(-3))));},12000);
  child.on('error',reject);child.stdin.on('error',error=>{if(!done)reject(error);});
  child.stdout.on('data',chunk=>{try{packetBuffer=Buffer.concat([packetBuffer,chunk]);while(packetBuffer.length>=4112){const packet=packetBuffer.subarray(0,4112);packetBuffer=packetBuffer.subarray(4112);assert.equal(packet.toString('ascii',0,4),'RA07');assert.equal(packet.readUInt32LE(4),sequence++);assert.equal(packet.readUInt32LE(8),512);assert.equal(packet.readUInt32LE(12),0);pcm.update(packet.subarray(16));for(let offset=16;offset<4112;offset+=4){const x=packet.readFloatLE(offset);if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));}if(sequence<targetBlocks)schedule();else{done=true;send({type:'stop'});child.stdin.end();}}}catch(error){done=true;child.kill();reject(error);}});
  child.stderr.on('data',chunk=>{diagnosticBuffer+=chunk.toString('utf8');for(let newline;(newline=diagnosticBuffer.indexOf('\n'))>=0;){const line=diagnosticBuffer.slice(0,newline);diagnosticBuffer=diagnosticBuffer.slice(newline+1);if(!line.trim())continue;try{const row=JSON.parse(line);rows.push(row);if(row.type==='gameplay-ready'){assert.equal(row.featureProfile,'STREET-01-main');send(settingsLine);started=performance.now();schedule();}if(row.type==='gameplay-error'){done=true;child.kill();reject(Error(JSON.stringify(row)));}}catch(error){done=true;child.kill();reject(error);}}});
  child.on('exit',(code,signal)=>{clearTimeout(timeout);clearTimeout(timer);try{assert.equal(code,0,JSON.stringify({signal,rows:rows.slice(-3)}));assert.equal(sequence,targetBlocks);assert.equal(packetBuffer.length,0);assert.equal(nonfinite,0);assert.ok(peak>0&&peak<.98);const statuses=rows.filter(x=>x.type==='gameplay-status').map(x=>x.status),active=statuses.filter(s=>s.activeSources>0);assert.ok(active.length>0);for(const status of active){assert.equal(status.featureProfile,'STREET-01-main');assert.equal(status.airflowEnabled,true);assert.equal(status.airflowLevel,.4);assert.equal(status.continuityPolicy,demoProfile?'baseline':'camera-source-01');assert.equal(status.nativeReplacement,false);assert.equal(status.limitedSamples,0);}assert.ok(active.some(s=>s.airflow.exteriorSources>0&&s.airflow.sourceStates.some(a=>a.exteriorPeak>0)));if(attachment)assert.ok(active.some(s=>s.airflow.riderActive&&s.airflow.sourceStates.some(a=>a.riderPeak>0)));else assert.ok(active.every(s=>!s.airflow.riderActive&&s.airflow.sourceStates.every(a=>a.riderPeak===0)));
   if(latencyProfile==='street-01'){for(const s of active){assert.equal(s.latencyProfile,'street-01');assert.equal(s.controlDelayMs,75);assert.equal(s.producerCreditBlocks,6);}assert.equal(active.at(-1).arrivals,1);if(dismount){assert.equal(active.at(-1).airflow.riderActive,false);assert.equal(active.at(-1).sourceStates[0].running,true);assert.ok(active.at(-1).sourceStates[0].sourceFrame>30000);}}
   const result={source:pkg.source,attachment,demoProfile,latencyProfile,dismount,blocks:sequence,pcmFrames:sequence*512,pcmSha256:pcm.digest('hex'),peak,nonfinite,statuses,ready:rows.find(x=>x.type==='gameplay-ready'),endpointOpened:false,gameLaunched:false,captureStarted:false};fs.writeFileSync(path.join(folder,'worker-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});resolve(result);
  }catch(error){reject(error);}});
 });}finally{clearTimeout(timeout);clearTimeout(timer);done=true;if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
}
test('actual persisted C# settings command reaches the main worker, with conservative attachment and continuity defaults',{skip:process.platform!=='win32',timeout:45000},async t=>{
 const folder=path.join(privateRoot,randomUUID());fs.mkdirSync(folder,{recursive:true});const wire=csharpSettings(folder);fs.writeFileSync(path.join(folder,'settings-wire-receipt.json'),JSON.stringify(wire,null,2)+'\n',{flag:'wx'});
 const attached=await runOriginalWorker(path.join(folder,'attached'),wire.currentLine),legacy=await runOriginalWorker(path.join(folder,'legacy-no-attachment'),wire.currentLine,{attachment:false}),closed=await runOriginalWorker(path.join(folder,'closed-demo-profile'),wire.currentLine,{demoProfile:'PLAYABLE-13'}),street=await runOriginalWorker(path.join(folder,'street-profile'),wire.currentLine,{latencyProfile:'street-01',dismount:true});
 assert.ok(attached.statuses.some(s=>s.arrivals===1));assert.equal(attached.ready.installedWorldQualified,false);assert.equal(legacy.ready.nativeSuppression,false);assert.equal(closed.ready.featureProfile,'STREET-01-main');assert.equal(street.latencyProfile,'street-01');
 t.diagnostic('Original-only worker receipts: '+folder);
});
