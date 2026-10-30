// Short genuine-source diagnostics only. No spatial renderer, audio device,
// archive access, normalization, listening, or writes to the old checkout.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
import {loadStockAssets,StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),FS=48000;
const manifest=path.resolve(process.argv[2]??path.join(root,'../RichAudio-StockSource01/.local/stock-source-01/assets-native/manifest.json'));
const evidence=path.resolve(process.argv[3]??path.join(root,'evidence/stock-source-02-source-fidelity.json'));
assert.ok(evidence.startsWith(root+path.sep),'new checkout evidence only');
const oldRoot=path.resolve(path.dirname(manifest),'../../..');
const {StockGrainVoice:OldVoice}=await import(pathToFileURL(path.join(oldRoot,'src/acoustics/vehicle/stock-grain.mjs')));
const loaded=loadStockAssets(manifest),models=['schafter3','bati','lectro','prototipo'];
const sha=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const moduleFiles={newGrain:path.join(root,'src/acoustics/vehicle/stock-grain.mjs'),newSource:path.join(root,'src/acoustics/vehicle/stock-source.mjs'),rejectedGrain:path.join(oldRoot,'src/acoustics/vehicle/stock-grain.mjs')};
const moduleBindings=Object.fromEntries(Object.entries(moduleFiles).map(([label,file])=>[label,sha(fs.readFileSync(file))]));
const rawHashes=new Map();
for(const v of loaded.vehicles.values())for(const role of ['engine','exhaust'])for(const state of ['idle','accel','decel']){
  const asset=v.layers[role][state];rawHashes.set(asset.samples,sha(asset.samples));
}
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);
const peak=x=>x.reduce((s,v)=>Math.max(s,Math.abs(v)),0);
const db=x=>x>0?20*Math.log10(x):null;
const quantile=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))]??null;};
const brief=a=>{const s=[...a].sort((x,y)=>x-y);return {count:a.length,median:s[Math.floor(s.length*.5)]??null,p95:s[Math.floor(s.length*.95)]??null,maximum:s.at(-1)??null};};
function sample(a,p){assert.ok(p>=0&&p<a.length);const i=Math.floor(p),f=p-i;return a[i]*(1-f)+a[Math.min(i+1,a.length-1)]*f;}
const plans=new Map();
function spectrum(input,n=input.length,hann=true){
  assert.ok((n&(n-1))===0&&input.length>=n);
  let plan=plans.get(n);
  if(!plan){const cos=Float64Array.from({length:n/2},(_,i)=>Math.cos(-2*Math.PI*i/n)),sin=Float64Array.from({length:n/2},(_,i)=>Math.sin(-2*Math.PI*i/n));plan={cos,sin};plans.set(n,plan);}
  const re=Float64Array.from(input.subarray(0,n),(v,i)=>v*(hann?.5-.5*Math.cos(2*Math.PI*i/(n-1)):1)),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let width=2;width<=n;width*=2){const stride=n/width;for(let at=0;at<n;at+=width)for(let j=0;j<width/2;j++){
    const k=at+j,l=k+width/2,c=plan.cos[j*stride],s=plan.sin[j*stride],r=re[l]*c-im[l]*s,t=re[l]*s+im[l]*c;
    re[l]=re[k]-r;im[l]=im[k]-t;re[k]+=r;im[k]+=t;
  }}
  return Float64Array.from(re.subarray(0,n/2),(v,i)=>v*v+im[i]*im[i]);
}
function spectral(input,clock=null){
  const n=65536,p=spectrum(input,n),bin=FS/n,lo=Math.ceil(20/bin),hi=Math.floor(8000/bin);
  let best=lo,total=0,onGrid=0;
  for(let k=lo;k<=hi;k++){if(p[k]>p[best])best=k;total+=p[k];if(clock&&Math.abs(k*bin/clock-Math.round(k*bin/clock))*clock<=2*bin)onGrid+=p[k];}
  const logs=[p[best-1],p[best],p[best+1]].map(v=>Math.log(Math.max(v,1e-30))),den=logs[0]-2*logs[1]+logs[2];
  const f=(best+(den?Math.max(-.5,Math.min(.5,(logs[0]-logs[2])/(2*den))):0))*bin;
  const harmonicPowers=[];
  if(clock)for(let order=1;order<=64;order++){const centre=Math.round(order*clock/bin);let e=0;for(let k=Math.max(1,centre-2);k<=Math.min(p.length-1,centre+2);k++)e+=p[k];harmonicPowers.push(e);}
  const e=harmonicPowers.reduce((s,v)=>s+v,0);
  return {dominantHz:f,dominantNearestIntervalOrder:clock?Math.round(f/clock):null,
    dominantIntervalGridErrorHz:clock?Math.abs(f-Math.round(f/clock)*clock):null,
    intervalGridPowerFraction20to8000:clock?onGrid/total:null,
    orderPowerFractions1to64:clock?harmonicPowers.map(v=>v/e):null,resolutionHz:bin};
}
function distributionCosine(a,b){let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){xy+=a[i]*b[i];xx+=a[i]*a[i];yy+=b[i]*b[i];}return xy/Math.sqrt(xx*yy);}
function independentPair(asset,u){
  const intervals=asset.intervals,target=u*(asset.frames-1),centres=intervals.map(r=>(r.startFrame+r.endFrame)/2);
  let a=0,b=0,w=0;
  if(target>=centres.at(-1))a=b=intervals.length-1;
  else if(target>centres[0]){b=centres.findIndex(c=>c>=target);a=b-1;w=(target-centres[a])/(centres[b]-centres[a]);}
  const x=intervals[a],y=intervals[b],length=(1-w)*(x.endFrame-x.startFrame)+w*(y.endFrame-y.startFrame);
  return {a,b,w,x,y,length,clock:asset.sampleRate/length};
}
function rawCyclePoint(asset,r,phase){
  const p=r.startFrame+phase*(r.endFrame-r.startFrame),i=Math.floor(p),f=p-i;
  const next=i+1>=r.endFrame?r.startFrame:i+1;
  return asset.samples[i]*(1-f)+asset.samples[next]*f;
}
function rawProfile(asset,pair){
  const grid=Float64Array.from({length:2048},(_,i)=>(1-pair.w)*rawCyclePoint(asset,pair.x,i/2048)+pair.w*rawCyclePoint(asset,pair.y,i/2048));
  const p=spectrum(grid,grid.length,false),powers=Array.from(p.subarray(1,65)),sum=powers.reduce((s,v)=>s+v,0);
  return {dominantOrder:powers.indexOf(Math.max(...powers))+1,orderPowerFractions1to64:powers.map(v=>v/sum),rms:rms(grid)};
}
function localMetrics(x){
  const steps=Array.from(x.subarray(1),(v,i)=>Math.abs(v-x[i])),p=spectrum(x,256),bin=FS/256;
  let high=0,total=0;for(let k=1;k<p.length;k++){total+=p[k];if(k*bin>=6000&&k*bin<20000)high+=p[k];}
  return {rms:rms(x),maximumAdjacentStep:Math.max(...steps),adjacentStepRms:rms(steps),high6to20kPowerFraction:high/total};
}
function rawSeams(asset,pair){
  const natural=[],untreated=[];
  for(const r of [pair.x,pair.y]){
    const step=asset.sampleRate/FS,width=128;
    if(r.startFrame-width*step<0||r.endFrame+width*step>=asset.frames)continue;
    natural.push(localMetrics(Float64Array.from({length:256},(_,i)=>sample(asset.samples,r.endFrame+(i-width)*step))));
    untreated.push(localMetrics(Float64Array.from({length:256},(_,i)=>sample(asset.samples,i<width?r.endFrame+(i-width)*step:r.startFrame+(i-width)*step))));
  }
  return {naturalOriginalBoundary:natural,untreatedNativeRateLoopJoin:untreated,windowSeconds:256/FS,
    note:'Raw original-boundary and hard-loop windows use native-rate source reads; synthesized pair morph/seam shaping can differ. Short-window spectrum has187.5Hz resolution.'};
}
function tenMsChanges(input){
  const values=[];for(let at=0;at+480<=input.length;at+=480)values.push(rms(input.subarray(at,at+480)));
  const changes=[];for(let i=1;i<values.length;i++)if(values[i]>0&&values[i-1]>0)changes.push(Math.abs(db(values[i]/values[i-1])));
  return {adjacentWindowRmsChangeDb:brief(changes),minimumWindowRms:Math.min(...values),maximumWindowRms:Math.max(...values),
    note:'Adjacent10ms windows are shorter than many source cycles; natural pulse phase can cause large RMS differences without a discontinuity.'};
}
function held(asset,u,Voice=StockGrainVoice,count=96000){
  const voice=new Voice(asset),output=new Float64Array(count),boundaries=[];
  for(let i=0;i<count;i++){const pending=voice.pendingBoundary;output[i]=voice.next(u);if(pending&&i>=128&&i+128<count)boundaries.push(i);}
  const step=[];for(let i=1;i<count;i++)step.push(Math.abs(output[i]-output[i-1]));
  assert.ok(output.every(Number.isFinite));assert.ok(peak(output)<=peak(asset.samples)+1e-12);
  assert.equal(voice.stats.sourceBoundViolations,0);
  const windows=boundaries.slice(0,10).map(at=>localMetrics(output.subarray(at-128,at+128)));
  return {voice,output,boundaries,summary:{frames:count,rms:rms(output),peak:peak(output),adjacentSteps:brief(step),
    tenMsRmsChanges:tenMsChanges(output),
    stateSwitches:voice.stats.stateSwitches??null,sourceBoundViolations:voice.stats.sourceBoundViolations,wrapCount:boundaries.length,
    maximumBoundaryStep:voice.maximumBoundaryStep,seamLocalWindows:windows,
    seamLocalMaximumAdjacentStep:windows.length?Math.max(...windows.map(w=>w.maximumAdjacentStep)):null,
    seamLocalMedianHigh6to20kPowerFraction:quantile(windows.map(w=>w.high6to20kPowerFraction),.5)}};
}
function periodReturn(x,period){
  const first=12000,count=12000;let best={correlation:-Infinity,lagFrames:null};
  for(let delta=-2;delta<=2;delta+=.5){const lag=period+delta;let xy=0,xx=0,yy=0;
    for(let i=first;i<first+count;i++){const a=x[i],b=sample(x,i+lag);xy+=a*b;xx+=a*a;yy+=b*b;}
    const correlation=xy/Math.sqrt(xx*yy);if(correlation>best.correlation)best={correlation,lagFrames:lag};
  }return {...best,expectedLagFrames:period,relativeLagError:(best.lagFrames-period)/period};
}
const heldRows=[],idleRows=[],sweepRows=[],transitionRows=[];
for(const model of models){
  const vehicle=loaded.vehicles.get(model);
  for(const role of ['engine','exhaust'])for(const state of ['accel','decel']){
    const asset=vehicle.layers[role][state],u=.7,pair=independentPair(asset,u),reference=rawProfile(asset,pair),now=held(asset,u);
    assert.equal(now.voice.stats.stateSwitches,0,'held source must not hop state');
    const measured=spectral(now.output.subarray(12000),pair.clock),raw=rawSeams(asset,pair);
    const nativeIncrement=asset.sampleRate/FS,nativeStart=Math.min(Math.floor(u*(asset.frames-1)),asset.frames-1-Math.ceil(96000*nativeIncrement));
    const native=Float64Array.from({length:96000},(_,i)=>sample(asset.samples,nativeStart+i*nativeIncrement));
    assert.ok(measured.dominantIntervalGridErrorHz<FS/65536,'held dominant peak preserves observed interval order grid');
    const row={model,role,state,nativeSampleRate:asset.sampleRate,heldSourcePosition:u,
      selectedIntervals:[pair.a,pair.b],blendWeight:pair.w,observedInterpolatedIntervalClockHz:pair.clock,
      originalContinuousNativeContextTenMsRmsChanges:tenMsChanges(native),
      rawSelectedIntervalProfile:reference,newOutput:{...now.summary,spectrum:measured,
        orderDistributionCosineToRaw:distributionCosine(reference.orderPowerFractions1to64,measured.orderPowerFractions1to64),
        expectedPeriodReturn:periodReturn(now.output,FS/pair.clock)},rawSeamComparators:raw};
    if(model==='schafter3'||model==='bati'){
      const old=held(asset,u,OldVoice);row.rejectedPlayer={...old.summary,spectrum:spectral(old.output.subarray(12000),pair.clock)};
    }
    heldRows.push(row);
    const sweep=new StockGrainVoice(asset);let previous=0,maxStep=0,maxWrappedPhaseError=0,lastPhase=null,lastRate=null,maxRateStep=0,maxRateStepAt=null;
    for(let i=0;i<96000;i++){
      const u=i<72000?.05+.9*i/72000:(i<84000?.05:.95),before=sweep.phase,value=sweep.next(u);
      if(i)maxStep=Math.max(maxStep,Math.abs(value-previous));previous=value;
      const p=independentPair(asset,sweep.state),rate=p.clock;
      if(lastRate!==null&&Math.abs(rate-lastRate)>maxRateStep){maxRateStep=Math.abs(rate-lastRate);maxRateStepAt=i/FS;}lastRate=rate;
      if(lastPhase!==null){const expected=(before+rate/FS)%1;maxWrappedPhaseError=Math.max(maxWrappedPhaseError,Math.abs(sweep.phase-expected));}lastPhase=sweep.phase;
      assert.ok(Number.isFinite(value)&&sweep.phase>=0&&sweep.phase<1);
    }
    assert.equal(sweep.stats.sourceBoundViolations,0);assert.ok(maxWrappedPhaseError<1e-10,'state movement must not reset interval phase');
    sweepRows.push({model,role,state,frames:96000,maximumStep:maxStep,maximumIntervalRateStepHz:maxRateStep,maximumRateStepAtSeconds:maxRateStepAt,
      maximumPhaseIntegrationResidual:maxWrappedPhaseError,sourceBoundViolations:sweep.stats.sourceBoundViolations,
      minimumSelectedInterval:sweep.stats.minimumSelectedInterval,maximumSelectedInterval:sweep.stats.maximumSelectedInterval,
      note:'1.5s slow .05→.95 source-position ramp followed by rapid low/high changes; not RPM or spatial Doppler.'});
  }
  for(const role of ['engine','exhaust']){
    const asset=vehicle.layers[role].idle,h=held(asset,.5,StockGrainVoice,120000),r=h.voice.intervals[0];
    assert.equal(h.voice.stats.stateSwitches,0);assert.ok(h.boundaries.length>=2);
    const pair={x:{startFrame:r.start,endFrame:r.end},y:{startFrame:r.start,endFrame:r.end}};
    idleRows.push({model,role,nativeSampleRate:asset.sampleRate,...h.summary,
      selectedLongLoopSeconds:r.length/asset.sampleRate,seamSeconds:r.seam/asset.sampleRate,
      naturalAndUntreatedJoin:rawSeams(asset,pair),
      limitation:'Audio-derived long waveform-matched loop; no verified native idle-loop semantics or perceptual approval.'});
  }
  const source=new StockVehicleSource(vehicle),engine=new Float32Array(128),exhaust=new Float32Array(128),outputSteps={engine:0,exhaust:0},previous={engine:0,exhaust:0};
  const rateObservers={},modeOverlap={maximumNontrivialModes:0,framesWithMultipleModesAbove1Percent:0,
    minimumWeightSum:Infinity,maximumWeightSum:0,minimumWeight:Infinity,maximumWeight:0,maximumPerSampleWeightChange:0};
  let priorWeights=null;
  for(const role of ['engine','exhaust'])for(const mode of ['idle','accel','decel']){
    const voice=source.voices[role][mode],observation={minimumIntervalRateHz:Infinity,maximumIntervalRateHz:0,
      maximumPerSampleRateChangeHz:0,atSeconds:null,rateBeforeHz:null,rateAfterHz:null,lastRate:null};
    rateObservers[role+'_'+mode]=observation;
    voice.next=function(u){
      const hadState=this.state!==null,phase=this.phase,turns=this.clockCycles;
      const value=StockGrainVoice.prototype.next.call(this,u);
      if(hadState){const rate=((this.clockCycles-turns)+this.phase-phase)*FS;
        observation.minimumIntervalRateHz=Math.min(observation.minimumIntervalRateHz,rate);observation.maximumIntervalRateHz=Math.max(observation.maximumIntervalRateHz,rate);
        if(observation.lastRate!==null&&Math.abs(rate-observation.lastRate)>observation.maximumPerSampleRateChangeHz){
          observation.maximumPerSampleRateChangeHz=Math.abs(rate-observation.lastRate);observation.atSeconds=source.frame/FS;
          observation.rateBeforeHz=observation.lastRate;observation.rateAfterHz=rate;
        }observation.lastRate=rate;
      }
      if(role==='engine'&&mode==='idle'){
        const weights=source.weights,sum=weights.reduce((s,v)=>s+v,0),count=weights.filter(w=>w>.01).length;
        modeOverlap.maximumNontrivialModes=Math.max(modeOverlap.maximumNontrivialModes,count);
        if(count>1)modeOverlap.framesWithMultipleModesAbove1Percent++;
        modeOverlap.minimumWeightSum=Math.min(modeOverlap.minimumWeightSum,sum);modeOverlap.maximumWeightSum=Math.max(modeOverlap.maximumWeightSum,sum);
        for(let j=0;j<3;j++){modeOverlap.minimumWeight=Math.min(modeOverlap.minimumWeight,weights[j]);modeOverlap.maximumWeight=Math.max(modeOverlap.maximumWeight,weights[j]);
          if(priorWeights)modeOverlap.maximumPerSampleWeightChange=Math.max(modeOverlap.maximumPerSampleWeightChange,Math.abs(weights[j]-priorWeights[j]));}
        priorWeights=[...weights];
      }return value;
    };
  }
  const tenMs={engine:[],exhaust:[]},windowEnergy={engine:0,exhaust:0},windowCount={engine:0,exhaust:0};
  for(let at=0;at<144000;at+=128){const t=at/FS,control=t<1?{operatingPoint:.15+.75*t,load:.9,running:true,lift:false}:
      t<1.7?{operatingPoint:.85,load:.05,running:true,lift:true}:t<2.2?{operatingPoint:.2,load:.8,running:true,lift:false}:{operatingPoint:.2,load:0,running:false,lift:true};
    source.renderInto(control,engine,exhaust,128);
    for(const [role,array] of [['engine',engine],['exhaust',exhaust]])for(const x of array){assert.ok(Number.isFinite(x)&&Math.abs(x)<=1);outputSteps[role]=Math.max(outputSteps[role],Math.abs(x-previous[role]));previous[role]=x;
      windowEnergy[role]+=x*x;windowCount[role]++;if(windowCount[role]===480){tenMs[role].push(Math.sqrt(windowEnergy[role]/480));windowCount[role]=0;windowEnergy[role]=0;}}
  }
  const voices=Object.values(source.voices).flatMap(v=>Object.values(v));assert.ok(voices.every(v=>v.stats.sourceBoundViolations===0));
  const rmsChanges={};for(const role of ['engine','exhaust']){
    const values=tenMs[role],linear=[],decibels=[],activeDb=[];let maximumActive={changeDb:0,atSeconds:null};
    for(let i=1;i<values.length;i++){linear.push(Math.abs(values[i]-values[i-1]));const change=Math.abs(db(values[i]/values[i-1]));decibels.push(change);
      const time=i*.01;if(time>=.25&&time<2.2){activeDb.push(change);if(change>maximumActive.changeDb)maximumActive={changeDb:change,atSeconds:time};}}
    rmsChanges[role]={maximumAbsoluteRmsChange:Math.max(...linear),adjacent10msRmsChangeDb:brief(decibels),
      activeExcludingRunStartAndStopDb:brief(activeDb),maximumActiveChange:maximumActive,
      eventWindows:Object.fromEntries([['lift',1],['returnToAccel',1.7],['runStop',2.2]].map(([name,time])=>[name,values.slice(Math.round(time*100)-2,Math.round(time*100)+8).map((value,j)=>({startSeconds:time-.02+j*.01,rms:value,rmsDbfs:db(value)}))]))};
  }
  for(const observer of Object.values(rateObservers))delete observer.lastRate;
  transitionRows.push({model,frames:144000,maximumAdjacentSteps:outputSteps,allSixVoicesZeroOverreads:true,
    observedPerVoiceClock:rateObservers,observedModeWeightOverlap:modeOverlap,tenMsRmsChanges:rmsChanges,
    actualToConvexReferenceEnergy:Object.fromEntries(['engine','exhaust'].map(role=>[role,source.stats.energy[role].actual/source.stats.energy[role].reference])),
    stoppedEnvelopeAtEnd:source.envelope,modeledRpm:source.stats.modeledRpm,oscillatorSamples:source.stats.oscillatorSamples,
    finalWeightSum:source.weights.reduce((s,v)=>s+v,0),note:'Acceleration, explicit lift/decel, return to accel and run-stop ramp. Source only; no spatial effects or normalization.'});
}
for(const [samples,hash] of rawHashes)assert.equal(sha(samples),hash,'verified PCM memory modified');
for(const [label,file] of Object.entries(moduleFiles))assert.equal(sha(fs.readFileSync(file)),moduleBindings[label],'reviewed core changed during verification');
const report={schemaVersion:1,milestone:'STOCK-SOURCE-02',scope:'Short source-only genuine-asset verification; no archive extraction, spatial render, endpoint or listening',
  moduleSha256Bindings:moduleBindings,
  methods:{sourceBindings:'Existing24-layer manifest SHA/sample/rate verification; PCM memory hashes repeated after all diagnostics.',
    held:'16moving voices held at normalized source position.7 for2s; Schafter/Bati also compared with unchanged rejected player. Eight idle voices run2.5s.',
    spectra:'65536-frame Hann spectrum of48kHz output after250ms; resolution.732421875Hz. Report dominant frequency and nearest interval-clock order, not crank RPM. Harmonic distribution uses integrated ±2FFT-bin energy at orders1–64 versus independent raw interval Fourier profile.',
    seams:'256-frame windows centered on actual phase wraps; compare original native-rate boundary context and untreated original-PCM self-loop joins. Local spectral resolution187.5Hz. These descriptors are not click/listening verdicts.',
    transitions:'16separate2s slow/rapid source-position sweeps and four3s six-layer accel/lift/decel/run-stop transitions. No benchmark matrix or acoustic solver.'},
  gates:{allFiniteAndConvexPeak:true,all24SourceMemoriesUnchanged:true,allHeldMovingStateSwitchCountsZero:true,
    allSourceOverreadsZero:true,allHeldDominantPeaksOnIntervalOrderGrid:true,allSweepPhaseResidualsBelow1e_10:true},
  limitations:['Unknown native grain/RPM/gain semantics remain unrecovered; interval order is not crankshaft RPM.',
    'A stable repeating clock is necessary but does not certify vehicle recognition, natural mechanical texture or perceptual success.',
    'Pre-start context selection uses a one-sample join comparison; resulting local spectrum and original waveform may differ.',
    'Idle matches a short context and loops a long recording excerpt; it is an explicit approximation.',
    'Raw-reference harmonic comparison measures coloration rather than assuming context smoothing is acoustically neutral.',
    'Phase-based morphing retimes neighboring intervals to the common interpolated interval period. Native PCM samples are unchanged; exact original temporal texture is not universally preserved.'],
  heldMoving:heldRows,idle:idleRows,stateSweeps:sweepRows,operatingTransitions:transitionRows};
fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({heldMoving:heldRows.length,idle:idleRows.length,stateSweeps:sweepRows.length,operatingTransitions:transitionRows.length,
  unchangedPcmMemories:rawHashes.size,maximumNewGridErrorHz:Math.max(...heldRows.map(r=>r.newOutput.spectrum.dominantIntervalGridErrorHz)),
  minimumRawOrderDistributionCosine:Math.min(...heldRows.map(r=>r.newOutput.orderDistributionCosineToRaw)),gates:report.gates}));
