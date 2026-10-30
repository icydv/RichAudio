import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BoundedLateReverb,createVehicleEnvironment,analyticLateEvidence} from '../src/acoustics/vehicle/environment.mjs';
const FS=48000;
const evidence=()=>createVehicleEnvironment('tunnel').lateEvidence;
function render(e,x,{room=evidence(),chunk=512,wet=.22,legacy=false,disabledAt=Infinity}={}){
  const r=new BoundedLateReverb(room,{wet}),l=new Float32Array(e.length),right=new Float32Array(e.length);
  for(let at=0;at<e.length;at+=chunk){const end=Math.min(e.length,at+chunk),args=[e.subarray(at,end),x.subarray(at,end),l.subarray(at,end),right.subarray(at,end),{enabled:at<disabledAt}];
    if(legacy)r.processInto(...args);else r.processSourceStemsInto(...args);}
  return {l,r:right,diagnostics:r.diagnostics(),instance:r};
}
const energy=a=>a.reduce((sum,v)=>sum+v*v,0);
const noise=(frames,seed=123456789)=>Float32Array.from({length:frames},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/2147483648-1)*.2;});
function decay(pcm){let total=energy(pcm),remaining=total,n=0,sx=0,sy=0,sxx=0,sxy=0;
  for(let i=0;i<pcm.length;i++){if(i%48===0){const db=10*Math.log10(remaining/total),t=i/FS;
    if(db< -5&&db> -35){n++;sx+=t;sy+=db;sxx+=t*t;sxy+=t*db;}}remaining-=pcm[i]*pcm[i];}
  assert.ok(n>20);return -60/((n*sxy-sx*sy)/(n*sxx-sx*sx));}

test('legacy received-stereo method retains exact pre-extension PCM on deterministic input',()=>{
  // Captured before adding source-stem support, from the unchanged PR74 method.
  // Integer seeded input avoids a platform-dependent input oscillator.
  const input=noise(FS),out=render(input,input,{legacy:true});
  const hash=createHash('sha256').update(Buffer.from(out.l.buffer)).update(Buffer.from(out.r.buffer)).digest('hex');
  assert.equal(hash,'0ec3d840f0a80caaba3adc4c8859ddd7bea9604d7c3d909a7d986b42e2ed5be4');
  assert.equal(out.diagnostics.inputBasis,undefined);assert.equal(out.diagnostics.sourceStemPredelayFrames,undefined);
});
test('antiphase distinct emitters excite the source field rather than cancel in a stereo average',()=>{
  const engine=noise(FS),exhaust=Float32Array.from(engine,v=>-v);
  const received=render(engine,exhaust,{legacy:true}),source=render(engine,exhaust);
  assert.equal(energy(received.l)+energy(received.r),0);
  assert.ok(energy(source.l)+energy(source.r)>.01);
  assert.equal(source.diagnostics.inputEnergyNorm,'engine-squared-plus-exhaust-squared');
  assert.equal(source.diagnostics.inputBasis,'orthogonal-original-engine-exhaust-source-stems');
});
test('source send is linear, deterministic across blocks and bounded by joint stem energy',()=>{
  const e=noise(FS),x=noise(FS,92831),zero=new Float32Array(FS);
  const both=render(e,x),separateE=render(e,zero),separateX=render(zero,x),small=render(e,x,{chunk:256});
  assert.deepEqual(both.l,small.l);assert.deepEqual(both.r,small.r);
  for(let i=0;i<e.length;i++)for(const channel of ['l','r'])
    assert.ok(Math.abs(both[channel][i]-separateE[channel][i]-separateX[channel][i])<2e-8);
  const bound=both.diagnostics.maximumL2GainBound,input=energy(e)+energy(x);
  assert.ok(Math.sqrt(energy(both.l)/input)<=bound);assert.ok(Math.sqrt(energy(both.r)/input)<=bound);
  assert.ok(both.l.every(Number.isFinite)&&both.r.every(Number.isFinite));
});
test('unchanged feedback yields a decaying tail with the authored flat-room T60',()=>{
  const room=analyticLateEvidence({id:'stock-flat-room',dimensions:[12,10,4],surfaces:[{area:416,absorption:[.2,.2,.2]}]});
  const impulse=new Float32Array(FS*4);impulse[0]=.3;
  const out=render(impulse,new Float32Array(impulse.length),{room});
  const measured=decay(out.l),expected=room.rt60Seconds[0];
  assert.ok(Math.abs(measured/expected-1)<.12,`${measured} vs ${expected}`);
  assert.ok(out.diagnostics.maximumFeedbackGain<1);
  assert.ok(energy(out.l.subarray(FS*3))<energy(out.l.subarray(0,FS))*1e-8);
});
test('unsupported/outdoor input remains silent and disabled start cannot inject source audio',()=>{
  const e=noise(FS/2),x=noise(FS/2,631);
  assert.equal(energy(render(e,x,{room:null}).l),0);
  const disabled=render(e,x,{disabledAt:0});assert.equal(energy(disabled.l)+energy(disabled.r),0);
});
test('source send validates complete buffers before mutation and rejects mixed input bases',()=>{
  const r=new BoundedLateReverb(evidence()),e=noise(512),x=noise(512,48),l=new Float32Array(512),right=new Float32Array(512);
  const bad=Float32Array.from(e);bad[511]=NaN;
  assert.throws(()=>r.processSourceStemsInto(bad,x,l,right),/finite bounded/);assert.equal(r.outputFrames,0);
  assert.throws(()=>r.processSourceStemsInto(e,x,e,right),/overlap/);
  r.processSourceStemsInto(e,x,l,right);assert.throws(()=>r.processInto(e,x,l,right),/separate late-field/);
  const legacy=new BoundedLateReverb(evidence());legacy.processInto(e,x,l,right);
  assert.throws(()=>legacy.processSourceStemsInto(e,x,l,right),/separate late-field/);
});
