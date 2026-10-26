import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {renderOuterWrap,inspectOuterWrap} from '../tools/audio/outer-wrap-ablation.mjs';
import {prepareAblation,renderAblation} from '../tools/audio/exhaust-join-ablation.mjs';
import {encodeWav,decodeWav,sample} from '../src/offline-audio/stock-source.mjs';import {hash} from '../tools/Inspect-Deceleration.mjs';
import {privateRoot} from '../tools/audio/private-files.mjs';import {run as innerRun} from '../tools/Render-ExhaustJoinAblation.mjs';import {run} from '../tools/Render-OuterWrapAblation.mjs';
function fixture(fast=false){const lengths=fast?[2284,2284,2284,2284,2284]:[2249,2272,2277,2297,2319],rows=[];let p=1024;
  for(let i=0;i<5;i++){rows.push({index:10+i,start:p,end:p+lengths[i],state:21});p+=lengths[i];}const data=new Float64Array(p+1024);
  for(let n=0;n<data.length;n++){const r=rows.find(r=>n>=r.start&&n<r.end)??(n<1024?rows[0]:rows.at(-1)),u=(n-r.start)/(r.end-r.start);data[n]=fast?0.8*Math.sin(Math.PI/2*n):0.3*Math.sin(4*Math.PI*u+0.2)+0.07*Math.sin(16*Math.PI*u+0.4);}
  return {audio:{rate:48000,channels:1,data},rows};}
function prepare(){const f=fixture();return prepareAblation(f.audio,f.rows);}
test('Reference equals P2-03.6 B exactly and defaults keep wrap blending enabled',()=>{
  const p=prepare(),a=renderOuterWrap(p),legacy=renderAblation(p,{omitInternalBlends:true});assert.deepEqual(encodeWav(a.audio),encodeWav(legacy.audio));assert.deepEqual(encodeWav(a.audio),encodeWav(renderOuterWrap(p,{omitOuterBlends:false}).audio));
});
test('Outer windows are exactly twenty disjoint 96-frame regions on the original clock',()=>{
  const p=prepare(),a=renderOuterWrap(p),b=renderOuterWrap(p,{omitOuterBlends:true}),r=inspectOuterWrap(p,a.audio,b.audio);
  assert.equal(r.targeted.samples,1920);assert.equal(r.unaffected.samples,238080);assert.equal(r.internalWindows.samples,8064);assert.equal(r.rows.length,20);
  for(let i=0;i<r.rows.length;i++){assert.equal(r.rows[i].frame,Math.round((i+1)*5*48000/21));assert.equal(r.rows[i].endFrame-r.rows[i].frame,96);}
});
test('Unblended wraps use unchanged direct interpolation, rate, source order, gain and endpoint fades',()=>{
  const p=prepare(),b=renderOuterWrap(p,{omitOuterBlends:true});const lengths=[2249,2272,2277,2297,2319];
  for(const r of p.schedule){assert.equal(r.index,10+r.ordinal%5);assert.equal(r.speed,lengths[r.ordinal%5]/(Math.round((r.ordinal+1)*48000/21)-Math.round(r.ordinal*48000/21)));if(r.boundary==='wrap')for(let j=0;j<96;j++){const n=r.start+j;assert.equal(b.audio.data[n],sample(p.audio,r.sourceStart+j*r.speed,0,r.speed)*.15);}}
  assert.equal(b.audio.data.length,240000);assert.equal(b.audio.data[0],0);assert.equal(b.audio.data.at(-1),0);
});
test('Differences are localised before and after PCM16 conversion, with no internal-traversal changes',()=>{
  const p=prepare(),a=renderOuterWrap(p),b=renderOuterWrap(p,{omitOuterBlends:true});for(const [x,y]of [[a.audio,b.audio],[decodeWav(encodeWav(a.audio)),decodeWav(encodeWav(b.audio))]]){const d=inspectOuterWrap(p,x,y);assert.equal(d.unaffected.changedSamples,0);assert.equal(d.internalWindows.changedSamples,0);assert.ok(d.targeted.changedSamples>0);assert.equal(d.safety.passed,true);}
});
test('An injected change beyond wrap windows is rejected as a confounded experiment',()=>{
  const p=prepare(),a=renderOuterWrap(p),b=renderOuterWrap(p,{omitOuterBlends:true});b.audio.data[3000]+=0.001;assert.throws(()=>inspectOuterWrap(p,a.audio,b.audio),/confounded/);
});
test('Safety detects excess introduced wrap mismatch, arbitrary target changes, clipping and nonfinite samples',()=>{
  const p=prepare(),a=renderOuterWrap(p),b=renderOuterWrap(p,{omitOuterBlends:true}),w=p.schedule.find(r=>r.boundary==='wrap');b.audio.data[w.start]+=0.1;let r=inspectOuterWrap(p,a.audio,b.audio);assert.equal(r.safety.passed,false);assert.ok(r.safety.reasons.some(s=>s.includes('discontinuity')));
  b.audio.data[w.start]=sample(p.audio,w.sourceStart,0,w.speed)*.15;b.audio.data[w.start+40]+=0.1;r=inspectOuterWrap(p,a.audio,b.audio);assert.equal(r.safety.passed,false);assert.ok(r.safety.reasons.some(s=>s.includes('direct target')));
  b.audio.data[w.start+40]=1;r=inspectOuterWrap(p,a.audio,b.audio);assert.ok(r.safety.reasons.includes('clipping'));b.audio.data[w.start+40]=NaN;assert.throws(()=>inspectOuterWrap(p,a.audio,b.audio));
});
test('A large natural derivative is not mistaken for an added splice discontinuity',()=>{
  const f=fixture(true),p=prepareAblation(f.audio,f.rows),a=renderOuterWrap(p),b=renderOuterWrap(p,{omitOuterBlends:true}),r=inspectOuterWrap(p,a.audio,b.audio);
  assert.ok(Math.max(...r.rows.map(w=>w.B.maximumLocalStep))>r.safety.addedSpliceResidualLimit);assert.equal(r.safety.passed,true);
});
test('Mode is explicit, originals immutable, repeat output deterministic and invalid plans/configurations fail',()=>{
  const f=fixture(),before=f.audio.data.slice(),p=prepareAblation(f.audio,f.rows);for(const omitOuterBlends of [false,true])assert.deepEqual(encodeWav(renderOuterWrap(p,{omitOuterBlends}).audio),encodeWav(renderOuterWrap(p,{omitOuterBlends}).audio));assert.deepEqual(f.audio.data,before);
  assert.throws(()=>renderOuterWrap(p,{omitOuterBlends:'yes'}));assert.throws(()=>renderOuterWrap({...p}));f.rows[1].start++;assert.throws(()=>prepareAblation(f.audio,f.rows));
  const g=fixture();g.rows[4].end=g.audio.data.length;assert.throws(()=>prepareAblation(g.audio,g.rows));assert.throws(()=>prepareAblation(g.audio,g.rows.slice(0,4)));
});
function privateFixture(){
  fs.mkdirSync(privateRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(privateRoot,'outer-wrap-synthetic-')),rows=[],streams=[],grains=[];let position=1024;
  for(let f=35.35;f>=10;f-=.15){grains.push({UnkUint1:position,UnkFloat1:f});position+=Math.round(48000/f);}const data=new Float64Array(position+1024);
  for(let i=0;i<grains.length-1;i++)for(let n=grains[i].UnkUint1;n<grains[i+1].UnkUint1;n++)data[n]=.3*Math.sin(4*Math.PI*(n-grains[i].UnkUint1)/(grains[i+1].UnkUint1-grains[i].UnkUint1));
  for(const component of ['engine','exhaust']){const file=component+'.wav',bytes=encodeWav({rate:48000,channels:1,data}),sha=hash(bytes);fs.writeFileSync(path.join(dir,file),bytes);for(const state of ['idle','accel','decel'])rows.push({component,state,file,sha256:sha,sampleRate:48000,channels:1,sampleCount:data.length});streams.push({name:component+'_decel',codec:0,wavSha256:sha,grains:{GranularGrains:grains}});}
  const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({schemaVersion:1,family:'bati/v_twin_2',provenance:'Original synthetic fixture',sources:rows}));fs.writeFileSync(path.join(dir,'extraction.json'),JSON.stringify({failed:false,archives:[{container:'v_twin_2.awc',streams}]}));const previous=path.join(dir,'previous');innerRun(manifest,previous);return {dir,manifest,previous};
}
test('Private CLI reproduces its historical reference, writes only A/B and diagnostics, and rejects overwrites/escapes',()=>{
  const f=privateFixture(),before=hash(fs.readFileSync(f.manifest)),out=path.join(f.dir,'new'),r=run(f.manifest,f.previous,out);
  assert.equal(r.baselineReproduced,true);assert.equal(r.status,r.pcmComparison.resolution.meaningfulAtPcm16?'READY_FOR_LISTENING':'SAFE_BELOW_RESOLUTION_SCREEN');assert.deepEqual(fs.readdirSync(out).sort(),['A_existing_outer_wraps.wav','B_outer_blends_removed.wav','analysis.json']);assert.equal(hash(fs.readFileSync(f.manifest)),before);
  assert.throws(()=>run(f.manifest,f.previous,out),/existing/);assert.throws(()=>run(f.manifest,f.previous,path.resolve('public-wrap')),/private/);
});
test('Changed historical fingerprints/source data and linked destinations fail before preview creation',()=>{
  const f=privateFixture(),out=path.join(f.dir,'bad');fs.appendFileSync(path.join(f.previous,'B_continuous_internal.wav'),Buffer.of(0));assert.throws(()=>run(f.manifest,f.previous,out),/historical/);assert.equal(fs.existsSync(out),false);
  const g=privateFixture();fs.appendFileSync(path.join(g.dir,'exhaust.wav'),Buffer.of(0));assert.throws(()=>run(g.manifest,g.previous,path.join(g.dir,'bad')),/fingerprint/);
  const h=privateFixture(),target=path.join(h.dir,'target'),link=path.join(h.dir,'link');fs.mkdirSync(target);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>run(h.manifest,h.previous,path.join(link,'bad')),/linked/);assert.deepEqual(fs.readdirSync(target),[]);
});
