// Continuous stock producer. The audio callback remains the existing native ring.
import {ListenerPlayout} from '../streaming/listener-playout.mjs';
import {conditionalStockScene,validated} from '../engine/contracts.mjs';
import {createStockVehiclePipeline} from './pipeline.mjs';
import {vehicleDistanceSceneOptions} from './distance-presentation.mjs';
import {AcousticQualityController} from '../streaming/acoustic-quality.mjs';
import {inBox} from '../research/local-geometry.mjs';
import {resolveLatencyProfile} from './latency-profile.mjs';
import {isQualifiedStaticScene,staticSceneMetadata} from '../world/scene.mjs';
import {isSceneUnion03,sceneUnionMetadata03} from '../world/scene-union03.mjs';
import {StationaryEmissionController} from './stationary-emission.mjs';
import {StockSourcePreparation05,stockSourceIdentity05} from './source-preparation05.mjs';
import {AirflowSourceStreet01,airflowSeedStreet01} from './airflow-street01.mjs';
import {isInstalledStaticScene01,installedStaticSceneMetadata01} from '../world/installed-static-scene01.mjs';
import {registerPreparedSoundMapGeometry01} from '../streaming/soundmap-telemetry.mjs';
const FS=48000,BLOCK=512,MAX=2,unit=v=>{const n=Math.hypot(...v);if(n<1e-8)throw Error('orientation discontinuity');return v.map(x=>x/n);};
const sameVehicle01=(a,b)=>a?.valid&&b.valid&&a.generation===b.generation&&a.model===b.model&&a.context===b.context;
const voiceIdentity01=v=>`${v.id}:${v.generation}:${v.model}:${v.context}`+(v.acquisition01===undefined?'':':'+v.acquisition01);
const mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const pcmCounters=()=>({nonzeroBlocks:0,peak:0,sumSquares:0});
// Fixed-size diagnostics only: observe the original PCM without changing it.
function observePcmBlock(left,counters,right=null){let peak=0,energy=0;
 for(let i=0;i<left.length;i++){const l=left[i],r=right?right[i]:0;peak=Math.max(peak,Math.abs(l),Math.abs(r));energy+=l*l+r*r;}
 if(peak>0)counters.nonzeroBlocks++;counters.peak=Math.max(counters.peak,peak);counters.sumSquares+=energy;
}
export class StockGameplay {
 #installedApplicationPermit01=null;#installedSceneService01=null;#installedSceneStopped01=false;#installedStopAt01=null;
 get installedSceneService01(){return this.#installedSceneService01;}
 get installedSceneStopped01(){return this.#installedSceneStopped01;}
 constructor({registry,profiles,session,now=()=>performance.now(),latencyDiagnostics=false,latencyProfile='baseline',continuityPolicy='baseline',continuousTimingPolicy='baseline',operatingStatePolicy='baseline',stationaryEmissionContract=null,sourcePreparationPolicy='disabled',vehicleSourcePolicy=null}){
  if(!['disabled','explicit-control05'].includes(sourcePreparationPolicy))throw Error('Explicit source preparation policy required');
  if(!['baseline','camera-source-01'].includes(continuityPolicy))throw Error('Explicit vehicle continuity policy required');
  if(!['baseline','arrived-segments-50'].includes(continuousTimingPolicy))throw Error('Explicit continuous timing policy required');
  if(continuousTimingPolicy==='arrived-segments-50'&&continuityPolicy!=='camera-source-01')throw Error('Arrived-segment research requires independent camera/source continuity');
  this.continuityPolicy=continuityPolicy;this.latencyProfile=resolveLatencyProfile(latencyProfile);this.controlDelayMs=this.latencyProfile.controlDelayMs;
  this.continuousTimingPolicy=continuousTimingPolicy;if(continuousTimingPolicy==='arrived-segments-50')this.controlDelayMs=50;
  if(!['baseline','authored-stationary-emission-01'].includes(operatingStatePolicy)||operatingStatePolicy==='baseline'&&stationaryEmissionContract!==null)throw Error('Explicit authored stationary emission policy required');
  this.operatingEmission=operatingStatePolicy==='baseline'?null:new StationaryEmissionController(stationaryEmissionContract);
  if(this.latencyProfile.id==='street-01'&&(continuityPolicy!=='camera-source-01'||continuousTimingPolicy!=='baseline'))throw Error('STREET-01 latency requires independent camera/source continuity and its exact immutable timing');
  if(vehicleSourcePolicy!==null&&(vehicleSourcePolicy!=='catalogue-fleet-01'||this.latencyProfile.id!=='street-01'))throw Error('Explicit normal catalogue fleet policy required');
  this.catalogueFleet=vehicleSourcePolicy!==null;
  // Three emitter slots per voice fit the existing sixteen-source contract.
  this.voiceLimit=this.catalogueFleet?5:MAX;
  this.vehicleLimit=this.catalogueFleet?32:8;
  this.fleetPopulation=null;this.fleetAcquisition=0;
  this.registry=registry;this.profiles=profiles;this.now=now;this.session=session;this.settings={quality:'auto',acceleration:'auto',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:false,airflowLevel:.35};
  // Fixed common observation clock: camera-stationary calibration cannot
  // relabel time while an independently moving vehicle is producing Doppler.
  this.playout=new ListenerPlayout({anchoredClock:true,delayMs:this.controlDelayMs,preserveGenerationHistory:continuityPolicy==='camera-source-01',recoveryPolicy:continuousTimingPolicy==='arrived-segments-50'?'arrived-segments-01':'baseline'});this.snapshots=[];this.sample=null;this.quality=new AcousticQualityController({now});
  this.slots=Array.from({length:this.voiceLimit},(_,i)=>({index:i,identity:null,generation:1,source:null,vehicle:null,score:0,airflow:null,local:[new Float32Array(BLOCK),new Float32Array(BLOCK)]}));
  // Existing engine/exhaust order and calibration remain unchanged. Aero has
  // its own history and enters the same finite propagation/path solver.
  this.ids=this.slots.flatMap(s=>['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`)).concat(this.slots.map(s=>`stock:slot${s.index}:aero`));
  this.direct=conditionalStockScene(this.ids,session,vehicleDistanceSceneOptions('authored-detail-loss-v1'));
  this.pipeline=createStockVehiclePipeline({scene:this.direct,sourceIds:this.ids,masterGain:.175,continuousRates:true,
    controlFilter:(c,r)=>this.filter(c,r)});
  this.inputs=Object.fromEntries(this.ids.map(id=>[id,new Float32Array(BLOCK)]));this.left=new Float32Array(BLOCK);this.right=new Float32Array(BLOCK);
  this.localAirflow=[new Float32Array(BLOCK),new Float32Array(BLOCK)];
  this.localAirflowRelease={last:[0,0],remaining:0,from:[0,0]};
  this.airflowState={windBasis:'explicit-still-air-assumption',velocityBasis:'source-observed-velocity; native-unverified uses declared 1 unit/metre assumption',riderActive:false,exteriorSources:0,maximumSynthesisMs:0};
  this.activeLimit=this.voiceLimit;this.lastGood=now();this.consecutiveMisses=0;this.sceneExpiry=-Infinity;this.lastFrame=-1;this.lastGeneration=0;
  this.stats={blocks:0,acceptedFrames:0,rejectedFrames:0,unsupported:0,arrivals:0,retired:0,headroomPathsOmitted:0,deadlineMisses:0,maximumProcessingMs:0,maximumActive:0,sourceBudgetReductions:0,geometryUpdates:0,geometryFallbacks:0,clippingFaults:0};
  this.installedSceneDiagnostics01={queued:0,coalesced:0,discardedBeforeApplication:0,candidates:0,withheld:0,accepted:0,rejected:0,activations:0,renewals:0,continuityFailures:0,transactionOverruns:0,postStopDiscarded:0,maximumApplicationMilliseconds:0,stopAt:null,recent:[]};
  this.#installedSceneService01=null;this.#installedSceneStopped01=false;this.#installedApplicationPermit01=null;this.installedRenderPreparing01=false;this.installedFallbackPending01=null;
  this.stageCounters={validVehicleObservations:0,runningVehicleObservations:0,eligibleVehicleBlocks:0,sourceCreations:0,sourcePlaybackBlocks:0,acousticPathBlocks:0,
   engine:pcmCounters(),exhaust:pcmCounters(),stereo:pcmCounters()};
  this.lifecycle={observedNotRunning:0,scopeRetirements:0,lastRetirements:[]};
  // One sampled block in eight, at most two selected sources. This is lineage
  // metadata only; it does not participate in source selection or DSP.
  this.latencyDiagnostics=latencyDiagnostics;this.lastTiming=null;this.captureTiming=false;this.latencyBrackets=[];
  this.sourcePreparation05=sourcePreparationPolicy==='explicit-control05'?new StockSourcePreparation05({now:()=>this.now(),candidates:()=>this.sourceCandidates05(),createSource:(model,context,options)=>this.registry.createSource(model,context,options)}):null;
  this.startupVoices01=new Map();
  this.updatePipelineQuality01();
 }
 updatePipelineQuality01(){
  const settings=this.pipeline.simulation.processingSettings;
  if(this.pipeline.quality===this.quality.active&&settings?.maxReflectors===16&&settings.earlyReflections===this.settings.reflections)return;
  this.pipeline.setQuality(this.quality.active,{maxReflectors:16,earlyReflections:this.settings.reflections});
 }
 stockSourceOptions01(bank){
  const profile=this.profiles?.profiles?.[bank.model];
  return {sourceGain:profile?.sourceGain??1,...(profile?.pressureSharesByState?{pressureSharesByState:profile.pressureSharesByState}:{})};
 }
 prepareStartupVoices01(eligible){
  if(this.lastFrame!==-1||this.pipeline.renderer.frame!==0||this.startupVoices01.size||eligible.length>(this.catalogueFleet?8:2))
   throw Error('one bounded normal startup voice preparation');
  const engine=new Float32Array(BLOCK),exhaust=new Float32Array(BLOCK);
  for(const {model,context} of eligible){
   const {bank}=this.registry.resolve(model,context);
   const options=this.stockSourceOptions01(bank);
   // Exercise fresh role registrations on the prepared bank before credits
   // begin. Continuing one voice exercises steady synthesis, but skips the
   // first engine and exhaust waveform searches on each new source lifetime.
   for(const lift of [false,true]){
    for(const operatingPoint of [.5,.12,.3,.75,.5,.16,.4,.85]){
     const disposable=this.registry.createSource(model,context,options);
     disposable.prepareInitialMatches01();
     const control={operatingPoint,load:lift?.05:.9,lift,running:true};
     for(let block=0;block<3;block++)disposable.renderInto(control,engine,exhaust);
    }
   }
   this.startupVoices01.set(this.catalogueFleet?bank:model+':'+context,this.registry.createSource(model,context,options));
  }
  return this.startupVoices01.size;
 }
 // Explicit startup/control work. No accept/render caller starts preparation.
 prepareSources05(options={}){if(!this.sourcePreparation05)throw Error('Opt-in explicit-control05 source preparation required');return this.sourcePreparation05.prepare(options);}
 cancelPreparedSources05(){if(!this.sourcePreparation05)throw Error('Opt-in explicit-control05 source preparation required');this.sourcePreparation05.cancel();return this.sourcePreparation05.diagnostics();}
 sourceCandidates05(){
  const latest=this.snapshots.at(-1);if(!latest||this.now()>=latest.wallExpires||!latest.frame.listener.valid||latest.frame.listener.paused)return [];
  return latest.frame.vehicles.filter(v=>v.valid&&!this.slots.some(s=>s.identity===stockSourceIdentity05(v))).flatMap(v=>{
   const resolved=this.registry.resolve(v.model,v.context);if(resolved.status!=='available')return [];
   const profile=this.profiles?.profiles?.[resolved.bank.model],options={sourceGain:profile?.sourceGain??1,...(profile?.pressureSharesByState?{pressureSharesByState:profile.pressureSharesByState}:{})};
   return [{identity:stockSourceIdentity05(v),vehicleId:v.id,session:this.session,model:v.model,context:v.context,bank:resolved.bank,options,expiresAt:latest.wallExpires}];
  });
 }
 accept(frame,ageMs,validForMs=null){
  try{
   const state=frame.listener;if(frame.version!==1||frame.session!==this.session||!Array.isArray(frame.vehicles)||frame.vehicles.length>this.vehicleLimit||!Number.isFinite(ageMs)||ageMs< -2||ageMs>250||validForMs!==null&&(!Number.isFinite(validForMs)||validForMs<=0||validForMs>252))throw Error('gameplay frame');
   if(state.session!==this.session||state.sequence<=this.lastFrame||state.generation<this.lastGeneration)throw Error('gameplay identity');
   const ids=new Set();for(const v of frame.vehicles){
    if(typeof v.id!=='string'||!/^[\w:-]{1,64}$/.test(v.id)||ids.has(v.id)||!Number.isInteger(v.generation)||v.generation<1||!Number.isInteger(v.model)||v.model<0||v.model>0xffffffff||!['player','npc'].includes(v.context)||typeof v.running!=='boolean'||typeof v.valid!=='boolean'||!Number.isFinite(v.operatingPoint)||v.operatingPoint<0||v.operatingPoint>1)throw Error('vehicle identity/state');
    ids.add(v.id);for(const k of ['position','velocity','forward','up'])if(!Array.isArray(v[k])||v[k].length!==3||v[k].some(x=>!Number.isFinite(x)||Math.abs(x)>100000))throw Error('vehicle vectors');
    for(const k of ['riderAttached','riderViewAttached'])if(v[k]!==undefined&&typeof v[k]!=='boolean')throw Error('observed rider attachment');
    if(!Number.isSafeInteger(v.observationTicks)||Math.abs(v.observationTicks-state.observationTicks)/state.clockFrequency>.05)throw Error('source observation clock');
    if(Math.hypot(...v.velocity)>100||Math.abs(Math.hypot(...v.forward)-1)>1e-4||Math.abs(Math.hypot(...v.up)-1)>1e-4||Math.abs(v.forward.reduce((n,x,i)=>n+x*v.up[i],0))>1e-4)throw Error('vehicle orientation/speed');
   }
   if(frame.vehicles.filter(v=>v.riderAttached===true).length>1)throw Error('one observed local rider');
   this.operatingEmission?.observe(frame);
   const previous=this.playout.lastState;
   this.playout.add({type:'listener',state,receiptAgeMs:ageMs},this.pipeline.renderer.frame/FS,this.now());this.playout.delayTarget=this.controlDelayMs/1000;
   const time=this.playout.records.at(-1).time;
   // Vehicle observations retain their own identity/pose clock across a camera
   // cut. Only the opt-in policy keeps them; listener interpolation and spatial
   // Doppler history still have an explicit generation boundary.
   const sameRepresentation=previous&&state.clockFrequency===previous.clockFrequency&&state.coordinates===previous.coordinates&&state.units===previous.units&&state.listenerKind===previous.listenerKind;
   if(this.lastGeneration&&state.generation!==this.lastGeneration&&(this.continuityPolicy==='baseline'||!sameRepresentation))this.snapshots=[];
   const copy=structuredClone(frame),snapshot={time,frame:copy,wallExpires:validForMs===null?Infinity:this.now()+validForMs};
   if(this.catalogueFleet){
    const previousSnapshot=this.snapshots.at(-1);
    snapshot.vehiclesById=new Map();
    for(const v of copy.vehicles){
     const old=previousSnapshot?.vehiclesById.get(v.id);
     // A newly acquired vehicle may arrive late. A repeat or rollback of
     // already consumed source evidence cannot become a new acquisition.
     const trusted=old?.valid?old:this.snapshots.findLast(s=>s.vehiclesById.get(v.id)?.valid)?.vehiclesById.get(v.id);
     if(v.valid&&trusted&&(v.generation<trusted.generation||
       v.generation===trusted.generation&&v.observationTicks<=trusted.observationTicks))v.valid=false;
     const continuous=sameVehicle01(old,v)&&this.now()<previousSnapshot.wallExpires&&v.observationTicks>=old.observationTicks&&
      v.observationTicks-old.observationTicks<=state.clockFrequency/4;
     v.acquisition01=continuous?old.acquisition01:++this.fleetAcquisition;
     snapshot.vehiclesById.set(v.id,v);
    }
   }
   this.snapshots.push(snapshot);while(this.snapshots.length>64)this.snapshots.shift();
   this.lastFrame=state.sequence;this.lastGeneration=state.generation;this.stats.acceptedFrames++;this.tickInstalledScene01();
   if(this.staticSceneBinding?.mode==='installed-static-conditional-partial'&&(!this.installedWindowContains01(this.pipeline.simulation.scene,state.position)||this.installedCurrentSourcePositions01(frame).some(p=>!this.installedWindowContains01(this.pipeline.simulation.scene,p))))this.#installedSceneService01?.invalidateConsumer01?.('outside-active-workset',this.now());
   for(const v of copy.vehicles)if(v.valid){this.stageCounters.validVehicleObservations++;if(v.running)this.stageCounters.runningVehicleObservations++;else this.lifecycle.observedNotRunning++;}
   this.sourcePreparation05?.observe(frame.vehicles.filter(v=>v.valid).map(stockSourceIdentity05));
  }catch(e){this.stats.rejectedFrames++;throw e;}
 }
 setSettings(s){
  if(!['auto','performance','balanced','quality','max'].includes(s.quality)||!['auto','cpu','gpu'].includes(s.acceleration)||typeof s.enabled!=='boolean'||!Number.isFinite(s.volume)||s.volume<0||s.volume>1||typeof s.reflections!=='boolean'||!['stock-fallback','experimental-additive'].includes(s.mode))throw Error('gameplay settings');
  const airflowEnabled=s.airflowEnabled??false,airflowLevel=s.airflowLevel??.35;
  if(typeof airflowEnabled!=='boolean'||!Number.isFinite(airflowLevel)||airflowLevel<0||airflowLevel>1)throw Error('bounded airflow settings');
  this.settings={...s,airflowEnabled,airflowLevel};this.quality.select(s.quality);this.updatePipelineQuality01();this.pipeline.setAcceleration(s.acceleration);
  this.pipeline.renderer.setOutputPreferences({richAudioEnabled:s.enabled&&s.mode==='experimental-additive',outputLevel:s.volume});
  this.updateInstalledConsumerWorkload01();
 }
 // Only the existing validated observed-geometry adapter can produce this scene.
 setQualifiedScene(scene,expiresAt){
  if(!validated.scene(scene)||scene.observationModel?.kind!=='conditional-observed-model'||scene.observationModel.mode!=='live-snapshot'||scene.tile.session!==this.session||!Number.isFinite(expiresAt)||expiresAt<=this.now()||expiresAt-this.now()>1000)throw Error('fresh qualified observed scene required');
  this.#installedSceneService01?.invalidateConsumer01('observed-scene-takes-precedence',this.now());
  this.pipeline.replaceScene(scene);this.sceneExpiry=expiresAt;this.stats.geometryUpdates++;
  this.staticSceneBinding=null;
 }
 // Static installed collision is a separately labelled conditional model.
 // It is never promoted to a fresh observation of doors/interiors/activation.
 bindInstalledSceneService01(service){
  if(this.#installedSceneService01||this.#installedSceneStopped01||!service||!['bindConsumer01','evaluateConsumerCandidate01','recordConsumerOutcome01','discardConsumerCandidate01','tickConsumer01','beginStop01'].every(k=>typeof service[k]==='function'))throw Error('One production installed scene service required');
  this.#installedSceneService01=service;service.bindConsumer01(this);this.updateInstalledConsumerWorkload01();return this;
 }
 updateInstalledConsumerWorkload01(){
  if(!this.#installedSceneService01)return;
  const settings=this.settings,key=[settings.quality,this.quality.active,settings.acceleration,this.pipeline.backend.active,settings.reflections,settings.mode,this.telemetry?.enabled===true].join(':');
  if(key!==this.installedConsumerWorkloadKey01){this.installedConsumerWorkloadKey01=key;this.#installedSceneService01.updateConsumerWorkload01?.(key,this.now());}
 }
 installedWindowContains01(scene,position){const radius=scene.observationModel?.workset?.activeRadius,anchor=scene.tile.listenerAnchor;return inBox(position,scene.tile.bounds)&&Number.isFinite(radius)&&position.every((v,i)=>Math.abs(v-anchor[i])<=radius);}
 stockEmitterPosition01(vehicle,role,model){
  if(role==='aero')return vehicle.position.map((x,i)=>x+vehicle.up[i]*.7);
  const placement=this.profiles?.emitters?.[model],engine=role==='engine';
  const offset=engine?(placement?.engineOffset??.35):(placement?.exhaustOffset??-.75);
  return vehicle.position.map((x,i)=>x+vehicle.forward[i]*offset+vehicle.up[i]*(engine?.65:.3));
 }
 installedCurrentSourcePositions01(frame){
  const latest=this.snapshots.at(-1)?.frame;
  const vehicles=this.catalogueFleet?(latest?.listener.sequence===frame.listener.sequence?latest.vehicles:[]):frame.vehicles;
  const nearby=vehicles.filter(v=>v.valid&&v.position.every((x,i)=>Math.abs(x-frame.listener.position[i])<=128));
  const selected=this.catalogueFleet?nearby.flatMap(v=>{
   const item=this.vehicleCandidate01(v,frame.listener,true,this.registry.resolve(v.model,v.context));
   return item?[item]:[];
  }).sort((a,b)=>b.score-a.score).slice(0,this.voiceLimit).map(item=>item.v):nearby.slice(0,2);
  return selected.flatMap(v=>{
   const model=this.profiles?.emitters?this.registry.resolve(v.model,v.context).bank?.model:undefined;
   const roles=this.settings.airflowEnabled&&v.model===0xf9300cc5?['engine','exhaust','aero']:['engine','exhaust'];
   return roles.map(role=>this.stockEmitterPosition01(v,role,model));
  }).filter(p=>p.every((x,i)=>Math.abs(x-frame.listener.position[i])<=128));
 }
 recordInstalledSceneDiagnostic01(record){
  const recent=this.installedSceneDiagnostics01.recent;recent.push(record);if(recent.length>64)recent.shift();
  this.onInstalledSceneDiagnostic01?.(record);
 }
 discardInstalledCandidate01(pending,reason,at=this.now()){
  const postStop=this.#installedSceneStopped01||this.#installedSceneService01?.readinessSnapshot01().stopIntentAt!=null;
  this.#installedSceneService01?.discardConsumerCandidate01(pending.originalReceipt,at,reason);
  this.installedSceneDiagnostics01.discardedBeforeApplication++;if(postStop)this.installedSceneDiagnostics01.postStopDiscarded++;
  this.recordInstalledSceneDiagnostic01({requestId:pending.receipt.requestId??null,generation:pending.receipt.generation,requestedAt:pending.receipt.requestedAt??null,expiresAt:pending.receipt.expiresAt,queuedAt:pending.queuedAt,discardedAt:at,completedAt:at,applicationAt:null,accepted:false,applied:false,withheld:false,postStop,reason});
 }
 invalidateInstalledScene01(reason,at=this.now()){
  const expired=reason==='scene-expired'||reason==='active-scene-expired';
  if(this.pendingInstalledStaticScene01&&!expired){
   const pending=this.pendingInstalledStaticScene01;this.pendingInstalledStaticScene01=null;this.discardInstalledCandidate01(pending,reason,at);
  }
  if(this.staticSceneBinding?.mode!=='installed-static-conditional-partial'&&!this.installedFallbackPending01)return;
  if(expired)this.installedSceneDiagnostics01.continuityFailures++;
  this.staticSceneBinding=null;this.sceneExpiry=-Infinity;
  if(this.installedRenderPreparing01){this.installedFallbackPending01={reason,at};return;}
  if(this.pipeline.simulation.scene!==this.direct){this.pipeline.replaceScene(this.direct);this.stats.geometryFallbacks++;}this.installedFallbackPending01=null;
 }
 tickInstalledScene01(at=this.now()){
  const state=this.#installedSceneService01?.tickConsumer01(at,{generation:this.lastGeneration||undefined});
  // The bound service owns managed invalidation and calls this consumer once.
  if(this.staticSceneBinding?.mode==='installed-static-conditional-partial'&&at>=this.sceneExpiry)this.invalidateInstalledScene01('scene-expired',at);
  if(this.installedFallbackPending01&&!this.installedRenderPreparing01){if(this.pipeline.simulation.scene!==this.direct){this.pipeline.replaceScene(this.direct);this.stats.geometryFallbacks++;}this.installedFallbackPending01=null;}
  return state;
 }
 beginStopInstalledScene01(at=this.now(),reason='stop-intent'){
  if(this.#installedSceneStopped01)return this.#installedStopAt01;
  // Observe a lease already lost at this exact boundary before stopping can
  // clear its binding. Cleanup cannot erase a pre-stop continuity failure.
  this.tickInstalledScene01(at);
  this.#installedSceneStopped01=true;this.#installedStopAt01=at;this.installedSceneDiagnostics01.stopAt=at;this.#installedSceneService01?.beginStop01(at,reason);this.invalidateInstalledScene01(reason,at);return at;
 }
 setInstalledStaticScene01(scene,{expiresAt}={}){
  if(this.#installedSceneStopped01)return false;
  if(this.#installedSceneService01&&this.#installedApplicationPermit01!==scene)throw Error('Production installed mutation requires the consumer readiness gate');
  if(!validated.scene(scene)||!isInstalledStaticScene01(scene))throw Error('Branded installed static scene required');
  const metadata=installedStaticSceneMetadata01(scene),at=this.now();
  if(metadata.session!==this.session||metadata.installedWorldVerified!==false||metadata.runtimeActivationVerified!==false||
   metadata.coverage!=='partial'||!Number.isFinite(expiresAt)||expiresAt<=at||expiresAt-at>1000||
   scene.observationModel?.kind!=='conditional-installed-static-model'||
   JSON.stringify(scene.config.airDbPerMetre)!==JSON.stringify(this.direct.config.airDbPerMetre))throw Error('Conditional installed world binding or freshness');
  this.pipeline.replaceScene(scene);this.staticSceneBinding=Object.freeze({...metadata,mode:'installed-static-conditional-partial'});
  // Replacement may prepare indexes. Its cost belongs inside the original
  // observation lease, including the final consumer boundary.
  const acceptedAt=this.now();
  if(acceptedAt>=expiresAt){this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.sceneExpiry=-Infinity;this.stats.geometryFallbacks++;return false;}
  this.sceneExpiry=expiresAt;this.geometryAnchor={at:acceptedAt,observationMs:scene.tile.validUntil-(expiresAt-acceptedAt)};this.stats.geometryUpdates++;return true;
 }
 queueInstalledStaticScene01(scene,receipt){
  if(!isInstalledStaticScene01(scene)||!receipt||!Number.isFinite(receipt.expiresAt)||!Number.isSafeInteger(receipt.generation))throw Error('Bounded prepared installed scene publication');
  if(this.#installedSceneStopped01){this.installedSceneDiagnostics01.postStopDiscarded++;this.recordInstalledSceneDiagnostic01({requestId:receipt.requestId??null,generation:receipt.generation,completedAt:this.now(),accepted:false,postStop:true,reason:'stopped-before-queue'});return false;}
  const metadata=installedStaticSceneMetadata01(scene);
  if(this.#installedSceneService01&&(!Number.isFinite(receipt.requestedAt)||receipt.expiresAt!==receipt.requestedAt+receipt.durationMs||receipt.durationMs!==metadata.durationMs||receipt.geometryTimeMs!==metadata.geometryTimeMs||scene.tile.createdAt!==receipt.geometryTimeMs||scene.tile.validUntil!==receipt.geometryTimeMs+receipt.durationMs))throw Error('Original installed observation headers required');
  // Coalesce control publications; this is never a PCM/observation queue.
  const d=this.installedSceneDiagnostics01;d.queued++;if(this.pendingInstalledStaticScene01){const discarded=this.pendingInstalledStaticScene01;this.pendingInstalledStaticScene01=null;d.coalesced++;this.discardInstalledCandidate01(discarded,'coalesced-before-application');}
  this.pendingInstalledStaticScene01={scene,receipt:Object.freeze({...receipt}),originalReceipt:receipt,queuedAt:this.now()};return true;
 }
 // Separate qualification for original authored static fixtures. Its finite
 // experiment horizon is never represented as a fresh live observation lease.
 setQualifiedStaticScene(scene,{worldDigest,generation}={}){
  if(!validated.scene(scene)||!isQualifiedStaticScene(scene))throw Error('Qualified static fixture scene required');
  const metadata=staticSceneMetadata(scene);
  if(metadata.session!==this.session||metadata.worldDigest!==worldDigest||metadata.generation!==generation||metadata.authority!=='authored-fixture-only'||metadata.mode!=='offline-static-fixture')throw Error('Static world identity/generation mismatch');
  const at=this.now();this.pipeline.replaceScene(scene);this.staticSceneBinding=metadata;this.sceneExpiry=at+metadata.durationMs;
  this.geometryAnchor={at,observationMs:metadata.geometryTimeOriginMs};this.stats.geometryUpdates++;
 }
 // Explicit offline resource-format integration only. No ordinary gameplay
 // caller invokes this; native event acquisition/ownership remain disabled.
 setPreparedResourceScene03(scene,{worldDigest,generation}={}){
  if(!validated.scene(scene)||!isSceneUnion03(scene))throw Error('Branded prepared resource scene required');
  const metadata=sceneUnionMetadata03(scene),durationMs=metadata.validUntil-metadata.geometryTimeMs;
  if(metadata.session!==this.session||metadata.worldDigest!==worldDigest||metadata.generation!==generation||
   metadata.authority!=='original-parser-resource-fixture'||metadata.installedWorldVerified!==false||
   !Number.isFinite(durationMs)||durationMs<=0||durationMs>60000||
   JSON.stringify(scene.config.airDbPerMetre)!==JSON.stringify(this.direct.config.airDbPerMetre))throw Error('Resource scene identity, horizon or existing distance presentation mismatch');
  const previous=this.pipeline.simulation.scene;
  const preserveIdenticalReflectors=previous?.tile?.coverage==='complete-synthetic'&&scene.tile.coverage==='complete-synthetic'&&
   previous.tile.missingRegions.length===0&&scene.tile.missingRegions.length===0&&!previous.observationModel&&!scene.observationModel&&
   JSON.stringify(previous.tile.surfaces)===JSON.stringify(scene.tile.surfaces)&&JSON.stringify(previous.materials)===JSON.stringify(scene.materials)&&
   JSON.stringify(previous.config)===JSON.stringify(scene.config)&&previous.coordinateSpace===scene.coordinateSpace;
  const at=this.now();this.pipeline.replaceScene(scene,{preserveIdenticalReflectors:!!preserveIdenticalReflectors});
  this.staticSceneBinding=Object.freeze({...metadata,mode:'offline-resource-subset',durationMs,geometryTimeOriginMs:metadata.geometryTimeMs});
  this.sceneExpiry=at+durationMs;this.geometryAnchor={at,observationMs:metadata.geometryTimeMs};this.stats.geometryUpdates++;
 }
 clearPreparedResourceScene03(binding={}){
  if(this.staticSceneBinding?.mode!=='offline-resource-subset')throw Error('Exact prepared resource scene required');
  this.clearQualifiedStaticScene(binding);
 }
 clearQualifiedStaticScene({worldDigest,generation}={}){
  if(!this.staticSceneBinding||this.staticSceneBinding.worldDigest!==worldDigest||this.staticSceneBinding.generation!==generation)throw Error('Exact static world invalidation identity required');
  this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.sceneExpiry=-Infinity;this.stats.geometryFallbacks++;
 }
 filter(control,renderer){
  // Complementary bands have nonincreasing passive coefficients: their sum is
  // a convex combination of original PCM and its stable lowpass histories.
  // Reserve absolute pressure bounds for old release paths before new paths.
  const weights=s=>.98*s.pressureGain*.175;
  const occupied=new Map();let localPeak=0;if(this.settings.airflowEnabled)for(const channel of this.localAirflow)for(const x of channel)localPeak=Math.max(localPeak,Math.abs(x));let total=localPeak*.175;
  for(const slot of renderer.slots)if(slot.active){const bound=Math.max(slot.gain[0],slot.releaseLeft?0:slot.target[0])*weights(slot.source);occupied.set(slot.id,bound);total+=bound;}
  const paths=[];for(const p of [...control.paths].sort((a,b)=>a.order-b.order||b.bands[0]-a.bands[0])){
   const bound=p.bands[0]*weights(renderer.sources.get(p.sourceId)),extra=Math.max(0,bound-(occupied.get(p.id)??0));
   if(total+extra>.95){this.stats.headroomPathsOmitted++;continue;}total+=extra;paths.push(p);
  }
  let result={...control,paths,geometry:{...control.geometry,presentationAxes:[[1,0,0],[0,1,0],[0,0,1]],presentationScale:1,mappedListener:{position:this.sample?.state?.position??[0,0,0]}}};
  if(this.sample?.state)result=this.playout.presentation(result,this.sample,renderer.frame/FS,this.now()).control;
  return result;
 }
 vehiclesAt(time){
  if(!this.snapshots.length||this.now()>=this.snapshots.at(-1).wallExpires)return [];
  let a=null,b=null;for(const s of this.snapshots){if(s.time<=time)a=s;else{b=s;break;}}
  if(!a||time-a.time>.25||!a.frame.listener.valid||a.frame.listener.paused)return [];
  const result=[];for(const identity of this.snapshots.at(-1).frame.vehicles){if(!identity.valid)continue;
   let left=null,right=null;
   if(this.catalogueFleet){
    // Search only this contiguous acquisition. An invalid or absent sample
    // closes its history even when a later sender reuses the same identity.
    for(let i=this.snapshots.length-1;i>=0;i--){
     const snapshot=this.snapshots[i],v=snapshot.vehiclesById.get(identity.id);
     if(!v?.valid||v.acquisition01!==identity.acquisition01)break;
     const at=snapshot.time+(v.observationTicks-snapshot.frame.listener.observationTicks)/snapshot.frame.listener.clockFrequency;
     if(at<=time){left={time:at,v,sequence:snapshot.frame.listener.sequence};break;}
     right={time:at,v,sequence:snapshot.frame.listener.sequence};
    }
   }else for(const snapshot of this.snapshots){const v=snapshot.frame.vehicles.find(v=>v.id===identity.id&&v.generation===identity.generation&&v.model===identity.model&&v.context===identity.context&&v.valid);if(!v)continue;
    const at=snapshot.time+(v.observationTicks-snapshot.frame.listener.observationTicks)/snapshot.frame.listener.clockFrequency;
    if(at<=time)left={time:at,v,sequence:snapshot.frame.listener.sequence};else{right={time:at,v,sequence:snapshot.frame.listener.sequence};break;}}
   if(!left)continue;const old=left.v,next=right?.v;a={time:left.time};b=right;
   if(b&&!next)continue;
   const dt=next?b.time-a.time:0,u=dt>0?(time-a.time)/dt:0;
   if(next&&(dt>.25||distance(old.position,next.position)/dt>100))continue;
   if(!next&&time-a.time>.05)continue;
   const position=next?mix(old.position,next.position,u):old.position.map((x,i)=>x+old.velocity[i]*(time-a.time));
   const forward=next?unit(mix(old.forward,next.forward,u)):old.forward,up0=next?mix(old.up,next.up,u):old.up,dot=up0.reduce((n,x,i)=>n+x*forward[i],0),up=unit(up0.map((x,i)=>x-dot*forward[i]));
   if(this.captureTiming)this.latencyBrackets.push({id:old.id,generation:old.generation,leftSequence:left.sequence,rightSequence:right?.sequence??null,
    leftObservationTicks:old.observationTicks,rightObservationTicks:next?.observationTicks??null,clockFrequency:this.snapshots.at(-1).frame.listener.clockFrequency,
    observationClockDomain:'host-Stopwatch-QPC',observationBasis:'gameplay-vehicle-pose; native operating interval remains in journal',
    interpolation:next?u:null,operatingPoint:next?old.operatingPoint+(next.operatingPoint-old.operatingPoint)*u:old.operatingPoint});
   result.push({...old,position,forward,up,velocity:next?mix(old.velocity,next.velocity,u):old.velocity,
    operatingPoint:next?old.operatingPoint+(next.operatingPoint-old.operatingPoint)*u:old.operatingPoint,
    running:this.continuityPolicy==='camera-source-01'?old.running:old.running&&(!next||next.running),lift:next?next.operatingPoint<old.operatingPoint-.002:false,
    riderAttached:old.riderAttached===true&&(!next||next.riderAttached===true),riderViewAttached:old.riderViewAttached===true&&(!next||next.riderViewAttached===true)});
  }return result;
 }
 vehicleCandidate01(v,listener,listenerQualified,resolved){
  if(resolved.status!=='available')return null;
  const identity=voiceIdentity01(v);
  const prior=this.slots.some(s=>s.identity===identity);
  if(!listenerQualified&&!prior)return null;
  const energy=Math.max(...Object.values(resolved.bank.layers.exhaust).map(a=>a.nativePeak??0));
  const score=(v.running?1:.01)*energy/Math.max(1,distance(v.position,listener.position))*(prior?1.5:1);
  return {v,resolved,score,identity};
 }
 // The normal render calls this at its existing block boundary, after the
 // previous asynchronous block has completed. Offline readiness qualification
 // can exercise this same consumer without synthesizing or submitting PCM.
 applyPendingInstalledStaticScene01(){
  this.tickInstalledScene01();
  const pendingScene=this.pendingInstalledStaticScene01;this.pendingInstalledStaticScene01=null;
  if(!pendingScene)return false;
  const start=performance.now(),at=this.now(),d=this.installedSceneDiagnostics01;
  d.candidates++;
  let reason=this.#installedSceneStopped01?'stopped-before-application':pendingScene.receipt.expiresAt<=at?'expired-before-application':pendingScene.receipt.generation!==this.lastGeneration?'source-generation-changed':
    this.pipeline.simulation.scene.observationModel?.kind==='conditional-observed-model'&&this.sceneExpiry>at?'observed-scene-retained':null;
  let soundMapMilliseconds=0,replacementMilliseconds=0,accepted=false,withheld=false,decision=null,validationCompleted=false;const wasActive=this.staticSceneBinding?.mode==='installed-static-conditional-partial';
  const currentFrame=this.snapshots.at(-1)?.frame;
  if(!reason&&currentFrame?.listener.valid&&(!this.installedWindowContains01(pendingScene.scene,currentFrame.listener.position)||this.installedCurrentSourcePositions01(currentFrame).some(p=>!this.installedWindowContains01(pendingScene.scene,p)))){reason='outside-candidate-workset';withheld=true;}
  if(!reason){
   const {scene,receipt}=pendingScene;
   decision=this.#installedSceneService01?.evaluateConsumerCandidate01(pendingScene.originalReceipt,at)??{permitted:true,reason:null};
   if(this.#installedSceneService01&&(typeof receipt.prepareSoundMapGeometry01!=='boolean'||receipt.prepareSoundMapGeometry01!==!!receipt.preparedSoundMapGeometry))throw Error('Original requested SoundMap preparation/body required');
   // No scene/epoch mutation can occur while the previous block awaits its
   // asynchronous visibility result. Validation and admission costs remain
   // included in this block's measured complete processing duration.
   const soundMapAt=performance.now();if(receipt.preparedSoundMapGeometry)registerPreparedSoundMapGeometry01(scene,receipt.preparedSoundMapGeometry,{requestId:receipt.requestId,bindingEpoch:receipt.bindingEpoch,packetDigest:receipt.packetDigest,catalogSHA256:receipt.catalogSHA256});soundMapMilliseconds=performance.now()-soundMapAt;validationCompleted=true;
   const replaceAt=performance.now();
   if(receipt.expiresAt<=this.now())reason='expired-after-soundmap';
   else{decision=this.#installedSceneService01?.evaluateConsumerCandidate01(pendingScene.originalReceipt,this.now())??decision;if(!decision.permitted){reason=decision.reason;withheld=true;}else{this.#installedApplicationPermit01=scene;try{accepted=this.setInstalledStaticScene01(scene,{expiresAt:receipt.expiresAt});}finally{this.#installedApplicationPermit01=null;}if(!accepted)reason='expired-after-replacement';}}
   replacementMilliseconds=performance.now()-replaceAt;
  }
  const completedAt=this.now(),applicationMilliseconds=performance.now()-start;
  if(accepted&&(completedAt>=pendingScene.receipt.expiresAt||this.#installedSceneStopped01||this.#installedSceneService01&&applicationMilliseconds>BLOCK/FS*1000)){this.invalidateInstalledScene01('invalidated-during-application',completedAt);accepted=false;reason=this.#installedSceneStopped01?'stopped-during-application':completedAt>=pendingScene.receipt.expiresAt?'expired-after-application':'consumer-application-budget-overrun';}
  const record={requestId:pendingScene.receipt.requestId??null,generation:pendingScene.receipt.generation,requestedAt:pendingScene.receipt.requestedAt??null,expiresAt:pendingScene.receipt.expiresAt,queuedAt:pendingScene.queuedAt,applicationAt:at,completedAt,queueMilliseconds:at-pendingScene.queuedAt,soundMapMilliseconds,replacementMilliseconds,applicationMilliseconds,validationCompleted,accepted,applied:accepted,withheld,reason,remainingAtApplicationMilliseconds:Math.max(0,pendingScene.receipt.expiresAt-completedAt),activationDecision:decision};
  const acknowledgeAt=performance.now(),readiness=this.#installedSceneService01?.recordConsumerOutcome01(pendingScene.originalReceipt,record);
  record.acknowledgementMilliseconds=performance.now()-acknowledgeAt;this.tickInstalledScene01();
  record.transactionCompletedAt=this.now();record.transactionMilliseconds=performance.now()-start;
  d.continuityFailures=Math.max(d.continuityFailures,readiness?.counters.validityGaps??0);
  if(this.#installedSceneService01&&record.transactionMilliseconds>BLOCK/FS*1000){this.#installedSceneService01.invalidateConsumer01('consumer-transaction-budget-overrun',record.transactionCompletedAt);d.transactionOverruns++;reason='consumer-transaction-budget-overrun';record.reason=reason;record.transactionBudgetOverrun=true;withheld=false;record.withheld=false;}
  if(accepted&&(reason||this.#installedSceneStopped01||this.staticSceneBinding?.mode!=='installed-static-conditional-partial'||record.transactionCompletedAt>=pendingScene.receipt.expiresAt)){record.revokedAfterApplication=true;accepted=false;record.accepted=false;record.reason=reason??'invalidated-during-acknowledgement';}
  record.remainingAtReturnMilliseconds=Math.max(0,pendingScene.receipt.expiresAt-record.transactionCompletedAt);
  d[accepted?'accepted':withheld?'withheld':this.#installedSceneStopped01?'postStopDiscarded':'rejected']++;if(accepted)d[wasActive?'renewals':'activations']++;d.maximumApplicationMilliseconds=Math.max(d.maximumApplicationMilliseconds,record.transactionMilliseconds);this.recordInstalledSceneDiagnostic01(record);
  return accepted;
 }
 async render(){
  const preparation=this.sourcePreparation05;
  if(preparation){if(preparation.rendering)throw Error('One opt-in gameplay render at a time');preparation.rendering=true;}
  try{
  const start=this.now(),time=this.pipeline.renderer.frame/FS,sourceBlocksBefore=this.stageCounters.sourcePlaybackBlocks;this.sample=this.playout.sample(time,this.now());
  this.applyPendingInstalledStaticScene01();
  const afterAdmission=this.now();
  this.captureTiming=this.latencyDiagnostics&&this.stats.blocks%8===0;this.lastTiming=null;if(this.captureTiming)this.latencyBrackets=[];
  if(this.pipeline.simulation.scene!==this.direct&&this.now()>=this.sceneExpiry){this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.stats.geometryFallbacks++;}
  const listener=this.sample.state??{position:[0,0,0],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:false,generation:this.lastGeneration||1};
  const independentSource=this.continuityPolicy==='camera-source-01'&&!['missing','stale-wall-clock','clock-invalid','invalid-or-paused','invalid-interval','observation-gap'].includes(this.sample.mode);
  let offered=this.sample.state||independentSource?this.vehiclesAt(this.sample.targetTime):[];
  const emissionOperating=this.operatingEmission?.select(this.snapshots,this.pipeline.renderer.frame,this.now());
  if(this.operatingEmission)offered=emissionOperating&&(this.sample.state||independentSource)?[emissionOperating.vehicle]:[];
  const eligible=[];let unavailable=0;for(const spatialVehicle of offered){if(this.operatingEmission&&!emissionOperating)continue;const v=this.operatingEmission?{...spatialVehicle,operatingPoint:emissionOperating.operatingPoint,running:emissionOperating.running,lift:emissionOperating.lift}:spatialVehicle;
   // Do not create a new source without a qualified listener. A still-valid
   // existing source can advance its dry/grain history through a listener-only
   // gap while the unchanged renderer releases unavailable spatial paths.
   const resolved=this.registry.resolve(v.model,v.context);
   if(resolved.status!=='available'){this.stats.unsupported++;unavailable++;continue;}
   const item=this.vehicleCandidate01(v,listener,!!this.sample.state,resolved);
   if(item)eligible.push(item);
  }
  this.stageCounters.eligibleVehicleBlocks+=eligible.length;
  eligible.sort((a,b)=>b.score-a.score);const selected=eligible.slice(0,this.activeLimit),preserve=!this.sample.state&&(this.playout.lastState?.paused||this.continuityPolicy==='baseline'&&this.sample.mode==='warming')&&this.sample.mode!=='stale-wall-clock',keep=new Set(preserve?this.slots.map(s=>s.identity):selected.map(x=>x.identity));
  if(this.catalogueFleet)this.fleetPopulation={discovered:this.snapshots.at(-1)?.frame.vehicles.length??0,qualified:eligible.length,unavailable,virtualized:Math.max(0,eligible.length-selected.length)};
  for(const s of this.slots)if(s.identity&&!keep.has(s.identity)){
   const latest=this.snapshots.at(-1),current=latest?.frame.vehicles.find(v=>voiceIdentity01(v)===s.identity);
   const reason=latest&&this.now()>=latest.wallExpires?'source-expiry':!current?'source-absent-or-identity-change':!current.valid?'source-invalid':!this.sample.state&&!independentSource?'listener-unavailable':this.catalogueFleet&&eligible.some(item=>item.identity===s.identity)?'voice-budget-virtualized':'source-pose-unavailable';
   this.lifecycle.scopeRetirements++;this.lifecycle.lastRetirements.push({reason,sourceFrame:s.source?.frame??null,lastQualifiedRunning:s.vehicle?.running??null,engineShutdownInferred:false});if(this.lifecycle.lastRetirements.length>this.voiceLimit)this.lifecycle.lastRetirements.shift();
   s.identity=null;s.source=null;s.vehicle=null;s.airflow=null;this.stats.retired++;
  }
  for(const item of selected){let slot=this.slots.find(s=>s.identity===item.identity);if(!slot){slot=this.slots.find(s=>!s.identity);slot.identity=item.identity;slot.generation++;
    const sourceOptions=this.stockSourceOptions01(item.resolved.bank),startupKey=this.catalogueFleet?item.resolved.bank:item.v.model+':'+item.v.context;
    const startupVoice=this.startupVoices01.get(startupKey);this.startupVoices01.delete(startupKey);
    slot.source=startupVoice??this.sourcePreparation05?.take({identity:item.identity,session:this.session,bank:item.resolved.bank,options:sourceOptions})??this.registry.createSource(item.v.model,item.v.context,sourceOptions);slot.airflow=new AirflowSourceStreet01({seed:airflowSeedStreet01(this.session+':'+item.identity)});this.stats.arrivals++;this.stageCounters.sourceCreations++;}
   slot.vehicle=item.v;slot.score=item.score;
  }
  const afterSelection=this.captureCompleteRenderStages01?this.now():0;
  let stockSynthesisMs=0,stockInitialMatchReuses=0;
  for(const c of this.localAirflow)c.fill(0);this.airflowState.riderActive=false;this.airflowState.exteriorSources=0;
  const sources=[];for(const s of this.slots){const ids=['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`),aeroId=`stock:slot${s.index}:aero`;for(const id of [...ids,aeroId])this.inputs[id].fill(0);
   if(!s.source||!this.sample.state&&(!independentSource||!selected.some(item=>item.identity===s.identity)))continue;const v=s.vehicle;
   const stockStart=this.captureCompleteRenderStages01?this.now():0;
   s.source.renderInto({operatingPoint:v.operatingPoint,load:v.lift ? .05 : .9,lift:v.lift,running:v.running},this.inputs[ids[0]],this.inputs[ids[1]]);
   if(this.captureCompleteRenderStages01){
    stockSynthesisMs+=this.now()-stockStart;
    if(sourceBlocksBefore===0)stockInitialMatchReuses+=s.source.initialMatchReuses01?.()??0;
   }
   this.stageCounters.sourcePlaybackBlocks++;observePcmBlock(this.inputs[ids[0]],this.stageCounters.engine);observePcmBlock(this.inputs[ids[1]],this.stageCounters.exhaust);
   const profile=this.profiles?.profiles?.[s.source.vehicle.model];
   for(const [i,role]of ['engine','exhaust'].entries()){
    sources.push({id:ids[i],generation:s.generation,position:this.stockEmitterPosition01(v,role,s.source.vehicle.model),velocity:v.velocity,
     forward:v.forward.map(x=>i?-x:x),up:v.up,directivity:profile?.directivity?.[role]??(i?.65:.1),valid:true,emitting:true});}
   if(v.model===0xf9300cc5){const at=this.now(),flow=s.airflow.renderInto({velocity:v.velocity,enabled:this.settings.airflowEnabled,level:this.settings.airflowLevel,riderAttached:v.riderAttached===true,riderViewAttached:v.riderViewAttached===true&&!!this.sample.state,valid:!!this.sample.state},this.inputs[aeroId],...s.local);
    this.airflowState.maximumSynthesisMs=Math.max(this.airflowState.maximumSynthesisMs,this.now()-at);this.airflowState.riderActive||=flow.riderActive;
    if(this.settings.airflowEnabled)for(let c=0;c<2;c++)for(let i=0;i<BLOCK;i++)this.localAirflow[c][i]+=s.local[c][i];
    if(this.settings.airflowEnabled){sources.push({id:aeroId,generation:s.generation,position:this.stockEmitterPosition01(v,'aero'),velocity:v.velocity,forward:v.forward,up:v.up,directivity:.15,valid:true,emitting:flow.exteriorActive});this.airflowState.exteriorSources++;}
   }
  }
  this.stats.maximumActive=Math.max(this.stats.maximumActive,selected.length);
  // Loss of a source/listener cannot chop the last local pressure sample. A
  // finite residual release uses only the last mixed sample, not a fabricated
  // motion/wind observation, and ends within 960 frames without another queue.
  const release=this.localAirflowRelease;
  if(this.settings.airflowEnabled&&!release.remaining&&release.last.some(x=>x!==0)&&
     !this.localAirflow.some(channel=>channel.some(x=>x!==0))){release.remaining=960;release.from=[...release.last];}
  for(let i=0;i<BLOCK&&release.remaining;i++){release.remaining--;for(let c=0;c<2;c++)this.localAirflow[c][i]+=release.from[c]*release.remaining/960;}
  release.last[0]=this.localAirflow[0][BLOCK-1];release.last[1]=this.localAirflow[1][BLOCK-1];this.airflowState.localResidualReleaseFrames=release.remaining;
  const currentScene=this.pipeline.simulation.scene,installed=this.staticSceneBinding?.mode==='installed-static-conditional-partial';
  // A warming playout has no rendered pose. The placeholder origin must not
  // revoke a workset already qualified against the real control observation.
  if(this.sample.state&&currentScene!==this.direct&&(installed?(!this.installedWindowContains01(currentScene,listener.position)||sources.some(s=>!this.installedWindowContains01(currentScene,s.position))):(!inBox(listener.position,currentScene.tile.bounds)||sources.some(s=>!inBox(s.position,currentScene.tile.bounds))))){if(installed&&this.#installedSceneService01)this.#installedSceneService01.invalidateConsumer01('outside-active-workset',this.now());else{this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.stats.geometryFallbacks++;}}
  this.telemetry?.begin(this.pipeline.simulation,this.now());
  const beforePrepare=this.now();
  const installedBefore=this.staticSceneBinding?.mode==='installed-static-conditional-partial';this.installedRenderPreparing01=true;
  try{await this.pipeline.prepare({time,session:this.session,generation:listener.generation,listener,sources},this.pipeline.simulation.scene===this.direct?{}:{geometryTimeMs:this.geometryAnchor.observationMs+this.now()-this.geometryAnchor.at},()=>{this.tickInstalledScene01();return !this.#installedSceneStopped01&&!this.installedFallbackPending01&&(!installedBefore||this.staticSceneBinding?.mode==='installed-static-conditional-partial');});}finally{this.installedRenderPreparing01=false;}
  this.tickInstalledScene01();if(this.#installedSceneStopped01)return [this.left,this.right];
  if(installedBefore&&this.pipeline.simulation.scene===this.direct)await this.pipeline.prepareObserved(time,{},()=>!this.#installedSceneStopped01);
  if(this.#installedSceneStopped01)return [this.left,this.right];
  const beforePcm=this.now();
  if(this.pipeline.lastControl.paths.length>0)this.stageCounters.acousticPathBlocks++;
  const before=this.pipeline.renderer.stats.limited;this.pipeline.process(this.inputs,this.left,this.right,BLOCK,null,null,this.settings.airflowEnabled?this.localAirflow:null);
  observePcmBlock(this.left,this.stageCounters.stereo,this.right);
  if(this.pipeline.renderer.stats.limited!==before){this.stats.clippingFaults++;throw Error('headroom invariant failed; stock fallback required');}
  const elapsed=this.now()-start;this.stats.blocks++;this.stats.maximumProcessingMs=Math.max(this.stats.maximumProcessingMs,elapsed);
  if(this.telemetry)try{this.visual=this.telemetry.publish(this.pipeline.simulation,this.pipeline.lastControl,{workerMs:elapsed});}catch{this.visual=null;}
  this.quality.observe({processingMs:elapsed,availablePaths:this.pipeline.lastControl.paths.length,activeBackend:this.pipeline.backend.diagnostics().activeAcceleration??'cpu'});
  this.updatePipelineQuality01();
  if(elapsed>BLOCK/FS*1000){this.stats.deadlineMisses++;this.consecutiveMisses++;this.lastGood=this.now();if(!this.catalogueFleet&&this.consecutiveMisses>=5&&this.activeLimit>1){this.activeLimit=1;this.stats.sourceBudgetReductions++;}}
  else{this.consecutiveMisses=0;if(this.now()-this.lastGood>5000)this.activeLimit=this.voiceLimit;}
  if(this.captureTiming){const selectedIds=new Set(selected.map(s=>s.v.id));this.lastTiming={producerFrameStart:Math.round(time*FS),frames:BLOCK,
   nodeClockDomain:'node-performance-ms',nodeFrequency:1000,renderStartedNodeMs:start,renderCompletedNodeMs:this.now(),processingMs:elapsed,
   sourceTargetTimeSeconds:this.sample.targetTime??null,latestAcceptedSequence:this.lastFrame,controlDelayMs:this.controlDelayMs,
   sourceBrackets:this.latencyBrackets.filter(s=>selectedIds.has(s.id)).slice(0,this.voiceLimit),...(this.operatingEmission?{emissionOperatingState:this.operatingEmission.selected,sourceBracketsScope:'Spatial query history; current emission geometry separately qualified by authored stationary world contract'}:{})};}
  // Retain a second complete method interval, including optional telemetry and
  // quality bookkeeping. It encloses the core interval; do not add them.
  this.lastCompleteRenderMs=this.now()-start;
  this.lastRenderStages01=this.captureCompleteRenderStages01||this.lastCompleteRenderMs>8?{admissionMs:afterAdmission-start,
   sourceAndControlMs:beforePrepare-afterAdmission,propagationMs:beforePcm-beforePrepare,
   pcmMs:elapsed-(beforePcm-start),bookkeepingMs:this.lastCompleteRenderMs-elapsed,
   ...(this.captureCompleteRenderStages01?{sourceSelectionMs:afterSelection-afterAdmission,stockSynthesisMs,stockInitialMatchReuses}:{}),
   firstSourceBlock:sourceBlocksBefore===0&&this.stageCounters.sourcePlaybackBlocks>0}:null;
  this.stats.maximumCompleteRenderMs=Math.max(this.stats.maximumCompleteRenderMs??0,this.lastCompleteRenderMs);
  if(this.lastCompleteRenderMs>8)this.stats.completeRenderHeadroomMisses=(this.stats.completeRenderHeadroomMisses??0)+1;
  if(this.lastCompleteRenderMs>BLOCK/FS*1000)this.stats.completeRenderHardMisses=(this.stats.completeRenderHardMisses??0)+1;
  return [this.left,this.right];
  }finally{if(preparation)preparation.rendering=false;}
 }
 diagnostics(){this.tickInstalledScene01();return {...this.stats,environmentalReadiness01:this.#installedSceneService01?.readinessSnapshot01?.()??{state:this.#installedSceneStopped01?'stopped':'unmanaged',active:false,qualified:false},installedSceneDiagnostics01:this.installedSceneDiagnostics01,active:this.slots.filter(s=>s.identity).length,activeLimit:this.activeLimit,mode:this.settings.mode,nativeReplacement:false,
   airflow:{...this.airflowState,enabled:this.settings.airflowEnabled,level:this.settings.airflowLevel,material:'original-procedural',riderPropagation:'local-stereo-no-reflections-no-doppler',exteriorPropagation:'existing-causal-path-renderer-once',sourceStates:this.slots.filter(s=>s.airflow).map(s=>({identity:s.identity,frame:s.airflow.frame,...s.airflow.stats}))},
   lifecycle:{...this.lifecycle,lastRetirements:this.lifecycle.lastRetirements.map(r=>({...r}))},
   stageCounters:{...this.stageCounters,engine:{...this.stageCounters.engine},exhaust:{...this.stageCounters.exhaust},stereo:{...this.stageCounters.stereo}},
   selectedPaths:this.pipeline.lastControl?.paths.length??0,outputPeak:this.pipeline.renderer.stats.peak,...(this.catalogueFleet?{fleetPopulation:this.fleetPopulation}:{}),
   listenerState:this.sample?.mode??'not-observed',
   sourceStates:this.slots.filter(s=>s.source).map(s=>({id:s.vehicle?.id,generation:s.vehicle?.generation,...(this.catalogueFleet?{model:s.vehicle?.model,renderGeneration:s.generation,effectiveProfileObserved:false}:{}),bank:s.source.vehicle.model,context:s.source.npc?'npc':'player',running:s.vehicle?.running??false,
    operatingPoint:s.vehicle?.operatingPoint??null,sourceFrame:s.source.frame,dryPeak:s.source.stats.peak,
    listenerDistance:this.sample?.state&&s.vehicle?distance(s.vehicle.position,this.sample.state.position):null})),
   geometry:this.pipeline.simulation.scene===this.direct?'conditional-direct-unobserved-space-assumed-clear':this.staticSceneBinding?.mode==='installed-static-conditional-partial'?'installed-static-conditional-partial':this.staticSceneBinding?.mode==='offline-resource-subset'?'qualified-original-resource-subset':this.staticSceneBinding?'qualified-static-authored-fixture':'qualified-observed-partial',installedGeometry:this.staticSceneBinding?.mode==='installed-static-conditional-partial'?this.staticSceneBinding:null,controlDelayMs:this.controlDelayMs,latencyProfile:this.latencyProfile.id,continuityPolicy:this.continuityPolicy,...(this.continuousTimingPolicy==='baseline'?{}:{continuousTimingPolicy:this.continuousTimingPolicy}),...(this.operatingEmission?{operatingEmission:this.operatingEmission.diagnostics()}:{}),sourceHistoryLimitSeconds:2.5,propagationLimitSeconds:2,
   quality:this.quality.diagnostics(),pipeline:this.pipeline.diagnostics(),playout:this.playout.stats,memory:process.memoryUsage(),...(this.sourcePreparation05?{sourcePreparation05:this.sourcePreparation05.diagnostics()}:{})};}
 close(){this.beginStopInstalledScene01();const pending=this.sourcePreparation05?.close();this.pipeline.close();return pending;}
}
