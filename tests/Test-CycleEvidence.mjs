import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {markerSummary,localPeriodicity,validateMapping,valueAtFrame} from '../tools/audio/cycle-analysis.mjs';
import {cycleSchedule,matchedExhaust} from '../tools/audio/cycle-experiment.mjs';
import {inspect} from '../tools/Inspect-CycleEvidence.mjs';
import {renderExperiment} from '../tools/Render-CycleExperiment.mjs';
import {privateRoot} from '../tools/audio/private-files.mjs';
const tone=(f,phase=0,amplitude=0.25)=>({rate:48000,channels:1,data:Float64Array.from({length:96000},(_,n)=>amplitude*Math.sin(2*Math.PI*f*n/48000+phase))});
function markers(step=0.25){let p=1024;const result=[];for(let f=30;f>=12;f-=step){result.push({UnkUint1:p,UnkFloat1:f});p+=Math.round(48000/f);}return result;}
test('Independent autocorrelation measures known period without requiring metadata',()=>{
  const p=localPeriodicity(tone(40),48000);assert.ok(p.peaks.some(x=>Math.abs(x.relativeFrequencyHz-40)<0.1&&x.correlation>0.99));
  assert.equal(p.metadataValue,null);assert.equal(p.metadataPeriodCorrelation,null);
});
test('Amplitude and phase changes preserve relative periodicity, not waveform identity',()=>{
  const a=localPeriodicity(tone(40),48000,40),b=localPeriodicity(tone(40,1.7,0.03),48000,40);
  assert.ok(a.metadataPeriodCorrelation>0.99&&b.metadataPeriodCorrelation>0.99);assert.notDeepEqual(a,b);
});
test('Dominant second harmonic and absent fundamental retain explicit harmonic ambiguity',()=>{
  const a=tone(40);for(let n=0;n<a.data.length;n++)a.data[n]+=0.1*Math.sin(2*Math.PI*60*n/48000);
  const p=localPeriodicity(a,48000,20,[10,27.4]);
  assert.ok(p.metadataPeriodCorrelation>0.99);assert.ok(p.controlPeriodCorrelations[0].correlation>0.99);
  assert.ok(p.controlPeriodCorrelations[1].correlation<0.5);assert.match(p.ambiguity,/harmonic/);
});
test('Slow analytic chirp follows changing repetition and rejects a mistuned control',()=>{
  const a=tone(40);for(let n=0;n<a.data.length;n++){const t=n/48000;a.data[n]=0.25*Math.sin(2*Math.PI*(40*t+t*t));}
  const p=localPeriodicity(a,48000,42,[42*1.37]);assert.ok(p.metadataPeriodCorrelation>0.8);assert.ok(p.controlPeriodCorrelations[0].correlation<0.3);
  assert.ok(p.peaks.some(x=>Math.abs(x.relativeFrequencyHz-42)<0.7));
});
test('Constant, short, incorrect-layout/rate and excessive-window inputs fail safely',()=>{
  const a=tone(40);a.data.fill(0.2);assert.equal(localPeriodicity(a,48000).unavailable,'degenerate energy');
  assert.throws(()=>localPeriodicity(tone(40),1));assert.throws(()=>localPeriodicity({...tone(40),rate:4000},48000));
  assert.throws(()=>localPeriodicity(tone(40),48000,-1));assert.throws(()=>localPeriodicity(tone(40),48000,null,[NaN]));
});
test('Marker spacing model is held out and reversed controls detect an incorrect relationship',()=>{
  const g=markers(),a=tone(40);a.data=new Float64Array(g.at(-1).UnkUint1+1024);
  const s=markerSummary(g,[],a);assert.equal(s.spacingModel.chosenOnEvenRecords,0);
  assert.ok(s.spacingModel.oddHeldOutRelativeError.median<0.001);assert.ok(s.spacingModel.reversedFloatControl.median>0.1);
});
test('Spacing consistency alone cannot recover absolute waveform phase',()=>{
  const g=Array.from({length:20},(_,n)=>({UnkUint1:2000+n*1200,UnkFloat1:40})),a=tone(40);
  const shifted=g.map(x=>({...x,UnkUint1:x.UnkUint1+300}));
  const first=markerSummary(g,[],a),second=markerSummary(shifted,[],a);
  assert.deepEqual(first.spacingModel,second.spacingModel);assert.ok(Math.abs(first.markerValueRmsOverWholeRms-second.markerValueRmsOverWholeRms)>0.2);
});
test('Missing/corrupt markers and invalid group membership are rejected',()=>{
  const a=tone(40);a.data=new Float64Array(250000);const g=markers();
  assert.throws(()=>markerSummary([],[],a));
  for(const bad of [[...g.slice(0,2),g[1]],g.map((x,i)=>i===2?{...x,UnkFloat1:NaN}:x)])assert.throws(()=>markerSummary(bad,[],a));
  assert.throws(()=>markerSummary(g,[{GrainCount:2,Grains:[0,99999]}],a));
  assert.throws(()=>valueAtFrame(g,-1));assert.throws(()=>valueAtFrame([g[0],g[0]],2000));
});
test('State maps reject reversals, plateaus and out-of-range interpolation requests',()=>{
  assert.throws(()=>validateMapping([{state:1,position:20},{state:0,position:30}]));
  assert.throws(()=>validateMapping([{state:1,position:20},{state:1,position:30}]));
  const g=markers();assert.equal(valueAtFrame(g,g[10].UnkUint1),g[10].UnkFloat1);assert.throws(()=>valueAtFrame(g,g.at(-1).UnkUint1+1));
});
test('Different marker counts can share a bounded state schedule without equal-index pairing',()=>{
  const e=markers(0.25),x=markers(0.3),s=cycleSchedule(e,x);
  assert.ok(s.length>20);assert.ok(s.some(g=>g.engineIndex!==g.exhaustIndex));assert.ok(s.every(g=>g.speed>=0.95&&g.speed<=1.05&&g.relativeStateError<=0.02));
  const bad=x.map(g=>({...g,UnkUint1:Math.round(g.UnkUint1*1.3)}));assert.throws(()=>cycleSchedule(e,bad),/warp/);
});
test('Cycle playback stays deterministic, bounded and source-immutable with independent phase',()=>{
  const e=markers(),x=markers(0.3),s=cycleSchedule(e,x),a=tone(40,1.2);a.data=new Float64Array(x.at(-1).UnkUint1+5000);
  for(let n=0;n<a.data.length;n++)a.data[n]=0.25*Math.sin(2*Math.PI*40*n/48000+1.2);
  const saved=a.data.slice(),r=matchedExhaust(a,s);assert.deepEqual(r,matchedExhaust(a,s));assert.deepEqual(a.data,saved);
  assert.equal(r.data.length,s.at(-1).end-s[0].start);assert.ok(r.data.every(v=>Number.isFinite(v)&&Math.abs(v)<0.3));
  assert.throws(()=>matchedExhaust(a,s.map((g,i)=>i===0?{...g,speed:4}:g)));assert.throws(()=>matchedExhaust({...a,rate:24000},s));
});
test('Unprotected/existing outputs and malformed private inputs do not create results',()=>{
  fs.mkdirSync(privateRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(privateRoot,'cycle-synthetic-')),out=path.join(dir,'out');
  fs.mkdirSync(out);fs.writeFileSync(path.join(out,'sentinel'),'unchanged');assert.throws(()=>inspect(dir,out),/existing/);
  assert.equal(fs.readFileSync(path.join(out,'sentinel'),'utf8'),'unchanged');assert.throws(()=>inspect(dir,path.resolve('public-cycle')),/private/);
  fs.writeFileSync(path.join(dir,'extraction.json'),JSON.stringify({failed:true}));assert.throws(()=>inspect(dir,path.join(dir,'failed')));assert.equal(fs.existsSync(path.join(dir,'failed')),false);
  assert.throws(()=>renderExperiment(dir,dir,path.resolve('public-cycle')),/private/);
  const target=path.join(dir,'target'),link=path.join(dir,'linked');fs.mkdirSync(target);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>inspect(dir,path.join(link,'result')),/linked/);assert.equal(fs.existsSync(path.join(target,'result')),false);
});
