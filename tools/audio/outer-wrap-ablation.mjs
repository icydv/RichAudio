// Fixed signal-level ablation; the P2-03.6 renderer and defaults stay untouched.
import {performance} from 'node:perf_hooks';
import {validateAudio,sample,measure} from '../../src/offline-audio/stock-source.mjs';
import {renderAblation} from './exhaust-join-ablation.mjs';
import {spectrum} from './decel-analysis.mjs';
export function renderOuterWrap(prepared,{omitOuterBlends=false}={}){
  if(typeof omitOuterBlends!=='boolean')throw Error('explicit boolean wrap mode required');
  const started=performance.now(),reference=renderAblation(prepared,{omitInternalBlends:true}),patchStart=performance.now();let overwritten=0;
  if(omitOuterBlends)for(const r of prepared.schedule.filter(r=>r.boundary==='wrap'))for(let j=0;j<prepared.settings.seam;j++){
    const n=r.start+j,fade=Math.min(1,n/prepared.settings.edge,(prepared.settings.frames-1-n)/prepared.settings.edge);
    reference.audio.data[n]=sample(prepared.audio,r.sourceStart+j*r.speed,0,r.speed)*prepared.settings.gain*fade;overwritten++;
  }
  return {audio:reference.audio,mode:omitOuterBlends?'B_outer_blends_removed':'A_existing_outer_wraps',
    diagnostics:{renderMs:performance.now()-started,sharedReferenceRenderMs:reference.diagnostics.renderMs,overwriteMs:performance.now()-patchStart,
      actualInterpolationCalls:reference.diagnostics.interpolationCalls+overwritten,overwrittenSamples:overwritten,
      signalWrapBlends:omitOuterBlends?0:reference.diagnostics.wrapBlendOperations,computedReferenceWrapBlends:reference.diagnostics.wrapBlendOperations,
      note:'B includes a fresh reference computation whose wrap results are overwritten. Actual computation counts include that discarded work; not an optimisation benchmark.'}};
}
function stats(a,b,predicate){let count=0,changed=0,ss=0,peak=0;for(let n=0;n<a.length;n++)if(predicate(n)){const d=a[n]-b[n];count++;if(d!==0)changed++;ss+=d*d;peak=Math.max(peak,Math.abs(d));}return {samples:count,changedSamples:changed,maxAbsoluteDifference:peak,rmsDifference:count?Math.sqrt(ss/count):0};}
function local(a,n){let ss=0,maxStep=0;for(let j=n-64;j<n+192;j++){ss+=a[j]**2;if(j>n-64)maxStep=Math.max(maxStep,Math.abs(a[j]-a[j-1]));}return {before:a[n-1],after:a[n],signedStep:a[n]-a[n-1],absoluteStep:Math.abs(a[n]-a[n-1]),maximumLocalStep:maxStep,localRms:Math.sqrt(ss/256)};}
function spectral(a,b,n){const x=spectrum(a,n-2048),y=spectrum(b,n-2048);let energy=0,diff=0;for(let k=1;k<=2048;k++){energy+=x.re[k]**2+x.im[k]**2;diff+=(x.re[k]-y.re[k])**2+(x.im[k]-y.im[k])**2;}return energy>1e-20?Math.sqrt(diff/energy):null;}
export function inspectOuterWrap(prepared,a,b){
  const {frames,rate,seam,gain,edge}=prepared.settings??{};
  if(frames!==240000||rate!==48000||seam!==96||gain!==0.15||edge!==1200||!Array.isArray(prepared.schedule)||prepared.schedule.length!==105)throw Error('fixed wrap experiment required');
  for(const audio of [a,b]){validateAudio(audio);if(audio.data.length!==frames||audio.rate!==rate||audio.channels!==1)throw Error('wrap comparison layout');}
  const mask=new Uint8Array(frames),internal=new Uint8Array(frames),wraps=prepared.schedule.filter(r=>r.boundary==='wrap');
  if(wraps.length!==20||prepared.schedule.filter(r=>r.boundary==='internal').length!==84)throw Error('wrap plan count');
  for(let i=0;i<prepared.schedule.length;i++){const r=prepared.schedule[i];if(r.ordinal!==i||r.start!==Math.round(i*48000/21)||r.end!==Math.round((i+1)*48000/21)||r.boundary!==(i===0?'start':i%5===0?'wrap':'internal'))throw Error('invalid wrap plan');
    if(r.boundary==='wrap'){if(r.start<edge+2048||r.start+2048>=frames-edge)throw Error('wrap analysis extent');mask.fill(1,r.start,r.start+seam);}if(r.boundary==='internal')internal.fill(1,r.start,r.start+seam);
  }
  const rows=wraps.map(r=>{const previous=prepared.schedule[r.ordinal-1],fade=Math.min(1,r.start/edge,(frames-1-r.start)/edge),naturalContinuation=sample(prepared.audio,previous.sourceEnd,0,previous.speed)*gain*fade;
    let directTargetErrorB=0;for(let j=0;j<seam;j++){const n=r.start+j,f=Math.min(1,n/edge,(frames-1-n)/edge),target=sample(prepared.audio,r.sourceStart+j*r.speed,0,r.speed)*gain*f;directTargetErrorB=Math.max(directTargetErrorB,Math.abs(b.data[n]-target));}
    return {ordinal:r.ordinal,frame:r.start,endFrame:r.start+seam,sourceEnd:previous.sourceEnd,targetStart:r.sourceStart,endpointJump:r.sourceStart-previous.sourceEnd,
      previousReadRate:previous.speed,currentReadRate:r.speed,rateStep:r.speed-previous.speed,A:local(a.data,r.start),B:local(b.data,r.start),
      naturalContinuation,directTargetErrorB,addedSpliceResidualA:Math.abs(a.data[r.start]-naturalContinuation),addedSpliceResidualB:Math.abs(b.data[r.start]-naturalContinuation),relativeComplexSpectrumDifference:spectral(a.data,b.data,r.start)};});
  const all=stats(a.data,b.data,()=>true),targeted=stats(a.data,b.data,n=>mask[n]===1),unaffected=stats(a.data,b.data,n=>mask[n]===0),internalWindows=stats(a.data,b.data,n=>internal[n]===1);
  if(unaffected.changedSamples||internalWindows.changedSamples)throw Error('confounded wrap experiment: changes outside wrap windows');
  const measuredA=measure(a),measuredB=measure(b),limit=0.25*gain,allowance=1/32768;
  const excessive=rows.filter(r=>r.addedSpliceResidualB>limit+allowance),reasons=[];
  if(measuredA.clippedSamples||measuredB.clippedSamples)reasons.push('clipping');if(measuredA.allZero||measuredB.allZero||measuredA.silent20msWindows||measuredB.silent20msWindows)reasons.push('unexpected silence');if(excessive.length)reasons.push('excessive added discontinuity versus natural continuation');if(rows.some(r=>r.directTargetErrorB>allowance))reasons.push('candidate deviates from unchanged direct target');
  return {all,targeted,unaffected,internalWindows,rows,measurements:{A:measuredA,B:measuredB},
    safety:{passed:reasons.length===0,reasons,addedSpliceResidualLimit:limit,pcmAllowance:allowance,maxAddedSpliceResidualB:Math.max(...rows.map(r=>r.addedSpliceResidualB)),
      basis:'Retain the existing raw 0.25 continuation-mismatch bound, scaled by the unchanged gain. Compare to natural continuation, never reject a natural derivative. Technical screen, not a universal audibility threshold.'},
    resolution:{meaningfulAtPcm16:targeted.rmsDifference>=1/32768&&all.maxAbsoluteDifference>=2/32768,note:'Resolution check only, not perceptual acceptance'}};
}
