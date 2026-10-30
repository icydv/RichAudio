// Analysis-metric validation only. These analytic PCM fixtures never replace
// the separate guarded actual-producer/native-host regression.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authoredMotionPan,authoredMaximumFiveMsStep,spatialIncrementMetrics,spatialPcmMetrics} from '../tools/Run-SpatialStabilityProof.mjs';

const name='rapid-rotation',fs=48000,frames=fs*2;
function analyse(mode){
 const bytes=Buffer.alloc(frames*8);let blurred=0;
 for(let frame=0;frame<frames;frame++){
  const time=frame/fs,observed=mode==='held-20hz'?Math.floor(time*20)/20:mode==='held-512'?Math.floor(frame/512)*512/fs:time;
  let pan=authoredMotionPan(name,observed);
  if(mode==='blurred'){blurred+=(pan-blurred)*(1-Math.exp(-1/(.05*fs)));pan=blurred;}
  if(mode==='missing-direction')pan=0;
  const tone=.04*(Math.sin(2*Math.PI*600*time)+.22*Math.sin(2*Math.PI*1200*time)+.08*Math.sin(2*Math.PI*1800*time));
  bytes.writeFloatLE(tone*Math.sqrt((1-pan)/2),frame*8);bytes.writeFloatLE(tone*Math.sqrt((1+pan)/2),frame*8+4);
 }
 const pcm=spatialPcmMetrics(bytes,[],null),values=pcm.balances.filter(b=>b.time>=1.45&&b.time<=1.75);
 return {pcm,increments:spatialIncrementMetrics(values,time=>authoredMotionPan(name,time))};
}
test('authored continuous rapid-turn PCM passes despite exceeding a blurred baseline raw peak',()=>{
 const continuous=analyse('continuous'),blurred=analyse('blurred'),bound=authoredMaximumFiveMsStep(name);
 assert.ok(continuous.pcm.rms>.01);
 assert.ok(continuous.pcm.maximumFiveMsStereoBalanceStep>blurred.pcm.maximumFiveMsStereoBalanceStep+.002,'old raw baseline heuristic would reject correct commanded motion');
 assert.ok(continuous.pcm.maximumFiveMsStereoBalanceStep<=bound+.002);
 assert.ok(continuous.increments.maximumDerivativeResidual<.002);
});
test('held20Hz observations and held512-frame directions fail authored motion continuity',()=>{
 for(const mode of ['held-20hz','held-512']){
  const m=analyse(mode);assert.ok(m.pcm.rms>.01);
  assert.ok(m.pcm.maximumFiveMsStereoBalanceStep>authoredMaximumFiveMsStep(name)+.002,mode);
  assert.ok(m.increments.maximumDerivativeResidual>.002,mode);
 }
});
test('nonzero PCM with missing direction fails pointwise increment accuracy',()=>{
 const m=analyse('missing-direction');assert.ok(m.pcm.rms>.01);assert.equal(m.pcm.maximumFiveMsStereoBalanceStep,0);
 assert.ok(m.increments.maximumDerivativeResidual>.002,'silently fixed-center audio cannot pass by having no raw steps');
});
