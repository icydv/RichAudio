// Offline prewarming only. The unchanged causal solver and renderer own all
// propagation/filtering; admission never solves geometry or reads a future pose.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validated, conditionalDirectScene} from '../engine/contracts.mjs';
import {CausalSimulation, StreamingRenderer} from '../streaming/causal.mjs';

export const transientLimits = Object.freeze({sampleRate:48000,channels:2,blockFrames:512,
  kernels:8,frames:24000,voices:32,descriptorQueue:128,paths:12,maximumEventObservationAgeMs:250,maximumTimestampWidthMs:2,peakPerKernel:.001});
const storage=new WeakMap(), check=(ok,why)=>{if(!ok)throw Error(why);};
const identifier=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(s);
const sha=b=>createHash('sha256').update(b).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
export function stationaryTransientPose(value){
  check(value&&Array.isArray(value.position)&&value.position.length===3&&value.position.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000),'finite event pose');
  check(value.velocity===undefined||Array.isArray(value.velocity)&&value.velocity.length===3&&value.velocity.every(x=>x===0),'prepared transient kernel requires stationary authored pose');
  check(Number.isSafeInteger(value.generation)&&value.generation>0&&value.generation<=2147483647,'event pose generation');
  const forward=value.forward??[0,1,0],up=value.up??[0,0,1];
  check([forward,up].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&Math.abs(Math.hypot(...v)-1)<1e-8)&&
    Math.abs(forward.reduce((s,x,i)=>s+x*up[i],0))<1e-8,'explicit unit event orientation');
  return freeze({position:[...value.position],velocity:[0,0,0],forward:[...forward],up:[...up],generation:value.generation});
}
export const transientPoseKey=pose=>JSON.stringify(stationaryTransientPose(pose));

// The returned branded descriptor exposes no mutable PCM. All input geometry is
// immutable/validated. These kernels model a fixed authored pose, not a promise
// about a future moving listener or unobserved native event.
export function createPreparedTransientKernel({scene=null,sceneId,sceneGeneration,session,sourcePose,listenerPose,
  frames=8192,amplitude=.001,masterGain=.7,authority}={}){
  const begin=performance.now();
  check(authority==='authored-fixture-only'&&identifier(sceneId)&&/^[a-f0-9]{32}$/.test(session)&&
    Number.isSafeInteger(sceneGeneration)&&sceneGeneration>0&&sceneGeneration<=2147483647,'explicit authored transient context');
  check(Number.isSafeInteger(frames)&&frames>=512&&frames<=transientLimits.frames&&
    Number.isFinite(amplitude)&&amplitude>0&&amplitude<=.25&&Number.isFinite(masterGain)&&masterGain>0&&masterGain<=.7,'bounded original impulse');
  const source=stationaryTransientPose(sourcePose),listener=stationaryTransientPose(listenerPose);
  const conditional=scene===null;
  if(conditional)scene=conditionalDirectScene({calibration:{basis:'declared-demonstration-scale',physicalCalibration:'unverified'},
    modelBounds:{min:[-128,-128,-16],max:[128,128,32]},listenerSession:session,contextEpoch:sceneGeneration,
    sourceId:'beacon-0',visibilityAssumption:'unobserved-space-assumed-clear',engine:{airDbPerMetre:[0,0,0]}});
  check(validated.scene(scene)&&(conditional||scene.tile),'validated authored tile or explicit null conditional context required');
  check(!scene.observationModel&&(!scene.tile||scene.tile.coverage==='complete-synthetic'&&
    scene.tile.missingRegions.length===0&&scene.tile.surfaces.every(s=>s.provenance.kind==='synthetic')),'only original authored static fixture geometry may prewarm this path');
  // Solve this time-invariant fixture at t=2.1s, so the existing causal solver
  // has actual authored stationary history for every permitted physical delay.
  const simulation=new CausalSimulation(scene);
  const snapshot=time=>({time,session,generation:1,listener,sources:[{...source,id:'beacon-0'}]});
  simulation.observe(snapshot(0));simulation.observe(snapshot(2.1));
  const solved=simulation.update(2.1,{geometryTimeMs:scene.tile?.createdAt??0});
  check(solved.paths.length>0&&solved.paths.length<=transientLimits.paths,'renderable bounded existing-engine paths required');
  const paths=solved.paths.map(p=>({id:p.id,order:p.order,distance:p.distance,delaySeconds:p.delay,delayFrames:p.delay*48000,
    bands:[...p.bands],pan:p.pan}));
  const direct=paths.find(p=>p.order===0),lastDelay=Math.max(...paths.map(p=>p.delayFrames));
  check(direct&&lastDelay+4800<frames,'kernel must retain every finite path and 100ms filter tail');
  const renderer=new StreamingRenderer({sourceIds:['beacon-0'],maxPathsPerSource:12,historyDiagnostics:true,masterGain});
  const dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512),inputs={'beacon-0':dry};
  const warmFrames=Math.ceil((scene.config.maxDelay*48000+5760)/512)*512,pcm=new Float32Array(frames*2);
  // Repeated controls below are the exact time translation of one stationary
  // solver result. They add neither a second solver nor predicted poses. A new
  // pose or camera generation needs a separately prewarmed kernel.
  const control=frame=>({...solved,frame,paths:solved.paths.map(p=>({...p,emissionFrame:frame-p.delay*48000}))});
  let rendered=0,historyAtEmission=0;
  for(let frame=0;frame<warmFrames+frames;frame+=512){
    const n=Math.min(512,warmFrames+frames-frame);dry.fill(0);if(frame===warmFrames){dry[0]=amplitude;historyAtEmission=renderer.historyDiagnostics.affectedFrames;}
    renderer.accept(control(frame));renderer.process(inputs,left,right,n);
    if(frame>=warmFrames){for(let i=0;i<n;i++){pcm[rendered*2]=left[i];pcm[rendered*2+1]=right[i];rendered++;}}
  }
  let first=-1,last=-1,firstSignificant=-1,lastSignificant=-1,peak=0,energy=0,last256Peak=0;
  const significanceThreshold=1e-10;
  for(let i=0;i<frames;i++){const p=Math.max(Math.abs(pcm[i*2]),Math.abs(pcm[i*2+1]));
    if(p!==0){if(first<0)first=i;last=i;}if(p>significanceThreshold){if(firstSignificant<0)firstSignificant=i;lastSignificant=i;}
    if(i>=frames-256)last256Peak=Math.max(last256Peak,p);peak=Math.max(peak,p);energy+=pcm[i*2]**2+pcm[i*2+1]**2;}
  check(first>=0&&lastSignificant<frames-256&&last256Peak<=significanceThreshold&&renderer.stats.limited===0&&peak<=transientLimits.peakPerKernel,
    'bounded original impulse window and residual within declared aggregate headroom');
  const requiredRoundingGuardFrames=Math.max(0,Math.ceil(direct.delayFrames)-first);check(requiredRoundingGuardFrames<=2,'unexpected pre-physical-arrival samples');
  const identity=JSON.stringify({session,sceneId,sceneGeneration,geometryKey:scene.geometryKey,source,listener,frames,amplitude,masterGain});
  const kernel=freeze({version:1,kernelId:sha(identity),session,sceneId,sceneGeneration,authority,
    sourcePose:source,listenerPose:listener,sourcePoseKey:transientPoseKey(source),listenerPoseKey:transientPoseKey(listener),
    sampleRate:48000,channels:2,frames,firstNonzeroFrame:first,lastNonzeroFrame:last,firstSignificantFrame:firstSignificant,lastSignificantFrame:lastSignificant,
    significanceThreshold,last256Peak,tailModel:'finite-window-existing-IIR-with-measured-residual',physicalDirectDelayFrames:direct.delayFrames,
    requiredRoundingGuardFrames,
    paths,geometry:conditional?'conditional-direct-unobserved-space-assumed-clear':'qualified-authored-static-fixture',
    immutableSceneWhileWorkerBusy:true,motionModel:'fixed-authored-source-and-listener-pose',amplitude,masterGain,peak,energy,
    pcmSha256:sha(Buffer.from(pcm.buffer)),preparationMs:performance.now()-begin,pcmBytes:pcm.byteLength,
    rendererSourceHistoryBytes:renderer.ownedArrayBytes,rendererLimited:renderer.stats.limited,
    kernelAffectedHistoryFrames:renderer.historyDiagnostics.affectedFrames-historyAtEmission});
  storage.set(kernel,pcm);return kernel;
}
export function copyPreparedTransientPCM(kernel,target){
  check(storage.has(kernel)&&target instanceof Float32Array&&target.length>=kernel.frames*2,'branded kernel and caller-owned PCM required');
  target.set(storage.get(kernel));return kernel.frames;
}
export const isPreparedTransientKernel=kernel=>storage.has(kernel);
