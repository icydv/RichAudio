// Reuses the established authored packets for admission regressions. Actual
// CodeWalker archive decoding is exercised separately by the companion test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {canonical,digest,byteDigest} from '../src/acoustics/world/contracts.mjs';
import {pinNativeReview08,admitNativeBatch08,nativeQualificationDigest08,nativeConversionWitness08} from '../src/acoustics/world/native-evidence08.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {loadWorldCoverageInspection06,createWorldCoverageSolver06} from '../tools/soundmap/worldcoverage06.mjs';
import {checkCachedAcousticWorld041} from '../tools/soundmap/ui/model.mjs';

function originalReviewedBatch(){
 const f=worldResources04(),input=structuredClone(f.inventory),tile=input.tiles[0];input.tiles=[tile];input.resources=input.resources.filter(r=>r.scopeTiles.includes(tile.tileId));input.mounts=input.mounts.filter(m=>m.id==='base');input.inputFormat='codewalker-native08';input.origin='separately-authorized-installed-metadata';
 for(const r of input.resources){const p=f.inputs.decodedResources[r.id],n=JSON.parse(p.decodedJson);n.sourceAuthority='separately-authorized-explicit-resource';p.sourceAuthority=n.sourceAuthority;p.decodedJson=JSON.stringify(n);p.decodedSHA256=byteDigest(Buffer.from(p.decodedJson));}
 tile.bindings=tile.bindings.map(b=>({...b,basis:'reviewed-native-association08',physicsDictionary:987654321,sourceSHA256:digest('original-association-control'),collisionFrame:'archetype-local'}));
 const body={schema:1,kind:'RichAudioNativeWitness08',tileId:tile.tileId,build:input.build,bounds:tile.bounds,layout:'gen9',parserSHA256:input.parser.sha256,resources:input.resources.map(r=>({id:r.id,path:r.path,kind:r.kind,mount:r.mount,sha256:r.sha256,bytes:r.bytes,decodedSHA256:f.inputs.decodedResources[r.id].decodedSHA256})),mounts:input.mounts,bindings:tile.bindings,materialTable:tile.materialTable,collisionFrame:'archetype-local',sourceScopeSHA256:digest('original-scope'),sourceReceiptSHA256:digest('original-joined-receipt'),coordinateReceiptSHA256:digest('original-coordinate-control'),associationReceiptSHA256:digest('original-association-control'),activation:'static-runtime-unverified'};
 const witness={...body,qualificationDigest:nativeQualificationDigest08(body)},policyBytes=Buffer.from(canonical({schema:1,kind:'RichAudioNativeReview08',purpose:'offline-static-cache-only',witnessSHA256:byteDigest(Buffer.from(canonical(nativeConversionWitness08(witness)))),reviewReceiptSHA256:digest('original-review-control')})),reviewPolicy=pinNativeReview08(policyBytes,{expectedSHA256:byteDigest(policyBytes)}),admission=admitNativeBatch08({witness,reviewPolicy});
 return {...f,input,witness,policyBytes,reviewPolicy,admission,inventory:qualifyResourceInventory04(input,{nativeAdmission08:admission})};
}
test('native evidence cannot self-admit, mutate a reviewed resource, or relabel its parser/layout',()=>{
 const f=originalReviewedBatch();assert.throws(()=>qualifyResourceInventory04(f.input),/branded native/);assert.throws(()=>qualifyResourceInventory04(f.input,{nativeAdmission08:{...f.admission}}),/branded native/);
 assert.throws(()=>admitNativeBatch08({witness:f.witness,reviewPolicy:{...f.reviewPolicy}}),/branded/);assert.throws(()=>pinNativeReview08(f.policyBytes,{expectedSHA256:'0'.repeat(64)}),/pinned/);
 const changed=structuredClone(f.input);changed.resources[0].sha256='1'.repeat(64);assert.throws(()=>qualifyResourceInventory04(changed,{nativeAdmission08:f.admission}),/exact reviewed/);
 changed.resources=f.input.resources;changed.layout='legacy';assert.throws(()=>qualifyResourceInventory04(changed,{nativeAdmission08:f.admission}),/native scope/);
});
test('reviewed native packets use existing workers/cache/SoundMap/solver while remaining derived and partial',async()=>{
 const f=originalReviewedBatch(),h=await startupHarness06(),pageId='native-page',fixture={catalogueId:'authored-native-admission08',pages:[{pageId,inventory:f.inventory}],session:f.session,discovery:{sealed:true,totalKnown:true,basis:'explicit-qualified-inventory-pages',unknownRegions:[]},pageProvider:async()=>({inventory:f.inventory,inputs:f.inputs})};let solver;
 try{const c=h.create(fixture),done=await c.run();assert.equal(done.completedEligibleTiles,1);assert.equal(done.readiness,'partial');const tileId=f.input.tiles[0].tileId,inspection=await loadWorldCoverageInspection06({coordinator:c,pageId,tileId,inventory:f.inventory});
  assert.equal(inspection.tile.authority,'admitted-native-static-subset08');assert.equal(inspection.tile.engineTile.coverage,'partial');assert(inspection.tile.engineTile.surfaces.every(s=>s.provenance.kind==='derived'));assert.equal(inspection.context.authority,'review-policy-static-native08');
  const view=checkCachedAcousticWorld041(inspection.geometry);assert.equal(view.authority,'reviewed-static-native08');assert.equal(view.tiles[0].state,'partial-static-native');assert.equal(view.viewerCanPublishAcoustics,false);
  solver=createWorldCoverageSolver06({inspection,source:[-4.4,2,.6],listener:[-3.6,2,.6]});assert.equal(solver.sample.control.paths.some(p=>p.order>0),false,'partial unlocalized coverage cannot invent qualified reflections');assert(solver.sample.control.paths.every(p=>Math.abs(p.delaySeconds-p.distance/343)<1e-8));assert.equal(solver.geometry.alignment.basis,'reviewed-static-native-model-alignment08');checkCachedAcousticWorld041(solver.geometry);
  const restart=h.create(fixture,{trustedCheckpointSHA256:done.checkpointSHA256}),reused=await restart.run();assert.equal(reused.workersStarted,0);assert.equal(reused.cacheHits,1);assert.equal(reused.readiness,'partial');
 }finally{solver?.close();await h.close();}
});
