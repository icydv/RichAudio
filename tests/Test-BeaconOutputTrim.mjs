import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { BeaconOutputTrim, validateAuditionProfile } from "../src/acoustics/streaming/beacon-output-trim.mjs";
import { runHeadless } from "../tools/audio/headless-stream.mjs";
import { pcmHash, spatialSchedule } from "../tools/audio/beacon-analysis.mjs";
const profile={outputTrimDb:24,sources:1,scene:"open-road",beacon:"harmonic",frequencyHz:600,level:0.44,delayMs:100,orientation:false,required:true};
const settings=["--beacon-frequency-hz","600","--beacon-level","0.44"];
export const auditionSettings=[...settings,"--beacon-output-trim-db","24"];
test("Audition boost is disabled bit-transparently by default",()=>{
  const trim=new BeaconOutputTrim(),a=new Float32Array([0,-0,0.2,-0.2]),b=a.slice();const bytes=Buffer.from(a.buffer).toString("hex");trim.apply(a,b);
  assert.equal(Buffer.from(a.buffer).toString("hex"),bytes);assert.equal(trim.stats.blocks,0);
});
test("Only the fixed profile can request +24dB; no arbitrary gain extension",()=>{
  validateAuditionProfile(profile);
  for(const change of [{outputTrimDb:25},{outputTrimDb:NaN},{sources:4},{scene:"urban-street"},{frequencyHz:95},{level:0.5},{delayMs:75},{orientation:true},{required:false}])assert.throws(()=>validateAuditionProfile({...profile,...change}));
  for(const db of [-1,1,23,25,NaN,Infinity])assert.throws(()=>new BeaconOutputTrim(db));
});
test("Gain is explicit and over-ceiling/nonfinite blocks are rejected atomically",()=>{
  const t=new BeaconOutputTrim(24),a=new Float32Array([0.01,-0.02]),b=a.slice();t.apply(a,b);
  assert.equal(a[0],Math.fround(Math.fround(0.01)*10**1.2));assert.equal(t.stats.rejectedBlocks,0);
  for(const bad of [0.04,-0.04,NaN,Infinity]){
    const left=new Float32Array([0.001,0.002]),right=new Float32Array([0.001,bad]),before=left.slice();
    assert.throws(()=>t.apply(left,right));assert.deepEqual(left,before);assert.ok(Object.is(right[1],Math.fround(bad)));
  }
  assert.equal(t.stats.rejectedBlocks,4);
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
  let error=0;for(let i=0;i<a.left.length;i++)error=Math.max(error,Math.abs(b.left[i]-Math.fround(a.left[i]*10**1.2)),Math.abs(b.right[i]-Math.fround(a.right[i]*10**1.2)));
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
