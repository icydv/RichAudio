// Compact private source-clock/balance comparison. No endpoint or old01 writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadStockAssets,StockVehicleSource,stockRoles} from '../src/acoustics/vehicle/stock-source.mjs';
import {VehicleAcousticPipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {createVehicleEnvironment} from '../src/acoustics/vehicle/environment.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {stockOperating,stockPose,stockEmitters,stockDirectScenes,passTime,masterGain} from './stock-source-01-scenario.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const oldRoot=path.resolve(process.argv[2]??path.join(root,'../RichAudio-StockSource01'));
const out=path.resolve(root,process.argv[3]??'.local/stock-source-02/audition');
assert.ok(out.startsWith(path.join(root,'.local')+path.sep)&&!out.startsWith(oldRoot+path.sep));
assert.ok(!fs.existsSync(out),'fresh private destination required');
const manifestFile=path.join(oldRoot,'.local/stock-source-01/assets-native/manifest.json');
const oldAudition=path.join(oldRoot,'.local/stock-source-01/audition-02');
const oldReport=JSON.parse(fs.readFileSync(path.join(oldAudition,'render-report.json'),'utf8'));
const assets=loadStockAssets(manifestFile),G=oldReport.calibration.sourceGain,FS=48000,BLOCK=512;
assert.equal(G,1.5956559506856056);assert.equal(masterGain,.7);
const sha=data=>createHash('sha256').update(data).digest('hex');
const profiles={baseline:{pressureShares:{engine:.5,exhaust:.5},directivity:{engine:.1,exhaust:.65},distance:'physical-default'},
  authored:{pressureShares:{engine:.4,exhaust:.6},directivity:{engine:.1,exhaust:.35},distance:'physical-default'},
  final:{pressureShares:{engine:.4,exhaust:.6},directivity:{engine:.1,exhaust:.35},distance:'authored-detail-loss-v1'}};
const percentile=a=>{const s=[...a].sort((x,y)=>x-y);return {count:s.length,p50:s[Math.floor(.5*s.length)],p95:s[Math.floor(.95*s.length)],max:s.at(-1),
  blockFrames:BLOCK,sampleRate:FS,deadlineMs:BLOCK/FS*1000,misses:s.filter(x=>x>BLOCK/FS*1000).length};};
const imports=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/pipeline.mjs',
  'src/acoustics/vehicle/distance-presentation.mjs','tools/stock-source-01-scenario.mjs'];
const moduleBindings=Object.fromEntries(imports.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const oldProtected=new Map();
const baselineProof=JSON.parse(fs.readFileSync(path.join(root,'evidence/stock-source-02-baseline.json'),'utf8'));
for(const [file,hash] of Object.entries(baselineProof.moduleBindings)){
  const full=path.join(oldRoot,file);assert.equal(sha(fs.readFileSync(full)),hash,'old core binding differs');oldProtected.set(full,hash);
}
assert.notEqual(moduleBindings['src/acoustics/vehicle/stock-grain.mjs'],baselineProof.moduleBindings['src/acoustics/vehicle/stock-grain.mjs'],'corrected clock differs from rejected baseline');
const sourceBindings=[];
for(const v of assets.manifest.vehicles)for(const role of stockRoles)for(const state of ['idle','accel','decel']){
  const a=v.layers[role][state],file=path.join(assets.base,a.file),hash=sha(fs.readFileSync(file));
  assert.equal(hash.toUpperCase(),a.sha256.toUpperCase());oldProtected.set(file,hash);
  sourceBindings.push({model:v.model,role,state,sha256:hash,sampleRate:a.sampleRate});
}
fs.mkdirSync(out,{recursive:true});
function copied(source,destination){const bytes=fs.readFileSync(source),hash=sha(bytes);oldProtected.set(source,hash);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);assert.equal(sha(fs.readFileSync(destination)),hash);return hash;}
const references=[];
for(const role of stockRoles)for(const state of ['idle','accel','decel']){
  const asset=assets.vehicles.get('schafter3').layers[role][state],file=role+'_'+state+'.wav';
  const source=path.join(assets.base,asset.wavFile),hash=copied(source,path.join(out,'schafter3/source',file));
  assert.equal(hash.toUpperCase(),asset.sourceWavSha256.toUpperCase());
  references.push({role,state,file:'schafter3/source/'+file,sampleRate:asset.sampleRate,sha256:hash,byteIdentical:true});
}
const baselineCopies=[];
for(const [model,from,to] of [['schafter3','dry','rejected-source'],['schafter3','flyby','rejected-flyby'],['bati','dry','rejected-source']]){
  const file=model+'/'+to+'.wav';baselineCopies.push({model,file,sha256:copied(path.join(oldAudition,model,from+'.wav'),path.join(out,file)),byteIdentical:true});
}
function profiledScene(scene,profile){return profile==='physical-default'?scene:
  acousticScene(scene.tile,scene.materials,{...scene.config,...vehicleDistanceSceneOptions(profile)});}
async function run({model='schafter3',name,profile='baseline',flying=false,sourceOnly=false,
  mask='both',listenerPosition=null,held=false,write=true}){
  const cfg=profiles[profile],duration=held?4:flying?10.3:9,total=Math.round(duration*FS);
  const player=new StockVehicleSource(assets.vehicles.get(model),{sourceGain:G,pressureShares:cfg.pressureShares});
  assert.deepEqual(player.pressureShares,cfg.pressureShares,'new source must honor explicit pressureShares option');
  const scenes=(flying?stockDirectScenes():[createVehicleEnvironment('direct',{duration}).scene]).map(s=>profiledScene(s,cfg.distance));
  const ids=stockRoles.map(role=>'stock:'+model+':'+role);
  const pipeline=sourceOnly?null:new VehicleAcousticPipeline({scene:scenes[0],sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain});
  const left=new Float32Array(total),right=new Float32Array(total);
  const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK);
  const sourceTimes=[],renderTimes=[],totalTimes=[],rows=[],sourceHash=createHash('sha256'),motionHash=createHash('sha256');
  let changed=false,lastPaths=0,maxRetardedFrameError=0,minRate=Infinity,maxRate=0,peakInput=0;
  const cpu=process.cpuUsage(),started=performance.now();
  try{
    for(let at=0;at<total;at+=BLOCK){
      const begin=performance.now(),n=Math.min(BLOCK,total-at),t=at/FS;
      const control=held?{operatingPoint:.7,load:.9,running:true,lift:false}:stockOperating(t,flying);
      const pose=stockPose(model,t,flying);
      let stamp=performance.now();player.renderInto(control,e,x,n);sourceTimes.push(performance.now()-stamp);
      sourceHash.update(Buffer.from(e.buffer,0,n*4));sourceHash.update(Buffer.from(x.buffer,0,n*4));
      motionHash.update(JSON.stringify([t,pose]));
      for(let i=0;i<n;i++)peakInput=Math.max(peakInput,Math.abs(e[i]),Math.abs(x[i]));
      stamp=performance.now();
      if(sourceOnly){for(let i=0;i<n;i++)l[i]=r[i]=(e[i]+x[i])*Math.SQRT1_2;}
      else{
        if(flying&&!changed&&t>=passTime){pipeline.replaceScene(scenes[1]);changed=true;}
        const listener={position:listenerPosition??[0,flying?2:1.5,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]};
        const emitters=stockEmitters(model,pose).map(s=>({...s,directivity:cfg.directivity[s.id.endsWith('engine')?'engine':'exhaust']}));
        const paths=await pipeline.prepare({time:t,session:'stock-source01',generation:1,listener,sources:emitters});lastPaths=paths.paths.length;
        for(const p of paths.paths){
          assert.ok(Math.abs(p.delay-p.distance/343)<1e-8);
          const err=Math.abs(p.emissionFrame-(t-p.delay)*FS);assert.ok(err<1);maxRetardedFrameError=Math.max(maxRetardedFrameError,err);
          minRate=Math.min(minRate,p.rate);maxRate=Math.max(maxRate,p.rate);
          const maxSpeed=flying?52:0;assert.ok(p.rate>=1/(1+maxSpeed/343)-.015&&p.rate<=1/(1-maxSpeed/343)+.015);
        }
        if(mask==='engine')x.fill(0);if(mask==='exhaust')e.fill(0);
        pipeline.process({[ids[0]]:e,[ids[1]]:x},l,r,n);
        if(at%(10*BLOCK)===0)rows.push({time:t,speed:pose.speed,operatingPoint:control.operatingPoint,load:control.load,
          paths:paths.paths.map(p=>({role:p.sourceId.endsWith('engine')?'engine':'exhaust',distance:p.distance,delay:p.delay,rate:p.rate,bands:p.bands}))});
      }
      renderTimes.push(performance.now()-stamp);
      for(let i=0;i<n;i++){assert.ok(Number.isFinite(l[i])&&Number.isFinite(r[i])&&Math.max(Math.abs(l[i]),Math.abs(r[i]))<.98,'finite unclipped output without hidden limiting');
        left[at+i]=l[i];right[at+i]=r[i];}
      totalTimes.push(performance.now()-begin);
    }
    const diagnostics=pipeline?.diagnostics()??null,metrics=audioMetrics([left,right]);
    assert.equal(metrics.clippedSamples,0);assert.equal(metrics.nonfiniteSamples,0);
    if(diagnostics){for(const k of ['limited','missingHistory','cursorResets','rejectedControls'])assert.equal(diagnostics.renderer[k],0,k);
      assert.equal(diagnostics.history.affectedFrames,0);if(flying)assert.equal(lastPaths,2);}
    const voices=Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,{...player.voices[role][mode].stats,
      maximumBoundaryStep:player.voices[role][mode].maximumBoundaryStep}]))]));
    const cpuUsed=process.cpuUsage(cpu);let file=null,fileHash=null;
    if(write){file=model+'/'+name+'.wav';const bytes=encodeVehicleWav([left,right]);fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
      fs.writeFileSync(path.join(out,file),bytes);fileHash=sha(bytes);}
    return {left,right,report:{name,model,file,sha256:fileHash,durationSeconds:duration,sampleRate:FS,blockFrames:BLOCK,
      sourceGain:G,pressureShares:cfg.pressureShares,directivity:cfg.directivity,distanceProfile:cfg.distance,
      rendererMasterGain:sourceOnly?null:masterGain,nativeHostGainUsed:false,normalised:false,mask,sourceOnly,
      authoredPassTime:flying?passTime:null,listenerPosition:listenerPosition??(sourceOnly?null:[0,flying?2:1.5,1.4]),
      heldControl:held?{operatingPoint:.7,load:.9,running:true,lift:false}:null,
      sourceHash:sourceHash.digest('hex'),motionHash:motionHash.digest('hex'),metrics,peakInput,sourceStats:player.stats,voices,
      diagnostics,propagation:{lastPathCount:lastPaths,minRate:sourceOnly?null:minRate,maxRate,maxRetardedFrameError},rows,
      timings:{source:percentile(sourceTimes),rendererAndControl:percentile(renderTimes),complete:percentile(totalTimes)},
      nodeCpuMs:(cpuUsed.user+cpuUsed.system)/1000,wallMs:performance.now()-started}};
  }finally{pipeline?.close();}
}
const files=[];
for(const spec of [{name:'corrected-source',sourceOnly:true},{name:'corrected-close-engine',profile:'authored',mask:'engine'},
  {name:'corrected-close-exhaust',profile:'authored',mask:'exhaust'},{name:'corrected-close-combined',profile:'authored'},
  {name:'flyby-clock-only',flying:true},{name:'flyby-final',profile:'final',flying:true},
  {model:'bati',name:'corrected-source',sourceOnly:true}]){
  const result=await run(spec);files.push(result.report);console.log('render '+result.report.model+' '+spec.name+' peak '+result.report.metrics.peak.toFixed(5));
}
const close=files.filter(f=>f.name.startsWith('corrected-close'));assert.equal(new Set(close.map(f=>f.sourceHash)).size,1);
const flybys=files.filter(f=>f.name.startsWith('flyby-'));assert.equal(new Set(flybys.map(f=>f.motionHash)).size,1);
const oldMotion=oldReport.vehicles.find(v=>v.model==='schafter3').files.flyby.motionHash;assert.ok(flybys.every(f=>f.motionHash===oldMotion),'same exact old flyby trajectory');
const viewpoints=[];
for(const [view,listener] of [['front',[5,0,1.4]],['side',[0,5,1.4]],['rear',[-5,0,1.4]]])for(const profile of ['baseline','authored']){
  const parts={};for(const mask of stockRoles){const result=await run({name:'held-'+view+'-'+profile+'-'+mask,profile,mask,listenerPosition:listener,held:true,write:false});
    const a=FS,b=3*FS;let energy=0;for(let i=a;i<b;i++)energy+=result.left[i]**2+result.right[i]**2;
    parts[mask]={rms:Math.sqrt(energy/(2*(b-a))),metrics:result.report.metrics,diagnostics:result.report.diagnostics,timings:result.report.timings};}
  viewpoints.push({view,profile,listenerPosition:listener,windowSeconds:[1,3],exhaustMinusEngineDb:20*Math.log10(parts.exhaust.rms/parts.engine.rms),stems:parts});
}
for(const [file,hash] of oldProtected)assert.equal(sha(fs.readFileSync(file)),hash,'old rejected/native file changed');
for(const [file,hash] of Object.entries(moduleBindings))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'core source changed during timed render');
const report={schemaVersion:1,milestone:'STOCK-SOURCE-02',sourceGain:G,rendererMasterGain:masterGain,profiles,moduleBindings,sourceBindings,
  rejectedBaselineCommit:'9ba87f2e5bac7e3d46e057a2fd0ad6dcfc775abf',references,baselineCopies,files,viewpoints,
  gameLaunched:false,audioEndpointOpened:false,normalised:false,subjectiveListening:'not performed',oldFilesUnchanged:true,
  limitations:['Source interval-rate control is not verified crankshaft RPM or recovered full native granular logic',
    'Schafter balance/directivity and opt-in distance shaping are authored assumptions, not recovered native mix or atmospheric calibration',
    'No late field or new environment matrix; no live capacity or arbitrary concurrency result',
    'Timing is instrumented offline Node CPU work; no device, GTA-load or end-to-end latency claim']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({generated:files.length,originalCopies:baselineCopies.length,nativeReferences:references.length,viewpoints:viewpoints.length,
  maximumCompleteBlockMs:Math.max(...files.map(f=>f.timings.complete.max)),completeDeadlineMisses:files.reduce((s,f)=>s+f.timings.complete.misses,0)}));
