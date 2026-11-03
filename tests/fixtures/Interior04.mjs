import {createTile,coordinateSpace} from '../../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../../src/acoustics/engine/contracts.mjs';
export const interiorSession04='4'.repeat(32);
const panel=(id,center,normal,u,half,validUntil)=>({id,center,normal,u,half,coordinateSpace,motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-interior-architecture-fixture'},confidence:1,version:1,observedAt:0,validUntil});
export function interiorFixture04({surfaceUntil=10000,mapKind='base'}={}){
 const surfaces=[panel('lower-wall',[0,2,1.5],[1,0,0],[0,1,0],[2,1.5],surfaceUntil),panel('lower-floor',[2,2,0],[0,0,1],[1,0,0],[2,2],surfaceUntil),
  panel('between-floor',[2,2,3],[0,0,1],[1,0,0],[2,2],surfaceUntil),panel('upper-wall',[4,2,4.5],[-1,0,0],[0,1,0],[2,1.5],surfaceUntil),panel('upper-ceiling',[2,2,6],[0,0,-1],[1,0,0],[2,2],surfaceUntil)];
 const tile=createTile({schemaVersion:1,id:'original-interior-tile',coordinateSpace,timeUnit:'monotonic-ms',bounds:{min:[-4,-4,-1],max:[8,8,7]},listenerAnchor:[2,2,1],coverage:'complete-synthetic',surfaces,version:1,createdAt:0,validUntil:10000,build:'original-interior-fixture',session:interiorSession04,interior:'original-interior',dynamicEpoch:1});
 const assumed={reflection:[.3,.2,.1],transmission:[.5,.4,.2],basis:'authored-assumption',reference:'illustrative-interior-only'};
 const scene=acousticScene(tile,Object.fromEntries(surfaces.map(s=>[s.id,assumed])));
 const profiles={open:{reflection:[.05,.04,.02],transmission:[.9,.8,.7],basis:'authored-assumption',reference:'illustrative-open-portal'},closed:{reflection:[.7,.6,.5],transmission:[.1,.05,.01],basis:'authored-assumption',reference:'illustrative-closed-portal'}};
 const input={schema:1,kind:'RichAudioInteriorTopology04',authority:'original-authored-fixture',id:'original-interior',mapKind,sourceBindings:[{id:'original-mlo-contract',sha256:'a'.repeat(64)}],activationKeys:['ipl:original','interior:original'],
  rooms:[{id:'lower',bounds:{min:[0,0,0],max:[4,4,3]},surfaces:{walls:['lower-wall'],floors:['lower-floor'],ceilings:['between-floor']},completeness:'known'},
   {id:'upper',bounds:{min:[0,0,3],max:[4,4,6]},surfaces:{walls:['upper-wall'],floors:['between-floor'],ceilings:['upper-ceiling']},completeness:'known'}],
  portals:[{id:'entry',a:'outside',b:'lower',kind:'door',topology:'known',aperture:[[0,1,0],[0,3,0],[0,3,2],[0,1,2]],profiles:structuredClone(profiles)},
   {id:'stairs',a:'lower',b:'upper',kind:'stair',topology:'known',aperture:[[1,1,3],[3,1,3],[3,3,3],[1,3,3]],profiles:structuredClone(profiles)},
   {id:'upper-window',a:'upper',b:'outside',kind:'window',topology:'known',aperture:[[4,1,4],[4,3,4],[4,3,5],[4,1,5]],profiles:structuredClone(profiles)}],unknown:[]};
 return {input,scene};
}
export function interiorStateFixture04(topology,{portals={entry:'open','upper-window':'closed'},activation={'ipl:original':true,'interior:original':true},observedAt=0,validUntil=1000,generation=1}={}){
 return {schema:1,kind:'RichAudioInteriorState04',authority:'original-authored-fixture',topologyDigest:topology.topologyDigest,session:interiorSession04,generation,observedAt,validUntil,activation,portals};
}
