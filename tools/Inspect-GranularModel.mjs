// Private numeric diagnostics only. No renderer, playback device or game access.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {performance} from 'node:perf_hooks';
import {decodeWav,limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';import {hash} from './Inspect-Deceleration.mjs';
import {inspectStructure,eligibleIntervals,assessPairs,continuity,texture,localContext,peakFieldHypotheses,statistics} from './audio/granular-model-analysis.mjs';
function read(file,max=limits.bytes){noLinks(file);if(fs.statSync(file).size>max)throw Error('input size bound');return fs.readFileSync(file);}
function readJson(file,max){return JSON.parse(read(file,max).toString('utf8').replace(/^\uFEFF/,''));}
export function inspectModel(extraction,oldHold,newHold,output){
  const root=privatePath(extraction),old=privatePath(oldHold),recent=privatePath(newHold),out=privatePath(output);
  if(fs.existsSync(out))throw Error('existing output rejected');
  const metadataBytes=read(path.join(root,'extraction.json'),16*1024*1024),meta=JSON.parse(metadataBytes.toString('utf8'));
  if(meta.schemaVersion!==1||meta.failed!==false||meta.archives?.length!==2||meta.archives[0]?.container!=='v_twin_2.awc'||!Array.isArray(meta.archives[0].streams)||meta.archives[0].streams.length!==8)throw Error('complete Bati metadata required');
  const started=performance.now(),sources={},structures=[];let totalBytes=0;
  for(const component of ['engine','exhaust'])for(const state of ['decel','accel','idle']){
    const name=component+'_'+state,rows=meta.archives[0].streams.filter(s=>s.name===name);if(rows.length!==1)throw Error('missing/duplicate stream');const s=rows[0];
    if(s.wav!==name+'.wav'||s.codec!==0)throw Error('source layout/codec');const b=read(path.join(root,'player',s.wav));totalBytes+=b.length;
    if(totalBytes>limits.bytes||hash(b)!==s.wavSha256)throw Error('source fingerprint/aggregate bound');const audio=decodeWav(b);
    if(audio.rate!==s.sampleRate||audio.data.length!==s.sampleCount)throw Error('source format');
    const grains=s.grains?.GranularGrains,loops=s.loops?.GranularLoops;if(s.loops?.GranularLoopsCount!==loops?.length||s.grains?.ChunkSize!==4+12*grains?.length)throw Error('granular count/size');
    const structure=inspectStructure(grains,loops,audio,s.grains.UnkFloat1);
    sources[name]={audio,grains,loops};structures.push({name,sha256:hash(b),...structure,peakFieldHypotheses:peakFieldHypotheses(audio,grains)});
  }
  const engine=sources.engine_decel,exhaust=sources.exhaust_decel,pairs=assessPairs(engine,exhaust),comparisons=[];
  for(const component of ['engine','exhaust']){
    const source=sources[component+'_decel'],selected=eligibleIntervals(source.grains);
    if(selected.length<2)throw Error('insufficient consecutive state-local material');
    const start=selected[0].start,end=selected.at(-1).end;
    const original={continuity:continuity(source.audio,source.grains,selected),texture:texture(source.audio,start,end),contextStateDrift:localContext(source.grains,selected)};
    const holds=[];
    for(const [label,folder]of [['reference',old],['reordered',recent]]){
      const r=readJson(path.join(folder,'analysis.json'),2*1024*1024),file=component+'.wav',bytes=read(path.join(folder,file));
      if(r.schemaVersion!==1||r.control?.duration!==5||r.engineScale!==0.35||!Array.isArray(r.control.points)||r.control.points.length!==2||r.control.points[0].t!==0||r.control.points[1].t!==5||r.control.points.some(p=>p.state!==0.5)||!Array.isArray(r.sources)||r.sources.find(s=>s.component===component)?.sha256!==structures.find(s=>s.name===component+'_decel').sha256||hash(bytes)!==r.outputs?.[file]?.sha256)throw Error('held-source/control/fingerprint mismatch');
      const audio=decodeWav(bytes),schedule=r.diagnostics?.schedule;
      if(audio.rate!==48000||audio.channels!==1||audio.data.length!==240000||!Array.isArray(schedule)||schedule.length!==105||schedule[0].start!==0||schedule.at(-1).end!==240000||schedule.some((s,i)=>!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<0||s.end>s.start+2400||s.end<=s.start||s.value!==21||i&&s.start!==schedule[i-1].end||!Number.isSafeInteger(s[component+'Index'])||s[component+'Index']<0||s[component+'Index']>=source.grains.length-1))throw Error('held layout/schedule');
      const gain=component==='engine'?0.07:0.15,span=end-start,center=120000,localStart=center-Math.floor(span/2);
      const naturalSuccessors=schedule.slice(1).filter((s,i)=>s[component+'Index']===schedule[i][component+'Index']+1).length;
      const steps=schedule.slice(1).map(s=>Math.abs(audio.data[s.start]-audio.data[s.start-1])/gain);
      holds.push({label,sha256:hash(bytes),gainRemovedForEnvelopeComparison:gain,equalDurationTexture:texture(audio,localStart,localStart+span,1/gain),
        longHoldTexture:texture(audio,4800,235200,1/gain),naturalSourceSuccessors:naturalSuccessors,transitions:schedule.length-1,
        boundaryStepsRawScale:statistics(steps),selectedIntervals:[...new Set(schedule.map(s=>s[component+'Index']))],
        limitation:'PCM16 quantisation differs from original before gain removal. Short local sources cannot certify long-term texture at fixed state.'});
    }
    comparisons.push({component,original,holds});
  }
  const result={schemaVersion:1,metadataSha256:hash(metadataBytes),structures,pairs,comparisons,
    elapsedMs:performance.now()-started,rssBytes:process.memoryUsage().rss,
    scope:'Existing private Bati source metadata/audio and previous holds. Numeric diagnostics only; no synthesis or listening.',
    classification:'Static analysis cannot reconstruct the native scheduler or assign physical RPM/phase.'};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);
  fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({streams:structures.length,combinations:pairs.combinations.length,compatible:pairs.combinations.filter(r=>r.classification==='PLAUSIBLE BUT UNVERIFIED').length,elapsedMs:result.elapsedMs,privateNumericOnly:true}));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==6)throw Error('Usage: node tools/Inspect-GranularModel.mjs PRIVATE_EXTRACTION REFERENCE_HOLD REORDERED_HOLD NEW_PRIVATE_OUTPUT');inspectModel(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
