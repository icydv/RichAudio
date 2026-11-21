import test from 'node:test';import assert from 'node:assert/strict';
import {prepareOriginalWorldPreview041} from '../tools/Preview-AcousticWorld041.mjs';
import {checkCachedAcousticWorld041} from '../tools/soundmap/ui/model.mjs';
test('original encrypted catalogue associations reach the existing importer/cache/scene worker/solver and readonly viewer',async()=>{
 const p=await prepareOriginalWorldPreview041();try{
  assert.equal(p.fixture.bindings.length,3);assert(p.fixture.bindings.every(b=>b.basis==='original-authored-fixture-association-not-installed-ownership'));
  assert.equal(p.fixture.catalog.encryptionTag,0x0fefffff);assert.equal(p.fixture.catalog.memberPayloadsRead,0);assert.equal(p.fixture.catalog.enhancedCompatibilityVerified,false);
  checkCachedAcousticWorld041(p.cache);assert.equal(p.cache.tiles.find(t=>t.tileId==='west').surfaces[0].vertices.length,3);assert.equal(p.cache.tiles.find(t=>t.tileId==='east').state,'unsupported-or-unknown');
  const reflected=p.sample.soundMapFrame.paths.filter(path=>path.status==='selected'&&path.order>0);assert(reflected.length>0,'actual selected solver reflection required');
  assert.equal(p.sample.soundMapGeometry.generation,p.sample.soundMapFrame.geometryGeneration,'first viewer publication retains exact warmup geometry');
  for(const ray of reflected){assert(ray.surfaceIds.length>0);assert(ray.vertices.length>=3);assert(Math.abs(ray.delay-ray.distance/343)<1e-8);}
  assert.deepEqual(p.cache.paths,[],'cache inspection cannot author rays');assert.equal(p.cache.alignment.acousticSession,p.sample.soundMapFrame.listenerSessionId);assert.equal(p.sample.soundMapFrame.coordinateSpace,p.cache.coordinateSpace);
  assert.equal(p.builder.stats.workersStarted,p.builder.stats.workersJoined);assert.equal(p.preparation.stats.workersStarted,p.preparation.stats.workersJoined);
 }finally{await p.close();}
});
