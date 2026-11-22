import test from 'node:test';
import assert from 'node:assert/strict';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {ListenerPlayout} from '../src/acoustics/streaming/listener-playout.mjs';
import {effectiveStaticInventory} from '../src/acoustics/world/inventory.mjs';
import {buildStaticTile} from '../src/acoustics/world/fixture-placements.mjs';
import {createQualifiedStaticScene} from '../src/acoustics/world/scene.mjs';
import {fixtureWorld,fixtureBounds} from './fixtures/StaticWorld01.mjs';

const session='c'.repeat(32),FS=48000,BLOCK=512,base=10000000;
function frame(sequence,time,{generation=1,kind='camera',coordinates='gta-native-unscaled',units='native-unverified',position=[0,0,1],paused=false,vehicles=null}={}){
 const ticks=base+Math.round(time*10000000);return {version:1,session,listener:{version:1,session,generation,sequence,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(time*1000),
  position,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:kind,velocityKind:'estimated-camera-difference',paused,valid:true,reason:'valid',coordinates,units,sourceId:null},
 vehicles:vehicles??[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:[0,10,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};
}
function engine(policy='camera-source-01'){
 const asset={frames:8192,sampleRate:24000,samples:new Float32Array(8192).fill(.1),nativePeak:.1};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
 const registry={resolve:()=>({status:'available',bank}),createSource:()=>new StockVehicleSource(bank)};let wall=0;
 const instance=new StockGameplay({registry,session,now:()=>wall,continuityPolicy:policy});return {instance,setWall:ms=>{wall=ms;}};
}
function add(p,time,sequence,options={},receiptTime=time,ageMs=0){p.add({type:'listener',state:frame(sequence,time,options).listener,receiptAgeMs:ageMs},receiptTime,receiptTime*1000);}

test('opt-in generations keep one clock and arrived history without blending the camera jump',()=>{
 const p=new ListenerPlayout({anchoredClock:true,preserveGenerationHistory:true});add(p,0,0);add(p,.05,1);add(p,.1,2,{generation:2,position:[1000,0,1]},.15,20);
 assert.equal(p.records.length,3);assert.ok(Math.abs(p.records.at(-1).time-.1)<1e-10,'new receipt phase cannot reanchor original observation clock');
 const old=p.sample(.175,175);assert.equal(old.state.generation,1);assert.deepEqual(old.state.position,[0,0,1]);assert.equal(old.extrapolationSeconds,.02499999999999998);
 const current=p.sample(.2,200);assert.equal(current.state.generation,2);assert.deepEqual(current.state.position,[1000,0,1]);assert.equal(current.extrapolationSeconds,0);
 assert.equal(p.extrapolation,.05);assert.throws(()=>new ListenerPlayout({preserveGenerationHistory:true}));assert.throws(()=>new ListenerPlayout({interactive:true,anchoredClock:true,preserveGenerationHistory:true}));
});

test('missing camera baseline interval stays unavailable after the original fifty millisecond bound',()=>{
 const p=new ListenerPlayout({anchoredClock:true,preserveGenerationHistory:true});add(p,0,0);add(p,.05,1);add(p,.17,2,{generation:2,position:[1000,0,1]});
 assert.equal(p.sample(.2,200).state.generation,1);const gap=p.sample(.225,225);assert.equal(gap.state,null);assert.equal(gap.mode,'generation-gap');assert.equal(p.sample(.27,270).state.generation,2);
 const count=p.records.length;assert.throws(()=>add(p,.16,3,{generation:3}));assert.equal(p.records.length,count,'reversed original ticks cannot change retained history');assert.equal(p.sample(.27,421).mode,'stale-wall-clock');
});

test('camera-only generation retains independently qualified vehicle pose brackets',()=>{
 const f=engine();try{f.instance.accept(frame(0,0),0,200);f.setWall(50);f.instance.pipeline.renderer.frame=2400;f.instance.accept(frame(1,.05),0,200);
  f.setWall(100);f.instance.pipeline.renderer.frame=4800;f.instance.accept(frame(2,.1,{generation:2,position:[1000,0,1]}),0,200);
  assert.equal(f.instance.snapshots.length,3);assert.equal(f.instance.vehiclesAt(.075).length,1);assert.equal(f.instance.vehiclesAt(.075)[0].generation,1);assert.equal(f.instance.playout.records.length,3);
 }finally{f.instance.close();}
});

test('listener representation and kind changes reset both clocks instead of mixing source timelines',()=>{
 for(const options of [{kind:'player'},{coordinates:'research-rh-z-up-metres-v1',units:'metres'}]){const f=engine();try{f.instance.accept(frame(0,0),0,200);f.setWall(50);f.instance.pipeline.renderer.frame=2400;
   f.instance.accept(frame(1,.05,{...options,generation:2}),0,200);assert.equal(f.instance.snapshots.length,1);assert.equal(f.instance.playout.records.length,1);assert.equal(f.instance.vehiclesAt(.025).length,0);
  }finally{f.instance.close();}}
});

test('real grain source advances continuously while only listener geometry is unavailable',async()=>{
 const f=engine(),e=f.instance;let sequence=0,next=0,source=null,voice=null,previousFrame=null,missing=0,spatialBefore=null,spatialAfter=null;
 try{for(let block=0;block<180;block++){const time=block*BLOCK/FS;f.setWall(time*1000);
   if(time+1e-10>=next){if(Math.abs(next-1)>.001)e.accept(frame(sequence++,next,{generation:next>=1.05?2:1,position:next>=1.05?[20,0,1]:[0,0,1]}),Math.max(0,(time-next)*1000),200);next+=.05;}
   await e.render();const s=e.slots.find(s=>s.source);if(s){if(!source){source=s.source;voice=source.voices.engine.accel;}assert.equal(s.source,source);assert.equal(source.voices.engine.accel,voice);
    if(previousFrame!==null)assert.equal(source.frame-previousFrame,BLOCK,'source/grain clock never pauses at a camera-only interval');previousFrame=source.frame;
    if(e.sample.mode==='generation-gap')missing++;if(e.sample.state?.generation===1)spatialBefore=e.pipeline.lastControl.sourceGenerations['stock:slot0:engine'];if(e.sample.state?.generation===2)spatialAfter=e.pipeline.lastControl.sourceGenerations['stock:slot0:engine'];}
  }
  assert.ok(missing>0,'unknown listener time is still explicitly missing');assert.equal(e.diagnostics().arrivals,1);assert.notEqual(spatialBefore,spatialAfter,'listener spatial PCM epoch still resets');assert.equal(e.diagnostics().pipeline.history.affectedFrames,0);assert.equal(e.diagnostics().pipeline.renderer.missingHistory,0);assert.equal(e.diagnostics().pipeline.renderer.limited,0);
 }finally{e.close();}
});

test('source expiry, source teleport and source identity remain independent of camera preservation',async()=>{
 const f=engine(),e=f.instance;try{e.accept(frame(0,0),0,20);f.setWall(21);assert.equal(e.vehiclesAt(0).length,0);await e.render();assert.equal(e.diagnostics().active,0);
  f.setWall(50);e.pipeline.renderer.frame=2400;e.accept(frame(1,.05),0,200);const invalid=frame(2,.1,{generation:2,position:[20,0,1]});invalid.vehicles[0].position=[1000,10,1];f.setWall(100);e.pipeline.renderer.frame=4800;e.accept(invalid,0,200);assert.equal(e.vehiclesAt(.075).length,0,'camera policy cannot interpolate a source teleport');
  const changed=frame(3,.15,{generation:2,position:[20,0,1]});changed.vehicles[0].generation=2;f.setWall(150);e.pipeline.renderer.frame=7200;e.accept(changed,0,200);assert.equal(e.vehiclesAt(.125).length,0,'changed source identity cannot borrow earlier generation');
 }finally{e.close();}
});

test('scope loss is not engine shutdown and an observed false state is never applied early',async()=>{
 const f=engine(),e=f.instance;try{let sequence=0;for(let block=0;block<40;block++){const time=block*BLOCK/FS;f.setWall(time*1000);if(block%4===0)e.accept(frame(sequence++,time),0,200);await e.render();}
  const last=e.snapshots.at(-1),off=structuredClone(last.frame);off.listener.sequence=sequence++;off.listener.observationTicks+=500000;off.listener.gameTimeMs+=50;off.vehicles[0].observationTicks+=500000;off.vehicles[0].running=false;
  e.pipeline.renderer.frame+=2400;f.setWall(e.pipeline.renderer.frame/FS*1000);e.accept(off,0,200);assert.equal(e.vehiclesAt(last.time+.025)[0].running,true);assert.equal(e.vehiclesAt(last.time+.05)[0].running,false);
  assert.equal(e.diagnostics().lifecycle.observedNotRunning,1);const empty=frame(sequence++,e.pipeline.renderer.frame/FS,{vehicles:[]});empty.listener.observationTicks=off.listener.observationTicks+500000;empty.listener.gameTimeMs=off.listener.gameTimeMs+50;e.pipeline.renderer.frame+=2400;f.setWall(e.pipeline.renderer.frame/FS*1000);e.accept(empty,0,200);await e.render();
  const d=e.diagnostics();assert.equal(d.active,0);assert.equal(d.lifecycle.lastRetirements.at(-1).reason,'source-absent-or-identity-change');assert.equal(d.lifecycle.lastRetirements.at(-1).engineShutdownInferred,false);
 }finally{e.close();}
});

test('static fixture scenes use separate branded world/session identity and explicit invalidation',()=>{
 const f=engine(),e=f.instance,world=fixtureWorld(),inventory=effectiveStaticInventory(world.input),tile=buildStaticTile(inventory,world.resources,{tileId:'local',bounds:fixtureBounds});
 const scene=createQualifiedStaticScene({tiles:[tile],worldDigest:tile.worldDigest,generation:2,session,bounds:fixtureBounds});
 try{assert.throws(()=>e.setQualifiedStaticScene(e.direct,{worldDigest:tile.worldDigest,generation:2}));assert.throws(()=>e.setQualifiedStaticScene(scene,{worldDigest:tile.worldDigest,generation:1}));
  e.setQualifiedStaticScene(scene,{worldDigest:tile.worldDigest,generation:2});assert.equal(e.pipeline.simulation.scene,scene);assert.equal(e.diagnostics().geometry,'qualified-static-authored-fixture');
  assert.throws(()=>e.clearQualifiedStaticScene({worldDigest:tile.worldDigest,generation:3}));assert.equal(e.pipeline.simulation.scene,scene);e.clearQualifiedStaticScene({worldDigest:tile.worldDigest,generation:2});assert.equal(e.pipeline.simulation.scene,e.direct);
 }finally{e.close();}
});
