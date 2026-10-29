// Bounded observation -> existing finite-path engine adapter. No game, disk or device calls.
import { createHash } from 'node:crypto';
import { inspectTileGroup, independentPatch, vector as observationVector } from '../research/tile-inspection.mjs';
import { createTile, coordinateSpace, vector, sub, unit, dot, cross, length } from '../research/local-geometry.mjs';
import { acousticScene, freeze, requireValue } from './contracts.mjs';

export const observationLimits = Object.freeze({ groups: 8, bytesPerGroup: 262144, liveAgeMs: 1000 });
const validCoordinates = new WeakSet();
const identity = x => typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(x);
export function observationCoordinates({originNative, axes, metresPerNativeUnit, basis, reference} = {}) {
  requireValue(basis === 'declared-demonstration-scale' && identity(reference), 'declared scale basis/reference required; GTA metres are unverified');
  const origin = vector(originNative);
  requireValue(Array.isArray(axes) && axes.length === 3, 'explicit coordinate axes required');
  const rows = axes.map(vector);
  requireValue(rows.every(r => Math.abs(length(r)-1)<1e-9) &&
    rows.every((r,i) => rows.every((s,j) => i===j || Math.abs(dot(r,s))<1e-9)) &&
    dot(cross(rows[0],rows[1]),rows[2])>1-1e-9, 'right-handed orthonormal mapping required');
  requireValue(Number.isFinite(metresPerNativeUnit) && metresPerNativeUnit>=1e-4 && metresPerNativeUnit<=100, 'bounded explicit scale required');
  const contract = freeze({originNative:origin,axes:rows,metresPerNativeUnit,basis,reference,
    physicalCalibration:'unverified',nativeSpace:'gta-native-units-unverified',modelSpace:coordinateSpace});
  validCoordinates.add(contract); return contract;
}
export function modelPoint(contract, native) {
  requireValue(validCoordinates.has(contract), 'validated coordinate contract required');
  const d=sub(vector(native),contract.originNative);
  return vector(contract.axes.map(a=>dot(a,d)*contract.metresPerNativeUnit));
}
export function modelDirection(contract, native) {
  requireValue(validCoordinates.has(contract), 'validated coordinate contract required');
  const n=unit(native); return unit(contract.axes.map(a=>dot(a,n)));
}
export function modelVelocity(contract, native) {
  requireValue(validCoordinates.has(contract), 'validated coordinate contract required');
  const v=vector(native);return vector(contract.axes.map(a=>dot(a,v)*contract.metresPerNativeUnit));
}
function regionBounds(contract, region) {
  const lo=vector(region?.minNative),hi=vector(region?.maxNative);
  requireValue(lo.every((x,i)=>hi[i]>x), 'finite native model region required');
  const corners=[]; for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]])corners.push(modelPoint(contract,[x,y,z]));
  return {min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])))};
}

export function observedAcousticScene({groups, coordinates, region, listenerNative, context, materialsByKind={},
  mode='live-snapshot', replayDurationMs, emptyValidUntilMs, visibilityAssumption, motionAssumption, engine={}} = {}) {
  requireValue(validCoordinates.has(coordinates), 'explicit coordinate/scale contract required');
  requireValue(Array.isArray(groups) && groups.length<=observationLimits.groups, 'bounded observed group count');
  requireValue(visibilityAssumption==='unobserved-space-assumed-clear' && motionAssumption==='static-during-snapshot', 'explicit partial-world and snapshot-motion assumptions required');
  requireValue(['live-snapshot','historical-replay'].includes(mode), 'observation mode');
  requireValue(context && identity(context.session) && identity(context.build) && Number.isSafeInteger(context.interior) && context.interior>=0 &&
    Number.isSafeInteger(context.revision) && context.revision>0 && Number.isFinite(context.nowMs) && context.nowMs>=0, 'snapshot context/revision required');
  if(mode==='historical-replay')requireValue(Number.isFinite(replayDurationMs)&&replayDurationMs>0&&replayDurationMs<=62000,'bounded historical render lease required');
  if(!groups.length)requireValue(mode==='live-snapshot' && Number.isFinite(emptyValidUntilMs) &&
    emptyValidUntilMs>context.nowMs && emptyValidUntilMs<=context.nowMs+observationLimits.liveAgeMs,'explicit bounded empty-set lease required');
  const seen=new Set(), evidence=[],surfaces=[],materials={};
  let validUntil=mode==='historical-replay'?replayDurationMs:groups.length?Infinity:emptyValidUntilMs;
  for(const group of groups) {
    const bytes=JSON.stringify(group);
    requireValue(Buffer.byteLength(bytes)<=observationLimits.bytesPerGroup,'observation byte budget');
    requireValue(group.Session===context.session&&group.Build===context.build&&group.Interior===context.interior&&!seen.has(group.Name),'mixed or duplicate observation context');
    seen.add(group.Name);
    const inspected=inspectTileGroup(group);
    requireValue(inspected.status==='candidate-inferred','unqualified surface observations: '+inspected.reasons.join('; '));
    requireValue((group.Kind==='wall'&&inspected.plane.orientation==='predominantly-vertical') ||
      (group.Kind==='ground'&&inspected.plane.orientation==='horizontal-or-gently-sloping'),'candidate orientation disagrees with kind');
    if(mode==='live-snapshot'){
      requireValue(context.nowMs>=group.FinishedMs&&context.nowMs<group.FinishedMs+observationLimits.liveAgeMs,'stale/future observation snapshot');
      validUntil=Math.min(validUntil,group.FinishedMs+observationLimits.liveAgeMs);
    }
    const patch=independentPatch(group,inspected),center=modelPoint(coordinates,observationVector(patch.Center)),normal=modelDirection(coordinates,observationVector(patch.Normal));
    const points=patch.Footprint.map(p=>modelPoint(coordinates,observationVector(p))),u=unit(sub(points[1],points[0])),v=cross(normal,u);
    let footprint=points.map(p=>{const d=sub(p,center);return [dot(d,u),dot(d,v)];});
    const area=footprint.reduce((s,a,i)=>{const b=footprint[(i+1)%footprint.length];return s+a[0]*b[1]-a[1]*b[0];},0);
    if(area<0)footprint=footprint.reverse();
    const id=patch.Id,hash=createHash('sha256').update(bytes).digest('hex');
    surfaces.push({id,coordinateSpace,center,normal,u,half:[0,1].map(i=>Math.max(...footprint.map(p=>Math.abs(p[i])))),footprint,
      motion:'unknown',reflectiveSide:'front',provenance:{kind:'derived',reference:'observed:'+hash.slice(0,40)},confidence:null,
      material:{observedId:null,observedConfidence:null,acoustic:null},version:context.revision,
      observedAt:mode==='historical-replay'?0:group.FinishedMs,validUntil:mode==='historical-replay'?replayDurationMs:group.FinishedMs+1000});
    if(materialsByKind[group.Kind]){
      requireValue((materialsByKind[group.Kind].basis??'authored-assumption')==='authored-assumption','GTA material calibration unavailable; explicit authored coefficients required');
      materials[id]=materialsByKind[group.Kind];
    }
    evidence.push({id,kind:group.Kind,inputSha256:hash,sourceIds:group.Samples.map(s=>s.Id),session:group.Session,build:group.Build,
      framework:group.Framework,interior:group.Interior,observedGeneration:group.Generation,startedMs:group.StartedMs,finishedMs:group.FinishedMs,
      originalValidUntilMs:group.FinishedMs+1000,nativeFootprint:patch.Footprint.map(observationVector),
      fit:{rmsNative:inspected.plane.rms,maxResidualNative:inspected.plane.maxResidual,positionToleranceNative:inspected.plane.maxPositionTolerance,
        maxNormalAngleDegrees:inspected.plane.maxNormalDegrees},uncertainty:{probability:null,material:'unknown',permanence:'unverified',
        extent:'inset-observed-support-only',continuity:'unmeasured-between-rays',worldCoverage:'partial'}});
  }
  const createdAt=mode==='historical-replay'?0:context.nowMs;
  // Tile expiry bounds every surface lifetime; the earliest source lease governs the snapshot.
  for(const s of surfaces)s.validUntil=validUntil;
  const tile=createTile({schemaVersion:1,id:'observed-geometry',coordinateSpace,timeUnit:'monotonic-ms',bounds:regionBounds(coordinates,region),
    listenerAnchor:modelPoint(coordinates,listenerNative),coverage:'partial',surfaces,missingRegions:[],version:context.revision,
    createdAt,validUntil,build:context.build,session:context.session,interior:'interior:'+context.interior,dynamicEpoch:context.revision});
  const observationModel={kind:'conditional-observed-model',mode,calibration:coordinates,visibilityAssumption,motionAssumption,evidence,
    timing:mode==='historical-replay'?'frozen-historical-model-not-current-world':'original-monotonic-observation-lease'};
  return acousticScene(tile,materials,{...engine,observationModel});
}

// Whole-snapshot publication for a future simulation worker. No accumulation of
// old candidates, no IO or geometry work on the PCM thread, and no stale fallback.
export class ObservedGeometryFeed {
  constructor(){this.scene=null;this.revision=0;this.failure=null;}
  publish(input){
    try{
      requireValue(input.mode===undefined||input.mode==='live-snapshot','live feed does not accept historical replay');
      requireValue(input.context.revision>this.revision,'geometry revision must advance');
      const next=observedAcousticScene(input);this.scene=next;this.revision=input.context.revision;this.failure=null;return next;
    }catch(error){this.scene=null;this.failure=error.message;throw error;}
  }
  current({session,build,interior,nowMs}){
    const t=this.scene?.tile;
    if(!t||session!==t.session||build!==t.build||'interior:'+interior!==t.interior||!Number.isFinite(nowMs)||nowMs<t.createdAt||nowMs>=t.validUntil){this.scene=null;return null;}
    return this.scene;
  }
}
