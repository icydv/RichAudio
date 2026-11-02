// Wholly original authored metre-scale vehicle and component trajectories.
// These are not captured GTA values, installed source mounts or inferred parts.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createVehicleEnvironment} from '../environment.mjs';
import {ComponentAcousticSession} from './pipeline.mjs';
import {createAuthoredComponentCapability,componentSourceId,requireComponent} from './contracts.mjs';
export const componentFixtureSession='cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';
export const fixtureComponentIdentity=(component,assembly=component)=>({session:componentFixtureSession,vehicleId:'authored-vehicle',vehicleGeneration:1,model:0,
 component,assembly,componentGeneration:1});
export const componentFixtureListener=(generation=1)=>({position:[0,3,1.5],velocity:[0,0,0],forward:generation===1?[0,1,0]:[1,0,0],up:[0,0,1],generation});
export function componentFixtureState(component,frame,{active=true,mechanicalEvent=false}={}) {
 if(component==='horn')return {active,level:.8};
 if(component==='mechanical-clunk')return mechanicalEvent?{event:{eventId:'authored-clunk-1',sequence:0,occurrenceFrame:frame,observedFrame:frame,strength:.8,kind:'gear-clunk'}}:{};
 return {longitudinalSpeedMps:4,wheelSurfaceSpeedMps:component==='tyre-slip'?8:4,lateralSpeedMps:0,
  normalForceN:active?2400:0,frictionCoefficient:.75,wheelRadiusM:.32,surface:'asphalt'};
}
export function componentFixtureObservation(identity,frame,sequence,{active=true,mechanicalEvent=false,eligible=true}={}) {
 const t=frame/48000,offset=identity.component.startsWith('tyre-')?[0,identity.component==='tyre-slip'?-.5:.5,.32]:
  identity.component==='horn'?[.6,0,.9]:[0,0,.7];
 return {identity,authority:'original-authored-component-fixture',sequence,observedFrame:frame,receivedFrame:frame,validThroughFrame:frame+511,eligible,
  pose:{position:[-8+4*t+offset[0],offset[1],offset[2]],velocity:[4,0,0],forward:[1,0,0],up:[0,0,1]},
  state:componentFixtureState(identity.component,frame,{active,mechanicalEvent})};
}
export const componentPcmDigest=channels=>{const pcm=Buffer.alloc(channels[0].length*8);for(let i=0;i<channels[0].length;i++){pcm.writeFloatLE(channels[0][i],i*8);pcm.writeFloatLE(channels[1][i],i*8+4);}return createHash('sha256').update(pcm).digest('hex');};
export async function renderVehicleComponentsFixture({environment='direct',seconds=2,components=['horn','tyre-rolling','tyre-slip','mechanical-clunk'],cameraCut=false,geometryTransition=false}={}) {
 requireComponent(Number.isFinite(seconds)&&seconds>=1&&seconds<=8,'Bounded original fixture duration required');
 const frames=Math.ceil(seconds*48000/512)*512,identities=components.map(c=>fixtureComponentIdentity(c)),capability=createAuthoredComponentCapability({session:componentFixtureSession,maximumFrame:frames-1});
 const env=createVehicleEnvironment(environment,{quality:'balanced',duration:seconds+1});
 const session=new ComponentAcousticSession({capability,identities,scene:env.scene});
 const left=new Float32Array(512),right=new Float32Array(512),allLeft=new Float32Array(frames),allRight=new Float32Array(frames),costs=[],paths=[];
 const dryHash=createHash('sha256'),sourceReferences=new Map(session.pipeline.renderer.sourceList.map(s=>[s.id,s.bands]));let sourceReferencesStable=true,peak=0,energy=0,firstOutput=-1,firstDry=-1;
 const began=performance.now();
 try {
  for(let frame=0;frame<frames;frame+=512) {
   const sequence=frame/512,active=frame>=12288&&frame<frames-16384;
   for(const identity of identities)session.accept(componentFixtureObservation(identity,frame,sequence,{active,mechanicalEvent:identity.component==='mechanical-clunk'&&frame===20480}));
   if(geometryTransition&&frame===32768)session.replaceScene(createVehicleEnvironment('tunnel',{quality:'balanced',duration:seconds+1}).scene);
   const started=performance.now();const control=await session.render({listener:componentFixtureListener(cameraCut&&frame>=32768?2:1),left,right});costs.push(performance.now()-started);
   for(const id of session.ids){const dry=session.inputs[id];dryHash.update(Buffer.from(dry.buffer));if(firstDry<0){const i=dry.findIndex(x=>x!==0);if(i>=0)firstDry=frame+i;}}
   for(const s of session.pipeline.renderer.sourceList)if(s.bands!==sourceReferences.get(s.id))sourceReferencesStable=false;
   if(sequence%4===0)paths.push({frame,count:control.paths.length,paths:control.paths.map(p=>({sourceId:p.sourceId,order:p.order,distance:p.distance,delaySeconds:p.delay,rate:p.rate}))});
   allLeft.set(left,frame);allRight.set(right,frame);for(let i=0;i<512;i++){const p=Math.max(Math.abs(left[i]),Math.abs(right[i]));if(firstOutput<0&&p!==0)firstOutput=frame+i;peak=Math.max(peak,p);energy+=left[i]**2+right[i]**2;}
  }
  const diagnostics=session.diagnostics(),sorted=[...costs].sort((a,b)=>a-b),at=q=>sorted[Math.ceil((sorted.length-1)*q)];
  return {channels:[allLeft,allRight],measurement:{schema:1,authority:'original-authored-component-fixture',environment,frames,components:[...components],
   firstDryFrame:firstDry,firstOutputFrame:firstOutput,peak,energy,drySha256:dryHash.digest('hex'),pcmSha256:componentPcmDigest([allLeft,allRight]),
   sourceReferencesStable,sourceWorkerCostsMs:{count:costs.length,median:at(.5),p95:at(.95),p99:at(.99),maximum:at(1),overBlockBudget:costs.filter(x=>x>512/48).length},
   elapsedMs:performance.now()-began,processRssBytes:process.memoryUsage().rss,diagnostics,paths,cameraCut,geometryTransition,
   nativeTelemetryUsed:false,nativeSuppression:false,endpointOpened:false,physicalSoundPowerCalibrated:false}};
 } finally {session.close();}
}
