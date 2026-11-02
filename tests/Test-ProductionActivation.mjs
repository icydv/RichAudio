import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultFeatureRequests,evaluateProductionActivation} from '../src/acoustics/production/activation.mjs';
let checks=0;
function test(name,run){run();checks++;console.log(`PASS activation ${name}`);}
const scope={gameVersion:'1.0.1158.16',gameSha256:'b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea',modelHash:0xf9300cc5,providerSha256:'21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e',quantity:'normalised-engine-operating-state',handleDomain:'shv'};
const id='1234567890abcdef1234567890abcdef';
const req={schema:1,modificationAwareLoudness:true,synchronizedAudioRecording:true};
// Labelled structural acceptance fixtures, never actual qualification receipts.
function records(){return Object.fromEntries(Object.entries({
  telemetry:['primaryPassed','humanScopeReviewAccepted','rawValuesPreserved'],
  handoff:['independentIdentityCorrelation','clockMappingValidated','staleStateRejected','failClosedValidated'],
  playback:['actualProductionChain','enginePcmNonzero','exhaustPcmNonzero','outputPcmNonzero'],
  listening:['humanListeningAccepted'],loudness:['trafficListeningCalibrationAccepted','headroomValidated'],
}).map(([kind,fields])=>[kind,{kind,scope:{...scope},evidenceSha256:'a'.repeat(64),provenance:'actual-live',verdict:'accepted',...Object.fromEntries(fields.map(f=>[f,true]))}]))}
function approved(){return {...records(),currentAuthorization:{sessionId:id,loudnessCalibrationApproved:true,recordAudioTestApproved:true,loopbackApproved:true}};}
function evaluate(e=approved(),r=req,s=scope,sid=id){return evaluateProductionActivation(r,e,s,sid);}
test('shipped feature requests are disabled',()=>{
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../config/production-features.json',import.meta.url))),defaultFeatureRequests);
  const p=evaluate(approved(),defaultFeatureRequests);assert.equal(p.ownedPcmRecordingAllowed,false);assert.equal(p.productionLoudnessAllowed,false);
});
test('configuration alone never qualifies anything',()=>{
  const p=evaluate({});assert.equal(p.ownedPcmRecordingAllowed,false);assert.equal(p.loudnessCalibrationAllowed,false);assert.equal(p.grantsAuthorization,false);assert.equal(p.opensEndpoint,false);
});
test('actual PLAYABLE07 incomplete record cannot bypass the stages',()=>{
  const previous=JSON.parse(fs.readFileSync(new URL('../evidence/playable-07-live.json',import.meta.url)));
  const p=evaluate({telemetry:previous});assert.equal(p.stages.telemetry,false);assert.equal(p.productionLoudnessAllowed,false);assert.equal(p.ownedPcmRecordingAllowed,false);
});
for(const stage of ['telemetry','handoff','playback','listening'])test(`missing ${stage} blocks downstream activity`,()=>{
  const e=approved();delete e[stage];const p=evaluate(e);assert.equal(p.ownedPcmRecordingAllowed,false);assert.equal(p.loudnessCalibrationAllowed,false);
});
test('fixture provenance is not live acceptance',()=>{
  const e=approved();e.telemetry.provenance='fixture';assert.equal(evaluate(e).stages.telemetry,false);
});
test('different model cannot inherit Bati acceptance',()=>assert.equal(evaluate(approved(),req,{...scope,modelHash:1}).stages.telemetry,false));
test('different provider build cannot inherit acceptance',()=>assert.equal(evaluate(approved(),req,{...scope,providerSha256:'b'.repeat(64)}).stages.telemetry,false));
test('different executable with the same file version cannot inherit acceptance',()=>assert.equal(evaluate(approved(),req,{...scope,gameSha256:'b'.repeat(64)}).stages.telemetry,false));
test('RPH handle equality cannot replace independent correlation',()=>{
  const e=approved();e.handoff.independentIdentityCorrelation=false;assert.equal(evaluate(e).stages.handoff,false);
  assert.equal(evaluate(approved(),req,{...scope,handleDomain:'rph'}).scopeValid,false);
});
test('old session permission cannot start a recording',()=>{
  const p=evaluate(approved(),req,scope,'b'.repeat(32));assert.equal(p.ownedPcmRecordingAllowed,false);assert.equal(p.recordingReadiness.ExplicitUserStart,false);
});
test('explicit start is required after qualification',()=>{
  const e=approved();e.currentAuthorization.recordAudioTestApproved=false;assert.equal(evaluate(e).ownedPcmRecordingAllowed,false);
});
test('loopback permission is independent from owned PCM',()=>{
  const e=approved();e.currentAuthorization.loopbackApproved=false;const p=evaluate(e);assert.equal(p.ownedPcmRecordingAllowed,true);assert.equal(p.loopbackRecordingAllowed,false);
});
test('calibration may precede release but cannot claim calibrated traffic',()=>{
  const e=approved();delete e.loudness;const p=evaluate(e);assert.equal(p.loudnessCalibrationAllowed,true);assert.equal(p.productionLoudnessAllowed,false);
});
test('structural accepted fixtures exercise the positive gate only',()=>{
  const p=evaluate();assert.equal(p.productionLoudnessAllowed,true);assert.equal(p.loopbackRecordingAllowed,true);assert.ok(Object.isFrozen(p.recordingReadiness));
});
test('truthy strings cannot replace explicit booleans',()=>{
  const e=approved();e.playback.actualProductionChain='true';assert.equal(evaluate(e).stages.playback,false);
  assert.throws(()=>evaluate(approved(),{...req,synchronizedAudioRecording:'true'}));
});
console.log(`PASS ${checks} production activation checks; no game, host, endpoint or recording activated.`);
