import {determinant3, transformPoint} from './collision-mesh.mjs';
import {digest} from './contracts.mjs';

const position = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 100000);
const identity = s => s && Number.isInteger(s.proxy) && s.proxy > 0 && s.proxy <= 0x7fffffff &&
  Number.isInteger(s.archetype) && s.archetype > 0 && s.archetype <= 0xffffffff && position(s.origin);

export function bindCameraInterior01(frame, sourceAgeMs, remainingMs, proofEpoch=frame.worldPreparationStartedUtc) {
 const sample=frame.cameraInterior01, listener=frame.listener;
 if(!identity(sample)||!listener.valid||listener.paused||!Number.isSafeInteger(sample.observationTicks)||
    !Number.isSafeInteger(listener.observationTicks)||!Number.isFinite(listener.clockFrequency)||listener.clockFrequency<=0)return null;
 const offsetMs=(sample.observationTicks-listener.observationTicks)*1000/listener.clockFrequency;
 if(Math.abs(offsetMs)>50||!Number.isFinite(sourceAgeMs)||sourceAgeMs<0||sourceAgeMs>250)return null;
 // A later getter does not extend the camera's original observation lease.
 const durationMs=Math.min(1000-sourceAgeMs+Math.min(0,offsetMs),remainingMs??1000);
 if(!(durationMs>0&&durationMs<=1000))return null;
 return {proxy:sample.proxy,archetype:sample.archetype,origin:[...sample.origin],durationMs,epoch:proofEpoch};
}

export function interiorObservationKey01(sample){
 return identity(sample)?digest([sample.proxy,sample.archetype,sample.origin]):null;
}

export const surroundingInteriorHalfWidth01=8;
// Stable workset coordinates inside a single observed proxy. This selects a
// bounded region only. The worker still resolves the exact catalogue instance.
export function interiorWorksetAnchor01(sample,listener,sources,radius,surrounding=false,local=false){
 if(!identity(sample))return null;
 const cell=Math.min(local?2:8,radius/2);
 const anchor=sample.origin.map((v,i)=>v+cell*(Math.floor((listener[i]-v)/cell)+.5));
 const reach=surrounding?Math.min(radius,surroundingInteriorHalfWidth01):cell/2;
 return [listener,...sources].every(p=>p.every((v,i)=>Math.abs(v-anchor[i])<=reach))?anchor:null;
}

export function exteriorWorksetAnchor01(listener,sources,radius){
 if(radius<4)return null;
 const anchor=listener.map(v=>4*Math.floor(v/4)+2);
 return sources.every(p=>p.every((v,i)=>Math.abs(v-anchor[i])<=2))?anchor:null;
}

export function matchInteriorInstance01(instances,sample,{session,generation,catalogSHA256,epoch}){
 if(!identity(sample)||sample.session!==session||sample.generation!==generation||
    sample.catalogSHA256!==catalogSHA256||!epoch||sample.epoch!==epoch)return null;
 const hash='0x'+sample.archetype.toString(16).padStart(8,'0');
 // Float32 proxy coordinates and the selected YMAP translation may differ
 // slightly. Every candidate in tolerance participates in ambiguity checking.
 const matches=(instances[hash]??[]).filter(i=>Math.hypot(...i.origin.map((v,j)=>v-sample.origin[j]))<=.0625);
 return matches.length===1?matches[0].id:null;
}

export function inverseInteriorTransform01(m){
 const determinant=determinant3(m);
 // Preserve native analytic error bounds and materials under rigid placement.
 const basis=[m.slice(0,3),m.slice(4,7),m.slice(8,11)];
 if(Math.abs(determinant-1)>2e-5||basis.some((axis,j)=>Math.abs(Math.hypot(...axis)-1)>2e-5||
   basis.slice(0,j).some(other=>Math.abs(axis.reduce((sum,v,k)=>sum+v*other[k],0))>2e-5)))return null;
 const [a,b,c,,d,e,f,,g,h,i]=m;
 const r=[
  (e*i-f*h)/determinant,(c*h-b*i)/determinant,(b*f-c*e)/determinant,0,
  (f*g-d*i)/determinant,(a*i-c*g)/determinant,(c*d-a*f)/determinant,0,
  (d*h-e*g)/determinant,(b*g-a*h)/determinant,(a*e-b*d)/determinant,0,0,0,0,1,
 ];
 for(let j=0;j<3;j++)r[12+j]=-(m[12]*r[j]+m[13]*r[4+j]+m[14]*r[8+j]);
 return r;
}

export function transformInteriorBounds01(box,transform){
 if(!box)return null;
 const corners=Array.from({length:8},(_,mask)=>transformPoint(box.min.map((v,j)=>(mask>>j)&1?box.max[j]:v),transform));
 return {min:[0,1,2].map(j=>Math.min(...corners.map(p=>p[j]))),max:[0,1,2].map(j=>Math.max(...corners.map(p=>p[j])))};
}
