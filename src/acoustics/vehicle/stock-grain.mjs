// Genuine PCM with a continuous interval-phase clock. Metadata spans are cycle-
// rate evidence, not recovered crank RPM or a claim of GTA's native algorithm.
const FS=48000;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const smooth=x=>x*x*(3-2*x);
const sourceTimelines=new WeakMap();
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
  constructor(asset,{regions=null,texture=true}={}){
    this.samples=validated(asset);this.asset=asset;this.increment=asset.sampleRate/FS;
    const supplied=regions?.candidateIntervals??regions??asset.intervals;
    check(supplied==null||Array.isArray(supplied),'ordered source interval array required');
    this.intervalBasis=supplied?.length?'observed-offset-whole-interval-phase-approximation':'waveform-matched-long-idle-loop-approximation';
    const selected=supplied?.length?supplied:[idleLoop(this.samples,asset.sampleRate)];
    this.intervals=selected.map((r,i)=>{
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
    if(features)check(features.length===this.intervals.length&&features.every((f,i)=>f.index===i&&f.startFrame===this.intervals[i].start&&f.endFrame===this.intervals[i].end),'sustain features must bind exact source intervals');
    this.features=features??this.intervals.map(r=>{let e=0,peak=0,detail=0;for(let i=r.start;i<r.end;i++){
      const v=this.samples[i];e+=v*v;peak=Math.max(peak,Math.abs(v));if(i>r.start)detail+=(v-this.samples[i-1])**2;}
      const rms=Math.sqrt(e/r.length);return {rms,crestDb:rms?20*Math.log10(peak/rms):0,detailRatio:Math.sqrt(detail/Math.max(e,1e-30)),transientRisk:false};});
    for(let i=1;i<this.intervals.length;i++)if(this.features[i-1].transientRisk)this.intervals[i].seam=0;
    this.textureOccupancy=new Uint32Array(this.intervals.length);
    this.textureMix=1;
    this.textureSeed=(parseInt(asset.sha256?.slice(0,8)??'9e3779b9',16)^asset.frames^asset.sampleRate)>>>0;
    this.stats.texture={enabled:this.textureEnabled,basis:features?'rate-level-spectrum-gated-original-PCM':'rate-level-detail-gated-original-PCM',
      uniqueIntervals:0,cyclesAdvanced:0,phrasesStarted:0,minimumPoolCycles:null,maximumPoolCycles:0,transientRiskReads:0,
      maximumMaterialRateDifference:0,insufficientMaterialFrames:0,stateLocalFallbackFrames:0,texturePlanRefreshes:0};
    if(this.textureEnabled)this.timeline();
  }
  pair(u){
    const target=u*(this.asset.frames-1),r=this.intervals;let low=0,high=r.length-1;
    if(target<=r[0].centre)return {a:0,b:0,w:0,target};
    if(target>=r.at(-1).centre)return {a:r.length-1,b:r.length-1,w:0,target};
    while(low<high){const mid=(low+high)>>1;if(r[mid].centre<target)low=mid+1;else high=mid;}
    const b=low,a=Math.max(0,b-1);
    const w=a===b?0:Math.max(0,Math.min(1,(target-r[a].centre)/(r[b].centre-r[a].centre)));
    return {a,b,w,target};
  }
  read(position){
    if(position<0||position>=this.samples.length){this.stats.sourceBoundViolations++;throw Error('source phase read escaped original PCM');}
    const k=Math.floor(position),next=Math.min(k+1,this.samples.length-1);
    this.stats.reads++;this.stats.minimumReadFrame=Math.min(this.stats.minimumReadFrame??k,k);
    this.stats.maximumReadFrame=Math.max(this.stats.maximumReadFrame??next,next);
    return linear(this.samples,position);
  }
  cycle(r){
    const position=this.phase*r.length,p=Math.min(r.start+position,r.end-1e-9),k=Math.floor(p);
    // Interpolation at the final sample stays on this periodic span. Reading
    // the next state/file endpoint here would inject a boundary click.
    let first;
    if(k+1>=r.end){const w=(p-k)/(r.end-k);first=(1-w)*this.read(k)+w*this.read(r.start);}
    else first=this.read(p);
    if(!r.seam||position<=r.length-r.seam)return {value:first,energy:first*first};
    const second=this.read(r.start+position-r.length),w=smooth((position-(r.length-r.seam))/r.seam);
    return {value:(1-w)*first+w*second,energy:(1-w)*first*first+w*second*second};
  }
  random(){this.textureSeed=(Math.imul(1664525,this.textureSeed)+1013904223)>>>0;return this.textureSeed/4294967296;}
  pool(p){
    const r=this.intervals,f=this.features,period=(1-p.w)*r[p.a].length+p.w*r[p.b].length;
    const baseRms=Math.sqrt((1-p.w)*f[p.a].rms**2+p.w*f[p.b].rms**2),valid=[];
    const mixFeature=key=>(1-p.w)*(f[p.a][key]??0)+p.w*(f[p.b][key]??0);
    const idle=this.asset.sustain?.state==='idle';
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
    const allowed=new Set(runs.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i))),count=allowed.size,t=this.stats.texture;
    t.minimumPoolCycles=Math.min(t.minimumPoolCycles??count,count);t.maximumPoolCycles=Math.max(t.maximumPoolCycles,count);
    return {lo:Math.min(...allowed),hi:Math.max(...allowed),runs,allowed,count,start:Math.max(run[0],Math.min(run[1],p.a)),runEnd:run[1],period,anchor:p.a};
  }
  // Metadata intervals define a source-time coordinate, not independent loops.
  // Within a contiguous run this reads original chronology without any blend.
  rateAt(u){const p=this.pair(u);return this.asset.sampleRate/((1-p.w)*this.intervals[p.a].length+p.w*this.intervals[p.b].length);}
  advanceHead(head,rate){
    const i=Math.floor(head.q),r=this.intervals[i],position=r.start+(head.q-i)*r.length,timeline=this.timeline();
    const target=this.coordinate(head.q)+rate/FS;
    let k=Math.floor(position);while(k+1<timeline.length&&timeline[k+1]<=target)k++;
    check(k+1<timeline.length,'source-time advance escaped finite continuation');
    const next=k+(target-timeline[k])/(timeline[k+1]-timeline[k]),step=next-position;
    if(head.lastStep!==undefined)this.stats.texture.maximumReaderStepChange=Math.max(this.stats.texture.maximumReaderStepChange??0,Math.abs(step-head.lastStep));
    head.lastStep=step;
    let index=i;while(index+1<this.intervals.length&&next>=this.intervals[index].end)index++;
    head.q=index+(next-this.intervals[index].start)/this.intervals[index].length;
  }
  timeline(){
    if(this.sourceTimeline)return this.sourceTimeline;
    let entries=sourceTimelines.get(this.samples);if(!entries){entries=new Map();sourceTimelines.set(this.samples,entries);}
    const key=this.intervals.map(r=>r.start+':'+r.end).join(',');
    if(entries.has(key))return this.sourceTimeline=entries.get(key);
    const t=new Float64Array(this.asset.frames+1);
    for(let i=0;i<this.asset.frames;i++)t[i+1]=t[i]+this.rateAt((i+.5)/(this.asset.frames-1))/this.asset.sampleRate;
    entries.set(key,t);return this.sourceTimeline=t;
  }
  coordinate(q){
    if(q===this.intervals.length)return this.timeline()[this.intervals.at(-1).end];
    const i=Math.floor(q),r=this.intervals[i],p=r.start+(q-i)*r.length,k=Math.floor(p),w=p-k,t=this.timeline();
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
    const i=Math.floor(q);let last=i;
    if(!plan.allowed.has(i))return 0;
    while(last+1<this.intervals.length&&plan.allowed.has(last+1)&&this.intervals[last].end===this.intervals[last+1].start)last++;
    return last+1-q;
  }
  matchHead(reference,plan){
    const possible=[...plan.allowed].filter(i=>this.available(i,plan)>=2);
    const list=possible.length?possible:[...plan.allowed];check(list.length,'safe source continuation required');
    const longestRun=Math.max(...plan.runs.map(([a,b])=>b-a+1));
    const horizon=Math.min(1,longestRun/2,(reference.voice.intervals.length-reference.q)*.99),n=64;
    check(horizon>0,'outgoing source continuation must remain bounded');
    const target=Float64Array.from({length:n},(_,k)=>reference.voice.sampleHead(reference.q+horizon*k/n));
    const minimumRoom=Math.min(.5,Math.max(.000001,4*this.rateAt(this.state??.5)/FS));
    const score=q=>{let diff=0,energy=0,xy=0,xx=0,yy=0;
      if(q<0||q+horizon>this.intervals.length||this.available(q,plan)<Math.max(horizon,minimumRoom))return {error:Infinity,correlation:0};
      if(reference.voice===this&&longestRun>=3&&this.available(q,plan)<Math.min(this.available(reference.q,plan)+.5,longestRun*.75))return {error:Infinity,correlation:0};
      if(reference.voice===this&&longestRun>=8&&this.available(q,plan)<longestRun*.5)return {error:Infinity,correlation:0};
      for(let k=0;k<n;k++){const x=target[k],y=this.sampleHead(q+horizon*k/n);diff+=(x-y)**2;energy+=x*x+y*y;xy+=x*y;xx+=x*x;yy+=y*y;}
      return {error:diff/Math.max(energy,1e-20),correlation:xy/Math.sqrt(Math.max(xx*yy,1e-30))};};
    // First test the existing phase: identical periodic inputs need no shift.
    let best=null;const phase=((reference.q%1)+1)%1;
    const candidates=[];for(let k=0;k<Math.min(12,list.length);k++){
      const i=list[Math.min(list.length-1,Math.floor((k+this.random()*.5)*list.length/Math.min(12,list.length)))];
      if(!candidates.includes(i))candidates.push(i);
    }
    for(const i of candidates){
      const q=i+phase,c=score(q);if(!best||c.error<best.error)best={q,...c};
      if(c.error<1e-12)break;
      for(let j=0;j<32;j++){const q=i+j/32,c=score(q);if(c.error<best.error)best={q,...c};}
    }
    for(const step of [1/256,1/2048]){const centre=best.q;for(let k=-8;k<=8;k++){const q=centre+k*step,c=score(q);if(c.error<best.error)best={q,...c};}}
    check(Number.isFinite(best.error),'no bounded waveform continuation');
    this.stats.texture.minimumSpliceCorrelation=Math.min(this.stats.texture.minimumSpliceCorrelation??1,best.correlation);
    if(best.correlation<.8)this.stats.texture.lowCoherenceSplices=(this.stats.texture.lowCoherenceSplices??0)+1;
    return {q:best.q,correlation:best.correlation};
  }
  alignTo(reference,u,rateHz){
    if(!this.textureEnabled||!reference.textureEnabled)return false;
    if(reference.state===null)reference.state=.5;
    if(!reference.head)reference.head=reference.sourceHead(reference.pair(reference.state));
    this.state=u;const plan=this.pool(this.pair(u));
    this.head=this.matchHead({voice:reference,q:reference.head.q},plan);this.join=null;
    // Only the previously inaudible reader is registered. No reference reset,
    // no engine/exhaust phase lock, and no added oscillator or pitch jitter.
    this.phase=reference.phase;this.texturePlan=plan;this.lastPlanAnchor=plan.anchor;
    this.stats.texture.modeRegistrations=(this.stats.texture.modeRegistrations??0)+1;
    return true;
  }
  continuous(p,rate){
    if(!this.texturePlan||p.a!==this.lastPlanAnchor){this.texturePlan=this.pool(p);this.lastPlanAnchor=p.a;}
    const plan=this.texturePlan,delta=rate/FS;
    if(plan.count<2){
      // Sparse support cannot supply a multi-cycle chronological continuation.
      // Keep the bounded phase-pair approximation explicit for that case only.
      this.stats.texture.insufficientMaterialFrames++;this.head=null;this.join=null;
      const ia=this.features[p.a].transientRisk?plan.start:p.a,ib=this.features[p.b].transientRisk?plan.start:p.b;
      const a=this.cycle(this.intervals[ia]),b=this.cycle(this.intervals[ib]);
      return {value:(1-p.w)*a.value+p.w*b.value,energy:(1-p.w)*a.energy+p.w*b.energy};
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
    return {value,energy};
  }
  next(u,externalRateHz=null){
    check(Number.isFinite(u)&&u>=0&&u<=1,'normalized authored source position required');
    if(this.state===null){this.state=u;const p=this.pair(u),r=this.intervals[p.a];
      // Keep each recording's own source-time phase. No imposed common
      // oscillator/phase lock between distinct engine and exhaust recordings.
      this.phase=((p.target-r.start)/r.length%1+1)%1;
    }else this.state+=(1-Math.exp(-1/(FS*.01)))*(u-this.state);
    const p=this.pair(this.state),a=this.intervals[p.a],b=this.intervals[p.b];
    if(this.lastPair!==undefined&&this.lastPair!==p.a)this.stats.stateSwitches++;
    this.lastPair=p.a;this.current=a;
    let value,energy;
    const period=(1-p.w)*a.length+p.w*b.length;
    const rate=externalRateHz??this.asset.sampleRate/period;
    check(Number.isFinite(rate)&&rate>0&&rate<=FS/8,'bounded source interval clock');
    this.lastRate=rate;
    if(this.textureEnabled){const x=this.continuous(p,rate);value=x.value;energy=x.energy;}
    else{const x=this.cycle(a),y=p.a===p.b?x:this.cycle(b);value=(1-p.w)*x.value+p.w*y.value;energy=(1-p.w)*x.energy+p.w*y.energy;}
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
