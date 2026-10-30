// Private focused comparison; no endpoint, game, listening or late-field work.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadStockAssets,loadStockExhaustPops,StockVehicleSource,stockModels,stockRoles} from '../src/acoustics/vehicle/stock-source.mjs';
import {VehicleAcousticPipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {inBox} from '../src/acoustics/research/local-geometry.mjs';
import {stockPose,stockEmitters,stockOperating,stockDemonstrations} from './stock-source-01-scenario.mjs';
import {source03FlybyOperating,source03FlybyScenes} from './Render-StockSource03.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),FS=48000,BLOCK=512,MASTER=.7;
const oldRoot=path.resolve(root,'../RichAudio-StockSource03');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function source04Operating(t){
  const rise=smooth((t-1.5)/3),lift=smooth((t-13.5)/3.5);
  return {operatingPoint:(.04+.91*rise)*(1-lift)+.04*lift,
    load:(.15+.8*rise)*(1-lift)+.07*lift,running:true,lift:t>=13.5};
}
export function source04DelayedFlybyOperating(t){
  if(t<6.3)return stockOperating(Math.min(t,5.319),true);
  const lift=smooth((t-6.3)/.3);
  return {operatingPoint:.98-.55*smooth((t-6.3)/(10.3-6.3)),load:.95*(1-lift)+.07*lift,running:true,lift:true};
}
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
function summarize(samples){const a=samples.map(s=>s.ms).sort((x,y)=>x-y);return {blocks:a.length,p95Ms:a[Math.floor(a.length*.95)],maximumMs:a.at(-1),
  misses:samples.filter(s=>s.ms>s.deadlineMs).map(s=>({atFrame:s.frame,elapsedMs:s.ms,deadlineMs:s.deadlineMs}))};}
function voiceSnapshot(player){return Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
  const v=player.voices[role][mode];return [mode,{frames:v.frame,phase:v.phase,clockCycles:v.clockCycles,maximumBoundaryStep:v.maximumBoundaryStep,stats:v.stats}];}))]));}
function clockRow(player){return Object.fromEntries(stockRoles.map(role=>[role,{commonRateHz:player.commonRates?.[role]??null,
  voices:Object.fromEntries(['idle','accel','decel'].map(mode=>{const v=player.voices[role][mode],p=v.pair(v.state??.5),rate=v.asset.sampleRate/((1-p.w)*v.intervals[p.a].length+p.w*v.intervals[p.b].length);
    return [mode,{frames:v.frame,phase:v.phase,clockCycles:v.clockCycles,materialRateHz:rate,head:v.head?.q??null}];}))}]));}

export async function renderStockSource04({
  manifestFile=path.resolve(root,'../RichAudio-StockSource01/.local/stock-source-01/assets-native/manifest.json'),
  sustainAtlasFile=oldRoot+'/.local/stock-source-03/sustain-assets/atlas.json',mixFile=oldRoot+'/.local/stock-source-03/mix-final.json',
  popManifestFile=oldRoot+'/.local/stock-source-03/x80-pops/manifest.json',
  output=path.join(root,'.local/stock-source-04/audition'),legacyRoot=oldRoot,
}={}){
  const out=path.resolve(output);assert.ok(out.startsWith(path.join(root,'.local')+path.sep),'private output below this checkout required');
  assert.ok(!fs.existsSync(out),'fresh output directory required');
  assert.equal(execFileSync('git',['-C',legacyRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),'ba62846dd6155b515e165a57088bea660c68be84','frozen delivered Source03 checkout required');
  const legacy=await import(pathToFileURL(path.join(legacyRoot,'src/acoustics/vehicle/stock-source.mjs')).href),oldAudition=path.join(legacyRoot,'.local/stock-source-03/audition');
  const oldReport=JSON.parse(fs.readFileSync(path.join(oldAudition,'render-report.json'),'utf8'));
  const assets=loadStockAssets(manifestFile,{sustainAtlasFile}),oldAssets=legacy.loadStockAssets(manifestFile,{sustainAtlasFile});
  const mix=JSON.parse(fs.readFileSync(mixFile,'utf8')),popAssets=loadStockExhaustPops(popManifestFile),G=mix.sourceGain;
  assert.equal(mix.phase,'new03-corrected-texture-verified');assert.equal(sha(fs.readFileSync(sustainAtlasFile)),mix.sustainAtlasSha256);
  assert.ok(stockModels.every(m=>mix.profiles[m]?.sourceGain===G));assert.equal(G,oldReport.sourceGain);assert.equal(MASTER,oldReport.rendererMasterGain);
  // Previous core hashes describe the previous player. Reuse its frozen mix
  // settings; do not falsely assert that those hashes bind the repaired core.
  const watched=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/stock-events.mjs',
    'src/acoustics/vehicle/pipeline.mjs','src/acoustics/vehicle/distance-presentation.mjs','src/acoustics/streaming/causal.mjs',
    'src/acoustics/engine/paths.mjs','tools/stock-source-01-scenario.mjs','tools/Render-StockSource03.mjs','tools/Render-StockSource04.mjs'];
  const bindings=Object.fromEntries(watched.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
  const protectedFiles=new Map(),protect=file=>{protectedFiles.set(file,sha(fs.readFileSync(file)));return protectedFiles.get(file);};
  for(const file of [manifestFile,sustainAtlasFile,mixFile,popManifestFile,path.join(oldAudition,'render-report.json')])protect(file);
  for(const file of watched.filter(f=>f!=='tools/Render-StockSource04.mjs')){
    const hash=protect(path.join(legacyRoot,file));
    if(oldReport.moduleBindings[file])assert.equal(hash,oldReport.moduleBindings[file],'delivered Source03 module differs: '+file);
  }
  for(const file of ['src/acoustics/vehicle/pipeline.mjs','src/acoustics/vehicle/distance-presentation.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/engine/paths.mjs','tools/stock-source-01-scenario.mjs'])
    assert.equal(bindings[file],protectedFiles.get(path.join(legacyRoot,file)),'controlled comparison propagation/trajectory changed: '+file);
  assert.equal(fs.readFileSync(path.join(root,'tools/Render-StockSource03.mjs'),'utf8').replace(/\r\n/g,'\n'),
    fs.readFileSync(path.join(legacyRoot,'tools/Render-StockSource03.mjs'),'utf8').replace(/\r\n/g,'\n'),'Source03 scenario implementation differs');
  const nativeReferences=[];
  for(const vehicle of assets.vehicles.values())for(const role of stockRoles)for(const mode of ['idle','accel','decel']){
    const a=vehicle.layers[role][mode];protect(path.join(assets.base,a.file));const file=path.join(assets.base,a.wavFile),hash=protect(file);
    assert.equal(hash.toUpperCase(),a.sourceWavSha256.toUpperCase());nativeReferences.push({model:vehicle.model,role,mode,path:file,sha256:hash,sampleRate:a.sampleRate});
  }
  for(const a of popAssets.variants){protect(path.join(popAssets.base,a.file));protect(path.join(popAssets.base,a.wavFile));}
  const beforeReferences=[];
  for(const model of stockModels)for(const kind of ['open','street']){
    const f=oldReport.files.find(f=>f.model===model&&f.name==='flyby-'+kind);assert.ok(f);
    const file=path.join(oldAudition,f.file),hash=protect(file);assert.equal(hash,f.sha256);
    assert.equal(f.sourceGain,G);assert.deepEqual(f.sourceConfiguration.pressureSharesByState,mix.profiles[model].pressureSharesByState);
    beforeReferences.push({model,kind,path:file,sha256:hash,controlHash:f.controlHash,motionHash:f.motionHash,sourceGain:G,sourceConfiguration:f.sourceConfiguration});
  }
  const report={schemaVersion:1,milestone:'STOCK-SOURCE-04',status:'rendering',sourceGain:G,rendererMasterGain:MASTER,sampleRate:FS,blockFrames:BLOCK,
    settingsReuse:'Source03 final gains, pressure shares and directivity only; Source04 core hashes are independently bound below',
    inputs:{manifestFile,sustainAtlasFile,mixFile,popManifestFile,legacyRoot},moduleBindings:bindings,
    controls:{source:{durationSeconds:24,idleSeconds:[[0,1.5],[17,24]],riseSeconds:[1.5,4.5],holdSeconds:[4.5,13.5],liftSeconds:[13.5,17],running:true,idleOperatingPoint:.04,highOperatingPoint:.95},
      controlledFlyby:'Exact Source03 controls, lift5.32s, stockPose trajectory/pass5.3s',delayedFlyby:'Separate authored performance: high load through pass; lift6.3s; same stockPose trajectory and source/propagation gains'},
    nativeReferences,beforeReferences,files:[],gameLaunched:false,audioEndpointOpened:false,subjectiveListeningPerformed:false,
    limitations:['Measured interval rates are not crank RPM or recovered native playback semantics','Mode-rate interpolation is an explicit source model, not a recovered native control law',
      'Authored mix, distance profile and10m finite street retained from03; no added EQ, normalization or late field','Offline instrumented timings are not live/GTA performance certification']};
  fs.mkdirSync(out,{recursive:true});const save=()=>json(path.join(out,'render-report.json'),report);save();
  async function run(model,name,{old=false,kind=null,delayed=false,exhaustSolo=false}={}){
    const flying=kind!==null,duration=flying?10.3:24,total=Math.round(duration*FS),config=mix.profiles[model],Source=old?legacy.StockVehicleSource:StockVehicleSource;
    const eventTime=flying?(delayed?6.32:5.34):13.56,eventPlan=model==='prototipo'?[{atFrame:Math.round(eventTime*FS),variant:flying?0:1,basis:'authored-offline-lift'}]:[];
    const startInit=performance.now(),player=new Source((old?oldAssets:assets).vehicles.get(model),{sourceGain:G,pressureSharesByState:config.pressureSharesByState,
      ...(eventPlan.length?{exhaustEvents:{assets:popAssets,triggers:eventPlan}}:{})}),initializationMs=performance.now()-startInit;
    const scenes=flying?source03FlybyScenes(kind):null,ids=stockRoles.map(role=>'stock:'+model+':'+role);
    const pipeline=flying?new VehicleAcousticPipeline({scene:scenes[0],sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain:MASTER}):null;
    const left=new Float32Array(total),right=new Float32Array(total),solo=exhaustSolo?new Float32Array(total):null;
    const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK),rows=[];
    const timing={source:[],rendererAndControl:[],complete:[]},sourceHash=createHash('sha256'),motionHash=createHash('sha256'),controlHash=createHash('sha256');
    let sceneIndex=0,sceneSwitchTime=null,maximumRetardedFrameError=0,minRate=Infinity,maxRate=0,peakInput=0;
    const maximumOrders=[0,0,0],exhaustOrders=[0,0,0],cpu=process.cpuUsage(),begin=performance.now();
    try{
      for(let at=0;at<total;at+=BLOCK){const start=performance.now(),frames=Math.min(BLOCK,total-at),t=at/FS,deadlineMs=frames/FS*1000;
        const control=flying?(delayed?source04DelayedFlybyOperating(t):source03FlybyOperating(t)):source04Operating(t),pose=stockPose(model,t,flying);
        let stamp=performance.now();player.renderInto(control,e,x,frames);timing.source.push({frame:at,ms:performance.now()-stamp,deadlineMs});
        sourceHash.update(Buffer.from(e.buffer,0,frames*4));sourceHash.update(Buffer.from(x.buffer,0,frames*4));motionHash.update(JSON.stringify([t,pose]));controlHash.update(JSON.stringify([t,control]));
        for(let i=0;i<frames;i++)peakInput=Math.max(peakInput,Math.abs(e[i]),Math.abs(x[i]));
        stamp=performance.now();
        if(!flying)for(let i=0;i<frames;i++){l[i]=r[i]=(e[i]+x[i])*Math.SQRT1_2;if(solo)solo[at+i]=x[i]*Math.SQRT1_2;}
        else{
          if(!sceneIndex&&pose.position[0]>=3.5){sceneIndex=1;sceneSwitchTime=t;pipeline.replaceScene(scenes[1],kind==='street'?{preserveIdenticalReflectors:true}:undefined);}
          const listener={position:[0,2,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]},emitters=stockEmitters(model,pose).map(s=>({...s,directivity:config.directivity[s.id.endsWith('engine')?'engine':'exhaust']}));
          assert.ok(inBox(listener.position,scenes[sceneIndex].tile.bounds)&&emitters.every(s=>inBox(s.position,scenes[sceneIndex].tile.bounds)));
          const paths=await pipeline.prepare({time:t,session:'source03-audition',generation:1,listener,sources:emitters}),counts=[0,0,0],exhaust=[0,0,0];
          for(const p of paths.paths){assert.ok(Math.abs(p.delay-p.distance/343)<1e-8);maximumRetardedFrameError=Math.max(maximumRetardedFrameError,Math.abs(p.emissionFrame-(t-p.delay)*FS));
            minRate=Math.min(minRate,p.rate);maxRate=Math.max(maxRate,p.rate);assert.ok(p.rate>=1/(1+stockDemonstrations[model].maximumSpeed/343)-.02&&p.rate<=1/(1-stockDemonstrations[model].maximumSpeed/343)+.02);
            counts[p.order]++;if(p.sourceId.endsWith('exhaust'))exhaust[p.order]++;}
          for(let order=0;order<3;order++){maximumOrders[order]=Math.max(maximumOrders[order],counts[order]);exhaustOrders[order]=Math.max(exhaustOrders[order],exhaust[order]);}
          pipeline.process({[ids[0]]:e,[ids[1]]:x},l,r,frames);
        }
        timing.rendererAndControl.push({frame:at,ms:performance.now()-stamp,deadlineMs});left.set(l.subarray(0,frames),at);right.set(r.subarray(0,frames),at);
        if(at%(5*BLOCK)===0)rows.push({timeSeconds:t,control,pose:{x:pose.position[0],speed:pose.speed},sourceAddress:player.position,modeWeights:[...player.weights],runningEnvelope:player.envelope,clocks:clockRow(player)});
        timing.complete.push({frame:at,ms:performance.now()-start,deadlineMs});
      }
      const wallMs=performance.now()-begin,used=process.cpuUsage(cpu),diagnostics=pipeline?.diagnostics()??null,metrics=audioMetrics([left,right]);
      const file=model+'/'+name+'.wav',bytes=encodeVehicleWav([left,right]);fs.mkdirSync(path.join(out,model),{recursive:true});fs.writeFileSync(path.join(out,file),bytes);
      const checks={finite:metrics.nonfiniteSamples===0,unclipped:metrics.clippedSamples===0&&metrics.peak<.98,inputBound:peakInput<=.980001,
        noSourceOverreads:Object.values(player.voices).flatMap(Object.values).every(v=>v.stats.sourceBoundViolations===0),retardedFrameAgreement:!flying||maximumRetardedFrameError<1,
        noRendererFaults:!diagnostics||['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'].every(k=>diagnostics.renderer[k]===0),
        noPcmHistoryFaults:!diagnostics||diagnostics.history.affectedFrames===0,
        streetExhaustReturns:kind!=='street'||exhaustOrders[1]>0&&exhaustOrders[2]>0,
        plannedNativeEventCompleted:!eventPlan.length||player.stats.events.triggered===1&&player.stats.events.completed===1};
      const result={model,name,file,sha256:sha(bytes),kind:flying?kind:'source',scenario:flying?(delayed?'delayed-lift6.3':'controlled03'):'complete24',player:old?'old03':'new04',
        durationSeconds:duration,sourceGain:G,sourceConfiguration:{pressureSharesByState:config.pressureSharesByState},directivity:config.directivity,rendererMasterGain:flying?MASTER:null,
        eventPlan,metrics,sourceHash:sourceHash.digest('hex'),controlHash:controlHash.digest('hex'),motionHash:motionHash.digest('hex'),sourceStats:player.stats,voices:voiceSnapshot(player),
        diagnostics,propagation:{sceneSwitchTime,maximumRetardedFrameError,minRate:flying?minRate:null,maxRate:flying?maxRate:null,maximumOrders,exhaustOrders},
        timings:Object.fromEntries(Object.entries(timing).map(([k,v])=>[k,summarize(v)])),initializationMs,wallMs,nodeCpuMs:(used.user+used.system)/1000,peakInput,checks,rows};
      report.files.push(result);save();
      if(solo){const soloFile=model+'/new04-source-exhaust.wav',encoded=encodeVehicleWav([solo,solo]);fs.writeFileSync(path.join(out,soloFile),encoded);
        report.files.push({...result,name:'new04-source-exhaust',file:soloFile,sha256:sha(encoded),mask:'exhaust',metrics:audioMetrics([solo,solo]),derivedFrom:file,
          timings:null,rows:null,interpretation:'Same source run; engine omitted; same mono equal-energy presentation factor, no level compensation'});save();}
      console.log(model+' '+name+' peak='+metrics.peak.toFixed(5)+' completeMisses='+result.timings.complete.misses.length);
      assert.ok(Object.values(checks).every(Boolean),'render checks failed: '+file+' '+JSON.stringify(checks));return result;
    }finally{pipeline?.close();}
  }
  try{
    for(const model of stockModels){
      const old=await run(model,'old03-source',{old:true}),now=await run(model,'new04-source',{exhaustSolo:true});
      assert.equal(old.controlHash,now.controlHash);assert.equal(old.motionHash,now.motionHash);assert.deepEqual(old.sourceConfiguration,now.sourceConfiguration);
      for(const delayed of [false,true]){
        const results=[];for(const kind of ['open','street'])results.push(await run(model,'new04-'+(delayed?'delayed':'controlled')+'-'+kind,{kind,delayed}));
        for(const key of ['sourceHash','controlHash','motionHash'])assert.equal(results[0][key],results[1][key],'open/street must share exact '+key);
        if(!delayed)for(const f of results){const before=beforeReferences.find(b=>b.model===model&&b.kind===f.kind);assert.equal(f.controlHash,before.controlHash);assert.equal(f.motionHash,before.motionHash);}
      }
    }
    assert.equal(report.files.length,28);
    for(const [file,hash] of protectedFiles)assert.equal(sha(fs.readFileSync(file)),hash,'protected earlier input changed');
    for(const [file,hash] of Object.entries(bindings))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'rendered core changed during run');
    report.status='complete';report.protectedInputCount=protectedFiles.size;report.protectedInputsUnchanged=true;save();return report;
  }catch(error){report.status='failed';report.error={name:error.name,message:error.message};save();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={},keys={'--manifest':'manifestFile','--sustain-atlas':'sustainAtlasFile','--mix':'mixFile','--pops':'popManifestFile','--legacy-root':'legacyRoot','--output':'output'};
  for(let i=2;i<process.argv.length;i++){
    const flag=process.argv[i];
    if(keys[flag]){assert.ok(process.argv[i+1]&&!process.argv[i+1].startsWith('--'),'path required after '+flag);options[keys[flag]]=path.resolve(process.argv[++i]);}
    else{assert.ok(!flag.startsWith('--')&&!options.output,'unknown or duplicate output argument: '+flag);options.output=path.resolve(flag);}
  }
  renderStockSource04(options).catch(error=>{console.error(error);process.exitCode=1;});
}
