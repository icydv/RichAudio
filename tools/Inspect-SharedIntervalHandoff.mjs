// Explicit opt-in diagnostic only. Does not render, play or write audio.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import{performance}from'node:perf_hooks';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {hash} from './Inspect-Deceleration.mjs';import{privatePath,noLinks}from'./audio/private-files.mjs';
import {buildCatalogue,planSharedOwnership,policyId} from './audio/shared-interval-handoff.mjs';
function read(p,max){noLinks(p);if(fs.statSync(p).size>max)throw Error('input size bound');return fs.readFileSync(p);}
export function run(manifestFile,reproducedBaselineFile,output){
  const out=privatePath(output),baselineFile=privatePath(reproducedBaselineFile);if(fs.existsSync(out))throw Error('existing output rejected');
  const start=performance.now(),source=loadSources(manifestFile),baselineBytes=read(baselineFile,2*1024*1024),baseline=JSON.parse(baselineBytes),sourceHash=source.fingerprints.find(s=>s.component==='exhaust').sha256;
  if(baseline.gate!=='PARTIAL'||baseline.plan?.failure?.frame!==534906||baseline.sourceSha256!==sourceHash||baseline.manifestSha256!==source.manifestSha256||baseline.metadataSha256!==source.metadataSha256)throw Error('reproduced baseline/fingerprint mismatch');
  const metadata=read(path.join(path.dirname(privatePath(manifestFile)),'extraction.json'),16*1024*1024);if(hash(metadata)!==source.metadataSha256)throw Error('metadata changed');
  const grains=JSON.parse(metadata.toString('utf8')).archives[0].streams.find(s=>s.name==='exhaust_decel').grains.GranularGrains,catalogue=buildCatalogue(grains,source.prepared.exhaust.audio.data.length),preparationMs=performance.now()-start,cpu=process.cpuUsage(),report=planSharedOwnership(baseline,catalogue,sourceHash,{policy:policyId}),used=process.cpuUsage(cpu);
  Object.assign(report,{sourceSha256:sourceHash,manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,baselineSha256:hash(baselineBytes),preparationMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,baselineFailure:baseline.plan.failure,
    outcome:report.complete?'PASS':report.failure?.category==='actual_read'?'NEGATIVE':'INCONCLUSIVE',criticalHandoff:report.failure?.frame<534906?'NOT REACHED; stopped at earlier actual read':'Consult actual transfer evidence',audioGenerated:false});
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'ownership-feasibility.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({outcome:report.outcome,complete:report.complete,validPrefixFrames:report.validPrefixFrames,events:report.events.length,transfers:report.transfers.length,failure:report.failure,performance:report.performance}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==5)throw Error('Usage: node tools/Inspect-SharedIntervalHandoff.mjs PRIVATE_MANIFEST REPRODUCED_BASELINE_JSON NEW_PRIVATE_OUTPUT');const r=run(...process.argv.slice(2));if(!r.complete)process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1;}
}
