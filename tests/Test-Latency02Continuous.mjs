import test from 'node:test';import assert from 'node:assert/strict';
import {ListenerPlayout} from '../src/acoustics/streaming/listener-playout.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
import {fixture} from '../tools/acoustics-06-scenes.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {createAuthoredStationaryEmissionContract,StationaryEmissionController} from '../src/acoustics/vehicle/stationary-emission.mjs';
const FS=48000,BLOCK=512,session='d'.repeat(32),base=1e7,near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function frame(sequence,time,{position=[0,0,1],operatingPoint=.2,running=true,generation=1,sourcePosition=[0,10,1],vehicles=true}={}){const ticks=base+Math.round(time*1e7);return {version:1,session,listener:{version:1,session,generation,sequence,observationTicks:ticks,clockFrequency:1e7,gameTimeMs:Math.round(time*1000),position,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'synthetic',velocityKind:'authored-synthetic',paused:false,valid:true,reason:'valid',coordinates:'research-rh-z-up-metres-v1',units:'metres',sourceId:null},vehicles:vehicles?[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:sourcePosition,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint,running,valid:true}]:[]};}
function contract(){const f=frame(0,0);return createAuthoredStationaryEmissionContract({authority:'authored-offline-fixture',session,source:f.vehicles[0],listener:f.listener,knownThroughFrame:3*FS,coordinates:f.listener.coordinates,units:f.listener.units});}
function add(p,time,sequence,{position=[0,0,1],velocity=[0,0,0],generation=1,units='metres'}={},receipt=time){const s=frame(sequence,time,{position,generation}).listener;s.velocity=velocity;s.units=units;if(units==='native-unverified')s.coordinates='gta-native-unscaled';p.add({type:'listener',state:s,receiptAgeMs:(receipt-time)*1000},receipt,receipt*1000);}
test('arrived-only recovery exposes missing geometry and never reconciles a forecast into a snap',()=>{
 const baseline=new ListenerPlayout({delayMs:50,anchoredClock:true}),safe=new ListenerPlayout({delayMs:50,anchoredClock:true,recoveryPolicy:'arrived-segments-01'}),first=.0565,next=first+BLOCK/FS;
 for(const p of [baseline,safe])add(p,0,0,{position:[0,0,1],velocity:[13,0,0]});const a=baseline.sample(first,first*1000),x=safe.sample(first,first*1000);assert.equal(a.mode,'predicted');assert.equal(x.state,null);assert.equal(x.mode,'awaiting-observed-segment');
 for(const p of [baseline,safe])add(p,.06,1,{position:[-4.2,0,1],velocity:[-9,0,0]},next);const b=baseline.sample(next,next*1000),y=safe.sample(next,next*1000);assert.equal(y.mode,'interpolated');near(y.state.position[0],-70*(next-.05));near(y.targetTime,next-.05);assert.deepEqual(y.state.position,b.state.position);assert.equal(safe.stats.predicted,0);
 const old=new CausalSimulation(fixture('open-road').scene),recovered=new CausalSimulation(fixture('open-road').scene),observe=(s,time,l)=>s.observe({time,session,generation:1,listener:l,sources:[]});
 observe(old,first,a.state);assert.throws(()=>observe(old,next,b.state),/undeclared position discontinuity/);observe(recovered,first,{...frame(0,0).listener,valid:false});assert.doesNotThrow(()=>observe(recovered,next,y.state));
});
test('genuine segment speed is checked after missing data, not bypassed by an invalid previous output',()=>{
 const p=new ListenerPlayout({delayMs:50,anchoredClock:true,recoveryPolicy:'arrived-segments-01'});add(p,0,0,{units:'native-unverified'});assert.equal(p.sample(.06,60).state,null);add(p,.05,1,{position:[1000,0,1],units:'native-unverified'},.07);assert.throws(()=>p.sample(.075,75),/undeclared position discontinuity/);assert.equal(p.stats.rejectedObservedSegments,1);
});
test('arrived segment math preserves fixed clock, genuine interpolation and speed bound across knots',()=>{
 const p=new ListenerPlayout({delayMs:50,anchoredClock:true,recoveryPolicy:'arrived-segments-01'});let position=0;const knots=[];for(let i=0;i<30;i++){if(i)position+=(i%2?1:-1)*99*.02;knots.push({time:i*.02,x:position});add(p,i*.02,i,{position:[position,0,1]});}
 let prior=null;for(let t=.051;t<.62;t+=BLOCK/FS){const r=p.sample(t,600);if(!r.state)continue;const at=t-.05,left=knots.findLast(k=>k.time<=at),right=knots.find(k=>k.time>at);if(right)near(r.state.position[0],left.x+(right.x-left.x)*(at-left.time)/(right.time-left.time),1e-8);if(prior)assert.ok(Math.abs(r.state.position[0]-prior.x)/(t-prior.t)<=100+1e-6);prior={x:r.state.position[0],t};near(r.playoutSeconds,.05);assert.equal(r.extrapolationSeconds,0);}assert.equal(p.stats.predicted,0);
});
test('new policy keeps actual generation cuts, expiry, pause and strict selection explicit',()=>{
 const p=new ListenerPlayout({delayMs:50,anchoredClock:true,preserveGenerationHistory:true,recoveryPolicy:'arrived-segments-01'});add(p,0,0);add(p,.05,1);add(p,.1,2,{generation:2,position:[1000,0,1]});assert.equal(p.sample(.125,125).mode,'generation-gap');add(p,.11,3,{generation:2,position:[1000,0,1]});assert.equal(p.sample(.155,155).state.generation,2);assert.equal(p.sample(.162,162).mode,'awaiting-observed-segment');assert.equal(p.sample(.2,362).mode,'stale-wall-clock');
 assert.throws(()=>new ListenerPlayout({delayMs:50,recoveryPolicy:'arrived-segments-01'}));assert.throws(()=>new ListenerPlayout({delayMs:75,anchoredClock:true,recoveryPolicy:'arrived-segments-01'}));
});
test('stationary emission chooses only already observed current-frame state and never backdates a future rev/off',()=>{
 const c=new StationaryEmissionController(contract()),a=frame(0,0),b=frame(1,.05,{operatingPoint:.9,running:false});c.observe(a);c.observe(b);const records=[{time:0,frame:a,wallExpires:200},{time:.05,frame:b,wallExpires:200}];
 assert.equal(c.select(records,.04*FS,40).operatingPoint,.2);assert.equal(c.selected.running,true);const now=c.select(records,.05*FS,50);assert.equal(now.operatingPoint,.9);assert.equal(now.running,false);near(now.observationAgeMs,0);near(now.emissionTime,.05);assert.equal(c.select(records,Math.round(.07*FS),200),null,'original lease expiry is not extended');
});
test('stationary qualification rejects motion, identity or horizon permanently; no legacy rev replay',()=>{
 for(const changed of [frame(1,.05,{sourcePosition:[0,10.01,1]}),frame(1,.05,{position:[.01,0,1]}),frame(1,.05,{generation:2})]){const c=new StationaryEmissionController(contract());c.observe(frame(0,0));assert.throws(()=>c.observe(changed),/contract rejected/);assert.throws(()=>c.select([{time:0,frame:frame(0,0),wallExpires:200}],2400,50),/contract rejected/);}
 const c=new StationaryEmissionController(contract());assert.throws(()=>c.select([],3*FS+1,1),/horizon exhausted/);assert.throws(()=>new StationaryEmissionController(structuredClone(contract())),/Branded/);
 const expired=new StationaryEmissionController(contract());assert.equal(expired.select([{time:0,frame:frame(0,0),wallExpires:Infinity}],0,0),null,'unbounded expiry cannot qualify current-emission mode');
});
test('each candidate record must carry a finite original lease and valid unpaused observation',()=>{
 for(const fault of ['infinite-lease','invalid','paused']){const c=new StationaryEmissionController(contract()),old=frame(0,.15,{operatingPoint:.9}),current=frame(1,.16,{operatingPoint:.2});old.vehicles[0].observationTicks+=500000;
  if(fault==='invalid')old.listener.valid=false;if(fault==='paused')old.listener.paused=true;c.observe(old);c.observe(current);
  const selected=c.select([{time:.15,frame:old,wallExpires:fault==='infinite-lease'?Infinity:300},{time:.16,frame:current,wallExpires:300}],9600,200);
  assert.equal(selected.sequence,1);assert.equal(selected.operatingPoint,.2,'an older invalid/unbounded record cannot supply apparently newer state');
 }
});
function engine(options={}){let wall=0,e;const calls=[],sources=[],asset={frames:8192,sampleRate:24000,samples:new Float32Array(8192).fill(.1),nativePeak:.1},bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(r=>[r,Object.fromEntries(['idle','accel','decel'].map(m=>[m,asset]))]))},registry={resolve:()=>({status:'available',bank}),createSource:()=>{const s=new StockVehicleSource(bank),render=s.renderInto.bind(s);s.renderInto=(control,...outputs)=>{calls.push({frame:e.pipeline.renderer.frame,sourceFrame:s.frame,...control});return render(control,...outputs);};sources.push(s);return s;}};
 e=new StockGameplay({registry,session,now:()=>wall,latencyProfile:'low-latency-01',continuityPolicy:'camera-source-01',...options});return {e,calls,sources,setWall:ms=>{wall=ms;}};}
test('actual grain/source pipeline applies newer state at current emission frame only in qualified stationary mode',async()=>{
 const normal=engine(),fresh=engine({operatingStatePolicy:'authored-stationary-emission-01',stationaryEmissionContract:contract()});
 try{for(let frameStart=0,next=0,sequence=0;frameStart<1.2*FS;frameStart+=BLOCK){const t=frameStart/FS;for(const f of [normal,fresh])f.setWall(t*1000);while(next<=t+1e-10){const observed=frame(sequence++,next,{operatingPoint:next<.5-1e-9?.2:.9});for(const f of [normal,fresh])f.e.accept(observed,Math.max(0,(t-next)*1000),200);next+=.05;}await normal.e.render();await fresh.e.render();}
 const n=normal.calls.find(c=>c.operatingPoint>.8),f=fresh.calls.find(c=>c.operatingPoint>.8);assert.ok(f.frame>=.5*FS&&f.frame<.5*FS+BLOCK);assert.ok(n.frame>f.frame);assert.equal(fresh.sources.length,1);for(let i=1;i<fresh.calls.length;i++)assert.equal(fresh.calls[i].sourceFrame-fresh.calls[i-1].sourceFrame,BLOCK);const d=fresh.e.diagnostics();assert.equal(d.pipeline.history.affectedFrames,0);assert.equal(d.pipeline.renderer.missingHistory,0);assert.equal(d.pipeline.renderer.limited,0);for(const path of fresh.e.pipeline.lastControl.paths)near(path.rate,1,1e-9);
 const before=fresh.e.pipeline.renderer.frame;assert.throws(()=>fresh.e.accept(frame(30,before/FS,{position:[.1,0,1]}),0,200),/contract rejected/);await assert.rejects(fresh.e.render(),/contract rejected/);assert.equal(fresh.e.pipeline.renderer.frame,before,'motion cannot fall back to delayed old-state rendering');
 }finally{normal.e.close();fresh.e.close();}
});
test('known destructive timing combinations cannot be selected as an engine policy',()=>{
 assert.throws(()=>engine({continuousTimingPolicy:'arrived-segments-50',continuityPolicy:'baseline'}),/independent camera\/source/);
 assert.throws(()=>engine({operatingStatePolicy:'authored-stationary-emission-01'}),/Branded/);
 assert.throws(()=>engine({operatingStatePolicy:'baseline',stationaryEmissionContract:contract()}),/Explicit/);
});
