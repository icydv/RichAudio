// CI exports scalar measurements only. No paths, pipe/session IDs, telemetry,
// raw errors/stacks, capabilities, PCM, recordings or environment identifiers.
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const fields=(value,keys)=>Object.fromEntries(keys.map(key=>[key,number(value?.[key])]));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
const metrics=value=>fields(value,['frames','peak','rms','stereoDifferenceRms','nonfiniteSamples','zeroCrossingsPerSecond']);
const timing=value=>fields(value,['count','median','p95','max']);
const range=value=>fields(value,['minimum','maximum']);
const safeOracle=o=>o?{observed:range(o.observed),maximumSpeed:number(o.maximumSpeed),soundSpeed:number(o.soundSpeed),tolerance:number(o.tolerance),allowed:range(o.allowed)}:null;
function profile(p){if(!p)return null;const s=p.performance?.statistics,a=p.performance?.acousticSettings,d=p.performance?.deviceFreeSink;
  return {profile:['v12','v8'].includes(p.profile)?p.profile:null,actualHostExit:number(p.actualHostExit),
    listenerPackets:number(p.listenerPackets),vehiclePackets:number(p.vehiclePackets),blocks:number(p.blocks),preHost:metrics(p.preHost),postHost:metrics(p.postHost),
    preHostSHA256:hash(p.preHostSHA256),postHostSHA256:hash(p.postHostSHA256),
    componentEnergy:fields(p.componentEnergy,['mechanical','exhaust','intake','drivetrain','tyres','aero','induction','transients']),
    componentCount:Array.isArray(p.sourceIds)?p.sourceIds.length:null,componentTravelMetres:number(p.componentTravelMetres),bodyExhaustSeparationMetres:number(p.bodyExhaustSeparationMetres),
    stableSourceGeneration:p.stableSourceGeneration===true,removedAtEnd:p.removedAtEnd===true,estimatedRpm:range(p.estimatedRpm),firingHz:range(p.firingHz),dopplerOracle:safeOracle(p.dopplerOracle),
    ratioEvidence:{...fields(p.normalizedGetterEvidence,['count','minimum','maximum','changedSamples']),usedForControl:p.normalizedGetterEvidence?.usedForControl===true},
    sourceHistory:fields(p.sourceHistory,['beforeStart','future','frameTag','generationTag','affectedFrames']),
    dsp:fields(p.dsp,['frames','limited','missingHistory','rejectedControls','cursorResets','pathOverflow','releasedSources']),
    performance:{nodeCpuSeconds:number(p.performance?.nodeCpuSeconds),hostCpuSeconds:number(p.performance?.hostCpuSeconds),wallSeconds:number(p.performance?.wallSeconds),
      synthesisMs:timing(s?.synthesisMs),workerMs:timing(s?.simulationMs),dspMs:timing(s?.dspMs),processingDeadlineMisses:number(s?.processingDeadlineMisses),
      backend:['cpu','gpu'].includes(a?.activeAcceleration)?a.activeAcceleration:null,gpuDispatches:number(a?.gpuAcousticDispatches),gpuApplied:number(a?.gpuResultsApplied),
      underflowFrames:number(d?.underflowFrames),lateSinkWakes:number(d?.missedSinkBudgets),maximumSinkLatenessMs:number(d?.maximumLatenessMs)},
    recording:{...fields(p.recording,['frames','gaps','soundMapFrames','receivedVehicleTelemetryRecords']),integrityComplete:p.recording?.integrityComplete===true,
      exactPostGainSubmissionLineage:p.recording?.exactPostGainSubmissionLineage===true,vehicleConditionalDirectRecorded:p.recording?.vehicleConditionalDirectRecorded===true},
    calibration:fields(p.calibration,['masterGain','hostGain','preHostPeakCap','postHostPeakCap','outputTrimDb','rejectedBlocks','clippedSamples','limitedFrames'])};
}
export function createVehicleCiEvidence(report,{stage='complete',error=null}={}){
  const knownStages=['build','source-manifest','v12','v8','source-verification','comparison','complete'];
  return {schemaVersion:1,milestone:'VEHICLE-LIVE-01',status:error?'failed':'passed',stage:knownStages.includes(stage)?stage:'unknown',
    gameLaunched:false,audioEndpointOpened:false,sourceDigest:hash(report?.sourceDigest),nativeFixtureSha256:hash(report?.nativeFixtureSha256),
    v12:profile(report?.v12),v8:profile(report?.v8),
    failure:error?{kind:error.name==='AssertionError'?'assertion':'execution',
      predicate:error.vehiclePredicate==='measured-path-rate-within-kinematic-envelope'?error.vehiclePredicate:null,
      actual:typeof error.actual==='boolean'?error.actual:number(error.actual),expected:typeof error.expected==='boolean'?error.expected:number(error.expected),
      doppler:safeOracle(error.rateEvidence)}:null};
}
