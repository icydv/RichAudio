// Analysis of captured real-component evidence. Deterministic renderer replay
// additionally isolates reflection PCM; it never substitutes for native output.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {BeaconOutputTrim} from '../src/acoustics/streaming/beacon-output-trim.mjs';

const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const lines=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function metrics(bytes,frames=null){
 let peak=0,energy=0,leftEnergy=0,rightEnergy=0,nonfinite=0,stereoDifference=0,samples=0;
 for(let at=0;at+8<=bytes.length;at+=8){const frame=at/8;if(frames&&!frames.has(Math.floor(frame/512)*512))continue;
  const l=bytes.readFloatLE(at),r=bytes.readFloatLE(at+4);nonfinite+=Number(!Number.isFinite(l))+Number(!Number.isFinite(r));peak=Math.max(peak,Math.abs(l),Math.abs(r));energy+=l*l+r*r;leftEnergy+=l*l;rightEnergy+=r*r;stereoDifference+=(l-r)**2;samples+=2;}
 return {frames:samples/2,peak,rms:Math.sqrt(energy/Math.max(1,samples)),leftRms:Math.sqrt(leftEnergy/Math.max(1,samples/2)),rightRms:Math.sqrt(rightEnergy/Math.max(1,samples/2)),stereoDifferenceRms:Math.sqrt(stereoDifference/Math.max(1,samples/2)),nonfiniteSamples:nonfinite};
}
export function checkListenerStartup(directory,{baseline=false,invalid=false,reportFilename='analysis.json'}={}){
 const host=json(path.join(directory,'host-result.json')),fixture=json(path.join(directory,'fixture.json')),recording=json(path.join(directory,'recording-result.json'));
 const diagnostic=lines(path.join(directory,'renderer-diagnostics.txt')),blocks=diagnostic.filter(x=>x.type==='block'),final=diagnostic.findLast(x=>x.type==='final');
 const pre=fs.readFileSync(path.join(directory,'pre-host.f32le')),post=fs.readFileSync(path.join(directory,'post-host.f32le'));
 assert.ok(host.deviceFreeFixture);assert.equal(host.deviceFreeSink.endpointOpened,false);assert.equal(host.ownedThreadsJoined,true);
 assert.equal(host.rejectedBlocks,0);assert.equal(host.transport.connections,1);assert.ok(host.transport.accepted>5);assert.equal(fixture.senderError,null);
 assert.equal(host.beaconFrequencyHz,600);assert.equal(host.beaconLevel,.44);assert.equal(host.beaconOutputTrimDb,12);assert.equal(host.gain,.20);
 assert.equal(host.deviceFreeSink.underflowFrames,0,'retain and fail genuine paced ring starvation');
 if(!baseline){assert.ok(final,'actual producer terminal result');assert.equal(final.error,null);}
 const preMetrics=metrics(pre),postMetrics=metrics(post);
 assert.equal(preMetrics.nonfiniteSamples,0);assert.equal(postMetrics.nonfiniteSamples,0);assert.ok(preMetrics.peak<=.5);assert.ok(postMetrics.peak<=.10000001);
 if(final){assert.equal(final.dsp.limited,0);assert.equal(final.outputTrim.db,12);assert.equal(final.outputTrim.rejectedBlocks,0);}
 const result={mode:fixture.mode,actualHostExit:fixture.nativeHostExit,acceptedListenerPackets:host.transport.accepted,producerListenerMessages:final?.statistics.listenerMessages??null,
  blocks:blocks.length,preHost:preMetrics,postHost:postMetrics,preHostSHA256:sha(pre),postHostSHA256:sha(post),
  sourceHistoryResets:final?.simulation.resets??null,sourceHistoryAffectedFrames:final?.historyDiagnostics.affectedFrames??null,
  terminalFailure:host.primaryFailure,secondaryFailures:host.secondaryFailures,normalShutdown:host.producerError===null,
  deviceFreeSink:host.deviceFreeSink,relay:host.geometryRelay,producerTiming:{workerMilliseconds:final?.statistics.simulationMs??null,
   dspMilliseconds:final?.statistics.dspMs??null,processingDeadlineMisses:final?.acousticSettings?.qualityDeadlineMisses??null,soundMap:final?.soundMap??null},
  recording:{captureKind:'actual PcmRing.Fill and OwnedOutputTap in device-free fixture; WASAPI unstarted',audioPlayable:recording.audioPlayable,frames:recording.manifest.audio.capturedFrames,
   integrityComplete:recording.manifest.integrity.complete,gaps:recording.manifest.audio.gaps,propagationStates:recording.manifest.propagationStates},
  evidenceDirectory:directory,subjectiveListening:'not performed; no audio endpoint opened'};
 assert.equal(recording.manifest.integrity.complete,true,'all retained PCM/index/timeline hashes sealed');
 if(baseline){
  assert.equal(preMetrics.peak,0);assert.equal(postMetrics.peak,0);
  assert.ok(blocks.some(t=>t.emitting),'old engine really receives emission request');
  assert.ok(blocks.every(t=>t.paths===0));assert.ok(blocks.some(t=>t.geometry?.reason==='listener/geometry session pairing unavailable'));
  if(final)assert.equal(final.simulation.resets,0);result.originalStartupDefectReproduced=true;
  result.acceptanceFailure='valid accepted listener and manual emission, but no context/source history/paths and exactly zero PCM';
 }else if(invalid){
  assert.equal(fixture.nativeHostExit,1);assert.equal(host.transport.outputMuted,true);assert.equal(host.transport.hostStopped,true);
  assert.ok(host.producerError.startsWith('Listener terminal:'),'invalid transport remains original primary failure');assert.equal(host.secondaryFailures.length,0);
  assert.ok(preMetrics.peak>1e-5&&postMetrics.peak>1e-5,'valid prefix genuinely emitted processed PCM before invalid evidence');
  assert.ok(blocks.some(t=>t.emitting&&t.paths>0));assert.equal(host.transport.rejected,1);
  const expected=fixture.mode==='interrupted'?'payload/deadline':fixture.mode==='stale'||fixture.mode==='future'?'freshness/invalid-age':'sequence/invalid-sequence';
  assert.ok(host.producerError.includes(expected),host.producerError);assert.equal(host.transport.accepted,fixture.acceptedAcknowledgements);
  if(host.listenerTerminalBoundary&&host.deviceFreeSink.lastSubmissionQpcTicks)assert.ok(host.deviceFreeSink.lastSubmissionQpcTicks<=host.listenerTerminalBoundary.qpcTicks,'no output submitted after strict listener terminal mute');
  result.invalidRejectedBeforeRelay=true;result.submissionEnd='Actual consumer stops at the strict terminal mute; no fabricated zero samples appended';
  assert.equal(recording.audioPlayable,false,'failed listener recording is retained as incomplete listening evidence');
 }else{
  assert.equal(host.producerError,null);assert.equal(host.secondaryFailures.length,0);assert.equal(fixture.nativeHostExit,0);assert.ok(blocks.length>500);
  const firstObserved=blocks.findIndex(t=>t.readiness?.genuineGeometryPresent),lastObserved=blocks.findLastIndex(t=>t.readiness?.genuineGeometryPresent);
  assert.ok(firstObserved>80&&lastObserved>firstObserved,'geometry genuinely arrives after direct-only audio');
  const direct=blocks.slice(0,firstObserved).filter(t=>t.emitting&&t.startup==='ready'&&t.paths>0);
  const reflected=blocks.filter(t=>t.emitting&&t.startup==='ready'&&t.pathPresentation.some(p=>p.order>0));
  const expired=blocks.slice(lastObserved+1).filter(t=>t.emitting&&t.startup==='ready'&&t.geometry?.mode==='conditional-direct-only'&&t.paths>0);
  assert.ok(direct.length>30&&reflected.length>20&&expired.length>30);
  for(const t of [...direct,...expired]){assert.equal(t.readiness.mode,'listener-only-conditional-direct');assert.equal(t.readiness.visibilityAssumption,'unobserved-space-assumed-clear');assert.ok(t.pathPresentation.every(p=>p.order===0));}
  for(const t of direct){assert.equal(t.geometry.stats.accepted,0);assert.equal(t.geometry.clock,null,'no geometry clock invented during listener-only startup');}
  const expiredSettled=expired.filter((t,i)=>i>8&&t.activePaths===1);
  assert.ok(expiredSettled.length>20,'observed reflection release settles back to the one original direct path');
  const phaseMetrics=group=>metrics(pre,new Set(group.map(t=>t.frame))),postPhaseMetrics=group=>metrics(post,new Set(group.map(t=>t.frame)));
  result.phases={noGeometry:phaseMetrics(direct),observedGeometry:phaseMetrics(reflected),expiredGeometry:phaseMetrics(expired)};
  result.phases.expiredGeometrySettled=phaseMetrics(expiredSettled);
  result.postHostPhases={noGeometry:postPhaseMetrics(direct),observedGeometry:postPhaseMetrics(reflected),expiredGeometry:postPhaseMetrics(expired),expiredGeometrySettled:postPhaseMetrics(expiredSettled)};
  result.phaseDefinitions={expiredGeometry:'All conditional direct blocks after the final observed geometry block, including real reflection release tail',expiredGeometrySettled:'After at least9 conditional blocks (96ms) and only one active renderer path remains'};
  for(const m of Object.values(result.phases)){assert.ok(m.rms>1e-5&&m.leftRms>1e-5&&m.rightRms>1e-5);assert.ok(m.peak<=.5);}
  assert.ok(result.phases.noGeometry.stereoDifferenceRms>1e-5,'directional stereo processing is real');
  const generations=new Set(blocks.flatMap(t=>Object.values(t.sourceGenerations??{})));assert.equal(generations.size,1,'source generation survives geometry introduction and expiry');
  assert.equal(final.simulation.resets,1,'only initial listener/source context establishes history');assert.equal(final.dsp.cursorResets,0);assert.equal(final.dsp.pathOverflow,0);
  assert.equal(final.historyDiagnostics.affectedFrames,0,'retarded source history remains available');result.sourceGenerations=[...generations];
  // Replay the actual path controls through the identical DSP to isolate only
  // observed reflections. Match every captured pre-host sample exactly.
  const renderers=[0,1].map(()=>new StreamingRenderer({sourceIds:['beacon-0'],generationReleaseGuard:true,pathCapacityPerSource:64}));
  const trims=[new BeaconOutputTrim(12),new BeaconOutputTrim(12)],dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512);
  let phase=0,gain=0,differenceEnergy=0,matchedSamples=0;
  for(const t of blocks){if(t.frame*8+4096>pre.length)break;
   for(let j=0;j<512;j++){gain+=(Number(t.emitting)*.44-gain)*(1-Math.exp(-1/(.01*48000)));phase=(phase+2*Math.PI*600/48000)%(2*Math.PI);dry[j]=gain*(Math.sin(phase)+.35*Math.sin(2*phase)+.15*Math.sin(3*phase))/1.5;}
   const outputs=[];
   for(let k=0;k<2;k++){const r=renderers[k];r.setPathBudget(t.acoustic.pathBudget);r.setOutputPreferences(t.acoustic);
    r.accept({frame:t.frame,sourceGenerations:t.sourceGenerations,paths:t.pathPresentation.filter(p=>k===0||p.order===0)});r.process({'beacon-0':dry},left,right,512);
    for(let j=0;j<512;j++){const g=t.startup==='ready'?Math.min(1,(t.frame+j-t.readyFrame+1)/480):0;left[j]*=g;right[j]*=g;}
    if(t.presentationMuted){left.fill(0);right.fill(0);}trims[k].apply(left,right);outputs.push([left.slice(),right.slice()]);}
   for(let j=0;j<512;j++){const at=(t.frame+j)*8,l=pre.readFloatLE(at),r=pre.readFloatLE(at+4);
    assert.equal(outputs[0][0][j],l,'actual native pre-host PCM exactly matches recorded causal path controls');assert.equal(outputs[0][1][j],r);
    if(t.pathPresentation.some(p=>p.order>0))differenceEnergy+=(l-outputs[1][0][j])**2+(r-outputs[1][1][j])**2;matchedSamples+=2;}
  }
  result.exactRendererReplaySamples=matchedSamples;result.reflectedContributionRms=Math.sqrt(differenceEnergy/Math.max(1,matchedSamples));assert.ok(result.reflectedContributionRms>1e-5,'actual observed reflections contribute PCM');
  for(let at=0;at<post.length;at+=4){const expected=Math.fround(pre.readFloatLE(at)*Math.fround(.20));assert.ok(Math.abs(post.readFloatLE(at)-expected)<2e-8,'actual host .20 postgain preserves PCM lineage');}
  const timeline=lines(path.join(recording.directory,'timeline.jsonl')),frames=timeline.filter(x=>x.type==='frame').map(x=>x.frame);
  const conditional=frames.filter(f=>f.readiness?.mode==='listener-only-conditional-direct');assert.ok(conditional.length>10);
  assert.ok(conditional.some(f=>f.geometryGeneration===null&&f.directPath?.visibilityAssumption==='unobserved-space-assumed-clear'),'SoundMap exposes honest conditional label without invented geometry');
  assert.ok(frames.some(f=>f.paths.some(p=>p.order>0&&p.status==='selected'&&p.propagation==='reflected')),'actual reflected solver paths reach SoundMap recording');
  assert.ok(recording.manifest.propagationStates.some(s=>s.visibilityAssumption==='unobserved-space-assumed-clear'&&!s.genuineGeometryPresent));
  assert.ok(recording.manifest.propagationStates.some(s=>s.genuineGeometryPresent));assert.equal(recording.audioPlayable,true);assert.equal(recording.manifest.audio.gaps.length,0);
  const recordedPcm=fs.readFileSync(path.join(recording.directory,'owned-output.f32le')),audioIndex=lines(path.join(recording.directory,'audio-index.jsonl'));
  for(const chunk of audioIndex)assert.deepEqual(recordedPcm.subarray(chunk.byteOffset,chunk.byteOffset+chunk.bytes),post.subarray(chunk.submittedFrame*8,(chunk.submittedFrame+chunk.frames)*8),'actual recorder retains exact post-gain owned submissions');
  result.recording.exactPostGainSubmissionLineage=true;
  assert.ok(recording.manifest.audio.capturedFrames>48000*5);assert.ok(blocks.slice(-20).every(t=>!t.emitting),'explicit emission stop completes before host shutdown');
  assert.ok(metrics(pre.subarray(Math.max(0,pre.length-20*4096))).peak<1e-7,'emission-stop causal tail settles to silence');
 }
 fs.writeFileSync(path.join(directory,reportFilename),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
