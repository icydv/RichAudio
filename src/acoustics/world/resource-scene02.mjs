// A bounded bridge from the real parser's ORIGINAL binary fixtures into the
// existing finite acoustic solver. No installation or live activation authority.
import {convertCollision,triangleNormal,identity} from './collision-mesh.mjs';
import {resolvePlacements,transformInstance} from './placements.mjs';
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {canonical,digest,freeze,identifier,bounds,vector,requireWorld} from './contracts.mjs';
import {isXmlGrant05} from './xml-evidence05.mjs';
import {isNativeGrant08,isAdmittedNativeResource08} from './native-evidence08.mjs';
export const explicitResourceConverter02='explicit-rsc7-fixture-triangle-world-v2';
const scenes=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function pathKey(value){requireWorld(typeof value==='string'&&value.length>0&&value.length<=256&&!value.includes(':')&&!value.startsWith('/')&&!value.startsWith('\\'),'explicit relative resource identity');const key=value.replaceAll('\\','/').toLowerCase();requireWorld(!key.split('/').some(x=>x==='..'||x==='.'||!x),'safe logical resource path');return key;}
export function effectiveExplicitResources02(input,{xmlGrant,nativeGrant}={}){
 const xml=xmlGrant!==undefined,native=nativeGrant!==undefined;if(xml)requireWorld(isXmlGrant05(xmlGrant),'branded XML scene grant');if(native)requireWorld(isNativeGrant08(nativeGrant)&&!xml,'branded native scene grant');
 requireWorld(Array.isArray(input)&&input.length<=256,'bounded explicit resource inventory');const groups=new Map(),ids=new Set();
 for(const raw of input){const id=identifier(raw.id),key=pathKey(raw.path);requireWorld(!ids.has(id)&&Number.isInteger(raw.order)&&raw.order>=0&&raw.order<=1000000&&['ymap','ytyp','ybn'].includes(raw.kind)&&hex(raw.sha256)&&typeof raw.deleted==='boolean','explicit resource binding/order');ids.add(id);
  if(!raw.deleted){const n=raw.normalized;requireWorld(n?.kind==='CodeWalkerExplicitStaticResource02'&&n.resourceKind===raw.kind&&n.sourceAuthority===(xml?'unqualified-codewalker-xml-export':native?'separately-authorized-explicit-resource':'original-authored-fixture')&&n.sourceSHA256===raw.sha256&&n.worldPlacementVerified===false,'explicit parser resource identity and authority');if(xml)requireWorld(xmlGrant.resources.some(r=>r.id===raw.id&&r.xmlSHA256===raw.sha256&&r.decodedSHA256===digest(n)),'exact XML scene grant resource binding');if(native)requireWorld(isAdmittedNativeResource08(n,{grant:nativeGrant,resourceId:raw.id,sourceSHA256:raw.sha256}),'exact branded reviewed native decoded geometry');}
  const entry={...raw,path:key};const group=groups.get(key)??[];requireWorld(!group.some(e=>e.order===entry.order),'ambiguous same-path mount precedence');group.push(entry);groups.set(key,group);
 }
 const selected=[...groups.values()].map(group=>group.sort((a,b)=>b.order-a.order)[0]).sort((a,b)=>a.path.localeCompare(b.path));
 const worldDigest=digest({converter:explicitResourceConverter02,resources:selected.map(e=>({id:e.id,path:e.path,order:e.order,kind:e.kind,sha256:e.sha256,deleted:e.deleted})),...(xml?{inputFormat:'codewalker-xml05',qualificationDigest:xmlGrant.qualificationDigest}:{})});
 return freeze({converter:explicitResourceConverter02,worldDigest,effective:selected.filter(e=>!e.deleted),tombstones:selected.filter(e=>e.deleted).map(e=>e.path),authority:xml?xmlGrant.authority:native?'reviewed-static-native08':'original-authored-parser-fixtures',installedWorldVerified:false});
}
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function trianglePanel(triangle,id,{xml=false,derived=false}={}){
 const normal=triangleNormal(triangle.positions);requireWorld(normal,'nondegenerate placed triangle');const center=[0,1,2].map(i=>triangle.positions.reduce((s,p)=>s+p[i],0)/3),edge=sub(triangle.positions[1],triangle.positions[0]),length=Math.hypot(...edge),u=edge.map(v=>v/length),v=cross(normal,u);
 const footprint=triangle.positions.map(p=>{const d=sub(p,center);return [dot(d,u),dot(d,v)];}),half=[0,1].map(i=>Math.max(...footprint.map(p=>Math.abs(p[i]))));
 return {id,coordinateSpace,center,normal,u,half,footprint,motion:'static',reflectiveSide:'both',provenance:{kind:derived?'derived':'synthetic',reference:xml?(derived?'review-policy-static-xml05':'original-reference-xml05'):'original-binary-resource02'},confidence:derived?null:1,
  version:1,observedAt:0,validUntil:60000,material:{observedId:null,observedConfidence:null,acoustic:null}};
}
export function createExplicitResourceScene02({resources,bindings,materialTable={},session,region,listenerAnchor=[0,0,1],xmlGrant,nativeGrant}={}){
 const xml=xmlGrant!==undefined,native=nativeGrant!==undefined,derived=native||xml&&xmlGrant.authority==='review-policy-bound-static-export';if(xml)requireWorld(isXmlGrant05(xmlGrant),'branded admitted XML scene');if(native)requireWorld(isNativeGrant08(nativeGrant),'branded admitted native scene');
 requireWorld(/^[a-f0-9]{32}$/.test(session),'explicit resource scene session');region=bounds(region);listenerAnchor=vector(listenerAnchor);const inventory=effectiveExplicitResources02(resources,{xmlGrant,nativeGrant}),entities=[],archetypes=[],meshes=new Map(),meshResources=[];
 if(native)requireWorld(canonical(bindings)===canonical(nativeGrant.bindings)&&canonical(materialTable)===canonical(nativeGrant.materialTable)&&canonical(region)===canonical(nativeGrant.bounds),'reviewed native scene controls');
 if(xml){const s=xmlGrant.selection,expected=[{archetypeHash:s.archetypeHash,resourceId:s.ybnId,basis:'reviewed-xml-association05',physicsDictionary:s.physicsDictionary,sourceSHA256:xmlGrant.evidenceSHA256,collisionFrame:s.collisionFrame}];requireWorld(canonical(bindings)===canonical(expected)&&canonical(materialTable)===canonical(xmlGrant.materialTable)&&canonical(region)===canonical(xmlGrant.bounds),'XML selected ownership, materials and coordinates bound to admitted controls');}
 const worldDigest=digest({resourceInventory:inventory.worldDigest,converter:explicitResourceConverter02,bindings,materialTable,coordinateBasis:xml?'review-policy-bound-xml-controls-v1':native?'review-policy-bound-native-controls08':'authored-world-metres-v1'});
 if(!['ymap','ytyp','ybn'].every(kind=>inventory.effective.some(e=>e.kind===kind)))return {state:'unqualified-resource-set',scene:null,worldDigest,installedWorldVerified:false};
 for(const entry of inventory.effective){const data=entry.normalized.data;
  if(entry.kind==='ymap'){
   requireWorld(data.unsupportedEntities===0&&data.scripted===false,'MLO/scripted/unsupported map activation remains unqualified');
   for(const entity of data.entities){requireWorld(entities.length<4096,'placed entity budget');entities.push({...entity,id:entry.id+':'+entity.id});}
  }else if(entry.kind==='ytyp'){requireWorld(data.unsupportedArchetypes===0,'time/MLO/composite archetypes remain unqualified');archetypes.push(...data.archetypes);}
  else{const mesh=convertCollision(data);requireWorld(mesh.unknownRegions.length===0&&mesh.counts.triangles<=128,'unsupported or oversized collision remains unknown, not empty');meshes.set(entry.id,mesh);meshResources.push({id:entry.id,coordinateSpace:'archetype-local',placementEvidence:xml||native?'metadata-verified-local':'authored-fixture'});}
 }
 let placement;if(xml&&xmlGrant.selection.collisionFrame==='world'){requireWorld(entities.length===1&&archetypes.length===1&&entities[0].archetypeName===xmlGrant.selection.archetypeHash&&archetypes[0].nameHash===xmlGrant.selection.archetypeHash&&archetypes[0].physicsDictionary===xmlGrant.selection.physicsDictionary,'selected world collision association');placement={placements:[{instanceId:entities[0].id,resourceId:xmlGrant.selection.ybnId,matrix:[...identity],coordinateSpace:'world',evidence:'metadata-resolved-runtime-unverified'}],unresolved:[]};}
 else if(native&&nativeGrant.collisionFrame==='world'){const b=bindings[0];requireWorld(entities.length===1&&bindings.length===1&&b.collisionFrame==='world'&&entities[0].archetypeName===b.archetypeHash&&archetypes.filter(a=>a.nameHash===b.archetypeHash&&a.physicsDictionary===b.physicsDictionary).length===1&&meshes.has(b.resourceId),'one consistent reviewed world collision association');placement={placements:[{instanceId:entities[0].id,resourceId:b.resourceId,matrix:[...identity],coordinateSpace:'world',evidence:'metadata-resolved-runtime-unverified'}],unresolved:[]};}
 else placement=resolvePlacements({entities,archetypes,bindings:xml||native?bindings.map(b=>({...b,basis:'verified-ytyp-collision-binding'})):bindings,resources:meshResources});
 if(placement.unresolved.length)return {state:'unqualified-placement',unresolved:placement.unresolved,scene:null,worldDigest,installedWorldVerified:false};
 const surfaces=[],materials={};let unmapped=0;
 for(const instance of placement.placements){const mesh=meshes.get(instance.resourceId),triangles=transformInstance(mesh.chunks.flatMap(c=>c.triangles),instance);
  for(const [index,triangle]of triangles.entries()){requireWorld(surfaces.length<128,'nearby acoustic triangle budget');const id='resource02:'+digest([instance.instanceId,index]).slice(0,32),panel=trianglePanel(triangle,id,{xml,derived}),material=materialTable[triangle.materialType];if(native)panel.provenance.reference='reviewed-static-native08';
   // Native material numbers alone never become acoustic coefficients.
   if(!material)unmapped++;else{requireWorld(material.basis==='authored-assumption','fixture material coefficients must remain authored');materials[id]=material;}surfaces.push(panel);}
 }
 if(unmapped)return {state:'unqualified-material',unmapped,scene:null,worldDigest,installedWorldVerified:false};
 const tile=createTile({schemaVersion:1,id:'resource02:'+worldDigest.slice(0,24),coordinateSpace,timeUnit:'monotonic-ms',bounds:region,listenerAnchor,
  coverage:derived?'partial':'complete-synthetic',surfaces,missingRegions:[],version:1,createdAt:0,validUntil:60000,build:explicitResourceConverter02,session,interior:xml?'offline-xml-static-subset05':native?'reviewed-native-static-runtime-unverified08':'original-fixture-only',dynamicEpoch:1});
 const scene=acousticScene(tile,materials,{order:2,airDbPerMetre:[0,0,0]});const metadata=freeze({converter:explicitResourceConverter02,worldDigest,cacheSchema:'richaudio-explicit-resource-static-v2',
  resourceInventoryDigest:inventory.worldDigest,materialBindingDigest:digest(materialTable),placementBindingDigest:digest(bindings),
  sources:inventory.effective.map(e=>({id:e.id,kind:e.kind,sha256:e.sha256})),placedInstances:placement.placements.length,finiteTriangleSupports:surfaces.length,
  sourceAgnostic:true,authority:xml?xmlGrant.authority:native?'reviewed-static-native08':'original-authored-parser-fixtures',coordinateBasis:xml||native?'review-policy-bound coordinate controls; runtime scale unverified':'authored world metres; GTA native scale unverified',
  materialBasis:'explicit authored coefficients, never inferred from native material IDs',installedWorldVerified:false,runtimeActivation:'unverified'});
 scenes.set(scene,metadata);return {state:xml?'admitted-offline-xml-static-comparison':native?'admitted-offline-native-static08':'qualified-original-resource-fixture',scene,metadata,worldDigest,installedWorldVerified:false};
}
export function explicitResourceSceneMetadata02(scene){requireWorld(scenes.has(scene),'branded original resource scene');return scenes.get(scene);}
