// A separate fixture-static qualification path, using the existing acoustic engine.
import {createTile,coordinateSpace} from '../research/local-geometry.mjs';
import {acousticScene} from '../engine/contracts.mjs';
import {bounds as checkBounds,identifier,requireWorld,freeze,digest} from './contracts.mjs';
import {validateStaticTile} from './fixture-placements.mjs';
const scenes=new WeakMap();
export function createQualifiedStaticScene({tiles,worldDigest,generation,session,listenerAnchor=[0,0,1],bounds,durationMs=60000,engine={}}={}){
 requireWorld(Array.isArray(tiles)&&tiles.length>0&&tiles.length<=8&&/^[a-f0-9]{64}$/.test(worldDigest)&&Number.isSafeInteger(generation)&&generation>0,'bounded static scene identity');identifier(session);requireWorld(!Object.hasOwn(engine,'observationModel'),'static fixture cannot masquerade as live observation');const region=checkBounds(bounds);requireWorld(Number.isFinite(durationMs)&&durationMs>0&&durationMs<=60000,'explicit offline experiment horizon');const surfaces=[],materials={},seen=new Set();
 for(const t of tiles){validateStaticTile(t);requireWorld(t.worldDigest===worldDigest&&t.unknown.length===0,'static fixture scene requires exact known fixture inventory; unknown remains direct-only');for(const p of t.panels){requireWorld(!seen.has(p.id),'duplicate static panel');seen.add(p.id);const id='static:'+p.id;surfaces.push({id,coordinateSpace,center:p.center,normal:p.normal,u:p.u,half:p.half,openings:p.openings,motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'fixture:'+p.id},confidence:1,material:{observedId:null,observedConfidence:null,acoustic:null},version:generation,observedAt:0,validUntil:durationMs});materials[id]={reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'aw01-fixture-passive-wall'};}}
 // Complete-synthetic describes this explicitly authored finite experiment only;
 // the persistent static contract never claims a complete installed/live world.
 const tile=createTile({schemaVersion:1,id:'static-fixture:'+digest(tiles.map(t=>t.tileDigest)).slice(0,24),coordinateSpace,timeUnit:'monotonic-ms',bounds:region,listenerAnchor,coverage:'complete-synthetic',surfaces,missingRegions:[],version:generation,createdAt:0,validUntil:durationMs,build:'authored-static-fixture-v1',session,interior:'fixture-only',dynamicEpoch:generation});const scene=acousticScene(tile,materials,engine);scenes.set(scene,freeze({worldDigest,generation,session,tileIds:tiles.map(t=>t.tileId),tileDigests:tiles.map(t=>t.tileDigest),authority:'authored-fixture-only',mode:'offline-static-fixture',geometryTimeOriginMs:0,durationMs,coordinateBasis:'authored local metres; GTA scale unverified',materialBasis:'authored passive coefficients; GTA materials unmeasured'}));return scene;
}
export const isQualifiedStaticScene=scene=>scenes.has(scene);
export function staticSceneMetadata(scene){requireWorld(scenes.has(scene),'qualified static scene brand');return scenes.get(scene);}
