// Pure immutable geometry packing, performed by scene preparation rather than
// a PCM callback. Source-bound adoption is called only by the trusted native
// Worker receiver, after its existing scene/tile/context capability checks.
import {isValidatedTileSnapshot01} from '../research/local-geometry.mjs';
const geometries=new WeakMap(),prepared=new WeakSet(),geometryTiles=new WeakMap(),maximumSurfaces=4096;
const check=(ok,why)=>{if(!ok)throw Error(why);};
const requireTile=tile=>check(isValidatedTileSnapshot01(tile),'Validated immutable GPU tile required');
const originFor=tile=>tile.bounds.min.map((v,i)=>(v+tile.bounds.max[i])/2);
function record(tile,origin,bodyBytes,timing){const geometry=Object.freeze({schema:1,kind:'GpuFiniteBounds01',observationKey:tile.observationKey,surfaceCount:tile.surfaces.length,origin:Object.freeze([...origin]),bodyBytes,...timing});prepared.add(geometry);geometryTiles.set(geometry,tile);geometries.set(tile,geometry);return geometry;}
export const preparedGpuGeometry01=tile=>geometries.get(tile)??null;
export const isPreparedGpuGeometry01=geometry=>prepared.has(geometry);
export const preparedGpuSurfaceIdentity01=(geometry,surfaces)=>geometryTiles.get(geometry)?.surfaces===surfaces;
export function prepareGpuGeometry01(tile){
 requireTile(tile);const cached=geometries.get(tile);if(cached)return cached;check(tile.surfaces.length<=maximumSurfaces,'Bounded GPU geometry preparation');const started=performance.now();
 const origin=originFor(tile),bytes=new Uint8Array(tile.surfaces.length*64),view=new DataView(bytes.buffer);let at=0;
 const put=(values,local)=>{for(let i=0;i<3;i++){const value=values[i]-(local?origin[i]:0);check(Number.isFinite(value)&&Math.abs(value)<=512,'GPU geometry local finite bound');view.setFloat32(at,value,true);at+=4;}view.setFloat32(at,0,true);at+=4;};
 for(const s of tile.surfaces){put(s.center,true);put(s.normal,false);put([0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i]))),true);put([0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i]))),true);}
 return record(tile,origin,bytes,{preparationMilliseconds:performance.now()-started,adoptionMilliseconds:0});
}
export function adoptSourceBoundGpuGeometry01(tile,packet){
 requireTile(tile);const expected=originFor(tile),body=packet?.bodyBytes,count=tile.surfaces.length;
 check(Object.isFrozen(tile)&&packet?.schema===1&&packet.kind==='GpuFiniteBounds01'&&packet.observationKey===tile.observationKey&&packet.surfaceCount===count&&count<=maximumSurfaces&&Array.isArray(packet.origin)&&packet.origin.length===3&&packet.origin.every((v,i)=>Number.isFinite(v)&&v===expected[i])&&body instanceof Uint8Array&&body.buffer instanceof ArrayBuffer&&body.byteOffset===0&&body.byteLength===count*64&&body.buffer.byteLength===count*64,'Source-bound prepared GPU geometry header/backing');
 // Own the bytes: a retained worker-message view cannot mutate live GPU data.
 const began=performance.now(),copy=Uint8Array.from(body);return record(tile,expected,copy,{preparationMilliseconds:packet.preparationMilliseconds??null,adoptionMilliseconds:performance.now()-began});
}
