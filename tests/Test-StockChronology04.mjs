import {test} from 'node:test';import assert from 'node:assert/strict';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
for(const rate of [24000,32000,48000])test(`native chronology preserves fractional orders and resonant detail at ${rate}`,()=>{
  const span=rate/50,n=rate*2,samples=Float32Array.from({length:n},(_,i)=>.3*Math.sin(2*Math.PI*75*i/rate)+.1*Math.sin(2*Math.PI*125*i/rate));
  const intervals=Array.from({length:100},(_,i)=>({startFrame:i*span,endFrame:(i+1)*span}));
  const voice=new StockGrainVoice({samples,frames:n,sampleRate:rate,intervals});
  let error=0,energy=0,native=0;
  for(let i=0;i<1920;i++){const p=i*rate/48000,k=Math.floor(p),f=p-k,wanted=(1-f)*samples[k]+f*samples[k+1],actual=voice.next(0);
    error=Math.max(error,Math.abs(wanted-actual));energy+=actual*actual;native+=wanted*wanted;}
  assert.ok(error<1e-7,'no self-loop/morph at contiguous interval boundaries');
  assert.ok(Math.abs(10*Math.log10(energy/native))<1e-6,'native fractional-order energy is retained');
  assert.equal(voice.stats.texture.splices??0,0);assert.equal(voice.stats.sourceBoundViolations,0);
});
test('noncontiguous splice consumes each head once per output sample',()=>{
  const rate=48000,period=480,samples=Float32Array.from({length:rate},(_,i)=>.3*Math.sin(2*Math.PI*i/period));
  const intervals=Array.from({length:100},(_,i)=>({startFrame:i*period,endFrame:(i+1)*period}));
  const voice=new StockGrainVoice({samples,frames:rate,sampleRate:rate,intervals});let maximumError=0;
  const origin=.5*(rate-1);
  for(let i=0;i<rate*4;i++){const p=(origin+i)%rate,k=Math.floor(p),f=p-k,expected=(1-f)*samples[k]+f*samples[(k+1)%rate];maximumError=Math.max(maximumError,Math.abs(voice.next(.5)-expected));}
  assert.ok((voice.stats.texture.splices??0)>2);assert.ok(maximumError<1e-6,'splice scheduling cannot consume incoming samples twice');
});
test('reader speed stays continuous across variable-duration source markers',()=>{
  const lengths=Array.from({length:120},(_,i)=>1000-4*i),frames=lengths.reduce((s,v)=>s+v,0),samples=new Float32Array(frames),intervals=[];let at=0;
  for(const length of lengths){intervals.push({startFrame:at,endFrame:at+length});for(let j=0;j<length;j++)samples[at+j]=.3*Math.sin(2*Math.PI*j/length);at+=length;}
  const voice=new StockGrainVoice({samples,frames,sampleRate:48000,intervals});
  for(let i=0;i<48000;i++)voice.next(.5);
  assert.ok(voice.stats.texture.maximumReaderStepChange<.0001,'no staircase in the actual native read speed at interval boundaries');
  assert.equal(voice.stats.sourceBoundViolations,0);
});
