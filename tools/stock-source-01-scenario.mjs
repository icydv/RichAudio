// Authored offline operating and motion assumptions; not game telemetry.
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile,coordinateSpace,timeUnit} from '../src/acoustics/research/local-geometry.mjs';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export const stockDemonstrations=Object.freeze({
  bati:{name:'Pegassi Bati 801',maximumSpeed:50,engineOffset:0,exhaustOffset:-.65},
  lectro:{name:'Principe Lectro',maximumSpeed:45,engineOffset:0,exhaustOffset:-.65},
  prototipo:{name:'Grotti X80 Proto',maximumSpeed:60,engineOffset:-.45,exhaustOffset:-1.6},
  schafter3:{name:'Benefactor Schafter V12',maximumSpeed:52,engineOffset:.8,exhaustOffset:-1.8},
});
export const closeDuration=9,flybyDuration=10.3,passTime=5.3,masterGain=.7;
export function stockOperating(t,flyby=false){
  if(!flyby){const rise=smooth((t-1)/3.8),fall=smooth((t-5.2)/.8);
    return {operatingPoint:(.1+.85*rise)*(1-fall)+.3*fall,load:(.15+.8*rise)*(1-fall)+.08*fall,
      running:t<6.5,lift:t>=5.2};}
  const before=smooth(t/2.8),after=smooth((t-3)/2.3),shift=smooth((t-2.8)/.2),lift=smooth((t-6)/.3);
  let operatingPoint=t<2.8?.25+.55*before:t<3?.8-.22*shift:t<6?.58+.4*after:.98-.55*smooth((t-6)/4.3);
  return {operatingPoint,load:(.3+.65*smooth(t/5.3))*(1-lift)+.07*lift,running:true,lift:t>=6};
}
function distance(t,v){
  let d=0,speed=.45*v,acceleration=0;
  for(const [a,b,p,q] of [[0,2.8,.45,.8],[2.8,3,.8,.8],[3,5.3,.8,1],[5.3,6,1,1],[6,9.5,1,.65],[9.5,10.3,.65,.65]]){
    if(t<a)break;const dt=b-a,u=Math.max(0,Math.min(1,(t-a)/dt)),dv=(q-p)*v;
    d+=p*v*dt*u+dv*dt*(u**3-.5*u**4);speed=p*v+dv*smooth(u);acceleration=t<b?dv*6*u*(1-u)/dt:0;if(t<=b)break;
  }return {distance:d,speed,acceleration};
}
export function stockPose(model,t,flyby=false){
  const p=stockDemonstrations[model];if(!p)throw Error('known stock vehicle');
  const s=distance(t,p.maximumSpeed),x=flyby?s.distance-distance(passTime,p.maximumSpeed).distance:0;
  return {position:[x,0,0],velocity:[flyby?s.speed:0,0,0],forward:[1,0,0],up:[0,0,1],speed:flyby?s.speed:0,acceleration:flyby?s.acceleration:0};
}
export function stockEmitters(model,pose){const p=stockDemonstrations[model];return ['engine','exhaust'].map((role,i)=>({
  id:'stock:'+model+':'+role,generation:1,position:[pose.position[0]+(i?p.exhaustOffset:p.engineOffset),0,i?.3:.65],
  velocity:pose.velocity,forward:i?[-1,0,0]:[1,0,0],up:[0,0,1],directivity:i?.65:.1,valid:true,emitting:true,
  rights:'private-decoded-game-assets',placementBasis:'authored-offset-estimate-not-verified-GTA-bone',
}));}
export function stockDirectScenes(){return [[-250,6],[-6,250]].map(([a,b],i)=>acousticScene(createTile({
  schemaVersion:1,id:'stock-direct-'+i,coordinateSpace,timeUnit,bounds:{min:[a,-15,-2],max:[b,15,10]},
  listenerAnchor:[0,2,1.4],coverage:'complete-synthetic',surfaces:[],missingRegions:[],version:1,createdAt:0,validUntil:13000,
  build:'stock-authored-fixture',session:'stock-source01',interior:'outdoors',dynamicEpoch:0}),{}, {order:0,maxPaths:24,maxReflectors:8}));}
