// Finite, graph-bound original PCM only. Authored offline triggers are explicit;
// no event is inferred from RPM, operating point, a shift or an ECU condition.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {NativePcmVoice} from './stock-grain.mjs';
const FS=48000,check=(ok,m)=>{if(!ok)throw Error(m);},smooth=x=>x*x*(3-2*x);
export function loadStockExhaustPops(manifestFile){
  const base=path.dirname(path.resolve(manifestFile)),m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  check(m.schema===1&&m.model==='prototipo'&&m.event==='ExhaustPops'&&m.graph?.wrapperHash==='4DFBD9EB'&&m.graph?.containerHash==='41CA753A'&&m.provenance?.archiveUnchanged===true,'verified X80 exhaust-pop graph and unchanged archive required');
  const expected=['87AAD300','ECE29D6E','1990F6CA','CB4D5A44'];
  check(m.variants?.length===4,'four independently bound native pop variants required');
  const variants=m.variants.map((v,i)=>{
    check(v.graphFileHash===expected[i]&&v.channels===1&&v.sourceCodec===0&&Number.isInteger(v.sampleRate)&&v.sampleRate>=8000&&v.sampleRate<=48000,'verified native event PCM format');
    const file=path.resolve(base,v.file);check(file.startsWith(base+path.sep),'event PCM escaped manifest');
    const bytes=fs.readFileSync(file);check(bytes.length===v.frames*4&&createHash('sha256').update(bytes).digest('hex').toUpperCase()===v.sha256.toUpperCase(),'event PCM binding differs');
    const samples=new Float32Array(v.frames);let peak=0;for(let j=0;j<samples.length;j++){samples[j]=bytes.readFloatLE(j*4);check(Number.isFinite(samples[j])&&Math.abs(samples[j])<=1,'finite native event samples');peak=Math.max(peak,Math.abs(samples[j]));}
    return {...v,samples,nativePeak:peak};
  });return {model:m.model,event:m.event,graph:m.graph,variants,base};
}

export class StockExhaustEvents {
  constructor({assets,triggers,bedPeakBound,roleGainBound,maximumGain=.25}){
    check(assets?.model==='prototipo'&&Array.isArray(assets.variants)&&assets.variants.length===4,'verified X80 event library only');
    check(Number.isFinite(bedPeakBound)&&bedPeakBound>=0&&bedPeakBound<.98&&Number.isFinite(roleGainBound)&&roleGainBound>0,'explicit source bed/event pressure budget');
    check(Array.isArray(triggers)&&triggers.length<=4&&Number.isFinite(maximumGain)&&maximumGain>0&&maximumGain<=.25,'bounded authored one-shot plan');
    const peak=Math.max(...assets.variants.map(a=>a.samples.reduce((p,x)=>Math.max(p,Math.abs(x)),0)));
    this.gain=Math.min(maximumGain,(.98-bedPeakBound)/(roleGainBound*peak));
    this.plans=triggers.map((t,i)=>{
      check(Number.isSafeInteger(t.atFrame)&&t.atFrame>=0&&Number.isInteger(t.variant)&&t.variant>=0&&t.variant<4&&t.basis==='authored-offline-lift','explicit sample-clock trigger and provenance required');
      const asset=assets.variants[t.variant],frames=Math.ceil(asset.frames*FS/asset.sampleRate);
      if(i)check(t.atFrame>=triggers[i-1].atFrame+Math.ceil(assets.variants[triggers[i-1].variant].frames*FS/assets.variants[triggers[i-1].variant].sampleRate),'one-shots may not overlap or retrigger');
      return {...t,asset,frames,voice:new NativePcmVoice(asset)};
    });
    this.cursor=0;this.active=null;this.stats={planned:triggers.length,triggered:0,completed:0,activeFrames:0,peak:0,
      gain:this.gain,bedPeakBound,roleGainBound,maximumCombinedInputBound:bedPeakBound+roleGainBound*peak*this.gain,
      edgeEnvelope:{attackFrames:24,tailFrames:144,basis:'explicit finite-PCM edge treatment; originals unchanged'},triggerBasis:'authored-offline-lift; native ECU/conditions unverified'};
  }
  next(frame){
    const next=this.plans[this.cursor];if(next&&frame===next.atFrame){check(!this.active,'no repeated/overlapping event');this.active={plan:next,age:0};this.cursor++;this.stats.triggered++;}
    if(!this.active)return 0;
    const a=this.active,p=a.plan,edge=Math.min(1,a.age/24,(p.frames-1-a.age)/144),value=p.voice.next()*this.gain*smooth(Math.max(0,edge));
    a.age++;this.stats.activeFrames++;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
    if(a.age>=p.frames){this.active=null;this.stats.completed++;}return value;
  }
}
