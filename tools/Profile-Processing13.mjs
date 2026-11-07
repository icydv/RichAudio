// Controlled original-only processing measurements. No endpoint or asset API.
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {Session} from 'node:inspector';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyProcessingSnapshot13,processingParent13} from './Freeze-Processing13.mjs';
import {startOwnedProcessing13,qualifyOwnedAffinity13,qualifyOwnedCompletion13,ownedChildGate13,waitOwnedMessage13,hashExecutedNode13} from './Owned-Processing13.mjs';
import {accountSpans09} from './Profile-Processing09.mjs';
import {sourceHistoryHash13,processingStateHash13} from './Processing-Continuity13.mjs';
import {createProcessingRoleCaptureStreet01,processingInputBindingStreet01,compareProcessingRolesStreet01,processingRoleContractStreet01} from './Processing-RolesStreet01.mjs';
export {accountSpans09 as accountProcessingSpans13} from './Profile-Processing09.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),check=(ok,reason)=>{if(!ok)throw Error(reason);};
const typed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),immediate=()=>new Promise(resolve=>setImmediate(resolve));
export const processingBudgetMs13=512000/48000;
const preparations=['cold','data-prepared','authored-jit'];
export function processingOptions13({snapshot=null,preparation='authored-jit',instrumented=false,profile='fixed-cpu-balanced',scene='walls',blocks=144,coldBlocks=24,lifecycle=false,texture=false}={}){
 check((snapshot===null||/^world13-(?:current|baseline)-[a-z0-9-]+$/.test(snapshot))&&preparations.includes(preparation)&&typeof instrumented==='boolean'&&['fixed-cpu-balanced','constructor-defaults'].includes(profile)&&['direct','walls'].includes(scene)&&Number.isInteger(blocks)&&blocks>=36&&blocks<=512&&Number.isInteger(coldBlocks)&&coldBlocks>0&&coldBlocks<blocks&&typeof lifecycle==='boolean'&&typeof texture==='boolean','bounded original processing13 configuration required');
 return {snapshot,preparation,instrumented,profile,scene,blocks,coldBlocks,lifecycle,texture};
}
export function summarizeDurations13(values){
 check(Array.isArray(values)&&values.every(v=>Number.isFinite(v)&&v>=0),'finite nonnegative durations required');
 const sorted=[...values].sort((a,b)=>a-b),pick=q=>sorted.length?sorted[Math.ceil(sorted.length*q)-1]:null;
 return {calls:sorted.length,p50Ms:pick(.5),p95Ms:pick(.95),p99Ms:pick(.99),maximumMs:sorted.at(-1)??null,overBudget:sorted.filter(v=>v>processingBudgetMs13).length,blockBudgetMs:processingBudgetMs13};
}
const cpuKind=typeof process.threadCpuUsage==='function'?'calling-thread':'whole-process-fallback';
const cpuUs=()=>{const c=cpuKind==='calling-thread'?process.threadCpuUsage():process.cpuUsage();return c.user+c.system;};
function recorder13(){
 let active=-1;const spans=[];
 const start=name=>{const s={id:spans.length,parent:active,name,cpuStartUs:cpuUs(),startMs:performance.now()};spans.push(s);active=s.id;return s;};
 const end=s=>{s.endMs=performance.now();s.cpuEndUs=cpuUs();s.wallMs=s.endMs-s.startMs;s.cpuMs=(s.cpuEndUs-s.cpuStartUs)/1000;s.wallMinusCpuMs=s.wallMs-s.cpuMs;active=s.parent;};
 return {spans,sync(name,fn){const s=start(name);try{return fn();}finally{end(s);}},async async(name,fn){const s=start(name);try{return await fn();}finally{end(s);}}};
}
function sampler13(){
 const session=new Session();session.connect();const anchors={};
 const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 return {async start(){await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});anchors.startBeforeMs=performance.now();await post('Profiler.start');anchors.startAfterMs=performance.now();},
  async stop(){anchors.stopBeforeMs=performance.now();const {profile}=await post('Profiler.stop');anchors.stopAfterMs=performance.now();const lower=Math.max(anchors.startBeforeMs-profile.startTime/1000,anchors.stopBeforeMs-profile.endTime/1000),upper=Math.min(anchors.startAfterMs-profile.startTime/1000,anchors.stopAfterMs-profile.endTime/1000);return {profile,anchors,requestedIntervalUs:500,mapping:{mapped:lower<=upper,offsetBoundsMs:{lower,upper},uncertaintyWidthMs:lower<=upper?upper-lower:null}};},close(){session.disconnect();}};
}

export async function runProcessingWorkload13(input={}, {runtimeAtGate=null}={}){
 const config=processingOptions13(input),runtimeBefore=await hashExecutedNode13(),snapshot=await verifyProcessingSnapshot13(root);
 if(runtimeAtGate)check(runtimeAtGate.sha256===runtimeBefore.sha256,'held render Node binary changed before workload');
 check(snapshot.manifest.name===config.snapshot,'child executes exact named frozen snapshot');
 const load=member=>import(pathToFileURL(path.join(root,member)).href);
 const [{StockGameplay},sourceModule,{ScenePreparation03},fixture]=await Promise.all([load('src/acoustics/vehicle/gameplay.mjs'),load('src/acoustics/vehicle/stock-source.mjs'),load('src/acoustics/world/scene-preparation03.mjs'),load('tests/fixtures/Processing13.mjs')]);
 const {StockVehicleSource}=sourceModule,{processingBank13,processingLifecycleFrame13,processingContexts13,budgetFrame042,budgetSession042,budgetWorld042}=fixture;
 const bank=processingBank13({texture:config.texture}),records=[],outsideRender=[],gcEvents=[],sourceRows=[],pathRows=[],observationSequence=[],pcmBlocks=[],dry=createHash('sha256'),stereo=createHash('sha256');
 const sourceNumbers=new WeakMap(),lastFrames=new WeakMap();let instance,runtime,recorder=null,sourceSerial=0,wall=0,next=0,sequence=0,histories=null,sourceCursorContinuous=true,rendererHistoryStable=true,plan=null,droppedGcEvents=0,maxRssBytes=0,roleCapture,roleCaptureMs=0,maximumRoleCaptureMs=0;
 const outside=async(name,fn)=>{const startMs=performance.now();try{return await fn();}finally{outsideRender.push({name,startMs,endMs:performance.now()});}};
 const sync=(name,fn)=>recorder?recorder.sync(name,fn):fn();
 const wrap=(target,method,name,async=false)=>{if(!config.instrumented)return;const original=target[method];check(typeof original==='function','existing production phase required');target[method]=async?function(...args){return recorder?recorder.async(name,()=>original.apply(this,args)):original.apply(this,args);}:function(...args){return recorder?recorder.sync(name,()=>original.apply(this,args)):original.apply(this,args);};};
 const collect=entries=>{for(const event of entries){if(gcEvents.length>=8192){droppedGcEvents++;continue;}gcEvents.push({startMs:event.startTime,endMs:event.startTime+event.duration,durationMs:event.duration,kind:event.detail?.kind??null,flags:event.detail?.flags??null});}};
 // Off means no inspector session, GC observer, heap reads, CPU counters or
 // production phase wrappers. The common wall envelope below is unchanged.
 const observer=config.instrumented?new PerformanceObserver(list=>collect(list.getEntries())):null;
 const sampler=config.instrumented?sampler13():null;let cpuSampling=null;
 try{
  if(config.preparation!=='cold')plan=await outside('immutableSourcePreparation10',()=>sourceModule.prepareStockSource10(bank));
  if(config.preparation==='authored-jit')await outside('authoredThrowawayJit',()=>sourceModule.warmStockSourceJit10(plan));
  const registry={resolve:(_model,context)=>context==='player'?{status:'available',bank}:{status:'unsupported-context'},createSource:(_model,context)=>{
   check(context==='player','unsupported NPC bank must never construct a source');
   const source=sync('sourceConstruction',()=>new StockVehicleSource(bank,plan?{preparation10:plan}:{}));
   check(source.frame===0&&source.stats.frames===0,'genuine source begins with zero history');sourceNumbers.set(source,++sourceSerial);wrap(source,'renderInto','sourceSynthesis');return source;
  }};
  instance=await outside('engineConstruction',()=>new StockGameplay({registry,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01'}));
  if(config.profile==='fixed-cpu-balanced')instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
  const settings={...instance.settings};
  roleCapture=createProcessingRoleCaptureStreet01(instance,{sourceSerials:sourceNumbers,inputBinding:processingInputBindingStreet01(bank,config,budgetSession042),expectedBlocks:config.blocks});
  for(const [target,method,name,async]of [[instance.playout,'sample','listenerPlayout'],[instance,'vehiclesAt','sourcePose'],[instance,'filter','controlFilter'],[instance.pipeline,'prepare','controlPreparation',true],[instance.pipeline.simulation,'observe','acousticObserve'],[instance.pipeline.simulation,'updateAccelerated','acousticUpdate',true],[instance.pipeline.simulation,'prepareUpdate','acousticPathPreparation'],[instance.pipeline.backend,'query','acousticVisibility',true],[instance.pipeline.backend,'cpu','acousticVisibilityCpu'],[instance.pipeline.simulation,'completeUpdate','acousticPathCompletion'],[instance.pipeline.renderer,'accept','rendererAccept'],[instance.pipeline,'process','pcmPipeline'],[instance.pipeline.renderer,'process','pcmRenderer']])wrap(target,method,name,async);
  if(config.scene==='walls'){
   runtime=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});
   const prepared=await outside('joinedAuthoredScenePreparation',()=>runtime.prepare({contexts:processingContexts13(),listenerAnchor:[-3,0,1],geometryTimeMs:0}));
   check(prepared.state==='prepared'&&prepared.workerJoined,'actual original geometry worker must join');
   await outside('authoredSceneAttachment',()=>instance.setPreparedResourceScene03(prepared.prepared.scene,{worldDigest:prepared.prepared.worldDigest,generation:prepared.prepared.generation}));
  }
  const beforeRender={sourceConstructions:sourceSerial,sourceCreations:instance.stageCounters.sourceCreations,rendererFrame:instance.pipeline.renderer.frame};
  observer?.observe({entryTypes:['gc']});await sampler?.start();
  for(let block=0;block<config.blocks;block++){
   const time=block*512/48000;wall=time*1000;
   if(time+1e-10>=next){const frame=budgetFrame042(sequence++,next),observed=config.lifecycle?processingLifecycleFrame13(frame,next):frame;roleCapture.observe(observed);instance.accept(observed,Math.max(0,(time-next)*1000),200);observationSequence.push({block,time:next,vehicles:observed.vehicles.map(v=>({id:v.id,generation:v.generation,context:v.context,running:v.running,operatingPoint:v.operatingPoint}))});next+=.05;}
   await immediate();
   const heapBefore=config.instrumented?process.memoryUsage().heapUsed:null;
   recorder=config.instrumented?recorder13():null;
   const startMs=performance.now();
   if(recorder)await recorder.async('render',()=>instance.render());else await instance.render();
   const endMs=performance.now(),spans=recorder?.spans??[];recorder=null;
   const renderMs=endMs-startMs;
   records.push({block,phase:block<config.coldBlocks?'cold-prefix':'later-blocks',startMs,endMs,renderMs,overBudget:renderMs>processingBudgetMs13,spans,heapUsedBefore:heapBefore,heapUsedAfter:config.instrumented?process.memoryUsage().heapUsed:null,sourceCreations:instance.stageCounters.sourceCreations,selectedPaths:instance.pipeline.lastControl.paths.length,reflectedPaths:instance.pipeline.lastControl.paths.filter(p=>p.order>0).length});
   const blockDry=createHash('sha256');for(const id of instance.ids){dry.update(typed(instance.inputs[id]));blockDry.update(typed(instance.inputs[id]));}
   stereo.update(typed(instance.left));stereo.update(typed(instance.right));pcmBlocks.push({block,drySha256:blockDry.digest('hex'),stereoSha256:sha(Buffer.concat([typed(instance.left),typed(instance.right)]))});
   const roleStart=performance.now();roleCapture.record(block);const roleMs=performance.now()-roleStart;roleCaptureMs+=roleMs;maximumRoleCaptureMs=Math.max(maximumRoleCaptureMs,roleMs);
   const sources=instance.slots.filter(s=>s.source).map(s=>{const prior=lastFrames.get(s.source);if(prior!==undefined)sourceCursorContinuous&&=s.source.frame-prior===512;lastFrames.set(s.source,s.source.frame);return {slot:s.index,identity:s.identity,sourceSerial:sourceNumbers.get(s.source),frame:s.source.frame,statsFrames:s.source.stats.frames,phaseHistorySha256:sourceHistoryHash13(s.source)};});sourceRows.push({block,sources});
   pathRows.push({block,pathsSha256:processingStateHash13(instance.pipeline.lastControl.paths),selectedPaths:records.at(-1).selectedPaths,reflectedPaths:records.at(-1).reflectedPaths});
   histories??=instance.pipeline.renderer.sourceList.map(s=>s.bands);rendererHistoryStable&&=instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);
   // Identical bounded memory guard in both controls, outside the render timer.
   maxRssBytes=Math.max(maxRssBytes,process.memoryUsage.rss());check(maxRssBytes<=384*1024*1024,'owned render RSS bound');
  }
  cpuSampling=await sampler?.stop()??null;await immediate();await immediate();if(observer)collect(observer.takeRecords());observer?.disconnect();
  if(config.instrumented)for(const r of records)r.spans=accountSpans09(r.spans,gcEvents);
  // Read fixed production counters directly: gameplay.diagnostics() also reads
  // the heap, which would violate the disabled instrumentation control.
  const diagnostics={stageCounters:instance.stageCounters,lifecycle:structuredClone(instance.lifecycle),pipeline:{history:instance.pipeline.renderer.historyDiagnostics,renderer:instance.pipeline.renderer.stats}};
  const after=await verifyProcessingSnapshot13(root);check(after.manifestSha256===snapshot.manifestSha256,'frozen closure manifest changed during trial');
  const runtimeAfter=await hashExecutedNode13();check(runtimeBefore.sha256===runtimeAfter.sha256,'render Node binary changed during workload');
  return {schema:2,kind:'RichAudioOriginalProcessingWorkload13',config,implementation:snapshot.manifest.implementation,runtime:{node:process.version,execSha256:runtimeBefore.sha256,executable:{atHeldGate:runtimeAtGate,before:runtimeBefore,after:runtimeAfter,stable:true},platform:process.platform,arch:process.arch,availableParallelism:os.availableParallelism(),logicalCpus:os.cpus().length},snapshot:{name:config.snapshot,manifestSha256:snapshot.manifestSha256,files:snapshot.manifest.files},
   summary:{all:summarizeDurations13(records.map(r=>r.renderMs)),cold:summarizeDurations13(records.slice(0,config.coldBlocks).map(r=>r.renderMs)),later:summarizeDurations13(records.slice(config.coldBlocks).map(r=>r.renderMs))},records,outsideRender,gcEvents,droppedGcEvents,cpuSampling,
   instrumentation:{enabled:config.instrumented,cpuKind:config.instrumented?cpuKind:null,cpuCountersQuantizedOnWindows:true,inspector:config.instrumented,gcObserver:config.instrumented,heapReads:config.instrumented,phaseWrappers:config.instrumented,commonWallTimer:true},
   continuity:{drySha256:dry.digest('hex'),stereoSha256:stereo.digest('hex'),blocks:pcmBlocks,rendererFrames:instance.pipeline.renderer.frame,sourceRows,pathRows,sourceConstructions:sourceSerial,sourceCreations:diagnostics.stageCounters.sourceCreations,sourceCursorContinuous,rendererHistoryStable,historyAffectedFrames:diagnostics.pipeline.history.affectedFrames,limiterEvents:diagnostics.pipeline.renderer.limited,nonzeroBlocks:diagnostics.stageCounters.stereo.nonzeroBlocks},comparisonContract:processingRoleContractStreet01,roleAudio:roleCapture.finish(),roleDiagnostics:{outsideRenderTimer:true,totalMs:roleCaptureMs,maximumBlockMs:maximumRoleCaptureMs,framesAdded:0},observationSequence,lifecycle:diagnostics.lifecycle,beforeRender,settings,sceneWorkers:runtime?{...runtime.stats}:null,maxRssBytes,
   limits:{blockFrames:512,sampleRate:48000,blockBudgetMs:processingBudgetMs13,pcmQueueFramesAdded:0,actualSourceWarmFrames:0,sourcePreparationCpuIsolation:false,commonBookkeepingOutsideRenderTimer:true,burstWithDeterministicObservationTime:true,osSchedulerTrace:false,deviceUnderflowMeasured:false,endpointUnderflows:null,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false}};
 }finally{recorder=null;observer?.disconnect();sampler?.close();await instance?.close();if(runtime)await runtime.close();}
}

export function compareProcessingPcm13(reference,trial){
 const a=reference.continuity,b=trial.continuity;
 const phaseQualified=c=>Array.isArray(c.sourceRows)&&c.sourceRows.length===c.blocks.length&&c.sourceRows.every(r=>Array.isArray(r.sources)&&r.sources.every(s=>/^[a-f0-9]{64}$/.test(s.phaseHistorySha256??'')));
 const pathsQualified=c=>Array.isArray(c.pathRows)&&c.pathRows.length===c.blocks.length&&c.pathRows.every(r=>/^[a-f0-9]{64}$/.test(r.pathsSha256??'')&&Number.isInteger(r.selectedPaths)&&Number.isInteger(r.reflectedPaths)&&r.reflectedPaths>=0&&r.reflectedPaths<=r.selectedPaths);
 const exact={dryBitIdentical:a.drySha256===b.drySha256,stereoBitIdentical:a.stereoSha256===b.stereoSha256,everyBlockBitIdentical:JSON.stringify(a.blocks)===JSON.stringify(b.blocks),framesIdentical:a.rendererFrames===b.rendererFrames,sourceLifecycleIdentical:JSON.stringify(a.sourceRows)===JSON.stringify(b.sourceRows),phaseAndGrainHistoryIdentical:[a,b].every(phaseQualified)&&JSON.stringify(a.sourceRows)===JSON.stringify(b.sourceRows),directAndReflectedPathsIdentical:[a,b].every(pathsQualified)&&JSON.stringify(a.pathRows)===JSON.stringify(b.pathRows),sourceCreationsIdentical:a.sourceCreations===b.sourceCreations,observationSequenceIdentical:JSON.stringify(reference.observationSequence)===JSON.stringify(trial.observationSequence),lifecycleDiagnosticsIdentical:JSON.stringify(reference.lifecycle)===JSON.stringify(trial.lifecycle),settingsIdentical:JSON.stringify(reference.settings)===JSON.stringify(trial.settings),historyPreserved:[a,b].every(c=>c.sourceCursorContinuous&&c.rendererHistoryStable&&c.historyAffectedFrames===0&&c.limiterEvents===0&&c.nonzeroBlocks>0),zeroHistoryBeforeRender:[reference,trial].every(r=>r.beforeRender.sourceConstructions===0&&r.beforeRender.sourceCreations===0&&r.beforeRender.rendererFrame===0)};
 if((reference.schema??1)<2&&(trial.schema??1)<2&&reference.comparisonContract===undefined&&trial.comparisonContract===undefined&&!reference.roleAudio&&!trial.roleAudio)return exact;
 check(reference.comparisonContract===processingRoleContractStreet01&&trial.comparisonContract===processingRoleContractStreet01,'matching explicit role-aware comparison versions required');
 check([reference,trial].every(r=>r.roleAudio?.blocks.length===r.continuity.blocks.length&&r.roleAudio.blocks.length*512===r.continuity.rendererFrames),'complete role/renderer block timeline required');
 // Historical raw aggregate hashes stay in the reports. Fresh role-aware
 // qualification compares every legacy role, identity and setting explicitly,
 // and separately requires the new disabled-feature buffers to be zero.
 const {dryBitIdentical,everyBlockBitIdentical,settingsIdentical,...unchanged}=exact;
 return {...unchanged,...compareProcessingRolesStreet01(reference.roleAudio,trial.roleAudio)};
}

export async function runProcessingTrial13(input,{affinity='normal',contention=0,failAfterContenderReady=null,failStop=false}={}){
 const config=processingOptions13(input);check(config.snapshot!==null&&['normal','restricted4','restricted1'].includes(affinity)&&Number.isInteger(contention)&&contention>=0&&contention<=2&&(failAfterContenderReady===null||Number.isInteger(failAfterContenderReady)&&failAfterContenderReady>=1&&failAfterContenderReady<=contention)&&typeof failStop==='boolean','bounded owned processing13 trial required');
 const parentRuntimeBefore=await hashExecutedNode13();
 const directory=path.join(root,'.local',config.snapshot);const closure=await verifyProcessingSnapshot13(directory),script=path.join(directory,'tools','Profile-Processing13.mjs');
 check(closure.manifest.name===config.snapshot,'exact frozen child closure required');
 const executedParentHelpers=['tools/Profile-Processing13.mjs','tools/Owned-Processing13.mjs','tools/Freeze-Processing13.mjs'];
 const verifyParent=async()=>{for(const member of executedParentHelpers)check(sha(await fs.readFile(path.join(root,member)))===closure.manifest.files.find(f=>f.path===member)?.sha256,'executed parent harness differs from frozen closure: '+member);};
 await verifyParent();
 const owned=[],contenders=[];let render,result=null,failure=null;const started=performance.now();
 try{
  render=startOwnedProcessing13(script,'render',config);owned.push(render);
  const qualified=await qualifyOwnedAffinity13(render,{mode:affinity});
  for(let i=0;i<contention;i++){
   const contender=startOwnedProcessing13(script,'contender',{}, {failStop:failStop&&i===0});owned.push(contender);contenders.push(contender);
   await qualifyOwnedAffinity13(contender,{mode:affinity,mask:qualified.actualMask});await contender.go();await waitOwnedMessage13(contender,'contender-active');
   if(failAfterContenderReady===i+1)throw Error('injected owned contender startup failure');
  }
  await render.go();await render.done;
  try{result=JSON.parse(render.record.stdout);check(result.kind==='RichAudioOriginalProcessingWorkload13'&&JSON.stringify(result.config)===JSON.stringify(config),'exact child workload identity required');check(result.snapshot?.manifestSha256===closure.manifestSha256&&result.snapshot.name===config.snapshot&&result.implementation===closure.manifest.implementation,'child result differs from authorized frozen closure');check(result.runtime.execSha256===parentRuntimeBefore.sha256&&result.runtime.node===parentRuntimeBefore.node&&result.runtime.executable.stable,'matched qualified parent/child Node bytes required');}catch(error){failure=error.message;}
  if(!qualifyOwnedCompletion13(render.record,{render:true}))failure??='owned render completion qualification failed';
 }catch(error){failure??=error.message;}
 finally{await Promise.all(owned.filter(o=>!o.record.joined).map(o=>o.stop()));}
 const workers=owned.map(o=>{const {stdout,...record}=o.record;return {...record,unparsedStdout:o===render&&!result?stdout:undefined};});
 const contendersQualified=contenders.length===contention&&contenders.every(c=>qualifyOwnedCompletion13(c.record));
 if(!contendersQualified)failure??='owned contender completion qualification failed';
 try{await verifyParent();}catch(error){failure??=error.message;}
 let parentRuntimeAfter=null;try{parentRuntimeAfter=await hashExecutedNode13();check(parentRuntimeBefore.sha256===parentRuntimeAfter.sha256,'parent Node binary changed during trial');}catch(error){failure??=error.message;}
 return {config,affinity,contention,childWallMs:performance.now()-started,result,failure,workers,parentRuntime:{before:parentRuntimeBefore,after:parentRuntimeAfter,stable:parentRuntimeAfter?.sha256===parentRuntimeBefore.sha256},allChildrenJoined:workers.every(w=>w.joined),contentionQualified:contendersQualified,closureManifestSha256:closure.manifestSha256};
}

export async function profileProcessing13({snapshots=[],selectedPreparations=['authored-jit'],instrumentation=[false,true],affinities=['normal','restricted4'],contentionCounts=[0,2],repetitions=2,topologies=['plain','texture'],scenes=['direct','walls'],profile='fixed-cpu-balanced'}={}, {trialRunner=runProcessingTrial13}={}){
 check(Array.isArray(snapshots)&&snapshots.length>=1&&snapshots.length<=2&&snapshots.every(s=>/^world13-(?:current|baseline)-[a-z0-9-]+$/.test(s))&&Array.isArray(selectedPreparations)&&selectedPreparations.length>=1&&selectedPreparations.length<=3&&selectedPreparations.every(p=>preparations.includes(p))&&Array.isArray(instrumentation)&&instrumentation.length>=1&&instrumentation.length<=2&&instrumentation.every(i=>typeof i==='boolean')&&Array.isArray(affinities)&&affinities.length>=1&&affinities.length<=3&&affinities.every(a=>['normal','restricted4','restricted1'].includes(a))&&Array.isArray(contentionCounts)&&contentionCounts.length>=1&&contentionCounts.length<=2&&contentionCounts.every(c=>Number.isInteger(c)&&c>=0&&c<=2)&&Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=3&&Array.isArray(topologies)&&topologies.length>=1&&topologies.length<=2&&topologies.every(t=>['plain','texture'].includes(t)),'bounded processing13 matrix required');
 check(Array.isArray(scenes)&&scenes.length>=1&&scenes.length<=2&&scenes.every(s=>['direct','walls'].includes(s)),'bounded original scene controls required');
 const requestedTrials=snapshots.length*selectedPreparations.length*instrumentation.length*affinities.length*contentionCounts.length*repetitions*topologies.length*scenes.length;check(requestedTrials<=384,'bounded processing13 matrix size required');
 check([snapshots,selectedPreparations,instrumentation,affinities,contentionCounts,topologies,scenes].every(a=>new Set(a).size===a.length),'unique controlled processing13 dimensions required');
 const runtimeBefore=await hashExecutedNode13();
 const trials=[];let terminalFailure=null;
 outer:for(let repetition=0;repetition<repetitions;repetition++)for(const topology of topologies)for(const scene of repetition%2?[...scenes].reverse():scenes)for(const affinity of affinities)for(const contention of contentionCounts)for(const preparation of selectedPreparations)for(const instrumented of repetition%2?[...instrumentation].reverse():instrumentation)for(const snapshot of repetition%2?[...snapshots].reverse():snapshots){
  const config=processingOptions13({snapshot,preparation,instrumented,profile,scene,blocks:topology==='texture'?192:144,lifecycle:topology==='texture',texture:topology==='texture'});let trial;
  try{trial=await trialRunner(config,{affinity,contention});}catch(error){trial={config,affinity,contention,result:null,failure:error.message,workers:[],allChildrenJoined:true,contentionQualified:false};}
  trials.push({repetition,topology,...trial});process.stderr.write(JSON.stringify({progress:trials.length,requestedTrials,repetition,snapshot,preparation,instrumented,affinity,contention,topology,failure:trial.failure,summary:trial.result?.summary.all})+'\n');
  if(trial.failure){terminalFailure={trial:trials.length-1,reason:trial.failure,automaticRetry:false,remainingTrialsStarted:false};break outer;}
 }
 let runtimeAfter=null,runtimeFailure=null;try{runtimeAfter=await hashExecutedNode13();}catch(error){runtimeFailure=error.message;}
 const runtimeStable=runtimeBefore.sha256===runtimeAfter?.sha256;
 if(!runtimeStable)terminalFailure??={trial:null,reason:runtimeFailure??'parent Node executable changed during matrix',automaticRetry:false,remainingTrialsStarted:false};
 return {schema:1,kind:'RichAudioProcessingReport13',createdUtc:new Date().toISOString(),completed:terminalFailure===null,requestedTrials,terminalFailure,parent:processingParent13,runtime:{node:process.version,execSha256:runtimeBefore.sha256,executable:{before:runtimeBefore,after:runtimeAfter,stable:runtimeStable},platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,availableParallelism:os.availableParallelism()},trials,
  gates:{functional:runtimeStable&&trials.every(t=>!t.failure&&t.allChildrenJoined&&t.contentionQualified),processingDeadline:runtimeStable&&trials.every(t=>!t.failure&&t.result?.summary.all.overBudget===0),blockBudgetMs:processingBudgetMs13},
  limits:{originalOnly:true,burstDiagnostic:true,noRetry:true,allOwnedChildrenJoined:trials.every(t=>t.allChildrenJoined),physicalLatencyMeasured:false,deviceUnderflowMeasured:false,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false,osSchedulerTrace:false,restricted1WithContentionIsOverloadDiagnostic:true}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]==='--owned-child'){check(process.argv.length===4,'exact owned child input required');await ownedChildGate13(JSON.parse(process.argv[3]),runProcessingWorkload13);}
  else{
   check(process.argv.length===6&&process.argv[2]==='--run'&&process.argv[3]==='--out','use --run --out .local/fresh-processing13.json JSON-config');
   const target=path.resolve(root,process.argv[4]);check(path.dirname(target)===path.join(root,'.local')&&/^[\w-]+\.json$/.test(path.basename(target)),'fresh direct local report required');
   await fs.mkdir(path.dirname(target),{recursive:true});check(!(await fs.lstat(path.dirname(target))).isSymbolicLink(),'local report links refused');const handle=await fs.open(target,'wx');
   try{const report=await profileProcessing13(JSON.parse(process.argv[5]));await handle.writeFile(JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind:report.kind,trials:report.trials.length,completed:report.completed,gates:report.gates}));if(!report.completed)process.exitCode=1;}
   catch(error){await handle.writeFile(JSON.stringify({kind:'RichAudioProcessingFailedAttempt13',createdUtc:new Date().toISOString(),reason:error.message})+'\n');throw error;}finally{await handle.close();}
  }
 }catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
