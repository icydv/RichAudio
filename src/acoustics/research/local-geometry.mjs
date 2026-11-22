// Original offline research. No game API, extraction, DSP or audio output.
import {createHash} from 'node:crypto';
export const coordinateSpace='research-rh-z-up-metres-v1';
export const timeUnit='monotonic-ms';
export const limits=Object.freeze({surfaces:128,missingRegions:32,openings:8,tileSide:256,coordinate:100000,epsilon:1e-8});
const E=limits.epsilon;
const validatedTiles=new WeakSet();
// Only objects recursively frozen here may bypass a later traversal. A caller's
// shallow Object.freeze, accessor or changing Proxy value is not such proof.
const deeplyFrozenValues01=new WeakSet();
// Read-only traversal proof, not a geometry constructor or transfer authority.
// A cloned/adopted/shallow-frozen tile does not own this local proof.
export const isDeeplyFrozenTileSnapshot01=tile=>validatedTiles.has(tile)&&deeplyFrozenValues01.has(tile);
// Product worksets opt into more finite supports while research fixtures keep
// their original limit. The index is derived, private state of the same tile;
// it is not another cache or a source of geometry/coverage authority.
export const maximumIndexedSurfaces=16384;
export const maximumInstalledUnknownRegions01=256;
const surfaceIndicesByTile=new WeakMap();
const unknownIndicesByTile=new WeakMap();
// Source-bound worker transfer only. Ordinary supplied geometry must continue
// through createTile; these helpers preserve a worker-validated exact snapshot
// and its already-derived conservative index across structured clone.
export const isValidatedTileSnapshot01=tile=>validatedTiles.has(tile);
export function preparedTileIndexTransfer01(tile){requireTile(tile);return {schema:1,kind:'RichAudioPreparedFiniteTileIndex01',observationKey:tile.observationKey,surfaceCount:tile.surfaces.length,index:surfaceIndicesByTile.get(tile)??null,unknownIndex:unknownIndicesByTile.get(tile)??null};}
export function adoptSourceBoundTileTransfer01(tile,prepared){
 if(!Object.isFrozen(tile)||prepared?.schema!==1||prepared.kind!=='RichAudioPreparedFiniteTileIndex01'||prepared.observationKey!==tile.observationKey||prepared.surfaceCount!==tile.surfaces.length||!Array.isArray(tile.surfaces)||tile.surfaces.length>maximumIndexedSurfaces||((tile.surfaces.length>limits.surfaces)!==(prepared.index!==null)))throw Error('source-bound finite tile/index transfer header');
 if(prepared.index!==null){if(!Object.isFrozen(prepared.index)||!Array.isArray(prepared.index.min)||prepared.index.min.length!==3||!Array.isArray(prepared.index.max)||prepared.index.max.length!==3)throw Error('source-bound prepared conservative index');surfaceIndicesByTile.set(tile,prepared.index);}
 const unknownIndex=prepared.unknownIndex??null;
 if(!Array.isArray(tile.missingRegions)||tile.missingRegions.length>maximumInstalledUnknownRegions01||
    (tile.missingRegions.length>limits.missingRegions)!==(unknownIndex!==null)||
    unknownIndex&&!Object.isFrozen(unknownIndex))throw Error('source-bound prepared uncertainty index');
 if(unknownIndex)unknownIndicesByTile.set(tile,unknownIndex);
 validatedTiles.add(tile);return tile;
}
function requireTile(tile){if(!validatedTiles.has(tile))throw Error('validated immutable tile snapshot required');}
export function vector(v){if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>limits.coordinate))throw Error('invalid finite metre vector');return [...v];}
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const scale=(v,s)=>v.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=v=>Math.hypot(...v);
export function unit(v){
 const a=vector(v),n=Math.hypot(a[0],a[1],a[2]);
 if(n<E)throw Error('degenerate direction');
 const inv=1/n;
 a[0]*=inv;a[1]*=inv;a[2]*=inv;
 return a;
}
export function toSteamAudio(v){const [x,y,z]=vector(v);return [x,z,-y];}
const finite=(n,label)=>{if(!Number.isFinite(n)||n<0)throw Error('invalid '+label);return n;};
const identifier=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(s))throw Error('invalid research identifier');return s;};
function confidence(n){if(!Number.isFinite(n)||n<0||n>1)throw Error('invalid confidence');return n;}
function box(b){if(!b)throw Error('missing bounds');const min=vector(b.min),max=vector(b.max);if(min.some((v,i)=>max[i]<=v||max[i]-v>limits.tileSide))throw Error('invalid bounded region');return {min,max};}
export const inBox=(p,b)=>p.every((x,i)=>x>=b.min[i]-E&&x<=b.max[i]+E);
function freeze(x){
  if(x&&typeof x==='object'&&!deeplyFrozenValues01.has(x)){
    let stable=true;const keys=Object.keys(x),values=[];
    for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(x,key),value=x[key];values.push(value);freeze(value);if(!descriptor||!('value'in descriptor)||descriptor.value!==value||value&&typeof value==='object'&&!deeplyFrozenValues01.has(value))stable=false;}
    Object.freeze(x);const finalKeys=Object.keys(x);
    if(stable&&finalKeys.length===keys.length&&keys.every((key,i)=>{const d=Object.getOwnPropertyDescriptor(x,key);return finalKeys[i]===key&&d&&('value'in d)&&d.value===values[i]&&!(d.value&&typeof d.value==='object'&&!deeplyFrozenValues01.has(d.value));}))deeplyFrozenValues01.add(x);
  }
  return x;
}
function surface(s,bounds){
  if(!s||s.coordinateSpace!==coordinateSpace)throw Error('explicit surface coordinate space required');
  const center=vector(s.center),normal=vector(s.normal),u=vector(s.u);
  if(Math.abs(length(normal)-1)>E||Math.abs(length(u)-1)>E||Math.abs(dot(normal,u))>E)throw Error('unit perpendicular normal and tangent required');
  if(!Array.isArray(s.half)||s.half.length!==2||s.half.some(x=>!Number.isFinite(x)||x<=E||x>128))throw Error('invalid finite surface extent');
  const v=cross(normal,u),half=[...s.half],corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b])=>add(center,add(scale(u,a*half[0]),scale(v,b*half[1]))));
  if(corners.some(p=>!inBox(p,bounds)))throw Error('surface outside tile');
  if(!['static','dynamic','unknown'].includes(s.motion)||!['front','both'].includes(s.reflectiveSide))throw Error('explicit motion and reflective side required');
  if(!s.provenance||!['synthetic','observation','derived'].includes(s.provenance.kind))throw Error('geometry provenance required');
  const observedAt=finite(s.observedAt,'observation time'),validUntil=finite(s.validUntil,'expiry');if(validUntil<=observedAt||!Number.isSafeInteger(s.version)||s.version<1)throw Error('invalid surface lifetime/version');
  const material=s.material??{observedId:null,observedConfidence:null,acoustic:null};
  if(material.observedId!==null&&(!['string','number'].includes(typeof material.observedId)||typeof material.observedId==='number'&&!Number.isFinite(material.observedId)||String(material.observedId).length>80))throw Error('invalid observed material identifier');
  if(material.observedId!==null)confidence(material.observedConfidence);else if(material.observedConfidence!==null)throw Error('unknown material confidence must be null');
  if(material.acoustic){const a=material.acoustic;confidence(a.energyReflection);confidence(a.confidence);if(!['synthetic-assumption','authored-assumption'].includes(a.kind)||typeof a.reason!=='string'||!a.reason||a.reason.length>200)throw Error('explicit acoustic assumption required');}
  const openings=s.openings??[];if(!Array.isArray(openings)||openings.length>limits.openings)throw Error('opening limit');
  const holes=openings.map(h=>{if(!Array.isArray(h.min)||!Array.isArray(h.max)||h.min.length!==2||h.max.length!==2||h.min.some((x,i)=>!Number.isFinite(x)||!Number.isFinite(h.max[i])||h.max[i]<=x||x< -half[i]||h.max[i]>half[i]))throw Error('invalid opening');return {min:[...h.min],max:[...h.max]};});
  // Optional convex support preserves an observed footprint instead of expanding
  // its bounding rectangle into an invented reflector. Existing rectangles are unchanged.
  let footprint;
  if(s.footprint!==undefined){
    if(!Array.isArray(s.footprint)||s.footprint.length<3||s.footprint.length>16)throw Error('bounded convex footprint required');
    footprint=s.footprint.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some((x,i)=>!Number.isFinite(x)||Math.abs(x)>half[i]+E))throw Error('footprint outside finite extent');return [...p];});
    for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<=E||footprint.some(p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])< -E))throw Error('convex counterclockwise footprint required');}
    if(footprint.reduce((n,a,i)=>{const b=footprint[(i+1)%footprint.length];return n+a[0]*b[1]-a[1]*b[0];},0)<=E)throw Error('degenerate footprint');
  }
  const materialValue={observedId:material.observedId,observedConfidence:material.observedConfidence,acoustic:material.acoustic?{energyReflection:material.acoustic.energyReflection,confidence:material.acoustic.confidence,kind:material.acoustic.kind,reason:material.acoustic.reason}:null};
  return {id:identifier(s.id),coordinateSpace,center,normal,u,v,half,corners,...(footprint?{footprint}:{}),motion:s.motion,reflectiveSide:s.reflectiveSide,provenance:{kind:s.provenance.kind,reference:identifier(s.provenance.reference)},confidence:s.confidence===null?null:confidence(s.confidence),material:materialValue,version:s.version,observedAt,validUntil,openings:holes};
}
export function createTile(input,{maximumSurfaces=limits.surfaces,maximumMissingRegions=limits.missingRegions}={}){
  if(!Number.isInteger(maximumSurfaces)||maximumSurfaces<1||maximumSurfaces>maximumIndexedSurfaces)throw Error('bounded finite workset limit');
  if(!Number.isInteger(maximumMissingRegions)||maximumMissingRegions<1||maximumMissingRegions>maximumInstalledUnknownRegions01)throw Error('bounded unknown region workset limit');
  if(!input||input.schemaVersion!==1||input.coordinateSpace!==coordinateSpace||input.timeUnit!==timeUnit||!['complete-synthetic','partial'].includes(input.coverage))throw Error('unsupported tile schema, coordinates, time units or coverage');
  const bounds=box(input.bounds),anchor=vector(input.listenerAnchor);if(!inBox(anchor,bounds))throw Error('listener anchor outside tile');
  if(!Array.isArray(input.surfaces)||input.surfaces.length>maximumSurfaces)throw Error('surface limit');
  const surfaces=input.surfaces.map(s=>surface(s,bounds)).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(new Set(surfaces.map(s=>s.id)).size!==surfaces.length)throw Error('duplicate surface observation');
  const geometricKeys=new Set();for(const s of surfaces){const support=s.footprint?s.footprint.map(([x,y])=>add(s.center,add(scale(s.u,x),scale(s.v,y)))):s.corners;const k=JSON.stringify(support.map(p=>p.join(',')).sort());if(geometricKeys.has(k))throw Error('duplicate coincident surface');geometricKeys.add(k);}
  const missing=input.missingRegions??[];if(!Array.isArray(missing)||missing.length>maximumMissingRegions)throw Error('missing region limit');
  const missingRegions=missing.map(m=>{const b=box(m.bounds);if(!inBox(b.min,bounds)||!inBox(b.max,bounds))throw Error('unknown region outside tile');return {id:identifier(m.id),bounds:b,reason:identifier(m.reason)};}).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(new Set(missingRegions.map(m=>m.id)).size!==missingRegions.length)throw Error('duplicate unknown region');
  const createdAt=finite(input.createdAt,'creation time'),validUntil=finite(input.validUntil,'tile expiry');if(validUntil<=createdAt||!Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.dynamicEpoch)||input.dynamicEpoch<0)throw Error('invalid tile lifetime/version');
  if(surfaces.some(s=>s.observedAt>createdAt||s.validUntil>validUntil))throw Error('surface lifetime outside tile snapshot');
  if(input.coverage==='complete-synthetic'&&surfaces.some(s=>s.provenance.kind!=='synthetic'))throw Error('observations cannot declare complete world coverage');
  const tile={schemaVersion:1,id:identifier(input.id),coordinateSpace,timeUnit,bounds,listenerAnchor:anchor,coverage:input.coverage,surfaces,missingRegions,version:input.version,createdAt,validUntil,build:identifier(input.build),session:identifier(input.session),interior:identifier(input.interior),dynamicEpoch:input.dynamicEpoch};
  tile.observationKey=createHash('sha256').update(JSON.stringify(tile)).digest('hex');validatedTiles.add(tile);
  if(surfaces.length>limits.surfaces)surfaceIndicesByTile.set(tile,buildSurfaceIndex(surfaces));
  if(missingRegions.length>limits.missingRegions)unknownIndicesByTile.set(tile,buildBoundsIndex(missingRegions.map((r,index)=>({index,...r.bounds}))));
  return freeze(tile);
}
// Reuse the checked supports and conservative index of a locally validated
// installed tile. The caller supplies the current request's own finite lease.
export function retimeInstalledStaticTile01(tile,createdAt,validUntil){
  requireTile(tile);
  if(!isDeeplyFrozenTileSnapshot01(tile)||tile.build!=='installed-static-collision01'||
     tile.coverage!=='partial'||!(finite(validUntil,'tile expiry')>finite(createdAt,'creation time'))||
     tile.surfaces.some(s=>s.motion!=='static'||s.provenance.kind!=='derived'||s.observedAt!==tile.createdAt||s.validUntil!==tile.validUntil))
    throw Error('validated fixed installed supports and a finite request horizon required');
  const surfaces=tile.surfaces.map(s=>{
    const result=Object.freeze({...s,observedAt:createdAt,validUntil});
    deeplyFrozenValues01.add(result);
    return result;
  });
  Object.freeze(surfaces);deeplyFrozenValues01.add(surfaces);
  const {observationKey,...header}=tile;
  const result={...header,surfaces,createdAt,validUntil};
  result.observationKey=createHash('sha256').update(JSON.stringify(result)).digest('hex');
  validatedTiles.add(result);
  const index=surfaceIndicesByTile.get(tile);
  if(index)surfaceIndicesByTile.set(result,index);
  const unknownIndex=unknownIndicesByTile.get(tile);
  if(unknownIndex)unknownIndicesByTile.set(result,unknownIndex);
  Object.freeze(result);deeplyFrozenValues01.add(result);
  return result;
}
export function cacheStatus(tile,c){
  requireTile(tile);if(!c)throw Error('cache context required');const reasons=[],now=finite(c.now,'query time'),listener=vector(c.listener),movement=finite(c.maxListenerMove,'reuse distance');
  for(const key of ['id','observationKey','coordinateSpace','timeUnit','build','session','interior','version','dynamicEpoch'])if(tile[key]!==c[key])reasons.push(key+'_changed');
  if(now<tile.createdAt||now>=tile.validUntil)reasons.push('tile_expired_or_clock_reset');
  if(tile.surfaces.some(s=>now>=s.validUntil))reasons.push('surface_expired');
  if(!inBox(listener,tile.bounds)||length(sub(listener,tile.listenerAnchor))>movement)reasons.push('listener_moved');
  return {valid:reasons.length===0,reasons,coverage:tile.coverage,missingRegions:tile.missingRegions.length};
}
export function onPatch(s,p){
  const x=p[0]-s.center[0],y=p[1]-s.center[1],z=p[2]-s.center[2],n=s.normal;
  if(!(Math.abs(0+x*n[0]+y*n[1]+z*n[2])<=E))return false;
  const u=0+x*s.u[0]+y*s.u[1]+z*s.u[2],v=0+x*s.v[0]+y*s.v[1]+z*s.v[2];
  if(!(Math.abs(u)<=s.half[0]+E&&Math.abs(v)<=s.half[1]+E))return false;
  if(s.footprint){
    for(let i=0;i<s.footprint.length;i++){
      const a=s.footprint[i],b=s.footprint[(i+1)%s.footprint.length];
      if(!((b[0]-a[0])*(v-a[1])-(b[1]-a[1])*(u-a[0])>= -E))return false;
    }
  }
  for(const h of s.openings)if(u>=h.min[0]-E&&u<=h.max[0]+E&&v>=h.min[1]-E&&v<=h.max[1]+E)return false;
  return true;
}
function hitsBox(start,delta,box){
  let lo=0,hi=1;
  for(let i=0;i<3;i++){
    const origin=start[i],direction=delta[i];
    if(Math.abs(direction)<E){
      if(origin<box.min[i]||origin>box.max[i])return false;
    }else{
      const a=(box.min[i]-origin)/direction,b=(box.max[i]-origin)/direction;
      lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
      if(lo>hi)return false;
    }
  }
  return true;
}
function buildSurfaceIndex(surfaces){
  // This padding conservatively covers the existing finite-patch/segment
  // tolerances, including contacts just beyond an endpoint (t within epsilon).
  const pad=1e-5,entries=surfaces.map((s,index)=>({index,min:[0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i]))-pad),max:[0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i]))+pad)}));
  return buildBoundsIndex(entries);
}
function buildBoundsIndex(entries){
  function node(rows){const min=[0,1,2].map(i=>Math.min(...rows.map(r=>r.min[i]))),max=[0,1,2].map(i=>Math.max(...rows.map(r=>r.max[i])));
    if(rows.length<=16)return {min,max,entries:rows};const widths=max.map((x,i)=>x-min[i]),axis=widths.indexOf(Math.max(...widths));rows.sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis])||a.index-b.index);const middle=rows.length>>>1;return {min,max,left:node(rows.slice(0,middle)),right:node(rows.slice(middle))};}
  return node(entries);
}
function indexedCandidates(root,items,start,delta){const found=[],pending=[root];while(pending.length){const n=pending.pop();if(!hitsBox(start,delta,n))continue;if(n.entries){for(const e of n.entries)if(hitsBox(start,delta,e))found.push(e.index);}else{pending.push(n.left,n.right);}}found.sort((x,y)=>x-y);return found.map(i=>items[i]);}
// One depth-first layout of the validated boxes serves every emitter. The
// skip offset passes over a whole missed branch. Coordinates stay Float64 and
// the slab divisions use the same tolerances as the scalar reference.
const flatIndices=new WeakMap();
function flatIndex(root,count){
 if(!root)return null;
 let flat=flatIndices.get(root);
 if(flat)return flat;
 const nodes=n=>n.entries?1:1+nodes(n.left)+nodes(n.right);
 flat=new Float64Array(8*(count+nodes(root)));
 let cursor=0;
 function write(n){
  const i=cursor;
  cursor+=8;
  for(let axis=0;axis<3;axis++){flat[i+axis]=n.min[axis];flat[i+axis+3]=n.max[axis];}
  flat[i+7]=n.index??-1;
  if(n.entries)for(const entry of n.entries)write(entry);
  else if(n.left){write(n.left);write(n.right);}
  flat[i+6]=cursor;
 }
 write(root);flatIndices.set(root,flat);return flat;
}
export function prepareBatchVisibility(tile){
 requireTile(tile);
 const prepare=(root,count)=>root?flatIndex(root,count).slice():null;
 return {schema:1,observationKey:tile.observationKey,
  surfaces:prepare(surfaceIndicesByTile.get(tile),tile.surfaces.length),
  regions:prepare(unknownIndicesByTile.get(tile),tile.missingRegions.length)};
}
// Called only after the owned worker result and its conservative tree have
// been adopted. Take private copies. A held immutable tree can subsequently
// share its prepared layout across finite request leases.
export function adoptSourceBoundBatchVisibility(tile,packet){
 requireTile(tile);
 if(packet?.schema!==1||packet.observationKey!==tile.observationKey)throw Error('source-bound batch visibility context');
 function copy(root,source,count){
  if(!root&&source===null)return null;
  if(!root||!(source instanceof Float64Array)||!(source.buffer instanceof ArrayBuffer)||
     source.byteOffset!==0||source.byteLength!==source.buffer.byteLength||source.length%8||
     source.length<=count*8||source.length>count*24||source[6]!==source.length)
   throw Error('source-bound batch visibility storage');
  const flat=source.slice();
  // Skip offsets govern traversal. Every visited box must advance the
  // cursor and every leaf must refer to an item of this exact workset.
  for(let row=0;row<flat.length;row+=8){
   const skip=flat[row+6],index=flat[row+7];
   if(!Number.isSafeInteger(skip)||skip%8||skip<=row||skip>flat.length||
      !Number.isSafeInteger(index)||index< -1||index>=count||index>=0&&skip!==row+8)
    throw Error('source-bound batch visibility offsets');
  }
  return flat;
 }
 const roots=[surfaceIndicesByTile.get(tile),unknownIndicesByTile.get(tile)];
 const surfaces=copy(roots[0],packet.surfaces,tile.surfaces.length);
 const regions=copy(roots[1],packet.regions,tile.missingRegions.length);
 if(surfaces)flatIndices.set(roots[0],surfaces);
 if(regions)flatIndices.set(roots[1],regions);
}
function flatCandidates(boxes,items,start,delta){
 const found=[];
 const x=start[0],y=start[1],z=start[2],dx=delta[0],dy=delta[1],dz=delta[2];
 const px=Math.abs(dx)<E,py=Math.abs(dy)<E,pz=Math.abs(dz)<E;
 // Reject wholly disjoint boxes before the slab divisions. The margin
 // exceeds endpoint reconstruction roundoff over the bounded metre domain;
 // all close contacts still go through the original interval predicates.
 const minX=Math.min(x,x+dx)-E,maxX=Math.max(x,x+dx)+E;
 const minY=Math.min(y,y+dy)-E,maxY=Math.max(y,y+dy)+E;
 const minZ=Math.min(z,z+dz)-E,maxZ=Math.max(z,z+dz)+E;
 for(let i=0;i<boxes.length;){
  const row=i;
  i=boxes[row+6];
  if(boxes[row]>maxX||boxes[row+3]<minX||boxes[row+1]>maxY||boxes[row+4]<minY||
     boxes[row+2]>maxZ||boxes[row+5]<minZ)continue;
  let lo=0,hi=1;
  if(px){if(x<boxes[row]||x>boxes[row+3])continue;}
  else{
   const a=(boxes[row]-x)/dx,b=(boxes[row+3]-x)/dx;
   lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)continue;
  }
  if(py){if(y<boxes[row+1]||y>boxes[row+4])continue;}
  else{
   const a=(boxes[row+1]-y)/dy,b=(boxes[row+4]-y)/dy;
   lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)continue;
  }
  if(pz){if(z<boxes[row+2]||z>boxes[row+5])continue;}
  else{
   const a=(boxes[row+2]-z)/dz,b=(boxes[row+5]-z)/dz;
   if(Math.max(lo,Math.min(a,b))>Math.min(hi,Math.max(a,b)))continue;
  }
  i=row+8;
  if(boxes[row+7]>=0)found.push(boxes[row+7]);
 }
 found.sort((a,b)=>a-b);
 return found.map(i=>items[i]);
}
function planeDistance(point,surface){
  const c=surface.center,n=surface.normal;
  // Match the existing dot product's zero-initialised sum, including signed zero.
  return 0+(point[0]-c[0])*n[0]+(point[1]-c[1])*n[1]+(point[2]-c[2])*n[2];
}
const coplanarBoxes=new WeakMap();
function coplanarBox(surface){
  let box=coplanarBoxes.get(surface.corners);
  if(!box){
    box={min:[0,1,2].map(i=>Math.min(...surface.corners.map(p=>p[i]))-E),
      max:[0,1,2].map(i=>Math.max(...surface.corners.map(p=>p[i]))+E)};
    if(Object.isFrozen(surface.corners)&&surface.corners.every(Object.isFrozen))coplanarBoxes.set(surface.corners,box);
  }
  return box;
}
export function querySegment(tile,start,end,{reflectorId=null,surfaceIndices=null}={}){
  requireTile(tile);return finiteSegment(tile,start,end,reflectorId,surfaceIndices,null,null);
}
export function querySegments(tile,segments){
  requireTile(tile);
  if(!segments.length)return [];
  // Preparation belongs to the scene worker. An ordinary or older tile can
  // use its original conservative tree immediately, including on first use.
  const surfaces=flatIndices.get(surfaceIndicesByTile.get(tile));
  const regions=flatIndices.get(unknownIndicesByTile.get(tile));
  return segments.map(({a,b})=>finiteSegment(tile,a,b,null,null,surfaces,regions));
}
function finiteSegment(tile,start,end,reflectorId,surfaceIndices,flatSurfaces,flatRegions){
  const a=vector(start),b=vector(end),delta=sub(b,a);if(!inBox(a,tile.bounds)||!inBox(b,tile.bounds)||length(delta)<=E)throw Error('segment extent');
  const surfaceIndex=surfaceIndicesByTile.get(tile);
  let selected=flatSurfaces?flatCandidates(flatSurfaces,tile.surfaces,a,delta):
    surfaceIndices===null&&surfaceIndex?indexedCandidates(surfaceIndex,tile.surfaces,a,delta):tile.surfaces;
  if(surfaceIndices!==null){if(!Array.isArray(surfaceIndices)||surfaceIndices.length>tile.surfaces.length||surfaceIndices.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>=tile.surfaces.length||(i>0&&n<=surfaceIndices[i-1])))throw Error('invalid conservative surface indices');selected=surfaceIndices.map(i=>tile.surfaces[i]);}
  const hits=[],ambiguous=[];let surfaceTests=0;
  for(const s of selected){surfaceTests++;const d0=planeDistance(a,s),d1=planeDistance(b,s),den=d0-d1;
    if(Math.abs(den)<E){if(Math.abs(d0)<E&&hitsBox(a,delta,coplanarBox(s)))ambiguous.push(s.id);continue;}
    const t=d0/den;if(t< -E||t>1+E)continue;
    const p=[a[0]+delta[0]*t,a[1]+delta[1]*t,a[2]+delta[2]*t];if(!onPatch(s,p))continue;
    if(s.id===reflectorId&&(Math.abs(t)<=E||Math.abs(t-1)<=E))continue;
    hits.push({id:s.id,t,point:p});
  }
  hits.sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id,'en'));
  const unknownIndex=unknownIndicesByTile.get(tile);
  const unknown=(flatRegions?flatCandidates(flatRegions,tile.missingRegions,a,delta):
    unknownIndex?indexedCandidates(unknownIndex,tile.missingRegions,a,delta):tile.missingRegions.filter(m=>hitsBox(a,delta,m.bounds))).map(m=>m.id);
  return {visibility:hits.length?'blocked':ambiguous.length||unknown.length||tile.coverage==='partial'?'unknown':'clear',hits,ambiguous,unknown,surfaceTests,claim:'Visibility within represented geometry only'};
}
