// Explicit placement foundation. A filename match never proves an asset's coordinate space.
import {matrix,transformPoint,triangleNormal,determinant3} from './collision-mesh.mjs';
const vec=(v,n=3)=>{if(!Array.isArray(v)||v.length!==n||v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e9))throw Error('placement vector');return v;};
const hash=v=>{if(!Number.isSafeInteger(v)||v<0||v>0xffffffff)throw Error('placement hash');return v;};
export function entityMatrix(entity){
 if(entity.kind!=='CEntityDef'||entity.isMlo||entity.hasMloParent)throw Error('MLO placement unresolved');
 const position=vec(entity.position),raw=vec(entity.rotation,4),length=Math.hypot(...raw);if(Math.abs(length-1)>.001)throw Error('entity quaternion');
 // The regular YmapEntityDef constructor inverts CEntityDef.rotation. MLO differs.
 const [x,y,z,w]=raw.map((v,i)=>(i===3?v:-v)/(length*length)),sx=entity.scaleXY,sz=entity.scaleZ;
 if(!Number.isFinite(sx)||!Number.isFinite(sz)||Math.abs(sx)<1e-9||Math.abs(sz)<1e-9||Math.abs(sx)>1000||Math.abs(sz)>1000)throw Error('entity scale');
 return matrix([(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sx,(1-2*(x*x+z*z))*sx,2*(y*z+x*w)*sx,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,...position,1]);
}
export function transformInstance(triangles,placement){
 matrix(placement.matrix);if(placement.coordinateSpace!=='world'||!['authored-fixture','metadata-resolved-runtime-unverified'].includes(placement.evidence))throw Error('explicit placement evidence required');
 const mirrored=determinant3(placement.matrix)<0;
 return triangles.map(t=>{const positions=t.positions.map(v=>transformPoint(v,placement.matrix));if(mirrored)[positions[1],positions[2]]=[positions[2],positions[1]];return {...t,positions,normal:triangleNormal(positions),instanceId:placement.instanceId,placementEvidence:placement.evidence};});
}
export function resolvePlacements({entities,archetypes,bindings,resources}){
 for(const array of [entities,archetypes,bindings,resources])if(!Array.isArray(array)||array.length>262144)throw Error('placement input limit');
 const placements=[],unresolved=[];
 const byHash=new Map();for(const a of archetypes){const key=hash(a.nameHash);if(!byHash.has(key))byHash.set(key,[]);byHash.get(key).push(a);}
 const byBinding=new Map();for(const binding of bindings){const key=hash(binding.archetypeHash);if(!byBinding.has(key))byBinding.set(key,[]);byBinding.get(key).push(binding);}
 const byResource=new Map();for(const r of resources){if(typeof r.id!=='string'||byResource.has(r.id))throw Error('resource identity');byResource.set(r.id,r);}
 const seen=new Set();
 for(const entity of entities){
  const instanceId=entity.id;if(typeof instanceId!=='string'||!instanceId.length||instanceId.length>256||seen.has(instanceId))throw Error('instance identity');seen.add(instanceId);
  const reject=reason=>unresolved.push({instanceId,reason});if(entity.kind!=='CEntityDef'||entity.isMlo||entity.hasMloParent){reject('mlo-transform-and-portal-resolution-required');continue;}
  const name=hash(entity.archetypeName),matches=byHash.get(name)??[];if(matches.length!==1){reject(matches.length?'ambiguous-archetype':'archetype-missing');continue;}
  const links=byBinding.get(name)??[];if(links.length!==1){reject(links.length?'ambiguous-collision-binding':'explicit-collision-binding-required');continue;}
  const link=links[0],resource=byResource.get(link.resourceId),authored=link.basis==='authored-fixture';
  if(!resource||resource.coordinateSpace!=='archetype-local'||resource.placementEvidence!==(authored?'authored-fixture':'metadata-verified-local')||(!authored&&(link.basis!=='verified-ytyp-collision-binding'||!/^[a-f0-9]{64}$/.test(link.sourceSHA256??'')))){reject('archetype-local-coordinate-proof-required');continue;}
  if(!authored&&hash(matches[0].physicsDictionary)!==hash(link.physicsDictionary)){reject('physics-dictionary-mismatch');continue;}
  try{placements.push({instanceId,resourceId:resource.id,archetypeHash:name,matrix:entityMatrix(entity),coordinateSpace:'world',evidence:authored?'authored-fixture':'metadata-resolved-runtime-unverified',runtimeActivation:'unverified',lodParentComposition:'none-parentIndex-is-not-a-spatial-transform'});}catch(error){reject(error.message);}
 }
 return {schema:1,complete:false,runtimeActivation:'unverified',placements,unresolved};
}
