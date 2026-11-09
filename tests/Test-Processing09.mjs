import test from 'node:test';
import assert from 'node:assert/strict';
import {intervalUnion09,accountSpans09,associateCpuSamples09,runProcessingWorkload09,compareProcessingPcm09,profileProcessing09} from '../tools/Profile-Processing09.mjs';

test('nested processing accounting retains exclusive residuals and GC overlap without double counting',()=>{
 const spans=[
  {id:0,parent:-1,name:'render',startMs:10,endMs:30,cpuStartUs:100,cpuEndUs:15100},
  {id:1,parent:0,name:'control',startMs:12,endMs:24,cpuStartUs:1100,cpuEndUs:11100},
  {id:2,parent:1,name:'solver',startMs:14,endMs:20,cpuStartUs:2100,cpuEndUs:7100},
  {id:3,parent:0,name:'renderer',startMs:25,endMs:29,cpuStartUs:11100,cpuEndUs:15100}
 ];
 const snapshot=structuredClone(spans),gc=[{startMs:15,endMs:18},{startMs:17,endMs:21},{startMs:40,endMs:41}];
 const measured=accountSpans09(spans,gc);
 assert.deepEqual(spans,snapshot);assert.equal(measured[0].wallMs,20);assert.equal(measured[0].childUnionMs,16);assert.equal(measured[0].exclusiveWallMs,4);
 assert.equal(measured[0].cpuMs,15);assert.equal(measured[0].exclusiveCpuMs,1);assert.equal(measured[0].wallMinusCpuMs,5);
 assert.equal(measured[0].gcTemporalUnionMs,6);assert.equal(measured[2].gcTemporalUnionMs,5);
 assert.equal(measured.reduce((n,s)=>n+s.exclusiveWallMs,0),20);
 assert.equal(measured.reduce((n,s)=>n+s.exclusiveCpuMs,0),15);
 assert.equal(intervalUnion09([{startMs:1,endMs:4},{startMs:3,endMs:5},{startMs:7,endMs:7}]),4);
 const quantized=accountSpans09([{id:0,parent:-1,name:'render',startMs:0,endMs:.001,cpuStartUs:0,cpuEndUs:2},{id:1,parent:0,name:'child',startMs:0,endMs:.001,cpuStartUs:0,cpuEndUs:3}]);
 assert.equal(quantized[0].exclusiveCpuMs,-.001,'negative quantized CPU residual must remain visible');assert.equal(quantized[0].wallMinusCpuMs,-.001);
 assert.throws(()=>accountSpans09([{...spans[0]},{...spans[1],endMs:31}]),/contained/);
 assert.throws(()=>accountSpans09([{...spans[0]},{...spans[1]},{...spans[2],parent:0}]),/parallel siblings/);
 assert.throws(()=>intervalUnion09([{startMs:2,endMs:1}]),/finite ordered/);
});

test('V8 sample anchors retain clock uncertainty and refuse invented per-phase CPU durations',()=>{
 const profile={startTime:100000,endTime:120000,nodes:[{id:1,callFrame:{functionName:'source',url:'file:///repo/src/acoustics/vehicle/stock-source.mjs',lineNumber:1,columnNumber:0}}],samples:[1,1,1],timeDeltas:[3000,3000,13000]};
 const anchors={startBeforeMs:10,startAfterMs:10.2,stopBeforeMs:30,stopAfterMs:30.2};
 const records=[{block:0,startMs:12,endMs:20,spans:[{name:'render',startMs:12,endMs:20},{name:'sourceConstruction',startMs:12,endMs:16.1}]}];
 const result=associateCpuSamples09(profile,anchors,records);
 assert.equal(result.mapped,true);assert(Math.abs(result.uncertaintyWidthMs-.2)<1e-6);
 assert.deepEqual(result.samples.map(s=>s.phase),['sourceConstruction','render','outside-render-or-boundary']);
 assert.equal('cpuMs' in result.samples[0],false);assert.equal(result.byStack['acoustics/vehicle/stock-source.mjs:source'],3);
 assert.equal(associateCpuSamples09(profile,{...anchors,stopBeforeMs:31,stopAfterMs:31.2},records).mapped,false);
});

test('diagnostic wrappers preserve every original default Bati PCM block and production history',async()=>{
 const config={blocks:36,coldBlocks:8,profile:'constructor-defaults'};
 const reference=await runProcessingWorkload09({...config,variant:'reference-direct'}),instrumented=await runProcessingWorkload09({...config,variant:'instrumented-direct'});
 assert.deepEqual(reference.settings,{quality:'auto',acceleration:'auto',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:false,airflowLevel:.35});
 assert.deepEqual(compareProcessingPcm09(reference,instrumented),{dryBitIdentical:true,stereoBitIdentical:true,everyBlockBitIdentical:true,framesIdentical:true,sourceCursorIdentical:true,continuous:true});
 assert.equal(reference.records.every(r=>r.spans.length===1),true);assert.equal(instrumented.records.length,36);
 assert.equal(instrumented.summary.cold.calls,8);assert.equal(instrumented.summary.later.calls,28);
 const all=instrumented.records.flatMap(r=>r.spans),names=new Set(all.map(s=>s.name));
 for(const name of ['sourceConstruction','sourceSynthesis','sourcePose','controlPreparation','acousticObserve','acousticUpdate','acousticPathPreparation','acousticPathCompletion','controlFilter','rendererAccept','pcmPipeline','pcmRenderer'])assert(names.has(name),name);
 assert.equal(all.filter(s=>s.name==='sourceConstruction').length,1);
 for(const r of instrumented.records){assert(Math.abs(r.spans.reduce((n,s)=>n+s.exclusiveWallMs,0)-r.renderMs)<1e-6);assert(Math.abs(r.spans.reduce((n,s)=>n+s.exclusiveCpuMs,0)-r.cpuMs)<1e-6);assert.equal(r.overBudget,r.renderMs>512/48000*1000);}
 assert.equal(instrumented.dispatchProbes.length,36);assert(instrumented.dispatchProbes.every(p=>p.delayMs>=0&&p.callbackMs>=p.requestedMs));
 assert(instrumented.cpuSampling.profile.samples.length>0);assert.equal(instrumented.cpuSampling.association.mapped,true);
 assert.match(instrumented.limits.scheduling,/OS scheduler\/descheduling cause remains unavailable/);assert.match(instrumented.limits.gc,/not proof/);
 assert.equal(instrumented.limits.blockBudgetChanged,false);assert.equal(instrumented.limits.fixedPcmQueueAdded,false);assert.equal(instrumented.limits.endpointOpened,false);assert.equal(instrumented.limits.privateBanksRead,false);assert.equal(instrumented.limits.installedResourcesRead,false);
});

test('authored reflected scene separates visibility and causal work while preserving bit exact original PCM',async()=>{
 const config={blocks:36,coldBlocks:8,profile:'fixed-cpu-balanced'};
 const reference=await runProcessingWorkload09({...config,variant:'reference-walls'}),instrumented=await runProcessingWorkload09({...config,variant:'instrumented-walls'});
 assert.deepEqual(compareProcessingPcm09(reference,instrumented),{dryBitIdentical:true,stereoBitIdentical:true,everyBlockBitIdentical:true,framesIdentical:true,sourceCursorIdentical:true,continuous:true});
 assert.equal(instrumented.workers.workersStarted,instrumented.workers.workersJoined);assert.equal(instrumented.workers.pcmQueueFramesAdded,0);
 assert(instrumented.records.some(r=>r.reflectedPaths>0),'real solver first-order paths must be exercised by original finite geometry');
 const names=new Set(instrumented.records.flatMap(r=>r.spans.map(s=>s.name)));
 assert(names.has('acousticVisibility'));assert(names.has('acousticVisibilityCpu'));assert(instrumented.records.every(r=>r.surfaces===1));
 const first=instrumented.records[0].startMs;assert(instrumented.outsideRender.every(r=>r.endMs<=first),'worker construction/attachment stays outside timed renders');
});

test('processing profile rejects unsupported configurations before starting work',async()=>{
 for(const input of [{blocks:35},{blocks:513},{coldBlocks:144},{variant:'installed'},{profile:'private-bank'}])await assert.rejects(runProcessingWorkload09(input),/bounded original/);
 await assert.rejects(profileProcessing09({selectedProfiles:['constructor-defaults','constructor-defaults']}),/bounded processing09/);
});
