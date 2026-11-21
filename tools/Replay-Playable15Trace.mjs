// Private offline replay of the already captured PLAYABLE-14 attempt-5 frames.
// Uses original QPC observations/publication order and the existing calibrated
// source/acoustic engine. No game, endpoint, host, playback or recorder access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const need=(condition,reason)=>{if(!condition)throw Error(reason);};
const eventsSha='ccc42324d3df383ab8ea1dab8113424a14edc2d21bff5852a57b4aac68935eed';
const rawSha='07aa9006bf6265c4a06dd0d058d61140e9c118f45aac6c40b194412c5821a3bd';
const manifestSha='c4406978e5f97384f4b3ddab26ebbecfd67529a9665d021419275b90c785f750';
const inside=(base,relative)=>{const p=path.resolve(base,relative);need(p.startsWith(base+path.sep),'Path escaped private package');return p;};
function noLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'Linked path refused');if(path.dirname(p)===p)break;}}
const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor((a.length-1)*p))]:0;
function analyse(channels,frameBlocks){
 const [left,right]=channels,metrics=audioMetrics(channels),steps=[],boundarySteps=[],updateSteps=[];
 let first=-1,last=-1,sumL=0,sumR=0,energyL=0,energyR=0,cross=0,monoEnergy=0,longest=0,run=0,runStart=0;
 const gaps=[];
 for(let i=0;i<left.length;i++){
  const l=left[i],r=right[i];sumL+=l;sumR+=r;energyL+=l*l;energyR+=r*r;cross+=l*r;monoEnergy+=(l+r)*(l+r)/4;
  if(l!==0||r!==0){if(first<0)first=i;last=i;if(run>=240)gaps.push({startFrame:runStart,frames:run});longest=Math.max(longest,run);run=0;}else{if(!run)runStart=i;run++;}
  if(i){const step=Math.max(Math.abs(l-left[i-1]),Math.abs(r-right[i-1]));steps.push(step);if(i%512===0){boundarySteps.push(step);if(frameBlocks.has(i/512))updateSteps.push(step);}}
 }
 if(run>=240)gaps.push({startFrame:runStart,frames:run});longest=Math.max(longest,run);
 const n=left.length,cov=cross-sumL*sumR/n,varL=energyL-sumL*sumL/n,varR=energyR-sumR*sumR/n;
 const rmsWindows=[];for(let at=0;at<n;at+=2400){let energy=0;const end=Math.min(n,at+2400);for(let i=at;i<end;i++)energy+=left[i]**2+right[i]**2;rmsWindows.push(Math.sqrt(energy/((end-at)*2)));}
 return {...metrics,firstNonzeroFrame:first,lastNonzeroFrame:last,longestExactlyZeroRunFrames:longest,
  exactlyZeroGapsAtLeast5Ms:gaps,dc:[sumL/n,sumR/n],rms50MsMinimum:Math.min(...rmsWindows),rms50MsMedian:percentile(rmsWindows,.5),
  adjacentStepP999:percentile(steps,.999),maximumBlockBoundaryStep:Math.max(...boundarySteps),maximumFrameDeliveryBoundaryStep:Math.max(...updateSteps),
  stereoCorrelation:cov/Math.sqrt(varL*varR),monoRms:Math.sqrt(monoEnergy/n),monoToStereoRmsRatio:Math.sqrt(monoEnergy/n)/metrics.rms,
  phaseInterpretation:'Numerical stereo/mono measurements only; source coherence and panning affect correlation. No human listening or phase-quality judgment inferred.'};
}

export async function replayPlayable15(output){
 output=path.resolve(root,output);need(output.startsWith(path.join(root,'.local','playable-15')+path.sep)&&!fs.existsSync(output),'New private PLAYABLE-15 output required');noLinks(output);
 const capture=path.join(root,'.local','playable-14','live-05','capture'),events=path.join(capture,'events.ndjson'),raw=path.join(capture,'source-records.bin');
 const packageRoot=path.join(root,'.local','playable-13','build-05','package'),manifestFile=path.join(packageRoot,'playable.json');
 for(const file of [events,raw,manifestFile])noLinks(file);
 need(digest(events)===eventsSha&&digest(raw)===rawSha&&digest(manifestFile)===manifestSha,'Original captured trace or private package differs');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 need(manifest.calibration.exhaustToEngine===10&&manifest.calibration.commonSourceHeadroomTrim===.25&&manifest.calibration.masterGain===.175,'Accepted calibration required');
 const bindings=manifest.bindings.map(b=>({path:inside(packageRoot,b.file),sha256:b.sha256}));
 for(const b of bindings){noLinks(b.path);need(digest(b.path)===b.sha256,'Private package binding differs');}
 const sourceFiles=[];function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())collect(p);else if(entry.name.endsWith('.mjs'))sourceFiles.push({path:p,sha256:digest(p)});}}
 collect(path.join(root,'src','acoustics'));sourceFiles.push({path:fileURLToPath(import.meta.url),sha256:digest(fileURLToPath(import.meta.url))});
 const rows=fs.readFileSync(events,'utf8').trim().split(/\r?\n/).map(s=>JSON.parse(s));
 const frames=rows.filter(r=>r.kind==='gameplay-frame').map(r=>({hostQpc:r.hostQpc,frame:JSON.parse(r.data.frameJson),lineage:r.data.lineage}));
 need(frames.length===670,'Expected all 670 genuine published frames');
 const session=frames[0].frame.session,frequency=frames[0].frame.listener.clockFrequency,origin=frames[0].hostQpc;
 need(frequency===10000000&&frames.every((r,i)=>r.frame.session===session&&r.frame.listener.sequence===i&&r.frame.listener.clockFrequency===frequency&&r.frame.vehicles.length===1&&r.frame.vehicles[0].model===4180675781&&r.frame.vehicles[0].context==='player'&&r.hostQpc>=r.frame.listener.observationTicks&&r.hostQpc<r.frame.validThroughTicks&&(!i||r.hostQpc>frames[i-1].hostQpc&&r.frame.listener.observationTicks>frames[i-1].frame.listener.observationTicks)),'Original Bati frame ordering/identity/freshness');
 const assets=loadStockCatalogAssets(inside(packageRoot,manifest.playerManifest),{sustainAtlasFile:inside(packageRoot,manifest.atlas)}),npcAssets=loadStockNpcAssets(inside(packageRoot,manifest.npcManifest));
 const registry=loadInstalledStockRegistry({catalogFile:inside(packageRoot,manifest.catalog),catalogSha256:manifest.catalogSha256,assets,npcAssets});
 const profiles=JSON.parse(fs.readFileSync(inside(packageRoot,manifest.profiles),'utf8'));
 registry.createSource(4180675781,'player');
 let wall=0;const engine=new StockGameplay({registry,profiles,session,now:()=>wall});
 engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 const finalExpiryMs=(frames.at(-1).frame.validThroughTicks-origin)*1000/frequency;
 const blocks=Math.ceil((finalExpiryMs+1000)*48/512),channels=[new Float32Array(blocks*512),new Float32Array(blocks*512)];
 const frameBlocks=new Set(),modes={},activeGaps=[];let next=0,maximumAdmissionQuantisationMs=0,gap=null,finalDiagnostics;
 try{
  for(let block=0;block<blocks;block++){
   wall=block*512000/48000;const ticks=origin+wall*frequency/1000;
   while(next<frames.length&&frames[next].hostQpc<=ticks){
    const r=frames[next++],age=(ticks-r.frame.listener.observationTicks)*1000/frequency,remaining=(r.frame.validThroughTicks-ticks)*1000/frequency;
    need(age>=0&&age<=250&&remaining>0,'Original frame expired before bounded offline delivery');
    engine.accept(r.frame,age,remaining);frameBlocks.add(block);maximumAdmissionQuantisationMs=Math.max(maximumAdmissionQuantisationMs,(ticks-r.hostQpc)*1000/frequency);
   }
   const rendered=await engine.render();for(let c=0;c<2;c++)channels[c].set(rendered[c],block*512);
   const mode=engine.sample?.mode??'none';modes[mode]=(modes[mode]??0)+1;
   if(!engine.slots.some(s=>s.identity)&&next>0&&next<frames.length){if(gap===null)gap=block;}else if(gap!==null){activeGaps.push({startBlock:gap,blocks:block-gap});gap=null;}
   if(block%512===0)process.stderr.write(JSON.stringify({type:'offline-trace-progress',blocks:block,totalBlocks:blocks,deliveredFrames:next})+'\n');
  }
  finalDiagnostics=engine.diagnostics();need(next===670&&finalDiagnostics.acceptedFrames===670&&finalDiagnostics.rejectedFrames===0,'All genuine frames must be consumed exactly once');
  need(finalDiagnostics.active===0,'Original source must retire after final captured lease');
 }finally{engine.close();}
 const metrics=analyse(channels,frameBlocks);need(metrics.peak>0&&metrics.nonfiniteSamples===0&&metrics.clippedSamples===0,'Finite nonzero unclipped offline PCM required');
 for(const b of bindings)need(digest(b.path)===b.sha256,'Private package changed during replay');
 for(const s of sourceFiles)need(digest(s.path)===s.sha256,'Renderer source changed during replay');
 need(digest(events)===eventsSha&&digest(raw)===rawSha,'Original capture changed during replay');
 fs.mkdirSync(output,{recursive:true});const filename='bati-genuine-playable14-attempt5.wav',wav=encodeVehicleWav(channels);fs.writeFileSync(path.join(output,filename),wav,{flag:'wx'});
 const report={schema:1,profile:'PLAYABLE-15',kind:'offline-genuine-trace-replay',sourceAttempt:5,traceFrames:670,
  eventsSha256:eventsSha,sourceRecordsSha256:rawSha,packageManifestSha256:manifestSha,packageBindingsVerified:bindings.length,
  sourceCode:sourceFiles.map(s=>({file:path.relative(root,s.path).replaceAll('\\','/'),sha256:s.sha256})),
  inputTiming:{clock:'Original host QPC; listener/source acquisition ticks and values unchanged',frequency,
   listenerObservationSpanSeconds:(frames.at(-1).frame.listener.observationTicks-frames[0].frame.listener.observationTicks)/frequency,
   publicationSpanSeconds:(frames.at(-1).hostQpc-origin)/frequency,
   scheduling:'Deliver each recorded gameplay-frame at the first 512-frame render boundary at or after its actual journal-admission QPC; no future observation admitted',
   maximumAdmissionQuantisationMs,allFramesOriginalOrder:true,observationsAltered:false,operatingValuesInvented:false},
  calibration:manifest.calibration,settings:{quality:'balanced',acceleration:'cpu',volume:1,mode:'experimental-additive'},
  output:{filename,sha256:createHash('sha256').update(wav).digest('hex'),bytes:wav.length,sampleRate:48000,channels:2,encoding:'IEEE-float32 WAV lossless to original rendered float32',frames:channels[0].length,seconds:channels[0].length/48000},
  metrics,playoutModes:modes,sourceInactiveIntervalsDuringCapture:activeGaps,finalDiagnostics,
  gameLaunched:false,endpointOpened:false,audioPlayed:false,recordingStarted:false,humanListeningPerformed:false,
  limits:['Offline replay, not live GTA playback or a recording of GTA sound.','Original operating point drives the existing authored source mapping; no measured physical RPM/throttle/load claimed.','Only captured valid published frames exist: the rejected 671st camera observation cannot be recreated.','Conditional direct acoustics with existing one-metre-per-native-unit assumption; no new geometry invented.','Original sparse observation intervals, receipt ages, source expiry and existing 50 ms prediction ceiling remain active; any resulting gaps are retained.','Source phases are initialised by the existing engine at replay start, not retained phases from GTA.','Numerical clipping/gap/step/stereo metrics do not prove perceptual sound quality.']};
 fs.writeFileSync(path.join(output,'replay-report.json'),JSON.stringify(report,null,2),{flag:'wx'});
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 need(process.argv.length===3,'Usage: node tools/Replay-Playable15Trace.mjs .local/playable-15/new-replay-directory');
 const r=await replayPlayable15(process.argv[2]);console.log(JSON.stringify({profile:r.profile,kind:r.kind,traceFrames:r.traceFrames,output:r.output,metrics:r.metrics,playoutModes:r.playoutModes,endpointOpened:false}));
}
