// Independent orchestration regression. Only the current authored RPF fixture
// is used, including when it is deliberately labelled as a native-lane input.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {byteDigest,canonical,digest} from '../src/acoustics/world/contracts.mjs';
import {prepareProviderProcess08,runProviderProcess08,verifyProviderRun08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {nativeQualificationDigest08,nativeConversionWitness08,pinNativeReview08} from '../src/acoustics/world/native-evidence08.mjs';
import {prepareCodeWalkerWorld08,runPreparationPlan08} from '../tools/Prepare-CodeWalkerWorld08.mjs';
import {originalProviderRequest08} from './fixtures/ProviderWorld08.mjs';
import {worldResources04} from './fixtures/WorldResources04.mjs';

const packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES,native=process.platform==='win32'&&packageRoot&&fixtureRoot;
test('presealed stable native review is attached to a fresh joined run and reused by the actual preparation plan',{skip:!native},async()=>{
 const repo=fileURLToPath(new URL('../',import.meta.url));for(const root of [packageRoot,fixtureRoot]){assert.ok(path.resolve(root).startsWith(path.join(repo,'.local')+path.sep));for(let at=path.resolve(root);;at=path.dirname(at)){assert.equal((await fs.lstat(at)).isSymbolicLink(),false);if(at===path.dirname(at))break;}}
 const file=path.join(fixtureRoot,'original.rpf'),bytes=await fs.readFile(file),pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8'));
 const base=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:bytes.length,handleId:'original'}),direct={id:'original',path:file,bytes:bytes.length,headerSHA256:byteDigest(bytes.subarray(0,16)),identity:null};
 const original=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request:base,directSources:[direct]}));assert.equal(original.state,'completed');const held=original.receipt.sourceBindings[0];direct.identity={volumeSerial:held.volumeSerial,fileIndexHigh:held.fileIndexHigh,fileIndexLow:held.fileIndexLow,lastWriteHigh:held.lastWriteHigh,lastWriteLow:held.lastWriteLow};
 const request={...base,sourceAuthority:'separately-authorized-explicit-resource',phase:'resources',selection:['original_building08.ymap','original_types08.ytyp','original_collision08.ybn'].map(logicalMember=>({logicalArchive:'original/base.rpf',logicalMember}))};
 const seed=await runProviderProcess08(await prepareProviderProcess08({packageRoot,request,directSources:[direct]}));assert.equal(seed.state,'completed');const record=verifyProviderRun08(seed),rows=record.workerResult.resources,collision=rows.find(r=>r.kind==='ybn'),type=JSON.parse(rows.find(r=>r.kind==='ytyp').packet.decodedJson).data.archetypes[0],association=digest('independent-original-cli-ownership08');
 const body={schema:1,kind:'RichAudioNativeWitness08',tileId:'original-native-cli08',build:'original-binary-cli08',bounds:{min:[-8,-8,-8],max:[8,8,8]},layout:'gen9',parserSHA256:pkg.parserSHA256,resources:rows.map(r=>({id:r.id,path:r.logicalPath,kind:r.kind,mount:r.mount,sha256:r.packet.sourceSHA256,bytes:r.packet.bytes,decodedSHA256:r.packet.decodedSHA256})),mounts:[{id:'base',family:'base',order:0,enabled:true}],bindings:[{archetypeHash:type.nameHash,resourceId:collision.id,basis:'reviewed-native-association08',physicsDictionary:type.physicsDictionary,sourceSHA256:association,collisionFrame:'archetype-local'}],materialTable:worldResources04().inventory.tiles[0].materialTable,collisionFrame:'archetype-local',sourceScopeSHA256:record.requestId,sourceReceiptSHA256:record.receiptSHA256,coordinateReceiptSHA256:digest('independent-original-cli-frame08'),associationReceiptSHA256:association,activation:'static-runtime-unverified'};
 const conversion=nativeConversionWitness08({...body,qualificationDigest:nativeQualificationDigest08(body)}),policyBytes=Buffer.from(canonical({schema:1,kind:'RichAudioNativeReview08',purpose:'offline-static-cache-only',witnessSHA256:byteDigest(Buffer.from(canonical(conversion))),reviewReceiptSHA256:digest('independent-original-cli-policy08')})),policySHA256=byteDigest(policyBytes);
 assert.equal(conversion.sourceReceiptSHA256,undefined);assert.equal(conversion.sourceScopeSHA256,undefined);
 const cacheRoot=await fs.mkdtemp(path.join(repo,'.local/world08-native-cli-review-')),plan={schema:1,kind:'RichAudioPreparationPlan08',inputs:[],nativeReviews:[{conversion,policyBase64:policyBytes.toString('base64'),policySHA256}],packageRoot,request,directSources:[direct],cacheRoot,session:'8'.repeat(32)};
 const first=await runPreparationPlan08(plan,{showUi:false});assert.equal(first.providerState,'catalogued-reviewed-static-native08');assert.equal(first.completedEligibleTiles,1);assert.equal(first.state,'partial');assert.match(first.checkpointSHA256,/^[a-f0-9]{64}$/);assert.equal(first.installedWorldVerified,false);assert.equal(first.gameLaunched,false);assert.equal(first.endpointOpened,false);
 const second=await prepareCodeWalkerWorld08({processOptions:{packageRoot,request,directSources:[direct],workingRoot:cacheRoot},nativeReviews:[{conversion,reviewPolicy:pinNativeReview08(policyBytes,{expectedSHA256:policySHA256})}],cacheRoot,session:plan.session,trustedCheckpointSHA256:first.checkpointSHA256});
 try{assert.equal(second.run.state,'completed');assert.notEqual(second.run.receiptSHA256,seed.receiptSHA256);assert.equal(second.result.workersStarted,0);assert.equal(second.result.cacheHits,1);assert.equal(second.result.readiness,'partial');}finally{await second.close();}
});
