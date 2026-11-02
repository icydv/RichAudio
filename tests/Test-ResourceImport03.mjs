// Portable policy/identity tests. Positive actual-format decoding is exercised
// separately by Check-StaticResources03 through the pinned public parser.
import test from 'node:test';import assert from 'node:assert/strict';
import {codeWalkerSource03,effectiveResourceManifest03,prepareExplicitResourceBatch03,decodeImportedTile03,resourceImportLimits03} from '../src/acoustics/world/resource-import03.mjs';
const hash='a'.repeat(64);
function manifest(){return {schema:1,kind:'RichAudioExplicitResourceManifest03',authority:'original-authored-fixture',layout:'gen9',parser:{sourceCommit:codeWalkerSource03,sha256:hash},mounts:[{id:'base',order:0,enabled:true}],
 resources:['ymap','ytyp','ybn'].map(kind=>({id:kind,path:'world/original.'+kind,kind,mount:'base',sha256:hash,bytes:100,deleted:false,supported:true})),tiles:[{tileId:'near',bounds:{min:[-16,-16,-8],max:[16,16,16]}}],coverage:{bounds:{min:[-16,-16,-8],max:[16,16,16]},outside:'unknown',basis:'original-authored-bounded-subset'},placementEvidence:'original-authored-world-metres',activationEvidence:'original-authored-static-subset'};}
test('explicit manifest resolves only declared enabled mount order and binds invalidation',()=>{
 const input=manifest(),before=effectiveResourceManifest03(input);assert.equal(before.effective.length,3);assert.equal(before.installedWorldVerified,false);
 const modified=manifest();modified.mounts.push({id:'custom',order:1,enabled:true});modified.resources.push({...modified.resources[0],id:'override',mount:'custom',sha256:'b'.repeat(64)});
 const after=effectiveResourceManifest03(modified);assert.equal(after.effective.find(e=>e.kind==='ymap').id,'override');assert.notEqual(before.manifestDigest,after.manifestDigest);
 modified.mounts[1].enabled=false;assert.equal(effectiveResourceManifest03(modified).effective.find(e=>e.kind==='ymap').id,'ymap');
 const deleted=manifest();deleted.mounts.push({id:'custom',order:1,enabled:true});deleted.resources.push({...deleted.resources[0],id:'removed',mount:'custom',deleted:true,bytes:0});assert(effectiveResourceManifest03(deleted).effective.find(e=>e.kind==='ymap').deleted);
});
test('same-path ambiguity, traversal, overlapping coverage and oversized inventories fail closed',()=>{
 for(const path of ['../map.ymap','/map.ymap','C:/map.ymap','world\\map.ymap','world//map.ymap']){const x=manifest();x.resources[0].path=path;assert.throws(()=>effectiveResourceManifest03(x),/path|resource/);}
 const duplicate=manifest();duplicate.resources.push({...duplicate.resources[0],id:'duplicate'});assert.throws(()=>effectiveResourceManifest03(duplicate),/ambiguous/);
 const order=manifest();order.mounts.push({id:'other',order:0,enabled:true});assert.throws(()=>effectiveResourceManifest03(order),/mount order/);
 const overlap=manifest();overlap.tiles.push({tileId:'other',bounds:overlap.tiles[0].bounds});assert.throws(()=>effectiveResourceManifest03(overlap),/overlap/);
 const outside=manifest();outside.coverage.outside='empty';assert.throws(()=>effectiveResourceManifest03(outside),/outside remains unknown/);
 const huge=manifest();huge.resources=Array.from({length:resourceImportLimits03.resources+1},(_,i)=>({...huge.resources[0],id:'r'+i,path:'map'+i+'.ymap'}));assert.throws(()=>effectiveResourceManifest03(huge),/bounded/);
 const noGen9Guess=manifest();noGen9Guess.layout='auto';assert.throws(()=>effectiveResourceManifest03(noGen9Guess),/layout/);
});
test('a winning unsupported resource stays unknown with no silent fallback or byte read',()=>{
 const x=manifest();x.mounts.push({id:'custom',order:1,enabled:true});x.resources.push({...x.resources[0],id:'unsupported',mount:'custom',supported:false});
 const result=prepareExplicitResourceBatch03({manifest:x});assert.equal(result.state,'unsupported-winning-resource');assert.equal(result.scene,null);assert.equal(result.tiles.length,0);assert.equal(result.unknown[0].resource,'unsupported');
});
test('actual installation authority requires missing independent evidence and cannot self-attest',()=>{
 const x=manifest();x.authority='separately-authorized-explicit-resource';const result=prepareExplicitResourceBatch03({manifest:x});assert.equal(result.state,'unqualified-installation-evidence');assert.equal(result.scene,null);assert.equal(result.tiles.length,0);assert(result.missingEvidence.includes('native-world-coordinate-and-scale-proof'));assert.equal(result.installedWorldVerified,false);
 const asserted={...x,installedWorldVerified:true};assert.throws(()=>prepareExplicitResourceBatch03({manifest:asserted}),/unsupported static-world fields/);
});
test('historical/static-panel cache bytes cannot substitute the versioned finite-resource cache',()=>{
 assert.throws(()=>decodeImportedTile03(Buffer.from('RichAudio-Static-Fixture-Tile\n1\n'+'a'.repeat(64)+'\n2\n{}')),/format/);
 assert.throws(()=>decodeImportedTile03(Buffer.alloc(resourceImportLimits03.tileBytes+161)),/bounded/);
});
