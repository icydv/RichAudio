// A bounded catalogue of already qualified inventory pages. This is neither
// installation discovery nor a claim that those pages cover the actual world.
import {isResourceInventory04,inventoryLimits04} from './resource-inventory04.mjs';
import {bounds,canonical,digest,fields,freeze,identifier,requireWorld} from './contracts.mjs';
const catalogues=new WeakSet();
export const startupLimits06=Object.freeze({pages:256,tilesPerPage:64,tiles:16384,metadataBytes:4194304,unknownRegions:256,residentTiles:8,parallelWorkers:1});
export function boundedStartupMetadata06(value,maximumBytes=startupLimits06.metadataBytes){
 let entries=0,minimum=0;
 const add=n=>{minimum+=n;requireWorld(minimum<=maximumBytes,'bounded startup metadata exact UTF8 bytes');};
 function stringBytes(text){let count=2;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c===34||c===92)count+=2;else if(c<32)count+=[8,9,10,12,13].includes(c)?2:6;else if(c<128)count++;else if(c<2048)count+=2;else if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){count+=4;i++;}else count+=6;}else if(c>=0xdc00&&c<=0xdfff)count+=6;else count+=3;requireWorld(count+minimum<=maximumBytes,'bounded startup metadata exact UTF8 text');}return count;}
 function visit(v,depth){
  requireWorld(depth<=16&&++entries<=1000000,'bounded startup metadata structure');
  if(v===null){add(4);return;}
  if(typeof v==='string'){add(stringBytes(v));return;}
  if(typeof v==='number'){requireWorld(Number.isFinite(v),'finite startup metadata');add(String(v).length);return;}
  if(typeof v==='boolean'){add(v?4:5);return;}
  requireWorld(v&&typeof v==='object','plain startup metadata');const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  requireWorld(array?proto===Array.prototype:proto===Object.prototype||proto===null,'plain startup metadata containers');
  const keys=Reflect.ownKeys(v);requireWorld(keys.length<=16385&&(!array||v.length<=16384),'bounded startup metadata fields');
  if(array)requireWorld(keys.length===v.length+1&&keys.every(k=>k==='length'||typeof k==='string'&&/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<v.length),'dense startup metadata arrays');
  add(2+Math.max(0,keys.length-(array?1:0)-1));
  for(const k of keys){if(array&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);requireWorld(typeof k==='string'&&d.enumerable&&Object.hasOwn(d,'value')&&!['__proto__','prototype','constructor'].includes(k),'startup metadata data properties only');if(!array)add(stringBytes(k)+1);visit(d.value,depth+1);}
 }
 visit(value,0);const encoded=Buffer.from(canonical(value));requireWorld(encoded.length<=maximumBytes,'bounded encoded startup metadata');return encoded;
}
export function sealStartupCatalogue06({catalogueId,pages,discovery}={}){
 identifier(catalogueId);boundedStartupMetadata06(discovery,131072);fields(discovery,['sealed','totalKnown','basis','unknownRegions']);
 requireWorld(typeof discovery.sealed==='boolean'&&discovery.totalKnown===discovery.sealed&&discovery.basis==='explicit-qualified-inventory-pages'&&Array.isArray(discovery.unknownRegions)&&discovery.unknownRegions.length<=startupLimits06.unknownRegions,'explicit discovery closure and unknown regions');
 const unknownIds=new Set(),unknownRegions=discovery.unknownRegions.map(r=>{fields(r,['id','bounds','reason']);identifier(r.id);requireWorld(!unknownIds.has(r.id)&&typeof r.reason==='string'&&r.reason.length>0&&r.reason.length<=160,'unique bounded unknown region');unknownIds.add(r.id);return {id:r.id,bounds:r.bounds===null||r.bounds===undefined?null:bounds(r.bounds),reason:r.reason};});
 requireWorld(Array.isArray(pages)&&pages.length>0&&pages.length<=startupLimits06.pages&&Reflect.ownKeys(pages).length===pages.length+1,'bounded dense qualified catalogue pages');
 const pageIds=new Set(),tileIds=new Set(),effective=new Map(),mounts=new Map(),mountOrders=new Map(),spatialCells=new Map();let build=null,comparisons=0;
 const descriptors=[];
 for(let index=0;index<pages.length;index++){
  const data=Object.getOwnPropertyDescriptor(pages,String(index));requireWorld(data?.enumerable&&Object.hasOwn(data,'value'),'catalogue page data elements');const page=data.value;
  requireWorld(page&&[Object.prototype,null].includes(Object.getPrototypeOf(page))&&Reflect.ownKeys(page).length===2&&Reflect.ownKeys(page).every(k=>['pageId','inventory'].includes(k)&&Object.getOwnPropertyDescriptor(page,k)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(page,k),'value')),'exact own catalogue page data');fields(page,['pageId','inventory']);identifier(page.pageId);requireWorld(!pageIds.has(page.pageId)&&isResourceInventory04(page.inventory),'unique qualified inventory page');pageIds.add(page.pageId);
  const inventory=page.inventory;build??=inventory.build;requireWorld(inventory.build===build&&inventory.tilePlans.length>0&&inventory.tilePlans.length<=inventoryLimits04.tiles,'consistent bounded catalogue build');
  // Independent pages must agree about a repeated effective logical member.
  // Global installed mount discovery remains an upstream qualification task.
  for(const r of inventory.effective){const key=r.path,identity=digest({path:r.path,kind:r.kind,sha256:r.sha256,bytes:r.bytes,mount:r.mount,order:r.order,deleted:r.deleted,supported:r.supported,dependencies:r.dependencies});requireWorld(!effective.has(key)||effective.get(key)===identity,'conflicting effective member across catalogue pages');effective.set(key,identity);}
  for(const p of inventory.tilePlans)for(const m of p.manifest.mounts){const old=mounts.get(m.id);requireWorld(!old||canonical(old)===canonical(m),'conflicting mount identity/order across catalogue pages');requireWorld(!mountOrders.has(m.order)||mountOrders.get(m.order)===m.id,'ambiguous cross-page mount order');mounts.set(m.id,m);mountOrders.set(m.order,m.id);}
  const tiles=inventory.tilePlans.map(p=>{requireWorld(!tileIds.has(p.tileId),'unique catalogue tile identity');tileIds.add(p.tileId);
   const cells=[],candidates=new Set();for(let x=Math.floor(p.bounds.min[0]/128);x<=Math.floor(p.bounds.max[0]/128);x++)for(let y=Math.floor(p.bounds.min[1]/128);y<=Math.floor(p.bounds.max[1]/128);y++)for(let z=Math.floor(p.bounds.min[2]/128);z<=Math.floor(p.bounds.max[2]/128);z++){const key=x+','+y+','+z;cells.push(key);for(const other of spatialCells.get(key)??[])candidates.add(other);}
   for(const other of candidates){requireWorld(++comparisons<=1000000,'catalogue spatial validation comparison budget');requireWorld(!p.bounds.min.every((v,i)=>p.bounds.max[i]>other.bounds.min[i]&&v<other.bounds.max[i]),'overlapping tile interiors across catalogue pages');}
   for(const key of cells){const bucket=spatialCells.get(key)??[];bucket.push(p);spatialCells.set(key,bucket);}
   return {tileId:p.tileId,planDigest:p.planDigest,bounds:p.bounds,eligible:p.unknown.length===0,unknownCount:p.unknown.length,unknownReasons:[...new Set(p.unknown.map(u=>u.reason))],dependencyIds:p.dependencies.map(d=>d.id),dependencyDigest:digest(p.dependencies),inputFormat:p.inputFormat??'rsc7',layout:p.layout};});
  descriptors.push({pageId:page.pageId,inventoryDigest:inventory.inventoryDigest,tiles});
 }
 requireWorld(tileIds.size<=startupLimits06.tiles,'bounded complete declared tile catalogue');
 const body={schema:1,kind:'RichAudioStartupCatalogue06',catalogueId,build,pages:descriptors,mounts:[...mounts.values()].map(m=>({...m,family:'not-retained-by-inventory04'})),discovery:{sealed:discovery.sealed,totalKnown:discovery.totalKnown,basis:discovery.basis,unknownRegions},totalTiles:tileIds.size,eligibleTiles:descriptors.reduce((n,p)=>n+p.tiles.filter(t=>t.eligible).length,0),qualification:'explicit-qualified-inventory-pages-only',actualWorldCoverage:'unmeasured',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false};
 boundedStartupMetadata06(body);const result=freeze({...body,catalogueDigest:digest(body)});catalogues.add(result);return result;
}
export const isStartupCatalogue06=value=>catalogues.has(value);
