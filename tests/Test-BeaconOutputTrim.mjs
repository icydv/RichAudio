import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { BeaconOutputTrim, validateAuditionProfile } from "../src/acoustics/streaming/beacon-output-trim.mjs";
import { runHeadless } from "../tools/audio/headless-stream.mjs";
import { pcmHash, spatialSchedule } from "../tools/audio/beacon-analysis.mjs";
const profile={outputTrimDb:12,sources:1,scene:"open-road",beacon:"harmonic",frequencyHz:600,level:0.44,delayMs:100,orientation:false,required:true};
const settings=["--beacon-frequency-hz","600","--beacon-level","0.44"];
export const auditionSettings=[...settings,"--beacon-output-trim-db","12"];
test("Audition boost is disabled bit-transparently by default",()=>{
  const trim=new BeaconOutputTrim(),a=new Float32Array([0,-0,0.2,-0.2]),b=a.slice();const bytes=Buffer.from(a.buffer).toString("hex");trim.apply(a,b);
  assert.equal(Buffer.from(a.buffer).toString("hex"),bytes);assert.equal(trim.stats.blocks,0);
});
test("Only the fixed profile can request +12dB; no arbitrary gain extension",()=>{
  validateAuditionProfile(profile);
  for(const change of [{outputTrimDb:24},{outputTrimDb:NaN},{sources:4},{scene:"urban-street"},{frequencyHz:95},{level:0.5},{delayMs:75},{orientation:true},{required:false}])assert.throws(()=>validateAuditionProfile({...profile,...change}));
  for(const db of [-1,1,11,13,NaN,Infinity])assert.throws(()=>new BeaconOutputTrim(db));
});
test("Gain is explicit and over-ceiling/nonfinite blocks are rejected atomically",()=>{
  const t=new BeaconOutputTrim(12),a=new Float32Array([0.01,-0.02]),b=a.slice();t.apply(a,b);
  assert.equal(a[0],Math.fround(Math.fround(0.01)*10**.6));assert.equal(t.stats.rejectedBlocks,0);
  for(const bad of [0.2,-0.2,NaN,Infinity]){
    const left=new Float32Array([0.001,0.002]),right=new Float32Array([0.001,bad]),before=left.slice();
    assert.throws(()=>t.apply(left,right));assert.deepEqual(left,before);assert.ok(Object.is(right[1],Math.fround(bad)));
  }
  assert.equal(t.stats.rejectedBlocks,4);
});
test('Trim failure identifies the original sample and scans finite peaks without retaining audio or arbitrary context',()=>{
  const trim=new BeaconOutputTrim(12),left=new Float32Array([.01,.13,.3]),right=new Float32Array([.02,.4,.03]),a=left.slice(),b=right.slice();
  let error;try{trim.apply(left,right,{audioFrame:8192,sourceGenerations:[4294967297],pathCount:2,minimumDistance:1.8,
    maximumDistance:6,maximumRelativeSpeed:8,geometryMode:'listener-only-conditional-direct',pathTransition:'reacquiring',
    outputLevel:1,richAudioEnabled:true,recentPoseDiscontinuities:3,recentControlChanges:1,
    path:'C:\\private\\do-not-retain',secret:'do-not-retain',pcm:left});}catch(e){error=e;}
  assert.equal(error.code,'AUDITION_TRIM_OVER_CEILING');
  assert.equal(error.diagnostic,trim.stats.lastFailure);
  assert.deepEqual(left,a);assert.deepEqual(right,b);
  const d=error.diagnostic;assert.equal(d.classification,'over-ceiling');assert.equal(d.offendingAudioFrame,8193);
  assert.equal(d.firstOffendingSample.channel,'left');assert.equal(d.firstOffendingSample.originalSample,a[1]);
  assert.equal(d.preTrimPeak,b[1]);assert.equal(d.maximumFiniteAbsoluteValue,b[1]);
  assert.equal(d.predictedPostTrimPeak,Math.fround(b[1]*trim.gain));
  assert.equal(d.context.minimumDistance,1.8);assert.equal(d.context.recentPoseDiscontinuities,3);
  const json=JSON.stringify(d);assert.ok(json.length<2000);assert.doesNotMatch(json,/private|do-not-retain|pcm|secret/);
  assert.equal(trim.stats.blocks,0);assert.equal(trim.stats.rejectedBlocks,1);
});
test('Nonfinite trim diagnostics distinguish NaN and infinities, and remain bounded across repeated failures',()=>{
  const trim=new BeaconOutputTrim(12);
  for(const [value,label] of [[NaN,'NaN'],[Infinity,'+Infinity'],[-Infinity,'-Infinity']]){
    assert.throws(()=>trim.apply(new Float32Array([.01,.02]),new Float32Array([value,.1]),
      {audioFrame:2048,pathCount:1,geometryMode:'C:\\untrusted',sourceGenerations:new Array(1000).fill(1)}),error=>{
      const d=error.diagnostic;assert.equal(error.code,'AUDITION_TRIM_NONFINITE');
      assert.equal(d.firstOffendingSample.originalSample,label);assert.equal(d.offendingAudioFrame,2048);
      assert.equal(d.firstOffendingSample.channel,'right');assert.equal(d.nonfiniteSamples,1);assert.equal(d.overCeilingSamples,0);
      assert.equal(d.context.geometryMode,null);assert.equal(d.context.sourceGenerations.length,16);
      assert.equal(d.maximumFiniteAbsoluteValue,Math.fround(.1));assert.equal(d.preTrimPeak,null);
      assert.equal(d.predictedPostTrimPeak,null);assert.equal(d.nonfiniteInputSamples,1);assert.ok(JSON.stringify(d).length<2000);return true;
    });
  }
  assert.equal(trim.stats.rejectedBlocks,3);assert.equal(trim.stats.lastFailure.firstOffendingSample.originalSample,'-Infinity');
});
test('Bounded failure context is lazy and collector failure cannot mask the acoustic guard',()=>{
  const trim=new BeaconOutputTrim(12);let calls=0;
  const collect=()=>{calls++;return {audioFrame:4096,recentWindowMs:1000,recentControlChanges:2};};
  trim.apply(new Float32Array([.01]),new Float32Array([.01]),collect);assert.equal(calls,0);
  assert.throws(()=>trim.apply(new Float32Array([.2]),new Float32Array([.01]),collect),error=>{
    assert.equal(error.diagnostic.offendingAudioFrame,4096);assert.equal(error.diagnostic.context.recentWindowMs,1000);
    assert.equal(error.diagnostic.contextCollectionFailed,false);return true;
  });
  assert.equal(calls,1);
  assert.throws(()=>trim.apply(new Float32Array([.2]),new Float32Array([.01]),()=>{throw Error('unrelated private detail');}),error=>{
    assert.equal(error.code,'AUDITION_TRIM_OVER_CEILING');assert.equal(error.diagnostic.contextCollectionFailed,true);
    assert.doesNotMatch(JSON.stringify(error.diagnostic),/private detail/);return true;
  });
});
test("Production CLI rejects incompatible audition profiles before PCM",()=>{
  for(const extra of [["--sources","2"],["--scene","enclosure"],["--listener-delay-ms","75"],["--experimental-orientation","50ms"]]){
    const p=spawnSync(process.execPath,["tools/Run-Acoustics07.mjs",...auditionSettings,"--listener-input","required",...extra],{encoding:"utf8",windowsHide:true,timeout:3000});
    assert.equal(p.error,undefined);assert.notEqual(p.status,0);assert.equal(p.stdout,"");assert.match(p.stderr,/Audition trim/);
  }
});
test("Actual producer gain is applied once, after unchanged acoustic and lifecycle controls",async()=>{
  const a=await runHeadless({extraArgs:settings}),b=await runHeadless({extraArgs:auditionSettings});
  assert.equal(b.exitCode,0);assert.deepEqual(spatialSchedule(a),spatialSchedule(b));
  let error=0;for(let i=0;i<a.left.length;i++)error=Math.max(error,Math.abs(b.left[i]-Math.fround(a.left[i]*10**.6)),Math.abs(b.right[i]-Math.fround(a.right[i]*10**.6)));
  assert.equal(error,0);assert.equal(b.final.outputTrim.rejectedBlocks,0);assert.ok(b.final.outputTrim.peakAfter<0.5);
  const c=await runHeadless({extraArgs:[...settings,"--beacon-output-trim-db","0"]});assert.equal(pcmHash(c),pcmHash(a));
});
test("Audition trim preserves delayed tails, stale/pause and terminal failure schedules",async()=>{
  for(const name of ["emission-stop","expired","pause","failure"]){
    const a=await runHeadless({name,extraArgs:settings}),b=await runHeadless({name,extraArgs:auditionSettings});
    assert.equal(b.exitCode,a.exitCode);assert.equal(b.final.error,a.final.error);assert.deepEqual(spatialSchedule(a),spatialSchedule(b));
    assert.equal(b.final.dsp.missingHistory,a.final.dsp.missingHistory);assert.equal(b.final.outputTrim.rejectedBlocks,0);
  }
});
