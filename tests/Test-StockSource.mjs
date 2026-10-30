// Structural unit fixtures only; authentic source/decode proof is separate.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {stockPose,stockOperating,stockDirectScenes,stockDemonstrations} from '../tools/stock-source-01-scenario.mjs';
function fixture(){const asset={frames:8192,sampleRate:24000,samples:new Float32Array(8192).fill(.5)};
  return {model:'bati',layers:{engine:{idle:asset,accel:asset,decel:asset},exhaust:{idle:asset,accel:asset,decel:asset}}};}
const c={operatingPoint:.7,load:.8,running:true,lift:false};
function run(size,gain){const p=new StockVehicleSource(fixture(),{sourceGain:gain}),out=new Float32Array(48000),a=new Float32Array(512),b=new Float32Array(512);
  for(let at=0;at<out.length;at+=size){const n=Math.min(size,out.length-at);p.renderInto(c,a,b,n);out.set(a.subarray(0,n),at);}return {p,out};}
test('source playback is block-partition invariant and only applies declared linear pressure gain',()=>{
  const a=run(512,.25),b=run(128,.25),d=run(512,.5),calibrated=run(512,2);
  assert.deepEqual(a.out,b.out);for(let i=0;i<a.out.length;i++){assert.equal(d.out[i],a.out[i]*2);assert.equal(calibrated.out[i],a.out[i]*8);}
  assert.ok(Math.abs(a.out.at(-1)-.0625)<1e-8);assert.equal(a.p.stats.oscillatorSamples,0);
});
test('aliased outputs, fractional frames and invalid state reject before mutating playback',()=>{
  const p=new StockVehicleSource(fixture()),buffer=new Float32Array(1024),a=buffer.subarray(0,512),b=buffer.subarray(256,768);
  assert.throws(()=>p.renderInto(c,a,b));assert.equal(p.frame,0);
  assert.throws(()=>p.renderInto(c,a,new Float32Array(512),12.5));assert.equal(p.frame,0);
  assert.throws(()=>p.renderInto({...c,lift:1},a,new Float32Array(512)));assert.equal(p.frame,0);
  const source=p.voices.engine.idle.samples;
  assert.throws(()=>p.renderInto(c,source.subarray(0,512),new Float32Array(512)));assert.equal(p.frame,0);
  assert.throws(()=>new StockVehicleSource(fixture(),{sourceGain:2.001}));
});
test('four authored flybys stay bounded, continuous and model-specific without pitch or pass effects',()=>{
  const scenes=stockDirectScenes();
  for(const model of Object.keys(stockDemonstrations)){
    assert.equal(stockPose(model,5.3,true).position[0],0);
    assert.equal(stockPose(model,5.3,true).speed,stockDemonstrations[model].maximumSpeed);
    for(let t=.01;t<10.29;t+=.037){const p=stockPose(model,t,true),delta=(stockPose(model,t+1e-5,true).position[0]-stockPose(model,t-1e-5,true).position[0])/2e-5;
      assert.ok(Math.abs(delta-p.speed)<1e-6);assert.ok(Math.abs(p.acceleration)<12);
      const scene=scenes[t<5.3?0:1];assert.ok(p.position[0]-2>scene.tile.bounds.min[0]&&p.position[0]+2<scene.tile.bounds.max[0]);
      const state=stockOperating(t,true);assert.ok(state.operatingPoint>=0&&state.operatingPoint<=1);
    }
  }
});
