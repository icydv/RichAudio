// A pinned, target-only CodeWalker model classification. This never observes GTA runtime state.
import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './collision-mesh.mjs';
import {loadCollisionResource} from './collision-resource.mjs';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const normalized=v=>typeof v==='string'?v.replaceAll('\\','/').toLowerCase():'';
const bounds=b=>b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(Number.isFinite))&&b.min.every((v,i)=>v<=b.max[i]);
const selectedByCatalog=new WeakMap();
export function collisionNameHash(name){let value=0;for(const byte of Buffer.from(name.toLowerCase(),'utf8')){value=(value+byte)>>>0;value=(value+(value<<10))>>>0;value=(value^(value>>>6))>>>0;}value=(value+(value<<3))>>>0;value=(value^(value>>>11))>>>0;return '0x'+((value+(value<<15))>>>0).toString(16).padStart(8,'0');}
export function collisionProjection(catalog,hash){
 const all=catalog.CollisionPlacementIndex;
 if(all?.IndexComplete===true&&all.ProjectionSchemaGaps===0&&['InteriorBoundsMembershipByHash','MapGroupMembershipByHash','BoundsStoreItemsByHash'].every(k=>all[k]&&typeof all[k]==='object'&&!Array.isArray(all[k]))){
  let selected=selectedByCatalog.get(catalog);if(!selected){selected=new Map();for(const row of catalog.Resources??[])if(row.Kind==='ybn'){const key=normalized(row.Hash);if(!selected.has(key))selected.set(key,[]);selected.get(key).push(row);}selectedByCatalog.set(catalog,selected);}
  return {Hash:hash,ManifestFilesVisited:all.ManifestFilesVisited,CacheFilesVisited:all.CacheFilesVisited,ProjectionSchemaGaps:0,InteriorBoundsMembership:all.InteriorBoundsMembershipByHash[hash]??[],MapGroupMembership:all.MapGroupMembershipByHash[hash]??[],BoundsStoreItems:all.BoundsStoreItemsByHash[hash]??[],SelectedYbn:selected.get(hash)??[]};
 }
 return normalized(catalog.TargetCollisionEvidence?.Hash)===hash?catalog.TargetCollisionEvidence:null;
}
export function classifyStaticWorldResource(index,catalog,receipt,pins){
 const unresolved=reason=>({state:'unresolved',reason,coordinateSpace:'resource-root',offlineCoordinateFrameVerified:false,worldPlacementVerified:false,runtimeActivation:'unverified'});
 if(!pins||!['indexSHA256','catalogSHA256','receiptSHA256'].every(k=>digest(pins[k])))return unresolved('pinned-evidence-digests-required');
 if(index?.kind!=='RichAudioCollisionMesh'||index.coordinateSpace!=='resource-root'||index.placement!=='unresolved-static-vs-archetype-local'||!digest(index.source?.sha256)||!bounds(index.bounds))return unresolved('resource-root-export-required');
 if(catalog?.Schema!==1||catalog.Stage!=='codewalker-resolved-installation-model'||catalog.ParserErrorCount!==0)return unresolved('complete-codewalker-model-required');
 if(receipt?.Schema!==1||receipt.ArchiveUnchanged!==true||receipt.ArchiveVerification!=='sha256-before-after'||!digest(receipt.BeforeSHA256)||normalized(receipt.BeforeSHA256)!==normalized(receipt.AfterSHA256))return unresolved('archive-content-integrity-proof-required');
 if(normalized(receipt.SourceSHA256)!==normalized(index.source.sha256)||normalized(receipt.Entry)!==normalized(index.source.entry)||normalized(receipt.Archive)!==normalized(index.source.archive)||!normalized(index.source.entry).startsWith(normalized(index.source.archive)+'/'))return unresolved('export-receipt-source-mismatch');
 if(!digest(catalog.InputBinding?.CodeWalkerCoreSHA256)||normalized(catalog.InputBinding.CodeWalkerCoreSHA256)!==normalized(receipt.ParserSHA256))return unresolved('parser-binding-mismatch');
 const expectedHash=collisionNameHash(path.posix.basename(normalized(index.source.entry),'.ybn')),projection=collisionProjection(catalog,expectedHash);
 if(!projection||projection.ProjectionSchemaGaps!==0||!Number.isSafeInteger(projection.ManifestFilesVisited)||projection.ManifestFilesVisited<1||!Number.isSafeInteger(projection.CacheFilesVisited)||projection.CacheFilesVisited<1)return unresolved('manifest-cache-projection-incomplete');
 if(!Array.isArray(projection.InteriorBoundsMembership)||!Array.isArray(projection.MapGroupMembership)||!Array.isArray(projection.BoundsStoreItems)||!Array.isArray(projection.SelectedYbn))return unresolved('projection-arrays-required');
 if(projection.InteriorBoundsMembership.length)return unresolved('interior-local-space-placement-required');
 if(projection.MapGroupMembership.length)return unresolved('conditional-mapgroup-activation-unresolved');
 if(projection.BoundsStoreItems.length!==1||projection.SelectedYbn.length!==1)return unresolved('unique-selected-ybn-and-bounds-required');
 const selected=projection.SelectedYbn[0],item=projection.BoundsStoreItems[0],stem=path.posix.basename(normalized(index.source.entry),'.ybn'),hash=collisionNameHash(stem);
 if(normalized(selected.Path)!==normalized(index.source.entry)||selected.Kind!=='ybn'||normalized(selected.Hash)!==hash||normalized(projection.Hash)!==hash||normalized(item.NameHash)!==hash)return unresolved('selected-resource-identity-mismatch');
 if(!Number.isInteger(Number(item.Layer))||Number(item.Layer)!==0||typeof item.CacheFile!=='string'||!item.CacheFile.length||!digest(item.CacheMetadataSHA256))return unresolved('layer-zero-cache-provenance-required');
 const cacheBounds={min:item.Min,max:item.Max};if(!bounds(cacheBounds))return unresolved('cache-bounds-invalid');
 const outsideDistance=Math.max(0,...index.bounds.min.map((v,i)=>cacheBounds.min[i]-v),...index.bounds.max.map((v,i)=>v-cacheBounds.max[i]));
 // Float32 cache/parser arithmetic can differ at sub-unit precision. This is an explicit
 // 0.001 native-unit sanity tolerance, not an acoustic clearance or measurement claim.
 if(outsideDistance>.001)return unresolved('export-outside-native-cache-bounds');
 return {state:'codewalker-exterior-static-model',algorithm:'codewalker-exterior-static-gate-v1',coordinateSpace:'world',placement:'codewalker-cache-exterior-identity',offlineCoordinateFrameVerified:true,worldPlacementVerified:false,runtimeActivation:'unverified',sourceSHA256:index.source.sha256,sourceEntry:index.source.entry,resourceHash:hash,indexSHA256:pins.indexSHA256,catalogSHA256:pins.catalogSHA256,receiptSHA256:pins.receiptSHA256,cacheFile:item.CacheFile,cacheMetadataSHA256:item.CacheMetadataSHA256,cacheBounds,boundsToleranceNativeUnits:.001,maxOutsideCacheBoundsNativeUnits:outsideDistance,manifestFilesVisited:projection.ManifestFilesVisited,cacheFilesVisited:projection.CacheFilesVisited,interiorMemberships:0,conditionalMapGroupMemberships:0,selectedDlc:catalog.SelectedDlc,gen9SelectorAvailable:catalog.Gen9SelectorAvailable,coverage:index.coverage};
}
function pinnedJson(filename,expected){if(!digest(expected))throw Error('expected evidence SHA-256 required');const stat=fs.statSync(filename);if(stat.size>67108864)throw Error('evidence byte limit');const bytes=fs.readFileSync(filename);if(sha256(bytes)!==expected.toLowerCase())throw Error('evidence integrity');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
export function loadStaticWorldResource({indexPath,catalogPath,receiptPath,indexSHA256,catalogSHA256,receiptSHA256}){
 const resource=loadCollisionResource(indexPath,{expectedSHA256:indexSHA256}),catalog=pinnedJson(catalogPath,catalogSHA256),receipt=pinnedJson(receiptPath,receiptSHA256),classification=classifyStaticWorldResource(resource.index,catalog,receipt,{indexSHA256,catalogSHA256,receiptSHA256});
 return {classification,resource,query(query,limits){if(classification.state!=='codewalker-exterior-static-model')throw Error('world-coordinate query blocked: '+classification.reason);const view=resource.query(query,limits);return {...view,coordinateSpace:'world',placement:classification.placement,offlineCoordinateFrameVerified:true,worldPlacementVerified:false,runtimeActivation:'unverified',classificationState:classification.state};}};
}
