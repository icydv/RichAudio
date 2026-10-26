import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {privatePath,inspectPrivate} from '../tools/Inspect-SurfaceBatch.mjs';
import {flatFixture} from './fixtures/SurfaceFixtures.mjs';
import {surfaceSvg} from '../src/acoustics/research/surface-visualisation.mjs';
import {reconstructSurface} from '../src/acoustics/research/surface-reconstruction.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-owned-surface-'));
fs.mkdirSync(path.join(root,'.local')); // Own isolated original fixtures only.
test('private output rejects public destination and prefix-lookalike',()=>{assert.throws(()=>privatePath(root,path.join(root,'public.json')));assert.throws(()=>privatePath(root,path.join(root,'.local-other','evidence.json')));});
test('linked directory rejected without reading its target',()=>{const dir=path.join(root,'own-target');fs.mkdirSync(dir);const link=path.join(root,'.local','linked');fs.symlinkSync(dir,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>privatePath(root,path.join(link,'batch.json')),/linked/);fs.unlinkSync(link);});
test('oversized input fails before parsing',()=>{const p=path.join(root,'.local','oversize.json');fs.writeFileSync(p,'x'.repeat(262145));assert.throws(()=>inspectPrivate(root,p,path.join(root,'.local','oversize-out')),/bounded/);});
test('synthetic private inspection creates new diagnostics and refuses overwrites',()=>{const p=path.join(root,'.local','synthetic.json'),out=path.join(root,'.local','out');fs.writeFileSync(p,JSON.stringify(flatFixture()));const r=inspectPrivate(root,p,out);assert.equal(r.status,'candidate-inferred');assert.equal(r.certifiedAcousticGeometry,false);assert.equal(r.physicalArrivalTime,null);const original=fs.readFileSync(path.join(out,'reconstruction.json'));assert.throws(()=>inspectPrivate(root,p,out),/fresh/);assert.deepEqual(original,fs.readFileSync(path.join(out,'reconstruction.json')));});
test('setup failure is retained without inventing a visualisation',()=>{const b=flatFixture();b.Forward={X:0,Y:0,Z:0};b.Samples=[];b.TraceCalls=0;b.Completion='stopped';const p=path.join(root,'.local','stopped.json'),out=path.join(root,'.local','stopped-out');fs.writeFileSync(p,JSON.stringify(b));const r=inspectPrivate(root,p,out);assert.equal(r.status,'rejected');assert.equal(r.visualisationAvailable,false);assert(fs.existsSync(path.join(out,'reconstruction.json')));});
test('SVG is deterministic, labels uncertainty and uses actual candidate/hit counts',()=>{const b=flatFixture(),r=reconstructSurface(b),svg=surfaceSvg(b,r,{synthetic:true});assert.equal(svg,surfaceSvg(b,r,{synthetic:true}));assert.match(svg,/9 valid hits/);assert.match(svg,/ORIGINAL SYNTHETIC DATA/);assert.match(svg,/unknown/);assert.match(svg,/not a GTA reconstruction/);assert.match(svg,/inferred interior patch/);});
test('new adapter has no post-result ten-minute sleep and contains only bounded trace call site',()=>{const source=fs.readFileSync(new URL('../src/acoustics/observation/SurfaceObserver.Rph.cs',import.meta.url),'utf8');assert.equal((source.match(/World\.TraceLine\(/g)||[]).length,1);assert(!source.includes('GameFiber.Sleep(600000)'));assert(source.includes('lifecycle.IsTerminal'));assert(source.includes('catch(ThreadAbortException){throw;}'));assert(!/ResetAbort\(|SET_|World\.GetAll|PlaySound|Teleport/.test(source));});
