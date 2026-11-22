// Actual existing DSP fed by reconstructed observation groups; original dry audio only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {observationCoordinates,observedAcousticScene,modelPoint} from '../src/acoustics/engine/observed-geometry.mjs';
import {trajectory,ownedSource} from '../src/acoustics/engine/contracts.mjs';
import {prepare,render} from '../src/acoustics/engine/renderer.mjs';
import {signal,wav,audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {inspectTileGroup,independentPatch,vector} from '../src/acoustics/research/tile-inspection.mjs';
import {observedInput,demonstrationCoordinates} from '../tests/fixtures/ObservedGeometry.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function drySignal(duration){
  const pcm=signal('engine',duration,{frequency:120,amplitude:.32}),burst=signal('burst',duration,{amplitude:.15});
  for(let i=0;i<pcm.length;i++){const t=i/48000,phase=t%1.5;pcm[i]=pcm[i]*(phase<.8?Math.min(1,phase/.025,(.8-phase)/.025):0)+burst[i];}
  return pcm;
}
function writeRender(output,name,input,{sourceNative=[-.3,.1,.8],listenerNative=input.listenerNative,pathOrders=[0,1,2],duration=3}={}){
  const scene=observedAcousticScene({...input,listenerNative}),dry=drySignal(duration-.3);
  const source=ownedSource({id:'original-synthetic-exhaust',pcm:dry,track:trajectory([{time:0,position:modelPoint(input.coordinates,sourceNative)}])});
  const listener=trajectory([{time:0,position:modelPoint(input.coordinates,listenerNative),forward:[-1,0,0]}]);
  const plan=prepare(scene,[source],listener,{duration,pathOrders}),pcm=render(plan,{masterGain:.7}),bytes=wav([pcm.left,pcm.right]);
  fs.writeFileSync(path.join(output,name+'.wav'),bytes,{flag:'wx'});
  const paths=plan.prepared[0].tracks.map(p=>({id:p.id,peak:p.peak,firstState:p.entries.find(Boolean)}));
  fs.writeFileSync(path.join(output,name+'-paths.json'),JSON.stringify({observationModel:plan.observationModel,paths},null,2),{flag:'wx'});
  return {file:name+'.wav',sha256:hash(bytes),metrics:audioMetrics([pcm.left,pcm.right]),limitedFrames:pcm.metrics.limitedFrames,
    pathOrders,paths:paths.map(p=>({id:p.id,delaySeconds:p.firstState.delay,distanceModelMetres:p.firstState.distance,bands:p.firstState.bands,
      evidence:p.firstState.geometryEvidence})),rejections:plan.stats.rejections};
}
export function generateObservedDemos(root,destination,{duration=3,recordedGroups=null}={}){
  const output=privateStoragePath(root,path.resolve(root,destination));
  if(fs.existsSync(output))throw Error('fresh private demo directory required');
  if(!Number.isFinite(duration)||duration<.8||duration>10)throw Error('bounded demonstration duration');
  fs.mkdirSync(output,{recursive:true});
  const input={...observedInput(),coordinates:observationCoordinates(demonstrationCoordinates(10)),mode:'historical-replay',replayDurationMs:(duration+.1)*1000};
  const report={schemaVersion:1,engine:'existing-finite-path-pcm-renderer',sourceRights:'original-generated',gameLaunched:false,
    nativeAudioChanged:false,physicalCalibration:'unverified',coordinateScale:'declared demonstration: 10 model metres/native unit; not measured GTA metres',
    visibility:'conditional on represented finite surfaces; unobserved space assumed clear',subjectiveListening:'not performed',demos:[]};
  for(const [name,orders] of [['01_direct',[0]],['02_reflections_only',[1,2]],['03_direct_and_reflections',[0,1,2]],['04_second_order_only',[2]]])
    report.demos.push(writeRender(output,name,input,{duration,pathOrders:orders}));
  const soft={...input,materialsByKind:{wall:{reflection:[.15,.02,.001],transmission:[.025,.004,.0004],reference:'authored-absorptive-wall'},
    ground:{reflection:[.1,.02,.001],reference:'authored-absorptive-ground'}}};
  report.demos.push(writeRender(output,'05_absorptive_surfaces',soft,{duration}));
  report.demos.push(writeRender(output,'06_open_reference',{...input,groups:[input.groups[1]]},{duration,listenerNative:[.3,.8,.8],pathOrders:[0]}));
  report.demos.push(writeRender(output,'07_obstructed',input,{duration,listenerNative:[.3,.8,.8],pathOrders:[0]}));
  fs.writeFileSync(path.join(output,'00_original_dry.wav'),wav([drySignal(duration-.3)]),{flag:'wx'});
  if(recordedGroups){
    if(!Array.isArray(recordedGroups)||recordedGroups.length<1||recordedGroups.length>8)throw Error('bounded recorded groups required');
    for(const g of recordedGroups){
      const inspected=inspectTileGroup(g);if(inspected.status!=='candidate-inferred')throw Error('recorded group rejected: '+inspected.reasons.join('; '));
      const patch=independentPatch(g,inspected),c=vector(patch.Center),n=vector(patch.Normal),u=patch.Footprint.map(vector)[1].map((x,i)=>x-vector(patch.Footprint[0])[i]);
      const len=Math.hypot(...u),tangent=u.map(x=>x/len),source=c.map((x,i)=>x+2*n[i]-.2*tangent[i]),listener=c.map((x,i)=>x+2*n[i]+.2*tangent[i]);
      const ps=[...patch.Footprint.map(vector),source,listener],region={minNative:[0,1,2].map(i=>Math.min(...ps.map(p=>p[i]))-1),maxNative:[0,1,2].map(i=>Math.max(...ps.map(p=>p[i]))+1)};
      const recorded={...input,groups:[g],coordinates:observationCoordinates({...demonstrationCoordinates(10),originNative:c,reference:'historical-replay-scale-assumption'}),
        region,context:{session:g.Session,build:g.Build,interior:g.Interior,revision:1,nowMs:g.FinishedMs},listenerNative:listener};
      report.demos.push({...writeRender(output,'recorded_'+g.Kind,recorded,{duration,sourceNative:source,listenerNative:listener}),
        geometry:'private recorded GTA footprint; frozen historical hypothesis',inputSha256:hash(JSON.stringify(g)),originalFinishedMs:g.FinishedMs});
    }
  }
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(output,'listen.html'),`<!doctype html><meta charset="utf-8"><title>Observed geometry through RichAudio DSP</title><style>body{font:17px system-ui;background:#121b29;color:#f2f4f7;margin:32px}article{margin:22px 0}audio{width:420px;max-width:100%}</style><h1>Observed geometry → existing acoustic renderer</h1><p>Original synthetic exhaust-like audio. Declared model scale; GTA physical calibration and materials remain unverified. No autoplay.</p>${report.demos.map(d=>`<article><strong>${d.file}</strong><p>${d.paths.length} calculated paths; ${d.geometry??'original analytic observation fixture'}</p><audio controls src="${d.file}"></audio></article>`).join('')}` ,{flag:'wx'});
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=fileURLToPath(new URL('..',import.meta.url)),input=process.argv[3];let recordedGroups=null;
  if(input){if(fs.statSync(input).size>2097152)throw Error('recorded input byte budget');recordedGroups=JSON.parse(fs.readFileSync(input,'utf8'));}
  const report=generateObservedDemos(root,process.argv[2]??'.local/observed-audio',{recordedGroups});
  console.log(JSON.stringify(report.demos.map(d=>({file:d.file,paths:d.paths.length,peak:d.metrics.peak,sha256:d.sha256})),null,2));
}
