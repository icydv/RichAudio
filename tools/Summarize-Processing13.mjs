// Create-new summaries retain every miss and keep runtime populations separate.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compareProcessingPcm13,summarizeDurations13,processingBudgetMs13} from './Profile-Processing13.mjs';
import {captureProcessingWorkingClosure13} from './Freeze-Processing13.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),sha=value=>createHash('sha256').update(value).digest('hex');
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const same=(a,b,ignored=[])=>['preparation','instrumented','profile','scene','blocks','coldBlocks','lifecycle','texture'].filter(k=>!ignored.includes(k)).every(k=>a.config[k]===b.config[k])&&a.repetition===b.repetition&&a.affinity===b.affinity&&a.contention===b.contention;
export function cpuSampleTemporalQualification13(sampling){
 if(!sampling)return {collected:false,temporalAttributionQualified:false,reasonCodes:['not-collected'],negativeIntervals:[]};
 const profile=sampling.profile,reasons=[],negativeIntervals=[];
 const arrays=Array.isArray(profile?.nodes)&&Array.isArray(profile?.samples)&&Array.isArray(profile?.timeDeltas);
 if(!arrays)return {collected:true,temporalAttributionQualified:false,reasonCodes:['invalid-profile-shape'],negativeIntervals};
 const ids=new Set(profile.nodes.map(n=>n?.id));
 if(ids.size!==profile.nodes.length||profile.nodes.some(n=>!Number.isSafeInteger(n?.id)||n.id<=0)||profile.samples.some(id=>!ids.has(id)))reasons.push('invalid-sample-node-identity');
 if(!profile.samples.length)reasons.push('no-samples');
 if(profile.samples.length!==profile.timeDeltas.length)reasons.push('sample-delta-length-mismatch');
 if(profile.timeDeltas.some(d=>!Number.isSafeInteger(d)))reasons.push('invalid-sample-interval');
 profile.timeDeltas.forEach((valueUs,sampleIndex)=>{if(valueUs<0)negativeIntervals.push({sampleIndex,valueUs});});
 if(negativeIntervals.length)reasons.push('negative-sample-interval');
 if(!Number.isFinite(profile.startTime)||!Number.isFinite(profile.endTime)||profile.endTime<profile.startTime)reasons.push('invalid-profile-clock');
 if(profile.timeDeltas.every(Number.isSafeInteger)&&Number.isFinite(profile.startTime)&&Number.isFinite(profile.endTime)){
  let offset=0;const duration=profile.endTime-profile.startTime;
  if(profile.timeDeltas.some(delta=>{offset+=delta;return offset<0||offset>duration;}))reasons.push('sample-outside-profile-clock');
 }
 const bounds=sampling.mapping?.offsetBoundsMs;
 if(!sampling.mapping?.mapped||!Number.isFinite(bounds?.lower)||!Number.isFinite(bounds?.upper)||bounds.lower>bounds.upper)reasons.push('unqualified-clock-mapping');
 return {collected:true,temporalAttributionQualified:reasons.length===0,reasonCodes:reasons,sampleCount:profile.samples.length,intervalCount:profile.timeDeltas.length,negativeIntervals,scope:'Diagnostic consistency only; signed raw samples are retained unchanged. This is not OS/JIT/GC causation or a processing-deadline gate.'};
}
function commonInputClosure13(a,b){
 const select=r=>r.snapshot.files.filter(f=>!f.path.startsWith('src/')).map(f=>({path:f.path,sha256:f.sha256}));
 return JSON.stringify(select(a))===JSON.stringify(select(b));
}
export const processingLifecyclePhases13=Object.freeze(['no-active-source','first-source-activation','source-reacquisition','next-eight-after-first-activation','next-eight-after-reacquisition','other-active-source-blocks']);
export function classifyProcessingBlock13(result,row){
 const active=result.continuity.sourceRows.find(r=>r.block===row.block)?.sources??[];
 if(!active.length)return 'no-active-source';
 let prior=0;const activations=result.records.filter(r=>{const current=r.sourceCreations,changed=current>prior;prior=current;return changed;}).map(r=>r.block);
 const index=activations.indexOf(row.block);
 if(index>=0)return index===0?'first-source-activation':'source-reacquisition';
 const preceding=activations.findLastIndex(block=>block<row.block);
 if(preceding>=0&&row.block<=activations[preceding]+8)return preceding===0?'next-eight-after-first-activation':'next-eight-after-reacquisition';
 return 'other-active-source-blocks';
}
function miss13(result,row){return {block:row.block,phase:row.phase,activationPhase:classifyProcessingBlock13(result,row),renderMs:row.renderMs,sourceCreations:row.sourceCreations,selectedPaths:row.selectedPaths,reflectedPaths:row.reflectedPaths,
 lifecycleContext:{activeSources:result.continuity.sourceRows.find(r=>r.block===row.block)?.sources??[],latestObservation:result.observationSequence?.findLast(r=>r.block<=row.block)??null,scope:'Active source identity/frame state and latest authored input observation. The latest observation can lead delayed render state; scope retirement does not infer engine shutdown.'},
 spans:row.spans.map(s=>({name:s.name,wallMs:s.wallMs,exclusiveWallMs:s.exclusiveWallMs,cpuMs:s.cpuMs,exclusiveCpuMs:s.exclusiveCpuMs,wallMinusCpuMs:s.wallMinusCpuMs,gcTemporalOverlaps:s.gcTemporalOverlaps,gcTemporalUnionMs:s.gcTemporalUnionMs})),attribution:row.spans.length?'Measured nested phase intervals; inclusive children are not independent costs.':'Instrumentation disabled; no phase attribution available.'};}
function phaseSummaries13(rows){
 const spans=rows.flatMap(r=>r.spans),names=[...new Set(spans.map(s=>s.name))];
 return Object.fromEntries(names.map(name=>{const calls=spans.filter(s=>s.name===name);return [name,{wall:summarizeDurations13(calls.map(s=>s.wallMs)),cpu:summarizeDurations13(calls.map(s=>s.cpuMs)),scope:'Actual instrumented phase invocations only; nested inclusive durations must not be summed.'}];}));
}
function postAnalysisHeadroom13(rows){return {targetMs:8,blocksAboveTarget:rows.filter(r=>r.renderMs>8).length,maximumMs:Math.max(...rows.map(r=>r.renderMs)),maximumTargetMet:rows.every(r=>r.renderMs<=8),scope:'Maximum-duration processing headroom target; required by WORLD13 CI separately from functional validity and the unchanged 512-frame 10.666666666666666 ms hard deadline. It adds no runtime buffering or wait.'};}
export function summarizeProcessingReport13(report,name='retained-report'){
 check(report.kind==='RichAudioProcessingReport13'&&Array.isArray(report.trials),'original processing13 raw report required');
 const completed=report.trials.filter(t=>t.result),groups=new Map();
 for(const t of completed){
  check(t.result.runtime.node===report.runtime.node&&t.result.runtime.execSha256===report.runtime.execSha256,'matched parent/child Node runtime required');
  const group={implementation:t.result.implementation,preparation:t.config.preparation,instrumented:t.config.instrumented,profile:t.config.profile,scene:t.config.scene,topology:t.topology,affinity:t.affinity,contention:t.contention};
  const key=JSON.stringify(group);if(!groups.has(key))groups.set(key,{...group,trials:[]});groups.get(key).trials.push(t);
 }
 const comparisons=[];
 for(const trial of completed){
  const specs=[];
  if(trial.result.implementation==='candidate')specs.push({kind:'parent-versus-candidate',find:b=>b.result.implementation==='parent'&&same(b,trial)});
  if(trial.config.instrumented)specs.push({kind:'instrumentation-off-versus-on',find:b=>b.config.snapshot===trial.config.snapshot&&!b.config.instrumented&&same(b,trial,['instrumented'])});
  if(trial.config.preparation==='authored-jit')specs.push({kind:'same-implementation-data-prepared-versus-authored-jit',find:b=>b.config.snapshot===trial.config.snapshot&&b.config.preparation==='data-prepared'&&same(b,trial,['preparation'])});
  for(const spec of specs){const reference=completed.find(spec.find);if(!reference){comparisons.push({kind:spec.kind,trial:report.trials.indexOf(trial),measured:false,reason:'Matching control was not run in this report.'});continue;}
   comparisons.push({kind:spec.kind,trial:report.trials.indexOf(trial),reference:report.trials.indexOf(reference),sameInputAndHarnessClosure:commonInputClosure13(reference.result,trial.result),sameRuntime:reference.result.runtime.execSha256===trial.result.runtime.execSha256,...compareProcessingPcm13(reference.result,trial.result)});
  }
 }
 // A matrix may intentionally omit a control dimension; availability is explicit.
 const available=comparisons.filter(c=>c.measured!==false),pcmPassed=available.length>0&&available.every(c=>Object.values(c).filter(v=>typeof v==='boolean').every(Boolean));
 return {name,createdUtc:report.createdUtc,derivedRevision:3,lifecyclePhaseTaxonomy:processingLifecyclePhases13,runtime:report.runtime,completed:report.completed,requestedTrials:report.requestedTrials,trials:report.trials.length,terminalFailure:report.terminalFailure,gates:{functional:report.gates.functional&&pcmPassed,pcm:pcmPassed,processingDeadline:report.gates.processingDeadline,blockBudgetMs:processingBudgetMs13},
  groups:[...groups.values()].map(g=>{const rows=g.trials.flatMap(t=>t.result.records),{trials,...dimensions}=g;return {...dimensions,trials:trials.length,blocks:rows.length,all:summarizeDurations13(rows.map(r=>r.renderMs)),cold:summarizeDurations13(trials.flatMap(t=>t.result.records.slice(0,t.config.coldBlocks).map(r=>r.renderMs))),later:summarizeDurations13(trials.flatMap(t=>t.result.records.slice(t.config.coldBlocks).map(r=>r.renderMs))),measuredPhaseInvocations:phaseSummaries13(rows),activationPhases:Object.fromEntries(processingLifecyclePhases13.map(label=>{const selected=trials.flatMap(t=>t.result.records.filter(r=>classifyProcessingBlock13(t.result,r)===label));return [label,summarizeDurations13(selected.map(r=>r.renderMs))];})),postAnalysisHeadroom:postAnalysisHeadroom13(rows),processingDeadlinePassed:rows.every(r=>!r.overBudget)};}),
  details:report.trials.map((t,index)=>({index,config:t.config,repetition:t.repetition,topology:t.topology,affinity:t.affinity,contention:t.contention,failure:t.failure,allChildrenJoined:t.allChildrenJoined,contentionQualified:t.contentionQualified,closureManifestSha256:t.closureManifestSha256,
   ownedChildren:t.workers.map(w=>({role:w.role,pid:w.pid,parentPid:w.parentPid,createdUtc:w.createdUtc,affinity:w.affinity,joined:w.joined,exitCode:w.exitCode,signal:w.signal,failure:w.failure,stopSendError:w.stopSendError,messages:w.messages,affinityHelper:w.affinityHelper})),
   summary:t.result?.summary,maximum:t.result?miss13(t.result,t.result.records.reduce((a,b)=>a.renderMs>b.renderMs?a:b)):null,everyMiss:t.result?.records.filter(r=>r.overBudget).map(r=>miss13(t.result,r)),everyBlockAboveHeadroom:t.result?.records.filter(r=>r.renderMs>8).map(r=>miss13(t.result,r)),activations:t.result?.records.filter(r=>['first-source-activation','source-reacquisition'].includes(classifyProcessingBlock13(t.result,r))).map(r=>miss13(t.result,r)),startup:t.result?.outsideRender.map(s=>({name:s.name,wallMs:s.endMs-s.startMs})),instrumentation:t.result?.instrumentation,cpuSampleMapping:t.result?.cpuSampling?.mapping??null,cpuSampleTemporalQualification:cpuSampleTemporalQualification13(t.result?.cpuSampling),maxRssBytes:t.result?.maxRssBytes,sceneWorkers:t.result?.sceneWorkers,parentRuntime:t.parentRuntime,childRuntime:t.result?.runtime,observationSequence:t.result?.observationSequence,lifecycle:t.result?.lifecycle,
   continuity:t.result?{drySha256:t.result.continuity.drySha256,stereoSha256:t.result.continuity.stereoSha256,sourceConstructions:t.result.continuity.sourceConstructions,sourceCursorContinuous:t.result.continuity.sourceCursorContinuous,rendererHistoryStable:t.result.continuity.rendererHistoryStable,historyAffectedFrames:t.result.continuity.historyAffectedFrames,limiterEvents:t.result.continuity.limiterEvents,beforeRender:t.result.beforeRender}:null})),comparisons,
  limits:{originalOnly:true,runtimePopulationPooled:false,instrumentationCostIncluded:true,blockBudgetChanged:false,queueFramesAdded:0,actualSourceWarmFrames:0,cpuCounters:'Windows counters can be quantized. Signed residuals are retained; wall minus CPU is not OS scheduling time.',jit:'A same-implementation authored warm control is an experiment, not proof that a particular miss was JIT compilation.',gc:'Main-isolate temporal overlap only; no causal subtraction or worker GC observation.',scheduling:'Owned same-mask contenders exercise bounded CPU pressure. No OS scheduler trace or game workload. Four restricted logical CPUs match a count only, not hosted CPU model, SMT topology or performance.',deviceUnderflowMeasured:false,physicalLatencyMeasured:false,endpointOpened:false,installedResourcesRead:false,privateBanksRead:false}};
}
export async function summarizeProcessing13(names){
 check(Array.isArray(names)&&names.length>=1&&names.length<=16&&names.every(n=>/^[\w-]+\.json$/.test(n)),'bounded retained original report names required');
 const closureBefore=await captureProcessingWorkingClosure13();
 const artifacts=[],experiments=[];
 for(const name of names){const bytes=await fs.readFile(path.join(root,'.local',name)),report=JSON.parse(bytes);artifacts.push({name,bytes:bytes.length,sha256:sha(bytes)});experiments.push(summarizeProcessingReport13(report,name));}
 const closureAfter=await captureProcessingWorkingClosure13();check(closureBefore.closureSha256===closureAfter.closureSha256,'executed summarizer/helper/runtime source closure changed during summary');
 return {schema:1,kind:'RichAudioProcessingEvidence13',derivedRevision:3,lifecyclePhaseTaxonomy:processingLifecyclePhases13,createdUtc:new Date().toISOString(),executedSummarizerSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),executedSourceClosure:{before:closureBefore,after:closureAfter,stable:true},artifacts,experiments,functionalPassed:experiments.every(e=>e.gates.functional),pcmPassed:experiments.every(e=>e.gates.pcm),processingDeadlinePassed:experiments.every(e=>e.gates.processingDeadline),runtimePopulationsSeparate:true,blockBudgetMs:processingBudgetMs13};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{check(process.argv[2]==='--out'&&process.argv.length>=5,'--out fresh-local-or-evidence.json report-names required');const output=path.resolve(root,process.argv[3]);check((output.startsWith(path.join(root,'.local')+path.sep)||path.dirname(output)===path.join(root,'evidence'))&&/^[\w-]+\.json$/.test(path.basename(output)),'owned fresh evidence output required');
  for(let at=path.dirname(output);at.startsWith(root);at=path.dirname(at)){check(!(await fs.lstat(at)).isSymbolicLink(),'evidence output links refused');if(at===path.resolve(root))break;}
  const report=await summarizeProcessing13(process.argv.slice(4)),bytes=JSON.stringify(report,null,2)+'\n';await fs.writeFile(output,bytes,{flag:'wx'});console.log(JSON.stringify({kind:report.kind,functionalPassed:report.functionalPassed,pcmPassed:report.pcmPassed,processingDeadlinePassed:report.processingDeadlinePassed,sha256:sha(bytes)}));
 }catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
