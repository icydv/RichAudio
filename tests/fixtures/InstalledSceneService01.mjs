// Original authored collision/cache records only. No installed assets or game
// executable are opened; parser/archive assertions below are fixture premises.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {identity,sha256} from '../../src/acoustics/world/collision-mesh.mjs';
import {exportCollision} from '../../src/acoustics/world/convert-collision.mjs';
import {collisionNameHash} from '../../src/acoustics/world/static-world-resource.mjs';
export function installedSceneFixture01({write=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-installed-scene01-')),gameSHA256='a'.repeat(64),coreSHA256='b'.repeat(64),sourceSHA256='c'.repeat(64),stem='original_scene01',hash=collisionNameHash(stem);
 const catalogPath=path.join(root,'catalog.json'),manifestPath=path.join(root,'manifest.json'),receiptPath=path.join(root,'receipt.json'),input=path.join(root,'original.json');
 const raw={schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'authored.rpf',entry:'authored.rpf/'+stem+'.ybn',sha256:sourceSHA256,coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[0,0,0],vertices:[[-3,4,0],[3,4,0],[3,4,4],[-3,4,4]],polygons:[{family:'Triangle',indices:[0,1,2],materialSlot:0},{family:'Triangle',indices:[0,2,3],materialSlot:0}],materials:[{type:7,data1:7,data2:0}]}]};
 let exported=null,current=null;
 function publish(revision=1,{validationEpochUtc01=null,rowEpochUtc01=validationEpochUtc01}={}){
  if(!exported){fs.writeFileSync(input,JSON.stringify(raw));exported=exportCollision(input,root);}
  const receipt={Schema:1,ArchiveUnchanged:true,ArchiveVerification:'sha256-before-after',BeforeSHA256:sourceSHA256,AfterSHA256:sourceSHA256,SourceSHA256:sourceSHA256,ParserSHA256:coreSHA256,Entry:raw.source.entry,Archive:raw.source.archive};fs.writeFileSync(receiptPath,JSON.stringify(receipt));
  const catalog={Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{GameExecutableSHA256:gameSHA256,CodeWalkerCoreSHA256:coreSHA256},SelectedDlc:'original-revision-'+revision,Gen9SelectorAvailable:false,Resources:[{Hash:hash,Path:raw.source.entry,Kind:'ybn'}],TargetCollisionEvidence:{Hash:hash,ManifestFilesVisited:1,CacheFilesVisited:1,ProjectionSchemaGaps:0,InteriorBoundsMembership:[],MapGroupMembership:[],SelectedYbn:[{Hash:hash,Path:raw.source.entry,Kind:'ybn'}],BoundsStoreItems:[{NameHash:hash,Layer:'0',CacheFile:'authored.rpf/cache.dat',CacheMetadataSHA256:sourceSHA256,Min:[-4,-1,-1],Max:[4,5,5]}]}};
  fs.writeFileSync(catalogPath,JSON.stringify(catalog));const catalogSHA256=sha256(fs.readFileSync(catalogPath));
  const manifest={Schema:1,ResolvedCatalogSHA256:catalogSHA256,InputBinding:catalog.InputBinding,InputFingerprint:sha256(Buffer.from('original-world-'+revision)),Resources:[{Id:'original_scene01',Hash:hash,Status:'imported-exterior-incomplete-surfaces',Eligibility:'eligible-exterior',Result:{IndexPath:exported.index,IndexSHA256:exported.indexSHA256,ReceiptPath:receiptPath,ReceiptSHA256:sha256(fs.readFileSync(receiptPath))}}]};
  if(validationEpochUtc01){manifest.ValidationEpochUtc01=validationEpochUtc01;manifest.Resources[0].Result.ArchiveSHA256=sourceSHA256;manifest.Resources[0].ArchiveValidation01={EpochUtc:rowEpochUtc01,ArchiveSHA256:sourceSHA256,ValidatedUtc:validationEpochUtc01,Source:'current-archive-sha256'};}
  const pending=manifestPath+'.pending';fs.writeFileSync(pending,JSON.stringify(manifest));fs.renameSync(pending,manifestPath);current={manifestPath,catalogPath,catalogSHA256};return current;
 }
 if(write)publish();
 return {root,gameSHA256,catalogPath,manifestPath,publish,get config(){return current;},close(){const absolute=path.resolve(root);if(path.dirname(absolute)!==path.resolve(os.tmpdir())||!/^richaudio-installed-scene01-[^\\/]+$/.test(path.basename(absolute)))throw Error('Owned original fixture cleanup boundary');fs.rmSync(absolute,{recursive:true,force:true});}};
}
