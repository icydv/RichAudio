// Independent checks over original XML and explicit synthetic review policies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCodeWalkerXmlBuilding05} from '../src/acoustics/world/codewalker-xml05.mjs';
import {inspectXmlGeometry05,admitXmlBuilding05,validateXmlWitness05,rebindCachedXmlAdmission05,verifyXmlAdmission05,boundedXmlMetadata05} from '../src/acoustics/world/xml-evidence05.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {convertCollision,transformPoint,triangleNormal} from '../src/acoustics/world/collision-mesh.mjs';
import {entityMatrix} from '../src/acoustics/world/placements.mjs';
import {byteDigest,digest} from '../src/acoustics/world/contracts.mjs';
import {originalCodeWalkerXml05} from './fixtures/CodeWalkerXml05.mjs';
import {admittedOriginalXml05} from './fixtures/AdmittedXml05.mjs';
const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert(Math.abs(x-b[i])<1e-8,`${x} vs ${b[i]}`));};
function changed(group,kind,change){const input=originalCodeWalkerXml05(group),r=input.resources.find(r=>r.kind===kind);r.xml=Buffer.from(change(r.xml.toString('utf8')));r.expectedSHA256=byteDigest(r.xml);return input;}

test('unqualified rotated and mirrored inspection triangles retain correct transformed winding and normals',()=>{
 for(const mirrored of [false,true]){
  const input=mirrored?changed('gen9-transform-challenge','ymap',xml=>xml.replace('<scaleZ value="3"','<scaleZ value="-3"')):originalCodeWalkerXml05('gen9-transform-challenge');
  const decoded=decodeCodeWalkerXmlBuilding05(input),raw=decoded.resources.find(r=>r.kind==='ybn').normalized.data,source=convertCollision(raw).chunks[0].triangles[0],inspection=inspectXmlGeometry05(decoded),matrix=entityMatrix(inspection.entity),expected=(mirrored?[source.positions[0],source.positions[2],source.positions[1]]:source.positions).map(p=>transformPoint(p,matrix)),triangle=inspection.triangles[0];
  triangle.positions.forEach((p,i)=>near(p,expected[i]));near(triangle.normal,triangleNormal(triangle.positions));assert.notDeepEqual(triangle.normal,source.normal);assert.equal(inspection.canPublishAcoustics,false);assert.equal(inspection.genuineResourceVerified,false);
 }
});
test('finite unknown envelopes receive entity placement exactly once and remain part of inspection bounds',()=>{
 const input=changed('gen9-transform-challenge','ybn',xml=>xml.replace('type="Geometry"','type="Sphere"'));
 for(const frame of ['archetype-local','world']){
  input.selection.collisionFrame=frame;const decoded=decodeCodeWalkerXmlBuilding05(input),raw=convertCollision(decoded.resources.find(r=>r.kind==='ybn').normalized.data),before=raw.unknownRegions[0].bounds,inspection=inspectXmlGeometry05(decoded),matrix=entityMatrix(inspection.entity);
  const corners=Array.from({length:8},(_,mask)=>before.min.map((x,i)=>(mask>>i)&1?before.max[i]:x)),points=frame==='world'?corners:corners.map(p=>transformPoint(p,matrix));
  const expected={min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
  near(inspection.unknown[0].bounds.min,expected.min);near(inspection.unknown[0].bounds.max,expected.max);near(inspection.geometryBounds.min,expected.min);near(inspection.geometryBounds.max,expected.max);assert.equal(inspection.triangles.length,0);assert.equal(decoded.supported,false);
 }
});
test('serialized integrity grants and copied policy/admission objects cannot acquire a parent XML plan',()=>{
 const f=admittedOriginalXml05(),integrity=validateXmlWitness05(structuredClone(f.witness));
 assert.throws(()=>verifyXmlAdmission05(integrity),/branded XML admission/);
 assert.throws(()=>qualifyResourceInventory04(f.inventoryInput,{xmlAdmission05:integrity}),/branded XML admission/);
 assert.throws(()=>qualifyResourceInventory04(f.inventoryInput,{xmlAdmission05:{...f.admission}}),/branded XML admission/);
 assert.throws(()=>admitXmlBuilding05({decoded:f.decoded,evidence:f.evidence,reviewPolicy:{...f.reviewPolicy}}),/branded pinned review policy/);
});
test('cached admission rebind requires the separately pinned exact qualification digest and reviewed policy',()=>{
 const f=admittedOriginalXml05(),copy=structuredClone(f.witness),token=rebindCachedXmlAdmission05({witness:copy,reviewPolicy:f.reviewPolicy,expectedQualificationDigest:f.witness.qualificationDigest});
 assert.equal(verifyXmlAdmission05(token).qualificationDigest,f.witness.qualificationDigest);assert.equal(qualifyResourceInventory04(f.inventoryInput,{xmlAdmission05:token}).tilePlans.length,1);
 copy.bounds.max[0]++;const {qualificationDigest,...body}=copy;copy.qualificationDigest=digest(body);
 assert.throws(()=>rebindCachedXmlAdmission05({witness:copy,reviewPolicy:f.reviewPolicy,expectedQualificationDigest:qualificationDigest}),/exact expected policy/);
 assert.throws(()=>rebindCachedXmlAdmission05({witness:f.witness,reviewPolicy:f.reviewPolicy}),/exact expected policy/);
});
test('evidence metadata rejects hidden arrays and accessors before copying or evaluating their payload',()=>{
 const f=admittedOriginalXml05(),hidden=structuredClone(f.evidence);hidden.controls.points[0].world.unrelated='original-extra-marker';
 assert.throws(()=>admitXmlBuilding05({decoded:f.decoded,evidence:hidden,reviewPolicy:f.reviewPolicy}),/dense XML metadata arrays/);
 let read=false;const getter=structuredClone(f.evidence);Object.defineProperty(getter.controls.points[0].world,'0',{enumerable:true,get(){read=true;return 0;}});
 assert.throws(()=>admitXmlBuilding05({decoded:f.decoded,evidence:getter,reviewPolicy:f.reviewPolicy}),/data properties only/);assert.equal(read,false);
 assert.throws(()=>boundedXmlMetadata05({original:'\0'.repeat(262144)}),/bounded/);
 const witness=structuredClone(f.witness);witness.unexpected='original-extra-marker';const {qualificationDigest,...body}=witness;witness.qualificationDigest=digest(body);assert.throws(()=>validateXmlWitness05(witness),/unsupported static-world fields/);
});
