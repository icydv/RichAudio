import test from 'node:test';import assert from 'node:assert/strict';
import {coldHistorySnapshot01 as snapshot,firstColdHistoryDifference01 as difference,recomputeColdFeature01} from '../tools/cold-npc-history01.mjs';
test('cold diagnostic detects a changed legacy sample, history field, own-property presence and signed zero exactly',()=>{
 const state={samples:Float32Array.of(0,.1,-.2),phase:0,clockCycles:2,head:undefined},reference=snapshot(state);
 for(const change of [x=>x.samples[1]+=.00001,x=>x.phase=.00001,x=>x.clockCycles++,x=>delete x.head,x=>x.phase=-0]){const next=structuredClone(state);change(next);assert.ok(difference(reference,snapshot(next)));}
 assert.equal(difference(reference,snapshot(structuredClone(state))),null);
});
test('cold diagnostic observes alias identities instead of mistaking an equal copy for a shared feature object',()=>{
 const feature={rms:.3},shared={idle:{features:[feature]},accel:{features:[feature]}},copied=structuredClone(shared);copied.accel.features[0]={rms:.3};
 assert.ok(difference(snapshot(shared),snapshot(copied)));assert.equal(difference(snapshot(shared),snapshot(structuredClone(shared))),null);
});
test('fractional long-loop endpoint retains its exact integer sample population and normalisation length',()=>{
 const values=Float32Array.of(0,1,0,-1,0,1),r=recomputeColdFeature01(values,{start:1,end:4.25,length:3.25});
 assert.equal(r.count,4);assert.equal(r.lastIndex,4);assert.equal(r.energy,2);assert.equal(r.feature.rms,Math.sqrt(2/3.25));assert.equal(r.feature.detailRatio,Math.sqrt(3/2));
});
