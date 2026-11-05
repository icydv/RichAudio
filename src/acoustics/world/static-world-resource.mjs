// A pinned, target-only CodeWalker model classification. This never observes GTA runtime state.
import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './collision-mesh.mjs';
import {loadCollisionResource} from './collision-resource.mjs';
import {freeze} from './contracts.mjs';
import {validateAnalyticPrimitive01,analyticPrimitiveRevision01} from './analytic-primitives01.mjs';
import {validNativeSupportBounds01} from './native-support-bounds-completion01.mjs';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const normalized=v=>typeof v==='string'?v.replaceAll('\\','/').toLowerCase():'';
const bounds=b=>b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(Number.isFinite))&&b.min.every((v,i)=>v<=b.max[i]);
const selectedByCatalog=new WeakMap();
const retainedCatalogues=new Map();
export function collisionNameHash(name){let value=0;for(const byte of Buffer.from(name.toLowerCase(),'utf8')){value=(value+byte)>>>0;value=(value+(value<<10))>>>0;value=(value^(value>>>6))>>>0;}value=(value+(value<<3))>>>0;value=(value^(value>>>11))>>>0;return '0x'+((value+(value<<15))>>>0).toString(16).padStart(8,'0');}
export function collisionProjection(catalog,hash){
 const all=catalog.CollisionPlacementIndex;
 if(all?.IndexComplete===true&&all.ProjectionSchemaGaps===0&&['InteriorBoundsMembershipByHash','MapGroupMembershipByHash','BoundsStoreItemsByHash'].every(k=>all[k]&&typeof all[k]==='object'&&!Array.isArray(all[k]))){
  let selected=selectedByCatalog.get(catalog);if(!selected){selected=new Map();for(const row of catalog.Resources??[])if(row.Kind==='ybn'){const key=normalized(row.Hash);if(!selected.has(key))selected.set(key,[]);selected.get(key).push(row);}selectedByCatalog.set(catalog,selected);}
  return {Hash:hash,ManifestFilesVisited:all.ManifestFilesVisited,CacheFilesVisited:all.CacheFilesVisited,ProjectionSchemaGaps:0,InteriorBoundsMembership:all.InteriorBoundsMembershipByHash[hash]??[],MapGroupMembership:all.MapGroupMembershipByHash[hash]??[],BoundsStoreItems:all.BoundsStoreItemsByHash[hash]??[],SelectedYbn:selected.get(hash)??[]};
 }
 return normalized(catalog.TargetCollisionEvidence?.Hash)===hash?catalog.TargetCollisionEvidence:null;
}
export function classifyStaticWorldResource(index,catalog,receipt,pins,{potentialOnly=false}={}){
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
 if(projection.MapGroupMembership.length&&!potentialOnly)return unresolved('conditional-mapgroup-activation-unresolved');
 if(projection.BoundsStoreItems.length!==1||projection.SelectedYbn.length!==1)return unresolved('unique-selected-ybn-and-bounds-required');
 const selected=projection.SelectedYbn[0],item=projection.BoundsStoreItems[0],stem=path.posix.basename(normalized(index.source.entry),'.ybn'),hash=collisionNameHash(stem);
 if(normalized(selected.Path)!==normalized(index.source.entry)||selected.Kind!=='ybn'||normalized(selected.Hash)!==hash||normalized(projection.Hash)!==hash||normalized(item.NameHash)!==hash)return unresolved('selected-resource-identity-mismatch');
 if(!Number.isInteger(Number(item.Layer))||(!potentialOnly&&Number(item.Layer)!==0)||typeof item.CacheFile!=='string'||!item.CacheFile.length||!digest(item.CacheMetadataSHA256))return unresolved('layer-zero-cache-provenance-required');
 const cacheBounds={min:item.Min,max:item.Max};if(!bounds(cacheBounds))return unresolved('cache-bounds-invalid');
 // Unsupported analytic envelopes are deliberately conservative and may exceed
 // the native primitive bounds. They remain unknown coverage, not exact points
 // with which to reject otherwise correctly placed supported triangles.
 const excess=b=>Math.max(0,...b.min.map((v,i)=>cacheBounds.min[i]-v),...b.max.map((v,i)=>v-cacheBounds.max[i]));
 if(!Array.isArray(index.chunks)||index.chunks.some(c=>!bounds(c.bounds)))return unresolved('no-valid-supported-acoustic-surface-bounds');
 if(index.nativeSupportBounds01!==undefined&&!validNativeSupportBounds01(index.nativeSupportBounds01,index))return unresolved('invalid-native-indexed-source-bounds');
 const surfaceSupport=index.chunks.map(c=>c.bounds),support=index.nativeSupportBounds01?(index.nativeSupportBounds01.nativeIndexedBounds?[index.nativeSupportBounds01.nativeIndexedBounds]:[]):[...surfaceSupport];let admittedAnalytic=0;
 if(index.analyticPrimitives01!==undefined){const a=index.analyticPrimitives01;if(a.revision!==analyticPrimitiveRevision01||a.sourceSHA256!==index.source.sha256||!Array.isArray(a.primitives)||a.primitives.length>65536)return unresolved('invalid-compact-analytic-source');for(const p of a.primitives){try{validateAnalyticPrimitive01(p);}catch{return unresolved('invalid-compact-analytic-source');}if(excess(p.bounds)<=.001){support.push(p.bounds);surfaceSupport.push(p.bounds);admittedAnalytic++;}}}
 if(!support.length)return unresolved('no-valid-supported-acoustic-surface-bounds');
 const supportedBounds={min:[0,1,2].map(i=>Math.min(...support.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...support.map(b=>b.max[i])))};
 const outsideDistance=excess(supportedBounds),unknownEnvelopeOutsideDistance=excess(index.bounds);
 // Float32 cache/parser arithmetic can differ at sub-unit precision. This is an explicit
 // 0.001 native-unit sanity tolerance, not an acoustic clearance or measurement claim.
 if(outsideDistance>.001)return unresolved('export-outside-native-cache-bounds');
 const queryBounds={min:[0,1,2].map(i=>Math.min(cacheBounds.min[i],...surfaceSupport.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(cacheBounds.max[i],...surfaceSupport.map(b=>b.max[i])))};
 return {state:potentialOnly?'codewalker-potential-world-placement':'codewalker-exterior-static-model',algorithm:'codewalker-exterior-supported-bounds01',coordinateSpace:'world',placement:'codewalker-cache-exterior-identity',offlineCoordinateFrameVerified:true,worldPlacementVerified:false,runtimeActivation:'unverified',conditionalStaticModelInclusionAllowed:!potentialOnly,sourceSHA256:index.source.sha256,sourceEntry:index.source.entry,resourceHash:hash,indexSHA256:pins.indexSHA256,catalogSHA256:pins.catalogSHA256,receiptSHA256:pins.receiptSHA256,cacheFile:item.CacheFile,cacheMetadataSHA256:item.CacheMetadataSHA256,cacheBounds,queryBounds,boundsToleranceNativeUnits:.001,maxOutsideCacheBoundsNativeUnits:outsideDistance,coordinateCheck:index.nativeSupportBounds01?'native-indexed-source-points; complete-reconstructed-Box-envelope-retained':'supported-triangle-and-in-bounds-analytic-model-bounds',reconstructedSurfaceMaxOutsideCacheBoundsNativeUnits:surfaceSupport.length?Math.max(...surfaceSupport.map(excess)):0,admittedAnalyticPrimitiveBounds:admittedAnalytic,unsupportedEnvelopeMaxOutsideCacheBoundsNativeUnits:unknownEnvelopeOutsideDistance,unsupportedEnvelopesRemainUnknown:true,manifestFilesVisited:projection.ManifestFilesVisited,cacheFilesVisited:projection.CacheFilesVisited,interiorMemberships:0,conditionalMapGroupMemberships:projection.MapGroupMembership.length,selectedDlc:catalog.SelectedDlc,gen9SelectorAvailable:catalog.Gen9SelectorAvailable,coverage:index.coverage};
}
// A cacheable potential resource is intentionally weaker than a world model.
// This proves exact selected source/decoder bytes, never placement or activation.
export function classifyPotentialCollisionResource01(index,catalog,receipt,pins){
 const unresolved=reason=>({state:'unresolved',reason,coordinateSpace:'resource-root',offlineCoordinateFrameVerified:false,worldPlacementVerified:false,runtimeActivation:'unverified'});
 if(!pins||!['indexSHA256','catalogSHA256','receiptSHA256'].every(k=>digest(pins[k])))return unresolved('pinned-evidence-digests-required');
 if(index?.kind!=='RichAudioCollisionMesh'||index.coordinateSpace!=='resource-root'||index.placement!=='unresolved-static-vs-archetype-local'||!digest(index.source?.sha256))return unresolved('resource-root-export-required');
 if(catalog?.Schema!==1||catalog.Stage!=='codewalker-resolved-installation-model'||catalog.ParserErrorCount!==0)return unresolved('complete-codewalker-model-required');
 if(receipt?.Schema!==1||receipt.ArchiveUnchanged!==true||receipt.ArchiveVerification!=='sha256-before-after'||!digest(receipt.BeforeSHA256)||normalized(receipt.BeforeSHA256)!==normalized(receipt.AfterSHA256))return unresolved('archive-content-integrity-proof-required');
 if(normalized(receipt.SourceSHA256)!==normalized(index.source.sha256)||normalized(receipt.Entry)!==normalized(index.source.entry)||normalized(receipt.Archive)!==normalized(index.source.archive)||!normalized(index.source.entry).startsWith(normalized(index.source.archive)+'/'))return unresolved('export-receipt-source-mismatch');
 if(!digest(catalog.InputBinding?.CodeWalkerCoreSHA256)||normalized(catalog.InputBinding.CodeWalkerCoreSHA256)!==normalized(receipt.ParserSHA256))return unresolved('parser-binding-mismatch');
 const hash=collisionNameHash(path.posix.basename(normalized(index.source.entry),'.ybn')),selected=(collisionProjection(catalog,hash)?.SelectedYbn??catalog.Resources.filter(r=>r.Kind==='ybn'&&normalized(r.Hash)===hash));
 if(selected.length!==1||normalized(selected[0].Path)!==normalized(index.source.entry))return unresolved('unique-selected-resource-identity-required');
 return {state:'codewalker-potential-resource-model',coordinateSpace:'resource-root',offlineCoordinateFrameVerified:false,worldPlacementVerified:false,runtimeActivation:'unverified',liveSceneInclusionAllowed:false,sourceSHA256:index.source.sha256,sourceEntry:index.source.entry,resourceHash:hash,indexSHA256:pins.indexSHA256,catalogSHA256:pins.catalogSHA256,receiptSHA256:pins.receiptSHA256,coverage:index.coverage,geometryAvailability:'decoded-supported-surfaces-partial',availableTriangleSurfaces:index.counts?.triangles??0,compactAnalyticPrimitives:index.analyticPrimitives01?.primitives.length??0,unrepresentedGeometryRegions:index.unknownRegions?.length??0,placement:'unresolved-potential-variant',activation:'unobserved',PlacementQualification01:classifyStaticWorldResource(index,catalog,receipt,pins,{potentialOnly:true})};
}
function pinnedJson(filename,expected){if(!digest(expected))throw Error('expected evidence SHA-256 required');const stat=fs.statSync(filename);if(stat.size>67108864)throw Error('evidence byte limit');const bytes=fs.readFileSync(filename);if(sha256(bytes)!==expected.toLowerCase())throw Error('evidence integrity');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
function pinnedCatalogue(filename,expected){
 const absolute=path.resolve(filename),stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>67108864)throw Error('regular bounded catalogue required');const key=absolute+'\n'+expected,identity=[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':'),held=retainedCatalogues.get(key);
 if(held?.identity===identity){retainedCatalogues.delete(key);retainedCatalogues.set(key,held);return held.value;}
 const value=freeze(pinnedJson(absolute,expected));retainedCatalogues.set(key,{identity,value});while(retainedCatalogues.size>2)retainedCatalogues.delete(retainedCatalogues.keys().next().value);return value;
}
export function loadStaticWorldResource({indexPath,catalogPath,receiptPath,indexSHA256,catalogSHA256,receiptSHA256}){
 const resource=loadCollisionResource(indexPath,{expectedSHA256:indexSHA256}),catalog=pinnedCatalogue(catalogPath,catalogSHA256),receipt=pinnedJson(receiptPath,receiptSHA256),classification=classifyStaticWorldResource(resource.index,catalog,receipt,{indexSHA256,catalogSHA256,receiptSHA256});
 return {classification,resource,query(query,limits){if(classification.state!=='codewalker-exterior-static-model')throw Error('world-coordinate query blocked: '+classification.reason);const view=resource.query(query,{...limits,nativeBounds:classification.cacheBounds});return {...view,coordinateSpace:'world',placement:classification.placement,offlineCoordinateFrameVerified:true,worldPlacementVerified:false,runtimeActivation:'unverified',classificationState:classification.state};}};
}
