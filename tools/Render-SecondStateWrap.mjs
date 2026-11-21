// One preregistered offline comparison. No playback, archive access or runtime APIs.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {encodeWav,decodeWav,limits} from '../src/offline-audio/stock-source.mjs';import {hash} from './Inspect-Deceleration.mjs';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {privatePath,noLinks} from './audio/private-files.mjs';
import {selectSecondState,prepareSecondState,renderSecondState,inspectSecondState} from './audio/second-state-wrap.mjs';
import {exactWavePeriods,lagComparison} from './audio/wave-recurrence.mjs';import {texture,intervalFeatures} from './audio/granular-model-analysis.mjs';
function read(file,max=limits.bytes){noLinks(file);if(fs.statSync(file).size>max)throw Error('input bound');return fs.readFileSync(file);}
const json=p=>JSON.parse(read(p,2*1024*1024).toString('utf8'));
function save(out,report,files={}){fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);for(const [name,b]of Object.entries(files))fs.writeFileSync(path.join(out,name),b,{flag:'wx'});fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
const gcd=(a,b)=>b?gcd(b,a%b):a;
export function run(manifestFile,selectionFile,referencePack,output,{reverseOrder=false}={}){
  if(typeof reverseOrder!=='boolean')throw Error('measurement order');const out=privatePath(output),selectedFile=privatePath(selectionFile),reference=privatePath(referencePack);if(fs.existsSync(out))throw Error('existing output rejected');
  const start=performance.now(),source=loadSources(manifestFile),sourceHash=source.fingerprints.find(r=>r.component==='exhaust').sha256,metadata=read(path.join(path.dirname(privatePath(manifestFile)),'extraction.json'),16*1024*1024);
  if(hash(metadata)!==source.metadataSha256)throw Error('metadata fingerprint');const grains=JSON.parse(metadata.toString('utf8')).archives[0].streams.find(s=>s.name==='exhaust_decel').grains.GranularGrains,selection=selectSecondState(grains,source.prepared.exhaust.audio.data.length),receipt=json(selectedFile);
  if(receipt.schemaVersion!==1||receipt.sourceSha256!==sourceHash||JSON.stringify(selection)!==JSON.stringify({rule:receipt.rule,chosen:receipt.chosen,candidates:receipt.candidates}))throw Error('preselected state/fingerprint changed');
  const history=json(path.join(reference,'analysis.json')),referenceBytes=read(path.join(reference,'B_outer_blends_removed.wav'));
  if(history.schemaVersion!==1||hash(referenceBytes)!==history.outputs?.['B_outer_blends_removed.wav']?.sha256||history.sourceSha256!==sourceHash||history.manifestSha256!==source.manifestSha256||history.metadataSha256!==source.metadataSha256||history.settings?.markerState!==21)throw Error('historical state-21 reference mismatch');
  const report={schemaVersion:1,classification:'Single preselected second-state outer-wrap ablation; synthetic relative state, not physical RPM or native synthesis',sourceSha256:sourceHash,manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,selectionReceiptSha256:hash(read(selectedFile)),selection,referenceSha256:hash(referenceBytes),listening:'Pending; no perceptual conclusion from numeric results',reverseOrder};
  let p;try{p=prepareSecondState(source.prepared.exhaust.audio,selection.chosen.intervals,selection.chosen.state);}catch(e){if(!e.safety)throw e;report.status='UNSAFE_NO_PREVIEWS';report.preparationSafety=e.safety;save(out,report);return report;}
  report.preparationMs=performance.now()-start;report.settings=p.settings;report.schedule=p.schedule;
  const cpu=process.cpuUsage();let a,b;if(reverseOrder){b=renderSecondState(p,{omitOuterBlends:true});a=renderSecondState(p);}else{a=renderSecondState(p);b=renderSecondState(p,{omitOuterBlends:true});}
  const used=process.cpuUsage(cpu);Object.assign(report,{rendering:{A:a.diagnostics,B:b.diagnostics},cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBytes:process.memoryUsage().rss,floatComparison:inspectSecondState(p,a.audio,b.audio)});
  if(!report.floatComparison.safety.passed){report.status='UNSAFE_NO_PREVIEWS';save(out,report);return report;}
  const bytesA=encodeWav(a.audio),bytesB=encodeWav(b.audio),pa=decodeWav(bytesA),pb=decodeWav(bytesB);report.pcmComparison=inspectSecondState(p,pa,pb);
  report.outputs={'A_second_state_outer_blends.wav':{sha256:hash(bytesA),...report.pcmComparison.measurements.A},'B_second_state_direct_wrap.wav':{sha256:hash(bytesB),...report.pcmComparison.measurements.B}};
  const state=p.settings.markerState,count=p.intervals.length,clockPattern=state/gcd(48000,state),eventPattern=count*clockPattern/gcd(count,clockPattern),lag=Math.round(eventPattern*48000/state),passLag=Math.round(count*48000/state);
  report.schedulePeriod={intervalPatternEvents:count,roundedClockPatternEvents:clockPattern,combinedEvents:eventPattern,frames:lag,seconds:lag/48000,nearPassLagFrames:passLag};
  report.recurrence=Object.fromEntries([['A',pa],['B',pb]].map(([label,w])=>[label,{exact:exactWavePeriods(w.data),scheduleLag:lag<p.settings.frames-9600?lagComparison(w.data,lag):{unavailable:'Schedule period exceeds the observed interior'},nearPassLag:lagComparison(w.data,passLag)}]));
  report.texture={A:texture(pa,4800,235200),B:texture(pb,4800,235200),note:'32 fixed 4096-frame observations: envelope, spectral centroid/bands and normalised spectral flux; not a physical fundamental or naturalness test.'};
  report.sourceFeatures=p.intervals.map(r=>intervalFeatures(source.prepared.exhaust.audio,r));
  report.status=!report.pcmComparison.safety.passed?'UNSAFE_NO_PREVIEWS':report.pcmComparison.resolution.meaningfulAtPcm16?'READY_FOR_LISTENING':'SAFE_BELOW_RESOLUTION_SCREEN';
  save(out,report,report.status==='UNSAFE_NO_PREVIEWS'?{}:{'A_second_state_outer_blends.wav':bytesA,'B_second_state_direct_wrap.wav':bytesB});
  console.log(JSON.stringify({status:report.status,state:selection.chosen.state,events:p.schedule.length,comparison:report.pcmComparison.all,safety:report.pcmComparison.safety,rendering:report.rendering}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==6)throw Error('Usage: node tools/Render-SecondStateWrap.mjs PRIVATE_MANIFEST PRESELECTION STATE21_REFERENCE_PACK NEW_PRIVATE_OUTPUT');const r=run(...process.argv.slice(2));if(r.status!=='READY_FOR_LISTENING')process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1;}
}
