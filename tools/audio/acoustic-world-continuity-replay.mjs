// File-only replay of retained observations. No device, host process or game API.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {StockGameplay} from '../../src/acoustics/vehicle/gameplay.mjs';
import {loadStockCatalogAssets,loadStockNpcAssets} from '../../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../../src/acoustics/vehicle/installed-stock-registry.mjs';

const FS=48000,BLOCK=512,hash=b=>createHash('sha256').update(b).digest('hex');
const readRows=p=>{const stat=fs.statSync(p);if(stat.size>32*1024*1024)throw Error('Bounded retained trace required');return fs.readFileSync(p,'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);};
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[b.length>>1]:null;};
export function quietWindows(channels,{threshold=1e-6,minimumFrames=960}={}){
 const windows=[];let start=null;for(let i=0;i<=channels[0].length;i++){
  const quiet=i<channels[0].length&&Math.abs(channels[0][i])<=threshold&&Math.abs(channels[1][i])<=threshold;
  if(quiet&&start===null)start=i;if(!quiet&&start!==null){if(i-start>=minimumFrames)windows.push({startFrame:start,frames:i-start,durationMs:(i-start)*1000/FS});start=null;}
 }return windows;
}
function readFloatWave(file){
 const bytes=fs.readFileSync(file);if(bytes.length>32*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Bounded original WAV required');
 let format=null,data=null;for(let at=12;at+8<=bytes.length;){const id=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4);if(at+8+size>bytes.length)throw Error('Truncated retained WAV');if(id==='fmt ')format=bytes.subarray(at+8,at+8+size);if(id==='data')data=bytes.subarray(at+8,at+8+size);at+=8+size+(size&1);}
 if(!format||!data||format.readUInt16LE(0)!==3||format.readUInt16LE(2)!==2||format.readUInt32LE(4)!==FS||format.readUInt16LE(14)!==32||data.length%8)throw Error('Exact original Float32 stereo WAV required');
 const channels=[new Float32Array(data.length/8),new Float32Array(data.length/8)];for(let i=0;i<channels[0].length;i++){channels[0][i]=data.readFloatLE(i*8);channels[1][i]=data.readFloatLE(i*8+4);}return {channels,sha256:hash(bytes),dataSha256:hash(data),frames:channels[0].length};
}
export function loadRetainedContinuityInputs({packageRoot,captureDirectory,journalFile}){
 const manifestPath=path.join(packageRoot,'playable.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const events=readRows(journalFile),frames=new Map(events.filter(r=>r.kind==='gameplay-frame').map(r=>{const frame=JSON.parse(r.data.frameJson);return [frame.listener.sequence,frame];}));
 const diagnosticsPath=path.join(captureDirectory,'diagnostics.ndjson'),diagnostics=readRows(diagnosticsPath);
 const timings=diagnostics.filter(r=>r.type==='producer-block-timing').map(r=>r.payload),offsets=new Map();
 for(const row of timings)for(const b of row.sourceBrackets)if(b.interpolation!==null){const generation=frames.get(b.leftSequence)?.listener.generation;if(!generation)throw Error('Missing retained source bracket');
  const observation=b.leftObservationTicks+(b.rightObservationTicks-b.leftObservationTicks)*b.interpolation;
  const offset=row.sourceTargetTimeSeconds-observation/b.clockFrequency;if(!offsets.has(generation))offsets.set(generation,[]);offsets.get(generation).push(offset);
 }
 const clockOffsets=Object.fromEntries([...offsets].map(([generation,values])=>[generation,{seconds:median(values),samples:values.length,spreadMs:(Math.max(...values)-Math.min(...values))*1000}]));
 const offset=clockOffsets[1]?.seconds;if(!Number.isFinite(offset))throw Error('Recorded initial source clock mapping required');
 const deliveries=diagnostics.filter(r=>r.type==='gameplay-control-delivery').map(r=>{const frame=frames.get(r.payload.listenerSequence);if(!frame)throw Error('Missing exact retained gameplay frame');return {frame,delivery:r.payload,atSeconds:r.payload.writeAfterQpc/r.payload.qpcFrequency+offset};});
 if(deliveries.length>2400||deliveries.some((r,i)=>i&&r.atSeconds<deliveries[i-1].atSeconds))throw Error('Bounded ordered retained delivery trace required');
 const assets=loadStockCatalogAssets(path.join(packageRoot,manifest.playerManifest),{sustainAtlasFile:path.join(packageRoot,manifest.atlas)}),npcAssets=loadStockNpcAssets(path.join(packageRoot,manifest.npcManifest));
 const registry=loadInstalledStockRegistry({catalogFile:path.join(packageRoot,manifest.catalog),catalogSha256:manifest.catalogSha256,assets,npcAssets});
 const profiles=JSON.parse(fs.readFileSync(path.join(packageRoot,manifest.profiles),'utf8'));
 const settings=JSON.parse(fs.readFileSync(path.join(packageRoot,'.local/acoustic-settings.json'),'utf8'));
 const original=readFloatWave(path.join(captureDirectory,'richaudio.wav'));
 const boundaries=[...frames.values()].filter((f,i,a)=>i&&f.listener.generation!==a[i-1].listener.generation).map(f=>({sequence:f.listener.sequence,generation:f.listener.generation,observationTicks:f.listener.observationTicks,timeSeconds:f.listener.observationTicks/f.listener.clockFrequency+offset}));
 return {registry,profiles,session:deliveries[0].frame.session,deliveries,timings,clockOffsets,clockOffsetSeconds:offset,original,boundaries,settings,
  provenance:{kind:'retained-observations-with-explicitly-constructed-host-delivery-schedule',exactLiveNodeAcceptanceScheduleAvailable:false,
   schedule:'Recorded host write-after times, mapped using original generation1 clock offset; delivered before first following512-frame block. No unseen live acceptance times or PCM samples invented.',
   journalSha256:hash(fs.readFileSync(journalFile)),diagnosticsSha256:hash(fs.readFileSync(diagnosticsPath)),packageManifestSha256:hash(fs.readFileSync(manifestPath))}};
}
export async function replayGameplay({Engine=StockGameplay,inputs,continuityPolicy='baseline',latencyProfile='baseline',schedule='retained-host-delivery',collectTrace=true,jitterMs=()=>0,omitSequence=()=>false}){
 if(schedule!=='retained-host-delivery')throw Error('Explicit replay schedule required');
 const totalFrames=Math.ceil(inputs.original.frames/BLOCK)*BLOCK;if(totalFrames>FS*40)throw Error('Bounded40-second replay required');
 let wallMs=0,at=0;const engine=new Engine({registry:inputs.registry,profiles:inputs.profiles,session:inputs.session,now:()=>wallMs,latencyDiagnostics:true,latencyProfile,continuityPolicy});
 const s=inputs.settings;engine.setSettings({quality:s.acousticQuality,acceleration:'cpu',enabled:s.richAudioEnabled,volume:s.outputLevel,reflections:s.earlyReflections,mode:s.integrationMode});
 const channels=[new Float32Array(totalFrames),new Float32Array(totalFrames)],trace=[],processingMs=[],deliveries=inputs.deliveries.map(r=>({...r,atSeconds:r.atSeconds+jitterMs(r.frame.listener.sequence)/1000})).sort((a,b)=>a.atSeconds-b.atSeconds);
 const memoryBefore=process.memoryUsage().rss;let maxMemoryBytes=memoryBefore,previousSource=null,sourceChanges=0,sourceFrameRegressions=0,sourceUnavailableBlocks=0;
 try{for(let frame=0;frame<totalFrames;frame+=BLOCK){const time=frame/FS;wallMs=time*1000;
   while(at<deliveries.length&&deliveries[at].atSeconds<=time+1e-10){const r=deliveries[at++];if(omitSequence(r.frame.listener.sequence))continue;
    const hostNow=(time-inputs.clockOffsetSeconds)*r.frame.listener.clockFrequency,ageMs=(hostNow-r.frame.listener.observationTicks)*1000/r.frame.listener.clockFrequency;
    const remaining=(r.frame.validThroughTicks-hostNow)*1000/r.frame.listener.clockFrequency;if(ageMs<=250&&remaining>0)engine.accept(r.frame,Math.max(0,ageMs),remaining);
   }
   const before=performance.now(),audio=await engine.render();processingMs.push(performance.now()-before);for(let c=0;c<2;c++)channels[c].set(audio[c],frame);
   const slot=engine.slots.find(s=>s.source),source=slot?.source;if(source&&previousSource&&source!==previousSource)sourceChanges++;
   if(source&&previousSource===source&&source.frame<(trace.at(-1)?.sourceFrame??0))sourceFrameRegressions++;
   if(source)previousSource=source;if(!engine.lastTiming?.sourceBrackets.length&&frame%(8*BLOCK)===0)sourceUnavailableBlocks++;
   let brackets=engine.lastTiming?.sourceBrackets??[];
   if(collectTrace&&!engine.lastTiming){const savedCapture=engine.captureTiming,savedBrackets=engine.latencyBrackets;engine.captureTiming=true;engine.latencyBrackets=[];
    engine.vehiclesAt(engine.sample.targetTime);brackets=engine.latencyBrackets;engine.captureTiming=savedCapture;engine.latencyBrackets=savedBrackets;}
   if(collectTrace)trace.push({producerFrameStart:frame,listenerMode:engine.sample.mode,listenerGeneration:engine.sample.state?.generation??null,latestAcceptedSequence:engine.lastFrame,
    sourceFrame:source?.frame??null,sourceIdentity:slot?.identity??null,sourceBrackets:brackets,sourceTargetTimeSeconds:engine.sample.targetTime});
   if(frame%(128*BLOCK)===0)maxMemoryBytes=Math.max(maxMemoryBytes,process.memoryUsage().rss);
  }
  const bytes=Buffer.alloc(totalFrames*8);for(let i=0;i<totalFrames;i++){bytes.writeFloatLE(channels[0][i],i*8);bytes.writeFloatLE(channels[1][i],i*8+4);}
  return {channels,trace,processingMs,pcmSha256:hash(bytes),frames:totalFrames,quietWindows:quietWindows(channels),sourceChanges,sourceFrameRegressions,sourceUnavailableSampledBlocks:sourceUnavailableBlocks,
   memoryBeforeBytes:memoryBefore,maximumMemoryBytes:maxMemoryBytes,memoryAfterBytes:process.memoryUsage().rss,diagnostics:engine.diagnostics(),provenance:inputs.provenance};
 }finally{engine.close();}
}
