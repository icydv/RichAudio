// Finite, graph-bound original PCM. The X80 lift policy estimates afterfire
// from control history. The native ECU's conditions and gain are unknown.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {NativePcmVoice} from './stock-grain.mjs';
const FS=48000,check=(ok,m)=>{if(!ok)throw Error(m);},smooth=x=>x*x*(3-2*x);
const loadToArm=.68, revsToArm=.64, minimumPullFrames=Math.round(.13*FS);
const liftWindowFrames=Math.round(.12*FS), cooldownFrames=Math.round(.34*FS);
const inferredBasis='estimated-afterfire-from-load-revs-and-lift';
const variantOrder=[1,3,0,2];
const verifiedPops=new WeakMap();
export function stockPopsMatchBank(assets,bank){
  const binding=verifiedPops.get(assets),archive=bank.provenance?.archiveSha256,container=bank.provenance?.awcSha256;
  return !!binding&&/^[0-9a-f]{64}$/i.test(archive)&&/^[0-9a-f]{64}$/i.test(container)&&
    binding.archive===archive.toUpperCase()&&binding.container===container.toUpperCase();
}
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
  });
  const assets={model:m.model,event:m.event,graph:m.graph,variants,base};
  verifiedPops.set(assets,{archive:m.provenance.archiveSha256?.toUpperCase(),container:m.provenance.awcPostParserSha256?.toUpperCase()});
  return assets;
}

export class StockExhaustEvents {
  constructor({assets,triggers,inferFromControls=false,bedPeakBound,roleGainBound,maximumGain=inferFromControls ? .65 : .25}){
    check(assets?.model==='prototipo'&&Array.isArray(assets.variants)&&assets.variants.length===4,'verified X80 event library only');
    check(Number.isFinite(bedPeakBound)&&bedPeakBound>=0&&bedPeakBound<.98&&Number.isFinite(roleGainBound)&&roleGainBound>0,'explicit source bed/event pressure budget');
    check(typeof inferFromControls==='boolean'&&(inferFromControls?triggers===undefined:Array.isArray(triggers)&&triggers.length<=4)&&
      Number.isFinite(maximumGain)&&maximumGain>0&&maximumGain<=(inferFromControls?1:.25),'bounded authored or control-derived one-shot plan');
    const peak=Math.max(...assets.variants.map(a=>a.samples.reduce((p,x)=>Math.max(p,Math.abs(x)),0)));
    this.gain=Math.min(maximumGain,(.98-bedPeakBound)/(roleGainBound*peak));
    this.plans=(triggers??[]).map((t,i)=>{
      check(Number.isSafeInteger(t.atFrame)&&t.atFrame>=0&&Number.isInteger(t.variant)&&t.variant>=0&&t.variant<4&&t.basis==='authored-offline-lift','explicit sample-clock trigger and provenance required');
      const asset=assets.variants[t.variant],frames=Math.ceil(asset.frames*FS/asset.sampleRate);
      if(i)check(t.atFrame>=triggers[i-1].atFrame+Math.ceil(assets.variants[triggers[i-1].variant].frames*FS/assets.variants[triggers[i-1].variant].sampleRate),'one-shots may not overlap or retrigger');
      return {...t,asset,frames,voice:new NativePcmVoice(asset)};
    });
    this.cursor=0;this.active=null;
    if(inferFromControls)this.inference={plans:assets.variants.map((asset,variant)=>({asset,variant,
      frames:Math.ceil(asset.frames*FS/asset.sampleRate),voice:new NativePcmVoice(asset),basis:inferredBasis})),
      pullFrames:0,pullPeak:0,armedUntil:-1,nextAllowedFrame:0};
    this.stats={planned:this.plans.length,triggered:0,completed:0,activeFrames:0,peak:0,
      gain:this.gain,bedPeakBound,roleGainBound,maximumCombinedInputBound:bedPeakBound+roleGainBound*peak*this.gain,
      edgeEnvelope:{attackFrames:inferFromControls?8:24,tailFrames:144,basis:'explicit finite-PCM edge treatment; originals unchanged'},
      triggerBasis:inferFromControls?inferredBasis:'authored-offline-lift; native ECU/conditions unverified'};
    if(inferFromControls)this.stats.lastTrigger=null;
  }
  get boundPlans(){return this.inference?.plans??this.plans;}
  observe(control,frame,frames){
    const inferred=this.inference;
    if(!inferred)return;
    if(!control.running){inferred.pullFrames=0;inferred.pullPeak=0;inferred.armedUntil=-1;return;}
    if(!control.lift&&control.load>=loadToArm&&control.operatingPoint>=revsToArm){
      if(inferred.pullFrames===0)inferred.pullPeak=0;
      inferred.pullFrames=Math.min(minimumPullFrames,inferred.pullFrames+frames);
      inferred.pullPeak=Math.max(inferred.pullPeak,control.load);
      if(inferred.pullFrames===minimumPullFrames)inferred.armedUntil=frame+frames+liftWindowFrames;
      return;
    }
    inferred.pullFrames=0;
    if(!control.lift||control.load>.24||control.operatingPoint<.55||frame>inferred.armedUntil)return;
    inferred.armedUntil=-1;
    if(frame<inferred.nextAllowedFrame||this.active)return;
    const variant=variantOrder[this.stats.triggered%variantOrder.length],plan=inferred.plans[variant];
    const gain=this.gain*(.76+.24*(inferred.pullPeak-loadToArm)/(1-loadToArm));
    this.start(plan,gain);
    inferred.nextAllowedFrame=frame+cooldownFrames;
    this.stats.lastTrigger={atFrame:frame,variant,basis:plan.basis,gain};
  }
  start(plan,gain){
    check(!this.active,'no repeated/overlapping event');
    this.active={plan,age:0};this.stats.triggered++;
    if(this.inference){plan.voice.position=0;this.active.gain=gain;}
  }
  next(frame){
    const next=this.plans[this.cursor];if(next&&frame===next.atFrame){this.start(next,this.gain);this.cursor++;}
    if(!this.active)return 0;
    const active=this.active,plan=active.plan,age=active.age;
    const edge=Math.min(1,age/(this.inference?8:24),(plan.frames-1-age)/144);
    const value=plan.voice.next()*(active.gain??this.gain)*smooth(Math.max(0,edge));
    active.age++;this.stats.activeFrames++;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
    if(active.age>=plan.frames){this.active=null;this.stats.completed++;}return value;
  }
}
