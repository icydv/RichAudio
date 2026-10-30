import fs from 'node:fs';
import path from 'node:path';
import {meshLimits,decodeChunk,queryChunkIds,queryUnknownRegions,sha256} from './collision-mesh.mjs';
const validBounds=b=>b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))&&b.min.every((v,i)=>v<=b.max[i]);
export function loadCollisionResource(indexPath,{expectedSHA256}={}){
 const absolute=path.resolve(indexPath),stat=fs.statSync(absolute);if(stat.size>67108864)throw Error('index byte limit');
 const bytes=fs.readFileSync(absolute),indexSHA256=sha256(bytes);if(expectedSHA256!==undefined&&indexSHA256!==expectedSHA256)throw Error('index integrity');
 const index=JSON.parse(bytes.toString('utf8'));if(index.schema!==1||index.kind!=='RichAudioCollisionMesh'||index.coordinateSpace!=='resource-root'||index.placement!=='unresolved-static-vs-archetype-local'||index.coverage!=='triangle-and-box-surfaces-incomplete'||!Array.isArray(index.chunks)||index.chunks.length>65536||!index.cells||typeof index.cells!=='object'||Array.isArray(index.cells)||!Array.isArray(index.overflowChunks)||!Array.isArray(index.unknownRegions)||index.unknownRegions.length>meshLimits.polygons+meshLimits.nodes||index.bounds!==null&&!validBounds(index.bounds))throw Error('collision index contract');
 const chunks=index.chunks;let totalTriangles=0;for(let i=0;i<chunks.length;i++){const c=chunks[i];if(c.id!==i||!/^chunk-[0-9]{6}\.racmesh$/.test(c.file)||!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.count)||c.count<1||c.count>meshLimits.chunkTriangles||c.bytes!==24+c.count*96||!validBounds(c.bounds))throw Error('chunk contract');totalTriangles+=c.count;}
 if(totalTriangles>meshLimits.triangles||index.counts?.triangles!==totalTriangles)throw Error('index triangle count');
 const validId=id=>Number.isSafeInteger(id)&&id>=0&&id<chunks.length;let references=0;const entries=Object.entries(index.cells);if(entries.length>meshLimits.cells)throw Error('index cells');
 for(const [key,ids] of entries){if(!/^-?[0-9]+,-?[0-9]+,-?[0-9]+$/.test(key)||!Array.isArray(ids)||ids.some(id=>!validId(id))||(references+=ids.length)>meshLimits.cellReferences)throw Error('cell references');}
 if(index.overflowChunks.some(id=>!validId(id)))throw Error('overflow references');
 for(const region of index.unknownRegions)if(typeof region.family!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(region.family)||region.bounds!==null&&!validBounds(region.bounds))throw Error('unknown region bounds');
 const directory=path.dirname(absolute);
 return {index,indexSHA256,indexIntegrity:expectedSHA256===undefined?'unbound-private-index':'expected-sha256-verified',query(query,{maxChunks=16,maxTriangles=131072}={}){
  if(!Number.isSafeInteger(maxChunks)||maxChunks<1||maxChunks>256||!Number.isSafeInteger(maxTriangles)||maxTriangles<1||maxTriangles>meshLimits.triangles)throw Error('query resource limits');
  const ids=queryChunkIds(index,query);if(ids.length>maxChunks||ids.reduce((s,id)=>s+chunks[id].count,0)>maxTriangles)throw Error('query candidate limit');
  const triangles=[];for(const id of ids){const chunk=chunks[id],file=path.join(directory,chunk.file),info=fs.statSync(file);if(info.size!==chunk.bytes)throw Error('chunk byte size');const records=decodeChunk(fs.readFileSync(file),chunk.sha256);triangles.push(...records);}
  return {coordinateSpace:index.coordinateSpace,placement:index.placement,coverage:index.coverage,worldPlacementVerified:false,candidateChunks:ids,triangles,unknownRegions:queryUnknownRegions(index,query)};
 }};
}
