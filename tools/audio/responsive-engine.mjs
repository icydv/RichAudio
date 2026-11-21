// Offline research only: synthetic relative state, never physical/live RPM.
import {validateAudio,sample} from '../../src/offline-audio/stock-source.mjs';
import {cycleSchedule} from './cycle-experiment.mjs';
import {recentSelection} from './recent-cycle-selection.mjs';
import {performance} from 'node:perf_hooks';
const rate=48000,low=14,high=28,maxDuration=15,maxStep=3,seam=96;
const preparedSources=new WeakSet();
export function validateControl(points,duration){
  if(!Number.isFinite(duration)||duration<1||duration>maxDuration||!Array.isArray(points)||points.length<2||points.length>64||points[0].t!==0||points.at(-1).t!==duration)throw Error('control extent');
  for(let i=0;i<points.length;i++){
    const p=points[i];if(!Number.isFinite(p.t)||!Number.isFinite(p.state)||p.state<0||p.state>1||i&&(p.t<=points[i-1].t||1.5*Math.abs(p.state-points[i-1].state)/(p.t-points[i-1].t)>0.25+1e-12))throw Error('invalid/unsupported state or transition slope');
  }
}
export function controlAt(points,time){
  if(!Number.isFinite(time)||time<0||time>points.at(-1).t)throw Error('control time');
  let i=1;while(i<points.length-1&&points[i].t<time)i++;
  const a=points[i-1],b=points[i],z=(time-a.t)/(b.t-a.t),u=z*z*(3-2*z);
  return a.state+(b.state-a.state)*u;
}
function compatible(pair,value,length){
  return Math.abs(pair.engineState-value)/value<=0.02&&Math.abs(pair.exhaustState-value)/value<=0.02&&
    [pair.end-pair.start,pair.exhaustEnd-pair.exhaustStart].every(n=>n/length>=0.95&&n/length<=1.05);
}
export function prepareSources(engine,exhaust){
  for(const s of [engine,exhaust]){validateAudio(s.audio);if(s.audio.rate!==rate||s.audio.channels!==1)throw Error('48k mono sources required');if(s.audio.data.length>rate*30)throw Error('source duration bound');}
  const pairs=cycleSchedule(engine.grains,exhaust.grains,{low,high,rate});
  for(const p of pairs)for(const [s,start,end]of [[engine,p.start,p.end],[exhaust,p.exhaustStart,p.exhaustEnd]]){
    if(start<16||end+seam*1.05+16>=s.audio.data.length)throw Error('source exhaustion/margin');
    let energy=0;for(let n=start;n<end;n++)energy+=s.audio.data[n]**2;if(energy/(end-start)<1e-10)throw Error('silent cycle unavailable');
  }
  // Check the declared nominal domain against actual metadata and endpoint margins.
  for(let i=0;i<=100;i++){const value=low+(high-low)*i/100,length=Math.round(rate/value);if(!pairs.some(p=>compatible(p,value,length)))throw Error('unsupported state coverage');}
  const prepared=Object.freeze({engine:Object.freeze({audio:Object.freeze({...engine.audio})}),exhaust:Object.freeze({audio:Object.freeze({...exhaust.audio})}),pairs:Object.freeze(pairs.map(p=>Object.freeze(p))),range:Object.freeze([low,high]),rate});
  preparedSources.add(prepared);return prepared;
}
export function spliceMismatch(audio,continuationPosition,continuationSpeed,newPosition,newSpeed){
  if(![continuationPosition,newPosition].every(p=>Number.isFinite(p)&&p>=16&&p<audio.data.length-16))throw Error('splice position');
  return Math.abs(sample(audio,newPosition,0,newSpeed)-sample(audio,continuationPosition,0,continuationSpeed));
}
function boundaryMismatch(prepared,p,length,previous){
  let largest=0;
  for(const [name,audio,start,end]of [['engine',prepared.engine.audio,p.start,p.end],['exhaust',prepared.exhaust.audio,p.exhaustStart,p.exhaustEnd]]){
    const speed=(end-start)/length;
    largest=Math.max(largest,spliceMismatch(audio,previous?previous[name+'End']:end,previous?previous[name+'Speed']:speed,start,speed));
  }
  return largest;
}
export function renderResponsive(prepared,points,options={}){
  const duration=options.duration??5,engineScale=options.engineScale??0.35;
  const selectionMode=options.selectionMode??'reference';
  if(!['reference','recent-seeded-v1'].includes(selectionMode)||selectionMode==='reference'&&options.selectionSeed!==undefined)throw Error('explicit research selection mode required');
  const research=selectionMode==='recent-seeded-v1'?recentSelection(options.selectionSeed):null;
  validateControl(points,duration);
  if(!Number.isFinite(engineScale)||engineScale<0||engineScale>1||!preparedSources.has(prepared))throw Error('render settings');
  validateAudio(prepared.engine.audio);validateAudio(prepared.exhaust.audio);
  const frames=Math.round(duration*rate),engine=new Float64Array(frames),exhaust=new Float64Array(frames),schedule=[];
  let clock=0,start=0,previous=null,previousValue=null,direction=1,rejected=0,fallbacks=0,screened=0,schedulingMs=0;
  while(start<frames){
    const schedulingStart=performance.now();
    if(schedule.length>=512)throw Error('cycle count bound');
    const state=controlAt(points,start/rate),value=low+(high-low)*state,nextClock=clock+rate/value,end=Math.round(nextClock),length=end-start;
    const pool=prepared.pairs.map((p,index)=>({...p,index})).filter(p=>compatible(p,value,length));
    if(!pool.length)throw Error('state unavailable');
    const delta=previousValue===null?0:value-previousValue;
    let candidates=pool;
    if(previous){
      candidates=pool.filter(p=>Math.abs(p.index-previous.index)<=maxStep&&Math.abs(p.engineIndex-previous.engineIndex)<=maxStep&&Math.abs(p.exhaustIndex-previous.exhaustIndex)<=maxStep&&(delta>1e-8?p.index<=previous.index:delta<-1e-8?p.index>=previous.index:true));
      if(!candidates.length)throw Error('unsupported source traversal');
    }
    const nearest=items=>[...items].sort((a,b)=>Math.abs(a.engineState-value)-Math.abs(b.engineState-value)||a.index-b.index);
    if(research){
      candidates=research.order(candidates,previous?.index??null);
    }else if(previous&&Math.abs(delta)<1e-8){
      // Deterministic adjacent walk varies original cycles, never pitch/gain/phase.
      if((((Math.imul(schedule.length+1,1664525)+1013904223)>>>0)%7)===0)direction=-direction;
      if(!candidates.some(p=>p.index===previous.index+direction))direction=-direction;
      candidates=[...candidates].sort((a,b)=>Math.abs(a.index-(previous.index+direction))-Math.abs(b.index-(previous.index+direction))||a.index-b.index);
    }else candidates=nearest(candidates);
    // Measure mismatch against natural continuation, not the source's own
    // adjacent-sample derivative (which can legitimately be large).
    const gaps=new Map();const safe=candidates.filter(p=>{screened++;const gap=boundaryMismatch(prepared,p,length,previous);gaps.set(p.index,gap);if(gap>0.25)rejected++;return gap<=0.25;});
    if(!safe.length){const error=Error('no safe local stitch; reference retained');error.details={frame:start,state,value,candidateIndices:candidates.map(p=>p.index)};throw error;}
    const chosen=safe[0];if(chosen.index!==candidates[0].index)fallbacks++;
    const row={index:chosen.index,start,end,state,value,engineIndex:chosen.engineIndex,exhaustIndex:chosen.exhaustIndex,
      engineStart:chosen.start,engineEnd:chosen.end,exhaustStart:chosen.exhaustStart,exhaustEnd:chosen.exhaustEnd,
      engineState:chosen.engineState,exhaustState:chosen.exhaustState,engineSpeed:(chosen.end-chosen.start)/length,exhaustSpeed:(chosen.exhaustEnd-chosen.exhaustStart)/length,rawJoinMismatch:gaps.get(chosen.index)};
    schedulingMs+=performance.now()-schedulingStart;
    for(const [component,a,target]of [['engine',prepared.engine.audio,engine],['exhaust',prepared.exhaust.audio,exhaust]]){
      const sourceStart=row[component+'Start'],speed=row[component+'Speed'];
      for(let j=0;j<Math.min(length,frames-start);j++){
        let v=sample(a,sourceStart+j*speed,0,speed);
        if(previous&&j<seam){const p=previous[component+'End']+j*previous[component+'Speed'],u=Math.sin(Math.PI/2*j/seam)**2;v=(1-u)*sample(a,p,0,previous[component+'Speed'])+u*v;}
        target[start+j]=v;
      }
    }
    schedule.push(row);previous=row;previousValue=value;clock=nextClock;start=end;
  }
  const preferred=new Float64Array(frames),referenceGain=new Float64Array(frames),edge=rate*0.025;
  for(let n=0;n<frames;n++){
    const fade=Math.min(1,n/edge,(frames-1-n)/edge),e=engine[n]*0.2*fade,x=exhaust[n]*0.15*fade;
    engine[n]=fade===0?0:e*engineScale;exhaust[n]=fade===0?0:x;preferred[n]=engine[n]+exhaust[n];referenceGain[n]=fade===0?0:e+x;
  }
  const audio=data=>({rate,channels:1,data});
  return {engine:audio(engine),exhaust:audio(exhaust),preferred:audio(preferred),referenceGain:audio(referenceGain),
    diagnostics:{range:[low,high],frames,cycles:schedule.length,schedulingMs,selection:research?research.diagnostics():{mode:'reference'},rejectedSegments:rejected,screenedCandidates:screened,fallbacks,sourceLookups:frames*2+screened*4+schedule.slice(1).reduce((n,s)=>n+2*Math.min(seam,Math.max(0,frames-s.start)),0),schedule,
      limitations:['Synthetic relative state only','Deceleration-family timbre in both directions, not modelled load','Adjacent original-cycle walk may still sound repetitive','Two-ms convex joins are estimated','No effects or physical RPM calibration']}};
}
