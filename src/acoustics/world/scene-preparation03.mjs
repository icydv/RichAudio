// Opt-in background preparation coordinator. Immutable scene publication is
// separate from rendering; preparing geometry never waits in a PCM callback.
import {Worker} from 'node:worker_threads';
import {encodeSceneTileContext03,decodeUnionResult03,isSceneTileContext03} from './scene-union03.mjs';
import {digest,freeze,requireWorld} from './contracts.mjs';
import {vector,inBox} from '../research/local-geometry.mjs';
import {SpatialTileIndex02} from './runtime02.mjs';
const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
function validSignal(signal){if(signal===undefined)return true;try{abortGetter.call(signal);return true;}catch{return false;}}
export class ScenePreparation03 {
 constructor({session,worldDigest}={}){
  requireWorld(/^[a-f0-9]{32}$/.test(session)&&/^[a-f0-9]{64}$/.test(worldDigest),'explicit scene preparation identity');
  this.session=session;this.worldDigest=worldDigest;this.epoch=1;this.generation=0;this.currentScene=null;this.active=null;this.closed=false;
  this.stats={workersStarted:0,workersJoined:0,publications:0,reused:0,cancelled:0,failures:0,pcmQueueFramesAdded:0,sourceGenerationsModified:0};
 }
 current(){return this.currentScene;}
 async prepareNearby({contexts,listenerAnchor,sources=[],radius=64,maximumTiles=8,...options}={}){
  requireWorld(!this.closed&&!this.active&&Array.isArray(contexts)&&contexts.length>0&&contexts.length<=8&&contexts.every(isSceneTileContext03)&&
   contexts.every(c=>c.worldDigest===this.worldDigest&&c.scene.tile.session===this.session)&&Number.isInteger(maximumTiles)&&maximumTiles>0&&maximumTiles<=8,
   'bounded explicit nearby resource contexts for this world/session');
  listenerAnchor=vector(listenerAnchor);
  const byId=new Map(contexts.map(c=>[c.tileId,c])),index=new SpatialTileIndex02(contexts.map(c=>({tileId:c.tileId,bounds:c.scene.tile.bounds}))),
   selection=index.nearby(listenerAnchor,{sources,radius,maximum:maximumTiles});
  if(!selection.entries.some(entry=>inBox(listenerAnchor,entry.bounds))){this.currentScene=null;return {state:'unprepared-or-unknown',selection,workerStarted:false,workerJoined:true,previousSceneRetained:false};}
  const result=await this.prepare({...options,contexts:selection.entries.map(e=>byId.get(e.tileId)),listenerAnchor});
  return {...result,selection};
 }
 async prepare({contexts,listenerAnchor,geometryTimeMs=0,budgetMilliseconds=2000,signal}={}){
  requireWorld(!this.closed&&!this.active&&Array.isArray(contexts)&&contexts.length>0&&contexts.length<=8&&contexts.every(isSceneTileContext03)&&
   Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&validSignal(signal)&&Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>=1&&budgetMilliseconds<=10000,'one bounded background preparation');
  listenerAnchor=vector(listenerAnchor);
  if(this.currentScene&&(geometryTimeMs<this.currentScene.scene.tile.createdAt||geometryTimeMs>=this.currentScene.scene.tile.validUntil||!inBox(listenerAnchor,this.currentScene.scene.tile.bounds)))this.currentScene=null;
  if(signal&&abortGetter.call(signal))return {state:'cancelled',workerStarted:false,workerJoined:true,previousSceneRetained:!!this.currentScene};
  const epoch=this.epoch,worldDigest=this.worldDigest,requestId=this.stats.workersStarted+1;
  const key=digest({contexts:contexts.map(c=>c.contentDigest).sort(),worldDigest,session:this.session,listenerAnchor});
  if(this.currentScene?.requestKey===key&&geometryTimeMs>=this.currentScene.scene.tile.createdAt&&geometryTimeMs<this.currentScene.scene.tile.validUntil){this.stats.reused++;return {state:'prepared',prepared:this.currentScene,workerStarted:false,workerJoined:true,reused:true};}
  const request={contexts:contexts.map(encodeSceneTileContext03),session:this.session,worldDigest,generation:this.generation+1,listenerAnchor,geometryTimeMs};
  const worker=new Worker(new URL('./scene-worker03.mjs',import.meta.url),{workerData:{requestId,request}});this.stats.workersStarted++;
  let finish;const token={worker,outcome:null,done:new Promise(resolve=>finish=resolve)};this.active=token;
  const stop=state=>{if(!token.outcome||token.outcome.state==='worker-complete')token.outcome={state,workerJoined:true,previousSceneRetained:!!this.currentScene};void worker.terminate();};
  const abort=()=>stop('cancelled');token.cancel=abort;
  if(signal)EventTarget.prototype.addEventListener.call(signal,'abort',abort,{once:true});
  const timer=setTimeout(()=>stop('budget-exceeded'),budgetMilliseconds);
  worker.once('message',message=>{
   if(token.outcome)return;
   if(message?.schema!==1||message.requestId!==requestId||!message.passed)token.outcome={state:'failed',reason:message?.reason??'invalid-worker-result',workerJoined:true,previousSceneRetained:!!this.currentScene};
   else token.outcome={state:'worker-complete',packet:message.result};
  });
  worker.once('error',()=>{token.outcome??={state:'failed',reason:'worker-exception',workerJoined:true,previousSceneRetained:!!this.currentScene};});
  worker.once('exit',code=>{
   clearTimeout(timer);if(signal)EventTarget.prototype.removeEventListener.call(signal,'abort',abort);this.stats.workersJoined++;
   let outcome=token.outcome??{state:'failed',reason:'worker-exited-without-result',workerJoined:true,previousSceneRetained:!!this.currentScene};
   if(outcome.state==='worker-complete'){
    if(code!==0)outcome={state:'failed',reason:'worker-exit-failed',workerJoined:true,previousSceneRetained:!!this.currentScene};
    else if(this.closed||this.epoch!==epoch||this.worldDigest!==worldDigest)outcome={state:'cancelled-or-invalidated',workerJoined:true,previousSceneRetained:!!this.currentScene};
    else try{
     const result=decodeUnionResult03(outcome.packet,{contexts,session:this.session,worldDigest,generation:this.generation+1,listenerAnchor,geometryTimeMs});
     requireWorld(result.metadata.worldDigest===worldDigest&&result.metadata.session===this.session&&result.metadata.generation===this.generation+1&&
      digest(result.metadata.contextDigests)===digest([...contexts].sort((a,b)=>a.tileId.localeCompare(b.tileId)).map(c=>c.contentDigest)),'worker publication identity');
     this.generation++;this.currentScene=freeze({...result,requestKey:key,worldDigest,generation:this.generation});this.stats.publications++;
     outcome={state:'prepared',prepared:this.currentScene,workerStarted:true,workerJoined:true,reused:false};
    }catch{outcome={state:'failed',reason:'worker-result-validation',workerJoined:true,previousSceneRetained:!!this.currentScene};}
   }
   if(outcome.state.startsWith('cancelled')||outcome.state==='budget-exceeded')this.stats.cancelled++;
   else if(outcome.state==='failed')this.stats.failures++;
   if(this.active===token)this.active=null;finish(outcome);
  });
  if(signal&&abortGetter.call(signal))abort();
  return token.done;
 }
 async invalidate(worldDigest){requireWorld(/^[a-f0-9]{64}$/.test(worldDigest),'new explicit world digest');this.epoch++;this.worldDigest=worldDigest;this.currentScene=null;if(this.active){const token=this.active;token.cancel();await token.done;}}
 async close(){this.closed=true;this.currentScene=null;if(this.active){const token=this.active;token.cancel();await token.done;}}
}
