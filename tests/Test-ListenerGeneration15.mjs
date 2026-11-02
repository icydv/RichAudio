import test from 'node:test';
import assert from 'node:assert/strict';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {createStockVehiclePipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {conditionalStockScene} from '../src/acoustics/engine/contracts.mjs';

const session='c'.repeat(32),FS=48000,BLOCK=512;
function frame(sequence,generation,ticks,position=0){
 return {version:1,session,listener:{version:1,session,generation,sequence,
  observationTicks:ticks,clockFrequency:10000000,gameTimeMs:sequence*50,
  position:[position,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],
  listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,
  reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},
 vehicles:[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',
  position:[sequence,10,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};
}
test('new listener generation clears vehicle pose brackets and preserves source ownership',()=>{
 let wall=0;const gameplay=new StockGameplay({registry:{},session,now:()=>wall});
 try{
  gameplay.accept(frame(0,1,10000000),0,200);
  gameplay.pipeline.renderer.frame=2400;wall=50;gameplay.accept(frame(1,1,10500000),0,200);
  assert.equal(gameplay.snapshots.length,2);
  gameplay.pipeline.renderer.frame=4800;wall=100;gameplay.accept(frame(2,2,11000000,1000),0,200);
  assert.equal(gameplay.snapshots.length,1);
  assert.equal(gameplay.playout.records.length,1);
  assert.equal(gameplay.vehiclesAt(.075).length,0,'old source pose cannot be interpolated through camera reset');
  const current=gameplay.vehiclesAt(.1);assert.equal(current.length,1);
  assert.equal(current[0].id,'bati');assert.equal(current[0].generation,1,'camera reset does not replace vehicle identity');
  assert.deepEqual(current[0].position,[2,10,1]);
  assert.equal(gameplay.playout.sample(.15,wall).state,null,'listener waits for its real new-generation presentation time');
 }finally{gameplay.close();}
});
test('camera generation resets causal Doppler history and isolates old PCM to the bounded release',async()=>{
 const ids=['stock:camera:engine','stock:camera:exhaust'];
 const pipeline=createStockVehiclePipeline({scene:conditionalStockScene(ids,session),sourceIds:ids,
  quality:'performance',acceleration:'cpu',masterGain:.175,continuousRates:true});
 const inputs=Object.fromEntries(ids.map(id=>[id,new Float32Array(BLOCK)])),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK);
 let beforeGeneration,oldPeak=0,afterPeak=0;
 try{
  for(let block=0;block<130;block++){
   const time=block*BLOCK/FS,cut=block>=80;
   const listener={generation:cut?2:1,position:[cut?100:time*4,0,1],velocity:[cut?0:4,0,0],forward:[0,1,0],up:[0,0,1],valid:true};
   const sources=ids.map(id=>({id,generation:1,position:[10,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:true,emitting:true}));
   const control=await pipeline.prepare({time,session,generation:cut?2:1,listener,sources});
   if(block===79)beforeGeneration=control.sourceGenerations[ids[0]];
   if(block===80){
    assert.equal(pipeline.simulation.records.length,1,'pre-cut source/listener propagation brackets are cleared');
    assert.equal(pipeline.simulation.previous.size,0,'pre-cut retarded-time/rate smoothing is cleared');
    assert.notEqual(control.sourceGenerations[ids[0]],beforeGeneration,'same source owns a new spatial PCM epoch');
    assert.equal(pipeline.renderer.sources.get(ids[0]).generationFrame,80*BLOCK);
   }
   for(const input of Object.values(inputs))input.fill(cut?0:.02);
   pipeline.process(inputs,left,right);
   const peak=Math.max(...left.map(Math.abs),...right.map(Math.abs));
   if(!cut)oldPeak=Math.max(oldPeak,peak);
   // Existing20 ms release can finish with pre-cut samples. At three blocks
   // after the cut no old PCM can be replayed into the new spatial generation.
   if(block>=83)afterPeak=Math.max(afterPeak,peak);
  }
  assert.ok(oldPeak>0,'real old-generation PCM reached the renderer');
  assert.equal(afterPeak,0,'new silent input cannot replay old spatial history');
  assert.equal(pipeline.renderer.stats.limited,0);
  assert.equal(pipeline.renderer.historyDiagnostics.affectedFrames,0);
 }finally{pipeline.close();}
});
