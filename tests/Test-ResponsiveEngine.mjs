import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {prepareSources,renderResponsive,validateControl,controlAt,spliceMismatch} from '../tools/audio/responsive-engine.mjs';
import {loadSources,run} from '../tools/Render-ResponsiveEngine.mjs';
import {eventPeriod} from '../tools/Analyse-ResponsiveEngine.mjs';
import {decodeWav,encodeWav,measure} from '../src/offline-audio/stock-source.mjs';
import {hash} from '../tools/Inspect-Deceleration.mjs';import {privateRoot} from '../tools/audio/private-files.mjs';
function source(step,phase){
  const grains=[];let position=1024;
  for(let f=32;f>=10;f-=step){grains.push({UnkUint1:position,UnkFloat1:f});position+=Math.round(48000/f);}
  const data=new Float64Array(position+1024);
  for(let i=0;i<grains.length-1;i++){const a=grains[i].UnkUint1,b=grains[i+1].UnkUint1;for(let n=a;n<b;n++){const u=(n-a)/(b-a);data[n]=0.22*Math.sin(4*Math.PI*u+phase)+0.04*Math.sin(10*Math.PI*u+phase);}}
  return {audio:{rate:48000,channels:1,data},grains};
}
const inputs=()=>({engine:source(0.2,0.2),exhaust:source(0.22,1.1)});
const prepare=()=>{const s=inputs();return prepareSources(s.engine,s.exhaust);};
const hold=(seconds=2)=>[{t:0,state:0.5},{t:seconds,state:0.5}];
function projection(a,frequency,start,end){let x=0,y=0;for(let n=start;n<end;n++){x+=a.data[n]*Math.cos(2*Math.PI*frequency*n/a.rate);y+=a.data[n]*Math.sin(2*Math.PI*frequency*n/a.rate);}return Math.hypot(x,y)/(end-start);}
test('Constant state drives an exact common sample clock and known acoustic periodicity',()=>{
  const r=renderResponsive(prepare(),hold(2),{duration:2});assert.equal(r.preferred.data.length,96000);assert.equal(r.diagnostics.cycles,42);
  assert.ok(r.diagnostics.schedule.every(s=>s.value===21));assert.ok(projection(r.preferred,42,12000,84000)>projection(r.preferred,57.54,12000,84000)*10);
});
test('Increasing control selects non-increasing source indices without reverse waveform playback',()=>{
  const r=renderResponsive(prepare(),[{t:0,state:0.3},{t:4,state:0.7}],{duration:4});const s=r.diagnostics.schedule;
  assert.ok(s.at(-1).value>s[0].value);assert.ok(s.slice(1).every((v,i)=>v.engineIndex<=s[i].engineIndex&&v.engineSpeed>0));
});
test('Decreasing control selects non-decreasing source indices on the same forward cycles',()=>{
  const r=renderResponsive(prepare(),[{t:0,state:0.7},{t:4,state:0.3}],{duration:4});const s=r.diagnostics.schedule;
  assert.ok(s.at(-1).value<s[0].value);assert.ok(s.slice(1).every((v,i)=>v.engineIndex>=s[i].engineIndex&&v.exhaustSpeed>0));
});
test('Multiple holds and both transition directions remain sample-aligned and bounded',()=>{
  const points=[{t:0,state:0.3},{t:1,state:0.3},{t:3,state:0.6},{t:4,state:0.6},{t:6,state:0.3}];
  const r=renderResponsive(prepare(),points,{duration:6}),s=r.diagnostics.schedule;
  assert.equal(r.engine.data.length,r.exhaust.data.length);assert.ok(s.some(v=>v.state===0.3)&&s.some(v=>v.state===0.6));
  assert.ok(s.slice(1).every((v,i)=>v.start===s[i].end&&Math.abs(v.engineIndex-s[i].engineIndex)<=3&&Math.abs(v.exhaustIndex-s[i].exhaustIndex)<=3));
});
test('Control validation rejects invalid values, time extents and excessive transition speed',()=>{
  for(const state of [-0.1,1.1,NaN,Infinity])assert.throws(()=>validateControl([{t:0,state},{t:2,state:0.5}],2));
  assert.throws(()=>validateControl([{t:0,state:0},{t:1,state:1}],1));assert.throws(()=>validateControl(hold(2),30));
  assert.throws(()=>validateControl([{t:0,state:0.5},{t:0,state:0.5}],2));assert.throws(()=>controlAt(hold(),3));
});
test('Monotonic mapping covers the declared endpoints and rejects unprepared objects',()=>{
  const p=prepare();for(const state of [0,1]){const r=renderResponsive(p,[{t:0,state},{t:1,state}],{duration:1});assert.ok(r.diagnostics.schedule.every(s=>Math.abs(s.engineState-s.value)/s.value<=0.02));}
  assert.throws(()=>renderResponsive({...p},hold(),{duration:2}),/settings/);
});
test('Corrupt or nonmonotonic metadata, silence, wrong rates and stereo are rejected',()=>{
  const s=inputs();s.engine.grains[5]={...s.engine.grains[4]};assert.throws(()=>prepareSources(s.engine,s.exhaust));
  const t=inputs();t.exhaust.audio.data.fill(0);assert.throws(()=>prepareSources(t.engine,t.exhaust),/silent/);
  const u=inputs();u.engine.audio.rate=24000;assert.throws(()=>prepareSources(u.engine,u.exhaust),/48k/);
  u.engine.audio.rate=48000;u.engine.audio.channels=2;u.engine.audio.data=u.engine.audio.data.slice(0,u.engine.audio.data.length-u.engine.audio.data.length%2);assert.throws(()=>prepareSources(u.engine,u.exhaust),/48k/);
});
test('A hold can outlast the source file without advancing beyond its cycle bank',()=>{
  const p=prepare(),r=renderResponsive(p,hold(8),{duration:8});assert.ok(r.engine.data.length>p.engine.audio.data.length);
  assert.equal(r.engine.data.length,384000);assert.ok(r.diagnostics.schedule.every(s=>s.engineEnd<p.engine.audio.data.length&&s.exhaustEnd<p.exhaust.audio.data.length));
});
test('Resampling and component-state correspondence remain inside fixed gates',()=>{
  const r=renderResponsive(prepare(),[{t:0,state:0.2},{t:5,state:0.8}],{duration:5});
  assert.ok(r.diagnostics.schedule.every(s=>[s.engineSpeed,s.exhaustSpeed].every(v=>v>=0.95&&v<=1.05)&&Math.abs(s.engineState-s.exhaustState)/s.engineState<=0.02));
  const bad=inputs();bad.exhaust.grains=bad.exhaust.grains.map(g=>({...g,UnkUint1:Math.round(g.UnkUint1*1.5)}));assert.throws(()=>prepareSources(bad.engine,bad.exhaust),/warp/);
});
test('Splice screening distinguishes natural steep derivatives from introduced boundary mismatch',()=>{
  const audio={rate:48000,channels:1,data:Float64Array.from({length:10000},(_,n)=>0.5*Math.sin(2*Math.PI*n/4))};
  assert.ok(Math.abs(audio.data[2000]-audio.data[1999])>0.4);
  assert.ok(spliceMismatch(audio,2000,1,4000,1)<1e-10);assert.ok(spliceMismatch(audio,2001,1,4003,1)>0.9);
  assert.throws(()=>spliceMismatch(audio,-1,1,4000,1));
});
test('Unsafe stitch choices have a local fallback or stop the render without fabricating silence',()=>{
  const s=inputs();for(const src of [s.engine,s.exhaust])for(let i=0;i<src.grains.length;i++){
    const n=src.grains[i].UnkUint1;for(let j=-15;j<=15;j++)src.audio.data[n+j]=i%2?0.8:-0.8;
  }
  const p=prepareSources(s.engine,s.exhaust);
  try{const r=renderResponsive(p,hold(2),{duration:2});assert.ok(r.diagnostics.rejectedSegments>0||r.diagnostics.fallbacks>0);assert.equal(measure(r.preferred).allZero,false);}
  catch(e){assert.match(e.message,/safe local stitch|traversal/);}
});
test('Original samples remain unchanged; repeated renders are byte-identical',()=>{
  const s=inputs(),before=s.engine.audio.data.slice(),p=prepareSources(s.engine,s.exhaust);
  const a=renderResponsive(p,hold(2),{duration:2}),b=renderResponsive(p,hold(2),{duration:2});
  assert.deepEqual(encodeWav(a.preferred),encodeWav(b.preferred));assert.deepEqual(s.engine.audio.data,before);
});
test('Separate component gain and quantised sum retain alignment and headroom',()=>{
  const r=renderResponsive(prepare(),hold(2),{duration:2}),e=decodeWav(encodeWav(r.engine)),x=decodeWav(encodeWav(r.exhaust)),m=decodeWav(encodeWav(r.preferred));
  for(let n=0;n<m.data.length;n++)assert.ok(Math.abs(m.data[n]-e.data[n]-x.data[n])<=1/32768);
  assert.equal(measure(m).clippedSamples,0);assert.equal(m.data[0],0);assert.equal(m.data.at(-1),0);assert.notDeepEqual(r.engine.data,r.exhaust.data);
});
test('A known short event loop is diagnosed rather than called natural playback',()=>{
  const events=Array.from({length:28},(_,i)=>({index:i%7,start:i*100,end:(i+1)*100}));assert.equal(eventPeriod(events),7);
  events[20].index=99;assert.equal(eventPeriod(events),null);
  events[20].start=NaN;assert.throws(()=>eventPeriod(events),/timeline/);
});
test('Smooth interpolation is bounded and honours holds and direction changes',()=>{
  const p=[{t:0,state:0.2},{t:1,state:0.2},{t:3,state:0.5},{t:5,state:0.2}];validateControl(p,5);
  assert.equal(controlAt(p,0.5),0.2);assert.equal(controlAt(p,3),0.5);assert.ok(controlAt(p,2)>0.2&&controlAt(p,2)<0.5);
});
function fixture(){
  fs.mkdirSync(privateRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(privateRoot,'responsive-synthetic-')),s=inputs(),rows=[],streams=[];
  for(const component of ['engine','exhaust']){
    const file=component+'.wav',b=encodeWav(s[component].audio),sha=hash(b);fs.writeFileSync(path.join(dir,file),b);
    for(const state of ['idle','accel','decel'])rows.push({component,state,file,sha256:sha,sampleRate:48000,channels:1,sampleCount:s[component].audio.data.length});
    streams.push({name:component+'_decel',codec:0,wavSha256:sha,grains:{GranularGrains:s[component].grains}});
  }
  const manifest=path.join(dir,'manifest.json'),settings=path.join(dir,'scenarios.json');
  fs.writeFileSync(manifest,JSON.stringify({schemaVersion:1,family:'bati/v_twin_2',provenance:'Original synthetic sine fixture only',sources:rows}));
  fs.writeFileSync(path.join(dir,'extraction.json'),JSON.stringify({failed:false,archives:[{container:'v_twin_2.awc',streams}]}));
  fs.writeFileSync(settings,JSON.stringify({schemaVersion:1,engineScale:0.35,scenarios:{A_hold:{duration:1,points:hold(1)}}}));
  return {dir,manifest,settings,rows};
}
test('CLI source fingerprints and malformed/missing material fail before output creation',()=>{
  const f=fixture();fs.appendFileSync(path.join(f.dir,'engine.wav'),Buffer.of(0));assert.throws(()=>loadSources(f.manifest),/fingerprint/);
  const g=fixture();fs.unlinkSync(path.join(g.dir,'exhaust.wav'));assert.throws(()=>loadSources(g.manifest));
  const h=fixture(),file=path.join(h.dir,'engine.wav'),b=fs.readFileSync(file);b.writeUInt16LE(3,20);fs.writeFileSync(file,b);
  const m=JSON.parse(fs.readFileSync(h.manifest)),metaFile=path.join(h.dir,'extraction.json'),meta=JSON.parse(fs.readFileSync(metaFile));
  for(const s of m.sources)if(s.component==='engine')s.sha256=hash(b);meta.archives[0].streams[0].wavSha256=hash(b);
  fs.writeFileSync(h.manifest,JSON.stringify(m));fs.writeFileSync(metaFile,JSON.stringify(meta));assert.throws(()=>loadSources(h.manifest),/PCM16/);
});
test('Private CLI preserves inputs, refuses existing/unprotected/linked outputs and writes exact frames',()=>{
  const f=fixture(),before=hash(fs.readFileSync(f.manifest)),out=path.join(f.dir,'render');const r=run(f.manifest,f.settings,'A_hold',out);
  assert.equal(r.outputs['mix_exhaust_led.wav'].frames,48000);assert.equal(hash(fs.readFileSync(f.manifest)),before);
  assert.throws(()=>run(f.manifest,f.settings,'A_hold',out),/existing/);assert.throws(()=>run(f.manifest,f.settings,'A_hold',path.resolve('public-responsive')),/private/);
  const target=path.join(f.dir,'target'),link=path.join(f.dir,'linked');fs.mkdirSync(target);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>run(f.manifest,f.settings,'A_hold',path.join(link,'bad')),/linked/);assert.equal(fs.existsSync(path.join(target,'bad')),false);
});
test('Post-preparation corruption and unsupported gain cannot generate a valid render',()=>{
  const s=inputs(),p=prepareSources(s.engine,s.exhaust);s.engine.audio.data[2000]=NaN;assert.throws(()=>renderResponsive(p,hold(2),{duration:2}));
  assert.throws(()=>renderResponsive(prepare(),hold(2),{duration:2,engineScale:2}),/settings/);
});
