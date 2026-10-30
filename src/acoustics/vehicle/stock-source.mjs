// Private decoded game PCM -> bounded source buffers. No spatial renderer,
// synthetic oscillator, native voice interception or audio endpoint.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {StockGrainVoice} from './stock-grain.mjs';
import {StockExhaustEvents} from './stock-events.mjs';
export {loadStockExhaustPops} from './stock-events.mjs';
export {StockGrainVoice,NativePcmVoice} from './stock-grain.mjs';
const FS=48000,clamp=x=>Math.max(0,Math.min(1,x));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const verifiedVehicleBanks=new WeakSet();
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
  constructor(vehicle,{sourceGain=1,atlas=null,pressureShares={engine:.5,exhaust:.5},pressureSharesByState=null,exhaustEvents=null}={}){
    check((verifiedVehicleBanks.has(vehicle)||analyticFixture(vehicle))&&Number.isFinite(sourceGain)&&sourceGain>0&&sourceGain<=2,'verified model or explicit analytical fixture and bounded shared source calibration');
    this.npc=vehicle.audioContext==='npc';this.modes=this.npc?Object.freeze(['idle','accel']):stockModes;
    const shareStates=pressureSharesByState?[pressureSharesByState.idle,pressureSharesByState.load,pressureSharesByState.lift]:[pressureShares,pressureShares,pressureShares];
    check(shareStates.every(s=>s&&stockRoles.every(role=>Number.isFinite(s[role])&&s[role]>0&&s[role]<1)&&Math.abs(s.engine+s.exhaust-1)<1e-12),'explicit pressure shares must sum to one');
    this.shareStates=shareStates.map(s=>Object.freeze({...s}));
    this.pressureShares=Object.freeze({...pressureShares});
    this.pressureSharesByState=pressureSharesByState?Object.freeze({idle:this.shareStates[0],load:this.shareStates[1],lift:this.shareStates[2]}):null;
    this.inputBounds=Object.fromEntries(stockRoles.map(role=>{
      const peak=Math.max(...this.modes.map(mode=>{const a=vehicle.layers[role][mode];return a.nativePeak??a.samples.reduce((p,v)=>Math.max(p,Math.abs(v)),0);}));
      const bound=sourceGain*Math.max(...this.shareStates.map(s=>s[role]))*peak;
      check(bound<=.98,'calibrated native PCM exceeds declared individual input budget');return [role,bound];}));
    this.vehicle=vehicle;this.gain=sourceGain;this.frame=0;this.envelope=0;this.position=.1;
    this.weights=this.npc?[1,0]:[1,0,0];this.voices={};this.stats={frames:0,peak:0,maximumStep:0,modeledRpm:false,oscillatorSamples:0,
      energy:{engine:{actual:0,reference:0},exhaust:{actual:0,reference:0}},
      transitions:{basis:'role-local weighted native-interval rate; entering PCM waveform alignment; not crank RPM or native state semantics',
        phaseAlignments:0,alignmentRequests:0,roles:Object.fromEntries(stockRoles.map(role=>[role,{alignments:0,alignmentRequests:0,skippedVoiceFrames:0,
          minimumCommonRateHz:Infinity,maximumCommonRateHz:0,maximumRateStepHz:0}]))}};
    this.previous={engine:0,exhaust:0};this.commonRates={engine:null,exhaust:null};
    if(exhaustEvents){check(!this.npc&&vehicle.model==='prototipo','verified native pops must not be substituted across vehicles or contexts');
      this.events=new StockExhaustEvents({...exhaustEvents,bedPeakBound:this.inputBounds.exhaust,roleGainBound:sourceGain*Math.max(...this.shareStates.map(s=>s.exhaust))});this.stats.events=this.events.stats;}
    for(const role of stockRoles)this.voices[role]=Object.fromEntries(this.modes.map(mode=>[mode,new StockGrainVoice(vehicle.layers[role][mode],{regions:atlas?.[role]?.[mode]})]));
    if(this.npc)this.stats.transitionPolicy='authored: follow operating point through accel PCM on lift; blend to recorded idle below .28; no decel voice or native scheduling claim';
  }
  renderInto(control,engine,exhaust,frames=engine.length){
    check(Number.isFinite(control.operatingPoint)&&control.operatingPoint>=0&&control.operatingPoint<=1&&
      Number.isFinite(control.load)&&control.load>=0&&control.load<=1&&typeof control.running==='boolean'&&
      (control.lift===undefined||typeof control.lift==='boolean'),'authored normalized operating state');
    check(engine instanceof Float32Array&&exhaust instanceof Float32Array&&Number.isInteger(frames)&&frames>0&&frames<=512&&engine.length>=frames&&exhaust.length>=frames,'caller-owned source buffers');
    check(engine.buffer!==exhaust.buffer||engine.byteOffset+frames*4<=exhaust.byteOffset||exhaust.byteOffset+frames*4<=engine.byteOffset,'source outputs must not alias');
    for(const role of stockRoles)for(const mode of this.modes){const samples=this.voices[role][mode].samples;
      for(const output of [engine,exhaust])check(output.buffer!==samples.buffer||output.byteOffset+frames*4<=samples.byteOffset||samples.byteOffset+samples.byteLength<=output.byteOffset,'source output must not overwrite verified PCM');}
    for(const plan of this.events?.plans??[])for(const output of [engine,exhaust]){const s=plan.asset.samples;
      check(output.buffer!==s.buffer||output.byteOffset+frames*4<=s.byteOffset||s.byteOffset+s.byteLength<=output.byteOffset,'output must not overwrite verified finite event PCM');}
    const idle=1-clamp((control.operatingPoint-.08)/.2),decel=control.lift?1:clamp((.25-control.load)/.2),target=this.npc?[idle,1-idle]:[idle,(1-idle)*(1-decel),(1-idle)*decel];
    const a=1-Math.exp(-1/(FS*.04)),e=1-Math.exp(-1/(FS*.025));
    for(let i=0;i<frames;i++){
      this.position+=a*(control.operatingPoint-this.position);this.envelope+=e*((control.running?1:0)-this.envelope);
      const entering=[],previousWeights=[...this.weights];
      for(let m=0;m<this.modes.length;m++){
        this.weights[m]+=a*(target[m]-this.weights[m]);
        // Complete only numerically negligible IIR tails. This is floating-
        // point completion, not an audible gate or another smoothing preset.
        if(target[m]===0&&this.weights[m]<Number.EPSILON)this.weights[m]=0;
        if(previousWeights[m]===0&&this.weights[m]>0)entering.push(m);
      }
      const addresses=[.5,this.position,1-this.position],weightTotal=this.weights.reduce((s,w)=>s+w,0);
      for(let roleIndex=0;roleIndex<2;roleIndex++){
        const role=stockRoles[roleIndex],output=roleIndex?exhaust:engine;
        const voices=this.voices[role],rates=this.modes.map((mode,m)=>voices[mode].rateAt(addresses[m]));
        const rate=this.weights.reduce((s,w,m)=>s+w*rates[m],0)/weightTotal,transition=this.stats.transitions.roles[role];
        transition.minimumCommonRateHz=Math.min(transition.minimumCommonRateHz,rate);
        transition.maximumCommonRateHz=Math.max(transition.maximumCommonRateHz,rate);
        if(this.commonRates[role]!==null)transition.maximumRateStepHz=Math.max(transition.maximumRateStepHz,Math.abs(rate-this.commonRates[role]));
        this.commonRates[role]=rate;
        if(entering.length){
          const dominant=previousWeights.reduce((best,w,m)=>w>previousWeights[best]?m:best,0),reference=voices[this.modes[dominant]];
          // Register before rendering this sample. Every active head then
          // consumes the same interval-rate increment, independently per role.
          for(const m of entering){transition.alignmentRequests++;this.stats.transitions.alignmentRequests++;
            if(voices[this.modes[m]].alignTo(reference,addresses[m],rate)){transition.alignments++;this.stats.transitions.phaseAlignments++;}}
        }
        let sum=0,expected=0;for(let m=0;m<this.modes.length;m++){
          if(this.weights[m]===0){transition.skippedVoiceFrames++;continue;}
          const voice=voices[this.modes[m]],share=this.shareStates[m][role];
          sum+=this.weights[m]*share*voice.next(addresses[m],rate);expected+=this.weights[m]*share*share*voice.lastExpectedEnergy;
        }
        // Declared pressure shares retain an explicit two-emitter budget.
        // Native REL numeric fields are not interpreted as amplitude gains.
        // Load selects real accel/decel material;
        // only graph-bound finite PCM events may be explicitly scheduled.
        if(role==='exhaust'&&this.events){
          const eventShare=this.weights.reduce((s,w,m)=>s+w*this.shareStates[m][role],0),event=this.events.next(this.frame)*eventShare;
          expected+=2*sum*event+event*event;sum+=event;
        }
        const value=sum*this.gain*this.envelope;check(Number.isFinite(value)&&Math.abs(value)<=.98+1e-12,'source PCM bound');
        output[i]=value;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
        this.stats.energy[role].actual+=value*value;this.stats.energy[role].reference+=expected*(this.gain*this.envelope)**2;
        this.stats.maximumStep=Math.max(this.stats.maximumStep,Math.abs(value-this.previous[role]));this.previous[role]=value;
      }
      this.frame++;
    }
    this.stats.frames+=frames;return this.stats;
  }
}
