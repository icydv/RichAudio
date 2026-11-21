// Original deterministic synthesis, precomputed outside the render callback.
import {createHash} from 'node:crypto';
import {isAuthoredCollisionEvent,collisionLimits} from './contracts.mjs';
const FS=48000,need=(ok,why)=>{if(!ok)throw Error(why);};
const signals=new WeakMap();
export function collisionSourceLevel(event){
 need(isAuthoredCollisionEvent(event),'branded authored collision event');const s=event.severity;
 const proxy=s.energyJ!==null?s.energyJ/2000:s.impulseNs!==null?s.impulseNs/400:s.frictionPowerProxyW/2000;
 return Math.min(collisionLimits.maximumDryPeak,Math.sqrt(Math.max(0,proxy))*.012);
}
export class OriginalCollisionSource {
 constructor(event,{outputStartFrame,firstProcessFrame=outputStartFrame}={}){
  need(isAuthoredCollisionEvent(event)&&Number.isSafeInteger(outputStartFrame)&&outputStartFrame>=event.timing.occurrenceUpperFrame&&
   outputStartFrame+event.durationFrames<=event.poseKnownThroughFrame&&Number.isSafeInteger(firstProcessFrame)&&firstProcessFrame>=0&&firstProcessFrame<=outputStartFrame,'qualified finite collision source schedule');
  this.event=event;this.outputStartFrame=outputStartFrame;this.nextFrame=firstProcessFrame;const samples=new Float32Array(event.durationFrames);this.durationFrames=samples.length;this.cancelAtFrame=Infinity;
  const level=collisionSourceLevel(event),seedBytes=createHash('sha256').update(event.eventId+':'+event.material.id).digest();let seed=seedBytes.readUInt32LE(0)||1,low=0;
  const frequencies=event.material.id==='glass'?[1367,2179,3359,4813]:event.material.id==='plastic'?[241,419,683]:[103,271,613,1129];
  for(let i=0;i<samples.length;i++){
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const noise=(seed>>>0)/2147483648-1;low+=.12*(noise-low);
   const t=i/FS,u=i/samples.length,edge=Math.min(1,i/12)*(1-u)**2;
   let value;
   if(event.kind==='scrape')value=(.7*noise+.3*low)*(Math.sin(2*Math.PI*83*t)**2*.6+.4)*edge;
   else if(event.material.id==='unknown')value=(.7*low*Math.exp(-t*70)+.3*noise*Math.exp(-t*110))*edge;
   else{let modal=0;for(const f of frequencies)modal+=Math.cos(2*Math.PI*f*t)*Math.exp(-t*(event.kind==='glass'?30:55));
    value=(modal/frequencies.length*.65+noise*.35*Math.exp(-t*110))*edge;}
   samples[i]=value*level;
  }
  this.peak=0;for(const x of samples)this.peak=Math.max(this.peak,Math.abs(x));need(this.peak<=collisionLimits.maximumDryPeak,'bounded original collision dry peak');
  this.pcmSha256=createHash('sha256').update(Buffer.from(samples.buffer)).digest('hex');signals.set(this,samples);
 }
 renderAtInto(target,outputFrame,frames=target.length){
  need(target instanceof Float32Array&&Number.isInteger(frames)&&frames>0&&frames<=512&&target.length>=frames&&outputFrame===this.nextFrame,'contiguous caller-owned collision output block');
  const samples=signals.get(this);for(let i=0;i<frames;i++){const frame=outputFrame+i,at=frame-this.outputStartFrame;let sample=at>=0&&at<samples.length?samples[at]:0;
   if(frame>=this.cancelAtFrame)sample*=Math.max(0,1-(frame-this.cancelAtFrame)/2400);target[i]=sample;}
  this.nextFrame+=frames;return frames;
 }
 cancel(frame){need(Number.isSafeInteger(frame)&&frame>=this.nextFrame,'ordered cancellation at future block boundary');this.cancelAtFrame=Math.min(this.cancelAtFrame,frame);}
 copyDryInto(target){need(target instanceof Float32Array&&target.length>=this.durationFrames,'caller-owned original dry copy');target.set(signals.get(this));return this.durationFrames;}
 diagnostics(){return {sourceId:this.event.sourceId,eventId:this.event.eventId,frames:this.durationFrames,peak:this.peak,pcmSha256:this.pcmSha256,
  outputStartFrame:this.outputStartFrame,commonSoftwareLatenessFrames:this.outputStartFrame-this.event.timing.occurrenceUpperFrame,
  frame:this.nextFrame,acousticCalibration:'unverified original fixture level',nativeSuppression:false};}
}
