import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {normalQualification01,openNormalQualificationEvidence01} from '../src/acoustics/world/normal-qualification01.mjs';

test('retained proof binds separately to one current launch and one producer claim',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-qualification-'));
 const session='a'.repeat(32),started=Date.now(),iso=ms=>new Date(ms).toISOString();
 fs.mkdirSync(path.join(root,'world'));
 fs.mkdirSync(path.join(root,'.local','gameplay',session),{recursive:true});
 const write=(name,value)=>{
  const b=Buffer.from(JSON.stringify(value));
  fs.writeFileSync(path.join(root,name),b);
  return createHash('sha256').update(b).digest('hex');
 };
 const catalogSha256=write('world/catalog.json',{authored:true}),gameSha256='b'.repeat(64),proofEpochUtc=iso(started);
 const manifestSha256=write('world/manifest.json',{ValidationEpochUtc01:proofEpochUtc,ResolvedCatalogSHA256:catalogSha256,
  InputBinding:{GameExecutableSHA256:gameSha256},Resources:Array(10663).fill(null)});
 const config={outputSink:'environment-observation',latencyProfile:'street-01',gameSha256,
  acousticWorld:{manifestPath:'world/manifest.json',catalogPath:'world/catalog.json'},
  bindings:[{file:'world/manifest.json',sha256:manifestSha256},{file:'world/catalog.json',sha256:catalogSha256}],
  retainedQualification01:{manifestSha256,catalogSha256,proofEpochUtc,stopByUtc:iso(started+5000)}};
 let now=started+100;
 const q=normalQualification01(config,root,session,{now:()=>now});
 assert.throws(()=>q.acceptLaunch(iso(started-1)),/launch epoch/);
 assert.equal(q.acceptLaunch(iso(started+50)),proofEpochUtc);
 assert.throws(()=>q.acceptLaunch(iso(started+60)),/launch epoch/);
 now=started+5000;
 assert.throws(()=>q.acceptLaunch(iso(started+50)),/expired/);
 assert.throws(()=>normalQualification01({...config,outputSink:null},root,session),/immutable/);
 const evidence=openNormalQualificationEvidence01(root,session,error=>{throw error;});
 assert.throws(()=>openNormalQualificationEvidence01(root,session,()=>{}),/EEXIST/);
 evidence.close();
});
