// Original analytical fixtures; genuine-bank integration is a separate private run.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
const FS=48000;
const amplitude=(x,hz,start=24000,n=48000)=>{let re=0,im=0;for(let i=0;i<n;i++){const phase=2*Math.PI*hz*i/FS;re+=x[start+i]*Math.cos(phase);im+=x[start+i]*Math.sin(phase);}return 2*Math.hypot(re,im)/n;};
function fixture(rate,cycles,harmonics=false){
  const samples=Float32Array.from({length:rate},(_,i)=>.25*Math.sin(2*Math.PI*100*i/rate)+(harmonics?.1*Math.sin(2*Math.PI*200*i/rate)+.05*Math.sin(2*Math.PI*300*i/rate):0));
  const size=rate/100*cycles;
  return {asset:{samples,frames:samples.length,sampleRate:rate},regions:Array.from({length:Math.floor(rate/size)},(_,i)=>({startFrame:i*size,endFrame:(i+1)*size}))};
}
for(const rate of [24000,32000,48000])for(const cycles of [1,2,4])test(`100 Hz identity and harmonic orders, native ${rate}, ${cycles} cycles per span`,()=>{
  const f=fixture(rate,cycles,true),v=new StockGrainVoice(f.asset,{regions:f.regions}),out=Float32Array.from({length:96000},()=>v.next(.5));
  let maximumReferenceError=0;
  for(let i=0;i<out.length;i++){
    const p=(.5*(rate-1)+i*rate/FS)%rate,k=Math.floor(p),w=p-k;
    const expected=(1-w)*f.asset.samples[k]+w*f.asset.samples[(k+1)%rate];
    maximumReferenceError=Math.max(maximumReferenceError,Math.abs(out[i]-expected));
  }
  assert.ok(maximumReferenceError<1e-6,'including seams: sample identity to independently indexed periodic native reference');
  for(const [hz,target] of [[100,.25],[200,.1],[300,.05]])assert.ok(Math.abs(20*Math.log10(amplitude(out,hz)/target))<.02,'harmonic amplitude within .02 dB');
  for(const hz of [85,99,101,169,170])assert.ok(amplitude(out,hz)<1e-5,'no octave/hop sideband at '+hz);
  let min=Infinity,max=0;for(let at=24000;at<72000;at+=480){let e=0;for(let i=at;i<at+480;i++)e+=out[i]*out[i];min=Math.min(min,e);max=Math.max(max,e);}
  assert.ok(10*Math.log10(max/min)<.001,'cycle-local energy modulation below .001 dB');
  // Seam-local point error against the known stack, allowing one common phase.
  const p100=amplitude(out,100);assert.ok(p100>.249);
  assert.equal(v.stats.stateSwitches,0);assert.equal(v.stats.sourceBoundViolations,0);
  assert.ok(v.maximumBoundaryStep<.015);
});
test('idle long-loop fallback retains a noncommensurate 107 Hz native source',()=>{
  for(const rate of [24000,32000,48000]){
    const samples=Float32Array.from({length:rate},(_,i)=>.4*Math.sin(2*Math.PI*107*i/rate));
    const v=new StockGrainVoice({samples,frames:rate,sampleRate:rate}),out=Float32Array.from({length:144000},()=>v.next(.5));
    assert.ok(amplitude(out,107)>.398);assert.ok(amplitude(out,106)<.002&&amplitude(out,108)<.002);assert.equal(v.stats.stateSwitches,0);
  }
});
test('slow and rapid state ramps keep full continuous clock, smooth seams and no quantized switching',()=>{
  const lengths=Array.from({length:40},(_,i)=>480-6*i),n=lengths.reduce((a,b)=>a+b,0),samples=new Float32Array(n),regions=[];let offset=0;
  for(const length of lengths){regions.push({startFrame:offset,endFrame:offset+length});for(let j=0;j<length;j++)samples[offset+j]=.4*Math.sin(2*Math.PI*j/length);offset+=length;}
  const v=new StockGrainVoice({samples,frames:n,sampleRate:FS},{regions});let previous=0,lastRate=null,maxStep=0,maxRateStep=0;
  for(let i=0;i<144000;i++){
    const u=i<96000?.05+.9*i/96000:.05,value=v.next(u),r=v.pair(v.state),a=v.intervals[r.a],b=v.intervals[r.b],rate=FS/((1-r.w)*a.length+r.w*b.length);
    if(lastRate!==null)maxRateStep=Math.max(maxRateStep,Math.abs(rate-lastRate));lastRate=rate;
    if(i>100)maxStep=Math.max(maxStep,Math.abs(value-previous));previous=value;
    assert.ok(v.phase>=0&&v.phase<1);
  }
  assert.ok(maxRateStep<1,'no instantaneous quantized frequency jump');assert.ok(maxStep<.025,'waveform/seam steps bounded during ramp');
  assert.ok(v.maximumBoundaryStep<.025);assert.equal(v.stats.sourceBoundViolations,0);
});
