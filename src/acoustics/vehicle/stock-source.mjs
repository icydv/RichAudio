// Private decoded game PCM -> bounded source buffers. No spatial renderer,
// synthetic oscillator, native voice interception or audio endpoint.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {StockGrainVoice,prepareStockGrain10,grainPreparationLimits10} from './stock-grain.mjs';
import {StockExhaustEvents,stockPopsMatchBank} from './stock-events.mjs';
import {SourcePreparationBudgetError10} from './source-preparation-budget10.mjs';
export {loadStockExhaustPops} from './stock-events.mjs';
export {StockGrainVoice,NativePcmVoice} from './stock-grain.mjs';
export {warmStockSourceJit10} from './stock-source-preparation10.mjs';
const FS=48000,clamp=x=>Math.max(0,Math.min(1,x));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const verifiedVehicleBanks=new WeakSet();
const sourcePreparations10=new WeakMap();
export const sourcePreparationLimits10=Object.freeze({maximumBanks:8,maximumBytes:grainPreparationLimits10.maximumBytes,maximumConcurrentPreparations:1});
export const isVerifiedStockBank=bank=>verifiedVehicleBanks.has(bank);
const validModel=model=>typeof model==='string'&&/^[a-zA-Z0-9_:-]{1,64}$/.test(model);
export const stockModels=Object.freeze(['bati','lectro','prototipo','schafter3']);
export const stockRoles=Object.freeze(['engine','exhaust']);
export const stockModes=Object.freeze(['idle','accel','decel']);
// Preserve the original in-memory analytical fixture seam, without letting a
// copied decoded bank regain verification by changing its model to a demo ID.
const analyticFixture=vehicle=>stockModels.includes(vehicle?.model)&&vehicle.provenance===undefined&&
  stockRoles.every(role=>stockModes.every(mode=>{const a=vehicle.layers?.[role]?.[mode];return a?.samples instanceof Float32Array&&
    a.file===undefined&&a.sha256===undefined&&a.sourceFormat===undefined;}));

/** Pure startup data. This does not construct a source, consume observations or
 * emit samples. Each later source starts with its own untouched playback state. */
export function prepareStockSource10(vehicle,{atlas=null,maximumBytes=sourcePreparationLimits10.maximumBytes}={}){
 check(verifiedVehicleBanks.has(vehicle)||analyticFixture(vehicle),'verified model or explicit analytical fixture required');
 check(Number.isSafeInteger(maximumBytes)&&maximumBytes>0&&maximumBytes<=sourcePreparationLimits10.maximumBytes,'bounded source preparation memory required');
 const modes=vehicle.audioContext==='npc'?['idle','accel']:stockModes,entries=[],unique=[],peaks={};let bytes=0;
 for(const role of stockRoles){let peak=0;for(const mode of modes){
  const asset=vehicle.layers[role][mode],regions=atlas?.[role]?.[mode]??null;
  let item=unique.find(x=>x.asset===asset&&x.regions===regions);
  if(!item){if(bytes>=maximumBytes)throw new SourcePreparationBudgetError10('bytes',maximumBytes);
   const preparation10=prepareStockGrain10(asset,{regions,maximumBytes:maximumBytes-bytes});
   item={asset,regions,preparation10,nativePeak:asset.nativePeak};unique.push(item);bytes+=preparation10.bytes;}
  entries.push({role,mode,...item});peak=Math.max(peak,asset.nativePeak??asset.samples.reduce((p,v)=>Math.max(p,Math.abs(v)),0));
 }peaks[role]=peak;}
 const token=Object.freeze({kind:'RichAudioStockSourcePreparation10',bytes,grainPlans:unique.length,npc:vehicle.audioContext==='npc',
  voiceTextures:Object.freeze(entries.map(e=>e.preparation10.textureEnabled)),sourceFramesAdvanced:0,pcmQueueFramesAdded:0});
 sourcePreparations10.set(token,{vehicle,model:vehicle.model,audioContext:vehicle.audioContext,atlas,modes,entries,peaks});return token;
}

export function loadStockAssets(manifestFile,{sustainAtlasFile=null}={}){
  return readStockAssetLibrary(manifestFile,{sustainAtlasFile},stockModels);
}

/** Generic verified-bank loader. Coverage is declared by its manifest, never
 * supplied by substituting one of the four demonstration banks. */
export function loadStockCatalogAssets(manifestFile,{sustainAtlasFile=null}={}){
  return readStockAssetLibrary(manifestFile,{sustainAtlasFile},null);
}
export function loadStockNpcAssets(manifestFile){
  return readStockAssetLibrary(manifestFile,{sustainAtlasFile:null},null,'npc');
}
function readStockAssetLibrary(manifestFile,{sustainAtlasFile},allowedModels,context='player'){
  const base=path.dirname(path.resolve(manifestFile)),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  check(manifest.schema===1&&Array.isArray(manifest.vehicles)&&manifest.vehicles.length>=1&&manifest.vehicles.length<=2048,'verified private decoder manifest required');
  const npc=context==='npc',modes=npc?['idle','accel']:stockModes;
  if(npc)check(/^[a-f0-9]{64}$/i.test(manifest.gameExecutableSha256),'NPC decoded game binding required');
  const atlas=npc?null:JSON.parse(fs.readFileSync(path.join(base,'analysis-intervals.json'),'utf8'));
  const sustain=sustainAtlasFile?JSON.parse(fs.readFileSync(sustainAtlasFile,'utf8')):null;
  check(sustain===null||sustain.schema===1&&Array.isArray(sustain.streams),'bound private sustain atlas required');
  const vehicles=new Map();
  for(const v of manifest.vehicles){
    check(validModel(v.model)&&(!allowedModels||allowedModels.includes(v.model))&&!vehicles.has(v.model),'exact distinct requested vehicle identity');
    check((v.audioContext??'player')===context&&(!npc||v.sourceContract==='npc-four-state-v1'),'explicit source context/contract required');
    const layers={};
    for(const role of stockRoles){layers[role]={};if(npc)check(!v.layers?.[role]?.decel,'four-state source must not conceal decel material');for(const mode of modes){
      const record=v.layers?.[role]?.[mode];check(record&&record.channels===1&&record.sourceFormat?.codec===0,'verified mono PCM0 layer required');
      check([24000,32000,48000].includes(record.sampleRate)&&record.frames>4096,'bounded native source format');
      const file=path.resolve(base,record.file);check(file.startsWith(base+path.sep),'private asset path escaped manifest');
      const bytes=fs.readFileSync(file),hash=createHash('sha256').update(bytes).digest('hex');
      check(hash.toUpperCase()===record.sha256.toUpperCase()&&bytes.length===record.frames*4,'private source binding differs');
      let nativePeak=0;const samples=new Float32Array(record.frames);for(let i=0;i<samples.length;i++){samples[i]=bytes.readFloatLE(i*4);check(Number.isFinite(samples[i])&&Math.abs(samples[i])<=1,'invalid source sample');nativePeak=Math.max(nativePeak,Math.abs(samples[i]));}
      const intervals=atlas?.streams.find(s=>s.model===v.model&&s.layer===role&&s.state===mode);
      if(mode!=='idle'&&!npc)check(intervals?.file===record.file&&intervals.frames===record.frames&&intervals.sampleRate===record.sampleRate&&intervals.candidateIntervals?.length>1,'verified offset-bounded playback intervals required');
      const texture=sustain?.streams.find(s=>s.model===v.model&&s.role===role&&s.state===mode);
      if(sustain)check(texture?.file===record.file&&texture.sha256.toUpperCase()===record.sha256.toUpperCase()&&texture.frames===record.frames&&texture.sampleRate===record.sampleRate,'sustain atlas source binding differs');
      let spans=intervals?.candidateIntervals??null;
      if(mode==='idle'||npc){
        // Retained ordered PCM offsets provide cycle-span evidence for idle as
        // well as moving recordings. Their meaning is not recovered crank RPM
        // or a claim about the native idle playback algorithm.
        const offsets=record.granular?.grains?.map(g=>g.UnkUint1);
        check(offsets?.length>2&&offsets.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=record.frames&&(!i||n>offsets[i-1])),'ordered retained idle granular offsets required');
        spans=offsets.slice(0,-1).map((startFrame,i)=>({startFrame,endFrame:offsets[i+1]}));
        if(texture)check(texture.intervals?.length===spans.length&&texture.intervals.every((r,i)=>r.index===i&&r.startFrame===spans[i].startFrame&&r.endFrame===spans[i].endFrame),'idle sustain atlas must bind retained source offsets exactly');
      }
      layers[role][mode]={...record,samples,nativePeak,intervals:spans,sustain:texture,...(npc?{playbackState:mode}:{})};
    }}
    const bank=Object.freeze({...v,layers});verifiedVehicleBanks.add(bank);vehicles.set(v.model,bank);
  }
  if(allowedModels)check(vehicles.size===allowedModels.length,'four verified stock vehicles required');
  return {manifest,base,vehicles};
}

export class StockVehicleSource {
  constructor(vehicle,{sourceGain=1,atlas=null,pressureShares={engine:.5,exhaust:.5},pressureSharesByState=null,exhaustEvents=null,preparation10=null,smoothTextureFallback=false,loadPressure=null,x80LoadResponse=false}={}){
    check((verifiedVehicleBanks.has(vehicle)||analyticFixture(vehicle))&&Number.isFinite(sourceGain)&&sourceGain>0&&sourceGain<=2,'verified model or explicit analytical fixture and bounded shared source calibration');
    const prepared=preparation10===null?null:sourcePreparations10.get(preparation10);
    check(preparation10===null||prepared&&prepared.vehicle===vehicle&&prepared.model===vehicle.model&&prepared.audioContext===vehicle.audioContext&&prepared.atlas===atlas&&prepared.entries.every(e=>vehicle.layers[e.role][e.mode]===e.asset&&e.asset.nativePeak===e.nativePeak),'exact branded source preparation required');
    this.npc=vehicle.audioContext==='npc';this.modes=this.npc?Object.freeze(['idle','accel']):stockModes;
    check(typeof x80LoadResponse==='boolean'&&(!x80LoadResponse||!this.npc&&vehicle.model==='prototipo'&&loadPressure===null),'distinct X80 player load response required');
    if(x80LoadResponse)this.x80LoadResponse=new X80LoadResponse();
    const shareStates=pressureSharesByState?[pressureSharesByState.idle,pressureSharesByState.load,pressureSharesByState.lift]:[pressureShares,pressureShares,pressureShares];
    check(shareStates.every(s=>s&&stockRoles.every(role=>Number.isFinite(s[role])&&s[role]>0&&s[role]<1)&&Math.abs(s.engine+s.exhaust-1)<1e-12),'explicit pressure shares must sum to one');
    this.shareStates=shareStates.map(s=>Object.freeze({...s}));
    if(loadPressure!==null){
      check(loadPressure&&stockRoles.every(role=>Number.isFinite(loadPressure[role])&&loadPressure[role]>0&&loadPressure[role]<=1),
        'bounded unloaded engine/exhaust load pressure required');
      this.loadPressure={unloaded:stockRoles.map(role=>loadPressure[role]),position:1};
    }
    this.pressureShares=Object.freeze({...pressureShares});
    this.pressureSharesByState=pressureSharesByState?Object.freeze({idle:this.shareStates[0],load:this.shareStates[1],lift:this.shareStates[2]}):null;
    this.inputBounds=Object.fromEntries(stockRoles.map(role=>{
      const peak=prepared?.peaks[role]??Math.max(...this.modes.map(mode=>{const a=vehicle.layers[role][mode];return a.nativePeak??a.samples.reduce((p,v)=>Math.max(p,Math.abs(v)),0);}));
      const bound=sourceGain*Math.max(...this.shareStates.map(s=>s[role]))*peak;
      check(bound<=.98,'calibrated native PCM exceeds declared individual input budget');return [role,bound];}));
    this.vehicle=vehicle;this.gain=sourceGain;this.frame=0;this.envelope=0;this.position=.1;
    this.weights=this.npc?[1,0]:[1,0,0];this.voices={};this.stats={frames:0,peak:0,maximumStep:0,modeledRpm:false,oscillatorSamples:0,
      energy:{engine:{actual:0,reference:0},exhaust:{actual:0,reference:0}},
      transitions:{basis:'role-local weighted native-interval rate; entering PCM waveform alignment; not crank RPM or native state semantics',
        phaseAlignments:0,alignmentRequests:0,roles:Object.fromEntries(stockRoles.map(role=>[role,{alignments:0,alignmentRequests:0,skippedVoiceFrames:0,
          minimumCommonRateHz:Infinity,maximumCommonRateHz:0,maximumRateStepHz:0}]))}};
    if(this.x80LoadResponse)this.stats.energyReferenceBasis='pre-colour weighted grain energy with the applied load pressure and one-shot';
    this.previous={engine:0,exhaust:0};this.commonRates={engine:null,exhaust:null};
    if(exhaustEvents){check(!this.npc&&vehicle.model==='prototipo','verified native pops must not be substituted across vehicles or contexts');
      if(exhaustEvents.inferFromControls&&verifiedVehicleBanks.has(vehicle))
        check(stockPopsMatchBank(exhaustEvents.assets,vehicle),'control-derived native pops must match the decoded X80 archive and container');
      this.events=new StockExhaustEvents({...exhaustEvents,bedPeakBound:this.inputBounds.exhaust,roleGainBound:sourceGain*Math.max(...this.shareStates.map(s=>s.exhaust))});this.stats.events=this.events.stats;}
    for(const role of stockRoles)this.voices[role]=Object.fromEntries(this.modes.map(mode=>[mode,new StockGrainVoice(vehicle.layers[role][mode],{regions:atlas?.[role]?.[mode],smoothTextureFallback,
      ...(prepared?{preparation10:prepared.entries.find(e=>e.role===role&&e.mode===mode).preparation10}:{})})]));
    if(this.npc)this.stats.transitionPolicy='authored: follow operating point through accel PCM on lift; blend to recorded idle below .28; no decel voice or native scheduling claim';
  }
  prepareInitialMatches01(){
    for(const role of stockRoles)for(const mode of this.modes)this.voices[role][mode].prepareInitialMatch01();
  }
  initialMatchReuses01(){
    let total=0;
    for(const role of stockRoles)for(const mode of this.modes)if(this.voices[role][mode].reusedInitialMatch01)total++;
    return total;
  }
  renderInto(control,engine,exhaust,frames=engine.length){
    check(Number.isFinite(control.operatingPoint)&&control.operatingPoint>=0&&control.operatingPoint<=1&&
      Number.isFinite(control.load)&&control.load>=0&&control.load<=1&&typeof control.running==='boolean'&&
      (control.lift===undefined||typeof control.lift==='boolean'),'authored normalized operating state');
    const x80Response=this.x80LoadResponse;
    if(x80Response)check(control.gear===undefined||Number.isInteger(control.gear)&&control.gear>=-1&&control.gear<=12,'bounded X80 gear observation');
    check(engine instanceof Float32Array&&exhaust instanceof Float32Array&&Number.isInteger(frames)&&frames>0&&frames<=512&&engine.length>=frames&&exhaust.length>=frames,'caller-owned source buffers');
    check(engine.buffer!==exhaust.buffer||engine.byteOffset+frames*4<=exhaust.byteOffset||exhaust.byteOffset+frames*4<=engine.byteOffset,'source outputs must not alias');
    for(const role of stockRoles)for(const mode of this.modes){const samples=this.voices[role][mode].samples;
      for(const output of [engine,exhaust])check(output.buffer!==samples.buffer||output.byteOffset+frames*4<=samples.byteOffset||samples.byteOffset+samples.byteLength<=output.byteOffset,'source output must not overwrite verified PCM');}
    for(const plan of this.events?.boundPlans??[])for(const output of [engine,exhaust]){const s=plan.asset.samples;
      check(output.buffer!==s.buffer||output.byteOffset+frames*4<=s.byteOffset||s.byteOffset+s.byteLength<=output.byteOffset,'output must not overwrite verified finite event PCM');}
    this.events?.observe(control,this.frame,frames);
    x80Response?.observe(control);
    const idle=1-clamp((control.operatingPoint-.08)/.2),decel=control.lift?1:clamp((.25-control.load)/.2),target=this.npc?[idle,1-idle]:[idle,(1-idle)*(1-decel),(1-idle)*decel];
    const loadPressure=this.loadPressure;
    // Load above the existing decel crossover previously selected the same
    // accel layer at identical revs. Shape its excitation independently of
    // grain rate. Full load keeps the original pressure bound.
    const effort=loadPressure?clamp((control.load-.25)/.60):0;
    const targetLoad=effort*effort*(3-2*effort);
    const a=1-Math.exp(-1/(FS*.04)),e=1-Math.exp(-1/(FS*.025));
    const modeCoefficient=x80Response&&control.lift?overrunCrossfade:a;
    // The target is constant within this block. A weight at zero can enter
    // only on its first sample, so preserve the old weights just once.
    const weights=this.weights,previousWeights=weights.slice(),entering=[],addresses=[.5,0,0];
    // Resolve the current readers and pressure shares once per block. Keep
    // sample updates and accumulation in their original mode and role order.
    const readers=stockRoles.map(role=>this.modes.map(mode=>this.voices[role][mode]));
    const shares=stockRoles.map(role=>this.shareStates.map(state=>state[role]));
    const roleEnergy=stockRoles.map(role=>this.stats.energy[role]);
    const transitions=stockRoles.map(role=>this.stats.transitions.roles[role]);
    const fixedRates=stockRoles.map(role=>this.modes.map((mode,index)=>{
      const voice=this.voices[role][mode];
      return index===0||voice.intervals.length===1&&voice.rateAt===StockGrainVoice.prototype.rateAt?
        voice.rateAt(.5):null;
    }));
    for(let i=0;i<frames;i++){
      this.position+=a*(control.operatingPoint-this.position);this.envelope+=e*((control.running?1:0)-this.envelope);
      if(loadPressure)loadPressure.position+=a*(targetLoad-loadPressure.position);
      x80Response?.advance();
      let weightTotal=0;
      for(let m=0;m<weights.length;m++){
        weights[m]+=modeCoefficient*(target[m]-weights[m]);
        // Complete only numerically negligible IIR tails. This is floating-
        // point completion, not an audible gate or another smoothing preset.
        if(target[m]===0&&weights[m]<Number.EPSILON)weights[m]=0;
        if(i===0&&previousWeights[m]===0&&weights[m]>0)entering.push(m);
        weightTotal+=weights[m];
      }
      addresses[1]=this.position;addresses[2]=1-this.position;
      for(let roleIndex=0;roleIndex<2;roleIndex++){
        const role=stockRoles[roleIndex],output=roleIndex?exhaust:engine;
        const voices=readers[roleIndex];
        let weightedRate=this.weights[0]*fixedRates[roleIndex][0];
        for(let m=1;m<this.weights.length;m++){
          if(this.weights[m]>0)weightedRate+=this.weights[m]*(fixedRates[roleIndex][m]??voices[m].rateAt(addresses[m]));
        }
        const rate=weightedRate/weightTotal,transition=transitions[roleIndex];
        transition.minimumCommonRateHz=Math.min(transition.minimumCommonRateHz,rate);
        transition.maximumCommonRateHz=Math.max(transition.maximumCommonRateHz,rate);
        const previousRate=roleIndex?this.commonRates.exhaust:this.commonRates.engine;
        if(previousRate!==null)transition.maximumRateStepHz=Math.max(transition.maximumRateStepHz,Math.abs(rate-previousRate));
        if(roleIndex)this.commonRates.exhaust=rate;else this.commonRates.engine=rate;
        if(i===0&&entering.length){
          let dominant=0;for(let m=0;m<previousWeights.length;m++)if(previousWeights[m]>previousWeights[dominant])dominant=m;
          const reference=voices[dominant];
          // Register before rendering this sample. Every active head then
          // consumes the same interval-rate increment, independently per role.
          for(const m of entering){transition.alignmentRequests++;this.stats.transitions.alignmentRequests++;
            if(voices[m].alignTo(reference,addresses[m],rate)){transition.alignments++;this.stats.transitions.phaseAlignments++;}}
        }
        const unloaded=loadPressure?.unloaded[roleIndex];
        const accelerationPressure=x80Response?x80Response.pressure(roleIndex):loadPressure?unloaded+(1-unloaded)*loadPressure.position:1;
        const decelerationPressure=x80Response?x80Roles[roleIndex].overrunPressure:1;
        let sum=0,expected=0;for(let m=0;m<this.modes.length;m++){
          if(this.weights[m]===0){transition.skippedVoiceFrames++;continue;}
          const voice=voices[m],share=shares[roleIndex][m]*(m===1?accelerationPressure:m===2?decelerationPressure:1);
          sum+=this.weights[m]*share*voice.next(addresses[m],rate);expected+=this.weights[m]*share*share*voice.lastExpectedEnergy;
        }
        // Declared pressure shares retain an explicit two-emitter budget.
        // Native REL numeric fields are not interpreted as amplitude gains.
        if(x80Response)sum=x80Response.colour(roleIndex,sum,weights[1]);
        // The one-shot enters the tailpipe pressure after the sustained
        // load filter. Its original attack travels through the same paths.
        if(role==='exhaust'&&this.events){
          let eventShare=0;for(let m=0;m<this.weights.length;m++)eventShare+=this.weights[m]*this.shareStates[m][role];
          const event=this.events.next(this.frame)*eventShare;
          expected+=2*sum*event+event*event;sum+=event;
        }
        const value=sum*this.gain*this.envelope;check(Number.isFinite(value)&&Math.abs(value)<=.98+1e-12,'source PCM bound');
        output[i]=value;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
        roleEnergy[roleIndex].actual+=value*value;roleEnergy[roleIndex].reference+=expected*(this.gain*this.envelope)**2;
        const previousPressure=roleIndex?this.previous.exhaust:this.previous.engine;
        this.stats.maximumStep=Math.max(this.stats.maximumStep,Math.abs(value-previousPressure));
        if(roleIndex)this.previous.exhaust=value;else this.previous.engine=value;
      }
      this.frame++;
    }
    this.stats.frames+=frames;return this.stats;
  }
}

const responseSmoothing = seconds => 1 - Math.exp(-1 / (FS * seconds));
const smooth = value => value * value * (3 - 2 * value);

const attack = responseSmoothing(.014);
const release = responseSmoothing(.045);
const overrunPressureRelease = responseSmoothing(.010);
const overrunCrossfade = responseSmoothing(.020);
const cutAttack = .012 * FS;
const cutHold = .04 * FS;
const cutEnd = .13 * FS;
const x80Roles = [
  {unloadedPressure: .80, unloadedColour: .53, loadedColour: .12, cutoff: 1800, torqueCut: .32, overrunPressure: .80},
  {unloadedPressure: .42, unloadedColour: .80, loadedColour: -.17, cutoff: 1450, torqueCut: .74, overrunPressure: .54},
].map(role => ({...role, filter: 1 - Math.exp(-2 * Math.PI * role.cutoff / FS)}));

// The native grain reader owns phase and pitch. This response controls how
// much of the recorded attack and pulse edge comes through with load.
class X80LoadResponse {
  constructor() {
    this.effort = 1;
    this.target = 1;
    this.filtered = [0, 0];
    this.cut = 0;
    this.shiftAge = cutEnd;
    this.previousGear = 0;
    this.previousLoad = 0;
    this.previousRevs = 0;
    this.release = release;
  }

  observe(control) {
    this.target = smooth(clamp((control.load - .25) / .60));
    this.release = control.lift ? overrunPressureRelease : release;
    const gear = control.running ? (control.gear ?? 0) : 0;
    if (this.shiftAge >= cutEnd && this.previousGear > 0 && gear === this.previousGear + 1 &&
        this.previousLoad >= .6 && this.previousRevs >= .60) this.shiftAge = 0;
    if (!control.running) {
      this.shiftAge = cutEnd;
      this.cut = 0;
    }
    this.previousGear = gear;
    this.previousLoad = control.load;
    this.previousRevs = control.operatingPoint;
  }

  advance() {
    this.effort += (this.target - this.effort) * (this.target > this.effort ? attack : this.release);
    if (this.shiftAge >= cutEnd) { this.cut = 0; return; }
    const age = this.shiftAge++;
    this.cut = age < cutAttack ? smooth(age / cutAttack) : 1 - smooth(clamp((age - cutHold) / (cutEnd - cutHold)));
  }

  pressure(roleIndex) {
    const role = x80Roles[roleIndex];
    return (role.unloadedPressure + (1 - role.unloadedPressure) * this.effort) * (1 - role.torqueCut * this.cut);
  }

  colour(roleIndex, raw, accelerationWeight) {
    const role = x80Roles[roleIndex];
    const low = this.filtered[roleIndex] += role.filter * (raw - this.filtered[roleIndex]);
    const mix = accelerationWeight * (role.unloadedColour + (role.loadedColour - role.unloadedColour) * this.effort);
    // The low-pass has unity DC gain and bounded input, so this normalises the
    // high shelf with its worst-case peak bound instead of clipping pulses.
    return (raw + mix * (low - raw)) / (1 + 2 * Math.max(0, -mix));
  }
}
