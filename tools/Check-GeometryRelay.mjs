// Read actual C# fixture output, reproduce it with the EXISTING StreamingRenderer,
// then isolate reflections with identical controls/history/source PCM. No endpoint.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {qualityNames,accelerationNames} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {wav,audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
export function checkGeometryRelay(root,directory){
  const dir=privateStoragePath(root,path.resolve(root,directory)),file=path.join(dir,'stream.f32');
  assert.ok(fs.statSync(file).size<=16*1024*1024);
  const raw=fs.readFileSync(file),lines=fs.readFileSync(path.join(dir,'renderer.txt'),'utf8').trim().split(/\r?\n/).map(JSON.parse),
    blocks=lines.filter(x=>x.type==='block'),final=lines.findLast(x=>x.type==='final'),relay=JSON.parse(fs.readFileSync(path.join(dir,'relay.json'),'utf8'));
  assert.ok(final);assert.equal(final.error,null);assert.equal(raw.length,blocks.length*4096);assert.ok(blocks.length>150&&blocks.length<700);
  assert.equal(final.dsp.limited,0);assert.equal(final.dsp.cursorResets,0);assert.equal(final.dsp.pathOverflow,0);
  assert.equal(final.historyDiagnostics.affectedFrames,0);assert.equal(final.simulation.resets,1,'geometry streams do not reset unrelated source history');
  assert.ok(final.geometry.stats.configured>=2);assert.ok(final.geometry.stats.expired>=1);
  assert.ok(relay.maximumAcceptedRoundTripMs<=10&&relay.maximumObservedRoundTripMs>10&&relay.rejected>0);
  const acoustic=final.acousticSettings??null;
  const renderers=[0,1].map(()=>new StreamingRenderer({sourceIds:['beacon-0'],generationReleaseGuard:true,
    ...(acoustic?{pathCapacityPerSource:64}:{})}));
  const output=[0,1].map(()=>[new Float32Array(blocks.length*512),new Float32Array(blocks.length*512)]),
    dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512);
  let phase=0,gain=0,stable=0,absent=0,differenceEnergy=0;const identities=new Set();
  for(const [b,t] of blocks.entries()){
    assert.equal(t.frame,b*512);for(const g of Object.values(t.sourceGenerations))identities.add(g);
    if(acoustic){assert.ok(t.acoustic,'settings-enabled block retains actual worker diagnostics');
      assert.ok(qualityNames.includes(t.acoustic.activeQuality)&&t.acoustic.activeQuality!=='auto');
      assert.ok(Number.isInteger(t.acoustic.pathBudget)&&t.acoustic.pathBudget>=12&&t.acoustic.pathBudget<=64);
      for(const renderer of renderers)renderer.setPathBudget(t.acoustic.pathBudget);
    }else assert.equal(t.acoustic,undefined,'legacy fixture remains on its original renderer capacity');
    if(t.geometry.mode==='active')for(const e of t.geometry.originalObservationTimes){
      assert.equal(e.validUntilMs,e.finishedMs+1000);assert.ok(t.geometry.clock.upper<e.validUntilMs);
    }
    for(let j=0;j<512;j++){
      gain+=(Number(t.emitting)*.22-gain)*(1-Math.exp(-1/(.01*48000)));
      phase=(phase+2*Math.PI*95/48000)%(2*Math.PI);
      dry[j]=gain*(Math.sin(phase)+.35*Math.sin(2*phase)+.15*Math.sin(3*phase))/1.5;
    }
    for(let k=0;k<2;k++){
      renderers[k].accept({frame:t.frame,sourceGenerations:t.sourceGenerations,paths:t.pathPresentation.filter(p=>k===0||p.order===0)});
      renderers[k].process({'beacon-0':dry},left,right,512);
      for(let j=0;j<512;j++){
        const g=t.startup==='ready'?Math.min(1,(t.frame+j-t.readyFrame+1)/480):0;
        left[j]*=g;right[j]*=g;
      }
      output[k][0].set(left,t.frame);output[k][1].set(right,t.frame);
    }
    let energy=0;
    for(let j=0;j<512;j++){
      const i=t.frame+j,l=raw.readFloatLE(i*8),r=raw.readFloatLE(i*8+4);
      assert.equal(output[0][0][i],l,'actual PCM matches real streamed path controls');assert.equal(output[0][1][i],r);
      differenceEnergy+=(l-output[1][0][i])**2+(r-output[1][1][i])**2;energy+=l*l+r*r;
    }
    stable=t.geometry.mode==='active'&&t.paths>0&&t.startup==='ready'?stable+1:0;
    absent=t.paths===0&&t.geometry.mode!=='active'?absent+1:0;
    if(stable>4)assert.ok(energy>1e-10,'valid steady window is not unexpectedly silent');
    if(absent>5)assert.ok(energy<1e-18,'unavailable paths complete their release');
  }
  assert.equal(identities.size,1);assert.ok(blocks.some(t=>t.pathPresentation.some(p=>p.order===2)),'authentic relayed wall+ground enable second order');
  assert.ok(differenceEnergy>1e-3,'reflections change actual PCM');
  const metrics=audioMetrics(output[0]);assert.equal(metrics.clippedSamples,0);assert.equal(metrics.nonfiniteSamples,0);assert.ok(metrics.maximumAdjacentStep<.02);
  const report={schemaVersion:1,source:'original generated beacon; deterministic collision fixtures',gameLaunched:false,audioEndpointOpened:false,
    blocks:blocks.length,frames:final.frames,pcmFloat32SHA256:createHash('sha256').update(raw).digest('hex'),
    exactControlReplay:true,matchedReflectionDifferenceRms:Math.sqrt(differenceEnergy/(final.frames*2)),metrics,
    rendererOwnedBytes:final.ownedArrayBytes,processRssBytes:final.memory.rss,workerMs:final.statistics.simulationMs,dspMs:final.statistics.dspMs,
    relay:{forwarded:relay.forwarded,transactions:relay.transactions,rejected:relay.rejected,disconnects:relay.disconnects,
      maximumAcceptedRoundTripMs:relay.maximumAcceptedRoundTripMs,maximumObservedRoundTripMs:relay.maximumObservedRoundTripMs},
    sourceHistoryResets:final.simulation.resets,unavailableHistoryFrames:final.historyDiagnostics.affectedFrames,
    geometryAccepted:final.geometry.stats.accepted,geometryExpired:final.geometry.stats.expired,subjectiveListening:'not performed',
    scale:'declared model scale 10; physical GTA metres/materials unverified',timing:'wall-paced fixture; no hardware or hard real-time scheduling claim'};
  if(acoustic){
    assert.ok(qualityNames.includes(acoustic.requestedQuality));assert.ok(accelerationNames.includes(acoustic.requestedAcceleration));
    const gpuBlocks=[];let applied=0;
    for(const t of blocks){const a=t.acoustic;if(a.gpuResultsApplied>applied){assert.equal(a.activeAcceleration,'gpu','applied GPU result is reported as actual GPU computation');gpuBlocks.push(a);}
      applied=a.gpuResultsApplied;}
    const hardware=acoustic.gpuCapability==='hardware-directcompute',verified=hardware&&acoustic.gpuResultsApplied>0;
    const gpuProcessedSignalBlocks=blocks.filter(t=>t.acoustic.activeAcceleration==='gpu'&&t.geometry.mode==='active'&&t.paths>0&&t.emitting&&t.startup==='ready').length;
    if(acoustic.requestedAcceleration==='gpu'&&hardware){
      assert.ok(acoustic.gpuResultsApplied>0,'available hardware must produce real GPU results accepted by the acoustic engine');
      assert.ok(acoustic.gpuCompletedBatches>0&&acoustic.gpuAcousticDispatches>0,'completed real GPU acoustic dispatches are required');
      assert.ok(gpuBlocks.length>0&&typeof acoustic.gpuDevice==='string'&&acoustic.gpuDevice.length>0);
      assert.ok(gpuProcessedSignalBlocks>0,'real GPU-assisted geometry reaches emitting stereo PCM blocks');
    }
    if(!verified)assert.ok(acoustic.requestedAcceleration!=='gpu'||acoustic.fallbackReason,'unverified GPU execution has an explicit fallback reason');
    const picked={};
    for(const key of ['requestedQuality','activeQuality','pathBudget','requestedAcceleration','activeAcceleration','gpuCapability','gpuDevice',
      'fallbackReason','accelerationDeadlineMs','gpuAcousticDispatches','gpuCompletedBatches','gpuResultsApplied','cpuFallbacks','deadlineMisses',
      'droppedResults','invalidResults','cpuSurfaceTests','gpuSurfaceTests','avoidedCpuSurfaceTests','qualityChanges','qualityDeadlineMisses',
      'qualityMaximumMs','qualityProcessingEwmaMs','initializationMs','warmupMs','gpuTimingValid','helperCumulativeCpuMs',
      'gpuOwnedBytes','gpuDeviceUsageBytes','helperWorkingSetBytes','cpuAccounting'])
      if(acoustic[key]!==undefined)picked[key]=acoustic[key];
    const timing={};
    for(const key of ['gpuSubmitMs','gpuExecutionMs','gpuTransferMs','gpuReadbackMs','gpuRoundTripMs','helperCpuMs','queryWallMs','queryCpuMs','taskWallMs','taskCpuMs']){
      const values=gpuBlocks.map(a=>a[key]).filter(Number.isFinite).sort((a,b)=>a-b);
      timing[key]=values.length?{count:values.length,median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)}:null;
    }
    report.acousticAcceleration={...picked,gpuProcessedSignalBlocks,hardwareExecutionVerified:verified,
      hardwareVerification:verified?'real GPU results reached observed propagation and PCM':'unverified; actual CPU path or fallback retained',
      cpuTimingCaveat:'Per-request counters can quantize to zero; cumulative helper CPU includes initialization and whole-run accounting is required for savings claims',
      activeBackendsObserved:[...new Set(blocks.map(t=>t.acoustic.activeAcceleration))],
      pathBudgetsObserved:[...new Set(blocks.map(t=>t.acoustic.pathBudget))],gpuAppliedTimingMs:timing};
  }
  for(const [i,name] of ['observed','matched-direct'].entries())fs.writeFileSync(path.join(dir,name+'.wav'),wav(output[i]),{flag:'wx'});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(dir,'listen.html'),`<!doctype html><meta charset="utf-8"><title>RichAudio RPH relay fixture</title><h1>Actual C# publisher → host relay → Node PCM</h1><p>Original collision/audio fixtures; declared scale, not GTA calibration. Manual playback only.</p>${['observed','matched-direct'].map(n=>`<h2>${n}</h2><audio controls src="${n}.wav"></audio>`).join('')}`,{flag:'wx'});
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(checkGeometryRelay(fileURLToPath(new URL('..',import.meta.url)),process.argv[2]),null,2));
}
