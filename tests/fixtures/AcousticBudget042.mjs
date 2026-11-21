// Original analytic PCM and finite geometry only. No asset loader is called.
import {StockGameplay} from '../../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../../src/acoustics/vehicle/stock-source.mjs';
import {vehicleDistanceSceneOptions} from '../../src/acoustics/vehicle/distance-presentation.mjs';
import {createTile,coordinateSpace} from '../../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../../src/acoustics/engine/contracts.mjs';
import {createSceneTileContext03} from '../../src/acoustics/world/scene-union03.mjs';

export const budgetSession042='6'.repeat(32),budgetWorld042='6'.repeat(64),changedBudgetWorld042='7'.repeat(64);
export const budgetFrames042=512,budgetRate042=48000;
export function createBudgetEngine042({profile='fixed-cpu-balanced',onSource=()=>{},constructSource=bank=>new StockVehicleSource(bank)}={}){
 if(!['fixed-cpu-balanced','constructor-defaults'].includes(profile)||typeof onSource!=='function'||typeof constructSource!=='function')throw Error('explicit authored budget profile required');
 const samples=Float32Array.from({length:8192},(_,i)=>.043*Math.sin(i*.119)+.021*Math.cos(i*.037));
 const asset={frames:samples.length,sampleRate:24000,samples,nativePeak:.064};
 const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
 const registry={resolve:()=>({status:'available',bank}),createSource:()=>{const source=constructSource(bank);onSource(source);return source;}};
 let wall=0;const instance=new StockGameplay({registry,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01'});
 if(profile==='fixed-cpu-balanced')instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 return {instance,setWall:value=>{wall=value;}};
}
export function budgetFrame042(sequence,time){
 const ticks=10000000+Math.round(time*10000000),x=-3+time*4;
 return {version:1,session:budgetSession042,listener:{version:1,session:budgetSession042,generation:1,sequence,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(time*1000),position:[x,0,1],velocity:[4,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},vehicles:[{id:'bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:[x+1,10,1],velocity:[4,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint:.5,running:true,valid:true}]};
}
export function budgetContexts042({worldDigest=budgetWorld042,until=60000,wall=false,missing=false}={}){
 return [['west',-48,0],['east',0,48]].map(([id,min,max])=>{
  const bounds={min:[min,-32,-8],max:[max,32,16]};
  const surfaces=wall?[{id:'budget042:'+id,coordinateSpace,center:[(min+max)/2,4,2],normal:[0,-1,0],u:[1,0,0],half:[22,3],motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-budget042-finite-wall'},confidence:1,version:1,observedAt:0,validUntil:until,material:{observedId:null,observedConfidence:null,acoustic:null}}]:[];
  const materials=Object.fromEntries(surfaces.map(s=>[s.id,{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-budget042-passive-assumption'}]));
  const unknown=missing&&id==='east'?[{id:'budget042:missing',bounds,reason:'unsupported-winning-resource'}]:[];
  const tile=createTile({schemaVersion:1,id:'budget042:'+id,coordinateSpace,timeUnit:'monotonic-ms',bounds,listenerAnchor:[(min+max)/2,0,1],coverage:unknown.length?'partial':'complete-synthetic',surfaces,missingRegions:unknown,version:1,createdAt:0,validUntil:until,build:'original-budget042',session:budgetSession042,interior:'authored-fixture-only',dynamicEpoch:1});
  return createSceneTileContext03({tileId:id,worldDigest,scene:acousticScene(tile,materials,vehicleDistanceSceneOptions('authored-detail-loss-v1')),sourceBindings:[{id:'budget042:collision:'+id,sha256:(wall?'b':'a').repeat(64)}],layout:'gen9-rsc7'});
 });
}
