// Bounded offline second-state research. Historical renderers/defaults are untouched.
import {eligibleIntervals} from './granular-model-analysis.mjs';
import {validateAudio,sample,measure} from '../../src/offline-audio/stock-source.mjs';
import {performance} from 'node:perf_hooks';
import {spectrum} from './decel-analysis.mjs';
export const selectionRule=Object.freeze({version:1,states:'integers 14 through 28, excluding 21',minimumIntervals:3,maximumIntervals:16,
  eligibility:'source state 14–28, requested-state error <=2%, both rounded event-length rates 0.95–1.05, existing interpolation/continuation margins',
  order:'greatest absolute distance from 21; longest consecutive run; greatest minimum state/rate margin; lower state; lower first interval index',
  noFallback:'Selection uses metadata only. Waveform safety is tested after selection; failure never selects another state.'});
const RATE=48000,FRAMES=240000,SEAM=96,GAIN=.15,EDGE=1200;
function validMarkers(grains,sourceFrames){
  if(!Number.isSafeInteger(sourceFrames)||sourceFrames<32||sourceFrames>RATE*30||!Array.isArray(grains)||grains.length<4||grains.length>1024)throw Error('marker/source extent');
  for(let i=0;i<grains.length;i++){const g=grains[i];if(!Number.isSafeInteger(g.UnkUint1)||g.UnkUint1<0||g.UnkUint1>=sourceFrames||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||i&&g.UnkUint1<=grains[i-1].UnkUint1)throw Error('invalid marker');}
}
export function selectSecondState(grains,sourceFrames){
  validMarkers(grains,sourceFrames);const candidates=[];
  for(let state=14;state<=28;state++){if(state===21)continue;const eligible=eligibleIntervals(grains,state).filter(r=>r.start>=16&&r.end+SEAM*1.05+16<sourceFrames),runs=[];
    for(const r of eligible){const last=runs.at(-1);if(last&&r.index===last.at(-1).index+1&&r.start===last.at(-1).end)last.push(r);else runs.push([r]);}
    for(const rows of runs){if(rows.length<3||rows.length>16)continue;const lengths=[Math.floor(RATE/state),Math.ceil(RATE/state)],rates=rows.flatMap(r=>lengths.map(n=>(r.end-r.start)/n)),margin=Math.min(...rows.map(r=>.02-Math.abs(r.state-state)/state),...rates.map(r=>Math.min(r-.95,1.05-r)));
      candidates.push({state,normalisedState:(state-14)/14,separation:Math.abs(state-21),intervals:rows,frames:rows.at(-1).end-rows[0].start,seconds:(rows.at(-1).end-rows[0].start)/RATE,stateRange:[Math.min(...rows.map(r=>r.state)),Math.max(...rows.map(r=>r.state))],rateRange:[Math.min(...rates),Math.max(...rates)],margin});}
  }
  candidates.sort((a,b)=>b.separation-a.separation||b.intervals.length-a.intervals.length||b.margin-a.margin||a.state-b.state||a.intervals[0].index-b.intervals[0].index);
  if(!candidates.length)throw Error('no second eligible state; no range expansion');return {rule:selectionRule,chosen:candidates[0],candidates};
}
const preparedSet=new WeakSet();
const fadeAt=n=>Math.min(1,n/EDGE,(FRAMES-1-n)/EDGE);
export function prepareSecondState(audio,rows,state){
  validateAudio(audio);
  if(audio.rate!==RATE||audio.channels!==1||audio.data.length>RATE*30||!Number.isInteger(state)||state<14||state>28||!Array.isArray(rows)||rows.length<3||rows.length>16)throw Error('bounded state/interval layout required');
  const eventLengths=[Math.floor(RATE/state),Math.ceil(RATE/state)];
  for(let i=0;i<rows.length;i++){const r=rows[i];
    if(!Number.isSafeInteger(r.index)||r.index<0||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<16||r.end<=r.start||r.end+SEAM*1.05+16>=audio.data.length||!Number.isFinite(r.state)||r.state<14||r.state>28||Math.abs(r.state-state)/state>.02||eventLengths.some(n=>(r.end-r.start)/n<.95||(r.end-r.start)/n>1.05)||i&&(r.index!==rows[i-1].index+1||r.start!==rows[i-1].end))throw Error('invalid/nonconsecutive/ineligible interval');
    let energy=0;for(let n=r.start;n<r.end;n++)energy+=audio.data[n]**2;if(energy/(r.end-r.start)<1e-10)throw Error('silent source interval');
  }
  let clock=0,start=0;const schedule=[];
  while(start<FRAMES){const ordinal=schedule.length,r=rows[ordinal%rows.length],end=Math.round(clock+RATE/state),speed=(r.end-r.start)/(end-start),previous=schedule.at(-1);
    if(ordinal>=5*state||end>FRAMES||end-start<=SEAM)throw Error('event clock extent');
    const rawMismatch=Math.abs(sample(audio,r.start,0,speed)-sample(audio,previous?previous.sourceEnd:r.end,0,previous?previous.speed:speed));
    if(rawMismatch>.25){const e=new Error('unsafe fixed join; no alternative state or endpoint selection');e.safety={ordinal,frame:start,rawMismatch,rawLimit:.25};throw e;}
    schedule.push(Object.freeze({ordinal,index:r.index,start,end,sourceStart:r.start,sourceEnd:r.end,sourceState:r.state,speed,boundary:ordinal===0?'start':ordinal%rows.length===0?'wrap':'internal',rawMismatch}));clock+=RATE/state;start=end;
  }
  if(start!==FRAMES)throw Error('five-second extent');
  const prepared=Object.freeze({audio,intervals:Object.freeze(rows.map(r=>Object.freeze({...r}))),schedule:Object.freeze(schedule),settings:Object.freeze({rate:RATE,frames:FRAMES,seconds:5,normalisedState:(state-14)/14,markerState:state,seam:SEAM,gain:GAIN,edge:EDGE})});preparedSet.add(prepared);return prepared;
}
export function renderSecondState(p,{omitOuterBlends=false}={}){
  if(!preparedSet.has(p)||typeof omitOuterBlends!=='boolean')throw Error('prepared explicit state comparison required');validateAudio(p.audio);
  const started=performance.now(),data=new Float64Array(FRAMES);let reads=0,wraps=0;
  for(const r of p.schedule){const previous=p.schedule[r.ordinal-1];if(r.boundary==='wrap')wraps++;
    for(let j=0;j<r.end-r.start;j++){let v=sample(p.audio,r.sourceStart+j*r.speed,0,r.speed);reads++;
      if(r.boundary==='wrap'&&j<SEAM){const u=Math.sin(Math.PI/2*j/SEAM)**2;v=(1-u)*sample(p.audio,previous.sourceEnd+j*previous.speed,0,previous.speed)+u*v;reads++;}data[r.start+j]=v;}
  }
  for(let n=0;n<FRAMES;n++){const f=fadeAt(n);data[n]=f===0?0:data[n]*GAIN*f;}
  const referenceMs=performance.now()-started,patchStart=performance.now();let overwritten=0;
  if(omitOuterBlends)for(const r of p.schedule.filter(r=>r.boundary==='wrap'))for(let j=0;j<SEAM;j++){const n=r.start+j;data[n]=sample(p.audio,r.sourceStart+j*r.speed,0,r.speed)*GAIN*fadeAt(n);reads++;overwritten++;}
  return {audio:{rate:RATE,channels:1,data},diagnostics:{renderMs:performance.now()-started,referenceMs,overwriteMs:performance.now()-patchStart,actualInterpolationCalls:reads,overwrittenSamples:overwritten,computedReferenceWraps:wraps,signalWrapBlends:omitOuterBlends?0:wraps,note:'B computes the same reference then overwrites only wrap samples; discarded work is counted, not an optimisation.'}};
}
function stats(a,b,predicate){let count=0,changed=0,ss=0,peak=0;for(let n=0;n<FRAMES;n++)if(predicate(n)){const d=a[n]-b[n];count++;if(d!==0)changed++;ss+=d*d;peak=Math.max(peak,Math.abs(d));}return {samples:count,changedSamples:changed,maxAbsoluteDifference:peak,rmsDifference:count?Math.sqrt(ss/count):0};}
function local(data,n){let ss=0,maxStep=0;const start=Math.max(0,n-64),end=Math.min(FRAMES,n+192);for(let j=start;j<end;j++){ss+=data[j]**2;if(j>start)maxStep=Math.max(maxStep,Math.abs(data[j]-data[j-1]));}return {before:data[n-1],after:data[n],signedStep:data[n]-data[n-1],absoluteStep:Math.abs(data[n]-data[n-1]),maximumLocalStep:maxStep,localRms:Math.sqrt(ss/(end-start))};}
function spectralDifference(a,b,n){if(n<EDGE+2048||n+2048>FRAMES-EDGE)return null;const x=spectrum(a,n-2048),y=spectrum(b,n-2048);let e=0,d=0;for(let k=1;k<=2048;k++){e+=x.re[k]**2+x.im[k]**2;d+=(x.re[k]-y.re[k])**2+(x.im[k]-y.im[k])**2;}return e>1e-20?Math.sqrt(d/e):null;}
function localSpectralJump(data,n){
  if(n-4096<EDGE||n+4096>FRAMES-EDGE)return null;
  const sides=[spectrum(data,n-4096),spectrum(data,n)].map(s=>{let power=0,weighted=0,peak=0,bin=0;const magnitudes=[];for(let k=1;k<=2048;k++){const p=s.re[k]**2+s.im[k]**2;power+=p;weighted+=p*k*RATE/4096;magnitudes.push(Math.sqrt(p));if(p>peak){peak=p;bin=k;}}return {power,centroidHz:power>1e-20?weighted/power:null,dominantBinHz:bin*RATE/4096,magnitudes};});
  if(sides.some(s=>s.power<=1e-20))return null;return {beforeCentroidHz:sides[0].centroidHz,afterCentroidHz:sides[1].centroidHz,beforeDominantBinHz:sides[0].dominantBinHz,afterDominantBinHz:sides[1].dominantBinHz,normalisedMagnitudeChange:Math.sqrt(sides[0].magnitudes.reduce((sum,v,k)=>sum+(v/Math.sqrt(sides[0].power)-sides[1].magnitudes[k]/Math.sqrt(sides[1].power))**2,0)),note:'Adjacent 4096-frame Hann windows; finite-window variation, not a click or physical fundamental detector.'};
}
export function inspectSecondState(p,a,b){
  if(!preparedSet.has(p))throw Error('prepared state required');for(const x of [a,b]){validateAudio(x);if(x.rate!==RATE||x.channels!==1||x.data.length!==FRAMES)throw Error('comparison extent');}
  const mask=new Uint8Array(FRAMES),internal=new Uint8Array(FRAMES),wraps=p.schedule.filter(r=>r.boundary==='wrap');
  for(const r of p.schedule){if(r.boundary==='wrap')mask.fill(1,r.start,r.start+SEAM);if(r.boundary==='internal')internal.fill(1,r.start,r.start+SEAM);}
  const rows=wraps.map(r=>{const previous=p.schedule[r.ordinal-1],natural=sample(p.audio,previous.sourceEnd,0,previous.speed)*GAIN*fadeAt(r.start);let error=0;
    for(let j=0;j<SEAM;j++){const n=r.start+j;error=Math.max(error,Math.abs(b.data[n]-sample(p.audio,r.sourceStart+j*r.speed,0,r.speed)*GAIN*fadeAt(n)));}
    return {ordinal:r.ordinal,frame:r.start,endFrame:r.start+SEAM,sourceEnd:previous.sourceEnd,targetStart:r.sourceStart,endpointJump:r.sourceStart-previous.sourceEnd,previousRate:previous.speed,currentRate:r.speed,rawEndpointMismatch:r.rawMismatch,naturalContinuation:natural,A:local(a.data,r.start),B:local(b.data,r.start),addedSpliceResidualA:Math.abs(a.data[r.start]-natural),addedSpliceResidualB:Math.abs(b.data[r.start]-natural),directTargetErrorB:error,relativeComplexSpectrumDifference:spectralDifference(a.data,b.data,r.start),localSpectralJump:{A:localSpectralJump(a.data,r.start),B:localSpectralJump(b.data,r.start)}};});
  const all=stats(a.data,b.data,()=>true),targeted=stats(a.data,b.data,n=>mask[n]===1),unaffected=stats(a.data,b.data,n=>mask[n]===0),internalWindows=stats(a.data,b.data,n=>internal[n]===1);
  if(unaffected.changedSamples||internalWindows.changedSamples)throw Error('confounded state comparison: changes outside wrap windows');
  const ma=measure(a),mb=measure(b),limit=.25*GAIN,allowance=1/32768,reasons=[];
  if(ma.clippedSamples||mb.clippedSamples)reasons.push('clipping');if(ma.allZero||mb.allZero||ma.silent20msWindows||mb.silent20msWindows)reasons.push('unexpected silence');if(rows.some(r=>r.addedSpliceResidualB>limit+allowance))reasons.push('excessive added discontinuity versus natural continuation');if(rows.some(r=>r.directTargetErrorB>allowance))reasons.push('candidate differs from unchanged target');
  return {all,targeted,unaffected,internalWindows,rows,measurements:{A:ma,B:mb},safety:{passed:!reasons.length,reasons,addedSpliceResidualLimit:limit,pcmAllowance:allowance,maxAddedSpliceResidualB:Math.max(...rows.map(r=>r.addedSpliceResidualB)),maxDirectTargetErrorB:Math.max(...rows.map(r=>r.directTargetErrorB)),basis:'Unchanged raw .25 mismatch scaled by gain .15; natural derivatives are not splice-error thresholds. Technical screen, not universal audibility.'},resolution:{meaningfulAtPcm16:targeted.rmsDifference>=1/32768&&all.maxAbsoluteDifference>=2/32768,note:'Quantisation resolution only; not perceptual acceptance'}};
}
