// Private decoded game PCM -> bounded source buffers. No spatial renderer,
// synthetic oscillator, native voice interception or audio endpoint.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {StockGrainVoice} from './stock-grain.mjs';
export {StockGrainVoice,NativePcmVoice} from './stock-grain.mjs';
const FS=48000,clamp=x=>Math.max(0,Math.min(1,x));
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const stockModels=Object.freeze(['bati','lectro','prototipo','schafter3']);
export const stockRoles=Object.freeze(['engine','exhaust']);
export const stockModes=Object.freeze(['idle','accel','decel']);

export function loadStockAssets(manifestFile){
  const base=path.dirname(path.resolve(manifestFile)),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  check(manifest.schema===1&&Array.isArray(manifest.vehicles),'verified private decoder manifest required');
  const atlas=JSON.parse(fs.readFileSync(path.join(base,'analysis-intervals.json'),'utf8'));
  const vehicles=new Map();
  for(const v of manifest.vehicles){
    check(stockModels.includes(v.model)&&!vehicles.has(v.model),'exact distinct requested vehicle identity');
    const layers={};
    for(const role of stockRoles){layers[role]={};for(const mode of stockModes){
      const record=v.layers?.[role]?.[mode];check(record&&record.channels===1&&record.sourceFormat?.codec===0,'verified mono PCM0 layer required');
      check([24000,32000,48000].includes(record.sampleRate)&&record.frames>4096,'bounded native source format');
      const file=path.resolve(base,record.file);check(file.startsWith(base+path.sep),'private asset path escaped manifest');
      const bytes=fs.readFileSync(file),hash=createHash('sha256').update(bytes).digest('hex');
      check(hash.toUpperCase()===record.sha256.toUpperCase()&&bytes.length===record.frames*4,'private source binding differs');
      const samples=new Float32Array(record.frames);for(let i=0;i<samples.length;i++){samples[i]=bytes.readFloatLE(i*4);check(Number.isFinite(samples[i])&&Math.abs(samples[i])<=1,'invalid source sample');}
      const intervals=atlas.streams.find(s=>s.model===v.model&&s.layer===role&&s.state===mode);
      if(mode!=='idle')check(intervals?.file===record.file&&intervals.frames===record.frames&&intervals.sampleRate===record.sampleRate&&intervals.candidateIntervals?.length>1,'verified offset-bounded playback intervals required');
      layers[role][mode]={...record,samples,intervals:intervals?.candidateIntervals??null};
    }}
    vehicles.set(v.model,{...v,layers});
  }
  check(vehicles.size===4,'four verified stock vehicles required');
  return {manifest,base,vehicles};
}

export class StockVehicleSource {
  constructor(vehicle,{sourceGain=1,atlas=null,pressureShares={engine:.5,exhaust:.5}}={}){
    // Baseline shares are .5/.5. Authored role balances must also keep each
    // calibrated stem at or below its decoded amplitude, before propagation.
    check(stockModels.includes(vehicle.model)&&Number.isFinite(sourceGain)&&sourceGain>0&&sourceGain<=2,'verified model and bounded shared source calibration');
    check(stockRoles.every(role=>Number.isFinite(pressureShares[role])&&pressureShares[role]>0&&pressureShares[role]<1)&&
      Math.abs(pressureShares.engine+pressureShares.exhaust-1)<1e-12&&sourceGain*Math.max(pressureShares.engine,pressureShares.exhaust)<=1,
      'explicit pressure shares must sum to one and preserve decoded per-stem amplitude bounds');
    this.pressureShares=Object.freeze({...pressureShares});
    this.vehicle=vehicle;this.gain=sourceGain;this.frame=0;this.envelope=0;this.position=.1;
    this.weights=[1,0,0];this.voices={};this.stats={frames:0,peak:0,maximumStep:0,modeledRpm:false,oscillatorSamples:0,
      energy:{engine:{actual:0,reference:0},exhaust:{actual:0,reference:0}}};this.previous={engine:0,exhaust:0};
    for(const role of stockRoles)this.voices[role]=Object.fromEntries(stockModes.map(mode=>[mode,new StockGrainVoice(vehicle.layers[role][mode],{regions:atlas?.[role]?.[mode]})]));
  }
  renderInto(control,engine,exhaust,frames=engine.length){
    check(Number.isFinite(control.operatingPoint)&&control.operatingPoint>=0&&control.operatingPoint<=1&&
      Number.isFinite(control.load)&&control.load>=0&&control.load<=1&&typeof control.running==='boolean'&&
      (control.lift===undefined||typeof control.lift==='boolean'),'authored normalized operating state');
    check(engine instanceof Float32Array&&exhaust instanceof Float32Array&&Number.isInteger(frames)&&frames>0&&frames<=512&&engine.length>=frames&&exhaust.length>=frames,'caller-owned source buffers');
    check(engine.buffer!==exhaust.buffer||engine.byteOffset+frames*4<=exhaust.byteOffset||exhaust.byteOffset+frames*4<=engine.byteOffset,'source outputs must not alias');
    for(const role of stockRoles)for(const mode of stockModes){const samples=this.voices[role][mode].samples;
      for(const output of [engine,exhaust])check(output.buffer!==samples.buffer||output.byteOffset+frames*4<=samples.byteOffset||samples.byteOffset+samples.byteLength<=output.byteOffset,'source output must not overwrite verified PCM');}
    const idle=1-clamp((control.operatingPoint-.08)/.2),decel=control.lift?1:clamp((.25-control.load)/.2),target=[idle,(1-idle)*(1-decel),(1-idle)*decel];
    const a=1-Math.exp(-1/(FS*.04)),e=1-Math.exp(-1/(FS*.025));
    for(let i=0;i<frames;i++){
      this.position+=a*(control.operatingPoint-this.position);this.envelope+=e*((control.running?1:0)-this.envelope);
      for(let m=0;m<3;m++)this.weights[m]+=a*(target[m]-this.weights[m]);
      for(let roleIndex=0;roleIndex<2;roleIndex++){
        const role=stockRoles[roleIndex],output=roleIndex?exhaust:engine;
        let sum=0,expected=0;for(let m=0;m<3;m++){
          const voice=this.voices[role][stockModes[m]],address=m===2?1-this.position:m===0?.5:this.position;
          sum+=this.weights[m]*voice.next(address);expected+=this.weights[m]*voice.lastExpectedEnergy;
        }
        // Declared pressure shares retain an explicit two-emitter budget.
        // Native REL numeric fields are not interpreted as amplitude gains.
        // Load selects real accel/decel material;
        // there is no extra decorative roar, boost layer or event waveform.
        const share=this.pressureShares[role],value=sum*share*this.gain*this.envelope;check(Number.isFinite(value)&&Math.abs(value)<=1,'source PCM bound');
        output[i]=value;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
        this.stats.energy[role].actual+=value*value;this.stats.energy[role].reference+=expected*(share*this.gain*this.envelope)**2;
        this.stats.maximumStep=Math.max(this.stats.maximumStep,Math.abs(value-this.previous[role]));this.previous[role]=value;
      }
      this.frame++;
    }
    this.stats.frames+=frames;return this.stats;
  }
}
