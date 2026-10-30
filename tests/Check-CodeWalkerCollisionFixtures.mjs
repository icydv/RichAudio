import fs from 'node:fs';
import assert from 'node:assert/strict';
import {convertCollision,transformPoint} from '../src/acoustics/world/collision-mesh.mjs';
import {entityMatrix} from '../src/acoustics/world/placements.mjs';
const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));assert.equal(raw.evidence,'authored-local-CodeWalker-api-fixtures');
const mesh=convertCollision(raw.collision);assert.equal(mesh.counts.boxPolygons,1);assert.equal(mesh.counts.triangles,12);assert.equal(mesh.counts.oracleSamples,4);
const points=mesh.chunks[0].triangles.flatMap(t=>t.positions);for(const diagonal of raw.boxDiagonalInParent)assert.ok(points.some(p=>Math.max(...p.map((v,i)=>Math.abs(v-diagonal[i])))<.0001));
let maxError=0;for(const placement of raw.placements){const actual=transformPoint(placement.point,entityMatrix(placement));maxError=Math.max(maxError,...actual.map((v,i)=>Math.abs(v-placement.expectedWorld[i])));assert.ok(maxError<.001);}
console.log(JSON.stringify({schema:1,evidence:raw.evidence,boxTriangles:12,boxVertexOracleSamples:4,placementCases:raw.placements.length,placementMaxError:maxError,worldAssetPlacementVerified:false}));
