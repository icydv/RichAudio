import {bindCameraInterior01,interiorObservationKey01} from '../src/acoustics/world/interior-activation01.mjs';
// Continuous owned producer. Separate authored startup JIT PCM is discarded.
// Playback uses verified stock banks; no WASAPI, game API or archive decode.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {performance} from 'node:perf_hooks';
import {loadStockCatalogAssets,loadStockNpcAssets,StockVehicleSource,prepareStockSource10} from '../src/acoustics/vehicle/stock-source.mjs';
import {authoredStartupBank10,prepareStockSourcesForStartup10} from '../src/acoustics/vehicle/stock-source-preparation10.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {resolveLatencyProfile,validateStreetLatencySelection01} from '../src/acoustics/vehicle/latency-profile.mjs';
import {encodeVehicleRa07} from '../src/acoustics/vehicle/pipeline.mjs';
import {observationCoordinates,observedAcousticScene} from '../src/acoustics/engine/observed-geometry.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {SoundMapTelemetry,installedSoundMapGeometryState01} from '../src/acoustics/streaming/soundmap-telemetry.mjs';import {SoundMapClient} from './soundmap/producer-client.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {normalQualification01,openNormalQualificationEvidence01} from '../src/acoustics/world/normal-qualification01.mjs';
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--manifest'||args[2]!=='--session')throw Error('owned manifest/session required');
const manifest=path.resolve(args[1]),root=path.dirname(manifest),config=JSON.parse(fs.readFileSync(manifest,'utf8')),session=args[3];
const latencyProfile=resolveLatencyProfile(config.latencyProfile);
if(latencyProfile.id==='low-latency-01'&&(config.demoProfile!=='PLAYABLE-13'||config.eligible?.length!==1||config.eligible[0].model!==0xf9300cc5||config.eligible[0].context!=='player'))throw Error('LOW-LATENCY-01 requires the Bati-player demonstration package');
validateStreetLatencySelection01(config);
const qualification=normalQualification01(config,root,session);
const inside=relative=>{const p=path.resolve(root,relative);if(!p.startsWith(root+path.sep))throw Error('package path escaped');return p;};
const assets=loadStockCatalogAssets(inside(config.playerManifest),{sustainAtlasFile:inside(config.atlas)});
const playerOnlyQualification=qualification&&!config.eligible.some(e=>e.context==='npc');
const npcAssets=playerOnlyQualification?null:loadStockNpcAssets(inside(config.npcManifest));
const registry=loadInstalledStockRegistry({catalogFile:inside(config.catalog),catalogSha256:config.catalogSha256,assets,npcAssets}),profiles=JSON.parse(fs.readFileSync(inside(config.profiles),'utf8'));
// Prepare pure bank data and bounded untouched voices before host readiness.
// The normal eligibility selection still controls when any voice is acquired.
const sourceStartupPreparation10=prepareStockSourcesForStartup10(registry,config.eligible);
// Normal product camera changes retain independently observed vehicle history.
// Explicit immutable policy selections and closed demonstration profiles retain
// their declared behavior; source expiry and listener-cut rejection still apply.
const continuityPolicy=config.continuityPolicy??(config.demoProfile?'baseline':'camera-source-01');
async function warmNormalControl01(){
 const bank=authoredStartupBank10(),plan=prepareStockSource10(bank),began=performance.now();
 let now=0;
 const fixture=new StockGameplay({registry:{resolve:()=>({status:'available',bank}),
  createSource:()=>new StockVehicleSource(bank,{preparation10:plan})},session,now:()=>now,
  latencyProfile:latencyProfile.id,continuityPolicy,latencyDiagnostics:true});
 fixture.setSettings({...fixture.settings,acceleration:'cpu'});
 try{
  for(let i=0;i<24;i++){
   now=i*512/48;
   if(i%4===0){
    const observationTicks=Math.round(now*10000);
    fixture.accept({version:1,session,listener:{version:1,session,sequence:i,generation:1,observationTicks,
     clockFrequency:10000000,gameTimeMs:Math.round(now),position:[0,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],
     valid:true,paused:false,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',listenerKind:'camera',velocityKind:'unavailable',sourceId:null},
     vehicles:[{id:'authored-warmup',model:0xf9300cc5,context:'player',generation:1,observationTicks,
      position:[1,1,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,valid:true,running:true}]},0);
   }
   await fixture.render();
  }
  return {authoredBlocks:24,authoredSourceBlocks:fixture.stageCounters.sourcePlaybackBlocks,
   actualSourceFramesAdvanced:0,pcmQueueFramesAdded:0,milliseconds:performance.now()-began};
 }finally{await fixture.close();}
}
const normalControlWarmup=latencyProfile.id==='street-01'?await warmNormalControl01():null;
const engine=new StockGameplay({registry,profiles,session,latencyDiagnostics:true,latencyProfile:latencyProfile.id,continuityPolicy}),allowed=new Set(config.eligible.map(p=>p.model+':'+p.context));
const startupVoices=latencyProfile.id==='street-01'&&!sourceStartupPreparation10.unpreparedBanks.length?engine.prepareStartupVoices01(config.eligible):0;
engine.pipeline.simulation.captureInstalledPaths01=config.acousticPathEvidence01===true;
engine.captureCompleteRenderStages01=qualification!==null;
let credits=0,busy=false,stopped=false,sequence=0,pendingSnapshot=null,pendingSettings=null,pendingGeometry=null,clock=null,lastFrame=null,latestGeometryRevision=0,latencyRows=0,latencyRowsOmitted=0;
const traceDelivery=config.outputSink==='environment-observation'&&process.env.RICHAUDIO_DISCARD_DELIVERY_TRACE01==='1';
let deliveryDrops=0;
function delivery(phase,id,at,began=0,render=0){
 if(process.stderr.writableLength>=4096){deliveryDrops++;return;}
 // A short best-effort record. Never await diagnostic backpressure.
 process.stderr.write(`delivery01|${phase}|${id}|${at}|${began}|${render}|${credits}|${deliveryDrops}\n`);
}
let viewer=false,viewerClient=null,soundMapRecordingRequest01=false,soundMapBackgroundRequest01=false;engine.telemetry=new SoundMapTelemetry();
const soundMapRequired01=()=>viewer||soundMapRecordingRequest01||soundMapBackgroundRequest01;
const soundMapDemandStatus01=()=>({viewer,recordingRequested:soundMapRecordingRequest01,backgroundRequested:soundMapBackgroundRequest01,required:soundMapRequired01(),geometry:soundMapRequired01()?installedSoundMapGeometryState01(engine.pipeline.simulation.scene):'not-requested',recordingStartedByProducer:false});
const evidence=qualification?openNormalQualificationEvidence01(root,session,error=>{process.exitCode=1;setImmediate(()=>finish(error));}):null;
let latestSceneDecision01=null,latestPreparedScene01=null;
engine.onInstalledSceneDiagnostic01=record=>{
 evidence?.record({type:'consumer-scene-decision',...record});
 if(record.requestId===latestPreparedScene01?.requestId)latestSceneDecision01={requestId:record.requestId,reason:record.reason};
};
const packet=Buffer.alloc(4112),log=v=>{
 evidence?.record(v);
 process.stderr.write(JSON.stringify(v)+'\n');
};
let installedScenes=null,worldStatus={stage:'partial/unsupported',installedWorldVerified:false,genuineResourceVerified:false,reason:config.demoProfile?'closed-demonstration-profile':'world-cache-not-prepared',preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0}};
let processingOverrunRows=0,processingOverrunRowsOmitted=0,worldAdmissionRows=0,worldAdmissionRowsOmitted=0;
// The normal plugin's existing warmup supervisor owns discovery/decoding. This
// worker consumes that same persisted cache independently of PCM credits. No
// archive decode or cache read is performed by pump() or an audio callback.
if(!config.demoProfile&&config.acousticWorld!==false){
 const c=config.acousticWorld??{},worldRoot=c.cacheRoot??'.local/plugin-world-warmup';
 // A prepared package can explicitly reuse its supervisor's private cache.
 // Its two relative metadata paths cannot escape that declared cache root.
 const privateCacheRoot=c.privateCacheRoot===undefined?root:path.resolve(c.privateCacheRoot);
 if(c.privateCacheRoot!==undefined&&(!path.isAbsolute(c.privateCacheRoot)||!privateCacheRoot.split(path.sep).includes('.local')))throw Error('explicit private installed-world cache root');
 const derivedCacheRoot=c.derivedCacheRoot===undefined?undefined:path.resolve(c.derivedCacheRoot);
 if(c.derivedCacheRoot!==undefined&&(!path.isAbsolute(c.derivedCacheRoot)||!derivedCacheRoot.split(path.sep).includes('.local')))throw Error('explicit private derived-world cache root');
 const worldInside=relative=>{if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('relative installed cache metadata path');const p=path.resolve(privateCacheRoot,relative);if(!p.startsWith(privateCacheRoot+path.sep))throw Error('installed cache metadata escaped');return p;};
 // Match the bounded query's maximum resource count so a repeated dense
 // workset can warm instead of evicting its own sources on every scan.
 const worldConfig={manifestPath:worldInside(c.manifestPath??worldRoot+'/geometry/manifest.json'),catalogPath:worldInside(c.catalogPath??worldRoot+'/resolved/resolved-catalog.json'),expectedGameSHA256:config.gameSha256,
  ...(c.catalogSHA256?{expectedCatalogSHA256:c.catalogSHA256}:{}),...(derivedCacheRoot?{privateRoot:derivedCacheRoot}:{}),...(!qualification&&(c.initialObservationPath!==undefined||c.privateCacheRoot===undefined)?{initialObservationPath:worldInside(c.initialObservationPath??worldRoot+'/geometry/initial-observation01.json')}:{ }),maximumResidentResources:16};
 installedScenes=new InstalledSceneService01({config:worldConfig,session,onStatus:s=>{
  worldStatus={stage:s.stage,installedWorldVerified:false,genuineResourceVerified:s.genuineResourceVerified===true,preparation:s.preparation??{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},
   reason:s.reason??s.failure??s.worker?.failure??null,residentResources:s.residentResources??0,resourceLoads:s.resourceLoads??0,controller:s.worker??s.controller??null,coverageStates:s.coverageStates??null,initialPreparationPriority:s.initialPreparationPriority??null,localReadiness:s.localReadiness??null,cacheTimings:s.cacheTimings??null};
  if(qualification&&s.worker?.failed&&!stopped)setImmediate(()=>finish(Error(s.worker.failure??'installed world worker failed'),'world-worker-fault'));
 },onScene:(scene,receipt)=>{
  const metadata=installedStaticSceneMetadata01(scene),profile=receipt.lifecycle01.workerProfile01;
  latestPreparedScene01={requestId:receipt.requestId,generation:receipt.generation,epoch:installedScenes.validationEpochUtc01,catalogue:receipt.catalogSHA256,
   interiorKey:receipt.cameraInteriorKey01,expiresAt:receipt.expiresAt,
   surfaces:metadata.activeSurfaces,reason:metadata.localReadiness.firstBlocker==='placement-or-activation-withheld'?
    ['conditional-mapgroup-activation-unknown','collision-layer-activation-unknown','unresolved-interior-activation'].find(r=>metadata.uncertaintyByReason01[r]>0)??metadata.localReadiness.firstBlocker:
    metadata.localReadiness.firstBlocker};
  if(worldAdmissionRows<2400&&process.stderr.writableLength<16384){log({type:'installed-world-producer-admission',requestId:receipt.requestId,nodeAtMs:traceDelivery?performance.now():undefined,validationMs:receipt.validationMs,elapsedSinceRequestMs:receipt.admissionMs,workerPreparationMs:receipt.workerPreparationMilliseconds,prepareSoundMapGeometry01:receipt.prepareSoundMapGeometry01,soundMapPreparationMilliseconds:profile?.soundMapPreparationMilliseconds??null,scope:'validation is on producer; worker preparation is concurrent, not additive audio latency',
   ...(config.acousticPathEvidence01===true?{generation:receipt.generation,localReadiness:metadata.localReadiness,interiorSurfaceCount:metadata.interiorSurfaceCount01,uncertainty:metadata.uncertaintyByReason01,resources:scene.observationModel.evidence,
    stages:{staticMs:profile.staticPreparationMilliseconds,queryMs:profile.staticPreparation?.resourceQueryMs,windowMs:profile.windowMilliseconds,encodeMs:profile.encodeMilliseconds,transferMs:profile.transferPreparationMilliseconds,transportMs:receipt.lifecycle01.workerTransportMilliseconds}}:{})});worldAdmissionRows++;}else worldAdmissionRowsOmitted++;
  evidence?.record({type:'source-proof',requestId:receipt.requestId,observationKey:scene.tile.observationKey,listenerAnchor:scene.tile.listenerAnchor,
   localReadiness:installedStaticSceneMetadata01(scene).localReadiness,
   catalogue:receipt.catalogSHA256,proofEpoch:qualification.epoch,surfaces:scene.tile.surfaces.length,resources:scene.observationModel.evidence});
  // An observed live snapshot remains authoritative until its own lease ends.
  if(engine.pipeline.simulation.scene.observationModel?.kind==='conditional-observed-model'&&engine.sceneExpiry>performance.now())return;
  if(!scene.tile.surfaces.length)return;
  engine.queueInstalledStaticScene01(scene,receipt);
 }});
 engine.bindInstalledSceneService01(installedScenes);
}
let measurementReady=null,readinessStreak=null;
function checkMeasurementReadiness(d){
 const anchor=qualification?.anchor, accepted=lastFrame;
 if(!anchor||measurementReady||stopped)return;
 const at=performance.now(),frame=accepted?.frame,listener=frame?.listener;
 const age=listener?accepted.age+at-accepted.at:Infinity;
 const camera=listener?.valid&&!listener.paused&&age<=250&&(accepted.validUntil===null||at<accepted.validUntil);
 const nearby=camera&&Math.hypot(...listener.position.map((v,i)=>v-anchor.position[i]))<=anchor.radius;
 const vehicle=nearby&&frame.vehicles.find(v=>v.model===0xf9300cc5&&v.context==='player'&&v.valid&&v.running&&v.riderAttached&&
  age+(listener.observationTicks-v.observationTicks)*1000/listener.clockFrequency<=250);
 const scene=d.installedGeometry?.activeSurfaces>0&&engine.pipeline.simulation.scene.observationModel?.evidence?.some(row=>row.resourceId===anchor.resourceId);
 const source=vehicle&&d.sourceStates.find(s=>s.id===vehicle.id&&s.generation===vehicle.generation&&s.context==='player'&&s.running&&s.dryPeak>0);
 if(!source||!scene){readinessStreak=null;return;}
 if(readinessStreak?.id!==vehicle.id||readinessStreak?.generation!==vehicle.generation)readinessStreak={id:vehicle.id,generation:vehicle.generation,count:0,sequence:-1,sourceFrame:-1};
 if(readinessStreak.sequence===listener.sequence||source.sourceFrame<=readinessStreak.sourceFrame)return;
 readinessStreak.sequence=listener.sequence;
 readinessStreak.sourceFrame=source.sourceFrame;
 if(++readinessStreak.count<3)return;
 measurementReady={at,utc:new Date().toISOString(),sequence:listener.sequence,renderSequence:(sequence-1)>>>0,position:listener.position,resourceId:anchor.resourceId,
  vehicleId:vehicle.id,vehicleGeneration:vehicle.generation,activeSurfaces:d.installedGeometry.activeSurfaces,proofEpoch:qualification.epoch};
 log({type:'phase1-measurement-ready',...measurementReady});
}
function status(){const d=engine.diagnostics(),b=d.pipeline.backend,q=d.quality,readiness=d.environmentalReadiness01;
 checkMeasurementReadiness(d);
 const consumerWorldStage=readiness.state==='active'?(readiness.renewalQualified?'active-conditional-local-scene':'active-local-scene-renewal-at-risk'):readiness.state==='lost'?'local-scene-continuity-lost':['stopping','stopped'].includes(readiness.state)?readiness.state:readiness.managed?'preparing-local-scene':worldStatus.stage;
 try{if(soundMapRequired01()&&(!viewerClient||viewerClient.closed))viewerClient=new SoundMapClient(path.join(root,'.local/soundmap/service.json'));if(!soundMapRequired01()&&viewerClient){viewerClient.close().catch(()=>{});viewerClient=null;}}catch{}
 log({type:'gameplay-status',status:{featureProfile:'STREET-01-main',requestedQuality:q.requestedQuality,activeQuality:q.activeQuality,pathBudget:engine.pipeline.renderer.maxPathsPerSource,
  requestedAcceleration:b.requestedAcceleration,activeAcceleration:b.activeAcceleration,gpuDevice:b.gpuDevice,gpuCapability:b.gpuResultsApplied>0?'hardware-directcompute':'unestablished',gpuResultsApplied:b.gpuResultsApplied??b.totals?.gpuResultsApplied??0,
  droppedResults:b.droppedResults??b.totals?.droppedResults??0,qualityDeadlineMisses:d.deadlineMisses,activeSources:d.active,activeVehicles:d.active,activeEmitters:d.active*2+(d.airflow?.exteriorSources??0),sourceBudget:d.activeLimit,
  integrationMode:d.mode,nativeReplacement:false,continuityPolicy,geometryMode:d.geometry,processingMaximumMs:d.maximumProcessingMs,
  completeRenderMaximumMs:d.maximumCompleteRenderMs??0,completeRenderHeadroomMisses:d.completeRenderHeadroomMisses??0,completeRenderHardMisses:d.completeRenderHardMisses??0,
  processingOverrunRows,processingOverrunRowsOmitted,worldAdmissionRows,worldAdmissionRowsOmitted,sourceHistoryBytes:d.pipeline.sourceHistoryBytes,memoryBytes:d.memory.rss,
  clippedSamples:0,limitedSamples:d.pipeline.renderer.limited,missingHistory:d.pipeline.renderer.missingHistory,headroomPathsOmitted:d.headroomPathsOmitted,
  richAudioEnabled:engine.settings.enabled,outputLevel:engine.settings.volume,earlyReflections:engine.settings.reflections,airflowEnabled:engine.settings.airflowEnabled,airflowLevel:engine.settings.airflowLevel,airflow:d.airflow,acousticWorld:{...worldStatus,stage:consumerWorldStage,preparationStage:worldStatus.stage,cacheLocalReadiness:worldStatus.localReadiness,localReadiness:{state:readiness.state,renewalQualified:readiness.renewalQualified===true},environmentalReadiness01:readiness},
  soundMapDemand01:soundMapDemandStatus01(),
  listenerState:d.listenerState,selectedPaths:d.selectedPaths,reflectionPathsSelected:engine.pipeline.lastControl?.paths.filter(p=>p.order>0).length??0,
  phase1MeasurementReady:measurementReady,directUnknownFallbackPaths:engine.pipeline.lastControl?.paths.filter(p=>p.coverageFallback==='conditional-direct-unknown-coverage').length??0,
  installedScene:d.installedGeometry?{activeSurfaces:d.installedGeometry.activeSurfaces,surroundingSurfaces:d.installedGeometry.surroundingSurfaces01,selectedResources:d.installedGeometry.selectedResources,omittedSurfaces:d.installedGeometry.omittedSurfaces,requestedRadius:d.installedGeometry.requestedRadius,activeRadius:d.installedGeometry.activeRadius,worksetLimited:d.installedGeometry.worksetLimited,coverage:d.installedGeometry.coverage,sourceCatalogueSHA256:d.installedGeometry.sourceCatalogueSHA256,runtimeActivationVerified:false}:null,
  installedPropagation:{...engine.pipeline.simulation.installedPropagation01,
   ...(config.acousticPathEvidence01===true&&d.installedGeometry?{paths:engine.pipeline.simulation.lastInstalledPaths01??null,
    reflectionSearch:d.installedGeometry.reflectionSearch01,uncertainty:d.installedGeometry.uncertaintyByReason01,
    unpreparedExterior:d.installedGeometry.unpreparedExterior01}:{} )},
  outputPeak:d.outputPeak,sourceStates:d.sourceStates,stageCounters:d.stageCounters,
  fallbackReason:d.geometry==='conditional-direct-unobserved-space-assumed-clear'?'Additive; conditional direct sound without collision coverage':b.fallbackReason,
  controlDelayMs:latencyProfile.controlDelayMs,propagationLimitSeconds:2,arrivals:d.arrivals,retired:d.retired,latencyRows,latencyRowsOmitted,...(latencyProfile.id==='baseline'?{}:{latencyProfile:latencyProfile.id,producerCreditBlocks:latencyProfile.producerCreditBlocks})}});
}
function finish(error,reason=error?'producer-fault':'graceful-stop'){if(stopped)return;const stopAt=performance.now();stopped=true;engine.beginStopInstalledScene01(stopAt,error?'producer-error':'stop-intent');engine.close();
 const world=installedScenes;installedScenes=null;
 if(viewerClient){viewerClient.close().catch(()=>{});viewerClient=null;}viewer=false;soundMapRecordingRequest01=false;soundMapBackgroundRequest01=false;status();if(error){log({type:'gameplay-error',code:error.message});process.exitCode=1;}if(qualification)log({type:'producer-terminal',reason,error:error?.message??null,worldWorkerOwned:world!==null});input.close();process.stdin.pause();
 void (async()=>{try{if(world){const r=await world.close();log({type:'installed-world-worker-closed',stopAt,...r});if(!r.workerJoined)process.exitCode=1;}}
 catch(e){log({type:'installed-world-worker-close-failed',stopAt,reason:e.message});process.exitCode=1;}
 finally{evidence?.close();}})();
}
async function pump(){if(busy||stopped||credits<=0)return;busy=true;
 try{
  if(traceDelivery)delivery('b',sequence,performance.now());
  if(pendingSettings){const settings=pendingSettings;pendingSettings=null;engine.setSettings(settings);}
  if(pendingSnapshot){const m=pendingSnapshot;pendingSnapshot=null;const now=performance.now(),s=m.frame.listener;
   if(!clock)clock={ticks:s.observationTicks+m.ageMs*s.clockFrequency/1000,at:now,frequency:s.clockFrequency};
   if(s.clockFrequency!==clock.frequency)throw Error('producer observation clock changed');
   const age=Math.max(m.ageMs,(clock.ticks+(now-clock.at)*clock.frequency/1000-s.observationTicks)*1000/clock.frequency);
   const remaining=m.validForMs===undefined?null:m.validForMs-(now-m.receivedAt);
   if(age<=250&&(remaining===null||remaining>0)){
    const proofEpoch=qualification?qualification.acceptLaunch(m.frame.worldPreparationStartedUtc):m.frame.worldPreparationStartedUtc;
    engine.accept(m.frame,age,remaining);lastFrame={frame:m.frame,age,at:now,validUntil:remaining===null?null:now+remaining,receivedAt:m.receivedAt,hostWriteBeforeQpc:m.hostWriteBeforeQpc??null,hostQpcFrequency:m.hostQpcFrequency??null};
    evidence?.record({type:'normal-gameplay-observation',at:now,ageMs:age,validForMs:remaining,frame:m.frame});
    if(installedScenes&&!installedScenes.failed&&!installedScenes.closed&&(!s.valid||s.paused))installedScenes.withdrawCameraInterior01(now);
    if(installedScenes&&!installedScenes.failed&&!installedScenes.closed&&s.valid&&!s.paused){
     installedScenes.bindPreparationEpoch01(proofEpoch);
     const sources=m.frame.vehicles.filter(v=>v.valid&&v.position.every((x,i)=>Math.abs(x-s.position[i])<=128)).slice(0,2).map(v=>v.position);
     installedScenes.observeInitial01({sequence:s.sequence,generation:s.generation,geometryTimeMs:now,sourceAgeMs:age,listener:s.position,sources});
     const cameraInterior01=bindCameraInterior01(m.frame,age,remaining,proofEpoch);
     if(!installedScenes.failed)installedScenes.updateWindow({listener:s.position,sources:engine.installedCurrentSourcePositions01(m.frame),generation:s.generation,geometryTimeMs:now,durationMs:1000,cameraInterior01,surroundingWorkset01:true,maximumSurfaces:4096,localSurfaceTarget01:cameraInterior01?.durationMs<=250?192:640,prepareSoundMapGeometry01:soundMapRequired01(),engine:{order:2,maxPaths:64,maxReflectors:16,...vehicleDistanceSceneOptions('authored-detail-loss-v1')}});
    }
   }
  }
  if(pendingGeometry){const value=pendingGeometry;pendingGeometry=null;try{geometry(value);}catch(e){log({type:'geometry-rejected',reason:e.message});}}
  const channels=await engine.render();if(stopped)return;
  credits--;encodeVehicleRa07(...channels,sequence,packet);sequence=(sequence+1)>>>0;
  evidence?.record({type:'complete-render-block',sequence:(sequence-1)>>>0,completeRenderMs:engine.lastCompleteRenderMs,
   stages:engine.lastRenderStages01});
  if(engine.lastCompleteRenderMs>8){if(processingOverrunRows<2400&&process.stderr.writableLength<16384){log({type:'complete-render-overrun',sequence:(sequence-1)>>>0,producerFrameStart:((sequence-1)>>>0)*512,completeRenderMs:engine.lastCompleteRenderMs,hardDeadlineMs:512/48,headroomTargetMs:8,hardMiss:engine.lastCompleteRenderMs>512/48,geometryModel:engine.pipeline.simulation.scene.observationModel?.kind??'conditional-direct',stages:engine.lastRenderStages01});processingOverrunRows++;}else processingOverrunRowsOmitted++;}
  const visual=viewerClient&&engine.visual;
  const outputSequence=(sequence-1)>>>0;
  const outputAt=traceDelivery?performance.now():0;
  if(traceDelivery)delivery('w',outputSequence,outputAt,0,engine.lastCompleteRenderMs);
  await new Promise((resolve,reject)=>process.stdout.write(packet,e=>e?reject(e):resolve()));
  if(traceDelivery)delivery('d',outputSequence,performance.now(),outputAt);
  if(visual?.soundMapFrame&&viewerClient)try{
   const frame=visual.soundMapFrame,listener=lastFrame?.frame.listener;
   const epoch=installedScenes?.validationEpochUtc01,catalogue=installedScenes?.catalogBinding;
   const now=performance.now(),ageMs=lastFrame?lastFrame.age+now-lastFrame.at:Infinity;
   const remainingMs=lastFrame?.validUntil==null?null:lastFrame.validUntil-now;
   const current=epoch&&catalogue&&listener?.valid&&!listener.paused&&ageMs<=250&&(remainingMs===null||remainingMs>0);
   const interior=current?bindCameraInterior01(lastFrame.frame,ageMs,remainingMs,epoch):null;
   const interiorKey=interiorObservationKey01(interior);
   const candidate=latestPreparedScene01,decision=latestSceneDecision01;
   const matching=candidate&&candidate.epoch===epoch&&candidate.catalogue===catalogue&&candidate.generation===listener?.generation&&candidate.interiorKey===interiorKey;
   const active=installedScenes?.readinessSnapshot01().active;
   const appliedScene=engine.pipeline.simulation.scene;
   const rendererInstalled=appliedScene.observationModel?.kind==='conditional-installed-static-model';
   const appliedInterior=rendererInstalled&&installedStaticSceneMetadata01(appliedScene).interiorSurfaceCount01>0?
    appliedScene.observationModel.evidence.find(e=>e.interiorKey)?.interiorKey??null:null;
   const rendererDecision01=rendererInstalled&&active&&active.expiresAt>now&&active.generation===listener?.generation&&(!appliedInterior||appliedInterior===interiorKey)?
    {state:'admitted',reason:null,scope:appliedInterior?'camera-bound interior':'exterior',remainingMs:active.expiresAt-now}:
    matching?candidate.expiresAt<=now?{state:'expired',reason:'prepared-scene-lease-ended'}:
    !candidate.surfaces?{state:'withheld',reason:candidate.reason??'no-supported-surfaces-in-window',remainingMs:candidate.expiresAt-now}:
    {state:'prepared',reason:decision?.requestId===candidate.requestId?decision.reason:'awaiting-consumer-decision',remainingMs:candidate.expiresAt-now}:null;
   const worldContext01=current?{epoch,catalogue,ownerSession:session,generation:listener.generation,position:listener.position,ageMs,
    interior,interiorKey,rendererDecision01}:null;
   viewerClient.offer({...frame,worldContext01},visual.soundMapGeometry);
  }catch{}
  if(engine.lastTiming){
   // The host's existing bounded diagnostic writer receives this on its stderr
   // worker. stdout completion is pipe completion, never endpoint submission.
   const row={type:'producer-block-timing',...engine.lastTiming,stdoutCompletedNodeMs:performance.now(),snapshotReceiptNodeMs:lastFrame?.receivedAt??null,
    snapshotAcceptedNodeMs:lastFrame?.at??null,snapshotHostWriteBeforeQpc:lastFrame?.hostWriteBeforeQpc??null,snapshotHostQpcFrequency:lastFrame?.hostQpcFrequency??null};
   const text=JSON.stringify(row);if(latencyRows<1500&&text.length<=1900&&process.stderr.writableLength<16384){process.stderr.write(text+'\n');latencyRows++;}else latencyRowsOmitted++;
  }
 }catch(e){finish(e);}finally{busy=false;if(credits>0&&!stopped)setImmediate(pump);}
}
function geometry(message){
 if(!lastFrame||message.schema!==1||message.session!==session||message.gameSha256!==config.gameSha256||message.clockBasis!=='absolute-qpc-ms'||!Number.isInteger(message.revision)||message.revision<=latestGeometryRevision)throw Error('geometry source binding');
 // Gameplay source coordinates are native world coordinates. Accept only the
 // corresponding explicit metre assumption; never mix a local tile transform.
 const coordinates=message.input?.coordinates;
 if(JSON.stringify(coordinates?.originNative)!=='[0,0,0]'||coordinates?.metresPerNativeUnit!==1||JSON.stringify(coordinates?.axes)!=='[[1,0,0],[0,1,0],[0,0,1]]')throw Error('geometry world coordinate mapping');
 const nowMs=lastFrame.frame.listener.observationTicks/lastFrame.frame.listener.clockFrequency*1000+lastFrame.age+performance.now()-lastFrame.at;
 const scene=observedAcousticScene({...message.input,coordinates:observationCoordinates(message.input.coordinates),mode:'live-snapshot',context:{session,build:config.gameVersion,interior:message.interior,revision:message.revision,nowMs},
  visibilityAssumption:'unobserved-space-assumed-clear',motionAssumption:'static-during-snapshot',engine:{order:2,maxPaths:64,maxReflectors:16,...vehicleDistanceSceneOptions('authored-detail-loss-v1')}});
 engine.setQualifiedScene(scene,performance.now()+Math.min(1000,scene.tile.validUntil-nowMs));engine.geometryAnchor={at:performance.now(),observationMs:nowMs};latestGeometryRevision=message.revision;
}
const input=readline.createInterface({input:process.stdin,terminal:false});
input.on('line',line=>{try{if(line.length>131072)throw Error('producer command size');const m=JSON.parse(line);
 if(m.type==='credit'){const cap=latencyProfile.startupBlocks;if(!Number.isInteger(m.blocks)||m.blocks<1||m.blocks>cap||credits+m.blocks>cap)throw Error('bounded PCM credits');credits+=m.blocks;
  if(traceDelivery&&Number.isSafeInteger(m.deliveryId))delivery('c',m.deliveryId,performance.now());
 }
 else if(m.type==='settings'){const previousDemand01=(viewer?1:0)|(soundMapRecordingRequest01?2:0)|(soundMapBackgroundRequest01?4:0);for(const key of ['soundMapVisible','soundMapRecording','soundMapBackgroundTelemetry'])if(m[key]!==undefined&&typeof m[key]!=='boolean')throw Error('Boolean SoundMap demand required');pendingSettings={quality:m.quality,acceleration:m.acceleration,enabled:m.enabled,volume:m.volume,reflections:m.reflections,mode:m.mode,airflowEnabled:m.airflowEnabled,airflowLevel:m.airflowLevel};if(m.soundMapVisible!==undefined)viewer=m.soundMapVisible;if(m.soundMapRecording!==undefined)soundMapRecordingRequest01=m.soundMapRecording;if(m.soundMapBackgroundTelemetry!==undefined)soundMapBackgroundRequest01=m.soundMapBackgroundTelemetry;engine.telemetry.enabled=soundMapRequired01();engine.updateInstalledConsumerWorkload01();if(previousDemand01!==((viewer?1:0)|(soundMapRecordingRequest01?2:0)|(soundMapBackgroundRequest01?4:0))&&process.stderr.writableLength<16384)log({type:'soundmap-demand-changed',...soundMapDemandStatus01()});}
 else if(m.type==='snapshot'){if(!Array.isArray(m.frame?.vehicles)||m.frame.vehicles.some(v=>v.valid&&!allowed.has(v.model+':'+v.context))||m.validForMs!==undefined&&(!Number.isFinite(m.validForMs)||m.validForMs<=0||m.validForMs>252))throw Error('unprepared source identity or expiry');pendingSnapshot={...m,receivedAt:performance.now()};}
 else if(m.type==='geometry'){if(!qualification)pendingGeometry=m.value;}
 else if(m.type==='stop'){finish(null,'host-stop-command');return;}else throw Error('producer command');pump();
 }catch(e){finish(e);}});
input.on('close',()=>{if(!stopped)finish(null,'host-control-eof');});process.on('SIGTERM',()=>finish(null,'process-signal-SIGTERM'));process.on('SIGINT',()=>finish(null,'process-signal-SIGINT'));
const timer=setInterval(()=>{if(!stopped)status();},500);timer.unref();
if(qualification)setTimeout(()=>finish(Error('normal qualification cutoff reached'),'coordinator-cutoff'),Math.max(1,qualification.stopBy-Date.now())).unref();
log({type:'gameplay-ready',featureProfile:'STREET-01-main',...sourceStartupPreparation10,startupVoices,normalControlWarmup,mode:'experimental-additive',nativeSuppression:false,airflowImplemented:true,airflowEnabled:engine.settings.airflowEnabled,installedWorldQualified:false});
