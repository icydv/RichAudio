// Explicit file-only retained-observation replay; never opens an endpoint.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {loadRetainedContinuityInputs,replayGameplay} from './audio/acoustic-world-continuity-replay.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2),o={};
for(let i=0;i<args.length;i+=2){if(!['--package','--capture','--journal','--output','--scenario'].includes(args[i])||!args[i+1]||Object.hasOwn(o,args[i]))throw Error('Explicit distinct replay arguments required');o[args[i]]=args[i]==='--scenario'?args[i+1]:path.resolve(args[i+1]);}
if(!['--package','--capture','--journal','--output'].every(k=>o[k]))throw Error('Package/capture/journal/fresh output required');
const out=o['--output'];if(!out.startsWith(path.join(root,'.local')+path.sep)||fs.existsSync(out))throw Error('Fresh private .local output required');
for(let p=out;p!==path.dirname(p);p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked output refused');
fs.mkdirSync(out,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['src/acoustics/vehicle/latency-profile.mjs','src/acoustics/vehicle/gameplay.mjs','src/acoustics/streaming/listener-playout.mjs','tools/audio/acoustic-world-continuity-replay.mjs','tools/Benchmark-LowLatency01.mjs'];
const sourcePins=files.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const inputs=loadRetainedContinuityInputs({packageRoot:o['--package'],captureDirectory:o['--capture'],journalFile:o['--journal']});
const lineage=new Map();for(const line of fs.readFileSync(o['--journal'],'utf8').split(/\r?\n/).filter(Boolean)){const r=JSON.parse(line);if(r.kind==='gameplay-frame'&&r.data?.lineage){const frame=JSON.parse(r.data.frameJson);lineage.set(frame.listener.sequence,r.data.lineage);}}
function stats(a){if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),q=p=>{const n=(b.length-1)*p,i=Math.floor(n),j=Math.ceil(n);return b[i]+(b[j]-b[i])*(n-i);};return {count:b.length,minimumMs:b[0],medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),maximumMs:b.at(-1),meanMs:b.reduce((s,v)=>s+v,0)/b.length};}
class Heavy extends StockGameplay{renderCount=0;async render(){if(this.renderCount++%97===48){const begin=performance.now();while(performance.now()-begin<35.7461){/* authored CPU pressure, included in measured external render cost */}}return super.render();}}
const cases={retained:{},'authored-jitter-15ms':{jitterMs:sequence=>(sequence*7%16)},'authored-missing-every11':{omitSequence:sequence=>sequence%11===0},'authored-cold-delivery-100ms':{jitterMs:sequence=>sequence<12?100:0},'authored-heavy-cpu-35ms':{Engine:Heavy}};
if(o['--scenario']&&!Object.hasOwn(cases,o['--scenario']))throw Error('Unknown bounded replay scenario');
const runs=[];
for(const [scenario,schedule]of Object.entries(cases))for(const latencyProfile of ['baseline','low-latency-01']){
 if(o['--scenario']&&scenario!==o['--scenario'])continue;
 console.log('Offline retained replay '+scenario+' '+latencyProfile);
 const run=await replayGameplay({inputs,latencyProfile,continuityPolicy:'baseline',...schedule});
 const older=[],newer=[],nativeOlderLower=[],nativeOlderUpper=[],nativeNewerLower=[],nativeNewerUpper=[];let unavailable=0;
 for(const row of run.trace){if(!row.sourceBrackets.length){unavailable++;continue;}const bracket=row.sourceBrackets[0],nowMs=row.producerFrameStart/48;
  older.push(nowMs-bracket.leftObservationTicks*1000/bracket.clockFrequency-inputs.clockOffsetSeconds*1000);
  if(bracket.rightObservationTicks!==null)newer.push(nowMs-bracket.rightObservationTicks*1000/bracket.clockFrequency-inputs.clockOffsetSeconds*1000);
  for(const [sequence,lower,upper]of [[bracket.leftSequence,nativeOlderLower,nativeOlderUpper],[bracket.rightSequence,nativeNewerLower,nativeNewerUpper]]){const r=lineage.get(sequence);if(r&&Number.isFinite(r.minimumHostTicks)&&Number.isFinite(r.maximumHostTicks)&&r.hostFrequency===bracket.clockFrequency){lower.push(nowMs-r.maximumHostTicks*1000/r.hostFrequency-inputs.clockOffsetSeconds*1000);upper.push(nowMs-r.minimumHostTicks*1000/r.hostFrequency-inputs.clockOffsetSeconds*1000);}}
 }
 const result={scenario,latencyProfile,continuityPolicy:'baseline',frames:run.frames,pcmSha256:run.pcmSha256,processingMs:stats(run.processingMs),externalRenderDeadlineMisses:run.processingMs.filter(v=>v>512/48).length,
  olderPoseSelectionAgeMs:stats(older),newerPoseSelectionAgeMs:stats(newer),selectionAgeScope:'Retained vehicle POSE endpoints at constructed producer block time, BEFORE ring/endpoint; distinct from native operating acquisition and submission ages',
  olderNativeOperatingSelectionAgeLowerMs:stats(nativeOlderLower),olderNativeOperatingSelectionAgeUpperMs:stats(nativeOlderUpper),newerNativeOperatingSelectionAgeLowerMs:stats(nativeNewerLower),newerNativeOperatingSelectionAgeUpperMs:stats(nativeNewerUpper),nativeAgeScope:'Exact sourceBrackets endpoint sequence joins original journal lineage minimum/maximumHostTicks; preserved host-QPC mapping interval, plus common retained producer-clock mapping uncertainty. BEFORE ring/endpoint; no physical latency.',
  memoryBeforeBytes:run.memoryBeforeBytes,maximumMemoryBytes:run.maximumMemoryBytes,memoryAfterBytes:run.memoryAfterBytes,sourceChanges:run.sourceChanges,sourceFrameRegressions:run.sourceFrameRegressions,
  unavailableSourceBracketBlocks:unavailable,quietWindows:run.quietWindows,diagnostics:run.diagnostics};
 fs.writeFileSync(path.join(out,scenario+'-'+latencyProfile+'.json'),JSON.stringify({...result,processingSamplesMs:run.processingMs},null,2),{flag:'wx'});fs.writeFileSync(path.join(out,scenario+'-'+latencyProfile+'-trace.ndjson'),run.trace.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});runs.push(result);
}
for(const pin of sourcePins)if(hash(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Source drift during serial replay');
const result={schema:1,passed:true,kind:'low-latency-01-file-only-serial-retained-replay',sourcePins,nodeVersion:process.version,provenance:inputs.provenance,clockOffsets:inputs.clockOffsets,
 limitations:['Retained host deliveries plus constructed producer phase; original live accept times were sampled and cannot be reconstructed exactly.','Cost is actual wall time in a serial offline process, not a GTA frame-time or real-time playback guarantee.','Jitter/missing/cold/heavy variants are authored stress, not invented live observations. Heavy spin is external measured render work; the constructed observation clock does not stall.','Ring starvation/underflow are not measured by this replay; use separate actual Node/ring fixture and authored scheduler.','Process RSS includes retained banks, WAV and previous runs; max sampled every128 blocks and not attributable solely to the profile.','Native operating endpoints end at producer selection and retain sequence/QPC mapping intervals; measured original live submission ages146/204ms remain separate.'],
 gameStarted:false,endpointOpened:false,newRecording:false,physicalLatencyMeasured:false,runs};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log('PASS serial retained low-latency replay '+path.join(out,'validation.json'));
