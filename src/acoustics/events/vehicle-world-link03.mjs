// Read-only integration seam. Actual getter observations can be associated with
// prepared world identities, but cannot become native-replacement sound events.
import {VehicleObservationReplay03,vehicleObservation03} from './vehicle-observation03.mjs';
import {componentIdentity,componentSourceId} from '../vehicle/components/contracts.mjs';
import {evaluateComponentTakeover,getVehicleComponent} from '../vehicle/components/registry.mjs';
import {evaluateEventAcquisition} from './acquisition-capability.mjs';
import {isSceneUnion03,sceneUnionMetadata03} from '../world/scene-union03.mjs';
import {freeze,requireWorld} from '../world/contracts.mjs';
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const mappings=Object.freeze({hornPlaying:['horn','horn-state'],engineOn:['engine','engine-state'],engineStarting:['engine','engine-state'],
 rawRevolutionsRatio:['engine','engine-state'],currentGear:['transmission','gear-state'],rawSpeed:['tyre-rolling','vehicle-speed-only']});

export class VehicleWorldLink03 {
 #replay;
 constructor({session,vehicleId,generation,model,worldDigest}={}){
  requireWorld(Number.isInteger(model)&&model>=0&&model<=0xffffffff&&/^[a-f0-9]{64}$/.test(worldDigest),'explicit vehicle/world model identity');
  this.#replay=new VehicleObservationReplay03({session,vehicleId,generation});
  Object.defineProperties(this,{identity:{value:freeze({session,vehicleId,vehicleGeneration:generation,model}),enumerable:true},
   worldDigest:{value:worldDigest,enumerable:true}});this.prepared=null;this.latest=null;this.terminal=false;
  this.stats={observations:0,levelDifferences:0,retirements:0,sceneBindings:0,eventDescriptorsEmitted:0,pcmQueueFramesAdded:0};
 }
 bindScene(scene){
  requireWorld(isSceneUnion03(scene),'prepared immutable resource scene required');const m=sceneUnionMetadata03(scene);
  requireWorld(m.session===this.identity.session&&m.worldDigest===this.worldDigest&&m.installedWorldVerified===false,'exact observation/world/scene identity');
  this.prepared=freeze({scene,metadata:m});this.stats.sceneBindings++;return this.prepared;
 }
 clearScene({worldDigest,generation}={}){
  requireWorld(this.prepared&&this.prepared.metadata.worldDigest===worldDigest&&this.prepared.metadata.generation===generation,'exact bound scene invalidation');this.prepared=null;
 }
 accept(input,{nowQpc}={}){
  const raw=vehicleObservation03(input);requireWorld(raw.identity.model===this.identity.model||raw.status!=='observed','observed vehicle model differs from selected source');
  const result=this.#replay.accept(input,{nowQpc});this.latest=result;this.stats.observations++;
  if(result.retirement){this.terminal=true;this.stats.retirements++;}
  this.stats.levelDifferences+=result.levelTransitions.length;
  const levels=result.levels.map(level=>{
   const [component,assembly]=mappings[level.field],identity=componentIdentity({...this.identity,component,assembly,componentGeneration:1});
   return {...level,identity,sourceId:componentSourceId(identity),timingUse:'observed-operating-level-only',
    acousticPosition:null,physicalIntensity:null,nativeOwner:'GTA',replacementPermitted:false};
  });
  return freeze({...result,levels,scene:this.prepared?{worldDigest:this.prepared.metadata.worldDigest,generation:this.prepared.metadata.generation,
   geometryKey:this.prepared.scene.geometryKey,installedWorldVerified:false}:null,
   eventDescriptorsEmitted:0,pcmQueueFramesAdded:0,mayGenerateAudio:false});
 }
 planTransient({component,nowQpc,geometryTimeMs}={}){
  getVehicleComponent(component);requireWorld(safe(nowQpc)&&(geometryTimeMs===undefined||(Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0)),'explicit observation and geometry clocks');
  const acquisition=evaluateEventAcquisition({mode:'production'}),ownership=evaluateComponentTakeover({component}),reasons=[];
  if(this.terminal)reasons.push('source-lease-retired-no-engine-shutdown-inferred');
  if(!this.latest||this.latest.status!=='observed')reasons.push('qualified-observed-level-unavailable');
  else{
   const o=this.latest.observation;
   if(nowQpc<o.captureAfterQpc||BigInt(nowQpc-o.captureBeforeQpc)*1000n>BigInt(o.clockFrequency)*250n)reasons.push('observation-expired-or-clock-incompatible');
  }
  if(!this.prepared)reasons.push('scene-unprepared-map-loading-does-not-queue-audio');
  else if(geometryTimeMs===undefined)reasons.push('geometry-clock-unavailable');
  else if(geometryTimeMs<this.prepared.scene.tile.createdAt||geometryTimeMs>=this.prepared.scene.tile.validUntil)reasons.push('scene-horizon-expired-or-future');
  reasons.push('original-physical-occurrence-and-multiplicity-unavailable','component-emission-position-unavailable',
   'gameplay-to-output-clock-mapping-unverified','native-acquisition-runtime-unverified',
   'native-component-coexistence-and-independent-restoration-unverified');
  return freeze({status:'BLOCKED',admitted:false,component,reasons,acquisition,ownership,descriptor:null,
   nativePrimary:true,mayGenerateDirect:false,mayGenerateReflections:false,sourceOperatingStatePrediction:false,
   retrospectiveVehicleDelayInherited:false,pcmQueueFramesAdded:0});
 }
 diagnostics(){return freeze({...this.stats,terminal:this.terminal,worldDigest:this.worldDigest,
  nativeEventBus:null,nativeSuppression:false,liveGameplayEnabled:false});}
}
