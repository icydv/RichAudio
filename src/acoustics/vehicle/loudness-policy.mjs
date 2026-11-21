// Pure control policy and bounded caller-buffer DSP. No native calls, audio
// endpoint, telemetry reader, source player, history mutation or feature activation.
import defaults from '../../../config/vehicle-loudness-policy.json' with {type:'json'};
import {stockExteriorPressure} from './stock-pressure.mjs';

const roles=['engine','exhaust'];
const check=(value,message)=>{if(!value)throw Error(message);};
const finite=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const freeze=v=>{for(const x of Object.values(v))if(x&&typeof x==='object')freeze(x);return Object.freeze(v);};
const keyOf=v=>`${v.id}:${v.generation}:${v.model}`;
const validVehicle=v=>plain(v)&&typeof v.id==='string'&&/^[\w:-]{1,64}$/.test(v.id)&&
  Number.isSafeInteger(v.generation)&&v.generation>=1&&Number.isInteger(v.model)&&finite(v.model,1,0xffffffff)&&
  ['player','npc'].includes(v.context);
const overlaps=(a,b)=>a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;

export const vehicleModificationSlots=Object.freeze({exhaust:4,engine:11});
export function validateVehicleLoudnessConfiguration(input=defaults){
  const c=structuredClone(input);
  check(exact(c,['schema','enabled','maximumVehicles','transitionSeconds','modificationStaleAfterSeconds','reference',
    'minimumEmissionMultipliers','stockTreatments','modifiedTreatments','performanceClassIds','modelOverrides','prominence']), 'vehicle loudness configuration shape');
  check(c.schema===1&&typeof c.enabled==='boolean'&&Number.isInteger(c.maximumVehicles)&&finite(c.maximumVehicles,1,64)&&
    finite(c.transitionSeconds,.02,2)&&finite(c.modificationStaleAfterSeconds,.05,5),'bounded loudness configuration');
  check(exact(c.reference,['engine','exhaust','commonHeadroom'])&&
    Object.keys(c.reference).every(k=>c.reference[k]===stockExteriorPressure[k]),'retained 10x pressure and common trim reference required');
  const treatment=t=>exact(t,roles)&&roles.every(k=>finite(t[k],.000001,1));
  check(treatment(c.minimumEmissionMultipliers)&&exact(c.stockTreatments,['civilian','performance'])&&
    exact(c.modifiedTreatments,['ems','exhaust']),'loudness treatment shape');
  const aboveFloor=t=>treatment(t)&&roles.every(k=>t[k]>=c.minimumEmissionMultipliers[k]);
  check([...Object.values(c.stockTreatments),...Object.values(c.modifiedTreatments)].every(aboveFloor),'positive bounded emission treatment');
  check(Array.isArray(c.performanceClassIds)&&c.performanceClassIds.length<=32&&new Set(c.performanceClassIds).size===c.performanceClassIds.length&&
    c.performanceClassIds.every(v=>Number.isInteger(v)&&finite(v,0,31)),'explicit performance classes');
  check(plain(c.modelOverrides)&&Object.keys(c.modelOverrides).length<=2048&&Object.entries(c.modelOverrides).every(([k,v])=>
    /^0x[0-9a-f]{8}$/.test(k)&&exact(v,['category',...roles])&&['civilian','performance'].includes(v.category)&&
    aboveFloor({engine:v.engine,exhaust:v.exhaust})),'bounded explicit model overrides');
  check(exact(c.prominence,['maximumUnits','minimumBusGain'])&&finite(c.prominence.maximumUnits,0,c.maximumVehicles)&&
    finite(c.prominence.minimumBusGain,.1,1),'positive bounded prominence configuration');
  return freeze(c);
}
export const defaultVehicleLoudnessPolicy=validateVehicleLoudnessConfiguration();

function slotState(slot){
  if(!plain(slot)||slot.status!=='observed'||!Number.isInteger(slot.count)||!finite(slot.count,0,256)||
    !Number.isInteger(slot.index)||slot.index< -1||slot.index>=slot.count)return 'unknown';
  if(slot.count===0)return slot.index===-1?'unavailable':'unknown';
  return slot.index===-1?'stock':'installed';
}
function classify(v,now,c){
  check(validVehicle(v)&&finite(now,0,Number.MAX_SAFE_INTEGER),'owned vehicle identity and monotonic control time required');
  const modelKey=`0x${v.model.toString(16).padStart(8,'0')}`,override=c.modelOverrides[modelKey];
  const category=override?.category??(c.performanceClassIds.includes(v.classId)?'performance':'civilian');
  const stock=override?{engine:override.engine,exhaust:override.exhaust}:c.stockTreatments[category];
  const m=v.modification;
  const bound=plain(m)&&m.vehicleId===v.id&&m.generation===v.generation&&m.model===v.model&&m.modKitReady===true&&
    finite(m.observedAtSeconds,0,now)&&now-m.observedAtSeconds<=c.modificationStaleAfterSeconds;
  const exhaust=bound?slotState(m.exhaust):'unknown',engine=bound?slotState(m.engine):'unknown';
  const exhaustInstalled=exhaust==='installed',emsInstalled=engine==='installed';
  const route=exhaustInstalled?'exhaust':emsInstalled?'ems':null;
  const modificationState=route?(exhaustInstalled&&emsInstalled?'exhaust-and-ems':route):
    [exhaust,engine].includes('unknown')?'unknown':'stock-or-no-options-reported';
  const selected=route?c.modifiedTreatments[route]:stock;
  return {id:v.id,generation:v.generation,model:v.model,context:v.context,category,modelOverride:!!override,
    modificationState,exhaustState:exhaust,engineState:engine,qualifiedModified:route!==null,
    emsUpgradeOrdinal:emsInstalled?m.engine.index+1:null,
    stockEmission:{engine:stock.engine,exhaust:stock.exhaust},
    modificationExpiresAtSeconds:route?m.observedAtSeconds+c.modificationStaleAfterSeconds:null,
    emission:{engine:Math.max(stock.engine,selected.engine),exhaust:Math.max(stock.exhaust,selected.exhaust)},
    priority:v.priority??1};
}
export function classifyVehicleLoudness(vehicle,nowSeconds,configuration=defaultVehicleLoudnessPolicy){
  return classify(vehicle,nowSeconds,validateVehicleLoudnessConfiguration(configuration));
}

/** One fixed-capacity controller per producer. The caller supplies EVERY active
 * and releasing vehicle on update; missing identities are explicitly retired.
 * This controller never retires an audio voice or selects which traffic is heard.
 * Emission envelopes apply to NEW dry frames before history insertion. The bus
 * envelope attenuates the WHOLE current propagated vehicle bus, including its
 * stock baseline. It is not a surplus-only or stock-baseline-preserving budget. */
export class VehicleLoudnessPolicy {
  constructor({configuration=defaultVehicleLoudnessPolicy,sampleRate=48000}={}){
    this.configuration=validateVehicleLoudnessConfiguration(configuration);
    check(Number.isInteger(sampleRate)&&finite(sampleRate,8000,192000),'bounded policy sample rate');
    this.alpha=-Math.expm1(-1/(sampleRate*this.configuration.transitionSeconds));
    this.sampleRate=sampleRate;this.time=-Infinity;this.frames=0;this.clockOriginSeconds=null;this.active=[];
    this.slots=Array.from({length:this.configuration.maximumVehicles},()=>({key:null,engine:1,exhaust:1,share:0,qualified:0,
      engineTarget:1,exhaustTarget:1,shareTarget:0,qualifiedTarget:0,expiresAtFrame:Infinity,expired:false,decision:null}));
  }
  update(vehicles,nowSeconds){
    check(Array.isArray(vehicles)&&vehicles.length<=this.slots.length&&finite(nowSeconds,0,Number.MAX_SAFE_INTEGER)&&nowSeconds>=this.time,
      'bounded monotonic vehicle policy update');
    const decisions=vehicles.map(v=>classify(v,nowSeconds,this.configuration)),keys=vehicles.map(keyOf);
    check(new Set(keys).size===keys.length&&new Set(vehicles.map(v=>`${v.id}:${v.generation}`)).size===vehicles.length&&
      decisions.every(d=>finite(d.priority,0,1)),'distinct vehicle identities and bounded prominence priorities');
    const weight=decisions.reduce((n,d)=>n+(d.qualifiedModified?d.priority:0),0);
    const scale=weight>0?Math.min(1,this.configuration.prominence.maximumUnits/weight):0;
    // Validate everything before mutating the previous control state.
    if(this.clockOriginSeconds===null)this.clockOriginSeconds=nowSeconds-this.frames/this.sampleRate;
    for(const slot of this.slots)if(slot.key&&!keys.includes(slot.key)){slot.key=null;slot.decision=null;}
    this.active=decisions.map((d,i)=>{
      let slot=this.slots.find(s=>s.key===keys[i]);
      if(!slot){slot=this.slots.find(s=>s.key===null);Object.assign(slot,{key:keys[i],engine:1,exhaust:1,share:0,qualified:0});}
      const enabled=this.configuration.enabled;
      Object.assign(slot,{decision:d,engineTarget:enabled?d.emission.engine:1,exhaustTarget:enabled?d.emission.exhaust:1,
        shareTarget:enabled&&d.qualifiedModified?d.priority*scale:0,qualifiedTarget:enabled&&d.qualifiedModified?1:0,
        expiresAtFrame:enabled&&d.qualifiedModified?Math.floor((d.modificationExpiresAtSeconds-this.clockOriginSeconds)*this.sampleRate):Infinity,
        expired:false});
      return slot;
    });
    this.time=nowSeconds;
    return decisions.map(d=>({...d,emission:{...d.emission},stockEmission:{...d.stockEmission},enabled:this.configuration.enabled}));
  }
  writeEnvelopesInto(outputs,frames=512){
    check(Array.isArray(outputs)&&outputs.length===this.active.length&&Number.isInteger(frames)&&finite(frames,1,512)&&Number.isSafeInteger(this.frames+frames),
      'complete caller-owned policy envelope block');
    const buffers=[];
    for(let i=0;i<outputs.length;i++){
      const out=outputs[i],d=this.active[i].decision;
      check(out?.id===d.id&&out.generation===d.generation&&roles.every(k=>out[k] instanceof Float32Array&&out[k].length>=frames)&&
        out.bus instanceof Float32Array&&out.bus.length>=frames,'ordered emission and propagated-bus envelope buffers');
      buffers.push(out.engine,out.exhaust,out.bus);
    }
    check(buffers.every((b,i)=>buffers.slice(0,i).every(a=>!overlaps(a,b))),'independent policy envelope buffers');
    const a=this.alpha,floor=this.configuration.prominence.minimumBusGain;
    for(let n=0;n<frames;n++)for(let i=0;i<this.active.length;i++){
      const s=this.active[i],out=outputs[i];
      // Missing subsequent control updates do not preserve a modification claim
      // forever. Expiry uses elapsed emitted frames in the explicitly mapped
      // control/emission clock; it fades to stock without touching old history.
      if(!s.expired&&this.frames+n>=s.expiresAtFrame){
        s.engineTarget=s.decision.stockEmission.engine;s.exhaustTarget=s.decision.stockEmission.exhaust;
        s.shareTarget=0;s.qualifiedTarget=0;s.expired=true;
      }
      s.engine+=a*(s.engineTarget-s.engine);s.exhaust+=a*(s.exhaustTarget-s.exhaust);
      s.share+=a*(s.shareTarget-s.share);s.qualified+=a*(s.qualifiedTarget-s.qualified);
      out.engine[n]=s.engine;out.exhaust[n]=s.exhaust;
      out.bus[n]=1-s.qualified*(1-floor)*(1-s.share);
    }
    this.frames+=frames;
  }
  diagnostics(){
    return {enabled:this.configuration.enabled,activeVehicles:this.active.length,frames:this.frames,
      allocatedProminenceUnits:this.active.reduce((n,s)=>n+s.share,0),maximumProminenceUnits:this.configuration.prominence.maximumUnits,
      reference:{...this.configuration.reference},acousticCalibration:'unverified',liveIntegration:false,
      emissionHistoryGainCeiling:1,propagatedBusGainCeiling:1,
      vehicles:this.active.map(s=>({id:s.decision.id,generation:s.decision.generation,modificationState:s.expired?'expired':s.decision.modificationState,
        emission:{engine:s.engine,exhaust:s.exhaust},prominenceShare:s.share}))};
  }
}

/** Amplitude-only copy of caller-selected NEW emission frames OR propagated bus
 * frames. The caller chooses the correct separate envelope and insertion point.
 * Never use it to rewrite retained history or add the .25/10 reference twice. */
export function applyVehicleLoudnessEnvelopeInto(input,envelope,output,frames=input.length){
  check(input instanceof Float32Array&&envelope instanceof Float32Array&&output instanceof Float32Array&&
    Number.isInteger(frames)&&finite(frames,1,512)&&Math.min(input.length,envelope.length,output.length)>=frames&&
    !overlaps(input,output)&&!overlaps(envelope,output),'nonaliasing caller-owned PCM/envelope copy');
  for(let i=0;i<frames;i++)check(Number.isFinite(input[i])&&finite(envelope[i],0.000001,1),'finite PCM and positive attenuation envelope');
  for(let i=0;i<frames;i++)output[i]=input[i]*envelope[i];
}

/** Bounds are already referenced (.25 engine/2.5 exhaust), propagated, panned
 * and master-scaled absolute contribution bounds, including release/reflections.
 * Full history gain ceilings stay1 even if CURRENT new emission is quieter.
 * This is an admission calculation, not a limiter or measured clipping proof. */
export function assessVehicleLoudnessHeadroom(contributions,{peakLimit=.95}={}){
  check(Array.isArray(contributions)&&contributions.length<=64&&finite(peakLimit,.01,1)&&contributions.every(c=>
    plain(c)&&roles.every(k=>finite(c[k],0,64))),'explicit bounded absolute contribution peaks required');
  const absolutePeakBound=contributions.reduce((n,c)=>n+c.engine+c.exhaust,0);
  return {status:absolutePeakBound<=peakLimit?'within-absolute-bound':'bound-exceeded',admitted:absolutePeakBound<=peakLimit,
    absolutePeakBound,peakLimit,remainingHeadroom:peakLimit-absolutePeakBound,
    emissionHistoryGainCeiling:1,propagatedBusGainCeiling:1,includesOlderLouderHistory:true,
    reliesOnCancellation:false,limiterRequiredByPolicy:false,measuredClippingProof:false};
}
