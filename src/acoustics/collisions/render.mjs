// Entirely offline/source-worker orchestration through the existing engine.
import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {VehicleAcousticPipeline} from '../vehicle/pipeline.mjs';
import {createVehicleEnvironment,BoundedLateReverb} from '../vehicle/environment.mjs';
import {CollisionEventLedger,isAuthoredCollisionEvent,collisionLimits} from './contracts.mjs';
import {OriginalCollisionSource} from './source.mjs';
import {createPreparedTransientKernel} from '../events/prepared-path.mjs';
import {validated} from '../engine/contracts.mjs';
const FS=48000,BLOCK=512,need=(ok,why)=>{if(!ok)throw Error(why);};
export async function renderCollisionFixture02(fixture,{masterGain=.35,late=true,scene:sceneOverride=null}={}){
 need(fixture&&Array.isArray(fixture.events)&&fixture.events.length>0&&fixture.events.length<=collisionLimits.voices&&new Set(fixture.events.map(e=>e.sourceId)).size===fixture.events.length&&
  fixture.events.every(e=>isAuthoredCollisionEvent(e)&&e.poseKnownThroughFrame>=fixture.frames)&&Number.isInteger(fixture.frames)&&fixture.frames>BLOCK&&fixture.frames<=192000,'finite original event/radiator fixture');
 if(sceneOverride!==null)need(validated.scene(sceneOverride)&&sceneOverride.tile?.coverage==='complete-synthetic'&&sceneOverride.tile.session===fixture.context.session&&sceneOverride.tile.surfaces.every(s=>s.provenance.kind==='synthetic'),'qualified same-session original static scene override');
 const environment=createVehicleEnvironment(fixture.environment,{quality:'quality',duration:fixture.frames/FS});if(sceneOverride){environment.scene=sceneOverride;environment.lateEvidence=null;}
 const ids=fixture.events.map(e=>e.sourceId),ledger=new CollisionEventLedger(fixture.context,{mode:'authored-fixture'}),sources=new Map(),headroom={omittedPaths:0};
 const pipeline=new VehicleAcousticPipeline({scene:environment.scene,sourceIds:ids,masterGain,quality:'quality',acceleration:'cpu',directStem:true,continuousRates:true,
  controlFilter:(control,renderer)=>{
   // The same conservative factor-two interpolation allowance used by the
   // component mixer bounds the fractional history read as well as its input.
   const weight=2*collisionLimits.maximumDryPeak*masterGain,occupied=new Map();let bound=0;for(const slot of renderer.slots)if(slot.active){const pressure=Math.max(slot.gain[0],slot.releaseLeft?0:slot.target[0])*weight;occupied.set(slot.id,pressure);bound+=pressure;}
   const paths=[];for(const p of [...control.paths].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))){const pressure=p.bands[0]*weight,extra=Math.max(0,pressure-(occupied.get(p.id)??0));if(bound+extra>.35){headroom.omittedPaths++;continue;}bound+=extra;paths.push(p);}return {...control,paths};
  }});
 const diffuse=new BoundedLateReverb(late?environment.lateEvidence:null,{wet:.12}),dry=Object.fromEntries(ids.map(id=>[id,new Float32Array(BLOCK)])),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK),directL=new Float32Array(BLOCK),directR=new Float32Array(BLOCK),wetL=new Float32Array(BLOCK),wetR=new Float32Array(BLOCK),allL=new Float32Array(fixture.frames),allR=new Float32Array(fixture.frames),costs=[],admissions=[];
 if(diffuse.evidence){const b=diffuse.evidence.bounds;need([fixture.listener.position,...fixture.events.map(e=>e.radiator.position)].every(p=>p.every((x,i)=>x>=b.min[i]&&x<=b.max[i])),'every source/listener lies inside the complete authored late enclosure');}
 let peak=0,energy=0,lateEnergy=0,firstNonzero=-1,firstPaths=null;
 try{for(let frame=0;frame<fixture.frames;frame+=BLOCK){const begin=performance.now(),n=Math.min(BLOCK,fixture.frames-frame);
   for(const event of fixture.events)if(!sources.has(event.eventId)&&frame>=event.timing.observationFrame){const admitted=ledger.admit(event,frame);need(admitted.admitted,'fixture event admission');const scheduled=Math.max(frame,event.timing.occurrenceUpperFrame);
    sources.set(event.eventId,new OriginalCollisionSource(event,{outputStartFrame:scheduled,firstProcessFrame:frame}));admissions.push({eventId:event.eventId,occurrenceUpperFrame:event.timing.occurrenceUpperFrame,observationFrame:event.timing.observationFrame,admittedFrame:frame,scheduledFrame:scheduled,softwareEmissionLatenessFrames:scheduled-event.timing.occurrenceUpperFrame});}
   for(const event of fixture.events){dry[event.sourceId].fill(0);sources.get(event.eventId)?.renderAtInto(dry[event.sourceId],frame,n);}
   // The whole stationary radiator geometry is explicitly authored/prewarmed;
   // admission of an event never fabricates a newly observed source trajectory.
   const control=await pipeline.prepare({time:frame/FS,session:fixture.context.session,generation:1,listener:fixture.listener,sources:fixture.events.map(event=>({id:event.sourceId,generation:event.identity.componentGeneration,
    position:event.radiator.position,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:true}))},{geometryTimeMs:frame/48});
   if(!firstPaths&&frame>=10240)firstPaths=control.paths.map(p=>({sourceId:p.sourceId,order:p.order,distance:p.distance,delayFrames:p.delay*FS,bands:p.bands,rate:p.rate}));
   pipeline.process(dry,left,right,n,directL,directR);diffuse.processInto(directL,directR,wetL,wetR,{enabled:late&&!!environment.lateEvidence});
   for(let i=0;i<n;i++){const l=left[i]+wetL[i],r=right[i]+wetR[i];need(Number.isFinite(l)&&Number.isFinite(r)&&Math.abs(l)<=.4&&Math.abs(r)<=.4,'bounded unnormalised mixed collision output');allL[frame+i]=l;allR[frame+i]=r;const p=Math.max(Math.abs(l),Math.abs(r));if(p>0&&firstNonzero<0)firstNonzero=frame+i;peak=Math.max(peak,p);energy+=l*l+r*r;lateEnergy+=wetL[i]**2+wetR[i]**2;}
   costs.push(performance.now()-begin);
  }
  const sorted=[...costs].sort((a,b)=>a-b),q=p=>sorted[Math.ceil((sorted.length-1)*p)],diagnostics=pipeline.diagnostics(),sourceDiagnostics=[...sources.values()].map(s=>s.diagnostics());
  return {left:allL,right:allR,summary:{schema:1,name:fixture.name,environment:sceneOverride?'explicit-original-resource-scene':fixture.environment,geometryKey:environment.scene.geometryKey,frames:fixture.frames,firstNonzeroFrame:firstNonzero,peak,energy,lateEnergy,
   outputSha256:createHash('sha256').update(Buffer.from(allL.buffer)).update(Buffer.from(allR.buffer)).digest('hex'),sources:sourceDiagnostics,admissions,firstQualifiedPaths:firstPaths,
   blockProcessingMs:{count:costs.length,median:q(.5),p95:q(.95),p99:q(.99),maximum:sorted.at(-1),deadlineMisses:costs.filter(x=>x>BLOCK/48).length},
   diagnostics,headroom,lateModel:diffuse.evidence?{basis:diffuse.evidence.basis,rt60Seconds:diffuse.evidence.rt60Seconds,wet:.12,calibration:'authored diffuse approximation, not measured sound power'}:null,
   originalEventsOnly:true,nativeEventAcquired:false,nativeSuppression:false,endpointOpened:false,physicalLatencyMeasured:false,
   sourcePoseModel:'positive authored fixed world contact for entire finite scene',retrospectiveControlDelayMs:0}};
 }finally{pipeline.close();}
}

// Short primary impacts use the LATENCY-02 branded kernel and descriptor path.
// Long continuing scrapes remain continuous sources, not a disguised shot queue.
export function prepareCollisionEventKernel02(event,{scene=null,listenerPose,listenerKnownThroughFrame,sceneId='collision-original',sceneGeneration=1,frames=16384}={}){
 need(isAuthoredCollisionEvent(event)&&event.durationFrames<=4096,'short original collision source required by bounded transient waveform path');
 const end=event.timing.occurrenceUpperFrame+frames;
 need(Number.isSafeInteger(frames)&&Number.isSafeInteger(listenerKnownThroughFrame)&&event.poseKnownThroughFrame>=end&&listenerKnownThroughFrame>=end,
  'source and listener must cover the full prepared tail horizon');
 need(scene===null||validated.scene(scene)&&scene.tile?.session===event.identity.session&&scene.tile.createdAt*48<=event.timing.occurrenceUpperFrame&&scene.tile.validUntil*48>=end,
  'prepared collision scene must match the exact authored session and full horizon');
 const original=new OriginalCollisionSource(event,{outputStartFrame:event.timing.occurrenceUpperFrame});
 const waveform=new Float32Array(original.durationFrames);original.copyDryInto(waveform);
 const kernel=createPreparedTransientKernel({scene,sceneId,sceneGeneration,session:event.identity.session,sourcePose:{position:event.radiator.position,generation:event.identity.componentGeneration},
  listenerPose,frames,amplitude:.02,masterGain:.7,authority:'authored-fixture-only',dryWaveform:waveform,waveformId:'collision:'+event.kind+':'+event.material.id});
 return {kernel,event,originalSourceSha256:original.pcmSha256,originalScale:.02,productionAcquisitionVerified:false,nativePrimary:true};
}
