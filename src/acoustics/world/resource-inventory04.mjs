// Offline inventory qualification. This module enumerates supplied metadata,
// never directories, RPFs, game fibers or native runtime state.
import {bounds,fields,freeze,digest,identifier,requireWorld,canonical} from './contracts.mjs';
import {codeWalkerSource03,resourceImportLimits03,effectiveResourceManifest03,resourceImporterRevision03} from './resource-import03.mjs';
const inventories=new WeakSet(),plans=new WeakSet(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const inventoryLimits04=Object.freeze({resources:128,tiles:64,mounts:16,metadataBytes:262144});
function logicalPath(value){requireWorld(typeof value==='string'&&value.length>0&&value.length<=160&&!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')&&value.split('/').every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..'),'explicit logical resource path');return value.toLowerCase();}
export function qualifyResourceInventory04(input){
 fields(input,['schema','kind','origin','build','layout','parser','mountPolicy','precedenceEvidence','mounts','resources','tiles']);
 requireWorld(input.schema===1&&input.kind==='RichAudioResourceInventory04'&&['original-authored-fixture','separately-authorized-installed-metadata'].includes(input.origin),'explicit inventory authority');identifier(input.build);
 requireWorld(input.mountPolicy==='explicit-reviewed-order-v1'&&hex(input.precedenceEvidence)&&['gen9','legacy'].includes(input.layout)&&input.parser?.sourceCommit===codeWalkerSource03&&hex(input.parser.sha256),'bound explicit precedence/parser profile');
 requireWorld(Buffer.byteLength(canonical(input))<=inventoryLimits04.metadataBytes&&Array.isArray(input.mounts)&&input.mounts.length>0&&input.mounts.length<=inventoryLimits04.mounts&&Array.isArray(input.resources)&&input.resources.length>0&&input.resources.length<=inventoryLimits04.resources&&Array.isArray(input.tiles)&&input.tiles.length>0&&input.tiles.length<=inventoryLimits04.tiles,'bounded metadata inventory');
 const mounts=new Map(),orders=new Set();for(const m of input.mounts){fields(m,['id','family','order','enabled']);identifier(m.id);requireWorld(['base','dlc','custom'].includes(m.family)&&!mounts.has(m.id)&&Number.isSafeInteger(m.order)&&m.order>=0&&m.order<=1000000&&!orders.has(m.order)&&typeof m.enabled==='boolean','unambiguous base/DLC/custom mount order');mounts.set(m.id,structuredClone(m));orders.add(m.order);}
 const tileIds=new Set(),tiles=input.tiles.map(t=>{fields(t,['tileId','bounds','bindings','materialTable']);identifier(t.tileId);requireWorld(!tileIds.has(t.tileId)&&Array.isArray(t.bindings)&&t.bindings.length<=128&&t.materialTable&&typeof t.materialTable==='object','explicit tile conversion inputs');tileIds.add(t.tileId);return {...structuredClone(t),bounds:bounds(t.bounds)};});
 for(let i=0;i<tiles.length;i++)for(let j=0;j<i;j++)requireWorld(!tiles[i].bounds.min.every((n,k)=>tiles[i].bounds.max[k]>tiles[j].bounds.min[k]&&n<tiles[j].bounds.max[k]),'overlapping inventory tile interiors');
 const ids=new Set(),groups=new Map();for(const raw of input.resources){
  fields(raw,['id','path','kind','mount','sha256','bytes','deleted','supported','scopeTiles','dependencies']);identifier(raw.id);const p=logicalPath(raw.path);
  requireWorld(!ids.has(raw.id)&&mounts.has(raw.mount)&&['ymap','ytyp','ybn'].includes(raw.kind)&&p.endsWith('.'+raw.kind)&&hex(raw.sha256)&&Number.isSafeInteger(raw.bytes)&&raw.bytes>=0&&raw.bytes<=resourceImportLimits03.resourceBytes&&typeof raw.deleted==='boolean'&&typeof raw.supported==='boolean','explicit resource identity');ids.add(raw.id);
  requireWorld(raw.scopeTiles===null||Array.isArray(raw.scopeTiles)&&raw.scopeTiles.length<=inventoryLimits04.tiles&&new Set(raw.scopeTiles).size===raw.scopeTiles.length&&raw.scopeTiles.every(t=>tileIds.has(t)),'qualified resource tile scope');
  requireWorld(Array.isArray(raw.dependencies)&&raw.dependencies.length<=32,'bounded logical dependency closure');const dependencies=raw.dependencies.map(logicalPath);requireWorld(new Set(dependencies).size===dependencies.length,'duplicate resource dependency');
  if(!mounts.get(raw.mount).enabled)continue;const group=groups.get(p)??[];requireWorld(!group.some(r=>r.mount===raw.mount),'duplicate member in one mount');group.push({...structuredClone(raw),path:p,dependencies,order:mounts.get(raw.mount).order});groups.set(p,group);
 }
 const effective=[...groups.values()].map(g=>g.sort((a,b)=>b.order-a.order)[0]).sort((a,b)=>a.path.localeCompare(b.path)),byPath=new Map(effective.map(r=>[r.path,r]));
 const tilePlans=tiles.map(t=>{
  const selected=new Map(),unknown=[];const visit=(r,chain=new Set())=>{if(chain.has(r.path)){unknown.push({resource:r.id,reason:'cyclic-resource-dependency'});return;}if(selected.has(r.path))return;selected.set(r.path,r);if(r.deleted||!r.supported)unknown.push({resource:r.id,reason:r.deleted?'deleted-winning-resource':'unsupported-winning-resource'});const next=new Set(chain).add(r.path);for(const p of r.dependencies){const d=byPath.get(p);if(!d)unknown.push({resource:p,reason:'missing-resource-dependency'});else visit(d,next);}};
  for(const r of effective){if(r.scopeTiles===null){unknown.push({resource:r.id,reason:'unknown-resource-spatial-scope'});visit(r);}else if(r.scopeTiles.includes(t.tileId))visit(r);}
  const dependencies=[...selected.values()].sort((a,b)=>a.path.localeCompare(b.path));if(!['ymap','ytyp','ybn'].every(kind=>dependencies.some(r=>r.kind===kind&&!r.deleted)))unknown.push({resource:t.tileId,reason:'incomplete-map-type-collision-set'});
  if(input.origin!=='original-authored-fixture')unknown.push({resource:t.tileId,reason:'installed-evidence-not-qualified'});
  // Deliberately bind only mounts and winning resources in this closure. A
  // changed unrelated building must not invalidate this tile on the next launch.
  const mountIds=new Set(dependencies.map(r=>r.mount));const localMounts=[...mounts.values()].filter(m=>mountIds.has(m.id)).sort((a,b)=>a.order-b.order);
  const manifest={schema:1,kind:'RichAudioExplicitResourceManifest03',authority:input.origin==='original-authored-fixture'?'original-authored-fixture':'separately-authorized-explicit-resource',layout:input.layout,parser:structuredClone(input.parser),mounts:localMounts.map(({id,order,enabled})=>({id,order,enabled})),resources:dependencies.map(({id,path,kind,mount,sha256,bytes,deleted,supported})=>({id,path,kind,mount,sha256,bytes,deleted,supported})),tiles:[{tileId:t.tileId,bounds:t.bounds}],coverage:{bounds:t.bounds,outside:'unknown',basis:'original-authored-bounded-subset'},placementEvidence:'original-authored-world-metres',activationEvidence:'original-authored-static-subset'};
  if(dependencies.length>resourceImportLimits03.resources||dependencies.reduce((n,r)=>n+r.bytes,0)>resourceImportLimits03.totalBytes)unknown.push({resource:t.tileId,reason:'per-tile-resource-budget'});
  let manifestDigest=null,worldDigest=null;if(!unknown.length){manifestDigest=effectiveResourceManifest03(manifest).manifestDigest;worldDigest=digest({revision:resourceImporterRevision03,manifestDigest,bindings:t.bindings,materialTable:t.materialTable});}
  const body={schema:4,kind:'RichAudioResourceTilePlan04',build:input.build,tileId:t.tileId,bounds:t.bounds,layout:input.layout,parser:structuredClone(input.parser),mountPolicy:input.mountPolicy,dependencies,manifest,manifestDigest,worldDigest,bindings:t.bindings,materialTable:t.materialTable,unknown,installedWorldVerified:false};
  const plan=freeze({...body,planDigest:digest(body)});plans.add(plan);return plan;
 });
 const body={schema:4,kind:'RichAudioQualifiedInventory04',origin:input.origin,build:input.build,precedenceEvidence:input.precedenceEvidence,effective,tilePlans,installedWorldVerified:false,coverage:'explicit-metadata-subset-only',actualInstallationScanned:false};
 const result=freeze({...body,inventoryDigest:digest(body)});inventories.add(result);return result;
}
export const isResourceInventory04=value=>inventories.has(value);
export const isResourceTilePlan04=value=>plans.has(value);
export function resourceInvalidation04(previous,next){requireWorld(isResourceInventory04(previous)&&isResourceInventory04(next),'qualified inventories required');const old=new Map(previous.tilePlans.map(p=>[p.tileId,p]));return freeze(next.tilePlans.map(p=>({tileId:p.tileId,valid:old.get(p.tileId)?.planDigest===p.planDigest,reason:old.get(p.tileId)?.planDigest===p.planDigest?'exact-dependent-resource-plan':'dependent-plan-changed-or-new'})));}
