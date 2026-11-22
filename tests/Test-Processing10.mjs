import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcessingWorkload10,compareProcessingPcm10,runProcessingTrial10,profileProcessing10} from '../tools/Profile-Processing10.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import {processingContexts09} from './fixtures/Processing09.mjs';
import {budgetSession042,budgetWorld042} from './fixtures/AcousticBudget042.mjs';

test('prepared sources preserve late genuine eligibility, retirement, fresh reacquisition and every moving reflected PCM block',async()=>{
 const config={blocks:192,coldBlocks:24,profile:'fixed-cpu-balanced',scene:'walls',lifecycle:true};
 const reference=await runProcessingWorkload10({...config,mode:'current-cold',instrumented:false});
 assert(reference.records.every(row=>row.spans.length===1));
 for(const [mode,instrumented] of [['current-prepared',true],['current-prepared-jit',true],['current-prepared-jit',false]]){
  const trial=await runProcessingWorkload10({...config,mode,instrumented});
  const comparison=compareProcessingPcm10(reference,trial);
  assert(Object.values(comparison).every(Boolean),JSON.stringify(comparison));
  assert.equal(trial.continuity.sourceConstructions,2);
  const firsts=new Map();for(const row of trial.continuity.sourceRows)for(const source of row.sources)if(!firsts.has(source.sourceSerial))firsts.set(source.sourceSerial,{block:row.block,...source});
  assert.equal(firsts.size,2);assert([...firsts.values()].every(source=>source.frame===512&&source.statsFrames===512));
  assert(firsts.get(1).block*512/48000>=.35,'preparation cannot create the absent vehicle');
  assert(firsts.get(2).identity.includes('bati:2:'),'reacquisition must retain the new observation generation');
  const sourceRows=trial.continuity.sourceRows;
  assert(sourceRows.some(row=>row.block>firsts.get(1).block&&row.block<firsts.get(2).block&&row.sources.length===0),'source actually retires before reacquisition');
  assert(trial.records.some(row=>row.reflectedPaths>0),'the existing solver must supply actual authored-wall reflections');
  assert(trial.records.every(row=>row.overBudget===(row.renderMs>512/48000*1000)),'strict unchanged measured deadline');
  assert.equal(trial.beforeRender.sourceConstructions,0);assert.equal(trial.beforeRender.rendererFrame,0);
  assert.equal(trial.limits.sourcePreparationCpuIsolation,false);assert.equal(trial.limits.pcmQueueFramesAdded,0);
  assert.equal(trial.workers.workersStarted,trial.workers.workersJoined);
 }
});

test('joined original geometry preparation cancellation never publishes a cancelled scene',async()=>{
 const options={contexts:processingContexts09(),listenerAnchor:[-3,0,1],geometryTimeMs:0};
 const runtime=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});
 try{
  const preaborted=new AbortController();preaborted.abort();
  const before=await runtime.prepare({...options,signal:preaborted.signal});
  assert.equal(before.state,'cancelled');assert.equal(before.workerStarted,false);assert.equal(before.workerJoined,true);assert.equal(runtime.stats.workersStarted,0);
  const signal=new AbortController(),pending=runtime.prepare({...options,signal:signal.signal});signal.abort();
  const cancelled=await pending;assert.match(cancelled.state,/^cancelled/);assert.equal(cancelled.workerJoined,true);assert.equal(runtime.current(),null);
  assert.equal(runtime.stats.workersStarted,1);assert.equal(runtime.stats.workersJoined,1);assert.equal(runtime.stats.publications,0);
  const changed=runtime.prepare(options);await runtime.invalidate('7'.repeat(64));const invalidated=await changed;
  assert.match(invalidated.state,/^cancelled/);assert.equal(runtime.current(),null);assert.equal(runtime.stats.workersStarted,runtime.stats.workersJoined);
 }finally{await runtime.close();}
 const closing=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});
 const pending=closing.prepare(options);await closing.close();const result=await pending;
 assert.match(result.state,/^cancelled/);assert.equal(closing.current(),null);assert.equal(closing.stats.workersStarted,closing.stats.workersJoined);assert.equal(closing.stats.publications,0);
});

test('unsupported processing10 inputs fail before source construction or workers',async()=>{
 for(const config of [{mode:'installed'},{profile:'private-bank'},{scene:'gta'},{blocks:35},{blocks:513},{coldBlocks:144},{lifecycle:'yes'},{instrumented:'yes'},{snapshot:'../outside'}])await assert.rejects(runProcessingWorkload10(config),/bounded original processing10/);
 for(const count of [-1,5,Infinity,NaN,.5,'1'])await assert.rejects(runProcessingTrial10({mode:'current-cold'},count),/bounded direct contention count/);
 await assert.rejects(runProcessingTrial10({mode:'installed'},1),/bounded original processing10/);
});

test('synchronous and asynchronous owned stop-send failures retain actual data and always join bounded workers',async()=>{
 await fs.mkdir(new URL('../.local/',import.meta.url),{recursive:true});
 for(const stopSendFailure10 of ['sync','async']){
  const trial=await runProcessingTrial10({mode:'current-cold',profile:'fixed-cpu-balanced',scene:'direct',blocks:36},1,{stopSendFailure10});
  await fs.writeFile(new URL('../.local/world10-retention-control-'+randomUUID()+'.json',import.meta.url),JSON.stringify({kind:'RichAudioOriginalInjectedStopSendFailureControl10',injectedFailure:true,stopSendFailure10,actualOriginalWorkloadRetained:true,trial},null,2)+'\n',{flag:'wx'});
  assert.equal(trial.result.records.length,36);assert.equal(trial.contention.qualified,false);assert.match(trial.failure,/contention lifetime\/join qualification failed/);
  assert.equal(trial.contention.workers.length,1);assert(trial.contention.workers.every(worker=>worker.joined&&worker.stopSendError?.includes(stopSendFailure10==='sync'?'synchronous':'asynchronous')));
 }
});

test('owned contender startup failure joins its worker, retains the preceding real trial and stops without retry',async()=>{
 let calls=0;
 const result=await profileProcessing10({selectedModes:['current-cold'],selectedProfiles:['fixed-cpu-balanced'],repetitions:2,contentionCounts:[1],blocks:36},{trialRunner10:async(config,count)=>{
  calls++;return runProcessingTrial10(config,count,calls===2?{failAfterContentionReady10:1}:{});
 }});
 await fs.mkdir(new URL('../.local/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('../.local/world10-retention-control-'+randomUUID()+'.json',import.meta.url),JSON.stringify({kind:'RichAudioOriginalInjectedFailureControl10',injectedFailure:true,actualOriginalWorkloadRetained:true,report:result},null,2)+'\n',{flag:'wx'});
 assert.equal(result.completed,false);assert.equal(result.requestedTrials,4);assert.equal(result.trials.length,2);assert.equal(calls,2);
 assert.equal(result.trials[0].failure,null);assert.equal(result.trials[0].result.records.length,36,'actual completed measurements survive the later failure');
 const failure=result.trials[1];assert.match(failure.failure,/injected original contention startup failure/);assert.equal(failure.result,null);assert.equal(failure.pid,null,'render workload never starts after startup failure');
 assert.equal(failure.contention.workers.length,1);assert.equal(failure.contention.allJoined,true);assert.equal(failure.contention.qualified,false);
 assert(failure.contention.workers.every(worker=>worker.joined&&worker.startupFailureCleanup&&worker.messages.some(message=>message.kind==='ready')));
 assert.deepEqual(result.terminalFailure,{trial:1,reason:failure.failure,remainingTrialsStarted:false,automaticRetry:false});
});
