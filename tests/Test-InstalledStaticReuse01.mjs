// Entirely original derived-cache challenges. No installed files, vendor API,
// endpoint, game process, capture or rendering are involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {InstalledStaticWorld01,installedStaticSceneMetadata01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';
const request={listener:[0,-3,1],sources:[[1,-3,1]],session:'1'.repeat(32),generation:1,geometryTimeMs:0,durationMs:1000,radius:4,maximumSurfaces:2048};
const write=(f,value)=>fs.writeFileSync(f,JSON.stringify(value));
const expected=(f,r=request)=>({...r,catalogSHA256:f.catalogSHA256});

test('only the exact immutable encoded factory packet retains complete validation and the prepared index',()=>{
 const f=originalInstalledCache01();try{const w=new InstalledStaticWorld01(f),scene=w.window(request),packet=encodeInstalledStaticScene01(scene),prepared=prepareInstalledStaticSceneTransfer01(packet,expected(f));
  assert.equal(Object.isFrozen(packet),true);assert.throws(()=>{packet.tile.surfaces[0].center[0]++;},TypeError);
  assert.equal(prepared.scene,scene);assert.equal(prepared.profile01.reusedValidatedFactoryScene,true);
  const cloned=prepareInstalledStaticSceneTransfer01(structuredClone(packet),expected(f));assert.notEqual(cloned.scene,scene);assert.equal(cloned.profile01.reusedValidatedFactoryScene,false);assert.deepEqual(cloned.scene,scene);
  for(const change of [{session:'2'.repeat(32)},{generation:2},{geometryTimeMs:1},{durationMs:999},{catalogSHA256:'f'.repeat(64)}])assert.throws(()=>prepareInstalledStaticSceneTransfer01(packet,{...expected(f),...change}),/matches request/);
  assert.equal(prepared.gpuGeometry.bodyBytes.buffer.byteLength,scene.tile.surfaces.length*64);w.close();
 }finally{f.close();}
});

test('moving poses, clipping boundaries and generation changes reuse only exact static shapes',()=>{
 const f=originalInstalledCache01({distantWall:true});try{const held=new InstalledStaticWorld01(f);
  for(const [index,listener]of [[0,[0,-3,1]],[1,[.05,-2.9,1]],[2,[3.999999999,-3,1]],[3,[12,-3,1]],[4,[0,-3,1]]]){
   const r={...request,listener,sources:[[listener[0]+1,listener[1],1]],generation:index+1,geometryTimeMs:index*200},fresh=new InstalledStaticWorld01(f),a=held.window(r),b=fresh.window(r);
   assert.deepEqual(a,b);assert.deepEqual(querySegment(a.tile,[listener[0],-1,1],[listener[0],1,1]),querySegment(b.tile,[listener[0],-1,1],[listener[0],1,1]));
   assert.equal(a.tile.createdAt,r.geometryTimeMs);assert.equal(a.tile.validUntil,r.geometryTimeMs+1000);assert(a.tile.surfaces.every(s=>s.observedAt===r.geometryTimeMs&&s.validUntil===r.geometryTimeMs+1000));fresh.close();
  }
  assert(held.profile01().queryViewHits>0);assert(held.profile01().queryViews<=held.profile01().maximumQueryViews);assert(held.profile01().queryViewBytes<=held.profile01().maximumQueryViewBytes);held.close();assert.equal(held.profile01().queryViews,0);
 }finally{f.close();}
});

test('same-size chunk corruption with its mtime restored is rejected on an otherwise reusable view',()=>{
 const f=originalInstalledCache01();try{const w=new InstalledStaticWorld01(f);w.window(request);w.window({...request,generation:2});assert.equal(w.lastWindowProfile01.queryViewHits,1);
  const index=JSON.parse(fs.readFileSync(f.result.index)),file=path.join(path.dirname(f.result.index),index.chunks[0].file),stat=fs.statSync(file),bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);fs.utimesSync(file,stat.atime,stat.mtime);
  assert.equal(fs.statSync(file).size,stat.size);assert(Math.abs(fs.statSync(file).mtimeMs-stat.mtimeMs)<1);
  const scene=w.window({...request,generation:3}),metadata=installedStaticSceneMetadata01(scene);assert.equal(scene.tile.surfaces.length,0);assert.equal(metadata.successfulResources,0);assert.match(metadata.failures[0],/chunk integrity/);assert(scene.tile.missingRegions.length>0);assert.equal(w.profile01().queryViews,0);w.close();
 }finally{f.close();}
});

test('current archive proof revocation and restoration invalidate resident geometry independently of the index hash',()=>{
 const f=originalInstalledCache01(),epoch='2026-11-05T00:00:00.000Z';try{const row=f.manifest.Resources[0];f.manifest.ValidationEpochUtc01=epoch;row.ArchiveValidation01={EpochUtc:epoch,Source:'current-archive-sha256',ArchiveSHA256:row.Result.ArchiveSHA256};write(f.manifestPath,f.manifest);const w=new InstalledStaticWorld01({...f,requiredValidationEpochUtc01:epoch});w.window(request);w.window({...request,generation:2});assert.equal(w.profile01().queryViews,1);
  row.ArchiveValidation01.ArchiveSHA256='f'.repeat(64);write(f.manifestPath,f.manifest);w.reload();assert.equal(w.profile01().residentResources,0);assert.equal(w.profile01().queryViews,0);const rejected=w.window({...request,generation:3});assert.equal(rejected.tile.surfaces.length,0);assert.equal(installedStaticSceneMetadata01(rejected).localReadiness.firstBlocker,'local-current-validation-pending');
  row.ArchiveValidation01.ArchiveSHA256=row.Result.ArchiveSHA256;write(f.manifestPath,f.manifest);w.reload();assert.equal(w.window({...request,generation:4}).tile.surfaces.length,2);assert.equal(w.status().resourceLoads,2);assert.equal(w.lastWindowProfile01.queryViewHits,0);w.close();
 }finally{f.close();}
});

test('changed index and receipt bindings, plus resource eviction, cannot reuse an old query view',()=>{
 const f=originalInstalledCache01();try{const w=new InstalledStaticWorld01({...f,maximumResidentResources:1});w.window(request);const original=structuredClone(f.manifest.Resources[0]),alternate=structuredClone(original),receipt=JSON.parse(fs.readFileSync(original.Result.ReceiptPath));receipt.OriginalTestIdentity='second-owned-resource-binding';const receiptPath=path.join(f.root,'receipt-alternate.json');write(receiptPath,receipt);alternate.Id='original-alternate-wall';alternate.Result.ReceiptPath=receiptPath;alternate.Result.ReceiptSHA256=sha256(fs.readFileSync(receiptPath));f.manifest.Resources=[original,alternate];write(f.manifestPath,f.manifest);w.reload();w.window({...request,generation:2});assert.equal(w.profile01().residentResources,1);assert.equal(w.profile01().queryViews,1);assert(w.profile01().queryViewEvictions>=1);
  const corrupted=JSON.parse(fs.readFileSync(f.result.index));corrupted.counts.triangles++;write(f.result.index,corrupted);alternate.Result.IndexSHA256=sha256(fs.readFileSync(f.result.index));f.manifest.Resources=[alternate];write(f.manifestPath,f.manifest);w.reload();assert.equal(w.profile01().queryViews,0);const rejected=w.window({...request,generation:3});assert.equal(rejected.tile.surfaces.length,0);assert.match(installedStaticSceneMetadata01(rejected).failures[0],/triangle count/);w.close();
 }finally{f.close();}
});
