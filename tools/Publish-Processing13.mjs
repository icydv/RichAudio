// Publication copies only. Never rewrite an original measured report.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),local=path.resolve(root,'.local');
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,why)=>{if(!ok)throw Error(why);};
async function noLinks(file){for(let at=path.resolve(file);;at=path.dirname(at)){need(!(await fs.lstat(at)).isSymbolicLink(),'publication links refused');if(at===path.dirname(at))break;}}
export async function readPublicationOriginal13(handle,expectedBytes){
 need(Number.isSafeInteger(expectedBytes)&&expectedBytes>=0&&expectedBytes<=160*1024*1024,'bounded publication allocation required');const bytes=Buffer.allocUnsafe(expectedBytes+1);let at=0;
 while(at<=expectedBytes){const requested=Math.min(65536,bytes.length-at),read=await handle.read(bytes,at,requested,at);need(Number.isInteger(read.bytesRead)&&read.bytesRead>=0&&read.bytesRead<=requested,'invalid publication read');if(!read.bytesRead)break;at+=read.bytesRead;need(at<=expectedBytes,'original publication input grew');}
 need(at===expectedBytes,'original publication input truncated');return bytes.subarray(0,at);
}
export function sanitizePublication13(value,prefixes=[root,process.env.USERPROFILE]){
 if(typeof value==='string'){
  for(const [index,prefix]of prefixes.entries())if(prefix){const escaped=prefix.replace(/[\\/]+$/,'').split(/[\\/]+/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\\\/]+');value=value.replace(new RegExp(escaped,'gi'),index===0?'<repo>':'<user>');}
  return value;
 }
 if(Array.isArray(value))return value.map(v=>sanitizePublication13(v,prefixes));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitizePublication13(v,prefixes)]));
 return value;
}
export async function publishProcessing13(destination,names){
 destination=path.resolve(destination);need(destination.startsWith(local+path.sep)&&path.basename(destination)==='artifact','owned publication directory required');await noLinks(destination);
 need(Array.isArray(names)&&names.length<=16&&new Set(names).size===names.length&&names.every(n=>/^(?:world13-ci-[\w-]+|world1[0-3]-(?:retention|lifecycle)-control-[\w-]+)\.json$/.test(n)),'bounded exact original report names required');
 const records=[];let total=0,publishedTotal=0;
 try{for(const name of names){
  const source=path.join(local,name);await noLinks(source);const handle=await fs.open(source,'r');let original,originalSha256;
  const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
  try{const before=await handle.stat({bigint:true});need(before.isFile()&&before.nlink===1n&&before.size<=160n*1024n*1024n,'bounded single-link original JSON report required');total+=Number(before.size);need(total<=512*1024*1024,'publication total byte bound');original=await readPublicationOriginal13(handle,Number(before.size));need(same(before,await handle.stat({bigint:true}))&&same(before,await fs.lstat(source,{bigint:true})),'original publication input changed');originalSha256=sha(original);
   const sanitized=Buffer.from(JSON.stringify(sanitizePublication13(JSON.parse(original)),null,2)+'\n');publishedTotal+=sanitized.length;need(sanitized.length<=160*1024*1024&&publishedTotal<=512*1024*1024,'publication output byte bound');const publishedName='published-'+name;
   const digest=createHash('sha256'),buffer=Buffer.alloc(65536);let at=0;for(;;){const read=await handle.read(buffer,0,buffer.length,at);if(!read.bytesRead)break;at+=read.bytesRead;need(at<=original.length,'original publication input grew');digest.update(buffer.subarray(0,read.bytesRead));}
   need(digest.digest('hex')===originalSha256&&same(before,await handle.stat({bigint:true}))&&same(before,await fs.lstat(source,{bigint:true})),'original report changed during publication');await fs.writeFile(path.join(destination,publishedName),sanitized,{flag:'wx'});records.push({originalName:name,originalBytes:original.length,originalSha256,publishedName,publishedBytes:sanitized.length,publishedSha256:sha(sanitized)});
  }finally{await handle.close();}
 }}catch(error){const failed={kind:'World13ProcessingPublicationFailure',qualifiedCopies:records,requestedNames:names,failed:true,failure:sanitizePublication13(error.message),originalsNotRewritten:true};try{await fs.writeFile(path.join(destination,'processing-publication-failed.json'),JSON.stringify(failed,null,2)+'\n',{flag:'wx'});}catch{}throw error;}
 const manifest={kind:'World13ProcessingPublication',schema:1,records,sourceReportsUnchanged:true,transformation:'JSON string values redact owned checkout and user-profile prefixes, including slash variants. Original bytes remain privately preserved. Timing, PCM hashes, numeric values and gate booleans are unchanged.',publisherSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
 await fs.writeFile(path.join(destination,'processing-publication.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await publishProcessing13(process.argv[2],JSON.parse(process.argv[3]));console.log(JSON.stringify({kind:result.kind,reports:result.records.length,sourceReportsUnchanged:true}));}catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
