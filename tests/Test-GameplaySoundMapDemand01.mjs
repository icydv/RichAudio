// Real main producer + original inert cache and procedural PCM. No endpoint,
// installed inputs, actual recording, existing service descriptor or game API.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';
import {writeOriginalGameplayPackageStreet01} from './fixtures/StreetGameplayPackage01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
import {startSoundMap} from '../tools/soundmap/server.mjs';
import {InstalledContextState01,VisualState} from '../tools/soundmap/ui/model.mjs';
import {airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
const repo=path.resolve(import.meta.dirname,'..'),session='6'.repeat(32),wait=ms=>new Promise(r=>setTimeout(r,ms));
test('actual main producer binds optional viewer/recording/background demand and active status stays within16KiB',{timeout:25000},async t=>{
 const folder=path.join(repo,'.local/street01/soundmap-demand',randomUUID()),pkg=writeOriginalGameplayPackageStreet01(folder),world=installedSceneFixture01({parentRoot:path.join(folder,'.local/world')});
 const epoch=new Date().toISOString();world.publish(1,{validationEpochUtc01:epoch});
 const config={...pkg.config,gameSha256:world.gameSHA256,acousticWorld:{privateCacheRoot:world.root,derivedCacheRoot:world.root,manifestPath:'manifest.json',catalogPath:'catalog.json',catalogSHA256:world.config.catalogSHA256}};fs.writeFileSync(pkg.manifest,JSON.stringify(config));
 assert(!fs.existsSync(path.join(folder,'.local/soundmap/service.json')),'No existing descriptor can be discovered by this isolated package');
 const service=await startSoundMap({root:folder,port:0,viewOnly:true,installedContext:{...world.config,expectedGameSHA256:world.gameSHA256,privateRoot:world.root}});
 const headers={'X-RichAudio-Token':service.descriptor.token};
 assert.equal((await fetch(service.descriptor.url+'/api/record/start',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,403);
 const get=async route=>(await fetch(service.descriptor.url+route,{headers})).json();
 const view=new VisualState(),context=new InstalledContextState01();let contextSeen=false,admittedSeen=false,polling=true;const contextStates=new Set();
 const poll=(async()=>{while(polling){const frame=await get('/api/frame');if(frame.frame?.listener?.valid){
  assert.deepEqual(frame.frame.sources,[]);assert.deepEqual(frame.frame.paths,[]);
  if(view.ingest(frame,performance.now()))admittedSeen||=view.geometry?.surfaces.length===2;
  const result=await get('/api/world-context?generation='+encodeURIComponent(context.generation));
  contextStates.add(result.state??result.error);
  context.ingest(result,frame.frame,performance.now(),0);
  contextSeen||=context.visible(frame.frame,performance.now()).some(tile=>tile.surfaces.length===2);
 }await wait(60);}})();poll.catch(()=>{});
 const child=spawn(process.execPath,[path.join(repo,'tools/Run-Gameplay.mjs'),'--manifest',pkg.manifest,'--session',session],{cwd:repo,windowsHide:true,stdio:['pipe','pipe','pipe']});
 const settings={type:'settings',quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:false,airflowLevel:.35};
 let bytes=0,blocks=0,sequence=0,buffer='',started=null,lastObservation=-Infinity,timer=null,timeout=null,phase=0,done=false,closed=false,error=null,maximumStatusCharacters=0;
 const rows=[],statuses=[],events=[],send=m=>child.stdin.write(JSON.stringify(m)+'\n');
 function schedule(){timer=setTimeout(()=>{if(done)return;const now=performance.now();if(now-lastObservation>=95){lastObservation=now;const frame=airflowFrameStreet01(sequence++,(now-started)/1000,{speed:0});frame.worldPreparationStartedUtc=epoch;frame.listener.position=[0,0,1];frame.vehicles=[];send({type:'snapshot',frame,ageMs:0,validForMs:200});}send({type:'credit',blocks:1});},Math.max(0,started+blocks*512/48-performance.now()));}
 try{await new Promise((resolve,reject)=>{
  const fail=e=>{error??=e.message;done=true;clearTimeout(timer);if(child.exitCode===null)child.kill();reject(e);};timeout=setTimeout(()=>fail(Error('Bounded original main-demand fixture timeout; phase'+phase+' context '+[...contextStates])),20000);
  child.on('error',fail);child.stdin.on('error',e=>{if(!done)fail(e);});
  child.stdout.on('data',chunk=>{try{bytes+=chunk.length;const complete=Math.floor(bytes/4112);if(complete>blocks){assert.equal(complete,blocks+1);blocks=complete;if(!done)schedule();}}catch(e){fail(e);}});
  child.stderr.on('data',chunk=>{buffer+=chunk.toString('utf8');for(let end;(end=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;try{
   const row=JSON.parse(line);rows.push(row);if(row.type==='gameplay-error')throw Error(row.code);
   if(row.type==='gameplay-ready'){started=performance.now();send({...settings,soundMapVisible:false,soundMapRecording:false,soundMapBackgroundTelemetry:false});schedule();}
   if(row.type==='soundmap-demand-changed'){events.push(row);assert.equal(row.recordingStartedByProducer,false);if(phase===2){assert.equal(row.viewer,true,'A recording-only update must preserve the visible viewer');assert.equal(row.recordingRequested,true);phase=3;send({...settings,soundMapVisible:false});}}
   if(row.type!=='gameplay-status')continue;const s=row.status;statuses.push(s);const wrapped={schemaVersion:1,recordedAtUtc:new Date().toISOString(),hostState:done?'stopped':'running',status:s},characters=JSON.stringify(wrapped).length;maximumStatusCharacters=Math.max(maximumStatusCharacters,characters);assert(characters<=16384,'Actual populated main status respects the unchanged C# parser bound');
   if(phase===0&&s.acousticWorld.environmentalReadiness01.state==='active'&&s.acousticWorld.environmentalReadiness01.budget){assert.equal(s.soundMapDemand01.required,false);phase=1;send({...settings,soundMapVisible:true});}
   else if(phase===1&&s.soundMapDemand01.viewer&&s.soundMapDemand01.geometry==='prepared'&&admittedSeen&&contextSeen){phase=2;send({...settings,soundMapRecording:true});}
   else if(phase===3&&!s.soundMapDemand01.viewer&&s.soundMapDemand01.recordingRequested&&s.soundMapDemand01.geometry==='prepared'){phase=4;send({...settings,soundMapRecording:false,soundMapBackgroundTelemetry:true});}
   else if(phase===4&&s.soundMapDemand01.backgroundRequested&&s.soundMapDemand01.required){phase=5;send({...settings,soundMapBackgroundTelemetry:false});}
   else if(phase===5&&!s.soundMapDemand01.required&&s.soundMapDemand01.geometry==='not-requested'){phase=6;done=true;clearTimeout(timer);send({type:'stop'});child.stdin.end();}
  }catch(e){fail(e);}}});
  child.once('close',(code,signal)=>{closed=true;clearTimeout(timeout);clearTimeout(timer);try{assert.equal(code,0,JSON.stringify({signal,error,phase,rows:rows.slice(-3)}));assert.equal(phase,6);assert(rows.some(r=>r.type==='installed-world-worker-closed'&&r.workerJoined));assert(rows.some(r=>r.type==='installed-world-producer-admission'&&r.prepareSoundMapGeometry01===false&&r.soundMapPreparationMilliseconds===0));assert(rows.some(r=>r.type==='installed-world-producer-admission'&&r.prepareSoundMapGeometry01===true&&r.soundMapPreparationMilliseconds>0));assert(events.some(r=>r.viewer&&r.geometry==='pending-prepared-geometry'),'Opening the viewer explicitly waits for worker-prepared geometry');assert(statuses.some(s=>s.acousticWorld.stage==='active-conditional-local-scene'));assert(statuses.some(s=>s.acousticWorld.stage==='active-local-scene-renewal-at-risk'),'Sidebar stage exposes the changed renewal forecast');resolve();}catch(e){error??=e.message;reject(e);}});
 });}
 finally{done=true;clearTimeout(timeout);clearTimeout(timer);if(!closed){child.kill();await new Promise(r=>child.once('close',r));}fs.writeFileSync(path.join(folder,'validation.json'),JSON.stringify({schema:1,passed:!error&&phase===6,phase,error,maximumStatusCharacters,parserCharacterLimit:16384,rows,statuses,events,blocks,pcmBytesGenerated:bytes,source:'entirely-original',separateLiveService:true,admittedSeen,contextSeen,contextStates:[...contextStates],recordingStarted:false,gameLaunched:false,endpointOpened:false,childClosed:closed},null,2),{flag:'wx'});polling=false;try{await poll;}finally{await service.close();world.close();}}
 t.diagnostic(folder);
});
