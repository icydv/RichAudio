import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as current from '../src/acoustics/vehicle/stock-source.mjs';

// Compare against exact parent Git source, including its dependency closure.
// This is original authored PCM only; no manifest, installed asset or endpoint.
const root=fileURLToPath(new URL('../',import.meta.url));
const parentCommit11='f612bfc5f9f8ecce5565cb9853b1aacfe8179cba';
const parentRoot=path.join(root,'.local','world11-synthesis-parent-'+parentCommit11);
fs.mkdirSync(parentRoot,{recursive:true});
const bindings={};
for(const file of ['stock-source.mjs','stock-grain.mjs','stock-events.mjs','stock-source-preparation10.mjs','source-preparation-budget10.mjs']){
 const sourcePath='src/acoustics/vehicle/'+file;
 const bytes=execFileSync('git',['show',parentCommit11+':'+sourcePath],{cwd:root,windowsHide:true});
 fs.writeFileSync(path.join(parentRoot,file),bytes);
 bindings[sourcePath]=createHash('sha256').update(bytes).digest('hex');
}
fs.writeFileSync(path.join(parentRoot,'bindings.json'),JSON.stringify({parentCommit11,bindings},null,2)+'\n');
const parent=await import(pathToFileURL(path.join(parentRoot,'stock-source.mjs')));
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);

function authoredBank11({rate=24000,texture=true,npc=false,events=false}={}){
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
function voiceHistory11(source){
 const result={};
 for(const role of ['engine','exhaust'])for(const mode of source.modes){
  const voice=source.voices[role][mode];
  result[role+':'+mode]=Object.fromEntries(['phase','clockCycles','state','frame','previous','lastExpectedEnergy','expectedEnergy','outputEnergy',
   'maximumBoundaryStep','stats','textureOccupancy','textureSeed','head','join','texturePlan','lastPlanAnchor','lastPair','current','lastRate','pendingBoundary'].map(key=>[key,voice[key]]));
 }
 return result;
}
function compare11(config){
 const bank=authoredBank11(config),options={sourceGain:1.17,pressureSharesByState:{idle:{engine:.6,exhaust:.4},load:{engine:.43,exhaust:.57},lift:{engine:.48,exhaust:.52}}};
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
  assert.deepEqual(voiceHistory11(sources[1]),voiceHistory11(sources[0]),'grain history at block '+block);
 }
 Object.values(bank.layers).flatMap(modes=>Object.values(modes)).forEach((asset,i)=>assert(bytes(asset.samples).equals(before[i]),'source PCM remains untouched'));
 assert.deepEqual(sources[1].events?.stats,sources[0].events?.stats);
 return sources;
}

for(const npc of [false,true])for(const texture of [false,true])for(const prepared of [false,true]){
 test(`parent source remains bit exact: ${npc?'NPC':'player'}, ${texture?'texture':'long loop'}, ${prepared?'prepared':'cold'}`,()=>compare11({npc,texture,prepared}));
}
for(const rate of [32000,48000])test(`parent prepared textured source remains bit exact at ${rate} Hz`,()=>compare11({rate,prepared:true}));
test('parent finite exhaust events retain exact gain, sample clock, transitions and PCM',()=>compare11({events:true,prepared:true}));

test('source guards retain malformed controls, output alias and original PCM rejection',()=>{
 const bank=authoredBank11({texture:false}),a=new Float32Array(512),b=new Float32Array(512),valid={operatingPoint:.5,load:.9,running:true};
 for(const module of [parent,current]){
  const source=new module.StockVehicleSource(bank);
  for(const control of [{...valid,operatingPoint:NaN},{...valid,load:2},{...valid,running:1},{...valid,lift:1}])assert.throws(()=>source.renderInto(control,a,b),/operating state/);
  assert.throws(()=>source.renderInto(valid,a,a),/must not alias/);
  assert.throws(()=>source.renderInto(valid,bank.layers.engine.idle.samples,b,512),/overwrite verified PCM/);
  assert.throws(()=>source.renderInto(valid,a,b,513),/caller-owned/);
  assert.equal(source.frame,0);
 }
});
