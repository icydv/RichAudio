import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import test from 'node:test';
import {NpcBlockWorker} from '../src/acoustics/vehicle/npc-block-worker.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource,loadStockCatalogAssets,loadStockNpcAssets,prepareStockSource10} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {budgetFrame042,budgetContexts042,budgetWorld042,budgetSession042 as session} from './fixtures/AcousticBudget042.mjs';
import {composeSceneUnion03} from '../src/acoustics/world/scene-union03.mjs';
import {writeOriginalNpcWorkerPackage} from './fixtures/OriginalNpcBlockWorker.mjs';

const roles=['engine','exhaust'],root=fileURLToPath(new URL('../',import.meta.url)),blockSize=512;
function fixture(t){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio-npc-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const pkg=writeOriginalNpcWorkerPackage(path.join(temporary,'.local','package'));
  const assets=loadStockCatalogAssets(path.join(pkg.folder,pkg.config.playerManifest),{sustainAtlasFile:path.join(pkg.folder,pkg.config.atlas)});
  const npcAssets=loadStockNpcAssets(pkg.npcManifest),bank=npcAssets.vehicles.get('bati');
  const registry=loadInstalledStockRegistry({assets,npcAssets,catalogFile:path.join(pkg.folder,pkg.config.catalog),catalogSha256:pkg.config.catalogSha256});
  registry.prepareSource10(0xf9300cc5,'player');
  registry.prepareSource10(0xf9300cc5,'npc');
  return {...pkg,bank,registry,player:assets.vehicles.get('bati')};
}
const options={sourceGain:1,pressureSharesByState:{idle:{engine:.4,exhaust:.6},load:{engine:.55,exhaust:.45},lift:{engine:.3,exhaust:.7}}};
function createWorker(t,fixture,overrides={}){
  const worker=new NpcBlockWorker({session,npcManifest:fixture.npcManifest,bank:fixture.bank,options,...overrides});
  t.after(()=>worker.close());
  return worker;
}
const slotsForTest=()=>Array.from({length:5},(_,index)=>({index,source:null}));
const channelsForTest=()=>Object.fromEntries(slotsForTest().flatMap(s=>roles.map(role=>['stock:slot'+s.index+':'+role,new Float32Array(blockSize)])));
function acquire(slot,worker,bank,generation){
  slot.identity='vehicle-'+slot.index+'-life-'+generation;
  slot.generation=generation;
  slot.source=worker.source(bank);
}
function controls(block,index) {
  const lift=(block+index*5)%21>13;
  return {operatingPoint:.2+.7*(1+Math.sin(block*.071+index))/2,lift,running:block%31!==index,
    load:lift?.05:.9};
}

test('five original worker voices match serial PCM across an absence, stopped engine, pause and recycled lifetime',async t=>{
  const f=fixture(t),worker=createWorker(t,f),ready=await worker.ready,inputs=channelsForTest(),slots=slotsForTest();
  assert(ready.bytes>0);
  assert.equal(worker.source(f.player),null,'the player bank stays on its original serial path');
  const originals=new Map(),reference=[new Float32Array(blockSize),new Float32Array(blockSize)];
  const plan=prepareStockSource10(f.bank);
  let compared=0,simultaneous=0;
  for(let block=0;block<92;block++){
    for(const slot of slots){
      const generation=slot.index===3&&block>=62?2:1;
      if(block<slot.index+2 || slot.index===3&&block>=43&&block<62){slot.source=null;continue;}
      if(!slot.source || slot.generation!==generation){
        acquire(slot,worker,f.bank,generation);
        originals.set(slot.identity,new StockVehicleSource(f.bank,{...options,preparation10:plan}));
      }
      slot.vehicle=controls(block,slot.index);
    }
    for(const channel of Object.values(inputs))channel.fill(NaN);
    const canRender=s=>!(s.index===2&&block>=29&&block<36);
    const request=worker.begin(slots,canRender);
    if(!request)continue;
    assert.throws(()=>worker.begin(slots,canRender),/in flight/);
    await request.response;
    assert.throws(()=>worker.begin(slots,canRender),/in flight/,'a received shared buffer stays owned until join');
    assert(Object.values(inputs).every(ch=>ch.every(Number.isNaN)),'nothing is copied before the matching join');
    await worker.join(request,slots,inputs);
    await assert.rejects(worker.join(request,slots,inputs),/matching|flight|consumed/);
    let nonzero=0;
    for(const slot of slots){
      if(!slot.source||!canRender(slot)){
        assert(roles.every(role=>inputs['stock:slot'+slot.index+':'+role].every(Number.isNaN)));
        continue;
      }
      const source=originals.get(slot.identity);
      source.renderInto(slot.vehicle,...reference);
      for(const [r,role] of roles.entries())assert.deepEqual(inputs['stock:slot'+slot.index+':'+role],reference[r]);
      if(reference.some(ch=>ch.some(v=>v!==0)))nonzero++;
      assert.equal(slot.source.frame,source.frame);
      assert.equal(slot.source.stats.peak,source.stats.peak);
      compared++;
    }
    if(nonzero===5)simultaneous++;
  }
  assert(compared>350 && simultaneous>30);
  assert.equal(originals.size,6);
});

test('an obsolete completed reply cannot write PCM into a recycled slot',async t=>{
  const f=fixture(t),worker=createWorker(t,f),slots=slotsForTest(),inputs=channelsForTest();
  await worker.ready;
  acquire(slots[1],worker,f.bank,1);slots[1].vehicle=controls(3,1);
  acquire(slots[4],worker,f.bank,1);slots[4].vehicle=controls(3,4);
  const pending=worker.begin(slots,()=>true);
  await pending.response;
  acquire(slots[4],worker,f.bank,2);
  await assert.rejects(worker.join(pending,slots,inputs),/owner|lifetime|identity/);
  assert.equal(slots[1].source.frame,0,'all receipts are validated before modifying the first survivor');
  assert(Object.values(inputs).every(a=>a.every(x=>x===0)));
});

test('a worker stop invalidates the open round, joins once and permits a fresh session',async t=>{
  const f=fixture(t),worker=createWorker(t,f),slots=slotsForTest(),inputs=channelsForTest();
  await worker.ready;
  acquire(slots[0],worker,f.bank,1);slots[0].vehicle=controls(9,0);
  const pending=worker.begin(slots,()=>true);
  const waiting=assert.rejects(worker.join(pending,slots,inputs),/stopped|closed|flight/);
  const closed=worker.close();
  assert.equal(worker.close(),closed);
  await waiting;await closed;
  assert(Object.values(inputs).every(a=>a.every(x=>x===0)));
  const replacement=createWorker(t,f,{session:'7'.repeat(32)});
  await replacement.ready;
  acquire(slots[0],replacement,f.bank,2);
  await replacement.join(replacement.begin(slots,()=>true),slots,inputs);
  const serial=new StockVehicleSource(f.bank,{...options,preparation10:prepareStockSource10(f.bank)});
  const expected=roles.map(()=>new Float32Array(blockSize));
  serial.renderInto(slots[0].vehicle,...expected);
  for(const [i,role] of roles.entries())assert.deepEqual(inputs['stock:slot0:'+role],expected[i]);
});

test('invalid bank bytes, a foreign reply, and lost worker messages cannot publish PCM',{timeout:15000},async t=>{
  const f=fixture(t),slots=slotsForTest(),inputs=channelsForTest();
  const absentReady=createWorker(t,f,{startupTimeoutMs:100});
  absentReady.worker.removeAllListeners('message');
  await assert.rejects(absentReady.ready,/timed out|timeout|deadline/i);
  await absentReady.close();

  const late=createWorker(t,f,{workTimeoutMs:80});
  await late.ready;
  acquire(slots[0],late,f.bank,1);slots[0].vehicle=controls(4,0);
  late.worker.removeAllListeners('message');
  const missing=late.begin(slots,()=>true);
  await assert.rejects(late.join(missing,slots,inputs),/timed out|timeout|deadline/i);
  assert.equal(slots[0].source.frame,0);
  assert.throws(()=>late.begin(slots,()=>true));
  await late.close();

  const foreign=createWorker(t,f);
  await foreign.ready;
  acquire(slots[0],foreign,f.bank,2);
  const attempted=foreign.begin(slots,()=>true);
  foreign.worker.emit('message',{session:'0'.repeat(32),round:attempted.round,voices:[]});
  await assert.rejects(attempted.response,/receipt|session|round/);
  await assert.rejects(foreign.join(attempted,slots,inputs));
  assert.equal(slots[0].source.frame,0);
  assert(Object.values(inputs).every(a=>a.every(x=>x===0)));
  await foreign.close();

  const invalid=JSON.parse(fs.readFileSync(f.npcManifest,'utf8'));
  invalid.vehicles[0].layers.exhaust.accel.sha256='0'.repeat(64);
  fs.writeFileSync(f.npcManifest,JSON.stringify(invalid));
  const broken=createWorker(t,f);
  await assert.rejects(broken.ready,/binding|bytes/);
  await broken.close();
});

function frame(block){
  const f=budgetFrame042(block,block*512/48000),base=f.vehicles[0];
  Object.assign(f.listener,{position:[0,0,1],velocity:[0,0,0]});
  f.vehicles=Array.from({length:5},(_,i)=>({...base,id:'traffic-'+i,context:i?'npc':'player',
    generation:i===3&&block>=67?2:1,position:[-1+i*.43,-3+i*.6+block*.001,1],
    velocity:[0,.09375,0],operatingPoint:controls(block,i).operatingPoint})).filter(v=>v.id!=='traffic-3'||block<48||block>=67);
  return f;
}
function gameplay(f,worker){
  const clock={ms:0};
  const g=new StockGameplay({registry:f.registry,session,now:()=>clock.ms,latencyProfile:'street-01',
    continuityPolicy:'camera-source-01',vehicleSourcePolicy:'catalogue-fleet-01'});
  if(worker)g.npcBlockWorker=worker;
  g.setSettings({...g.settings,quality:'performance',acceleration:'cpu'});
  return {g,clock};
}

test('normal gameplay mixes the same current block through independent NPC arrival, retirement and slot reuse',async t=>{
  const f=fixture(t),worker=createWorker(t,f,{options:{sourceGain:1}}),base=gameplay(f),other=gameplay(f,worker);
  await worker.ready;
  t.after(async()=>{await Promise.all([base.g.close(),other.g.close()]);});
  let withFive=0,withFour=0;
  for(let b=0;b<92;b++){
    base.clock.ms=other.clock.ms=b*512/48;
    const observation=frame(b);
    for(const {g} of [base,other])g.accept(observation,0,250);
    const a=await base.g.render(),c=await other.g.render();
    assert.deepEqual(a,c,'stereo block '+b);
    for(const s of other.g.slots){
      if(!s.source)continue;
      const serial=base.g.slots[s.index];
      assert.equal(s.identity,serial.identity);
      assert.equal(s.source.frame,serial.source.frame);
      for(const role of roles)assert.deepEqual(other.g.inputs['stock:slot'+s.index+':'+role],base.g.inputs['stock:slot'+s.index+':'+role]);
    }
    const voices=other.g.slots.filter(s=>s.source);
    if(voices.length===5 && c.some(ch=>ch.some(v=>v!==0)))withFive++;
    if(b>=49 && b<67 && voices.length===4)withFour++;
  }
  assert(withFive>=36&&withFour>=16);
  assert.equal(other.g.slots.find(s=>s.vehicle?.id==='traffic-3').vehicle.generation,2);
});

for(const target of [4,0])test('an overdue '+(target?'NPC':'attached rider')+' has the same wall mix and local release as withdrawing it before selection',async t=>{
  const f=fixture(t),worker=createWorker(t,f,{options:{sourceGain:1}}),base=gameplay(f),other=gameplay(f,worker);
  await worker.ready;
  t.after(async()=>{await Promise.all([base.g.close(),other.g.close()]);});
  const missingId='traffic-'+target;
  for(const {g} of [base,other]){
    const {scene}=composeSceneUnion03({contexts:budgetContexts042({wall:true,until:9000}),
      listenerAnchor:[-2,-3,1],session,worldDigest:budgetWorld042,generation:1,geometryTimeMs:0});
    g.setPreparedResourceScene03(scene,{worldDigest:budgetWorld042,generation:1});
    g.setSettings({...g.settings,airflowEnabled:true,airflowLevel:.7});
  }
  let armed=false,expired=null,dispatched=0,beforeRetired;
  const begin=worker.begin.bind(worker),join=worker.join.bind(worker);
  worker.begin=(...args)=>{const q=begin(...args);if(q)dispatched++;return q;};
  worker.join=async(...args)=>{
    const receipt=await join(...args);
    if(armed&&!expired){
      const live=other.g.slots.filter(s=>s.source).map(s=>({id:s.vehicle.id,index:s.index,
        context:s.vehicle.context,frame:s.source.frame,deadline:s.vehicle.sourceExpiresAt})).sort((a,b)=>a.deadline-b.deadline);
      assert.equal(live.length,5);
      assert.equal(live[0].id,missingId);
      assert(live[0].deadline<live[1].deadline);
      expired=live[0];
      other.clock.ms=(live[0].deadline+live[1].deadline)/2;
    }
    return receipt;
  };
  function observed(block,timeMs){
    const observation=frame(block);
    const ticks=10000000+Math.round(timeMs*10000),now=observation.listener.observationTicks;
    observation.listener.observationTicks=ticks;
    observation.listener.gameTimeMs=Math.round(timeMs);
    observation.listener.position=[-2,-3,1];
    for(const v of observation.vehicles){
      const index=Number(v.id.slice(-1));
      // Advance the four peer observations slightly within the same callback.
      // The untouched NPC therefore has the oldest interpolation cutoff.
      const offset=(index===target ? 0 : 1+index*.5)*10000;
      v.observationTicks+=ticks-now+offset;
      v.position[0]+=-10+12*timeMs/1000;
      v.velocity=[12,.09375,0];
      v.riderAttached=v.riderViewAttached=index===0;
    }
    return observation;
  }
  let block=0;
  for(;block<=32;block++){
    base.clock.ms=other.clock.ms=block*512/48;
    const observation=observed(block,other.clock.ms);
    const oracleObservation=block===32?{...observation,vehicles:observation.vehicles.filter(v=>v.id!==missingId)}:observation;
    base.g.accept(oracleObservation,0,250);
    other.g.accept(observation,0,250);
    const countBefore=dispatched;
    if(block===32){armed=true;beforeRetired=other.g.stats.retired;}
    const expected=await base.g.render(),actual=await other.g.render();
    assert.deepEqual(other.g.localAirflow,base.g.localAirflow,'local rider/tail pressure matches the serial withdrawal');
    assert.deepEqual(actual,expected,'every stereo frame matches the serial pre-selection withdrawal');
    if(armed)assert.equal(dispatched,countBefore+1,'surviving voices are never dispatched twice for one output block');
  }
  assert(expired);
  assert.equal(other.g.stats.retired,beforeRetired+1);
  assert.equal(other.g.slots[expired.index].source,null);
  assert(!other.g.pipeline.lastControl.paths.some(p=>p.sourceId.startsWith('stock:slot'+expired.index+':')),
    'no new acoustic arrival from the rejected response is admitted');
  for(const role of [...roles,'aero']) assert(other.g.inputs['stock:slot'+expired.index+':'+role].every(x=>x===0));
  assert(other.g.pipeline.renderer.slots.some(s=>s.active&&!s.present&&s.source.id.startsWith('stock:slot'+expired.index+':')),
    'the previously audible paths retain their ordinary release');
  assert(other.g.pipeline.lastControl.paths.some(p=>p.order>0),'surviving finite-wall returns reach the mixer');
  assert.deepEqual(other.g.pipeline.lastControl.paths,base.g.pipeline.lastControl.paths,
    'the serial omission and post-join withdrawal select the same surviving finite paths and headroom');
  assert(other.g.localAirflow.some(channel=>channel.some(x=>x!==0)),'the rider or its bounded local pressure release is audible');
  assert.equal(other.g.airflowState.riderActive,target!==0);
  if(target===0)assert.equal(other.g.localAirflowRelease.remaining,960-512);
  for(const slot of other.g.slots.filter(s=>s.source)){
    assert.equal(slot.source.frame,base.g.slots[slot.index].source.frame);
    for(const role of roles)assert.deepEqual(other.g.inputs['stock:slot'+slot.index+':'+role],base.g.inputs['stock:slot'+slot.index+':'+role]);
  }
  const nextGeneration=other.g.slots[expired.index].generation;
  armed=false;
  for(let i=0;i<32;i++,block++){
    other.clock.ms+=512/48;
    const observation=observed(block,other.clock.ms);
    const replacement=observation.vehicles.find(v=>v.id===expired.id);
    if(replacement)replacement.generation++;
    other.g.accept(observation,0,250);
    await other.g.render();
  }
  const replacement=other.g.slots.find(s=>s.vehicle?.id===expired.id);
  assert(replacement&&replacement.generation>nextGeneration&&replacement.source.frame>0);
});

function observeWorker(f){
  const observer=path.join(f.folder,'observe-worker.mjs');
  fs.writeFileSync(observer,`
import threads from 'node:worker_threads';
import {syncBuiltinESMExports} from 'node:module';
if(threads.isMainThread){
  const Original=threads.Worker;
  threads.Worker=class extends Original{
    constructor(file,...args){
      super(file,...args);
      this.isNpcBlock=String(file).endsWith('/npc-block-worker.mjs');
      if(this.isNpcBlock)process.stderr.write('{"type":"observed-npc-worker"}\\n');
    }
    postMessage(message,...rest){
      if(this.isNpcBlock&&Array.isArray(message.slots)){
        const slots=message.slots.filter(Boolean).map(s=>({identity:s.identity,generation:s.generation,sourceFrame:s.sourceFrame,rendered:!!s.control}));
        process.stderr.write(JSON.stringify({type:'observed-npc-round',round:message.round,slots})+'\\n');
      }
      return super.postMessage(message,...rest);
    }
  };
  syncBuiltinESMExports();
}`);
  return pathToFileURL(observer).href;
}
test('the producer starts the NPC worker only for an explicitly selected ordinary fleet',t=>{
  const f=fixture(t),observer=observeWorker(f);
  const normal={...f.config,acousticWorld:false,clockedFleetEvidence02:true,outputSink:'environment-observation'};
  const privateAdder={...normal,vehicleSourcePolicy:undefined,latencyProfile:undefined,
    outputSink:undefined,clockedFleetEvidence02:undefined,powertrainVoice:'bati-player-on-adder',
    eligible:[{model:0xb779a091,context:'player'}]};
  const cases=[
    {name:'legacy catalogue',config:normal,evidence:true,expected:0},
    {name:'normal worker',config:{...normal,fleetNpcSynthesis:'same-block-worker'},evidence:true,expected:1},
    {name:'explicit fleet without timing evidence',config:{...normal,fleetNpcSynthesis:'same-block-worker'},evidence:false,expected:1},
    {name:'ordinary unselected fleet',config:{...normal,outputSink:undefined},evidence:true,expected:0},
    {name:'ordinary selected fleet',config:{...normal,outputSink:undefined,fleetNpcSynthesis:'same-block-worker'},evidence:false,expected:1},
    {name:'private ADDER',config:privateAdder,evidence:true,expected:0},
    {name:'private ADDER with fleet setting',config:{...privateAdder,fleetNpcSynthesis:'same-block-worker'},evidence:true,expected:0,mayReject:true}
  ];
  for(const [i,c] of cases.entries()){
    const id=(i+1).toString().repeat(32);
    fs.mkdirSync(path.join(f.folder,'.local','gameplay',id),{recursive:true});
    fs.writeFileSync(f.manifest,JSON.stringify(c.config));
    const run=spawnSync(process.execPath,['--import',observer,
      path.join(root,'tools/Run-Gameplay.mjs'),'--manifest',f.manifest,'--session',id],{
        cwd:root,windowsHide:true,timeout:13000,input:'{"type":"stop"}\n',encoding:'utf8',
        env:{...process.env,RICHAUDIO_CLOCKED_FLEET_EVIDENCE02:c.evidence?'1':'',
          RICHAUDIO_CLOCKED_PCM_WITNESS:'',RICHAUDIO_CLOCKED_SOUNDMAP:'',RICHAUDIO_FLEET_STARTUP_ACCELERATION:'cpu'}});
    assert.ifError(run.error);
    assert.equal(run.signal,null,c.name);
    const rows=run.stderr.trim().split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
    assert.equal(rows.filter(v=>v.type==='observed-npc-worker').length,c.expected,c.name+' '+run.stderr);
    if(!c.mayReject || run.status===0){
      assert.equal(run.status,0,c.name+' '+run.stderr);
      assert(rows.some(v=>v.type==='gameplay-ready'),c.name);
    }
    assert.equal(run.stdout,'');
  }
});

test('the production credit pump dispatches each NPC round once and writes a complete stereo packet per credit',{timeout:15000},async t=>{
  const f=fixture(t),observer=observeWorker(f);
  fs.writeFileSync(f.manifest,JSON.stringify({...f.config,acousticWorld:false,fleetNpcSynthesis:'same-block-worker'}));
  const child=spawn(process.execPath,['--import',observer,path.join(root,'tools/Run-Gameplay.mjs'),
    '--manifest',f.manifest,'--session',session],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,RICHAUDIO_CLOCKED_FLEET_EVIDENCE02:'',RICHAUDIO_FLEET_STARTUP_ACCELERATION:'cpu'}});
  const diagnostics=createInterface({input:child.stderr}),rounds=[],log=[];
  let packet=Buffer.alloc(0),blocks=0,nonzero=0,ready=false,stopping=false,sent=0,timer,deadline,start;
  const goal=30,bytes=4112;
  const done=new Promise((resolve,reject)=>{
    function offer(){
      if(stopping)return;
      const observation=frame(sent);
      const ticks=10000000+Math.round((performance.now()-start)*10000);
      observation.listener.observationTicks=ticks;
      for(const v of observation.vehicles)v.observationTicks=ticks;
      child.stdin.write(JSON.stringify({type:'snapshot',ageMs:0,validForMs:250,frame:observation})+'\n{"type":"credit","blocks":1}\n');
      sent++;
    }
    const stop=error=>{stopping=true;clearTimeout(timer);reject(error);};
    child.once('error',stop);
    child.stdin.on('error',error=>{if(!stopping)stop(error);});
    diagnostics.on('line',line=>{
      if(!line.startsWith('{')){log.push(line);return;}
      try{
        const row=JSON.parse(line);log.push(row.type);
        if(row.type==='gameplay-ready'){ready=true;start=performance.now();offer();}
        if(row.type==='observed-npc-round')rounds.push(row);
      }catch(error){stop(error);}
    });
    child.stdout.on('data',chunk=>{
      try{
        packet=Buffer.concat([packet,chunk]);
        while(packet.length>=bytes){
          assert.equal(packet.toString('ascii',0,4),'RA07');
          assert.equal(packet.readUInt32LE(4),blocks);assert.equal(packet.readUInt32LE(8),512);
          assert.equal(packet.readUInt32LE(12),0,'normal fleet carries no one-car takeover revision tag');
          let audible=false;
          for(let i=16;i<bytes;i+=4){const v=packet.readFloatLE(i);assert(Number.isFinite(v)&&Math.abs(v)<=1);audible||=v!==0;}
          nonzero+=Number(audible);blocks++;packet=packet.subarray(bytes);
          if(blocks===goal){stopping=true;child.stdin.end('{"type":"stop"}\n');}
          else timer=setTimeout(offer,Math.max(0,start+blocks*512/48-performance.now()));
        }
      }catch(error){stop(error);}
    });
    child.once('close',(code,signal)=>{if(code!==0||signal)stop(Error('Producer exited '+code+' '+signal+' '+log.join(' ')));else resolve();});
    deadline=setTimeout(()=>stop(Error('Timed out waiting for authored worker packets')),11000);
  });
  try{
    await done;
    assert(ready&&log.includes('npc-render-worker-joined'));
    assert.equal(sent,goal);assert.equal(blocks,goal);assert.equal(packet.length,0);assert(nonzero>=5);
    assert(rounds.some(r=>r.slots.length===4),'the player is local and four NPCs share the same round');
    const frames=new Map();
    for(let i=0;i<rounds.length;i++){
      assert.equal(rounds[i].round,i);
      for(const slot of rounds[i].slots){
        const key=slot.identity+'/'+slot.generation;
        assert.equal(slot.sourceFrame,frames.get(key)??0,'one advance per eligible lifetime and dispatch');
        frames.set(key,slot.sourceFrame+(slot.rendered?512:0));
      }
    }
    assert.equal(frames.size,4);
  }finally{
    clearTimeout(deadline);clearTimeout(timer);diagnostics.close();
    if(child.exitCode===null&&child.signalCode===null){
      const closed=new Promise(resolve=>child.once('close',resolve));
      child.kill();await closed;
    }
  }
});
