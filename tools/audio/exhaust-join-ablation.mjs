// One fixed offline experiment. No engine layer or production-renderer mutation.
import {performance} from 'node:perf_hooks';
import {validateAudio,sample} from '../../src/offline-audio/stock-source.mjs';
const preparedSet=new WeakSet(),rate=48000,frames=240000,value=21,seam=96,gain=0.15,edge=1200;
export function prepareAblation(audio,intervals){
  validateAudio(audio);
  if(audio.rate!==rate||audio.channels!==1||audio.data.length>rate*30||!Array.isArray(intervals)||intervals.length!==5)throw Error('five 48k mono intervals required');
  for(let i=0;i<intervals.length;i++){
    const r=intervals[i];if(!Number.isSafeInteger(r.index)||r.index<0||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<16||r.end<=r.start||r.end+seam*1.05+16>=audio.data.length||!Number.isFinite(r.state)||Math.abs(r.state-value)/value>0.02||i&&(r.index!==intervals[i-1].index+1||r.start!==intervals[i-1].end)||![2285,2286].every(n=>(r.end-r.start)/n>=0.95&&(r.end-r.start)/n<=1.05))throw Error('invalid/nonconsecutive/ineligible source interval');
    let energy=0;for(let n=r.start;n<r.end;n++)energy+=audio.data[n]**2;if(energy/(r.end-r.start)<1e-10)throw Error('silent source interval');
  }
  let clock=0,start=0;const schedule=[];
  while(start<frames){
    const ordinal=schedule.length,r=intervals[ordinal%5],end=Math.round(clock+rate/value),length=end-start,speed=(r.end-r.start)/length;
    if(ordinal>=105||length<=seam)throw Error('clock bound');
    const previous=schedule.at(-1),rawMismatch=Math.abs(sample(audio,r.start,0,speed)-sample(audio,previous?previous.sourceEnd:r.end,0,previous?previous.speed:speed));
    if(rawMismatch>0.25)throw Error('unsafe fixed join; no alternative selection');
    schedule.push(Object.freeze({ordinal,index:r.index,start,end,sourceStart:r.start,sourceEnd:r.end,sourceState:r.state,speed,
      boundary:ordinal===0?'start':ordinal%5===0?'wrap':'internal',rawMismatch}));
    clock+=rate/value;start=end;
  }
  if(start!==frames)throw Error('output extent');
  const prepared=Object.freeze({audio,schedule:Object.freeze(schedule),settings:Object.freeze({rate,frames,seconds:5,normalisedState:0.5,markerState:value,seam,gain,edge})});preparedSet.add(prepared);return prepared;
}
export function renderAblation(prepared,{omitInternalBlends=false}={}){
  if(!preparedSet.has(prepared)||typeof omitInternalBlends!=='boolean')throw Error('prepared explicit experiment required');
  validateAudio(prepared.audio);const started=performance.now(),data=new Float64Array(frames);let reads=0,internalOperations=0,wrapOperations=0;
  for(const row of prepared.schedule){
    const previous=prepared.schedule[row.ordinal-1],blend=previous&&(!omitInternalBlends||row.boundary==='wrap');
    if(blend){if(row.boundary==='internal')internalOperations++;else wrapOperations++;}
    for(let j=0;j<row.end-row.start;j++){
      // Same anchored, piecewise-continuous source path in A and B. Do not use
      // accumulated cursor addition: that would introduce unrelated rounding.
      let v=sample(prepared.audio,row.sourceStart+j*row.speed,0,row.speed);reads++;
      if(blend&&j<seam){const u=Math.sin(Math.PI/2*j/seam)**2;v=(1-u)*sample(prepared.audio,previous.sourceEnd+j*previous.speed,0,previous.speed)+u*v;reads++;}
      data[row.start+j]=v;
    }
  }
  for(let n=0;n<frames;n++){const fade=Math.min(1,n/edge,(frames-1-n)/edge);data[n]=fade===0?0:data[n]*gain*fade;}
  return {audio:{rate,channels:1,data},mode:omitInternalBlends?'B_continuous_internal':'A_existing_internal_joins',
    diagnostics:{renderMs:performance.now()-started,interpolationCalls:reads,internalBlendOperations:internalOperations,wrapBlendOperations:wrapOperations}};
}
function differenceStats(a,b,mask){
  let count=0,changed=0,ss=0,peak=0;for(let n=0;n<a.length;n++)if(mask(n)){const d=a[n]-b[n];count++;if(d!==0)changed++;ss+=d*d;peak=Math.max(peak,Math.abs(d));}
  return {samples:count,changedSamples:changed,maxAbsoluteDifference:peak,rmsDifference:count?Math.sqrt(ss/count):0};
}
export function compareAblation(prepared,a,b){
  if(!preparedSet.has(prepared))throw Error('prepared experiment required');
  for(const x of [a,b]){validateAudio(x);if(x.rate!==rate||x.channels!==1||x.data.length!==frames)throw Error('comparison extent');}
  const internalMask=new Uint8Array(frames),wrapMask=new Uint8Array(frames);
  for(const r of prepared.schedule){if(r.boundary==='internal')internalMask.fill(1,r.start,r.start+seam);if(r.boundary==='wrap')wrapMask.fill(1,r.start,r.start+seam);}
  const all=differenceStats(a.data,b.data,()=>true),internal=differenceStats(a.data,b.data,n=>internalMask[n]===1),unaffected=differenceStats(a.data,b.data,n=>internalMask[n]===0),wrap=differenceStats(a.data,b.data,n=>wrapMask[n]===1);
  if(unaffected.changedSamples||wrap.changedSamples)throw Error('confounded comparison: changes outside internal windows');
  return {all,internal,unaffected,wrap,internalBoundaries:prepared.schedule.filter(r=>r.boundary==='internal').length,wrapBoundaries:prepared.schedule.filter(r=>r.boundary==='wrap').length,
    quantisationResolutionGate:{affectedRmsAtLeastOneLsb:internal.rmsDifference>=1/32768,maxAtLeastTwoLsb:all.maxAbsoluteDifference>=2/32768,
      caution:'Numerical screening only; not a validated audibility threshold. No subjective comparison if differences vanish at PCM16.'}};
}
