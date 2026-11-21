import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as current from '../src/acoustics/vehicle/stock-source.mjs';
import {coldHistorySnapshot01,inspectColdSource01,firstColdHistoryDifference01} from '../tools/cold-npc-history01.mjs';

// Compare against exact PR91 Git source, including its dependency closure.
// This is original authored PCM only; no manifest, installed asset or endpoint.
const root=fileURLToPath(new URL('../',import.meta.url));
const parentCommit12='3d0642df9588aa46721efd85712fd2ba07446345';
const parentRoot=path.join(root,'.local','world12-synthesis-parent-'+parentCommit12);
fs.mkdirSync(parentRoot,{recursive:true});
const bindings={};
for(const file of ['stock-source.mjs','stock-grain.mjs','stock-events.mjs','stock-source-preparation10.mjs','source-preparation-budget10.mjs']){
 const sourcePath='src/acoustics/vehicle/'+file;
 const bytes=execFileSync('git',['show',parentCommit12+':'+sourcePath],{cwd:root,windowsHide:true});
 fs.writeFileSync(path.join(parentRoot,file),bytes);
 bindings[sourcePath]=createHash('sha256').update(bytes).digest('hex');
}
fs.writeFileSync(path.join(parentRoot,'bindings.json'),JSON.stringify({parentCommit12,bindings},null,2)+'\n');
const parent=await import(pathToFileURL(path.join(parentRoot,'stock-source.mjs')));
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);

function authoredBank12({rate=24000,texture=true,npc=false,events=false}={}){
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
function voiceHistory12(source){
 const result={};
 for(const role of ['engine','exhaust'])for(const mode of source.modes){
  const voice=source.voices[role][mode];
  result[role+':'+mode]=Object.fromEntries(Object.entries(voice));
 }
 return result;
}
function compare12(config){
 const bank=authoredBank12(config),options={sourceGain:1.17,pressureSharesByState:{idle:{engine:.6,exhaust:.4},load:{engine:.43,exhaust:.57},lift:{engine:.48,exhaust:.52}}};
 if(config.events){
  const variants=Array.from({length:4},(_,v)=>({frames:128,sampleRate:24000,samples:Float32Array.from({length:128},(_,i)=>.02*Math.sin(i*(.11+v*.03)))}));
  options.exhaustEvents={assets:{model:'prototipo',variants},triggers:[{atFrame:7,variant:0,basis:'authored-offline-lift'},{atFrame:1100,variant:3,basis:'authored-offline-lift'}]};
 }
 // Observe the original cold NPC case without invoking any advancing read.
 // Only a failed original assertion writes a diagnostic; its error is rethrown.
 const diagnose=config.npc===true&&config.texture===false&&config.prepared===false;
 const inputs=diagnose?coldHistorySnapshot01({bank,options}):null,constructors=[];
 let diagnosticStage='constructor',diagnosticBlock=null,diagnosticFrames=null,diagnosticControl=null,beforeRender=null,outputs;
 const sources=[];
 try{
 for(const module of [parent,current]){
  const source=new module.StockVehicleSource(bank,{...options,...(config.prepared?{preparation10:module.prepareStockSource10(bank)}:{})});
  sources.push(source);if(diagnose)constructors.push(inspectColdSource01(source));
 }
 outputs=sources.map(()=>[new Float32Array(512),new Float32Array(512)]);
 const before=Object.values(bank.layers).flatMap(modes=>Object.values(modes)).map(asset=>Buffer.from(bytes(asset.samples)));
 diagnosticStage='zero-frame-construction';
 assert(sources.every(source=>source.frame===0&&source.stats.frames===0));
 const sizes=[1,7,127,512,511,3,512,512,31,512,256,512,512,512,512,512];
 for(const [block,frames] of sizes.entries()){
  const control={operatingPoint:block<4?.2:block<9?.78:.035,load:block<5?.9:.04,lift:block>=5,running:block<12};
  diagnosticBlock=block;diagnosticFrames=frames;diagnosticControl=control;diagnosticStage='before-render';
  if(diagnose)beforeRender=sources.map(inspectColdSource01);
  diagnosticStage='render';
  for(let s=0;s<2;s++){outputs[s][0].fill(.97);outputs[s][1].fill(-.97);sources[s].renderInto(control,...outputs[s],frames);}
  diagnosticStage='exact-PCM-and-suffix';
  for(let role=0;role<2;role++)assert(bytes(outputs[1][role]).equals(bytes(outputs[0][role])),'bit-exact PCM and untouched buffer suffix, block '+block);
  diagnosticStage='exact-source-state';
  for(const key of ['frame','envelope','position','weights','stats','previous','commonRates'])assert.deepEqual(sources[1][key],sources[0][key],key+' at block '+block);
  diagnosticStage='exact-grain-history';
  assert.deepEqual(voiceHistory12(sources[1]),voiceHistory12(sources[0]),'grain history at block '+block);
 }
 diagnosticStage='immutable-input-PCM';
 Object.values(bank.layers).flatMap(modes=>Object.values(modes)).forEach((asset,i)=>assert(bytes(asset.samples).equals(before[i]),'source PCM remains untouched'));
 diagnosticStage='exact-event-state';
 assert.deepEqual(sources[1].events?.stats,sources[0].events?.stats);
 return sources;
 }catch(error){
  if(diagnose){
   try{
    const failureState=sources.map(inspectColdSource01),inputNow=coldHistorySnapshot01({bank,options});
    const report={schema:1,kind:'RichAudioColdNpcOriginalAssertionFailure01',parentCommit12,node:process.version,execArgv:process.execArgv,config,
     stage:diagnosticStage,block:diagnosticBlock,frames:diagnosticFrames,control:diagnosticControl,assertion:{name:error.name,message:error.message,code:error.code,operator:error.operator},
     outputBuffers:outputs?.map(roles=>roles.map(buffer=>coldHistorySnapshot01(buffer))),
     inputs,inputsAtFailure:inputNow,inputFirstDifference:firstColdHistoryDifference01(inputs,inputNow),constructors,beforeRender,failureState,
     constructorFirstDifference:constructors.length===2?firstColdHistoryDifference01(constructors[0],constructors[1]):null,
     beforeRenderFirstDifference:beforeRender?.length===2?firstColdHistoryDifference01(beforeRender[0],beforeRender[1]):null,
     failureFirstDifference:failureState.length===2?firstColdHistoryDifference01(failureState[0],failureState[1]):null,
     sourceBindings:{parent:bindings,current:Object.fromEntries(Object.keys(bindings).map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))},
     historicalAssertionsChanged:false,assertionRethrown:true,observerAdvancesSource:false,installedResourcesRead:false};
    const serialized=JSON.stringify(report,null,2)+'\n';
    if(Buffer.byteLength(serialized)>4*1024*1024)throw new Error('cold NPC diagnostic exceeds bounded 4MiB original-only payload');
    fs.mkdirSync(path.join(root,'.local','street01'),{recursive:true});
    const directory=fs.mkdtempSync(path.join(root,'.local','street01','cold-npc-failure-'));
    fs.writeFileSync(path.join(directory,'first-divergence.json'),serialized,{flag:'wx'});
    console.error('Retained cold NPC first-divergence diagnostic: '+path.relative(root,directory));
   }catch(diagnosticError){console.error('Cold NPC diagnostic could not be retained: '+diagnosticError.message);}
  }
  throw error;
 }
}

for(const npc of [false,true])for(const texture of [false,true])for(const prepared of [false,true]){
 test(`parent source remains bit exact: ${npc?'NPC':'player'}, ${texture?'texture':'long loop'}, ${prepared?'prepared':'cold'}`,()=>compare12({npc,texture,prepared}));
}
for(const rate of [32000,48000])test(`parent prepared textured source remains bit exact at ${rate} Hz`,()=>compare12({rate,prepared:true}));
test('parent finite exhaust events retain exact gain, sample clock, transitions and PCM',()=>compare12({events:true,prepared:true}));

test('source guards retain malformed controls, output alias and original PCM rejection',()=>{
 const bank=authoredBank12({texture:false}),a=new Float32Array(512),b=new Float32Array(512),valid={operatingPoint:.5,load:.9,running:true};
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
function searchAsset12({count=24,fragmented=false,gaps=false,sparse=false}={}){
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
const snapshot12=voice=>Object.fromEntries(Object.entries(voice));
const outcome12=fn=>{try{return {value:fn()};}catch(error){return {error:{name:error.name,message:error.message}};}};

for(const config of [{},{fragmented:true},{gaps:true},{sparse:true},{count:2},{count:1}]){
 for(const sameVoice of [false,true])test(`parent grain search keeps complete history: ${JSON.stringify(config)}, ${sameVoice?'self splice':'registration'}`,()=>{
  const asset=searchAsset12(config),pairs=[parent,current].map(module=>{
   const voice=new module.StockGrainVoice(asset),reference=sameVoice?voice:new module.StockGrainVoice(asset);
   voice.state=.5;reference.state=.4;
   return {voice,reference,plan:voice.pool(voice.pair(.5))};
  });
  for(const q of [Math.floor(config.count??24)/2+.23,(config.count??24)-.12]){
   const results=pairs.map(({voice,reference,plan})=>outcome12(()=>voice.matchHead({voice:reference,q},plan)));
   assert.deepEqual(results[1],results[0],'same selected phase/correlation or finite-continuation rejection');
   for(const name of ['voice','reference'])assert.deepEqual(snapshot12(pairs[1][name]),snapshot12(pairs[0][name]),name+' full search state');
  }
 });
}

test('parent interpolation retains exact values, statistics and failure mutation at every boundary',()=>{
 const asset=searchAsset12(),voices=[parent,current].map(module=>new module.StockGrainVoice(asset));
 for(const position of [0,Number.EPSILON,.5,127,127.5,128,asset.frames-1.5,asset.frames-1,asset.frames-Number.EPSILON,
  -.001,asset.frames,Infinity,NaN]){
  const results=voices.map(voice=>outcome12(()=>voice.read(position)));
  assert.deepEqual(results[1],results[0],'read at '+position);
  assert.deepEqual(snapshot12(voices[1]),snapshot12(voices[0]),'full reader state at '+position);
 }
});

test('parent first activation, long-held grains and stop/restart keep PCM and all voice state',()=>{
 const bank=authoredBank12({texture:true}),sources=[parent,current].map(module=>new module.StockVehicleSource(bank,{preparation10:module.prepareStockSource10(bank)}));
 const outputs=sources.map(()=>[new Float32Array(512),new Float32Array(512)]);
 for(let block=0;block<64;block++){
  const control={operatingPoint:block<18?.7:block<32?.02:block<48?.8:.15,load:block<32?.9:.05,lift:block>=32,running:block<40||block>=48};
  sources.forEach((source,i)=>source.renderInto(control,...outputs[i]));
  assert.deepEqual(outputs[1],outputs[0],'exact source PCM at block '+block);
  assert.deepEqual(voiceHistory12(sources[1]),voiceHistory12(sources[0]),'full voice state at block '+block);
  for(const key of ['frame','envelope','position','weights','stats','previous','commonRates'])assert.deepEqual(sources[1][key],sources[0][key],key+' at block '+block);
 }
 assert(sources[1].stats.transitions.phaseAlignments>0);
 assert(Object.values(sources[1].voices).some(modes=>Object.values(modes).some(voice=>voice.stats.texture.splices>0)));
});
