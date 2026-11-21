// Original analytic PCM; no file-bank loader, endpoint or recording API.
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {sourceEngine05,sourceFrame05} from '../tests/fixtures/SourcePreparation05.mjs';
import {summarizeDurations042,associateGc042,acousticBudgetMs042} from './Profile-AcousticBudget042.mjs';
const variants=['default','optin-fallback','optin-ready'],immediate=()=>new Promise(resolve=>setImmediate(resolve));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),typed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const check=(value,reason)=>{if(!value)throw Error(reason);};
function options({variant='default',blocks=144,coldBlocks=24}={}){check(variants.includes(variant)&&Number.isInteger(blocks)&&blocks>=36&&blocks<=512&&Number.isInteger(coldBlocks)&&coldBlocks>=1&&coldBlocks<blocks,'bounded original source preparation profile');return {variant,blocks,coldBlocks};}
export async function runSourcePreparationWorkload05(input={}){
 const config=options(input),gcEvents=[],observer=new PerformanceObserver(list=>collect(list.getEntries())),records=[],outsideRender=[],constructions=[];
 function collect(entries){for(const e of entries)gcEvents.push({startMs:e.startTime,endMs:e.startTime+e.duration,durationMs:e.duration,kind:e.detail?.kind??null,flags:e.detail?.flags??null});}
 observer.observe({entryTypes:['gc']});let row=null,phase='engine-construction',engine,prep=null;
 const dry=createHash('sha256'),stereo=createHash('sha256');let next=.05,sequence=1,source=null,cursor=null,histories=null,stable=true;
 try{
  const began=performance.now();engine=sourceEngine05({prepared:config.variant!=='default',onConstruct:s=>{const original=s.renderInto;s.renderInto=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(row)row.stages.sourceSynthesisMs+=performance.now()-start;}};}});outsideRender.push({kind:'engine-construction',startMs:began,endMs:performance.now()});
  const instance=engine.instance,create=engine.registry.createSource;
  engine.registry.createSource=function(...args){const startMs=performance.now();try{return create.apply(this,args);}finally{const entry={phase,startMs,endMs:performance.now()};constructions.push(entry);if(row)row.stages.sourceConstructionMs+=entry.endMs-entry.startMs;}};
  const prepare=instance.pipeline.prepare,process=instance.pipeline.process;
  instance.pipeline.prepare=async function(...args){const start=performance.now();try{return await prepare.apply(this,args);}finally{if(row)row.stages.controlPreparationMs+=performance.now()-start;}};
  instance.pipeline.process=function(...args){const start=performance.now();try{return process.apply(this,args);}finally{if(row)row.stages.pcmRendererMs+=performance.now()-start;}};
  instance.accept(sourceFrame05(0,0),0,200);
  if(config.variant==='optin-ready'){phase='explicit-control-preparation';const startMs=performance.now();prep=await instance.prepareSources05();outsideRender.push({kind:phase,startMs,endMs:performance.now(),result:prep});}
  for(let block=0;block<config.blocks;block++){
   const time=block*512/48000;engine.setWall(time*1000);phase='observation-control';
   if(time+1e-10>=next){instance.accept(sourceFrame05(sequence++,next),Math.max(0,(time-next)*1000),200);next+=.05;}
   row={block,phase:block<config.coldBlocks?'cold-prefix':'later-blocks',stages:{sourceConstructionMs:0,sourceSynthesisMs:0,controlPreparationMs:0,pcmRendererMs:0}};phase='render';
   row.startMs=performance.now();await instance.render();row.endMs=performance.now();row.renderMs=row.endMs-row.startMs;row.overBudget=row.renderMs>acousticBudgetMs042;
   row.stages.otherGameplayAndInstrumentationMs=Math.max(0,row.renderMs-Object.values(row.stages).reduce((a,b)=>a+b,0));row.sourceCreations=instance.stageCounters.sourceCreations;records.push(row);row=null;phase='digest-and-continuity';
   for(const id of instance.ids)dry.update(typed(instance.inputs[id]));stereo.update(typed(instance.left));stereo.update(typed(instance.right));
   const active=instance.slots.find(s=>s.source);if(active){source??=active.source;stable&&=source===active.source;if(cursor!==null)stable&&=active.source.frame-cursor===512;cursor=active.source.frame;histories??=instance.pipeline.renderer.sourceList.map(s=>s.bands);stable&&=instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);}
  }
  await immediate();await immediate();collect(observer.takeRecords());observer.disconnect();
  return {schema:1,kind:'OriginalSourcePreparationWorkload05',config,records:associateGc042(records,gcEvents),gcEvents,outsideRender,constructions,
   summary:{all:summarizeDurations042(records.map(r=>r.renderMs)),cold:summarizeDurations042(records.slice(0,config.coldBlocks).map(r=>r.renderMs)),later:summarizeDurations042(records.slice(config.coldBlocks).map(r=>r.renderMs))},
   continuity:{drySHA256:dry.digest('hex'),stereoSHA256:stereo.digest('hex'),sourceStable:stable,sourceFrame:cursor,rendererFrames:instance.pipeline.renderer.frame,sourceCreations:instance.stageCounters.sourceCreations,historyAffectedFrames:instance.pipeline.renderer.historyDiagnostics.affectedFrames,limited:instance.pipeline.renderer.stats.limited},
   preparation:instance.sourcePreparation05?.diagnostics()??null,preparationResult:prep,
   limits:{source:'original analytic PCM through existing StockVehicleSource',sameNodeEventLoop:true,cpuIsolation:false,observationClock:'deterministic block time; no endpoint pacing',gc:'local isolate temporal overlaps only; no causal attribution or OS scheduler measurement',instrumentationOverheadIncluded:true,endpointOpened:false,privateBankRead:false,installedResourceRead:false}};
 }finally{row=null;observer.disconnect();if(engine)await engine.instance.close();}
}
async function child(config){
 const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',config.variant,String(config.blocks),String(config.coldBlocks)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='',failed=null;
  const deadline=setTimeout(()=>{failed=Error('Source preparation diagnostic deadline');child.kill();},60000);
  const append=(chunk,stderr)=>{if(stderr)error+=chunk;else output+=chunk;if(output.length+error.length>8*1024*1024){failed=Error('Source preparation diagnostic output bound');child.kill();}};
  child.stdout.on('data',b=>append(b.toString(),false));child.stderr.on('data',b=>append(b.toString(),true));child.on('error',e=>failed=e);
  child.on('close',code=>{clearTimeout(deadline);if(failed)return reject(failed);if(code!==0)return reject(Error(error.slice(0,2000)));try{const result=JSON.parse(output);check(result.kind==='OriginalSourcePreparationWorkload05'&&result.config.variant===config.variant,'exact source preparation child result');resolve(result);}catch(e){reject(e);}});
 });
}
export async function profileSourcePreparation05({blocks=144,coldBlocks=24,repetitions=2}={}){
 options({blocks,coldBlocks});check(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=4,'bounded original profile repetitions');const trials=[];
 for(let repetition=0;repetition<repetitions;repetition++)for(const variant of repetition%2?[...variants].reverse():variants){const start=performance.now(),result=await child({variant,blocks,coldBlocks});trials.push({repetition,childWallMs:performance.now()-start,...result});}
 const comparisons=Array.from({length:repetitions},(_,repetition)=>{const select=v=>trials.find(t=>t.repetition===repetition&&t.config.variant===v).continuity,a=select('default'),b=select('optin-ready'),fallback=select('optin-fallback');return {repetition,dryBitIdentical:a.drySHA256===b.drySHA256&&a.drySHA256===fallback.drySHA256,stereoBitIdentical:a.stereoSHA256===b.stereoSHA256&&a.stereoSHA256===fallback.stereoSHA256,framesIdentical:a.rendererFrames===b.rendererFrames&&a.rendererFrames===fallback.rendererFrames,sourceCursorIdentical:a.sourceFrame===b.sourceFrame&&a.sourceFrame===fallback.sourceFrame,allHistoriesContinuous:[a,b,fallback].every(t=>t.sourceStable&&t.sourceCreations===1&&t.historyAffectedFrames===0&&t.limited===0)};});
 const files=['src/acoustics/vehicle/gameplay.mjs','src/acoustics/vehicle/source-preparation05.mjs','src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/pipeline.mjs','src/acoustics/streaming/causal.mjs','tests/fixtures/SourcePreparation05.mjs','tools/Profile-SourcePreparation05.mjs'];
 const sourceBindings=Object.fromEntries(await Promise.all(files.map(async name=>[name,hash(await fs.readFile(new URL('../'+name,import.meta.url)))])));
 return {schema:1,kind:'RichAudioSourcePreparationProfile05',createdUtc:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model??null},sourceBindings,trials,comparisons,
  limits:['Selected source hashes are not full runtime closure','Preparation yields once then constructs synchronously on the same Node event loop; it must complete before a render deadline','No render waits for readiness; a miss uses the existing immediate constructor','No additional fixed PCM queue, source pre-roll or endpoint pacing','Fresh original workloads do not assign a cause to historical larger spikes','Every measured overrun remains a finding']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv[2]==='--child'){check(process.argv.length===6,'exact diagnostic child arguments');console.log(JSON.stringify(await runSourcePreparationWorkload05({variant:process.argv[3],blocks:Number(process.argv[4]),coldBlocks:Number(process.argv[5])})));}
 else{const args=process.argv.slice(2);check(args[0]==='--run'&&args.length===3&&args[1]==='--out','use --run --out .local/fresh-report.json');const root=fileURLToPath(new URL('../',import.meta.url)),local=path.join(root,'.local'),file=path.resolve(root,args[2]);check(path.dirname(file)===local&&/^[\w-]+\.json$/.test(path.basename(file)),'fresh report in this checkout .local');await fs.mkdir(local,{recursive:true});const stat=await fs.lstat(local);check(stat.isDirectory()&&!stat.isSymbolicLink(),'owned local report directory');const handle=await fs.open(file,'wx');try{const report=await profileSourcePreparation05(),bytes=JSON.stringify(report,null,2)+'\n';await handle.writeFile(bytes);console.log(JSON.stringify({sha256:hash(bytes),trials:report.trials.map(t=>({repetition:t.repetition,variant:t.config.variant,...t.summary.all,preparation:t.preparationResult})),comparisons:report.comparisons}));}finally{await handle.close();}}}
 catch(error){console.error(error.message);process.exitCode=1;}
}
