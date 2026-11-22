// Authored offline geometry only. This never certifies a live pose after its
// newest observation, and does not turn old spatial time into emission time.
// State time is authored at vehicle ticks here. Native getter acquisition is
// a separate interval; a nearby pose timestamp alone cannot qualify it.
const contracts=new WeakSet(),FS=48000,BLOCK=512;
const check=(yes,message)=>{if(!yes)throw Error(message);};
const same=(a,b)=>Array.isArray(a)&&a.length===3&&a.every((x,i)=>x===b[i]);
function pose(p){for(const k of ['position','velocity','forward','up'])check(Array.isArray(p?.[k])&&p[k].length===3&&p[k].every(x=>Number.isFinite(x)&&Math.abs(x)<=100000),'Finite stationary fixture pose required');
 check(p.velocity.every(x=>x===0)&&Math.abs(Math.hypot(...p.forward)-1)<1e-6&&Math.abs(Math.hypot(...p.up)-1)<1e-6&&Math.abs(p.forward.reduce((n,x,i)=>n+x*p.up[i],0))<1e-6,'Stationary zero-velocity orthonormal pose required');
 return Object.freeze(Object.fromEntries(['position','velocity','forward','up'].map(k=>[k,Object.freeze([...p[k]])])));}
export function createAuthoredStationaryEmissionContract({authority,session,source,listener,knownThroughFrame,coordinates,units}){
 check(authority==='authored-offline-fixture'&&/^[a-f0-9]{32}$/.test(session),'Explicit authored offline stationary authority required');
 check(source&&typeof source.id==='string'&&/^[\w:-]{1,64}$/.test(source.id)&&Number.isInteger(source.generation)&&source.generation>0&&Number.isInteger(source.model)&&source.model>=0&&source.model<=0xffffffff&&['player','npc'].includes(source.context),'Stationary source identity required');
 check(Number.isInteger(listener?.generation)&&listener.generation>0&&Number.isInteger(knownThroughFrame)&&knownThroughFrame>=BLOCK-1&&knownThroughFrame<=40*FS,'Bounded stationary fixture horizon required');
 check(typeof coordinates==='string'&&typeof units==='string','Explicit stationary coordinate representation required');
 const c=Object.freeze({authority,session,source:Object.freeze({id:source.id,generation:source.generation,model:source.model,context:source.context,...pose(source)}),listener:Object.freeze({generation:listener.generation,...pose(listener)}),knownThroughFrame,coordinates,units});contracts.add(c);return c;
}
export class StationaryEmissionController {
 constructor(contract){check(contracts.has(contract),'Branded authored stationary fixture contract required');this.contract=contract;this.failure=null;this.selected=null;this.stats={observations:0,selections:0,unavailable:0,terminalRejects:0};}
 reject(reason){this.failure=this.failure??reason;this.stats.terminalRejects++;throw Error('Stationary emission contract rejected: '+this.failure);}
 active(){if(this.failure)throw Error('Stationary emission contract rejected: '+this.failure);}
 observe(frame){this.active();const c=this.contract,s=frame.listener;
  if(frame.session!==c.session||s.session!==c.session||s.coordinates!==c.coordinates||s.units!==c.units||s.generation!==c.listener.generation)return this.reject('listener identity or representation changed');
  if(['position','velocity','forward','up'].some(k=>!same(s[k],c.listener[k])))return this.reject('listener motion or orientation changed');
  for(const v of frame.vehicles){if(v.id!==c.source.id||v.generation!==c.source.generation||v.model!==c.source.model||v.context!==c.source.context)return this.reject('source identity changed');
   if(['position','velocity','forward','up'].some(k=>!same(v[k],c.source[k])))return this.reject('source motion or orientation changed');}
  this.stats.observations++;
 }
 select(snapshots,renderFrame,now){this.active();const c=this.contract;if(!Number.isInteger(renderFrame)||renderFrame<0||renderFrame+BLOCK-1>c.knownThroughFrame)return this.reject('authored horizon exhausted');
  if(!Array.isArray(snapshots)||snapshots.length>64||!Number.isFinite(now)||now<0)return this.reject('invalid bounded selection clock');
  const latest=snapshots.at(-1),emissionTime=renderFrame/FS;
  if(!latest||!Number.isFinite(latest.wallExpires)||now>=latest.wallExpires||!latest.frame.listener.valid||latest.frame.listener.paused){this.stats.unavailable++;return null;}
  let found=null;for(const s of snapshots){if(!Number.isFinite(s.wallExpires)||now>=s.wallExpires||!s.frame.listener.valid||s.frame.listener.paused)continue;const v=s.frame.vehicles.find(v=>v.id===c.source.id&&v.generation===c.source.generation&&v.model===c.source.model&&v.context===c.source.context&&v.valid);if(!v)continue;
   const q=s.time+(v.observationTicks-s.frame.listener.observationTicks)/s.frame.listener.clockFrequency;
   if(!Number.isFinite(q))return this.reject('operating observation mapping is not finite');
   if(q>emissionTime+1e-12||(renderFrame+BLOCK-1)/FS-q>.25+1e-12)continue;
   if(!found||q>found.observationTime)found={v,observationTime:q,sequence:s.frame.listener.sequence};
  }
  if(!latest.frame.vehicles.some(v=>v.id===c.source.id&&v.valid)||!found){this.stats.unavailable++;return null;}
  if(this.selected&&found.observationTime<this.selected.observationTime-1e-12)return this.reject('operating observation clock moved backwards');
  const lift=this.selected?(found.observationTime===this.selected.observationTime?this.selected.lift:found.v.operatingPoint<this.selected.operatingPoint-.002):false;
  this.selected={observationTime:found.observationTime,operatingPoint:found.v.operatingPoint,running:found.v.running,lift,sequence:found.sequence,emissionFrame:renderFrame,emissionTime,observationAgeMs:(emissionTime-found.observationTime)*1000,clockBasis:'Authored state observation time mapped to current PCM emission frame; native getter interval unavailable',authority:c.authority};this.stats.selections++;
  // Geometry is valid at CURRENT emission time only because the separately
  // branded authored world is stationary for the entire declared horizon.
  return {...this.selected,vehicle:found.v};
 }
 diagnostics(){return {authority:this.contract.authority,knownThroughFrame:this.contract.knownThroughFrame,failure:this.failure,...this.stats,lastSelection:this.selected};}
}
