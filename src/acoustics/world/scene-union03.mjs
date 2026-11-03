// Bounded control-worker composition around the existing finite geometry engine.
// No resource IO, source generation, prediction, PCM queue or gameplay activation.
import {createTile, coordinateSpace, inBox, limits} from '../research/local-geometry.mjs';
import {acousticScene, validated} from '../engine/contracts.mjs';
import {digest, freeze, identifier, fields, requireWorld} from './contracts.mjs';

export const sceneUnion03Limits=Object.freeze({tiles:8,partitionCells:4096,surfaces:128,unknownRegions:32,side:256,sourceBindings:256});
const contexts=new WeakSet(),metadata=new WeakMap();
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const overlap=(a,b)=>a.min.every((n,i)=>n<b.max[i]&&a.max[i]>b.min[i]);
const contains=(a,b)=>a.min.every((n,i)=>n<=b.min[i]&&a.max[i]>=b.max[i]);
function supportedContext03(layout,authority){return authority==='original-parser-resource-fixture'&&['legacy-rsc7','gen9-rsc7'].includes(layout)||['original-reference-xml-fixture05','review-policy-static-xml05'].includes(authority)&&['legacy-codewalker-xml05','gen9-codewalker-xml05'].includes(layout)||authority==='review-policy-static-native08'&&layout==='gen9-codewalker-native08';}

export function createSceneTileContext03({tileId,worldDigest,scene,sourceBindings,layout='legacy-rsc7',authority='original-parser-resource-fixture'}={}){
 requireWorld(hex(worldDigest)&&validated.scene(scene)&&scene.tile&&scene.coordinateSpace===coordinateSpace&&!scene.observationModel,
  'explicit immutable finite scene/world identity required');identifier(tileId);
 requireWorld(supportedContext03(layout,authority),
  'resource-layout fixtures confer no installed-world authority');
 if(layout.endsWith('-codewalker-xml05'))requireWorld(scene.tile.surfaces.every(s=>s.provenance.kind===(authority==='review-policy-static-xml05'?'derived':'synthetic'))&&(authority!=='review-policy-static-xml05'||scene.tile.coverage==='partial'),'XML context provenance/partial coverage cannot promote reviewed exports');
 if(layout==='gen9-codewalker-native08')requireWorld(scene.tile.coverage==='partial'&&scene.tile.surfaces.every(s=>s.provenance.kind==='derived'),'native static context cannot promote unverified runtime coverage');
 requireWorld(Array.isArray(sourceBindings)&&sourceBindings.length>0&&sourceBindings.length<=256,'bounded explicit resource dependencies');
 const seen=new Set(),sources=sourceBindings.map(b=>{identifier(b.id);requireWorld(!seen.has(b.id)&&hex(b.sha256),'unique resource dependency/digest');seen.add(b.id);return {id:b.id,sha256:b.sha256};}).sort((a,b)=>a.id.localeCompare(b.id));
 const contentDigest=digest({tileId,worldDigest,geometryKey:scene.geometryKey,materials:scene.materials,engine:scene.config,sources,layout,authority});
 const context=freeze({schema:1,tileId,worldDigest,scene,sourceBindings:sources,layout,authority,contentDigest,installedWorldVerified:false});contexts.add(context);return context;
}
export const isSceneTileContext03=value=>contexts.has(value);

export function encodeSceneTileContext03(context){
 requireWorld(contexts.has(context),'branded qualified scene context required');
 return {schema:1,tileId:context.tileId,worldDigest:context.worldDigest,sourceBindings:context.sourceBindings,layout:context.layout,
  authority:context.authority,contentDigest:context.contentDigest,tile:context.scene.tile,materials:context.scene.materials,engine:context.scene.config};
}
export function decodeSceneTileContext03(packet){
 requireWorld(packet?.schema===1&&hex(packet.contentDigest),'bounded scene packet identity');
 const scene=acousticScene(createTile(packet.tile),packet.materials,packet.engine);
 const context=createSceneTileContext03({...packet,scene});
 requireWorld(context.contentDigest===packet.contentDigest,'scene packet content/binding drift');return context;
}

// Axis partitions retain every uncovered volume; no bounding rectangle becomes
// proof of empty space. Three deterministic sweeps merge only exact shared faces.
function mergeAxis(boxes,axis){
 const other=[0,1,2].filter(i=>i!==axis),groups=new Map();
 for(const b of boxes){const key=other.flatMap(i=>[b.min[i],b.max[i]]).join(',');const group=groups.get(key)??[];group.push(b);groups.set(key,group);}
 const result=[];
 for(const group of groups.values()){
  group.sort((a,b)=>a.min[axis]-b.min[axis]);let previous=null;
  for(const b of group){if(previous&&previous.max[axis]===b.min[axis])previous.max[axis]=b.max[axis];else{previous={min:[...b.min],max:[...b.max]};result.push(previous);}}
 }
 return result;
}
function uncoveredRegions(tiles,region){
 const axes=[0,1,2].map(i=>[...new Set([region.min[i],region.max[i],...tiles.flatMap(t=>[t.min[i],t.max[i]])])].sort((a,b)=>a-b));
 const cells=axes.reduce((n,a)=>n*(a.length-1),1);requireWorld(cells<=4096,'bounded coverage partition');const missing=[];
 for(let x=0;x<axes[0].length-1;x++)for(let y=0;y<axes[1].length-1;y++)for(let z=0;z<axes[2].length-1;z++){
  const at=[x,y,z],b={min:at.map((n,i)=>axes[i][n]),max:at.map((n,i)=>axes[i][n+1])};
  if(!tiles.some(t=>contains(t,b)))missing.push(b);
 }
 let merged=missing;for(const axis of [0,1,2])merged=mergeAxis(merged,axis);
 return {cells,regions:merged.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}

export function composeSceneUnion03({contexts:input,session,worldDigest,generation,listenerAnchor,geometryTimeMs=0}={}){
 requireWorld(Array.isArray(input)&&input.length>0&&input.length<=8&&input.every(c=>contexts.has(c))&&
  /^[a-f0-9]{32}$/.test(session)&&hex(worldDigest)&&Number.isSafeInteger(generation)&&generation>0&&generation<=2147483647&&
  Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0,'bounded qualified union request');
 const selected=[...input].sort((a,b)=>a.tileId.localeCompare(b.tileId)),ids=new Set(),dependencies=new Map(),base=selected[0];
 for(const c of selected){
  requireWorld(!ids.has(c.tileId)&&c.worldDigest===worldDigest&&c.scene.tile.session===session&&c.layout===base.layout&&
   c.authority===base.authority&&digest(c.scene.config)===digest(base.scene.config),'matching world/session/layout/engine and unique selected tiles');ids.add(c.tileId);
  requireWorld(geometryTimeMs>=c.scene.tile.createdAt&&geometryTimeMs<c.scene.tile.validUntil,'selected scene horizon expired or future');
  for(const dependency of c.sourceBindings){requireWorld(!dependencies.has(dependency.id)||dependencies.get(dependency.id)===dependency.sha256,
   'conflicting effective resource dependency across selected tiles');dependencies.set(dependency.id,dependency.sha256);requireWorld(dependencies.size<=256,'union resource dependency budget');}
 }
 for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++)requireWorld(!overlap(selected[i].scene.tile.bounds,selected[j].scene.tile.bounds),
  'overlapping tile volumes require explicit layer resolution');
 const boxes=selected.map(c=>c.scene.tile.bounds),region={min:[0,1,2].map(i=>Math.min(...boxes.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...boxes.map(b=>b.max[i])))};
 requireWorld(region.min.every((n,i)=>region.max[i]-n<=256)&&inBox(listenerAnchor,region),'bounded union extent/listener');
 const uncovered=uncoveredRegions(boxes,region),unknown=[...uncovered.regions.map((bounds,i)=>({id:'gap03:'+i,bounds,reason:'unprepared-static-volume'}))];
 for(const c of selected)for(const m of c.scene.tile.missingRegions)unknown.push({...m,id:'missing03:'+digest([c.tileId,m.id]).slice(0,32)});
 requireWorld(unknown.length<=32,'union missing-region budget; do not fill unknown gaps');
 const createdAt=Math.max(...selected.map(c=>c.scene.tile.createdAt)),validUntil=Math.min(...selected.flatMap(c=>[c.scene.tile.validUntil,...c.scene.tile.surfaces.map(s=>s.validUntil)]));
 const surfaces=new Map(),materials={};
 for(const c of selected)for(const original of c.scene.tile.surfaces){
  requireWorld(original.motion==='static'&&original.observedAt<=createdAt&&original.validUntil>geometryTimeMs,'stationary qualified surface horizon');
  const surface={...original,validUntil:Math.min(original.validUntil,validUntil)},material=c.scene.materials[original.id];
  requireWorld(material,'qualified per-surface material required');
  if(surfaces.has(surface.id)){requireWorld(digest(surfaces.get(surface.id))===digest(surface)&&digest(materials[surface.id])===digest(material),
   'conflicting shared finite surface identity');continue;}
  requireWorld(surfaces.size<limits.surfaces,'union surface budget');surfaces.set(surface.id,surface);materials[surface.id]=material;
 }
 const completeAuthored=selected.every(c=>c.scene.tile.coverage==='complete-synthetic'&&c.scene.tile.surfaces.every(s=>s.provenance.kind==='synthetic'));
 const contentKey=digest({contexts:selected.map(c=>c.contentDigest),session,worldDigest,layout:base.layout});
 const tile=createTile({schemaVersion:1,id:'union03:'+contentKey.slice(0,48),coordinateSpace,timeUnit:'monotonic-ms',bounds:region,listenerAnchor,
  coverage:completeAuthored?'complete-synthetic':'partial',surfaces:[...surfaces.values()],missingRegions:unknown,version:generation,
  createdAt,validUntil,build:'qualified-resource-union03',session,interior:'bounded-original-resource-subset',dynamicEpoch:generation});
 const scene=acousticScene(tile,materials,base.scene.config);
 const info=freeze({schema:1,contentKey,worldDigest,generation,session,tileIds:selected.map(c=>c.tileId),contextDigests:selected.map(c=>c.contentDigest),
  layout:base.layout,partitionCells:uncovered.cells,unpreparedVolumes:uncovered.regions.length,unknownRegions:unknown.length,surfaces:surfaces.size,
  authority:base.authority,installedWorldVerified:false,coverage:base.layout.endsWith('-codewalker-xml05')?'selected-xml-static-volumes-with-explicit-unknown-gaps':'selected-original-resource-volumes-with-explicit-unknown-gaps',
  sourceGenerationsModified:0,pcmQueueFramesAdded:0,geometryTimeMs,createdAt,validUntil});metadata.set(scene,info);return freeze({scene,metadata:info});
}
export function sceneUnionMetadata03(scene){requireWorld(metadata.has(scene),'prepared union scene brand');return metadata.get(scene);}
export const isSceneUnion03=scene=>metadata.has(scene);

export function encodeUnionResult03(result){requireWorld(metadata.has(result?.scene),'prepared union result');const body={schema:1,tile:result.scene.tile,materials:result.scene.materials,engine:result.scene.config,metadata:result.metadata};return {...body,packetDigest:digest(body)};}
export function decodeUnionResult03(packet,expectedRequest){
 requireWorld(expectedRequest&&Array.isArray(expectedRequest.contexts)&&expectedRequest.contexts.every(c=>contexts.has(c)),
  'qualified input contexts are required to verify a worker derivation');
 fields(packet,['schema','tile','materials','engine','metadata','packetDigest']);
 requireWorld(packet?.schema===1&&packet.metadata?.installedWorldVerified===false&&hex(packet.metadata?.contentKey)&&hex(packet.packetDigest),'bounded worker union result');
 const {packetDigest,...body}=packet;requireWorld(digest(body)===packetDigest&&packet.metadata.session===packet.tile.session&&
  packet.metadata.generation===packet.tile.version,'worker packet checksum/session/generation');
 const m=packet.metadata;
 fields(m,['schema','contentKey','worldDigest','generation','session','tileIds','contextDigests','layout','partitionCells','unpreparedVolumes',
  'unknownRegions','surfaces','authority','installedWorldVerified','coverage','sourceGenerationsModified','pcmQueueFramesAdded','geometryTimeMs','createdAt','validUntil']);
 requireWorld(m.schema===1&&hex(m.worldDigest)&&/^[a-f0-9]{32}$/.test(m.session)&&Number.isSafeInteger(m.generation)&&m.generation>0&&m.generation<=2147483647&&
  Array.isArray(m.tileIds)&&m.tileIds.length>0&&m.tileIds.length<=8&&new Set(m.tileIds).size===m.tileIds.length&&
  Array.isArray(m.contextDigests)&&m.contextDigests.length===m.tileIds.length&&m.contextDigests.every(hex)&&
  supportedContext03(m.layout,m.authority)&&
  m.coverage===(m.layout.endsWith('-codewalker-xml05')?'selected-xml-static-volumes-with-explicit-unknown-gaps':'selected-original-resource-volumes-with-explicit-unknown-gaps')&&m.sourceGenerationsModified===0&&m.pcmQueueFramesAdded===0,
  'worker metadata cannot promote layout, authority, coverage or source identity');m.tileIds.forEach(identifier);
 requireWorld(Number.isInteger(m.partitionCells)&&m.partitionCells>0&&m.partitionCells<=4096&&Number.isInteger(m.unpreparedVolumes)&&m.unpreparedVolumes>=0&&m.unpreparedVolumes<=32&&
  m.unknownRegions===packet.tile.missingRegions?.length&&m.unpreparedVolumes<=m.unknownRegions&&m.surfaces===packet.tile.surfaces?.length&&
  Number.isFinite(m.geometryTimeMs)&&m.geometryTimeMs>=m.createdAt&&m.geometryTimeMs<m.validUntil&&
  m.createdAt===packet.tile.createdAt&&m.validUntil===packet.tile.validUntil&&packet.tile.dynamicEpoch===m.generation&&
  packet.tile.id==='union03:'+m.contentKey.slice(0,48)&&packet.tile.build==='qualified-resource-union03'&&
  digest({contexts:m.contextDigests,session:m.session,worldDigest:m.worldDigest,layout:m.layout})===m.contentKey,
  'worker metadata counts, content and finite horizon must match geometry');
 requireWorld(packet.tile.surfaces.every(s=>s.validUntil>=packet.tile.validUntil&&s.validUntil>m.geometryTimeMs),
  'every worker surface must cover the full contracted union horizon');
 // DTO checksums establish integrity, not derivation or authority. Requalify on
 // the separate control thread against the retained branded inputs before a
 // decoded result can be attached to a vehicle pipeline. This is never render work.
 const expected=composeSceneUnion03(expectedRequest),encoded=encodeUnionResult03(expected);
 requireWorld(encoded.packetDigest===packetDigest,'worker result does not derive from the selected qualified inputs');
 return expected;
}
