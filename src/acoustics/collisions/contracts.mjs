// Original authored-contact contract only. No native collision acquisition is
// implied by a caller supplying positions, impulse or material labels.
import {createHash} from 'node:crypto';
import {componentIdentity,componentIdentityKey,componentSourceId,freezeComponent} from '../vehicle/components/contracts.mjs';
const branded=new WeakSet(),contexts=new WeakSet();
export const collisionLimits=Object.freeze({sampleRate:48000,blockFrames:512,events:1024,crashes:64,eventsPerCrash:32,
 voices:8,maximumAgeFrames:12000,maximumUncertaintyFrames:96,maximumDurationFrames:48000,maximumDryPeak:.02});
const need=(ok,why)=>{if(!ok)throw Error(why);};
const name=x=>typeof x==='string'&&/^[\w:.-]{1,64}$/.test(x);
const frame=x=>Number.isSafeInteger(x)&&x>=0;
const vector=x=>{need(Array.isArray(x)&&x.length===3&&x.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000),'finite authored collision vector');return [...x];};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const freeze=freezeComponent;
const families=Object.freeze({'collision-impact':'impact','collision-scrape':'scrape','collision-resonance':'resonance','glass-break':'glass','debris-impact':'debris'});
export function createAuthoredCollisionContext({session,knownThroughFrame}={}){
 need(/^[a-f0-9]{32}$/.test(session)&&frame(knownThroughFrame)&&knownThroughFrame>=512&&knownThroughFrame<=48000*40,'finite authored collision world');
 const context=freeze({session,knownThroughFrame,authority:'original-authored-collision-fixture'});contexts.add(context);return context;
}
export function createAuthoredCollisionEvent(input,context){
 need(contexts.has(context),'branded authored collision authority required');
 const identity=componentIdentity(input?.identity);need(identity.session===context.session&&Object.hasOwn(families,identity.component),'collision component identity');
 need(Array.isArray(input.participants)&&input.participants.length>0&&input.participants.length<=2,'explicit collision participants');
 const participants=input.participants.map(p=>{need(name(p.vehicleId)&&Number.isInteger(p.vehicleGeneration)&&p.vehicleGeneration>0&&p.vehicleGeneration<=2147483647&&Number.isInteger(p.model)&&p.model>=0&&p.model<=0xffffffff,'exact collision participant identity');return {vehicleId:p.vehicleId,vehicleGeneration:p.vehicleGeneration,model:p.model};}).sort((a,b)=>a.vehicleId.localeCompare(b.vehicleId));
 need(new Set(participants.map(p=>p.vehicleId)).size===participants.length&&participants.some(p=>p.vehicleId===identity.vehicleId&&p.vehicleGeneration===identity.vehicleGeneration&&p.model===identity.model),'collision owner belongs to exact participant set');
 need(name(input.eventId)&&name(input.crashId)&&Number.isSafeInteger(input.sequence)&&input.sequence>=0&&input.sequence<collisionLimits.events&&
  Number.isInteger(input.contactOrdinal)&&input.contactOrdinal>=0&&input.contactOrdinal<collisionLimits.eventsPerCrash,'collision event/crash/contact identity');
 need(input.parentEventId===null||name(input.parentEventId),'explicit collision parent identity');
 const timing=input.timing;
 need(timing?.basis==='authored-audio-frame-clock'&&frame(timing.occurrenceLowerFrame)&&frame(timing.occurrenceUpperFrame)&&
  timing.occurrenceUpperFrame>=timing.occurrenceLowerFrame&&timing.occurrenceUpperFrame-timing.occurrenceLowerFrame<=collisionLimits.maximumUncertaintyFrames&&
  frame(timing.observationFrame)&&timing.observationFrame>=timing.occurrenceUpperFrame&&frame(timing.validThroughFrame)&&
  timing.validThroughFrame>=timing.observationFrame&&timing.validThroughFrame-timing.occurrenceUpperFrame<=collisionLimits.maximumAgeFrames&&
  timing.validThroughFrame<=context.knownThroughFrame,'ordered finite collision occurrence/observation interval');
 const contact=input.contact,position=vector(contact?.position),normal=vector(contact?.normal),relativeVelocity=vector(contact?.relativeVelocity);
 need(Math.abs(Math.hypot(...normal)-1)<1e-7&&Math.hypot(...relativeVelocity)<=100&&contact.positionBasis==='authored-contact-point'&&
  contact.relativeMotionBasis==='authored-relative-velocity','qualified authored contact orientation/motion');
 const material=input.material;
 need(material&&['metal','glass','plastic','gravel','unknown'].includes(material.id)&&
  (material.id==='unknown'?material.basis==='unknown'&&material.confidence===null:material.basis==='authored-material'&&material.confidence===1),
  'material identity/confidence must stay authored or unknown');
 need(identity.component!=='glass-break'||material.id==='glass','glass synthesis requires authored glass material evidence');
 const severity=input.severity;let energyJ=null,impulseNs=null,frictionPowerProxyW=null;
 const closingSpeed=Math.max(0,-dot(relativeVelocity,normal)),tangentialSpeed=Math.sqrt(Math.max(0,dot(relativeVelocity,relativeVelocity)-dot(relativeVelocity,normal)**2));
 if(severity?.basis==='authored-effective-mass'){
  need(Number.isFinite(severity.effectiveMassKg)&&severity.effectiveMassKg>0&&severity.effectiveMassKg<=50000,'bounded authored effective mass');
  energyJ=.5*severity.effectiveMassKg*closingSpeed**2;
 }else if(severity?.basis==='authored-contact-impulse'){
  need(Number.isFinite(severity.impulseNs)&&severity.impulseNs>0&&severity.impulseNs<=1000000,'bounded authored contact impulse');impulseNs=severity.impulseNs;
 }else if(severity?.basis==='authored-friction-proxy'){
  need(identity.component==='collision-scrape'&&Number.isFinite(severity.normalForceN)&&severity.normalForceN>0&&severity.normalForceN<=1000000&&
   Number.isFinite(severity.frictionCoefficient)&&severity.frictionCoefficient>0&&severity.frictionCoefficient<=1,'explicit authored contact/friction proxy');
  frictionPowerProxyW=severity.normalForceN*severity.frictionCoefficient*tangentialSpeed;
 }else throw Error('supported authored severity evidence required; arbitrary loudness is not contact evidence');
 need(Number.isInteger(input.durationFrames)&&input.durationFrames>=64&&input.durationFrames<=collisionLimits.maximumDurationFrames&&
  input.radiatorMotion==='authored-fixed-world-contact'&&frame(input.poseKnownThroughFrame)&&
  input.poseKnownThroughFrame>=timing.occurrenceUpperFrame+input.durationFrames&&input.poseKnownThroughFrame<=context.knownThroughFrame,
  'finite event source and positive fixed-contact pose horizon');
 const key=componentIdentityKey(identity),assemblySourceId=componentSourceId(identity),sourceId='collision:'+createHash('sha256').update(key+':'+input.eventId).digest('hex').slice(0,40);
 const event=freeze({schema:1,authority:context.authority,identity,identityKey:key,sourceId,assemblySourceId,participants,eventId:input.eventId,crashId:input.crashId,
  sequence:input.sequence,contactOrdinal:input.contactOrdinal,parentEventId:input.parentEventId,kind:families[identity.component],
  timing:{...timing},contact:{position,normal,relativeVelocity,positionBasis:contact.positionBasis,relativeMotionBasis:contact.relativeMotionBasis},
  material:{...material},severity:{...severity,normalClosingSpeed:closingSpeed,tangentialSpeed,energyJ,impulseNs,frictionPowerProxyW,
   acousticIntensity:'unmeasured; explicit authored synthesis mapping only'},durationFrames:input.durationFrames,radiatorMotion:input.radiatorMotion,
  poseKnownThroughFrame:input.poseKnownThroughFrame,nativeOverlap:'native-owned; offline demonstration only',
  fingerprint:createHash('sha256').update(JSON.stringify(input)).digest('hex')});
 branded.add(event);return event;
}
export const isAuthoredCollisionEvent=event=>branded.has(event);

// Admission owns a bounded lifetime-ID ledger. Capacity rejection is terminal
// for that identity, so resending it cannot become a different sound event.
export class CollisionEventLedger {
 constructor(context,{mode='disabled'}={}){need(contexts.has(context)&&mode==='authored-fixture','collision production admission remains blocked');this.context=context;this.events=new Map();this.crashes=new Map();this.cancelledVehicles=new Set();this.lastNowFrame=-1;this.stats={admitted:0,rejected:0,replayed:0,capacity:0,cancelled:0};}
 admit(event,nowFrame){
  const reject=reason=>{this.stats.rejected++;return {admitted:false,reason};};
  if(!branded.has(event)||event.identity.session!==this.context.session||!frame(nowFrame)||nowFrame<this.lastNowFrame||nowFrame>this.context.knownThroughFrame)return reject('authority-or-clock');this.lastNowFrame=nowFrame;
  if(this.events.has(event.eventId)){this.stats.replayed++;return reject('replayed-event');}
  if(this.events.size>=collisionLimits.events){this.stats.capacity++;return reject('lifetime-event-budget');}
  if(nowFrame<event.timing.observationFrame||nowFrame>event.timing.validThroughFrame||nowFrame-event.timing.occurrenceUpperFrame>collisionLimits.maximumAgeFrames)return reject('future-or-expired');
  const vehicleKey=JSON.stringify([event.identity.vehicleId,event.identity.vehicleGeneration]);if(this.cancelledVehicles.has(vehicleKey))return reject('vehicle-generation-retired');
  const crash=this.crashes.get(event.crashId),participants=JSON.stringify(event.participants);
  const record={event,status:'rejected',admittedAtFrame:nowFrame};this.events.set(event.eventId,record);
  if(!crash&&this.crashes.size>=collisionLimits.crashes){this.stats.capacity++;return reject('crash-budget');}
  if(crash&&(crash.participants!==participants||crash.count>=collisionLimits.eventsPerCrash||event.sequence<=crash.sequence||event.contactOrdinal<=crash.ordinal||event.timing.occurrenceLowerFrame<crash.occurrence))return reject('crash-identity-order-or-budget');
  if(event.parentEventId!==null){const parent=this.events.get(event.parentEventId);if(!parent||parent.status!=='admitted'||parent.event.crashId!==event.crashId)return reject('secondary-parent-unavailable');}
  const state=crash??{participants,count:0,sequence:-1,ordinal:-1};state.count++;state.sequence=event.sequence;state.ordinal=event.contactOrdinal;state.occurrence=event.timing.occurrenceLowerFrame;this.crashes.set(event.crashId,state);
  record.status='admitted';this.stats.admitted++;return {admitted:true,event,observedToAdmissionFrames:nowFrame-event.timing.observationFrame};
 }
 retireVehicle(vehicleId,vehicleGeneration,reason){need(name(vehicleId)&&Number.isSafeInteger(vehicleGeneration)&&vehicleGeneration>0&&['vehicle-disappeared','vehicle-identity-changed','stop'].includes(reason),'explicit vehicle identity loss, not dismount or engine shutdown');const key=JSON.stringify([vehicleId,vehicleGeneration]);need(this.cancelledVehicles.size<collisionLimits.events||this.cancelledVehicles.has(key),'bounded retired vehicle identities');this.cancelledVehicles.add(key);for(const record of this.events.values())if(record.status==='admitted'&&record.event.identity.vehicleId===vehicleId&&record.event.identity.vehicleGeneration===vehicleGeneration){record.status='cancelled';this.stats.cancelled++;}return {reason,engineShutdownInferred:false};}
 state(eventId){return this.events.get(eventId)?.status??'unknown';}
}
