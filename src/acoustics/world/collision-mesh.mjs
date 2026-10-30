// Original adapter format. Raw collision exports are private input data, never release assets.
import {createHash} from 'node:crypto';
export const meshLimits=Object.freeze({nodes:65536,vertices:2000000,polygons:2000000,triangles:2000000,chunkTriangles:8192,cells:262144,cellReferences:2000000,cellsPerTriangle:512,bytes:268435456});
export const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error(message);};
const integer=(v,max,label)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:fail(label);
const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1e9?v:fail('finite bounded coordinate');
const vector=v=>Array.isArray(v)&&v.length===3?v.map(finite):fail('vector');
export function matrix(m){
 if(!Array.isArray(m)||m.length!==16)fail('matrix');m.forEach(finite);
 if(m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)fail('affine row-vector matrix');
 const d=m[0]*(m[5]*m[10]-m[6]*m[9])-m[1]*(m[4]*m[10]-m[6]*m[8])+m[2]*(m[4]*m[9]-m[5]*m[8]);
 if(Math.abs(d)<1e-12)fail('singular transform');return m;
}
export function determinant3(m){matrix(m);return m[0]*(m[5]*m[10]-m[6]*m[9])-m[1]*(m[4]*m[10]-m[6]*m[8])+m[2]*(m[4]*m[9]-m[5]*m[8]);}
// SharpDX row-vector convention: translation is M41/M42/M43, indices 12..14.
export function transformPoint(point,transform){const p=vector(point),m=matrix(transform);return [0,1,2].map(j=>finite(p[0]*m[j]+p[1]*m[4+j]+p[2]*m[8+j]+m[12+j]));}
export function resourcePoint(vertex,center,leafToRoot){let p=vector(vertex).map((v,i)=>v+vector(center)[i]);for(const m of leafToRoot)p=transformPoint(p,m);return p;}
const bounds=vertices=>({min:[0,1,2].map(i=>Math.min(...vertices.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...vertices.map(v=>v[i])))});
function mergeBounds(a,b){return a?{min:a.min.map((v,i)=>Math.min(v,b.min[i])),max:a.max.map((v,i)=>Math.max(v,b.max[i]))}:structuredClone(b);}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function triangleNormal(positions){const n=cross(sub(positions[1],positions[0]),sub(positions[2],positions[0])),length=Math.hypot(...n);return length>1e-12?n.map(v=>v===0?0:v/length):null;}
// Four native indices encode alternating diagonal corners, not an AABB.
export function boxSurface(indexedPoints){
 if(!Array.isArray(indexedPoints)||indexedPoints.length!==4)fail('box indices');const [p1,p2,p3,p4]=indexedPoints.map(vector),e1=sub(add(p3,p4),add(p1,p2)).map(v=>v*.5),e2=sub(sub(p3,p1),e1),e3=sub(sub(p4,p1),e1);
 const points=Array.from({length:8},(_,i)=>add(add(add(p1,e1.map(v=>v*(i&1))),e2.map(v=>v*((i>>1)&1))),e3.map(v=>v*((i>>2)&1))));
 const center=points[0].map((_,j)=>points.reduce((s,p)=>s+p[j],0)/8),faces=[[0,2,6,4],[1,5,7,3],[0,4,5,1],[2,3,7,6],[0,1,3,2],[4,6,7,5]],result=[];
 for(const face of faces)for(const ids of [[face[0],face[1],face[2]],[face[0],face[2],face[3]]]){const positions=ids.map(i=>points[i]),n=triangleNormal(positions);if(n&&dot(n,sub(positions[0],center))<0)[positions[1],positions[2]]=[positions[2],positions[1]];result.push(positions);}return result;
}
function transformedEnvelope(lo,hi,center,chain){lo=vector(lo);hi=vector(hi);if(lo.some((v,i)=>v>hi[i]))fail('envelope bounds');return bounds(Array.from({length:8},(_,mask)=>resourcePoint(lo.map((v,i)=>(mask>>i)&1?hi[i]:v),center,chain)));}
export function convertCollision(raw,{chunkTriangles=meshLimits.chunkTriangles,cellSize=64}={}){
 if(raw?.schema!==1||raw.kind!=='CodeWalkerYbnMesh'||!raw.source||raw.source.coordinateSpace!=='resource-root'||raw.source.placement!=='unresolved-static-vs-archetype-local')fail('collision identity');
 if(typeof raw.source.archive!=='string'||raw.source.archive.length<1||raw.source.archive.length>1024||typeof raw.source.entry!=='string'||raw.source.entry.length<1||raw.source.entry.length>8192||typeof raw.source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.source.sha256))fail('source identity');
 if(!Array.isArray(raw.nodes)||raw.nodes.length<1||raw.nodes.length>meshLimits.nodes)fail('nodes limit');
 integer(chunkTriangles,meshLimits.chunkTriangles,'chunk triangle limit');if(!chunkTriangles||!Number.isFinite(cellSize)||cellSize<1||cellSize>1024)fail('spatial settings');
 const nodeMetadata=[],triangles=[],unknownRegions=[],unsupported=Object.create(null),nodes=new Map();let totalVertices=0,totalPolygons=0,oracleSamples=0,oracleMaxError=0,nativeTriangles=0,boxPolygons=0,degenerateTriangles=0;
 for(let ni=0;ni<raw.nodes.length;ni++){
  const n=raw.nodes[ni];if(typeof n.id!=='string'||!/^n[0-9]+$/.test(n.id)||nodes.has(n.id))fail('node identity');
  if(n.parent!==null&&!nodes.has(n.parent))fail('parent must precede child');matrix(n.transform);
  const chain=[n.transform];for(let p=n.parent;p!==null;p=nodes.get(p).parent){chain.push(nodes.get(p).transform);if(chain.length>64)fail('transform depth');}
  const mirrored=chain.reduce((sign,m)=>sign*Math.sign(determinant3(m)),1)<0;
  nodes.set(n.id,n);const vertices=n.vertices??[],polygons=n.polygons??[],materials=n.materials??[];
  if(!Array.isArray(vertices)||!Array.isArray(polygons)||!Array.isArray(materials))fail('geometry arrays');
  totalVertices+=vertices.length;totalPolygons+=polygons.length;if(totalVertices>meshLimits.vertices||totalPolygons>meshLimits.polygons)fail('geometry limit');
  vertices.forEach(vector);const center=vector(n.center??[0,0,0]);
  // Parser oracle is in the immediate parent's coordinates, not world coordinates.
  for(const sample of n.oracleSamples??[]){const vi=integer(sample.index,vertices.length-1,'oracle vertex');const expected=vector(sample.positionInParent),actual=transformPoint(vertices[vi].map((v,i)=>v+center[i]),n.transform);const error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));oracleMaxError=Math.max(oracleMaxError,error);oracleSamples++;if(error>Math.max(.002,Math.max(...expected.map(Math.abs))*2e-6))fail('CodeWalker vertex oracle mismatch');}
  if(typeof n.type!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(n.type))fail('bound family');
  const metadata={id:n.id,parent:n.parent,type:n.type,center,transform:n.transform,transformSource:n.transformSource??'synthetic',vertices:vertices.length,polygons:polygons.length,triangles:0,unsupported:Object.create(null)};
  if(n.unsupportedBound){unsupported[n.type]=(unsupported[n.type]??0)+1;metadata.unsupportedBound=true;unknownRegions.push({family:n.type,node:ni,polygon:null,bounds:n.declaredBounds?transformedEnvelope(n.declaredBounds.min,n.declaredBounds.max,[0,0,0],chain):null,basis:'declared-bound-space-unverified'});}
  for(let pi=0;pi<polygons.length;pi++){
   const p=polygons[pi];if(typeof p?.family!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.family))fail('polygon family');
   if(!['Triangle','Box'].includes(p.family)){const family=p.family;unsupported[family]=(unsupported[family]??0)+1;metadata.unsupported[family]=(metadata.unsupported[family]??0)+1;let envelope=null,basis='unknown-envelope';
    if(['Sphere','Capsule','Cylinder'].includes(family)&&Array.isArray(p.indices)&&p.indices.length&&(p.radius>=0&&Number.isFinite(p.radius))){const points=p.indices.map(v=>vertices[integer(v,vertices.length-1,'unsupported vertex index')]),b=bounds(points);envelope=transformedEnvelope(b.min.map(v=>v-p.radius),b.max.map(v=>v+p.radius),center,chain);basis='analytic-envelope-transformed';}
    unknownRegions.push({family,node:ni,polygon:pi,bounds:envelope,basis});continue;}
   const vertexCount=p.family==='Triangle'?3:4;if(!Array.isArray(p.indices)||p.indices.length!==vertexCount)fail('surface indices');const indices=p.indices.map(v=>integer(v,vertices.length-1,'vertex index'));
   const materialSlot=integer(p.materialSlot,materials.length-1,'material slot'),material=materials[materialSlot];
   const type=integer(material.type,255,'material type'),data1=integer(material.data1,0xffffffff,'material data1'),data2=integer(material.data2,0xffffffff,'material data2');
   if((data1&255)!==type)fail('material type mismatch');
   const points=indices.map(i=>resourcePoint(vertices[i],center,chain));if(p.family==='Triangle'&&mirrored)[points[1],points[2]]=[points[2],points[1]];
   const surfaces=p.family==='Box'?boxSurface(points):[points];if(p.family==='Box')boxPolygons++;else nativeTriangles++;
   for(const positions of surfaces){const normal=triangleNormal(positions);if(!normal)degenerateTriangles++;triangles.push({positions,normal,materialType:type,materialSlot,data1,data2,node:ni,polygon:pi});metadata.triangles++;if(triangles.length>meshLimits.triangles)fail('triangle limit');}
  }
  nodeMetadata.push(metadata);
 }
 const chunks=[],cells=new Map(),overflow=new Set();let references=0,assetBounds=null;
 // Resource bounds also enclose unsupported envelopes, so a whole-resource query cannot
 // skip an unknown region just beyond the supported triangle bounds.
 for(const region of unknownRegions)if(region.bounds)assetBounds=mergeBounds(assetBounds,region.bounds);
 for(let start=0;start<triangles.length;start+=chunkTriangles){
  const part=triangles.slice(start,start+chunkTriangles),ci=chunks.length,chunk={id:ci,count:part.length,triangles:part,bounds:null};
  for(const t of part){const b=bounds(t.positions);chunk.bounds=mergeBounds(chunk.bounds,b);assetBounds=mergeBounds(assetBounds,b);const lo=b.min.map(v=>Math.floor(v/cellSize)),hi=b.max.map(v=>Math.floor(v/cellSize)),count=lo.reduce((s,v,i)=>s*(hi[i]-v+1),1);
   if(count>meshLimits.cellsPerTriangle){overflow.add(ci);continue;}
   for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const key=`${x},${y},${z}`;let value=cells.get(key);if(!value){if(cells.size>=meshLimits.cells)fail('cell limit');cells.set(key,value=new Set());}if(!value.has(ci)){value.add(ci);if(++references>meshLimits.cellReferences)fail('cell reference limit');}}
  }
  chunks.push(chunk);
 }
 return {schema:1,kind:'RichAudioCollisionMesh',source:structuredClone(raw.source),coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local',coverage:'triangle-and-box-surfaces-incomplete',unsupported,unknownRegions,counts:{nodes:raw.nodes.length,vertices:totalVertices,polygons:totalPolygons,triangles:triangles.length,nativeTriangles,boxPolygons,degenerateTriangles,oracleSamples,oracleMaxError},nodes:nodeMetadata,bounds:assetBounds,cellSize,cells:Object.fromEntries([...cells].map(([k,v])=>[k,[...v]])),overflowChunks:[...overflow],chunks};
}
export function encodeChunk(triangles){
 if(!Array.isArray(triangles)||triangles.length>meshLimits.chunkTriangles)fail('chunk size');const stride=96,buffer=Buffer.alloc(24+stride*triangles.length);buffer.write('RACMESH1',0,'ascii');buffer.writeUInt32LE(1,8);buffer.writeUInt32LE(stride,12);buffer.writeUInt32LE(triangles.length,16);
 triangles.forEach((t,i)=>{let o=24+i*stride;for(const v of t.positions)for(const x of v){buffer.writeDoubleLE(finite(x),o);o+=8;}for(const x of [t.materialType,t.node,t.polygon,t.data1,t.data2,t.materialSlot]){buffer.writeUInt32LE(integer(x,0xffffffff,'record integer'),o);o+=4;}});return buffer;
}
export function decodeChunk(buffer,expectedHash){
 if(!Buffer.isBuffer(buffer)||buffer.length<24||buffer.toString('ascii',0,8)!=='RACMESH1'||buffer.readUInt32LE(8)!==1||buffer.readUInt32LE(12)!==96||buffer.readUInt32LE(20)!==0)fail('chunk header');
 const count=integer(buffer.readUInt32LE(16),meshLimits.chunkTriangles,'chunk count');if(buffer.length!==24+96*count||expectedHash&&sha256(buffer)!==expectedHash)fail('chunk integrity');
 return Array.from({length:count},(_,i)=>{let o=24+96*i;const positions=Array.from({length:3},()=>Array.from({length:3},()=>{const n=finite(buffer.readDoubleLE(o));o+=8;return n;}));const record={positions,normal:triangleNormal(positions)};for(const key of ['materialType','node','polygon','data1','data2','materialSlot']){record[key]=buffer.readUInt32LE(o);o+=4;}return record;});
}
export function queryUnknownRegions(index,query){const lo=vector(query.min),hi=vector(query.max);if(lo.some((v,i)=>v>hi[i]))fail('query bounds');return index.unknownRegions.filter(r=>!r.bounds||r.basis!=='analytic-envelope-transformed'||r.bounds.min.every((v,i)=>v<=hi[i]&&r.bounds.max[i]>=lo[i]));}
export function queryChunkIds(index,query){
 if(index?.schema!==1||index.kind!=='RichAudioCollisionMesh'||!Array.isArray(index.chunks)||index.chunks.length>Math.ceil(meshLimits.triangles/1))fail('index identity');
 const lo=vector(query.min),hi=vector(query.max);if(lo.some((v,i)=>v>hi[i]))fail('query bounds');if(!Number.isFinite(index.cellSize)||index.cellSize<1||index.cellSize>1024)fail('cell size');const a=lo.map(v=>Math.floor(v/index.cellSize)),b=hi.map(v=>Math.floor(v/index.cellSize));if(a.reduce((s,v,i)=>s*(b[i]-v+1),1)>meshLimits.cells)fail('query cell limit');
 const candidates=new Set(index.overflowChunks);for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++)for(let z=a[2];z<=b[2];z++)for(const id of index.cells[`${x},${y},${z}`]??[])candidates.add(id);
 return [...candidates].filter(id=>{integer(id,index.chunks.length-1,'chunk reference');const box=index.chunks[id].bounds;return box.min.every((v,i)=>v<=hi[i]&&box.max[i]>=lo[i]);}).sort((x,y)=>x-y);
}
