// A partial authored model may remain useful, but required cached-input failure
// must never pass the genuine qualification's actual pre-consumer guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createCachePressure01,cachePressurePose01,pressureEpoch01} from './fixtures/CachePressure01.mjs';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';

// Read source text only: importing this entry point would request installed IO.
const measurement=fs.readFileSync(new URL('../tools/Measure-NormalWorldReadiness01.mjs',import.meta.url),'utf8');
const predicates=[...measurement.matchAll(/localReadinessQualified=([^;\r\n]+);/g)];
assert.equal(predicates.length,1);
const predicate=new vm.Script('Boolean('+predicates[0][1]+')');
const prefix=measurement.match(/onScene:\(scene,receipt\)=>\{([\s\S]*?)cost\.scenePublications\+\+;/)?.[1];
assert(prefix,'actual consumer callback guard must precede publication accounting');
assert(measurement.indexOf(prefix)<measurement.indexOf('engine.queueInstalledStaticScene01(scene,receipt)'));
const guard=new vm.Script(prefix+'reachedConsumerQueue=true;');
const eligible=()=>({requiredCacheQueryFailures01:0,diagnosticWriteFailure01:null,service:{failed:false},cost:{consumerAcceptances:1},engine:{installedSceneDiagnostics01:{renewals:10}},minimumRenewals01:10,terminalConsumer01:{clockVerified:true,fresh:true,activeSceneMatches:true,environmentalReadiness01:{state:'active',renewalQualified:true}},consumerLeaseGaps01:{count:0},audioActivity01:{bankResolutions:0,sourceCreations:0,renderCalls:0,pipelineProcessCalls:0,rendererProcessCalls:0},retainedLocalProof:true,invalidatedSource:false,publications:{failedPublications:0},broaderPreparationCompleted:true,controlledBudget:false,processReceipt:{ControlJoined:true},closure:{workerJoined:true},forced:false,sourcePinsUnchanged:true});

for(const failure of ['cold-corruption','cold-missing'])test('actual qualification rejects a nonempty partial model after '+failure,()=>{
 const scratch=path.resolve('.local/street01-cache-pressure01/qualification-original'),root=path.join(scratch,randomUUID()),fixture=createCachePressure01(root);let world;
 try{
  const manifest=JSON.parse(fs.readFileSync(fixture.manifestPath)),row=manifest.Resources[1],index=JSON.parse(fs.readFileSync(row.Result.IndexPath)),chunk=path.resolve(path.dirname(row.Result.IndexPath),index.chunks[0].file);
  assert(chunk.startsWith(root+path.sep),'only the newly authored fixture may change');
  if(failure==='cold-corruption'){const bytes=fs.readFileSync(chunk),stat=fs.statSync(chunk);bytes[bytes.length-1]^=1;fs.writeFileSync(chunk,bytes);fs.utimesSync(chunk,stat.atime,stat.mtime);}else fs.unlinkSync(chunk);
  world=new InstalledStaticWorld01({...fixture,privateRoot:root,requiredValidationEpochUtc01:pressureEpoch01});
  const scene=world.window({...cachePressurePose01(0),session:'e'.repeat(32),geometryTimeMs:0,durationMs:1000,radius:32,maximumSurfaces:4096,adaptiveRadius:true}),status=world.status();
  assert.equal(scene.tile.surfaces.length,781,'valid resource A remains a genuinely nonempty authored control');
  assert(status.queryFailures>0,'discarded broad passes cannot erase failed required resource B');
  const clean={scene,receipt:{},installedStaticSceneMetadata01:()=>({}),requiredCacheQueryFailures01:0,service:{snapshot:()=>({queryFailures:0})},reachedConsumerQueue:false};
  guard.runInNewContext(clean);assert.equal(clean.reachedConsumerQueue,true);
  const rejected={...clean,requiredCacheQueryFailures01:0,service:{snapshot:()=>status},reachedConsumerQueue:false};
  assert.throws(()=>guard.runInNewContext(rejected),/Required cached-resource query failed/);
  assert.equal(rejected.reachedConsumerQueue,false);assert.equal(rejected.requiredCacheQueryFailures01,status.queryFailures);
  assert.equal(predicate.runInNewContext({...eligible(),requiredCacheQueryFailures01:status.queryFailures}),false,'even an earlier accepted fresh scene cannot rescue the terminal qualification');
  const recovered={...rejected,service:{snapshot:()=>({queryFailures:0})}};assert.throws(()=>guard.runInNewContext(recovered),/Required cached-resource query failed/,'a later zero counter cannot erase the lifetime failure');
 }finally{world?.close();assert(root.startsWith(scratch+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
