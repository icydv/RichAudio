// Sparse metadata index over EXISTING catalogue bounds. This schedules cache
// reads; it supplies no triangles, visibility, acoustic paths or authority.
import {isStartupCatalogue06,boundedStartupMetadata06} from './startup-catalogue06.mjs';
import {isStartupCoordinator06} from './startup-coordinator06.mjs';
import {byteDigest,freeze,requireWorld,vector,bounds} from './contracts.mjs';
const indices=new WeakMap(),byCatalogue=new WeakMap(),cellSize=128,maximumBytes=8388608;
export function createStartupSpatialIndex06(catalogue){
 requireWorld(isStartupCatalogue06(catalogue),'qualified startup catalogue for spatial metadata');if(byCatalogue.has(catalogue))return byCatalogue.get(catalogue);
 const entries=catalogue.pages.flatMap(p=>p.tiles.map(t=>({pageId:p.pageId,tileId:t.tileId,planDigest:t.planDigest,bounds:t.bounds}))),cells=new Map();
 entries.forEach((entry,index)=>{const b=entry.bounds;for(let x=Math.floor(b.min[0]/cellSize);x<=Math.floor(b.max[0]/cellSize);x++)for(let y=Math.floor(b.min[1]/cellSize);y<=Math.floor(b.max[1]/cellSize);y++)for(let z=Math.floor(b.min[2]/cellSize);z<=Math.floor(b.max[2]/cellSize);z++){const key=x+','+y+','+z,items=cells.get(key)??[];items.push(index);cells.set(key,items);}});
 const ordered=[...cells].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0),cellPages=[];for(let n=0;n<ordered.length;n+=512)cellPages.push(ordered.slice(n,n+512));
 const body={schema:1,kind:'RichAudioStartupSpatialIndex06',catalogueDigest:catalogue.catalogueDigest,cellSize,entries,cellPages},bytes=boundedStartupMetadata06(body,maximumBytes);
 const result=freeze({kind:body.kind,schema:1,catalogueDigest:catalogue.catalogueDigest,indexDigest:byteDigest(bytes),tileCount:entries.length,cellCount:cells.size,bytes:bytes.length,metadataOnly:true});indices.set(result,{entries,cells,bytes});byCatalogue.set(catalogue,result);return result;
}
export function encodeStartupSpatialIndex06(index){const data=indices.get(index);requireWorld(data,'branded startup spatial index');return Buffer.from(data.bytes);}
export function restoreStartupSpatialIndex06(bytes,catalogue){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maximumBytes,'bounded supplied spatial index bytes');const index=createStartupSpatialIndex06(catalogue),expected=indices.get(index).bytes;
 // Exact derivation from the independently qualified CURRENT catalogue binds
 // this metadata. A checksum from the index itself never authenticates it.
 requireWorld(bytes.length===expected.length&&byteDigest(bytes)===index.indexDigest&&bytes.equals(expected),'spatial index exact catalogue derivation/version');return index;
}
function distanceToBox(p,b){return Math.hypot(...p.map((v,i)=>Math.max(b.min[i]-v,0,v-b.max[i])));}
function corridorTouchesBox(a,b,box,radius){let lo=0,hi=1;for(let i=0;i<3;i++){const min=box.min[i]-radius,max=box.max[i]+radius,d=b[i]-a[i];if(d===0){if(a[i]<min||a[i]>max)return false;continue;}let x=(min-a[i])/d,y=(max-a[i])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}return true;}
export function startupCorridorIntersects06({from,to,region,radius=0}={}){requireWorld(Number.isFinite(radius)&&radius>=0&&radius<=256,'bounded metadata corridor radius');return corridorTouchesBox(vector(from),vector(to),bounds(region),radius);}
export function selectPreparedStartupTiles06(coordinator,{index=createStartupSpatialIndex06(coordinator?.catalogue),listener,sources=[],radius=64,maximumTiles=8}={}){
 requireWorld(isStartupCoordinator06(coordinator)&&indices.has(index)&&index.catalogueDigest===coordinator.catalogue.catalogueDigest,'same branded catalogue/coordinator spatial index');listener=vector(listener);
 requireWorld(Array.isArray(sources)&&sources.length<=2&&Reflect.ownKeys(sources).length===sources.length+1&&Number.isFinite(radius)&&radius>=0&&radius<=256&&Number.isInteger(maximumTiles)&&maximumTiles>=1&&maximumTiles<=8,'bounded startup runtime window');sources=sources.map(vector);requireWorld(sources.every(p=>Math.hypot(...p.map((v,i)=>v-listener[i]))<=2048),'bounded metadata sound-corridor length; engine propagation limits are unchanged');
 const data=indices.get(index),visitedCells=new Set(),candidates=new Set();let capacity=false;
 const at=(point,padding=radius)=>{for(let x=Math.floor((point[0]-padding)/cellSize);x<=Math.floor((point[0]+padding)/cellSize);x++)for(let y=Math.floor((point[1]-padding)/cellSize);y<=Math.floor((point[1]+padding)/cellSize);y++)for(let z=Math.floor((point[2]-padding)/cellSize);z<=Math.floor((point[2]+padding)/cellSize);z++){const key=x+','+y+','+z;if(visitedCells.has(key))continue;visitedCells.add(key);if(visitedCells.size>32768){capacity=true;return;}for(const entry of data.cells.get(key)??[]){candidates.add(entry);if(candidates.size>4096){capacity=true;return;}}}};
 // Sampling only unexpanded cells can miss a short diagonal cell crossing.
 // Every segment point lies within64m of a sample; broaden candidate cells by
 // that conservative amount, then apply the exact expanded-AABB slab filter.
 at(listener);for(const source of sources){const steps=Math.max(1,Math.ceil(Math.hypot(...source.map((v,i)=>v-listener[i]))/64));for(let n=0;n<=steps&&!capacity;n++)at(source.map((v,i)=>v+(listener[i]-v)*n/steps),radius+64);}
 if(capacity)return freeze({state:'query-capacity-exceeded',selected:[],unknown:true,geometryAuthority:false,visitedCellCount:visitedCells.size,candidateCount:candidates.size});
 const relevant=[...candidates].map(n=>data.entries[n]).filter(e=>distanceToBox(listener,e.bounds)<=radius||sources.some(s=>corridorTouchesBox(listener,s,e.bounds,radius))).map(e=>({...e,distanceToListenerBounds:distanceToBox(listener,e.bounds),row:coordinator.tileStatus06({pageId:e.pageId,tileId:e.tileId})}));
 relevant.sort((a,b)=>a.distanceToListenerBounds-b.distanceToListenerBounds||(a.tileId<b.tileId?-1:a.tileId>b.tileId?1:0));const ready=relevant.filter(e=>['prepared','cached'].includes(e.row.status)),selected=ready.slice(0,maximumTiles).map(({row,...entry})=>({...entry,cacheStatus:row.status,geometryCoverage:row.geometryCoverage??'unverified',geometryUnknownCount:row.geometryUnknownCount??null}));
 return freeze({state:'metadata-window-selected',catalogueDigest:index.catalogueDigest,indexDigest:index.indexDigest,selected,visitedCellCount:visitedCells.size,candidateCount:candidates.size,relevantCount:relevant.length,unpreparedRelevantTiles:relevant.length-ready.length,omittedPreparedTiles:Math.max(0,ready.length-selected.length),unknownOutsideSelected:true,geometryAuthority:false,conversionWorkersStarted:0,planningBasis:'catalogue-AABB-and-expanded-segment-only; solver still required'});
}
