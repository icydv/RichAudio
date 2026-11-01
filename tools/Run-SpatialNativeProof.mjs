// Reuses the production host's existing device-free sink and explicit recorder.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {startSoundMap} from './soundmap/server.mjs';
import {spatialPose,spatialDuration} from '../tests/fixtures/SpatialTrajectories.mjs';
import {spatialPcmMetrics,writeSpatialWav,motionResponse,authoredMaximumFiveMsStep} from './Run-SpatialStabilityProof.mjs';
import {measureAcousticAcceleration} from './Measure-AcousticAcceleration.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const lines=f=>fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const [root,output,exe,baselineRoot='',baselineExe='',selection='']=process.argv.slice(2);
if(!['','--nominal-only'].includes(selection))throw Error('Native proof selection');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
const summary=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return {samples:a.length,minimum:a[0]??null,median:a[Math.floor(a.length*.5)]??null,p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]??null,maximum:a.at(-1)??null};};
function validateNative(report,seconds){
 const failed=[];
 if(report.nativeFixtureProcessExit!==0||report.hostExit!==0||report.final?.error||report.hostPrimary||report.hostSecondary.length||report.senderError)failed.push('normal-terminal');
 if(!(report.acceptedPackets>0)||report.rejectedPackets)failed.push('accepted-current-listener-packets');
 if(!report.readiness.actualReadyBlocks||report.readiness.emittingWithoutReady)failed.push('actual-source-context-and-renderer-ready');
 if(report.deviceFreeSink.underflowFrames||report.metrics.nonfiniteSamples||report.postHostMetrics.nonfiniteSamples||report.metrics.overCeilingSamples||report.metrics.peak>.5||report.postHostMetrics.peak>.10000001||report.final?.outputTrim?.rejectedBlocks||report.final?.dsp?.limited)failed.push('finite-guarded-unclipped-output');
 if(report.metrics.missingHistory||report.metrics.cursorResets||report.final?.historyDiagnostics?.affectedFrames)failed.push('source-history-continuity');
 if(!(report.metrics.rms>1e-5)||!(report.postHostMetrics.rms>1e-6)||report.recording.frames<=48000)failed.push('positive-owned-pcm');
 if(report.recording.fileHashesVerified!==4||!report.recording.integrityComplete||report.recording.gaps.length||report.recording.exactMatchedFrames!==report.recording.frames)failed.push('complete-exact-owned-recording');
 if(report.durationWallSeconds<seconds-.5||report.durationWallSeconds>seconds+1)failed.push('complete-authored-native-duration');
 if(report.nativeMotion&&(report.nativeMotion.pcm.samples<100||report.nativeMotion.controls.samples<30||report.uniformPcmMotion.pcm.samples<100||report.uniformPcmMotion.controls.samples<30))failed.push('identifiable-native-motion');
 return {passed:failed.length===0,failedPredicates:failed};
}
function nominalResponseAcceptance(cases){
 const rows=cases.filter(c=>c.name.endsWith('-normal')).map(c=>{
  const before=c.original?.uniformPcmMotion,after=c.corrected.uniformPcmMotion,qpcBefore=c.original?.nativeMotion,qpcAfter=c.corrected.nativeMotion,improvement=qpcBefore?.pcm.lagMs-qpcAfter?.pcm.lagMs,uncertainty=qpcAfter?.uncertaintyMs??3.5;
  const checks=[{name:'identifiable-submission-qpc-response',passed:before?.pcm.samples>=100&&after?.pcm.samples>=100},
   {name:'resolved-material-nominal-latency-reduction',passed:Number.isFinite(improvement)&&improvement>2*uncertainty&&improvement/qpcBefore.pcm.lagMs>=.15,improvementMs:improvement,fitResolutionMs:uncertainty,minimumRelativeReduction:.15,uncertaintyScope:'Window/grid resolution only; actual submission lateness and scheduler variation are reported separately'},
   {name:'authored-continuous-five-ms-step-bound',passed:c.corrected.postHostMetrics.maximumFiveMsStereoBalanceStep<=authoredMaximumFiveMsStep(c.name)+.002,authoredMaximumStep:authoredMaximumFiveMsStep(c.name),toleranceAbsoluteBalance:.002},
   {name:'pointwise-increment-error-nonregression',passed:after?.pcm.maximumDerivativeResidual<=before?.pcm.maximumDerivativeResidual+.002,toleranceAbsoluteBalance:.002},
   {name:'actual-native-direction-derivative-continuity',passed:after?.pcm.derivativeResidualRms<=before?.pcm.derivativeResidualRms+.0015,toleranceRmsBalance:.0015},
   {name:'actual-native-direction-tracking-nonregression',passed:Number.isFinite(before?.pcm.trackingRms)&&after?.pcm.trackingRms<=before.pcm.trackingRms+.0015,toleranceRmsBalance:.0015}];
  if(c.name.startsWith('rapid-rotation'))checks.push({name:'no-uncommanded-opposite-side-rotation-stop',passed:after?.rapidStop.oppositeSideStereoBalanceOvershoot<=before?.rapidStop.oppositeSideStereoBalanceOvershoot+.01,toleranceAbsoluteBalance:.01});
  return {name:c.name,passed:checks.every(c=>c.passed),checks,formerRawMaximumStepHeuristic:{passed:c.corrected.postHostMetrics.maximumFiveMsStereoBalanceStep<=c.original?.postHostMetrics.maximumFiveMsStereoBalanceStep+.002,toleranceAbsoluteBalance:.002,governing:false,reason:'A blurred baseline can suppress correct authored angular velocity'},formerActualQpcDerivativeHeuristic:{passed:qpcAfter?.pcm.maximumDerivativeResidual<=qpcBefore?.pcm.maximumDerivativeResidual+.002,toleranceAbsoluteBalance:.002,governing:false,reason:'Actual submission QPC includes nonmonotonic within-buffer catch-up timestamps; this measures delivery variation rather than uniform PCM waveform continuity'}};
 });
 return {scope:'Uniform48kHz PCM continuity uses the measured existing fixture deadline clock; actual owned submission QPC independently measures delivery response and jitter. Neither measures speaker presentation or subjective response',passed:rows.length===2&&rows.every(r=>r.passed),cases:rows};
}
function nativeTiming(host,trace,opened){
 const anchor=host.ownedRecorder,frames=lines(path.join(opened.dir,'timeline.jsonl')).filter(x=>x.type==='frame'&&!x.cachedContext).map(x=>x.frame);
 const publishedAge=(frame,observation)=>observation&&observation.clockFrequency===anchor.qpcFrequency&&Number.isFinite(observation.observationTicks)?frame.producedAtUnixMs-(anchor.anchorUnixMs+(observation.observationTicks-anchor.anchorQpcTicks)*1000/anchor.qpcFrequency):NaN;
 const observations=new Map();for(const t of trace){const q=t.listenerTiming;if(Number.isSafeInteger(q?.observationTicks)&&Number.isSafeInteger(q?.clockFrequency))observations.set(q.observationTicks,q.clockFrequency);}
 const times=[...observations].sort((a,b)=>a[0]-b[0]),intervals=times.slice(1).map((v,i)=>(v[0]-times[i][0])*1000/v[1]);
 const active=trace.filter(t=>t.emitting&&t.startup==='ready');
 const firstEmission=trace.find(t=>t.emitting)?.frame??Infinity,initializing=trace.filter(t=>t.frame<firstEmission);
 return {clockScope:'Host QPC to UTC via actual owned recorder anchor; Unix millisecond timestamps and anchor pairing uncertainty retained, not speaker-to-ear latency',observationIntervalMs:summary(intervals),observationToSolverPublicationMs:summary(frames.map(f=>publishedAge(f,f.listenerObservation))),latestObservationToSolverPublicationMs:summary(frames.map(f=>publishedAge(f,f.producer?.listenerTiming))),latestOrientationAgeMs:summary(active.map(t=>t.listenerTiming?.orientationObservationAgeMs)),spatialControlDelayMs:summary(active.map(t=>t.listenerTiming?.spatialDelayMs)),observationToProducerAdmissionUpperAgeMs:summary(active.map(t=>t.listenerTiming?.receiptAgeMs)),producerAnchorQueueAgeMs:summary(active.map(t=>t.listenerTiming?.nodeQueueAgeMs)),workerSolveMs:summary(active.map(t=>t.simulationMilliseconds)),workerRoundTripSchedulingMs:summary(active.map(t=>t.workerSchedulingMilliseconds)),dspMs:summary(active.map(t=>t.dspMilliseconds)),initializationProcessingMs:summary(initializing.map(t=>t.processingMilliseconds)),initializationProcessingDeadlineMisses:initializing.filter(t=>Number.isFinite(t.processingMilliseconds)&&t.processingMilliseconds>512/48).length,completedBlockProcessingMs:summary(active.map(t=>t.processingMilliseconds)),activeProcessingDeadlineMisses:active.filter(t=>Number.isFinite(t.processingMilliseconds)&&t.processingMilliseconds>512/48).length,wholeRunQualityDeadlineMisses:trace.at(-1)?.acoustic?.qualityDeadlineMisses??null,pcmQueue:host.pcmQueue??null,controlForwarding:host.listenerForwarding??null,deviceFreeSink:host.deviceFreeSink};
}
async function nativeCase(sourceRoot,nativeExe,name,destination,{onEmission=null}={}){
 fs.mkdirSync(destination,{recursive:true});const seconds=name==='full-planned'?50:spatialDuration(name),samples=[];
 for(let i=0;i*.05<seconds;i++){
   const time=i*.05,{source,yaw,...state}=spatialPose(name==='full-planned'?'full-session':name,time);
   // One continuous full-length capture. True generation boundaries have their
   // own deterministic case and correctly close the original recorder session.
   if(name==='full-planned'&&time>=44){state.generation=1;state.position[1]-=.4;}
   if(name==='missing-reacquisition'&&time>=1.5&&time<1.7)continue;
   samples.push({atMs:time*1000,receiptMs:time*1000+(name.endsWith('-normal')?[0,3,12,20]:[12,40,22,32])[i%4],...state,
     position:state.position.map((x,j)=>x-[100,200,3][j])});
 }
 const trajectory={schemaVersion:1,name,durationMs:seconds*1000,...(name==='full-planned'?{emissionStopMs:45000}:{}),samples},trajectoryFile=path.join(destination,'trajectory.json');write(trajectoryFile,trajectory);
 const modelFile=path.join(destination,'geometry-model.json');write(modelFile,{basis:'declared-demonstration-scale',metresPerNativeUnit:10,sourceOffsetNative:[-.6,0,.1],reference:'original-analytic-native-source'});
 const service=await startSoundMap({root:destination,port:0}),request=async(route,value)=>{
   const response=await fetch(service.descriptor.url+route,{method:value===undefined?'GET':'POST',headers:{'X-RichAudio-Token':service.descriptor.token,...(value===undefined?{}:{'Content-Type':'application/json'})},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(2000)});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
 };
 let opened,recording,code,timedOut=false;
 try{
   recording=(await request('/api/record/start',{maxDurationSeconds:name==='full-planned'?60:30,maxBytes:(name==='full-planned'?64:32)*1024*1024})).recording;
   const child=spawn(nativeExe,[sourceRoot,destination,modelFile,path.join(service.privateRoot,'service.json'),trajectoryFile],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
   if(onEmission){let text='',called=false;child.stdout.on('data',chunk=>{text+=chunk.toString();let at;while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at);text=text.slice(at+1);try{const e=JSON.parse(line);if(e.event==='emission-start'&&!called){called=true;onEmission(e);}}catch{}}});}
   const stdout=fs.createWriteStream(path.join(destination,'fixture-stdout.txt'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(destination,'fixture-stderr.txt'),{flags:'wx'});child.stdout.pipe(stdout);child.stderr.pipe(stderr);
   const deadline=setTimeout(()=>{timedOut=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},name==='full-planned'?65000:20000);
   try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(deadline);}
   await Promise.all([finished(stdout),finished(stderr)]);
   assert.equal(timedOut,false,'only owned disposable native fixture may be cleaned up after its explicit20/65s bound');
   if(service.recorder.active)await request('/api/record/stop',{id:recording.id});const until=performance.now()+2000;while(service.recorder.active&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(service.recorder.active,null,'owned recording finalised');opened=service.recorder.open(recording.id);
   write(path.join(destination,'recording-result.json'),{id:recording.id,directory:opened.dir,manifest:opened.manifest,audioPlayable:opened.audioPlayable,status:service.status()});
 }finally{await service.close();}
 const host=json(path.join(destination,'host-result.json')),fixture=json(path.join(destination,'fixture.json')),diagnostics=lines(path.join(destination,'renderer-diagnostics.txt')),trace=diagnostics.filter(e=>e.type==='block'),final=diagnostics.findLast(e=>e.type==='final'),pre=fs.readFileSync(path.join(destination,'pre-host.f32le')),post=fs.readFileSync(path.join(destination,'post-host.f32le'));
 const m=spatialPcmMetrics(pre,trace,final);writeSpatialWav(path.join(destination,'comparison.wav'),post,1);
 let hashCount=0;for(const [name,bound]of Object.entries(opened.manifest.integrity.files)){const bytes=fs.readFileSync(path.join(opened.dir,name));assert.equal(bytes.length,bound.bytes);assert.equal(sha(bytes),bound.sha256);hashCount++;}
 let matchedFrames=0;const captured=fs.readFileSync(path.join(opened.dir,'owned-output.f32le')),index=lines(path.join(opened.dir,'audio-index.jsonl'));for(const chunk of index){assert.deepEqual(captured.subarray(chunk.byteOffset,chunk.byteOffset+chunk.bytes),post.subarray(chunk.submittedFrame*8,(chunk.submittedFrame+chunk.frames)*8),'real recorder exact post-host PCM lineage');matchedFrames+=chunk.frames;}
 const submissions=index.flatMap(chunk=>chunk.submissions),frequency=host.ownedRecorder.qpcFrequency,originTicks=fixture.timelineOriginQpcTicks;
 const submittedTime=(frame,sourceFrame=false)=>{const s=submissions.find(s=>frame>=(sourceFrame?s.producerFrameStart:s.submittedFrame)&&frame<(sourceFrame?s.producerFrameStart+s.suppliedFrames:s.submittedFrame+s.frames));return s?(s.qpcTicks-originTicks)/frequency+(frame-(sourceFrame?s.producerFrameStart:s.submittedFrame))/48000:null;};
 const postMetrics=spatialPcmMetrics(post,trace,final),nativeBalances=postMetrics.balances.map(value=>({...value,submittedFrame:Math.round(value.time*48000),time:submittedTime(Math.round(value.time*48000))})).filter(value=>Number.isFinite(value.time)),nativeControls=trace.map(t=>({...t,observationRelativeTimeSeconds:submittedTime(t.frame,true)})).filter(t=>Number.isFinite(t.observationRelativeTimeSeconds));
 const nativeMotion=motionResponse(name,{...postMetrics,balances:nativeBalances},nativeControls);
 assert.ok(Number.isSafeInteger(fixture.fixtureSinkBeginQpcTicks)&&fixture.fixtureSinkBeginQpcTicks>0,'actual positive fixture deadline-clock anchor');assert.equal(fixture.qpcFrequency,frequency,'shared original/current QPC frequency');
 const sinkOrigin=(fixture.fixtureSinkBeginQpcTicks-originTicks)/frequency,
  uniformBalances=postMetrics.balances.map(value=>({...value,time:sinkOrigin+value.time})),
  uniformControls=trace.map(t=>{const s=submissions.find(s=>t.frame>=s.producerFrameStart&&t.frame<s.producerFrameStart+s.suppliedFrames);return s?{...t,observationRelativeTimeSeconds:sinkOrigin+(s.submittedFrame+t.frame-s.producerFrameStart)/48000}:null;}).filter(Boolean),
  uniformPcmMotion=motionResponse(name,{...postMetrics,balances:uniformBalances},uniformControls),qpcIntervals=nativeBalances.slice(1).map((b,i)=>(b.time-nativeBalances[i].time)*1000),
  deliveryTiming={qpcIntervalsForFiveMsPcm:summary(qpcIntervals),nonpositiveFiveMsIntervals:qpcIntervals.filter(x=>x<=0).length,intervalsOutsideFourToSixMs:qpcIntervals.filter(x=>x<4||x>6).length,submissionOffsetFromDeadlineClockMs:summary(nativeBalances.map(b=>(b.time-sinkOrigin-b.submittedFrame/48000)*1000)),scope:'Measured submission times can overlap during catch-up and are not a uniform sample presentation clock'};
 const timelineOriginUnixMs=Number.isFinite(fixture.timelineOriginQpcTicks)?host.ownedRecorder.anchorUnixMs+(fixture.timelineOriginQpcTicks-host.ownedRecorder.anchorQpcTicks)*1000/host.ownedRecorder.qpcFrequency:null;
 const eventUnix=name=>{const e=fixture.events.find(e=>e.event===name);return e?host.ownedRecorder.anchorUnixMs+(e.senderQpcTicks-host.ownedRecorder.anchorQpcTicks)*1000/e.qpcFrequency:null;};
 const ready=t=>t.readiness?.transportAccepted&&t.readiness?.contextInitialized&&t.readiness?.rendererReadyForOwnedEmission;
 const report={schemaVersion:1,name,nativeFixtureProcessExit:code,hostExit:fixture.nativeHostExit,startedAtUnixMs:host.ownedRecorder.anchorUnixMs,durationWallSeconds:host.durationWallSeconds,timelineOriginUnixMs,emissionStartedAtUnixMs:eventUnix('emission-start'),emissionStoppedAtUnixMs:eventUnix('emission-stop'),acceptedPackets:host.transport.accepted,rejectedPackets:host.transport.rejected,senderError:fixture.senderError,metrics:m,nativeMotion,uniformPcmMotion,deliveryTiming,uniformClockScope:'Measured existing fixtureSinkBegin QPC plus contiguous submittedFrame/48000; actual recorder producerFrame lineage maps controls; no fitted intercept, resampling, reordering or speaker-time claim',postHostMetrics:{...postMetrics,balances:undefined},readiness:{actualReadyBlocks:trace.filter(ready).length,emittingBlocks:trace.filter(t=>t.emitting).length,emittingWithoutReady:trace.filter(t=>t.emitting&&!ready(t)).length},nativeMotionTimeScope:'Actual OwnedOutputTap submission QPC plus within-submission48kHz frame offset, relative to authored observation QPC origin; measured source-frame lineage, not guessed host start or speaker time',timing:nativeTiming(host,trace,opened),hostPrimary:host.primaryFailure,hostSecondary:host.secondaryFailures,rendererDiagnosticsDropped:host.rendererDiagnosticsDropped,traceScope:'At most4094prefixblocks, latest overflowblock and reserved terminal; all PCM and recorder hashes retained',deviceFreeSink:host.deviceFreeSink,recording:{frames:opened.manifest.audio.capturedFrames,exactMatchedFrames:matchedFrames,fileHashesVerified:hashCount,integrityComplete:opened.manifest.integrity.complete,gaps:opened.manifest.audio.gaps,audioPlayable:opened.audioPlayable},final,endpointOpened:false};report.validation=validateNative(report,seconds);write(path.join(destination,'analysis.json'),report);return report;
}
try{
 fs.mkdirSync(output,{recursive:false});const result={schemaVersion:1,gameLaunched:false,audioEndpointOpened:false,originalCommit:'247e7ff2af8f1670ba454ae303ba56cb4f16fb19',cases:[]};
 for(const name of selection==='--nominal-only'?['slow-rotation-normal','rapid-rotation-normal']:['slow-rotation','rapid-rotation','slow-rotation-normal','rapid-rotation-normal','close-pass','geometry-expiry']){
   let original=null;if(baselineRoot)original=await nativeCase(baselineRoot,baselineExe,name,path.join(baselineRoot,'.local','spatial-native-'+path.basename(output)+'-'+name));
   const corrected=await nativeCase(root,exe,name,path.join(output,name));result.cases.push({name,original,corrected});
 }
 result.nominalResponseAcceptance=nominalResponseAcceptance(result.cases);
 if(selection==='--nominal-only'){
  write(path.join(output,'result.json'),result);const failures=result.cases.filter(c=>!c.corrected.validation.passed);if(failures.length)throw Error('Actual nominal native proof failed: '+failures.map(c=>c.name+':'+c.corrected.validation.failedPredicates.join('|')).join(', '));if(!result.nominalResponseAcceptance.passed)throw Error('Actual native nominal PCM response criteria failed; measured result and recording retained');console.log(JSON.stringify({output,cases:result.cases.map(c=>({name:c.name,oldLagMs:c.original?.nativeMotion?.pcm?.lagMs,newLagMs:c.corrected.nativeMotion?.pcm?.lagMs,underflowFrames:c.corrected.deviceFreeSink.underflowFrames}))},null,2));
 }else{
 let fullOriginal=null;if(baselineRoot)fullOriginal=await nativeCase(baselineRoot,baselineExe,'full-planned',path.join(baselineRoot,'.local','spatial-native-'+path.basename(output)+'-full-planned'));
 const fullNative=await nativeCase(root,exe,'full-planned',path.join(output,'full-planned'));
 result.fullPlannedOriginal=fullOriginal;
 result.fullPlannedNative=fullNative;
 // Existing bounded demanding acoustic benchmark provides measured CPU work
 // and genuine GPU dispatches during an additional unchanged600Hz native run.
 // An unavailable GPU remains explicitly unverified, never a simulated pass.
 let load=null;const pressureNative=await nativeCase(root,exe,'close-pass',path.join(output,'pressure-native'),{onEmission:()=>{load=measureAcousticAcceleration({root,output:path.join(output,'pressure-load'),scenes:['demanding'],qualities:['balanced'],modes:['gpu'],blocks:512,includeTransition:false}).then(value=>({value}),error=>({error:error.message}));}});
 const pressure=load?await load:{error:'Native emission was not observed; no pressure workload started'},work=pressure.value?.report.cases[0],start=Math.max(pressureNative.emissionStartedAtUnixMs??Infinity,(pressureNative.timelineOriginUnixMs??Infinity)+1000),end=Math.min(pressureNative.emissionStoppedAtUnixMs??-Infinity,(pressureNative.timelineOriginUnixMs??-Infinity)+4000);
 const overlap=work?Math.max(0,Math.min(end,Date.parse(work.measuredEndedAtUtc))-Math.max(start,Date.parse(work.measuredStartedAtUtc))):0;
 result.pressure={native:pressureNative,loadError:pressure.error??null,existingBenchmark:'Measure-AcousticAcceleration.mjs demanding balanced GPU512blocks; started only on actual native emission event',load:work??null,measuredNativeEmissionMovementAndGpuIntervalOverlapMs:overlap,hardwarePressureEstablished:!!work?.hardwareVerified&&overlap>=100,cpuWorkMeasured:!!work&&work.combinedCpuMs>0,scope:'Concurrent measured native device-free emission/movement and existing original acoustic compute benchmark; overlapping measured intervals, not per-dispatch speaker timing or GTA FPS'};
 write(path.join(output,'result.json'),result);console.log(JSON.stringify({output,cases:result.cases.map(c=>({name:c.name,originalExit:c.original?.hostExit,correctedExit:c.corrected.hostExit,correctedPeak:c.corrected.metrics.peak,underflow:c.corrected.deviceFreeSink.underflowFrames,guard:c.corrected.final?.outputTrim?.rejectedBlocks}))},null,2));
 const failures=[...result.cases,{name:'full-planned',corrected:fullNative},{name:'concurrent-pressure',corrected:pressureNative}].filter(c=>!c.corrected.validation.passed);
 if(fullNative.durationWallSeconds<49||fullNative.durationWallSeconds>52||fullNative.emissionStoppedAtUnixMs-fullNative.timelineOriginUnixMs<44900||fullNative.emissionStoppedAtUnixMs-fullNative.timelineOriginUnixMs>45100||fullNative.recording.frames<48000*48)failures.push({name:'planned45s-emission50s-host-and-contiguous-capture'});
 if(!result.nominalResponseAcceptance.passed)failures.push({name:'actual-native-nominal-response'});
 if(failures.length)throw Error('Actual native stability failed: '+failures.map(c=>c.name).join(', '));
 }
}catch(error){fs.mkdirSync(output,{recursive:true});write(path.join(output,'proof-failure.json'),{error:error.stack,gameLaunched:false,audioEndpointOpened:false});console.error(error);process.exitCode=1;}
