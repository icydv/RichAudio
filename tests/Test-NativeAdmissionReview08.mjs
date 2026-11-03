// Independent regressions for native08 admission issues found in review.
// Authored packets exercise trust boundaries only, not genuine parser evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {canonical,digest,byteDigest} from '../src/acoustics/world/contracts.mjs';
import {pinNativeReview08,admitNativeBatch08,validateNativeWitness08,isNativeGrant08,verifyNativeAdmission08,nativeAdmissionControl08,nativeQualificationDigest08,nativeConversionWitness08,nativeGrantForAdmission08} from '../src/acoustics/world/native-evidence08.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {prepareExplicitResourceBatch03} from '../src/acoustics/world/resource-import03.mjs';
import {createExplicitResourceScene02} from '../src/acoustics/world/resource-scene02.mjs';

function reviewedOriginal(receipt='original-transient-source-receipt'){
 const f=worldResources04(),input=structuredClone(f.inventory),tile=input.tiles[0];
 input.tiles=[tile];input.resources=input.resources.filter(r=>r.scopeTiles.includes(tile.tileId));input.mounts=input.mounts.filter(m=>m.id==='base');input.origin='separately-authorized-installed-metadata';input.inputFormat='codewalker-native08';
 for(const r of input.resources){const p=f.inputs.decodedResources[r.id],n=JSON.parse(p.decodedJson);n.sourceAuthority='separately-authorized-explicit-resource';p.sourceAuthority=n.sourceAuthority;p.decodedJson=JSON.stringify(n);p.decodedSHA256=byteDigest(Buffer.from(p.decodedJson));}
 const association=digest('independent-original-association-control');tile.bindings=tile.bindings.map(b=>({...b,basis:'reviewed-native-association08',physicsDictionary:987654321,sourceSHA256:association,collisionFrame:'archetype-local'}));
 const body={schema:1,kind:'RichAudioNativeWitness08',tileId:tile.tileId,build:input.build,bounds:tile.bounds,layout:'gen9',parserSHA256:input.parser.sha256,resources:input.resources.map(r=>({id:r.id,path:r.path,kind:r.kind,mount:r.mount,sha256:r.sha256,bytes:r.bytes,decodedSHA256:f.inputs.decodedResources[r.id].decodedSHA256})),mounts:input.mounts,bindings:tile.bindings,materialTable:tile.materialTable,collisionFrame:'archetype-local',sourceScopeSHA256:digest('original-source-scope'),sourceReceiptSHA256:digest(receipt),coordinateReceiptSHA256:digest('original-coordinate-controls'),associationReceiptSHA256:association,activation:'static-runtime-unverified'};
 const witness={...body,qualificationDigest:nativeQualificationDigest08(body)},policy=Buffer.from(canonical({schema:1,kind:'RichAudioNativeReview08',purpose:'offline-static-cache-only',witnessSHA256:byteDigest(Buffer.from(canonical(nativeConversionWitness08(witness)))),reviewReceiptSHA256:digest('independent-original-review')}));
 const admission=admitNativeBatch08({witness,reviewPolicy:pinNativeReview08(policy,{expectedSHA256:byteDigest(policy)})});
 return {...f,input,witness,admission,inventory:qualifyResourceInventory04(input,{nativeAdmission08:admission})};
}

test('structural native validation and self-hashed manifest cannot mint direct scene/import authority',()=>{
 const f=reviewedOriginal(),untrusted=validateNativeWitness08(structuredClone(f.witness));
 assert.equal(isNativeGrant08(untrusted),false);
 assert.throws(()=>createExplicitResourceScene02({resources:[],bindings:f.witness.bindings,materialTable:f.witness.materialTable,session:f.session,region:f.witness.bounds,nativeGrant:untrusted}),/branded admitted native/);
 const plan=f.inventory.tilePlans[0],input={manifest:plan.manifest,decodedResources:f.inputs.decodedResources,resourceBytes:f.inputs.resourceBytes,bindings:plan.bindings,materialTable:plan.materialTable,session:f.session};
 assert.throws(()=>prepareExplicitResourceBatch03(input),/branded native scene admission/);
 assert.throws(()=>prepareExplicitResourceBatch03({...input,nativeReviewControl08:nativeAdmissionControl08(f.admission)}),/branded native scene admission/,'serialized control data is not the explicit import admission');
 assert.throws(()=>verifyNativeAdmission08({...f.admission}),/branded native admission/);
 const resources=f.input.resources.map(r=>({...r,order:0,normalized:JSON.parse(f.inputs.decodedResources[r.id].decodedJson)}));
 resources.find(r=>r.kind==='ybn').normalized.data.nodes[0].vertices[0][0]+=.25;
 assert.throws(()=>createExplicitResourceScene02({resources,bindings:f.witness.bindings,materialTable:f.witness.materialTable,session:f.session,region:f.witness.bounds,nativeGrant:nativeGrantForAdmission08(f.admission)}),/native.*(?:DTO|decoded|normalized|resource.*binding)/,'a genuine admission must not certify caller-substituted normalized geometry');
});

test('native review rejects internally contradictory collision frames and non-collision resource ownership',()=>{
 const f=reviewedOriginal();
 for(const mutate of [w=>{w.bindings[0].collisionFrame='world';},w=>{w.bindings[0].resourceId=w.resources.find(r=>r.kind==='ymap').id;},w=>{w.bindings[0].sourceSHA256='0'.repeat(64);}]){
  const changed=structuredClone(f.witness);mutate(changed);changed.qualificationDigest=nativeQualificationDigest08(changed);
  assert.throws(()=>validateNativeWitness08(changed),/consistent typed native collision/);
 }
});

test('fresh independent execution attestation preserves content-addressed cache reuse',async()=>{
 const first=reviewedOriginal('first-owned-execution-receipt'),second=reviewedOriginal('second-owned-execution-receipt');
 assert.notEqual(first.witness.sourceReceiptSHA256,second.witness.sourceReceiptSHA256);
 assert.equal(first.witness.qualificationDigest,second.witness.qualificationDigest);
 assert.equal(first.inventory.inventoryDigest,second.inventory.inventoryDigest);
 assert.equal(first.inventory.tilePlans[0].planDigest,second.inventory.tilePlans[0].planDigest);
 assert.notDeepEqual(first.inventory.tilePlans[0].nativeReviewControl08,second.inventory.tilePlans[0].nativeReviewControl08);
 const h=await startupHarness06(),fixture=f=>({catalogueId:'original-independent-native-restart08',pages:[{pageId:'reviewed-page',inventory:f.inventory}],session:f.session,discovery:{sealed:true,totalKnown:true,basis:'explicit-qualified-inventory-pages',unknownRegions:[]},pageProvider:async()=>({inventory:f.inventory,inputs:f.inputs})});
 try{const one=await h.create(fixture(first)).run();assert.equal(one.workersStarted,1);const two=await h.create(fixture(second),{trustedCheckpointSHA256:one.checkpointSHA256}).run();assert.equal(two.workersStarted,0);assert.equal(two.cacheHits,1);assert.equal(two.readiness,'partial');}finally{await h.close();}
});

test('valid independent native admission still produces only derived partial static geometry',()=>{
 const f=reviewedOriginal(),plan=f.inventory.tilePlans[0],result=prepareExplicitResourceBatch03({manifest:plan.manifest,decodedResources:f.inputs.decodedResources,resourceBytes:f.inputs.resourceBytes,bindings:plan.bindings,materialTable:plan.materialTable,session:f.session,nativeAdmission08:f.admission});
 assert.equal(result.state,'prepared-admitted-native-static-subset08');assert.equal(result.installedWorldVerified,false);assert.equal(result.tile.coverage,'partial');
 assert(result.tile.surfaces.length>0&&result.tile.surfaces.every(s=>s.provenance.kind==='derived'));
 assert(result.tiles.every(t=>t.parser.inputFormat==='codewalker-native08'&&t.installedWorldVerified===false&&t.runtimeActivationVerified===false));
});
