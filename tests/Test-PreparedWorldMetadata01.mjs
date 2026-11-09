import {publishWarmupManifest01} from '../src/acoustics/world/world-warmup.mjs';
import path from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {createMetadataStage01,metadataOperations01,isPreparedWorldMetadata01} from '../src/acoustics/world/prepared-world-metadata01.mjs';import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){const start=performance.now();while(!fn()){assert(performance.now()-start<7000);await wait(5);}}
test('metadata staging preserves exact immutable shared identities and rejects incomplete, oversized and corrupted snapshots',()=>{
 const shared={proof:'original'},input={a:shared,b:shared,rows:[{id:1}]},packet=[...metadataOperations01(input)],digest=createHash('sha256').update(JSON.stringify(packet)).digest('hex'),stage=createMetadataStage01();stage.accept(packet);const result=stage.finish(digest);assert.deepEqual(JSON.parse(JSON.stringify(result)),input);assert.equal(result.a,result.b);assert(Object.isFrozen(result.rows[0]));assert(isPreparedWorldMetadata01(result));assert(!isPreparedWorldMetadata01(structuredClone(result)));
 const corrupt=createMetadataStage01();corrupt.accept(packet);assert.throws(()=>corrupt.finish('0'.repeat(64)),/digest/);const incomplete=createMetadataStage01();incomplete.accept([['node',0,'object']]);assert.throws(()=>incomplete.finish(digest),/Complete/);assert.throws(()=>createMetadataStage01().accept([['node',0,'object'],['set',0,'x','x'.repeat(32768)]]),/Bounded/);assert.throws(()=>[...metadataOperations01({large:'x'.repeat(16385)})],/scalar/);
});
test('a changed validation epoch withholds scenes; a newly validated catalogue installs with a new binding',async()=>{
 const f=installedSceneFixture01(),epoch='2026-11-06T00:00:00.000Z';f.publish(1,{validationEpochUtc01:epoch});const scenes=[],s=new InstalledSceneService01({config:{manifestPath:f.manifestPath,catalogPath:f.catalogPath,expectedGameSHA256:f.gameSHA256},session:'e'.repeat(32),onScene:x=>scenes.push(x)});
 try{s.bindPreparationEpoch01(epoch);await until(()=>s.ready||s.failed);assert.equal(s.failed,false,s.failure);const first=s.bindingEpoch,m=JSON.parse(fs.readFileSync(f.manifestPath));m.ValidationEpochUtc01='2026-11-06T00:00:01.000Z';fs.writeFileSync(f.manifestPath+'.next',JSON.stringify(m));fs.renameSync(f.manifestPath+'.next',f.manifestPath);s.updateWindow({listener:[0,0,1],generation:1,geometryTimeMs:performance.now()});await until(()=>!s.ready||s.failed);await until(()=>s.snapshot().cacheTimings?.metadataPreparing01===false||s.failed);assert.equal(s.failed,false,s.failure);assert.equal(scenes.length,0);f.publish(2,{validationEpochUtc01:epoch});await until(()=>s.ready&&s.bindingEpoch>first||s.failed);assert.equal(s.failed,false,s.failure);assert.equal(s.catalogBinding,f.config.catalogSHA256);
 }finally{assert.equal((await s.close()).workerJoined,true);f.close();}
});
test('superseded preparation never installs and corrupted current metadata fails closed with joined workers',async()=>{
 const f=installedSceneFixture01(),service=new InstalledSceneService01({config:f.config,session:'d'.repeat(32)});let calls=0,timer;service.onScene=()=>calls++;
 try{await until(()=>service.ready||service.failed);assert.equal(service.failed,false,service.failure);const original=JSON.parse(fs.readFileSync(f.manifestPath));let changed=false;timer=setInterval(()=>{const m={...original,OriginalProgress01:++calls};fs.writeFileSync(f.manifestPath+'.next',JSON.stringify(m));fs.renameSync(f.manifestPath+'.next',f.manifestPath);changed=true;},2);
  await until(()=>changed&&(service.snapshot().cacheTimings?.supersededSnapshots01??0)>0||service.failed);clearInterval(timer);assert.equal(service.failed,false,service.failure);await until(()=>service.snapshot().cacheTimings?.metadataPreparing01===false||service.failed);
  const bad=structuredClone(original);bad.InputBinding.GameExecutableSHA256='f'.repeat(64);fs.writeFileSync(f.manifestPath+'.next',JSON.stringify(bad));fs.renameSync(f.manifestPath+'.next',f.manifestPath);service.updateWindow({listener:[0,0,1],sources:[],generation:1,geometryTimeMs:performance.now()});await until(()=>service.failed);assert.match(service.failure,/same installed catalogue\/game\/parser cache binding/);assert.equal((await service.close()).workerJoined,true);
 }finally{clearInterval(timer);await service.close();f.close();}
});

test('manifest proof refresh starts independently of the next scene request',async()=>{
  const f=installedSceneFixture01();
  const service=new InstalledSceneService01({config:f.config,session:'ed'.repeat(16)});
  try {
    await until(()=>service.ready||service.failed);
    assert.equal(service.failed,false,service.failure);
    // Let the initial startup timer switch to the installed-world cadence.
    await wait(1100);
    const before=service.snapshot().cacheTimings.metadataInstalledAt01;
    const updated={...JSON.parse(fs.readFileSync(f.manifestPath)),UnrelatedPreparationProgress:1};
    fs.writeFileSync(f.manifestPath+'.next',JSON.stringify(updated));
    fs.renameSync(f.manifestPath+'.next',f.manifestPath);
    const began=performance.now();
    while(!service.failed&&!(service.snapshot().cacheTimings?.metadataInstalledAt01>before)&&performance.now()-began<500)await wait(5);
    assert.equal(service.failed,false,service.failure);
    assert.ok(service.snapshot().cacheTimings.metadataInstalledAt01>before,'refresh should finish before the next ordinary 500 ms dispatch');
    assert.equal(service.stats.dispatched,0,'proof refresh has no pose or scene request');
  } finally {
    assert.equal((await service.close()).workerJoined,true);
    f.close();
  }
});

test('current proof uses the manifest-bound driver view and falls back on corruption',async()=>{
  const f=installedSceneFixture01();
  const service=new InstalledSceneService01({config:f.config,session:'fc'.repeat(16)});
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  const driver=path.join(f.root,'driver-plan01.json');
  try {
    await until(()=>service.ready||service.failed);
    const original=read(f.manifestPath);
    const check=async(progress,corrupt,basis)=>{
      const before=service.snapshot().cacheTimings.metadataInstalledAt01;
      publishWarmupManifest01(f.manifestPath,{...original,AuthoredProgress:progress});
      if(corrupt){
        const view=read(driver);
        view.SceneAuthority01.rows[0][1]='0'.repeat(64);
        fs.writeFileSync(driver,JSON.stringify(view));
      }
      await until(()=>service.failed||service.snapshot().cacheTimings?.metadataInstalledAt01>before);
      assert.equal(service.failed,false,service.failure);
      assert.equal(service.snapshot().cacheTimings.metadataProofBasis01,basis);
      assert.equal(service.stats.dispatched,0);
    };
    await check(1,false,'manifest-bound-driver-view');
    await check(2,true,'full-manifest');
  } finally {
    assert.equal((await service.close()).workerJoined,true);
    f.close();
  }
});
