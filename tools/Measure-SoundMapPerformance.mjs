// Paired actual producer/worker runs. No game process or audio endpoint is used.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {replayAcousticAcceleration} from './audio/acoustic-acceleration-replay.mjs';
import {startSoundMap} from './soundmap/server.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=privateStoragePath(root,path.resolve(root,process.argv[2]??'.local/soundmap-performance-new'));
if(fs.existsSync(output))throw Error('Fresh private measurement output required');
fs.mkdirSync(output,{recursive:true});
let service=null;
const statistics=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return {count:sorted.length,median:sorted[Math.floor(sorted.length*.5)]??null,p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??null,max:sorted.at(-1)??null};};
const summary=r=>({sha256:createHash('sha256').update(r.raw).digest('hex'),frames:r.final.frames,
  nodeCpuSeconds:r.final.cpuSeconds,worker:r.final.statistics.simulationMs,dsp:r.final.statistics.dspMs,
  helperCumulativeCpuMs:r.final.acousticSettings?.helperCumulativeCpuMs??null,
  gpuResultsApplied:r.final.acousticSettings?.gpuResultsApplied??0,gpuCompletedBatches:r.final.acousticSettings?.gpuCompletedBatches??0,
  gpuDevice:r.final.acousticSettings?.gpuDevice??null,gpuCapability:r.final.acousticSettings?.gpuCapability??null,
  workerSchedulingAndDspOverPeriod:r.traces.filter(t=>{
    assert.ok(Number.isFinite(t.workerSchedulingMilliseconds)&&Number.isFinite(t.dspMilliseconds));
    return t.workerSchedulingMilliseconds+t.dspMilliseconds>512/48;
  }).length,
  gpuExecutionMs:statistics(r.traces.filter(t=>t.acoustic?.activeAcceleration==='gpu').map(t=>t.acoustic.gpuExecutionMs)),
  workerSchedulingMs:statistics(r.traces.map(t=>t.workerSchedulingMilliseconds)),transport:r.final.soundMap??null});
const result={schemaVersion:1,scope:'Actual device-free producer/worker with original synthetic scene; separate loopback SoundMap service and telemetry recording enabled. No WASAPI endpoint; owned PCM tap measured separately.',
  parameters:{quality:'balanced',scenario:'demanding',sources:1,blocks:160,fps:20},pairs:[],limitations:'Two sequential processes per mode; includes cold startup and scheduling/GC noise. CPU counters are quantized. The period count covers measured worker scheduling plus DSP only; it is a lower bound on complete block overruns and includes cold startup. No claim of live-game deadlines, viewer paint cost, physical output, or GPU speedup from telemetry.'};
try{
  for(const mode of ['cpu','gpu','auto']){
    const before=await replayAcousticAcceleration({quality:'balanced',acceleration:mode});
    service=await startSoundMap({root:path.join(output,mode),port:0});
    const config=path.join(service.privateRoot,'service.json');
    const id=service.recorder.start().id;
    const after=await replayAcousticAcceleration({quality:'balanced',acceleration:mode,soundMapConfig:config});
    service.recorder.stop('user-stop');
    assert.deepEqual(after.raw,before.raw,'SoundMap must preserve PCM for '+mode);
    const replay=service.recorder.open(id);
    assert.ok(replay.frames.length>0,'Original solver frames reach recording');
    result.pairs.push({mode,disabled:summary(before),enabled:summary(after),exactPcmEqual:true,recordedVisualFrames:replay.frames.length});
    console.log(JSON.stringify({mode,exactPcmEqual:true,gpuResultsApplied:after.final.acousticSettings?.gpuResultsApplied??0,recordedVisualFrames:replay.frames.length}));
    await service.close();service=null;
  }
  assert.equal(new Set(result.pairs.map(p=>p.enabled.sha256)).size,1,'CPU/GPU/Auto PCM parity');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
}finally{if(service)await service.close();}
console.log('Private measured summary: '+path.join(output,'result.json'));
