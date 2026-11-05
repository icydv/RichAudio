// Cache-only interior instances. An exact YTYP physics binding and selected
// YMAP transform can establish a static metadata placement, never live activity.
import {matrix,transformPoint} from './collision-mesh.mjs';
import {collisionNameHash} from './static-world-resource.mjs';
const prepared=new WeakMap(),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),hash=v=>typeof v==='string'&&/^0x[a-f0-9]{8}$/i.test(v),vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function index(catalog){
 if(prepared.has(catalog))return prepared.get(catalog);const metadata=catalog.InteriorPlacementMetadata01,byPhysics=new Map(),byArchetype=new Map(),instances=new Map(),source=new Map();
 if(metadata?.Schema===1&&metadata.Kind==='RichAudioInstalledMloPlacementMetadata01'&&Array.isArray(metadata.Archetypes)&&metadata.Archetypes.length<=16384&&Array.isArray(metadata.Instances)&&metadata.Instances.length<=65536){
  const selected=new Map();for(const r of catalog.Resources??[])if(['ytyp','ymap'].includes(r.Kind)){if(selected.has(r.Path))selected.set(r.Path,null);else selected.set(r.Path,r.Kind);}
  for(const r of [...(metadata.YtypSourceBindings??[]),...(metadata.YmapSourceBindings??[])])if(typeof r.Path==='string'&&hex(r.SHA256)&&selected.get(r.Path))source.set(r.Path,r.SHA256);
  for(const a of metadata.Archetypes)if(hash(a.ArchetypeHash)&&hash(a.PhysicsDictionaryHash)&&hex(a.SourceSHA256)&&source.get(a.SourceYtyp)===a.SourceSHA256&&selected.get(a.SourceYtyp)==='ytyp'){const key=a.PhysicsDictionaryHash.toLowerCase();if(!byPhysics.has(key))byPhysics.set(key,[]);byPhysics.get(key).push(a);const name=a.ArchetypeHash.toLowerCase();byArchetype.set(name,byArchetype.has(name)?null:a);}
  for(const i of metadata.Instances)if(hash(i.ArchetypeHash)&&hex(i.SourceSHA256)&&source.get(i.SourceYmap)===i.SourceSHA256&&selected.get(i.SourceYmap)==='ymap'){const key=i.ArchetypeHash.toLowerCase();if(!instances.has(key))instances.set(key,[]);instances.get(key).push(i);}
 }
 const value={byPhysics,byArchetype,instances,metadataPresent:!!metadata};prepared.set(catalog,value);return value;
}
export function resolveInteriorCollisionPlacements01(catalog,resourceHash,memberships){
 const data=index(catalog),placements=[],unresolved=[],direct=data.byPhysics.get(resourceHash.toLowerCase())??[],parentHashes=new Set(memberships.filter(m=>typeof m.InteriorName==='string').map(m=>hash(m.InteriorName)?m.InteriorName.toLowerCase():collisionNameHash(m.InteriorName))),explicitParentHashes=new Set(catalog.CollisionPlacementIndex?.IndexComplete===true&&catalog.CollisionPlacementIndex.ProjectionSchemaGaps===0?memberships.filter(m=>m.BoundsHash?.toLowerCase()===resourceHash.toLowerCase()&&typeof m.InteriorName==='string').map(m=>hash(m.InteriorName)?m.InteriorName.toLowerCase():collisionNameHash(m.InteriorName)):[]),archetypes=[...new Map([...direct,...[...explicitParentHashes].map(h=>data.byArchetype.get(h)).filter(Boolean)].map(a=>[a.ArchetypeHash,a])).values()];
 for(const a of archetypes){if(!parentHashes.has(a.ArchetypeHash.toLowerCase())){unresolved.push({archetypeHash:a.ArchetypeHash,reason:'physics-binding-and-manifest-parent-do-not-agree'});continue;}
  for(const instance of data.instances.get(a.ArchetypeHash.toLowerCase())??[])try{
   matrix(instance.Matrix);if(!vec(a.LocalMin)||!vec(a.LocalMax)||a.LocalMin.some((v,i)=>v>a.LocalMax[i])||!Array.isArray(a.Rooms)||a.Rooms.length>4096||!Array.isArray(a.Portals)||a.Portals.length>16384)throw Error('interior-placement-metadata-contract');
   const corners=Array.from({length:8},(_,mask)=>transformPoint(a.LocalMin.map((v,i)=>(mask>>i)&1?a.LocalMax[i]:v),instance.Matrix));
   const declaredPortals=a.Portals.map(p=>{if(!Array.isArray(p.Corners)||p.Corners.length<3||p.Corners.length>16||!p.Corners.every(vec))throw Error('interior-portal-metadata-contract');return {index:p.Index,roomFrom:p.RoomFrom,roomTo:p.RoomTo,flags:p.Flags,audioOcclusion:p.AudioOcclusion,cornersWorld:p.Corners.map(v=>transformPoint(v,instance.Matrix)),openingState:'unobserved-not-an-acoustic-opening'};});
   placements.push({instanceId:instance.InstanceId,resourceHash,archetypeHash:a.ArchetypeHash,matrix:[...instance.Matrix],coordinateSpace:'world',basis:a.PhysicsDictionaryHash.toLowerCase()===resourceHash.toLowerCase()?'explicit-YTYP-physics-dictionary-and-YMF-interior-parent; public-YMAP-resolved-transform':'explicit-YMF-child-bound-to-interior-parent; selected-YTYP-parent; public-YMAP-resolved-transform',sourceYtyp:a.SourceYtyp,sourceYtypSHA256:a.SourceSHA256,sourceYmap:instance.SourceYmap,sourceYmapSHA256:instance.SourceSHA256,bounds:{min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])))},roomsDeclared:a.Rooms.length,declaredPortals,runtimeActivation:'unobserved',worldPlacementVerified:false,liveSceneInclusionAllowed:false});
  }catch(error){unresolved.push({instanceId:instance.InstanceId,reason:String(error.message).slice(0,160)});}
 }
 return {state:placements.length?'metadata-interior-instances-resolved':'interior-local-unplaced',placements,unresolved,reason:placements.length?null:!data.metadataPresent?'selected-YMAP-YTYP-placement-metadata-not-retained':!archetypes.length?'exact-YTYP-physics-dictionary-binding-not-resolved':'manifest-parent-or-selected-instance-unresolved',runtimeActivation:'unobserved',portalsCarveAcousticOpenings:false};
}
