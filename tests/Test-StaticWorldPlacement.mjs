import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {convertCollision,identity,sha256} from '../src/acoustics/world/collision-mesh.mjs';
import {exportCollision} from '../src/acoustics/world/convert-collision.mjs';
import {collisionNameHash,classifyStaticWorldResource,loadStaticWorldResource} from '../src/acoustics/world/static-world-resource.mjs';
assert.equal(collisionNameHash('apa_ch2_04_0'),'0x1c0c33c3');
const digest='a'.repeat(64),raw={schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'synthetic.rpf',entry:'synthetic.rpf/apa_ch2_04_0.ybn',sha256:digest,coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[100,200,30],vertices:[[0,0,0],[1,0,0],[0,1,0]],polygons:[{family:'Triangle',indices:[0,1,2],materialSlot:0}],materials:[{type:7,data1:7,data2:0}]}]},index=convertCollision(raw);
const receipt={Schema:1,ArchiveUnchanged:true,ArchiveVerification:'sha256-before-after',BeforeSHA256:digest,AfterSHA256:digest,SourceSHA256:digest,ParserSHA256:digest,Entry:raw.source.entry,Archive:raw.source.archive};
const catalog={Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{CodeWalkerCoreSHA256:digest},SelectedDlc:'authored',Gen9SelectorAvailable:false,TargetCollisionEvidence:{Hash:'0x1c0c33c3',ManifestFilesVisited:1,CacheFilesVisited:1,ProjectionSchemaGaps:0,InteriorBoundsMembership:[],MapGroupMembership:[],SelectedYbn:[{Hash:'0x1c0c33c3',Path:raw.source.entry,Kind:'ybn'}],BoundsStoreItems:[{NameHash:'0x1c0c33c3',Layer:'0',CacheFile:'synthetic.rpf/cache.dat',CacheMetadataSHA256:digest,Min:[99,199,29],Max:[102,202,31]}]}};
const pins={indexSHA256:digest,catalogSHA256:digest,receiptSHA256:digest},classify=(c=catalog,r=receipt,p=pins)=>classifyStaticWorldResource(index,c,r,p),clone=()=>structuredClone(catalog);
const classification=classify();assert.equal(classification.state,'codewalker-exterior-static-model');assert.equal(classification.offlineCoordinateFrameVerified,true);assert.equal(classification.worldPlacementVerified,false);assert.equal(classification.runtimeActivation,'unverified');
assert.equal(classify(catalog,receipt,{}).reason,'pinned-evidence-digests-required');
const interior=clone();interior.TargetCollisionEvidence.InteriorBoundsMembership=[{Name:'authored-mlo'}];assert.equal(classify(interior).reason,'interior-local-space-placement-required');
const conditional=clone();conditional.TargetCollisionEvidence.MapGroupMembership=[{Name:'conditional'}];assert.equal(classify(conditional).reason,'conditional-mapgroup-activation-unresolved');
const gap=clone();gap.TargetCollisionEvidence.ProjectionSchemaGaps=1;assert.equal(classify(gap).reason,'manifest-cache-projection-incomplete');
const provenance=clone();provenance.TargetCollisionEvidence.BoundsStoreItems[0].CacheMetadataSHA256=null;assert.equal(classify(provenance).reason,'layer-zero-cache-provenance-required');
const wrongPath=clone();wrongPath.TargetCollisionEvidence.SelectedYbn[0].Path='other.rpf/apa_ch2_04_0.ybn';assert.equal(classify(wrongPath).reason,'selected-resource-identity-mismatch');
const wrongBounds=clone();wrongBounds.TargetCollisionEvidence.BoundsStoreItems[0].Max[0]=100;assert.equal(classify(wrongBounds).reason,'export-outside-native-cache-bounds');
assert.equal(classify(catalog,{...receipt,SourceSHA256:'b'.repeat(64)}).reason,'export-receipt-source-mismatch');assert.equal(classify(catalog,{...receipt,ArchiveVerification:'length-and-mtime-only'}).reason,'archive-content-integrity-proof-required');
const duplicate=clone();duplicate.TargetCollisionEvidence.BoundsStoreItems.push(duplicate.TargetCollisionEvidence.BoundsStoreItems[0]);assert.equal(classify(duplicate).reason,'unique-selected-ybn-and-bounds-required');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rich-audio-world-placement-'));try{
 const input=path.join(directory,'input.json');fs.writeFileSync(input,JSON.stringify(raw));const exported=exportCollision(input,directory),catalogPath=path.join(directory,'catalog.json'),receiptPath=path.join(directory,'receipt.json');fs.writeFileSync(catalogPath,JSON.stringify(catalog));fs.writeFileSync(receiptPath,JSON.stringify(receipt));
 const args={indexPath:exported.index,catalogPath,receiptPath,indexSHA256:exported.indexSHA256,catalogSHA256:sha256(fs.readFileSync(catalogPath)),receiptSHA256:sha256(fs.readFileSync(receiptPath))},world=loadStaticWorldResource(args),view=world.query({min:[100,200,30],max:[101,201,30]});assert.equal(view.triangles.length,1);assert.equal(view.coordinateSpace,'world');assert.equal(view.worldPlacementVerified,false);fs.appendFileSync(catalogPath,' ');assert.throws(()=>loadStaticWorldResource(args),/evidence integrity/);
}finally{fs.rmSync(directory,{recursive:true,force:true});}
console.log('Static-world classification tests passed: pinned metadata/export provenance, native hash/bounds agreement, identity world frame, and fail-closed interior/conditional/incomplete/mismatched evidence. GTA runtime remains unverified.');
