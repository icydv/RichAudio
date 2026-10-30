// Authored overlap playback of genuine decoded PCM. Offset intervals are an
// explicit segmentation approximation, not recovered native granular/RPM logic.
const FS=48000;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const mix=x=>x*x*(3-2*x);

export class StockGrainVoice {
  constructor(asset,{regions=null}={}){
    const samples=asset.samplesFloat32??asset.samples;
    check(samples instanceof Float32Array&&samples.length===asset.frames&&asset.frames>=16,'bounded decoded PCM required');
    check(Number.isInteger(asset.sampleRate)&&asset.sampleRate>=8000&&asset.sampleRate<=192000,'native sample rate required');
    check(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<=1),'finite bounded source PCM required');
    this.asset=asset;this.samples=samples;this.increment=asset.sampleRate/FS;
    const supplied=regions?.candidateIntervals??regions??asset.intervals;
    check(supplied==null||Array.isArray(supplied),'ordered source interval array required');
    this.intervalBasis=supplied?.length?'observed-offset-segmentation-approximation':'whole-source-fallback-no-native-grain-claim';
    const selected=supplied?.length?supplied:[{startFrame:0,endFrame:asset.frames}];
    this.intervals=selected.map((r,i)=>{
      const start=r.startFrame,end=r.endFrame;
      check(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end<=asset.frames&&end-start>=Math.ceil(8*this.increment)+1,'invalid or too-short source interval');
      if(i)check(start>=selected[i-1].endFrame,'source intervals overlap or are unordered');
      return {start,end,centre:(start+end-1)/2};
    });
    this.frame=0;this.sequence=0;this.current=null;this.pending=null;this.incoming=null;
    this.fadeFrame=0;this.fadeFrames=0;this.previous=0;
    this.lastExpectedEnergy=0;this.expectedEnergy=0;this.outputEnergy=0;this.maximumBoundaryStep=0;
    this.stats={grainsStarted:0,crossfades:0,reads:0,minimumReadFrame:null,maximumReadFrame:null,
      minimumSelectedInterval:null,maximumSelectedInterval:null,maximumConcurrentHeads:1,sourceBoundViolations:0};
  }
  select(u){
    const target=u*(this.asset.frames-1),regions=this.intervals;
    let low=0,high=regions.length-1;
    while(low<high){const mid=(low+high)>>1;if(regions[mid].centre<target)low=mid+1;else high=mid;}
    let nearest=low;
    if(nearest&&Math.abs(regions[nearest-1].centre-target)<Math.abs(regions[nearest].centre-target))nearest--;
    // Only neighboring real intervals are used. Endpoint requests retain the
    // first/last region, rather than clamping all states to long low-state PCM.
    const offsets=[0,1,0,-1,0,-1,1];
    let index=nearest;
    if(u>0&&u<1)index=Math.max(0,Math.min(regions.length-1,nearest+offsets[this.sequence%offsets.length]));
    const region=regions[index],nativeLength=region.end-region.start;
    const serial=++this.sequence,hash=(Math.imul(serial,0x9e3779b1)^(serial>>>3))>>>0;
    const maximumOffset=Math.max(0,Math.min(Math.floor(.002*this.asset.sampleRate),Math.floor(nativeLength*.05),nativeLength-Math.ceil(8*this.increment)-1));
    let start=region.start+(hash%Math.max(1,maximumOffset+1));
    // A rising crossing is preferred when it is already inside the interval.
    // This never reads neighboring source material or changes sample amplitude.
    const searchEnd=Math.min(region.start+maximumOffset,region.end-Math.ceil(8*this.increment)-1);
    for(let i=start;i<=searchEnd;i++)if(i>region.start&&this.samples[i-1]<=0&&this.samples[i]>0){start=i;break;}
    const length=Math.floor((region.end-1-start)/this.increment)+1;
    check(length>=8,'source excerpt is too short for complementary overlap');
    this.stats.grainsStarted++;
    this.stats.minimumSelectedInterval=Math.min(this.stats.minimumSelectedInterval??index,index);
    this.stats.maximumSelectedInterval=Math.max(this.stats.maximumSelectedInterval??index,index);
    return {index,start,end:region.end,age:0,length};
  }
  read(head){
    // Last-frame clamping protects the interpolation endpoint from float error;
    // the two reads remain within this head's own observed interval.
    const position=Math.min(head.end-1,head.start+head.age*this.increment),k=Math.floor(position),f=position-k;
    const next=Math.min(k+1,head.end-1);
    if(head.age<0||head.age>=head.length||k<head.start||next>=head.end){
      this.stats.sourceBoundViolations++;throw Error('source read crossed its bounded interval');
    }
    this.stats.reads++;this.stats.minimumReadFrame=Math.min(this.stats.minimumReadFrame??k,k);
    this.stats.maximumReadFrame=Math.max(this.stats.maximumReadFrame??next,next);
    return this.samples[k]*(1-f)+this.samples[next]*f;
  }
  next(u){
    check(Number.isFinite(u)&&u>=0&&u<=1,'normalized authored source position required');
    if(!this.current)this.current=this.select(u);
    const remaining=this.current.length-this.current.age;
    if(!this.pending&&!this.incoming&&remaining<=Math.min(Math.floor(this.current.length/2),Math.round(FS*.020)))this.pending=this.select(u);
    let boundary=false;
    if(this.pending&&!this.incoming){
      const maximum=Math.min(Math.floor(this.current.length/2),Math.floor(this.pending.length/2),Math.round(FS*.020));
      const overlap=Math.min(maximum,Math.max(2,Math.floor(Math.min(this.current.length,this.pending.length)*.4)));
      check(overlap>=2,'bounded smooth overlap unavailable');
      if(remaining<=overlap){this.incoming=this.pending;this.pending=null;this.fadeFrame=0;this.fadeFrames=remaining;
        this.stats.crossfades++;this.stats.maximumConcurrentHeads=2;boundary=true;}
    }
    const first=this.read(this.current);
    let output=first,expected=first*first;
    if(this.incoming){
      const second=this.read(this.incoming),w=mix(this.fadeFrame/(this.fadeFrames-1));
      output=(1-w)*first+w*second;expected=(1-w)*first*first+w*second*second;
      this.current.age++;this.incoming.age++;this.fadeFrame++;
      if(this.fadeFrame===this.fadeFrames){this.current=this.incoming;this.incoming=null;boundary=true;}
    }else this.current.age++;
    check(Number.isFinite(output)&&Math.abs(output)<=1+1e-12,'bounded source output required');
    if(boundary)this.maximumBoundaryStep=Math.max(this.maximumBoundaryStep,Math.abs(output-this.previous));
    this.lastExpectedEnergy=expected;this.expectedEnergy+=expected;this.outputEnergy+=output*output;
    this.previous=output;this.frame++;return output;
  }
}
