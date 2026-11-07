// Internal storage for the existing installed-world reader. No independent
// mapping, source authority, observations or scene leases live in this cache.
import {performance} from 'node:perf_hooks';
import {decodeChunk,encodeChunk,transformPoint,triangleNormal,sha256} from './collision-mesh.mjs';
import {tessellateAnalyticPrimitive01} from './analytic-primitives01.mjs';
import {digest,freeze,requireWorld} from './contracts.mjs';
const limits01=Object.freeze({bytes:64*1024*1024,descriptorReserveBytes:8*512,componentOverhead:4096,boxedRecordBytes:4096});
const measured=(profile,key,operation)=>{const began=performance.now();try{return operation();}finally{if(profile)profile[key]+=performance.now()-began;}};
const intersects=(bounds,index,box)=>{const at=index*6;for(let axis=0;axis<3;axis++)if(bounds[at+axis]>box.max[axis]||bounds[at+3+axis]<box.min[axis])return false;return true;};
function packed01(bytes,records,metadata=null){
 const bounds=new Float64Array(records.length*6);
 for(let i=0;i<records.length;i++)for(let axis=0;axis<3;axis++){bounds[i*6+axis]=Math.min(...records[i].positions.map(p=>p[axis]));bounds[i*6+3+axis]=Math.max(...records[i].positions.map(p=>p[axis]));}
 return {bytes:Buffer.from(bytes),bounds,count:records.length,metadata};
}
export class InstalledStaticComponents01 {
 #entries=new Map();#handles=new WeakMap();#references=new WeakMap();#owners=new Map();#bytes=0;#serial=0;#events=[];#history=new Map();#revision=0;
 #totals={nativeHits:0,nativeMisses:0,analyticHits:0,analyticMisses:0,recordHits:0,recordMisses:0,admissions:0,byteEvictions:0,ownerInvalidations:0,integrityInvalidations:0,missesAfterByteEviction:0,missesAfterOwnerInvalidation:0,timelineDropped:0,maximumAccountedBytes:0};
 #event(value){this.#events.push({sequence:++this.#serial,...value,entries:this.#entries.size,accountedBytes:this.#bytes});if(this.#events.length>128){this.#events.shift();this.#totals.timelineDropped++;}}
 #remember(key,reason){this.#history.delete(key);this.#history.set(key,reason);while(this.#history.size>256)this.#history.delete(this.#history.keys().next().value);}
 #miss(key,owner,kind){const previous=this.#history.get(key),reusedAfterEviction=previous==='aggregate-byte-limit';if(reusedAfterEviction)this.#totals.missesAfterByteEviction++;else if(previous)this.#totals.missesAfterOwnerInvalidation++;if(kind!=='boxed-record-and-panel-template')this.#event({action:'miss',reason:previous??'first-component-use',id:key,ownerId:owner,kind,reusedAfterEviction});this.#history.delete(key);}
 #touch(key){const entry=this.#entries.get(key);if(entry){this.#entries.delete(key);this.#entries.set(key,entry);}return entry;}
 #drop(key,reason){const entry=this.#entries.get(key);if(!entry)return;this.#entries.delete(key);this.#bytes-=entry.charge;this.#remember(key,reason);this.#event({action:'remove',reason,id:key,ownerId:entry.owner,kind:entry.kind,removedBytes:entry.charge,ownerCascade:reason!=='aggregate-byte-limit'});}
 #admit(key,entry){
  requireWorld(Number.isSafeInteger(entry.charge)&&entry.charge>=0,'bounded immutable component accounting');
  if(entry.charge>limits01.bytes-limits01.descriptorReserveBytes){this.#event({action:'not-retained',reason:'component-exceeds-byte-budget',id:key,ownerId:entry.owner,kind:entry.kind,entryBytes:entry.charge});return;}
  while(this.#bytes+entry.charge>limits01.bytes-limits01.descriptorReserveBytes){this.#totals.byteEvictions++;this.#drop(this.#entries.keys().next().value,'aggregate-byte-limit');}
  this.#entries.set(key,entry);this.#bytes+=entry.charge;this.#totals.admissions++;this.#totals.maximumAccountedBytes=Math.max(this.#totals.maximumAccountedBytes,this.#bytes);this.#event({action:'admit',reason:'within-aggregate-byte-budget',id:key,ownerId:entry.owner,kind:entry.kind,entryBytes:entry.charge});
 }
 #handle(key,entry){const handle=Object.freeze({id:key,count:entry.data.count});this.#handles.set(handle,{key,entry});return handle;}
 activateOwner(owner){requireWorld(typeof owner==='string'&&!this.#owners.has(owner)&&this.#owners.size<16,'bounded new static resource owner');this.#owners.set(owner,{active:true});this.#revision++;}
 revision01(){return this.#revision;}
 #owner(owner){const token=this.#owners.get(owner);requireWorld(token?.active,'active static resource owner required');return token;}
 native(owner,chunk,bytes,profile){
  const ownerToken=this.#owner(owner),key=digest([owner,'native-chunk',chunk.id,chunk.sha256]),held=this.#touch(key);
  if(held){
   if(profile)profile.sha256Calls++;const current=measured(profile,'sha256Ms',()=>sha256(bytes));
   if(current!==chunk.sha256||bytes.length!==chunk.bytes){this.#totals.integrityInvalidations++;this.clearOwner(owner,'current-chunk-integrity-failed');throw Error('chunk integrity');}
   this.#totals.nativeHits++;this.#event({action:'hit',reason:'current-bytes-sha256-verified',id:key,ownerId:owner,kind:'native',entryBytes:held.charge,records:held.data.count});return this.#handle(key,held);
  }
  this.#totals.nativeMisses++;this.#miss(key,owner,'native');if(profile)profile.chunkDecodeCalls++;
  let records;try{records=measured(profile,'chunkDecodeIncludingSHA256Ms',()=>decodeChunk(bytes,chunk.sha256));requireWorld(records.length===chunk.count&&bytes.length===chunk.bytes,'chunk count/byte identity');}catch(error){this.#totals.integrityInvalidations++;this.clearOwner(owner,'current-chunk-integrity-failed');throw error;}
  const data=packed01(bytes,records),entry={owner,ownerToken,kind:'native',data,charge:data.bytes.byteLength+data.bounds.byteLength+limits01.componentOverhead};this.#admit(key,entry);return this.#handle(key,entry);
 }
 analytic(owner,primitive,controls,profile){
  const ownerToken=this.#owner(owner),key=digest([owner,'analytic-primitive',primitive,controls]),held=this.#touch(key);
  if(held){this.#totals.analyticHits++;this.#event({action:'hit',reason:'same-source-and-exact-approximation-controls',id:key,ownerId:owner,kind:'analytic',entryBytes:held.charge,records:held.data.count});return {handle:held.data.count?this.#handle(key,held):null,metadata:held.data.metadata};}
  this.#totals.analyticMisses++;this.#miss(key,owner,'analytic');if(profile)profile.analyticTessellationCalls++;
  const approximation=measured(profile,'analyticTessellationMs',()=>tessellateAnalyticPrimitive01(primitive,controls)),records=approximation.triangles??[],metadata=freeze({...approximation,triangles:undefined,triangleCount:records.length}),data=packed01(encodeChunk(records),records,metadata),entry={owner,ownerToken,kind:'analytic',data,charge:data.bytes.byteLength+data.bounds.byteLength+limits01.componentOverhead};this.#admit(key,entry);return {handle:records.length?this.#handle(key,entry):null,metadata};
 }
 select(handle,box){const held=this.#handles.get(handle);requireWorld(held,'owned static component handle');const refs=[];for(let index=0;index<held.entry.data.count;index++)if(intersects(held.entry.data.bounds,index,box)){const ref=Object.freeze({componentId:held.key,recordIndex:index});this.#references.set(ref,{...held,index});refs.push(ref);}return refs;}
 distance(ref,point){const held=this.#references.get(ref);requireWorld(held,'owned static triangle reference');const {bytes}=held.entry.data,at=24+held.index*96;let best=Infinity;for(let vertex=0;vertex<3;vertex++)best=Math.min(best,Math.hypot(...[0,1,2].map(axis=>bytes.readDoubleLE(at+vertex*24+axis*8)-point[axis])));return best;}
 identity(ref){const held=this.#references.get(ref);requireWorld(held,'owned static triangle reference');const at=24+held.index*96;return {node:held.entry.data.bytes.readUInt32LE(at+76),polygon:held.entry.data.bytes.readUInt32LE(at+80)};}
 bounds(ref){const held=this.#references.get(ref);requireWorld(held,'owned static triangle reference');const at=held.index*6,b=held.entry.data.bounds;return {min:[b[at],b[at+1],b[at+2]],max:[b[at+3],b[at+4],b[at+5]]};}
 triangle(ref,resourceId,placement=null){
  const held=this.#references.get(ref);requireWorld(held,'owned static triangle reference');const key=digest([held.key,'boxed-static-record',held.index,resourceId,...(placement?[placement.key]:[])]),active=held.entry.ownerToken.active&&this.#owners.get(held.entry.owner)===held.entry.ownerToken,cached=active?this.#touch(key):null;if(cached){this.#totals.recordHits++;return cached.data;}
  this.#totals.recordMisses++;this.#miss(key,held.entry.owner,'boxed-record-and-panel-template');const {bytes,metadata}=held.entry.data,at=24+held.index*96,local=[0,1,2].map(v=>[0,1,2].map(axis=>bytes.readDoubleLE(at+v*24+axis*8))),
   positions=placement?local.map(v=>transformPoint(v,placement.matrix)):local,record={positions,normal:triangleNormal(positions)};for(const [i,name]of ['materialType','node','polygon','data1','data2','materialSlot'].entries())record[name]=bytes.readUInt32LE(at+72+i*4);
  if(metadata?.state==='approximated-analytic'){record.primitiveFamily=metadata.family;record.analyticFace=held.index;record.approximationErrorMetres=metadata.maximumErrorMetres;}
  freeze(record);if(active)this.#admit(key,{owner:held.entry.owner,ownerToken:held.entry.ownerToken,kind:'boxed-record-and-panel-template',data:record,charge:limits01.boxedRecordBytes});return record;
 }
 clearOwner(owner,reason='owner-binding-invalidated'){this.#revision++;const token=this.#owners.get(owner);if(token)token.active=false;this.#owners.delete(owner);const keys=[...this.#entries].filter(([,e])=>e.owner===owner).map(([key])=>key);if(keys.length)this.#totals.ownerInvalidations++;for(const key of keys)this.#drop(key,reason);}
 clear(reason='world-binding-invalidated'){this.#revision++;for(const token of this.#owners.values())token.active=false;this.#owners.clear();for(const key of [...this.#entries.keys()])this.#drop(key,reason);}
 profile(){return {...this.#totals,entries:this.#entries.size,activeOwners:this.#owners.size,maximumOwners:16,accountedBytes:this.#bytes,maximumBytes:limits01.bytes,descriptorReserveBytes:limits01.descriptorReserveBytes,componentOverheadBytes:limits01.componentOverhead,boxedRecordBytes:limits01.boxedRecordBytes};}
 timeline(){return freeze({schema:1,historyLimit:128,tombstoneLimit:256,retainedTombstones:this.#history.size,events:structuredClone(this.#events),profile:this.profile()});}
}
