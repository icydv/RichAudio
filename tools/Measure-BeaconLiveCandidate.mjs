// Reconstruct the original audition recipe independently; compare without alignment/normalisation.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runHeadless, sequence } from "./audio/headless-stream.mjs";
import { pcmRingGain } from "./audio/pcm-ring-replay.mjs";
import { spatialSchedule, fundamentalPeak } from "./audio/beacon-analysis.mjs";
import { wav, audioMetrics } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const output=privateStoragePath(root,path.resolve(root,process.argv[2]??".local/beacon-live-match-new")),sink=process.argv[3];
if(!sink||fs.existsSync(output))throw Error("Compiled offline sink and fresh private output required");
fs.mkdirSync(output,{recursive:true});
const settings=["--beacon-frequency-hz","600","--beacon-level","0.44"],trimmed=[...settings,"--beacon-output-trim-db","24"],gain=10**1.2;
const expected={stationary:"1A395EE8C25D56DF68A39DF4582573BFE54060FC47B7C9E478C3EE9240920EF5",turn:"B7522B74E515CA404F765B68659B2B7EE0186A9D3792EA40E6CF3855129D8549"};
const hash=b=>createHash("sha256").update(b).digest("hex").toUpperCase();
const report={schema:1,scope:"silent pre-device audition-level match; not mixer/device/live validation",profile:{frequencyHz:600,sourceLevel:0.44,outputTrimDb:24,masterGain:0.20,preMasterPeakLimit:0.5,masterGainMaximum:0.25},comparisonRules:{maximumSampleDifference:(gain+1)/(2*32767)+1e-7,maximumAbsoluteRmsLevelDifferenceDb:0.1,noTimeAlignment:true,noNormalisation:true},results:[]};
for(const name of ["stationary","turn"]){
 const a=await runHeadless({name,extraArgs:settings}),b=await runHeadless({name,extraArgs:trimmed});
 assert.equal(a.exitCode,0);assert.equal(b.exitCode,0);assert.deepEqual(spatialSchedule(a),spatialSchedule(b));
 const old=pcmRingGain(sink,output,name+"-old",a,0.20),original=wav([old.left,old.right]);
 const audition=Buffer.from(original);
 for(let at=44;at<audition.length;at+=2){const q=Math.round(original.readInt16LE(at)*gain);assert.ok(Math.abs(q)<32767);audition.writeInt16LE(q,at);}
 assert.equal(hash(audition),expected[name],"Reconstructed audition must match the actual listened-to file");
 const reference={left:new Float32Array(a.left.length),right:new Float32Array(a.right.length)};
 for(let i=0;i<a.left.length;i++){reference.left[i]=audition.readInt16LE(44+i*4)/32767;reference.right[i]=audition.readInt16LE(46+i*4)/32767;}
 const candidate=pcmRingGain(sink,output,name+"-candidate",b,0.20);
 let maximumDifference=0,sumDifference=0;
 for(let i=0;i<candidate.left.length;i++)for(const k of ["left","right"]){const d=candidate[k][i]-reference[k][i];maximumDifference=Math.max(maximumDifference,Math.abs(d));sumDifference+=d*d;}
 const actual=audioMetrics([candidate.left,candidate.right]),target=audioMetrics([reference.left,reference.right]);
 const levelDifferenceDb=20*Math.log10(actual.rms/target.rms);
 assert.ok(maximumDifference<=report.comparisonRules.maximumSampleDifference);assert.ok(Math.abs(levelDifferenceDb)<=0.1);
 assert.equal(actual.clippedSamples,0);assert.equal(actual.nonfiniteSamples,0);assert.equal(b.final.dsp.missingHistory,0);assert.equal(b.final.outputTrim.rejectedBlocks,0);
 const bytes=wav([candidate.left,candidate.right]);
 fs.writeFileSync(path.join(output,name+"-audition-reference.wav"),audition,{flag:"wx"});
 fs.writeFileSync(path.join(output,name+"-live-equivalent.wav"),bytes,{flag:"wx"});
 fs.writeFileSync(path.join(output,name+"-candidate-trace.json"),JSON.stringify(b.trace),{flag:"wx"});
 report.results.push({name,auditionSha256:hash(audition),candidateWavSha256:hash(bytes),frames:b.left.length,sampleRate:48000,channels:2,candidate:actual,reference:target,levelDifferenceDb,maximumSampleDifference:maximumDifference,differenceRms:Math.sqrt(sumDifference/(2*b.left.length)),headroomDb:-20*Math.log10(actual.peak),fundamental:name==="stationary"?fundamentalPeak(candidate,600):null,outputTrim:b.final.outputTrim,missingHistory:b.final.dsp.missingHistory,limiterSamples:b.final.dsp.limited,nonPcmScheduleIdentical:true,acceleratedWallMs:b.sink.wallMs,dspMs:b.final.statistics.dspMs});
}
// Synthetic native-coordinate envelopes exercise the existing orientation-only mapping.
// All positions remain authored test data; no GTA observations are accessed.
const events=sequence("stationary",6);
for(const e of events){const angle=2*Math.PI*e.observation/6;Object.assign(e.message.state,{coordinates:"gta-native-unscaled",units:"native-unverified",listenerKind:"camera",velocityKind:"unavailable",forward:[-Math.cos(angle),-Math.sin(angle),0]});}
const sweep=await runHeadless({seconds:6,events,extraArgs:trimmed});
assert.equal(sweep.exitCode,0);assert.equal(sweep.final.statistics.listenerRejected,0);assert.equal(sweep.final.outputTrim.rejectedBlocks,0);assert.equal(sweep.final.dsp.missingHistory,0);
const swept=pcmRingGain(sink,output,"full-yaw",sweep,0.20),sm=audioMetrics([swept.left,swept.right]);
report.nativeOrientationSweep={seconds:6,observations:events.length,listenerMode:sweep.final.statistics.listenerMode,peak:sm.peak,rms:sm.rms,headroomDb:-20*Math.log10(sm.peak),preMasterPeak:sweep.final.outputTrim.peakAfter,preMasterCeiling:0.5,clippedSamples:sm.clippedSamples,nonfiniteSamples:sm.nonfiniteSamples,missingHistory:sweep.final.dsp.missingHistory,rejectedTrimBlocks:sweep.final.outputTrim.rejectedBlocks};
assert.ok(sm.peak<0.1);assert.equal(sm.clippedSamples,0);assert.equal(sm.nonfiniteSamples,0);
fs.writeFileSync(path.join(output,"metrics.json"),JSON.stringify(report,null,2),{flag:"wx"});
console.log(JSON.stringify(report));
