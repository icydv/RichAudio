import {componentLimits,componentIdentity,componentIdentityKey,componentSourceId,componentObservation,requireAuthoredComponentCapability,requireComponent} from './contracts.mjs';
import {OriginalComponentSource} from './source.mjs';
export class ComponentSourceSet {
 constructor({capability,identities}={}) {
  this.capability=requireAuthoredComponentCapability(capability);
  requireComponent(Array.isArray(identities)&&identities.length>0&&identities.length<=componentLimits.sources,'Bounded declared source set required');
  this.entries=new Map();this.lastFrame=-1;this.stats={accepted:0,rejected:0,retired:0,expired:0,scopeLoss:0,engineShutdownInferred:0};
  for(const value of identities){const identity=componentIdentity(value),key=componentIdentityKey(identity);requireComponent(identity.session===capability.session&&!this.entries.has(key),'Unique exact session/component identity required');
   const id=componentSourceId(identity),seed=parseInt(id.slice(-8),16)||1;
   this.entries.set(key,{identity,id,source:new OriginalComponentSource(identity.component,{seed}),observation:null,retired:false,reason:null,lastTriggeredSequence:-1});}
 }
 accept(input) {
  const o=componentObservation(input,this.capability),entry=this.entries.get(componentIdentityKey(o.identity));
  const nowFrame=this.lastFrame+1;
  if(!entry||entry.retired||o.receivedFrame>nowFrame||o.validThroughFrame<nowFrame||entry.observation&&
   (o.sequence<=entry.observation.sequence||o.observedFrame<=entry.observation.observedFrame||o.receivedFrame<entry.observation.receivedFrame)) {this.stats.rejected++;return false;}
  if(o.eligible)entry.source.setState(o.state);entry.observation=o;this.stats.accepted++;
  if(!o.eligible){entry.retired=true;entry.reason='source-scope-lost';this.stats.retired++;this.stats.scopeLoss++;}
  return true;
 }
 retire(identity,reason,frame) {
  requireComponent(['source-scope-lost','vehicle-disappeared','session-stop'].includes(reason)&&Number.isSafeInteger(frame)&&frame>=this.lastFrame,'Explicit lifecycle retirement required');
  const e=this.entries.get(componentIdentityKey(identity));if(!e||e.retired)return false;e.retired=true;e.reason=reason;this.stats.retired++;if(reason==='source-scope-lost')this.stats.scopeLoss++;return true;
 }
 prepare(frame,frames=512) {
  requireComponent(Number.isSafeInteger(frame)&&frame>=0&&(frame===this.lastFrame+1||this.lastFrame===-1&&frame===0),'Consecutive component block clock required');
  requireComponent(Number.isSafeInteger(frames)&&frames>0&&frames<=512&&frame+frames-1<=this.capability.maximumFrame,'Finite authored source horizon required');
  const result=[];
  for(const e of this.entries.values()) {
   const o=e.observation,qualified=!e.retired&&o&&o.eligible&&o.receivedFrame<=frame&&o.observedFrame<=frame&&o.validThroughFrame>=frame+frames-1;
   if(o&&!e.retired&&o.validThroughFrame<frame+frames-1){e.retired=true;e.reason='source-expired';this.stats.expired++;this.stats.retired++;}
   if(qualified){if(o.state.event&&o.sequence!==e.lastTriggeredSequence){e.source.trigger(o.state.event,frame);e.lastTriggeredSequence=o.sequence;}result.push({id:e.id,generation:e.identity.componentGeneration,...o.pose,valid:true,emitting:true});}
   e.qualified=Boolean(qualified);
  }
  this.lastFrame=frame+frames-1;return result;
 }
 renderInto(inputs,frames=512) {for(const e of this.entries.values()){requireComponent(inputs[e.id] instanceof Float32Array,'Caller-owned dry source buffers required');e.source.renderInto(inputs[e.id],frames,{qualified:e.qualified===true});}}
 diagnostics(){return {authority:this.capability.authority,...this.stats,sources:[...this.entries.values()].map(e=>({id:e.id,identity:e.identity,retired:e.retired,reason:e.reason,qualified:e.qualified===true,source:e.source.diagnostics()}))};}
}
