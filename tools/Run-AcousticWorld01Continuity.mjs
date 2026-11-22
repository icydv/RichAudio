// Owner-invoked private replay only. Original observations/banks are read-only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRetainedContinuityInputs,replayGameplay,quietWindows} from './audio/acoustic-world-continuity-replay.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--package','--capture','--journal','--output','--original-module'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw Error('Explicit distinct private replay arguments required');options[args[i]]=path.resolve(args[i+1]);}
if(Object.keys(options).length!==5)throw Error('Package, capture, journal, original module and fresh private output required');
const out=options['--output'];if(!out.startsWith(path.join(root,'.local')+path.sep)||fs.existsSync(out))throw Error('Fresh local private replay output required');
for(let p=out;p!==path.dirname(p);p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked replay output refused');
fs.mkdirSync(out,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=['src/acoustics/vehicle/gameplay.mjs','src/acoustics/streaming/listener-playout.mjs','src/acoustics/vehicle/pipeline.mjs','src/acoustics/vehicle/stock-source.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/vehicle/latency-profile.mjs','tools/audio/acoustic-world-continuity-replay.mjs','tools/Run-AcousticWorld01Continuity.mjs','tests/Test-AcousticWorld01Continuity.mjs'];
const sourcePins=sourceFiles.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const inputs=loadRetainedContinuityInputs({packageRoot:options['--package'],captureDirectory:options['--capture'],journalFile:options['--journal']});
const {StockGameplay:Original}=await import(pathToFileURL(options['--original-module']).href),runs={};
for(const [name,settings]of Object.entries({original:{Engine:Original},baseline:{},'camera-source-01':{continuityPolicy:'camera-source-01'}})){
 console.log('Rendering private offline replay '+name);const run=await replayGameplay({inputs,...settings});
 const wave=encodeVehicleWav(run.channels);fs.writeFileSync(path.join(out,name+'.wav'),wave,{flag:'wx'});fs.writeFileSync(path.join(out,name+'-trace.ndjson'),run.trace.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
 const sum={...run};delete sum.channels;delete sum.trace;sum.waveSha256=hash(wave);sum.waveBytes=wave.length;
 sum.cameraWindows=inputs.boundaries.map(b=>({...b,quiet:run.quietWindows.filter(w=>Math.abs(w.startFrame/48000-b.timeSeconds)<.35),sourceTrace:run.trace.filter(r=>Math.abs(r.producerFrameStart/48000-b.timeSeconds)<.2).map(r=>({frame:r.producerFrameStart,mode:r.listenerMode,listenerGeneration:r.listenerGeneration,sourceFrame:r.sourceFrame,brackets:r.sourceBrackets.length}))}));
 fs.writeFileSync(path.join(out,name+'-metrics.json'),JSON.stringify(sum,null,2),{flag:'wx'});runs[name]=sum;
}
if(runs.original.pcmSha256!==runs.baseline.pcmSha256)throw Error('Default gameplay baseline PCM changed from original sealed module');
const originalQuiet=quietWindows(inputs.original.channels),measured=originalQuiet.filter(w=>w.startFrame>0&&w.startFrame<1500000);
if(measured.length!==2||measured[0].frames!==4301||measured[1].frames!==4835)throw Error('Original retained camera windows differ; do not rewrite baseline');
const artifactPins=fs.readdirSync(out).map(file=>{const b=fs.readFileSync(path.join(out,file));return {file,bytes:b.length,sha256:hash(b)};});
for(const pin of sourcePins)if(hash(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Replay source changed during validation');
const result={schema:1,kind:'acoustic-world-01-private-continuity-replay',passed:true,offlineOnly:true,nodeVersion:process.version,sourcePins,originalModuleSha256:hash(fs.readFileSync(options['--original-module'])),gameLaunched:false,endpointOpened:false,originalBanksModified:false,
 exactOriginalRetainedQuietWindows:measured,originalCapturedWaveSha256:inputs.original.sha256,originalCapturedPcmSha256:inputs.original.dataSha256,
 defaultBaselineBitExactToOriginalModule:true,exactLivePcmReconstructionClaimed:false,schedule:inputs.provenance,clockOffsets:inputs.clockOffsets,
 runs:Object.fromEntries(Object.entries(runs).map(([name,r])=>[name,{pcmSha256:r.pcmSha256,sourceChanges:r.sourceChanges,sourceFrameRegressions:r.sourceFrameRegressions,cameraWindows:r.cameraWindows,history:r.diagnostics.pipeline.history,limiting:r.diagnostics.pipeline.renderer.limited}])),artifactPins};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,output:out,originalQuietWindows:measured,baselineBitExact:true}));
