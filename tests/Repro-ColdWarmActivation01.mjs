// Controlled completion scheduling exercises the real worker, transport and
// consumer. Artificial holds/spins here are correctness controls, not timings
// offered as performance evidence. No scene timestamp or deadline is changed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createOriginalColdWarmContext01,coldWarmObservedPose01,coldWarmHash01,recordReplacement01} from './fixtures/ColdWarmActivation01.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const sourceRoot=path.resolve(arg('--source-root','.')),controlRoot=path.resolve(arg('--control-root','.local/street01-cache-pressure01/baseline')),fixtureRoot=path.resolve(arg('--fixture-root','.local/street01-cache-pressure01/original-v3')),output=path.resolve(arg('--output','.local/street01-activation01/controlled-result.json')),baseline=args.includes('--expect-baseline');
assert(!fs.existsSync(output),'Fresh controlled evidence file required');
const controllerPins=()=>[['tests/Repro-ColdWarmActivation01.mjs',new URL('./Repro-ColdWarmActivation01.mjs',import.meta.url)],['tests/fixtures/ColdWarmActivation01.mjs',new URL('./fixtures/ColdWarmActivation01.mjs',import.meta.url)]].map(([relative,file])=>({relative,sha256:coldWarmHash01(fs.readFileSync(file))})),controllerPinsBefore=controllerPins();
const started=performance.now(),context=await createOriginalColdWarmContext01({sourceRoot,controlRoot,fixtureRoot}),{engine}=context,events=[],applications=[],candidates=[],statuses=[],held=[];
let service,timer,closure,error=null,stopAt=null,firstRequestId=null,firstExpiry=null,consumerNearBoundary=false,firstHeld=false,lateHeld=false,sequence=0,previous=null,queuedBeforeStop=null,stopQueuedApplication=null;
const now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,limit=10000){const at=now();while(!predicate()){if(service?.failed)throw Error(service.failure);if(now()-at>limit)throw Error('Controlled handover bound expired');await wait(2);}}
async function waitUntil(target){while(now()<target-8)await wait(Math.max(1,target-now()-8));while(now()<target){} }
function stop(reason){if(stopAt!==null)return;stopAt=now();engine.tickInstalledScene01?.(stopAt);events.push({kind:'stop-intent',at:stopAt,reason});clearInterval(timer);engine.beginStopInstalledScene01?.(stopAt,reason);service.beginStop01?.(stopAt,reason);}
function apply(scene,receipt){
 const receivedAt=now(),record={requestId:receipt.requestId,receivedAt,requestedAt:receipt.requestedAt,expiresAt:receipt.expiresAt,geometryTimeMs:receipt.geometryTimeMs,generation:receipt.generation,surfaces:scene.tile.surfaces.length,receivedRemainingMilliseconds:receipt.expiresAt-receivedAt,receiptIdentity:{session:receipt.session,requestId:receipt.requestId,catalogSHA256:receipt.catalogSHA256,bindingEpoch:receipt.bindingEpoch,packetDigest:receipt.packetDigest,prepareSoundMapGeometry01:receipt.prepareSoundMapGeometry01??null,soundMapBodyPrepared:!!receipt.preparedSoundMapGeometry,clock01:receipt.clock01},lifecycle01:receipt.lifecycle01??null};candidates.push(record);
 if(!scene.tile.surfaces.length){record.kind='empty';return;}
 if(receipt.requestId===firstRequestId){
  // Model a bounded consumer scheduling delay. The actual compatible process
  // clock continues advancing; only completion delivery is controlled.
  const applyTarget=receipt.expiresAt-3.5;while(now()<applyTarget){}consumerNearBoundary=true;
 }
 engine.queueInstalledStaticScene01(scene,receipt);
 if(applications.length>=4&&!queuedBeforeStop&&stopAt===null){queuedBeforeStop={record,scene,receipt,queuedAt:now()};record.kind='queued-before-stop';return;}
 const before=now(),accepted=engine.applyPendingInstalledStaticScene01(),completedAt=now();
 record.applicationAt=before;record.completedAt=completedAt;record.remainingAtApplicationMilliseconds=receipt.expiresAt-completedAt;record.accepted=accepted;record.afterStop=stopAt!==null&&completedAt>=stopAt;record.reason=engine.installedSceneDiagnostics01.recent.at(-1)?.reason??null;
 if(accepted){assert.equal(engine.pipeline.simulation.scene,scene);assert.equal(scene.tile.createdAt,receipt.geometryTimeMs);assert.equal(scene.tile.validUntil,receipt.geometryTimeMs+1000);const application={requestId:receipt.requestId,generation:receipt.generation,requestedAt:receipt.requestedAt,expiresAt:receipt.expiresAt,completedAt};record.replacement=recordReplacement01(previous,application);previous=application;applications.push(record);}
}
try{
 service=new context.InstalledSceneService01({config:{manifestPath:context.fixture.manifestPath,catalogPath:context.fixture.catalogPath,expectedGameSHA256:context.fixture.expectedGameSHA256,privateRoot:fixtureRoot,maximumResidentResources:8},session:context.session,onScene:apply,onStatus:s=>statuses.push({at:now(),stage:s.stage,worker:s.worker,environmentalReadiness01:s.environmentalReadiness01??null,clock01:s.sceneDeliveryDiagnostics01?.clock??null})});
 if(typeof engine.bindInstalledSceneService01==='function')engine.bindInstalledSceneService01(service);else assert(baseline,'Production readiness binding required in candidate correctness test');
 assert.equal(service.bindPreparationEpoch01(context.fixture.validationEpochUtc01),true);
 const listener=service.worker.listeners('message').at(-1);service.worker.removeListener('message',listener);
 service.worker.on('message',message=>{
  if(message.type==='scene'&&!firstHeld){firstHeld=true;firstRequestId=message.requestId;const active=service.active;assert.equal(active.requestId,message.requestId);firstExpiry=active.expiresAt;held.push({kind:'cold-completion',message,releaseAt:firstExpiry-50,originalReceivedAt:now()});return;}
  if(message.type==='scene'&&queuedBeforeStop&&!lateHeld){lateHeld=true;held.push({kind:'late-after-stop',message,releaseAt:null,originalReceivedAt:now()});return;}
  listener(message);
 });
 const observe=()=>{if(stopAt!==null)return;const pose=coldWarmObservedPose01(sequence++);pose.phase='controlled-stationary';pose.generation=1;pose.listener=[0,-3,1.6];pose.sources=[[1,-3,1.3]];pose.velocity=[0,0,0];context.applyObservation(pose);engine.tickInstalledScene01?.(now());service.updateWindow(context.request(pose,now()));};
 observe();timer=setInterval(observe,200);
 await until(()=>held.some(r=>r.kind==='cold-completion'));
 const cold=held.find(r=>r.kind==='cold-completion');await waitUntil(cold.releaseAt);events.push({kind:'controlled-cold-release',at:now(),requestId:cold.message.requestId,heldMilliseconds:now()-cold.originalReceivedAt,performanceEvidence:false});listener(cold.message);
 assert(consumerNearBoundary,'Near-expiry candidate must reach the actual consumer application boundary');
 const near=candidates.find(r=>r.requestId===firstRequestId);assert(near,'Controlled first candidate recorded');
 if(baseline){assert.equal(near.accepted,true,'Controlled near-expiry target was not achieved; if the host preempted past expiry this run is inconclusive, not unsafe activation proof');assert(near.remainingAtApplicationMilliseconds>0&&near.remainingAtApplicationMilliseconds<5,'Actual baseline activation must have approximately2ms remaining');}
 else {assert.equal(near.accepted,false,'Candidate must withhold near-expiry first activation');assert(engine.installedSceneDiagnostics01.withheld>0,'Withheld candidate is distinct from consumer rejection');}
 await until(()=>applications.length>=4&&queuedBeforeStop&&held.some(r=>r.kind==='late-after-stop'),8000);
 const activation=applications.find(r=>!r.afterStop);assert(activation,'No vacuous never-active pass');assert(activation.completedAt-started<8000,'Bounded real first activation required');
 stop('controlled-late-result-boundary');const queuedApplicationAt=now(),queuedApplied=engine.applyPendingInstalledStaticScene01(),queuedCompletedAt=now();stopQueuedApplication={requestId:queuedBeforeStop.receipt.requestId,at:queuedCompletedAt,applied:queuedApplied,afterStop:true};
 if(queuedApplied){const record=queuedBeforeStop.record,receipt=queuedBeforeStop.receipt,application={requestId:receipt.requestId,generation:receipt.generation,requestedAt:receipt.requestedAt,expiresAt:receipt.expiresAt,completedAt:queuedCompletedAt};Object.assign(record,{applicationAt:queuedApplicationAt,completedAt:queuedCompletedAt,accepted:true,afterStop:true,remainingAtApplicationMilliseconds:receipt.expiresAt-queuedCompletedAt,replacement:recordReplacement01(previous,application)});previous=application;applications.push(record);}
 const late=held.find(r=>r.kind==='late-after-stop');events.push({kind:'controlled-late-release',at:now(),requestId:late.message.requestId,originalReceivedAt:late.originalReceivedAt,performanceEvidence:false});listener(late.message);await wait(5);
 if(baseline)assert(queuedApplied||applications.some(r=>r.afterStop),'Frozen baseline must demonstrate post-stop adoption when no production fence exists');else{assert.equal(queuedApplied,false,'Queued candidate cannot apply after stop intent');assert(!applications.some(r=>r.afterStop),'No production application after stop intent');}
 context.assertNoAudio();
}catch(e){error={message:e.message,stack:e.stack};process.exitCode=1;}
finally{
 stop(error?'controlled-test-failure':'controlled-test-terminal');closure=await service?.close();await engine.close();const stability=context.verify();
 const report={schema:1,kind:'OriginalColdWarmControlledCorrectness01',performanceEvidence:false,controlledBoundary:'First actual worker result held until50ms before its original deadline, then actual consumer scheduled at3.5ms remaining; compatible process clock remains live.',mode:baseline?'frozen-baseline':'production-candidate',startedAt:started,stopAt,elapsedMilliseconds:now()-started,bindings:context.bindings,stability,controllerPins:controllerPinsBefore,controllerBundleSHA256:coldWarmHash01(controllerPinsBefore),controllerStable:coldWarmHash01(controllerPins())===coldWarmHash01(controllerPinsBefore),events,candidates,applications,statuses,closure,audioActivity:context.audioActivity,renderedFrames:engine.pipeline.renderer.frame,firstOriginalExpiry:firstExpiry,queuedBeforeStop:queuedBeforeStop?{requestId:queuedBeforeStop.receipt.requestId,queuedAt:queuedBeforeStop.queuedAt,expiresAt:queuedBeforeStop.receipt.expiresAt}:null,stopQueuedApplication,postStopApplications:applications.filter(r=>r.afterStop).length,observedReplacementGaps:applications.map(r=>r.replacement).filter(r=>r.gapMilliseconds>0),unsafeNearExpiryActivation:!!candidates.find(r=>r.requestId===firstRequestId)?.accepted,controlledBoundaryAchieved:candidates.find(r=>r.requestId===firstRequestId)?.remainingAtApplicationMilliseconds>0&&candidates.find(r=>r.requestId===firstRequestId)?.remainingAtApplicationMilliseconds<5,actualActivationObserved:applications.some(r=>!r.afterStop),error};
 if(!Object.values(stability).every(Boolean)){report.error??={message:'Source/control/original data drift'};process.exitCode=1;}if(!closure?.workerJoined||closure?.controlClosureUnknown){report.error??={message:'Uncertain worker closure'};process.exitCode=1;}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output,mode:report.mode,unsafeNearExpiryActivation:report.unsafeNearExpiryActivation,applications:applications.length,postStopApplications:report.postStopApplications,gaps:report.observedReplacementGaps,closure,error:report.error,evidenceSHA256:coldWarmHash01(fs.readFileSync(output))}));
}
