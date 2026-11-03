import test from 'node:test';
import assert from 'node:assert/strict';
import {runBudgetWorkload042,summarizeDurations042,associateGc042,compareContinuity042,acousticBudgetMs042} from '../tools/Profile-AcousticBudget042.mjs';
import {createBudgetEngine042} from './fixtures/AcousticBudget042.mjs';

test('budget statistics retain every overrun and use the existing 512/48000 budget',()=>{
 assert.equal(acousticBudgetMs042,512/48000*1000);
 const values=[.8,84.8955,10.666666666666666,61.1894,.1],snapshot=[...values];
 const result=summarizeDurations042(values);
 assert.deepEqual(values,snapshot);assert.equal(result.calls,5);assert.equal(result.overBudget,2);assert.equal(result.p50Ms,10.666666666666666);assert.equal(result.maximumMs,84.8955);
 assert.deepEqual(summarizeDurations042([]),{calls:0,p50Ms:null,p99Ms:null,maximumMs:null,overBudget:0,blockBudgetMs:acousticBudgetMs042});
 for(const values of [[-1],[NaN],[Infinity]])assert.throws(()=>summarizeDurations042(values),/finite/);
});
test('GC associations use process-local interval overlap without inferring a cause',()=>{
 const rows=[{startMs:10,endMs:20},{startMs:20,endMs:25},{startMs:30,endMs:32}];
 const result=associateGc042(rows,[{startMs:12,endMs:14},{startMs:19,endMs:21},{startMs:25,endMs:26}]);
 assert.deepEqual(result.map(r=>r.gcTemporalOverlaps),[[{event:0,overlapMs:2},{event:1,overlapMs:1}],[{event:1,overlapMs:1}],[]]);
 assert.equal('gcTemporalOverlaps' in rows[0],false);
 assert.throws(()=>associateGc042([{startMs:2,endMs:1}],[]),/finite/);
});
test('constructor settings and source/renderer implementations remain unchanged by diagnostic wrappers',async()=>{
 const engine=createBudgetEngine042({profile:'constructor-defaults'});
 try{assert.deepEqual(engine.instance.settings,{quality:'auto',acceleration:'auto',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});}finally{engine.instance.close();}
 const options={blocks:36,coldBlocks:8,profile:'constructor-defaults'};
 const reference=await runBudgetWorkload042({...options,variant:'reference-direct'}),instrumented=await runBudgetWorkload042({...options,variant:'instrumented-direct'});
 assert.deepEqual(compareContinuity042(reference,instrumented),{dryPcmIdentical:true,stereoCompared:true,stereoPcmIdentical:true,framesIdentical:true,sourceCursorIdentical:true,sourceContinuity:true,nonzeroAuthoredOutput:true});
 assert.equal(reference.continuity.rendererFrames,36*512);assert.equal(reference.records.every(r=>r.stages===null),true);
 assert.equal(instrumented.records.length,36);assert.equal(instrumented.summary.cold.calls,8);assert.equal(instrumented.summary.later.calls,28);
 assert.equal(instrumented.records.every(r=>Object.values(r.stages).every(n=>Number.isFinite(n)&&n>=0)),true);
 const sourceCreation=instrumented.records.filter((r,i)=>r.sourceCreations>(instrumented.records[i-1]?.sourceCreations??0));assert.equal(sourceCreation.length,1);assert.equal(sourceCreation[0].sourceCreations,1);
 assert.equal(instrumented.records.filter(r=>r.stages.sourceConstructionMs>0).length,1);
 for(const r of instrumented.records)assert(Math.abs(Object.values(r.stages).reduce((a,b)=>a+b,0)-r.renderMs)<.00001);
 assert.equal(instrumented.installedResourcesRead,false);assert.equal(instrumented.endpointAccess,false);assert.equal(instrumented.privateBanksRead,false);
});
test('joined scene changes, unknown geometry, expiry and cancellation preserve dry PCM and source history',async()=>{
 const options={blocks:36,coldBlocks:8};
 const reference=await runBudgetWorkload042({...options,variant:'reference-direct'}),geometry=await runBudgetWorkload042({...options,variant:'instrumented-scene-churn'});
 const comparison=compareContinuity042(reference,geometry,{stereo:false});
 assert.deepEqual(comparison,{dryPcmIdentical:true,stereoCompared:false,stereoPcmIdentical:null,framesIdentical:true,sourceCursorIdentical:true,sourceContinuity:true,nonzeroAuthoredOutput:true});
 assert.equal(geometry.workers.workersStarted,geometry.workers.workersJoined);assert.equal(geometry.workers.cancelled,1);assert.equal(geometry.continuity.pcmQueueFramesAdded,0);
 assert.equal(geometry.continuity.historyAffectedFrames,0);assert.equal(geometry.continuity.limiterEvents,0);assert.equal(geometry.continuity.finalGeometry,'conditional-direct-unobserved-space-assumed-clear');
 assert(geometry.outsideRender.some(r=>r.kind==='joinedSceneWorkerPreparation'));assert(geometry.outsideRender.some(r=>r.kind==='cancelledSceneWorkerJoined'));
 const renderByBlock=new Map(geometry.records.map(r=>[r.block,r]));
 for(const outside of geometry.outsideRender.filter(r=>['joinedSceneWorkerPreparation','sceneAttachment','sceneInvalidation','sceneWithdrawal'].includes(r.kind)&&r.block>=0))assert(outside.endMs<=renderByBlock.get(outside.block).startMs,'joined worker/attachment/withdrawal duration is outside that block render');
 assert.equal(typeof geometry.eventLoop.delaySamples,'number');assert.match(geometry.gcLimit,/not causal/);
});
test('invalid workload limits fail before constructing a source or worker',async()=>{
 for(const options of [{blocks:35},{blocks:513},{coldBlocks:144},{profile:'installed'},{variant:'private-bank'}])await assert.rejects(runBudgetWorkload042(options),/bounded/);
});
