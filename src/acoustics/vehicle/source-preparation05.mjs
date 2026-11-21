// Explicit startup/control preparation of the existing stock source class.
// Yielding here is not CPU isolation: construction still uses this Node thread.
import {performance} from 'node:perf_hooks';
import {StockVehicleSource} from './stock-source.mjs';
const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const aborted=signal=>signal===undefined?false:abortGetter.call(signal);
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const optionsKey=options=>JSON.stringify(options);
const matches=(a,b)=>a.identity===b.identity&&a.session===b.session&&a.bank===b.bank&&a.optionsKey===optionsKey(b.options);
export const sourcePreparationLimits05=Object.freeze({readySources:2,maximumLeaseMs:250});
export const stockSourceIdentity05=v=>`${v.id}:${v.generation}:${v.model}:${v.context}`;

export class StockSourcePreparation05 {
 constructor({now,candidates,createSource}={}){
  check(typeof now==='function'&&typeof candidates==='function'&&typeof createSource==='function','explicit existing source/control callbacks');
  this.now=now;this.candidates=candidates;this.createSource=createSource;this.ready=new Map();this.active=null;this.epoch=0;this.closed=false;this.rendering=false;this.lastNow=-Infinity;
  this.stats={constructed:0,consumed:0,fallbacks:0,discarded:0,cancelled:0,failures:0,clockReversals:0,constructionMs:0,sourceFramesAdvanced:0,pcmQueueFramesAdded:0};
 }
 #time(){const at=this.now();if(!Number.isFinite(at)||at<this.lastNow){this.stats.clockReversals++;this.cancel();this.lastNow=Number.isFinite(at)?at:-Infinity;return null;}this.lastNow=at;return at;}
 #remove(identity){if(this.ready.delete(identity))this.stats.discarded++;}
 #prune(at){for(const [id,entry]of this.ready)if(at===null||at>=entry.expiresAt||aborted(entry.signal))this.#remove(id);}
 observe(identities){const present=new Set(identities);if(this.active?.identities.some(id=>!present.has(id))){this.epoch++;this.active.invalidated=true;}for(const id of this.ready.keys())if(!present.has(id))this.#remove(id);this.#prune(this.#time());}
 cancel(){this.epoch++;for(const id of [...this.ready.keys()])this.#remove(id);}
 async prepare({sourceIds=null,maximum=2,validForMs=250,signal}={}){
  check(Number.isInteger(maximum)&&maximum>=1&&maximum<=2&&Number.isFinite(validForMs)&&validForMs>0&&validForMs<=250&&
   (sourceIds===null||Array.isArray(sourceIds)&&sourceIds.length>0&&sourceIds.length<=2&&new Set(sourceIds).size===sourceIds.length&&sourceIds.every(id=>typeof id==='string'&&/^[\w:-]{1,64}$/.test(id))),'bounded explicit source preparation');
  if(signal!==undefined)try{aborted(signal);}catch{throw Error('valid source preparation AbortSignal');}
  const start=performance.now(),out=(state,prepared=0,reused=0,constructionMs=0)=>{if(state==='cancelled')this.stats.cancelled++;return {state,prepared,reused,constructionMs,elapsedMs:performance.now()-start,sourceFramesAdvanced:0,pcmQueueFramesAdded:0,cpuIsolation:false};};
  if(this.closed)return out('closed');if(this.rendering)return out('render-busy');if(this.active)return out('preparation-busy');if(aborted(signal))return out('cancelled');
  const at=this.#time();this.#prune(at);if(at===null)return out('clock-unqualified');
  const requests=this.candidates().filter(c=>sourceIds===null||sourceIds.includes(c.vehicleId)).slice(0,maximum).map(c=>({...c,options:structuredClone(c.options),optionsKey:optionsKey(c.options)}));
  let finish;const token={epoch:this.epoch,identities:requests.map(c=>c.identity),done:new Promise(resolve=>finish=resolve)};this.active=token;
  let prepared=0,reused=0,constructionMs=0;
  try{
   // The caller must await this API before entering a rendering deadline.
   await immediate();
   if(this.closed||token.epoch!==this.epoch||aborted(signal))return out('cancelled');
   if(this.rendering)return out('render-busy');
   for(const request of requests){
    if(this.rendering)return out('render-busy',prepared,reused,constructionMs);
    const now=this.#time();this.#prune(now);if(now===null)return out('clock-unqualified',prepared,reused,constructionMs);
    if(this.closed||token.epoch!==this.epoch||aborted(signal))return out('cancelled',prepared,reused,constructionMs);
    const candidate=this.candidates().find(c=>c.identity===request.identity);
    if(!candidate||!matches(request,candidate))continue;
    const existing=this.ready.get(request.identity);if(existing&&matches(existing,candidate)){reused++;continue;}
    const captured={...candidate,options:structuredClone(candidate.options),optionsKey:optionsKey(candidate.options)};
    const began=performance.now(),source=this.createSource(candidate.model,candidate.context,captured.options);const elapsed=performance.now()-began;constructionMs+=elapsed;this.stats.constructionMs+=elapsed;this.stats.constructed++;
    check(source instanceof StockVehicleSource&&source.vehicle===candidate.bank&&source.frame===0&&source.stats.frames===0,'untouched sample-zero existing stock source required');
    const completedAt=this.#time(),current=this.candidates().find(c=>c.identity===candidate.identity);
    if(completedAt===null||this.closed||token.epoch!==this.epoch||aborted(signal)||!current||!matches(captured,current)||completedAt>=Math.min(candidate.expiresAt,at+validForMs)){this.stats.discarded++;continue;}
    this.#remove(candidate.identity);while(this.ready.size>=2)this.#remove(this.ready.keys().next().value);
    this.ready.set(candidate.identity,{...captured,source,signal,expiresAt:Math.min(candidate.expiresAt,at+validForMs)});prepared++;
   }
   return out(aborted(signal)||token.epoch!==this.epoch||this.closed?'cancelled':'prepared',prepared,reused,constructionMs);
  }catch(error){this.stats.failures++;return {...out('failed',prepared,reused,constructionMs),reason:String(error.message).slice(0,160)};}
  finally{if(this.active===token)this.active=null;finish();}
 }
 take(candidate){
  const at=this.#time();this.#prune(at);const entry=this.ready.get(candidate.identity);
  if(!this.closed&&at!==null&&entry&&matches(entry,candidate)&&at<entry.expiresAt&&entry.source.frame===0){this.ready.delete(candidate.identity);this.stats.consumed++;return entry.source;}
  if(entry)this.#remove(candidate.identity);this.stats.fallbacks++;return null;
 }
 diagnostics(){return {...this.stats,ready:this.ready.size,preparing:!!this.active,closed:this.closed,policy:'explicit-control05',cpuIsolation:false};}
 close(){this.closed=true;this.cancel();return this.active?.done??Promise.resolve();}
}
