import test from 'node:test';
import assert from 'node:assert/strict';
import {createStockVehiclePipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {conditionalStockScene} from '../src/acoustics/engine/contracts.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
const FS=48000,BLOCK=512,energy=a=>a.reduce((sum,x)=>sum+x*x,0);

test('local rider pressure shares output attenuation and disable while remaining outside propagation',()=>{
 const ids=['stock:review:engine','stock:review:exhaust'],session='8'.repeat(32);
 const pipeline=createStockVehiclePipeline({scene:conditionalStockScene(ids,session),sourceIds:ids,masterGain:.175});
 const inputs=Object.fromEntries(ids.map(id=>[id,new Float32Array(BLOCK)])),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK);
 const local=[new Float32Array(BLOCK).fill(.1),new Float32Array(BLOCK).fill(-.05)];
 try{
  pipeline.process(inputs,left,right,BLOCK,null,null,local);
  assert.equal(left[0],Math.fround(Math.fround(.1)*.175));assert.equal(right[0],Math.fround(Math.fround(-.05)*.175));
  assert.equal(pipeline.renderer.activePaths,0,'local rider pressure creates no reflected/direct path');
  pipeline.renderer.setOutputPreferences({richAudioEnabled:true,outputLevel:.4});
  for(let i=0;i<60;i++)pipeline.process(inputs,left,right,BLOCK,null,null,local);
  assert.equal(left[BLOCK-1],Math.fround(Math.fround(.1)*.4*.175));
  pipeline.renderer.setOutputPreferences({richAudioEnabled:false,outputLevel:1});
  for(let i=0;i<60;i++)pipeline.process(inputs,left,right,BLOCK,null,null,local);
  assert.ok(left.every(x=>x===0)&&right.every(x=>x===0),'main-mod output disable also silences local input');
  assert.throws(()=>pipeline.process(inputs,left,right,BLOCK,null,null,[left,local[1]]),/independent local/);
  assert.equal(pipeline.renderer.stats.limited,0);
 }finally{pipeline.close();}
});

test('coasting engine-off Bati still emits speed-dependent exterior aero without local rider evidence',async()=>{
 const f=await originalAirflowEngineStreet01();let observed=0;
 try{
  for(let block=0;block<75;block++){
   const time=block*BLOCK/FS;f.setWall(time*1000);
   if(block%4===0)f.engine.accept(airflowFrameStreet01(block/4,time,{running:false,rider:false,pass:true}),0,150);
   await f.engine.render();observed+=energy(f.engine.inputs['stock:slot0:aero']);
   assert.equal(energy(f.engine.localAirflow[0])+energy(f.engine.localAirflow[1]),0);
  }
  assert.ok(observed>0,'physical movement relative to air is independent of combustion');
  assert.equal(f.engine.diagnostics().sourceStates[0].running,false);
  assert.equal(f.engine.diagnostics().pipeline.renderer.limited,0);
 }finally{await f.close();}
});

test('legacy packets cannot qualify rider-local airflow merely by selecting player bank context',async()=>{
 const f=await originalAirflowEngineStreet01();let exterior=0;
 try{
  for(let block=0;block<65;block++){
   const time=block*BLOCK/FS;f.setWall(time*1000);
   if(block%4===0){const frame=airflowFrameStreet01(block/4,time);delete frame.vehicles[0].riderAttached;delete frame.vehicles[0].riderViewAttached;f.engine.accept(frame,0,150);}
   await f.engine.render();exterior+=energy(f.engine.inputs['stock:slot0:aero']);
   assert.equal(energy(f.engine.localAirflow[0])+energy(f.engine.localAirflow[1]),0);
  }
  assert.ok(exterior>0);assert.equal(f.engine.diagnostics().airflow.riderActive,false);
 }finally{await f.close();}
});
