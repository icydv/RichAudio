// One persistent off-producer derived-cache worker. Pending observations are
// coalesced into one latest window, never a growing queue or PCM delay.
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {bindInstalledStaticSceneWorker01} from './installed-static-scene01.mjs';
import {requireWorld,vector} from './contracts.mjs';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),interval=500;
const reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
export class InstalledSceneService01 {
 constructor({config,session,onScene=()=>{},onStatus=()=>{}}={}){
  requireWorld(config&&typeof config.manifestPath==='string'&&typeof config.catalogPath==='string'&&(hex(config.catalogSHA256)||config.catalogSHA256==null&&hex(config.expectedGameSHA256))&&(config.expectedGameSHA256===undefined||hex(config.expectedGameSHA256))&&/^[a-f0-9]{32}$/.test(session)&&typeof onScene==='function'&&typeof onStatus==='function','bound installed scene service configuration');
  const maximumResidentResources=config.maximumResidentResources??8;
  requireWorld(Number.isInteger(maximumResidentResources)&&maximumResidentResources>=1&&maximumResidentResources<=16,'bounded installed scene resident resources');
  this.config={manifestPath:config.manifestPath,catalogPath:config.catalogPath,...(config.catalogSHA256==null?{}:{catalogSHA256:config.catalogSHA256}),...(config.expectedGameSHA256===undefined?{}:{expectedGameSHA256:config.expectedGameSHA256}),maximumResidentResources};this.catalogBinding=config.catalogSHA256??null;this.bindingEpoch=0;this.session=session;this.onScene=onScene;this.onStatus=onStatus;
  this.closed=false;this.failed=false;this.ready=false;this.state='preparing/indexing';this.failure=null;this.active=null;this.pending=null;this.latestGeneration=null;this.serial=0;this.lastDispatch=-Infinity;this.dispatchTimer=null;this.operationTimer=null;this.closePromise=null;this.exited=false;this.exitCode=null;this.baseStatus={stage:'preparing/indexing',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},actualWorldCoverage:'unmeasured'};
  this.stats={workersStarted:0,workersJoined:0,requests:0,dispatched:0,coalesced:0,publications:0,staleResults:0,generationDiscards:0,pendingExpired:0,callbackFailures:0,failures:0,maximumAdmissionMs:0,maximumValidationMs:0,maximumWorkerPreparationMs:0,maximumPublicationCallbackMs:0,minimumDispatchIntervalMs:null,pcmQueueFramesAdded:0};
  let joined;this.exitPromise=new Promise(resolve=>joined=resolve);this.joined=joined;
  this.#emit();
  try{
   this.worker=new Worker(new URL('./installed-scene-worker01.mjs',import.meta.url),{workerData:{schema:1,config:this.config,session},resourceLimits:{maxOldGenerationSizeMb:512,maxYoungGenerationSizeMb:64,stackSizeMb:8}});this.stats.workersStarted++;this.worker.unref();
   this.adopter=bindInstalledStaticSceneWorker01(this.worker,{session});
   this.worker.on('message',m=>this.#message(m));this.worker.on('error',error=>this.#fail('worker-error: '+reason(error)));
   this.worker.on('exit',code=>{this.exited=true;this.exitCode=code;this.stats.workersJoined++;clearTimeout(this.operationTimer);this.operationTimer=null;this.joined(code);if(!this.closed&&!this.failed)this.#fail('worker-exited-without-close');this.#emit();});
   this.operationTimer=setTimeout(()=>this.#fail('worker-initialization-timeout'),10000);
  }catch(error){this.exited=true;this.joined(null);this.#fail('worker-start-failed: '+reason(error));}
 }
 snapshot(){return {...this.baseStatus,stage:this.failed?'failed':this.closed?'stopped':this.baseStatus.stage,worker:{kind:'persistent-derived-cache-worker',state:this.state,ready:this.ready,closed:this.closed,failed:this.failed,failure:this.failure,inFlight:this.active!==null,pendingLatest:this.pending!==null,rateLimitHz:2,maxOldGenerationMiB:512,cacheIoOffProducer:true,archiveDecode:false,catalogSHA256:this.catalogBinding,bindingEpoch:this.bindingEpoch,workerExited:this.exited,...this.stats}};}
 #emit(){try{this.onStatus(this.snapshot());}catch{this.stats.callbackFailures++;}}
 #fail(message){if(this.failed||this.closed)return;this.failed=true;this.failure=reason(message);this.state='failed';this.stats.failures++;this.pending=null;this.active=null;clearTimeout(this.dispatchTimer);clearTimeout(this.operationTimer);this.dispatchTimer=this.operationTimer=null;this.adopter?.close();this.#emit();if(this.worker&&!this.exited)void this.worker.terminate().catch(()=>{});}
 updateWindow({listener,sources=[],generation,geometryTimeMs,durationMs=1000,radius=32,maximumSurfaces=2048,adaptiveRadius=true,engine={}}={}){
  requireWorld(!this.closed&&!this.failed,'active installed scene service');listener=vector(listener);requireWorld(Array.isArray(sources)&&sources.length<=2,'bounded installed source window');sources=sources.map(vector);
  requireWorld(Number.isSafeInteger(generation)&&generation>0&&(this.latestGeneration===null||generation>=this.latestGeneration)&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Number.isFinite(durationMs)&&durationMs>0&&durationMs<=1000&&engine&&typeof engine==='object'&&!Array.isArray(engine),'fresh bounded installed scene request');
  requireWorld(Number.isFinite(radius)&&radius>=1&&radius<=32&&Number.isInteger(maximumSurfaces)&&maximumSurfaces>=1&&maximumSurfaces<=4096&&typeof adaptiveRadius==='boolean','bounded installed acoustic workset');
  const engineCopy=structuredClone(engine);requireWorld(Buffer.byteLength(JSON.stringify(engineCopy))<=16384,'bounded installed scene processing settings');
  const requestedAt=performance.now(),requestId=++this.serial;this.latestGeneration=generation;this.stats.requests++;if(this.pending)this.stats.coalesced++;
  this.pending={requestId,requestedAt,expiresAt:requestedAt+durationMs,request:{listener,sources,generation,geometryTimeMs,durationMs,radius,maximumSurfaces,adaptiveRadius,engine:engineCopy}};this.#schedule();
  return {requestId,requestedAt,expiresAt:requestedAt+durationMs,coalescedLatest:true};
 }
 #schedule(){if(this.closed||this.failed||!this.ready||this.active||!this.pending||this.dispatchTimer!==null)return;const delay=Math.max(0,this.lastDispatch+interval-performance.now());if(delay>0){this.dispatchTimer=setTimeout(()=>{this.dispatchTimer=null;this.#dispatch();},Math.ceil(delay));}else this.#dispatch();}
 #dispatch(){if(this.closed||this.failed||!this.ready||this.active||!this.pending)return;const now=performance.now();if(now-this.lastDispatch<interval){this.#schedule();return;}const pending=this.pending;this.pending=null;
  if(now>=pending.expiresAt){this.stats.pendingExpired++;this.#emit();return;}
  if(Number.isFinite(this.lastDispatch)){const elapsed=now-this.lastDispatch;this.stats.minimumDispatchIntervalMs=this.stats.minimumDispatchIntervalMs===null?elapsed:Math.min(this.stats.minimumDispatchIntervalMs,elapsed);}this.lastDispatch=now;this.active=pending;this.state='loading-cached-regions';this.stats.dispatched++;
  this.operationTimer=setTimeout(()=>this.#fail('worker-window-timeout'),5000);
  try{this.worker.postMessage({schema:1,type:'window',session:this.session,catalogSHA256:this.catalogBinding,requestId:pending.requestId,request:pending.request});}catch(error){this.#fail('worker-command-failed: '+reason(error));}
 }
 #message(message){
  if(this.closed||this.failed)return;
  try{
   requireWorld(message?.schema===1&&message.session===this.session&&Number.isSafeInteger(message.bindingEpoch)&&message.bindingEpoch>=this.bindingEpoch&&(message.catalogSHA256===null||hex(message.catalogSHA256))&&(this.config.catalogSHA256===undefined||message.catalogSHA256===this.config.catalogSHA256||message.type==='failed'&&message.catalogSHA256===null),'installed scene worker message identity');
   if(message.type==='failed'){this.#fail('worker-'+message.phase+': '+reason(message.reason));return;}
   if(message.type==='ready'||message.type==='status'){
    const wasReady=this.ready;this.bindingEpoch=message.bindingEpoch;this.catalogBinding=message.catalogSHA256;this.baseStatus=message.status;this.ready=message.ready===true||message.type==='ready';
    if(!wasReady&&!this.active){clearTimeout(this.operationTimer);this.operationTimer=null;}
    this.state=this.active?'loading-cached-regions':this.ready?'idle':'preparing/indexing';this.#emit();this.#schedule();return;
   }
   if(message.type==='not-ready'){
    requireWorld(this.active&&message.requestId===this.active.requestId,'matching pending installed scene cache request');clearTimeout(this.operationTimer);this.operationTimer=null;const active=this.active;this.active=null;this.ready=false;this.baseStatus=message.status;this.state='preparing/indexing';if(!this.pending&&performance.now()<active.expiresAt)this.pending=active;this.#emit();return;
   }
   requireWorld(message.type==='scene'&&this.ready&&this.active&&message.requestId===this.active.requestId,'matching installed scene worker request');
   if(message.bindingEpoch!==this.bindingEpoch||message.catalogSHA256!==this.catalogBinding){this.stats.generationDiscards++;this.active=null;clearTimeout(this.operationTimer);this.operationTimer=null;this.#emit();this.#schedule();return;}
   clearTimeout(this.operationTimer);this.operationTimer=null;const active=this.active;this.active=null;this.state='idle';this.baseStatus=message.status;
   const before=performance.now();
   if(active.request.generation!==this.latestGeneration){this.stats.generationDiscards++;this.#emit();this.#schedule();return;}
   if(before>=active.expiresAt){this.stats.staleResults++;this.#emit();this.#schedule();return;}
   const scene=this.adopter.adopt(message,{catalogSHA256:this.catalogBinding,requestId:active.requestId,bindingEpoch:this.bindingEpoch,...active.request});
   const admittedAt=performance.now(),validationMs=admittedAt-before;this.stats.maximumValidationMs=Math.max(this.stats.maximumValidationMs,validationMs);
   if(admittedAt>=active.expiresAt){this.stats.staleResults++;this.#emit();this.#schedule();return;}
   const admissionMs=admittedAt-active.requestedAt;this.stats.maximumAdmissionMs=Math.max(this.stats.maximumAdmissionMs,admissionMs);
   requireWorld(Number.isFinite(message.workerPreparationMilliseconds)&&message.workerPreparationMilliseconds>=0,'installed worker processing timing');this.stats.maximumWorkerPreparationMs=Math.max(this.stats.maximumWorkerPreparationMs,message.workerPreparationMilliseconds);
   const callbackAt=performance.now();this.onScene(scene,{requestedAt:active.requestedAt,admittedAt,admissionMs,validationMs,expiresAt:active.expiresAt,requestId:active.requestId,generation:active.request.generation,geometryTimeMs:active.request.geometryTimeMs,durationMs:active.request.durationMs,catalogSHA256:this.catalogBinding,bindingEpoch:this.bindingEpoch,packetDigest:message.packetDigest,preparedSoundMapGeometry:message.preparedSoundMapGeometry,workerPreparationMilliseconds:message.workerPreparationMilliseconds,workerMemory:message.memory});this.stats.maximumPublicationCallbackMs=Math.max(this.stats.maximumPublicationCallbackMs,performance.now()-callbackAt);this.stats.publications++;this.#emit();this.#schedule();
  }catch(error){this.#fail('worker-result-rejected: '+reason(error));}
 }
 close({budgetMilliseconds=2000}={}){
  requireWorld(Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=100&&budgetMilliseconds<=10000,'bounded installed scene close');if(this.closePromise)return this.closePromise;
  this.closed=true;this.state='stopping';this.pending=null;this.active=null;clearTimeout(this.dispatchTimer);clearTimeout(this.operationTimer);this.dispatchTimer=this.operationTimer=null;this.#emit();
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
