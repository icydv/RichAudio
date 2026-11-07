// Original cache/bank fixtures. Controlled async completion proves rejection
// boundaries; these small correctness checks make no performance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
import {budgetSession042} from './fixtures/AcousticBudget042.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
async function until(predicate,limit=8000){const start=performance.now();while(!predicate()){assert(performance.now()-start<limit,'Bounded actual-consumer startup');await wait(5);}}
async function context01(){
 const fixture=installedSceneFixture01(),run=await originalAirflowEngineStreet01({enabled:false}),engine=run.engine;engine.now=()=>performance.now();let sequence=0,handover=true,forgeryChecked=false,error=null,latest=null;
 const acceptFrame=({x=0,extraTraffic=false}={})=>{const at=performance.now(),frame=airflowFrameStreet01(sequence++,at/1000,{speed:0});frame.listener.position=[x,0,1];for(const v of frame.vehicles)v.position=[x-1,0,1];if(extraTraffic)frame.vehicles.push({...frame.vehicles[0],id:'second',position:[1,0,1],riderAttached:false,riderViewAttached:false},{...frame.vehicles[0],id:'unselected-third',position:[100,0,1],riderAttached:false,riderViewAttached:false});engine.accept(frame,0,200);return at;};
 const observe=()=>{const at=acceptFrame();service.updateWindow({listener:[0,0,1],sources:[[-1,0,1]],generation:1,geometryTimeMs:at,durationMs:1000,engine:engine.direct.config});};
 const service=new InstalledSceneService01({config:fixture.config,session:budgetSession042,onScene:(scene,receipt)=>{
  latest={scene,receipt};if(!handover)return;
  try{
   if(!forgeryChecked){forgeryChecked=true;assert.throws(()=>{engine.installedSceneService01=null;},TypeError);assert.throws(()=>{engine.installedSceneStopped01=false;},TypeError);engine.installedApplicationPermit01=scene;assert.throws(()=>engine.setInstalledStaticScene01(scene,{expiresAt:receipt.expiresAt}),/readiness gate/);delete engine.installedApplicationPermit01;engine.queueInstalledStaticScene01(scene,{...receipt});assert.throws(()=>engine.applyPendingInstalledStaticScene01(),/original source-bound installed consumer receipt/);assert.equal(engine.pipeline.simulation.scene,engine.direct);assert(Object.isFrozen(receipt));}
   engine.queueInstalledStaticScene01(scene,receipt);engine.applyPendingInstalledStaticScene01();
  }catch(e){error=e;}
 }});engine.bindInstalledSceneService01(service);observe();let timer=setInterval(observe,200);
 try{await until(()=>error||engine.installedSceneDiagnostics01.accepted>0);if(error)throw error;assert.equal(service.readinessSnapshot01().state,'active');assert(engine.installedSceneDiagnostics01.withheld>=3);handover=false;clearInterval(timer);timer=null;return {engine,service,fixture,observe,acceptFrame,get latest(){return latest;},async close(){clearInterval(timer);const stopAt=performance.now();engine.beginStopInstalledScene01(stopAt);service.beginStop01(stopAt);assert.equal((await service.close()).workerJoined,true);await run.close();fixture.close();}};}
 catch(e){clearInterval(timer);await service.close();await run.close();fixture.close();throw e;}
}

test('expiry during async preparation cannot commit stale paths; fallback preserves source/grain history',{timeout:12000},async()=>{
 const c=await context01(),{engine,service}=c;
 try{
  c.observe();for(let block=0;block<256&&!engine.slots.some(s=>s.source);block++)await engine.render();const slot=engine.slots.find(s=>s.source);assert(slot);const source=slot.source,band=engine.pipeline.renderer.sources.get('stock:slot0:engine').bands[0],beforeFrame=source.frame,observations=engine.pipeline.simulation.stats.observations;
  const original=engine.pipeline.simulation.updateAccelerated.bind(engine.pipeline.simulation);let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);let first=true;
  engine.pipeline.simulation.updateAccelerated=async(...args)=>{const result=await original(...args);if(first){first=false;started();await gate;}return result;};
  const accepted=[];const accept=engine.pipeline.renderer.accept.bind(engine.pipeline.renderer);engine.pipeline.renderer.accept=control=>{accepted.push({scene:engine.pipeline.simulation.scene,control});return accept(control);};
  const rendering=engine.render();await entered;await wait(Math.max(1,engine.sceneExpiry-performance.now()+10));assert.equal(engine.staticSceneBinding,null,'expired scene loses its consumer binding even without a new observation');release();await rendering;
  assert.equal(accepted.length,1,'Only re-prepared direct fallback reaches the renderer');assert.equal(accepted[0].scene,engine.direct);assert(accepted[0].control.paths.every(p=>p.order===0));
  assert.equal(engine.pipeline.simulation.stats.observations,observations+1,'Fallback uses the already observed block');assert.equal(slot.source,source);assert.equal(source.frame,beforeFrame+512,'No second grain/source advance');assert.equal(engine.pipeline.renderer.sources.get('stock:slot0:engine').bands[0],band);assert.equal(engine.installedSceneDiagnostics01.continuityFailures,1);assert.equal(service.readinessSnapshot01().counters.validityGaps,1);assert.equal(engine.pipeline.simulation.scene,engine.direct);
 }finally{await c.close();}
});

test('stop during async preparation prevents renderer acceptance and PCM processing',{timeout:12000},async()=>{
 const c=await context01(),{engine,service}=c;
 try{
  c.observe();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),original=engine.pipeline.simulation.updateAccelerated.bind(engine.pipeline.simulation);
  engine.pipeline.simulation.updateAccelerated=async(...args)=>{const control=await original(...args);entered();await gate;return control;};
  let accepts=0,processes=0;const accept=engine.pipeline.renderer.accept.bind(engine.pipeline.renderer),process=engine.pipeline.process.bind(engine.pipeline);engine.pipeline.renderer.accept=c=>{accepts++;return accept(c);};engine.pipeline.process=(...args)=>{processes++;return process(...args);};
  const frame=engine.pipeline.renderer.frame,rendering=engine.render();await started;const stopAt=performance.now();engine.beginStopInstalledScene01(stopAt,'controlled-stop');service.beginStop01(stopAt,'controlled-stop');await engine.close();release();await rendering;
  assert.equal(accepts,0);assert.equal(processes,0);assert.equal(engine.pipeline.renderer.frame,frame);assert.equal(engine.installedSceneDiagnostics01.stopAt,stopAt);assert.equal(service.readinessSnapshot01().stopIntentAt,stopAt);assert.equal(engine.beginStopInstalledScene01(performance.now()+50),stopAt,'Stop boundary cannot move');assert.throws(()=>service.updateWindow({}),/active installed scene service/);
 }finally{await c.close();}
});

test('late old-region candidate cannot reactivate after movement; unselected traffic does not starve readiness',{timeout:12000},async()=>{
 const c=await context01(),{engine,service}=c;
 try{
  c.acceptFrame({extraTraffic:true});assert.equal(service.readinessSnapshot01().state,'active','Third unselected running vehicle is outside the bounded request source set');
  const previous=c.latest.receipt.requestId;c.observe();await until(()=>c.latest.receipt.requestId!==previous);const late=c.latest;
  // The original stationary fixture now supplies a separate genuine test
  // observation33m away, after enough elapsed time for its declared movement.
  await wait(400);c.acceptFrame({x:33});assert.equal(engine.pipeline.simulation.scene,engine.direct);
  engine.queueInstalledStaticScene01(late.scene,late.receipt);assert.equal(engine.applyPendingInstalledStaticScene01(),false);const outcome=engine.installedSceneDiagnostics01.recent.at(-1);assert.equal(outcome.reason,'outside-candidate-workset');assert.equal(outcome.withheld,true);assert.equal(outcome.validationCompleted,false);assert.equal(engine.pipeline.simulation.scene,engine.direct);
 }finally{await c.close();}
});

test('withheld candidate records a complete transaction overrun as rejection, never normal preparation',{timeout:4000},async()=>{
 const fixture=installedSceneFixture01(),engine=new StockGameplay({registry:{resolve(){throw Error('No bank');},createSource(){throw Error('No PCM source');}},session:budgetSession042});let measured=null,error=null;
 const frame=airflowFrameStreet01(0,0,{speed:0});frame.listener.position=[0,0,1];frame.vehicles[0].position=[-1,0,1];engine.accept(frame,0,200);
 const service=new InstalledSceneService01({config:fixture.config,session:budgetSession042,onScene:(scene,receipt)=>{try{engine.queueInstalledStaticScene01(scene,receipt);const accepted=engine.applyPendingInstalledStaticScene01();measured={accepted,outcome:engine.installedSceneDiagnostics01.recent.at(-1)};}catch(e){error=e;}}});engine.bindInstalledSceneService01(service);
 const acknowledge=service.recordConsumerOutcome01.bind(service);service.recordConsumerOutcome01=(...args)=>{const result=acknowledge(...args),until=performance.now()+12;while(performance.now()<until){}return result;};
 try{service.updateWindow({listener:[0,0,1],sources:[[-1,0,1]],generation:1,geometryTimeMs:performance.now(),durationMs:1000,engine:engine.direct.config});await until(()=>measured||error);if(error)throw error;assert.equal(measured.accepted,false);assert.equal(measured.outcome.reason,'consumer-transaction-budget-overrun');assert.equal(measured.outcome.withheld,false);assert.equal(measured.outcome.transactionBudgetOverrun,true);assert.equal(engine.installedSceneDiagnostics01.transactionOverruns,1);assert.equal(engine.installedSceneDiagnostics01.rejected,1);assert.equal(engine.pipeline.simulation.scene,engine.direct);}
 finally{await engine.close();assert.equal((await service.close()).workerJoined,true);fixture.close();}
});

test('coalesced and cancelled pending candidates retain discard receipts without fabricated application or training',{timeout:12000},async()=>{
 const c=await context01(),{engine,service}=c;
 try{
  const previous=c.latest.receipt.requestId;c.observe();await until(()=>c.latest.receipt.requestId!==previous);const first=c.latest;engine.queueInstalledStaticScene01(first.scene,first.receipt);
  const before=service.readinessSnapshot01().counters,warm=before.warmSamples,applications=before.applications;c.observe();await until(()=>c.latest.receipt.requestId!==first.receipt.requestId);const second=c.latest;engine.queueInstalledStaticScene01(second.scene,second.receipt);
  const discarded=engine.installedSceneDiagnostics01.recent.find(r=>r.requestId===first.receipt.requestId&&r.reason==='coalesced-before-application');assert(discarded);assert.equal(discarded.applicationAt,null);assert.equal(discarded.applied,false);assert.equal(engine.installedSceneDiagnostics01.coalesced,1);assert.equal(service.readinessSnapshot01().counters.warmSamples,warm);assert.equal(service.readinessSnapshot01().counters.applications,applications);
  const stopAt=performance.now();engine.beginStopInstalledScene01(stopAt,'pending-cancellation');assert.equal(engine.pendingInstalledStaticScene01,null);assert.equal(engine.installedSceneDiagnostics01.discardedBeforeApplication,2);assert.equal(service.readinessSnapshot01().counters.warmSamples,warm);assert(engine.installedSceneDiagnostics01.recent.some(r=>r.requestId===second.receipt.requestId&&r.applicationAt===null&&r.reason==='pending-cancellation'));
 }finally{await c.close();}
});
