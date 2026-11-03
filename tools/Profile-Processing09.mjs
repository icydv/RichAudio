// Diagnostic wrappers only: production source construction, causal solver and
// renderer execute unchanged. Only original analytic PCM/geometry are loaded.
import {performance,PerformanceObserver,monitorEventLoopDelay} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Session} from 'node:inspector';
import {fileURLToPath} from 'node:url';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import {createBudgetEngine042,budgetFrame042,budgetSession042,budgetWorld042,budgetFrames042,budgetRate042} from '../tests/fixtures/AcousticBudget042.mjs';
import {processingContexts09} from '../tests/fixtures/Processing09.mjs';
import {summarizeDurations042,acousticBudgetMs042} from './Profile-AcousticBudget042.mjs';

const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const typed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const cpuKind=typeof process.threadCpuUsage==='function'?'calling-thread':'whole-process';
const cpuUs=()=>{const c=cpuKind==='calling-thread'?process.threadCpuUsage():process.cpuUsage();return c.user+c.system;};
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const variants=['reference-direct','instrumented-direct','reference-walls','instrumented-walls'];
const profiles=['constructor-defaults','fixed-cpu-balanced'];
function options09({blocks=144,coldBlocks=24,variant='instrumented-direct',profile='constructor-defaults'}={}){
 check(Number.isInteger(blocks)&&blocks>=36&&blocks<=512&&Number.isInteger(coldBlocks)&&coldBlocks>=1&&coldBlocks<blocks&&variants.includes(variant)&&profiles.includes(profile),'bounded original processing09 workload required');
 return {blocks,coldBlocks,variant,profile};
}

export function intervalUnion09(intervals){
 check(Array.isArray(intervals)&&intervals.every(i=>Number.isFinite(i.startMs)&&Number.isFinite(i.endMs)&&i.endMs>=i.startMs),'finite ordered intervals required');
 const sorted=intervals.map(i=>({...i})).sort((a,b)=>a.startMs-b.startMs),result=[];
 for(const i of sorted){const last=result.at(-1);if(last&&i.startMs<=last.endMs)last.endMs=Math.max(last.endMs,i.endMs);else result.push(i);}
 return result.reduce((n,i)=>n+i.endMs-i.startMs,0);
}

// Children are serial or nested in this workload. Inclusive counters are never
// summed as independent costs. Signed CPU residuals retain counter quantization.
export function accountSpans09(spans,gcEvents=[]){
 check(Array.isArray(spans)&&spans.every((s,i)=>s.id===i&&Number.isInteger(s.parent)&&s.parent>=-1&&s.parent<i&&[s.startMs,s.endMs,s.cpuStartUs,s.cpuEndUs].every(Number.isFinite)&&s.endMs>=s.startMs&&s.cpuEndUs>=s.cpuStartUs),'ordered nested measured spans required');
 intervalUnion09(gcEvents);
 return spans.map(s=>{
  const children=spans.filter(c=>c.parent===s.id);
  check(children.every(c=>c.startMs>=s.startMs&&c.endMs<=s.endMs),'child interval must be contained');
  const wallMs=s.endMs-s.startMs,cpuMs=(s.cpuEndUs-s.cpuStartUs)/1000;
  const childUnionMs=intervalUnion09(children),childInclusiveMs=children.reduce((n,c)=>n+c.endMs-c.startMs,0);
  check(Math.abs(childUnionMs-childInclusiveMs)<1e-6,'parallel siblings cannot be assigned exclusive CPU by subtraction');
  const gcTemporalOverlaps=gcEvents.flatMap((g,event)=>{const overlapMs=Math.max(0,Math.min(s.endMs,g.endMs)-Math.max(s.startMs,g.startMs));return overlapMs?[{event,overlapMs}]:[];});
  const gcTemporalUnionMs=intervalUnion09(gcTemporalOverlaps.map(g=>({startMs:Math.max(s.startMs,gcEvents[g.event].startMs),endMs:Math.min(s.endMs,gcEvents[g.event].endMs)})));
  const childCpuMs=children.reduce((n,c)=>n+(c.cpuEndUs-c.cpuStartUs)/1000,0);
  return {...s,wallMs,cpuMs,wallMinusCpuMs:wallMs-cpuMs,childUnionMs,exclusiveWallMs:wallMs-childUnionMs,exclusiveCpuMs:cpuMs-childCpuMs,gcTemporalOverlaps,gcTemporalUnionMs};
 });
}

// V8 stack samples add an independent view when the Windows thread CPU counter
// advances in coarse ticks. Sample counts are not converted into CPU durations.
export function associateCpuSamples09(profile,anchors,records){
 check(profile&&Number.isFinite(profile.startTime)&&Number.isFinite(profile.endTime)&&Array.isArray(profile.nodes)&&Array.isArray(profile.samples)&&Array.isArray(profile.timeDeltas)&&profile.samples.length===profile.timeDeltas.length,'raw V8 CPU profile required');
 const lower=Math.max(anchors.startBeforeMs-profile.startTime/1000,anchors.stopBeforeMs-profile.endTime/1000),upper=Math.min(anchors.startAfterMs-profile.startTime/1000,anchors.stopAfterMs-profile.endTime/1000);
 if(lower>upper)return {mapped:false,reason:'V8/profile clock anchor bounds do not intersect',offsetBoundsMs:{lower,upper},samples:[]};
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parent=new Map();for(const n of profile.nodes)for(const child of n.children??[])parent.set(child,n.id);
 const byPhase={},byStack={},samples=[];let clockUs=profile.startTime;
 for(let index=0;index<profile.samples.length;index++){
  clockUs+=profile.timeDeltas[index];const lowMs=clockUs/1000+lower,highMs=clockUs/1000+upper,block=records.find(r=>lowMs>=r.startMs&&highMs<=r.endMs);
  let phase='outside-render-or-boundary';
  if(block){const contained=block.spans.filter(s=>s.startMs<=lowMs&&s.endMs>=highMs);const leaf=contained.at(-1);phase=leaf?.name??'render-boundary';}
  const stack=[];for(let id=profile.samples[index];nodes.has(id)&&stack.length<128;id=parent.get(id)){const f=nodes.get(id).callFrame;stack.push({functionName:f.functionName,url:f.url,lineNumber:f.lineNumber,columnNumber:f.columnNumber});}
  const own=stack.find(f=>/\/(?:src\/acoustics|tools\/Profile-Processing09)/.test(f.url.replaceAll('\\','/'))),top=stack[0];
  const stackLabel=own?own.url.replaceAll('\\','/').split('/').slice(-3).join('/')+':'+own.functionName:(top?.functionName??'unavailable');
  byPhase[phase]=(byPhase[phase]??0)+1;byStack[stackLabel]=(byStack[stackLabel]??0)+1;
  samples.push({index,node:profile.samples[index],lowMs,highMs,block:block?.block??null,phase,stackLabel});
 }
 return {mapped:true,offsetBoundsMs:{lower,upper},uncertaintyWidthMs:upper-lower,samples,byPhase,byStack,
  limit:'V8 sampled stacks and interval membership only, not exact per-phase CPU time or OS descheduling evidence. Samples whose clock uncertainty crosses a render or phase boundary remain outside/at the containing parent.'};
}

function cpuSampler09(){
 const session=new Session();session.connect();const anchors={};
 const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 return {async start(){await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});anchors.startBeforeMs=performance.now();await post('Profiler.start');anchors.startAfterMs=performance.now();},
  async stop(){anchors.stopBeforeMs=performance.now();const {profile}=await post('Profiler.stop');anchors.stopAfterMs=performance.now();return {profile,anchors,requestedSamplingIntervalUs:500};},close(){session.disconnect();}};
}

function recorder09(){
 let active=-1;const spans=[];
 const start=name=>{const s={id:spans.length,parent:active,name,cpuStartUs:cpuUs(),startMs:performance.now()};spans.push(s);active=s.id;return s;};
 const end=s=>{s.endMs=performance.now();s.cpuEndUs=cpuUs();active=s.parent;};
 return {spans,sync(name,fn){const s=start(name);try{return fn();}finally{end(s);}},async async(name,fn){const s=start(name);try{const value=fn();s.callReturnedMs=performance.now();return await value;}finally{end(s);}}};
}

function stageTotals09(records){
 const names=[...new Set(records.flatMap(r=>r.spans.map(s=>s.name)))];
 return Object.fromEntries(names.map(name=>[name,Object.fromEntries(['wallMs','exclusiveWallMs','cpuMs','exclusiveCpuMs','wallMinusCpuMs'].map(key=>{
  const values=records.map(r=>r.spans.filter(s=>s.name===name).reduce((n,s)=>n+s[key],0));
  // Signed counters must not pass through the nonnegative duration validator.
  const sorted=[...values].sort((a,b)=>a-b),pick=q=>sorted[Math.ceil(sorted.length*q)-1];
  return [key,{calls:values.length,p50Ms:pick(.5),p99Ms:pick(.99),maximumMs:sorted.at(-1),minimumMs:sorted[0]}];
 }))]));
}

export function compareProcessingPcm09(reference,trial){
 const a=reference.continuity,b=trial.continuity;
 check(a&&b&&Array.isArray(a.blocks)&&Array.isArray(b.blocks),'completed original processing PCM required');
 return {dryBitIdentical:a.drySha256===b.drySha256,stereoBitIdentical:a.stereoSha256===b.stereoSha256,
  everyBlockBitIdentical:JSON.stringify(a.blocks)===JSON.stringify(b.blocks),framesIdentical:a.rendererFrames===b.rendererFrames,sourceCursorIdentical:a.finalSourceFrame===b.finalSourceFrame,
  continuous:[a,b].every(c=>c.sourceObjectStable&&c.sourceCursorContinuous&&c.rendererHistoryStable&&c.sourceCreations===1&&c.historyAffectedFrames===0&&c.limiterEvents===0&&c.nonzeroBlocks>0)};
}

export async function runProcessingWorkload09(input={}){
 const config=options09(input),instrumented=config.variant.startsWith('instrumented'),walls=config.variant.endsWith('walls');
 const gcEvents=[],records=[],outsideRender=[],dispatchProbes=[],pcmBlocks=[],dry=createHash('sha256'),stereo=createHash('sha256');
 let droppedGcEvents=0,recorder=null,instance,runtime,source=null,cursor=null,histories=null,sourceObjectStable=true,sourceCursorContinuous=true,rendererHistoryStable=true,next=0,sequence=0;
 const collect=entries=>{for(const e of entries){if(gcEvents.length===8192){droppedGcEvents++;continue;}gcEvents.push({startMs:e.startTime,endMs:e.startTime+e.duration,durationMs:e.duration,kind:e.detail?.kind??null,flags:e.detail?.flags??null});}};
 const observer=new PerformanceObserver(list=>collect(list.getEntries()));observer.observe({entryTypes:['gc']});
 const sampler=cpuSampler09();let cpuSamples;
 const delay=monitorEventLoopDelay({resolution:1});delay.enable();
 const sync=(name,fn)=>recorder&&instrumented?recorder.sync(name,fn):fn();
 const outside=async(name,fn)=>{const startMs=performance.now(),cpuStartUs=cpuUs();try{return await fn();}finally{outsideRender.push({name,startMs,endMs:performance.now(),cpuStartUs,cpuEndUs:cpuUs()});}};
 const wrap=(target,method,name,async=false)=>{const original=target[method];check(typeof original==='function','existing production phase required');target[method]=async?function(...args){return recorder.async(name,()=>original.apply(this,args));}:function(...args){return recorder.sync(name,()=>original.apply(this,args));};};
 try{
  const engine=await outside('engineConstruction',()=>createBudgetEngine042({profile:config.profile,constructSource:bank=>sync('sourceConstruction',()=>new StockVehicleSource(bank)),onSource:s=>{if(instrumented)wrap(s,'renderInto','sourceSynthesis');}}));instance=engine.instance;
  const originalSettings={...instance.settings};
  if(instrumented){
   wrap(instance.playout,'sample','listenerPlayout');wrap(instance,'vehiclesAt','sourcePose');wrap(instance,'filter','controlFilter');
   wrap(instance.pipeline,'prepare','controlPreparation',true);wrap(instance.pipeline.simulation,'observe','acousticObserve');
   wrap(instance.pipeline.simulation,'updateAccelerated','acousticUpdate',true);wrap(instance.pipeline.simulation,'prepareUpdate','acousticPathPreparation');
   wrap(instance.pipeline.backend,'query','acousticVisibility',true);wrap(instance.pipeline.backend,'cpu','acousticVisibilityCpu');
   wrap(instance.pipeline.simulation,'completeUpdate','acousticPathCompletion');wrap(instance.pipeline.renderer,'accept','rendererAccept');
   wrap(instance.pipeline,'process','pcmPipeline');wrap(instance.pipeline.renderer,'process','pcmRenderer');
  }
  if(walls){
   runtime=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});
   const result=await outside('joinedOriginalSceneWorker',()=>runtime.prepare({contexts:processingContexts09(),listenerAnchor:[-3,0,1],geometryTimeMs:0}));
   check(result.state==='prepared'&&result.workerJoined,'joined original geometry preparation required');
   await outside('originalSceneAttachment',()=>instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:result.prepared.worldDigest,generation:result.prepared.generation}));
  }
  await sampler.start();const utilizationStart=performance.eventLoopUtilization();
  for(let block=0;block<config.blocks;block++){
   const time=block*budgetFrames042/budgetRate042;engine.setWall(time*1000);
   if(time+1e-10>=next){instance.accept(budgetFrame042(sequence++,next),Math.max(0,(time-next)*1000),200);next+=.05;}
   // Dispatch is deliberately yielded in both reference and instrumented arms.
   // This measures callback dispatch, including event-loop/OS/other work, not
   // an OS descheduling trace or endpoint-paced render deadline.
   const requestedMs=performance.now(),cpuStartUs=cpuUs();await immediate();
   const callbackMs=performance.now(),cpuEndUs=cpuUs();dispatchProbes.push({block,requestedMs,callbackMs,delayMs:callbackMs-requestedMs,cpuStartUs,cpuEndUs,cpuMs:(cpuEndUs-cpuStartUs)/1000});
   const heapBefore=process.memoryUsage().heapUsed;recorder=recorder09();
   await recorder.async('render',()=>instance.render());
   const spans=recorder.spans;recorder=null;
   const root=spans[0],renderMs=root.endMs-root.startMs;
   records.push({block,phase:block<config.coldBlocks?'cold-prefix':'later-blocks',startMs:root.startMs,endMs:root.endMs,renderMs,overBudget:renderMs>acousticBudgetMs042,
    heapUsedBefore:heapBefore,heapUsedAfter:process.memoryUsage().heapUsed,spans,selectedPaths:instance.pipeline.lastControl.paths.length,
    reflectedPaths:instance.pipeline.lastControl.paths.filter(p=>p.order>0).length,surfaces:instance.pipeline.simulation.scene.tile?.surfaces.length??0,sourceCreations:instance.stageCounters.sourceCreations,
    backend:{requested:instance.pipeline.backend.requested,active:instance.pipeline.backend.active,requests:instance.pipeline.backend.totals.requests,gpuCompleted:instance.pipeline.backend.totals.gpuCompletedBatches}});
   const blockDry=createHash('sha256');for(const id of instance.ids){dry.update(typed(instance.inputs[id]));blockDry.update(typed(instance.inputs[id]));}
   stereo.update(typed(instance.left));stereo.update(typed(instance.right));pcmBlocks.push({block,drySha256:blockDry.digest('hex'),stereoSha256:hash(Buffer.concat([typed(instance.left),typed(instance.right)]))});
   const active=instance.slots.find(s=>s.source);if(active){source??=active.source;sourceObjectStable&&=source===active.source;if(cursor!==null)sourceCursorContinuous&&=active.source.frame-cursor===budgetFrames042;cursor=active.source.frame;
    histories??=instance.pipeline.renderer.sourceList.map(s=>s.bands);rendererHistoryStable&&=instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);}
  }
  cpuSamples=await sampler.stop();await immediate();await immediate();collect(observer.takeRecords());observer.disconnect();delay.disable();
  for(const row of records){row.spans=accountSpans09(row.spans,gcEvents);const top=row.spans[0];row.cpuMs=top.cpuMs;row.wallMinusCpuMs=top.wallMinusCpuMs;row.gcTemporalUnionMs=top.gcTemporalUnionMs;row.residualWallMs=top.exclusiveWallMs;row.residualCpuMs=top.exclusiveCpuMs;}
  const diagnostics=instance.diagnostics(),samples=Number(delay.count??0);
  return {schema:1,kind:'RichAudioOriginalProcessingWorkload09',config,basis:'original analytic PCM through unchanged production StockVehicleSource/StockGameplay/CausalSimulation/StreamingRenderer; original finite geometry',
   clocks:{originUtcMs:performance.timeOrigin,wall:'node-performance-ms',cpu:cpuKind,cpuUnit:'microseconds',cpuNote:'Inclusive CPU counters are process-local observations; whole-process fallback includes other threads. Quantization and concurrent runtime work can yield negative exclusive residuals or wall minus CPU. These signed values are retained.'},
   summary:{all:summarizeDurations042(records.map(r=>r.renderMs)),cold:summarizeDurations042(records.slice(0,config.coldBlocks).map(r=>r.renderMs)),later:summarizeDurations042(records.slice(config.coldBlocks).map(r=>r.renderMs)),stages:stageTotals09(records)},
   records,gcEvents,droppedGcEvents,outsideRender,dispatchProbes,cpuSampling:{...cpuSamples,association:associateCpuSamples09(cpuSamples.profile,cpuSamples.anchors,records)},eventLoop:{utilization:performance.eventLoopUtilization(utilizationStart),resolutionMs:1,samples,delayMs:samples?{maximum:delay.max/1e6,p99:delay.percentile(99)/1e6,mean:delay.mean/1e6}:null},
   continuity:{drySha256:dry.digest('hex'),stereoSha256:stereo.digest('hex'),blocks:pcmBlocks,rendererFrames:instance.pipeline.renderer.frame,finalSourceFrame:cursor,sourceObjectStable,sourceCursorContinuous,rendererHistoryStable,
    sourceCreations:diagnostics.stageCounters.sourceCreations,historyAffectedFrames:diagnostics.pipeline.history.affectedFrames,limiterEvents:diagnostics.pipeline.renderer.limited,nonzeroBlocks:diagnostics.stageCounters.stereo.nonzeroBlocks},
   settings:originalSettings,workers:runtime?{...runtime.stats}:null,
   limits:{gc:'Only main-isolate PerformanceObserver intervals are observed. Overlaps are temporal, not proof of GC-caused time; worker GC is unobserved. GC overlap is not subtracted from CPU or wall costs.',
    scheduling:'Per-block setImmediate dispatch probes and the 1 ms event-loop histogram measure event-loop dispatch delay. They include queued work, GC, runtime and OS effects. OS scheduler/descheduling cause remains unavailable without an independent OS trace. Wall minus CPU is not scheduler time.',
    residual:'Root exclusive wall includes gameplay work, wrapper/counter cost and async continuation gaps; nested exclusive wall excludes the union of direct children. It is an accounting residual, not an attributed cause.',
    async:'Async span callReturnedMs separates synchronous invocation from observed promise completion; observed completion can be delayed by microtask dispatch. Async CPU includes any same-thread work inside the interval.',
    pacing:'Deterministic observation clock and fresh child burst with per-block yield; no endpoint pacing, realtime priority or physical output latency.',instrumentationOverheadIncluded:true,coreChanges:false,blockBudgetChanged:false,fixedPcmQueueAdded:false,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false}};
 }finally{recorder=null;observer.disconnect();delay.disable();sampler.close();instance?.close();if(runtime)await runtime.close();}
}

async function child09(config){
 const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
 return new Promise(resolve=>{
  let stdout='',stderr='',failure=null;const started=performance.now();
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',JSON.stringify(config)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{failure='bounded processing09 child deadline';child.kill();},60000);
  const append=(data,isError)=>{if(isError)stderr+=data;else stdout+=data;if(stdout.length+stderr.length>24*1024*1024){failure='bounded processing09 child output';child.kill();}};
  child.stdout.on('data',b=>append(b.toString(),false));child.stderr.on('data',b=>append(b.toString(),true));child.on('error',e=>{failure=e.message;});
  child.on('close',(exitCode,signal)=>{clearTimeout(timer);let result=null;try{result=JSON.parse(stdout);check(result.kind==='RichAudioOriginalProcessingWorkload09'&&JSON.stringify(result.config)===JSON.stringify(config),'exact child identity');}catch(e){failure??=e.message;}
   resolve({config,childWallMs:performance.now()-started,exitCode,signal,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),stderr,result,failure:failure??(exitCode===0?null:'nonzero child exit')});});
 });
}

export async function profileProcessing09({blocks=144,coldBlocks=24,repetitions=2,selectedProfiles=profiles}={}){
 options09({blocks,coldBlocks});check(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=4&&Array.isArray(selectedProfiles)&&selectedProfiles.length>=1&&selectedProfiles.length<=2&&new Set(selectedProfiles).size===selectedProfiles.length&&selectedProfiles.every(p=>profiles.includes(p)),'bounded processing09 repetitions and profiles');
 const trials=[],comparisons=[];
 for(const profile of selectedProfiles)for(let repetition=0;repetition<repetitions;repetition++){
  for(const variant of repetition%2?[...variants].reverse():variants){const trial=await child09(options09({blocks,coldBlocks,variant,profile}));trials.push({profile,repetition,...trial});}
  for(const scene of ['direct','walls']){const select=prefix=>trials.find(t=>t.profile===profile&&t.repetition===repetition&&t.config.variant===prefix+'-'+scene);
   const a=select('reference'),b=select('instrumented');comparisons.push({profile,repetition,scene,...(a.result&&b.result?compareProcessingPcm09(a.result,b.result):{unavailable:true})});}
 }
 const files=['tools/Profile-Processing09.mjs','tests/fixtures/Processing09.mjs','tests/fixtures/AcousticBudget042.mjs','tools/Profile-AcousticBudget042.mjs','src/acoustics/vehicle/gameplay.mjs','src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/pipeline.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/streaming/acoustic-backend.mjs','src/acoustics/engine/paths.mjs','src/acoustics/world/scene-preparation03.mjs'];
 const sourceBindings=Object.fromEntries(await Promise.all(files.map(async name=>[name,hash(await fs.readFile(new URL('../'+name,import.meta.url)))])));
 const pcmPassed=comparisons.every(c=>Object.entries(c).filter(([key])=>!['profile','repetition','scene'].includes(key)).every(([,value])=>value===true)&&c.unavailable!==true);
 return {schema:1,kind:'RichAudioProcessingReport09',createdUtc:new Date().toISOString(),completed:trials.every(t=>!t.failure),pcmPassed,passed:trials.every(t=>!t.failure)&&pcmPassed,
  runtime:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model??null,logicalCpus:os.cpus().length},sourceBindings,trials,comparisons,
  interpretation:{budgetMs:acousticBudgetMs042,overrunsRemainFindings:true,performanceGatePassed:false,historical:'Fresh local authored workloads cannot reconstruct or assign a cause to the hosted 42.9559 ms maximum or historical 30-80 ms maxima. No OS scheduler trace was captured.',
   nesting:'Compare exclusive sibling costs; inclusive control/update/renderer spans are nested and must not be summed. GC temporal overlap is an independent annotation, not an additive cost.',
   reference:'Fresh process reference/instrumented pairs validate every dry/stereo PCM block, cursor, frame count and renderer history. Timing differences are observational; instrumentation and child order affect them.',
   sourcePins:'Selected source hashes identify measured implementations, not a complete dependency closure.',endpointAccess:false,installedResourceAccess:false,privateInputAccess:false,physicalLatencyMeasured:false}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]==='--child'){check(process.argv.length===4,'exact processing09 child arguments');console.log(JSON.stringify(await runProcessingWorkload09(JSON.parse(process.argv[3]))));}
  else{
   check(process.argv.length===5&&process.argv[2]==='--run'&&process.argv[3]==='--out','use --run --out .local/fresh-processing09.json');
   const root=fileURLToPath(new URL('../',import.meta.url)),local=path.join(root,'.local'),file=path.resolve(root,process.argv[4]);
   check(path.dirname(file)===local&&/^[\w-]+\.json$/.test(path.basename(file)),'fresh report directly in this checkout .local required');
   await fs.mkdir(local,{recursive:true});const stat=await fs.lstat(local);check(stat.isDirectory()&&!stat.isSymbolicLink(),'owned report directory must not be a link');
   const handle=await fs.open(file,'wx');try{const report=await profileProcessing09(),bytes=JSON.stringify(report,null,2)+'\n';await handle.writeFile(bytes);
    console.log(JSON.stringify({kind:report.kind,passed:report.passed,sha256:hash(bytes),trials:report.trials.map(t=>({profile:t.profile,repetition:t.repetition,variant:t.config.variant,failure:t.failure,summary:t.result?.summary.all})),comparisons:report.comparisons}));if(!report.passed)process.exitCode=1;
   }catch(e){await handle.writeFile(JSON.stringify({schema:1,kind:'RichAudioProcessing09FailedAttempt',failedUtc:new Date().toISOString(),reason:e.message})+'\n');throw e;}finally{await handle.close();}
  }
 }catch(e){console.error(e.stack??e.message);process.exitCode=1;}
}
