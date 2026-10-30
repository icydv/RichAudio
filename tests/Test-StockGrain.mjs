import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StockGrainVoice,NativePcmVoice} from '../src/acoustics/vehicle/stock-grain.mjs';

const asset=(samples,rate=48000)=>({samples,frames:samples.length,sampleRate:rate});
test('unmodified finite native reference has exact rate/interpolation and no source scheduling',()=>{
  for(const rate of [24000,32000,48000]){
    const a=asset(Float32Array.from({length:1000},(_,i)=>i/2000),rate),v=new NativePcmVoice(a);
    const first=v.next(),start=0;
    assert.equal(first,a.samples[start]);
    for(let i=1;i<80;i++){
      const p=start+i*rate/48000,k=Math.floor(p),f=p-k;
      assert.ok(Math.abs(v.next()-(a.samples[k]*(1-f)+a.samples[k+1]*f))<1e-12);
    }
  }
});
test('adaptive short and long intervals retain high-state coverage and strict read boundaries',()=>{
  const lengths=[820,1800,7340,864,1200],n=lengths.reduce((a,b)=>a+b,0),samples=new Float32Array(n);
  let offset=0;const regions=lengths.map((length,i)=>{samples.fill((i+1)/10,offset,offset+length);const r={startFrame:offset,endFrame:offset+length};offset+=length;return r;});
  const low=new StockGrainVoice(asset(samples),{regions}),high=new StockGrainVoice(asset(samples),{regions});
  for(let i=0;i<48000;i++){assert.ok(low.next(0)<=.1+1e-8);assert.ok(Math.abs(high.next(1)-.5)<1e-8);}
  assert.equal(low.stats.maximumSelectedInterval,0);assert.equal(high.stats.minimumSelectedInterval,4);
  assert.equal(high.stats.sourceBoundViolations,0);assert.ok(high.stats.minimumReadFrame>=regions[4].startFrame);
  assert.ok(high.stats.maximumReadFrame<regions[4].endFrame);assert.ok(high.stats.crossfades>30);
});
test('complementary transitions are convex, smooth at boundaries and never normalize source amplitude',()=>{
  const samples=new Float32Array(6000);samples.fill(.75,0,1600);samples.fill(-.75,1600,2400);samples.fill(.3,2400);
  const regions=[{startFrame:0,endFrame:1600},{startFrame:1600,endFrame:2400},{startFrame:2400,endFrame:6000}];
  const v=new StockGrainVoice(asset(samples),{regions});let previous=v.next(0),maxStep=0;
  for(let i=0;i<48000;i++){const value=v.next(i<24000?1:0);assert.ok(Math.abs(value)<=.75+1e-12);maxStep=Math.max(maxStep,Math.abs(value-previous));previous=value;}
  assert.ok(maxStep<.02);assert.ok(v.maximumBoundaryStep<.02);assert.ok(v.expectedEnergy>0&&v.outputEnergy>0);
  assert.ok(v.outputEnergy<=v.expectedEnergy+1e-7,'convex blend cannot hide cancellation by adding gain');
  assert.equal(v.stats.maximumConcurrentHeads,2);assert.equal(v.stats.sourceBoundViolations,0);
});
test('held state keeps deterministic interval phase without neighbour hopping or start jitter',()=>{
  const samples=Float32Array.from({length:12000},(_,i)=>.2*Math.sin(i*.07));
  const regions=Array.from({length:12},(_,i)=>({startFrame:i*1000,endFrame:(i+1)*1000}));
  const a=new StockGrainVoice(asset(samples),{regions}),b=new StockGrainVoice(asset(samples),{regions});const starts=new Set();
  for(let i=0;i<48000;i++){assert.equal(a.next(.55),b.next(.55));starts.add(a.current.start);}
  assert.equal(starts.size,1);assert.equal(a.stats.stateSwitches,0);
  assert.ok(a.stats.texture.uniqueIntervals>2);assert.ok(a.stats.texture.maximumMaterialRateDifference<=.05+1e-12);
});
test('source validation rejects malformed intervals, nonfinite input and invalid operating controls',()=>{
  const a=asset(new Float32Array(1000));
  for(const regions of [[{startFrame:-1,endFrame:20}],[{startFrame:10,endFrame:1001}],[{startFrame:0,endFrame:4}],
    [{startFrame:0,endFrame:500},{startFrame:499,endFrame:800}]])assert.throws(()=>new StockGrainVoice(a,{regions}));
  const bad=new Float32Array(1000);bad[400]=NaN;assert.throws(()=>new StockGrainVoice(asset(bad)));
  const v=new StockGrainVoice(a);for(const u of [NaN,-.1,1.1,Infinity])assert.throws(()=>v.next(u));
});
