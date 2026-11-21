import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {stageReviewedPcmCopy} from '../tools/Finalize-NormalObservationPackage01.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const script=fileURLToPath(new URL('../tools/Finalize-NormalObservationPackage01.mjs',import.meta.url));
function fixture(links=2){
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'rich-pcm-')));
 const body=Buffer.from('authored PCM guard fixture');
 const file=path.join(root,'engine_decel.f32');
 fs.writeFileSync(file,body);
 for(let i=1;i<links;i++)fs.linkSync(file,path.join(root,'alias-'+i));
 return {root,body,asset:{path:file,relative:'engine_decel.f32',sha256:digest(body),bytes:body.length},
  target:path.join(root,'private-copy.f32')};
}

test('exact two-link PCM creates an independent, verified single-link copy',()=>{
 const {asset,target,body}=fixture();
 const receipt=stageReviewedPcmCopy(asset,target);
 assert.deepEqual(fs.readFileSync(target),body);
 assert.equal(receipt.copyLinks,1);
 assert.equal(fs.statSync(target,{bigint:true}).nlink,1n);
 assert.notEqual(fs.statSync(target,{bigint:true}).ino,fs.statSync(asset.path,{bigint:true}).ino);
 assert.equal(fs.statSync(asset.path,{bigint:true}).nlink,2n);
});

test('the PCM exception refuses single-link and three-link inputs',()=>{
 for(const links of [1,3]){
  const {asset,target}=fixture(links);
  assert.throws(()=>stageReviewedPcmCopy(asset,target),/link count/);
  assert.equal(fs.existsSync(target),false);
 }
});

test('changed bytes, wrong hash and wrong lengths are rejected',()=>{
 const {asset,target}=fixture();
 assert.throws(()=>stageReviewedPcmCopy({...asset,bytes:asset.bytes+1},target),/length/);
 assert.throws(()=>stageReviewedPcmCopy({...asset,bytes:asset.bytes-1},target),/length/);
 assert.throws(()=>stageReviewedPcmCopy({...asset,sha256:'a'.repeat(64)},target),/changed/);
 fs.writeFileSync(asset.path,Buffer.alloc(asset.bytes,1));
 assert.throws(()=>stageReviewedPcmCopy(asset,target),/changed/);
 assert.equal(fs.existsSync(target),false);
});

test('a link added during the descriptor read is rejected',t=>{
 const {root,asset,target}=fixture();
 const read=fs.readSync;
 t.mock.method(fs,'readSync',(fd,...args)=>{
  fs.linkSync(asset.path,path.join(root,'late-alias'));
  t.mock.restoreAll();
  return read(fd,...args);
 });
 assert.throws(()=>stageReviewedPcmCopy(asset,target),/changed/);
 assert.equal(fs.existsSync(target),false);
});

test('a pathname replaced during the descriptor read is rejected even with the same bytes',t=>{
 const {root,asset,target,body}=fixture();
 const read=fs.readSync;
 t.mock.method(fs,'readSync',(fd,...args)=>{
  fs.renameSync(asset.path,path.join(root,'held-original'));
  fs.writeFileSync(asset.path,body);
  fs.linkSync(asset.path,path.join(root,'replacement-alias'));
  t.mock.restoreAll();
  return read(fd,...args);
 });
 assert.throws(()=>stageReviewedPcmCopy(asset,target),/changed/);
 assert.equal(fs.existsSync(target),false);
});

test('copy readback rejects corrupted output',t=>{
 const {asset,target}=fixture();
 const write=fs.writeFileSync;
 t.mock.method(fs,'writeFileSync',(p,b,options)=>write(p,Buffer.alloc(b.length,1),options));
 assert.throws(()=>stageReviewedPcmCopy(asset,target),/changed/);
});

test('a hard-linked non-PCM approval is rejected by the default',()=>{
 const {root,asset}=fixture(1);
 const file=path.join(root,'approval.json');
 fs.linkSync(asset.path,file);
 const result=spawnSync(process.execPath,[script,'unused','unused','unused','unused',file,asset.sha256],{encoding:'utf8'});
 assert.equal(result.status,1);
 assert.match(result.stderr,/link count/);
});

test('proof finalization uses only the staged single-link PCM and writes a disabled package receipt',()=>{
 const scope=path.join(fixture().root,'.local'),root=path.join(scope,'phase1-package');
 const save=(file,value)=>{
  const b=Buffer.from(JSON.stringify(value));
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,b);
  return digest(b);
 };
 fs.mkdirSync(path.join(scope,'phase1-sidecars'),{recursive:true});
 const pcm=[];
 for(const role of ['engine','exhaust'])for(const state of ['accel','decel','idle']){
  const relative=`sources/player/bati/${role}_${state}.f32`;
  const file=path.join(root,relative),body=Buffer.from(relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,body);
  pcm.push({relative,path:file,bytes:body.length,sha256:digest(body)});
 }
 const draftFile=path.join(scope,'draft.json'),catalog=path.join(root,'world/catalog.json');
 const catalogSha256=save(catalog,{fixture:true});
 const draftHash=save(draftFile,{approved:false,stagedPcm:true,root,pcm,
  configuration:{outputSink:'environment-observation',acousticWorld:{catalogPath:'world/catalog.json'},
   bindings:[{file:'world/catalog.json',sha256:catalogSha256}]}});
 const approvalFile=path.join(scope,'approval.json'),proofFile=path.join(scope,'proof.json');
 const epoch=new Date().toISOString(),stopByUtc=new Date(Date.now()+60_000).toISOString();
 const scopeSha256='a'.repeat(64),manifestSHA256=save(path.join(scope,'manifest.json'),{fixture:true});
 const approvalHash=save(approvalFile,{approvedReadOnly:true,packageDraftSha256:draftHash,scopeSha256,startUtc:epoch,stopByUtc});
 const proofHash=save(proofFile,{approvalSha:approvalHash,scopeSha:scopeSha256,epoch,stopByUtc,catalogSHA256:catalogSha256,manifestSHA256});
 const result=spawnSync(process.execPath,[script,draftFile,draftHash,proofFile,proofHash,approvalFile,approvalHash],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const manifest=fs.readFileSync(path.join(root,'playable.json'));
 assert.equal(JSON.parse(manifest).bindings.length,8);
 assert.equal(JSON.parse(fs.readFileSync(path.join(scope,'phase1-sidecars/RichAudio.Playable.json'))).manifestSha256,digest(manifest));
 assert.equal(JSON.parse(fs.readFileSync(path.join(scope,'materialized-package.json'))).approvedForLaunch,false);
});
