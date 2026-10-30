// CI exports scalar measurements only. No paths, pipe/session IDs, telemetry,
// raw errors/stacks, capabilities, PCM, recordings or environment identifiers.
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const fields=(value,keys)=>Object.fromEntries(keys.map(key=>[key,number(value?.[key])]));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
const metrics=value=>fields(value,['frames','peak','rms','stereoDifferenceRms','nonfiniteSamples','zeroCrossingsPerSecond']);
const timing=value=>fields(value,['count','median','p95','max']);
const range=value=>fields(value,['minimum','maximum']);
const safeOracle=o=>o?{observed:range(o.observed),maximumSpeed:number(o.maximumSpeed),soundSpeed:number(o.soundSpeed),tolerance:number(o.tolerance),allowed:range(o.allowed)}:null;
const choice=(value,allowed)=>allowed.includes(value)?value:value==null?null:'unrecognized';
const errorKinds=['InvalidDataException','TimeoutException','IOException','DecoderFallbackException','SerializationException','XmlException','Exception','InvalidOperationException','ObjectDisposedException','ArgumentException'];
const senderStages=['not-started','listener-connect','listener-encode','listener-write','listener-ack','listener-publish','listener-ready','probe-complete','vehicle-start','vehicle-publish','vehicle-stop-ack','host-stop','complete'];
const hostStages=['host-run','listener-terminal','vehicle-terminal','vehicle-control-freshness','PCM-reader','device-free-sink','device-free-sink-clock',
  'control-pipe','control-writer-disposed','control-producer','control-message','control-queue','diagnostic-pipe','diagnostic-pipe-disposed','producer-stop','producer-exit','audio-output',
  'terminal-summary','listener-shutdown','vehicle-shutdown','geometry-shutdown','geometry-shutdown-deferred','PCM-reader-join','diagnostics-reader-join','input-writer-join','recording-shutdown'];
const transportStages=['connection','startup','header','length','payload','decoding','schema','sequence','freshness','callback'];
const transportCodes=['deadline','truncated-header','invalid-length','payload-failed','invalid-encoding-or-json','invalid-schema','invalid-sequence','invalid-age','consumer-failed','connection-failed','operation-failed','receiver-stop','sender-stop','peer-stop'];
const terminalKinds=['deliberate-stop','unexpected-eof','failed','local-stop',...errorKinds];
const firstTiming=t=>fields(t,['CopyMs','MailboxAgeMs','AgeBeforeEncodeMs','EncodeMs','AgeBeforeWriteMs','WriteMs','AckMs','ConnectionMs','HeaderMs','PayloadMs','PayloadReceivedAgeMs','DecodeMs','DecisionAgeMs','CallbackMs']);
const producerBlockFields=['blockIndex','frame','synthesisMilliseconds','simulationMilliseconds','dspMilliseconds','workerSchedulingMilliseconds',
  'completedBlockProcessingMilliseconds','pcmCompletionIntervalMilliseconds','beforeBlockProcessingGapMilliseconds','processingDeadlineMisses',
  'activeSourceCount','activePathCount','previousBlockProcessingMilliseconds','qualityDeadlineMisses'];
const safeProducerBlock=b=>b?{...fields(b,producerBlockFields),vehicleActive:b.vehicleActive===true,emitting:b.emitting===true}:null;
function retainProducer(p){if(!p)return null;return {fileStatus:choice(p.fileStatus,['read','partial','missing','over-limit','read-failed']),
  ...fields(p,['bytes','lines','malformedLines','oversizedLines','blockCount']),lastBlock:safeProducerBlock(p.lastBlock),
  firstActiveBlocks:Array.isArray(p.firstActiveBlocks)?p.firstActiveBlocks.slice(0,8).map(safeProducerBlock):[],
  final:p.final?{...fields(p.final,['frames','blocks','cpuSeconds','wallSeconds','processingDeadlineMisses']),hasError:p.final.hasError===true,
    synthesisMs:timing(p.final.synthesisMs),simulationMs:timing(p.final.simulationMs),dspMs:timing(p.final.dspMs)}:null};}
// The private renderer trace includes source poses and control payloads. Scan
// bounded bytes/lines and retain only timing scalars, never those raw records.
export function readVehicleProducerEvidence(directory){
  const result={fileStatus:'read',bytes:0,lines:0,malformedLines:0,oversizedLines:0,blockCount:0,lastBlock:null,firstActiveBlocks:[],final:null};
  let fd;try{const file=path.join(directory,'renderer-diagnostics.txt'),stat=fs.statSync(file);result.bytes=stat.size;
    if(!stat.isFile()||stat.size>64*1024*1024){result.fileStatus='over-limit';return retainProducer(result);}
    fd=fs.openSync(file,'r');const decoder=new StringDecoder('utf8'),chunk=Buffer.alloc(65536);let carry='',skipping=false,position=0;
    const append=value=>{if(skipping)return;if(Buffer.byteLength(carry)+Buffer.byteLength(value)>262144){result.oversizedLines++;carry='';skipping=true;}else carry+=value;};
    const line=()=>{result.lines++;if(skipping||!carry.trim())return;let row;try{row=JSON.parse(carry.replace(/^\uFEFF/,''));}catch{result.malformedLines++;return;}
      if(row?.type==='block'){
        const block=safeProducerBlock({...row,blockIndex:result.blockCount++,vehicleActive:row.vehicle?.active===true,activeSourceCount:row.vehicle?.sourceCount,
          activePathCount:row.activePaths,previousBlockProcessingMilliseconds:row.acoustic?.qualityTiming?.processingMs,qualityDeadlineMisses:row.acoustic?.qualityDeadlineMisses});
        result.lastBlock=block;if(block.vehicleActive&&result.firstActiveBlocks.length<8)result.firstActiveBlocks.push(block);
      }else if(row?.type==='final'){result.final={frames:row.frames,blocks:row.statistics?.blocks,cpuSeconds:row.cpuSeconds,wallSeconds:row.wallSeconds,
        processingDeadlineMisses:row.statistics?.processingDeadlineMisses,hasError:row.error!=null,synthesisMs:row.statistics?.synthesisMs,simulationMs:row.statistics?.simulationMs,dspMs:row.statistics?.dspMs};}
    };
    const consume=value=>{let start=0,end;while((end=value.indexOf('\n',start))!==-1){append(value.slice(start,end));line();carry='';skipping=false;start=end+1;}append(value.slice(start));};
    while(position<stat.size){const read=fs.readSync(fd,chunk,0,Math.min(chunk.length,stat.size-position),position);if(!read)break;position+=read;consume(decoder.write(chunk.subarray(0,read)));}
    consume(decoder.end());if(carry.length||skipping)line();if(result.malformedLines||result.oversizedLines)result.fileStatus='partial';
  }catch(error){result.fileStatus=error.code==='ENOENT'?'missing':'read-failed';}finally{if(fd!==undefined)fs.closeSync(fd);}
  return retainProducer(result);
}
function readRecord(directory,name,maxBytes){try{const file=path.join(directory,name),stat=fs.statSync(file);if(!stat.isFile()||stat.size>maxBytes)return {status:'over-limit',value:null};
  const text=fs.readFileSync(file,'utf8');try{return {status:'read',value:JSON.parse(text.replace(/^\uFEFF/,''))};}catch{return {status:'malformed',value:null};}
}catch(error){return {status:error.code==='ENOENT'?'missing':'read-failed',value:null};}}
export function createVehicleNativeEvidence({profile,childExit,timedOut=false,fixture=null,host=null,files={},producer=null}){
  const transport=host?.transport,terminal=host?.listenerTerminal??transport?.diagnostic;
  return {profile:choice(profile,['v12','v8']),childExit:number(childExit),timedOut:timedOut===true,producer:retainProducer(producer),
    files:Object.fromEntries(['fixture','host'].map(name=>[name,choice(files[name],['read','missing','malformed','over-limit','read-failed'])])),
    fixture:{nativeHostExit:number(fixture?.nativeHostExit),senderStage:choice(fixture?.senderStage,senderStages),senderErrorKind:choice(fixture?.senderErrorKind,errorKinds),
      senderJoined:fixture?.senderJoined===true,acceptedListenerAcknowledgements:number(fixture?.acceptedListenerAcknowledgements),acceptedVehicleAcknowledgements:number(fixture?.acceptedVehicleAcknowledgements),
      listenerWire:fields(fixture?.listenerWire,['transmitted','startupDiscarded','firstAck','lastAck','stopAck','firstEncodeMs','firstAgeAtWriteMs','firstAckMs','firstAgeAfterAckMs']),
      listenerPublisher:{...fields(fixture?.listenerPublisher,['sent','transmitted','attempts','expiredBeforeEncoding','expiredAfterEncoding','startupDiscarded']),
        errorKind:choice(fixture?.listenerPublisher?.errorKind,errorKinds),outcome:choice(fixture?.listenerPublisher?.diagnostic?.Outcome,terminalKinds),
        stage:choice(fixture?.listenerPublisher?.diagnostic?.Stage,transportStages),code:choice(fixture?.listenerPublisher?.diagnostic?.Code,transportCodes),
        firstFrame:firstTiming(fixture?.listenerPublisher?.firstFrame),firstAcceptedFrame:firstTiming(fixture?.listenerPublisher?.firstAcceptedFrame),
        firstExpiredUnsent:fields(fixture?.listenerPublisher?.firstExpiredUnsent,['AgeMs','EncodeMs','BeforeEncodeAgeMs'])},
      vehiclePublisher:{...fields(fixture?.vehiclePublisher,['sent','expired','replaced']),terminalReason:choice(fixture?.vehiclePublisher?.terminalReason,terminalKinds)}},
    host:{hasPrimaryFailure:host?.primaryFailure!=null,stage:choice(host?.primaryFailure?.stage,hostStages),exceptionKind:choice(host?.primaryFailure?.exceptionType,errorKinds),
      duringShutdown:host?.primaryFailure?.duringShutdown===true,secondaryFailureCount:Array.isArray(host?.secondaryFailures)?host.secondaryFailures.length:null,
      ...fields(host,['durationWallSeconds','receivedBlocks','rejectedBlocks','rendererExitCode']),ownedThreadsJoined:host?.ownedThreadsJoined===true,
      listener:{...fields(transport,['accepted','rejected','startupDiscarded','connections','lastAgeMs']),stage:choice(terminal?.Stage,transportStages),code:choice(terminal?.Code,transportCodes),
        exceptionKind:choice(terminal?.ExceptionType,errorKinds),outcome:choice(terminal?.Outcome,terminalKinds),firstFrame:firstTiming(terminal?.FirstFrame),firstAcceptedFrame:firstTiming(terminal?.FirstAcceptedFrame)},
      vehicle:{...fields(host?.vehicle,['accepted','rejected','connections','written','expiredBeforeWrite','maxHostQueueAgeMs','maxObservationAgeAtWriteMs','relayDelivered','relayRejected','maximumObservedRoundTripMs','maximumAcceptedRoundTripMs']),
        terminal:choice(host?.vehicle?.terminal,terminalKinds),removed:host?.vehicle?.removed===true},
      sink:fields(host?.deviceFreeSink,['frames','underflowFrames','firstUnderflowFrame','missedSinkBudgets','maximumLatenessMs'])}};
}
export function readVehicleNativeEvidence(directory,options){
  const fixture=readRecord(directory,'fixture.json',16384),host=readRecord(directory,'host-result.json',262144);
  return createVehicleNativeEvidence({...options,fixture:fixture.value,host:host.value,files:{fixture:fixture.status,host:host.status},producer:readVehicleProducerEvidence(directory)});
}
function retainNative(n){if(!n)return null;
  // Rebuild even already-sanitized input: callers cannot smuggle extra fields
  // into the CI record by attaching arbitrary properties to nativeCases.
  const result=createVehicleNativeEvidence({profile:n.profile,childExit:n.childExit,timedOut:n.timedOut,files:n.files,producer:n.producer,
    fixture:{...n.fixture,vehiclePublisher:n.fixture?.vehiclePublisher,listenerPublisher:n.fixture?.listenerPublisher?{...n.fixture.listenerPublisher,
      diagnostic:{Outcome:n.fixture.listenerPublisher.outcome,Stage:n.fixture.listenerPublisher.stage,Code:n.fixture.listenerPublisher.code}}:null},
    host:{...n.host,primaryFailure:n.host?.hasPrimaryFailure?{stage:n.host.stage,exceptionType:n.host.exceptionKind,duringShutdown:n.host.duringShutdown}:null,
      secondaryFailures:[],transport:n.host?.listener,
      listenerTerminal:n.host?.listener?{Stage:n.host.listener.stage,Code:n.host.listener.code,ExceptionType:n.host.listener.exceptionKind,Outcome:n.host.listener.outcome,
        FirstFrame:n.host.listener.firstFrame,FirstAcceptedFrame:n.host.listener.firstAcceptedFrame}:null,vehicle:n.host?.vehicle,deviceFreeSink:n.host?.sink}});
  result.host.secondaryFailureCount=number(n.host?.secondaryFailureCount);return result;
}
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
    nativeCases:{v12:retainNative(report?.nativeCases?.v12),v8:retainNative(report?.nativeCases?.v8)},
    failure:error?{kind:error.name==='AssertionError'?'assertion':'execution',
      predicate:error.vehiclePredicate==='measured-path-rate-within-kinematic-envelope'?error.vehiclePredicate:null,
      actual:typeof error.actual==='boolean'?error.actual:number(error.actual),expected:typeof error.expected==='boolean'?error.expected:number(error.expected),
      doppler:safeOracle(error.rateEvidence)}:null};
}
