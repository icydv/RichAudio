import test from 'node:test';import assert from 'node:assert/strict';
import {collisionFixture02} from '../src/acoustics/collisions/fixtures.mjs';
import {createAuthoredCollisionContext,createAuthoredCollisionEvent,CollisionEventLedger,isAuthoredCollisionEvent} from '../src/acoustics/collisions/contracts.mjs';
import {OriginalCollisionSource,collisionSourceLevel} from '../src/acoustics/collisions/source.mjs';
import {renderCollisionFixture02,prepareCollisionEventKernel02} from '../src/acoustics/collisions/render.mjs';
import {createVehicleEnvironment} from '../src/acoustics/vehicle/environment.mjs';
import {AuthoredTransientDescriptorSource} from '../src/acoustics/events/contracts.mjs';
const fixture=()=>collisionFixture02('high-energy',{seconds:1});
const revised=(event,context,change)=>{const input=structuredClone(event);change(input);return createAuthoredCollisionEvent(input,context);};

test('collision authority, exact component identity, occurrence and physical evidence stay separate',()=>{
 const f=fixture(),event=f.events[0];assert(isAuthoredCollisionEvent(event));assert.equal(event.severity.energyJ,200000);assert.equal(event.severity.acousticIntensity,'unmeasured; explicit authored synthesis mapping only');
 assert.equal(event.participants.length,2);assert.equal(event.nativeOverlap,'native-owned; offline demonstration only');
 assert.throws(()=>createAuthoredCollisionEvent(event,{...f.context}),/branded/);assert.equal(isAuthoredCollisionEvent({...event}),false);
 assert.throws(()=>revised(event,f.context,e=>e.contact.positionBasis='native-observed'),/authored/);
 assert.throws(()=>revised(event,f.context,e=>e.severity={basis:'arbitrary-loudness',gain:1}),/severity/);
 assert.throws(()=>revised(event,f.context,e=>e.timing.occurrenceUpperFrame=e.timing.observationFrame+1),/ordered/);
 assert.throws(()=>revised(event,f.context,e=>e.material={id:'metal',basis:'native-material',confidence:1}),/material/);
 assert.throws(()=>revised(event,f.context,e=>e.participants[0].model=123),/participant/);
});

test('barrier and wall contacts lie on authored surfaces while radiator offsets remain explicit',()=>{
 for(const [name,environment,surfaceId]of [['motorcycle-barrier','corner','barrier'],['light-scrape','canyon','wall-north']]){
  const f=collisionFixture02(name,{environment,seconds:1}),event=f.events[0],surface=createVehicleEnvironment(environment).scene.tile.surfaces.find(s=>s.id===surfaceId);
  const planeDistance=event.contact.position.reduce((sum,n,i)=>sum+(n-surface.center[i])*surface.normal[i],0);assert.equal(planeDistance,0);
  assert.deepEqual(event.contact.normal,surface.normal);assert.equal(Math.hypot(...event.contact.radiatorOffset),.05);assert.equal(event.radiator.basis,'authored-contact-plus-explicit-offset');
  assert.deepEqual(event.radiator.position,event.contact.position.map((n,i)=>n+event.contact.radiatorOffset[i]));assert.equal(event.radiator.nativeAttachmentVerified,false);assert(event.severity.normalClosingSpeed>0);
  assert.throws(()=>revised(event,f.context,e=>e.contact.radiatorOffset=[0,1,0]),/radiator offset/);
 }
});

test('crash subevents retain parent/participant identity and reject event replay or capacity bypass',()=>{
 const f=fixture(),ledger=new CollisionEventLedger(f.context,{mode:'authored-fixture'}),[primary,glass,debris]=f.events;
 assert.throws(()=>new CollisionEventLedger(f.context),/production/);
 const orphan=new CollisionEventLedger(f.context,{mode:'authored-fixture'});assert.equal(orphan.admit(glass,glass.timing.observationFrame).reason,'secondary-parent-unavailable');
 assert(orphan.admit(primary,glass.timing.observationFrame).admitted);assert.equal(orphan.admit(glass,glass.timing.observationFrame).reason,'replayed-event','a consumed rejected identity cannot be silently replaced');
 assert(ledger.admit(primary,primary.timing.observationFrame).admitted);assert.equal(ledger.admit(primary,primary.timing.observationFrame).reason,'replayed-event');assert(ledger.admit(glass,glass.timing.observationFrame).admitted);
 assert(ledger.admit(debris,debris.timing.observationFrame).admitted);
 const simultaneous=e=>{e.timing.occurrenceLowerFrame=e.timing.occurrenceUpperFrame=e.timing.observationFrame=debris.timing.observationFrame;};
 const separate=revised(primary,f.context,e=>{e.eventId='another-impact';e.sequence=3;e.contactOrdinal=3;simultaneous(e);});assert.notEqual(separate.sourceId,primary.sourceId);assert.equal(separate.assemblySourceId,primary.assemblySourceId);
 assert(ledger.admit(separate,separate.timing.observationFrame).admitted);
 for(let i=4;i<32;i++){const next=revised(primary,f.context,e=>{e.eventId='impact-'+i;e.sequence=i;e.contactOrdinal=i;simultaneous(e);});assert(ledger.admit(next,next.timing.observationFrame).admitted);}
 const wrong=revised(primary,f.context,e=>{e.eventId='wrong-order';e.sequence=32;e.contactOrdinal=31;simultaneous(e);});assert.equal(ledger.admit(wrong,wrong.timing.observationFrame).reason,'crash-identity-order-or-budget');
});

test('expiry and explicit source-vehicle disappearance do not invent engine shutdown or a dismount event',()=>{
 const f=fixture(),event=f.events[0],ledger=new CollisionEventLedger(f.context,{mode:'authored-fixture'});
 assert.equal(ledger.admit(event,event.timing.observationFrame-1).reason,'future-or-expired');assert(ledger.admit(event,event.timing.observationFrame).admitted);
 assert.throws(()=>ledger.retireVehicle(event.identity.vehicleId,1,'dismount'),/explicit/);
 assert.equal(ledger.retireVehicle(event.identity.vehicleId,1,'vehicle-disappeared').engineShutdownInferred,false);assert.equal(ledger.state(event.eventId),'cancelled');
 assert.equal(ledger.admit(f.events[2],f.events[2].timing.observationFrame).reason,'vehicle-generation-retired');
 const old=new CollisionEventLedger(f.context,{mode:'authored-fixture'});assert.equal(old.admit(event,event.timing.validThroughFrame+1).reason,'future-or-expired');
});

test('original impact, glass and scrape sounds are deterministic, finite and sensitive to genuine authored severity',()=>{
 for(const name of ['motorcycle-barrier','light-scrape','high-energy','glass']){
  const f=collisionFixture02(name,{seconds:1}),event=f.events[0],a=new OriginalCollisionSource(event,{outputStartFrame:event.timing.occurrenceUpperFrame,firstProcessFrame:0}),b=new OriginalCollisionSource(event,{outputStartFrame:event.timing.occurrenceUpperFrame,firstProcessFrame:0});
  const x=new Float32Array(512),y=new Float32Array(512);for(let at=0;at<48000;at+=512){a.renderAtInto(x,at);b.renderAtInto(y,at);assert.deepEqual(x,y);if(at+512<=event.timing.occurrenceUpperFrame||at>=event.timing.occurrenceUpperFrame+event.durationFrames)assert(x.every(v=>v===0));}
  assert(a.peak>0&&a.peak<=.02);assert.equal(a.samples,undefined);const copy=new Float32Array(a.durationFrames);a.copyDryInto(copy);copy.fill(1);assert.equal(a.pcmSha256,b.pcmSha256);
  assert.throws(()=>a.renderAtInto(x,0),/contiguous/);
 }
 const f=fixture(),event=f.events[0],rest=revised(event,f.context,e=>e.contact.relativeVelocity=[0,0,0]);assert.equal(collisionSourceLevel(rest),0);
 const unknown=revised(event,f.context,e=>e.material={id:'unknown',basis:'unknown',confidence:null});assert.notEqual(new OriginalCollisionSource(unknown,{outputStartFrame:10240}).pcmSha256,new OriginalCollisionSource(event,{outputStartFrame:10240}).pcmSha256);
 const glass=collisionFixture02('glass',{seconds:1});assert.throws(()=>revised(glass.events[0],glass.context,e=>e.material={id:'unknown',basis:'unknown',confidence:null}),/glass/);
});

test('short collision sources enter the existing LATENCY-02 branded kernel/descriptor path without vehicle history',()=>{
 const f=fixture(),event=f.events[0],prepared=prepareCollisionEventKernel02(event,{scene:createVehicleEnvironment('direct').scene,listenerPose:f.listener}),kernel=prepared.kernel;
 assert.equal(kernel.waveformFrames,event.durationFrames);assert.equal(kernel.waveformSha256,prepared.originalSourceSha256);assert.equal(kernel.kernelAffectedHistoryFrames,0);assert(kernel.peak<=.001);
 const source=new AuthoredTransientDescriptorSource({library:[{kernelSlot:0,kernel}],session:f.context.session,qpcFrequency:48000,mode:'authored-fixture'});
 const result=source.admit({eventId:1,sourceId:1,sourceGeneration:1,sourceEventSequence:event.sequence,kernelSlot:0,kernelGeneration:1,listenerGeneration:1,sceneGeneration:1,
  sourcePose:kernel.sourcePose,listenerPose:kernel.listenerPose,timing:{basis:'authored-fixture-clock',qpcFrequency:48000,occurrenceLowerQpc:event.timing.occurrenceLowerFrame,
   occurrenceUpperQpc:event.timing.occurrenceUpperFrame,acquisitionBeforeQpc:event.timing.observationFrame,observationAfterQpc:event.timing.observationFrame}});
 assert(result.admitted);assert.equal(result.descriptor.occurrenceUpperQpc,event.timing.occurrenceUpperFrame);assert.equal(source.stats.retrospectiveDelayMs,0);
 assert.throws(()=>prepareCollisionEventKernel02(collisionFixture02('light-scrape',{seconds:1}).events[0],{scene:createVehicleEnvironment('direct').scene,listenerPose:f.listener}),/short/);
});

test('the same collision dry signals receive different genuine open, canyon and tunnel acoustics',async()=>{
 const outputs=[];for(const environment of ['direct','canyon','tunnel'])outputs.push(await renderCollisionFixture02(collisionFixture02('high-energy',{environment,seconds:1.2})));
 const [open,street,tunnel]=outputs;assert.deepEqual(open.summary.sources.map(s=>s.pcmSha256),street.summary.sources.map(s=>s.pcmSha256));assert.deepEqual(open.summary.sources.map(s=>s.pcmSha256),tunnel.summary.sources.map(s=>s.pcmSha256));
 assert.notEqual(open.summary.outputSha256,street.summary.outputSha256);assert.notEqual(street.summary.outputSha256,tunnel.summary.outputSha256);
 assert.equal(open.summary.lateEnergy,0);assert(tunnel.summary.lateEnergy>0);assert.equal(open.summary.firstQualifiedPaths.filter(p=>p.order>0).length,0);assert(street.summary.firstQualifiedPaths.some(p=>p.order===1));assert(tunnel.summary.firstQualifiedPaths.some(p=>p.order===2));
 for(const output of outputs){assert.equal(output.summary.diagnostics.renderer.limited,0);assert.equal(output.summary.diagnostics.history.affectedFrames,0);assert(output.summary.peak<.4);assert.equal(output.summary.admissions.length,3);assert(output.summary.admissions.every(a=>a.softwareEmissionLatenessFrames<512));
  for(const p of output.summary.firstQualifiedPaths)assert(Math.abs(p.delayFrames-p.distance/343*48000)<1e-8);}
});
