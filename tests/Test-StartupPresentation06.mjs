import test from 'node:test';
import assert from 'node:assert/strict';
import {startupLoadingPresentation06} from '../src/acoustics/world/startup-presentation06.mjs';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
test('owned startup label uses measured eligible work and never claims a native loading gate',async()=>{
 const h=await startupHarness06();try{const labels=[],c=h.create(startupWorld06(),{onProgress:p=>labels.push(startupLoadingPresentation06(c))});assert.equal(startupLoadingPresentation06(c).percent,0);const result=await c.run();assert.equal(result.completedEligibleTiles,12);assert(labels.some(p=>p.percent>0&&p.percent<100&&p.text===`Warming up acoustic cache — ${p.percent}%`));const ready=startupLoadingPresentation06(c);assert.equal(ready.staticSubsetPrepared,true);assert.equal(ready.nativeLoadingLabelModified,false);assert.equal(ready.gameplayGateConnected,false);assert.equal(ready.actualWorldCoverage,'unmeasured');assert.equal(ready.actions.automaticRetry,false);assert.throws(()=>startupLoadingPresentation06({...c}),/branded/);}finally{await h.close();}
});
test('incomplete discovery remains indeterminate and cancellation offers explicit partial recovery rather than ready',async()=>{
 const h=await startupHarness06();try{const incomplete=h.create(startupWorld06({incompleteDiscovery:true,unsupported:true}));assert.equal(startupLoadingPresentation06(incomplete).indeterminate,true);await incomplete.run();const partial=startupLoadingPresentation06(incomplete);assert.equal(partial.percent,null);assert.equal(partial.staticSubsetPrepared,false);assert.equal(partial.actions.continuePartiallyAvailable,true);assert(partial.work.unknownRegions>0);assert.equal(partial.work.unsupported,1);
  const stopped=h.create(startupWorld06()),signal=AbortSignal.abort();await stopped.run({signal});const cancelled=startupLoadingPresentation06(stopped);assert.equal(cancelled.readiness,'cancelled');assert.equal(cancelled.staticSubsetPrepared,false);assert.equal(cancelled.actions.continuePartiallyAvailable,true);assert.equal(cancelled.viewerCanPublishAcoustics,false);
 }finally{await h.close();}
});
