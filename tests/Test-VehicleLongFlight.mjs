import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acousticScene, conditionalStockScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile, coordinateSpace, timeUnit} from '../src/acoustics/research/local-geometry.mjs';
import {VehicleAcousticPipeline} from '../src/acoustics/vehicle/pipeline.mjs';

const id = 'stock:travel:exhaust';
const session = '8e132734a59e470da46f927c26338925';
const rate = 48000, block = 512, speedOfSound = 343;
const source = [1029,0,1], receiver = [0,0,1];

const direct = (maxDelay) => conditionalStockScene([id],session,{maxDelay});
async function render({scene, seconds, listenerAt = () => receiver, sourceAt = () => source,
    velocity = [0,0,0], cameraCut = Infinity, replaceEmitter = Infinity,
    discardAt = Infinity, noObservationAt = Infinity, pressure = i => i===rate/4 ? .75 : 0, reflectedOnly = false}) {
  const n = Math.ceil(rate*seconds/block)*block;
  const left = new Float32Array(n), right = new Float32Array(n);
  const pcm = new Float32Array(block);
  const ratios = [];
  const pipeline = new VehicleAcousticPipeline({scene,sourceIds:[id],continuousRates:true,
    preserveSourceHistoryOnListenerCut:true,
    controlFilter: reflectedOnly ? control => ({...control,paths:control.paths.filter(p=>p.order===1)}) : null});
  try {
    for(let at=0;at<n;at+=block){
      const t=at/rate;
      if(t>=discardAt&&t-block/rate<discardAt) pipeline.renderer.discardSourcePcm(id);
      const control=await pipeline.prepare({time:t,session,generation:t>=cameraCut?2:1,
        listener:{position:listenerAt(t),forward:[1,0,0]},sources:t>=noObservationAt?[]:
          [{id,generation:t>=replaceEmitter?2:1,position:sourceAt(t),velocity}]});
      ratios.push(...control.paths.map(p=>p.rate));
      for(let i=0;i<block;i++)pcm[i]=pressure(at+i);
      pipeline.process({[id]:pcm},left.subarray(at,at+block),right.subarray(at,at+block));
    }
    return {left,right,ratios,report:pipeline.diagnostics(),historyFrames:pipeline.renderer.historyFrames};
  } finally {pipeline.close();}
}

test('an opted-in >2 s wave reaches the actual new receiver at retarded delay',async()=>{
  const scene=direct(4);
  const result=await render({scene,seconds:3.7,cameraCut:1.5,listenerAt:t=>t<1.5?receiver:[-34.3,0,1]});
  const arrival=Math.round((.25+3.1)*rate);
  const first=result.left.findIndex(x=>Math.abs(x)>1e-7);
  assert.ok(Math.abs(first-arrival)<=1,`retained emission arrives only after the new path flight time: ${first} vs ${arrival}`);
  assert.ok(result.historyFrames>=4*rate);
  assert.equal(result.report.history.affectedFrames,0);
  assert.equal(result.report.renderer.limited,0);
  const baseline=await render({scene:direct(2),seconds:3.7});
  assert.equal(baseline.left.some(v=>v!==0),false,'the default scene still enforces its original travel limit');
  const defaultPipe=new VehicleAcousticPipeline({scene:direct(2),sourceIds:[id]});
  try{
    assert.equal(defaultPipe.renderer.historyFrames,2.5*rate);
    assert.throws(()=>defaultPipe.replaceScene(scene),/retained history/);
  }finally{defaultPipe.close();}
});

test('extended delay never revives previous-lifetime or discarded revision PCM', async()=>{
  for(const scope of [{replaceEmitter:1}, {discardAt:1}, {noObservationAt:1}]){
    const result=await render({scene:direct(4),seconds:3.6,cameraCut:1.5,...scope});
    assert.equal(result.left.some(v=>v!==0),false);
    assert.equal(result.right.some(v=>v!==0),false);
  }
});

test('long flight has separate time and paired PCM memory limits',()=>{
  const sourceIds=Array.from({length:16},(_,i)=>'stock:slot'+i+':exhaust');
  const scene=conditionalStockScene(sourceIds,session,{maxDelay:8});
  assert.throws(()=>direct(8.01),/delay\/update budget/);
  assert.throws(()=>new VehicleAcousticPipeline({scene,sourceIds}),/PCM history budget/);
  assert.throws(()=>new VehicleAcousticPipeline({scene,sourceIds:sourceIds.slice(0,8),directStem:true}),/PCM history budget/);
  const defaultSource=new VehicleAcousticPipeline({scene:direct(2)});
  try {assert.deepEqual([...defaultSource.renderer.sources.keys()],['beacon']);}
  finally {defaultSource.close();}
});

function wallScene() {
  const tile = createTile({schemaVersion:1,id:'moving-reflection',coordinateSpace,timeUnit,
    bounds:{min:[-2,-16,-3],max:[120,16,11]},listenerAnchor:[10,0,1],coverage:'complete-synthetic',
    surfaces:[{id:'wall',coordinateSpace,center:[0,0,4],normal:[1,0,0],u:[0,1,0],half:[12,5],
      motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'long-flight-control'},
      confidence:1,version:1,observedAt:0,validUntil:10000,material:{observedId:null,observedConfidence:null,acoustic:null}}],
    missingRegions:[],version:1,createdAt:0,validUntil:10000,build:'long-flight-control',
    session:'long-flight-control',interior:'outdoors',dynamicEpoch:0});
  return acousticScene(tile,{wall:{reflection:[.8,.8,.8]}},{order:1,maxDelay:3});
}

test('receiver frequency follows one physical Doppler factor on a moving reflected path',async()=>{
  const hz=800,v=20,expected=hz*speedOfSound/(speedOfSound+v);
  const result=await render({scene:wallScene(),seconds:2,listenerAt:()=>[10,0,1],
    sourceAt:t=>[45+v*t,0,1],velocity:[v,0,0],reflectedOnly:true,pressure:i=>.3*Math.sin(2*Math.PI*hz*i/rate)});
  const settled=result.ratios.slice(-40);
  assert.equal(settled.length,40);
  assert.ok(settled.every(x=>Math.abs(x-expected/hz)<1e-9));
  const crossings=[];
  for(let i=rate;i<rate*1.8;i++){
    const a=result.left[i-1], b=result.left[i];
    if(a<=0&&b>0)crossings.push(i-1-a/(b-a));
  }
  assert.ok(crossings.length>500);
  const measured=(crossings.length-1)*rate/(crossings.at(-1)-crossings[0]);
  assert.ok(Math.abs(measured-expected)<.02,'stereo waveform has one retardation rate');
  assert.equal(result.report.history.affectedFrames,0);
});
