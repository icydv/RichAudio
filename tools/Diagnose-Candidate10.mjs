// Read the preserved, sealed live failure; emit aggregates, never PCM or paths.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [input,output]=process.argv.slice(2),directory=path.resolve(input),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const read=name=>fs.readFileSync(path.join(directory,name));
const json=name=>JSON.parse(read(name));
assert.equal(hash(read('candidate.json')),'3992EB78AD36E40411D2354418E240111477D5ADA75016173D03A2941272B7EA');
const candidate=json('candidate.json');assert.equal(candidate.sourceHead,'247e7ff2af8f1670ba454ae303ba56cb4f16fb19');
for(const relative of ['src/acoustics/streaming/causal.mjs','src/acoustics/streaming/startup-gate.mjs','src/acoustics/streaming/beacon-output-trim.mjs','tools/Run-Acoustics07.mjs']){
  const file=path.join(directory,'app',relative),binding=candidate.bindings.find(b=>b.Path.toLowerCase()===file.toLowerCase());
  assert.ok(binding);assert.equal(hash(fs.readFileSync(file)),binding.SHA256);
}
const host=json('app/.local/host-live-01/host-result.json');
const lines=read('app/.local/host-live-01/renderer-diagnostics.txt').toString().trim().split(/\r?\n/).filter(x=>x.startsWith('{')).map(JSON.parse);
const final=lines.findLast(x=>x.type==='final');assert.ok(final);
const operatorEvents=read('observations/listening-operator/events.jsonl').toString().trim().split(/\r?\n/).map(JSON.parse);
const recordings=operatorEvents.filter(e=>e.type==='recording-started');assert.equal(recordings.length,1);
assert.match(recordings[0].id,/^session-\d+-[a-f0-9-]{36}$/);
const recording=path.join('app','.local','soundmap',recordings[0].id);
const manifest=json(path.join(recording,'manifest.json'));
assert.deepEqual(Object.keys(manifest.integrity.files).sort(),['timeline.jsonl','events.jsonl','audio-index.jsonl','owned-output.f32le'].sort());
for(const [file,integrity] of Object.entries(manifest.integrity.files)){
  assert.ok(['timeline.jsonl','events.jsonl','audio-index.jsonl','owned-output.f32le'].includes(file));
  const bytes=read(path.join(recording,file));assert.equal(bytes.length,integrity.bytes);assert.equal(hash(bytes),integrity.sha256.toUpperCase());
}
const events=read(path.join(recording,'events.jsonl')).toString().trim().split(/\r?\n/).map(JSON.parse);
const timeline=read(path.join(recording,'timeline.jsonl')).toString().trim().split(/\r?\n/).map(JSON.parse).filter(x=>!x.cachedContext);
const frames=timeline.map(x=>x.frame),sorted=a=>a.filter(Number.isFinite).sort((x,y)=>x-y);
const summary=a=>{const s=sorted(a);return {count:s.length,median:s[Math.floor(s.length*.5)]??null,p95:s[Math.floor(s.length*.95)]??null,maximum:s.at(-1)??null};};
const changes=key=>frames.slice(1).flatMap((f,i)=>{const a=frames[i].listenerObservation,b=f.listenerObservation;
  return a&&b&&a.clockFrequency===b.clockFrequency&&a.sequence!==b.sequence?[(b[key]-a[key])*1000/b.clockFrequency]:[];});
const anchor=host.ownedRecorder;
const observationToPublished=frames.flatMap(f=>{const o=f.listenerObservation;
  if(!o||o.clockFrequency!==anchor.qpcFrequency)return [];
  return [f.producedAtUnixMs-(anchor.anchorUnixMs+(o.observationTicks-anchor.anchorQpcTicks)*1000/o.clockFrequency)];});
const producerStop=events.find(e=>e.type==='producer-stop'),underflow=events.find(e=>e.type==='audio-discontinuity'),hostStop=events.find(e=>e.type==='host-capture-stop');
assert.ok(Number.isFinite(final.dsp.peak)&&final.dsp.limited===0&&final.outputTrim.rejectedBlocks===1);
const trimGain=10**(final.outputTrim.db/20),threshold=final.outputTrim.peakLimit/trimGain;
assert.ok(final.dsp.peak>threshold&&final.outputTrim.peakBefore<threshold);
assert.equal(final.frames,(final.statistics.blocks+1)*512);
const result={schemaVersion:1,sourceCommit:candidate.sourceHead,scope:'Sanitized diagnosis of the preserved Candidate 10 failure; no live operation',
  achievement:{humanConfirmedAudible:true,listenerPacketsAccepted:host.transport.accepted,listenerPacketsRejected:host.transport.rejected,sourceContextInitialized:true,conditionalDirectWorked:true,restorationVerified:json('restoration/independent.json').Pass},
  rejection:{originalError:final.error,guard:final.outputTrim.peakLimit,trimDb:final.outputTrim.db,
    cumulativeRawDspPeak:final.dsp.peak,largestAcceptedPreTrimPeak:final.outputTrim.peakBefore,preTrimThreshold:threshold,
    finiteOverCeilingEstablished:true,classificationBasis:'The sealed renderer accumulates raw peak before Float32 output. Nonfinite raw output would poison that cumulative peak; the retained finite maximum exceeds the unchanged guard threshold and the accepted-block maximum. The final processed 512-frame block was not published. Finite startup multipliers and +12 dB cannot produce a nonfinite value from this bounded input.',
    rejectedBlockStart:final.statistics.blocks*512,rejectedBlockEndExclusive:final.frames,
    exactOffendingSampleIndex:null,channel:null,rejectedFloat32Value:null,
    remainingUncertainty:'Exact offending sample, channel and unsampled path/pose state were not retained. Close-range point-source gain reproduces the same finite guard failure, but is not a reconstruction of every historical control.'},
  chronology:{recordingRelativeMs:{producerStop:producerStop.timeMs,firstUnderflow:underflow.timeMs,hostCaptureStop:hostStop.timeMs},
    guardPrecedesUnderflowEventReceiptMs:underflow.timeMs-producerStop.timeMs,receiptScope:'SoundMap server receipt times of producer-stop and audio-discontinuity events, not exact guard execution-to-device timing',underflowFrames:host.audio.underflowFrames,
    hostPrimary:host.primaryFailure,hostSecondary:host.secondaryFailures,
    attribution:'Renderer guard rejection precedes PCM exhaustion; terminal starvation and underflow follow. The independently earlier processing miss is not relabelled as that terminal cause.'},
  historicalTiming:{nominalListenerHz:20,acceptedPerHostWallSecond:host.transport.accepted/host.durationWallSeconds,
    sampledObservationIntervalMs:summary(changes('observationTicks')),sampledObservationCaveat:'SoundMap deliberately samples about 16 Hz; these gaps include skipped genuine observations and are not the complete RPH getter cadence.',
    observationToSolverPublicationMs:summary(observationToPublished),publicationClockCaveat:'Retained playout-bracket observation to solver publication, including configured 100 ms playout and observation bracketing. Do not add that 100 ms twice. Same-host UTC/QPC anchor conversion has millisecond wall-clock/anchor uncertainty and is not speaker time.',
    firstAcceptedNativeDecisionAgeMs:host.transport.diagnostic.FirstAcceptedFrame.DecisionAgeMs,
    maximumMeasuredRelayRoundTripMs:host.geometryRelay.maximumAcceptedRoundTripMs,
    maximumProducerReceiptAgeMs:final.statistics.maxReceiptAgeMs,maximumNodeQueueAgeMs:final.statistics.maxNodeQueueAgeMs,
    nodeQueueCaveat:'Historical geometry snapshot bypassed its Node queue aggregate; zero is unavailable evidence, not proof of zero queue latency.',
    configuredListenerPlayoutMs:100,audioBlockMs:512/48,controlCadenceFrames:final.statistics.controlCadenceFrames,
    workerMs:summary(frames.map(f=>f.performance?.workerMs)),workerRoundTripMs:summary(frames.map(f=>f.producer?.workerSchedulingMilliseconds)),
    sampledProducerProcessingMs:summary(frames.map(f=>f.producer?.processingMilliseconds)),
    pcmInitialCreditFrames:4*512,pcmInitialCreditDurationMs:4*512/48,pcmRingCapacityFrames:8*512,
    ringOccupancyCaveat:'Historical queue occupancy was not retained. The 42.67 ms credit window is capacity/lead, not a constant delay measurement.',
    endpointBufferMs:host.audio.endpointBufferMilliseconds,reportedStreamLatencyMs:host.audio.streamLatencyMilliseconds,devicePeriodMs:host.audio.devicePeriodMilliseconds,
    physicalPropagationMsRange:[Math.min(...frames.flatMap(f=>f.paths.filter(p=>p.status==='selected').map(p=>p.delay*1000))),Math.max(...frames.flatMap(f=>f.paths.filter(p=>p.status==='selected').map(p=>p.delay*1000)))],
    qualityDeadlineMisses:final.acousticSettings.qualityDeadlineMisses,maximumProcessingMs:final.acousticSettings.qualityMaximumMs,speakerToEarLatencyMeasured:false},
  camera:{poseRejectionsAtFirstRecordedFrame:frames[0].geometryStatus?.stats?.poseRejected??null,totalPoseRejections:final.geometry.stats.poseRejected,
    assessment:'Original timestamps, complete rejected block poses and per-observation generation transitions were not retained; no weakening of identity, freshness or 100 m/s discontinuity guards is justified.'},
  recording:{frames:manifest.audio.capturedFrames,seconds:manifest.audio.capturedFrames/48000,allFourHashesMatched:true,filesFinalized:manifest.integrity.complete,gaps:manifest.audio.gaps,completePlannedSession:false},
  noSensingOrGpu:{geometryAccepted:final.geometry.stats.accepted,gpuDispatches:final.acousticSettings.gpuAcousticDispatches}};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({finiteOverCeilingEstablished:true,exactSampleRetained:false,guardPrecedesUnderflowEventReceiptMs:result.chronology.guardPrecedesUnderflowEventReceiptMs,filesVerified:4}));
