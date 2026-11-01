import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeWav, measure, limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath, noLinks, within} from './audio/private-files.mjs';
const hash = b => createHash('sha256').update(b).digest('hex').toUpperCase();
export function prepare(directory) {
  const dir = privatePath(directory), input = path.join(dir, 'extraction.json'); noLinks(input);
  if (fs.statSync(input).size > 16 * 1024 * 1024) throw Error('extraction manifest size bound');
  const m = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (m.schemaVersion !== 1 || m.failed !== false || m.archives?.length !== 2) throw Error('incomplete extraction');
  const sources = [], rows = [];
  for (let i = 0; i < 2; i++) {
    const a = m.archives[i];
    if (a.unchanged !== true || a.beforeSha256 !== a.afterSha256 || a.container !== (i === 0 ? 'v_twin_2.awc' : 'v_twin_2_npc.awc') || a.streams.length !== (i === 0 ? 8 : 4)) throw Error('wrong family/integrity/count');
    for (const s of a.streams) {
      if (!/^(?:engine|exhaust)_(?:idle|accel|decel)$|^unresolved_[0-9A-F]{8}$/.test(s.name) || s.wav !== s.name + '.wav' || s.codec !== 0) throw Error('unsupported stream');
      const file = (i === 0 ? 'player' : 'npc') + '/' + s.wav, absolute = path.resolve(dir, file); noLinks(absolute);
      if (!within(absolute, dir) || fs.statSync(absolute).size > limits.bytes) throw Error('unsafe stream path/size');
      const b = fs.readFileSync(absolute), audio = decodeWav(b), stats = measure(audio);
      if (s.wavSha256 && hash(b) !== s.wavSha256) throw Error('WAV hash mismatch');
      if (stats.frames !== s.sampleCount || stats.rate !== s.sampleRate || stats.channels !== 1 || s.pcmBytes !== s.sampleCount * 2 || stats.allZero) throw Error('PCM layout/silence mismatch');
      const grains = s.grains?.GranularGrains ?? [], markers = grains.map(g => g.UnkUint1);
      const products = grains.slice(0, -1).map((g, j) => g.UnkFloat1 * (markers[j + 1] - markers[j]));
      rows.push({family: i === 0 ? 'player' : 'npc', name: s.name, sha256: hash(b), ...stats,
        encodedBytes: s.encodedBytes, grainCount: grains.length, loopGroups: s.loops?.GranularLoops?.length ?? 0,
        markerPeriodProductMean: products.length ? products.reduce((a, b) => a + b, 0) / products.length : null});
      if (i === 0 && !s.name.startsWith('unresolved_')) {
        const [component, state] = s.name.split('_');
        sources.push({component, state, file, sha256: hash(b), sampleCount: stats.frames, sampleRate: stats.rate, channels: 1,
          estimatedSampleMarkers: markers});
      }
    }
  }
  if (sources.length !== 6) throw Error('missing player streams');
  for (const f of ['source-manifest.json', 'source-analysis.json']) if (fs.existsSync(path.join(dir, f))) throw Error('existing preparation output');
  fs.writeFileSync(path.join(dir, 'source-manifest.json'), JSON.stringify({schemaVersion: 1, family: 'bati/v_twin_2',
    provenance: 'Local stock recordings. Marker interpretation and scheduling are estimates, not live RPM.', sources}, null, 2) + '\n', {flag: 'wx'});
  fs.writeFileSync(path.join(dir, 'source-analysis.json'), JSON.stringify(rows, null, 2) + '\n', {flag: 'wx'});
  console.log('Validated 12 private stock WAVs; prepared six independent player layers.'); return rows;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {if (process.argv.length !== 3) throw Error('Usage: node tools/Prepare-BatiSources.mjs PRIVATE_EXTRACTION_DIRECTORY'); prepare(process.argv[2]);}
  catch (e) {console.error(e.message); process.exitCode = 1;}
}
