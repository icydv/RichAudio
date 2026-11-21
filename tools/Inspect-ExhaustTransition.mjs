// Diagnostic-only CLI: reads existing private material and writes one JSON report.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {hash} from './Inspect-Deceleration.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';import {auditTransition} from './audio/transition-feasibility.mjs';
const fingerprints=Object.freeze({source:'574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F',
  state21B:'3BD4C814A3EB88B5B6D6616581B9220623BA3B49515F85D7F9BBCDC3B99CC81F',
  state27A:'90440947872CC5EE180E755A48A1D43A74CD7C70497405CEB7D8E85A99607546',
  state27B:'944D59F31B453CE82C464968649ECAD2C303BAA04BC519D762047FB1195E4911'});
function read(file,max){noLinks(file);if(fs.statSync(file).size>max)throw Error('input size bound');return fs.readFileSync(file);}
function verifyHistory(pack,state,source,names){
  const dir=privatePath(pack),history=JSON.parse(read(path.join(dir,'analysis.json'),2*1024*1024));
  if(history.sourceSha256!==fingerprints.source||history.manifestSha256!==source.manifestSha256||history.metadataSha256!==source.metadataSha256||history.settings?.markerState!==state)throw Error('historical source/manifest/metadata mismatch');
  for(const [file,expected]of names){const b=read(path.join(dir,file),1024*1024);if(hash(b)!==expected||history.outputs?.[file]?.sha256!==expected)throw Error('historical reference fingerprint mismatch');}
}
export function run(manifestFile,state21Pack,state27Pack,output){
  const out=privatePath(output);if(fs.existsSync(out))throw Error('existing output rejected');
  const start=performance.now(),source=loadSources(manifestFile);if(source.fingerprints.find(r=>r.component==='exhaust').sha256!==fingerprints.source)throw Error('pinned source fingerprint mismatch');
  verifyHistory(state21Pack,21,source,[['B_outer_blends_removed.wav',fingerprints.state21B]]);
  verifyHistory(state27Pack,27,source,[['A_second_state_outer_blends.wav',fingerprints.state27A],['B_second_state_direct_wrap.wav',fingerprints.state27B]]);
  const metadata=read(path.join(path.dirname(privatePath(manifestFile)),'extraction.json'),16*1024*1024);if(hash(metadata)!==source.metadataSha256)throw Error('metadata fingerprint changed');
  const grains=JSON.parse(metadata.toString('utf8')).archives[0].streams.find(s=>s.name==='exhaust_decel').grains.GranularGrains,preparationMs=performance.now()-start,cpu=process.cpuUsage(),report=auditTransition(source.prepared.exhaust.audio,grains,{lowerIndices:[93,94,95,96,97],upperIndices:[66,67,68,69]}),used=process.cpuUsage(cpu);
  Object.assign(report,{classification:'Offline feasibility only; no transition renderer or audio output',sourceSha256:fingerprints.source,manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,referenceFingerprints:fingerprints,preparationMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,listening:'NOT TESTED; no transition audio exists',renderer:'NOT IMPLEMENTED'});
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'feasibility.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({gate:report.gate,pointwiseCoverage:report.coverage.individualCoverage.full,contextCoverage:report.coverage.contextCoverage.full,candidatePathRegions:report.route?.length,plannedEvents:report.plan?.events.length,plannedHandoffs:report.plan?.handoffs.length,failure:report.plan?.failure,performance:report.performance}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==6)throw Error('Usage: node tools/Inspect-ExhaustTransition.mjs PRIVATE_MANIFEST STATE21_PACK STATE27_PACK NEW_PRIVATE_OUTPUT');const r=run(...process.argv.slice(2));if(r.gate!=='PASS')process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1;}
}
