import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {admittedOriginalXml05} from './fixtures/AdmittedXml05.mjs';
import {prepareXmlBuildingView05,startXmlBuildingService05} from '../tools/soundmap/xml-building05.mjs';
import {ResourceTileStore04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {rebindCachedXmlAdmission05} from '../src/acoustics/world/xml-evidence05.mjs';
import {visibleContext} from '../tools/soundmap/ui/model.mjs';
async function root(){return fs.mkdtemp(path.join(os.tmpdir(),'richaudio-world05-view-'));}
async function cleanup(p){assert.equal(path.dirname(path.resolve(p)),path.resolve(os.tmpdir()));assert(path.basename(p).startsWith('richaudio-world05-view-'));await fs.rm(p,{recursive:true,force:true});}
test('actual XML reaches the existing pipeline and solver with exact read-only display alignment',async()=>{
 const f=admittedOriginalXml05(),view=await prepareXmlBuildingView05(f);
 try{
 assert.equal(view.info.qualified,true);assert.equal(view.pipeline.scene.tile.surfaces.length,12);assert.equal(view.info.genuineResourceVerified,false);assert.equal(view.info.viewerCanPublishAcoustics,false);
 assert.equal(view.inspection.kind,'cached-XML-display-supports05');assert.equal(view.inspection.triangles.length,0,'no second collision conversion for presentation');
 const frame=view.sample.soundMapFrame,geometry=view.sample.soundMapGeometry;assert(frame.paths.some(p=>p.status==='selected'&&p.order>0));assert.equal(geometry.surfaces.length,12);
 for(const p of frame.paths.filter(p=>p.status==='selected')){assert(p.vertices.length>=2);assert(Math.abs(p.delay-p.distance/343)<1e-8);}
 assert.equal(visibleContext(view.context,geometry,frame.listener.position).tiles.length,1);assert.equal(view.context.acousticUse,false);
 const early=frame.sources.map(s=>s.position),later=view.step(35).soundMapFrame;assert.notDeepEqual(later.sources.map(s=>s.position),early);assert.deepEqual(later.sources.map(s=>[s.id,s.generation]),frame.sources.map(s=>[s.id,s.generation]));assert.equal(later.geometryGeneration,frame.geometryGeneration);
 }finally{await view.close();}
});
test('unqualified XML remains inspectable geometry with no scene, source or invented solver path',async()=>{
 const f=admittedOriginalXml05(),view=await prepareXmlBuildingView05({...f,admission:null}),p=await root();let service;
 try{assert.equal(view.info.qualified,false);assert.equal(view.info.originalFixture,false);assert.equal(view.info.qualification,'unqualified-inspection-only');assert.equal(view.pipeline,null);assert.equal(view.sample,null);assert.equal(view.step,null);assert.equal(view.context.tiles[0].faces.length,12);assert.equal(visibleContext(view.context,null,null).tiles.length,1);
 service=await startXmlBuildingService05({view,root:p});await assert.rejects(service.publish({}),/qualified open/);const r=await fetch(service.service.descriptor.url+'/api/status',{headers:{'X-RichAudio-Token':service.service.descriptor.token}});assert.equal((await r.json()).connected,false);
 }finally{await service?.close();await view.close();await cleanup(p);}
});
test('persisted XML tile restart requires no XML source buffers or conversion worker for SoundMap',async()=>{
 const f=admittedOriginalXml05(),p=await root(),dir=path.join(p,'.local/cache');await fs.mkdir(dir,{recursive:true});let first,second;
 try{
 const store=new ResourceTileStore04(p,dir);first=await prepareXmlBuildingView05({...f,store});const artifacts=first.pipeline.artifactBindings;await first.close();first=null;
 const admission=rebindCachedXmlAdmission05({witness:JSON.parse(JSON.stringify(f.witness)),reviewPolicy:f.reviewPolicy,expectedQualificationDigest:f.witness.qualificationDigest});
 let touched=0;const noInputs={get resourceBytes(){touched++;throw Error('XML source was unnecessarily read');},get decodedResources(){touched++;throw Error('XML DTO input was unnecessarily copied');}};
 second=await prepareXmlBuildingView05({...f,decoded:JSON.parse(JSON.stringify(f.decoded)),admission,inputs:noInputs,session:'7'.repeat(32),store,trustedArtifacts:artifacts});
 assert.equal(second.pipeline.builder.stats.cacheHits,1);assert.equal(second.pipeline.builder.stats.workersStarted,0);assert.equal(touched,0);assert.equal(second.sample.soundMapGeometry.surfaces.length,12);assert.equal(second.inspection.kind,'cached-XML-display-supports05');
 }finally{await first?.close();await second?.close();await cleanup(p);}
});
test('forged view/altered presentation DTO cannot inherit an admitted source or HTTP publication',async()=>{
 const f=admittedOriginalXml05(),changed=JSON.parse(JSON.stringify(f.decoded));changed.resources[0].normalized.data.entities[0].position[0]=999;
 await assert.rejects(prepareXmlBuildingView05({...f,decoded:changed}),/binding/);await assert.rejects(startXmlBuildingService05({view:{info:{qualified:true}},root:'unused'}),/branded/);
});
test('read-only view publishes only actual solver samples and blocks browser replay/recording',async()=>{
 const f=admittedOriginalXml05(),view=await prepareXmlBuildingView05(f),p=await root();let server;
 try{server=await startXmlBuildingService05({view,root:p});const base=server.service.descriptor.url,headers={'X-RichAudio-Token':server.service.descriptor.token};
 const info=await(await fetch(base+'/api/xml-building05',{headers})).json();assert.equal(info.resources.length,3);assert.equal(info.genuineResourceVerified,false);assert.equal(info.cache.stats.workersStarted,1);
 assert.equal((await fetch(base+'/api/xml-context05',{headers:{'X-RichAudio-Token':'é'.repeat(64)}})).status,403);
 for(const url of ['/api/record/start','/api/replay/open','/api/telemetry','/api/service/stop'])assert.equal((await fetch(base+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,405);
 for(const url of ['/api/recordings','/api/replay/audio'])assert.equal((await fetch(base+url,{headers})).status,405);
 assert.equal((await server.publish(view.step(.35))).accepted,true);await view.close();await assert.rejects(server.publish(view.sample),/qualified open/);
 }finally{await server?.close();await view.close();await cleanup(p);}
});
test('cleanup joins scene preparation even when builder close throws synchronously',async()=>{
 const f=admittedOriginalXml05(),view=await prepareXmlBuildingView05(f),pipeline=view.pipeline,real=pipeline.builder.close.bind(pipeline.builder),prepareClose=pipeline.preparation.close.bind(pipeline.preparation);let count=0;
 pipeline.builder.close=()=>{throw Error('original injected builder close failure');};pipeline.preparation.close=async()=>{count++;await prepareClose();};
 try{await assert.rejects(view.close(),AggregateError);await assert.rejects(view.close(),AggregateError);assert.equal(count,1);}finally{await real();}
});
