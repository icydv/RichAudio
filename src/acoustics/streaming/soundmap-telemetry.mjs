// Read-only presentation of the actual finite-path solver's retained results.
// No ray tracing, IO, awaited work, renderer changes or game calls occur here.
import {freeze, requireValue,validated} from '../engine/contracts.mjs';
import {coordinateSpace} from '../research/local-geometry.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {SOUND_MAP_WIRE,INSTALLED_GEOMETRY_PROFILE,geometryWireBudget,rememberPreparedGeometryEncoding} from './soundmap-wire.mjs';

export const soundMapLimits=Object.freeze({minimumFps:15,maximumFps:30,defaultFps:20,
  defaultPaths:128,maximumPaths:256,frameBytes:SOUND_MAP_WIRE.frameBytes,geometryBytes:SOUND_MAP_WIRE.compactGeometryBytes,
  installedGeometryBytes:SOUND_MAP_WIRE.installedGeometryBytes,installedSurfaces:SOUND_MAP_WIRE.installedSurfaces});
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
const copyPose=s=>s?{position:[...s.position],velocity:[...(s.velocity??[0,0,0])],forward:[...s.forward],up:[...s.up],
  valid:s.valid!==false,generation:s.generation,emitting:s.emitting!==false}:null;
const unknown=reason=>/unknown|unavailable|unconverged|outside-tile/.test(reason);
const pointOnSurface=(s,p)=>s.center.map((x,i)=>x+s.u[i]*p[0]+s.v[i]*p[1]);
const copyVector=v=>v?[...v]:null,copyPoints=p=>p?p.map(copyVector):null;

function geometrySnapshot(simulation,generation,streamId,{bodyOnly=false}={}){
  const scene=simulation.scene,tile=scene.tile,installed=scene.observationModel?.kind==='conditional-installed-static-model';
  return freeze({...(bodyOnly?{}:{schemaVersion:1,generation,streamId,sessionId:simulation.session??'uninitialised',listenerSessionId:simulation.session}),
    ...(installed?{geometryProfile:INSTALLED_GEOMETRY_PROFILE}:{}),
    coordinateSpace:tile.coordinateSpace,
    calibration:scene.observationModel?.calibration??null,coverage:tile.coverage,bounds:tile.bounds,
    clockDomain:installed?'static-installation-model':scene.observationModel?.mode==='live-snapshot'?'publisher-monotonic-ms':'model-monotonic-ms',
    createdAt:tile.createdAt,validUntil:tile.validUntil,version:tile.version,build:tile.build,interior:tile.interior,
    geometryKey:scene.geometryKey,observationModel:scene.observationModel,
    surfaces:tile.surfaces.map(s=>({id:s.id,vertices:s.footprint?s.footprint.map(p=>pointOnSurface(s,p)):s.corners,
      center:s.center,normal:s.normal,u:s.u,v:s.v,half:s.half,openings:s.openings.map(o=>({
        ...o,vertices:[[o.min[0],o.min[1]],[o.max[0],o.min[1]],[o.max[0],o.max[1]],[o.min[0],o.max[1]]].map(p=>pointOnSurface(s,p))})),
      observedAt:s.observedAt,validUntil:s.validUntil,version:s.version,motion:s.motion,reflectiveSide:s.reflectiveSide,
      provenance:s.provenance,confidence:s.confidence,material:scene.materials[s.id]??null,observedMaterial:s.material,
      acousticAccepted:true,extent:installed?'finite-native-derived-collision-support':scene.observationModel?'inset-observed-support-only':'synthetic-finite-patch'})),
    missingRegions:tile.missingRegions,unknownSpace:installed?'unsupported-unprepared-outside-workset-and-runtime-unverified':tile.coverage==='partial'?'all-space-outside-observed-patches':'explicit-missing-regions-only',
    visualContext:[]});
}

const preparedScenes=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function installedSoundMapGeometryState01(scene){return scene?.observationModel?.kind==='conditional-installed-static-model'?(preparedScenes.has(scene)?'prepared':'pending-prepared-geometry'):'not-installed-scene';}
// Called only on the persistent installed-scene worker, before it publishes the
// same scene packet. Mapping, freezing and JSON encoding stay off the producer.
export function prepareInstalledSoundMapGeometry01(scene,{requestId,bindingEpoch,packetDigest}={}){
  requireValue(validated.scene(scene)&&scene.observationModel?.kind==='conditional-installed-static-model'&&Number.isSafeInteger(requestId)&&requestId>0&&Number.isSafeInteger(bindingEpoch)&&bindingEpoch>=0&&hex(packetDigest),'Bound installed SoundMap preparation required');
  const started=performance.now(),body=Buffer.from(JSON.stringify(geometrySnapshot({scene,session:null},null,null,{bodyOnly:true})));
  requireValue(scene.tile.surfaces.length<=SOUND_MAP_WIRE.installedSurfaces&&body.length<=SOUND_MAP_WIRE.installedGeometryBytes-4096,'Prepared SoundMap geometry byte/surface budget');
  // Exact-length transferable storage avoids exposing Buffer-pool neighbours.
  const bodyBytes=new Uint8Array(body.length);bodyBytes.set(body);
  return {schema:1,kind:'RichAudioPreparedSoundMapGeometry01',geometryKey:scene.geometryKey,tileObservationKey:scene.tile.observationKey,sourceCatalogueSHA256:scene.observationModel.sourceCatalogueSHA256,requestId,bindingEpoch,packetDigest,surfaceCount:scene.tile.surfaces.length,bodySHA256:createHash('sha256').update(bodyBytes).digest('hex'),bodyBytes,preparationMilliseconds:performance.now()-started};
}
export function registerPreparedSoundMapGeometry01(scene,packet,{requestId,bindingEpoch,packetDigest,catalogSHA256}={}){
  const started=performance.now();
  requireValue(validated.scene(scene)&&scene.observationModel?.kind==='conditional-installed-static-model'&&packet?.schema===1&&packet.kind==='RichAudioPreparedSoundMapGeometry01'&&packet.geometryKey===scene.geometryKey&&packet.tileObservationKey===scene.tile.observationKey&&packet.sourceCatalogueSHA256===scene.observationModel.sourceCatalogueSHA256&&packet.sourceCatalogueSHA256===catalogSHA256&&Number.isSafeInteger(requestId)&&requestId>0&&packet.requestId===requestId&&Number.isSafeInteger(bindingEpoch)&&bindingEpoch>=0&&packet.bindingEpoch===bindingEpoch&&hex(packetDigest)&&packet.packetDigest===packetDigest&&packet.surfaceCount===scene.tile.surfaces.length&&packet.surfaceCount<=SOUND_MAP_WIRE.installedSurfaces,'Prepared SoundMap scene/request/catalogue binding mismatch');
  requireValue(packet.bodyBytes instanceof Uint8Array&&packet.bodyBytes.byteLength>2&&packet.bodyBytes.byteLength<=SOUND_MAP_WIRE.installedGeometryBytes-4096&&packet.bodyBytes[0]===123&&packet.bodyBytes[packet.bodyBytes.length-1]===125&&hex(packet.bodySHA256)&&createHash('sha256').update(packet.bodyBytes).digest('hex')===packet.bodySHA256,'Prepared SoundMap payload integrity/byte budget');
  // Own one bounded copy so a later worker-message consumer cannot mutate it.
  const bodyBytes=new Uint8Array(packet.bodyBytes);preparedScenes.set(scene,{bodyBytes,preparationMilliseconds:packet.preparationMilliseconds});
  return {registered:true,bodyBytes:bodyBytes.length,registrationMilliseconds:performance.now()-started,workerPreparationMilliseconds:packet.preparationMilliseconds};
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
    visibilityAssumption:p.visibilityAssumption??null,
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
    this.lastCaptureMs=-Infinity;this.sequence=0;this.cachedGeneration=null;this.cachedGeometry=null;this.attemptedGeneration=null;this.geometryOmission=null;
    // A fresh worker can observe the same RPH listener session while restarting
    // its sample clock and sequence. Preserve both identities independently.
    this.streamId=randomUUID();
    this.stats={published:0,throttled:0,oversizeFrames:0,oversizeGeometry:0,unpreparedGeometry:0,failures:0,omittedPaths:0,maximumGeometryBytes:0,maximumGeometryBuildMs:0,preparedGeometryPublications:0,maximumWorkerGeometryPreparationMs:0};
  }
  begin(simulation,monotonicMs=performance.now()){
    requireValue(Number.isFinite(monotonicMs),'SoundMap monotonic time');
    const due=this.enabled&&monotonicMs-this.lastCaptureMs>=1000/this.fps-1e-7;
    simulation.captureSoundMap=due;
    if(due)this.lastCaptureMs=monotonicMs;else if(this.enabled)this.stats.throttled++;
    return due;
  }
  resetGeometry(){this.cachedGeneration=null;this.cachedGeometry=null;this.attemptedGeneration=null;this.geometryOmission=null;}
  publish(simulation,control,{workerMs=null,producedAtUnixMs=Date.now()}={}){
    if(!simulation.captureSoundMap||!simulation.soundMapState)return {};
    const started=performance.now(),s=simulation.soundMapState,scene=simulation.scene;
    // A listener-only source context has no observed tile. Never publish a
    // geometry generation, lease or empty geometry snapshot for that context.
    let generation=scene?.tile?`${this.streamId}:${simulation.session??'uninitialised'}:geometry:${simulation.geometryEpoch}:${scene.geometryKey}`:null;
    let soundMapGeometry;
    if(generation!==this.attemptedGeneration){
      this.attemptedGeneration=generation;this.geometryOmission=null;const geometryStart=performance.now();
      const prepared=scene&&preparedScenes.get(scene);let g=null;
      if(prepared){const header=freeze({schemaVersion:1,generation,streamId:this.streamId,sessionId:simulation.session??'uninitialised',listenerSessionId:simulation.session});
        g=freeze({...header,geometryProfile:INSTALLED_GEOMETRY_PROFILE,geometryKey:scene.geometryKey,surfaceCount:scene.tile.surfaces.length,transportEncoding:'prepared-static-json-utf8-v1'});rememberPreparedGeometryEncoding(g,{header,bodyBytes:prepared.bodyBytes});this.stats.maximumGeometryBytes=Math.max(this.stats.maximumGeometryBytes,prepared.bodyBytes.length+bytes(header)-1);this.stats.preparedGeometryPublications++;this.stats.maximumWorkerGeometryPreparationMs=Math.max(this.stats.maximumWorkerGeometryPreparationMs,prepared.preparationMilliseconds??0);
      }else if(scene?.observationModel?.kind==='conditional-installed-static-model'){
        // Opening a viewer during an audio-only scene waits for the next
        // worker-prepared packet, including for small installed worksets.
        // Never reconstruct installed geometry on the producer as a fallback.
        this.stats.unpreparedGeometry++;this.geometryOmission={reason:'prepared-geometry-required',state:'pending',actualBytes:null,maximumBytes:SOUND_MAP_WIRE.installedGeometryBytes,actualSurfaces:scene.tile.surfaces.length,maximumSurfaces:SOUND_MAP_WIRE.installedSurfaces,profile:INSTALLED_GEOMETRY_PROFILE};generation=null;
      }else if(scene?.tile&&scene.observationModel?.kind!=='conditional-installed-static-model'&&scene.tile.surfaces.length>SOUND_MAP_WIRE.compactSurfaces){
        this.stats.oversizeGeometry++;this.geometryOmission={reason:'geometry-surface-budget',actualBytes:null,maximumBytes:SOUND_MAP_WIRE.compactGeometryBytes,actualSurfaces:scene.tile.surfaces.length,maximumSurfaces:SOUND_MAP_WIRE.compactSurfaces,profile:'compact'};generation=null;
      }else g=scene?.tile?geometrySnapshot(simulation,generation,this.streamId):null;
      if(g&&!prepared){const size=bytes(g),budget=geometryWireBudget(g);this.stats.maximumGeometryBytes=Math.max(this.stats.maximumGeometryBytes,size);
        if(size>budget.bytes||g.surfaces.length>budget.surfaces){this.stats.oversizeGeometry++;this.geometryOmission={reason:size>budget.bytes?'geometry-byte-budget':'geometry-surface-budget',actualBytes:size,maximumBytes:budget.bytes,actualSurfaces:g.surfaces.length,maximumSurfaces:budget.surfaces,profile:budget.profile};generation=null;}}
      this.cachedGeometry=generation?g:null;this.cachedGeneration=generation;
      this.stats.maximumGeometryBuildMs=Math.max(this.stats.maximumGeometryBuildMs,performance.now()-geometryStart);
      if(this.cachedGeometry)soundMapGeometry=this.cachedGeometry;
    }
    else generation=this.cachedGeneration;
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
      coordinateSpace,calibration:scene?.observationModel?.calibration??scene?.directPath?.calibration??s.coordinateContract??null,listenerObservation:s.listenerEvidence??null,
      readiness:control.readiness??null,directPath:scene?.directPath??null,
      geometryGeneration:generation,geometryEpoch:simulation.geometryEpoch,listener,sources,paths,
      settings:{engine:scene?.config??null,processing:simulation.processingSettings,acoustic:control.acoustic??null},
      performance:{workerMs,telemetryMs:null,workerTotalMs:null},geometryStatus:control.geometry??null,
      diagnostics:{reason:s.reason,ageSeconds:control.ageSeconds,solver:control.stats,unavailableSources:s.unavailableSources,
        geometryOmission:this.geometryOmission,
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
