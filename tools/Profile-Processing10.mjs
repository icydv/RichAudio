// Independent-process original-only before/after evidence. No asset/endpoint API.
import {performance,PerformanceObserver,monitorEventLoopDelay} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Session} from 'node:inspector';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=path.join(root,'.local','world10-baseline-8a995c8');
const acousticBudgetMs042=512/48000*1000;
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const typed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const cpuKind=typeof process.threadCpuUsage==='function'?'calling-thread':'whole-process';
const cpuUs=()=>{const c=cpuKind==='calling-thread'?process.threadCpuUsage():process.cpuUsage();return c.user+c.system;};
const profiles=['constructor-defaults','fixed-cpu-balanced'];
const modes=['baseline-cold','current-cold','current-prepared','current-prepared-jit'];
function options10({mode='baseline-cold',profile='fixed-cpu-balanced',scene='walls',blocks=144,coldBlocks=24,lifecycle=false,snapshot=null,texture=false,instrumented=true}={}){
 check(modes.includes(mode)&&profiles.includes(profile)&&['direct','walls'].includes(scene)&&Number.isInteger(blocks)&&blocks>=36&&blocks<=512&&Number.isInteger(coldBlocks)&&coldBlocks>=1&&coldBlocks<blocks&&typeof lifecycle==='boolean'&&typeof texture==='boolean'&&typeof instrumented==='boolean'&&(snapshot===null||/^world10-current-[a-z0-9-]+$/.test(snapshot)),'bounded original processing10 configuration');
 return {mode,profile,scene,blocks,coldBlocks,lifecycle,snapshot,texture,instrumented};
}
function recorder10(){
 let active=-1;const spans=[];
 const start=name=>{const s={id:spans.length,parent:active,name,cpuStartUs:cpuUs(),startMs:performance.now()};spans.push(s);active=s.id;return s;};
 const end=s=>{s.endMs=performance.now();s.cpuEndUs=cpuUs();active=s.parent;};
 return {spans,sync(name,fn){const s=start(name);try{return fn();}finally{end(s);}},async async(name,fn){const s=start(name);try{const value=fn();s.callReturnedMs=performance.now();return await value;}finally{end(s);}}};
}
function cpuSampler10(){
 const session=new Session();session.connect();const anchors={};
 const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 return {async start(){await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});anchors.startBeforeMs=performance.now();await post('Profiler.start');anchors.startAfterMs=performance.now();},
 async stop(){anchors.stopBeforeMs=performance.now();const {profile}=await post('Profiler.stop');anchors.stopAfterMs=performance.now();return {profile,anchors,requestedSamplingIntervalUs:500};},close(){session.disconnect();}};
}
function phaseTotals10(records){
 const names=[...new Set(records.flatMap(r=>r.spans.map(s=>s.name)))];
 return Object.fromEntries(names.map(name=>[name,Object.fromEntries(['wallMs','exclusiveWallMs','cpuMs','exclusiveCpuMs','wallMinusCpuMs'].map(key=>{
  const values=records.map(r=>r.spans.filter(s=>s.name===name).reduce((n,s)=>n+s[key],0)).sort((a,b)=>a-b),at=q=>values[Math.ceil(values.length*q)-1];
  return [key,{calls:values.length,p50Ms:at(.5),p99Ms:at(.99),maximumMs:values.at(-1),minimumMs:values[0]}];
 }))]));
}

export async function runProcessingWorkload10(input={}){
 const config=options10(input),inputRoot=config.snapshot===null?root:path.join(root,'.local',config.snapshot),runtimeRoot=config.mode==='baseline-cold'?baseline:inputRoot;
 let runtimeSnapshot=null;
 if(config.snapshot!==null){
  const bytes=await fs.readFile(path.join(inputRoot,'snapshot10.json')),manifest=JSON.parse(bytes);
  check(manifest.kind==='RichAudioAuthoredProcessingSnapshot10'&&Array.isArray(manifest.files)&&manifest.files.length>0,'owned authored snapshot manifest required');
  for(const file of manifest.files){check(typeof file.path==='string'&&!file.path.includes('..')&&!path.isAbsolute(file.path)&&file.path.endsWith('.mjs'),'bounded authored snapshot member');check(hash(await fs.readFile(path.join(inputRoot,file.path)))===file.sha256,'snapshot source hash differs');}
  check(manifest.files.find(f=>f.path==='tools/Profile-Processing10.mjs')?.sha256===hash(await fs.readFile(fileURLToPath(import.meta.url))),'executed harness must match frozen input closure');
  runtimeSnapshot={name:config.snapshot,manifestSha256:hash(bytes),files:manifest.files.length};
 }
 const inputFiles=['tests/fixtures/Processing10.mjs','tools/Profile-Processing09.mjs','tools/Profile-AcousticBudget042.mjs'],inputBindings={};
 for(const file of inputFiles)inputBindings[file]=hash(await fs.readFile(path.join(inputRoot,file)));
 inputBindings['tools/Profile-Processing10.mjs']=hash(await fs.readFile(fileURLToPath(import.meta.url)));
 const loadInput=name=>import(pathToFileURL(path.join(inputRoot,name)).href);
 const [{processingBank10,processingLifecycleFrame10},{accountSpans09,associateCpuSamples09},{summarizeDurations042}]=await Promise.all(inputFiles.map(loadInput));
 const sourceBindings={},sourceFiles=['src/acoustics/vehicle/gameplay.mjs','src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/stock-source-preparation10.mjs','src/acoustics/vehicle/pipeline.mjs','src/acoustics/streaming/causal.mjs'];
 for(const file of sourceFiles){try{sourceBindings[file]=hash(await fs.readFile(path.join(runtimeRoot,file)));}catch(error){if(error.code!=='ENOENT')throw error;sourceBindings[file]=null;}}
 const load=name=>import(pathToFileURL(path.join(runtimeRoot,name)).href);
 const [{StockGameplay},sourceModule,{ScenePreparation03},fixture,{processingContexts09}]=await Promise.all([
  load('src/acoustics/vehicle/gameplay.mjs'),load('src/acoustics/vehicle/stock-source.mjs'),load('src/acoustics/world/scene-preparation03.mjs'),load('tests/fixtures/AcousticBudget042.mjs'),load('tests/fixtures/Processing09.mjs')]);
 const {StockVehicleSource}=sourceModule,{budgetFrame042,budgetSession042,budgetWorld042,budgetFrames042,budgetRate042}=fixture;
 const bank=processingBank10({texture:config.texture}),records=[],gcEvents=[],outsideRender=[],dispatchProbes=[],pcmBlocks=[],sourceRows=[];
 const dry=createHash('sha256'),stereo=createHash('sha256');let droppedGcEvents=0,recorder=null,instance,runtime,plan=null,sequence=0,next=0,wall=0;
 let histories=null,rendererHistoryStable=true,sourceSerial=0;const sourceNumbers=new WeakMap(),lastFrames=new WeakMap();let sourceCursorContinuous=true;
 const collect=entries=>{for(const e of entries){if(gcEvents.length===8192){droppedGcEvents++;continue;}gcEvents.push({startMs:e.startTime,endMs:e.startTime+e.duration,durationMs:e.duration,kind:e.detail?.kind??null,flags:e.detail?.flags??null});}};
 const observer=new PerformanceObserver(list=>collect(list.getEntries()));observer.observe({entryTypes:['gc']});
 const delay=monitorEventLoopDelay({resolution:1});delay.enable();const sampler=cpuSampler10();let cpuSamples;
 const outside=async(name,fn)=>{const startMs=performance.now(),cpuStartUs=cpuUs();try{return await fn();}finally{outsideRender.push({name,startMs,endMs:performance.now(),cpuStartUs,cpuEndUs:cpuUs()});}};
 const sync=(name,fn)=>recorder&&config.instrumented?recorder.sync(name,fn):fn();
 const wrap=(target,method,name,async=false)=>{const original=target[method];check(typeof original==='function','existing production phase required');if(!config.instrumented)return;target[method]=async?function(...args){return recorder.async(name,()=>original.apply(this,args));}:function(...args){return recorder.sync(name,()=>original.apply(this,args));};};
 try{
  if(config.mode.includes('prepared'))plan=await outside('immutableSourcePreparation10',()=>sourceModule.prepareStockSource10(bank));
  if(config.mode.endsWith('-jit'))await outside('authoredJitWarm10',()=>sourceModule.warmStockSourceJit10(plan));
  const registry={resolve:()=>({status:'available',bank}),createSource:()=>{
   const source=sync('sourceConstruction',()=>new StockVehicleSource(bank,plan?{preparation10:plan}:{}));
   check(source.frame===0&&source.stats.frames===0,'genuine new source begins at sample zero');sourceNumbers.set(source,++sourceSerial);wrap(source,'renderInto','sourceSynthesis');return source;
  }};
  instance=await outside('engineConstruction',()=>new StockGameplay({registry,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01'}));
  if(config.profile==='fixed-cpu-balanced')instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
  const originalSettings={...instance.settings};
  for(const [target,method,name,async]of [
   [instance.playout,'sample','listenerPlayout'],[instance,'vehiclesAt','sourcePose'],[instance,'filter','controlFilter'],[instance.pipeline,'prepare','controlPreparation',true],
   [instance.pipeline.simulation,'observe','acousticObserve'],[instance.pipeline.simulation,'updateAccelerated','acousticUpdate',true],[instance.pipeline.simulation,'prepareUpdate','acousticPathPreparation'],
   [instance.pipeline.backend,'query','acousticVisibility',true],[instance.pipeline.backend,'cpu','acousticVisibilityCpu'],[instance.pipeline.simulation,'completeUpdate','acousticPathCompletion'],
   [instance.pipeline.renderer,'accept','rendererAccept'],[instance.pipeline,'process','pcmPipeline'],[instance.pipeline.renderer,'process','pcmRenderer']])wrap(target,method,name,async);
  if(config.scene==='walls'){
   runtime=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});
   const result=await outside('joinedOriginalSceneWorker',()=>runtime.prepare({contexts:processingContexts09(),listenerAnchor:[-3,0,1],geometryTimeMs:0}));
   check(result.state==='prepared'&&result.workerJoined,'joined original geometry preparation required');
   await outside('originalSceneAttachment',()=>instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:result.prepared.worldDigest,generation:result.prepared.generation}));
  }
  const beforeRender={sourceConstructions:sourceSerial,sourceCreations:instance.stageCounters.sourceCreations,rendererFrame:instance.pipeline.renderer.frame};
  await sampler.start();const utilizationStart=performance.eventLoopUtilization();
  for(let block=0;block<config.blocks;block++){
   const time=block*budgetFrames042/budgetRate042;wall=time*1000;
   if(time+1e-10>=next){const frame=budgetFrame042(sequence++,next);instance.accept(config.lifecycle?processingLifecycleFrame10(frame,next):frame,Math.max(0,(time-next)*1000),200);next+=.05;}
   const requestedMs=performance.now(),cpuStartUs=cpuUs();await immediate();const callbackMs=performance.now(),cpuEndUs=cpuUs();dispatchProbes.push({block,requestedMs,callbackMs,delayMs:callbackMs-requestedMs,cpuStartUs,cpuEndUs,cpuMs:(cpuEndUs-cpuStartUs)/1000});
   const heapBefore=process.memoryUsage().heapUsed;recorder=recorder10();await recorder.async('render',()=>instance.render());const spans=recorder.spans;recorder=null;
   const first=spans[0],renderMs=first.endMs-first.startMs;
   records.push({block,phase:block<config.coldBlocks?'cold-prefix':'later-blocks',startMs:first.startMs,endMs:first.endMs,renderMs,overBudget:renderMs>acousticBudgetMs042,
    heapUsedBefore:heapBefore,heapUsedAfter:process.memoryUsage().heapUsed,spans,selectedPaths:instance.pipeline.lastControl.paths.length,reflectedPaths:instance.pipeline.lastControl.paths.filter(p=>p.order>0).length,
    surfaces:instance.pipeline.simulation.scene.tile?.surfaces.length??0,sourceCreations:instance.stageCounters.sourceCreations});
   const blockDry=createHash('sha256');for(const id of instance.ids){dry.update(typed(instance.inputs[id]));blockDry.update(typed(instance.inputs[id]));}
   stereo.update(typed(instance.left));stereo.update(typed(instance.right));pcmBlocks.push({block,drySha256:blockDry.digest('hex'),stereoSha256:hash(Buffer.concat([typed(instance.left),typed(instance.right)]))});
   const sources=instance.slots.filter(s=>s.source).map(s=>{const prior=lastFrames.get(s.source);if(prior!==undefined)sourceCursorContinuous&&=s.source.frame-prior===budgetFrames042;lastFrames.set(s.source,s.source.frame);return {slot:s.index,identity:s.identity,sourceSerial:sourceNumbers.get(s.source),frame:s.source.frame,statsFrames:s.source.stats.frames};});
   sourceRows.push({block,sources});histories??=instance.pipeline.renderer.sourceList.map(s=>s.bands);rendererHistoryStable&&=instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);
  }
  cpuSamples=await sampler.stop();await immediate();await immediate();collect(observer.takeRecords());observer.disconnect();delay.disable();
  for(const row of records){row.spans=accountSpans09(row.spans,gcEvents);const top=row.spans[0];row.cpuMs=top.cpuMs;row.wallMinusCpuMs=top.wallMinusCpuMs;row.gcTemporalUnionMs=top.gcTemporalUnionMs;row.residualWallMs=top.exclusiveWallMs;row.residualCpuMs=top.exclusiveCpuMs;}
  const diagnostics=instance.diagnostics(),samples=Number(delay.count??0);
  for(const file of sourceFiles){let after=null;try{after=hash(await fs.readFile(path.join(runtimeRoot,file)));}catch(error){if(error.code!=='ENOENT')throw error;}check(after===sourceBindings[file],'measured source file changed during workload');}
  for(const file of inputFiles)check(hash(await fs.readFile(path.join(inputRoot,file)))===inputBindings[file],'measured input helper changed during workload');
  check(hash(await fs.readFile(fileURLToPath(import.meta.url)))===inputBindings['tools/Profile-Processing10.mjs'],'executed harness changed during workload');
  return {schema:1,kind:'RichAudioOriginalProcessingWorkload10',config,basis:'original analytic PCM and authored finite wall; production source, gameplay, solver and renderer; independent process',sourceBindings,inputBindings,runtimeSnapshot,
   clocks:{wall:'node-performance-ms',cpu:cpuKind,cpuUnit:'microseconds',cpuNote:'Windows CPU readings may be coarse. Signed wall-minus-CPU and exclusive CPU residuals are retained, and are not scheduler time.'},
   summary:{all:summarizeDurations042(records.map(r=>r.renderMs)),cold:summarizeDurations042(records.slice(0,config.coldBlocks).map(r=>r.renderMs)),later:summarizeDurations042(records.slice(config.coldBlocks).map(r=>r.renderMs)),stages:phaseTotals10(records)},
   records,gcEvents,droppedGcEvents,outsideRender,dispatchProbes,cpuSampling:{...cpuSamples,association:associateCpuSamples09(cpuSamples.profile,cpuSamples.anchors,records)},
   eventLoop:{utilization:performance.eventLoopUtilization(utilizationStart),resolutionMs:1,samples,delayMs:samples?{maximum:delay.max/1e6,p99:delay.percentile(99)/1e6,mean:delay.mean/1e6}:null},
   continuity:{drySha256:dry.digest('hex'),stereoSha256:stereo.digest('hex'),blocks:pcmBlocks,rendererFrames:instance.pipeline.renderer.frame,sourceRows,sourceConstructions:sourceSerial,
    sourceCursorContinuous,rendererHistoryStable,sourceCreations:diagnostics.stageCounters.sourceCreations,historyAffectedFrames:diagnostics.pipeline.history.affectedFrames,limiterEvents:diagnostics.pipeline.renderer.limited,nonzeroBlocks:diagnostics.stageCounters.stereo.nonzeroBlocks},
   beforeRender,settings:originalSettings,workers:runtime?{...runtime.stats}:null,diagnostics,
   limits:{gc:'Main-isolate temporal GC overlap only; no causal attribution, subtraction, or worker GC measurement.',scheduling:'Dispatch probes include queued work, GC, runtime and OS effects. No OS scheduler trace; wall minus CPU is not descheduling time.',
    pacing:'Burst diagnostics with deterministic observation time and per-block yield; no endpoint pacing or physical latency measurement.',instrumentationOverheadIncluded:true,sourcePreparationCpuIsolation:false,blockBudgetChanged:false,pcmQueueFramesAdded:0,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false}};
 }finally{recorder=null;observer.disconnect();delay.disable();sampler.close();await instance?.close();if(runtime)await runtime.close();}
}

export function compareProcessingPcm10(reference,trial){
 const a=reference.continuity,b=trial.continuity;
 return {dryBitIdentical:a.drySha256===b.drySha256,stereoBitIdentical:a.stereoSha256===b.stereoSha256,everyBlockBitIdentical:JSON.stringify(a.blocks)===JSON.stringify(b.blocks),
  framesIdentical:a.rendererFrames===b.rendererFrames,sourceLifecycleIdentical:JSON.stringify(a.sourceRows)===JSON.stringify(b.sourceRows),sourceCreationsIdentical:a.sourceCreations===b.sourceCreations,
  historyPreserved:[a,b].every(c=>c.sourceCursorContinuous&&c.rendererHistoryStable&&c.historyAffectedFrames===0&&c.limiterEvents===0&&c.nonzeroBlocks>0),
  noSourceBeforeRender:[reference,trial].every(r=>r.beforeRender.sourceConstructions===0&&r.beforeRender.sourceCreations===0&&r.beforeRender.rendererFrame===0)};
}

async function worker10(){
 const started=performance.now();let stopping=false,iterations=0,value=1;
 process.on('message',message=>{if(message==='stop')stopping=true;});
 process.send?.({kind:'ready',pid:process.pid});
 while(!stopping&&performance.now()-started<15000){const until=performance.now()+8;while(performance.now()<until){for(let i=0;i<4096;i++)value=(Math.imul(value,1664525)+1013904223)|0;iterations++;}await immediate();}
 process.send?.({kind:'stopped',pid:process.pid,elapsedMs:performance.now()-started,iterations,value,cpu:process.cpuUsage(),reason:stopping?'requested':'strict-lifetime'});process.disconnect?.();
}
async function contention10(count,{failAfterContentionReady10=null,stopSendFailure10=null}={}){
 check(failAfterContentionReady10===null||Number.isInteger(failAfterContentionReady10)&&failAfterContentionReady10>=1&&failAfterContentionReady10<=count,'bounded owned contention failure control');
 check(stopSendFailure10===null||['sync','async'].includes(stopSendFailure10)&&count>=1,'bounded owned stop-send failure control');
 const workers=[];
 try{
  for(let i=0;i<count;i++){
   const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
   const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--contention-worker'],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
   const record={pid:child.pid,messages:[],exitCode:null,signal:null,joined:false,stderr:'',stdout:'',earlyExit:false};
   let finished;const done=new Promise(resolve=>finished=resolve),worker={child,record,done,stopSendFailure10:i===0?stopSendFailure10:null};workers.push(worker);
   const lifetime=setTimeout(()=>{record.parentLifetimeKill=true;try{child.kill();}catch(error){record.parentLifetimeKillError=String(error.message);}},17000);
   child.stdout.on('data',data=>{record.stdout+=data.toString().slice(0,4096-record.stdout.length);});child.stderr.on('data',data=>{record.stderr+=data.toString().slice(0,4096-record.stderr.length);});
   child.on('message',message=>record.messages.push(message));child.once('error',error=>{record.error=error.message;});
   child.once('close',(code,signal)=>{clearTimeout(lifetime);record.exitCode=code;record.signal=signal;record.joined=true;record.earlyExit=!worker.stopping;finished();});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('contention ready deadline')),4000);const ready=message=>{if(message?.kind==='ready'){clearTimeout(timer);child.off('message',ready);resolve();}};child.on('message',ready);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',()=>{clearTimeout(timer);reject(Error('contention exited before ready'));});});
   if(failAfterContentionReady10===i+1)throw Error('injected original contention startup failure after owned ready acknowledgement');
  }
 }catch(error){for(const w of workers){w.stopping=true;w.record.startupFailureCleanup=true;try{w.child.kill();}catch(killError){w.record.startupCleanupKillError=String(killError.message);}}await Promise.all(workers.map(w=>w.done));error.contention10={count,workers:workers.map(w=>w.record),qualified:false,phase:'startup-failed',allJoined:workers.every(w=>w.record.joined)};throw error;}
 return {records:workers.map(w=>w.record),async stop(){
  const kill=(w)=>{try{w.child.kill();}catch(error){w.record.stopKillError=String(error.message);}};
  const timer=setTimeout(()=>{for(const w of workers)if(!w.record.joined){w.record.stopDeadlineKill=true;kill(w);}},3000);
  const sendFailed=(w,error)=>{w.record.stopSendError=String(error.message);if(!w.record.joined)kill(w);};
  try{
   for(const w of workers){w.stopping=true;
    if(w.child.connected){try{
     if(w.stopSendFailure10==='sync')throw Error('injected original synchronous stop-send failure');
     if(w.stopSendFailure10==='async')setImmediate(()=>sendFailed(w,Error('injected original asynchronous stop-send failure')));
     else w.child.send('stop',error=>{if(error)sendFailed(w,error);});
    }catch(error){sendFailed(w,error);}}
    else if(!w.record.joined)w.record.stopDisconnectedBeforeRequest=true;
   }
   await Promise.all(workers.map(w=>w.done));
  }finally{clearTimeout(timer);}
 }};
}
export async function runProcessingTrial10(input,contentionCount,{failAfterContentionReady10=null,stopSendFailure10=null}={}){
 const config=options10(input);check(Number.isInteger(contentionCount)&&contentionCount>=0&&contentionCount<=4,'bounded direct contention count required');
 let contenders;try{contenders=await contention10(contentionCount,{failAfterContentionReady10,stopSendFailure10});}
 catch(error){return {config,pid:null,childWallMs:null,exitCode:null,signal:null,stdoutSha256:hash(''),stderrSha256:hash(String(error.message)),stderr:String(error.message),result:null,failure:'contention startup failed: '+error.message,contention:error.contention10??{count:contentionCount,workers:[],qualified:false,phase:'startup-failed',allJoined:false}};}
 const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
 let result;
 try{result=await new Promise(resolve=>{
  let stdout='',stderr='',failure=null;const started=performance.now(),child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',JSON.stringify(config)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{failure='processing10 child deadline';child.kill();},60000);
  const append=(data,error)=>{if(error)stderr+=data;else stdout+=data;if(stdout.length+stderr.length>32*1024*1024){failure='processing10 output bound';child.kill();}};
  child.stdout.on('data',data=>append(data.toString(),false));child.stderr.on('data',data=>append(data.toString(),true));child.once('error',error=>failure=error.message);
  child.once('close',(exitCode,signal)=>{clearTimeout(timer);let output=null;try{output=JSON.parse(stdout);check(output.kind==='RichAudioOriginalProcessingWorkload10'&&JSON.stringify(output.config)===JSON.stringify(config),'exact child workload identity');}catch(error){failure??=error.message;}
   resolve({config,pid:child.pid,childWallMs:performance.now()-started,exitCode,signal,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),stderr,result:output,failure:failure??(exitCode===0?null:'nonzero child exit')});});
 });}finally{await contenders.stop();}
 result.contention={count:contentionCount,workers:contenders.records,qualified:contenders.records.every(r=>r.joined&&r.exitCode===0&&!r.earlyExit&&!r.parentLifetimeKill&&!r.stopDeadlineKill&&!r.stopSendError&&!r.stopDisconnectedBeforeRequest&&r.messages.some(m=>m.kind==='stopped'&&m.reason==='requested'))};
 if(!result.contention.qualified)result.failure??='contention lifetime/join qualification failed';return result;
}

export async function profileProcessing10({selectedModes=['baseline-cold'],repetitions=2,selectedProfiles=profiles,contentionCounts=[0,4],blocks=144,lifecycle=false,snapshot=null,texture=false,instrumented=true}={}, {trialRunner10=runProcessingTrial10}={}){
 check(Array.isArray(selectedModes)&&selectedModes.length>0&&selectedModes.every(m=>modes.includes(m))&&new Set(selectedModes).size===selectedModes.length&&Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=4&&Array.isArray(selectedProfiles)&&selectedProfiles.length>0&&selectedProfiles.length<=2&&selectedProfiles.every(p=>profiles.includes(p))&&new Set(selectedProfiles).size===selectedProfiles.length&&Array.isArray(contentionCounts)&&contentionCounts.length>0&&contentionCounts.length<=2&&new Set(contentionCounts).size===contentionCounts.length&&contentionCounts.every(n=>Number.isInteger(n)&&n>=0&&n<=4),'bounded processing10 profile');
 check(typeof trialRunner10==='function','owned processing trial callback required');
 const trials=[];let terminalFailure=null;
 trialsLoop: for(const count of contentionCounts)for(const profile of selectedProfiles)for(let repetition=0;repetition<repetitions;repetition++)for(const scene of repetition%2?['walls','direct']:['direct','walls'])for(const mode of repetition%2?[...selectedModes].reverse():selectedModes){
  const config=options10({mode,profile,scene,blocks,lifecycle,snapshot,texture,instrumented});let trial;
  try{trial=await trialRunner10(config,count);}catch(error){trial={config,pid:null,childWallMs:null,exitCode:null,signal:null,result:null,stdoutSha256:hash(''),stderrSha256:hash(String(error.message)),stderr:String(error.message),failure:'trial runner exception: '+error.message,contention:error.contention10??{count,workers:[],qualified:false,phase:'runner-failed',allJoined:false}};}
  trials.push({repetition,...trial});
  process.stderr.write(JSON.stringify({progress:trials.length,mode,profile,scene,repetition,contention:count,failure:trial.failure,summary:trial.result?.summary.all})+'\n');
  if(trial.failure){terminalFailure={trial:trials.length-1,reason:trial.failure,remainingTrialsStarted:false,automaticRetry:false};break trialsLoop;}
 }
 let baselineArchiveSha256=null,baselineArchiveFailure=null;try{baselineArchiveSha256=hash(await fs.readFile(path.join(root,'.local','world10-baseline-8a995c8.zip')));}catch(error){baselineArchiveFailure=String(error.code??error.message);}
 return {schema:1,kind:'RichAudioProcessingReport10',createdUtc:new Date().toISOString(),completed:terminalFailure===null&&trials.every(t=>!t.failure),terminalFailure,requestedTrials:contentionCounts.length*selectedProfiles.length*repetitions*2*selectedModes.length,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},
  baseline:{commit:'8a995c8c8f5e7ab1461af64e756f30eafb7667a3',archiveSha256:baselineArchiveSha256,archiveFailure:baselineArchiveFailure,scope:'118 original authored MJS source/profiler/fixture files only; no CodeWalker upstream source or binaries'},
  harnessSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),trials,
  interpretation:{blockBudgetMs:acousticBudgetMs042,overrunsRemainFindings:true,performanceGatePassed:trials.every(t=>!t.failure&&t.result.summary.all.overBudget===0),
   contention:'Four separate bounded CPU workers maximum; ready handshake before measurement, bounded self lifetime and parent termination, explicit stop and joined close. Partial-core contention, not GTA load or an OS scheduling trace.',
   cold:'Fresh process with no synthetic warm history on real bank; cold prefix and later blocks share one genuine source lifecycle.',sourcePreparation:'Immutable bank preparation and authored throwaway JIT work are outside timed render; neither starts the audible vehicle.',
   scheduler:'CPU counters, GC overlap, V8 sampled stacks, dispatch delay and event-loop delay remain distinct observations. No OS descheduling cause established.',endpointAccess:false,installedResourceAccess:false,privateInputAccess:false,physicalLatencyMeasured:false}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]==='--contention-worker'){await worker10();}
  else if(process.argv[2]==='--child'){check(process.argv.length===4,'exact processing10 child arguments');console.log(JSON.stringify(await runProcessingWorkload10(JSON.parse(process.argv[3]))));}
  else{
   check(process.argv.length===6&&process.argv[2]==='--run'&&process.argv[3]==='--out','use --run --out .local/fresh-processing10.json JSON-config');
   const target=path.resolve(root,process.argv[4]);check(path.dirname(target)===path.join(root,'.local')&&/^[\w-]+\.json$/.test(path.basename(target)),'fresh direct .local report required');
   await fs.mkdir(path.dirname(target),{recursive:true});const handle=await fs.open(target,'wx');
   try{const report=await profileProcessing10(JSON.parse(process.argv[5]));await handle.writeFile(JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind:report.kind,completed:report.completed,trials:report.trials.length,performanceGatePassed:report.interpretation.performanceGatePassed}));if(!report.completed)process.exitCode=1;}
   catch(error){await handle.writeFile(JSON.stringify({kind:'RichAudioProcessing10FailedAttempt',createdUtc:new Date().toISOString(),reason:error.message})+'\n');throw error;}finally{await handle.close();}
  }
 }catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
