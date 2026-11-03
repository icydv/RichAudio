import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {suppliedBuildingFixture042} from './fixtures/SuppliedBuilding042.mjs';
import {inspectSuppliedBuilding042,prepareSuppliedBuilding042,isPreparedSuppliedBuilding042,encodeSuppliedBuildingSidecar042,decodeSuppliedBuildingSidecar042,createSuppliedBuildingInterior042} from '../src/acoustics/world/supplied-building042.mjs';
import {resourceInvalidation04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {ResourceTileStore04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {createInteriorState04,planInteriorPropagation04} from '../src/acoustics/world/interior04.mjs';
import {byteDigest,digest} from '../src/acoustics/world/contracts.mjs';
const near=(a,b)=>a.every((n,i)=>Math.abs(n-b[i])<1e-7),base=fileURLToPath(new URL('..',import.meta.url));
async function cleanup(root){const absolute=path.resolve(root),parent=path.resolve(base,'.local');assert.equal(path.dirname(absolute),parent);assert(/^supplied042-[^\\/]+$/.test(path.basename(absolute)));await fs.rm(absolute,{recursive:true,force:true});}
test('two original supplied sidecars bind exact triplets and prepare24 finite triangles through existing workers',async()=>{
 const f=suppliedBuildingFixture042(),p=prepareSuppliedBuilding042(f),b=new ResourceTileBuilder04(p);
 try{assert.equal(p.state,'prepared-original-supplied-building-fixture');assert.equal(isPreparedSuppliedBuilding042(p),true);assert.equal(isPreparedSuppliedBuilding042({...p}),false);assert.equal(p.installedWorldVerified,false);assert.equal(p.enhancedCompatibilityVerified,false);assert.equal(p.buildingSummaries.length,2);assert.equal(p.sidecar.coverage.outside,'unknown');assert.deepEqual(decodeSuppliedBuildingSidecar042(encodeSuppliedBuildingSidecar042(f.sidecar)),f.sidecar);
 const r=await b.prepareNearby({listenerAnchor:p.buildingSummaries[0].auditionPoses.listener,maximumTiles:2});assert.equal(r.state,'prepared',JSON.stringify(r));assert.deepEqual(b.contexts().map(c=>c.scene.tile.surfaces.length),[12,12]);assert.equal(b.stats.workersStarted,2);assert.equal(b.stats.workersJoined,2);assert.equal(b.stats.pcmQueueFramesAdded,0);assert.equal(b.stats.sourceGenerationsModified,0);assert.throws(()=>{p.session='0'.repeat(32);},TypeError);
 }finally{await b.close();}
});
test('GeometryCenter/root translation, nonuniform scale, engine quaternion and entity translation apply exactly once',async()=>{
 const f=suppliedBuildingFixture042(spec=>{const west=spec.buildings[0];west.rotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];west.scaleXY=2;west.scaleZ=1.5;west.geometryCenter=[.5,.25,0];west.collisionRootTransform[12]=1;}),p=prepareSuppliedBuilding042(f),summary=p.buildingSummaries[0],b=new ResourceTileBuilder04(p);
 try{assert(near(summary.calibration.controls[0].world,[-12.5,3,0]));assert(near(summary.calibration.controls[1].world,[-12.5,11,0]));assert.equal(p.sidecar.buildings[0].entity.sourceStoredQuaternion[2],-Math.SQRT1_2);assert.equal(summary.engineQuaternion[2],Math.SQRT1_2);
 const r=await b.prepareNearby({listenerAnchor:summary.auditionPoses.listener,maximumTiles:1});assert.equal(r.state,'prepared',JSON.stringify(r));const scene=b.contexts()[0].scene,points=scene.tile.surfaces.flatMap(s=>s.footprint.map(([u,v])=>s.center.map((n,i)=>n+s.u[i]*u+s.v[i]*v)));assert(points.some(p=>near(p,[-12.5,3,0])));assert(points.some(p=>near(p,[-20.5,11,4.5])));assert.equal(scene.tile.surfaces.length,12);
 }finally{await b.close();}
});
test('unknown/world-space ownership, raw CodeWalker quaternion convention, scale and calibration mismatches reject',()=>{
 const f=suppliedBuildingFixture042();for(const mutate of [x=>x.buildings[0].transform.inputFrame='world',x=>x.buildings[0].transform.inputFrame='unknown',x=>x.buildings[0].transform.rotationConvention='raw-codewalker-stored-xyzw',x=>x.buildings[0].transform.scaleXY=0,x=>x.buildings[0].transform.rotation=[0,0,0,2],x=>x.buildings[0].coordinates.controls[0].world[0]+=1,x=>x.buildings[0].entity.sourceStoredQuaternion=[0,0,1,0],x=>x.coverage.outside='empty']){const sidecar=structuredClone(f.sidecar);mutate(sidecar);assert.throws(()=>inspectSuppliedBuilding042(sidecar));}
});
test('resource, DTO and proof identities cannot be substituted or self-certified by JSON',()=>{
 const f=suppliedBuildingFixture042(),bad=Buffer.from(f.inputs.resourceBytes['west-ybn']);bad[bad.length-1]^=1;assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,resourceBytes:{...f.inputs.resourceBytes,'west-ybn':bad}}}),/resource byte identity/);
 const packets=structuredClone(f.inputs.decodedResources);packets['west-ymap'].decodedJson=packets['west-ymap'].decodedJson.replace('"position":[-12','"position":[-13');assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources:packets}}),/DTO identity/);
 const fake=prepareSuppliedBuilding042({...f,fixtureProof:{...f.fixtureProof}});assert.equal(fake.state,'unqualified-fixture-provenance');assert.equal(fake.inventory,null);assert.equal(fake.inputs,null);
 const sidecar=structuredClone(f.sidecar);sidecar.resources[0].logicalArchive='other-authored.rpf';const rebound=prepareSuppliedBuilding042({...f,sidecar});assert.equal(rebound.inventory,null);assert.equal(rebound.state,'unqualified-fixture-provenance');
});
test('simulated real RSC/XML exports retain identities but never enter fixture inventory, cache or scene',()=>{
 const f=suppliedBuildingFixture042(),sidecar=structuredClone(f.sidecar);sidecar.authority='user-supplied-resource-export';for(const r of sidecar.resources)r.encoding='rsc7-resource';const result=prepareSuppliedBuilding042({...f,sidecar});assert.equal(result.state,'unqualified-user-supplied-resource-evidence');assert.equal(result.inventory,null);assert.equal(result.inputs,null);assert.equal(result.installedWorldVerified,false);assert(result.missingEvidence.includes('separately-approved-resource-parser-and-process-receipt'));assert(result.missingEvidence.includes('native-coordinate-and-metre-calibration'));
 const xml=structuredClone(sidecar),resourceBytes={};for(const r of xml.resources){const bytes=Buffer.from('<OriginalContractFixture kind="'+r.kind+'"/>');r.encoding='xml-resource-export';r.logicalMember+='.xml';r.sourceSHA256=byteDigest(bytes);r.sourceBytes=bytes.length;r.decodedPacketSHA256=null;r.decodedJsonSHA256=null;resourceBytes[r.id]=bytes;}const xmlResult=prepareSuppliedBuilding042({sidecar:xml,inputs:{resourceBytes,decodedResources:{}},session:f.session});assert.equal(xmlResult.state,'unqualified-user-supplied-resource-evidence');assert.equal(xmlResult.inventory,null);
});
test('one authored building change invalidates only its exact dependent plan',()=>{
 const a=prepareSuppliedBuilding042(suppliedBuildingFixture042()),b=prepareSuppliedBuilding042(suppliedBuildingFixture042(s=>s.buildings[0].translation[0]-=1));const changed=resourceInvalidation04(a.inventory,b.inventory);assert.deepEqual(changed.map(x=>x.valid),[false,true]);assert.equal(a.inventory.tilePlans[1].planDigest,b.inventory.tilePlans[1].planDigest);assert.notEqual(a.buildingSummaries[0].contractDigest,b.buildingSummaries[0].contractDigest);assert.equal(a.buildingSummaries[1].contractDigest,b.buildingSummaries[1].contractDigest);
});
test('new private cache persists per-building tiles and trusted restart rebinds the new session',async()=>{
 const parent=path.join(base,'.local');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'supplied042-')),directory=path.join(root,'.local','cache');await fs.mkdir(directory,{recursive:true});const p=prepareSuppliedBuilding042(suppliedBuildingFixture042()),store=new ResourceTileStore04(root,directory);let b=new ResourceTileBuilder04({...p,store});
 try{let r=await b.prepareNearby({listenerAnchor:p.buildingSummaries[0].auditionPoses.listener,maximumTiles:2});assert.equal(r.state,'prepared',JSON.stringify(r));const trustedArtifacts=b.artifactBindings();await b.close();b=new ResourceTileBuilder04({...p,store,session:'3'.repeat(32),trustedArtifacts});r=await b.prepareNearby({listenerAnchor:p.buildingSummaries[1].auditionPoses.listener,maximumTiles:2});assert.equal(r.state,'prepared',JSON.stringify(r));assert.equal(b.stats.workersStarted,0);assert.equal(b.stats.cacheHits,2);assert(b.contexts().every(c=>c.scene.tile.session==='3'.repeat(32)));assert.equal(b.contexts().flatMap(c=>c.scene.tile.surfaces).length,24);
 }finally{await b.close();await cleanup(root);}
});
test('triangle room metadata stays unknown under unchanged legacy room-reference guard without altering geometry',async()=>{
 const p=prepareSuppliedBuilding042(suppliedBuildingFixture042()),b=new ResourceTileBuilder04(p);
 try{await b.prepareNearby({listenerAnchor:p.buildingSummaries[0].auditionPoses.listener,maximumTiles:1});const scene=b.contexts()[0].scene,before=digest(scene),topology=createSuppliedBuildingInterior042(p,'west',scene);assert.equal(scene.tile.surfaces.length,12);assert.equal(digest(scene),before);assert.deepEqual(topology.rooms[0].bounds,p.sidecar.buildings[0].interior.rooms[0].bounds);assert.equal(topology.rooms[0].completeness,'unknown');assert.deepEqual(topology.rooms[0].surfaces,{walls:[],floors:[],ceilings:[]});assert(topology.unknown.some(s=>s.includes('triangle-footprint-room-references-not-qualified')));assert.equal(topology.portals.length,0);
 const state=createInteriorState04(topology,{schema:1,kind:'RichAudioInteriorState04',authority:'original-authored-fixture',topologyDigest:topology.topologyDigest,session:p.session,generation:1,observedAt:0,validUntil:1000,activation:p.sidecar.buildings[0].activation.states,portals:{}}),route=planInteriorPropagation04(topology,state,{from:'outside',to:'west-room',sourcePosition:p.buildingSummaries[0].auditionPoses.source,listenerPosition:p.buildingSummaries[0].auditionPoses.listener,now:1,session:p.session,generation:1});assert.equal(route.reason,'unknown-room-geometry');assert.equal(route.routes.length,0);assert.equal(route.acousticRoutingApplied,false);
 assert.throws(()=>createSuppliedBuildingInterior042({...p},'west',scene),/branded/);
 }finally{await b.close();}
});
test('bounds, passive materials, sidecar limits and decoded JSON bounds reject before worker conversion',()=>{
 const f=suppliedBuildingFixture042();for(const mutate of [x=>x.buildings[0].materialTable[7].reflection=[1,1,1],x=>x.resources[0].sourceBytes=33554433,x=>x.resources[0].effectivePath='../escape.ymap',x=>x.mounts[0].evidenceDigest='unknown']){const sidecar=structuredClone(f.sidecar);mutate(sidecar);assert.throws(()=>inspectSuppliedBuilding042(sidecar));}
 const packets=structuredClone(f.inputs.decodedResources);packets['west-ymap'].decodedJson='x'.repeat(16777217);assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources:packets}}),/before canonical/);assert.throws(()=>decodeSuppliedBuildingSidecar042(Buffer.alloc(262145)),/bounded/);
});
test('undeclared resource and DTO input keys reject before payload access, cloning or retention',()=>{
 const f=suppliedBuildingFixture042();let accessed=false;const decodedResources={...f.inputs.decodedResources};Object.defineProperty(decodedResources,'unrelated-huge-dto',{enumerable:true,get(){accessed=true;throw Error('undeclared payload must never be accessed');}});
 assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources}}),/exact supplied input allowlist/);assert.equal(accessed,false);
 assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,resourceBytes:{...f.inputs.resourceBytes,'unrelated-resource':Buffer.alloc(16777217)}}}),/exact supplied input allowlist/);
});
test('JSON escaping expansion and sidecar nesting obey byte caps before canonical allocation',()=>{
 const f=suppliedBuildingFixture042(),packets=structuredClone(f.inputs.decodedResources);packets['west-ymap'].decodedJson='\0'.repeat(3000000);assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources:packets}}),/before canonical copying/);
 const sidecar=structuredClone(f.sidecar);sidecar.buildings[0].interior.unknown=['\0'.repeat(50000)];assert.throws(()=>encodeSuppliedBuildingSidecar042(sidecar),/before canonical copying/);
});
test('original authoring accepts closed numeric/coefficient specifications, never opaque resource or interior payloads',()=>{
 assert.throws(()=>suppliedBuildingFixture042(spec=>{spec.buildings[0].interior={sourceBytes:Buffer.from('not-authoring-data')};}),/interior flag|plain supplied JSON data container/);
 assert.throws(()=>suppliedBuildingFixture042(spec=>{spec.buildings[0].material={reflection:[.4,.3,.2],transmission:[0,0,0],basis:'authored-assumption',reference:'original',opaqueResource:Buffer.from('not-authoring-data')};}),/unsupported static-world fields|plain supplied JSON data container/);
});
test('dense JSON arrays reject hidden payloads, holes and accessors before authoring proof or DTO retention',()=>{
 for(const change of [s=>{s.buildings[0].translation.unrelated='original-unrelated-marker';},s=>{Object.defineProperty(s.buildings[0].collisionRootTransform,'hidden',{value:'original-hidden-marker'});},s=>{s.buildings[0].translation[Symbol('original-symbol')]='marker';},s=>{delete s.buildings[0].translation[1];},s=>{s.buildings[0].material={reflection:[.4,.3,.2],transmission:[0,0,0],basis:'authored-assumption',reference:'original'};s.buildings[0].material.reflection.extra='original-unrelated-marker';}])assert.throws(()=>suppliedBuildingFixture042(change),/dense supplied JSON arrays/);
 let read=false;assert.throws(()=>suppliedBuildingFixture042(s=>{Object.defineProperty(s.buildings[0].translation,'0',{enumerable:true,get(){read=true;return -12;}});}),/dense supplied JSON arrays/);assert.equal(read,false);
 const f=suppliedBuildingFixture042(),sidecar=structuredClone(f.sidecar);sidecar.buildings[0].coordinates.controls[0].world.unrelated='original-control-marker';assert.throws(()=>inspectSuppliedBuilding042(sidecar),/dense supplied JSON arrays/);
 const packets={...f.inputs.decodedResources},arrayPacket=Object.assign([],packets['west-ymap']);arrayPacket.unrelated='original-DTO-marker';packets['west-ymap']=arrayPacket;assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources:packets}}),/unsupported static-world fields|dense supplied JSON arrays/);
 const getterPacket={...f.inputs.decodedResources['west-ymap']};let dtoRead=false;Object.defineProperty(getterPacket,'decodedJson',{enumerable:true,get(){dtoRead=true;return 'original';}});assert.throws(()=>prepareSuppliedBuilding042({...f,inputs:{...f.inputs,decodedResources:{...f.inputs.decodedResources,'west-ymap':getterPacket}}}),/plain supplied JSON rejects/);assert.equal(dtoRead,false);
});
