import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
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
const session = '0547bc5b0e254afabd4f2385fd6d1623';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const soundMapFrame = (take, geometryGeneration = null, paths = []) => ({
  schemaVersion: 1, sessionId: session + ':' + take, streamId: take, sequence: 1, audioFrame: 512,
  geometryGeneration, paths, sources: [{id: 'engine', position: [0, 0, 0]}], listener: {position: [1, 0, 0], valid: true}
});

test('traffic replay seeks exact PCM blocks between sparse map observations and after slot reuse', async () => {
  const {openPowertrainReplay} = await import('../tools/soundmap/powertrain-replay.mjs');
  const {replayFrame} = await import('../tools/soundmap/recorder.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'RichAudio-traffic-'));
  try {
    const wave = wav(Array(4 * 512 * 2).fill(.125));
    const file = 'traffic in the passage.wav';
    fs.writeFileSync(path.join(root, file), wave);
    const bank = {};
    function life(index, generation) {
      const vehicle = 'car-' + index, engine = 'stock:slot' + index + ':engine', exhaust = engine.replace('engine', 'exhaust');
      const voice = {vehicle, engine, exhaust, voice:'Bati', model:1, context:'npc', observedGeneration:generation,
        operatingPoint:.5, renderGeneration:generation + 1};
      bank[vehicle + '@' + generation] = {vehicle, model:1, context:'npc', generation, renderGeneration:generation + 1,
        slot:index, firstBlock:generation === 2 ? 2 : 0, lastBlock:index === 4 && generation === 1 ? 0 : 2,
        donor:'Bati traffic', bankSHA256:'1'.repeat(64), source:[engine, exhaust]};
      return voice;
    }
    const traffic = Array.from({length:5}, (_, i) => life(i, 1));
    const reused = life(4, 2);
    const voices = [traffic, traffic, [...traffic.slice(0,4), reused], []];
    const records = [0,2,3].map(i => ({sampleFrame:i*512, voices:voices[i], appliedPaths:[],
      soundMapFrame:{...soundMapFrame('traffic'), sequence:i+1, audioFrame:512+i*512,
        sources:voices[i].flatMap(v => [v.engine, v.exhaust].map(id => ({
          id, generation:4294967296 + v.renderGeneration, position:[0,0,0]})))}}));
    const timeline = records.map(row => JSON.stringify(row)).join('\n') + '\n';
    fs.writeFileSync(path.join(root,'soundmap-traffic.jsonl'),timeline);
    const ledger = {schema:1, sampleRate:48000, blockFrames:512, blocks:voices.map((active,i) => ({
      sampleFrame:i*512, voices:active.map(v => ({vehicle:v.vehicle, engine:v.engine, exhaust:v.exhaust,
        generation:v.observedGeneration,renderGeneration:v.renderGeneration,nonzeroFrames:512,pcmPeak:.05,
        releasing:i===1 && v===traffic[4]}))}))};
    const result = {session, stages:{traffic:{file, frames:2048, soundMapFrames:3, wavSHA256:sha256(wave),
      timelineSHA256:sha256(timeline), voices:bank}},contributions:{file:'contributions.json'}};
    const writeLedger = () => {
      const json = JSON.stringify(ledger);
      fs.writeFileSync(path.join(root,'contributions.json'),json);
      result.contributions.sha256=sha256(json);
      fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result));
    };
    writeLedger();
    const replay=await openPowertrainReplay(root,'traffic');
    const tail=replayFrame(replay,513/48);
    assert.equal(tail.frame.takeSampleFrame,0);
    assert.equal(tail.pcmBlock.sampleFrame,512);
    assert.equal(tail.pcmBlock.voices[4].releasing,true);
    const recycled=replayFrame(replay,1024/48);
    assert.equal(recycled.pcmBlock.voices[4].generation,2);
    assert.deepEqual(replayFrame(replay,1700/48).pcmBlock.voices,[]);
    assert.equal(replayFrame(replay,2048/48).pcmBlock,null);
    ledger.blocks[2].voices[4].generation=1;
    ledger.blocks[2].voices[4].renderGeneration=2;
    writeLedger();
    await assert.rejects(() => openPowertrainReplay(root,'traffic'), /source lifetime or release/);
    fs.appendFileSync(path.join(root,'contributions.json'),' ');
    await assert.rejects(() => openPowertrainReplay(root,'traffic'), /digest differs/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('three matched takes bind ordered reflections and withheld controls to the original mixer block', async () => {
  const {openPowertrainReplay} = await import('../tools/soundmap/powertrain-replay.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'RichAudio-reflections-'));
  const names = ['direct', 'single', 'multi'];
  const pcm = Array.from({length: 1024}, (_, n) => n % 2 ? -.125 : .25);
  const wave = wav(pcm), stages = {}, comparison = {file: 'comparison.wav', takes: []};
  const mixed = [], contacts = [[0, 1, 0], [1, -1, 0], [2, 1, 0]];
  const ids = ['north', 'south', 'north'];
  try {
    for (const [index, take] of [...names, 'withheld'].entries()) {
      const generation = take + '-walls';
      const geometry = {schemaVersion: 1, generation, sessionId: session + ':' + take, streamId: take,
        coordinateSpace: 'research-rh-z-up-metres-v1', surfaces: ['north','south'].map((id,i) => ({
          id, vertices: [[0, 1-2*i, -1], [3, 1-2*i, -1], [0, 1-2*i, 2]]}))};
      const paths = (take === 'multi' ? [0, 1, 3] : take === 'direct' ? [0] : [0, 1]).map(order => ({
        id: 'engine-' + order, sourceId: 'engine', status: 'selected', order, surfaceIds: ids.slice(0, order),
        points: contacts.slice(0, order), vertices: [[0,0,0], ...contacts.slice(0,order), [3,0,0]],
        delay: .01 * (1 + order), distance: 3 * (1 + order), arrivalDirection: [-1,0,0], bands: [.5,.4,.3]}));
      const appliedPaths = paths.map(({id,sourceId,order}) => ({id,sourceId,order,atFrame: 1024,
        gainBands: [.45,.35,.25], delayMs: (1 + order) * 10.1, pan: -.4}));
      const timeline = JSON.stringify({sampleFrame: 0, soundMapFrame: soundMapFrame(take, generation, paths),
        soundMapGeometry: geometry, appliedPaths}) + '\n';
      fs.writeFileSync(path.join(root, 'soundmap-' + take + '.jsonl'), timeline);
      fs.writeFileSync(path.join(root, take + '.wav'), wave);
      stages[take] = {frames: 512, soundMapFrames: 1, timelineSHA256: sha256(timeline), wavSHA256: sha256(wave)};
      if (take === 'multi') stages.multi.witness = {sampleFrame: 0, reflected: paths[2], direct: paths[0]};
      if (index < 3) {
        if (index) mixed.push(0,0);
        comparison.takes.push({take, firstFrame: mixed.length/2, frames: 512});
        mixed.push(...pcm);
      }
    }
    const file = wav(mixed);
    comparison.sha256 = sha256(file);
    fs.writeFileSync(path.join(root, comparison.file), file);
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({session, comparison, stages}));
    const replay = await openPowertrainReplay(root);
    const event = replay.events.find(e => e.detail?.pathId === 'engine-3');
    assert.equal(event.timeMs, 1026 / 48);
    assert.deepEqual(event.detail.surfaceIds, ids);
    const frame = replay.frames.find(row => row.timeMs === event.timeMs).frame;
    assert.deepEqual(frame.paths.find(p => p.id === event.detail.pathId).points, contacts);
    assert.equal(frame.appliedPaths.find(p => p.id === event.detail.pathId).atFrame, 1024);
    assert.equal(frame.takeSampleFrame, 0);
    const withheld = await openPowertrainReplay(root, 'withheld');
    assert(withheld.events.some(e => e.detail?.withheldPathId === 'engine-3'));
    assert.equal(withheld.frames[0].frame.appliedPaths.length, 2);
    const timelineFile = path.join(root,'soundmap-multi.jsonl');
    const packet = JSON.parse(fs.readFileSync(timelineFile));
    fs.copyFileSync(path.join(root,'soundmap-single.jsonl'),timelineFile);
    fs.writeFileSync(path.join(root,'result.json'), JSON.stringify({
      kind: 'mapped-installed-vehicle-drive', session, stages: {multi: stages.single}}));
    const roadside = await openPowertrainReplay(root, 'multi');
    assert.deepEqual(roadside.events.filter(e => e.detail).map(e => [e.type,e.detail.surfaceIds]),
      [['Single reflection',['north']]]);
    packet.appliedPaths.at(-1).sourceId = 'another-engine';
    const changed = JSON.stringify(packet) + '\n';
    stages.multi.timelineSHA256 = sha256(changed);
    fs.writeFileSync(timelineFile, changed);
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({session, comparison, stages}));
    await assert.rejects(() => openPowertrainReplay(root), /applied.*source|source.*applied/i);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
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
    const geometry = {schemaVersion: 1, generation: 'wall-1', sessionId: session + ':wall-on', streamId: 'wall-on',
      coordinateSpace: 'research-rh-z-up-metres-v1', surfaces: [{id: 'finite-wall', vertices: [[0, 1, 0], [1, 1, 0], [1, 1, 2]]}]};
    const reflection = {id: 'engine-reflection', sourceId: 'engine', status: 'selected', surfaceIds: ['finite-wall'], order: 1,
      vertices: [[0, 0, 0], [.5, 1, 0], [1, 0, 0]], points: [[.5, 1, 0]]};
    const voices = [{vehicle: 'stock-adder', model: 0xb779a091, context: 'player', observedGeneration: 1,
      voice: 'Bati development', operatingPoint: .75, engine: 'engine', exhaust: 'exhaust'}];
    const stages = {};
    names.forEach((name, index) => {
      const wave = wav(samples[index]);
      fs.writeFileSync(path.join(root, name + '.wav'), wave);
      const frame = soundMapFrame(name, index ? geometry.generation : null, index ? [reflection] : []);
      const timeline = JSON.stringify({sampleFrame: 0, soundMapFrame: frame, voices, ...(index ? {soundMapGeometry: geometry} : {})}) + '\n';
      fs.writeFileSync(path.join(root, 'soundmap-' + name + '.jsonl'), timeline);
      stages[name] = {frames: 2, soundMapFrames: 1, wavSHA256: sha256(wave), timelineSHA256: sha256(timeline)};
    });
    const exactWav = wav([...samples[0], 0, 0, ...samples[1]]);
    comparison.sha256 = sha256(exactWav);
    const result = {session, comparison, stages};
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result));
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
    assert.equal((await getFrame(1)).frame.sessionId, session + ':wall-off');
    assert.equal((await getFrame(2)).frame, null);
    const second = await getFrame(3);
    assert.equal(second.frame.sessionId, session + ':wall-on');
    assert.equal(second.frame.audioFrame, 512);
    assert.deepEqual(second.frame.renderedVoices, voices);
    assert.deepEqual(second.frame.paths[0].points, [[.5, 1, 0]]);
    assert.equal(second.geometry.surfaces[0].id, 'finite-wall');
    const roundedBrowserTimeMs = Math.floor(3 * 1000000 / 48000) / 1000;
    const witness = await request('/api/replay/frame?timeMs=' + roundedBrowserTimeMs).then(res => res.json());
    assert.equal(witness.frame?.sessionId, session + ':wall-on', 'a browser seek within half a sample resolves the intended take');
    assert.equal(witness.frame.sequence, second.frame.sequence);
    assert.deepEqual(witness.frame.paths[0].vertices, reflection.vertices);
    const event = opened.events.find(e => e.type === 'Selected wall bounce');
    assert.equal(event.detail.sequence, witness.frame.sequence);
    assert.deepEqual(event.detail.vertices, reflection.vertices);
    const audio = await request('/api/replay/audio');
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()), exactWav);
    assert.equal((await request('/api/telemetry', {method: 'POST', body: '{}'})).status, 403);
    const wallWave = path.join(root, 'wall-on.wav');
    fs.writeFileSync(wallWave, wav([.625, -.625, .875, -.875]));
    await assert.rejects(() => module.openPowertrainReplay(root, 'wall-on'), /WAV digest/i);
    fs.writeFileSync(wallWave, wav(samples[1]));
    const changed = wav([...samples[0], .1, 0, ...samples[1]]);
    fs.writeFileSync(path.join(root, comparison.file), changed);
    comparison.sha256 = sha256(changed);
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result));
    await assert.rejects(() => module.openPowertrainReplay(root), /silence/i);
    fs.writeFileSync(path.join(root, comparison.file), exactWav);
    await assert.rejects(() => module.openPowertrainReplay(root), /comparison.*digest/i);
    comparison.sha256 = sha256(exactWav);
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result));
    const timelineFile = path.join(root, 'soundmap-wall-on.jsonl');
    const swapped = fs.readFileSync(timelineFile, 'utf8').replaceAll(session, 'b'.repeat(32));
    fs.writeFileSync(timelineFile, swapped);
    await assert.rejects(() => module.openPowertrainReplay(root), /timeline.*digest/i);
    stages['wall-on'].timelineSHA256 = sha256(swapped);
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result));
    await assert.rejects(() => module.openPowertrainReplay(root), /render session/i);
  } finally {
    await service?.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
