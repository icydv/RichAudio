// Original computational pressure, never evidence of installed-world readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCachePressure01,cachePressurePose01,pressureEpoch01} from './fixtures/CachePressure01.mjs';
import {InstalledStaticWorld01,installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';

test('original pressure preserves full raw work, adaptive passes and finite geometry',()=>{
 const scratch=path.resolve('.local/street01-cache-pressure01/tests-generated'),root=path.join(scratch,randomUUID());
 const fixture=createCachePressure01(root);let world;
 try{
  assert.equal(fixture.generatedFromInstalledData,false);assert.equal(fixture.historicalGeometryRead,false);
  const manifest=JSON.parse(fs.readFileSync(fixture.manifestPath)),catalog=JSON.parse(fs.readFileSync(fixture.catalogPath));
  assert.equal(manifest.Resources.length,10663);assert.equal(catalog.Resources.length,10663);
  const counts=manifest.Resources.slice(0,3).map(r=>JSON.parse(fs.readFileSync(r.Result.IndexPath)).chunks.reduce((n,c)=>n+c.count,0));
  assert.deepEqual(counts,[8192,8192,2099]);assert.equal((3*counts[0]+counts[1]+counts[2])*96+5*24,3347352);
  // The baseline's broad view is below its triangle cap but above the byte cap;
  // middle/small views separately fit yet cannot coexist under that same cap.
  const charged=records=>512+records*4096,byteLimit=64*1024*1024;
  assert(17268<32768);assert(charged(17268)>byteLimit);
  assert(charged(10932)<byteLimit);assert(charged(10628)<byteLimit);
  assert(charged(10932)+charged(10628)>byteLimit);
  world=new InstalledStaticWorld01({...fixture,privateRoot:root,requiredValidationEpochUtc01:pressureEpoch01,maximumResidentResources:8});
  const scene=world.window({...cachePressurePose01(0),session:'6'.repeat(32),geometryTimeMs:0,durationMs:1000,radius:32,maximumSurfaces:4096,adaptiveRadius:true}),metadata=installedStaticSceneMetadata01(scene);
  assert.equal(metadata.requestedRadius,32);assert.equal(metadata.activeRadius,8);assert.equal(metadata.adaptiveAttempts,3);
  assert.equal(metadata.trianglesQueried,789);assert.equal(scene.tile.surfaces.length,781);
  assert.equal(metadata.analyticGeometry.available,158);assert.equal(metadata.analyticGeometry.candidates,3);assert.equal(metadata.analyticGeometry.triangles,2436);
  assert.equal(metadata.omittedSurfaces,0);assert.equal(metadata.omittedResources,0);assert.equal(metadata.failures.length,0);
  assert.equal(metadata.runtimeActivationVerified,false);assert.equal(metadata.installedWorldVerified,false);
 }finally{world?.close();assert(root.startsWith(scratch+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});

test('pressure motion keeps the origin, neighbor and prolonged return in one reproducible sequence',()=>{
 const poses=Array.from({length:220},(_,i)=>cachePressurePose01(i));
 assert.equal(poses.filter(p=>p.phase==='long-return-pressure').length,120);
 assert.deepEqual([...new Set(poses.map(p=>p.generation))],[1,2,3]);
 assert(poses.filter(p=>p.phase==='smooth-pressure').every(p=>p.listener[0]<.4));
 assert(poses.filter(p=>p.phase==='neighbor-crossing').some(p=>p.listener[0]>30));
 assert(poses.filter(p=>p.phase==='long-return-pressure').every(p=>p.listener[0]<1));
 for(const p of poses)assert.deepEqual(p.sources[0],[p.listener[0]+1,p.listener[1],p.listener[2]-.3]);
});
