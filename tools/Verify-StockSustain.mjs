// Genuine sustain diagnostics only: no spatial rendering, endpoint, listening,
// source normalization or writes to prior assets/auditions.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadStockAssets,StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),FS=48000;
const manifest=path.resolve(process.argv[2]??path.join(root,'../RichAudio-StockSource01/.local/stock-source-01/assets-native/manifest.json'));
const atlasFile=path.resolve(process.argv[3]??path.join(root,'.local/stock-source-03/sustain-assets/atlas.json'));
const destination=path.resolve(process.argv[4]??path.join(root,'evidence/stock-source-03-sustain-verification.json'));
assert.ok(destination.startsWith(root+path.sep),'new checkout output only');
const {StockGrainVoice:OldVoice}=await import(pathToFileURL(path.join(root,'../RichAudio-StockSource02/src/acoustics/vehicle/stock-grain.mjs')));
const loaded=loadStockAssets(manifest,{sustainAtlasFile:atlasFile});
const hash=x=>createHash('sha256').update(x).digest('hex');
const bytes=x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength);
const moduleFiles={grain:path.join(root,'src/acoustics/vehicle/stock-grain.mjs'),source:path.join(root,'src/acoustics/vehicle/stock-source.mjs')};
const moduleHashes=Object.fromEntries(Object.entries(moduleFiles).map(([k,p])=>[k,hash(fs.readFileSync(p))]));
const sourceHashes=new Map();for(const v of loaded.vehicles.values())for(const r of ['engine','exhaust'])for(const m of ['idle','accel','decel']){const a=v.layers[r][m];sourceHashes.set(a.samples,hash(bytes(a.samples)));}
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length),max=x=>x.reduce((s,v)=>Math.max(s,v),-Infinity);
const db=x=>x>0?20*Math.log10(x):null;
function describe(a){if(!a.length)return null;const x=[...a].sort((a,b)=>a-b);return {minimum:x[0],median:x[Math.floor(x.length*.5)],p95:x[Math.floor(x.length*.95)],maximum:x.at(-1)};}
function read(x,p){assert.ok(p>=0&&p<x.length);const k=Math.floor(p),f=p-k;return x[k]*(1-f)+x[Math.min(k+1,x.length-1)]*f;}
function correlation(x,y){let sx=0,sy=0,xy=0,xx=0,yy=0;for(let i=0;i<x.length;i++){sx+=x[i];sy+=y[i];xy+=x[i]*y[i];xx+=x[i]*x[i];yy+=y[i]*y[i];}const n=x.length;return (xy-sx*sy/n)/Math.sqrt(Math.max(1e-30,(xx-sx*sx/n)*(yy-sy*sy/n)));}
function acf(x,lag,start=0,count=14400){const n=Math.min(count,x.length-start-Math.ceil(lag)-1);assert.ok(n>10);const a=x.subarray(start,start+n),b=Float64Array.from({length:n},(_,i)=>read(x,start+i+lag));return correlation(a,b);}
function fft(input,n,hann=true){
 const re=Float64Array.from(input.subarray(0,n),(v,i)=>v*(hann?.5-.5*Math.cos(2*Math.PI*i/(n-1)):1)),im=new Float64Array(n);
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let width=2;width<=n;width*=2){const angle=-2*Math.PI/width,cr=Math.cos(angle),ci=Math.sin(angle);for(let at=0;at<n;at+=width){let c=1,s=0;for(let j=0;j<width/2;j++){const k=at+j,l=k+width/2,r=re[l]*c-im[l]*s,q=re[l]*s+im[l]*c;re[l]=re[k]-r;im[l]=im[k]-q;re[k]+=r;im[k]+=q;const next=c*cr-s*ci;s=c*ci+s*cr;c=next;}}}
 return Float64Array.from(re.subarray(0,n/2),(v,i)=>v*v+im[i]*im[i]);
}
function spectral(x,clock){const n=65536,p=fft(x,n),resolution=FS/n;let peak=1;for(let i=Math.ceil(20/resolution);i<Math.floor(8000/resolution);i++)if(p[i]>p[peak])peak=i;
 const orders=Array.from({length:64},(_,i)=>{const lo=Math.max(1,Math.ceil(((i+1)-.3)*clock/resolution)),hi=Math.min(p.length-1,Math.floor(((i+1)+.3)*clock/resolution));let e=0;for(let k=lo;k<=hi;k++)e+=p[k];return e;});const total=orders.reduce((s,v)=>s+v,0);
 return {resolutionHz:resolution,dominantHz:peak*resolution,dominantNearestIntervalOrder:Math.round(peak*resolution/clock),orderPowerFractions1to64:orders.map(v=>v/total)};
}
function local(x){const p=fft(x,256),steps=Array.from(x.subarray(1),(v,i)=>Math.abs(v-x[i]));let e=0,h=0;for(let k=1;k<p.length;k++){e+=p[k];if(k*FS/256>=6000&&k*FS/256<20000)h+=p[k];}return {rms:rms(x),maximumStep:max(steps),stepRms:rms(steps),high6to20kFraction:h/Math.max(1e-30,e)};}
function tenMs(x){const levels=[];for(let at=0;at+480<=x.length;at+=480)levels.push(rms(x.subarray(at,at+480)));const change=[];for(let i=1;i<levels.length;i++)if(levels[i]>0&&levels[i-1]>0)change.push(Math.abs(db(levels[i]/levels[i-1])));return {rms:describe(levels),adjacentRmsChangeDb:describe(change)};}
function cycleVariation(vectors,sourceIndices=null){const correlations=[],innovation=[],levels=vectors.map(rms);for(let i=1;i<vectors.length;i++){if(sourceIndices&&sourceIndices[i]!==sourceIndices[i-1]+1)continue;correlations.push(correlation(vectors[i-1],vectors[i]));let e=0;for(let j=0;j<vectors[i].length;j++)e+=(vectors[i][j]-vectors[i-1][j])**2;innovation.push(Math.sqrt(e/vectors[i].length)/Math.sqrt((levels[i]**2+levels[i-1]**2)/2));}const mean=levels.reduce((s,v)=>s+v,0)/Math.max(1,levels.length);return {cycles:vectors.length,adjacentWaveformCorrelation:describe(correlations),normalizedAdjacentInnovationRms:describe(innovation),rmsCoefficientOfVariation:Math.sqrt(levels.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,levels.length))/Math.max(1e-30,mean)};}
function outputCycles(x,phase0,period){const first=(1-phase0)*period,cycles=[];for(let at=first+period;at+period<x.length-1;at+=period)cycles.push(Float64Array.from({length:512},(_,i)=>read(x,at+i*period/512)));return cycleVariation(cycles);}
function rawCycles(asset,indices){const vectors=[];for(const i of indices){const r=asset.intervals[i];vectors.push(Float64Array.from({length:512},(_,j)=>read(asset.samples,r.startFrame+j*(r.endFrame-r.startFrame)/512)));}return cycleVariation(vectors,indices);}
function rawSeams(asset,indices){const natural=[],untreated=[],step=asset.sampleRate/FS;
 for(const index of indices.slice(0,24)){const r=asset.intervals[index];if(r.startFrame-128*step<0||r.endFrame+128*step>=asset.frames)continue;
  natural.push(local(Float64Array.from({length:256},(_,i)=>read(asset.samples,r.endFrame+(i-128)*step))));
  untreated.push(local(Float64Array.from({length:256},(_,i)=>read(asset.samples,i<128?r.endFrame+(i-128)*step:r.startFrame+(i-128)*step))));
 }return {naturalOriginalBoundary:natural,untreatedSelfLoop:untreated,note:'Matched visited genuine spans; native-rate read conversion only, no seam treatment or normalization.'};
}
function sequenceRepetition(sequence){let best={fraction:0,lagCycles:null};for(let lag=1;lag<=Math.min(128,Math.floor(sequence.length/2));lag++){let same=0;for(let i=lag;i<sequence.length;i++)if(sequence[i]===sequence[i-lag])same++;const fraction=same/(sequence.length-lag);if(fraction>best.fraction)best={fraction,lagCycles:lag};}return {...best,search:'source-index equality at lags1–128cycles, at least half-sequence overlap; not an audio ACF threshold'};}
function held(asset,u,seconds,Voice){
 const voice=new Voice(asset),out=new Float32Array(Math.round(seconds*FS)),wraps=[],sequence=[],used=new Set();
 let phase0=null,minRate=Infinity,maxRate=0,maxRateStep=0,lastRate=null,maxStep=0,previous=0,riskReads=0;
 const risks=asset.sustain?.intervals.filter(f=>f.transientRisk)??[];
 if(risks.length){const original=voice.read;voice.read=function(position){for(const r of risks)if(position>=r.startFrame&&position<r.endFrame)riskReads++;return original.call(this,position);};}
 for(let i=0;i<out.length;i++){
  const phase=voice.phase,turns=voice.clockCycles,pending=voice.pendingBoundary;
  const value=voice.next(u);out[i]=value;assert.ok(Number.isFinite(value)&&Math.abs(value)<=asset.nativePeak+1e-12);
  if(i){const rate=((voice.clockCycles-turns)+voice.phase-phase)*FS;minRate=Math.min(minRate,rate);maxRate=Math.max(maxRate,rate);if(lastRate!==null)maxRateStep=Math.max(maxRateStep,Math.abs(rate-lastRate));lastRate=rate;maxStep=Math.max(maxStep,Math.abs(value-previous));}
  else{const p=voice.pair(u),period=((1-p.w)*voice.intervals[p.a].length+p.w*voice.intervals[p.b].length)/asset.sampleRate;phase0=((voice.phase-1/(period*FS))%1+1)%1;}
  previous=value;
  if(voice.textureCurrent!==undefined){used.add(voice.textureCurrent);used.add(voice.textureUpcoming);if(i===0||pending)sequence.push(voice.textureCurrent);}
  if(pending&&i>=128&&i+128<out.length)wraps.push(i);
 }
 assert.equal(voice.stats.sourceBoundViolations,0);
 const p=voice.pair(u),nativePeriod=(1-p.w)*voice.intervals[p.a].length+p.w*voice.intervals[p.b].length,period=FS*nativePeriod/asset.sampleRate;
 const sampleStart=Math.round((seconds>=8?8:1)*FS),seams=wraps.filter(i=>i>=sampleStart).slice(0,12).map(i=>local(out.subarray(i-128,i+128)));
 const summary={durationSeconds:seconds,rms:rms(out),peak:max(out.map(Math.abs)),maximumStep:maxStep,
  intervalClockHz:asset.sampleRate/nativePeriod,observedClockMinimumHz:minRate,observedClockMaximumHz:maxRate,maximumClockRateStepHz:maxRateStep,
  oneRequestedIntervalAcf:acf(out,period,sampleStart),cycleVariation:outputCycles(out,phase0,period),
  heldControlPairChanges:voice.stats.stateSwitches,seamLocalWindows:seams,tenMsEnvelope:tenMs(out),
  sourceBoundViolations:voice.stats.sourceBoundViolations,independentlyObservedRiskReads:riskReads,
  spectrum:spectral(out.subarray(Math.round(FS*.5)),asset.sampleRate/nativePeriod)};
 if(voice.stats.texture){summary.texture={...voice.stats.texture};summary.actualMaterialSequence=sequence;
  summary.materialSequenceRepetition=sequenceRepetition(sequence);summary.independentUniqueIntervals=used.size;
  summary.actualMaterialDurationSeconds=[...used].reduce((s,i)=>s+(voice.intervals[i].end-voice.intervals[i].start)/asset.sampleRate,0);
  summary.actualSelectedSourceIndices=[...used].sort((a,b)=>a-b);
  summary.rawSeamComparators=rawSeams(asset,summary.actualSelectedSourceIndices);
  if(voice.texturePlan){const indices=voice.texturePlan.allowed?[...voice.texturePlan.allowed].sort((a,b)=>a-b):Array.from({length:voice.texturePlan.hi-voice.texturePlan.lo+1},(_,i)=>voice.texturePlan.lo+i);summary.rawCompatiblePool={firstIndex:voice.texturePlan.lo,lastIndex:voice.texturePlan.hi,
    cycleCount:indices.length,contiguousRuns:voice.texturePlan.runs??[[voice.texturePlan.lo,voice.texturePlan.hi]],variation:rawCycles(asset,indices)};}
 }
 return {summary,out};
}
const moving=[],idle=[],transitions=[];
for(const model of ['schafter3','bati','lectro','prototipo']){
 const vehicle=loaded.vehicles.get(model);
 for(const role of ['engine','exhaust'])for(const state of ['accel','decel'])for(const [label,u] of [['low',.1],['middle',.55],['high',.95]]){
  const asset=vehicle.layers[role][state],seconds=label==='high'?10:3,position=state==='decel'?1-u:u;
  const now=held(asset,position,seconds,StockGrainVoice),old=held(asset,position,seconds,OldVoice);
  assert.equal(now.summary.heldControlPairChanges,0);assert.ok(now.summary.observedClockMaximumHz-now.summary.observedClockMinimumHz<1e-8,'held clock cannot follow shuffled material');
  assert.equal(now.summary.independentlyObservedRiskReads,0);assert.equal(now.summary.texture.transientRiskReads,0);
  moving.push({model,role,state,operatingRegion:label,operatingPoint:u,sourcePosition:position,nativeRate:asset.sampleRate,new:now.summary,oldFixedPair:old.summary,
   note:'Source-only held state; old/new use identical native PCM and requested operating point, without spatial processing or level matching.'});
 }
 for(const role of ['engine','exhaust']){const a=vehicle.layers[role].idle,n=held(a,.5,3,StockGrainVoice);idle.push({model,role,nativeRate:a.sampleRate,...n.summary,limitation:'Idle retains the validated long original-excerpt loop approximation; no new recorded idle material is created.'});}
 const source=new StockVehicleSource(vehicle,{sourceGain:1,pressureSharesByState:{idle:{engine:.5,exhaust:.5},load:{engine:.4,exhaust:.6},lift:{engine:.35,exhaust:.65}}});
 const observer={maximumClockStepHz:0,maximumPhaseResidual:0,maximumMaterialPeriodMismatch:0,independentRiskReads:0,
  audibleMaterial:{maximumPeriodMismatch:0,observedVoiceFrames:0,framesAbove5Percent:0,framesAbove25Percent:0,maximumContinuousAbove5PercentSeconds:0,maximumCase:null},
  audibleMaterial10Percent:{maximumPeriodMismatch:0,observedVoiceFrames:0,framesAbove5Percent:0,framesAbove25Percent:0,maximumContinuousAbove5PercentSeconds:0,maximumCase:null}};
 for(const role of ['engine','exhaust'])for(const state of ['idle','accel','decel']){
  const voice=source.voices[role][state],risks=vehicle.layers[role][state].sustain?.intervals.filter(f=>f.transientRisk)??[],original=voice.read;let lastRate=null;
  voice.read=function(position){for(const r of risks)if(position>=r.startFrame&&position<r.endFrame)observer.independentRiskReads++;return original.call(this,position);};
  const next=voice.next;const mismatchStreak={};voice.next=function(u){const phase=this.phase,turns=this.clockCycles,started=this.state!==null;const value=next.call(this,u);if(started){const rate=((this.clockCycles-turns)+this.phase-phase)*FS;if(lastRate!==null)observer.maximumClockStepHz=Math.max(observer.maximumClockStepHz,Math.abs(rate-lastRate));lastRate=rate;const p=this.pair(this.state),target=(1-p.w)*this.intervals[p.a].length+p.w*this.intervals[p.b].length,expected=(phase+this.asset.sampleRate/target/FS)%1;observer.maximumPhaseResidual=Math.max(observer.maximumPhaseResidual,Math.abs(expected-this.phase));
    const modeWeight=source.weights[['idle','accel','decel'].indexOf(state)];
    for(const [threshold,key]of [[.01,'audibleMaterial'],[.1,'audibleMaterial10Percent']])if(this.textureCurrent!==undefined&&modeWeight>threshold&&source.envelope>.01){const w=phase*phase*(3-2*phase),ids=[];if(1-w>threshold)ids.push(this.textureCurrent);if(w>threshold)ids.push(this.textureUpcoming);
      const difference=Math.max(...ids.map(i=>Math.abs(this.intervals[i].length/target-1))),o=observer[key];o.observedVoiceFrames++;
      if(difference>o.maximumPeriodMismatch){o.maximumPeriodMismatch=difference;o.maximumCase={role,state,timeSeconds:source.frame/FS,modeWeight,targetPeriodFrames:target,sourceIndices:ids,materialWeights:ids.map(i=>i===this.textureCurrent?1-w:w)};}
      if(difference>.05){o.framesAbove5Percent++;mismatchStreak[key]=(mismatchStreak[key]??0)+1;o.maximumContinuousAbove5PercentSeconds=Math.max(o.maximumContinuousAbove5PercentSeconds,mismatchStreak[key]/FS);}else mismatchStreak[key]=0;
      if(difference>.25)o.framesAbove25Percent++;
    }else mismatchStreak[key]=0;
   }return value;};
 }
 const engine=new Float32Array(128),exhaust=new Float32Array(128),outputs={engine:new Float32Array(FS*4),exhaust:new Float32Array(FS*4)};
 for(let at=0;at<FS*4;at+=128){const t=at/FS,c=t<1?{operatingPoint:.1+.8*t,load:.9,running:true,lift:false}:t<2?{operatingPoint:.95,load:.9,running:true,lift:false}:t<2.7?{operatingPoint:.75,load:.05,running:true,lift:true}:t<3.3?{operatingPoint:.2,load:.85,running:true,lift:false}:{operatingPoint:.2,load:0,running:false,lift:true};source.renderInto(c,engine,exhaust,128);outputs.engine.set(engine,at);outputs.exhaust.set(exhaust,at);}
 const voices=Object.values(source.voices).flatMap(Object.values);for(const v of voices){assert.equal(v.stats.sourceBoundViolations,0);assert.equal(v.stats.texture.transientRiskReads,0);observer.maximumMaterialPeriodMismatch=Math.max(observer.maximumMaterialPeriodMismatch,v.stats.texture.maximumMaterialRateDifference);}
 assert.equal(observer.independentRiskReads,0);assert.ok(observer.maximumPhaseResidual<1e-10);
 transitions.push({model,...observer,engineEnvelope:tenMs(outputs.engine),exhaustEnvelope:tenMs(outputs.exhaust),sourcePeak:source.stats.peak,sourceMaximumStep:source.stats.maximumStep,
  allVoicesZeroOverreads:true,pressureSharesByState:source.pressureSharesByState,
  note:'Explicit diagnostic convex shares, not the final per-vehicle audition calibration. Slow rise, high hold, lift, rapid low return and run-stop. Compatibility departures during finite transition blending are reported, not hidden.'});
}
for(const [pcm,digest]of sourceHashes)assert.equal(hash(bytes(pcm)),digest,'original PCM memory mutated');
for(const [key,file]of Object.entries(moduleFiles))assert.equal(hash(fs.readFileSync(file)),moduleHashes[key],'core changed during verification');
const report={schema:1,milestone:'STOCK-SOURCE-03',moduleSha256:moduleHashes,
 methods:{holds:'All16movingstreams atoperatingPoint.1/.55/.95,3/3/10s;decelmaps1-u. Eightidle3sholds. SamePCM Source02fixed-pair baseline.',
  clock:'Actual per-sample phase/turn delta observed independently of texture bag; phase integration checked against requested-state period.',
  variation:'512point phase-normalized linear PCM waveform correlation, normalized adjacent-cycle RMS innovation, cycle RMS variation. Matched genuine raw pool statistics use all original adjacent cycles, never added noise.',
  acf:'Mean-removed correlation at one exact requested-interval lag over300ms, at8s forhighholds/1s others. No universal engine-ACF acceptance threshold.',
  spectra:'65536point Hann FFT(.7324Hzresolution); order distributions integrate±.3ofintervalclock aroundorders1–64, retaining modulation sidebands. No inferred crank RPM.',
  seams:'256sample phase-wrap windows(~5.33ms), maximum sample step, derivative RMS and6–20kHz spectral fraction; not listening or click certification.'},
 gates:{originalPcmMemoriesUnchanged:sourceHashes.size,allHeldClocksStable:true,allPhaseContinuous:true,allFiniteAndBounded:true,allOverreadsZero:true,allObservedRiskReadsZero:true},
 limitations:['Finite pools, phrase rearrangement and within-cycle morphing are authored approximations, not recovered native granular playback or new recorded sustain.',
  'Sparse low-state pools may remain nearly periodic; authentic Bati exhaust is strongly periodic. No artificial variation is added to force an ACF score.',
  'Waveform/cycle correlation depends on phase normalization and native interpolation; spectral and innovation descriptors do not establish recognizability or perceptual success.',
  'During changing operating state a phase-continuous outgoing texture cycle can temporarily differ by more than5percent from the moving target; transition measurements report this explicitly.',
  'The narrow transient-risk screen cannot prove absence of every embedded event; native event/ECU conditions remain unknown.',
  'No endpoint, listening, spatial render, normalization or prior-audition write occurred.'],moving,idle,transitions};
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({movingHolds:moving.length,highHolds:moving.filter(r=>r.operatingRegion==='high').length,idle:idle.length,transitions:transitions.length,
 highUniqueRange:describe(moving.filter(r=>r.operatingRegion==='high').map(r=>r.new.independentUniqueIntervals)),
 maximumHeldClockSpread:Math.max(...moving.map(r=>r.new.observedClockMaximumHz-r.new.observedClockMinimumHz)),gates:report.gates}));
