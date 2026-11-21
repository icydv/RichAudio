import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {InstalledStaticWorld01, installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {exportCollision} from '../src/acoustics/world/convert-collision.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';
import {collisionNameHash} from '../src/acoustics/world/static-world-resource.mjs';
import {installedSceneFixture01} from './fixtures/InstalledSceneService01.mjs';

test('prepared lookup matches exact 3-D scan across cells, stacked structures, broad bounds and revisits', async()=>{
  const fixture=installedSceneFixture01();
  let service, reference;
  try {
    const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
    const catalog=read(fixture.catalogPath), manifest=read(fixture.manifestPath);
    const original=catalog.TargetCollisionEvidence, raw=read(path.join(fixture.root,'original.json'));
    const firstBound=original.BoundsStoreItems[0];
    const boundsByHash={[original.Hash]:[firstBound]};
    catalog.CollisionPlacementIndex={
      IndexComplete:true, ManifestFilesVisited:1, CacheFilesVisited:1, ProjectionSchemaGaps:0,
      InteriorBoundsMembershipByHash:{}, MapGroupMembershipByHash:{}, BoundsStoreItemsByHash:boundsByHash,
    };
    for (const [name,x,z,broad] of [
      ['bridge',-256,12,false], ['below_bridge',-256,-8,false],
      ['tunnel',512,-16,false], ['broad',512,45,true],
    ]) {
      const stem='authored_'+name, hash=collisionNameHash(stem), mesh=structuredClone(raw);
      mesh.source.entry='authored.rpf/'+stem+'.ybn';
      mesh.nodes[0].vertices=mesh.nodes[0].vertices.map(([vx,vy,vz])=>[vx+x,vy,vz+z]);
      const source=path.join(fixture.root,stem+'.json');
      fs.writeFileSync(source,JSON.stringify(mesh));
      const index=exportCollision(source,fixture.root);
      const receipt={...read(path.join(fixture.root,'receipt.json')),Entry:mesh.source.entry};
      const receiptPath=path.join(fixture.root,stem+'.receipt.json');
      fs.writeFileSync(receiptPath,JSON.stringify(receipt));
      catalog.Resources.push({Hash:hash,Path:mesh.source.entry,Kind:'ybn'});
      boundsByHash[hash]=[{
        ...firstBound,NameHash:hash,
        Min:[broad?-9000:x-4,-1,z-1],Max:[broad?9000:x+4,5,z+5],
      }];
      manifest.Resources.push({
        ...manifest.Resources[0],Id:stem,Hash:hash,
        Result:{IndexPath:index.index,IndexSHA256:index.indexSHA256,
          ReceiptPath:receiptPath,ReceiptSHA256:sha256(fs.readFileSync(receiptPath))},
      });
    }
    fs.writeFileSync(fixture.catalogPath,JSON.stringify(catalog));
    const catalogSHA256=sha256(fs.readFileSync(fixture.catalogPath));
    manifest.ResolvedCatalogSHA256=catalogSHA256;
    fs.writeFileSync(fixture.manifestPath,JSON.stringify(manifest));
    const config={...fixture.config,catalogSHA256,maximumResidentResources:2};
    const session='af'.repeat(16),scenes=[];
    reference=new InstalledStaticWorld01(config);
    service=new InstalledSceneService01({config,session,onScene:(scene,binding)=>scenes.push({scene,binding})});
    const stops=[
      {position:[0,0,1],selected:'original_scene01'},
      {position:[-256,0,13],selected:'authored_bridge'},
      {position:[-256,0,-7],selected:'authored_below_bridge'},
      {position:[512,0,-15],selected:'authored_tunnel'},
      {position:[512,0,46],selected:'authored_broad'},
      {position:[0,0,1],selected:'original_scene01'},
    ];
    for (const [index,{position,selected}] of stops.entries()) {
      const generation=index+1, geometryTimeMs=performance.now();
      const request={listener:position,sources:[[position[0]-1,0,position[2]]],
        session,generation,geometryTimeMs,durationMs:1000,radius:5,maximumResources:2,
        prepareSoundMapGeometry01:false,engine:{order:2}};
      const expected=reference.window(request);
      service.updateWindow(request);
      const deadline=performance.now()+1500;
      while(scenes.length<=index&&!service.failed&&performance.now()<deadline)await delay(5);
      assert.equal(service.failed,false,service.failure);
      assert.equal(scenes.length,index+1);
      const {scene,binding}=scenes[index];
      assert.equal(scene.tile.createdAt,geometryTimeMs);
      assert.equal(scene.tile.validUntil,geometryTimeMs+1000);
      assert.equal(binding.generation,generation);
      assert.equal(scene.geometryKey,expected.geometryKey);
      assert.deepEqual(scene.observationModel.evidence.map(row=>row.resourceId),[selected]);
      assert.deepEqual(scene.observationModel.reflectionSurfaceIds,expected.observationModel.reflectionSurfaceIds);
      assert.equal(installedStaticSceneMetadata01(scene).candidateResources,1);
    }
    assert.equal(service.snapshot().preparation.totalTiles,5);
    assert.equal(service.snapshot().residentResources,2);
    assert.equal(service.snapshot().resourceLoads,6,'revisit after eviction requires the pinned resource again');
  } finally {
    if(service)assert.equal((await service.close()).workerJoined,true);
    reference?.close();
    fixture.close();
  }
});
