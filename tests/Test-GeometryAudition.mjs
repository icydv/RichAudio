import test from 'node:test';
import assert from 'node:assert/strict';
import {replayGeometry} from '../tools/audio/geometry-replay.mjs';
const profile=['--beacon-frequency-hz','600','--beacon-level','0.44','--acoustic-quality','balanced','--acoustic-acceleration','auto'];
test('qualified close geometry, replacements and source reacquisition retain guard headroom with the explicit finite-emitter beacon',async()=>{
 for(const geometryScale of [.01,.05,.1,.2,1,2]){
  const r=await replayGeometry({geometryScale,extraArgs:[...profile,'--beacon-output-trim-db','12']});
  assert.equal(r.final.error,null);assert.equal(r.final.sourceCalibration.nearFieldRadius,10);
  assert.equal(r.final.outputTrim.rejectedBlocks,0);assert.equal(r.final.dsp.limited,0);
  assert.equal(r.metrics.nonfinite,0);assert.equal(r.metrics.clipped,0);assert.ok(r.metrics.peak<.5);
  assert.ok(r.traces.some(t=>t.pathPresentation.some(p=>p.order===2)));
  console.log(JSON.stringify({geometryScale,preHostPeak:r.metrics.peak,guardHeadroomDb:20*Math.log10(.5/r.metrics.peak),
   radius:r.final.sourceCalibration.nearFieldRadius,clipped:0,nonfinite:0,guardRejected:0,
   scope:'Actual producer/worker/trim/framing; qualified finite geometry; source/path replacement and expiry; no device'}));
 }
});
test('bounded +12dB preserves actual observed direct, reflected, obstructed and expiry PCM',async()=>{
 for(const condition of ['direct','reflected','obstructed']){
  const options={mode:condition==='direct'?'direct-reference':'observed',obstructed:condition==='obstructed',extraArgs:profile};
  const a=await replayGeometry(options),b=await replayGeometry({...options,extraArgs:[...profile,'--beacon-output-trim-db','12']});
  assert.equal(b.final.error,null);assert.equal(b.final.outputTrim.rejectedBlocks,0);assert.equal(b.final.dsp.limited,0);
  assert.equal(b.metrics.clipped,0);assert.equal(b.metrics.nonfinite,0);assert.ok(b.metrics.peak<=.5);
  assert.deepEqual(b.traces.map(t=>t.pathPresentation),a.traces.map(t=>t.pathPresentation));
  let peak=0,sum=0;
  for(let i=0;i<a.left.length;i++)for(const key of ['left','right']){
   assert.equal(b[key][i],Math.fround(a[key][i]*10**.6));
   const host=Math.fround(b[key][i]*Math.fround(.2));peak=Math.max(peak,Math.abs(host));sum+=host*host;
  }
  assert.ok(peak>0&&peak<=.100001);
  if(condition==='reflected')assert.ok(b.traces[80].pathPresentation.some(p=>p.order===2));
  if(condition==='obstructed')assert.ok(b.traces[80].pathPresentation.find(p=>p.order===0).bands.every(v=>v<.2));
  console.log(JSON.stringify({condition,frames:b.left.length,postHostPeak:peak,postHostRms:Math.sqrt(sum/(2*b.left.length)),preMasterPeak:b.final.outputTrim.peakAfter,headroomDb:-20*Math.log10(peak),clipped:0,nonfinite:0,limited:0,rejected:0,exact12dB:true,scope:'Actual observed-geometry worker/RA07 producer; synthetic private fixture; post-host Float32 multiplication, no device'}));
 }
});
