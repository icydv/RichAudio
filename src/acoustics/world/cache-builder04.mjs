// Opt-in control/background API. No ordinary gameplay caller, game enumeration,
// real-time callback IO, sound-source reset or fixed PCM queue is introduced.
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {isResourceInventory04} from './resource-inventory04.mjs';
import {rankStaticTiles} from './scheduler.mjs';
import {requireWorld,freeze,byteDigest,fields} from './contracts.mjs';
import {decodeImportedTile03} from './resource-import03.mjs';
import {createSceneTileContext03} from './scene-union03.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {createTile} from '../research/local-geometry.mjs';
import {validatePlanTile04} from './resource-tile-store04.mjs';
const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
function validSignal(signal){if(signal===undefined)return true;try{abortGetter.call(signal);return true;}catch{return false;}}
export class ResourceTileBuilder04 {
 constructor({inventory,inputs,store=null,session,trustedArtifacts={}}={}){requireWorld(isResourceInventory04(inventory)&&inputs&&typeof inputs==='object'&&/^[a-f0-9]{32}$/.test(session),'explicit cache builder inputs');requireWorld(trustedArtifacts&&typeof trustedArtifacts==='object'&&!Array.isArray(trustedArtifacts)&&Object.keys(trustedArtifacts).length<=64&&Object.entries(trustedArtifacts).every(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)),'independently supplied expected cache artifact bindings');this.artifacts=new Map(Object.entries(trustedArtifacts));this.inventory=inventory;this.inputs=inputs;this.store=store;this.session=session;this.resident=new Map();this.active=null;this.preparing=false;this.closed=false;this.stats={workersStarted:0,workersJoined:0,cacheHits:0,prepared:0,pcmQueueFramesAdded:0,sourceGenerationsModified:0};}
 artifactBindings(){return freeze(Object.fromEntries(this.artifacts));}
 #retain(plan,tile){this.resident.delete(plan.tileId);this.resident.set(plan.tileId,{planDigest:plan.planDigest,tile});while(this.resident.size>8)this.resident.delete(this.resident.keys().next().value);}
 contexts({engine={order:2,airDbPerMetre:[0,0,0]}}={}){return [...this.resident.values()].map(({tile})=>{const xml=tile.parser.inputFormat==='codewalker-xml05';return createSceneTileContext03({tileId:tile.tileId,worldDigest:this.inventory.inventoryDigest,scene:acousticScene(createTile({...tile.engineTile,session:this.session}),tile.materials,engine),sourceBindings:tile.sources.map(({id,sha256})=>({id,sha256})),layout:tile.parser.layout+(xml?'-codewalker-xml05':'-rsc7'),...(xml?{authority:tile.parser.xmlAuthority==='original-reference-fixture'?'original-reference-xml-fixture05':'review-policy-static-xml05'}:{})});});}
 updateInventory(inventory,inputs=this.inputs){requireWorld(isResourceInventory04(inventory)&&!this.preparing&&!this.closed,'idle qualified inventory update');const retained=new Map(),keys=new Set(inventory.tilePlans.map(p=>p.planDigest));for(const p of inventory.tilePlans){const old=this.resident.get(p.tileId);if(old?.planDigest===p.planDigest)retained.set(p.tileId,old);}this.artifacts=new Map([...this.artifacts].filter(([k])=>keys.has(k)));this.resident=retained;this.inventory=inventory;this.inputs=inputs;return {retainedTileIds:[...retained.keys()],unknownTileIds:inventory.tilePlans.filter(p=>p.unknown.length).map(p=>p.tileId)};}
 async prepareNearby(options={}){
  requireWorld(!this.preparing&&!this.closed,'one idle cache preparation');this.preparing=true;let finish;this.preparationDone=new Promise(resolve=>finish=resolve);
  try{return await this.#preparePass(options);}finally{this.preparing=false;this.preparationDone=null;finish();}
 }
 async #preparePass({listenerAnchor,sources=[],maximumTiles=2,radius=64,budgetMilliseconds=2000,signal}={}){
  requireWorld(Number.isInteger(maximumTiles)&&maximumTiles>0&&maximumTiles<=8&&Number.isFinite(radius)&&radius>=0&&radius<=256&&Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=10000&&validSignal(signal),'bounded progressive cache request');
  const byId=new Map(this.inventory.tilePlans.map(p=>[p.tileId,p])),nearby=rankStaticTiles(this.inventory.tilePlans,listenerAnchor,sources).filter(p=>p.priority<=radius).slice(0,8).map(p=>byId.get(p.tileId)),selected=nearby.filter(p=>!p.unknown.length&&this.resident.get(p.tileId)?.planDigest!==p.planDigest).slice(0,maximumTiles),started=performance.now(),results=nearby.filter(p=>p.unknown.length).map(p=>({tileId:p.tileId,state:'unqualified',unknown:p.unknown})),deadline=started+budgetMilliseconds;let state='prepared';
  // Serial preparation bounds memory and makes each subsequent call progress
  // through the nearby queue while resident exact plans remain cheap cache hits.
  for(const plan of selected){
   if(this.closed||signal&&abortGetter.call(signal)){state='cancelled';break;}if(performance.now()>=deadline){state='budget-exceeded';break;}
   if(plan.unknown.length){results.push({tileId:plan.tileId,state:'unqualified',unknown:plan.unknown});continue;}
   const resident=this.resident.get(plan.tileId);if(resident?.planDigest===plan.planDigest){results.push({tileId:plan.tileId,state:'resident'});continue;}
   if(this.store){try{const cached=await this.store.load(plan,{tileDigest:this.artifacts.get(plan.planDigest)});if(this.closed||signal&&abortGetter.call(signal)){state='cancelled';break;}if(performance.now()>=deadline){state='budget-exceeded';break;}if(cached.tile){this.#retain(plan,cached.tile);this.stats.cacheHits++;results.push({tileId:plan.tileId,state:cached.state});continue;}}catch(e){results.push({tileId:plan.tileId,state:'cache-rejected',reason:e.message});continue;}}
   const input={manifest:plan.manifest,bindings:plan.bindings,materialTable:plan.materialTable,session:this.session,listenerAnchor:plan.bounds.min.map((n,i)=>(n+plan.bounds.max[i])/2),resourceBytes:{},decodedResources:{}};
   let decodedBytes=0;for(const d of plan.dependencies){const b=this.inputs.resourceBytes?.[d.id],packet=this.inputs.decodedResources?.[d.id],xml=plan.inputFormat==='codewalker-xml05';requireWorld(Buffer.isBuffer(b)&&b.length===d.bytes&&byteDigest(b)===d.sha256&&packet,'exact supplied dependency bytes and parser packet');fields(packet,['schema','kind','resourceKind','sourceSHA256','bytes','sourceAuthority','parserSourceCommit','parserSHA256',...(xml?['inputFormat','qualificationDigest']:['gen9ReaderSelected','boundary']),'installedResourceVerified','runtimeActivationVerified','gameFilesRead','decodedJson','decodedSHA256','parserMvid']);requireWorld(typeof packet.decodedJson==='string'&&Buffer.byteLength(packet.decodedJson)<=16777216,'bounded decoded parser DTO before cloning');decodedBytes+=Buffer.byteLength(packet.decodedJson);requireWorld(decodedBytes<=33554432,'aggregate decoded parser DTO budget');for(const [key,value]of Object.entries(packet))if(key!=='decodedJson'&&key!=='boundary')requireWorld(typeof value==='string'&&value.length<=256||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value),'bounded parser packet metadata');if(!xml){fields(packet.boundary,['version','systemBytes','graphicsBytes','inflatedBytes','versionNibblesAgree','compressedPayload']);requireWorld(Object.values(packet.boundary).every(v=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)),'bounded parser boundary metadata');}input.resourceBytes[d.id]=Buffer.from(b);input.decodedResources[d.id]=structuredClone(packet);}
   const result=await this.#build(input,plan,Math.max(1,deadline-performance.now()),signal);if(result.state!=='prepared'){results.push({tileId:plan.tileId,...result});state=result.state;break;}
   if(this.closed||signal&&abortGetter.call(signal)){state='cancelled';break;}
   if(this.store){try{const published=await this.store.publish(plan,result.tile,{cancelled:()=>this.closed||!!signal&&abortGetter.call(signal)});if(!published.published){state='cancelled';break;}}catch(e){results.push({tileId:plan.tileId,state:'cache-rejected',reason:e.message});continue;}}
   if(this.closed||signal&&abortGetter.call(signal)){state='cancelled';break;}if(performance.now()>=deadline){state='budget-exceeded';break;}
   this.artifacts.set(plan.planDigest,result.tile.tileDigest);
   this.#retain(plan,result.tile);this.stats.prepared++;results.push({tileId:plan.tileId,state:'prepared',workerJoined:true});
  }
  return freeze({state,results,residentTileIds:[...this.resident.keys()],elapsedMs:performance.now()-started,installedWorldVerified:false,pcmQueueFramesAdded:0,sourceGenerationsModified:0});
 }
 async #build(inputs,plan,budgetMilliseconds,signal){
  const worker=new Worker(new URL('./cache-worker04.mjs',import.meta.url),{workerData:{inputs},resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});this.stats.workersStarted++;let done;const token={worker,outcome:null,done:new Promise(r=>done=r)};this.active=token;
  const stop=state=>{token.outcome={state,workerJoined:true};void worker.terminate();};token.cancel=()=>stop('cancelled');const abort=()=>stop('cancelled');if(signal)EventTarget.prototype.addEventListener.call(signal,'abort',abort,{once:true});const timer=setTimeout(()=>stop('budget-exceeded'),budgetMilliseconds);
  worker.once('message',m=>{if(!token.outcome)token.outcome=m?.passed?{state:'worker-complete',message:m}:{state:m?.state??'failed',reason:m?.reason,workerJoined:true};});worker.once('error',e=>{token.outcome??={state:'failed',reason:e.message,workerJoined:true};});
  worker.once('exit',code=>{clearTimeout(timer);if(signal)EventTarget.prototype.removeEventListener.call(signal,'abort',abort);this.stats.workersJoined++;let out=token.outcome??{state:'failed',reason:'worker-exited-without-result',workerJoined:true};
   if(out.state==='worker-complete')try{requireWorld(code===0&&!this.closed,'successful joined cache worker');const tile=validatePlanTile04(plan,decodeImportedTile03(Buffer.from(out.message.tile),{worldDigest:plan.worldDigest,manifestDigest:plan.manifestDigest,tileId:plan.tileId,bounds:plan.bounds,tileDigest:out.message.tileDigest}));out={state:'prepared',tile,workerJoined:true};}catch(e){out={state:'failed',reason:e.message,workerJoined:true};}if(this.active===token)this.active=null;done(out);
  });if(signal&&abortGetter.call(signal))abort();return token.done;
 }
 async close(){this.closed=true;const preparing=this.preparationDone;if(this.active){const token=this.active;token.cancel();await token.done;}if(preparing)await preparing;this.resident.clear();}
}
