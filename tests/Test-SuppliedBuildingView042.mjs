import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareSuppliedBuilding042} from '../src/acoustics/world/supplied-building042.mjs';
import {suppliedBuildingFixture042} from './fixtures/SuppliedBuilding042.mjs';
import {prepareSuppliedBuildingView042,renderSuppliedBuildingPcm042,startSuppliedBuildingService042,ownedCleanup042} from '../tools/soundmap/supplied-building042.mjs';
import {ResourceTileStore04} from '../src/acoustics/world/resource-tile-store04.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {VisualState,PassiveState,presentation,CachedWorldState041,cachedWorldPresentation041} from '../tools/soundmap/ui/model.mjs';

test('supplied fixture identities reach the unchanged cache adapter and actual solver with distances, delays and poses',async()=>{
  const prepared=prepareSuppliedBuilding042(suppliedBuildingFixture042()),view=await prepareSuppliedBuildingView042(prepared);
  try{
    assert.equal(view.info.resources.length,6);assert.equal(view.info.buildings.length,2);assert.equal(view.cache.interiors.length,2);
    assert.equal(view.cache.tiles.flatMap(t=>t.surfaces).length,24);assert.equal(view.cache.outsideCoverage,'unknown');assert.deepEqual(view.cache.paths,[]);
    const frame=view.sample.soundMapFrame,selected=frame.paths.filter(p=>p.status==='selected');
    assert(selected.some(p=>p.order===0));assert(selected.some(p=>p.order>0));
    for(const ray of selected){assert(ray.vertices.length>=2);assert(Math.abs(ray.delay-ray.distance/343)<1e-8);assert(ray.distance>0);}
    assert.deepEqual(frame.listener.position,view.listener);assert.deepEqual(frame.sources[0].position,view.source);
    assert.equal(frame.geometryGeneration,view.sample.soundMapGeometry.generation);
    assert.equal(view.info.installedWorldVerified,false);assert.equal(view.info.realExportApproved,false);
    const gap=querySegment(view.scene.tile,[-5,0,1],[1,0,1]);assert.equal(gap.visibility,'unknown','unprepared gap between tiles must remain unknown');
    assert(view.cache.interiors.every(t=>t.rooms.every(r=>r.completeness==='unknown')),'legacy enclosing-rectangle room limitation remains explicit');
    assert(view.cache.interiors.every(t=>t.unknown.length>0));
    const state=new VisualState();state.ingest({frame,geometry:view.sample.soundMapGeometry},0);
    const cache=new CachedWorldState041();cache.ingest({packet:view.cache,status:{available:true,generation:view.cache.generation,geometryTimeMs:300}},0);
    const base=presentation(state,new PassiveState(),0,true),projected=cachedWorldPresentation041(cache,base,0,{enabled:true});assert.equal(projected.overlay,true);
    assert.equal(view.builder.stats.workersStarted,view.builder.stats.workersJoined);assert.equal(view.preparation.stats.workersStarted,view.preparation.stats.workersJoined);
  }finally{await view.close();}
});

test('acoustic reflection and material ablations change actual PCM while retaining the exact dry source and frame count',async()=>{
  const a=await prepareSuppliedBuildingView042(prepareSuppliedBuilding042(suppliedBuildingFixture042()));
  const b=await prepareSuppliedBuildingView042(prepareSuppliedBuilding042(suppliedBuildingFixture042(spec=>{for(const s of spec.buildings)s.material={reflection:[.05,.04,.03],transmission:[.05,.03,.01],basis:'authored-assumption',reference:'original042-lower-reflection'};})));
  try{
    const reflected=renderSuppliedBuildingPcm042(a),direct=renderSuppliedBuildingPcm042(a,{reflections:false}),material=renderSuppliedBuildingPcm042(b);
    assert.equal(reflected.drySHA256,direct.drySHA256);assert.equal(reflected.drySHA256,material.drySHA256);
    assert.notEqual(reflected.pcmSHA256,direct.pcmSHA256);assert.notEqual(reflected.pcmSHA256,material.pcmSHA256);
    assert.equal(reflected.frames,direct.frames);assert.equal(reflected.frames,144*512);assert(reflected.peak>0&&reflected.peak<1);
    assert(reflected.reflectedPaths>0);assert.equal(direct.reflectedPaths,0);
    for(const r of [reflected,direct,material]){assert.equal(r.limited,0);assert.equal(r.historyAffectedFrames,0);assert.equal(r.endpointOpened,false);assert.equal(r.recordingStarted,false);}
  }finally{await a.close();await b.close();}
});

test('exact persisted artifact bindings survive restart; cache publication carries identity without self-authorizing geometry',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-supplied042-cache-')),directory=path.join(root,'.local/tiles');await fs.mkdir(directory,{recursive:true});
  let first,second;try{
    const prepared=prepareSuppliedBuilding042(suppliedBuildingFixture042()),store=new ResourceTileStore04(root,directory);
    first=await prepareSuppliedBuildingView042(prepared,{store});const bindings=first.builder.artifactBindings();await first.close();
    second=await prepareSuppliedBuildingView042(prepared,{store,trustedArtifacts:bindings});assert.equal(second.builder.stats.cacheHits,2);assert.equal(second.builder.stats.workersStarted,0);
    assert.equal(second.cache.tiles.length,2);assert.equal(second.cache.viewerCanPublishAcoustics,false);assert.equal(second.cache.solverPathEvidence,false);
    assert.deepEqual(second.cache.tiles.flatMap(t=>t.resourceBindings).map(r=>r.sha256).sort(),prepared.sidecar.resources.map(r=>r.sourceSHA256).sort());
  }finally{await first?.close();await second?.close();assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^richaudio-supplied042-cache-/);await fs.rm(root,{recursive:true,force:true});}
});

test('the additive read-only evidence route preserves SoundMap capabilities and refuses recording, path inputs and publication',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-supplied042-view-'));
  const view=await prepareSuppliedBuildingView042(prepareSuppliedBuilding042(suppliedBuildingFixture042()));let running;
  try{
    running=await startSuppliedBuildingService042({view,root});const base=running.service.descriptor.url,headers={'X-RichAudio-Token':running.service.descriptor.token};
    assert.equal((await fetch(base+'/api/supplied-building042')).status,403);
    assert.equal((await fetch(base+'/api/supplied-building042',{headers:{'X-RichAudio-Token':'é'.repeat(64)}})).status,403,'non-ASCII capability cannot crash the listener');
    const response=await fetch(base+'/api/supplied-building042',{headers}),info=await response.json();assert.deepEqual(info,view.info);
    assert.equal((await fetch(base+'/api/supplied-building042',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({path:'must-not-open.ymap.xml'})})).status,405);
    assert.equal((await fetch(base+'/api/record/start',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,405);
    for(const route of ['/api/telemetry','/api/passive','/api/producer/event','/api/replay/open','/api/service/stop'])assert.equal((await fetch(base+route,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,405,'browser mutation blocked: '+route);
    assert.equal(running.service.recorder.active,null);
    const html=await(await fetch(running.url)).text();assert(html.includes('building042-evidence'));assert(html.includes('/supplied-building042.mjs'));assert(html.includes('/app.mjs'));
    assert.equal((await fetch(base+'/api/supplied-building042',{headers:{...headers,Origin:'https://unrelated.invalid'}})).status,403);
    const frame=await(await fetch(base+'/api/frame',{headers})).json();assert.equal(frame.frame.paths.some(p=>p.order>0&&p.status==='selected'),true);assert.equal(frame.cacheWorld.packet.generation,view.cache.generation);
    const pending=running.service.cacheWorld.publish(view.cache);running.service.cacheWorld.clear('withdrawn042');assert.equal((await pending).publicationWithdrawn,true);
    const cache=await(await fetch(base+'/api/cache-world',{headers})).json();assert.equal(cache.packet,null);assert.equal(cache.status.available,false);
  }finally{await running?.close();await view.close();assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^richaudio-supplied042-view-/);await fs.rm(root,{recursive:true,force:true});}
});

test('real or serialized fixture claims cannot reach the viewer through a fabricated preparation object',async()=>{
  const f=suppliedBuildingFixture042(),original=prepareSuppliedBuilding042(f);
  await assert.rejects(prepareSuppliedBuildingView042({...original}),/branded/);
  const sidecar=structuredClone(f.sidecar);sidecar.authority='user-supplied-resource-export';
  const blocked=prepareSuppliedBuilding042({...f,sidecar});assert.equal(blocked.inventory,null);await assert.rejects(prepareSuppliedBuildingView042(blocked),/branded/);
});

test('cleanup invokes every owned closer once and retains failures without false success on a repeated close',async()=>{
  const calls=[],failure=Error('original controlled close failure');
  const close=ownedCleanup042([()=>{calls.push('first');throw failure;},async()=>{calls.push('second');}]);
  const first=close();assert.equal(close(),first);
  await assert.rejects(first,e=>e instanceof AggregateError&&e.errors[0]===failure);assert.deepEqual(calls,['first','second']);
  await assert.rejects(close(),/cleanup failed/);assert.deepEqual(calls,['first','second']);
});
