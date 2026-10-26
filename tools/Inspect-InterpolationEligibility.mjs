// Two isolated original-source boundary queries only. No planner, renderer or device.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {loadSources} from './Render-ResponsiveEngine.mjs';import {hash} from './Inspect-Deceleration.mjs';import {privatePath,noLinks,within} from './audio/private-files.mjs';
import {buildCatalogue,checkReadOperation} from './audio/shared-interval-handoff.mjs';
import {bindPcmSource,inspectBoundarySupport} from './audio/interpolation-eligibility.mjs';
const pins=Object.freeze({manifest:'60C7226D1ACA1CB983F7C0CB40CADF9001B7803104959A25029BF416709A0AF5',metadata:'A46E440BE76E42ABF55F37444836C3BF4B392E9CE3292A5755579DB383697288',wav:'574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F',pcm:'E21A779780B24755250BBA1674E673C6436C3B58E3CC6AEA0E9CDE00D6E5D70F'});
function read(p,max){noLinks(p);if(!fs.statSync(p).isFile()||fs.statSync(p).size>max)throw Error('bounded regular input required');return fs.readFileSync(p);}
export function run(manifestPath,output){
  const out=privatePath(output);if(fs.existsSync(out))throw Error('existing output rejected');
  const manifestFile=privatePath(manifestPath),root=path.dirname(manifestFile),started=performance.now(),mBytes=read(manifestFile,2*1024*1024),metaBytes=read(path.join(root,'extraction.json'),16*1024*1024);
  if(hash(mBytes)!==pins.manifest||hash(metaBytes)!==pins.metadata)throw Error('approved manifest/metadata fingerprints changed');
  const loaded=loadSources(manifestFile),manifest=JSON.parse(mBytes),metadata=JSON.parse(metaBytes),stream=metadata.archives[0].streams.find(s=>s.name==='exhaust_decel'),entry=manifest.sources.find(s=>s.component==='exhaust'&&s.state==='decel'),wavFile=path.resolve(root,entry.file);
  if(!within(wavFile,root)||stream.id!=='0E804842'||stream.wavSha256!==pins.wav||stream.pcmSha256!==pins.pcm)throw Error('approved original source mismatch');
  const source=bindPcmSource(read(wavFile,4*1024*1024),{streamId:'v_twin_2:'+stream.id,wavSha256:pins.wav,pcmSha256:pins.pcm,spans:[{start:0,end:stream.sampleCount,originalStart:0,asset:'v_twin_2:'+stream.id}]}),catalogue=buildCatalogue(stream.grains.GranularGrains,source.frames),r=catalogue.rows[93];
  if(r.start!==151154||r.end!==153403||catalogue.rows[92].end!==r.start)throw Error('original marker/cursor mismatch');
  const event={interval:93,start:0,end:2286,clockStart:0,clockEnd:48000/21,requestedState:21,stateRange:[21,21],sourceStart:r.start,sourceEnd:r.end,rate:r.frames/2286,sourceKey:source.sourceKey},preparationMs=performance.now()-started,analysisStart=performance.now();
  // The unchanged old checker examines this first event only, never a trajectory.
  const old=checkReadOperation({kind:'target',startFrame:0,endFrame:2286,activeInterval:93,sourcePosition:r.start,rate:event.rate},catalogue,source.sourceKey);
  if(old.passed||old.failure.frame!==0||old.failure.providerInterval!==92)throw Error('historical per-provider rejection changed');
  const queries=[0,1].map(frame=>({frame,position:r.start+frame*event.rate,kind:'target',gain:.15,mixWeight:1,retained:true,fadeFrames:1200,presentationStart:0,presentationEnd:240000})),bounded=inspectBoundarySupport(source,catalogue,event,queries);
  const report={schemaVersion:1,scope:'Initial 92/93 boundary only; no trajectory, ownership change or audio output',outcome:bounded.passed?'PASS':'INCONCLUSIVE',sourceSha256:source.sourceKey,pcmSha256:source.pcmSha256,manifestSha256:loaded.manifestSha256,metadataSha256:loaded.metadataSha256,event,
    interpretationA:{passed:old.passed,failure:old.failure,providers:old.providers},interpretationB:bounded,
    interpretationC:'Required if provenance, original mapping or independent-read authorisation cannot be established; native scheduler semantics remain unresolved',
    performance:{preparationMs,analysisMs:performance.now()-analysisStart,rssBytes:process.memoryUsage().rss,isolatedQueries:queries.length,filterLoadsPerQuery:24},trajectoryRetried:false,ownershipTested:false,audioGenerated:false};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'eligibility.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({outcome:report.outcome,oldFailure:old.failure,points:bounded.points.map(({frame,memoryReads,numericallyNonzeroWeights,nonzeroActualTerms,finalNonzeroWeights,finalNonzeroTerms,finalGain,existingSamplerAgreement})=>({frame,memoryReads,numericallyNonzeroWeights,nonzeroActualTerms,finalNonzeroWeights,finalNonzeroTerms,finalGain,existingSamplerAgreement})),performance:report.performance}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw Error('Usage: node tools/Inspect-InterpolationEligibility.mjs PRIVATE_MANIFEST NEW_PRIVATE_OUTPUT');if(run(...process.argv.slice(2)).outcome!=='PASS')process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1;}
}
