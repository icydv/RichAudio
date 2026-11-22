// Create-new portable summaries from retained original-only raw measurements.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compareProcessingPcm10} from './Profile-Processing10.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const range=values=>values.length?[Math.min(...values),Math.max(...values)]:null;
const span=s=>({name:s.name,wallMs:s.wallMs,exclusiveWallMs:s.exclusiveWallMs,cpuMs:s.cpuMs,exclusiveCpuMs:s.exclusiveCpuMs,gcTemporalUnionMs:s.gcTemporalUnionMs});
const block=r=>({block:r.block,renderMs:r.renderMs,cpuMs:r.cpuMs,wallMinusCpuMs:r.wallMinusCpuMs,gcTemporalUnionMs:r.gcTemporalUnionMs,spans:r.spans.map(span)});
function sameWorkload(a,b){return a.repetition===b.repetition&&a.contention.count===b.contention.count&&a.config.profile===b.config.profile&&a.config.scene===b.config.scene&&Boolean(a.config.lifecycle)===Boolean(b.config.lifecycle)&&Boolean(a.config.texture)===Boolean(b.config.texture)&&a.config.blocks===b.config.blocks;}
function summary10(report,name){
 const modes=[...new Set(report.trials.map(t=>t.config.mode))];
 return {name,createdUtc:report.createdUtc,completed:report.completed,terminalFailure:report.terminalFailure??null,requestedTrials:report.requestedTrials??report.trials.length,runtime:report.runtime,baseline:report.baseline,harnessSha256:report.harnessSha256,
  modes:modes.map(mode=>{
   const ts=report.trials.filter(t=>t.config.mode===mode),completed=ts.filter(t=>t.result),rows=completed.flatMap(t=>t.result.records),construction=rows.flatMap(r=>r.spans.filter(s=>s.name==='sourceConstruction').map(s=>s.wallMs));
   return {mode,trials:ts.length,blocks:rows.length,failedChildren:ts.filter(t=>t.failure).length,overBudget:rows.filter(r=>r.overBudget).length,maximumRangeMs:range(completed.map(t=>t.result.summary.all.maximumMs)),
    laterMedianRangeMs:range(completed.map(t=>t.result.summary.later.p50Ms)),laterP99RangeMs:range(completed.map(t=>t.result.summary.later.p99Ms)),laterMaximumRangeMs:range(completed.map(t=>t.result.summary.later.maximumMs)),sourceConstructionRangeMs:range(construction),
    processingDeadlinePassed:ts.every(t=>!t.failure&&t.result.summary.all.overBudget===0)};
  }),
  trials:report.trials.map(t=>{const r=t.result;return {mode:t.config.mode,profile:t.config.profile,scene:t.config.scene,repetition:t.repetition,contention:t.contention.count,lifecycle:Boolean(t.config.lifecycle),texture:Boolean(t.config.texture),instrumented:t.config.instrumented??true,
   failure:t.failure,exitCode:t.exitCode,signal:t.signal,stderr:t.stderr,childWallMs:t.childWallMs,sourceBindings:r?.sourceBindings,inputBindings:r?.inputBindings??null,runtimeSnapshot:r?.runtimeSnapshot,
   summary:r?.summary?{all:r.summary.all,cold:r.summary.cold,later:r.summary.later}:null,
   startup:r?.outsideRender.map(s=>({name:s.name,wallMs:s.endMs-s.startMs,cpuMs:(s.cpuEndUs-s.cpuStartUs)/1000})),
   maximum:r?block(r.records.reduce((a,b)=>a.renderMs>b.renderMs?a:b)):null,overruns:r?.records.filter(r=>r.overBudget).map(block),
   sourceActivations:r?.records.filter(r=>r.spans.some(s=>s.name==='sourceConstruction')).map(block),
   dispatchDelayRangeMs:r?range(r.dispatchProbes.map(p=>p.delayMs)):null,cpuSampleMapping:r?{mapped:r.cpuSampling.association.mapped,reason:r.cpuSampling.association.reason??null,uncertaintyWidthMs:r.cpuSampling.association.uncertaintyWidthMs??null}:null,eventLoop:r?.eventLoop,
   reflectedPathMaximum:r?Math.max(...r.records.map(row=>row.reflectedPaths)):null,continuity:r?{drySha256:r.continuity.drySha256,stereoSha256:r.continuity.stereoSha256,sourceConstructions:r.continuity.sourceConstructions,
    sourceCursorContinuous:r.continuity.sourceCursorContinuous,rendererHistoryStable:r.continuity.rendererHistoryStable,historyAffectedFrames:r.continuity.historyAffectedFrames,limiterEvents:r.continuity.limiterEvents,beforeRender:r.beforeRender}:null,
   workerCount:t.contention.workers.length,workersJoined:t.contention.workers.every(w=>w.joined),contentionQualified:t.contention.qualified,sceneWorkers:r?.workers};}),interpretation:report.interpretation};
}
export async function summarizeProcessing10(names){
 check(names.length>=1&&names.length<=16&&names.every(name=>/^[\w-]+\.json$/.test(name)),'bounded retained local report names required');
 const reports=[],artifacts=[];let hosted=null;
 for(const name of names){
  const bytes=await fs.readFile(path.join(root,'.local',name)),report=JSON.parse(bytes);artifacts.push({name,bytes:bytes.length,sha256:hash(bytes)});
  if(report.kind==='RichAudioProcessingReport10')reports.push({name,report});
  else if(report.kind==='RichAudioProcessingReport09'){
   const instrumented=report.trials.filter(t=>t.config.variant.startsWith('instrumented')),rows=instrumented.flatMap(t=>t.result.records),firsts=rows.filter(r=>r.spans.some(s=>s.name==='sourceConstruction'));
   hosted={name,blocks:report.trials.reduce((n,t)=>n+t.result.records.length,0),overBudget:report.trials.reduce((n,t)=>n+t.result.summary.all.overBudget,0),maximumRangeMs:range(report.trials.map(t=>t.result.summary.all.maximumMs)),
    firstConstructionRangeMs:range(firsts.flatMap(r=>r.spans.filter(s=>s.name==='sourceConstruction').map(s=>s.wallMs))),firstSynthesisRangeMs:range(firsts.flatMap(r=>r.spans.filter(s=>s.name==='sourceSynthesis').map(s=>s.wallMs))),
    laterInstrumentedOverruns:rows.filter(r=>r.overBudget&&!r.spans.some(s=>s.name==='sourceConstruction')).map(block),
    interpretation:'These exact retained hosted phase intervals support construction and early synthesis/renderer costs. GC overlap and coarse CPU readings do not establish OS scheduling or JIT causation.'};
  }else throw Error('unexpected retained processing report');
 }
 const comparisons=[];
 for(const {name,report}of reports)for(const t of report.trials.filter(t=>t.config.mode!=='baseline-cold'&&t.result)){
  const candidates=[...report.trials,...reports.flatMap(r=>r.report.trials)].filter(b=>b.config.mode==='baseline-cold'&&b.result&&sameWorkload(b,t));
  const reference=candidates.find(b=>(b.config.instrumented??true)===(t.config.instrumented??true))??candidates[0];
  if(!reference){comparisons.push({report:name,mode:t.config.mode,scene:t.config.scene,unavailable:true});continue;}
  comparisons.push({report:name,mode:t.config.mode,profile:t.config.profile,scene:t.config.scene,repetition:t.repetition,contention:t.contention.count,lifecycle:Boolean(t.config.lifecycle),texture:Boolean(t.config.texture),instrumented:t.config.instrumented??true,baselineReport:reports.find(r=>r.report.trials.includes(reference))?.name??null,baselineInstrumented:reference.config.instrumented??true,baselineInputBindings:reference.result.inputBindings??null,...compareProcessingPcm10(reference.result,t.result)});
 }
 const pcmPassed=comparisons.length>0&&comparisons.every(c=>c.unavailable!==true&&Object.entries(c).filter(([key,value])=>typeof value==='boolean'&&!['lifecycle','texture','instrumented','baselineInstrumented'].includes(key)).every(([,value])=>value));
 return {schema:1,kind:'RichAudioProcessingEvidence10',createdUtc:new Date().toISOString(),artifacts,hosted,experiments:reports.map(({name,report})=>summary10(report,name)),pcmPassed,comparisons,
  limits:{originalOnly:true,blockBudgetMs:512/48000*1000,allFailuresRetained:true,physicalLatencyMeasured:false,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false,
   preparation:'Immutable source data and authored JIT startup work run before rendering on the same Node thread. This is not worker CPU isolation and does not fabricate genuine source history.',
   scheduling:'Partial-core bounded process contention, V8 sample clock bounds, process/thread counters, GC overlap and callback dispatch are distinct observations. No independent OS scheduler trace.',
   generalisation:'Short original authored fixtures do not qualify private bank sizes, real game load, WASAPI continuity, audibility or long-session real-time safety.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{check(process.argv[2]==='--out'&&process.argv.length>=5,'--out evidence/fresh-summary.json local-report-names required');
  const output=path.resolve(root,process.argv[3]),portable=path.dirname(output)===path.join(root,'evidence'),local=output.startsWith(path.join(root,'.local')+path.sep);check((portable||local)&&/^[\w-]+\.json$/.test(path.basename(output)),'fresh owned portable evidence name required');
  for(let at=path.dirname(output);at.startsWith(root);at=path.dirname(at)){const info=await fs.lstat(at);check(info.isDirectory()&&!info.isSymbolicLink(),'existing nonlinked evidence ancestors required');if(at===path.resolve(root))break;}
  const report=await summarizeProcessing10(process.argv.slice(4)),bytes=JSON.stringify(report,null,2)+'\n';await fs.writeFile(output,bytes,{flag:'wx'});console.log(JSON.stringify({kind:report.kind,pcmPassed:report.pcmPassed,comparisons:report.comparisons.length,sha256:hash(bytes)}));
 }catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
