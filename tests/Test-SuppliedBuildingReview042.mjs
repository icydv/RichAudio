// Independent boundary controls for the new original-only supplied route.
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSuppliedBuilding042,createSuppliedBuildingInterior042} from '../src/acoustics/world/supplied-building042.mjs';
import {suppliedBuildingFixture042} from './fixtures/SuppliedBuilding042.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {prepareSuppliedBuildingView042} from '../tools/soundmap/supplied-building042.mjs';

test('prepared fixture owns byte copies and rejects undeclared DTOs before touching their payload',async()=>{
 const fixture=suppliedBuildingFixture042(),prepared=prepareSuppliedBuilding042(fixture),id=fixture.sidecar.resources[0].id;
 const before=Buffer.from(prepared.inputs.resourceBytes[id]);fixture.inputs.resourceBytes[id].fill(0);
 assert(prepared.inputs.resourceBytes[id].equals(before),'later caller mutation cannot alter retained source bytes');
 const builder=new ResourceTileBuilder04(prepared);
 try{assert.equal((await builder.prepareNearby({listenerAnchor:prepared.buildingSummaries[0].auditionPoses.listener,maximumTiles:1})).state,'prepared');}finally{await builder.close();}
 const untouched=suppliedBuildingFixture042(),packets={...untouched.inputs.decodedResources};let touched=false;
 Object.defineProperty(packets,'unrelated-review-payload',{enumerable:true,get(){touched=true;throw Error('unexpected payload access');}});
 assert.throws(()=>prepareSuppliedBuilding042({...untouched,inputs:{...untouched.inputs,decodedResources:packets}}),/allowlist/);assert.equal(touched,false);
});

test('same-session substituted triangle geometry and material cannot inherit exact interior source references',async()=>{
 const prepared=prepareSuppliedBuilding042(suppliedBuildingFixture042()),builder=new ResourceTileBuilder04(prepared);
 try{
  await builder.prepareNearby({listenerAnchor:prepared.buildingSummaries[0].auditionPoses.listener,maximumTiles:1});const scene=builder.contexts()[0].scene;
  const changed=structuredClone(scene.tile);changed.surfaces[0].center[0]+=.02;
  const forgedGeometry=acousticScene(createTile(changed),scene.materials,scene.config);
  assert.throws(()=>createSuppliedBuildingInterior042(prepared,'west',forgedGeometry),/geometry\/material derivation mismatch/);
  const materials=structuredClone(scene.materials),first=scene.tile.surfaces[0].id;materials[first].reflection=[.1,.1,.1];
  const forgedMaterial=acousticScene(scene.tile,materials,scene.config);
  assert.throws(()=>createSuppliedBuildingInterior042(prepared,'west',forgedMaterial),/geometry\/material derivation mismatch/);
  const genuine=createSuppliedBuildingInterior042(prepared,'west',scene);assert.equal(genuine.rooms[0].completeness,'unknown');assert.equal(genuine.portals.length,0);
 }finally{await builder.close();}
});

test('actual view close still joins scene preparation when builder cleanup rejects and repeated close retains failure',async()=>{
 const view=await prepareSuppliedBuildingView042(prepareSuppliedBuilding042(suppliedBuildingFixture042()));
 const closeBuilder=view.builder.close.bind(view.builder),closePreparation=view.preparation.close.bind(view.preparation),failure=Error('independent injected cleanup failure');let builderCalls=0,preparationCalls=0;
 view.builder.close=async()=>{builderCalls++;await closeBuilder();throw failure;};
 view.preparation.close=async()=>{preparationCalls++;await closePreparation();};
 try{
  const pending=view.close();assert.equal(view.close(),pending);
  await assert.rejects(pending,error=>error instanceof AggregateError&&error.errors.includes(failure));
  assert.equal(view.closed,true);assert.equal(view.builder.closed,true);assert.equal(view.preparation.closed,true);assert.equal(builderCalls,1);assert.equal(preparationCalls,1);
  await assert.rejects(view.close(),/cleanup failed/);assert.equal(builderCalls,1);assert.equal(preparationCalls,1);
 }finally{await closeBuilder();await closePreparation();}
});
