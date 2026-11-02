// Continuous owned producer. No WASAPI, game API, archive decode or synthetic source.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {performance} from 'node:perf_hooks';
import {loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {resolveLatencyProfile} from '../src/acoustics/vehicle/latency-profile.mjs';
import {encodeVehicleRa07} from '../src/acoustics/vehicle/pipeline.mjs';
import {observationCoordinates,observedAcousticScene} from '../src/acoustics/engine/observed-geometry.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {SoundMapTelemetry} from '../src/acoustics/streaming/soundmap-telemetry.mjs';import {SoundMapClient} from './soundmap/producer-client.mjs';
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--manifest'||args[2]!=='--session')throw Error('owned manifest/session required');
const manifest=path.resolve(args[1]),root=path.dirname(manifest),config=JSON.parse(fs.readFileSync(manifest,'utf8')),session=args[3];
const latencyProfile=resolveLatencyProfile(config.latencyProfile);
if(latencyProfile.id==='low-latency-01'&&(config.demoProfile!=='PLAYABLE-13'||config.eligible?.length!==1||config.eligible[0].model!==0xf9300cc5||config.eligible[0].context!=='player'))throw Error('LOW-LATENCY-01 requires the Bati-player demonstration package');
const inside=relative=>{const p=path.resolve(root,relative);if(!p.startsWith(root+path.sep))throw Error('package path escaped');return p;};
const assets=loadStockCatalogAssets(inside(config.playerManifest),{sustainAtlasFile:inside(config.atlas)}),npcAssets=loadStockNpcAssets(inside(config.npcManifest));
const registry=loadInstalledStockRegistry({catalogFile:inside(config.catalog),catalogSha256:config.catalogSha256,assets,npcAssets}),profiles=JSON.parse(fs.readFileSync(inside(config.profiles),'utf8'));
// Warm the shared source timelines before the host releases any telemetry.
const warmed=new Set();for(const pair of config.eligible){const r=registry.resolve(pair.model,pair.context);if(r.status!=='available')throw Error('prepared eligible model no longer maps');const key=pair.context+':'+r.bank.model;
 if(!warmed.has(key)){registry.createSource(pair.model,pair.context);warmed.add(key);}}
const engine=new StockGameplay({registry,profiles,session,latencyDiagnostics:true,latencyProfile:latencyProfile.id,continuityPolicy:config.continuityPolicy??'baseline'}),allowed=new Set(config.eligible.map(p=>p.model+':'+p.context));
let credits=0,busy=false,stopped=false,sequence=0,pendingSnapshot=null,clock=null,lastFrame=null,latestGeometryRevision=0,latencyRows=0,latencyRowsOmitted=0;
let viewer=false,viewerClient=null;engine.telemetry=new SoundMapTelemetry();
const packet=Buffer.alloc(4112),log=v=>process.stderr.write(JSON.stringify(v)+'\n');
function status(){const d=engine.diagnostics(),b=d.pipeline.backend,q=d.quality;
 try{if(viewer&&!viewerClient&&fs.existsSync(path.join(root,'.local/soundmap/service.json')))viewerClient=new SoundMapClient(path.join(root,'.local/soundmap/service.json'));if(!viewer&&viewerClient){viewerClient.close().catch(()=>{});viewerClient=null;}}catch{}
 log({type:'gameplay-status',status:{requestedQuality:q.requestedQuality,activeQuality:q.activeQuality,pathBudget:engine.pipeline.renderer.maxPathsPerSource,
  requestedAcceleration:b.requestedAcceleration,activeAcceleration:b.activeAcceleration,gpuDevice:b.gpuDevice,gpuCapability:b.gpuResultsApplied>0?'hardware-directcompute':'unestablished',gpuResultsApplied:b.gpuResultsApplied??b.totals?.gpuResultsApplied??0,
  droppedResults:b.droppedResults??b.totals?.droppedResults??0,qualityDeadlineMisses:d.deadlineMisses,activeSources:d.active,activeVehicles:d.active,activeEmitters:d.active*2,sourceBudget:d.activeLimit,
  integrationMode:d.mode,nativeReplacement:false,geometryMode:d.geometry,processingMaximumMs:d.maximumProcessingMs,sourceHistoryBytes:d.pipeline.sourceHistoryBytes,memoryBytes:d.memory.rss,
  clippedSamples:0,limitedSamples:d.pipeline.renderer.limited,missingHistory:d.pipeline.renderer.missingHistory,headroomPathsOmitted:d.headroomPathsOmitted,
  richAudioEnabled:engine.settings.enabled,outputLevel:engine.settings.volume,earlyReflections:engine.settings.reflections,
  listenerState:d.listenerState,selectedPaths:d.selectedPaths,outputPeak:d.outputPeak,sourceStates:d.sourceStates,stageCounters:d.stageCounters,
  fallbackReason:d.geometry==='conditional-direct-unobserved-space-assumed-clear'?'Additive; conditional direct sound without collision coverage':b.fallbackReason,
  controlDelayMs:latencyProfile.controlDelayMs,propagationLimitSeconds:2,arrivals:d.arrivals,retired:d.retired,latencyRows,latencyRowsOmitted,...(latencyProfile.id==='baseline'?{}:{latencyProfile:latencyProfile.id,producerCreditBlocks:latencyProfile.producerCreditBlocks})}});
}
function finish(error){if(stopped)return;stopped=true;engine.close();if(viewerClient){viewerClient.close().catch(()=>{});viewerClient=null;}viewer=false;status();if(error){log({type:'gameplay-error',code:error.message});process.exitCode=1;}input.close();process.stdin.pause();}
async function pump(){if(busy||stopped||credits<=0)return;busy=true;
 try{
  if(pendingSnapshot){const m=pendingSnapshot;pendingSnapshot=null;const now=performance.now(),s=m.frame.listener;
   if(!clock)clock={ticks:s.observationTicks+m.ageMs*s.clockFrequency/1000,at:now,frequency:s.clockFrequency};
   if(s.clockFrequency!==clock.frequency)throw Error('producer observation clock changed');
   const age=Math.max(m.ageMs,(clock.ticks+(now-clock.at)*clock.frequency/1000-s.observationTicks)*1000/clock.frequency);
   const remaining=m.validForMs===undefined?null:m.validForMs-(now-m.receivedAt);
   if(age<=250&&(remaining===null||remaining>0)){engine.accept(m.frame,age,remaining);lastFrame={frame:m.frame,age,at:now,receivedAt:m.receivedAt,hostWriteBeforeQpc:m.hostWriteBeforeQpc??null,hostQpcFrequency:m.hostQpcFrequency??null};}
  }
  const channels=await engine.render();credits--;encodeVehicleRa07(...channels,sequence,packet);sequence=(sequence+1)>>>0;
  if(viewerClient&&engine.visual?.soundMapFrame)try{viewerClient.offer(engine.visual.soundMapFrame,engine.visual.soundMapGeometry);}catch{}
  await new Promise((resolve,reject)=>process.stdout.write(packet,e=>e?reject(e):resolve()));
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
 if(m.type==='credit'){const cap=latencyProfile.startupBlocks;if(!Number.isInteger(m.blocks)||m.blocks<1||m.blocks>cap||credits+m.blocks>cap)throw Error('bounded PCM credits');credits+=m.blocks;}
 else if(m.type==='settings'){engine.setSettings({quality:m.quality,acceleration:m.acceleration,enabled:m.enabled,volume:m.volume,reflections:m.reflections,mode:m.mode});viewer=m.soundMapVisible===true;engine.telemetry.enabled=viewer;}
 else if(m.type==='snapshot'){if(!Array.isArray(m.frame?.vehicles)||m.frame.vehicles.some(v=>v.valid&&!allowed.has(v.model+':'+v.context))||m.validForMs!==undefined&&(!Number.isFinite(m.validForMs)||m.validForMs<=0||m.validForMs>252))throw Error('unprepared source identity or expiry');pendingSnapshot={...m,receivedAt:performance.now()};}
 else if(m.type==='geometry'){try{geometry(m.value);}catch(e){log({type:'geometry-rejected',reason:e.message});}}
 else if(m.type==='stop'){finish();return;}else throw Error('producer command');pump();
 }catch(e){finish(e);}});
input.on('close',()=>{if(!stopped)finish();});process.on('SIGTERM',()=>finish());process.on('SIGINT',()=>finish());
const timer=setInterval(()=>{if(!stopped)status();},500);timer.unref();
log({type:'gameplay-ready',warmedBanks:warmed.size,mode:'experimental-additive',nativeSuppression:false});
