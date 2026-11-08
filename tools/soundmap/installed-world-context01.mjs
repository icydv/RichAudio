// Viewer-only queries against the same current-proof cache as the normal producer.
// The service runs outside the game and owns its own bounded scene worker.
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {interiorObservationKey01} from '../../src/acoustics/world/interior-activation01.mjs';
import {InstalledSceneService01} from '../../src/acoustics/world/installed-scene-service01.mjs';

const hex=(value,count)=>typeof value==='string'&&value.length===count&&/^[a-f0-9]+$/.test(value);
const point=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<1e6);
const offsets=[[0,0],[24,0],[-24,0],[0,24],[0,-24]];
const interiorIntervalMs=150,exteriorIntervalMs=500;

export function installedContextConfig01(file){
 const location=path.resolve(file);
 const stat=fs.lstatSync(location);
 if(!location.split(path.sep).includes('.local')||fs.realpathSync.native(location).toLowerCase()!==location.toLowerCase()||
    !stat.isFile()||stat.nlink!==1||stat.size>4096)throw Error('Private bounded installed context configuration required');
 const {manifestPath,catalogPath,catalogSHA256,expectedGameSHA256,privateRoot}=JSON.parse(fs.readFileSync(location,'utf8'));
 if(!hex(catalogSHA256,64)||!hex(expectedGameSHA256,64)||![manifestPath,catalogPath,privateRoot].every(p=>typeof p==='string'&&path.isAbsolute(p)&&path.resolve(p).split(path.sep).includes('.local')))
  throw Error('Explicit private context cache and source bindings required');
 return {manifestPath,catalogPath,catalogSHA256,expectedGameSHA256,privateRoot,maximumResidentResources:4};
}

export class InstalledWorldContext01 {
 constructor(config){
  this.config=config;this.tiles=new Map();this.requests=new Map();this.serial=0;this.offset=0;
 }
 #retire(){
  const reader=this.reader;
  this.reader=null;this.key=null;this.scope=null;this.tiles.clear();this.requests.clear();
  if(reader){this.closing=reader.close().finally(()=>{this.closing=null;});}
 }
 #scene(scene,receipt,reader){
  const requested=this.requests.get(receipt.requestId);
  if(reader!==this.reader||receipt.catalogSHA256!==this.config.catalogSHA256||!requested||requested.scope!==this.scope||receipt.expiresAt<=performance.now())return;
  this.requests.delete(receipt.requestId);
  const tile=scene.tile;
  const payload={id:String(++this.serial),bounds:tile.bounds,coverage:tile.coverage,
   missingRegions:tile.missingRegions,surfaces:tile.surfaces.map(s=>({id:s.id,
    vertices:s.footprint?s.footprint.map(([u,v])=>s.center.map((n,i)=>n+u*s.u[i]+v*s.v[i])):s.corners,
    normal:s.normal,material:s.material,provenance:s.provenance}))};
  this.tiles.set(requested.offset,{payload,expiresAt:receipt.expiresAt});
 }
 snapshot(frame,known){
  const context=frame?.worldContext01;
  const transportAge=Date.now()-(frame?.producedAtUnixMs??0),age=transportAge+(context?.ageMs??0);
  if(this.closed||!frame?.listener?.valid||!hex(context?.ownerSession,32)||typeof frame.sessionId!=='string'||!new RegExp('^'+context.ownerSession+'(?::[0-9]+)?$').test(frame.sessionId)||!point(context?.position)||!Number.isFinite(context?.ageMs)||context.ageMs<0||context.ageMs>250||
     !Number.isFinite(transportAge)||transportAge<0||!Number.isFinite(age)||age>500||!Number.isSafeInteger(context.generation)||context.generation<=0||
     context.catalogue!==this.config.catalogSHA256||typeof context.epoch!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(context.epoch)||!Number.isFinite(Date.parse(context.epoch)))
   return {state:'awaiting-current-camera-and-proof',tiles:[]};
  const key=[context.ownerSession,frame.streamId,context.epoch].join(':');
  if(this.key!==key){
   this.#retire();
   if(this.closing)return {state:'changing-session',tiles:[]};
   const {catalogSHA256,...config}=this.config;
   const reader=new InstalledSceneService01({config:{...config,expectedCatalogSHA256:catalogSHA256},session:context.ownerSession,unmanagedIntervalMs01:interiorIntervalMs,onScene:(scene,receipt)=>this.#scene(scene,receipt,reader),
    onStatus:s=>{if(s.cacheTimings?.metadataProofCurrent01===false){this.tiles.clear();this.requests.clear();}}});
   this.reader=reader;this.key=key;reader.bindPreparationEpoch01(context.epoch);
  }
  const interior=context.interior,interiorKey=interiorObservationKey01(interior),remaining=interior?.durationMs-transportAge;
  const cameraInterior01=interiorKey&&interiorKey===context.interiorKey&&interior.epoch===context.epoch&&
   Number.isFinite(interior.durationMs)&&interior.durationMs<=1000&&remaining>0
   ?{...interior,durationMs:remaining}:null;
  const [x,y,z]=context.position,scope=[context.generation,...context.position.map(v=>Math.floor(v/16)),
   ...(cameraInterior01?[interiorKey]:[])].join(':');
  if(this.scope!==scope){this.scope=scope;this.offset=0;this.tiles.clear();this.requests.clear();this.lastRequest=null;}
  const now=performance.now(),reader=this.reader;
  const interval=cameraInterior01?interiorIntervalMs:exteriorIntervalMs;
  if(reader.ready&&!reader.closed&&!reader.failed&&(this.lastRequest==null||now-this.lastRequest>=interval)){
   // A proxy only identifies the interior at the observed camera, not at a neighbouring tile.
   const offset=cameraInterior01?0:this.offset++%offsets.length,[dx,dy]=offsets[offset];
   this.lastRequest=now;
   if(reader.latestGeneration!==null&&context.generation<reader.latestGeneration)return {state:'stale-camera-generation',tiles:[]};
   const request=reader.updateWindow({listener:[x+dx,y+dy,z],generation:context.generation,geometryTimeMs:now,
    durationMs:Math.min(1000-age,cameraInterior01?.durationMs??1000),radius:24,maximumSurfaces:512,
    cameraInterior01,prepareSoundMapGeometry01:false});
   for(const [id,row] of this.requests)if(row.expiresAt<=now)this.requests.delete(id);
   this.requests.set(request.requestId,{offset,scope,expiresAt:request.expiresAt});
  }
  const current=[...this.tiles.values()].filter(t=>t.expiresAt>now);
  const generation=current.map(t=>t.payload.id).join(':');
  return {state:reader.failed?'source-proof-unavailable':current.some(t=>t.payload.surfaces.length)?'verified-context':current.length?'context-coverage-unknown':'waiting-for-current-cache',
   sessionId:frame.sessionId,streamId:frame.streamId,catalogue:context.catalogue,epoch:context.epoch,scope,listenerGeneration:context.generation,generation,
   remainingMs:current.length?Math.min(...current.map(t=>t.expiresAt-now)):0,tiles:generation!==known?current.map(t=>t.payload):null};
 }
 async close(){this.closed=true;this.#retire();await this.closing;}
}