import {createHash} from 'node:crypto';
import {getVehicleComponent} from './registry.mjs';
const capabilities = new WeakSet();
export const componentLimits = Object.freeze({sampleRate:48000,blockFrames:512,sources:8,leaseFrames:12000,
 dryPeak:.025,mechanicalVoices:4,eventsPerSource:128,outputPeakBudget:.4});
export const freezeComponent = x => { if (x && typeof x === 'object') { for (const v of Object.values(x)) freezeComponent(v); Object.freeze(x); } return x; };
export const requireComponent = (ok,why) => { if (!ok) throw Error(why); };
const label = (s,max) => typeof s === 'string' && s.length <= max && /^[\w:.-]+$/.test(s);
const gen = x => Number.isSafeInteger(x) && x > 0 && x <= 2147483647;
export function componentIdentity(input) {
 requireComponent(input && typeof input.session==='string' && /^[a-f0-9]{32}$/.test(input.session) && Object.keys(input).length===7 && label(input.vehicleId,48) && gen(input.vehicleGeneration) &&
  Number.isInteger(input.model) && input.model >= 0 && input.model <= 0xffffffff && label(input.assembly,24) && gen(input.componentGeneration), 'Exact vehicle/component identity required');
 getVehicleComponent(input.component);
 return freezeComponent({session:input.session,vehicleId:input.vehicleId,vehicleGeneration:input.vehicleGeneration,model:input.model,
  component:input.component,assembly:input.assembly,componentGeneration:input.componentGeneration});
}
export const componentIdentityKey = input => { const x=componentIdentity(input);return JSON.stringify([x.session,x.vehicleId,x.vehicleGeneration,x.model,x.component,x.assembly,x.componentGeneration]); };
export const componentSourceId = identity => 'component:'+createHash('sha256').update(componentIdentityKey(identity)).digest('hex').slice(0,40);
export function createAuthoredComponentCapability({session,maximumFrame}={}) {
 requireComponent(typeof session==='string' && /^[a-f0-9]{32}$/.test(session) && Number.isSafeInteger(maximumFrame) && maximumFrame >=511 && maximumFrame<=48000*40, 'Finite authored component context required');
 const c=freezeComponent({session,maximumFrame,authority:'original-authored-component-fixture'});capabilities.add(c);return c;
}
export function requireAuthoredComponentCapability(capability) { requireComponent(capabilities.has(capability),'Branded authored component capability required');return capability; }
export function componentPose(input) {
 requireComponent(input && ['position','velocity','forward','up'].every(k=>Array.isArray(input[k])&&input[k].length===3&&input[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)), 'Explicit finite component pose required');
 requireComponent(Math.hypot(...input.velocity)<=100 && Math.abs(Math.hypot(...input.forward)-1)<1e-6 && Math.abs(Math.hypot(...input.up)-1)<1e-6 &&
  Math.abs(input.forward.reduce((n,x,i)=>n+x*input.up[i],0))<1e-6, 'Qualified component pose speed/orientation required');
 return freezeComponent(Object.fromEntries(['position','velocity','forward','up'].map(k=>[k,[...input[k]]])));
}
export function componentObservation(input,capability) {
 const c=requireAuthoredComponentCapability(capability),identity=componentIdentity(input?.identity);
 requireComponent(identity.session===c.session && input.authority===c.authority && Number.isSafeInteger(input.sequence)&&input.sequence>=0&&
  Number.isSafeInteger(input.observedFrame)&&input.observedFrame>=0&&Number.isSafeInteger(input.receivedFrame)&&input.receivedFrame>=input.observedFrame&&
  Number.isSafeInteger(input.validThroughFrame)&&input.validThroughFrame>=input.receivedFrame&&input.validThroughFrame-input.observedFrame<=componentLimits.leaseFrames&&
  input.validThroughFrame<=c.maximumFrame&&typeof input.eligible==='boolean', 'Ordered finite authored component lease required');
 const state=input.state??{};
 requireComponent(state && Object.getPrototypeOf(state)===Object.prototype && Object.keys(state).length<=12,'Bounded plain component state required');
 for(const [key,value] of Object.entries(state)) {
  requireComponent(label(key,40),'Bounded component state key required');
  if(key==='event')requireComponent(value===null || value && Object.getPrototypeOf(value)===Object.prototype && Object.keys(value).length<=8 &&
   Object.entries(value).every(([k,v])=>label(k,40)&&(typeof v==='string'?label(v,64):Number.isFinite(v))),'Bounded mechanical event required');
  else requireComponent(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&label(value,64),'Bounded scalar component state required');
 }
 return freezeComponent({identity,sequence:input.sequence,observedFrame:input.observedFrame,receivedFrame:input.receivedFrame,
  validThroughFrame:input.validThroughFrame,eligible:input.eligible,authority:c.authority,pose:componentPose(input.pose),state:structuredClone(state)});
}
