// Inspect evidence produced by the actual native transport/worker/renderer/host.
// A file's presence alone is never counted as successful audio integration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const lines=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const components=['mechanical','exhaust','intake','drivetrain','tyres','aero','induction','transients'];

export function pcmMetrics(bytes,{firstFrame=0,lastFrame=Infinity}={}){
  assert.equal(bytes.length%8,0,'whole stereo Float32 frames');let peak=0,energy=0,difference=0,nonfinite=0,frames=0,zeroCrossings=0,last=null;
  for(let frame=Math.max(0,firstFrame);frame<Math.min(bytes.length/8,lastFrame);frame++){
    const l=bytes.readFloatLE(frame*8),r=bytes.readFloatLE(frame*8+4);nonfinite+=Number(!Number.isFinite(l))+Number(!Number.isFinite(r));
    peak=Math.max(peak,Math.abs(l),Math.abs(r));energy+=l*l+r*r;difference+=(l-r)**2;
    if(last!==null&&((last<0&&l>=0)||(last>=0&&l<0)))zeroCrossings++;last=l;frames++;
  }
  return {frames,peak,rms:Math.sqrt(energy/Math.max(1,frames*2)),stereoDifferenceRms:Math.sqrt(difference/Math.max(1,frames)),
    nonfiniteSamples:nonfinite,zeroCrossings,zeroCrossingsPerSecond:frames?zeroCrossings*48000/frames:0};
}
export function compareVehicleProfiles(v12,v8){
  assert.equal(v12.profile,'v12');assert.equal(v8.profile,'v8');
  assert.notEqual(v12.preHostSHA256,v8.preHostSHA256,'actual original profiles produce different PCM');
  assert.equal(v12.componentEnergy.induction,0,'naturally aspirated V12 has no invented induction layer');
  assert.ok(v8.componentEnergy.induction>0,'original supercharged V8 has actual induction PCM');
  assert.notEqual(v12.firingHz.maximum,v8.firingHz.maximum,'different architecture and bounded RPM profiles');
  return {differentActualPcm:true,v12MaximumFiringHz:v12.firingHz.maximum,v8MaximumFiringHz:v8.firingHz.maximum,
    v12InductionEnergy:v12.componentEnergy.induction,v8InductionEnergy:v8.componentEnergy.induction,
    v12ZeroCrossingsPerSecond:v12.preHost.zeroCrossingsPerSecond,v8ZeroCrossingsPerSecond:v8.preHost.zeroCrossingsPerSecond,
    inference:'Architecture/induction and output differences are objective; meaningful perceptual distinction still needs supervised listening'};
}
const range=values=>({minimum:Math.min(...values),maximum:Math.max(...values)});
export function checkVehicleDoppler(rate,maximumSpeed){
  // Stationary fixture listener, static component offsets/orientation, c=343m/s.
  // The retarded direct-path derivative is 1/(1 + radialSourceVelocity/c).
  // 0.015 is a declared finite-time/source-observation correction tolerance;
  // it does not allow the observed .83-.85 stepping fault from early builds.
  const tolerance=.015,soundSpeed=343,minimum=1/(1+maximumSpeed/soundSpeed)-tolerance,maximum=1/(1-maximumSpeed/soundSpeed)+tolerance;
  if(!(rate.minimum>=minimum&&rate.maximum<=maximum)){
    const error=new Error('Direct-path Doppler exceeds measured fixture kinematic envelope');
    error.vehiclePredicate='measured-path-rate-within-kinematic-envelope';error.rateEvidence={observed:rate,maximumSpeed,soundSpeed,tolerance,allowed:{minimum,maximum}};throw error;
  }
  return {observed:rate,maximumSpeed,soundSpeed,tolerance,allowed:{minimum,maximum},passed:true};
}
export function checkVehicleLive(directory){
  const host=json(path.join(directory,'host-result.json')),fixture=json(path.join(directory,'fixture.json')),recording=json(path.join(directory,'recording-result.json'));
  const diagnostic=lines(path.join(directory,'renderer-diagnostics.txt')),blocks=diagnostic.filter(x=>x.type==='block'),final=diagnostic.findLast(x=>x.type==='final');
  const pre=fs.readFileSync(path.join(directory,'pre-host.f32le')),post=fs.readFileSync(path.join(directory,'post-host.f32le'));
  assert.ok(host.deviceFreeFixture);assert.equal(host.deviceFreeSink.endpointOpened,false);assert.equal(host.ownedThreadsJoined,true);
  assert.equal(fixture.nativeHostExit,0);assert.equal(fixture.senderError,null);assert.equal(host.producerError,null);assert.equal(host.secondaryFailures.length,0);
  assert.ok(final);assert.equal(final.error,null);assert.ok(blocks.length>500);assert.equal(host.rejectedBlocks,0);
  assert.equal(host.transport.connections,1);assert.ok(host.transport.accepted>100);assert.ok(fixture.acceptedVehicleAcknowledgements>100);
  assert.equal(host.deviceFreeSink.underflowFrames,0,'retain and fail actual ring starvation');
  assert.equal(host.gain,.20);assert.equal(host.beaconOutputTrimDb,0,'vehicle never inherits beacon +12dB profile');
  assert.equal(final.dsp.limited,0);assert.equal(final.outputTrim.rejectedBlocks,0);assert.equal(final.outputTrim.db,0);
  const preMetrics=pcmMetrics(pre),postMetrics=pcmMetrics(post);
  for(const m of [preMetrics,postMetrics]){assert.equal(m.nonfiniteSamples,0);assert.ok(m.rms>1e-8);assert.ok(m.stereoDifferenceRms>1e-8);}
  assert.ok(preMetrics.peak<=.5,'measured vehicle pre-host output remains within unchanged0.5 guard');assert.ok(postMetrics.peak<=.10000001);
  assert.equal(final.dsp.pathOverflow,0);assert.equal(final.dsp.cursorResets,0);
  const active=blocks.filter(b=>b.vehicle?.active),componentEnergy=Object.fromEntries(components.map(n=>[n,0]));
  assert.ok(active.length>400,'actual live source active over continuous driving sequence');
  for(const b of active)for(const name of components){const c=b.vehicle.components?.[name];assert.ok(c&&Number.isFinite(c.energy)&&c.energy>=0,'per-component actual PCM evidence');componentEnergy[name]+=c.energy;}
  for(const name of ['mechanical','exhaust','intake','drivetrain','tyres','aero'])assert.ok(componentEnergy[name]>0,`${name} contributes original PCM`);
  if(fixture.profile==='v8')assert.ok(componentEnergy.induction>0);
  assert.equal(componentEnergy.transients,0,'no exhaust pops invented from unsupported throttle/fuel evidence');
  const ids=new Set(active.flatMap(b=>Object.keys(b.sourceGenerations??{})));
  assert.equal(ids.size,8,'eight separate causal source identities');assert.ok([...ids].every(id=>components.some(name=>id.endsWith(':'+name))));
  for(const id of ids)assert.equal(new Set(active.map(b=>b.sourceGenerations?.[id]).filter(x=>x!==undefined)).size,1,'movement and shifts retain source generation');
  const velocities=active.flatMap(b=>b.pathPresentation??[]).filter(p=>p.order===0),rates=range(velocities.map(p=>p.rate));
  assert.ok(rates.maximum>1.005&&rates.minimum<.995,'retarded path rates capture approach and receding Doppler');
  assert.ok(velocities.every(p=>Number.isFinite(p.delay)&&p.delay>=0&&p.delay<=2),'finite causal propagation delay');
  const rpm=range(active.map(b=>b.vehicle.estimatedRpm)),firing=range(active.map(b=>b.vehicle.synthesizer?.firingHz).filter(Number.isFinite));
  assert.ok(rpm.maximum>rpm.minimum*1.8,'real movement produces rising bounded estimated RPM');assert.ok(Number.isFinite(firing.minimum)&&firing.maximum>firing.minimum);
  const ratio=active.at(-1).vehicle.ratioEvidence;
  assert.ok(ratio.count>100);assert.equal(ratio.minimum,.5);assert.equal(ratio.maximum,.5);assert.equal(ratio.changedSamples,0);assert.equal(ratio.usedForControl,false,'constant normalized getter is evidence only');
  const lastVehicle=final.vehicle;assert.ok(lastVehicle);assert.equal(lastVehicle.active,false,'explicit removal detaches source');
  assert.ok(blocks.slice(-20).every(b=>Array.isArray(b.activeSourceIds)&&b.activeSourceIds.length===0&&b.activePaths===0),'source paths removed before host shutdown');
  assert.ok(final.dsp.releasedSources>=8,'all independent source histories explicitly released');
  assert.ok(pcmMetrics(pre.subarray(Math.max(0,pre.length-20*4096))).peak<1e-7,'engine/source stop settles to silence');
  const phases={};for(let i=0;i<fixture.events.length;i++){
    const e=fixture.events[i];if(!['idle','acceleration','gear-change','continued-acceleration','high-speed-pass','deceleration','engine-stop','source-removal'].includes(e.event))continue;
    const end=fixture.events.slice(i+1).find(x=>x.latestProducerFrame>e.latestProducerFrame);
    if(Number.isInteger(e.latestProducerFrame)&&end)phases[e.event]=pcmMetrics(pre,{firstFrame:e.latestProducerFrame+512,lastFrame:end.latestProducerFrame});
  }
  for(const stage of ['idle','acceleration','high-speed-pass','deceleration'])assert.ok(phases[stage]?.rms>1e-8,`actual ${stage} PCM`);
  assert.notEqual(phases.idle.rms,phases.acceleration.rms,'operating states change output');
  // PcmRing gain lineage, then exact OwnedOutputTap bytes/index lineage.
  for(let at=0;at<post.length;at+=4)assert.ok(Math.abs(post.readFloatLE(at)-Math.fround(pre.readFloatLE(at)*Math.fround(.20)))<2e-8,'actual native gain lineage');
  assert.equal(recording.manifest.integrity.complete,true);assert.equal(recording.audioPlayable,true);assert.equal(recording.manifest.audio.gaps.length,0);
  assert.ok(recording.manifest.propagationStates.some(s=>s.mode==='vehicle-conditional-direct'&&
    s.visibilityAssumption==='unobserved-space-assumed-clear'&&s.genuineGeometryPresent===false),
    'recording retains vehicle conditional direct propagation and its explicit visibility assumption');
  assert.ok(recording.manifest.propagationStates.every(s=>s.mode!=='unrecognised'),'all recorded propagation modes are recognized');
  const recorded=fs.readFileSync(path.join(recording.directory,'owned-output.f32le')),index=lines(path.join(recording.directory,'audio-index.jsonl'));
  for(const chunk of index)assert.deepEqual(recorded.subarray(chunk.byteOffset,chunk.byteOffset+chunk.bytes),post.subarray(chunk.submittedFrame*8,(chunk.submittedFrame+chunk.frames)*8));
  const timeline=lines(path.join(recording.directory,'timeline.jsonl')),frames=timeline.filter(x=>x.type==='frame').map(x=>x.frame);
  assert.ok(frames.some(f=>new Set(f.sources.map(s=>s.id)).size===8),'actual vehicle components reach SoundMap');
  const positioned=frames.filter(f=>f.sources.some(s=>s.valid&&s.id.endsWith(':mechanical')));
  const mechanical=positioned.map(f=>f.sources.find(s=>s.id.endsWith(':mechanical')));
  const moved=Math.hypot(...mechanical.at(-1).position.map((v,i)=>v-mechanical[0].position[i]));assert.ok(moved>60,'actual component source moves through world history');
  const body=positioned[0].sources.find(s=>s.id.endsWith(':mechanical')),exhaust=positioned[0].sources.find(s=>s.id.endsWith(':exhaust'));
  const exhaustSeparation=Math.hypot(...body.position.map((v,i)=>v-exhaust.position[i]));assert.ok(exhaustSeparation>1.5,'exhaust spatially separate from body before rendering');
  const telemetry=lines(path.join(recording.directory,'events.jsonl')).filter(e=>e.type==='vehicle-evidence');
  assert.ok(telemetry.length>100,'actual received vehicle telemetry retained alongside native PCM');
  assert.ok(telemetry.some(e=>e.detail.state.action==='remove'),'explicit removal recorded');
  const observedSpeeds=range(telemetry.map(e=>e.detail.state.speed));assert.ok(observedSpeeds.maximum>25&&observedSpeeds.minimum===0);
  const dopplerOracle=checkVehicleDoppler(rates,observedSpeeds.maximum);
  const result={profile:fixture.profile,actualHostExit:fixture.nativeHostExit,listenerPackets:host.transport.accepted,vehiclePackets:fixture.acceptedVehicleAcknowledgements,
    blocks:blocks.length,preHost:preMetrics,postHost:postMetrics,preHostSHA256:sha(pre),postHostSHA256:sha(post),componentEnergy,
    sourceIds:[...ids],stableSourceGeneration:true,removedAtEnd:true,componentTravelMetres:moved,bodyExhaustSeparationMetres:exhaustSeparation,
    estimatedRpm:rpm,firingHz:firing,pathRate:rates,dopplerOracle,phases,
    provenance:active.find(b=>b.vehicle.provenance)?.vehicle.provenance??null,normalizedGetterEvidence:ratio,constantGetterFixture:fixture.rpmGetterFixture,
    sourceHistory:final.historyDiagnostics,simulation:final.simulation,dsp:final.dsp,
    performance:{nodeCpuSeconds:final.cpuSeconds,wallSeconds:final.wallSeconds,hostCpuSeconds:host.cpuSeconds,
      statistics:final.statistics,acousticSettings:final.acousticSettings,deviceFreeSink:host.deviceFreeSink},
    recording:{frames:recording.manifest.audio.capturedFrames,integrityComplete:true,gaps:0,exactPostGainSubmissionLineage:true,soundMapFrames:frames.length,
      receivedVehicleTelemetryRecords:telemetry.length,observedFixtureSpeedMetresPerSecond:observedSpeeds,vehicleConditionalDirectRecorded:true},
    calibration:{...final.vehicleOutput,outputTrimDb:0,hostGain:.2,preHostPeakCap:.5,postHostPeakCap:.1,clippedSamples:0,limitedFrames:final.dsp.limited,
      basis:'measured digital headroom for authored scenario; no SPL or perceptual level calibration'},
    limitations:['Authored device-free RPH evidence, not gameplay getter validation','No physical listening or WASAPI timing proof',
      'Conditional direct propagation assumes unobserved space clear; no observed geometry in this fixture','GTA stock engine remains audible during future additive experiment']};
  fs.writeFileSync(path.join(directory,'analysis.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
