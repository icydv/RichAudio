import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {VehicleAcousticPipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {distanceProbeScene} from './fixtures/vehicle-distance-probe.mjs';

const manifest = process.env.POWERTRAIN_MOTION_MANIFEST;
const producer = fileURLToPath(new URL('../tools/Run-Gameplay.mjs', import.meta.url));
const session = '1'.repeat(32);
const frequency = 10_000_000;
const directions = {forward: [0, 1, 0], up: [0, 0, 1]};
const playerId = 'test-adder';

async function runMotion(check) {
  const child = spawn(process.execPath, [producer, '--manifest', manifest, '--session', session],
    {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  const rows = [];
  const pcm = [];
  let pending = Buffer.alloc(0), blocks = 0, peak = 0, tagged = 0;
  const output = createInterface({input: child.stderr});
  const exited = once(child, 'exit');
  child.stdin.on('error', error => {
    if (error.code !== 'EPIPE') rows.push({type: 'stdin-fault', code: error.code});
  });
  output.on('line', line => {
    try { rows.push(JSON.parse(line)); }
    catch { rows.push({type: 'stderr', line}); }
  });
  child.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4112) {
      assert.equal(pending.toString('ascii', 0, 4), 'RA07');
      assert.equal(pending.readUInt32LE(4), blocks++);
      assert.equal(pending.readUInt32LE(8), 512);
      const tag = pending.readUInt32LE(12);
      if (tag > 0) tagged++;
      let blockPeak = 0;
      for (let i = 16; i < 4112; i += 4) blockPeak = Math.max(blockPeak, Math.abs(pending.readFloatLE(i)));
      peak = Math.max(peak, blockPeak);
      pcm.push({tag, peak: blockPeak});
      pending = pending.subarray(4112);
    }
  });
  async function waitFor(predicate) {
    const due = performance.now() + 5000;
    while (!predicate()) {
      if (child.exitCode !== null || rows.some(row => row.type === 'gameplay-error') || performance.now() >= due)
        throw Error(JSON.stringify(rows.filter(row => row.type === 'gameplay-error').at(-1) ?? rows.slice(-2)));
      await delay(2);
    }
  }
  const write = record => child.stdin.write(JSON.stringify(record) + '\n');
  try {
    await waitFor(() => rows.some(row => row.type === 'gameplay-ready'));
    const began = performance.now();
    let sequence = 0;
    async function pose({listenerShift = 0, sourceShift = 0, generation = 1,
      sourceGeneration = 1, vehicle = true, listenerSpeed = 0, sourceSpeed = 0, operatingPoint = .55,
      revision = 1, gate = 'voice'} = {}) {
      const ms = performance.now() - began;
      const observationTicks = Math.round((1000 + ms) * frequency / 1000);
      const listener = {
        version: 1, session, generation, sequence: sequence++, observationTicks, clockFrequency: frequency,
        gameTimeMs: Math.floor(ms), position: [listenerShift + listenerSpeed * ms / 1000, 0, 1.5],
        velocity: [listenerSpeed, 0, 0], ...directions,
        valid: true, paused: false, reason: 'valid', coordinates: 'gta-native-unscaled',
        units: 'native-unverified', listenerKind: 'camera', velocityKind: 'estimated-camera-difference',
        sourceId: null,
      };
      const vehicles = vehicle ? [{
        id: playerId, model: 0xb779a091, generation: sourceGeneration, context: 'player',
        observationTicks: observationTicks + 1000, position: [sourceShift + sourceSpeed * ms / 1000, 8, 1],
        velocity: [sourceSpeed, 0, 0], ...directions, valid: true, running: true, operatingPoint,
      }] : [];
      write({type: 'snapshot', ageMs: 0, validForMs: 220, frame: {
        version: 1, session, listener, vehicles, validThroughTicks: observationTicks + frequency / 4,
        powertrainRevision: revision, powertrainGate: gate,
      }});
      return listener.sequence;
    }
    async function render(count = 5) {
      const due = blocks + count;
      write({type: 'credit', blocks: count});
      await waitFor(() => blocks === due);
    }
    return await check({pose, render, waitFor, rows, pcm, exited, write, counters: () => ({blocks, peak, tagged})});
  } finally {
    if (child.exitCode === null) {
      child.stdin.end(JSON.stringify({type: 'stop'}) + '\n');
      await Promise.race([exited, delay(1000).then(() => child.kill())]);
    }
    await exited;
    output.close();
  }
}

async function warm({pose, render}, options) {
  for (let i = 0; i < 12; i++) {
    await pose(options);
    for (let b = 0; b < 5; b++) { await render(1); await delay(9); }
  }
}

test('a single emitted pulse arrives after the camera cut even though the continuing source is now quiet', async () => {
  const pipeline = new VehicleAcousticPipeline({
    scene: distanceProbeScene('authored-detail-loss-v1'),
    sourceIds: ['tailpipe'],
    continuousRates: true,
    preserveSourceHistoryOnListenerCut: true,
  });
  const listener = {position:[0,0,1], velocity:[0,0,0], ...directions, valid:true};
  const emitter = {...listener, id:'tailpipe', generation:1, position:[174,0,1]};
  const input = new Float32Array(512), left = new Float32Array(512), right = new Float32Array(512);
  const emission = 22*512+32;
  let arrival = -1;
  try {
    for (let block=0; block<90; block++) {
      const frame = block*512;
      await pipeline.prepare({time:frame/48000, session:'single-quiet-flight', generation:block<35?1:2,
        listener, sources:[emitter]});
      input.fill(0);
      if (block===22) input[emission-frame]=.9;
      pipeline.process({tailpipe:input}, left, right);
      const first = right.findIndex((v,i)=>Math.max(Math.abs(v),Math.abs(left[i]))>1e-8);
      if (first>=0 && arrival===-1) arrival=frame+first;
    }
    assert(Math.abs(arrival-(emission+174*48000/343))<=2, 'physical arrival retains original emission frame');
  } finally {
    pipeline.close();
  }
});

test('a far camera cut hears the moving vehicle\'s already-emitted pressure under the same lease', {skip: !manifest}, async () => {
  await runMotion(async rig => {
    const movement = {listenerSpeed:30,sourceSpeed:30};
    await warm(rig, movement);
    const cut = rig.pcm.length;
    await warm(rig, {...movement,generation: 2, listenerShift: 174});
    const heard = rig.pcm.slice(cut);
    const longSilence = heard.slice(8, 35)
      .filter(block => block.peak <= 1e-6 || block.tag === 0).length;
    assert.equal(longSilence, 0, 'a receiver cut must not restart half a second of source flight');
    const distant = Math.max(...heard.slice(20, 35).map(block => block.peak));
    const near = Math.max(...rig.pcm.slice(cut-10, cut).map(block => block.peak));
    assert(distant < near/2, 'the new receiver hears lower distant pressure');
  });
});

test('a new emitter lifetime cannot reuse the old pressure across a receiver cut', {skip: !manifest}, async () => {
  await runMotion(async rig => {
    const far = {listenerShift:174};
    await warm(rig, far);
    assert(rig.pcm.slice(-8).some(block=>block.peak>1e-6), 'the old emitter has arrived');
    const replaced = rig.pcm.length;
    const newSequence = await rig.pose({...far,generation:2,sourceGeneration:2});
    for(let i=0;i<12;i++){
      if(i)await rig.pose({...far,generation:2,sourceGeneration:2});
      for(let b=0;b<5;b++){await rig.render(1);await delay(9);}
    }
    assert(rig.pcm.slice(replaced,replaced+30).every(block=>block.peak===0), 'slot reuse cannot replay past emission');
    assert(rig.pcm.slice(replaced+10,replaced+30).every(block=>block.tag>=newSequence+1), 'qualification belongs to the new lifetime');
  });
});

test('authorized flight silence is tagged after a gain boundary without replaying old pressure', {skip: !manifest}, async () => {
  await runMotion(async rig => {
    const far = {listenerShift:174};
    await warm(rig, far);
    await warm(rig, {...far,revision:2,gate:'mute'});
    assert(rig.pcm.slice(-8).some(block=>block.peak>1e-6), 'there is retained pressure before resume');
    const before = rig.pcm.length;
    const resumeSequence = await rig.pose({...far,revision:3,gate:'voice'});
    for(let i=0;i<10;i++){
      if(i)await rig.pose({...far,revision:3,gate:'voice'});
      for (let b=0;b<5;b++){await rig.render(1);await delay(9);}
    }
    const flight = rig.pcm.slice(before+10,before+30);
    assert(flight.every(block=>block.peak===0), 'the old revision cannot arrive through the new gain boundary');
    assert(flight.every(block=>block.tag>=resumeSequence+1), 'actual silence has current authorized transport progress');
    const removed = rig.pcm.length;
    for(let i=0;i<3;i++){
      await rig.pose({...far,revision:3,gate:'voice',vehicle:false});
      for(let b=0;b<5;b++){await rig.render(1);await delay(9);}
    }
    assert(rig.pcm.slice(removed).every(block=>block.tag===0&&block.peak===0), 'removed source tails are not qualified or replayed');
  });
});

test('one-car producer keeps ordinary observed motion through PCM credit bursts',
  {skip: !manifest}, async () => {
    await runMotion(async (rig) => {
      await warm(rig, {listenerSpeed: 30, sourceSpeed: 30});
      // An authored refill pause advances observation time, while the next
      // producer credit still advances the PCM timeline by one block.
      await delay(84);
      await rig.pose({listenerSpeed: 30, sourceSpeed: 30});
      await rig.render();
      assert.ok(rig.counters().tagged > 20 && rig.counters().peak > 0);
      assert.equal(rig.rows.some(row => row.type === 'gameplay-error'), false);
    });
  });

test('high-rev diagnostics have a separate bounded record paired with their gameplay status', {skip: !manifest}, async () => {
  await runMotion(async rig => {
    await warm(rig, {operatingPoint:.91});
    await rig.waitFor(() => rig.rows.some(row => row.type === 'powertrain-voice-evidence' && row.voice.highRev?.rendered.length));
    const index = rig.rows.findIndex(row => row.type === 'powertrain-voice-evidence' && row.voice.highRev?.rendered.length);
    const status = rig.rows[index - 1];
    assert.equal(status.type, 'gameplay-status');
    assert.equal(status.status.powertrainEvidenceFrame, rig.rows[index].frame);
    assert.equal(status.status.powertrainVoiceEvidence, undefined);
    assert.ok(JSON.stringify(status).length <= 32768 && JSON.stringify(rig.rows[index]).length <= 32768);
  });
});

test('one-car producer accepts declared camera and source generations and retires a removed source',
  {skip: !manifest}, async () => {
    await runMotion(async (rig) => {
      await warm(rig, {});
      const beforeCut = rig.counters();
      // The camera cuts without replacing the car. A later independently
      // declared car generation can acquire at a different position.
      await warm(rig, {generation: 2, listenerShift: 10});
      await warm(rig, {generation: 2, listenerShift: 10, sourceGeneration: 2, sourceShift: 24});
      assert.ok(rig.counters().tagged > beforeCut.tagged + 20 && rig.counters().peak > 0,
        'declared generations rebuild paths after the cut');
      for (let i = 0; i < 3; i++) {
        await rig.pose({generation: 2, listenerShift: 10, vehicle: false});
        for (let b = 0; b < 5; b++) { await rig.render(1); await delay(9); }
      }
      const removed = rig.counters();
      await rig.pose({generation: 2, listenerShift: 10, vehicle: false});
      await rig.render();
      assert.equal(rig.counters().tagged, removed.tagged, 'removed source cannot qualify later PCM');
      assert.equal(rig.rows.some(row => row.type === 'gameplay-error'), false);
    });
  });

for (const [track, shift, expected] of [
  ['listener', {listenerShift: 500}, 'listener camera'],
  ['source', {sourceShift: 500}, 'source test-adder'],
]) {
  test(`one-car producer rejects an undeclared ${track} teleport on its input clock`,
    {skip: !manifest}, async () => {
      await runMotion(async (rig) => {
        await warm(rig, {});
        await rig.pose(shift);
        await assert.rejects(rig.render(), /undeclared position discontinuity/);
        const failure = rig.rows.find(row => row.type === 'gameplay-error').code;
        assert.ok(failure.includes(`input ${expected} g=1`), failure);
        assert.match(failure, /obs=\d+->\d+ qpcHz=10000000/);
      });
    });
}
