// Control-side bridge from a joined CodeWalker companion into the EXISTING
// inventory, cache and full-catalogue startup coordinator. No game/file opener.
import {verifyProviderRun08} from './provider-supervisor08.mjs';
import {qualifyResourceInventory04} from './resource-inventory04.mjs';
import {sealStartupCatalogue06} from './startup-catalogue06.mjs';
import {StartupAcousticCoordinator06} from './startup-coordinator06.mjs';
import {startupLoadingPresentation06} from './startup-presentation06.mjs';
import {codeWalkerSource03} from './resource-import03.mjs';
import {convertCollision} from './collision-mesh.mjs';
import {resolvePlacements,transformInstance} from './placements.mjs';
import {byteDigest,digest,canonical,decodeCanonical,freeze,identifier,requireWorld,bounds} from './contracts.mjs';
import {verifyNativeAdmission08,nativeConversionWitness08,admitNativeBatch08} from './native-evidence08.mjs';

const providers=new WeakSet(),originalEvidence=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const providerLimits08=Object.freeze({resources:4096,groups:256,groupResources:32,triangles:128,pages:256});
const supportedKinds=new Set(['ymap','ytyp','ybn']);
const overlap=(a,b)=>a.min.every((v,i)=>v<b.max[i]&&a.max[i]>b.min[i]);
function retainProvider(result){
 // DTO strings/provenance remain immutable after reader attestation. Source
 // buffers are intentionally not frozen typed arrays; every cache use rehashes
 // them against the immutable resource plan before conversion.
 for(const p of result.pages){freeze(p.inputs.decodedResources);Object.freeze(p.inputs.resourceBytes);Object.freeze(p.inputs);Object.freeze(p);}Object.freeze(result.pages);freeze(result.sourceBindings);freeze(result.unknown);Object.freeze(result);providers.add(result);return result;
}
export function pinOriginalArchiveEvidence08(bytes,{expectedSHA256}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=16384&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'independently pinned original binary factory evidence');const proof=decodeCanonical(bytes,16384);
 requireWorld(proof?.kind==='OriginalBinaryArchiveEvidence08'&&proof.collisionFrame==='archetype-local'&&proof.units==='metres'&&hex(proof.factorySourceSHA256)&&hex(proof.fixtureReceiptSHA256)&&Array.isArray(proof.archiveSHA256s)&&proof.archiveSHA256s.length>0&&proof.archiveSHA256s.length<=8&&proof.archiveSHA256s.every(hex),'original binary factory reference identities');
 const token=Object.freeze({kind:'BrandedOriginalBinaryEvidence08'});originalEvidence.set(token,freeze(proof));return token;
}
export function resourceNameHash08(name){
 requireWorld(typeof name==='string'&&name.length>0&&name.length<=256,'bounded resource name');let h=0;
 for(const byte of Buffer.from(name.toLowerCase(),'utf8')){h=(h+byte)>>>0;h=(h+(h<<10))>>>0;h^=h>>>6;}
 h=(h+(h<<3))>>>0;h^=h>>>11;return (h+(h<<15))>>>0;
}
function logical(value){requireWorld(typeof value==='string'&&value.length<=160&&!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')&&value.split('/').every(v=>/^[A-Za-z0-9_.-]+$/.test(v)&&v!=='.'&&v!=='..'),'bounded canonical provider member');return value.toLowerCase();}
function packetResource(raw,record){
 identifier(raw.id);requireWorld(supportedKinds.has(raw.kind)&&Number.isSafeInteger(raw.order)&&raw.order>=0&&raw.order<=1000000,'provider kind and mount order');identifier(raw.mount);
 const path=logical(raw.logicalPath),packet=raw.packet;
 requireWorld(path.endsWith('.'+raw.kind)&&raw.source&&(raw.source.archiveSHA256===null||hex(raw.source.archiveSHA256))&&hex(raw.source.headerSHA256)&&hex(raw.source.tableSHA256)&&hex(raw.source.storedSHA256)&&hex(raw.source.parserBufferSHA256)&&Number.isSafeInteger(raw.source.offset)&&raw.source.offset>=0&&Number.isSafeInteger(raw.source.storedBytes)&&raw.source.storedBytes>0,'archive/member stored-range identity');
 const identity=raw.source.archiveIdentity,held=record.sourceBindings.find(s=>s.id===identity?.sourceId);requireWorld(held&&held.identityUnchanged===true&&held.bytes===identity.bytes&&held.volumeSerial===identity.volume&&held.fileIndexHigh===identity.fileIndexHigh&&held.fileIndexLow===identity.fileIndexLow&&held.lastWriteHigh===identity.lastWriteHigh&&held.lastWriteLow===identity.lastWriteLow,'resource root identity binds exact independently held source');
 requireWorld(typeof raw.base64==='string'&&raw.base64.length<=22369624,'bounded provider resource bytes');const bytes=Buffer.from(raw.base64,'base64');
 requireWorld(bytes.toString('base64')===raw.base64&&bytes.length<=16777216&&byteDigest(bytes)===raw.source.parserBufferSHA256,'exact parser-buffer identity distinct from archive bytes');
 requireWorld(packet?.kind==='CodeWalkerBoundedResource03'&&packet.resourceKind===raw.kind&&packet.sourceSHA256===byteDigest(bytes)&&packet.bytes===bytes.length&&packet.parserSourceCommit===codeWalkerSource03&&packet.parserSHA256===record.request.parserSHA256&&packet.gen9ReaderSelected===true&&packet.sourceAuthority===record.request.sourceAuthority,'actual CodeWalker packet/profile/Gen9 binding');
 requireWorld(packet.installedResourceVerified===false&&packet.runtimeActivationVerified===false&&packet.gameFilesRead===false&&typeof packet.decodedJson==='string'&&Buffer.byteLength(packet.decodedJson)<=16777216&&byteDigest(Buffer.from(packet.decodedJson))===packet.decodedSHA256,'provider cannot confer installation/runtime authority');
 const normalized=JSON.parse(packet.decodedJson);requireWorld(normalized.sourceSHA256===packet.sourceSHA256&&normalized.resourceKind===raw.kind&&normalized.sourceAuthority===packet.sourceAuthority,'normalized resource identity');
 const stem=path.split('/').at(-1).slice(0,-raw.kind.length-1),nameHash=resourceNameHash08(stem);requireWorld(raw.nameHash===nameHash,'resource basename hash is evidence of name only');
 return {...raw,path,bytes,packet,normalized,nameHash,sha256:packet.sourceSHA256};
}
function geometricBounds(triangles){
 requireWorld(triangles.length>0&&triangles.length<=providerLimits08.triangles,'existing acoustic triangle budget');
 const points=triangles.flatMap(t=>t.positions),min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),center=min.map((v,i)=>Math.round((v+max[i])/32)*16);
 // Existing bounded cache cells include listener/source space around finite
 // surfaces. No box face becomes a reflective wall or proof of empty space.
 const half=center.map((v,i)=>{let h=8;while(h<Math.max(v-min[i],max[i]-v)+.125&&h<64)h*=2;requireWorld(h>=Math.max(v-min[i],max[i]-v)+.125,'resource exceeds existing128m cache cell');return h;});
 return bounds({min:center.map((v,i)=>v-half[i]),max:center.map((v,i)=>v+half[i])});
}
function ordinaryGroup(map,resources,materialTable){
 const entities=map.normalized.data.entities;
 requireWorld(map.normalized.data.scripted===false&&map.normalized.data.unsupportedEntities===0&&Array.isArray(entities)&&entities.length>0&&entities.length<=4096,'ordinary static map only; MLO/scripted states remain unknown');
 const types=resources.filter(r=>r.kind==='ytyp'),collisions=resources.filter(r=>r.kind==='ybn'),selected=new Map([[map.id,map]]),archetypes=[],bindings=[],meshes=new Map();
 for(const name of new Set(entities.map(e=>e.archetypeName))){
  const found=types.flatMap(r=>(r.normalized.data.archetypes??[]).filter(a=>a.nameHash===name).map(a=>({r,a})));
  requireWorld(found.length===1&&found[0].r.normalized.data.unsupportedArchetypes===0,'unique supported effective archetype required');
  const {r,a}=found[0],matches=collisions.filter(c=>c.nameHash===a.physicsDictionary);requireWorld(matches.length===1,'unique declared physics dictionary collision required');
  const collision=matches[0],mesh=convertCollision(collision.normalized.data);requireWorld(mesh.unknownRegions.length===0,'unsupported collision remains unknown');
  selected.set(r.id,r);selected.set(collision.id,collision);archetypes.push(a);meshes.set(collision.id,mesh);
  bindings.push({archetypeHash:name,resourceId:collision.id,basis:'authored-fixture'});
 }
 requireWorld(selected.size<=providerLimits08.groupResources,'per-tile existing source budget');
 const placement=resolvePlacements({entities:entities.map(e=>({...e,id:map.id+':'+e.id})),archetypes,bindings,resources:[...meshes].map(([id])=>({id,coordinateSpace:'archetype-local',placementEvidence:'authored-fixture'}))});
 requireWorld(placement.unresolved.length===0,'explicit ordinary placement must resolve');
 const triangles=placement.placements.flatMap(p=>transformInstance(meshes.get(p.resourceId).chunks.flatMap(c=>c.triangles),p));
 requireWorld(triangles.every(t=>materialTable[t.materialType]?.basis==='authored-assumption'),'native material IDs require explicit acoustic assumptions');
 return {resources:[...selected.values()],bindings,bounds:geometricBounds(triangles),triangles};
}

// Original binary archives exercise the real reader, not authored parser DTOs.
// Genuine batches are retained for inspection but never renamed "fixture" to
// evade the pre-existing native acquisition/placement qualification boundary.
export function buildProviderCatalogue08({run,materialTable,fixtureEvidence}={}){
 const record=verifyProviderRun08(run),batch=record.workerResult;
 requireWorld(batch?.kind==='RichAudioCodeWalkerResult08'&&batch.passed===true&&Array.isArray(batch.resources)&&batch.resources.length>0&&batch.resources.length<=providerLimits08.resources&&Array.isArray(batch.unknown),'successful bounded CodeWalker companion result');
 requireWorld(record.request.gen9===true&&hex(record.request.parserSHA256),'explicit Enhanced reader mode required');
 const resources=batch.resources.map(r=>packetResource(r,record)),ids=new Set(),mounts=new Map(),paths=new Map(),unknown=batch.unknown.map((u,i)=>({id:'provider-unknown-'+i,bounds:null,reason:String(u.reason??u.state??'provider-unqualified').slice(0,160)}));
 for(const r of resources){requireWorld(!ids.has(r.id),'unique provider resource identity');ids.add(r.id);const old=mounts.get(r.mount);requireWorld(!old||old.order===r.order,'consistent mount order');mounts.set(r.mount,{id:r.mount,family:r.mount==='base'?'base':r.mount.startsWith('dlc')?'dlc':'custom',order:r.order,enabled:true});const group=paths.get(r.path)??[];requireWorld(!group.some(e=>e.order===r.order),'ambiguous same-member mount order');group.push(r);paths.set(r.path,group);}
 requireWorld(new Set([...mounts.values()].map(m=>m.order)).size===mounts.size&&mounts.size<=16,'qualified distinct effective mount orders');
 const effective=[...paths.values()].map(g=>g.sort((a,b)=>b.order-a.order)[0]);
 const original=record.request.sourceAuthority==='original-authored-fixture';
 if(original){const evidence=originalEvidence.get(fixtureEvidence);requireWorld(evidence&&resources.every(r=>evidence.archiveSHA256s.includes(record.sourceBindings.find(s=>s.id===r.source.archiveIdentity.sourceId)?.fullSHA256)),'independent branded original archive/frame controls required');}
 else unknown.push({id:'native-admission-required',bounds:null,reason:'real-native-acquisition-placement-precedence-and-activation-not-yet-qualified'});
 const groups=[];
 if(original)for(const map of effective.filter(r=>r.kind==='ymap')){
  try{const group=ordinaryGroup(map,effective,materialTable);requireWorld(groups.length<providerLimits08.groups,'bounded complete provider tile set');requireWorld(!groups.some(g=>overlap(g.bounds,group.bounds)),'overlapping map groups need qualified grid partition');groups.push({...group,tileId:'cw08-'+digest(map.path).slice(0,20),map});}
  catch(error){unknown.push({id:'unsupported-'+digest(map.path).slice(0,20),bounds:null,reason:String(error.message).slice(0,160)});}
 }
 const inputs={resourceBytes:{},decodedResources:{}};for(const r of effective){inputs.resourceBytes[r.id]=Buffer.from(r.bytes);inputs.decodedResources[r.id]=structuredClone(r.packet);}
 const pages=groups.map((g,index)=>{
  const selectedIds=new Set(g.resources.map(r=>r.id)),local=[...mounts.values()].filter(m=>g.resources.some(r=>r.mount===m.id)),mapDependencies=g.resources.filter(r=>r.kind!=='ymap').map(r=>r.path);
  const input={schema:1,kind:'RichAudioResourceInventory04',origin:'original-authored-fixture',build:'codewalker-provider08',layout:'gen9',parser:{sourceCommit:codeWalkerSource03,sha256:record.request.parserSHA256},mountPolicy:'explicit-reviewed-order-v1',precedenceEvidence:digest(local),mounts:local,
   resources:effective.filter(r=>selectedIds.has(r.id)).map(r=>({id:r.id,path:r.path,kind:r.kind,mount:r.mount,sha256:r.sha256,bytes:r.bytes.length,deleted:false,supported:true,scopeTiles:[g.tileId],dependencies:r.id===g.map.id?mapDependencies:[]})),
   tiles:[{tileId:g.tileId,bounds:g.bounds,bindings:g.bindings,materialTable:structuredClone(materialTable)}]};
  return {pageId:'provider-'+String(index).padStart(3,'0'),inventory:qualifyResourceInventory04(input),inputs};
 });
 const discovery={sealed:unknown.length===0,totalKnown:unknown.length===0,basis:'explicit-qualified-inventory-pages',unknownRegions:unknown.slice(0,256)};
 requireWorld(unknown.length<=256,'unknown-source count cannot be silently truncated');
 const catalogue=pages.length?sealStartupCatalogue06({catalogueId:'codewalker-provider08',pages:pages.map(({pageId,inventory})=>({pageId,inventory})),discovery}):null;
 const sourceBindings=resources.map(r=>({id:r.id,logicalArchive:r.logicalArchive,logicalMember:r.path,kind:r.kind,mount:r.mount,order:r.order,...r.source}));
 const result={kind:'RichAudioCodeWalkerCatalogue08',state:catalogue?'catalogued-original-binary-resources':'unqualified-native-resources',catalogue,pages,discovery,sourceBindings,metadata:batch.metadata,unknown,
  providerReceiptSHA256:record.receiptSHA256,parserSHA256:record.request.parserSHA256,actualInstallationScanned:false,installedWorldVerified:false,bootstrap:'explicit-capability-only; no bundled proprietary data',
  pageProvider:async pageId=>{const p=pages.find(p=>p.pageId===pageId);requireWorld(p,'declared CodeWalker provider page');return {inventory:p.inventory,inputs:p.inputs};}};
 return retainProvider(result);
}
export const isCodeWalkerProvider08=value=>providers.has(value);
export function bindNativeReviewToRun08({run,conversion,reviewPolicy}={}){
 const record=verifyProviderRun08(run),stable=nativeConversionWitness08(conversion);
 // The trusted host binds measured execution AFTER join. The independently
 // pinned conversion policy still fixes resource/placement/material content;
 // no PID, timestamp or future receipt has to be guessed in a preparation plan.
 const witness={...stable,kind:'RichAudioNativeWitness08',sourceScopeSHA256:record.requestId,sourceReceiptSHA256:record.receiptSHA256};
 return admitNativeBatch08({witness,reviewPolicy});
}
export function admitProviderCatalogue08({run,admissions}={}){
 const record=verifyProviderRun08(run),batch=record.workerResult;
 requireWorld(record.request.sourceAuthority==='separately-authorized-explicit-resource'&&record.request.gen9===true&&batch?.kind==='RichAudioCodeWalkerResult08'&&batch.passed===true,'joined separately authorized native batch');
 requireWorld(Array.isArray(admissions)&&admissions.length>0&&admissions.length<=256,'bounded independent native admission pages');
 const resources=batch.resources.map(r=>packetResource(r,record)),byId=new Map(resources.map(r=>[r.id,r])),inputs={resourceBytes:{},decodedResources:{}};
 for(const r of resources){inputs.resourceBytes[r.id]=Buffer.from(r.bytes);inputs.decodedResources[r.id]=structuredClone(r.packet);}
 const used=new Set(),pages=admissions.map((token,index)=>{
  const w=verifyNativeAdmission08(token);requireWorld(w.sourceReceiptSHA256===record.receiptSHA256&&w.sourceScopeSHA256===record.requestId&&w.parserSHA256===record.request.parserSHA256,'native review binds exact joined source/scope/decoder receipt');
  for(const r of w.resources){const actual=byId.get(r.id),mount=w.mounts.find(m=>m.id===r.mount);requireWorld(actual&&mount?.enabled===true&&actual.order===mount.order&&actual.path===r.path&&actual.kind===r.kind&&actual.mount===r.mount&&actual.sha256===r.sha256&&actual.bytes.length===r.bytes&&actual.packet.decodedSHA256===r.decodedSHA256,'review binds actual native bytes, effective mount order and packets');used.add(r.id);}
  const input={schema:1,kind:'RichAudioResourceInventory04',inputFormat:'codewalker-native08',origin:'separately-authorized-installed-metadata',build:w.build,layout:w.layout,parser:{sourceCommit:codeWalkerSource03,sha256:w.parserSHA256},mountPolicy:'explicit-reviewed-order-v1',precedenceEvidence:digest(w.mounts),mounts:w.mounts,
   resources:w.resources.map(r=>({id:r.id,path:r.path,kind:r.kind,mount:r.mount,sha256:r.sha256,bytes:r.bytes,deleted:false,supported:true,scopeTiles:[w.tileId],dependencies:r.kind==='ymap'?w.resources.filter(d=>d.kind!=='ymap').map(d=>d.path):[]})),tiles:[{tileId:w.tileId,bounds:w.bounds,bindings:w.bindings,materialTable:w.materialTable}]};
  return {pageId:'native-'+String(index).padStart(3,'0'),inventory:qualifyResourceInventory04(input,{nativeAdmission08:token}),inputs};
 });
 const unknown=(batch.unknown??[]).map((u,i)=>({id:'native-unknown-'+i,bounds:null,reason:String(u.reason??'unqualified-native-resource').slice(0,160)}));
 if(resources.some(r=>!used.has(r.id)))unknown.push({id:'unadmitted-native-resources',bounds:null,reason:'decoded native resources outside reviewed static geometry scope'});
 requireWorld(unknown.length<=256,'bounded honest native unknown scope');const discovery={sealed:unknown.length===0,totalKnown:unknown.length===0,basis:'explicit-qualified-inventory-pages',unknownRegions:unknown};
 const catalogue=sealStartupCatalogue06({catalogueId:'reviewed-native-provider08',pages:pages.map(({pageId,inventory})=>({pageId,inventory})),discovery});
 const result={kind:'RichAudioCodeWalkerCatalogue08',state:'catalogued-reviewed-static-native08',catalogue,pages,discovery,sourceBindings:resources.map(r=>({id:r.id,logicalArchive:r.logicalArchive,logicalMember:r.path,kind:r.kind,mount:r.mount,order:r.order,...r.source})),metadata:batch.metadata,unknown,providerReceiptSHA256:record.receiptSHA256,parserSHA256:record.request.parserSHA256,actualInstallationScanned:false,installedWorldVerified:false,bootstrap:'explicit-capability-only; no bundled proprietary data',pageProvider:async pageId=>{const p=pages.find(p=>p.pageId===pageId);requireWorld(p,'declared reviewed native page');return {inventory:p.inventory,inputs:p.inputs};}};
 return retainProvider(result);
}
export function createProviderStartup08({provider,checkpoint,storeForPage,session,onProgress,trustedCheckpointSHA256=null}={}){
 requireWorld(providers.has(provider)&&provider.catalogue,'qualified provider catalogue required');
 return new StartupAcousticCoordinator06({catalogue:provider.catalogue,pageProvider:provider.pageProvider,checkpoint,storeForPage,session,onProgress,trustedCheckpointSHA256});
}
export function providerPreparationStatus08(provider,coordinator=null){
 requireWorld(providers.has(provider),'branded CodeWalker provider');
 return freeze({provider:{state:provider.state,stage:provider.catalogue?'catalogue-ready':'qualification-required',completed:provider.sourceBindings.length,total:provider.sourceBindings.length,unknownCount:provider.unknown.length},
  ...(coordinator?{...coordinator.snapshot({includeTiles:false}),loading:startupLoadingPresentation06(coordinator)}:{stage:'qualification-required',percent:null,readiness:'not-ready',loading:{text:'Acoustic geometry qualification required',percent:null},unknownRegions:provider.unknown}),installedWorldVerified:false});
}
