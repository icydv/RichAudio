import {test} from 'node:test';import assert from 'node:assert/strict';
import {source03Operating,source03FlybyOperating,source03FlybyScenes} from '../tools/Render-StockSource03.mjs';
import {stockPose,stockEmitters} from '../tools/stock-source-01-scenario.mjs';
import {trajectory,acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {candidatePaths,solvePath} from '../src/acoustics/engine/paths.mjs';
import {inBox,createTile} from '../src/acoustics/research/local-geometry.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';

test('Source03 programme has nine-second fixed high-load hold and explicit lift, without changing prior scenario',()=>{
  for(const t of [4.5,6,9,12,13.499]){
    const c=source03Operating(t);assert.ok(Math.abs(c.operatingPoint-.95)<1e-12);assert.ok(Math.abs(c.load-.95)<1e-12);assert.equal(c.lift,false);
  }
  assert.equal(source03Operating(13.5).lift,true);assert.equal(source03Operating(15.8).running,false);
  assert.equal(source03FlybyOperating(5.319).lift,false);assert.equal(source03FlybyOperating(5.32).lift,true);
  for(let t=0;t<18;t+=.031){const c=source03Operating(t);assert.ok(c.operatingPoint>=0&&c.operatingPoint<=1&&c.load>=0&&c.load<=1);}
});

test('coverage-only scene change preserves actual retarded path rates; changed world/config rejects before mutation',()=>{
  const scenes=source03FlybyScenes('street'),reference=new CausalSimulation(scenes[0]),swapped=new CausalSimulation(scenes[0]);
  let changed=false,comparisons=0;
  for(let frame=5*48000;frame<5.39*48000;frame+=512){
    const time=frame/48000,pose=stockPose('prototipo',time,true),exhaust=stockEmitters('prototipo',pose)[1];
    if(!changed&&pose.position[0]>=3.5){swapped.replaceScene(scenes[1],{preserveIdenticalReflectors:true});changed=true;}
    const snapshot={time,session:'coverage-rate-test',generation:1,
      listener:{position:[0,2,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]},sources:[exhaust]};
    reference.observe(snapshot);swapped.observe(snapshot);
    const expected=reference.update(time),actual=swapped.update(time);
    if(changed){assert.deepEqual(actual.paths,expected.paths,'no reflected Doppler restart at coverage-only swap');comparisons++;}
  }
  assert.ok(changed&&comparisons>=2);assert.equal(swapped.stats.sceneReplacements,1);
  const base=scenes[1],changedMaterial=structuredClone(base.materials),first=Object.keys(changedMaterial)[0];
  changedMaterial[first].reflection[2]*=.9;
  const changedPlane=createTile({...base.tile,id:'negative-changed-plane',surfaces:base.tile.surfaces.map((s,i)=>i?{...s}:{...s,center:[s.center[0],s.center[1],s.center[2]+.1]})});
  const invalid=[acousticScene(base.tile,changedMaterial,{...base.config}),
    acousticScene(changedPlane,base.materials,{...base.config}),
    acousticScene(base.tile,base.materials,{...base.config,airDbPerMetre:[.0001,.01,.11]})];
  for(const next of invalid){const oldScene=swapped.scene,oldEpoch=swapped.geometryEpoch,oldPrevious=[...swapped.previous],replacements=swapped.stats.sceneReplacements;
    assert.throws(()=>swapped.replaceScene(next,{preserveIdenticalReflectors:true}),/exactly identical/);
    assert.equal(swapped.scene,oldScene);assert.equal(swapped.geometryEpoch,oldEpoch);assert.deepEqual([...swapped.previous],oldPrevious);assert.equal(swapped.stats.sceneReplacements,replacements);}
});

test('same finite street world survives bounded coverage transition for all four continuous flybys',()=>{
  const scenes=source03FlybyScenes('street'),listener=trajectory([{time:0,position:[0,2,1.4]},{time:11,position:[0,2,1.4]}]);
  assert.deepEqual(scenes[0].tile.surfaces,scenes[1].tile.surfaces);
  assert.deepEqual(scenes[0].materials,scenes[1].materials);
  for(const scene of scenes){
    assert.ok(scene.tile.bounds.max.every((x,i)=>x-scene.tile.bounds.min[i]<=256));
    for(const surface of scene.tile.surfaces){assert.equal(surface.half[0],5);assert.equal(surface.center[0],0);}
  }
  for(const model of ['bati','lectro','prototipo','schafter3']){
    const keys=Array.from({length:516},(_,i)=>{const t=i*.02;return {time:t,position:stockEmitters(model,stockPose(model,t,true))[1].position,forward:[-1,0,0]};});
    const source={track:trajectory(keys),directivity:.35};let switchTime=null;
    for(let t=0;t<=10.3;t+=.01){const p=stockPose(model,t,true),index=p.position[0]>=3.5?1:0;
      if(index&&!switchTime)switchTime=t;
      assert.ok(inBox([0,2,1.4],scenes[index].tile.bounds));assert.ok(stockEmitters(model,p).every(s=>inBox(s.position,scenes[index].tile.bounds)));
    }
    assert.ok(switchTime>5.3&&switchTime<5.5);
    for(const t of [switchTime-.01,switchTime,switchTime+.01]){
      const solutions=scenes.map(scene=>candidatePaths(scene).map(c=>solvePath(scene,source,listener,t,c)).filter(p=>p.status==='renderable'));
      assert.deepEqual(solutions[0],solutions[1],'coverage change cannot invent or alter a finite path near the switch');
      assert.ok(solutions[0].some(p=>p.order===1));assert.ok(solutions[0].some(p=>p.order===2));
      for(const p of solutions[0]){assert.ok(Math.abs(p.delay-p.distance/343)<1e-10);assert.ok(p.retardedResidual<1e-7);}
    }
  }
});
