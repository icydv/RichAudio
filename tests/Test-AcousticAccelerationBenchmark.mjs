// CPU-only benchmark regression; hardware execution is verified separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {measureAcousticAcceleration} from '../tools/Measure-AcousticAcceleration.mjs';

test('the real CPU comparison driver preserves PCM and reports measured limits without device claims',async()=>{
  const output=path.join('.local','acoustic-benchmark-test-'+randomUUID());
  const {directory,report}=await measureAcousticAcceleration({output,quick:true,cpuOnly:true,
    scenes:['small'],qualities:['performance','max'],includeTransition:false});
  assert.equal(report.gameLaunched,false);assert.equal(report.audioEndpointOpened,false);assert.equal(report.hardwareExecutionVerified,false);
  assert.equal(report.cases.length,2);assert.equal(report.cases[0].pcmFloat32Sha256,report.cases[1].pcmFloat32Sha256);
  assert.equal(report.cases[0].controlSha256,report.cases[1].controlSha256);
  for(const c of report.cases){
    assert.equal(c.maximumPathCount,2);assert.equal(c.sourceHistoryResets,1);assert.equal(c.unavailableHistoryFrames,0);
    assert.equal(c.gpuResultsApplied,0);assert.equal(c.gpuAcousticDispatches,0);assert.equal(c.finalBackend.initializationAttempts,0);
    assert.equal(c.metrics.clippedSamples,0);assert.equal(c.metrics.nonfiniteSamples,0);assert.equal(c.limiterFrames,0);
    assert.equal(c.cursorResets,0);assert.equal(c.pathOverflow,0);assert.ok(c.steadyWindows>0);
    assert.ok(c.measuredWallMs>0&&c.combinedCpuMs>=0);assert.equal(c.simulationWorkMs.count,96);
    assert.equal(c.workerSchedulingLatencyMs,null);assert.equal(c.underruns.measured,false);assert.equal(c.underruns.count,null);
    const bytes=fs.readFileSync(path.join(directory,`small-${c.quality}-cpu.wav`));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt16LE(22),2);
  }
  assert.ok(fs.existsSync(path.join(directory,'result.json')));assert.ok(fs.existsSync(path.join(directory,'listen.html')));
  await assert.rejects(()=>measureAcousticAcceleration({output,quick:true,cpuOnly:true}),/Fresh/);
});

test('comparison output and workload selection remain private and bounded',async()=>{
  await assert.rejects(()=>measureAcousticAcceleration({output:'forbidden-benchmark-'+randomUUID(),cpuOnly:true}),/private/);
  await assert.rejects(()=>measureAcousticAcceleration({modes:['mock-gpu']}),/acceleration/);
  await assert.rejects(()=>measureAcousticAcceleration({qualities:['ultra']}),/quality/);
  await assert.rejects(()=>measureAcousticAcceleration({blocks:100000}),/block/);
  await assert.rejects(()=>measureAcousticAcceleration({cpuOnly:true,requireHardware:true}),/Hardware/);
});
