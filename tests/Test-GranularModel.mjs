import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {inspectStructure,intervals,eligibleIntervals,assessPairs,continuity,texture,intervalFeatures,statistics,peakFieldHypotheses} from '../tools/audio/granular-model-analysis.mjs';
import {inspectModel} from '../tools/Inspect-GranularModel.mjs';import {privateRoot} from '../tools/audio/private-files.mjs';
import {encodeWav} from '../src/offline-audio/stock-source.mjs';import {hash} from '../tools/Inspect-Deceleration.mjs';
function source({count=8,frequency=21,phase=0,harmonic=1}={}){
  const length=Math.round(48000/frequency),data=new Float64Array(2048+count*length),grains=[];
  for(let i=0;i<=count;i++)grains.push({UnkUint1:1024+i*length,UnkFloat1:frequency,UnkUshort1:16384,UnkUshort2:16384});
  for(let n=0;n<data.length;n++)data[n]=0.5*Math.sin(2*Math.PI*harmonic*(n-1024)/length+phase);
  return {audio:{rate:48000,channels:1,data},grains,loops:[{UnkUint1:2,GrainCount:4,Identifier:'4C633D07',Grains:[2,3,4,5]}]};
}
test('Structure distinguishes group references from implicit adjacent intervals and retains index-base ambiguity',()=>{
  const s=source(),r=inspectStructure(s.grains,s.loops,s.audio);assert.equal(r.intervals,8);assert.equal(r.coveredReferences,4);assert.equal(r.groups[0].consecutive,true);
  assert.deepEqual(r.indexBaseHypotheses,[{base:0,valid:true},{base:1,valid:true}]);assert.equal(r.overlappingReferences,0);
});
test('Marker corruption, wrong layouts and missing metadata fail explicitly',()=>{
  for(const change of [s=>s.grains[2].UnkUint1=s.grains[1].UnkUint1,s=>s.grains[2].UnkUint1=s.audio.data.length,s=>s.grains[2].UnkFloat1=NaN,s=>s.grains[2].UnkUshort1=65536,s=>s.audio.rate=24000,s=>s.audio.data[100]=Infinity]){
    const s=source();change(s);assert.throws(()=>inspectStructure(s.grains,s.loops,s.audio));
  }
  assert.throws(()=>inspectStructure(undefined,[],source().audio));assert.throws(()=>inspectStructure(source().grains,[],source().audio,NaN));
});
test('Invalid loop counts/order/bounds reject; nonconsecutive and overlapping references remain observable',()=>{
  for(const list of [[9999],[2,2],[4,3],[-1]]){const s=source();s.loops[0].Grains=list;s.loops[0].GrainCount=list.length;assert.throws(()=>inspectStructure(s.grains,s.loops,s.audio));}
  const s=source();s.loops[0].GrainCount=7;assert.throws(()=>inspectStructure(s.grains,s.loops,s.audio));
  s.loops=[{UnkUint1:2,Identifier:'4C633D07',GrainCount:3,Grains:[1,3,5]},{UnkUint1:2,Identifier:'4C633D07',GrainCount:2,Grains:[3,4]}];
  const r=inspectStructure(s.grains,s.loops,s.audio);assert.equal(r.groups[0].consecutive,false);assert.equal(r.overlappingReferences,1);
});
test('Consecutive segmentation is sample-identical; missing intervals and inconsistent boundaries cannot masquerade as continuity',()=>{
  const s=source(),before=s.audio.data.slice(),rows=intervals(s.grains),r=continuity(s.audio,s.grains,rows);
  assert.equal(r.segmentationDifferingSamples,0);assert.equal(r.frames,rows.at(-1).end-rows[0].start);assert.deepEqual(s.audio.data,before);
  assert.throws(()=>continuity(s.audio,s.grains,[rows[0],rows[2]]));assert.throws(()=>continuity(s.audio,s.grains,[{...rows[0],end:rows[0].end-1},rows[1]]));
});
test('Phase differs without changing a periodic source harmonic distribution',()=>{
  const a=source(),b=source({phase:0.9}),r=intervals(a.grains)[0],x=intervalFeatures(a.audio,r),y=intervalFeatures(b.audio,r);
  for(let i=0;i<8;i++)assert.ok(Math.abs(x.firstEightRelativeHarmonicPowers[i]-y.firstEightRelativeHarmonicPowers[i])<1e-5);
  assert.ok(Math.abs(x.startValue-y.startValue)>0.2);
});
test('A second harmonic can dominate without establishing a physical fundamental',()=>{
  const s=source({harmonic:2}),f=intervalFeatures(s.audio,intervals(s.grains)[0]);assert.ok(f.firstEightRelativeHarmonicPowers[1]>0.99);assert.ok(f.firstEightRelativeHarmonicPowers[0]<0.001);
  assert.throws(()=>intervalFeatures(s.audio,{start:0,end:0}));
});
test('Broadband high orders do not alias or normalise into invented strong low harmonics',()=>{
  const s=source({harmonic:253}),f=intervalFeatures(s.audio,intervals(s.grains)[0]);
  assert.ok(f.firstEightRelativeHarmonicPowers.every(p=>p!==null&&p<0.001));
});
test('Pair analysis accepts unequal marker counts, keeps all associations classified and rejects mismatched state',()=>{
  const a=source({count:4}),b=source({count:5,phase:1}),r=assessPairs(a,b);assert.equal(r.combinations.length,20);assert.ok(r.combinations.every(p=>p.classification==='PLAUSIBLE BUT UNVERIFIED'));
  assert.equal(assessPairs(a,source({frequency:23})).combinations.length,0);
  const bad=source();bad.grains[1].UnkFloat1=Infinity;assert.throws(()=>assessPairs(a,bad));
  assert.throws(()=>assessPairs(source({count:17}),source({count:17})),/matrix bound/);
});
test('Requested-state eligibility uses the existing state and read-rate gates rather than group labels',()=>{
  const s=source({count:4});assert.equal(eligibleIntervals(s.grains).length,4);s.grains=s.grains.map(g=>({...g,UnkUint1:g.UnkUint1*2}));assert.equal(eligibleIntervals(s.grains).length,0);assert.throws(()=>eligibleIntervals(s.grains,NaN));
});
test('Spectral texture is deterministic and gain-normalised spectral summaries do not reward louder input',()=>{
  const a=source(),b=source();b.audio.data=b.audio.data.map(v=>v*0.2);const x=texture(a.audio,1024,a.grains.at(-1).UnkUint1),y=texture(b.audio,1024,b.grains.at(-1).UnkUint1,5);
  assert.deepEqual(x,texture(a.audio,1024,a.grains.at(-1).UnkUint1));assert.ok(Math.abs(x.rms.mean-y.rms.mean)<1e-12);assert.ok(Math.abs(x.centroidHz.mean-y.centroidHz.mean)<1e-8);
});
test('Silent, short and nonfinite spectra cannot generate a false tonal estimate',()=>{
  const s=source();s.audio.data.fill(0);const r=texture(s.audio,1024,10000);assert.equal(r.centroidHz.count,0);assert.equal(r.rms.mean,0);
  assert.throws(()=>texture(s.audio,0,100));assert.throws(()=>texture(s.audio,0,10000,0));s.audio.data[2000]=NaN;assert.throws(()=>texture(s.audio,0,10000));assert.throws(()=>statistics([NaN]));
});
test('Peak-field comparisons report counterexamples instead of declaring an authoritative gain law',()=>{
  const s=source({frequency:20}),a=peakFieldHypotheses(s.audio,s.grains);assert.ok(a.firstAsPositivePeak.maxAbsoluteError<1e-12);
  s.grains[2].UnkUshort1=100;const b=peakFieldHypotheses(s.audio,s.grains);assert.ok(b.firstAsPositivePeak.maxAbsoluteError>0.4);assert.ok(b.firstAsPositivePeak.exactIntervals<a.firstAsPositivePeak.exactIntervals);
});
function privateFixture(){
  fs.mkdirSync(privateRoot,{recursive:true});const root=fs.mkdtempSync(path.join(privateRoot,'granular-original-fixture-')),sourceDir=path.join(root,'sources'),player=path.join(sourceDir,'player');fs.mkdirSync(player,{recursive:true});
  const streams=[],fingerprints={};for(const component of ['engine','exhaust'])for(const state of ['accel','decel','idle']){
    const name=component+'_'+state,s=source({phase:component==='engine'?0:1}),bytes=encodeWav(s.audio);fs.writeFileSync(path.join(player,name+'.wav'),bytes);
    streams.push({name,wav:name+'.wav',codec:0,wavSha256:hash(bytes),sampleRate:48000,sampleCount:s.audio.data.length,grains:{ChunkSize:4+12*s.grains.length,UnkFloat1:1,GranularGrains:s.grains},loops:{GranularLoopsCount:1,GranularLoops:s.loops}});if(state==='decel')fingerprints[component]=hash(bytes);
  }
  streams.push({name:'unused1'},{name:'unused2'});fs.writeFileSync(path.join(sourceDir,'extraction.json'),JSON.stringify({schemaVersion:1,failed:false,archives:[{container:'v_twin_2.awc',streams},{container:'v_twin_2_npc.awc',streams:[]}]}));
  const hold=path.join(root,'hold');fs.mkdirSync(hold);const outputs={};
  for(const component of ['engine','exhaust']){const data=Float64Array.from({length:240000},(_,n)=>0.1*Math.sin(2*Math.PI*n/2286)),bytes=encodeWav({rate:48000,channels:1,data});fs.writeFileSync(path.join(hold,component+'.wav'),bytes);outputs[component+'.wav']={sha256:hash(bytes)};}
  fs.writeFileSync(path.join(hold,'analysis.json'),JSON.stringify({schemaVersion:1,engineScale:0.35,control:{duration:5,points:[{t:0,state:0.5},{t:5,state:0.5}]},sources:Object.entries(fingerprints).map(([component,sha256])=>({component,sha256})),outputs,diagnostics:{schedule:Array.from({length:105},(_,i)=>({start:Math.round(i*48000/21),end:Math.round((i+1)*48000/21),value:21,engineIndex:i%8,exhaustIndex:i%8}))}}));
  return {root,sourceDir,hold};
}
test('Private CLI produces numeric-only diagnostics and preserves all source bytes',()=>{
  const f=privateFixture(),before=hash(fs.readFileSync(path.join(f.sourceDir,'player','engine_decel.wav'))),out=path.join(f.root,'analysis'),r=inspectModel(f.sourceDir,f.hold,f.hold,out);
  assert.equal(r.structures.length,6);assert.deepEqual(fs.readdirSync(out),['analysis.json']);assert.equal(hash(fs.readFileSync(path.join(f.sourceDir,'player','engine_decel.wav'))),before);
  assert.throws(()=>inspectModel(f.sourceDir,f.hold,f.hold,out),/existing/);assert.throws(()=>inspectModel(f.sourceDir,f.hold,f.hold,path.resolve('public-granular')),/private/);
});
test('Source fingerprints, missing metadata, held-data tampering and linked outputs stop publication',()=>{
  const f=privateFixture(),wave=path.join(f.sourceDir,'player','engine_decel.wav');fs.appendFileSync(wave,Buffer.of(0));assert.throws(()=>inspectModel(f.sourceDir,f.hold,f.hold,path.join(f.root,'bad')),/fingerprint/);
  const g=privateFixture();fs.unlinkSync(path.join(g.sourceDir,'extraction.json'));assert.throws(()=>inspectModel(g.sourceDir,g.hold,g.hold,path.join(g.root,'bad')));
  const h=privateFixture();fs.appendFileSync(path.join(h.hold,'engine.wav'),Buffer.of(0));assert.throws(()=>inspectModel(h.sourceDir,h.hold,h.hold,path.join(h.root,'bad')),/fingerprint/);
  const k=privateFixture(),target=path.join(k.root,'target'),link=path.join(k.root,'link');fs.mkdirSync(target);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>inspectModel(k.sourceDir,k.hold,k.hold,path.join(link,'bad')),/linked/);assert.deepEqual(fs.readdirSync(target),[]);
});
