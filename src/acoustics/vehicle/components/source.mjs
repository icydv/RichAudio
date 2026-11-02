// Wholly original authored source instruments. No native telemetry, proprietary
// samples, bank calibration or game component inference is performed here.
import {componentLimits,requireComponent,freezeComponent} from './contracts.mjs';
const FS=48000,TAU=2*Math.PI;
const number=(x,lo,hi)=>Number.isFinite(x)&&x>=lo&&x<=hi;
export const implementedOriginalComponents=Object.freeze(['horn','tyre-rolling','tyre-slip','mechanical-clunk']);
const surfaces=Object.freeze({asphalt:{low:.18,upper:.52,rolling:.7},gravel:{low:.08,upper:.72,rolling:1},
 grass:{low:.03,upper:.24,rolling:.5},sand:{low:.035,upper:.38,rolling:.65},wet:{low:.12,upper:.68,rolling:.8},puddle:{low:.025,upper:.3,rolling:.9}});
export function validateOriginalComponentState(component,input) {
 requireComponent(implementedOriginalComponents.includes(component)&&input&&typeof input==='object','Implemented original component state required');
 if(component==='horn') {
  requireComponent(Object.keys(input).length===2&&typeof input.active==='boolean'&&number(input.level,0,1),'Explicit authored horn activation/level required');
  return freezeComponent({active:input.active,level:input.level});
 }
 if(component==='mechanical-clunk') {
  requireComponent(Object.keys(input).every(k=>k==='event'),'Mechanical state accepts explicit event only');
  return freezeComponent({event:input.event?{...input.event}:null});
 }
 const keys=['longitudinalSpeedMps','wheelSurfaceSpeedMps','lateralSpeedMps','normalForceN','frictionCoefficient','wheelRadiusM','surface'];
 requireComponent(Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k))&&
  number(input.longitudinalSpeedMps,-100,100)&&number(input.wheelSurfaceSpeedMps,-150,150)&&number(input.lateralSpeedMps,-100,100)&&
  number(input.normalForceN,0,200000)&&number(input.frictionCoefficient,0,1.5)&&number(input.wheelRadiusM,.1,2)&&Object.hasOwn(surfaces,input.surface),
  'Qualified/authored contact motion, load, surface and radius required; speed alone cannot imply slip');
 return freezeComponent({...input});
}
export function tyreContactModel(input) {
 const s=validateOriginalComponentState('tyre-slip',input),relativeLongitudinal=s.wheelSurfaceSpeedMps-s.longitudinalSpeedMps;
 return freezeComponent({longitudinalSlipRatio:relativeLongitudinal/Math.max(1,Math.abs(s.wheelSurfaceSpeedMps),Math.abs(s.longitudinalSpeedMps)),
  slipSpeedMps:Math.hypot(relativeLongitudinal,s.lateralSpeedMps),
  frictionPowerProxyWatts:s.normalForceN*s.frictionCoefficient*Math.hypot(relativeLongitudinal,s.lateralSpeedMps),
  basis:'authored-contact-friction-upper-bound-proxy-not-measured-sound-power'});
}
export class OriginalComponentSource {
 constructor(component,{seed=1}={}) {
  requireComponent(implementedOriginalComponents.includes(component)&&Number.isInteger(seed)&&seed>0&&seed<=0xffffffff,'Original instrument and deterministic seed required');
  this.component=component;this.frame=0;this.phase=0;this.secondaryPhase=0;this.envelope=0;this.low=0;this.upper=0;this.seed=seed>>>0;
  this.state=null;this.voices=Array.from({length:componentLimits.mechanicalVoices},()=>({active:false,start:0,strength:0,frequency:0}));
  this.seen=new Set();this.eventReceipts=[];this.lastEventSequence=-1;this.stats={renderedFrames:0,eventsAccepted:0,duplicateEvents:0,eventRejections:0,maximumVoices:0,peak:0};
 }
 setState(input) { this.state=validateOriginalComponentState(this.component,input); }
 trigger(event,nowFrame) {
  requireComponent(this.component==='mechanical-clunk','Discrete events require mechanical instrument');
  requireComponent(event&&typeof event.eventId==='string'&&/^[\w:.-]{1,64}$/.test(event.eventId)&&Number.isSafeInteger(event.sequence)&&event.sequence>=0&&
   Number.isSafeInteger(event.occurrenceFrame)&&event.occurrenceFrame>=0&&Number.isSafeInteger(event.observedFrame)&&event.observedFrame>=event.occurrenceFrame&&
   Number.isSafeInteger(nowFrame)&&nowFrame===this.frame&&event.observedFrame<=nowFrame&&nowFrame-event.occurrenceFrame<=2400&&number(event.strength,0,1)&&
   ['gear-clunk','door-latch','suspension-clunk'].includes(event.kind),'Explicit bounded authored mechanical event required');
  if(this.seen.has(event.eventId)){this.stats.duplicateEvents++;return false;}
  if(event.sequence<=this.lastEventSequence||this.seen.size>=componentLimits.eventsPerSource){this.stats.eventRejections++;return false;}
  this.seen.add(event.eventId);this.lastEventSequence=event.sequence;
  const voice=this.voices.find(v=>!v.active);this.eventReceipts.push(freezeComponent({eventId:event.eventId,sequence:event.sequence,occurrenceFrame:event.occurrenceFrame,
   observedFrame:event.observedFrame,emissionStartFrame:nowFrame,commonSoftwareLatenessFrames:nowFrame-event.occurrenceFrame,status:voice?'accepted':'rejected-voice-capacity'}));
  if(!voice){this.stats.eventRejections++;return false;}
  voice.active=true;voice.start=nowFrame;voice.strength=event.strength;voice.frequency=event.kind==='gear-clunk'?170:event.kind==='door-latch'?310:95;
  this.stats.eventsAccepted++;return true;
 }
 noise() {let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/2147483648-1;}
 // Source/control worker only. The caller owns buffers; phase/noise history
 // advances through valid silence rather than restarting on every observation.
 renderInto(output,frames=output.length,{qualified=true}={}) {
  requireComponent(output instanceof Float32Array&&Number.isInteger(frames)&&frames>0&&frames<=512&&output.length>=frames&&typeof qualified==='boolean','Bounded caller-owned component PCM required');
  if(qualified)requireComponent(this.state!==null,'Explicit source state required');
  const s=this.state,kind=this.component,peak=componentLimits.dryPeak;
  let activeVoices=0;for(const v of this.voices)if(v.active)activeVoices++;this.stats.maximumVoices=Math.max(this.stats.maximumVoices,activeVoices);
  let slip=0,rotation=0,amount=0,material=null;
  if(qualified&&kind.startsWith('tyre-')) {const model=tyreContactModel(s);slip=model.slipSpeedMps;rotation=Math.abs(s.wheelSurfaceSpeedMps)/(TAU*s.wheelRadiusM);
   amount=s.normalForceN===0?0:kind==='tyre-slip'?Math.min(1,model.frictionPowerProxyWatts/40000):Math.min(1,Math.abs(s.longitudinalSpeedMps)/30);material=surfaces[s.surface];}
  for(let i=0;i<frames;i++) {
   let sample=0;const frame=this.frame+i;
   if(kind==='horn') {const target=qualified&&s.active?s.level:0;this.envelope+=(1-Math.exp(-1/(FS*(target>this.envelope ? .004 : .015))))*(target-this.envelope);
    this.phase=(this.phase+248/FS)%1;this.secondaryPhase=(this.secondaryPhase+311/FS)%1;
    if(qualified)sample=peak*this.envelope*(.55*Math.sin(TAU*this.phase)+.3*Math.sin(TAU*this.secondaryPhase)+.15*Math.sin(TAU*this.phase*3));
   } else if(kind.startsWith('tyre-')) {
    const noise=this.noise();this.low+=(material?.low??.08)*(noise-this.low);this.upper+=(material?.upper??.4)*(noise-this.upper);
    this.phase=(this.phase+rotation/FS)%1;this.secondaryPhase=(this.secondaryPhase+(650+Math.min(25,slip)*31)/FS)%1;
    this.envelope+=(1-Math.exp(-1/(FS*.012)))*((qualified?amount:0)-this.envelope);
    if(qualified)sample=kind==='tyre-slip'?peak*this.envelope*(.65*Math.sin(TAU*this.secondaryPhase)+.175*(this.upper-this.low)):
     peak*this.envelope*material.rolling*(.65*this.low+.25*this.upper+.1*Math.sin(TAU*this.phase*7));
   } else {
    for(const v of this.voices)if(v.active){const age=frame-v.start;if(age>=4800){v.active=false;continue;}if(age<0)continue;
     if(qualified){const t=age/FS,attack=Math.min(1,age/48);sample+=peak/componentLimits.mechanicalVoices*v.strength*attack*Math.exp(-t/.016)*(.75*Math.sin(TAU*v.frequency*t)+.25*Math.sin(TAU*v.frequency*2.71*t));}}
   }
   requireComponent(Number.isFinite(sample)&&Math.abs(sample)<=peak+1e-7,'Original source peak budget');output[i]=sample;this.stats.peak=Math.max(this.stats.peak,Math.abs(sample));
  }
  this.frame+=frames;this.stats.renderedFrames+=frames;return frames;
 }
 diagnostics(){return {component:this.component,frame:this.frame,...this.stats,eventReceipts:[...this.eventReceipts],authority:'original-authored-component-fixture',physicalSoundPowerCalibrated:false};}
}
