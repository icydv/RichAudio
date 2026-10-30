import{test}from'node:test';import assert from'node:assert/strict';
import{StreamingRenderer}from'../src/acoustics/streaming/causal.mjs';
import{VehicleAcousticPipeline}from'../src/acoustics/vehicle/pipeline.mjs';
import{createUrbanEnvironment}from'../src/acoustics/vehicle/urban-environment.mjs';
const FS=48000,BLOCK=512;
async function render(gains,only='exhaust'){
 const ids=['engine','exhaust'],scene=createUrbanEnvironment({width:12,duration:3}).scene;
 const p=new VehicleAcousticPipeline({scene,sourceIds:ids,sourcePressureGains:gains,directStem:true});
 const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK),dl=new Float32Array(BLOCK),dr=new Float32Array(BLOCK),out=[],direct=[];
 try{for(let at=0;at<FS*2;at+=BLOCK){const n=Math.min(BLOCK,FS*2-at),time=at/FS;
   const control=await p.prepare({time,session:'pressure-calibration',generation:1,listener:{position:[0,0,1.4],velocity:[0,0,0]},sources:ids.map(id=>({id,generation:1,position:[-8,0,1.4],velocity:[0,0,0],directivity:0}))});
   for(let i=0;i<n;i++){const value=.1*Math.sin(2*Math.PI*113*(at+i)/FS);e[i]=only==='engine'?value:0;x[i]=only==='exhaust'?value:0;}
   p.process({engine:e,exhaust:x},l,r,n,dl,dr);out.push(...l.subarray(0,n));direct.push(...dl.subarray(0,n));
   assert.ok(control.paths.every(q=>q.bands.every(v=>v<=1)));}
   return{out,direct,diag:p.diagnostics(),history:p.renderer.sources.get(only).bands.map(b=>Float32Array.from(b))};
 }finally{p.close();}
}
test('exhaust reference-pressure calibration scales every genuine arrival once and preserves original histories',async()=>{
 const base=await render({}),explicit=await render({exhaust:1}),raised=await render({exhaust:2.5});
 assert.deepEqual(base.out,explicit.out,'unit calibration is bit-identical');
 for(let i=0;i<base.out.length;i++){assert.ok(Math.abs(raised.out[i]-2.5*base.out[i])<2e-8);assert.ok(Math.abs(raised.direct[i]-2.5*base.direct[i])<2e-8);}
 assert.deepEqual(base.history,raised.history);assert.equal(raised.diag.renderer.limited,0);assert.equal(raised.diag.history.affectedFrames,0);
 const engineBase=await render({},'engine'),engineRaised=await render({exhaust:2.5},'engine');assert.deepEqual(engineBase.out,engineRaised.out,'engine calibration stays unchanged');
});
test('source pressure calibration validates identity/bounds and is immutable for the renderer lifetime',()=>{
 for(const gains of [{unknown:2},{exhaust:NaN},{exhaust:0},{exhaust:4.01},[]])assert.throws(()=>new StreamingRenderer({sourceIds:['engine','exhaust'],sourcePressureGains:gains}));
 const gains={exhaust:2.5},renderer=new StreamingRenderer({sourceIds:['engine','exhaust'],sourcePressureGains:gains});gains.exhaust=4;assert.equal(renderer.sourcePressureGains.exhaust,2.5);assert.ok(Object.isFrozen(renderer.sourcePressureGains));
});
