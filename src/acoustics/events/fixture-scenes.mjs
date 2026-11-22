// Original metre-scale fixtures only. No installation, native material or map.
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene} from '../engine/contracts.mjs';
export const transientFixtureSession='abababababababababababababababab';
export const transientFixturePoses=Object.freeze({source:Object.freeze({position:Object.freeze([0,3.43,1]),generation:1}),
  listener:Object.freeze({position:Object.freeze([0,0,1]),generation:1})});
export function transientFixtureScene(name='wall'){
  if(name==='unknown')return null;
  if(!['open','wall','passage'].includes(name))throw Error('unknown authored transient fixture');
  const wall=(id,x,normal)=>({id,coordinateSpace,center:[x,1,3],normal,u:[0,1,0],half:[12,3],motion:'static',reflectiveSide:'both',
    provenance:{kind:'synthetic',reference:'original-latency02-panel'},confidence:1,material:{observedId:null,observedConfidence:null,acoustic:null},version:1,observedAt:0,validUntil:60000});
  const tile=createTile({schemaVersion:1,id:'transient-'+name,coordinateSpace,timeUnit:'monotonic-ms',bounds:{min:[-20,-20,-2],max:[20,20,10]},
    listenerAnchor:[0,0,1],coverage:'complete-synthetic',surfaces:name==='open'?[]:name==='wall'?[wall('east',5,[-1,0,0])]:[wall('east',5,[-1,0,0]),wall('west',-5,[1,0,0])],
    missingRegions:[],version:1,createdAt:0,validUntil:60000,build:'original-event-fixture-v1',session:transientFixtureSession,interior:'authored',dynamicEpoch:1});
  const materials=Object.fromEntries(tile.surfaces.map(s=>[s.id,{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-event-fixture-wall'}]));
  return acousticScene(tile,materials,{order:2,airDbPerMetre:[0,0,0]});
}
