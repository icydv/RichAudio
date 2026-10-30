// Read-only reproduction of the rejected STOCK-SOURCE-01 snapshot. No endpoint.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const oldRoot=path.resolve(process.argv[2]??path.join(root,'../RichAudio-StockSource01'));
const out=path.resolve(root,process.argv[3]??'.local/stock-source-02/baseline/reproduced');
assert.ok(out.startsWith(path.join(root,'.local')+path.sep)&&!out.startsWith(oldRoot+path.sep),'new private output only');
assert.ok(!fs.existsSync(out),'fresh private reproduction directory required');
const expectedCommit='9ba87f2e5bac7e3d46e057a2fd0ad6dcfc775abf';
const git=(...args)=>execFileSync('git',['-C',oldRoot,...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),expectedCommit,'unchanged old01 baseline commit');
assert.equal(git('status','--porcelain'),'','old01 tracked checkout must be clean');
const hash=data=>createHash('sha256').update(data).digest('hex');
const oldFiles=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs',
  'src/acoustics/vehicle/pipeline.mjs','src/acoustics/vehicle/environment.mjs',
  'src/acoustics/engine/paths.mjs','tools/stock-source-01-scenario.mjs'];
const bindings=Object.fromEntries(oldFiles.map(name=>[name,hash(fs.readFileSync(path.join(oldRoot,name)))]));
const oldImport=relative=>import(pathToFileURL(path.join(oldRoot,relative)).href);
const {loadStockAssets,StockVehicleSource,stockRoles,stockModes}=await oldImport('src/acoustics/vehicle/stock-source.mjs');
const {VehicleAcousticPipeline,encodeVehicleWav}=await oldImport('src/acoustics/vehicle/pipeline.mjs');
const {createVehicleEnvironment}=await oldImport('src/acoustics/vehicle/environment.mjs');
const {stockOperating,stockPose,stockEmitters,masterGain}=await oldImport('tools/stock-source-01-scenario.mjs');
const assetDir=path.join(oldRoot,'.local/stock-source-01/assets-native');
const audition=path.join(oldRoot,'.local/stock-source-01/audition-02');
const manifestFile=path.join(assetDir,'manifest.json');
const loaded=loadStockAssets(manifestFile);
const renderReport=JSON.parse(fs.readFileSync(path.join(audition,'render-report.json'),'utf8'));
const G=renderReport.calibration.sourceGain,FS=48000,BLOCK=512;
assert.equal(G,1.5956559506856056);assert.equal(masterGain,.7);
fs.mkdirSync(out,{recursive:true});

function readWav(file){
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
  let fmt=null,data=null;
  for(let at=12;at+8<=bytes.length;){
    const name=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),start=at+8;
    assert.ok(start+length<=bytes.length,'bounded WAV chunk');
    if(name==='fmt ')fmt={format:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),
      sampleRate:bytes.readUInt32LE(start+4),blockAlign:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};
    if(name==='data')data=bytes.subarray(start,start+length);
    at=start+length+(length&1);
  }
  assert.ok(fmt&&data&&[1,2].includes(fmt.channels));
  assert.ok((fmt.format===1&&fmt.bits===16)||(fmt.format===3&&fmt.bits===32),'original PCM16 or float32 only');
  assert.equal(data.length%fmt.blockAlign,0);
  const frames=data.length/fmt.blockAlign,samples=Array.from({length:fmt.channels},()=>new Float32Array(frames));
  for(let i=0;i<frames;i++)for(let c=0;c<fmt.channels;c++){
    const at=i*fmt.blockAlign+c*fmt.bits/8;
    const value=fmt.format===1?data.readInt16LE(at)/32768:data.readFloatLE(at);
    assert.ok(Number.isFinite(value)&&Math.abs(value)<1,'finite nonclipped original PCM');samples[c][i]=value;
  }
  return {...fmt,bytes,data,frames,samples};
}
const energy=arrays=>arrays.reduce((s,a)=>s+a.reduce((n,x)=>n+x*x,0),0)/arrays.reduce((s,a)=>s+a.length,0);
const rms=arrays=>Math.sqrt(energy(arrays));
const db=x=>x>0?20*Math.log10(x):null;
function windowMetrics(channels,start,end){
  // Match the review's Python int(seconds*rate) slices, including 5.1 s's
  // representationally sub-integer product (244799 rather than244800).
  const first=Math.trunc(start*FS),last=Math.trunc(end*FS);
  const chunks=channels.map(a=>a.subarray(first,last));
  const value=rms(chunks);let peak=0;for(const a of chunks)for(const x of a)peak=Math.max(peak,Math.abs(x));
  return {startSeconds:start,endSeconds:end,windowFrames:[first,last],rms:value,rmsDbfs:db(value),peak,peakDbfs:db(peak)};
}
function source(vehicle,duration,controlAt){
  const player=new StockVehicleSource(vehicle,{sourceGain:G}),frames=Math.round(duration*FS);
  const engine=new Float32Array(frames),exhaust=new Float32Array(frames),dry=new Float32Array(frames);
  const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK);
  for(let at=0;at<frames;at+=BLOCK){
    const n=Math.min(BLOCK,frames-at);player.renderInto(controlAt(at/FS),e,x,n);
    engine.set(e.subarray(0,n),at);exhaust.set(x.subarray(0,n),at);
    for(let i=0;i<n;i++)dry[at+i]=(e[i]+x[i])*Math.SQRT1_2;
  }
  return {engine,exhaust,dry,stats:player.stats};
}
const native=[];
for(const v of loaded.manifest.vehicles)for(const role of stockRoles)for(const mode of stockModes){
  const a=v.layers[role][mode],wav=readWav(path.join(assetDir,a.wavFile)),raw=fs.readFileSync(path.join(assetDir,a.file));
  assert.equal(wav.channels,1);assert.equal(wav.sampleRate,a.sampleRate);assert.equal(wav.frames,a.frames);
  assert.equal(hash(raw).toUpperCase(),a.sha256.toUpperCase());
  const decoded=Buffer.alloc(wav.frames*4);wav.samples[0].forEach((x,i)=>decoded.writeFloatLE(x,i*4));
  assert.ok(decoded.equals(raw),'original WAV equals decoded Float32 byte-for-byte');
  assert.equal(hash(wav.bytes).toUpperCase(),a.sourceWavSha256.toUpperCase());
  assert.equal(hash(wav.data).toUpperCase(),a.sourcePcmSha256.toUpperCase());
  const ref=fs.readFileSync(path.join(audition,v.model,'source',role+'_'+mode+'.wav'));
  assert.ok(ref.equals(wav.bytes),'audition reference remains byte-identical to original source WAV');
  native.push({model:v.model,role,state:mode,sampleRate:wav.sampleRate,frames:wav.frames,
    wavSha256:hash(wav.bytes),pcmSha256:hash(wav.data),float32Sha256:hash(raw),
    pcmEquality:true,manifestHashesMatch:true,auditionReferenceIdentical:true});
}
const dryRows=[];let schafterSource;
for(const [model,vehicle] of loaded.vehicles){
  const signal=source(vehicle,9,t=>stockOperating(t,false)),wav=encodeVehicleWav([signal.dry,signal.dry]);
  const original=fs.readFileSync(path.join(audition,model,'dry.wav'));
  assert.ok(wav.equals(original),'unchanged old source must reproduce rejected dry WAV bitwise');
  fs.writeFileSync(path.join(out,model+'-old-dry.wav'),wav);
  dryRows.push({model,durationSeconds:9,sha256:hash(wav),bitwiseEqual:true});
  if(model==='schafter3')schafterSource=signal;
}

function analytic(listener,emitters){
  const paths=emitters.map(s=>{
    const delta=listener.map((p,i)=>p-s.position[i]),distance=Math.hypot(...delta);
    const cosine=delta.reduce((a,x,i)=>a+x*s.forward[i],0)/distance;
    const radiation=1-s.directivity+s.directivity*(1+cosine)/2;
    return {role:s.id.endsWith('engine')?'engine':'exhaust',distance,radiation,
      pressureGain:radiation/Math.max(distance,1),directivity:s.directivity};
  });
  const e=paths[0],x=paths[1];
  return {paths,exhaustMinusEngineDb:db(x.pressureGain/e.pressureGain),
    distanceContributionDb:db(e.distance/x.distance),radiationContributionDb:db(x.radiation/e.radiation),
    basis:'Independently evaluated old formula before frequency-dependent air loss and common master; authored positions/directivity, not measured vehicle radiation'};
}
async function isolated(signal,{listener,profile='old',write=false,label='probe'}){
  const results={};const pose=stockPose('schafter3',0,false);
  const emitters=stockEmitters('schafter3',pose).map(s=>({...s,directivity:profile==='candidate'&&s.id.endsWith('exhaust')?.35:s.directivity}));
  for(const role of stockRoles){
    const pipeline=new VehicleAcousticPipeline({scene:createVehicleEnvironment('direct',{duration:signal.engine.length/FS}).scene,
      sourceIds:emitters.map(s=>s.id),quality:'quality',acceleration:'cpu',masterGain});
    const left=new Float32Array(signal.engine.length),right=new Float32Array(signal.engine.length);
    const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK);
    const scales=profile==='candidate'?{engine:.8,exhaust:1.2}:{engine:1,exhaust:1};
    try{
      for(let at=0;at<left.length;at+=BLOCK){
        const n=Math.min(BLOCK,left.length-at);e.fill(0);x.fill(0);
        const input=role==='engine'?e:x;
        for(let i=0;i<n;i++){input[i]=signal[role][at+i]*scales[role];assert.ok(Math.abs(input[i])<1);}
        await pipeline.prepare({time:at/FS,session:'stock-source02-baseline',generation:1,
          listener:{position:listener,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]},sources:emitters});
        pipeline.process({[emitters[0].id]:e,[emitters[1].id]:x},l,r,n);
        left.set(l.subarray(0,n),at);right.set(r.subarray(0,n),at);
      }
      const diag=pipeline.diagnostics();
      for(const k of ['limited','missingHistory','cursorResets','rejectedControls'])assert.equal(diag.renderer[k],0,k);
      assert.equal(diag.history.affectedFrames,0);
      if(write)fs.writeFileSync(path.join(out,label+'-'+role+'.wav'),encodeVehicleWav([left,right]));
      results[role]={channels:[left,right],diagnostics:diag};
    }finally{pipeline.close();}
  }
  return {...results,analytic:analytic(listener,emitters)};
}
function ratioAt(results,start,end){
  const engine=windowMetrics(results.engine.channels,start,end),exhaust=windowMetrics(results.exhaust.channels,start,end);
  return {windowSeconds:[start,end],engineRmsDbfs:engine.rmsDbfs,exhaustRmsDbfs:exhaust.rmsDbfs,
    exhaustMinusEngineDb:db(exhaust.rms/engine.rms)};
}
const close=await isolated(schafterSource,{listener:[0,1.5,1.4],write:true,label:'schafter-original-close'});
const originalClose=readWav(path.join(audition,'schafter3/close.wav'));
let maximumSumError=0;
for(let c=0;c<2;c++)for(let i=0;i<originalClose.frames;i++){
  const sum=close.engine.channels[c][i]+close.exhaust.channels[c][i];
  maximumSumError=Math.max(maximumSumError,Math.abs(sum-originalClose.samples[c][i]));
}
assert.ok(maximumSumError<=3e-8,'isolated old stems reproduce original close');
const windows=[[.2,.9],[2,3],[4,5.1],[5.7,6.3]].map(([a,b])=>ratioAt(close,a,b));
assert.ok(Math.abs(windows[2].exhaustMinusEngineDb-(-9.095617484955035))<1e-5);
assert.ok(Math.abs(close.analytic.exhaustMinusEngineDb-(-9.189966372612178))<1e-9);
const sourceWindow=windowMetrics([schafterSource.engine],4,5.1),exhaustWindow=windowMetrics([schafterSource.exhaust],4,5.1);
const fixed=source(loaded.vehicles.get('schafter3'),4,()=>({operatingPoint:.7,load:.9,running:true,lift:false}));
const fixedSourceRatio=db(rms([fixed.exhaust.subarray(FS,3*FS)])/rms([fixed.engine.subarray(FS,3*FS)]));
const viewpoints=[];
for(const [name,listener] of [['front',[5,0,1.4]],['side',[0,5,1.4]],['rear',[-5,0,1.4]]]){
  const old=await isolated(fixed,{listener});
  const candidate=await isolated(fixed,{listener,profile:'candidate'});
  viewpoints.push({name,listener,commonSourceState:{operatingPoint:.7,load:.9,running:true,lift:false},
    original:{...ratioAt(old,1,3),path:old.analytic},candidate:{...ratioAt(candidate,1,3),path:candidate.analytic}});
}
for(const [name,sha] of Object.entries(bindings))assert.equal(hash(fs.readFileSync(path.join(oldRoot,name))),sha,'old module modified during reproduction');
assert.equal(git('status','--porcelain'),'','no old01 writes');
const report={schemaVersion:1,milestone:'STOCK-SOURCE-02',baselineCommit:expectedCommit,moduleBindings:bindings,
  sourceGain:G,rendererMasterGain:masterGain,nativeReferenceCount:native.length,nativeReferences:native,
  oldDryFiles:dryRows,allFourDryBitwiseEqual:dryRows.length===4&&dryRows.every(r=>r.bitwiseEqual),
  schafter:{isolatedSumMaximumAbsoluteError:maximumSumError,originalWindows:windows,closePath:close.analytic,
    sourceExhaustMinusEngineDb4to5_1:db(exhaustWindow.rms/sourceWindow.rms),
    fixedStateSourceExhaustMinusEngineDb:fixedSourceRatio,viewpoints,
    candidate:{enginePressureShare:.4,exhaustPressureShare:.6,engineDirectivity:.1,exhaustDirectivity:.35,
      basis:'Authored Schafter-only comparison hypothesis, not recovered native mix. Evaluated with unchanged rejected player to separate geometry; must be rechecked after source fidelity repair, with new common headroom calibration and human listening.',
      cautions:['Native EngineVolume400/ExhaustVolume800 are not interpreted as linear, decibel or2:1 gains',
        'No universal exhaust-dominance target; front, side and rear remain different',
        'Do not compensate full near-side9.19dB path difference with a universal exhaust gain',
        'Do not use mix changes to conceal known source-clock corruption']}},
  localReferenceAvailability:{verifiedNativeSchafterRecordingFound:false,
    verificationScope:'Targeted manual inventory during STOCK-SOURCE-02 review; not automatically repeated by this reproduction tool',
    targetedSearchOnly:true,exhaustiveMachineSearch:false,
    inspectedLocations:['Supplied sound-reference pack entry inventory and companion analysis notes',
      'Existing RichAudio private reference/capture directories','Windows Captures directory',
      'GTA Enhanced user-data video/audio filenames','Downloads Schafter/GTA/RichAudio/reference filenames'],
    availableReferenceBasis:'Existing supplied notes describe real track-car/Pagani and motorcycle footage, not a verified native Schafter engine/exhaust mix.',
    limitation:'Filename/inventory checks establish no native Schafter recording in the targeted evidence; they do not prove none exists elsewhere or identify unrelated personal videos.'},
  originalCheckoutUnchanged:true,archivesExtracted:false,gameLaunched:false,audioEndpointOpened:false,
  subjectiveListening:'not performed',nativeInGameMix:'unverified',
  limitations:['This tool verifies provided local decoded PCM, not a fresh archive decode or runtime mount',
    'Source playback is the unchanged rejected01implementation; output ratios are diagnostic, not source fidelity approval',
    'Authored listener/emitter positions and directivity are not measured vehicle bones/radiation or physical SPL']};
fs.writeFileSync(path.join(out,'baseline-report.json'),JSON.stringify(report,null,2));
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/stock-source-02-baseline.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({nativeReferences:native.length,allFourDryBitwiseEqual:report.allFourDryBitwiseEqual,
  isolatedSumMaximumAbsoluteError:maximumSumError,original4to5_1Db:windows[2].exhaustMinusEngineDb,
  analyticPathDb:close.analytic.exhaustMinusEngineDb,fixedSourceRatio,viewpoints},null,2));
