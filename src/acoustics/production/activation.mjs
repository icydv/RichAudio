// Production composition gate. Configuration requests cannot certify acceptance.
// A future host must supply reviewed, digest-bound acceptance records and its
// current session approval. This pure evaluator opens no device and launches no
// process; it does not authenticate an arbitrary JSON document or grant consent.
export const defaultFeatureRequests=Object.freeze({schema:1,
  modificationAwareLoudness:false,synchronizedAudioRecording:false});

const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
const session=s=>typeof s==='string'&&/^[a-f0-9]{32}$/i.test(s);
function scopeKey(s) {
  if(!s||typeof s.gameVersion!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,6}\.\d{1,6}$/.test(s.gameVersion)||
    !Number.isInteger(s.modelHash)||s.modelHash<1||s.modelHash>0xffffffff||!digest(s.gameSha256)||!digest(s.providerSha256)||
    s.quantity!=='normalised-engine-operating-state'||s.handleDomain!=='shv')return null;
  return `${s.gameVersion}:${s.gameSha256.toLowerCase()}:${s.modelHash}:${s.providerSha256.toLowerCase()}:${s.quantity}:${s.handleDomain}`;
}
const requirements=Object.freeze({
  telemetry:['primaryPassed','humanScopeReviewAccepted','rawValuesPreserved'],
  handoff:['independentIdentityCorrelation','clockMappingValidated','staleStateRejected','failClosedValidated'],
  playback:['actualProductionChain','enginePcmNonzero','exhaustPcmNonzero','outputPcmNonzero'],
  listening:['humanListeningAccepted'],
  loudness:['trafficListeningCalibrationAccepted','headroomValidated'],
});
function accepted(record,kind,key) {
  return !!key&&record?.kind===kind&&record.provenance==='actual-live'&&record.verdict==='accepted'&&
    digest(record.evidenceSha256)&&scopeKey(record.scope)===key&&requirements[kind].every(k=>record[k]===true);
}
export function evaluateProductionActivation(requests=defaultFeatureRequests,evidence={},scope={},currentSession='') {
  if(requests?.schema!==1||typeof requests.modificationAwareLoudness!=='boolean'||typeof requests.synchronizedAudioRecording!=='boolean')
    throw Error('Explicit schema1 feature requests are required.');
  const key=scopeKey(scope), stages={};
  stages.telemetry=accepted(evidence.telemetry,'telemetry',key);
  stages.handoff=stages.telemetry&&accepted(evidence.handoff,'handoff',key);
  stages.playback=stages.handoff&&accepted(evidence.playback,'playback',key);
  stages.listening=stages.playback&&accepted(evidence.listening,'listening',key);
  stages.loudnessCalibrated=stages.listening&&accepted(evidence.loudness,'loudness',key);
  const permit=evidence.currentAuthorization;
  const sameSession=session(currentSession)&&permit?.sessionId===currentSession;
  const core=stages.listening&&sameSession;
  const loudnessCalibration=core&&requests.modificationAwareLoudness&&permit.loudnessCalibrationApproved===true;
  const recording=core&&requests.synchronizedAudioRecording&&permit.recordAudioTestApproved===true;
  const loopback=recording&&permit.loopbackApproved===true;
  const missing=Object.keys(stages).filter(k=>!stages[k]);
  if(!sameSession)missing.push('current-session-authorization');
  return Object.freeze({schema:1,scopeValid:!!key,stages:Object.freeze(stages),
    loudnessCalibrationAllowed:loudnessCalibration,
    productionLoudnessAllowed:loudnessCalibration&&stages.loudnessCalibrated,
    ownedPcmRecordingAllowed:recording,loopbackRecordingAllowed:loopback,
    // Mapping to the native recording API is explicit. A configuration flag,
    // menu render or recorder constructor is never an implicit start action.
    recordingReadiness:Object.freeze({FeatureEnabled:requests.synchronizedAudioRecording,
      ExplicitUserStart:sameSession&&permit.recordAudioTestApproved===true,
      TelemetryQualified:stages.telemetry,HandoffQualified:stages.handoff,
      LivePcmVerified:stages.playback,HumanListeningApproved:stages.listening,
      LoopbackExplicitlyApproved:loopback}),
    missing:Object.freeze(missing),grantsAuthorization:false,opensEndpoint:false});
}
