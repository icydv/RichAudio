import test from 'node:test';
import assert from 'node:assert/strict';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {StartupAcousticWorldService01} from '../src/acoustics/world/startup-service01.mjs';
test('automatic chunks prioritise the initial surroundings then finish every declared tile without travel',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),windows=[],statuses=[];try{const c=h.create(f),s=new StartupAcousticWorldService01({coordinator:c,workTilesPerTurn:2,yieldMilliseconds:0,onStatus:x=>statuses.push(x),onWindow:x=>windows.push(x)}),remote=f.locations.at(-1);s.start({listener:remote.listener});const final=await s.completion;
  assert.equal(final.turns,6);assert.equal(final.preparation.completedEligibleTiles,12);assert.equal(final.preparation.workersStarted,12);assert.equal(final.preparation.workersJoined,12);assert.equal(final.stage,'ready-within-declared-coverage');assert.equal(final.buildIndependentOfTravel,true);assert(windows[0].contexts.some(x=>x.tileId===remote.tileId));assert(statuses.some(x=>x.preparation.completedEligibleTiles>0&&x.preparation.completedEligibleTiles<12));assert(final.residentContexts<=8);assert.equal(final.installedWorldVerified,false);assert.equal(final.pcmQueueFramesAdded,0);await s.close();
 }finally{await h.close();}
});
test('automatic warm restart does not decode unchanged inputs; one changed collision rebuilds only its tile',async()=>{
 const h=await startupHarness06();try{const f=startupWorld06(),first=new StartupAcousticWorldService01({coordinator:h.create(f),yieldMilliseconds:0});first.start();const a=await first.completion;await first.close();const second=new StartupAcousticWorldService01({coordinator:h.create(f,{trustedCheckpointSHA256:a.preparation.checkpointSHA256}),yieldMilliseconds:0});second.start();const b=await second.completion;assert.equal(b.preparation.workersStarted,0);assert.equal(b.preparation.cacheHits,12);assert.equal(b.preparation.inputLoads,0);await second.close();const changed=new StartupAcousticWorldService01({coordinator:h.create(startupWorld06({changedYbn:true}),{trustedCheckpointSHA256:b.preparation.checkpointSHA256}),yieldMilliseconds:0});changed.start();const d=await changed.completion;assert.equal(d.preparation.workersStarted,1);assert.equal(d.preparation.cacheHits,11);assert.equal(d.preparation.completedEligibleTiles,12);await changed.close();
 }finally{await h.close();}
});
test('runtime windows use persisted contexts without converting or publishing a superseded selection',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),windows=[];try{const c=h.create(f),s=new StartupAcousticWorldService01({coordinator:c,yieldMilliseconds:0,onWindow:x=>windows.push(x)});s.start();await s.completion;const before=c.snapshot().workersStarted;let release,entered;const started=new Promise(r=>entered=r),original=c.loadPrepared.bind(c);c.loadPrepared=async(...args)=>{entered();await new Promise(r=>release=r);return original(...args);};const old=s.updateWindow({listener:f.locations[0].listener,radius:1}),refresh=s.refreshWindow();await started;const current=s.updateWindow({listener:f.locations.at(-1).listener,radius:1});assert(current>old);release();await refresh;assert.equal(windows.length,0);c.loadPrepared=original;await s.refreshWindow();assert.equal(windows.length,1);assert.equal(windows[0].windowRevision,current);assert(windows[0].contexts.some(x=>x.tileId===f.locations.at(-1).tileId));assert.equal(c.snapshot().workersStarted,before);await s.close();
 }finally{await h.close();}
});
test('partial supported work never promotes undiscovered or unsupported installed-world coverage',async()=>{
 const h=await startupHarness06();try{const s=new StartupAcousticWorldService01({coordinator:h.create(startupWorld06({unsupported:true,incompleteDiscovery:true})),yieldMilliseconds:0});s.start();const p=await s.completion;assert.equal(p.stage,'partial/unsupported');assert.equal(p.preparation.completedEligibleTiles,11);assert.equal(p.preparation.unsupportedTiles,1);assert.equal(p.preparation.percent,null);assert.equal(p.preparation.unknownRegions.length,1);assert.equal(p.installedWorldVerified,false);await s.close();
 }finally{await h.close();}
});
test('unload between chunks joins cleanly, retains completed cache, and prevents an overlapping refresh',async()=>{
 const h=await startupHarness06();try{let ready;const first=new Promise(r=>ready=r),c=h.create(startupWorld06()),s=new StartupAcousticWorldService01({coordinator:c,workTilesPerTurn:1,yieldMilliseconds:100,onStatus:p=>{if(p.preparation.completedEligibleTiles===1)ready();}});s.start();await first;await assert.rejects(s.refreshWindow(),/idle prepared/);const stopped=await s.close();await s.completion;assert.equal(stopped.closed,true);assert.equal(stopped.lastClose.controlClosureUnknown,false);assert.equal(c.snapshot().completedEligibleTiles,1);assert.equal(c.snapshot().workersStarted,c.snapshot().workersJoined);assert.equal(s.snapshot().failure,null);
 }finally{await h.close();}
});
