// Background/control-host journal only. This supplies integrity, never acoustic
// authority. The caller retains its trusted digest independently of this store.
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {privateStoragePath} from '../research/research-private-storage.mjs';
import {canonical,decodeCanonical,byteDigest,freeze,identifier,requireWorld} from './contracts.mjs';
const cap=4194304,hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function record(value,keys){
 requireWorld(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'checkpoint plain data object');
 const own=Reflect.ownKeys(value);requireWorld(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)),'checkpoint exact fields');
 for(const key of own){const d=Object.getOwnPropertyDescriptor(value,key);requireWorld(d.enumerable&&Object.hasOwn(d,'value'),'checkpoint own data fields');}
}
export function validateStartupCheckpoint06(value){
 record(value,['schema','kind','catalogueId','catalogueDigest','build','cacheRevision','pages']);
 requireWorld(value.schema===1&&value.kind==='RichAudioStartupCheckpoint06'&&value.cacheRevision==='resource-cache04'&&hex(value.catalogueDigest),'checkpoint version/catalogue identity');identifier(value.catalogueId);identifier(value.build);
 const pages=value.pages;requireWorld(Array.isArray(pages)&&pages.length<=256&&Reflect.ownKeys(pages).length===pages.length+1,'checkpoint bounded dense page list');const seen=new Set(),clean=[];
 for(let i=0;i<pages.length;i++){
  const d=Object.getOwnPropertyDescriptor(pages,String(i));requireWorld(d?.enumerable&&Object.hasOwn(d,'value'),'checkpoint dense page data');const p=d.value;record(p,['pageId','inventoryDigest','artifacts']);identifier(p.pageId);
  requireWorld(!seen.has(p.pageId)&&hex(p.inventoryDigest),'checkpoint unique page identity');seen.add(p.pageId);const a=p.artifacts;requireWorld(a&&typeof a==='object'&&!Array.isArray(a)&&[Object.prototype,null].includes(Object.getPrototypeOf(a)),'checkpoint artifact map');
  const keys=Reflect.ownKeys(a);requireWorld(keys.length<=64,'checkpoint page artifact bound');const artifacts={};
  for(const k of keys){const descriptor=Object.getOwnPropertyDescriptor(a,k);requireWorld(hex(k)&&descriptor.enumerable&&Object.hasOwn(descriptor,'value')&&hex(descriptor.value),'checkpoint exact artifact digest pair');artifacts[k]=descriptor.value;}
  clean.push({pageId:p.pageId,inventoryDigest:p.inventoryDigest,artifacts});
 }
 const out={schema:1,kind:'RichAudioStartupCheckpoint06',catalogueId:value.catalogueId,catalogueDigest:value.catalogueDigest,build:value.build,cacheRevision:'resource-cache04',pages:clean};
 requireWorld(Buffer.byteLength(canonical(out))<=cap,'checkpoint payload byte bound');return freeze(out);
}
export function encodeStartupCheckpoint06(value){const payload=Buffer.from(canonical(validateStartupCheckpoint06(value)));return Buffer.concat([Buffer.from('RichAudio-Startup-Checkpoint\n1\n'+byteDigest(payload)+'\n'+payload.length+'\n'),payload]);}
export function decodeStartupCheckpoint06(bytes,expectedSHA256){
 requireWorld(hex(expectedSHA256)&&Buffer.isBuffer(bytes)&&bytes.length<=cap+160&&byteDigest(bytes)===expectedSHA256,'independently pinned bounded checkpoint bytes');let at=0;const h=[];
 for(let i=0;i<4;i++){const end=bytes.indexOf(10,at);requireWorld(end>=at&&end-at<100,'checkpoint envelope');h.push(bytes.subarray(at,end).toString('ascii'));at=end+1;}
 const payload=bytes.subarray(at);requireWorld(h[0]==='RichAudio-Startup-Checkpoint'&&h[1]==='1'&&h[2]===byteDigest(payload)&&h[3]===String(payload.length),'checkpoint version/length/checksum');return validateStartupCheckpoint06(decodeCanonical(payload,cap));
}
async function readExact(file,maximum){
 let handle;try{const before=await fs.lstat(file);requireWorld(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=maximum,'regular single-link bounded checkpoint');handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const s=await handle.stat();requireWorld(s.ino===before.ino&&s.dev===before.dev&&s.size===before.size&&s.nlink===1,'checkpoint open identity');
  const bytes=Buffer.alloc(s.size+1);let n=0;while(n<bytes.length){const r=await handle.read(bytes,n,bytes.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
  const after=await handle.stat(),current=await fs.lstat(file);requireWorld(n===s.size&&after.ino===s.ino&&after.dev===s.dev&&after.size===s.size&&after.mtimeMs===s.mtimeMs&&after.nlink===1&&current.isFile()&&!current.isSymbolicLink()&&current.ino===s.ino&&current.dev===s.dev&&current.size===s.size&&current.mtimeMs===s.mtimeMs&&current.nlink===1,'checkpoint changed during read');return bytes.subarray(0,n);
 }finally{await handle?.close();}
}
export class StartupCheckpointStore06 {
 constructor({root,directory,maximumFiles=64,maximumBytes=67108864}={}){requireWorld(typeof root==='string'&&typeof directory==='string'&&Number.isInteger(maximumFiles)&&maximumFiles>=1&&maximumFiles<=64&&Number.isSafeInteger(maximumBytes)&&maximumBytes>=cap+160&&maximumBytes<=268435456,'checkpoint storage limits');this.root=path.resolve(root);this.directory=privateStoragePath(this.root,directory);this.maximumFiles=maximumFiles;this.maximumBytes=maximumBytes;this.writing=false;}
 file(sha256){requireWorld(hex(sha256),'checkpoint digest filename');return privateStoragePath(this.root,path.join(this.directory,sha256+'.rawarm06'));}
 async usage(){
  const directory=privateStoragePath(this.root,this.directory),s=await fs.lstat(directory);requireWorld(s.isDirectory()&&!s.isSymbolicLink(),'checkpoint private directory');let files=0,bytes=0;const reader=await fs.opendir(directory);
  try{while(true){const item=await reader.read();if(!item)break;requireWorld(++files<=this.maximumFiles+1,'checkpoint generation count');requireWorld(/^(?:[a-f0-9]{64}\.rawarm06|[a-f0-9-]{36}\.pending|\.writer\.lease)$/.test(item.name),'unexpected checkpoint directory member');const p=privateStoragePath(this.root,path.join(directory,item.name)),stat=await fs.lstat(p);requireWorld(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=cap+160,'checkpoint member type/size');if(item.name==='.writer.lease'){requireWorld(stat.size===36,'checkpoint writer lease');files--;continue;}bytes+=stat.size;requireWorld(bytes<=this.maximumBytes,'checkpoint disk byte quota');}}
  finally{await reader.close();}return {files,bytes};
 }
 async load(expectedSHA256){
  // No implicit latest/head scan. A digest in untrusted on-disk metadata cannot
  // promote itself into the independently retained control-host trust anchor.
  if(expectedSHA256===undefined||expectedSHA256===null)return null;
  const file=this.file(expectedSHA256);try{const bytes=await readExact(file,cap+160);privateStoragePath(this.root,file);return decodeStartupCheckpoint06(bytes,expectedSHA256);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 async save(snapshot){
  requireWorld(!this.writing,'one checkpoint writer');const bytes=encodeStartupCheckpoint06(snapshot),sha256=byteDigest(bytes),target=this.file(sha256);this.writing=true;let lease,pending;
  const token=randomUUID(),leasePath=privateStoragePath(this.root,path.join(this.directory,'.writer.lease'));
  try{
   const existing=await this.load(sha256);if(existing)return {sha256,bytes:bytes.length,state:'existing-exact-checkpoint',trust:'integrity-only-control-host-pin-required'};
   lease=await fs.open(leasePath,'wx');await lease.writeFile(token);const usage=await this.usage();requireWorld(usage.files<this.maximumFiles&&usage.bytes+bytes.length<=this.maximumBytes,'checkpoint disk quota');
   pending=privateStoragePath(this.root,path.join(this.directory,randomUUID()+'.pending'));const writer=await fs.open(pending,'wx');try{await writer.writeFile(bytes);await writer.sync();}finally{await writer.close();}
   await fs.link(pending,target);await fs.unlink(pending);pending=null;
   return {sha256,bytes:bytes.length,state:'published-checkpoint',trust:'integrity-only-control-host-pin-required'};
  }finally{
   try{if(lease){const held=await lease.stat(),current=await fs.lstat(leasePath);requireWorld(current.isFile()&&!current.isSymbolicLink()&&current.nlink===1&&current.ino===held.ino&&current.dev===held.dev&&current.size===36,'checkpoint writer lease changed; retained');const actual=await readExact(leasePath,36);requireWorld(actual.toString('utf8')===token,'checkpoint writer token changed; retained');await fs.unlink(leasePath);}}
   finally{await lease?.close();this.writing=false;} // Interrupted .pending files remain bounded evidence.
  }
 }
}
