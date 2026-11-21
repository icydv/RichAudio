// Bounded startup preparation. Work runs on the caller's thread before output
// startup; it is neither a worker nor CPU isolation between render deadlines.
import {StockVehicleSource,prepareStockSource10,sourcePreparationLimits10} from './stock-source.mjs';
import {SourcePreparationBudgetError10} from './source-preparation-budget10.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};

export class StockSourceDataPreparation10 {
 constructor(){this.plans=new Map();this.bytes=0;this.preparing=false;}
 prepare(bank){
  const previous=this.plans.get(bank);if(previous)return previous;
  check(!this.preparing,'one source-data preparation at a time');
  if(this.plans.size>=sourcePreparationLimits10.maximumBanks)throw new SourcePreparationBudgetError10('banks',sourcePreparationLimits10.maximumBanks);
  if(this.bytes>=sourcePreparationLimits10.maximumBytes)throw new SourcePreparationBudgetError10('bytes',sourcePreparationLimits10.maximumBytes);
  this.preparing=true;
  try{const plan=prepareStockSource10(bank,{maximumBytes:sourcePreparationLimits10.maximumBytes-this.bytes});
   this.plans.set(bank,plan);this.bytes+=plan.bytes;return plan;
  }finally{this.preparing=false;}
 }
 get(bank){return this.plans.get(bank)??null;}
 diagnostics(){return {banks:this.plans.size,bytes:this.bytes,maximumBanks:sourcePreparationLimits10.maximumBanks,maximumBytes:sourcePreparationLimits10.maximumBytes,
  maximumConcurrentPreparations:1,sourceFramesAdvanced:0,pcmQueueFramesAdded:0,cpuIsolation:false};}
}

/** Existing accepted banks remain playable when preparation capacity is full.
 * Only typed preparation-budget exhaustion uses the original cold fallback. */
export function prepareStockSourcesForStartup10(registry,eligible){
 const seen=new Set(),unpreparedBanks=[],sourceJitPreparation10=[];let warmedBanks=0;
 for(const pair of eligible){
  const resolved=registry.resolve(pair.model,pair.context);if(resolved.status!=='available')throw Error('prepared eligible model no longer maps');
  if(seen.has(resolved.bank))continue;seen.add(resolved.bank);
  let plan;try{plan=registry.prepareSource10(pair.model,pair.context);}catch(error){
   if(!(error instanceof SourcePreparationBudgetError10))throw error;
   unpreparedBanks.push({bank:resolved.bank.model,context:pair.context,reason:error.kind,maximum:error.maximum,fallback:'immediate-cold-constructor'});continue;
  }
  sourceJitPreparation10.push(warmStockSourceJit10(plan));warmedBanks++;
 }
 return {warmedBanks,unpreparedBanks,sourcePreparation10:registry.preparationDiagnostics10(),sourceJitPreparation10};
}

const jitResults10=new Map();
/** Main-isolate JIT work uses only authored throwaway data. It cannot advance a
 * loaded bank, genuine vehicle, ownership lease or eventual playback cursor. */
export function warmStockSourceJit10({npc=false,voiceTextures=Array(npc?4:6).fill(false)}={}){
 check(typeof npc==='boolean'&&Array.isArray(voiceTextures)&&voiceTextures.length===(npc?4:6)&&Array.from({length:voiceTextures.length},(_,i)=>voiceTextures[i]).every(x=>typeof x==='boolean'),'bounded authored source JIT topology required');
 const key=Number(npc)+':'+voiceTextures.map(Number).join(''),previous=jitResults10.get(key);if(previous)return {...previous,reused:true};
 const bank=authoredStartupBank10(npc,voiceTextures);
 const preparation10=prepareStockSource10(bank),source=new StockVehicleSource(bank,{preparation10}),engine=new Float32Array(512),exhaust=new Float32Array(512);
 for(let block=0;block<32;block++)source.renderInto({operatingPoint:.12+(block%12)*.06,load:block%8<4?.8:.1,lift:block%8>=4,running:block<28},engine,exhaust);
 // A mature voice alone does not exercise a new reader's untouched-to-active
 // code paths. Train those paths using eight further unrelated authored
 // instances, never the eventual bank or a genuine ownership identity.
 for(const [round,operatingPoint] of [.04,.12,.2,.35,.5,.7,.85,.95].entries()){
  const fresh=new StockVehicleSource(bank,{preparation10}),lift=round%2===1;
  for(let block=0;block<2;block++)fresh.renderInto({operatingPoint,load:lift?.05:.9,lift,running:true},engine,exhaust);
 }
 const result=Object.freeze({kind:'authored-throwaway-main-isolate-source-jit10',topology:key,authoredFrames:24576,authoredSources:9,actualSourceFramesAdvanced:0,pcmQueueFramesAdded:0,reused:false});
 jitResults10.set(key,result);return {...result};
}

export function authoredStartupBank10(npc=false,voiceTextures=Array(npc?4:6).fill(false)){
 const frames=8192,intervals=Array.from({length:32},(_,i)=>({startFrame:i*256,endFrame:(i+1)*256}));
 let index=0;
 return {model:'bati',...(npc?{audioContext:'npc'}:{}),layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
  const extra=npc&&mode==='decel',textured=!extra&&voiceTextures[index++],phase=(role==='engine'?0:.23)+['idle','accel','decel'].indexOf(mode)*.17;
  // Unequal nonperiodic inputs exercise the full grain registration search.
  const samples=Float32Array.from({length:frames},(_,i)=>.043*Math.sin(i*.113+phase)+.021*Math.cos(i*.031+phase*.7));
  return [mode,{frames,sampleRate:24000,samples,nativePeak:.064,...(textured?{intervals}:{})}];
 }))]))};
}
