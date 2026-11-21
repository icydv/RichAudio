// Acoustic quality controls finite early-path work, independently of hardware.
// A budget includes the direct path, matching the existing twelve-path contract.
// It is a ceiling on genuine valid contributions, never a requested echo count.
export const qualityNames=Object.freeze(['auto','performance','balanced','quality','max']);
export const accelerationNames=Object.freeze(['auto','cpu','gpu']);
export const qualityPresets=Object.freeze({performance:12,balanced:16,quality:32,max:64});
export const qualityReflectors=Object.freeze({performance:8,balanced:8,quality:12,max:16});
const levels=Object.freeze(qualityNames.slice(1));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const acousticDefaults=Object.freeze({acousticQuality:'auto',acousticAcceleration:'auto',
  richAudioEnabled:true,outputLevel:1,earlyReflections:true,diagnosticsOverlay:false});

export function validateAcousticSettings(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!own(acousticDefaults,k)))throw Error('Acoustic settings object/fields');
  const acousticQuality=own(value,'acousticQuality')?value.acousticQuality:'auto';
  const acousticAcceleration=own(value,'acousticAcceleration')?value.acousticAcceleration:'auto';
  if(!qualityNames.includes(acousticQuality)||!accelerationNames.includes(acousticAcceleration))throw Error('Acoustic quality/acceleration value');
  const result={...acousticDefaults,...value,acousticQuality,acousticAcceleration};
  if(!['richAudioEnabled','earlyReflections','diagnosticsOverlay'].every(k=>typeof result[k]==='boolean')||
    !Number.isFinite(result.outputLevel)||result.outputLevel<0||result.outputLevel>1)throw Error('Acoustic output/reflection settings');
  return Object.freeze(result);
}

export class AcousticQualityController {
  constructor({selected='auto',now=()=>performance.now(),deadlineMs=512000/48000}={}){
    if(typeof now!=='function'||!Number.isFinite(deadlineMs)||deadlineMs<=0||deadlineMs>100)throw Error('Quality timing policy');
    this.now=now;this.deadlineMs=deadlineMs;this.selected='auto';this.active='performance';
    this.changedAt=-Infinity;this.selectedAt=this.lastNow=now();this.headroomSince=null;this.headroomSamples=0;this.lastMeasurementAt=null;
    this.smoothedMs=null;this.maximumMs=0;this.samples=0;this.misses=0;this.invalid=0;this.changes=0;
    this.reason='awaiting-measurements';this.availablePaths=0;this.activeBackend='cpu';this.lastTiming=null;
    this.select(selected,this.lastNow);
  }
  select(selected,nowMs=this.now()){
    if(!qualityNames.includes(selected)||!Number.isFinite(nowMs)||nowMs<this.lastNow)throw Error('Quality selection/time');
    if(selected===this.selected)return this.diagnostics();
    this.lastNow=nowMs;this.selectedAt=nowMs;this.selected=selected;this.headroomSince=null;this.headroomSamples=0;
    if(selected!=='auto')this.change(selected,nowMs,'user-selection');
    else this.change('performance',nowMs,'auto-safe-requalification');
    return this.diagnostics();
  }
  setQuality(selected,nowMs=this.now()){return this.select(selected,nowMs);}
  change(level,nowMs,reason){
    if(level!==this.active){this.active=level;this.changedAt=nowMs;this.changes++;}
    this.reason=reason;this.headroomSince=null;this.headroomSamples=0;
  }
  observe(sample,nowMs=this.now()){
    if(!Number.isFinite(nowMs)||nowMs<this.lastNow)throw Error('Quality measurement clock reversed');
    this.lastNow=nowMs;
    const valid=sample&&Number.isFinite(sample.processingMs)&&sample.processingMs>=0&&sample.processingMs<=60000&&
      ['cpuMs','gpuMs','queueMs'].every(k=>sample[k]===undefined||(Number.isFinite(sample[k])&&sample[k]>=0&&sample[k]<=60000))&&
      (sample.availablePaths===undefined||(Number.isInteger(sample.availablePaths)&&sample.availablePaths>=0&&sample.availablePaths<=65536))&&
      (sample.activeBackend===undefined||['cpu','gpu'].includes(sample.activeBackend));
    if(!valid){
      this.invalid++;this.headroomSince=null;this.headroomSamples=0;this.lastMeasurementAt=null;
      if(this.selected==='auto')this.change('performance',nowMs,'invalid-timing-measurement');
      return this.diagnostics();
    }
    // processingMs is complete worker + DSP time; queueMs is additional queue age.
    if(this.lastMeasurementAt!==null&&nowMs-this.lastMeasurementAt>250){this.headroomSince=null;this.headroomSamples=0;}
    this.lastMeasurementAt=nowMs;
    const cost=sample.processingMs+(sample.queueMs??0),miss=sample.deadlineMiss===true||cost>this.deadlineMs;
    this.samples++;this.misses+=Number(miss);this.maximumMs=Math.max(this.maximumMs,cost);
    this.smoothedMs=this.smoothedMs===null?cost:.95*this.smoothedMs+.05*cost;
    this.availablePaths=sample.availablePaths??this.availablePaths;this.activeBackend=sample.activeBackend??this.activeBackend;
    this.lastTiming={processingMs:sample.processingMs,queueMs:sample.queueMs??0,cpuMs:sample.cpuMs??null,gpuMs:sample.gpuMs??null};
    if(this.selected!=='auto')return this.diagnostics();
    const index=levels.indexOf(this.active),since=nowMs-this.changedAt;
    // A severe overrun is a safety downgrade, not a quality oscillation. Do not
    // spend a two-second dwell repeatedly running an already overloaded tier.
    if(cost>this.deadlineMs*1.5&&index>0){this.change('performance',nowMs,'severe-deadline-pressure');return this.diagnostics();}
    // Drop a level on a measured miss/overload, at most once in two seconds.
    // A single cold spike cannot cause rapid repeated down/up transitions.
    if(miss||this.smoothedMs>this.deadlineMs*.75){
      this.headroomSince=null;this.headroomSamples=0;
      if(index>0&&since>=2000)this.change(levels[index-1],nowMs,miss?'deadline-miss':'measured-processing-pressure');
      else this.reason=index===0?'minimum-quality-under-pressure':'quality-downshift-cooldown';
      return this.diagnostics();
    }
    const useful=index<levels.length-1&&this.availablePaths>qualityPresets[this.active];
    const headroom=cost<this.deadlineMs*.4&&this.smoothedMs<this.deadlineMs*.3;
    if(useful&&headroom){
      if(this.headroomSince===null)this.headroomSince=nowMs;
      this.headroomSamples++;
      // Eight seconds of measured useful headroom; no synthetic workload-based promotion.
      if(this.headroomSamples>=128&&nowMs-this.headroomSince>=8000&&since>=8000&&nowMs-this.selectedAt>=8000)
        this.change(levels[index+1],nowMs,'sustained-measured-headroom');
      else this.reason='measuring-headroom';
    }else{this.headroomSince=null;this.headroomSamples=0;this.reason=useful?'insufficient-measured-headroom':'no-additional-valid-path-demand';}
    return this.diagnostics();
  }
  diagnostics(){return Object.freeze({requestedQuality:this.selected,activeQuality:this.active,pathBudget:qualityPresets[this.active],
    reflectorBudget:qualityReflectors[this.active],budgetIncludesDirect:true,qualityReason:this.reason,qualityChanges:this.changes,
    qualitySamples:this.samples,qualityDeadlineMisses:this.misses,invalidQualityMeasurements:this.invalid,
    qualityProcessingEwmaMs:this.smoothedMs,qualityMaximumMs:this.maximumMs,availablePaths:this.availablePaths,
    measuredBackend:this.activeBackend,qualityTiming:this.lastTiming,qualityDeadlineMs:this.deadlineMs,qualityHeadroomSamples:this.headroomSamples});}
}
