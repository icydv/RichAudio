// This uses only authored arithmetic data and never invokes render or a bank.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCachePressure01,cachePressurePose01,pressureEpoch01} from './fixtures/CachePressure01.mjs';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
import {budgetSession042 as session} from './fixtures/AcousticBudget042.mjs';

test('the full pressure scene reaches StockGameplay while expired and old-generation replays fail without PCM',async()=>{
 const scratch=path.resolve('.local/street01-cache-pressure01/tests-generated'),root=path.join(scratch,randomUUID()),fixture=createCachePressure01(root);let at=0,world;
 const attempts={resolve:0,create:0},engine=new StockGameplay({registry:{resolve(){attempts.resolve++;throw Error('No banks in this test');},createSource(){attempts.create++;throw Error('No PCM in this test');}},session,now:()=>at,continuityPolicy:'camera-source-01'});
 engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:false,airflowLevel:.35});
 try{
  const pose=cachePressurePose01(0),frame=airflowFrameStreet01(1,0,{speed:0,cameraGeneration:1});frame.listener.position=pose.listener;frame.vehicles[0].position=pose.sources[0];engine.accept(frame,0,200);
  world=new InstalledStaticWorld01({...fixture,privateRoot:root,requiredValidationEpochUtc01:pressureEpoch01,maximumResidentResources:8});
  // A controlled clock is deliberate here: this is a consumer rejection test,
  // not a latency measurement. Cadence profiles use the real process clock.
  const scene=world.window({...pose,session,geometryTimeMs:0,durationMs:1000,radius:32,maximumSurfaces:4096,adaptiveRadius:true,engine:engine.direct.config});
  assert.equal(scene.tile.surfaces.length,781);const receipt={requestId:1,generation:1,geometryTimeMs:0,requestedAt:0,expiresAt:1000};
  engine.queueInstalledStaticScene01(scene,receipt);assert.equal(engine.applyPendingInstalledStaticScene01(),true);assert.equal(engine.pipeline.simulation.scene,scene);assert.equal(scene.tile.createdAt,0);assert.equal(scene.tile.validUntil,1000);
  at=200;const next=airflowFrameStreet01(2,.2,{speed:0,cameraGeneration:2});next.listener.position=pose.listener;next.vehicles[0].position=pose.sources[0];engine.accept(next,0,200);
  engine.queueInstalledStaticScene01(scene,{...receipt,requestId:2});assert.equal(engine.applyPendingInstalledStaticScene01(),false);assert.equal(engine.installedSceneDiagnostics01.recent.at(-1).reason,'source-generation-changed');
  at=1000;engine.queueInstalledStaticScene01(scene,{...receipt,requestId:3});assert.equal(engine.applyPendingInstalledStaticScene01(),false);assert.equal(engine.installedSceneDiagnostics01.recent.at(-1).reason,'expired-before-application');
  assert.deepEqual(attempts,{resolve:0,create:0});assert.equal(engine.pipeline.renderer.frame,0);assert.equal(engine.installedSceneDiagnostics01.accepted,1);assert.equal(engine.installedSceneDiagnostics01.rejected,2);
 }finally{world?.close();await engine.close();assert(root.startsWith(scratch+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
