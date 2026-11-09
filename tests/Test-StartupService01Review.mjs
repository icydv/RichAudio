import test from 'node:test';
import assert from 'node:assert/strict';
import {StartupAcousticWorldService01} from '../src/acoustics/world/startup-service01.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';

test('automatic bounded continuation covers every declared tile without player travel and restarts from verified cache',async()=>{
 const h=await startupHarness06(),fixture=startupWorld06();let cold,warm;
 try{
  const first=h.create(fixture);cold=new StartupAcousticWorldService01({coordinator:first,workTilesPerTurn:2,yieldMilliseconds:0});
  cold.start({listener:fixture.locations[0].listener});const built=await cold.completion;
  assert.equal(built.preparation.completedEligibleTiles,fixture.locations.length);assert.equal(built.turns,6);
  assert.equal(built.stage,'ready-within-declared-coverage');assert.equal(built.installedWorldVerified,false);assert.equal(built.actualWorldCoverage,'unmeasured');assert.ok(built.residentContexts<=8);
  const trusted=built.preparation.checkpointSHA256;await cold.close();
  const second=h.create(fixture,{trustedCheckpointSHA256:trusted});warm=new StartupAcousticWorldService01({coordinator:second,workTilesPerTurn:3,yieldMilliseconds:0});warm.start({listener:fixture.locations.at(-1).listener});
  const reused=await warm.completion;assert.equal(reused.preparation.cacheHits,fixture.locations.length);assert.equal(reused.preparation.workersStarted,0);assert.equal(reused.preparation.inputLoads,0);
  assert.equal(reused.stage,'ready-within-declared-coverage');assert.equal(reused.window.selected[0].tileId,fixture.locations.at(-1).tileId);
 }finally{await cold?.close();await warm?.close();await h.close();}
});

test('close during yielded background build cannot checkpoint a closed coordinator or race an explicit window refresh',async()=>{
 const h=await startupHarness06(),fixture=startupWorld06();let service,closePromise,refreshGuard;
 try{
  const coordinator=h.create(fixture);
  service=new StartupAcousticWorldService01({coordinator,workTilesPerTurn:1,yieldMilliseconds:20,onStatus:s=>{
   if(s.turns===1&&s.stage==='building-missing-regions'&&!closePromise){
    refreshGuard=assert.rejects(service.refreshWindow(),/idle prepared-world runtime refresh/);
    closePromise=service.close();
   }
  }});
  service.start();const completed=await service.completion;await closePromise;await refreshGuard;
  assert.equal(completed.closed,true);assert.equal(completed.failure,null);assert.equal(completed.stage,'stopped');assert.equal(completed.preparation.completedEligibleTiles,1);
  assert.equal(completed.preparation.unresolvedControlOperations,0);assert.equal(completed.lastClose.workerJoined,true);
 }finally{await service?.close();await h.close();}
});

test('new listener window supersedes an in-flight cache selection before it can publish old geometry',async()=>{
 const h=await startupHarness06(),fixture=startupWorld06();let service;
 try{
  const coordinator=h.create(fixture),published=[];service=new StartupAcousticWorldService01({coordinator,workTilesPerTurn:12,yieldMilliseconds:0,onWindow:w=>published.push(w)});
  service.start();await service.completion;assert.equal(published.length,0);
  const load=coordinator.loadPrepared.bind(coordinator);let supersede=true;
  coordinator.loadPrepared=async options=>{const loaded=await load(options);if(supersede){supersede=false;service.updateWindow({listener:fixture.locations.at(-1).listener,radius:0});}return loaded;};
  service.updateWindow({listener:fixture.locations[0].listener,radius:0});await service.refreshWindow();
  assert.equal(published.length,0,'old asynchronous selection is discarded');
  await service.refreshWindow();assert.equal(published.length,1);assert.equal(published[0].selection.selected[0].tileId,fixture.locations.at(-1).tileId);
  assert.equal(published[0].windowRevision,service.windowRevision);
 }finally{await service?.close();await h.close();}
});
