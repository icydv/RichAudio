// Persistent derived-cache reader. This worker never opens a game archive,
// invokes CodeWalker, acquires telemetry or produces PCM.
import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import {InstalledStaticWorld01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from './installed-static-scene01.mjs';
import {prepareInstalledSoundMapGeometry01} from '../streaming/soundmap-telemetry.mjs';
import {createInitialWorldObservationWriter01} from './initial-observation01.mjs';
const reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
let world=null,failed=false,lastRequest=0,catalogSHA256=null,bindingEpoch=0,poll=null,manifestStamp=null,waitingStamp=null;
const {schema,config,session}=workerData??{};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),automatic=config?.catalogSHA256==null;
let initialPriority=null,initialPriorityFailure=null;
let validationEpochUtc01=null;
const cacheTimings={manifestLoads:0,manifestReadMilliseconds:0,catalogueAndIndexMilliseconds:0,maximumRefreshMilliseconds:0};
const epoch=x=>typeof x==='string'&&x.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const pendingStatus=()=>({stage:'preparing/indexing',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},actualWorldCoverage:'unmeasured'});
function worldStatus(){const status=world.status();return {...status,cacheTimings:{...cacheTimings},localReadiness:status.lastWindow?.localReadiness??{state:'waiting-for-window',firstBlocker:'no-valid-local-window'},genuineResourceVerified:status.lastWindow?.genuineResourceVerified===true&&status.lastWindow.activeSurfaces>0};}
function post(type,extra={},transfer=[]){parentPort.postMessage({schema:1,type,session,catalogSHA256,bindingEpoch,validationEpochUtc01,...extra},transfer);}
function fail(error,phase,requestId=null){if(failed)return;failed=true;clearTimeout(poll);post('failed',{reason:reason(error),phase,requestId});world?.close();world=null;parentPort.close();}
function refresh(){
 const began=performance.now();
 try{
  if(automatic&&!epoch(validationEpochUtc01)){post('status',{ready:false,status:{...pendingStatus(),cacheTimings:{...cacheTimings},reason:'waiting-normal-supervisor-epoch'}});return false;}
  const info=fs.statSync(config.manifestPath,{bigint:true}),stamp=[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
  if(world&&stamp===manifestStamp)return true;
  if(automatic&&waitingStamp===stamp+'|'+validationEpochUtc01)return false;
  if(info.size<=0||info.size>67108864n)throw Error('Bounded known installed scene manifest required');
  const readAt=performance.now(),manifest=JSON.parse(fs.readFileSync(config.manifestPath,'utf8').replace(/^\uFEFF/,'')),admitted=manifest.ResolvedCatalogSHA256;cacheTimings.manifestLoads++;cacheTimings.manifestReadMilliseconds+=performance.now()-readAt;
  if(manifest.Schema!==1||!hex(admitted)||(config.expectedGameSHA256!==undefined&&manifest.InputBinding?.GameExecutableSHA256!==config.expectedGameSHA256)||(!automatic&&admitted!==config.catalogSHA256))throw Error('Installed scene manifest game/catalogue identity');
  if(automatic&&(!epoch(validationEpochUtc01)||manifest.ValidationEpochUtc01!==validationEpochUtc01)){
   if(world){world.close();world=null;catalogSHA256=null;bindingEpoch++;manifestStamp=null;}
   waitingStamp=stamp+'|'+validationEpochUtc01;post('status',{ready:false,status:{...pendingStatus(),cacheTimings:{...cacheTimings},reason:'waiting-current-archive-validation'}});return false;
  }
  const changed=catalogSHA256!==admitted;
  const indexAt=performance.now();
  if(changed||world===null){world?.close();world=null;catalogSHA256=admitted;bindingEpoch++;world=new InstalledStaticWorld01({...config,catalogSHA256,...(automatic?{requiredValidationEpochUtc01:validationEpochUtc01}:{})});}
  else world.reload();
  cacheTimings.catalogueAndIndexMilliseconds+=performance.now()-indexAt;cacheTimings.maximumRefreshMilliseconds=Math.max(cacheTimings.maximumRefreshMilliseconds,performance.now()-began);
  manifestStamp=stamp;waitingStamp=null;post(changed?'ready':'status',{ready:true,status:worldStatus()});return true;
 }catch(error){
  if(automatic&&error.code==='ENOENT'){
   if(world){world.close();world=null;catalogSHA256=null;bindingEpoch++;manifestStamp=null;}
   post('status',{ready:false,status:pendingStatus()});return false;
  }
  throw error;
 }
}
function schedulePoll(){if(failed)return;poll=setTimeout(()=>{try{refresh();schedulePoll();}catch(error){fail(error,'cache-refresh');}},1000);}
try{
 if(schema!==1||!/^[a-f0-9]{32}$/.test(session)||(automatic&&!hex(config.expectedGameSHA256)))throw Error('Bound installed scene worker identity required');
 if(config.initialObservationPath)try{initialPriority=createInitialWorldObservationWriter01({outputPath:config.initialObservationPath,session,gameSHA256:config.expectedGameSHA256});}catch(error){initialPriorityFailure=reason(error);}
 refresh();schedulePoll();
 parentPort.on('message',message=>{
  if(failed)return;
  try{
   if(message?.schema!==1||message.session!==session||(!automatic&&message.catalogSHA256!==config.catalogSHA256))throw Error('Installed scene command identity');
   if(message.type==='close'){clearTimeout(poll);world?.close();world=null;post('closed');parentPort.close();return;}
   if(message.type==='initial-observation'){post('initial-observation-result',{result:initialPriority?initialPriority.write(message.record):{accepted:false,reason:initialPriorityFailure??'priority-output-not-configured'}});return;}
   if(message.type==='preparation-epoch'){
    if(!automatic||!epoch(message.validationEpochUtc01)||validationEpochUtc01!==null&&validationEpochUtc01!==message.validationEpochUtc01)throw Error('Immutable normal preparation epoch required');
    validationEpochUtc01=message.validationEpochUtc01;refresh();return;
   }
   if(message.type!=='window'||!Number.isSafeInteger(message.requestId)||message.requestId<=lastRequest)throw Error('Ordered installed scene window required');
   lastRequest=message.requestId;
   const began=performance.now();
   // The manifest may advance atomically while the existing archive builder
   // runs. Resource readers retain their independently digest-bound cache data.
   if(!refresh()){post('not-ready',{requestId:message.requestId,status:pendingStatus()});return;}
   const scene=world.window({...message.request,session}),packet=encodeInstalledStaticScene01(scene),preparedScene=prepareInstalledStaticSceneTransfer01(packet,{...message.request,session,catalogSHA256}),preparedSoundMapGeometry=prepareInstalledSoundMapGeometry01(preparedScene.scene,{requestId:message.requestId,bindingEpoch,packetDigest:packet.packetDigest}),status=worldStatus(),memory=process.memoryUsage();
   post('scene',{requestId:message.requestId,packetDigest:packet.packetDigest,preparedScene,preparedSoundMapGeometry,status:{...status,genuineResourceVerified:packet.metadata.genuineResourceVerified===true&&packet.metadata.activeSurfaces>0},workerPreparationMilliseconds:performance.now()-began,memory:{heapUsed:memory.heapUsed,external:memory.external,arrayBuffers:memory.arrayBuffers}},[preparedSoundMapGeometry.bodyBytes.buffer]);
  }catch(error){fail(error,'window',message?.requestId??null);}
 });
}catch(error){fail(error,'initialization');}
