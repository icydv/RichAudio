// Dedicated authored-event admission, independent of retrospective vehicle and
// camera controls. This module performs no synthesis, geometry or device work.
import {isPreparedTransientKernel,transientPoseKey,transientLimits} from './prepared-path.mjs';
import {createAuthoredFixtureEventCapability,evaluateEventAcquisition} from './acquisition-capability.mjs';
const check=(yes,why)=>{if(!yes)throw Error(why);},u32=x=>Number.isSafeInteger(x)&&x>=0&&x<=4294967295,safe=x=>Number.isSafeInteger(x)&&x>=0;

export class AuthoredTransientDescriptorSource {
  constructor({library,session,qpcFrequency,mode='disabled'}={}){
    check(mode==='authored-fixture','transient production admission remains blocked');
    check(/^[a-f0-9]{32}$/.test(session)&&Number.isSafeInteger(qpcFrequency)&&qpcFrequency>=1&&qpcFrequency<=1000000000,'authored fixture clock context');
    check(Array.isArray(library)&&library.length>0&&library.length<=transientLimits.kernels&&new Set(library.map(x=>x.kernelSlot)).size===library.length,'bounded immutable kernel registration');
    this.library=new Map();let modelSession=null;for(const entry of library){check(u32(entry.kernelSlot)&&entry.kernelSlot<8&&isPreparedTransientKernel(entry.kernel),'exact prepared kernel context');
      modelSession??=entry.kernel.session;check(entry.kernel.session===modelSession,'one immutable authored model session');this.library.set(entry.kernelSlot,entry.kernel);}
    this.session=session;this.qpcFrequency=qpcFrequency;this.capability=createAuthoredFixtureEventCapability({session});this.sources=new Map();
    this.seenEventIds=new Uint8Array(8193);
    this.stats={admitted:0,rejected:0,maximumSources:0,maximumSourceSlots:8,pcmCopiesDuringAdmission:0,geometryCallsDuringAdmission:0,retrospectiveDelayMs:0};
  }
  admit(event){
    const reject=reason=>{this.stats.rejected++;return {admitted:false,reason};};
    if(event?.session!==undefined&&event.session!==this.session||event?.authority!==undefined&&event.authority!=='authored-fixture-only'||
      event?.eventKind!==undefined&&event.eventKind!=='authored-impulse')return reject('event-authority');
    if(!event||!safe(event.eventId)||event.eventId<1||event.eventId>8192||!u32(event.sourceId)||!u32(event.sourceGeneration)||event.sourceGeneration===0||!safe(event.sourceEventSequence)||
      !u32(event.kernelSlot)||event.kernelGeneration!==1||event.sourceId!==event.kernelSlot+1)return reject('event-identity');
    if(this.seenEventIds[event.eventId])return reject('duplicate-event-id');
    const kernel=this.library.get(event.kernelSlot);if(!kernel)return reject('kernel-unavailable');
    if(event.sourceGeneration!==kernel.sourcePose.generation||event.listenerGeneration!==kernel.listenerPose.generation||
      event.sceneGeneration!==kernel.sceneGeneration)return reject('unprepared-generation');
    try{if(transientPoseKey(event.sourcePose)!==kernel.sourcePoseKey||transientPoseKey(event.listenerPose)!==kernel.listenerPoseKey)return reject('unprepared-pose');}
    catch{return reject('invalid-pose');}
    const timing=event.timing;
    if(timing?.qpcFrequency!==this.qpcFrequency)return reject('clock-domain');
    const acquisition=evaluateEventAcquisition({mode:'authored-fixture',authority:'authored-fixture-only',eventKind:'authored-impulse',
      session:this.session,fixtureCapability:this.capability,timing});
    if(!acquisition.admitted)return reject('event-acquisition-'+acquisition.status);
    if((timing.occurrenceUpperQpc-timing.occurrenceLowerQpc)*1000/this.qpcFrequency>transientLimits.maximumTimestampWidthMs||
      (timing.observationAfterQpc-timing.occurrenceUpperQpc)*1000/this.qpcFrequency>transientLimits.maximumEventObservationAgeMs)return reject('event-uncertainty-or-age');
    const previous=this.sources.get(event.sourceId);
    if(previous&&(event.sourceGeneration<previous.generation||event.sourceGeneration===previous.generation&&
      (event.sourceEventSequence<=previous.sequence||timing.occurrenceLowerQpc<previous.occurrence)))return reject('event-order');
    if(!previous&&this.sources.size>=8)return reject('source-budget');
    if(this.stats.admitted>=8192)return reject('finite-fixture-event-budget');
    this.sources.set(event.sourceId,{generation:event.sourceGeneration,sequence:event.sourceEventSequence,occurrence:timing.occurrenceLowerQpc});
    this.seenEventIds[event.eventId]=1;
    this.stats.maximumSources=Math.max(this.stats.maximumSources,this.sources.size);this.stats.admitted++;
    return {admitted:true,descriptor:Object.freeze({eventId:event.eventId,sourceId:event.sourceId,sourceGeneration:event.sourceGeneration,sourceEventSequence:event.sourceEventSequence,
      kernelSlot:event.kernelSlot,kernelGeneration:1,listenerGeneration:event.listenerGeneration,sceneGeneration:event.sceneGeneration,
      occurrenceLowerQpc:timing.occurrenceLowerQpc,occurrenceUpperQpc:timing.occurrenceUpperQpc,observationAfterQpc:timing.observationAfterQpc,
      acquisitionBeforeQpc:timing.acquisitionBeforeQpc??null,qpcFrequency:this.qpcFrequency,authority:'authored-fixture-only',eventKind:'authored-impulse',
      kernelId:kernel.kernelId,firstNonzeroFrame:kernel.firstNonzeroFrame,physicalDirectDelayFrames:kernel.physicalDirectDelayFrames}),kernel};
  }
}
