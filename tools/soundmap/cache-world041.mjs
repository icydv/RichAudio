// Read-only control-thread projection of already qualified original fixtures.
// No filesystem discovery, parser, engine setter, runtime getter or audio call.
import {ResourceTileBuilder04} from '../../src/acoustics/world/cache-builder04.mjs';
import {isResourceInventory04} from '../../src/acoustics/world/resource-inventory04.mjs';
import {encodeResourceTile04,decodeResourceTile04} from '../../src/acoustics/world/resource-tile-store04.mjs';
import {isSceneTileContext03} from '../../src/acoustics/world/scene-union03.mjs';
import {isInteriorTopology04} from '../../src/acoustics/world/interior04.mjs';
import {createTile,coordinateSpace} from '../../src/acoustics/research/local-geometry.mjs';
import {canonical,digest,freeze,requireWorld,identifier} from '../../src/acoustics/world/contracts.mjs';
const snapshots=new WeakSet(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const cachedWorldLimits041=Object.freeze({tiles:64,residentTiles:8,surfaces:1024,interiors:8,rooms:128,portals:256,bytes:2097152});
const point=(surface,p)=>surface.center.map((n,i)=>n+surface.u[i]*p[0]+surface.v[i]*p[1]);
function surfaceView(s){return {id:s.id,vertices:s.footprint?s.footprint.map(p=>point(s,p)):s.corners,normal:s.normal,openings:s.openings.map(o=>({vertices:[[o.min[0],o.min[1]],[o.max[0],o.min[1]],[o.max[0],o.max[1]],[o.min[0],o.max[1]]].map(p=>point(s,p))})),provenance:s.provenance,validUntil:s.validUntil};}
export function createCachedAcousticWorld041({inventory,contexts=[],tiles=[],expectedArtifacts,interiors=[],session,geometryTimeMs=0,alignment=null}={}){
 requireWorld(isResourceInventory04(inventory)&&inventory.origin==='original-authored-fixture'&&Array.isArray(contexts)&&contexts.length<=8&&contexts.every(isSceneTileContext03)&&Array.isArray(tiles)&&tiles.length===contexts.length&&expectedArtifacts&&typeof expectedArtifacts==='object'&&!Array.isArray(expectedArtifacts),'qualified original fixture cache inputs required');
 requireWorld(/^[a-f0-9]{32}$/.test(session)&&Number.isFinite(geometryTimeMs)&&geometryTimeMs>=0&&Array.isArray(interiors)&&interiors.length<=8&&interiors.every(isInteriorTopology04),'branded bounded fixture topology/session required');
 requireWorld(Object.keys(expectedArtifacts).length<=64&&Object.entries(expectedArtifacts).every(([key,value])=>hex(key)&&hex(value)),'independently supplied expected cache artifact digests');
 // An alignment is explicit control evidence for exactly one existing acoustic
 // model stream; it never grants an unscaled native camera a metre transform.
 if(alignment!==null){requireWorld(alignment&&Object.keys(alignment).sort().join(',')==='acousticSession,basis,coordinateKey,session'&&alignment.basis==='original-authored-exact-model-alignment'&&alignment.session===session&&typeof alignment.acousticSession==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(alignment.acousticSession)&&typeof alignment.coordinateKey==='string'&&alignment.coordinateKey.startsWith('model:')&&alignment.coordinateKey.length<=1024,'explicit exact model alignment and acoustic session required; native coordinates remain separate');}
 const selected=new Map(),tileMap=new Map();for(const tile of tiles){requireWorld(!tileMap.has(tile.tileId),'unique supplied cache tile');tileMap.set(tile.tileId,tile);}
 for(const context of contexts){
  const plan=inventory.tilePlans.find(p=>p.tileId===context.tileId),tile=tileMap.get(context.tileId);requireWorld(plan&&!plan.unknown.length&&tile&&hex(expectedArtifacts[plan.planDigest])&&!selected.has(plan.tileId),'selected exact fixture plan and expected artifact required');
  const decoded=decodeResourceTile04(plan,encodeResourceTile04(plan,tile),{tileDigest:expectedArtifacts[plan.planDigest]}),rebound=createTile({...decoded.engineTile,session});
  requireWorld(context.worldDigest===inventory.inventoryDigest&&context.scene.tile.session===session&&context.layout===plan.layout+'-rsc7'&&context.scene.geometryKey===rebound.observationKey&&canonical(context.scene.tile)===canonical(rebound)&&canonical(context.scene.materials)===canonical(decoded.materials),'scene context must derive from exact selected cache geometry/session');
  requireWorld(canonical(context.sourceBindings)===canonical(decoded.sources.map(({id,sha256})=>({id,sha256})).sort((a,b)=>a.id.localeCompare(b.id))),'cache visual resource closure');selected.set(plan.tileId,{context,tile:decoded,plan});
 }
 let surfaces=0;const projectedTiles=inventory.tilePlans.map(plan=>{
  const selectedTile=selected.get(plan.tileId),tile=selectedTile?.tile;
  const future=tile&&geometryTimeMs<tile.engineTile.createdAt,expired=tile&&geometryTimeMs>=Math.min(tile.engineTile.validUntil,...tile.engineTile.surfaces.map(s=>s.validUntil));
  const unknown=[...plan.unknown,...(tile?.unknown??[])];
  const state=plan.unknown.length?'unsupported-or-unknown':!tile?'unprepared':future?'future-fixture':expired?'expired-fixture':tile.engineTile.coverage==='partial'||unknown.length?'partial-fixture':'prepared-fixture';
  const finite=tile?tile.engineTile.surfaces.map(surfaceView):[];surfaces+=finite.length;requireWorld(surfaces<=cachedWorldLimits041.surfaces,'bounded cached display surface budget');
  return {tileId:plan.tileId,bounds:plan.bounds,state,planDigest:plan.planDigest,tileDigest:tile?.tileDigest??null,coverage:tile?.engineTile.coverage??'unknown',createdAt:tile?.engineTile.createdAt??null,validUntil:tile?Math.min(tile.engineTile.validUntil,...tile.engineTile.surfaces.map(s=>s.validUntil)):null,surfaces:finite,unknown,
   missingRegions:tile?.engineTile.missingRegions??[],resourceBindings:plan.dependencies.map(({id,path,kind,sha256})=>({id,path,kind,sha256})),
   buildingBindings:plan.bindings.map(binding=>({archetypeHash:binding.archetypeHash,collisionResourceId:binding.resourceId,basis:binding.basis})),buildingIdentityBasis:'declared-archetype-collision-binding-not-a-building-name'};
 });
 let rooms=0,portals=0;const interiorViews=interiors.map(topology=>{
  const linked=[...selected.values()].find(({context})=>context.scene.geometryKey===topology.scene.geometryKey&&canonical(context.scene.materials)===canonical(topology.scene.materials));
  requireWorld(linked&&topology.scene.tile.session===session,'interior fixture must bind an exact selected cache scene');
  const deps=new Map(linked.context.sourceBindings.map(s=>[s.id,s.sha256]));requireWorld(topology.sourceBindings.every(s=>deps.get(s.id)===s.sha256),'interior topology resource dependencies must match selected cache');
  rooms+=topology.rooms.length;portals+=topology.portals.length;requireWorld(rooms<=128&&portals<=256,'bounded cached interior display topology');
  return {id:topology.id,tileId:linked.plan.tileId,topologyDigest:topology.topologyDigest,mapKind:topology.mapKind,rooms:topology.rooms,portals:topology.portals.map(p=>({id:p.id,a:p.a,b:p.b,kind:p.kind,topology:p.topology,vertices:p.aperture.corners})),activationKeys:topology.activationKeys,unknown:topology.unknown,runtimeState:'not-supplied',connectivity:'static-declared-fixture-only',completenessMeaning:'supplied-metadata-not-enclosure-proof'};
 });
 const body={schemaVersion:1,kind:'richaudio-cached-acoustic-world041',purpose:'read-only-cache-inspection',authority:'original-authored-fixture-only',coordinateSpace,session,worldDigest:inventory.inventoryDigest,geometryTimeMs,tiles:projectedTiles,interiors:interiorViews,alignment:alignment?{...alignment}:null,paths:[],solverPathEvidence:false,viewerCanPublishAcoustics:false,installedWorldVerified:false,runtimeActivationVerified:false,outsideCoverage:'unknown'};
 requireWorld(Buffer.byteLength(canonical(body))<=cachedWorldLimits041.bytes,'bounded cached acoustic world packet');const packet=freeze({...body,generation:digest(body)});snapshots.add(packet);return packet;
}
export const isCachedAcousticWorld041=packet=>snapshots.has(packet);
export function cachedWorldFromBuilder041(builder,{expectedArtifacts,interiors=[],geometryTimeMs=0,alignment=null}={}){
 requireWorld(builder instanceof ResourceTileBuilder04&&!builder.closed&&!builder.preparing,'idle original fixture tile builder required');
 return createCachedAcousticWorld041({inventory:builder.inventory,contexts:builder.contexts(),tiles:[...builder.resident.values()].map(r=>r.tile),expectedArtifacts,interiors,session:builder.session,geometryTimeMs,alignment});
}
export class CachedWorldFeed041{
 constructor(now=Date.now){requireWorld(typeof now==='function','cached display clock required');this.now=now;this.packet=null;this.publishedAt=null;this.revision=0;this.reason='not-supplied';this.lastNow=null;this.clockFault=false;}
 #time(){const value=this.now();if(!Number.isFinite(value)||this.lastNow!==null&&value<this.lastNow)this.clockFault=true;else this.lastNow=value;return value;}
 publish(packet){requireWorld(isCachedAcousticWorld041(packet),'branded control-thread cache snapshot required');const time=this.#time();requireWorld(!this.clockFault,'cached display clock fault requires a new feed');if(this.packet===packet)return this.status();this.packet=packet;this.publishedAt=time;this.revision++;this.reason=null;return this.status();}
 clear(reason='withdrawn'){identifier(reason);this.packet=null;this.publishedAt=null;this.revision++;this.reason=reason;return this.status();}
 invalidate(worldDigest){requireWorld(hex(worldDigest),'explicit next inventory digest');if(this.packet&&this.packet.worldDigest!==worldDigest)this.clear('resource-inventory-changed');return this.status();}
 status(){const time=this.#time(),available=!!this.packet&&!this.clockFault;return {available,generation:available?this.packet.generation:null,revision:this.revision,reason:this.clockFault?'cache-display-clock-fault':this.reason,clockQualified:!this.clockFault,ageMs:available?time-this.publishedAt:null,geometryTimeMs:available?this.packet.geometryTimeMs+time-this.publishedAt:null,authority:'original-authored-fixture-only',installedWorldVerified:false,viewerCanPublishAcoustics:false};}
 snapshot(generation=''){const status=this.status();return {packet:status.available&&this.packet.generation!==generation?this.packet:null,status};}
}
