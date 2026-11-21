// Fixed five-interval private A/B. No playback, network, game or extra variants.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {encodeWav,decodeWav,measure} from '../src/offline-audio/stock-source.mjs';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {hash} from './Inspect-Deceleration.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';import {eligibleIntervals} from './audio/granular-model-analysis.mjs';
import {prepareAblation,renderAblation,compareAblation} from './audio/exhaust-join-ablation.mjs';
import {spectrum} from './audio/decel-analysis.mjs';import {exactWavePeriods} from './audio/wave-recurrence.mjs';
function boundaryMetrics(audio,schedule){
  return schedule.slice(1).map(r=>{const n=r.start;let maxStep=0,ss=0;for(let j=n-1;j<n+97;j++){if(j>n-1)maxStep=Math.max(maxStep,Math.abs(audio.data[j]-audio.data[j-1]));ss+=audio.data[j]**2;}
    return {ordinal:r.ordinal,boundary:r.boundary,stepAtStart:Math.abs(audio.data[n]-audio.data[n-1]),maxStepAroundJoin:maxStep,rmsAroundJoin:Math.sqrt(ss/98)};});
}
function spectralDifference(a,b,schedule){
  const rows=[];for(const r of schedule.filter(r=>r.boundary==='internal'&&r.start>=3248&&r.start+2048<238800)){
    const x=spectrum(a.data,r.start-2048),y=spectrum(b.data,r.start-2048);let baseline=0,difference=0;
    for(let k=1;k<=2048;k++){baseline+=x.re[k]**2+x.im[k]**2;difference+=(x.re[k]-y.re[k])**2+(x.im[k]-y.im[k])**2;}
    rows.push({ordinal:r.ordinal,relativeComplexSpectrumDifference:baseline>1e-20?Math.sqrt(difference/baseline):null});
  }return {windowFrames:4096,centredOnInternalJoin:true,includesOneJoin:true,edgeFadesExcluded:true,rows};
}
export function run(manifestPath,output){
  const out=privatePath(output);if(fs.existsSync(out))throw Error('existing output rejected');const start=performance.now(),source=loadSources(manifestPath),root=path.dirname(privatePath(manifestPath)),metaFile=path.join(root,'extraction.json');
  noLinks(metaFile);if(fs.statSync(metaFile).size>16*1024*1024)throw Error('metadata size');const metadataBytes=fs.readFileSync(metaFile);if(hash(metadataBytes)!==source.metadataSha256)throw Error('metadata changed');
  const meta=JSON.parse(metadataBytes.toString('utf8')),grains=meta.archives[0].streams.find(s=>s.name==='exhaust_decel').grains.GranularGrains,selected=eligibleIntervals(grains);
  if(JSON.stringify(selected.map(r=>r.index))!==JSON.stringify([93,94,95,96,97]))throw Error('expected five exhaust intervals required');
  const prepared=prepareAblation(source.prepared.exhaust.audio,selected),preparationMs=performance.now()-start,cpu=process.cpuUsage(),a=renderAblation(prepared),b=renderAblation(prepared,{omitInternalBlends:true}),used=process.cpuUsage(cpu);
  const floatComparison=compareAblation(prepared,a.audio,b.audio),bytesA=encodeWav(a.audio),bytesB=encodeWav(b.audio),pcmA=decodeWav(bytesA),pcmB=decodeWav(bytesB),pcmComparison=compareAblation(prepared,pcmA,pcmB);
  const outputs={'A_existing_internal_joins.wav':{sha256:hash(bytesA),...measure(pcmA)},'B_continuous_internal.wav':{sha256:hash(bytesB),...measure(pcmB)}};
  if(Object.values(outputs).some(s=>s.clippedSamples||s.allZero||s.silent20msWindows))throw Error('invalid audio output');
  const report={schemaVersion:1,classification:'Exhaust-only internal continuation-blend ablation, not native synthesis or physical RPM',
    sourceSha256:source.fingerprints.find(s=>s.component==='exhaust').sha256,manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,
    settings:prepared.settings,intervals:selected,schedule:prepared.schedule,preparationMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBytes:process.memoryUsage().rss,
    rendering:{A:a.diagnostics,B:b.diagnostics},floatComparison,pcmComparison,outputs,
    boundaries:{A:boundaryMetrics(pcmA,prepared.schedule),B:boundaryMetrics(pcmB,prepared.schedule),originalInternalSource:selected.slice(1).map(r=>({index:r.index,adjacentStep:Math.abs(prepared.audio.data[r.start]-prepared.audio.data[r.start-1]),slopeChange:Math.abs(prepared.audio.data[r.start+1]-2*prepared.audio.data[r.start]+prepared.audio.data[r.start-1])}))},
    localSpectralDifference:spectralDifference(pcmA,pcmB,prepared.schedule),periods:{A:exactWavePeriods(pcmA.data),B:exactWavePeriods(pcmB.data)},
    listening:'Not established by numerical validation',note:'Identical anchored source path and rates. Internal rate steps remain; only internal blends are omitted. Twenty external wrap blends remain identical.'};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'A_existing_internal_joins.wav'),bytesA,{flag:'wx'});fs.writeFileSync(path.join(out,'B_continuous_internal.wav'),bytesB,{flag:'wx'});
  fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({preparationMs,rendering:report.rendering,pcmComparison,outputs}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw Error('Usage: node tools/Render-ExhaustJoinAblation.mjs PRIVATE_MANIFEST NEW_PRIVATE_OUTPUT');run(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
