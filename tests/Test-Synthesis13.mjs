import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as current from '../src/acoustics/vehicle/stock-source.mjs';

// Compare against exact PR92 Git source, including its dependency closure.
// This is original authored PCM only; no manifest, installed asset or endpoint.
const root=fileURLToPath(new URL('../',import.meta.url));
const parentCommit13='85646ec65f2f88f0eb935374a79260a75e96b728';
const parentRoot=path.join(root,'.local','world13-synthesis-parent-'+parentCommit13);
fs.mkdirSync(parentRoot,{recursive:true});
const bindings={};
for(const file of ['stock-source.mjs','stock-grain.mjs','stock-events.mjs','stock-source-preparation10.mjs','source-preparation-budget10.mjs']){
 const sourcePath='src/acoustics/vehicle/'+file;
 const bytes=execFileSync('git',['show',parentCommit13+':'+sourcePath],{cwd:root,windowsHide:true});
 fs.writeFileSync(path.join(parentRoot,file),bytes);
 bindings[sourcePath]=createHash('sha256').update(bytes).digest('hex');
}
fs.writeFileSync(path.join(parentRoot,'bindings.json'),JSON.stringify({parentCommit13,bindings},null,2)+'\n');
const parent=await import(pathToFileURL(path.join(parentRoot,'stock-source.mjs')));
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const completeState13=value=>{
 if(value===null||typeof value!=='object'||ArrayBuffer.isView(value))return value;
 if(value instanceof Set)return new Set([...value].map(completeState13));
 if(value instanceof Map)return new Map([...value].map(([k,v])=>[completeState13(k),completeState13(v)]));
 return Array.isArray(value)?value.map(completeState13):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,completeState13(v)]));
};

function authoredBank13({rate=24000,texture=true,npc=false,events=false}={}){
 const bank={model:events?'prototipo':'bati',...(npc?{audioContext:'npc'}:{}),layers:{}};
 for(const [r,role] of ['engine','exhaust'].entries()){
  bank.layers[role]={};
  for(const [m,mode] of ['idle','accel','decel'].entries()){
   let cursor=0;
   const intervals=Array.from({length:32},(_,i)=>{const startFrame=cursor;cursor+=256+4*m+2*r+(i%3-1)*8;return {startFrame,endFrame:cursor};});
   const frames=cursor,samples=Float32Array.from({length:frames},(_,i)=>.035*Math.sin(i*.113+r*.23+m*.17)+.018*Math.cos(i*.031+r*.07+m*.11));
   const asset={frames,sampleRate:rate,samples,nativePeak:.053};
   if(texture){
    asset.intervals=intervals;
    asset.sustain={state:mode,intervals:intervals.map((span,i)=>({index:i,...span,rms:.028,crestDb:3,detailRatio:.08,transientRisk:false,bandFractions:{low:.3,mid:.5,high:.2}}))};
   }
   bank.layers[role][mode]=asset;
  }
 }
 return bank;
}
function voiceHistory13(source){
 const result={};
 for(const role of ['engine','exhaust'])for(const mode of source.modes){
  const voice=source.voices[role][mode];
  result[role+':'+mode]=Object.fromEntries(Object.entries(voice));
 }
 return result;
}
function compare13(config){
 const bank=authoredBank13(config),options={sourceGain:1.17,pressureSharesByState:{idle:{engine:.6,exhaust:.4},load:{engine:.43,exhaust:.57},lift:{engine:.48,exhaust:.52}}};
 if(config.events){
  const variants=Array.from({length:4},(_,v)=>({frames:128,sampleRate:24000,samples:Float32Array.from({length:128},(_,i)=>.02*Math.sin(i*(.11+v*.03)))}));
  options.exhaustEvents={assets:{model:'prototipo',variants},triggers:[{atFrame:7,variant:0,basis:'authored-offline-lift'},{atFrame:1100,variant:3,basis:'authored-offline-lift'}]};
 }
 const sources=[parent,current].map(module=>new module.StockVehicleSource(bank,{...options,...(config.prepared?{preparation10:module.prepareStockSource10(bank)}:{})}));
 const outputs=sources.map(()=>[new Float32Array(512),new Float32Array(512)]),before=Object.values(bank.layers).flatMap(modes=>Object.values(modes)).map(asset=>Buffer.from(bytes(asset.samples)));
 assert(sources.every(source=>source.frame===0&&source.stats.frames===0));
 const sizes=[1,7,127,512,511,3,512,512,31,512,256,512,512,512,512,512];
 for(const [block,frames] of sizes.entries()){
  const control={operatingPoint:block<4?.2:block<9?.78:.035,load:block<5?.9:.04,lift:block>=5,running:block<12};
  for(let s=0;s<2;s++){outputs[s][0].fill(.97);outputs[s][1].fill(-.97);sources[s].renderInto(control,...outputs[s],frames);}
  for(let role=0;role<2;role++)assert(bytes(outputs[1][role]).equals(bytes(outputs[0][role])),'bit-exact PCM and untouched buffer suffix, block '+block);
  for(const key of ['frame','envelope','position','weights','stats','previous','commonRates'])assert.deepEqual(sources[1][key],sources[0][key],key+' at block '+block);
  assert.deepEqual(voiceHistory13(sources[1]),voiceHistory13(sources[0]),'grain history at block '+block);
  assert.deepEqual(completeState13(sources[1]),completeState13(sources[0]),'complete source/event/grain state at block '+block);
 }
 Object.values(bank.layers).flatMap(modes=>Object.values(modes)).forEach((asset,i)=>assert(bytes(asset.samples).equals(before[i]),'source PCM remains untouched'));
 assert.deepEqual(sources[1].events?.stats,sources[0].events?.stats);
 return sources;
}

for(const npc of [false,true])for(const texture of [false,true])for(const prepared of [false,true]){
 test(`parent source remains bit exact: ${npc?'NPC':'player'}, ${texture?'texture':'long loop'}, ${prepared?'prepared':'cold'}`,()=>compare13({npc,texture,prepared}));
}
for(const rate of [32000,48000])test(`parent prepared textured source remains bit exact at ${rate} Hz`,()=>compare13({rate,prepared:true}));
test('parent finite exhaust events retain exact gain, sample clock, transitions and PCM',()=>compare13({events:true,prepared:true}));

test('source guards retain malformed controls, output alias and original PCM rejection',()=>{
 const bank=authoredBank13({texture:false}),a=new Float32Array(512),b=new Float32Array(512),valid={operatingPoint:.5,load:.9,running:true};
 for(const module of [parent,current]){
  const source=new module.StockVehicleSource(bank);
  for(const control of [{...valid,operatingPoint:NaN},{...valid,load:2},{...valid,running:1},{...valid,lift:1}])assert.throws(()=>source.renderInto(control,a,b),/operating state/);
  assert.throws(()=>source.renderInto(valid,a,a),/must not alias/);
  assert.throws(()=>source.renderInto(valid,bank.layers.engine.idle.samples,b,512),/overwrite verified PCM/);
  assert.throws(()=>source.renderInto(valid,a,b,513),/caller-owned/);
  assert.equal(source.frame,0);
 }
});

// Exercise the changed search directly: cross-voice registration, later
// same-voice splices, finite horizons, fragmented pools and sparse support.
// Each snapshot includes every enumerable field, not only selected counters.
function searchAsset13({count=24,fragmented=false,gaps=false,sparse=false}={}){
 let cursor=0;
 const intervals=Array.from({length:count},(_,i)=>{
  const startFrame=cursor;cursor+=128+(i%3)*4;
  const endFrame=cursor;if(gaps&&i%7===6)cursor+=16;
  return {startFrame,endFrame};
 });
 const samples=Float32Array.from({length:cursor},(_,i)=>.08*Math.sin(i*.113)+.02*Math.cos(i*.031));
 return {frames:cursor,sampleRate:24000,samples,intervals,
  sustain:{state:'idle',intervals:intervals.map((span,i)=>({index:i,...span,rms:.05,crestDb:4,detailRatio:.1,
   transientRisk:sparse?i!==Math.floor(count/2):fragmented&&i%7===6,bandFractions:{low:.3,mid:.5,high:.2}}))}};
}
const snapshot13=voice=>Object.fromEntries(Object.entries(voice));
const outcome13=fn=>{try{return {value:fn()};}catch(error){return {error:{name:error.name,message:error.message}};}};

for(const config of [{},{fragmented:true},{gaps:true},{sparse:true},{count:2},{count:1}]){
 for(const sameVoice of [false,true])test(`parent grain search keeps complete history: ${JSON.stringify(config)}, ${sameVoice?'self splice':'registration'}`,()=>{
  const asset=searchAsset13(config),pairs=[parent,current].map(module=>{
   const voice=new module.StockGrainVoice(asset),reference=sameVoice?voice:new module.StockGrainVoice(asset);
   voice.state=.5;reference.state=.4;
   return {voice,reference,plan:voice.pool(voice.pair(.5))};
  });
  for(const q of [Math.floor(config.count??24)/2+.23,(config.count??24)-.12]){
   const results=pairs.map(({voice,reference,plan})=>outcome13(()=>voice.matchHead({voice:reference,q},plan)));
   assert.deepEqual(results[1],results[0],'same selected phase/correlation or finite-continuation rejection');
   for(const name of ['voice','reference'])assert.deepEqual(snapshot13(pairs[1][name]),snapshot13(pairs[0][name]),name+' full search state');
  }
 });
}

test('parent interpolation retains exact values, statistics and failure mutation at every boundary',()=>{
 const asset=searchAsset13(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset));
 for(const position of [0,Number.EPSILON,.5,127,127.5,128,asset.frames-1.5,asset.frames-1,asset.frames-Number.EPSILON,
  -.001,asset.frames,Infinity,NaN]){
  const results=voices.map(voice=>outcome13(()=>voice.read(position)));
  assert.deepEqual(results[1],results[0],'read at '+position);
  assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]),'full reader state at '+position);
 }
});

test('parent rate-only lookups retain exact pair arithmetic without changing state',()=>{
 for(const config of [{},{fragmented:true},{gaps:true},{sparse:true},{count:2},{count:1}]){
  const asset=searchAsset13(config),voices=[parent,current].map(module=>new module.StockGrainVoice(asset));
  const positions=[-Infinity,-1,-Number.EPSILON,0,Number.EPSILON,.5,1-Number.EPSILON,1,2,Infinity,NaN];
  for(const span of voices[0].intervals)for(const frame of [span.start,span.centre,span.end]){
   const u=frame/(asset.frames-1);positions.push(u-Number.EPSILON,u,u+Number.EPSILON);
  }
  for(let i=0;i<=1024;i++)positions.push(i/1024);
  for(const u of positions){
   const results=voices.map(voice=>outcome13(()=>voice.rateAt(u)));
   assert.deepEqual(results[1],results[0],'rate at '+u);
   assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]),'full state at '+u);
  }
 }
});

test('parent scorer retains partial read-stat mutation when a candidate leaves original PCM',()=>{
 const asset=searchAsset13(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset));
 const references=[parent,current].map(module=>new module.StockGrainVoice(asset));
 const plans=voices.map(voice=>voice.pool(voice.pair(.5)));
 voices.forEach(voice=>{voice.state=.5;voice.intervals[0].start=100;voice.intervals[0].length=-128;});
 // A short allowed pool forces a probe into the corrupted interval after the
 // reference target has already performed its genuine ordered reads.
 plans.forEach(plan=>{plan.allowed=new Set([0,1]);plan.runs=[[0,1]];});
 const results=voices.map((voice,i)=>outcome13(()=>voice.matchHead({voice:references[i],q:10.23},plans[i])));
 assert.deepEqual(results[1],results[0]);assert(results[0].error);
 assert(voices[0].stats.reads>0&&voices[0].stats.sourceBoundViolations===1,'failure follows successful score reads');
 assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]),'all partial failure mutations');
 assert.deepEqual(snapshot13(references[1]),snapshot13(references[0]),'reference target read history');
});

for(const method of ['read','sampleHead','available','random'])test(`parent scorer preserves overridden ${method} calls and read-stat observations`,()=>{
 const asset=searchAsset13(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset));
 const observations=[[],[]],plans=voices.map(voice=>voice.pool(voice.pair(.5)));
 voices.forEach((voice,i)=>{voice.state=.5;const original=voice[method];
  voice[method]=function(...args){observations[i].push([this.stats.reads,this.stats.minimumReadFrame,this.stats.maximumReadFrame]);return original.apply(this,args);};
 });
 const results=voices.map((voice,i)=>outcome13(()=>voice.matchHead({voice,q:10.23},plans[i])));
 assert.deepEqual(results[1],results[0]);assert.deepEqual(observations[1],observations[0],'every overridden call sees original read statistics');
 for(const voice of voices)delete voice[method];
 assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]),'all final reader state');
});

test('parent scorer preserves a prototype read override and its observations',()=>{
 const asset=searchAsset13(),modules=[parent,current],voices=modules.map(module=>new module.StockGrainVoice(asset));
 const observations=[[],[]],plans=voices.map(voice=>voice.pool(voice.pair(.5))),originals=modules.map(module=>module.StockGrainVoice.prototype.read);
 try{
  modules.forEach((module,i)=>{module.StockGrainVoice.prototype.read=function(...args){observations[i].push(this.stats.reads);return originals[i].apply(this,args);};});
  const results=voices.map((voice,i)=>outcome13(()=>voice.matchHead({voice,q:10.23},plans[i])));
  assert.deepEqual(results[1],results[0]);assert.deepEqual(observations[1],observations[0]);
  assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]));
 }finally{modules.forEach((module,i)=>{module.StockGrainVoice.prototype.read=originals[i];});}
});

for(const kind of ['stats-proxy','stats-accessor','read-count-accessor'])test(`parent scorer preserves reflective ${kind} observations`,()=>{
 const asset=searchAsset13(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset)),observations=['',''];
 const plans=voices.map(voice=>voice.pool(voice.pair(.5)));
 voices.forEach((voice,i)=>{
  const stats=voice.stats;
  if(kind==='stats-proxy')voice.stats=new Proxy(stats,{
   get(target,key,receiver){if(typeof target[key]==='number')observations[i]+='g'+key+':'+target[key]+';';return Reflect.get(target,key,receiver);},
   set(target,key,value,receiver){observations[i]+='s'+key+':'+value+';';return Reflect.set(target,key,value,receiver);}
  });
  else if(kind==='stats-accessor')Object.defineProperty(voice,'stats',{configurable:true,enumerable:true,get(){observations[i]+='stats;';return stats;}});
  else{let reads=stats.reads;Object.defineProperty(stats,'reads',{configurable:true,enumerable:true,get(){observations[i]+='g'+reads+';';return reads;},set(value){observations[i]+='s'+value+';';reads=value;}});}
 });
 const results=voices.map((voice,i)=>outcome13(()=>voice.matchHead({voice,q:10.23},plans[i])));
 assert.deepEqual(results[1],results[0]);assert.equal(observations[1],observations[0],'every getter/setter observation remains ordered');
 assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]));
});

for(const kind of ['stat-coercion','sample-accessor','interval-accessor','interval-proxy'])test(`parent scorer preserves customized ${kind} observations`,()=>{
 const asset=searchAsset13(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset)),references=[parent,current].map(module=>new module.StockGrainVoice(asset));
 const observations=['',''],plans=voices.map(voice=>voice.pool(voice.pair(.5)));
 voices.forEach((voice,i)=>{
  if(kind==='stat-coercion')voice.stats.minimumReadFrame={valueOf(){observations[i]+='coerce:'+voice.stats.reads+';';return Infinity;}};
  else if(kind==='sample-accessor'){const samples=voice.samples;Object.defineProperty(voice,'samples',{configurable:true,enumerable:true,get(){observations[i]+='samples:'+voice.stats.reads+';';return samples;}});}
  else if(kind==='interval-accessor')for(const interval of voice.intervals){const start=interval.start;Object.defineProperty(interval,'start',{configurable:true,enumerable:true,get(){observations[i]+='start:'+voice.stats.reads+';';return start;}});}
  else voice.intervals=new Proxy(voice.intervals,{get(target,key,receiver){observations[i]+='interval:'+String(key)+':'+voice.stats.reads+';';return Reflect.get(target,key,receiver);}});
 });
 const results=voices.map((voice,i)=>outcome13(()=>voice.matchHead({voice:references[i],q:10.23},plans[i])));
 assert.deepEqual(results[1],results[0]);assert.equal(observations[1],observations[0],'every custom coercion/getter remains ordered');
 assert.deepEqual(snapshot13(voices[1]),snapshot13(voices[0]));
});

test('parent first activation, long-held grains and stop/restart keep PCM and all voice state',()=>{
 const bank=authoredBank13({texture:true}),sources=[parent,current].map(module=>new module.StockVehicleSource(bank,{preparation10:module.prepareStockSource10(bank)}));
 const outputs=sources.map(()=>[new Float32Array(512),new Float32Array(512)]);
 for(let block=0;block<64;block++){
  const control={operatingPoint:block<18?.7:block<32?.02:block<48?.8:.15,load:block<32?.9:.05,lift:block>=32,running:block<40||block>=48};
  sources.forEach((source,i)=>source.renderInto(control,...outputs[i]));
  assert.deepEqual(outputs[1],outputs[0],'exact source PCM at block '+block);
  assert.deepEqual(voiceHistory13(sources[1]),voiceHistory13(sources[0]),'full voice state at block '+block);
  for(const key of ['frame','envelope','position','weights','stats','previous','commonRates'])assert.deepEqual(sources[1][key],sources[0][key],key+' at block '+block);
  assert.deepEqual(completeState13(sources[1]),completeState13(sources[0]),'complete lifecycle state at block '+block);
 }
 assert(sources[1].stats.transitions.phaseAlignments>0);
 assert(Object.values(sources[1].voices).some(modes=>Object.values(modes).some(voice=>voice.stats.texture.splices>0)));
});
