// Original experimental audio only. No device, host, game or network access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const recipe = Object.freeze({
  schema: 'RichAudioOriginalMarker01', sampleRate: 48000, channels: 1, bits: 16,
  code: '1111100011011101010000100101100', frequenciesHz: [660, 880],
  chipSeconds: 0.08, noteSeconds: 0.06, rampSeconds: 0.006,
  leadSeconds: 0.16, tailSeconds: 0.16, amplitude: 0.10,
  streamName: 'ra_gapriv01_code31', purpose: 'One private horn contribution; finite original PCM, no stock audio.',
});
export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

export function synthesize(code = recipe.code) {
  if (!/^[01]{31}$/.test(code)) throw new Error('Exactly 31 binary symbols required');
  const rate = recipe.sampleRate, chip = Math.round(recipe.chipSeconds * rate);
  const note = Math.round(recipe.noteSeconds * rate), ramp = Math.round(recipe.rampSeconds * rate);
  const lead = Math.round(recipe.leadSeconds * rate);
  const samples = new Float64Array(lead + code.length * chip + Math.round(recipe.tailSeconds * rate));
  for (let k = 0; k < code.length; k++) {
    const frequency = recipe.frequenciesHz[Number(code[k])];
    for (let n = 0; n < note; n++) {
      const edge = Math.min(1, n / ramp, (note - 1 - n) / ramp);
      const envelope = (1 - Math.cos(Math.PI * edge)) / 2;
      samples[lead + k * chip + n] = recipe.amplitude * envelope * Math.sin(2 * Math.PI * frequency * n / rate);
    }
  }
  return samples;
}

export function encodeWav(channels, sampleRate = recipe.sampleRate) {
  if (!Array.isArray(channels)) channels = [channels];
  const frames = channels[0].length;
  if (![1, 2].includes(channels.length) || channels.some(c => c.length !== frames)) throw new Error('Invalid channels');
  const b = Buffer.alloc(44 + frames * channels.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels.length, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * channels.length * 2, 28);
  b.writeUInt16LE(channels.length * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  for (let n = 0; n < frames; n++) for (let c = 0; c < channels.length; c++) {
    if (!Number.isFinite(channels[c][n])) throw new Error('Nonfinite audio');
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c][n] * 32767))), 44 + (n * channels.length + c) * 2);
  }
  return b;
}

export function decodeWav(b) {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) + 8 !== b.length) throw new Error('Invalid/truncated RIFF WAVE');
  let format, data;
  for (let offset = 12; offset + 8 <= b.length;) {
    const id = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > b.length) throw new Error('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (format || size < 16) throw new Error('Ambiguous format');
      format = { codec: b.readUInt16LE(start), channels: b.readUInt16LE(start + 2), rate: b.readUInt32LE(start + 4), byteRate: b.readUInt32LE(start + 8), align: b.readUInt16LE(start + 12), bits: b.readUInt16LE(start + 14) };
    }
    if (id === 'data') { if (data) throw new Error('Ambiguous data'); data = b.subarray(start, start + size); }
    offset = start + size + (size & 1);
  }
  if (!format || !data || format.codec !== 1 || format.bits !== 16 || format.rate !== 48000 || ![1, 2].includes(format.channels) || format.align !== format.channels * 2 || format.byteRate !== format.rate * format.align || data.length % format.align) throw new Error('Require complete PCM16 48 kHz mono/stereo WAVE');
  const frames = data.length / format.align;
  if (frames > 60 * format.rate || frames === 0) throw new Error('Capture must be 0–60 seconds');
  const channels = Array.from({ length: format.channels }, () => new Float64Array(frames));
  for (let n = 0; n < frames; n++) for (let c = 0; c < format.channels; c++) channels[c][n] = data.readInt16LE((n * format.channels + c) * 2) / 32768;
  return { channels, sampleRate: format.rate, frames, pcmSha256: sha256(data) };
}

// Two fixed tone measurements plus exact temporal word. This is not a stock
// spectral classifier. Searches 10 ms alignment; no pitch/rate fitting or
// relaxed code-distance search that could turn an unrelated horn into a match.
export function inspectWav(bytes) {
  let wav;
  try { wav = decodeWav(bytes); } catch (error) { return { state: 'inconclusive', reason: error.message, sha256: sha256(bytes) }; }
  const rate = wav.sampleRate, hop = rate / 100, size = rate / 25;
  const window = Float64Array.from({ length: size }, (_, n) => 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
  const sum = window.reduce((a, v) => a + v, 0);
  const basis = recipe.frequenciesHz.map(f => ({ cos: window.map((w, n) => w * Math.cos(2 * Math.PI * f * n / rate)), sin: window.map((w, n) => w * Math.sin(2 * Math.PI * f * n / rate)) }));
  let peak = 0, clipped = 0, best = { matchingSymbols: 0, minimumRatio: 0 }, audibleWindows = 0;
  const matches = [];
  for (let channel = 0; channel < wav.channels.length; channel++) {
    const samples = wav.channels[channel], features = [];
    for (const s of samples) { peak = Math.max(peak, Math.abs(s)); if (Math.abs(s) >= 0.999) clipped++; }
    for (let start = 0; start + size <= samples.length; start += hop) {
      let power = 0; const re = [0, 0], im = [0, 0];
      for (let n = 0; n < size; n++) {
        const x = samples[start + n]; power += x * x * window[n];
        for (let f = 0; f < 2; f++) { re[f] += x * basis[f].cos[n]; im[f] += x * basis[f].sin[n]; }
      }
      power /= sum;
      const energy = re.map((x, f) => 2 * (x * x + im[f] * im[f]) / (sum * sum));
      features.push({ energy, power }); if (power >= 0.00000225) audibleWindows++;
    }
    for (let start = 0; start + 30 * 8 < features.length; start++) {
      let matchingSymbols = 0, minimumRatio = Infinity;
      for (let k = 0; k < recipe.code.length; k++) {
        const { energy, power } = features[start + k * 8], expected = Number(recipe.code[k]);
        const ratio = energy[expected] / Math.max(energy[1 - expected], 1e-12);
        minimumRatio = Math.min(minimumRatio, ratio);
        if (power >= 0.00000225 && ratio >= 4 && energy[expected] / Math.max(power, 1e-12) >= 0.55) matchingSymbols++;
      }
      if (matchingSymbols > best.matchingSymbols || (matchingSymbols === best.matchingSymbols && minimumRatio > best.minimumRatio)) best = { matchingSymbols, minimumRatio, channel, seconds: start / 100 };
      if (matchingSymbols === 31) matches.push({ channel, seconds: start / 100, minimumRatio });
    }
  }
  const quality = wav.frames >= rate * 2.8 && clipped === 0 && audibleWindows >= 50;
  return { state: !quality ? 'inconclusive' : matches.length ? 'present' : 'absent-in-supplied-window',
    reason: !quality ? (clipped ? 'Capture contains clipped samples' : wav.frames < rate * 2.8 ? 'Capture is too short' : 'Insufficient audible control/target material') : matches.length ? 'All 31 temporal symbols matched' : 'No complete marker word matched',
    sha256: sha256(bytes), pcmSha256: wav.pcmSha256, seconds: wav.frames / rate, channels: wav.channels.length, peak, clippedSamples: clipped,
    best, matches: matches.slice(0, 32), matchingAlignments: matches.length,
    limits: 'Only the supplied PCM window is classified. This does not authenticate capture provenance, resolve registration, or prove whole-profile selection.' };
}

export function identify(baseline, target, control) {
  const captures = { baseline: inspectWav(baseline), target: inspectWav(target), control: inspectWav(control) };
  let verdict = 'INCONCLUSIVE', reason = 'A usable target marker and usable marker-free baseline/control are required';
  if (captures.baseline.state === 'present' || captures.control.state === 'present') { verdict = 'FAIL'; reason = 'Marker in baseline/control defeats isolated target attribution'; }
  else if (captures.target.state === 'present' && captures.baseline.state === 'absent-in-supplied-window' && captures.control.state === 'absent-in-supplied-window') {
    verdict = 'PASS'; reason = 'Private marker is present only in the supplied target capture';
  }
  return { schema: 'RichAudioPrivateMarkerIdentification01', verdict, reason, captures,
    scope: 'Conditional evidence for one authored horn contribution. Separately verify capture integrity, event labels, correct disposable handles, resource/package seals and control horn activation. Silence or a missing marker is not proof of suppression or fallback.' };
}

function privateDirectory(directory) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', '.local');
  const out = path.resolve(directory);
  if (!out.startsWith(root + path.sep) || fs.existsSync(out)) throw new Error('Fresh worktree .local output required');
  for (let p = path.dirname(out); p !== path.dirname(p); p = path.dirname(p)) if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('Linked output refused');
  fs.mkdirSync(out, { recursive: true }); return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'generate' && args.length === 1) {
    const out = privateDirectory(args[0]), wav = encodeWav(synthesize()), info = decodeWav(wav), samples = info.channels[0];
    const peak = samples.reduce((a, v) => Math.max(a, Math.abs(v)), 0), rms = Math.sqrt(samples.reduce((a, v) => a + v * v, 0) / samples.length);
    fs.writeFileSync(path.join(out, 'marker.wav'), wav, { flag: 'wx' });
    const manifest = { ...recipe, frames: info.frames, seconds: info.frames / info.sampleRate, peak, peakDbfs: 20 * Math.log10(peak), rms, rmsDbfs: 20 * Math.log10(rms), wavSha256: sha256(wav), pcmSha256: info.pcmSha256, generatorSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), runtimePlaybackVerified: false };
    fs.writeFileSync(path.join(out, 'marker.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(manifest));
  } else if (command === 'identify' && args.length === 3) console.log(JSON.stringify(identify(...args.map(a => fs.readFileSync(a))), null, 2));
  else throw new Error('Usage: ResourceMarker.mjs generate <fresh .local directory> | identify <baseline.wav> <target.wav> <control.wav>');
}
