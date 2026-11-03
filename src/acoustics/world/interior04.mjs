// Offline interior architecture. Explicit original fixtures only; this module
// neither decodes MLO resources nor modifies the renderer's visibility queries.
import {validated, material} from '../engine/contracts.mjs';
import {bounds, vector, identifier, fields, requireWorld, digest, freeze} from './contracts.mjs';

export const interiorRevision04='explicit-interior-topology-v1';
export const interiorLimits04=Object.freeze({rooms:32,portals:64,surfaceReferences:192,activationKeys:32,paths:16,hops:8,expansions:256});
const topologies=new WeakSet(),states=new WeakSet(),outside='outside';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const contains=(box,p)=>p.every((n,i)=>n>=box.min[i]-1e-8&&n<=box.max[i]+1e-8);
const inside=(box,p)=>p.every((n,i)=>n>box.min[i]+1e-8&&n<box.max[i]-1e-8);
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const magnitude=a=>Math.hypot(...a);
function aperture(input,sceneBounds){
 requireWorld(Array.isArray(input)&&(input.length===3||input.length===4),'finite triangular/quadrilateral portal aperture required');
 const corners=input.map(vector),normal=cross(subtract(corners[1],corners[0]),subtract(corners[2],corners[0])),size=magnitude(normal);
 requireWorld(size>1e-8&&corners.every(p=>contains(sceneBounds,p)&&Math.abs(dot(subtract(p,corners[0]),normal))<=size*1e-8),'nondegenerate planar bounded portal aperture');
 for(let i=0;i<corners.length;i++)requireWorld(dot(cross(subtract(corners[(i+1)%corners.length],corners[i]),subtract(corners[(i+2)%corners.length],corners[(i+1)%corners.length])),normal)>1e-10,'convex ordered portal aperture');
 return {corners,center:[0,1,2].map(i=>corners.reduce((n,p)=>n+p[i],0)/corners.length)};
}

export function createInteriorTopology04(input,{scene}={}){
 fields(input,['schema','kind','authority','id','mapKind','sourceBindings','activationKeys','rooms','portals','unknown']);
 requireWorld(input.schema===1&&input.kind==='RichAudioInteriorTopology04'&&input.authority==='original-authored-fixture'&&['base','dlc','custom'].includes(input.mapKind),
  'explicit original interior fixture required; installed MLO compatibility remains unqualified');
 requireWorld(validated.scene(scene)&&scene.tile&&!scene.observationModel,'validated finite scene required for interior surface references');identifier(input.id);
 requireWorld(Array.isArray(input.sourceBindings)&&input.sourceBindings.length>0&&input.sourceBindings.length<=32,'bounded interior resource bindings');
 const sourceIds=new Set(),sourceBindings=input.sourceBindings.map(s=>{fields(s,['id','sha256']);identifier(s.id);requireWorld(!sourceIds.has(s.id)&&hex(s.sha256),'unique interior resource digest');sourceIds.add(s.id);return {...s};}).sort((a,b)=>a.id.localeCompare(b.id));
 requireWorld(Array.isArray(input.activationKeys)&&input.activationKeys.length<=interiorLimits04.activationKeys,'bounded explicit IPL/interior activation requirements');
 const activationKeys=input.activationKeys.map(identifier);requireWorld(new Set(activationKeys).size===activationKeys.length,'unique interior activation requirements');
 requireWorld(Array.isArray(input.rooms)&&input.rooms.length>0&&input.rooms.length<=interiorLimits04.rooms&&Array.isArray(input.portals)&&input.portals.length<=interiorLimits04.portals,'bounded interior room/portal topology');
 const surfaceMap=new Map(scene.tile.surfaces.map(s=>[s.id,s])),roomMap=new Map();let surfaceReferences=0;
 const rooms=input.rooms.map(r=>{
  fields(r,['id','bounds','surfaces','completeness']);identifier(r.id);requireWorld(r.id!==outside&&!roomMap.has(r.id)&&['known','unknown'].includes(r.completeness),'unique explicit interior room');
  const box=bounds(r.bounds);requireWorld(contains(scene.tile.bounds,box.min)&&contains(scene.tile.bounds,box.max),'room bounds within finite scene');
  requireWorld(r.completeness!=='known'||!scene.tile.missingRegions.some(m=>box.min.every((n,i)=>n<m.bounds.max[i]&&box.max[i]>m.bounds.min[i])),'known room cannot erase unqualified scene geometry');
  fields(r.surfaces,['walls','floors','ceilings']);const refs=new Set(),surfaces={};
  for(const role of ['walls','floors','ceilings']){
   requireWorld(Array.isArray(r.surfaces[role])&&r.surfaces[role].length<=64&&(r.completeness!=='known'||r.surfaces[role].length>0),'explicit room walls/floors/ceilings or unknown geometry');
   surfaces[role]=r.surfaces[role].map(id=>{identifier(id);const s=surfaceMap.get(id);requireWorld(s&&!refs.has(id)&&s.motion==='static'&&s.provenance.kind==='synthetic'&&s.corners.every(p=>contains(box,p)),'room surface must reference existing finite fixture geometry within room');refs.add(id);
    requireWorld(role==='walls'?Math.abs(s.normal[2])<1e-8:Math.abs(s.normal[2])>1-1e-8,'supported room surface role orientation');return id;});surfaceReferences+=surfaces[role].length;
  }
  requireWorld(surfaceReferences<=interiorLimits04.surfaceReferences,'interior surface reference budget');const room={id:r.id,bounds:box,surfaces,completeness:r.completeness};roomMap.set(r.id,room);return room;
 });
 for(let i=0;i<rooms.length;i++)for(let j=0;j<i;j++)requireWorld(!rooms[i].bounds.min.every((n,k)=>n<rooms[j].bounds.max[k]&&rooms[i].bounds.max[k]>rooms[j].bounds.min[k]),'overlapping interior rooms need a separately qualified room-volume policy');
 const portalIds=new Set(),portals=input.portals.map(p=>{
  fields(p,['id','a','b','kind','topology','aperture','profiles']);identifier(p.id);requireWorld(!portalIds.has(p.id)&&['door','window','passage','stair'].includes(p.kind)&&['known','unknown'].includes(p.topology),'unique supported portal type/topology');portalIds.add(p.id);
  const endpoint=e=>e===outside||roomMap.has(e);requireWorld((p.a===null||endpoint(p.a))&&(p.b===null||endpoint(p.b))&&(p.a!==p.b||p.a===null),'portal endpoints must be explicit rooms/outside or unknown');
  requireWorld(p.topology!=='known'||(endpoint(p.a)&&endpoint(p.b)),'known portal cannot fabricate unresolved endpoints');
  const shape=aperture(p.aperture,scene.tile.bounds);
  for(const e of [p.a,p.b])if(roomMap.has(e)){
   const box=roomMap.get(e).bounds;
   requireWorld(shape.corners.every(c=>contains(box,c))&&[0,1,2].some(i=>['min','max'].some(side=>shape.corners.every(c=>Math.abs(c[i]-box[side][i])<=1e-8))),
    'portal aperture must lie on a boundary face of both declared room volumes');
  }
  if(p.topology==='known'&&(p.a===outside||p.b===outside)){
   const owner=roomMap.get(p.a===outside?p.b:p.a),box=owner.bounds;
   const axis=[0,1,2].find(i=>['min','max'].some(side=>shape.corners.every(c=>Math.abs(c[i]-box[side][i])<=1e-8)));
   const low=[0,1,2].map(i=>Math.min(...shape.corners.map(c=>c[i]))),high=[0,1,2].map(i=>Math.max(...shape.corners.map(c=>c[i])));
   // The supported nonoverlapping room AABBs cannot certify outside where a
   // declared adjacent room occupies that boundary. Bounding-box overlap is a
   // conservative rejection for triangular apertures, never a new connection.
   requireWorld(!rooms.some(r=>r.id!==owner.id&&low[axis]>=r.bounds.min[axis]-1e-8&&low[axis]<=r.bounds.max[axis]+1e-8&&[0,1,2].filter(i=>i!==axis).every(i=>low[i]<r.bounds.max[i]-1e-8&&high[i]>r.bounds.min[i]+1e-8)),
    'outside portal conflicts with an adjacent declared room volume');
  }
  fields(p.profiles,['open','closed']);const profiles={};for(const mode of ['open','closed']){requireWorld(p.profiles[mode]?.basis==='authored-assumption','interior portal coefficients remain authored assumptions');profiles[mode]=material(p.profiles[mode]);}
  return {id:p.id,a:p.a,b:p.b,kind:p.kind,topology:p.topology,aperture:shape,profiles};
 });
 requireWorld(Array.isArray(input.unknown)&&input.unknown.length<=32&&input.unknown.every(s=>typeof s==='string'&&s.length>0&&s.length<=160),'bounded explicit unknown interior metadata');
 const body={schema:1,kind:input.kind,revision:interiorRevision04,authority:input.authority,id:input.id,mapKind:input.mapKind,sourceBindings,activationKeys:[...activationKeys].sort(),rooms,portals,unknown:[...input.unknown],
  geometryKey:scene.geometryKey,geometryDigest:digest({tile:scene.tile,materials:scene.materials}),installedInteriorVerified:false,runtimeCompatibilityVerified:false};
 const topology=freeze({...body,topologyDigest:digest(body),scene});topologies.add(topology);return topology;
}

// A fixture state snapshot is deliberately absent from the static topology/cache
// identity. Real runtime acquisition and clock qualification remain separate.
export function createInteriorState04(topology,input){
 requireWorld(topologies.has(topology),'branded interior topology required');fields(input,['schema','kind','authority','topologyDigest','session','generation','observedAt','validUntil','activation','portals']);
 requireWorld(input.schema===1&&input.kind==='RichAudioInteriorState04'&&input.authority==='original-authored-fixture'&&input.topologyDigest===topology.topologyDigest&&/^[a-f0-9]{32}$/.test(input.session)&&input.session===topology.scene.tile.session&&Number.isSafeInteger(input.generation)&&input.generation>0,
  'exact fixture topology/session/state generation required');
 requireWorld(Number.isFinite(input.observedAt)&&input.observedAt>=0&&Number.isFinite(input.validUntil)&&input.validUntil>input.observedAt&&input.validUntil-input.observedAt<=1000,'bounded independently expiring interior state');
 requireWorld(input.activation&&typeof input.activation==='object'&&!Array.isArray(input.activation)&&Object.entries(input.activation).every(([id,v])=>topology.activationKeys.includes(id)&&[true,false,'unknown'].includes(v)),'only declared IPL/interior activation states');
 const runtimePortals=new Set(topology.portals.filter(p=>['door','window'].includes(p.kind)).map(p=>p.id));
 requireWorld(input.portals&&typeof input.portals==='object'&&!Array.isArray(input.portals)&&Object.entries(input.portals).every(([id,v])=>runtimePortals.has(id)&&['open','closed','unknown'].includes(v)),'only declared door/window runtime states');
 const value=freeze({...structuredClone(input),stateDigest:digest(input),installedRuntimeVerified:false});states.add(value);return value;
}

export function planInteriorPropagation04(topology,state,{from,to,sourcePosition,listenerPosition,now,session,generation,maxHops=8,maxPaths=16}={}){
 requireWorld(topologies.has(topology)&&states.has(state)&&state.topologyDigest===topology.topologyDigest,'matching branded interior topology/state required');
 requireWorld(Number.isFinite(now)&&now>=0&&Number.isSafeInteger(maxHops)&&maxHops>=1&&maxHops<=interiorLimits04.hops&&Number.isSafeInteger(maxPaths)&&maxPaths>=1&&maxPaths<=interiorLimits04.paths,'bounded interior query time/path budget');
 const roomMap=new Map(topology.rooms.map(r=>[r.id,r]));requireWorld((from===outside||roomMap.has(from))&&(to===outside||roomMap.has(to)),'explicit source/listener room IDs required');
 const source=vector(sourcePosition),listener=vector(listenerPosition);
 for(const [id,p] of [[from,source],[to,listener]])requireWorld(contains(topology.scene.tile.bounds,p)&&(id===outside?!topology.rooms.some(r=>inside(r.bounds,p)):contains(roomMap.get(id).bounds,p)),'explicit source/listener position agrees with declared room');
 const base={topologyDigest:topology.topologyDigest,stateDigest:state.stateDigest,routes:[],installedInteriorVerified:false,runtimeCompatibilityVerified:false,acousticRoutingApplied:false,pcmQueueFramesAdded:0,sourceGenerationsModified:0};
 const fail=(status,reason)=>freeze({...base,status,reason});
 if(state.session!==session||state.generation!==generation)return fail('unqualified','runtime-session-or-generation-mismatch');
 if(now<state.observedAt||now>=state.validUntil)return fail('unqualified','interior-state-expired-or-future');
 if(now<topology.scene.tile.createdAt||now>=topology.scene.tile.validUntil||topology.scene.tile.surfaces.some(s=>now>=s.validUntil))return fail('unqualified','interior-static-scene-expired-or-future');
 if(topology.activationKeys.some(k=>state.activation[k]===false))return fail('inactive','explicit-interior-or-ipl-inactive');
 if(topology.activationKeys.some(k=>state.activation[k]!==true))return fail('unqualified','unknown-interior-or-ipl-activation');
 if([from,to].some(id=>id!==outside&&roomMap.get(id).completeness!=='known'))return fail('unqualified','unknown-room-geometry');
 let uncertain=topology.scene.tile.coverage==='partial'||topology.unknown.length>0||topology.portals.some(p=>p.topology==='unknown'),expansions=0,limited=false;const routes=[];
 const walk=(node,nodes,edges,energy)=>{
  if(++expansions>interiorLimits04.expansions){limited=true;return;}
  if(node===to){
   if(routes.length>=maxPaths){limited=true;return;}
   const points=[source,...edges.map(e=>e.portal.aperture.center),listener];let distance=0;for(let i=1;i<points.length;i++)distance+=magnitude(subtract(points[i],points[i-1]));
   const roomIds=nodes.filter(id=>id!==outside);routes.push({rooms:[...nodes],portals:edges.map(e=>({id:e.portal.id,state:e.mode,reflection:e.portal.profiles[e.mode].reflection,transmission:e.portal.profiles[e.mode].transmission})),
    transmissionEnergy:[...energy],attenuationDb:energy.map(e=>e===0?null:-10*Math.log10(e)),zeroTransmissionBands:energy.map(e=>e===0),portalCenterPolylineMetres:distance,
    distanceBasis:'authored-portal-centre-candidate-not-visibility-or-travel-time-proof',reflectionSurfaceIds:[...new Set(roomIds.flatMap(id=>Object.values(roomMap.get(id).surfaces).flat()))],
    coefficientBasis:'authored-assumption',rendererVisibilityQualified:false});return;
  }
  if(edges.length>=maxHops){limited=true;return;}
  for(const portal of topology.portals){
   if(portal.a!==node&&portal.b!==node)continue;const next=portal.a===node?portal.b:portal.a;
   if(portal.topology!=='known'||next===null){uncertain=true;continue;}
   if(nodes.includes(next))continue;
   if(next!==outside&&roomMap.get(next).completeness!=='known'){uncertain=true;continue;}
   const mode=['door','window'].includes(portal.kind)?state.portals[portal.id]:'open';if(!['open','closed'].includes(mode)){uncertain=true;continue;}
   const transmission=portal.profiles[mode].transmission;if(transmission.every(n=>n===0))continue;
   walk(next,[...nodes,next],[...edges,{portal,mode}],energy.map((e,i)=>e*transmission[i]));
   if(expansions>interiorLimits04.expansions)return;
  }
 };
 walk(from,[from],[],[1,1,1]);
 return freeze({...base,status:limited?'budget-limited':uncertain?'partial-unknown-connectivity':routes.length?'candidate-routes':'no-known-route',routes,
  unknownConnectivity:uncertain,searchComplete:!limited,expansions,reason:'offline-topology-plan-only-no-renderer-or-installed-compatibility-claim'});
}
