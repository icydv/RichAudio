import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {decodeWav, encodeWav, renderReference, measure} from '../src/offline-audio/stock-source.mjs';
import {build, hash, referenceRanges, sliceAudio} from '../tools/Inspect-Deceleration.mjs';
import {analysePair, spectrum} from '../tools/audio/decel-analysis.mjs';
import {privateRoot} from '../tools/audio/private-files.mjs';
const settings = {schemaVersion:1,mode:'continuous-recordings',rate:48000,master:0.2,gains:{engine:1,exhaust:0.75},idleSeconds:0.5,crossfadeSeconds:0.02};
const tone = frequency => ({rate:48000,channels:1,data:Float64Array.from({length:38400},(_,n)=>0.3*Math.sin(2*Math.PI*frequency*n/48000))});
const assets = () => ['engine','exhaust'].flatMap((component,c)=>['idle','accel','decel'].map((state,i)=>({component,state,audio:tone(90+c*37+i*13)})));
function fixture() {
  fs.mkdirSync(privateRoot,{recursive:true});const root=fs.mkdtempSync(path.join(privateRoot,'decel-synthetic-'));
  const sources=assets(), rows=sources.map((s,i)=>{const b=encodeWav(s.audio), file=i+'.wav';fs.writeFileSync(path.join(root,file),b);return {component:s.component,state:s.state,file,sha256:hash(b),sampleRate:48000,channels:1,sampleCount:s.audio.data.length};});
  const decoded=sources.map((s,i)=>({...s,audio:decodeWav(fs.readFileSync(path.join(root,i+'.wav')))}));
  const m=path.join(root,'manifest.json'), t=path.join(root,'settings.json'), baseline=path.join(root,'baseline');
  fs.writeFileSync(m,JSON.stringify({schemaVersion:1,sources:rows}));fs.writeFileSync(t,JSON.stringify(settings));fs.mkdirSync(baseline);
  const outputs={};for(const [name,a] of Object.entries(renderReference(decoded,settings))){const b=encodeWav(a);fs.writeFileSync(path.join(baseline,'demo_'+name+'.wav'),b);outputs[name]={sha256:hash(b)};}
  fs.writeFileSync(path.join(baseline,'analysis.json'),JSON.stringify({outputs}));return {root,m,t,baseline,rows};
}
test('Global sample slicing retains leading silence, interleaved channels and immutable originals',()=>{
  const a={rate:48000,channels:2,data:Float64Array.of(0,0,0,0,0.1,-0.1,0.2,-0.2)};
  const before=a.data.slice();assert.deepEqual(sliceAudio(a,1,4).data,Float64Array.of(0,0,0.1,-0.1,0.2,-0.2));assert.deepEqual(a.data,before);
  for(const [s,e] of [[-1,3],[1,1],[1,5],[0.5,3]])assert.throws(()=>sliceAudio(a,s,e));
});
test('Reference stage and tail ranges share a common clock; malformed timing and schedules fail',()=>{
  const sources=assets();sources[5].audio={...sources[5].audio,data:sources[5].audio.data.slice(0,30000)};
  const r=referenceRanges(sources,settings);assert.equal(r.decelStart,24000+38400-1920);assert.equal(r.exhaustEnd,r.decelStart+30000);
  assert.equal(r.clipStart,r.decelStart-14400);assert.equal(r.idleStart,r.decelEnd-960);
  assert.throws(()=>referenceRanges(sources,{...settings,crossfadeSeconds:NaN}));
  assert.throws(()=>referenceRanges(sources.slice(1),settings));
  assert.throws(()=>referenceRanges(sources.map(()=>sources[0]),settings));
});
test('Hann FFT locates an authored bin-centred sine and rejects invalid extents/nonfinite input',()=>{
  const a=Float64Array.from({length:4096},(_,n)=>Math.sin(2*Math.PI*17*n/4096));const f=spectrum(a);
  let best=1;for(let k=2;k<2048;k++)if(f.re[k]**2+f.im[k]**2>f.re[best]**2+f.im[best]**2)best=k;
  assert.equal(best,17);assert.ok(Math.abs(Math.hypot(f.re[17],f.im[17])-1024)<1e-8);
  assert.throws(()=>spectrum(a,-1));a[0]=NaN;assert.throws(()=>spectrum(a));
});
test('Pair diagnostics distinguish constructive/cancelling authored sources without modifying alignment',()=>{
  const a=tone(93.75), before=a.data.slice(), b={...a,data:a.data.map(x=>-x)};
  const same=analysePair(a,a,0,38400), inverse=analysePair(a,b,0,38400);
  assert.ok(same.rows.every(r=>Math.abs(r.zeroLagCorrelation-1)<1e-12));
  assert.ok(inverse.rows.every(r=>Math.abs(r.zeroLagCorrelation+1)<1e-12));
  assert.ok(Math.abs(same.rows[0].bands[0].combinedVsIndependentDb-3.01029995664)<1e-8);
  assert.equal(inverse.rows[0].bands[0].combinedVsIndependentDb,null);assert.deepEqual(a.data,before);
  assert.throws(()=>analysePair(a,b,0,10));
});
test('Default reference is unchanged; candidate touches engine deceleration only and preserves source samples',()=>{
  const sources=assets(), originals=sources.map(s=>s.audio.data.slice());
  const base=renderReference(sources,settings), explicit=renderReference(sources,{...settings,decelEngineScale:1});
  assert.deepEqual(encodeWav(base.mix),encodeWav(explicit.mix));
  const changed=renderReference(sources,{...settings,decelEngineScale:0.75}), r=referenceRanges(sources,settings);
  assert.deepEqual(changed.exhaust.data,base.exhaust.data);
  assert.deepEqual(changed.mix.data.slice(0,r.decelStart),base.mix.data.slice(0,r.decelStart));
  assert.deepEqual(changed.mix.data.slice(r.decelEnd),base.mix.data.slice(r.decelEnd));
  for(let n=r.decelStart+r.overlap;n<r.idleStart;n++)assert.ok(Math.abs(changed.engine.data[n]-0.75*base.engine.data[n])<1e-15);
  sources.forEach((s,i)=>assert.deepEqual(s.audio.data,originals[i]));assert.equal(measure(changed.mix).clippedSamples,0);
  for(const scale of [0,0.49,1.01,NaN,Infinity])assert.throws(()=>renderReference(sources,{...settings,decelEngineScale:scale}));
});
test('Isolation pack preserves raw bytes, baseline and common clip range with deterministic outputs',()=>{
  const f=fixture(), first=build(f.m,f.t,f.baseline,path.join(f.root,'first')), second=build(f.m,f.t,f.baseline,path.join(f.root,'second'));
  assert.deepEqual(first.report.outputs,second.report.outputs);assert.equal(first.report.baselineReproduced,true);
  const count=first.report.ranges.clipEnd-first.report.ranges.clipStart;
  for(const c of ['engine','exhaust','mix'])assert.equal(first.clips[c].data.length,count);
  assert.ok(first.report.maxComponentSumError<=1/32768);
  for(const c of ['engine','exhaust']){const raw=f.rows.find(s=>s.component===c&&s.state==='decel');assert.equal(first.report.outputs['D_raw_'+c+'_decel.wav'].sha256,raw.sha256);}
  assert.equal(first.report.outputs['E_full_reference.wav'].sha256,hash(fs.readFileSync(path.join(f.baseline,'demo_mix.wav'))));
  assert.equal(first.report.interiorAnalysis.rows.length>0,true);
});
test('Missing/changed material and baseline fingerprints fail before writing output',()=>{
  const f=fixture(), output=path.join(f.root,'failed');
  const row=f.rows[0];fs.appendFileSync(path.join(f.root,row.file),Buffer.of(0));assert.throws(()=>build(f.m,f.t,f.baseline,output),/fingerprint/);assert.equal(fs.existsSync(output),false);
  const g=fixture();fs.unlinkSync(path.join(g.root,g.rows[0].file));assert.throws(()=>build(g.m,g.t,g.baseline,path.join(g.root,'missing')));
  const h=fixture();fs.appendFileSync(path.join(h.baseline,'demo_mix.wav'),Buffer.of(0));assert.throws(()=>build(h.m,h.t,h.baseline,path.join(h.root,'bad')),/fingerprint/);
});
test('Unsafe, escaping, linked and existing output paths remain rejected',()=>{
  const f=fixture(), out=path.join(f.root,'existing');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'sentinel'),'unchanged');
  assert.throws(()=>build(f.m,f.t,f.baseline,out),/existing/);assert.equal(fs.readFileSync(path.join(out,'sentinel'),'utf8'),'unchanged');
  assert.throws(()=>build(f.m,f.t,f.baseline,path.resolve('public-decel')),/private/);
  const link=path.join(f.root,'linked');fs.symlinkSync(f.baseline,link,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>build(f.m,f.t,link,path.join(f.root,'bad-link')),/linked/);
  f.rows[0].file='../escaped.wav';fs.writeFileSync(f.m,JSON.stringify({schemaVersion:1,sources:f.rows}));assert.throws(()=>build(f.m,f.t,f.baseline,path.join(f.root,'escape')),/escape/);
});
