// Original bounded offline diagnostics. No scheduling, resampling or audio output.
import {validateAudio} from '../../src/offline-audio/stock-source.mjs';
const median = a => {const b=[...a].sort((x,y)=>x-y);return b.length ? (b[Math.floor((b.length-1)/2)]+b[Math.ceil((b.length-1)/2)])/2 : null;};
const stats = a => ({count:a.length,median:median(a),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null});
function fft(re, im, inverse=false) {
  const n=re.length;
  if(n!==im.length||n<2||n>131072||(n&(n-1)))throw Error('FFT bound');
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let size=2;size<=n;size*=2)for(let b=0;b<n;b+=size)for(let k=0;k<size/2;k++){
    const a=b+k,c=a+size/2,t=(inverse?2:-2)*Math.PI*k/size,co=Math.cos(t),si=Math.sin(t),x=re[c]*co-im[c]*si,y=re[c]*si+im[c]*co;
    re[c]=re[a]-x;im[c]=im[a]-y;re[a]+=x;im[a]+=y;
  }
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
export function markerSummary(grains, loops, audio) {
  validateAudio(audio);
  if(audio.channels!==1||!Array.isArray(grains)||grains.length<3||grains.length>1024||!Array.isArray(loops)||loops.length>32)throw Error('marker layout');
  for(let i=0;i<grains.length;i++){
    const g=grains[i];if(!Number.isInteger(g.UnkUint1)||g.UnkUint1<0||g.UnkUint1>=audio.data.length||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||g.UnkFloat1>1e6||i&&g.UnkUint1<=grains[i-1].UnkUint1)throw Error('corrupt/nonmonotonic markers');
  }
  const rows=grains.slice(0,-1).map((g,i)=>{
    const next=grains[i+1],spacing=next.UnkUint1-g.UnkUint1;
    const errors=[g.UnkFloat1,next.UnkFloat1,(g.UnkFloat1+next.UnkFloat1)/2].map(f=>Math.abs(f*spacing/audio.rate-1));
    return {index:i,spacing,errors};
  });
  const fit=[0,1,2].map(k=>median(rows.filter(r=>r.index%2===0).map(r=>r.errors[k])));
  const choice=fit.indexOf(Math.min(...fit));
  const controls=[0,1].map(kind=>{
    const values=grains.map((_,i)=>grains[kind===0?grains.length-1-i:(i+Math.floor(grains.length/2))%grains.length].UnkFloat1);
    return stats(rows.filter(r=>r.index%2===1).map(r=>{
      const value=choice===0?values[r.index]:choice===1?values[r.index+1]:(values[r.index]+values[r.index+1])/2;
      return Math.abs(value*r.spacing/audio.rate-1);
    }));
  });
  const groups=loops.map((g,index)=>{
    if(!Array.isArray(g.Grains)||!g.Grains.length||g.Grains.length>1024||g.GrainCount!==g.Grains.length||g.Grains.some((v,i)=>!Number.isInteger(v)||v<0||v>=grains.length||i&&v<=g.Grains[i-1]))throw Error('invalid loop indices');
    const values=g.Grains.map(i=>grains[i].UnkFloat1);
    return {index,count:values.length,firstRecord:g.Grains[0],lastRecord:g.Grains.at(-1),firstFrame:grains[g.Grains[0]].UnkUint1,values:stats(values),style:g.UnkUint1,identifier:g.Identifier};
  });
  const changes=grains.slice(1).map((g,i)=>g.UnkFloat1-grains[i].UnkFloat1);
  let waveformEnergy=0,markerEnergy=0,positiveSlopes=0;
  for(const x of audio.data)waveformEnergy+=x*x;
  for(const g of grains){markerEnergy+=audio.data[g.UnkUint1]**2;if(g.UnkUint1>0&&audio.data[g.UnkUint1]>audio.data[g.UnkUint1-1])positiveSlopes++;}
  return {count:grains.length,frames:audio.data.length,values:stats(grains.map(g=>g.UnkFloat1)),spacing:stats(rows.map(r=>r.spacing)),
    increases:changes.filter(x=>x>0).length,decreases:changes.filter(x=>x<0).length,plateaus:changes.filter(x=>x===0).length,
    spacingModel:{candidates:['current UnkFloat1','next UnkFloat1','adjacent mean UnkFloat1'],trainingMedianRelativeErrors:fit,chosenOnEvenRecords:choice,
      oddHeldOutRelativeError:stats(rows.filter(r=>r.index%2===1).map(r=>r.errors[choice])),reversedFloatControl:controls[0],halfRotationControl:controls[1]},
    markerValueRmsOverWholeRms:waveformEnergy>0?Math.sqrt(markerEnergy/grains.length/(waveformEnergy/audio.data.length)):null,
    positiveSlopeFraction:positiveSlopes/grains.length,loopIndexInterpretation:'Candidate zero-based record indexing; native index base/walk semantics unverified',groups};
}
export function localPeriodicity(audio, center, metadataValue=null, controls=[]) {
  validateAudio(audio);
  const width=Math.round(audio.rate*0.5),start=Math.round(center-width/2);
  if(audio.channels!==1||!Number.isInteger(center)||start<0||start+width>audio.data.length||width<1024||width>48000||
      metadataValue!==null&&(!Number.isFinite(metadataValue)||metadataValue<=0)||!Array.isArray(controls)||controls.length>4||controls.some(v=>!Number.isFinite(v)||v<=0))throw Error('periodicity window/value bound');
  let n=2;while(n<width*2)n*=2;
  const re=new Float64Array(n),im=new Float64Array(n),prefix=new Float64Array(width+1);
  let mean=0;for(let j=0;j<width;j++)mean+=audio.data[start+j];mean/=width;
  for(let j=0;j<width;j++){re[j]=audio.data[start+j]-mean;prefix[j+1]=prefix[j]+re[j]*re[j];}
  if(prefix[width]/width<1e-16)return {startFrame:start,endFrame:start+width,unavailable:'degenerate energy',peaks:[]};
  // Zero padding makes the inverse power spectrum a linear autocorrelation.
  // Prefix energies normalise each lag by its actual overlapping samples.
  fft(re,im);for(let j=0;j<n;j++){re[j]=re[j]**2+im[j]**2;im[j]=0;}fft(re,im,true);
  const minLag=Math.ceil(audio.rate/200),maxLag=Math.min(Math.floor(audio.rate/6),Math.floor(width/3));
  const score=lag=>{if(!Number.isInteger(lag)||lag<minLag||lag>maxLag)return null;const denominator=Math.sqrt((prefix[width-lag]-prefix[0])*(prefix[width]-prefix[lag]));return denominator>1e-20?Math.max(-1,Math.min(1,re[lag]/denominator)):null;};
  const candidates=[];
  for(let lag=minLag+1;lag<maxLag;lag++){const value=score(lag);if(value>0.05&&value>=score(lag-1)&&value>score(lag+1))candidates.push({periodSamples:lag,relativeFrequencyHz:audio.rate/lag,correlation:value});}
  const peaks=candidates.sort((a,b)=>b.correlation-a.correlation).slice(0,8);
  const metaLag=metadataValue===null?null:Math.round(audio.rate/metadataValue);
  const nearest=metaLag===null||!candidates.length?null:candidates.reduce((a,b)=>Math.abs(a.periodSamples-metaLag)<Math.abs(b.periodSamples-metaLag)?a:b);
  return {startFrame:start,endFrame:start+width,peaks,metadataValue,metadataPeriodCorrelation:metaLag===null?null:score(metaLag),
    controlPeriodCorrelations:controls.map(value=>({value,correlation:score(Math.round(audio.rate/value))})),
    nearestIndependentPeak:nearest?{...nearest,relativePeriodError:Math.abs(nearest.periodSamples-metaLag)/metaLag}:null,
    ambiguity:'Multiple harmonic/subharmonic peaks possible. No physical RPM or unique cycle count is assigned.'};
}
export function validateMapping(anchors) {
  if(!Array.isArray(anchors)||anchors.length<2||anchors.length>1024)throw Error('mapping anchors');
  for(let i=0;i<anchors.length;i++){
    const a=anchors[i];if(!Number.isFinite(a.state)||!Number.isFinite(a.position)||a.position<0||i&&(a.state<=anchors[i-1].state||a.position<=anchors[i-1].position))throw Error('nonmonotonic/invalid mapping');
  }
  return anchors;
}
export function valueAtFrame(grains, frame) {
  if(!Array.isArray(grains)||grains.length<2||grains.length>1024||grains.some((g,i)=>!Number.isSafeInteger(g.UnkUint1)||g.UnkUint1<0||!Number.isFinite(g.UnkFloat1)||g.UnkFloat1<=0||i&&g.UnkUint1<=grains[i-1].UnkUint1))throw Error('invalid interpolation markers');
  if(!Number.isFinite(frame)||frame<grains[0].UnkUint1||frame>grains.at(-1).UnkUint1)throw Error('out-of-range frame');
  let i=1;while(i<grains.length-1&&grains[i].UnkUint1<frame)i++;
  const a=grains[i-1],b=grains[i],t=(frame-a.UnkUint1)/(b.UnkUint1-a.UnkUint1);
  return a.UnkFloat1+(b.UnkFloat1-a.UnkFloat1)*t;
}
