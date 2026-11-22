import assert from 'node:assert/strict';
import test from 'node:test';
import {StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {encodeVehicleRa07} from '../src/acoustics/vehicle/pipeline.mjs';
import {ClockedFleetPcmWitness} from '../src/acoustics/vehicle/clocked-fleet-pcm-witness.mjs';
import {verifyClockedContributors} from '../tools/Analyze-ClockedContributors.mjs';

test('original frame leases on either interpolation endpoint constrain an emitted block',()=>{
  const witness=new ClockedFleetPcmWitness(2,2);
  const frame=(sequence,validThroughTicks)=>({frame:{listener:{sequence,clockFrequency:1000},validThroughTicks}});
  const snapshots=[frame(1,1020),frame(2,1090),frame(3,1220)];
  assert.equal(witness.controlDeadline(snapshots,1,2,1000),1020);
  snapshots[0].frame.validThroughTicks=0;
  assert.equal(witness.controlDeadline(snapshots,1,2,1000),1090);
  snapshots[1].frame.validThroughTicks=0;
  assert.equal(witness.controlDeadline(snapshots,1,2,1000),1220);
  assert.equal(witness.controlDeadline(snapshots,1,2,900),1150);
});

test('opposite engine and exhaust pressure in one car cannot qualify a contributor',()=>{
  const ids=['stock:slot0:engine','stock:slot0:exhaust','stock:slot1:engine'];
  const renderer=new StreamingRenderer({sourceIds:ids,maxPathsPerSource:1,generationReleaseGuard:true});
  const witness=new ClockedFleetPcmWitness(2,renderer.slots.length);
  renderer.pcmWitness=witness;
  const control={frame:0,sourceGenerations:Object.fromEntries(ids.map(id=>[id,2])),
    paths:ids.map((sourceId,i)=>({id:sourceId,sourceId,generation:2,emissionFrame:0,rate:1,
      bands:[.3,.3,.3],pan:0,order:i===1?3:0}))};
  renderer.accept(control);
  const engine={pipeline:{renderer,lastControl:control},slots:[0,1].map(index=>({
    index,generation:2,source:{},vehicle:{id:'car-'+index,generation:1,model:1,context:'npc'}}))};
  const input=Object.fromEntries(ids.map((id,i)=>[id,new Float32Array(512).fill(i===1?-.125:.125)]));
  const l=new Float32Array(512),r=new Float32Array(512);
  renderer.process(input,l,r);
  const row=witness.record(engine,encodeVehicleRa07(l,r,0));
  assert.equal(row.activeContributors,1);
  assert.deepEqual(row.contributors.map(v=>v.id),['car-1']);
  assert.deepEqual(row.nonzeroPathsByOrder,[2,0,0,1]);
});

test('callback proof stops at the first missing frame and retains source-specific expiry',()=>{
  const car={id:'old-observation',generation:1,acquisition:2,rendererGeneration:12,slot:0,model:1,context:'npc',
    active:true,present:true,left:.125,right:0,withoutLeft:0,withoutRight:0,
    reflectedPaths:2,releasingPaths:0,oldestDryObservationQpc:850,earliestDryDeadlineQpc:1100,unknownDryTaps:0,
    limitingTap:{observedQpc:850,deadlineQpc:1100,selectionAgeMs:80,selectionMarginMs:170,flightFrames:2400,kind:'reflected'}};
  const rows=Array.from({length:4},(_,block)=>({block,frame:block*512,packetLeft:.125,packetRight:0,packetMatches:true,
    unboundPaths:0,activeContributors:1,reflectedPaths:2,contributors:[car]}));
  const samples=new Float32Array(3840);
  for(const i of [0,512,1024,1536])samples[i*2]=.125;
  const callbacks=[{firstSinkFrame:0,firstProducerFrame:0,requested:960,supplied:960,startQpc:1020,endQpc:1030},
    {firstSinkFrame:960,firstProducerFrame:960,requested:960,supplied:510,startQpc:1120,endQpc:1130}];
  const host={publicationClockFrequency:1000,underflowFrames:450,firstUnderflowFrame:1470,consumedFrames:1920};
  const run=()=>verifyClockedContributors({host,callbacks,rows,frames:1920,
    stereoAt:frame=>samples.subarray(frame*2,frame*2+2),phases:[],admissions:[{block:2,admissionQpc:1080}]});
  let result=run();
  assert.equal(result.exactPacketSamples,3);
  assert.equal(result.identities[0].dryDeadlinePassedAtCallbackStartSamples,1);
  assert.equal(result.identities[0].strictFreshAtCallbackEndSamples,2);
  assert.deepEqual(result.identities[0].worstLateTap,{block:2,sinkFrame:1024,kind:'reflected',pastDeadlineMs:20,
    selectionOlderBracketAgeMs:80,selectionMarginMs:170,modeledFlightMs:50,
    observationToRingAdmissionMs:230,admissionToCallbackStartMs:40,observationToCallbackStartMs:270});
  assert.equal(result.witnessesOutsideQualifiedCapture,1);
  samples[1024*2]=0;
  result=run();
  assert.equal(result.exactPacketSamples,2);
  assert.equal(result.sinkPcmMismatches,1);
  assert.equal(result.identities[0].dryDeadlinePassedAtCallbackStartSamples,0);
});

test('post-delay stereo identifies all five voices and keeps the departing release separate from slot reuse',()=>{
  const sources=Array.from({length:5},(_,i)=>'stock:slot'+i+':engine');
  const config={sourceIds:sources,maxPathsPerSource:2,generationReleaseGuard:true,masterGain:.175};
  const renderer=new StreamingRenderer(config),baseline=new StreamingRenderer(config);
  const witness=new ClockedFleetPcmWitness(16,renderer.slots.length);
  renderer.pcmWitness=witness;
  const slots=sources.map((id,index)=>({index,generation:2,identity:'car-'+index+'-life-1',
    source:{},vehicle:{id:'car-'+index,generation:1,model:12,context:'npc',acquisition01:index+1}}));
  const phase=[];
  for(let block=0;block<15;block++){
    const frame=block*512,paths=[],generations={};
    const inputs=Object.fromEntries(sources.map((id,i)=>[id,new Float32Array(512).fill((1+i)*.004)]));
    if(block===9)Object.assign(slots[4],{source:null,vehicle:null,identity:null});
    if(block===10)Object.assign(slots[4],{generation:3,source:{},identity:'car-4-life-2',
      vehicle:{id:'car-4',generation:2,model:12,context:'npc',acquisition01:6}});
    if(block>=9)inputs[sources[4]].fill(0);
    for(const slot of slots)if(slot.source)slot.vehicle.observationTicks=10000+block*10-slot.index*7;
    for(const slot of slots)if(slot.source){
      const id=sources[slot.index],generation=4294967296+slot.generation;
      generations[id]=generation;
      for(let order=0;order<2;order++)paths.push({id:id+':'+order+':g'+generation,sourceId:id,
        generation,emissionFrame:frame-700-order*40,rate:1,bands:[.3,.2,.1],pan:slot.index*.3-.6,order});
    }
    const control={frame,paths,sourceGenerations:generations};
    const engine={pipeline:{renderer,lastControl:control},slots,
      snapshots:[{frame:{listener:{clockFrequency:1000},validThroughTicks:10000+block*10+240}}]};
    for(const r of [renderer,baseline])r.accept(control);
    const render=r=>{const l=new Float32Array(512),h=new Float32Array(512);r.process(inputs,l,h);return [l,h];};
    const output=render(renderer);
    assert.deepEqual(output,render(baseline));
    const packet=encodeVehicleRa07(...output,block);
    phase.push(witness.record(engine,packet));
  }
  assert.equal(phase[0].activeContributors,0,'allocated paths with missing history are silent');
  assert.equal(phase[8].activeContributors,5);
  assert.equal(phase[8].reflectedPaths,5);
  assert.equal(phase[8].contributors.length,5);
  assert(phase.every(row=>row.packetMatches&&row.unboundPaths===0));
  const before=phase[8].contributors.find(v=>v.id==='car-4');
  assert.equal(before.oldestDryObservationQpc,10032,'delayed PCM came from the sixth emitted block for this acquisition');
  assert.equal(before.earliestDryDeadlineQpc,10282,'one older source keeps its own 250ms cutoff');
  assert.equal(before.limitingTap.flightFrames,740,'retain the longest modeled flight tied for this earliest cutoff');
  assert.equal(before.dryDeadlineByPath.direct,10282);
  assert.equal(before.dryDeadlineByPath.reflected,10282);
  assert(phase[8].contributors.every(v=>v.unknownDryTaps===0));
  const release=phase[9].contributors.find(v=>v.id==='car-4');
  assert.equal(release.acquisition,before.acquisition);
  assert.equal(release.active,false);
  assert.equal(release.releasingPaths,2);
  assert(release.dryDeadlineByPath.release>0 && release.dryDeadlineByPath.direct===null);
  for(const row of phase.slice(11)){
    assert.equal(row.activeContributors,4);
    assert(!row.contributors.some(v=>v.id==='car-4'),'new silent life cannot inherit the old PCM, and old tails end within 960 frames');
    assert.deepEqual(row.contributors.map(v=>v.acquisition).sort(),[1,2,3,4]);
  }
  assert.equal(witness.summary().packetMismatches,0);
  assert.equal(witness.summary().maximumActiveContributors,5);
});
