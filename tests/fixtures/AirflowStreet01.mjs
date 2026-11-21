// Original analytic engine bank, authored motion and finite metre geometry.
// No installed archive/audio source, endpoint or capture is opened.
import {StockGameplay} from '../../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource,prepareStockSource10} from '../../src/acoustics/vehicle/stock-source.mjs';
import {processingBank10} from './Processing10.mjs';
import {budgetFrame042,budgetSession042,budgetWorld042} from './AcousticBudget042.mjs';
import {processingContexts09} from './Processing09.mjs';
import {ScenePreparation03} from '../../src/acoustics/world/scene-preparation03.mjs';
export const airflowRateStreet01=48000,airflowBlockStreet01=512;
export async function originalAirflowEngineStreet01({Engine=StockGameplay,enabled=true,level=.35,geometry=false,prepared=false,latencyProfile='baseline'}={}) {
 const bank=processingBank10(),start=performance.now(),plan=prepared?prepareStockSource10(bank):null,sourcePreparationMs=performance.now()-start,registry={resolve:()=>({status:'available',bank}),createSource:()=>new StockVehicleSource(bank,plan?{preparation10:plan}:{})};let wall=0;
 const engine=new Engine({registry,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01',latencyProfile});
 engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:enabled,airflowLevel:level});
 let preparation=null;
 if(geometry){preparation=new ScenePreparation03({session:budgetSession042,worldDigest:budgetWorld042});const p=await preparation.prepare({contexts:processingContexts09(),listenerAnchor:[0,0,1],geometryTimeMs:0});if(p.state!=='prepared'||!p.workerJoined)throw Error('Joined original wall preparation required');engine.setPreparedResourceScene03(p.prepared.scene,{worldDigest:p.prepared.worldDigest,generation:p.prepared.generation});}
 return {engine,sourcePreparationMs,setWall:x=>{wall=x;},async close(){engine.close();if(preparation)await preparation.close();}};
}
export function airflowFrameStreet01(sequence,time,{speed=31.2928,rider=true,viewAttached=rider,near=3,direction=1,pass=false,duration=2,cameraGeneration=1,running=true}={}) {
 const frame=budgetFrame042(sequence,time),x=pass?direction*speed*(time-duration/2):0,v=frame.vehicles[0];
 v.position=[x,near,1];v.velocity=[direction*speed,0,0];v.forward=[direction,0,0];v.operatingPoint=running?.55:0;v.running=running;v.riderAttached=rider;v.riderViewAttached=viewAttached;
 frame.listener.generation=cameraGeneration;frame.listener.position=rider?[x,near,1.65]:[0,0,1.65];frame.listener.velocity=rider?[direction*speed,0,0]:[0,0,0];
 // The research fixture declares metres explicitly. Native product telemetry
 // retains its separate unverified coordinate scale in production diagnostics.
 frame.listener.coordinates='research-rh-z-up-metres-v1';frame.listener.units='metres';frame.listener.velocityKind='authored-synthetic';
 return frame;
}
