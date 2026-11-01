// Actual reviewed telemetry acceptance is an input to the pure composition gate.
// These controls do not authenticate arbitrary JSON, grant permission, enforce
// live engine-running/identity restrictions, or manufacture later-stage receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {evaluateProductionActivation} from '../src/acoustics/production/activation.mjs';

const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const read=file=>JSON.parse(fs.readFileSync(path.join(repo,file),'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(path.resolve(repo,file))).digest('hex');
const files={acceptance:'evidence/playable-08-engine-state-acceptance.json',
  live:'evidence/playable-08-guided-live.json',rollback:'evidence/playable-08-guided-rollback.json',
  incomplete:'evidence/playable-08-live.json',activation:'src/acoustics/production/activation.mjs',
  analyzer:'tools/Analyze-ShvTelemetry.mjs'};
const acceptance=read(files.acceptance),live=read(files.live),rollback=read(files.rollback),incomplete=read(files.incomplete);
const requests={schema:1,modificationAwareLoudness:true,synchronizedAudioRecording:true};
const scope=acceptance.scope;
const outcomes=[];
function test(name,run){run();outcomes.push({name,passed:true});console.log(`PASS acceptance ${name}`);}
function evaluate(evidence={telemetry:acceptance},requestedScope=scope,currentSession=''){
  return evaluateProductionActivation(requests,evidence,requestedScope,currentSession);
}
function assertProductBlocked(result){
  for(const stage of ['handoff','playback','listening','loudnessCalibrated'])assert.equal(result.stages[stage],false,stage);
  for(const permission of ['loudnessCalibrationAllowed','productionLoudnessAllowed','ownedPcmRecordingAllowed','loopbackRecordingAllowed'])assert.equal(result[permission],false,permission);
  assert.equal(result.grantsAuthorization,false);assert.equal(result.opensEndpoint,false);
}

test('actual acceptance digests, exact scope and measurements match reviewed evidence',()=>{
  assert.equal(acceptance.kind,'telemetry');assert.equal(acceptance.provenance,'actual-live');assert.equal(acceptance.verdict,'accepted');
  assert.equal(acceptance.evidenceSha256,hash(files.live));
  assert.equal(acceptance.integrity.actualLiveEvidenceSha256,hash(files.live));
  assert.equal(acceptance.integrity.rollbackEvidenceSha256,hash(files.rollback));
  assert.equal(acceptance.integrity.primaryAnalyzerSha256,hash(files.analyzer));
  assert.equal(scope.gameVersion,live.route.gtaProductVersion);assert.equal(scope.gameSha256,live.route.gtaExecutableSha256);
  assert.equal(scope.providerSha256,live.candidate.sha256);assert.equal(scope.modelHash,parseInt(live.capture.modelHash,16));
  assert.equal(scope.handleDomain,'shv');assert.equal(scope.quantity,'normalised-engine-operating-state');
  assert.equal(acceptance.qualifiedContext.scriptHookVSha256,live.route.shvSha256);
  assert.equal(acceptance.qualifiedContext.rphSha256,live.route.rphSha256);
  assert.equal(acceptance.qualifiedContext.publishedNativeHash,live.route.nativeTargetHash);
  assert.equal(acceptance.qualifiedContext.observedRawMinimum,live.capture.rawRatio.minimum);
  assert.equal(acceptance.qualifiedContext.observedRawMaximum,live.capture.rawRatio.maximum);
  const fields={completeTriplets:live.capture.completeDeclaredReturnObservationTriplets,
    distinctRawFloatBitPatterns:live.capture.distinctRawBits,
    primaryCriteriaPassed:Object.values(live.primaryAnalysis.criteria).filter(Boolean).length,
    initialIdleSeconds:live.primaryAnalysis.initialIdle.durationSeconds,
    returnIdleSeconds:live.primaryAnalysis.returnIdle.durationSeconds,
    accelerationSpeedQuarterDeltaMps:live.primaryAnalysis.acceleration.speedQuarterDelta,
    accelerationRatioQuarterDelta:live.primaryAnalysis.acceleration.ratioQuarterDelta,
    decelerationSpeedQuarterDeltaMps:live.primaryAnalysis.deceleration.speedQuarterDelta,
    decelerationRatioQuarterDelta:live.primaryAnalysis.deceleration.ratioQuarterDelta};
  for(const [key,value] of Object.entries(fields))assert.equal(acceptance.observations[key],value,key);
  assert.equal(live.capture.allPreAndPostEngineRunningRaw,1);
  assert.equal(live.capture.sourceProviderValid,false);assert.equal(live.primaryAnalysis.providerQualified,false);
  assert.equal(acceptance.qualifiedContext.engineRunningTrueOnly,true);
  assert.equal(acceptance.nextGate.handoffQualified,false);assert.equal(acceptance.nextGate.livePlaybackQualified,false);
  assert.equal(acceptance.nextGate.humanListeningAccepted,false);assert.equal(acceptance.nextGate.grantsAuthorization,false);
  assert.equal(acceptance.nextGate.trustedCompositionMustAuthenticateReviewedReceiptAndEnforceRestrictions,true);
  assert.equal(rollback.result,'PASS');
});

let privateDigestsChecked=false;
const privateArg=arg('--private-root');
if(privateArg)test('private frozen analysis, human report and independent reviews retain their accepted digests',()=>{
  const base=path.resolve(repo,privateArg);
  assert.ok(base.startsWith(path.join(repo,'.local','playable-08')+path.sep));
  const pins={
    'analysis.json':acceptance.integrity.privateAnalysisSha256,
    'independent-review.json':acceptance.integrity.privateIndependentReviewSha256,
    'user-observation.json':acceptance.integrity.privateHumanReportSha256,
    'independent-postrollback.json':acceptance.integrity.privateIndependentPostrollbackSha256,
  };
  for(const [name,digest] of Object.entries(pins))assert.equal(hash(path.join(base,name)),digest,name);
  const primary=JSON.parse(fs.readFileSync(path.join(base,'analysis.json'),'utf8'));
  assert.equal(primary.verdict,'candidate-consistent');assert.ok(Object.values(primary.criteria).every(Boolean));
  assert.equal(primary.providerQualified,false);assert.equal(primary.measurements.recordedObservations,1633);
  privateDigestsChecked=true;
});

const telemetryOnly=evaluate();
test('actual restricted telemetry passes while every later stage and requested feature stays blocked',()=>{
  assert.equal(telemetryOnly.scopeValid,true);assert.equal(telemetryOnly.stages.telemetry,true);
  assert.equal(telemetryOnly.recordingReadiness.TelemetryQualified,true);
  assert.equal(telemetryOnly.recordingReadiness.FeatureEnabled,true);
  assert.equal(telemetryOnly.recordingReadiness.ExplicitUserStart,false);
  assertProductBlocked(telemetryOnly);
});
test('caller supplied nominal session flags cannot replace missing handoff, PCM and listening evidence',()=>{
  // A labelled untrusted structural request, never an actual permission receipt.
  const sessionId='f'.repeat(32);
  const result=evaluate({telemetry:acceptance,currentAuthorization:{
    provenance:'untrusted-test-request',sessionId,loudnessCalibrationApproved:true,
    recordAudioTestApproved:true,loopbackApproved:true}},scope,sessionId);
  assert.equal(result.stages.telemetry,true);assertProductBlocked(result);
});
test('the preserved first PLAYABLE08 incomplete attempt cannot become telemetry acceptance',()=>{
  assert.equal(incomplete.primaryAnalysis.verdict,'incomplete');
  const result=evaluate({telemetry:incomplete});assert.equal(result.stages.telemetry,false);assertProductBlocked(result);
});
for(const [name,patch] of [
  ['another vehicle',{modelHash:1}],['another provider artifact',{providerSha256:'0'.repeat(64)}],
  ['RPH handles',{handleDomain:'rph'}],['another executable',{gameSha256:'0'.repeat(64)}],
  ['physical RPM units',{quantity:'physical-crankshaft-rpm'}],
])test(`actual receipt cannot qualify ${name}`,()=>{
  const result=evaluate({telemetry:acceptance},{...scope,...patch});
  assert.equal(result.stages.telemetry,false);assertProductBlocked(result);
});
test('fixture provenance and absent human review remain rejected negative mutations',()=>{
  for(const patch of [{provenance:'fixture'},{humanScopeReviewAccepted:false}]){
    const result=evaluate({telemetry:{...acceptance,...patch}});
    assert.equal(result.stages.telemetry,false);assertProductBlocked(result);
  }
});

const report={schema:1,profile:'PLAYABLE-08',scope:'Actual restricted telemetry acceptance through the unchanged pure production composition gate; later-stage acceptance records are absent.',
  sourcePins:Object.fromEntries(Object.entries(files).map(([name,file])=>[name,hash(file)])),
  testSourceSha256:hash(fileURLToPath(import.meta.url)),passed:outcomes.length,failed:0,
  privateDigestsChecked,telemetryStageTrue:telemetryOnly.stages.telemetry,
  featureRequests:requests,telemetryOnlyGate:telemetryOnly,outcomes,
  noLaterStageAcceptanceInvented:true,actualGameStarted:false,actualShvExecuted:false,
  audioHostStarted:false,endpointOpened:false,productionFeaturesActivated:false,
  limitations:['The evaluator is structural and does not authenticate arbitrary JSON or grant user consent.',
    'Trusted future composition must authenticate the reviewed receipt and enforce engine-running, offline local-driver, exact-build and handle-domain restrictions on every live observation.',
    'These controls qualify no handoff, live PCM, listening, loudness, audio recording, physical RPM, engine-off state or other vehicle.']};
const outputArg=arg('--output');
if(outputArg){
  assert.equal(privateDigestsChecked,true,'A saved validation receipt requires the private evidence digest checks.');
  const output=path.resolve(repo,outputArg),allowed=path.join(repo,'.local','playable-08')+path.sep;
  assert.ok(output.startsWith(allowed),'Output must remain under the private PLAYABLE08 root.');
  for(let parent=path.dirname(output);;parent=path.dirname(parent)){
    if(fs.existsSync(parent))assert.equal(fs.lstatSync(parent).isSymbolicLink(),false,'Linked output ancestors refused.');
    if(path.dirname(parent)===parent)break;
  }
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(`PASS ${outcomes.length} restricted acceptance controls; telemetry only, no host/device/runtime activation.`);
