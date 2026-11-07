// Locally relevant finite surfaces from the EXISTING installed collision cache.
// This reads private derived data only; archive decoding belongs to the existing
// startup worker. Static installation modelling never observes live activation.
import fs from 'node:fs';
import {isPreparedWorldMetadata01,sceneSource01} from './prepared-world-metadata01.mjs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {Worker} from 'node:worker_threads';
import {classifyStaticWorldResource,classifyPotentialCollisionResource01,collisionProjection} from './static-world-resource.mjs';
import {loadCollisionResource,createCollisionResourceProfile01} from './collision-resource.mjs';
import {InstalledStaticComponents01} from './static-component-cache01.mjs';
import {worldCoverageStates01} from './world-state-completion01.mjs';
import {resolveInteriorCollisionPlacements01,interiorInstanceIdentities01} from './interior-placements-completion01.mjs';
import {interiorObservationKey01,interiorWorksetAnchor01,surroundingInteriorHalfWidth01,matchInteriorInstance01,inverseInteriorTransform01,transformInteriorBounds01} from './interior-activation01.mjs';
import {sha256,triangleNormal,queryChunkIds,queryUnknownRegions} from './collision-mesh.mjs';
import {createTile,coordinateSpace,cross,dot,sub,inBox,onPatch,querySegment,preparedTileIndexTransfer01,adoptSourceBoundTileTransfer01,retimeInstalledStaticTile01} from '../research/local-geometry.mjs';
import {acousticScene,adoptSourceBoundAcousticScene01} from '../engine/contracts.mjs';
import {prepareGpuGeometry01,adoptSourceBoundGpuGeometry01} from '../gpu/geometry.mjs';
import {digest,freeze,requireWorld,vector} from './contracts.mjs';
const scenes=new WeakMap(),encodedScenes=new WeakMap(),triangleShapes01=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),touch=(a,b)=>a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]);
function measured01(profile,key,operation){if(!profile)return operation();const began=performance.now();try{return operation();}finally{profile[key]+=performance.now()-began;}}
function read01(file,profile){const bytes=measured01(profile,'fileReadMs',()=>fs.readFileSync(file));if(profile){profile.fileReadCalls++;profile.fileReadLogicalBytes+=bytes.length;}return bytes;}
function hash01(bytes,profile){if(profile)profile.sha256Calls++;return measured01(profile,'sha256Ms',()=>sha256(bytes));}
function json(file,expected,profile=null){const size=fs.statSync(file).size;requireWorld(size>0&&size<=67108864,'bounded private installed-world metadata');const bytes=read01(file,profile);if(expected!==undefined)requireWorld(hex(expected)&&hash01(bytes,profile)===expected,'pinned installed-world metadata');return measured01(profile,'jsonDecodeParseMs',()=>JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));}
function clip(points,box){for(let axis=0;axis<3;axis++)for(const upper of [false,true]){if(!points.length)return points;const edge=upper?box.max[axis]:box.min[axis],inside=p=>upper?p[axis]<=edge:p[axis]>=edge,next=[];for(let n=0;n<points.length;n++){const a=points[n],b=points[(n+1)%points.length],ia=inside(a),ib=inside(b);if(ia)next.push(a);if(ia!==ib){const t=(edge-a[axis])/(b[axis]-a[axis]);next.push(a.map((v,i)=>v+(b[i]-v)*t));}}points=next;}return points.filter((p,i,a)=>!a.slice(0,i).some(q=>Math.hypot(...sub(p,q))<1e-8));}
function panelShape01(triangle,points,id){if(points.length<3)return null;const normal=triangleShape01(triangle).normal;if(!normal)return null;const center=[0,1,2].map(i=>points.reduce((n,p)=>n+p[i],0)/points.length),edge=sub(points[1],points[0]),length=Math.hypot(...edge);if(length<1e-8)return null;const u=edge.map(n=>n/length),v=cross(normal,u),footprint=points.map(p=>{const d=sub(p,center);return [dot(d,u),dot(d,v)];}),area=footprint.reduce((n,a,i)=>{const b=footprint[(i+1)%footprint.length];return n+a[0]*b[1]-a[1]*b[0];},0);if(Math.abs(area)<1e-8)return null;if(area<0)footprint.reverse();
 const surface={id,coordinateSpace,center,normal,u,half:[0,1].map(i=>Math.max(...footprint.map(p=>Math.abs(p[i])))),footprint,motion:'static',reflectiveSide:'both',provenance:{kind:'derived',reference:triangle.primitiveFamily?'installed-analytic-approximation01':'installed-static-collision01'},confidence:null,version:1,material:{observedId:triangle.materialType,observedConfidence:1,acoustic:null}},key=digest(footprint.map(([x,y])=>center.map((n,i)=>n+u[i]*x+v[i]*y)).map(p=>p.join(',')).sort());return freeze({surface,key});}
function panel(triangle,box,id,createdAt,validUntil,profile=null){
 const shape=triangleShape01(triangle),whole=shape.bounds.min.every((v,i)=>v>=box.min[i]&&shape.bounds.max[i]<=box.max[i]);let prepared=whole?shape.panels.get(id):null;
 // A template contains no observation timestamp, generation, listener or pose.
 // It is valid only for a wholly contained immutable triangle. Crossing the
 // current window boundary always performs the original exact clipping.
 if(profile){if(prepared)profile.panelTemplateHits++;else if(whole)profile.panelTemplateMisses++;else profile.clippedPanels++;}
 if(!prepared){prepared=panelShape01(triangle,clip(triangle.positions,box),id);if(whole&&prepared&&shape.panels.size<16)shape.panels.set(id,prepared);}
 return prepared?{surface:{...prepared.surface,observedAt:createdAt,validUntil},key:prepared.key}:null;
}

// Retain only immutable geometry derived from digest-verified chunk records.
// Current clipping, distance ordering, observation lifetimes and reflection
// selection are recomputed for every request, including a moving listener.
function triangleShape01(triangle){let held=triangleShapes01.get(triangle);if(!held){const points=triangle.positions;held={bounds:freeze({min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))}),normal:triangleNormal(points),ids:new Map(),panels:new Map()};triangleShapes01.set(triangle,held);}return held;}
function triangleId01(resource,triangle){const shape=triangleShape01(triangle);let id=shape.ids.get(resource);if(!id){id='installed01:'+digest([resource,triangle.node,triangle.polygon,triangle.positions]).slice(0,40);if(shape.ids.size<16)shape.ids.set(resource,id);}return id;}
const queryViewLimits01=Object.freeze({views:8,bytes:64*1024*1024,triangles:32768,chargePerRecord:4096});
// Diagnostic history is bounded independently of retained geometry. Hashes
// identify query inputs without retaining paths, coordinates or geometry.
const cacheAuditLimits01=Object.freeze({events:128,queries:256,owners:128});
const cacheAuditCounters01=()=>Object.fromEntries(['lookups','hits','misses','admissions','coldQueries','coldResources','changedChunks','changedAnalytics','changedUnknown','changedLimits','changedOwner','missAfterEviction','missAfterInvalidation','missAfterInadmissibility','rejectedTriangleLimit','rejectedByteLimit','evictedByteLimit','evictedCountLimit','evictedOwnerResidency','invalidatedOwnerBinding','invalidatedWorldBinding','invalidatedIntegrity','invalidatedClose','timelineDropped'].map(k=>[k,0]));
const resourceAuditBinding01=row=>{
 const result=sceneSource01(row);
 return {index:digest([result.IndexPath,result.IndexSHA256]),receipt:digest([result.ReceiptPath,result.ReceiptSHA256]),archive:result.ArchiveSHA256??null,proof:digest(row.ArchiveValidation01??null)};
};
function finiteReflectorIds01(tile,sources,listener){
 const candidates=[];
 for(const s of tile.surfaces){let distance=Infinity;for(const source of sources.length?sources:[listener]){const a=dot(sub(source,s.center),s.normal),b=dot(sub(listener,s.center),s.normal);if(a*b<=1e-8)continue;const image=source.map((v,i)=>v-2*a*s.normal[i]),delta=sub(listener,image),den=dot(delta,s.normal);if(Math.abs(den)<1e-8)continue;const t=dot(sub(s.center,image),s.normal)/den;if(t<=0||t>=1)continue;const hit=image.map((v,i)=>v+delta[i]*t);if(!onPatch(s,hit))continue;distance=Math.min(distance,Math.hypot(...sub(source,hit))+Math.hypot(...sub(listener,hit)));}
  if(Number.isFinite(distance)){const sign=s.normal.find(v=>Math.abs(v)>.001)<0?-1:1,plane=s.normal.map(v=>Math.round(v*sign*50)).join(',')+':'+Math.round(dot(s.center,s.normal)*sign*10);candidates.push({s,distance,plane});}}
 candidates.sort((a,b)=>a.distance-b.distance||a.s.id.localeCompare(b.s.id));const feasible=[];
 // Exact finite visibility is tested only for a bounded candidate shortlist.
 // Ranking groups planes; no surfaces are merged or replaced with walls.
 for(const c of candidates.slice(0,128)){for(const source of sources.length?sources:[listener]){const a=dot(sub(source,c.s.center),c.s.normal);if(a*dot(sub(listener,c.s.center),c.s.normal)<=1e-8)continue;const image=source.map((v,i)=>v-2*a*c.s.normal[i]),delta=sub(listener,image),den=dot(delta,c.s.normal);if(Math.abs(den)<1e-8)continue;const t=dot(sub(c.s.center,image),c.s.normal)/den,hit=image.map((v,i)=>v+delta[i]*t);if(t<=0||t>=1||!onPatch(c.s,hit))continue;const left=querySegment(tile,source,hit,{reflectorId:c.s.id}),right=querySegment(tile,hit,listener,{reflectorId:c.s.id});if(!left.hits.length&&!right.hits.length&&!left.unknown.length&&!right.unknown.length&&!left.ambiguous.length&&!right.ambiguous.length){feasible.push(c);break;}}}
 const seen=new Set(),selected=[];for(const c of feasible)if(!seen.has(c.plane)&&selected.length<16){seen.add(c.plane);selected.push(c.s.id);}for(const c of feasible)if(selected.length<16&&!selected.includes(c.s.id))selected.push(c.s.id);return selected;
}
function resourceQueryBounds01(row,b){
 if(!b)return null;const native={min:b.Min,max:b.Max},c=row.Result?.Classification,q=c?.queryBounds;
 if(c?.indexSHA256!==row.Result?.IndexSHA256||!q||!['min','max'].every(k=>Array.isArray(q[k])&&q[k].length===3&&q[k].every(Number.isFinite)))return native;
 return {min:native.min.map((v,i)=>Math.min(v,q.min[i])),max:native.max.map((v,i)=>Math.max(v,q.max[i]))};
}
function unknownRegions01(regions,box,nearBox=null){
 regions=regions.map(b=>b?{min:b.min.map((v,i)=>b.max[i]-v<.002?v-.001:v),max:b.max.map((v,i)=>v-b.min[i]<.002?v+.001:v)}:null);
 const clipped=regions.map(b=>b&&touch(b,box)?{min:b.min.map((v,i)=>Math.max(v,box.min[i])),max:b.max.map((v,i)=>Math.min(v,box.max[i]))}:b===null?box:null).filter(b=>b&&b.min.every((v,i)=>b.max[i]>v));
 if(clipped.length>32&&nearBox){
  // Keep conservatively merged omissions local to their side of the near
  // field, so distant omissions do not become one box through the listener.
  const groups=new Map();
  for(const bounds of clipped){
   const key=bounds.min.map((v,i)=>{const centre=(v+bounds.max[i])/2;return centre<nearBox.min[i]?-1:centre>nearBox.max[i]?1:0;}).join(',');
   const held=groups.get(key);
   if(!held){groups.set(key,bounds);continue;}
   for(let i=0;i<3;i++){held.min[i]=Math.min(held.min[i],bounds.min[i]);held.max[i]=Math.max(held.max[i],bounds.max[i]);}
  }
  clipped.splice(0,clipped.length,...groups.values());
 }else if(clipped.length>32){const tail=clipped.splice(31);clipped.push({min:[0,1,2].map(i=>Math.min(...tail.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...tail.map(b=>b.max[i])))});}
 return clipped.map((bounds,i)=>({id:'installed01-unknown:'+i,bounds,reason:'unsupported-or-unprepared-static-geometry'}));
}
// Index known and withheld regions. Horizontal cells bound fan-out, and
// selection still tests the original three-dimensional bounds.
const worldCellSize01=256;
function worldCellKeys01(box){
 const [x,y]=box.min.map(v=>Math.floor(v/worldCellSize01));
 const [right,top]=box.max.map(v=>Math.floor(v/worldCellSize01));
 if(![x,y,right,top].every(Number.isSafeInteger)||right<x||top<y||(right-x+1)*(top-y+1)>32)return null;
 const keys=[];
 for(let i=x;i<=right;i++)for(let j=y;j<=top;j++)keys.push(i+','+j);
 return keys;
}
function worldSpatialIndex01(rows){
 const cells=Object.create(null),overflow=[];let references=0;
 for(const [index,entry] of rows.entries()){
  const keys=new Set();
  let broad=false;
  for(const bounds of entry.bounds?[entry.bounds]:entry.interiorBounds.map(p=>p.bounds)){
   const local=worldCellKeys01(bounds);
   if(!local){broad=true;break;}
   for(const key of local)keys.add(key);
   if(keys.size>32){broad=true;break;}
  }
  if(broad||references+keys.size>262144){overflow.push(index);continue;}
  references+=keys.size;
  for(const key of keys)(cells[key]??=[]).push(index);
 }
 return {cells,overflow};
}
function windowRows01(rows,index,box){
 const keys=worldCellKeys01(box);
 if(!index||!keys)return rows;
 const candidates=new Set(index.overflow);
 for(const key of keys)for(const id of index.cells[key]??[])candidates.add(id);
 return [...candidates].sort((a,b)=>a-b).map(id=>rows[id]);
}
export class InstalledStaticWorld01 {
 #pendingSelection01=null;#selectionRevision01=0;
 constructor({manifestPath,catalogPath,catalogSHA256,maximumResidentResources=8,privateRoot=null,requiredValidationEpochUtc01=null,manifestInput01=null,preparedMetadata01=null}={}){
  requireWorld(typeof manifestPath==='string'&&typeof catalogPath==='string'&&hex(catalogSHA256)&&Number.isInteger(maximumResidentResources)&&maximumResidentResources>=1&&maximumResidentResources<=16,'explicit bounded installed static-cache configuration');requireWorld(requiredValidationEpochUtc01===null||typeof requiredValidationEpochUtc01==='string'&&Number.isFinite(Date.parse(requiredValidationEpochUtc01)),'explicit validation epoch');this.operations01=createCollisionResourceProfile01();this.staticComponents01=new InstalledStaticComponents01();this.requiredValidationEpochUtc01=requiredValidationEpochUtc01;this.manifestPath=path.resolve(manifestPath);this.catalogPath=path.resolve(catalogPath);this.catalogSHA256=catalogSHA256;let common=path.dirname(this.manifestPath);while(!this.catalogPath.startsWith(common+path.sep)&&common!==path.dirname(common))common=path.dirname(common);this.privateRoot=path.resolve(privateRoot??common);requireWorld(this.privateRoot!==path.parse(this.privateRoot).root,'specific private derived-cache root required');this.#privateInput(this.manifestPath);this.#privateInput(this.catalogPath);if(preparedMetadata01)requireWorld(isPreparedWorldMetadata01(preparedMetadata01),'Owned prepared metadata required');this.catalog=preparedMetadata01?.catalog??json(this.catalogPath,catalogSHA256,this.operations01);requireWorld(this.catalog.Schema===1&&this.catalog.Stage==='codewalker-resolved-installation-model'&&this.catalog.ParserErrorCount===0,'successful effective installation model required');this.projectionByHash=preparedMetadata01?new Map():new Map(this.catalog.Resources.filter(r=>r.Kind==='ybn').map(r=>[r.Hash.toLowerCase(),collisionProjection(this.catalog,r.Hash.toLowerCase())]));this.interiorByHash=new Map([...this.projectionByHash].filter(([,p])=>p?.InteriorBoundsMembership?.length).map(([hash,p])=>[hash,resolveInteriorCollisionPlacements01(this.catalog,hash,p.InteriorBoundsMembership)]));this.interiorIdentities01=preparedMetadata01?.interiorIdentities01??interiorInstanceIdentities01(this.catalog);this.maximumResidentResources=maximumResidentResources;this.resident=new Map();this.queryViews01=new Map();this.queryViewBytes01=0;this.loads=0;this.resourceLoadMilliseconds=0;this.failures=0;this.last=null;this.lastWindowProfile01=null;this.profileTotals01={windows:0,queryViewHits:0,queryViewMisses:0,queryViewEvictions:0};this.cacheAuditTotals01=cacheAuditCounters01();this.cacheAuditEvents01=[];this.cacheAuditQueries01=new Map();this.cacheAuditOwners01=new Map();this.cacheAuditSerial01=0;if(preparedMetadata01)this.installMetadata01(preparedMetadata01);else this.reload(manifestInput01);
 }
 #privateInput(file){const absolute=path.resolve(file);requireWorld(absolute.startsWith(this.privateRoot+path.sep),'installed derived-cache path escaped its private root');for(let at=absolute;;){const stat=fs.lstatSync(at);requireWorld(!stat.isSymbolicLink(),'linked installed derived-cache input refused');const parent=path.dirname(at);if(parent===at)break;at=parent;}return absolute;}
 reload(manifestInput01=null){
  this.#pendingSelection01=null;this.#selectionRevision01++;this.#anchoredSelections01.clear();
  this.#privateInput(this.manifestPath);
  const manifest=manifestInput01??json(this.manifestPath,undefined,this.operations01);
  requireWorld(manifest.Schema===1&&manifest.ResolvedCatalogSHA256===this.catalogSHA256&&
   manifest.InputBinding?.GameExecutableSHA256===this.catalog.InputBinding.GameExecutableSHA256&&
   manifest.InputBinding?.CodeWalkerCoreSHA256===this.catalog.InputBinding.CodeWalkerCoreSHA256&&
   Array.isArray(manifest.Resources)&&manifest.Resources.length<=262144,'same installed catalogue/game/parser cache binding');
  const reloadBinding=digest([this.catalogSHA256,this.requiredValidationEpochUtc01,manifest.ValidationEpochUtc01??null,
   manifest.InputFingerprint,manifest.InputBinding]);
  if(this.reloadBinding01!==reloadBinding){
   this.#clearQueryViews01('world-binding-change');
   this.staticComponents01.clear('world-binding-change');
   this.resident.clear();
   this.reloadBinding01=reloadBinding;
  }
  this.manifest=manifest;
  this.rows=manifest.Resources.map(originalRow=>{
   const proof=originalRow.ArchiveValidation01,result=originalRow.Result??originalRow.PotentialResult;
   const valid=!this.requiredValidationEpochUtc01||manifest.ValidationEpochUtc01===this.requiredValidationEpochUtc01&&
    proof?.EpochUtc===this.requiredValidationEpochUtc01&&proof.Source==='current-archive-sha256'&&
    hex(proof.ArchiveSHA256)&&proof.ArchiveSHA256===result?.ArchiveSHA256;
   const row=valid?originalRow:{...originalRow,
    Status:originalRow.Status==='imported-exterior-incomplete-surfaces'?'cache-awaiting-current-startup-validation':originalRow.Status,
    PotentialStatus:originalRow.PotentialStatus==='imported-resource-root-incomplete-surfaces'?'cache-awaiting-current-startup-validation':originalRow.PotentialStatus};
   const hash=row.Hash?.toLowerCase(),projection=this.projectionByHash.get(hash),interior=this.interiorByHash.get(hash);
   const bounds=projection?.BoundsStoreItems?.length===1?projection.BoundsStoreItems[0]:null;
   // A camera proxy qualifies a placed instance. Conditional membership and
   // layers beyond the current layer-zero model need independent evidence.
   const layerZero=bounds?.Layer===0||bounds?.Layer==='0';
   const interiorPlacements=interior&&projection.MapGroupMembership?.length===0&&layerZero
    ?interior.placements.flatMap(placement=>{
     const inverse=inverseInteriorTransform01(placement.matrix);
     if(!inverse)return [];
     const portalBounds=placement.declaredPortals.map(portal=>({
      min:[0,1,2].map(j=>Math.min(...portal.cornersWorld.map(point=>point[j]))),
      max:[0,1,2].map(j=>Math.max(...portal.cornersWorld.map(point=>point[j]))),
     }));
     return [{id:placement.instanceId,key:digest([placement.instanceId,placement.matrix]),
      bounds:placement.bounds,matrix:placement.matrix,inverse,portalBounds}];
    }):[];
   return {row,interiorPlacements,
    validationState:this.requiredValidationEpochUtc01===null?'pinned-offline-model':valid?'validated-current-source':'awaiting-current-source-validation',
    bounds:interior?null:resourceQueryBounds01(row,bounds),
    interiorBounds:interior?.placements.map(p=>({id:p.instanceId,bounds:p.bounds}))??[],
    layer:bounds?Number(bounds.Layer):null};
  });
  const heldIndexPaths=new Set([...this.resident.values()].map(r=>r.indexPath01));
  const liveKeys=new Set(this.rows.filter(r=>heldIndexPaths.has(sceneSource01(r.row)?.IndexPath)).map(r=>this.#resourceKey01(r.row)));
  for(const [key]of this.resident)if(!liveKeys.has(key)){
   const invalidationReason=this.#ownerInvalidationReason01(key);
   this.resident.delete(key);
   this.staticComponents01.clearOwner(key,invalidationReason);
   for(const [viewKey,view]of this.queryViews01)if(view.resourceKey===key)this.#dropQueryView01(viewKey,invalidationReason,true);
  }
  const ready=this.rows.filter(r=>r.row.Status==='imported-exterior-incomplete-surfaces').length;
  const eligible=this.manifest.Resources.filter(r=>r.Eligibility==='eligible-exterior').length;
  this.globalStatus01=freeze({ready,eligible,coverageStates:worldCoverageStates01({...this.manifest,Resources:this.rows.map(r=>r.row)}),
   unlocalizedCoverageResources:this.rows.filter(r=>!r.bounds&&!r.interiorBounds.length).length,
   higherLayerResources:this.rows.filter(r=>[1,2].includes(r.layer)).length});
  return this.status();
 }
 sourceProofRow01(id){return this.rowsByOwner01?this.rowsByOwner01[digest(id)]:this.rows.find(e=>e.row.Id===id);}
 exportMetadata01(){
  // Transfer only the fields used to query, load and attest a scene.
  // The full input still drives coverage accounting on the preparer.
  const rowsByOwner01=Object.create(null),ownerKeys01=Object.create(null),projections01=Object.create(null);
  const rows=this.rows.map(entry=>{
   const {Id,Hash,Status,Eligibility,PotentialStatus,ArchiveValidation01}=entry.row;
   const Result=sceneSource01(entry.row);
   const row={Id,Hash,Status,Eligibility};
   if(Result){
    const {IndexPath,IndexSHA256,ReceiptPath,ReceiptSHA256,ArchiveSHA256}=Result;
    const result={IndexPath,IndexSHA256,ReceiptPath,ReceiptSHA256};
    if(ArchiveSHA256!==undefined)result.ArchiveSHA256=ArchiveSHA256;
    if(Status==='imported-exterior-incomplete-surfaces')row.Result=result;
    else{row.PotentialStatus=PotentialStatus;row.PotentialResult=result;}
   }
   if(ArchiveValidation01!==undefined)row.ArchiveValidation01=ArchiveValidation01;
   const compact={...entry,row},id=digest(Id);
   rowsByOwner01[id]=compact;
   if(Result){
    ownerKeys01[id]=this.#resourceKey01(row);
    const hash=Hash?.toLowerCase(),projection=this.projectionByHash.get(hash);
    if(projection)projections01[hash]={
     ...projection,
     SelectedYbn:projection.SelectedYbn?.map(({Kind,Hash,Path})=>({Kind,Hash,Path})),
    };
   }
   return compact;
  });
  const {Schema,Stage,ParserErrorCount,InputBinding,SelectedDlc,Gen9SelectorAvailable}=this.catalog;
  const catalog={Schema,Stage,ParserErrorCount,InputBinding};
  if(SelectedDlc!==undefined)catalog.SelectedDlc=SelectedDlc;
  if(Gen9SelectorAvailable!==undefined)catalog.Gen9SelectorAvailable=Gen9SelectorAvailable;
  const manifest={InputBinding:this.manifest.InputBinding,InputFingerprint:this.manifest.InputFingerprint};
  if(this.manifest.ValidationEpochUtc01!==undefined)manifest.ValidationEpochUtc01=this.manifest.ValidationEpochUtc01;
  return {projections01,catalog,manifest,rows,rowsByOwner01,ownerKeys01,interiorIdentities01:this.interiorIdentities01,spatialIndex01:worldSpatialIndex01(rows),globalStatus01:this.globalStatus01,
   reloadBinding01:this.reloadBinding01,catalogSHA256:this.catalogSHA256,requiredValidationEpochUtc01:this.requiredValidationEpochUtc01};
 }
 installMetadata01(snapshot){
  requireWorld(isPreparedWorldMetadata01(snapshot)&&snapshot.catalogSHA256===this.catalogSHA256&&snapshot.requiredValidationEpochUtc01===this.requiredValidationEpochUtc01&&snapshot.manifest.InputBinding.GameExecutableSHA256===this.catalog.InputBinding.GameExecutableSHA256&&snapshot.manifest.InputBinding.CodeWalkerCoreSHA256===this.catalog.InputBinding.CodeWalkerCoreSHA256,'Exact prepared metadata binding');
  this.#pendingSelection01=null;this.#selectionRevision01++;this.#anchoredSelections01.clear();if(this.reloadBinding01!==snapshot.reloadBinding01){this.#clearQueryViews01('world-binding-change');this.staticComponents01.clear('world-binding-change');this.resident.clear();}
  this.reloadBinding01=snapshot.reloadBinding01;this.catalog=snapshot.catalog;this.preparedProjections01=snapshot.projections01;this.manifest=snapshot.manifest;this.rows=snapshot.rows;this.interiorIdentities01=snapshot.interiorIdentities01;this.spatialIndex01=snapshot.spatialIndex01;this.rowsByOwner01=snapshot.rowsByOwner01;this.globalStatus01=snapshot.globalStatus01;
  // The resident set is capped at16. No full resource scan at installation.
  for(const [key,held]of this.resident){const entry=snapshot.rowsByOwner01[held.logicalId01];if(!sceneSource01(entry?.row)||snapshot.ownerKeys01[held.logicalId01]!==key){this.resident.delete(key);this.staticComponents01.clearOwner(key,'prepared-source-binding-invalidated');for(const [viewKey,view]of this.queryViews01)if(view.resourceKey===key)this.#dropQueryView01(viewKey,'prepared-source-binding-invalidated',true);}}
  return this.status();
 }
 status(){const {ready,eligible}=this.globalStatus01;return freeze({stage:ready===eligible&&eligible>0?'partial/unsupported':'partial/missing-regions',installedWorldVerified:false,genuineResourceVerified:ready>0,runtimeActivationVerified:false,preparation:{completedEligibleTiles:ready,eligibleTiles:eligible,totalTiles:this.rows.length},actualWorldCoverage:'selected-static-collision-model-with-explicit-gaps',coverageStates:this.globalStatus01.coverageStates,validationEpoch:{required:this.requiredValidationEpochUtc01,headerMatches:this.requiredValidationEpochUtc01===null||this.manifest.ValidationEpochUtc01===this.requiredValidationEpochUtc01},residentResources:this.resident.size,residentResourceLimit:this.maximumResidentResources,resourceLoads:this.loads,resourceLoadMilliseconds:this.resourceLoadMilliseconds,unlocalizedCoverageResources:this.globalStatus01.unlocalizedCoverageResources,queryFailures:this.failures,lastWindow:this.last});}
 #resourceKey01(row){const result=sceneSource01(row);return digest([result.IndexPath,result.IndexSHA256,result.ReceiptPath,result.ReceiptSHA256,this.catalogSHA256,result.ArchiveSHA256??null,this.requiredValidationEpochUtc01,row.ArchiveValidation01??null]);}
 #ownerInvalidationReason01(key){const held=this.resident.get(key);if(!held)return 'owner-binding-invalidated';const current=this.rows.find(r=>digest(r.row.Id)===held.logicalId01);if(!current)return 'owner-resource-removed-invalidated';if(current.validationState==='awaiting-current-source-validation')return 'current-proof-invalidated';if(!sceneSource01(current.row))return 'owner-result-withdrawn-invalidated';const next=resourceAuditBinding01(current.row);for(const field of ['index','receipt','archive','proof'])if(next[field]!==held.auditBinding01[field])return 'owner-'+field+'-identity-invalidated';return 'owner-binding-invalidated';}
 #resource(row,placement){const result=sceneSource01(row);const began=performance.now();this.#privateInput(result.IndexPath);this.#privateInput(result.ReceiptPath);const key=this.#resourceKey01(row);if(this.resident.has(key)){const held=this.resident.get(key);this.resident.delete(key);this.resident.set(key,held);return held;}const mesh=loadCollisionResource(result.IndexPath,{expectedSHA256:result.IndexSHA256,profile01:this.operations01}),receipt=json(result.ReceiptPath,result.ReceiptSHA256,this.operations01),classification=measured01(this.operations01,'resourceClassificationMs',()=>(placement?classifyPotentialCollisionResource01:classifyStaticWorldResource)(mesh.index,this.catalog,receipt,{indexSHA256:result.IndexSHA256,catalogSHA256:this.catalogSHA256,receiptSHA256:result.ReceiptSHA256},{projection01:this.preparedProjections01?(this.preparedProjections01[row.Hash?.toLowerCase()]??false):null})),resource={key,logicalId01:digest(row.Id),auditBinding01:resourceAuditBinding01(row),classification,resource:mesh,indexPath01:result.IndexPath,analyticIndex01:mesh.index.analyticPrimitives01?{schema:1,kind:'RichAudioCollisionMesh',cellSize:mesh.index.analyticPrimitives01.cellSize,cells:mesh.index.analyticPrimitives01.cells,overflowChunks:mesh.index.analyticPrimitives01.overflowChunks,chunks:mesh.index.analyticPrimitives01.primitives.map((p,id)=>({id,bounds:p.bounds}))}:null};resource.query=(box,limits)=>this.#queryResource01(resource,box,limits);if(this.requiredValidationEpochUtc01||result.ArchiveSHA256!==undefined)requireWorld(hex(result.ArchiveSHA256)&&result.ArchiveSHA256===receipt.AfterSHA256,'manifest archive receipt mismatch');requireWorld(resource.classification.state===(placement?'codewalker-potential-resource-model':'codewalker-exterior-static-model'),'selected collision resource provenance');for(const chunk of mesh.index.chunks)this.#privateInput(path.join(path.dirname(result.IndexPath),chunk.file));this.resident.set(key,resource);while(this.resident.size>this.maximumResidentResources){const evicted=this.resident.keys().next().value;this.resident.delete(evicted);this.staticComponents01.clearOwner(evicted,'owner-residency-limit');for(const [viewKey,view]of this.queryViews01)if(view.resourceKey===evicted)this.#dropQueryView01(viewKey,'owner-residency-limit',true);}this.staticComponents01.activateOwner(key);this.loads++;this.resourceLoadMilliseconds+=performance.now()-began;return resource;}
 #cacheEvent01(value){const event={sequence:++this.cacheAuditSerial01,...value,entries:this.queryViews01.size,accountedBytes:this.queryViewBytes01};this.cacheAuditEvents01.push(event);if(this.cacheAuditEvents01.length>cacheAuditLimits01.events){this.cacheAuditEvents01.shift();this.cacheAuditTotals01.timelineDropped++;}return event;}
 #rememberQuery01(key,value){this.cacheAuditQueries01.delete(key);this.cacheAuditQueries01.set(key,value);while(this.cacheAuditQueries01.size>cacheAuditLimits01.queries)this.cacheAuditQueries01.delete(this.cacheAuditQueries01.keys().next().value);}
 #queryAudit01(resource,key,description,hit=false){
  this.cacheAuditTotals01.lookups++;const previous=this.cacheAuditQueries01.get(key),owner=this.cacheAuditOwners01.get(resource.logicalId01),causes=[];
  if(!hit&&previous?.state==='evicted'){causes.push('previous-entry-evicted');this.cacheAuditTotals01.missAfterEviction++;if(previous.removalEvent)previous.removalEvent.subsequentlyRevisited=true;}
  else if(!hit&&previous?.state==='invalidated'){causes.push('previous-entry-invalidated');this.cacheAuditTotals01.missAfterInvalidation++;}
  else if(!hit&&previous?.state==='inadmissible'){causes.push('previous-entry-inadmissible');this.cacheAuditTotals01.missAfterInadmissibility++;}
  else if(!hit&&!previous){this.cacheAuditTotals01.coldQueries++;if(!owner){causes.push('first-resource-query');this.cacheAuditTotals01.coldResources++;}else if(owner.ownerId!==resource.key){causes.push('resource-identity-changed');this.cacheAuditTotals01.changedOwner++;}else{for(const [field,cause,counter]of [['chunkSetId','selected-chunk-set-changed','changedChunks'],['analyticSetId','analytic-inputs-changed','changedAnalytics'],['unknownSetId','unknown-inputs-changed','changedUnknown'],['limitsId','query-limits-changed','changedLimits']])if(owner[field]!==description[field]){causes.push(cause);this.cacheAuditTotals01[counter]++;}if(!causes.length)causes.push('new-query-not-retained-in-history');}}
  this.cacheAuditOwners01.delete(resource.logicalId01);this.cacheAuditOwners01.set(resource.logicalId01,{ownerId:resource.key,...description});while(this.cacheAuditOwners01.size>cacheAuditLimits01.owners)this.cacheAuditOwners01.delete(this.cacheAuditOwners01.keys().next().value);
  return {previous,causes};
 }
 #dropQueryView01(key,reason='capacity-limit',ownerCascade=false,countEviction=true){const held=this.queryViews01.get(key);if(!held)return;const priorEntries=this.queryViews01.size,priorAccountedBytes=this.queryViewBytes01;this.queryViews01.delete(key);this.queryViewBytes01-=held.bytes;if(countEviction){this.profileTotals01.queryViewEvictions++;if(this.activeProfile01)this.activeProfile01.queryViewEvictions++;}const counter=reason==='byte-limit'?'evictedByteLimit':reason==='entry-count-limit'?'evictedCountLimit':reason==='owner-residency-limit'?'evictedOwnerResidency':reason.includes('invalidated')&&ownerCascade?'invalidatedOwnerBinding':reason==='integrity-failure'?'invalidatedIntegrity':reason==='world-close'?'invalidatedClose':'invalidatedWorldBinding';this.cacheAuditTotals01[counter]++;
  const event=this.#cacheEvent01({action:reason.includes('invalidat')||!countEviction||reason==='integrity-failure'?'invalidate':'evict',reason,queryId:key,ownerId:held.resourceKey,logicalResourceId:held.logicalId01,removedBytes:held.bytes,priorEntries,priorAccountedBytes,ownerCascade,subsequentlyRevisited:false});const previous=this.cacheAuditQueries01.get(key)??held.audit01;this.#rememberQuery01(key,{...previous,state:countEviction&&!reason.includes('invalidat')&&reason!=='integrity-failure'?'evicted':'invalidated',removalReason:reason,removalEvent:event});
 }
 #clearQueryViews01(reason){for(const key of [...this.queryViews01.keys()])this.#dropQueryView01(key,reason,true,false);}
 cacheResidencyTimeline01(){return freeze({schema:1,historyLimit:cacheAuditLimits01.events,queryHistoryLimit:cacheAuditLimits01.queries,ownerHistoryLimit:cacheAuditLimits01.owners,retainedQueryHistory:this.cacheAuditQueries01.size,retainedOwnerHistory:this.cacheAuditOwners01.size,geometryLimits:{...queryViewLimits01,representation:'shared-packed-components-and-boxed-templates',queryDescriptorBytes:512,packedRecordBytes:96,packedBoundsBytes:48,boxedRecordAndTemplateBytes:4096},components:this.staticComponents01.timeline(),adaptivePasses:this.lastAdaptivePasses01??[],totals:{...this.cacheAuditTotals01},events:structuredClone(this.cacheAuditEvents01)});}
 #queryResource01(resource,box,limits){
  const {index}=resource.resource,ids=queryChunkIds(index,box),analyticIds=resource.analyticIndex01?queryChunkIds(resource.analyticIndex01,box):[],unknownInputs=queryUnknownRegions(index,box),key=digest([resource.key,ids,analyticIds,unknownInputs,limits]),held=this.queryViews01.get(key),description={chunkSetId:digest(ids),analyticSetId:digest(analyticIds),unknownSetId:digest(unknownInputs),limitsId:digest(limits),radius:(box.max[0]-box.min[0])/2,selectedChunks:ids.length,nativeTriangleRecords:ids.reduce((n,id)=>n+index.chunks[id].count,0),analyticCandidates:analyticIds.length,unknownInputs:unknownInputs.length},audit=this.#queryAudit01(resource,key,description,!!held);
  let view;try{view=resource.resource.queryPrepared(box,{...limits,nativeBounds:resource.classification.cacheBounds,components:this.staticComponents01,owner:resource.key});}catch(error){if(!/query.*limit/.test(error.message)){this.staticComponents01.clearOwner(resource.key,'current-chunk-integrity-failed');this.resident.delete(resource.key);for(const [viewKey,view]of this.queryViews01)if(view.resourceKey===resource.key)this.#dropQueryView01(viewKey,'integrity-failure');}throw error;}
  // Query entries describe immutable component inputs; geometry is owned once
  // by the packed component cache, never duplicated for 32/16/8m views.
  if(held){this.queryViews01.delete(key);this.queryViews01.set(key,held);this.profileTotals01.queryViewHits++;this.cacheAuditTotals01.hits++;if(this.activeProfile01)this.activeProfile01.queryViewHits++;this.#cacheEvent01({action:'hit',reason:'exact-component-inputs-current-bytes',queryId:key,ownerId:resource.key,logicalResourceId:resource.logicalId01,entryBytes:held.bytes,...description});}
  else{this.profileTotals01.queryViewMisses++;this.cacheAuditTotals01.misses++;if(this.activeProfile01)this.activeProfile01.queryViewMisses++;this.#cacheEvent01({action:'miss',reason:audit.causes[0]??'query-not-resident',causes:audit.causes,previousRemovalReason:audit.previous?.removalReason??null,queryId:key,ownerId:resource.key,logicalResourceId:resource.logicalId01,...description});const shape={...description,triangleRecords:view.triangleRecords,analyticTriangleRecords:view.analytic?.triangles??0,unknownRecords:view.unknownRegions.length,entryBytes:512,representation:'component-descriptor-only'};this.queryViews01.set(key,{resourceKey:resource.key,logicalId01:resource.logicalId01,bytes:512,audit01:shape});this.queryViewBytes01+=512;this.cacheAuditTotals01.admissions++;this.#rememberQuery01(key,{...shape,state:'resident'});this.#cacheEvent01({action:'admit',reason:'geometry-shared-by-source-component',queryId:key,ownerId:resource.key,logicalResourceId:resource.logicalId01,...shape});while(this.queryViews01.size>queryViewLimits01.views)this.#dropQueryView01(this.queryViews01.keys().next().value,'entry-count-limit');}
  return view;
 }
 #startPreparationProfile01(){this.activeProfile01={candidateLookupMs:0,resourceLoadMs:0,resourceQueryMs:0,triangleSelectionMs:0,panelConstructionMs:0,tileValidationIndexMs:0,reflectionSelectionMs:0,acousticSceneMs:0,queryViewHits:0,queryViewMisses:0,queryViewEvictions:0,panelTemplateHits:0,panelTemplateMisses:0,clippedPanels:0,capacityProbePasses:0,materializedPasses:0,consumedPreparedSelection01:0};this.activeAdaptivePasses01=[];return {operations:{...this.operations01},components:this.staticComponents01.profile()};}
 #finishPreparationProfile01(began,before,attempts,activeSurfaces){const components=this.staticComponents01.profile(),profile=freeze({...this.activeProfile01,operations01:Object.fromEntries(Object.entries(this.operations01).map(([key,value])=>[key,value-before.operations[key]])),staticComponents01:components,staticComponentDelta01:Object.fromEntries(Object.entries(components).map(([key,value])=>[key,Math.max(0,value-before.components[key])])),totalMs:performance.now()-began,adaptiveAttempts:attempts,activeSurfaces});this.lastAdaptivePasses01=freeze([...this.activeAdaptivePasses01]);this.activeProfile01=null;return profile;}
 #selectionOptions01(options={}){let {listener,sources=[],radius=32,maximumSurfaces=2048,maximumResources=16,adaptiveRadius=true,surroundingWorkset01=false,interiorActivation01,session,generation}=options;listener=vector(listener);sources=sources.map(vector);requireWorld(sources.length<=6&&Number.isFinite(radius)&&radius>=1&&radius<=32&&Number.isInteger(maximumSurfaces)&&maximumSurfaces>=1&&maximumSurfaces<=4096&&Number.isInteger(maximumResources)&&maximumResources>=1&&maximumResources<=16&&typeof adaptiveRadius==='boolean','bounded installed static selection');const sourceDistance=Math.max(0,...sources.map(p=>Math.hypot(...sub(p,listener)))),minimumRadius=Math.min(radius,Math.max(Math.min(4,radius),sourceDistance));requireWorld(sources.every(p=>p.every((v,i)=>Math.abs(v-listener[i])<=128)),'source outside installed static active scene');const instance=matchInteriorInstance01(this.interiorIdentities01,interiorActivation01,{session,generation,catalogSHA256:this.catalogSHA256,epoch:this.requiredValidationEpochUtc01});
 const anchor=instance&&!options.engine?.higherOrderPaths?.length?interiorWorksetAnchor01(interiorActivation01,listener,sources,radius,surroundingWorkset01):null;
 return {listener,sources,anchor,surrounding:!!anchor&&surroundingWorkset01,radius,maximumSurfaces,maximumResources,adaptiveRadius,requestedRadius:radius,minimumRadius,instance,interiorKey:instance?interiorObservationKey01(interiorActivation01):null};}
 #anchoredSelections01=new Map();
 #anchoredTiles01=new WeakMap();
 #selectAdaptive01(selection,explicitPaths=false,materialize=()=>{}){
  const anchor=selection.anchor;
  let radius=selection.surrounding?Math.min(selection.radius,surroundingInteriorHalfWidth01):selection.radius,attempts=0,selected;
  while(true){
   selected=this.#selectWindow01({...selection,listener:anchor??selection.listener,radius,stableAnchor:anchor!==null,capacityProbe:!selection.surrounding&&selection.adaptiveRadius&&radius>selection.minimumRadius&&!explicitPaths});
   selected.pose=selection.listener;
   selected.interiorWorksetAnchored01=anchor!==null;
   attempts++;materialize(selected);
   if(selection.surrounding||!selection.adaptiveRadius||!selected.capacity||radius<=selection.minimumRadius)break;
   radius=Math.max(selection.minimumRadius,radius/2);
  }
  requireWorld(!anchor||[selection.listener,...selection.sources].every(p=>inBox(p,selected.box)),'interior workset contains observed poses');
  return {selected,attempts,radius};
 }
 #requestBinding01(options,selection){const {session,generation,geometryTimeMs=0,durationMs=1000,engine={}}=options;if(!/^[a-f0-9]{32}$/.test(session)||!Number.isSafeInteger(generation)||generation<=0||!Number.isFinite(geometryTimeMs)||geometryTimeMs<0||!Number.isFinite(durationMs)||durationMs<=0||durationMs>60000)return null;return digest({selection,session,generation,geometryTimeMs,durationMs,engine});}
 discardPreparedSelection01(token){if(this.#pendingSelection01?.token===token){this.#pendingSelection01=null;return true;}return false;}
 prepareStaticWorkset01(options={}){this.#pendingSelection01=null;const began=performance.now(),selection=this.#selectionOptions01(options),before=this.#startPreparationProfile01();const {selected,attempts,radius}=this.#selectAdaptive01(selection);const profile=this.#finishPreparationProfile01(began,before,attempts,selected.surfaces.length),heavyWork=profile.staticComponentDelta01.nativeMisses>0||profile.staticComponentDelta01.analyticMisses>0||profile.staticComponentDelta01.recordMisses>0||profile.panelTemplateMisses>0;this.lastStaticPreparationProfile01=profile;let preparedSelection01=null;const requestBinding=this.#requestBinding01(options,selection),explicitPaths=Array.isArray(options.engine?.higherOrderPaths)&&options.engine.higherOrderPaths.length>0;if(requestBinding&&!explicitPaths){preparedSelection01=Object.freeze({kind:'RichAudioOneRequestSelection01'});this.#pendingSelection01={token:preparedSelection01,requestBinding,revision:this.#selectionRevision01,componentRevision:this.staticComponents01.revision01(),selected,attempts,radius,adaptivePasses:this.lastAdaptivePasses01};const token=preparedSelection01;queueMicrotask(()=>this.discardPreparedSelection01(token));}return {prepared:true,cacheHit:!heavyWork,heavyWork,adaptiveAttempts:attempts,activeRadius:radius,staticTrianglesPrepared:profile.staticComponentDelta01.recordMisses,panelTemplatesPrepared:profile.panelTemplateMisses,qualifiedResources:selected.successfulResources,activeSurfaces:selected.surfaces.length,profile,preparedSelection01};}
 window(options={}){
  const pending=this.#pendingSelection01;this.#pendingSelection01=null;const began=performance.now(),selection=this.#selectionOptions01(options),{session,generation,geometryTimeMs=0,durationMs=1000,engine={}}=options;requireWorld(/^[a-f0-9]{32}$/.test(session)&&Number.isSafeInteger(generation)&&generation>0&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Number.isFinite(durationMs)&&durationMs>0&&durationMs<=60000,'bounded installed static acoustic observation');const before=this.#startPreparationProfile01();let radius=selection.radius,selected,scene,attempts=0;
  // This is a one-shot continuation of the same synchronous original request,
  // never a pose cache or a lease. A microtask discards an unused continuation.
  const explicitPaths=Array.isArray(engine?.higherOrderPaths)&&engine.higherOrderPaths.length>0;
  if(options.preparedSelection01!==undefined&&options.preparedSelection01!==null){requireWorld(pending&&pending.token===options.preparedSelection01&&pending.requestBinding===this.#requestBinding01(options,selection)&&pending.revision===this.#selectionRevision01&&pending.componentRevision===this.staticComponents01.revision01()&&!explicitPaths,'same original request and current source-bound one-shot selection required');({selected,attempts,radius}=pending);this.activeAdaptivePasses01=[...pending.adaptivePasses];this.activeProfile01.consumedPreparedSelection01=1;}
  else ({selected,attempts,radius}=this.#selectAdaptive01(selection,explicitPaths,explicitPaths?s=>{scene=this.#materializeWindow01(s,{session,generation,geometryTimeMs,durationMs,engine});}:undefined));
  if(!explicitPaths)scene=this.#materializeWindow01(selected,{session,generation,geometryTimeMs,durationMs,engine});const metadata=freeze({...scenes.get(scene),requestedRadius:selection.requestedRadius,activeRadius:radius,interiorWorksetAnchored01:selected.interiorWorksetAnchored01,surroundingWorkset01:selected.surrounding===true,surroundingSurfaces01:selected.nearBox?selected.surfaces.filter(p=>!inBox(p.center,selected.nearBox)).length:0,worksetLimited:radius<selection.requestedRadius,adaptiveAttempts:attempts,preparationMilliseconds:performance.now()-began});scenes.set(scene,metadata);this.last=metadata;this.lastWindowProfile01=this.#finishPreparationProfile01(began,before,attempts,scene.tile.surfaces.length);this.profileTotals01.windows++;return scene;
 }
 profile01(){const components=this.staticComponents01.profile();return freeze({...this.profileTotals01,operations01:{...this.operations01},cacheDiagnostics01:{...this.cacheAuditTotals01},staticComponents01:components,residentResources:this.resident.size,queryViews:this.queryViews01.size,queryViewBytes:this.queryViewBytes01,aggregateRetainedGeometryBytes:components.accountedBytes+this.queryViewBytes01,maximumQueryViews:queryViewLimits01.views,maximumQueryViewBytes:queryViewLimits01.bytes,lastWindow:this.lastWindowProfile01});}
 #selectWindow01({listener,sources,radius,requestedRadius,maximumSurfaces,maximumResources,instance,interiorKey,surrounding=false,stableAnchor=false,capacityProbe=false}){
  const began=performance.now(),lookupBegan=performance.now(),box={min:listener.map(v=>v-radius),max:listener.map(v=>v+radius)},region={min:listener.map(v=>v-128),max:listener.map(v=>v+128)};
  const nearBox=surrounding?{min:listener.map(v=>v-4),max:listener.map(v=>v+4)}:null;
  const nearbyRows=windowRows01(this.rows,this.spatialIndex01,box);
  const defaultExcluded=nearbyRows.filter(r=>r.bounds&&[1,2].includes(r.layer)&&touch(r.bounds,box));
  const candidates=nearbyRows.filter(r=>r.bounds&&![1,2].includes(r.layer)&&touch(r.bounds,box));
  const interiors=instance?nearbyRows.flatMap(entry=>entry.interiorPlacements.filter(p=>p.id===instance&&touch(p.bounds,box))
   .map(placement=>({...entry,bounds:placement.bounds,placement}))):[];
  const eligible=[...interiors.filter(({row})=>sceneSource01(row)),...candidates.filter(({row})=>sceneSource01(row))];
  const selected=eligible.slice(0,maximumResources),selectedInteriors=new Map(selected.filter(e=>e.placement).map(e=>[e.row,e.placement.id]));
  const triangles=[],unknown=[],possibleInteriorBounds=[...new Map(nearbyRows.flatMap(r=>r.interiorBounds)
   .map(p=>p.bounds).filter(b=>touch(b,box)).map(b=>[digest(b),b])).values()];
  const unresolvedInteriorBounds=[...new Map(nearbyRows.flatMap(entry=>entry.interiorBounds
   .filter(p=>selectedInteriors.get(entry.row)!==p.id).map(p=>p.bounds))
   .filter(b=>touch(b,box)).map(b=>[digest(b),b])).values()];
  const missingBounds=[...unresolvedInteriorBounds,
   ...interiors.filter(e=>!selected.includes(e)).map(e=>e.bounds),
   ...[...new Map(selected.flatMap(e=>e.placement?.portalBounds??[]).map(b=>[digest(b),b])).values()],
   ...candidates.filter(({row})=>!sceneSource01(row)).map(e=>e.bounds),...eligible.slice(maximumResources).map(e=>e.bounds)];
  const views=[];
  let geometryUnknown=0,successfulResources=0;
  const analytic={available:0,candidates:0,approximated:0,unknown:0,triangles:0,maximumErrorMetres:0,representation:'inscribed-affine-native-primitive-triangle-approximation',physicalMetreCalibration:'unverified-1-native-unit-per-metre-assumption'};
  this.activeProfile01.candidateLookupMs+=performance.now()-lookupBegan;
  for(const {row,placement,bounds}of selected)try{const loadBegan=performance.now(),resource=this.#resource(row,placement);this.activeProfile01.resourceLoadMs+=performance.now()-loadBegan;const queryBegan=performance.now(),view=resource.query(placement?transformInteriorBounds01(box,placement.inverse):box,{maxChunks:16,maxTriangles:131072});this.activeProfile01.resourceQueryMs+=performance.now()-queryBegan;const selectionBegan=performance.now();successfulResources++;if(view.analytic){for(const key of ['available','candidates','approximated','unknown','triangles'])analytic[key]+=view.analytic[key]??0;analytic.maximumErrorMetres=Math.max(analytic.maximumErrorMetres,view.analytic.maximumErrorMetres??0);}geometryUnknown+=view.unknownRegions.length;missingBounds.push(...view.unknownRegions.map(r=>placement?transformInteriorBounds01(r.bounds,placement.matrix):r.bounds));views.push({row,placement,view,bounds});this.activeProfile01.triangleSelectionMs+=performance.now()-selectionBegan;}catch(error){this.failures++;unknown.push(String(error.message).slice(0,160));missingBounds.push(bounds??null);}
  // Query inputs above have been verified for this request, including native
  // chunk bytes. Identical component identities and clip box produce the
  // same selection. Never reuse a failed query or its missing-region result.
  const shapeKey=stableAnchor&&!unknown.length?digest([this.#selectionRevision01,box,requestedRadius,maximumSurfaces,maximumResources,capacityProbe,surrounding,interiorKey,views.map(({row,placement,view})=>[row.Id,placement?.key,view.references.map(r=>[r.componentId,r.recordIndex]),view.unknownRegions,view.analytic])]):null;
  const held=shapeKey&&this.#anchoredSelections01.get(shapeKey);
  if(held){
   this.#anchoredSelections01.delete(shapeKey);this.#anchoredSelections01.set(shapeKey,held);
   this.activeProfile01.reusedAnchoredSelection01=true;
   if(capacityProbe&&held.selection.capacity)this.activeProfile01.capacityProbePasses++;
   this.activeAdaptivePasses01.push({...held.pass,selectionMilliseconds:performance.now()-began});
   return {...held.selection,sources};
  }
  const triangleBegan=performance.now();
  for(const {row,placement,view,bounds} of views)try{for(const reference of view.references){const identity=this.staticComponents01.identity(reference);if(placement){
   const resourceId=row.Id+':'+placement.id,triangle=this.staticComponents01.triangle(reference,resourceId,placement);
   const bounds=triangleShape01(triangle).bounds;
   if(touch(bounds,box))triangles.push({triangle,resource:resourceId,near:nearBox&&touch(bounds,nearBox),
    distance:Math.min(...triangle.positions.map(p=>Math.hypot(...sub(p,listener)))),node:identity.node,polygon:identity.polygon});
  }else triangles.push({reference,resource:row.Id,near:nearBox&&touch(this.staticComponents01.bounds(reference),nearBox),distance:this.staticComponents01.distance(reference,listener),node:identity.node,polygon:identity.polygon});}
  }catch(error){this.failures++;unknown.push(String(error.message).slice(0,160));missingBounds.push(bounds??null);}
  this.activeProfile01.triangleSelectionMs+=performance.now()-triangleBegan;
  const panelBegan=performance.now();triangles.sort((a,b)=>(surrounding?Number(b.near)-Number(a.near):0)||a.distance-b.distance||a.resource.localeCompare(b.resource)||a.node-b.node||a.polygon-b.polygon);const surfaces=[],materials={},keys=new Set();let omitted=0,witness=null;
  for(const {reference,resource,triangle:placed}of triangles){const triangle=placed??this.staticComponents01.triangle(reference,resource),id=triangleId01(resource,triangle),preparedPanel=panel(triangle,box,id,undefined,undefined,this.activeProfile01);if(!preparedPanel)continue;const {surface,key}=preparedPanel;if(keys.has(key))continue;keys.add(key);if(surfaces.length>=maximumSurfaces){omitted++;if(capacityProbe){witness='valid-unique-surface-overflow';break;}missingBounds.push(triangleShape01(triangle).bounds);continue;}surfaces.push(surface);materials[id]={reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'installed01-unmeasured-native-material'};}
  this.activeProfile01.panelConstructionMs+=performance.now()-panelBegan;const capacity=omitted>0||eligible.length>selected.length||unknown.some(s=>/query candidate limit/.test(s));if(capacityProbe&&capacity)this.activeProfile01.capacityProbePasses++;this.activeAdaptivePasses01.push({radius,selectedResources:selected.length,queriedTriangles:triangles.length,supportedSurfaces:surfaces.length,omittedSurfaces:omitted,omittedCountIsLowerBound:!!witness,capacity,witness:witness??(eligible.length>selected.length?'resource-capacity':unknown.some(s=>/query candidate limit/.test(s))?'query-candidate-limit':null),selectionMilliseconds:performance.now()-began});
  const selection={listener,sources,radius,requestedRadius,maximumSurfaces,box,nearBox,region,defaultExcluded,candidates,eligible,selected,interiorKey,possibleInteriorBounds,unresolvedInteriorBounds,missingBounds,geometryUnknown,successfulResources,analytic,unknown,surrounding,surfaces,materials,omitted,trianglesQueried:triangles.length,capacity};
  if(shapeKey&&!unknown.length){
   // A rejected adaptive pass needs only its overflow witness. Keep at most
   // one full selection and the witnesses for the enclosing radii.
   const overflow=capacityProbe&&capacity;
   if(!overflow)for(const [key,value] of this.#anchoredSelections01)if(value.selection.surfaces)this.#anchoredSelections01.delete(key);
   this.#anchoredSelections01.set(shapeKey,{selection:overflow?{capacity}:{...selection},pass:this.activeAdaptivePasses01.at(-1)});
   while(this.#anchoredSelections01.size>4)this.#anchoredSelections01.delete(this.#anchoredSelections01.keys().next().value);
  }
  return selection;
 }
 #materializeWindow01(s,{session,generation,geometryTimeMs,durationMs,engine}){
  const began=performance.now(),{listener,sources,radius,requestedRadius,region,box,candidates,eligible,selected,possibleInteriorBounds,unresolvedInteriorBounds,missingBounds,geometryUnknown,successfulResources,analytic,unknown,omitted,materials,defaultExcluded,interiorKey}=s,worldDigest=this.manifest.InputFingerprint,tileBegan=performance.now(),held=s.interiorWorksetAnchored01?this.#anchoredTiles01.get(s.surfaces):null,tile=held&&held.session===session&&held.version===generation?retimeInstalledStaticTile01(held,geometryTimeMs,geometryTimeMs+durationMs):createTile({schemaVersion:1,id:'installed01:'+worldDigest.slice(0,32),coordinateSpace,timeUnit:'monotonic-ms',bounds:region,listenerAnchor:listener,coverage:'partial',surfaces:s.surfaces.map(surface=>({...surface,observedAt:geometryTimeMs,validUntil:geometryTimeMs+durationMs})),missingRegions:unknownRegions01(missingBounds,box,s.nearBox),version:generation,createdAt:geometryTimeMs,validUntil:geometryTimeMs+durationMs,build:'installed-static-collision01',session,interior:selected.some(e=>e.placement)?'camera-proxy-bound-interior':'static-exterior-runtime-unverified',dynamicEpoch:generation},{maximumSurfaces:s.maximumSurfaces});if(s.interiorWorksetAnchored01&&(!held||held.session!==session||held.version!==generation))this.#anchoredTiles01.set(s.surfaces,tile);const surfaces=tile.surfaces;this.activeProfile01.tileValidationIndexMs+=performance.now()-tileBegan;const reflectionBegan=performance.now(),reflectionSurfaceIds=finiteReflectorIds01(tile,sources,s.pose??listener);this.activeProfile01.reflectionSelectionMs+=performance.now()-reflectionBegan;const sceneBegan=performance.now(),model={kind:'conditional-installed-static-model',mode:'installed-static-model',staticGeometryOnly:true,analyticGeometry:analytic,runtimeActivationVerified:false,installedWorldVerified:false,sourceCatalogueSHA256:this.catalogSHA256,reflectionSurfaceIds,workset:{requestedRadius,activeRadius:radius,worksetLimited:radius<requestedRadius,maximumSurfaces:s.maximumSurfaces,outsideActiveWindow:'unknown-static-coverage',selectionBasis:s.surrounding?'bounded-near-first-with-surroundings; omitted-geometry-stays-unknown':'bounded-adaptive-local-capacity; omitted-geometry-stays-unknown'},collisionLayerSelection:{activeSoftwareModelLayers:[0],excludedSoftwareModelLayers:[1,2],actualGtaActivation:'unverified',basis:'CodeWalker-Space-default-CollisionLayers-true-false-false',source:'CodeWalker-485d56bec00262ed7fa472261cce7bbc6202b96e-Space.cs',nearbyExcludedResources:defaultExcluded.length,globallyUnqualifiedHigherLayerResources:this.globalStatus01.higherLayerResources},calibration:{originNative:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],reference:'installed-static01-explicit-unit-assumption',basis:'declared-demonstration-scale',metresPerNativeUnit:1,physicalCalibration:'unverified',nativeSpace:'gta-native-units-unverified'},visibilityAssumption:'unobserved-space-assumed-clear',motionAssumption:'static-during-snapshot',evidence:selected.map(({row,placement})=>{const result=sceneSource01(row);return {resourceId:row.Id,indexSHA256:result.IndexSHA256,receiptSHA256:result.ReceiptSHA256,nativeCoordinateBasis:placement?'selected-YMAP-interior-transform':'layer-zero-exterior-cache-model-identity',runtimeActivation:'unverified',...(placement?{interiorInstanceId:placement.id,interiorKey}:{})};}),timing:'static-installation-model-not-live-observation'},scene=acousticScene(tile,materials,{...engine,observationModel:model});this.activeProfile01.acousticSceneMs+=performance.now()-sceneBegan;this.activeProfile01.materializedPasses++;
  const currentValidationPending=candidates.filter(r=>r.row.Eligibility==='eligible-exterior'&&r.row.Result&&r.validationState==='awaiting-current-source-validation').length,geometryPending=candidates.filter(r=>r.row.Eligibility==='eligible-exterior'&&!r.row.Result).length,activationWithheld=candidates.filter(r=>r.row.Eligibility!=='eligible-exterior').length+unresolvedInteriorBounds.length,firstBlocker=surfaces.length?null:currentValidationPending?'local-current-validation-pending':geometryPending?'local-cache-unprepared':unknown.length?'local-cache-rejected':activationWithheld||defaultExcluded.length?'placement-or-activation-withheld':omitted||eligible.length>selected.length?'local-workset-capacity':successfulResources?'no-supported-surfaces-in-window':'no-catalogued-exterior-in-window',localReadiness={state:surfaces.length?'usable-conditional-static-scene':'waiting-or-empty',firstBlocker,currentValidationPending,geometryPending,activationWithheld,queryFailures:unknown.length,capacityOmissions:omitted+Math.max(0,eligible.length-selected.length),qualifiedResources:successfulResources,activeSurfaces:surfaces.length,runtimeActivationVerified:false},metadata=freeze({kind:'RichAudioInstalledStaticScene01',worldDigest,session,generation,geometryTimeMs,durationMs,sourceCatalogueSHA256:this.catalogSHA256,localReadiness,candidateResources:candidates.length,possibleInteriorInstanceBounds:possibleInteriorBounds.length,interiorGeometryActivation:selected.some(e=>e.placement)?'camera-proxy-matched-selected-instance; portals-unknown':'unobserved; metadata-bounds-remain-unknown-volumes',softwareModelExcludedHigherLayerResources:defaultExcluded.length,globallyUnqualifiedHigherLayerResources:this.globalStatus01.higherLayerResources,selectedResources:selected.length,successfulResources,unpreparedResources:candidates.length-eligible.length,omittedResources:Math.max(0,eligible.length-selected.length),trianglesQueried:s.trianglesQueried,activeSurfaces:surfaces.length,reflectionCandidates:model.reflectionSurfaceIds.length,missingRegions:tile.missingRegions.length,omissionEnvelopePaddingNativeUnits:.001,omittedSurfaces:omitted,unsupportedPrimitiveRegions:geometryUnknown,analyticGeometry:analytic,failures:unknown,preparationMilliseconds:performance.now()-began,coordinateBasis:'explicit1-native-unit-per-metre; physical-calibration-unverified',materialBasis:'uniform-authored-passive-assumption; native-material-identifiers-retained',coverage:'partial',installedWorldVerified:false,genuineResourceVerified:successfulResources>0,runtimeActivationVerified:false,pcmQueueFramesAdded:0});scenes.set(scene,metadata);return scene;
 }

 close(){this.#pendingSelection01=null;this.#selectionRevision01++;this.#anchoredSelections01.clear();this.#clearQueryViews01('world-close');this.staticComponents01.clear('world-close');this.resident.clear();}
}
export const isInstalledStaticScene01=scene=>scenes.has(scene);
export function installedStaticSceneMetadata01(scene){requireWorld(scenes.has(scene),'branded installed static scene');return scenes.get(scene);}
export function encodeInstalledStaticScene01(scene){
 const metadata=installedStaticSceneMetadata01(scene),body={schema:1,kind:'RichAudioInstalledStaticSceneTransport01',tile:scene.tile,materials:scene.materials,engine:scene.config,model:scene.observationModel,metadata};const packet=Object.freeze({...body,packetDigest:digest(body)});encodedScenes.set(packet,scene);return packet;
}
// This validates a result from the source-bound trusted preparation worker. A
// packet checksum provides transport integrity; it does not grant arbitrary
// caller geometry independent authority or attest live resource activation.
function validateInstalledPacket01(packet,{catalogSHA256,session,generation,geometryTimeMs,durationMs,interiorActivation01}={},verifyIntegrity=true){
 requireWorld(hex(catalogSHA256)&&/^[a-f0-9]{32}$/.test(session)&&Number.isSafeInteger(generation)&&generation>0&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Number.isFinite(durationMs)&&durationMs>0&&durationMs<=60000,'independently retained installed preparation request');
 requireWorld(packet?.schema===1&&packet.kind==='RichAudioInstalledStaticSceneTransport01'&&hex(packet.packetDigest)&&Buffer.byteLength(JSON.stringify(packet))<=16777216,'bounded installed static worker packet');const {packetDigest,...body}=packet;if(verifyIntegrity)requireWorld(digest(body)===packetDigest,'installed static transport integrity');const {tile,metadata,model}=packet;
 requireWorld(metadata?.kind==='RichAudioInstalledStaticScene01'&&metadata.sourceCatalogueSHA256===catalogSHA256&&metadata.session===session&&metadata.generation===generation&&metadata.geometryTimeMs===geometryTimeMs&&metadata.durationMs===durationMs&&metadata.coverage==='partial'&&metadata.installedWorldVerified===false&&metadata.runtimeActivationVerified===false&&metadata.pcmQueueFramesAdded===0&&hex(metadata.worldDigest),'installed static worker result matches request');
 requireWorld(tile?.session===session&&tile.version===generation&&tile.dynamicEpoch===generation&&tile.createdAt===geometryTimeMs&&tile.validUntil===geometryTimeMs+durationMs&&tile.coverage==='partial'&&tile.id==='installed01:'+metadata.worldDigest.slice(0,32)&&Array.isArray(tile.surfaces)&&tile.surfaces.length===metadata.activeSurfaces&&tile.surfaces.length<=4096&&tile.surfaces.every(s=>s.provenance?.kind==='derived'&&['installed-static-collision01','installed-analytic-approximation01'].includes(s.provenance.reference)&&s.id.startsWith('installed01:')),'installed static finite geometry and horizon binding');
 requireWorld(model?.kind==='conditional-installed-static-model'&&model.mode==='installed-static-model'&&model.sourceCatalogueSHA256===catalogSHA256&&model.installedWorldVerified===false&&model.runtimeActivationVerified===false&&model.staticGeometryOnly===true&&model.calibration?.metresPerNativeUnit===1&&model.calibration.physicalCalibration==='unverified'&&model.timing==='static-installation-model-not-live-observation'&&Number.isFinite(model.workset?.requestedRadius)&&model.workset.requestedRadius>=1&&model.workset.requestedRadius<=32&&Number.isFinite(model.workset.activeRadius)&&model.workset.activeRadius>=1&&model.workset.activeRadius<=model.workset.requestedRadius&&model.workset.outsideActiveWindow==='unknown-static-coverage'&&model.collisionLayerSelection?.actualGtaActivation==='unverified'&&JSON.stringify(model.collisionLayerSelection.activeSoftwareModelLayers)==='[0]'&&JSON.stringify(model.collisionLayerSelection.excludedSoftwareModelLayers)==='[1,2]'&&Array.isArray(model.reflectionSurfaceIds)&&model.reflectionSurfaceIds.length<=16&&new Set(model.reflectionSurfaceIds).size===model.reflectionSurfaceIds.length&&model.reflectionSurfaceIds.every(id=>tile.surfaces.some(s=>s.id===id))&&Array.isArray(model.evidence)&&model.evidence.length<=16&&model.evidence.every(e=>hex(e.indexSHA256)&&hex(e.receiptSHA256)&&e.runtimeActivation==='unverified'&&(e.interiorInstanceId===undefined?e.interiorKey===undefined:typeof e.interiorInstanceId==='string'&&hex(e.interiorKey)&&e.interiorKey===interiorObservationKey01(interiorActivation01)))&&Object.values(packet.materials).every(m=>m.basis==='authored-assumption'),'installed model cannot become observation or measured-material authority');
 return {tile,metadata,model};
}
export function decodeInstalledStaticScene01(packet,expected={}){
 const {tile,metadata,model}=validateInstalledPacket01(packet,expected),scene=acousticScene(createTile(tile,{maximumSurfaces:Math.max(128,tile.surfaces.length)}),packet.materials,{...packet.engine,observationModel:model});scenes.set(scene,freeze(structuredClone(metadata)));return scene;
}

// The exact immutable packet emitted by the installed factory retains its full
// finite geometry/material validation and conservative index. An arbitrary or
// cloned packet still takes the complete decoder. The capability never crosses
// a Worker boundary and cannot be minted by a checksum or caller flag.
export function prepareInstalledStaticSceneTransfer01(packet,expected={}){
 const began=performance.now(),retained=encodedScenes.get(packet);let scene;
 if(retained){validateInstalledPacket01(packet,expected,false);scene=retained; }else scene=decodeInstalledStaticScene01(packet,expected);
 const validationMs=performance.now()-began,metadata=installedStaticSceneMetadata01(scene),indexBegan=performance.now(),tileIndex=preparedTileIndexTransfer01(scene.tile),indexTransferPreparationMs=performance.now()-indexBegan,gpuBegan=performance.now(),gpuGeometry=prepareGpuGeometry01(scene.tile),gpuPackingMs=performance.now()-gpuBegan;
 return {schema:1,kind:'RichAudioFullyValidatedInstalledScene01',validation:'full-installed-static-decoder01',packetDigest:packet.packetDigest,scene,metadata,tileIndex,gpuGeometry,profile01:freeze({validationMs,indexTransferPreparationMs,gpuPackingMs,totalMs:performance.now()-began,reusedValidatedFactoryScene:!!retained})};
}
function freezeTransferred01(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){if(Array.isArray(value)){for(let n=0;n<value.length;n++)freezeTransferred01(value[n]);}else{for(const key of Object.keys(value))freezeTransferred01(value[key]);}Object.freeze(value);}return value;}
// Capability = this exact private native Worker channel and message object.
// A JSON flag/checksum or a cloned foreign packet cannot mint this capability.
// This is a trusted-code process boundary, not a sandbox against arbitrary
// malicious JavaScript already executing inside the producer itself.
export function bindInstalledStaticSceneWorker01(worker,{session}={}){
 requireWorld(worker instanceof Worker&&/^[a-f0-9]{32}$/.test(session),'actual owned installed scene Worker required');const received=new WeakSet();let closed=false;
 const receive=message=>{if(message&&typeof message==='object'&&message.type==='scene')received.add(message);};worker.prependListener('message',receive);
 return {adopt(message,{catalogSHA256,generation,geometryTimeMs,durationMs,requestId,bindingEpoch}={}){
  requireWorld(!closed&&received.has(message),'source-bound installed scene Worker capability');received.delete(message);
  requireWorld(hex(catalogSHA256)&&message.session===session&&message.catalogSHA256===catalogSHA256&&Number.isSafeInteger(requestId)&&requestId>0&&message.requestId===requestId&&Number.isSafeInteger(bindingEpoch)&&bindingEpoch>=0&&message.bindingEpoch===bindingEpoch&&Number.isSafeInteger(generation)&&generation>0&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Number.isFinite(durationMs)&&durationMs>0&&durationMs<=1000,'retained installed scene admission request');
  const prepared=message.preparedScene,scene=prepared?.scene,metadata=prepared?.metadata,tile=scene?.tile;
  requireWorld(prepared?.schema===1&&prepared.kind==='RichAudioFullyValidatedInstalledScene01'&&prepared.validation==='full-installed-static-decoder01'&&hex(prepared.packetDigest)&&prepared.packetDigest===message.packetDigest,'complete worker-installed-scene proof');
  requireWorld(metadata?.kind==='RichAudioInstalledStaticScene01'&&metadata.sourceCatalogueSHA256===catalogSHA256&&metadata.session===session&&metadata.generation===generation&&metadata.geometryTimeMs===geometryTimeMs&&metadata.durationMs===durationMs&&metadata.coverage==='partial'&&metadata.installedWorldVerified===false&&metadata.runtimeActivationVerified===false&&metadata.pcmQueueFramesAdded===0&&hex(metadata.worldDigest),'source-bound prepared scene request identity');
  requireWorld(tile?.session===session&&tile.version===generation&&tile.dynamicEpoch===generation&&tile.createdAt===geometryTimeMs&&tile.validUntil===geometryTimeMs+durationMs&&tile.coverage==='partial'&&tile.id==='installed01:'+metadata.worldDigest.slice(0,32)&&Array.isArray(tile.surfaces)&&tile.surfaces.length===metadata.activeSurfaces&&tile.surfaces.length<=4096&&hex(tile.observationKey)&&scene.geometryKey===tile.observationKey&&scene.observationModel?.sourceCatalogueSHA256===catalogSHA256&&scene.observationModel.installedWorldVerified===false&&scene.observationModel.runtimeActivationVerified===false,'source-bound prepared finite scene header');
  freezeTransferred01(scene);freezeTransferred01(prepared.tileIndex);freezeTransferred01(metadata);adoptSourceBoundTileTransfer01(tile,prepared.tileIndex);adoptSourceBoundGpuGeometry01(tile,prepared.gpuGeometry);adoptSourceBoundAcousticScene01(scene);scenes.set(scene,metadata);return scene;
 },close(){closed=true;worker.removeListener('message',receive);}};
}
