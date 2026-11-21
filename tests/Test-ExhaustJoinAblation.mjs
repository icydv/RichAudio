import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {prepareAblation,renderAblation,compareAblation} from '../tools/audio/exhaust-join-ablation.mjs';
import {sample,encodeWav,decodeWav} from '../src/offline-audio/stock-source.mjs';
import {hash} from '../tools/Inspect-Deceleration.mjs';import {run} from '../tools/Render-ExhaustJoinAblation.mjs';import {privateRoot} from '../tools/audio/private-files.mjs';
function fixture(){
  const lengths=[2249,2272,2277,2297,2319],states=[21.34,21.17,21.05,20.89,20.74],rows=[];let start=1024;
  for(let i=0;i<5;i++){rows.push({index:10+i,start,end:start+lengths[i],state:states[i]});start+=lengths[i];}
  const data=new Float64Array(start+1024);
  for(let n=0;n<data.length;n++){const r=rows.find(r=>n>=r.start&&n<r.end)??(n<1024?rows[0]:rows.at(-1)),u=(n-r.start)/(r.end-r.start);data[n]=0.3*Math.sin(4*Math.PI*u+0.2)+0.07*Math.sin(16*Math.PI*u+0.4);}
  return {audio:{rate:48000,channels:1,data},rows};
}
const prepare=()=>{const f=fixture();return prepareAblation(f.audio,f.rows);};
function oldJoinOracle(p){
  const data=new Float64Array(240000);for(let k=0;k<p.schedule.length;k++){const r=p.schedule[k],prev=p.schedule[k-1];
    for(let j=0;j<r.end-r.start;j++){let v=sample(p.audio,r.sourceStart+j*r.speed,0,r.speed);
      if(prev&&j<96){const u=Math.sin(Math.PI/2*j/96)**2;v=(1-u)*sample(p.audio,prev.sourceEnd+j*prev.speed,0,prev.speed)+u*v;}
      const n=r.start+j,fade=Math.min(1,n/1200,(239999-n)/1200);data[n]=fade===0?0:v*0.15*fade;
    }
  }return {rate:48000,channels:1,data};
}
test('The fixed five-interval walk preserves original source order, output clock and boundary classification',()=>{
  const p=prepare();assert.equal(p.schedule.length,105);assert.equal(p.schedule.at(-1).end,240000);
  assert.equal(p.schedule.filter(r=>r.boundary==='internal').length,84);assert.equal(p.schedule.filter(r=>r.boundary==='wrap').length,20);
  const originalLengths=[2249,2272,2277,2297,2319];
  for(let i=0;i<105;i++){const r=p.schedule[i];assert.equal(r.index,10+i%5);assert.equal(r.start,Math.round(i*48000/21));assert.equal(r.end,Math.round((i+1)*48000/21));assert.equal(r.speed,originalLengths[i%5]/(Math.round((i+1)*48000/21)-Math.round(i*48000/21)));assert.ok(r.speed>=0.95&&r.speed<=1.05);assert.ok(Math.abs(r.sourceStart+(r.end-r.start)*r.speed-r.sourceEnd)<1e-10);if(r.boundary==='internal')assert.equal(r.sourceStart,p.schedule[i-1].sourceEnd);}
});
test('Default A exactly reproduces an independently evaluated unchanged continuation-join formula',()=>{
  const p=prepare(),a=renderAblation(p),explicit=renderAblation(p,{omitInternalBlends:false});
  assert.deepEqual(encodeWav(a.audio),encodeWav(oldJoinOracle(p)));assert.deepEqual(encodeWav(a.audio),encodeWav(explicit.audio));
});
test('B follows the identical direct source path within internal windows; no new cursor accumulation or gain',()=>{
  const p=prepare(),b=renderAblation(p,{omitInternalBlends:true});
  for(const r of p.schedule.filter(r=>r.boundary==='internal'))for(const j of [0,1,48,95,96,500]){
    const n=r.start+j,fade=Math.min(1,n/1200,(239999-n)/1200),expected=sample(p.audio,r.sourceStart+j*r.speed,0,r.speed)*0.15*fade;
    assert.equal(b.audio.data[n],expected);
  }
});
test('Float and quantised differences stay exclusively inside the targeted 84 internal windows',()=>{
  const p=prepare(),a=renderAblation(p),b=renderAblation(p,{omitInternalBlends:true});
  for(const [x,y]of [[a.audio,b.audio],[decodeWav(encodeWav(a.audio)),decodeWav(encodeWav(b.audio))]]){const d=compareAblation(p,x,y);assert.equal(d.internal.samples,8064);assert.equal(d.unaffected.changedSamples,0);assert.equal(d.wrap.changedSamples,0);assert.ok(d.internal.changedSamples>0);}
});
test('All wrap samples retain the previous source continuation including wrap read-rate changes',()=>{
  const p=prepare(),a=renderAblation(p),b=renderAblation(p,{omitInternalBlends:true});
  for(const r of p.schedule.filter(r=>r.boundary==='wrap')){const prev=p.schedule[r.ordinal-1];for(let j=0;j<96;j++){
    const u=Math.sin(Math.PI/2*j/96)**2,expected=((1-u)*sample(p.audio,prev.sourceEnd+j*prev.speed,0,prev.speed)+u*sample(p.audio,r.sourceStart+j*r.speed,0,r.speed))*0.15;
    assert.equal(a.audio.data[r.start+j],expected);assert.equal(b.audio.data[r.start+j],expected);
  }}
});
test('The isolation validator rejects a deliberately introduced out-of-window or wrap difference',()=>{
  const p=prepare(),a=renderAblation(p),b=renderAblation(p,{omitInternalBlends:true});b.audio.data[1500]+=0.001;assert.throws(()=>compareAblation(p,a.audio,b.audio),/confounded/);
  b.audio.data[1500]=a.audio.data[1500];const w=p.schedule.find(r=>r.boundary==='wrap');b.audio.data[w.start+20]+=0.001;assert.throws(()=>compareAblation(p,a.audio,b.audio),/confounded/);
});
test('Repeated A/B renders are byte-identical and preserve input samples and exact lengths',()=>{
  const f=fixture(),before=f.audio.data.slice(),p=prepareAblation(f.audio,f.rows);
  for(const omitInternalBlends of [false,true]){const a=renderAblation(p,{omitInternalBlends}),b=renderAblation(p,{omitInternalBlends});assert.deepEqual(encodeWav(a.audio),encodeWav(b.audio));assert.equal(a.audio.data.length,240000);assert.equal(a.audio.data[0],0);assert.equal(a.audio.data.at(-1),0);}
  assert.deepEqual(f.audio.data,before);
});
test('Invalid metadata, degenerate blocks, ineligible rates, bounds and unsupported switches cannot render',()=>{
  for(const change of [f=>f.rows.pop(),f=>f.rows[2].start++,f=>f.rows[2].index=99,f=>f.rows[2].end=f.rows[2].start,f=>f.rows[0].state=NaN,f=>f.rows[0].state=24,f=>f.rows[4].end=f.audio.data.length,f=>f.audio.rate=24000,f=>f.audio.data.fill(0),f=>f.audio.data[1200]=Infinity]){const f=fixture();change(f);assert.throws(()=>prepareAblation(f.audio,f.rows));}
  assert.throws(()=>renderAblation({...prepare()}));assert.throws(()=>renderAblation(prepare(),{omitInternalBlends:'yes'}));
});
function privateFixture(){
  fs.mkdirSync(privateRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(privateRoot,'join-ablation-synthetic-')),rows=[],streams=[];
  const grains=[];let position=1024;for(let f=35.35;f>=10;f-=0.15){grains.push({UnkUint1:position,UnkFloat1:f});position+=Math.round(48000/f);}
  const data=new Float64Array(position+1024);for(let i=0;i<grains.length-1;i++)for(let n=grains[i].UnkUint1;n<grains[i+1].UnkUint1;n++)data[n]=0.3*Math.sin(4*Math.PI*(n-grains[i].UnkUint1)/(grains[i+1].UnkUint1-grains[i].UnkUint1));
  for(const component of ['engine','exhaust']){const file=component+'.wav',bytes=encodeWav({rate:48000,channels:1,data}),sha=hash(bytes);fs.writeFileSync(path.join(dir,file),bytes);for(const state of ['idle','accel','decel'])rows.push({component,state,file,sha256:sha,sampleRate:48000,channels:1,sampleCount:data.length});streams.push({name:component+'_decel',codec:0,wavSha256:sha,grains:{GranularGrains:grains}});}
  const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({schemaVersion:1,family:'bati/v_twin_2',provenance:'Original synthetic fixtures only',sources:rows}));fs.writeFileSync(path.join(dir,'extraction.json'),JSON.stringify({schemaVersion:1,failed:false,archives:[{container:'v_twin_2.awc',streams}]}));return {dir,manifest};
}
test('Private CLI writes only the A/B pair and diagnostic, preserving fingerprints and refusing overwrites/escapes',()=>{
  const f=privateFixture(),before=hash(fs.readFileSync(f.manifest)),out=path.join(f.dir,'output'),r=run(f.manifest,out);
  assert.deepEqual(fs.readdirSync(out).sort(),['A_existing_internal_joins.wav','B_continuous_internal.wav','analysis.json']);assert.equal(r.pcmComparison.unaffected.changedSamples,0);assert.equal(hash(fs.readFileSync(f.manifest)),before);
  assert.throws(()=>run(f.manifest,out),/existing/);assert.throws(()=>run(f.manifest,path.resolve('public-ablation')),/private/);
  fs.appendFileSync(path.join(f.dir,'exhaust.wav'),Buffer.of(0));assert.throws(()=>run(f.manifest,path.join(f.dir,'bad')),/fingerprint/);
});
test('Linked private outputs are rejected before any target files are created',()=>{
  const f=privateFixture(),target=path.join(f.dir,'target'),link=path.join(f.dir,'link');fs.mkdirSync(target);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>run(f.manifest,path.join(link,'bad')),/linked/);assert.deepEqual(fs.readdirSync(target),[]);
});
