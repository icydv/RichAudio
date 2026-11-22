import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

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
      if (pending.readUInt32LE(12) > 0) tagged++;
      for (let i = 16; i < 4112; i += 4) peak = Math.max(peak, Math.abs(pending.readFloatLE(i)));
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
      sourceGeneration = 1, vehicle = true, listenerSpeed = 0, sourceSpeed = 0} = {}) {
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
        velocity: [sourceSpeed, 0, 0], ...directions, valid: true, running: true, operatingPoint: .55,
      }] : [];
      write({type: 'snapshot', ageMs: 0, validForMs: 220, frame: {
        version: 1, session, listener, vehicles, validThroughTicks: observationTicks + frequency / 4,
        powertrainRevision: 1, powertrainGate: 'voice',
      }});
    }
    async function render(count = 5) {
      const due = blocks + count;
      write({type: 'credit', blocks: count});
      await waitFor(() => blocks === due);
    }
    return await check({pose, render, waitFor, rows, exited, write, counters: () => ({blocks, peak, tagged})});
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
