// Original diagnostic material and the production causal pipeline only.
// Returned PCM is for private analysis; public evidence contains measurements.
import assert from 'node:assert/strict';
import {acousticScene} from '../../src/acoustics/engine/contracts.mjs';
import {createTile,coordinateSpace,timeUnit} from '../../src/acoustics/research/local-geometry.mjs';
import {VehicleAcousticPipeline} from '../../src/acoustics/vehicle/pipeline.mjs';
import {vehicleDistanceSceneOptions} from '../../src/acoustics/vehicle/distance-presentation.mjs';
export const distanceProbeRate=48000,distanceProbeBlock=512;
export const distanceProbeMetres=Object.freeze([2,10,25,50,100,200]);
export const distanceProbeFrequencies=Object.freeze([100,300,1000,3000,6000,9000]);
const FS=distanceProbeRate;
export function distanceProbeScene(profile='physical-default'){
  return acousticScene(createTile({schemaVersion:1,id:'distance-fixed-direct',coordinateSpace,timeUnit,
    bounds:{min:[-2,-2,0],max:[254,2,3]},listenerAnchor:[0,0,1],coverage:'complete-synthetic',
    surfaces:[],missingRegions:[],version:1,createdAt:0,validUntil:60000,
    build:'held-distance-diagnostic',session:'distance-fixed',interior:'outdoors',dynamicEpoch:0}),{},
  {order:0,maxPaths:12,maxReflectors:1,...vehicleDistanceSceneOptions(profile)});
}
export function originalDistanceProbe(){
  const pcm=new Float32Array(Math.round(FS*2.1)),amplitudes=[.06,.04,.03,.025,.02,.015];
  const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
  for(let i=0;i<pcm.length;i++){
    const t=i/FS;
    if(t>=.1&&t<.95){const envelope=smooth((t-.1)/.02)*smooth((.95-t)/.02);
      for(let k=0;k<amplitudes.length;k++)pcm[i]+=envelope*amplitudes[k]*Math.sin(2*Math.PI*distanceProbeFrequencies[k]*t);}
    const u=t-1.1;
    if(u>=0&&u<.2)pcm[i]+=.14*Math.exp(-u/.009)*Math.sin(2*Math.PI*9000*u)+.10*Math.exp(-u/.04)*Math.sin(2*Math.PI*180*u);
  }
  return pcm;
}
export async function renderHeldDistance(pcm,{distance,profile='physical-default',masterGain=.7}={}){
  assert.ok(pcm instanceof Float32Array&&pcm.length>FS&&pcm.length<=FS*10);
  assert.ok(pcm.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
  assert.ok(distanceProbeMetres.includes(distance));
  const scene=distanceProbeScene(profile),sourceId='held-distance-source';
  const pipeline=new VehicleAcousticPipeline({scene,sourceIds:[sourceId],acceleration:'cpu',masterGain});
  const left=new Float32Array(pcm.length),right=new Float32Array(pcm.length),input=new Float32Array(512),l=new Float32Array(512),r=new Float32Array(512);
  let maximumRetardedFrameError=0,maximumRateError=0,lastPath=null;
  try{
    for(let at=0;at<pcm.length;at+=512){
      const frames=Math.min(512,pcm.length-at),time=at/FS;
      input.fill(0);input.set(pcm.subarray(at,at+frames));
      const control=await pipeline.prepare({time,session:'distance-fixed',generation:1,
        listener:{position:[0,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1]},
        sources:[{id:sourceId,generation:1,position:[distance,0,1],velocity:[0,0,0],forward:[-1,0,0],up:[0,0,1],
          directivity:.5,valid:true,emitting:true,rights:'original-diagnostic-or-private-decoded-source'}]});
      for(const path of control.paths){
        assert.equal(path.order,0);assert.ok(Math.abs(path.distance-distance)<1e-10);
        assert.ok(Math.abs(path.delay-distance/343)<1e-10);
        maximumRetardedFrameError=Math.max(maximumRetardedFrameError,Math.abs(path.emissionFrame-(time-path.delay)*FS));
        maximumRateError=Math.max(maximumRateError,Math.abs(path.rate-1));lastPath=path;
      }
      pipeline.process({[sourceId]:input},l,r,frames);
      left.set(l.subarray(0,frames),at);right.set(r.subarray(0,frames),at);
    }
    const diagnostics=pipeline.diagnostics();
    assert.ok(lastPath);assert.equal(scene.tile.surfaces.length,0);
    for(const key of ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'])assert.equal(diagnostics.renderer[key],0);
    assert.equal(diagnostics.history.affectedFrames,0);assert.ok(maximumRetardedFrameError<1);
    assert.ok(maximumRateError<1e-8);assert.ok(left.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
    assert.ok(right.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
    return {left,right,diagnostics,profile,distance,masterGain,delay:distance/343,
      propagation:{lastPathCount:1,maximumRetardedFrameError,maximumRateError,bands:[...lastPath.bands]},
      // Diagnostic compensation is analytical 1/r + master only. It is never
      // written into the audible WAV and never matches each output's loudness.
      compensated:Float64Array.from(left,(v,i)=>(v+right[i])*Math.SQRT1_2*distance/masterGain)};
  }finally{pipeline.close();}
}
export function measureOriginalDistanceProbe(render){
  const {compensated:pcm,delay}=render,start=Math.ceil((.35+delay)*FS),frames=24000;
  const amplitudes=distanceProbeFrequencies.map(frequency=>{
    let real=0,imaginary=0;
    for(let i=start;i<start+frames;i++){const angle=2*Math.PI*frequency*(i/FS-delay);real+=pcm[i]*Math.cos(angle);imaginary-=pcm[i]*Math.sin(angle);}
    return 2*Math.hypot(real,imaginary)/frames;
  });
  const highLowDb=10*Math.log10((amplitudes[4]**2+amplitudes[5]**2)/(amplitudes[0]**2+amplitudes[1]**2));
  let rawSteadyEnergy=0,rawPeak=0;
  for(let i=0;i<render.left.length;i++){
    rawPeak=Math.max(rawPeak,Math.abs(render.left[i]),Math.abs(render.right[i]));
    if(i>=start&&i<start+frames)rawSteadyEnergy+=render.left[i]**2+render.right[i]**2;
  }
  const pulseStart=Math.ceil((1.1+delay)*FS),count=Math.round(.2*FS);
  let energy=0,weighted=0,early=0,maxStep=0,peak=0;const cumulative=[];
  for(let k=0;k<count;k++){
    const value=pcm[pulseStart+k],square=value*value;energy+=square;weighted+=square*k/FS;
    if(k<FS*.005)early+=square;
    maxStep=Math.max(maxStep,Math.abs(value-pcm[pulseStart+k-1]));peak=Math.max(peak,Math.abs(value));cumulative.push(energy);
  }
  const percentile=p=>cumulative.findIndex(value=>value>=energy*p)/FS*1000;
  let first=-1;
  for(let i=pulseStart-4;i<pulseStart+16;i++)if(Math.abs(pcm[i])>1e-6){first=i;break;}
  return {profile:render.profile,distanceMetres:render.distance,
    harmonicFrequenciesHz:[...distanceProbeFrequencies],gainCompensatedHarmonicAmplitudes:amplitudes,
    highLowDb,high9000Low100Db:20*Math.log10(amplitudes[5]/amplitudes[0]),
    rawPeak,rawSteadyStereoRms:Math.sqrt(rawSteadyEnergy/(2*frames)),
    pulse:{energyCentroidMs:weighted/energy*1000,energy10to90Ms:percentile(.9)-percentile(.1),
      first5msEnergyFraction:early/energy,normalisedMaximumAdjacentStep:maxStep/Math.sqrt(energy/count),
      compensatedPeak:peak,onsetErrorFrames:first-(1.1+delay)*FS},
    propagation:render.propagation,diagnostics:{renderer:{...render.diagnostics.renderer},history:{...render.diagnostics.history},
      simulationMissingPast:render.diagnostics.simulation.missingPast}};
}
