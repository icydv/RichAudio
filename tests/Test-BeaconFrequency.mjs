import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validateBeaconFrequencyHz, DEFAULT_BEACON_FREQUENCY_HZ, DEFAULT_BEACON_LEVEL, validateBeaconLevel } from "../src/acoustics/streaming/beacon-frequency.mjs";
import { runHeadless, sequence } from "../tools/audio/headless-stream.mjs";
import { pcmHash, spatialSchedule, fundamentalPeak, spectralPower, envelope, verifyWav } from "../tools/audio/beacon-analysis.mjs";
import { wav } from "../src/acoustics/engine/signals.mjs";

test("Owned frequency bounds reject invalid configuration; defaults remain 95Hz", () => {
  assert.equal(DEFAULT_BEACON_FREQUENCY_HZ, 95);
  assert.equal(DEFAULT_BEACON_LEVEL,0.22);
  for(const x of [0,0.22,0.44,0.5])assert.equal(validateBeaconLevel(x),x);
  for(const x of [NaN,Infinity,-0.01,0.501,null,"0.44"])assert.throws(()=>validateBeaconLevel(x));
  for (const x of [20, 95, 600, 2000]) assert.equal(validateBeaconFrequencyHz(x), x);
  for (const x of [NaN, Infinity, -1, 0, 19.99, 2000.01, null, "600"])
    assert.throws(() => validateBeaconFrequencyHz(x));
});

for (const [name, sources, expected] of [
  ["stationary", 1, "a709f3c3259e4718b6e398d0ddef34a3490e4252a5f4836f2538986b6cf5ffb1"],
  ["turn", 1, "3c55655835ec10d7e51da89c7c364cd0ae0c6280b38538fe52407ea3ea2d4253"],
  ["stationary", 4, "a14578477eebc9dd86c39d398297ff8a1a442d1bf6b8f726060e49050e7e6d3e"],
]) test(`PR58 default PCM fingerprint preserved: ${name}, ${sources} sources`, async () => {
  const r = await runHeadless({ name, sources, seconds: 3 });
  assert.equal(r.exitCode, 0); assert.equal(pcmHash(r), expected);
  assert.equal(r.final.beaconFrequencyHz, 95);
  assert.equal(r.final.beaconLevel,0.22);
});

test("Actual producer rejects bad frequency arguments before rendering", () => {
  for (const args of [["0"], ["NaN"], ["2001"], [], ["600", "--beacon", "pulse"]]) {
    const p = spawnSync(process.execPath, ["tools/Run-Acoustics07.mjs", "--beacon-frequency-hz", ...args], { encoding: "utf8", windowsHide: true, timeout: 3000 });
    assert.equal(p.error, undefined); assert.notEqual(p.status, 0); assert.equal(p.stdout, "");
    assert.match(p.stderr, /[Ff]requency/);
  }
  for (const level of ["NaN","-0.1","0.51"]) {
    const p=spawnSync(process.execPath,["tools/Run-Acoustics07.mjs","--beacon-level",level],{encoding:"utf8",windowsHide:true,timeout:3000});
    assert.equal(p.error,undefined);assert.notEqual(p.status,0);assert.equal(p.stdout,"");assert.match(p.stderr,/[Ll]evel/);
  }
});

test("600Hz reaches real reflected PCM deterministically without changing acoustic controls", async () => {
  const base = await runHeadless({ seconds: 3 });
  const config = { seconds: 3, extraArgs: ["--beacon-frequency-hz", "600", "--beacon-level", "0.44"] };
  const a = await runHeadless(config), b = await runHeadless(config);
  const frequencyOnly=await runHeadless({seconds:3,extraArgs:["--beacon-frequency-hz","600"]});
  let scalingError=0;
  for(let i=24000;i<a.left.length;i++)scalingError=Math.max(scalingError,Math.abs(a.left[i]-2*frequencyOnly.left[i]),Math.abs(a.right[i]-2*frequencyOnly.right[i]));
  assert.equal(scalingError,0);
  assert.equal(a.exitCode, 0); assert.equal(pcmHash(a), pcmHash(b));
  assert.deepEqual(spatialSchedule(a), spatialSchedule(base));
  assert.equal(a.final.statistics.pathMaximum, 2);
  assert.ok(a.trace.some(t => t.pathPresentation.some(p => p.order === 1)));
  assert.equal(fundamentalPeak(a, 600).frequencyHz, 600);
  const encoded=wav([a.left,a.right]),decoded=verifyWav(encoded,a);
  assert.equal(decoded.frames,a.left.length);assert.equal(fundamentalPeak(decoded.decoded,600).frequencyHz,600);
  assert.throws(()=>verifyWav(encoded.subarray(0,encoded.length-1),a));
  for (const hz of [600, 1200, 1800]) assert.ok(spectralPower(a, hz) > spectralPower(a, hz + 5) * 10000);
  assert.equal(a.final.dsp.missingHistory, 0); assert.equal(a.final.dsp.limited, 0);
  const e = envelope(a); assert.equal(e.zeroWindows, 0); assert.ok(e.minimumRms / e.maximumRms > 0.999);
});

test("600Hz retains start, emission mute/resume, delayed stop tails and terminal Stop", async () => {
  const events = sequence("stationary", 4);
  for (const [receipt, command] of [[1,"start"],[1.6,"mute"],[2.1,"resume"],[2.7,"emit-stop"],[3.6,"stop"]])
    events.push({ receipt, message: { type: "control", command } });
  events.sort((a,b) => a.receipt-b.receipt);
  const r = await runHeadless({ events, autoStart: false, extraArgs: ["--beacon-frequency-hz","600","--beacon-level","0.44"] });
  const energy = (a,b) => r.left.slice(a*48000,b*48000).reduce((s,x) => s+x*x,0);
  assert.equal(r.exitCode,0); assert.equal(energy(0,0.95),0);
  assert.ok(energy(1.3,1.5)>0); assert.ok(energy(1.61,1.64)>0,"valid emitted tail remains");
  // The existing 10ms exponential emission ramp retains subnormal/tiny tails;
  // 300ms later, energy must be below 1e-20 of the steady window, not exactly zero.
  assert.ok(energy(1.9,2.05)<energy(1.3,1.5)*1e-20); assert.ok(energy(2.4,2.6)>0);
  assert.ok(energy(3.1,3.4)<energy(2.4,2.6)*1e-20);
  assert.ok(r.left.length<4*48000); assert.equal(r.final.dsp.missingHistory,0);
});

test("Existing four-source cap workload supports opt-in frequency without path overflow", async () => {
  const a = await runHeadless({sources:4,seconds:3});
  const b = await runHeadless({sources:4,seconds:3,extraArgs:["--beacon-frequency-hz","600","--beacon-level","0.44"]});
  assert.deepEqual(spatialSchedule(a),spatialSchedule(b));
  assert.equal(b.exitCode,0);assert.equal(b.final.dsp.missingHistory,0);assert.equal(b.final.dsp.pathOverflow,0);
  assert.ok(b.final.dsp.peak<1);assert.equal(b.final.dsp.limited,0);
});

test("600Hz never keeps expired listener paths alive or conceals terminal input failure", async () => {
  for (const name of ["expired","failure"]) {
    const a = await runHeadless({name}), b = await runHeadless({name,extraArgs:["--beacon-frequency-hz","600"]});
    assert.deepEqual(spatialSchedule(a),spatialSchedule(b));
    assert.equal(b.exitCode,a.exitCode); assert.equal(b.final.error,a.final.error);
    assert.equal(b.final.dsp.missingHistory,a.final.dsp.missingHistory);
  }
});
