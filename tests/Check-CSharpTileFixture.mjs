import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {inspectTileGroup,checkVisualSnapshot,vector,independentPatch} from '../src/acoustics/research/tile-inspection.mjs';
import {snapshotSvg,snapshotHtml} from '../src/acoustics/research/tile-replay.mjs';
import {fileURLToPath} from 'node:url';import {inspectPrivateTile} from '../tools/Inspect-DiagnosticTile.mjs';
const dir=process.argv[2],read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
for(const name of ['wall','ground','slope']){
 const g=read(name+'.json'),r=inspectTileGroup(g),p=read(name+'-patch.json');assert.equal(r.status,'candidate-inferred');assert(Math.hypot(...r.plane.center.map((x,i)=>x-vector(p.Center)[i]))<1e-10);assert(Math.hypot(...r.plane.normal.map((x,i)=>x-vector(p.Normal)[i]))<1e-10);assert(Math.abs(r.plane.rms-p.Rms)<1e-10);assert(Math.abs(r.plane.maxResidual-p.MaxResidual)<1e-10);assert.equal(r.plane.planeTolerance,p.PlaneTolerance);
 const independent=independentPatch(g,r);assert.equal(independent.Footprint.length,p.Footprint.length);for(const v of p.Footprint){const d=vector(v).map((x,i)=>x-r.plane.center[i]);assert(Math.abs(d.reduce((s,x,i)=>s+x*r.plane.normal[i],0))<1e-10);assert(independent.Footprint.some(q=>Math.hypot(...vector(q).map((x,i)=>x-vector(v)[i]))<1e-10));}
}
const snapshot=read('snapshot.json');const checked=checkVisualSnapshot(snapshot,[read('wall.json'),read('ground.json')],[independentPatch(read('wall.json')),independentPatch(read('ground.json'))]);
assert.deepEqual(fs.readFileSync(path.join(dir,'snapshot.json')),fs.readFileSync(path.join(dir,'snapshot-again.json')));
fs.writeFileSync(path.join(dir,'synthetic-replay.svg'),snapshotSvg(snapshot,{synthetic:true}),{flag:'wx'});fs.writeFileSync(path.join(dir,'synthetic-replay.html'),snapshotHtml(snapshot,{synthetic:true}),{flag:'wx'});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),input=path.join(dir,'inspection-input'),out=path.join(dir,'inspection-output');fs.mkdirSync(input);for(const [from,to] of [['wall.json','wall-group.json'],['ground.json','ground-group.json'],['snapshot.json','final-snapshot.json']])fs.copyFileSync(path.join(dir,from),path.join(input,to),fs.constants.COPYFILE_EXCL);const summary=inspectPrivateTile(root,input,out);assert.equal(summary.classification,'offline-independent-validation-complete');assert.equal(summary.visualCheck.primitives,104);assert.throws(()=>inspectPrivateTile(root,input,out),/fresh/);
console.log('PASS: independent JS plane, primitive, provenance and deterministic replay checks '+JSON.stringify(checked));
