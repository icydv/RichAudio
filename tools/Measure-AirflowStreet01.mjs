// Private, original-only STREET-01 listening matrix and complete render costs.
// This never opens GTA, an endpoint, microphone, capture or installed resource.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from '../tests/fixtures/AirflowStreet01.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(![2,3].includes(args.length)||args[0]!=='--output'||args.length===3&&args[2]!=='--prepared')throw Error('Use --output <new private .local directory> [--prepared]');
const prepared=args.length===3;
const output=path.resolve(args[1]),privateRoot=fs.realpathSync(path.join(root,'.local'));
if(!output.startsWith(privateRoot+path.sep)||fs.existsSync(output))throw Error('New private .local output directory required');
fs.mkdirSync(output);if(execFileSync('git',['check-ignore',output],{cwd:root,encoding:'utf8',windowsHide:true}).trim().length===0)throw Error('Private output must be ignored');
const sha=x=>createHash('sha256').update(x).digest('hex'),typed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const referenceCommit='bf7749d85e92fa865ac556917405a393171580f2';
const baseline=execFileSync('git',['show',referenceCommit+':src/acoustics/vehicle/gameplay.mjs'],{cwd:root,encoding:'utf8',windowsHide:true});
const relocated=baseline.replace(/from\s+'([^']+)'/g,(_m,relative)=>"from '"+pathToFileURL(path.resolve(root,'src/acoustics/vehicle',relative)).href+"'");
const originalPath=path.join(output,'baseline-gameplay.mjs');fs.writeFileSync(originalPath,relocated,{flag:'wx'});const {StockGameplay:Original}=await import(pathToFileURL(originalPath).href);
const summarize=values=>{const s=[...values].sort((a,b)=>a-b),at=q=>s[Math.ceil(s.length*q)-1];return {count:s.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),maximumMs:s.at(-1),over8Ms:s.filter(x=>x>8).length,overHardDeadline:s.filter(x=>x>512/48).length,hardDeadlineMs:512/48};};
const metrics=channels=>{let peak=0,sum=0,step=0,nonfinite=0,clipped=0;for(const a of channels)for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));sum+=x*x;if(Math.abs(x)>=.98)clipped++;if(i)step=Math.max(step,Math.abs(x-a[i-1]));}return {peak,rms:Math.sqrt(sum/(channels[0].length*2)),maximumAdjacentStep:step,nonfinite,clipped};};
const blocks=188,frames=blocks*512,duration=frames/48000;
async function run(name,{Engine=StockGameplay,enabled=true,geometry=false,...motion}={}){
 const f=await originalAirflowEngineStreet01({Engine,enabled,geometry,prepared}),engine=f.engine,channels=[new Float32Array(frames),new Float32Array(frames)],timings=[],misses=[],dry=createHash('sha256');let next=0,sequence=0,maxRss=0,source=null,previousFrame=null,sourceContinuity=true,maximumAeroPaths=0,maximumReflectedAeroPaths=0;const costs={prepare:[],pcm:[],airflow:[]};
 // Separate component timers are diagnostic spans. The complete enclosing
 // render timer includes their overhead and is never presented as a sum.
 for(const [object,method,target,async]of [[engine.pipeline,'prepare','prepare',true],[engine.pipeline,'process','pcm',false]]){const original=object[method];object[method]=async?async function(...a){const start=performance.now();try{return await original.apply(this,a);}finally{costs[target].push(performance.now()-start);}}:function(...a){const start=performance.now();try{return original.apply(this,a);}finally{costs[target].push(performance.now()-start);}};}
 try{for(let block=0;block<blocks;block++){const time=block*512/48000;f.setWall(time*1000);
   if(time+1e-10>=next){engine.accept(airflowFrameStreet01(sequence++,next,{duration,...motion}),Math.max(0,(time-next)*1000),180);next+=.04;}
   const start=performance.now();await engine.render();const elapsed=performance.now()-start;timings.push(elapsed);if(elapsed>8)misses.push({block,milliseconds:elapsed,hardDeadlineMiss:elapsed>512/48});
   for(let c=0;c<2;c++)channels[c].set(c===0?engine.left:engine.right,block*512);
   for(const id of engine.ids.filter(id=>!id.endsWith(':aero')))dry.update(typed(engine.inputs[id]));
   const active=engine.slots.find(s=>s.source);if(active){source??=active.source;sourceContinuity&&=source===active.source&&(previousFrame===null||active.source.frame-previousFrame===512);previousFrame=active.source.frame;
    if(active.airflow&&!active.airflow.measuredStreet01){active.airflow.measuredStreet01=true;const original=active.airflow.renderInto;active.airflow.renderInto=function(...a){const start=performance.now();try{return original.apply(this,a);}finally{costs.airflow.push(performance.now()-start);}};}}
   const paths=engine.pipeline.lastControl.paths.filter(p=>p.sourceId.endsWith(':aero'));maximumAeroPaths=Math.max(maximumAeroPaths,paths.length);maximumReflectedAeroPaths=Math.max(maximumReflectedAeroPaths,paths.filter(p=>p.order>0).length);maxRss=Math.max(maxRss,process.memoryUsage.rss());
  }
  const wave=encodeVehicleWav(channels);fs.writeFileSync(path.join(output,name+'.wav'),wave,{flag:'wx'});const d=engine.diagnostics();
  const report={name,enabled,motion,geometry:geometry?'original-finite-wall':'conditional-open-no-coverage-proof',frames,durationSeconds:duration,sampleRate:48000,channels:2,source:'original-analytic-Bati-bank; original-procedural-airflow',sourcePreparation:prepared?'existing-immutable-data-preparation10-before-render':'cold-unprepared-bank',sourcePreparationOutsideRenderMs:f.sourcePreparationMs,pcmSha256:sha(Buffer.concat(channels.map(typed))),wavSha256:sha(wave),engineDryPcmSha256:dry.digest('hex'),metrics:metrics(channels),sourceContinuity,sourceCreations:d.arrivals,maximumAeroPaths,maximumReflectedAeroPaths,fullRenderMs:summarize(timings),coldPrefixMs:summarize(timings.slice(0,24)),laterBlocksMs:summarize(timings.slice(24)),componentSpansMs:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,v.length?summarize(v):null])),everyOver8MsBlock:misses,maximumProcessRssBytes:maxRss,sourceHistoryBytes:d.pipeline.sourceHistoryBytes,limited:d.pipeline.renderer.limited,missingHistory:d.pipeline.renderer.missingHistory,historyAffectedFrames:d.pipeline.history.affectedFrames,airflow:d.airflow??null};
  if(report.metrics.nonfinite||report.metrics.clipped||report.limited||report.missingHistory||report.historyAffectedFrames||!sourceContinuity)throw Error('Original airflow validation failed: '+name);
  console.log(JSON.stringify({name,peak:report.metrics.peak,rms:report.metrics.rms,reflectedAero:maximumReflectedAeroPaths,fullRenderMs:report.fullRenderMs}));return report;
 }finally{await f.close();}
}
const cases=[];
for(const mph of [0,5,30,50,70])for(const enabled of [false,true])cases.push(await run(`rider-${mph}mph-${enabled?'on':'off'}`,{enabled,speed:mph*.44704,rider:true}));
for(const near of [2,15])for(const direction of [-1,1])for(const enabled of [false,true])cases.push(await run(`roadside-${near}m-${direction>0?'east':'west'}-${enabled?'on':'off'}`,{enabled,speed:70*.44704,rider:false,pass:true,near,direction}));
for(const geometry of [false,true])cases.push(await run(`rider-wall-${geometry?'reflections':'open'}`,{enabled:true,speed:50*.44704,rider:true,geometry}));
cases.push(await run('baseline-original-disabled',{Engine:Original,enabled:false,speed:70*.44704,rider:true}));
const original=cases.at(-1),disabled=cases.find(c=>c.name==='rider-70mph-off');
const exactBaselinePcm=original.pcmSha256===disabled.pcmSha256,exactBaselineDryPcm=original.engineDryPcmSha256===disabled.engineDryPcmSha256;
const matched=[];for(const off of cases.filter(c=>c.name.endsWith('-off'))){const on=cases.find(c=>c.name===off.name.slice(0,-4)+'-on');matched.push({off:off.name,on:on.name,engineDryPcmIdentical:off.engineDryPcmSha256===on.engineDryPcmSha256,stereoIdentical:off.pcmSha256===on.pcmSha256});}
const report={schema:1,kind:'RichAudio-STREET01-original-only-airflow-matrix',referenceCommit,baselineGameplaySha256:sha(baseline),currentGameplaySha256:sha(fs.readFileSync(path.join(root,'src/acoustics/vehicle/gameplay.mjs'))),instrumented:true,completeRenderTimerContainsComponentTimerOverhead:true,exactBaselinePcm,exactBaselineDryPcm,matched,cases,endpointOpened:false,gameLaunched:false,captureStarted:false,sourceMaterial:'Only original analytic bank and original procedural noise. No installed metadata/audio/geometry accessed.',listeningAssessment:'Not played; physical presence, comfort and licensed Bati listening remain unverified',gpu:'CPU airflow only; no GPU/gameplay benefit claimed',deadlineAcceptance:cases.every(c=>c.fullRenderMs.over8Ms===0)?'all measured blocks within headroom target':'failed: every retained headroom/deadline miss remains in cases'};
fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(!exactBaselinePcm||!exactBaselineDryPcm||matched.some(x=>!x.engineDryPcmIdentical))throw Error('Required unchanged engine PCM comparison failed');
console.log(JSON.stringify({output,exactBaselinePcm,exactBaselineDryPcm,cases:cases.length,deadlineAcceptance:report.deadlineAcceptance}));
