import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildSoundMapAtlas01} from '../tools/soundmap/build-atlas01.mjs';
import {openWorldAtlas01} from '../tools/soundmap/world-atlas01.mjs';
import {contextFailure01} from '../tools/soundmap/installed-world-context01.mjs';
import {decodeAtlasPage01,planAtlasView01} from '../tools/soundmap/ui/atlas-renderer01.mjs';
import {alignsWithWorldAtlas01,MODEL_SPACE,project} from '../tools/soundmap/ui/model.mjs';
import {encodeChunk,identity,sha256} from '../src/acoustics/world/collision-mesh.mjs';

test('atlas verifies retained identities, places a rigid interior, preserves exact material and rejects corrupt pages independently',async t=>{
 const temp=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'richaudio-atlas-test-'));
 t.after(()=>{assert(path.dirname(temp)===fs.realpathSync.native(os.tmpdir()));fs.rmSync(temp,{recursive:true});});
 const root=path.join(temp,'.local');fs.mkdirSync(root);
 function write(file,value){
  const p=path.join(root,file),b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
  fs.writeFileSync(p,b);return {p,sha:sha256(b),bytes:b.length};
 }
 const binding={GameExecutableSHA256:'a'.repeat(64),CodeWalkerCoreSHA256:'b'.repeat(64),ImporterSourceSHA256:'c'.repeat(64),GeometryDecoderSHA256:'d'.repeat(64)};
 const catalog=write('catalog.json',{Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:binding});
 const triangle=(positions,materialType)=>({positions,materialType,node:0,polygon:0,data1:0,data2:0,materialSlot:0});
 const state='metadata-interior-instances-resolved',m=[...identity];m[12]=512;m[13]=-256;m[14]=20;
 function resource(id,placement,records){
  fs.mkdirSync(path.join(root,id));
  const archive='authored.rpf',entry=archive+'/'+id+'.ybn',sourceHash=sha256(Buffer.from(id)),archiveSHA='e'.repeat(64);
  const bounds={min:[0,0,0],max:[2,2,2]},chunk=write(id+'/chunk-000000.racmesh',encodeChunk(records));
  const counts={triangles:records.length};
  const index=write(id+'/index.json',{schema:1,kind:'RichAudioCollisionMesh',coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local',
   coverage:'triangle-and-box-surfaces-incomplete',bounds,counts,unsupported:{Capsule:1},unknownRegions:[{family:'Capsule',bounds}],cells:{'0,0,0':[0]},cellSize:64,overflowChunks:[],
   source:{archive,entry,sha256:sourceHash,bytes:64},
   chunks:[{id:0,file:path.basename(chunk.p),count:records.length,bounds,bytes:chunk.bytes,sha256:chunk.sha}]});
  const receipt=write(id+'/receipt.json',{Schema:1,Archive:archive,Entry:entry,SourceSHA256:sourceHash,SourceBytes:64,ArchiveUnchanged:true,
   BeforeSHA256:archiveSHA,AfterSHA256:archiveSHA,ParserSHA256:binding.CodeWalkerCoreSHA256,Result:{index:index.p,indexSHA256:index.sha,counts}});
  return {Id:id,EntryPath:entry,PhysicalArchive:archive,PotentialResult:{IndexPath:index.p,IndexSHA256:index.sha,ReceiptPath:receipt.p,ReceiptSHA256:receipt.sha,ArchiveSHA256:archiveSHA},
   PreparationStates01:{placement,activation:{layer:0,conditions:[]}}};
 }
 const placed=resource('interior',{state,interiorPlacements:{placements:[{instanceId:'authored-interior',matrix:m,archetypeHash:'0x00000001'}]}},
  [triangle([[0,0,0],[1,0,0],[0,1,0]],37),triangle([[0,0,0],[0,1,0],[0,0,1]],37)]);
 const unknown=resource('unplaced',{state:'interior-local-unplaced'},[triangle([[0,0,0],[1,0,0],[0,1,0]],5)]);
 const manifest=write('manifest.json',{Schema:1,ResolvedCatalogSHA256:catalog.sha,InputBinding:binding,Resources:[placed,unknown]});
 const audit=write('audit.json',{executable:{sha256:binding.GameExecutableSHA256,matched:true},census:[placed,unknown].map(r=>({id:r.Id,entry:r.EntryPath,placement:r.PreparationStates01.placement.state,activationBasis:'interior-observation-required'}))});
 const out=path.join(root,'world'),result=buildSoundMapAtlas01({privateRoot:root,manifestPath:manifest.p,catalogPath:catalog.p,auditPath:audit.p,out,expectedResources:2});
 assert.equal(result.counts.sourceTriangles,3);assert.equal(result.counts.placedResources,1);assert.equal(result.counts.unresolvedPlacements,1);
 const file=path.join(out,'atlas.json'),atlas=await openWorldAtlas01({file,sha256:result.atlasSHA256});
 await assert.rejects(openWorldAtlas01({file,sha256:'0'.repeat(64)}),/identity mismatch/);
 assert.equal(atlas.status().proof.live,false);
 const a=JSON.parse(atlas.index),tile=a.tiles[0],detail=tile.pages[2][0];
 assert.deepEqual(tile.bounds,{min:[512,-256,20],max:[513,-255,21]});
 const {bytes}=await atlas.mesh(detail.name);
 const page=decodeAtlasPage01(Uint8Array.from(bytes).buffer,detail);
 assert.equal(page.triangles,2);
 assert.equal(page.vertices.length/16,4,'Shared vertices are indexed');
 const v=new DataView(page.vertices.buffer,page.vertices.byteOffset,page.vertices.length);
 assert.deepEqual([0,4,8].map(i=>v.getFloat32(i,true)),[512,-256,20]);
 assert.equal(v.getUint32(12,true),(3<<24)|37);
 const coverage=atlas.coverage(tile.id);assert.equal(coverage.entries[0].id,'interior');assert.equal(coverage.regionCount,1);
 assert.equal(coverage.regions[0].bounds.min[0],512);
 assert.equal(atlas.coverage('0_0'),null,'Unplaced source does not appear at the world origin');
 assert.equal(atlas.context(null).rendererAdmission,false);
 const corrupt=path.join(out,detail.name);bytes[24]^=1;fs.writeFileSync(corrupt,bytes);
 assert.equal((await atlas.mesh(detail.name)).code,422);
 assert.equal(atlas.status().io.lastFailure.phase,'read-and-verify-atlas-page');
 assert.ok((await atlas.mesh(a.overview[0].name)).bytes,'One corrupt detailed page does not invalidate independent overview bytes');
});

test('atlas view selects and prefetches in world space independently of audio and original camera cells',()=>{
 const bounds={min:[0,0,0],max:[900,512,40]},camera={target:[14,10,8],yaw:0,pitch:.65,scale:3,width:900,height:600};
 const tile=(id,x)=>({id,centre:[x,90,5],extent:[128,128,5],cost:[100,200,300]});
 const tiles=[tile('here',128),tile('ahead',384),tile('far',830)];
 const first=planAtlasView01(tiles,camera,bounds,[1,0,0],600);
 const next=planAtlasView01(tiles,{...camera,target:[18,10,8]},bounds,[1,0,0],600);
 assert.deepEqual([...first.wants],[...next.wants]);
 assert.deepEqual([...first.wants.keys()],['here','ahead']);
 assert.equal(first.visibleTiles.some(t=>t.id==='far'),false);
 const p=[20,15,9],v=first.v,d=p.map((x,i)=>x-v.target[i]),dot=(x,y)=>x.reduce((n,q,i)=>n+q*y[i],0),overlay=project(p,camera);
 assert(Math.abs((1+dot(d,v.right)/v.x)*camera.width/2-overlay.x)<1e-9);
 assert(Math.abs((1-dot(d,v.up)/v.y)*camera.height/2-overlay.y)<1e-9);
 const native={catalogSHA256:'retained-catalogue'},frame={worldContext01:{catalogue:native.catalogSHA256},coordinateSpace:MODEL_SPACE,
  calibration:{metresPerNativeUnit:1,originNative:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]]}};
 assert.equal(alignsWithWorldAtlas01(frame,native),true);
 assert.equal(alignsWithWorldAtlas01({...frame,calibration:{...frame.calibration,originNative:[1,0,0]}},native),false);
 assert.equal(alignsWithWorldAtlas01(frame,{catalogSHA256:'other-installation'}),false);
});

test('legacy context failure distinguishes a worker exit, integrity fault and metadata proof loss',()=>{
 const source={catalogue:'saved',epoch:'saved'};
 const failed=contextFailure01({worker:{failed:true,workerExited:true,failure:'worker-window: chunk integrity'},cacheTimings:{metadataProofCurrent01:true},
  sceneDeliveryDiagnostics01:{recent:[{requestId:7}]}},source,1);
 assert.equal(failed.state,'context-cache-unavailable');assert.equal(failed.request.requestId,7);
 assert.equal(failed.lastBinding,source);assert.equal(failed.exitCode,1);assert.equal(failed.metadataProofCurrent,true);
 assert.equal(contextFailure01({worker:{failed:true,failure:'worker-exited-without-close'}}).state,'context-worker-failed');
 assert.equal(contextFailure01({worker:{failed:true,failure:'worker-window-timeout'}}).state,'context-worker-timeout');
 assert.equal(contextFailure01({cacheTimings:{metadataProofCurrent01:false}}).state,'source-proof-unavailable');
});
