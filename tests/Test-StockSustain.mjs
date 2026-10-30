import {test} from 'node:test';import assert from 'node:assert/strict';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
import {StockExhaustEvents} from '../src/acoustics/vehicle/stock-events.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
const FS=48000;
const cv=a=>{const mean=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/a.length)/mean;};
function variation(rate=48000){const period=rate/100,n=rate,samples=new Float32Array(n);
  for(let i=0;i<100;i++)for(let j=0;j<period;j++){const p=2*Math.PI*j/period;samples[i*period+j]=(.26+.05*Math.sin(i*Math.SQRT2))*Math.sin(p)+(.04+.01*Math.cos(i*Math.sqrt(3)))*Math.sin(2*p);}
  return {samples,frames:n,sampleRate:rate,intervals:Array.from({length:100},(_,i)=>({startFrame:i*period,endFrame:(i+1)*period}))};}
for(const rate of [24000,32000,48000])test(`ten-second genuine analytical cycle variation retains pitch at native ${rate}`,()=>{
  const asset=variation(rate),voice=new StockGrainVoice(asset),frozen=new StockGrainVoice(asset,{texture:false});
  const out=new Float32Array(10*FS),old=new Float32Array(out.length),rms=[],oldRms=[],cross=[];let last=0;
  for(let i=0;i<out.length;i++){const x=voice.next(.5);out[i]=x;old[i]=frozen.next(.5);if(i>FS&&last<=0&&x>0)cross.push(i-1-last/(x-last));last=x;}
  for(let at=FS;at<out.length;at+=480){let e=0,o=0;for(let i=at;i<at+480;i++){e+=out[i]**2;o+=old[i]**2;}rms.push(Math.sqrt(e/480));oldRms.push(Math.sqrt(o/480));}
  assert.ok(cv(rms)>.025&&cv(rms)<.2,'recorded cycle energy evolves without unstable added dynamics');assert.ok(cv(oldRms)<1e-5,'control demonstrates frozen pair');
  // Varying cycle slopes bias a sampled linear zero estimator very slightly;
  // .1 output sample is2.1us. The accumulated clock itself stays exact below.
  assert.ok(cross.every((x,i)=>!i||Math.abs(x-cross[i-1]-480)<.1),'sub-sample zero-crossing estimate stays on the fixed100Hz clock');
  assert.equal(voice.clockCycles,1000);assert.equal(voice.stats.minimumIntervalRateHz,100);assert.equal(voice.stats.maximumIntervalRateHz,100);
  assert.ok(voice.stats.texture.uniqueIntervals>=12);assert.ok(voice.stats.texture.phrasesStarted>20);
  assert.ok(voice.stats.texture.maximumMaterialRateDifference<1e-10);assert.equal(voice.stats.sourceBoundViolations,0);
});
test('risk-marked source transients and their preceding-context reads are excluded from sustain',()=>{
  const asset=variation(),features=asset.intervals.map((r,index)=>({index,...r,rms:.2,transientRisk:index===50,bandFractions:{low:1,mid:0,high:0}}));
  asset.samples[50*480+100]=.9;asset.sustain={intervals:features};const voice=new StockGrainVoice(asset);let peak=0;
  for(let i=0;i<FS*3;i++)peak=Math.max(peak,Math.abs(voice.next(.5)));
  assert.equal(voice.textureOccupancy[50],0);assert.equal(voice.stats.texture.transientRiskReads,0);assert.ok(peak<.36);
  voice.textureMix=0;
  for(let i=0;i<512;i++){assert.ok(Math.abs(voice.next(.5))<.36);if(voice.fallbackPair)assert.ok(voice.fallbackPair.a!==50&&voice.fallbackPair.b!==50);}
});
test('finite native one-shots preserve nonround rates, fire only once and obey source headroom',()=>{
  const variants=[32005,32001,32002,32001].map(sampleRate=>({samples:Float32Array.from({length:4000},(_,i)=>.7*Math.sin(2*Math.PI*1000*i/sampleRate)),frames:4000,sampleRate,nativePeak:.7}));
  const assets={model:'prototipo',variants},event=new StockExhaustEvents({assets,triggers:[{atFrame:1000,variant:0,basis:'authored-offline-lift'}],bedPeakBound:.8,roleGainBound:1.1});
  const out=Float32Array.from({length:20000},(_,i)=>event.next(i)),end=1000+Math.ceil(4000*FS/32005);
  assert.ok(out.subarray(0,1000).every(x=>x===0));assert.ok(out.subarray(end).every(x=>x===0));assert.ok(out[1000]===0&&out[end-1]===0);
  assert.equal(event.stats.triggered,1);assert.equal(event.stats.completed,1);assert.equal(event.stats.activeFrames,end-1000);assert.ok(event.stats.maximumCombinedInputBound<=.98+1e-12);
  assert.throws(()=>new StockExhaustEvents({assets,triggers:[{atFrame:0,variant:0,basis:'RPM changed'}],bedPeakBound:.8,roleGainBound:1}));
});
test('authored state shares use native-PCM bounds and smooth convex mode weights',()=>{
  const asset={samples:new Float32Array(8192).fill(.5),frames:8192,sampleRate:24000},vehicle={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(r=>[r,Object.fromEntries(['idle','accel','decel'].map(m=>[m,asset]))]))};
  const source=new StockVehicleSource(vehicle,{sourceGain:1.5956559507,pressureSharesByState:{idle:{engine:.55,exhaust:.45},load:{engine:.34,exhaust:.66},lift:{engine:.55,exhaust:.45}}});
  const e=new Float32Array(512),x=new Float32Array(512);let previous=null,step=0;
  for(let at=0;at<FS*2;at+=512){source.renderInto({operatingPoint:at<FS?.1:.95,load:.95,running:true,lift:false},e,x);
    for(const v of x){if(previous!==null&&at>=FS)step=Math.max(step,Math.abs(v-previous));previous=v;}}
  assert.ok(step<.001);assert.ok(Math.abs(x.at(-1)-.5*.66*source.gain)<1e-6);assert.ok(source.inputBounds.exhaust<.98);
});
