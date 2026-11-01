// Offline numeric evidence only. Never writes audio, game files or native state.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {decodeWav, limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath, within, noLinks} from './audio/private-files.mjs';
import {markerSummary, localPeriodicity, valueAtFrame, validateMapping} from './audio/cycle-analysis.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
function read(file,max=limits.bytes){noLinks(file);if(fs.statSync(file).size>max)throw Error('input bound');return fs.readFileSync(file);}
export function inspect(directory, output) {
  const root=privatePath(directory),out=privatePath(output);if(fs.existsSync(out))throw Error('existing output rejected');
  const metadataBytes=read(path.join(root,'extraction.json'),16*1024*1024),meta=JSON.parse(metadataBytes.toString('utf8'));
  if(meta.schemaVersion!==1||meta.failed!==false||meta.archives?.length!==2||meta.archives[0].container!=='v_twin_2.awc')throw Error('incomplete/wrong extraction');
  const definitions=meta.archives[0].streams;
  if(!Array.isArray(definitions)||definitions.length!==8)throw Error('player stream count');
  const started=performance.now(),cpu=process.cpuUsage(),streams=[];let bytes=0;
  for(const name of ['engine_decel','exhaust_decel','engine_accel','exhaust_accel','engine_idle','exhaust_idle']) {
    const found=definitions.filter(s=>s.name===name);if(found.length!==1)throw Error('missing/duplicate source');const s=found[0];
    if(s.wav!==name+'.wav'||s.codec!==0)throw Error('unsupported source');
    const file=path.resolve(root,'player',s.wav);if(!within(file,root))throw Error('source escape');const raw=read(file);bytes+=raw.length;
    if(bytes>limits.bytes||hash(raw)!==s.wavSha256)throw Error('source fingerprint/aggregate bound');
    const audio=decodeWav(raw);if(audio.channels!==1||audio.rate!==s.sampleRate||audio.data.length!==s.sampleCount)throw Error('source layout');
    const grains=s.grains?.GranularGrains,loops=s.loops?.GranularLoops??[],summary=markerSummary(grains,loops,audio);
    const fractions=name.endsWith('idle')?[0.5]:[0.12,0.25,0.4,0.55,0.7,0.85];
    const centers=fractions.map(f=>Math.round(audio.data.length*f));const values=centers.map(n=>valueAtFrame(grains,n));
    const observations=centers.map((center,i)=>{
      const local=localPeriodicity(audio,center,values[i],[values[(i+Math.ceil(values.length/2))%values.length],values[i]*1.37]);
      let lower=0;while(lower<grains.length-2&&grains[lower+1].UnkUint1<center)lower++;
      return {fraction:fractions[i],centerFrame:center,bracketStartIndex:lower,bracketEndIndex:lower+1,
        bracketStartFrame:grains[lower].UnkUint1,bracketEndFrame:grains[lower+1].UnkUint1,
        groupIndices:loops.flatMap((g,i)=>g.Grains.includes(lower)&&g.Grains.includes(lower+1)?[i]:[]),...local};
    });
    let increasingMapValid=true,decreasingMapValid=true;
    try{validateMapping(grains.map(g=>({state:g.UnkFloat1,position:g.UnkUint1})));}catch{increasingMapValid=false;}
    try{validateMapping(grains.map(g=>({state:-g.UnkFloat1,position:g.UnkUint1})));}catch{decreasingMapValid=false;}
    streams.push({name,sha256:hash(raw),sampleRate:audio.rate,summary,increasingMapValid,decreasingMapValid,observations});
  }
  const used=process.cpuUsage(cpu);const report={schemaVersion:1,scope:'Six original player streams, metadata and independent local periodicity; no playback change',
    metadataSha256:hash(metadataBytes),elapsedMs:performance.now()-started,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBytes:process.memoryUsage().rss,
    method:{windowSeconds:0.5,acfSearchHz:[6,200],maximumLagFractionOfWindow:1/3,frequencyLabel:'relative acoustic repetition only; not physical RPM',
      controls:['half-rotated metadata values across uniform observation windows','1.37 times local metadata value'],heldOut:'Marker-spacing model selected on even records; evaluated on odd records. Temporally correlated points are not independent vehicle samples.'},
    streams,conclusion:'Numerical evidence requires interpretation; no native scheduling, phase or audio correction is inferred automatically'};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({streams:streams.length,elapsedMs:report.elapsedMs,output:'private numeric report only'}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw Error('Usage: node tools/Inspect-CycleEvidence.mjs PRIVATE_EXTRACTION NEW_PRIVATE_OUTPUT');inspect(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
