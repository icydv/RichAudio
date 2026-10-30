import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
import {loadStockNpcAssets,loadStockCatalogAssets,StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {createStockVehiclePipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {createUrbanEnvironment} from '../src/acoustics/vehicle/urban-environment.mjs';
import {npcOperating,npcComparisonSeconds} from '../tools/world-vehicle-02-scenario.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const npcFile=process.env.RICHAUDIO_NPC_MANIFEST,reportFile=process.env.RICHAUDIO_STOCK_SOURCE05_REPORT,catalogFile=process.env.RICHAUDIO_INSTALLED_CATALOG;
const genuine=!!(npcFile&&reportFile&&catalogFile);
test('four-state phase clock retains analytical fundamentals and harmonics across rise/lift/idle at native24/32/48k',()=>{
 const dir=path.join(root,'.local','npc-clock-tests',randomUUID());fs.mkdirSync(dir,{recursive:true});
 try{for(const sampleRate of [24000,32000,48000]){
  const layers={},streams=[];
  for(const [role,hz]of [['engine',100],['exhaust',125]]){layers[role]={};for(const mode of ['idle','accel']){
   const frames=sampleRate,period=sampleRate/hz,bytes=Buffer.alloc(frames*4),file=role+'_'+mode+'.f32';
   for(let i=0;i<frames;i++)bytes.writeFloatLE(.2*Math.sin(2*Math.PI*hz*i/sampleRate)+.08*Math.sin(4*Math.PI*hz*i/sampleRate),i*4);
   fs.writeFileSync(path.join(dir,file),bytes);layers[role][mode]={file,frames,sampleRate,channels:1,sha256:sha(bytes),sourceFormat:{codec:0},granular:{grains:Array.from({length:hz+1},(_,i)=>({UnkUint1:i*period}))}};
  }}
  const file=path.join(dir,'manifest.json');fs.writeFileSync(file,JSON.stringify({schema:1,gameExecutableSha256:'0'.repeat(64),vehicles:[{model:'analytic_npc',audioContext:'npc',sourceContract:'npc-four-state-v1',layers,streams}]}));
  const source=new StockVehicleSource(loadStockNpcAssets(file).vehicles.get('analytic_npc')),out={engine:new Float32Array(192000),exhaust:new Float32Array(192000)},e=new Float32Array(512),x=new Float32Array(512);
  for(let at=0;at<192000;at+=512){const n=Math.min(512,192000-at);source.renderInto(npcOperating(at/48000),e,x,n);out.engine.set(e.subarray(0,n),at);out.exhaust.set(x.subarray(0,n),at);}
  for(const [role,hz]of [['engine',100],['exhaust',125]]){
   const y=out[role].subarray(48000),coeff=[];for(const order of [1,2]){let c=0,s=0;for(let i=0;i<y.length;i++){const angle=2*Math.PI*hz*order*(i+48000)/48000;c+=y[i]*Math.cos(angle);s+=y[i]*Math.sin(angle);}coeff.push([2*c/y.length,2*s/y.length]);}
   let error=0;for(let i=0;i<y.length;i++){let fit=0;for(let order=1;order<=2;order++){const angle=2*Math.PI*hz*order*(i+48000)/48000;fit+=coeff[order-1][0]*Math.cos(angle)+coeff[order-1][1]*Math.sin(angle);}error+=(y[i]-fit)**2;}
   assert.ok(Math.sqrt(error/y.length)<1e-4,role+' phase/harmonic fit tolerance');assert.ok(Math.abs(Math.hypot(...coeff[0])-.1)<1e-4);assert.ok(Math.abs(Math.hypot(...coeff[1])-.04)<1e-4);
  }
 }}finally{assert.ok(path.resolve(dir).startsWith(path.join(root,'.local','npc-clock-tests')+path.sep));fs.rmSync(dir,{recursive:true});}
});
test('genuine Bati four-state loading and exact context/stream/game/archive registry qualification',{skip:!genuine},()=>{
 const npcAssets=loadStockNpcAssets(npcFile),bank=npcAssets.vehicles.get('bati'),m=JSON.parse(fs.readFileSync(reportFile)),assets=loadStockCatalogAssets(m.inputs.manifestFile,{sustainAtlasFile:m.inputs.sustainAtlasFile});
 assert.deepEqual(Object.keys(bank.layers.engine),['idle','accel']);assert.deepEqual(Object.keys(bank.layers.exhaust),['idle','accel']);
 assert.ok(Object.values(bank.layers).flatMap(Object.values).every(a=>a.sampleRate===48000));assert.throws(()=>new StockVehicleSource({...bank}));
 assert.throws(()=>new StockVehicleSource(bank,{exhaustEvents:{}}),'NPC events require separate genuine evidence; no player-pop fallback');
 const bytes=fs.readFileSync(catalogFile),catalog=JSON.parse(bytes),c={...catalog,Vehicles:catalog.Vehicles.filter(v=>v.Model==='bati')};
 const dir=path.join(root,'.local','npc-tests',randomUUID());fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'catalog.json');
 function registry(mutate=()=>{},library=npcAssets){const data=structuredClone(c);mutate(data);const b=Buffer.from(JSON.stringify(data));fs.writeFileSync(file,b);return loadInstalledStockRegistry({catalogFile:file,catalogSha256:sha(b),assets,npcAssets:library});}
 try{
  const r=registry();assert.equal(r.resolve(0xf9300cc5,'npc').bank,bank);assert.equal(r.resolve(0xf9300cc5,'player').bank,assets.vehicles.get('bati'));
  assert.equal(r.createSource(0xf9300cc5,'npc').npc,true);
  const none=loadInstalledStockRegistry({catalogFile:file,catalogSha256:sha(fs.readFileSync(file)),assets});assert.equal(none.resolve(0xf9300cc5,'npc').status,'unavailable');
  for(const mutate of [v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].Candidates[0].SourceArchive='wrong.rpf',v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].AwcSHA256='0'.repeat(64),v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].Stream.Frames++,v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].Stream.Codec=4,v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].CandidateCount=2,v=>v.Sounds.EngineAccelNPC.ChannelLinks[2].State='missing',v=>v.Sounds.EngineAccelNPC.ChannelLinks[3].FullRelStreamHash='0x00000001',v=>v.Sounds.EngineAccelNPC.ChannelLinks[0].Index=4,v=>delete v.Sounds.EngineAccelNPC]){
   const q=registry(d=>mutate(d.Vehicles[0]));assert.equal(q.resolve(0xf9300cc5,'npc').status,'unavailable');assert.equal(q.resolve(0xf9300cc5,'player').status,'available');assert.throws(()=>q.createSource(0xf9300cc5,'npc'));
  }
  for(const key of ['GameExecutableSHA256','CodeWalkerCoreSHA256'])assert.throws(()=>registry(d=>d.InputBinding[key]='0'.repeat(64)));
  assert.throws(()=>registry(()=>{},{...npcAssets,vehicles:assets.vehicles}));
  const dup=registry(()=>{},{...npcAssets,vehicles:new Map([['a',bank],['b',bank]])});assert.equal(dup.resolve(0xf9300cc5,'npc').reason,'ambiguous-decoded-bank');
  const stream=bank.streams.find(s=>s.name==='engine_idle'),originalHash=stream.hash;
  try{stream.hash='179DDCAA';assert.throws(()=>registry());}finally{stream.hash=originalHash;}
  // Loader rejection uses copied private PCM; original decoded files remain immutable.
  const manifest=JSON.parse(fs.readFileSync(npcFile)),base=path.dirname(npcFile);
  for(const a of Object.values(manifest.vehicles[0].layers).flatMap(Object.values)){const dest=path.join(dir,a.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(base,a.file),dest);}
  const copy=path.join(dir,'manifest.json');for(const mutate of [v=>delete v.layers.engine.idle,v=>v.layers.exhaust.accel.sha256='0'.repeat(64),v=>v.layers.engine.decel=v.layers.engine.accel,v=>v.audioContext='player']){
   const d=structuredClone(manifest);mutate(d.vehicles[0]);fs.writeFileSync(copy,JSON.stringify(d));assert.throws(()=>loadStockNpcAssets(copy));
  }
 }finally{assert.ok(path.resolve(dir).startsWith(path.join(root,'.local','npc-tests')+path.sep));fs.rmSync(dir,{recursive:true});}
});
test('genuine NPC transitions preserve shared clocks, independent emitters and original histories through actual street renderer',{skip:!genuine},async()=>{
 const assets=loadStockNpcAssets(npcFile),bank=assets.vehicles.get('bati'),a=new StockVehicleSource(bank),b=new StockVehicleSource(bank),ids=['stock:bati:engine','stock:bati:exhaust'];
 const pipeline=createStockVehiclePipeline({scene:createUrbanEnvironment({duration:5,width:24}).scene,sourceIds:ids});
 const e=new Float32Array(512),x=new Float32Array(512),ee=new Float32Array(512),xx=new Float32Array(512),l=new Float32Array(512),r=new Float32Array(512);
 let peak=0,maxClockDelta=0,previous={engine:null,exhaust:null},separated=false;
 const total=Math.round(48000*npcComparisonSeconds);
 try{for(let at=0;at<total;at+=512){const n=Math.min(512,total-at),time=at/48000,control=npcOperating(time);
  a.renderInto(control,e,x,n);b.renderInto({...control,lift:!control.lift,load:1-control.load},ee,xx,n);
  assert.deepEqual(e.subarray(0,n),ee.subarray(0,n),'missing decel must follow documented state policy, not substitute material');assert.deepEqual(x.subarray(0,n),xx.subarray(0,n));
  separated ||= e.some((v,i)=>v!==x[i]);
  for(const role of ['engine','exhaust']){const clock=a.voices[role].accel.clockCycles+a.voices[role].accel.phase;if(previous[role]!==null)maxClockDelta=Math.max(maxClockDelta,clock-previous[role]);assert.ok(previous[role]===null||clock>=previous[role]);previous[role]=clock;}
  await pipeline.prepare({time,session:'npc-test',generation:1,listener:{position:[0,2,1.4],velocity:[0,0,0]},sources:[{id:ids[0],generation:1,position:[-10+4*time,0,.65],velocity:[4,0,0],forward:[1,0,0],up:[0,0,1]},{id:ids[1],generation:1,position:[-10.65+4*time,0,.3],velocity:[4,0,0],forward:[-1,0,0],up:[0,0,1]}]});
  pipeline.process({[ids[0]]:e,[ids[1]]:x},l,r,n);for(let i=0;i<n;i++){assert.ok(Number.isFinite(l[i])&&Number.isFinite(r[i]));peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));}
 }
 assert.ok(separated&&peak>0&&peak<.98&&maxClockDelta>0);assert.deepEqual(a.modes,['idle','accel']);assert.ok(a.weights[0]>.99);
 for(const voices of Object.values(a.voices))for(const voice of Object.values(voices))assert.equal(voice.stats.sourceBoundViolations,0);
 assert.ok(a.voices.engine.idle.stats.texture.uniqueIntervals>1);assert.ok(a.voices.engine.accel.stats.texture.uniqueIntervals>1);
 const d=pipeline.diagnostics();for(const k of ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'])assert.equal(d.renderer[k],0,k);assert.equal(d.history.affectedFrames,0);
 assert.deepEqual(pipeline.renderer.sourcePressureGains,{[ids[0]]:.25,[ids[1]]:2.5});
 }finally{pipeline.close();}
});
