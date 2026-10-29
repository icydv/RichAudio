// Read-only presentation of the actual finite-path solver's retained results.
// No ray tracing, IO, awaited work, renderer changes or game calls occur here.
import {freeze, requireValue} from '../engine/contracts.mjs';
import {coordinateSpace} from '../research/local-geometry.mjs';
import {randomUUID} from 'node:crypto';

export const soundMapLimits=Object.freeze({minimumFps:15,maximumFps:30,defaultFps:20,
  defaultPaths:128,maximumPaths:256,frameBytes:262144,geometryBytes:524288});
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
const copyPose=s=>s?{position:[...s.position],velocity:[...(s.velocity??[0,0,0])],forward:[...s.forward],up:[...s.up],
  valid:s.valid!==false,generation:s.generation,emitting:s.emitting!==false}:null;
const unknown=reason=>/unknown|unavailable|unconverged|outside-tile/.test(reason);
const pointOnSurface=(s,p)=>s.center.map((x,i)=>x+s.u[i]*p[0]+s.v[i]*p[1]);
const copyVector=v=>v?[...v]:null,copyPoints=p=>p?p.map(copyVector):null;

function geometrySnapshot(simulation,generation,streamId){
  const scene=simulation.scene,tile=scene.tile;
  return freeze({schemaVersion:1,generation,streamId,sessionId:simulation.session??'uninitialised',listenerSessionId:simulation.session,
    coordinateSpace:tile.coordinateSpace,
    calibration:scene.observationModel?.calibration??null,coverage:tile.coverage,bounds:tile.bounds,
    clockDomain:scene.observationModel?.mode==='live-snapshot'?'publisher-monotonic-ms':'model-monotonic-ms',
    createdAt:tile.createdAt,validUntil:tile.validUntil,version:tile.version,build:tile.build,interior:tile.interior,
    geometryKey:scene.geometryKey,observationModel:scene.observationModel,
    surfaces:tile.surfaces.map(s=>({id:s.id,vertices:s.footprint?s.footprint.map(p=>pointOnSurface(s,p)):s.corners,
      center:s.center,normal:s.normal,u:s.u,v:s.v,half:s.half,openings:s.openings.map(o=>({
        ...o,vertices:[[o.min[0],o.min[1]],[o.max[0],o.min[1]],[o.max[0],o.max[1]],[o.min[0],o.max[1]]].map(p=>pointOnSurface(s,p))})),
      observedAt:s.observedAt,validUntil:s.validUntil,version:s.version,motion:s.motion,reflectiveSide:s.reflectiveSide,
      provenance:s.provenance,confidence:s.confidence,material:scene.materials[s.id]??null,observedMaterial:s.material,
      acousticAccepted:true,extent:scene.observationModel?'inset-observed-support-only':'synthetic-finite-patch'})),
    missingRegions:tile.missingRegions,unknownSpace:tile.coverage==='partial'?'all-space-outside-observed-patches':'explicit-missing-regions-only',
    visualContext:[]});
}

function pathSnapshot(trace,selected){
  const {plan,candidate,result:p,sourceId,identity,reason}=trace;
  const chosen=identity!==null&&selected.has(identity),status=chosen?'selected':identity?'pruned':unknown(reason)?'unknown':'rejected';
  // Unavailable endpoints/contact points remain null. Never draw a guessed ray
  // from the current source in place of the solver's retarded emission pose.
  const vertices=plan.geometry?.vertices??(p.status==='renderable'?[plan.state.position,...p.points,plan.listener.position]:null);
  const obstructed=/blocked|transmission/.test(p.status+' '+(p.visibility??''));
  return {id:identity??sourceId+':'+candidate.id,sourceId,candidateId:candidate.id,status,solverStatus:p.status,
    reason:chosen?null:reason,order:candidate.surfaces.length,surfaceIds:candidate.surfaces.map(s=>s.id),
    propagation:unknown(reason)&&!chosen?'unavailable':obstructed?'obstructed':candidate.surfaces.length?'reflected':'direct',
    vertices:copyPoints(vertices),points:copyPoints(p.points??plan.geometry?.points),obstructionHits:p.hits?.length?structuredClone(p.hits):[],
    sourceAtEmission:copyVector(plan.state?.position),listenerAtArrival:copyVector(plan.listener?.position),
    emissionTimeSeconds:p.emissionTime??plan.emission??null,arrivalTimeSeconds:p.arrivalTime??plan.arrivalTime??null,
    delay:p.delay??null,distance:p.distance??null,bands:copyVector(p.bands),pan:p.pan??null,
    arrivalDirection:copyVector(p.arrivalDirection),emissionDirection:copyVector(p.emissionDirection),
    materialBasis:(p.materialBasis??[]).map(m=>({...m})),visibility:p.visibility??null,geometryEvidence:p.geometryEvidence??null,
    generation:p.generation??null,rate:chosen?selected.get(identity).rate:null};
}

export class SoundMapTelemetry {
  constructor(configuration={}){
    if(configuration===true)configuration={enabled:true};
    requireValue(configuration&&typeof configuration==='object','SoundMap options');
    this.enabled=configuration.enabled===true;this.fps=configuration.fps??soundMapLimits.defaultFps;
    this.maxPaths=configuration.maxPaths??soundMapLimits.defaultPaths;
    requireValue(Number.isFinite(this.fps)&&this.fps>=15&&this.fps<=30&&Number.isInteger(this.maxPaths)&&
      this.maxPaths>=1&&this.maxPaths<=soundMapLimits.maximumPaths,'SoundMap bounded refresh/path settings');
    this.lastCaptureMs=-Infinity;this.sequence=0;this.cachedGeneration=null;this.cachedGeometry=null;
    // A fresh worker can observe the same RPH listener session while restarting
    // its sample clock and sequence. Preserve both identities independently.
    this.streamId=randomUUID();
    this.stats={published:0,throttled:0,oversizeFrames:0,oversizeGeometry:0,failures:0,omittedPaths:0};
  }
  begin(simulation,monotonicMs=performance.now()){
    requireValue(Number.isFinite(monotonicMs),'SoundMap monotonic time');
    const due=this.enabled&&monotonicMs-this.lastCaptureMs>=1000/this.fps-1e-7;
    simulation.captureSoundMap=due;
    if(due)this.lastCaptureMs=monotonicMs;else if(this.enabled)this.stats.throttled++;
    return due;
  }
  resetGeometry(){this.cachedGeneration=null;this.cachedGeometry=null;}
  publish(simulation,control,{workerMs=null,producedAtUnixMs=Date.now()}={}){
    if(!simulation.captureSoundMap||!simulation.soundMapState)return {};
    const started=performance.now(),s=simulation.soundMapState,scene=simulation.scene;
    let generation=scene?`${this.streamId}:${simulation.session??'uninitialised'}:geometry:${simulation.geometryEpoch}:${scene.geometryKey}`:null;
    let soundMapGeometry;
    if(generation!==this.cachedGeneration){
      const g=scene?geometrySnapshot(simulation,generation,this.streamId):null;
      if(g&&bytes(g)>soundMapLimits.geometryBytes){this.stats.oversizeGeometry++;generation=null;}
      this.cachedGeometry=generation?g:null;this.cachedGeneration=generation;
      if(this.cachedGeometry)soundMapGeometry=this.cachedGeometry;
    }
    const selected=new Map(control.paths.map(p=>[p.id,p])),traces=s.candidates;
    // Audio-selected paths have precedence when the bounded view omits others.
    const ordered=[...traces.filter(p=>selected.has(p.identity)),...traces.filter(p=>!selected.has(p.identity))];
    let paths=ordered.slice(0,this.maxPaths).map(p=>pathSnapshot(p,selected));
    const totals={selected:control.paths.length,pruned:traces.filter(p=>p.identity&&!selected.has(p.identity)).length,
      rejected:traces.filter(p=>!p.identity&&!unknown(p.reason)).length,unknown:traces.filter(p=>!p.identity&&unknown(p.reason)).length};
    const current=s.latest,listener=copyPose(s.listener??current?.listener);
    if(listener&&!s.listener)listener.valid=false;
    if(listener&&control.geometry?.mode==='unavailable-pose')listener.valid=false;
    const present=new Map(s.sources.map(p=>[p.id,p]));
    const sources=Object.entries(current?.sources??{}).map(([id,p])=>({id,...copyPose(present.get(id)??p),
      valid:present.has(id)&&p.valid!==false,generation:control.sourceGenerations[id]??p.generation}));
    const frame={schemaVersion:1,streamId:this.streamId,sessionId:simulation.session??'uninitialised',listenerSessionId:simulation.session,
      sequence:++this.sequence,audioFrame:control.frame,
      producedAtUnixMs,arrivalTimeSeconds:s.now,observationTimeSeconds:current?.time??null,geometryTimeMs:s.geometryTimeMs,
      coordinateSpace,calibration:scene?.observationModel?.calibration??s.coordinateContract??null,listenerObservation:s.listenerEvidence??null,
      geometryGeneration:generation,geometryEpoch:simulation.geometryEpoch,listener,sources,paths,
      settings:{engine:scene?.config??null,processing:simulation.processingSettings,acoustic:control.acoustic??null},
      performance:{workerMs,telemetryMs:null,workerTotalMs:null},geometryStatus:control.geometry??null,
      diagnostics:{reason:s.reason,ageSeconds:control.ageSeconds,solver:control.stats,unavailableSources:s.unavailableSources,
        candidateTotals:totals,omittedPaths:ordered.length-paths.length,omittedSelectedPaths:Math.max(0,control.paths.length-paths.length),
        telemetry:{...this.stats},audioDeadlineFailures:null,audioDeadlineEvidence:'reported-by-producer-and-host'}};
    let size=bytes(frame);
    // Deterministic byte budget, independent of scene complexity. This operation
    // is outside the audio callback and never waits for a transport consumer.
    while(size>soundMapLimits.frameBytes-1024&&paths.length){
      paths=paths.slice(0,Math.floor(paths.length/2));frame.paths=paths;
      frame.diagnostics.omittedPaths=ordered.length-paths.length;
      frame.diagnostics.omittedSelectedPaths=Math.max(0,control.paths.length-paths.length);size=bytes(frame);
    }
    if(size>soundMapLimits.frameBytes-1024){this.stats.oversizeFrames++;return {soundMapDiagnostic:{schemaVersion:1,reason:'frame-byte-budget',stats:{...this.stats}}};}
    this.stats.omittedPaths+=frame.diagnostics.omittedPaths;this.stats.published++;
    frame.performance.telemetryMs=performance.now()-started;
    frame.performance.workerTotalMs=workerMs===null?null:workerMs+frame.performance.telemetryMs;frame.diagnostics.telemetry={...this.stats};
    return {soundMapFrame:frame,...(soundMapGeometry?{soundMapGeometry}:{})};
  }
  failure(error){this.stats.failures++;return {soundMapDiagnostic:{schemaVersion:1,reason:String(error?.message??error).slice(0,240),stats:{...this.stats}}};}
}
