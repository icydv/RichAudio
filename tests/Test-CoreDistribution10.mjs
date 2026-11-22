// Packaging mechanics use original dummy DLL bytes and simulated review data.
// These fixtures do not authenticate CodeWalker or create a release artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectCoreDistribution10,packageCoreRuntime10,minimalCoreRuntimeFiles10} from '../src/acoustics/world/distribution10.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const content=new Map(minimalCoreRuntimeFiles10.map((name,i)=>[name,Buffer.from('Original dummy assembly bytes '+i)]));
 for(const name of ['CodeWalker.Notice.txt','CodeWalker.Readme_Src.txt','CodeWalker.PERMISSION.txt','SharpDX.LICENSE','FBX.LICENSE'])content.set(name,Buffer.from('Original test notice '+name));
 const files=minimalCoreRuntimeFiles10.map(file=>({file,name:file.slice(0,-4),bytes:content.get(file).length,sha256:hash(content.get(file)),manifestResources:[],references:[{name:'mscorlib'}]}));
 const audit={schema:1,kind:'RichAudioCodeWalkerApiAudit10',passed:true,binaryRole:'standard-core-candidate',files,features:{researchAugmentationMarkers:[],publicYmapLoadBytes:true,publicYtypLoadBytes:true,publicYbnLoadBytes:true,publicGen9Selector:true}};
 const review={schema:1,kind:'RichAudioCoreDistributionReview10',scope:'official-unmodified-Core-without-proprietary-payload',independentReview:true,sourcePublisher:'dexyfex',opaqueBootstrapExcluded:true,gameAssetsAndKeysExcluded:true,vendorSourceExcluded:true,noticeCompletenessQualified:true,thirdPartyReview:{scope:'exact-Core-and-transitive-closure',obligationsSatisfied:true,sourceRedistributionRequired:false,evidenceSHA256:'1'.repeat(64),fbxPresent:true},files:files.map(({file,bytes,sha256})=>({file,bytes,sha256})),notices:['CodeWalker.Notice.txt','CodeWalker.Readme_Src.txt','CodeWalker.PERMISSION.txt','SharpDX.LICENSE','FBX.LICENSE'].map(file=>({file,bytes:content.get(file).length,sha256:hash(content.get(file))}))};
 const seal=()=>{const reviewBytes=Buffer.from(JSON.stringify(review));return {audit,review,reviewBytes,expectedReviewSHA256:hash(reviewBytes)};};return {audit,review,seal,content};
}
test('default component packaging blocks before any supplied software directory is probed',async()=>{
 const result=await packageCoreRuntime10({inputRoot:path.join(repo,'missing-standard-Core'),outputRoot:path.join(repo,'.local/never-created-runtime10')});assert.equal(result.state,'blocked');assert.equal(result.sourceFilesOpened,0);assert.equal(result.legalClearanceVerified,false);
 let calls=0;const bad={get inputRoot(){calls++;throw Error('unapproved source probe');}};await assert.rejects(packageCoreRuntime10(bad),/closed data/);assert.equal(calls,0);
});
test('a pinned review cannot promote research Core, embedded payloads or extra dependencies',()=>{
 for(const mutate of [f=>f.audit.binaryRole='research-api-probe-only',f=>f.audit.features.researchAugmentationMarkers=['InitializeFromRichAudio09'],f=>f.audit.files[0].manifestResources=['CodeWalker.Properties.Resources.resources'],f=>f.audit.files[0].references.push({name:'Unreviewed.Extractor'}),f=>f.review.files.push({file:'CodeWalker.exe',bytes:1,sha256:'0'.repeat(64)}),f=>f.review.opaqueBootstrapExcluded=false,f=>f.review.notices.splice(1,1),f=>f.review.notices.pop(),f=>f.review.noticeCompletenessQualified=false,f=>f.review.thirdPartyReview.sourceRedistributionRequired=true]){const f=fixture();mutate(f);assert.equal(inspectCoreDistribution10(f.seal()).state,'blocked');}
 const f=fixture();const p=f.seal();assert.throws(()=>inspectCoreDistribution10({...p,expectedReviewSHA256:'0'.repeat(64)}),/external review/);
});
test('original policy fixture packages only four exact bytes-bound DLLs and required notices',async()=>{
 const f=fixture();await fs.mkdir(path.join(repo,'.local'),{recursive:true});const root=await fs.mkdtemp(path.join(repo,'.local/distribution10-original-')),input=path.join(root,'input'),notices=path.join(root,'notices'),out=path.join(root,'fixture-component');await fs.mkdir(input);await fs.mkdir(notices);
 for(const [name,bytes]of f.content)await fs.writeFile(path.join(name.endsWith('.dll')?input:notices,name),bytes,{flag:'wx'});
 await fs.writeFile(path.join(input,'magic.dat'),'must not be copied',{flag:'wx'});await fs.writeFile(path.join(input,'UnusedGui.exe'),'must not be copied',{flag:'wx'});await fs.writeFile(path.join(input,'VendorSource.cs'),'must not be copied',{flag:'wx'});
 const result=await packageCoreRuntime10({...f.seal(),inputRoot:input,noticesRoot:notices,outputRoot:out});assert.equal(result.legalClearanceVerified,false);assert.equal(result.vendorDlls,3);assert.equal(result.ownedAdapterDlls,1);assert.deepEqual((await fs.readdir(out)).sort(),[...minimalCoreRuntimeFiles10,'notices','runtime-manifest10.json'].sort());for(const file of minimalCoreRuntimeFiles10)assert.deepEqual(await fs.readFile(path.join(out,file)),f.content.get(file));assert.equal(result.vendorSourceIncluded,false);assert.equal(result.bootstrapMaterialIncluded,false);
 await assert.rejects(packageCoreRuntime10({...f.seal(),inputRoot:input,noticesRoot:notices,outputRoot:out}),/fresh component/);
});
test('changed software bytes and unsafe notice names cannot publish a component',async()=>{
 const f=fixture();f.review.notices[0].file='../CodeWalker.Notice.txt';assert.equal(inspectCoreDistribution10(f.seal()).state,'blocked');
 const g=fixture();g.review.notices[0].file='CON.txt';assert.equal(inspectCoreDistribution10(g.seal()).state,'blocked');
 const h=fixture();await fs.mkdir(path.join(repo,'.local'),{recursive:true});const root=await fs.mkdtemp(path.join(repo,'.local/distribution10-tamper-'));await fs.writeFile(path.join(root,minimalCoreRuntimeFiles10[0]),Buffer.alloc(h.audit.files[0].bytes));await assert.rejects(packageCoreRuntime10({...h.seal(),inputRoot:root,noticesRoot:root,outputRoot:path.join(root,'out')}),/digest mismatch/);await assert.rejects(fs.stat(path.join(root,'out')),e=>e.code==='ENOENT');
});
