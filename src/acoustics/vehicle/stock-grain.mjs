// Genuine PCM with a continuous interval-phase clock. Metadata spans are cycle-
// rate evidence, not recovered crank RPM or a claim of GTA's native algorithm.
const FS=48000;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const smooth=x=>x*x*(3-2*x);
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
    for(let i=0;i<r.length;i++){
      if(f[i].transientRisk||Math.abs(r[i].centre-p.target)>.12*this.asset.frames||Math.abs(Math.log(r[i].length/period))>Math.log(1.05))continue;
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
  refill(plan){
    const chunks=[];
    for(const [lo,hi] of plan.runs){
      const count=hi-lo+1,size=count<=2?1:Math.min(8,Math.max(2,Math.floor(count/2))),stride=Math.max(1,Math.floor(size/2));
      for(let first=lo;first+size-1<=hi;first+=stride)chunks.push([first,first+size-1]);
      if(chunks.at(-1)?.[0]!==hi-size+1)chunks.push([hi-size+1,hi]);
    }
    for(let i=chunks.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[chunks[i],chunks[j]]=[chunks[j],chunks[i]];}
    // No immediate repeated phrase, including the boundary between bags.
    if(chunks.length>1&&chunks.at(-1)[0]===this.textureLastPhrase){[chunks[0],chunks[chunks.length-1]]=[chunks.at(-1),chunks[0]];}
    this.textureBag=chunks;
  }
  transitionCost(from,to){
    const a=this.intervals[from],b=this.intervals[to];let difference=0,ea=0,eb=0;
    for(let k=0;k<128;k++){const phase=(k+.5)/128,x=linear(this.samples,a.start+phase*a.length),y=linear(this.samples,b.start+phase*b.length);
      difference+=(x-y)**2;ea+=x*x;eb+=y*y;}
    return Math.sqrt(difference/Math.max(Math.sqrt(ea*eb),1e-30));
  }
  textureNext(current,p){
    let plan=this.texturePlan;
    // Re-evaluate at phrase/state boundaries, outside the per-sample waveform
    // loop. Period/phase still follow the requested state, never the bag order.
    if(!plan||plan.anchor!==p.a){plan=this.pool(p);this.texturePlan=plan;this.textureBag=[];this.textureEnd=null;}
    if(plan.allowed.has(current)&&plan.allowed.has(current+1)&&this.textureEnd!==null&&current<this.textureEnd)return current+1;
    if(!this.textureBag?.length)this.refill(plan);
    if(this.textureBag.length>1&&this.textureBag.at(-1)[0]===current){const j=this.textureBag.findIndex(c=>c[0]!==current);[this.textureBag[j],this.textureBag[this.textureBag.length-1]]=[this.textureBag.at(-1),this.textureBag[j]];}
    // Prefer a compatible waveform continuation, with bounded seeded choice
    // among close candidates; never randomize phase, pitch or sample values.
    const ranked=this.textureBag.map((chunk,index)=>({chunk,index,cost:this.transitionCost(current,chunk[0])})).sort((a,b)=>a.cost-b.cost);
    const choices=ranked.filter(c=>c.cost<=ranked[0].cost+.15).slice(0,3),pick=choices[Math.floor(this.random()**3*choices.length)];
    const [chunk]=this.textureBag.splice(pick.index,1);this.textureEnd=chunk[1];this.textureLastPhrase=chunk[0];this.stats.texture.phrasesStarted++;
    return chunk[0];
  }
  safeStatePair(p){
    if(!this.features[p.a].transientRisk&&!this.features[p.b].transientRisk)return p;
    let a=p.a,b=p.b;while(a>=0&&this.features[a].transientRisk)a--;while(b<this.intervals.length&&this.features[b].transientRisk)b++;
    if(a<0)a=b;if(b>=this.intervals.length)b=a;
    check(a>=0&&b<this.intervals.length&&!this.features[a].transientRisk&&!this.features[b].transientRisk,'no safe state-local source material');
    const left=this.intervals[a].centre,right=this.intervals[b].centre,w=a===b?0:Math.max(0,Math.min(1,(p.target-left)/(right-left)));
    return {a,b,w,target:p.target};
  }
  textureCycle(p){
    if(!this.texturePlan){this.texturePlan=this.pool(p);const plan=this.texturePlan;
      this.textureCurrent=plan.start;this.textureEnd=Math.min(plan.runEnd,this.textureCurrent+7);
      this.textureUpcoming=this.textureNext(this.textureCurrent,p);}
    if(this.pendingBoundary){this.textureCurrent=this.textureUpcoming;this.textureUpcoming=this.textureNext(this.textureCurrent,p);this.stats.texture.cyclesAdvanced++;}
    const ia=this.textureCurrent,ib=this.textureUpcoming;
    for(const i of [ia,ib]){if(!this.textureOccupancy[i]++)this.stats.texture.uniqueIntervals++;
      if(this.features[i].transientRisk)this.stats.texture.transientRiskReads++;
      this.stats.minimumSelectedInterval=Math.min(this.stats.minimumSelectedInterval??i,i);this.stats.maximumSelectedInterval=Math.max(this.stats.maximumSelectedInterval??i,i);
      const target=(1-p.w)*this.intervals[p.a].length+p.w*this.intervals[p.b].length;
      this.stats.texture.maximumMaterialRateDifference=Math.max(this.stats.texture.maximumMaterialRateDifference,Math.abs(this.intervals[i].length/target-1));}
    if(this.texturePlan.count<4)this.stats.texture.insufficientMaterialFrames++;
    const a=this.cycle(this.intervals[ia]),b=ia===ib?a:this.cycle(this.intervals[ib]),w=smooth(this.phase);
    // Adjacent source cycles evolve at the same continuously advancing phase.
    // The full synthesis period is retained; no incoming clock runs early.
    return {value:(1-w)*a.value+w*b.value,energy:(1-w)*a.energy+w*b.energy};
  }
  next(u){
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
    if(this.textureEnabled){
      const texture=this.textureCycle(p),target=(1-p.w)*a.length+p.w*b.length,w=smooth(this.phase);
      const currentMismatch=Math.abs(this.intervals[this.textureCurrent].length/target-1),nextMismatch=Math.abs(this.intervals[this.textureUpcoming].length/target-1);
      const compatible=(1-w<.001||currentMismatch<=.05+1e-12)&&(w<.001||nextMismatch<=.05+1e-12);
      // A rapid state change must not drag an obsolete recorded-RPM region
      // through the new clock. Fade to the contemporaneous state-local pair;
      // refresh the texture plan only while it is inaudible. Phase never resets.
      this.textureMix+=(1-Math.exp(-1/(FS*.005)))*((compatible?1:0)-this.textureMix);
      this.fallbackPair=null;
      if(this.textureMix<.999999){
        this.stats.texture.stateLocalFallbackFrames++;
        const q=this.safeStatePair(p);this.fallbackPair=q;this.stats.maximumConcurrentHeads=4;
        const x=this.cycle(this.intervals[q.a]),y=q.a===q.b?x:this.cycle(this.intervals[q.b]),baseValue=(1-q.w)*x.value+q.w*y.value,baseEnergy=(1-q.w)*x.energy+q.w*y.energy;
        value=this.textureMix*texture.value+(1-this.textureMix)*baseValue;energy=this.textureMix*texture.energy+(1-this.textureMix)*baseEnergy;
      }else{value=texture.value;energy=texture.energy;}
      if(!compatible&&this.textureMix<.001){this.texturePlan=null;this.textureBag=[];this.stats.texture.texturePlanRefreshes++;}
    }
    else{const x=this.cycle(a),y=p.a===p.b?x:this.cycle(b);value=(1-p.w)*x.value+p.w*y.value;energy=(1-p.w)*x.energy+p.w*y.energy;}
    if(this.pendingBoundary)this.maximumBoundaryStep=Math.max(this.maximumBoundaryStep,Math.abs(value-this.previous));
    const period=(1-p.w)*a.length+p.w*b.length,rate=this.asset.sampleRate/period;
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
