import test from 'node:test';
import assert from 'node:assert/strict';
import {compareXmlBuilding05,xmlAcousticPoses05} from '../tools/Compare-XmlBuilding05.mjs';
import {admittedOriginalXml05} from './fixtures/AdmittedXml05.mjs';
import {originalSourceBank05} from './fixtures/SourcePreparation05.mjs';
let shared;const comparison=()=>shared??=compareXmlBuilding05({blocks:96});
test('original actual-XML geometry changes matched analytic stock PCM through the existing source/pipeline',async()=>{
 const {report:r,pcm}=await comparison();assert.equal(pcm,null);assert.equal(r.finiteSurfaces,12);assert.equal(r.frames,96*512);
 const hashes=new Set();for(const c of Object.values(r.cases)){assert.equal(c.comparison.dryBitIdentical,true);assert.equal(c.comparison.stereoBitIdentical,false);assert(c.comparison.steadyDifferenceRms>1e-12);for(const arm of [c.open,c.building]){hashes.add(arm.drySHA256);assert.equal(arm.sourceCount,1);assert.equal(arm.sourceFrame,r.frames);assert.equal(arm.frames,r.frames);assert(arm.metrics.peak>0&&arm.metrics.peak<1);assert(arm.metrics.steadyRms>0);assert.equal(arm.limited,0);assert.equal(arm.historyAffectedFrames,0);assert.equal(arm.sourceConstruction.outsideRender,true);assert.equal(arm.sourceConstruction.sourceFrameBeforeRender,0);assert.equal(arm.sourceConstruction.cpuIsolation,false);assert.deepEqual(arm.sourcePressureGains,{'stock:slot0:engine':.25,'stock:slot0:exhaust':2.5});}}
 assert.equal(hashes.size,1);assert.equal(r.workers.cacheStarted,r.workers.cacheJoined);assert.equal(r.workers.sceneStarted,r.workers.sceneJoined);assert.equal(r.qualification.genuineResourceVerified,false);assert.equal(r.limits.endpointOpened,false);assert.equal(r.limits.recordingStarted,false);
});
test('beside the cube, selected solver reflections are longer than clear matched direct paths',async()=>{
 const {report:r}=await comparison(),c=r.cases.beside;
 assert(c.open.finalPaths.every(p=>p.order===0));assert(c.building.finalPaths.some(p=>p.order>0));assert(c.building.directQueries.every(q=>q.visibility==='clear'));
 for(const delta of c.comparison.directLoss){assert(delta.open&&delta.building);assert(delta.additionalAttenuationDb.every(v=>Math.abs(v)<1e-7));}
 for(const p of c.building.finalPaths){assert.equal(p.evidence,'selected-existing-solver-result');assert(Math.abs(p.delaySeconds-p.distance/343)<1e-8);assert(p.bands.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.equal(p.vertices.length,p.order+2);
  if(p.order>0){const direct=c.building.finalPaths.find(d=>d.sourceId===p.sourceId&&d.order===0);assert(p.distance>direct.distance);assert(p.materialInteractions.every(m=>m.kind==='reflection'&&m.basis==='authored-assumption'));}}
});
test('opposite poses retain explicit obstruction/transmission losses without invented diffraction',async()=>{
 const {report:r}=await comparison(),c=r.cases.obstructed;
 assert(c.building.directQueries.every(q=>q.visibility==='blocked'&&q.hits.length>=2));
 for(const delta of c.comparison.directLoss){assert(delta.building&&delta.open);assert(delta.additionalAttenuationDb.every(v=>v>0));assert(delta.building.materialInteractions.some(m=>m.kind==='transmission'));}
 assert(c.building.metrics.steadyRms<c.open.metrics.steadyRms);assert.equal(r.limits.diffractionModelAdded,false);
 assert(c.building.finalPaths.every(p=>p.order<=2&&p.materialInteractions.every(m=>['reflection','transmission'].includes(m.kind))));
});
test('open/building/open recomposition retains the existing source cursor, PCM history and frame count',async()=>{
 const {report:r}=await comparison(),c=r.continuity;assert.equal(c.dryMatchesReference,true);assert.equal(c.framesMatchReference,true);assert.equal(c.cursorContinuous,true);assert.equal(c.rendererHistoryStable,true);assert.equal(c.sourceCount,1);assert.equal(c.sceneChanges.length,2);assert.equal(c.sceneReplacements,2);assert.equal(c.pcmQueueFramesAdded,0);assert.equal(c.historyAffectedFrames,0);assert.equal(c.limited,0);
 for(const change of c.sceneChanges){assert.equal(change.sourceFrame,change.block*512);assert.equal(change.rendererFrame,change.block*512);assert.equal(change.sourceObjectUnchanged,true);}
});
test('comparison bounds reject before preparing geometry or sources',async()=>{for(const options of [{blocks:1},{blocks:193},{includePcm:'yes'}])await assert.rejects(compareXmlBuilding05(options),/bounded/);});
test('explicit admitted east-building inputs use shifted poses and reject missing, unqualified or out-of-bounds inputs',async()=>{
 const f=admittedOriginalXml05({group:'gen9-corner-east',tileId:'original-xml05-east-comparison'}),building={admission:f.admission,inputs:f.inputs,session:f.session},bank=originalSourceBank05(),poses=Object.fromEntries(Object.entries(xmlAcousticPoses05).map(([name,p])=>[name,{source:p.source.map((v,i)=>i===0?v+40:v),listener:p.listener.map((v,i)=>i===0?v+40:v)}]));
 await assert.rejects(compareXmlBuilding05({building,bank}),/explicit in-memory bank and poses/);
 await assert.rejects(compareXmlBuilding05({building:{...building,admission:{...f.admission}},bank,poses}),/branded XML admission/);
 const outside=structuredClone(poses);outside.beside.source=[40,0,7.6];await assert.rejects(compareXmlBuilding05({building,bank,poses:outside}),/emitters.*within admitted tile/);
 const {report:r}=await compareXmlBuilding05({blocks:64,building,bank,poses});assert.equal(r.kind,'RichAudioSuppliedXmlAcousticComparison05');assert.equal(r.inputBasis,'controlled-supplied-memory-and-admitted-XML');assert.equal(r.finiteSurfaces,12);assert.deepEqual(r.cases.beside.building.poses,poses.beside);assert(r.cases.beside.building.finalPaths.some(p=>p.order>0));assert(r.cases.beside.building.finalPaths.every(p=>p.vertices.every(v=>v[0]>=r.geometryBounds.min[0]&&v[0]<=r.geometryBounds.max[0])));assert(r.geometryBounds.min[0]>20);assert.equal(r.cases.beside.comparison.dryBitIdentical,true);assert.equal(r.cases.obstructed.comparison.dryBitIdentical,true);assert.equal(r.limits.genuineBatiBankVerified,false);assert.equal(r.limits.privateBankFileRead,false);assert.equal(r.qualification.installedWorldVerified,false);
});
test('externally changed supplied-memory bank cannot retain an identical-source comparison claim',async()=>{
 const f=admittedOriginalXml05(),building={admission:f.admission,inputs:f.inputs,session:f.session},bank=originalSourceBank05(),asset=bank.layers.engine.idle;let constructors=0;
 // Controlled mutation at the second real source construction, between paired
 // arms. It exercises report qualification rather than a timing race.
 Object.defineProperty(bank,'provenance',{get(){if(++constructors===2)asset.samples.fill(0);return undefined;}});
 const {report:r}=await compareXmlBuilding05({blocks:64,building,bank,poses:xmlAcousticPoses05});assert.equal(r.cases.beside.comparison.dryBitIdentical,false);assert.equal(r.limits.sourceAndControlsIdentical,false);assert.equal(r.limits.bankOriginVerified,false);assert.equal(r.limits.endpointOpened,false);
});
