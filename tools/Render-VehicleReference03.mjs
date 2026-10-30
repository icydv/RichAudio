// Existing original synthesis + causal engine only; no endpoint or playback.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {vehicleProfiles} from '../src/acoustics/vehicle/profiles.mjs';
import {VehicleSynthesizer,createVehicleBuffers} from '../src/acoustics/vehicle/synthesizer.mjs';
import {componentEmitters,vehicleComponents} from '../src/acoustics/vehicle/state-adapter.mjs';
import {VehicleAcousticPipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {flyby,motionAt,operatingAt,directScenes} from './vehicle-reference-03-scenario.mjs';

const FS=48000,BLOCK=512,root=fileURLToPath(new URL('..',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function renderFlyby(kind){
  const profile=vehicleProfiles.hypercarV12,synth=new VehicleSynthesizer(profile,{seed:flyby.seed}),scenes=directScenes();
  const ids=vehicleComponents.map(n=>'vehicle:1:'+n),pipeline=new VehicleAcousticPipeline({scene:scenes[0],sourceIds:ids,quality:'quality',acceleration:'cpu',masterGain:flyby.masterGain});
  const total=Math.round(flyby.duration*FS),left=new Float32Array(total),right=new Float32Array(total),dry=new Float32Array(total);
  const buffers=createVehicleBuffers(BLOCK),remainder=createVehicleBuffers(total%BLOCK),l=new Float32Array(BLOCK),r=new Float32Array(BLOCK);
  const motionHash=createHash('sha256'),pathHash=createHash('sha256'),rows=[],firing=[],layerEnergy=Object.fromEntries(vehicleComponents.map(n=>[n,0]));
  const layerHashes=Object.fromEntries(vehicleComponents.map(n=>[n,createHash('sha256')]));
  let switched=false,lastPaths=[],phaseError=0,maximumSampleStep=0,previousSample=0;
  try{
    for(let at=0;at<total;at+=BLOCK){
      const t=at/FS,n=Math.min(BLOCK,total-at),pose=motionAt(t),controls=operatingAt(kind,t);
      if(!switched&&t>=flyby.passTime){pipeline.replaceScene(scenes[1]);switched=true;}
      const emitters=componentEmitters({id:'vehicle:1',generation:1,...pose,valid:true,controls},profile.components);
      motionHash.update(JSON.stringify([t,pose]));
      const previousPhase=synth.rotationPhase,beforeRpm=synth.rpm;
      const generated=synth.renderInto(controls,n===BLOCK?buffers:remainder);
      // A phase reset would leave a whole-block advance outside the range
      // allowed by the monotonic first-order RPM response within this block.
      let advance=(synth.rotationPhase-previousPhase+1)%1;
      const low=Math.min(beforeRpm,synth.rpm)/60/(4*FS)*n,high=Math.max(beforeRpm,synth.rpm)/60/(4*FS)*n;
      phaseError=Math.max(phaseError,low-advance,advance-high,0);
      firing.push([at,beforeRpm/10,synth.rpm/10]);
      const inputs=Object.fromEntries(vehicleComponents.map(name=>{
        const a=generated.layers[name];for(let i=0;i<n;i++)layerEnergy[name]+=a[i]*a[i];
        layerHashes[name].update(Buffer.from(a.buffer,a.byteOffset,n*4));return ['vehicle:1:'+name,a];}));
      for(let i=0;i<n;i++){maximumSampleStep=Math.max(maximumSampleStep,Math.abs(generated.mixed[i]-previousSample));previousSample=generated.mixed[i];}
      const control=await pipeline.prepare({time:t,session:'vehicle-reference03',generation:1,listener:flyby.listener,sources:emitters});
      pathHash.update(JSON.stringify([control.frame,control.paths,control.sourceGenerations]));lastPaths=control.paths;
      for(const p of lastPaths){
        assert.equal(p.order,0);assert.ok(Math.abs(p.delay-p.distance/343)<1e-8);
        assert.ok(Math.abs(p.emissionFrame-(t-p.delay)*FS)<1,'retarded time and emission frame agree');
      }
      pipeline.process(inputs,l,r,n);left.set(l.subarray(0,n),at);right.set(r.subarray(0,n),at);dry.set(generated.mixed,at);
      const exhaust=lastPaths.find(p=>p.sourceId==='vehicle:1:exhaust');
      let receivedFiringHz=null;
      if(exhaust){const f=exhaust.emissionFrame,index=Math.max(0,Math.min(firing.length-1,Math.floor(f/BLOCK))),row=firing[index];
        const blend=Math.max(0,Math.min(1,(f-row[0])/BLOCK));receivedFiringHz=(row[1]+(row[2]-row[1])*blend)*exhaust.rate;}
      rows.push({time:t,x:pose.position[0],speed:pose.speed,acceleration:pose.acceleration,targetRpm:controls.estimatedRpm,
        rpm:synth.rpm,load:controls.load,throttle:controls.throttle,gear:controls.gear,sourceFiringHz:synth.rpm/10,
        receivedFiringHz,rate:exhaust?.rate??null,delay:exhaust?.delay??null,pathCount:lastPaths.length});
    }
    const diagnostics=pipeline.diagnostics(),metrics=audioMetrics([left,right]);
    assert.equal(lastPaths.length,8,'no artificial scene-edge cutoff in recession');
    assert.equal(diagnostics.simulation.resets,1);assert.equal(diagnostics.simulation.sceneReplacements,1);
    for(const k of ['limited','missingHistory','cursorResets'])assert.equal(diagnostics.renderer[k],0,k);
    assert.equal(diagnostics.history.affectedFrames,0);assert.equal(metrics.nonfiniteSamples,0);assert.equal(metrics.clippedSamples,0);
    assert.ok(phaseError<1e-10);assert.equal(synth.stats.pops,0);assert.equal(synth.stats.limitedFrames,0);
    return {left,right,report:{kind,duration:flyby.duration,sampleRate:FS,masterGain:flyby.masterGain,
      seed:flyby.seed,normalised:false,metrics,layerEnergy,maximumSampleStep,phaseAdvanceError:phaseError,
      componentHashes:Object.fromEntries(vehicleComponents.map(n=>[n,layerHashes[n].digest('hex')])),
      synth:{...synth.stats},diagnostics,motionHash:motionHash.digest('hex'),pathHash:pathHash.digest('hex'),rows}};
  }finally{pipeline.close();}
}
export async function renderComparison(output){
  const out=privateStoragePath(root,output);if(fs.existsSync(out))throw Error('Fresh comparison directory required');fs.mkdirSync(out,{recursive:true});
  const results=[];
  for(const kind of ['constant','dynamic']){
    const result=await renderFlyby(kind),wav=encodeVehicleWav([result.left,result.right]);
    fs.writeFileSync(path.join(out,kind+'.wav'),wav);result.report.wavSha256=sha(wav);results.push(result.report);
  }
  assert.equal(results[0].motionHash,results[1].motionHash);assert.equal(results[0].pathHash,results[1].pathHash);
  for(const n of ['tyres','aero'])assert.equal(results[0].componentHashes[n],results[1].componentHashes[n],n+' depends on shared motion, not engine RPM');
  const report={schemaVersion:1,baseCommit:'94bfed6',scenario:flyby,
    scope:'Authored direct-only accelerating/shift/lift-plus-braking comparison; no measured car calibration or subjective listening',
    constantBaseline:'Original 7644 RPM/.82 load/.9 throttle/gear4 operating controls on the NEW common trajectory; counterfactual diagnostic, not rigid drivetrain coupling',
    identicalMotionAndPropagation:true,engineFilesChanged:false,reports:results};
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,'listen.html'),`<!doctype html><meta charset="utf-8"><title>RichAudio hypercar flyby</title><h1>V12 flyby: same motion, different driving</h1><p>10.2 seconds, common gain 0.7. No normalisation. Start at a comfortable player level. No autoplay. Human listening remains pending.</p><h2>Constant RPM</h2><audio controls preload="none" src="constant.wav"></audio><h2>Accelerate / upshift / lift and brake</h2><audio controls preload="none" src="dynamic.wav"></audio><p><a href="spectrogram.png">Matched-scale spectrogram</a> · <a href="measurements.json">Measured controls and propagation</a></p>`);
  console.log(JSON.stringify(results.map(({kind,metrics,phaseAdvanceError,synth})=>({kind,metrics,phaseAdvanceError,synth})),null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await renderComparison(process.argv[2]??'.local/vehicle-reference-03');
