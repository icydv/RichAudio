import test from 'node:test';
import assert from 'node:assert/strict';
import {cpuSampleTemporalQualification12} from '../tools/Summarize-Processing12.mjs';
const fixture=()=>({profile:{nodes:[{id:1},{id:2}],samples:[1,2],timeDeltas:[10,20],startTime:100,endTime:200},mapping:{mapped:true,offsetBoundsMs:{lower:0,upper:.2}}});
test('disabled CPU collection is distinct from a collected and qualified diagnostic timeline',()=>{
 assert.deepEqual(cpuSampleTemporalQualification12(null),{collected:false,temporalAttributionQualified:false,reasonCodes:['not-collected'],negativeIntervals:[]});
 const qualified=cpuSampleTemporalQualification12(fixture());assert(qualified.collected);assert(qualified.temporalAttributionQualified);assert.deepEqual(qualified.reasonCodes,[]);
});
test('a signed negative interval is retained exactly and disqualifies temporal sample attribution',()=>{
 const input=fixture();input.profile.timeDeltas[1]=-74;const before=structuredClone(input),result=cpuSampleTemporalQualification12(input);
 assert.equal(result.collected,true);assert.equal(result.temporalAttributionQualified,false);assert.deepEqual(result.negativeIntervals,[{sampleIndex:1,valueUs:-74}]);assert(result.reasonCodes.includes('negative-sample-interval'));assert.deepEqual(input,before);
});
test('missing clocks, malformed intervals, duplicate IDs and unmatched samples cannot qualify',()=>{
 for(const change of [x=>delete x.profile,x=>x.profile.nodes.push({id:1}),x=>x.profile.nodes=[null],x=>x.profile.samples[0]=99,x=>x.profile.timeDeltas.pop(),x=>x.profile.timeDeltas[0]=NaN,x=>x.profile.timeDeltas=[60,60],x=>x.profile.endTime=0,x=>x.mapping.mapped=false,x=>x.mapping.offsetBoundsMs.lower=1]){
  const input=fixture();change(input);assert.equal(cpuSampleTemporalQualification12(input).temporalAttributionQualified,false);
 }
});
test('empty sample data does not fabricate temporal evidence',()=>{
 const input=fixture();input.profile.samples=[];input.profile.timeDeltas=[];const result=cpuSampleTemporalQualification12(input);assert.equal(result.temporalAttributionQualified,false);assert(result.reasonCodes.includes('no-samples'));
});
