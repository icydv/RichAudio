import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {freezeProcessing12,verifyProcessingSnapshot12,processingParent12} from '../tools/Freeze-Processing12.mjs';
import {processingOptions12,summarizeDurations12,runProcessingTrial12,compareProcessingPcm12,profileProcessing12,accountProcessingSpans12} from '../tools/Profile-Processing12.mjs';
import {canonicalProcessingState12,processingStateHash12} from '../tools/Processing-Continuity12.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

test('outside-timer continuity hashes retain signed zero, missing state and grain-plan order',()=>{
 assert.notEqual(processingStateHash12({phase:-0}),processingStateHash12({phase:0}));
 assert.notEqual(processingStateHash12({head:undefined}),processingStateHash12({}));
 assert.notEqual(processingStateHash12({allowed:new Set([1,2])}),processingStateHash12({allowed:new Set([2,1])}));
 assert.notEqual(processingStateHash12(new Float32Array([1])),processingStateHash12([1]));
 assert.notEqual(canonicalProcessingState12(NaN),canonicalProcessingState12(null));
});

test('bounded original inputs and strict unchanged 512-frame deadline reject unsupported controls',async()=>{
 for(const config of [{snapshot:'../outside'},{preparation:'private-bank'},{instrumented:'yes'},{blocks:35},{blocks:513},{coldBlocks:144},{texture:1},{scene:'gta'}])assert.throws(()=>processingOptions12(config),/bounded original/);
 for(const control of [{affinity:'global'},{contention:3},{contention:-1},{failAfterContenderReady:1}])await assert.rejects(runProcessingTrial12({snapshot:'world12-current-absent'},control),/bounded owned/);
 const result=summarizeDurations12([1,2,3,10.666666666666666,10.666666666666668]);
 assert.equal(result.overBudget,1);assert.equal(result.p50Ms,3);assert.equal(result.p95Ms,10.666666666666668);assert.equal(result.p99Ms,10.666666666666668);
});

test('fresh owned snapshot binds every executed helper and rejects a changed runtime member without replacement',async()=>{
 const name='world12-current-closure-control-'+randomUUID(),capture=await freezeProcessing12(name),directory=path.join(root,'.local',name);
 assert(capture.files>100);const verified=await verifyProcessingSnapshot12(directory);
 assert.equal(verified.manifest.parent,processingParent12);assert(verified.manifest.files.some(f=>f.path==='tools/Owned-Processing12.mjs'));
 assert(verified.manifest.files.every(f=>f.path.endsWith('.mjs')&&!/CodeWalker|\.exe|\.dll|\.wav/.test(f.path)));
 await assert.rejects(freezeProcessing12(name),/EEXIST/);
 const member=path.join(directory,'src/acoustics/vehicle/stock-source.mjs');await fs.appendFile(member,'\n// Deliberate isolated closure-integrity negative control.\n');
 await assert.rejects(verifyProcessingSnapshot12(directory),/frozen executable closure changed/);
});

test('failed matrix stops without retry and retains its completed preceding trial',async()=>{
 let calls=0;
 const report=await profileProcessing12({snapshots:['world12-current-matrix-control'],selectedPreparations:['authored-jit'],instrumentation:[false,true],affinities:['normal'],contentionCounts:[0],repetitions:2,topologies:['plain'],scenes:['direct']},{trialRunner:async(config,controls)=>{
  calls++;return {config,...controls,result:calls===1?{summary:{all:{overBudget:1}}}:null,failure:calls===1?null:'injected retained startup failure',allChildrenJoined:true,contentionQualified:true,workers:[]};
 }});
 assert.equal(calls,2);assert.equal(report.requestedTrials,4);assert.equal(report.trials.length,2);assert.equal(report.trials[0].result.summary.all.overBudget,1);assert.equal(report.completed,false);assert.deepEqual(report.terminalFailure,{trial:1,reason:'injected retained startup failure',automaticRetry:false,remainingTrialsStarted:false});assert.equal(report.gates.processingDeadline,false);
});

test('reviewed span accounting rejects overlapping or uncontained children and retains signed CPU residuals plus GC interval union',()=>{
 const outer={id:0,parent:-1,name:'render',startMs:0,endMs:10,cpuStartUs:0,cpuEndUs:1000};
 const child={id:1,parent:0,name:'first',startMs:1,endMs:4,cpuStartUs:0,cpuEndUs:1500};
 assert.throws(()=>accountProcessingSpans12([outer,child,{id:2,parent:0,name:'overlap',startMs:3,endMs:5,cpuStartUs:0,cpuEndUs:500}]),/parallel siblings/);
 assert.throws(()=>accountProcessingSpans12([outer,{...child,endMs:11}]),/contained/);
 const measured=accountProcessingSpans12([outer,child],[{startMs:1,endMs:5},{startMs:3,endMs:7}]);
 assert.equal(measured[0].gcTemporalUnionMs,6);assert.equal(measured[0].gcTemporalOverlaps.reduce((n,g)=>n+g.overlapMs,0),8);assert.equal(measured[0].exclusiveWallMs,7);assert.equal(measured[0].exclusiveCpuMs,-.5);assert.equal(measured[1].wallMinusCpuMs,1.5);
});

test('held owned children qualify PID/starttime and actual affinity, join on startup/stop failures, and preserve exact PCM controls',{skip:process.platform!=='win32'},async()=>{
 const name='world12-current-process-control-'+randomUUID();await freezeProcessing12(name);
 const config={snapshot:name,preparation:'data-prepared',blocks:36,scene:'direct'};
 const reference=await runProcessingTrial12({...config,instrumented:false},{affinity:'restricted4'});
 assert.equal(reference.failure,null,JSON.stringify(reference.workers));assert.equal(reference.allChildrenJoined,true);assert.equal(reference.workers[0].affinity.startTimeQualified,true);assert.equal(reference.workers[0].affinity.actualMask,reference.workers[0].affinity.requestedMask);assert.equal(BigInt(reference.workers[0].affinity.actualMask).toString(2).replaceAll('0','').length,4);
 const absentPaths=structuredClone(reference.result);delete absentPaths.continuity.pathRows;assert.equal(compareProcessingPcm12(absentPaths,absentPaths).directAndReflectedPathsIdentical,false);
 const absentPhase=structuredClone(reference.result);delete absentPhase.continuity.sourceRows.find(r=>r.sources.length).sources[0].phaseHistorySha256;assert.equal(compareProcessingPcm12(absentPhase,absentPhase).phaseAndGrainHistoryIdentical,false);
 assert(reference.parentRuntime.stable);assert.equal(reference.parentRuntime.before.sha256,reference.parentRuntime.after.sha256);assert.equal(reference.parentRuntime.before.sha256,reference.result.runtime.execSha256);assert(reference.result.runtime.executable.stable);assert.equal(reference.result.runtime.executable.atHeldGate.sha256,reference.result.runtime.executable.before.sha256);assert.equal(reference.result.runtime.executable.before.sha256,reference.result.runtime.executable.after.sha256);assert(reference.parentRuntime.before.bytes<=128*1024*1024);
 assert(reference.result.records.every(r=>r.spans.length===0&&r.heapUsedBefore===null&&r.heapUsedAfter===null));assert.equal(reference.result.cpuSampling,null);assert.equal(reference.result.gcEvents.length,0);
 const instrumented=await runProcessingTrial12({...config,instrumented:true},{affinity:'normal'});
 assert.equal(instrumented.failure,null,JSON.stringify(instrumented.workers));assert(Object.values(compareProcessingPcm12(reference.result,instrumented.result)).every(Boolean));assert(instrumented.result.records.some(r=>r.spans.some(s=>s.name==='sourceSynthesis')));
 const startup=await runProcessingTrial12(config,{affinity:'restricted4',contention:1,failAfterContenderReady:1});
 assert.match(startup.failure,/injected owned contender startup failure/);assert.equal(startup.result,null);assert(startup.allChildrenJoined);assert.equal(startup.workers.length,2);assert(startup.workers.every(w=>w.joined&&w.affinity.startTimeQualified));
 const stop=await runProcessingTrial12(config,{affinity:'restricted4',contention:1,failStop:true});
 assert.equal(stop.result.records.length,36);assert.match(stop.failure,/contender completion qualification/);assert(stop.allChildrenJoined);assert(stop.workers.some(w=>w.stopSendError==='injected owned stop-send failure'));
 const artifact=path.join(root,'.local','world12-retention-control-'+randomUUID()+'.json');await fs.writeFile(artifact,JSON.stringify({kind:'RichAudioOriginalProcessingRetentionControls12',injectedFailure:true,reference,instrumented,startup,stop},null,2)+'\n',{flag:'wx'});
});

test('authored dismount retires running player scope, rejects NPC synthesis, reacquires generation two and preserves explicit engine stop/restart PCM',{skip:process.platform!=='win32'},async()=>{
 const name='world12-current-lifecycle-control-'+randomUUID();await freezeProcessing12(name);
 const config={snapshot:name,blocks:192,scene:'walls',lifecycle:true,texture:true,instrumented:false};
 const cold=await runProcessingTrial12({...config,preparation:'data-prepared'}),warm=await runProcessingTrial12({...config,preparation:'authored-jit'});
 assert.equal(cold.failure,null);assert.equal(warm.failure,null);assert(Object.values(compareProcessingPcm12(cold.result,warm.result)).every(Boolean));
 for(const result of [cold.result,warm.result]){
  assert.equal(result.continuity.sourceConstructions,2);assert.equal(result.lifecycle.scopeRetirements,1);
  assert.equal(result.lifecycle.lastRetirements[0].lastQualifiedRunning,true);assert.equal(result.lifecycle.lastRetirements[0].engineShutdownInferred,false);
  assert(result.observationSequence.some(r=>r.vehicles.some(v=>v.context==='npc'&&v.running)));
  assert(result.observationSequence.some(r=>r.vehicles.some(v=>v.context==='player'&&v.generation===2&&!v.running)));
  assert(result.observationSequence.some(r=>r.time>1.8&&r.vehicles.some(v=>v.context==='player'&&v.generation===2&&v.running)));
  const firsts=new Map();for(const row of result.continuity.sourceRows)for(const source of row.sources){assert(!source.identity.endsWith(':npc'));if(!firsts.has(source.sourceSerial))firsts.set(source.sourceSerial,{block:row.block,...source});}
  assert.equal(firsts.size,2);assert([...firsts.values()].every(s=>s.frame===512&&s.statsFrames===512));assert(firsts.get(2).identity.includes('bati:2:'));
  assert(result.continuity.sourceRows.some(r=>r.block>firsts.get(1).block&&r.block<firsts.get(2).block&&r.sources.length===0));
  assert(result.records.some(r=>r.reflectedPaths>0));assert.equal(result.sceneWorkers.workersStarted,result.sceneWorkers.workersJoined);assert.equal(result.limits.actualSourceWarmFrames,0);assert.equal(result.limits.pcmQueueFramesAdded,0);
 }
 await fs.writeFile(path.join(root,'.local','world12-lifecycle-control-'+randomUUID()+'.json'),JSON.stringify({kind:'RichAudioOriginalProcessingLifecycleControls12',cold,warm},null,2)+'\n',{flag:'wx'});
});
