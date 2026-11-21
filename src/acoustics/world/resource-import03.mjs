// Background/offline preparation only. Explicit supplied bytes, never filesystem
// discovery or a GTA/audio callback. Real installation authority is not inferred
// from a parser success, caller boolean, matching filename or an RSC7 version.
import {inflateRawSync} from 'node:zlib';
import {createExplicitResourceScene02} from './resource-scene02.mjs';
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {bounds,canonical,decodeCanonical,byteDigest,digest,freeze,identifier,requireWorld,fields,intersects} from './contracts.mjs';
export const resourceImporterRevision03='explicit-byte-resource-static-v3';
export const codeWalkerSource03='485d56bec00262ed7fa472261cce7bbc6202b96e';
export const resourceImportLimits03=Object.freeze({resources:32,mounts:16,resourceBytes:16777216,totalBytes:33554432,decodedJsonBytes:16777216,tiles:8,tileBytes:262144});
const prepared=new WeakSet(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function safePath(value){requireWorld(typeof value==='string'&&value.length>0&&value.length<=160&&!value.includes(':')&&!value.startsWith('/')&&!value.includes('\\'),'explicit logical resource path');const path=value.toLowerCase();requireWorld(!path.split('/').some(p=>!p||p==='.'||p==='..'),'logical resource traversal');return path;}
function pageBytes(flags){const units=((flags>>>27)&1)+(((flags>>>26)&1)*2)+(((flags>>>25)&1)*4)+(((flags>>>24)&1)*8)+(((flags>>>17)&127)*16)+(((flags>>>11)&63)*32)+(((flags>>>7)&15)*64)+(((flags>>>5)&3)*128)+(((flags>>>4)&1)*256);return 512*2**(flags&15)*units;}
function decodedResource(entry,packet,bytes,parser,layout){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length===entry.bytes&&bytes.length>=18&&bytes.length<=resourceImportLimits03.resourceBytes&&byteDigest(bytes)===entry.sha256,'explicit original resource byte binding');
 requireWorld(bytes.toString('ascii',0,4)==='RSC7','RSC7 compressed resource only');const version=bytes.readUInt32LE(4),sf=bytes.readUInt32LE(8),gf=bytes.readUInt32LE(12),system=pageBytes(sf),graphics=pageBytes(gf),total=system+graphics;
 requireWorld(version===(entry.kind==='ybn'?43:2)&&((sf>>>28)*16+(gf>>>28))===version&&system>0&&total<=resourceImportLimits03.resourceBytes,'resource version/page budget');
 // Independent decompression cap: a forged declared size cannot grow an
 // unbounded buffer before the parser receipt is checked.
 const inflated=inflateRawSync(bytes.subarray(16),{maxOutputLength:total});requireWorld(inflated.length===total,'actual inflated resource/page size');
 requireWorld(packet?.schema===1&&packet.kind==='CodeWalkerBoundedResource03'&&packet.resourceKind===entry.kind&&packet.sourceSHA256===entry.sha256&&packet.bytes===entry.bytes&&packet.sourceAuthority==='original-authored-fixture','bounded parser resource identity');
 requireWorld(packet.parserSourceCommit===codeWalkerSource03&&packet.parserSHA256===parser.sha256&&packet.gen9ReaderSelected===(layout==='gen9'),'exact parser/profile/layout binding');
 requireWorld(packet.installedResourceVerified===false&&packet.runtimeActivationVerified===false&&packet.gameFilesRead===false,'parser output cannot claim installed/runtime authority');
 requireWorld(packet.boundary?.version===version&&packet.boundary.systemBytes===system&&packet.boundary.graphicsBytes===graphics&&packet.boundary.inflatedBytes===total&&packet.boundary.versionNibblesAgree===true&&packet.boundary.compressedPayload===true,'independent resource boundary agreement');
 requireWorld(typeof packet.decodedJson==='string'&&Buffer.byteLength(packet.decodedJson)<=resourceImportLimits03.decodedJsonBytes&&byteDigest(Buffer.from(packet.decodedJson))===packet.decodedSHA256,'normalized parser payload binding');
 const decoded=JSON.parse(packet.decodedJson);requireWorld(decoded?.kind==='CodeWalkerExplicitStaticResource02'&&decoded.resourceKind===entry.kind&&decoded.sourceSHA256===entry.sha256&&decoded.bytes===entry.bytes&&decoded.sourceAuthority==='original-authored-fixture'&&decoded.parserMvid===packet.parserMvid,'normalized resource source binding');
 return decoded;
}
export function effectiveResourceManifest03(input){
 fields(input,['schema','kind','authority','layout','parser','mounts','resources','tiles','coverage','placementEvidence','activationEvidence']);
 requireWorld(input.schema===1&&input.kind==='RichAudioExplicitResourceManifest03'&&['original-authored-fixture','separately-authorized-explicit-resource'].includes(input.authority),'explicit resource manifest required');
 requireWorld(['legacy','gen9'].includes(input.layout)&&input.parser?.sourceCommit===codeWalkerSource03&&hex(input.parser.sha256),'explicit supported-layout parser profile');
 requireWorld(Array.isArray(input.mounts)&&input.mounts.length>0&&input.mounts.length<=resourceImportLimits03.mounts&&Array.isArray(input.resources)&&input.resources.length>0&&input.resources.length<=resourceImportLimits03.resources,'bounded explicit mount/resource list');
 const mounts=new Map(),orders=new Set();for(const mount of input.mounts){fields(mount,['id','order','enabled']);identifier(mount.id);requireWorld(!mounts.has(mount.id)&&Number.isSafeInteger(mount.order)&&mount.order>=0&&mount.order<=1000000&&!orders.has(mount.order)&&typeof mount.enabled==='boolean','unambiguous explicit mount order');mounts.set(mount.id,mount);orders.add(mount.order);}
 const ids=new Set(),groups=new Map();let bytes=0;
 for(const resource of input.resources){fields(resource,['id','path','kind','mount','sha256','bytes','deleted','supported']);identifier(resource.id);requireWorld(!ids.has(resource.id)&&mounts.has(resource.mount)&&['ymap','ytyp','ybn'].includes(resource.kind)&&hex(resource.sha256)&&Number.isSafeInteger(resource.bytes)&&resource.bytes>=0&&resource.bytes<=resourceImportLimits03.resourceBytes&&typeof resource.deleted==='boolean'&&typeof resource.supported==='boolean','explicit resource inventory binding');ids.add(resource.id);bytes+=resource.bytes;requireWorld(bytes<=resourceImportLimits03.totalBytes,'explicit resource byte total');
  const path=safePath(resource.path);requireWorld(path.endsWith('.'+resource.kind),'resource suffix/kind binding');if(!mounts.get(resource.mount).enabled)continue;const group=groups.get(path)??[],order=mounts.get(resource.mount).order;requireWorld(!group.some(e=>e.order===order),'ambiguous same-path mount precedence');group.push({...resource,path,order});groups.set(path,group);
 }
 requireWorld(Array.isArray(input.tiles)&&input.tiles.length>0&&input.tiles.length<=resourceImportLimits03.tiles,'bounded declared acoustic tiles');const tileIds=new Set();const tiles=input.tiles.map(t=>{fields(t,['tileId','bounds']);identifier(t.tileId);requireWorld(!tileIds.has(t.tileId),'duplicate acoustic tile identity');tileIds.add(t.tileId);return {tileId:t.tileId,bounds:bounds(t.bounds)};});
 for(let i=0;i<tiles.length;i++)for(let j=0;j<i;j++)requireWorld(!tiles[i].bounds.min.every((n,k)=>tiles[i].bounds.max[k]>tiles[j].bounds.min[k]&&n<tiles[j].bounds.max[k]),'overlapping tile interiors require a qualified layer policy');
 const region=bounds(input.coverage?.bounds);requireWorld(input.coverage?.outside==='unknown'&&input.coverage?.basis==='original-authored-bounded-subset'&&tiles.every(t=>t.bounds.min.every((n,i)=>n>=region.min[i]&&t.bounds.max[i]<=region.max[i])),'bounded explicit coverage; outside remains unknown');
 const effective=[...groups.values()].map(g=>g.sort((a,b)=>b.order-a.order)[0]).sort((a,b)=>a.path.localeCompare(b.path));
 return freeze({manifestDigest:digest(input),manifest:structuredClone(input),effective,tiles,region,declaredBytes:bytes,realMountPrecedenceVerified:false,installedWorldVerified:false});
}
const inBox=(p,b)=>p.every((n,i)=>n>=b.min[i]-1e-8&&n<=b.max[i]+1e-8);
function surfaceBox(surface){return {min:[0,1,2].map(i=>Math.min(...surface.corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...surface.corners.map(p=>p[i])))};}
export function prepareExplicitResourceBatch03({manifest,decodedResources,resourceBytes,bindings=[],materialTable={},session,listenerAnchor=[0,0,1]}={}){
 const selected=effectiveResourceManifest03(manifest),missing=[];
 const worldDigest=digest({revision:resourceImporterRevision03,manifestDigest:selected.manifestDigest,bindings,materialTable});
 // There is deliberately no caller-supplied verified=true escape hatch. A real
 // installation needs independently bound discovery/precedence, activation,
 // collision placement and scale evidence before any live scene can qualify.
 if(manifest.authority!=='original-authored-fixture')return freeze({state:'unqualified-installation-evidence',worldDigest,scene:null,tiles:[],missingEvidence:['effective-installation-mount-proof','runtime-activation-proof','entity-collision-binding-proof','native-world-coordinate-and-scale-proof','supervised-parser-worker-contract'],installedWorldVerified:false});
 requireWorld(manifest.placementEvidence==='original-authored-world-metres'&&manifest.activationEvidence==='original-authored-static-subset','explicit authored placement/activation model');
 for(const entry of selected.effective)if(!entry.deleted&&!entry.supported)missing.push({resource:entry.id,reason:'unsupported-winning-resource-no-base-fallback'});
 if(missing.length)return freeze({state:'unsupported-winning-resource',worldDigest,scene:null,tiles:[],unknown:missing,installedWorldVerified:false});
 const resources=[];for(const entry of selected.effective){if(entry.deleted)continue;const normalized=decodedResource(entry,decodedResources?.[entry.id],resourceBytes?.[entry.id],manifest.parser,manifest.layout);resources.push({...entry,normalized});}
 const built=createExplicitResourceScene02({resources,bindings,materialTable,session,region:selected.region,listenerAnchor});
 if(!built.scene)return freeze({...built,worldDigest,tiles:[],installedWorldVerified:false});
 const tiles=selected.tiles.map(entry=>{
  const surfaces=[],unknown=[];for(const s of built.scene.tile.surfaces){if(!intersects(surfaceBox(s),entry.bounds))continue;if(!s.corners.every(p=>inBox(p,entry.bounds))){unknown.push({resource:s.id,reason:'tile-boundary-crossing-finite-surface-not-clipped'});continue;}surfaces.push(s);}
  const anchor=listenerAnchor.map((v,i)=>Math.max(entry.bounds.min[i],Math.min(entry.bounds.max[i],v)));
  const engineTile=createTile({...built.scene.tile,id:'resource03:'+digest([worldDigest,entry.tileId]).slice(0,40),bounds:entry.bounds,listenerAnchor:anchor,surfaces,
   coverage:unknown.length?'partial':'complete-synthetic',missingRegions:unknown.length?[{id:'resource03-unknown',bounds:entry.bounds,reason:'crossing-resource-surface'}]:[]});
  const materials=Object.fromEntries(surfaces.map(s=>[s.id,built.scene.materials[s.id]]));
  const body={schema:3,kind:'richaudio-imported-resource-tile03',converterRevision:resourceImporterRevision03,authority:'original-resource-format-subset',worldDigest,manifestDigest:selected.manifestDigest,tileId:entry.tileId,bounds:entry.bounds,
   parser:{...manifest.parser,layout:manifest.layout},sources:selected.effective.filter(e=>!e.deleted).map(e=>({id:e.id,path:e.path,sha256:e.sha256,kind:e.kind,order:e.order})),engineTile,materials,unknown,anchorBasis:'clamped-cache-grid-anchor-not-listener-observation',outsideCoverage:'unknown',installedWorldVerified:false,runtimeActivationVerified:false};
  return freeze({...body,tileDigest:digest(body)});
 });
 const result=freeze({state:'prepared-original-resource-subset',worldDigest,manifestDigest:selected.manifestDigest,scene:built.scene,tile:built.scene.tile,tiles,metadata:{...built.metadata,converter:resourceImporterRevision03,parser:manifest.parser,layout:manifest.layout,gen9ModeIsNotInstalledCompatibilityProof:true,sourceAuthority:'original-authored-fixture',knownBounds:selected.region,outsideCoverage:'unknown'},installedWorldVerified:false,audioBuffersAdded:0});prepared.add(result);return result;
}
export function isPreparedResourceBatch03(value){return prepared.has(value);}
export function validateImportedTile03(tile){
 fields(tile,['schema','kind','converterRevision','authority','worldDigest','manifestDigest','tileId','bounds','parser','sources','engineTile','materials','unknown','anchorBasis','outsideCoverage','installedWorldVerified','runtimeActivationVerified','tileDigest']);
 requireWorld(tile?.schema===3&&tile.kind==='richaudio-imported-resource-tile03'&&tile.converterRevision===resourceImporterRevision03&&tile.authority==='original-resource-format-subset'&&hex(tile.worldDigest)&&hex(tile.manifestDigest)&&tile.installedWorldVerified===false&&tile.runtimeActivationVerified===false&&tile.outsideCoverage==='unknown'&&tile.anchorBasis==='clamped-cache-grid-anchor-not-listener-observation','separate imported resource cache identity');identifier(tile.tileId);bounds(tile.bounds);
 const {tileDigest,...body}=tile;requireWorld(hex(tileDigest)&&digest(body)===tileDigest&&Buffer.byteLength(canonical(tile))<=resourceImportLimits03.tileBytes,'imported tile content integrity');
 fields(tile.parser,['sourceCommit','sha256','layout']);requireWorld(tile.parser?.sourceCommit===codeWalkerSource03&&hex(tile.parser.sha256)&&['gen9','legacy'].includes(tile.parser.layout)&&Array.isArray(tile.sources)&&tile.sources.length>0&&tile.sources.length<=resourceImportLimits03.resources&&Array.isArray(tile.unknown)&&tile.unknown.length<=128,'bounded imported tile provenance');
 requireWorld(canonical(tile.engineTile.bounds)===canonical(tile.bounds)&&tile.engineTile.coordinateSpace===coordinateSpace&&tile.engineTile.id==='resource03:'+digest([tile.worldDigest,tile.tileId]).slice(0,40),'cache tile region/coordinates/identity');const sourceIds=new Set();for(const source of tile.sources){fields(source,['id','path','sha256','kind','order']);identifier(source.id);safePath(source.path);requireWorld(!sourceIds.has(source.id)&&hex(source.sha256)&&['ymap','ytyp','ybn'].includes(source.kind)&&source.path.endsWith('.'+source.kind)&&Number.isSafeInteger(source.order)&&source.order>=0,'cached source digest/kind/order');sourceIds.add(source.id);}
 for(const missing of tile.unknown){fields(missing,['resource','reason']);identifier(missing.resource);requireWorld(missing.reason==='tile-boundary-crossing-finite-surface-not-clipped','cached unknown geometry reason');}
 requireWorld(tile.engineTile.coverage===(tile.unknown.length?'partial':'complete-synthetic')&&tile.engineTile.surfaces.every(s=>s.provenance?.kind==='synthetic')&&tile.engineTile.missingRegions.length===(tile.unknown.length?1:0),'cached coverage cannot erase unknown geometry');
 if(tile.unknown.length)requireWorld(canonical(tile.engineTile.missingRegions[0].bounds)===canonical(tile.bounds)&&tile.engineTile.missingRegions[0].reason==='crossing-resource-surface','cached unknown region bounds');
 const reconstructed=createTile(tile.engineTile);requireWorld(reconstructed.observationKey===tile.engineTile.observationKey,'cached geometry observation identity');const scene=acousticScene(reconstructed,tile.materials,{order:2,airDbPerMetre:[0,0,0]});
 requireWorld(Object.values(tile.materials).every(m=>m?.basis==='authored-assumption')&&canonical(scene.materials)===canonical(tile.materials),'cached acoustic material provenance/derived fields');return tile;
}
export function encodeImportedTile03(tile){validateImportedTile03(tile);const body=Buffer.from(canonical(tile));return Buffer.concat([Buffer.from('RichAudio-Imported-Resource-Tile\n3\n'+byteDigest(body)+'\n'+body.length+'\n'),body]);}
export function decodeImportedTile03(bytes,{worldDigest,manifestDigest,tileId,bounds:expectedBounds,tileDigest}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=resourceImportLimits03.tileBytes+160,'bounded imported cache bytes');let at=0;const header=[];for(let i=0;i<4;i++){const end=bytes.indexOf(10,at);requireWorld(end>=at&&end-at<100,'imported cache header');header.push(bytes.subarray(at,end).toString('ascii'));at=end+1;}
 const body=bytes.subarray(at);requireWorld(header[0]==='RichAudio-Imported-Resource-Tile'&&header[1]==='3'&&header[2]===byteDigest(body)&&header[3]===String(body.length),'imported cache format/checksum/length');
 const value=decodeCanonical(body,resourceImportLimits03.tileBytes);validateImportedTile03(value);requireWorld(hex(worldDigest)&&hex(manifestDigest)&&hex(tileDigest)&&typeof tileId==='string'&&expectedBounds,'explicit expected cache selection identity required');
 requireWorld(value.worldDigest===worldDigest,'cached world identity changed');requireWorld(value.manifestDigest===manifestDigest,'cached manifest identity changed');requireWorld(value.tileId===tileId&&value.tileDigest===tileDigest&&canonical(value.bounds)===canonical(bounds(expectedBounds)),'cached tile selection identity changed');return freeze({...value,engineTile:createTile(value.engineTile)});
}
