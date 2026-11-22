import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { mappedDrive } from '../tools/audio/mapped-drive-scene.mjs';
import { replayMappedPaths } from '../tools/audio/mapped-drive-render.mjs';

test('the pass, independently moving NPC and camera turn use one authored clock', () => {
 const inputs = { source: [2,0,0], forward: [1,0,0], halfLength: 2, listener: [0,-2,1],
  sourceStart: [0,0,0], sourceEnd: [4,0,.2], npcStart: [4,2,0], npcEnd: [2,2,0],
  npcPosition: [4,2,0], cameraForward: [0,1,0], turnRadians: Math.PI / 2 };
 const drive = mappedDrive(inputs, { model: 2, context: 'npc' });
 const first = drive.at(0, 0, true), mid = drive.at(2.5, 25_000_000, true);
 assert.deepEqual(first.vehicles.map(v => v.position), [inputs.sourceStart, inputs.npcStart]);
 assert(mid.vehicles[0].velocity[0] > 0 && mid.vehicles[1].velocity[0] < 0);
 assert.deepEqual(mid.vehicles[0], drive.at(2.5, 25_000_000, false).vehicles[0]);
 const stopped = drive.at(5.5, 55_000_000, true), turned = drive.at(7.75, 77_500_000, true);
 assert.deepEqual(stopped.vehicles[0].position, inputs.sourceEnd);
 assert.deepEqual(stopped.vehicles[0].position, turned.vehicles[0].position);
 assert(stopped.forward[1] > .99 && turned.forward[0] < -.99);
 assert.equal(turned.vehicles.length, 1);
 assert.equal(drive.at(8, 80_000_000, true).vehicles.length, 0);
});

test('withholding a selected route preserves unrelated control and release states and accounts for the stereo delta', () => {
 const settings = { sourceIds: ['engine'], maxPathsPerSource: 3, pathCapacityPerSource: 4,
  masterGain: .175, continuousRates: true, continuousTransitions: true, generationReleaseGuard: true };
 const renderer = new StreamingRenderer(settings);
 renderer.setOutputPreferences({ richAudioEnabled: true, outputLevel: .8 });
 const blocks = 10, frames = 512;
 const channels = [new Float32Array(blocks * frames), new Float32Array(blocks * frames)], records = [];
 const route = (id, order, gain, pan, frame) => ({ sourceId: 'engine', id, generation: 1, order,
  emissionFrame: frame - 31 * order, rate: 1, pan, bands: [gain, gain * .8, gain * .6] });
 for (let block = 0; block < blocks; block++) {
  const frame = block * frames;
  const dry = Float32Array.from({length: frames}, (_, i) => .4 * Math.sin((frame+i)/13));
  const paths = [route('direct', 0, .5, 0, frame)];
  if (block >= 1 && block <= 5) paths.push(route('first-wall', 1, .2, -.8, frame));
  if (block >= 2 && block <= 7) paths.push(route('two-walls', 2, .08, .9, frame));
  const control = { frame, sourceGenerations: { engine: 1 }, paths };
  renderer.accept(control);
  renderer.process({engine: dry}, ...channels.map(c => c.subarray(frame, frame + frames)), frames);
  const applied = renderer.slots.filter(s => s.active).map(s => ({ id: s.id, sourceId: 'engine',
   order: {'direct':0, 'first-wall':1, 'two-walls':2}[s.id], atFrame: renderer.frame, sourceFrame: s.cursor,
   delayMs: (renderer.frame - s.cursor) / 48, gainBands: [...s.gain], pan: s.pan,
   present: s.present, releaseFrames: s.releaseLeft, generation: s.generation, rate: s.rate,
   masterGain: renderer.masterGain, outputGain: renderer.outputGain, sourcePressureGain: s.source.pressureGain }));
  records.push({ control, pcm: { engine: dry }, applied });
 }
 const take = { records, channels, settings };
 const render = filter => replayMappedPaths(take, null, null, filter, { save:false });
 assert.deepEqual(render(() => true).channels, channels);
 const omitted = render(p => p.order < 2), isolated = render(p => p.order === 2);
 assert(omitted.removedControls === 6 && omitted.comparedSlots > 0);
 assert(records.some(b => b.applied.some(s => s.order === 1 && !s.present && s.releaseFrames > 0)));
 let peak = 0, nullPeak = 0;
 for (const [side, ch] of channels.entries()) for (let i = 0; i < ch.length; i++) {
  const difference = ch[i] - omitted.channels[side][i];
  peak = Math.max(peak, Math.abs(difference));
  nullPeak = Math.max(nullPeak, Math.abs(difference - isolated.channels[side][i]));
 }
 assert(peak > .001 && nullPeak < 1e-7);
});
