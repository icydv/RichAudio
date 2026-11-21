// Read-only source-path audit. No PCM rendering, playback, or alternate-policy search.
import {performance} from 'node:perf_hooks';
import {sample,validateAudio} from '../../src/offline-audio/stock-source.mjs';
const RATE=48000,LOW=21,HIGH=27,SEAM=96;
export const trajectory=Object.freeze([{t:0,state:21},{t:1,state:21},{t:7,state:27},{t:8,state:27},{t:14,state:21},{t:15,state:21}].map(Object.freeze));
export const auditPolicy=Object.freeze({minimumContextIntervals:3,maximumContextIntervals:16,maximumContexts:256,
  sourceStateRange:[14,28],stateTolerance:.02,rateRange:[.95,1.05],rawMismatchLimit:.25,
  handoff:'Event-boundary only; previous interval shared by both contexts; carry source endpoint and cumulative clock; at most one region change per event',
  contextEligibility:'Every interval of the active context must remain eligible for the entire upcoming source event',
  path:'Shortest metadata graph path, descending first source index by at most one per step, at least two shared intervals, positive state-band overlap; ascending source-index ties',
  stopping:'One path and one trajectory. No fallback context, trajectory, renderer or generated audio after failure.'});
export function stateAt(t){
  if(!Number.isFinite(t)||t<0||t>15)throw Error('control time outside fixed trajectory');
  let i=1;while(i<trajectory.length-1&&t>trajectory[i].t)i++;
  const a=trajectory[i-1],b=trajectory[i],z=(t-a.t)/(b.t-a.t),u=z*z*(3-2*z);return a.state+(b.state-a.state)*u;
}
export function controlRange(start,end){
  if(start>end)throw Error('reversed time range');
  const values=[stateAt(start),stateAt(end),...trajectory.filter(p=>p.t>start&&p.t<end).map(p=>p.state)];
  return [Math.min(...values),Math.max(...values)];
}
export function deriveCoverage(grains,sourceFrames){
  if(!Number.isSafeInteger(sourceFrames)||sourceFrames<32||sourceFrames>RATE*30||!Array.isArray(grains)||grains.length<4||grains.length>1024)throw Error('marker/source extent');
  for(let i=0;i<grains.length;i++){const g=grains[i];if(!Number.isSafeInteger(g.UnkUint1)||g.UnkUint1<0||g.UnkUint1>=sourceFrames||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||i&&g.UnkUint1<=grains[i-1].UnkUint1)throw Error('invalid source marker/order');}
  const rows=[],rejected=[];let lastState=Infinity;
  for(let i=0;i<grains.length-1;i++){
    const start=grains[i].UnkUint1,end=grains[i+1].UnkUint1,state=(grains[i].UnkFloat1+grains[i+1].UnkFloat1)/2,length=end-start;
    if(state<14||state>28)continue;if(state>=lastState)throw Error('nonmonotonic source-state branch');lastState=state;
    if(start<16||end+SEAM*1.05+16>=sourceFrames){rejected.push({index:i,reason:'source margin'});continue;}
    // floor(48000/v) >= minN and ceil(48000/v) <= maxN iff
    // 48000/maxN <= v <= 48000/minN. Retain the stricter of the exact
    // integer-ratio and historical floating rate bounds; never widen them.
    const minN=Math.max(Math.ceil(length*20/21),Math.ceil(length/1.05)),maxN=Math.min(Math.floor(length*20/19),Math.floor(length/.95));
    if(minN>maxN){rejected.push({index:i,reason:'no legal integer event length'});continue;}
    const lower=Math.max(state/1.02,RATE/maxN),upper=Math.min(state/.98,RATE/minN);
    // Conservative inward arithmetic allowance, not extra source tolerance.
    // Positive, bounded operands use only a few operations; 64 eps is wider
    // than their accumulated binary rounding budget. Never fill a residual gap.
    const roundingGuard=64*Number.EPSILON*Math.max(1,Math.abs(lower),Math.abs(upper));
    const lo=Math.max(LOW,lower+roundingGuard),hi=Math.min(HIGH,upper-roundingGuard);
    if(lo<=hi)rows.push({index:i,start,end,frames:length,state,minN,maxN,lo,hi,roundingGuard});
  }
  const contexts=[];
  for(let i=0;i+2<rows.length;i++){const x=rows.slice(i,i+3);if(x.every((r,j)=>!j||r.index===x[j-1].index+1&&r.start===x[j-1].end)){const g=context(x,'g:'+x[0].index);if(g)contexts.push(g);}}
  if(contexts.length>256)throw Error('context analysis bound');
  return {rows,rejected,contexts,individualCoverage:cover(rows),contextCoverage:cover(contexts),method:'Analytical closed eligibility bands, conservatively rounded inward; exact floor/ceil-rate inequalities, not an integer-state grid. Any remaining gap is rejected.'};
}
function context(rows,id){const lo=Math.max(...rows.map(r=>r.lo)),hi=Math.min(...rows.map(r=>r.hi));return lo<=hi?{id,indices:rows.map(r=>r.index),lo,hi}:null;}
function cover(rows){
  const spans=[];for(const r of [...rows].sort((a,b)=>a.lo-b.lo||a.hi-b.hi)){const last=spans.at(-1);if(last&&r.lo<=last[1])last[1]=Math.max(last[1],r.hi);else spans.push([r.lo,r.hi]);}
  const gaps=[];let reached=LOW;for(const [lo,hi]of spans){if(lo>reached)gaps.push([reached,lo]);reached=Math.max(reached,hi);}if(reached<HIGH)gaps.push([reached,HIGH]);
  return {spans,gaps,full:gaps.length===0&&spans.length>0&&spans[0][0]===LOW&&spans.at(-1)[1]===HIGH};
}
function endpoint(rows,indices,id,state){
  if(!Array.isArray(indices)||indices.length<3||indices.length>16||indices.some((v,i)=>!Number.isSafeInteger(v)||v<0||i&&v!==indices[i-1]+1))throw Error('endpoint indices');
  const selected=indices.map(i=>rows.find(r=>r.index===i));if(selected.some(r=>!r))return null;
  const g=context(selected,id);return g&&g.lo<=state&&state<=g.hi?g:null;
}
const shared=(a,b)=>a.indices.filter(i=>b.indices.includes(i));
export function sharedCursorPath(contexts,low,high){
  if(!low||!high)return null;const nodes=[low,...contexts.filter(g=>g.id!==low.id&&g.id!==high.id).sort((a,b)=>a.indices[0]-b.indices[0]),high],end=nodes.length-1,parents=new Map([[0,null]]),queue=[0];
  for(const n of queue){if(n===end)break;for(let k=1;k<nodes.length;k++){
    const a=nodes[n],b=nodes[k],delta=a.indices[0]-b.indices[0];
    if(parents.has(k)||delta<0||delta>1||shared(a,b).length<2||Math.max(a.lo,b.lo)>=Math.min(a.hi,b.hi))continue;
    parents.set(k,n);queue.push(k);
  }}
  if(!parents.has(end))return null;const route=[];for(let n=end;n!==null;n=parents.get(n))route.push(nodes[n]);return route.reverse();
}
export function planCandidate(route,rows){
  if(!Array.isArray(route)||route.length<2||route.length>258)throw Error('bounded route required');
  const byIndex=new Map(rows.map(r=>[r.index,r])),events=[],handoffs=[];let active=route[0],clock=0,start=0,previous=null,failure=null;
  while(start<15*RATE){
    if(events.length>=450)throw Error('event plan bound');
    const time=start/RATE,requested=stateAt(time),rawEnd=Math.round(clock+RATE/requested),end=Math.min(rawEnd,15*RATE),range=controlRange(time,end/RATE),direction=time<8?'rising':'falling',ordered=direction==='rising'?route:[...route].reverse(),position=ordered.indexOf(active),candidate=ordered[position+1];
    const common=candidate?shared(active,candidate):[],cursorCompatible=!!previous&&common.includes(previous.index),candidateEligible=!!candidate&&candidate.lo<=range[0]&&range[1]<=candidate.hi;
    if(time>=1&&candidate&&cursorCompatible&&candidateEligible){handoffs.push({time,requestedState:requested,from:active.id,to:candidate.id,carriedInterval:previous.index,carriedSourceEndpoint:previous.end,sourcePositionJump:0});active=candidate;}
    if(active.lo>range[0]||range[1]>active.hi){failure={time,frame:start,plannedEndFrame:end,requestedState:requested,stateRange:range,activeRegion:active.indices,activeBand:[active.lo,active.hi],previousIndex:previous?.index,nextRegion:candidate?.indices??null,nextBand:candidate?[candidate.lo,candidate.hi]:null,sharedIndices:common,cursorCompatible,candidateWholeEventEligible:candidateEligible,
      reason:'Whole-event context eligibility fails under the one fixed event-boundary handoff policy; no alternate context, time curve or within-event handoff is attempted.'};break;}
    const index=previous&&active.indices.includes(previous.index)&&previous.index!==active.indices.at(-1)?previous.index+1:active.indices[0],r=byIndex.get(index);
    if(!r)throw Error('invalid candidate source index');const speed=r.frames/(rawEnd-start);
    if(rawEnd<=start||speed<.95||speed>1.05||r.lo>range[0]||range[1]>r.hi)throw Error('invalid event duration/rate/source state');
    const stateError=Math.max(Math.abs(r.state-range[0])/range[0],Math.abs(r.state-range[1])/range[1]);if(stateError>.02)throw Error('source state tolerance');
    events.push({start,end,index,sourceStart:r.start,sourceEnd:r.end,requestedState:requested,stateRange:range,speed,context:active.id,boundary:!previous?'start':previous.end===r.start?'internal':'wrap',stateError});
    previous=r;clock+=RATE/requested;start=end;
  }
  return {complete:!failure&&start===15*RATE,plannedFrames:start,events,handoffs,failure,renderedAudioFrames:0};
}
function rateRepresentatives(row,g){
  const rates=new Map(),first=Math.max(row.minN,Math.floor(RATE/g.hi)-1),last=Math.min(row.maxN,Math.ceil(RATE/g.lo)+1);
  if(last-first>1024)throw Error('finite rate analysis bound');
  for(let n=first;n<=last;n++){const rate=row.frames/n;rates.set(Math.round(rate*128),rate);}return [...rates.values()];
}
export function auditTransition(audio,grains,{lowerIndices,upperIndices}){
  const started=performance.now();validateAudio(audio);if(audio.rate!==RATE||audio.channels!==1)throw Error('48k mono source required');
  const coverage=deriveCoverage(grains,audio.data.length),byIndex=new Map(coverage.rows.map(r=>[r.index,r])),low=endpoint(coverage.rows,lowerIndices,'lower',LOW),high=endpoint(coverage.rows,upperIndices,'upper',HIGH),groups=[...coverage.contexts,...[low,high].filter(Boolean)];
  const energies=new Map(coverage.rows.map(r=>{let square=0;for(let n=r.start;n<r.end;n++)square+=audio.data[n]**2;return [r.index,square/r.frames];}));
  let interpolationCalls=0,ratePairs=0;const checked=groups.map(g=>{
    let maximumWrapMismatch=0,maximumInternalMismatch=0;const first=byIndex.get(g.indices[0]),last=byIndex.get(g.indices.at(-1));
    for(const a of rateRepresentatives(first,g))for(const b of rateRepresentatives(last,g)){maximumWrapMismatch=Math.max(maximumWrapMismatch,Math.abs(sample(audio,first.start,0,a)-sample(audio,last.end,0,b)));interpolationCalls+=2;ratePairs++;}
    for(let i=1;i<g.indices.length;i++){const prev=byIndex.get(g.indices[i-1]),next=byIndex.get(g.indices[i]);for(const a of rateRepresentatives(next,g))for(const b of rateRepresentatives(prev,g)){maximumInternalMismatch=Math.max(maximumInternalMismatch,Math.abs(sample(audio,next.start,0,a)-sample(audio,prev.end,0,b)));interpolationCalls+=2;ratePairs++;}}
    const nonSilent=g.indices.every(i=>energies.get(i)>=1e-10);return {...g,maximumWrapMismatch,maximumInternalMismatch,nonSilent,boundaryScreenPassed:nonSilent&&maximumWrapMismatch<=.25&&maximumInternalMismatch<=.25};
  });
  const allowed=checked.filter(g=>g.boundaryScreenPassed),lower=allowed.find(g=>g.id==='lower'),upper=allowed.find(g=>g.id==='upper'),route=sharedCursorPath(allowed.filter(g=>g.id!=='lower'&&g.id!=='upper'),lower,upper);
  const plan=coverage.contextCoverage.full&&route?planCandidate(route,coverage.rows):null;
  // This is a feasibility audit only. A passing plan would still require a
  // separately gated minimal renderer and waveform validation, not native claims.
  const gate=!coverage.individualCoverage.full?'FAIL':!coverage.contextCoverage.full||!route||!plan?.complete?'PARTIAL':'PASS';
  return {schemaVersion:1,gate,fullPathDefensible:gate==='PASS',operatingRange:[LOW,HIGH],policy:auditPolicy,trajectory,coverage,contexts:checked,route,plan,
    performance:{analysisMs:performance.now()-started,examinedMarkerIntervals:grains.length-1,relevantIntervals:coverage.rows.length,candidateContexts:checked.length,rejectedBoundaryContexts:checked.length-allowed.length,finiteRatePairs:ratePairs,interpolationCalls,rssBytes:process.memoryUsage().rss},
    limitations:['Analytic eligibility is not native phase continuity','Graph connectivity alone is not a timed schedule','Whole-event context ownership is a conservative experimental policy, not a proven Rockstar restriction','No PCM rendered; no trajectory, endpoint or scheduling-policy retry']};
}
