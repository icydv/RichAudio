// Local-only isolation: no game, endpoint or network APIs. Never changes sources.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeWav, encodeWav, measure, renderReference, validateAudio, limits} from '../src/offline-audio/stock-source.mjs';
import {analysePair} from './audio/decel-analysis.mjs';
import {privatePath, within, noLinks} from './audio/private-files.mjs';
export const hash = b => createHash('sha256').update(b).digest('hex').toUpperCase();
function read(p, bound = limits.bytes) {noLinks(p); if (fs.statSync(p).size > bound) throw Error('input size bound'); return fs.readFileSync(p);}
function json(p) {return JSON.parse(read(p, 2 * 1024 * 1024).toString('utf8').replace(/^\uFEFF/, ''));}
export function sliceAudio(a, start, end) {
  validateAudio(a);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > a.data.length / a.channels) throw Error('invalid global frame range');
  return {...a, data: a.data.slice(start * a.channels, end * a.channels)};
}
export function referenceRanges(sources, settings) {
  const rate = settings.rate, overlap = Math.round(rate * settings.crossfadeSeconds), idle = Math.round(rate * settings.idleSeconds);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !Number.isFinite(overlap) || settings.crossfadeSeconds < 0.005 || settings.crossfadeSeconds > 0.2 || !Number.isFinite(idle) || settings.idleSeconds < 0.5 || settings.idleSeconds > 4) throw Error('invalid timing');
  if (!Array.isArray(sources) || sources.length !== 6 || new Set(sources.map(s => s.component + '/' + s.state)).size !== 6 ||
      sources.some(s => !['engine', 'exhaust'].includes(s.component) || !['idle', 'accel', 'decel'].includes(s.state) || s.audio.rate !== rate || s.audio.channels !== 1 || !s.audio.data.length)) throw Error('invalid source schedule');
  const frames = state => Math.max(...sources.filter(s => s.state === state).map(s => s.audio.data.length));
  const accelStart = idle - overlap, decelStart = accelStart + frames('accel') - overlap;
  const decelEnd = decelStart + frames('decel'), idleStart = decelEnd - overlap, end = idleStart + idle;
  const exhaustEnd = decelStart + sources.find(s => s.component === 'exhaust' && s.state === 'decel').audio.data.length;
  if (end > rate * limits.seconds || frames('accel') < overlap * 2 || frames('decel') < overlap * 2) throw Error('timing extent');
  return {rate, overlap, accelStart, decelStart, decelEnd, idleStart, exhaustEnd, end,
    clipStart: Math.max(0, decelStart - Math.round(0.3 * rate)), clipEnd: Math.min(end, idleStart + Math.round(0.4 * rate))};
}
export function build(manifestFile, settingsFile, baselineDirectory, outputDirectory) {
  const manifest = privatePath(manifestFile), baseline = privatePath(baselineDirectory), out = privatePath(outputDirectory);
  noLinks(settingsFile); if (fs.existsSync(out)) throw Error('existing output rejected');
  const m = json(manifest), settings = json(settingsFile), base = path.dirname(manifest);
  if (m.schemaVersion !== 1 || !Array.isArray(m.sources) || m.sources.length !== 6 || settings.schemaVersion !== 1 || settings.mode !== 'continuous-recordings') throw Error('reference schema required');
  let bytes = 0;
  const sourceBytes = new Map();
  const sources = m.sources.map(s => {
    const file = path.resolve(base, s.file); if (!within(file, base)) throw Error('source escape');
    const b = read(file); bytes += b.length; if (bytes > limits.bytes || hash(b) !== s.sha256) throw Error('source fingerprint/size mismatch');
    const audio = decodeWav(b);
    if (audio.rate !== s.sampleRate || audio.channels !== s.channels || audio.data.length / audio.channels !== s.sampleCount) throw Error('source layout mismatch');
    sourceBytes.set(s.component + '/' + s.state, b); return {...s, audio};
  });
  const reproduced = renderReference(sources, settings), saved = json(path.join(baseline, 'analysis.json'));
  const reference = {}, inputFingerprints = [];
  for (const component of ['engine', 'exhaust', 'mix']) {
    const file = path.join(baseline, 'demo_' + component + '.wav'), b = read(file), fingerprint = hash(b);
    if (fingerprint !== saved.outputs?.[component]?.sha256 || fingerprint !== hash(encodeWav(reproduced[component]))) throw Error('baseline fingerprint/reproduction mismatch');
    reference[component] = decodeWav(b); inputFingerprints.push({component, sha256: fingerprint});
  }
  const ranges = referenceRanges(sources, settings), clips = {}, summaries = {};
  for (const component of ['engine', 'exhaust', 'mix']) clips[component] = sliceAudio(reference[component], ranges.clipStart, ranges.clipEnd);
  let maxSumError = 0;
  for (let n = 0; n < clips.mix.data.length; n++) maxSumError = Math.max(maxSumError, Math.abs(clips.mix.data[n] - clips.engine.data[n] - clips.exhaust.data[n]));
  if (maxSumError > 1 / 32768) throw Error('component sum exceeds PCM quantisation bound');
  const pending = new Map();
  for (const [component, letter] of [['engine', 'A'], ['exhaust', 'B'], ['mix', 'C']]) pending.set(letter + '_' + component + '_decel.wav', encodeWav(clips[component]));
  pending.set('E_full_reference.wav', read(path.join(baseline, 'demo_mix.wav')));
  for (const component of ['engine', 'exhaust']) {
    const b = sourceBytes.get(component + '/decel'); pending.set('D_raw_' + component + '_decel.wav', b);
    const a = decodeWav(b), gain = settings.master * settings.gains[component] * (component === 'engine' ? settings.decelEngineScale ?? 1 : 1);
    pending.set('D_listen_' + component + '_decel.wav', encodeWav({...a, data: a.data.map(x => x * gain)}));
  }
  for (const [file, b] of pending) summaries[file] = {sha256: hash(b), ...measure(decodeWav(b))};
  const report = {schemaVersion: 1, ranges, inputFingerprints, baselineReproduced: true, maxComponentSumError: maxSumError,
    levelConvention: 'A/B/C: exact reference gains and common global range. D_raw: unchanged source bytes; D_listen: scalar attenuation to matching component gain, no fades or other processing.',
    outputs: summaries, interiorAnalysis: analysePair(reference.engine, reference.exhaust, ranges.decelStart + ranges.overlap, ranges.exhaustEnd - Math.round(settings.rate * 0.025)),
    conclusion: 'Isolation prepared; subjective cause not established by this operation'};
  fs.mkdirSync(path.dirname(out), {recursive: true}); noLinks(out); fs.mkdirSync(out);
  for (const [name, b] of pending) fs.writeFileSync(path.join(out, name), b, {flag: 'wx'});
  fs.writeFileSync(path.join(out, 'isolation.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({baselineReproduced: true, ranges, outputs: Object.keys(summaries)})); return {report, clips, sources, reference};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {if (process.argv.length !== 6) throw Error('Usage: node tools/Inspect-Deceleration.mjs PRIVATE_MANIFEST SETTINGS PRIVATE_BASELINE NEW_PRIVATE_OUTPUT'); build(...process.argv.slice(2));}
  catch (e) {console.error(e.message); process.exitCode = 1;}
}
