import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {sha256,matrix} from '../../src/acoustics/world/collision-mesh.mjs';
import {loadCollisionResource} from '../../src/acoustics/world/collision-resource.mjs';
import {tessellateAnalyticPrimitive01} from '../../src/acoustics/world/analytic-primitives01.mjs';
import {atlasFormat01,atlasCellSize01,atlasPageTriangles01,atlasClasses01,atlasPageMagic01,atlasVertexStride01,atlasHeaderBytes01} from './ui/atlas-format01.mjs';

const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const freshBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
const recordBytes=44,spoolPage=recordBytes*2048;
const memory=()=>Math.round(process.memoryUsage.rss()/1048576);
function include(b,x,y,z){
 if(x<b.min[0])b.min[0]=x;if(y<b.min[1])b.min[1]=y;if(z<b.min[2])b.min[2]=z;
 if(x>b.max[0])b.max[0]=x;if(y>b.max[1])b.max[1]=y;if(z>b.max[2])b.max[2]=z;
}
function combine(b,a){include(b,...a.min);include(b,...a.max);}
function canonical(file){const p=path.resolve(file);assert(fs.realpathSync.native(p)===p,'Canonical unlinked private path required');return p;}
function rootPath(file){const p=canonical(file);assert(p.split(path.sep).includes('.local'),'Atlas inputs and output must stay private');return p;}
function inputPath(file,root){const p=path.resolve(file);assert(p.startsWith(root+path.sep),'Atlas input escaped the private root');canonical(p);return p;}
function read(file,maximum){const s=fs.lstatSync(file);assert(s.isFile()&&s.nlink===1&&s.size>0&&s.size<=maximum,'Bounded regular private file required');const b=fs.readFileSync(file);assert(b.length===s.size,'Incomplete private file read');return b;}
function json(file,expected){const b=read(file,128*1048576),sha=sha256(b);assert(!expected||expected===sha,'Pinned private JSON integrity');return {value:JSON.parse(b.toString('utf8').replace(/^\uFEFF/,'')),sha};}
function worldPoint(p,m){return m?[0,1,2].map(i=>p[0]*m[i]+p[1]*m[4+i]+p[2]*m[8+i]+m[12+i]):p;}
function worldBounds(b,m){if(!b)return null;if(!m)return b;const out=freshBounds();for(let i=0;i<8;i++)include(out,...worldPoint(b.min.map((v,j)=>i&(1<<j)?b.max[j]:v),m));return out;}

function encodePage(raw,count){
 const cap=1<<Math.ceil(Math.log2(count*6)),table=new Uint32Array(cap),mask=cap-1;
 const v=Buffer.allocUnsafe(count*3*atlasVertexStride01),idx=Buffer.allocUnsafe(count*12),owners=[];
 const words=new Uint32Array(v.buffer,v.byteOffset,v.byteLength/4),inWords=new Uint32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),out=new Uint32Array(idx.buffer,idx.byteOffset,idx.byteLength/4);
 let vertices=0,run=null;
 for(let t=0;t<count;t++){
  const p=t*11,tag=inWords[p+9],owner=inWords[p+10];
  if(run?.[2]===owner)run[1]++;else{run=[t,1,owner];owners.push(run);}
  for(let i=0;i<3;i++){
   const at=p+i*3,x=inWords[at],y=inWords[at+1],z=inWords[at+2];
   let slot=(Math.imul(x,0x85ebca6b)^Math.imul(y,0xc2b2ae35)^Math.imul(z,0x27d4eb2f)^Math.imul(tag,0x165667b1))>>>0;slot=(slot^(slot>>>16))&mask;
   let id;
   while(table[slot]){const k=(table[slot]-1)*4;if(words[k]===x&&words[k+1]===y&&words[k+2]===z&&words[k+3]===tag){id=table[slot]-1;break;}slot=(slot+1)&mask;}
   if(id===undefined){id=vertices++;table[slot]=id+1;const k=id*4;words[k]=x;words[k+1]=y;words[k+2]=z;words[k+3]=tag;}
   out[t*3+i]=id;
  }
 }
 const h=Buffer.alloc(atlasHeaderBytes01),runs=Buffer.allocUnsafe(owners.length*12);
 [atlasPageMagic01,vertices,count,owners.length].forEach((n,i)=>h.writeUInt32LE(n,i*4));
 owners.forEach((r,i)=>r.forEach((n,j)=>runs.writeUInt32LE(n,i*12+j*4)));
 return {bytes:Buffer.concat([h,v.subarray(0,vertices*atlasVertexStride01),idx,runs]),vertices,triangles:count,gpuBytes:vertices*atlasVertexStride01+idx.length};
}

// Reduced levels retain actual faces. Voxel/orientation/activation stratification
// never stitches independent walls together or fills a hole in source data.
function sample(raw,count,levels){
 const v=new Float32Array(raw.buffer,raw.byteOffset,count*11),tags=new Uint32Array(raw.buffer,raw.byteOffset,count*11);
 for(let i=0;i<count;i++){
  const p=i*11,x=(v[p]+v[p+3]+v[p+6])/3,y=(v[p+1]+v[p+4]+v[p+7])/3,z=(v[p+2]+v[p+5]+v[p+8])/3;
  const ux=v[p+3]-v[p],uy=v[p+4]-v[p+1],uz=v[p+5]-v[p+2],vx=v[p+6]-v[p],vy=v[p+7]-v[p+1],vz=v[p+8]-v[p+2];
  const a=Math.abs(uy*vz-uz*vy),b=Math.abs(uz*vx-ux*vz),c=Math.abs(ux*vy-uy*vx),area=Math.max(a,b,c),family=(tags[p+9]>>>24)*3+(area===a?0:area===b?1:2);
  for(const {step,faces} of levels){
   const key=(((Math.floor(x/step)+65536)*131072+Math.floor(y/step)+65536)*8192+Math.floor(z/step)+4096)*16+family;
   const old=faces.get(key);
   if(!old||old.area<area){const face=old?.face??Buffer.allocUnsafe(recordBytes);raw.copy(face,0,i*recordBytes,(i+1)*recordBytes);if(old)old.area=area;else faces.set(key,{area,face});}
  }
 }
}
function exportTile(directory,spool,tile,overviewStream){
 const levels=[{step:20,faces:new Map()},{step:4,faces:new Map()}],pages=[[],[],[]];
 const id=tile.id,size=fs.statSync(spool).size,fd=fs.openSync(spool,'r');
 const raw=Buffer.allocUnsafe(atlasPageTriangles01*recordBytes);
 function emit(data,count,lod){
  const {bytes,...shape}=encodePage(data,count),name=id+'_'+lod+'_'+pages[lod].length+'.ram';
  const descriptor={name,bytes:bytes.length,sha256:sha256(bytes),...shape};
  if(lod===0)overviewStream(bytes,descriptor);else fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
  pages[lod].push(descriptor);
 }
 try{
  for(let pos=0;pos<size;){const n=fs.readSync(fd,raw,0,Math.min(raw.length,size-pos),pos);assert(n>0&&n%recordBytes===0,'Incomplete tile spool');pos+=n;sample(raw,n/recordBytes,levels);emit(raw,n/recordBytes,2);}
 }finally{fs.closeSync(fd);}
 for(const [lod,{faces}] of levels.entries()){
  let n=0;for(const {face} of faces.values()){face.copy(raw,n++*recordBytes);if(n===atlasPageTriangles01){emit(raw,n,lod);n=0;}}if(n)emit(raw,n,lod);
 }
 return {...tile,owners:[...tile.owners].sort((a,b)=>a-b),pages};
}

export function buildSoundMapAtlas01({privateRoot,manifestPath,catalogPath,auditPath,out,expectedResources=10663,progress=()=>{}}){
 const began=performance.now(),root=rootPath(privateRoot),directory=path.resolve(out);
 assert(directory.startsWith(root+path.sep)&&canonical(path.dirname(directory))===path.dirname(directory),'Fresh private atlas output directory required');
 const {value:manifest,sha:manifestSHA256}=json(inputPath(manifestPath,root));
 const {value:catalog,sha:catalogSHA256}=json(inputPath(catalogPath,root),manifest.ResolvedCatalogSHA256);
 const {value:audit,sha:auditSHA256}=json(inputPath(auditPath,root));
 const binding=manifest.InputBinding;
 assert(manifest.Schema===1&&catalog.Schema===1&&catalog.Stage==='codewalker-resolved-installation-model'&&catalog.ParserErrorCount===0&&
  digest(catalogSHA256)&&digest(binding?.GameExecutableSHA256)&&digest(binding?.CodeWalkerCoreSHA256)&&digest(binding?.ImporterSourceSHA256)&&digest(binding?.GeometryDecoderSHA256)&&
  catalog.InputBinding.GameExecutableSHA256===binding.GameExecutableSHA256&&catalog.InputBinding.CodeWalkerCoreSHA256===binding.CodeWalkerCoreSHA256&&
  audit.executable?.sha256===binding.GameExecutableSHA256&&audit.executable?.matched===true&&
  manifest.Resources?.length===expectedResources&&audit.census?.length===expectedResources,'Retained effective world, audit and parser identities must agree');
 const selected=new Map(audit.census.map(r=>[r.id,r]));
 assert(selected.size===expectedResources&&new Set(manifest.Resources.map(r=>r.Id)).size===expectedResources,'Unique full catalogue required');
 fs.mkdirSync(directory);const spool=path.join(directory,'spool');fs.mkdirSync(spool);
 const tiles=new Map(),owners=[],resources=[],global=freshBounds();
 const counts={resources:0,sourceTriangles:0,placedResources:0,unresolvedPlacements:0,instances:0,retainedAnalytic:0,analyticRendered:0,analyticUnavailable:0,highTriangles:0,unsupportedRegions:0};
 let peakRssMiB=memory();
 function tileFor(x,y){
  const id=Math.floor(x/atlasCellSize01)+'_'+Math.floor(y/atlasCellSize01);
  let tile=tiles.get(id);if(!tile){tile={id,bounds:freshBounds(),owners:new Set(),triangles:0};tiles.set(id,tile);}return tile;
 }
 for(const row of manifest.Resources){
  try{
   const placement=row.PreparationStates01?.placement,a=selected.get(row.Id),source=row.Result??row.PotentialResult;
   const resolved=p=>p==='cache-identity-qualified'||p==='metadata-interior-instances-resolved';
   assert(a&&a.entry===row.EntryPath&&(a.placement===placement?.state||!resolved(a.placement)&&!resolved(placement?.state))&&source&&digest(source.IndexSHA256)&&digest(source.ReceiptSHA256)&&digest(source.ArchiveSHA256),'Exact selected resource and retained proof required');
   const ip=inputPath(source.IndexPath,root),rp=inputPath(source.ReceiptPath,root);
   const {value:receipt}=json(rp,source.ReceiptSHA256);
   assert(fs.lstatSync(ip).nlink===1,'Unlinked index required');
   const {index}=loadCollisionResource(ip,{expectedSHA256:source.IndexSHA256});
   const d=index.analyticDerivation01;
   assert(receipt.Schema===1&&receipt.Entry===row.EntryPath&&receipt.Archive===row.PhysicalArchive&&receipt.ArchiveUnchanged===true&&
    receipt.BeforeSHA256===source.ArchiveSHA256&&receipt.AfterSHA256===source.ArchiveSHA256&&receipt.ParserSHA256===binding.CodeWalkerCoreSHA256&&
    index.source.entry===row.EntryPath&&index.source.archive===row.PhysicalArchive&&index.source.sha256===receipt.SourceSHA256&&index.source.bytes===receipt.SourceBytes&&
    receipt.Result?.counts?.triangles===index.counts.triangles&&
    (receipt.Result.indexSHA256===source.IndexSHA256||
     d?.archiveDecoded===false&&d.nativeSourceSHA256===receipt.SourceSHA256&&d.baseIndexSHA256===receipt.Result.indexSHA256&&
     inputPath(d.baseIndexPath,root)===inputPath(receipt.Result.index,root)&&sha256(read(d.baseIndexPath,64*1048576))===d.baseIndexSHA256),
    'Receipt, archive hash, index and offline analytic derivation must agree');
   const interior=placement.state==='metadata-interior-instances-resolved',exterior=placement.state==='cache-identity-qualified';
   const layer=row.PreparationStates01.activation.layer;
   const group=interior?3:a.activationBasis==='conditional-mapgroup-observation-required'?1:a.activationBasis==='higher-layer-observation-required'?2:a.activationBasis==='conditional-installation-layer-zero-exterior'&&layer===0?0:4;
   const transforms=exterior?[{matrix:null,instanceId:null}]:interior?placement.interiorPlacements.placements:[];
   assert(!interior||transforms.length>0,'Resolved interior must carry an exact placement');
   const resource={id:row.Id,entry:row.EntryPath,archive:row.PhysicalArchive,archiveSHA256:source.ArchiveSHA256,sourceSHA256:receipt.SourceSHA256,
    indexSHA256:source.IndexSHA256,receiptSHA256:source.ReceiptSHA256,placement:placement.state,placementAudit:a.placement,activation:a.activationBasis,layer,conditions:row.PreparationStates01.activation.conditions?.map(c=>c.variantId)??[],
    historicalProofEpoch:row.ArchiveValidation01?.EpochUtc??null,coverage:index.coverage,sourceTriangles:index.counts.triangles,unsupported:index.unsupported,
    analyticAvailable:index.analyticPrimitives01?.primitives.length??0,analyticRendered:0,analyticUnavailable:0,owners:[]};
   const buffers=new Map(),targets=transforms.map(t=>{
    const m=t.matrix?matrix(t.matrix):null,owner=owners.length;
    owners.push({resource:resources.length,instance:t.instanceId,class:group,matrix:m,archetype:t.archetypeHash??null,ytyp:t.sourceYtypSHA256??null,ymap:t.sourceYmapSHA256??null,
     bounds:worldBounds(index.bounds??placement.nativeBounds,m),portals:t.portalsDeclared??null,triangles:0,unknown:[]});resource.owners.push(owner);
    return {m,owner};
   });
   const emit=(points,material)=>{
    assert(Number.isInteger(material)&&material>=0&&material<=0xffffff,'Material tag out of atlas range');
    for(const {m,owner} of targets){
     const p=points.map(v=>worldPoint(v,m));
     const t=tileFor((p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3);
     let b=buffers.get(t.id);if(!b){const bytes=Buffer.allocUnsafe(spoolPage);b={bytes,v:new Float32Array(bytes.buffer,bytes.byteOffset,spoolPage/4),u:new Uint32Array(bytes.buffer,bytes.byteOffset,spoolPage/4),i:0};buffers.set(t.id,b);}
     const offset=b.i/4;let k=offset;
     for(const point of p){for(const v of point){assert(Number.isFinite(v)&&Math.abs(v)<65536,'Unsupported atlas coordinate extent');b.v[k++]=v;}include(t.bounds,...point);}
     b.u[offset+9]=(group<<24)|material;b.u[offset+10]=owner;b.i+=recordBytes;t.owners.add(owner);t.triangles++;owners[owner].triangles++;
     if(b.i===spoolPage){fs.appendFileSync(path.join(spool,t.id),b.bytes);b.i=0;}
    }
   };
   let inputTriangles=0;
   for(const c of index.chunks){
    const cp=inputPath(path.join(path.dirname(ip),c.file),root),b=read(cp,24+8192*96);
    assert(b.length===c.bytes&&sha256(b)===c.sha256&&b.toString('ascii',0,8)==='RACMESH1'&&b.readUInt32LE(8)===1&&b.readUInt32LE(12)===96&&b.readUInt32LE(16)===c.count&&b.readUInt32LE(20)===0,'Exact retained triangle chunk required');
    inputTriangles+=c.count;
    if(!targets.length)continue;
    for(let o=24;o<b.length;o+=96)emit([[b.readDoubleLE(o),b.readDoubleLE(o+8),b.readDoubleLE(o+16)],[b.readDoubleLE(o+24),b.readDoubleLE(o+32),b.readDoubleLE(o+40)],[b.readDoubleLE(o+48),b.readDoubleLE(o+56),b.readDoubleLE(o+64)]],b.readUInt32LE(o+72));
   }
   const represented=new Set(),unknownAnalytic=[];
   if(targets.length)for(const p of index.analyticPrimitives01?.primitives??[]){
    const key=p.node+':'+p.polygon+':'+p.sourceFamily;
    const outside=exterior&&placement.nativeBounds&&p.bounds.min.some((v,i)=>v<placement.nativeBounds.min[i]-.001||p.bounds.max[i]>placement.nativeBounds.max[i]+.001);
    const r=outside?{state:'unknown',reason:'analytic-outside-native-cache-bounds'}:tessellateAnalyticPrimitive01(p,{maximumErrorMetres:.25,maximumTriangles:2048});
    if(r.state==='approximated-analytic'){for(const tri of r.triangles)emit(tri.positions,tri.materialType);represented.add(key);resource.analyticRendered++;}
    else{unknownAnalytic.push({family:p.sourceFamily,bounds:p.bounds,reason:r.reason});resource.analyticUnavailable++;}
   }
   for(const [id,b] of buffers)if(b.i)fs.appendFileSync(path.join(spool,id),b.bytes.subarray(0,b.i));
   const remaining=index.unknownRegions.filter(r=>!represented.has(r.compactAnalyticPrimitive01??''));
   resource.unlocalizedUnsupported=remaining.filter(r=>!r.bounds).length;
   for(const {owner,m} of targets)owners[owner].unknown=[...remaining,...unknownAnalytic].map(r=>({family:r.family,bounds:worldBounds(r.bounds,m),reason:r.reason??r.basis??'unsupported'}));
   if(!targets.length){counts.unresolvedPlacements++;resource.placementCandidateBounds=placement.state==='cache-identity-candidate'?placement.nativeBounds:null;}
   else counts.placedResources++;
   counts.sourceTriangles+=inputTriangles;counts.retainedAnalytic+=resource.analyticAvailable;counts.analyticRendered+=resource.analyticRendered;
   counts.analyticUnavailable+=resource.analyticUnavailable;counts.unsupportedRegions+=remaining.length;counts.instances+=interior?targets.length:0;
   resources.push(resource);counts.resources++;
   if(counts.resources%250===0){peakRssMiB=Math.max(peakRssMiB,memory());progress({phase:'verify-and-partition',...counts,rssMiB:memory(),seconds:(performance.now()-began)/1000});}
  }catch(e){throw Error('Atlas resource '+row.Id+': '+e.message,{cause:e});}
 }
 const overview=[],spatial=[];
 let pack=0,packBytes=0;const packPath=()=>path.join(directory,'overview_'+pack+'.ram');
 function overviewStream(bytes,page){
  if(packBytes&&packBytes+bytes.length>8*1048576){pack++;packBytes=0;}
  page.pack=pack;page.offset=packBytes;
  fs.appendFileSync(packPath(),bytes);packBytes+=bytes.length;
 }
 let processed=0;
 for(const tile of tiles.values()){
  combine(global,tile.bounds);counts.highTriangles+=tile.triangles;
  const file=path.join(spool,tile.id);
  spatial.push(exportTile(directory,file,tile,overviewStream));fs.unlinkSync(file);
  if(++processed%100===0){peakRssMiB=Math.max(peakRssMiB,memory());progress({phase:'index-and-reduce',tiles:processed,total:tiles.size,rssMiB:memory(),seconds:(performance.now()-began)/1000});}
 }
 assert(spatial.length>0,'No retained world-space geometry was available');
 fs.rmdirSync(spool);
 for(let i=0;i<=pack;i++){const name='overview_'+i+'.ram',b=read(path.join(directory,name),16*1048576);overview.push({name,bytes:b.length,sha256:sha256(b)});}
 const provenance=Buffer.from(JSON.stringify({resources,owners}));fs.writeFileSync(path.join(directory,'provenance.json'),provenance,{flag:'wx'});
 const sizes=[0,0,0],triangles=[0,0,0];for(const t of spatial)t.pages.forEach((pages,i)=>{for(const p of pages){sizes[i]+=p.bytes;triangles[i]+=p.triangles;}});
 const result={format:atlasFormat01,identity:{manifestSHA256,catalogSHA256,auditSHA256,gameExecutableSHA256:binding.GameExecutableSHA256,
  codeWalkerCoreSHA256:binding.CodeWalkerCoreSHA256,importerSHA256:binding.ImporterSourceSHA256,geometryDecoderSHA256:binding.GeometryDecoderSHA256,proofEpoch:manifest.ValidationEpochUtc01??null},
  scope:'retained-partial-collision-only',coordinateSpace:'gta-native-unscaled',rendererAdmission:false,acousticWorldComplete:false,
  classes:atlasClasses01,cellSize:atlasCellSize01,bounds:global,counts,lods:{voxelNativeUnits:[20,4,0],sizes,triangles},overview,tiles:spatial,
  provenance:{name:'provenance.json',bytes:provenance.length,sha256:sha256(provenance)},build:{seconds:(performance.now()-began)/1000,peakSampledRssMiB:Math.max(peakRssMiB,memory()),protectedReads:0}};
 const bytes=Buffer.from(JSON.stringify(result));fs.writeFileSync(path.join(directory,'atlas.json'),bytes,{flag:'wx'});
 return {directory,atlasSHA256:sha256(bytes),counts,build:result.build,lods:result.lods,tiles:spatial.length,totalBytes:sizes.reduce((a,b)=>a+b,provenance.length+bytes.length)};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const [privateRoot,manifestPath,catalogPath,auditPath,out]=process.argv.slice(2);
 if(!out)throw Error('Usage: node build-atlas01.mjs PRIVATE_ROOT MANIFEST CATALOG FINAL_STATIC_AUDIT FRESH_OUTPUT');
 const result=buildSoundMapAtlas01({privateRoot,manifestPath,catalogPath,auditPath,out,progress:x=>console.error(JSON.stringify(x))});
 console.log(JSON.stringify(result,null,2));
}
