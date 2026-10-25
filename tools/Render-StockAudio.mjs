// Local private file renderer. No network, audio-device, game or framework APIs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {decodeWav, encodeWav, measure, render, renderReference, limits} from '../src/offline-audio/stock-source.mjs';
import {privateRoot, within, noLinks} from './audio/private-files.mjs';
const hash = b => createHash('sha256').update(b).digest('hex').toUpperCase();
function json(p, max = 2 * 1024 * 1024) { if (fs.statSync(p).size > max) throw Error('manifest size bound'); return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
export function run(manifestPath, timelinePath, out) {
  manifestPath = path.resolve(manifestPath); timelinePath = path.resolve(timelinePath); out = path.resolve(out);
  noLinks(out); noLinks(manifestPath); noLinks(timelinePath);
  if (!within(out, privateRoot) || fs.existsSync(out)) throw Error('new output below private .local/audio-reconstruction required');
  const m = json(manifestPath), settings = json(timelinePath), base = path.dirname(manifestPath);
  if (m.schemaVersion !== 1 || settings.schemaVersion !== 1 || !Array.isArray(m.sources) || m.sources.length !== 6) throw Error('manifest schema/source count');
  let totalBytes = 0;
  const inputs = m.sources.map(s => {
    const file = path.resolve(base, s.file); noLinks(file);
    if (!within(file, base)) throw Error('source path escaped manifest root');
    const bytes = fs.statSync(file).size; totalBytes += bytes;
    if (bytes > limits.bytes || totalBytes > limits.bytes) throw Error('input byte bound');
    const b = fs.readFileSync(file); if (hash(b) !== s.sha256) throw Error('source fingerprint mismatch');
    const audio = decodeWav(b);
    if (audio.data.length / audio.channels !== s.sampleCount || audio.rate !== s.sampleRate || audio.channels !== s.channels) throw Error('source layout mismatch');
    return {component: s.component, state: s.state, markers: s.estimatedSampleMarkers, audio};
  });
  if (settings.mode !== undefined && !['continuous-recordings', 'estimated-grains'].includes(settings.mode)) throw Error('unknown rendering mode');
  const reference = settings.mode === 'continuous-recordings';
  const cpuStart = process.cpuUsage(), started = performance.now(), result = reference ? renderReference(inputs, settings) : render(inputs, settings.points, settings), renderMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const buffers = Object.fromEntries(Object.entries(result).map(([name, a]) => [name, encodeWav(a)]));
  const report = {schemaVersion: 1, family: m.family, classification: 'stock source recordings with estimated offline scheduling; no live RPM or native ownership',
    rendererVersion: 1, mode: reference ? 'continuous-recordings' : 'estimated-grains', renderMs, renderCpuUserMs: cpu.user / 1000, renderCpuSystemMs: cpu.system / 1000, memoryRssBytes: process.memoryUsage().rss, sourceMeasurements: inputs.map((s, i) => ({component: s.component, state: s.state, sha256: m.sources[i].sha256, ...measure(s.audio)})),
    outputs: Object.fromEntries(Object.entries(buffers).map(([name, b]) => [name, {file: 'demo_' + name + '.wav', sha256: hash(b), ...measure(decodeWav(b))}])),
    approximations: reference ? ['Limited reference sequence, not dynamic engine reconstruction', 'Moving recordings run once at original sample rate, without grain replay or pitch/time change', 'Idle repeats with estimated 25ms wrap crossfade', 'Authored stage order and transition fades', 'Engine/exhaust start-aligned; native phase/timing unknown', 'Shorter deceleration component fades out at original length; no invented continuation', 'Authored attenuation/gains; native headroom and mixing laws not interpreted'] : ['Synthetic state curve', 'Unknown grain integer treated as estimated sample anchor after bounds checks', 'Ratio-to-record-position mapping', '80ms Hann OLA/40ms hop', '25ms estimated idle wrap crossfade', '0.9-1.1 time resampling on moving layers, not pitch-preserving time stretch', 'Authored attenuation/gains; native headroom and mixing laws not interpreted']};
  if (report.outputs.mix.allZero || report.outputs.mix.clippedSamples) throw Error('silent or clipped demonstration rejected');
  fs.mkdirSync(path.dirname(out), {recursive: true}); noLinks(out); fs.mkdirSync(out);
  for (const [name, b] of Object.entries(buffers)) fs.writeFileSync(path.join(out, 'demo_' + name + '.wav'), b, {flag: 'wx'});
  fs.writeFileSync(path.join(out, 'analysis.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({renderMs, outputs: report.outputs})); return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 5) throw Error('Usage: node tools/Render-StockAudio.mjs PRIVATE_MANIFEST TIMELINE NEW_PRIVATE_OUTPUT'); run(...process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
