import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {convertCollision,encodeChunk,sha256,meshLimits} from './collision-mesh.mjs';
import {collectAnalyticPrimitives01,analyticPrimitiveRevision01} from './analytic-primitives01.mjs';
function analyticIndex(raw,index,normalizedSHA256){
 if(raw.source?.sha256!==index.source?.sha256||raw.source?.entry!==index.source?.entry||raw.source?.archive!==index.source?.archive)throw Error('Retained normalizer and collision index source identity');
 const analyticPrimitives01=collectAnalyticPrimitives01(raw),byKey=new Map(analyticPrimitives01.primitives.map(p=>[p.node+':'+p.polygon+':'+p.sourceFamily,p]));
 return {...index,analyticPrimitives01,analyticDerivation01:{revision:analyticPrimitiveRevision01,normalizedSHA256,nativeSourceSHA256:raw.source.sha256,archiveDecoded:false},unknownRegions:index.unknownRegions.map(region=>{const p=byKey.get(region.node+':'+region.polygon+':'+region.family);return p?{...region,bounds:p.bounds,basis:'analytic-envelope-transformed',compactAnalyticPrimitive01:p.node+':'+p.polygon+':'+p.sourceFamily}:region;})};
}
export function exportCollision(input,output){
 const stat=fs.statSync(input);if(stat.size>meshLimits.bytes)throw Error('input byte limit');const raw=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
 const converted=convertCollision(raw);const resourceId=sha256(Buffer.from(JSON.stringify([raw.source.archive,raw.source.entry,raw.source.sha256]))).slice(0,24);
 const directory=path.join(path.resolve(output),resourceId);fs.mkdirSync(directory);const records=[];
 // Publish the index last. Partial directories have no usable index and are not a cache hit.
 for(const chunk of converted.chunks){const bytes=encodeChunk(chunk.triangles),filename=`chunk-${String(chunk.id).padStart(6,'0')}.racmesh`;fs.writeFileSync(path.join(directory,filename),bytes,{flag:'wx'});records.push({id:chunk.id,file:filename,count:chunk.count,bounds:chunk.bounds,bytes:bytes.length,sha256:sha256(bytes)});}
 const index=analyticIndex(raw,{...converted,chunks:records},sha256(fs.readFileSync(input))),indexBytes=Buffer.from(JSON.stringify(index));if(indexBytes.length>67108864||records.reduce((s,r)=>s+r.bytes,0)>meshLimits.bytes)throw Error('export byte limit');fs.writeFileSync(path.join(directory,'index.pending'),indexBytes,{flag:'wx'});fs.renameSync(path.join(directory,'index.pending'),path.join(directory,'index.json'));
 return {resourceId,index:path.join(directory,'index.json'),indexSHA256:sha256(indexBytes),counts:index.counts,unsupported:index.unsupported,coverage:index.coverage,coordinateSpace:index.coordinateSpace,placement:index.placement,chunks:records.length};
}
// Derived-cache upgrade only: original index/chunks/receipts stay untouched.
// The new index reuses those exact chunk paths and records the normalized file
// digest, native source identity and base-index derivation explicitly.
export function upgradeCollisionAnalyticIndex01(input,indexPath,expectedIndexSHA256,{maximumOutputBytes=67108864}={}){
 const file=path.resolve(indexPath),baseBytes=fs.readFileSync(file);if(baseBytes.length>67108864||sha256(baseBytes)!==expectedIndexSHA256)throw Error('Pinned base collision index required');
 const original=JSON.parse(baseBytes.toString('utf8'));if(original.analyticPrimitives01?.revision===analyticPrimitiveRevision01)return {index:file,indexSHA256:expectedIndexSHA256,reused:true,counts:original.analyticPrimitives01.counts};
 const rawBytes=fs.readFileSync(input);if(rawBytes.length>meshLimits.bytes)throw Error('Bounded retained normalizer required');const raw=JSON.parse(rawBytes.toString('utf8').replace(/^\uFEFF/,'')),updated=analyticIndex(raw,original,sha256(rawBytes));if(updated.analyticPrimitives01.counts.candidatePolygons===0)return {index:file,indexSHA256:expectedIndexSHA256,reused:true,reason:'no-analytic-candidates',counts:updated.analyticPrimitives01.counts,bytesWritten:0};updated.analyticDerivation01.baseIndexPath=file;updated.analyticDerivation01.baseIndexSHA256=expectedIndexSHA256;
 const bytes=Buffer.from(JSON.stringify(updated));if(bytes.length>67108864||bytes.length>maximumOutputBytes)throw Error('Compact analytic index byte budget');const hash=sha256(bytes),target=path.join(path.dirname(file),'index-analytic01-'+hash+'.json');let bytesWritten=0;
 if(fs.existsSync(target)){if(sha256(fs.readFileSync(target))!==hash)throw Error('Existing analytic upgrade differs');}
 else{const pending=target+'.pending-'+process.pid;fs.writeFileSync(pending,bytes,{flag:'wx'});fs.renameSync(pending,target);bytesWritten=bytes.length;}
 return {index:target,indexSHA256:hash,reused:false,baseIndexPath:file,baseIndexSHA256:expectedIndexSHA256,normalizedPath:path.resolve(input),normalizedSHA256:sha256(rawBytes),counts:updated.analyticPrimitives01.counts,bytesWritten,archiveDecoded:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.length!==4)throw Error('usage: node convert-collision.mjs <private-normalized.json> <existing-private-output-directory>');process.stdout.write(JSON.stringify(exportCollision(process.argv[2],process.argv[3]))+'\n');}
