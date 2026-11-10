import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource,prepareStockSource10,loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {authoredStartupBank10} from '../src/acoustics/vehicle/stock-source-preparation10.mjs';
import {composeSceneUnion03} from '../src/acoustics/world/scene-union03.mjs';
import {budgetContexts042,budgetFrame042,budgetSession042,budgetWorld042} from './fixtures/AcousticBudget042.mjs';
import {writeOriginalGameplayPackageStreet01} from './fixtures/StreetGameplayPackage01.mjs';

const model=0xf9300cc5,other=0xa774b5a6,unknown=0x10100001;
const originalBank=authoredStartupBank10();
const secondBank={...authoredStartupBank10(),model:'lectro'};
const sources=()=>new Map([[model,originalBank],[other,secondBank]]);
function engine(fleet,Class=StockGameplay,Source=StockVehicleSource,banks=sources(),prepare=null){
 let wall=0;
 const plans=prepare?new Map([...banks].map(([hash,bank])=>[hash,prepare(bank)])):null;
 const registry={resolve(hash){const bank=banks.get(hash);return bank?{status:'available',bank}:{status:'unavailable'};},
  createSource(hash){return new Source(banks.get(hash),plans?{preparation10:plans.get(hash)}:{});}};
 const g=new Class({session:budgetSession042,registry,now:()=>wall,latencyProfile:'street-01',continuityPolicy:'camera-source-01',
  ...(fleet?{vehicleSourcePolicy:'catalogue-fleet-01'}:{})});
 g.setSettings({...g.settings,quality:'performance',acceleration:'cpu'});
 return {g,at(value){wall=value;}};
}
function frame(block,vehicles,generation=1){
 const t=block*512/48000,f=budgetFrame042(block,t),ticks=f.listener.observationTicks;
 Object.assign(f.listener,{position:[-2,-3,1],velocity:[0,0,0],generation});
 f.vehicles=vehicles.map(([id,life=1,hash=model,operating=.42,x=1,y=-3])=>({
  ...f.vehicles[0],id,generation:life,model:hash,observationTicks:ticks,operatingPoint:operating,position:[x,y,1],
  velocity:[0,0,0],context:'player',riderAttached:false}));
 return f;
}
async function step(eng,block,vehicles,lease=250,generation=1){
 eng.at(block*512/48);
 if(vehicles)eng.g.accept(frame(block,vehicles,generation),0,lease);
 return eng.g.render();
}
const slot=(g,id)=>g.slots.find(s=>s.vehicle?.id===id);

test('a new NPC model maps by exact labelled graph channels and rejects role swaps',()=>{
 const parent=path.resolve('.local/street01');
 fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'fleet-graph-fixture-'));
 writeOriginalGameplayPackageStreet01(dir,{fleet:true});
 const file=name=>path.join(dir,name),read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
 const npc=read('npc.json'),catalog=read('catalog.json');
 const model=catalog.Vehicles[0];
 model.ModelHash='a0010055';
 const bank=npc.vehicles[0],channels=model.Sounds.EngineAccelNPC.ChannelLinks;
 const slots={engine_accel:0,exhaust_accel:1,engine_idle:4,exhaust_idle:5};
 for(const stream of bank.streams){
  const index=slots[stream.name],hash=(0x01100000+index).toString(16).padStart(8,'0'),link=channels[index];
  stream.graphChannelIndex=index;stream.hash=hash;
  link.FullRelStreamHash=hash;link.MaskedAwcStreamId=hash;link.Stream.StreamId=hash;
 }
 const npcFile=file('alternate-npc.json');
 fs.writeFileSync(npcFile,JSON.stringify(npc),{flag:'wx'});
 const npcAssets=loadStockNpcAssets(npcFile),assets=loadStockCatalogAssets(file('player.json'),{sustainAtlasFile:file('atlas.json')});
 const registry=(name,catalogue)=>{
  const bytes=JSON.stringify(catalogue),catalogFile=file(name);
  fs.writeFileSync(catalogFile,bytes,{flag:'wx'});
  return loadInstalledStockRegistry({catalogFile,catalogSha256:createHash('sha256').update(bytes).digest('hex'),assets,npcAssets});
 };
 const good=registry('alternate-catalog.json',catalog);
 assert.equal(good.resolve(0xa0010055,'npc').status,'available');
 assert.equal(good.resolve(0xa0010056,'npc').reason,'unknown-installed-model');
 assert(good.fleetPreparationPairs().some(p=>p.model===0xa0010055&&p.context==='npc'));
 const swapped=structuredClone(catalog),links=swapped.Vehicles[0].Sounds.EngineAccelNPC.ChannelLinks;
 [links[0],links[1]]=[{...links[1],Index:0},{...links[0],Index:1}];
 assert.equal(registry('swapped-catalog.json',swapped).resolve(0xa0010055,'npc').status,'unavailable');
});

test('catalogue fleet keeps independent histories through late arrival, virtual population, expiry and entity reuse',async()=>{
 const e=engine(true),g=e.g;
 try{
  for(let b=0;b<24;b++)await step(e,b,[['a']]);
  const a=slot(g,'a').source,first=a.frame;
  for(let b=24;b<72;b++)await step(e,b,[['a',1,model,.21],['b',1,model,.78],['second',1,other,.6,3,2]]);
  assert.equal(slot(g,'a').source,a);
  assert.equal(a.frame,first+48*512);
  const bSource=slot(g,'b').source;
  assert.notEqual(bSource,a);
  assert.notEqual(bSource.voices.engine.accel,a.voices.engine.accel);
  assert.equal(bSource.vehicle,a.vehicle);
  assert.notEqual(bSource.frame,a.frame);
  assert.notDeepEqual(g.inputs['stock:slot0:engine'],g.inputs['stock:slot1:engine']);
  assert.equal(slot(g,'second').source.vehicle,secondBank);
  const population=[['a'],['b'],['second',1,other],...Array.from({length:21},(_,i)=>['discovered-'+i,1,model,.5,20+i,-3]),['unknown',1,unknown]];
  for(let b=72;b<105;b++)await step(e,b,population);
  assert.deepEqual(g.diagnostics().fleetPopulation,{discovered:25,qualified:24,unavailable:1,virtualized:19});
  assert.equal(g.diagnostics().active,5);
  assert.equal(slot(g,'a').source,a);
  assert.equal(slot(g,'b').source,bSource);
  assert(g.diagnostics().selectedPaths>=6);
  assert.throws(()=>g.accept(frame(105,[['a'],['a']]),0),/vehicle identity/);
  assert.throws(()=>g.accept(frame(105,[['a']]),251),/gameplay frame/);
  assert.throws(()=>g.accept(frame(105,[['a']]),0,0),/gameplay frame/);
  for(let b=105;b<116;b++)await step(e,b,[['a']],75);
  assert.equal(slot(g,'b'),undefined);
  assert.equal(slot(g,'a').source,a);
  for(let b=116;b<132;b++)await step(e,b,[['a'],['b',2]]);
  assert.notEqual(slot(g,'b').source,bSource);
  assert.equal(slot(g,'b').vehicle.generation,2);
  assert.equal(slot(g,'a').source,a);
  const reacquired=slot(g,'b').source;
  for(let b=132;b<167;b++)await step(e,b,null);
  assert.equal(g.diagnostics().active,0);
  assert.equal(g.lifecycle.lastRetirements.at(-1).engineShutdownInferred,false);
  for(let b=167;b<188;b++)await step(e,b,[['b',2]],250,2);
  assert.notEqual(slot(g,'b').source,reacquired);
  assert(g.diagnostics().pipeline.renderer.missingHistory===0);
 }finally{await g.close();}
});

test('fleet dry sources remain sample-exact and stereo agrees with separate renders',async()=>{
 const fleet=engine(true),left=engine(false),right=engine(false);
 const digest=createHash('sha256');
 try{
  let maximumError=0,nonzero=0;
  for(let b=0;b<140;b++){
   const x=['a',1,model,.14+.66*(1+Math.sin(b*.03))/2,1,-2];
   const y=['b',1,other,.08+.59*(1+Math.cos(b*.026))/2,2,-4];
   const expectedA=await step(left,b,[x]),expectedB=await step(right,b,[y]);
   const mixed=await step(fleet,b,[x,y]);
   for(const [id,single] of [['a',left],['b',right]])if(slot(single.g,id)){
    const a=slot(fleet.g,id),s=slot(single.g,id);
    for(const role of ['engine','exhaust'])assert.deepEqual(fleet.g.inputs['stock:slot'+a.index+':'+role],single.g.inputs['stock:slot'+s.index+':'+role]);
    assert.equal(a.source.frame,s.source.frame);
    assert.deepEqual(a.source.stats,s.source.stats);
   }
   for(let ch=0;ch<2;ch++){
    digest.update(Buffer.from(mixed[ch].buffer));
    for(let i=0;i<512;i++){
     const reference=Math.fround(expectedA[ch][i]+expectedB[ch][i]);
     assert(Number.isFinite(mixed[ch][i]));
     maximumError=Math.max(maximumError,Math.abs(mixed[ch][i]-reference));
     nonzero+=Number(mixed[ch][i]!==0);
    }
   }
  }
  assert(nonzero>0);
  assert(maximumError<2e-8,'only Float32 summation order differs: '+maximumError);
  assert.equal(fleet.g.stats.clippingFaults,0);
  console.log(JSON.stringify({maximumError,nonzero,sha256:digest.digest('hex')}));
 }finally{await Promise.all([fleet,left,right].map(e=>e.g.close()));}
});

test('qualified authored geometry can renew and expire without replacing active source owners',async()=>{
 const e=engine(true),g=e.g,vehicles=[['a'],['b',1,other,.7,2,2]];
 try{
  for(let b=0;b<20;b++)await step(e,b,vehicles);
  const a=slot(g,'a').source,b=slot(g,'b').source,at=a.frame;
  for(const [generation,clock] of [[1,210],[2,420]]){
   const {scene}=composeSceneUnion03({contexts:budgetContexts042({wall:true,until:900,missing:true}),
    listenerAnchor:[-2,-3,1],session:budgetSession042,worldDigest:budgetWorld042,generation,geometryTimeMs:clock});
   g.setPreparedResourceScene03(scene,{worldDigest:budgetWorld042,generation});
   assert.equal(g.diagnostics().geometry,'qualified-original-resource-subset');
   for(let i=g.stats.blocks;i<generation*20+20;i++)await step(e,i,vehicles);
   assert.equal(slot(g,'a').source,a);
   assert.equal(slot(g,'b').source,b);
  }
  for(let i=60;i<110;i++)await step(e,i,vehicles);
  assert.equal(g.diagnostics().geometry,'conditional-direct-unobserved-space-assumed-clear');
  assert.equal(slot(g,'a').source,a);
  assert.equal(a.frame,at+90*512);
  assert.equal(g.pipeline.renderer.frame,110*512);
  assert.equal(g.pipeline.renderer.stats.missingHistory,0);
 }finally{await g.close();}
});

test('a virtual vehicle becomes relevant without resetting a continuing emitter',async()=>{
 const e=engine(true),g=e.g;
 const near=Array.from({length:5},(_,i)=>['near-'+i,1,model,.4,1+i,-3]);
 try{
  for(let b=0;b<24;b++)await step(e,b,[...near,['approaching',1,other,.6,35,-3]]);
  assert.equal(slot(g,'approaching'),undefined);
  const first=slot(g,'near-0').source,at=first.frame;
  for(let b=24;b<120;b++)await step(e,b,[...near,['approaching',1,other,.6,Math.max(-1,35-(b-23)*.46),-3]]);
  assert(slot(g,'approaching')?.source.frame>0);
  assert.equal(first,slot(g,'near-0').source);
  assert.equal(first.frame,at+96*512);
  assert(g.lifecycle.lastRetirements.some(r=>r.reason==='voice-budget-virtualized'&&!r.engineShutdownInferred));
 }finally{await g.close();}
});

test('one unchanged voice matches the pinned starting implementation',async t=>{
 const frozen=process.env.RICHAUDIO_FLEET_BASELINE02;
 if(!frozen){t.skip('set RICHAUDIO_FLEET_BASELINE02 to the exact baseline source snapshot');return;}
 const from=relative=>import(pathToFileURL(path.join(frozen,relative)).href);
 const [{StockGameplay:Baseline},{StockVehicleSource:BaselineSource,prepareStockSource10:baselinePrepare}]=await Promise.all([
  from('src/acoustics/vehicle/gameplay.mjs'),from('src/acoustics/vehicle/stock-source.mjs')
 ]);
 for(const prepared of [false,true]){
  const banks=prepared?new Map([[model,authoredStartupBank10(false,Array(6).fill(true))]]):sources();
  const base=engine(false,Baseline,BaselineSource,banks,prepared?baselinePrepare:null);
  const candidate=engine(true,StockGameplay,StockVehicleSource,banks,prepared?prepareStockSource10:null);
  const hash=createHash('sha256');
  try{
   for(let b=0;b<240;b++){
    const f=[['baseline',1,model,.12+.7*(1+Math.sin(b*.08))/2,1,-3]];
    const a=await step(base,b,f),c=await step(candidate,b,f);
    assert.deepEqual(a,c);
    assert.deepEqual(base.g.inputs['stock:slot0:engine'],candidate.g.inputs['stock:slot0:engine']);
    assert.deepEqual(base.g.inputs['stock:slot0:exhaust'],candidate.g.inputs['stock:slot0:exhaust']);
    assert.deepEqual(slot(base.g,'baseline')?.source.stats,slot(candidate.g,'baseline')?.source.stats);
    for(const channel of c)hash.update(Buffer.from(channel.buffer));
   }
   console.log(JSON.stringify({comparedBlocks:240,prepared,stereoSha256:hash.digest('hex')}));
  }finally{await Promise.all([base.g.close(),candidate.g.close()]);}
 }
});
