// Focused offline all-vehicle audition. Original decoded PCM remains private.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadStockAssets,loadStockExhaustPops,StockVehicleSource,stockModels,stockRoles} from '../src/acoustics/vehicle/stock-source.mjs';
import {VehicleAcousticPipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {createVehicleEnvironment,BoundedLateReverb} from '../src/acoustics/vehicle/environment.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile,inBox} from '../src/acoustics/research/local-geometry.mjs';
import {candidatePaths,pathGeometry} from '../src/acoustics/engine/paths.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {stockPose,stockEmitters,stockDirectScenes,stockOperating,stockDemonstrations,passTime} from './stock-source-01-scenario.mjs';
import {renderHeldDistance,distanceProbeMetres} from '../tests/fixtures/vehicle-distance-probe.mjs';
import {StockExhaustEvents} from '../src/acoustics/vehicle/stock-events.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),FS=48000,BLOCK=512,MASTER=.7;
const BASE='3fa6649fd687bf524bd3cc9df8847cdf6a0026b4';
const sha=data=>createHash('sha256').update(data).digest('hex');
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export const source03Windows=Object.freeze({idle:[.4,1.2],rise:[2.5,3.8],hold:[5.5,12.5],lift:[14,15.4],tail:[16.4,18]});
export function source03Operating(t){
  const rise=smooth((t-1.5)/3),lift=smooth((t-13.5)/1.5);
  return {operatingPoint:(.1+.85*rise)*(1-lift)+.3*lift,
    load:(.15+.8*rise)*(1-lift)+.07*lift,running:t<15.8,lift:t>=13.5};
}
export function source03FlybyOperating(t){
  if(t<5.32)return stockOperating(t,true);
  const lift=smooth((t-5.32)/.3);
  return {operatingPoint:.98-.55*smooth((t-5.32)/(10.3-5.32)),
    load:(.3+.65*smooth(t/5.3))*(1-lift)+.07*lift,running:true,lift:true};
}
export function source03FlybyScenes(kind='open',distanceProfile='authored-detail-loss-v1'){
  assert.ok(['open','street'].includes(kind));
  if(kind==='open')return stockDirectScenes().map(s=>acousticScene(s.tile,s.materials,{...s.config,...vehicleDistanceSceneOptions(distanceProfile)}));
  const template=createVehicleEnvironment('canyon',{duration:10.3}).scene;
  return [[-250,6],[-6,250]].map(([minX,maxX],index)=>{
    const surfaces=template.tile.surfaces.map(surface=>{
      assert.deepEqual(surface.u,[1,0,0]);assert.equal(surface.normal[0],0);
      const a=Math.max(-5,surface.center[0]-surface.half[0]),b=Math.min(5,surface.center[0]+surface.half[0]);
      assert.ok(b>a);
      return {...surface,center:[(a+b)/2,surface.center[1],surface.center[2]],half:[(b-a)/2,surface.half[1]]};
    });
    const tile=createTile({...template.tile,id:'source03-street-'+index,bounds:{min:[minX,-15,-2],max:[maxX,15,10]},
      listenerAnchor:[0,2,1.4],surfaces,build:'source03-finite-street',session:'source03-audition'});
    return acousticScene(tile,template.materials,{...template.config,...vehicleDistanceSceneOptions(distanceProfile)});
  });
}
const percentile=values=>{const a=[...values].sort((x,y)=>x-y);return {count:a.length,p95:a[Math.floor(.95*a.length)],max:a.at(-1),
  deadlineMs:BLOCK/FS*1000,misses:a.filter(x=>x>BLOCK/FS*1000).length};};
function voiceStats(player){return Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
  const voice=player.voices[role][mode];return [mode,{...voice.stats,maximumBoundaryStep:voice.maximumBoundaryStep,clockCycles:voice.clockCycles}];}))]));}
function occupancy(player){return Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
  const voice=player.voices[role][mode];return [mode,voice.textureOccupancy?Uint32Array.from(voice.textureOccupancy):null];}))]));}
function occupancyDifference(before,after){
  if(!before||!after)return null;
  return Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{
    const a=before[role][mode],b=after[role][mode];if(!a||!b)return [mode,null];
    const used=[];let reads=0;for(let i=0;i<b.length;i++){const delta=b[i]-a[i];if(delta>0){used.push(i);reads+=delta;}}
    return [mode,{intervalsUsed:used.length,minimumInterval:used[0]??null,maximumInterval:used.at(-1)??null,textureReadOccupancy:reads}];}))]));
}

async function renderDistancePackage(assets,mix,G,destination){
  const directory=privateStoragePath(root,destination);assert.ok(!fs.existsSync(directory),'fresh private distance package required');
  const total=FS*3,gap=FS*.25,length=total*6+gap*5,sources={},rows=[],outputs={};
  for(const model of stockModels){
    const control={operatingPoint:.95,load:.95,running:true,lift:false};
    const player=new StockVehicleSource(assets.vehicles.get(model),{sourceGain:G,pressureSharesByState:mix.profiles[model].pressureSharesByState});
    const pcm=new Float32Array(total),e=new Float32Array(BLOCK),x=new Float32Array(BLOCK);
    for(let at=0;at<total;at+=BLOCK){const n=Math.min(BLOCK,total-at);player.renderInto(control,e,x,n);for(let i=0;i<n;i++)pcm[at+i]=(e[i]+x[i])*Math.SQRT1_2;}
    const sourceSha256=sha(Buffer.from(pcm.buffer));assert.ok(pcm.every(v=>Number.isFinite(v)&&Math.abs(v)<.98));
    sources[model]={sourceSha256,heldControl:control,frames:total,sourceGain:G,pressureSharesByState:mix.profiles[model].pressureSharesByState,pcm};
    for(const profile of model==='schafter3'?['physical-default','authored-detail-loss-v1']:['authored-detail-loss-v1']){
      const label=profile==='physical-default'?'default':'authored',file='fixed-state-distance-'+model+'-'+label+'.wav';
      const left=new Float32Array(length),right=new Float32Array(length);
      for(let i=0;i<distanceProbeMetres.length;i++){
        const distance=distanceProbeMetres[i],rendered=await renderHeldDistance(pcm,{distance,profile,masterGain:MASTER}),startFrame=i*(total+gap);
        left.set(rendered.left,startFrame);right.set(rendered.right,startFrame);
        const d=rendered.diagnostics;
        rows.push({model,profile,file,distanceMetres:distance,startFrame,frames:total,sourceSha256,
          delaySeconds:rendered.delay,propagation:rendered.propagation,metrics:audioMetrics([rendered.left,rendered.right]),
          diagnostics:{renderer:{limited:d.renderer.limited,missingHistory:d.renderer.missingHistory,cursorResets:d.renderer.cursorResets,
            rejectedControls:d.renderer.rejectedControls,pathOverflow:d.renderer.pathOverflow},historyAffectedFrames:d.history.affectedFrames,simulationMissingPast:d.simulation.missingPast}});
      }
      assert.equal(sha(Buffer.from(pcm.buffer)),sourceSha256);outputs[file]=encodeVehicleWav([left,right]);
    }
  }
  fs.mkdirSync(directory,{recursive:true});
  for(const [model,source] of Object.entries(sources)){fs.writeFileSync(path.join(directory,'held-'+model+'.f32'),Buffer.from(source.pcm.buffer));delete source.pcm;}
  for(const [file,bytes] of Object.entries(outputs))fs.writeFileSync(path.join(directory,file),bytes);
  const report={schemaVersion:1,milestone:'STOCK-SOURCE-03',sampleRate:FS,rendererMasterGain:MASTER,sources,rows,
    sequence:{distancesMetres:[...distanceProbeMetres],segmentSeconds:3,gapSeconds:.25,startSeconds:distanceProbeMetres.map((_,i)=>i*3.25),totalSeconds:length/FS},
    analysis:{emissionWindowSeconds:[.65,2.1],waveformZoomEmissionSeconds:[.9,.918],frequencyLimitsHz:[40,10000]},
    setup:{sourceDirectivity:.5,listenerPosition:[0,0,1],sourcePositions:'[distanceMetres,0,1]',sourceForward:[-1,0,0],
      sourceVelocity:[0,0,0],listenerVelocity:[0,0,0],surfaces:0,lateField:false,tileBounds:{min:[-2,-2,0],max:[254,2,3]}},
    deliveredNormalisation:false,deliveredGainCompensation:false,
    limitations:['Same fixed held material and bearing isolate distance; no pop is scheduled in held playback',
      'Single co-located diagnostic emitter does not reproduce the full two-position vehicle mix',
      'Default/authored Schafter A/B is explicit; other vehicles retain the same authored profile with distinct genuine source PCM',
      'Each3s segment truncates final emitted material by propagation delay; common emitted-time analysis avoids truncation',
      'No distance timing campaign or physical SPL calibration'],subjectiveListeningPerformed:false};
  fs.writeFileSync(path.join(directory,'distance-render.json'),JSON.stringify(report,null,2)+'\n');return report;
}

async function renderIsolatedPop(assets,popAssets,mix,G,out){
  const config=mix.profiles.prototipo,bed=new StockVehicleSource(assets.vehicles.get('prototipo'),{sourceGain:G,pressureSharesByState:config.pressureSharesByState});
  const frames=Math.round(1.2*FS),emission=.25;
  const event=new StockExhaustEvents({assets:popAssets,triggers:[{atFrame:Math.round(emission*FS),variant:0,basis:'authored-offline-lift'}],
    bedPeakBound:bed.inputBounds.exhaust,roleGainBound:G*Math.max(...Object.values(config.pressureSharesByState).map(s=>s.exhaust))});
  const source=new Float32Array(frames),roleGain=G*config.pressureSharesByState.lift.exhaust;
  for(let frame=0;frame<frames;frame++)source[frame]=event.next(frame)*roleGain;
  assert.equal(event.stats.triggered,1);assert.equal(event.stats.completed,1);
  const sourceSha256=sha(Buffer.from(source.buffer)),scene=source03FlybyScenes('street')[0],position=stockEmitters('prototipo',stockPose('prototipo',0,false))[1].position;
  const listener={position:[0,2,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]},id='isolated-prototipo-exhaust';
  const sourceDescriptor={id,generation:1,position,velocity:[0,0,0],forward:[-1,0,0],up:[0,0,1],directivity:config.directivity.exhaust,valid:true,emitting:true};
  const fullLength=frames*3+Math.round(.15*FS)*2,left=new Float32Array(fullLength),right=new Float32Array(fullLength),rows=[];
  for(const order of [0,1,2]){
    const pipeline=new VehicleAcousticPipeline({scene,sourceIds:[id],quality:'quality',acceleration:'cpu',masterGain:MASTER});
    const l=new Float32Array(BLOCK),r=new Float32Array(BLOCK),input=new Float32Array(BLOCK),a=new Float32Array(frames),b=new Float32Array(frames);
    const arrivals=candidatePaths(scene).filter(p=>p.surfaces.length===order).map(candidate=>{
      const p=pathGeometry(scene,position,listener.position,candidate.surfaces);
      return p.status==='clear'?{delaySeconds:p.distance/343,arrivalSeconds:emission+p.distance/343,reflectors:candidate.surfaces.map(s=>s.id)}:null;}).filter(Boolean);
    assert.ok(arrivals.length>0);
    try{
      for(let at=0;at<frames;at+=BLOCK){const n=Math.min(BLOCK,frames-at);input.fill(0);input.set(source.subarray(at,at+n));
        const control=await pipeline.prepare({time:at/FS,session:'source03-native-event-diagnostic',generation:1,listener,sources:[sourceDescriptor]});
        // Isolate subsets of genuine computed paths, never a fabricated delay.
        pipeline.renderer.accept({...control,paths:control.paths.filter(p=>p.order===order)});
        pipeline.process({[id]:input},l,r,n);a.set(l.subarray(0,n),at);b.set(r.subarray(0,n),at);
      }
      const metrics=audioMetrics([a,b]),d=pipeline.diagnostics();assert.ok(metrics.rms>1e-8&&metrics.peak<.98);
      for(const key of ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'])assert.equal(d.renderer[key],0);assert.equal(d.history.affectedFrames,0);
      const first=a.findIndex((v,i)=>Math.max(Math.abs(v),Math.abs(b[i]))>metrics.peak*1e-5),expected=Math.min(...arrivals.map(p=>p.arrivalSeconds));
      assert.ok(first>=Math.floor(expected*FS)-1&&first<=Math.ceil(expected*FS)+FS*.002,'received event respects computed onset and finite edge envelope');
      const startFrame=order*(frames+Math.round(.15*FS));left.set(a,startFrame);right.set(b,startFrame);
      rows.push({order,startFrame,frames,sourceSha256,calculatedArrivals:arrivals,measuredFirstAboveThresholdSeconds:first/FS,
        thresholdRelativePeak:1e-5,receivedEnergy:metrics.rms**2*frames*2,metrics,
        diagnostics:{renderer:{limited:d.renderer.limited,missingHistory:d.renderer.missingHistory,cursorResets:d.renderer.cursorResets},historyAffectedFrames:d.history.affectedFrames}});
    }finally{pipeline.close();}
  }
  const sourceBytes=encodeVehicleWav([Float32Array.from(source,v=>v*Math.SQRT1_2),Float32Array.from(source,v=>v*Math.SQRT1_2)]);
  fs.writeFileSync(path.join(out,'prototipo/isolated-pop-source.wav'),sourceBytes);
  const receivedBytes=encodeVehicleWav([left,right]);fs.writeFileSync(path.join(out,'prototipo/isolated-pop-orders.wav'),receivedBytes);
  return {model:'prototipo',sourceFile:'prototipo/isolated-pop-source.wav',sourceWavSha256:sha(sourceBytes),
    receivedFile:'prototipo/isolated-pop-orders.wav',receivedWavSha256:sha(receivedBytes),sourceSha256,
    orderSequence:[0,1,2],segmentSeconds:1.2,gapSeconds:.15,segmentStartSeconds:[0,1.35,2.7],emissionSeconds:emission,
    nativeVariant:0,nativeSampleRate:popAssets.variants[0].sampleRate,eventStats:event.stats,roleGain,
    basis:'One finite native pop, stationary exhaust-only input; no engine bed, no FDN; only computed path subsets selected',rows};
}

export async function renderStockSource03(manifestFile,mixFile,legacyRoot,output,{sustainAtlasFile,popManifestFile,distanceOutput}={}){
  const out=privateStoragePath(root,output);assert.ok(!fs.existsSync(out),'fresh private audition directory required');
  legacyRoot=path.resolve(legacyRoot);assert.equal(execFileSync('git',['-C',legacyRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),BASE);
  const legacy=await import(pathToFileURL(path.join(legacyRoot,'src/acoustics/vehicle/stock-source.mjs')).href);
  assert.equal(typeof sustainAtlasFile,'string','explicit verified sustain atlas required for main real-source audition');
  assert.equal(typeof popManifestFile,'string','explicit verified X80 native event manifest required');
  const assets=loadStockAssets(manifestFile,{sustainAtlasFile}),mix=JSON.parse(fs.readFileSync(mixFile,'utf8'));
  const popAssets=loadStockExhaustPops(popManifestFile);
  assert.equal(mix.phase,'new03-corrected-texture-verified','frozen post-correction mix recheck required');
  const inputBindings={sustainAtlasSha256:sha(fs.readFileSync(sustainAtlasFile)),mixSha256:sha(fs.readFileSync(mixFile)),popManifestSha256:sha(fs.readFileSync(popManifestFile))};
  assert.equal(mix.sustainAtlasSha256,inputBindings.sustainAtlasSha256,'balance recheck must bind the actual sustain atlas');
  assert.ok(mix.coreBindings&&Object.keys(mix.coreBindings).length>0,'balance recheck core bindings required');
  for(const [file,binding] of Object.entries(mix.coreBindings)){
    assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'repository-relative core binding');
    assert.equal(sha(fs.readFileSync(path.join(root,file))),binding,'balance recheck predates core correction');}
  assert.ok(mix.profiles&&stockModels.every(model=>mix.profiles[model]));
  const gains=stockModels.map(model=>mix.profiles[model].sourceGain);assert.equal(new Set(gains).size,1,'one disclosed common gain');
  const G=gains[0];assert.ok(Number.isFinite(G)&&G>0&&G<=2);
  const watched=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/pipeline.mjs',
    'src/acoustics/vehicle/environment.mjs','src/acoustics/vehicle/stock-events.mjs','src/acoustics/vehicle/distance-presentation.mjs','src/acoustics/streaming/causal.mjs',
    'src/acoustics/engine/paths.mjs','tools/stock-source-01-scenario.mjs'];
  const moduleBindings=Object.fromEntries(watched.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
  const protectedFiles=new Map();
  for(const file of ['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs']){
    const full=path.join(legacyRoot,file);protectedFiles.set(full,sha(fs.readFileSync(full)));}
  const references=[];fs.mkdirSync(out,{recursive:true});
  for(const model of stockModels)for(const role of stockRoles)for(const state of ['idle','accel','decel']){
    const asset=assets.vehicles.get(model).layers[role][state],source=path.join(assets.base,asset.wavFile),bytes=fs.readFileSync(source),hash=sha(bytes);
    assert.equal(hash.toUpperCase(),asset.sourceWavSha256.toUpperCase());protectedFiles.set(source,hash);
    const file=model+'/source/'+role+'_'+state+'.wav';fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
    fs.writeFileSync(path.join(out,file),bytes);assert.equal(sha(fs.readFileSync(path.join(out,file))),hash);
    references.push({model,role,state,file,sampleRate:asset.sampleRate,sha256:hash,byteIdentical:true});
  }
  const popReferences=[];
  for(const asset of popAssets.variants){const source=path.join(popAssets.base,asset.wavFile),bytes=fs.readFileSync(source),hash=sha(bytes);
    assert.equal(hash.toUpperCase(),asset.sourceWavSha256.toUpperCase());protectedFiles.set(source,hash);
    const file='prototipo/source/'+asset.wavFile;fs.writeFileSync(path.join(out,file),bytes);
    popReferences.push({model:'prototipo',name:asset.name,file,sampleRate:asset.sampleRate,sha256:hash,byteIdentical:true});}
  async function run({model,name,kind='close',mask='both',Source=StockVehicleSource,baseline=false}){
    const flying=['open','street'].includes(kind),sourceOnly=kind==='source',duration=flying?10.3:18,total=Math.round(duration*FS);
    const config=baseline?{pressureShares:{engine:.4,exhaust:.6},directivity:{engine:.1,exhaust:.35}}:mix.profiles[model];
    const sourceOptions=baseline?{pressureShares:config.pressureShares}:{pressureSharesByState:config.pressureSharesByState};
    if(!baseline)assert.ok(sourceOptions.pressureSharesByState,'explicit per-vehicle state balance required');
    const eventPlan=model==='prototipo'&&!baseline?[{atFrame:Math.round((flying?5.34:13.56)*FS),variant:flying?0:1,basis:'authored-offline-lift'}]:[];
    const initStart=performance.now(),player=new Source(assets.vehicles.get(model),{sourceGain:G,...sourceOptions,
      ...(eventPlan.length?{exhaustEvents:{assets:popAssets,triggers:eventPlan}}:{})});
    const sourceInitializationMs=performance.now()-initStart;
    const env=kind==='tunnel'?createVehicleEnvironment('tunnel',{duration}):createVehicleEnvironment('direct',{duration});
    const scenes=flying?source03FlybyScenes(kind):[acousticScene(env.scene.tile,env.scene.materials,{...env.scene.config,...vehicleDistanceSceneOptions('authored-detail-loss-v1')})];
    const ids=stockRoles.map(role=>'stock:'+model+':'+role),pipeline=sourceOnly?null:new VehicleAcousticPipeline({scene:scenes[0],sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain:MASTER});
    const late=kind==='tunnel'?new BoundedLateReverb(env.lateEvidence):null;
    const left=new Float32Array(total),right=new Float32Array(total),earlyL=late?new Float32Array(total):null,earlyR=late?new Float32Array(total):null;
    const lateL=late?new Float32Array(total):null,lateR=late?new Float32Array(total):null;
    const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK),se=new Float32Array(BLOCK),sx=new Float32Array(BLOCK),wl=new Float32Array(BLOCK),wr=new Float32Array(BLOCK);
    const times={source:[],rendererAndControl:[],complete:[]},sourceHash=createHash('sha256'),motionHash=createHash('sha256'),controlHash=createHash('sha256');
    const rows=[],orderCounts={direct:0,first:0,second:0},exhaustReturns={first:0,second:0};
    let sceneIndex=0,lastPaths=0,maximumRetardedFrameError=0,minRate=Infinity,maxRate=0,peakInput=0,sceneSwitchTime=null;
    let holdBegin=null,holdEnd=null,holdBeginTime=null,holdEndTime=null;
    const cpu=process.cpuUsage(),startWall=performance.now();
    try{
      for(let at=0;at<total;at+=BLOCK){const begin=performance.now(),frames=Math.min(BLOCK,total-at),t=at/FS;
        const control=flying?source03FlybyOperating(t):source03Operating(t),pose=stockPose(model,t,flying);
        if(!flying&&!holdBegin&&t>=4.5){holdBegin=occupancy(player);holdBeginTime=t;}
        if(!flying&&!holdEnd&&t>=13.5){holdEnd=occupancy(player);holdEndTime=t;}
        let stamp=performance.now();player.renderInto(control,e,x,frames);times.source.push(performance.now()-stamp);
        sourceHash.update(Buffer.from(e.buffer,0,frames*4));sourceHash.update(Buffer.from(x.buffer,0,frames*4));
        motionHash.update(JSON.stringify([t,pose]));controlHash.update(JSON.stringify([t,control]));
        for(let i=0;i<frames;i++)peakInput=Math.max(peakInput,Math.abs(e[i]),Math.abs(x[i]));
        stamp=performance.now();
        if(sourceOnly){for(let i=0;i<frames;i++)l[i]=r[i]=(e[i]+x[i])*Math.SQRT1_2;}
        else{
          if(flying&&!sceneIndex&&pose.position[0]>=3.5){sceneIndex=1;sceneSwitchTime=t;
            pipeline.replaceScene(scenes[1],kind==='street'?{preserveIdenticalReflectors:true}:undefined);}
          const listener={position:[0,flying?2:1.5,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]};
          const emitters=stockEmitters(model,pose).map(emitter=>({...emitter,directivity:config.directivity[emitter.id.endsWith('engine')?'engine':'exhaust']}));
          assert.ok(inBox(listener.position,scenes[sceneIndex].tile.bounds)&&emitters.every(s=>inBox(s.position,scenes[sceneIndex].tile.bounds)),'current source/listener inside validated tile');
          const paths=await pipeline.prepare({time:t,session:'source03-audition',generation:1,listener,sources:emitters});lastPaths=paths.paths.length;
          const counts=[0,0,0],exhaust=[0,0,0];
          for(const p of paths.paths){
            assert.ok(Math.abs(p.delay-p.distance/343)<1e-8);const error=Math.abs(p.emissionFrame-(t-p.delay)*FS);
            assert.ok(error<1);maximumRetardedFrameError=Math.max(maximumRetardedFrameError,error);minRate=Math.min(minRate,p.rate);maxRate=Math.max(maxRate,p.rate);
            const speed=flying?stockDemonstrations[model].maximumSpeed:0;
            assert.ok(p.rate>=1/(1+speed/343)-.02&&p.rate<=1/(1-speed/343)+.02,'independent physical Doppler bound');
            counts[p.order]++;if(p.sourceId.endsWith('exhaust'))exhaust[p.order]++;
          }
          orderCounts.direct=Math.max(orderCounts.direct,counts[0]);orderCounts.first=Math.max(orderCounts.first,counts[1]);orderCounts.second=Math.max(orderCounts.second,counts[2]);
          exhaustReturns.first=Math.max(exhaustReturns.first,exhaust[1]);exhaustReturns.second=Math.max(exhaustReturns.second,exhaust[2]);
          if(mask==='engine')x.fill(0);if(mask==='exhaust')e.fill(0);
          pipeline.process({[ids[0]]:e,[ids[1]]:x},l,r,frames);
          if(late){
            const enabled=emitters.every(s=>inBox(s.position,env.lateEvidence.bounds))&&inBox(listener.position,env.lateEvidence.bounds);
            assert.ok(enabled,'analytic source/listener enclosure evidence remains valid');
            for(let i=0;i<frames;i++){se[i]=e[i]*MASTER;sx[i]=x[i]*MASTER;}
            late.processSourceStemsInto(se.subarray(0,frames),sx.subarray(0,frames),wl.subarray(0,frames),wr.subarray(0,frames),{enabled});
            for(let i=0;i<frames;i++){earlyL[at+i]=l[i];earlyR[at+i]=r[i];lateL[at+i]=wl[i];lateR[at+i]=wr[i];l[i]+=wl[i];r[i]+=wr[i];}
          }
          if(at%(10*BLOCK)===0)rows.push({time:t,x:pose.position[0],speed:pose.speed,operatingPoint:control.operatingPoint,load:control.load,running:control.running,
            sceneIndex,pathOrders:counts,paths:paths.paths.map(p=>({role:p.sourceId.endsWith('engine')?'engine':'exhaust',order:p.order,distance:p.distance,delay:p.delay,rate:p.rate,bands:p.bands}))});
        }
        times.rendererAndControl.push(performance.now()-stamp);
        for(let i=0;i<frames;i++){assert.ok(Number.isFinite(l[i])&&Number.isFinite(r[i])&&Math.max(Math.abs(l[i]),Math.abs(r[i]))<.98,'no nonfinite output, clipping or hidden limiter');left[at+i]=l[i];right[at+i]=r[i];}
        times.complete.push(performance.now()-begin);
      }
      const metrics=audioMetrics([left,right]),diagnostics=pipeline?.diagnostics()??null;
      assert.equal(metrics.clippedSamples,0);assert.equal(metrics.nonfiniteSamples,0);assert.ok(peakInput<=.980001,'declared input budget with Float32 rounding tolerance');
      if(diagnostics){for(const key of ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'])assert.equal(diagnostics.renderer[key],0);
        assert.equal(diagnostics.history.affectedFrames,0);if(flying)assert.ok(lastPaths>=2);}
      if(kind==='street'||kind==='tunnel')assert.ok(exhaustReturns.first>0&&exhaustReturns.second>0,'exhaust receives finite first and second orders');
      if(eventPlan.length){assert.equal(player.stats.events.triggered,1);assert.equal(player.stats.events.completed,1);}
      const eventReturns=eventPlan.map(event=>{
        const eventTime=event.atFrame/FS,pose=stockPose(model,eventTime,flying),source=stockEmitters(model,pose)[1].position;
        const scene=scenes[flying&&pose.position[0]>=3.5?1:0],listener=[0,flying?2:1.5,1.4];
        const arrivals=(sourceOnly||mask==='engine'?[]:candidatePaths(scene)).map(candidate=>{const geometry=pathGeometry(scene,source,listener,candidate.surfaces);
          return geometry.status==='clear'?{order:candidate.surfaces.length,distance:geometry.distance,delay:geometry.distance/343,
            arrivalSeconds:eventTime+geometry.distance/343,reflectors:candidate.surfaces.map(s=>s.id)}:null;}).filter(Boolean);
        if(kind==='street')assert.ok(arrivals.some(a=>a.order===1)&&arrivals.some(a=>a.order===2));
        return {...event,emissionSeconds:eventTime,emitter:'exhaust',trigger:'authored offline lift; native ECU conditions unverified',arrivals};
      });
      const file=model+'/'+name+'.wav',bytes=encodeVehicleWav([left,right]);fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.writeFileSync(path.join(out,file),bytes);
      const extras=[];
      if(late)for(const [suffix,a,b] of [['early',earlyL,earlyR],['late',lateL,lateR]]){
        const extra=model+'/tunnel-'+suffix+'.wav',encoded=encodeVehicleWav([a,b]);fs.writeFileSync(path.join(out,extra),encoded);extras.push({file:extra,sha256:sha(encoded),metrics:audioMetrics([a,b])});}
      const used=process.cpuUsage(cpu);
      return {model,name,kind,file,sha256:sha(bytes),durationSeconds:duration,sampleRate:FS,blockFrames:BLOCK,sourceOnly,mask,
        player:Source===StockVehicleSource?'new03':'previous02',mixLabel:baseline?'fixed previous02 Schafter .4/.6; source-player-only comparison':'authored per-vehicle state balance',
        sourceGain:G,sourceConfiguration:sourceOptions,directivity:config.directivity,rendererMasterGain:sourceOnly?null:MASTER,
        distanceProfile:sourceOnly?null:'authored-detail-loss-v1',normalised:false,nativeHostGainUsed:false,
        sourceHash:sourceHash.digest('hex'),motionHash:motionHash.digest('hex'),controlHash:controlHash.digest('hex'),
        metrics,peakInput,sourceStats:player.stats,voices:voiceStats(player),diagnostics,eventPlan,eventReturns,
        heldTextureOccupancy:flying?null:{windowSeconds:[holdBeginTime,holdEndTime],voices:occupancyDifference(holdBegin,holdEnd),
          interpretation:'Occupancy within the high-hold block window; includes voices read with zero mixing weight, so audible-role interpretation must use state weights'},
        propagation:{lastPathCount:lastPaths,maximumRetardedFrameError,minRate:sourceOnly?null:minRate,maxRate,maximumSimultaneousOrders:orderCounts,exhaustReturns,sceneSwitchTime},
        late:late?.diagnostics()??null,extras,rows,sourceInitializationMs,
        timings:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,percentile(v)])),nodeCpuMs:(used.user+used.system)/1000,wallMs:performance.now()-startWall};
    }finally{pipeline?.close();}
  }
  const files=[];
  for(const model of stockModels){
    for(const spec of [{name:'source',kind:'source'},{name:'close-engine',mask:'engine'},{name:'close-exhaust',mask:'exhaust'},
      {name:'close-combined'},{name:'flyby-open',kind:'open'},{name:'flyby-street',kind:'street'}]){
      const result=await run({model,...spec});files.push(result);console.log('render '+model+' '+spec.name+' peak '+result.metrics.peak.toFixed(5));}
    const group=files.filter(f=>f.model===model),stationary=group.filter(f=>!f.kind.includes('open')&&!f.kind.includes('street'));
    assert.equal(new Set(stationary.map(f=>f.sourceHash)).size,1,'source/close stems share exact authored PCM');
    const flybys=group.filter(f=>['open','street'].includes(f.kind));for(const key of ['sourceHash','motionHash','controlHash'])assert.equal(flybys[0][key],flybys[1][key],'open/street differ only by finite environment');
  }
  for(const spec of [{name:'previous02-source-same-mix',kind:'source',Source:legacy.StockVehicleSource,baseline:true},
    {name:'new03-source-same-mix',kind:'source',baseline:true},{name:'tunnel-combined',kind:'tunnel'}])files.push(await run({model:'schafter3',...spec}));
  for(const [file,hash] of protectedFiles)assert.equal(sha(fs.readFileSync(file)),hash,'previous source/native reference modified');
  for(const [file,hash] of Object.entries(moduleBindings))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'core changed during timed rendering');
  const isolatedPop=await renderIsolatedPop(assets,popAssets,mix,G,out);
  const report={schemaVersion:1,milestone:'STOCK-SOURCE-03',baseCommit:BASE,sourceGain:G,rendererMasterGain:MASTER,
    controls:{durationSeconds:18,highHoldSeconds:[4.5,13.5],sourceStopsAtSeconds:15.8,windows:source03Windows,
      flyby:'Unchanged stockPose10.3s/pass5.3s; explicitly authored lift5.32s; coverage-tile swap atx>=3.5m'},
    profiles:mix.profiles,mixPhase:mix.phase,mixMeasurementRun:mix.measurementRun,inputBindings,moduleBindings,references,popReferences,isolatedPop,files,
    geometry:{basis:'Same authored10m finite street section in both <=256m coverage regions; only tile bounds change',
      originalSupports:{floorX:[-120,120],wallsX:[-100,100]},retainedStreetSupportsX:[-5,5],tileBoundsX:[[-250,6],[-6,250]],swapAtVehicleX:3.5,
      coverageTransition:'Validated preserveIdenticalReflectors opt-in retains direct/reflected rate histories for exactly unchanged world/config; stale asynchronous epochs still advance',
      limitations:['Synthetic10m near-listener street section is not Los Santos coverage',
        'Both scenes contain identical finite planes/materials/IDs; no surfaces outside original supports and no street FDN']},
    noIndependentNormalisation:true,previousModulesAndNativeReferencesUnchanged:true,
    gameLaunched:false,audioEndpointOpened:false,subjectiveListening:'not performed',perceptualAcceptance:'Pending user listening',
    limitations:['Source operating point is not measured crankshaft RPM or recovered native granular semantics',
      'State balance/directivity and distance profile are explicit authored assumptions',
      'Offline instrumented timings do not establish live audio/GTA capacity','Only verified X80 finite pops with authored lift triggers; no synthetic pop, generic noise or unverified intake/KERS source added']};
  fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');
  await renderDistancePackage(assets,mix,G,distanceOutput??path.join(path.dirname(out),'distance'));
  for(const [file,hash] of Object.entries(moduleBindings))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'core changed during held distance render');
  assert.equal(sha(fs.readFileSync(sustainAtlasFile)),inputBindings.sustainAtlasSha256);
  assert.equal(sha(fs.readFileSync(mixFile)),inputBindings.mixSha256);assert.equal(sha(fs.readFileSync(popManifestFile)),inputBindings.popManifestSha256);
  console.log(JSON.stringify({generated:files.length,nativeReferences:references.length,
    maximumCompleteBlockMs:Math.max(...files.map(f=>f.timings.complete.max)),deadlineMisses:files.reduce((n,f)=>n+f.timings.complete.misses,0)}));
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.ok(process.argv.length>=6,'Usage: node tools/Render-StockSource03.mjs <private manifest> <mix JSON> <unchanged02 checkout> <fresh private output> [--sustain-atlas file] [--pop-manifest file] [--distance-output directory]');
  const flags=process.argv.slice(6),options={};
  const names={'--sustain-atlas':'sustainAtlasFile','--pop-manifest':'popManifestFile','--distance-output':'distanceOutput'};
  for(let i=0;i<flags.length;i+=2){assert.ok(Object.hasOwn(names,flags[i])&&flags[i+1],'explicit render option');options[names[flags[i]]]=flags[i+1];}
  await renderStockSource03(...process.argv.slice(2,6),options);
}
