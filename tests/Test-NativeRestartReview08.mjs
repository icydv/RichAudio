// Independent regression controls. All bytes, frames and review controls here
// are original authored fixtures; a native-lane label is not genuine GTA proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {worldResources04} from './fixtures/WorldResources04.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {byteDigest,canonical,digest} from '../src/acoustics/world/contracts.mjs';
import {nativeQualificationDigest08,nativeConversionWitness08,pinNativeReview08,admitNativeBatch08} from '../src/acoustics/world/native-evidence08.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {prepareProviderProcess08,runProviderProcess08,verifyProviderRun08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {admitProviderCatalogue08} from '../src/acoustics/world/codewalker-provider08.mjs';
import {originalProviderRequest08} from './fixtures/ProviderWorld08.mjs';

const witness=body=>({...body,qualificationDigest:nativeQualificationDigest08(body)});
function policyFor(w){const bytes=Buffer.from(canonical({schema:1,kind:'RichAudioNativeReview08',purpose:'offline-static-cache-only',witnessSHA256:byteDigest(Buffer.from(canonical(nativeConversionWitness08(w)))),reviewReceiptSHA256:digest('independent-original-static-review08')}));return pinNativeReview08(bytes,{expectedSHA256:byteDigest(bytes)});}
function authored(){
 const f=worldResources04(),input=structuredClone(f.inventory),tile=input.tiles[0];input.tiles=[tile];input.resources=input.resources.filter(r=>r.scopeTiles.includes(tile.tileId));input.mounts=input.mounts.filter(m=>m.id==='base');input.inputFormat='codewalker-native08';input.origin='separately-authorized-installed-metadata';
 for(const r of input.resources){const p=f.inputs.decodedResources[r.id],value=JSON.parse(p.decodedJson);value.sourceAuthority=p.sourceAuthority='separately-authorized-explicit-resource';p.decodedJson=JSON.stringify(value);p.decodedSHA256=byteDigest(Buffer.from(p.decodedJson));}
 const association=digest('independent-original-association08');tile.bindings=tile.bindings.map(b=>({...b,basis:'reviewed-native-association08',physicsDictionary:987654321,sourceSHA256:association,collisionFrame:'archetype-local'}));
 const body={schema:1,kind:'RichAudioNativeWitness08',tileId:tile.tileId,build:input.build,bounds:tile.bounds,layout:'gen9',parserSHA256:input.parser.sha256,resources:input.resources.map(r=>({id:r.id,path:r.path,kind:r.kind,mount:r.mount,sha256:r.sha256,bytes:r.bytes,decodedSHA256:f.inputs.decodedResources[r.id].decodedSHA256})),mounts:input.mounts,bindings:tile.bindings,materialTable:tile.materialTable,collisionFrame:'archetype-local',sourceScopeSHA256:digest('original-scope-first'),sourceReceiptSHA256:digest('original-invocation-first'),coordinateReceiptSHA256:digest('independent-original-frame08'),associationReceiptSHA256:association,activation:'static-runtime-unverified'};
 return {...f,input,body};
}
function inventory(f,w,policy){return qualifyResourceInventory04(f.input,{nativeAdmission08:admitNativeBatch08({witness:w,reviewPolicy:policy})});}
const descriptor=(inventory,inputs,session)=>({catalogueId:'independent-native-restart08',pages:[{pageId:'native',inventory}],session,discovery:{sealed:true,totalKnown:true,basis:'explicit-qualified-inventory-pages',unknownRegions:[]},pageProvider:async()=>({inventory,inputs})});

test('fresh authored invocation receipts reuse one stable reviewed conversion and persisted tile',async()=>{
 const f=authored(),a=witness(f.body),b=witness({...f.body,sourceReceiptSHA256:digest('original-invocation-second'),sourceScopeSHA256:digest('original-scope-second')}),policy=policyFor(a),first=inventory(f,a,policy),second=inventory(f,b,policy);
 assert.notEqual(a.sourceReceiptSHA256,b.sourceReceiptSHA256);assert.notEqual(a.sourceScopeSHA256,b.sourceScopeSHA256);assert.equal(a.qualificationDigest,b.qualificationDigest);
 assert.equal(first.inventoryDigest,second.inventoryDigest);const pa=first.tilePlans[0],pb=second.tilePlans[0];assert.equal(pa.planDigest,pb.planDigest);assert.equal(pa.worldDigest,pb.worldDigest);assert.equal(pa.manifestDigest,pb.manifestDigest);assert.notDeepEqual(pa.nativeReviewControl08.executionWitness,pb.nativeReviewControl08.executionWitness);
 assert.ok(!canonical(pa.manifest).includes(a.sourceReceiptSHA256));assert.ok(!canonical(pb.manifest).includes(b.sourceScopeSHA256));
 const h=await startupHarness06();try{const c1=h.create(descriptor(first,f.inputs,f.session)),built=await c1.run();assert.equal(built.workersStarted,1);const old=await c1.loadPrepared({pageId:'native',tileId:'west'});assert.equal(typeof old.tile.tileDigest,'string');
  const c2=h.create(descriptor(second,f.inputs,f.session),{trustedCheckpointSHA256:built.checkpointSHA256}),reused=await c2.run();assert.equal(reused.workersStarted,0);assert.equal(reused.cacheHits,1);assert.equal(reused.readiness,'partial');const current=await c2.loadPrepared({pageId:'native',tileId:'west'});assert.equal(current.workerStarted,false);assert.equal(current.tile.tileDigest,old.tile.tileDigest);assert.equal(current.tile.engineTile.coverage,'partial');
 }finally{await h.close();}
});

test('stable cache identity still binds all resource, decoder, frame, mount and acoustic controls',()=>{
 const f=authored(),a=witness(f.body),policy=policyFor(a),mutations=[
  w=>w.resources[0].sha256=digest('changed-native-content'),w=>w.resources[0].decodedSHA256=digest('changed-native-dto'),w=>w.parserSHA256=digest('changed-decoder'),w=>w.coordinateReceiptSHA256=digest('changed-frame'),w=>w.mounts[0].order++,w=>w.bounds.max[0]++,w=>w.materialTable[7].reflection[0]=.5,
  w=>{w.collisionFrame='world';for(const b of w.bindings)b.collisionFrame='world';},w=>{w.associationReceiptSHA256=digest('changed-ownership');for(const b of w.bindings)b.sourceSHA256=w.associationReceiptSHA256;}
 ];
 for(const mutate of mutations){const body=structuredClone(f.body);mutate(body);const changed=witness(body);assert.notEqual(changed.qualificationDigest,a.qualificationDigest);assert.throws(()=>admitNativeBatch08({witness:changed,reviewPolicy:policy}),/reviewed stable native conversion/);}
 assert.throws(()=>admitNativeBatch08({witness:nativeConversionWitness08(a),reviewPolicy:policy}),/execution attestation/);
});

const packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES,native=process.platform==='win32'&&packageRoot&&fixtureRoot;
test('two actual original-file decoder invocations retain stable cache identity while rejecting a stale source receipt',{skip:!native},async()=>{
 const repo=fileURLToPath(new URL('../',import.meta.url));for(const root of [packageRoot,fixtureRoot]){assert.ok(path.resolve(root).startsWith(path.join(repo,'.local')+path.sep));for(let at=path.resolve(root);;at=path.dirname(at)){assert.equal((await fs.lstat(at)).isSymbolicLink(),false);if(at===path.dirname(at))break;}}
 const file=path.join(fixtureRoot,'original.rpf'),bytes=await fs.readFile(file),pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8'));
 const base=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:bytes.length,handleId:'original'}),direct={id:'original',path:file,bytes:bytes.length,headerSHA256:byteDigest(bytes.subarray(0,16)),identity:null};
 const initial=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request:base,directSources:[direct]}));assert.equal(initial.state,'completed');const held=initial.receipt.sourceBindings[0];direct.identity={volumeSerial:held.volumeSerial,fileIndexHigh:held.fileIndexHigh,fileIndexLow:held.fileIndexLow,lastWriteHigh:held.lastWriteHigh,lastWriteLow:held.lastWriteLow};
 // This declared native lane intentionally consumes only ORIGINAL authored
 // files, so the real caller/control-host binding can be regression tested.
 const request={...base,sourceAuthority:'separately-authorized-explicit-resource',phase:'resources',selection:['original_building08.ymap','original_types08.ytyp','original_collision08.ybn'].map(logicalMember=>({logicalArchive:'original/base.rpf',logicalMember}))};
 const runA=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request,directSources:[direct]})),runB=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request:{...request,maximumResources:127},directSources:[direct]}));assert.equal(runA.state,'completed');assert.equal(runB.state,'completed');assert.notEqual(runA.receiptSHA256,runB.receiptSHA256);
 const record=verifyProviderRun08(runA),rows=record.workerResult.resources,collision=rows.find(r=>r.kind==='ybn'),type=JSON.parse(rows.find(r=>r.kind==='ytyp').packet.decodedJson).data.archetypes[0],association=digest('actual-original-resource-ownership08');
 const body={schema:1,kind:'RichAudioNativeWitness08',tileId:'actual-original-restart08',build:'original-binary-review08',bounds:{min:[-8,-8,-8],max:[8,8,8]},layout:'gen9',parserSHA256:pkg.parserSHA256,resources:rows.map(r=>({id:r.id,path:r.logicalPath,kind:r.kind,mount:r.mount,sha256:r.packet.sourceSHA256,bytes:r.packet.bytes,decodedSHA256:r.packet.decodedSHA256})),mounts:[{id:'base',family:'base',order:0,enabled:true}],bindings:[{archetypeHash:type.nameHash,resourceId:collision.id,basis:'reviewed-native-association08',physicsDictionary:type.physicsDictionary,sourceSHA256:association,collisionFrame:'archetype-local'}],materialTable:worldResources04().inventory.tiles[0].materialTable,collisionFrame:'archetype-local',sourceScopeSHA256:record.requestId,sourceReceiptSHA256:runA.receiptSHA256,coordinateReceiptSHA256:digest('actual-original-frame08'),associationReceiptSHA256:association,activation:'static-runtime-unverified'};
 const a=witness(body),b=witness({...body,sourceReceiptSHA256:runB.receiptSHA256,sourceScopeSHA256:verifyProviderRun08(runB).requestId}),policy=policyFor(a),tokenA=admitNativeBatch08({witness:a,reviewPolicy:policy}),tokenB=admitNativeBatch08({witness:b,reviewPolicy:policy});
 assert.notEqual(a.sourceScopeSHA256,b.sourceScopeSHA256);assert.throws(()=>admitProviderCatalogue08({run:runB,admissions:[tokenA]}),/exact joined source/);const wrongScope=admitNativeBatch08({witness:witness({...body,sourceReceiptSHA256:runB.receiptSHA256}),reviewPolicy:policy});assert.throws(()=>admitProviderCatalogue08({run:runB,admissions:[wrongScope]}),/exact joined source/);
 const changedOrder={...request,archives:request.archives.map(r=>({...r,order:1}))},runC=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request:changedOrder,directSources:[direct]}));assert.equal(runC.state,'completed');
 const tokenC=admitNativeBatch08({witness:witness({...body,sourceReceiptSHA256:runC.receiptSHA256,sourceScopeSHA256:verifyProviderRun08(runC).requestId}),reviewPolicy:policy});
 assert.throws(()=>admitProviderCatalogue08({run:runC,admissions:[tokenC]}),/review binds actual native|mount|precedence/,'a current receipt cannot hide changed actual mount precedence behind an older stable conversion policy');
 const providerA=admitProviderCatalogue08({run:runA,admissions:[tokenA]}),providerB=admitProviderCatalogue08({run:runB,admissions:[tokenB]});assert.equal(providerA.catalogue.catalogueDigest,providerB.catalogue.catalogueDigest);assert.equal(providerA.pages[0].inventory.tilePlans[0].worldDigest,providerB.pages[0].inventory.tilePlans[0].worldDigest);
 const h=await startupHarness06();try{const asFixture=provider=>({catalogueId:provider.catalogue.catalogueId,pages:provider.pages,session:'8'.repeat(32),discovery:provider.discovery,pageProvider:provider.pageProvider}),c1=h.create(asFixture(providerA)),built=await c1.run();assert.equal(built.workersStarted,1);const c2=h.create(asFixture(providerB),{trustedCheckpointSHA256:built.checkpointSHA256}),cached=await c2.run();assert.equal(cached.workersStarted,0);assert.equal(cached.cacheHits,1);assert.equal(cached.readiness,'partial');}finally{await h.close();}
});
