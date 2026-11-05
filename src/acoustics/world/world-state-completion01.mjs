// Orthogonal states on the existing world manifest. Potential geometry is never
// evidence that a layer, conditional variant or interior is active in GTA.
import fs from 'node:fs';
import {collisionProjection} from './static-world-resource.mjs';
import {digest} from './contracts.mjs';
import {resolveInteriorCollisionPlacements01} from './interior-placements-completion01.mjs';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const bounds=b=>b&&vector(b.Min)&&vector(b.Max)&&b.Min.every((v,i)=>v<=b.Max[i]);
const norm=v=>String(v??'').replaceAll('\\','/').toLowerCase();
export function resourcePreparationStates01(catalog,resource,row={}) {
 const projection=collisionProjection(catalog,norm(resource.Hash));
 const selected=projection?.SelectedYbn??catalog.Resources.filter(r=>r.Kind==='ybn'&&norm(r.Hash)===norm(resource.Hash));
 const sourceKnown=selected.length===1&&norm(selected[0].Path)===norm(resource.Path)&&hex(catalog.InputBinding?.GameExecutableSHA256)&&hex(catalog.InputBinding?.CodeWalkerCoreSHA256);
 const interior=projection?.InteriorBoundsMembership??[],groups=projection?.MapGroupMembership??[],items=projection?.BoundsStoreItems??[];
 const uniqueBounds=items.length===1&&bounds(items[0])&&hex(items[0].CacheMetadataSHA256)&&typeof items[0].CacheFile==='string';
 const result=row.Result??row.PotentialResult,interiorPlacement=interior.length?resolveInteriorCollisionPlacements01(catalog,resource.Hash,interior):null;
 const geometryState=row.Eligibility==='eligible-exterior'?(row.Status==='imported-exterior-incomplete-surfaces'?'qualified-partial':row.Status==='deferred-resource-import-failed'?'failed':row.Status==='cache-awaiting-archive-revalidation'?'awaiting-current-archive-validation':'not-prepared'):(row.PotentialStatus==='imported-resource-root-incomplete-surfaces'?'qualified-partial':row.PotentialStatus==='failed-resource-import'?'failed':row.PotentialStatus==='cache-awaiting-archive-revalidation'?'awaiting-current-archive-validation':'not-prepared');
 const conditions=groups.map(g=>({variantId:digest({resource:resource.Hash,entry:resource.Path,condition:g}),metadata:structuredClone(g),semantics:'manifest-mapgroup-membership; any-versus-all-and-runtime-selection-unresolved'}));
 return {revision:'discovery-geometry-placement-activation-v1',
  discovery:{state:sourceKnown?'selected-source-identified':'ambiguous-source',basis:'CodeWalker-effective-installation-dictionary',runtimeMountObserved:false},
  geometry:{eligible:sourceKnown&&!!row.PhysicalArchive,state:geometryState,coordinateSpace:'resource-root',coverage:result?.Counts?'supported-surfaces-partial':'unprepared-or-unqualified',acousticResourceComplete:false},
  placement:{state:interior.length?interiorPlacement.state:uniqueBounds?((result?.Classification?.offlineCoordinateFrameVerified||result?.Classification?.PlacementQualification01?.offlineCoordinateFrameVerified)?'cache-identity-qualified':'cache-identity-candidate'):'ambiguous-or-missing-native-bounds',coordinateSpace:interior.length?'interior-local':'resource-root',nativeBounds:uniqueBounds?{min:items[0].Min,max:items[0].Max}:null,interiorMemberships:structuredClone(interior),interiorPlacements:interiorPlacement?{...interiorPlacement,placements:interiorPlacement.placements.map(p=>{const {declaredPortals,...bound}=p;return {...bound,portalsDeclared:declaredPortals.length};})}:null,instancePlacementVerified:false},
  activation:{state:'unobserved',runtimeVerified:false,layer:uniqueBounds?Number(items[0].Layer):null,conditions,conditionCombination:'unresolved',interiorActivationRequired:interior.length>0,mayEnterLiveScene:false},
 };
}
export function geometryQueueCounts01(plan) {
 const eligible=plan.Resources.filter(r=>r.GeometryEligibility==='eligible-resource-root'||r.Eligibility==='eligible-exterior');
 const prepared=eligible.filter(r=>r.Eligibility==='eligible-exterior'?r.Status==='imported-exterior-incomplete-surfaces':r.PotentialStatus==='imported-resource-root-incomplete-surfaces');
 const failed=eligible.filter(r=>r.Eligibility==='eligible-exterior'?r.Status==='deferred-resource-import-failed':r.PotentialStatus==='failed-resource-import');
 const supported=row=>{const r=row.Result??row.PotentialResult,c=r?.Classification;if(c?.state==='codewalker-exterior-static-model')return true;if(c?.state==='codewalker-potential-resource-model'&&Number.isSafeInteger(c.availableTriangleSurfaces)&&Number.isSafeInteger(c.compactAnalyticPrimitives))return c.availableTriangleSurfaces+c.compactAnalyticPrimitives>0;return null;};
 return {eligible:eligible.length,prepared:prepared.length,failed:failed.length,pending:eligible.length-prepared.length,unattempted:eligible.length-prepared.length-failed.length,partialModelsWithSupportedRepresentation:prepared.filter(r=>supported(r)===true).length,sourceOnlyModelsWithoutSupportedRepresentation:prepared.filter(r=>supported(r)===false).length,representationUnknownModels:prepared.filter(r=>supported(r)===null).length,completeAcousticResources:0};
}
export function worldCoverageStates01(plan) {
 const rows=plan.Resources,states=rows.map(r=>r.PreparationStates01),count=(section,predicate)=>states.filter(s=>s&&predicate(s[section])).length;
 return {revision:'discovery-geometry-placement-activation-v1',denominator:rows.length,resourceCountsAreNotGeographicCoverage:true,
  discovery:{selected:rows.length,sourceIdentified:count('discovery',s=>s.state==='selected-source-identified')},
  geometry:geometryQueueCounts01(plan),
  placement:{cacheIdentityQualified:count('placement',s=>s.state==='cache-identity-qualified'),cacheIdentityCandidate:count('placement',s=>s.state==='cache-identity-candidate'),interiorLocalUnplaced:count('placement',s=>s.state==='interior-local-unplaced'),interiorInstancesResolved:count('placement',s=>s.state==='metadata-interior-instances-resolved'),ambiguousOrMissing:count('placement',s=>s.state==='ambiguous-or-missing-native-bounds')},
  activation:{observedActive:0,unobserved:rows.length,conditionalResources:count('activation',s=>s.conditions.length>0),interiorResources:count('activation',s=>s.interiorActivationRequired),potentialVariantsNeverSimultaneouslyEnabled:true},fullWorldReady:false};
}
export function readInitialWorldPriority01(filename,{gameSHA256,notBeforeUtc,nowUtc=new Date().toISOString(),previous=null}={}) {
 try {
  const info=fs.lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>8192)throw Error('priority-file-type-or-size');
  const p=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  const required=['Schema','Kind','GameExecutableSHA256','session','sequence','generation','geometryTimeMs','sourceAgeMs','listener','sources','origin','receivedUtc'];
  if(!p||Object.keys(p).length!==required.length||!required.every(k=>Object.hasOwn(p,k))||p.Schema!==1||p.Kind!=='RichAudioInitialWorldObservation01'||p.GameExecutableSHA256!==gameSHA256||!hex(gameSHA256)||!/^[a-f0-9]{32}$/.test(p.session)||!Number.isSafeInteger(p.sequence)||p.sequence<0||!Number.isSafeInteger(p.generation)||p.generation<1||!Number.isFinite(p.geometryTimeMs)||p.geometryTimeMs<0||!Number.isFinite(p.sourceAgeMs)||p.sourceAgeMs<0||p.sourceAgeMs>500||!vector(p.listener)||!Array.isArray(p.sources)||p.sources.length>2||!p.sources.every(vector)||p.origin!=='normal-gameplay-observation')throw Error('priority-observation-contract');
  const received=Date.parse(p.receivedUtc),earliest=Date.parse(notBeforeUtc),now=Date.parse(nowUtc);
  if(typeof p.receivedUtc!=='string'||!/^\d{4}-\d\d-\d\dT.*Z$/.test(p.receivedUtc)||![received,earliest,now].every(Number.isFinite)||received<earliest-2000||received>now+250)throw Error('priority-observation-stale-or-future');
  // The initial pose is held for a session, not updated with player travel.
  // A genuinely new session may replace it, but cannot backdate that change.
  if(previous?.session===p.session)return {priority:previous,state:'same-session-initial-pose-retained'};
  if(previous&&received<=Date.parse(previous.receivedUtc))throw Error('priority-session-regressed');
  return {priority:{...p,activationAuthority:false},state:'accepted-initial-observation'};
 }catch(error){return {priority:previous,state:error.code==='ENOENT'?'deterministic-fallback-no-observation':'deterministic-fallback-invalid-observation',reason:String(error.message).slice(0,160)};}
}
export function orderWorldPreparationQueue01(plan) {
 const position=plan.InitialPriority01?.listener;
 const distance=row=>{const b=row.PreparationStates01?.placement?.nativeBounds;if(!position||!b||row.PreparationStates01?.activation?.interiorActivationRequired===true)return Infinity;return Math.hypot(...position.map((v,i)=>Math.max(b.min[i]-v,0,v-b.max[i])));};
 return [...plan.Resources].filter(r=>r.GeometryEligibility==='eligible-resource-root'||r.Eligibility==='eligible-exterior').sort((a,b)=>distance(a)-distance(b)||String(a.PhysicalArchive).localeCompare(String(b.PhysicalArchive))||a.EntryPath.localeCompare(b.EntryPath));
}
