import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {matchInteriorInstance01} from '../../src/acoustics/world/interior-activation01.mjs';
import {interiorInstanceIdentities01} from '../../src/acoustics/world/interior-placements-completion01.mjs';
import {atlasFormat01,atlasClasses01,atlasCellSize01,atlasPageTriangles01,atlasVertexStride01,atlasHeaderBytes01} from './ui/atlas-format01.mjs';

const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const requireAtlas=(ok,why)=>{if(!ok)throw Error(why);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const isBounds=b=>b&&['min','max'].every(k=>b[k]?.length===3&&b[k].every(Number.isFinite))&&b.min.every((v,i)=>v<=b.max[i]);
const length=(n,max)=>Number.isSafeInteger(n)&&n>0&&n<=max;
const maxBinary=16*1048576;
const fileShape=(p,max)=>p&&length(p.bytes,max)&&hex(p.sha256);
const protectedRoot=p=>path.resolve(p).split(path.sep).includes('.local');

export async function configuredWorldAtlas01(workspace){
 const privateRoot=path.resolve(workspace,'.local'),pointer=path.join(privateRoot,'soundmap','world-atlas.json');
 let stat;try{stat=await fs.lstat(pointer);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 requireAtlas(stat.isFile()&&stat.nlink===1&&stat.size>0&&stat.size<=4096&&await fs.realpath(pointer)===pointer,'Bounded private atlas pointer required');
 const bytes=await fs.readFile(pointer);
 requireAtlas(bytes.length===stat.size,'Incomplete private atlas pointer');
 const {file,sha256}=JSON.parse(bytes),absolute=typeof file==='string'?path.resolve(privateRoot,file):'';
 requireAtlas(absolute.startsWith(privateRoot+path.sep)&&hex(sha256),'Atlas pointer must bind a private manifest');
 return {file:absolute,sha256};
}

async function readPinned(file,sha,maximum,exact){
 requireAtlas(await fs.realpath(file)===file,'Linked atlas path refused');
 const fd=await fs.open(file,'r');
 try{
  const before=await fd.stat({bigint:true});
  requireAtlas(before.isFile()&&before.nlink===1n&&before.size>0n&&before.size<=BigInt(maximum)&&(!exact||before.size===BigInt(exact)),'Invalid atlas file size or identity');
  const bytes=await fd.readFile(),after=await fd.stat({bigint:true}),named=await fs.lstat(file,{bigint:true});
  requireAtlas(bytes.length===Number(before.size)&&[after,named].every(s=>s.isFile()&&s.nlink===1n&&s.size===before.size&&s.dev===before.dev&&s.ino===before.ino&&s.mtimeNs===before.mtimeNs&&s.ctimeNs===before.ctimeNs)&&hash(bytes)===sha,'Atlas byte or file identity mismatch');
  return bytes;
 }finally{await fd.close();}
}

export async function openWorldAtlas01({file,sha256,installedContext=null,sourceReceipt=null,now=Date.now}){
 const started=performance.now(),absolute=path.resolve(file);
 requireAtlas(path.basename(absolute)==='atlas.json'&&protectedRoot(absolute)&&hex(sha256),'Exact private atlas and manifest SHA-256 required');
 const root=path.dirname(absolute),bytes=await readPinned(absolute,sha256,32*1048576),a=JSON.parse(bytes);
 requireAtlas(a.format===atlasFormat01&&a.scope==='retained-partial-collision-only'&&a.coordinateSpace==='gta-native-unscaled'&&a.rendererAdmission===false&&
  a.acousticWorldComplete===false&&a.cellSize===atlasCellSize01&&isBounds(a.bounds)&&JSON.stringify(a.classes)===JSON.stringify(atlasClasses01)&&
  ['manifestSHA256','catalogSHA256','auditSHA256','gameExecutableSHA256','codeWalkerCoreSHA256','importerSHA256','geometryDecoderSHA256'].every(k=>hex(a.identity?.[k]))&&
  length(a.counts?.resources,262144)&&Array.isArray(a.tiles)&&length(a.tiles.length,65536)&&Array.isArray(a.overview)&&length(a.overview.length,256),'Unsupported atlas format or source binding');
 if(installedContext)requireAtlas(a.identity.catalogSHA256===installedContext.catalogSHA256&&a.identity.gameExecutableSHA256===installedContext.expectedGameSHA256&&a.identity.proofEpoch===installedContext.proofEpoch,'Atlas does not match the configured game, catalogue and proof epoch');
 let interiors=null;
 if(sourceReceipt){
  requireAtlas(installedContext&&sourceReceipt.proofEpoch===a.identity.proofEpoch,'Atlas does not match the session source epoch');
  await readPinned(path.resolve(installedContext.manifestPath),a.identity.manifestSHA256,128*1048576);
  const catalogue=await readPinned(path.resolve(installedContext.catalogPath),a.identity.catalogSHA256,128*1048576);
  interiors=interiorInstanceIdentities01(JSON.parse(catalogue.toString('utf8').replace(/^\uFEFF/,'')));
 }
 requireAtlas(a.provenance?.name==='provenance.json'&&fileShape(a.provenance,128*1048576),'Atlas provenance binding missing');
 const {resources,owners}=JSON.parse(await readPinned(path.join(root,a.provenance.name),a.provenance.sha256,128*1048576,a.provenance.bytes));
 requireAtlas(resources?.length===a.counts.resources&&Array.isArray(owners)&&length(owners.length,262144),'Atlas provenance denominator');
 const instanceOwners=new Map(),files=new Map(),tiles=new Map();
 for(const [id,o] of owners.entries()){
  const r=resources[o.resource];
  requireAtlas(r?.owners?.includes(id)&&Number.isInteger(o.class)&&o.class>=0&&o.class<atlasClasses01.length&&(!o.bounds||isBounds(o.bounds))&&Array.isArray(o.unknown),'Atlas owner binding');
  if(!o.instance)continue;
  requireAtlas(typeof o.instance==='string'&&/^0x[a-f0-9]{8}$/.test(o.archetype)&&o.matrix?.length===16&&o.matrix.every(Number.isFinite),'Atlas interior binding');
  if(!instanceOwners.has(o.instance)){
   instanceOwners.set(o.instance,[]);
  }else{
   const first=owners[instanceOwners.get(o.instance)[0]];
   requireAtlas(first.archetype===o.archetype&&first.matrix.every((n,i)=>n===o.matrix[i]),'Inconsistent atlas interior identity');
  }
  instanceOwners.get(o.instance).push(id);
 }
 const packOffsets=a.overview.map((f,i)=>{requireAtlas(f.name==='overview_'+i+'.ram'&&fileShape(f,maxBinary),'Atlas overview binding');files.set(f.name,f);return 0;});
 for(const t of a.tiles){
  requireAtlas(/^-?\d+_-?\d+$/.test(t.id)&&!tiles.has(t.id)&&isBounds(t.bounds)&&t.pages?.length===3&&
   Array.isArray(t.owners)&&t.owners.every(i=>Number.isSafeInteger(i)&&owners[i]),'Atlas tile index binding');
  tiles.set(t.id,t);
  for(const [lod,pages] of t.pages.entries()){
   requireAtlas(Array.isArray(pages)&&length(pages.length,4096),'Incomplete atlas level');
   for(const [i,p] of pages.entries()){
    requireAtlas(p.name===t.id+'_'+lod+'_'+i+'.ram'&&fileShape(p,maxBinary)&&length(p.triangles,atlasPageTriangles01)&&
     length(p.vertices,p.triangles*3)&&p.gpuBytes===p.vertices*atlasVertexStride01+p.triangles*12&&p.bytes>=p.gpuBytes+atlasHeaderBytes01+12&&
     p.bytes<=p.gpuBytes+atlasHeaderBytes01+p.triangles*12,'Atlas indexed page binding');
    if(lod===0){
     requireAtlas(Number.isSafeInteger(p.pack)&&p.pack>=0&&p.pack<packOffsets.length&&p.offset===packOffsets[p.pack],'Noncontiguous atlas overview');
     packOffsets[p.pack]+=p.bytes;
    }else files.set(p.name,p);
   }
  }
  requireAtlas(t.pages[2].reduce((n,p)=>n+p.triangles,0)===t.triangles,'Atlas detailed triangle count');
 }
 requireAtlas(packOffsets.every((n,i)=>n===a.overview[i].bytes),'Atlas overview pack size');
 const publicIndex={...a,tiles:a.tiles.map(({owners,...t})=>({...t,ownerCount:owners.length}))};
 const index=Buffer.from(JSON.stringify(publicIndex));
 const io={inFlight:0,reads:0,servedBytes:0,failures:0,maximumReadMs:0,lastFailure:null};
 function proof(){
  if(!sourceReceipt)return {state:'retained-source-proof-only',live:false,epoch:a.identity.proofEpoch};
  return {state:now()<sourceReceipt.stopAt?'session-archive-identities-matched':'session-source-receipt-expired',
   live:now()<sourceReceipt.stopAt,epoch:a.identity.proofEpoch,checkedAt:sourceReceipt.checkedAt,stopAt:sourceReceipt.stopAt,
   archiveIdentities:sourceReceipt.archiveCount,archiveContentBytesRead:0};
 }
 const startupMs=performance.now()-started;
 return {index,sha256,
  status:()=>({format:a.format,sha256,identity:a.identity,proof:proof(),startupMs,io:{...io},
   residentNodeMiB:Math.round(process.memoryUsage.rss()/1048576),rendererAdmission:false}),
  context(frame){
   const source=proof(),c=frame?.worldContext01;
   const remaining=c?.interior?c.interior.durationMs-(now()-frame.producedAtUnixMs):0;
   const current=source.live&&c?.interior&&remaining>0&&c.catalogue===a.identity.catalogSHA256&&c.epoch===source.epoch;
   const id=current?matchInteriorInstance01(interiors,{...c.interior,session:c.ownerSession,generation:c.generation,catalogSHA256:c.catalogue},
    {session:c.ownerSession,generation:c.generation,catalogSHA256:a.identity.catalogSHA256,epoch:source.epoch}):null;
   const bound=id&&instanceOwners.get(id);
   const instance=bound?{id,ownerCount:bound.length,proxy:c.interior.proxy,remainingMs:remaining}:null;
   return {state:'persistent-atlas',authority:'static-visual-context-only',rendererAdmission:false,tiles:[],proof:source,interiorOutcome:c?.interiorOutcome??null,
    interior:instance,portalState:instance?'unknown':null};
  },
  coverage(tile){
   const t=tiles.get(tile);if(!t)return null;
   const entries=t.owners.map(i=>{const o=owners[i],r=resources[o.resource];return {id:r.id,entry:r.entry,archive:r.archive,archiveSHA256:r.archiveSHA256,sourceSHA256:r.sourceSHA256,
    indexSHA256:r.indexSHA256,receiptSHA256:r.receiptSHA256,historicalProofEpoch:r.historicalProofEpoch,
    activation:r.activation,layer:r.layer,conditions:r.conditions,coverage:r.coverage,class:a.classes[o.class],instance:o.instance,bounds:o.bounds,
    unsupported:o.unknown.length,unlocalizedUnsupported:o.unknown.filter(x=>!x.bounds).length,portals:o.portals};});
   const regions=t.owners.flatMap(i=>owners[i].unknown.filter(x=>x.bounds&&x.bounds.min.every((v,j)=>v<=t.bounds.max[j]&&x.bounds.max[j]>=t.bounds.min[j])));
   return {entries,regionCount:regions.length,regions:regions.slice(0,128),regionDisplayLimited:regions.length>128};
  },
  async mesh(name){
   const f=files.get(name);if(!f)return {code:404,error:'Unknown atlas page'};
   if(io.inFlight>=8)return {code:503,error:'Atlas read concurrency limit'};
   io.inFlight++;const at=performance.now();
   try{const b=await readPinned(path.join(root,f.name),f.sha256,maxBinary,f.bytes);io.reads++;io.servedBytes+=b.length;return {bytes:b};}
   catch(e){io.failures++;io.lastFailure={name,phase:'read-and-verify-atlas-page',error:e.code??e.message};return {code:422,error:'Atlas page unavailable or failed integrity'};}
   finally{io.inFlight--;io.maximumReadMs=Math.max(io.maximumReadMs,performance.now()-at);}
  }
 };
}
