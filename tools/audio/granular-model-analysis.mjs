// Original read-only diagnostics. No source selection, synthesis or native rules.
import {validateAudio} from '../../src/offline-audio/stock-source.mjs';
import {spectrum} from './decel-analysis.mjs';
const uint=(v,max=0xFFFFFFFF)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export function statistics(values){
  if(!Array.isArray(values)||values.length>4096||values.some(v=>!Number.isFinite(v)))throw Error('numeric summary bound');
  if(!values.length)return {count:0,min:null,max:null,mean:null,median:null,cv:null};
  const sorted=[...values].sort((a,b)=>a-b),mean=values.reduce((a,b)=>a+b,0)/values.length;
  return {count:values.length,min:sorted[0],max:sorted.at(-1),mean,median:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2,
    cv:Math.abs(mean)>1e-15?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)/Math.abs(mean):null};
}
export function inspectStructure(grains,loops,audio,trailer=1){
  validateAudio(audio);if(audio.rate!==48000||audio.channels!==1||audio.data.length>1440000||!Array.isArray(grains)||grains.length<3||grains.length>1024||!Array.isArray(loops)||loops.length>32||!Number.isFinite(trailer))throw Error('granular layout');
  for(let i=0;i<grains.length;i++){const g=grains[i];if(!uint(g.UnkUint1)||g.UnkUint1>=audio.data.length||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||!uint(g.UnkUshort1,65535)||!uint(g.UnkUshort2,65535)||i&&g.UnkUint1<=grains[i-1].UnkUint1)throw Error('invalid marker');}
  for(const l of loops)if(!uint(l.UnkUint1)||!(uint(l.Identifier)||typeof l.Identifier==='string'&&/^[0-9a-f]{8}$/i.test(l.Identifier))||!Array.isArray(l.Grains)||!l.Grains.length||l.Grains.length>1024||l.GrainCount!==l.Grains.length||l.Grains.some((v,i)=>!uint(v)||i&&v<=l.Grains[i-1]))throw Error('invalid group indices/count');
  const hypotheses=[0,1].map(base=>({base,valid:loops.every(l=>l.Grains.every(v=>v-base>=0&&v-base<grains.length))}));
  if(loops.length&&!hypotheses.some(h=>h.valid))throw Error('group references outside markers');
  const base0=hypotheses[0].valid,groups=loops.map((l,index)=>{
    const mapped=l.Grains.map(v=>v-(base0?0:1)),values=mapped.map(i=>grains[i].UnkFloat1);
    return {index,count:l.GrainCount,style:l.UnkUint1,identifier:l.Identifier,firstReference:l.Grains[0],lastReference:l.Grains.at(-1),
      consecutive:l.Grains.slice(1).every((v,i)=>v===l.Grains[i]+1),stateRange:[Math.min(...values),Math.max(...values)],
      spanSeconds:(grains[mapped.at(-1)].UnkUint1-grains[mapped[0]].UnkUint1)/audio.rate,
      referenceInterpretation:base0?'zero-based hypothesis':'one-based hypothesis'};
  });
  let overlaps=0;for(let i=0;i<loops.length;i++)for(let j=i+1;j<loops.length;j++)overlaps+=loops[i].Grains.filter(v=>loops[j].Grains.includes(v)).length;
  return {markers:grains.length,intervals:grains.length-1,trailer,fields:{position:statistics(grains.map(g=>g.UnkUint1)),float:statistics(grains.map(g=>g.UnkFloat1)),low:statistics(grains.map(g=>g.UnkUshort1)),high:statistics(grains.map(g=>g.UnkUshort2))},
    indexBaseHypotheses:hypotheses,groups,overlappingReferences:overlaps,coveredReferences:new Set(loops.flatMap(l=>l.Grains)).size,
    warning:'Valid indices and consecutive references do not prove native index base, traversal, phase reset or group selection.'};
}
export function memberships(loops,index,base=0){return loops.flatMap((l,i)=>l.Grains.includes(index+base)&&l.Grains.includes(index+base+1)?[i]:[]);}
export function intervals(grains){return grains.slice(0,-1).map((g,index)=>({index,start:g.UnkUint1,end:grains[index+1].UnkUint1,state:(g.UnkFloat1+grains[index+1].UnkFloat1)/2}));}
export function eligibleIntervals(grains,value=21){
  if(!Number.isFinite(value)||value<=0)throw Error('requested state');
  const lengths=[Math.floor(48000/value),Math.ceil(48000/value)];
  return intervals(grains).filter(r=>r.state>=14&&r.state<=28&&Math.abs(r.state-value)/value<=0.02&&lengths.every(n=>(r.end-r.start)/n>=0.95&&(r.end-r.start)/n<=1.05));
}
function signature(audio,r){
  // Eligible 14–28 intervals are shorter than this grid: interpolate upward,
  // never decimate broadband source content into misleading low harmonics.
  const out=new Float64Array(4096);for(let j=0;j<out.length;j++){const p=r.start+j/out.length*(r.end-r.start),n=Math.floor(p),f=p-n;out[j]=audio.data[n]*(1-f)+audio.data[Math.min(n+1,r.end-1)]*f;}return out;
}
function correlation(a,b){let aa=0,bb=0,ab=0,sa=0,sb=0;for(let i=0;i<a.length;i++){sa+=a[i];sb+=b[i];aa+=a[i]**2;bb+=b[i]**2;ab+=a[i]*b[i];}const den=Math.sqrt(Math.max(0,aa-sa*sa/a.length)*Math.max(0,bb-sb*sb/a.length));return den>1e-20?(ab-sa*sb/a.length)/den:null;}
export function intervalFeatures(audio,r){
  if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<1||r.end>audio.data.length-1||r.end-r.start<16||r.end-r.start>4096)throw Error('interval extent');
  let sum=0,square=0,min=Infinity,max=-Infinity;
  for(let n=r.start;n<r.end;n++){const v=audio.data[n];if(!Number.isFinite(v))throw Error('nonfinite interval');sum+=v;square+=v*v;min=Math.min(min,v);max=Math.max(max,v);}
  const shape=signature(audio,r),powers=[];
  for(let k=1;k<=32;k++){let re=0,im=0;for(let j=0;j<shape.length;j++){re+=shape[j]*Math.cos(2*Math.PI*k*j/shape.length);im+=shape[j]*Math.sin(2*Math.PI*k*j/shape.length);}powers.push(re*re+im*im);}
  // Parseval denominator includes all positive-frequency energy, not merely
  // the inspected 32 orders. High-frequency texture must not be relabelled as
  // a strong low harmonic after normalisation of tiny leakage terms.
  let ss=0,dc=0,nyquist=0;for(let j=0;j<shape.length;j++){ss+=shape[j]**2;dc+=shape[j];nyquist+=(j%2?-1:1)*shape[j];}
  const total=Math.max(0,(shape.length*ss-dc*dc+nyquist*nyquist)/2);
  return {index:r.index,startFrame:r.start,endFrame:r.end,state:r.state,frames:r.end-r.start,seconds:(r.end-r.start)/audio.rate,rms:Math.sqrt(square/(r.end-r.start)),dc:sum/(r.end-r.start),min,max,
    firstEightRelativeHarmonicPowers:powers.slice(0,8).map(p=>total>1e-20?p/total:null),
    startValue:audio.data[r.start],endContinuation:audio.data[r.end],closureMismatch:Math.abs(audio.data[r.start]-audio.data[r.end]),
    startSlope:audio.data[r.start+1]-audio.data[r.start],continuationSlope:audio.data[r.end+1]-audio.data[r.end]};
}
export function assessPairs(engine,exhaust,value=21){
  for(const s of [engine,exhaust])inspectStructure(s.grains,s.loops,s.audio);
  const e=eligibleIntervals(engine.grains,value),x=eligibleIntervals(exhaust.grains,value),rows=[];
  if(e.length*x.length>256)throw Error('candidate matrix bound');
  for(const a of e)for(const b of x){
    const error=Math.abs(a.state-b.state)/a.state,ratio=(b.end-b.start)/(a.end-a.start),valid=error<=0.02&&ratio>=0.95&&ratio<=1.05;
    const ef=intervalFeatures(engine.audio,a),xf=intervalFeatures(exhaust.audio,b);
    rows.push({engineIndex:a.index,exhaustIndex:b.index,stateError:error,sourceDurationRatio:ratio,
      engineReadRates:[(a.end-a.start)/Math.ceil(48000/value),(a.end-a.start)/Math.floor(48000/value)],
      exhaustReadRates:[(b.end-b.start)/Math.ceil(48000/value),(b.end-b.start)/Math.floor(48000/value)],
      engineGroups:[0,1].map(base=>({base,groups:memberships(engine.loops,a.index,base)})),exhaustGroups:[0,1].map(base=>({base,groups:memberships(exhaust.loops,b.index,base)})),
      phaseNormalisedShapeCorrelation:correlation(signature(engine.audio,a),signature(exhaust.audio,b)),rmsRatio:ef.rms/xf.rms,
      classification:valid?'PLAUSIBLE BUT UNVERIFIED':'INVALID UNDER EXISTING CONSTRAINTS',
      reason:valid?'Numerically state/rate compatible; no native pairing, emission phase or timbre equivalence established':'Paired state error or source-duration ratio exceeds existing gates'});
  }
  return {engine:e.map(r=>({...intervalFeatures(engine.audio,r),groups:memberships(engine.loops,r.index)})),exhaust:x.map(r=>({...intervalFeatures(exhaust.audio,r),groups:memberships(exhaust.loops,r.index)})),combinations:rows};
}
export function continuity(audio,grains,selected){
  if(!Array.isArray(selected)||selected.length<2||selected.length>512||selected.some((r,i)=>!Number.isSafeInteger(r.index)||r.index<0||r.index>=grains.length-1||i&&r.index!==selected[i-1].index+1))throw Error('consecutive intervals required');
  const first=selected[0].start,last=selected.at(-1).end;
  let differing=0;const joined=new Float64Array(last-first);let p=0;
  for(const r of selected){if(r.start!==grains[r.index].UnkUint1||r.end!==grains[r.index+1].UnkUint1)throw Error('interval marker disagreement');joined.set(audio.data.subarray(r.start,r.end),p);p+=r.end-r.start;}
  for(let n=0;n<joined.length;n++)if(joined[n]!==audio.data[first+n])differing++;
  const boundaries=selected.slice(1).map(r=>({naturalAdjacentStep:Math.abs(audio.data[r.start]-audio.data[r.start-1]),
    slopeChange:Math.abs((audio.data[r.start+1]-audio.data[r.start])-(audio.data[r.start]-audio.data[r.start-1]))}));
  const features=selected.map(r=>intervalFeatures(audio,r)),neighbors=selected.slice(1).map((r,i)=>correlation(signature(audio,selected[i]),signature(audio,r)));
  return {frames:joined.length,durationSeconds:joined.length/audio.rate,segmentationDifferingSamples:differing,
    stateRange:[Math.min(...selected.map(r=>r.state)),Math.max(...selected.map(r=>r.state))],
    intervalRms:statistics(features.map(f=>f.rms)),neighborShapeCorrelation:statistics(neighbors.filter(v=>v!==null)),
    naturalBoundarySteps:statistics(boundaries.map(b=>b.naturalAdjacentStep)),naturalSlopeChanges:statistics(boundaries.map(b=>b.slopeChange))};
}
export function texture(audio,start,end,gain=1){
  validateAudio(audio);if(audio.channels!==1||audio.rate!==48000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>audio.data.length||end-start<4096||!Number.isFinite(gain)||gain<=0||gain>100)throw Error('texture extent/gain');
  const count=Math.min(32,Math.floor((end-start-4096)/1024)+1),rows=[],spectra=[];
  for(let i=0;i<count;i++){
    const p=Math.round(start+(end-start-4096)*(count===1?0:i/(count-1))),s=spectrum(audio.data,p);let square=0,power=0,weighted=0,low=0,high=0;
    const magnitudes=[];for(let k=1;k<=1024;k++){const a=s.re[k]**2+s.im[k]**2;power+=a;weighted+=a*k*48000/4096;if(k*48000/4096<250)low+=a;if(k*48000/4096>=1000)high+=a;magnitudes.push(Math.sqrt(a));}
    for(let n=p;n<p+4096;n++)square+=(audio.data[n]*gain)**2;
    const norm=Math.sqrt(magnitudes.reduce((a,b)=>a+b*b,0));spectra.push(magnitudes.map(v=>norm>1e-20?v/norm:0));
    rows.push({rms:Math.sqrt(square/4096),centroidHz:power>1e-20?weighted/power:null,below250Fraction:power>1e-20?low/power:null,above1kFraction:power>1e-20?high/power:null});
  }
  const flux=spectra.slice(1).map((a,i)=>Math.sqrt(a.reduce((v,x,k)=>v+(x-spectra[i][k])**2,0)));
  return {windowFrames:4096,windows:count,rms:statistics(rows.map(r=>r.rms)),centroidHz:statistics(rows.flatMap(r=>r.centroidHz===null?[]:[r.centroidHz])),
    below250Fraction:statistics(rows.flatMap(r=>r.below250Fraction===null?[]:[r.below250Fraction])),above1kFraction:statistics(rows.flatMap(r=>r.above1kFraction===null?[]:[r.above1kFraction])),normalisedSpectralFlux:statistics(flux),
    caution:'Different observation lengths/state progression confound variation comparisons. These summaries are not naturalness scores.'};
}
export function localContext(grains,selected,value=21){
  const first=selected[0].start,last=selected.at(-1).end,center=Math.round((first+last)/2),all=intervals(grains);
  return [0.25,0.5,1].map(seconds=>{const start=center-Math.round(seconds*24000),end=center+Math.round(seconds*24000),rows=all.filter(r=>r.start>=start&&r.end<=end);return {seconds,completeIntervals:rows.length,stateRange:rows.length?[Math.min(...rows.map(r=>r.state)),Math.max(...rows.map(r=>r.state))]:null,maxRequestedStateError:rows.length?Math.max(...rows.map(r=>Math.abs(r.state-value)/value)):null};});
}
export function peakFieldHypotheses(audio,grains){
  inspectStructure(grains,[],audio);
  const positive=[],negative=[],labels=[];
  for(const r of intervals(grains)){
    let min=Infinity,max=-Infinity;for(let n=r.start;n<r.end;n++){min=Math.min(min,audio.data[n]);max=Math.max(max,audio.data[n]);}const g=grains[r.index];
    positive.push(Math.abs(g.UnkUshort1/32768-Math.max(0,max)));
    negative.push(Math.abs(g.UnkUshort2/32768-Math.max(0,-min)));
    labels.push(Math.abs(g.UnkUshort1/32768-Math.max(0,-min))+Math.abs(g.UnkUshort2/32768-Math.max(0,max)));
  }
  const result=a=>({medianAbsoluteError:statistics(a).median,maxAbsoluteError:Math.max(...a),exactIntervals:a.filter(v=>v===0).length,intervals:a.length});
  return {firstAsPositivePeak:result(positive),secondAsNegativePeak:result(negative),literalLowThenHighSumError:result(labels),
    caution:'Predeclared interval-peak interpretations only; partial matches cannot establish native peak-window, gain or envelope semantics.'};
}
