// Continuous stock producer. The audio callback remains the existing native ring.
import {ListenerPlayout} from '../streaming/listener-playout.mjs';
import {conditionalStockScene,validated} from '../engine/contracts.mjs';
import {createStockVehiclePipeline} from './pipeline.mjs';
import {vehicleDistanceSceneOptions} from './distance-presentation.mjs';
import {AcousticQualityController} from '../streaming/acoustic-quality.mjs';
import {inBox} from '../research/local-geometry.mjs';
import {resolveLatencyProfile} from './latency-profile.mjs';
import {isQualifiedStaticScene,staticSceneMetadata} from '../world/scene.mjs';
const FS=48000,BLOCK=512,MAX=2,unit=v=>{const n=Math.hypot(...v);if(n<1e-8)throw Error('orientation discontinuity');return v.map(x=>x/n);};
const mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const pcmCounters=()=>({nonzeroBlocks:0,peak:0,sumSquares:0});
// Fixed-size diagnostics only: observe the original PCM without changing it.
function observePcmBlock(left,counters,right=null){let peak=0,energy=0;
 for(let i=0;i<left.length;i++){const l=left[i],r=right?right[i]:0;peak=Math.max(peak,Math.abs(l),Math.abs(r));energy+=l*l+r*r;}
 if(peak>0)counters.nonzeroBlocks++;counters.peak=Math.max(counters.peak,peak);counters.sumSquares+=energy;
}
export class StockGameplay {
 constructor({registry,profiles,session,now=()=>performance.now(),latencyDiagnostics=false,latencyProfile='baseline',continuityPolicy='baseline'}){
  if(!['baseline','camera-source-01'].includes(continuityPolicy))throw Error('Explicit vehicle continuity policy required');
  this.continuityPolicy=continuityPolicy;this.latencyProfile=resolveLatencyProfile(latencyProfile);this.controlDelayMs=this.latencyProfile.controlDelayMs;
  this.registry=registry;this.profiles=profiles;this.now=now;this.session=session;this.settings={quality:'auto',acceleration:'auto',enabled:true,volume:1,reflections:true,mode:'experimental-additive'};
  // Fixed common observation clock: camera-stationary calibration cannot
  // relabel time while an independently moving vehicle is producing Doppler.
  this.playout=new ListenerPlayout({anchoredClock:true,delayMs:this.controlDelayMs,preserveGenerationHistory:continuityPolicy==='camera-source-01'});this.snapshots=[];this.sample=null;this.quality=new AcousticQualityController({now});
  this.slots=Array.from({length:MAX},(_,i)=>({index:i,identity:null,generation:1,source:null,vehicle:null,score:0}));
  this.ids=this.slots.flatMap(s=>['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`));
  this.direct=conditionalStockScene(this.ids,session,vehicleDistanceSceneOptions('authored-detail-loss-v1'));
  this.pipeline=createStockVehiclePipeline({scene:this.direct,sourceIds:this.ids,masterGain:.175,continuousRates:true,
    controlFilter:(c,r)=>this.filter(c,r)});
  this.inputs=Object.fromEntries(this.ids.map(id=>[id,new Float32Array(BLOCK)]));this.left=new Float32Array(BLOCK);this.right=new Float32Array(BLOCK);
  this.activeLimit=MAX;this.lastGood=now();this.consecutiveMisses=0;this.sceneExpiry=-Infinity;this.lastFrame=-1;this.lastGeneration=0;
  this.stats={blocks:0,acceptedFrames:0,rejectedFrames:0,unsupported:0,arrivals:0,retired:0,headroomPathsOmitted:0,deadlineMisses:0,maximumProcessingMs:0,maximumActive:0,sourceBudgetReductions:0,geometryUpdates:0,geometryFallbacks:0,clippingFaults:0};
  this.stageCounters={validVehicleObservations:0,runningVehicleObservations:0,eligibleVehicleBlocks:0,sourceCreations:0,sourcePlaybackBlocks:0,acousticPathBlocks:0,
   engine:pcmCounters(),exhaust:pcmCounters(),stereo:pcmCounters()};
  this.lifecycle={observedNotRunning:0,scopeRetirements:0,lastRetirements:[]};
  // One sampled block in eight, at most two selected sources. This is lineage
  // metadata only; it does not participate in source selection or DSP.
  this.latencyDiagnostics=latencyDiagnostics;this.lastTiming=null;this.captureTiming=false;this.latencyBrackets=[];
 }
 accept(frame,ageMs,validForMs=null){
  try{
   const state=frame.listener;if(frame.version!==1||frame.session!==this.session||!Array.isArray(frame.vehicles)||frame.vehicles.length>8||!Number.isFinite(ageMs)||ageMs< -2||ageMs>250||validForMs!==null&&(!Number.isFinite(validForMs)||validForMs<=0||validForMs>252))throw Error('gameplay frame');
   if(state.session!==this.session||state.sequence<=this.lastFrame||state.generation<this.lastGeneration)throw Error('gameplay identity');
   const ids=new Set();for(const v of frame.vehicles){
    if(typeof v.id!=='string'||!/^[\w:-]{1,64}$/.test(v.id)||ids.has(v.id)||!Number.isInteger(v.generation)||v.generation<1||!Number.isInteger(v.model)||v.model<0||v.model>0xffffffff||!['player','npc'].includes(v.context)||typeof v.running!=='boolean'||typeof v.valid!=='boolean'||!Number.isFinite(v.operatingPoint)||v.operatingPoint<0||v.operatingPoint>1)throw Error('vehicle identity/state');
    ids.add(v.id);for(const k of ['position','velocity','forward','up'])if(!Array.isArray(v[k])||v[k].length!==3||v[k].some(x=>!Number.isFinite(x)||Math.abs(x)>100000))throw Error('vehicle vectors');
    if(!Number.isSafeInteger(v.observationTicks)||Math.abs(v.observationTicks-state.observationTicks)/state.clockFrequency>.05)throw Error('source observation clock');
    if(Math.hypot(...v.velocity)>100||Math.abs(Math.hypot(...v.forward)-1)>1e-4||Math.abs(Math.hypot(...v.up)-1)>1e-4||Math.abs(v.forward.reduce((n,x,i)=>n+x*v.up[i],0))>1e-4)throw Error('vehicle orientation/speed');
   }
   const previous=this.playout.lastState;
   this.playout.add({type:'listener',state,receiptAgeMs:ageMs},this.pipeline.renderer.frame/FS,this.now());this.playout.delayTarget=this.controlDelayMs/1000;
   const time=this.playout.records.at(-1).time;
   // Vehicle observations retain their own identity/pose clock across a camera
   // cut. Only the opt-in policy keeps them; listener interpolation and spatial
   // Doppler history still have an explicit generation boundary.
   const sameRepresentation=previous&&state.clockFrequency===previous.clockFrequency&&state.coordinates===previous.coordinates&&state.units===previous.units&&state.listenerKind===previous.listenerKind;
   if(this.lastGeneration&&state.generation!==this.lastGeneration&&(this.continuityPolicy==='baseline'||!sameRepresentation))this.snapshots=[];
   this.snapshots.push({time,frame:structuredClone(frame),wallExpires:validForMs===null?Infinity:this.now()+validForMs});while(this.snapshots.length>64)this.snapshots.shift();
   this.lastFrame=state.sequence;this.lastGeneration=state.generation;this.stats.acceptedFrames++;
   for(const v of frame.vehicles)if(v.valid){this.stageCounters.validVehicleObservations++;if(v.running)this.stageCounters.runningVehicleObservations++;else this.lifecycle.observedNotRunning++;}
  }catch(e){this.stats.rejectedFrames++;throw e;}
 }
 setSettings(s){
  if(!['auto','performance','balanced','quality','max'].includes(s.quality)||!['auto','cpu','gpu'].includes(s.acceleration)||typeof s.enabled!=='boolean'||!Number.isFinite(s.volume)||s.volume<0||s.volume>1||typeof s.reflections!=='boolean'||!['stock-fallback','experimental-additive'].includes(s.mode))throw Error('gameplay settings');
  this.settings={...s};this.quality.select(s.quality);this.pipeline.setQuality(this.quality.active);this.pipeline.setAcceleration(s.acceleration);
  this.pipeline.renderer.setOutputPreferences({richAudioEnabled:s.enabled&&s.mode==='experimental-additive',outputLevel:s.volume});
 }
 // Only the existing validated observed-geometry adapter can produce this scene.
 setQualifiedScene(scene,expiresAt){
  if(!validated.scene(scene)||scene.observationModel?.kind!=='conditional-observed-model'||scene.observationModel.mode!=='live-snapshot'||scene.tile.session!==this.session||!Number.isFinite(expiresAt)||expiresAt<=this.now()||expiresAt-this.now()>1000)throw Error('fresh qualified observed scene required');
  this.pipeline.replaceScene(scene);this.sceneExpiry=expiresAt;this.stats.geometryUpdates++;
  this.staticSceneBinding=null;
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
 clearQualifiedStaticScene({worldDigest,generation}={}){
  if(!this.staticSceneBinding||this.staticSceneBinding.worldDigest!==worldDigest||this.staticSceneBinding.generation!==generation)throw Error('Exact static world invalidation identity required');
  this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.sceneExpiry=-Infinity;this.stats.geometryFallbacks++;
 }
 filter(control,renderer){
  // Complementary bands have nonincreasing passive coefficients: their sum is
  // a convex combination of original PCM and its stable lowpass histories.
  // Reserve absolute pressure bounds for old release paths before new paths.
  const weights=s=>.98*s.pressureGain*.175;
  const occupied=new Map();let total=0;
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
   let left=null,right=null;for(const snapshot of this.snapshots){const v=snapshot.frame.vehicles.find(v=>v.id===identity.id&&v.generation===identity.generation&&v.model===identity.model&&v.context===identity.context&&v.valid);if(!v)continue;
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
    running:this.continuityPolicy==='camera-source-01'?old.running:old.running&&(!next||next.running),lift:next?next.operatingPoint<old.operatingPoint-.002:false});
  }return result;
 }
 async render(){
  const start=this.now(),time=this.pipeline.renderer.frame/FS;this.sample=this.playout.sample(time,this.now());
  this.captureTiming=this.latencyDiagnostics&&this.stats.blocks%8===0;this.lastTiming=null;if(this.captureTiming)this.latencyBrackets=[];
  if(this.pipeline.simulation.scene!==this.direct&&this.now()>=this.sceneExpiry){this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.stats.geometryFallbacks++;}
  const listener=this.sample.state??{position:[0,0,0],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:false,generation:this.lastGeneration||1};
  const independentSource=this.continuityPolicy==='camera-source-01'&&!['missing','stale-wall-clock','clock-invalid','invalid-or-paused','invalid-interval','observation-gap'].includes(this.sample.mode);
  const offered=this.sample.state||independentSource?this.vehiclesAt(this.sample.targetTime):[];
  const eligible=[];for(const v of offered){const resolved=this.registry.resolve(v.model,v.context);if(resolved.status!=='available'){this.stats.unsupported++;continue;}
   const prior=this.slots.find(s=>s.identity===`${v.id}:${v.generation}:${v.model}:${v.context}`);
   // Do not create a new source without a qualified listener. A still-valid
   // existing source can advance its dry/grain history through a listener-only
   // gap while the unchanged renderer releases unavailable spatial paths.
   if(!this.sample.state&&!prior)continue;
   const energy=Math.max(...Object.values(resolved.bank.layers.exhaust).map(a=>a.nativePeak??0));
   const score=(v.running?1:.01)*energy/Math.max(1,distance(v.position,listener.position))*(prior?1.5:1);
   eligible.push({v,resolved,score,identity:`${v.id}:${v.generation}:${v.model}:${v.context}`});
  }
  this.stageCounters.eligibleVehicleBlocks+=eligible.length;
  eligible.sort((a,b)=>b.score-a.score);const selected=eligible.slice(0,this.activeLimit),preserve=!this.sample.state&&(this.playout.lastState?.paused||this.continuityPolicy==='baseline'&&this.sample.mode==='warming')&&this.sample.mode!=='stale-wall-clock',keep=new Set(preserve?this.slots.map(s=>s.identity):selected.map(x=>x.identity));
  for(const s of this.slots)if(s.identity&&!keep.has(s.identity)){
   const latest=this.snapshots.at(-1),current=latest?.frame.vehicles.find(v=>`${v.id}:${v.generation}:${v.model}:${v.context}`===s.identity);
   const reason=latest&&this.now()>=latest.wallExpires?'source-expiry':!current?'source-absent-or-identity-change':!current.valid?'source-invalid':!this.sample.state&&!independentSource?'listener-unavailable':'source-pose-unavailable';
   this.lifecycle.scopeRetirements++;this.lifecycle.lastRetirements.push({reason,sourceFrame:s.source?.frame??null,lastQualifiedRunning:s.vehicle?.running??null,engineShutdownInferred:false});if(this.lifecycle.lastRetirements.length>MAX)this.lifecycle.lastRetirements.shift();
   s.identity=null;s.source=null;s.vehicle=null;this.stats.retired++;
  }
  for(const item of selected){let slot=this.slots.find(s=>s.identity===item.identity);if(!slot){slot=this.slots.find(s=>!s.identity);slot.identity=item.identity;slot.generation++;const profile=this.profiles?.profiles?.[item.resolved.bank.model];
    slot.source=this.registry.createSource(item.v.model,item.v.context,{sourceGain:profile?.sourceGain??1,...(profile?.pressureSharesByState?{pressureSharesByState:profile.pressureSharesByState}:{})});this.stats.arrivals++;this.stageCounters.sourceCreations++;}
   slot.vehicle=item.v;slot.score=item.score;
  }
  const sources=[];for(const s of this.slots){const ids=['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`);for(const id of ids)this.inputs[id].fill(0);
   if(!s.source||!this.sample.state&&(!independentSource||!selected.some(item=>item.identity===s.identity)))continue;const v=s.vehicle;s.source.renderInto({operatingPoint:v.operatingPoint,load:v.lift ? .05 : .9,lift:v.lift,running:v.running},this.inputs[ids[0]],this.inputs[ids[1]]);
   this.stageCounters.sourcePlaybackBlocks++;observePcmBlock(this.inputs[ids[0]],this.stageCounters.engine);observePcmBlock(this.inputs[ids[1]],this.stageCounters.exhaust);
   const profile=this.profiles?.profiles?.[s.source.vehicle.model];
   for(const [i,role]of ['engine','exhaust'].entries()){const placement=this.profiles?.emitters?.[s.source.vehicle.model],offset=role==='engine'?(placement?.engineOffset??.35):(placement?.exhaustOffset??-.75);
    sources.push({id:ids[i],generation:s.generation,position:v.position.map((x,k)=>x+v.forward[k]*offset+v.up[k]*(i ? .3 : .65)),velocity:v.velocity,
     forward:v.forward.map(x=>i?-x:x),up:v.up,directivity:profile?.directivity?.[role]??(i?.65:.1),valid:true,emitting:true});}
  }
  this.stats.maximumActive=Math.max(this.stats.maximumActive,selected.length);
  if(this.pipeline.simulation.scene!==this.direct&&(!inBox(listener.position,this.pipeline.simulation.scene.tile.bounds)||sources.some(s=>!inBox(s.position,this.pipeline.simulation.scene.tile.bounds)))){this.pipeline.replaceScene(this.direct);this.staticSceneBinding=null;this.stats.geometryFallbacks++;}
  this.pipeline.simulation.setProcessingSettings({pathBudget:this.pipeline.renderer.maxPathsPerSource,maxReflectors:16,earlyReflections:this.settings.reflections});
  this.telemetry?.begin(this.pipeline.simulation,this.now());
  await this.pipeline.prepare({time,session:this.session,generation:listener.generation,listener,sources},this.pipeline.simulation.scene===this.direct?{}:{geometryTimeMs:this.geometryAnchor.observationMs+this.now()-this.geometryAnchor.at});
  if(this.pipeline.lastControl.paths.length>0)this.stageCounters.acousticPathBlocks++;
  const before=this.pipeline.renderer.stats.limited;this.pipeline.process(this.inputs,this.left,this.right);
  observePcmBlock(this.left,this.stageCounters.stereo,this.right);
  if(this.pipeline.renderer.stats.limited!==before){this.stats.clippingFaults++;throw Error('headroom invariant failed; stock fallback required');}
  const elapsed=this.now()-start;this.stats.blocks++;this.stats.maximumProcessingMs=Math.max(this.stats.maximumProcessingMs,elapsed);
  if(this.telemetry)try{this.visual=this.telemetry.publish(this.pipeline.simulation,this.pipeline.lastControl,{workerMs:elapsed});}catch{this.visual=null;}
  this.quality.observe({processingMs:elapsed,availablePaths:this.pipeline.lastControl.paths.length,activeBackend:this.pipeline.backend.diagnostics().activeAcceleration??'cpu'});
  this.pipeline.setQuality(this.quality.active);
  if(elapsed>BLOCK/FS*1000){this.stats.deadlineMisses++;this.consecutiveMisses++;this.lastGood=this.now();if(this.consecutiveMisses>=5&&this.activeLimit>1){this.activeLimit=1;this.stats.sourceBudgetReductions++;}}
  else{this.consecutiveMisses=0;if(this.now()-this.lastGood>5000)this.activeLimit=MAX;}
  if(this.captureTiming){const selectedIds=new Set(selected.map(s=>s.v.id));this.lastTiming={producerFrameStart:Math.round(time*FS),frames:BLOCK,
   nodeClockDomain:'node-performance-ms',nodeFrequency:1000,renderStartedNodeMs:start,renderCompletedNodeMs:this.now(),processingMs:elapsed,
   sourceTargetTimeSeconds:this.sample.targetTime??null,latestAcceptedSequence:this.lastFrame,controlDelayMs:this.controlDelayMs,
   sourceBrackets:this.latencyBrackets.filter(s=>selectedIds.has(s.id)).slice(0,MAX)};}
  return [this.left,this.right];
 }
 diagnostics(){return {...this.stats,active:this.slots.filter(s=>s.identity).length,activeLimit:this.activeLimit,mode:this.settings.mode,nativeReplacement:false,
   lifecycle:{...this.lifecycle,lastRetirements:this.lifecycle.lastRetirements.map(r=>({...r}))},
   stageCounters:{...this.stageCounters,engine:{...this.stageCounters.engine},exhaust:{...this.stageCounters.exhaust},stereo:{...this.stageCounters.stereo}},
   selectedPaths:this.pipeline.lastControl?.paths.length??0,outputPeak:this.pipeline.renderer.stats.peak,
   listenerState:this.sample?.mode??'not-observed',
   sourceStates:this.slots.filter(s=>s.source).map(s=>({bank:s.source.vehicle.model,context:s.source.npc?'npc':'player',running:s.vehicle?.running??false,
    operatingPoint:s.vehicle?.operatingPoint??null,sourceFrame:s.source.frame,dryPeak:s.source.stats.peak,
    listenerDistance:this.sample?.state&&s.vehicle?distance(s.vehicle.position,this.sample.state.position):null})),
   geometry:this.pipeline.simulation.scene===this.direct?'conditional-direct-unobserved-space-assumed-clear':this.staticSceneBinding?'qualified-static-authored-fixture':'qualified-observed-partial',controlDelayMs:this.controlDelayMs,latencyProfile:this.latencyProfile.id,continuityPolicy:this.continuityPolicy,sourceHistoryLimitSeconds:2.5,propagationLimitSeconds:2,
   quality:this.quality.diagnostics(),pipeline:this.pipeline.diagnostics(),playout:this.playout.stats,memory:process.memoryUsage()};}
 close(){this.pipeline.close();}
}
