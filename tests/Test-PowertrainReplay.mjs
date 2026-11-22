import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startSoundMap} from '../tools/soundmap/server.mjs';

function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36 + samples.length * 4, 4);
  header.write('WAVEfmt ', 8);header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48000, 24);header.writeUInt32LE(384000, 28);
  header.writeUInt16LE(8, 32);header.writeUInt16LE(32, 34);
  header.write('data', 36);header.writeUInt32LE(samples.length * 4, 40);
  const pcm = Buffer.alloc(samples.length * 4);
  samples.forEach((value, index) => pcm.writeFloatLE(value, index * 4));
  return Buffer.concat([header, pcm]);
}
const soundMapFrame = (take, geometryGeneration = null, paths = []) => ({
  schemaVersion: 1, sessionId: take, streamId: take, sequence: 1, audioFrame: 512,
  geometryGeneration, paths, sources: [{id: 'engine', position: [0, 0, 0]}], listener: {position: [1, 0, 0], valid: true}
});
test('match original engine frames to both WAV takes and leave silent comparison gap clear', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'RichAudio-drive-'));
  const module = await import('../tools/soundmap/powertrain-replay.mjs').catch(() => ({}));
  assert.equal(typeof module.openPowertrainReplay, 'function', 'offline SoundMap replay adapter');
  let service;
  try {
    const names = ['wall-off', 'wall-on'];
    const samples = [[.25, -.25, .5, -.5], [.125, -.125, .375, -.375]];
    const comparison = {file: 'PLAY FIRST.wav', takes: names.map((take, index) => ({take, firstFrame: index * 3, frames: 2}))};
    const geometry = {schemaVersion: 1, generation: 'wall-1', sessionId: 'wall-on', streamId: 'wall-on',
      coordinateSpace: 'research-rh-z-up-metres-v1', surfaces: [{id: 'finite-wall', vertices: [[0, 1, 0], [1, 1, 0], [1, 1, 2]]}]};
    const reflection = {id: 'engine-reflection', sourceId: 'engine', status: 'selected', surfaceIds: ['finite-wall'], order: 1,
      vertices: [[0, 0, 0], [.5, 1, 0], [1, 0, 0]], points: [[.5, 1, 0]]};
    const voices = [{vehicle: 'stock-adder', model: 0xb779a091, context: 'player', observedGeneration: 1,
      voice: 'Bati development', operatingPoint: .75, engine: 'engine', exhaust: 'exhaust'}];
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({comparison}));
    names.forEach((name, index) => {
      fs.writeFileSync(path.join(root, name + '.wav'), wav(samples[index]));
      const frame = soundMapFrame(name, index ? geometry.generation : null, index ? [reflection] : []);
      fs.writeFileSync(path.join(root, 'soundmap-' + name + '.jsonl'),
        JSON.stringify({sampleFrame: 0, soundMapFrame: frame, voices, ...(index ? {soundMapGeometry: geometry} : {})}) + '\n');
    });
    const exactWav = wav([...samples[0], 0, 0, ...samples[1]]);
    fs.writeFileSync(path.join(root, comparison.file), exactWav);
    const recording = await module.openPowertrainReplay(root);
    service = await startSoundMap({root, port: 0, renderedReplay: recording});
    const {token, url} = service.descriptor;
    const request = (route, options = {}) => fetch(url + route, {...options, headers: {
      'X-RichAudio-Token': token, 'Content-Type': 'application/json', ...options.headers
    }});
    const opened = await request('/api/replay/open', {method: 'POST', body: JSON.stringify({id: recording.id})}).then(res => res.json());
    assert.equal(opened.audio.available, true);
    assert.equal(opened.durationMs, 5 / 48);
    const getFrame = sample => request('/api/replay/frame?timeMs=' + sample / 48).then(res => res.json());
    assert.equal((await getFrame(1)).frame.sessionId, 'wall-off');
    assert.equal((await getFrame(2)).frame, null);
    const second = await getFrame(3);
    assert.equal(second.frame.sessionId, 'wall-on');
    assert.equal(second.frame.audioFrame, 512);
    assert.deepEqual(second.frame.renderedVoices, voices);
    assert.deepEqual(second.frame.paths[0].points, [[.5, 1, 0]]);
    assert.equal(second.geometry.surfaces[0].id, 'finite-wall');
    const audio = await request('/api/replay/audio');
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()), exactWav);
    assert.equal((await request('/api/telemetry', {method: 'POST', body: '{}'})).status, 403);
    fs.writeFileSync(path.join(root, comparison.file), wav([...samples[0], .1, 0, ...samples[1]]));
    await assert.rejects(() => module.openPowertrainReplay(root), /silence/i);
  } finally {
    await service?.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
