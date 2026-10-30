// Read-only old audition inventory and bounded all-bank exterior mix probe.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const codeRoot=path.resolve(process.argv[2]??path.join(root,'../RichAudio-StockSource02'));
const phase=process.argv[3]??'initial02';assert.ok(/^[\w-]+$/.test(phase));
const verifiedPhase=phase.startsWith('new03-corrected-texture-verified');
const privateRoot=path.join(root,'.local/stock-source-03');fs.mkdirSync(privateRoot,{recursive:true});
assert.ok(!fs.existsSync(path.join(privateRoot,'mix-'+phase+'.json')),'fresh mix phase name required; prior evidence is preserved');
const old01=path.resolve(root,'../RichAudio-StockSource01'),old02=path.resolve(root,'../RichAudio-StockSource02');
const sha=b=>createHash('sha256').update(b).digest('hex');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]).sort();}
const groups={audition01:path.join(old01,'.local/stock-source-01/audition-02'),evidence01:path.join(old01,'evidence'),
  audition02:path.join(old02,'.local/stock-source-02/audition'),distance02:path.join(old02,'.local/stock-source-02/distance'),evidence02:path.join(old02,'evidence')};
const inventoryFile=path.join(privateRoot,'previous-inventory.json');
if(!fs.existsSync(inventoryFile)){
  const inventory=Object.fromEntries(Object.entries(groups).map(([name,directory])=>[name,{directory,
    files:files(directory).map(file=>({file:path.relative(directory,file).replaceAll('\\','/'),sha256:sha(fs.readFileSync(file))}))}]));
  fs.writeFileSync(inventoryFile,JSON.stringify(inventory,null,2));
}
const inventory=JSON.parse(fs.readFileSync(inventoryFile,'utf8'));
function verifyInventory(){
  const summary={};
  for(const [name,group] of Object.entries(inventory)){
    assert.equal(files(group.directory).length,group.files.length,'old directory file count changed');
    for(const item of group.files)assert.equal(sha(fs.readFileSync(path.join(group.directory,item.file))),item.sha256,'old file hash changed');
    summary[name]={files:group.files.length,allSha256Unchanged:true};
  }return summary;
}
const inventorySummary=verifyInventory();assert.equal(inventorySummary.audition01.files,72);
const reproductionFile=path.join(privateRoot,'reproduced-baseline/source-reproduction.json');
const reproduction=JSON.parse(fs.readFileSync(reproductionFile,'utf8'));
function originalMono(file){const b=fs.readFileSync(file);assert.equal(b.readUInt16LE(20),3);assert.equal(b.readUInt16LE(22),2);
  const mono=Buffer.alloc(b.readUInt32LE(40)/2);for(let i=0;i<mono.length/4;i++)b.copy(mono,i*4,44+i*8,48+i*8);return mono;}
const reproductionBindings=[];
for(const model of ['schafter3','bati']){
  const b=fs.readFileSync(path.join(privateRoot,'reproduced-baseline',model+'-reproduced-source.f32'));
  const original=originalMono(path.join(groups.audition02,model,'corrected-source.wav'));
  assert.ok(b.equals(original)&&reproduction[model].exact_source_reproduction&&reproduction[model].maximum_error===0);
  reproductionBindings.push({model,monoFloat32Sha256:sha(b),bitwiseEqual:true,...reproduction[model]});
}
const baseline={schemaVersion:1,milestone:'STOCK-SOURCE-03',baselineCommit:'3fa6649fd687bf524bd3cc9df8847cdf6a0026b4',
  previousInventories:inventorySummary,privateInventorySha256:sha(fs.readFileSync(inventoryFile)),
  reproducedSources:reproductionBindings,reproductionReportSha256:sha(fs.readFileSync(reproductionFile)),
  interpretation:'Reported peak autocorrelation is reproduced evidence of the reviewed held excerpt; not a universal engine periodicity rejection threshold.',
  gameLaunched:false,audioEndpointOpened:false,subjectiveListening:'not performed'};
fs.writeFileSync(path.join(root,'evidence/stock-source-03-baseline.json'),JSON.stringify(baseline,null,2));
const load=relative=>import(pathToFileURL(path.join(codeRoot,relative)).href);
const coreFiles=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs',
  'src/acoustics/vehicle/pipeline.mjs','src/acoustics/engine/paths.mjs','tools/stock-source-01-scenario.mjs'];
const coreBindings=Object.fromEntries(coreFiles.map(file=>[file,sha(fs.readFileSync(path.join(codeRoot,file)))]));
const {loadStockAssets,StockVehicleSource}=await load('src/acoustics/vehicle/stock-source.mjs');
const {VehicleAcousticPipeline}=await load('src/acoustics/vehicle/pipeline.mjs');
const {createVehicleEnvironment}=await load('src/acoustics/vehicle/environment.mjs');
const {stockPose,stockEmitters}=await load('tools/stock-source-01-scenario.mjs');
const sustainAtlasFile=process.argv[4]?path.resolve(process.argv[4]):codeRoot===root?path.join(privateRoot,'sustain-assets/atlas.json'):undefined;
const assets=loadStockAssets(path.join(old01,'.local/stock-source-01/assets-native/manifest.json'),{sustainAtlasFile});
const FS=48000,BLOCK=512,G=1.5956559506856056,duration=8,total=FS*duration;
const roles=['engine','exhaust'],states={idle:{window:[.8,1.8],control:{operatingPoint:.1,load:.12,running:true,lift:false}},
  load:{window:[3.5,4.8],control:{operatingPoint:.95,load:.95,running:true,lift:false}},
  lift:{window:[6,7.6],control:{operatingPoint:.55,load:.05,running:true,lift:true}}};
const views={front:[5,0,1.4],side:[0,5,1.4],rear:[-5,0,1.4]};
const authoredRadiation={bati:.45,lectro:.40,prototipo:.30,schafter3:.35};
const targets={bati:{idle:-1,load:4,lift:4},lectro:{idle:-1,load:3,lift:3},
  prototipo:{idle:0,load:3,lift:3},schafter3:{idle:0,load:3,lift:4}};
const db=x=>x>0?20*Math.log10(x):null;
function metrics(arrays,window=[0,duration]){
  const lo=Math.round(window[0]*FS),hi=Math.round(window[1]*FS);let energy=0,peak=0;
  for(const array of arrays)for(let i=lo;i<hi;i++){const x=array[i];assert.ok(Number.isFinite(x));energy+=x*x;peak=Math.max(peak,Math.abs(x));}
  const rms=Math.sqrt(energy/((hi-lo)*arrays.length));return {rms,rmsDbfs:db(rms),peak,peakDbfs:db(peak)};
}
const fftPlans=new Map();
function spectrum(input,n=8192){
  let plan=fftPlans.get(n);if(!plan){plan={cos:Float64Array.from({length:n/2},(_,i)=>Math.cos(-2*Math.PI*i/n)),sin:Float64Array.from({length:n/2},(_,i)=>Math.sin(-2*Math.PI*i/n))};fftPlans.set(n,plan);}
  const re=Float64Array.from(input.subarray(0,n),(v,i)=>v*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let w=2;w<=n;w*=2){const stride=n/w;for(let at=0;at<n;at+=w)for(let j=0;j<w/2;j++){
    const k=at+j,l=k+w/2,c=plan.cos[j*stride],s=plan.sin[j*stride],r=re[l]*c-im[l]*s,t=re[l]*s+im[l]*c;
    re[l]=re[k]-r;im[l]=im[k]-t;re[k]+=r;im[k]+=t;}}
  return Float64Array.from(re.subarray(0,n/2),(v,i)=>v*v+im[i]*im[i]);
}
function bands(input,window){const n=8192,power=new Float64Array(n/2);let count=0;
  for(let at=Math.round(window[0]*FS);at+n<=Math.round(window[1]*FS);at+=n/2){const p=spectrum(input.subarray(at,at+n),n);for(let i=0;i<p.length;i++)power[i]+=p[i];count++;}
  const bandPower={};for(const [a,b] of [[20,150],[150,500],[500,2000],[2000,6000],[6000,20000]]){
    let e=0;for(let k=Math.ceil(a*n/FS);k<Math.min(power.length,Math.ceil(b*n/FS));k++)e+=power[k];bandPower[a+'-'+b+'Hz']=e;}
  const sum=Object.values(bandPower).reduce((a,b)=>a+b,0);return {bandFractions:Object.fromEntries(Object.entries(bandPower).map(([k,v])=>[k,v/Math.max(sum,1e-30)])),fftFrames:n,windows:count};}
function radiation(model,role,view,directivity){
  const s=stockEmitters(model,stockPose(model,0,false)).find(s=>s.id.endsWith(role)),delta=view.map((x,i)=>x-s.position[i]),distance=Math.hypot(...delta);
  const cosine=delta.reduce((sum,x,i)=>sum+x*s.forward[i],0)/distance;
  return {distance,radiation:1-directivity+directivity*(1+cosine)/2};
}
function source(model,options=null){
  const shares=model==='schafter3'?{engine:.4,exhaust:.6}:{engine:.5,exhaust:.5};
  const player=new StockVehicleSource(assets.vehicles.get(model),{sourceGain:G,...(options??{pressureShares:shares})});
  if(options?.pressureSharesByState)assert.deepEqual(player.pressureSharesByState,options.pressureSharesByState,'state-share source API must honor the measured configuration');
  const engine=new Float32Array(total),exhaust=new Float32Array(total),e=new Float32Array(BLOCK),x=new Float32Array(BLOCK);
  for(let at=0;at<total;at+=BLOCK){const n=Math.min(BLOCK,total-at),t=at/FS;
    player.renderInto(states[t<2?'idle':t<5?'load':'lift'].control,e,x,n);engine.set(e.subarray(0,n),at);exhaust.set(x.subarray(0,n),at);}
  return {engine,exhaust,shares,stats:player.stats};
}
async function rendered(model,source,role,view,directivity=null){
  const ids=roles.map(role=>'stock:'+model+':'+role),d=directivity??{engine:.1,exhaust:model==='schafter3'?.35:.65};
  const pipeline=new VehicleAcousticPipeline({scene:createVehicleEnvironment('direct',{duration}).scene,sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain:.7});
  const result=[new Float32Array(total),new Float32Array(total)],zero=new Float32Array(BLOCK),input=new Float32Array(BLOCK),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK);
  try{for(let at=0;at<total;at+=BLOCK){const n=Math.min(BLOCK,total-at);input.set(source[role].subarray(at,at+n));
    const emitters=stockEmitters(model,stockPose(model,0,false)).map(s=>({...s,directivity:d[s.id.endsWith('engine')?'engine':'exhaust']}));
    await pipeline.prepare({time:at/FS,session:'stock-source03-mix',generation:1,listener:{position:view,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]},sources:emitters});
    pipeline.process({[ids[0]]:role==='engine'?input:zero,[ids[1]]:role==='exhaust'?input:zero},left,right,n);
    result[0].set(left.subarray(0,n),at);result[1].set(right.subarray(0,n),at);}
    const diagnostics=pipeline.diagnostics();for(const k of ['limited','missingHistory','cursorResets','rejectedControls'])assert.equal(diagnostics.renderer[k],0);assert.equal(diagnostics.history.affectedFrames,0);
    return {channels:result,diagnostics};}finally{pipeline.close();}
}
const measured=[],proposals={};let largestCandidatePeak=0,largestCandidateInput=0;
for(const model of ['bati','lectro','prototipo','schafter3']){
  const signal=source(model),sourceStates={},outputs={};
  for(const [state,{window}] of Object.entries(states)){sourceStates[state]=Object.fromEntries(roles.map(role=>[role,{...metrics([signal[role]],window),...bands(signal[role],window)}]));
    sourceStates[state].exhaustMinusEngineDb=db(sourceStates[state].exhaust.rms/sourceStates[state].engine.rms);}
  for(const [view,position] of Object.entries(views)){outputs[view]={};for(const role of roles)outputs[view][role]=await rendered(model,signal,role,position);}
  const baselineStates={},shares={},predicted={};
  for(const [state,{window}] of Object.entries(states)){
    baselineStates[state]=Object.fromEntries(Object.keys(views).map(view=>{const e=metrics(outputs[view].engine.channels,window),x=metrics(outputs[view].exhaust.channels,window);
      return [view,{engine:e,exhaust:x,exhaustMinusEngineDb:db(x.rms/e.rms)}];}));
    const oldD=model==='schafter3'?.35:.65,newD=authoredRadiation[model];
    const oldR=radiation(model,'exhaust',views.side,oldD).radiation,newR=radiation(model,'exhaust',views.side,newD).radiation;
    const ratio=signal.shares.exhaust/signal.shares.engine*10**((targets[model][state]-baselineStates[state].side.exhaustMinusEngineDb)/20)/(newR/oldR);
    const q=model==='schafter3'?(state==='load'?.65:.60):Math.round(Math.max(.45,Math.min(.78,ratio/(1+ratio)))*100)/100;
    shares[state]={engine:Math.round((1-q)*100)/100,exhaust:q};predicted[state]={};
    const a=shares[state].engine/signal.shares.engine,b=shares[state].exhaust/signal.shares.exhaust;
    const sourceE=metrics([signal.engine],window).peak*a,sourceX=metrics([signal.exhaust],window).peak*b;
    largestCandidateInput=Math.max(largestCandidateInput,sourceE,sourceX);
    for(const [view,position] of Object.entries(views)){
      const scaleX=b*radiation(model,'exhaust',position,newD).radiation/radiation(model,'exhaust',position,oldD).radiation;
      const sums=outputs[view].engine.channels.map((ch,c)=>Float64Array.from(ch,(e,i)=>e*a+outputs[view].exhaust.channels[c][i]*scaleX));
      const combined=metrics(sums,window),engine=metrics(outputs[view].engine.channels,window),exhaust=metrics(outputs[view].exhaust.channels,window);
      const ratioDb=db(exhaust.rms*scaleX/(engine.rms*a));largestCandidatePeak=Math.max(largestCandidatePeak,combined.peak);
      predicted[state][view]={exhaustMinusEngineDb:ratioDb,combined,engineRmsDbfs:db(engine.rms*a),exhaustRmsDbfs:db(exhaust.rms*scaleX)};
    }
  }
  const nativePeaks=Object.fromEntries(roles.map(role=>[role,Math.max(...['idle','accel','decel'].map(state=>assets.vehicles.get(model).layers[role][state].samples.reduce((peak,x)=>Math.max(peak,Math.abs(x)),0)))]));
  const nativeEmitterBounds=Object.fromEntries(roles.map(role=>[role,G*Math.max(...Object.values(shares).map(s=>s[role]))*nativePeaks[role]]));
  proposals[model]={pressureSharesByState:shares,directivity:{engine:.1,exhaust:authoredRadiation[model]},sourceGain:G,
    designSideTargetsDb:targets[model],predicted,sourcePeaksNative:nativePeaks,completeNativeEmitterPeakBounds:nativeEmitterBounds,
    basis:'Vehicle/state-specific authored exhaust-forward exterior target, calculated from actual isolated stem RMS and radiation at fixed common gain; not native gain metadata or a universal exhaust-everywhere rule.'};
  if(verifiedPhase){
    const actualSource=source(model,{pressureSharesByState:shares});
    largestCandidateInput=Math.max(largestCandidateInput,metrics([actualSource.engine,actualSource.exhaust]).peak);
    for(const [view,position] of Object.entries(views)){
      const actual={};for(const role of roles)actual[role]=await rendered(model,actualSource,role,position,proposals[model].directivity);
      const sum=actual.engine.channels.map((channel,c)=>Float64Array.from(channel,(x,i)=>x+actual.exhaust.channels[c][i]));
      largestCandidatePeak=Math.max(largestCandidatePeak,metrics(sum).peak);
      for(const [state,{window}] of Object.entries(states)){
        const e=metrics(actual.engine.channels,window),x=metrics(actual.exhaust.channels,window),old=predicted[state][view];
        predicted[state][view]={exhaustMinusEngineDb:db(x.rms/e.rms),combined:metrics(sum,window),
          engineRmsDbfs:e.rmsDbfs,exhaustRmsDbfs:x.rmsDbfs,linearPredictionExhaustMinusEngineDb:old.exhaustMinusEngineDb,
          predictionResidualDb:db(x.rms/e.rms)-old.exhaustMinusEngineDb,
          measurementBasis:'Actual new texture source with state-varying pressure shares and existing renderer isolated stems; combined is their linear sum'};
      }
    }
    proposals[model].verifiedWithActualStateShareSource=true;
  }
  measured.push({model,nativeSampleRate:assets.vehicles.get(model).layers.engine.accel.sampleRate,baselinePressureShares:signal.shares,
    baselineDirectivity:{engine:.1,exhaust:model==='schafter3'?.35:.65},sourceStates,baselineStates});
  console.log(model+' shares '+JSON.stringify(shares)+' load side '+predicted.load.side.exhaustMinusEngineDb.toFixed(2)+' dB');
}
const sourceClockBinding=sha(fs.readFileSync(path.join(codeRoot,'src/acoustics/vehicle/stock-grain.mjs')));
for(const [file,hash] of Object.entries(coreBindings))assert.equal(sha(fs.readFileSync(path.join(codeRoot,file))),hash,'probe core changed during measurement');
const report={schemaVersion:1,milestone:'STOCK-SOURCE-03',phase:verifiedPhase?'new03-corrected-texture-verified':phase,
  measurementRun:phase,coreBindings,sourceClockSha256:sourceClockBinding,
  sustainAtlasSha256:sustainAtlasFile?sha(fs.readFileSync(sustainAtlasFile)):null,sourceGain:G,rendererMasterGain:.7,
  durationSeconds:duration,states,views,measured,proposals,largestCandidateInput,largestCandidatePeak,
  candidateHeadroom:{inputBelowFullScale:largestCandidateInput<.98,combinedBelowFullScale:largestCandidatePeak<.98,
    commonGainIncreaseRecommended:false,
    probedGainCeilingOnly:G*Math.min(.98/Math.max(largestCandidateInput,1e-30),.9/Math.max(largestCandidatePeak,1e-30)),
    sourceBoundRule:'G*maxAuthoredShareByRole*maxAbsCompleteNativePcmByRole <=0.98, conditional on convex interpolation/mode/texture blending; actual final summed output remains separately gated'},
  previousInventories:verifyInventory(),gameLaunched:false,audioEndpointOpened:false,subjectiveListening:'not performed',
  limitations:['Static direct-only mix diagnosis, not a full audition or concurrency/calibration envelope',
    verifiedPhase?'Current texture core and sustain atlas are hash-bound; this probe measures mix and does not replace held-texture/pitch validation or human listening':
      'Initial02 player still has reviewed held-texture defect; proposals must be rechecked after new texture core freezes',
    'State targets are authored design assumptions; no native400/800 gain semantics, intake identity or KERS assets inferred',
    'Linear pressure/radiation scaling is exact for these held direct paths; state transitions and reflected/flyby peaks require actual final rendering',
    'The renderer was run for every vehicle/viewpoint and isolated role; proposal profiles are evaluated by linear recombination of those actual outputs without hiding limiting']};
fs.writeFileSync(path.join(privateRoot,'mix-'+phase+'.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'evidence/stock-source-03-mix-'+phase+'.json'),JSON.stringify(report,null,2));
const config={schemaVersion:1,phase:report.phase,measurementRun:phase,sourceGain:G,coreBindings,sourceClockSha256:sourceClockBinding,
  sustainAtlasSha256:report.sustainAtlasSha256,profiles:proposals};
fs.writeFileSync(path.join(privateRoot,'mix-proposals.json'),JSON.stringify(config,null,2));
if(verifiedPhase){
  fs.writeFileSync(path.join(privateRoot,'mix-final.json'),JSON.stringify(config,null,2));
  fs.writeFileSync(path.join(privateRoot,'mix-status.json'),JSON.stringify({currentConfig:'mix-final.json',
    measuredAgainstCurrentCore:true,sourceClockSha256:sourceClockBinding,rootRenderGoRequired:true,perceptualApproval:false},null,2));
}
console.log(JSON.stringify({largestCandidateInput,largestCandidatePeak,inventoryGroups:inventorySummary,proposalsReady:true}));
