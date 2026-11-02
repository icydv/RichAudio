import test from 'node:test';import assert from 'node:assert/strict';
import {originalResourceFixture02} from './fixtures/WorldResources02.mjs';
import {createExplicitResourceScene02,effectiveExplicitResources02} from '../src/acoustics/world/resource-scene02.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {collisionFixture02} from '../src/acoustics/collisions/fixtures.mjs';
import {createAuthoredCollisionEvent} from '../src/acoustics/collisions/contracts.mjs';
import {renderCollisionFixture02} from '../src/acoustics/collisions/render.mjs';
test('ordinary normalized YMAP/YTYP/YBN fixture placement creates exact finite triangle supports',()=>{
 const result=createExplicitResourceScene02(originalResourceFixture02());assert.equal(result.state,'qualified-original-resource-fixture');assert.equal(result.metadata.placedInstances,1);assert.equal(result.metadata.finiteTriangleSupports,1);
 assert.equal(querySegment(result.scene.tile,[2,3,1],[2,5,1]).hits.length,1);assert.equal(querySegment(result.scene.tile,[2.95,3,1.9],[2.95,5,1.9]).hits.length,0);assert.equal(result.installedWorldVerified,false);assert.equal(result.metadata.cacheSchema,'richaudio-explicit-resource-static-v2');
});
test('explicit mount override/tombstone and acoustic binding revisions participate in cache identity',()=>{
 const f=originalResourceFixture02(),before=createExplicitResourceScene02(f),override=structuredClone(f.resources[0]);override.id='custom-map';override.order=1;override.normalized.sourceSHA256=override.sha256='e'.repeat(64);override.normalized.data.entities[0].position[0]=5;
 const after=createExplicitResourceScene02({...f,resources:[...f.resources,override]});assert.notEqual(before.worldDigest,after.worldDigest);assert.equal(after.scene.tile.surfaces[0].center[0],5);
 assert.equal(createExplicitResourceScene02({...f,resources:[...f.resources,{...override,deleted:true}]}).state,'unqualified-resource-set');
 const materials=structuredClone(f.materialTable);materials[7].reflection=[.6,.4,.2];assert.notEqual(createExplicitResourceScene02({...f,materialTable:materials}).worldDigest,before.worldDigest);
 assert.throws(()=>effectiveExplicitResources02([...f.resources,{...f.resources[0],id:'ambiguous'}]),/ambiguous/);
});
test('unsupported maps, unverified collision links, missing resources/materials and unknown geometry never become empty clear space',()=>{
 const f=originalResourceFixture02();assert.equal(createExplicitResourceScene02({...f,resources:[]}).state,'unqualified-resource-set');assert.equal(createExplicitResourceScene02({...f,bindings:[]}).state,'unqualified-placement');assert.equal(createExplicitResourceScene02({...f,materialTable:{}}).state,'unqualified-material');
 const mlo=structuredClone(f);mlo.resources[0].normalized.data.unsupportedEntities=1;assert.throws(()=>createExplicitResourceScene02(mlo),/MLO/);
 const unsupported=structuredClone(f);unsupported.resources[2].normalized.data.nodes[0].unsupportedBound=true;unsupported.resources[2].normalized.data.nodes[0].declaredBounds={min:[-1,-1,-1],max:[1,1,1]};assert.throws(()=>createExplicitResourceScene02(unsupported),/unknown/);
 const live=structuredClone(f);live.resources[0].normalized.sourceAuthority='separately-authorized-explicit-resource';assert.throws(()=>createExplicitResourceScene02(live),/only original/);
});
test('a component-identified collision gets genuine reflection timing from the resource triangle in the existing renderer',async()=>{
 const f=collisionFixture02('high-energy',{seconds:.8}),raw=structuredClone(f.events[0]);raw.contact.position=[2,3,1];f.events=[createAuthoredCollisionEvent(raw,f.context)];f.listener.position=[2,2,1];
 const options=originalResourceFixture02();options.session=f.context.session;options.listenerAnchor=f.listener.position;const resource=createExplicitResourceScene02(options);
 const reflected=await renderCollisionFixture02(f,{scene:resource.scene,late:false}),open=await renderCollisionFixture02(f,{late:false});
 assert.equal(reflected.summary.environment,'explicit-original-resource-scene');assert.equal(reflected.summary.sources[0].pcmSha256,open.summary.sources[0].pcmSha256);assert.notEqual(reflected.summary.outputSha256,open.summary.outputSha256);
 const reflectedPath=reflected.summary.firstQualifiedPaths.find(p=>p.order===1);assert(reflectedPath);assert(Math.abs(reflectedPath.distance-3)<1e-8);assert(Math.abs(reflectedPath.delayFrames-3/343*48000)<1e-8);
 assert.equal(reflected.summary.diagnostics.renderer.limited,0);assert.equal(reflected.summary.diagnostics.history.affectedFrames,0);
});
