// Independent end-to-end cache validity control, corrupting only new original
// test cache bytes after startup has successfully verified them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../src/acoustics/world/contracts.mjs';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {createWorldCoverageSnapshot06} from '../tools/soundmap/worldcoverage06.mjs';
test('known runtime cache corruption withdraws ready coverage and cannot remain a green prepared tile',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);
 try{
  const ready=await c.run(),remote=f.locations.at(-1),page=f.pages.find(p=>p.pageId===remote.pageId),plan=page.inventory.tilePlans.find(t=>t.tileId===remote.tileId);
  assert.equal(ready.readiness,'ready-supported-subset');const file=path.join(h.root,'.local','tiles',digest({kind:'RichAudioStableTileShard06',tileId:remote.tileId}),plan.planDigest+'.raworld04');assert(path.resolve(file).startsWith(path.resolve(h.root)+path.sep));await fs.appendFile(file,'original-test-corruption');
  const result=await c.loadPrepared(remote);assert.equal(result.state,'cache-rejected');const p=createWorldCoverageSnapshot06(c);assert.equal(p.eligibleComplete,false);assert.equal(p.readiness,'partial');assert.equal(p.completedEligibleTiles,11);assert.equal(p.tiles.find(t=>t.tileId===remote.tileId).status,'failed');assert.equal(p.tiles.find(t=>t.tileId===remote.tileId).artifactDigest,null);assert.equal(c.continuePartially().readiness,'partial');
 }finally{await h.close();}
});
