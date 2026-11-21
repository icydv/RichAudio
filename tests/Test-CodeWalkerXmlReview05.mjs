// Independent adversarial controls over original portable XML only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeCodeWalkerXmlBuilding05,parseCodeWalkerXml05,codeWalkerNameHash05} from '../src/acoustics/world/codewalker-xml05.mjs';
import {originalCodeWalkerXml05} from './fixtures/CodeWalkerXml05.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function change(kind,fn){const input=originalCodeWalkerXml05(),resource=input.resources.find(r=>r.kind===kind);resource.xml=Buffer.from(fn(resource.xml.toString('utf8')));resource.expectedSHA256=hash(resource.xml);return input;}
test('selected parentIndex uses integer grammar without float-rounding fractional strings into identities',()=>{
 for(const text of ['1.00000001','1e0','-0.0000000001'])assert.throws(()=>decodeCodeWalkerXmlBuilding05(change('ymap',xml=>xml.replace('<parentIndex value="-1"','<parentIndex value="'+text+'"'))),/XML05/);
});
test('reserved CodeWalker hash prefix never silently becomes an unrelated Jenkins name',()=>{
 assert.equal(codeWalkerNameHash05('hash_1'),1);assert.equal(codeWalkerNameHash05('hash_00000001'),1);
 for(const name of ['hash_nothex','hash_','hash_100000000'])assert.throws(()=>codeWalkerNameHash05(name),/XML05/);
});
test('exactly one UTF8 BOM is accepted and duplicate BOMs cannot disguise an invalid prolog',()=>{
 assert.equal(parseCodeWalkerXml05(Buffer.from('\ufeff<x/>')).name,'x');assert.throws(()=>parseCodeWalkerXml05(Buffer.from('\ufeff\ufeff<x/>')),/XML05/);
});
test('decoded inspection data retains immutable values rather than aliases to supplied XML buffers',()=>{
 const input=originalCodeWalkerXml05(),decoded=decodeCodeWalkerXmlBuilding05(input),before=hash(JSON.stringify(decoded));
 input.resources[0].xml.fill(0);assert.equal(hash(JSON.stringify(decoded)),before);assert.equal(decoded.genuineResourceVerified,false);assert.equal(decoded.worldPlacementVerified,false);
 assert.throws(()=>{decoded.resources[0].normalized.data.entities[0].position[0]=999;},TypeError);
});
test('unknown bound geometry remains unsupported and has no invented supported triangles',()=>{
 const decoded=decodeCodeWalkerXmlBuilding05(change('ybn',xml=>xml.replace('type="Geometry"','type="UnknownShape"'))),raw=decoded.resources.find(r=>r.kind==='ybn').normalized.data;
 assert.equal(decoded.supported,false);assert(raw.nodes.every(n=>n.unsupportedBound&&n.polygons.length===0));assert(decoded.diagnostics.some(d=>d.kind==='unsupported-bound'&&d.coverage==='unknown'));
});
