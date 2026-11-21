// Explicitly controlled correctness boundaries, never performance measurements.
// These original observations must retain their own headers and deadlines.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export const originalPressureDatasetBundleSHA256='0bc1ba2d01302743e52018e0638dcbb50346b001b79f37c08e17c02e7b83b131';
export const coldWarmHash01=value=>createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function coldWarmFilePins01(root,predicate=()=>true){
 return fs.readdirSync(root,{recursive:true}).sort().filter(relative=>{const file=path.join(root,relative),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false,'linked test input refused');return stat.isFile()&&predicate(relative);}).map(relative=>({relative,sha256:coldWarmHash01(fs.readFileSync(path.join(root,relative)))}));
}
export async function createOriginalColdWarmContext01({sourceRoot,controlRoot,fixtureRoot,now=()=>performance.now()}={}){
 sourceRoot=path.resolve(sourceRoot);controlRoot=path.resolve(controlRoot);fixtureRoot=path.resolve(fixtureRoot);
 const fixture=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'fixture.json')));
 assert.equal(fixture.kind,'EntirelyOriginalCachePressure01');assert.equal(fixture.generatedFromInstalledData,false);assert.equal(fixture.historicalGeometryRead,false);assert.equal(fixture.root,fixtureRoot);
 for(const file of [fixture.manifestPath,fixture.catalogPath])assert(path.resolve(file).startsWith(fixtureRoot+path.sep));
 const dataPins=coldWarmFilePins01(fixtureRoot);assert.equal(coldWarmHash01(dataPins),originalPressureDatasetBundleSHA256,'exact retained original-v3 data required');
 const sourcePins=coldWarmFilePins01(path.join(sourceRoot,'src'),name=>name.endsWith('.mjs')),controlSourcePins=coldWarmFilePins01(path.join(controlRoot,'src'),name=>name.endsWith('.mjs'));
 const helperPaths=['tests/fixtures/AcousticBudget042.mjs','tests/fixtures/AirflowStreet01.mjs','tests/fixtures/Processing09.mjs','tests/fixtures/Processing10.mjs'],controlHelperPins=helperPaths.map(relative=>({relative,sha256:coldWarmHash01(fs.readFileSync(path.join(controlRoot,relative)))}));
 const load=relative=>import(pathToFileURL(path.join(sourceRoot,relative))),loadControl=relative=>import(pathToFileURL(path.join(controlRoot,relative)));
 const [{StockGameplay},{InstalledSceneService01},world,{airflowFrameStreet01},{budgetSession042:session}]=await Promise.all([load('src/acoustics/vehicle/gameplay.mjs'),load('src/acoustics/world/installed-scene-service01.mjs'),load('src/acoustics/world/installed-static-scene01.mjs'),loadControl('tests/fixtures/AirflowStreet01.mjs'),loadControl('tests/fixtures/AcousticBudget042.mjs')]);
 const audioActivity={bankResolutions:0,sourceCreations:0,renderCalls:0,pipelineProcessCalls:0,rendererProcessCalls:0},engine=new StockGameplay({registry:{resolve(){audioActivity.bankResolutions++;throw Error('No waveform banks in cold/warm control');},createSource(){audioActivity.sourceCreations++;throw Error('No PCM sources in cold/warm control');}},session,now,continuityPolicy:'camera-source-01'});
 engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive',airflowEnabled:false,airflowLevel:.35});
 engine.render=()=>{audioActivity.renderCalls++;throw Error('No rendering in cold/warm control');};engine.pipeline.process=()=>{audioActivity.pipelineProcessCalls++;throw Error('No PCM pipeline processing in cold/warm control');};engine.pipeline.renderer.process=()=>{audioActivity.rendererProcessCalls++;throw Error('No PCM renderer processing in cold/warm control');};
 const applyObservation=pose=>{const frame=airflowFrameStreet01(pose.sequence+1,pose.sequence*.2,{speed:0,cameraGeneration:pose.generation});frame.listener.position=pose.listener;frame.listener.velocity=pose.velocity;frame.vehicles[0].position=pose.sources[0];frame.vehicles[0].velocity=pose.velocity;const before=engine.stats.acceptedFrames;engine.accept(frame,0,200);assert.equal(engine.stats.acceptedFrames,before+1);return frame;};
 const bindings={sourceRoot,sourcePins,sourceBundleSHA256:coldWarmHash01(sourcePins),controlRoot,controlSourcePins,controlSourceBundleSHA256:coldWarmHash01(controlSourcePins),controlHelperPins,controlHelperBundleSHA256:coldWarmHash01(controlHelperPins),fixtureRoot,dataPins,dataBundleSHA256:coldWarmHash01(dataPins)};
 return {fixture,sourceRoot,controlRoot,fixtureRoot,session,engine,InstalledSceneService01,world,audioActivity,bindings,applyObservation,request:(pose,at,{prepareSoundMapGeometry01=false}={})=>({...pose,session,geometryTimeMs:at,durationMs:1000,radius:32,maximumSurfaces:4096,adaptiveRadius:true,engine:engine.direct.config,prepareSoundMapGeometry01}),
  verify(){const currentSource=coldWarmFilePins01(path.join(sourceRoot,'src'),name=>name.endsWith('.mjs')),currentControl=coldWarmFilePins01(path.join(controlRoot,'src'),name=>name.endsWith('.mjs')),currentData=coldWarmFilePins01(fixtureRoot),currentHelpers=helperPaths.map(relative=>({relative,sha256:coldWarmHash01(fs.readFileSync(path.join(controlRoot,relative)))}));return {sourceStable:coldWarmHash01(currentSource)===bindings.sourceBundleSHA256,controlSourceStable:coldWarmHash01(currentControl)===bindings.controlSourceBundleSHA256,controlHelpersStable:coldWarmHash01(currentHelpers)===bindings.controlHelperBundleSHA256,dataStable:coldWarmHash01(currentData)===bindings.dataBundleSHA256};},
  assertNoAudio(){assert(Object.values(audioActivity).every(v=>v===0));assert.equal(engine.pipeline.renderer.frame,0);},
 };
}

export const coldWarmBoundaryCase01=Object.freeze({
 horizonMilliseconds:1000,
 observationCadenceMilliseconds:200,
 baselineMinimumDispatchMilliseconds:500,
 nearExpiryRemainingMilliseconds:2.2028,
 retainedColdWorkerMilliseconds:944.7195,
 retainedWarmWorkerMilliseconds:[205.0456,203.2946],
 retainedMaximumGapMilliseconds:361.7563,
});

export function createControlledMonotonicClock01(initial){
 if(!Number.isFinite(initial)||initial<0)throw Error('Nonnegative controlled clock origin required');
 let current=initial;const events=[];
 return Object.freeze({
  kind:'controlled-monotonic-correctness-clock',
  now:()=>current,
  advanceTo(at,reason){
   if(!Number.isFinite(at)||at<current||typeof reason!=='string'||!reason.length)throw Error('Controlled clock cannot move backwards or advance without a reason');
   events.push(Object.freeze({from:current,to:at,reason}));current=at;return current;
  },
  snapshot:()=>({kind:'controlled-monotonic-correctness-clock',performanceEvidence:false,current,events:events.map(e=>({...e}))}),
 });
}

export function recordReplacement01(previous,application){
 if(!Number.isFinite(application.completedAt)||!Number.isFinite(application.expiresAt)||application.completedAt>=application.expiresAt)throw Error('Application must precede its own unchanged deadline');
 const sameGeneration=previous?.generation===application.generation;
 return {
  requestId:application.requestId,
  generation:application.generation,
  requestedAt:application.requestedAt,
  applicationAt:application.completedAt,
  expiresAt:application.expiresAt,
  originalRequestAgeMilliseconds:application.completedAt-application.requestedAt,
  remainingMilliseconds:application.expiresAt-application.completedAt,
  previousExpiryAt:previous?.expiresAt??null,
  sameGeneration:!!sameGeneration,
  overlapMilliseconds:previous&&sameGeneration?previous.expiresAt-application.completedAt:null,
  gapMilliseconds:previous&&sameGeneration?Math.max(0,application.completedAt-previous.expiresAt):0,
 };
}

export function coldWarmObservedPose01(sequence){
 // Identical arithmetic route to CachePressure01; this helper has no asset or
 // production-module imports. The benchmark verifies its complete trace hash.
 const phase=sequence<25?'stable-pressure':sequence<50?'smooth-pressure':sequence<70?'neighbor-crossing':sequence<85?'neighbor-generation':sequence<100?'return-generation':'long-return-pressure';
 const generation=sequence<70?1:sequence<85?2:3;
 const x=sequence<25?0:sequence<50?(sequence-25)*.015:sequence<70?.375+(sequence-50)*2.1:sequence<85?42.375+(sequence-70)*.015:sequence<100?(sequence-85)*.015:.225+(sequence-100)*.005;
 return {sequence,phase,generation,listener:[x,-3,1.6],sources:[[x+1,-3,1.3]],velocity:[sequence>=50&&sequence<70?10.5:sequence<25?0:sequence<100?.075:.025,0,0]};
}

export const coldWarmNaturalPlan01=Object.freeze({
 originalObservations:220,insertedDenseObservations:80,observations:300,
 cadenceMilliseconds:200,durationMilliseconds:60000,
 firstActivationBoundMilliseconds:5000,denseActivationBoundMilliseconds:8000,
 minimumDenseReplacements:10,minimumCoveredReplacements:10,
 denseStartObservation:70,denseEndObservationExclusive:165,
 initialRegionEndObservationExclusive:50,
});
export function coldWarmNaturalPose01(sequence){
 if(!Number.isInteger(sequence)||sequence<0||sequence>=coldWarmNaturalPlan01.observations)throw Error('Bounded predeclared natural observation required');
 if(sequence<85)return {...coldWarmObservedPose01(sequence),originalSequence:sequence,insertedDense:false};
 if(sequence<165){const dense=sequence-85,x=42.6+dense*.015;return {sequence,originalSequence:null,insertedDense:true,phase:'dense-sustain',generation:2,listener:[x,-3,1.6],sources:[[x+1,-3,1.3]],velocity:[.075,0,0]};}
 const originalSequence=sequence-80;return {...coldWarmObservedPose01(originalSequence),sequence,originalSequence,insertedDense:false};
}
