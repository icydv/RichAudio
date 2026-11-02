import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleComponentDefinitions,getVehicleComponent,componentOwnershipCapabilityMatrix,evaluateComponentTakeover,nativeComponentControlCandidates} from '../src/acoustics/vehicle/components/registry.mjs';
import {componentIdentityKey,componentSourceId,createAuthoredComponentCapability,componentObservation,componentLimits} from '../src/acoustics/vehicle/components/contracts.mjs';
import {OriginalComponentSource,tyreContactModel} from '../src/acoustics/vehicle/components/source.mjs';
import {ComponentSourceSet} from '../src/acoustics/vehicle/components/lifecycle.mjs';
import {ComponentAcousticSession} from '../src/acoustics/vehicle/components/pipeline.mjs';
import {createVehicleEnvironment} from '../src/acoustics/vehicle/environment.mjs';
import {fixtureComponentIdentity,componentFixtureSession,componentFixtureState,componentFixtureObservation,componentFixtureListener,renderVehicleComponentsFixture} from '../src/acoustics/vehicle/components/fixtures.mjs';
import {createPreparedMechanicalComponent} from '../src/acoustics/vehicle/components/prepared.mjs';
import {transientFixtureSession,transientFixturePoses,transientFixtureScene} from '../src/acoustics/events/fixture-scenes.mjs';
import {createHash} from 'node:crypto';
const cap=frames=>createAuthoredComponentCapability({session:componentFixtureSession,maximumFrame:frames-1});
const contact=()=>componentFixtureState('tyre-slip',0);
const output=(source,frames)=>{const all=new Float32Array(frames);for(let at=0;at<frames;at+=512){const n=Math.min(512,frames-at),block=new Float32Array(n);source.renderInto(block);all.set(block,at);}return all;};

test('coverage registry is immutable and expands desired ownership beyond engine/exhaust without claiming implementation',()=>{
 assert.equal(new Set(vehicleComponentDefinitions.map(d=>d.id)).size,vehicleComponentDefinitions.length);
 for(const id of ['engine','engine-shutdown','exhaust','backfire','intake','supercharger','turbo-flutter','transmission','clutch','differential','engine-braking','rev-limiter',
  'tyre-rolling','tyre-slip','water-contact','suspension','brake','door','roof','cargo','horn','siren','reverse-warning','collision-impact','glass-break','debris-impact','rotor','marine-propulsion']){
  const d=getVehicleComponent(id);assert.equal(d.eventualOwner,'RichAudio');assert.equal(d.emission.defaultOffset,null);assert.equal(d.ownership.state,'NativeOnly');assert.equal(d.replacement.productionEnabled,false);
 }
 assert.throws(()=>{getVehicleComponent('horn').ownership.status='verified';},TypeError);
 assert.throws(()=>getVehicleComponent('invented-turbo-state'));
 assert.equal(getVehicleComponent('turbo-flutter').replacement.implementation,'unavailable');
});
test('every component remains native-owned even with caller-supplied capability claims',()=>{
 const matrix=componentOwnershipCapabilityMatrix();assert.equal(matrix.length,vehicleComponentDefinitions.length);
 for(const row of matrix){assert.equal(row.currentOwner,'GTA');assert.equal(row.takeover,'BLOCKED');assert.equal(row.duplicateDirectPermitted,false);
  assert.equal(evaluateComponentTakeover({component:row.component,selectiveSuppression:true,independentRecovery:true}).permitted,false);
  assert.equal(evaluateComponentTakeover({component:row.component,mode:'authored-fixture'}).permitted,false);}
});
test('credible narrow native controls remain research candidates without pretending they prove restoration',()=>{
 assert.ok(nativeComponentControlCandidates.some(x=>x.component==='horn'&&x.control==='SET_HORN_ENABLED'));
 assert.ok(nativeComponentControlCandidates.some(x=>x.component==='siren'&&x.control==='RPH-Vehicle.IsSirenSilent'));
 assert.ok(nativeComponentControlCandidates.every(x=>x.productionPermitted===false&&x.independentRecovery==='unverified'));
});
test('exact component identities distinguish same-model vehicles, assemblies and recycled generations',()=>{
 const a=fixtureComponentIdentity('horn'),ids=[a,{...a,vehicleId:'same-model-sibling'},{...a,vehicleGeneration:2},{...a,componentGeneration:2},{...a,assembly:'second-horn'},{...a,component:'siren'}];
 assert.equal(new Set(ids.map(componentIdentityKey)).size,ids.length);assert.equal(new Set(ids.map(componentSourceId)).size,ids.length);
 assert.ok(ids.every(x=>componentSourceId(x).length<=64));assert.throws(()=>componentSourceId({...a,vehicleGeneration:0}));
});
test('authored capability, source pose and finite lease cannot be replaced by JSON claims or future receipts',()=>{
 const c=cap(4096),identity=fixtureComponentIdentity('horn'),o=componentFixtureObservation(identity,0,0);
 assert.throws(()=>componentObservation(o,{...c}),/Branded/);
 for(const edit of [{identity:{...identity,session:'a'.repeat(32)}},{pose:null},{validThroughFrame:Infinity},{validThroughFrame:12001},{state:{...o.state,slip:[]}}])assert.throws(()=>componentObservation({...o,...edit},c));
 const set=new ComponentSourceSet({capability:c,identities:[identity]});assert.equal(set.accept({...o,observedFrame:1,receivedFrame:1}),false);
 assert.equal(set.accept(o),true);assert.equal(set.accept(o),false);
});
test('source expiry is terminal for that identity and dismount scope loss does not invent engine shutdown',()=>{
 const identity=fixtureComponentIdentity('horn'),set=new ComponentSourceSet({capability:cap(4096),identities:[identity]});
 assert.equal(set.accept(componentFixtureObservation(identity,0,0)),true);const inputs={[componentSourceId(identity)]:new Float32Array(512)};
 assert.equal(set.prepare(0).length,1);set.renderInto(inputs);assert.equal(set.prepare(512).length,0);set.renderInto(inputs);
 assert.ok(inputs[componentSourceId(identity)].every(x=>x===0));assert.equal(set.accept(componentFixtureObservation(identity,1024,2)),false);
 assert.equal(set.diagnostics().sources[0].reason,'source-expired');
 const scoped=new ComponentSourceSet({capability:cap(4096),identities:[identity]});assert.equal(scoped.accept({...componentFixtureObservation(identity,0,0),eligible:false,state:{}}),true);
 assert.equal(scoped.prepare(0).length,0);assert.equal(scoped.diagnostics().engineShutdownInferred,0);assert.equal(scoped.diagnostics().sources[0].reason,'source-scope-lost');
});
test('source sets are bounded and cannot implicitly create a new assembly, turbo or source on later observation',()=>{
 const id=fixtureComponentIdentity('horn');assert.throws(()=>new ComponentSourceSet({capability:cap(4096),identities:Array(9).fill(id)}),/Bounded/);
 assert.throws(()=>new ComponentSourceSet({capability:cap(4096),identities:[id,id]}),/Unique/);
 assert.throws(()=>new OriginalComponentSource('turbo-flutter'));
 const set=new ComponentSourceSet({capability:cap(4096),identities:[id]});assert.equal(set.accept(componentFixtureObservation({...id,assembly:'unregistered-horn'},0,0)),false);
});
test('adding or reordering sibling components cannot change an existing component noise identity',()=>{
 const a=fixtureComponentIdentity('tyre-rolling'),b=fixtureComponentIdentity('horn'),single=new ComponentSourceSet({capability:cap(1024),identities:[a]}),mixed=new ComponentSourceSet({capability:cap(1024),identities:[b,a]});
 for(const set of [single,mixed]){set.accept(componentFixtureObservation(a,0,0));set.prepare(0);}
 const x={[componentSourceId(a)]:new Float32Array(512)},y={[componentSourceId(a)]:new Float32Array(512),[componentSourceId(b)]:new Float32Array(512)};
 single.renderInto(x);mixed.renderInto(y);assert.deepEqual(x[componentSourceId(a)],y[componentSourceId(a)]);
});
test('original horn and tyre source history is deterministic across block boundaries and does not reset on repeated state',()=>{
 for(const component of ['horn','tyre-rolling','tyre-slip']){
  const a=new OriginalComponentSource(component,{seed:123}),b=new OriginalComponentSource(component,{seed:123}),s=componentFixtureState(component,0);
  a.setState(s);b.setState(s);const expected=output(a,4096),actual=new Float32Array(4096);
  for(let at=0;at<actual.length;at+=128){const block=new Float32Array(128);b.setState(s);b.renderInto(block);actual.set(block,at);}
  assert.deepEqual(actual,expected,component);assert.equal(b.frame,4096);assert.ok(expected.some(x=>x!==0));assert.ok(expected.every(x=>Math.abs(x)<=componentLimits.dryPeak));
 }
});
test('validated slip and contact load are required; high speed alone generates no squeal',()=>{
 const steady={...contact(),longitudinalSpeedMps:40,wheelSurfaceSpeedMps:40,lateralSpeedMps:0};
 assert.equal(tyreContactModel(steady).slipSpeedMps,0);const quiet=new OriginalComponentSource('tyre-slip');quiet.setState(steady);assert.ok(output(quiet,4096).every(x=>x===0));
 const slip=new OriginalComponentSource('tyre-slip');slip.setState({...steady,wheelSurfaceSpeedMps:50});assert.ok(output(slip,4096).some(x=>x!==0));
 const airborne=new OriginalComponentSource('tyre-slip');airborne.setState({...steady,wheelSurfaceSpeedMps:50,normalForceN:0});assert.ok(output(airborne,4096).every(x=>x===0));
 assert.throws(()=>slip.setState({speedMps:40}));assert.throws(()=>slip.setState({...steady,surface:'unknown-but-assumed-asphalt'}));
});
test('surface-dependent rolling source has distinct authored spectra without claiming native material observation',()=>{
 const hashes=[];for(const surface of ['asphalt','gravel','grass','sand','wet','puddle']){const s=new OriginalComponentSource('tyre-rolling',{seed:11});s.setState({...contact(),surface});hashes.push(JSON.stringify([...output(s,512)]));}
 assert.equal(new Set(hashes).size,6);
});
test('mechanical events preserve occurrence, cannot replay and reject excess voices without stealing existing tails',()=>{
 const source=new OriginalComponentSource('mechanical-clunk');source.setState({});source.renderInto(new Float32Array(512));
 const e={eventId:'mechanical-one',sequence:0,occurrenceFrame:400,observedFrame:512,strength:.9,kind:'gear-clunk'};
 assert.equal(source.trigger(e,512),true);assert.equal(source.trigger(e,512),false);
 for(let n=1;n<4;n++)assert.equal(source.trigger({...e,eventId:'mechanical-'+n,sequence:n},512),true);
 assert.equal(source.trigger({...e,eventId:'overflow',sequence:4},512),false);assert.equal(source.voices.filter(v=>v.active).length,4);
 const receipt=source.diagnostics().eventReceipts[0];assert.equal(receipt.occurrenceFrame,400);assert.equal(receipt.commonSoftwareLatenessFrames,112);
 const pcm=output(source,8192);assert.ok(pcm.some(x=>x!==0));assert.ok(pcm.subarray(4800).every(x=>x===0));assert.equal(source.stats.maximumVoices,4);
});
test('mechanical source rejects future or unbounded event times rather than inventing a transition',()=>{
 const s=new OriginalComponentSource('mechanical-clunk');s.setState({});
 const event={eventId:'clunk',sequence:0,occurrenceFrame:0,observedFrame:0,strength:.5,kind:'gear-clunk'};
 assert.throws(()=>s.trigger({...event,observedFrame:1},0));assert.throws(()=>s.trigger(event,512));assert.throws(()=>s.trigger({...event,kind:'gear-change-inferred-from-speed'},0));
});
test('all additional families generate distinguishable original PCM and keep finite peak envelopes',()=>{
 const samples=[];
 for(const component of ['horn','tyre-rolling','tyre-slip','mechanical-clunk']){const s=new OriginalComponentSource(component);s.setState(componentFixtureState(component,0));if(component==='mechanical-clunk')s.trigger({eventId:'one',sequence:0,occurrenceFrame:0,observedFrame:0,strength:1,kind:'gear-clunk'},0);
  const pcm=output(s,4096);assert.ok(pcm.some(x=>x!==0));assert.ok(pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<=componentLimits.dryPeak));samples.push(JSON.stringify([...pcm]));}
 assert.equal(new Set(samples).size,4);
});
test('matched original components receive genuine different open, street and tunnel path/PCM treatment',async()=>{
 const results=[];for(const environment of ['direct','canyon','tunnel'])results.push((await renderVehicleComponentsFixture({environment,seconds:1})).measurement);
 assert.equal(new Set(results.map(r=>r.drySha256)).size,1,'identical source emission independent of environment');
 assert.equal(new Set(results.map(r=>r.pcmSha256)).size,3);assert.ok(results.every(r=>r.energy>0&&r.peak<componentLimits.outputPeakBudget));
 assert.ok(results[0].paths.every(r=>r.paths.every(p=>p.order===0)));assert.ok(results[1].paths.some(r=>r.paths.some(p=>p.order>0)));assert.ok(results[2].paths.some(r=>r.paths.some(p=>p.order===2)));
 for(const r of results){assert.equal(r.diagnostics.acoustics.renderer.limited,0);assert.equal(r.diagnostics.acoustics.history.affectedFrames,0);assert.equal(r.diagnostics.sources.engineShutdownInferred,0);assert.equal(r.sourceReferencesStable,true);assert.equal(r.diagnostics.extraFixedAudioQueueFrames,0);}
 assert.ok(results[0].firstOutputFrame-results[0].firstDryFrame<4800,'no100ms vehicle history policy is introduced');
});
test('camera and geometry changes retain continuous component source objects, phase and source histories',async()=>{
 const r=(await renderVehicleComponentsFixture({environment:'direct',seconds:1.5,cameraCut:true,geometryTransition:true})).measurement;
 assert.equal(r.sourceReferencesStable,true);assert.ok(r.diagnostics.sources.sources.every(s=>s.source.frame===r.frames));assert.equal(r.diagnostics.sources.retired,0);
 assert.equal(r.diagnostics.acoustics.simulation.resets,1);assert.equal(r.diagnostics.acoustics.renderer.cursorResets,0);assert.equal(r.diagnostics.acoustics.history.affectedFrames,0);
 assert.equal(r.diagnostics.acoustics.simulation.sceneReplacements,1);assert.equal(r.diagnostics.extraFixedAudioQueueFrames,0);
});
test('component pipeline is explicit and cannot change an existing stock gameplay source or native owner',async()=>{
 const identity=fixtureComponentIdentity('horn'),session=new ComponentAcousticSession({capability:cap(1024),identities:[identity],scene:createVehicleEnvironment('direct').scene});
 try{session.accept(componentFixtureObservation(identity,0,0));const left=new Float32Array(512),right=new Float32Array(512);await session.render({listener:componentFixtureListener(),left,right});
  assert.equal(session.diagnostics().productionEnabled,false);assert.equal(session.diagnostics().nativeSuppression,false);assert.equal(evaluateComponentTakeover({component:'horn'}).permitted,false);
 }finally{session.close();}
});
test('complete original mechanical events prewarm through the existing low-latency kernel path without replacing their waveform',()=>{
 const identity={...fixtureComponentIdentity('mechanical-clunk'),session:transientFixtureSession},capability=createAuthoredComponentCapability({session:identity.session,maximumFrame:20000});
 const result=createPreparedMechanicalComponent({identity,capability,scene:transientFixtureScene('wall'),sceneId:'wall',sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener});
 const source=new OriginalComponentSource('mechanical-clunk');source.setState({});source.trigger({eventId:'independent-shape',sequence:0,occurrenceFrame:0,observedFrame:0,strength:.8,kind:'gear-clunk'},0);
 const dry=output(source,4800),sha=createHash('sha256').update(Buffer.from(dry.buffer)).digest('hex');
 assert.equal(result.drySha256,sha);assert.equal(result.sourceFrames,4800);assert.equal(result.kernel.waveformSha256,sha);assert.ok(result.kernel.paths.some(p=>p.order>0));
 assert.equal(result.kernel.kernelAffectedHistoryFrames,0);assert.equal(result.kernel.rendererLimited,0);assert.equal(result.extraFixedQueueFrames,0);assert.equal(result.productionEnabled,false);assert.equal(result.nativeSuppression,false);
 assert.throws(()=>createPreparedMechanicalComponent({identity:{...identity,component:'horn'},capability,sceneId:'unknown',sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener}));
 assert.throws(()=>createPreparedMechanicalComponent({identity,capability,sceneId:'unknown',sourcePose:{...transientFixturePoses.source,generation:2},listenerPose:transientFixturePoses.listener}));
});
