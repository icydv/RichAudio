// Local ignored storage only. This module imports no fitting or game adapter.
import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {privateStoragePath as privatePath} from './research-private-storage.mjs';
import {validateTile,validateWorld,canonical,digest,loadedView,freeze,cacheLimits} from './world-cache-format.mjs';
function safeDepth(text){let depth=0,string=false,escaped=false;for(const c of text){if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{'||c==='['){if(++depth>16)throw Error('JSON nesting bound');}else if(c==='}'||c===']')depth--;}if(depth!==0||string)throw Error('incomplete JSON');}
const hash=b=>createHash('sha256').update(b).digest('hex');
export function encodeTile(tile){validateTile(tile);const body=Buffer.from(canonical(tile),'utf8');const head=Buffer.from('RichAudio-Acoustic-Tile\n1\n'+hash(body)+'\n'+body.length+'\n','ascii');if(head.length+body.length>cacheLimits.bytes)throw Error('cache file size limit');return Buffer.concat([head,body]);}
export function decodeTile(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>cacheLimits.bytes)throw Error('cache file size limit');let at=0;const lines=[];for(let i=0;i<4;i++){const end=buffer.indexOf(10,at);if(end<at||end-at>80)throw Error('cache header');lines.push(buffer.subarray(at,end).toString('ascii'));at=end+1;}
 const body=buffer.subarray(at);if(lines[0]!=='RichAudio-Acoustic-Tile'||lines[1]!=='1'||!/^[a-f0-9]{64}$/.test(lines[2])||!/^[0-9]{1,6}$/.test(lines[3])||Number(lines[3])!==body.length||hash(body)!==lines[2])throw Error('cache checksum/version/length');
 const text=body.toString('utf8');if(!Buffer.from(text,'utf8').equals(body))throw Error('invalid UTF8');safeDepth(text);const tile=JSON.parse(text,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))throw Error('unsafe key');return v;});validateTile(tile);return freeze(tile);
}
export class BoundedTileStore{
 constructor(root,directory,{maxFiles=16,maxBytes=cacheLimits.totalBytes,resident=4}={}){
  if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>64||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>16777216||!Number.isSafeInteger(resident)||resident<1||resident>16)throw Error('storage limits');
  this.root=path.resolve(root);this.directory=privatePath(root,directory);if(!fs.lstatSync(this.directory).isDirectory())throw Error('cache directory');this.maxFiles=maxFiles;this.maxBytes=maxBytes;this.maximumResident=resident;this.resident=new Map();
 }
 inventory(){privatePath(this.root,this.directory);const files=fs.readdirSync(this.directory);if(files.length>this.maxFiles)throw Error('storage file count exceeded');let bytes=0;for(const f of files){const p=privatePath(this.root,path.join(this.directory,f)),s=fs.lstatSync(p);if(!s.isFile())throw Error('unexpected cache entry');bytes+=s.size;}if(bytes>this.maxBytes)throw Error('storage byte budget exceeded');return {files:files.length,bytes};}
 put(tile,{interruptBeforePublish=false}={}){
  const encoded=encodeTile(tile),key=digest({world:tile.world,id:tile.id,payload:digest(tile)}),target=privatePath(this.root,path.join(this.directory,key+'.ratile'));const inventory=this.inventory();if(inventory.files>=this.maxFiles||inventory.bytes+encoded.length>this.maxBytes)throw Error('storage budget full');if(fs.existsSync(target))throw Error('immutable cache record exists');
  const temporary=privatePath(this.root,path.join(this.directory,randomUUID()+'.pending'));const descriptor=fs.openSync(temporary,'wx');try{fs.writeFileSync(descriptor,encoded);fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}if(interruptBeforePublish)return {key,published:false,bytes:encoded.length};
  // Atomic no-replace publication on the same filesystem; the temporary hard-link is
  // removed only after success. Interrupted .pending data is retained, never loaded.
  fs.linkSync(temporary,target);fs.unlinkSync(temporary);return {key,published:true,bytes:encoded.length};
 }
 get(key,currentWorld){
  const started=performance.now();try{validateWorld(currentWorld);if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('cache key');this.inventory();const file=privatePath(this.root,path.join(this.directory,key+'.ratile'));if(!fs.existsSync(file))return {status:'missing',reconstructionCalls:0,collisionQueries:0};const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>cacheLimits.bytes)throw Error('bounded cache file');
   const ioStart=performance.now(),bytes=fs.readFileSync(file),diskReadMs=performance.now()-ioStart,validationStart=performance.now(),tile=decodeTile(bytes);if(digest({world:tile.world,id:tile.id,payload:digest(tile)})!==key)throw Error('file identity mismatch');const view=loadedView(tile,currentWorld),validationMs=performance.now()-validationStart;
   this.resident.delete(key);this.resident.set(key,view);while(this.resident.size>this.maximumResident)this.resident.delete(this.resident.keys().next().value);
   const totalMs=performance.now()-started;return {status:view.knowledge==='invalid'?'incompatible':'loaded',view,bytes:bytes.length,diskReadMs,validationMs,guardAndBookkeepingMs:totalMs-diskReadMs-validationMs,totalMs,reconstructionCalls:0,collisionQueries:0};
  }catch(e){return {status:'rejected',reason:e.message,totalMs:performance.now()-started,reconstructionCalls:0,collisionQueries:0};}
 }
}
