// Wholly original authored metre-scale vehicle and component trajectories.
// These are not captured GTA values, installed source mounts or inferred parts.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createVehicleEnvironment} from '../environment.mjs';
import {ComponentAcousticSession} from './pipeline.mjs';
import {createAuthoredComponentCapability,componentLimits,requireComponent} from './contracts.mjs';
export const componentFixtureSession='cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';
export const fixtureComponentIdentity=(component,assembly=component)=>({session:componentFixtureSession,vehicleId:'authored-vehicle',vehicleGeneration:1,model:0,
 component,assembly,componentGeneration:1});
export const componentFixtureListener=(generation=1)=>({position:[0,3,1.5],velocity:[0,0,0],forward:generation===1?[0,1,0]:[1,0,0],up:[0,0,1],generation});
export function componentFixtureState(component,frame,{active=true,mechanicalEvent=false}={}) {
 if(component==='horn')return {active,level:.8};
 if(component==='mechanical-clunk')return mechanicalEvent?{event:{eventId:'authored-clunk-1',sequence:0,occurrenceFrame:frame,observedFrame:frame,strength:.8,kind:'gear-clunk'}}:{};
 if(component==='transmission')return {engaged:active,shaftRps:15+45*Math.min(1,frame/48000),pinionTeeth:frame<32768?26:19,meshLoadNm:85};
 if(component==='brake')return {rotorSlidingSpeedMps:Math.max(0,14-4*frame/48000),padNormalForceN:active&&frame>=32768?3500:0,frictionCoefficient:.38,modeHz:2450};
 return {longitudinalSpeedMps:4,wheelSurfaceSpeedMps:component==='tyre-slip'?8:4,lateralSpeedMps:0,
  normalForceN:active?2400:0,frictionCoefficient:.75,wheelRadiusM:.32,surface:'asphalt'};
}
export function componentFixtureObservation(identity,frame,sequence,{active=true,mechanicalEvent=false,eligible=true}={}) {
 // Tyre radiator is in the authored contact region 5cm above the road, not
 // at the wheel centre; wheelRadiusM remains a separate kinematic input.
 const t=frame/48000,offset=identity.component.startsWith('tyre-')?[0,identity.component==='tyre-slip'?-.5:.5,.05]:
  identity.component==='horn'?[.6,0,.9]:identity.component==='brake'?[.7,.45,.35]:[0,0,.7];
 const second=identity.vehicleId==='authored-second-vehicle',direction=second?-1:1;
 return {identity,authority:'original-authored-component-fixture',sequence,observedFrame:frame,receivedFrame:frame,validThroughFrame:frame+511,eligible,
  pose:{position:[direction*(-8+4*t+offset[0]),offset[1]-(second?2:0),offset[2]],velocity:[4*direction,0,0],forward:[direction,0,0],up:[0,0,1]},
  // Zero selects the existing point-emitter/reference-distance model. The
  // tyre's physical wheelRadiusM is not the engine's finite-spreading radius.
  radiation:{directivity:identity.component==='horn'?.55:0,nearFieldRadius:0,basis:'authored-assumption'},
  state:componentFixtureState(identity.component,frame,{active,mechanicalEvent})};
}
export const componentPcmDigest=channels=>{const pcm=Buffer.alloc(channels[0].length*8);for(let i=0;i<channels[0].length;i++){pcm.writeFloatLE(channels[0][i],i*8);pcm.writeFloatLE(channels[1][i],i*8+4);}return createHash('sha256').update(pcm).digest('hex');};
export async function renderVehicleComponentsFixture({environment='direct',seconds=2,components=['horn','tyre-rolling','tyre-slip','mechanical-clunk'],cameraCut=false,geometryTransition=false,retainDry=false,twoVehicles=false}={}) {
 requireComponent(Number.isFinite(seconds)&&seconds>=1&&seconds<=8,'Bounded original fixture duration required');
 requireComponent(!twoVehicles||components.length*2<=componentLimits.sources,'Two authored vehicles must fit the existing source cap');
 const frames=Math.ceil(seconds*48000/512)*512,identities=components.map(c=>fixtureComponentIdentity(c)),capability=createAuthoredComponentCapability({session:componentFixtureSession,maximumFrame:frames-1});
 if(twoVehicles)identities.push(...identities.map(identity=>({...identity,vehicleId:'authored-second-vehicle'})));
 const env=createVehicleEnvironment(environment,{quality:'balanced',duration:seconds+1});
 const session=new ComponentAcousticSession({capability,identities,scene:env.scene});
 const stemNames=identities.map(i=>twoVehicles?i.vehicleId+'-'+i.component:i.component);
 const dryStems=retainDry?Object.fromEntries(stemNames.map(name=>[name,new Float32Array(frames)])):null;
 const left=new Float32Array(512),right=new Float32Array(512),allLeft=new Float32Array(frames),allRight=new Float32Array(frames),costs=[],paths=[];
 const dryHash=createHash('sha256'),sourceReferences=new Map(session.pipeline.renderer.sourceList.map(s=>[s.id,s.bands]));let sourceReferencesStable=true,peak=0,energy=0,firstOutput=-1,firstDry=-1;
 const began=performance.now();
 try {
  for(let frame=0;frame<frames;frame+=512) {
   const sequence=frame/512,active=frame>=12288&&frame<frames-16384;
   for(const identity of identities)session.accept(componentFixtureObservation(identity,frame,sequence,{active,mechanicalEvent:identity.component==='mechanical-clunk'&&frame===20480}));
   if(geometryTransition&&frame===32768)session.replaceScene(createVehicleEnvironment('tunnel',{quality:'balanced',duration:seconds+1}).scene);
   const started=performance.now();const control=await session.render({listener:componentFixtureListener(cameraCut&&frame>=32768?2:1),left,right});costs.push(performance.now()-started);
   for(const [index,id] of session.ids.entries()){const dry=session.inputs[id];dryHash.update(Buffer.from(dry.buffer));if(dryStems)dryStems[stemNames[index]].set(dry,frame);if(firstDry<0){const i=dry.findIndex(x=>x!==0);if(i>=0)firstDry=frame+i;}}
   for(const s of session.pipeline.renderer.sourceList)if(s.bands!==sourceReferences.get(s.id))sourceReferencesStable=false;
   if(sequence%4===0)paths.push({frame,count:control.paths.length,paths:control.paths.map(p=>({sourceId:p.sourceId,order:p.order,distance:p.distance,delaySeconds:p.delay,rate:p.rate}))});
   allLeft.set(left,frame);allRight.set(right,frame);for(let i=0;i<512;i++){const p=Math.max(Math.abs(left[i]),Math.abs(right[i]));if(firstOutput<0&&p!==0)firstOutput=frame+i;peak=Math.max(peak,p);energy+=left[i]**2+right[i]**2;}
  }
  const diagnostics=session.diagnostics(),sorted=[...costs].sort((a,b)=>a-b),at=q=>sorted[Math.ceil((sorted.length-1)*q)];
  return {channels:[allLeft,allRight],dryStems,measurement:{schema:1,authority:'original-authored-component-fixture',environment,frames,components:[...components],vehicleCount:twoVehicles?2:1,
   firstDryFrame:firstDry,firstOutputFrame:firstOutput,peak,energy,drySha256:dryHash.digest('hex'),pcmSha256:componentPcmDigest([allLeft,allRight]),
   sourceReferencesStable,sourceWorkerCostsMs:{count:costs.length,median:at(.5),p95:at(.95),p99:at(.99),maximum:at(1),overBlockBudget:costs.filter(x=>x>512/48).length},
   elapsedMs:performance.now()-began,processRssBytes:process.memoryUsage().rss,diagnostics,paths,cameraCut,geometryTransition,
   nativeTelemetryUsed:false,nativeSuppression:false,endpointOpened:false,physicalSoundPowerCalibrated:false}};
 } finally {session.close();}
}
