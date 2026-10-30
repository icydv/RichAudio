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
  constructor(asset,{regions=null}={}){
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
    const x=this.cycle(a),y=p.a===p.b?x:this.cycle(b);
    const value=(1-p.w)*x.value+p.w*y.value,energy=(1-p.w)*x.energy+p.w*y.energy;
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
