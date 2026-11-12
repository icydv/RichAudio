import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recipe, synthesize, encodeWav, decodeWav, inspectWav, identify, sha256 } from '../tools/native-control/private-profile/ResourceMarker.mjs';
const rate = recipe.sampleRate;
const pad = (samples, before = 0.347, after = 0.5, gain = 1) => { const out = new Float64Array(Math.ceil((before + after) * rate) + samples.length); for (let n = 0; n < samples.length; n++) out[Math.round(before * rate) + n] = samples[n] * gain; return out; };
const tone = (frequency, seconds = 3.8, gain = 0.08) => Float64Array.from({ length: Math.round(seconds * rate) }, (_, n) => gain * Math.sin(2 * Math.PI * frequency * n / rate));
const marker = synthesize(), clean = encodeWav(pad(marker)), plain = encodeWav(tone(350));
const cases = [];
function test(name, run) { run(); cases.push({ name, passed: true }); }
test('original-format-level-and-duration', () => { const wav = decodeWav(encodeWav(marker)); assert.equal(wav.frames, 134400); assert.equal(wav.channels.length, 1); assert.ok(Math.max(...wav.channels[0].subarray(0, 40000)) <= 0.1001); assert.ok(inspectWav(clean).state === 'present'); });
test('gain-delay-noise-reflection-tolerated', () => {
  const m = pad(marker, 0.527, 0.6, 0.24); let seed = 7103;
  for (let n = m.length - 1; n >= 0; n--) { if (n >= 720) m[n] += m[n - 720] * 0.2; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; m[n] += (seed / 4294967296 - 0.5) * 0.003; }
  assert.equal(inspectWav(encodeWav(m)).state, 'present');
});
test('stereo-does-not-cancel-opposite-phase-marker', () => { const a = pad(marker); assert.equal(inspectWav(encodeWav([a, a.map(v => -v)])).state, 'present'); });
test('single-tone-rejected', () => assert.equal(inspectWav(encodeWav(tone(660))).state, 'absent-in-supplied-window'));
test('wrong-word-rejected', () => assert.equal(inspectWav(encodeWav(pad(synthesize(recipe.code.slice(0, 15) + (recipe.code[15] === '1' ? '0' : '1') + recipe.code.slice(16))))).state, 'absent-in-supplied-window'));
test('reversed-word-rejected', () => assert.equal(inspectWav(encodeWav(pad(synthesize([...recipe.code].reverse().join(''))))).state, 'absent-in-supplied-window'));
test('fragment-does-not-identify', () => assert.notEqual(inspectWav(encodeWav(pad(marker.subarray(0, 60000), 0.5, 2))).state, 'present'));
test('simultaneous-both-tones-ambiguous', () => { const a = tone(660); const b = tone(880); assert.equal(inspectWav(encodeWav(a.map((v, n) => v + b[n]))).state, 'absent-in-supplied-window'); });
test('clipping-inconclusive-even-with-marker', () => { const a = pad(marker); a[0] = 1; assert.equal(inspectWav(encodeWav(a)).state, 'inconclusive'); });
test('silence-inconclusive', () => assert.equal(inspectWav(encodeWav(new Float64Array(rate * 4))).state, 'inconclusive'));
test('truncated-and-wrong-rate-rejected', () => { assert.equal(inspectWav(clean.subarray(0, clean.length - 1)).state, 'inconclusive'); assert.equal(inspectWav(encodeWav(marker, 44100)).state, 'inconclusive'); });
test('private-target-only-conditional-pass', () => assert.equal(identify(plain, clean, plain).verdict, 'PASS'));
test('control-contamination-fails-attribution', () => assert.equal(identify(plain, clean, clean).verdict, 'FAIL'));
test('baseline-contamination-fails-attribution', () => assert.equal(identify(clean, clean, plain).verdict, 'FAIL'));
test('missing-marker-does-not-fabricate-fallback', () => assert.equal(identify(plain, plain, plain).verdict, 'INCONCLUSIVE'));
test('silent-control-does-not-prove-isolation', () => assert.equal(identify(plain, clean, encodeWav(new Float64Array(rate * 4))).verdict, 'INCONCLUSIVE'));
console.log(JSON.stringify({ schema: 'RichAudioPrivateMarkerFixtures01', passed: cases.length, cases, markerWavSha256: sha256(encodeWav(marker)), implementationSha256: sha256(fs.readFileSync(new URL('../tools/native-control/private-profile/ResourceMarker.mjs', import.meta.url))) }, null, 2));
