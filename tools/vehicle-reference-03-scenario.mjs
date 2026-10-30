// Authored kinematic controls, not recovered video telemetry or measured car data.
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile,coordinateSpace,timeUnit} from '../src/acoustics/research/local-geometry.mjs';

export const flyby = Object.freeze({duration:10.2,passTime:5.5,shiftTime:3,shiftEnd:3.25,
  liftTime:6.2,wheelRadius:.34,finalDrive:3.4,thirdRatio:1.95,fourthRatio:1.60,
  masterGain:.7,seed:731,listener:Object.freeze({position:[0,4,1.5],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]})});
const segments = [[0,3,25,45],[3,3.25,45,45],[3.25,5.5,45,60],[5.5,6.2,60,60],[6.2,10,60,42],[10,10.2,42,42]];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function integrated(t){
  let distance=0,speed=25,acceleration=0;
  for(const [a,b,v0,v1] of segments){
    if(t<a)break;
    const d=b-a,u=Math.max(0,Math.min(1,(t-a)/d)),dv=v1-v0;
    distance+=v0*d*u+dv*d*(u*u*u-.5*u*u*u*u);
    speed=v0+dv*smooth(u);acceleration=t<b?dv*6*u*(1-u)/d:0;
    if(t<=b)break;
  }
  return {distance,speed,acceleration};
}
const origin=integrated(flyby.passTime).distance;
export function motionAt(t){
  if(!Number.isFinite(t)||t<0||t>flyby.duration+1e-9)throw Error('bounded authored flyby time');
  const s=integrated(t);
  return {position:[s.distance-origin,0,.35],velocity:[s.speed,0,0],forward:[1,0,0],up:[0,0,1],speed:s.speed,acceleration:s.acceleration};
}
export function operatingAt(kind,t){
  const {speed}=motionAt(t);
  if(kind==='constant')return {estimatedRpm:7644,load:.82,throttle:.9,speed,gear:4,engineRunning:true,overrun:false,exhaustPop:false,roadSurface:'asphalt'};
  if(kind!=='dynamic')throw Error('constant or dynamic comparison only');
  const clutch=smooth((t-flyby.shiftTime)/(flyby.shiftEnd-flyby.shiftTime));
  const ratio=flyby.thirdRatio+(flyby.fourthRatio-flyby.thirdRatio)*clutch;
  const rpm=speed/(2*Math.PI*flyby.wheelRadius)*60*flyby.finalDrive*ratio;
  const approach=smooth(t/flyby.passTime),lift=smooth((t-flyby.liftTime)/.35);
  const u=(t-flyby.shiftTime)/(flyby.shiftEnd-flyby.shiftTime);
  const torqueCut=u>0&&u<1?1-.65*Math.sin(Math.PI*u)**2:1;
  return {estimatedRpm:rpm,load:((.35+.59*approach)*(1-lift)+.055*lift)*torqueCut,
    throttle:((.38+.58*approach)*(1-lift)+.025*lift)*torqueCut,speed,
    gear:t<flyby.shiftTime?3:4,engineRunning:true,overrun:t>=flyby.liftTime,exhaustPop:false,roadSurface:'asphalt'};
}
export function directScenes(){
  // Two bounded empty regions use existing scene replacement, not a widened
  // geometry limit. Their overlap covers all retarded emitters at the pass.
  return [[-250,6],[-6,250]].map(([a,b],i)=>acousticScene(createTile({schemaVersion:1,id:'reference03-direct-'+i,
    coordinateSpace,timeUnit,bounds:{min:[a,-15,-2],max:[b,15,10]},listenerAnchor:[0,4,1.5],
    coverage:'complete-synthetic',surfaces:[],missingRegions:[],version:1,createdAt:0,validUntil:12000,
    build:'synthetic-vehicle-reference03',session:'vehicle-reference03',interior:'outdoors',dynamicEpoch:0}),{}, {order:0,maxPaths:24,maxReflectors:8}));
}
