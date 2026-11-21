// Actual adapted CodeWalker memory initialization with authored inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareProviderProcess08,runProviderProcess08,isProviderRun08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {originalProviderRequest08,originalEncryptedArchive08,providerByteSHA08} from './fixtures/ProviderWorld08.mjs';
import {verifyActualProviderPipeline08} from './Run-CodeWalkerPipeline08.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES;
const native=process.platform==='win32'&&packageRoot&&fixtureRoot;
let original;
async function fixture(){
 if(original)return original;
 assert(path.resolve(fixtureRoot).startsWith(path.join(repo,'.local')+path.sep));
 const root=await fs.mkdtemp(path.join(repo,'.local/bootstrap09-')),archive=await fs.readFile(path.join(fixtureRoot,'original.rpf')),encrypted=originalEncryptedArchive08(archive),state=path.join(root,'state.bin'),aes=path.join(root,'aes.bin');
 await fs.writeFile(state,encrypted.state,{flag:'wx'});await fs.writeFile(aes,encrypted.aesKey,{flag:'wx'});
 // Original .NET fixture generation, separate from the contained parser worker.
 for(const file of ['CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll'])await fs.copyFile(path.join(packageRoot,file),path.join(root,file));
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),exe=path.join(root,'original-bootstrap09.exe');
 const c=spawnSync(compiler,['/nologo','/target:exe','/r:'+path.join(root,'CodeWalker.Core.dll'),'/out:'+exe,path.join(repo,'tests/CodeWalkerBootstrapFixture09.cs')],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(c.status,0,c.stdout+c.stderr);
 const magic={};for(const mode of ['valid','short','excess','bomb']){const file=path.join(root,mode+'.bin');const r=spawnSync(exe,[state,aes,file,mode],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);magic[mode]=await fs.readFile(file);}
 const source=path.join(root,'original-ng.rpf');await fs.writeFile(source,encrypted.bytes,{flag:'wx'});
 const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8'));
 return original={...encrypted,archive,magic,pkg,source,root};
}
async function run(mode='valid',{authority='original-authored-fixture',mutate}={}){
 const f=await fixture(),magic=f.magic[mode],capability={kind:'codewalker-bootstrap09',file:'input/bootstrap.bin',bytes:magic.length,sha256:providerByteSHA08(magic),aes:{file:'input/aes.bin',bytes:32,sha256:providerByteSHA08(f.aesKey)}};
 const request=originalProviderRequest08({parserSHA256:f.pkg.parserSHA256,bytes:f.bytes.length,sha256:null,handleId:'original',capability,phase:'metadata'});request.sourceAuthority=authority;const aesPin=capability.aes;if(mutate)mutate(request);
 let identity=null;if(authority!=='original-authored-fixture'){const prior=await run();assert.equal(prior.state,'completed');const b=prior.receipt.sourceBindings[0];identity=Object.fromEntries(['volumeSerial','fileIndexHigh','fileIndexLow','lastWriteHigh','lastWriteLow'].map(k=>[k,b[k]]));}
 const prepared=await prepareProviderProcess08({packageRoot,request,directSources:[{id:'original',path:f.source,bytes:f.bytes.length,headerSHA256:providerByteSHA08(f.bytes.subarray(0,16)),identity}],inputs:[{path:capability.file,bytes:magic},{path:aesPin.file,bytes:f.aesKey}]});
 return runProviderProcess08(prepared);
}
test('actual Core memory initializer decodes original opaque bootstrap and then NG directory metadata',{skip:!native},async()=>{
 const r=await run();assert.equal(r.state,'completed',JSON.stringify(r.receipt));assert.equal(isProviderRun08(r),true);assert.equal(r.workerResult.metadata.length,5);assert.equal(r.workerResult.candidates.length,3);assert.equal(r.receipt.capabilityBindings.length,2);assert(r.workerResult.stats.sourceReadBytes>(await fixture()).magic.valid.length+32);assert.equal(r.workerResult.installedWorldVerified,false);
});
test('bounded upstream initialization rejects short, excess and inflated bootstrap before archive IO',{skip:!native},async()=>{
 for(const mode of ['short','excess','bomb']){const r=await run(mode);assert.equal(r.state,'failed');assert.equal(r.workerJoined,true);assert.equal(isProviderRun08(r),false);const failure=JSON.parse(await fs.readFile(path.join(r.root,'result/stdout.bin'),'utf8'));assert.match(failure.reason,/exactly 306272/);assert.equal(failure.stats.archivesRead,0);}
});
test('synthetic AES cannot initialize the real-source lane and missing AES never starts a reader',{skip:!native},async()=>{
 const r=await run('valid',{authority:'separately-authorized-explicit-resource'});assert.equal(r.state,'failed');const failure=JSON.parse(await fs.readFile(path.join(r.root,'result/stdout.bin'),'utf8'));assert.match(failure.reason,/AES fingerprint/);assert.equal(failure.stats.archivesRead,0);
 await assert.rejects(run('valid',{mutate:r=>r.capability.aes=null}),/requires exact explicit AES/);
});
test('opaque bootstrap plus original NG archive reaches existing tiles, persistent reuse, SoundMap paths and identical dry PCM',{skip:!native},async()=>{
 const f=await fixture(),root=path.join(f.root,'pipeline-fixtures');await fs.mkdir(root);
 const proof=JSON.parse(await fs.readFile(path.join(fixtureRoot,'proof.json'),'utf8'));
 const transformed={...proof,parentArchiveSHA256:proof.archiveSHA256,archiveSHA256:providerByteSHA08(f.bytes),representationFactorySHA256:providerByteSHA08(await fs.readFile(new URL('./fixtures/ProviderWorld08.mjs',import.meta.url)))};
 await fs.writeFile(path.join(root,'original.rpf'),f.bytes,{flag:'wx'});await fs.writeFile(path.join(root,'proof.json'),JSON.stringify(transformed),{flag:'wx'});
 const magic=f.magic.valid,capability={kind:'codewalker-bootstrap09',file:'input/bootstrap.bin',bytes:magic.length,sha256:providerByteSHA08(magic),aes:{file:'input/aes.bin',bytes:32,sha256:providerByteSHA08(f.aesKey)}};
 const result=await verifyActualProviderPipeline08({packageRoot,fixtureRoot:root,workingRoot:repo,capability,capabilityInputs:[{path:capability.file,bytes:magic},{path:capability.aes.file,bytes:f.aesKey}]});
 assert.equal(result.resources,3);assert.equal(result.surfaces,2);assert.equal(result.cacheHitsOnRestart,1);assert.equal(result.conversionsOnRestart,0);assert.equal(result.dryPcmIdentical,true);assert.equal(result.stereoPcmDifferent,true);assert(result.reflections.some(p=>p.order>0));assert.equal(result.genuineResourceVerified,false);
 await fs.writeFile(path.join(f.root,'bootstrap-pipeline09.json'),JSON.stringify(result)+'\n',{flag:'wx'});
});
