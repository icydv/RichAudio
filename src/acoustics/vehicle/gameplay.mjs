// Continuous stock producer. The audio callback remains the existing native ring.
import {ListenerPlayout} from '../streaming/listener-playout.mjs';
import {conditionalStockScene,validated} from '../engine/contracts.mjs';
import {createStockVehiclePipeline} from './pipeline.mjs';
import {vehicleDistanceSceneOptions} from './distance-presentation.mjs';
import {AcousticQualityController} from '../streaming/acoustic-quality.mjs';
import {inBox} from '../research/local-geometry.mjs';
const FS=48000,BLOCK=512,MAX=2,unit=v=>{const n=Math.hypot(...v);if(n<1e-8)throw Error('orientation discontinuity');return v.map(x=>x/n);};
const mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export class StockGameplay {
 constructor({registry,profiles,session,now=()=>performance.now()}){
  this.registry=registry;this.profiles=profiles;this.now=now;this.session=session;this.settings={quality:'auto',acceleration:'auto',enabled:true,volume:1,reflections:true,mode:'experimental-additive'};
  // Fixed common observation clock: camera-stationary calibration cannot
  // relabel time while an independently moving vehicle is producing Doppler.
  this.playout=new ListenerPlayout();this.snapshots=[];this.sample=null;this.quality=new AcousticQualityController({now});
  this.slots=Array.from({length:MAX},(_,i)=>({index:i,identity:null,generation:1,source:null,vehicle:null,score:0}));
  this.ids=this.slots.flatMap(s=>['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`));
  this.direct=conditionalStockScene(this.ids,session,vehicleDistanceSceneOptions('authored-detail-loss-v1'));
  this.pipeline=createStockVehiclePipeline({scene:this.direct,sourceIds:this.ids,masterGain:.175,continuousRates:true,
    controlFilter:(c,r)=>this.filter(c,r)});
  this.inputs=Object.fromEntries(this.ids.map(id=>[id,new Float32Array(BLOCK)]));this.left=new Float32Array(BLOCK);this.right=new Float32Array(BLOCK);
  this.activeLimit=MAX;this.lastGood=now();this.consecutiveMisses=0;this.sceneExpiry=-Infinity;this.lastFrame=-1;this.lastGeneration=0;
  this.stats={blocks:0,acceptedFrames:0,rejectedFrames:0,unsupported:0,arrivals:0,retired:0,headroomPathsOmitted:0,deadlineMisses:0,maximumProcessingMs:0,maximumActive:0,sourceBudgetReductions:0,geometryUpdates:0,geometryFallbacks:0,clippingFaults:0};
 }
 accept(frame,ageMs){
  try{
   const state=frame.listener;if(frame.version!==1||frame.session!==this.session||!Array.isArray(frame.vehicles)||frame.vehicles.length>8||!Number.isFinite(ageMs)||ageMs< -2||ageMs>250)throw Error('gameplay frame');
   if(state.session!==this.session||state.sequence<=this.lastFrame||state.generation<this.lastGeneration)throw Error('gameplay identity');
   const ids=new Set();for(const v of frame.vehicles){
    if(typeof v.id!=='string'||!/^[\w:-]{1,64}$/.test(v.id)||ids.has(v.id)||!Number.isInteger(v.generation)||v.generation<1||!Number.isInteger(v.model)||v.model<0||v.model>0xffffffff||!['player','npc'].includes(v.context)||typeof v.running!=='boolean'||typeof v.valid!=='boolean'||!Number.isFinite(v.operatingPoint)||v.operatingPoint<0||v.operatingPoint>1)throw Error('vehicle identity/state');
    ids.add(v.id);for(const k of ['position','velocity','forward','up'])if(!Array.isArray(v[k])||v[k].length!==3||v[k].some(x=>!Number.isFinite(x)||Math.abs(x)>100000))throw Error('vehicle vectors');
    if(!Number.isSafeInteger(v.observationTicks)||Math.abs(v.observationTicks-state.observationTicks)/state.clockFrequency>.05)throw Error('source observation clock');
    if(Math.hypot(...v.velocity)>100||Math.abs(Math.hypot(...v.forward)-1)>1e-4||Math.abs(Math.hypot(...v.up)-1)>1e-4||Math.abs(v.forward.reduce((n,x,i)=>n+x*v.up[i],0))>1e-4)throw Error('vehicle orientation/speed');
   }
   this.playout.add({type:'listener',state,receiptAgeMs:ageMs},this.pipeline.renderer.frame/FS,this.now());this.playout.delayTarget=.1;
   const time=this.playout.records.at(-1).time;
   this.snapshots.push({time,frame:structuredClone(frame)});while(this.snapshots.length>64)this.snapshots.shift();
   this.lastFrame=state.sequence;this.lastGeneration=state.generation;this.stats.acceptedFrames++;
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
  let a=null,b=null;for(const s of this.snapshots){if(s.time<=time)a=s;else{b=s;break;}}
  if(!a||time-a.time>.25||!a.frame.listener.valid||a.frame.listener.paused)return [];
  const result=[];for(const identity of this.snapshots.at(-1).frame.vehicles){if(!identity.valid)continue;
   let left=null,right=null;for(const snapshot of this.snapshots){const v=snapshot.frame.vehicles.find(v=>v.id===identity.id&&v.generation===identity.generation&&v.model===identity.model&&v.context===identity.context&&v.valid);if(!v)continue;
    const at=snapshot.time+(v.observationTicks-snapshot.frame.listener.observationTicks)/snapshot.frame.listener.clockFrequency;
    if(at<=time)left={time:at,v};else{right={time:at,v};break;}}
   if(!left)continue;const old=left.v,next=right?.v;a={time:left.time};b=right;
   if(b&&!next)continue;
   const dt=next?b.time-a.time:0,u=dt>0?(time-a.time)/dt:0;
   if(next&&(dt>.25||distance(old.position,next.position)/dt>100))continue;
   if(!next&&time-a.time>.05)continue;
   const position=next?mix(old.position,next.position,u):old.position.map((x,i)=>x+old.velocity[i]*(time-a.time));
   const forward=next?unit(mix(old.forward,next.forward,u)):old.forward,up0=next?mix(old.up,next.up,u):old.up,dot=up0.reduce((n,x,i)=>n+x*forward[i],0),up=unit(up0.map((x,i)=>x-dot*forward[i]));
   result.push({...old,position,forward,up,velocity:next?mix(old.velocity,next.velocity,u):old.velocity,
    operatingPoint:next?old.operatingPoint+(next.operatingPoint-old.operatingPoint)*u:old.operatingPoint,
    running:old.running&&(!next||next.running),lift:next?next.operatingPoint<old.operatingPoint-.002:false});
  }return result;
 }
 async render(){
  const start=this.now(),time=this.pipeline.renderer.frame/FS;this.sample=this.playout.sample(time,this.now());
  if(this.pipeline.simulation.scene!==this.direct&&this.now()>=this.sceneExpiry){this.pipeline.replaceScene(this.direct);this.stats.geometryFallbacks++;}
  const listener=this.sample.state??{position:[0,0,0],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:false,generation:this.lastGeneration||1};
  const offered=this.sample.state?this.vehiclesAt(this.sample.targetTime):[];
  const eligible=[];for(const v of offered){const resolved=this.registry.resolve(v.model,v.context);if(resolved.status!=='available'){this.stats.unsupported++;continue;}
   const prior=this.slots.find(s=>s.identity===`${v.id}:${v.generation}:${v.model}:${v.context}`);
   const energy=Math.max(...Object.values(resolved.bank.layers.exhaust).map(a=>a.nativePeak??0));
   const score=(v.running?1:.01)*energy/Math.max(1,distance(v.position,listener.position))*(prior?1.5:1);
   eligible.push({v,resolved,score,identity:`${v.id}:${v.generation}:${v.model}:${v.context}`});
  }
  eligible.sort((a,b)=>b.score-a.score);const selected=eligible.slice(0,this.activeLimit),preserve=!this.sample.state&&(this.playout.lastState?.paused||this.sample.mode==='warming')&&this.sample.mode!=='stale-wall-clock',keep=new Set(preserve?this.slots.map(s=>s.identity):selected.map(x=>x.identity));
  for(const s of this.slots)if(s.identity&&!keep.has(s.identity)){s.identity=null;s.source=null;s.vehicle=null;this.stats.retired++;}
  for(const item of selected){let slot=this.slots.find(s=>s.identity===item.identity);if(!slot){slot=this.slots.find(s=>!s.identity);slot.identity=item.identity;slot.generation++;const profile=this.profiles?.profiles?.[item.resolved.bank.model];
    slot.source=this.registry.createSource(item.v.model,item.v.context,{sourceGain:profile?.sourceGain??1,...(profile?.pressureSharesByState?{pressureSharesByState:profile.pressureSharesByState}:{})});this.stats.arrivals++;}
   slot.vehicle=item.v;slot.score=item.score;
  }
  const sources=[];for(const s of this.slots){const ids=['engine','exhaust'].map(role=>`stock:slot${s.index}:${role}`);for(const id of ids)this.inputs[id].fill(0);
   if(!s.source||!this.sample.state)continue;const v=s.vehicle;s.source.renderInto({operatingPoint:v.operatingPoint,load:v.lift ? .05 : .9,lift:v.lift,running:v.running},this.inputs[ids[0]],this.inputs[ids[1]]);
   const profile=this.profiles?.profiles?.[s.source.vehicle.model];
   for(const [i,role]of ['engine','exhaust'].entries()){const placement=this.profiles?.emitters?.[s.source.vehicle.model],offset=role==='engine'?(placement?.engineOffset??.35):(placement?.exhaustOffset??-.75);
    sources.push({id:ids[i],generation:s.generation,position:v.position.map((x,k)=>x+v.forward[k]*offset+v.up[k]*(i ? .3 : .65)),velocity:v.velocity,
     forward:v.forward.map(x=>i?-x:x),up:v.up,directivity:profile?.directivity?.[role]??(i?.65:.1),valid:true,emitting:true});}
  }
  this.stats.maximumActive=Math.max(this.stats.maximumActive,selected.length);
  if(this.pipeline.simulation.scene!==this.direct&&(!inBox(listener.position,this.pipeline.simulation.scene.tile.bounds)||sources.some(s=>!inBox(s.position,this.pipeline.simulation.scene.tile.bounds)))){this.pipeline.replaceScene(this.direct);this.stats.geometryFallbacks++;}
  this.pipeline.simulation.setProcessingSettings({pathBudget:this.pipeline.renderer.maxPathsPerSource,maxReflectors:16,earlyReflections:this.settings.reflections});
  this.telemetry?.begin(this.pipeline.simulation,this.now());
  await this.pipeline.prepare({time,session:this.session,generation:listener.generation,listener,sources},this.pipeline.simulation.scene===this.direct?{}:{geometryTimeMs:this.geometryAnchor.observationMs+this.now()-this.geometryAnchor.at});
  const before=this.pipeline.renderer.stats.limited;this.pipeline.process(this.inputs,this.left,this.right);
  if(this.pipeline.renderer.stats.limited!==before){this.stats.clippingFaults++;throw Error('headroom invariant failed; stock fallback required');}
  const elapsed=this.now()-start;this.stats.blocks++;this.stats.maximumProcessingMs=Math.max(this.stats.maximumProcessingMs,elapsed);
  if(this.telemetry)try{this.visual=this.telemetry.publish(this.pipeline.simulation,this.pipeline.lastControl,{workerMs:elapsed});}catch{this.visual=null;}
  this.quality.observe({processingMs:elapsed,availablePaths:this.pipeline.lastControl.paths.length,activeBackend:this.pipeline.backend.diagnostics().activeAcceleration??'cpu'});
  this.pipeline.setQuality(this.quality.active);
  if(elapsed>BLOCK/FS*1000){this.stats.deadlineMisses++;this.consecutiveMisses++;this.lastGood=this.now();if(this.consecutiveMisses>=5&&this.activeLimit>1){this.activeLimit=1;this.stats.sourceBudgetReductions++;}}
  else{this.consecutiveMisses=0;if(this.now()-this.lastGood>5000)this.activeLimit=MAX;}
  return [this.left,this.right];
 }
 diagnostics(){return {...this.stats,active:this.slots.filter(s=>s.identity).length,activeLimit:this.activeLimit,mode:this.settings.mode,nativeReplacement:false,
   geometry:this.pipeline.simulation.scene===this.direct?'conditional-direct-unobserved-space-assumed-clear':'qualified-observed-partial',controlDelayMs:100,sourceHistoryLimitSeconds:2.5,propagationLimitSeconds:2,
   quality:this.quality.diagnostics(),pipeline:this.pipeline.diagnostics(),playout:this.playout.stats,memory:process.memoryUsage()};}
 close(){this.pipeline.close();}
}
