// Explicit offline benchmark. Original fixture only; never a live qualification.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createResponsiveScene01,responsivePose01,responsiveEpoch01} from './fixtures/ResponsiveScene01.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const sourceRoot=path.resolve(arg('--source-root','.')),fixtureRoot=path.resolve(arg('--fixture-root','.local/street01-responsive01/original-fixture')),output=path.resolve(arg('--output','.local/street01-responsive01/profile.json')),direct=args.includes('--direct'),analytic=args.includes('--analytic');
const load=relative=>import(pathToFileURL(path.join(sourceRoot,relative))),sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),measure=(fn)=>{const at=performance.now(),value=fn();return {value,milliseconds:performance.now()-at};};
const sourcePins=()=>fs.readdirSync(path.join(sourceRoot,'src'),{recursive:true}).filter(f=>f.endsWith('.mjs')).sort().map(relative=>({relative,sha256:createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,'src',relative))).digest('hex')}));
const pinsBefore=sourcePins();
const fixture=fs.existsSync(path.join(fixtureRoot,'fixture.json'))?JSON.parse(fs.readFileSync(path.join(fixtureRoot,'fixture.json'))):createResponsiveScene01(fixtureRoot,{analytic});
assert.equal(fixture.generatedFromInstalledData,false);
const worldApi=await load('src/acoustics/world/installed-static-scene01.mjs'),{prepareInstalledSoundMapGeometry01}=await load('src/acoustics/streaming/soundmap-telemetry.mjs'),{originalAirflowEngineStreet01,airflowFrameStreet01}=await load('tests/fixtures/AirflowStreet01.mjs'),{budgetSession042:session}=await load('tests/fixtures/AcousticBudget042.mjs');
const {pathGeometry}=await load('src/acoustics/engine/paths.mjs');
const run=await originalAirflowEngineStreet01({enabled:false}),{engine}=run,started=performance.now(),cpuAt=process.cpuUsage(),memory=[];engine.now=()=>performance.now();
const sample=()=>memory.push({at:performance.now()-started,...process.memoryUsage()});sample();const sampler=setInterval(sample,100);
const records=[],status=[],observations=[],dispatchTimes=new Map(),receiveTimes=new Map();let closure=null,service=null,world=null,error=null;
const finiteIdentity=scene=>sha(scene.tile.surfaces.map(s=>({id:s.id,center:s.center,normal:s.normal,u:s.u,half:s.half,footprint:s.footprint,material:s.material})).sort((a,b)=>a.id.localeCompare(b.id)));
const poseRequest=(pose,at)=>({...pose,session,geometryTimeMs:at,durationMs:1000,radius:32,maximumSurfaces:4096,adaptiveRadius:true,engine:engine.direct.config});
function consumer(scene,receipt){
 const at=performance.now();run.setWall(at);const before=engine.stats.geometryUpdates;engine.queueInstalledStaticScene01(scene,receipt);const queuedAt=performance.now(),accepted=engine.applyPendingInstalledStaticScene01(),appliedAt=performance.now();
 if(accepted){assert.equal(engine.pipeline.simulation.scene,scene);assert.equal(engine.stats.geometryUpdates,before+1);assert.equal(scene.tile.createdAt,receipt.geometryTimeMs);assert.equal(scene.tile.validUntil,receipt.geometryTimeMs+1000);assert.ok(appliedAt<receipt.expiresAt);}
 const dispatchedAt=dispatchTimes.get(receipt.requestId),receivedAt=receiveTimes.get(receipt.requestId);
 records.push({kind:'consumer',requestId:receipt.requestId,generation:receipt.generation,geometryTimeMs:receipt.geometryTimeMs,requestedAt:receipt.requestedAt,expiresAt:receipt.expiresAt,admittedAt:receipt.admittedAt,dispatchedAt,receivedAt,requestQueueMilliseconds:dispatchedAt-receipt.requestedAt,workerRoundTripMilliseconds:receivedAt-dispatchedAt,parentAdoptionMilliseconds:receipt.admittedAt-receivedAt,queueMilliseconds:queuedAt-at,applyMilliseconds:appliedAt-queuedAt,accepted,remainingMilliseconds:receipt.expiresAt-appliedAt,admissionMilliseconds:appliedAt-receipt.requestedAt,surfaces:scene.tile.surfaces.length,finiteIdentity:finiteIdentity(scene),reflectionIds:scene.observationModel.reflectionSurfaceIds,workerPreparationMilliseconds:receipt.workerPreparationMilliseconds,workerMemory:receipt.workerMemory,lifecycle01:receipt.lifecycle01??null,metadata:worldApi.installedStaticSceneMetadata01(scene)});
}
try{
 if(direct){
  const init=measure(()=>new worldApi.InstalledStaticWorld01({...fixture,privateRoot:fixtureRoot,requiredValidationEpochUtc01:responsiveEpoch01,maximumResidentResources:4}));world=init.value;records.push({kind:'initialization',milliseconds:init.milliseconds});
  for(const sequence of [0,1,2,3,10,20,30,40,41,50,51]){
   const pose=responsivePose01(sequence),request=poseRequest(pose,performance.now());observations.push(pose);
   const window=measure(()=>world.window(request)),encoded=measure(()=>worldApi.encodeInstalledStaticScene01(window.value)),prepared=measure(()=>worldApi.prepareInstalledStaticSceneTransfer01(encoded.value,{...request,catalogSHA256:fixture.catalogSHA256})),soundmap=measure(()=>prepareInstalledSoundMapGeometry01(prepared.value.scene,{requestId:sequence+1,bindingEpoch:1,packetDigest:encoded.value.packetDigest}));
   assert.equal(finiteIdentity(window.value),finiteIdentity(prepared.value.scene));assert.deepEqual(window.value.observationModel.reflectionSurfaceIds,prepared.value.scene.observationModel.reflectionSurfaceIds);
   const pathProbeIds=[[],...window.value.observationModel.reflectionSurfaceIds.map(id=>[id])],pathProbes=pathProbeIds.map(ids=>{const result=pathGeometry(window.value,pose.sources[0],pose.listener,ids.map(id=>window.value.tile.surfaces.find(s=>s.id===id)));return {surfaceIds:ids,result,propagationSeconds:Number.isFinite(result.distance)?result.distance/window.value.config.soundSpeed:null};});
   records.push({kind:'direct',sequence,phase:pose.phase,generation:pose.generation,windowMilliseconds:window.milliseconds,encodingMilliseconds:encoded.milliseconds,transferPreparationMilliseconds:prepared.milliseconds,soundMapPreparationMilliseconds:soundmap.milliseconds,packetBytes:Buffer.byteLength(JSON.stringify(encoded.value)),soundMapBytes:soundmap.value.bodyBytes.byteLength,finiteIdentity:finiteIdentity(window.value),materialIdentity:sha(window.value.materials),reflectionIds:window.value.observationModel.reflectionSurfaceIds,pathProbes,metadata:worldApi.installedStaticSceneMetadata01(window.value),status:world.status(),profile:world.profile01?.(),transferProfile:prepared.value.profile01});
  }
  world.close();world=null;closure={closed:true,persistentWorkerStarted:false};
 }else{
  const {InstalledSceneService01}=await load('src/acoustics/world/installed-scene-service01.mjs');
  service=new InstalledSceneService01({config:{manifestPath:fixture.manifestPath,catalogPath:fixture.catalogPath,expectedGameSHA256:fixture.expectedGameSHA256,privateRoot:fixtureRoot,maximumResidentResources:4},session,onScene:consumer,onStatus:s=>status.push({at:performance.now()-started,...s})});
  // Observe the existing production messages without replacing scheduling or
  // modifying packet contents; use the same timing taps for both source sets.
  const post=service.worker.postMessage.bind(service.worker);service.worker.postMessage=(message,...rest)=>{if(message.type==='window')dispatchTimes.set(message.requestId,performance.now());return post(message,...rest);};
  service.worker.prependListener('message',message=>{if(message.type==='scene')receiveTimes.set(message.requestId,performance.now());});
  assert.equal(service.bindPreparationEpoch01(responsiveEpoch01),true);
  const cadenceStart=performance.now();
  for(let sequence=0;sequence<60;sequence++){
   const due=cadenceStart+sequence*200,delay=due-performance.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
   if(service.failed)throw Error(service.failure);const pose=responsivePose01(sequence),at=performance.now();run.setWall(at);
   const frame=airflowFrameStreet01(sequence+1,sequence*.2,{speed:0,cameraGeneration:pose.generation});frame.listener.position=pose.listener;frame.vehicles[0].position=pose.sources[0];frame.listener.velocity=pose.velocity;frame.vehicles[0].velocity=pose.velocity;engine.accept(frame,0,200);
   const requested=service.updateWindow(poseRequest(pose,at));observations.push({...pose,at:at-started,dispatchLatenessMilliseconds:at-due,...requested});sample();
  }
  const waitUntil=performance.now()+2000;while((service.active||service.pending)&&!service.failed&&performance.now()<waitUntil)await new Promise(resolve=>setTimeout(resolve,20));
  records.push({kind:'final',service:service.snapshot(),geometryUpdates:engine.stats.geometryUpdates,geometryFallbacks:engine.stats.geometryFallbacks,rendererFrames:engine.pipeline.renderer.frame,latestSceneExpiry:engine.sceneExpiry,consumerDiagnostics:engine.installedSceneDiagnostics01??null});
  closure=await service.close();assert.equal(closure.closed,true);assert.equal(closure.workerJoined,true);assert.equal(closure.controlClosureUnknown,false);assert.equal(engine.pipeline.renderer.frame,0);
 }
}catch(e){error={message:e.message,stack:e.stack};}
finally{
 if(world)world.close();if(service&&!closure)closure=await service.close().catch(e=>({closed:false,error:e.message}));clearInterval(sampler);sample();await run.close();
 const pinsAfter=sourcePins(),sourceStable=sha(pinsAfter)===sha(pinsBefore);if(!sourceStable&&!error)error={message:'Measured source changed during original benchmark; comparison invalid'};
 const report={schema:1,kind:'EntirelyOriginalResponsiveSceneProfile01',sourceRoot,sourcePins:pinsBefore,sourceBundleSHA256:sha(pinsBefore),sourceStable,fixture,mode:direct?'direct':'moving-cadence',settings:{cadenceMilliseconds:200,minimumDispatchMilliseconds:500,horizonMilliseconds:1000,radius:32,maximumSurfaces:4096,maximumResidentResources:4,engine:engine.direct.config,consumerQuality:'balanced',consumerAcceleration:'cpu',consumerReflections:true,consumerLatencyProfile:'baseline'},inputSequenceSHA256:sha(observations.map(({sequence,phase,generation,listener,sources,velocity})=>({sequence,phase,generation,listener,sources,velocity}))),observations,records,status,memory,elapsedMilliseconds:performance.now()-started,cpu:process.cpuUsage(cpuAt),resourceUsage:process.resourceUsage(),closure,error,pcmRendered:false,installedDataRead:false};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output,mode:report.mode,records:records.length,accepted:records.filter(r=>r.kind==='consumer'&&r.accepted).length,maximumRss:Math.max(...memory.map(m=>m.rss)),elapsedMilliseconds:report.elapsedMilliseconds,closure,error}));if(error)process.exitCode=1;
}
