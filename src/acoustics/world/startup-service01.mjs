// Automatic control-host scheduling around the existing catalogue, converter,
// cache and runtime contexts. This service belongs on the acoustic worker;
// neither game fibres nor the PCM callback may await it.
import {performance} from 'node:perf_hooks';
import {isStartupCoordinator06} from './startup-coordinator06.mjs';
import {createStartupSpatialIndex06,selectPreparedStartupTiles06} from './startup-spatial06.mjs';
import {freeze,requireWorld,vector} from './contracts.mjs';
const services=new WeakSet(),reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
export class StartupAcousticWorldService01 {
 constructor({coordinator,workTilesPerTurn=4,yieldMilliseconds=4,tileBudgetMilliseconds=5000,controlOperationMilliseconds=5000,onStatus=()=>{},onWindow=()=>{},engine={order:2,airDbPerMetre:[0,0,0]}}={}){
  requireWorld(isStartupCoordinator06(coordinator)&&Number.isInteger(workTilesPerTurn)&&workTilesPerTurn>=1&&workTilesPerTurn<=32&&Number.isFinite(yieldMilliseconds)&&yieldMilliseconds>=0&&yieldMilliseconds<=1000&&Number.isFinite(tileBudgetMilliseconds)&&tileBudgetMilliseconds>=1&&tileBudgetMilliseconds<=10000&&Number.isFinite(controlOperationMilliseconds)&&controlOperationMilliseconds>=1&&controlOperationMilliseconds<=10000&&typeof onStatus==='function'&&typeof onWindow==='function','qualified automatic world service configuration');
  this.coordinator=coordinator;this.index=createStartupSpatialIndex06(coordinator.catalogue);this.workTilesPerTurn=workTilesPerTurn;this.yieldMilliseconds=yieldMilliseconds;this.tileBudgetMilliseconds=tileBudgetMilliseconds;this.controlOperationMilliseconds=controlOperationMilliseconds;this.onStatus=onStatus;this.onWindow=onWindow;this.engine=engine;
  this.started=false;this.running=false;this.refreshing=false;this.closed=false;this.stopping=false;this.completion=null;this.controller=null;this.window=null;this.windowRevision=0;this.loadedWindowRevision=-1;this.contexts=new Map();this.lastSelection=null;this.failure=null;this.stage='preparing/indexing';this.activeMilliseconds=0;this.turns=0;this.windowLoads=0;this.callbackFailures=0;this.checkpointCompleted=0;this.checkpointIntervalTiles=Math.max(workTilesPerTurn,Math.ceil(coordinator.catalogue.eligibleTiles/24));this.lastClose=null;services.add(this);
 }
 start({listener=null}={}){
  requireWorld(!this.started&&!this.closed,'one automatic world startup');if(listener!==null)this.updateWindow({listener});this.started=true;this.running=true;this.completion=this.#run();return this.snapshot();
 }
 updateWindow({listener,sources=[],radius=64,maximumTiles=8}={}){
  requireWorld(!this.closed&&Array.isArray(sources)&&sources.length<=2&&Number.isFinite(radius)&&radius>=0&&radius<=256&&Number.isInteger(maximumTiles)&&maximumTiles>=1&&maximumTiles<=8,'bounded automatic runtime window');listener=vector(listener);sources=sources.map(vector);requireWorld(sources.every(p=>Math.hypot(...p.map((v,i)=>v-listener[i]))<=2048),'bounded runtime sound corridor');
  this.window={listener,sources,radius,maximumTiles};this.windowRevision++;return this.windowRevision;
 }
 snapshot(){const p=this.coordinator.snapshot({includeTiles:false});return freeze({kind:'RichAudioAutomaticWorldService01',stage:this.stage,started:this.started,closed:this.closed,stopping:this.stopping,failure:this.failure,turns:this.turns,activeMilliseconds:this.activeMilliseconds,windowLoads:this.windowLoads,windowRevision:this.windowRevision,loadedWindowRevision:this.loadedWindowRevision,residentContexts:this.contexts.size,residentContextLimit:8,callbackFailures:this.callbackFailures,buildIndependentOfTravel:true,checkpointIntervalTiles:this.checkpointIntervalTiles,preparation:p,window:this.lastSelection,geometryAuthority:'existing-qualified-provider-only',actualWorldCoverage:p.actualWorldCoverage,installedWorldVerified:p.installedWorldVerified,genuineResourceVerified:p.genuineResourceVerified,pcmQueueFramesAdded:0,executionSurface:'acoustic-control-worker',lastClose:this.lastClose});}
 #emit(){try{this.onStatus(this.snapshot());}catch{this.callbackFailures++;}}
 async #window(){
  if(!this.window||this.stopping)return;const revision=this.windowRevision,selection=selectPreparedStartupTiles06(this.coordinator,{...this.window,index:this.index}),next=new Map();this.stage='loading-cached-regions';
  for(const row of selection.selected){if(this.stopping)return;const cacheKey=row.planDigest,held=this.contexts.get(cacheKey);if(held){next.set(cacheKey,held);continue;}const loaded=await this.coordinator.loadPrepared({...row,engine:this.engine,budgetMilliseconds:this.controlOperationMilliseconds});if(loaded.state==='prepared-cache-hit'){next.set(cacheKey,loaded.context);this.windowLoads++;}}
  // A newer physical observation supersedes this async cache selection. Retain
  // no stale publication; the next turn/explicit refresh selects the latest.
  if(this.stopping||revision!==this.windowRevision)return;
  const changed=revision!==this.loadedWindowRevision||next.size!==this.contexts.size||[...next.keys()].some(k=>!this.contexts.has(k));this.contexts=next;this.lastSelection=selection;this.loadedWindowRevision=revision;
  if(changed)try{this.onWindow({selection,contexts:[...next.values()],windowRevision:revision,runtimeState:this.coordinator.runtimeState});}catch(error){this.callbackFailures++;this.failure='runtime-window-consumer: '+reason(error);throw error;}
 }
 async #checkpoint(){const p=this.coordinator.snapshot({includeTiles:false});if(p.completedEligibleTiles===this.checkpointCompleted&&p.checkpointSHA256!==null)return;requireWorld(await this.coordinator.checkpointProgress(),'automatic world checkpoint failed');this.checkpointCompleted=p.completedEligibleTiles;}
 async #run(){
  let first=true;
  try{
   while(!this.stopping){
    const began=performance.now();this.stage='building-missing-regions';this.controller=new AbortController();
    const result=await this.coordinator.run({signal:this.controller.signal,maximumTiles:this.workTilesPerTurn,resume:!first,persistAtEnd:false,priorityAnchor:this.window?.listener??null,tileBudgetMilliseconds:this.tileBudgetMilliseconds,controlOperationMilliseconds:this.controlOperationMilliseconds,checkpointEveryPages:32,budgetMilliseconds:Math.min(3600000,Math.max(10000,(this.tileBudgetMilliseconds+this.controlOperationMilliseconds*6)*this.workTilesPerTurn))});
    first=false;this.controller=null;this.turns++;this.activeMilliseconds+=performance.now()-began;
    if(this.stopping)break;
    await this.#window();
    if(result.completedEligibleTiles-this.checkpointCompleted>=this.checkpointIntervalTiles||result.readiness!=='more-work')await this.#checkpoint();
    this.stage=result.readiness==='more-work'?'building-missing-regions':result.readiness==='ready-supported-subset'?'ready-within-declared-coverage':'partial/unsupported';this.#emit();
    if(result.readiness!=='more-work')break;
    // Yield between bounded chunks. This is work scheduling, never PCM buffering.
    await new Promise(resolve=>setTimeout(resolve,this.yieldMilliseconds));
   }
   if(this.stopping&&!this.coordinator.closed&&!this.coordinator.snapshot({includeTiles:false}).controlClosureUnknown)await this.#checkpoint();
  }catch(error){this.failure??=reason(error);this.stage='failed';this.#emit();}
  finally{this.controller=null;this.running=false;if(this.stopping&&this.stage!=='failed')this.stage='stopped';this.#emit();}
  return this.snapshot();
 }
 // Refresh a completed service's runtime window without converting resources.
 // Live hosts coalesce observations into updateWindow(), then schedule this on
 // their acoustic worker; the audio callback only consumes the published scene.
 async refreshWindow(){requireWorld(this.started&&!this.closed&&!this.running&&!this.refreshing,'idle prepared-world runtime refresh');this.refreshing=true;try{await this.#window();this.#emit();return this.snapshot();}finally{this.refreshing=false;}}
 async close({budgetMilliseconds=5000}={}){
  requireWorld(Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=10000,'bounded automatic world close');this.stopping=true;this.controller?.abort();
  const joined=await this.coordinator.close({budgetMilliseconds});this.closed=true;this.contexts.clear();this.lastClose=joined;this.stage=joined.controlClosureUnknown?'stopped-closure-unknown':'stopped';this.#emit();return this.snapshot();
 }
}
export const isStartupAcousticWorldService01=value=>services.has(value);
