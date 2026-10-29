import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityNames,qualityPresets,qualityReflectors,validateAcousticSettings,acousticDefaults,AcousticQualityController} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {acousticScene,ownedSource,bounds} from '../src/acoustics/engine/contracts.mjs';
import {prepare} from '../src/acoustics/engine/renderer.mjs';
import {fixture} from '../tools/acoustics-06-scenes.mjs';

test('five quality positions and three acceleration modes validate independently',()=>{
  assert.deepEqual(qualityNames,['auto','performance','balanced','quality','max']);
  assert.deepEqual(Object.values(qualityPresets),[12,16,32,64]);
  for(const acousticQuality of qualityNames)for(const acousticAcceleration of ['auto','cpu','gpu'])
    assert.deepEqual(validateAcousticSettings({acousticQuality,acousticAcceleration}),{...acousticDefaults,acousticQuality,acousticAcceleration});
  assert.deepEqual(validateAcousticSettings(),acousticDefaults);
  for(const v of [null,[],{acousticQuality:'Ultra'},{acousticAcceleration:'CUDA'},{quality:'max'},{acousticQuality:null}])
    assert.throws(()=>validateAcousticSettings(v));
});

test('explicit scene budgets admit 12/16/32/64 while retaining original default ceilings',()=>{
  const f=fixture('enclosure');
  assert.equal(f.scene.config.maxPaths,12);assert.equal(f.scene.config.maxReflectors,8);
  const source=ownedSource({id:'original-quality-test',pcm:new Float32Array(4800).fill(.01),track:f.track});
  const counts=[];
  for(const [name,maxPaths] of Object.entries(qualityPresets)){
    const scene=acousticScene(f.scene.tile,f.scene.materials,{...f.scene.config,maxPaths,maxReflectors:qualityReflectors[name]});
    const plan=prepare(scene,[source],f.listener,{duration:.1});
    counts.push(plan.prepared[0].tracks.length);
    assert.equal(plan.prepared[0].tracks[0].id,'direct');
    assert.ok(plan.prepared[0].tracks.every(p=>p.entries.every(e=>e===null||e.order<=2)));
  }
  // This finite six-surface scene genuinely supports 21 paths. A Max ceiling
  // must not manufacture 43 more echoes to fill its capacity.
  assert.deepEqual(counts,[12,16,21,21]);
  assert.equal(bounds.paths,64);assert.equal(bounds.reflectors,16);
  assert.throws(()=>acousticScene(f.scene.tile,f.scene.materials,{maxPaths:65}));
  assert.throws(()=>acousticScene(f.scene.tile,f.scene.materials,{maxReflectors:17}));
});

const paths=(frame,count,prefix='same')=>Array.from({length:count},(_,i)=>({
  id:i===0?'s:direct':`s:${prefix}-${i}`,sourceId:'s',generation:1,
  emissionFrame:frame-1024-i*3,rate:1,bands:[.01,.008,.006],pan:i===0?0:(i/count)*1.6-.8,
}));
function block(r,count,prefix='same'){
  const frame=r.frame,left=new Float32Array(512),right=new Float32Array(512),input=new Float32Array(512);
  for(let i=0;i<input.length;i++)input[i]=.03*Math.sin(2*Math.PI*95*(frame+i)/48000);
  r.accept({frame,sourceGenerations:{s:1},paths:frame<2048?[]:paths(frame,count,prefix)});
  r.process({s:input},left,right);return [left,right];
}

test('quality-capable 64-path pool preserves original twelve-path samples and default storage',()=>{
  const original=new StreamingRenderer({sourceIds:['s'],historyDiagnostics:true});
  const configurable=new StreamingRenderer({sourceIds:['s'],maxPathsPerSource:12,pathCapacityPerSource:64,historyDiagnostics:true});
  assert.equal(original.ownedArrayBytes,2881152);
  assert.equal(original.slots.length,24);assert.equal(configurable.slots.length,128);
  assert.ok(configurable.ownedArrayBytes<original.ownedArrayBytes+8192);
  for(let n=0;n<60;n++)assert.deepEqual(block(configurable,12),block(original,12));
  assert.equal(configurable.stats.pathOverflow,0);assert.equal(configurable.stats.cursorResets,0);
});

test('live quality changes retain source rings and use bounded old-path release banks',()=>{
  const renderer=new StreamingRenderer({sourceIds:['s'],maxPathsPerSource:64,pathCapacityPerSource:64,historyDiagnostics:true});
  const source=renderer.sources.get('s'),storage=source.bands.map(b=>b.buffer),frameTags=source.frames,generationTags=source.generations;
  const ownedBytes=renderer.ownedArrayBytes;let maximumStep=0,previous=0,nonzero=false;
  function run(count,prefix,blocks){
    renderer.setPathBudget(count);
    for(let n=0;n<blocks;n++)for(const channel of block(renderer,count,prefix)){
      for(const x of channel){assert.ok(Number.isFinite(x)&&Math.abs(x)<.98);maximumStep=Math.max(maximumStep,Math.abs(x-previous));previous=x;nonzero||=x!==0;}
    }
  }
  run(64,'a',12);assert.equal(renderer.activePaths,64);
  run(64,'b',1);assert.ok(renderer.activePaths>64&&renderer.activePaths<=128);
  run(64,'b',2);assert.equal(renderer.activePaths,64);
  run(12,'b',3);assert.equal(renderer.activePaths,12);
  run(32,'c',3);assert.equal(renderer.activePaths,32);
  run(16,'c',3);assert.equal(renderer.activePaths,16);
  run(64,'d',3);assert.equal(renderer.activePaths,64);
  assert.ok(nonzero);assert.ok(maximumStep<.01);
  for(let i=0;i<storage.length;i++)assert.equal(source.bands[i].buffer,storage[i]);
  assert.equal(source.frames,frameTags);assert.equal(source.generations,generationTags);
  assert.equal(source.generation,1);assert.equal(source.generationFrame,0);
  assert.equal(renderer.ownedArrayBytes,ownedBytes);assert.equal(renderer.stats.pathOverflow,0);
  assert.equal(renderer.stats.cursorResets,0);assert.equal(renderer.stats.limited,0);assert.equal(renderer.historyDiagnostics.affectedFrames,0);
  assert.throws(()=>renderer.setPathBudget(65));assert.throws(()=>renderer.setPathBudget(0));
  assert.throws(()=>new StreamingRenderer({maxPathsPerSource:64,pathCapacityPerSource:32}));
});

test('one source cannot consume another source path budget and controls remain bounded',()=>{
  const r=new StreamingRenderer({sourceIds:['s','other'],maxPathsPerSource:12,pathCapacityPerSource:64});
  assert.throws(()=>r.accept({frame:0,paths:paths(0,13)}),/per-source/);
  assert.equal(r.stats.controlUpdates,0);assert.equal(r.activePaths,0);
  assert.throws(()=>r.accept({frame:0,paths:[...paths(0,1),...paths(0,1)]}),/identity/);
  const fixed=new StreamingRenderer({sourceIds:['s']});assert.throws(()=>fixed.setPathBudget(16));
});

test('Auto quality rises only after useful measured headroom and steps down without oscillation',()=>{
  let now=0;const q=new AcousticQualityController({now:()=>now});
  assert.equal(q.diagnostics().activeQuality,'performance');
  const sample={processingMs:1,cpuMs:.8,gpuMs:.1,queueMs:.1,availablePaths:80,activeBackend:'gpu'};
  for(now=0;now<8000;now+=50)q.observe(sample,now);
  now=7999;q.observe(sample,now);assert.equal(q.diagnostics().pathBudget,12);
  now=8000;q.observe(sample,now);assert.equal(q.diagnostics().pathBudget,16);
  now=8001;q.observe({...sample,processingMs:12},now);assert.equal(q.diagnostics().pathBudget,16);
  now=10000;q.observe({...sample,processingMs:12},now);assert.equal(q.diagnostics().pathBudget,12);
  now=11000;q.observe(sample,now);assert.equal(q.diagnostics().pathBudget,12);
  assert.equal(q.diagnostics().qualityChanges,2);assert.equal(q.diagnostics().qualityDeadlineMisses,2);
  assert.equal(q.diagnostics().measuredBackend,'gpu');
  // No reason to increase a budget while the geometry has only three valid paths.
  now=40000;q.observe({...sample,availablePaths:3},now);assert.equal(q.diagnostics().pathBudget,12);
  now=60000;q.observe({...sample,availablePaths:3},now);assert.equal(q.diagnostics().pathBudget,12);
});

test('severe Auto overrun bypasses the downgrade dwell while later upgrades still require fresh headroom',()=>{
  let now=0;const q=new AcousticQualityController({now:()=>now});
  for(now=0;now<=8000;now+=50)q.observe({processingMs:1,availablePaths:80},now);
  assert.equal(q.diagnostics().activeQuality,'balanced');now=8051;
  q.observe({processingMs:30,availablePaths:80},now);
  assert.equal(q.diagnostics().activeQuality,'performance');assert.equal(q.diagnostics().qualityReason,'severe-deadline-pressure');
  now=8052;q.observe({processingMs:1,availablePaths:80},now);assert.equal(q.diagnostics().activeQuality,'performance');
});

test('Auto cannot infer sustained headroom from missing or sparse timing samples',()=>{
  let now=0;const q=new AcousticQualityController({now:()=>now});
  q.observe({processingMs:.1,availablePaths:80},now);
  now=8000;q.observe({processingMs:.1,availablePaths:80},now);
  now=16000;q.observe({processingMs:.1,availablePaths:80},now);
  assert.equal(q.diagnostics().activeQuality,'performance');
  assert.equal(q.diagnostics().qualityHeadroomSamples,1);
});

test('fixed quality ignores adaptive pressure; invalid Auto measurements fail conservatively',()=>{
  let now=0;const q=new AcousticQualityController({selected:'max',now:()=>now});
  q.observe({processingMs:100,deadlineMiss:true,availablePaths:80},now);
  assert.equal(q.diagnostics().activeQuality,'max');assert.equal(q.diagnostics().pathBudget,64);
  now=2000;q.select('auto',now);q.observe({processingMs:20,availablePaths:80},now);
  assert.equal(q.diagnostics().activeQuality,'performance');
  now=2100;q.observe({processingMs:NaN},now);assert.equal(q.diagnostics().activeQuality,'performance');
  assert.equal(q.diagnostics().invalidQualityMeasurements,1);
  assert.throws(()=>q.select('cinematic',now));assert.throws(()=>q.observe({processingMs:1},now-1));
});
