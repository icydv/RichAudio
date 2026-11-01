// Bati-only bounded experiment. No native/RPH integration or source writes.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {decodeWav,encodeWav,measure,limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';
import {hash,sliceAudio} from './Inspect-Deceleration.mjs';
import {cycleSchedule,matchedExhaust} from './audio/cycle-experiment.mjs';
function read(p,max=limits.bytes){noLinks(p);if(fs.statSync(p).size>max)throw Error('input bound');return fs.readFileSync(p);}
function faded(a){const data=a.data.slice(),edge=a.rate*0.025;for(let n=0;n<data.length;n++){const g=Math.min(1,n/edge,(data.length-1-n)/edge);data[n]=g===0?0:data[n]*g;}return {...a,data};}
export function renderExperiment(directory,baselineDirectory,outputDirectory){
  const root=privatePath(directory),baseline=privatePath(baselineDirectory),out=privatePath(outputDirectory);if(fs.existsSync(out))throw Error('existing output rejected');
  const meta=JSON.parse(read(path.join(root,'extraction.json'),16*1024*1024).toString('utf8'));
  if(meta.failed!==false||meta.archives?.[0]?.container!=='v_twin_2.awc')throw Error('wrong extraction');
  const sources={};for(const component of ['engine','exhaust']){
    const matches=meta.archives[0].streams.filter(s=>s.name===component+'_decel');if(matches.length!==1)throw Error('missing source');const s=matches[0];
    if(s.wav!==component+'_decel.wav'||s.codec!==0)throw Error('source layout');
    const b=read(path.join(root,'player',s.wav));if(hash(b)!==s.wavSha256)throw Error('source fingerprint mismatch');
    const audio=decodeWav(b);if(audio.rate!==48000||audio.channels!==1||audio.data.length!==s.sampleCount)throw Error('source format');
    sources[component]={audio,grains:s.grains.GranularGrains};
  }
  const pins={mix:'5F31B5CB6378A878F9B54E6531CE85F9A117B97A5915705B7A27EA35D794D77A',engine:'5D1677D7E50C8B8BEAD1635BCFFE22250F6D192B8E037C496F99B6D6F8D67607',exhaust:'03B506DD74C00373FBEFADC57C36E55601786DBE590201D5CF1474BF1ED53528'};
  const saved={};for(const component of Object.keys(pins)){const b=read(path.join(baseline,'demo_'+component+'.wav'));if(hash(b)!==pins[component])throw Error('accepted reference mismatch');saved[component]=decodeWav(b);}
  const begin=performance.now(),schedule=cycleSchedule(sources.engine.grains,sources.exhaust.grains),x=matchedExhaust(sources.exhaust.audio,schedule);
  const start=schedule[0].start,end=schedule.at(-1).end,globalStart=412731+start,globalEnd=412731+end;
  const engine=sliceAudio(saved.engine,globalStart,globalEnd),a=sliceAudio(saved.mix,globalStart,globalEnd),mix=new Float64Array(end-start),balance=new Float64Array(end-start);
  const xGain=0.2*0.75;
  for(let n=0;n<mix.length;n++){x.data[n]*=xGain;mix[n]=engine.data[n]+x.data[n];balance[n]=0.35*engine.data[n]+x.data[n];}
  const result={'A_accepted_excerpt.wav':faded(a),'B_marker_state.wav':faded({...a,data:mix}),'C_exhaust_led.wav':faded({...a,data:balance}),
    'B_engine.wav':faded(engine),'B_exhaust.wav':faded(x)};
  const outputs={},pending={};for(const [name,audio]of Object.entries(result)){const b=encodeWav(audio);const stats=measure(decodeWav(b));if(stats.clippedSamples||stats.allZero)throw Error('invalid candidate output');outputs[name]={sha256:hash(b),...stats};pending[name]=b;}
  let maxSeamStep=0;
  for(const s of schedule.slice(1)){const n=s.start-start;maxSeamStep=Math.max(maxSeamStep,Math.abs(x.data[n]-x.data[n-1]));}
  if(maxSeamStep>0.05)throw Error('excessive cycle join step');
  const report={schemaVersion:1,classification:'Experimental shared marker-state/cycle clock; not native scheduling, physical RPM or proven phase coherence',
    sourceRange:{startFrame:start,endFrame:end,globalStartFrame:globalStart,globalEndFrame:globalEnd},
    controls:{lowState:14,highState:28,maxSpeedDeviation:0.05,maxRelativeStateError:0.02,joinSamples:96,edgeFadeSamples:1200,engineUnchanged:true,
      fixedGains:{engine:0.2,exhaust:0.15},requestedBalanceEngineMultiplier:0.35},
    actual:{cycles:schedule.length,speedMin:Math.min(...schedule.map(s=>s.speed)),speedMax:Math.max(...schedule.map(s=>s.speed)),stateErrorMax:Math.max(...schedule.map(s=>s.relativeStateError)),maxSeamStep},
    renderMs:performance.now()-begin,outputs,schedule,limitations:['Marker boundaries are not known combustion phase','Only a contiguous interior state branch is used','Two-ms convex join smoothing is estimated','Small band-limited time resampling changes local pitch as well as time','C tests requested exhaust-led balance relative to B, not a phase correction','No integration or promotion to accepted reference']};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);for(const [name,b]of Object.entries(pending))fs.writeFileSync(path.join(out,name),b,{flag:'wx'});
  fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceRange:report.sourceRange,actual:report.actual,renderMs:report.renderMs}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==5)throw Error('Usage: node tools/Render-CycleExperiment.mjs PRIVATE_EXTRACTION PRIVATE_BASELINE NEW_PRIVATE_OUTPUT');renderExperiment(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
