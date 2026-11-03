import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sourceEngine05,sourceFrame05,sourceSession05} from './fixtures/SourcePreparation05.mjs';
import {budgetContexts042,budgetWorld042} from './fixtures/AcousticBudget042.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
async function drive(engine,{blocks=36,observations=f=>f,beforeBlock=async()=>{}}={}){
 const dry=createHash('sha256'),stereo=createHash('sha256');let sequence=1,next=.05,source=null,sourceFrame=null,histories=null,sourceStable=true,cursorContinuous=true,historyStable=true;
 for(let block=0;block<blocks;block++){
  const time=block*512/48000;engine.setWall(time*1000);await beforeBlock(block,time);
  if(time+1e-10>=next){engine.instance.accept(observations(sourceFrame05(sequence++,next)),Math.max(0,(time-next)*1000),200);next+=.05;}
  await engine.instance.render();for(const id of engine.instance.ids)dry.update(bytes(engine.instance.inputs[id]));stereo.update(bytes(engine.instance.left));stereo.update(bytes(engine.instance.right));
  const slot=engine.instance.slots.find(s=>s.source);if(slot){source??=slot.source;sourceStable&&=source===slot.source;if(sourceFrame!==null)cursorContinuous&&=slot.source.frame-sourceFrame===512;sourceFrame=slot.source.frame;
   histories??=engine.instance.pipeline.renderer.sourceList.map(s=>s.bands);historyStable&&=engine.instance.pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);}
 }
 return {dry:dry.digest('hex'),stereo:stereo.digest('hex'),sourceStable,cursorContinuous,historyStable,source,sourceFrame,rendererFrames:engine.instance.pipeline.renderer.frame};
}
function acceptFirst(engine){engine.instance.accept(sourceFrame05(0,0),0,200);}

test('opt-in control preparation consumes an untouched source with bit-identical dry/stereo PCM and no queue or render wait',async()=>{
 const baseline=sourceEngine05(),prepared=sourceEngine05({prepared:true});acceptFirst(baseline);acceptFirst(prepared);
 try{
  assert.throws(()=>baseline.instance.prepareSources05(),/Opt-in/);assert.equal('sourcePreparation05' in baseline.instance.diagnostics(),false);
  const result=await prepared.instance.prepareSources05();assert.equal(result.state,'prepared');assert.equal(result.prepared,1);assert.equal(prepared.constructions[0].insideRender,false);assert.equal(prepared.constructions[0].source.frame,0);assert.equal(prepared.constructions[0].source.stats.frames,0);
  const a=await drive(baseline),b=await drive(prepared);assert.equal(a.dry,b.dry);assert.equal(a.stereo,b.stereo);assert.equal(a.sourceFrame,b.sourceFrame);assert.equal(a.rendererFrames,b.rendererFrames);
  assert.equal(prepared.constructions.length,1);assert.equal(b.source,prepared.constructions[0].source);assert.equal(prepared.instance.diagnostics().stageCounters.sourceCreations,1);
  const d=prepared.instance.diagnostics().sourcePreparation05;assert.equal(d.consumed,1);assert.equal(d.fallbacks,0);assert.equal(d.sourceFramesAdvanced,0);assert.equal(d.pcmQueueFramesAdded,0);
 }finally{await baseline.instance.close();await prepared.instance.close();}
});
test('missing or expired readiness immediately follows unchanged construction without waiting for preparation',async()=>{
 for(const setup of ['not-prepared','expired']){const e=sourceEngine05({prepared:true});acceptFirst(e);try{
  if(setup==='expired')await e.instance.prepareSources05({validForMs:1});
  const result=await drive(e);assert(result.source);assert.equal(e.instance.diagnostics().sourcePreparation05.consumed,0);assert.equal(e.instance.diagnostics().sourcePreparation05.fallbacks,1);assert(e.constructions.at(-1).insideRender);
 }finally{await e.instance.close();}}
});
test('source generation, bank, profile and disappearance invalidate sample-zero readiness',async()=>{
 for(const change of ['generation','bank','profile','disappearance']){
  const profiles={profiles:{bati:{sourceGain:1}}},e=sourceEngine05({prepared:true,profiles});acceptFirst(e);
  try{await e.instance.prepareSources05();
   if(change==='bank')e.replaceBank();if(change==='profile')profiles.profiles.bati.sourceGain=.8;
   const observations=frame=>{if(change==='generation')frame.vehicles[0].generation=2;if(change==='disappearance'&&frame.listener.sequence===1)frame.vehicles=[];return frame;};
   const result=await drive(e,{observations});assert(result.source);assert.notEqual(result.source,e.constructions[0].source);assert.equal(e.instance.diagnostics().sourcePreparation05.consumed,0);assert.equal(e.constructions.length,2);
   if(change==='profile')assert.equal(result.source.gain,.8);
  }finally{await e.instance.close();}
 }
});
test('aborts, explicit cancellation and closure discard pending or ready sources without changing active lifecycle',async()=>{
 const pending=sourceEngine05({prepared:true});acceptFirst(pending);const controller=new AbortController(),work=pending.instance.prepareSources05({signal:controller.signal});controller.abort();assert.equal((await work).state,'cancelled');assert.equal(pending.constructions.length,0);await pending.instance.close();
 const closed=sourceEngine05({prepared:true});acceptFirst(closed);const closeWork=closed.instance.prepareSources05();await closed.instance.close();assert.equal((await closeWork).state,'cancelled');assert.equal(closed.constructions.length,0);assert.equal((await closed.instance.prepareSources05()).state,'closed');
 const e=sourceEngine05({prepared:true});acceptFirst(e);try{await e.instance.prepareSources05();e.instance.cancelPreparedSources05();const rendered=await drive(e);const source=rendered.source;e.instance.cancelPreparedSources05();assert.equal(e.instance.slots.find(s=>s.source).source,source);assert.equal(e.constructions.length,2);}finally{await e.instance.close();}
});
test('abort during construction and changed pending profile cannot publish stale readiness',async()=>{
 const controller=new AbortController(),aborted=sourceEngine05({prepared:true,onConstruct:()=>controller.abort()});acceptFirst(aborted);
 try{const result=await aborted.instance.prepareSources05({signal:controller.signal});assert.equal(result.state,'cancelled');assert.equal(aborted.instance.sourcePreparation05.stats.cancelled,1);assert.equal(aborted.instance.sourcePreparation05.ready.size,0);assert.equal(aborted.constructions[0].source.frame,0);}finally{await aborted.instance.close();}
 const profiles={profiles:{bati:{sourceGain:1}}},changed=sourceEngine05({prepared:true,profiles});acceptFirst(changed);
 try{const pending=changed.instance.prepareSources05();profiles.profiles.bati.sourceGain=.7;assert.equal((await pending).prepared,0);assert.equal(changed.constructions.length,0);}finally{await changed.instance.close();}
});
test('bounded preparation reuses two untouched candidates and rejects invalid limits without creating additional sources',async()=>{
 const e=sourceEngine05({prepared:true}),frame=sourceFrame05(0,0);frame.vehicles.push({...frame.vehicles[0],id:'second'}, {...frame.vehicles[0],id:'third'});e.instance.accept(frame,0,200);
 try{
  const initial=await e.instance.prepareSources05();assert.equal(initial.prepared,2);assert.equal(e.constructions.length,2);assert.equal(e.instance.sourcePreparation05.ready.size,2);
  const reused=await e.instance.prepareSources05();assert.equal(reused.reused,2);assert.equal(e.constructions.length,2);
  const third=await e.instance.prepareSources05({sourceIds:['third']});assert.equal(third.prepared,1);assert.equal(e.instance.sourcePreparation05.ready.size,2);assert(e.constructions.every(c=>c.source.frame===0));
  for(const options of [{maximum:3},{validForMs:251},{sourceIds:['same','same']},{signal:{}},{signal:null},{signal:false},{signal:0}])await assert.rejects(e.instance.prepareSources05(options));
  assert.equal(e.constructions.length,3);
 }finally{await e.instance.close();}
});
test('ready-signal cancellation and reversed control clocks invalidate readiness without advancing the source',async()=>{
 for(const kind of ['abort-ready','clock-reversal']){const controller=new AbortController(),e=sourceEngine05({prepared:true});acceptFirst(e);try{
  await e.instance.prepareSources05({signal:controller.signal});if(kind==='abort-ready')controller.abort();else{e.setWall(-1);assert.equal((await e.instance.prepareSources05()).state,'clock-unqualified');}
  const result=await drive(e);assert.notEqual(result.source,e.constructions[0].source);assert.equal(e.constructions[0].source.frame,0);assert.equal(e.instance.diagnostics().sourcePreparation05.consumed,0);
 }finally{await e.instance.close();}}
});
test('preparation refuses an active render and opt-in render failure releases its guard',async()=>{
 const e=sourceEngine05({prepared:true});acceptFirst(e);let release;const original=e.instance.pipeline.prepare;
 e.instance.pipeline.prepare=()=>new Promise(resolve=>release=resolve);
 const rendering=e.instance.render();
 try{assert.equal((await e.instance.prepareSources05()).state,'render-busy');assert.equal(e.constructions.length,0);await assert.rejects(e.instance.render(),/One opt-in/);release();await assert.rejects(rendering);assert.equal(e.instance.sourcePreparation05.rendering,false);}finally{e.instance.pipeline.prepare=original;await e.instance.close();}
});
test('prepared source cursor and renderer history survive moving cross-tile geometry, unknown regions, cancellation and expiry',async()=>{
 const e=sourceEngine05({prepared:true}),scene=new ScenePreparation03({session:sourceSession05,worldDigest:budgetWorld042});acceptFirst(e);
 try{
  await e.instance.prepareSources05();
  const attach=async options=>{const result=await scene.prepare({contexts:budgetContexts042(options),listenerAnchor:[-3,0,1],geometryTimeMs:options?.at??0});assert.equal(result.state,'prepared');e.instance.setPreparedResourceScene03(result.prepared.scene,{worldDigest:budgetWorld042,generation:result.prepared.generation});};
  await attach({});
  const result=await drive(e,{blocks:144,beforeBlock:async(block,time)=>{
   if(block===32)await attach({wall:true,at:time*1000});
   if(block===48){const abort=new AbortController(),work=scene.prepare({contexts:budgetContexts042(),listenerAnchor:[-3,0,1],geometryTimeMs:time*1000,signal:abort.signal});abort.abort();assert.equal((await work).state,'cancelled');}
   if(block===64)await attach({missing:true,at:time*1000});
   if(block===96)await attach({until:time*1000+40,at:time*1000});
  }});
  assert(result.sourceStable&&result.cursorContinuous&&result.historyStable);assert.equal(e.constructions.length,1);assert.equal(e.instance.pipeline.simulation.scene,e.instance.direct);assert.equal(e.instance.pipeline.renderer.frame,144*512);
  assert.equal(e.instance.diagnostics().pipeline.history.affectedFrames,0);assert.equal(e.instance.diagnostics().sourcePreparation05.pcmQueueFramesAdded,0);assert.equal(scene.stats.workersStarted,scene.stats.workersJoined);
 }finally{await e.instance.close();await scene.close();}
});
