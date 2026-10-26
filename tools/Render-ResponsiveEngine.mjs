// Local file research only; no audio device, game, network or native API.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {decodeWav,encodeWav,measure,limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath,noLinks,within} from './audio/private-files.mjs';
import {hash} from './Inspect-Deceleration.mjs';
import {prepareSources,renderResponsive} from './audio/responsive-engine.mjs';
function read(file,max=limits.bytes){noLinks(file);if(fs.statSync(file).size>max)throw Error('input size bound');return fs.readFileSync(file);}
const json=file=>JSON.parse(read(file,2*1024*1024).toString('utf8').replace(/^\uFEFF/,''));
export function loadSources(manifestPath){
  const manifestFile=privatePath(manifestPath),root=path.dirname(manifestFile),m=json(manifestFile),metadataFile=path.join(root,'extraction.json');
  const metadataBytes=read(metadataFile,16*1024*1024),meta=JSON.parse(metadataBytes.toString('utf8'));
  if(m.schemaVersion!==1||m.family!=='bati/v_twin_2'||!Array.isArray(m.sources)||m.sources.length!==6||meta.failed!==false||meta.archives?.[0]?.container!=='v_twin_2.awc')throw Error('Bati source manifest required');
  const sources={},fingerprints=[];let bytes=0;
  for(const component of ['engine','exhaust']){
    const rows=m.sources.filter(s=>s.component===component&&s.state==='decel');if(rows.length!==1)throw Error('missing/duplicate source');const row=rows[0];
    const matches=meta.archives[0].streams.filter(s=>s.name===component+'_decel');if(matches.length!==1)throw Error('missing metadata');const s=matches[0];
    const file=path.resolve(root,row.file);if(!within(file,root)||s.codec!==0||s.wavSha256!==row.sha256)throw Error('source path/codec/fingerprint disagreement');
    const b=read(file);bytes+=b.length;if(bytes>limits.bytes||hash(b)!==row.sha256)throw Error('source fingerprint/size mismatch');
    const audio=decodeWav(b);if(audio.rate!==row.sampleRate||audio.channels!==row.channels||audio.data.length!==row.sampleCount)throw Error('source format mismatch');
    sources[component]={audio,grains:s.grains.GranularGrains};fingerprints.push({component,sha256:hash(b)});
  }
  return {prepared:prepareSources(sources.engine,sources.exhaust),fingerprints,manifestSha256:hash(read(manifestFile)),metadataSha256:hash(metadataBytes)};
}
export function run(manifestPath,scenariosFile,name,output){
  const out=privatePath(output);if(fs.existsSync(out))throw Error('existing output rejected');
  const settings=json(scenariosFile);if(settings.schemaVersion!==1||!['A_hold','B_sweep','C_steps'].includes(name)||!settings.scenarios?.[name])throw Error('unknown scenario');
  const preparationStart=performance.now(),source=loadSources(manifestPath),preparationMs=performance.now()-preparationStart;
  const cpu=process.cpuUsage(),start=performance.now(),result=renderResponsive(source.prepared,settings.scenarios[name].points,{duration:settings.scenarios[name].duration,engineScale:settings.engineScale,selectionMode:settings.selectionMode,selectionSeed:settings.selectionSeed});
  const renderMs=performance.now()-start,used=process.cpuUsage(cpu),names={engine:'engine.wav',exhaust:'exhaust.wav',preferred:'mix_exhaust_led.wav',referenceGain:'mix_reference_gain.wav'},pending={},outputs={};
  for(const [key,file]of Object.entries(names)){const b=encodeWav(result[key]),stats=measure(decodeWav(b));if(stats.clippedSamples||stats.allZero)throw Error('silent/clipped output');pending[file]=b;outputs[file]={sha256:hash(b),...stats};}
  const report={schemaVersion:1,rendererVersion:2,scenario:name,perceptualAcceptance:'Not established by rendering; consult checkpoint listening evidence',classification:'Synthetic normalised operating state; deceleration-family cycles in both directions; not physical RPM/load',
    manifestSha256:source.manifestSha256,metadataSha256:source.metadataSha256,sources:source.fingerprints,engineScale:settings.engineScale,control:settings.scenarios[name],
    preparationMs,renderMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBytes:process.memoryUsage().rss,outputs,diagnostics:result.diagnostics};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);
  for(const [file,b]of Object.entries(pending))fs.writeFileSync(path.join(out,file),b,{flag:'wx'});
  fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({scenario:name,renderMs,cycles:result.diagnostics.cycles,rejected:result.diagnostics.rejectedSegments,fallbacks:result.diagnostics.fallbacks,outputs}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==6)throw Error('Usage: node tools/Render-ResponsiveEngine.mjs PRIVATE_MANIFEST SCENARIOS SCENARIO NEW_PRIVATE_OUTPUT');run(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
