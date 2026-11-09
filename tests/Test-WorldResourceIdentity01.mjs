import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWarmupPlan} from '../src/acoustics/world/world-warmup.mjs';
import {collisionNameHash} from '../src/acoustics/world/static-world-resource.mjs';
import {legacyStreet01WriterSHA256,compatibleLegacyStreet01Plan,worldGeometryDecoderSHA25601} from '../src/acoustics/world/world-cache-identity01.mjs';
import {digest} from '../src/acoustics/world/contracts.mjs';
const pin='a'.repeat(64),options={gameRoot:'original-no-filesystem-source',exists:()=>true};
function catalogue(){const resources=['alpha','beta'].map(name=>({Hash:collisionNameHash(name),Kind:'ybn',Path:'original.rpf/'+name+'.ybn'}));return {Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{CodeWalkerCoreSHA256:pin,GameExecutableSHA256:pin},SelectedDlc:'original',Gen9SelectorAvailable:false,ModsFolderResolutionEnabled:false,Resources:resources,CollisionPlacementIndex:{IndexComplete:true,ManifestFilesVisited:1,CacheFilesVisited:1,ProjectionSchemaGaps:0,InteriorBoundsMembershipByHash:{},MapGroupMembershipByHash:{},BoundsStoreItemsByHash:Object.fromEntries(resources.map((r,i)=>[r.Hash,[{NameHash:r.Hash,Layer:'0',CacheFile:'original.rpf/cache.dat',CacheMetadataSHA256:pin,Min:[i*100,0,0],Max:[i*100+8,8,8]}]]))}};}
function prepared(c){const p=buildWarmupPlan(c,pin,options);for(const [i,row]of p.Resources.entries()){row.Result={ArchiveSHA256:pin,originalMarker:i};row.Status='imported-exterior-incomplete-surfaces';}return p;}
test('one placement or metadata dependency change withdraws only the affected resource',()=>{
 const c=catalogue(),p=prepared(c),changed=structuredClone(c);changed.CollisionPlacementIndex.BoundsStoreItemsByHash[c.Resources[0].Hash][0].Max[0]++;
 const next=buildWarmupPlan(changed,'b'.repeat(64),{...options,previous:p});assert.equal(next.Resources[0].Result,null);assert.equal(next.Resources[1].Result.originalMarker,1);assert.notEqual(next.InputFingerprint,p.InputFingerprint);assert.equal(next.Resources[1].Status,'cache-awaiting-archive-revalidation','reuse is not current-source verification');
});
test('unrelated DLC/control/catalogue changes preserve unchanged derived resources while new entries remain unknown',()=>{
 const c=catalogue(),p=prepared(c),changed=structuredClone(c);changed.SelectedDlc='original-added-pack';changed.CollisionPlacementIndex.ManifestFilesVisited++;changed.Resources.push({Hash:collisionNameHash('new_original'),Kind:'ybn',Path:'dlc_original.rpf/new_original.ybn'});
 const next=buildWarmupPlan(changed,'c'.repeat(64),{...options,previous:p});assert(next.Resources.slice(0,2).every(r=>r.Result));assert.equal(next.Resources[2].Result,null);assert.equal(next.Resources[2].Status,'deferred-ambiguous-or-missing-native-bounds');assert.equal(next.AcousticWorldComplete,false);
});
test('changed reader/decoder identity cannot reuse a cached geometry record',()=>{
 const c=catalogue(),p=prepared(c);p.InputBinding.GeometryDecoderSHA256='f'.repeat(64);assert(buildWarmupPlan(c,pin,{...options,previous:p}).Resources.every(r=>r.Result===null));const different=catalogue();different.InputBinding.CodeWalkerCoreSHA256='b'.repeat(64);assert(buildWarmupPlan(different,pin,{...options,previous:prepared(c)}).Resources.every(r=>r.Result===null));
});
test('legacy migration requires the known raw decoder closure and exact catalogue; unknown writers remain rejected',t=>{
 const c=catalogue(),p=prepared(c),knownRawDecoder='e518f81ac19ae5120fa472b880a6575aa783c573ba0709e257437073ed7f7d41';
 delete p.InputBinding.GeometryDecoderSHA256;p.InputBinding.ImporterSourceSHA256=legacyStreet01WriterSHA256;p.InputFingerprint=digest({inputBinding:p.InputBinding,selected:c.Resources.map(r=>({Hash:r.Hash,Path:r.Path})),placements:c.CollisionPlacementIndex});
 // Historical migration identifies exact bytes, including CRLF. An LF
 // checkout is an unknown raw closure and must not gain cache authority.
 // Exercise the known historical branch directly as well as the actual
 // current checkout's conservative plan admission decision.
 assert(compatibleLegacyStreet01Plan(p,c,knownRawDecoder));
 const knownCheckout=worldGeometryDecoderSHA25601()===knownRawDecoder;
 assert.equal(compatibleLegacyStreet01Plan(p,c),knownCheckout);
 const current=buildWarmupPlan(c,pin,{...options,previous:p});
 if(knownCheckout)assert(current.Resources.every(r=>r.Result));
 else assert(current.Resources.every(r=>r.Result===null));
 t.diagnostic(knownCheckout?'Actual known CRLF closure retained legacy cache':'Actual unknown raw closure conservatively discarded legacy cache');
 const changed=structuredClone(c);changed.CollisionPlacementIndex.BoundsStoreItemsByHash[c.Resources[1].Hash][0].Max[0]++;
 assert(!compatibleLegacyStreet01Plan(p,changed,knownRawDecoder));
 p.InputBinding.ImporterSourceSHA256='f'.repeat(64);p.InputFingerprint=digest({inputBinding:p.InputBinding,selected:c.Resources.map(r=>({Hash:r.Hash,Path:r.Path})),placements:c.CollisionPlacementIndex});
 assert(!compatibleLegacyStreet01Plan(p,c,knownRawDecoder));assert(!compatibleLegacyStreet01Plan(p,c));assert(buildWarmupPlan(c,pin,{...options,previous:p}).Resources.every(r=>r.Result===null));
});
