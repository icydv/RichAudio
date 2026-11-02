import test from 'node:test';
import assert from 'node:assert/strict';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {quietWindows} from '../tools/audio/acoustic-world-continuity-replay.mjs';
const FS=48000,BLOCK=512,session='a'.repeat(32);

async function run(policy){
 const asset={frames:8192,sampleRate:24000,samples:new Float32Array(8192).fill(.1),nativePeak:.1};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
 let wall=0,sequence=0,next=0,source=null,previousFrame=null,pausedSourceBlocks=0,unavailableListenerBlocks=0;
 const e=new StockGameplay({registry:{resolve:()=>({status:'available',bank}),createSource:()=>new StockVehicleSource(bank)},session,now:()=>wall,continuityPolicy:policy==='baseline'?'baseline':'camera-source-01'});
 // Test-only ablations independently restore each original reset. The shipped
 // policy has no caller-controlled partial-history or weakened-safety mode.
 if(policy==='source-history-only')e.playout.preserveGenerationHistory=false;
 const pcm=[new Float32Array(180*BLOCK),new Float32Array(180*BLOCK)];
 try{for(let block=0;block<180;block++){
   const time=block*BLOCK/FS;wall=time*1000;
   if(time+1e-10>=next){if(Math.abs(next-1)>.001){const ticks=10000000+Math.round(next*10000000),generation=next>=1.05?2:1;
     const f={version:1,session,listener:{version:1,session,generation,sequence:sequence++,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(next*1000),position:[generation===1?0:20,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},vehicles:[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:[0,10,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};
     e.accept(f,Math.max(0,(time-next)*1000),200);if(policy==='listener-history-only'&&Math.abs(next-1.05)<.001)e.snapshots=e.snapshots.slice(-1);
    }next+=.05;}
   const channels=await e.render();for(let c=0;c<2;c++)pcm[c].set(channels[c],block*BLOCK);
   const current=e.slots.find(s=>s.source)?.source;if(current){if(source===current&&current.frame===previousFrame)pausedSourceBlocks++;source=current;previousFrame=current.frame;}
   if(time>.9&&time<1.4&&!e.sample.state)unavailableListenerBlocks++;
  }
  const d=e.diagnostics();return {policy,sourceCreations:d.arrivals,pausedSourceBlocks,unavailableListenerBlocks,quiet:quietWindows(pcm).filter(w=>w.startFrame>FS/2&&w.startFrame<FS*1.5),historyFaults:d.pipeline.history.affectedFrames};
 }finally{e.close();}
}

test('camera ablations separate listener rewarming from loss of independent source history',async t=>{
 const results={};for(const policy of ['baseline','source-history-only','listener-history-only','camera-source-01'])results[policy]=await run(policy);
 assert.ok(results.baseline.pausedSourceBlocks>0);assert.equal(results['source-history-only'].pausedSourceBlocks,0,'independent source history avoids grain-clock pause even during listener rewarming');
 assert.ok(results['source-history-only'].unavailableListenerBlocks>results['camera-source-01'].unavailableListenerBlocks,'listener history retention independently removes avoidable warmup');
 assert.ok(results['listener-history-only'].sourceCreations>1,'listener-only retention cannot preserve a source whose pose brackets were discarded');
 assert.equal(results['camera-source-01'].sourceCreations,1);assert.equal(results['camera-source-01'].pausedSourceBlocks,0);
 assert.ok(results['camera-source-01'].quiet[0].frames<results.baseline.quiet[0].frames);for(const r of Object.values(results))assert.equal(r.historyFaults,0);
 t.diagnostic(JSON.stringify({kind:'original-authored-camera-ablation',results}));
});
