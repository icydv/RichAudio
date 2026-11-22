import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {replayMappedPaths} from './mapped-drive-render.mjs';
import {writeStereoWave,sha256} from './powertrain-drive.mjs';
import {vehicleBlockFrames as frames,vehicleSampleRate as rate} from '../../src/acoustics/vehicle/pipeline.mjs';

const energy = (a,b) => a*a+b*b;
// Propagation encodes the scene epoch in the high word. The independent
// stock voice generation and slot together identify the dry emitter.
const keyOf = (source,generation) => source+'@'+(generation % 4294967296);
function maximumDifference(a,b,first=0,end=a[0].length) {
 let peak = 0;
 for (let side=0;side<2;side++) for (let i=first;i<end;i++) peak = Math.max(peak,Math.abs(a[side][i]-b[side][i]));
 return peak;
}

export function measureTrafficContributions(take,directory) {
 const blocks = take.records.map(row=>({sampleFrame:row.control.frame,voices:[]}));
 const voiceEntries = Object.entries(take.receipt.voices);
 assert.equal(voiceEntries.length,6);
 const samples = take.channels[0].length, sources = new Map(), report = {}, stems = new Map();
 const tracks = path.join(directory,'stems');
 fs.mkdirSync(tracks);
 for (const [key,v] of voiceEntries) for (const source of v.source) {
  const sourceKey = keyOf(source,v.renderGeneration);
  assert(!sources.has(sourceKey),'Render generation is shared across vehicle lifetimes');
  sources.set(sourceKey,key);
 }
 const replay = keep => replayMappedPaths(take,null,null,keep,{save:false});
 assert.deepEqual(replay(()=>true).channels,take.channels,'Offline reconstruction must match every original mixed sample');
 for (const [key,v] of voiceEntries) {
  const owned = p=>sources.get(keyOf(p.sourceId,p.generation))===key;
  const isolated = replay(owned), omitted = replay(p=>!owned(p));
  const channels = isolated.channels;
  stems.set(key,channels);
  let last = -1, first = -1, square = 0, peak = 0, nullPeak = 0;
  for (const block of blocks) {
   let nonzeroFrames = 0, pcmPeak = 0;
   for (let i=block.sampleFrame;i<block.sampleFrame+frames;i++) {
    const l=channels[0][i],r=channels[1][i];
    if (l!==0||r!==0) {
     nonzeroFrames++;
     if (first<0) first=i;
     last=i;
    }
    pcmPeak = Math.max(pcmPeak,Math.abs(l),Math.abs(r));
    square += energy(l,r);
    for (let side=0;side<2;side++)
     nullPeak=Math.max(nullPeak,Math.abs((take.channels[side][i]-omitted.channels[side][i])-channels[side][i]));
   }
   if (nonzeroFrames) block.voices.push({vehicle:v.vehicle,generation:v.generation,renderGeneration:v.renderGeneration,
    engine:v.source[0],exhaust:v.source[1],nonzeroFrames,pcmPeak,releasing:block.sampleFrame >= (v.lastBlock+1)*frames});
   peak = Math.max(peak,pcmPeak);
  }
  assert(peak>1e-7 && nullPeak<1e-7,'Withdrawing the vehicle must remove its propagated stereo contribution');
  const file = 'stems/'+key+'.wav';
  report[key]={file,sha256:writeStereoWave(path.join(directory,file),channels),firstNonzeroFrame:first,lastNonzeroFrame:last,peak,
   wholeTakeRms:Math.sqrt(square/(2*samples)),ablationNullPeak:nullPeak,matchedSurvivingSlots:omitted.comparedSlots};
 }
 const original = voiceEntries.filter(([,v])=>v.generation===1).map(([k])=>k);
 let start=0,bestStart=0,bestLength=0,wholeMixNullPeak=0;
 for (let i=0;i<samples;i++) {
  const all = original.every(key=>stems.get(key)[0][i]!==0 || stems.get(key)[1][i]!==0);
  if (!all) start=i+1;
  else if (i-start+1>bestLength) {bestStart=start;bestLength=i-start+1;}
  for (let side=0;side<2;side++) {
   let sum=0;
   for (const channels of stems.values()) sum+=channels[side][i];
   wholeMixNullPeak=Math.max(wholeMixNullPeak,Math.abs(sum-take.channels[side][i]));
  }
 }
 assert(bestLength>=rate/2 && wholeMixNullPeak<1e-7);
 const overlap = {firstFrame:bestStart,lastFrame:bestStart+bestLength-1,frames:bestLength,voiceKeys:original,levelByVoice:{}};
 for (const key of original) {
  let square=0;
  const [left,right]=stems.get(key);
  for (let i=bestStart;i<bestStart+bestLength;i++) square+=energy(left[i],right[i]);
  overlap.levelByVoice[key]=Math.sqrt(square/(2*bestLength));
 }
 const previous = take.receipt.voices['returning-traffic@1'], next = take.receipt.voices['returning-traffic@2'];
 const release = (previous.lastBlock+1)*frames, lastTail = report['returning-traffic@1'].lastNonzeroFrame;
 assert(previous.slot===next.slot && previous.renderGeneration!==next.renderGeneration && lastTail>=release && lastTail-release<960);
 const continuing = original.filter(k=>k!=='returning-traffic@1');
 const surviving = blocks.filter(b=>b.sampleFrame>=release && b.sampleFrame<next.firstBlock*frames);
 assert(surviving.length && surviving.every(b=>continuing.every(key=>b.voices.some(w=>w.vehicle+'@'+w.generation===key))));
 const mutedHistory = take.records.map((record,i)=>{
  if(i<previous.firstBlock || i>previous.lastBlock) return record;
  const pcm={...record.pcm};
  for (const id of previous.source) delete pcm[id];
  return {...record,pcm};
 });
 const changed = replayMappedPaths({...take,records:mutedHistory},null,null,()=>true,{save:false});
 const changedBefore = maximumDifference(take.channels,changed.channels,previous.firstBlock*frames,release);
 const afterRecycle = maximumDifference(take.channels,changed.channels,next.firstBlock*frames);
 assert(changedBefore>1e-7 && afterRecycle===0,'Muting the retired dry history must leave the recycled mix exactly unchanged');
 const ledger = JSON.stringify({schema:1,blockFrames:frames,sampleRate:rate,blocks})+'\n';
 const file='pcm-contributors.json';
 fs.writeFileSync(path.join(directory,file),ledger,{flag:'wx'});
 return {overlap,contributions:{file,sha256:sha256(ledger),voices:report,wholeMixNullPeak},retirement:{
  removedVehicle:previous.vehicle,lastActiveBlock:previous.lastBlock,releaseFrame:release,lastNonzeroFrame:lastTail,
  nonzeroReleaseSpan:lastTail-release+1,policyLimitFrames:960,continuedVehicles:continuing,survivorBlocks:surviving.length,
  newVoiceFirstBlock:next.firstBlock,sharedSlot:next.slot,sourceGenerations:[previous.renderGeneration,next.renderGeneration],
  oldHistoryMuteMaxDifferenceBeforeRemoval:changedBefore,oldHistoryMuteMaxDifferenceAfterRecycle:afterRecycle}};
}
