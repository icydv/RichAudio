// Control/background foundation only. This module is never imported by the game
// fiber, audio host or sample callback. Unknown tiles stay explicitly unknown.
import {StaticWorldWarmup} from './scheduler.mjs';
import {effectiveStaticInventory} from './inventory.mjs';
import {validateStaticTile} from './fixture-placements.mjs';
import {createQualifiedStaticScene} from './scene.mjs';
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene,validated} from '../engine/contracts.mjs';
import {freeze,identifier,vector,bounds,digest,requireWorld} from './contracts.mjs';
export const runtimeWorld02Limits=Object.freeze({indexedTiles:262144,cellSide:128,bucketEntries:128,queryCandidates:4096,
 resident:8,nearbyTiles:8,dynamicObjects:32,dynamicRegions:32,maximumDynamicLeaseFrames:12000});
const distance=(point,b)=>Math.hypot(...point.map((n,i)=>Math.max(b.min[i]-n,0,n-b.max[i])));
function matchesIndexedTile(tile,entry,worldDigest){
 validateStaticTile(tile);return tile.worldDigest===worldDigest&&tile.tileId===entry.tileId&&
  ['min','max'].every(side=>tile.bounds[side].every((n,i)=>n===entry.bounds[side][i]));
}
function cellRange(b){return b.min.map((n,i)=>[Math.floor(n/128),Math.ceil(b.max[i]/128)-1]);}
export class SpatialTileIndex02 {
 constructor(entries){requireWorld(Array.isArray(entries)&&entries.length<=runtimeWorld02Limits.indexedTiles,'bounded scalable tile index');this.entries=new Map();this.cells=new Map();
  for(const input of entries){const tileId=identifier(input.tileId),region=bounds(input.bounds);requireWorld(!this.entries.has(tileId),'duplicate indexed tile');const entry=freeze({...input,tileId,bounds:region});this.entries.set(tileId,entry);
   const r=cellRange(region);for(let x=r[0][0];x<=r[0][1];x++)for(let y=r[1][0];y<=r[1][1];y++)for(let z=r[2][0];z<=r[2][1];z++){
    const key=`${x},${y},${z}`;let bucket=this.cells.get(key);if(!bucket)this.cells.set(key,bucket=[]);requireWorld(bucket.length<runtimeWorld02Limits.bucketEntries,'spatial bucket overlap budget');
    requireWorld(!bucket.some(old=>region.min.every((n,i)=>region.max[i]>old.bounds.min[i]&&n<old.bounds.max[i])),'overlapping static tile volumes require explicit layer resolution');bucket.push(entry);}}
 }
 nearby(listener,{sources=[],radius=64,maximum=8}={}){listener=vector(listener);requireWorld(Array.isArray(sources)&&sources.length<=16&&Number.isFinite(radius)&&radius>0&&radius<=128&&Number.isInteger(maximum)&&maximum>0&&maximum<=16,'bounded nearby query');const points=[listener,...sources.map(vector)],candidates=new Map();let cellsVisited=0,referencesVisited=0;
  for(const p of points){const a=p.map(n=>Math.floor((n-radius)/128)),b=p.map(n=>Math.floor((n+radius)/128));for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++)for(let z=a[2];z<=b[2];z++){
   cellsVisited++;for(const entry of this.cells.get(`${x},${y},${z}`)??[]){referencesVisited++;candidates.set(entry.tileId,entry);requireWorld(candidates.size<=runtimeWorld02Limits.queryCandidates&&referencesVisited<=65536,'nearby candidate work budget');}}}
  const ranked=[...candidates.values()].map(entry=>({...entry,priority:Math.min(...points.map(p=>distance(p,entry.bounds))),listenerPriority:distance(listener,entry.bounds)===0?0:1})).filter(e=>e.priority<=radius).sort((a,b)=>a.listenerPriority-b.listenerPriority||a.priority-b.priority||a.tileId.localeCompare(b.tileId));
  return freeze({entries:ranked.slice(0,maximum),eligible:ranked.length,candidates:candidates.size,cellsVisited,referencesVisited,indexed:this.entries.size,unpreparedTilesRemainUnknown:true});
 }
}

export class StaticWorldRuntime02 {
 constructor({input,resources,tiles,store=null,cacheKeys={},session='cccccccccccccccccccccccccccccccc'}){requireWorld(/^[a-f0-9]{32}$/.test(session),'explicit authored runtime session');this.session=session;this.inventory=effectiveStaticInventory(input);this.input=structuredClone(input);this.resources=resources;this.index=new SpatialTileIndex02(tiles);this.store=store;this.cacheKeys={...cacheKeys};this.resident=new Map();this.prepared=null;this.active=null;this.closed=false;this.stats={preparations:0,cachedLoads:0,rejectedCachedSelections:0,workerLoads:0,invalidations:0,sceneGenerations:0,audioBuffersAdded:0};}
 async prepareNearby({listener,sources=[],maximumTiles=4,budgetMs=2000,paused=false,signal}={}){
  requireWorld(!this.closed&&!this.active&&Number.isInteger(maximumTiles)&&maximumTiles>0&&maximumTiles<=runtimeWorld02Limits.nearbyTiles,'one bounded background scene preparation');
  const selection=this.index.nearby(listener,{sources,maximum:maximumTiles});if(paused)return {state:'paused',previousSceneRetained:!!this.prepared,audioBuffersAdded:0};
  if(signal?.aborted)return {state:'cancelled',previousSceneRetained:!!this.prepared,audioBuffersAdded:0};
  const version=this.inventory.fingerprint,loaded=[],missing=[];
  // IO and publication run only on this explicitly async background method.
  let finish;const token={cancelled:false,worker:null,done:new Promise(resolve=>finish=resolve)};this.active=token;
  try{
   for(const entry of selection.entries){const old=this.resident.get(entry.tileId);if(old&&matchesIndexedTile(old,entry,version)){loaded.push(old);continue;}if(old)this.resident.delete(entry.tileId);
    const key=this.cacheKeys[entry.tileId];if(this.store&&key){const result=await this.store.load(key,version);if(result.state==='static-fixture-verified'){
     if(matchesIndexedTile(result.tile,entry,version)){loaded.push(result.tile);this.stats.cachedLoads++;continue;}this.stats.rejectedCachedSelections++;
    }}
    missing.push(entry);
   }
   if(missing.length&&!token.cancelled&&!signal?.aborted){
    token.worker=new StaticWorldWarmup({input:this.input,resources:this.resources,tiles:missing.map(({priority,...entry})=>entry)});
    const result=await token.worker.prepareLocal({listener,sources,maximumTiles:missing.length,budgetMs,signal});
    if(result.state!=='complete')return {state:result.state,reason:result.reason,workerJoined:result.workerJoined,previousSceneRetained:!!this.prepared,audioBuffersAdded:0};
    for(const resultTile of result.tiles){const tile=resultTile.tile,entry=selection.entries.find(e=>e.tileId===tile.tileId);requireWorld(entry&&matchesIndexedTile(tile,entry,version),'worker tile must match selected index identity and bounds');loaded.push(tile);this.stats.workerLoads++;if(this.store&&tile.unknown.length===0){const publication=await this.store.publish(tile);if(publication.published)this.cacheKeys[tile.tileId]=publication.key;}}
   }
   if(token.cancelled||signal?.aborted||this.closed||this.inventory.fingerprint!==version)return {state:'cancelled-or-invalidated',previousSceneRetained:!!this.prepared,audioBuffersAdded:0};
   for(const tile of loaded){validateStaticTile(tile);this.resident.delete(tile.tileId);this.resident.set(tile.tileId,tile);}
   while(this.resident.size>runtimeWorld02Limits.resident)this.resident.delete(this.resident.keys().next().value);
   this.stats.preparations++;
   const unknown=loaded.filter(tile=>tile.unknown.length!==0).map(tile=>tile.tileId),primary=loaded.find(tile=>listener.every((n,i)=>n>=tile.bounds.min[i]&&n<tile.bounds.max[i]));
   if(!primary||primary.unknown.length){this.prepared=null;return {state:'unprepared-or-unknown',unknown,previousSceneRetained:false,audioBuffersAdded:0};}
   // Cache up to eight surrounding tiles, but publish one exact bounded tile.
   // A union rectangle could otherwise fill unprepared gaps between tiles.
   // Cross-tile acoustic coverage awaits an independently qualified union.
   const qualified=[primary],region=primary.bounds;
   const generation=this.stats.sceneGenerations+1;const scene=createQualifiedStaticScene({tiles:qualified,worldDigest:version,generation,session:this.session,listenerAnchor:listener,bounds:region});
   this.stats.sceneGenerations=generation;this.prepared=freeze({scene,generation,worldDigest:version,tileIds:qualified.map(t=>t.tileId),unknown,
    authority:'authored-fixture-only',coverage:'selected-known-static-fixture-tiles',wholeInstalledWorldVerified:false,audioBuffersAdded:0});
   return {state:'prepared',prepared:this.prepared,previousSceneRetained:false,workerJoined:true,audioBuffersAdded:0};
  }finally{try{if(token.worker)await token.worker.cancel();}finally{if(this.active===token)this.active=null;finish();}}
 }
 current(){return this.prepared;}
 async invalidate({input,resources,tiles}){requireWorld(!this.closed,'open world runtime');this.prepared=null;this.resident.clear();if(this.active){const token=this.active;token.cancelled=true;await token.worker?.cancel();await token.done;}this.inventory=effectiveStaticInventory(input);this.input=structuredClone(input);this.resources=resources;this.index=new SpatialTileIndex02(tiles);this.cacheKeys={};this.stats.invalidations++;}
 async close(){this.closed=true;this.prepared=null;this.resident.clear();if(this.active){const token=this.active;token.cancelled=true;await token.worker?.cancel();await token.done;}}
}

// Dynamic state is a separate finite observation overlay. Expiry cannot restore
// a closed door or intact wall by assumption: its affected region stays unknown.
const snapshots=new WeakSet(),composedScenes=new WeakMap();
export class DynamicWorldOverlay02 {
 constructor({session,worldDigest,staticGeneration}){requireWorld(/^[a-f0-9]{32}$/.test(session)&&/^[a-f0-9]{64}$/.test(worldDigest)&&Number.isSafeInteger(staticGeneration)&&staticGeneration>0,'dynamic overlay world identity');this.session=session;this.worldDigest=worldDigest;this.staticGeneration=staticGeneration;this.objects=new Map();this.sequence=-1;this.version=0;this.lastFrame=-1;}
 accept(input,nowFrame){
  requireWorld(input?.authority==='original-authored-dynamic-fixture'&&input.session===this.session&&input.worldDigest===this.worldDigest&&input.staticGeneration===this.staticGeneration&&
   Number.isSafeInteger(input.sequence)&&input.sequence>this.sequence&&Number.isSafeInteger(nowFrame)&&nowFrame>=this.lastFrame&&nowFrame>=0,'dynamic identity/order/authority/clock');
  const id=identifier(input.objectId),old=this.objects.get(id);requireWorld(Number.isSafeInteger(input.objectGeneration)&&input.objectGeneration>0&&(!old||input.objectGeneration>=old.objectGeneration),'dynamic object generation');
  requireWorld(['closed-static','open','destroyed','moving-or-unknown'].includes(input.state)&&Number.isSafeInteger(input.observedFrame)&&input.observedFrame>=0&&
   input.observedFrame<=nowFrame&&(!old||input.observedFrame>=old.observedFrame)&&Number.isSafeInteger(input.validThroughFrame)&&input.validThroughFrame>nowFrame&&input.validThroughFrame-input.observedFrame<=12000,'dynamic finite observation lease');
  const region=bounds(input.region);requireWorld(Array.isArray(input.removes)&&input.removes.length<=16&&new Set(input.removes).size===input.removes.length,'bounded explicit static removals');input.removes.forEach(identifier);
  requireWorld(Array.isArray(input.panels)&&input.panels.length<=8&&(input.state==='closed-static'||input.panels.length===0),'moving or absent geometry cannot invent a static panel');
  if(input.panels.length){requireWorld(input.panels.every(p=>p.provenance?.kind==='synthetic'&&p.motion==='static'),'authored stationary overlay geometry');createTile({schemaVersion:1,id:'dynamic-panel-validation',coordinateSpace,timeUnit:'monotonic-ms',bounds:region,
   listenerAnchor:region.min.map((n,i)=>(n+region.max[i])/2),coverage:'complete-synthetic',surfaces:input.panels.map(p=>({...p,coordinateSpace,observedAt:input.observedFrame/48,validUntil:input.validThroughFrame/48,version:input.objectGeneration})),
   missingRegions:[],version:input.objectGeneration,createdAt:input.observedFrame/48,validUntil:input.validThroughFrame/48,build:'original-world02-dynamic',session:this.session,interior:'authored',dynamicEpoch:this.version+1});}
  requireWorld(this.objects.size<runtimeWorld02Limits.dynamicObjects||this.objects.has(id),'bounded dynamic overlay');
  const value=freeze({...structuredClone(input),objectId:id,region});this.objects.set(id,value);this.sequence=input.sequence;this.lastFrame=nowFrame;this.version++;return {accepted:true,version:this.version};
 }
 snapshot(nowFrame){requireWorld(Number.isSafeInteger(nowFrame)&&nowFrame>=0&&nowFrame>=this.lastFrame,'monotonic dynamic snapshot clock');this.lastFrame=nowFrame;const objects=[];for(const object of this.objects.values())objects.push({...object,qualification:nowFrame>=object.validThroughFrame||object.state==='moving-or-unknown'?'unknown':'authored-static-state'});const snapshot=freeze({session:this.session,worldDigest:this.worldDigest,staticGeneration:this.staticGeneration,version:this.version,atFrame:nowFrame,objects,
  observationAuthority:'original-authored-dynamic-fixture',movingReflectionModelImplemented:false,worldStaticCacheModified:false});snapshots.add(snapshot);return snapshot;}
 invalidateWorld(worldDigest,generation){requireWorld(/^[a-f0-9]{64}$/.test(worldDigest)&&Number.isSafeInteger(generation)&&generation>this.staticGeneration,'new dynamic base world generation');this.worldDigest=worldDigest;this.staticGeneration=generation;this.objects.clear();this.sequence=-1;this.version++;}
}

// Scene composition is a control-worker operation. It prepares one immutable
// existing-engine scene; sample rendering reads no overlay map or cache files.
export function composeDynamicWorldScene02(prepared,snapshot,nowFrame){
 const base=prepared?.scene;requireWorld(validated.scene(base)&&base.tile&&base.tile.surfaces.every(s=>s.provenance.kind==='synthetic')&&snapshots.has(snapshot)&&
  snapshot.session===base.tile.session&&snapshot.worldDigest===prepared.worldDigest&&snapshot.staticGeneration===prepared.generation&&
  Number.isSafeInteger(nowFrame)&&nowFrame>=snapshot.atFrame&&nowFrame-snapshot.atFrame<=512,'exact bounded authored dynamic/base scene');
 const baseIds=new Set(base.tile.surfaces.map(s=>s.id)),removes=new Set(),additions=[],unknown=[],materials={...base.materials};let validUntil=Math.min(base.tile.validUntil,nowFrame/48+250);
 for(const object of snapshot.objects){for(const id of object.removes){requireWorld(baseIds.has(id),'dynamic removal must bind an actual base surface');removes.add(id);}
  const fresh=nowFrame<object.validThroughFrame&&object.state!=='moving-or-unknown';
  if(!fresh)unknown.push({id:'dynamic-unknown:'+object.objectId,bounds:object.region,reason:'dynamic-state-expired-or-moving'});
  else{validUntil=Math.min(validUntil,object.validThroughFrame/48);if(object.state==='closed-static')for(const panel of object.panels){
   const id='dynamic:'+object.objectId+':'+identifier(panel.id);requireWorld(panel.provenance?.kind==='synthetic'&&panel.motion==='static'&&object.materials?.[panel.id]?.basis==='authored-assumption','explicit authored stationary dynamic panel/material');
   additions.push({...panel,id,coordinateSpace,observedAt:object.observedFrame/48,validUntil:object.validThroughFrame/48,version:object.objectGeneration});materials[id]=object.materials[panel.id];
  }}
 }
 requireWorld(unknown.length<=runtimeWorld02Limits.dynamicRegions&&validUntil>nowFrame/48,'bounded dynamic uncertainty horizon');
 const surfaces=[...base.tile.surfaces.filter(s=>!removes.has(s.id)),...additions];
 const tile=createTile({...base.tile,id:'world02-overlay:'+digest([base.geometryKey,snapshot.version,snapshot.atFrame]).slice(0,24),surfaces,
  missingRegions:[...base.tile.missingRegions,...unknown],coverage:unknown.length||base.tile.coverage==='partial'?'partial':'complete-synthetic',
  version:base.tile.version+snapshot.version,createdAt:nowFrame/48,validUntil,dynamicEpoch:snapshot.version});
 const scene=acousticScene(tile,materials,{order:base.config.order,airDbPerMetre:base.config.airDbPerMetre});
 composedScenes.set(scene,freeze({worldDigest:prepared.worldDigest,staticGeneration:prepared.generation,dynamicVersion:snapshot.version,unknownObjects:unknown.length,
  sourceAgnostic:true,staticCacheModified:false,authority:'original-authored-dynamic-fixture',movingReflectorsSupported:false}));return scene;
}
export function dynamicSceneMetadata02(scene){requireWorld(composedScenes.has(scene),'branded composed dynamic scene');return composedScenes.get(scene);}
