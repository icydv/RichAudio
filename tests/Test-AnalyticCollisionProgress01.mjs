// Actual archive-scoped preparation CLI at its interim-progress boundary.
// The authored rows share one immutable original artifact; no archive exists,
// and no game/parser/decoder is used by this regression.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
test('actual archive-scoped CLI checkpoints more than sixteen retained resources and preserves other archive state',t=>{
 const fixture=originalInstalledCache01(),evidence=path.join(repo,'.local','street01','analytic-progress-tests',randomUUID());fs.mkdirSync(evidence,{recursive:true});
 try{
  const base=fixture.manifest.InputFingerprint,row=fixture.manifest.Resources[0],other={...structuredClone(row),Id:'other-archive-awaiting-verification',PhysicalArchive:'other_original.rpf',Status:'cache-awaiting-archive-revalidation'};
  fixture.manifest.Resources=Array.from({length:17},(_,i)=>({...structuredClone(row),Id:'original-progress-'+i,PhysicalArchive:'a.rpf'})).concat(other);
  delete fixture.manifest.AnalyticUpgrade01;fs.writeFileSync(fixture.manifestPath,JSON.stringify(fixture.manifest));
  const indexBytes=fs.readFileSync(fixture.result.index),receiptBytes=fs.readFileSync(row.Result.ReceiptPath),index=JSON.parse(indexBytes),chunks=index.chunks.map(c=>({file:path.join(path.dirname(fixture.result.index),c.file),sha256:c.sha256}));
  const result=spawnSync(process.execPath,[path.join(repo,'src/acoustics/world/world-warmup.mjs'),'upgrade-analytic',fixture.manifestPath,fixture.root,fixture.catalogPath,fixture.catalogSHA256,'5000','a.rpf','a'.repeat(64)],{encoding:'utf8',timeout:10000,windowsHide:true});
  fs.writeFileSync(path.join(evidence,'stderr.log'),result.stderr??'');fs.writeFileSync(path.join(evidence,'stdout.log'),result.stdout??'');assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);
  const updated=JSON.parse(fs.readFileSync(fixture.manifestPath)),summary=JSON.parse(fs.readFileSync(path.join(fixture.root,'summary.json')));
  assert.equal(updated.Resources.length,18);assert.equal(updated.AnalyticUpgrade01.resourcesVisited,17);assert.equal(updated.AnalyticUpgrade01.failedResources,0);assert.equal(updated.AnalyticUpgrade01.newIndexBytes,0);assert.equal(updated.AnalyticUpgrade01.archiveDecoded,false);
  assert.ok(updated.Resources.slice(0,17).every(r=>r.Status==='imported-exterior-incomplete-surfaces'));assert.deepEqual(updated.Resources[17],other);assert.equal(summary.ProcessedResources,17);assert.equal(summary.CacheRevalidationPending,1);
  assert.equal(updated.BaseInputFingerprint01,base);assert.match(updated.InputFingerprint,/^[a-f0-9]{64}$/);assert.notEqual(updated.InputFingerprint,base);assert.deepEqual(fs.readFileSync(fixture.result.index),indexBytes);assert.deepEqual(fs.readFileSync(row.Result.ReceiptPath),receiptBytes);for(const chunk of chunks)assert.equal(sha256(fs.readFileSync(chunk.file)),chunk.sha256);
  const receipt={schema:1,nodeVersion:process.version,resourcesVisited:17,totalRows:18,actualProductionCLI:true,scopePreserved:true,originalIndexesChunksReceiptsUnchanged:true,completeWithoutArchiveFile:true,archiveDecoded:false,gameRead:false,vendorAssemblyLoaded:false,handlerSHA256:sha256(fs.readFileSync(path.join(repo,'src/acoustics/world/world-warmup.mjs'))),summary};fs.writeFileSync(path.join(evidence,'validation.json'),JSON.stringify(receipt,null,2)+'\n');
  t.diagnostic('Original actual CLI progress receipt: '+evidence);
 }finally{fixture.close();}
});
