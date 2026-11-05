// One persistent off-producer derived-cache worker. Pending observations are
// coalesced into one latest window, never a growing queue or PCM delay.
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {bindInstalledStaticSceneWorker01} from './installed-static-scene01.mjs';
import {requireWorld,vector} from './contracts.mjs';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),interval=500;
const epoch=x=>typeof x==='string'&&x.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
const diagnosticLimit01=64;
const clock01=()=>({kind:'node-process-performance',processId:process.pid,timeOrigin:performance.timeOrigin});
// Profiles contain bounded measurements, never geometry, cache paths or poses.
function metrics01(value,depth=0){
 requireWorld(value&&typeof value==='object'&&!Array.isArray(value)&&depth<=4&&Object.keys(value).length<=96,'bounded installed worker profile');
 const out={};for(const [key,item] of Object.entries(value)){
  requireWorld(key.length<=80,'bounded installed worker profile key');
  if(item===null||typeof item==='boolean'||typeof item==='string'&&item.length<=160)out[key]=item;
  else if(typeof item==='number'){requireWorld(Number.isFinite(item)&&item>=0,'finite installed worker profile measurement');out[key]=item;}
  else out[key]=metrics01(item,depth+1);
 }return out;
}
export class InstalledSceneService01 {
 constructor({config,session,onScene=()=>{},onStatus=()=>{}}={}){
  requireWorld(config&&typeof config.manifestPath==='string'&&typeof config.catalogPath==='string'&&(hex(config.catalogSHA256)||config.catalogSHA256==null&&hex(config.expectedGameSHA256))&&(config.expectedGameSHA256===undefined||hex(config.expectedGameSHA256))&&/^[a-f0-9]{32}$/.test(session)&&typeof onScene==='function'&&typeof onStatus==='function','bound installed scene service configuration');
  const maximumResidentResources=config.maximumResidentResources??8;
  requireWorld(Number.isInteger(maximumResidentResources)&&maximumResidentResources>=1&&maximumResidentResources<=16,'bounded installed scene resident resources');
  requireWorld(config.initialObservationPath===undefined||typeof config.initialObservationPath==='string'&&hex(config.expectedGameSHA256),'bound priority output configuration');
  requireWorld(config.privateRoot===undefined||typeof config.privateRoot==='string'&&path.isAbsolute(config.privateRoot)&&path.resolve(config.privateRoot).split(path.sep).includes('.local'),'explicit private derived-cache reuse root');
  this.config={manifestPath:config.manifestPath,catalogPath:config.catalogPath,...(config.privateRoot===undefined?{}:{privateRoot:path.resolve(config.privateRoot)}),...(config.catalogSHA256==null?{}:{catalogSHA256:config.catalogSHA256}),...(config.expectedGameSHA256===undefined?{}:{expectedGameSHA256:config.expectedGameSHA256}),...(config.initialObservationPath===undefined?{}:{initialObservationPath:config.initialObservationPath}),maximumResidentResources};this.catalogBinding=config.catalogSHA256??null;this.bindingEpoch=0;this.session=session;this.onScene=onScene;this.onStatus=onStatus;this.priorityPending=false;this.priorityAccepted=false;this.priorityRejections=0;this.lastPriorityAttempt=-Infinity;
  this.closed=false;this.failed=false;this.ready=false;this.state='preparing/indexing';this.failure=null;this.active=null;this.pending=null;this.latestGeneration=null;this.serial=0;this.lastDispatch=-Infinity;this.dispatchTimer=null;this.operationTimer=null;this.closePromise=null;this.exited=false;this.exitCode=null;this.baseStatus={stage:'preparing/indexing',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},actualWorldCoverage:'unmeasured'};
  this.clock01=clock01();this.clockVerified01=false;this.diagnostics01=[];
  this.stats={workersStarted:0,workersJoined:0,requests:0,dispatched:0,coalesced:0,publications:0,staleResults:0,generationDiscards:0,pendingExpired:0,workerExpiredResults:0,expiredBeforeAdoption:0,expiredDuringAdoption:0,cacheNotReadyResults:0,callbackFailures:0,failures:0,maximumAdmissionMs:0,maximumValidationMs:0,maximumWorkerPreparationMs:0,maximumPublicationCallbackMs:0,maximumRequestWaitMs:0,maximumDispatchToWorkerMs:0,maximumWorkerTransportMs:0,maximumPostMessageMs:0,minimumDispatchIntervalMs:null,createdAt01:performance.now(),firstReadyAt01:null,firstInternallyValidatedAt01:null,firstInternalNonemptyAt01:null,firstInternalNonemptyRequestId01:null,firstPublishedAt01:null,firstPublishedNonemptyAt01:null,pcmQueueFramesAdded:0};
  let joined;this.exitPromise=new Promise(resolve=>joined=resolve);this.joined=joined;
  this.#emit();
  try{
   this.worker=new Worker(new URL('./installed-scene-worker01.mjs',import.meta.url),{workerData:{schema:1,config:this.config,session,parentClock01:this.clock01},resourceLimits:{maxOldGenerationSizeMb:512,maxYoungGenerationSizeMb:64,stackSizeMb:8}});this.stats.workersStarted++;this.worker.unref();
   this.adopter=bindInstalledStaticSceneWorker01(this.worker,{session});
   this.worker.on('message',m=>this.#message(m));this.worker.on('error',error=>this.#fail('worker-error: '+reason(error)));
   this.worker.on('exit',code=>{this.exited=true;this.exitCode=code;this.stats.workersJoined++;clearTimeout(this.operationTimer);this.operationTimer=null;this.joined(code);if(!this.closed&&!this.failed)this.#fail('worker-exited-without-close');this.#emit();});
   this.operationTimer=setTimeout(()=>this.#fail('worker-initialization-timeout'),10000);
  }catch(error){this.exited=true;this.joined(null);this.#fail('worker-start-failed: '+reason(error));}
 }
 snapshot(){return {...this.baseStatus,initialPreparationPriority:{configured:!!this.config.initialObservationPath,pending:this.priorityPending,accepted:this.priorityAccepted,rejections:this.priorityRejections,activationAuthority:false},stage:this.failed?'failed':this.closed?'stopped':this.baseStatus.stage,worker:{kind:'persistent-derived-cache-worker',state:this.state,ready:this.ready,closed:this.closed,failed:this.failed,failure:this.failure,inFlight:this.active!==null,pendingLatest:this.pending!==null,rateLimitHz:2,maxOldGenerationMiB:512,cacheIoOffProducer:true,archiveDecode:false,catalogSHA256:this.catalogBinding,bindingEpoch:this.bindingEpoch,workerExited:this.exited,...this.stats},sceneDeliveryDiagnostics01:{schema:1,clock:{...this.clock01,verified:this.clockVerified01},historyLimit:diagnosticLimit01,recent:structuredClone(this.diagnostics01)}};}
 #record(observation){const record={schema:1,requestId:observation.requestId,generation:observation.request.generation,geometryTimeMs:observation.request.geometryTimeMs,durationMs:observation.request.durationMs,requestedAt:observation.requestedAt,expiresAt:observation.expiresAt,outcome:'pending'};this.diagnostics01.push(record);if(this.diagnostics01.length>diagnosticLimit01)this.diagnostics01.shift();return record;}
 #finish(record,outcome,at=performance.now()){if(record){record.outcome=outcome;record.completedAt=at;record.finalAgeMilliseconds=at-record.requestedAt;record.freshnessRemainingMilliseconds=Math.max(0,record.expiresAt-at);}}
 #profile(active,message,receivedAt){
  const diagnostic=active.diagnostic01,profile=metrics01(message.workerProfile01);
  requireWorld(profile.startedAt>=active.dispatchedAt&&profile.finishedAt>=profile.startedAt&&profile.finishedAt<=message.sentAt01&&Number.isFinite(message.workerPreparationMilliseconds)&&message.workerPreparationMilliseconds===profile.finishedAt-profile.startedAt,'installed worker processing timing');
  diagnostic.receivedAt=receivedAt;diagnostic.workerProfile01=profile;diagnostic.workerPreparationMilliseconds=message.workerPreparationMilliseconds;diagnostic.dispatchToWorkerMilliseconds=profile.startedAt-active.dispatchedAt;diagnostic.workerTransportMilliseconds=receivedAt-message.sentAt01;
  this.stats.maximumWorkerPreparationMs=Math.max(this.stats.maximumWorkerPreparationMs,message.workerPreparationMilliseconds);this.stats.maximumDispatchToWorkerMs=Math.max(this.stats.maximumDispatchToWorkerMs,diagnostic.dispatchToWorkerMilliseconds);this.stats.maximumWorkerTransportMs=Math.max(this.stats.maximumWorkerTransportMs,diagnostic.workerTransportMilliseconds);return profile;
 }
 #emit(){try{this.onStatus(this.snapshot());}catch{this.stats.callbackFailures++;}}
 #fail(message){if(this.failed||this.closed)return;this.failed=true;this.failure=reason(message);this.state='failed';this.stats.failures++;this.#finish(this.active?.diagnostic01,'failed');this.#finish(this.pending?.diagnostic01,'failed');this.pending=null;this.active=null;this.priorityPending=false;clearTimeout(this.dispatchTimer);clearTimeout(this.operationTimer);this.dispatchTimer=this.operationTimer=null;this.adopter?.close();this.#emit();if(this.worker&&!this.exited)void this.worker.terminate().catch(()=>{});}
 bindPreparationEpoch01(value){
  if(this.closed||this.failed||this.config.catalogSHA256!==undefined||!epoch(value))return false;
  if(this.validationEpochUtc01===value)return true;
  if(this.validationEpochUtc01!==undefined){this.#fail('changed-normal-preparation-epoch');return false;}
  this.validationEpochUtc01=value;this.ready=false;
  try{this.worker.postMessage({schema:1,type:'preparation-epoch',session:this.session,catalogSHA256:this.catalogBinding,validationEpochUtc01:value});return true;}catch(error){this.#fail('worker-epoch-command-failed: '+reason(error));return false;}
 }
 observeInitial01({sequence,generation,geometryTimeMs,sourceAgeMs,listener,sources=[]}={}){
  if(this.closed||this.failed||this.priorityAccepted||this.priorityPending||this.priorityRejections>=8||performance.now()-this.lastPriorityAttempt<1000||!this.config.initialObservationPath)return false;
  if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isSafeInteger(generation)||generation<1||!Number.isFinite(geometryTimeMs)||geometryTimeMs<0||!Number.isFinite(sourceAgeMs)||sourceAgeMs<0||sourceAgeMs>500||!Array.isArray(sources)||sources.length>2)return false;
  try{listener=vector(listener);sources=sources.map(vector);this.lastPriorityAttempt=performance.now();this.priorityPending=true;this.worker.postMessage({schema:1,type:'initial-observation',session:this.session,catalogSHA256:this.catalogBinding,record:{Schema:1,Kind:'RichAudioInitialWorldObservation01',GameExecutableSHA256:this.config.expectedGameSHA256,session:this.session,sequence,generation,geometryTimeMs,sourceAgeMs,listener,sources,origin:'normal-gameplay-observation',receivedUtc:new Date().toISOString()}});return true;}
  catch{this.priorityPending=false;this.priorityRejections++;return false;}
 }
 updateWindow({listener,sources=[],generation,geometryTimeMs,durationMs=1000,radius=32,maximumSurfaces=2048,adaptiveRadius=true,engine={}}={}){
  requireWorld(!this.closed&&!this.failed,'active installed scene service');listener=vector(listener);requireWorld(Array.isArray(sources)&&sources.length<=2,'bounded installed source window');sources=sources.map(vector);
  requireWorld(Number.isSafeInteger(generation)&&generation>0&&(this.latestGeneration===null||generation>=this.latestGeneration)&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Number.isFinite(durationMs)&&durationMs>0&&durationMs<=1000&&engine&&typeof engine==='object'&&!Array.isArray(engine),'fresh bounded installed scene request');
  requireWorld(Number.isFinite(radius)&&radius>=1&&radius<=32&&Number.isInteger(maximumSurfaces)&&maximumSurfaces>=1&&maximumSurfaces<=4096&&typeof adaptiveRadius==='boolean','bounded installed acoustic workset');
  const engineCopy=structuredClone(engine);requireWorld(Buffer.byteLength(JSON.stringify(engineCopy))<=16384,'bounded installed scene processing settings');
  const requestedAt=performance.now(),requestId=++this.serial;this.latestGeneration=generation;this.stats.requests++;if(this.pending){this.stats.coalesced++;this.#finish(this.pending.diagnostic01,'coalesced-before-dispatch',requestedAt);}
  this.pending={requestId,requestedAt,expiresAt:requestedAt+durationMs,request:{listener,sources,generation,geometryTimeMs,durationMs,radius,maximumSurfaces,adaptiveRadius,engine:engineCopy}};this.pending.diagnostic01=this.#record(this.pending);this.#schedule();
  return {requestId,requestedAt,expiresAt:requestedAt+durationMs,coalescedLatest:true};
 }
 #schedule(){if(this.closed||this.failed||!this.ready||this.active||!this.pending||this.dispatchTimer!==null)return;const delay=Math.max(0,this.lastDispatch+interval-performance.now());if(delay>0){this.dispatchTimer=setTimeout(()=>{this.dispatchTimer=null;this.#dispatch();},Math.ceil(delay));}else this.#dispatch();}
 #dispatch(){if(this.closed||this.failed||!this.ready||this.active||!this.pending)return;const now=performance.now();if(now-this.lastDispatch<interval){this.#schedule();return;}const pending=this.pending;this.pending=null;
  if(now>=pending.expiresAt){this.stats.pendingExpired++;this.#finish(pending.diagnostic01,'expired-before-dispatch',now);this.#emit();return;}
  if(Number.isFinite(this.lastDispatch)){const elapsed=now-this.lastDispatch;this.stats.minimumDispatchIntervalMs=this.stats.minimumDispatchIntervalMs===null?elapsed:Math.min(this.stats.minimumDispatchIntervalMs,elapsed);}this.lastDispatch=now;this.active=pending;this.state='loading-cached-regions';this.stats.dispatched++;
  pending.dispatchedAt=now;pending.diagnostic01.dispatchedAt=now;pending.diagnostic01.requestWaitMilliseconds=now-pending.requestedAt;pending.diagnostic01.outcome='dispatched';this.stats.maximumRequestWaitMs=Math.max(this.stats.maximumRequestWaitMs,now-pending.requestedAt);
  this.operationTimer=setTimeout(()=>this.#fail('worker-window-timeout'),5000);
  try{this.worker.postMessage({schema:1,type:'window',session:this.session,catalogSHA256:this.catalogBinding,requestId:pending.requestId,requestedAt:pending.requestedAt,expiresAt:pending.expiresAt,dispatchedAt:now,request:pending.request});}catch(error){this.#fail('worker-command-failed: '+reason(error));}
 }
 #message(message){
  if(this.closed||this.failed)return;
  const receivedAt=performance.now();let processingDiagnostic=null;
  try{
   requireWorld(message?.schema===1&&message.session===this.session&&Number.isSafeInteger(message.bindingEpoch)&&(message.bindingEpoch>=this.bindingEpoch||message.type==='delivery-timing')&&(message.catalogSHA256===null||hex(message.catalogSHA256))&&(this.config.catalogSHA256===undefined||message.catalogSHA256===this.config.catalogSHA256||message.type==='failed'&&message.catalogSHA256===null),'installed scene worker message identity');
   requireWorld(message.clock01?.kind===this.clock01.kind&&message.clock01.processId===this.clock01.processId&&message.clock01.timeOrigin===this.clock01.timeOrigin&&Number.isFinite(message.sentAt01)&&message.sentAt01>=0&&message.sentAt01<=receivedAt,'verified shared installed worker performance clock');this.clockVerified01=true;
   if(message.type==='delivery-timing'){
    requireWorld(Number.isSafeInteger(message.requestId)&&message.requestId>0&&message.requestId<=this.serial&&Number.isFinite(message.postMessageMilliseconds)&&message.postMessageMilliseconds>=0,'bounded installed worker delivery timing');
    const record=this.diagnostics01.find(x=>x.requestId===message.requestId);
    if(record){requireWorld(record.dispatchedAt!==undefined,'dispatched installed worker timing');record.postMessageMilliseconds=message.postMessageMilliseconds;}
    this.stats.maximumPostMessageMs=Math.max(this.stats.maximumPostMessageMs,message.postMessageMilliseconds);return;
   }
   if(message.type==='initial-observation-result'){this.priorityPending=false;this.priorityAccepted=message.result?.accepted===true;if(!this.priorityAccepted)this.priorityRejections++;this.#emit();return;}
   if(message.type==='failed'){this.#fail('worker-'+message.phase+': '+reason(message.reason));return;}
   if(this.config.catalogSHA256===undefined&&(message.type==='scene'||message.type==='expired'||message.type==='ready'||message.ready===true))requireWorld(epoch(this.validationEpochUtc01)&&message.validationEpochUtc01===this.validationEpochUtc01,'current normal archive-validation epoch');
   if(message.type==='ready'||message.type==='status'){
    const wasReady=this.ready;this.bindingEpoch=message.bindingEpoch;this.catalogBinding=message.catalogSHA256;this.baseStatus=message.status;this.ready=message.ready===true||message.type==='ready';
    if(this.ready)this.stats.firstReadyAt01??=receivedAt;
    if(!wasReady&&!this.active){clearTimeout(this.operationTimer);this.operationTimer=null;}
    this.state=this.active?'loading-cached-regions':this.ready?'idle':'preparing/indexing';this.#emit();this.#schedule();return;
   }
   if(message.type==='not-ready'){
    requireWorld(this.active&&message.requestId===this.active.requestId,'matching pending installed scene cache request');processingDiagnostic=this.active.diagnostic01;this.#profile(this.active,message,receivedAt);clearTimeout(this.operationTimer);this.operationTimer=null;const active=this.active;this.active=null;this.ready=false;this.baseStatus=message.status;this.state='preparing/indexing';this.stats.cacheNotReadyResults++;this.#finish(active.diagnostic01,'cache-not-ready',receivedAt);this.#emit();return;
   }
   requireWorld((message.type==='scene'||message.type==='expired')&&this.ready&&this.active&&message.requestId===this.active.requestId,'matching installed scene worker request');
   const diagnostic=this.active.diagnostic01;processingDiagnostic=diagnostic;const profile=this.#profile(this.active,message,receivedAt);
   if(message.bindingEpoch!==this.bindingEpoch||message.catalogSHA256!==this.catalogBinding){this.stats.generationDiscards++;this.#finish(diagnostic,'binding-discarded',receivedAt);this.active=null;clearTimeout(this.operationTimer);this.operationTimer=null;this.#emit();this.#schedule();return;}
   if(profile.qualifiedResourceCount>0&&Number.isFinite(profile.windowCompletedAt))this.stats.firstInternallyValidatedAt01??=profile.windowCompletedAt;
   if(profile.genuineResourceVerified&&profile.activeSurfaces>0&&Number.isFinite(profile.windowCompletedAt)){this.stats.firstInternalNonemptyAt01??=profile.windowCompletedAt;this.stats.firstInternalNonemptyRequestId01??=message.requestId;}
   clearTimeout(this.operationTimer);this.operationTimer=null;const active=this.active;this.active=null;this.state='idle';this.baseStatus=message.status;
   if(message.type==='expired')this.stats.workerExpiredResults++;
   const before=performance.now();
   if(active.request.generation!==this.latestGeneration){this.stats.generationDiscards++;this.#finish(diagnostic,'generation-discarded',before);this.#emit();this.#schedule();return;}
   if(message.type==='expired'||before>=active.expiresAt){this.stats.staleResults++;this.stats.expiredBeforeAdoption++;this.#finish(diagnostic,message.type==='expired'?'expired-in-worker':'expired-before-adoption',before);this.#emit();this.#schedule();return;}
   diagnostic.validationStartedAt=before;
   const scene=this.adopter.adopt(message,{catalogSHA256:this.catalogBinding,requestId:active.requestId,bindingEpoch:this.bindingEpoch,...active.request});
   const admittedAt=performance.now(),validationMs=admittedAt-before;diagnostic.admittedAt=admittedAt;diagnostic.validationMilliseconds=validationMs;this.stats.maximumValidationMs=Math.max(this.stats.maximumValidationMs,validationMs);
   if(admittedAt>=active.expiresAt){this.stats.staleResults++;this.stats.expiredDuringAdoption++;this.#finish(diagnostic,'expired-during-adoption',admittedAt);this.#emit();this.#schedule();return;}
   const admissionMs=admittedAt-active.requestedAt;this.stats.maximumAdmissionMs=Math.max(this.stats.maximumAdmissionMs,admissionMs);
   this.#finish(diagnostic,'published',admittedAt);
   const callbackAt=performance.now();this.onScene(scene,{requestedAt:active.requestedAt,admittedAt,admissionMs,validationMs,expiresAt:active.expiresAt,requestId:active.requestId,generation:active.request.generation,geometryTimeMs:active.request.geometryTimeMs,durationMs:active.request.durationMs,catalogSHA256:this.catalogBinding,bindingEpoch:this.bindingEpoch,packetDigest:message.packetDigest,preparedSoundMapGeometry:message.preparedSoundMapGeometry,workerPreparationMilliseconds:message.workerPreparationMilliseconds,workerMemory:message.memory,lifecycle01:structuredClone(diagnostic),clock01:{...this.clock01,verified:true}});const callbackMs=performance.now()-callbackAt;diagnostic.publicationCallbackMilliseconds=callbackMs;this.stats.maximumPublicationCallbackMs=Math.max(this.stats.maximumPublicationCallbackMs,callbackMs);this.stats.publications++;this.stats.firstPublishedAt01??=admittedAt;if(profile.activeSurfaces>0)this.stats.firstPublishedNonemptyAt01??=admittedAt;this.#emit();this.#schedule();
  }catch(error){this.#finish(processingDiagnostic,'result-rejected');this.#fail('worker-result-rejected: '+reason(error));}
 }
 close({budgetMilliseconds=2000}={}){
  requireWorld(Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=100&&budgetMilliseconds<=10000,'bounded installed scene close');if(this.closePromise)return this.closePromise;
  this.closed=true;this.state='stopping';this.#finish(this.active?.diagnostic01,'cancelled');this.#finish(this.pending?.diagnostic01,'cancelled');this.pending=null;this.active=null;this.priorityPending=false;clearTimeout(this.dispatchTimer);clearTimeout(this.operationTimer);this.dispatchTimer=this.operationTimer=null;this.#emit();
  this.adopter?.close();
  this.closePromise=(async()=>{
   const began=performance.now();let timer;
   const wait=ms=>Promise.race([this.exitPromise.then(()=>true),new Promise(resolve=>timer=setTimeout(()=>resolve(false),Math.max(1,ms)))]).finally(()=>clearTimeout(timer));
   if(this.worker&&!this.exited)try{this.worker.postMessage({schema:1,type:'close',session:this.session,catalogSHA256:this.catalogBinding});}catch{}
   let joined=this.exited||await wait(Math.min(500,budgetMilliseconds/2));
   if(!joined&&this.worker){void this.worker.terminate().catch(()=>{});joined=await wait(Math.max(1,budgetMilliseconds-(performance.now()-began)));}
   this.state=joined?'stopped':'stopped-closure-unknown';this.#emit();return {closed:true,workerJoined:joined,workerExitCode:this.exitCode,elapsedMilliseconds:performance.now()-began,controlClosureUnknown:!joined,archiveDecode:false};
  })();return this.closePromise;
 }
}
