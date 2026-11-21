import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {StockVehicleSource,loadStockCatalogAssets,prepareStockSource10,sourcePreparationLimits10,warmStockSourceJit10} from '../src/acoustics/vehicle/stock-source.mjs';
import {prepareStockGrain10,StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
import {StockSourceDataPreparation10,prepareStockSourcesForStartup10} from '../src/acoustics/vehicle/stock-source-preparation10.mjs';
import {SourcePreparationBudgetError10} from '../src/acoustics/vehicle/source-preparation-budget10.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {originalSourceBank05} from './fixtures/SourcePreparation05.mjs';
import {budgetFrame042,budgetSession042} from './fixtures/AcousticBudget042.mjs';

function intervalBank(rate=24000,{atlas=false,features=false}={}){
 const frames=4096,regions={};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map((role,r)=>[role,Object.fromEntries(['idle','accel','decel'].map((mode,m)=>{
  const intervals=Array.from({length:16},(_,i)=>({startFrame:i*256,endFrame:(i+1)*256}));
  const samples=Float32Array.from({length:frames},(_,i)=>.04*Math.sin(2*Math.PI*(i/128+.13*r+.07*m)));
  const asset={frames,sampleRate:rate,samples,nativePeak:.04,...(!atlas?{intervals}:{})};
  if(features)asset.sustain={state:mode,intervals:intervals.map((s,i)=>({index:i,...s,rms:.028,crestDb:3,detailRatio:.04,transientRisk:false,bandFractions:{low:.3,mid:.5,high:.2}}))};
  (regions[role]??={})[mode]={candidateIntervals:intervals};return [mode,asset];}))]))};
 return {bank,atlas:atlas?regions:null};
}
function compareSources(bank,{atlas=null,blocks=48}={}){
 const plan=prepareStockSource10(bank,{atlas}),options={atlas,sourceGain:1.25,pressureSharesByState:{idle:{engine:.6,exhaust:.4},load:{engine:.4,exhaust:.6},lift:{engine:.45,exhaust:.55}}};
 assert.equal(plan.sourceFramesAdvanced,0);assert.equal(plan.pcmQueueFramesAdded,0);assert(Object.isFrozen(plan));
 const reference=new StockVehicleSource(bank,options),prepared=new StockVehicleSource(bank,{...options,preparation10:plan}),a=[new Float32Array(512),new Float32Array(512)],b=[new Float32Array(512),new Float32Array(512)];
 assert.equal(prepared.frame,0);assert.equal(prepared.stats.frames,0);
 for(const role of ['engine','exhaust'])for(const mode of ['idle','accel','decel']){
  const voice=prepared.voices[role][mode];assert.equal(voice.frame,0);assert.equal(voice.phase,0);assert.equal(voice.clockCycles,0);assert.equal(voice.state,null);assert.equal(voice.head,undefined);
 }
 for(let block=0;block<blocks;block++){
  const control={operatingPoint:block<12?.7:block<24?.4:.04,load:block<12?.9:.05,lift:block>=12,running:block<40};
  reference.renderInto(control,...a);prepared.renderInto(control,...b);
  assert.deepEqual(b[0],a[0]);assert.deepEqual(b[1],a[1]);assert.equal(prepared.frame,reference.frame);
 }
 assert.deepEqual(prepared.stats,reference.stats);assert.deepEqual(prepared.commonRates,reference.commonRates);
 for(const role of ['engine','exhaust'])for(const mode of ['idle','accel','decel']){
  const p=prepared.voices[role][mode],r=reference.voices[role][mode];
  for(const key of ['frame','phase','clockCycles','state','textureSeed','previous','head','join','textureOccupancy','stats'])assert.deepEqual(p[key],r[key],role+':'+mode+':'+key);
 }
 return {plan,prepared,reference};
}

test('prepared long-loop plans preserve each emitted sample and fresh frame-zero history',()=>{
 const bank=originalSourceBank05(),{plan}=compareSources(bank);
 assert.equal(plan.grainPlans,1,'six roles/states may share immutable data but never reader state');
});
for(const rate of [24000,32000,48000])test(`prepared observed interval timelines preserve exact PCM, RNG and transitions at ${rate}`,()=>{
 const {bank}=intervalBank(rate);compareSources(bank);
});
test('external atlas and supplied spectral features preserve exact source history and immutable copied data',()=>{
 const {bank,atlas}=intervalBank(32000,{atlas:true,features:true}),{prepared,plan}=compareSources(bank,{atlas});
 const another=new StockVehicleSource(bank,{atlas,preparation10:plan});
 assert.notEqual(prepared.voices.engine.accel.intervals,another.voices.engine.accel.intervals);
 assert.notEqual(prepared.voices.engine.accel.features,another.voices.engine.accel.features);
 assert.notEqual(prepared.voices.engine.accel.features[0].bandFractions,another.voices.engine.accel.features[0].bandFractions);
 prepared.voices.engine.accel.intervals[0].start=17;prepared.voices.engine.accel.features[0].bandFractions.low=.001;
 const fresh=new StockVehicleSource(bank,{atlas,preparation10:plan});assert.equal(fresh.voices.engine.accel.intervals[0].start,0);assert.equal(fresh.voices.engine.accel.features[0].bandFractions.low,.3);
});
test('a prepared first registration preserves exact PCM, RNG and read counters',()=>{
 const {bank}=intervalBank(32000,{features:true}),preparation10=prepareStockSource10(bank);
 const control={operatingPoint:.5,load:.9,lift:false,running:true};
 const scratch=new StockVehicleSource(bank,{preparation10});
 const live=new StockVehicleSource(bank,{preparation10}),reference=new StockVehicleSource(bank);
 const a=[new Float32Array(512),new Float32Array(512)],b=[new Float32Array(512),new Float32Array(512)];
 scratch.prepareInitialMatches01();
 scratch.renderInto(control,...a);
 assert.equal(live.frame,0);
 for(let block=0;block<6;block++){
  live.renderInto(control,...a);
  reference.renderInto(control,...b);
  assert.deepEqual(a,b);
 }
 assert.equal(live.initialMatchReuses01(),2);
 assert.deepEqual(live.stats,reference.stats);
 for(const role of ['engine','exhaust'])for(const mode of ['idle','accel','decel']){
  const actual=live.voices[role][mode],expected=reference.voices[role][mode];
  assert.equal(actual.textureSeed,expected.textureSeed);
  assert.deepEqual(actual.stats,expected.stats);
 }
 const other=new StockVehicleSource(bank,{preparation10});
 other.renderInto({...control,load:.05,lift:true},...a);
 assert.equal(other.initialMatchReuses01(),0);
});
test('counterfeit plans, changed PCM aliases and changed metadata cannot reuse stale preparation',()=>{
 for(const change of ['samples','interval','features','peak','rate','replacement','atlas','sustain-state','context','model']){
  const {bank,atlas}=intervalBank(24000,{atlas:true,features:true}),plan=prepareStockSource10(bank,{atlas}),asset=bank.layers.engine.idle;
  if(change==='samples')new Float32Array(asset.samples.buffer)[31]+=.001;
  if(change==='interval')atlas.engine.idle.candidateIntervals[0].endFrame--;
  if(change==='features')asset.sustain.intervals[0].bandFractions.low=.25;
  if(change==='peak')asset.nativePeak=.03;
  if(change==='rate')asset.sampleRate=32000;
  if(change==='replacement')bank.layers.engine.idle={...asset};
  if(change==='atlas')atlas.engine.idle={candidateIntervals:structuredClone(atlas.engine.idle.candidateIntervals)};
  if(change==='sustain-state')asset.sustain.state='another-state';
  if(change==='context')bank.audioContext='npc';
  if(change==='model')bank.model='lectro';
  assert.throws(()=>new StockVehicleSource(bank,{atlas,preparation10:plan}),/prepar|content changed/);
 }
 const bank=originalSourceBank05(),plan=prepareStockSource10(bank);
 assert.throws(()=>new StockVehicleSource(bank,{preparation10:{...plan}}),/branded/);
 assert.throws(()=>new StockVehicleSource(originalSourceBank05(),{preparation10:plan}),/branded/);
});
test('preparation memory, bank retention and source-clock work have explicit hard caps',()=>{
 const bank=originalSourceBank05(),cache=new StockSourceDataPreparation10();assert.equal(cache.prepare(bank),cache.prepare(bank));
 for(let i=1;i<sourcePreparationLimits10.maximumBanks;i++)cache.prepare(originalSourceBank05());
 assert.throws(()=>cache.prepare(originalSourceBank05()),error=>error instanceof SourcePreparationBudgetError10&&error.kind==='banks');
 const d=cache.diagnostics();assert.equal(d.banks,8);assert(d.bytes<=d.maximumBytes);assert.equal(d.maximumConcurrentPreparations,1);assert.equal(d.sourceFramesAdvanced,0);assert.equal(d.pcmQueueFramesAdded,0);assert.equal(d.cpuIsolation,false);
 assert.throws(()=>prepareStockSource10(bank,{maximumBytes:1024}),error=>error instanceof SourcePreparationBudgetError10&&error.kind==='bytes');
 const tooLong={...bank.layers.engine.idle,frames:2097153,samples:new Float32Array(2097153)};assert.throws(()=>prepareStockGrain10(tooLong),error=>error instanceof SourcePreparationBudgetError10&&error.kind==='frames');
 const grain=bank.layers.engine.idle,token=prepareStockGrain10(grain);assert.throws(()=>new StockGrainVoice(grain,{preparation10:{...token}}),/branded/);
});
test('nine original accepted banks keep eight bounded prepared plans and an explicit immediate cold fallback',()=>{
 const banks=Array.from({length:9},()=>originalSourceBank05()),cache=new StockSourceDataPreparation10(),created=[];
 const registry={resolve:model=>({status:'available',bank:banks[model]}),prepareSource10:model=>cache.prepare(banks[model]),preparationDiagnostics10:()=>cache.diagnostics(),
  createSource:model=>{const preparation10=cache.get(banks[model]),source=new StockVehicleSource(banks[model],preparation10?{preparation10}:{});created.push(source);return source;}};
 const result=prepareStockSourcesForStartup10(registry,banks.map((_,model)=>({model,context:'player'})));
 assert.equal(result.warmedBanks,8);assert.equal(result.sourcePreparation10.banks,8);assert(result.sourcePreparation10.bytes<=result.sourcePreparation10.maximumBytes);
 assert.equal(result.unpreparedBanks.length,1);assert.equal(result.unpreparedBanks[0].reason,'banks');assert.equal(result.unpreparedBanks[0].fallback,'immediate-cold-constructor');assert.equal(created.length,0);
 assert.equal(cache.get(banks[8]),null);const cold=registry.createSource(8),reference=new StockVehicleSource(banks[8]);assert.equal(cold.frame,0);
 const a=[new Float32Array(512),new Float32Array(512)],b=[new Float32Array(512),new Float32Array(512)],control={operatingPoint:.5,load:.9,running:true};
 for(let block=0;block<8;block++){cold.renderInto(control,...a);reference.renderInto(control,...b);assert.deepEqual(a,b);}
});
test('startup catches only typed preparation limits and leaves malformed bank/data errors fatal',()=>{
 const bank=originalSourceBank05(),eligible=[{model:0,context:'player'}],cache=new StockSourceDataPreparation10(),registry={resolve:()=>({status:'available',bank}),preparationDiagnostics10:()=>cache.diagnostics()};
 const limited=prepareStockSourcesForStartup10({...registry,prepareSource10:()=>{throw new SourcePreparationBudgetError10('bytes',1024);}},eligible);
 assert.equal(limited.warmedBanks,0);assert.equal(limited.unpreparedBanks[0].reason,'bytes');assert.equal(limited.sourcePreparation10.banks,0);
 const malformed=new Error('prepared source memory budget exceeded');
 assert.throws(()=>prepareStockSourcesForStartup10({...registry,prepareSource10:()=>{throw malformed;}},eligible),error=>error===malformed);
 const invalid=originalSourceBank05();invalid.layers.engine.idle.samples[1]=NaN;
 assert.throws(()=>prepareStockSourcesForStartup10({...registry,resolve:()=>({status:'available',bank:invalid}),prepareSource10:()=>cache.prepare(invalid)},eligible),error=>!(error instanceof SourcePreparationBudgetError10)&&/finite bounded/.test(error.message));
});
test('an unprepared ninth bank defers data validation to its original cold activation and still rejects malformed PCM',()=>{
 const banks=Array.from({length:9},()=>originalSourceBank05()),cache=new StockSourceDataPreparation10();banks[8].layers.engine.idle.samples[0]=NaN;
 const registry={resolve:model=>({status:'available',bank:banks[model]}),prepareSource10:model=>cache.prepare(banks[model]),preparationDiagnostics10:()=>cache.diagnostics()};
 const startup=prepareStockSourcesForStartup10(registry,banks.map((_,model)=>({model,context:'player'})));
 assert.equal(startup.warmedBanks,8);assert.equal(startup.unpreparedBanks.length,1);assert.equal(startup.unpreparedBanks[0].reason,'banks');assert.equal(startup.unpreparedBanks[0].fallback,'immediate-cold-constructor');
 assert.equal(cache.get(banks[8]),null);
 assert.throws(()=>new StockVehicleSource(banks[8]),error=>!(error instanceof SourcePreparationBudgetError10)&&/finite bounded/.test(error.message));
});
test('separate authored JIT warming never consumes a prepared actual source or changes its first emitted PCM',()=>{
 const bank=originalSourceBank05(),plan=prepareStockSource10(bank),source=new StockVehicleSource(bank,{preparation10:plan});
 const result=warmStockSourceJit10(plan);assert.equal(result.actualSourceFramesAdvanced,0);assert.equal(result.pcmQueueFramesAdded,0);assert.equal(result.authoredFrames,24576);assert.equal(result.authoredSources,9);assert.equal(source.frame,0);assert.equal(source.stats.frames,0);
 assert.equal(warmStockSourceJit10().reused,true);compareSources(bank,{blocks:8});
});
test('JIT warming has one bounded authored topology for each player/NPC interval layout',()=>{
 for(const npc of [false,true]){
  const voiceTextures=Array(npc?4:6).fill(true),result=warmStockSourceJit10({npc,voiceTextures});
  assert.equal(result.authoredFrames,24576);assert.equal(result.authoredSources,9);assert.equal(result.actualSourceFramesAdvanced,0);assert.equal(result.pcmQueueFramesAdded,0);
  assert.equal(warmStockSourceJit10({npc,voiceTextures}).reused,true);
 }
 for(const options of [{npc:1},{npc:true,voiceTextures:[true]},{voiceTextures:Array(6).fill(1)},{voiceTextures:new Array(6)}])assert.throws(()=>warmStockSourceJit10(options),/topology/);
});
test('installed registry prepares only exact requested verified banks before frame-zero source construction, with explicit cold fallback',()=>{
 const root=fileURLToPath(new URL('../.local/source-preparation10-tests/',import.meta.url)),folder=path.join(root,randomUUID());fs.mkdirSync(folder,{recursive:true});
 try{
  const frames=8192,rate=24000,samples=Float32Array.from({length:frames},(_,i)=>.04*Math.sin(i*.07)),bytes=Buffer.from(samples.buffer),sha=createHash('sha256').update(bytes).digest('hex'),core='c'.repeat(64),awc='a'.repeat(64);
  fs.writeFileSync(path.join(folder,'authored.f32'),bytes);
  const candidateIntervals=Array.from({length:32},(_,i)=>({startFrame:i*256,endFrame:(i+1)*256})),streams=[],analysis=[],links=[];let index=0;
  const bank={model:'authored_bank10',provenance:{awcSha256:awc,entry:'authored.awc'},layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
   const hash=(++index).toString(16).padStart(8,'0');streams.push({name:role+'_'+mode,hash});analysis.push({model:'authored_bank10',layer:role,state:mode,file:'authored.f32',frames,sampleRate:rate,candidateIntervals});
   links.push({State:'verified-installed-container-and-stream',CandidateCount:1,Candidates:[{Path:'authored.awc'}],AwcSHA256:awc,FullRelStreamHash:hash,MaskedAwcStreamId:hash,Stream:{StreamId:hash,Frames:frames,SampleRate:rate,Codec:0}});
   return [mode,{file:'authored.f32',channels:1,frames,sampleRate:rate,sha256:sha,sourceFormat:{codec:0},granular:{grains:Array.from({length:33},(_,i)=>({UnkUint1:i*256}))}}];
  }))]))};bank.streams=streams;
  const manifest=path.join(folder,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({schema:1,sourceAssemblies:{CodeWalkerCoreSha256:core},vehicles:[bank]}));fs.writeFileSync(path.join(folder,'analysis-intervals.json'),JSON.stringify({streams:analysis}));
  const catalog=Buffer.from(JSON.stringify({Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{CodeWalkerCoreSHA256:core},Vehicles:[{ModelHash:'f9300cc5',Model:'authored_model10',Sounds:{EngineAccel:{ParserType:'Dat54GranularSound',ChannelLinks:links}}}]})),catalogFile=path.join(folder,'catalog.json');fs.writeFileSync(catalogFile,catalog);
  const assets=loadStockCatalogAssets(manifest),registry=loadInstalledStockRegistry({catalogFile,catalogSha256:createHash('sha256').update(catalog).digest('hex'),assets});
  const reference=registry.createSource(0xf9300cc5,'player');assert.equal(registry.preparationDiagnostics10().banks,0);
  const plan=registry.prepareSource10(0xf9300cc5,'player');assert.equal(plan.sourceFramesAdvanced,0);assert.equal(registry.prepareSource10(0xf9300cc5,'player'),plan);assert.equal(registry.preparationDiagnostics10().banks,1);
  const prepared=registry.createSource(0xf9300cc5,'player');assert.equal(prepared.frame,0);assert.equal(reference.frame,0);
  const a=[new Float32Array(512),new Float32Array(512)],b=[new Float32Array(512),new Float32Array(512)],control={operatingPoint:.5,load:.9,running:true};
  for(let block=0;block<16;block++){reference.renderInto(control,...a);prepared.renderInto(control,...b);assert.deepEqual(b,a);}
  const gameplay=new StockGameplay({registry,session:budgetSession042});
  try{
   assert.equal(gameplay.prepareStartupVoices01([{model:0xf9300cc5,context:'player'}]),1);
   const ready=gameplay.startupVoices01.get(0xf9300cc5+':player'),untouched=registry.createSource(0xf9300cc5,'player');
   assert.equal(gameplay.pipeline.renderer.frame,0);
   assert.equal(ready.frame,0);
   assert.equal(ready.stats.frames,0);
   untouched.renderInto(control,...a);ready.renderInto(control,...b);
   assert.deepEqual(b,a);
  }finally{gameplay.close();}
  assert.throws(()=>registry.prepareSource10(0,'player'),/unavailable/);
 }finally{const resolved=path.resolve(folder);assert(resolved.startsWith(path.resolve(root)+path.sep));fs.rmSync(resolved,{recursive:true});}
});
test('prepared data does not create a source before late genuine eligibility and preserves retirement/reacquisition PCM',async()=>{
 const bank=originalSourceBank05(),plan=prepareStockSource10(bank),engines=[];
 for(const prepared of [false,true]){
  const creations=[];let wall=0;
  const registry={resolve:()=>({status:'available',bank}),createSource:(model,context,options)=>{const source=new StockVehicleSource(bank,{...options,...(prepared?{preparation10:plan}:{})});creations.push({source,frameAtCreation:source.frame,wall});return source;}};
  const instance=new StockGameplay({registry,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01'});
  instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
  engines.push({instance,creations,setWall:value=>{wall=value;}});
 }
 try{
  let sequence=1,next=.05;
  for(let block=0;block<144;block++){
   const time=block*512/48000;
   for(const e of engines)e.setWall(time*1000);
   if(time+1e-10>=next){const frame=budgetFrame042(sequence++,next);if(next<.25||next>=.7&&next<.95)frame.vehicles=[];if(next>=.95)frame.vehicles[0].generation=2;
    for(const e of engines)e.instance.accept(frame,Math.max(0,(time-next)*1000),200);next+=.05;}
   for(const e of engines)await e.instance.render();
   assert.deepEqual(engines[1].instance.left,engines[0].instance.left);assert.deepEqual(engines[1].instance.right,engines[0].instance.right);
   for(const id of engines[0].instance.ids)assert.deepEqual(engines[1].instance.inputs[id],engines[0].instance.inputs[id]);
   if(time<.25)assert.equal(engines[1].creations.length,0);
  }
  assert.equal(engines[1].creations.length,2);assert.equal(engines[0].creations.length,2);
  assert(engines[1].creations.every(c=>c.frameAtCreation===0));assert.equal(engines[1].creations[0].wall,engines[0].creations[0].wall);
  assert.equal(engines[1].instance.diagnostics().pipeline.history.affectedFrames,0);
 }finally{for(const e of engines)await e.instance.close();}
});
