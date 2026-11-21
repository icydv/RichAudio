// Device-free reference checks for the original CPU/GPU comparison geometry.
// These tests do not claim GPU execution or measured GTA geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {scenario} from '../tools/acoustics-08-2-scenes.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
import {qualityPresets,qualityReflectors} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {inBox} from '../src/acoustics/research/local-geometry.mjs';

function warmed(f){
  const sim=new CausalSimulation(f.scene);
  for(let tick=0;tick<=50;tick++)sim.observe(f.snapshot(tick/50));
  return sim;
}

test('authored benchmark worlds are deterministic, bounded and preserve smooth pose identities',()=>{
  for(const name of ['small','enclosure','demanding']){
    const f=scenario(name,{sources:4}),again=scenario(name,{sources:4});
    assert.equal(f.scene.geometryKey,again.scene.geometryKey);assert.equal(f.scene.tile.coverage,'complete-synthetic');
    assert.ok(f.scene.tile.surfaces.every(s=>s.provenance.kind==='synthetic'&&s.validUntil>=30000));
    const start=f.snapshot(0);
    for(let tick=0;tick<=600;tick++){
      const time=tick/20,s=f.snapshot(time),previous=f.snapshot(Math.max(0,time-.05));
      assert.deepEqual(s,again.snapshot(time));
      assert.equal(s.session,start.session);assert.equal(s.generation,start.generation);
      assert.ok(inBox(s.listener.position,f.scene.tile.bounds));
      assert.ok(Math.abs(Math.hypot(...s.listener.forward)-1)<1e-12);
      assert.ok(Math.hypot(...s.listener.position.map((x,i)=>x-previous.listener.position[i]))<.01);
      for(const source of s.sources){assert.ok(inBox(source.position,f.scene.tile.bounds));assert.equal(source.generation,1);}
    }
  }
  assert.equal(scenario('demanding').scene.tile.surfaces.length,128);
  assert.throws(()=>scenario('demanding',{sources:17}));assert.throws(()=>scenario('demanding',{sources:0}));
  assert.throws(()=>scenario('unknown'));assert.throws(()=>scenario('small').snapshot(61));
});

test('all four budgets select genuine direct/first/second-order paths from the same demanding world',()=>{
  const f=scenario('demanding',{sources:4}),counts=[];
  for(const [quality,pathBudget] of Object.entries(qualityPresets)){
    const sim=warmed(f);sim.setProcessingSettings({pathBudget,maxReflectors:qualityReflectors[quality]});
    const prepared=sim.prepareUpdate(1),control=sim.completeUpdate(prepared);
    counts.push(control.paths.length);
    assert.equal(new Set(control.paths.map(p=>p.id)).size,control.paths.length);
    assert.deepEqual([...new Set(control.paths.map(p=>p.order))].sort(),[0,1,2]);
    for(const sourceId of f.sourceIds){
      const selected=control.paths.filter(p=>p.sourceId===sourceId);
      assert.equal(selected.length,pathBudget);assert.ok(selected.some(p=>p.order===0));
    }
    for(const p of control.paths){
      assert.ok(Math.abs(p.distance-p.delay*343)<1e-10);
      assert.ok(p.delay>=0&&p.delay<=2&&Math.abs(p.pan)<=1);
      assert.ok(p.bands.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
    }
    assert.ok(prepared.segments.length<=4096);assert.equal(control.stats.resets,1);
  }
  assert.deepEqual(counts,[48,64,128,256]);
});

test('a sixteen-source maximum scene remains within the bounded visibility batch',()=>{
  const f=scenario('demanding',{sources:16}),sim=warmed(f);
  sim.setProcessingSettings({pathBudget:64,maxReflectors:16});
  const prepared=sim.prepareUpdate(1);assert.ok(prepared.segments.length<=4096);
  const control=sim.completeUpdate(prepared);
  assert.ok(control.paths.length<=16*64);assert.ok(control.paths.length>16*32);
  assert.equal(control.stats.resets,1);
});
