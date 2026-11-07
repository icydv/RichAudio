// Native indexed surface points and reconstructed Box corners are different
// bounds contracts. Keep both; no coordinate is clamped and no tolerance grows.
import fs from 'node:fs';
import path from 'node:path';
import {resourcePoint,convertCollision,encodeChunk,sha256} from './collision-mesh.mjs';
export const nativeSupportBoundsRevision01='native-indexed-surface-points-v1';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bounds=b=>b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(Number.isFinite))&&b.min.every((v,i)=>v<=b.max[i]);
export function collectNativeSupportBounds01(raw,chunks,normalizedSHA256){
 if(!hex(normalizedSHA256)||!hex(raw?.source?.sha256)||!Array.isArray(raw.nodes)||!Array.isArray(chunks))throw Error('native source bounds inputs');
 const nodes=new Map(),minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];let points=0,triangles=0,boxes=0;
 for(const node of raw.nodes){const chain=[node.transform];for(let p=node.parent;p!==null;){const parent=nodes.get(p);if(!parent||chain.length>64)throw Error('native source transform chain');chain.push(parent.transform);p=parent.parent;}nodes.set(node.id,node);
  for(const polygon of node.polygons??[]){if(!['Triangle','Box'].includes(polygon.family))continue;const expected=polygon.family==='Triangle'?3:4;if(polygon.indices?.length!==expected)throw Error('native surface index count');if(expected===3)triangles++;else boxes++;
   for(const index of polygon.indices){if(!Number.isSafeInteger(index)||!node.vertices?.[index])throw Error('native surface vertex');const point=resourcePoint(node.vertices[index],node.center??[0,0,0],chain);for(let i=0;i<3;i++){minimum[i]=Math.min(minimum[i],point[i]);maximum[i]=Math.max(maximum[i],point[i]);}points++;}
  }
 }
 return {revision:nativeSupportBoundsRevision01,nativeSourceSHA256:raw.source.sha256,normalizedSHA256,nativeIndexedBounds:points?{min:minimum,max:maximum}:null,nativeSurfacePoints:points,nativeTriangles:triangles,boxPolygons:boxes,chunkSHA256:chunks.map(c=>c.sha256),semantics:'native-Triangle-vertices-and-four-indexed-Box-points; reconstructed-Box-corners-retained-separately',coordinatesClamped:false,boundsToleranceChanged:false};
}
export function validNativeSupportBounds01(value,index){
 return value?.revision===nativeSupportBoundsRevision01&&value.nativeSourceSHA256===index.source?.sha256&&hex(value.normalizedSHA256)&&value.coordinatesClamped===false&&value.boundsToleranceChanged===false&&Number.isSafeInteger(value.nativeSurfacePoints)&&value.nativeSurfacePoints===3*index.counts.nativeTriangles+4*index.counts.boxPolygons&&value.nativeTriangles===index.counts.nativeTriangles&&value.boxPolygons===index.counts.boxPolygons&&(value.nativeSurfacePoints===0?value.nativeIndexedBounds===null:bounds(value.nativeIndexedBounds))&&Array.isArray(value.chunkSHA256)&&value.chunkSHA256.length===index.chunks.length&&value.chunkSHA256.every((hash,i)=>hash===index.chunks[i].sha256);
}
export function upgradeNativeSupportBounds01({normalizedPath,indexPath,indexSHA256,outputRoot}){
 const bytes=fs.readFileSync(indexPath);if(bytes.length>67108864||sha256(bytes)!==indexSHA256)throw Error('exact base index required');const index=JSON.parse(bytes.toString('utf8')),rawBytes=fs.readFileSync(normalizedPath);if(rawBytes.length>268435456)throw Error('bounded retained normalizer');const raw=JSON.parse(rawBytes.toString('utf8').replace(/^\uFEFF/,''));
 if(raw.source?.sha256!==index.source?.sha256||raw.source.entry!==index.source.entry||raw.source.archive!==index.source.archive)throw Error('retained normalizer/source mismatch');
 // Historical receipts do not pin the normalizer itself. Reproduce EVERY
 // original triangle chunk before deriving a qualification supplement from it.
 const reproduced=convertCollision(raw);if(reproduced.chunks.length!==index.chunks.length||reproduced.chunks.some((c,i)=>sha256(encodeChunk(c.triangles))!==index.chunks[i].sha256))throw Error('normalizer does not reproduce exact base geometry');
 const qualifier=collectNativeSupportBounds01(raw,index.chunks,sha256(rawBytes)),updated={...index,nativeSupportBounds01:qualifier,nativeSupportDerivation01:{baseIndexSHA256:indexSHA256,normalizedSHA256:sha256(rawBytes),allBaseChunksReproduced:true,originalArchiveDecoded:false}};
 const destination=path.join(path.resolve(outputRoot),sha256(Buffer.from(JSON.stringify([index.source,indexSHA256,nativeSupportBoundsRevision01]))).slice(0,24));fs.mkdirSync(destination,{recursive:true});
 for(const chunk of index.chunks){const source=path.join(path.dirname(indexPath),chunk.file),data=fs.readFileSync(source);if(sha256(data)!==chunk.sha256)throw Error('base chunk changed');const target=path.join(destination,chunk.file);if(fs.existsSync(target)){if(sha256(fs.readFileSync(target))!==chunk.sha256)throw Error('derived chunk collision');}else fs.writeFileSync(target,data,{flag:'wx'});}
 const output=Buffer.from(JSON.stringify(updated)),hash=sha256(output),target=path.join(destination,'index-native-support01-'+hash+'.json');if(!fs.existsSync(target))fs.writeFileSync(target,output,{flag:'wx'});else if(sha256(fs.readFileSync(target))!==hash)throw Error('derived index collision');return {indexPath:target,indexSHA256:hash,baseIndexSHA256:indexSHA256,allBaseChunksReproduced:true,originalArchiveDecoded:false,qualifier};
}
