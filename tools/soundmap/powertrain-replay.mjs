import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkFrame, checkGeometry} from './ui/model.mjs';
import {LIMITS} from './recorder.mjs';
import {SOUND_MAP_WIRE} from './ui/wire-limits.mjs';

const sampleRate = 48000;
const headerBytes = 44;
const frameBytes = 8;
const maximumSamples = sampleRate * 120;
const takeNames = ['wall-off', 'wall-on', 'two-vehicles', 'solo-vehicle'];
const labels = {'wall-off': 'Direct path', 'wall-on': 'Direct and reflected paths',
  'two-vehicles': 'Two independently driven vehicles', 'solo-vehicle': 'One vehicle'};

function need(condition, message) {
  if (!condition) throw Error(message);
}

async function localFile(root, name, maxBytes) {
  need(typeof name === 'string' && name !== '.' && name !== '..' && !/[\\/:]/.test(name),
    'Expected a local replay file name');
  const file = path.join(root, name);
  const stat = await fs.lstat(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes, 'Replay file exceeds its private file budget');
  return fs.readFile(file);
}

async function readWave(root, name) {
  const wav = await localFile(root, name, headerBytes + maximumSamples * frameBytes);
  need(wav.length > headerBytes && wav.toString('ascii', 0, 4) === 'RIFF' &&
    wav.readUInt32LE(4) === wav.length - 8 && wav.toString('ascii', 8, 16) === 'WAVEfmt ' &&
    wav.readUInt32LE(16) === 16 && wav.readUInt16LE(20) === 3 &&
    wav.readUInt16LE(22) === 2 && wav.readUInt32LE(24) === sampleRate &&
    wav.readUInt32LE(28) === sampleRate * frameBytes && wav.readUInt16LE(32) === frameBytes &&
    wav.readUInt16LE(34) === 32 && wav.toString('ascii', 36, 40) === 'data' &&
    wav.readUInt32LE(40) === wav.length - headerBytes && (wav.length - headerBytes) % frameBytes === 0,
  'Expected native 48 kHz stereo Float32 WAV');
  const pcm = wav.subarray(headerBytes);
  for (let at = 0; at < pcm.length; at += 4)
    need(Number.isFinite(pcm.readFloatLE(at)), 'Nonfinite PCM in replay WAV');
  return {wav, pcm, frames: pcm.length / frameBytes};
}

async function readTimeline(root, segment, geometries) {
  const {take, firstFrame, frames} = segment;
  const text = await localFile(root, 'soundmap-' + take + '.jsonl', LIMITS.maxBytes);
  const rows = text.toString('utf8').trimEnd().split('\n');
  need(rows.length <= 3601, 'Replay frame count exceeds the render sampling budget');
  let previous = -1, engineOrigin, streamTag;
  return rows.map(line => {
    need(Buffer.byteLength(line) <= SOUND_MAP_WIRE.telemetryBytes + SOUND_MAP_WIRE.installedGeometryBytes + 512,
      'Replay packet exceeds the SoundMap wire budget');
    const {sampleFrame, soundMapFrame, soundMapGeometry, voices = []} = JSON.parse(line);
    need(Number.isSafeInteger(sampleFrame) && sampleFrame > previous && sampleFrame < frames &&
      Number.isSafeInteger(soundMapFrame?.audioFrame) && soundMapFrame.audioFrame >= 0,
    'Expected increasing PCM sample positions within the take');
    previous = sampleFrame;
    engineOrigin ??= soundMapFrame.audioFrame - sampleFrame;
    need(soundMapFrame.audioFrame - sampleFrame === engineOrigin, 'Viewer sample position differs from the engine clock');
    const frame = checkFrame({...soundMapFrame, renderedVoices: voices});
    const tag = frame.sessionId + '/' + (frame.streamId ?? frame.sessionId);
    streamTag ??= tag;
    need(streamTag === tag, 'Viewer stream changed inside a take');
    if (soundMapGeometry) {
      const geometry = checkGeometry(soundMapGeometry);
      need(geometry.generation === frame.geometryGeneration && geometry.sessionId === frame.sessionId &&
        (geometry.streamId ?? geometry.sessionId) === (frame.streamId ?? frame.sessionId),
      'Replay geometry differs from its render frame');
      const old = geometries.get(geometry.generation);
      need(!old || JSON.stringify(old) === JSON.stringify(geometry), 'Replay geometry changed without a new generation');
      geometries.set(geometry.generation, geometry);
    }
    need(!frame.geometryGeneration || geometries.has(frame.geometryGeneration), 'Viewer frame is missing its admitted geometry');
    return {timeMs: (firstFrame + sampleFrame) / 48, frame};
  });
}

export async function openPowertrainReplay(root, take = 'comparison') {
  need(take === 'comparison' || takeNames.includes(take), 'Choose a rendered replay take');
  root = await fs.realpath(root);
  const result = JSON.parse(await localFile(root, 'result.json', LIMITS.frameBytes));
  const comparison = result.comparison;
  const takeWave = await readWave(root, take === 'comparison' ? comparison?.file : take + '.wav');
  const segments = take === 'comparison' ? comparison?.takes : [{take, firstFrame: 0, frames: takeWave.frames}];
  need(Array.isArray(segments) && (take !== 'comparison' ||
    segments.length === 2 && segments[0].take === 'wall-off' && segments[1].take === 'wall-on'),
  'Expected two comparison takes in listening order');

  const geometries = new Map(), events = [], frames = [];
  let endFrame = 0, strongestReflection;
  for (const segment of segments) {
    const {take, firstFrame, frames: length} = segment;
    need(takeNames.includes(take) && Number.isSafeInteger(firstFrame) && firstFrame >= endFrame &&
      Number.isSafeInteger(length) && length > 0 && firstFrame + length <= takeWave.frames,
    'Invalid replay take placement');
    const startMs = firstFrame / 48;
    const individual = segments.length === 1 ? takeWave : await readWave(root, take + '.wav');
    const slice = takeWave.pcm.subarray(firstFrame * frameBytes, (firstFrame + length) * frameBytes);
    need(length === individual.frames && slice.equals(individual.pcm), 'Comparison audio differs from the recorded take');
    for (let at = endFrame * frameBytes; at < firstFrame * frameBytes; at += 4)
      need(takeWave.pcm.readFloatLE(at) === 0, 'Comparison spacer must contain only silence');
    if (firstFrame > endFrame) frames.push({timeMs: endFrame / 48, frame: null});
    const timeline = await readTimeline(root, segment, geometries);
    // Samples before the first telemetry tick have no available solver frame.
    if (timeline[0].timeMs > startMs) frames.push({timeMs: startMs, frame: null});
    frames.push(...timeline);
    events.push({timeMs: startMs, type: labels[take]});
    endFrame = firstFrame + length;
    if (take === 'wall-on' || take === 'two-vehicles') {
      for (const row of timeline) {
        for (const ray of row.frame.paths) {
          if (ray.status !== 'selected' || ray.order !== 1 || !ray.points?.length ||
              result.wall?.surfaceId && !ray.surfaceIds?.includes(result.wall.surfaceId)) continue;
          const referenceMs = (firstFrame + result.wall?.witness?.sampleFrame) / 48;
          const score = Math.abs(ray.bands?.[0] ?? 0);
          const fromWitness = take === 'wall-on' && row.timeMs === referenceMs &&
            (!result.wall.witness.reflected?.id || ray.id === result.wall.witness.reflected.id);
          if (!strongestReflection || fromWitness || !strongestReflection.fromWitness && score > strongestReflection.score)
            strongestReflection = {timeMs: row.timeMs, sequence: row.frame.sequence, streamId: row.frame.streamId,
              score, fromWitness, path: ray};
        }
      }
    }
  }
  need(endFrame === takeWave.frames, 'Replay takes do not cover the WAV extent');
  if (strongestReflection) {
    const {timeMs, sequence, streamId, path: ray} = strongestReflection;
    events.push({timeMs, type: 'Selected wall bounce', detail: {sequence, streamId, pathId: ray.id,
      sourceId: ray.sourceId, surfaceIds: ray.surfaceIds, vertices: ray.vertices}});
  }
  const sha256 = createHash('sha256').update(takeWave.wav).digest('hex');
  const id = 'drive-' + take + '-' + sha256.slice(0, 16);
  const durationMs = takeWave.frames / 48;
  return {id, frames, geometries, events, durationMs, originFrame: 0, audioStartTimeMs: 0,
    wav: takeWave.wav, audioPlayable: true,
    manifest: {id, title: take === 'comparison' ? 'PLAY FIRST · wall comparison' : labels[take],
      state: 'stopped', durationMs, timelineBasis: 'rendered-engine-audioFrame',
      audio: {kind: 'offline-rendered-file', sampleRate, channels: 2, format: 'wav-float32', sha256,
        capturedFrames: takeWave.frames, gaps: [], clockUncertainty: 'The viewer follows the original rendered PCM sample positions.'},
      takes: segments}};
}
