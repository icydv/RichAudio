// Private stock-PCM audition through existing RichAudio propagation. No endpoint.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadStockAssets,StockVehicleSource,stockModels,stockRoles,stockModes} from '../src/acoustics/vehicle/stock-source.mjs';
import {VehicleAcousticPipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {createVehicleEnvironment,BoundedLateReverb} from '../src/acoustics/vehicle/environment.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {stockDemonstrations,stockOperating,stockPose,stockEmitters,stockDirectScenes,closeDuration,flybyDuration,passTime,masterGain} from './stock-source-01-scenario.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),FS=48000,BLOCK=512;
export const stockCases=['close','street','tunnel-early','tunnel-before','tunnel','flyby','wall-open','wall'];
const hash=()=>createHash('sha256');const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const timing=values=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,p95:a[Math.floor(.95*a.length)],max:a.at(-1),deadlineMs:BLOCK/FS*1000,misses:a.filter(x=>x>BLOCK/FS*1000).length};};
async function render(vehicle,kind,sourceGain,{retain=false}={}){
  const flying=kind==='flyby',duration=flying?flybyDuration:closeDuration,total=Math.round(duration*FS);
  const env=createVehicleEnvironment(kind==='street'?'canyon':kind.startsWith('tunnel')?'tunnel':kind==='wall'?'corner':kind==='wall-open'?'road':'direct',{duration});
  const scenes=flying?stockDirectScenes():[env.scene];
  const player=new StockVehicleSource(vehicle,{sourceGain});
  const ids=stockRoles.map(n=>'stock:'+vehicle.model+':'+n),pipeline=new VehicleAcousticPipeline({scene:scenes[0],sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain,directStem:kind.startsWith('tunnel')});
  const late=['tunnel-before','tunnel'].includes(kind)?new BoundedLateReverb(env.lateEvidence):null;
  const legacyWet=kind==='tunnel-before',left=new Float32Array(total),right=new Float32Array(total),dry=new Float32Array(total),wetL=new Float32Array(total),wetR=new Float32Array(total);
  const e=new Float32Array(BLOCK),x=new Float32Array(BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK),dl=new Float32Array(BLOCK),dr=new Float32Array(BLOCK),wl=new Float32Array(BLOCK),wr=new Float32Array(BLOCK),se=new Float32Array(BLOCK),sx=new Float32Array(BLOCK);
  const inputHash=hash(),motionHash=hash(),cost=[],sourceCost=[],dspCost=[],rows=[];let changed=false,maxCombinedPeak=0,maxPaths=0,lastPathCount=0;
  let maximumRetardedFrameError=0,minimumRate=Infinity,maximumRate=0;
  const cpu=process.cpuUsage(),started=performance.now();
  try{
    for(let at=0;at<total;at+=BLOCK){const begin=performance.now(),n=Math.min(BLOCK,total-at),t=at/FS,pose=stockPose(vehicle.model,t,flying),control=stockOperating(t,flying);
      if(flying&&!changed&&t>=passTime){pipeline.replaceScene(scenes[1]);changed=true;}
      let stamp=performance.now();player.renderInto(control,e,x,n);sourceCost.push(performance.now()-stamp);
      inputHash.update(Buffer.from(e.buffer,0,n*4));inputHash.update(Buffer.from(x.buffer,0,n*4));motionHash.update(JSON.stringify([t,pose]));
      const listener={position:kind.startsWith('wall')?[4,6,1.4]:[0,flying?2:1.5,1.4],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1]};
      const paths=await pipeline.prepare({time:t,session:'stock-source01',generation:1,listener,sources:stockEmitters(vehicle.model,pose)});
      maxPaths=Math.max(maxPaths,paths.paths.length);
      lastPathCount=paths.paths.length;
      for(const p of paths.paths){
        assert.ok(Math.abs(p.delay-p.distance/343)<1e-8,'propagation delay matches physical path');
        const error=Math.abs(p.emissionFrame-(t-p.delay)*FS);maximumRetardedFrameError=Math.max(maximumRetardedFrameError,error);
        assert.ok(error<1,'retarded emission frame consistency');minimumRate=Math.min(minimumRate,p.rate);maximumRate=Math.max(maximumRate,p.rate);
        const speed=flying?stockDemonstrations[vehicle.model].maximumSpeed:0;
        assert.ok(p.rate>=1/(1+speed/343)-.015&&p.rate<=1/(1-speed/343)+.015,'kinematic Doppler envelope');
      }
      stamp=performance.now();pipeline.process({[ids[0]]:e,[ids[1]]:x},l,r,n,dl,dr);
      if(late){
        if(legacyWet)late.processInto(dl.subarray(0,n),dr.subarray(0,n),wl.subarray(0,n),wr.subarray(0,n));
        else{for(let i=0;i<n;i++){se[i]=e[i]*masterGain;sx[i]=x[i]*masterGain;}
          late.processSourceStemsInto(se.subarray(0,n),sx.subarray(0,n),wl.subarray(0,n),wr.subarray(0,n));}
      }else{wl.fill(0);wr.fill(0);}
      for(let i=0;i<n;i++){
        const a=l[i]+wl[i],b=r[i]+wr[i];assert.ok(Number.isFinite(a)&&Number.isFinite(b),'finite stock output');
        maxCombinedPeak=Math.max(maxCombinedPeak,Math.abs(a),Math.abs(b));
        assert.ok(Math.max(Math.abs(a),Math.abs(b))<.98,'No hidden output limiter or clipping');
        left[at+i]=a;right[at+i]=b;wetL[at+i]=wl[i];wetR[at+i]=wr[i];dry[at+i]=(e[i]+x[i])*Math.SQRT1_2;
      }
      dspCost.push(performance.now()-stamp);cost.push(performance.now()-begin);
      if(at%(BLOCK*10)===0)rows.push({time:t,x:pose.position[0],speed:pose.speed,operatingPoint:control.operatingPoint,
        load:control.load,running:control.running,pathCount:paths.paths.length,
        direct:paths.paths.filter(p=>p.order===0).map(p=>({role:p.sourceId.endsWith('engine')?'engine':'exhaust',distance:p.distance,rate:p.rate,delay:p.delay,bands:p.bands}))});
    }
    const metrics=audioMetrics([left,right]),diag=pipeline.diagnostics(),sourceEnergy={};
    assert.equal(metrics.clippedSamples,0);assert.equal(metrics.nonfiniteSamples,0);
    for(const k of ['limited','missingHistory','cursorResets'])assert.equal(diag.renderer[k],0,k);
    assert.equal(diag.history.affectedFrames,0);assert.equal(diag.simulation.resets,1);
    if(flying)assert.equal(lastPathCount,2,'both direct histories survive the far recession');
    for(const role of stockRoles){const z=player.stats.energy[role];sourceEnergy[role]={...z,overlapEnergyDb:10*Math.log10(z.actual/Math.max(z.reference,1e-30))};}
    const cpuWork=process.cpuUsage(cpu);
    return {left,right,dry,wetL,wetR,report:{kind,duration,sampleRate:FS,channels:2,model:vehicle.model,
      sourceGain,pressureShares:{engine:.5,exhaust:.5},rendererMasterGain:masterGain,nativeHostGain:'not used in offline WAV',
      passTime:flying?passTime:null,sourceStopsAt:flying?null:6.5,
      environment:{description:env.description,limitations:env.limitations,
        listenerPosition:kind.startsWith('wall')?[4,6,1.4]:[0,flying?2:1.5,1.4],
        wall:kind.startsWith('wall')?{present:kind==='wall',centre:[0,1.5,2],normal:[0,1,0],halfExtents:[10,2],
          transmissionEnergy:[.09,.009,.0009],basis:'existing authored fixture; not measured GTA geometry/material'}:null},
      referenceDistanceMetres:1,directivity:{engine:.1,exhaust:.65},normalised:false,metrics,maxCombinedPreLimiterPeak:maxCombinedPeak,
      dryMetrics:audioMetrics([dry,dry]),wetMetrics:audioMetrics([wetL,wetR]),sourceEnergy,
      propagation:{lastPathCount,minimumRate,maximumRate,maximumRetardedFrameError,checked:'distance/c, retarded clock and kinematic rate envelope'},
      sourceStats:player.stats,sourceHash:inputHash.digest('hex'),motionHash:motionHash.digest('hex'),maxPaths,diagnostics:diag,
      late:late?.diagnostics()??null,lateSend:late?(legacyWet?'received direct stereo downmix':'pre-propagation orthogonal source-energy stems'):null,
      timings:{source:timing(sourceCost),dspAndLate:timing(dspCost),complete:timing(cost)},
      nodeCpuMs:(cpuWork.user+cpuWork.system)/1000,wallMs:performance.now()-started,rows:retain?rows:undefined,
      limitations:['Source-time selection is an explicit normalized spectral-state approximation, not native granular/RPM reconstruction',
        'Two authored emitter offsets/directivities; not validated game bones or measured SPL',
        'Offline CPU timing includes instrumentation; no WASAPI or GTA-load result','Lectro KERS audio remains unverified and is not synthesized']}};
  }finally{pipeline.close();}
}
const mixOffsets=[[0,0,0,0],[0,.001,.003,.007],[0,.009,.019,.031],[0,.137,.421,.913],[0,.5,1,1.5]];
function measureDistinctMixes(signals){
  const programs=[...stockCases.map(kind=>stockModels.map(()=>kind)),['close','street','tunnel','flyby'],['tunnel','tunnel-early','street','close']];
  return programs.flatMap(cases=>mixOffsets.map(offsetSeconds=>{
    const starts=offsetSeconds.map(t=>Math.round(t*FS)),sources=cases.map((kind,i)=>signals.get(stockModels[i]+':'+kind));
    const length=Math.max(...sources.map((s,i)=>s.left.length+starts[i]));let peak=0,energy=0;
    for(let channel=0;channel<2;channel++){
      const sum=new Float64Array(length);
      for(let i=0;i<4;i++){const input=channel?sources[i].right:sources[i].left;for(let at=0;at<input.length;at++)sum[starts[i]+at]+=input[at];}
      for(const value of sum){peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    }
    return {cases,offsetSeconds,peak,rms:Math.sqrt(energy/(length*2))};
  }));
}
export async function renderStockAudition(manifestFile,output){
  const assets=loadStockAssets(manifestFile),out=privateStoragePath(root,output);
  if(fs.existsSync(out))throw Error('Fresh private audition directory required');fs.mkdirSync(out,{recursive:true});
  const preliminary=[],scoutSignals=new Map();let maximumUnscaledPeak=0,maximumUnscaledDryPeak=0,maximumUnscaledInputPeak=0;
  // A conservative linear scouting gain avoids activating the old renderer
  // guard. Only representative actual samples/scenes determine final gain.
  for(const model of stockModels)for(const kind of stockCases){const result=await render(assets.vehicles.get(model),kind,.25);
    assert.equal(result.report.diagnostics.renderer.limited,0);maximumUnscaledPeak=Math.max(maximumUnscaledPeak,result.report.maxCombinedPreLimiterPeak/.25);
    maximumUnscaledDryPeak=Math.max(maximumUnscaledDryPeak,result.report.dryMetrics.peak/.25);
    maximumUnscaledInputPeak=Math.max(maximumUnscaledInputPeak,result.report.sourceStats.peak/.25);
    scoutSignals.set(model+':'+kind,{left:result.left,right:result.right});
    preliminary.push({model,kind,peakAtScoutingGain:result.report.maxCombinedPreLimiterPeak,unscaledPeak:result.report.maxCombinedPreLimiterPeak/.25,timings:result.report.timings});
    console.log('scout '+model+' '+kind+' '+result.report.metrics.peak.toFixed(5));}
  const scoutingMixes=measureDistinctMixes(scoutSignals),maximumUnscaledDistinctMixPeak=Math.max(...scoutingMixes.map(m=>m.peak/.25));scoutSignals.clear();
  const limits={boundedStemAllocation:2,dryPeak:.9/maximumUnscaledDryPeak,twoCoherentVehicles:.8/(2*maximumUnscaledPeak),
    measuredFourDistinctMixes:.8/maximumUnscaledDistinctMixPeak,individualEmitterInput:.98/maximumUnscaledInputPeak};
  const sourceGain=Math.min(...Object.values(limits));
  const calibration={sourceGain,method:'one common source calibration from all 32 source/scene previews; no per-vehicle/file normalisation',
    scoutingGain:.25,maximumUnscaledPeak,maximumUnscaledDryPeak,maximumUnscaledInputPeak,limits,coherentVehicleReserve:2,reservedSumPeak:.8,
    dryPeakCeiling:.9,worstSingleVehiclePeakBound:maximumUnscaledPeak*sourceGain,
    scope:'Two coherent worst-case outputs plus 50 explicitly declared four-distinct-vehicle mixtures. Not arbitrary four-car phase alignment, unknown geometry or live capacity.',
    outsidePolicy:'Deliberately aligning distinct bank extrema can exceed full scale; no universal four-vehicle headroom guarantee.',
    scoutingMixes:scoutingMixes.map(m=>({...m,unscaledPeak:m.peak/.25})),preliminary};
  const vehicles=[];
  const finalSignals=new Map();
  for(const model of stockModels){const vehicle=assets.vehicles.get(model),dir=path.join(out,model);fs.mkdirSync(path.join(dir,'source'),{recursive:true});
    for(const role of stockRoles)for(const mode of stockModes)fs.copyFileSync(path.resolve(assets.base,vehicle.layers[role][mode].wavFile),path.join(dir,'source',role+'_'+mode+'.wav'));
    const files={};let sharedSource=null;
    for(const kind of stockCases){const result=await render(vehicle,kind,sourceGain,{retain:true});
      assert.ok(result.report.metrics.peak*2<=.80001,'shared two-coherent-vehicle peak reserve');
      assert.ok(result.report.dryMetrics.peak<=.90001,'dry reconstruction headroom');
      assert.ok(result.report.sourceStats.peak<=.98001,'individual emitter input headroom');
      finalSignals.set(model+':'+kind,{left:result.left,right:result.right});
      fs.writeFileSync(path.join(dir,kind+'.wav'),encodeVehicleWav([result.left,result.right]));
      if(kind==='close')fs.writeFileSync(path.join(dir,'dry.wav'),encodeVehicleWav([result.dry,result.dry]));
      if(kind==='tunnel')fs.writeFileSync(path.join(dir,'late-only.wav'),encodeVehicleWav([result.wetL,result.wetR]));
      if(kind!=='flyby'){if(sharedSource)assert.equal(result.report.sourceHash,sharedSource,'environment comparison source differs');else sharedSource=result.report.sourceHash;}
      files[kind]=result.report;console.log('final '+model+' '+kind+' '+result.report.metrics.peak.toFixed(5));
    }
    vehicles.push({model,name:stockDemonstrations[model].name,maximumAuthoredSpeedMps:stockDemonstrations[model].maximumSpeed,
      files,provenance:vehicle.provenance,status:'objective-render-complete-human-listening-pending'});
  }
  calibration.finalDistinctMixes=measureDistinctMixes(finalSignals);finalSignals.clear();
  calibration.maximumFinalDistinctMixPeak=Math.max(...calibration.finalDistinctMixes.map(m=>m.peak));
  assert.ok(calibration.maximumFinalDistinctMixPeak<=.80001,'declared four-distinct mixtures reserve');
  const report={schemaVersion:1,milestone:'STOCK-SOURCE-01',calibration,vehicles,
    sampleMapping:'Exhaust-verified chronological spectral progression: accel u, decel 1-u; engine uses bank-paired approximation where pitch is ambiguous. AbsoluteRPM/unknownnativeclock/gain fields are notinterpreted.',
    subjectiveListening:'not performed',gameLaunched:false,audioEndpointOpened:false};
  fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await renderStockAudition(process.argv[2],process.argv[3]??'.local/stock-source-01/audition');
