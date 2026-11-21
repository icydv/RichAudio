import fs from 'node:fs';
import path from 'node:path';
import {meshLimits,decodeChunk,queryChunkIds,queryUnknownRegions,sha256} from './collision-mesh.mjs';
import {validateAnalyticPrimitive01,tessellateAnalyticPrimitive01,analyticPrimitiveRevision01} from './analytic-primitives01.mjs';

// Optional bounded counters report substage costs without changing validation.
// Returned file bytes are logical read payload, not physical disk traffic.
const profileFields01=['fileReadMs','fileReadLogicalBytes','fileReadCalls','sha256Ms','sha256Calls','jsonDecodeParseMs','chunkDecodeIncludingSHA256Ms','chunkDecodeCalls','analyticTessellationMs','analyticTessellationCalls','resourceClassificationMs'];
export const createCollisionResourceProfile01=()=>Object.fromEntries(profileFields01.map(key=>[key,0]));
function profile01Sink(value){if(!value||typeof value!=='object'||Array.isArray(value))return null;for(const key of profileFields01)if(!Number.isFinite(value[key])||value[key]<0)value[key]=0;return value;}
function measured01(profile,key,operation){if(!profile)return operation();const began=performance.now();try{return operation();}finally{profile[key]+=performance.now()-began;}}
function read01(file,profile){const bytes=measured01(profile,'fileReadMs',()=>fs.readFileSync(file));if(profile){profile.fileReadCalls++;profile.fileReadLogicalBytes+=bytes.length;}return bytes;}
function hash01(bytes,profile){if(profile)profile.sha256Calls++;return measured01(profile,'sha256Ms',()=>sha256(bytes));}
const validBounds=b=>b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))&&b.min.every((v,i)=>v<=b.max[i]);
export function loadCollisionResource(indexPath,{expectedSHA256,profile01=null}={}){
 profile01=profile01Sink(profile01);
 const absolute=path.resolve(indexPath),stat=fs.statSync(absolute);if(stat.size>67108864)throw Error('index byte limit');
 const bytes=read01(absolute,profile01),indexSHA256=hash01(bytes,profile01);if(expectedSHA256!==undefined&&indexSHA256!==expectedSHA256)throw Error('index integrity');
 const index=measured01(profile01,'jsonDecodeParseMs',()=>JSON.parse(bytes.toString('utf8')));if(index.schema!==1||index.kind!=='RichAudioCollisionMesh'||index.coordinateSpace!=='resource-root'||index.placement!=='unresolved-static-vs-archetype-local'||index.coverage!=='triangle-and-box-surfaces-incomplete'||!Array.isArray(index.chunks)||index.chunks.length>65536||!index.cells||typeof index.cells!=='object'||Array.isArray(index.cells)||!Array.isArray(index.overflowChunks)||!Array.isArray(index.unknownRegions)||index.unknownRegions.length>meshLimits.polygons+meshLimits.nodes||index.bounds!==null&&!validBounds(index.bounds))throw Error('collision index contract');
 const chunks=index.chunks;let totalTriangles=0;for(let i=0;i<chunks.length;i++){const c=chunks[i];if(c.id!==i||!/^chunk-[0-9]{6}\.racmesh$/.test(c.file)||!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.count)||c.count<1||c.count>meshLimits.chunkTriangles||c.bytes!==24+c.count*96||!validBounds(c.bounds))throw Error('chunk contract');totalTriangles+=c.count;}
 if(totalTriangles>meshLimits.triangles||index.counts?.triangles!==totalTriangles)throw Error('index triangle count');
 const validId=id=>Number.isSafeInteger(id)&&id>=0&&id<chunks.length;let references=0;const entries=Object.entries(index.cells);if(entries.length>meshLimits.cells)throw Error('index cells');
 for(const [key,ids] of entries){if(!/^-?[0-9]+,-?[0-9]+,-?[0-9]+$/.test(key)||!Array.isArray(ids)||ids.some(id=>!validId(id))||(references+=ids.length)>meshLimits.cellReferences)throw Error('cell references');}
 if(index.overflowChunks.some(id=>!validId(id)))throw Error('overflow references');
 for(const region of index.unknownRegions)if(typeof region.family!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(region.family)||region.bounds!==null&&!validBounds(region.bounds))throw Error('unknown region bounds');
 const analytic=index.analyticPrimitives01;let analyticIndex=null;
 if(analytic!==undefined){
  if(analytic.schema!==1||analytic.kind!=='RichAudioCompactAnalyticPrimitives01'||analytic.revision!==analyticPrimitiveRevision01||analytic.sourceSHA256!==index.source.sha256||!Array.isArray(analytic.primitives)||analytic.primitives.length>65536||!analytic.cells||typeof analytic.cells!=='object'||Array.isArray(analytic.cells)||!Array.isArray(analytic.overflowChunks)||!Number.isFinite(analytic.cellSize)||analytic.cellSize<1||analytic.cellSize>1024)throw Error('compact analytic index contract');
  const keys=new Set();for(const primitive of analytic.primitives){validateAnalyticPrimitive01(primitive);const key=primitive.node+':'+primitive.polygon+':'+primitive.sourceFamily;if(keys.has(key))throw Error('duplicate compact analytic identity');keys.add(key);}
  const id=n=>Number.isSafeInteger(n)&&n>=0&&n<analytic.primitives.length;let refs=0;const cells=Object.entries(analytic.cells);if(cells.length>meshLimits.cells)throw Error('analytic cell budget');for(const [key,ids]of cells)if(!/^-?[0-9]+,-?[0-9]+,-?[0-9]+$/.test(key)||!Array.isArray(ids)||ids.some(n=>!id(n))||(refs+=ids.length)>meshLimits.cellReferences)throw Error('analytic cell references');if(analytic.overflowChunks.some(n=>!id(n)))throw Error('analytic overflow references');
  analyticIndex={schema:1,kind:'RichAudioCollisionMesh',cellSize:analytic.cellSize,cells:analytic.cells,overflowChunks:analytic.overflowChunks,chunks:analytic.primitives.map((primitive,id)=>({id,bounds:primitive.bounds}))};
 }
 const directory=path.dirname(absolute);
 function queryPrepared01(query,{maxChunks=16,maxTriangles=131072,maximumAnalyticErrorMetres=.05,maximumAnalyticPrimitives=128,nativeBounds=null,profile01:queryProfile01=profile01,components,owner}={}){
  queryProfile01=profile01Sink(queryProfile01);if(!components||typeof owner!=='string')throw Error('owned immutable component cache required');
  if(!Number.isSafeInteger(maxChunks)||maxChunks<1||maxChunks>256||!Number.isSafeInteger(maxTriangles)||maxTriangles<1||maxTriangles>meshLimits.triangles)throw Error('query resource limits');
  const ids=queryChunkIds(index,query),nativeTriangleRecords=ids.reduce((n,id)=>n+chunks[id].count,0);if(ids.length>maxChunks||nativeTriangleRecords>maxTriangles)throw Error('query candidate limit');
  const handles=[];for(const id of ids){const chunk=chunks[id],file=path.join(directory,chunk.file),info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==chunk.bytes)throw Error('chunk byte size/type');handles.push(components.native(owner,chunk,read01(file,queryProfile01),queryProfile01));}
  let triangleRecords=nativeTriangleRecords;const represented=new Set(),analyticUnknown=[],analytics={available:analytic?.primitives.length??0,candidates:0,approximated:0,unknown:0,triangles:0,maximumErrorMetres:0,representation:'optional-compact-affine-analytic01'};
  if(analyticIndex){
   if(!Number.isInteger(maximumAnalyticPrimitives)||maximumAnalyticPrimitives<1||maximumAnalyticPrimitives>1024||!Number.isFinite(maximumAnalyticErrorMetres)||maximumAnalyticErrorMetres<.001||maximumAnalyticErrorMetres>.25||nativeBounds!==null&&!validBounds(nativeBounds))throw Error('bounded local analytic controls');
   const candidates=queryChunkIds(analyticIndex,query);analytics.candidates=candidates.length;
   for(let n=0;n<candidates.length;n++){
    const p=analytic.primitives[candidates[n]],key=p.node+':'+p.polygon+':'+p.sourceFamily,remaining=Math.min(2048,maxTriangles-triangleRecords),outside=nativeBounds?Math.max(0,...p.bounds.min.map((v,i)=>nativeBounds.min[i]-v),...p.bounds.max.map((v,i)=>v-nativeBounds.max[i])):0;
    const prepared=n>=maximumAnalyticPrimitives||remaining<8||outside>.001?{handle:null,metadata:{state:'unknown',reason:outside>.001?'analytic-outside-native-cache-bounds':'analytic-local-capacity',bounds:p.bounds}}:components.analytic(owner,p,{maximumErrorMetres:maximumAnalyticErrorMetres,maximumTriangles:remaining},queryProfile01),approximation=prepared.metadata;
    if(approximation.state==='approximated-analytic'){handles.push(prepared.handle);triangleRecords+=approximation.triangleCount;represented.add(key);analytics.approximated++;analytics.triangles+=approximation.triangleCount;analytics.maximumErrorMetres=Math.max(analytics.maximumErrorMetres,approximation.maximumErrorMetres);}
    else{analytics.unknown++;analyticUnknown.push({family:p.sourceFamily,node:p.node,polygon:p.polygon,bounds:p.bounds,basis:'analytic-envelope-transformed',reason:approximation.reason});}
   }
  }
  const unknownRegions=queryUnknownRegions(index,query).filter(region=>!represented.has(region.compactAnalyticPrimitive01??'')),known=new Set(unknownRegions.map(r=>r.node+':'+r.polygon+':'+r.family));for(const region of analyticUnknown)if(!known.has(region.node+':'+region.polygon+':'+region.family))unknownRegions.push(region);
  const references=handles.flatMap(handle=>components.select(handle,query));return {coordinateSpace:index.coordinateSpace,placement:index.placement,coverage:index.coverage,worldPlacementVerified:false,candidateChunks:ids,references,triangleRecords,nativeTriangleRecords,unknownRegions,analytic:analytics};
 }
 return {index,indexSHA256,indexIntegrity:expectedSHA256===undefined?'unbound-private-index':'expected-sha256-verified',verifyIntegrity(){
  // The converter validated every coordinate before publishing these exact
  // digest-bound bytes. Warm-cache integrity does not need to allocate every
  // triangle object again. Actual spatial queries still decode/validate them.
  let bytes=0;for(const chunk of chunks){const file=path.join(directory,chunk.file),info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==chunk.bytes)throw Error('chunk byte size/type');const data=read01(file,profile01);if(data.length!==chunk.bytes||data.length<24||data.toString('ascii',0,8)!=='RACMESH1'||data.readUInt32LE(8)!==1||data.readUInt32LE(12)!==96||data.readUInt32LE(16)!==chunk.count||data.readUInt32LE(20)!==0||hash01(data,profile01)!==chunk.sha256)throw Error('chunk integrity');bytes+=data.length;}
  return {state:'all-chunk-bytes-sha256-verified',chunks:chunks.length,bytes,triangleObjectsDecoded:0,coordinateValidation:'retained-exact-converter-artifact; revalidated-by-active-query'};
 },queryPrepared:queryPrepared01,query(query,{maxChunks=16,maxTriangles=131072,maximumAnalyticErrorMetres=.05,maximumAnalyticPrimitives=128,nativeBounds=null,profile01:queryProfile01=profile01}={}){
  queryProfile01=profile01Sink(queryProfile01);
  if(!Number.isSafeInteger(maxChunks)||maxChunks<1||maxChunks>256||!Number.isSafeInteger(maxTriangles)||maxTriangles<1||maxTriangles>meshLimits.triangles)throw Error('query resource limits');
  const ids=queryChunkIds(index,query);if(ids.length>maxChunks||ids.reduce((s,id)=>s+chunks[id].count,0)>maxTriangles)throw Error('query candidate limit');
  const triangles=[];for(const id of ids){const chunk=chunks[id],file=path.join(directory,chunk.file),info=fs.statSync(file);if(info.size!==chunk.bytes)throw Error('chunk byte size');const bytes=read01(file,queryProfile01);if(queryProfile01)queryProfile01.chunkDecodeCalls++;const records=measured01(queryProfile01,'chunkDecodeIncludingSHA256Ms',()=>decodeChunk(bytes,chunk.sha256));triangles.push(...records);}
  const represented=new Set(),analyticUnknown=[],analytics={available:analytic?.primitives.length??0,candidates:0,approximated:0,unknown:0,triangles:0,maximumErrorMetres:0,representation:'optional-compact-affine-analytic01'};
  if(analyticIndex){
   if(!Number.isInteger(maximumAnalyticPrimitives)||maximumAnalyticPrimitives<1||maximumAnalyticPrimitives>1024||!Number.isFinite(maximumAnalyticErrorMetres)||maximumAnalyticErrorMetres<.001||maximumAnalyticErrorMetres>.25||nativeBounds!==null&&!validBounds(nativeBounds))throw Error('bounded local analytic controls');
   const candidates=queryChunkIds(analyticIndex,query);analytics.candidates=candidates.length;
   for(let n=0;n<candidates.length;n++){
    const p=analytic.primitives[candidates[n]],key=p.node+':'+p.polygon+':'+p.sourceFamily,remaining=Math.min(2048,maxTriangles-triangles.length),outside=nativeBounds?Math.max(0,...p.bounds.min.map((v,i)=>nativeBounds.min[i]-v),...p.bounds.max.map((v,i)=>v-nativeBounds.max[i])):0;
    const approximation=n>=maximumAnalyticPrimitives||remaining<8||outside>.001?{state:'unknown',reason:outside>.001?'analytic-outside-native-cache-bounds':'analytic-local-capacity',bounds:p.bounds}:measured01(queryProfile01,'analyticTessellationMs',()=>{if(queryProfile01)queryProfile01.analyticTessellationCalls++;return tessellateAnalyticPrimitive01(p,{maximumErrorMetres:maximumAnalyticErrorMetres,maximumTriangles:remaining});});
    if(approximation.state==='approximated-analytic'){triangles.push(...approximation.triangles);represented.add(key);analytics.approximated++;analytics.triangles+=approximation.triangles.length;analytics.maximumErrorMetres=Math.max(analytics.maximumErrorMetres,approximation.maximumErrorMetres);}
    else{analytics.unknown++;analyticUnknown.push({family:p.sourceFamily,node:p.node,polygon:p.polygon,bounds:p.bounds,basis:'analytic-envelope-transformed',reason:approximation.reason});}
   }
  }
  const unknownRegions=queryUnknownRegions(index,query).filter(region=>!represented.has(region.compactAnalyticPrimitive01??''));const known=new Set(unknownRegions.map(r=>r.node+':'+r.polygon+':'+r.family));for(const region of analyticUnknown)if(!known.has(region.node+':'+region.polygon+':'+region.family))unknownRegions.push(region);
  return {coordinateSpace:index.coordinateSpace,placement:index.placement,coverage:index.coverage,worldPlacementVerified:false,candidateChunks:ids,triangles,unknownRegions,analytic:analytics};
 }};
}
