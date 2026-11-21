// Experimental marker-state matching only. Not native semantics or physical RPM.
import {sample, validateAudio} from '../../src/offline-audio/stock-source.mjs';
export function cycleSchedule(engine, exhaust, options={}) {
  const low=options.low??14,high=options.high??28,rate=options.rate??48000;
  if(!Number.isFinite(low)||!Number.isFinite(high)||low<6||high>100||high<=low||rate!==48000)throw Error('experimental state/rate bound');
  const intervals=grains=>{
    if(!Array.isArray(grains)||grains.length<3||grains.length>1024)throw Error('missing markers');
    for(let i=0;i<grains.length;i++){const g=grains[i];if(!Number.isSafeInteger(g.UnkUint1)||g.UnkUint1<0||g.UnkUint1>48000*30||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||i&&g.UnkUint1<=grains[i-1].UnkUint1)throw Error('corrupt markers');}
    return grains.slice(0,-1).map((g,i)=>({index:i,start:g.UnkUint1,end:grains[i+1].UnkUint1,value:(g.UnkFloat1+grains[i+1].UnkFloat1)/2})).filter(g=>g.value>=low&&g.value<=high);
  };
  const e=intervals(engine),x=intervals(exhaust);
  for(const group of [e,x])if(group.length<4||group.some((g,i)=>i&&(g.index!==group[i-1].index+1||g.value>=group[i-1].value)))throw Error('nonmonotonic/noncontiguous state branch');
  const schedule=e.map(a=>{
    const b=x.reduce((best,g)=>Math.abs(g.value-a.value)<Math.abs(best.value-a.value)?g:best,x[0]);
    const speed=(b.end-b.start)/(a.end-a.start),error=Math.abs(b.value-a.value)/a.value;
    if(speed<0.95||speed>1.05||error>0.02)throw Error('unsafe timing warp/state mismatch');
    return {engineIndex:a.index,exhaustIndex:b.index,start:a.start,end:a.end,exhaustStart:b.start,exhaustEnd:b.end,engineState:a.value,exhaustState:b.value,speed,relativeStateError:error};
  });
  if(schedule.at(-1).end-schedule[0].start>rate*6)throw Error('experiment duration bound');
  return schedule;
}
export function matchedExhaust(audio,schedule) {
  validateAudio(audio);
  if(audio.rate!==48000||audio.channels!==1||!Array.isArray(schedule)||schedule.length<4||schedule.length>1024)throw Error('experimental audio/schedule layout');
  const start=schedule[0].start,end=schedule.at(-1).end;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>audio.rate*30||end<=start||end-start>audio.rate*6)throw Error('output extent');
  const output=new Float64Array(end-start),seam=96;
  for(let i=0;i<schedule.length;i++){
    const s=schedule[i];
    if(![s.start,s.end,s.exhaustStart,s.exhaustEnd].every(Number.isInteger)||s.end<=s.start||s.exhaustStart<16||s.exhaustEnd>audio.data.length-16||s.exhaustEnd<=s.exhaustStart||i&&s.start!==schedule[i-1].end||s.speed<0.95||s.speed>1.05||!Number.isFinite(s.speed)||Math.abs(s.speed-(s.exhaustEnd-s.exhaustStart)/(s.end-s.start))>1e-9)throw Error('invalid source position/warp');
    const length=s.end-s.start;if(length<seam*4)throw Error('cycle too short');
    for(let j=0;j<length;j++){
      let value=sample(audio,s.exhaustStart+j*s.speed,0,s.speed);
      if(i&&j<seam){const p=schedule[i-1],position=p.exhaustEnd+j*p.speed;if(position>=audio.data.length-16)throw Error('seam extent');const u=Math.sin(Math.PI/2*j/seam)**2;value=(1-u)*sample(audio,position,0,p.speed)+u*value;}
      output[s.start-start+j]=value;
    }
  }
  return {rate:audio.rate,channels:1,data:output};
}
