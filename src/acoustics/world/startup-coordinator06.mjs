import {importedContextBinding08} from './resource-import03.mjs';
// Offline/control-side preparation of EVERY declared eligible tile, before
// locality-based runtime loading. There is no listener/visited input to run().
import {performance} from 'node:perf_hooks';
import {isStartupCatalogue06,boundedStartupMetadata06,startupLimits06} from './startup-catalogue06.mjs';
import {ResourceTileBuilder04} from './cache-builder04.mjs';
import {isResourceInventory04} from './resource-inventory04.mjs';
import {createSceneTileContext03} from './scene-union03.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {createTile} from '../research/local-geometry.mjs';
import {fields,freeze,digest,identifier,requireWorld} from './contracts.mjs';
const coordinators=new WeakSet(),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const completed=status=>status==='prepared'||status==='cached',key=(pageId,tileId)=>pageId+'\n'+tileId;
const reason=e=>String(e?.message??e??'unknown').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
function signalAborted(signal){if(signal===undefined)return false;try{return abortGetter.call(signal);}catch{throw Error('Native startup AbortSignal required');}}
function validateCheckpoint(value){
 boundedStartupMetadata06(value);fields(value,['schema','kind','catalogueId','catalogueDigest','build','cacheRevision','pages']);
 requireWorld(value.schema===1&&value.kind==='RichAudioStartupCheckpoint06'&&hex(value.catalogueDigest)&&value.cacheRevision==='resource-cache04','exact startup checkpoint identity');identifier(value.catalogueId);identifier(value.build);
 requireWorld(Array.isArray(value.pages)&&value.pages.length<=startupLimits06.pages,'bounded checkpoint pages');const ids=new Set();
 for(const p of value.pages){fields(p,['pageId','inventoryDigest','artifacts']);identifier(p.pageId);requireWorld(!ids.has(p.pageId)&&hex(p.inventoryDigest),'unique checkpoint inventory page');ids.add(p.pageId);requireWorld(p.artifacts&&!Array.isArray(p.artifacts)&&Object.keys(p.artifacts).length<=64&&Object.entries(p.artifacts).every(([k,v])=>hex(k)&&hex(v)),'bounded expected artifact bindings');}
 return value;
}
export class StartupAcousticCoordinator06 {
 constructor({catalogue,pageProvider,checkpoint,storeForPage,session,trustedCheckpointSHA256=null,onProgress=()=>{},runtimeState={epoch:0,digest:null}}={}){
  requireWorld(isStartupCatalogue06(catalogue)&&typeof pageProvider==='function'&&typeof storeForPage==='function'&&checkpoint&&typeof checkpoint.load==='function'&&typeof checkpoint.save==='function'&&/^[a-f0-9]{32}$/.test(session)&&typeof onProgress==='function'&&(trustedCheckpointSHA256===null||hex(trustedCheckpointSHA256)),'explicit qualified startup catalogue/storage/control callbacks');
  this.catalogue=catalogue;this.pageProvider=pageProvider;this.checkpoint=checkpoint;this.storeForPage=storeForPage;this.session=session;this.trustedCheckpointSHA256=trustedCheckpointSHA256;this.onProgress=onProgress;
  this.records=new Map(catalogue.pages.flatMap(p=>p.tiles.map(t=>[key(p.pageId,t.tileId),{...t,pageId:p.pageId,status:t.eligible?'pending':'unsupported',reason:t.unknownReasons.join(', ')||null,artifactDigest:null,geometryCoverage:'unverified',geometryUnknownCount:null,geometryMissingRegions:[]}])));
  this.artifacts=new Map();this.restoration=null;this.checkpointSHA256=trustedCheckpointSHA256;this.checkpointError=null;this.restoreWarning=null;this.closed=false;this.running=null;this.activeBuilder=null;this.controller=null;this.operations=new Set();this.queries=new Set();this.boundaryFailure=null;this.quarantined=0;this.lateCompletions=0;this.controlMilliseconds=5000;this.stage=catalogue.discovery.sealed?'checking-cache':'discovering-resources';this.terminal='not-ready';this.partialSelected=false;this.runtimeState={epoch:-1,digest:null};this.setRuntimeState(runtimeState);
  this.stats={workersStarted:0,workersJoined:0,cacheHits:0,prepared:0,checkpointWrites:0,pageLoads:0,inputLoads:0,maximumResidentTiles:0,progressCallbackFailures:0,sourceGenerationsModified:0,pcmQueueFramesAdded:0};coordinators.add(this);
 }
 setRuntimeState(value){boundedStartupMetadata06(value,1024);fields(value,['epoch','digest']);requireWorld(Number.isSafeInteger(value.epoch)&&value.epoch>=0&&value.epoch>=this.runtimeState.epoch&&(value.digest===null||hex(value.digest)),'monotonic declared runtime-state metadata');this.runtimeState=freeze({epoch:value.epoch,digest:value.digest});return this.runtimeState;}
 tileStatus06({pageId,tileId}={}){identifier(pageId);identifier(tileId);const r=this.records.get(key(pageId,tileId));return r?freeze({status:r.status,geometryCoverage:r.geometryCoverage,geometryUnknownCount:r.geometryUnknownCount,reason:r.reason,artifactDigest:r.artifactDigest}):null;}
 snapshot({includeTiles=true}={}){
  requireWorld(typeof includeTiles==='boolean','explicit startup snapshot detail');let ready=0,failed=0,unsupported=0,geometryUnknownTiles=0,geometryUnknownRegions=0,geometryUnknownEntries=0,geometryUnverifiedTiles=0;for(const r of this.records.values()){if(completed(r.status)){ready++;if(r.geometryCoverage!=='complete-synthetic'||r.geometryUnknownCount>0||r.geometryMissingRegions.length)geometryUnknownTiles++;geometryUnknownRegions+=r.geometryMissingRegions.length;geometryUnknownEntries+=r.geometryUnknownCount;}else if(r.eligible)geometryUnverifiedTiles++;if(r.status==='failed')failed++;else if(r.status==='unsupported')unsupported++;}
  const eligibleComplete=ready===this.catalogue.eligibleTiles&&this.catalogue.eligibleTiles>0,knownTotal=this.catalogue.discovery.sealed,percent=knownTotal&&this.catalogue.eligibleTiles?Math.floor(ready*100/this.catalogue.eligibleTiles):null;
  return freeze({schema:1,kind:'RichAudioStartupProgress06',catalogueId:this.catalogue.catalogueId,catalogueDigest:this.catalogue.catalogueDigest,stage:this.stage,discoverySealed:knownTotal,totalTiles:this.catalogue.totalTiles,eligibleTiles:this.catalogue.eligibleTiles,completedEligibleTiles:ready,failedTiles:failed,unsupportedTiles:unsupported,geometryUnknownTiles,geometryUnknownRegions,geometryUnknownEntries,geometryUnverifiedTiles,unknownRegions:this.catalogue.discovery.unknownRegions,percent,percentBasis:this.catalogue.eligibleTiles?'verified-persisted-eligible-tiles-only':'no-supported-work',eligibleComplete,readiness:this.terminal,continuePartiallySelected:this.partialSelected,recoveryAvailable:failed>0||geometryUnknownTiles>0||!!this.checkpointError||!!this.restoreWarning||!!this.boundaryFailure,checkpointSHA256:this.checkpointSHA256,checkpointError:this.checkpointError,restoreWarning:this.restoreWarning,controlBoundaryFailure:this.boundaryFailure,unresolvedControlOperations:this.operations.size,quarantinedControlOperations:this.quarantined,lateControlCompletions:this.lateCompletions,controlClosureUnknown:this.quarantined>0,pendingQueries:this.queries.size,controlProviderGuarantee:'trusted-callback-promise-settlement-only-not-OS-containment',runtimeState:{...this.runtimeState,authority:'declared-runtime-state-not-validated',staticGeometryInvalidated:false},...this.stats,residentTileLimit:8,parallelWorkerLimit:1,actualWorldCoverage:'unmeasured',qualification:this.catalogue.qualification,installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,...(includeTiles?{tiles:[...this.records.values()].map(r=>({...r}))}:{})});
 }
 #geometry(record,tile){record.geometryCoverage=tile.engineTile.coverage;record.geometryUnknownCount=tile.unknown.length;record.geometryMissingRegions=tile.engineTile.missingRegions.map(r=>({...r}));}
 #emit(stage=this.stage){this.stage=stage;try{this.onProgress(this.snapshot({includeTiles:false}));}catch{this.stats.progressCallbackFailures++;}}
 async #control(kind,operation,{signal=this.controller?.signal,deadline=performance.now()+this.controlMilliseconds,maximumMilliseconds=this.controlMilliseconds,allowAfterBoundary=false}={}){
  requireWorld(allowAfterBoundary||!this.boundaryFailure,'quarantined control boundary requires recovery');
  if(signal?.aborted)throw Error('startup control operation cancelled before invocation');
  const remaining=Math.min(maximumMilliseconds,deadline-performance.now());requireWorld(remaining>0,'startup control deadline before invocation');
  const token={kind,quarantined:false,done:null},aborter=new AbortController();this.operations.add(token);
  let timer,abort,settled=false;
  return new Promise((resolve,reject)=>{
   const quarantine=cause=>{if(settled)return;settled=true;token.quarantined=true;this.quarantined++;this.boundaryFailure=kind+': '+cause;aborter.abort();clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);reject(Error('startup control operation '+cause+': '+kind+'; underlying closure unknown'));};
   abort=()=>quarantine('cancelled');if(signal)signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>quarantine('timeout'),Math.max(1,remaining));
   // Synchronous callbacks are trusted host code and cannot be preempted by a
   // JS timer. Actual archive providers still need independent process limits.
   token.done=Promise.resolve().then(()=>operation({signal:aborter.signal,deadline}));
   token.done.then(value=>{this.operations.delete(token);if(token.quarantined){this.lateCompletions++;return;}settled=true;clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);resolve(value);},error=>{this.operations.delete(token);if(token.quarantined){this.lateCompletions++;return;}settled=true;clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);reject(error);});
   if(signal?.aborted)abort();
  });
 }
 async #restore(control={}){
  if(this.restoration)return this.restoration;
  this.restoration=(async()=>{if(this.trustedCheckpointSHA256===null)return;try{const old=await this.#control('checkpoint-load',ctx=>this.checkpoint.load(this.trustedCheckpointSHA256,ctx),control);if(!old){this.restoreWarning='trusted-checkpoint-missing';return;}validateCheckpoint(old);requireWorld(old.catalogueId===this.catalogue.catalogueId&&old.build===this.catalogue.build,'checkpoint catalogue/build compatibility');const allowed=new Set([...this.records.values()].filter(t=>t.eligible).map(t=>t.planDigest));for(const p of old.pages)for(const [plan,artifact]of Object.entries(p.artifacts))if(allowed.has(plan))this.artifacts.set(plan,artifact);}catch(error){this.restoreWarning='checkpoint-rejected: '+reason(error);}})();return this.restoration;
 }
 #checkpointValue(){return {schema:1,kind:'RichAudioStartupCheckpoint06',catalogueId:this.catalogue.catalogueId,catalogueDigest:this.catalogue.catalogueDigest,build:this.catalogue.build,cacheRevision:'resource-cache04',pages:this.catalogue.pages.map(p=>({pageId:p.pageId,inventoryDigest:p.inventoryDigest,artifacts:Object.fromEntries(p.tiles.filter(t=>t.eligible&&this.artifacts.has(t.planDigest)).map(t=>[t.planDigest,this.artifacts.get(t.planDigest)]))}))};}
 async #persist({final=false}={}){
  if(this.checkpointError||this.boundaryFailure)return false;try{const value=validateCheckpoint(this.#checkpointValue()),result=await this.#control('checkpoint-save',ctx=>this.checkpoint.save(value,ctx),final?{signal:null,deadline:performance.now()+this.controlMilliseconds}:{});requireWorld(result&&hex(result.sha256)&&Number.isSafeInteger(result.bytes)&&result.bytes>0&&result.bytes<=startupLimits06.metadataBytes+160,'bounded saved startup checkpoint receipt');this.checkpointSHA256=result.sha256;this.stats.checkpointWrites++;return true;}catch(error){this.checkpointError='checkpoint-write-failed: '+reason(error);return false;}
 }
 async #page(descriptor,control={}){const value=await this.#control('page-provider',ctx=>this.pageProvider(descriptor.pageId,ctx),control);this.stats.pageLoads++;requireWorld(value&&isResourceInventory04(value.inventory)&&value.inventory.inventoryDigest===descriptor.inventoryDigest&&value.inventory.build===this.catalogue.build&&value.inventory.tilePlans.length===descriptor.tiles.length&&descriptor.tiles.every(t=>value.inventory.tilePlans.some(p=>p.tileId===t.tileId&&p.planDigest===t.planDigest)),'exact qualified startup page identity');return value;}
 async #store(pageId,control={}){const store=await this.#control('store-provider',ctx=>this.storeForPage(pageId,ctx),control);requireWorld(store&&typeof store.load==='function'&&typeof store.publish==='function','existing bounded resource tile store/router required');return store;}
 async run({signal,budgetMilliseconds=60000,tileBudgetMilliseconds=5000,checkpointEveryPages=8,controlOperationMilliseconds=5000}={}){
  requireWorld(!this.closed&&!this.running&&!this.queries.size&&!this.boundaryFailure&&Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=3600000&&Number.isFinite(tileBudgetMilliseconds)&&tileBudgetMilliseconds>=1&&tileBudgetMilliseconds<=10000&&Number.isFinite(controlOperationMilliseconds)&&controlOperationMilliseconds>=1&&controlOperationMilliseconds<=10000&&Number.isInteger(checkpointEveryPages)&&checkpointEveryPages>=1&&checkpointEveryPages<=32,'one bounded startup preparation');signalAborted(signal);this.controlMilliseconds=controlOperationMilliseconds;
  const controller=new AbortController();this.controller=controller;const abort=()=>controller.abort();if(signal)EventTarget.prototype.addEventListener.call(signal,'abort',abort,{once:true});if(signalAborted(signal))abort();
  const deadline=performance.now()+budgetMilliseconds,timer=setTimeout(()=>controller.abort(),budgetMilliseconds);let finish;const active={done:new Promise(r=>finish=r)};this.running=active;this.terminal='not-ready';this.checkpointError=null;
  for(const r of this.records.values())if(r.eligible){r.status='pending';r.reason=null;r.artifactDigest=null;r.geometryCoverage='unverified';r.geometryUnknownCount=null;r.geometryMissingRegions=[];}
  const stopped=()=>this.closed||controller.signal.aborted||performance.now()>=deadline||!!this.boundaryFailure;
  try{
   this.#emit(this.catalogue.discovery.sealed?'checking-cache':'discovering-resources');await this.#restore({deadline});
   let pagesSinceCheckpoint=0;
   for(const descriptor of this.catalogue.pages){
    if(stopped())break;let page,store;
    try{page=await this.#page(descriptor,{deadline});if(stopped())break;store=await this.#store(descriptor.pageId,{deadline});}catch(error){for(const t of descriptor.tiles){const r=this.records.get(key(descriptor.pageId,t.tileId));if(r.eligible){r.status='failed';r.reason='page-unavailable: '+reason(error);}}this.#emit();continue;}
    for(const t of descriptor.tiles){
     if(stopped())break;const record=this.records.get(key(descriptor.pageId,t.tileId));if(!record.eligible)continue;const plan=page.inventory.tilePlans.find(p=>p.tileId===t.tileId);
     try{
      this.#emit('checking-cache');const expected=this.artifacts.get(plan.planDigest);
      if(expected){const cached=await this.#control('cache-load',ctx=>store.load(plan,{tileDigest:expected,...ctx}),{deadline});if(stopped())break;if(cached.tile){this.#geometry(record,cached.tile);record.status='cached';record.artifactDigest=expected;this.stats.cacheHits++;this.#emit('verifying-cache');continue;}}
      this.#emit('converting-geometry');const inputs=await this.#control('source-inputs',ctx=>typeof page.loadInputs==='function'?page.loadInputs(t.tileId,ctx):page.inputs,{deadline});this.stats.inputLoads++;if(stopped())break;
      const boundedStore={load:(p,o)=>this.#control('cache-load',ctx=>store.load(p,{...o,...ctx}),{deadline}),publish:(p,t,o)=>this.#control('cache-publish',ctx=>store.publish(p,t,{...o,...ctx}),{deadline})};
      const builder=this.activeBuilder=new ResourceTileBuilder04({inventory:page.inventory,inputs,store:boundedStore,session:this.session,trustedArtifacts:Object.fromEntries(descriptor.tiles.filter(d=>this.artifacts.has(d.planDigest)).map(d=>[d.planDigest,this.artifacts.get(d.planDigest)]))});
      let prepared;
      try{prepared=await builder.prepareNearby({listenerAnchor:t.bounds.min.map((v,i)=>(v+t.bounds.max[i])/2),radius:0,maximumTiles:1,budgetMilliseconds:Math.min(tileBudgetMilliseconds,Math.max(1,deadline-performance.now())),signal:controller.signal});this.stats.maximumResidentTiles=Math.max(this.stats.maximumResidentTiles,builder.resident.size);const artifact=builder.artifactBindings()[plan.planDigest];if(stopped())break;requireWorld(prepared.state==='prepared'&&hex(artifact),'startup tile did not complete: '+(prepared.results.find(r=>r.tileId===t.tileId)?.reason??prepared.state));this.#emit('verifying-cache');const verified=await this.#control('cache-verify',ctx=>store.load(plan,{tileDigest:artifact,...ctx}),{deadline});if(stopped())break;requireWorld(verified.tile,'persisted tile verification required before progress');this.#geometry(record,verified.tile);this.artifacts.set(plan.planDigest,artifact);record.status='prepared';record.artifactDigest=artifact;this.stats.prepared++;}
      finally{this.stats.workersStarted+=builder.stats.workersStarted;this.stats.workersJoined+=builder.stats.workersJoined;await this.#control('worker-close',()=>builder.close(),{signal:null,deadline:performance.now()+5000,maximumMilliseconds:5000,allowAfterBoundary:true});if(this.activeBuilder===builder)this.activeBuilder=null;}
     }catch(error){if(stopped())break;record.status='failed';record.reason=reason(error);}
     this.#emit();
    }
    if(stopped())break;if(++pagesSinceCheckpoint>=checkpointEveryPages){pagesSinceCheckpoint=0;if(!await this.#persist())break;}
   }
   // A trusted expected artifact is a derivation binding, not proof the file
   // still exists. Only verified loads/builds above count toward completion.
   if(!this.checkpointError&&!this.boundaryFailure)await this.#persist({final:true});
   const state=this.snapshot({includeTiles:false});
   if(stopped()){this.terminal=!this.closed&&performance.now()>=deadline?'budget-exceeded':this.closed||controller.signal.aborted?'cancelled':'partial';this.#emit(this.boundaryFailure?'control-closure-unknown':this.terminal);}
   else if(state.eligibleComplete&&this.catalogue.discovery.sealed&&!state.failedTiles&&!state.unsupportedTiles&&!state.geometryUnknownTiles&&!state.unknownRegions.length&&!this.checkpointError){this.terminal='ready-supported-subset';this.#emit('ready');}
   else{this.terminal='partial';this.#emit('partial-ready');}
   return this.snapshot();
  }finally{clearTimeout(timer);if(signal)EventTarget.prototype.removeEventListener.call(signal,'abort',abort);if(this.running===active)this.running=null;this.controller=null;finish();}
 }
 continuePartially(){requireWorld(!this.running&&!this.closed,'idle explicit continue-partially selection');this.partialSelected=true;this.terminal='partial';return this.snapshot();}
 async loadPrepared({pageId,tileId,engine={order:2,airDbPerMetre:[0,0,0]},budgetMilliseconds=5000}={}){
  requireWorld(!this.closed&&!this.running&&!this.queries.size&&!this.boundaryFailure&&Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=10000,'one idle bounded prepared runtime cache query');identifier(pageId);identifier(tileId);
  const descriptor=this.catalogue.pages.find(p=>p.pageId===pageId),t=descriptor?.tiles.find(t=>t.tileId===tileId);requireWorld(t,'selected declared catalogue tile');let finish;const token={controller:new AbortController(),done:new Promise(r=>finish=r)};this.queries.add(token);const control={signal:token.controller.signal,deadline:performance.now()+budgetMilliseconds,maximumMilliseconds:budgetMilliseconds};
  try{await this.#restore(control);const expected=this.artifacts.get(t.planDigest);if(this.closed||this.boundaryFailure||!t.eligible||!expected)return freeze({state:'not-ready',pageId,tileId,workerStarted:false,conversionWorkers:0});
   const page=await this.#page(descriptor,control),store=await this.#store(pageId,control),plan=page.inventory.tilePlans.find(p=>p.tileId===tileId),result=await this.#control('cache-query',ctx=>store.load(plan,{tileDigest:expected,...ctx}),control);if(this.closed)return {state:'not-ready',pageId,tileId,workerStarted:false,conversionWorkers:0};requireWorld(result.tile,'expected prepared tile is missing');const tile=result.tile,xml=tile.parser.inputFormat==='codewalker-xml05',scene=acousticScene(createTile({...tile.engineTile,session:this.session}),tile.materials,engine),context=createSceneTileContext03({tileId:tile.tileId,worldDigest:this.catalogue.catalogueDigest,scene,sourceBindings:tile.sources.map(({id,sha256})=>({id,sha256})),...importedContextBinding08(tile.parser)});const record=this.records.get(key(pageId,tileId));this.#geometry(record,tile);record.status='cached';record.artifactDigest=expected;record.reason=null;if(record.geometryCoverage!=='complete-synthetic'||record.geometryUnknownCount||record.geometryMissingRegions.length){this.terminal='partial';this.#emit('partial-ready');}return freeze({state:'prepared-cache-hit',pageId,tileId,planDigest:t.planDigest,tile,context,workerStarted:false,conversionWorkers:0,installedWorldVerified:false});
  }catch(error){const record=this.records.get(key(pageId,tileId));record.status='failed';record.artifactDigest=null;record.geometryCoverage='rejected';record.geometryUnknownCount=null;record.geometryMissingRegions=[];record.reason='prepared-cache-query-rejected: '+reason(error);this.terminal='partial';this.#emit(this.boundaryFailure?'control-closure-unknown':'partial-ready');return freeze({state:this.closed?'not-ready':'cache-rejected',pageId,tileId,reason:reason(error),workerStarted:false,conversionWorkers:0,controlClosureUnknown:this.quarantined>0});}
  finally{this.queries.delete(token);finish();}
 }
 async close({budgetMilliseconds=5000}={}){
  requireWorld(Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=10000,'bounded startup close budget');this.closed=true;this.controller?.abort();for(const q of this.queries)q.controller.abort();
  const pending=[...(this.running?[this.running.done]:[]),...Array.from(this.queries,q=>q.done),...Array.from(this.operations,o=>o.done)].filter(Boolean);let timer;
  const joined=await Promise.race([Promise.allSettled(pending).then(()=>true),new Promise(r=>timer=setTimeout(()=>r(false),budgetMilliseconds))]);clearTimeout(timer);
  return freeze({closed:true,joinState:joined&&!this.running&&!this.queries.size&&!this.operations.size?'joined-observed-promises':'bounded-return-closure-unknown',workerJoined:!this.activeBuilder&&this.stats.workersStarted===this.stats.workersJoined,pendingQueries:this.queries.size,unresolvedControlOperations:this.operations.size,controlClosureUnknown:this.quarantined>0||!joined,providerOsClosureEstablished:false});
 }
}
export const isStartupCoordinator06=value=>coordinators.has(value);
