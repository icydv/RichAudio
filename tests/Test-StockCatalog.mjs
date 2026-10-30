import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{createHash,randomUUID}from'node:crypto';import{fileURLToPath}from'node:url';
import{loadStockAssets,loadStockCatalogAssets,loadStockExhaustPops,StockVehicleSource}from'../src/acoustics/vehicle/stock-source.mjs';
import{source04DelayedFlybyOperating}from'../tools/Render-StockSource04.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),privateRoot=path.join(root,'.local','stock-catalog-tests');
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(models=['independent_custom_bank']){
 fs.mkdirSync(privateRoot,{recursive:true});const folder=path.join(privateRoot,randomUUID());fs.mkdirSync(folder);
 const frames=12000,rate=24000,bytes=Buffer.alloc(frames*4);for(let i=0;i<frames;i++)bytes.writeFloatLE(.2*Math.sin(2*Math.PI*100*i/rate),i*4);fs.writeFileSync(path.join(folder,'original.f32'),bytes);
 const candidateIntervals=Array.from({length:50},(_,i)=>({startFrame:i*240,endFrame:(i+1)*240})),streams=[];
 const vehicles=models.map(model=>({model,layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(state=>{
   const record={file:'original.f32',channels:1,sampleRate:rate,frames,sha256:digest(bytes),sourceFormat:{codec:0},granular:{grains:Array.from({length:51},(_,i)=>({UnkUint1:i*240}))}};
   streams.push({model,layer:role,state,file:record.file,frames,sampleRate:rate,candidateIntervals});return[state,record];}))]))}));
 const manifest={schema:1,vehicles},file=path.join(folder,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest));fs.writeFileSync(path.join(folder,'analysis-intervals.json'),JSON.stringify({streams}));
 return{folder,file,manifest,save(){fs.writeFileSync(file,JSON.stringify(manifest));},close(){const resolved=path.resolve(folder);assert.ok(resolved.startsWith(path.resolve(privateRoot)+path.sep));fs.rmSync(resolved,{recursive:true});}};
}
test('arbitrary verified catalogue identity uses its own bound PCM without four-bank substitution',()=>{
 const f=fixture(['installed_road_01','custom_bank_02']);try{
   const loaded=loadStockCatalogAssets(f.file);assert.deepEqual([...loaded.vehicles.keys()],['installed_road_01','custom_bank_02']);
   assert.throws(()=>loadStockAssets(f.file),'legacy audition loader stays strict');
   const bank=loaded.vehicles.get('custom_bank_02'),source=new StockVehicleSource(bank),e=new Float32Array(512),x=new Float32Array(512);
   source.renderInto({operatingPoint:.6,load:.9,running:true},e,x);assert.ok(e.some(v=>v!==0));assert.equal(source.vehicle.model,'custom_bank_02');assert.ok(Object.isFrozen(bank));
   assert.throws(()=>new StockVehicleSource({...bank}),'copying metadata cannot forge a verified model identity');assert.throws(()=>{bank.model='bati';});
   assert.throws(()=>new StockVehicleSource({...bank,model:'bati'}),'a known demo name cannot bypass decoded-bank registration');
 }finally{f.close();}
});
test('generic catalogue rejects missing states, corrupt hashes, duplicated names and unsupported source formats',()=>{
 for(const mutate of [m=>{delete m.vehicles[0].layers.exhaust.decel;},m=>m.vehicles[0].layers.engine.accel.sha256='0'.repeat(64),m=>m.vehicles.push(m.vehicles[0]),m=>m.vehicles[0].model='../other',m=>m.vehicles[0].layers.engine.idle.sourceFormat.codec=99]){
   const f=fixture();try{mutate(f.manifest);f.save();assert.throws(()=>loadStockCatalogAssets(f.file));}finally{f.close();}
 }
});
test('generic and strict loaders retain identical existing four-bank waveform behaviour',()=>{
 const f=fixture(['bati','lectro','prototipo','schafter3']);try{
   const a=loadStockAssets(f.file),b=loadStockCatalogAssets(f.file),control={operatingPoint:.65,load:.9,running:true};
   for(const model of a.vehicles.keys()){
     const old=new StockVehicleSource(a.vehicles.get(model)),general=new StockVehicleSource(b.vehicles.get(model)),oe=new Float32Array(512),ox=new Float32Array(512),ne=new Float32Array(512),nx=new Float32Array(512);
     assert.throws(()=>new StockVehicleSource({...a.vehicles.get(model),model:'bati'}),'copied decoded demo banks also require registration');
     for(let k=0;k<20;k++){old.renderInto(control,oe,ox);general.renderInto(control,ne,nx);assert.deepEqual(ne,oe);assert.deepEqual(nx,ox);}
   }
 }finally{f.close();}
});

test('genuine four-bank catalogue retains published full-event source PCM hashes at all native rates',
 {skip:!process.env.RICHAUDIO_STOCK_SOURCE05_REPORT},()=>{
 const report=JSON.parse(fs.readFileSync(process.env.RICHAUDIO_STOCK_SOURCE05_REPORT,'utf8'));
 assert.equal(report.status,'complete');
 const assets=loadStockCatalogAssets(report.inputs.manifestFile,{sustainAtlasFile:report.inputs.sustainAtlasFile}),
   pops=loadStockExhaustPops(report.inputs.popManifestFile),mix=JSON.parse(fs.readFileSync(report.inputs.mixFile,'utf8'));
 const rates=new Set();
 for(const [model,bank]of assets.vehicles){
   const expected=report.files.find(r=>r.model===model&&r.name==='road-baseline');assert.ok(expected);
   const source=new StockVehicleSource(bank,{sourceGain:mix.sourceGain,pressureSharesByState:mix.profiles[model].pressureSharesByState,
     ...(expected.eventPlan.length?{exhaustEvents:{assets:pops,triggers:expected.eventPlan}}:{})});
   const e=new Float32Array(512),x=new Float32Array(512),hash=createHash('sha256');
   for(let at=0;at<Math.round(10.3*48000);at+=512){const n=Math.min(512,Math.round(10.3*48000)-at);
     source.renderInto(source04DelayedFlybyOperating(at/48000),e,x,n);hash.update(Buffer.from(e.buffer,0,n*4));hash.update(Buffer.from(x.buffer,0,n*4));}
   assert.equal(hash.digest('hex'),expected.sourceHash,model+' full emitted source waveform changed');
   for(const role of ['engine','exhaust'])for(const mode of ['idle','accel','decel'])rates.add(bank.layers[role][mode].sampleRate);
 }
 assert.deepEqual([...rates].sort((a,b)=>a-b),[24000,32000,48000]);assert.equal(assets.vehicles.size,4);
});
