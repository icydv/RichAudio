// Genuine PCM with a continuous interval-phase clock. Metadata spans are cycle-
// rate evidence, not recovered crank RPM or a claim of GTA's native algorithm.
import {SourcePreparationBudgetError10} from './source-preparation-budget10.mjs';
const FS=48000;
const stateAlpha=1-Math.exp(-1/(FS*.01));
const intervalRate=(sampleRate,intervals,p)=>sampleRate/((1-p.w)*intervals[p.a].length+p.w*intervals[p.b].length);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const smooth=x=>x*x*(3-2*x);
const matchSamples=64;
const initialMatches=new WeakMap();
const sourceTimelines=new WeakMap();
const contiguousEndByPlan=new WeakMap();
// Prepared data contains no reader, random state, phase, clock or emitted PCM.
// Tokens bind the exact loaded asset/options; changing assets requires a new plan.
const preparations10=new WeakMap();
const binding10=(asset,regions)=>({asset,regions,samples:asset.samplesFloat32??asset.samples,frames:asset.frames,sampleRate:asset.sampleRate,
 intervals:asset.intervals,sustain:asset.sustain,sustainState:asset.sustain?.state,sha256:asset.sha256,playbackState:asset.playbackState});
const matches10=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
export const grainPreparationLimits10=Object.freeze({maximumFrames:2097152,maximumIntervals:65536,maximumBytes:64*1024*1024});
const bytes10=samples=>Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength);
const frozenCopy10=value=>{
 if(value===null||typeof value!=='object')return value;
 return Object.freeze(Array.isArray(value)?value.map(frozenCopy10):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,frozenCopy10(v)])));
};

/** Startup-only pure preparation. No StockGrainVoice or playback history exists. */
export function prepareStockGrain10(asset,{regions=null,texture=true,maximumBytes=grainPreparationLimits10.maximumBytes}={}){
 check(Number.isSafeInteger(asset?.frames)&&asset.frames>=16,'bounded prepared source length required');
 check(Number.isSafeInteger(maximumBytes)&&maximumBytes>0&&maximumBytes<=grainPreparationLimits10.maximumBytes,'bounded grain preparation memory required');
 const samples=validated(asset),increment=asset.sampleRate/FS,supplied=regions?.candidateIntervals??regions??asset.intervals;
 if(asset.frames>grainPreparationLimits10.maximumFrames)throw new SourcePreparationBudgetError10('frames',grainPreparationLimits10.maximumFrames);
 check(supplied==null||Array.isArray(supplied),'ordered source interval array required');
 if(supplied?.length>grainPreparationLimits10.maximumIntervals)throw new SourcePreparationBudgetError10('intervals',grainPreparationLimits10.maximumIntervals);
 const selected=supplied?.length?supplied:[idleLoop(samples,asset.sampleRate)];
 const textureEnabled=Boolean(texture&&supplied?.length>1);
 const arrayBytes=samples.byteLength+(textureEnabled?(asset.frames+1)*8:0);
 if(arrayBytes+selected.length*256>maximumBytes)throw new SourcePreparationBudgetError10('bytes',maximumBytes);
 const intervals=selected.map((r,i)=>{
  const start=r.startFrame,end=r.endFrame;
  check(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=asset.frames&&end-start>=8*increment,'invalid or too-short source interval');
  if(supplied?.length)check(Number.isInteger(start)&&Number.isInteger(end),'metadata sample offsets must be integers');
  if(i)check(start>=selected[i-1].endFrame,'source intervals overlap or are unordered');
  const last=linear(samples,Math.max(start,end-increment)),first=linear(samples,start),selfJoin=Math.abs(first-last),contextJoin=start>=increment?Math.abs(first-linear(samples,start-increment)):Infinity;
  return {start,end,length:end-start,centre:(start+end)/2,seam:contextJoin<selfJoin?Math.min((end-start)*.15,asset.sampleRate*.005,start):0};
 });
 const suppliedFeatures=asset.sustain?.intervals;
 if(suppliedFeatures)check(suppliedFeatures.length===intervals.length&&suppliedFeatures.every((f,i)=>f.index===i&&f.startFrame===intervals[i].start&&f.endFrame===intervals[i].end),'sustain features must bind exact source intervals');
 const features=suppliedFeatures??intervals.map(r=>{let e=0,peak=0,detail=0;for(let i=r.start;i<r.end;i++){
  const v=samples[i];e+=v*v;peak=Math.max(peak,Math.abs(v));if(i>r.start)detail+=(v-samples[i-1])**2;}
  const rms=Math.sqrt(e/r.length);return {rms,crestDb:rms?20*Math.log10(peak/rms):0,detailRatio:Math.sqrt(detail/Math.max(e,1e-30)),transientRisk:false};});
 for(let i=1;i<intervals.length;i++)if(features[i-1].transientRisk)intervals[i].seam=0;
 const intervalSignature=JSON.stringify(supplied??null),featureSignature=JSON.stringify(suppliedFeatures??null);
 // Charge typed arrays exactly and conservatively charge the copied metadata
 // and retained binding strings. This is a preparation cap, not a heap meter.
 const requiredBytes=arrayBytes+selected.length*128+8*(intervalSignature.length+featureSignature.length+JSON.stringify(intervals).length+JSON.stringify(features).length);
 if(requiredBytes>maximumBytes)throw new SourcePreparationBudgetError10('bytes',maximumBytes);
 let timeline=null;
 if(textureEnabled){const mapping={asset,intervals,pair:StockGrainVoice.prototype.pair},pair={a:0,b:0,w:0,target:0};
  timeline=new Float64Array(asset.frames+1);for(let i=0;i<asset.frames;i++)timeline[i+1]=timeline[i]+intervalRate(asset.sampleRate,intervals,mapping.pair((i+.5)/(asset.frames-1),pair,true))/asset.sampleRate;}
 const token=Object.freeze({kind:'RichAudioStockGrainPreparation10',bytes:requiredBytes,textureEnabled,sourceFramesAdvanced:0});
 preparations10.set(token,{binding:binding10(asset,regions),texture:Boolean(texture),samples,intervals:frozenCopy10(intervals),features:frozenCopy10(features),timeline,
  snapshot:Buffer.from(bytes10(samples)),intervalSignature,featureSignature});
 return token;
}
export function validateStockGrainPreparation10(asset,{regions=null,texture=true,preparation10}={}){
 const p=preparations10.get(preparation10);
 check(p&&matches10(p.binding,binding10(asset,regions))&&p.texture===Boolean(texture),'exact branded grain preparation required');
 check(bytes10(p.samples).equals(p.snapshot)&&JSON.stringify(regions?.candidateIntervals??regions??asset.intervals??null)===p.intervalSignature&&
  JSON.stringify(asset.sustain?.intervals??null)===p.featureSignature,'prepared source content changed; prepare a new plan');
 return true;
}
function validated(asset){
  const samples=asset.samplesFloat32??asset.samples;
  check(samples instanceof Float32Array&&samples.length===asset.frames&&asset.frames>=16,'bounded decoded PCM required');
  check(Number.isInteger(asset.sampleRate)&&asset.sampleRate>=8000&&asset.sampleRate<=48000,'supported native sample rate required');
  check(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<=1),'finite bounded source PCM required');
  return samples;
}
function linear(samples,position){
  const k=Math.floor(position),next=Math.min(k+1,samples.length-1),f=position-k;
  return samples[k]*(1-f)+samples[next]*f;
}

/** Unmodified finite native-rate reference: no looping, state selection, gain or
 * grain scheduling. Linear rate conversion only; silence after the recording. */
export class NativePcmVoice {
  constructor(asset){this.samples=validated(asset);this.increment=asset.sampleRate/FS;this.position=0;}
  next(){if(this.position>=this.samples.length)return 0;const value=linear(this.samples,this.position);this.position+=this.increment;return value;}
}

// Idle has no verified interval atlas. Find a long waveform-matched join, using
// original sample context, instead of shaving an overlap from the file clock.
// This is an explicit audio-derived loop approximation, not native loop metadata.
function idleLoop(samples,rate){
  const n=samples.length,start=Math.min(Math.round(rate*.02),Math.floor(n/8));
  const half=Math.max(2,Math.min(Math.round(rate*.003),start-1,Math.floor(n/16)));
  const last=n-half-2,first=Math.max(start+8,Math.floor(n*.65),last-Math.round(rate*.15));
  const error=end=>{let e=0;for(let j=-half;j<half;j++){const d=linear(samples,start+j)-linear(samples,end+j);e+=d*d;}return e;};
  let end=last,best=Infinity;
  for(let k=first;k<=last;k++){const e=error(k);if(e<=best){best=e;end=k;}}
  if(end>first&&end<last){const a=error(end-1),b=best,c=error(end+1),den=a-2*b+c;
    if(den>1e-20)end+=Math.max(-.5,Math.min(.5,(a-c)/(2*den)));}
  return {startFrame:start,endFrame:end};
}

export class StockGrainVoice {
  #sourceTimeline=null;
  #preparation=null;
  #prepareInitialMatch=false;
  #reusedInitialMatch=false;
  #nextPair={a:0,b:0,w:0,target:0};
  #singlePair={a:0,b:0,w:0};
  #ratePair={a:0,b:0,w:0,target:0};
  #nextOutput={value:0,energy:0};
  #firstCycle={value:0,energy:0};
  #secondCycle={value:0,energy:0};
  constructor(asset,{regions=null,texture=true,preparation10=null}={}){
    const prepared=preparation10===null?null:preparations10.get(preparation10);
    if(preparation10!==null)validateStockGrainPreparation10(asset,{regions,texture,preparation10});
    this.samples=prepared?.samples??validated(asset);this.asset=asset;this.increment=asset.sampleRate/FS;
    const supplied=regions?.candidateIntervals??regions??asset.intervals;
    check(supplied==null||Array.isArray(supplied),'ordered source interval array required');
    this.intervalBasis=supplied?.length?'observed-offset-whole-interval-phase-approximation':'waveform-matched-long-idle-loop-approximation';
    const selected=prepared?null:supplied?.length?supplied:[idleLoop(this.samples,asset.sampleRate)];
    // Source-owned ordinary arrays retain the hot reader's original layout.
    // A caller mutating one voice cannot corrupt another prepared source.
    this.intervals=prepared?prepared.intervals.map(r=>({start:r.start,end:r.end,length:r.length,centre:r.centre,seam:r.seam})):selected.map((r,i)=>{
      const start=r.startFrame,end=r.endFrame;
      check(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=asset.frames&&end-start>=8*this.increment,'invalid or too-short source interval');
      if(supplied?.length)check(Number.isInteger(start)&&Number.isInteger(end),'metadata sample offsets must be integers');
      if(i)check(start>=selected[i-1].endFrame,'source intervals overlap or are unordered');
      const last=linear(this.samples,Math.max(start,end-this.increment)),first=linear(this.samples,start);
      const selfJoin=Math.abs(first-last),contextJoin=start>=this.increment?Math.abs(first-linear(this.samples,start-this.increment)):Infinity;
      return {start,end,length:end-start,centre:(start+end)/2,
        // A second read of genuine context leads INTO the same start. The
        // overlap occupies the END of the full period; it never shortens it.
        // Never introduce an unrelated preceding-state edge into an already
        // continuous loop (including a constant or exactly periodic interval).
        seam:contextJoin<selfJoin?Math.min((end-start)*.15,asset.sampleRate*.005,start):0};
    });
    this.phase=0;this.clockCycles=0;this.state=null;this.frame=0;this.previous=0;
    this.lastExpectedEnergy=0;this.expectedEnergy=0;this.outputEnergy=0;this.maximumBoundaryStep=0;
    this.stats={crossfades:0,reads:0,minimumReadFrame:null,maximumReadFrame:null,minimumSelectedInterval:null,
      maximumSelectedInterval:null,maximumConcurrentHeads:2,sourceBoundViolations:0,stateSwitches:0,
      minimumIntervalRateHz:Infinity,maximumIntervalRateHz:0,clock:'full interval phase; no overlap-hop rate or neighbour pattern'};
    this.textureEnabled=Boolean(texture&&supplied?.length>1);
    const features=asset.sustain?.intervals;
    if(features&&!prepared)check(features.length===this.intervals.length&&features.every((f,i)=>f.index===i&&f.startFrame===this.intervals[i].start&&f.endFrame===this.intervals[i].end),'sustain features must bind exact source intervals');
    this.features=prepared?prepared.features.map(f=>({...f,...(f.bandFractions?{bandFractions:{...f.bandFractions}}:{})})):features??this.intervals.map(r=>{let e=0,peak=0,detail=0;for(let i=r.start;i<r.end;i++){
      const v=this.samples[i];e+=v*v;peak=Math.max(peak,Math.abs(v));if(i>r.start)detail+=(v-this.samples[i-1])**2;}
      const rms=Math.sqrt(e/r.length);return {rms,crestDb:rms?20*Math.log10(peak/rms):0,detailRatio:Math.sqrt(detail/Math.max(e,1e-30)),transientRisk:false};});
    if(!prepared)for(let i=1;i<this.intervals.length;i++)if(this.features[i-1].transientRisk)this.intervals[i].seam=0;
    this.textureOccupancy=new Uint32Array(this.intervals.length);
    this.textureMix=1;
    this.textureSeed=(parseInt(asset.sha256?.slice(0,8)??'9e3779b9',16)^asset.frames^asset.sampleRate)>>>0;
    this.stats.texture={enabled:this.textureEnabled,basis:features?'rate-level-spectrum-gated-original-PCM':'rate-level-detail-gated-original-PCM',
      uniqueIntervals:0,cyclesAdvanced:0,phrasesStarted:0,minimumPoolCycles:null,maximumPoolCycles:0,transientRiskReads:0,
      maximumMaterialRateDifference:0,insufficientMaterialFrames:0,stateLocalFallbackFrames:0,texturePlanRefreshes:0,
      maximumReaderStepChange:undefined,minimumSpliceCorrelation:undefined,lowCoherenceSplices:undefined,modeRegistrations:undefined,chronologicalFrames:undefined,splices:undefined};
    // Materialize the reader's empty slots without inventing a reader or past
    // playback. First genuine synthesis fills these same formerly-lazy fields.
    this.head=undefined;this.join=undefined;this.texturePlan=undefined;this.lastPlanAnchor=undefined;
    this.lastPair=undefined;this.current=undefined;this.lastRate=undefined;this.pendingBoundary=undefined;
    if(prepared?.timeline)this.#sourceTimeline=prepared.timeline;
    this.#preparation=prepared??null;
    if(this.textureEnabled)this.#timeline();
  }
  pair(u,result={a:0,b:0,w:0,target:0},preparedScratch=false){
    const target=u*(this.asset.frames-1),r=this.intervals;let low=0,high=r.length-1;
    result.target=target;
    if(target<=r[0].centre){
      result.a=result.b=0;
      result.w=0;
    }else if(target>=r.at(-1).centre){
      result.a=result.b=r.length-1;
      result.w=0;
    }else{
      // The smoothed playback address normally stays in its previous
      // bracket. Check the same lower-bound inequalities as the search
      // before reusing it, including exact centre ties.
      let b=preparedScratch?result.b:0;
      if(b<=0||b>=r.length||!(target>r[b-1].centre&&target<=r[b].centre)){
        while(low<high){const mid=(low+high)>>1;if(r[mid].centre<target)low=mid+1;else high=mid;}
        b=low;
      }
      const a=Math.max(0,b-1);
      result.a=a;result.b=b;
      result.w=a===b?0:Math.max(0,Math.min(1,(target-r[a].centre)/(r[b].centre-r[a].centre)));
    }
    return result;
  }
  read(position){
    if(position<0||position>=this.samples.length){this.stats.sourceBoundViolations++;throw Error('source phase read escaped original PCM');}
    const k=Math.floor(position),next=Math.min(k+1,this.samples.length-1);
    this.stats.reads++;this.stats.minimumReadFrame=Math.min(this.stats.minimumReadFrame??k,k);
    this.stats.maximumReadFrame=Math.max(this.stats.maximumReadFrame??next,next);
    // The bounds/statistics already resolved these interpolation addresses.
    // Keep linear()'s multiplication/addition order without resolving twice.
    const f=position-k;
    return this.samples[k]*(1-f)+this.samples[next]*f;
  }
  cycle(r,output={value:0,energy:0}){
    const position=this.phase*r.length,p=Math.min(r.start+position,r.end-1e-9),k=Math.floor(p);
    // Interpolation at the final sample stays on this periodic span. Reading
    // the next state/file endpoint here would inject a boundary click.
    let first;
    if(k+1>=r.end){const w=(p-k)/(r.end-k);first=(1-w)*this.read(k)+w*this.read(r.start);}
    else first=this.read(p);
    if(!r.seam||position<=r.length-r.seam){
      output.value=first;output.energy=first*first;
    }else{
      const second=this.read(r.start+position-r.length),w=smooth((position-(r.length-r.seam))/r.seam);
      output.value=(1-w)*first+w*second;output.energy=(1-w)*first*first+w*second*second;
    }
    return output;
  }
  random(){this.textureSeed=(Math.imul(1664525,this.textureSeed)+1013904223)>>>0;return this.textureSeed/4294967296;}
  pool(p){
    const r=this.intervals,f=this.features,period=(1-p.w)*r[p.a].length+p.w*r[p.b].length;
    const baseRms=Math.sqrt((1-p.w)*f[p.a].rms**2+p.w*f[p.b].rms**2),valid=[];
    const mixFeature=key=>(1-p.w)*(f[p.a][key]??0)+p.w*(f[p.b][key]??0);
    const idle=this.asset.sustain?.state==='idle'||this.asset.playbackState==='idle';
    for(let i=0;i<r.length;i++){
      if(f[i].transientRisk)continue;
      // The whole verified idle recording is one operating state. Applying a
      // narrow moving-state address gate there needlessly freezes 1–3 cycles.
      if(idle){valid.push(i);continue;}
      if(Math.abs(r[i].centre-p.target)>.12*this.asset.frames||Math.abs(Math.log(r[i].length/period))>Math.log(1.05))continue;
      if(Math.abs(20*Math.log10(Math.max(f[i].rms,1e-12)/Math.max(baseRms,1e-12)))>3)continue;
      let compatible=true;
      if(f[i].bandFractions&&f[p.a].bandFractions&&f[p.b].bandFractions){
        for(const key of Object.keys(f[i].bandFractions)){
          const base=(1-p.w)*f[p.a].bandFractions[key]+p.w*f[p.b].bandFractions[key];
          if(Math.abs(10*Math.log10(Math.max(f[i].bandFractions[key],.001)/Math.max(base,.001)))>4)compatible=false;
        }
      }else if(Math.abs(20*Math.log10(Math.max(f[i].detailRatio??1,1e-5)/Math.max(mixFeature('detailRatio')||1,1e-5)))>6)compatible=false;
      if(compatible)valid.push(i);
    }
    // Retain ALL locally compatible contiguous runs. Choosing only the nearest
    // run can create an avoidable short loop despite other safe native cycles.
    // A phrase never crosses an incompatible or transient-marked hole.
    const runs=[];for(const i of valid){const last=runs.at(-1);if(last&&i===last[1]+1)last[1]=i;else runs.push([i,i]);}
    const distance=run=>p.target<r[run[0]].centre?r[run[0]].centre-p.target:p.target>r[run[1]].centre?p.target-r[run[1]].centre:0;
    runs.sort((a,b)=>distance(a)-distance(b));
    const run=runs[0]??[p.a,p.a];if(!runs.length)runs.push(run);
    check(!f[run[0]].transientRisk,'no safe compatible sustain material at requested state');
    const allowed=new Set();
    for(const [first,last] of runs)for(let i=first;i<=last;i++)allowed.add(i);
    const count=allowed.size,t=this.stats.texture;
    t.minimumPoolCycles=Math.min(t.minimumPoolCycles??count,count);t.maximumPoolCycles=Math.max(t.maximumPoolCycles,count);
    return {lo:Math.min(...allowed),hi:Math.max(...allowed),runs,allowed,count,start:Math.max(run[0],Math.min(run[1],p.a)),runEnd:run[1],period,anchor:p.a};
  }
  #indexPlaybackPlan(plan){
    const r=this.intervals;
    // Precompute the endpoint of each compatible native run. clockRoom and
    // waveform matching ask the same question repeatedly within this plan.
    // Adjacent indices with a gap in the underlying PCM remain separate.
    const end=new Uint32Array(r.length);
    for(const [first,last] of plan.runs){
      end[last]=last+1;
      for(let i=last-1;i>=first;i--)end[i]=r[i].end===r[i+1].start?end[i+1]:i+1;
    }
    contiguousEndByPlan.set(plan,{end,intervals:r,allowed:plan.allowed,runs:plan.runs});
  }
  // Metadata intervals define a source-time coordinate, not independent loops.
  // Within a contiguous run this reads original chronology without any blend.
  rateAt(u){const p=this.pair(u,this.#ratePair,this.#preparation!==null);return intervalRate(this.asset.sampleRate,this.intervals,p);}
  advanceHead(head,rate){
    const i=Math.floor(head.q),r=this.intervals[i],position=r.start+(head.q-i)*r.length,timeline=this.#timeline();
    let k=Math.floor(position);
    const fraction=position-k,target=(1-fraction)*timeline[k]+fraction*timeline[k+1]+rate/FS;
    while(k+1<timeline.length&&timeline[k+1]<=target)k++;
    check(k+1<timeline.length,'source-time advance escaped finite continuation');
    const next=k+(target-timeline[k])/(timeline[k+1]-timeline[k]),step=next-position;
    if(head.lastStep!==undefined)this.stats.texture.maximumReaderStepChange=Math.max(this.stats.texture.maximumReaderStepChange??0,Math.abs(step-head.lastStep));
    head.lastStep=step;
    let index=i;while(index+1<this.intervals.length&&next>=this.intervals[index].end)index++;
    head.q=index+(next-this.intervals[index].start)/this.intervals[index].length;
  }
  #timeline(){
    if(this.#sourceTimeline)return this.#sourceTimeline;
    let entries=sourceTimelines.get(this.samples);if(!entries){entries=new Map();sourceTimelines.set(this.samples,entries);}
    const key=this.intervals.map(r=>r.start+':'+r.end).join(',');
    if(entries.has(key))return this.#sourceTimeline=entries.get(key);
    const t=new Float64Array(this.asset.frames+1);
    for(let i=0;i<this.asset.frames;i++)t[i+1]=t[i]+this.rateAt((i+.5)/(this.asset.frames-1))/this.asset.sampleRate;
    entries.set(key,t);return this.#sourceTimeline=t;
  }
  coordinate(q){
    if(q===this.intervals.length)return this.#timeline()[this.intervals.at(-1).end];
    const i=Math.floor(q),r=this.intervals[i],p=r.start+(q-i)*r.length,k=Math.floor(p),w=p-k,t=this.#timeline();
    return (1-w)*t[k]+w*t[k+1];
  }
  clockRoom(q,plan){
    const amount=this.available(q,plan);return amount>0?this.coordinate(q+amount)-this.coordinate(q):0;
  }
  sourceHead(p){
    let i=p.a;while(i+1<this.intervals.length&&p.target>=this.intervals[i].end)i++;
    const r=this.intervals[i];return {q:i+Math.max(0,Math.min(.999999999,(p.target-r.start)/r.length))};
  }
  sampleHead(q,track=false){
    const i=Math.floor(q),r=this.intervals[i];check(r&&q>=0&&q<this.intervals.length,'continuous source cursor escaped PCM');
    let position=r.start+(q-i)*r.length;
    if(track&&(!this.texturePlan?.allowed.has(i+1)||this.features[i+1]?.transientRisk))position=Math.min(position,r.end-1);
    if(track){if(!this.textureOccupancy[i]++)this.stats.texture.uniqueIntervals++;
      this.stats.minimumSelectedInterval=Math.min(this.stats.minimumSelectedInterval??i,i);this.stats.maximumSelectedInterval=Math.max(this.stats.maximumSelectedInterval??i,i);
      if(this.features[i].transientRisk)this.stats.texture.transientRiskReads++;}
    if(track)this.stats.texture.maximumMaterialRateDifference=Math.max(this.stats.texture.maximumMaterialRateDifference,Math.abs(r.length*(this.lastRate??this.rateAt(this.state??.5))/this.asset.sampleRate-1));
    return this.read(position);
  }
  available(q,plan){
    const i=Math.floor(q),indexed=contiguousEndByPlan.get(plan);
    if(indexed&&indexed.intervals===this.intervals&&indexed.allowed===plan.allowed&&indexed.runs===plan.runs)
      return indexed.end[i]?indexed.end[i]-q:0;
    let last=i;
    if(!plan.allowed.has(i))return 0;
    while(last+1<this.intervals.length&&plan.allowed.has(last+1)&&this.intervals[last].end===this.intervals[last+1].start)last++;
    return last+1-q;
  }
  prepareInitialMatch01(){
    check(this.frame===0,'initial waveform preparation requires an untouched disposable voice');
    this.#prepareInitialMatch=true;
  }
  get reusedInitialMatch01(){return this.#reusedInitialMatch;}
  matchHead(reference,plan){
    const possible=[...plan.allowed].filter(i=>this.available(i,plan)>=2);
    const list=possible.length?possible:[...plan.allowed];check(list.length,'safe source continuation required');
    const longestRun=Math.max(...plan.runs.map(([a,b])=>b-a+1));
    const horizon=Math.min(1,longestRun/2,(reference.voice.intervals.length-reference.q)*.99),n=matchSamples;
    check(horizon>0,'outgoing source continuation must remain bounded');
    const previous=reference.voice,sameVoice=previous===this;
    const canReuse=!sameVoice&&this.#preparation&&previous.#preparation&&
      !this.frame&&!previous.frame&&!this.stats.reads&&!previous.stats.reads&&plan.runs.length<=16;
    const referenceSamples=()=>Float64Array.from({length:n},(_,k)=>previous.sampleHead(reference.q+horizon*k/n));
    // Keep the reference reads ahead of rate and RNG work on the ordinary
    // search, including failure and custom reader behavior.
    const targetBeforeMatch=canReuse?null:referenceSamples();
    const minimumRoom=Math.min(.5,Math.max(.000001,4*this.rateAt(this.state??.5)/FS));
    const requiredRoom=Math.max(horizon,minimumRoom);
    // The reference and plan stay fixed throughout this synchronous search.
    // Reuse their room while retaining candidate order and every PCM score.
    const selfRoom=sameVoice&&longestRun>=3?
      Math.min(this.available(reference.q,plan)+.5,longestRun*.75):0;
    // For virgin cross-mode readers, the complete search is a function of
    // these exact inputs. Preparation uses disposable voices and copies the
    // resulting coordinates, RNG and read diagnostics into the live search
    // only when its inputs match. Reacquisition or a different plan searches
    // normally. Nothing here advances either reader.
    let byReference=null,key=null;
    if(canReuse){
      let byIncoming=initialMatches.get(this.#preparation);
      if(!byIncoming&&this.#prepareInitialMatch)initialMatches.set(this.#preparation,byIncoming=new WeakMap());
      byReference=byIncoming?.get(previous.#preparation);
      if(byIncoming&&!byReference&&this.#prepareInitialMatch)byIncoming.set(previous.#preparation,byReference=new Map());
      if(byReference){
        key=JSON.stringify([reference.q,horizon,requiredRoom,this.textureSeed,plan.runs]);
        const cached=byReference.get(key);
        if(cached){
          for(const [voice,reads] of [[previous,cached.referenceReads],[this,cached.candidateReads]])Object.assign(voice.stats,reads);
          this.textureSeed=cached.seed;
          this.#reusedInitialMatch=true;
          return this.finishMatch(cached.q,cached.correlation);
        }
      }
    }
    const target=targetBeforeMatch??referenceSamples();
    // Scores are consumed immediately by this search. Retain scalar results
    // instead of a result per probe and a copy of each improved best.
    let correlation=0;
    const score=q=>{let diff=0,energy=0,xy=0,xx=0,yy=0;
      if(q<0||q+horizon>this.intervals.length){correlation=0;return Infinity;}
      const room=this.available(q,plan);
      if(room<requiredRoom){correlation=0;return Infinity;}
      if(sameVoice&&longestRun>=3&&room<selfRoom){correlation=0;return Infinity;}
      if(sameVoice&&longestRun>=8&&room<longestRun*.5){correlation=0;return Infinity;}
      for(let k=0;k<n;k++){const x=target[k],y=this.sampleHead(q+horizon*k/n);diff+=(x-y)**2;energy+=x*x+y*y;xy+=x*y;xx+=x*x;yy+=y*y;}
      const error=diff/Math.max(energy,1e-20);correlation=xy/Math.sqrt(Math.max(xx*yy,1e-30));return error;};
    // First test the existing phase: identical periodic inputs need no shift.
    let bestQ=null,bestError=Infinity,bestCorrelation=0;const phase=((reference.q%1)+1)%1;
    const candidates=[];for(let k=0;k<Math.min(12,list.length);k++){
      const i=list[Math.min(list.length-1,Math.floor((k+this.random()*.5)*list.length/Math.min(12,list.length)))];
      if(!candidates.includes(i))candidates.push(i);
    }
    for(const i of candidates){
      const q=i+phase,error=score(q);if(bestQ===null||error<bestError){bestQ=q;bestError=error;bestCorrelation=correlation;}
      if(error<1e-12)break;
      for(let j=0;j<32;j++){const q=i+j/32,error=score(q);if(error<bestError){bestQ=q;bestError=error;bestCorrelation=correlation;}}
    }
    for(const step of [1/256,1/2048]){const centre=bestQ;for(let k=-8;k<=8;k++){const q=centre+k*step,error=score(q);if(error<bestError){bestQ=q;bestError=error;bestCorrelation=correlation;}}}
    check(Number.isFinite(bestError),'no bounded waveform continuation');
    if(byReference&&this.#prepareInitialMatch&&byReference.size<16){
      const reads=({reads,minimumReadFrame,maximumReadFrame})=>({reads,minimumReadFrame,maximumReadFrame});
      byReference.set(key,{q:bestQ,correlation:bestCorrelation,seed:this.textureSeed,referenceReads:reads(previous.stats),candidateReads:reads(this.stats)});
    }
    return this.finishMatch(bestQ,bestCorrelation);
  }
  finishMatch(q,correlation){
    this.stats.texture.minimumSpliceCorrelation=Math.min(this.stats.texture.minimumSpliceCorrelation??1,correlation);
    if(correlation<.8)this.stats.texture.lowCoherenceSplices=(this.stats.texture.lowCoherenceSplices??0)+1;
    return {q,correlation};
  }
  alignTo(reference,u,rateHz){
    if(!this.textureEnabled||!reference.textureEnabled)return false;
    if(reference.state===null)reference.state=.5;
    if(!reference.head)reference.head=reference.sourceHead(reference.pair(reference.state));
    this.state=u;const plan=this.pool(this.pair(u));
    if(this.#preparation)this.#indexPlaybackPlan(plan);
    this.head=this.matchHead({voice:reference,q:reference.head.q},plan);this.join=null;
    // Only the previously inaudible reader is registered. No reference reset,
    // no engine/exhaust phase lock, and no added oscillator or pitch jitter.
    this.phase=reference.phase;this.texturePlan=plan;this.lastPlanAnchor=plan.anchor;
    this.stats.texture.modeRegistrations=(this.stats.texture.modeRegistrations??0)+1;
    return true;
  }
  continuous(p,rate,output={value:0,energy:0}){
    if(!this.texturePlan||p.a!==this.lastPlanAnchor){
      this.texturePlan=this.pool(p);this.lastPlanAnchor=p.a;
      if(this.#preparation)this.#indexPlaybackPlan(this.texturePlan);
    }
    const plan=this.texturePlan,delta=rate/FS;
    if(plan.count<2){
      // Sparse support cannot supply a multi-cycle chronological continuation.
      // Keep the bounded phase-pair approximation explicit for that case only.
      this.stats.texture.insufficientMaterialFrames++;this.head=null;this.join=null;
      const ia=this.features[p.a].transientRisk?plan.start:p.a,ib=this.features[p.b].transientRisk?plan.start:p.b;
      const a=this.cycle(this.intervals[ia]),b=this.cycle(this.intervals[ib]);
      output.value=(1-p.w)*a.value+p.w*b.value;
      output.energy=(1-p.w)*a.energy+p.w*b.energy;
      return output;
    }
    if(!this.head){this.head=this.sourceHead(p);if(!plan.allowed.has(Math.floor(this.head.q)))this.head={q:plan.start+this.phase};}
    const reserve=Math.min(1,Math.max(.25,rate*.025));
    if(!this.join&&this.clockRoom(this.head.q,plan)<reserve+delta){
      const incoming=this.matchHead({voice:this,q:this.head.q},plan);
      let safeEnd=Math.floor(this.head.q)+1;
      while(safeEnd<this.intervals.length&&!this.features[safeEnd].transientRisk&&this.intervals[safeEnd-1].end===this.intervals[safeEnd].start)safeEnd++;
      const compatibleRoom=this.clockRoom(this.head.q,plan);
      const room=Math.min(this.coordinate(safeEnd)-this.coordinate(this.head.q),this.clockRoom(incoming.q,plan),compatibleRoom>0?compatibleRoom:Infinity);
      const cycles=Math.max(delta,Math.min(reserve,room-2*delta));
      this.join={incoming,age:0,cycles};this.stats.texture.phrasesStarted++;
      this.stats.texture.splices=(this.stats.texture.splices??0)+1;
    }
    const outgoing=this.head,a=this.sampleHead(outgoing.q,true);let value=a,energy=a*a;
    if(this.join){const j=this.join,b=this.sampleHead(j.incoming.q,true),w=smooth(Math.min(1,j.age/j.cycles));
      value=(1-w)*a+w*b;energy=(1-w)*a*a+w*b*b;this.advanceHead(j.incoming,rate);j.age+=delta;
      if(j.age>=j.cycles){this.head=j.incoming;this.join=null;}}
    else this.stats.texture.chronologicalFrames=(this.stats.texture.chronologicalFrames??0)+1;
    // Both heads advance by exactly the same requested interval phase. Native
    // interval boundaries are traversed in order, without shortening a period.
    if(this.head===outgoing)this.advanceHead(outgoing,rate);
    this.stats.texture.cyclesAdvanced=this.clockCycles;
    if(plan.count<4)this.stats.texture.insufficientMaterialFrames++;
    output.value=value;output.energy=energy;return output;
  }
  next(u,externalRateHz=null){
    check(Number.isFinite(u)&&u>=0&&u<=1,'normalized authored source position required');
    const starting=this.state===null;
    if(starting)this.state=u;
    else this.state+=stateAlpha*(u-this.state);
    // Once a single-span reader has established its initial phase, its
    // smoothed address cannot select another interval or alter interpolation.
    const p=!starting&&this.intervals.length===1&&this.pair===StockGrainVoice.prototype.pair?
      this.#singlePair:this.pair(this.state,this.#nextPair,this.#preparation!==null);
    const a=this.intervals[p.a],b=this.intervals[p.b];
    if(starting){
      // Keep each recording's own source-time phase. No imposed common
      // oscillator/phase lock between distinct engine and exhaust recordings.
      this.phase=((p.target-a.start)/a.length%1+1)%1;
    }
    if(this.lastPair!==undefined&&this.lastPair!==p.a)this.stats.stateSwitches++;
    this.lastPair=p.a;this.current=a;
    let value,energy;
    const rate=externalRateHz??this.asset.sampleRate/((1-p.w)*a.length+p.w*b.length);
    check(Number.isFinite(rate)&&rate>0&&rate<=FS/8,'bounded source interval clock');
    this.lastRate=rate;
    if(this.textureEnabled){const x=this.continuous(p,rate,this.#nextOutput);value=x.value;energy=x.energy;}
    else{const x=this.cycle(a,this.#firstCycle),y=p.a===p.b?x:this.cycle(b,this.#secondCycle);value=(1-p.w)*x.value+p.w*y.value;energy=(1-p.w)*x.energy+p.w*y.energy;}
    if(this.pendingBoundary)this.maximumBoundaryStep=Math.max(this.maximumBoundaryStep,Math.abs(value-this.previous));
    this.stats.minimumIntervalRateHz=Math.min(this.stats.minimumIntervalRateHz,rate);this.stats.maximumIntervalRateHz=Math.max(this.stats.maximumIntervalRateHz,rate);
    this.stats.minimumSelectedInterval=Math.min(this.stats.minimumSelectedInterval??p.a,p.a);
    this.stats.maximumSelectedInterval=Math.max(this.stats.maximumSelectedInterval??p.b,p.b);
    this.phase+=rate/FS;
    this.pendingBoundary=this.phase>=1;
    if(this.pendingBoundary){const turns=Math.floor(this.phase);this.phase-=turns;this.clockCycles+=turns;this.stats.crossfades+=turns;}
    check(Number.isFinite(value)&&Math.abs(value)<=1+1e-12,'bounded phase-clock source output');
    this.lastExpectedEnergy=energy;this.expectedEnergy+=energy;this.outputEnergy+=value*value;
    this.previous=value;this.frame++;return value;
  }
}
