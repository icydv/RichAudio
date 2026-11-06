// Persistent derived-cache reader. This worker never opens a game archive,
// invokes CodeWalker, acquires telemetry or produces PCM.
import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import {InstalledStaticWorld01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from './installed-static-scene01.mjs';
import {prepareInstalledSoundMapGeometry01} from '../streaming/soundmap-telemetry.mjs';
import {createInitialWorldObservationWriter01} from './initial-observation01.mjs';
import {recordSceneWorkerProgress01} from './scene-worker-progress01.mjs';
const reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
let world=null,failed=false,lastRequest=0,catalogSHA256=null,bindingEpoch=0,poll=null,manifestStamp=null,waitingStamp=null;
const {schema,config,session,parentClock01,progressBuffer01}=workerData??{};
let progressRequest01=0;const phase01=name=>{if(progressBuffer01)recordSceneWorkerProgress01(progressBuffer01,name,progressRequest01);};
const clock01=Object.freeze({kind:'node-process-performance',processId:process.pid,timeOrigin:performance.timeOrigin});
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),automatic=config?.catalogSHA256==null;
let initialPriority=null,initialPriorityFailure=null;
let validationEpochUtc01=null;
let consumerProof01=null;
const cacheTimings={manifestLoads:0,manifestReadMilliseconds:0,manifestReadCallMilliseconds:0,manifestReadBytes:0,manifestParseMilliseconds:0,catalogueAndIndexMilliseconds:0,maximumRefreshMilliseconds:0};
const profileThreadCpu01=new WeakMap();
function startProfileCpu01(profile){if(typeof process.threadCpuUsage==='function')profileThreadCpu01.set(profile,process.threadCpuUsage());return profile;}
function operationDelta01(current={},before={}){return Object.fromEntries(Object.entries(current).map(([key,value])=>[key,Math.max(0,value-(before[key]??0))]));}
const epoch=x=>typeof x==='string'&&x.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const pendingStatus=()=>({stage:'preparing/indexing',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},actualWorldCoverage:'unmeasured'});
function worldStatus(){const status=world.status();return {...status,cacheTimings:{...cacheTimings},localReadiness:status.lastWindow?.localReadiness??{state:'waiting-for-window',firstBlocker:'no-valid-local-window'},genuineResourceVerified:status.lastWindow?.genuineResourceVerified===true&&status.lastWindow.activeSurfaces>0};}
function post(type,extra={},transfer=[]){if(progressBuffer01&&['scene','expired','static-prepared','not-ready'].includes(type))phase01('result-post');const began=performance.now();parentPort.postMessage({schema:1,type,session,catalogSHA256,bindingEpoch,validationEpochUtc01,clock01,sentAt01:began,...extra},transfer);return performance.now()-began;}
function finishProfile(profile){const cpuStart=profileThreadCpu01.get(profile);profile.workerThreadCpuAvailable=!!cpuStart;if(cpuStart){const cpu=process.threadCpuUsage(cpuStart);profile.workerThreadUserMicroseconds=cpu.user;profile.workerThreadKernelMicroseconds=cpu.system;}profile.finishedAt=performance.now();return {workerProfile01:profile,workerPreparationMilliseconds:profile.finishedAt-profile.startedAt};}
function internalStatus(profile){const began=performance.now(),status=worldStatus(),computed=Number.isFinite(profile.windowCompletedAt);profile.statusMilliseconds+=performance.now()-began;profile.computedForRequest=computed;profile.activeSurfaces=computed?status.lastWindow?.activeSurfaces??0:0;profile.qualifiedResourceCount=computed?status.localReadiness?.qualifiedResources??0:0;profile.genuineResourceVerified=computed&&status.genuineResourceVerified===true;profile.localReadinessState=computed?status.localReadiness?.state??'unknown':'not-computed-for-observation';return status;}
function residencyEvidence01(profile){const at=performance.now(),cacheResidency01=world.cacheResidencyTimeline01();profile.cacheDiagnosticsMilliseconds=performance.now()-at;return {cacheResidency01};}
function expired(message,profile,phase){profile.expiryPhase=phase;const status=internalStatus(profile),postMs=post('expired',{requestId:message.requestId,status,...residencyEvidence01(profile),...finishProfile(profile)});post('delivery-timing',{requestId:message.requestId,postMessageMilliseconds:postMs});}
function fail(error,phase,requestId=null){if(failed)return;failed=true;clearTimeout(poll);post('failed',{reason:reason(error),phase,requestId});world?.close();world=null;parentPort.close();}
function checkConsumerProof01(){
 if(!consumerProof01)return;const {consumerRequestId,selectionProof01}=consumerProof01,manifest=world?.manifest,required=validationEpochUtc01??manifest?.ValidationEpochUtc01;
 const proofCurrent=!!world&&selectionProof01.every(e=>{const entry=world.rows.find(x=>x.row.Id===e.resourceId),row=entry?.row,result=row?.Result;return row?.Status==='imported-exterior-incomplete-surfaces'&&result?.IndexSHA256===e.indexSHA256&&result.ReceiptSHA256===e.receiptSHA256&&(!required||manifest.ValidationEpochUtc01===required&&row.ArchiveValidation01?.EpochUtc===required&&row.ArchiveValidation01.Source==='current-archive-sha256'&&row.ArchiveValidation01.ArchiveSHA256===result.ArchiveSHA256);});
 if(consumerProof01.lastVerdict!==proofCurrent){consumerProof01.lastVerdict=proofCurrent;post('consumer-proof-status',{consumerRequestId,proofCurrent});}
}
function refresh(){
 phase01('refresh-check');
 const began=performance.now();
 try{
  if(automatic&&!epoch(validationEpochUtc01)){post('status',{ready:false,status:{...pendingStatus(),cacheTimings:{...cacheTimings},reason:'waiting-normal-supervisor-epoch'}});return false;}
  const info=fs.statSync(config.manifestPath,{bigint:true}),stamp=[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
  if(world&&stamp===manifestStamp){phase01('refresh-done');return true;}
  if(automatic&&waitingStamp===stamp+'|'+validationEpochUtc01)return false;
  if(info.size<=0||info.size>67108864n)throw Error('Bounded known installed scene manifest required');
  phase01('manifest-read');const readAt=performance.now(),bytes=fs.readFileSync(config.manifestPath);cacheTimings.manifestReadCallMilliseconds+=performance.now()-readAt;cacheTimings.manifestReadBytes+=bytes.byteLength;
  phase01('manifest-parse');const parseAt=performance.now(),manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),admitted=manifest.ResolvedCatalogSHA256;cacheTimings.manifestParseMilliseconds+=performance.now()-parseAt;cacheTimings.manifestLoads++;cacheTimings.manifestReadMilliseconds+=performance.now()-readAt;
  if(manifest.Schema!==1||!hex(admitted)||(config.expectedGameSHA256!==undefined&&manifest.InputBinding?.GameExecutableSHA256!==config.expectedGameSHA256)||(!automatic&&admitted!==config.catalogSHA256))throw Error('Installed scene manifest game/catalogue identity');
  if(automatic&&(!epoch(validationEpochUtc01)||manifest.ValidationEpochUtc01!==validationEpochUtc01)){
   if(world){world.close();world=null;catalogSHA256=null;bindingEpoch++;manifestStamp=null;}
   waitingStamp=stamp+'|'+validationEpochUtc01;post('status',{ready:false,status:{...pendingStatus(),cacheTimings:{...cacheTimings},reason:'waiting-current-archive-validation'}});return false;
  }
  const changed=catalogSHA256!==admitted;
  phase01('world-reload');
  const indexAt=performance.now();
  if(changed||world===null){world?.close();world=null;catalogSHA256=admitted;bindingEpoch++;world=new InstalledStaticWorld01({...config,catalogSHA256,...(automatic?{requiredValidationEpochUtc01:validationEpochUtc01}:{})});}
  else world.reload();
  cacheTimings.catalogueAndIndexMilliseconds+=performance.now()-indexAt;cacheTimings.maximumRefreshMilliseconds=Math.max(cacheTimings.maximumRefreshMilliseconds,performance.now()-began);
  manifestStamp=stamp;waitingStamp=null;checkConsumerProof01();phase01('refresh-done');post(changed?'ready':'status',{ready:true,status:worldStatus()});return true;
 }catch(error){
  if(automatic&&error.code==='ENOENT'){
   if(world){world.close();world=null;catalogSHA256=null;bindingEpoch++;manifestStamp=null;}
   post('status',{ready:false,status:pendingStatus()});return false;
  }
  throw error;
 }
}
function schedulePoll(){if(failed)return;poll=setTimeout(()=>{try{phase01('poll-start');refresh();phase01('poll-done');schedulePoll();}catch(error){fail(error,'cache-refresh');}},1000);}
try{
 if(schema!==1||!/^[a-f0-9]{32}$/.test(session)||(automatic&&!hex(config.expectedGameSHA256)))throw Error('Bound installed scene worker identity required');
 if(parentClock01?.kind!==clock01.kind||parentClock01.processId!==clock01.processId||parentClock01.timeOrigin!==clock01.timeOrigin)throw Error('Verified shared installed worker performance clock required');
 if(config.initialObservationPath)try{initialPriority=createInitialWorldObservationWriter01({outputPath:config.initialObservationPath,session,gameSHA256:config.expectedGameSHA256});}catch(error){initialPriorityFailure=reason(error);}
 refresh();schedulePoll();
 parentPort.on('message',message=>{
  if(failed)return;
  try{
   if(message?.schema!==1||message.session!==session||(!automatic&&message.catalogSHA256!==config.catalogSHA256))throw Error('Installed scene command identity');
   if(message.type==='close'){phase01('close');clearTimeout(poll);world?.close();world=null;post('closed');parentPort.close();return;}
   if(message.type==='consumer-proof'){
    if(message.bindingEpoch!==bindingEpoch||message.catalogSHA256!==catalogSHA256)return;
    if(!Number.isSafeInteger(message.consumerRequestId)||message.consumerRequestId<1||!Array.isArray(message.selectionProof01)||message.selectionProof01.length<1||message.selectionProof01.length>16||!message.selectionProof01.every(e=>typeof e.resourceId==='string'&&e.resourceId.length<=512&&hex(e.indexSHA256)&&hex(e.receiptSHA256)))throw Error('Bounded actual consumer source-proof watch');
    if(consumerProof01&&message.consumerRequestId<consumerProof01.consumerRequestId)return;
    consumerProof01={consumerRequestId:message.consumerRequestId,selectionProof01:message.selectionProof01,lastVerdict:null};checkConsumerProof01();return;
   }
   if(message.type==='initial-observation'){post('initial-observation-result',{result:initialPriority?initialPriority.write(message.record):{accepted:false,reason:initialPriorityFailure??'priority-output-not-configured'}});return;}
   if(message.type==='preparation-epoch'){
    if(!automatic||!epoch(message.validationEpochUtc01)||validationEpochUtc01!==null&&validationEpochUtc01!==message.validationEpochUtc01)throw Error('Immutable normal preparation epoch required');
    validationEpochUtc01=message.validationEpochUtc01;refresh();return;
   }
   if(message.type!=='window'||!Number.isSafeInteger(message.requestId)||message.requestId<=lastRequest)throw Error('Ordered installed scene window required');
   lastRequest=message.requestId;
   progressRequest01=message.requestId;phase01('window-received');
   const began=performance.now(),profile=startProfileCpu01({schema:1,startedAt:began,refreshMilliseconds:0,staticPreparationMilliseconds:0,windowMilliseconds:0,encodeMilliseconds:0,transferPreparationMilliseconds:0,soundMapPreparationMilliseconds:0,statusMilliseconds:0});
   if(!Number.isFinite(message.requestedAt)||message.requestedAt<0||!Number.isFinite(message.dispatchedAt)||message.dispatchedAt<message.requestedAt||message.dispatchedAt>began||!Number.isFinite(message.request?.durationMs)||message.request.durationMs<=0||message.request.durationMs>1000||message.expiresAt!==message.requestedAt+message.request.durationMs)throw Error('Original bounded installed scene observation lifetime required');
   if(message.request.prepareSoundMapGeometry01!==undefined&&typeof message.request.prepareSoundMapGeometry01!=='boolean')throw Error('Explicit bounded SoundMap geometry demand required');
   // Expired observations never become new observations. A preparation already
   // underway may populate immutable caches, but only a distinct fresh request
   // can query those caches and publish a current pose-bound scene.
   if(began>=message.expiresAt){profile.expiryPhase='before-refresh';const postMs=post('expired',{requestId:message.requestId,status:world?internalStatus(profile):pendingStatus(),...finishProfile(profile)});post('delivery-timing',{requestId:message.requestId,postMessageMilliseconds:postMs});return;}
   // The manifest may advance atomically while the existing archive builder
   // runs. Resource readers retain their independently digest-bound cache data.
   const previousWorld=world,previousOperations=world?.profile01().operations01??{},previousManifest={readCallMilliseconds:cacheTimings.manifestReadCallMilliseconds,logicalReadBytes:cacheTimings.manifestReadBytes,decodeParseMilliseconds:cacheTimings.manifestParseMilliseconds};
   const refreshAt=performance.now(),ready=refresh();profile.refreshMilliseconds=performance.now()-refreshAt;
   profile.refreshOperations01=operationDelta01(world?.profile01().operations01,world===previousWorld?previousOperations:{});
   profile.refreshManifestOperations01=operationDelta01({readCallMilliseconds:cacheTimings.manifestReadCallMilliseconds,logicalReadBytes:cacheTimings.manifestReadBytes,decodeParseMilliseconds:cacheTimings.manifestParseMilliseconds},previousManifest);
   if(!ready){post('not-ready',{requestId:message.requestId,status:pendingStatus(),...finishProfile(profile)});return;}
   if(performance.now()>=message.expiresAt){expired(message,profile,'refresh');return;}
   // Immutable resource/chunk/primitive preparation has no observation header.
   // It may finish after this request's lease, but cannot publish that old pose.
   phase01('static-prepare');const request={...message.request,session},staticAt=performance.now(),staticWorkset=world.prepareStaticWorkset01(request);profile.staticPreparationMilliseconds=performance.now()-staticAt;
   profile.staticPreparation=staticWorkset.profile;profile.staticWorksetHeavyWork=staticWorkset.heavyWork;
   if(performance.now()>=message.expiresAt){world.discardPreparedSelection01(staticWorkset.preparedSelection01);profile.expiryPhase='static-preparation';const status=internalStatus(profile),postMs=post('static-prepared',{requestId:message.requestId,status,...residencyEvidence01(profile),...finishProfile(profile)});post('delivery-timing',{requestId:message.requestId,postMessageMilliseconds:postMs});return;}
   phase01('materialize');const windowAt=performance.now(),scene=world.window({...request,preparedSelection01:staticWorkset.preparedSelection01});profile.windowCompletedAt=performance.now();profile.windowMilliseconds=profile.windowCompletedAt-windowAt;
   profile.world=world.lastWindowProfile01??{};
   if(performance.now()>=message.expiresAt){expired(message,profile,'world-window');return;}
   phase01('encode');const encodeAt=performance.now(),packet=encodeInstalledStaticScene01(scene);profile.encodeMilliseconds=performance.now()-encodeAt;
   if(performance.now()>=message.expiresAt){expired(message,profile,'encode');return;}
   phase01('transfer');const transferAt=performance.now(),preparedScene=prepareInstalledStaticSceneTransfer01(packet,{...message.request,session,catalogSHA256});profile.transferPreparationMilliseconds=performance.now()-transferAt;profile.transfer=preparedScene.profile01??{};
   if(performance.now()>=message.expiresAt){expired(message,profile,'transfer-preparation');return;}
   phase01('soundmap');const soundMapGeometryRequested01=message.request.prepareSoundMapGeometry01!==false;profile.soundMapGeometryRequested01=soundMapGeometryRequested01;profile.soundMapGeometryStatus01=soundMapGeometryRequested01?'prepared':'not-requested';let preparedSoundMapGeometry=null;if(soundMapGeometryRequested01){const soundMapAt=performance.now();preparedSoundMapGeometry=prepareInstalledSoundMapGeometry01(preparedScene.scene,{requestId:message.requestId,bindingEpoch,packetDigest:packet.packetDigest});profile.soundMapPreparationMilliseconds=performance.now()-soundMapAt;}
   if(performance.now()>=message.expiresAt){expired(message,profile,'soundmap-preparation');return;}
   phase01('status');const status=internalStatus(profile),memory=process.memoryUsage();
   const postMs=post('scene',{requestId:message.requestId,packetDigest:packet.packetDigest,preparedScene,preparedSoundMapGeometry,soundMapGeometryRequested01,status:{...status,genuineResourceVerified:packet.metadata.genuineResourceVerified===true&&packet.metadata.activeSurfaces>0},...residencyEvidence01(profile),...finishProfile(profile),memory:{heapUsed:memory.heapUsed,external:memory.external,arrayBuffers:memory.arrayBuffers}},preparedSoundMapGeometry?[preparedSoundMapGeometry.bodyBytes.buffer]:[]);
   post('delivery-timing',{requestId:message.requestId,postMessageMilliseconds:postMs});
  }catch(error){fail(error,'window',message?.requestId??null);}finally{if(progressRequest01)phase01('window-done');progressRequest01=0;}
 });
}catch(error){fail(error,'initialization');}
