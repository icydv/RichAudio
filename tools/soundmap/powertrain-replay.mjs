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
const sha256 = value => createHash('sha256').update(value).digest('hex');
const wallComparison = ['wall-off', 'wall-on'];
const streetComparison = ['direct', 'single', 'multi'];
const takeNames = [...wallComparison, ...streetComparison, 'withheld', 'two-vehicles', 'solo-vehicle'];
const labels = {'wall-off': 'Direct path', 'wall-on': 'Direct and reflected paths',
  'two-vehicles': 'Two independently driven vehicles', 'solo-vehicle': 'One vehicle',
  direct: '1 · Direct only', single: '2 · Single reflections', multi: '3 · Full mix',
  withheld: 'One route withheld'};

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
  return {wav, pcm, frames: pcm.length / frameBytes, sha256: sha256(wav)};
}

function checkMixerPaths(applied, frame) {
  need(Array.isArray(applied) && applied.length <= 256, 'Expected bounded applied mixer paths');
  const selected = new Map(frame.paths.filter(p => p.status === 'selected').map(p => [p.id, p]));
  const seen = new Set();
  for (const tap of applied) {
    need(typeof tap?.id === 'string' && !seen.has(tap.id) && typeof tap.sourceId === 'string' &&
      Array.isArray(tap.gainBands) && tap.gainBands.length === 3 && tap.gainBands.every(Number.isFinite) &&
      Number.isFinite(tap.delayMs) && Number.isFinite(tap.pan) && Math.abs(tap.pan) <= 1 &&
      tap.atFrame === frame.audioFrame + 512, 'Applied mixer values or end-of-block clock differ');
    const ray = selected.get(tap.id);
    if (ray) need(ray.sourceId === tap.sourceId && ray.order === tap.order,
      'Applied mixer source or order differs from the selected solver path');
    seen.add(tap.id);
  }
}

async function readTimeline(root, segment, geometries, session, receipt, street) {
  const {take, firstFrame, frames} = segment;
  const text = await localFile(root, 'soundmap-' + take + '.jsonl', LIMITS.maxBytes);
  need(sha256(text) === receipt.timelineSHA256, 'Timeline digest differs from the render receipt for ' + take);
  const rows = text.toString('utf8').trimEnd().split('\n');
  need(rows.length === receipt.soundMapFrames && rows.length <= 3601, 'Replay frame count differs from the render receipt');
  let previous = -1, engineOrigin, streamTag;
  return rows.map(line => {
    need(Buffer.byteLength(line) <= SOUND_MAP_WIRE.telemetryBytes + SOUND_MAP_WIRE.installedGeometryBytes + 512,
      'Replay packet exceeds the SoundMap wire budget');
    const {sampleFrame, soundMapFrame, soundMapGeometry, voices = [], appliedPaths} = JSON.parse(line);
    need(Number.isSafeInteger(sampleFrame) && sampleFrame > previous && sampleFrame < frames &&
      Number.isSafeInteger(soundMapFrame?.audioFrame) && soundMapFrame.audioFrame >= 0,
    'Expected increasing PCM sample positions within the take');
    previous = sampleFrame;
    engineOrigin ??= soundMapFrame.audioFrame - sampleFrame;
    need(soundMapFrame.audioFrame - sampleFrame === engineOrigin, 'Viewer sample position differs from the engine clock');
    if (street) checkMixerPaths(appliedPaths, soundMapFrame);
    const renderedVoices = street && receipt.voices ? voices.map(voice => {
      const source = receipt.voices[voice.vehicle];
      need(source?.model === voice.model && source.context === voice.context &&
        source.source.includes(voice.engine) && source.source.includes(voice.exhaust) &&
        /^[0-9a-f]{64}$/i.test(source.bankSHA256), 'Recorded vehicle and donor source differ');
      return {...voice, donor: source.donor, bankSHA256: source.bankSHA256,
        maxObservationAgeMs: source.maxObservationAgeMs};
    }) : voices;
    const frame = checkFrame({...soundMapFrame, renderedVoices,
      ...(street && {take, takeSampleFrame: sampleFrame, comparisonSampleFrame: firstFrame + sampleFrame, appliedPaths})});
    need(frame.sessionId.startsWith(session + ':') &&
      (frame.listenerSessionId === undefined || frame.listenerSessionId.startsWith(session + ':')),
    'Timeline belongs to another render session');
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

function addStreetEvents(events, timeline, take, fullReceipt) {
  const witness = fullReceipt?.witness;
  const eventAt = (row, type, detail = {}) => events.push({timeMs: row.timeMs, type, detail: {
    take, sampleFrame: row.frame.takeSampleFrame, sequence: row.frame.sequence, streamId: row.frame.streamId, ...detail}});
  function addPath(row, tap, type) {
    const ray = row.frame.paths.find(p => p.status === 'selected' && p.id === tap.id);
    need(ray && ray.points?.length === ray.order && ray.vertices?.length === ray.order + 2 &&
      ray.surfaceIds?.length === ray.order && JSON.stringify(ray.points) === JSON.stringify(ray.vertices.slice(1,-1)),
    'Missing ordered vertices for a mixer witness');
    eventAt(row, type, {sourceId: ray.sourceId, pathId: ray.id, surfaceIds: ray.surfaceIds, vertices: ray.vertices});
  }
  const atWitness = witness && timeline.find(row => row.frame.takeSampleFrame === witness.sampleFrame);
  if (['single','multi','withheld'].includes(take) && witness) {
    need(atWitness, 'Missing mixer block at the matched reflection witness');
    const tap = atWitness.frame.appliedPaths.find(p => p.id === witness.reflected.id);
    if (take === 'multi') {
      const ray = atWitness.frame.paths.find(p => p.id === tap?.id && p.status === 'selected');
      need(tap?.order >= 2 && tap.gainBands.some(gain => gain !== 0) &&
        ray?.sourceId === witness.reflected.sourceId &&
        JSON.stringify(ray.surfaceIds) === JSON.stringify(witness.reflected.surfaceIds) &&
        JSON.stringify(ray.vertices) === JSON.stringify(witness.reflected.vertices),
      'Witness route missing from applied mixer paths or its retained geometry differs');
      addPath(atWitness, tap, tap.order + '-bounce route');
    } else {
      need(!tap && !atWitness.frame.paths.some(p => p.status === 'selected' && p.id === witness.reflected.id),
        'Withheld route was selected or applied at the matched witness');
      const alternatives = atWitness.frame.paths.filter(p => p.status === 'selected' &&
        p.sourceId === witness.reflected.sourceId && p.order === 1);
      const remaining = atWitness.frame.appliedPaths.filter(p => alternatives.some(ray => ray.id === p.id))
        .sort((a,b) => Math.max(...b.gainBands) - Math.max(...a.gainBands))[0];
      const ray = alternatives.find(p => p.id === remaining?.id);
      eventAt(atWitness, take === 'single' ? 'Same instant · single returns' : 'Same instant · route withheld',
        {withheldPathId: witness.reflected.id, sourceId: witness.reflected.sourceId,
          ...(ray && {pathId: ray.id, surfaceIds: ray.surfaceIds, vertices: ray.vertices})});
    }
  }
  if (take !== 'multi' && take !== 'two-vehicles') return;
  // Prefer the renderer's isolated-PCM witness when the receipt has one.
  const marked = new Set();
  if (take === 'multi') {
    if (witness) marked.add(witness.reflected.order);
    for (const other of Object.values(fullReceipt.witnessesByOrder ?? {})) {
      const order = other.reflected.order;
      if (marked.has(order)) continue;
      const row = timeline.find(row => row.frame.takeSampleFrame === other.sampleFrame);
      const tap = row?.frame.appliedPaths.find(p => p.id === other.reflected.id && p.present !== false);
      need(tap && tap.order === order, 'Recorded higher-order witness differs from the mixer block');
      addPath(row, tap, order + '-bounce route');
      marked.add(order);
    }
  }
  // A releasing slot may remain in the mixer after withdrawal from the solver.
  const highest = new Map();
  const standalone = take === 'multi' && !witness;
  for (const row of timeline) {
    const selected = new Set(row.frame.paths.filter(p => p.status === 'selected').map(p => p.id));
    for (const tap of row.frame.appliedPaths) {
      if ((!standalone && tap.order < 2) || !selected.has(tap.id) || tap.present === false || marked.has(tap.order)) continue;
      const gain = Math.max(...tap.gainBands.map(Math.abs));
      if (gain > (highest.get(tap.order)?.gain ?? 0)) highest.set(tap.order, {gain, row, tap});
    }
  }
  for (const [order, {row, tap}] of highest) {
    // A standalone setting may have only a floor return, or only a direct solve.
    if (order < 2 && order !== Math.max(...highest.keys())) continue;
    addPath(row, tap, order === 1 ? 'Single reflection' : order === 0 ? 'Direct path' : order + '-bounce route');
  }
  if (take === 'two-vehicles') {
    const which = (row, context) => row.frame.renderedVoices.find(v => v.context === context);
    const overlap = timeline.filter(row => ['player','npc'].every(context => {
      const voice = which(row, context);
      return voice && row.frame.appliedPaths.some(p => p.sourceId === voice.engine && p.order > 0 &&
        row.frame.paths.some(ray => ray.id === p.id && ray.status === 'selected'));
    })).sort((a,b) => which(b,'npc').operatingPoint - which(a,'npc').operatingPoint)[0];
    if (overlap) {
      const npc = which(overlap, 'npc');
      const tap = overlap.frame.appliedPaths.filter(p => p.sourceId === npc.engine && p.order > 0 &&
        overlap.frame.paths.some(ray => ray.id === p.id && ray.status === 'selected'))
        .sort((a,b) => b.order-a.order || Math.max(...b.gainBands)-Math.max(...a.gainBands))[0];
      addPath(overlap, tap, 'Both vehicles · NPC reflection');
      const after = timeline.find(row => row.timeMs > overlap.timeMs && which(row,'player') && !which(row,'npc') &&
        !row.frame.appliedPaths.some(p => p.sourceId === npc.engine || p.sourceId === npc.exhaust));
      if (after) eventAt(after, 'Player continues · NPC withdrawn', {retiredVehicle: npc.vehicle});
    }
  }
}

export async function openPowertrainReplay(root, take = 'comparison') {
  need(take === 'comparison' || takeNames.includes(take), 'Choose a rendered replay take');
  root = await fs.realpath(root);
  const result = JSON.parse(await localFile(root, 'result.json', LIMITS.frameBytes));
  need(typeof result.session === 'string' && /^[a-f0-9]{32}$/.test(result.session), 'Render session identity missing');
  const comparison = result.comparison;
  const street = result.kind === 'mapped-installed-vehicle-drive' || comparison?.takes?.[0]?.take === 'direct';
  const takeWave = await readWave(root, take === 'comparison' ? comparison?.file : take + '.wav');
  if (take === 'comparison') need(takeWave.sha256 === comparison.sha256, 'Comparison WAV digest differs from the render receipt');
  const segments = take === 'comparison' ? comparison?.takes : [{take, firstFrame: 0, frames: takeWave.frames}];
  const expected = street ? streetComparison : wallComparison;
  need(Array.isArray(segments) && (take !== 'comparison' ||
    segments.length === expected.length && segments.every((s, i) => s.take === expected[i] &&
      (!street || s.frames === segments[0].frames))), 'Expected matched comparison takes in listening order');

  const geometries = new Map(), events = [], frames = [], bindings = [];
  let endFrame = 0, strongestReflection;
  for (const segment of segments) {
    const {take, firstFrame, frames: length} = segment;
    need(takeNames.includes(take) && Number.isSafeInteger(firstFrame) && firstFrame >= endFrame &&
      Number.isSafeInteger(length) && length > 0 && firstFrame + length <= takeWave.frames,
    'Invalid replay take placement');
    const startMs = firstFrame / 48;
    const individual = segments.length === 1 ? takeWave : await readWave(root, take + '.wav');
    const receipt = result.stages?.[take];
    need(receipt?.frames === length && individual.sha256 === receipt.wavSHA256, 'WAV digest or length differs from the render receipt for ' + take);
    const slice = takeWave.pcm.subarray(firstFrame * frameBytes, (firstFrame + length) * frameBytes);
    need(length === individual.frames && slice.equals(individual.pcm), 'Comparison audio differs from the recorded take');
    for (let at = endFrame * frameBytes; at < firstFrame * frameBytes; at += 4)
      need(takeWave.pcm.readFloatLE(at) === 0, 'Comparison spacer must contain only silence');
    if (firstFrame > endFrame) frames.push({timeMs: endFrame / 48, frame: null});
    const timeline = await readTimeline(root, segment, geometries, result.session, receipt, street);
    bindings.push({...segment, timelineSHA256: receipt.timelineSHA256, wavSHA256: receipt.wavSHA256});
    // Samples before the first telemetry tick have no available solver frame.
    if (timeline[0].timeMs > startMs) frames.push({timeMs: startMs, frame: null});
    frames.push(...timeline);
    events.push({timeMs: startMs, type: labels[take]});
    if (street) addStreetEvents(events, timeline, take, result.stages.multi);
    endFrame = firstFrame + length;
    if (!street && (take === 'wall-on' || take === 'two-vehicles')) {
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
  const id = 'drive-' + take + '-' + takeWave.sha256.slice(0, 16);
  const durationMs = takeWave.frames / 48;
  return {id, frames, geometries, events, durationMs, originFrame: 0, audioStartTimeMs: 0,
    wav: takeWave.wav, audioPlayable: true,
    manifest: {id, session: result.session, ...(street && {mixerPathsRecorded: true}),
      title: take === 'comparison' ? street ? 'PLAY FIRST · mapped reflections' : 'PLAY FIRST · wall comparison' : labels[take],
      state: 'stopped', durationMs, timelineBasis: 'rendered-engine-audioFrame',
      audio: {kind: 'offline-rendered-file', sampleRate, channels: 2, format: 'wav-float32', sha256: takeWave.sha256,
        capturedFrames: takeWave.frames, gaps: [], clockUncertainty: 'The viewer follows the original rendered PCM sample positions.'},
      takes: bindings}};
}
