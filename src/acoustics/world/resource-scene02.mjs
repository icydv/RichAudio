// A bounded bridge from the real parser's ORIGINAL binary fixtures into the
// existing finite acoustic solver. No installation or live activation authority.
import {convertCollision,triangleNormal} from './collision-mesh.mjs';
import {resolvePlacements,transformInstance} from './placements.mjs';
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {canonical,digest,freeze,identifier,bounds,vector,requireWorld} from './contracts.mjs';
export const explicitResourceConverter02='explicit-rsc7-fixture-triangle-world-v2';
const scenes=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function pathKey(value){requireWorld(typeof value==='string'&&value.length>0&&value.length<=256&&!value.includes(':')&&!value.startsWith('/')&&!value.startsWith('\\'),'explicit relative resource identity');const key=value.replaceAll('\\','/').toLowerCase();requireWorld(!key.split('/').some(x=>x==='..'||x==='.'||!x),'safe logical resource path');return key;}
export function effectiveExplicitResources02(input){
 requireWorld(Array.isArray(input)&&input.length<=256,'bounded explicit resource inventory');const groups=new Map(),ids=new Set();
 for(const raw of input){const id=identifier(raw.id),key=pathKey(raw.path);requireWorld(!ids.has(id)&&Number.isInteger(raw.order)&&raw.order>=0&&raw.order<=1000000&&['ymap','ytyp','ybn'].includes(raw.kind)&&hex(raw.sha256)&&typeof raw.deleted==='boolean','explicit resource binding/order');ids.add(id);
  if(!raw.deleted){const n=raw.normalized;requireWorld(n?.kind==='CodeWalkerExplicitStaticResource02'&&n.resourceKind===raw.kind&&n.sourceAuthority==='original-authored-fixture'&&n.sourceSHA256===raw.sha256&&n.worldPlacementVerified===false,'only original actual-parser resource fixtures may qualify this bridge');}
  const entry={...raw,path:key};const group=groups.get(key)??[];requireWorld(!group.some(e=>e.order===entry.order),'ambiguous same-path mount precedence');group.push(entry);groups.set(key,group);
 }
 const selected=[...groups.values()].map(group=>group.sort((a,b)=>b.order-a.order)[0]).sort((a,b)=>a.path.localeCompare(b.path));
 const worldDigest=digest({converter:explicitResourceConverter02,resources:selected.map(e=>({id:e.id,path:e.path,order:e.order,kind:e.kind,sha256:e.sha256,deleted:e.deleted}))});
 return freeze({converter:explicitResourceConverter02,worldDigest,effective:selected.filter(e=>!e.deleted),tombstones:selected.filter(e=>e.deleted).map(e=>e.path),authority:'original-authored-parser-fixtures',installedWorldVerified:false});
}
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function trianglePanel(triangle,id){
 const normal=triangleNormal(triangle.positions);requireWorld(normal,'nondegenerate placed triangle');const center=[0,1,2].map(i=>triangle.positions.reduce((s,p)=>s+p[i],0)/3),edge=sub(triangle.positions[1],triangle.positions[0]),length=Math.hypot(...edge),u=edge.map(v=>v/length),v=cross(normal,u);
 const footprint=triangle.positions.map(p=>{const d=sub(p,center);return [dot(d,u),dot(d,v)];}),half=[0,1].map(i=>Math.max(...footprint.map(p=>Math.abs(p[i]))));
 return {id,coordinateSpace,center,normal,u,half,footprint,motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-binary-resource02'},confidence:1,
  version:1,observedAt:0,validUntil:60000,material:{observedId:null,observedConfidence:null,acoustic:null}};
}
export function createExplicitResourceScene02({resources,bindings,materialTable={},session,region,listenerAnchor=[0,0,1]}={}){
 requireWorld(/^[a-f0-9]{32}$/.test(session),'explicit original resource scene session');region=bounds(region);listenerAnchor=vector(listenerAnchor);const inventory=effectiveExplicitResources02(resources),entities=[],archetypes=[],meshes=new Map(),meshResources=[];
 const worldDigest=digest({resourceInventory:inventory.worldDigest,converter:explicitResourceConverter02,bindings,materialTable,coordinateBasis:'authored-world-metres-v1'});
 if(!['ymap','ytyp','ybn'].every(kind=>inventory.effective.some(e=>e.kind===kind)))return {state:'unqualified-resource-set',scene:null,worldDigest,installedWorldVerified:false};
 for(const entry of inventory.effective){const data=entry.normalized.data;
  if(entry.kind==='ymap'){
   requireWorld(data.unsupportedEntities===0&&data.scripted===false,'MLO/scripted/unsupported map activation remains unqualified');
   for(const entity of data.entities){requireWorld(entities.length<4096,'placed entity budget');entities.push({...entity,id:entry.id+':'+entity.id});}
  }else if(entry.kind==='ytyp'){requireWorld(data.unsupportedArchetypes===0,'time/MLO/composite archetypes remain unqualified');archetypes.push(...data.archetypes);}
  else{const mesh=convertCollision(data);requireWorld(mesh.unknownRegions.length===0&&mesh.counts.triangles<=128,'unsupported or oversized collision remains unknown, not empty');meshes.set(entry.id,mesh);meshResources.push({id:entry.id,coordinateSpace:'archetype-local',placementEvidence:'authored-fixture'});}
 }
 const placement=resolvePlacements({entities,archetypes,bindings,resources:meshResources});
 if(placement.unresolved.length)return {state:'unqualified-placement',unresolved:placement.unresolved,scene:null,worldDigest,installedWorldVerified:false};
 const surfaces=[],materials={};let unmapped=0;
 for(const instance of placement.placements){const mesh=meshes.get(instance.resourceId),triangles=transformInstance(mesh.chunks.flatMap(c=>c.triangles),instance);
  for(const [index,triangle]of triangles.entries()){requireWorld(surfaces.length<128,'nearby acoustic triangle budget');const id='resource02:'+digest([instance.instanceId,index]).slice(0,32),panel=trianglePanel(triangle,id),material=materialTable[triangle.materialType];
   // Native material numbers alone never become acoustic coefficients.
   if(!material)unmapped++;else{requireWorld(material.basis==='authored-assumption','fixture material coefficients must remain authored');materials[id]=material;}surfaces.push(panel);}
 }
 if(unmapped)return {state:'unqualified-material',unmapped,scene:null,worldDigest,installedWorldVerified:false};
 const tile=createTile({schemaVersion:1,id:'resource02:'+worldDigest.slice(0,24),coordinateSpace,timeUnit:'monotonic-ms',bounds:region,listenerAnchor,
  coverage:'complete-synthetic',surfaces,missingRegions:[],version:1,createdAt:0,validUntil:60000,build:explicitResourceConverter02,session,interior:'original-fixture-only',dynamicEpoch:1});
 const scene=acousticScene(tile,materials,{order:2,airDbPerMetre:[0,0,0]});const metadata=freeze({converter:explicitResourceConverter02,worldDigest,cacheSchema:'richaudio-explicit-resource-static-v2',
  resourceInventoryDigest:inventory.worldDigest,materialBindingDigest:digest(materialTable),placementBindingDigest:digest(bindings),
  sources:inventory.effective.map(e=>({id:e.id,kind:e.kind,sha256:e.sha256})),placedInstances:placement.placements.length,finiteTriangleSupports:surfaces.length,
  sourceAgnostic:true,authority:'original-authored-parser-fixtures',coordinateBasis:'authored world metres; GTA native scale unverified',
  materialBasis:'explicit authored coefficients, never inferred from native material IDs',installedWorldVerified:false,runtimeActivation:'unverified'});
 scenes.set(scene,metadata);return {state:'qualified-original-resource-fixture',scene,metadata,worldDigest,installedWorldVerified:false};
}
export function explicitResourceSceneMetadata02(scene){requireWorld(scenes.has(scene),'branded original resource scene');return scenes.get(scene);}
