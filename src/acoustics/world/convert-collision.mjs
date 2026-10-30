import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {convertCollision,encodeChunk,sha256,meshLimits} from './collision-mesh.mjs';
export function exportCollision(input,output){
 const stat=fs.statSync(input);if(stat.size>meshLimits.bytes)throw Error('input byte limit');const raw=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
 const converted=convertCollision(raw);const resourceId=sha256(Buffer.from(JSON.stringify([raw.source.archive,raw.source.entry,raw.source.sha256]))).slice(0,24);
 const directory=path.join(path.resolve(output),resourceId);fs.mkdirSync(directory);const records=[];
 // Publish the index last. Partial directories have no usable index and are not a cache hit.
 for(const chunk of converted.chunks){const bytes=encodeChunk(chunk.triangles),filename=`chunk-${String(chunk.id).padStart(6,'0')}.racmesh`;fs.writeFileSync(path.join(directory,filename),bytes,{flag:'wx'});records.push({id:chunk.id,file:filename,count:chunk.count,bounds:chunk.bounds,bytes:bytes.length,sha256:sha256(bytes)});}
 const index={...converted,chunks:records},indexBytes=Buffer.from(JSON.stringify(index));if(indexBytes.length>67108864||records.reduce((s,r)=>s+r.bytes,0)>meshLimits.bytes)throw Error('export byte limit');fs.writeFileSync(path.join(directory,'index.pending'),indexBytes,{flag:'wx'});fs.renameSync(path.join(directory,'index.pending'),path.join(directory,'index.json'));
 return {resourceId,index:path.join(directory,'index.json'),indexSHA256:sha256(indexBytes),counts:index.counts,unsupported:index.unsupported,coverage:index.coverage,coordinateSpace:index.coordinateSpace,placement:index.placement,chunks:records.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.length!==4)throw Error('usage: node convert-collision.mjs <private-normalized.json> <existing-private-output-directory>');process.stdout.write(JSON.stringify(exportCollision(process.argv[2],process.argv[3]))+'\n');}
