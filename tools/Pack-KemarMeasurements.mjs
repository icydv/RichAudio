import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [directory] = process.argv.slice(2);
assert.ok(directory, 'Pass the extracted MIT KEMAR compact.zip directory');
const records = [];
for (let elevation = -40; elevation <= 90; elevation += 10) {
  const row = join(directory, 'elev' + elevation);
  for (const filename of readdirSync(row).sort()) {
    const azimuth = Number(/^H-?\d+e(\d{3})a\.wav$/.exec(filename)?.[1]);
    assert.ok(Number.isInteger(azimuth) && azimuth >= 0 && azimuth <= 180, filename);
    const wave = readFileSync(join(row, filename));
    assert.equal(wave.toString('ascii', 0, 12), 'RIFF$\x02\x00\x00WAVE');
    assert.equal(wave.readUInt16LE(20), 1, 'PCM');
    assert.equal(wave.readUInt16LE(22), 2, 'stereo');
    assert.equal(wave.readUInt32LE(24), 44100);
    assert.equal(wave.readUInt16LE(34), 16);
    assert.equal(wave.toString('ascii', 36, 40), 'data');
    assert.equal(wave.readUInt32LE(40), 512);
    const dimensions = Buffer.alloc(4);
    dimensions.writeInt16LE(elevation, 0);
    dimensions.writeInt16LE(azimuth, 2);
    records.push(dimensions, wave.subarray(44, 556));
  }
}
assert.equal(records.length / 2, 368);
const data = Buffer.concat(records).toString('base64');
const lines = data.match(/.{1,100}/g).map(line => '  ' + JSON.stringify(line) + ',').join('\n');
writeFileSync(new URL('../src/acoustics/streaming/kemar-measurements.mjs', import.meta.url), `// Measured HRIR compact data by Bill Gardner and Keith Martin, MIT Media Laboratory.
// Copyright 1994 MIT Media Laboratory. Usage is unrestricted with attribution to the authors.
// Generated with tools/Pack-KemarMeasurements.mjs from https://sound.media.mit.edu/resources/KEMAR.html
// Each record is little-endian int16 elevation, azimuth, and 128 interleaved stereo samples.
export const compactMeasurements = [
${lines}
].join('');
`);
