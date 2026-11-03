// Device-free diagnostic, deliberately separate from production rendering.
// Every duration is an observation; this tool changes no processing gate.
import {performance,PerformanceObserver,monitorEventLoopDelay} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {createBudgetEngine042,budgetFrame042,budgetContexts042,budgetSession042,budgetWorld042,changedBudgetWorld042,budgetFrames042,budgetRate042} from '../tests/fixtures/AcousticBudget042.mjs';

export const acousticBudgetMs042=budgetFrames042/budgetRate042*1000;
const variants=['reference-direct','instrumented-direct','instrumented-scene-churn'];
const profiles=['fixed-cpu-balanced','constructor-defaults'];
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const overlap=(a,b)=>Math.max(0,Math.min(a.endMs,b.endMs)-Math.max(a.startMs,b.startMs));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const typedBytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const cpu=()=>typeof process.threadCpuUsage==='function'?process.threadCpuUsage():process.cpuUsage();
function options042({blocks=144,coldBlocks=24,profile='fixed-cpu-balanced',variant='instrumented-direct'}={}){
 check(Number.isInteger(blocks)&&blocks>=36&&blocks<=512&&Number.isInteger(coldBlocks)&&coldBlocks>=1&&coldBlocks<blocks&&profiles.includes(profile)&&variants.includes(variant),'bounded explicit original profiling workload required');
 return {blocks,coldBlocks,profile,variant};
}
export function summarizeDurations042(values,budgetMs=acousticBudgetMs042){
 check(Array.isArray(values)&&values.every(n=>Number.isFinite(n)&&n>=0)&&Number.isFinite(budgetMs)&&budgetMs>0,'finite nonnegative processing durations required');
 const sorted=[...values].sort((a,b)=>a-b),pick=q=>sorted.length?sorted[Math.ceil(sorted.length*q)-1]:null;
 return {calls:sorted.length,p50Ms:pick(.5),p99Ms:pick(.99),maximumMs:sorted.at(-1)??null,overBudget:sorted.filter(n=>n>budgetMs).length,blockBudgetMs:budgetMs};
}
export function associateGc042(records,gcEvents){
 check(Array.isArray(records)&&Array.isArray(gcEvents)&&[...records,...gcEvents].every(r=>r&&Number.isFinite(r.startMs)&&Number.isFinite(r.endMs)&&r.endMs>=r.startMs),'finite process-local observation intervals required');
 return records.map(record=>({...record,gcTemporalOverlaps:gcEvents.flatMap((event,index)=>{const durationMs=overlap(record,event);return durationMs>0?[{event:index,overlapMs:durationMs}]:[]})}));
}
export function compareContinuity042(reference,trial,{stereo=true}={}){
 check(typeof stereo==='boolean'&&reference?.continuity&&trial?.continuity,'two completed authored workloads required');
 const a=reference.continuity,b=trial.continuity;
 return {dryPcmIdentical:a.drySha256===b.drySha256,stereoCompared:stereo,stereoPcmIdentical:stereo?a.stereoSha256===b.stereoSha256:null,
  framesIdentical:a.rendererFrames===b.rendererFrames,sourceCursorIdentical:a.finalSourceFrame===b.finalSourceFrame,
  sourceContinuity:a.sourceObjectStable&&b.sourceObjectStable&&a.sourceCursorContinuous&&b.sourceCursorContinuous&&a.rendererHistoryStable&&b.rendererHistoryStable&&a.sourceCreations===1&&b.sourceCreations===1,
  nonzeroAuthoredOutput:a.nonzeroBlocks>0&&b.nonzeroBlocks>0};
}

// This export is also a small deterministic regression workload. It does not
// create a child process or write a report; the CLI isolates full measurements.
export async function runBudgetWorkload042(input={}){
 const options=options042(input),instrumented=options.variant!=='reference-direct',churn=options.variant==='instrumented-scene-churn';
 const records=[],outsideRender=[],gcEvents=[],gcObserver=new PerformanceObserver(list=>collectGc(list.getEntries()));let gcEventsDropped=0;
 function collectGc(entries){for(const e of entries)if(gcEvents.length<4096)gcEvents.push({startMs:e.startTime,endMs:e.startTime+e.duration,durationMs:e.duration,kind:e.detail?.kind??null,flags:e.detail?.flags??null});else gcEventsDropped++;}
 gcObserver.observe({entryTypes:['gc']});
 const delay=monitorEventLoopDelay({resolution:10});delay.enable();
 const dry=createHash('sha256'),stereo=createHash('sha256');let row=null,instance,runtime;
 const measured=(kind,fn)=>{const startMs=performance.now();try{return fn();}finally{const endMs=performance.now();if(row)row.stages[kind]+=endMs-startMs;}};
 const outside=async(kind,fn,block=null)=>{const startMs=performance.now();try{return await fn();}finally{outsideRender.push({kind,block,startMs,endMs:performance.now()});}};
 const synchronousOutside=(kind,fn,block=null)=>{const startMs=performance.now();try{return fn();}finally{outsideRender.push({kind,block,startMs,endMs:performance.now()});}};
 const onSource=source=>{if(instrumented){const original=source.renderInto;source.renderInto=function(...args){return measured('sourceSynthesisMs',()=>original.apply(this,args));};}};
 let source=null,sourceFrame=null,history=null,sourceObjectStable=true,sourceCursorContinuous=true,rendererHistoryStable=true,sourceCrossed=false,listenerCrossed=false;
 let next=0,sequence=0,cancelPending=null;
 const eventBlocks={wall:Math.floor(options.blocks*2/9),cancel:Math.floor(options.blocks/3),missing:Math.floor(options.blocks*4/9),invalidate:Math.floor(options.blocks*5/9),expire:Math.floor(options.blocks*2/3)};
 const attach=async(contextOptions,block,ms)=>{
  const contexts=synchronousOutside('authoredSceneConstruction',()=>budgetContexts042(contextOptions),block);
  const result=await outside('joinedSceneWorkerPreparation',()=>runtime.prepare({contexts,listenerAnchor:[-3+ms/1000*4,0,1],geometryTimeMs:ms}),block);
  check(result.state==='prepared'&&result.workerJoined,'joined original scene preparation required');
  synchronousOutside('sceneAttachment',()=>instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:result.prepared.worldDigest,generation:result.prepared.generation}),block);
 };
 let diagnostics,continuity,workerStats;
 try{
  const engine=synchronousOutside('engineConstruction',()=>createBudgetEngine042({profile:options.profile,onSource,...(instrumented?{constructSource:bank=>measured('sourceConstructionMs',()=>new StockVehicleSource(bank))}:{})}));instance=engine.instance;
  if(instrumented){const originalPrepare=instance.pipeline.prepare,originalProcess=instance.pipeline.process;
   instance.pipeline.prepare=async function(...args){const startMs=performance.now();try{return await originalPrepare.apply(this,args);}finally{if(row)row.stages.controlPreparationMs+=performance.now()-startMs;}};
   instance.pipeline.process=function(...args){return measured('pcmRendererMs',()=>originalProcess.apply(this,args));};
  }
  if(churn){runtime=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});await attach({},-1,0);}
  await outside('setImmediateSchedulingProbeBefore',immediate);
  const utilizationStart=performance.eventLoopUtilization();
  for(let block=0;block<options.blocks;block++){
   const time=block*budgetFrames042/budgetRate042,ms=time*1000;engine.setWall(ms);
   if(churn){
    if(block===eventBlocks.wall)await attach({wall:true},block,ms);
    if(block===eventBlocks.cancel){const controller=new AbortController();const startMs=performance.now();cancelPending=runtime.prepare({contexts:budgetContexts042(),listenerAnchor:[-1,0,1],geometryTimeMs:ms,signal:controller.signal}).then(result=>{outsideRender.push({kind:'cancelledSceneWorkerJoined',block,startMs,endMs:performance.now()});check(result.state==='cancelled'&&result.workerJoined,'cancelled worker joined');});controller.abort();}
    if(block===eventBlocks.cancel+1)await cancelPending;
    if(block===eventBlocks.missing)await attach({missing:true},block,ms);
    if(block===eventBlocks.invalidate){const binding=instance.staticSceneBinding;await outside('sceneInvalidation',()=>runtime.invalidate(changedBudgetWorld042),block);synchronousOutside('sceneWithdrawal',()=>instance.clearPreparedResourceScene03(binding),block);}
    if(block===eventBlocks.expire)await attach({worldDigest:changedBudgetWorld042,until:ms+40},block,ms);
   }
   if(time+1e-10>=next){const observation=budgetFrame042(sequence++,next);synchronousOutside('acceptAuthoredObservation',()=>instance.accept(observation,Math.max(0,(time-next)*1000),200),block);next+=.05;}
   row={block,phase:block<options.coldBlocks?'cold-prefix':'later-blocks',stages:instrumented?{sourceConstructionMs:0,sourceSynthesisMs:0,controlPreparationMs:0,pcmRendererMs:0}:null};
   const cpuStart=cpu();row.startMs=performance.now();await instance.render();row.endMs=performance.now();const cpuEnd=cpu();
   row.renderMs=row.endMs-row.startMs;row.cpuMs=(cpuEnd.user-cpuStart.user+cpuEnd.system-cpuStart.system)/1000;row.overBudget=row.renderMs>acousticBudgetMs042;
   if(instrumented)row.stages.otherGameplayAndInstrumentationMs=Math.max(0,row.renderMs-Object.values(row.stages).reduce((a,b)=>a+b,0));
   row.selectedPaths=instance.pipeline.lastControl?.paths.length??0;row.surfaces=instance.pipeline.simulation.scene.tile?.surfaces.length??0;row.geometryUpdates=instance.stats.geometryUpdates;row.sourceCreations=instance.stageCounters.sourceCreations;records.push(row);row=null;
   // Equal digest work occurs outside every timed render in all conditions.
   for(const id of instance.ids)dry.update(typedBytes(instance.inputs[id]));stereo.update(typedBytes(instance.left));stereo.update(typedBytes(instance.right));
   const active=instance.slots.find(s=>s.source);if(active){source??=active.source;sourceObjectStable&&=source===active.source;if(sourceFrame!==null)sourceCursorContinuous&&=active.source.frame-sourceFrame===budgetFrames042;sourceFrame=active.source.frame;
    history??=instance.pipeline.renderer.sourceList.map(s=>s.bands);rendererHistoryStable&&=instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===history[i]);sourceCrossed||=active.vehicle.position[0]>0;listenerCrossed||=(instance.sample.state?.position[0]??-1)>0;}
  }
  await outside('setImmediateSchedulingProbeAfter',immediate);await immediate();
  const eventLoopUtilization=performance.eventLoopUtilization(utilizationStart);
  diagnostics=instance.diagnostics();workerStats=runtime?{...runtime.stats}:null;
  continuity={drySha256:dry.digest('hex'),stereoSha256:stereo.digest('hex'),rendererFrames:instance.pipeline.renderer.frame,finalSourceFrame:sourceFrame,sourceObjectStable,sourceCursorContinuous,rendererHistoryStable,sourceCreations:diagnostics.stageCounters.sourceCreations,nonzeroBlocks:diagnostics.stageCounters.stereo.nonzeroBlocks,historyAffectedFrames:diagnostics.pipeline.history.affectedFrames,limiterEvents:diagnostics.pipeline.renderer.limited,sourceCrossed,listenerCrossed,pcmQueueFramesAdded:runtime?.stats.pcmQueueFramesAdded??0,finalGeometry:diagnostics.geometry};
  collectGc(gcObserver.takeRecords());gcObserver.disconnect();
  const observed=associateGc042(records,gcEvents);
  const stages=instrumented?Object.fromEntries(Object.keys(records[0].stages).map(key=>[key,summarizeDurations042(records.map(r=>r.stages[key]))])):null;
  const delaySamples=Number(delay.count??0);
  return {schema:1,kind:'RichAudioOriginalAcousticBudget042',options,basis:'original analytic PCM; authored finite geometry; no real bank or installed resource',
   clocks:{originUtcMs:performance.timeOrigin,intervalClock:'node-performance-ms',cpuClock:typeof process.threadCpuUsage==='function'?'calling-thread-cpu-usage':'process-cpu-usage',cpuLimit:'wall minus CPU is not a measured scheduling cause',observationClock:'deterministic block time; no endpoint pacing or realtime scheduling; gameplay internal quality/deadline statistics use this synthetic clock, not these independent measured durations'},
   summary:{all:summarizeDurations042(records.map(r=>r.renderMs)),cold:summarizeDurations042(records.filter(r=>r.phase==='cold-prefix').map(r=>r.renderMs)),later:summarizeDurations042(records.filter(r=>r.phase==='later-blocks').map(r=>r.renderMs)),stages},
   records:observed,outsideRender,gcEvents,gcEventsDropped,gcLimit:'observer events cover this Node isolate only; temporal overlap is not causal attribution; worker GC and OS descheduling are unobserved',
   eventLoop:{utilization:eventLoopUtilization,delaySamples,delayMs:delaySamples?{mean:delay.mean/1e6,maximum:delay.max/1e6,p99:delay.percentile(99)/1e6}:null,limit:'10 ms timer sampling and before/after probes do not measure per-render scheduling delay; burst runs can supply zero samples'},
   continuity,workers:workerStats,settings:{...instance.settings},backend:diagnostics.pipeline.backend.activeAcceleration,
   endpointAccess:false,installedResourcesRead:false,privateBanksRead:false,coreChanges:false};
 }finally{row=null;instance?.close();if(runtime)await runtime.close();collectGc(gcObserver.takeRecords());gcObserver.disconnect();delay.disable();}
}

async function child042(options){
 const args=[fileURLToPath(import.meta.url),'--child',options.variant,String(options.blocks),String(options.coldBlocks),options.profile];
 const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='',failure=null;
  const timer=setTimeout(()=>{failure??=Error('bounded original profiler child deadline');child.kill();},60000);
  const append=(text,isError)=>{if(isError)stderr+=text;else stdout+=text;if(stdout.length+stderr.length>8*1024*1024){failure??=Error('bounded original profiler child output');child.kill();}};
  child.stdout.on('data',data=>append(data.toString(),false));child.stderr.on('data',data=>append(data.toString(),true));child.on('error',error=>{failure??=error;});
  child.on('close',code=>{clearTimeout(timer);if(failure)return reject(failure);if(code!==0)return reject(Error('original profiler child failed: '+stderr.slice(0,2000)));try{const result=JSON.parse(stdout);check(result.kind==='RichAudioOriginalAcousticBudget042'&&result.options.variant===options.variant,'exact diagnostic child result');resolve(result);}catch(error){reject(error);}});
 });
}
export async function profileAcousticBudget042({blocks=144,coldBlocks=24,repetitions=2,profile='fixed-cpu-balanced'}={}){
 options042({blocks,coldBlocks,profile});check(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=4,'bounded profiler repetitions');
 const trials=[];for(let repetition=0;repetition<repetitions;repetition++)for(const variant of repetition%2?[...variants].reverse():variants){const started=performance.now(),result=await child042({blocks,coldBlocks,profile,variant});trials.push({repetition,childWallMs:performance.now()-started,...result});}
 const comparisons=[];for(let repetition=0;repetition<repetitions;repetition++){const select=variant=>trials.find(t=>t.repetition===repetition&&t.options.variant===variant);comparisons.push({repetition,instrumentation:compareContinuity042(select('reference-direct'),select('instrumented-direct')),geometry:compareContinuity042(select('reference-direct'),select('instrumented-scene-churn'),{stereo:false})});}
 const sourceFiles=['tools/Profile-AcousticBudget042.mjs','tests/fixtures/AcousticBudget042.mjs','src/acoustics/vehicle/gameplay.mjs','src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/pipeline.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/world/scene-preparation03.mjs'];
 const sourceBindings=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,sha(await fs.readFile(new URL('../'+name,import.meta.url)))])));
 return {schema:1,kind:'RichAudioAcousticBudgetReport042',createdUtc:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model??null,logicalCpus:os.cpus().length},sourceBindings,trials,comparisons,
  interpretation:{cold:'first configured number of render calls in each fresh child after module imports; not proof of JIT completion',later:'remaining calls in that same child, not guaranteed steady-state',separation:'worker acquisition and scene attachment are outside render; sourceConstruction is the unchanged production source constructor; controlPreparation includes solver and renderer accept; pcmRenderer is synchronous production process; other includes gameplay and instrumentation',gc:'only temporal overlap can be concluded',historical:'fresh original workloads cannot reconstruct the causes of prior 61/84 ms or hosted overruns',timingGateUnchanged:true,physicalLatencyMeasured:false,endpointAccess:false,installedResourceEvidence:false}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]==='--child'){
   check(process.argv.length===7,'exact child arguments');const result=await runBudgetWorkload042({variant:process.argv[3],blocks:Number(process.argv[4]),coldBlocks:Number(process.argv[5]),profile:process.argv[6]});process.stdout.write(JSON.stringify(result));
  }else{
   const args=process.argv.slice(2);check(args[0]==='--run'&&args.length%2===1,'use --run --out .local/report.json [--blocks 144 --cold-blocks 24 --repetitions 2 --profile fixed-cpu-balanced]');const values=new Map();
   for(let i=1;i<args.length;i+=2){check(['--out','--blocks','--cold-blocks','--repetitions','--profile'].includes(args[i])&&!values.has(args[i]),'exact unique profiler option');values.set(args[i],args[i+1]);}
   const repository=fileURLToPath(new URL('../',import.meta.url)),local=path.join(repository,'.local'),output=path.resolve(repository,values.get('--out')??'');
   check(output.startsWith(local+path.sep)&&path.dirname(output)===local&&/^[\w-]+\.json$/.test(path.basename(output)),'fresh report directly inside this repository .local required');
   await fs.mkdir(local,{recursive:true});const localStat=await fs.lstat(local);check(localStat.isDirectory()&&!localStat.isSymbolicLink(),'owned local directory must not be a link');const handle=await fs.open(output,'wx');
   try{const report=await profileAcousticBudget042({...(values.has('--blocks')?{blocks:Number(values.get('--blocks'))}:{}),...(values.has('--cold-blocks')?{coldBlocks:Number(values.get('--cold-blocks'))}:{}),...(values.has('--repetitions')?{repetitions:Number(values.get('--repetitions'))}:{}),...(values.has('--profile')?{profile:values.get('--profile')}: {})});const bytes=JSON.stringify(report,null,2)+'\n';await handle.writeFile(bytes);console.log(JSON.stringify({kind:report.kind,sha256:sha(bytes),trials:report.trials.map(t=>({repetition:t.repetition,variant:t.options.variant,...t.summary.all})),comparisons:report.comparisons}));}finally{await handle.close();}
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
