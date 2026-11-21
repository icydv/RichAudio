// Private fixed A/B only. No playback, archive access or game/runtime operations.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {encodeWav,decodeWav,limits} from '../src/offline-audio/stock-source.mjs';import {hash} from './Inspect-Deceleration.mjs';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {privatePath,noLinks} from './audio/private-files.mjs';
import {eligibleIntervals} from './audio/granular-model-analysis.mjs';import {prepareAblation} from './audio/exhaust-join-ablation.mjs';
import {renderOuterWrap,inspectOuterWrap} from './audio/outer-wrap-ablation.mjs';import {exactWavePeriods,lagComparison} from './audio/wave-recurrence.mjs';
function read(file,max=limits.bytes){noLinks(file);if(fs.statSync(file).size>max)throw Error('input bound');return fs.readFileSync(file);}
function save(out,report,files={}){fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);for(const[n,b]of Object.entries(files))fs.writeFileSync(path.join(out,n),b,{flag:'wx'});fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
export function run(manifestPath,previousPack,output,{reverseOrder=false}={}){
  if(typeof reverseOrder!=='boolean')throw Error('measurement order flag');const out=privatePath(output),previous=privatePath(previousPack);if(fs.existsSync(out))throw Error('existing output rejected');
  const start=performance.now(),source=loadSources(manifestPath),root=path.dirname(privatePath(manifestPath)),metadata=read(path.join(root,'extraction.json'),16*1024*1024);
  if(hash(metadata)!==source.metadataSha256)throw Error('metadata changed');const meta=JSON.parse(metadata.toString('utf8')),grains=meta.archives[0].streams.find(s=>s.name==='exhaust_decel').grains.GranularGrains,selected=eligibleIntervals(grains);
  if(JSON.stringify(selected.map(r=>r.index))!=='[93,94,95,96,97]')throw Error('expected five source intervals');
  const history=JSON.parse(read(path.join(previous,'analysis.json'),2*1024*1024).toString('utf8')),priorBytes=read(path.join(previous,'B_continuous_internal.wav'));
  if(history.schemaVersion!==1||hash(priorBytes)!==history.outputs?.['B_continuous_internal.wav']?.sha256||history.sourceSha256!==source.fingerprints.find(s=>s.component==='exhaust').sha256||history.manifestSha256!==source.manifestSha256||history.metadataSha256!==source.metadataSha256)throw Error('historical reference fingerprint mismatch');
  const prepared=prepareAblation(source.prepared.exhaust.audio,selected),preparationMs=performance.now()-start,cpu=process.cpuUsage();let a,b;
  if(reverseOrder){b=renderOuterWrap(prepared,{omitOuterBlends:true});a=renderOuterWrap(prepared);}else{a=renderOuterWrap(prepared);b=renderOuterWrap(prepared,{omitOuterBlends:true});}
  const used=process.cpuUsage(cpu),floatComparison=inspectOuterWrap(prepared,a.audio,b.audio),bytesA=encodeWav(a.audio);
  if(hash(bytesA)!==hash(priorBytes))throw Error('historical PCM reproduction failed');
  const report={schemaVersion:1,classification:'One outer continuation-blend ablation; internal blends remain omitted; not native synthesis or physical RPM',
    sourceSha256:source.fingerprints.find(s=>s.component==='exhaust').sha256,manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,baselineSha256:hash(priorBytes),baselineReproduced:true,
    settings:prepared.settings,intervals:selected,schedule:prepared.schedule,preparationMs,rendering:{A:a.diagnostics,B:b.diagnostics},reverseOrder,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBytes:process.memoryUsage().rss,floatComparison,
    status:floatComparison.safety.passed?'ENGINEERING_VALIDATION_PENDING_PCM':'UNSAFE_NO_PREVIEWS',listening:'Not established'};
  if(!floatComparison.safety.passed){save(out,report);return report;}
  const bytesB=encodeWav(b.audio),pcmA=decodeWav(bytesA),pcmB=decodeWav(bytesB),pcmComparison=inspectOuterWrap(prepared,pcmA,pcmB);report.pcmComparison=pcmComparison;
  report.outputs={'A_existing_outer_wraps.wav':{sha256:hash(bytesA),...pcmComparison.measurements.A},'B_outer_blends_removed.wav':{sha256:hash(bytesB),...pcmComparison.measurements.B}};
  report.periods=Object.fromEntries([['A',pcmA],['B',pcmB]].map(([label,w])=>[label,{exact:exactWavePeriods(w.data),historicalLag:lagComparison(w.data,80000),nearPassLag:lagComparison(w.data,11429)}]));
  report.status=!pcmComparison.safety.passed?'UNSAFE_NO_PREVIEWS':pcmComparison.resolution.meaningfulAtPcm16?'READY_FOR_LISTENING':'SAFE_BELOW_RESOLUTION_SCREEN';
  save(out,report,pcmComparison.safety.passed?{'A_existing_outer_wraps.wav':bytesA,'B_outer_blends_removed.wav':bytesB}:{});
  console.log(JSON.stringify({status:report.status,baselineReproduced:true,comparison:pcmComparison.all,safety:pcmComparison.safety,resolution:pcmComparison.resolution,rendering:report.rendering}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==5)throw Error('Usage: node tools/Render-OuterWrapAblation.mjs PRIVATE_MANIFEST P2_03_6_PACK NEW_PRIVATE_OUTPUT');const r=run(...process.argv.slice(2));if(r.status!=='READY_FOR_LISTENING')process.exitCode=2;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
