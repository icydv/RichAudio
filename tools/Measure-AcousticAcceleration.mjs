// Original-signal, device-free comparison of the actual acoustic core backends.
// This driver never opens an endpoint, game device, process or stock audio source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash,randomUUID} from 'node:crypto';
import {scenario} from './acoustics-08-2-scenes.mjs';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {AcousticAcceleration} from '../src/acoustics/streaming/acoustic-backend.mjs';
import {qualityPresets,qualityReflectors} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {StartupGate} from '../src/acoustics/streaming/startup-gate.mjs';
import {audioMetrics,wav} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';

const FS=48000,BLOCK=512,PERIOD_MS=BLOCK*1000/FS;
const repoRoot=fileURLToPath(new URL('..',import.meta.url));
const requireValue=(ok,why)=>{if(!ok)throw Error(why);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const usage=()=>process.cpuUsage();
const used=start=>{const x=process.cpuUsage(start);return (x.user+x.system)/1000;};
const total=d=>d.taskCpuMs??d.cpuTaskCpuMs??null;
const summary=values=>{const s=values.filter(Number.isFinite).sort((a,b)=>a-b);return {count:s.length,
  median:s.length?s[Math.floor(s.length*.5)]:null,p95:s.length?s[Math.min(s.length-1,Math.floor(s.length*.95))]:null,max:s.at(-1)??null};};
const delta=(end,start,key)=>(end[key]??0)-(start[key]??0);
function digest(channels){const b=Buffer.alloc(channels[0].length*8);for(let i=0;i<channels[0].length;i++){
  b.writeFloatLE(channels[0][i],i*8);b.writeFloatLE(channels[1][i],i*8+4);}return createHash('sha256').update(b).digest('hex');}
function difference(a,b){let energy=0,maximum=0,mismatches=0;
  for(let c=0;c<2;c++)for(let i=0;i<a[c].length;i++){const d=Math.abs(a[c][i]-b[c][i]);maximum=Math.max(maximum,d);energy+=d*d;mismatches+=Number(d!==0);}
  return {exact:mismatches===0,mismatchedSamples:mismatches,maximumAbsolute:maximum,rms:Math.sqrt(energy/(a[0].length*2))};}
async function settle(backend,boundMs=150){const start=performance.now();while(backend.busy&&performance.now()-start<boundMs)await sleep(1);
  requireValue(!backend.busy,'Bounded shadow calibration did not settle');}

async function warm(backend,f,quality){
  const began=performance.now(),cpu=usage();
  if(backend.requested!=='cpu')await backend.ready();
  const sim=new CausalSimulation(f.scene),initial=quality==='runtime-switch'?'performance':quality;
  sim.setProcessingSettings({pathBudget:qualityPresets[initial],maxReflectors:qualityReflectors[initial]});
  const renderer=new StreamingRenderer({sourceIds:f.sourceIds,maxPathsPerSource:qualityPresets[initial],pathCapacityPerSource:64}),
    dry=Object.fromEntries(f.sourceIds.map(id=>[id,new Float32Array(BLOCK).fill(.01)])),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK);
  for(let tick=0;tick<=50;tick++)sim.observe(f.snapshot(tick/50));
  // These are actual equal-work task samples, explicitly outside the measured
  // PCM interval. Fresh simulation/renderer instances below preserve comparison.
  for(let i=0;i<3;i++){
    const control=await sim.updateAccelerated(1+i*.01,{},backend);await settle(backend);
    if(i===0)for(const [id,generation]of Object.entries(control.sourceGenerations))renderer.setSourceGeneration(id,generation);
    while(renderer.frame<control.frame)renderer.process(dry,left,right,BLOCK);
    renderer.accept(control);renderer.process(dry,left,right,BLOCK);
  }
  // Auto may deliberately back off after an unprofitable or cold probe. Let its
  // real monotonic cooldown elapse once; do not manipulate its clock or choice.
  const before=backend.diagnostics();
  if(backend.requested==='auto'&&before.gpuCapability==='hardware-directcompute'&&!before.autoGpuQualified&&
    (before.lastCalibration||before.deadlineMisses)){
    await sleep(2050);
    for(let i=0;i<3;i++){await sim.updateAccelerated(1.03+i*.01,{},backend);await settle(backend);}
  }
  return {wallMs:performance.now()-began,nodeProcessCpuMs:used(cpu),diagnostics:backend.diagnostics()};
}

async function runCase(f,{name,quality,mode,blocks,directory}){
  const caseStartedAtUtc=new Date().toISOString(),backend=new AcousticAcceleration({mode,deadlineMs:8}),caseStart=performance.now(),caseCpu=usage();
  try{
    const warmup=await warm(backend,f,quality),before=backend.diagnostics();
    const helperStart=backend.lastHelperCpu??0;
    const sim=new CausalSimulation(f.scene),renderer=new StreamingRenderer({sourceIds:f.sourceIds,pathCapacityPerSource:64,
      historyDiagnostics:true,generationReleaseGuard:true}),gate=new StartupGate();
    const channels=[new Float32Array(blocks*BLOCK),new Float32Array(blocks*BLOCK)],
      left=new Float32Array(BLOCK),right=new Float32Array(BLOCK),dry=Object.fromEntries(f.sourceIds.map(id=>[id,new Float32Array(BLOCK)])),
      phase=new Float64Array(f.sourceIds.length),worker=[],taskWall=[],taskCpu=[],dsp=[],gpuExecution=[],gpuSubmit=[],gpuTransfer=[],gpuReadback=[],roundTrips=[],pathCounts=[],
      sourceIdentities=new Set(),orders=new Set(),activeBackends={cpu:0,gpu:0},qualityTimeline=[];
    const fingerprint=createHash('sha256');let gain=0,firstActive=null,steadyWindows=0,workerMisses=0,blockMisses=0,previousQuality=null,maximumRss=process.memoryUsage().rss;
    const sourceRings=renderer.sourceList.map(s=>s.bands.map(b=>b.buffer));
    const measuredStartedAtUtc=new Date().toISOString(),measuredStart=performance.now(),measuredCpu=usage();
    for(let b=0;b<blocks;b++){
      const frame=b*BLOCK,now=frame/FS,blockStart=performance.now(),selected=quality==='runtime-switch'
        ?(now<.55?'performance':now<1.05?'max':'performance'):quality;
      if(selected!==previousQuality){
        sim.setProcessingSettings({pathBudget:qualityPresets[selected],maxReflectors:qualityReflectors[selected]});renderer.setPathBudget(qualityPresets[selected]);
        qualityTimeline.push({frame,quality:selected,pathBudget:qualityPresets[selected]});previousQuality=selected;
      }
      const snapshot=f.snapshot(now);snapshot.emitting=now>=.3;
      for(const s of snapshot.sources)s.emitting=snapshot.emitting;
      sim.observe(snapshot);
      const simulationStart=performance.now(),control=await sim.updateAccelerated(now,{},backend),simulationMs=performance.now()-simulationStart;
      const diagnostic=backend.diagnostics();worker.push(simulationMs);workerMisses+=Number(simulationMs>PERIOD_MS);
      activeBackends[diagnostic.activeAcceleration]++;taskWall.push(diagnostic.taskWallMs);taskCpu.push(total(diagnostic));
      if(diagnostic.activeAcceleration==='gpu'){
        gpuExecution.push(diagnostic.gpuExecutionMs);gpuSubmit.push(diagnostic.gpuSubmitMs);gpuTransfer.push(diagnostic.gpuTransferMs);
        gpuReadback.push(diagnostic.gpuReadbackMs);roundTrips.push(diagnostic.gpuRoundTripMs);
      }
      renderer.accept(control);for(const g of Object.values(control.sourceGenerations))sourceIdentities.add(g);
      pathCounts.push(control.paths.length);for(const p of control.paths)orders.add(p.order);
      if(control.paths.length&&firstActive===null)firstActive=frame;
      const ready=renderer.historyReady(control);
      if(!snapshot.emitting&&gate.readyFrame===null){gate.reset(frame);gate.status='idle';}
      else if(snapshot.emitting&&gate.status==='idle')gate.reset(frame);
      gate.update(frame,ready);requireValue(gate.status!=='deadline-expired','Benchmark startup priming deadline');
      for(let j=0;j<BLOCK;j++){
        gain+=(Number(snapshot.emitting)*.22-gain)*(1-Math.exp(-1/(.01*FS)));
        for(let i=0;i<f.sourceIds.length;i++){
          phase[i]=(phase[i]+2*Math.PI*(95+i*7)/FS)%(2*Math.PI);
          dry[f.sourceIds[i]][j]=gain*(Math.sin(phase[i])+.35*Math.sin(2*phase[i])+.15*Math.sin(3*phase[i]))/1.5;
        }
      }
      const dspStart=performance.now();renderer.process(dry,left,right,BLOCK);gate.apply(left,right,frame,ready);dsp.push(performance.now()-dspStart);
      channels[0].set(left,frame);channels[1].set(right,frame);
      if(now>.7&&now<blocks*BLOCK/FS-.05&&control.paths.length&&gate.status==='ready'){
        let energy=0;for(let i=0;i<BLOCK;i++)energy+=left[i]*left[i]+right[i]*right[i];
        requireValue(energy>1e-12,'Unexpected silence in a valid steady-state interval');steadyWindows++;
      }
      fingerprint.update(JSON.stringify({frame,sourceGenerations:control.sourceGenerations,paths:control.paths}));
      blockMisses+=Number(performance.now()-blockStart>PERIOD_MS);
      if(b%16===0)maximumRss=Math.max(maximumRss,process.memoryUsage().rss);
      // Normal event-loop service, not a simulated GPU clock or audio-buffer
      // increase. Auto's shadow calibration is intentionally nonblocking.
      await turn();
    }
    await settle(backend);
    const measuredWallMs=performance.now()-measuredStart,nodeProcessCpuMs=used(measuredCpu),after=backend.diagnostics(),
      helperCpuMs=Math.max(0,(backend.lastHelperCpu??helperStart)-helperStart),combinedCpuMs=nodeProcessCpuMs+helperCpuMs,metrics=audioMetrics(channels);
    const gpuResultsApplied=delta(after,before,'gpuResultsApplied'),gpuAcousticDispatches=delta(after,before,'gpuAcousticDispatches');
    requireValue(metrics.nonfiniteSamples===0&&metrics.clippedSamples===0,'Finite unclipped stereo PCM required');
    requireValue(metrics.maximumAdjacentStep<.02,'Harmonic comparison continuity bound');
    requireValue(renderer.stats.limited===0&&renderer.stats.pathOverflow===0&&renderer.stats.cursorResets===0,'Bounded continuity/limiter contract');
    requireValue(renderer.historyDiagnostics.affectedFrames===0&&sim.stats.resets===1&&sourceIdentities.size===1,'Source history continuity');
    requireValue(steadyWindows>0,'A valid steady-state window was not reached');
    for(let i=0;i<sourceRings.length;i++)for(let band=0;band<3;band++)requireValue(renderer.sourceList[i].bands[band].buffer===sourceRings[i][band],'Source history was reallocated');
    const result={name,quality,requestedAcceleration:mode,caseStartedAtUtc,measuredStartedAtUtc,measuredEndedAtUtc:new Date().toISOString(),frames:blocks*BLOCK,blocks,sourceCount:f.sourceIds.length,
      surfaces:f.scene.tile.surfaces.length,description:f.description,warmup,
      measuredWallMs,nodeProcessCpuMs,helperCpuMs,combinedCpuMs,
      cpuPercentOneCore:combinedCpuMs/measuredWallMs*100,cpuPercentMachine:combinedCpuMs/measuredWallMs*100/os.availableParallelism(),
      caseWallIncludingWarmupMs:performance.now()-caseStart,nodeCpuIncludingWarmupMs:used(caseCpu),
      helperCpuThroughLastCompletionMs:backend.lastHelperCpu??0,
      simulationWorkMs:summary(worker),workerSchedulingLatencyMs:null,
      workerSchedulingNote:'Direct core harness measures the simulation method, not worker-thread IPC scheduling; actual producer integration is checked separately.',
      visibilityTaskWallMs:summary(taskWall),visibilityTaskCpuMs:summary(taskCpu),dspMs:summary(dsp),
      gpuExecutionMs:summary(gpuExecution),gpuSubmissionMs:summary(gpuSubmit),gpuTransferMs:summary(gpuTransfer),gpuReadbackMs:summary(gpuReadback),gpuRoundTripMs:summary(roundTrips),
      activeBackendBlocks:activeBackends,gpuResultsApplied,gpuAcousticDispatches,
      gpuCompletedBatches:delta(after,before,'gpuCompletedBatches'),cpuFallbacks:delta(after,before,'cpuFallbacks'),
      gpuDeadlineMisses:delta(after,before,'deadlineMisses'),droppedGpuResults:delta(after,before,'droppedResults'),
      cpuSurfaceTests:delta(after,before,'cpuSurfaceTests'),gpuSurfaceTests:delta(after,before,'gpuSurfaceTests'),
      calibrationCpuSurfaceTests:delta(after,before,'calibrationCpuSurfaceTests'),avoidedCpuSurfaceTests:delta(after,before,'avoidedCpuSurfaceTests'),
      maximumPathCount:Math.max(...pathCounts),pathCounts:summary(pathCounts.filter(n=>n>0)),orders:[...orders].sort(),qualityTimeline,
      controlSha256:fingerprint.digest('hex'),pcmFloat32Sha256:digest(channels),metrics,
      sourceHistoryResets:sim.stats.resets,distinctSourceGenerations:sourceIdentities.size,unavailableHistoryFrames:renderer.historyDiagnostics.affectedFrames,
      cursorResets:renderer.stats.cursorResets,pathOverflow:renderer.stats.pathOverflow,limiterFrames:renderer.stats.limited,
      steadyWindows,firstActiveFrame:firstActive,primedFrame:gate.readyFrame,rendererOwnedBytes:renderer.ownedArrayBytes,nodePeakRssBytes:maximumRss,
      nodeRssScope:'Whole benchmark process high-water sample, including fixtures, warm-up allocations and retained reference PCM; not an isolated runtime renderer working set.',
      workerDeadlineMisses:workerMisses,totalBlockDeadlineMisses:blockMisses,deadlineMs:PERIOD_MS,
      underruns:{measured:false,count:null,reason:'No audio endpoint or hardware callback is opened by this driver.'},
      finalBackend:after,hardwareVerified:mode==='gpu'&&gpuResultsApplied>0&&gpuAcousticDispatches>0,
      gameLaunched:false,audioEndpointOpened:false,subjectiveListening:'not performed'};
    const prefix=`${name}-${quality}-${mode}`;fs.writeFileSync(path.join(directory,prefix+'.wav'),wav(channels),{flag:'wx'});
    fs.writeFileSync(path.join(directory,prefix+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    if(mode==='gpu'&&after.gpuCapability==='hardware-directcompute')requireValue(result.hardwareVerified,'Hardware capability exists, but no completed GPU acoustic result reached PCM; partial case evidence retained');
    return {result,channels};
  }finally{backend.close();}
}

export async function measureAcousticAcceleration({root=repoRoot,output,quick=false,cpuOnly=false,requireHardware=false,
  scenes=['small','demanding'],qualities=Object.keys(qualityPresets),modes=cpuOnly?['cpu']:['cpu','gpu','auto'],
  includeTransition=true,blocks=quick?96:160}={}){
  requireValue(Array.isArray(scenes)&&scenes.length>0&&scenes.length<=3&&new Set(scenes).size===scenes.length&&scenes.every(n=>['small','enclosure','demanding'].includes(n)),'Benchmark scene selection');
  requireValue(Array.isArray(qualities)&&qualities.length>0&&qualities.length<=4&&new Set(qualities).size===qualities.length&&qualities.every(q=>Object.hasOwn(qualityPresets,q)),'Benchmark quality selection');
  requireValue(Array.isArray(modes)&&modes.length>0&&modes.length<=3&&new Set(modes).size===modes.length&&modes.every(m=>['cpu','gpu','auto'].includes(m)),'Benchmark acceleration selection');
  requireValue(Number.isInteger(blocks)&&blocks>=96&&blocks<=512,'Benchmark credited block bound');
  requireValue(!(requireHardware&&!modes.includes('gpu')),'Hardware verification requires the actual GPU comparison');
  root=path.resolve(root);const directory=privateStoragePath(root,path.resolve(root,output??path.join('.local','acoustic-acceleration-'+randomUUID())));
  requireValue(!fs.existsSync(directory),'Fresh private benchmark output required');fs.mkdirSync(directory,{recursive:true});
  const records=[],comparisons=[];let anyHardware=false;
  for(const name of scenes){
    const f=scenario(name,{sources:name==='demanding'?4:1});
    const rows=[...qualities,...(includeTransition&&name==='demanding'&&!quick?['runtime-switch']:[])];
    for(const quality of rows){let reference=null;
      for(const mode of [...modes].sort((a,b)=>Number(b==='cpu')-Number(a==='cpu'))){
        const {result,channels}=await runCase(f,{name,quality,mode,blocks,directory});records.push(result);anyHardware||=result.hardwareVerified;
        if(mode==='cpu')reference={result,channels};
        else if(reference){
          const pcm=difference(reference.channels,channels);requireValue(pcm.exact,'GPU/Auto PCM differs from the shared exact CPU reference');
          requireValue(result.controlSha256===reference.result.controlSha256,'Backend changed finite path controls');
          comparisons.push({name,quality,mode,pcm,
            combinedCpuSavingMs:reference.result.combinedCpuMs-result.combinedCpuMs,
            combinedCpuSavingPercent:(reference.result.combinedCpuMs-result.combinedCpuMs)/reference.result.combinedCpuMs*100,
            wallSpeedup:reference.result.measuredWallMs/result.measuredWallMs,gpuResultsApplied:result.gpuResultsApplied,
            activeBackendBlocks:result.activeBackendBlocks});
        }
      }
    }
  }
  requireValue(!requireHardware||anyHardware,'Real GPU acoustic execution was not established');
  const report={schemaVersion:1,source:'Original 95 Hz harmonic sources with 7 Hz per-source offsets; authored metric comparison geometry',
    gameLaunched:false,audioEndpointOpened:false,hardwareExecutionVerified:anyHardware,blocksPerCase:blocks,
    cpuAccounting:'Node process CPU plus owned helper cumulative CPU through completed requests; startup/calibration reported separately',
    timingScope:'Accelerated offline core benchmark; measured simulation work is not audio scheduling or GTA FPS evidence',
    cpuTimingLimit:'Windows process CPU counters are quantized and include V8 background work. Short small-scene differences are noisy; per-task timings and larger aggregate cases must be considered together.',
    qualityBudgetIncludesDirect:true,maximumReflectionOrder:2,lateReverberation:'not-implemented',
    cases:records,comparisons};
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(directory,'listen.html'),'<!doctype html><meta charset="utf-8"><title>RichAudio acoustic acceleration comparison</title><h1>Original CPU/GPU/Auto PCM</h1><p>Authored metric scenes, original generated sources; no GTA launch or device playback was performed. Manual playback only.</p>'+records.map(r=>`<h2>${r.name} / ${r.quality} / ${r.requestedAcceleration}</h2><audio controls src="${r.name}-${r.quality}-${r.requestedAcceleration}.wav"></audio>`).join(''),{flag:'wx'});
  return {directory,report};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={};
  for(let i=2;i<process.argv.length;i++){
    const arg=process.argv[i];if(arg==='--quick')options.quick=true;else if(arg==='--cpu-only')options.cpuOnly=true;
    else if(arg==='--require-hardware')options.requireHardware=true;else if(arg==='--output'&&process.argv[i+1])options.output=process.argv[++i];
    else throw Error('Acoustic benchmark option');
  }
  const {directory,report}=await measureAcousticAcceleration(options);
  console.log(JSON.stringify({output:directory,hardwareExecutionVerified:report.hardwareExecutionVerified,cases:report.cases.length,
    comparisons:report.comparisons.map(c=>({name:c.name,quality:c.quality,mode:c.mode,cpuSavingPercent:c.combinedCpuSavingPercent,
      wallSpeedup:c.wallSpeedup,gpuResultsApplied:c.gpuResultsApplied,exactPcm:c.pcm.exact}))},null,2));
}
