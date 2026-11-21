import fs from 'node:fs';
import assert from 'node:assert/strict';
import {reconstructSurface} from '../src/acoustics/research/surface-reconstruction.mjs';
const batch=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),r=reconstructSurface(batch);
assert.equal(r.status,'candidate-inferred',r.reasons.join(';'));
assert.deepEqual(r.candidate.center,[4,0,1]);assert(Math.abs(r.candidate.normal[0]+1)<1e-12);
assert.equal(r.counts.validHits,9);assert.equal(r.certifiedAcousticGeometry,false);
console.log('PASS: C# original synthetic batch independently read and fitted in JavaScript.');
