// Viewer-only queries against the same current-proof cache as the normal producer.
// The service runs outside the game and owns its own bounded scene worker.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {interiorObservationKey01} from '../../src/acoustics/world/interior-activation01.mjs';
import {InstalledSceneService01} from '../../src/acoustics/world/installed-scene-service01.mjs';
import {installedStaticSceneMetadata01} from '../../src/acoustics/world/installed-static-scene01.mjs';

const hex=(value,count)=>typeof value==='string'&&value.length===count&&/^[a-f0-9]+$/.test(value);
const point=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<1e6);
const offsets=[[0,0],[24,0],[-24,0],[0,24],[0,-24]];
const interiorIntervalMs=150,exteriorIntervalMs=500;
const epoch=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const verifiedReceipts=new WeakSet();

function privateContextJson(file){
 const location=path.resolve(file);
 const stat=fs.lstatSync(location);
 if(!location.split(path.sep).includes('.local')||fs.realpathSync.native(location).toLowerCase()!==location.toLowerCase()||
    !stat.isFile()||stat.nlink!==1||stat.size>4096)throw Error('Private bounded installed context configuration required');
 const bytes=fs.readFileSync(location);
 return {json:JSON.parse(bytes),sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function installedContextConfig01(file){
 const {json,sha256:configSHA256}=privateContextJson(file);
 const {manifestPath,catalogPath,catalogSHA256,expectedGameSHA256,privateRoot,proofEpoch}=json;
 if(!hex(catalogSHA256,64)||!hex(expectedGameSHA256,64)||![manifestPath,catalogPath,privateRoot].every(p=>typeof p==='string'&&path.isAbsolute(p)&&path.resolve(p).split(path.sep).includes('.local')))
  throw Error('Explicit private context cache and source bindings required');
 if(proofEpoch!==undefined&&!epoch(proofEpoch))throw Error('Explicit valid context proof epoch required');
 return {manifestPath,catalogPath,catalogSHA256,expectedGameSHA256,privateRoot,proofEpoch,configSHA256,maximumResidentResources:16};
}

export function verifyMapProofReceipt01(file,sha256,config,ownerId,stopAt,now=Date.now()){
 const receipt=privateContextJson(file);
 const r=receipt.json;
 if(!hex(sha256,64)||receipt.sha256!==sha256||r.schema!==1||r.kind!=='soundmap-current-source-identity'||
    !hex(ownerId,32)||r.ownerId!==ownerId||r.stopAt!==stopAt||r.configSHA256!==config?.configSHA256||
    r.proofEpoch!==config.proofEpoch||r.archiveCount!==123||r.matchingArchiveIdentities!==123||r.archiveContentBytesRead!==0||
    r.gameExecutableSHA256!==config.expectedGameSHA256||!Number.isSafeInteger(r.checkedAt)||now-r.checkedAt<0||now-r.checkedAt>120000)
  throw Error('Fresh bound map identity receipt required');
 const bound=Object.freeze({proofEpoch:r.proofEpoch,checkedAt:r.checkedAt,stopAt:r.stopAt,archiveCount:r.archiveCount,ownerId,configSHA256:config.configSHA256});
 verifiedReceipts.add(bound);return bound;
}
export const isBoundMapProofReceipt01=(r,c,owner)=>verifiedReceipts.has(r)&&r.ownerId===owner&&r.configSHA256===c?.configSHA256;

export function contextFailure01(s,lastBinding=null,exitCode=null){
 const worker=s?.worker,metadata=s?.cacheTimings,recent=s?.sceneDeliveryDiagnostics01?.recent;
 const reason=worker?.failure??null;
 const kind=/chunk integrity|index integrity|receipt integrity|enoent|eacces|derived-cache path/i.test(reason??'')?'cache-access-or-integrity':
  reason?.includes('timeout')?'timeout':reason?.startsWith('worker-result-rejected:')?'transport-or-result-validation':worker?.failed?'worker-termination-or-execution':null;
 const state=worker?.failed?(kind==='cache-access-or-integrity'?'context-cache-unavailable':kind==='transport-or-result-validation'?'context-worker-result-rejected':kind==='timeout'?'context-worker-timeout':'context-worker-failed'):
  metadata?.metadataProofCurrent01===false?'source-proof-unavailable':null;
 return {state,kind:kind??(state?'metadata-source-proof':null),reason,phase:reason?.split(':')[0]??worker?.state??null,metadataProofCurrent:metadata?.metadataProofCurrent01??null,
  lastBinding,request:recent?.at(-1)??null,cacheStatus:s?.stage??null,cacheTimings:metadata??null,workerExited:worker?.workerExited??false,exitCode,
  nodeRssMiB:Math.round(process.memoryUsage.rss()/1048576)};
}

// This is a camera/context envelope, never an acoustic frame.
export function passiveWorldContext01(frame,config,now){
 if(!frame?.listener.valid||frame.ageMs>=500||!epoch(config?.proofEpoch))return null;
 const {position,generation}=frame.listener,raw=frame.interiorReadback,ownerSession=frame.sessionId;
 const durationMs=500-frame.ageMs+Math.min(0,raw?.offsetMs??0);
 const interior=raw?.outcome==='observed'&&durationMs>0?
  {proxy:raw.proxy,archetype:raw.archetype,origin:raw.origin,durationMs,epoch:config.proofEpoch}:null;
 return {sessionId:ownerSession,streamId:frame.streamId,sequence:frame.sequence,listener:frame.listener,producedAtUnixMs:now,
  worldContext01:{ownerSession,position,generation,ageMs:frame.ageMs,epoch:config.proofEpoch,catalogue:config.catalogSHA256,
   interior,interiorKey:interiorObservationKey01(interior),interiorOutcome:raw?.outcome??'unavailable',contextRevision:frame.contextRevision}};
}

export class InstalledWorldContext01 {
 constructor(config,{viewOnlyMap=false}={}){
  if(viewOnlyMap&&!epoch(config.proofEpoch))throw Error('View-only map requires a bound proof epoch');
  this.config=config;this.viewOnlyMap=viewOnlyMap;this.tiles=new Map();this.requests=new Map();this.serial=0;this.offset=0;
 }
 #retire(){
  const reader=this.reader;
  this.reader=null;this.key=null;this.scope=null;this.lastSequence=null;this.tiles.clear();this.requests.clear();
  if(reader){
   this.closing=reader.close().then(result=>{
    this.closedWorkers=(this.closedWorkers??0)+1;
    this.lastExitCode=result.workerExitCode??null;
    this.closureUnknown=this.closureUnknown||result.workerJoined!==true;
   }).finally(()=>{this.closing=null;});
  }
 }
 #scene(scene,receipt,reader){
  const requested=this.requests.get(receipt.requestId);
  if(reader!==this.reader||receipt.catalogSHA256!==this.config.catalogSHA256||!requested||requested.scope!==this.scope||receipt.expiresAt<=performance.now())return;
  this.requests.delete(receipt.requestId);
  const tile=scene.tile,summary=installedStaticSceneMetadata01(scene);
  const payload={id:String(++this.serial),bounds:tile.bounds,coverage:tile.coverage,
   query:{nearby:summary.candidateResources,selected:summary.selectedResources,verified:summary.successfulResources,
    triangles:summary.trianglesQueried,interiorSurfaces:summary.interiorSurfaceCount01,withheld:summary.localReadiness.activationWithheld,
    reason:summary.localReadiness.firstBlocker,interiorActivation:summary.interiorGeometryActivation},
   sources:scene.observationModel.evidence.map(({resourceId,indexSHA256,receiptSHA256,interiorInstanceId})=>({resourceId,indexSHA256,receiptSHA256,interiorInstanceId})),
   missingRegions:tile.missingRegions,surfaces:tile.surfaces.map(s=>({id:s.id,
    vertices:s.footprint?s.footprint.map(([u,v])=>s.center.map((n,i)=>n+u*s.u[i]+v*s.v[i])):s.corners,
    normal:s.normal,material:s.material,provenance:s.provenance}))};
  this.tiles.set(requested.offset,{payload,expiresAt:receipt.expiresAt});
 }
 snapshot(frame,known){
  const context=frame?.worldContext01;
  const transportAge=Date.now()-(frame?.producedAtUnixMs??0),age=transportAge+(context?.ageMs??0);
  const lease=this.viewOnlyMap?500:1000;
  if(this.closed||!frame?.listener?.valid||!hex(context?.ownerSession,32)||typeof frame.sessionId!=='string'||!new RegExp('^'+context.ownerSession+'(?::[0-9]+)?$').test(frame.sessionId)||!point(context?.position)||!Number.isFinite(context?.ageMs)||context.ageMs<0||context.ageMs>(this.viewOnlyMap?500:250)||
     !Number.isFinite(transportAge)||transportAge<0||!Number.isFinite(age)||age>=500||!Number.isSafeInteger(context.generation)||context.generation<=0||
     context.catalogue!==this.config.catalogSHA256||!epoch(context.epoch)){
   this.scope=null;this.tiles.clear();this.requests.clear();
   const diagnostic=contextFailure01(this.workerStatus,this.lastBinding,this.reader?.exitCode);
   return {state:'awaiting-current-camera-and-proof',tiles:[],diagnostic:diagnostic.state?diagnostic:undefined};
  }
  const key=[context.ownerSession,frame.streamId,context.epoch].join(':');
  if(this.key!==key){
   this.#retire();
   if(this.closing)return {state:'changing-session',tiles:[]};
   const {catalogSHA256,proofEpoch,configSHA256,...config}=this.config;
   const reader=new InstalledSceneService01({config:{...config,expectedCatalogSHA256:catalogSHA256},session:context.ownerSession,unmanagedIntervalMs01:interiorIntervalMs,onScene:(scene,receipt)=>this.#scene(scene,receipt,reader),
    onStatus:s=>{
     if(s.cacheTimings?.metadataProofCurrent01===true)this.lastBinding={catalogue:s.worker.catalogSHA256,epoch:context.epoch,bindingEpoch:s.worker.bindingEpoch};
     this.workerStatus=s;
     if(s.worker.failed||s.cacheTimings?.metadataProofCurrent01===false){this.tiles.clear();this.requests.clear();}
    }});
   this.reader=reader;this.key=key;reader.bindPreparationEpoch01(context.epoch);
  }
  const interior=context.interior,interiorKey=interiorObservationKey01(interior),remaining=interior?.durationMs-transportAge;
  const cameraInterior01=interiorKey&&interiorKey===context.interiorKey&&interior.epoch===context.epoch&&
   Number.isFinite(interior.durationMs)&&interior.durationMs<=1000&&remaining>0
   ?{...interior,durationMs:remaining}:null;
  const [x,y,z]=context.position,scope=[context.generation,...context.position.map(v=>Math.floor(v/16)),
   ...(cameraInterior01?[interiorKey]:[]),...(this.viewOnlyMap?[context.contextRevision]:[])].join(':');
  if(this.scope!==scope){this.scope=scope;this.offset=0;this.tiles.clear();this.requests.clear();this.lastRequest=null;}
  const now=performance.now(),reader=this.reader;
  const interval=this.viewOnlyMap||cameraInterior01?interiorIntervalMs:exteriorIntervalMs;
  if(reader.ready&&!reader.closed&&!reader.failed&&(!this.viewOnlyMap||this.lastSequence!==frame.sequence)&&(this.lastRequest==null||now-this.lastRequest>=interval)){
   // A proxy only identifies the interior at the observed camera, not at a neighbouring tile.
   const offset=this.viewOnlyMap||cameraInterior01?0:this.offset++%offsets.length,[dx,dy]=offsets[offset];
   this.lastRequest=now;
   if(reader.latestGeneration!==null&&context.generation<reader.latestGeneration)return {state:'stale-camera-generation',tiles:[]};
   this.lastSequence=frame.sequence;
   const request=reader.updateWindow({listener:[x+dx,y+dy,z],generation:context.generation,geometryTimeMs:now,
    durationMs:Math.min(lease-age,cameraInterior01?.durationMs??lease),radius:24,maximumSurfaces:512,
    cameraInterior01,prepareSoundMapGeometry01:false});
   for(const [id,row] of this.requests)if(row.expiresAt<=now)this.requests.delete(id);
   this.requests.set(request.requestId,{offset,scope,expiresAt:request.expiresAt});
  }
  const current=[...this.tiles.values()].filter(t=>t.expiresAt>now);
  const generation=current.map(t=>t.payload.id).join(':');
  const diagnostic=contextFailure01(this.workerStatus,this.lastBinding,reader.exitCode);
  return {state:diagnostic.state??(current.some(t=>t.payload.surfaces.length)?'verified-context':current.length?'context-coverage-unknown':this.tiles.size?'context-expired':'waiting-for-current-cache'),
   diagnostic:diagnostic.state?diagnostic:undefined,
   authority:'verified-collision-context-only',rendererAdmission:false,interiorOutcome:context.interiorOutcome??null,
   sessionId:frame.sessionId,streamId:frame.streamId,catalogue:context.catalogue,epoch:context.epoch,scope,listenerGeneration:context.generation,generation,
   remainingMs:current.length?Math.min(...current.map(t=>t.expiresAt-now)):0,tiles:generation!==known?current.map(t=>t.payload):null};
 }
 async close(){
  this.closed=true;this.#retire();await this.closing;
  return {workerJoined:!this.closureUnknown,closedWorkers:this.closedWorkers??0,diagnostic:contextFailure01(this.workerStatus,this.lastBinding,this.lastExitCode)};
 }
}
